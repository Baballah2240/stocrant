import { TEST_DATA_DIR } from "./test-env.js";
import { rmSync } from "node:fs";
import { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import type { Notification } from "./types.js";

let server: Server;
let base = "";
let mainCookie = "";
let managerCookie = "";
let mainUserId = "";

function cookieFrom(response: Response) {
  const raw = response.headers.get("set-cookie");
  assert.ok(raw, "expected a session cookie");
  return raw.split(";")[0];
}

function request(path: string, init: RequestInit = {}, cookie?: string) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  return fetch(`${base}/api${path}`, { ...init, headers });
}

async function json<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "string" ? 0 : address?.port;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe("STOCRANT secure workspace API", () => {
  it("keeps health public and all workspace data protected", async () => {
    const health = await request("/health");
    assert.equal(health.status, 200);
    assert.equal((await json<{ ok: boolean }>(health)).ok, true);

    const protectedResponse = await request("/workspace/overview", { headers: { "x-role": "admin" } });
    assert.equal(protectedResponse.status, 401, "x-role cannot bypass authentication");

    // Unauthenticated unknown API paths are refused before routing.
    const unknownUnauth = await request("/definitely-not-a-route");
    assert.equal(unknownUnauth.status, 401);
  });

  it("creates a Main Manager with an HTTP-only secure session and rejects wrong passwords", async () => {
    const setup = await request("/auth/setup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Main Manager", email: "owner@example.test", password: "correct-horse-battery-staple", setupKey: "local-setup" }),
    });
    assert.equal(setup.status, 201);
    mainCookie = cookieFrom(setup);
    const created = await json<{ user: { id: string; roleId: string } }>(setup);
    mainUserId = created.user.id;
    assert.equal(created.user.roleId, "role-main-manager");

    // Authenticated unknown API paths get a JSON 404, never the SPA shell.
    const unknownApi = await request("/definitely-not-a-route", {}, mainCookie);
    assert.equal(unknownApi.status, 404);
    assert.match(String(unknownApi.headers.get("content-type")), /application\/json/);
    assert.equal((await json<{ error: string }>(unknownApi)).error, "Not found.");

    const cookieHeader = setup.headers.get("set-cookie") ?? "";
    assert.match(cookieHeader, /HttpOnly/);
    assert.match(cookieHeader, /SameSite=Lax/);

    const badLogin = await request("/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@example.test", password: "incorrect-password-value" }),
    });
    assert.equal(badLogin.status, 401);
  });

  it("enforces saved permissions instead of a client-selected role", async () => {
    const createManager = await request("/workspace/access/users", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie },
      body: JSON.stringify({ name: "Operations Manager", email: "manager@example.test", password: "a-long-manager-password", roleId: "role-manager" }),
    });
    assert.equal(createManager.status, 201);

    const login = await request("/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "manager@example.test", password: "a-long-manager-password" }),
    });
    assert.equal(login.status, 200);
    managerCookie = cookieFrom(login);

    const forbidden = await request("/workspace/access/users", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: managerCookie, "x-role": "admin" },
      body: JSON.stringify({ name: "Blocked", email: "blocked@example.test", password: "another-long-password", roleId: "role-employee" }),
    });
    assert.equal(forbidden.status, 403);
  });

  it("queues sensitive changes for approval and applies them only after another approver decides", async () => {
    const rule = await request("/workspace/access/approval-rules", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie },
      body: JSON.stringify({ section: "operations", action: "create", active: true }),
    });
    assert.equal(rule.status, 201);

    const work = await request("/workspace/work", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: managerCookie },
      body: JSON.stringify({ title: "Approval-controlled work", priority: "High", status: "Planned", dueDate: "2026-11-01" }),
    });
    assert.equal(work.status, 202);
    const pending = await json<{ pending: boolean; request?: { id: string } }>(work);
    assert.equal(pending.pending, true);
    assert.ok(pending.request?.id);

    const beforeApproval = await request("/workspace/work?view=all", {}, managerCookie);
    const beforeItems = await json<{ items: Array<{ title: string }> }>(beforeApproval);
    assert.equal(beforeItems.items.some((item) => item.title === "Approval-controlled work"), false);

    const approval = await request(`/workspace/approvals/${pending.request!.id}`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie },
      body: JSON.stringify({ decision: "approve" }),
    });
    assert.equal(approval.status, 200);

    const afterApproval = await request("/workspace/work?view=all", {}, managerCookie);
    const afterItems = await json<{ items: Array<{ title: string }> }>(afterApproval);
    assert.equal(afterItems.items.some((item) => item.title === "Approval-controlled work"), true);
  });

  it("calculates inventory, rejects duplicate movements, and blocks negative stock", async () => {
    const itemResponse = await request("/workspace/inventory/items", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie },
      body: JSON.stringify({ sku: "TEST-ITEM", name: "Test ingredient", unit: "kg", stockLocation: "Test warehouse", openingStock: 10, reorderPoint: 3 }),
    });
    assert.equal(itemResponse.status, 201);
    const item = await json<{ item: { id: string } }>(itemResponse);

    const incomingBody = { inventoryItemId: item.item.id, type: "incoming", quantity: 5, date: "2026-10-09", reason: "Initial receipt", reference: "INV-1" };
    const incoming = await request("/workspace/inventory/movements", { method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie }, body: JSON.stringify(incomingBody) });
    assert.equal(incoming.status, 201);
    const duplicate = await request("/workspace/inventory/movements", { method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie }, body: JSON.stringify(incomingBody) });
    assert.equal(duplicate.status, 409);

    const negative = await request("/workspace/inventory/movements", { method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie }, body: JSON.stringify({ ...incomingBody, type: "outgoing", quantity: 20, reason: "Too much issue", reference: "INV-2" }) });
    assert.equal(negative.status, 400);

    const inventory = await request("/workspace/inventory", {}, mainCookie);
    const inventoryBody = await json<{ items: Array<{ id: string; available: number }> }>(inventory);
    assert.equal(inventoryBody.items.find((row) => row.id === item.item.id)?.available, 15);
  });

  it("calculates finance balances and excludes internal transfers from income and expenses", async () => {
    const accountA = await request("/workspace/finance/accounts", { method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie }, body: JSON.stringify({ name: "Test bank", type: "bank", currency: "USD", openingBalance: 100 }) });
    const accountB = await request("/workspace/finance/accounts", { method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie }, body: JSON.stringify({ name: "Test cash", type: "cash", currency: "USD", openingBalance: 0 }) });
    const first = await json<{ item: { id: string } }>(accountA); const second = await json<{ item: { id: string } }>(accountB);
    assert.equal(accountA.status, 201); assert.equal(accountB.status, 201);

    const income = await request("/workspace/finance/transactions", { method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie }, body: JSON.stringify({ type: "income", accountId: first.item.id, amount: 40, date: "2026-10-09", status: "paid", reference: "SALE-1" }) });
    const expense = await request("/workspace/finance/transactions", { method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie }, body: JSON.stringify({ type: "expense", accountId: first.item.id, amount: 25, date: "2026-10-09", status: "paid", reference: "EXP-1" }) });
    const transfer = await request("/workspace/finance/transactions", { method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie }, body: JSON.stringify({ type: "transfer", accountId: first.item.id, destinationAccountId: second.item.id, amount: 10, date: "2026-10-09", status: "paid", reference: "TRF-1" }) });
    assert.equal(income.status, 201); assert.equal(expense.status, 201); assert.equal(transfer.status, 201);

    const finance = await request("/workspace/finance", {}, mainCookie);
    const body = await json<{ income: number; expenses: number; net: number; accounts: Array<{ id: string; balance: number }> }>(finance);
    assert.equal(body.income, 40);
    assert.equal(body.expenses, 25);
    assert.equal(body.net, 15);
    assert.equal(body.accounts.find((account) => account.id === first.item.id)?.balance, 105);
    assert.equal(body.accounts.find((account) => account.id === second.item.id)?.balance, 10);
  });

  it("prevents the last Main Manager from being deactivated", async () => {
    const response = await request(`/workspace/access/users/${mainUserId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: mainCookie }, body: JSON.stringify({ status: "inactive" }),
    });
    assert.equal(response.status, 400);
  });

describe("action-required notifications", () => {
  it("emits, filters and marks action-required alerts per user", async () => {
    const targetEmail = `target+${Date.now()}@example.test`;
    const createUser = await request("/workspace/access/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: mainCookie },
      body: JSON.stringify({
        name: "Target User",
        email: targetEmail,
        password: "correct-horse-battery-staple",
        roleId: "role-manager",
      }),
    });
    assert.equal(createUser.status, 201);

    const login = await request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: targetEmail, password: "correct-horse-battery-staple" }),
    });
    assert.equal(login.status, 200);
    const user = await json<{ user: { id: string } }>(login);
    const userCookie = cookieFrom(login);

    const lowStock = await request("/workspace/inventory/items", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({
        sku: "SN-OVER",
        name: "Dry yeast",
        unit: "box",
        stockLocation: "Main",
        openingStock: 1,
        reorderPoint: 5,
      }),
    });
    assert.equal(lowStock.status, 201);

    // An earlier test may have left an operations.create approval rule active,
    // which would queue the work item instead of emitting the overdue alert.
    const rulesResponse = await request("/workspace/access/approval-rules", { headers: { Cookie: mainCookie } });
    const rules = await json<{ items: Array<{ id: string; section: string; action: string; active: boolean }> }>(rulesResponse);
    const operationsCreateRule = rules.items.find((rule) => rule.section === "operations" && rule.action === "create" && rule.active);
    if (operationsCreateRule) {
      const deactivate = await request(`/workspace/access/approval-rules/${operationsCreateRule.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Cookie: mainCookie },
        body: JSON.stringify({ active: false }),
      });
      assert.equal(deactivate.status, 200);
    }

    const overdue = await request("/workspace/work", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ title: "Finish recipe card", dueDate: "2000-01-01", status: "Planned" }),
    });
    assert.equal(overdue.status, 201);

    const deniedLogin = await request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: targetEmail, password: "definitely-wrong-password" }),
    });
    assert.equal(deniedLogin.status, 401);

    const notifications = await request("/notifications", { headers: { Cookie: userCookie } });
    assert.equal(notifications.status, 200);
    const list = await json<{ items: Notification[] }>(notifications);
    assert.equal(list.items.length, 3);
    assert.equal(list.items.filter((item) => !item.read).length, 3);
    assert.equal(list.items.find((item) => item.type === "low_stock")?.userId, user.user.id);
    assert.equal(list.items.find((item) => item.type === "overdue_work")?.message, "Work item \"Finish recipe card\" is overdue.");
    assert.equal(list.items.find((item) => item.type === "unauthorized_access")?.target, targetEmail);

    const readAll = await request("/notifications/read-all", { method: "POST", headers: { Cookie: userCookie } });
    assert.equal(readAll.status, 200);
    const readAllBody = await json<{ success: boolean; count: number }>(readAll);
    assert.equal(readAllBody.success, true);
    assert.equal(readAllBody.count, 3);

    const afterReadAll = await request("/notifications", { headers: { Cookie: userCookie } });
    assert.equal((await json<{ items: Notification[] }>(afterReadAll)).items.every((item) => item.read), true);

    const markOne = await request(`/notifications/${list.items[0].id}/read`, { method: "POST", headers: { Cookie: userCookie } });
    assert.equal(markOne.status, 200);
    const marked = await json<{ success: boolean; item: Notification }>(markOne);
    assert.equal(marked.item.read, true);

    // Another signed-in user must not be able to touch someone else's alert.
    const foreignMark = await request(`/notifications/${list.items[0].id}/read`, { method: "POST", headers: { Cookie: managerCookie } });
    assert.equal(foreignMark.status, 404);
    const foreignList = await request("/notifications", { headers: { Cookie: managerCookie } });
    const foreignItems = (await json<{ items: Notification[] }>(foreignList)).items;
    assert.equal(foreignItems.some((item) => list.items.some((owned) => owned.id === item.id)), false);
  });
});

});