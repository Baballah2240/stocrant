import { Router, type Request, type Response } from "express";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { publicUser, type AuthenticatedUser } from "./auth.js";
import { can, isWithinScope } from "./permissions.js";
import { getCollection, getStore, saveStore, transaction } from "./storage.js";
import { audit, requiresApproval } from "./workspace.js";
import {
  shopCompany,
  shopPermission,
  shopStock,
  createShopOrder,
} from "./commerce.js";
import { cashAmount } from "./finance-ledger.js";
import { money, precision, scaled } from "./payroll-model.js";
import { expireShopReservations } from "./commerce-stock.js";
import { createNotification } from "./notifications.js";
import { productPhotos } from "./shop-media.js";
import { merchandisingSchema, defaultMerchandising, merchandisingFor, validateMerchandising, visibleProduct, offeredPrice, publicMerchandising, nextMerchandisingChange } from "./storefront-merchandising.js";

type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
function fail(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}
function error(res: Response, e: unknown) {
  const err = e as Error & { statusCode?: number };
  const status = err.statusCode || (e instanceof z.ZodError ? 400 : 500);
  res.status(status).json({
    error:
      e instanceof z.ZodError
        ? "Check the shop details and try again."
        : status >= 500
          ? "The shop is temporarily unavailable. Please try again."
          : err.message,
  });
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const secret =
  process.env.STOCRANT_SESSION_SECRET || randomBytes(48).toString("hex");
const sign = (value: string) =>
  createHmac("sha256", secret).update(value).digest("hex");
function equal(a: string, b: string) {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
const slugSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]{2,47}$/);
const imageSchema = z.union([
  z.literal(""),
  z
    .string()
    .url()
    .max(2000)
    .refine((v) => v.startsWith("https://")),
]);
const settingsSchema = z
  .object({
    version: z.number().int().min(0),
    slug: slugSchema,
    name: z.string().trim().min(1).max(100),
    tagline: z.string().trim().max(160),
    description: z.string().trim().max(1500),
    logo: imageSchema.default(""),
    contactEmail: z.union([z.literal(""), z.string().email().max(180)]),
    phone: z.string().trim().max(60),
    address: z.string().trim().max(500),
    deliveryFee: z.string().max(24),
    deliveryEnabled: z.boolean(),
    pickupEnabled: z.boolean(),
    deliveryRegions: z.string().trim().max(1000),
    shippingPolicy: z.string().trim().max(4000),
    returnsPolicy: z.string().trim().max(4000),
    privacyPolicy: z.string().trim().max(4000),
    terms: z.string().trim().max(4000),
    published: z.boolean(),
    manualPaymentsAccepted: z.boolean(),
    reservationHours: z.number().int().min(1).max(168).default(24),
    merchandising: merchandisingSchema.optional(),
  })
  .strict();
const defaults = {
  version: 0,
  slug: "amal",
  name: "Amal",
  tagline: "Everyday things, thoughtfully chosen.",
  description: "A little more care in everything you choose.",
  logo: "",
  contactEmail: "",
  phone: "",
  address: "",
  deliveryFee: "0",
  deliveryEnabled: false,
  pickupEnabled: true,
  deliveryRegions: "",
  shippingPolicy: "",
  returnsPolicy: "",
  privacyPolicy: "",
  terms: "",
  published: false,
  manualPaymentsAccepted: false,
  reservationHours: 24,
  merchandising: defaultMerchandising,
};
function admin(req: Request, companyId: string) {
  const user = req.auth!;
  shopPermission(user, "edit");
  if (!can(user, "access", "edit") && !can(user, "shops", "configure"))
    fail("Shop settings require access administration permission.", 403);
  return shopCompany(user, companyId);
}
function safeSettings(s: Row) {
  const { connectorId, ownerId, ...safe } = s;
  return safe;
}
function context(s: Row) {
  const connector = rows("shopConnectors").find(
    (c) =>
      c.id === s.connectorId &&
      c.organizationId === s.organizationId &&
      c.active,
  );
  const account = rows("accessUsers").find(
    (a) =>
      a.id === connector?.ownerId &&
      a.status === "active" &&
      !a.mustChangePassword,
  );
  if (!connector || !account)
    fail("This shop is temporarily unavailable.", 503);
  const user = publicUser(account as Parameters<typeof publicUser>[0]);
  shopPermission(user, "view");
  const company = shopCompany(user, s.organizationId);
  if (
    !rows("organizations").some(
      (org) =>
        org.id === company.parentOrganizationId && org.status === "active",
    )
  )
    fail("This shop is temporarily unavailable.", 503);
  return { user, company, connector };
}
function storefront(req: Request, preview = false) {
  const s = rows("shopStorefronts").find((s) => s.slug === req.params.slug);
  if (
    !s ||
    (!s.published &&
      !(
        preview &&
        req.auth &&
        !req.auth.mustChangePassword &&
        isWithinScope(req.auth, { organizationId: s.organizationId }) &&
        can(req.auth, "inventory", "view") &&
        can(req.auth, "operations", "view")
      ))
  )
    fail("Shop not found.", 404);
  return s;
}
export function storefrontForHost(hostname: string) {
  const bindings = (process.env.STOCRANT_SHOP_HOSTS || "")
    .split(",")
    .map((v) => v.trim().split("="));
  return bindings.find(
    ([host, slug]) =>
      host?.toLowerCase() === hostname.toLowerCase() &&
      slugSchema.safeParse(slug).success,
  )?.[1];
}
const cookieName = () =>
  process.env.NODE_ENV === "production"
    ? "__Host-stocrant-shop"
    : "stocrant_shop_guest";
function guest(req: Request, res: Response, create = false) {
  const value =
    req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(cookieName() + "="))
      ?.slice(cookieName().length + 1) || "";
  const [id, signature] = value.split(".");
  if (
    id &&
    /^[a-f0-9]{64}$/.test(id) &&
    signature &&
    equal(sign(`guest:${id}`), signature)
  )
    return hash(id);
  if (!create) fail("Refresh the shop before checking out.", 401);
  const token = randomBytes(32).toString("hex");
  res.cookie(cookieName(), `${token}.${sign(`guest:${token}`)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86400000,
  });
  return hash(token);
}
const windows = new Map<string, { at: number; count: number }>();
function rate(req: Request, name: string, limit: number, duration = 60000) {
  const now = Date.now();
  for (const [key, r] of windows) if (now - r.at > 600000) windows.delete(key);
  const key = `${name}:${hash(req.ip || "unknown")}`;
  const r = windows.get(key);
  const next =
    !r || now - r.at >= duration
      ? { at: now, count: 1 }
      : { ...r, count: r.count + 1 };
  if (windows.size > 10000 && !windows.has(key))
    fail("Shop is busy. Please try again shortly.", 429);
  windows.set(key, next);
  if (next.count > limit)
    fail("Too many requests. Please try again shortly.", 429);
}
const lineSchema = z
  .object({
    productId: z.string().min(1).max(100),
    quantity: z.number().int().min(1).max(99),
  })
  .strict();
const cartSchema = z
  .object({
    lines: z.array(lineSchema).min(1).max(50),
    method: z.enum(["delivery", "pickup"]),
  })
  .strict();
function catalog(s: Row, user: AuthenticatedUser, currency: string) {
  const m = merchandisingFor(s);
  return rows("shopProducts")
    .filter(
      (p) =>
        p.organizationId === s.organizationId &&
        p.active &&
        visibleProduct(m, p) &&
        p.currency === currency &&
        isWithinScope(
          user,
          rows("inventoryItems").find((i) => i.id === p.inventoryItemId) || {},
        ),
    )
    .map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      image: p.image,
      images: productPhotos(p),
      ...offeredPrice(m, p, currency),
      currency: p.currency,
      available: shopStock(p).available,
      category: p.category || "Collection",
    }));
}
function quote(
  s: Row,
  user: AuthenticatedUser,
  currency: string,
  input: z.infer<typeof cartSchema>,
) {
  if (requiresApproval("finance", "create"))
    fail("Checkout is temporarily unavailable. Please contact the shop.", 503);
  if (!s.manualPaymentsAccepted)
    fail("Checkout is not enabled for this shop.", 409);
  if (
    (input.method === "delivery" && !s.deliveryEnabled) ||
    (input.method === "pickup" && !s.pickupEnabled)
  )
    fail("Choose an available fulfilment option.");
  if (new Set(input.lines.map((l) => l.productId)).size !== input.lines.length)
    fail("Combine duplicate product lines.");
  const products = catalog(s, user, currency),
    digits = precision(currency);
  const lines = input.lines.map((l) => {
    const p = products.find((p) => p.id === l.productId);
    if (!p || p.available < l.quantity)
      fail("Some items are no longer available. Review your bag.", 409);
    return {
      ...l,
      name: p.name,
      price: p.price,
      total: money(scaled(p.price, digits) * BigInt(l.quantity), digits),
      originalPrice: p.originalPrice,
      offerId: p.offerId,
      offerTitle: p.offerTitle,
    };
  });
  const subtotal = lines.reduce((n, l) => n + scaled(l.total, digits), 0n),
    delivery =
      input.method === "delivery" ? s.deliveryFee : cashAmount("0", currency);
  return {
    lines,
    subtotal: money(subtotal, digits),
    delivery,
    total: money(subtotal + scaled(delivery, digits), digits),
    currency,
    method: input.method,
    version: s.version,
  };
}
function quoteToken(
  q: Row,
  guestHash: string,
  shopId: string,
  expires: number,
) {
  const content = JSON.stringify({ q, guestHash, shopId, expires });
  return `${expires}.${sign(content)}`;
}
function receipt(order: Row) {
  return {
    id: order.id,
    status: order.status,
    currency: order.currency,
    subtotal: order.subtotal,
    delivery: order.delivery,
    total: order.total,
    lines: order.lines.map((l: Row) => ({
      name: l.name,
      quantity: l.quantity,
      price: l.price,
      total: l.total,
    })),
    method: order.fulfilmentMethod,
    tracking: order.tracking || "",
    createdAt: order.createdAt,
    reservationExpiresAt: order.reservationExpiresAt,
    events: order.events.map((e: Row) => ({ status: e.status, at: e.at })),
    payment: "not-collected-online",
  };
}

export const storefrontAdminRouter = Router();
storefrontAdminRouter.get("/:companyId", (req, res) => {
  try {
    const c = admin(req, String(req.params.companyId));
    const current = rows("shopStorefronts").find(
      (s) => s.organizationId === c.id,
    );
    res.json({
      settings: current ? safeSettings(current) : defaults,
      url: current ? `/shop/${current.slug}` : null,
    });
  } catch (e) {
    error(res, e);
  }
});
storefrontAdminRouter.put("/:companyId", (req, res) => {
  try {
    const c = admin(req, String(req.params.companyId)),
      b = settingsSchema.parse(req.body);
    if (b.published) shopPermission(req.auth!, "create");
    const result = transaction(() => {
      const current = rows("shopStorefronts").find(
        (s) => s.organizationId === c.id,
      );
      if ((current?.version || 0) !== b.version)
        fail("Shop settings changed. Reload before saving.", 409);
      const merchandising = b.merchandising ?? merchandisingFor(current || {});
      validateMerchandising(req.auth!, c.id, merchandising);
      if (
        current &&
        current.slug !== b.slug &&
        rows("storefrontCheckouts").some((r) => r.storefrontId === current.id)
      )
        fail("The shop address cannot change after receiving orders.", 409);
      if (
        rows("shopStorefronts").some(
          (s) => s.slug === b.slug && s.organizationId !== c.id,
        )
      )
        fail("This shop address is already in use.", 409);
      const deliveryFee = cashAmount(b.deliveryFee, c.currency);
      if (scaled(deliveryFee) < 0n) fail("Delivery fee cannot be negative.");
      if (
        b.published &&
        (!b.manualPaymentsAccepted ||
          (!b.pickupEnabled && !b.deliveryEnabled) ||
          (!b.contactEmail && !b.phone) ||
          !b.address ||
          !b.shippingPolicy ||
          !b.returnsPolicy ||
          !b.privacyPolicy ||
          !b.terms ||
          (b.deliveryEnabled && !b.deliveryRegions))
      )
        fail(
          "Complete contact details, fulfilment options and all policies, then accept manual payments before publishing.",
        );
      let connector = rows("shopConnectors").find(
        (r) => r.id === current?.connectorId && r.active,
      );
      if (!connector) {
        connector = {
          id: randomUUID(),
          organizationId: c.id,
          name: `${b.name} storefront`,
          ownerId: req.auth!.id,
          active: true,
          kind: "hosted-storefront",
          createdAt: new Date().toISOString(),
        };
        rows("shopConnectors").push(connector);
      }
      // Saving deliberately reauthorizes the storefront under the acting administrator.
      connector.ownerId = req.auth!.id;
      const item = {
        ...b,
        merchandising,
        deliveryFee,
        id: current?.id || randomUUID(),
        organizationId: c.id,
        connectorId: connector.id,
        ownerId: req.auth!.id,
        version: b.version + 1,
        updatedAt: new Date().toISOString(),
      };
      if (current) Object.assign(current, item);
      else rows("shopStorefronts").push(item);
      audit(
        req.auth!,
        b.published ? "storefront.published" : "storefront.draft",
        { organizationId: c.id, targetId: item.id, section: "operations" },
      );
      saveStore(getStore());
      return item;
    });
    res.json({ settings: safeSettings(result), url: `/shop/${result.slug}` });
  } catch (e) {
    error(res, e);
  }
});

export const storefrontRouter = Router();
storefrontRouter.use((req, res, next) => {
  try {
    if (!["GET", "HEAD"].includes(req.method)) {
      const origin = req.get("origin");
      let sameOrigin = !origin;
      try {
        sameOrigin = !origin || new URL(origin).host === req.get("host");
      } catch {
        sameOrigin = false;
      }
      if (req.get("sec-fetch-site") === "cross-site" || !sameOrigin)
        fail("Open checkout from the shop website.", 403);
    }
    rate(req, "shop-read", 180);
    expireShopReservations();
    next();
  } catch (e) {
    error(res, e);
  }
});
storefrontRouter.get("/resolve", (req, res) => {
  const slug = storefrontForHost(req.hostname);
  if (!slug) return res.status(404).json({ error: "Shop not found." });
  res.json({ slug });
});
storefrontRouter.get("/:slug/catalog", (req, res) => {
  try {
    const s = storefront(req, true),
      { user, company } = context(s);
    guest(req, res, true);
    const { connectorId, ownerId, organizationId, id, ...settings } = s;
    const products = catalog(s, user, company.currency), m = merchandisingFor(s);
    res.json({
      shop: { ...settings, merchandising: publicMerchandising(m, products), currency: company.currency, preview: !s.published },
      products,
      refreshAt: nextMerchandisingChange(m),
    });
  } catch (e) {
    error(res, e);
  }
});
storefrontRouter.post("/:slug/quote", (req, res) => {
  try {
    const s = storefront(req),
      { user, company } = context(s),
      guestHash = guest(req, res),
      b = cartSchema.parse(req.body);
    shopPermission(user, "create");
    const q = quote(s, user, company.currency, b),
      expires = Date.now() + 10 * 60000;
    res.json({
      ...q,
      quoteToken: quoteToken(q, guestHash, s.id, expires),
      expires,
    });
  } catch (e) {
    error(res, e);
  }
});
const checkoutSchema = z
  .object({
    requestId: z.string().uuid(),
    receiptSecret: z.string().regex(/^[a-f0-9]{64}$/),
    customer: z.string().trim().min(2).max(180),
    email: z.union([z.literal(""), z.string().trim().email().max(180)]),
    phone: z
      .string()
      .trim()
      .min(6)
      .max(40)
      .regex(/^[+\d\s().\-٠-٩۰-۹]+$/)
      .refine(
        (value) => value.replace(/[^\d٠-٩۰-۹]/g, "").length >= 6,
        "Enter a valid mobile number.",
      ),
    address: z.string().trim().max(1000),
    region: z.string().trim().max(120).default(""),
    notes: z.string().trim().max(1000),
    consent: z.literal(true),
    website: z.literal("").default(""),
    quoteToken: z.string().max(100),
    lines: z.array(lineSchema).min(1).max(50),
    method: z.enum(["pickup", "delivery"]),
  })
  .strict();
storefrontRouter.post("/:slug/checkout", (req, res) => {
  try {
    const s = storefront(req),
      { user, company, connector } = context(s),
      guestHash = guest(req, res),
      b = checkoutSchema.parse(req.body);
    shopPermission(user, "create");
    const fingerprint = hash(JSON.stringify({ ...b, quoteToken: undefined }));
    const prior = rows("storefrontCheckouts").find(
      (r) => r.storefrontId === s.id && r.requestId === b.requestId,
    );
    if (prior) {
      if (prior.guestHash !== guestHash || prior.fingerprint !== fingerprint)
        fail(
          "This checkout was already submitted. Use its order confirmation.",
          409,
        );
      const order = rows("shopOrders").find((o) => o.id === prior.orderId);
      return res.json({ order: receipt(order!), replay: true });
    }
    rate(req, "shop-checkout", 5, 600000);
    if (b.method === "delivery" && b.address.length < 8)
      fail("Enter your complete delivery address.");
    const regions = String(s.deliveryRegions)
      .split(",")
      .map((r: string) => r.trim())
      .filter(Boolean);
    if (b.method === "delivery" && !regions.includes(b.region))
      fail("Choose a supported delivery region.");
    const q = quote(s, user, company.currency, {
      lines: b.lines,
      method: b.method,
    });
    const expires = Number(b.quoteToken.split(".")[0]);
    if (
      !Number.isSafeInteger(expires) ||
      expires < Date.now() ||
      expires > Date.now() + 11 * 60000 ||
      !equal(quoteToken(q, guestHash, s.id, expires), b.quoteToken)
    )
      fail(
        "Prices or shop settings changed. Review the updated total before placing your order.",
        409,
      );
    const order = transaction(() => {
      const order = createShopOrder(
        user,
        company,
        {
          requestId: b.requestId,
          customer: b.customer,
          email: b.email,
          phone: b.phone,
          address:
            b.method === "delivery"
              ? `${b.region}: ${b.address}`
              : `Collection: ${s.address}`,
          notes: b.notes,
          lines: b.lines,
          delivery: q.delivery,
          discount: "0",
        },
        connector.id,
        new Map(q.lines.map(line => [line.productId, { price: line.price, originalPrice: line.originalPrice, offerId: line.offerId, offerTitle: line.offerTitle }])),
      );
      order.source = "storefront";
      order.storefrontId = s.id;
      order.fulfilmentMethod = b.method;
      order.reservationExpiresAt = new Date(
        Date.now() + s.reservationHours * 3600000,
      ).toISOString();
      order.paymentMethod =
        b.method === "pickup" ? "pay-on-collection" : "pay-on-delivery";
      rows("storefrontCheckouts").push({
        id: randomUUID(),
        storefrontId: s.id,
        organizationId: s.organizationId,
        requestId: b.requestId,
        guestHash,
        fingerprint,
        receiptHash: hash(b.receiptSecret),
        orderId: order.id,
        policyVersion: s.version,
        consentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
      audit(user, "storefront.checkout", {
        organizationId: s.organizationId,
        targetId: order.id,
        section: "operations",
      });
      createNotification({ userId: user.id, user: user.name, type: "message", severity: "info", message: `New order ${order.id.slice(0, 8)} for ${s.name}.`, messageKey: "New order {reference} for {shop}.", messageValues: { reference: order.id.slice(0, 8), shop: s.name }, target: `shop-order:${order.id}` });
      saveStore(getStore());
      return order;
    });
    res.status(201).json({ order: receipt(order) });
  } catch (e) {
    error(res, e);
  }
});
storefrontRouter.post("/:slug/receipt", (req, res) => {
  try {
    const s = storefront(req);
    context(s);
    rate(req, "shop-receipt", 30);
    const b = z
      .object({
        orderId: z.string().uuid().optional(),
        requestId: z.string().uuid().optional(),
        receiptSecret: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .parse(req.body);
    const r = rows("storefrontCheckouts").find(
      (r) =>
        r.storefrontId === s.id &&
        (b.orderId ? r.orderId === b.orderId : r.requestId === b.requestId) &&
        equal(r.receiptHash, hash(b.receiptSecret)),
    );
    const order = rows("shopOrders").find(
      (o) => o.id === r?.orderId && o.organizationId === s.organizationId,
    );
    if (!order)
      fail(
        "Order confirmation not found. Use your private tracking link.",
        404,
      );
    res.json({ order: receipt(order) });
  } catch (e) {
    error(res, e);
  }
});
