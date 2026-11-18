/** Online shop as a service: one-step client setup, a plan/subscription register for the platform owner,
 * and closing a client's public shop when the subscription is suspended or has ended. */
import { randomBytes, randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { AuthenticatedUser } from "./auth.js";
import { tokenDigest } from "./employee-accounts.js";
import { administrationPolicy } from "./admin-policy.js";
import { validateAccountAssignment } from "./organization-policy.js";
import { isMainManager } from "./permissions.js";
import { getCollection, getStore, nextCollectionId, saveStore, transaction } from "./storage.js";
import { audit } from "./workspace.js";

type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
const nowIso = () => new Date().toISOString();
const today = () => nowIso().slice(0, 10);
function fail(message: string, statusCode = 400): never { throw Object.assign(new Error(message), { statusCode }); }
function send(res: Response, e: unknown) {
  const err = e as Error & { statusCode?: number };
  if (e instanceof z.ZodError) return res.status(400).json({ error: "Check the client details and try again." });
  return res.status(err.statusCode || 500).json({ error: (err.statusCode || 500) >= 500 ? "Shop clients are temporarily unavailable." : err.message });
}

export const SHOP_PLANS = ["starter", "business", "pro"] as const;
export const CURRENCIES = ["USD", "EUR", "GBP", "KRW", "QAR", "AED", "SAR", "KWD", "BHD", "OMR", "EGP", "SDG"] as const;
const slug = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9-]{2,47}$/, "Use 3–48 lowercase letters, numbers or dashes for the shop address.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fee = z.string().trim().regex(/^\d{1,12}(\.\d{1,3})?$/).default("0");

/** The subscription state that applies right now. Trial/active clients whose end date passed are expired. */
export function effectiveStatus(client: Row, on = today()) {
  if (["suspended", "cancelled"].includes(client.status)) return client.status as string;
  if (client.endsAt && client.endsAt < on) return "expired";
  return String(client.status || "active");
}
/** True when a company's hosted shop and website connection may serve customers. Companies without a shop subscription are unaffected. */
export function shopServiceOpen(companyId: string) {
  const client = rows("shopClients").find(c => c.companyId === companyId);
  return !client || ["trial", "active"].includes(effectiveStatus(client));
}

const starter = (name: string) => ({
  shippingPolicy: `${name} delivers inside the listed delivery areas. Delivery times and fees are confirmed when we contact you about your order.`,
  returnsPolicy: `Unused items in their original packaging can be returned within 7 days of delivery. Contact ${name} to arrange a return.`,
  privacyPolicy: `${name} uses your name, phone, email and address only to process and deliver your order and to answer your questions.`,
  terms: `Prices and availability are confirmed at checkout. Orders are reserved for you and paid on delivery or by confirmed transfer.`,
});

function inviteLink(req: Request, token: string) {
  let base: URL;
  try { base = new URL(process.env.STOCRANT_APP_URL || ""); } catch { base = new URL(`${req.protocol}://${req.get("host")}`); }
  base.pathname = "/login"; base.search = ""; base.hash = "invite=" + token;
  return base.toString();
}
/** Creates (or rotates) the owner's one-time invitation as a Shop Manager of the client's company. */
function issueInvite(actor: AuthenticatedUser, client: Row, owner: { name: string; email: string }) {
  const email = owner.email.toLowerCase();
  const existingAccount = rows("accessUsers").find(a => String(a.email).toLowerCase() === email);
  if (existingAccount) fail("An account with that email already exists. Use a different owner email.", 409);
  validateAccountAssignment(actor, { name: owner.name, email, roleId: "role-shop-manager", organizationIds: [client.companyId], tenantOrganizationIds: [], locationIds: [], ownRecordsOnly: false, status: "active" });
  for (const invite of rows("accessInvitations")) if (invite.email === email && invite.status === "pending") { invite.status = "revoked"; delete invite.tokenHash; invite.updatedAt = nowIso(); }
  const token = randomBytes(32).toString("base64url");
  const invite = { id: nextCollectionId("accessInvitations"), name: owner.name, email, companyId: client.companyId, roleId: "role-shop-manager", createdAt: nowIso(), updatedAt: nowIso(), createdBy: actor.id, status: "pending", deliveryStatus: "link-created", tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + administrationPolicy().invitationHours * 3600000).toISOString(), shopClientId: client.id };
  rows("accessInvitations").push(invite);
  Object.assign(client, { ownerName: owner.name, ownerEmail: email, invitationId: invite.id });
  return { token, expiresAt: invite.expiresAt };
}

function summary(client: Row): Row {
  const company = rows("companies").find(c => c.id === client.companyId);
  const store = rows("shopStorefronts").find(s => s.organizationId === client.companyId);
  const orders = rows("shopOrders").filter(o => o.organizationId === client.companyId);
  const invite = rows("accessInvitations").find(i => i.id === client.invitationId);
  const owner = rows("accessUsers").find(a => String(a.email).toLowerCase() === client.ownerEmail && a.status === "active");
  const lastOrder = orders.map(o => String(o.createdAt || "")).sort().pop() || null;
  return { ...client, companyName: company?.name || "", currency: company?.currency || client.currency, effectiveStatus: effectiveStatus(client),
    shop: store ? { name: store.name, slug: store.slug, published: Boolean(store.published), url: `/shop/${store.slug}` } : null,
    orders: orders.length, ordersThisMonth: orders.filter(o => String(o.createdAt || "").startsWith(today().slice(0, 7))).length, lastOrderAt: lastOrder,
    products: rows("shopProducts").filter(p => p.organizationId === client.companyId).length,
    owner: owner ? "active" : invite ? (invite.status === "pending" && Date.parse(invite.expiresAt) < Date.now() ? "expired" : invite.status) : "none" };
}

const createSchema = z.object({
  existingCompanyId: z.string().min(1).max(200).optional(),
  businessName: z.string().trim().min(2).max(120).optional(),
  currency: z.enum(CURRENCIES).optional(),
  country: z.string().trim().max(80).default(""),
  ownerName: z.string().trim().min(2).max(120),
  ownerEmail: z.string().trim().email().max(160),
  phone: z.string().trim().max(60).default(""),
  slug,
  plan: z.enum(SHOP_PLANS),
  status: z.enum(["trial", "active"]).default("trial"),
  startsAt: date.optional(),
  endsAt: date.optional(),
  monthlyFee: fee,
  notes: z.string().trim().max(2000).default(""),
}).strict().refine(v => v.existingCompanyId || (v.businessName && v.currency), "Enter the business name and currency.").refine(v => !v.startsAt || !v.endsAt || v.endsAt >= v.startsAt, "The end date must be after the start date.");

/** Creates the organization, company, draft storefront, subscription and owner invitation in one transaction. */
export function createShopClient(actor: AuthenticatedUser, body: unknown, now = new Date()) {
  if (!isMainManager(actor)) fail("Only the platform owner can set up shop clients.", 403);
  const v = createSchema.parse(body);
  return transaction(() => {
    let company: Row | undefined;
    if (v.existingCompanyId) {
      company = rows("companies").find(c => c.id === v.existingCompanyId && c.status !== "inactive");
      if (!company) fail("Choose an active company.", 404);
    }
    if (rows("shopClients").some(c => c.companyId === company?.id)) fail("This company already has an online shop service.", 409);
    const takenSlug = rows("shopStorefronts").find(s => s.slug === v.slug);
    if (takenSlug && takenSlug.organizationId !== company?.id) fail("This shop address is already in use.", 409);
    const stamp = now.toISOString();
    if (!company) {
      const organization = { id: nextCollectionId("organizations"), name: v.businessName!, status: "active", createdAt: stamp, createdBy: actor.id };
      rows("organizations").push(organization);
      company = { id: nextCollectionId("companies"), name: v.businessName!, parentOrganizationId: organization.id, organizationType: "shop", industry: "retail", currency: v.currency!, country: v.country, contactName: v.ownerName, contactEmail: v.ownerEmail.toLowerCase(), contactPhone: v.phone, status: "active", createdAt: stamp, updatedAt: stamp };
      rows("companies").push(company);
    }
    const client: Row = { id: randomUUID(), companyId: company.id, organizationId: company.parentOrganizationId, plan: v.plan, status: v.status, startsAt: v.startsAt || stamp.slice(0, 10), endsAt: v.endsAt || (v.status === "trial" ? new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10) : ""), monthlyFee: v.monthlyFee, currency: company.currency, notes: v.notes, version: 1, createdAt: stamp, createdBy: actor.id, newCompany: !v.existingCompanyId };
    rows("shopClients").push(client);
    if (!rows("shopStorefronts").some(s => s.organizationId === company!.id)) {
      const name = String(company.tradeName || company.name);
      const connector = { id: randomUUID(), organizationId: company.id, name: `${name} storefront`, ownerId: actor.id, active: true, kind: "hosted-storefront", createdAt: stamp };
      rows("shopConnectors").push(connector);
      rows("shopStorefronts").push({ id: randomUUID(), organizationId: company.id, version: 1, connectorId: connector.id, slug: v.slug, name, tagline: "", description: `Welcome to ${name}.`, logo: "", contactEmail: v.ownerEmail.toLowerCase(), phone: v.phone, address: "", deliveryFee: "0", deliveryEnabled: false, pickupEnabled: true, deliveryRegions: "", ...starter(name), published: false, manualPaymentsAccepted: false, reservationHours: 24, ownerId: actor.id, updatedAt: stamp });
    }
    const invite = issueInvite(actor, client, { name: v.ownerName, email: v.ownerEmail });
    audit(actor, "shop-client.created", { organizationId: company.id, targetId: client.id, section: "shops" });
    saveStore(getStore());
    return { client: summary(client), invite };
  });
}

const updateSchema = z.object({ version: z.number().int().min(1), plan: z.enum(SHOP_PLANS).optional(), status: z.enum(["trial", "active", "suspended", "cancelled"]).optional(), endsAt: z.union([date, z.literal("")]).optional(), monthlyFee: fee.optional(), notes: z.string().trim().max(2000).optional() }).strict();
export const shopClientsRouter = Router();
shopClientsRouter.use((req, res, next) => { if (!isMainManager(req.auth)) return res.status(403).json({ error: "Only the platform owner can manage shop clients." }); next(); });
shopClientsRouter.get("/", (_req, res) => {
  const clients = rows("shopClients").map(summary).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const candidates = rows("companies").filter(c => c.status !== "inactive" && !rows("shopClients").some(s => s.companyId === c.id)).map(c => ({ id: c.id, name: c.name, currency: c.currency, organizationType: c.organizationType }));
  res.json({ clients, candidates, plans: SHOP_PLANS, currencies: CURRENCIES });
});
shopClientsRouter.post("/", (req, res) => {
  try { const { client, invite } = createShopClient(req.auth!, req.body); res.status(201).json({ client, inviteLink: inviteLink(req, invite.token), inviteExpiresAt: invite.expiresAt }); } catch (e) { send(res, e); }
});
shopClientsRouter.patch("/:id", (req, res) => {
  try {
    const v = updateSchema.parse(req.body);
    const client = transaction(() => {
      const client = rows("shopClients").find(c => c.id === req.params.id);
      if (!client) fail("Shop client not found.", 404);
      if (client.version !== v.version) fail("This client changed. Reload before saving.", 409);
      const { version, ...changes } = v;
      Object.assign(client, changes, { version: version + 1, updatedAt: nowIso() });
      if (changes.status === "suspended") client.suspendedAt = nowIso();
      audit(req.auth, "shop-client.updated", { organizationId: client.companyId, targetId: client.id, section: "shops", status: client.status });
      saveStore(getStore());
      return client;
    });
    res.json({ client: summary(client) });
  } catch (e) { send(res, e); }
});
shopClientsRouter.post("/:id/invite", (req, res) => {
  try {
    const result = transaction(() => {
      const client = rows("shopClients").find(c => c.id === req.params.id);
      if (!client) fail("Shop client not found.", 404);
      if (rows("accessUsers").some(a => String(a.email).toLowerCase() === client.ownerEmail && a.status === "active")) fail("The owner has already activated their account.", 409);
      const body = z.object({ ownerName: z.string().trim().min(2).max(120).optional(), ownerEmail: z.string().trim().email().max(160).optional() }).strict().parse(req.body || {});
      const invite = issueInvite(req.auth!, client, { name: body.ownerName || client.ownerName, email: body.ownerEmail || client.ownerEmail });
      audit(req.auth, "shop-client.invite-issued", { organizationId: client.companyId, targetId: client.id, section: "shops" });
      saveStore(getStore());
      return { client: summary(client), invite };
    });
    res.json({ client: result.client, inviteLink: inviteLink(req, result.invite.token), inviteExpiresAt: result.invite.expiresAt });
  } catch (e) { send(res, e); }
});
