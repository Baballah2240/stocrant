import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../language-context";
import { useSession } from "../session-context";
import type { CollectionItem } from "../types";
import ChoiceSelect from "./ChoiceSelect";
import MobileIcon from "./MobileIcon";
import "../organization-workspace.css";

type DetailTab = "Companies" | "Employees" | "Users" | "Activity";
type Editor = { collection: "organizations" | "companies"; item: CollectionItem | null; parentId: string };
type FormValues = Record<string, string>;
const PAGE_SIZE = 8;
const text = (value: unknown) => typeof value === "string" ? value : "";
const companyFor = (item: CollectionItem) => text(item.companyId || item.organizationId);
const membership = (item: CollectionItem) => Array.isArray(item.organizationIds) ? item.organizationIds.map(String) : [];

function allowed(permissions: string[], section: string, action: string, mainAdmin: boolean) {
  return mainAdmin || permissions.includes("*") || permissions.includes(`${section}.*`) || permissions.includes(`${section}.${action}`);
}

export default function OrganizationWorkspace() {
  const { user } = useSession();
  const { t, language } = useLanguage();
  const [params, setParams] = useSearchParams();
  const [organizations, setOrganizations] = useState<CollectionItem[]>([]);
  const [companies, setCompanies] = useState<CollectionItem[]>([]);
  const [employees, setEmployees] = useState<CollectionItem[]>([]);
  const [users, setUsers] = useState<CollectionItem[]>([]);
  const [audit, setAudit] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [detailQuery, setDetailQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [detailPage, setDetailPage] = useState(1);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState(false);
  const mainAdmin = user?.roleId === "role-main-manager";
  const permissions = user?.permissions ?? [];
  const canViewEmployees = allowed(permissions, "hr", "view", mainAdmin);
  const canManageEmployees = allowed(permissions, "hr", "create", mainAdmin);
  const canViewUsers = allowed(permissions, "access", "view", mainAdmin);
  const canCreateUsers = allowed(permissions, "access", "create", mainAdmin);
  const canViewAudit = allowed(permissions, "audit", "view", mainAdmin);
  // Structure changes are Main Admin-only in the API; do not offer dead actions to delegated managers.
  const canCreateCompany = Boolean(mainAdmin);
  const canEdit = Boolean(mainAdmin);
  const canDelete = Boolean(mainAdmin);
  const tab: DetailTab = ["Companies", "Employees", "Users", "Activity"].includes(params.get("tab") ?? "") ? params.get("tab") as DetailTab : "Companies";

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const [organizationData, companyData, employeeData, userData, auditData] = await Promise.all([
        api.collections.list("organizations"), api.collections.list("companies"),
        canViewEmployees ? api.collections.list("employees") : Promise.resolve({ items: [] }),
        canViewUsers ? api.workspace.users() : Promise.resolve({ items: [] }),
        canViewAudit ? api.workspace.audit() : Promise.resolve({ items: [] }),
      ]);
      setOrganizations(organizationData.items); setCompanies(companyData.items);
      setEmployees(employeeData.items); setUsers(userData.items); setAudit(auditData.items); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load organizations."); }
    finally { setLoading(false); setRefreshing(false); }
  }, [canViewEmployees, canViewUsers, canViewAudit]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [query, status, sort]);
  useEffect(() => { setDetailQuery(""); setCompanyFilter(""); setDetailPage(1); }, [params.get("org")]);
  useEffect(() => { setDetailPage(1); }, [detailQuery, companyFilter, tab]);

  const filtered = useMemo(() => organizations.filter(item => {
    const companyNames = companies.filter(company => company.parentOrganizationId === item.id).map(company => text(company.name)).join(" ");
    return (status === "all" || item.status === status) && `${text(item.name)} ${text(item.email)} ${text(item.phone)} ${companyNames}`.toLocaleLowerCase(language).includes(query.trim().toLocaleLowerCase(language));
  }).sort((a, b) => sort === "newest" ? text(b.createdAt).localeCompare(text(a.createdAt)) : (sort === "name-desc" ? -1 : 1) * text(a.name).localeCompare(text(b.name), language)), [organizations, companies, status, query, sort, language]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selected = params.get("org") ? organizations.find(item => item.id === params.get("org")) : filtered[0];
  const organizationCompanies = companies.filter(company => company.parentOrganizationId === selected?.id);
  const companyIds = new Set(organizationCompanies.map(company => company.id));
  const organizationEmployees = employees.filter(employee => companyIds.has(companyFor(employee)));
  const organizationUsers = users.filter(account => membership(account).some(id => companyIds.has(id)) || (Array.isArray(account.tenantOrganizationIds) && account.tenantOrganizationIds.includes(selected?.id)));
  const organizationActivity = audit.filter(entry => companyIds.has(text(entry.organizationId || entry.companyId)) || entry.parentOrganizationId === selected?.id || (entry.collection === "organizations" && entry.targetId === selected?.id)).sort((a, b) => text(b.occurredAt).localeCompare(text(a.occurredAt)));
  const detailItems = (tab === "Companies" ? organizationCompanies : tab === "Employees" ? organizationEmployees : tab === "Users" ? organizationUsers : organizationActivity).filter(item => {
    const matchesCompany = !companyFilter || (tab === "Users" ? membership(item).includes(companyFilter) : tab === "Companies" ? item.id === companyFilter : companyFor(item) === companyFilter);
    const searchable = [item.name, item.email, item.employeeCode, item.jobTitle, item.roleName, item.status, item.contactName, item.country, item.action, item.actorName, item.collection, item.occurredAt].map(text).join(" ");
    return matchesCompany && searchable.toLocaleLowerCase(language).includes(detailQuery.trim().toLocaleLowerCase(language));
  });
  const detailPageCount = Math.max(1, Math.ceil(detailItems.length / PAGE_SIZE));
  const currentDetailPage = Math.min(detailPage, detailPageCount);
  const visibleDetails = detailItems.slice((currentDetailPage - 1) * PAGE_SIZE, currentDetailPage * PAGE_SIZE);

  function selectOrganization(id: string) {
    setParams(previous => { const next = new URLSearchParams(previous); next.set("org", id); return next; });
  }
  function selectTab(nextTab: DetailTab) {
    setParams(previous => { const next = new URLSearchParams(previous); next.set("tab", nextTab); if (selected) next.set("org", selected.id); return next; });
  }
  async function remove(collection: "organizations" | "companies", item: CollectionItem) {
    if (!window.confirm(`${t("Delete")} ${text(item.name)}? ${t("This action is permanent. Records with linked companies or business data cannot be deleted.")}`)) return;
    setDeleting(true); setError(""); setNotice("");
    try {
      const result = await api.collections.remove(collection, item.id);
      setNotice(result.pending ? "Your change was submitted for approval." : "Record deleted.");
      if (collection === "organizations" && !result.pending) setParams(previous => { const next = new URLSearchParams(previous); next.delete("org"); return next; }, { replace: true });
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not delete this record."); }
    finally { setDeleting(false); }
  }
  const employeeLink = `/hr/employees/new${companyFilter || organizationCompanies.length === 1 ? `?company=${encodeURIComponent(companyFilter || organizationCompanies[0].id)}` : ""}`;
  const accessLink = `/admin?tab=Users${selected ? `&org=${encodeURIComponent(selected.id)}` : ""}${companyFilter ? `&company=${encodeURIComponent(companyFilter)}` : ""}`;

  return <div className="page organization-workspace">
    <header className="page-head org-page-heading"><div><p className="eyebrow">{t("Business structure")}</p><h1>{t("Organizations & companies")}</h1><p className="hint">{t("Organize companies, people and account access in one place.")}</p></div><div className="inline-actions"><button type="button" className="org-refresh" disabled={loading || refreshing} onClick={() => void load(true)}><MobileIcon name="refresh" />{t(refreshing ? "Refreshing…" : "Refresh")}</button>{mainAdmin && <button type="button" className="primary" onClick={() => setEditor({ collection: "organizations", item: null, parentId: "" })}>{t("Add organization")}</button>}</div></header>
    {error && <div className="alert alert--bad org-feedback" role="alert"><span>{t(error)}</span><button type="button" onClick={() => void load(true)}>{t("Try again")}</button></div>}
    {notice && <div className="alert alert--good org-feedback" role="status"><span>{t(notice)}</span><button type="button" onClick={() => setNotice("")}>{t("Dismiss")}</button></div>}
    <section className="org-summary" aria-label={t("Organization overview")}>
      {[{ label: "Organizations", value: organizations.length, icon: "companies" as const }, { label: "Companies", value: companies.length, icon: "locations" as const }, ...(canViewEmployees ? [{ label: "Employees", value: employees.length, icon: "people" as const }] : []), ...(canViewUsers ? [{ label: "Users", value: users.length, icon: "profile" as const }] : [])].map(metric => <div className="org-summary-card" key={metric.label}><span className="org-summary-icon"><MobileIcon name={metric.icon} /></span><div><strong>{metric.value.toLocaleString(language)}</strong><span>{t(metric.label)}</span></div></div>)}
    </section>
    <section className="org-workflow" aria-label={t("Setup workflow")}><span>{t("Set up your workspace")}</span>{["Create organization", "Add companies", "Add employees", "Assign user access"].map((step, index) => <span className="org-workflow-step" key={step}><b>{(index + 1).toLocaleString(language)}</b>{t(step)}</span>)}</section>
    <div className="org-workspace-grid">
      <section className="card org-directory" aria-labelledby="org-directory-title"><header className="org-section-head"><div><h2 id="org-directory-title">{t("Organization directory")}</h2><span className="hint">{t("Only organizations within your access are shown.")}</span></div><span className="badge">{filtered.length.toLocaleString(language)}</span></header>
        <label className="org-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input type="search" aria-label={t("Search organizations or companies")} placeholder={t("Search organizations or companies")} value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="org-directory-filters"><label><span>{t("Status")}</span><ChoiceSelect value={status} onChange={event => setStatus(event.target.value)}><option value="all">{t("All statuses")}</option><option value="active">{t("Active")}</option><option value="inactive">{t("Inactive")}</option></ChoiceSelect></label><label><span>{t("Sort by")}</span><ChoiceSelect value={sort} onChange={event => setSort(event.target.value)}><option value="name">{t("Name: A to Z")}</option><option value="name-desc">{t("Name: Z to A")}</option><option value="newest">{t("Newest first")}</option></ChoiceSelect></label></div>
        <div className="org-directory-list" aria-busy={loading}>{loading ? <p className="empty" role="status">{t("Loading organizations…")}</p> : pageItems.length ? pageItems.map(organization => <button type="button" className={`org-directory-row${selected?.id === organization.id ? " is-selected" : ""}`} key={organization.id} aria-pressed={selected?.id === organization.id} onClick={() => selectOrganization(organization.id)}><span className="org-monogram" aria-hidden="true">{text(organization.name).trim().slice(0, 1).toLocaleUpperCase(language)}</span><span className="org-directory-text"><strong>{text(organization.name)}</strong><small>{companies.filter(company => company.parentOrganizationId === organization.id).length.toLocaleString(language)} {t("companies")}</small></span><Status status={organization.status} /><span className="org-row-arrow" aria-hidden="true">›</span></button>) : <div className="org-empty"><MobileIcon name="companies" /><strong>{t(query || status !== "all" ? "No matching organizations" : "No organizations yet")}</strong><p>{t(query || status !== "all" ? "Try another search or clear your filters." : "Create an organization, then add its companies and people.")}</p>{(query || status !== "all") && <button type="button" onClick={() => { setQuery(""); setStatus("all"); }}>{t("Clear filters")}</button>}</div>}</div>
        <Pagination page={currentPage} pages={pageCount} count={filtered.length} onChange={setPage} />
      </section>
      <section className="card org-detail" aria-labelledby="org-detail-title">{selected ? <>
        <header className="org-detail-heading"><div className="org-detail-identity"><span className="org-detail-icon"><MobileIcon name="companies" /></span><div><p className="eyebrow">{t("Organization")}</p><h2 id="org-detail-title">{text(selected.name)}</h2><Status status={selected.status} /></div></div><div className="inline-actions">{canEdit && <button type="button" onClick={() => setEditor({ collection: "organizations", item: selected, parentId: "" })}>{t("Edit organization")}</button>}{mainAdmin && canDelete && <button type="button" className="danger" disabled={deleting} onClick={() => void remove("organizations", selected)}>{t("Delete")}</button>}</div></header>
        <dl className="org-contact-grid">{[{ label: "Email", value: selected.email }, { label: "Phone", value: selected.phone }, { label: "Address", value: selected.address }].map(field => <div key={field.label}><dt>{t(field.label)}</dt><dd dir={field.label === "Email" || field.label === "Phone" ? "ltr" : undefined}>{text(field.value) || t("Not provided")}</dd></div>)}</dl>
        <nav className="org-tabs" aria-label={t("Organization records")}>{(["Companies", "Employees", "Users", "Activity"] as DetailTab[]).filter(option => option !== "Employees" || canViewEmployees).filter(option => option !== "Users" || canViewUsers).filter(option => option !== "Activity" || canViewAudit).map(option => <button type="button" key={option} aria-pressed={tab === option} onClick={() => selectTab(option)}>{t(option)}<span>{(option === "Companies" ? organizationCompanies.length : option === "Employees" ? organizationEmployees.length : option === "Users" ? organizationUsers.length : organizationActivity.length).toLocaleString(language)}</span></button>)}</nav>
        {(tab === "Employees" && !canViewEmployees) || (tab === "Users" && !canViewUsers) || (tab === "Activity" && !canViewAudit) ? <div className="org-empty"><MobileIcon name="info" /><strong>{t("Access is restricted")}</strong><p>{t("Ask your administrator for access to this section.")}</p></div> : <>
          <div className="org-detail-toolbar"><label className="org-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input type="search" aria-label={t("Search records")} placeholder={t("Search records")} value={detailQuery} onChange={event => setDetailQuery(event.target.value)} /></label>{tab !== "Companies" && <ChoiceSelect aria-label={t("Filter by company")} value={companyFilter} onChange={event => setCompanyFilter(event.target.value)}><option value="">{t("All companies")}</option>{organizationCompanies.map(company => <option key={company.id} value={company.id}>{text(company.name)}</option>)}</ChoiceSelect>}{tab === "Companies" && canCreateCompany && <button type="button" className="primary" onClick={() => setEditor({ collection: "companies", item: null, parentId: selected.id })}>{t("Add company")}</button>}{tab === "Employees" && canManageEmployees && organizationCompanies.length > 0 && <NavLink className="primary-link" to={employeeLink}>{t("Add employee")}</NavLink>}{tab === "Users" && canCreateUsers && <NavLink className="primary-link" to={accessLink}>{t("Manage users")}</NavLink>}</div>
          {tab === "Activity" ? <ActivityList items={visibleDetails} companyNames={Object.fromEntries(organizationCompanies.map(company => [company.id, text(company.name)]))} /> : <div className="org-table-wrap"><table className="org-record-table"><thead><tr><th scope="col">{t(tab === "Companies" ? "Company" : "Name")}</th><th scope="col">{t(tab === "Companies" ? "Contact" : "Company")}</th><th scope="col">{t(tab === "Companies" ? "Currency" : tab === "Employees" ? "Job title" : "Email")}</th><th scope="col">{t("Status")}</th><th scope="col"><span className="org-sr-only">{t("Actions")}</span></th></tr></thead><tbody>{visibleDetails.map(item => <tr key={item.id}><td><NavLink to={tab === "Companies" ? `/organization/companies/${encodeURIComponent(item.id)}` : tab === "Employees" ? `/hr/employees/${encodeURIComponent(item.id)}` : `${accessLink}&user=${encodeURIComponent(item.id)}`}>{tab==="Companies"&&typeof item.logo==="string"&&item.logo.startsWith("https://")&&<img className="org-company-logo" src={item.logo} alt="" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.hidden=true;}}/>}{text(item.name) || t("Unnamed record")}</NavLink>{tab==="Companies"&&<small className="org-company-id">{t("Company ID")}: {item.id}{canViewEmployees?` · ${organizationEmployees.filter(employee=>companyFor(employee)===item.id).length} ${t("employees")}`:""}</small>}{tab === "Companies" && item.tradeName ? <small>{text(item.tradeName)}</small> : null}{tab === "Employees" && item.employeeCode ? <small>{text(item.employeeCode)}</small> : null}</td><td>{tab === "Companies" ? <>{text(item.contactName) || t("Not provided")}<small dir="ltr">{text(item.contactEmail)}</small><small dir="ltr">{text(item.contactPhone)}</small></> : (tab === "Users" ? membership(item) : [companyFor(item)]).map(id => text(companies.find(company => company.id === id)?.name)).filter(Boolean).join(", ") || t("Not assigned")}</td><td>{text(tab === "Companies" ? item.currency : tab === "Employees" ? item.jobTitle : item.email) || "—"}</td><td><Status status={item.status} /></td><td className="org-actions-cell">{tab === "Companies" && canEdit && <button type="button" onClick={() => setEditor({ collection: "companies", item, parentId: selected.id })} aria-label={`${t("Edit")} ${text(item.name)}`}>{t("Edit")}</button>}{tab === "Companies" && canDelete && <button type="button" className="danger" disabled={deleting} onClick={() => void remove("companies", item)} aria-label={`${t("Delete")} ${text(item.name)}`}>{t("Delete")}</button>}</td></tr>)}</tbody></table>{!visibleDetails.length && <div className="org-empty"><MobileIcon name={tab === "Companies" ? "locations" : "people"} /><strong>{t(detailQuery || companyFilter ? "No matching records" : tab === "Companies" ? "No companies yet" : tab === "Employees" ? "No employees yet" : "No users yet")}</strong><p>{t(detailQuery || companyFilter ? "Try another search or clear your filters." : tab === "Companies" ? "Add a company to this organization to start organizing its records." : tab === "Employees" ? "Add employees to a company before assigning their account access." : "Create user accounts and assign the appropriate role and company.")}</p>{(detailQuery || companyFilter) && <button type="button" onClick={() => { setDetailQuery(""); setCompanyFilter(""); }}>{t("Clear filters")}</button>}</div>}</div>}
          <Pagination page={currentDetailPage} pages={detailPageCount} count={detailItems.length} onChange={setDetailPage} />
        </>}
      </> : <div className="org-empty org-empty-detail"><MobileIcon name="companies" /><h2 id="org-detail-title">{t("Your organization workspace")}</h2><p>{t("Select an organization to view its companies, employees and users.")}</p>{mainAdmin && !organizations.length && <button type="button" className="primary" onClick={() => setEditor({ collection: "organizations", item: null, parentId: "" })}>{t("Add organization")}</button>}</div>}</section>
    </div>
    {editor && <OrganizationEditor editor={editor} organizationName={text(organizations.find(item => item.id === editor.parentId)?.name)} onClose={() => setEditor(null)} onSaved={async (result) => { setNotice(result.pending ? "Your change was submitted for approval." : "Changes saved."); setEditor(null); await load(true); if (editor.collection === "organizations" && result.item) selectOrganization(result.item.id); }} />}
  </div>;
}

function Status({ status }: { status: unknown }) {
  const { t } = useLanguage();
  const value = text(status) || "active";
  const labels: Record<string, string> = { active: "Active", inactive: "Inactive", pending: "Pending approval", suspended: "Suspended", rejected: "Rejected", leave: "On leave", terminated: "Terminated" };
  return <span className={`org-status org-status--${["active", "inactive", "pending", "suspended", "rejected", "leave", "terminated"].includes(value) ? value : "other"}`}><i aria-hidden="true" />{t(labels[value] ?? value)}</span>;
}

function ActivityList({ items, companyNames }: { items: CollectionItem[]; companyNames: Record<string, string> }) {
  const { t, language } = useLanguage();
  const actionLabels: Record<string, string> = { create: "Created", created: "Created", edit: "Updated", updated: "Updated", deleted: "Deleted", approved: "Approved", rejected: "Rejected", requested: "Approval requested", suspended: "Suspended", reactivated: "Reactivated" };
  const collections: Record<string, string> = { organizations: "Organization", companies: "Company", employees: "Employee", accessUsers: "User", accessRoles: "Role", customerAppointments: "Appointment", customerQuestions: "Customer question", customerReplies: "Reply" };
  if (!items.length) return <div className="org-empty"><MobileIcon name="attendance" /><strong>{t("No activity to display")}</strong><p>{t("Administrative changes within this organization appear here.")}</p></div>;
  return <ol className="org-activity-list">{items.map(entry => {
    const action = text(entry.action).split(".").pop() ?? "";
    const date = new Date(text(entry.occurredAt));
    const changedFields = Array.isArray(entry.changedFields) ? entry.changedFields.filter((field): field is string => typeof field === "string" && !/password|secret|token|hash/i.test(field)) : [];
    return <li key={entry.id}><span className="org-activity-dot" aria-hidden="true" /><div><strong>{t(actionLabels[action] ?? "Record updated")}{entry.collection ? ` · ${t(collections[text(entry.collection)] ?? text(entry.collection))}` : ""}</strong><span>{text(entry.actorName) || t("System")}{companyNames[companyFor(entry)] ? ` · ${companyNames[companyFor(entry)]}` : ""}</span>{changedFields.length > 0 && <small>{t("Updated fields")}: {changedFields.map(field => t(field)).join(", ")}</small>}</div><time dateTime={Number.isNaN(date.getTime()) ? undefined : date.toISOString()}>{Number.isNaN(date.getTime()) ? t("Date not recorded") : new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(date)}</time></li>;
  })}</ol>;
}

function Pagination({ page, pages, count, onChange }: { page: number; pages: number; count: number; onChange: (page: number) => void }) {
  const { t, language } = useLanguage();
  return <div className="org-pagination"><span>{count ? `${((page - 1) * PAGE_SIZE + 1).toLocaleString(language)}–${Math.min(page * PAGE_SIZE, count).toLocaleString(language)} / ${count.toLocaleString(language)}` : t("No records")}</span><div><button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>{t("Previous")}</button><span aria-live="polite">{page.toLocaleString(language)} / {pages.toLocaleString(language)}</span><button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>{t("Next")}</button></div></div>;
}

function OrganizationEditor({ editor, organizationName, onClose, onSaved }: { editor: Editor; organizationName: string; onClose: () => void; onSaved: (result: Awaited<ReturnType<typeof api.collections.create>>) => Promise<void> }) {
  const { t } = useLanguage();
  const { user } = useSession();
  const dialog = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isCompany = editor.collection === "companies";
  const defaults: FormValues = isCompany ? { name: "", tradeName: "", organizationType: "mixed", industry: "mixed", currency: "QAR", contactName: "", contactEmail: "", contactPhone: "", country: "", status: "active", notes: "" } : { name: "", email: "", phone: "", address: "", status: "active" };
  const [form, setForm] = useState<FormValues>(() => Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, editor.item ? text(editor.item[key]) || fallback : fallback])));
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]));
    if (isCompany) payload.parentOrganizationId = editor.parentId;
    try {
      if (editor.item?.status === "active" && form.status === "inactive" && !window.confirm(t("Deactivate this record? Linked data will be retained."))) return;
      const result = editor.item ? await api.collections.update(editor.collection, editor.item.id, payload) : await api.collections.create(editor.collection, payload);
      await onSaved(result);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save changes."); }
    finally { setSaving(false); }
  }
  const input = (key: string, label: string, type = "text", required = false, full = false) => <label className={`form-field${full ? " org-field-full" : ""}`} key={key}><span className="field-label">{t(label)}{required && <span className="required" aria-hidden="true"> *</span>}</span><input type={type} required={required} maxLength={key === "name" ? 160 : 300} value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} autoComplete={key === "email" || key === "contactEmail" ? "email" : key === "phone" || key === "contactPhone" ? "tel" : "off"} /></label>;
  const select = (key: string, label: string, options: string[]) => <label className="form-field" key={key}><span className="field-label">{t(label)}</span><ChoiceSelect required value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))}>{options.map(option => <option key={option} value={option}>{t(option === "active" ? "Active" : option === "inactive" ? "Inactive" : option.charAt(0).toUpperCase() + option.slice(1))}</option>)}</ChoiceSelect></label>;
  return <dialog className="org-editor" ref={dialog} aria-labelledby="org-editor-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}><form onSubmit={save}><header><div><p className="eyebrow">{isCompany ? organizationName : t("Business structure")}</p><h2 id="org-editor-title">{t(isCompany ? editor.item ? "Edit company" : "Add company" : editor.item ? "Edit organization" : "Add organization")}</h2><p className="hint">{t(isCompany ? "Company records and employees stay linked to their organization." : "An organization groups the companies and people you manage.")}</p></div><button type="button" onClick={onClose} disabled={saving}>{t("Close")}</button></header>{error && <div className="alert alert--bad" role="alert">{t(error)}</div>}<div className="org-editor-fields">{input("name", isCompany ? "Company name" : "Organization name", "text", true, true)}{isCompany ? <>{input("tradeName", "Trading name")}{select("organizationType", "Company type", ["shop", "store", "office", "restaurant", "mixed"])}{select("industry", "Industry", ["restaurant", "retail", "hospitality", "services", "mixed"])}{select("currency", "Primary currency", ["USD", "EUR", "GBP", "KRW", "QAR", "AED"])}{input("contactName", "Primary contact")}{input("contactEmail", "Contact email", "email")}{input("contactPhone", "Contact phone", "tel")}{input("country", "Country")}</> : <>{input("email", "Email", "email")}{input("phone", "Phone", "tel")}{input("address", "Address", "text", false, true)}</>}{(isCompany || user?.roleId === "role-main-manager") ? select("status", "Status", ["active", "inactive"]) : <label className="form-field"><span className="field-label">{t("Status")}</span><Status status={form.status} /></label>}{isCompany && <label className="form-field org-field-full"><span className="field-label">{t("Notes")}</span><textarea maxLength={4000} rows={3} value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} /></label>}</div><footer><span className="hint">{t("Changes are recorded in the audit log.")}</span><button type="button" disabled={saving} onClick={onClose}>{t("Cancel")}</button><button className="primary" disabled={saving}>{t(saving ? "Saving…" : "Save changes")}</button></footer></form></dialog>;
}
