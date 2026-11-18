import RecordActions from "./RecordActions";
import "../records-layout.css";
import { useLanguage } from "../language-context";
import ChoiceSelect from "./ChoiceSelect";
import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMeta } from "../meta-context";
import { api } from "../api";
import { useSession } from "../session-context";
import { formatFieldValue } from "../util";
import type { CollectionItem, EntitySpec } from "../types";

function can(permissions: string[] | undefined, section: string, action: string) { return Boolean(permissions?.includes("*") || permissions?.includes(`${section}.*`) || permissions?.includes(`${section}.${action}`)); }
function sectionFor(module: string | undefined) { return module === "organization" ? "organizations" : module === "stores" ? "operations" : module === "warehouse" ? "inventory" : module === "admin" ? "access" : "hr"; }
function SearchIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.1 4.1" /></svg>; }

export default function EntityList() {
  const { t, language } = useLanguage();
  const { module, collection } = useParams<{ module: string; collection: string }>();
  const { entities, loading: metaLoading, error: metaError } = useMeta();
  const { user } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const companyFilter = new URLSearchParams(location.search).get("company") || "";
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { let active = true; void api.auth.companies().then(result => { if (active) setCompanies(result.companies as { id: string; name: string }[]); }).catch(() => {}); return () => { active = false; }; }, []);
  const managersOnly = new URLSearchParams(location.search).get("managers")==="true";
  const [departmentManagerIds,setDepartmentManagerIds] = useState<string[]>([]);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest"), [page, setPage] = useState(1), [deletingId, setDeleting] = useState<string | null>(null), [notice, setNotice] = useState("");
  const [statusFilter, setStatusFilter] = useState(new URLSearchParams(location.search).get("status")||"all");
  useEffect(() => { setQuery(""); setStatusFilter(new URLSearchParams(location.search).get("status") || "all"); setNotice(""); }, [collection, companyFilter]);
  useEffect(() => { setPage(1); }, [query, statusFilter, sort, collection, companyFilter]);
  const spec = useMemo(() => module && collection ? (entities ?? []).find((entity) => entity.module === module && entity.collection === collection) : undefined, [module, collection, entities]);
  const section = sectionFor(module);
  const canCreate = can(user?.permissions, section, "create");
  const canEdit = can(user?.permissions, section, "edit");
  const canDelete = can(user?.permissions, section, "delete");
  const canExport = can(user?.permissions, section, "export");
  const feedback = typeof location.state === "object" && location.state && "success" in location.state && typeof location.state.success === "string" ? location.state.success : null;

  useEffect(() => {
    if (!collection || !spec) return;
    let active = true; setLoading(true); setError(null);
    Promise.all([api.collections.list(collection),managersOnly?api.collections.list("departments"):Promise.resolve({items:[]})]).then(([result,departments]) => { if (active) {setItems((result.items ?? []).filter(item=>!companyFilter||(item.organizationId??item.companyId)===companyFilter));setDepartmentManagerIds(departments.items.map(row=>String(row.managerId||"")).filter(Boolean));} }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Failed to load records."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [collection, spec, companyFilter, managersOnly]);

  const columns = useMemo(() => { if (!spec) return []; const fields = new Map<string, EntitySpec["fields"][number]>(); for (const field of spec.fields) fields.set(field.key, field); return spec.columns.map((key) => fields.get(key)).filter((field): field is EntitySpec["fields"][number] => Boolean(field)); }, [spec]);
  const statusOptions = useMemo(() => [...new Set(items.map((item) => typeof item.status === "string" ? item.status : "").filter(Boolean))].sort(), [items]);
  const managerIds = useMemo(()=>new Set([...items.map(row=>row.managerId).filter(Boolean),...departmentManagerIds]),[items,departmentManagerIds]);
  const filteredItems = useMemo(() => { const needle = query.trim().toLowerCase(); return items.filter((item) => (!managersOnly||managerIds.has(item.id)) && (statusFilter === "all" || item.status === statusFilter) && (!needle || Object.values(item).some((value) => String(value ?? "").toLowerCase().includes(needle)))).sort((a,b) => sort === "name" ? String(a.name || a.title || a.id).localeCompare(String(b.name || b.title || b.id), language) : String(b.createdAt || b.hireDate || "").localeCompare(String(a.createdAt || a.hireDate || ""))); }, [items, query, statusFilter, managersOnly, managerIds, sort, language]);

  async function handleDelete(id: string) { if (deletingId || !spec || !collection || !window.confirm(t("Delete this record? This cannot be undone."))) return; setDeleting(id); try { const result = await api.collections.remove(collection, id); if (result.pending) setNotice("Your change was submitted for approval."); else setItems((current) => current.filter((item) => item.id !== id)); } catch (err) { setError(err instanceof Error ? err.message : "Failed to delete the record."); } finally { setDeleting(null); } }
  async function handleExport() { if (!collection) return; try { const { filename, csv } = await api.workspace.exportCollection(collection); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); } catch (err) { setError(err instanceof Error ? err.message : "Failed to export records."); } }

  if (metaError) return <div className="page"><p className="error" role="alert">{t("Could not load workspace metadata. Try again.")}</p><button type="button" onClick={() => window.location.reload()}>{t("Try again")}</button></div>;
  if (!metaLoading && !spec) return <div className="page"><p role="status">{t("This section could not be found.")}</p><button type="button" onClick={() => navigate("/")}>{t("Go to home")}</button></div>;
  if (metaLoading || !spec) return <p className="hint">{t("Loading records…")}</p>;
  const pages = Math.max(1, Math.ceil(filteredItems.length / 20)), currentPage = Math.min(page, pages);
  const visibleItems = filteredItems.slice((currentPage - 1) * 20, currentPage * 20);
  const newLink = `/${module}/${collection}/new${companyFilter ? "?company=" + encodeURIComponent(companyFilter) : ""}`;
  return <div className="page entity-list-page">
    <div className="page-head entity-list-head"><div><p className="eyebrow">{t(module === "hr" ? "Workforce records" : "Workspace records")}</p><h1>{t(spec.label)}<span className="entity-record-count">{items.length}</span></h1><p className="hint">{t("Search, review and manage {section} within your access scope.", { section: t(spec.label) })}</p></div><div className="inline-actions">{canExport && !companyFilter && <button type="button" onClick={() => void handleExport()}>{t("Export")}</button>}{canCreate && <button className="primary" type="button" onClick={() => navigate(newLink)}><span aria-hidden="true">+ </span>{t("Add")} {t(spec.singular)}</button>}</div></div>
    {(feedback || notice) && <div className="alert alert--good" role="status">{t(notice || feedback || "")}</div>}{error && <div className="alert alert--bad" role="alert">{t(error)}</div>}
    <section className="card entity-list-card"><div className="entity-toolbar"><label className="entity-search"><span className="visually-hidden">{t("Search")} {t(spec.label)}</span><SearchIcon/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Search records")} /></label>
      {companies.length > 1 && <label className="entity-filter"><span>{t("Company")}</span><ChoiceSelect value={companyFilter} onChange={event => { const next = new URLSearchParams(location.search); if (event.target.value) next.set("company", event.target.value); else next.delete("company"); navigate({ search: next.toString() }, { replace: true }); }}><option value="">{t("All companies")}</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</ChoiceSelect></label>}
      <label className="entity-filter"><span>{t("Status")}</span><ChoiceSelect value={statusFilter} disabled={!statusOptions.length} onChange={event => setStatusFilter(event.target.value)}><option value="all">{t("All statuses")}</option>{statusOptions.map(status => <option value={status} key={status}>{t(status)}</option>)}</ChoiceSelect></label>
      <label className="entity-filter"><span>{t("Sort by")}</span><ChoiceSelect value={sort} onChange={event => setSort(event.target.value)}><option value="newest">{t("Newest first")}</option><option value="name">{t("Name")}</option></ChoiceSelect></label>
    </div><div className="entity-results" aria-live="polite"><span>{t("{count} of {total} records", { count: filteredItems.length, total: items.length })}</span>{(query || statusFilter !== "all") && <button type="button" onClick={() => { setQuery(""); setStatusFilter("all"); }}>{t("Clear filters")}</button>}</div>
    {loading ? <div className="entity-loading" aria-busy="true"><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></div> : !filteredItems.length ? <div className="entity-empty"><strong>{t(items.length ? "No matching records" : "No records found.")}</strong><p>{t(items.length ? "Try another search or filter." : "Create a record to get started.")}</p>{!items.length && canCreate && <NavLink className="primary-link" to={newLink}>{t("Add")} {t(spec.singular)}</NavLink>}</div> : <div className="table-wrap"><table className="table entity-record-table"><thead><tr>{columns.map(field => <th key={field.key} scope="col">{t(field.label)}</th>)}<th scope="col">{t("Actions")}</th></tr></thead><tbody>{visibleItems.map(item => {
      const name = String(item.name || item.title || item.employeeCode || item.id), to = `/${module}/${collection}/${encodeURIComponent(item.id)}`;
      return <tr key={item.id}>{columns.map(field => <td key={field.key} className={field.key === "name" ? "record-name-cell" : undefined} data-label={t(field.label)}>
        {field.key === "name" ? <div className="record-identity"><span className="record-avatar" aria-hidden="true">{name.split(/\s+/).slice(0,2).map(word => word[0]).join("").toUpperCase()}</span><span className="record-cell-text" dir="auto" title={name}>{name}</span></div> : field.key === "status" ? <span className="record-status" data-status={String(item.status)}>{t(formatFieldValue(item.status))}</span> : <span className={field.key === "employeeCode" ? "record-cell-text record-code" : "record-cell-text"} dir={field.key === "employeeCode" ? "ltr" : "auto"} title={formatFieldValue(item[field.key])}>{["select","status"].includes(field.type) ? t(formatFieldValue(item[field.key])) : formatFieldValue(item[field.key])}</span>}
      </td>)}<td className="record-actions-cell" data-label={t("Actions")}><RecordActions to={to} name={name} editable={canEdit} removable={canDelete} busy={deletingId === item.id} onDelete={() => void handleDelete(item.id)}/></td></tr>;
    })}</tbody></table></div>}
    {!loading && filteredItems.length > 0 && <footer className="entity-pagination"><span>{t("Page")} {currentPage} / {pages}</span><div><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{t("Previous")}</button><button type="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>{t("Next")}</button></div></footer>}
    </section>
  </div>;
}
