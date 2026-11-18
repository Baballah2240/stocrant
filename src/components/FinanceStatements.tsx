import { Link } from "react-router-dom";
import { assetValuation } from "../finance-statements";
import { decimal } from "../money";
import { useLanguage } from "../language-context";
import type { CollectionItem } from "../types";
import { formatDate } from "../util";

function useMoney(currency: string) {
  const { language } = useLanguage();
  return (value: unknown) => new Intl.NumberFormat(language === "ar" ? "ar-QA" : "en-GB", { style: "currency", currency: currency || "SAR" }).format(Number(value || 0));
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };


export function FixedAssetRegister({ assets, currency, asOf, yearStart, canCreate }: { assets: CollectionItem[]; currency: string; asOf: string; yearStart?: string; canCreate: boolean }) {
  const { t } = useLanguage(), format = useMoney(currency), date = asOf || today(), start = yearStart && yearStart <= date ? yearStart : `${date.slice(0, 4)}-01-01`, year = start.slice(5) === "01-01" ? start.slice(0, 4) : `${start.slice(0, 4)}/${Number(start.slice(0, 4)) + 1}`;
  const rows = assets.filter(a => (a.currency || currency) === currency).map(asset => ({ asset, value: assetValuation(asset, currency, date, start) }));
  const total = (key: "cost" | "annual" | "accumulated" | "period" | "bookValue") => decimal(rows.filter(r => !r.value.disposed).reduce((n, r) => n + r.value[key], 0n), currency);
  return <section className="card finance-statement"><div className="finance-card-heading"><h2>{t("Fixed assets & depreciation")}</h2><div className="inline-actions">{canCreate && <Link className="primary-link" to="/stores/fixedAssets/new">{t("Register fixed asset")}</Link>}<Link to="/stores/fixedAssets">{t("Manage fixed assets")}</Link></div></div>
    <p className="hint">{t("Straight-line depreciation: (cost − salvage value) ÷ useful life, charged daily from the purchase date. Disposed assets are excluded from totals.")}</p>
    <div className="table-wrap"><table className="table"><thead><tr><th>{t("Asset")}</th><th>{t("Cost")}</th><th>{t("Annual depreciation")}</th><th>{t("Depreciation {year}", { year })}</th><th>{t("Accumulated depreciation")}</th><th>{t("Net book value")}</th></tr></thead><tbody>
      {rows.map(({ asset, value }) => <tr key={asset.id} className={value.disposed ? "finance-muted" : ""}><td><Link to={`/stores/fixedAssets/${encodeURIComponent(String(asset.id))}`}><strong>{String(asset.name)}</strong></Link><span className="cell-sub">{t(String(asset.category || ""))} · {asset.purchaseDate ? formatDate(String(asset.purchaseDate)) : "—"} · {t("{years} years", { years: String(asset.usefulLifeYears || "—") })}{value.fullyDepreciated && <> · {t("Fully depreciated")}</>}{value.disposed && <> · {t("disposed")}</>}</span></td><td>{format(decimal(value.cost, currency))}</td><td>{format(decimal(value.annual, currency))}</td><td>{format(decimal(value.period, currency))}</td><td>{format(decimal(value.accumulated, currency))}</td><td><strong>{format(decimal(value.bookValue, currency))}</strong></td></tr>)}
      {!rows.length && <tr><td colSpan={6}>{t("No fixed assets registered in this currency.")}</td></tr>}
      {rows.length > 0 && <tr className="finance-statement-total"><th scope="row">{t("Total")}</th><td>{format(total("cost"))}</td><td>{format(total("annual"))}</td><td>{format(total("period"))}</td><td>{format(total("accumulated"))}</td><td>{format(total("bookValue"))}</td></tr>}
    </tbody></table></div></section>;
}
