import "./test-env.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { createApp } from "./app.js";
type Row = Record<string, any>;
let server: Server, base = "", admin = "", guest = "", company: Row, product: Row, settings: Row;
const hex = () => randomBytes(32).toString("hex");
async function req(path: string, method = "GET", body?: unknown, cookie = admin, headers: Record<string, string> = {}) {
  return fetch(base + "/api" + path, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function json(r: Response, status = 200): Promise<Row> { assert.equal(r.status, status, await r.clone().text()); return r.json() as Promise<Row>; }
// A real 1×1 PNG.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const config = () => `/workspace/storefronts/${company.id}`, api = "/storefront/pay-shop";
const payload = (s: Row) => Object.fromEntries(Object.entries(s).filter(([k]) => !["id", "organizationId", "updatedAt"].includes(k)));
before(async () => {
  server = createApp().listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const setup = await req("/auth/setup", "POST", { name: "Owner", email: "owner@pay.test", password: hex(), setupKey: "local-setup" }, "");
  await json(setup, 201); admin = setup.headers.get("set-cookie")!.split(";")[0];
  const created = await json(await req("/workspace/shop-clients", "POST", { businessName: "Pay Shop", currency: "SDG", ownerName: "Pay Owner", ownerEmail: "p@pay.test", slug: "pay-shop", plan: "starter", status: "active" }), 201);
  company = { id: created.client.companyId };
  product = (await json(await req(`/workspace/shops/${company.id}/products`, "POST", { products: [{ sku: "PAY-1", name: "Dress", price: "15000", category: "Dresses" }] }), 201)).products[0];
  await json(await req(`/workspace/shops/${company.id}/receipts`, "POST", { requestId: randomUUID(), productId: product.id, quantity: 5, supplier: "QA", reference: "PAY-IN" }), 201);
  settings = (await json(await req(config()))).settings;
});
after(() => new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()); }));

describe("shop transfer payments", () => {
  let order: Row, secret = "";
  it("requires an account before accepting transfers and keeps account numbers off the public catalog", async () => {
    const body = { ...payload(settings), address: "Khartoum", manualPaymentsAccepted: true, published: true };
    await json(await req(config(), "PUT", { ...body, payments: { cashEnabled: true, transferEnabled: true, accounts: [] } }), 400);
    await json(await req(config(), "PUT", { ...body, payments: { cashEnabled: false, transferEnabled: false, accounts: [] } }), 400);
    settings = (await json(await req(config(), "PUT", { ...body, payments: { cashEnabled: false, transferEnabled: true, accounts: [{ id: randomUUID(), label: "Bankak", accountName: "Pay Shop Ltd", accountNumber: "1234567", instructions: "Write the order number." }] } }))).settings;
    const r = await req(api + "/catalog", "GET", undefined, "");
    guest = r.headers.get("set-cookie")!.split(";")[0];
    const catalog = await json(r);
    assert.deepEqual(catalog.shop.payments, { cashEnabled: false, transferEnabled: true });
    assert.ok(!JSON.stringify(catalog).includes("1234567"));
  });
  it("places a transfer order, shows the accounts privately and refuses cash when it is off", async () => {
    const q = await json(await req(api + "/quote", "POST", { lines: [{ productId: product.id, quantity: 1 }], method: "pickup" }, guest));
    const base = { receiptSecret: hex(), customer: "Amna", email: "", phone: "+249 912345678", address: "", region: "", notes: "", consent: true, website: "", method: "pickup", lines: [{ productId: product.id, quantity: 1 }], quoteToken: q.quoteToken };
    await json(await req(api + "/checkout", "POST", { ...base, requestId: randomUUID(), payment: "cash" }, guest), 400);
    secret = hex();
    order = (await json(await req(api + "/checkout", "POST", { ...base, receiptSecret: secret, requestId: randomUUID(), payment: "transfer" }, guest), 201)).order;
    assert.equal(order.transfer.method, "bank-transfer"); assert.equal(order.transfer.status, "awaiting-proof"); assert.equal(order.transfer.canUpload, true);
    assert.equal(order.transfer.accounts[0].accountNumber, "1234567");
  });
  it("accepts a receipt photo only with the order's private secret, then staff verify or reject it", async () => {
    const upload = (key: string, bytes: Buffer = png) => fetch(`${base}/api${api}/orders/${order.id}/transfer-proof`, { method: "POST", headers: { "Content-Type": "image/png", "X-Receipt-Secret": key, "X-Transfer-Reference": encodeURIComponent("TX-77") }, body: bytes });
    assert.equal((await upload(hex())).status, 404);
    assert.equal((await upload(secret, Buffer.from("not an image at all"))).status, 400);
    const sent = await json(await upload(secret), 201);
    assert.equal(sent.order.transfer.status, "proof-submitted"); assert.equal(sent.order.transfer.canUpload, false);
    assert.equal((await upload(secret)).status, 409, "no second upload while one is waiting");
    const snapshot = await json(await req(`/workspace/shops/${company.id}`));
    const staff = snapshot.orders.find((o: Row) => o.id === order.id);
    assert.equal(staff.transferStatus, "proof-submitted"); assert.equal(staff.transferProofs[0].reference, "TX-77");
    const image = await req(`/workspace/shops/${company.id}/orders/${order.id}/transfer-proofs/${staff.transferProofs[0].id}`);
    assert.equal(image.status, 200); assert.equal(image.headers.get("content-type"), "image/png");
    assert.equal((await req(`/workspace/shops/${company.id}/orders/${order.id}/transfer-proofs/${staff.transferProofs[0].id}`, "GET", undefined, "")).status, 401);
    await json(await req(`/workspace/shops/${company.id}/orders/${order.id}/transfer-review`, "POST", { decision: "reject" }), 400);
    await json(await req(`/workspace/shops/${company.id}/orders/${order.id}/transfer-review`, "POST", { decision: "reject", note: "Amount not received yet." }));
    const again = await json(await req(api + "/receipt", "POST", { orderId: order.id, receiptSecret: secret }, guest));
    assert.equal(again.order.transfer.status, "rejected"); assert.equal(again.order.transfer.note, "Amount not received yet."); assert.equal(again.order.transfer.canUpload, true);
    await json(await upload(secret), 201);
    const verified = await json(await req(`/workspace/shops/${company.id}/orders/${order.id}/transfer-review`, "POST", { decision: "verify" }));
    assert.equal(verified.transferStatus, "verified");
    assert.equal((await upload(secret)).status, 409);
  });
});

describe("shop order messages through Twilio", () => {
  const sent: Record<string, string>[] = [];
  let fake: import("node:http").Server;
  const wait = async (count: number) => { for (let i = 0; i < 50 && sent.length < count; i++) await new Promise(r => setTimeout(r, 40)); };
  before(async () => {
    const http = await import("node:http");
    fake = http.createServer((rq, rs) => { let body = ""; rq.on("data", c => body += c); rq.on("end", () => { sent.push({ ...Object.fromEntries(new URLSearchParams(body)), path: String(rq.url), auth: String(rq.headers.authorization) }); rs.writeHead(201, { "Content-Type": "application/json" }); rs.end(JSON.stringify({ sid: "SM" + sent.length })); }); }).listen(0, "127.0.0.1");
    await new Promise<void>(r => fake.once("listening", () => r()));
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "secret", TWILIO_SMS_FROM: "+15550001111", TWILIO_WHATSAPP_FROM: "+15550002222", STOCRANT_TWILIO_TEST_ENDPOINT: `http://127.0.0.1:${(fake.address() as { port: number }).port}`, NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT || "child" });
  });
  after(() => { for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_SMS_FROM", "TWILIO_WHATSAPP_FROM", "STOCRANT_TWILIO_TEST_ENDPOINT"]) delete process.env[k]; fake.close(); });
  it("normalises Sudanese numbers", async () => {
    const { e164 } = await import("./shop-alerts.js");
    assert.equal(e164("0912 345 678"), "+249912345678"); assert.equal(e164("00249912345678"), "+249912345678"); assert.equal(e164("٠٩١٢٣٤٥٦٧٨"), "+249912345678"); assert.equal(e164("12"), "");
  });
  it("texts opted-in customers on WhatsApp and staff by SMS, and stays quiet without opt-in", async () => {
    const current = (await json(await req(config()))).settings as Row, view = await json(await req(config()));
    assert.deepEqual(view.messaging, { sms: true, whatsapp: true });
    await json(await req(config(), "PUT", { ...payload(current), alerts: { customerChannel: "whatsapp", notifyOn: ["reserved", "dispatched"], language: "ar", staffChannel: "sms", staffPhone: "" } }), 400);
    await json(await req(config(), "PUT", { ...payload(current), payments: { ...current.payments, cashEnabled: true }, alerts: { customerChannel: "whatsapp", notifyOn: ["reserved", "dispatched"], language: "ar", staffChannel: "sms", staffPhone: "+249 900 111 222" } }));
    const q = await json(await req(api + "/quote", "POST", { lines: [{ productId: product.id, quantity: 1 }], method: "pickup" }, guest));
    const body = { receiptSecret: hex(), customer: "Amna", email: "", phone: "0912 345 678", address: "", region: "", notes: "", consent: true, website: "", method: "pickup", lines: [{ productId: product.id, quantity: 1 }], quoteToken: q.quoteToken, payment: "cash" };
    const optedIn = (await json(await req(api + "/checkout", "POST", { ...body, requestId: randomUUID(), updates: true }, guest), 201)).order;
    await wait(2);
    const customer = sent.find(m => m.To === "whatsapp:+249912345678")!, staff = sent.find(m => m.To === "+249900111222")!;
    assert.ok(customer, JSON.stringify(sent)); assert.equal(customer.From, "whatsapp:+15550002222"); assert.match(customer.Body, /استلمنا طلبك/);
    assert.equal(customer.path, "/2010-04-01/Accounts/ACtest/Messages.json"); assert.equal(customer.auth, "Basic " + Buffer.from("ACtest:secret").toString("base64"));
    assert.ok(staff); assert.equal(staff.From, "+15550001111"); assert.match(staff.Body, /Amna/);
    const before = sent.length;
    await json(await req(api + "/checkout", "POST", { ...body, receiptSecret: hex(), requestId: randomUUID(), updates: false }, guest), 201);
    await wait(before + 1);
    assert.equal(sent.filter(m => m.To.startsWith("whatsapp:")).length, 1, "no customer message without opt-in");
    const snapshot = await json(await req(`/workspace/shops/${company.id}`));
    const staffView = snapshot.orders.find((o: Row) => o.id === optedIn.id);
    assert.ok(staffView.messages.some((m: Row) => m.audience === "customer" && m.status === "sent"));
    await json(await req(`/workspace/shops/${company.id}/orders/${optedIn.id}/status`, "POST", { version: staffView.version, status: "preparing" }));
    await new Promise(r => setTimeout(r, 200));
    assert.equal(sent.filter(m => m.To.startsWith("whatsapp:")).length, 1, "preparing is not in notifyOn");
  });
});
