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
  const { module, collection } = useParams<{ module: string; collection: string }>();
  const { entities, loading: metaLoading } = useMeta();
  const { user } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const spec = useMemo(() => module && collection ? (entities ?? []).find((entity) => entity.module === module && entity.collection === collection) : undefined, [module, collection, entities]);
  const section = sectionFor(module);
  const canCreate = (module !== "hr" || user?.roleId === "role-main-manager") && can(user?.permissions, section, "create");
  const canEdit = (module !== "hr" || user?.roleId === "role-main-manager") && can(user?.permissions, section, "edit");
  const canDelete = (module !== "hr" || user?.roleId === "role-main-manager") && can(user?.permissions, section, "delete");
  const canExport = can(user?.permissions, section, "export");
  const feedback = typeof location.state === "object" && location.state && "success" in location.state && typeof location.state.success === "string" ? location.state.success : null;

  useEffect(() => {
    if (!collection || !spec) return;
    let active = true; setLoading(true); setError(null);
    api.collections.list(collection).then((result) => { if (active) setItems(result.items ?? []); }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Failed to load records."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [collection, spec]);

  const columns = useMemo(() => { if (!spec) return []; const fields = new Map<string, EntitySpec["fields"][number]>(); for (const field of spec.fields) fields.set(field.key, field); return spec.columns.map((key) => fields.get(key)).filter((field): field is EntitySpec["fields"][number] => Boolean(field)); }, [spec]);
  const statusOptions = useMemo(() => [...new Set(items.map((item) => typeof item.status === "string" ? item.status : "").filter(Boolean))].sort(), [items]);
  const filteredItems = useMemo(() => { const needle = query.trim().toLowerCase(); return items.filter((item) => (statusFilter === "all" || item.status === statusFilter) && (!needle || Object.values(item).some((value) => String(value ?? "").toLowerCase().includes(needle)))); }, [items, query, statusFilter]);

  async function handleDelete(id: string) { if (!spec || !collection || !window.confirm(`Delete this ${spec.singular.toLowerCase()}? This cannot be undone.`)) return; try { await api.collections.remove(collection, id); setItems((current) => current.filter((item) => item.id !== id)); } catch (err) { setError(err instanceof Error ? err.message : "Failed to delete the record."); } }
  async function handleExport() { if (!collection) return; try { const { filename, csv } = await api.workspace.exportCollection(collection); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); } catch (err) { setError(err instanceof Error ? err.message : "Failed to export records."); } }

  if (metaLoading || !spec) return <p className="hint">Loading records…</p>;
  return <div className="page entity-list-page"><div className="page-head entity-list-head"><div><p className="eyebrow">{module === "hr" ? "Workforce records" : "Workspace records"}</p><h1>{spec.label}<span className="hint">&nbsp;({items.length})</span></h1><p className="hint">Search, review and manage {spec.label.toLowerCase()} within your access scope.</p></div><div className="inline-actions">{canExport ? <button type="button" onClick={() => void handleExport()}>Export</button> : null}{canCreate ? <button className="primary" type="button" onClick={() => navigate(`/${module}/${collection}/new`)}>Add {spec.singular}</button> : null}</div></div>{feedback ? <div className="alert alert--good" role="status">{feedback}</div> : null}{error ? <div className="alert alert--bad" role="alert">{error}</div> : null}<section className="card entity-list-card"><div className="entity-toolbar"><label className="entity-search"><span className="visually-hidden">Search {spec.label}</span><SearchIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${spec.label.toLowerCase()}…`} /></label>{collection === "employees" && statusOptions.length ? <label className="entity-filter"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{statusOptions.map((status) => <option value={status} key={status}>{status}</option>)}</select></label> : null}</div>{loading ? <div className="entity-loading" aria-busy="true"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div> : filteredItems.length === 0 ? <div className="entity-empty"><strong>{items.length ? "No matching records" : `No ${spec.label.toLowerCase()} yet`}</strong><p>{items.length ? "Try another search or filter." : `Create a ${spec.singular.toLowerCase()} when you are ready to get started.`}</p>{!items.length && canCreate ? <NavLink className="primary-link" to={`/${module}/${collection}/new`}>Add {spec.singular}</NavLink> : null}</div> : <div className="table-wrap"><table className="table"><thead><tr>{columns.map((field) => <th key={field.key}>{field.label}</th>)}<th className="num">Actions</th></tr></thead><tbody>{filteredItems.map((item) => <tr key={item.id}>{columns.map((field) => <td key={field.key}>{formatFieldValue(item[field.key])}</td>)}<td className="num"><div className="row-actions"><NavLink to={`/${module}/${collection}/${item.id}`} className="ghost">Open</NavLink>{canEdit ? <NavLink to={`/${module}/${collection}/${item.id}/edit`} className="ghost">Edit</NavLink> : null}{canDelete ? <button type="button" className="ghost danger" onClick={() => void handleDelete(item.id)}>Delete</button> : null}</div></td></tr>)}</tbody></table></div>}</section></div>;
}