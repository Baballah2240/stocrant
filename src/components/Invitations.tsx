import { useEffect, useState, type FormEvent } from "react";
import { request, serverUrl } from "../api";
import { useLanguage } from "../language-context";
import { useSession } from "../session-context";
import type { CollectionItem } from "../types";

type Invitation = { id: string; name: string; email: string; companyId: string; roleId: string; status: string; expiresAt: string; deliveryStatus?: string };
type Result = { item: Invitation; token?: string };
export default function Invitations() {
  const { t, language } = useLanguage(), { user } = useSession();
  const permitted = (action: string) => user?.permissions.some(value => ["*", "access.*", `access.${action}`].includes(value));
  const [items, setItems] = useState<Invitation[]>([]), [companies, setCompanies] = useState<{ id: string; name: string }[]>([]), [roles, setRoles] = useState<CollectionItem[]>([]);
  const [employees, setEmployees] = useState<CollectionItem[]>([]);
  const [form, setForm] = useState({ name: "", email: "", companyId: "", roleId: "role-employee", employeeId: "" });
  const [link, setLink] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const base = "/workspace/access/invitations";
  async function load() {
    const [invitations, companyData, roleData, hrData] = await Promise.all([
      request<{ items: Invitation[] }>(base), request<{ companies: { id: string; name: string }[] }>("/auth/companies"), request<{ items: CollectionItem[] }>("/workspace/access/roles"),
      request<{ employees: CollectionItem[] }>("/workspace/hr/companies"),
    ]);
    setItems(invitations.items); setCompanies(companyData.companies); setRoles(roleData.items.filter(role => role.status !== "inactive" && !["role-main-manager", "role-organization-admin"].includes(role.id)));
    setEmployees(hrData.employees);
  }
  useEffect(() => { void load().catch(err => setError(err.message)); }, []);
  async function run(operation: () => Promise<Result>) {
    setBusy(true); setError(""); setLink(""); setNotice("");
    try {
      const result = await operation();
      if (result.token) {
        const url = new URL("/login", serverUrl.current() || location.origin); url.hash = "invite=" + result.token; setLink(url.toString());
      }
      setNotice(result.item.deliveryStatus === "provider-accepted" ? "Email accepted by provider. Inbox delivery is not independently confirmed." : result.item.status === "revoked" ? "Invitation revoked." : "Private invitation link created. No email has been sent.");
      await load();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  function create(event: FormEvent) {
    event.preventDefault();
    void run(() => request<Result>(base, { method: "POST", body: JSON.stringify({ ...form, employeeId: form.employeeId || undefined }) }));
  }
  return <section className="form"><p>{t("Choose one company and role. The recipient sets their own password. Resending invalidates the previous link.")}</p>
    {error && <p className="alert alert--bad" role="alert">{t(error)}</p>}{notice && <p role="status">{t(notice)}</p>}
    {permitted("create") && <form className="form" onSubmit={create}><div className="form-grid">
      <label>{t("Name")}<input required minLength={2} maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label>
      <label>{t("Email")}<input required type="email" maxLength={160} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}/></label>
      <label>{t("Company")}<select required value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value, employeeId: "" })}><option value="">{t("Choose company")}</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
      <label>{t("Role")}<select required value={form.roleId} onChange={e => setForm({ ...form, roleId: e.target.value })}>{roles.map(role => <option key={role.id} value={role.id}>{t(String(role.name))}</option>)}</select></label>
      <label>{t("Link employee")}<select value={form.employeeId} onChange={e => { const employee = employees.find(row => row.id === e.target.value); setForm({ ...form, employeeId: e.target.value, ...(employee ? { name: String(employee.name), email: String(employee.email || "") } : {}) }); }}><option value="">{t("Standalone account")}</option>{employees.filter(employee => (employee.organizationId || employee.companyId) === form.companyId && !["inactive", "suspended", "terminated"].includes(String(employee.status))).map(employee => <option key={employee.id} value={employee.id}>{String(employee.name)}</option>)}</select></label>
    </div><button className="primary" disabled={busy}>{t("Create invitation link")}</button></form>}
    {link && <aside className="alert"><label>{t("Private one-time invitation")}<input readOnly value={link} onFocus={e => e.target.select()}/></label><p>{t("Share only with the verified recipient. This link grants the selected access.")}</p><button onClick={() => setLink("")}>{t("Close")}</button></aside>}
    <div className="table-wrap"><table className="table"><thead><tr>{["Name", "Email", "Company", "Role", "Status", "Expires", "Email delivery", "Actions"].map(label => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.name}</td><td>{item.email}</td><td>{companies.find(company => company.id === item.companyId)?.name || item.companyId}</td><td>{t(String(roles.find(role => role.id === item.roleId)?.name || item.roleId))}</td><td>{t(item.status)}</td><td>{new Date(item.expiresAt).toLocaleString(language)}</td><td>{t(item.deliveryStatus || "not-sent")}</td><td>{["pending", "expired"].includes(item.status) && permitted("edit") && <div className="inline-actions">
      <button disabled={busy} onClick={() => void run(() => request<Result>(`${base}/${item.id}/resend`, { method: "POST" }))}>{t("Regenerate link")}</button>
      <button disabled={busy} onClick={() => { if (confirm(`${t("Send invitation email to")} ${item.email}?`)) void run(() => request<Result>(`${base}/${item.id}/send`, { method: "POST", body: JSON.stringify({ confirmDelivery: true }) })); }}>{t("Send / resend email")}</button>
      <button disabled={busy} onClick={() => void run(() => request<Result>(`${base}/${item.id}/revoke`, { method: "POST" }))}>{t("Revoke")}</button>
    </div>}</td></tr>)}</tbody></table>{!items.length && <p>{t("No invitations yet.")}</p>}</div>
  </section>;
}
