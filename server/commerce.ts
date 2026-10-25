import { Router } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthenticatedUser } from "./auth.js";
import { publicUser } from "./auth.js";
import { newProductAwb } from "./product-awb.js";
import { photoUrl, photoList, validatePhotos, productPhotos } from "./shop-media.js";
import { can, isWithinScope, ownRecordsRequired } from "./permissions.js";
import { getCollection, getStore, saveStore, transaction } from "./storage.js";
import { audit, mutateCollection, requiresApproval } from "./workspace.js";
import {
  cashAmount,
  companyFinanceDate,
  settlementRows,
} from "./finance-ledger.js";
import { money, precision, scaled } from "./payroll-model.js";
import {
  expireShopReservations,
  physicalStock,
  reservedStock,
} from "./commerce-stock.js";

type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
function fail(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}
const text = z.string().trim().min(1).max(180);
const productInput = z
  .object({
    sku: z.string().trim().min(1).max(80),
    name: text,
    description: z.string().trim().max(2000).default(""),
    price: z.string().max(24),
    category: z.string().trim().min(1).max(80).default("Collection"),
    warranty: z.boolean().default(false),
    warrantyDetails: z.string().trim().max(240).default(""),
    image: photoUrl.default(""),
    images: photoList.optional(),
    stockLocation: text.default("Main stock"),
    inventoryItemId: z.string().optional(),
  })
  .strict();
const orderInput = z
  .object({
    requestId: z.string().uuid(),
    customer: text,
    email: z.union([z.literal(""), z.string().email().max(180)]).default(""),
    phone: z.string().trim().min(3).max(60),
    address: z.string().trim().max(1000).default(""),
    notes: z.string().trim().max(2000).default(""),
    externalReference: z.string().trim().max(120).default(""),
    lines: z
      .array(
        z
          .object({
            productId: text,
            quantity: z.number().int().min(1).max(100000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    delivery: z.string().default("0"),
    discount: z.string().default("0"),
  })
  .strict();

export function shopCompany(user: AuthenticatedUser, id: string) {
  const row = rows("companies").find(
    (c) => c.id === id && c.status === "active",
  );
  if (
    !row ||
    !isWithinScope(user, { ...row, organizationId: row.id }) ||
    ownRecordsRequired(user)
  )
    fail("Company not found.", 404);
  return row;
}
export function shopPermission(
  user: AuthenticatedUser,
  action: "view" | "create" | "edit",
) {
  if (!can(user, "inventory", action) || !can(user, "operations", action))
    fail("Shop management requires inventory and operations permission.", 403);
  if (
    action !== "view" &&
    ["inventory", "operations"].some(
      (section) =>
        requiresApproval(section as "inventory" | "operations", action, user) &&
        !can(user, section as "inventory" | "operations", "approve"),
    )
  )
    fail(
      "An authorized approver must perform this shop action under the current approval rules.",
      403,
    );
}
function insert(name: string, data: Row) {
  const row = {
    ...data,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  rows(name).push(row);
  return row;
}
function write(
  user: AuthenticatedUser,
  companyId: string,
  event: string,
  fn: () => Row,
) {
  return transaction(() => {
    const result = fn();
    audit(user, `shop.${event}`, {
      organizationId: companyId,
      targetId: result.id,
      section: "operations",
    });
    saveStore(getStore());
    return result;
  });
}
export function shopStock(product: Row) {
  const item = rows("inventoryItems").find(
    (i) => i.id === product.inventoryItemId,
  );
  const onHand = item ? physicalStock(item) : 0;
  const reserved = reservedStock(product.inventoryItemId);
  return { onHand, reserved, available: Math.max(0, onHand - reserved) };
}
function visibleProduct(
  user: AuthenticatedUser,
  companyId: string,
  id: string,
) {
  const p = rows("shopProducts").find(
    (p) => p.id === id && p.organizationId === companyId,
  );
  const item = rows("inventoryItems").find((i) => i.id === p?.inventoryItemId);
  if (!p || !item || !isWithinScope(user, item))
    fail("Product not found.", 404);
  return p;
}
function prepareProducts(user: AuthenticatedUser, c: Row, input: unknown) {
  const products = z.array(productInput).min(1).max(500).parse(input);
  const seen = new Set<string>();
  return products.map((p) => {
    const key = p.sku.toLowerCase();
    if (
      seen.has(key) ||
      rows("shopProducts").some(
        (r) => r.organizationId === c.id && r.sku.toLowerCase() === key,
      )
    )
      fail(`SKU already exists: ${p.sku}`, 409);
    seen.add(key);
    const price = cashAmount(p.price, c.currency);
    if (scaled(price) < 0n) fail("Product price cannot be negative.");
    const existing = rows("inventoryItems").filter(
      (i) => i.organizationId === c.id && String(i.sku).toLowerCase() === key,
    );
    if (existing.length > 1)
      fail(
        `SKU has multiple stock records: ${p.sku}. Resolve them before import.`,
      );
    const item = p.inventoryItemId
      ? rows("inventoryItems").find((i) => i.id === p.inventoryItemId)
      : existing[0];
    if (
      item &&
      (item.organizationId !== c.id ||
        String(item.sku).toLowerCase() !== key ||
        !isWithinScope(user, item))
    )
      fail("Choose an accessible stock item with the same company and SKU.");
    if (p.inventoryItemId && !item) fail("Stock item not found.");
    if (
      !item &&
      !isWithinScope(user, { organizationId: c.id, createdBy: user.id })
    )
      fail("Create an inventory item in your permitted location first.", 403);
    return {
      ...p,
      warrantyDetails: p.warranty ? p.warrantyDetails : "",
      images: validatePhotos(c.id, p.image, p.images),
      price,
      currency: c.currency,
      organizationId: c.id,
      inventoryItemId: item?.id,
      locationId: item?.locationId,
    };
  });
}
function createProducts(user: AuthenticatedUser, c: Row, input: unknown) {
  return prepareProducts(user, c, input).map((p) => {
    const item = p.inventoryItemId
      ? undefined
      : insert("inventoryItems", {
          organizationId: c.id,
          sku: p.sku,
          name: p.name,
          unit: "piece",
          itemType: "finished-product",
          stockLocation: p.stockLocation,
          openingStock: 0,
          reorderPoint: 0,
          createdBy: user.id,
          createdByName: user.name,
          allowedEmployeeIds: [],
          awb: newProductAwb(
            new Set(
              [...rows("products"), ...rows("inventoryItems")].map((item) =>
                String(item.awb || ""),
              ),
            ),
          ),
        });
    if (item)
      insert("inventoryHistory", {
        inventoryItemId: item.id,
        organizationId: c.id,
        actor: user.name,
        actorId: user.id,
        occurredAt: new Date().toISOString(),
        action: "create",
        changedFields: ["sku", "name", "stockLocation"],
        source: "shop",
      });
    return insert("shopProducts", {
      ...p,
      inventoryItemId: p.inventoryItemId || item!.id,
      active: true,
      version: 1,
      createdBy: user.id,
    });
  });
}
export function createShopOrder(
  user: AuthenticatedUser,
  c: Row,
  input: unknown,
  connectorId?: string,
  storefrontPrices?: ReadonlyMap<string, { price: string; originalPrice?: string; offerId?: string; offerTitle?: string }>,
): Row {
  const body = orderInput.parse(input);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");
  const prior = rows("shopOrders").find(
    (o) =>
      o.organizationId === c.id &&
      o.requestId === body.requestId &&
      (o.connectorId || "") === (connectorId || ""),
  );
  if (prior) {
    if (prior.fingerprint !== fingerprint)
      fail("This request ID was already used for a different order.", 409);
    return prior;
  }
  if (
    body.externalReference &&
    rows("shopOrders").some(
      (o) =>
        o.organizationId === c.id &&
        o.connectorId === connectorId &&
        o.externalReference === body.externalReference,
    )
  )
    fail("This external order reference already exists.", 409);
  if (new Set(body.lines.map((l) => l.productId)).size !== body.lines.length)
    fail("Combine duplicate product lines.");
  const digits = precision(c.currency);
  const lines = body.lines.map((line) => {
    const p = visibleProduct(user, c.id, line.productId);
    if (!p.active || p.currency !== c.currency)
      fail("Product is inactive or its currency differs from the company.");
    if (shopStock(p).available < line.quantity)
      fail(`Insufficient available stock for ${p.sku}.`, 409);
    const offered = storefrontPrices?.get(p.id);
    const price = offered ? cashAmount(offered.price, c.currency) : p.price;
    if (scaled(price, digits) < 0n || scaled(price, digits) > scaled(p.price, digits)) fail("Invalid storefront price.");
    return {
      ...line,
      inventoryItemId: p.inventoryItemId,
      sku: p.sku,
      name: p.name,
      ...(offered?.offerId ? { originalPrice: p.price, offerId: offered.offerId, offerTitle: offered.offerTitle } : {}),
      price,
      total: money(scaled(price, digits) * BigInt(line.quantity), digits),
    };
  });
  const delivery = cashAmount(body.delivery, c.currency),
    discount = cashAmount(body.discount, c.currency);
  if (scaled(delivery) < 0n || scaled(discount) < 0n)
    fail("Delivery and discount cannot be negative.");
  const subtotalUnits = lines.reduce((n, l) => n + scaled(l.total, digits), 0n);
  if (scaled(discount, digits) > subtotalUnits)
    fail("Discount exceeds the products subtotal.");
  return insert("shopOrders", {
    ...body,
    lines,
    delivery,
    discount,
    subtotal: money(subtotalUnits, digits),
    total: money(
      subtotalUnits + scaled(delivery, digits) - scaled(discount, digits),
      digits,
    ),
    currency: c.currency,
    organizationId: c.id,
    connectorId,
    fingerprint,
    status: "reserved",
    version: 1,
    createdBy: user.id,
    events: [
      { status: "reserved", at: new Date().toISOString(), actor: user.name },
    ],
  });
}
function publicOrder(order: Row) {
  const { fingerprint, requestId, ...safe } = order;
  return safe;
}

export const commerceRouter = Router();
commerceRouter.use((req, res, next) => {
  try {
    expireShopReservations();
    shopPermission(req.auth!, "view");
    next();
  } catch (e) {
    sendError(res, e);
  }
});
commerceRouter.get("/", (req, res) => {
  const companies = rows("companies").filter(
    (c) =>
      c.status === "active" &&
      isWithinScope(req.auth!, { ...c, organizationId: c.id }) &&
      !ownRecordsRequired(req.auth!),
  );
  res.json({
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      currency: c.currency,
    })),
  });
});
commerceRouter.get("/:companyId", (req, res) => {
  try {
    const c = shopCompany(req.auth!, String(req.params.companyId));
    const products: Row[] = rows("shopProducts")
      .filter(
        (p) =>
          p.organizationId === c.id &&
          isWithinScope(
            req.auth!,
            rows("inventoryItems").find((i) => i.id === p.inventoryItemId) ||
              {},
          ),
      )
      .map((p) => ({ ...p, ...shopStock(p) }));
    const orders = rows("shopOrders")
      .filter(
        (o) =>
          o.organizationId === c.id &&
          o.lines.every((l: Row) => products.some((p) => p.id === l.productId)),
      )
      .map((o) => ({
        ...publicOrder(o),
        settlement:
          o.saleId && can(req.auth, "finance", "view")
            ? settlementRows(
                "sales",
                rows("sales").find((s) => s.id === o.saleId)!,
              )
            : undefined,
      }))
      .reverse();
    res.json({
      products,
      categories: (rows("shopStorefronts").find(s => s.organizationId === c.id)?.merchandising?.categories || []).map((c: Row) => ({ name: c.name, title: c.title })),
      orders,
      purchases:rows("purchases").filter(p=>p.organizationId===c.id&&isWithinScope(req.auth!,p)&&["ordered","partial","received"].includes(p.status)).map(p=>({id:p.id,label:p.poNumber||p.id,supplier:p.supplier||"",currency:p.currency||c.currency})),
      receipts: rows("shopReceipts")
        .filter(
          (r) =>
            r.organizationId === c.id &&
            products.some((p) => p.id === r.productId),
        )
        .slice(-100)
        .reverse(),
      connectors: (can(req.auth, "access", "edit") || can(req.auth, "shops", "configure"))
        ? rows("shopConnectors")
            .filter((r) => r.organizationId === c.id)
            .map(({ keyHash, ...r }) => r)
        : [],
    });
  } catch (e) {
    sendError(res, e);
  }
});
commerceRouter.post("/:companyId/products/preview", (req, res) => {
  try {
    shopPermission(req.auth!, "create");
    const c = shopCompany(req.auth!, String(req.params.companyId));
    res.json({ products: prepareProducts(req.auth!, c, req.body.products) });
  } catch (e) {
    sendError(res, e);
  }
});
commerceRouter.post("/:companyId/products", (req, res) => {
  try {
    shopPermission(req.auth!, "create");
    const c = shopCompany(req.auth!, String(req.params.companyId));
    const result = write(req.auth!, c.id, "products.imported", () => ({
      products: createProducts(req.auth!, c, req.body.products),
    }));
    res.status(201).json(result);
  } catch (e) {
    sendError(res, e);
  }
});
commerceRouter.patch("/:companyId/products/:id", (req, res) => {
  try {
    shopPermission(req.auth!, "edit");
    const c = shopCompany(req.auth!, String(req.params.companyId));
    const body = z
      .object({
        version: z.number().int(),
        name: text,
        description: z.string().max(2000),
        price: z.string(),
        category: z.string().trim().min(1).max(80).optional(),
        active: z.boolean(),
        image: productInput.shape.image,
        images: photoList.optional(),
        warranty: z.boolean().optional(),
        warrantyDetails: z.string().trim().max(240).optional(),
      })
      .strict()
      .parse(req.body);
    res.json(
      write(req.auth!, c.id, "product.updated", () => {
        const p = visibleProduct(req.auth!, c.id, String(req.params.id));
        if (p.version !== body.version)
          fail("Product changed. Reload before saving.", 409);
        const price = cashAmount(body.price, p.currency);
        if (scaled(price) < 0n) fail("Price cannot be negative.");
        const images = validatePhotos(c.id, body.image, body.images ?? (body.image === p.image ? productPhotos(p) : undefined));
        const warranty = body.warranty ?? p.warranty === true;
        const warrantyDetails = warranty ? body.warrantyDetails ?? p.warrantyDetails ?? "" : "";
        Object.assign(p, body, { images, warranty, warrantyDetails, price, version: p.version + 1 });
        return p;
      }),
    );
  } catch (e) {
    sendError(res, e);
  }
});
commerceRouter.post("/:companyId/receipts", (req, res) => {
  try {
    shopPermission(req.auth!, "create");
    const c = shopCompany(req.auth!, String(req.params.companyId));
    const b = z
      .object({
        requestId: z.string().uuid(),
        productId: text,
        purchaseId:z.string().trim().max(100).optional(),
        quantity: z.number().int().min(1).max(1000000),
        supplier: text,
        reference: text,
        notes: z.string().max(2000).default(""),
      })
      .strict()
      .parse(req.body);
    res.status(201).json(
      write(req.auth!, c.id, "stock.received", () => {
        const p = visibleProduct(req.auth!, c.id, b.productId);
        const fingerprint = JSON.stringify(b);
        const prior = rows("shopReceipts").find(
          (r) => r.organizationId === c.id && r.requestId === b.requestId,
        );
        if (prior) {
          if (prior.fingerprint !== fingerprint)
            fail("Receipt request already used.", 409);
          return prior;
        }
        if(b.purchaseId&&!rows("purchases").some(p=>p.id===b.purchaseId&&p.organizationId===c.id&&isWithinScope(req.auth!,p)&&["ordered","partial","received"].includes(p.status)))fail("Choose an approved purchase from this company.");
        if (
          rows("shopReceipts").some(
            (r) =>
              r.organizationId === c.id &&
              r.productId === p.id &&
              r.supplier === b.supplier &&
              r.reference === b.reference,
          )
        )
          fail(
            "This product and supplier shipment reference was already received.",
            409,
          );
        const receipt = insert("shopReceipts", {
          ...b,
          fingerprint,
          organizationId: c.id,
          receivedBy: req.auth!.name,
        });
        insert("inventoryMovements", {
          inventoryItemId: p.inventoryItemId,
          organizationId: c.id,
          locationId: p.locationId,
          type: "incoming",
          quantity: b.quantity,
          date: companyFinanceDate(c.id),
          reason: b.notes || `Shipment from ${b.supplier}`,
          reference: b.reference,
          shopReceiptId: receipt.id,
          ...(b.purchaseId?{purchaseId:b.purchaseId}:{}),
          responsibleUser: req.auth!.name,
        });
        return receipt;
      }),
    );
  } catch (e) {
    sendError(res, e);
  }
});
commerceRouter.post("/:companyId/orders", (req, res) => {
  try {
    shopPermission(req.auth!, "create");
    const c = shopCompany(req.auth!, String(req.params.companyId));
    res
      .status(201)
      .json(
        publicOrder(
          write(req.auth!, c.id, "order.created", () =>
            createShopOrder(req.auth!, c, req.body),
          ),
        ),
      );
  } catch (e) {
    sendError(res, e);
  }
});
commerceRouter.post("/:companyId/orders/:id/status", (req, res) => {
  try {
    shopPermission(req.auth!, "edit");
    const c = shopCompany(req.auth!, String(req.params.companyId));
    const b = z
      .object({
        version: z.number().int(),
        status: z.enum(["preparing", "dispatched", "delivered", "cancelled"]),
        tracking: z.string().trim().max(300).default(""),
      })
      .strict()
      .parse(req.body);
    res.json(
      publicOrder(
        write(req.auth!, c.id, "order.status", () => {
          const o = rows("shopOrders").find(
            (o) => o.id === req.params.id && o.organizationId === c.id,
          );
          if (!o) fail("Order not found.", 404);
          o.lines.forEach((l: Row) =>
            visibleProduct(req.auth!, c.id, l.productId),
          );
          if (o.version !== b.version)
            fail("Order changed. Reload before saving.", 409);
          const transitions: Record<string, string[]> = {
            reserved: ["preparing", "cancelled"],
            preparing: ["dispatched", "cancelled"],
            dispatched: ["delivered"],
            delivered: [],
            cancelled: [],
          };
          if (!transitions[o.status]?.includes(b.status))
            fail("Invalid order status transition.", 409);
          if (b.status === "dispatched") {
            if (
              !can(req.auth, "finance", "create") ||
              !can(req.auth, "inventory", "create")
            )
              fail(
                "Dispatch also requires inventory and finance create permissions.",
                403,
              );
            if (requiresApproval("finance", "create", req.auth!))
              fail(
                "Finance approval rules are active. Resolve the sales approval workflow before dispatch.",
                409,
              );
            if (!b.tracking) fail("Enter a shipment or collection reference.");
            for (const line of o.lines) {
              const p = visibleProduct(req.auth!, c.id, line.productId);
              if (shopStock(p).onHand < reservedStock(p.inventoryItemId))
                fail("Reserved stock is no longer available.", 409);
              insert("inventoryMovements", {
                inventoryItemId: p.inventoryItemId,
                organizationId: c.id,
                locationId: p.locationId,
                type: "outgoing",
                quantity: line.quantity,
                date: companyFinanceDate(c.id),
                reason: "Shop order dispatched",
                reference: b.tracking,
                shopOrderId: o.id,
                responsibleUser: req.auth!.name,
              });
            }
            const sale = mutateCollection(req.auth!, "sales", "create", {
              organizationId: c.id,
              locationId:
                new Set(
                  o.lines.map(
                    (line: Row) =>
                      visibleProduct(req.auth!, c.id, line.productId)
                        .locationId,
                  ),
                ).size === 1
                  ? visibleProduct(req.auth!, c.id, o.lines[0].productId)
                      .locationId
                  : undefined,
              invoiceNo: `SHOP-${o.id}`,
              date: companyFinanceDate(c.id),
              customer: o.customer,
              channel: "online",
              items: o.lines.reduce((n: number, l: Row) => n + l.quantity, 0),
              subtotal: o.subtotal,
              tax: "0",
              total: o.total,
              currency: o.currency,
              payment: "credit",
              status: "completed",
              shopOrderId: o.id,
            });
            if (sale.pending || !sale.item)
              fail("Sale could not be posted.", 409);
            o.saleId = sale.item.id;
          }
          o.status = b.status;
          o.tracking = b.tracking || o.tracking;
          o.version++;
          o.events.push({
            status: b.status,
            at: new Date().toISOString(),
            actor: req.auth!.name,
          });
          return o;
        }),
      ),
    );
  } catch (e) {
    sendError(res, e);
  }
});
commerceRouter.post("/:companyId/connectors", (req, res) => {
  try {
    shopPermission(req.auth!, "edit");
    if (!can(req.auth, "access", "edit") && !can(req.auth, "shops", "configure"))
      fail("Access administration permission is required.", 403);
    const c = shopCompany(req.auth!, String(req.params.companyId));
    const b = z.object({ name: text }).strict().parse(req.body);
    const key = `stocrant_shop_${randomBytes(32).toString("hex")}`;
    const connector = write(req.auth!, c.id, "connector.created", () =>
      insert("shopConnectors", {
        organizationId: c.id,
        name: b.name,
        ownerId: req.auth!.id,
        active: true,
        keyHash: createHash("sha256").update(key).digest("hex"),
      }),
    );
    const { keyHash, ...safe } = connector;
    res.status(201).json({ connector: safe, key });
  } catch (e) {
    sendError(res, e);
  }
});
commerceRouter.delete("/:companyId/connectors/:id", (req, res) => {
  try {
    shopPermission(req.auth!, "edit");
    if (!can(req.auth, "access", "edit") && !can(req.auth, "shops", "configure"))
      fail("Access administration permission is required.", 403);
    const c = shopCompany(req.auth!, String(req.params.companyId));
    res.json(
      write(req.auth!, c.id, "connector.revoked", () => {
        const r = rows("shopConnectors").find(
          (r) => r.id === req.params.id && r.organizationId === c.id,
        );
        if (!r) fail("Connection not found.", 404);
        r.active = false;
        return { id: r.id, active: false };
      }),
    );
  } catch (e) {
    sendError(res, e);
  }
});
function sendError(res: import("express").Response, error: unknown) {
  const e = error as Error & { statusCode?: number };
  res.status(e.statusCode || 400).json({
    error:
      error instanceof z.ZodError
        ? error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")
        : e.message,
  });
}

/** Server-to-server API; keys never belong in the storefront JavaScript. */
export const shopIntegrationRouter = Router();
const integrationRates = new Map<string, { at: number; count: number }>();
shopIntegrationRouter.use((req, res, next) => {
  try {
    expireShopReservations();
    if (req.get("origin"))
      fail("Shop connections must be used by your website server.", 403);
    const key = req.get("authorization")?.replace(/^Bearer /, "") || "";
    if (!key.startsWith("stocrant_shop_"))
      fail("A shop connection key is required.", 401);
    const hash = createHash("sha256").update(key).digest("hex");
    const connector = rows("shopConnectors").find(
      (r) => r.active && r.keyHash === hash,
    );
    const account = rows("accessUsers").find(
      (a) =>
        a.id === connector?.ownerId &&
        a.status === "active" &&
        !a.mustChangePassword,
    );
    if (!connector || !account)
      fail("Invalid or revoked shop connection.", 401);
    const now = Date.now();
    for (const [id, rate] of integrationRates)
      if (now - rate.at > 60000) integrationRates.delete(id);
    const rate = integrationRates.get(connector.id) || { at: now, count: 0 };
    rate.count++;
    integrationRates.set(connector.id, rate);
    if (rate.count > 120) {
      res.setHeader("Retry-After", "60");
      fail("Too many shop requests. Retry in one minute.", 429);
    }
    const user = publicUser(account as Parameters<typeof publicUser>[0]);
    shopPermission(user, "view");
    shopCompany(user, connector.organizationId);
    res.locals.shop = { connector, user };
    next();
  } catch (e) {
    sendError(res, e);
  }
});
shopIntegrationRouter.get("/catalog", (_req, res) => {
  const { user, connector } = res.locals.shop;
  res.json({
    products: rows("shopProducts")
      .filter(
        (p) =>
          p.organizationId === connector.organizationId &&
          p.active &&
          isWithinScope(
            user,
            rows("inventoryItems").find((i) => i.id === p.inventoryItemId) ||
              {},
          ),
      )
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        description: p.description,
        image: p.image,
        images: productPhotos(p),
        warranty: p.warranty === true,
        warrantyDetails: p.warranty === true ? p.warrantyDetails || "" : "",
        price: p.price,
        currency: p.currency,
        available: shopStock(p).available,
      })),
  });
});
shopIntegrationRouter.post("/orders", (req, res) => {
  try {
    const { user, connector } = res.locals.shop;
    shopPermission(user, "create");
    const c = shopCompany(user, connector.organizationId);
    const order = write(user, c.id, "integration.order", () =>
      createShopOrder(user, c, req.body, connector.id),
    );
    res.status(201).json({
      id: order.id,
      status: order.status,
      total: order.total,
      currency: order.currency,
    });
  } catch (e) {
    sendError(res, e);
  }
});
shopIntegrationRouter.get("/orders/:id", (req, res) => {
  const { connector, user } = res.locals.shop;
  const order = rows("shopOrders").find(
    (o) =>
      o.id === req.params.id &&
      o.connectorId === connector.id &&
      o.organizationId === connector.organizationId &&
      o.lines.every((line: Row) =>
        isWithinScope(
          user,
          rows("inventoryItems").find(
            (item) => item.id === line.inventoryItemId,
          ) || {},
        ),
      ),
  );
  if (!order) return res.status(404).json({ error: "Order not found." });
  res.json({
    id: order.id,
    status: order.status,
    tracking: order.tracking || "",
    total: order.total,
    currency: order.currency,
  });
});
