import { TEST_DATA_DIR } from "./test-env.js";
import { before,after,describe,it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { resolve,sep } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { getStore,type StoreData } from "./storage.js";
import { migrateOrganizations } from "./organization-model.js";
type Row=Record<string,any>;
let server:Server,base="",main="",manager="",staff="",secondStaff="",org:Row,foreignOrg:Row,company:Row,sister:Row,foreign:Row,employee:Row,teammate:Row,outsider:Row,task:Row,managerAccount:Row,staffPassword="";
const rows=(name:string)=>getStore().collections[name] as Row[];
const cookie=(response:Response)=>response.headers.get("set-cookie")!.split(";")[0];
const password=()=>randomBytes(24).toString("hex");
async function req(path:string,method="GET",body?:unknown,session=manager){return fetch(base+"/api"+path,{method,headers:{...(session?{Cookie:session}:{}),...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});}
async function json(response:Response,status=200):Promise<Row>{assert.equal(response.status,status,await response.clone().text());return response.json() as Promise<Row>;}
async function create(name:string,input:Row,session=main){return (await json(await req(`/collections/${name}`,"POST",input,session),201)).item;}
const employeeInput=(name:string,companyId:string)=>({name,organizationId:companyId,status:"active",hireDate:"2026-10-20",employmentType:"full-time",department:"Operations"});
const taskInput=(extra:Row={})=>({title:"Company team task",description:"Real follow-up work",assigneeIds:[employee.id,teammate.id],startDate:"2026-10-01",dueDate:"2026-10-19",priority:"High",status:"Pending",progress:0,...extra});
async function activate(item:Row,email:string){const invite=await json(await req(`/workspace/hr/communication/employees/${item.id}/invitation`,"POST"));const secret=password();await json(await req("/auth/activate-employee","POST",{token:invite.token,email,password:secret},""));const response=await req("/auth/login","POST",{email,password:secret},"");await json(response);return {cookie:cookie(response),password:secret};}
before(async()=>{
 server=createApp().listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const setup=await req("/auth/setup","POST",{name:"Owner",email:"owner@org-manager.test",password:password(),setupKey:"local-setup"},"");await json(setup,201);main=cookie(setup);
 org=await create("organizations",{name:"Authorized organization",status:"active"});foreignOrg=await create("organizations",{name:"Other organization",status:"active"});
 const companyInput=(name:string,parent:string)=>({name,parentOrganizationId:parent,status:"active",currency:"QAR",organizationType:"office",industry:"services"});
 company=await create("companies",companyInput("Manager company",org.id));sister=await create("companies",companyInput("Sister company",org.id));foreign=await create("companies",companyInput("Foreign company",foreignOrg.id));
 const temporary=password();managerAccount=(await json(await req("/workspace/access/users","POST",{name:"Organization Manager",email:"manager@org-manager.test",password:temporary,roleId:"role-organization-admin",tenantOrganizationIds:[org.id],organizationIds:[company.id,sister.id]},main),201)).item;
 const first=await req("/auth/login","POST",{email:managerAccount.email,password:temporary},"");await json(first);manager=cookie(first);assert.equal((await req(`/workspace/company-profiles/${company.id}`)).status,403);
 const rotated=password();await json(await req("/auth/password","POST",{currentPassword:temporary,newPassword:rotated}));const login=await req("/auth/login","POST",{email:managerAccount.email,password:rotated},"");await json(login);manager=cookie(login);
 employee=await create("employees",employeeInput("First employee",company.id),manager);teammate=await create("employees",employeeInput("Second employee",company.id),manager);outsider=await create("employees",employeeInput("Foreign employee",foreign.id));
 for(const person of [employee,teammate]){const account=rows("accessUsers").find(row=>row.employeeId===person.id)!;await json(await req(`/workspace/access/users/${account.id}`,"PATCH",{permissions:["hr.view","operations.view"]}));}
 const one=await activate(employee,"first@org-manager.test");staff=one.cookie;staffPassword=one.password;secondStaff=(await activate(teammate,"second@org-manager.test")).cookie;
});
after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));const target=resolve(TEST_DATA_DIR);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes("stocrant-test-data-"));rmSync(target,{recursive:true,force:true});});
describe("Organization Manager company access",()=>{
 it("provides payroll, HR, users and reports across assigned child companies only",async()=>{
  const profile=await json(await req(`/workspace/company-profiles/${company.id}`));assert.ok(profile.permissions.viewPayroll&&profile.permissions.exportCompany&&profile.permissions.manageAccount&&profile.permissions.viewWork);assert.deepEqual(profile.companies.map((row:Row)=>row.id).sort(),[company.id,sister.id].sort());assert.ok(profile.employees.every((row:Row)=>row.organizationId===company.id));
  await json(await req(`/workspace/company-profiles/${foreign.id}`),404);await json(await req(`/workspace/company-work/${foreign.id}`),404);await json(await req(`/workspace/company-profiles/${foreign.id}/reports/tasks`),404);
  const payroll=await json(await req("/workspace/payroll"));assert.ok(payroll.companies.every((row:Row)=>[company.id,sister.id].includes(row.id)));await json(await req(`/workspace/company-profiles/${company.id}/reports/company`));await json(await req("/workspace/attendance/dashboard?organizationId="+company.id));
  const attendance=await json(await req("/workspace/attendance/records","POST",{organizationId:company.id,employeeId:employee.id,date:"2026-10-19",checkIn:"08:00",checkOut:"17:00",note:"Organization manager reviewed hours"}),201);assert.equal(attendance.item.organizationId,company.id);assert.equal(attendance.item.employeeId,employee.id);
  await json(await req("/workspace/attendance/records","POST",{organizationId:foreign.id,employeeId:outsider.id,date:"2026-10-19",checkIn:"08:00"}),403);
 });
 it("creates and reassigns team tasks, validates dates and rejects unrelated employee links",async()=>{
  task=(await json(await req(`/workspace/company-work/${company.id}/tasks`,"POST",taskInput()),201)).item;assert.deepEqual(task.assigneeIds,[employee.id,teammate.id]);assert.equal(task.organizationId,company.id);
  await json(await req(`/workspace/company-work/${company.id}/tasks`,"POST",taskInput({assigneeIds:[outsider.id]})),400);
  await json(await req(`/workspace/company-work/${company.id}/tasks`,"POST",taskInput({startDate:"2026-02-30"})),400);
  await json(await req(`/workspace/company-work/${company.id}/tasks`,"POST",taskInput({startDate:"2026-10-21"})),400);
  await json(await req(`/workspace/company-work/${sister.id}/tasks/${task.id}`,"PATCH",taskInput()),404);
  await json(await req(`/workspace/company-work/${company.id}/tasks/${task.id}`,"PATCH",taskInput({status:"In Progress",progress:45})));assert.equal(rows("workItems").find(row=>row.id===task.id)!.progress,45);
 });
 it("shows each team member their tasks without exposing unrelated work or management notes",async()=>{
  await json(await req(`/workspace/company-work/${company.id}/tasks`,"POST",taskInput({title:"Second employee only",assigneeIds:[teammate.id]})),201);
  for(const actor of [staff,secondStaff]){const data=await json(await req(`/workspace/company-work/${company.id}`,"GET",undefined,actor));assert.ok(data.tasks.some((row:Row)=>row.id===task.id));assert.equal(data.permissions.edit,false);}
  const personal=await json(await req("/workspace/overview","GET",undefined,secondStaff));assert.ok(personal.personal.work.some((row:Row)=>row.id===task.id));
  const first=await json(await req("/workspace/work?view=mine","GET",undefined,staff));assert.ok(first.items.some((row:Row)=>row.id===task.id));assert.ok(!first.items.some((row:Row)=>row.title==="Second employee only"));
  await json(await req(`/workspace/company-work/${company.id}/tasks`,"POST",taskInput(),staff),403);await json(await req(`/workspace/company-work/${foreign.id}`,"GET",undefined,staff),404);
 });
 it("stores comments and notes with immutable authors and protects sensitive notes and links",async()=>{
  await json(await req(`/workspace/company-work/${company.id}/tasks/${task.id}/comments`,"POST",{message:"Manager follow-up"}),201);
  const privateNote=(await json(await req(`/workspace/company-work/${company.id}/notes`,"POST",{title:"Sensitive observation",body:"Private management text",category:"Observation",employeeId:employee.id,workItemId:task.id,visibility:"management"}),201)).item;
  const disposable=(await json(await req(`/workspace/company-work/${company.id}/notes`,"POST",{title:"Disposable note",body:"Temporary follow-up",visibility:"management"}),201)).item;
  await json(await req(`/workspace/company-work/${sister.id}/notes/${disposable.id}`,"PATCH",{title:"Wrong company",body:"No"}),404);
  await json(await req(`/workspace/company-work/${company.id}/notes/${disposable.id}`,"DELETE"));assert.ok(!rows("companyNotes").some(row=>row.id===disposable.id));assert.ok(rows("auditLog").some(row=>row.targetId===disposable.id&&row.action==="companyNotes.deleted"&&row.organizationId===company.id));
  const shared=(await json(await req(`/workspace/company-work/${company.id}/notes`,"POST",{title:"Team reminder",body:"Shared follow-up",category:"Reminder",workItemId:task.id,visibility:"employee"}),201)).item;
  assert.equal(privateNote.createdBy,managerAccount.id);assert.ok(privateNote.createdAt);
  const visible=await json(await req(`/workspace/company-work/${company.id}`,"GET",undefined,staff));assert.ok(!visible.notes.some((row:Row)=>row.id===privateNote.id));assert.ok(visible.notes.some((row:Row)=>row.id===shared.id));assert.ok(visible.activity.some((row:Row)=>row.message==="Manager follow-up"));
  await json(await req(`/workspace/company-work/${company.id}/notes`,"POST",{title:"Bad link",body:"Body",employeeId:outsider.id}),400);
  await json(await req(`/workspace/company-work/${company.id}/notes/${privateNote.id}`,"DELETE",undefined,staff),403);
  await json(await req(`/workspace/company-work/${company.id}/tasks/${task.id}`,"DELETE"),409);
  await json(await req(`/workspace/company-work/${company.id}/tasks/${task.id}`,"PATCH",taskInput({assigneeIds:[teammate.id],status:"Completed"})));
  const after=await json(await req(`/workspace/company-work/${company.id}`,"GET",undefined,staff));assert.ok(!after.tasks.some((row:Row)=>row.id===task.id));assert.ok(!after.notes.some((row:Row)=>row.id===shared.id));const second=await json(await req(`/workspace/company-work/${company.id}`,"GET",undefined,secondStaff));assert.ok(second.notes.some((row:Row)=>row.id===shared.id));assert.equal(second.tasks.find((row:Row)=>row.id===task.id).progress,100);
 });
 it("exports scoped task and note reports without exposing private notes to employees",async()=>{
  for(const kind of ["tasks","notes"]){const report=await json(await req(`/workspace/company-profiles/${company.id}/reports/${kind}`));assert.equal(report.company.id,company.id);assert.ok(report.rows.length);await json(await req(`/workspace/company-profiles/${company.id}/reports/${kind}`,"GET",undefined,staff),403);}
  const personal=await json(await req(`/workspace/company-profiles/employees/${employee.id}?report=notes`));assert.ok(personal.rows.some((row:Row)=>row.title==="Sensitive observation"));assert.ok(!JSON.stringify(personal).includes("passwordHash"));
  const account=rows("accessUsers").find(row=>row.employeeId===employee.id)!;await json(await req(`/workspace/access/users/${account.id}`,"PATCH",{permissions:["hr.view","operations.view","operations.export"]}));
  const redacted=await json(await req(`/workspace/company-profiles/${company.id}/reports/notes`,"GET",undefined,staff));assert.ok(!JSON.stringify(redacted).includes("Private management text"));
  const own=await json(await req(`/workspace/company-profiles/employees/${employee.id}?report=notes`,"GET",undefined,staff));assert.ok(!JSON.stringify(own).includes("Sensitive observation"));
  await json(await req(`/workspace/access/users/${account.id}`,"PATCH",{permissions:["hr.view","operations.view"]}));
  assert.ok(rows("auditLog").some(row=>row.collection==="companyNotes"&&row.organizationId===company.id));
 });
 it("manages scoped user permissions and resets passwords while protecting unrelated and global administrators",async()=>{
  const account=rows("accessUsers").find(row=>row.employeeId===employee.id)!;
  await json(await req(`/workspace/access/users/${account.id}`,"PATCH",{permissions:["hr.view","operations.view"],roleId:"role-employee"}));
  await json(await req(`/workspace/access/users/${account.id}`,"PATCH",{roleId:"role-main-manager"}),403);
  const foreignAccount=rows("accessUsers").find(row=>row.employeeId===outsider.id)!;await json(await req(`/workspace/access/users/${foreignAccount.id}`,"PATCH",{password:password()}),404);
  const reset=password();await json(await req(`/workspace/access/users/${account.id}`,"PATCH",{password:reset,status:"active"}));assert.equal((await req("/auth/me","GET",undefined,staff)).status,401);
  const old=await req("/auth/login","POST",{email:"first@org-manager.test",password:staffPassword},"");assert.equal(old.status,401);
  const fresh=await req("/auth/login","POST",{email:"first@org-manager.test",password:reset},"");const user=await json(fresh);assert.equal(user.user.mustChangePassword,true);await json(await req(`/workspace/company-work/${company.id}`,"GET",undefined,cookie(fresh)),403);
  await json(await req(`/workspace/access/users/${managerAccount.id}`,"PATCH",{status:"suspended"}),404);
 });
 it("upgrades the shipped role additively while preserving explicit custom restrictions",()=>{
  const copy=structuredClone(getStore()) as StoreData,role=(copy.collections.accessRoles as Row[]).find(row=>row.id==="role-organization-admin")!;
  role.permissions=role.permissions.filter((grant:string)=>!["payroll.*","organizations.export","organizations.delete","shops.*"].includes(grant));assert.equal(migrateOrganizations(copy),true);assert.ok(role.permissions.includes("payroll.*"));assert.equal(migrateOrganizations(copy),false);
  role.permissions=["organizations.view","hr.view"];migrateOrganizations(copy);assert.deepEqual(role.permissions,["organizations.view","hr.view"]);
 });
});
