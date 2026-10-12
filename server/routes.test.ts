import { TEST_DATA_DIR } from "./test-env.js";
import { financeSummary, mutateCollection } from "./workspace.js";
import { getStore, saveStore } from "./storage.js";
import type { AuthenticatedUser } from "./auth.js";
import { rmSync } from "node:fs";
import { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { resetFailures } from "./rate-limit.js";
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
  // General account/product fixtures belong to the seeded primary company.
  if (init.method === "POST" && typeof init.body === "string" && ["/workspace/access/users", "/collections/products"].includes(path)) {
    const input = JSON.parse(init.body);
    if (path === "/workspace/access/users" && !input.employeeId && input.organizationIds === undefined) input.organizationIds = ["company-primary"];
    if (path === "/collections/products" && input.organizationId === undefined) input.organizationId = "company-primary";
    init = { ...init, body: JSON.stringify(input) };
  }
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  return fetch(`${base}/api${path}`, { ...init, headers });
}

async function json<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

before(async () => {
  resetFailures();
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
    const serverSource = await fetch(base + "/auth.js");
    assert.equal(serverSource.status, 404, "compiled server source must not be public");
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
    const setupInput = {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Main Manager", email: "owner@example.test", password: "correct-horse-battery-staple", setupKey: "local-setup" }),
    };
    const setupResults = await Promise.all([request("/auth/setup", setupInput), request("/auth/setup", setupInput)]);
    assert.deepEqual(setupResults.map(response => response.status).sort(), [201, 409], "concurrent setup must create exactly one manager");
    const setup = setupResults.find(response => response.status === 201)!;
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

  it("keeps web and native sessions active while accepting the native bearer session", async () => {
    const nativeLogin = await request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-STOCRANT-NATIVE": "1" },
      body: JSON.stringify({ email: "owner@example.test", password: "correct-horse-battery-staple" }),
    });
    assert.equal(nativeLogin.status, 200);
    const native = await json<{ sessionToken?: string }>(nativeLogin);
    assert.ok(native.sessionToken, "native login returns a bearer session");

    const nativeOverview = await request("/workspace/overview", { headers: { Authorization: `Bearer ${native.sessionToken}` } });
    assert.equal(nativeOverview.status, 200);
    const webOverview = await request("/workspace/overview", {}, mainCookie);
    assert.equal(webOverview.status, 200, "web session remains valid after native sign-in");
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

  it("restricts access settings to main admin and applies employee permissions immediately", async () => {
    for (const path of ["/workspace/access/users", "/workspace/access/roles", "/workspace/access/approval-rules", "/workspace/audit"]) {
      assert.equal((await request(path, {}, managerCookie)).status, 403);
      assert.equal((await request(path, {}, mainCookie)).status, 200);
    }
    const users = await json<{ items: { id: string; email: string }[] }>(await request("/workspace/access/users", {}, mainCookie));
    const manager = users.items.find((user) => user.email === "manager@example.test")!;
    const patch = (permissions: string[] | null) => request(`/workspace/access/users/${manager.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions }) }, mainCookie);
    assert.equal((await patch(["inventory.view"])).status, 200);
    assert.equal((await request("/workspace/work", {}, managerCookie)).status, 403);
    assert.equal((await request("/workspace/inventory", {}, managerCookie)).status, 200);
    assert.equal((await patch(["access.view"])).status, 400);
    assert.equal((await patch(null)).status, 200);
    assert.equal((await request("/workspace/work", {}, managerCookie)).status, 200);
  });

  it("allows only the main admin to manage employees and exposes company HR details", async () => {
    const companyResponse = await request("/workspace/hr/companies", {}, mainCookie);
    assert.equal(companyResponse.status, 200);
    const data = await json<{ companies: { id: string }[]; employees: unknown[] }>(companyResponse);
    assert.ok(Array.isArray(data.companies));
    assert.ok(Array.isArray(data.employees));
    const payload = { employeeCode: "HR-CONTROL", name: "HR control test", email: "hr-control@example.test", employmentType: "full-time", status: "active", hireDate: "2026-10-10", organizationId: data.companies[0]?.id ?? "" };
    for (const organizationId of ["", "missing-company"]) {
      const invalid = await request("/collections/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, organizationId }) }, mainCookie);
      assert.equal(invalid.status, 400);
    }
    const create = await request("/collections/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, mainCookie);
    assert.equal(create.status, 201);
    const { item } = await json<{ item: { id: string } }>(create);
    for (const [method, path] of [["POST", "/collections/employees"], ["PATCH", `/collections/employees/${item.id}`], ["DELETE", `/collections/employees/${item.id}`]]) {
      const denied = await request(path, { method, headers: { "Content-Type": "application/json", "x-role": "role-main-manager" }, body: JSON.stringify(payload) }, managerCookie);
      assert.equal(denied.status, 403);
    }
    assert.equal((await request(`/collections/employees/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobTitle: "Updated" }) }, mainCookie)).status, 200);
    assert.equal((await request(`/collections/employees/${item.id}`, { method: "DELETE" }, mainCookie)).status, 200);
  });

  it("gives only the Main Manager an audited immediate account override and personal workday briefing", async () => {
    const mainOverview = await request("/workspace/overview", {}, mainCookie);
    assert.equal(mainOverview.status, 200);
    const mainOverviewBody = await json<{ personal: { attendanceEnabled: boolean } }>(mainOverview);
    assert.equal(mainOverviewBody.personal.attendanceEnabled, false);

    const hrOverview = await request("/workspace/hr/overview", {}, mainCookie);
    assert.equal(hrOverview.status, 200);
    const hrOverviewBody = await json<{ today: string; metrics: { totalEmployees: number; activeEmployees: number; attendanceRecorded: number; pendingLeave: number }; attendance: unknown[]; leaveRequests: unknown[]; activity: unknown[] }>(hrOverview);
    assert.match(hrOverviewBody.today, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(hrOverviewBody.metrics.totalEmployees >= hrOverviewBody.metrics.activeEmployees);
    assert.equal(Array.isArray(hrOverviewBody.attendance), true);
    assert.equal(Array.isArray(hrOverviewBody.leaveRequests), true);
    assert.equal(Array.isArray(hrOverviewBody.activity), true);

    const mainCheckIn = await request("/workspace/attendance/check-in", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie },
    });
    assert.equal(mainCheckIn.status, 403);

    const mainCheckOut = await request("/workspace/attendance/check-out", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie },
    });
    assert.equal(mainCheckOut.status, 403);

    // Give the existing Manager account access administration permissions. It
    // must still not receive the Main Manager's direct-account override.
    const grantAccess = await request("/workspace/access/roles/role-manager", {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: mainCookie },
      body: JSON.stringify({ permissions: ["organizations.view", "locations.view", "locations.create", "locations.edit", "hr.view", "hr.create", "hr.edit", "operations.*", "inventory.*", "finance.view", "finance.create", "finance.edit", "approvals.view", "approvals.approve", "access.view", "access.create", "access.edit"] }),
    });
    assert.equal(grantAccess.status, 200);

    const employee = await request("/collections/employees", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie },
      body: JSON.stringify({ organizationId: "company-primary", employeeCode: "EMP-DASH", name: "Dashboard Employee", email: "dashboard.employee@example.test", department: "Operations", jobTitle: "Shift Lead", employmentType: "full-time", status: "active", hireDate: "2026-01-01", manager: "Main Manager" }),
    });
    assert.equal(employee.status, 201);
    const employeeBody = await json<{ item: { id: string } }>(employee);

    const policy = await request("/collections/documents", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie },
      body: JSON.stringify({ organizationId: "company-primary", employee: "all", audience: "company-wide", type: "policy", title: "Mobile work and safety policy", issuedOn: "2026-10-09", fileUrl: "https://example.test/policies/mobile-work" }),
    });
    assert.equal(policy.status, 201);

    const account = await request("/workspace/access/users", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie },
      body: JSON.stringify({ name: "Dashboard Employee", email: "dashboard.employee@example.test", password: "employee-original-password", roleId: "role-employee", employeeId: employeeBody.item.id, ownRecordsOnly: true }),
    });
    assert.equal(account.status, 201);
    const accountBody = await json<{ item: { id: string } }>(account);

    const employeeLogin = await request("/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "dashboard.employee@example.test", password: "employee-original-password" }),
    });
    assert.equal(employeeLogin.status, 200);
    const employeeCookie = cookieFrom(employeeLogin);

    const overview = await request("/workspace/overview", {}, employeeCookie);
    assert.equal(overview.status, 200);
    const overviewBody = await json<{ personal: { attendanceEnabled: boolean; profile: { name: string; jobTitle?: string }; lastLoginAt?: string; policyUpdates: Array<{ title: string; isNew: boolean }> } }>(overview);
    assert.equal(overviewBody.personal.profile.name, "Dashboard Employee");
    assert.equal(overviewBody.personal.profile.jobTitle, "Shift Lead");
    assert.equal(overviewBody.personal.attendanceEnabled, true);
    assert.ok(overviewBody.personal.lastLoginAt, "successful sign-ins must be visible on the personal dashboard");
    assert.equal(overviewBody.personal.policyUpdates.some((item) => item.title === "Mobile work and safety policy" && item.isNew), true);

    const checkOutBeforeCheckIn = await request("/workspace/attendance/check-out", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: employeeCookie },
    });
    assert.equal(checkOutBeforeCheckIn.status, 409);

    const checkIn = await request("/workspace/attendance/check-in", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: employeeCookie },
    });
    assert.equal(checkIn.status, 201);
    const checkInBody = await json<{ item: { id: string; employeeId: string; date: string; checkIn: string; checkOut?: string; status: string } }>(checkIn);
    assert.equal(checkInBody.item.employeeId, employeeBody.item.id);
    assert.match(checkInBody.item.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(checkInBody.item.checkIn, /^\d{2}:\d{2}$/);
    assert.equal(checkInBody.item.status, "present");

    const duplicateCheckIn = await request("/workspace/attendance/check-in", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: employeeCookie },
    });
    assert.equal(duplicateCheckIn.status, 409);

    const checkOut = await request("/workspace/attendance/check-out", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: employeeCookie },
    });
    assert.equal(checkOut.status, 200);
    const checkOutBody = await json<{ item: { id: string; checkOut: string; hours: number } }>(checkOut);
    assert.equal(checkOutBody.item.id, checkInBody.item.id);
    assert.match(checkOutBody.item.checkOut, /^\d{2}:\d{2}$/);
    assert.equal(typeof checkOutBody.item.hours, "number");

    const checkedOutOverview = await request("/workspace/overview", {}, employeeCookie);
    assert.equal(checkedOutOverview.status, 200);
    const checkedOutOverviewBody = await json<{ personal: { attendance: { checkOut?: string } | null } }>(checkedOutOverview);
    assert.equal(checkedOutOverviewBody.personal.attendance?.checkOut, checkOutBody.item.checkOut);

    const duplicateCheckOut = await request("/workspace/attendance/check-out", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: employeeCookie },
    });
    assert.equal(duplicateCheckOut.status, 409);
    for (let session = 2; session <= 3; session++) {
      const nextIn = await request("/workspace/attendance/check-in", { method: "POST" }, employeeCookie);
      assert.equal(nextIn.status, 200);
      const nextInBody = await json<{ item: { id: string; sessions: { checkIn: string; checkOut?: string; hours: number }[] } }>(nextIn);
      assert.equal(nextInBody.item.id, checkInBody.item.id, "sessions stay in the same daily record");
      assert.equal(nextInBody.item.sessions.length, session);
      assert.equal(nextInBody.item.sessions[session - 1].checkOut, undefined);
      assert.equal((await request("/workspace/attendance/check-in", { method: "POST" }, employeeCookie)).status, 409, "cannot overlap sessions");
      const nextOut = await request("/workspace/attendance/check-out", { method: "POST" }, employeeCookie);
      assert.equal(nextOut.status, 200);
      const nextOutBody = await json<{ item: { hours: number; sessions: { checkOut: string; hours: number }[] } }>(nextOut);
      assert.ok(nextOutBody.item.sessions.every(item => item.checkOut));
      assert.equal(nextOutBody.item.hours, Number(nextOutBody.item.sessions.reduce((sum, item) => sum + item.hours, 0).toFixed(2)));
    }
    assert.equal((await request("/workspace/attendance/check-in", { method: "POST" }, employeeCookie)).status, 409, "fourth daily session is refused");

    const managerCannotPromote = await request("/workspace/access/users", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: managerCookie },
      body: JSON.stringify({ name: "Unauthorized Main Manager", email: "unauthorized.manager@example.test", password: "unauthorized-manager-password", roleId: "role-main-manager" }),
    });
    assert.equal(managerCannotPromote.status, 403);

    const managerCannotOverride = await request(`/workspace/access/users/${accountBody.item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: managerCookie },
      body: JSON.stringify({ status: "inactive" }),
    });
    assert.equal(managerCannotOverride.status, 403);

    const newPassword = "employee-replacement-password";
    const override = await request(`/workspace/access/users/${accountBody.item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: mainCookie },
      body: JSON.stringify({ name: "Dashboard Employee Updated", email: "dashboard.employee.updated@example.test", roleId: "role-employee", employeeId: employeeBody.item.id, organizationIds: ["company-primary"], locationIds: ["st-001"], ownRecordsOnly: true, status: "active", password: newPassword }),
    });
    assert.equal(override.status, 200);
    const overrideBody = await json<{ item: { name: string; email: string; passwordHash?: string } }>(override);
    assert.equal(overrideBody.item.name, "Dashboard Employee Updated");
    assert.equal(overrideBody.item.email, "dashboard.employee.updated@example.test");
    assert.equal(overrideBody.item.passwordHash, undefined, "account responses must never return a password hash");

    const revokedSession = await request("/workspace/overview", {}, employeeCookie);
    assert.equal(revokedSession.status, 401, "a password reset must revoke the target's existing sessions");
    const newLogin = await request("/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "dashboard.employee.updated@example.test", password: newPassword }),
    });
    assert.equal(newLogin.status, 200);

    const auditResponse = await request("/workspace/audit", {}, mainCookie);
    assert.equal(auditResponse.status, 200);
    const auditBody = await json<{ items: Array<{ action: string; targetId?: string; changedFields?: string[]; sessionsRevoked?: boolean }> }>(auditResponse);
    const auditEntry = auditBody.items.find((item) => item.action === "access.user-directly-updated" && item.targetId === accountBody.item.id);
    assert.ok(auditEntry);
    assert.deepEqual(auditEntry.changedFields?.sort(), ["email", "locationIds", "name", "password"].sort());
    assert.equal(auditEntry.sessionsRevoked, true);
    assert.equal(JSON.stringify(auditEntry).includes(newPassword), false, "audit records must never contain a password value");
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
    const requesterInbox = await json<{ items: Notification[] }>(await request("/notifications", {}, managerCookie));
    const decision = requesterInbox.items.find(item => item.type === "message" && item.target === pending.request!.id);
    assert.ok(decision);
    assert.match(decision.message, /approved/);
    const ownerInbox = await json<{ items: Notification[] }>(await request("/notifications", {}, mainCookie));
    assert.ok(!ownerInbox.items.some(item => item.id === decision.id), "requester decisions stay in their own inbox");

    const afterApproval = await request("/workspace/work?view=all", {}, managerCookie);
    const afterItems = await json<{ items: Array<{ title: string }> }>(afterApproval);
    assert.equal(afterItems.items.some((item) => item.title === "Approval-controlled work"), true);
  });

  it("calculates inventory, rejects duplicate movements, and blocks negative stock", async () => {
    const itemResponse = await request("/workspace/inventory/items", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie },
      body: JSON.stringify({ organizationId: "company-primary", itemType: "ingredient", sku: "TEST-ITEM", name: "Test ingredient", unit: "kg", stockLocation: "Test warehouse", openingStock: 10, reorderPoint: 3 }),
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

  it("enforces selected employee inventory access and records each editor and time", async () => {
    const employeeResponse = await request("/collections/employees", {}, mainCookie);
    const { items: employees } = await json<{ items: { id: string; organizationId: string }[] }>(employeeResponse);
    const employee = employees.find((item) => item.organizationId === "company-primary");
    assert.ok(employee);
    const payload = { organizationId: "company-primary", itemType: "equipment", allowedEmployeeIds: [employee.id], sku: "ACCESS-TEST", name: "Restricted equipment", unit: "unit", stockLocation: "Main", openingStock: 2, reorderPoint: 1 };
    const created = await request("/workspace/inventory/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, mainCookie);
    assert.equal(created.status, 201);
    const { item } = await json<{ item: { id: string } }>(created);
    const managerInventory = await json<{ items: { id: string }[]; history: { inventoryItemId: string }[] }>(await request("/workspace/inventory", {}, managerCookie));
    assert.ok(!managerInventory.items.some((row) => row.id === item.id));
    assert.ok(!managerInventory.history.some((row) => row.inventoryItemId === item.id));
    const changes = { name: "Updated equipment", unit: "unit", stockLocation: "Main", itemType: "equipment", reorderPoint: 2, notes: "Reviewed" };
    assert.equal((await request(`/workspace/inventory/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) }, managerCookie)).status, 404);
    assert.equal((await request("/workspace/inventory/movements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inventoryItemId: item.id, type: "incoming", quantity: 1, date: "2026-10-10", reason: "Blocked" }) }, managerCookie)).status, 404);
    assert.equal((await request(`/workspace/inventory/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) }, mainCookie)).status, 200);
    const inventory = await json<{ history: { inventoryItemId: string; actorId: string; occurredAt: string; changedFields: string[] }[] }>(await request("/workspace/inventory", {}, mainCookie));
    const edits = inventory.history.filter((row) => row.inventoryItemId === item.id);
    assert.equal(edits.length, 2);
    assert.equal(edits[1].actorId, mainUserId);
    assert.ok(Number.isFinite(Date.parse(edits[1].occurredAt)));
    assert.ok(edits[1].changedFields.includes("name"));
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

  it("tracks company money directions and excludes pending payments from balances", async () => {
    const created = await request("/workspace/finance/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Company SAR", type: "bank", currency: "SAR", openingBalance: 100, organizationId: "company-primary" }) }, mainCookie);
    assert.equal(created.status, 201);
    const { item } = await json<{ item: { id: string } }>(created);
    const movement = { type: "loan", direction: "in", accountId: item.id, amount: 50, date: "2026-10-11", status: "paid", personName: "Business lender", category: "Working capital" };
    assert.equal((await request("/workspace/finance/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(movement) }, mainCookie)).status, 201);
    assert.equal((await request("/workspace/finance/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...movement, type: "repayment", direction: "out", amount: 30, status: "pending" }) }, mainCookie)).status, 201);
    const finance = await json<{ accounts: { id: string; balance: number }[]; transactions: { accountId: string; organizationId: string; personName: string }[] }>(await request("/workspace/finance", {}, mainCookie));
    assert.equal(finance.accounts.find((account) => account.id === item.id)?.balance, 150);
    const rows = finance.transactions.filter((row) => row.accountId === item.id);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.organizationId === "company-primary" && row.personName === "Business lender"));
    const foreign = await request("/workspace/finance/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "USD destination", type: "bank", currency: "USD", openingBalance: 0 }) }, mainCookie);
    const foreignItem = await json<{ item: { id: string } }>(foreign);
    assert.equal((await request("/workspace/finance/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...movement, type: "transfer", destinationAccountId: foreignItem.item.id }) }, mainCookie)).status, 400);
  });

  it("stores finance movement times and rejects invalid dates or times", async () => {
    const input = { type: "income", accountId: "account-operating", amount: 1, date: "2026-10-11", time: "14:30", status: "paid", reference: "DATE-TIME-CHECK" };
    const send = (body: object) => request("/workspace/finance/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, mainCookie);
    assert.equal((await send({ ...input, time: "25:00" })).status, 400);
    assert.equal((await send({ ...input, date: "2026-02-30" })).status, 400);
    const response = await send(input); assert.equal(response.status, 201);
    const body = await json<{ item: { date: string; time: string } }>(response);
    assert.equal(body.item.date, input.date); assert.equal(body.item.time, input.time);
  });

  it("lets users edit only their profile and verifies passwords before rotating sessions", async () => {
    const credentials = { email: "profile@example.test", password: "profile-original-password" };
    assert.equal((await request("/workspace/access/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...credentials, name: "Profile User", roleId: "role-employee" }) }, mainCookie)).status, 201);
    const login = await request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) });
    const cookie = cookieFrom(login);
    const profile = { name: "Updated Profile", email: credentials.email, phone: "+966555000000", avatar: "data:image/png;base64,aGVsbG8=" };
    assert.equal((await request("/auth/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...profile, roleId: "role-main-manager" }) }, cookie)).status, 400);
    const update = await request("/auth/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) }, cookie);
    assert.equal(update.status, 200);
    const result = await json<{ user: { name: string; phone: string; avatar: string; roleId: string } }>(update);
    assert.equal(result.user.name, profile.name);
    assert.equal(result.user.phone, profile.phone);
    assert.equal(result.user.avatar, profile.avatar);
    assert.equal(result.user.roleId, "role-employee");
    assert.equal((await request("/auth/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...profile, email: "changed-profile@example.test" }) }, cookie)).status, 400);
    const change = (currentPassword: string) => request("/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword: "profile-replacement-password" }) }, cookie);
    assert.equal((await change("incorrect-password")).status, 400);
    assert.equal((await change(credentials.password)).status, 200);
    assert.equal((await request("/auth/me", {}, cookie)).status, 401);
    assert.equal((await request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) })).status, 401);
    assert.equal((await request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...credentials, password: "profile-replacement-password" }) })).status, 200);
  });

  it("sends password reset requests only to main managers without revealing accounts", async () => {
    const send = (email: string) => request("/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const known = await send("manager@example.test");
    assert.equal(known.status, 200);
    const unknown = await send("nonexistent@example.test");
    assert.equal(unknown.status, 200);
    assert.deepEqual(await known.json(), await unknown.json());
    const notifications = await json<{ items: Notification[] }>(await request("/notifications", {}, mainCookie));
    const reset = notifications.items.filter((notification) => notification.type === "password_reset");
    assert.equal(reset.length, 1);
    assert.equal(reset[0].userId, mainUserId);
    assert.ok(reset[0].target);
    await send("manager@example.test");
    const repeated = await json<{ items: Notification[] }>(await request("/notifications", {}, mainCookie));
    assert.equal(repeated.items.filter((notification) => notification.type === "password_reset").length, 1);
    const manager = await json<{ items: Notification[] }>(await request("/notifications", {}, managerCookie));
    assert.ok(!manager.items.some((notification) => notification.type === "password_reset"));
  });

  it("supports mobile employee leave requests while protecting other employees and HR administration", async () => {
    const employee = await request("/collections/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: "company-primary", employeeCode: "MOBILE-ESS", name: "Mobile Employee", email: "mobile-ess@example.test", employmentType: "full-time", status: "active", hireDate: "2026-10-11" }) }, mainCookie);
    assert.equal(employee.status, 201);
    const employeeBody = await json<{ item: { id: string } }>(employee);
    const credentials = { email: "mobile-ess@example.test", password: "mobile-employee-password" };
    assert.equal((await request("/workspace/access/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...credentials, name: "Mobile Employee", roleId: "role-employee", employeeId: employeeBody.item.id, ownRecordsOnly: true }) }, mainCookie)).status, 201);
    const login = await request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) });
    const cookie = cookieFrom(login);
    const form = { type: "annual", from: "2026-11-01", to: "2026-11-03", reason: "Family time" };
    const leave = await request("/workspace/self-service/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }, cookie);
    assert.equal(leave.status, 201);
    const body = await json<{ item: { id: string; employeeId: string; status: string; days: number } }>(leave);
    assert.equal(body.item.employeeId, employeeBody.item.id);
    assert.equal(body.item.status, "pending");
    assert.equal(body.item.days, 3);
    assert.equal((await request("/workspace/self-service/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, employeeId: "someone-else", status: "approved" }) }, cookie)).status, 400);
    assert.equal((await request("/workspace/self-service/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }, cookie)).status, 409);
    const own = await json<{ employee: { id: string }; leave: { id: string }[] }>(await request("/workspace/self-service", {}, cookie));
    assert.equal(own.employee.id, employeeBody.item.id);
    assert.equal(own.leave.length, 1);
    assert.equal((await request(`/workspace/self-service/leave/${body.item.id}/cancel`, { method: "POST" }, managerCookie)).status, 404);
    assert.equal((await request(`/workspace/self-service/leave/${body.item.id}/cancel`, { method: "POST" }, cookie)).status, 200);
    assert.equal((await request(`/collections/employees/${employeeBody.item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Blocked" }) }, cookie)).status, 403);
  });

  it("allows account-based leave without HR permissions and denies the main admin", async () => {
    const credentials = { email: "leave-only@example.test", password: "leave-only-password" };
    assert.equal((await request("/workspace/access/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...credentials, name: "Leave User", roleId: "role-employee", permissions: [] }) }, mainCookie)).status, 201);
    const cookie = cookieFrom(await request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) }));
    const form = { type: "annual", from: "2026-12-01", to: "2026-12-02", reason: "Personal time" };
    const send = (auth: string) => request("/workspace/self-service/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }, auth);
    assert.equal((await send(mainCookie)).status, 403);
    const response = await send(cookie); assert.equal(response.status, 201);
    const body = await json<{ item: { id: string; accountId: string; employeeId?: string } }>(response);
    assert.ok(body.item.accountId); assert.equal(body.item.employeeId, undefined);
    assert.equal((await send(cookie)).status, 409);
    const own = await json<{ leave: { id: string }[] }>(await request("/workspace/self-service", {}, cookie));
    assert.ok(own.leave.some(record => record.id === body.item.id));
    assert.equal((await request(`/workspace/self-service/leave/${body.item.id}/cancel`, { method: "POST" }, managerCookie)).status, 404);
    assert.equal((await request(`/workspace/self-service/leave/${body.item.id}/cancel`, { method: "POST" }, cookie)).status, 200);
  });

  it("allows an unlinked manager to check in and out using their own account", async () => {
    const profileResponse = await request("/auth/me", {}, managerCookie);
    const profile = await json<{ user: { id: string; position: string; description: string } }>(profileResponse);
    assert.equal(profile.user.position, "Manager");
    assert.ok(profile.user.description);
    const checkIn = await request("/workspace/attendance/check-in", { method: "POST" }, managerCookie);
    assert.equal(checkIn.status, 201);
    const body = await json<{ item: { accountId: string; employeeId?: string } }>(checkIn);
    assert.equal(body.item.accountId, profile.user.id);
    assert.equal(body.item.employeeId, undefined);
    assert.equal((await request("/workspace/attendance/check-in", { method: "POST" }, managerCookie)).status, 409);
    assert.equal((await request("/workspace/attendance/check-out", { method: "POST" }, managerCookie)).status, 200);
    assert.equal((await request("/workspace/attendance/check-out", { method: "POST" }, managerCookie)).status, 409);
    assert.equal((await request("/workspace/attendance/check-in", { method: "POST" }, managerCookie)).status, 200);
    const own = await json<{ attendance: { accountId: string }[] }>(await request("/workspace/self-service", {}, managerCookie));
    assert.ok(own.attendance.some((record) => record.accountId === profile.user.id));
    assert.equal((await request("/workspace/attendance/check-in", { method: "POST" }, mainCookie)).status, 403);
    assert.equal((await request("/workspace/attendance/check-out", { method: "POST" }, mainCookie)).status, 403);
  });

  it("keeps financial totals and proposed mutations within the user company scope", async () => {
    const response = await json<{ user: AuthenticatedUser }>(await request("/auth/me", {}, managerCookie));
    const user = { ...response.user, organizationIds: ["scope-company-one"], locationIds: [], ownRecordsOnly: false };
    const data = getStore();
    data.collections.financeAccounts.push({ id: "scope-account-hidden", organizationId: "scope-company-two", openingBalance: 50000 });
    data.collections.financeTransactions.push({ id: "scope-payment-hidden", accountId: "scope-account-hidden", organizationId: "scope-company-two", type: "income", direction: "in", amount: 50000, status: "paid" });
    saveStore(data);
    const summary = financeSummary(user);
    assert.ok(!summary.accounts.some(account => account.id === "scope-account-hidden"));
    assert.ok(!summary.transactions.some(item => item.id === "scope-payment-hidden"));
    assert.equal(summary.income, 0);
    assert.throws(() => mutateCollection(user, "workItems", "create", { title: "Out of scope", organizationId: "scope-company-two" }), /record scope/);
  });

  it("handles malformed cookies and request bodies without exposing server errors", async () => {
    assert.equal((await request("/auth/status", { headers: { Cookie: "stocrant_session=%ZZ" } })).status, 200);
    const invalid = await request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{bad" });
    assert.equal(invalid.status, 400);
    assert.equal((await json<{ error: string }>(invalid)).error, "Invalid request body.");
  });

  it("keeps the public website separate from the management API", async () => {
    assert.equal((await request("/public/info", {}, mainCookie)).status, 404);
    assert.equal((await request("/public/inquiries", {}, mainCookie)).status, 404);
  });

  it("requires strong production secrets and blocks untrusted mutation origins", async () => {
    const oldMode = process.env.NODE_ENV, oldSecret = process.env.STOCRANT_SESSION_SECRET;
    try {
      process.env.NODE_ENV = "production"; process.env.STOCRANT_SESSION_SECRET = "weak";
      assert.throws(() => createApp(), /private random secret/);
      process.env.STOCRANT_SESSION_SECRET = "test-production-secret-only-32-characters";
      const prod = createApp().listen(0); await new Promise<void>(resolve => prod.once("listening", resolve));
      const address = prod.address(); const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
      try {
        const health = await fetch(origin + "/api/health");
        assert.ok(health.headers.get("content-security-policy"));
        assert.ok(health.headers.get("strict-transport-security"));
        assert.equal((await fetch(origin + "/api/auth/login", { method: "POST", headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" }, body: "{}" })).status, 403);
      } finally { await new Promise<void>(resolve => prod.close(() => resolve())); }
    } finally {
      if (oldMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldMode;
      if (oldSecret === undefined) delete process.env.STOCRANT_SESSION_SECRET; else process.env.STOCRANT_SESSION_SECRET = oldSecret;
    }
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
        organizationId: "company-primary", itemType: "ingredient", sku: "SN-OVER",
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

describe("hardened authentication and scoping", () => {
  it("rejects sign-in attempts after repeated failures from one account", async () => {
    const email = `brute+${Date.now()}@example.test`;
    let locked = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await request("/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "wrong-password-entirely" }),
      });
      if (response.status === 429) {
        assert.ok(response.headers.get("retry-after"), "429 must advertise Retry-After");
        locked = true;
        break;
      }
      assert.equal(response.status, 401);
    }
    assert.equal(locked, true, "repeated failures should trip the rate limiter");
    // Every request in this suite comes from 127.0.0.1, so the per-IP counter
    // must be cleared before later tests attempt their own sign-ins.
    resetFailures();
  });

  it("keeps own-records roles from editing records outside their scope by id", async () => {
    const employeeEmail = `scoped+${Date.now()}@example.test`;
    const createEmployee = await request("/workspace/access/users", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie },
      body: JSON.stringify({ name: "Scoped Employee", email: employeeEmail, password: "a-very-long-employee-pass", roleId: "role-employee" }),
    });
    assert.equal(createEmployee.status, 201);
    const login = await request("/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: employeeEmail, password: "a-very-long-employee-pass" }),
    });
    assert.equal(login.status, 200);
    const employeeCookie = cookieFrom(login);

    // A work item created by the Main Manager and assigned to nobody is out of
    // scope for an own-records employee; direct edits by id must 404.
    const ownedWork = await request("/workspace/work", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: mainCookie },
      body: JSON.stringify({ title: "Manager-owned task", dueDate: "2099-12-31", status: "Planned" }),
    });
    assert.equal(ownedWork.status, 201);
    const workBody = await json<{ item: { id: string } }>(ownedWork);

    const scopedEdit = await request(`/workspace/work/${workBody.item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({ status: "Completed" }),
    });
    assert.equal(scopedEdit.status, 404);

    // Records the employee creates stay visible and editable to them.
    const ownWork = await request("/workspace/work", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({ title: "Employee-owned task", assignee: "Scoped Employee", dueDate: "2099-12-31", status: "Planned" }),
    });
    assert.equal(ownWork.status, 201);
    const ownBody = await json<{ item: { id: string } }>(ownWork);
    const ownEdit = await request(`/workspace/work/${ownBody.item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({ status: "In Progress" }),
    });
    assert.equal(ownEdit.status, 200);
  });
});

});

describe("registration approval and notification replies", () => {
  it("prevents duplicate accounts and lost changes during concurrent password updates", async () => {
    const input = { name: "Concurrent User", email: "concurrent-user@example.test", password: "concurrent-user-password", roleId: "role-manager", organizationIds: ["company-primary"] };
    const create = () => request("/workspace/access/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, mainCookie);
    const responses = await Promise.all([create(), create()]);
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
    const { item } = await json<{ item: { id: string } }>(responses.find(response => response.status === 201)!);
    const update = (body: unknown) => request(`/workspace/access/users/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, mainCookie);
    const changed = await Promise.all([update({ password: "changed-concurrent-password" }), update({ name: "Concurrent Name Preserved" })]);
    assert.ok(changed.every(response => response.status === 200));
    const stored = (getStore().collections.accessUsers as Record<string, unknown>[]).find(account => account.id === item.id)!;
    assert.equal(stored.name, "Concurrent Name Preserved");
    assert.equal((getStore().collections.accessUsers as Record<string, unknown>[]).filter(account => account.email === input.email).length, 1);
    assert.equal((await request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: input.email, password: "changed-concurrent-password" }) })).status, 200);
    assert.equal((await request("/auth/status", {}, mainCookie)).headers.get("cache-control"), "no-store");
  });
  it("lets the Main Manager transfer company access and applies permissions to the current session", async () => {
    resetFailures();
    const data = getStore();
    data.collections.companies.push({ id: "company-transfer-target", name: "Transfer Company", status: "active" });
    data.collections.products.push({ id: "transfer-product-old", organizationId: "company-primary", name: "Old company product" }, { id: "transfer-product-new", organizationId: "company-transfer-target", name: "New company product" });
    saveStore(data);
    const created = await request("/workspace/access/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Company Transfer User", email: "company-transfer@example.com", password: "company-transfer-test-password", roleId: "role-manager", organizationIds: ["company-primary"] }) }, mainCookie);
    assert.equal(created.status, 201, await created.clone().text());
    const { item } = await json<{ item: { id: string } }>(created);
    const update = (body: unknown, cookie = mainCookie) => request(`/workspace/access/users/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, cookie);
    assert.equal((await update({ permissions: ["operations.view"] })).status, 200);
    const login = await request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "company-transfer@example.com", password: "company-transfer-test-password" }) });
    const cookie = cookieFrom(login);
    assert.equal((await request("/collections/products/transfer-product-old", {}, cookie)).status, 200);
    assert.equal((await update({ organizationIds: ["company-transfer-target"], employeeId: null, locationIds: [], permissions: ["operations.*", "finance.view"], ownRecordsOnly: false })).status, 200);
    assert.equal((await request("/collections/products/transfer-product-old", {}, cookie)).status, 404);
    assert.equal((await request("/collections/products/transfer-product-new", {}, cookie)).status, 200);
    assert.equal((await update({ organizationIds: ["company-primary"] }, cookie)).status, 403);
    assert.equal((await update({ organizationIds: ["nonexistent-company"] })).status, 400);
    assert.equal((await update({ locationIds: ["nonexistent-location"] })).status, 400);
    const status = await json<{ user: { organizationIds: string[]; permissions: string[] } }>(await request("/auth/status", {}, cookie));
    assert.deepEqual(status.user.organizationIds, ["company-transfer-target"]);
    assert.ok(status.user.permissions.includes("finance.view"));
  });
  it("assigns unique immutable AWBs and blocks access outside the assigned company", async () => {
    resetFailures();
    const data = getStore();
    data.collections.companies.push({ id: "company-boundary-two", name: "Second Company", status: "active" });
    for (const rule of data.collections.approvalRules as Record<string, unknown>[]) if (rule.section === "operations") rule.active = false;
    saveStore(data);
    const product = (organizationId: string, sku: string) => ({ organizationId, sku, name: sku, unit: "each", price: 10, status: "active", awb: "FORGED" });
    const create = (body: unknown) => request("/collections/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, mainCookie);
    const firstResponse = await create(product("company-primary", "AWB-TEST-A"));
    const secondResponse = await create(product("company-boundary-two", "AWB-TEST-B"));
    assert.equal(firstResponse.status, 201, await firstResponse.clone().text()); assert.equal(secondResponse.status, 201, await secondResponse.clone().text());
    const first = (await json<{ item: { id: string; awb: string } }>(firstResponse)).item;
    const second = (await json<{ item: { id: string; awb: string } }>(secondResponse)).item;
    assert.match(first.awb, /^AWB-\d{12}$/); assert.notEqual(first.awb, second.awb);
    const update = await request(`/collections/products/${first.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...product("company-primary", "AWB-TEST-A"), awb: second.awb }) }, mainCookie);
    assert.equal(update.status, 200);
    assert.equal((await json<{ item: { awb: string } }>(update)).item.awb, first.awb);
    const role = (getStore().collections.accessRoles as Record<string, unknown>[]).find(row => row.id === "role-manager")!;
    const before = role.organizationIds;
    role.organizationIds = ["company-primary", "company-boundary-two"]; saveStore(getStore());
    const listed = await json<{ items: { id: string }[] }>(await request("/collections/products", {}, managerCookie));
    assert.ok(listed.items.some(item => item.id === first.id));
    assert.ok(!listed.items.some(item => item.id === second.id));
    assert.equal((await request(`/collections/products/${second.id}`, {}, managerCookie)).status, 404);
    assert.equal((await request(`/collections/products/${second.id}`, { method: "DELETE" }, managerCookie)).status, 404);
    const denied = await request("/collections/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(product("company-boundary-two", "BLOCKED-AWB")) }, managerCookie);
    assert.equal(denied.status, 403);
    role.organizationIds = before; saveStore(getStore());
  });
  it("requires a valid company for registration and admin-created accounts", async () => {
    resetFailures();
    const body = { name: "Company User", email: "company-user@example.test", password: "company-user-test-password" };
    const register = (input: unknown) => request("/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    assert.equal((await register(body)).status, 400);
    assert.equal((await register({ ...body, organizationId: "missing-company" })).status, 400);
    assert.equal((await register({ ...body, organizationId: "company-boundary-two" })).status, 201);
    const account = (getStore().collections.accessUsers as Record<string, unknown>[]).find(row => row.email === body.email)!;
    assert.deepEqual(account.organizationIds, ["company-boundary-two"]);
    const invalid = await request("/workspace/access/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, email: "unassigned-test@example.test", roleId: "role-manager", organizationIds: [] }) }, mainCookie);
    assert.equal(invalid.status, 400);
    const valid = await request("/workspace/access/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, email: "assigned-admin-created@example.test", roleId: "role-manager", organizationIds: ["company-boundary-two"] }) }, mainCookie);
    assert.equal(valid.status, 201);
    const saved = (getStore().collections.accessUsers as Record<string, unknown>[]).find(row => row.email === "assigned-admin-created@example.test")!;
    assert.equal(saved.password, undefined);
    assert.match(String(saved.passwordHash), /^scrypt\$/);
  });
  it("restricts pending accounts, protects requests, and delivers manager decisions", async () => {
    resetFailures();
    const post = (path: string, body: unknown, cookie?: string) => request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, cookie);
    const ownerLogin = await post("/auth/login", { email: "owner@example.test", password: "correct-horse-battery-staple" });
    const ownerCookie = cookieFrom(ownerLogin);
    const email = `new-${Date.now()}@example.test`;
    const credentials = { name: "Pending Applicant", email, password: "registration-test-password", organizationId: "company-primary" };
    assert.equal((await post("/auth/register", credentials)).status, 201);
    const stored = (getStore().collections.accessUsers as Record<string, unknown>[]).find(row => row.email === email)!;
    assert.equal(stored.status, "pending");
    assert.match(String(stored.passwordHash), /^scrypt\$/);
    assert.equal(stored.password, undefined);
    const login = await post("/auth/login", { email, password: credentials.password });
    const applicantCookie = cookieFrom(login);
    assert.equal((await request("/workspace/overview", {}, applicantCookie)).status, 403);
    assert.equal((await request("/collections/employees", {}, applicantCookie)).status, 403);
    const notices = await json<{ items: Notification[] }>(await request("/notifications", {}, ownerCookie));
    const registration = notices.items.find(item => item.type === "registration_request" && item.target === stored.id)!;
    assert.ok(registration);
    assert.equal((await request(`/notifications/${registration.id}`, {}, applicantCookie)).status, 404);
    assert.equal((await post(`/notifications/${registration.id}/respond`, { action: "approve" }, applicantCookie)).status, 403);
    assert.equal((await request(`/notifications/${registration.id}`, { method: "DELETE" }, applicantCookie)).status, 404);
    const detail = await json<{ details: Record<string, unknown>; canDecide: boolean }>(await request(`/notifications/${registration.id}`, {}, ownerCookie));
    assert.equal(detail.canDecide, true);
    assert.equal(detail.details.email, email);
    assert.equal(detail.details.passwordHash, undefined);
    assert.equal((await post(`/notifications/${registration.id}/respond`, { action: "comment", comment: "Please confirm your department." }, ownerCookie)).status, 200);
    let inbox = await json<{ items: Notification[] }>(await request("/notifications", {}, applicantCookie));
    assert.ok(inbox.items.some(item => item.message.includes("Please confirm your department.")));
    assert.equal((await post(`/notifications/${registration.id}/respond`, { action: "approve", comment: "Welcome aboard." }, ownerCookie)).status, 200);
    assert.equal((getStore().collections.accessUsers as Record<string, unknown>[]).find(row => row.id === stored.id)?.status, "active");
    assert.equal((await post(`/notifications/${registration.id}/respond`, { action: "reject" }, ownerCookie)).status, 409);
    inbox = await json<{ items: Notification[] }>(await request("/notifications", {}, applicantCookie));
    assert.ok(inbox.items.some(item => item.message.includes("Welcome aboard.")));
    const reply = inbox.items.find(item => item.message.includes("Welcome aboard."))!;
    assert.equal((await request(`/notifications/${reply.id}`, { method: "DELETE" }, applicantCookie)).status, 200);
    const afterDelete = await json<{ items: Notification[] }>(await request("/notifications", {}, applicantCookie));
    assert.ok(!afterDelete.items.some(item => item.id === reply.id));
  });
  it("keeps rejected applicants limited to their inbox and status", async () => {
    resetFailures();
    const post = (path: string, body: unknown, cookie?: string) => request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, cookie);
    const ownerCookie = cookieFrom(await post("/auth/login", { email: "owner@example.test", password: "correct-horse-battery-staple" }));
    const email = `reject-${Date.now()}@example.test`;
    await post("/auth/register", { name: "Rejected Applicant", email, password: "registration-test-password", organizationId: "company-primary" });
    const account = (getStore().collections.accessUsers as Record<string, unknown>[]).find(row => row.email === email)!;
    const notices = await json<{ items: Notification[] }>(await request("/notifications", {}, ownerCookie));
    const notification = notices.items.find(item => item.type === "registration_request" && item.target === account.id)!;
    assert.equal((await post(`/notifications/${notification.id}/respond`, { action: "reject", comment: "Contact HR for details." }, ownerCookie)).status, 200);
    const cookie = cookieFrom(await post("/auth/login", { email, password: "registration-test-password" }));
    assert.equal((await request("/workspace/overview", {}, cookie)).status, 403);
    assert.equal((await request("/notifications", {}, cookie)).status, 200);
  });
});
