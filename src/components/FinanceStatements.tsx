import { Link } from "react-router-dom";
import { assetValuation, balanceSheet, incomeStatement } from "../finance-statements";
import { decimal } from "../money";
import { useLanguage } from "../language-context";
import type { CollectionItem } from "../types";
import { formatDate } from "../util";

function useMoney(currency: string) {
  const { language } = useLanguage();
  return (value: unknown) => new Intl.NumberFormat(language === "ar" ? "ar-QA" : "en-GB", { style: "currency", currency: currency || "SAR" }).format(Number(value || 0));
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function Line({ label, value, strong = false, indent = false, negative = false }: { label: string; value: string; strong?: boolean; indent?: boolean; negative?: boolean }) {
  return <tr className={strong ? "finance-statement-total" : ""}><th scope="row" className={indent ? "finance-statement-indent" : ""}>{label}</th><td className={negative || Number(value.replace(/[^0-9.-]/g, "")) < 0 ? "finance-negative" : ""}>{value}</td></tr>;
}

export function BalanceSheet({ accounts, sources, obligations, transactions, assets, currency, asOf }: { accounts: CollectionItem[]; sources: CollectionItem[]; obligations: CollectionItem[]; transactions: CollectionItem[]; assets: CollectionItem[]; currency: string; asOf: string }) {
  const { t } = useLanguage(), format = useMoney(currency), date = asOf || today();
  const sheet = balanceSheet({ accounts, sources, obligations, transactions, assets, currency, asOf: date });
  return <section className="card finance-statement"><div className="finance-card-heading"><h2>{t("Balance sheet")}</h2><span className="finance-basis-label">{t("As of")} {formatDate(date)}</span></div>
    <p className="hint">{t("Statement of financial position: what the company owns, what it owes, and the owners' equity. Assets always equal liabilities plus equity.")}</p>
    <div className="finance-statement-grid">
      <div className="table-wrap"><table className="table"><caption>{t("Assets")}</caption><tbody>
        <Line label={t("Cash & bank")} value={format(sheet.assets.cash)} indent />
        <Line label={t("Customer receivables")} value={format(sheet.assets.receivables)} indent />
        <Line label={t("Employee advances & custody")} value={format(sheet.assets.employeeAdvances)} indent />
        <Line label={t("Fixed assets at cost")} value={format(sheet.assets.fixedCost)} indent />
        <Line label={t("Less accumulated depreciation")} value={format(-Number(sheet.assets.depreciation))} indent />
        <Line label={t("Net fixed assets")} value={format(sheet.assets.fixedNet)} indent />
        <Line label={t("Total assets")} value={format(sheet.totalAssets)} strong />
      </tbody></table></div>
      <div className="table-wrap"><table className="table"><caption>{t("Liabilities & equity")}</caption><tbody>
        <Line label={t("Suppliers & bills payable")} value={format(sheet.liabilities.payables)} indent />
        <Line label={t("Salaries payable")} value={format(sheet.liabilities.payroll)} indent />
        <Line label={t("Loans payable")} value={format(sheet.liabilities.loans)} indent />
        <Line label={t("Total liabilities")} value={format(sheet.totalLiabilities)} strong />
        <Line label={t("Paid-in capital")} value={format(sheet.equity.capital)} indent />
        <Line label={t("Accumulated surplus / (deficit)")} value={format(sheet.equity.surplus)} indent />
        <Line label={t("Total equity")} value={format(sheet.totalEquity)} strong />
        <Line label={t("Total liabilities & equity")} value={format(sheet.totalLiabilitiesAndEquity)} strong />
      </tbody></table></div>
    </div>
    <p className="hint">{t("Record owner contributions and withdrawals as Capital movements, machinery purchases as Fixed asset purchase, and register each asset under Fixed assets. The accumulated surplus or deficit includes opening account balances not recorded as capital.")}</p>
  </section>;
}

export function IncomeStatement({ transactions, assets, currency, periodStart, periodEnd, periodLabel, vatRate = 0 }: { vatRate?: number; transactions: CollectionItem[]; assets: CollectionItem[]; currency: string; periodStart: string; periodEnd: string; periodLabel: string }) {
  const { t } = useLanguage(), format = useMoney(currency);
  const report = incomeStatement(transactions, assets, currency, periodStart, periodEnd || today());
  return <section className="card finance-statement"><div className="finance-card-heading"><h2>{t("Income statement")}</h2><span className="finance-basis-label">{t(periodLabel)}</span></div>
    <p className="hint">{t("Revenue less purchases, operating expenses, salaries and depreciation for the selected period gives the surplus or deficit.")}</p>
    <div className="table-wrap"><table className="table"><tbody>
      <Line label={t("Revenue")} value={format(report.revenue)} strong />
      <Line label={t("Purchases")} value={format(-Number(report.purchases))} indent />
      <Line label={t("Operating expenses & taxes")} value={format(-Number(report.expenses))} indent />
      <Line label={t("Salaries & wages")} value={format(-Number(report.payroll))} indent />
      <Line label={t("Operating result before depreciation")} value={format(report.operating)} strong />
      <Line label={t("Depreciation of machinery & equipment")} value={format(-Number(report.depreciation))} indent />
      <Line label={Number(report.surplus) < 0 ? t("Deficit for the period") : t("Surplus for the period")} value={format(report.surplus)} strong />
    {vatRate > 0 && <Line label={t("VAT included in revenue (estimate at {rate}%)", { rate: vatRate })} value={format(Number(report.revenue) * vatRate / (100 + vatRate))} indent />}
    </tbody></table></div>
    <p className="hint">{t("Cash basis for revenue and expenses; depreciation is the straight-line charge for the same period. Capital, loans, transfers, advances and fixed-asset purchases are not income or expenses.")}</p>
  </section>;
}

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
