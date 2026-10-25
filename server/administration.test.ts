import {TEST_DATA_DIR} from "./test-env.js";
import {before,after,describe,it} from "node:test";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {createServer,type Server} from "node:http";
import {rmSync} from "node:fs";
import {resolve,sep} from "node:path";
import {tmpdir} from "node:os";
import {createApp} from "./app.js";
import {getStore,saveStore} from "./storage.js";
import {dispatchOnboardingEmails,onboardingStatus} from "./onboarding.js";
import {policyDefaults} from "./admin-policy.js";
type Row=Record<string,any>;const rows=(name:string)=>getStore().collections[name] as Row[];
let server:Server,mailServer:Server,base="",main="",second="",manager="",staff="",company:Row,employee:Row;
const password=randomBytes(24).toString("hex"),staffPassword=randomBytes(24).toString("hex");const delivered:{body:Row;key:string}[]=[];let failMail=false;
const cookie=(res:Response)=>res.headers.get("set-cookie")!.split(";")[0];
async function req(path:string,method="GET",body?:unknown,auth=main){return fetch(base+"/api"+path,{method,headers:{Cookie:auth,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});}
async function json(res:Response,status=200):Promise<Row>{assert.equal(res.status,status,await res.clone().text());return res.json() as Promise<Row>;}
async function create(collection:string,body:Row){return (await json(await req("/collections/"+collection,"POST",body),201)).item;}
const person=(name:string,email:string,extra:Row={})=>({name,email,organizationId:company.id,status:"active",hireDate:"2026-10-20",...extra});
const roleInput=(extra:Row={})=>({name:"Scoped custom staff",description:"Test role",permissions:["hr.view"],status:"active",scope:"own",currentPassword:password,...extra});
async function policy(extra:Row={}){await json(await req("/workspace/administration/policy","PUT",{...policyDefaults,...extra,currentPassword:password}));}
before(async()=>{
 process.env.STOCRANT_ONBOARDING_KEY=randomBytes(32).toString("base64");process.env.STOCRANT_EMAIL_API_KEY="test-only-provider-key";process.env.STOCRANT_EMAIL_FROM="Stocrant <onboarding@example.test>";process.env.STOCRANT_APP_URL="https://stocrant.example.test";
 mailServer=createServer(async(req,res)=>{let body="";for await(const chunk of req)body+=chunk;delivered.push({body:JSON.parse(body),key:String(req.headers["idempotency-key"])});res.writeHead(failMail?503:200,{"Content-Type":"application/json"});res.end(JSON.stringify(failMail?{error:"temporary"}:{id:"email-"+delivered.length}));}).listen(0,"127.0.0.1");await new Promise<void>(resolve=>mailServer.once("listening",resolve));process.env.STOCRANT_EMAIL_TEST_ENDPOINT=`http://127.0.0.1:${(mailServer.address() as {port:number}).port}`;
 server=createApp().listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const setup=await req("/auth/setup","POST",{name:"Main Administrator",email:"owner@administration.test",password,setupKey:"local-setup"},"");await json(setup,201);main=cookie(setup);
 const org=await create("organizations",{name:"Administration Organization",status:"active"});company=await create("companies",{name:"Administration Company",parentOrganizationId:org.id,status:"active",organizationType:"office",industry:"services",currency:"QAR"});
 async function makeUser(email:string,roleId:string){const temporary=randomBytes(24).toString("hex");await json(await req("/workspace/access/users","POST",{name:email.split("@")[0],email,password:temporary,roleId,organizationIds:roleId==="role-main-manager"?[]:[company.id]}),201);let res=await req("/auth/login","POST",{email,password:temporary},"");await json(res);await json(await req("/auth/password","POST",{currentPassword:temporary,newPassword:password},cookie(res)));res=await req("/auth/login","POST",{email,password},"");await json(res);return cookie(res);}
 second=await makeUser("second@administration.test","role-main-manager");manager=await makeUser("manager@administration.test","role-company-manager");
});
after(async()=>{for(const value of [server,mailServer]){value.closeAllConnections();await new Promise<void>((resolve,reject)=>value.close(err=>err?reject(err):resolve()));}assert.ok(resolve(TEST_DATA_DIR).startsWith(resolve(tmpdir())+sep));rmSync(TEST_DATA_DIR,{recursive:true,force:true});});
describe("Access administration and secure onboarding",()=>{
 it("atomically creates one employee, ID, username, account and encrypted mail job under concurrent retries",async()=>{
  const body=person("Repeated Employee","employee@administration.test",{clientRequestId:randomUUID()});const results=await Promise.all([req("/collections/employees","POST",body),req("/collections/employees","POST",body)]);const a=await json(results[0],201),b=await json(results[1],201);employee=a.item;assert.equal(a.item.id,b.item.id);assert.match(employee.employeeCode,/^EMP-/);assert.equal(rows("accessUsers").filter(row=>row.employeeId===employee.id).length,1);assert.equal(rows("onboardingEmails").filter(row=>row.employeeId===employee.id).length,1);assert.equal(onboardingStatus(employee.id).status,"pending");assert.ok(rows("onboardingEmails")[0].encryptedPayload);assert.ok(!JSON.stringify(getStore()).includes("#activate="));
 });
 it("sends branded onboarding through the configured provider and permits activation exactly once",async()=>{
  await dispatchOnboardingEmails();assert.equal(onboardingStatus(employee.id).status,"sent");const sent=delivered.at(-1)!;assert.deepEqual(sent.body.to,["employee@administration.test"]);const account=rows("accessUsers").find(row=>row.employeeId===employee.id)!;assert.ok(sent.body.text.includes(employee.employeeCode)&&sent.body.text.includes(account.username)&&sent.body.text.includes(company.name));
  const token=String(sent.body.text).match(/#activate=([A-Za-z0-9_-]{43})/)![1];assert.ok(!JSON.stringify(getStore()).includes(token));assert.ok(!rows("onboardingEmails")[0].encryptedPayload);
  await json(await req("/auth/activate-employee","POST",{token,email:"employee@administration.test",password:staffPassword},""));await json(await req("/auth/activate-employee","POST",{token,email:"employee@administration.test",password:staffPassword},""),400);
  const login=await req("/auth/login","POST",{email:account.username,password:staffPassword},"");await json(login);staff=cookie(login);assert.equal(onboardingStatus(employee.id).status,"sent");assert.equal(onboardingStatus(employee.id).invitationAccepted,true);assert.ok(rows("auditLog").some(row=>row.action==="access.employee-account-activated"&&row.employeeId===employee.id));
 });
 it("retains employees on provider failure and retries the same encrypted request without duplicate accounts",async()=>{
  const item=await create("employees",person("Recoverable Mail","recover@administration.test"));failMail=true;await dispatchOnboardingEmails();const failed=delivered.at(-1)!;assert.equal(onboardingStatus(item.id).status,"pending");failMail=false;await json(await req(`/workspace/administration/employees/${item.id}/email`,"POST"));await dispatchOnboardingEmails();assert.equal(onboardingStatus(item.id).status,"sent");assert.equal(delivered.at(-1)!.key,failed.key);assert.deepEqual(delivered.at(-1)!.body,failed.body);assert.equal(rows("accessUsers").filter(row=>row.employeeId===item.id).length,1);
  const key=process.env.STOCRANT_EMAIL_API_KEY;delete process.env.STOCRANT_EMAIL_API_KEY;const unconfigured=await create("employees",person("Mail Not Configured","setup@administration.test"));assert.equal(onboardingStatus(unconfigured.id).status,"failed");process.env.STOCRANT_EMAIL_API_KEY=key;await json(await req(`/workspace/administration/employees/${unconfigured.id}/email`,"POST"));await dispatchOnboardingEmails();assert.equal(onboardingStatus(unconfigured.id).status,"sent");
  const stale=await create("employees",person("Outage Retry","outage@administration.test"));const staleJob=rows("onboardingEmails").find(row=>row.employeeId===stale.id)!;staleJob.createdAt=new Date(Date.now()-24*3600000).toISOString();saveStore(getStore());const count=delivered.length;await dispatchOnboardingEmails();assert.equal(delivered.length,count);assert.equal(onboardingStatus(stale.id).status,"expired");await json(await req(`/workspace/administration/employees/${stale.id}/email`,"POST"));await dispatchOnboardingEmails();assert.equal(onboardingStatus(stale.id).status,"sent");assert.notEqual(delivered.at(-1)!.key,"stocrant-onboarding/"+staleJob.id);
 });
 it("expires tokens and invalidates old invitations after an employee email change",async()=>{
  const item=await create("employees",person("Expiring Invitation","expire@administration.test"));await dispatchOnboardingEmails();const token=String(delivered.at(-1)!.body.text).match(/#activate=([A-Za-z0-9_-]{43})/)![1];const invite=rows("employeeInvitations").find(row=>row.accountId===item.accountId)!;invite.expiresAt="2020-01-01T00:00:00Z";saveStore(getStore());await json(await req("/auth/activate-employee","POST",{token,email:"expire@administration.test",password:staffPassword},""),400);
  await json(await req(`/collections/employees/${item.id}`,"PATCH",{email:"changed@administration.test"}));await json(await req("/auth/activate-employee","POST",{token,email:"changed@administration.test",password:staffPassword},""),400);await dispatchOnboardingEmails();assert.ok(delivered.at(-1)!.body.text.includes("#activate="));assert.deepEqual(delivered.at(-1)!.body.to,["changed@administration.test"]);
 });
 it("protects system administration, role assignment, immutable Main roles and current-password confirmation",async()=>{
  await json(await req("/workspace/administration","GET",undefined,manager),403);await json(await req("/collections/companies","POST",{name:"Unauthorized",parentOrganizationId:company.parentOrganizationId,status:"active",organizationType:"office",industry:"services",currency:"QAR"},manager),403);
  await json(await req("/workspace/administration/roles","POST",roleInput(),manager),403);await json(await req("/workspace/administration/roles","POST",roleInput({currentPassword:"wrong"})),403);
  await json(await req("/workspace/administration/roles/role-main-manager","PATCH",roleInput()),403);await json(await req("/workspace/access/roles/role-main-manager","PATCH",{permissions:["*"]}),403);
  await json(await req("/workspace/administration/roles","POST",roleInput({permissions:["*","access.view"]})),400);await json(await req("/workspace/administration/policy","PUT",{...policyDefaults,currentPassword:password,separateApproverSections:[]}),400);
  const root=rows("accessUsers").find(row=>row.email==="owner@administration.test")!;await json(await req(`/workspace/access/users/${root.id}`,"PATCH",{roleId:"role-main-manager"},manager),404);
 });
 it("creates custom roles, enforces department scope and immediately revokes affected sessions",async()=>{
  const department=await create("departments",{name:"Assigned Unit",organizationId:company.id,kind:"department",status:"active"});await json(await req(`/collections/employees/${employee.id}`,"PATCH",{departmentId:department.id}));
  const account=rows("accessUsers").find(row=>row.employeeId===employee.id)!;const role=(await json(await req("/workspace/administration/roles","POST",roleInput({scope:"department",departmentIds:[department.id],assignedUserIds:[account.id]})),201)).item;
  await json(await req("/auth/me","GET",undefined,staff),401);await json(await req(`/workspace/access/users/${account.id}`,"PATCH",{ownRecordsOnly:false,permissions:null}));
  let login=await req("/auth/login","POST",{email:account.username,password:staffPassword},"");await json(login);staff=cookie(login);const visible=await json(await req("/collections/employees","GET",undefined,staff));assert.deepEqual(visible.items.map((row:Row)=>row.id),[employee.id]);
  await json(await req(`/workspace/administration/roles/${role.id}`,"PATCH",roleInput({name:role.name,status:"inactive",scope:"department",departmentIds:[department.id]})));await json(await req("/auth/me","GET",undefined,staff),401);login=await req("/auth/login","POST",{email:account.username,password:staffPassword},"");await json(login,401);assert.ok(rows("auditLog").some(row=>row.action==="access.role-updated"&&row.targetId===role.id));
 });
 it("applies Main changes immediately while keeping ordinary-manager approvals",async()=>{
  await json(await req("/workspace/access/approval-rules","POST",{section:"hr",action:"create",active:true}),201);
  const direct=await json(await req("/collections/departments","POST",{name:"Main Direct Unit",organizationId:company.id,kind:"department",status:"active"}),201);assert.equal(direct.pending,false);
  await policy({mainSelfApproval:false});await json(await req("/collections/departments","POST",{name:"Still Main Direct",organizationId:company.id}),201);
  await json(await req("/collections/employees","POST",person("Main Salary Change","paid@administration.test",{salary:1000})),201);await policy();
  const account=rows("accessUsers").find(row=>row.email==="manager@administration.test")!;await json(await req(`/workspace/access/users/${account.id}`,"PATCH",{permissions:["hr.view","hr.create","hr.edit","approvals.view","approvals.approve"]}));
  const own=await json(await req("/collections/departments","POST",{name:"Manager Review Unit",organizationId:company.id},manager),202);await json(await req(`/workspace/approvals/${own.request.id}`,"POST",{decision:"approve",note:"Ordinary manager self approval"},manager),400);
  await json(await req(`/workspace/approvals/${own.request.id}/changes`,"POST",{note:"Revise the department name"}));assert.equal(rows("approvalRequests").find(row=>row.id===own.request.id)!.status,"changes-requested");assert.ok(!rows("departments").some(row=>row.name==="Manager Review Unit"));
  const queued=await json(await req("/collections/departments","POST",{name:"Independent Manager Unit",organizationId:company.id},manager),202);await json(await req(`/workspace/approvals/${queued.request.id}`,"POST",{decision:"approve"},second));
 });
 it("supports no-login categories and reserves employee identifiers after safe deletion",async()=>{
  await policy({automaticAccounts:false});const rule=rows("approvalRules").find(row=>row.section==="hr"&&row.action==="create")!;rule.active=false;saveStore(getStore());const item=await create("employees",person("No Login","",{loginAccount:false}));assert.ok(!rows("accessUsers").some(row=>row.employeeId===item.id));await json(await req(`/collections/employees/${item.id}`,"DELETE"));await json(await req("/collections/employees","POST",person("Never Reused","",{employeeCode:item.employeeCode,loginAccount:false})),409);await policy();
 });
});
