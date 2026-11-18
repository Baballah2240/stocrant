import "./test-env.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { getCollection } from "./storage.js";
type Row = Record<string, any>;
let server: Server, base = "", admin = "", guest = "", companyId = "", products: Row[] = [];
const hex = () => randomBytes(32).toString("hex");
async function req(path: string, method = "GET", body?: unknown, cookie = admin) {
  return fetch(base + "/api" + path, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function json(r: Response, status = 200): Promise<Row> { assert.equal(r.status, status, await r.clone().text()); return r.json() as Promise<Row>; }
const api = "/storefront/var-shop", config = () => `/workspace/storefronts/${companyId}`;
const payload = (s: Row) => Object.fromEntries(Object.entries(s).filter(([k]) => !["id", "organizationId", "updatedAt"].includes(k)));
before(async () => {
  server = createApp().listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const setup = await req("/auth/setup", "POST", { name: "Owner", email: "owner@var.test", password: hex(), setupKey: "local-setup" }, "");
  await json(setup, 201); admin = setup.headers.get("set-cookie")!.split(";")[0];
  companyId = (await json(await req("/workspace/shop-clients", "POST", { businessName: "Var Shop", currency: "USD", ownerName: "Var Owner", ownerEmail: "v@var.test", slug: "var-shop", plan: "starter", status: "active" }), 201)).client.companyId;
  products = (await json(await req(`/workspace/shops/${companyId}/products`, "POST", { products: [
    { sku: "TEE-S-BLU", name: "Tee", price: "20", category: "Tops", variantGroup: "Classic tee", size: "S", color: "Blue" },
    { sku: "TEE-M-BLU", name: "Tee", price: "20", category: "Tops", variantGroup: "Classic tee", size: "M", color: "Blue" },
    { sku: "TEE-M-RED", name: "Tee", price: "22", category: "Tops", variantGroup: "Classic tee", size: "M", color: "Red" },
    { sku: "CAP", name: "Cap", price: "10", category: "Hats" },
  ] }), 201)).products;
  for (const p of products) await json(await req(`/workspace/shops/${companyId}/receipts`, "POST", { requestId: randomUUID(), productId: p.id, quantity: 5, supplier: "QA", reference: "IN-" + p.sku }), 201);
});
after(() => new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()); }));

describe("sizes, colours and discount codes", () => {
  it("keeps each size/colour as its own product and exposes the group to the shop", async () => {
    const current = (await json(await req(config()))).settings as Row;
    const now = Date.now(), soon = new Date(now + 86400000).toISOString(), past = new Date(now - 86400000).toISOString();
    const coupons = [
      { id: randomUUID(), code: "save10", kind: "percent", value: "10", minSubtotal: "0", startsAt: "", endsAt: "", maxUses: 1, enabled: true },
      { id: randomUUID(), code: "FIVE", kind: "amount", value: "5", minSubtotal: "30", startsAt: "", endsAt: "", maxUses: 0, enabled: true },
      { id: randomUUID(), code: "LATER", kind: "percent", value: "20", minSubtotal: "0", startsAt: soon, endsAt: "", maxUses: 0, enabled: true },
      { id: randomUUID(), code: "OLD", kind: "percent", value: "20", minSubtotal: "0", startsAt: "", endsAt: past, maxUses: 0, enabled: true },
    ];
    const body = { ...payload(current), address: "Main street", manualPaymentsAccepted: true, published: true };
    await json(await req(config(), "PUT", { ...body, coupons: [...coupons, { ...coupons[0], id: randomUUID() }] }), 400);
    await json(await req(config(), "PUT", { ...body, coupons: [{ ...coupons[0], value: "95" }] }), 400);
    const saved = (await json(await req(config(), "PUT", { ...body, coupons }))).settings as Row;
    assert.equal(saved.coupons[0].code, "SAVE10"); assert.equal(saved.coupons[0].uses, 0);
    const r = await req(api + "/catalog", "GET", undefined, ""); guest = r.headers.get("set-cookie")!.split(";")[0];
    const catalog = await json(r);
    assert.equal(catalog.shop.hasCoupons, true); assert.equal(catalog.shop.coupons, undefined, "codes are never public");
    const tee = catalog.products.filter((p: Row) => p.variantGroup === "Classic tee");
    assert.equal(tee.length, 3); assert.deepEqual(tee.map((p: Row) => `${p.size}/${p.color}`).sort(), ["M/Blue", "M/Red", "S/Blue"]);
  });
  it("applies codes in the server quote and rejects invalid, early, expired and too-small uses", async () => {
    const red = products.find(p => p.sku === "TEE-M-RED")!, cap = products.find(p => p.sku === "CAP")!;
    const quote = (coupon: string, lines = [{ productId: red.id, quantity: 1 }]) => req(api + "/quote", "POST", { lines, method: "pickup", coupon }, guest);
    for (const [code, message] of [["NOPE", /not valid/], ["LATER", /not active yet/], ["OLD", /expired/], ["FIVE", /at least 30/]] as const) {
      const r = await quote(code); assert.equal(r.status, 400); assert.match(((await r.json()) as Row).error, message);
    }
    const q = await json(await quote("save10", [{ productId: red.id, quantity: 1 }, { productId: cap.id, quantity: 1 }]));
    assert.equal(q.subtotal, "32.00"); assert.equal(q.discount, "3.20"); assert.equal(q.total, "28.80"); assert.deepEqual(q.coupon, { code: "SAVE10", label: "10%" });
    assert.equal(q.lines[0].name, "Tee · M · Red");
    const order = (await json(await req(api + "/checkout", "POST", { requestId: randomUUID(), receiptSecret: hex(), customer: "Lina", email: "", phone: "+15551234567", address: "", region: "", notes: "", consent: true, website: "", method: "pickup", lines: [{ productId: red.id, quantity: 1 }, { productId: cap.id, quantity: 1 }], quoteToken: q.quoteToken, coupon: "SAVE10" }, guest), 201)).order;
    assert.equal(order.discount, "3.20"); assert.equal(order.total, "28.80"); assert.equal(order.coupon, "SAVE10");
    const stored = getCollection("shopOrders").find((o: any) => o.id === order.id) as Row;
    assert.equal(stored.couponCode, "SAVE10"); assert.equal(stored.lines[0].name, "Tee · M · Red");
    const used = await quote("SAVE10"); assert.equal(used.status, 400); assert.match(((await used.json()) as Row).error, /fully used/);
    const amount = await json(await quote("five", [{ productId: red.id, quantity: 2 }]));
    assert.equal(amount.discount, "5.00"); assert.equal(amount.total, "39.00");
    assert.equal((await json(await req(config()))).settings.coupons[0].uses, 1);
  });
});

describe("shop figures", () => {
  it("counts visitors once per day, builds the funnel, abandoned checkouts and best sellers", async () => {
    const red = products.find(p => p.sku === "TEE-M-RED")!;
    const event = (cookie: string, type: string, productId?: string) => req(api + "/events", "POST", { type, productId }, cookie);
    // First guest (already visited and ordered above) repeats events: still one visitor.
    for (const type of ["product", "product", "bag", "checkout"]) assert.equal((await event(guest, type, red.id)).status, 204);
    assert.equal((await req(api + "/catalog", "GET", undefined, guest)).status, 200);
    // Second guest browses to checkout but never orders.
    const r = await req(api + "/catalog", "GET", undefined, ""); const other = r.headers.get("set-cookie")!.split(";")[0];
    for (const type of ["product", "bag", "checkout"]) await event(other, type, red.id);
    assert.equal((await event(other, "nonsense")).status, 400);
    const { stats } = await json(await req(`/workspace/storefronts/${companyId}/stats?days=7`));
    assert.equal(stats.totals.visitors, 2); assert.equal(stats.totals.productViews, 2); assert.equal(stats.totals.bagAdds, 2); assert.equal(stats.totals.checkouts, 2);
    assert.equal(stats.totals.orders, 1); assert.equal(stats.totals.abandoned, 1); assert.equal(stats.totals.conversion, 50);
    assert.equal(stats.totals.revenue, "28.80"); assert.equal(stats.series.length, 7); assert.equal(stats.series.at(-1).visitors, 2);
    assert.equal(stats.bestSellers[0].name, "Tee · M · Red"); assert.equal(stats.mostViewed[0].views, 2);
    const stored = JSON.stringify(getCollection("shopDailyStats"));
    assert.ok(!stored.includes(guest.split("=")[1]), "raw session ids are not stored");
  });
});
