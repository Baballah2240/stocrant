import { TEST_DATA_DIR } from "./test-env.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { getStore, resetTestCache } from "./storage.js";

type Row = Record<string, any>;
let server: Server, base: string, main = "", manager = "", colleague = "", employee = "", org: Row, otherOrg: Row, company: Row, foreign: Row;
const credentials = () => randomBytes(24).toString("hex");
const cookie = (response: Response) => response.headers.get("set-cookie")!.split(";")[0];
async function api(path: string, method = "GET", body?: unknown, session = manager) {
  return fetch(base + "/api" + path, { method, headers: { ...(session ? { Cookie: session } : {}), "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function json(response: Response, status = 200): Promise<Row> { assert.equal(response.status, status, await response.clone().text()); return response.json() as Promise<Row>; }
async function create(collection: string, input: unknown, session = main) { return (await json(await api(`/collections/${collection}`, "POST", input, session), 201)).item; }
async function account(name: string, roleId: string, tenant = false) {
  const temporary = credentials(), email = `${name.toLowerCase().replace(/\s+/g, "-")}@personal-notes.test`;
  const item = (await json(await api("/workspace/access/users", "POST", { name, email, password: temporary, roleId, organizationIds: [company.id], tenantOrganizationIds: tenant ? [org.id] : [] }, main), 201)).item;
  let response = await api("/auth/login", "POST", { email, password: temporary }, ""); await json(response); const first = cookie(response), password = credentials();
  await json(await api("/auth/password", "POST", { currentPassword: temporary, newPassword: password }, first));
  response = await api("/auth/login", "POST", { email, password }, ""); await json(response); return { item, session: cookie(response) };
}
const noteInput = (extra: Row = {}) => ({ title: "Private follow-up", body: "Call the supplier about the next delivery.", phone: "+974 5555 1234", dueAt: null, pinned: false, requestId: randomUUID(), ...extra });
async function note(extra: Row = {}, session = manager) { return (await json(await api("/workspace/personal-notes", "POST", noteInput(extra), session), 201)).item; }

before(async () => {
  server = createApp().listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const setup = await api("/auth/setup", "POST", { name: "Test Owner", email: "owner@personal-notes.test", password: credentials(), setupKey: "local-setup" }, ""); await json(setup, 201); main = cookie(setup);
  org = await create("organizations", { name: "Production trial organization", status: "active" }); otherOrg = await create("organizations", { name: "Unrelated organization", status: "active" });
  const companyInput = (name: string, parent: string) => ({ name, parentOrganizationId: parent, status: "active", organizationType: "office", industry: "services", currency: "QAR" });
  company = await create("companies", companyInput("Trial company", org.id)); foreign = await create("companies", companyInput("Unrelated company", otherOrg.id));
  manager = (await account("Organization Manager", "role-organization-admin", true)).session;
  colleague = (await account("Company Manager", "role-company-manager")).session; employee = (await account("Employee", "role-employee")).session;
});
after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); const target = resolve(TEST_DATA_DIR); assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes("stocrant-test-data-")); rmSync(target, { recursive: true, force: true }); });

describe("Private manager notebook and production organization workflow", () => {
  it("persists account-owned dashboard layouts and rejects stale writes", async () => {
    const initial = await json(await api("/workspace/dashboard-layout")); assert.equal(initial.version, 0);
    const items = [{ id: "notes", hidden: false, wide: false, width: "third", height: 360 }, { id: "profile", hidden: true, wide: true, width: "full", height: null }];
    const saved = await json(await api("/workspace/dashboard-layout", "PUT", { version: 0, items, density: "compact" })); assert.equal(saved.version, 1); assert.equal(saved.density,"compact");
    resetTestCache(); assert.equal((await json(await api("/workspace/dashboard-layout"))).density,"compact"); assert.deepEqual((await json(await api("/workspace/dashboard-layout"))).items, items);
    for (const session of [main, colleague]) { const other=await json(await api("/workspace/dashboard-layout", "GET", undefined, session)); assert.deepEqual(other.items, []); assert.equal(other.density,"comfortable"); }
    await json(await api("/workspace/dashboard-layout", "PUT", { version: 0, items: [] }), 409);
    assert.deepEqual((await json(await api("/workspace/dashboard-layout"))).items, items);
    await json(await api("/workspace/dashboard-layout", "PUT", { version: 1, items: [] }));
  });
  it("validates layout cards, ownership and permissions without exposing a generic collection", async () => {
    await json(await api("/workspace/dashboard-layout", "GET", undefined, ""), 401);
    await json(await api("/workspace/dashboard-layout", "GET", undefined, employee), 403);
    await json(await api("/workspace/dashboard-layout", "PUT", { version: 0, items: [] }, employee), 403);
    for (const payload of [
      { version: 2, items: [], density: "tiny" },
      { version: 2, items: [], ownerId: "someone-else" },
      { version: 2, items: [{ id: "unknown", hidden: false, wide: false }] },
      { version: 2, items: [{ id: "notes", hidden: false, wide: false }, { id: "notes", hidden: true, wide: false }] },
      { version: -1, items: [] },
      ...[239, 1601, 300.5, "400"].map(height => ({ version: 2, items: [{ id: "notes", hidden: false, wide: false, height }] })),
      { version: 2, items: [{ id: "notes", hidden: false, wide: false, width: "giant" }] },
    ]) await json(await api("/workspace/dashboard-layout", "PUT", payload), 400);
    for (const path of ["/collections/managerDashboardLayouts", "/collections/managerDashboardLayouts/export"]) await json(await api(path, "GET", undefined, main), 404);
  });
  it("creates company employees under the delegated organization and refuses foreign organization access", async () => {
    const person = await create("employees", { name: "Trial employee", organizationId: company.id, status: "active", hireDate: "2026-10-23", employmentType: "full-time", department: "Operations" }, manager);
    assert.match(person.employeeCode, /^EMP-/); assert.ok((getStore().collections.accessUsers as Row[]).some(row => row.employeeId === person.id));
    const profile = await json(await api(`/workspace/company-profiles/${company.id}`)); assert.ok(profile.employees.some((row: Row) => row.id === person.id));
    await json(await api(`/workspace/company-profiles/${foreign.id}`), 404);
    const denied = await api("/collections/employees", "POST", { name: "Unauthorized employee", organizationId: foreign.id, status: "active", hireDate: "2026-10-23", employmentType: "full-time" });
    assert.ok([400, 403].includes(denied.status));
    const overview = await json(await api("/workspace/overview")); assert.ok(overview.personal);
  });
  it("saves phone numbers and note text durably without exposing private request metadata", async () => {
    const item = await note(); assert.equal(item.phone, "+974 5555 1234"); assert.equal(item.version, 1); assert.equal(item.ownerId, undefined); assert.equal(item.requestHash, undefined);
    const disk = JSON.parse(readFileSync(join(TEST_DATA_DIR, "data/stocrant.json"), "utf8")); assert.ok(disk.collections.managerPersonalNotes.some((row: Row) => row.id === item.id));
    resetTestCache(); const saved = (await json(await api(`/workspace/personal-notes/${item.id}`))).item; assert.equal(saved.body, item.body);
  });
  it("enforces ownership even against Main Admin and managers in the same organization", async () => {
    const item = await note({ title: "Owner-only contact" });
    for (const session of [main, colleague]) {
      await json(await api(`/workspace/personal-notes/${item.id}`, "GET", undefined, session), 404);
      await json(await api(`/workspace/personal-notes/${item.id}`, "PATCH", { version: 1, title: "Stolen" }, session), 404);
      await json(await api(`/workspace/personal-notes/${item.id}`, "DELETE", { version: 1 }, session), 404);
      const list = await json(await api("/workspace/personal-notes?q=Owner-only", "GET", undefined, session)); assert.equal(list.total, 0);
    }
    await json(await api("/workspace/personal-notes", "GET", undefined, ""), 401); await json(await api("/workspace/personal-notes", "GET", undefined, employee), 403);
    for (const path of ["/collections/managerPersonalNotes", "/collections/managerPersonalNotes/export", "/collections/meta/managerPersonalNotes"]) await json(await api(path, "GET", undefined, main), 404);
  });
  it("supports shipped Manager, HR, Finance and General Manager roles without sharing their notes", async () => {
    for (const role of ["role-manager", "role-hr-manager", "role-finance-manager", "role-general-manager"]) {
      const user = await account(role, role); const item = await note({ title: role }, user.session);
      assert.equal((await json(await api(`/workspace/personal-notes/${item.id}`, "GET", undefined, user.session))).item.title, role);
      await json(await api(`/workspace/personal-notes/${item.id}`, "GET", undefined, manager), 404);
    }
  });
  it("rejects ownership injection, malformed phones, dates and empty titles without saving", async () => {
    const count = getStore().collections.managerPersonalNotes.length;
    for (const extra of [{ title: " " }, { phone: "javascript:alert(1)" }, { phone: "+ ()" }, { dueAt: "invalid" }, { ownerId: "someone-else" }, { organizationId: foreign.id }, { body: "x".repeat(6001) }]) await json(await api("/workspace/personal-notes", "POST", noteInput(extra)), 400);
    assert.equal(getStore().collections.managerPersonalNotes.length, count);
  });
  it("deduplicates concurrent create retries and prevents lost updates and stale deletion", async () => {
    const input = noteInput({ title: "Retry-safe private entry" });
    const responses = await Promise.all([api("/workspace/personal-notes", "POST", input), api("/workspace/personal-notes", "POST", input)]);
    assert.deepEqual(responses.map(row => row.status).sort(), [200, 201]);
    const item = ((await responses[0].json()) as Row).item;
    await json(await api("/workspace/personal-notes", "POST", { ...input, body: "Changed retry" }), 409);
    const results = await Promise.all([api(`/workspace/personal-notes/${item.id}`, "PATCH", { version: 1, body: "First change" }), api(`/workspace/personal-notes/${item.id}`, "PATCH", { version: 1, body: "Second change" })]);
    assert.deepEqual(results.map(row => row.status).sort(), [200, 409]);
    await json(await api(`/workspace/personal-notes/${item.id}`, "DELETE", { version: 1 }), 409);
    await json(await api(`/workspace/personal-notes/${item.id}`, "PATCH", { version: 2, ownerId: "other" }), 400);
  });
  it("delivers due reminders only to the owner once across polling and storage reloads", async () => {
    const item = await note({ title: "Secret call title", body: "Confidential meeting notes", dueAt: new Date(Date.now() - 60_000).toISOString() });
    const first = await json(await api("/notifications"));
    const notices = first.items.filter((row: Row) => row.target === `personal-note:${item.id}`); assert.equal(notices.length, 1);
    assert.ok(!notices[0].message.includes(item.title) && !notices[0].message.includes(item.phone));
    const detail = await json(await api(`/notifications/${notices[0].id}`)); assert.equal(detail.details.body, item.body); assert.ok(detail.link.to.includes(item.id));
    for (const session of [main, colleague, employee]) await json(await api(`/notifications/${notices[0].id}`, "GET", undefined, session), 404);
    resetTestCache(); await json(await api("/notifications"));
    assert.equal((getStore().collections.notifications as Row[]).filter(row => row.target === `personal-note:${item.id}`).length, 1);
    const done = (await json(await api(`/workspace/personal-notes/${item.id}`, "PATCH", { version: 1, completed: true }))).item;
    await json(await api("/notifications")); assert.equal((getStore().collections.notifications as Row[]).filter(row => row.target === `personal-note:${item.id}`).length, 0);
    const rescheduled = (await json(await api(`/workspace/personal-notes/${item.id}`, "PATCH", { version: done.version, completed: false, dueAt: new Date(Date.now() - 30_000).toISOString() }))).item;
    await json(await api("/notifications")); assert.equal((getStore().collections.notifications as Row[]).filter(row => row.target === `personal-note:${item.id}`).length, 1);
    await json(await api(`/workspace/personal-notes/${item.id}`, "DELETE", { version: rescheduled.version })); await json(await api("/notifications"));
    assert.equal((getStore().collections.notifications as Row[]).filter(row => row.target === `personal-note:${item.id}`).length, 0);
  });
  it("keeps future reminders quiet, filters own notes, pins them and paginates bounded results", async () => {
    const item = await note({ title: "Searchable special contact", dueAt: new Date(Date.now() + 86_400_000).toISOString(), pinned: true });
    const found = await json(await api("/workspace/personal-notes?q=Searchable&filter=reminders")); assert.equal(found.items[0].id, item.id); assert.equal(found.total, 1);
    const alerts = await json(await api("/notifications")); assert.ok(!alerts.items.some((row: Row) => row.target === `personal-note:${item.id}`));
    for (let i = 0; i < 22; i++) await note({ title: `Page marker ${i}` });
    const list = await json(await api("/workspace/personal-notes?q=Page%20marker&page=999")); assert.equal(list.page, 2); assert.equal(list.items.length, 2); assert.equal(list.total, 22);
  });
});
