import { useEffect, useState } from "react";
import { api } from "../api";
import { formatDate } from "../util";
import BackButton from "./BackButton";
import type { CollectionItem } from "../types";

type Tab = "Users" | "Roles" | "Approval rules" | "Approvals" | "Audit";
const tabs: Tab[] = ["Users", "Roles", "Approval rules", "Approvals", "Audit"];
const ruleSections = ["organizations", "locations", "hr", "operations", "inventory", "finance", "access"];
const ruleActions = ["create", "edit", "delete"];

export default function AccessWorkspace() {
  const [users, setUsers] = useState<CollectionItem[]>([]);
  const [roles, setRoles] = useState<CollectionItem[]>([]);
  const [rules, setRules] = useState<CollectionItem[]>([]);
  const [approvals, setApprovals] = useState<CollectionItem[]>([]);
  const [audit, setAudit] = useState<CollectionItem[]>([]);
  const [tab, setTab] = useState<Tab>("Users");
  const [showInvite, setShowInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", roleId: "role-employee", ownRecordsOnly: false });
  const [ruleForm, setRuleForm] = useState({ section: "finance", action: "create" });

  const load = async () => {
    try {
      const [userData, roleData, ruleData, approvalData, auditData] = await Promise.all([
        api.workspace.users(), api.workspace.roles(), api.workspace.approvalRules(), api.workspace.approvals(), api.workspace.audit(),
      ]);
      setUsers(userData.items); setRoles(roleData.items); setRules(ruleData.items); setApprovals(approvalData.items); setAudit(auditData.items);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load access settings."); }
  };

  useEffect(() => { void load(); }, []);

  async function invite(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    try {
      await api.workspace.createUser(form);
      setShowInvite(false);
      setForm({ name: "", email: "", password: "", roleId: "role-employee", ownRecordsOnly: false });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not add employee access."); } finally { setSaving(false); }
  }

  async function updateStatus(user: CollectionItem, status: string) {
    try { await api.workspace.updateUser(user.id, { status }); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Could not update account."); }
  }

  async function updateRole(role: CollectionItem, permissions: string, ownRecordsOnly: boolean, organizationIds: string, locationIds: string) {
    try {
      const result = await api.workspace.updateRole(role.id, {
        permissions: permissions.split(",").map((item) => item.trim()).filter(Boolean),
        ownRecordsOnly,
        organizationIds: organizationIds.split(",").map((item) => item.trim()).filter(Boolean),
        locationIds: locationIds.split(",").map((item) => item.trim()).filter(Boolean),
      });
      if (result.pending) setError("The role update was submitted for approval.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update role permissions."); }
  }

  async function addRule(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    try { await api.workspace.saveApprovalRule({ ...ruleForm, active: true }); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Could not save approval rule."); } finally { setSaving(false); }
  }

  async function setRuleActive(rule: CollectionItem, active: boolean) {
    try { await api.workspace.updateApprovalRule(rule.id, { active }); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Could not update approval rule."); }
  }

  async function decide(id: string, decision: "approve" | "reject") {
    try { await api.workspace.decideApproval(id, { decision }); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Could not process approval."); }
  }

  const pendingCount = approvals.filter((item) => item.status === "pending").length;

  return (
    <div className="page">
      <div className="page-head">
        <div><BackButton /><h1>Access & settings</h1><p className="hint">Manage employee access, sensitive-action approvals and the permanent audit trail.</p></div>
        {tab === "Users" && <button className="primary" onClick={() => setShowInvite((value) => !value)}>{showInvite ? "Close" : "Add employee access"}</button>}
      </div>
      {error && <p className="error">{error}</p>}
      {showInvite && <section className="card"><h2>Add employee access</h2><form className="form" onSubmit={invite}><div className="form-grid"><AccessInput label="Name" value={form.name} set={(value) => setForm({ ...form, name: value })} /><AccessInput label="Email" type="email" value={form.email} set={(value) => setForm({ ...form, email: value })} /><AccessInput label="Temporary password" type="password" value={form.password} set={(value) => setForm({ ...form, password: value })} /><div className="form-field"><label className="field-label">Role</label><select value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>{roles.map((role) => <option value={String(role.id)} key={role.id}>{String(role.name)}</option>)}</select></div><label className="check-field"><input type="checkbox" checked={form.ownRecordsOnly} onChange={(event) => setForm({ ...form, ownRecordsOnly: event.target.checked })} /> Limit to own records where supported</label></div><button className="primary" disabled={saving}>Add access</button></form></section>}
      <section className="card">
        <div className="tab-list finance-tabs">{tabs.map((option) => <button type="button" key={option} className={tab === option ? "active" : ""} onClick={() => setTab(option)}>{option}{option === "Approvals" && pendingCount ? ` (${pendingCount})` : ""}</button>)}</div>
        {tab === "Users" && <UsersTable users={users} roles={roles} onStatus={updateStatus} />}
        {tab === "Roles" && <RolesPanel roles={roles} onSave={updateRole} />}
        {tab === "Approval rules" && <><form className="inline-form" onSubmit={addRule}><div className="form-field"><label className="field-label">Section</label><select value={ruleForm.section} onChange={(event) => setRuleForm({ ...ruleForm, section: event.target.value })}>{ruleSections.map((section) => <option key={section}>{section}</option>)}</select></div><div className="form-field"><label className="field-label">Action</label><select value={ruleForm.action} onChange={(event) => setRuleForm({ ...ruleForm, action: event.target.value })}>{ruleActions.map((action) => <option key={action}>{action}</option>)}</select></div><button className="primary" disabled={saving}>Require approval</button></form><div className="stack-list">{rules.length ? rules.map((rule) => <div className="approval-row" key={rule.id}><div><strong>{String(rule.section)} · {String(rule.action)}</strong><span>{rule.active ? "Approval required before change is applied" : "Approval not required"}</span></div><label className="switch-field"><input type="checkbox" checked={rule.active === true} onChange={(event) => void setRuleActive(rule, event.target.checked)} /> Active</label></div>) : <p className="empty">No approval rules configured.</p>}</div></>}
        {tab === "Approvals" && <div className="stack-list">{approvals.length ? approvals.map((request) => <div className="approval-row" key={request.id}><div><strong>{String(request.section)} · {String(request.action)}</strong><span>{String(request.requestedByName ?? request.requestedBy)} · {formatDate(String(request.requestedAt))}</span><small>{String(request.collection)} {request.targetId ? `· ${String(request.targetId)}` : ""}</small></div>{request.status === "pending" ? <div className="inline-actions"><button onClick={() => void decide(request.id, "reject")}>Reject</button><button className="primary" onClick={() => void decide(request.id, "approve")}>Approve</button></div> : <span className="badge">{String(request.status)}</span>}</div>) : <p className="empty">No approval requests.</p>}</div>}
        {tab === "Audit" && <div className="timeline">{audit.slice(0, 100).map((entry) => <div className="timeline-row" key={entry.id}><strong>{String(entry.action)}</strong><span>{String(entry.actorName)} · {formatDate(String(entry.occurredAt))}</span></div>)}</div>}
      </section>
    </div>
  );
}

function UsersTable({ users, roles, onStatus }: { users: CollectionItem[]; roles: CollectionItem[]; onStatus: (user: CollectionItem, status: string) => Promise<void> }) {
  return <div className="table-wrap"><table className="table"><thead><tr><th>Employee</th><th>Role</th><th>Scope</th><th>Status</th><th>Access</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{String(user.name)}</strong><span className="cell-sub">{String(user.email)}</span></td><td>{String(roles.find((role) => role.id === user.roleId)?.name ?? user.roleId)}</td><td>{user.ownRecordsOnly ? "Own records only" : "Assigned scope"}</td><td>{String(user.status)}</td><td><select value={String(user.status)} onChange={(event) => void onStatus(user, event.target.value)}><option value="active">active</option><option value="inactive">inactive</option></select></td></tr>)}</tbody></table></div>;
}

function RolesPanel({ roles, onSave }: { roles: CollectionItem[]; onSave: (role: CollectionItem, permissions: string, ownRecordsOnly: boolean, organizationIds: string, locationIds: string) => Promise<void> }) {
  return <div className="stack-list">{roles.map((role) => <RoleEditor key={role.id} role={role} onSave={onSave} />)}</div>;
}

function RoleEditor({ role, onSave }: { role: CollectionItem; onSave: (role: CollectionItem, permissions: string, ownRecordsOnly: boolean, organizationIds: string, locationIds: string) => Promise<void> }) {
  const [permissions, setPermissions] = useState(Array.isArray(role.permissions) ? role.permissions.map(String).join(", ") : "");
  const [ownRecordsOnly, setOwnRecordsOnly] = useState(role.ownRecordsOnly === true);
  const [organizationIds, setOrganizationIds] = useState(Array.isArray(role.organizationIds) ? role.organizationIds.map(String).join(", ") : "");
  const [locationIds, setLocationIds] = useState(Array.isArray(role.locationIds) ? role.locationIds.map(String).join(", ") : "");
  return <form className="role-editor" onSubmit={(event) => { event.preventDefault(); void onSave(role, permissions, ownRecordsOnly, organizationIds, locationIds); }}><div><strong>{String(role.name)}</strong><span className="cell-sub">Use <code>section.action</code>, <code>section.*</code>, or <code>*</code>. Actions: view, create, edit, delete, approve, export.</span></div><div className="form-grid"><div className="form-field field--full"><label className="field-label">Permissions</label><textarea value={permissions} onChange={(event) => setPermissions(event.target.value)} rows={2} /></div><div className="form-field"><label className="field-label">Organization IDs (comma-separated)</label><input value={organizationIds} onChange={(event) => setOrganizationIds(event.target.value)} /></div><div className="form-field"><label className="field-label">Location IDs (comma-separated)</label><input value={locationIds} onChange={(event) => setLocationIds(event.target.value)} /></div><label className="check-field"><input type="checkbox" checked={ownRecordsOnly} onChange={(event) => setOwnRecordsOnly(event.target.checked)} /> Own records only</label></div><button className="primary">Save role</button></form>;
}

function AccessInput({ label, value, set, type = "text" }: { label: string; value: string; set: (value: string) => void; type?: string }) {
  return <div className="form-field"><label className="field-label">{label}</label><input required minLength={type === "password" ? 12 : undefined} type={type} value={value} onChange={(event) => set(event.target.value)} /></div>;
}