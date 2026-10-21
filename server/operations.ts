import { createHash } from "node:crypto";
import { z } from "zod";
import type { AuthenticatedUser } from "./auth.js";
import { can, isWithinScope, ownRecordsRequired } from "./permissions.js";
import { getCollection, getStore, nextCollectionId, saveStore, transaction } from "./storage.js";
import { createNotification } from "./notifications.js";
import { attendanceDate, settingsFor } from "./attendance.js";

export type TaskRow=Record<string,any>;
export const taskRows=(name:string)=>getCollection(name) as TaskRow[];
export function taskError(message:string,statusCode=400):never{throw Object.assign(new Error(message),{statusCode});}
export const participantStates=["To Do","In Progress","Blocked","Completed"] as const;
const date=z.string().date();
export const taskInput=z.object({
 title:z.string().trim().min(1).max(180),description:z.string().trim().max(8000).default(""),organizationId:z.string().min(1),
 assignmentMode:z.enum(["company","team","individual","multiple"]),departmentId:z.string().max(160).default(""),assigneeIds:z.array(z.string().min(1)).max(2000).default([]),
 priority:z.enum(["Low","Medium","High","Urgent"]).default("Medium"),startDate:date.or(z.literal("")).default(""),dueDate:date.or(z.literal("")).default(""),
 checklist:z.array(z.object({id:z.string().min(1).max(100),text:z.string().trim().min(1).max(300)}).strict()).max(100).default([]),reviewRequired:z.boolean().default(false),
 clientRequestId:z.string().min(8).max(160),
}).strict();
export function assignedTask(user:AuthenticatedUser,task:TaskRow){return Boolean(user.employeeId)&&[task.assigneeId,...(task.assigneeIds||[])].includes(user.employeeId);}
export function canCreateTask(user:AuthenticatedUser){return can(user,"operations","create")&&(!ownRecordsRequired(user)||Boolean(user.employeeId));}
export function canReviewTask(user:AuthenticatedUser,task:TaskRow){return can(user,"operations","approve")&&!ownRecordsRequired(user)&&isWithinScope(user,task)&&(task.assigneeIds||[]).every((id:string)=>{const e=taskRows("employees").find(e=>e.id===id);return e&&isWithinScope(user,e);});}
export function canManageTask(user:AuthenticatedUser,task?:TaskRow){
 const personal=Boolean(task&&task.createdBy===user.id&&user.employeeId&&task.assigneeIds?.length===1&&task.assigneeIds[0]===user.employeeId);
 return can(user,"operations","edit")&&(!ownRecordsRequired(user)||personal)&&(!task||isWithinScope(user,task)&&(task.assigneeIds||[]).every((id:string)=>{const e=taskRows("employees").find(e=>e.id===id);return e&&isWithinScope(user,e);}));
}
export function accessibleTask(user:AuthenticatedUser,id:string){const task=taskRows("workItems").find(t=>t.id===id);if(!task||!can(user,"operations","view")||!isWithinScope(user,task))taskError("Work item not found.",404);return task;}
const active=(e:TaskRow)=>!["inactive","terminated","suspended"].includes(String(e.status));
const now=()=>new Date().toISOString();
export function taskToday(task:TaskRow,instant=new Date()){return attendanceDate(instant,settingsFor(String(task.organizationId||"")).timezone);}
export function taskOverdue(task:TaskRow,instant=new Date()){return Boolean(task.dueDate)&&task.dueDate<taskToday(task,instant)&&!["Completed","Cancelled"].includes(task.status);}
const teamMember=(e:TaskRow,team:TaskRow)=>e.departmentId===team.id||e.sectionId===team.id||(!e.departmentId&&e.department===team.name&&taskRows("departments").filter(d=>d.organizationId===team.organizationId&&d.name===team.name).length===1);
function recipients(user:AuthenticatedUser,input:TaskRow){
 const company=taskRows("companies").find(c=>c.id===input.organizationId&&c.status!=="inactive"&&isWithinScope(user,{...c,organizationId:c.id}));
 if(!company||company.parentOrganizationId&&!taskRows("organizations").some(o=>o.id===company.parentOrganizationId&&o.status==="active"))taskError("Choose an accessible active company.");
 const team=input.departmentId&&taskRows("departments").find(d=>d.id===input.departmentId&&d.organizationId===company.id&&d.status!=="inactive");
 if(input.departmentId&&!team)taskError("Choose a team from this company.");
 let employees=taskRows("employees").filter(e=>e.organizationId===company.id&&active(e));
 if(input.assignmentMode==="team"){if(!team)taskError("Choose a team from this company.");employees=employees.filter(e=>teamMember(e,team));}
 if(["individual","multiple"].includes(input.assignmentMode)){
   if(!Array.isArray(input.assigneeIds)||!input.assigneeIds.length||new Set(input.assigneeIds).size!==input.assigneeIds.length||input.assignmentMode==="individual"&&input.assigneeIds.length!==1)taskError("Choose each responsible employee once.");
   employees=input.assigneeIds.map((id:string)=>{const employee=employees.find(e=>e.id===id);if(!employee)taskError("Choose active recipients within your management scope.");return employee;});
 }
 if(!employees.length||employees.length>2000||employees.some(e=>!e||!isWithinScope(user,e)))taskError("Choose active recipients within your management scope.");
 if(team&&employees.some(e=>!teamMember(e,team)))taskError("Assigned employees must belong to the selected team.");
 return employees;
}
function putTask(task:TaskRow){const data=getStore();data.collections.workItems=[...taskRows("workItems").filter(t=>t.id!==task.id),task];saveStore(data);return task;}
function aggregate(task:TaskRow){
 const assignments=task.assignments||[];if(!assignments.length)return task;
 const progress=Math.round(assignments.reduce((n:number,a:TaskRow)=>n+a.progress,0)/assignments.length);
 const all=assignments.every((a:TaskRow)=>a.status==="Completed");
 return {...task,progress,status:task.status==="Cancelled"?"Cancelled":all?task.reviewRequired&&task.reviewState!=="approved"?"Awaiting Approval":"Completed":assignments.some((a:TaskRow)=>a.status==="Blocked")?"Blocked":assignments.some((a:TaskRow)=>a.status!=="To Do"||a.progress>0)?"In Progress":"Pending"};
}
/** Applied on all legacy mutation/approval paths too. Protected internals cannot be supplied by clients. */
export function prepareTaskMutation(user:AuthenticatedUser,action:string,payload:TaskRow,current?:TaskRow):TaskRow{
 const personalLegacy=ownRecordsRequired(user)&&current?.taskVersion!==2&&(!current||current.createdBy===user.id);
 if(personalLegacy){
   if(action==="delete")taskError("Cancel this task to preserve its history.",409);
   const disallowed=["assignments","taskVersion","reviewState","version","clientRequestId","requestFingerprint","smartTaskInput","smartTaskManagement","organizationId","locationId","departmentId","assignmentMode"];
   if(disallowed.some(k=>Object.hasOwn(payload,k)&&current&&payload[k]!==current[k])||payload.assigneeId&&payload.assigneeId!==user.employeeId||payload.assigneeIds&&(!Array.isArray(payload.assigneeIds)||payload.assigneeIds.some((id:string)=>id!==user.employeeId))||payload.assignee&&payload.assignee!==user.name&&payload.assignee!==user.email)taskError("Personal tasks can only be assigned to yourself.",403);
   for(const k of ["assignments","taskVersion","reviewState","version","clientRequestId","requestFingerprint","smartTaskInput","smartTaskManagement"])if(Object.hasOwn(payload,k))taskError("Use the secure task workflow for assignment and review changes.");
   return {...payload,...(user.employeeId?{assigneeId:user.employeeId}:{}),assignee:user.name};
 }
 if(action==="create"?ownRecordsRequired(user)||!can(user,"operations","create")&&!can(user,"operations","approve"):!canManageTask(user,current))taskError("Only authorized managers can change task assignments or task details.",403);
 if(action==="delete"&&current&&(current.taskVersion===2||taskRows("workActivity").some(e=>e.workItemId===current.id)||taskRows("workFiles").some(f=>f.workItemId===current.id)))taskError("Cancel this task to preserve its history.",409);
 if(action==="delete")return payload;
 for(const key of ["assignments","taskVersion","reviewState","version","clientRequestId","requestFingerprint","smartTaskInput","smartTaskManagement"])if(Object.hasOwn(payload,key))taskError("Use the secure task workflow for assignment and review changes.");
 if(current?.taskVersion===2){
   if(["organizationId","companyId","assignmentMode","assigneeId","assigneeIds","departmentId","checklist","reviewRequired","locationId"].some(k=>Object.hasOwn(payload,k)&&JSON.stringify(payload[k])!==JSON.stringify(current[k])))taskError("Use the task assignment editor to change responsible employees or checklist.");
   if(Object.hasOwn(payload,"progress")||Object.hasOwn(payload,"status"))taskError("Update individual contributions or use task management actions.");
 }
 if(payload.assigneeIds){const ids=payload.assigneeIds;if(!Array.isArray(ids)||ids.some(id=>!taskRows("employees").some(e=>e.id===id&&e.organizationId===(payload.organizationId||current?.organizationId)&&isWithinScope(user,e))))taskError("Choose active recipients within your management scope.");}
 return payload;
}
function accountsFor(task:TaskRow){return taskRows("accessUsers").filter(a=>a.status==="active"&&([task.assigneeId,...(task.assigneeIds||[])].includes(a.employeeId)||a.id===task.createdBy));}
function notifyTask(task:TaskRow,eventId:string,message:string,actorId?:string,targetIds?:string[]){
 const users=accountsFor(task).filter(a=>a.id!==actorId&&(!targetIds||targetIds.includes(a.id)));
 for(const a of users){
   const key=`task:${task.id}:${eventId}:${a.id}`;
   if(taskRows("taskNotificationEvents").some(e=>e.id===key))continue;
   // Match current permissions and scope at dispatch time; stale assignments do not grant access.
   const role=taskRows("accessRoles").find(r=>r.id===a.roleId),permissions=Array.isArray(a.permissions)?a.permissions:role?.permissions||[];
   if(a.roleId!=="role-main-manager"&&!permissions.some((p:string)=>["*","operations.*","operations.view"].includes(p)))continue;
   const user={...a,id:a.id,name:a.name,organizationIds:a.organizationIds||[],locationIds:a.locationIds||[],ownRecordsOnly:a.ownRecordsOnly??role?.ownRecordsOnly??false} as AuthenticatedUser;
   if(!isWithinScope(user,task))continue;
   createNotification({userId:a.id,user:a.name,type:"message",severity:taskOverdue(task)?"warning":"info",message,messageKey:message.endsWith(task.title)?message.slice(0,-task.title.length)+"{title}":undefined,messageValues:{title:task.title},target:`task:${task.id}`});
   getStore().collections.taskNotificationEvents=[...taskRows("taskNotificationEvents"),{id:key,organizationId:task.organizationId,workItemId:task.id,userId:a.id,createdAt:now()}];saveStore(getStore());
 }
}
function event(user:AuthenticatedUser,task:TaskRow,kind:string,message:string,extra:TaskRow={}){
 const item={id:nextCollectionId("workActivity"),workItemId:task.id,organizationId:task.organizationId,locationId:task.locationId,assigneeId:task.assigneeId,assigneeIds:task.assigneeIds,taskVersion:2,kind,message,createdBy:user.name,createdById:user.id,occurredAt:now(),status:task.status,progress:task.progress,completionTransition:extra.previousStatus!=="Completed"&&task.status==="Completed"&&kind!=="comment",...extra};
 getStore().collections.workActivity=[...taskRows("workActivity"),item];saveStore(getStore());
 getStore().collections.auditLog=[...taskRows("auditLog"),{id:nextCollectionId("auditLog"),organizationId:task.organizationId,action:`operations.${kind}`,actorId:user.id,actorName:user.name,collection:"workItems",targetId:task.id,occurredAt:item.occurredAt}];saveStore(getStore());
 return item;
}
export function createSmartTask(user:AuthenticatedUser,input:unknown){
 if(!canCreateTask(user))taskError("You do not have permission to create tasks.",403);
 const p=taskInput.parse(input);
 return transaction(()=>{
   const fingerprint=createHash("sha256").update(JSON.stringify(p)).digest("hex");
   const prior=taskRows("workItems").find(t=>t.createdBy===user.id&&t.clientRequestId===p.clientRequestId);
   if(prior){if(prior.requestFingerprint!==fingerprint)taskError("This task request was already used with different details.",409);accessibleTask(user,prior.id);return prior;}
   if(p.startDate&&p.dueDate&&p.startDate>p.dueDate)taskError("Due date must be on or after the start date.");
   if(new Set(p.checklist.map(c=>c.id)).size!==p.checklist.length)taskError("Checklist identifiers must be unique.");
   const employees=recipients(user,p),at=now();
   const task={...p,reviewRequired:p.reviewRequired||taskRows("approvalRules").some(r=>r.section==="operations"&&r.action==="edit"&&r.active),id:nextCollectionId("workItems"),taskVersion:2,version:1,status:"Pending",progress:0,reviewState:"pending",assigneeIds:employees.map(e=>e.id),assigneeId:employees[0].id,assignee:employees.map(e=>e.name).join(", "),locationId:employees[0].locationId||"",assignments:employees.map(e=>({employeeId:e.id,status:"To Do",progress:0,completedChecklistIds:[],updatedAt:at})),createdBy:user.id,createdByName:user.name,createdAt:at,updatedAt:at,requestFingerprint:fingerprint};
   putTask(task);const e=event(user,task,"created","Task assigned.");notifyTask(task,e.id,"Task assigned: "+task.title,user.id);return task;
 });
}
export function requestSmartTask(user:AuthenticatedUser,input:unknown){
 const p=taskInput.parse(input);
 if(!canCreateTask(user))taskError("You do not have permission to create tasks.",403);
 if(!taskRows("approvalRules").some(r=>r.section==="operations"&&r.action==="create"&&r.active))return {pending:false,item:createSmartTask(user,p)};
 return transaction(()=>{
  const employees=recipients(user,p);if(p.startDate&&p.dueDate&&p.startDate>p.dueDate)taskError("Due date must be on or after the start date.");
  const prior=taskRows("approvalRequests").find(r=>r.collection==="workItems"&&r.requestedBy===user.id&&r.payload?.smartTaskInput?.clientRequestId===p.clientRequestId);
  if(prior){if(JSON.stringify(prior.payload.smartTaskInput)!==JSON.stringify(p))taskError("This task request was already used with different details.",409);if(prior.status==="pending")return {pending:true,request:prior};const item=taskRows("workItems").find(t=>t.createdBy===user.id&&t.clientRequestId===p.clientRequestId);if(item){accessibleTask(user,item.id);return {pending:false,item};}taskError("This task request was already reviewed. Start a new request.",409);}
  const request={id:nextCollectionId("approvalRequests"),section:"operations",action:"create",collection:"workItems",organizationId:p.organizationId,locationId:employees[0].locationId||"",status:"pending",requestedBy:user.id,requestedByName:user.name,requestedAt:now(),payload:{organizationId:p.organizationId,smartTaskInput:p,recipientIds:employees.map(e=>e.id)}};
  getStore().collections.approvalRequests=[...taskRows("approvalRequests"),request];saveStore(getStore());
  for(const a of taskRows("accessUsers").filter(a=>a.status==="active"&&a.roleId==="role-main-manager"&&a.id!==user.id))createNotification({userId:a.id,user:a.name,type:"pending_approval",severity:"info",message:"Task creation is awaiting approval: "+p.title,target:request.id});
  return {pending:true,request};
 });
}
export function applySmartTaskApproval(approver:AuthenticatedUser,request:TaskRow){
 const account=taskRows("accessUsers").find(a=>a.id===request.requestedBy&&a.status==="active"),role=account&&taskRows("accessRoles").find(r=>r.id===account.roleId);
 if(!account)taskError("The task requester is no longer active.",409);
 const author={...account,organizationIds:account.organizationIds||[],locationIds:account.locationIds||[],ownRecordsOnly:account.ownRecordsOnly??role?.ownRecordsOnly??false} as AuthenticatedUser;
 const p=taskInput.parse(request.payload.smartTaskInput),selected=recipients(author,p);recipients(approver,p);
 if(JSON.stringify(selected.map(e=>e.id).sort())!==JSON.stringify([...request.payload.recipientIds].sort()))taskError("Task recipients changed. Submit a new task request.",409);
 const task=createSmartTask(author,p);putTask({...task,approvedBy:approver.id,approvedAt:now()});
}
export function taskDetails(user:AuthenticatedUser,id:string){
 const task=accessibleTask(user,id),people=taskRows("employees").filter(e=>e.organizationId===task.organizationId&&(task.assigneeIds||[task.assigneeId]).includes(e.id));
 const accounts=taskRows("accessUsers").filter(a=>accountsFor(task).some(r=>r.id===a.id));
 return {task:{...task,isOverdue:Boolean(taskOverdue(task)),today:taskToday(task)},people:people.map(e=>({id:e.id,name:e.name,department:e.department})),colleagues:accounts.map(a=>({id:a.id,name:a.name,employeeId:a.employeeId})),
   activity:taskRows("workActivity").filter(e=>e.workItemId===id&&(!e.organizationId||e.organizationId===task.organizationId)).sort((a,b)=>String(a.occurredAt||a.createdAt).localeCompare(String(b.occurredAt||b.createdAt))),
   files:taskRows("workFiles").filter(f=>f.workItemId===id).map(({sha256,...f})=>f),permissions:{manage:canManageTask(user,task),update:can(user,"operations","edit")&&assignedTask(user,task),comment:can(user,"operations","edit"),review:canReviewTask(user,task)}};
}
export const updateInput=z.object({version:z.number().int().positive(),status:z.enum(participantStates),progress:z.number().int().min(0).max(100),completedChecklistIds:z.array(z.string()).max(100).default([]),message:z.string().trim().max(4000).default(""),kind:z.enum(["progress","help","extension"]).default("progress"),requestedDueDate:date.optional(),clientRequestId:z.string().min(8).max(160)}).strict();
function replay(user:AuthenticatedUser,task:TaskRow,key:string,body:unknown){const fingerprint=createHash("sha256").update(JSON.stringify(body)).digest("hex"),prior=taskRows("workActivity").find(e=>e.workItemId===task.id&&e.createdById===user.id&&e.clientRequestId===key);if(prior&&prior.requestFingerprint!==fingerprint)taskError("This update request was already used with different details.",409);return {prior,fingerprint};}
export function contributeTask(user:AuthenticatedUser,id:string,input:unknown){const p=updateInput.parse(input);return transaction(()=>{
 let task=accessibleTask(user,id);if(!assignedTask(user,task)||!can(user,"operations","edit"))taskError("Only an authorized assignee can update their contribution.",403);
 const retried=replay(user,task,p.clientRequestId,p);if(retried.prior)return task;
 if(task.taskVersion!==2)taskError("Ask a manager to upgrade this task's assignment before recording a contribution.",409);
 if(task.version!==p.version)taskError("This task changed. Refresh before saving your update.",409);
 if(["Cancelled","Completed"].includes(task.status)||task.status==="Awaiting Approval")taskError("A manager must reopen this task before more work is recorded.",409);
 if(p.completedChecklistIds.some(id=>!task.checklist.some((c:TaskRow)=>c.id===id))||new Set(p.completedChecklistIds).size!==p.completedChecklistIds.length)taskError("Choose valid checklist items.");
 if(p.status==="Completed"&&p.completedChecklistIds.length!==task.checklist.length)taskError("Complete your checklist before finishing the task.");
 if(p.kind!=="progress"&&!p.message)taskError("Explain the blocker or extension request.");
 if(p.kind==="extension"&&(!p.requestedDueDate||p.requestedDueDate<=String(task.dueDate||taskToday(task))))taskError("Request a deadline later than the current deadline.");
 const before=structuredClone(task.assignments.find((a:TaskRow)=>a.employeeId===user.employeeId));
 const next={...before,status:p.status,progress:p.status==="Completed"?100:Math.min(99,p.progress),completedChecklistIds:p.completedChecklistIds,updatedBy:user.id,updatedAt:now()};
 const previousStatus=task.status;task=aggregate({...task,assignments:task.assignments.map((a:TaskRow)=>a.employeeId===user.employeeId?next:a),version:task.version+1,updatedAt:now()});putTask(task);
 const e=event(user,task,p.kind,p.message||"Contribution updated.",{before,after:next,previousStatus,requestedDueDate:p.requestedDueDate,clientRequestId:p.clientRequestId,requestFingerprint:retried.fingerprint});
 notifyTask(task,e.id,(task.status==="Awaiting Approval"?"Task ready for review: ":task.status==="Completed"?"Task completed: ":p.kind==="help"||p.status==="Blocked"?"Task needs help: ":p.kind==="extension"?"Deadline extension requested: ":"Task updated: ")+task.title,user.id);return task;
 });}
export const commentInput=z.object({message:z.string().trim().min(1).max(4000),replyTo:z.string().optional(),mentionIds:z.array(z.string()).max(50).default([]),fileIds:z.array(z.string()).max(10).default([]),clientRequestId:z.string().min(8).max(160)}).strict();
export function commentOnTask(user:AuthenticatedUser,id:string,input:unknown,system?:{key:string;values:Record<string,string>}){const p=commentInput.parse(input);return transaction(()=>{
 const task=accessibleTask(user,id);if(!can(user,"operations","edit"))taskError("You do not have permission to comment on this task.",403);
 const retried=replay(user,task,p.clientRequestId,p);if(retried.prior)return retried.prior;
 if(p.replyTo&&!taskRows("workActivity").some(e=>e.id===p.replyTo&&e.workItemId===id&&e.kind==="comment"))taskError("Choose a comment from this task.");
 if(p.mentionIds.some(id=>!accountsFor(task).some(a=>a.id===id)))taskError("Mention only relevant task colleagues.");
 if(p.fileIds.some(id=>!taskRows("workFiles").some(f=>f.id===id&&f.workItemId===task.id&&f.createdBy===user.id)))taskError("Choose your own uploaded task files.");
 const e=event(user,task,"comment",p.message,{replyTo:p.replyTo,mentionIds:[...new Set(p.mentionIds)],fileIds:p.fileIds,clientRequestId:p.clientRequestId,requestFingerprint:retried.fingerprint,completionTransition:false,...(system?{messageKey:system.key,messageValues:system.values}:{})});
 notifyTask(task,e.id,"New task discussion: "+task.title,user.id);return e;
 });}
export const manageInput=z.object({version:z.number().int().positive(),action:z.enum(["edit","approve","rework","cancel","reopen","reassign","upgrade"]),reason:z.string().trim().min(3).max(2000),title:z.string().trim().min(1).max(180).optional(),description:z.string().max(8000).optional(),priority:z.enum(["Low","Medium","High","Urgent"]).optional(),dueDate:date.or(z.literal("")).optional(),assignmentMode:z.enum(["company","team","individual","multiple"]).optional(),departmentId:z.string().optional(),assigneeIds:z.array(z.string()).max(2000).optional()}).strict();
export function manageTask(user:AuthenticatedUser,id:string,input:unknown){const p=manageInput.parse(input);return transaction(()=>{
 let task=accessibleTask(user,id);if(["approve","rework"].includes(p.action)?!canReviewTask(user,task):!canManageTask(user,task))taskError("Only authorized managers can manage this task.",403);
 if(task.taskVersion!==2&&p.action==="upgrade"){
   if(p.version!==1)taskError("This task changed. Refresh before saving your update.",409);
   const people=recipients(user,{...task,assignmentMode:p.assignmentMode||"multiple",departmentId:p.departmentId||"",assigneeIds:p.assigneeIds||task.assigneeIds||[task.assigneeId]});
   const previous=structuredClone(task);task={...task,taskVersion:2,version:1,assignmentMode:p.assignmentMode||"multiple",departmentId:p.departmentId||"",assigneeIds:people.map(e=>e.id),assigneeId:people[0].id,assignee:people.map(e=>e.name).join(", "),locationId:people[0].locationId||"",checklist:[],reviewRequired:false,assignments:people.map(e=>({employeeId:e.id,status:task.status==="Completed"?"Completed":task.status==="In Progress"?"In Progress":"To Do",progress:task.status==="Completed"?100:Math.max(0,Math.min(99,Number(task.progress)||0)),completedChecklistIds:[],updatedAt:now()}))};
   putTask(task);const e=event(user,task,"upgraded",p.reason,{before:previous,after:structuredClone(task),completionTransition:false});notifyTask(task,e.id,"Task contributions enabled: "+task.title,user.id);return task;
 }
 if(task.taskVersion!==2)taskError("Enable contributions for this historical task first.",409);
 if(task.version!==p.version)taskError("This task changed. Refresh before saving your update.",409);
 const before=structuredClone(task);
 if(p.action==="approve"){if(!can(user,"operations","approve"))taskError("Task approval permission is required.",403);if(task.status!=="Awaiting Approval")taskError("This task is not awaiting review.",409);task={...task,reviewState:"approved",status:"Completed",reviewedBy:user.id,reviewedAt:now()};}
 if(p.action==="upgrade")taskError("Contributions are already enabled for this task.",409);
 if(p.action==="reopen"&&!["Completed","Cancelled"].includes(task.status))taskError("Only completed or cancelled tasks can be reopened.",409);
 if(["rework","reopen"].includes(p.action)){
   if(p.action==="rework"&&(task.status!=="Awaiting Approval"||!can(user,"operations","approve")))taskError("Task approval permission and a pending review are required.",403);
   task={...task,status:"In Progress",reviewState:"pending",assignments:task.assignments.map((a:TaskRow)=>({...a,status:"In Progress",progress:Math.min(99,a.progress)}))};
 }
 if(p.action==="cancel")task={...task,status:"Cancelled"};
 if(p.action==="edit"){
   task={...task,...Object.fromEntries(["title","description","priority","dueDate"].filter(k=>p[k as keyof typeof p]!==undefined).map(k=>[k,p[k as keyof typeof p]]))};
   if(task.startDate&&task.dueDate&&task.startDate>task.dueDate)taskError("Due date must be on or after the start date.");
 }
 if(p.action==="reassign"){
   if(["Completed","Cancelled"].includes(task.status))taskError("Reopen the task before reassigning it.",409);
   const assignment={...task,assignmentMode:p.assignmentMode||task.assignmentMode,departmentId:p.departmentId??task.departmentId,assigneeIds:p.assigneeIds||task.assigneeIds},employees=recipients(user,assignment);
   task={...task,...assignment,assigneeIds:employees.map(e=>e.id),assigneeId:employees[0].id,assignee:employees.map(e=>e.name).join(", "),locationId:employees[0].locationId||"",reviewState:"pending",assignments:employees.map(e=>task.assignments.find((a:TaskRow)=>a.employeeId===e.id)||{employeeId:e.id,status:"To Do",progress:0,completedChecklistIds:[],updatedAt:now()})};
 }
 if(!["approve","cancel","edit"].includes(p.action))task=aggregate(task);
 task={...task,version:task.version+1,updatedAt:now()};putTask(task);const e=event(user,task,p.action,p.reason,{before,after:structuredClone(task),previousStatus:before.status});notifyTask(task,e.id,"Task changed: "+task.title,user.id);return task;
 });}
export function requestManageTask(user:AuthenticatedUser,id:string,input:unknown){
 const p=manageInput.parse(input),task=accessibleTask(user,id);if(["approve","rework"].includes(p.action)?!canReviewTask(user,task):!canManageTask(user,task))taskError("Only authorized managers can manage this task.",403);
 if(!["approve","rework"].includes(p.action)&&taskRows("approvalRules").some(r=>r.section==="operations"&&r.action==="edit"&&r.active))return transaction(()=>{
   if((task.version||1)!==p.version)taskError("This task changed. Refresh before saving your update.",409);
   const prior=taskRows("approvalRequests").find(r=>r.collection==="workItems"&&r.status==="pending"&&r.requestedBy===user.id&&r.targetId===id&&JSON.stringify(r.payload?.smartTaskManagement)===JSON.stringify(p));if(prior)return {pending:true,request:prior};
   const request={id:nextCollectionId("approvalRequests"),section:"operations",action:"edit",collection:"workItems",targetId:id,organizationId:task.organizationId,locationId:task.locationId,status:"pending",requestedBy:user.id,requestedByName:user.name,requestedAt:now(),payload:{organizationId:task.organizationId,smartTaskManagement:p}};
   getStore().collections.approvalRequests=[...taskRows("approvalRequests"),request];saveStore(getStore());return {pending:true,request};
 });
 return {pending:false,item:manageTask(user,id,p)};
}
export function applyTaskManagementApproval(approver:AuthenticatedUser,request:TaskRow){
 const task=accessibleTask(approver,request.targetId);if(!canManageTask(approver,task))taskError("Only authorized managers can manage this task.",403);
 const account=taskRows("accessUsers").find(a=>a.id===request.requestedBy&&a.status==="active"),role=account&&taskRows("accessRoles").find(r=>r.id===account.roleId);
 if(!account)taskError("The task requester is no longer active.",409);
 const author={...account,organizationIds:account.organizationIds||[],locationIds:account.locationIds||[],ownRecordsOnly:account.ownRecordsOnly??role?.ownRecordsOnly??false} as AuthenticatedUser;
 manageTask(author,request.targetId,request.payload.smartTaskManagement);
}
export function dispatchTaskDeadlines(user:AuthenticatedUser,instant=new Date()){
 const tasks=taskRows("workItems").filter(t=>t.taskVersion===2&&can(user,"operations","view")&&isWithinScope(user,t)&&t.dueDate&&!["Completed","Cancelled"].includes(t.status));
 if(!tasks.length)return;
 transaction(()=>{for(const task of tasks){const today=taskToday(task,instant),days=(Date.parse(task.dueDate)-Date.parse(today))/86400000;if(days<0||days<=1)notifyTask(task,`${days<0?"overdue":"due"}:${task.dueDate}`,`${days<0?"Task overdue: ":"Task deadline approaching: "}${task.title}`);}});
}
