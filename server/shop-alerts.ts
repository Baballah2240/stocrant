/** Order messages by SMS or WhatsApp through Twilio's Messages API.
 * Customers opt in at checkout; staff can get a text for every new order and transfer receipt.
 * Messages are queued with the order change and sent in the background with retries; nothing is sent until
 * TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and a sender (TWILIO_SMS_FROM / TWILIO_WHATSAPP_FROM) are configured. */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCollection, getStore, saveStore, transaction } from "./storage.js";

type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
export const ALERT_STATUSES = ["reserved", "preparing", "dispatched", "delivered", "cancelled", "transfer-verified", "transfer-rejected"] as const;
type AlertStatus = (typeof ALERT_STATUSES)[number];
const channel = z.enum(["none", "sms", "whatsapp"]);
const phone = z.union([z.literal(""), z.string().trim().regex(/^\+[1-9][0-9 ]{7,18}$/, "Enter the staff phone in international format, like +249912345678.")]);
export const alertsSchema = z.object({
  customerChannel: channel.default("none"),
  notifyOn: z.array(z.enum(ALERT_STATUSES)).max(ALERT_STATUSES.length).default(["reserved", "dispatched", "delivered", "cancelled", "transfer-verified", "transfer-rejected"]),
  language: z.enum(["en", "ar"]).default("ar"),
  staffChannel: channel.default("none"),
  staffPhone: phone.default(""),
  /** Calling code used for customer numbers typed without one (e.g. 249, 974, 20). Empty = from the company country. */
  countryCode: z.union([z.literal(""), z.string().trim().regex(/^[1-9]\d{0,3}$/, "Enter the country calling code as digits, like 974.")]).default(""),
}).strict().refine(a => a.staffChannel === "none" || Boolean(a.staffPhone), "Enter the staff phone number for new-order messages.");
export type ShopAlerts = z.infer<typeof alertsSchema>;
export const defaultAlerts: ShopAlerts = alertsSchema.parse({});
export function alertsFor(s: Row): ShopAlerts { const p = alertsSchema.safeParse(s.alerts ?? {}); return p.success ? p.data : defaultAlerts; }

/** Which channels can actually send right now (shown in settings so the merchant knows). */
export function alertProvider() {
  const keys = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  return { sms: keys && Boolean(process.env.TWILIO_SMS_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID), whatsapp: keys && Boolean(process.env.TWILIO_WHATSAPP_FROM) };
}

const text: Record<"en" | "ar", Record<string, string>> = {
  en: {
    reserved: "{shop}: we received your order {ref} ({total}). We will contact you when it is being prepared.",
    preparing: "{shop}: your order {ref} is being prepared.",
    dispatched: "{shop}: your order {ref} is on its way.{tracking}",
    delivered: "{shop}: your order {ref} was delivered. Thank you!",
    cancelled: "{shop}: your order {ref} was cancelled. Contact us if you have questions.",
    "transfer-verified": "{shop}: we confirmed your transfer for order {ref}. Thank you!",
    "transfer-rejected": "{shop}: we could not confirm the transfer for order {ref}. {note} Please send a new receipt from your order page.",
    staffOrder: "New order {ref} at {shop}: {total}, {customer} {phone}.",
    staffProof: "Transfer receipt received for order {ref} at {shop}. Check it in Shops & orders.",
    tracking: " Reference: {tracking}.",
  },
  ar: {
    reserved: "{shop}: استلمنا طلبك {ref} ({total}). سنتواصل معك عند تجهيزه.",
    preparing: "{shop}: جارٍ تجهيز طلبك {ref}.",
    dispatched: "{shop}: طلبك {ref} في الطريق إليك.{tracking}",
    delivered: "{shop}: تم توصيل طلبك {ref}. شكراً لك!",
    cancelled: "{shop}: تم إلغاء طلبك {ref}. تواصل معنا لأي استفسار.",
    "transfer-verified": "{shop}: تأكدنا من تحويلك للطلب {ref}. شكراً لك!",
    "transfer-rejected": "{shop}: لم نتمكن من تأكيد التحويل للطلب {ref}. {note} يرجى إرسال إشعار جديد من صفحة طلبك.",
    staffOrder: "طلب جديد {ref} في {shop}: {total}، {customer} {phone}.",
    staffProof: "وصل إشعار تحويل للطلب {ref} في {shop}. راجعه في المتاجر والطلبات.",
    tracking: " المرجع: {tracking}.",
  },
};
const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "").replace(/\s+/g, " ").trim();
/** Calling codes for company countries (name or ISO code). Unknown countries require numbers with a + prefix. */
const CALLING: Record<string, string> = { sudan: "249", sd: "249", qatar: "974", qa: "974", egypt: "20", eg: "20", "saudi arabia": "966", sa: "966", "united arab emirates": "971", uae: "971", ae: "971", kuwait: "965", kw: "965", bahrain: "973", bh: "973", oman: "968", om: "968", jordan: "962", jo: "962", lebanon: "961", lb: "961", iraq: "964", iq: "964", morocco: "212", ma: "212", algeria: "213", dz: "213", tunisia: "216", tn: "216", libya: "218", ly: "218", "south sudan": "211", ss: "211", ethiopia: "251", et: "251", eritrea: "291", er: "291", kenya: "254", ke: "254", uganda: "256", ug: "256", tanzania: "255", tz: "255", rwanda: "250", rw: "250", nigeria: "234", ng: "234", ghana: "233", gh: "233", "south africa": "27", za: "27", chad: "235", td: "235", somalia: "252", so: "252", djibouti: "253", dj: "253", turkey: "90", tr: "90", "united kingdom": "44", uk: "44", gb: "44", "united states": "1", usa: "1", us: "1", canada: "1", ca: "1", germany: "49", de: "49", france: "33", fr: "33", india: "91", in: "91", pakistan: "92", pk: "92", "south korea": "82", korea: "82", kr: "82" };
export function callingCode(country: unknown) { return CALLING[String(country || "").trim().toLowerCase()] || ""; }
/** Normalises a phone to E.164. Numbers without + use the given country calling code (local leading 0 dropped); without a code they are rejected. */
export function e164(raw: string, defaultCountry = "") {
  const western = String(raw || "").replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  let digits = western.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  if (!digits.startsWith("+")) { if (!defaultCountry) return ""; digits = "+" + defaultCountry + digits.replace(/^0+/, ""); }
  return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : "";
}

function enqueue(message: Row) { rows("shopMessages").push({ id: randomUUID(), status: "queued", attempts: 0, createdAt: new Date().toISOString(), ...message }); scheduleDispatch(); }
function values(s: Row, order: Row, extra: Record<string, string> = {}) {
  return { shop: String(s.name || ""), ref: String(order.orderNumber || order.id.slice(0, 8)), total: `${order.total} ${order.currency}`, customer: String(order.customer || ""), phone: String(order.phone || ""), tracking: "", note: "", ...extra };
}
/** Queue a customer message for an order event. Call inside the transaction that changes the order. */
export function queueOrderUpdate(order: Row, event: AlertStatus, extra: { note?: string } = {}) {
  if (!order.storefrontId || !order.customerUpdates) return;
  const s = rows("shopStorefronts").find(x => x.id === order.storefrontId);
  if (!s) return;
  const a = alertsFor(s);
  if (a.customerChannel === "none" || !a.notifyOn.includes(event)) return;
  const company = rows("companies").find(c => c.id === order.organizationId);
  const to = e164(order.phone, a.countryCode || callingCode(company?.country));
  if (!to) return;
  const t = text[a.language];
  const v = values(s, order, { tracking: event === "dispatched" && order.tracking && !String(order.tracking).startsWith("SHOP-") ? fill(t.tracking, { tracking: order.tracking }) : "", note: extra.note || "" });
  enqueue({ organizationId: order.organizationId, orderId: order.id, audience: "customer", channel: a.customerChannel, to, event, body: fill(t[event], v).slice(0, 600) });
}
/** Queue the staff text for a new order or a new transfer receipt. */
export function queueStaffAlert(order: Row, kind: "staffOrder" | "staffProof") {
  const s = rows("shopStorefronts").find(x => x.id === order.storefrontId);
  if (!s) return;
  const a = alertsFor(s);
  if (a.staffChannel === "none" || !a.staffPhone) return;
  enqueue({ organizationId: order.organizationId, orderId: order.id, audience: "staff", channel: a.staffChannel, to: e164(a.staffPhone), event: kind, body: fill(text[a.language][kind], values(s, order)).slice(0, 600) });
}

async function twilio(m: Row): Promise<{ sid: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID!, token = process.env.TWILIO_AUTH_TOKEN!;
  const form = new URLSearchParams({ Body: m.body });
  if (m.channel === "whatsapp") { form.set("To", "whatsapp:" + m.to); form.set("From", String(process.env.TWILIO_WHATSAPP_FROM).replace(/^(?!whatsapp:)/, "whatsapp:")); }
  else { form.set("To", m.to); if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID); else form.set("From", process.env.TWILIO_SMS_FROM!); }
  const base = process.env.NODE_TEST_CONTEXT && process.env.STOCRANT_TWILIO_TEST_ENDPOINT ? process.env.STOCRANT_TWILIO_TEST_ENDPOINT : "https://api.twilio.com";
  const response = await fetch(`${base}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: form, signal: AbortSignal.timeout(10000), redirect: "error" });
  const data = await response.json().catch(() => ({})) as Row;
  if (!response.ok || typeof data.sid !== "string") throw Object.assign(new Error(String(data.message || `Twilio error ${response.status}`).slice(0, 200)), { permanent: response.status >= 400 && response.status < 500 && response.status !== 429 });
  return { sid: data.sid };
}
let running = false, timer: NodeJS.Timeout | undefined;
function scheduleDispatch(delay = 0) { if (timer) return; timer = setTimeout(() => { timer = undefined; void dispatchShopMessages(); }, delay); timer.unref?.(); }
/** Sends queued messages. Unconfigured channels are marked "not-configured" so the log explains why nothing went out. */
export async function dispatchShopMessages() {
  if (running) return; running = true;
  try {
    const provider = alertProvider();
    const due = rows("shopMessages").filter(m => m.status === "queued" && (!m.retryAt || Date.parse(m.retryAt) <= Date.now())).slice(0, 20);
    for (const m of due) {
      if (!provider[m.channel as "sms" | "whatsapp"]) { transaction(() => { m.status = "not-configured"; m.updatedAt = new Date().toISOString(); saveStore(getStore()); }); continue; }
      if (!m.to) { transaction(() => { m.status = "failed"; m.error = "Invalid phone number."; saveStore(getStore()); }); continue; }
      try { const r = await twilio(m); transaction(() => { Object.assign(m, { status: "sent", providerId: r.sid, attempts: m.attempts + 1, sentAt: new Date().toISOString() }); delete m.error; saveStore(getStore()); }); }
      catch (e) {
        const err = e as Error & { permanent?: boolean };
        transaction(() => { m.attempts += 1; m.error = err.message; m.status = err.permanent || m.attempts >= 3 ? "failed" : "queued"; m.retryAt = new Date(Date.now() + m.attempts * 60000).toISOString(); saveStore(getStore()); });
      }
    }
    if (rows("shopMessages").some(m => m.status === "queued")) scheduleDispatch(60000);
  } finally { running = false; }
}
/** Message log for one order, newest first (no message bodies to unrelated companies). */
export function orderMessages(orderId: string) {
  return rows("shopMessages").filter(m => m.orderId === orderId).map(({ id, audience, channel, to, event, status, error, createdAt, sentAt }) => ({ id, audience, channel, to, event, status, error, createdAt, sentAt })).reverse();
}
