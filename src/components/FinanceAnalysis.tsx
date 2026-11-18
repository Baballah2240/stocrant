import { useState } from "react";
import { useLanguage } from "../language-context";
import { agedBalances, agingBuckets, journalActivity, partnerLedger, spendByCategory } from "../finance-analysis";
import { formatDate } from "../util";
import type { CollectionItem } from "../types";
import MobileIcon from "./MobileIcon";

function useMoney(currency: string) {
  const { language } = useLanguage();
  return (value: unknown) => new Intl.NumberFormat(language === "ar" ? "ar-QA" : "en-GB", { style: "currency", currency: currency || "SAR" }).format(Number(value || 0));
}
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function AgedBalances({ sources, currency, companyId }: { sources: CollectionItem[]; currency: string; companyId: string }) {
  const { t } = useLanguage(), format = useMoney(currency);
  const [kind, setKind] = useState<"receivable" | "payable">("receivable");
  const bucketLabel = (bucket: string) => t(bucket === "current" ? "Not due yet" : "{range} days overdue", { range: bucket });
  const report = agedBalances(sources.filter(s => !companyId || s.organizationId === companyId), currency, kind, todayIso());
  return <section className="card finance-aged">
    <div className="finance-card-heading"><h2>{t(kind === "receivable" ? "Aged receivables" : "Aged payables")}</h2>
      <div className="finance-segmented" role="group" aria-label={t("Report type")}>{(["receivable", "payable"] as const).map(value => <button type="button" key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{t(value === "receivable" ? "Receivables" : "Payables")}</button>)}</div></div>
    <p className="hint">{t("Unpaid balances by partner, aged by due date. Documents without payment terms or a due date are due on their document date.")}</p>
    <div className="finance-aging-summary">{agingBuckets.map(bucket => <article key={bucket} data-bucket={bucket}><span>{bucketLabel(bucket)}</span><strong>{format(report.totals[bucket])}</strong></article>)}<article data-bucket="total"><span>{t("Total due")}</span><strong>{format(report.total)}</strong><small>{t("Overdue")}: {format(report.overdue)}</small></article></div>
    <div className="table-wrap"><table className="table"><thead><tr><th>{t("Partner")}</th>{agingBuckets.map(b => <th key={b}>{bucketLabel(b)}</th>)}<th>{t("Total")}</th></tr></thead>
      <tbody>{report.rows.map(row => <tr key={row.party}><td><strong>{t(row.party)}</strong><span className="cell-sub">{t("{count} documents", { count: row.documents })}{row.overdueDocuments > 0 && <> · {t("{count} overdue", { count: row.overdueDocuments })}</>}{row.oldestDue && <> · {t("Earliest due")} {formatDate(row.oldestDue)}</>}</span></td>{agingBuckets.map(b => <td key={b} className={b === "90+" && Number(row.buckets[b]) > 0 ? "finance-overdue" : ""}>{Number(row.buckets[b]) ? format(row.buckets[b]) : "—"}</td>)}<td><strong>{format(row.total)}</strong></td></tr>)}
        {!report.rows.length && <tr><td colSpan={agingBuckets.length + 2}>{t("Nothing outstanding in this currency.")}</td></tr>}</tbody></table></div>
  </section>;
}

export function PartnerLedger({ transactions, currency, nameOf }: { transactions: CollectionItem[]; currency: string; nameOf: (row: CollectionItem) => string }) {
  const { t } = useLanguage(), format = useMoney(currency);
  const rows = partnerLedger(transactions, currency, row => nameOf(row as CollectionItem));
  return <section className="card"><h2>{t("Partner ledger")}</h2><p className="hint">{t("Paid money in and out per customer, supplier, employee or other partner for the selected filters. Internal transfers are excluded.")}</p>
    <div className="table-wrap"><table className="table"><thead><tr><th>{t("Partner")}</th><th>{t("Money in")}</th><th>{t("Money out")}</th><th>{t("Net")}</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.party}><td><strong>{t(row.party)}</strong><span className="cell-sub">{t("{count} movements", { count: row.count })}{row.last && <> · {formatDate(row.last)}</>}</span></td><td>{format(row.incoming)}</td><td>{format(row.outgoing)}</td><td><strong className={Number(row.net) < 0 ? "finance-negative" : ""}>{format(row.net)}</strong></td></tr>)}
        {!rows.length && <tr><td colSpan={4}>{t("No paid movements in this period.")}</td></tr>}</tbody></table></div></section>;
}

export function SpendByCategory({ transactions, currency }: { transactions: CollectionItem[]; currency: string }) {
  const { t } = useLanguage(), format = useMoney(currency);
  const report = spendByCategory(transactions, currency);
  return <section className="card finance-category"><h2>{t("Spending by category")}</h2><p className="hint">{t("Paid outgoing money grouped by category. Movements without a category use their type.")}</p>
    {report.rows.map(row => <div key={row.category} className="finance-category-row"><div><strong>{t(row.category)}</strong><span>{format(row.amount)} · {row.share}%</span></div><span className="finance-category-bar"><span style={{ width: `${row.share}%` }} /></span></div>)}
    {!report.rows.length ? <p>{t("No paid movements in this period.")}</p> : <p className="finance-category-total">{t("Total")}: <strong>{format(report.total)}</strong></p>}</section>;
}

export function JournalCards({ accounts, transactions, currency, companyName, canCreate, onView, onCreate }: { accounts: CollectionItem[]; transactions: CollectionItem[]; currency: string; companyName: (id: unknown) => string; canCreate: boolean; onView: (accountId: string) => void; onCreate: (accountId: string) => void }) {
  const { t } = useLanguage(), format = useMoney(currency);
  return <div className="finance-journals">{accounts.map(account => { const activity = journalActivity(account.id, transactions, currency); return <article key={account.id} className="card finance-journal" data-type={String(account.type)}>
    <header><span className="finance-metric-icon"><MobileIcon name={account.type === "cash" ? "finance" : account.type === "wallet" ? "shop" : "shield"} /></span><div><h3>{String(account.name)}</h3><span className="cell-sub">{t(String(account.type))} · {companyName(account.organizationId)}</span></div></header>
    <strong className="finance-journal-balance">{account.balance === null ? t("Unverified") : format(account.balance)}</strong>
    <dl><div><dt>{t("Money in")}</dt><dd>{format(activity.incoming)}</dd></div><div><dt>{t("Money out")}</dt><dd>{format(activity.outgoing)}</dd></div><div><dt>{t("Movements")}</dt><dd>{activity.count}</dd></div></dl>
    <p className="cell-sub">{activity.last ? <>{t("Last movement")} {formatDate(activity.last)}</> : t("No paid movements in this period.")}{activity.pending > 0 && <> · <span className="finance-status" data-status="pending">{t("{count} awaiting payment", { count: activity.pending })}</span></>}</p>
    <div className="inline-actions"><button type="button" onClick={() => onView(String(account.id))}>{t("View movements")}</button>{canCreate && <button type="button" className="primary" onClick={() => onCreate(String(account.id))}>{t("New transaction")}</button>}</div>
  </article>; })}</div>;
}
