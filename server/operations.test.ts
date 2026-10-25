import { TEST_DATA_DIR, establishFixtureAccount } from "./test-env.js";
import { before,after,describe,it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { rmSync,readFileSync } from "node:fs";
import { join,resolve,sep } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { getStore,saveStore,transaction } from "./storage.js";
import { dispatchTaskDeadlines, taskOverdue } from "./operations.js";
import { mutateCollection } from "./workspace.js";
import { migrateOperations } from "./operations-migration.js";
type Row=Record<string,any>;
let server:Server,base="",main="",one="",two="",other="",userOne:Row,userTwo:Row,task:Row;
const rows=(name:string)=>getStore().collections[name] as Row[];
const secret=()=>randomBytes(24).toString("hex");
const cookie=(r:Response)=>r.headers.get("set-cookie")!.split(";")[0];
async function req(path:string,body?:unknown,session=main,method=body===undefined?"GET":"POST"){
 return fetch(base+"/api"+path,{method,headers:{Cookie:session,...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function expect(r:Response,code=200):Promise<Row>{assert.equal(r.status,code,await r.clone().text());return r.json() as Promise<Row>;}
const create=(extra:Row={})=>({title:"Shared operations task",description:"Inspect and report",organizationId:"company-primary",assignmentMode:"multiple",assigneeIds:["task-one","task-two"],priority:"High",startDate:"2026-10-01",dueDate:"2026-10-31",checklist:[{id:"check-1",text:"Inspect equipment"}],reviewRequired:true,clientRequestId:secret(),...extra});
const actor=()=>({...rows("accessUsers").find(a=>a.roleId==="role-main-manager"),organizationIds:[],locationIds:[],ownRecordsOnly:false}) as any;
async function makeUser(employeeId:string,email:string){const password=secret();const item=(await expect(await req("/workspace/access/users",{name:email,email,password,roleId:"role-employee",organizationIds:["company-primary"],employeeId}),201)).item;await establishFixtureAccount(email);const r=await req("/auth/login",{email,password},"");await expect(r);return {cookie:cookie(r),item};}
before(async()=>{
 server=createApp().listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const setup=await req("/auth/setup",{name:"Task manager",email:"tasks@example.test",password:secret(),setupKey:"local-setup"},"");await expect(setup,201);main=cookie(setup);
 getStore().collections.employees.push(...[["task-one","One","team-one","st-001"],["task-two","Two","team-one","st-002"],["task-other","Other","team-two","st-001"]].map(([id,name,departmentId,locationId])=>({id,name,employeeCode:id.toUpperCase(),organizationId:"company-primary",departmentId,locationId,status:"active",salary:5000})),{id:"task-foreign",employeeCode:"TASK-FOREIGN",name:"Foreign employee",organizationId:"foreign-company",status:"active"});
 getStore().collections.departments.push({id:"team-one",name:"Inspection",organizationId:"company-primary"},{id:"team-two",name:"Other team",organizationId:"company-primary"});saveStore(getStore());
 const a=await makeUser("task-one","one@task.test"),b=await makeUser("task-two","two@task.test"),c=await makeUser("task-other","other@task.test");one=a.cookie;two=b.cookie;other=c.cookie;userOne=a.item;userTwo=b.item;
});
after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));const target=resolve(TEST_DATA_DIR);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes("stocrant-test-data-"));rmSync(target,{recursive:true,force:true});});
describe("Smart operations shared workflow",()=>{
 it("resolves company, team, individual and multi-person assignments into one task each",async()=>{
   for(const [mode,assigneeIds,count] of [["company",[],3],["team",[],2],["individual",["task-one"],1],["multiple",["task-one","task-two"],2]] as const){
     const input=create({assignmentMode:mode,assigneeIds,departmentId:mode==="team"?"team-one":""}),before=rows("workItems").length;
     const replies=await Promise.all([req("/workspace/tasks",input),req("/workspace/tasks",input)]),a=await expect(replies[0],201),b=await expect(replies[1],201);assert.equal(a.item.id,b.item.id);assert.equal(rows("workItems").length,before+1);assert.equal(a.item.assignments.length,count);
     await expect(await req("/workspace/tasks",{...input,title:"Different retry"}),409);
     if(mode==="multiple")task=a.item;
   }
   await expect(await req("/workspace/tasks",create({assigneeIds:["task-foreign"]})),400);await expect(await req("/workspace/tasks",create({dueDate:"2026-02-30"})),400);await expect(await req("/workspace/tasks",create({startDate:"2026-11-01"})),400);await expect(await req("/workspace/tasks",create(),one),400);
 });
 it("preserves individual and location scope without exposing private employee information",async()=>{
   const account=rows("accessUsers").find(a=>a.id===userTwo.id)!;account.locationIds=["st-002"];saveStore(getStore());
   for(const session of [one,two]){const detail=await expect(await req(`/workspace/tasks/${task.id}`,undefined,session));assert.equal(detail.permissions.update,true);assert.equal(detail.permissions.manage,false);assert.equal(detail.people.length,2);assert.ok(!JSON.stringify(detail.people).includes("salary"));}
   const dashboard=await expect(await req("/workspace/tasks",undefined,two));assert.ok(dashboard.items.some((t:Row)=>t.id===task.id));assert.ok(dashboard.employees.every((e:Row)=>!Object.hasOwn(e,"salary")));
   await expect(await req(`/workspace/tasks/${task.id}`,undefined,other),404);await expect(await req(`/workspace/work/${task.id}`,{title:"Hijack task"},one,"PATCH"),403);await expect(await req(`/workspace/tasks/${task.id}/manage`,{action:"cancel",version:task.version,reason:"Unauthorized cancellation"},one),403);
 });
 it("stores independent contributions, prevents stale overwrites and requires each checklist",async()=>{
   const input={version:task.version,status:"In Progress",progress:30,completedChecklistIds:[],message:"Initial inspection",kind:"progress",clientRequestId:secret()};
   const replies=await Promise.all([req(`/workspace/tasks/${task.id}/contribution`,input,one),req(`/workspace/tasks/${task.id}/contribution`,{...input,progress:40,clientRequestId:secret()},two)]);assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);task=(await expect(replies.find(r=>r.status===200)!)).item;
   await expect(await req(`/workspace/tasks/${task.id}/contribution`,{...input,version:task.version,status:"Completed",clientRequestId:secret()},one),400);
   const complete={version:task.version,status:"Completed",progress:100,completedChecklistIds:["check-1"],message:"Inspection complete",clientRequestId:secret()};const first=await expect(await req(`/workspace/tasks/${task.id}/contribution`,complete,one));task=first.item;assert.notEqual(task.status,"Completed");assert.equal(task.assignments.find((a:Row)=>a.employeeId==="task-two").status,task.assignments[1].status);
   const replay=await expect(await req(`/workspace/tasks/${task.id}/contribution`,complete,one));assert.equal(replay.item.version,task.version);
   task=(await expect(await req(`/workspace/tasks/${task.id}/contribution`,{...complete,version:task.version,clientRequestId:secret()},two))).item;assert.equal(task.status,"Awaiting Approval");assert.equal(task.progress,100);
   await expect(await req(`/workspace/tasks/${task.id}/contribution`,{...complete,version:task.version,clientRequestId:secret()},one),409);
 });
 it("supports review, rework, blockers and extension requests with immutable history",async()=>{
   task=(await expect(await req(`/workspace/tasks/${task.id}/manage`,{version:task.version,action:"rework",reason:"Add supporting evidence"}))).item;assert.equal(task.status,"In Progress");
   const due=task.dueDate;task=(await expect(await req(`/workspace/tasks/${task.id}/contribution`,{version:task.version,status:"Blocked",progress:50,completedChecklistIds:["check-1"],kind:"extension",requestedDueDate:"2026-11-05",message:"Waiting for replacement parts",clientRequestId:secret()},one))).item;assert.equal(task.status,"Blocked");assert.equal(task.dueDate,due);
   task=(await expect(await req(`/workspace/tasks/${task.id}/manage`,{version:task.version,action:"edit",dueDate:"2026-11-05",priority:"Urgent",reason:"Extension accepted"}))).item;assert.equal(task.dueDate,"2026-11-05");
   for(const session of [one,two])task=(await expect(await req(`/workspace/tasks/${task.id}/contribution`,{version:task.version,status:"Completed",progress:100,completedChecklistIds:["check-1"],message:"Evidence attached",clientRequestId:secret()},session))).item;
   task=(await expect(await req(`/workspace/tasks/${task.id}/manage`,{version:task.version,action:"approve",reason:"Work verified"}))).item;assert.equal(task.status,"Completed");
   const events=rows("workActivity").filter(e=>e.workItemId===task.id);assert.ok(events.some(e=>e.kind==="extension"&&e.requestedDueDate==="2026-11-05"));assert.ok(events.some(e=>e.kind==="approve"&&e.completionTransition));
   assert.throws(()=>mutateCollection(actor(),"workActivity","edit",{message:"Forged"},events[0].id),/immutable/);
 });
 it("keeps comments, mentions and replies scoped, ordered and retry-safe",async()=>{
   const input={message:"Please check the evidence",mentionIds:[userTwo.id],clientRequestId:secret()};const comment=(await expect(await req(`/workspace/tasks/${task.id}/comments`,input,one),201)).item;
   assert.equal((await expect(await req(`/workspace/tasks/${task.id}/comments`,input,one),201)).item.id,comment.id);
   await expect(await req(`/workspace/tasks/${task.id}/comments`,{...input,mentionIds:["foreign-user"],clientRequestId:secret()},one),400);await expect(await req(`/workspace/tasks/${task.id}/comments`,{...input,createdBy:"Someone else"},one),400);
   const reply=(await expect(await req(`/workspace/tasks/${task.id}/comments`,{message:"Checked",replyTo:comment.id,clientRequestId:secret()},two),201)).item;assert.equal(reply.replyTo,comment.id);
   const data=await expect(await req(`/workspace/tasks/${task.id}`,undefined,two));const ids=data.activity.map((e:Row)=>e.id);assert.ok(ids.indexOf(comment.id)<ids.indexOf(reply.id));
   const notification=rows("notifications").find(n=>n.userId===userTwo.id&&n.target===`task:${task.id}`)!;const context=await expect(await req(`/notifications/${notification.id}`,undefined,two));assert.equal(context.link.to,`/operations/work/${task.id}`);
 });
 it("uploads validated private files once and refuses unrelated downloads",async()=>{
   const bytes=Buffer.from("%PDF-1.4\nTest evidence\n%%EOF");const upload=()=>fetch(`${base}/api/workspace/tasks/${task.id}/files`,{method:"POST",headers:{Cookie:one,"Content-Type":"application/octet-stream","X-File-Name":"evidence.pdf"},body:bytes});
   const first=(await expect(await upload(),201)).file,second=(await expect(await upload(),201)).file;assert.equal(first.id,second.id);assert.equal(rows("workFiles").filter(f=>f.workItemId===task.id).length,1);
   const download=await req(`/workspace/tasks/${task.id}/files/${first.id}`,undefined,two);assert.equal(download.status,200);assert.ok(download.headers.get("cache-control")?.includes("no-store"));assert.equal(Buffer.from(await download.arrayBuffer()).toString(),bytes.toString());
   await expect(await req(`/workspace/tasks/${task.id}/files/${first.id}`,undefined,other),404);
   const invalid=await fetch(`${base}/api/workspace/tasks/${task.id}/files`,{method:"POST",headers:{Cookie:one,"Content-Type":"application/octet-stream","X-File-Name":"fake.png"},body:bytes});await expect(invalid,400);
 });
 it("reassigns without duplicates or loss of past contributions and revokes removed access",async()=>{
   task=(await expect(await req(`/workspace/tasks/${task.id}/manage`,{version:task.version,action:"reopen",reason:"New inspection cycle"}))).item;
   task=(await expect(await req(`/workspace/tasks/${task.id}/manage`,{version:task.version,action:"reassign",assignmentMode:"multiple",assigneeIds:["task-two","task-other"],departmentId:"",reason:"Transfer responsibility"}))).item;assert.equal(task.assignments.length,2);assert.ok(rows("workActivity").some(e=>e.workItemId===task.id&&e.kind==="reassign"&&e.before.assignments.some((a:Row)=>a.employeeId==="task-one")));
   await expect(await req(`/workspace/tasks/${task.id}`,undefined,one),404);const old=rows("notifications").find(n=>n.userId===userOne.id&&n.target===`task:${task.id}`)!;assert.equal((await expect(await req(`/notifications/${old.id}`,undefined,one))).link,undefined);
   await expect(await req(`/workspace/tasks/${task.id}`,undefined,other));
 });
 it("deduplicates approaching and overdue deadlines and never treats a missing deadline as overdue",()=>{
   assert.equal(Boolean(taskOverdue({status:"Pending"})),false);const before=rows("notifications").length;dispatchTaskDeadlines(actor(),new Date("2026-11-04T12:00:00Z"));const first=rows("notifications").length;dispatchTaskDeadlines(actor(),new Date("2026-11-04T12:00:00Z"));assert.equal(rows("notifications").length,first);assert.ok(first>before);dispatchTaskDeadlines(actor(),new Date("2026-11-06T12:00:00Z"));const second=rows("notifications").length;dispatchTaskDeadlines(actor(),new Date("2026-11-06T12:00:00Z"));assert.equal(rows("notifications").length,second);assert.ok(second>first);
 });
 it("retains configured creation approvals and revalidates recipients before publication",async()=>{
   getStore().collections.approvalRules.push({id:"task-approval-rule",section:"operations",action:"create",active:true});saveStore(getStore());
   const password=secret(),manager=(await expect(await req("/workspace/access/users",{name:"Task preparer",email:"preparer@task.test",password,roleId:"role-manager",organizationIds:["company-primary"]}),201)).item;await establishFixtureAccount(manager.email);const login=await req("/auth/login",{email:manager.email,password},"");await expect(login);const session=cookie(login);
   const input=create({assignmentMode:"individual",assigneeIds:["task-other"]}),before=rows("workItems").length;const pending=await expect(await req("/workspace/tasks",input,session),202);assert.equal(rows("workItems").length,before);assert.equal((await expect(await req("/workspace/tasks",input,session),202)).request.id,pending.request.id);
   await expect(await req(`/workspace/approvals/${pending.request.id}`,{decision:"approve",note:"Checked recipients"}));assert.equal(rows("workItems").length,before+1);assert.equal((await expect(await req("/workspace/tasks",input,session),201)).item.createdBy,manager.id);
   const ownInput=create({assignmentMode:"individual",assigneeIds:["task-one"]});
   const ownPending=await expect(await req("/workspace/tasks",ownInput,one),202);await expect(await req(`/workspace/approvals/${ownPending.request.id}`,{decision:"approve",note:"Personal assignment reviewed"}));
   const ownPublished=(await expect(await req("/workspace/tasks",ownInput,one),201)).item;
   await expect(await req(`/workspace/tasks/${ownPublished.id}/manage`,{version:ownPublished.version,action:"reassign",assignmentMode:"individual",assigneeIds:["task-other"],departmentId:"",reason:"Manager transfers this responsibility"}));
   await expect(await req("/workspace/tasks",ownInput,one),404);
   getStore().collections.approvalRules=rows("approvalRules").filter(r=>r.id!=="task-approval-rule");saveStore(getStore());
 });
 it("migrates additively and persists complete task relationships without replacing legacy records",()=>{
   const data={stores:[],zones:[],people:[],collections:{workItems:[{id:"legacy",title:"Existing task"}]}} as any;const before=JSON.stringify(data.collections.workItems);assert.equal(migrateOperations(data),true);assert.equal(migrateOperations(data),false);assert.equal(JSON.stringify(data.collections.workItems),before);
   const disk=JSON.parse(readFileSync(join(TEST_DATA_DIR,"data","stocrant.json"),"utf8"));assert.equal(disk.collections.workItems.find((t:Row)=>t.id===task.id).assignments.length,2);
   const snapshot=JSON.stringify(getStore());assert.throws(()=>transaction(()=>{getStore().collections.workItems=[];saveStore(getStore());throw Error("Rollback task changes");}),/Rollback/);assert.equal(JSON.stringify(getStore()),snapshot);
 });
 it("retains self-assigned work and denies writes after an assignee becomes view-only",async()=>{
   const personal=(await expect(await req("/workspace/tasks",create({title:"Personal task",assignmentMode:"individual",assigneeIds:["task-one"],reviewRequired:false}),one),201)).item;
   await expect(await req(`/workspace/tasks/${personal.id}/manage`,{version:personal.version,action:"reassign",assignmentMode:"individual",assigneeIds:["task-other"],reason:"Cannot widen my scope"},one),400);
   rows("accessUsers").find(a=>a.id===userOne.id)!.permissions=["operations.view"];saveStore(getStore());
   await expect(await req(`/workspace/tasks/${personal.id}/contribution`,{version:personal.version,status:"Completed",progress:100,completedChecklistIds:["check-1"],clientRequestId:secret()},one),403);
   await expect(await req(`/workspace/tasks/${personal.id}/comments`,{message:"Read only cannot write",clientRequestId:secret()},one),403);
   delete rows("accessUsers").find(a=>a.id===userOne.id)!.permissions;saveStore(getStore());
   const complete=(await expect(await req(`/workspace/tasks/${personal.id}/contribution`,{version:personal.version,status:"Completed",progress:100,completedChecklistIds:["check-1"],clientRequestId:secret()},one))).item;assert.equal(complete.status,"Completed");
 });
 it("keeps create permissions independent of edit grants and restricts department-wide assignment",async()=>{
   getStore().collections.accessRoles.push({id:"task-create-only",permissions:["operations.view","operations.create"],ownRecordsOnly:false},{id:"task-team-manager",permissions:["operations.*"],scope:"department",departmentIds:["team-one"]});
   rows("accessUsers").find(a=>a.id===userOne.id)!.roleId="task-create-only";saveStore(getStore());
   const index=await expect(await req("/workspace/tasks",undefined,one));assert.equal(index.permissions.create,true);assert.equal(index.permissions.manage,false);
   const created=(await expect(await req("/workspace/tasks",create({reviewRequired:false}),one),201)).item;await expect(await req(`/workspace/tasks/${created.id}/manage`,{version:created.version,action:"cancel",reason:"No edit permission"},one),403);
   rows("accessUsers").find(a=>a.id===userOne.id)!.roleId="task-team-manager";saveStore(getStore());
   await expect(await req("/workspace/tasks",create({assignmentMode:"company",assigneeIds:[]}),one),400);
   const team=(await expect(await req("/workspace/tasks",create({assignmentMode:"team",departmentId:"team-one",assigneeIds:[]}),one),201)).item;assert.equal(team.assignments.length,2);
   rows("accessUsers").find(a=>a.id===userOne.id)!.roleId="role-employee";saveStore(getStore());
 });
 it("keeps manager edits under configured approval rules and rejects stale approvals",async()=>{
   const manager=rows("accessUsers").find(a=>a.email==="preparer@task.test")!;
   const password=secret();const {hashPassword}=await import("./auth.js");manager.passwordHash=await hashPassword(password);saveStore(getStore());const login=await req("/auth/login",{email:manager.email,password,closeOtherSessions:true},"");await expect(login);const session=cookie(login);
   getStore().collections.approvalRules.push({id:"task-edit-rule",section:"operations",action:"edit",active:true});saveStore(getStore());
   const created=(await expect(await req("/workspace/tasks",create({assignmentMode:"individual",assigneeIds:["task-other"],reviewRequired:false}),session),201)).item;assert.equal(created.reviewRequired,true);
   const pending=await expect(await req(`/workspace/tasks/${created.id}/manage`,{version:created.version,action:"edit",title:"Approved management change",reason:"Manager requests a title change"},session),202);assert.notEqual(rows("workItems").find(t=>t.id===created.id)!.title,"Approved management change");
   await expect(await req(`/workspace/approvals/${pending.request.id}`,{decision:"approve",note:"Manager change verified"}));assert.equal(rows("workItems").find(t=>t.id===created.id)!.title,"Approved management change");
   const current=rows("workItems").find(t=>t.id===created.id)!;
   const stale=await expect(await req(`/workspace/tasks/${created.id}/manage`,{version:current.version,action:"edit",priority:"Urgent",reason:"Pending change before contribution"},session),202);
   await expect(await req(`/workspace/tasks/${created.id}/contribution`,{version:current.version,status:"In Progress",progress:20,completedChecklistIds:[],message:"New work after the manager request",clientRequestId:secret()},other));
   await expect(await req(`/workspace/approvals/${stale.request.id}`,{decision:"approve",note:"Must refuse a stale task version"}),409);assert.equal(rows("approvalRequests").find(r=>r.id===stale.request.id)!.status,"pending");
   await expect(await req(`/workspace/approvals/${stale.request.id}`,{decision:"reject",note:"Prepare an updated request"}));
   getStore().collections.approvalRules=rows("approvalRules").filter(r=>r.id!=="task-edit-rule");saveStore(getStore());
 });
 it("upgrades a legacy task in place while keeping notes, comments and links",async()=>{
   const legacy={id:"task-legacy-upgrade",title:"Legacy linked task",organizationId:"company-primary",assigneeIds:["task-other"],assigneeId:"task-other",status:"In Progress",progress:25,createdBy:actor().id};getStore().collections.workItems.push(legacy);getStore().collections.companyNotes.push({id:"legacy-linked-note",organizationId:"company-primary",workItemId:legacy.id,body:"Preserve note"});saveStore(getStore());
   const before=rows("workItems").length;const upgraded=(await expect(await req(`/workspace/tasks/${legacy.id}/manage`,{version:1,action:"upgrade",assignmentMode:"individual",assigneeIds:["task-other"],reason:"Enable individual contribution tracking"}))).item;assert.equal(upgraded.id,legacy.id);assert.equal(upgraded.taskVersion,2);assert.equal(upgraded.assignments[0].progress,25);assert.equal(rows("workItems").length,before);assert.equal(rows("companyNotes").find(n=>n.id==="legacy-linked-note")!.workItemId,legacy.id);
 });
});
