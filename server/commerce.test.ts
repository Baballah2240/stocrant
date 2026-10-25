import { TEST_DATA_DIR } from "./test-env.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import {
  getCollection,
  getStore,
  resetTestCache,
  saveStore,
} from "./storage.js";
type Row = Record<string, any>;
let server: Server,
  base: string,
  session = "",
  company: Row,
  foreign: Row,
  product: Row;
const credentials = () => randomBytes(24).toString("hex");
async function api(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = session,
  headers: Record<string, string> = {},
) {
  return fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function json(response: Response, status = 200): Promise<Row> {
  assert.equal(response.status, status, await response.clone().text());
  return response.json() as Promise<Row>;
}
const prefix = () => `/workspace/shops/${company.id}`;
const orderBody = (extra: Row = {}) => ({
  requestId: randomUUID(),
  customer: "Shop customer",
  phone: "+249 912345678",
  lines: [{ productId: product.id, quantity: 2 }],
  ...extra,
});
const create = async (name: string, body: Row) =>
  (await json(await api(`/collections/${name}`, "POST", body), 201)).item;
before(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const setup = await api("/auth/setup", "POST", {
    name: "Commerce owner",
    email: "owner@commerce.test",
    password: credentials(),
    setupKey: "local-setup",
  });
  await json(setup, 201);
  session = setup.headers.get("set-cookie")!.split(";")[0];
  const org = await create("organizations", {
    name: "Commerce organization",
    status: "active",
  });
  const input = (name: string) => ({
    name,
    parentOrganizationId: org.id,
    status: "active",
    organizationType: "office",
    industry: "retail",
    currency: "SDG",
  });
  company = await create("companies", input("Commerce company"));
  foreign = await create("companies", input("Other company"));
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  const target = resolve(TEST_DATA_DIR);
  assert.ok(
    target.startsWith(resolve(tmpdir()) + sep) &&
      target.includes("stocrant-test-data-"),
  );
  rmSync(target, { recursive: true, force: true });
});
describe("Connected shop foundations", () => {
  it("previews and imports atomically with company currency, unique SKUs and zero stock", async () => {
    const input = {
      products: [{ sku: "TEA-01", name: "Sudan tea", price: "12.35" }],
    };
    await json(await api(prefix() + "/products/preview", "POST", input));
    assert.equal((getCollection("shopProducts") as Row[]).length, 0);
    product = (
      await json(await api(prefix() + "/products", "POST", input), 201)
    ).products[0];
    assert.equal(product.currency, "SDG");
    const summary = await json(await api(prefix()));
    assert.equal(summary.products[0].available, 0);
    await json(
      await api(prefix() + "/products", "POST", {
        products: [{ sku: "NEW", name: "New", price: "5" }, input.products[0]],
      }),
      409,
    );
    assert.equal((getCollection("shopProducts") as Row[]).length, 1);
    await json(
      await api(prefix() + "/products", "POST", {
        products: [{ sku: "BAD", name: "Invalid", price: "1.123" }],
      }),
      400,
    );
  });
  it("receives shipments exactly once and protects the immutable movement", async () => {
    const data=getStore(),cashBefore=(getCollection("financeTransactions") as Row[]).length;
    data.collections.purchases.push({id:"receipt-purchase",organizationId:company.id,currency:company.currency,status:"ordered",poNumber:"PO-RECEIPT",total:"10.00"},{id:"foreign-receipt-purchase",organizationId:foreign.id,currency:foreign.currency,status:"ordered",poNumber:"PO-FOREIGN",total:"10.00"});saveStore(data);
    const body = {
      requestId: randomUUID(),
      productId: product.id,
      purchaseId:"receipt-purchase",
      quantity: 10,
      supplier: "Tea supplier",
      reference: "AWB-100",
    };
    const first = await json(
      await api(prefix() + "/receipts", "POST", body),
      201,
    );
    const replay = await json(
      await api(prefix() + "/receipts", "POST", body),
      201,
    );
    assert.equal(first.id, replay.id);
    assert.equal(first.purchaseId,"receipt-purchase");
    assert.equal((getCollection("inventoryMovements") as Row[]).find(m=>m.shopReceiptId===first.id)!.purchaseId,"receipt-purchase");
    assert.equal((getCollection("financeTransactions") as Row[]).length,cashBefore);
    const finance=await json(await api("/workspace/finance"));assert.equal(finance.sources.find((s:Row)=>s.id==="receipt-purchase").receiptCount,1);
    await json(await api(prefix()+"/receipts","POST",{...body,requestId:randomUUID(),reference:"FOREIGN-LINK",purchaseId:"foreign-receipt-purchase"}),400);
    await json(await api("/collections/purchases/receipt-purchase","DELETE"),400);
    await json(
      await api(prefix() + "/receipts", "POST", { ...body, quantity: 11 }),
      409,
    );
    await json(
      await api(prefix() + "/receipts", "POST", {
        ...body,
        requestId: randomUUID(),
      }),
      409,
    );
    assert.equal((await json(await api(prefix()))).products[0].onHand, 10);
    await json(
      await api(`/workspace/shops/${foreign.id}/receipts`, "POST", body),
      404,
    );
  });
  it("reserves stock, rejects overselling and replays an order after restart", async () => {
    const body = orderBody({ delivery: "2.50", discount: "1.20" });
    const o = await json(await api(prefix() + "/orders", "POST", body), 201);
    assert.equal(o.total, "26.00");
    const productBody = { version: product.version, name: product.name, description: "Updated catalog", image: "", price: "99.00", active: false };
    const paused = await json(await api(prefix() + `/products/${product.id}`, "PATCH", productBody));
    await json(await api(prefix() + "/orders", "POST", orderBody()), 400);
    await json(await api(prefix() + `/products/${product.id}`, "PATCH", productBody), 409);
    product = await json(await api(prefix() + `/products/${product.id}`, "PATCH", { ...productBody, version: paused.version, price: "12.35", active: true }));
    const frozen = (await json(await api(prefix()))).orders.find((item: Row) => item.id === o.id);
    assert.equal(frozen.lines[0].price, "12.35"); assert.equal(frozen.total, "26.00");
    resetTestCache();
    assert.equal(
      (await json(await api(prefix() + "/orders", "POST", body), 201)).id,
      o.id,
    );
    await json(
      await api(prefix() + "/orders", "POST", { ...body, customer: "Changed" }),
      409,
    );
    const summary = await json(await api(prefix()));
    assert.equal(summary.products[0].reserved, 2);
    assert.equal(summary.products[0].available, 8);
    const responses = await Promise.all([
      api(
        prefix() + "/orders",
        "POST",
        orderBody({ lines: [{ productId: product.id, quantity: 6 }] }),
      ),
      api(
        prefix() + "/orders",
        "POST",
        orderBody({ lines: [{ productId: product.id, quantity: 6 }] }),
      ),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
    const existing = (await json(await api(prefix()))).orders.find(
      (r: Row) => r.id !== o.id,
    );
    await json(
      await api(prefix() + `/orders/${existing.id}/status`, "POST", {
        version: 1,
        status: "cancelled",
      }),
    );
    assert.equal((await json(await api(prefix()))).products[0].reserved, 2);
  });
  it("blocks outside movements that would consume reservations and preserves signed adjustments", async () => {
    const body = {
      inventoryItemId: product.inventoryItemId,
      type: "outgoing",
      quantity: 9,
      date: "2026-10-23",
      reason: "Other use",
      reference: "OUT-1",
    };
    await json(await api("/workspace/inventory/movements", "POST", body), 400);
    await json(
      await api("/workspace/inventory/movements", "POST", {
        ...body,
        type: "adjustment",
        quantity: -1,
        reason: "Stock count correction",
      }),
      201,
    );
    assert.equal((await json(await api(prefix()))).products[0].onHand, 9);
  });
  it("dispatches once, snapshots prices and creates a sale without inventing a payment", async () => {
    let o = (await json(await api(prefix()))).orders.find(
      (o: Row) => o.status === "reserved",
    );
    await json(
      await api(prefix() + `/orders/${o.id}/status`, "POST", {
        version: o.version,
        status: "dispatched",
        tracking: "AWB-OUT",
      }),
      409,
    );
    o = await json(
      await api(prefix() + `/orders/${o.id}/status`, "POST", {
        version: o.version,
        status: "preparing",
      }),
    );
    await json(
      await api(prefix() + `/orders/${o.id}/status`, "POST", {
        version: 1,
        status: "cancelled",
      }),
      409,
    );
    await json(
      await api(prefix() + `/orders/${o.id}/status`, "POST", {
        version: o.version,
        status: "dispatched",
      }),
      400,
    );
    const conflictingSale = await create("sales", { organizationId: company.id, invoiceNo: `SHOP-${o.id}`, date: "2026-10-23", customer: "Test reference conflict", total: "1.00", status: "completed", channel: "online", payment: "credit" });
    await json(await api(prefix() + `/orders/${o.id}/status`, "POST", { version: o.version, status: "dispatched", tracking: "AWB-OUT" }), 409);
    const rolledBack = await json(await api(prefix())); assert.equal(rolledBack.products[0].onHand, 9); assert.equal(rolledBack.products[0].reserved, 2);
    assert.equal((getCollection("inventoryMovements") as Row[]).filter(m => m.shopOrderId === o.id).length, 0);
    await json(await api(`/collections/sales/${conflictingSale.id}`, "DELETE"));
    const dispatched = await json(
      await api(prefix() + `/orders/${o.id}/status`, "POST", {
        version: o.version,
        status: "dispatched",
        tracking: "AWB-OUT",
      }),
    );
    assert.ok(dispatched.saleId);
    await json(
      await api(prefix() + `/orders/${o.id}/status`, "POST", {
        version: dispatched.version,
        status: "cancelled",
      }),
      409,
    );
    const summary = await json(await api(prefix()));
    assert.equal(summary.products[0].onHand, 7);
    assert.equal(summary.products[0].reserved, 0);
    assert.equal(
      summary.orders.find((r: Row) => r.id === o.id).settlement.paid,
      "0.00",
    );
    await json(
      await api(`/collections/sales/${dispatched.saleId}`, "PATCH", {
        total: "1",
      }),
      400,
    );
    await json(
      await api(prefix() + `/orders/${o.id}/status`, "POST", {
        version: dispatched.version,
        status: "delivered",
      }),
    );
  });
  it("settles a linked sale through Finance and refuses duplicate or excess cash", async () => {
    const order = (await json(await api(prefix()))).orders.find(
      (o: Row) => o.status === "delivered",
    );
    const account = (
      await json(
        await api("/workspace/finance/accounts", "POST", {
          name: "Shop cash",
          organizationId: company.id,
          currency: "SDG",
          type: "cash",
          openingBalance: "0",
        }),
        201,
      )
    ).item;
    const body = {
      organizationId: company.id,
      accountId: account.id,
      type: "income",
      amount: order.total,
      currency: "SDG",
      sourceCollection: "sales",
      sourceId: order.saleId,
      status: "paid",
      date: "2026-10-23",
      reference: "PAY-SHOP-100",
      idempotencyKey: randomUUID(),
      description: "Confirmed customer payment",
    };
    const payment = await json(
      await api("/workspace/finance/transactions", "POST", body),
      201,
    );
    assert.equal(
      (
        await json(
          await api("/workspace/finance/transactions", "POST", body),
          201,
        )
      ).item.id,
      payment.item.id,
    );
    await json(
      await api("/workspace/finance/transactions", "POST", {
        ...body,
        idempotencyKey: randomUUID(),
        reference: "PAY-SHOP-EXCESS",
        amount: "0.01",
      }),
      409,
    );
    const current = (await json(await api(prefix()))).orders.find(
      (o: Row) => o.id === order.id,
    );
    assert.equal(current.settlement.outstanding, "0.00");
    assert.equal(current.settlement.paid, order.total);
    assert.equal((await json(await api(prefix()))).products[0].onHand, 7);
  });
  it("uses scoped, revocable server keys and rejects browser use and forged company IDs", async () => {
    const issued = await json(
      await api(prefix() + "/connectors", "POST", {
        name: "Future custom shop",
      }),
      201,
    );
    const headers = { Authorization: `Bearer ${issued.key}` };
    assert.ok(!JSON.stringify(getStore()).includes(issued.key));
    assert.ok(
      !JSON.stringify(await json(await api(prefix()))).includes("keyHash"),
    );
    const catalog = await json(
      await api("/shop-connection/catalog", "GET", undefined, "", headers),
    );
    assert.equal(catalog.products[0].id, product.id);
    assert.equal(catalog.products[0].onHand, undefined);
    await json(
      await api("/shop-connection/catalog", "GET", undefined, "", {
        ...headers,
        Origin: "https://store.example.test",
      }),
      403,
    );
    await json(
      await api(
        "/shop-connection/orders",
        "POST",
        orderBody({ organizationId: foreign.id }),
        "",
        headers,
      ),
      400,
    );
    const b = orderBody();
    const o = await json(
      await api("/shop-connection/orders", "POST", b, "", headers),
      201,
    );
    assert.equal(
      (
        await json(
          await api("/shop-connection/orders", "POST", b, "", headers),
          201,
        )
      ).id,
      o.id,
    );
    assert.equal(
      (
        await json(
          await api(
            `/shop-connection/orders/${o.id}`,
            "GET",
            undefined,
            "",
            headers,
          ),
        )
      ).status,
      "reserved",
    );
    await json(
      await api(prefix() + `/connectors/${issued.connector.id}`, "DELETE", {}),
    );
    await json(
      await api("/shop-connection/catalog", "GET", undefined, "", headers),
      401,
    );
    await json(await api("/collections/shopOrders"), 404);
    await json(await api("/workspace/shops", "GET", undefined, ""), 401);
  });
  it("enforces active approval policies and tenant permissions", async () => {
    (getCollection("approvalRules") as Row[]).push({
      id: randomUUID(),
      section: "finance",
      action: "create",
      active: true,
    });
    saveStore(getStore());
    const o = await json(
      await api(prefix() + "/orders", "POST", orderBody()),
      201,
    );
    const preparing = await json(
      await api(prefix() + `/orders/${o.id}/status`, "POST", {
        version: 1,
        status: "preparing",
      }),
    );
    await json(
      await api(prefix() + `/orders/${o.id}/status`, "POST", {
        version: preparing.version,
        status: "dispatched",
        tracking: "X",
      }),
      200,
    );
    assert.equal((await json(await api(prefix()))).products[0].onHand, 5);
    const role = (getCollection("accessRoles") as Row[]).find(
      (r) => r.id === "role-company-manager",
    )!;
    const original = role.permissions;
    role.permissions = ["operations.view", "inventory.view"];
    saveStore(getStore());
    const password = credentials();
    const user = (
      await json(
        await api("/workspace/access/users", "POST", {
          name: "Limited",
          email: "limited@commerce.test",
          password,
          roleId: role.id,
          organizationIds: [foreign.id],
        }),
        201,
      )
    ).item;
    // Set the test account directly after the controlled creation to avoid UI password rotation in this scope test.
    const account = (getCollection("accessUsers") as Row[]).find(
      (r) => r.id === user.id,
    )!;
    account.mustChangePassword = false;
    saveStore(getStore());
    const login = await api(
      "/auth/login",
      "POST",
      { email: account.email, password },
      "",
    );
    await json(login);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    await json(await api(prefix(), "GET", undefined, cookie), 404);
    await json(
      await api(
        `/workspace/shops/${foreign.id}/products`,
        "POST",
        { products: [] },
        cookie,
      ),
      403,
    );
    role.permissions = original;
    saveStore(getStore());
  });
});

describe("Company product photo uploads", () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=", "base64");
  const upload = (body = png, cookie = session, id = company.id) => fetch(`${base}/api/workspace/shops/${id}/photos`, { method: "POST", headers: { "Content-Type": "application/octet-stream", ...(cookie ? { Cookie: cookie } : {}) }, body: new Uint8Array(body) });
  it("validates real photo uploads, scope, size, and durable galleries without publishing drafts", async () => {
    await json(await upload(png, ""), 401);
    await json(await upload(Buffer.from("<svg onload='alert(1)'></svg>")), 400);
    await json(await upload(Buffer.alloc(5 * 1024 * 1024 + 1)), 413);
    const first = (await json(await upload(), 201)).url;
    const second = (await json(await upload(), 201)).url;
    assert.match(first, /^\/api\/shop-images\/[a-f0-9-]{36}$/);
    await json(await fetch(base + first), 404);
    const privatePreview = await fetch(base + first, { headers: { Cookie: session } });
    assert.equal(privatePreview.status, 200); assert.equal(privatePreview.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await privatePreview.arrayBuffer()), png);
    await json(await api(`/workspace/shops/${foreign.id}/products`, "POST", { products: [{ sku: "WRONG-PHOTO", name: "Wrong company", price: "10", image: first, images: [first] }] }), 400);
    const gallery = (await json(await api(prefix() + "/products", "POST", { products: [{ sku: "PHOTO-01", name: "Photo product", price: "10", image: first, images: [first, second] }] }), 201)).products[0];
    resetTestCache();
    const loaded = (await json(await api(prefix()))).products.find((p: Row) => p.id === gallery.id);
    assert.deepEqual(loaded.images, [first, second]);
    await json(await api(prefix() + `/photos/${first.split("/").at(-1)}`, "DELETE"), 409);
    await json(await fetch(base + first), 404);
    const patch = { version: loaded.version, name: loaded.name, description: loaded.description, image: second, images: [second, first], price: loaded.price, active: true };
    const saved = await json(await api(prefix() + `/products/${gallery.id}`, "PATCH", patch));
    assert.deepEqual(saved.images, [second, first]); assert.equal(saved.image, second);
    await json(await api(prefix() + `/products/${gallery.id}`, "PATCH", { ...patch, version: saved.version, images: [first, second] }), 400);
    await json(await api(prefix() + `/products/${gallery.id}`, "PATCH", { ...patch, version: saved.version, images: Array(7).fill(second) }), 400);
    const url = (await json(await upload(), 201)).url;
    await json(await api(prefix() + `/photos/${url.split("/").at(-1)}`, "DELETE"));
    await json(await fetch(base + url, { headers: { Cookie: session } }), 404);
  });
  it("restricts uploads and draft downloads to the authorized company and current permissions", async () => {
    const password = credentials();
    const user = (await json(await api("/workspace/access/users", "POST", { name: "Photo manager", email: "photo-manager@commerce.test", password, roleId: "role-shop-manager", organizationIds: [foreign.id] }), 201)).item;
    const account = (getCollection("accessUsers") as Row[]).find(a => a.id === user.id)!;
    account.mustChangePassword = false; saveStore(getStore());
    const login = await api("/auth/login", "POST", { email: account.email, password }, ""); await json(login);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    await json(await upload(png, cookie), 404);
    const privateImage = (await json(await api(prefix()))).products.find((p: Row) => p.sku === "PHOTO-01").image;
    await json(await fetch(base + privateImage, { headers: { Cookie: cookie } }), 404);
    const own = (await json(await upload(png, cookie, foreign.id), 201)).url;
    assert.equal((await fetch(base + own, { headers: { Cookie: cookie } })).status, 200);
    await json(await api(`/workspace/access/users/${user.id}`, "PATCH", { permissions: ["operations.view", "inventory.view"] }));
    await json(await upload(png, cookie, foreign.id), 403);
    await json(await api(`/workspace/access/users/${user.id}`, "PATCH", { status: "suspended" }));
    await json(await fetch(base + own, { headers: { Cookie: cookie } }), 404);
  });
  it("publishes linked photos with the storefront and stops serving them when unpublished", async () => {
    const product = (await json(await api(prefix()))).products.find((p: Row) => p.sku === "PHOTO-01");
    const defaults = (await json(await api(`/workspace/storefronts/${company.id}`))).settings;
    const input = { ...defaults, slug: "photo-store", name: "Photo store", contactEmail: "shop@photos.test", address: "Collection address", shippingPolicy: "Collection", returnsPolicy: "Contact staff", privacyPolicy: "Orders only", terms: "Payment on collection", published: true, manualPaymentsAccepted: true };
    let config = await json(await api(`/workspace/storefronts/${company.id}`, "PUT", input));
    const photo = await fetch(base + product.image);
    assert.equal(photo.status, 200); assert.equal(photo.headers.get("x-content-type-options"), "nosniff");
    const catalog = await json(await api("/storefront/photo-store/catalog", "GET", undefined, ""));
    assert.deepEqual(catalog.products.find((p: Row) => p.id === product.id).images, product.images);
    config = await json(await api(`/workspace/storefronts/${company.id}`, "PUT", { ...input, version: config.settings.version, merchandising: {...defaults.merchandising,categories:[{id:"hidden",name:product.category,title:"Hidden photos",description:"",visible:false}]} }));
    await json(await fetch(base + product.image), 404);
    config = await json(await api(`/workspace/storefronts/${company.id}`, "PUT", {...input,version:config.settings.version}));
    assert.equal((await fetch(base + product.image)).status,200);
    await json(await api(`/workspace/storefronts/${company.id}`, "PUT", { ...input, version: config.settings.version, published: false }));
    await json(await fetch(base + product.image), 404);
  });
});

describe("Optional product warranties", () => {
  it("persists coverage, preserves it on other edits and clears details when disabled", async () => {
    const created = (await json(await api(prefix() + "/products", "POST", {products:[{sku:"WARRANTY-01",name:"Covered product",price:"10",warranty:true,warrantyDetails:"12 months"},{sku:"WARRANTY-02",name:"Standard product",price:"5"}]}),201)).products;
    assert.equal(created[0].warranty,true); assert.equal(created[1].warranty,false);
    resetTestCache();
    const covered = (await json(await api(prefix()))).products.find((p: Row)=>p.id===created[0].id);
    assert.equal(covered.warrantyDetails,"12 months");
    const patch={version:covered.version,name:covered.name,price:covered.price,description:covered.description,image:covered.image,active:false};
    const paused=await json(await api(prefix()+`/products/${covered.id}`,"PATCH",patch));
    assert.equal(paused.warranty,true);assert.equal(paused.warrantyDetails,"12 months");
    await json(await api(prefix()+`/products/${covered.id}`,"PATCH",{...patch,version:paused.version,warranty:"yes"}),400);
    const disabled=await json(await api(prefix()+`/products/${covered.id}`,"PATCH",{...patch,version:paused.version,warranty:false}));
    assert.equal(disabled.warranty,false);assert.equal(disabled.warrantyDetails,"");
  });
  it("gives the scoped shop manager staff control and immediate shop approvals while posting payments once to Finance",async()=>{
    const temporary=credentials(),email="shop-owner@commerce.test";
    const manager=(await json(await api("/workspace/access/users","POST",{name:"Shop Owner",email,password:temporary,roleId:"role-shop-manager",organizationIds:[company.id]}),201)).item;
    let response=await api("/auth/login","POST",{email,password:temporary},"");await json(response);let ownerCookie=response.headers.get("set-cookie")!.split(";")[0];const password=credentials();await json(await api("/auth/password","POST",{currentPassword:temporary,newPassword:password},ownerCookie));response=await api("/auth/login","POST",{email,password},"");await json(response);ownerCookie=response.headers.get("set-cookie")!.split(";")[0];
    const staff=(await json(await api("/workspace/access/users","POST",{name:"Shop Staff",email:"shop-staff@commerce.test",password:credentials(),roleId:"role-shop-staff",organizationIds:[company.id]},ownerCookie),201)).item;
    await json(await api(`/workspace/access/users/${staff.id}`,"PATCH",{roleId:"role-main-manager"},ownerCookie),403);
    await json(await api("/workspace/access/users","POST",{name:"Foreign shop staff",email:"foreign-staff@commerce.test",password:credentials(),roleId:"role-shop-staff",organizationIds:[foreign.id]},ownerCookie),403);
    assert.ok((await json(await api("/workspace/access/users","GET",undefined,ownerCookie))).items.every((user:Row)=>user.organizationIds.includes(company.id)&&["role-shop-staff","role-customer-service"].includes(user.roleId)));
    const rules:Row[]=[];for(const section of ["finance","inventory","operations"]){const response=await api("/workspace/access/approval-rules","POST",{section,action:"create",active:true});assert.ok([200,201].includes(response.status));rules.push((await json(response,response.status)).item);}
    try{
      const base=prefix(),newProduct=(await json(await api(base+"/products","POST",{products:[{sku:"MANAGER-FLOW",name:"Manager flow product",price:"10.00"}]},ownerCookie),201)).products[0];
      await json(await api(base+"/receipts","POST",{requestId:randomUUID(),productId:newProduct.id,quantity:5,supplier:"Shop Supplier",reference:"MANAGER-STOCK"},ownerCookie),201);
      const account=(await json(await api(base+"/settings/accounts","POST",{name:"Shop Till",type:"cash"},ownerCookie),201)).item;
      const settings=await json(await api(base+"/settings","PUT",{version:0,paymentAccountId:account.id,requirePaymentBeforeCompletion:true,requireTracking:true,allowedPaymentMethods:["cash"]},ownerCookie));assert.equal(settings.version,1);
      await json(await api(base+"/settings","PUT",{version:0,paymentAccountId:account.id,requirePaymentBeforeCompletion:true,requireTracking:true,allowedPaymentMethods:["cash"]},ownerCookie),409);
      let order=await json(await api(base+"/orders","POST",orderBody({externalReference:"MANAGER-ORDER",lines:[{productId:newProduct.id,quantity:2}]}),ownerCookie),201);
      order=await json(await api(base+`/orders/${order.id}/status`,"POST",{version:order.version,status:"preparing"},ownerCookie));order=await json(await api(base+`/orders/${order.id}/status`,"POST",{version:order.version,status:"dispatched",tracking:"PICKUP-MANAGER"},ownerCookie));assert.ok(order.saleId);
      await json(await api(base+`/orders/${order.id}/status`,"POST",{version:order.version,status:"delivered"},ownerCookie),409);
      const payment={idempotencyKey:randomUUID(),accountId:account.id,amount:"20.00",date:new Date().toISOString().slice(0,10),method:"cash",reference:"SHOP-PAID-MANAGER"};
      const paid=await json(await api(base+`/orders/${order.id}/payments`,"POST",payment,ownerCookie),201);assert.equal(paid.pending,false);const replay=await json(await api(base+`/orders/${order.id}/payments`,"POST",payment,ownerCookie),201);assert.equal(replay.item.id,paid.item.id);
      await json(await api(base+`/orders/${order.id}/payments`,"POST",{...payment,idempotencyKey:randomUUID(),reference:"EXCESS-SHOP",amount:"1.00"},ownerCookie),409);
      await json(await api(`/workspace/shops/${foreign.id}/orders/${order.id}/payments`,"POST",payment,ownerCookie),404);
      await json(await api(base+`/orders/${order.id}/status`,"POST",{version:order.version,status:"delivered"},ownerCookie));
      const snapshot=await json(await api(base,"GET",undefined,ownerCookie));assert.equal(snapshot.orders.find((item:Row)=>item.id===order.id).settlement.outstanding,"0.00");assert.equal(snapshot.payments.filter((item:Row)=>item.reference===payment.reference).length,1);
      const finance=await json(await api("/workspace/finance","GET",undefined,ownerCookie));assert.equal(finance.accounts.find((item:Row)=>item.id===account.id).balance,"20.00");assert.ok(finance.transactions.some((item:Row)=>item.reference===payment.reference&&item.sourceId===order.saleId));
      const ordinary=await json(await api("/workspace/finance/transactions","POST",{accountId:account.id,type:"income",amount:"1.00",date:payment.date,status:"paid",reference:"ORDINARY-FINANCE-RULE"},ownerCookie),202);assert.equal(ordinary.pending,true,"Shop approval authority must not bypass unrelated Finance approval rules");
      const approvals=await json(await api("/workspace/approvals","GET",undefined,ownerCookie));assert.ok(!approvals.items.some((item:Row)=>item.id===ordinary.request.id),"Shop managers must not see unrelated Finance approvals");
      const returned=await json(await api(base+`/orders/${order.id}/returns`,"POST",{requestId:randomUUID(),reason:"damaged",restock:false},ownerCookie),201);assert.equal(returned.shopOrderId,order.id);assert.equal(returned.status,"approved","The assigned manager must be able to approve shop returns under active Finance rules");
      assert.equal((getCollection("accessUsers") as Row[]).find(user=>user.id===manager.id)!.roleId,"role-shop-manager");
    }finally{for(const rule of rules)await json(await api(`/workspace/access/approval-rules/${rule.id}`,"PATCH",{active:false}));}
  });
  it("reports exact saved costs and returns a paid shop order once with a connected Finance refund",async()=>{
    const reportCompany=await create("companies",{name:"Reporting Shop",parentOrganizationId:company.parentOrganizationId,currency:"USD",status:"active",organizationType:"store",industry:"retail"}),base=`/workspace/shops/${reportCompany.id}`;
    let product=(await json(await api(base+"/products","POST",{products:[{sku:"REPORT-COST",name:"Reporting product",price:"10"}]}),201)).products[0];
    product=await json(await api(base+`/products/${product.id}/cost`,"PUT",{version:product.version,unitCost:"3.25"}));
    await json(await api(base+"/receipts","POST",{requestId:randomUUID(),productId:product.id,quantity:5,supplier:"Report supplier",reference:"REPORT-IN"}),201);
    const account=(await json(await api(base+"/settings/accounts","POST",{name:"Report Till",type:"cash"}),201)).item;
    let order=await json(await api(base+"/orders","POST",orderBody({lines:[{productId:product.id,quantity:2}]})),201);
    await json(await api(base+`/orders/${order.id}/returns`,"POST",{requestId:randomUUID(),reason:"damaged",restock:false}),409);
    order=await json(await api(base+`/orders/${order.id}/status`,"POST",{version:order.version,status:"preparing"}));order=await json(await api(base+`/orders/${order.id}/status`,"POST",{version:order.version,status:"dispatched",tracking:"REPORT-OUT"}));
    assert.equal(order.lines[0].costTotal,"6.50");
    await json(await api(base+`/products/${product.id}/cost`,"PUT",{version:product.version,unitCost:"8.00"}));
    await json(await api(base+`/orders/${order.id}/returns`,"POST",{requestId:randomUUID(),reason:"damaged",restock:true}),409);
    await json(await api(base+`/orders/${order.id}/payments`,"POST",{idempotencyKey:randomUUID(),accountId:account.id,amount:"20.00",date:new Date().toISOString().slice(0,10),method:"cash",reference:"REPORT-PAID"}),201);
    let snapshot=await json(await api(base));assert.equal(snapshot.report.sales,"20.00");assert.equal(snapshot.report.grossProfit,"13.50");assert.equal(snapshot.report.costs,"6.50");
    const body={requestId:randomUUID(),reason:"change-of-mind",restock:true},returned=await json(await api(base+`/orders/${order.id}/returns`,"POST",body),201);
    const replay=await json(await api(base+`/orders/${order.id}/returns`,"POST",body),201);assert.equal(returned.id,replay.id);
    await json(await api(base+`/orders/${order.id}/returns`,"POST",{...body,requestId:randomUUID()}),409);
    await json(await api(`/workspace/shops/${foreign.id}/orders/${order.id}/returns`,"POST",body),404);
    snapshot=await json(await api(base));assert.equal(snapshot.products[0].onHand,5);assert.equal(snapshot.returns.length,1);assert.equal(snapshot.returns[0].settlement.outstanding,"20.00");assert.equal(snapshot.report.grossProfit,"0.00");assert.equal(snapshot.report.netSales,"0.00");assert.equal(snapshot.report.refunded,"0.00");
    await json(await api(`/collections/returns/${returned.id}`,"PATCH",{refund:"1.00"}),400);
    await json(await api("/workspace/finance/transactions","POST",{idempotencyKey:randomUUID(),accountId:account.id,type:"refund",direction:"out",amount:"20.00",date:new Date().toISOString().slice(0,10),status:"paid",reference:"REPORT-REFUND",sourceCollection:"returns",sourceId:returned.id}),201);
    snapshot=await json(await api(base));assert.equal(snapshot.report.refunded,"20.00");assert.equal(snapshot.returns[0].settlement.outstanding,"0.00");
  });

});
