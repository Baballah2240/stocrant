import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { useMeta } from "../meta-context";
import { api } from "../api";
import { useSession } from "../session-context";
import { formatFieldValue } from "../util";
import type { FieldSpec } from "../types";

function can(permissions: string[] | undefined, section: string, action: string) { return Boolean(permissions?.includes("*") || permissions?.includes(`${section}.*`) || permissions?.includes(`${section}.${action}`)); }
function sectionFor(module: string | undefined) { return module === "organization" ? "organizations" : module === "stores" ? "operations" : module === "warehouse" ? "inventory" : module === "admin" ? "access" : "hr"; }
function initials(value: unknown) { return String(value ?? "ST").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "ST"; }
function DetailFields({ fields, item }: { fields: FieldSpec[]; item: Record<string, unknown> }) { return <div className="employee-detail-grid">{fields.map((field) => <div className="employee-detail-item" key={field.key}><span>{field.label}</span><strong>{formatFieldValue(item[field.key])}</strong></div>)}</div>; }

export default function EntityDetail() {
  const { module, collection, id } = useParams<{ module: string; collection: string; id?: string }>();
  const { entities, loading: metaLoading } = useMeta();
  const { user } = useSession();
  const navigate = useNavigate();
  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const spec = useMemo(() => module && collection ? (entities ?? []).find((entity) => entity.module === module && entity.collection === collection) : undefined, [module, collection, entities]);
  const canEdit = (module !== "hr" || user?.roleId === "role-main-manager") && can(user?.permissions, sectionFor(module), "edit");
  useEffect(() => { if (!id || !collection || !spec) return; let active = true; setLoading(true); setError(null); api.collections.get(collection, id).then((result) => { if (active) setItem(result.item ?? null); }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Failed to load this record."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [id, collection, spec]);
  if (metaLoading || !spec) return <p className="hint">Loading record…</p>;
  if (loading) return <p className="hint">Loading {spec.singular.toLowerCase()}…</p>;
  if (error) return <div className="alert alert--bad" role="alert">{error}</div>;
  if (!item) return <p className="empty">This {spec.singular.toLowerCase()} could not be found.</p>;

  if (collection === "employees") {
    const personal = spec.fields.filter((field) => ["employeeCode", "name", "email", "phone", "birthday"].includes(field.key));
    const employment = spec.fields.filter((field) => ["department", "jobTitle", "employmentType", "status", "hireDate", "manager", "salary"].includes(field.key));
    const assignment = spec.fields.filter((field) => ["organizationId", "locationId", "location", "notes"].includes(field.key));
    return <div className="page employee-profile-page"><div className="employee-profile-hero"><NavLink className="back-button" to="/hr/employees">← Employees</NavLink><div className="employee-profile-heading"><span className="employee-profile-avatar" aria-hidden="true">{initials(item.name)}</span><div><p className="eyebrow">Employee profile</p><h1>{formatFieldValue(item.name)}</h1><p>{formatFieldValue(item.jobTitle)} · {formatFieldValue(item.department)}</p></div></div><div className="employee-profile-actions">{canEdit ? <button className="primary" type="button" onClick={() => navigate(`/hr/employees/${id}/edit`)}>Edit profile</button> : null}</div></div><section className="employee-profile-content"><article className="card employee-profile-card"><div className="hr-section-heading"><h2>Personal details</h2></div><DetailFields fields={personal} item={item} /></article><article className="card employee-profile-card"><div className="hr-section-heading"><h2>Employment</h2></div><DetailFields fields={employment} item={item} /></article><article className="card employee-profile-card employee-profile-card--wide"><div className="hr-section-heading"><h2>Organization &amp; location</h2></div><DetailFields fields={assignment} item={item} /></article><section className="employee-profile-links"><NavLink to="/hr/attendance">Attendance</NavLink><NavLink to="/hr/leaveRequests">Leave requests</NavLink><NavLink to="/hr/employeeHistory">Employee history</NavLink></section></section></div>;
  }
  return <div className="page"><div className="page-head"><div><NavLink className="back-button" to={`/${module}/${collection}`}>← Back to {spec.label}</NavLink><h1>{formatFieldValue(item[spec.columns[0]] ?? "—")}</h1><p className="hint">{spec.singular} details</p></div>{canEdit ? <button className="primary" type="button" onClick={() => navigate(`/${module}/${collection}/${id}/edit`)}>Edit</button> : null}</div><div className="card">{spec.fields.map((field) => <div key={field.key} className="field"><p className="field-label">{field.label}</p><p className="field-value">{formatFieldValue(item[field.key])}</p></div>)}</div></div>;
}