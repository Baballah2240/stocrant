/** Privacy-friendly shop figures: daily counters per storefront, de-duplicated by the existing anonymous
 * shop session hash (no extra cookies, no IP or personal data stored), plus order-based sales figures. */
import { createHash } from "node:crypto";
import { money, precision, scaled } from "./payroll-model.js";
import { getCollection, getStore, saveStore } from "./storage.js";

type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
export const SHOP_EVENTS = ["visit", "product", "bag", "checkout"] as const;
export type ShopEvent = (typeof SHOP_EVENTS)[number];
const MAX_IDS = 20000;
const day = (d = new Date()) => d.toISOString().slice(0, 10);
const short = (v: string) => createHash("sha256").update(v).digest("base64url").slice(0, 12);
let dirty = false, flush: NodeJS.Timeout | undefined;

/** Count one event for a visitor; repeated events from the same visitor on the same day count once. */
export function recordShopEvent(storefrontId: string, guestHash: string, type: ShopEvent, productId?: string, now = new Date()) {
  const date = day(now);
  let row = rows("shopDailyStats").find(r => r.storefrontId === storefrontId && r.date === date);
  if (!row) { row = { id: `${storefrontId}:${date}`, storefrontId, date, visitors: [], product: [], bag: [], checkout: [], productViews: {} }; rows("shopDailyStats").push(row); }
  const key = type === "visit" ? "visitors" : type, who = short(guestHash + date);
  const list: string[] = row[key];
  if (!list.includes(who) && list.length < MAX_IDS) { list.push(who); dirty = true; }
  if (type === "product" && productId && /^[\w-]{1,80}$/.test(productId)) {
    const views = row.productViews as Record<string, string[]>, seen = views[productId] ||= [];
    if (!seen.includes(who) && seen.length < MAX_IDS && Object.keys(views).length <= 2000) { seen.push(who); dirty = true; }
  }
  // Batch disk writes; counters are best-effort and must never slow the shop down.
  if (dirty && !flush) { flush = setTimeout(() => { flush = undefined; if (dirty) { dirty = false; saveStore(getStore()); } }, 5000); flush.unref?.(); }
}

/** Figures for the last `days` days (including today) for one storefront. */
export function shopStats(storefront: Row, currency: string, days = 30, now = new Date()) {
  const end = new Date(day(now) + "T00:00:00Z"), start = new Date(end.getTime() - (days - 1) * 86400000), from = day(start);
  const stats = rows("shopDailyStats").filter(r => r.storefrontId === storefront.id && r.date >= from);
  const orders = rows("shopOrders").filter(o => o.storefrontId === storefront.id && String(o.createdAt || "").slice(0, 10) >= from);
  const live = orders.filter(o => !["cancelled", "expired"].includes(String(o.status)));
  const digits = precision(currency);
  const series = Array.from({ length: days }, (_, i) => {
    const date = day(new Date(start.getTime() + i * 86400000)), r = stats.find(s => s.date === date);
    const dayOrders = live.filter(o => String(o.createdAt).slice(0, 10) === date);
    return { date, visitors: r?.visitors.length || 0, orders: dayOrders.length, sales: money(dayOrders.reduce((n, o) => n + scaled(String(o.total), digits), 0n), digits) };
  });
  const sum = (k: string) => stats.reduce((n, r) => n + (r[k]?.length || 0), 0);
  // A visitor who reached checkout but has no order from the same shop session that day = abandoned bag.
  const checkoutGuests = rows("storefrontCheckouts").filter(c => c.storefrontId === storefront.id);
  const ordered = new Set(checkoutGuests.map(c => short(c.guestHash + String(c.createdAt).slice(0, 10))));
  const abandoned = stats.reduce((n, r) => n + (r.checkout as string[]).filter(id => !ordered.has(id)).length, 0);
  const sellers = new Map<string, { name: string; quantity: number; revenue: bigint }>();
  for (const o of live) for (const l of o.lines || []) { const s = sellers.get(l.productId) || { name: String(l.name), quantity: 0, revenue: 0n }; s.quantity += Number(l.quantity) || 0; s.revenue += scaled(String(l.total || 0), digits); sellers.set(l.productId, s); }
  const names = new Map(rows("shopProducts").filter(p => p.organizationId === storefront.organizationId).map(p => [p.id, [p.name, p.size, p.color].filter(Boolean).join(" · ")]));
  const views = new Map<string, number>();
  for (const r of stats) for (const [id, list] of Object.entries(r.productViews || {})) views.set(id, (views.get(id) || 0) + (list as string[]).length);
  const visitors = sum("visitors"), revenue = live.reduce((n, o) => n + scaled(String(o.total), digits), 0n);
  return {
    days, from, to: day(end), currency,
    totals: { visitors, productViews: sum("product"), bagAdds: sum("bag"), checkouts: sum("checkout"), orders: live.length, cancelled: orders.length - live.length, revenue: money(revenue, digits), averageOrder: money(live.length ? revenue / BigInt(live.length) : 0n, digits), conversion: visitors ? Math.round(live.length / visitors * 1000) / 10 : 0, abandoned },
    series,
    bestSellers: [...sellers.entries()].map(([id, s]) => ({ productId: id, name: names.get(id) || s.name, quantity: s.quantity, revenue: money(s.revenue, digits) })).sort((a, b) => b.quantity - a.quantity || Number(b.revenue) - Number(a.revenue)).slice(0, 10),
    mostViewed: [...views.entries()].map(([id, count]) => ({ productId: id, name: names.get(id) || "", views: count, sold: sellers.get(id)?.quantity || 0 })).filter(v => v.name).sort((a, b) => b.views - a.views).slice(0, 10),
  };
}
