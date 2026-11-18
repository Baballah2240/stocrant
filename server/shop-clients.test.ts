import "./test-env.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { getCollection } from "./storage.js";
import { effectiveStatus } from "./shop-clients.js";
type Row = Record<string, any>;
let server: Server, base = "", admin = "";
const pass = () => randomBytes(18).toString("hex");
async function req(path: string, method = "GET", body?: unknown, cookie = admin) {
  return fetch(base + "/api" + path, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function json(r: Response, status = 200): Promise<Row> { assert.equal(r.status, status, await r.clone().text()); return r.json() as Promise<Row>; }
before(async () => {
  server = createApp().listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const setup = await req("/auth/setup", "POST", { name: "Platform owner", email: "owner@platform.test", password: pass(), setupKey: "local-setup" }, "");
  await json(setup, 201); admin = setup.headers.get("set-cookie")!.split(";")[0];
});
after(() => new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()); }));

describe("online shop clients", () => {
  let client: Row, link = "";
  it("sets up a new client business with company, draft shop and owner invitation in one step", async () => {
    const r = await json(await req("/workspace/shop-clients", "POST", { businessName: "Nile Fashion", currency: "SDG", country: "Sudan", ownerName: "Sara Ali", ownerEmail: "Sara@nile.test", phone: "+249 900000000", slug: "nile-fashion", plan: "business", monthlyFee: "25000" }), 201);
    client = r.client; link = r.inviteLink;
    assert.match(link, /\/login#invite=[A-Za-z0-9_-]{43}$/);
    assert.equal(client.effectiveStatus, "trial"); assert.equal(client.currency, "SDG"); assert.equal(client.owner, "pending");
    assert.ok(client.endsAt > new Date().toISOString().slice(0, 10), "trial gets an end date");
    const company = getCollection("companies").find((c: any) => c.id === client.companyId) as Row;
    assert.equal(company.organizationType, "shop"); assert.equal(company.name, "Nile Fashion");
    const store = getCollection("shopStorefronts").find((s: any) => s.organizationId === company.id) as Row;
    assert.equal(store.slug, "nile-fashion"); assert.equal(store.published, false); assert.ok(store.returnsPolicy.includes("Nile Fashion"));
    await json(await req("/workspace/shop-clients", "POST", { businessName: "Copy", currency: "SDG", ownerName: "Someone", ownerEmail: "x@copy.test", slug: "nile-fashion", plan: "starter" }), 409);
  });
  it("lets the owner activate and land as a shop manager scoped to their company only", async () => {
    const token = link.split("invite=")[1], password = pass();
    await json(await req("/auth/accept-invitation", "POST", { token, email: "sara@nile.test", password }, ""));
    const login = await req("/auth/login", "POST", { email: "sara@nile.test", password }, "");
    await json(login); const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const me = (await json(await req("/auth/me", "GET", undefined, cookie))) as Row;
    const user = me.user || me;
    assert.equal(user.roleId, "role-shop-manager"); assert.deepEqual(user.organizationIds, [client.companyId]);
    await json(await req("/workspace/shop-clients", "GET", undefined, cookie), 403);
    await json(await req(`/workspace/storefronts/${client.companyId}`, "GET", undefined, cookie));
    const list = await json(await req("/workspace/shop-clients"));
    assert.equal(list.clients[0].owner, "active");
  });
  it("closes the public shop when suspended and reopens it when activated", async () => {
    const store = getCollection("shopStorefronts").find((s: any) => s.organizationId === client.companyId) as Row;
    store.published = true;
    assert.equal((await req("/storefront/nile-fashion/catalog", "GET", undefined, "")).status, 200);
    const suspended = (await json(await req(`/workspace/shop-clients/${client.id}`, "PATCH", { version: client.version, status: "suspended" }))).client;
    assert.equal(suspended.effectiveStatus, "suspended");
    assert.equal((await req("/storefront/nile-fashion/catalog", "GET", undefined, "")).status, 503);
    await json(await req(`/workspace/shop-clients/${client.id}`, "PATCH", { version: client.version, status: "active" }), 409);
    const active = (await json(await req(`/workspace/shop-clients/${client.id}`, "PATCH", { version: suspended.version, status: "active", endsAt: "2099-01-31" }))).client;
    assert.equal(active.effectiveStatus, "active");
    assert.equal((await req("/storefront/nile-fashion/catalog", "GET", undefined, "")).status, 200);
  });
  it("adds a website service to an existing company and treats past end dates as expired", async () => {
    const list = await json(await req("/workspace/shop-clients"));
    const existing = list.candidates.find((c: Row) => c.id !== client.companyId);
    assert.ok(existing, "the setup company is a candidate");
    const r = await json(await req("/workspace/shop-clients", "POST", { existingCompanyId: existing.id, ownerName: "Omer", ownerEmail: "omer@existing.test", slug: "existing-shop", plan: "starter", status: "active" }), 201);
    assert.equal(r.client.companyId, existing.id); assert.equal(r.client.endsAt, ""); assert.equal(r.client.newCompany, false);
    await json(await req("/workspace/shop-clients", "POST", { existingCompanyId: existing.id, ownerName: "Omer", ownerEmail: "omer2@existing.test", slug: "existing-two", plan: "starter" }), 409);
    assert.equal(effectiveStatus({ status: "active", endsAt: "2020-01-01" }), "expired");
    assert.equal(effectiveStatus({ status: "trial", endsAt: "2999-01-01" }), "trial");
  });
  it("saves shop design, rejects bad input, and serves link previews and custom domains", async () => {
    const url = `/workspace/storefronts/${client.companyId}`;
    const current = (await json(await req(url))).settings as Row;
    assert.equal(current.branding.template, "classic");
    const branding = { ...current.branding, template: "fashion", primaryColor: "#1f1a17", accentColor: "#c2185b", heroTitle: "New season", whatsapp: "+249 912345678", instagram: "https://instagram.com/nile", faq: [{ question: "Do you deliver?", answer: "Yes, inside Khartoum." }], seoTitle: "Nile Fashion — dresses", seoDescription: "Dresses <and> abayas", customDomain: "www.nilefashion.test", banner: "https://images.example.test/banner.jpg" };
    const { version, id: _i, organizationId: _o, updatedAt: _u, ...rest } = current;
    const body = { ...rest, version, address: "Souq Arabi, Khartoum", manualPaymentsAccepted: true, published: true, branding };
    await json(await req(url, "PUT", { ...body, branding: { ...branding, primaryColor: "red" } }), 400);
    await json(await req(url, "PUT", { ...body, branding: { ...branding, customDomain: "https://bad" } }), 400);
    const saved = (await json(await req(url, "PUT", body))).settings as Row;
    assert.equal(saved.branding.template, "fashion"); assert.equal(saved.branding.faq.length, 1);
    const catalog = await json(await req("/storefront/nile-fashion/catalog", "GET", undefined, ""));
    assert.equal(catalog.shop.branding.heroTitle, "New season");
    const page = await (await fetch(base + "/shop/nile-fashion")).text();
    if (page.includes("<html")) {
      assert.ok(page.includes("<title>Nile Fashion — dresses</title>"));
      assert.ok(page.includes('og:description" content="Dresses &lt;and&gt; abayas"'));
      assert.ok(page.includes('og:image" content="https://images.example.test/banner.jpg"'));
      assert.doesNotMatch(page, /noindex/);
    }
    const draft = getCollection("shopStorefronts").find((x: any) => x.slug === "existing-shop") as Row;
    const draftPage = await (await fetch(base + "/shop/existing-shop")).text();
    if (draftPage.includes("<html")) { assert.ok(!draftPage.includes("og:title") && Boolean(draft), "draft shop details stay out of the page head"); assert.ok(draftPage.includes('name="robots" content="noindex"')); }
    const { storefrontForHost } = await import("./storefront.js");
    assert.equal(storefrontForHost("WWW.NILEFASHION.TEST"), "nile-fashion");
    const other = getCollection("shopStorefronts").find((s: any) => s.organizationId !== client.companyId) as Row;
    const otherCurrent = (await json(await req(`/workspace/storefronts/${other.organizationId}`))).settings as Row;
    const { version: v2, id: _i2, organizationId: _o2, updatedAt: _u2, ...rest2 } = otherCurrent;
    await json(await req(`/workspace/storefronts/${other.organizationId}`, "PUT", { ...rest2, version: v2, branding: { ...otherCurrent.branding, customDomain: "www.nilefashion.test" } }), 409);
  });
});
