import { TEST_DATA_DIR } from "./test-env.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { getStore, saveStore, transaction, type StoreData } from "./storage.js";
import { generateEmployeeCode, generateUsername, migrateEmployeeIdentities, validUsername } from "./employee-identity.js";
type Row = Record<string, any>;
let server:Server, base="", main="", hr="", staff="", foreign:Row, employee:Row;
const rows=(name:string)=>getStore().collections[name] as Row[];
async function req(path:string,method="GET",input?:unknown,owner=main){return fetch(base+"/api"+path,{method,headers:{...(input===undefined?{}:{"Content-Type":"application/json"}),...(owner?{Cookie:owner}:{})},...(input===undefined?{}:{body:JSON.stringify(input)})});}
async function expect(response:Response,code:number){assert.equal(response.status,code,await response.clone().text());return response.json() as Promise<Row>;}
const cookie=(response:Response)=>response.headers.get("set-cookie")!.split(";")[0];
const values=(extra:Row={})=>({name:"Company Test Employee",email:"",phone:"",organizationId:"company-primary",employmentType:"full-time",status:"active",hireDate:"2026-10-19",department:"Operations",jobTitle:"Coordinator",...extra});
before(async()=>{server=createApp().listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;const setup=await req("/auth/setup","POST",{name:"Company Owner",email:"owner@company.test",password:randomBytes(24).toString("hex"),setupKey:"local-setup"},"");await expect(setup,201);main=cookie(setup);
 const password=randomBytes(24).toString("hex");const account=(await expect(await req("/workspace/access/users","POST",{name:"Company HR",email:"hr@company.test",password,roleId:"role-manager",organizationIds:["company-primary"]}),201)).item;
 await expect(await req(`/workspace/access/users/${account.id}`,"PATCH",{permissions:["hr.view","hr.create","hr.edit"]}),200);const login=await req("/auth/login","POST",{email:account.email,password},"");await expect(login,200);hr=cookie(login);
 const company=(await expect(await req("/collections/companies","POST",{name:"Outside Company",parentOrganizationId:rows("companies")[0].parentOrganizationId,organizationType:"office",industry:"services",currency:"QAR",status:"active"}),201)).item;foreign=company;
});
after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));const target=resolve(TEST_DATA_DIR);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes("stocrant-test-data-"));rmSync(target,{recursive:true,force:true});});
describe("Company profiles and employee identities",()=>{
 it("generates readable IDs globally, retries collisions and creates unique usernames for repeated or Arabic names",()=>{
  const existing=[{employeeCode:"EMP-2026-COLLISION"}];let attempts=0;assert.equal(generateEmployeeCode(existing,2026,()=>++attempts===1?"COLLISION":"UNIQUE"),"EMP-2026-UNIQUE");assert.equal(attempts,2);
  const first=generateUsername([],"Same Name"),second=generateUsername([{username:first}],"Same Name");assert.notEqual(first,second);assert.ok(validUsername(first)&&validUsername(second));assert.ok(validUsername(generateUsername([],"محمد علي","EMP-2026-12345678")));
 });
 it("creates an automatic ID, username and linked restricted account atomically; concurrent retries without email create exactly one",async()=>{
  const input=values({clientRequestId:randomUUID(),employeeCode:"CLIENT-ASSIGNED",roleId:"role-main-manager",username:"admin"});const replies=await Promise.all([req("/collections/employees","POST",input,hr),req("/collections/employees","POST",input,hr)]);const [a,b]=await Promise.all(replies.map(response=>expect(response,201)));employee=a.item;assert.equal(a.item.id,b.item.id);assert.match(employee.employeeCode,/^EMP-\d{4}-[A-F0-9]{8}$/);const accounts=rows("accessUsers").filter(row=>row.employeeId===employee.id);assert.equal(accounts.length,1);assert.ok(validUsername(accounts[0].username));assert.notEqual(accounts[0].username,"admin");assert.equal(accounts[0].roleId,"role-employee");assert.deepEqual(accounts[0].permissions,["hr.view"]);assert.equal(employee.accountId,accounts[0].id);
  await expect(await req("/collections/employees","POST",{...input,name:"Changed duplicate"},hr),409);
 });
 it("keeps legacy IDs and usernames stable on employee edits and rejects identity replacement",async()=>{
  const username=rows("accessUsers").find(row=>row.employeeId===employee.id)!.username;await expect(await req(`/collections/employees/${employee.id}`,"PATCH",{name:"Updated Employee",jobTitle:"Senior coordinator"},hr),200);
  assert.equal(rows("employees").find(row=>row.id===employee.id)!.employeeCode,employee.employeeCode);assert.equal(rows("accessUsers").find(row=>row.employeeId===employee.id)!.username,username);
  await expect(await req(`/collections/employees/${employee.id}`,"PATCH",{employeeCode:"EMP-CHANGED"},hr),409);
  const legacy=(await expect(await req("/collections/employees","POST",values({employeeCode:"LEGACY-001"})),201)).item;await expect(await req(`/collections/employees/${legacy.id}`,"PATCH",{department:"Finance"}),200);assert.equal(rows("employees").find(row=>row.id===legacy.id)!.employeeCode,"LEGACY-001");
 });
 it("provides a readable, scoped company profile and protects cross-company records and account data",async()=>{
  const profile=await expect(await req("/workspace/company-profiles/company-primary","GET",undefined,hr),200);assert.equal(profile.company.id,"company-primary");assert.equal(profile.organization.name,rows("organizations").find(row=>row.id===profile.company.parentOrganizationId)!.name);assert.ok(!Object.hasOwn(profile.organization,"id"),"HR without organization permission gets only its readable name");assert.equal(profile.permissions.editCompany,false);assert.equal(profile.users.length,0);const row=profile.employees.find((row:Row)=>row.id===employee.id);assert.ok(row.account.username);assert.ok(!JSON.stringify(profile).includes("passwordHash"));assert.ok(profile.employees.every((row:Row)=>row.organizationId==="company-primary"));
  await expect(await req(`/workspace/company-profiles/${foreign.id}`,"GET",undefined,hr),404);await expect(await req(`/collections/companies/company-primary`,"PATCH",{name:"Illegal edit"},hr),403);await expect(await req("/collections/employees","POST",values({organizationId:foreign.id}),hr),400);
 });
 it("permits only authorized administrators to change usernames, validates uniqueness and supports activation then username login",async()=>{
  const account=rows("accessUsers").find(row=>row.employeeId===employee.id)!;await expect(await req(`/workspace/access/users/${account.id}`,"PATCH",{username:"approved.employee"},hr),403);
  await expect(await req(`/workspace/access/users/${account.id}`,"PATCH",{username:"APPROVED.EMPLOYEE"}),200);assert.equal(rows("accessUsers").find(row=>row.id===account.id)!.username,"approved.employee");
  const owner=rows("accessUsers").find(row=>row.roleId==="role-main-manager")!;await expect(await req(`/workspace/access/users/${account.id}`,"PATCH",{username:owner.username}),409);await expect(await req(`/workspace/access/users/${account.id}`,"PATCH",{username:"bad username"}),400);
  const invitation=await expect(await req(`/workspace/hr/communication/employees/${employee.id}/invitation`,"POST",undefined,hr),200);const password=randomBytes(24).toString("hex");await expect(await req("/auth/activate-employee","POST",{token:invitation.token,email:"activated@company.test",password},""),200);
  const login=await req("/auth/login","POST",{email:"APPROVED.EMPLOYEE",password},"");const logged=await expect(login,200);staff=cookie(login);assert.equal(logged.user.id,account.id);assert.equal(logged.user.username,"approved.employee");assert.equal((await req("/workspace/company-profiles/company-primary","GET",undefined,staff)).status,403);
 });
 it("enforces unique identities at the JSON storage boundary with rollback",()=>{
  const before=rows("accessUsers").length,account=rows("accessUsers")[0];assert.throws(()=>transaction(()=>{getStore().collections.accessUsers=[...rows("accessUsers"),{...account,id:randomUUID(),email:"another@company.test"}];saveStore(getStore());}),/unique username/);assert.equal(rows("accessUsers").length,before);
  assert.throws(()=>transaction(()=>{getStore().collections.employees=[...rows("employees"),{...employee,id:randomUUID()}];saveStore(getStore());}),/Employee ID/);
 });
 it("rolls back failed account creation without orphaning generated employee identities",async()=>{
  const before=rows("employees").length;await expect(await req("/collections/employees","POST",values({email:"hr@company.test"}),hr),400);assert.equal(rows("employees").length,before);
 });
 it("migrates usernames additively while preserving historical identifiers, passwords and links",()=>{
  const data={stores:[],zones:[],people:[],collections:{employees:[{id:"legacy",employeeCode:"OLD-CODE"}],accessUsers:[{id:"a",name:"Same Name",email:"old@migration.test",passwordHash:"existing",employeeId:"legacy"},{id:"b",name:"Same Name",username:"existing.username",passwordHash:"unchanged"}]}} as unknown as StoreData;
  assert.equal(migrateEmployeeIdentities(data),true);const accounts=data.collections.accessUsers as Row[];assert.ok(validUsername(accounts[0].username));assert.equal(accounts[0].passwordHash,"existing");assert.equal(accounts[0].employeeId,"legacy");assert.equal(accounts[1].username,"existing.username");assert.equal((data.collections.employees[0] as Row).employeeCode,"OLD-CODE");assert.equal(migrateEmployeeIdentities(data),false);
 });
 it("keeps employee codes server-generated through the existing approval workflow",async()=>{
  const rule=(await expect(await req("/workspace/access/approval-rules","POST",{section:"hr",action:"create",active:true}),201)).item;const input=values({name:"Approved New Employee",clientRequestId:randomUUID()});const queued=await expect(await req("/collections/employees","POST",input,hr),202);const duplicate=await expect(await req("/collections/employees","POST",input,hr),202);assert.equal(queued.request.id,duplicate.request.id);await expect(await req(`/workspace/approvals/${queued.request.id}`,"POST",{decision:"approve"}),200);const created=rows("employees").find(row=>row.name===input.name)!;assert.match(created.employeeCode,/^EMP-\d{4}-[A-F0-9]{8}$/);assert.equal(rows("accessUsers").filter(row=>row.employeeId===created.id).length,1);await expect(await req(`/workspace/access/approval-rules/${rule.id}`,"PATCH",{active:false}),200);
 });
});
