import { Router } from "express";
import { protectOrganizationAdmin } from "../organization-admin-policy.js";
import { z } from "zod";
import { authenticatedUser,verifyPassword } from "../auth.js";
import { can,isMainManager,isWithinScope,ownRecordsRequired } from "../permissions.js";
import { getCollection,getStore,nextCollectionId,saveStore,transaction } from "../storage.js";
import { audit } from "../workspace.js";
import { administrationPolicy,moduleActions } from "../admin-policy.js";
import { emailConfiguration,onboardingStatus,queueOnboarding } from "../onboarding.js";
import { blockedFor,recordFailure,clearFailures } from "../rate-limit.js";
type Row=Record<string,unknown>&{id:string};const rows=(name:string)=>getCollection(name) as Row[];
const router=Router();
router.post("/employees/:id/email",(req,res)=>{
 if(!can(req.auth,"hr","edit")||ownRecordsRequired(req.auth!))return res.status(403).json({error:"You do not have permission to send employee invitations."});
 const employee=rows("employees").find(row=>row.id===req.params.id&&isWithinScope(req.auth!,row));if(!employee)return res.status(404).json({error:"Employee not found."});
 const key="onboarding-resend:"+employee.id;if(blockedFor(key))return res.status(429).json({error:"Too many attempts. Try again later."});recordFailure(key);
 try{transaction(()=>{
  const status=onboardingStatus(employee.id),existing=rows("onboardingEmails").find(row=>row.id===status.id);
  if(status.status!=="expired"&&existing?.encryptedPayload&&["pending","failed"].includes(String(existing.status))&&Date.parse(String(existing.expiresAt))>Date.now()&&Date.now()-Date.parse(String(existing.createdAt))<23*3600000){existing.status="pending";existing.attempts=0;existing.nextAttemptAt=new Date().toISOString();saveStore(getStore());}
  else {const job=queueOnboarding(req.auth!,employee);if(!job)throw new Error("Only an invited employee account can receive an activation invitation.");}
 });return res.json({delivery:onboardingStatus(employee.id)});}catch(error){return res.status(400).json({error:(error as Error).message});}
});
router.use((req,res,next)=>isMainManager(req.auth)?next():res.status(403).json({error:"Only the Main Admin can manage system administration."}));
router.get("/",(_req,res)=>res.json({policy:administrationPolicy(),email:emailConfiguration(),modules:moduleActions,roles:rows("accessRoles").map(role=>({...role,userCount:rows("accessUsers").filter(user=>user.roleId===role.id).length})),users:rows("accessUsers").map(user=>({id:user.id,name:user.name,roleId:user.roleId,status:user.status})),companies:rows("companies").map(row=>({id:row.id,name:row.name})),departments:rows("departments").map(row=>({id:row.id,name:row.name,kind:row.kind,organizationId:row.organizationId,parentDepartmentId:row.parentDepartmentId})),locations:getStore().stores.map(row=>({id:row.id,name:row.name,companyId:row.companyId}))}));
router.use(async(req,res,next)=>{
 const key="administration-confirm:"+req.auth!.id;if(blockedFor(key))return res.status(429).json({error:"Too many attempts. Try again later."});
 const account=rows("accessUsers").find(row=>row.id===req.auth!.id),password=typeof req.body?.currentPassword==="string"?req.body.currentPassword:"";
 if(!account||password.length>256||!await verifyPassword(password,String(account.passwordHash))){recordFailure(key);return res.status(403).json({error:"Confirm your current password to change system settings."});}
 clearFailures(key);req.auth=authenticatedUser(req);if(!isMainManager(req.auth))return res.status(403).json({error:"Your account access changed. Sign in again."});next();
});
const policySchema=z.object({automaticAccounts:z.boolean(),automaticEmail:z.boolean(),defaultRoleId:z.string(),invitationHours:z.number().int().min(1).max(168),emailLanguage:z.enum(["en","ar"]),supportEmail:z.string().email().or(z.literal("")),mainSelfApproval:z.boolean(),separateApproverSections:z.array(z.enum(["organizations","locations","hr","operations","inventory","finance","payroll","customerService","access"])).refine(value=>["finance","payroll","inventory"].every(section=>(value as string[]).includes(section))),currentPassword:z.string()}).strict();
router.put("/policy",(req,res)=>{
 const parsed=policySchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Review the onboarding and approval policy fields."});
 const {currentPassword:_,...input}=parsed.data,role=rows("accessRoles").find(role=>role.id===input.defaultRoleId);
 if(!role||role.id!=="role-employee"&&role.isSystem===true||["role-main-manager","role-organization-admin","role-company-manager"].includes(input.defaultRoleId)||role.status==="inactive"||Array.isArray(role.permissions)&&role.permissions.some(p=>/^(access|audit|approvals|payroll|finance)\./.test(String(p))||p==="*"))return res.status(400).json({error:"Choose a restricted active employee role for onboarding."});
 transaction(()=>{const before=administrationPolicy(),item={...input,id:"administration-policy",updatedAt:new Date().toISOString(),updatedBy:req.auth!.id};getStore().collections.workspaceSettings=[...rows("workspaceSettings").filter(row=>row.id!==item.id),item];saveStore(getStore());audit(req.auth,"administration.policy-updated",{targetId:item.id,before,after:input,outcome:"success"});});res.json({policy:administrationPolicy()});
});
const roleSchema=z.object({name:z.string().trim().min(2).max(100),description:z.string().trim().max(1000).default(""),permissions:z.array(z.string()).max(150),status:z.enum(["active","inactive"]).default("active"),ownRecordsOnly:z.boolean().default(false),organizationIds:z.array(z.string()).max(200).default([]),locationIds:z.array(z.string()).max(200).default([]),departmentIds:z.array(z.string()).max(200).default([]),sectionIds:z.array(z.string()).max(200).default([]),scope:z.enum(["company","own","department","section"]).default("company"),assignedUserIds:z.array(z.string()).max(1000).optional(),currentPassword:z.string()}).strict();
for(const edit of [false,true])router[edit?"patch":"post"](`/roles${edit?"/:id":""}`,(req,res)=>{
 const parsed=roleSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Enter a role name, valid permissions and data scope."});
 const current=edit?rows("accessRoles").find(row=>row.id===(req.params as Record<string,string>).id):undefined;if(edit&&!current)return res.status(404).json({error:"Role not found."});
 if(current?.id==="role-main-manager")return res.status(403).json({error:"The Main Administrator system role is protected."});
 const {currentPassword:_,assignedUserIds,...input}=parsed.data;
 if(["main administrator","main admin","main manager","super admin","super administrator","superadmin","root"].includes(input.name.toLowerCase()))return res.status(400).json({error:"This role name is reserved for the protected Main Administrator."});
 const grants=Object.entries(moduleActions).flatMap(([section,actions])=>actions.map(action=>`${section}.${action}`));
 const delegated=["role-organization-admin","role-company-manager"].includes(current?.id||"");
 if(Object.entries(moduleActions).some(([section])=>input.permissions.some(p=>p.startsWith(section+".")&&p!==section+".view")&&!input.permissions.includes(section+".view")))return res.status(400).json({error:"Grant view access before write actions."});
 if(input.permissions.some(p=>!grants.includes(p)||!delegated&&/^(access|audit)\./.test(p)))return res.status(400).json({error:"Use the supported permissions. System privileges cannot be granted to custom roles."});
 if(current?.isSystem&&input.status==="inactive")return res.status(400).json({error:"System roles cannot be deactivated."});
 if(rows("accessRoles").some(role=>role.id!==current?.id&&String(role.name).toLowerCase()===input.name.toLowerCase()))return res.status(409).json({error:"A role with this name already exists."});
 if(input.organizationIds.some(id=>!rows("companies").some(row=>row.id===id))||input.locationIds.some(id=>!getStore().stores.some(row=>row.id===id))||input.departmentIds.some(id=>!rows("departments").some(row=>row.id===id&&row.kind!=="section"))||input.sectionIds.some(id=>!rows("departments").some(row=>row.id===id&&row.kind==="section"))||input.scope==="department"&&!input.departmentIds.length||input.scope==="section"&&!input.sectionIds.length)return res.status(400).json({error:"Choose valid companies and organizational units for the role scope."});
 if(assignedUserIds?.some(id=>!rows("accessUsers").some(row=>row.id===id&&row.roleId!=="role-main-manager")))return res.status(400).json({error:"Main Administrator accounts cannot be reassigned through role editing."});
 if(current?.id===administrationPolicy().defaultRoleId&&input.status==="inactive")return res.status(400).json({error:"Choose another onboarding role before deactivating this role."});
 try { for(const account of rows("accessUsers").filter(row=>assignedUserIds?.includes(row.id)))protectOrganizationAdmin(account,{...account,roleId:current?.id||"new-custom-role"}); } catch(error) { return res.status((error as {statusCode?:number}).statusCode||400).json({error:(error as Error).message}); }
 const role=transaction(()=>{const item={...current,...input,ownRecordsOnly:input.scope==="own"||input.ownRecordsOnly,id:current?.id||nextCollectionId("accessRoles"),isSystem:current?.isSystem===true,updatedAt:new Date().toISOString(),updatedBy:req.auth!.id};getStore().collections.accessRoles=current?rows("accessRoles").map(row=>row.id===item.id?item:row):[...rows("accessRoles"),item];
  const affected=new Set(rows("accessUsers").filter(row=>row.roleId===item.id||assignedUserIds?.includes(row.id)).map(row=>row.id));
  if(assignedUserIds)for(const account of rows("accessUsers").filter(row=>assignedUserIds.includes(row.id))){protectOrganizationAdmin(account,{...account,roleId:item.id});account.roleId=item.id;delete account.permissions;}
  getStore().collections.sessions=rows("sessions").filter(row=>!affected.has(String(row.accountId)));saveStore(getStore());audit(req.auth,current?"access.role-updated":"access.role-created",{targetId:item.id,before:current?{permissions:current.permissions,scope:current.scope,status:current.status}:undefined,after:input,affectedUsers:affected.size,outcome:"success"});return item;});res.status(edit?200:201).json({item:role});
});
export default router;
