import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../api";
import { useLanguage } from "../language-context";
import { formatDate } from "../util";
import MobileIcon from "./MobileIcon";
import "../company-setup.css";

type Setup = {
  done: number; total: number;
  items: { id: string; label: string; done: boolean; detail?: string; detailValues?: Record<string, string | number>; link: string; area: string }[];
  licenses: { id: string; licenseType: string; number: string; issuingAuthority?: string; expiryDate: string; status: string; daysLeft: number | null }[];
};
const areas = [["company", "Company"], ["finance", "Finance"], ["people", "People & payroll"], ["licences", "Licences"]] as const;

/** Setup checklist and licence expiry for one company. */
export default function CompanySetup({ companyId }: { companyId: string }) {
  const { t } = useLanguage(), [data, setData] = useState<Setup | null>(null), [error, setError] = useState(""), [open, setOpen] = useState(false);
  useEffect(() => { let active = true; setData(null); void request<Setup>(`/workspace/companies/${encodeURIComponent(companyId)}/setup`).then(value => { if (active) { setData(value); setOpen(value.done < value.total); } }).catch(err => { if (active) setError((err as Error).message); }); return () => { active = false; }; }, [companyId]);
  if (error) return null;
  if (!data) return <section className="card company-setup" aria-busy="true"><p role="status">{t("Checking company setup…")}</p></section>;
  const percent = Math.round(data.done / data.total * 100), urgent = data.licenses.filter(l => l.status === "expired" || l.status === "expiring");
  return <>
    {urgent.length > 0 && <section className="card company-license-alert" role="alert"><MobileIcon name="info" /><div><strong>{t("Licences need attention")}</strong><ul>{urgent.map(l => <li key={l.id}>{t(l.licenseType)} <bdi dir="ltr">{l.number}</bdi> · {l.status === "expired" ? t("expired on {date}", { date: formatDate(l.expiryDate) }) : t("expires in {days} days", { days: l.daysLeft ?? 0 })}</li>)}</ul></div><Link to={`/organization/companyLicenses?company=${encodeURIComponent(companyId)}`}>{t("Review licences")}</Link></section>}
    <section className="card company-setup">
      <header><div><p className="eyebrow">{t("Company setup")}</p><h2>{data.done === data.total ? t("Setup complete") : t("{done} of {total} done", { done: data.done, total: data.total })}</h2></div><div className="company-setup-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t("Company setup")}><span style={{ width: `${percent}%` }} /></div><button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{t(open ? "Hide checklist" : "Show checklist")}</button></header>
      {open && <div className="company-setup-areas">{areas.map(([area, label]) => { const items = data.items.filter(i => i.area === area); return items.length ? <div key={area}><h3>{t(label)}</h3><ul>{items.map(item => <li key={item.id} data-done={item.done}><span className="company-setup-check" aria-hidden="true">{item.done ? "✓" : ""}</span><span><strong>{t(item.label)}</strong>{item.detail && <small>{t(item.detail, item.detailValues)}</small>}</span>{!item.done && <Link to={item.link}>{t("Set up")}</Link>}<span className="visually-hidden">{t(item.done ? "Done" : "Not done")}</span></li>)}</ul></div> : null; })}</div>}
    </section>
    <section className="card company-licenses"><header className="section-heading"><h2>{t("Licences & official documents")}</h2><div className="inline-actions"><Link className="primary-link" to={`/organization/companyLicenses/new?company=${encodeURIComponent(companyId)}`}>{t("Add licence")}</Link><Link to={`/organization/companyLicenses?company=${encodeURIComponent(companyId)}`}>{t("All licences")}</Link></div></header>
      {data.licenses.length ? <div className="table-wrap"><table className="table"><thead><tr><th>{t("Licence / document")}</th><th>{t("Number")}</th><th>{t("Expiry date")}</th><th>{t("Status")}</th></tr></thead><tbody>{data.licenses.map(l => <tr key={l.id}><td><Link to={`/organization/companyLicenses/${encodeURIComponent(l.id)}`}>{t(l.licenseType)}</Link>{l.issuingAuthority && <span className="cell-sub">{l.issuingAuthority}</span>}</td><td dir="ltr">{l.number}</td><td>{l.expiryDate ? formatDate(l.expiryDate) : t("No expiry")}</td><td><span className="finance-status" data-status={l.status === "expired" ? "cancelled" : l.status === "expiring" ? "pending" : "paid"}>{t(l.status === "expiring" ? "expires in {days} days" : l.status, { days: l.daysLeft ?? 0 })}</span></td></tr>)}</tbody></table></div>
        : <p className="hint">{t("Add the commercial registration, tax and municipality licences, insurance and lease. You will be reminded before each one expires.")}</p>}
    </section>
  </>;
}
