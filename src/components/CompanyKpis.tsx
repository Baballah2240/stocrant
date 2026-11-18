import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../api";
import { companyTypeOf } from "../company-types";
import { useLanguage } from "../language-context";
import MobileIcon from "./MobileIcon";

type Kpi = { id: string; label: string; value: string; kind: "money" | "count" | "percent"; hint?: string; hintValues?: Record<string, string | number>; tone?: "good" | "warn" | "bad"; link?: string };
type Data = { type: string; currency: string; asOf: string; kpis: Kpi[] };

/** Today's key figures for the company's type: occupancy for hotels, tables and stock for restaurants, orders for shops, appointments for services. */
export default function CompanyKpis({ companyId }: { companyId: string }) {
  const { t, language } = useLanguage(), [data, setData] = useState<Data | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => { let active = true; setData(null); setFailed(false); void request<Data>(`/workspace/companies/${encodeURIComponent(companyId)}/kpis`).then(value => { if (active) setData(value); }).catch(() => { if (active) setFailed(true); }); return () => { active = false; }; }, [companyId]);
  if (failed || (data && !data.kpis.length)) return null;
  const locale = language === "ar" ? "ar-QA" : "en-GB";
  const show = (k: Kpi) => k.kind === "money" ? new Intl.NumberFormat(locale, { style: "currency", currency: data?.currency || "QAR" }).format(Number(k.value)) : k.kind === "percent" ? new Intl.NumberFormat(locale, { style: "percent" }).format(Number(k.value) / 100) : new Intl.NumberFormat(locale).format(Number(k.value));
  const profile = companyTypeOf(data?.type);
  return <section className="card company-kpis" aria-busy={!data}><header className="section-heading"><h2><MobileIcon name={profile.icon} /> {t("Today at a glance")}</h2><span className="hint">{t(profile.label)}</span></header>
    {!data ? <p role="status">{t("Loading…")}</p> : <div className="company-kpi-grid">{data.kpis.map(k => { const body = <><span>{t(k.label)}</span><strong>{show(k)}</strong>{k.hint && <small>{t(k.hint, k.hintValues)}</small>}</>; return k.link ? <Link key={k.id} to={k.link} className="company-kpi" data-tone={k.tone}>{body}</Link> : <div key={k.id} className="company-kpi" data-tone={k.tone}>{body}</div>; })}</div>}
  </section>;
}
