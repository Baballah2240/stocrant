import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { request, serverUrl } from "../api";
import { useLanguage } from "../language-context";
import ChoiceSelect from "./ChoiceSelect";
import "../company-services.css";

type Settings = {
  version: number; shortcuts: string[]; websiteEnabled: boolean; published: boolean; slug: string;
  language: "en" | "ar"; accent: string; title: string; titleAr: string; tagline: string; taglineAr: string;
  about: string; aboutAr: string; services: string; servicesAr: string; email: string; phone: string; address: string;
};
type Data = { settings: Settings; availableModules: string[]; url: string | null; permissions: { edit: boolean; provision: boolean } };
const modules = [{ id: "hr", label: "Human resources", path: "/hr/employees" }, { id: "finance", label: "Finance", path: "/finance" }, { id: "inventory", label: "Inventory", path: "/inventory" }, { id: "operations", label: "Operations", path: "/operations" }, { id: "shops", label: "Shops & orders", path: "/shops" }];
const fields = ["title", "titleAr", "tagline", "taglineAr", "about", "aboutAr", "services", "servicesAr", "email", "phone", "address"] as const;
const labels = { title: "Website title (English)", titleAr: "Website title (Arabic)", tagline: "Tagline (English)", taglineAr: "Tagline (Arabic)", about: "Introduction (English)", aboutAr: "Introduction (Arabic)", services: "Services (English)", servicesAr: "Services (Arabic)", email: "Public email", phone: "Public phone", address: "Public address" };
export default function CompanyServices({ companyId }: { companyId: string }) {
  const { t } = useLanguage();
  const [data, setData] = useState<Data | null>(null), [form, setForm] = useState<Settings | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const saving = useRef(false);
  useEffect(() => { let active = true; setData(null); setForm(null); setError("");
    void request<Data>(`/workspace/company-services/${encodeURIComponent(companyId)}`).then(result => { if (active) { setData(result); setForm(result.settings); } }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [companyId]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!form || !data || saving.current) return;
    saving.current = true; setBusy(true); setError(""); setNotice("");
    // Send the editable schema only; server IDs and audit metadata are never client input.
    const { version, shortcuts, websiteEnabled, published, slug, language, accent, title, titleAr, tagline, taglineAr, about, aboutAr, services, servicesAr, email, phone, address } = form;
    try {
      const result = await request<{ settings: Settings; url: string | null }>(`/workspace/company-services/${encodeURIComponent(companyId)}`, { method: "PUT", body: JSON.stringify({ version, shortcuts, websiteEnabled, published, slug, language, accent, title, titleAr, tagline, taglineAr, about, aboutAr, services, servicesAr, email, phone, address }) });
      setData({ ...data, ...result }); setForm(result.settings); setNotice("Company services saved.");
    } catch (err) { setError((err as Error).message); } finally { saving.current = false; setBusy(false); }
  }
  if (!data || !form) return <section className="card"><p role={error ? "alert" : "status"}>{t(error || "Loading company services…")}</p></section>;
  const editable = data.permissions.edit && !busy;
  const websiteUrl = data.url ? new URL(data.url, serverUrl.current() || window.location.origin).href : "";
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => { setForm({ ...form, [key]: value }); setNotice(""); };
  return <section className="company-services"><header className="card"><p className="eyebrow">{t("Company services")}</p><h2>{t("One company. A connected workspace.")}</h2><p>{t("Manage the business here. Add a public company website when the company needs it.")}</p><div className="company-service-links">{modules.filter(module => data.availableModules.includes(module.id) && form.shortcuts.includes(module.id)).map(module => <Link key={module.id} to={`${module.path}?company=${encodeURIComponent(companyId)}`}>{t(module.label)}<span aria-hidden="true"> ↗</span></Link>)}</div></header>
    {error && <p className="alert alert--bad" role="alert">{t(error)}</p>}{notice && <p className="alert" role="status">{t(notice)}</p>}
    <form onSubmit={save} className="company-service-grid"><section className="card"><h3>{t("Workspace shortcuts")}</h3><p className="hint">{t("Choose the company’s quick links. Staff permissions still control access.")}</p><fieldset disabled={!editable} className="company-service-checks"><legend>{t("Company workspace")}</legend>{modules.map(module => <label key={module.id}><input type="checkbox" checked={form.shortcuts.includes(module.id)} onChange={event => set("shortcuts", event.target.checked ? [...form.shortcuts, module.id] : form.shortcuts.filter(id => id !== module.id))}/>{t(module.label)}</label>)}</fieldset><hr/><h3>{t("Optional company website")}</h3><p>{t("A public company profile is separate from the online shop. Shop checkout and payment rules remain in shop settings.")}</p><label className="company-service-toggle"><input type="checkbox" disabled={!data.permissions.provision || busy} checked={form.websiteEnabled} onChange={event => { setForm({ ...form, websiteEnabled: event.target.checked, published: event.target.checked && form.published }); setNotice(""); }}/>{t("Website service enabled")}</label><p className="hint">{t("The Super Admin provisions the service. Authorized company managers maintain the content.")}</p><label className="form-field">{t("Website address")}<input disabled={!editable} value={form.slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={70} placeholder="company-name" dir="ltr" onChange={event => set("slug", event.target.value.toLowerCase())}/><small>/company/{form.slug || "company-name"}</small></label><label className="form-field">{t("Website language")}<ChoiceSelect disabled={!editable} value={form.language} onChange={event => set("language", event.target.value as "en" | "ar")}><option value="en">English</option><option value="ar">العربية</option></ChoiceSelect></label><label className="form-field">{t("Website accent color")}<input type="color" disabled={!editable} value={form.accent} onChange={event => set("accent", event.target.value)}/></label></section>
    <section className="card"><h3>{t("Public website content")}</h3><p className="hint">{t("Only these public details appear on the website. Employee, salary and financial records stay private.")}</p><div className="company-service-fields">{fields.map(key => <label className="form-field" key={key}>{t(labels[key])}{["about", "aboutAr", "services", "servicesAr"].includes(key) ? <textarea rows={4} maxLength={3000} disabled={!editable} dir={key.endsWith("Ar") ? "rtl" : "auto"} value={form[key]} onChange={event => set(key, event.target.value)}/> : <input disabled={!editable} dir={key.endsWith("Ar") ? "rtl" : "auto"} type={key === "email" ? "email" : key === "phone" ? "tel" : "text"} maxLength={key === "address" ? 400 : key === "phone" ? 40 : key.startsWith("tagline") ? 300 : 160} value={form[key]} onChange={event => set(key, event.target.value)}/>}</label>)}</div></section>
    <section className="card company-service-publish"><div><h3>{t("Publication")}</h3><p>{t("Complete the title, introduction and a public contact in the selected language before publishing.")}</p><label className="company-service-toggle"><input type="checkbox" disabled={!editable || !form.websiteEnabled} checked={form.published} onChange={event => set("published", event.target.checked)}/>{t("Publish company website")}</label>{websiteUrl && <p dir="ltr" className="company-service-url">{websiteUrl}</p>}</div><div className="inline-actions">{data.permissions.edit && <button className="primary" disabled={busy}>{t(busy ? "Saving…" : "Save changes")}</button>}{data.settings.websiteEnabled && data.settings.published && websiteUrl && <a href={websiteUrl} target="_blank" rel="noreferrer">{t("Open company website")} ↗</a>}</div></section></form></section>;
}
