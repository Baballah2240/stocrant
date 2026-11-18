import { useLanguage } from "../language-context";
import "../storefront-branding.css";

export type ShopAlerts = { customerChannel: string; notifyOn: string[]; language: string; staffChannel: string; staffPhone: string; countryCode: string };
export type Messaging = { sms: boolean; whatsapp: boolean };
export const defaultAlerts: ShopAlerts = { customerChannel: "none", notifyOn: ["reserved", "dispatched", "delivered", "cancelled", "transfer-verified", "transfer-rejected"], language: "ar", staffChannel: "none", staffPhone: "", countryCode: "" };
const events: [string, string][] = [["reserved", "Order received"], ["preparing", "Being prepared"], ["dispatched", "On its way"], ["delivered", "Delivered"], ["cancelled", "Cancelled"], ["transfer-verified", "Transfer confirmed"], ["transfer-rejected", "Transfer not confirmed"]];

/** Order messages to customers (opt-in at checkout) and to staff, sent by SMS or WhatsApp through Twilio. */
export default function StorefrontAlerts({ value, onChange, messaging }: { value: ShopAlerts; onChange: (value: ShopAlerts) => void; messaging?: Messaging }) {
  const { t } = useLanguage(), a = { ...defaultAlerts, ...value }, set = (c: Partial<ShopAlerts>) => onChange({ ...a, ...c });
  const ready = (channel: string) => channel === "none" || Boolean(messaging?.[channel as "sms" | "whatsapp"]);
  const channelSelect = (key: "customerChannel" | "staffChannel") => <select value={a[key]} onChange={e => set({ [key]: e.target.value })}><option value="none">{t("Off")}</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select>;
  return <section className="shop-form storefront-alerts">
    <h3>{t("Order messages (SMS / WhatsApp)")}</h3>
    <p className={`storefront-alerts-provider${messaging?.sms || messaging?.whatsapp ? " is-ready" : ""}`}>{t(messaging?.sms || messaging?.whatsapp ? "Twilio is connected: {channels}." : "Twilio is not connected yet. Messages are recorded on each order but not sent until the server has Twilio keys.", { channels: [messaging?.whatsapp && "WhatsApp", messaging?.sms && "SMS"].filter(Boolean).join(", ") })}</p>
    <div className="shop-two-columns">
      <label className="form-field"><span>{t("Customer updates")}</span>{channelSelect("customerChannel")}</label>
      <label className="form-field"><span>{t("Message language")}</span><select value={a.language} onChange={e => set({ language: e.target.value })}><option value="ar">العربية</option><option value="en">English</option></select></label>
    </div>
    {a.customerChannel !== "none" && <label className="form-field"><span>{t("Country calling code for local numbers")}</span><input inputMode="numeric" dir="ltr" maxLength={4} placeholder={t("From the company country")} value={a.countryCode} onChange={e => set({ countryCode: e.target.value.replace(/[^0-9]/g, "") })} /><small className="hint">{t("Used when a customer types a number without +, e.g. 974 for Qatar or 254 for Kenya.")}</small></label>}
    {!ready(a.customerChannel) && <p className="hint">{t("This channel is not set up on the server yet.")}</p>}
    {a.customerChannel !== "none" && <fieldset className="storefront-alert-events"><legend>{t("Send a message when the order is…")}</legend>
      {events.map(([id, label]) => <label key={id}><input type="checkbox" checked={a.notifyOn.includes(id)} onChange={e => set({ notifyOn: e.target.checked ? [...a.notifyOn, id] : a.notifyOn.filter(x => x !== id) })} /> {t(label)}</label>)}
      <p className="hint">{t("Customers only receive messages when they tick \"Send me order updates\" at checkout.")}</p>
    </fieldset>}
    <div className="shop-two-columns">
      <label className="form-field"><span>{t("Staff alert for new orders and transfer receipts")}</span>{channelSelect("staffChannel")}</label>
      {a.staffChannel !== "none" && <label className="form-field"><span>{t("Staff phone")}</span><input type="tel" dir="ltr" required placeholder="+249912345678" value={a.staffPhone} onChange={e => set({ staffPhone: e.target.value })} /></label>}
    </div>
    <p className="hint">{t("Staff also always get an in-app notification and phone push for new orders.")}</p>
  </section>;
}

type Message = { id: string; audience: string; channel: string; to: string; event: string; status: string; error?: string; createdAt: string; sentAt?: string };
const statusLabel: Record<string, string> = { queued: "Sending", sent: "Sent", failed: "Failed", "not-configured": "Not sent — Twilio not connected" };
/** Message log shown on an order. */
export function ShopOrderMessages({ messages }: { messages?: Message[] }) {
  const { t } = useLanguage();
  if (!messages?.length) return null;
  const label = Object.fromEntries([...events, ["staffOrder", "New order (staff)"], ["staffProof", "Transfer receipt (staff)"]]);
  return <section className="shop-order-messages"><h3>{t("Messages")}</h3><ul>{messages.map(m => <li key={m.id} data-status={m.status}><span>{m.channel === "whatsapp" ? "WhatsApp" : "SMS"} · {t(label[m.event] || m.event)} · <span dir="ltr">{m.to}</span></span><strong>{t(statusLabel[m.status] || m.status)}</strong>{m.error && m.status === "failed" && <small>{m.error}</small>}</li>)}</ul></section>;
}
