import { useLanguage } from "../language-context";
import "../storefront-branding.css";

export type TransferAccount = { id: string; label: string; accountName: string; accountNumber: string; instructions: string };
export type ShopPayments = { cashEnabled: boolean; transferEnabled: boolean; accounts: TransferAccount[] };
export const defaultPayments: ShopPayments = { cashEnabled: true, transferEnabled: false, accounts: [] };
const suggestions = ["Bankak", "Fawry", "O-Cash", "MyCashi", "Bank transfer"];

/** Storefront payment options: cash on delivery/collection and bank or mobile-money transfer accounts shown to customers after ordering. */
export default function StorefrontPayments({ value, onChange }: { value: ShopPayments; onChange: (value: ShopPayments) => void }) {
  const { t } = useLanguage(), p = { ...defaultPayments, ...value };
  const setAccount = (i: number, changes: Partial<TransferAccount>) => onChange({ ...p, accounts: p.accounts.map((a, j) => j === i ? { ...a, ...changes } : a) });
  return <section className="shop-form storefront-payments">
    <h3>{t("Customer payment options")}</h3>
    <label><input type="checkbox" checked={p.cashEnabled} onChange={e => onChange({ ...p, cashEnabled: e.target.checked })} /> {t("Cash on delivery or collection")}</label>
    <label><input type="checkbox" checked={p.transferEnabled} onChange={e => onChange({ ...p, transferEnabled: e.target.checked, accounts: e.target.checked && !p.accounts.length ? [{ id: crypto.randomUUID(), label: "Bankak", accountName: "", accountNumber: "", instructions: "" }] : p.accounts })} /> {t("Bank or mobile money transfer (customer uploads the receipt)")}</label>
    {p.transferEnabled && <>
      <datalist id="transfer-providers">{suggestions.map(s => <option key={s} value={s} />)}</datalist>
      {p.accounts.map((a, i) => <div className="storefront-transfer-account" key={a.id}>
        <label className="form-field"><span>{t("Provider")}</span><input list="transfer-providers" required maxLength={60} value={a.label} onChange={e => setAccount(i, { label: e.target.value })} /></label>
        <label className="form-field"><span>{t("Account name")}</span><input required maxLength={120} value={a.accountName} onChange={e => setAccount(i, { accountName: e.target.value })} /></label>
        <label className="form-field"><span>{t("Account or phone number")}</span><input required dir="ltr" maxLength={60} value={a.accountNumber} onChange={e => setAccount(i, { accountNumber: e.target.value })} /></label>
        <label className="form-field"><span>{t("Instructions (optional)")}</span><input maxLength={400} value={a.instructions} onChange={e => setAccount(i, { instructions: e.target.value })} /></label>
        <button type="button" onClick={() => onChange({ ...p, accounts: p.accounts.filter((_, j) => j !== i) })}>{t("Remove")}</button>
      </div>)}
      {p.accounts.length < 6 && <button type="button" onClick={() => onChange({ ...p, accounts: [...p.accounts, { id: crypto.randomUUID(), label: "", accountName: "", accountNumber: "", instructions: "" }] })}>{t("Add account")}</button>}
      <p className="hint">{t("Customers see these accounts on their order page after ordering, then send a photo of the transfer receipt. You check it in the order and mark it received.")}</p>
    </>}
  </section>;
}
