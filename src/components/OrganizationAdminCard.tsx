import { useEffect, useState, type FormEvent } from "react";
import { request } from "../api";
import { useLanguage } from "../language-context";
import ChoiceSelect from "./ChoiceSelect";
import "../organization-admin.css";
type Account = { id: string; name: string; email: string; status: string };
type Data = { admin: Account | null; candidates: Account[]; companies: {id:string;name:string}[]; version: number };
export default function OrganizationAdminCard({ organizationId, editable, active, onAssigned }: { organizationId: string; editable: boolean; active: boolean; onAssigned: () => void }) {
  const { t } = useLanguage();
  const [data, setData] = useState<Data | null>(null), [companyIds,setCompanyIds] = useState<string[]>([]), [mode, setMode] = useState("existing"), [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ accountId: "", name: "", email: "", password: "" }), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const endpoint = `/workspace/organization-admins/${encodeURIComponent(organizationId)}`;
  async function load() { try { setData(await request<Data>(endpoint)); setError(""); } catch (err) { setError((err as Error).message); } }
  useEffect(() => { let active = true; void request<Data>(endpoint).then(result => { if (active) setData(result); }).catch(err => { if (active) setError(err.message); }); return () => { active = false; }; }, [endpoint]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || !data) return;
    setBusy(true); setError("");
    try {
      await request(endpoint, { method: "POST", body: JSON.stringify({ version: data.version, organizationIds: companyIds, ...(mode === "existing" ? { accountId: form.accountId } : { name: form.name, email: form.email, password: form.password }) }) });
      setForm({ accountId: "", name: "", email: "", password: "" }); setEditing(false); await load(); onAssigned();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="organization-admin-card" aria-label={t("Organization main admin")}><header><div><h3>{t("Organization main admin")}</h3><p className="hint">{t("This administrator can access only the companies selected for this account.")}</p></div>{editable && active && !editing && <button type="button" disabled={!data} onClick={() => setEditing(true)}>{t(data?.admin ? "Change main admin" : "Assign main admin")}</button>}</header>
    {data?.admin ? <p><strong>{data.admin.name}</strong> <span dir="ltr">{data.admin.email}</span></p> : <p role="status">{t(data ? "Admin setup pending. Assign a main admin for this organization." : "Loading…")}</p>}
    {error && <div className="error" role="alert">{t(error)} <button type="button" disabled={busy} onClick={() => void load()}>{t("Refresh")}</button></div>}
    {editing && <form onSubmit={save} className="organization-admin-form"><label>{t("Assignment method")}<ChoiceSelect value={mode} disabled={busy} onChange={event => setMode(event.target.value)}><option value="existing">{t("Choose an existing account")}</option><option value="new">{t("Create a new admin account")}</option></ChoiceSelect></label>
      {mode === "existing" ? <label>{t("Account")}<ChoiceSelect required value={form.accountId} disabled={busy} onChange={event => setForm({ ...form, accountId: event.target.value })}><option value="">{t("Choose an account")}</option>{data?.candidates.map(account => <option key={account.id} value={account.id}>{account.name} · {account.email}</option>)}</ChoiceSelect><small>{t("Only active accounts in this organization are available.")}</small></label> : <>{(["name", "email", "password"] as const).map(field => <label key={field}>{t(field === "name" ? "Name" : field === "email" ? "Email" : "Temporary password")}<input required disabled={busy} minLength={field === "password" ? 12 : 2} maxLength={field === "password" ? 256 : 160} type={field === "name" ? "text" : field} autoComplete={field === "password" ? "new-password" : "off"} value={form[field]} onChange={event => setForm({ ...form, [field]: event.target.value })} /></label>)}<p className="hint">{t("The new admin must change the temporary password at first sign-in. Share it securely.")}</p></>}
      <fieldset><legend>{t("Assigned companies")}</legend>{data?.companies.map(company=><label className="check-field" key={company.id}><input type="checkbox" checked={companyIds.includes(company.id)} onChange={event=>setCompanyIds(ids=>event.target.checked?[...ids,company.id]:ids.filter(id=>id!==company.id))}/>{company.name}</label>)}<p className="hint">{t("Unassigned companies are hidden, even when the account has management permissions.")}</p></fieldset><p className="hint">{t("Changing the main admin keeps the previous account and its existing organization access. Review that account separately if access should be removed.")}</p>
      <div className="inline-actions"><button className="primary" disabled={busy}>{t("Save main admin")}</button><button type="button" disabled={busy} onClick={() => { setEditing(false); setForm({ accountId: "", name: "", email: "", password: "" }); }}>{t("Cancel")}</button></div>
    </form>}
  </section>;
}
