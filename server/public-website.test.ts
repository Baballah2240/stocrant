import { TEST_DATA_DIR } from "./test-env.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { type Server } from "node:http";
import { createApp } from "./app.js";
import { getStore, saveStore } from "./storage.js";
import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";

let server: Server, base: string, main = "", agent = "", other = "", agentId = "", leadId = "", input: ReturnType<typeof inquiry>;
const password = "WebsiteTest!Password-2026";
const cookie = (response: Response) => response.headers.get("set-cookie")!.split(";")[0];
const inquiry = () => ({ name: "Website Visitor", email: "visitor@example.test", phone: "+974 5555 1234", company: "A small shop", existingWebsite: "", service: "shop-website", plan: "connected", message: "I would like a shop website and a product catalog.", consent: true, website: "", requestId: randomUUID() });
async function api(path: string, body?: unknown, session = "", method = body === undefined ? "GET" : "POST", ip = "198.51.100.21") {
  return fetch(base + path, { method, headers: { "Content-Type": "application/json", "X-Forwarded-For": ip, ...(session ? { Cookie: session } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
before(async () => {
  process.env.STOCRANT_TRUST_PROXY = "1";
  server = createApp().listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const setup = await api("/api/auth/setup", { name: "Website Manager", email: "website-manager@example.test", password, setupKey: "local-setup" }); assert.equal(setup.status, 201); main = cookie(setup);
  for (const name of ["agent", "other"]) {
    const result = await api("/api/workspace/access/users", { name: `Website ${name}`, email: `${name}@website.test`, password, roleId: "role-employee", organizationIds: ["company-primary"], permissions: ["customerService.*"] }, main);
    assert.equal(result.status, 201); const user = await result.json() as any; const account=(getStore().collections.accessUsers as any[]).find(row=>row.id===user.item.id); account.permissions=["customerService.*"]; account.mustChangePassword=false; saveStore(getStore()); if (name === "agent") agentId = user.item.id;
    const login = await api("/api/auth/login", { email: `${name}@website.test`, password }); assert.equal(login.status, 200);
    if (name === "agent") agent = cookie(login); else other = cookie(login);
  }
});
after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); const root = resolve(TEST_DATA_DIR); assert.ok(root.startsWith(resolve(tmpdir()) + sep) && root.includes("stocrant-test-data-")); rmSync(root, { recursive: true, force: true }); });
describe("Public website inquiries and private Customer Service handoff", () => {
  it("accepts an anonymous inquiry durably and returns only its reference", async () => {
    input = inquiry(); const response = await api("/api/public/inquiries", input); assert.equal(response.status, 201);
    const result = await response.json() as any; assert.equal(result.accepted, true); assert.match(result.reference, /^ST-/); assert.deepEqual(Object.keys(result).sort(), ["accepted", "reference"]);
    const row = (getStore().collections.websiteInquiries as any[]).find(row => row.reference === result.reference); assert.equal(row.email, input.email); assert.equal(row.status, "new"); leadId = row.id;
    const notification = (getStore().collections.notifications as any[]).find(row => row.target?.includes(leadId)); assert.ok(notification); assert.ok(!notification.message.includes(input.email));
  });
  it("deduplicates retries and rejects changed content under the same request id", async () => {
    assert.equal((await api("/api/public/inquiries", input)).status, 200);
    assert.equal((getStore().collections.websiteInquiries as any[]).filter(row => row.requestId === input.requestId).length, 1);
    assert.equal((await api("/api/public/inquiries", { ...input, message: "Different request using the old key" })).status, 409);
  });
  it("validates contact consent and rejects injected internal fields", async () => {
    for (const patch of [{ consent: false }, { email: "invalid" }, { phone: "abc" }, { phone: "+ ( ) --" }, { message: "short" }, { organizationId: "foreign" }, { assignedTo: agentId }]) assert.equal((await api("/api/public/inquiries", { ...inquiry(), ...patch })).status, 400);
    const count = getStore().collections.websiteInquiries.length;
    assert.equal((await api("/api/public/inquiries", { ...inquiry(), website: "bot-filled" })).status, 202); assert.equal(getStore().collections.websiteInquiries.length, count);
  });
  it("keeps public leads separate from company-wide customerService wildcard access", async () => {
    assert.equal((await api("/api/workspace/customer-service/website-inquiries")).status, 401);
    const response = await api("/api/workspace/customer-service/website-inquiries", undefined, other); assert.equal(response.status, 200); assert.equal(((await response.json()) as any).items.length, 0);
    assert.equal((await api(`/api/workspace/customer-service/website-inquiries/${leadId}`, undefined, other)).status, 404);
    assert.equal((await api("/api/collections/websiteInquiries", undefined, other)).status, 404);
    assert.equal((await api("/api/public/inquiries")).status >= 400, true);
  });
  it("delivers the request to the private inbox and grants only the assigned staff member access", async () => {
    const list = await (await api("/api/workspace/customer-service/website-inquiries", undefined, main)).json() as any; assert.equal(list.total, 1); assert.equal(list.canAssign, true);
    const assigned = await api(`/api/workspace/customer-service/website-inquiries/${leadId}`, { version: 1, assignedTo: agentId, status: "in-progress", note: "Assigned for a phone follow-up." }, main, "PATCH"); assert.equal(assigned.status, 200);
    const own = await (await api("/api/workspace/customer-service/website-inquiries", undefined, agent)).json() as any; assert.equal(own.items[0].id, leadId); assert.equal(own.canAssign, false);
    const update = await api(`/api/workspace/customer-service/website-inquiries/${leadId}`, { version: 2, status: "contacted", note: "Discussed products and delivery requirements." }, agent, "PATCH"); assert.equal(update.status, 200);
    const item = ((await update.json()) as any).item; assert.equal(item.history.length, 2); assert.equal(item.status, "contacted");
    assert.equal((await api(`/api/workspace/customer-service/website-inquiries/${leadId}`, { version: 3, assignedTo: "", status: "closed" }, agent, "PATCH")).status, 403);
    assert.equal((await api(`/api/workspace/customer-service/website-inquiries/${leadId}`, { version: 1, status: "closed" }, main, "PATCH")).status, 409);
    assert.equal((await api(`/api/workspace/customer-service/website-inquiries/${leadId}`, { version: 3, status: "closed" }, other, "PATCH")).status, 404);
  });
  it("reserves platform grants for Main Admin and applies explicit access and revocation immediately", async () => {
    const account = (getStore().collections.accessUsers as any[]).find(row => row.email === "other@website.test");
    account.roleId = "role-company-manager"; account.permissions = ["access.view", "access.edit", "customerService.*"]; saveStore(getStore());
    assert.equal((await api(`/api/workspace/access/users/${agentId}`, { permissions: ["customerService.view", "customerService.inquiries"] }, other, "PATCH")).status, 403);
    assert.equal((await api(`/api/workspace/access/users/${account.id}`, { permissions: ["customerService.view", "customerService.inquiries"] }, main, "PATCH")).status, 200);
    assert.equal((await api(`/api/workspace/customer-service/website-inquiries/${leadId}`, undefined, other)).status, 200);
    const received = await (await api("/api/public/inquiries", inquiry())).json() as any;
    assert.ok((getStore().collections.notifications as any[]).some(row => row.userId === account.id && row.message.includes(received.reference)));
    assert.equal((await api(`/api/workspace/access/users/${account.id}`, { permissions: ["customerService.view"] }, main, "PATCH")).status, 200);
    assert.equal((await api(`/api/workspace/customer-service/website-inquiries/${leadId}`, undefined, other)).status, 404);
  });
  it("rate-limits new submissions while allowing a safe retry of an accepted request", async () => {
    const body = inquiry(); assert.equal((await api("/api/public/inquiries", body, "", "POST", "198.51.100.22")).status, 201);
    for (let i = 0; i < 4; i++) assert.equal((await api("/api/public/inquiries", inquiry(), "", "POST", "198.51.100.22")).status, 201);
    const denied = await api("/api/public/inquiries", inquiry(), "", "POST", "198.51.100.22"); assert.equal(denied.status, 429); assert.ok(denied.headers.get("retry-after"));
    assert.equal((await api("/api/public/inquiries", body, "", "POST", "198.51.100.22")).status, 200);
  });
});
