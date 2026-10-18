import { TEST_DATA_DIR } from "./test-env.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { getStore, saveStore, transaction, type StoreData } from "./storage.js";
import { migrateOrganizations } from "./organization-model.js";
import { resetFailures } from "./rate-limit.js";

type Row = Record<string, unknown> & { id: string };
let server: Server;
let base = "";
let mainCookie = "";
let mainId = "";
let orgA: Row, orgB: Row, companyA: Row, companyA2: Row, companyB: Row;
let orgAdminCookie = "", companyManagerCookie = "", otherCompanyCookie = "";
let organizationAdmin: Row, companyManager: Row, otherCompanyManager: Row;
let employeeA: Row, employeeA2: Row, employeeB: Row;

function request(path: string, method = "GET", input?: unknown, cookie = mainCookie) {
  return fetch(`${base}/api${path}`, { method, headers: { ...(input === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}) }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
}
function cookieFrom(response: Response) { const cookie = response.headers.get("set-cookie"); assert.ok(cookie, "Expected a session cookie"); return cookie.split(";")[0]; }
async function expectStatus(response: Response, status: number) { assert.equal(response.status, status, await response.clone().text()); return response.json() as Promise<Record<string, unknown>>; }
async function create(collection: string, input: unknown, cookie = mainCookie) { const response = await request(`/collections/${collection}`, "POST", input, cookie); const payload = await expectStatus(response, 201); assert.ok(payload.item); return payload.item as Row; }
const companyInput = (name: string, parentOrganizationId: string) => ({ name, parentOrganizationId, organizationType: "office", industry: "services", currency: "QAR", status: "active" });
const employeeInput = (name: string, organizationId: string, code: string) => ({ employeeCode: code, name, email: `${code.toLowerCase()}@organizations.example.test`, employmentType: "full-time", status: "active", hireDate: "2026-10-01", organizationId });

async function login(email: string, password: string) { const response = await request("/auth/login", "POST", { email, password }, ""); await expectStatus(response, 200); return cookieFrom(response); }
async function createAccount(name: string, roleId: string, companyIds: string[], tenantOrganizationIds: string[] = [], creator = mainCookie) {
  const password = randomBytes(20).toString("base64url"); const email = `${randomBytes(6).toString("hex")}@organizations.example.test`;
  const response = await request("/workspace/access/users", "POST", { name, email, password, roleId, organizationIds: companyIds, tenantOrganizationIds }, creator);
  const payload = await expectStatus(response, 201); const item = payload.item as Row;
  let cookie = await login(email, password);
  // Administrative passwords are temporary. Complete the real first-login flow.
  const rotated = randomBytes(20).toString("base64url");
  await expectStatus(await request("/auth/password", "POST", { currentPassword: password, newPassword: rotated }, cookie), 200);
  cookie = await login(email, rotated);
  return { item, cookie };
}

before(async () => {
  resetFailures(); server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); base = `http://127.0.0.1:${address.port}`;
  const response = await request("/auth/setup", "POST", { name: "Organization Test Owner", email: "organization-owner@example.test", password: randomBytes(24).toString("base64url"), setupKey: "local-setup" }, "");
  const setup = await expectStatus(response, 201); mainCookie = cookieFrom(response); mainId = (setup.user as Row).id;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  const target = resolve(TEST_DATA_DIR);
  assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes("stocrant-test-data-"), "Refusing to remove an unexpected directory");
  rmSync(target, { recursive: true, force: true });
});

describe("Organization hierarchy migration and scoped administration", () => {
  it("migrates legacy companies additively into independent parents without expanding existing user scope", () => {
    const fixture = structuredClone(getStore()) as StoreData;
    const legacyAccount = { id: "legacy-account", organizationIds: ["legacy-first"], roleId: "role-manager", name: "Legacy manager" };
    const legacyEmployee = { id: "legacy-employee", organizationId: "legacy-first", name: "Preserved employee" };
    fixture.collections.organizations = [];
    fixture.collections.companies = [{ id: "legacy-first", name: "First Company" }, { id: "legacy-second", name: "Second Company" }];
    fixture.collections.accessUsers = [legacyAccount]; fixture.collections.employees = [legacyEmployee];
    const originalUsers = JSON.stringify(fixture.collections.accessUsers); const originalEmployees = JSON.stringify(fixture.collections.employees);
    assert.equal(migrateOrganizations(fixture), true);
    const companies = fixture.collections.companies as Row[]; const organizations = fixture.collections.organizations as Row[];
    assert.equal(organizations.length, 2); assert.notEqual(companies[0].parentOrganizationId, companies[1].parentOrganizationId);
    assert.equal(JSON.stringify(fixture.collections.accessUsers), originalUsers); assert.equal(JSON.stringify(fixture.collections.employees), originalEmployees);
    const once = JSON.stringify(fixture); assert.equal(migrateOrganizations(fixture), false); assert.equal(JSON.stringify(fixture), once, "Migration is idempotent");
  });

  it("lets Main Admin create multiple organizations, companies and employees with enforced uniqueness", async () => {
    orgA = await create("organizations", { name: "Organization Alpha", status: "active" });
    orgB = await create("organizations", { name: "Organization Beta", status: "active" });
    companyA = await create("companies", companyInput("Alpha Office", orgA.id));
    companyA2 = await create("companies", companyInput("Alpha Retail", orgA.id));
    companyB = await create("companies", companyInput("Beta Office", orgB.id));
    employeeA = await create("employees", employeeInput("Alpha employee", companyA.id, "ORG-A-01"));
    employeeA2 = await create("employees", employeeInput("Alpha second employee", companyA2.id, "ORG-A2-01"));
    employeeB = await create("employees", employeeInput("Beta employee", companyB.id, "ORG-B-01"));
    await expectStatus(await request("/collections/organizations", "POST", { name: " organization alpha ", status: "active" }), 409);
    await expectStatus(await request("/collections/companies", "POST", companyInput(" alpha office ", orgA.id)), 409);
    await expectStatus(await request("/collections/employees", "POST", employeeInput("Duplicate code", companyA.id, "ORG-A-01")), 409);
    await expectStatus(await request("/collections/companies", "POST", companyInput("Missing parent", "missing-organization")), 400);
    const all = await expectStatus(await request("/collections/companies"), 200);
    assert.ok([companyA.id, companyA2.id, companyB.id].every(id => (all.items as Row[]).some(row => row.id === id)));
  });

  it("gives an Organization Admin all child companies while Company Managers see one child", async () => {
    const org = await createAccount("Alpha organization administrator", "role-organization-admin", [], [orgA.id]); organizationAdmin = org.item; orgAdminCookie = org.cookie;
    const company = await createAccount("Alpha company manager", "role-company-manager", [companyA.id]); companyManager = company.item; companyManagerCookie = company.cookie;
    const other = await createAccount("Beta company manager", "role-company-manager", [companyB.id]); otherCompanyManager = other.item; otherCompanyCookie = other.cookie;
    const orgCompanies = (await expectStatus(await request("/collections/companies", "GET", undefined, orgAdminCookie), 200)).items as Row[];
    assert.deepEqual(orgCompanies.map(row => row.id).sort(), [companyA.id, companyA2.id].sort());
    const orgEmployees = (await expectStatus(await request("/collections/employees", "GET", undefined, orgAdminCookie), 200)).items as Row[];
    assert.deepEqual(orgEmployees.map(row => row.id).sort(), [employeeA.id, employeeA2.id].sort());
    const companyCompanies = (await expectStatus(await request("/collections/companies", "GET", undefined, companyManagerCookie), 200)).items as Row[];
    assert.deepEqual(companyCompanies.map(row => row.id), [companyA.id]);
    const companyEmployees = (await expectStatus(await request("/collections/employees", "GET", undefined, companyManagerCookie), 200)).items as Row[];
    assert.deepEqual(companyEmployees.map(row => row.id), [employeeA.id]);
    const orgParents = (await expectStatus(await request("/collections/organizations", "GET", undefined, orgAdminCookie), 200)).items as Row[];
    assert.deepEqual(orgParents.map(row => row.id), [orgA.id]);
  });

  it("denies direct reads and writes outside organization/company scope and retains records", async () => {
    await expectStatus(await request(`/collections/employees/${employeeB.id}`, "GET", undefined, orgAdminCookie), 404);
    await expectStatus(await request(`/collections/employees/${employeeA2.id}`, "GET", undefined, companyManagerCookie), 404);
    await expectStatus(await request(`/collections/employees/${employeeB.id}`, "PATCH", { name: "Cross-scope attempted edit" }, orgAdminCookie), 404);
    await expectStatus(await request(`/collections/employees/${employeeB.id}`, "DELETE", undefined, orgAdminCookie), 404);
    await expectStatus(await request(`/workspace/access/users/${otherCompanyManager.id}`, "PATCH", { name: "Cross-scope attempted account edit" }, companyManagerCookie), 404);
    const response = await request("/collections/employees", "POST", employeeInput("Cross-company employee", companyB.id, "CROSS-01"), companyManagerCookie);
    assert.ok([400, 403].includes(response.status), await response.text());
    assert.equal(((await expectStatus(await request(`/collections/employees/${employeeB.id}`), 200)).item as Row).name, "Beta employee");
    const userList = (await expectStatus(await request("/workspace/access/users", "GET", undefined, companyManagerCookie), 200)).items as Row[];
    assert.ok(!userList.some(user => [mainId, organizationAdmin.id, otherCompanyManager.id].includes(user.id)));
    assert.ok(userList.every(user => !Object.hasOwn(user, "passwordHash")), "Password hashes never appear in administrative list responses");
  });

  it("lets delegated admins create in-scope employees and users without promoting themselves or granting finance", async () => {
    const employee = await create("employees", employeeInput("Managed employee", companyA.id, "ORG-A-02"), companyManagerCookie);
    const invitation = (getStore().collections.accessUsers as Row[]).find(row => row.employeeId === employee.id)!;
    await expectStatus(await request(`/workspace/access/users/${invitation.id}`, "DELETE", undefined, companyManagerCookie), 200);
    const account = await createAccount("Managed employee account", "role-employee", [companyA.id], [], companyManagerCookie);
    await expectStatus(await request(`/workspace/access/users/${account.item.id}`, "PATCH", { employeeId: employee.id }, companyManagerCookie), 200);
    await expectStatus(await request(`/workspace/access/users/${account.item.id}`, "PATCH", { permissions: ["finance.view"] }, companyManagerCookie), 403);
    await expectStatus(await request(`/workspace/access/users/${account.item.id}`, "PATCH", { roleId: "role-main-manager" }, companyManagerCookie), 403);
    await expectStatus(await request(`/workspace/access/users/${companyManager.id}`, "PATCH", { name: "Self administration" }, companyManagerCookie), 403);
    await expectStatus(await request("/workspace/access/roles/role-employee", "PATCH", { permissions: ["*"] }, orgAdminCookie), 403);
    await expectStatus(await request("/workspace/access/approval-rules", "POST", { section: "finance", action: "create", active: true }, orgAdminCookie), 403);
    const crossAccount = await request("/workspace/access/users", "POST", { name: "Cross tenant account", email: "cross-tenant@example.test", password: randomBytes(20).toString("base64url"), roleId: "role-employee", organizationIds: [companyB.id] }, orgAdminCookie);
    await expectStatus(crossAccount, 403);
    const extraChild = await create("companies", companyInput("Alpha New Branch", orgA.id), orgAdminCookie);
    assert.equal(extraChild.parentOrganizationId, orgA.id);
    await expectStatus(await request("/collections/companies", "POST", companyInput("Beta illegal branch", orgB.id), orgAdminCookie), 403);
    await expectStatus(await request(`/collections/companies/${companyA.id}`, "PATCH", { parentOrganizationId: orgB.id }, orgAdminCookie), 403);
  });

  it("guards the last Main Admin and preserves linked companies rather than deleting history", async () => {
    await expectStatus(await request(`/workspace/access/users/${mainId}`, "PATCH", { status: "suspended" }), 400);
    await expectStatus(await request(`/workspace/access/users/${mainId}`, "PATCH", { roleId: "role-company-manager", organizationIds: [companyA.id] }), 400);
    await expectStatus(await request(`/workspace/access/users/${mainId}`, "DELETE"), 400);
    await expectStatus(await request(`/collections/organizations/${orgA.id}`, "DELETE"), 400);
    await expectStatus(await request(`/collections/companies/${companyA.id}`, "DELETE"), 400);
    await expectStatus(await request(`/collections/employees/${employeeA.id}`), 200);
  });

  it("rejects inconsistent linked employees, locations and parent assignments", async () => {
    await expectStatus(await request(`/workspace/access/users/${companyManager.id}`, "PATCH", { employeeId: employeeB.id }), 400);
    await expectStatus(await request(`/workspace/access/users/${companyManager.id}`, "PATCH", { tenantOrganizationIds: [orgB.id] }), 400);
    await expectStatus(await request(`/collections/employees/${employeeA.id}`, "PATCH", { companyId: companyB.id }), 400);
    await expectStatus(await request(`/collections/employees/${employeeA.id}`, "PATCH", { locationId: "missing-location" }), 400);
    const linked = await request("/workspace/access/users", "POST", { name: "Wrong employee assignment", email: "wrong-employee@example.test", password: randomBytes(20).toString("base64url"), roleId: "role-employee", organizationIds: [companyA.id], employeeId: employeeB.id });
    await expectStatus(linked, 400);
  });

  it("rejects client-supplied identity changes before they can spoof an in-scope record", async () => {
    const createSpoof = await request("/collections/employees", "POST", { ...employeeInput("Spoofed identity", companyA.id, "SPOOF-01"), id: employeeB.id }, companyManagerCookie);
    assert.ok([400, 403].includes(createSpoof.status), await createSpoof.text());
    const updateSpoof = await request(`/collections/employees/${employeeA.id}`, "PATCH", { id: employeeB.id, name: "Spoofed identity" }, companyManagerCookie);
    assert.ok([400, 403].includes(updateSpoof.status), await updateSpoof.text());
    const original = (await expectStatus(await request(`/collections/employees/${employeeB.id}`), 200)).item as Row;
    assert.equal(original.name, "Beta employee");
    assert.equal(((await expectStatus(await request(`/collections/employees/${employeeA.id}`), 200)).item as Row).name, "Alpha employee");
  });

  it("applies effective role company, location and ownership restrictions to account administration", async () => {
    const role = structuredClone((getStore().collections.accessRoles as Row[]).find(row => row.id === "role-company-manager")); assert.ok(role);
    const stores: Row[] = [];
    for (const name of ["Restricted desk", "Other desk"]) {
      const payload = await expectStatus(await request("/stores", "POST", { name, companyId: companyA.id, kind: "office", address: "Organization test address", city: "Doha", totalArea: 100, floorCount: 1, status: "open" }), 201);
      stores.push(payload.store as Row);
    }
    const target = await createAccount("Location-limited target", "role-employee", [companyA.id]);
    const outside = await createAccount("Different-location target", "role-employee", [companyA.id]);
    await expectStatus(await request(`/workspace/access/users/${target.item.id}`, "PATCH", { locationIds: [stores[0].id] }), 200);
    await expectStatus(await request(`/workspace/access/users/${outside.item.id}`, "PATCH", { locationIds: [stores[1].id] }), 200);
    try {
      await expectStatus(await request("/workspace/access/roles/role-company-manager", "PATCH", { locationIds: [stores[0].id], organizationIds: [], ownRecordsOnly: false }), 200);
      const scopedUsers = (await expectStatus(await request("/workspace/access/users", "GET", undefined, companyManagerCookie), 200)).items as Row[];
      assert.ok(scopedUsers.some(row => row.id === target.item.id)); assert.ok(!scopedUsers.some(row => row.id === outside.item.id));
      await expectStatus(await request(`/workspace/access/users/${outside.item.id}`, "PATCH", { name: "Location bypass" }, companyManagerCookie), 404);
      await expectStatus(await request(`/workspace/access/users/${target.item.id}`, "PATCH", { locationIds: [] }, companyManagerCookie), 403);
      await expectStatus(await request(`/workspace/access/users/${target.item.id}`, "PATCH", { locationIds: [stores[1].id] }, companyManagerCookie), 403);
      await expectStatus(await request("/workspace/access/roles/role-company-manager", "PATCH", { ownRecordsOnly: true }), 200);
      await expectStatus(await request(`/workspace/access/users/${target.item.id}`, "PATCH", { name: "Ownership bypass" }, companyManagerCookie), 404);
      await expectStatus(await request("/workspace/access/roles/role-company-manager", "PATCH", { ownRecordsOnly: false, organizationIds: [companyB.id], locationIds: [] }), 200);
      await expectStatus(await request(`/workspace/access/users/${target.item.id}`, "PATCH", { name: "Role company bypass" }, companyManagerCookie), 404);
    } finally {
      await expectStatus(await request("/workspace/access/roles/role-company-manager", "PATCH", { permissions: role.permissions, organizationIds: Array.isArray(role.organizationIds) ? role.organizationIds : [], locationIds: Array.isArray(role.locationIds) ? role.locationIds : [], ownRecordsOnly: role.ownRecordsOnly === true }), 200);
    }
  });

  it("rolls back a failed multi-record transaction in memory and on disk", () => {
    const before = JSON.stringify(getStore()); const file = join(TEST_DATA_DIR, "data", "stocrant.json"); const diskBefore = readFileSync(file, "utf8");
    assert.throws(() => transaction(() => { const data = getStore(); data.collections.organizations.push({ id: "failed-transaction-marker", name: "Must not persist" }); data.collections.auditLog.push({ id: "failed-audit-marker" }); saveStore(data); throw new Error("Induced transaction failure"); }), /Induced transaction failure/);
    assert.equal(JSON.stringify(getStore()), before); assert.equal(readFileSync(file, "utf8"), diskBefore);
  });

  it("revokes sessions for approved deactivation so reactivation cannot restore old sessions", async () => {
    const secondAdmin = await createAccount("Approval administrator", "role-main-manager", []);
    const driver = await createAccount("Approval company manager", "role-company-manager", [companyA2.id]);
    const rule = await expectStatus(await request("/workspace/access/approval-rules", "POST", { section: "organizations", action: "edit", active: true }), 201);
    const ruleId = (rule.item as Row).id;
    try {
      const queued = await expectStatus(await request(`/collections/companies/${companyA2.id}`, "PATCH", { status: "inactive" }), 202);
      await expectStatus(await request(`/workspace/approvals/${(queued.request as Row).id}`, "POST", { decision: "approve" }, secondAdmin.cookie), 200);
      await expectStatus(await request("/workspace/overview", "GET", undefined, driver.cookie), 401);
      assert.ok(!(getStore().collections.sessions as Row[]).some(session => session.accountId === driver.item.id));
    } finally {
      await expectStatus(await request(`/workspace/access/approval-rules/${ruleId}`, "PATCH", { active: false }), 200);
      await expectStatus(await request(`/collections/companies/${companyA2.id}`, "PATCH", { status: "active" }), 200);
    }
    await expectStatus(await request("/workspace/overview", "GET", undefined, driver.cookie), 401);
  });

  it("deactivates a company and organization by revoking sessions while preserving all business records", async () => {
    const employeeCount = getStore().collections.employees.length; const companyCount = getStore().collections.companies.length;
    await expectStatus(await request(`/collections/companies/${companyA.id}`, "PATCH", { status: "inactive" }), 200);
    await expectStatus(await request("/workspace/overview", "GET", undefined, companyManagerCookie), 401);
    await expectStatus(await request("/workspace/overview", "GET", undefined, orgAdminCookie), 200);
    await expectStatus(await request(`/collections/organizations/${orgA.id}`, "PATCH", { status: "inactive" }), 200);
    await expectStatus(await request("/workspace/overview", "GET", undefined, orgAdminCookie), 401);
    await expectStatus(await request("/workspace/overview", "GET", undefined, otherCompanyCookie), 200);
    assert.equal(getStore().collections.employees.length, employeeCount); assert.equal(getStore().collections.companies.length, companyCount);
    const sessions = getStore().collections.sessions as Row[];
    assert.ok(!sessions.some(session => [organizationAdmin.id, companyManager.id].includes(String(session.accountId))), "Revoked sessions are removed from storage");
    await expectStatus(await request(`/collections/organizations/${orgA.id}`), 200);
    const audits = (await expectStatus(await request("/workspace/audit"), 200)).items as Row[];
    assert.ok(audits.some(entry => entry.collection === "organizations" && entry.targetId === orgA.id && entry.actorId === mainId));
  });
});
