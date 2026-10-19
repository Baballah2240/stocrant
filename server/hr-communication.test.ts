import { TEST_DATA_DIR, establishFixtureAccount } from "./test-env.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { getStore, resetTestCache } from "./storage.js";
import { dispatchHrMessages } from "./hr-messages.js";
import { resetFailures } from "./rate-limit.js";

type Row = Record<string, any>;
let server: Server, base = "", main = "", hr = "", employeeCookie = "", employee: Row, second: Row, outside: Row, hrAccount: Row, companyId = "company-primary";
const rows = (key: string) => getStore().collections[key] as Row[];
const cookie = (response: Response) => response.headers.get("set-cookie")!.split(";")[0];
async function req(path: string, method = "GET", body?: unknown, owner = main) { if (path === "/auth/login") await establishFixtureAccount((body as { email?: unknown } | undefined)?.email);  return fetch(`${base}/api${path}`, { method, headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(owner ? { Cookie: owner } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
async function expect(response: Response, code: number) { assert.equal(response.status, code, await response.clone().text()); return response.json() as Promise<Row>; }
const employeeInput = (name: string, company = companyId, overrides: Row = {}) => ({ name, employeeCode: randomUUID(), email: `${randomUUID()}@hr.test`, organizationId: company, status: "active", employmentType:"full-time", hireDate: "2026-10-01", department: "Operations", jobTitle: "Associate", ...overrides });
async function createEmployee(name: string, company = companyId, overrides: Row = {}) { return (await expect(await req("/collections/employees", "POST", employeeInput(name, company, overrides), hr || main), 201)).item; }
const messageInput = (employeeIds: string[], overrides: Row = {}) => ({ title: "Tomorrow's shift", message: "Please arrive at the west entrance.", employeeIds, type: "Urgent Shift Change", priority: "Urgent", acknowledgmentRequired: true, requestKey: randomUUID(), ...overrides });
before(async () => {
  server = createApp().listen(0,"127.0.0.1"); await new Promise<void>(resolve => server.once("listening",resolve)); base = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const setup = await req("/auth/setup","POST",{ name:"HR Test Owner",email:"owner@hr.test",password:randomBytes(24).toString("hex"),setupKey:"local-setup" },""); await expect(setup,201); main = cookie(setup);
  const password = randomBytes(24).toString("hex"); hrAccount = (await expect(await req("/workspace/access/users","POST",{ name:"Scoped HR",email:"manager@hr.test",password,roleId:"role-manager",organizationIds:[companyId] }),201)).item;
  await expect(await req(`/workspace/access/users/${hrAccount.id}`,"PATCH",{permissions:["hr.view","hr.create","hr.edit"]}),200);
  const login = await req("/auth/login","POST",{email:"manager@hr.test",password},""); await expect(login,200); hr = cookie(login);
});
after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); const target = resolve(TEST_DATA_DIR); assert.ok(target.startsWith(resolve(tmpdir())+sep) && target.includes("stocrant-test-data-")); rmSync(target,{recursive:true,force:true}); });
describe("Transactional employee accounts and private HR communication", () => {
  it("automatically creates one least-privileged account and rejects privilege injection and duplicate submissions", async () => {
    const input = employeeInput("New employee",companyId,{ roleId:"role-main-manager",permissions:["*"],accountId:"spoof" });
    employee = (await expect(await req("/collections/employees","POST",input,hr),201)).item;
    const accounts = rows("accessUsers").filter(row=>row.employeeId===employee.id); assert.equal(accounts.length,1);
    assert.equal(accounts[0].roleId,"role-employee"); assert.deepEqual(accounts[0].permissions,["hr.view"]); assert.equal(accounts[0].ownRecordsOnly,true); assert.equal(accounts[0].status,"invited"); assert.equal(employee.accountId,accounts[0].id); assert.deepEqual(accounts[0].organizationIds,[companyId]);
    await expect(await req("/collections/employees","POST",input,hr),409); assert.equal(rows("accessUsers").filter(row=>row.employeeId===employee.id).length,1);
    await expect(await req(`/collections/employees/${employee.id}`,"PATCH",{jobTitle:"Senior associate"},hr),200); assert.equal(rows("accessUsers").filter(row=>row.employeeId===employee.id).length,1);
  });
  it("rolls back employee and account changes when account creation fails", async () => {
    const beforeEmployees=rows("employees").length, beforeAccounts=rows("accessUsers").length;
    await expect(await req("/collections/employees","POST",employeeInput("Conflicting account",companyId,{email:"manager@hr.test"}),hr),400);
    assert.equal(rows("employees").length,beforeEmployees); assert.equal(rows("accessUsers").length,beforeAccounts);
  });
  it("supports missing contact data through a private expiring invitation and password setup", async () => {
    second = await createEmployee("No contact employee",companyId,{email:"",phone:""});
    const invitation = await expect(await req(`/workspace/hr/communication/employees/${second.id}/invitation`,"POST",undefined,hr),200);
    assert.equal(invitation.token.length,43); assert.ok(!JSON.stringify(getStore()).includes(invitation.token),"Plain activation token must never be persisted");
    const password = randomBytes(24).toString("hex");
    await expect(await req("/auth/activate-employee","POST",{token:invitation.token,email:"no-contact@hr.test",password},""),200);
    await expect(await req("/auth/activate-employee","POST",{token:invitation.token,email:"no-contact@hr.test",password},""),400);
    const login = await req("/auth/login","POST",{email:"no-contact@hr.test",password},""); await expect(login,200); employeeCookie = cookie(login);
    assert.equal(rows("accessUsers").find(row=>row.employeeId===second.id)!.status,"active");
  });
  it("invalidates replaced and expired invitations and requires the assigned email", async () => {
    const path=`/workspace/hr/communication/employees/${employee.id}/invitation`;
    const first=await expect(await req(path,"POST",undefined,hr),200); const next=await expect(await req(path,"POST",undefined,hr),200);
    const password=randomBytes(24).toString("hex");
    await expect(await req("/auth/activate-employee","POST",{token:first.token,email:employee.email,password},""),400);
    await expect(await req("/auth/activate-employee","POST",{token:next.token,email:"wrong@hr.test",password},""),400);
    rows("employeeInvitations").find(row=>row.accountId===employee.accountId)!.expiresAt="2000-01-01T00:00:00Z";
    await expect(await req("/auth/activate-employee","POST",{token:next.token,email:employee.email,password},""),400);
    resetFailures();
  });
  it("blocks cross-company recipients, invitations, reads, and employee management APIs", async () => {
    const parent=rows("companies")[0].parentOrganizationId;
    const company=(await expect(await req("/collections/companies","POST",{name:"Foreign HR company",parentOrganizationId:parent,organizationType:"office",industry:"services",status:"active",currency:"QAR"}),201)).item;
    outside=(await expect(await req("/collections/employees","POST",employeeInput("Foreign employee",company.id)),201)).item;
    assert.equal((await req(`/workspace/hr/communication/employees/${outside.id}/invitation`,"POST",undefined,hr)).status,404);
    assert.equal((await req("/workspace/hr/communication/messages","POST",messageInput([outside.id]),hr)).status,403);
    assert.equal((await req("/workspace/hr/communication/employees","GET",undefined,employeeCookie)).status,403);
    const directory=await expect(await req("/workspace/hr/communication/employees","GET",undefined,hr),200); assert.ok(directory.employees.every((row:Row)=>row.organizationId===companyId)); assert.ok(!JSON.stringify(directory).includes("passwordHash"));
  });
  it("sends idempotent persistent urgent alerts without modifying official shifts", async () => {
    const shifts=JSON.stringify(getStore().collections.attendance); const payload=messageInput([second.id],{ effectiveAt:"2026-10-20T06:00:00Z",shiftTime:"09:00–17:00",location:"West entrance" });
    const sent=await expect(await req("/workspace/hr/communication/messages","POST",payload,hr),201); assert.equal(sent.status,"sent");
    await expect(await req("/workspace/hr/communication/messages","POST",payload,hr),200);
    const notices=rows("notifications").filter(row=>row.target===sent.id); assert.equal(notices.length,1); assert.equal(notices[0].deliveredAt,undefined); assert.equal(notices[0].priority,"Urgent");
    assert.equal(JSON.stringify(getStore().collections.attendance),shifts);
    resetTestCache(); assert.equal(rows("notifications").filter(row=>row.target===sent.id).length,1);
    const list=await expect(await req("/notifications","GET",undefined,employeeCookie),200); assert.ok(list.items.some((row:Row)=>row.id===notices[0].id && row.deliveredAt));
    const foreignNotice = rows("notifications").find(row=>row.id===notices[0].id)!; assert.equal((await req(`/notifications/${foreignNotice.id}/read`,"POST",undefined,hr)).status,404);
  });
  it("tracks read and acknowledgment timestamps, retains HR history, and supports reminders", async () => {
    const notice=rows("notifications").find(row=>row.userId===rows("accessUsers").find(row=>row.employeeId===second.id)!.id && row.type==="hr_message")!;
    await expect(await req(`/notifications/${notice.id}/read`,"POST",undefined,employeeCookie),200);
    let history=await expect(await req("/workspace/hr/communication/messages","GET",undefined,hr),200); assert.equal(history.items[0].recipients[0].status,"read");
    await expect(await req(`/workspace/hr/communication/messages/${notice.target}/remind`,"POST",undefined,hr),200);
    assert.equal(rows("notifications").find(row=>row.id===notice.id)!.read,false);
    await expect(await req(`/workspace/hr/communication/messages/${notice.target}/remind`,"POST",undefined,hr),429);
    await expect(await req(`/notifications/${notice.id}/acknowledge`,"POST",undefined,employeeCookie),200);
    const ack=rows("notifications").find(row=>row.id===notice.id)!.acknowledgedAt;
    await expect(await req(`/notifications/${notice.id}/acknowledge`,"POST",undefined,employeeCookie),200); assert.equal(rows("notifications").find(row=>row.id===notice.id)!.acknowledgedAt,ack);
    history=await expect(await req("/workspace/hr/communication/messages","GET",undefined,hr),200); assert.equal(history.items[0].recipients[0].status,"acknowledged");
    await expect(await req(`/notifications/${notice.id}`,"DELETE",undefined,employeeCookie),409);
  });
  it("validates meeting links and schedules messages durably without early delivery", async () => {
    for(const url of ["javascript:alert(1)","http://meeting.test","https://user:password@meeting.test"]) await expect(await req("/workspace/hr/communication/messages","POST",messageInput([second.id],{url}),hr),400);
    const at=new Date(Date.now()+3600000); const campaign=await expect(await req("/workspace/hr/communication/messages","POST",messageInput([second.id],{type:"Meeting Invitation",url:"https://meet.google.com/abc-defg-hij",scheduledAt:at.toISOString()}),hr),201);
    assert.equal(campaign.status,"scheduled"); assert.ok(!rows("notifications").some(row=>row.target===campaign.id)); resetTestCache(); dispatchHrMessages(new Date(at.getTime()+1));
    assert.equal(rows("notifications").filter(row=>row.target===campaign.id).length,1); assert.equal(rows("notifications").find(row=>row.target===campaign.id)!.url,"https://meet.google.com/abc-defg-hij");
  });
  it("revalidates scheduled sender permissions before sending", async () => {
    const at=new Date(Date.now()+7200000); const campaign=await expect(await req("/workspace/hr/communication/messages","POST",messageInput([second.id],{scheduledAt:at.toISOString()}),hr),201);
    await expect(await req(`/workspace/access/users/${hrAccount.id}`,"PATCH",{permissions:["hr.view"]}),200); dispatchHrMessages(new Date(at.getTime()+1));
    assert.equal(rows("hrMessages").find(row=>row.id===campaign.id)!.status,"blocked"); assert.ok(!rows("notifications").some(row=>row.target===campaign.id));
    await expect(await req(`/workspace/access/users/${hrAccount.id}`,"PATCH",{permissions:["hr.view","hr.create","hr.edit"]}),200);
  });
  it("revokes existing sessions on employee termination and preserves history", async () => {
    await expect(await req(`/collections/employees/${second.id}`,"PATCH",{status:"terminated"},hr),200);
    assert.equal((await req("/notifications","GET",undefined,employeeCookie)).status,401);
    assert.equal(rows("accessUsers").find(row=>row.employeeId===second.id)!.status,"suspended"); assert.ok(rows("notifications").some(row=>row.userId===second.accountId));
    await expect(await req(`/collections/employees/${second.id}`,"PATCH",{status:"active"},hr),200); assert.equal(rows("accessUsers").find(row=>row.employeeId===second.id)!.status,"suspended");
    assert.ok(rows("auditLog").some(row=>row.action==="access.employee-account-suspended"));
  });
  it("creates employee accounts only after approval when HR approval rules apply", async () => {
    const rule=(await expect(await req("/workspace/access/approval-rules","POST",{section:"hr",action:"create",active:true}),201)).item;
    const input=employeeInput("Approval employee");
    const queued=await expect(await req("/collections/employees","POST",input,hr),202);
    assert.ok(!rows("employees").some(row=>row.employeeCode===input.employeeCode));
    assert.ok(!rows("accessUsers").some(row=>row.email===input.email));
    await expect(await req(`/workspace/approvals/${queued.request.id}`,"POST",{decision:"approve"}),200);
    const created=rows("employees").find(row=>row.email===input.email)!;
    assert.match(String(created.employeeCode), /^EMP-\d{4}-[A-F0-9]{8}$/);
    assert.equal(rows("accessUsers").filter(row=>row.employeeId===created.id).length,1);
    await expect(await req(`/workspace/approvals/${queued.request.id}`,"POST",{decision:"approve"}),400);
    await expect(await req(`/workspace/access/approval-rules/${rule.id}`,"PATCH",{active:false}),200);
  });
});
