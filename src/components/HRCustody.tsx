import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { custodySummary } from "../finance-statements";
import { useLanguage } from "../language-context";
import { useSession } from "../session-context";
import type { CollectionItem } from "../types";
import { formatDate } from "../util";
import BackButton from "./BackButton";
import ChoiceSelect from "./ChoiceSelect";

/** HR financial custody (العهدة المالية): cash and items handed to employees, and what is still to be settled. */
export default function HRCustody() {
  const { t, language } = useLanguage(), { user } = useSession();
  const [items, setItems] = useState<CollectionItem[]>([]), [companies, setCompanies] = useState<CollectionItem[]>([]);
  const [companyId, setCompanyId] = useState(""), [status, setStatus] = useState("outstanding"), [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const canCreate = Boolean(user?.roleId === "role-main-manager" || user?.permissions.some(p => ["*", "hr.*", "hr.create"].includes(p)));
  useEffect(() => { let active = true;
    void Promise.all([api.collections.list("employeeCustody"), api.collections.list("companies").catch(() => ({ items: [] as CollectionItem[] }))])
      .then(([custody, list]) => { if (active) { setItems(custody.items); setCompanies(list.items); setError(""); } })
      .catch(err => { if (active) setError((err as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; }; }, []);
  const currencyOf = (organizationId: unknown) => String(companies.find(c => c.id === organizationId)?.currency || "SAR");
  const money = (value: number, organizationId: unknown) => new Intl.NumberFormat(language === "ar" ? "ar-QA" : "en-GB", { style: "currency", currency: currencyOf(organizationId) }).format(value);
  const companyName = (id: unknown) => String(companies.find(c => c.id === id)?.name || t("Unassigned"));
  const scoped = items.filter(row => !companyId || row.organizationId === companyId);
  const shown = scoped.filter(row => (status === "all" || (status === "outstanding" ? !["settled", "returned"].includes(String(row.status)) : row.status === status)) && `${row.employee || ""} ${row.description || ""} ${row.custodyType || ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const byEmployee = custodySummary(scoped);
  const byCompany = [...new Set(byEmployee.map(row => row.organizationId))].map(id => ({ id, employees: byEmployee.filter(row => row.organizationId === id).length, items: byEmployee.filter(row => row.organizationId === id).reduce((n, row) => n + row.items, 0), outstanding: byEmployee.filter(row => row.organizationId === id).reduce((n, row) => n + row.outstanding, 0) }));
  const overdue = scoped.filter(row => row.dueDate && !["settled", "returned"].includes(String(row.status)) && String(row.dueDate) < new Date().toISOString().slice(0, 10)).length;
  return <div className="page hr-custody">
    <div className="page-head"><div><BackButton /><h1>{t("Financial custody")}</h1><p className="hint">{t("Cash, devices, vehicles and tools handed to employees, and what each employee and company still has to settle or return.")}</p></div>
      <div className="inline-actions">{canCreate && <Link className="primary-link" to="/hr/employeeCustody/new">{t("New custody item")}</Link>}<Link to="/hr/employeeCustody">{t("All custody records")}</Link></div></div>
    {error && <p className="alert alert--bad" role="alert">{t(error)}</p>}
    <section className="card workspace-toolbar">
      <label>{t("Company")}<ChoiceSelect value={companyId} onChange={e => setCompanyId(e.target.value)}><option value="">{t("All companies")}</option>{companies.map(c => <option key={c.id} value={c.id}>{String(c.name)}</option>)}</ChoiceSelect></label>
      <label>{t("Status")}<ChoiceSelect value={status} onChange={e => setStatus(e.target.value)}><option value="outstanding">{t("Outstanding")}</option><option value="all">{t("All statuses")}</option>{["open", "partially settled", "settled", "returned", "lost"].map(s => <option key={s} value={s}>{t(s)}</option>)}</ChoiceSelect></label>
      <label>{t("Search")}<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Employee, item or type")} /></label>
    </section>
    {loading ? <p role="status">{t("Loading custody…")}</p> : <>
      <div className="finance-obligation-list">
        <article className="metric-card"><span>{t("Employees holding custody")}</span><strong>{byEmployee.length}</strong></article>
        <article className="metric-card"><span>{t("Open custody items")}</span><strong>{byEmployee.reduce((n, row) => n + row.items, 0)}</strong></article>
        <article className="metric-card"><span>{t("Overdue for settlement")}</span><strong className={overdue ? "finance-overdue" : ""}>{overdue}</strong></article>
      </div>
      <section className="card"><h2>{t("Custody by company")}</h2><div className="table-wrap"><table className="table"><thead><tr><th>{t("Company")}</th><th>{t("Employees")}</th><th>{t("Items")}</th><th>{t("Outstanding value")}</th></tr></thead><tbody>
        {byCompany.map(row => <tr key={row.id || "none"}><td>{companyName(row.id)}</td><td>{row.employees}</td><td>{row.items}</td><td><strong>{money(row.outstanding, row.id)}</strong></td></tr>)}
        {!byCompany.length && <tr><td colSpan={4}>{t("No outstanding custody.")}</td></tr>}</tbody></table></div></section>
      <section className="card"><h2>{t("Custody by employee")}</h2><div className="table-wrap"><table className="table"><thead><tr><th>{t("Employee")}</th><th>{t("Company")}</th><th>{t("Items")}</th><th>{t("Value")}</th><th>{t("Settled / returned")}</th><th>{t("Outstanding value")}</th></tr></thead><tbody>
        {byEmployee.map(row => <tr key={row.organizationId + row.employee}><td><strong>{row.employee}</strong></td><td>{companyName(row.organizationId)}</td><td>{row.items}</td><td>{money(row.value, row.organizationId)}</td><td>{money(row.settled, row.organizationId)}</td><td><strong>{money(row.outstanding, row.organizationId)}</strong></td></tr>)}
        {!byEmployee.length && <tr><td colSpan={6}>{t("No outstanding custody.")}</td></tr>}</tbody></table></div></section>
      <section className="card"><h2>{t("Custody items")}</h2><div className="table-wrap"><table className="table"><thead><tr><th>{t("Employee")}</th><th>{t("Custody type")}</th><th>{t("Description")}</th><th>{t("Value")}</th><th>{t("Issue date")}</th><th>{t("Settle by")}</th><th>{t("Status")}</th></tr></thead><tbody>
        {shown.map(row => <tr key={row.id}><td><Link to={`/hr/employeeCustody/${encodeURIComponent(String(row.id))}`}>{String(row.employee || "")}</Link><span className="cell-sub">{companyName(row.organizationId)}</span></td><td>{t(String(row.custodyType || ""))}</td><td dir="auto">{String(row.description || "")}</td><td>{money(Number(row.value || 0), row.organizationId)}{Number(row.settledAmount) > 0 && <span className="cell-sub">{t("Settled / returned")}: {money(Number(row.settledAmount), row.organizationId)}</span>}</td><td>{row.issueDate ? formatDate(String(row.issueDate)) : "—"}</td><td className={row.dueDate && !["settled", "returned"].includes(String(row.status)) && String(row.dueDate) < new Date().toISOString().slice(0, 10) ? "finance-overdue" : ""}>{row.dueDate ? formatDate(String(row.dueDate)) : "—"}</td><td><span className="finance-status" data-status={String(row.status)}>{t(String(row.status || ""))}</span></td></tr>)}
        {!shown.length && <tr><td colSpan={7}>{t("No custody items match these filters.")}</td></tr>}</tbody></table></div>
        <p className="hint">{t("Cash custody paid out of a company account should also be recorded in Finance as an employee advance, so it appears on the balance sheet.")}</p></section>
    </>}
  </div>;
}
