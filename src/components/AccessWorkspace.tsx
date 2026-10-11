import { useEffect, useState } from "react";
import { NavLink, Navigate, useSearchParams } from "react-router-dom";
import { useMeta } from "../meta-context";
import { api } from "../api";
import { useSession } from "../session-context";
import { formatDate } from "../util";
import BackButton from "./BackButton";
import ServerSettings from "./ServerSettings";
import type { CollectionItem } from "../types";

type Tab = "Manage app" | "Users" | "Roles" | "Approval rules" | "Approvals" | "Audit" | "Mobile app" | "Contact inbox";
const tabs: Tab[] = ["Manage app", "Users", "Roles", "Approval rules", "Approvals", "Audit", "Mobile app", "Contact inbox"];
const ruleSections = ["organizations", "locations", "hr", "operations", "inventory", "finance", "access"];
const ruleActions = ["create", "edit", "delete"];

export default function AccessWorkspace() {
  const { entities } = useMeta();
  const { user: signedInUser } = useSession();
  const [inquiries, setInquiries] = useState<CollectionItem[]>([]);
  const [employees, setEmployees] = useState<CollectionItem[]>([]);
  const [users, setUsers] = useState<CollectionItem[]>([]);
  const [roles, setRoles] = useState<CollectionItem[]>([]);
  const [rules, setRules] = useState<CollectionItem[]>([]);
  const [approvals, setApprovals] = useState<CollectionItem[]>([]);
  const [audit, setAudit] = useState<CollectionItem[]>([]);
  const [tab, setTab] = useState<Tab>("Users");
  const [showInvite, setShowInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", employeeId: "", roleId: "role-employee", ownRecordsOnly: false });
  const [ruleForm, setRuleForm] = useState({ section: "finance", action: "create" });
  const canDirectlyEditUsers = signedInUser?.roleId === "role-main-manager";

  const load = async () => {
    try {
      const [userData, roleData, ruleData, approvalData, auditData, hrData, inquiryData] = await Promise.all([
        api.workspace.users(), api.workspace.roles(), api.workspace.approvalRules(), api.workspace.approvals(), api.workspace.audit(), api.workspace.hrCompanies(), api.public.inquiries(),
      ]);
      setInquiries(inquiryData.items); setEmployees(hrData.employees); setUsers(userData.items); setRoles(roleData.items); setRules(ruleData.items); setApprovals(approvalData.items); setAudit(auditData.items);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load access settings."); }
  };

  useEffect(() => { if (canDirectlyEditUsers) void load(); }, [canDirectlyEditUsers]);

  async function invite(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    try {
      await api.workspace.createUser({ ...form, employeeId: form.employeeId || undefined });
      setShowInvite(false);
      setForm({ name: "", email: "", password: "", employeeId: "", roleId: "role-employee", ownRecordsOnly: false });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not add employee access."); } finally { setSaving(false); }
  }

  async function updateUser(userId: string, input: Record<string, unknown>) {
    setSaving(true); setError(null);
    try { await api.workspace.updateUser(userId, input); setNotice("User details and permissions saved. Changes apply immediately."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not directly update this account."); }
    finally { setSaving(false); }
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
    try { await api.workspace.saveApprovalRule({ ...ruleForm, active: true }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not save approval rule."); }
    finally { setSaving(false); }
  }

  async function setRuleActive(rule: CollectionItem, active: boolean) {
    try { await api.workspace.updateApprovalRule(rule.id, { active }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not update approval rule."); }
  }

  async function decide(id: string, decision: "approve" | "reject") {
    try { await api.workspace.decideApproval(id, { decision }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not process approval."); }
  }

  const pendingCount = approvals.filter((request) => request.status === "pending").length;
  if (!canDirectlyEditUsers) return <Navigate to="/" replace />;
  return <div className="page"><div className="page-head"><div><BackButton /><h1>Access & Settings</h1><p className="hint">Main admin controls for companies, employees, permissions and every workspace section.</p></div>{tab === "Users" && <button className="primary" onClick={() => setShowInvite((open) => !open)}>{showInvite ? "Close" : "Add user"}</button>}</div>{error && <p className="error">{error}</p>}{notice && <div className="alert alert--good" role="status">{notice}</div>}{tab === "Users" && canDirectlyEditUsers && <p className="access-override-note"><strong>Main Manager override enabled.</strong> Account changes apply immediately, bypass approval rules, and are recorded in Audit.</p>}{tab === "Users" && !canDirectlyEditUsers && <p className="access-override-note"><strong>Read-only accounts.</strong> Only the active Main Manager can directly change user information.</p>}{showInvite && tab === "Users" && <section className="card"><form className="form" onSubmit={invite}><div className="form-grid"><label className="form-field"><span className="field-label">Link employee</span><select value={form.employeeId} onChange={(event) => { const employee = employees.find((employee) => employee.id === event.target.value); setForm({ ...form, employeeId: event.target.value, ...(employee ? { name: String(employee.name), email: String(employee.email || "") } : {}) }); }}><option value="">Standalone account</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{String(employee.name)}</option>)}</select></label><AccessInput label="Name" value={form.name} set={(name) => setForm({ ...form, name })} /><AccessInput label="Email" value={form.email} set={(email) => setForm({ ...form, email })} type="email" /><AccessInput label="Temporary password" value={form.password} set={(password) => setForm({ ...form, password })} type="password" /><div className="form-field"><label className="field-label">Role</label><select value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>{roles.map((role) => <option key={role.id} value={role.id}>{String(role.name)}</option>)}</select></div><label className="check-field"><input type="checkbox" checked={form.ownRecordsOnly} onChange={(event) => setForm({ ...form, ownRecordsOnly: event.target.checked })} /> Limit this user to their own records</label></div><button className="primary" disabled={saving}>{saving ? "Adding…" : "Add user"}</button></form></section>}<section className="card"><div className="tab-list finance-tabs">{tabs.map((option) => <button type="button" key={option} className={tab === option ? "active" : ""} onClick={() => setTab(option)}>{option}{option === "Approvals" && pendingCount ? ` (${pendingCount})` : ""}</button>)}</div>{tab === "Manage app" && <><h2>Manage companies and the app</h2><div className="hr-link-grid">{[{ to: "/organizations", label: "Companies", detail: "Add and edit company profiles" }, { to: "/stores", label: "Locations", detail: "Manage company locations" }, { to: "/hr", label: "Employees & HR", detail: "Add employees and manage HR records" }, { to: "/operations", label: "Operations", detail: "Assignments and business records" }, { to: "/inventory", label: "Inventory", detail: "Items, employee access and movements" }, { to: "/finance", label: "Finance", detail: "Accounts and financial movements" }].map((link) => <NavLink className="hr-record-link" key={link.to} to={link.to}><div><strong>{link.label}</strong><span>{link.detail}</span></div></NavLink>)}</div><h3>All records</h3><div className="hr-link-grid">{entities.filter((entity) => entity.module !== "admin").map((entity) => <NavLink className="hr-record-link" key={entity.collection} to={`/${entity.module}/${entity.collection}`}><strong>{entity.label}</strong><span>View, add and edit records</span></NavLink>)}</div><div className="inline-actions"><NavLink className="primary-link" to="/hr/employees/new">Add employee</NavLink><NavLink className="primary-link" to="/organization/companies/new">Add company</NavLink><button type="button" onClick={() => setTab("Users")}>Employee access</button></div></>}{tab === "Users" && <UsersPanel users={users} roles={roles} canDirectlyEdit={canDirectlyEditUsers} saving={saving} onSave={updateUser} />}{tab === "Roles" && <RolesPanel roles={roles} onSave={updateRole} />}{tab === "Approval rules" && <><form className="inline-form" onSubmit={addRule}><div className="form-field"><label className="field-label">Section</label><select value={ruleForm.section} onChange={(event) => setRuleForm({ ...ruleForm, section: event.target.value })}>{ruleSections.map((section) => <option key={section}>{section}</option>)}</select></div><div className="form-field"><label className="field-label">Action</label><select value={ruleForm.action} onChange={(event) => setRuleForm({ ...ruleForm, action: event.target.value })}>{ruleActions.map((action) => <option key={action}>{action}</option>)}</select></div><button className="primary" disabled={saving}>Require approval</button></form><div className="stack-list">{rules.length ? rules.map((rule) => <div className="approval-row" key={rule.id}><div><strong>{String(rule.section)} · {String(rule.action)}</strong><span>{rule.active ? "Approval required before change is applied" : "Approval not required"}</span></div><label className="switch-field"><input type="checkbox" checked={rule.active === true} onChange={(event) => void setRuleActive(rule, event.target.checked)} /> Active</label></div>) : <p className="empty">No approval rules configured.</p>}</div></>}{tab === "Approvals" && <div className="stack-list">{approvals.length ? approvals.map((request) => <div className="approval-row" key={request.id}><div><strong>{String(request.section)} · {String(request.action)}</strong><span>{String(request.requestedByName ?? request.requestedBy)} · {formatDate(String(request.requestedAt))}</span><small>{String(request.collection)} {request.targetId ? `· ${String(request.targetId)}` : ""}</small></div>{request.status === "pending" ? <div className="inline-actions"><button onClick={() => void decide(request.id, "reject")}>Reject</button><button className="primary" onClick={() => void decide(request.id, "approve")}>Approve</button></div> : <span className="badge">{String(request.status)}</span>}</div>) : <p className="empty">No approval requests.</p>}</div>}{tab === "Audit" && <div className="timeline">{audit.slice(0, 100).map((entry) => <div className="timeline-row" key={entry.id}><strong>{String(entry.action)}</strong><span>{String(entry.actorName)} · {formatDate(String(entry.occurredAt))}</span>{Array.isArray(entry.changedFields) && <small>Updated: {entry.changedFields.map(String).join(", ")}</small>}</div>)}</div>}{tab === "Contact inbox" && <section className="card"><h2>Website inquiries</h2><button onClick={() => void load()}>Refresh inbox</button>{inquiries.length ? inquiries.map(item => <article className="mobile-record" key={item.id}><strong>{String(item.name)} ? {String(item.company || "Individual")}</strong><a href={`mailto:${String(item.email)}`}>{String(item.email)}</a><small>{formatDate(String(item.createdAt))}</small><p style={{ whiteSpace: "pre-wrap" }}>{String(item.message)}</p></article>) : <p className="empty">No website inquiries yet.</p>}</section>}{tab === "Mobile app" && <ServerSettings />}</section></div>;
}

function UsersPanel({ users, roles, canDirectlyEdit, saving, onSave }: { users: CollectionItem[]; roles: CollectionItem[]; canDirectlyEdit: boolean; saving: boolean; onSave: (userId: string, input: Record<string, unknown>) => Promise<void> }) {
  return <div className="account-list">{users.map((user) => <UserAccountEditor key={user.id} user={user} roles={roles} canDirectlyEdit={canDirectlyEdit} saving={saving} onSave={onSave} />)}</div>;
}

function UserAccountEditor({ user, roles, canDirectlyEdit, saving, onSave }: { user: CollectionItem; roles: CollectionItem[]; canDirectlyEdit: boolean; saving: boolean; onSave: (userId: string, input: Record<string, unknown>) => Promise<void> }) {
  const [searchParams] = useSearchParams();
  const [open, setOpen] = useState(searchParams.get("user") === user.id);
  useEffect(() => { if (searchParams.get("user") === user.id) setOpen(true); }, [searchParams, user.id]);
  const [form, setForm] = useState({ name: String(user.name ?? ""), email: String(user.email ?? ""), password: "", roleId: String(user.roleId ?? ""), employeeId: String(user.employeeId ?? ""), organizationIds: Array.isArray(user.organizationIds) ? user.organizationIds.map(String).join(", ") : "", locationIds: Array.isArray(user.locationIds) ? user.locationIds.map(String).join(", ") : "", ownRecordsOnly: user.ownRecordsOnly === true, status: String(user.status ?? "active") });
  const [customPermissions, setCustomPermissions] = useState<string[]>(Array.isArray(user.permissions) ? user.permissions.map(String) : []);
  const [useCustomPermissions, setUseCustomPermissions] = useState(Array.isArray(user.permissions));
  const roleName = String(roles.find((role) => role.id === user.roleId)?.name ?? user.roleId);
  const save = (event: React.FormEvent) => { event.preventDefault(); void onSave(user.id, { name: form.name, email: form.email, ...(form.password ? { password: form.password } : {}), roleId: form.roleId, permissions: useCustomPermissions ? customPermissions : null, employeeId: form.employeeId || null, organizationIds: form.organizationIds.split(",").map((item) => item.trim()).filter(Boolean), locationIds: form.locationIds.split(",").map((item) => item.trim()).filter(Boolean), ownRecordsOnly: form.ownRecordsOnly, status: form.status }); };
  return <article className="account-card"><div className="account-summary"><div><strong>{String(user.name)}</strong><span>{String(user.email)}</span><small>{Array.isArray(user.permissions) ? "Custom user permissions" : "Role permissions"} | {roleName} · {user.ownRecordsOnly ? "Own records only" : "Assigned scope"}</small></div><div className="inline-actions"><span className={`badge account-status-${String(user.status)}`}>{String(user.status)}</span>{canDirectlyEdit && <button type="button" onClick={() => setOpen((value) => !value)}>{open ? "Close" : "Edit user & permissions"}</button>}</div></div>{open && canDirectlyEdit && <form className="account-editor" onSubmit={save}><div className="form-grid"><AccessInput label="Name" value={form.name} set={(name) => setForm({ ...form, name })} /><AccessInput label="Email" value={form.email} set={(email) => setForm({ ...form, email })} type="email" /><div className="form-field"><label className="field-label">Role</label><select value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>{roles.map((role) => <option key={role.id} value={role.id}>{String(role.name)}</option>)}</select></div><div className="form-field"><label className="field-label">Account status</label><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></div><AccessInput label="Linked employee ID" value={form.employeeId} set={(employeeId) => setForm({ ...form, employeeId })} optional /><AccessInput label="New password" value={form.password} set={(password) => setForm({ ...form, password })} type="password" optional /><AccessInput label="Organization IDs (comma-separated)" value={form.organizationIds} set={(organizationIds) => setForm({ ...form, organizationIds })} optional /><AccessInput label="Location IDs (comma-separated)" value={form.locationIds} set={(locationIds) => setForm({ ...form, locationIds })} optional /><label className="check-field"><input type="checkbox" checked={form.ownRecordsOnly} onChange={(event) => setForm({ ...form, ownRecordsOnly: event.target.checked })} /> Limit this user to their own records</label></div><fieldset><legend>User permissions</legend><label className="check-field"><input type="checkbox" checked={useCustomPermissions} onChange={(event) => { setUseCustomPermissions(event.target.checked); if (event.target.checked && !customPermissions.length) { const role = roles.find((role) => role.id === form.roleId); setCustomPermissions(Array.isArray(role?.permissions) ? role.permissions.map(String).filter((permission) => /^(organizations|locations|hr|operations|inventory|finance)\./.test(permission)) : []); } }} /> Choose permissions for this user (otherwise use their role)</label>{useCustomPermissions && <><div className="inline-actions"><button type="button" onClick={() => setCustomPermissions(["organizations", "locations", "hr", "operations", "inventory", "finance"].map((section) => `${section}.view`))}>View access only</button><button type="button" onClick={() => setCustomPermissions([])}>Clear permissions</button></div><div className="form-grid">{["organizations", "locations", "hr", "operations", "inventory", "finance"].map((section) => <div key={section}><strong>{section}</strong>{["view", "create", "edit", "delete", "approve", "export"].map((action) => { const permission = `${section}.${action}`; return <label className="check-field" key={permission}><input type="checkbox" checked={customPermissions.includes(permission) || customPermissions.includes(`${section}.*`)} onChange={(event) => { const expanded = customPermissions.includes(`${section}.*`) ? [...customPermissions.filter((value) => value !== `${section}.*`), ...["view", "create", "edit", "delete", "approve", "export"].map((value) => `${section}.${value}`)] : customPermissions; setCustomPermissions(event.target.checked ? [...new Set([...expanded, permission])] : expanded.filter((value) => value !== permission)); }} />{action}</label>; })}</div>)}</div></>}<p className="hint">Access &amp; Settings stays main-admin only. HR management remains main-admin only.</p></fieldset><div className="inline-actions"><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save user & permissions"}</button><span className="field-help">This action is logged in Audit.</span></div></form>}</article>;
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

function AccessInput({ label, value, set, type = "text", optional = false }: { label: string; value: string; set: (value: string) => void; type?: string; optional?: boolean }) {
  return <div className="form-field"><label className="field-label">{label}{optional ? " (optional)" : ""}</label><input required={!optional} minLength={type === "password" && value ? 12 : undefined} type={type} value={value} onChange={(event) => set(event.target.value)} /></div>;
}