import { TEST_DATA_DIR } from "./test-env.js";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { getStore, saveStore, type StoreData } from "./storage.js";
import { buildSchema } from "./crud.js";
import { csvCell } from "./csv.js";

type Row = Record<string, unknown> & { id: string };
let server: Server, base: string, main: string, snapshot: StoreData;
const cookieOf = (response: Response) => response.headers.get("set-cookie")!.split(";")[0];
async function req(path: string, method = "GET", input?: unknown, owner = main) {
  return fetch(base + "/api" + path, { method, headers: { ...(owner ? { Cookie: owner } : {}), ...(input === undefined ? {} : { "Content-Type": "application/json" }) }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
}
async function body(response: Response, status = 200): Promise<any> {
  assert.equal(response.status, status, await response.clone().text()); return response.json();
}
async function account(name: string, permissions = ["hr.view", "approvals.view", "approvals.approve", "finance.view"], locationIds: string[] = []) {
  const email = name + "@audit.test", password = randomBytes(24).toString("hex");
  const created = await body(await req("/workspace/access/users", "POST", { name, email, password, roleId: "role-manager", organizationIds: ["company-primary"], locationIds, permissions }), 201);
  await body(await req(`/workspace/access/users/${created.item.id}`, "PATCH", { permissions }));
  let response = await req("/auth/login", "POST", { email, password }, "");
  const login = await body(response); const temporary = cookieOf(response);
  assert.equal(login.user.mustChangePassword, true);
  const rotated = randomBytes(24).toString("hex");
  await body(await req("/auth/password", "POST", { currentPassword: password, newPassword: rotated }, temporary));
  response = await req("/auth/login", "POST", { email, password: rotated }, "");
  await body(response); return { id: created.item.id, cookie: cookieOf(response), email, password: rotated };
}
before(async () => {
  server = createApp().listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const response = await req("/auth/setup", "POST", { name: "Audit owner", email: "owner@audit.test", password: randomBytes(24).toString("hex"), setupKey: "local-setup" }, "");
  await body(response, 201); main = cookieOf(response); snapshot = structuredClone(getStore());
});
beforeEach(() => saveStore(structuredClone(snapshot)));
after(async () => {
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  const target = resolve(TEST_DATA_DIR); assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes("stocrant-test-data-"));
  rmSync(target, { recursive: true, force: true });
});

describe("Application audit security and workflow regressions", () => {
  it("blocks business APIs until a temporary password is replaced, clears the flag and revokes old sessions", async () => {
    const password = randomBytes(24).toString("hex"), email = "temporary@audit.test";
    await body(await req("/workspace/access/users", "POST", { name: "Temporary", email, password, roleId: "role-manager", organizationIds: ["company-primary"] }), 201);
    const login = await req("/auth/login", "POST", { email, password }, "");
    assert.equal((await body(login)).user.mustChangePassword, true); const temporary = cookieOf(login);
    for (const path of ["/workspace/overview", "/collections/employees", "/workspace/work", "/notifications"]) assert.equal((await body(await req(path, "GET", undefined, temporary), 403)).code, "PASSWORD_CHANGE_REQUIRED");
    await body(await req("/auth/password", "POST", { currentPassword: password, newPassword: password }, temporary), 400);
    const changed = randomBytes(24).toString("hex");
    await body(await req("/auth/password", "POST", { currentPassword: password, newPassword: changed }, temporary));
    await body(await req("/workspace/overview", "GET", undefined, temporary), 401);
    const next = await req("/auth/login", "POST", { email, password: changed }, "");
    assert.equal((await body(next)).user.mustChangePassword, false);
    await body(await req("/workspace/overview", "GET", undefined, cookieOf(next)));
  });

  it("keeps dashboard and HR approval counts and payloads inside the same scope as the approval list", async () => {
    const reviewer = await account("ScopedReviewer"); const data = getStore();
    data.collections.approvalRequests = [
      { id: "audit-own", organizationId: "company-primary", section: "hr", collection: "departments", status: "pending", action: "create", payload: { name: "Own request", organizationId: "company-primary" }, requestedBy: "other" },
      { id: "audit-foreign", organizationId: "other-company", section: "hr", collection: "employees", status: "pending", action: "create", payload: { name: "Secret foreign employee" }, requestedBy: "other" },
      { id: "audit-document", organizationId: "company-primary", section: "hr", collection: "documents", status: "pending", action: "create", payload: { title: "Private document" }, requestedBy: "other" },
    ]; saveStore(data);
    const overview = await body(await req("/workspace/overview", "GET", undefined, reviewer.cookie));
    const hr = await body(await req("/workspace/hr/overview", "GET", undefined, reviewer.cookie));
    const list = await body(await req("/workspace/approvals", "GET", undefined, reviewer.cookie));
    assert.equal(overview.pendingApprovals, 1); assert.equal(hr.metrics.pendingApprovals, 1);
    assert.deepEqual(list.items.map((row: Row) => row.id), ["audit-own"]);
    assert.ok(!JSON.stringify(hr).includes("Secret foreign employee") && !JSON.stringify(hr).includes("Private document"));
  });

  it("resolves legacy approval location scope from the proposed record and refuses other locations", async () => {
    const reviewer = await account("LocationReviewer", ["hr.view", "approvals.view", "approvals.approve"], ["st-001"]);
    const data = getStore(); data.collections.approvalRequests = [
      { id: "location-own", organizationId: "company-primary", section: "hr", collection: "departments", status: "pending", action: "create", payload: { name: "Own", organizationId: "company-primary", locationId: "st-001" }, requestedBy: "another" },
      { id: "location-other", organizationId: "company-primary", section: "hr", collection: "departments", status: "pending", action: "create", payload: { name: "Other", organizationId: "company-primary", locationId: "st-other" }, requestedBy: "another" },
    ]; saveStore(data);
    const list = await body(await req("/workspace/approvals", "GET", undefined, reviewer.cookie));
    assert.deepEqual(list.items.map((row: Row) => row.id), ["location-own"]);
    await body(await req("/workspace/approvals/location-other", "POST", { decision: "approve" }, reviewer.cookie), 404);
  });

  it("validates work updates and real calendar dates without mutating valid records on rejection", async () => {
    const work = (await body(await req("/workspace/work", "POST", { title: "Audit work", organizationId: "company-primary", status: "Assigned", dueDate: "2026-10-20" }), 201)).item;
    for (const input of [{ status: "unknown" }, { progress: 101 }, { progress: -1 }, { title: "   " }, { dueDate: "2026-02-31" }, { unexpected: true }]) await body(await req(`/workspace/work/${work.id}`, "PATCH", input), 400);
    await body(await req("/workspace/work", "POST", { title: "Invalid date", dueDate: "2026-02-31" }), 400);
    assert.equal((getStore().collections.workItems as Row[]).find(row => row.id === work.id)?.status, "Assigned");
    await body(await req(`/workspace/work/${work.id}`, "PATCH", { status: "Completed", progress: 100 }));
  });

  async function queuedTransfer() {
    const reviewer = await account("TransferReviewer",["hr.view","approvals.view","approvals.approve","finance.view","finance.approve"]);
    const submitter=await account("TransferSubmitter",["finance.view","finance.create"]);
    const first = (await body(await req("/workspace/finance/accounts", "POST", { name: "Source", type: "bank", currency: "QAR", openingBalance: 500, organizationId: "company-primary" }), 201)).item;
    const second = (await body(await req("/workspace/finance/accounts", "POST", { name: "Destination", type: "bank", currency: "QAR", openingBalance: 0, organizationId: "company-primary" }), 201)).item;
    await body(await req("/workspace/access/approval-rules", "POST", { section: "finance", action: "create", active: true }), 201);
    await body(await req("/workspace/finance/transactions", "POST", { type: "transfer", accountId: first.id, destinationAccountId: second.id, amount: 100, date: "2026-10-20", status: "paid", reference: "AUDIT-TRANSFER" }, submitter.cookie), 202);
    const pair = (getStore().collections.approvalRequests as Row[]).filter(row => (row.payload as Row)?.reference === "AUDIT-TRANSFER");
    assert.equal(pair.length, 2); return { reviewer, first, second, pair };
  }
  it("approves both sides of a transfer together and refuses a second decision", async () => {
    const { reviewer, pair, first, second } = await queuedTransfer();
    await body(await req(`/workspace/approvals/${pair[0].id}`, "POST", { decision: "approve" }, reviewer.cookie));
    const data = getStore(); assert.ok(pair.every(request => (data.collections.approvalRequests as Row[]).find(row => row.id === request.id)?.status === "approved"));
    const transactions = (data.collections.financeTransactions as Row[]).filter(row => row.reference === "AUDIT-TRANSFER"); assert.equal(transactions.length, 2);
    const finance = await body(await req("/workspace/finance"));
    assert.equal(finance.accounts.find((row: Row) => row.id === first.id).balance, "400.00");
    assert.equal(finance.accounts.find((row: Row) => row.id === second.id).balance, "100.00");
    await body(await req(`/workspace/approvals/${pair[1].id}`, "POST", { decision: "approve" }, reviewer.cookie), 400);
  });
  it("rolls back both transfer approvals and ledger entries if the second side fails", async () => {
    const { reviewer, pair, second } = await queuedTransfer();
    const data = getStore(); data.collections.financeAccounts = (data.collections.financeAccounts as Row[]).filter(row => row.id !== second.id); saveStore(data);
    await body(await req(`/workspace/approvals/${pair[0].id}`, "POST", { decision: "approve" }, reviewer.cookie), 400);
    assert.ok(pair.every(request => (getStore().collections.approvalRequests as Row[]).find(row => row.id === request.id)?.status === "pending"));
    assert.equal((getStore().collections.financeTransactions as Row[]).filter(row => row.reference === "AUDIT-TRANSFER").length, 0);
  });
  it("rejects both sides of a transfer together without posting money", async () => {
    const { reviewer, pair } = await queuedTransfer();
    await body(await req(`/workspace/approvals/${pair[1].id}`, "POST", { decision: "reject" }, reviewer.cookie));
    assert.ok(pair.every(request => (getStore().collections.approvalRequests as Row[]).find(row => row.id === request.id)?.status === "rejected"));
    assert.equal((getStore().collections.financeTransactions as Row[]).filter(row => row.reference === "AUDIT-TRANSFER").length, 0);
  });

  it("escapes formulas and quoted text in actual collection exports while preserving numeric values", async () => {
    for (const value of ["=1+1", " +SUM(A1)", "\t=HYPERLINK(1)", "@SUM(1)", "-1+1"]) assert.ok(csvCell(value).startsWith('"\''));
    assert.equal(csvCell(-125.5), '"-125.5"'); assert.equal(csvCell('A, "B"'), '"A, ""B"""');
    const data = getStore(); data.collections.suppliers = [{ id: "formula-supplier", name: " =1+1", organizationId: "company-primary" }]; saveStore(data);
    const exported = await body(await req("/workspace/export/suppliers")); assert.ok(exported.csv.includes('"\' =1+1"'));
  });
  it("validates registry enums, dates, times, whitespace and optional numeric limits while preserving unchanged legacy values", () => {
    const fields = [{ key: "name", label: "Name", type: "text" as const, required: true }, { key: "status", label: "Status", type: "select" as const, options: ["active", "inactive"] }, { key: "date", label: "Date", type: "date" as const }, { key: "time", label: "Time", type: "time" as const }, { key: "quantity", label: "Quantity", type: "number" as const, min: 0 }];
    const schema = buildSchema(fields), valid = { name: "Record", status: "active", date: "2024-02-29", time: "23:59", quantity: 1 };
    assert.ok(schema.safeParse(valid).success);
    for (const input of [{ name: "  " }, { status: "invented" }, { date: "2026-02-29" }, { time: "25:00" }, { quantity: -1 }, { quantity: Infinity }]) assert.equal(schema.safeParse({ ...valid, ...input }).success, false);
    assert.ok(buildSchema(fields, { status: "historical" }).safeParse({ ...valid, status: "historical" }).success);
    const requiredNumber = buildSchema([{ key: "count", label: "Count", type: "number", required: true, min: 0 }]);
    for (const count of [undefined, null, "", "   ", false]) assert.equal(requiredNumber.safeParse({ count }).success, false);
    assert.ok(requiredNumber.safeParse({ count: 0 }).success);
  });
  it("returns field-level validation feedback without saving a rejected entity", async () => {
    const result = await body(await req("/collections/departments", "POST", { name: "   ", organizationId: "company-primary" }), 400);
    assert.equal(result.error, "Review the highlighted fields."); assert.equal(result.fieldErrors.name, "This field is required.");
  });
  it("does not grant own-record access after a display-name change, while retaining uniquely linked legacy assignments", async () => {
    const owner = await account("OwnRecordUser", ["operations.view", "operations.edit"]);
    const data = getStore();
    const user = (data.collections.accessUsers as Row[]).find(row => row.id === owner.id)!;
    Object.assign(user, { ownRecordsOnly: true, employeeId: "audit-own-employee" });
    data.collections.employees.push({ id: "audit-own-employee", name: "Linked owner", accountId: owner.id, organizationId: "company-primary" }, { id: "audit-other-employee", name: "Other employee", organizationId: "company-primary" });
    data.collections.workItems = [
      { id: "own-legacy", title: "Own legacy", assignee: "Linked owner", organizationId: "company-primary" },
      { id: "other-legacy", title: "Private legacy", assignee: "Other employee", organizationId: "company-primary" },
      { id: "other-id", title: "Explicit owner", employeeId: "audit-other-employee", assignee: "Linked owner", organizationId: "company-primary" },
    ]; saveStore(data);
    await body(await req("/auth/profile", "PATCH", { name: "Other employee", email: owner.email, phone: "", avatar: "" }, owner.cookie));
    const work = await body(await req("/workspace/work?view=all", "GET", undefined, owner.cookie));
    assert.deepEqual(work.items.map((row: Row) => row.id), ["own-legacy"]);
    await body(await req("/workspace/work/other-id", "PATCH", { status: "Completed" }, owner.cookie), 404);
  });
});
