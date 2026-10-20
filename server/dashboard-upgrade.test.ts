import { TEST_DATA_DIR } from "./test-env.js";
import { before,after,describe,it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { resolve,sep } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { getStore } from "./storage.js";
import { createNotification } from "./notifications.js";
type Row=Record<string,any>;
let server:Server,base="",main="",manager="",orgManager="",staff="",company:Row,sister:Row,foreign:Row,lead:Row,employee:Row,outsider:Row,department:Row,section:Row;
const secret=()=>randomBytes(24).toString("hex"),cookie=(res:Response)=>res.headers.get("set-cookie")!.split(";")[0];
async function req(path:string,method="GET",body?:unknown,session=main){return fetch(base+"/api"+path,{method,headers:{Cookie:session,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});}
async function json(response:Response,status=200):Promise<Row>{assert.equal(response.status,status,await response.clone().text());return response.json() as Promise<Row>;}
async function create(collection:string,input:Row){return (await json(await req(`/collections/${collection}`,"POST",input),201)).item;}
async function loginManager(email:string,roleId:string,scope:Row){const password=secret();await json(await req("/workspace/access/users","POST",{name:"Analytics Manager",email,password,roleId,...scope}),201);let response=await req("/auth/login","POST",{email,password},"");await json(response);const temporary=cookie(response),next=secret();await json(await req("/auth/password","POST",{currentPassword:password,newPassword:next},temporary));response=await req("/auth/login","POST",{email,password:next},"");await json(response);return cookie(response);}
before(async()=>{
 server=createApp().listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const setup=await req("/auth/setup","POST",{name:"Owner",email:"owner@analytics.test",password:secret(),setupKey:"local-setup"},"");await json(setup,201);main=cookie(setup);
 const org=await create("organizations",{name:"Analytics organization",status:"active"}),other=await create("organizations",{name:"Unrelated organization",status:"active"});
 const companyInput=(name:string,parentOrganizationId:string)=>({name,parentOrganizationId,status:"active",organizationType:"office",industry:"services",currency:"QAR"});
 company=await create("companies",companyInput("Analytics Company",org.id));sister=await create("companies",companyInput("Sister Analytics Company",org.id));foreign=await create("companies",companyInput("Private Foreign Company",other.id));
 const person=(name:string,organizationId:string)=>({name,organizationId,status:"active",hireDate:"2026-10-20",department:"Legacy Operations",salary:87531});
 lead=await create("employees",person("Team Lead",company.id));employee=await create("employees",person("Scoped Employee",company.id));outsider=await create("employees",person("Foreign Employee",foreign.id));await create("employees",person("Sister Employee",sister.id));
 manager=await loginManager("company@analytics.test","role-company-manager",{organizationIds:[company.id]});orgManager=await loginManager("org@analytics.test","role-organization-admin",{tenantOrganizationIds:[org.id],organizationIds:[]});
 const invite=await json(await req(`/workspace/hr/communication/employees/${employee.id}/invitation`,"POST")),password=secret();await json(await req("/auth/activate-employee","POST",{token:invite.token,email:"staff@analytics.test",password},""));const response=await req("/auth/login","POST",{email:"staff@analytics.test",password},"");await json(response);staff=cookie(response);
});
after(async()=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));assert.ok(resolve(TEST_DATA_DIR).startsWith(resolve(tmpdir())+sep));rmSync(TEST_DATA_DIR,{recursive:true,force:true});});
describe("Structured company management and analytics",()=>{
 it("adds departments and sections without rewriting legacy employee fields",async()=>{
  department=await create("departments",{name:"Operations",organizationId:company.id,kind:"department",status:"active",managerId:lead.id});
  section=await create("departments",{name:"Support",organizationId:company.id,kind:"section",parentDepartmentId:department.id,status:"active",managerId:lead.id});
  assert.equal((getStore().collections.employees as Row[]).find(row=>row.id===employee.id)!.department,"Legacy Operations");
  const assigned=await json(await req(`/collections/employees/${employee.id}`,"PATCH",{departmentId:department.id,sectionId:section.id,managerId:lead.id},manager));assert.ok(!Object.hasOwn(assigned.item,"salary"),"Mutation responses must preserve salary privacy");
  const profile=await json(await req(`/workspace/company-profiles/${company.id}`,"GET",undefined,manager));assert.equal(profile.employees.find((row:Row)=>row.id===employee.id).department,"Operations");assert.equal(profile.records.departments.length,2);
 });
 it("rejects cross-company, circular and malformed reporting links through generic CRUD",async()=>{
  await json(await req(`/collections/employees/${lead.id}`,"PATCH",{managerId:employee.id},manager),400);
  await json(await req(`/collections/employees/${employee.id}`,"PATCH",{managerId:employee.id},manager),400);
  await json(await req(`/collections/employees/${employee.id}`,"PATCH",{managerId:outsider.id},orgManager),400);
  await json(await req(`/collections/employees/${employee.id}`,"PATCH",{managerId:[lead.id]},manager),400);
  await json(await req(`/collections/employees/${employee.id}`,"PATCH",{departmentId:department.id,sectionId:"missing"},manager),400);
  await json(await req(`/collections/departments/${section.id}`,"PATCH",{parentDepartmentId:section.id},manager),400);
  await json(await req(`/collections/employees/${employee.id}`,"PATCH",{managerId:""},staff),403);
 });
 it("retains inactive assignments and blocks orphaned hierarchy changes",async()=>{
  await json(await req(`/collections/departments/${department.id}`,"DELETE",undefined,manager),400);
  await json(await req(`/collections/departments/${department.id}`,"PATCH",{kind:"section",parentDepartmentId:section.id},manager),400);
  const other=await create("departments",{name:"Other Department",organizationId:company.id,kind:"department",status:"active"});
  await json(await req(`/collections/departments/${section.id}`,"PATCH",{parentDepartmentId:other.id},manager),400);
  await json(await req(`/collections/departments/${section.id}`,"PATCH",{kind:"department",parentDepartmentId:""},manager),400);
  await json(await req(`/collections/departments/${section.id}`,"PATCH",{status:"inactive"},manager));
  await json(await req(`/collections/employees/${employee.id}`,"PATCH",{jobTitle:"Retained assignment"},manager));
  await json(await req(`/collections/employees/${lead.id}`,"PATCH",{departmentId:department.id,sectionId:section.id},manager),400);
  await json(await req(`/collections/departments/${section.id}`,"PATCH",{status:"active"},manager));
  assert.ok((getStore().collections.auditLog as Row[]).some(row=>row.targetId===department.id&&row.action==="departments.create"));
 });
 it("scopes summaries and filters for administrators and company managers without personal data",async()=>{
  const data=await json(await req("/workspace/analytics?metric=workforce&group=department","GET",undefined,manager));assert.equal(data.total,2);assert.equal(data.companies.length,1);assert.ok(data.points.some((p:Row)=>p.label==="Operations"&&p.value===1));
  assert.ok(!JSON.stringify(data).includes("87531"));assert.ok(!JSON.stringify(data).includes("Foreign Employee"));assert.ok(!JSON.stringify(data).includes("@analytics.test"));
  await json(await req(`/workspace/analytics?metric=workforce&company=${foreign.id}`,"GET",undefined,manager),404);
  const org=await json(await req("/workspace/analytics?metric=workforce","GET",undefined,orgManager));assert.equal(org.total,3);assert.equal(org.companies.length,2);
  const selected=await json(await req(`/workspace/analytics?metric=workforce&department=${department.id}&section=${section.id}&manager=${lead.id}`,"GET",undefined,manager));assert.equal(selected.total,1);
  const all=await json(await req("/workspace/analytics?metric=companies"));assert.ok(all.total>=3);
 });
 it("counts only personal rows and rejects forbidden scopes and metrics",async()=>{
  const own=await json(await req("/workspace/analytics?metric=workforce","GET",undefined,staff));assert.equal(own.total,1);assert.equal(own.managers.length,0);assert.equal(own.activity.length,0);
  await json(await req("/workspace/analytics?metric=companies","GET",undefined,staff),403);
  await json(await req(`/workspace/analytics?metric=workforce&manager=${lead.id}`,"GET",undefined,staff),404);
  await json(await req(`/workspace/company-profiles/${company.id}`,"GET",undefined,staff),403);
 });
 it("applies date bounds and day/week/month grouping with truthful zero buckets",async()=>{
  const path="/workspace/analytics?metric=hires&start=2026-10-18&end=2026-10-20";
  const daily=await json(await req(path+"&group=day","GET",undefined,manager));assert.equal(daily.total,2);assert.deepEqual(daily.points.map((row:Row)=>row.value),[0,0,2]);
  const weekly=await json(await req(path+"&group=week","GET",undefined,manager));assert.equal(weekly.points.reduce((sum:number,row:Row)=>sum+row.value,0),2);
  const monthly=await json(await req(path+"&group=month","GET",undefined,manager));assert.equal(monthly.points.length,1);assert.equal(monthly.points[0].label,"2026-10");
  assert.equal((await json(await req(path+"&status=terminated","GET",undefined,manager))).total,0);
  for(const query of ["metric=hires&start=2026-02-30","metric=hires&start=2026-10-21&end=2026-10-20","metric=hires&start=2020-01-01&end=2026-10-20","metric=workforce&group=day","metric=salary"])await json(await req("/workspace/analytics?"+query),400);
 });
 it("keeps notification counts private and updates them after read actions",async()=>{
  const account=(getStore().collections.accessUsers as Row[]).find(row=>row.employeeId===employee.id)!;
  const notice=createNotification({userId:account.id,user:"Scoped Employee",type:"message",severity:"info",message:"Private notification",target:null});createNotification({userId:"another-account",user:"Other",type:"message",severity:"info",message:"Confidential unrelated message",target:null});
  const task=(await json(await req(`/workspace/company-work/${company.id}/tasks`,"POST",{title:"Dated company task",assigneeIds:[employee.id],status:"Pending"}),201)).item;
  createNotification({userId:account.id,user:"Scoped Employee",type:"overdue_work",severity:"warning",message:"Own linked task alert",target:task.id});
  assert.equal((await json(await req(`/workspace/analytics?metric=notifications&company=${company.id}`,"GET",undefined,staff))).total,1);
  let data=await json(await req("/workspace/analytics?metric=notifications&group=status","GET",undefined,staff));assert.ok(data.points.some((row:Row)=>row.label==="Unread"));assert.ok(!JSON.stringify(data).includes("Confidential unrelated message"));
  await json(await req(`/notifications/${notice.id}/read`,"POST",undefined,staff));
  data=await json(await req("/workspace/analytics?metric=notifications&group=status","GET",undefined,staff));assert.ok(data.points.some((row:Row)=>row.label==="Read"));
  await json(await req(`/notifications/${notice.id}`,"DELETE",undefined,manager),404);
 });
});
