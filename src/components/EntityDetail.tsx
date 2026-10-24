import EmployeeProfile from "./EmployeeProfile";
import FinanceSourceLinks from "./FinanceSourceLinks";
import { useLanguage } from "../language-context";
import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { useMeta } from "../meta-context";
import { api } from "../api";
import { useSession } from "../session-context";
import { formatFieldValue } from "../util";

function can(permissions: string[] | undefined, section: string, action: string) { return Boolean(permissions?.includes("*") || permissions?.includes(`${section}.*`) || permissions?.includes(`${section}.${action}`)); }
function sectionFor(module: string | undefined) { return module === "organization" ? "organizations" : module === "stores" ? "operations" : module === "warehouse" ? "inventory" : module === "admin" ? "access" : "hr"; }

export default function EntityDetail() {
  const { t } = useLanguage();
  const { module, collection, id } = useParams<{ module: string; collection: string; id?: string }>();
  const { entities, loading: metaLoading, error: metaError } = useMeta();
  const { user } = useSession();
  const navigate = useNavigate();
  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const spec = useMemo(() => module && collection ? (entities ?? []).find((entity) => entity.module === module && entity.collection === collection) : undefined, [module, collection, entities]);
  const canEdit = can(user?.permissions, sectionFor(module), "edit");
  useEffect(() => { if (!id || !collection || !spec) return; let active = true; setLoading(true); setError(null); api.collections.get(collection, id).then((result) => { if (active) setItem(result.item ?? null); }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Failed to load this record."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [id, collection, spec]);
  if (metaError) return <div className="page"><p className="error" role="alert">{t("Could not load workspace metadata. Try again.")}</p><button type="button" onClick={() => window.location.reload()}>{t("Try again")}</button></div>;
  if (!metaLoading && !spec) return <div className="page"><p role="status">{t("This section could not be found.")}</p><button type="button" onClick={() => navigate("/")}>{t("Go to home")}</button></div>;
  if (metaLoading || !spec) return <p className="hint">{t("Loading record…")}</p>;
  if (loading) return <p className="hint">{t("Loading")} {t(spec.singular)}…</p>;
  if (error) return <div className="alert alert--bad" role="alert">{t(error)}</div>;
  if (!item) return <p className="empty">{t("This")} {t(spec.singular)}  {t("could not be found.")}</p>;

  if (collection === "employees") return <EmployeeProfile id={id!}/>;
  return <div className="page"><div className="page-head"><div><NavLink className="back-button" to={`/${module}/${collection}`}>{t("← Back to")} {t(spec.label)}</NavLink><h1>{formatFieldValue(item[spec.columns[0]] ?? "—")}</h1><p className="hint">{t(spec.singular)}  {t("details")}</p></div>{canEdit && !(collection === "sales" && item.shopOrderId) ? <button className="primary" type="button" onClick={() => navigate(`/${module}/${collection}/${id}/edit`)}>{t("Edit")}</button> : null}</div><FinanceSourceLinks collection={collection!} id={id!} item={item}/><div className="card">{spec.fields.map((field) => <div key={field.key} className="field"><p className="field-label">{t(field.label)}</p><p className="field-value">{["select", "checkbox"].includes(field.type) ? t(formatFieldValue(item[field.key])) : formatFieldValue(item[field.key])}</p></div>)}</div></div>;
}
