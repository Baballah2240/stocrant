import { TEST_DATA_DIR } from "./test-env.js";
import { after, before, it } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { hashPassword } from "./auth.js";
import { getCollection, getStore, saveStore } from "./storage.js";
import { resetFailures } from "./rate-limit.js";
import { settingsFor } from "./attendance.js";
import { rulesSchema } from "./payroll-model.js";

type Row = Record<string, any>;
const rows = (key: string) => getCollection(key) as Row[];
const password = "Amal-local-pilot-password-2026";
let server: Server, mail: Server, base = "", owner = "", delegated = "";
const sessions: Record<string, string> = {};
const roles = ["employee", "hr-manager", "general-manager", "finance-manager"];
let delivered: Row[] = [];
async function call(path: string, method = "GET", body?: unknown, cookie = owner) {
  return fetch(base + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function json(response: Response, status = 200): Promise<Row> {
  const data = await response.json() as Row; assert.equal(response.status, status, JSON.stringify(data)); return data;
}
async function login(email: string) {
  const response = await call("/auth/login", "POST", { email, password }, ""); await json(response);
  return response.headers.get("set-cookie")!.split(";")[0];
}
const input = (name: string, role = "employee", companyId = "pilot-company") => ({ name: "Amal " + name, email: `amal-${name}@pilot.test`, companyId, roleId: "role-" + role });
const create = async (name: string, role = "employee", extra = {}) => json(await call("/workspace/access/invitations", "POST", { ...input(name, role), ...extra }), 201);
const accept = (invite: Row, extra = {}) => call("/auth/accept-invitation", "POST", { token: invite.token, email: invite.item.email, password, ...extra }, "");
before(async () => {
  process.env.STOCRANT_ATTENDANCE_PILOT = "1";
  const hash = await hashPassword(password), data = getStore();
  data.collections.organizations = [{ id: "pilot-org", name: "Pilot", status: "active" }];
  data.collections.companies = ["pilot-company", "other-company"].map(id => ({ id, name: id, parentOrganizationId: "pilot-org", status: "active" }));
  data.collections.employees = roles.map(role => ({ id: "amal-" + role, name: "Amal " + role, email: `amal-${role}@pilot.test`, organizationId: "pilot-company", status: "active", salary: 5000 }));
  data.collections.accessUsers = [
    { id: "owner", name: "Pilot Owner", email: "owner@pilot.test", roleId: "role-main-manager", status: "active", passwordHash: hash },
    { id: "delegated", name: "Company Admin", email: "admin@pilot.test", roleId: "role-company-manager", status: "active", passwordHash: hash, organizationIds: ["pilot-company"], permissions: ["access.view", "access.create", "access.edit", "hr.view"] },
  ];
  // Start with an existing HR-created invitation; selecting a managerial role must replace its restricted overrides.
  rows("accessUsers").push({ id: "pre-invited", employeeId: "amal-hr-manager", name: "Amal HR", email: "amal-hr-manager@pilot.test", roleId: "role-employee", status: "invited", activationRequired: true, passwordHash: "activation-required", organizationIds: ["pilot-company"], permissions: ["hr.view"], ownRecordsOnly: true });
  data.collections.attendance = []; data.collections.accessInvitations = [];
  data.collections.attendanceSettings = [{ id: "pilot-settings", organizationId: "pilot-company", deductionsEnabled: true, workingDays: [0, 1, 2, 3, 4, 5, 6], timezone: "UTC" }];
  saveStore(data);
  server = createApp().listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  owner = await login("owner@pilot.test"); delegated = await login("admin@pilot.test");
  mail = createServer(async (req, res) => { let body = ""; for await (const chunk of req) body += chunk; delivered.push(JSON.parse(body)); res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ id: "local-provider-receipt" })); }).listen(0, "127.0.0.1");
  await new Promise(resolve => mail.once("listening", resolve));
  process.env.STOCRANT_EMAIL_TEST_ENDPOINT = `http://127.0.0.1:${(mail.address() as { port: number }).port}`;
  process.env.STOCRANT_EMAIL_API_KEY = "local-stub"; process.env.STOCRANT_EMAIL_FROM = "test@pilot.test"; process.env.STOCRANT_APP_URL = "https://pilot.test";
});
after(async () => {
  for (const instance of [server, mail]) { instance.closeAllConnections(); await new Promise(resolve => instance.close(resolve)); }
  assert.ok(TEST_DATA_DIR.includes("stocrant-test-data-")); rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

it("accepts Amal in all four roles with exactly the chosen company and no supplied privilege overrides", async () => {
  for (const role of roles) {
    resetFailures();
    const invite = await create(role, role, { employeeId: "amal-" + role });
    assert.equal(invite.item.tokenHash, undefined);
    await json(await accept(invite, { roleId: "role-main-manager", organizationIds: ["other-company"] }), 400);
    await json(await accept(invite)); await json(await accept(invite), 400);
    sessions[role] = await login(invite.item.email);
    const { user } = await json(await call("/auth/me", "GET", undefined, sessions[role]));
    assert.equal(user.roleId, "role-" + role); assert.deepEqual(user.organizationIds, ["pilot-company"]);
    assert.equal(user.ownRecordsOnly, role === "employee"); assert.equal(user.mustChangePassword, false);
    assert.ok(!user.permissions.includes("*"));
    const companies = await json(await call("/auth/companies", "GET", undefined, sessions[role])); assert.deepEqual(companies.companies.map((row: Row) => row.id), ["pilot-company"]);
    await json(await call("/workspace/attendance/dashboard?organizationId=other-company", "GET", undefined, sessions[role]), 403);
    await json(await call("/workspace/access/invitations", "POST", input("unauthorized"), sessions[role]), 403);
  }
  assert.equal(rows("accessUsers").filter(row => row.employeeId === "amal-hr-manager").length, 1);
  assert.equal(rows("accessUsers").find(row => row.id === "pre-invited")!.permissions, undefined);
});

it("resends by rotating tokens, rejects expiry and wrong email, and permanently revokes pending invitations", async () => {
  resetFailures();
  const old = await create("rotate");
  await json(await accept(old, { email: "wrong@pilot.test" }), 400);
  const fresh = await json(await call(`/workspace/access/invitations/${old.item.id}/resend`, "POST"));
  assert.notEqual(fresh.token, old.token); await json(await accept(old), 400);
  rows("accessInvitations").find(row => row.id === old.item.id)!.expiresAt = "2000-01-01T00:00:00Z"; saveStore(getStore());
  await json(await accept(fresh), 400);
  const renewed = await json(await call(`/workspace/access/invitations/${old.item.id}/resend`, "POST"));
  await json(await call(`/workspace/access/invitations/${old.item.id}/revoke`, "POST"));
  await json(await accept(renewed), 400);
  await json(await call(`/workspace/access/invitations/${old.item.id}/resend`, "POST"), 409);
  assert.ok(!JSON.stringify(getStore()).includes(renewed.token));
});

it("enforces company, role, employee ownership, duplicate email and issuer authorization", async () => {
  resetFailures();
  await json(await call("/workspace/access/invitations", "POST", input("foreign", "employee", "other-company"), delegated), 403);
  await json(await call("/workspace/access/invitations", "POST", input("elevate", "finance-manager"), delegated), 403);
  await json(await call("/workspace/access/invitations", "POST", input("super", "main-manager")), 400);
  await json(await call("/workspace/access/invitations", "POST", { ...input("wrong-link"), employeeId: "amal-employee" }), 400);
  const pending = await create("duplicate"); await json(await call("/workspace/access/invitations", "POST", input("duplicate")), 409);
  const issuer = rows("accessUsers").find(row => row.id === "owner")!; issuer.status = "inactive"; saveStore(getStore());
  await json(await accept(pending), 400); issuer.status = "active"; saveStore(getStore());
  const company = rows("companies").find(row => row.id === "pilot-company")!; company.status = "inactive"; saveStore(getStore());
  await json(await accept(pending), 400); company.status = "active"; saveStore(getStore());
  const list = await json(await call("/workspace/access/invitations", "GET", undefined, delegated)); assert.ok(list.items.every((row: Row) => row.companyId === "pilot-company" && !row.tokenHash));
});

it("consumes a token atomically during concurrent acceptance", async () => {
  resetFailures(); const invite = await create("concurrent");
  const responses = await Promise.all([accept(invite), accept(invite)]); assert.deepEqual(responses.map(row => row.status).sort(), [200, 400]);
  assert.equal(rows("accessUsers").filter(row => row.email === invite.item.email).length, 1);
});

it("requires explicit email confirmation and sends only to the local provider stub", async () => {
  const invite = await create("mail");
  await json(await call(`/workspace/access/invitations/${invite.item.id}/send`, "POST"), 400); assert.equal(delivered.length, 0);
  const sent = await json(await call(`/workspace/access/invitations/${invite.item.id}/send`, "POST", { confirmDelivery: true }));
  assert.equal(sent.item.deliveryStatus, "provider-accepted"); assert.equal(delivered.length, 1); assert.deepEqual(delivered[0].to, [invite.item.email]);
  assert.ok(delivered[0].text.includes("#invite=" + sent.token)); await json(await accept(invite), 400); await json(await accept(sent));
});

it("routes Amal attendance through HR, General Manager, Finance; blocks skipping and posts no pilot deductions", async () => {
  resetFailures();
  assert.equal(settingsFor("pilot-company").deductionsEnabled, false);
  await json(await call("/workspace/attendance/settings", "PUT", { organizationId: "pilot-company", deductionsEnabled: true }), 409);
  const { item } = await json(await call("/workspace/attendance/records", "POST", { organizationId: "pilot-company", employeeId: "amal-employee", date: "2026-10-20", checkIn: "10:00", checkOut: "15:00" }, sessions["hr-manager"]), 201);
  const path = `/workspace/attendance/records/${item.id}`;
  const submitted = await json(await call(path + "/submit", "POST", {}, sessions["hr-manager"])); assert.equal(submitted.item.approvalStatus, "Pending HR Approval");
  await json(await call(path + "/decision", "POST", { decision: "approve" }, sessions["finance-manager"]), 403);
  await json(await call(path + "/decision", "POST", { decision: "approve" }, sessions.employee), 403);
  const payrollBefore = JSON.stringify(rows("payroll"));
  for (const [index, role] of roles.slice(1).entries()) {
    const result = await json(await call(path + "/decision", "POST", { decision: "approve" }, sessions[role]));
    assert.equal(result.item.approvalStatus, ["Pending General Manager Approval", "Pending Finance Approval", "Approved"][index]);
  }
  await json(await call(path + "/decision", "POST", { decision: "approve" }, sessions["finance-manager"]), 409);
  assert.equal(rows("attendance").find(row => row.id === item.id)!.approvalHistory.length, 3);
  assert.equal(JSON.stringify(rows("payroll")), payrollBefore); assert.equal(rows("attendancePayrollAdjustments").length, 0);
});

it("blocks separate payroll calculations that would deduct salary during the pilot", async () => {
  const { rules } = await json(await call("/workspace/payroll/rules/pilot-company"));
  const policy = Object.fromEntries(Object.keys(rulesSchema.shape).map(key => [key, rules[key]]));
  await json(await call("/workspace/payroll/rules/pilot-company", "PUT", { ...policy, lateEnabled: true, policy: "Local pilot regression policy" }));
  await json(await call("/workspace/payroll/salaries/amal-employee", "POST", { currency: "QAR", frequency: "monthly", base: "5000", overtimeEligible: false, allowances: [], effectiveFrom: "2026-01-01", reason: "Local pilot salary fixture" }), 201);
  const period = { companyId: "pilot-company", frequency: "monthly", start: "2026-10-01", end: "2026-10-31", employeeIds: ["amal-employee"] };
  const blocked = await json(await call("/workspace/payroll/preview", "POST", period), 409);
  assert.match(blocked.error, /disabled during the attendance pilot/);
  await json(await call("/workspace/payroll/rules/pilot-company", "PUT", { ...policy, lateEnabled: false, policy: "Local pilot regression policy" }));
  const preview = await json(await call("/workspace/payroll/preview", "POST", period));
  assert.equal(preview.totals.deductions, "0.00");
});
