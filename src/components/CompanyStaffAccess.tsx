import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { useLanguage } from "../language-context";
import { useSession } from "../session-context";
import type { CollectionItem } from "../types";
import ChoiceSelect from "./ChoiceSelect";
import "../organization-admin.css";
export default function CompanyStaffAccess({ companyId }: { companyId: string }) {
  const { t } = useLanguage(), { user } = useSession();
  const [accounts, setAccounts] = useState<CollectionItem[]>([]), [roles, setRoles] = useState<CollectionItem[]>([]);
  const [accountId, setAccount] = useState(""), [roleId, setRole] = useState("role-employee"), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const load = useCallback(async () => { const [users, roles] = await Promise.all([api.workspace.users(), api.workspace.roles()]); setAccounts(users.items.filter(account => account.id !== user?.id && Array.isArray(account.organizationIds) && account.organizationIds.includes(companyId))); setRoles(roles.items.filter(role => ["role-company-manager", "role-hr-manager", "role-hr-staff", "role-employee"].includes(role.id))); }, [companyId, user?.id]);
  useEffect(() => { let active = true; void load().catch(err => { if (active) setError(err.message); }); return () => { active = false; }; }, [load]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || !accountId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api.workspace.updateUser(accountId, { roleId, permissions: null, ownRecordsOnly: roleId === "role-employee" });
      await load(); window.dispatchEvent(new CustomEvent("stocrant:company-access-changed", { detail: companyId })); setNotice("Staff access saved. The user must sign in again to use the new role.");
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="card company-staff-access"><h2>{t("HR & staff access")}</h2><p className="hint">{t("Assign company people to HR Manager, HR Staff or Staff. Organization admins can also assign company admins.")}</p>
    {error && <div className="error" role="alert">{t(error)} <button type="button" onClick={() => { setError(""); void load().catch(err => setError(err.message)); }}>{t("Refresh")}</button></div>}
    {notice && <p className="alert alert--good" role="status">{t(notice)}</p>}
    <form onSubmit={save} className="organization-admin-form"><label>{t("Person / account")}<ChoiceSelect required value={accountId} disabled={busy} onChange={event => { const selected = accounts.find(account => account.id === event.target.value); setAccount(event.target.value); setRole(roles.some(role => role.id === selected?.roleId) ? String(selected?.roleId) : "role-employee"); }}><option value="">{t("Choose a person")}</option>{accounts.map(account => <option key={account.id} value={account.id}>{String(account.name)} · {t(String(account.status))}</option>)}</ChoiceSelect></label><label>{t("Access role")}<ChoiceSelect required disabled={busy} value={roleId} onChange={event => setRole(event.target.value)}>{roles.map(role => <option key={role.id} value={role.id}>{t(role.id === "role-company-manager" ? "Company Admin" : role.id === "role-employee" ? "Staff" : String(role.name))}</option>)}</ChoiceSelect></label>
      <p className="hint">{t("This replaces custom account permissions with the selected role. Staff access is limited to the person's own records. Existing invitation requirements stay in effect.")}</p><button className="primary" disabled={busy || !accounts.length || !roles.length}>{t("Assign staff role")}</button>
    </form>
  </section>;
}
