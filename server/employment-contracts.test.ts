import {TEST_DATA_DIR} from "./test-env.js";
import {after,before,describe,it} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {rmSync} from "node:fs";
import type {Server} from "node:http";
import {createApp} from "./app.js";
import {getCollection,resetTestCache} from "./storage.js";
type Row=Record<string,any>;
let server:Server,base:string,root="",hr="",manager="",employeeSession="",peer="",foreign="",staff="",employee:Row,otherCompany:Row,contract:Row;
const pdf=Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
const cookie=(response:Response)=>response.headers.get("set-cookie")!.split(";")[0];
async function req(path:string,method="GET",body?:unknown,session=root){return fetch(base+"/api"+path,{method,headers:{Cookie:session,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});}
async function json(response:Response,status=200):Promise<Row>{assert.equal(response.status,status,await response.clone().text());return response.json() as Promise<Row>;}
async function account(roleId:string,companyId="company-primary",employeeId=""){
 const email=randomUUID()+"@contracts.test",temporary=randomUUID()+randomUUID(),password=randomUUID()+randomUUID();const existing=employeeId&&(getCollection("accessUsers") as Row[]).find(a=>a.employeeId===employeeId);
 const body={name:roleId,email,password:temporary,roleId,organizationIds:[companyId],...(employeeId?{employeeId}:{}),status:"active"};if(existing)await json(await req(`/workspace/access/users/${existing.id}`,"PATCH",body));else await json(await req("/workspace/access/users","POST",body),201);
 let login=await req("/auth/login","POST",{email,password:temporary},"");await json(login);const first=cookie(login);await json(await req("/auth/password","POST",{currentPassword:temporary,newPassword:password},first));login=await req("/auth/login","POST",{email,password},"");await json(login);return cookie(login);
}
async function upload(session=hr,companyId="company-primary",bytes=pdf,name="employment.pdf"){return fetch(base+"/api/workspace/contracts/uploads",{method:"POST",headers:{Cookie:session,"Content-Type":"application/octet-stream","X-Document-Company":companyId,"X-File-Name":name},body:bytes});}
const path=()=>`/workspace/contracts/employees/${employee.id}`;
before(async()=>{
 server=createApp().listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));base=`http://127.0.0.1:${(server.address() as any).port}`;
 const setup=await req("/auth/setup","POST",{name:"Contract owner",email:"owner@contracts.test",password:randomUUID()+randomUUID(),setupKey:"local-setup"},"");await json(setup,201);root=cookie(setup);
 const primary=(getCollection("companies") as Row[]).find(c=>c.id==="company-primary")!;
 otherCompany=(await json(await req("/collections/companies","POST",{name:"Other contracts company",parentOrganizationId:primary.parentOrganizationId,organizationType:"office",industry:"services",currency:"QAR",status:"active"}),201)).item;
 employee=(await json(await req("/collections/employees","POST",{name:"Contract Employee",email:"employee@contracts.test",organizationId:"company-primary",hireDate:"2026-01-01",employmentType:"full-time",status:"active"}),201)).item;
 hr=await account("role-hr-manager");manager=await account("role-company-manager");staff=await account("role-hr-staff");foreign=await account("role-company-manager",otherCompany.id);employeeSession=await account("role-employee","company-primary",employee.id);peer=await account("role-employee");
});
after(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));assert.ok(TEST_DATA_DIR.includes("stocrant-test-data-"));rmSync(TEST_DATA_DIR,{recursive:true,force:true});});
describe("HR-only employee contract lifecycle",()=>{
 it("lists every scoped employee and restricts authorship, uploads and alternative mutation routes",async()=>{
  const list=await json(await req("/workspace/contracts","GET",undefined,hr));assert.ok(list.items.some((i:Row)=>i.employee.id===employee.id&&!i.contract));assert.ok(list.items.every((i:Row)=>i.employee.organizationId==="company-primary"));
  await json(await upload(manager),403);await json(await upload(staff),403);await json(await upload(hr,otherCompany.id),403);await json(await upload(hr,"company-primary",Buffer.from("not pdf")),400);
  const input={version:0,title:"Employment contract",reference:"CONTRACT-01",issuedOn:"2026-01-01",expiresOn:"",notes:"Company contract",fileId:""};
  for(const session of [root,manager,staff,employeeSession])await json(await req(path(),"PUT",input,session),403);
  await json(await req("/collections/contracts","POST",input,hr),405);
  await json(await req("/workspace/documents","POST",{category:"employee",organizationId:"company-primary",employeeId:employee.id,type:"employment-contract",title:"Bypass",fileId:"",fileUrl:""},hr),403);
  const file=(await json(await upload(),201)).file;
  const saved=await json(await req(path(),"PUT",{...input,fileId:file.id},hr));contract=saved.item.contract;assert.equal(contract.status,"draft");
  await json(await req(path()+"/file","GET",undefined,employeeSession),404);await json(await req(path()+"/file?draft=1","GET",undefined,employeeSession),404);
  await json(await req(path(),"PUT",{...input,fileId:file.id},hr),409);
 });
 it("requires Company Manager approval, publishes the private PDF and notifies only the employee",async()=>{
  contract=(await json(await req(path()+"/submit","POST",{version:contract.version},hr))).item.contract;assert.equal(contract.status,"pending");
  await json(await req(path()+"/file","GET",undefined,employeeSession),404);
  const mine=await json(await req("/workspace/contracts/mine","GET",undefined,employeeSession));assert.equal(mine.item.contract.published,undefined);assert.equal(mine.item.contract.fileId,undefined);
  await json(await req(path()+"/decide","POST",{version:contract.version,decision:"approve",note:""},hr),400);
  await json(await req(path()+"/decide","POST",{version:contract.version,decision:"approve",note:""},root),403);
  await json(await req(path()+"/decide","POST",{version:contract.version,decision:"approve",note:""},foreign),404);
  const reviewed=await fetch(base+"/api"+path()+"/file?draft=1",{headers:{Cookie:manager}});assert.equal(reviewed.status,200);assert.deepEqual(Buffer.from(await reviewed.arrayBuffer()),pdf);
  contract=(await json(await req(path()+"/decide","POST",{version:contract.version,decision:"approve",note:"Company approval"},manager))).item.contract;
  const file=await fetch(base+"/api"+path()+"/file",{headers:{Cookie:employeeSession}});assert.equal(file.status,200);assert.equal(file.headers.get("content-type"),"application/pdf");assert.match(file.headers.get("cache-control")!,/no-store/);assert.deepEqual(Buffer.from(await file.arrayBuffer()),pdf);
  await json(await req(path()+"/file","GET",undefined,peer),404);
  const documents=await json(await req("/workspace/documents","GET",undefined,employeeSession));const published=documents.items.find((d:Row)=>d.contractId===contract.id);assert.ok(published);assert.equal(published.visibility,"employee");
  await json(await req(`/workspace/documents/${published.id}/archive`,"POST",{archived:true,version:published.version},hr),403);
  assert.ok((getCollection("notifications") as Row[]).some(n=>n.target===`employment-contract:${contract.id}`&&n.message.includes("ready to download")));
 });
 it("keeps the published version while HR revises, rejects stale approval and approves replacements through Approvals",async()=>{
  const original=contract.published.fileId,newFile=(await json(await upload(hr,"company-primary",Buffer.concat([pdf,Buffer.from("\n%new revision\n")])),201)).file;
  const values={version:contract.version,title:"Revised employment contract",reference:"CONTRACT-02",issuedOn:"2026-02-01",expiresOn:"",notes:"Revised by HR",fileId:newFile.id};
  contract=(await json(await req(path(),"PUT",values,hr))).item.contract;
  let mine=await json(await req("/workspace/contracts/mine","GET",undefined,employeeSession));assert.equal(mine.item.contract.published.fileId,original);assert.equal(mine.item.contract.title,undefined);
  contract=(await json(await req(path()+"/submit","POST",{version:contract.version},hr))).item.contract;const oldApproval=contract.approvalId;
  await json(await req(path(),"PUT",{...values,version:contract.version},hr),409);
  contract=(await json(await req(path()+"/withdraw","POST",{version:contract.version},hr))).item.contract;
  await json(await req(`/workspace/approvals/${oldApproval}`,"POST",{decision:"approve",note:"Stale review"},manager),400);
  contract=(await json(await req(path()+"/submit","POST",{version:contract.version},hr))).item.contract;
  await json(await req(`/workspace/approvals/${contract.approvalId}`,"POST",{decision:"reject",note:"Please review the PDF"},manager));
  contract=(await json(await req(path(),"GET",undefined,hr))).item.contract;assert.equal(contract.status,"rejected");
  contract=(await json(await req(path()+"/submit","POST",{version:contract.version},hr))).item.contract;
  await json(await req(`/workspace/approvals/${contract.approvalId}`,"POST",{decision:"approve",note:"Correct revision"},manager));
  resetTestCache();mine=await json(await req("/workspace/contracts/mine","GET",undefined,employeeSession));assert.equal(mine.item.contract.published.fileId,newFile.id);assert.notEqual(mine.item.contract.published.fileId,original);
  const documents=(getCollection("documents") as Row[]).find(d=>d.contractId===contract.id)!;assert.ok(documents.revisions.some((r:Row)=>r.fileId===original));
 });
});
