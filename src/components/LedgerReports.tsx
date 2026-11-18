import { useEffect, useState } from "react";
import { request } from "../api";
import { useLanguage } from "../language-context";
import { formatDate } from "../util";

type Line = { code: string; name: string; amount: string; type?: string };
type Ledger = {
  chart: { code: string; name: string; type: string }[]; from: string; to: string;
  trialBalance: { balanced: boolean; debit: string; credit: string; rows: { code: string; name: string; type: string; opening: string; debit: string; credit: string; closing: string }[] };
  income: { revenue: string; expenses: string; surplus: string; lines: Line[] };
  balance: { assets: Line[]; liabilities: Line[]; equity: Line[]; totalAssets: string; totalLiabilities: string; totalEquity: string; balanced: boolean };
  entryCount: number; entries: { id: string; date: string; memo: string; source: string; lines: { account: string; debit: string; credit: string }[] }[];
  issues: { id: string; reason: string }[];
};
const sourceLabels: Record<string, string> = { financeAccounts: "Opening balance", financeTransactions: "Money movement", sales: "Sale", purchases: "Purchase", expenses: "Expense", returns: "Return", payrollEntries: "Payroll", fixedAssets: "Fixed asset" };
type Filter = { currency: string; companyId: string; from: string; to: string };

function useLedger(filter: Filter, account = "") {
  const [data, setData] = useState<Ledger | null>(null), [error, setError] = useState("");
  useEffect(() => { let active = true; setError("");
    const query = new URLSearchParams({ currency: filter.currency, ...(filter.companyId ? { company: filter.companyId } : {}), ...(filter.from ? { from: filter.from } : {}), ...(filter.to ? { to: filter.to } : {}), ...(account ? { account } : {}) });
    const load = () => void request<Ledger>(`/workspace/finance/ledger?${query}`).then(value => { if (active) setData(value); }).catch(err => { if (active) setError((err as Error).message); });
    load(); window.addEventListener("stocrant:finance-changed", load);
    return () => { active = false; window.removeEventListener("stocrant:finance-changed", load); };
  }, [filter.currency, filter.companyId, filter.from, filter.to, account]);
  return { data, error };
}
function useMoney(currency: string) { const { language } = useLanguage(); return (value: unknown) => new Intl.NumberFormat(language === "ar" ? "ar-QA" : "en-GB", { style: "currency", currency: currency || "SAR" }).format(Number(value || 0)); }
function State({ error, loading }: { error: string; loading: boolean }) { const { t } = useLanguage(); return error ? <p className="alert alert--bad" role="alert">{t(error)}</p> : loading ? <p role="status">{t("Loading ledger…")}</p> : null; }
function Issues({ data }: { data: Ledger }) { const { t } = useLanguage(); return data.issues.length ? <details className="finance-ledger-issues"><summary>{t("{count} records could not be posted exactly", { count: data.issues.length })}</summary><ul>{data.issues.map(i => <li key={i.id}><code>{i.id}</code> · {t(i.reason)}</li>)}</ul></details> : null; }
const Balanced = ({ ok }: { ok: boolean }) => { const { t } = useLanguage(); return <span className="finance-basis-label" data-balanced={ok}>{t(ok ? "Balanced" : "Not balanced")}</span>; };
function Row({ label, value, strong = false, indent = false }: { label: string; value: string; strong?: boolean; indent?: boolean }) { return <tr className={strong ? "finance-statement-total" : ""}><th scope="row" className={indent ? "finance-statement-indent" : ""}>{label}</th><td className={Number(value.replace(/[^0-9.-]/g, "")) < 0 ? "finance-negative" : ""}>{value}</td></tr>; }

export function LedgerBalanceSheet({ filter }: { filter: Filter }) {
  const { t } = useLanguage(), format = useMoney(filter.currency), { data, error } = useLedger({ ...filter, from: "" });
  if (!data) return <State error={error} loading />;
  const b = data.balance;
  return <section className="card finance-statement"><div className="finance-card-heading"><h2>{t("Balance sheet")}</h2><span className="finance-basis-label">{t("As of")} {formatDate(data.to)}</span><Balanced ok={b.balanced} /></div>
    <p className="hint">{t("Accrual basis from the general ledger: invoices and bills count when issued, salaries when approved, depreciation monthly. Assets equal liabilities plus equity.")}</p>
    <div className="finance-statement-grid">
      <div className="table-wrap"><table className="table"><caption>{t("Assets")}</caption><tbody>{b.assets.map(l => <Row key={l.code} label={`${l.code} · ${t(l.name)}`} value={format(l.amount)} indent />)}<Row label={t("Total assets")} value={format(b.totalAssets)} strong /></tbody></table></div>
      <div className="table-wrap"><table className="table"><caption>{t("Liabilities & equity")}</caption><tbody>{b.liabilities.map(l => <Row key={l.code} label={`${l.code} · ${t(l.name)}`} value={format(l.amount)} indent />)}<Row label={t("Total liabilities")} value={format(b.totalLiabilities)} strong />{b.equity.map(l => <Row key={l.code} label={`${l.code} · ${t(l.name)}`} value={format(l.amount)} indent />)}<Row label={t("Total equity")} value={format(b.totalEquity)} strong /><Row label={t("Total liabilities & equity")} value={format(Number(b.totalLiabilities) + Number(b.totalEquity))} strong /></tbody></table></div>
    </div><Issues data={data} />
  </section>;
}

export function LedgerIncomeStatement({ filter, periodLabel, vatRate = 0 }: { filter: Filter; periodLabel: string; vatRate?: number }) {
  const { t } = useLanguage(), format = useMoney(filter.currency), { data, error } = useLedger(filter);
  if (!data) return <State error={error} loading />;
  const i = data.income, revenue = i.lines.filter(l => l.type === "revenue"), expenses = i.lines.filter(l => l.type === "expense");
  return <section className="card finance-statement"><div className="finance-card-heading"><h2>{t("Income statement")}</h2><span className="finance-basis-label">{t(periodLabel)}</span></div>
    <p className="hint">{t("Accrual basis from the general ledger for the selected period. Cash-basis results remain under Profit & loss.")}</p>
    <div className="table-wrap"><table className="table"><tbody>
      {revenue.map(l => <Row key={l.code} label={`${l.code} · ${t(l.name)}`} value={format(l.amount)} indent />)}<Row label={t("Revenue")} value={format(i.revenue)} strong />
      {expenses.map(l => <Row key={l.code} label={`${l.code} · ${t(l.name)}`} value={format(-Number(l.amount))} indent />)}<Row label={t("Total expenses")} value={format(-Number(i.expenses))} strong />
      <Row label={Number(i.surplus) < 0 ? t("Deficit for the period") : t("Surplus for the period")} value={format(i.surplus)} strong />
      {vatRate > 0 && <Row label={t("VAT included in revenue (estimate at {rate}%)", { rate: vatRate })} value={format(Number(i.revenue) * vatRate / (100 + vatRate))} indent />}
    </tbody></table></div><Issues data={data} />
  </section>;
}

export function TrialBalance({ filter, periodLabel, onAccount }: { filter: Filter; periodLabel: string; onAccount: (code: string) => void }) {
  const { t } = useLanguage(), format = useMoney(filter.currency), { data, error } = useLedger(filter);
  if (!data) return <State error={error} loading />;
  const tb = data.trialBalance;
  return <section className="card finance-statement"><div className="finance-card-heading"><h2>{t("Trial balance")}</h2><span className="finance-basis-label">{t(periodLabel)}</span><Balanced ok={tb.balanced} /></div>
    <p className="hint">{t("Every account with its opening balance, period debits and credits, and closing balance. Total debits always equal total credits.")}</p>
    <div className="table-wrap"><table className="table finance-trial"><thead><tr><th>{t("Account")}</th><th>{t("Opening")}</th><th>{t("Debit")}</th><th>{t("Credit")}</th><th>{t("Closing")}</th></tr></thead><tbody>
      {tb.rows.map(r => <tr key={r.code}><th scope="row"><button type="button" className="finance-link-button" onClick={() => onAccount(r.code)}>{r.code} · {t(r.name)}</button><span className="cell-sub">{t(r.type)}</span></th><td>{format(r.opening)}</td><td>{format(r.debit)}</td><td>{format(r.credit)}</td><td><strong>{format(r.closing)}</strong></td></tr>)}
      <tr className="finance-statement-total"><th scope="row">{t("Total")}</th><td /><td>{format(tb.debit)}</td><td>{format(tb.credit)}</td><td /></tr>
    </tbody></table></div><p className="hint">{t("Closing balances are shown as debit (positive) or credit (negative).")}</p><Issues data={data} />
  </section>;
}

export function GeneralLedger({ filter, periodLabel, account, onAccount }: { filter: Filter; periodLabel: string; account: string; onAccount: (code: string) => void }) {
  const { t } = useLanguage(), format = useMoney(filter.currency), { data, error } = useLedger(filter, account);
  if (!data) return <State error={error} loading />;
  const name = (code: string) => `${code} · ${t(data.chart.find(a => a.code === code)?.name || code)}`;
  return <section className="card finance-statement"><div className="finance-card-heading"><h2>{t("General ledger")}</h2><span className="finance-basis-label">{t(periodLabel)}</span></div>
    <div className="workspace-toolbar"><label>{t("Account")}<select value={account} onChange={e => onAccount(e.target.value)}><option value="">{t("All accounts")}</option>{data.chart.map(a => <option key={a.code} value={a.code}>{name(a.code)}</option>)}</select></label><span>{t("{count} journal entries", { count: data.entryCount })}{data.entryCount > data.entries.length && <> · {t("showing the latest {count}", { count: data.entries.length })}</>}</span></div>
    <div className="table-wrap"><table className="table finance-journal-table"><thead><tr><th>{t("Date")}</th><th>{t("Entry")}</th><th>{t("Account")}</th><th>{t("Debit")}</th><th>{t("Credit")}</th></tr></thead><tbody>
      {data.entries.flatMap(e => e.lines.map((l, index) => <tr key={e.id + index} className={index === 0 ? "finance-journal-first" : ""}>{index === 0 && <><td rowSpan={e.lines.length}>{formatDate(e.date)}</td><td rowSpan={e.lines.length} dir="auto">{e.memo}<span className="cell-sub">{t(sourceLabels[e.source] || e.source)}</span></td></>}<td className={l.account === account ? "finance-journal-match" : ""}>{name(l.account)}</td><td>{Number(l.debit) ? format(l.debit) : ""}</td><td>{Number(l.credit) ? format(l.credit) : ""}</td></tr>))}
      {!data.entries.length && <tr><td colSpan={5}>{t("No journal entries in this period.")}</td></tr>}
    </tbody></table></div><Issues data={data} />
  </section>;
}
