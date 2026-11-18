import { useLanguage } from "../language-context";
import "../storefront-branding.css";

export type Coupon = { id: string; code: string; kind: "percent" | "amount"; value: string; minSubtotal: string; startsAt: string; endsAt: string; maxUses: number; enabled: boolean; uses?: number };
const local = (iso: string) => { if (!iso) return ""; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ""; const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const iso = (value: string) => value ? new Date(value).toISOString() : "";

/** Discount codes customers type at checkout: percent or fixed amount, minimum order, dates and a use limit. */
export default function StorefrontCoupons({ value, currency, onChange }: { value: Coupon[]; currency?: string; onChange: (value: Coupon[]) => void }) {
  const { t } = useLanguage(), list = value || [];
  const set = (i: number, c: Partial<Coupon>) => onChange(list.map((x, j) => j === i ? { ...x, ...c } : x));
  return <section className="shop-form storefront-coupons">
    <h3>{t("Discount codes")}</h3>
    <p className="hint">{t("Customers type a code at checkout. The discount applies to the products, not delivery, and is calculated by the server. Offers and codes can combine.")}</p>
    {list.map((c, i) => <div className="storefront-coupon" key={c.id} data-enabled={c.enabled}>
      <label className="form-field"><span>{t("Code")}</span><input required dir="ltr" maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9\-]{2,23}" value={c.code} onChange={e => set(i, { code: e.target.value.toUpperCase().replace(/\s/g, "") })} /></label>
      <label className="form-field"><span>{t("Type")}</span><select value={c.kind} onChange={e => set(i, { kind: e.target.value as Coupon["kind"] })}><option value="percent">{t("Percentage")}</option><option value="amount">{t("Fixed amount")}</option></select></label>
      <label className="form-field"><span>{c.kind === "percent" ? t("Percent off (1–90)") : `${t("Amount off")} (${currency || ""})`}</span><input required inputMode="decimal" dir="ltr" value={c.value} onChange={e => set(i, { value: e.target.value })} /></label>
      <label className="form-field"><span>{t("Minimum order")}</span><input inputMode="decimal" dir="ltr" value={c.minSubtotal} onChange={e => set(i, { minSubtotal: e.target.value || "0" })} /></label>
      <label className="form-field"><span>{t("Starts")}</span><input type="datetime-local" value={local(c.startsAt)} onChange={e => set(i, { startsAt: iso(e.target.value) })} /></label>
      <label className="form-field"><span>{t("Ends")}</span><input type="datetime-local" value={local(c.endsAt)} onChange={e => set(i, { endsAt: iso(e.target.value) })} /></label>
      <label className="form-field"><span>{t("Use limit (0 = unlimited)")}</span><input type="number" min={0} value={c.maxUses} onChange={e => set(i, { maxUses: Math.max(0, Number(e.target.value) || 0) })} /></label>
      <div className="storefront-coupon-foot"><label><input type="checkbox" checked={c.enabled} onChange={e => set(i, { enabled: e.target.checked })} /> {t("Active")}</label><small className="hint">{t("Used {count} times", { count: c.uses ?? 0 })}</small><button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))}>{t("Remove")}</button></div>
    </div>)}
    {list.length < 50 && <button type="button" onClick={() => onChange([...list, { id: crypto.randomUUID(), code: "", kind: "percent", value: "10", minSubtotal: "0", startsAt: "", endsAt: "", maxUses: 0, enabled: true }])}>{t("Add discount code")}</button>}
  </section>;
}
