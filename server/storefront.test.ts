import { TEST_DATA_DIR } from "./test-env.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { request as httpRequest, type Server } from "node:http";
import { createApp } from "./app.js";
import {
  getCollection,
  getStore,
  saveStore,
  resetTestCache,
} from "./storage.js";
import { expireShopReservations, reservedStock } from "./commerce-stock.js";
import { storefrontForHost } from "./storefront.js";
type Row = Record<string, any>;
let server: Server,
  base: string,
  admin = "",
  guest = "",
  company: Row,
  foreign: Row,
  product: Row,
  settings: Row,
  order: Row,
  accepted: Row;
const token = () => randomBytes(32).toString("hex");
function hostRequest(path: string, host: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      base + path,
      { headers: { host } },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () =>
          resolve(
            new Response(Buffer.concat(chunks).toString(), {
              status: response.statusCode,
            }),
          ),
        );
      },
    );
    request.on("error", reject);
    request.end();
  });
}
async function req(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = admin,
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
const api = "/storefront/amal",
  config = () => `/workspace/storefronts/${company.id}`;
async function quote(quantity = 2) {
  return json(
    await req(
      api + "/quote",
      "POST",
      { lines: [{ productId: product.id, quantity }], method: "delivery" },
      guest,
    ),
  );
}
function body(q: Row, extra: Row = {}) {
  return {
    requestId: randomUUID(),
    receiptSecret: token(),
    customer: "Amal test customer",
    email: "customer@amal.test",
    phone: "+249 912345678",
    address: "12 Example Road, Example City",
    region: "Example City",
    notes: "Isolated QA order",
    consent: true,
    website: "",
    method: "delivery",
    lines: [{ productId: product.id, quantity: 2 }],
    quoteToken: q.quoteToken,
    ...extra,
  };
}
before(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const setup = await req(
    "/auth/setup",
    "POST",
    {
      name: "Amal owner",
      email: "owner@amal.test",
      password: token(),
      setupKey: "local-setup",
    },
    "",
  );
  await json(setup, 201);
  admin = setup.headers.get("set-cookie")!.split(";")[0];
  const org = (
    await json(
      await req("/collections/organizations", "POST", {
        name: "Amal test organization",
        status: "active",
      }),
      201,
    )
  ).item;
  for (const name of ["Amal Retail", "Other retailer"]) {
    const c = (
      await json(
        await req("/collections/companies", "POST", {
          name,
          parentOrganizationId: org.id,
          organizationType: "store",
          industry: "retail",
          status: "active",
          currency: "SDG",
        }),
        201,
      )
    ).item;
    if (!company) company = c;
    else foreign = c;
  }
  product = (
    await json(
      await req(`/workspace/shops/${company.id}/products`, "POST", {
        products: [
          {
            sku: "AMAL-TEA",
            name: "Everyday tea",
            price: "12.35",
            category: "Tea & pantry",
          },
        ],
      }),
      201,
    )
  ).products[0];
  await json(
    await req(`/workspace/shops/${company.id}/receipts`, "POST", {
      requestId: randomUUID(),
      productId: product.id,
      quantity: 10,
      supplier: "QA supplier",
      reference: "QA-AMAL-IN",
    }),
    201,
  );
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  assert.ok(
    resolve(TEST_DATA_DIR).startsWith(resolve(tmpdir()) + sep) &&
      TEST_DATA_DIR.includes("stocrant-test-data-"),
  );
  rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});
describe("Amal connected storefront", () => {
  it("saves an editable draft, gates publication and protects company settings", async () => {
    settings = (await json(await req(config()))).settings;
    assert.equal(settings.name, "Amal");
    settings = (await json(await req(config(), "PUT", settings))).settings;
    await json(await req(api + "/catalog", "GET", undefined, ""), 404);
    assert.equal((await json(await req(api + "/catalog"))).shop.preview, true);
    const payload = Object.fromEntries(
      Object.keys(settings)
        .filter((k) => !["id", "organizationId", "updatedAt"].includes(k))
        .map((k) => [k, settings[k]]),
    );
    await json(
      await req(config(), "PUT", { ...payload, published: true }),
      400,
    );
    await json(await req(config(), "PUT", { ...payload, version: 0 }), 409);
    settings = (
      await json(
        await req(config(), "PUT", {
          ...payload,
          published: true,
          contactEmail: "hello@amal.test",
          phone: "+249 900000000",
          address: "QA collection point",
          deliveryEnabled: true,
          deliveryFee: "5.00",
          deliveryRegions: "Example City, Nearby City",
          manualPaymentsAccepted: true,
          shippingPolicy: "Test shipping policy, not a live merchant policy.",
          returnsPolicy: "Test returns policy.",
          privacyPolicy: "Test privacy policy.",
          terms: "Test terms.",
        }),
      )
    ).settings;
    await json(await req(config(), "GET", undefined, ""), 401);
    await json(
      await req(`/workspace/storefronts/${foreign.id}`, "PUT", {
        ...payload,
        version: 0,
      }),
      409,
    );
    for (const name of ["shopStorefronts", "storefrontCheckouts"])
      await json(await req(`/collections/${name}`), 404);
  });
  it("exposes only this shop's public catalog and issues a private signed guest cookie", async () => {
    const response = await req(api + "/catalog", "GET", undefined, "");
    const result = await json(response);
    guest = response.headers.get("set-cookie")!.split(";")[0];
    assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
    assert.match(response.headers.get("set-cookie")!, /SameSite=Lax/);
    assert.equal(result.shop.name, "Amal");
    assert.equal(result.shop.organizationId, undefined);
    assert.equal(result.shop.connectorId, undefined);
    assert.equal(result.shop.ownerId, undefined);
    assert.equal(result.products.length, 1);
    assert.equal(result.products[0].category, "Tea & pantry");
    assert.equal(result.products[0].inventoryItemId, undefined);
    assert.equal(result.products[0].available, 10);
    await json(
      await req(
        api + "/quote",
        "POST",
        { lines: [{ productId: product.id, quantity: 1 }], method: "pickup" },
        "",
      ),
      401,
    );
    await json(
      await req(
        api + "/quote",
        "POST",
        { lines: [{ productId: product.id, quantity: 1 }], method: "pickup" },
        `stocrant_shop_guest=${"a".repeat(64)}.${"é".repeat(64)}`,
      ),
      401,
    );
    const previousMode = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const secure = await req(api + "/catalog", "GET", undefined, "");
      await json(secure);
      assert.match(secure.headers.get("set-cookie")!, /__Host-stocrant-shop=/);
      assert.match(secure.headers.get("set-cookie")!, /; Secure/);
    } finally {
      process.env.NODE_ENV = previousMode;
    }
    await json(
      await req(
        api + "/quote",
        "POST",
        {
          lines: [{ productId: product.id, quantity: 1, price: "0.01" }],
          method: "pickup",
        },
        guest,
      ),
      400,
    );
    await json(
      await req(
        api + "/quote",
        "POST",
        { lines: [{ productId: product.id, quantity: 1 }], method: "pickup" },
        guest,
        { Origin: "https://evil.example" },
      ),
      403,
    );
  });
  it("requires a current server quote and accepts one order without collecting cash", async () => {
    const q = await quote();
    assert.equal(q.total, "29.70");
    const b = body(q);
    await json(
      await req(api + "/checkout", "POST", { ...b, discount: "20" }, guest),
      400,
    );
    await json(
      await req(api + "/checkout", "POST", { ...b, consent: false }, guest),
      400,
    );
    await json(
      await req(
        api + "/checkout",
        "POST",
        { ...b, quoteToken: "1.invalid" },
        guest,
      ),
      409,
    );
    await json(
      await req(
        api + "/checkout",
        "POST",
        { ...b, region: "Unknown city" },
        guest,
      ),
      400,
    );
    accepted = b;
    order = (await json(await req(api + "/checkout", "POST", b, guest), 201))
      .order;
    assert.equal(order.total, "29.70");
    assert.equal(order.status, "reserved");
    assert.equal(order.payment, "not-collected-online");
    assert.equal((getCollection("financeTransactions") as Row[]).length, 0);
    assert.equal(reservedStock(product.inventoryItemId), 2);
    resetTestCache();
    assert.equal(
      (await json(await req(api + "/checkout", "POST", b, guest))).order.id,
      order.id,
    );
    assert.equal((getCollection("shopOrders") as Row[]).length, 1);
    const alerts = (getCollection("notifications") as Row[]).filter(n => n.target === `shop-order:${order.id}`);
    assert.equal(alerts.length, 1);
    const alert = await json(await req(`/notifications/${alerts[0].id}`));
    assert.equal(alert.link.to, `/shops?company=${company.id}&order=${order.id}`);
    assert.equal(alert.details.phone, undefined); assert.equal(alert.details.customer, undefined);
    await json(
      await req(
        api + "/checkout",
        "POST",
        { ...b, phone: "+249 911111111" },
        guest,
      ),
      409,
    );
  });
  it("keeps tracking private and rejects stock or price changes before acceptance", async () => {
    await json(
      await req(
        api + "/receipt",
        "POST",
        { orderId: order.id, receiptSecret: token() },
        "",
      ),
      404,
    );
    const receipt = (
      await json(
        await req(
          api + "/receipt",
          "POST",
          { orderId: order.id, receiptSecret: accepted.receiptSecret },
          "",
        ),
      )
    ).order;
    assert.equal(receipt.id, order.id);
    assert.equal(receipt.customer, undefined);
    assert.equal(receipt.phone, undefined);
    assert.equal(receipt.address, undefined);
    assert.equal(receipt.connectorId, undefined);
    const q = await quote();
    const record = (getCollection("shopProducts") as Row[]).find(
      (p) => p.id === product.id,
    )!;
    record.price = "13.00";
    saveStore(getStore());
    await json(await req(api + "/checkout", "POST", body(q), guest), 409);
    assert.equal(
      (await json(await req(api + "/checkout", "POST", accepted, guest))).order
        .total,
      "29.70",
    );
    record.price = "12.35";
    saveStore(getStore());
    await json(
      await req(
        api + "/quote",
        "POST",
        {
          lines: [{ productId: product.id, quantity: 11 }],
          method: "delivery",
        },
        guest,
      ),
      409,
    );
  });
  it("follows preparation, dispatch and delivery from the manager workspace", async () => {
    const p = `/workspace/shops/${company.id}/orders/${order.id}/status`;
    let current = await json(
      await req(p, "POST", { version: 1, status: "preparing" }),
    );
    current = await json(
      await req(p, "POST", {
        version: current.version,
        status: "dispatched",
        tracking: "AMAL-QA-OUT",
      }),
    );
    assert.ok(current.saleId);
    await json(
      await req(p, "POST", { version: current.version, status: "delivered" }),
    );
    const receipt = (
      await json(
        await req(
          api + "/receipt",
          "POST",
          { orderId: order.id, receiptSecret: accepted.receiptSecret },
          "",
        ),
      )
    ).order;
    assert.equal(receipt.status, "delivered");
    assert.equal(receipt.tracking, "AMAL-QA-OUT");
    assert.equal(receipt.events.length, 4);
  });
  it("expires abandoned reservations durably while retaining prepared orders", async () => {
    const q = await quote(1);
    const b = body(q, { lines: [{ productId: product.id, quantity: 1 }] });
    const created = (
      await json(await req(api + "/checkout", "POST", b, guest), 201)
    ).order;
    const stored = (getCollection("shopOrders") as Row[]).find(
      (o) => o.id === created.id,
    )!;
    stored.reservationExpiresAt = new Date(Date.now() - 1000).toISOString();
    saveStore(getStore());
    expireShopReservations();
    resetTestCache();
    const expired = (
      await json(
        await req(
          api + "/receipt",
          "POST",
          { orderId: created.id, receiptSecret: b.receiptSecret },
          "",
        ),
      )
    ).order;
    assert.equal(expired.status, "cancelled");
    assert.equal(reservedStock(product.inventoryItemId), 0);
    const manual = (getCollection("shopOrders") as Row[]).find(
      (o) => o.id === created.id,
    )!;
    manual.status = "preparing";
    saveStore(getStore());
    expireShopReservations();
    assert.equal(manual.status, "preparing");
    assert.equal(reservedStock(product.inventoryItemId), 1);
    manual.status = "cancelled";
    saveStore(getStore());
  });
  it("binds a custom hostname explicitly and stops a revoked connection", async () => {
    process.env.STOCRANT_SHOP_HOSTS = "shop.example.test=amal";
    assert.equal(
      (
        await json(
          await hostRequest("/api/storefront/resolve", "shop.example.test"),
        )
      ).slug,
      "amal",
    );
    assert.equal(storefrontForHost("shop.example.test"), "amal");
    await json(
      await hostRequest("/api/storefront/resolve", "unmapped.example.test"),
      404,
    );
    delete process.env.STOCRANT_SHOP_HOSTS;
    const shop = (getCollection("shopStorefronts") as Row[])[0],
      connector = (getCollection("shopConnectors") as Row[]).find(
        (c) => c.id === shop.connectorId,
      )!;
    connector.active = false;
    saveStore(getStore());
    await json(await req(api + "/catalog", "GET", undefined, ""), 503);
    connector.active = true;
    saveStore(getStore());
    const account = (getCollection("accessUsers") as Row[]).find(
      (a) => a.id === connector.ownerId,
    )!;
    account.permissions = [];
    const role = account.roleId;
    account.roleId = "role-employee";
    saveStore(getStore());
    await json(await req(api + "/catalog", "GET", undefined, ""), 403);
    delete account.permissions;
    account.roleId = role;
    saveStore(getStore());
  });
  it("pauses new checkout under finance approval policies and throttles new attempts without breaking retries", async () => {
    const rule = {
      id: randomUUID(),
      section: "finance",
      action: "create",
      active: true,
    };
    (getCollection("approvalRules") as Row[]).push(rule);
    saveStore(getStore());
    await json(
      await req(
        api + "/quote",
        "POST",
        { lines: [{ productId: product.id, quantity: 1 }], method: "delivery" },
        guest,
      ),
      503,
    );
    rule.active = false;
    saveStore(getStore());
    const q = await quote(1),
      beforeCount = getCollection("shopOrders").length;
    await json(
      await req(
        api + "/checkout",
        "POST",
        body(q, { lines: [{ productId: product.id, quantity: 1 }] }),
        guest,
      ),
      429,
    );
    assert.equal(getCollection("shopOrders").length, beforeCount);
    assert.equal(
      (await json(await req(api + "/checkout", "POST", accepted, guest))).order
        .id,
      order.id,
    );
  });
});
