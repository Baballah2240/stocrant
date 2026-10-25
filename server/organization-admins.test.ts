import { TEST_DATA_DIR } from "./test-env.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import type { Server } from "node:http";
import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "./app.js";
import { getStore, resetTestCache } from "./storage.js";
type Row = Record<string, any>;
let server: Server, base: string, main = "", orgAdmin = "", companyAdmin = "", org: Row, company: Row, foreign: Row, primary: Row, companyAccount: Row, staff: Row;
const secret = () => randomBytes(24).toString("hex");
const mainPassword = secret();
const cookie = (response: Response) => response.headers.get("set-cookie")!.split(";")[0];
async function api(path: string, method = "GET", body?: unknown, session = main) {
  return fetch(base + "/api" + path, { method, headers: { Cookie: session, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function json(response: Response, status = 200): Promise<Row> { assert.equal(response.status, status, await response.clone().text()); return response.json() as Promise<Row>; }
async function create(collection: string, input: Row) { return (await json(await api(`/collections/${collection}`, "POST", input), 201)).item; }
async function signIn(email: string, password: string) { const response = await api("/auth/login", "POST", { email, password }, ""); await json(response); return cookie(response); }
async function activateTemporary(email: string, temporary: string) {
  const first = await signIn(email, temporary), password = secret();
  await json(await api("/auth/password", "POST", { currentPassword: temporary, newPassword: password }, first));
  return signIn(email, password);
}
before(async () => {
  server = createApp().listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const response = await api("/auth/setup", "POST", { name: "Platform Owner", email: "owner@organization-admins.test", password: mainPassword, setupKey: "local-setup" }, ""); await json(response, 201); main = cookie(response);
  org = await create("organizations", { name: "Delegation organization", status: "active" });
  const other = await create("organizations", { name: "Foreign organization", status: "active" });
  const input = (name: string, parent: string) => ({ name, parentOrganizationId: parent, status: "active", organizationType: "office", industry: "services", currency: "SDG" });
  company = await create("companies", input("Delegation company", org.id)); foreign = await create("companies", input("Foreign company", other.id));
});
after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); const target = resolve(TEST_DATA_DIR); assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes("stocrant-test-data-")); rmSync(target, { recursive: true, force: true }); });

describe("Organization main admins and company staff delegation", () => {
  it("assigns a new scoped organization admin later, atomically and with real first-login rotation", async () => {
    const endpoint = `/workspace/organization-admins/${org.id}`;
    assert.equal((await json(await api(endpoint))).admin, null);
    const temporary = secret();
    const result = await json(await api(endpoint, "POST", { version: 0, name: "Organization Owner", email: "org-owner@organization-admins.test", password: temporary, organizationIds: [company.id] }), 201); primary = result.admin;
    const stored = (getStore().collections.accessUsers as Row[]).find(row => row.id === primary.id)!;
    assert.equal(stored.roleId, "role-organization-admin"); assert.deepEqual(stored.tenantOrganizationIds, [org.id]); assert.deepEqual(stored.organizationIds, [company.id]); assert.ok(stored.mustChangePassword); assert.notEqual(stored.passwordHash, temporary);
    assert.equal(result.admin.passwordHash, undefined);
    orgAdmin = await signIn(primary.email, temporary);
    await json(await api(`/workspace/company-profiles/${company.id}`, "GET", undefined, orgAdmin), 403);
    await json(await api("/auth/logout","POST",undefined,orgAdmin));
    orgAdmin = await activateTemporary(primary.email, temporary);
    await json(await api(`/workspace/company-profiles/${company.id}`, "GET", undefined, orgAdmin));
    await json(await api(`/workspace/company-profiles/${foreign.id}`, "GET", undefined, orgAdmin), 404);
    resetTestCache(); assert.equal((await json(await api(endpoint))).admin.id, primary.id);
    await json(await api(endpoint, "POST", { version: 0, accountId: primary.id }), 409);
  });
  it("protects the designated organization admin and rejects unrelated or platform accounts", async () => {
    await json(await api(`/workspace/access/users/${primary.id}`, "PATCH", { status: "suspended" }), 409);
    await json(await api(`/workspace/access/users/${primary.id}`, "PATCH", { roleId: "role-employee", organizationIds: [company.id], tenantOrganizationIds: [] }), 409);
    await json(await api(`/workspace/access/users/${primary.id}`, "DELETE"), 409);
    const owner = (getStore().collections.accessUsers as Row[]).find(row => row.roleId === "role-main-manager")!;
    await json(await api(`/workspace/organization-admins/${org.id}`, "POST", { version: 1, accountId: owner.id }), 400);
    await json(await api(`/workspace/organization-admins/${org.id}`, "POST", { version: 1, accountId: primary.id }, orgAdmin), 403);
    await json(await api(`/collections/organizations/${org.id}`, "PATCH", { mainAdminAccountId: owner.id }), 403);
  });
  it("lets organization admins appoint company admins and company admins appoint HR and staff", async () => {
    const temporary = secret(); companyAccount = (await json(await api("/workspace/access/users", "POST", { name: "Company Admin", email: "company-admin@organization-admins.test", password: temporary, roleId: "role-company-manager", organizationIds: [company.id] }, orgAdmin), 201)).item;
    companyAdmin = await activateTemporary(companyAccount.email, temporary);
    staff = await create("employees", { name: "Company Staff", organizationId: company.id, status: "active", hireDate: "2026-10-23" });
    const account = (getStore().collections.accessUsers as Row[]).find(row => row.employeeId === staff.id)!;
    for (const roleId of ["role-hr-staff", "role-hr-manager", "role-employee"]) {
      const result = await json(await api(`/workspace/access/users/${account.id}`, "PATCH", { roleId, permissions: null, ownRecordsOnly: roleId === "role-employee" }, companyAdmin));
      assert.equal(result.item.roleId, roleId); assert.equal(result.item.permissions, null);
    }
    const roles = (await json(await api("/workspace/access/roles", "GET", undefined, companyAdmin))).items;
    assert.ok(roles.some((row: Row) => row.id === "role-hr-manager")); assert.ok(roles.some((row: Row) => row.id === "role-hr-staff"));
    assert.ok(!roles.some((row: Row) => ["role-main-manager", "role-organization-admin", "role-company-manager"].includes(row.id)));
    assert.ok(roles.some((row: Row) => row.id === "role-finance-manager"));
    assert.ok(roles.some((row: Row) => row.id === "role-shop-manager"));
    await json(await api(`/workspace/access/users/${account.id}`, "PATCH", { roleId: "role-company-manager" }, companyAdmin), 403);
    await json(await api(`/workspace/access/users/${account.id}`, "PATCH", { permissions: ["finance.view"] }, companyAdmin));
    await json(await api(`/workspace/access/users/${account.id}`, "PATCH", { permissions: ["customerService.inquiries"] }, companyAdmin), 403);
    const foreignEmployee = await create("employees", { name: "Foreign Staff", organizationId: foreign.id, status: "active", hireDate: "2026-10-23" });
    const foreignAccount = (getStore().collections.accessUsers as Row[]).find(row => row.employeeId === foreignEmployee.id)!;
    await json(await api(`/workspace/access/users/${foreignAccount.id}`, "PATCH", { roleId: "role-hr-staff" }, companyAdmin), 404);
    await json(await api("/workspace/access/users", "POST", { name: "Forbidden peer", email: "peer@organization-admins.test", password: secret(), roleId: "role-company-manager", organizationIds: [company.id] }, companyAdmin), 403);
  });
  it("delegates a complete shop workflow with scoped shop staff administration", async () => {
    const me = (await json(await api("/auth/me", "GET", undefined, companyAdmin))).user;
    for (const permission of ["finance.*", "payroll.*", "shops.*", "organizations.edit"]) assert.ok(me.permissions.includes(permission));
    await json(await api(`/collections/companies/${company.id}`, "PATCH", { name: "Managed retail company" }, companyAdmin));
    const temporary = secret();
    const delegate = (await json(await api("/workspace/access/users", "POST", { name: "Shop Delegate", email: "shop@organization-admins.test", password: temporary, roleId: "role-shop-manager", organizationIds: [company.id] }, companyAdmin), 201)).item;
    const shop = await activateTemporary(delegate.email, temporary);
    const prefix = `/workspace/shops/${company.id}`;
    await json(await api(`/workspace/shops/${foreign.id}`, "GET", undefined, shop), 404);
    const shopUsers = await json(await api("/workspace/access/users", "GET", undefined, shop), 200); assert.ok(shopUsers.items.every((user: any) => ["role-shop-staff", "role-customer-service"].includes(user.roleId) && user.organizationIds.includes(company.id)));
    await json(await api("/workspace/access/users", "POST", { name: "Forbidden", email: "forbidden@organization-admins.test", password: secret(), roleId: "role-employee", organizationIds: [company.id] }, shop), 403);
    const product = (await json(await api(prefix + "/products", "POST", { products: [{ sku: "SHOP-01", name: "Shop product", price: "10" }] }, shop), 201)).products[0];
    await json(await api(prefix + "/receipts", "POST", { requestId: randomUUID(), productId: product.id, quantity: 5, supplier: "Supplier", reference: "SHIP-01" }, shop), 201);
    const defaults = (await json(await api(`/workspace/storefronts/${company.id}`, "GET", undefined, shop))).settings;
    await json(await api(`/workspace/storefronts/${company.id}`, "PUT", { ...defaults, slug: "delegated-shop", name: "Managed shop", address: "Test collection address", phone: "+249912345678", shippingPolicy: "Collection only", returnsPolicy: "Contact staff", privacyPolicy: "Order use only", terms: "Pay on collection", manualPaymentsAccepted: true, published: true }, shop));
    const connection = await json(await api(prefix + "/connectors", "POST", { name: "Authorized shop" }, shop), 201);
    await json(await api(prefix + `/connectors/${connection.connector.id}`, "DELETE", undefined, shop));
    const order = await json(await api(prefix + "/orders", "POST", { requestId: randomUUID(), externalReference: "DELEGATE-ORDER", customer: "Test customer", phone: "+249912345678", address: "Collection", lines: [{ productId: product.id, quantity: 2 }] }, shop), 201);
    const preparing = await json(await api(prefix + `/orders/${order.id}/status`, "POST", { version: order.version, status: "preparing" }, shop));
    const dispatched = await json(await api(prefix + `/orders/${order.id}/status`, "POST", { version: preparing.version, status: "dispatched", tracking: "COLLECTION-01" }, shop));
    assert.ok(dispatched.saleId);
    assert.equal((getStore().collections.sales as Row[]).find(sale => sale.id === dispatched.saleId)!.organizationId, company.id);
    await json(await api(`/workspace/access/users/${delegate.id}`, "PATCH", { permissions: ["operations.view", "inventory.view"] }, companyAdmin));
    await json(await api(`/workspace/storefronts/${company.id}`, "GET", undefined, shop), 403);
    await json(await api(prefix + "/products", "POST", { products: [{ sku: "DENIED", name: "Denied", price: "1" }] }, shop), 403);
  });
  it("replaces the primary admin explicitly and releases the previous account for normal administration", async () => {
    const result = await json(await api(`/workspace/organization-admins/${org.id}`, "POST", { version: 1, accountId: companyAccount.id, organizationIds: [company.id] }));
    assert.equal(result.admin.id, companyAccount.id);
    await json(await api(`/workspace/company-profiles/${company.id}`, "GET", undefined, companyAdmin), 401);
    await json(await api(`/workspace/access/users/${primary.id}`, "PATCH", { status: "suspended" }));
    assert.equal((await json(await api(`/workspace/organization-admins/${org.id}`))).admin.id, companyAccount.id);
  });
  it("preserves a linked primary admin through employee deactivation and bulk role editing", async () => {
    const account = (getStore().collections.accessUsers as Row[]).find(row => row.employeeId === staff.id)!;
    await json(await api(`/workspace/access/users/${account.id}`, "PATCH", { status: "active", password: secret() }));
    await json(await api(`/workspace/organization-admins/${org.id}`, "POST", { version: 2, accountId: account.id, organizationIds: [company.id] }));
    await json(await api(`/collections/employees/${staff.id}`, "PATCH", { status: "terminated" }), 409);
    await json(await api("/workspace/administration/roles", "POST", { name: "Bulk reassignment attempt", description: "Should not demote a primary administrator", permissions: ["hr.view"], assignedUserIds: [account.id], currentPassword: mainPassword }), 409);
    assert.equal((getStore().collections.accessUsers as Row[]).find(row => row.id === account.id)!.roleId, "role-organization-admin");
  });
});
