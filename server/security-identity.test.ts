import { TEST_DATA_DIR } from "./test-env.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { hashPassword } from "./auth.js";
import { migrateAccountEmployeeLinks } from "./account-link-migration.js";
import { resetFailures } from "./rate-limit.js";
import { getStore, saveStore } from "./storage.js";

type Row = Record<string, any>;
const password = "correct-horse-battery-staple";
let server: Server, base = "";
const call = (path: string, method = "GET", body?: unknown, cookie = "") => fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
async function login(email: string) {
  const response = await call("/auth/login", "POST", { email, password });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie")!.split(";")[0];
}
const profile = (name: string, email: string) => ({ name, email, phone: "", avatar: "", currentPassword: password });

before(async () => {
  const passwordHash = await hashPassword(password);
  const data = getStore(), c = data.collections as Record<string, Row[]>;
  const account = { status: "active", ownRecordsOnly: true, organizationIds: ["sec-co"], tenantOrganizationIds: [], locationIds: [], passwordHash, roleId: "role-employee" };
  c.organizations = [{ id: "sec-org", name: "Org", status: "active" }];
  c.companies = [{ id: "sec-co", name: "Co", parentOrganizationId: "sec-org", status: "active" }];
  c.employees = [
    { id: "emp-a", name: "Linked Attacker", email: "linked@sec.test", organizationId: "sec-co", status: "active" },
    { id: "emp-v", name: "Victim", email: "victim@sec.test", organizationId: "sec-co", status: "active", loginAccount: false },
    { id: "emp-own", name: "Moving Employee", email: "moving@sec.test", organizationId: "sec-co", status: "active" },
  ];
  c.accessUsers = [
    { ...account, id: "sec-main", name: "Main", email: "main@sec.test", roleId: "role-main-manager" },
    { ...account, id: "sec-linked", name: "Linked Attacker", email: "linked@sec.test", employeeId: "emp-a", permissions: ["hr.view"] },
    { ...account, id: "sec-unlinked", name: "Unlinked", email: "unlinked@sec.test", permissions: ["hr.view", "operations.view"] },
    { ...account, id: "sec-moving", name: "Moving Employee", email: "moving@sec.test", employeeId: "emp-own", permissions: ["hr.view"] },
    { ...account, id: "sec-approver", name: "Approver", email: "approver@sec.test", roleId: "role-manager", ownRecordsOnly: false, permissions: ["hr.view", "approvals.view", "approvals.approve"] },
    { ...account, id: "sec-requester", name: "Requester", email: "requester@sec.test", roleId: "role-manager", ownRecordsOnly: false, permissions: ["hr.view", "hr.create", "hr.salary.view"] },
    { ...account, id: "sec-limit", name: "Limit", email: "limit@sec.test", permissions: ["hr.view"] },
  ];
  c.documents = [{ id: "doc-v", category: "employee", type: "passport", title: "Victim passport", employeeId: "emp-v", organizationId: "sec-co", visibility: "employee", lifecycle: "active", version: 1 }];
  c.customers = [{ id: "cust-v", name: "Customer", email: "customer@sec.test", phone: "5551234", organizationId: "sec-co" }];
  saveStore(data);
  server = createApp().listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  assert.ok(TEST_DATA_DIR.includes("stocrant-test-data-"));
  rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe("account identity cannot be claimed through an email address", () => {
  it("rejects a colleague's employee email on the profile and on registration", async () => {
    resetFailures();
    const cookie = await login("linked@sec.test");
    assert.equal((await call("/auth/profile", "PATCH", profile("Linked Attacker", "victim@sec.test"), cookie)).status, 409);
    assert.equal((await call("/workspace/documents/doc-v", "GET", undefined, cookie)).status, 404);
    assert.equal((await call("/auth/register", "POST", { name: "Outsider", email: "victim@sec.test", password })).status, 200);
    assert.ok(!(getStore().collections.accessUsers as Row[]).some(row => row.email === "victim@sec.test"));
  });
  it("does not resolve identity from an account email even if one already matches", async () => {
    resetFailures();
    const cookie = await login("unlinked@sec.test");
    const accounts = getStore().collections.accessUsers as Row[];
    accounts.find(row => row.id === "sec-unlinked")!.email = "victim@sec.test";
    saveStore(getStore());
    const service = await (await call("/workspace/self-service", "GET", undefined, cookie)).json() as Row;
    assert.equal(service.employee, null);
    assert.equal((await call("/workspace/documents/doc-v", "GET", undefined, cookie)).status, 404);
    accounts.find(row => row.id === "sec-unlinked")!.email = "customer@sec.test";
    saveStore(getStore());
    assert.equal((await call("/collections/customers/cust-v", "GET", undefined, cookie)).status, 404);
  });
  it("moves the linked employee's email so the old address cannot be claimed", async () => {
    resetFailures();
    const cookie = await login("moving@sec.test");
    assert.equal((await call("/auth/profile", "PATCH", profile("Moving Employee", "moved@sec.test"), cookie)).status, 200);
    assert.equal((getStore().collections.employees as Row[]).find(row => row.id === "emp-own")!.email, "moved@sec.test");
  });
  it("links existing accounts once and skips an email the account changed itself", () => {
    const data = { collections: {
      accessUsers: [{ id: "a", email: "a@x.test", organizationIds: ["c"] }, { id: "b", email: "b@x.test", organizationIds: ["c"] }, { id: "o", email: "o@x.test", organizationIds: ["other"] }],
      employees: [{ id: "ea", email: "A@x.test", organizationId: "c" }, { id: "eb", email: "b@x.test", organizationId: "c" }, { id: "eo", email: "o@x.test", organizationId: "c" }],
      auditLog: [{ action: "profile.updated", actorId: "b", changedFields: ["email"] }],
    } as Record<string, unknown[]> };
    assert.equal(migrateAccountEmployeeLinks(data), true);
    const [a, b, o] = data.collections.accessUsers as Row[];
    assert.equal(a.employeeId, "ea");
    assert.equal(b.employeeId, undefined);
    assert.equal(o.employeeId, undefined);
    a.employeeId = undefined;
    assert.equal(migrateAccountEmployeeLinks(data), false);
    assert.equal(a.employeeId, undefined);
  });
});

describe("approval and sign-in protections", () => {
  it("hides pending salaries from an approver without salary access", async () => {
    resetFailures();
    getStore().collections.approvalRules = [{ id: "rule-hr", section: "hr", action: "create", active: true }];
    saveStore(getStore());
    const created = await call("/collections/employees", "POST", { name: "New Hire", email: "hire@sec.test", phone: "5551234", department: "Ops", jobTitle: "Clerk", employmentType: "full-time", status: "active", hireDate: "2026-01-01", organizationId: "sec-co", salary: 12345 }, await login("requester@sec.test"));
    assert.equal(created.status, 202);
    assert.equal(((getStore().collections.approvalRequests as Row[]).at(-1)!.payload as Row).salary, 12345);
    const text = await (await call("/workspace/approvals", "GET", undefined, await login("approver@sec.test"))).text();
    assert.ok(text.includes("New Hire"));
    assert.ok(!text.includes("12345"));
  });
  it("counts simultaneous wrong passwords toward the account limit", async () => {
    resetFailures();
    const statuses = await Promise.all(Array.from({ length: 25 }, () => call("/auth/login", "POST", { email: "limit@sec.test", password: "wrong-password-value" }).then(res => res.status)));
    assert.equal(statuses.filter(status => status === 401).length, 10);
    assert.equal(statuses.filter(status => status === 429).length, 15);
  });
  it("keeps an IP's failures after a successful sign-in on another account", async () => {
    resetFailures();
    for (let attempt = 0; attempt < 30; attempt++) await call("/auth/login", "POST", { email: `guess${attempt}@sec.test`, password: "wrong-password-value" });
    assert.equal((await call("/auth/login", "POST", { email: "main@sec.test", password })).status, 429);
    resetFailures();
  });
});
