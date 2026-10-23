import { z } from "zod";
import type { AuthenticatedUser } from "./auth.js";
import { getCollection } from "./storage.js";
import { isWithinScope } from "./permissions.js";
import { money, precision, scaled } from "./payroll-model.js";

const id = z.string().trim().min(1).max(80);
const name = z.string().trim().min(1).max(80);
const target = { category: z.string().trim().max(80).default(""), productIds: z.array(id).max(100).refine(v => new Set(v).size === v.length).default([]) };
const date = z.string().datetime().nullable().default(null);
const category = z.object({ id, name, title: name, description: z.string().trim().max(240).default(""), visible: z.boolean() }).strict();
const section = z.object({ id, title: name, description: z.string().trim().max(240).default(""), source: z.enum(["all", "category", "offers", "products"]), ...target, visible: z.boolean(), limit: z.number().int().min(1).max(24), layout: z.enum(["grid", "row"]) }).strict();
const offer = z.object({ id, title: name, description: z.string().trim().max(240).default(""), target: z.enum(["all", "category", "products"]), ...target, percent: z.number().int().min(1).max(90), enabled: z.boolean(), visible: z.boolean(), startsAt: date, endsAt: date }).strict().refine(o => !o.startsAt || !o.endsAt || Date.parse(o.endsAt) > Date.parse(o.startsAt), "Offer end must be after its start.");
const unique = <T extends {id: string}>(items: T[]) => new Set(items.map(v => v.id)).size === items.length;
export const merchandisingSchema = z.object({
  categories: z.array(category).max(50).refine(unique).refine(v => new Set(v.map(c => c.name)).size === v.length),
  sections: z.array(section).max(12).refine(unique),
  offers: z.array(offer).max(30).refine(unique),
  display: z.object({ showHero: z.boolean(), showStory: z.boolean(), showSearch: z.boolean(), showCategories: z.boolean(), showOffers: z.boolean(), collectionTitle: z.string().trim().max(100), searchPlaceholder: z.string().trim().max(100), defaultSort: z.enum(["featured", "name", "low", "high"]), layout: z.enum(["grid", "list"]) }).strict(),
}).strict();
export type Merchandising = z.infer<typeof merchandisingSchema>;
export const defaultMerchandising: Merchandising = { categories: [], sections: [], offers: [], display: { showHero: true, showStory: true, showSearch: true, showCategories: true, showOffers: true, collectionTitle: "", searchPlaceholder: "", defaultSort: "featured", layout: "grid" } };
type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
export function merchandisingFor(settings: Row): Merchandising { return merchandisingSchema.parse(settings.merchandising ?? defaultMerchandising); }
export function validateMerchandising(user: AuthenticatedUser, companyId: string, m: Merchandising) {
  const products = rows("shopProducts").filter(p => p.organizationId === companyId && isWithinScope(user, rows("inventoryItems").find(i => i.id === p.inventoryItemId) || {}));
  const categories = new Set([...products.map(p => p.category || "Collection"), ...m.categories.map(c => c.name)]);
  for (const entry of [...m.sections.map(s => ({ ...s, target: s.source })), ...m.offers]) {
    if (entry.productIds.some(id => !products.some(p => p.id === id))) throw Object.assign(new Error("Choose products from this company's accessible catalog."), { statusCode: 400 });
    if (entry.target === "products" && !entry.productIds.length) throw Object.assign(new Error("Select at least one product for this section or offer."), { statusCode: 400 });
    if (entry.target === "category" && (!entry.category || !categories.has(entry.category))) throw Object.assign(new Error("Choose an existing product category."), { statusCode: 400 });
  }
}
export function visibleProduct(m: Merchandising, product: Row) { return !m.categories.some(c => c.name === (product.category || "Collection") && !c.visible); }
export function activeOffer(offer: Merchandising["offers"][number], now = Date.now()) { return offer.enabled && (!offer.startsAt || Date.parse(offer.startsAt) <= now) && (!offer.endsAt || now < Date.parse(offer.endsAt)); }
export function offeredPrice(m: Merchandising, p: Row, currency: string, now = Date.now()) {
  const best = m.offers.filter(o => activeOffer(o, now) && (o.target === "all" || o.target === "category" && o.category === (p.category || "Collection") || o.target === "products" && o.productIds.includes(p.id))).sort((a,b) => b.percent - a.percent)[0];
  if (!best) return { price: p.price };
  const digits = precision(currency), original = scaled(p.price, digits);
  const value = (original * BigInt(100 - best.percent) + 50n) / 100n;
  if (value >= original) return { price: p.price };
  return { price: money(value, digits), originalPrice: p.price, offerId: best.id, offerTitle: best.title, offerPercent: best.percent };
}
export function publicMerchandising(m: Merchandising, products: Row[], now = Date.now()) {
  const productIds = new Set(products.map(p => p.id)), offerIds = new Set(products.map(p => p.offerId));
  return { ...m, categories: m.categories.filter(c => c.visible), sections: m.sections.filter(s => s.visible).map(s => ({ ...s, productIds: s.productIds.filter(id => productIds.has(id)) })), offers: m.offers.filter(o => activeOffer(o, now) && o.visible && offerIds.has(o.id)).map(o => ({ ...o, productIds: o.productIds.filter(id => productIds.has(id)) })) };
}
export function nextMerchandisingChange(m: Merchandising, now = Date.now()) {
  return Math.min(now + 60000, ...m.offers.filter(o => o.enabled).flatMap(o => [o.startsAt, o.endsAt]).filter((v): v is string => Boolean(v)).map(v => Date.parse(v)).filter(v => v > now));
}
