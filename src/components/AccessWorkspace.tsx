import ApprovalRuleManagement from "./ApprovalRuleManagement";
import RoleManagement from "./RoleManagement";
import AdministrationPolicy from "./AdministrationPolicy";
import ApprovalRequests from "./ApprovalRequests";
import SettingsNavigation, {SettingsOverview} from "./SettingsNavigation";
import "../administration.css";
import "../workspace-upgrade.css";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { NavLink, Navigate, useSearchParams } from "react-router-dom";
import { useMeta } from "../meta-context";
import { useSession } from "../session-context";
import { useLanguage } from "../language-context";
import { useWorkspaceTab } from "../use-workspace-tab";
import { api } from "../api";
import type { CollectionItem } from "../types";
import ChoiceSelect from "./ChoiceSelect";
import LockSettings from "./LockSettings";
import BackButton from "./BackButton";
import ServerSettings from "./ServerSettings";
import "../access-workspace.css";

type Tab = "Overview" | "Onboarding & Security" | "App lock" | "Manage app" | "Users" | "Roles" | "Approval rules" | "Approvals" | "Audit" | "Mobile app";
const allTabs: Tab[] = ["Overview", "Onboarding & Security", "Users", "Roles", "Approvals", "Approval rules", "Audit", "Manage app", "App lock", "Mobile app"];
const sections = ["shops", "organizations", "locations", "hr", "operations", "customerService", "inventory", "finance", "payroll", "access", "approvals", "audit"];
const actions = ["view", "create", "edit", "delete", "approve", "reply", "export", "pay", "configure"];
const sectionLabels: Record<string, string> = { shops: "Shops & orders", organizations: "Organizations", locations: "Locations", hr: "Workforce & HR", operations: "Operations", customerService: "Customer Service", inventory: "Inventory", finance: "Finance", payroll: "Payroll", access: "User management", approvals: "Approvals", audit: "Audit" };
const shopPermissions = ['organizations.view', 'shops.view', 'shops.create', 'shops.edit', 'shops.configure', ...['operations','inventory'].flatMap(section => ['view','create','edit','export'].map(action => section+'.'+action)), 'finance.view', 'finance.create'];
const blankForm = { companyIds: [] as string[], name: "", email: "", password: "", employeeId: "", organizationId: "", tenantOrganizationId: "", roleId: "role-employee", ownRecordsOnly: false };
const values = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];
const allows = (permissions: string[] | undefined, section: string, action: string) => Boolean(permissions?.includes("*") || permissions?.includes(`${section}.*`) || permissions?.includes(`${section}.${action}`));

export default function AccessWorkspace() {
  const { entities } = useMeta();
  const { user: actor } = useSession();
  const { t } = useLanguage();
  const main = actor?.roleId === "role-main-manager";
  const permitted = (action: string) => main || allows(actor?.permissions, "access", action);
  const canAccess = permitted("view");
  const canApprovals = main || allows(actor?.permissions,"approvals","view");
  const canView = canAccess || canApprovals;
  const canAudit = main || allows(actor?.permissions, "audit", "view");
  const visibleTabs: Tab[] = main ? allTabs : [...(canAccess ? ["Users" as Tab] : []), ...(canApprovals ? ["Approvals" as Tab] : []), ...(canAudit ? ["Audit" as Tab] : []), "App lock"];
  const [tab, setTab] = useWorkspaceTab(visibleTabs, main?"Overview":"Users");
  const [settingsQuery,setSettingsQuery]=useState("");
  const [collapsed,setCollapsed]=useState(false);
  const [departmentCount,setDepartmentCount]=useState(0);
  const [companies, setCompanies] = useState<CollectionItem[]>([]);
  const [organizations, setOrganizations] = useState<CollectionItem[]>([]);
  const [employees, setEmployees] = useState<CollectionItem[]>([]);
  const [users, setUsers] = useState<CollectionItem[]>([]);
  const [roles, setRoles] = useState<CollectionItem[]>([]);
  const [rules, setRules] = useState<CollectionItem[]>([]);
  const [approvals, setApprovals] = useState<CollectionItem[]>([]);
  const [audit, setAudit] = useState<CollectionItem[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blankForm);


  const load = useCallback(async () => {
    if (!canView) return;
    setError(null);
    try {
      const [userData, roleData, hrData, organizationData, ruleData, approvalData, auditData, departmentData] = await Promise.all([
        canAccess ? api.workspace.users() : Promise.resolve({items:[]}), canAccess ? api.workspace.roles() : Promise.resolve({items:[]}), allows(actor?.permissions,"hr","view") || main ? api.workspace.hrCompanies() : Promise.resolve({companies:[],employees:[]}),
        main || actor?.roleId === "role-organization-admin" ? api.collections.list("organizations") : Promise.resolve({ items: [] }),
        main ? api.workspace.approvalRules() : Promise.resolve({ items: [] }),
        canApprovals ? api.workspace.approvals() : Promise.resolve({ items: [] }),
        canAudit ? api.workspace.audit() : Promise.resolve({ items: [] }),
        main ? api.collections.list("departments") : Promise.resolve({items:[]}),
      ]);
      setDepartmentCount(departmentData.items.length);
      setUsers(userData.items); setRoles(roleData.items); setCompanies(hrData.companies); setEmployees(hrData.employees);
      setOrganizations(organizationData.items); setRules(ruleData.items); setApprovals(approvalData.items); setAudit(auditData.items);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load access settings."); }
    finally { setLoading(false); }
  }, [canView, canAccess, canApprovals, main, canAudit, actor?.roleId]);
  useEffect(() => { void load(); }, [load]);

  async function perform(operation: () => Promise<unknown>, message: string) {
    setSaving(true); setError(null); setNotice("");
    try { await operation(); setNotice(message); await load(); return true; }
    catch (err) { setError(err instanceof Error ? err.message : "Could not save changes."); return false; }
    finally { setSaving(false); }
  }
  async function invite(event: FormEvent) {
    event.preventDefault();
    const { organizationId, tenantOrganizationId, companyIds, ...details } = form;
    const success = await perform(() => api.workspace.createUser({ ...details, employeeId: form.employeeId || undefined,
      organizationIds: form.roleId === "role-main-manager" ? [] : form.roleId === "role-organization-admin" ? companyIds : organizationId ? [organizationId] : [],
      tenantOrganizationIds: form.roleId === "role-organization-admin" && tenantOrganizationId ? [tenantOrganizationId] : [],
    }), "User created. Access is limited to the assigned scope.");
    if (success) { setShowInvite(false); setForm(blankForm); }
  }
  const pendingCount = approvals.filter(request => request.status === "pending").length;
  const heading = tab === "Overview" ? "Review access, onboarding and pending work." : tab === "Onboarding & Security" ? "Configure secure employee onboarding and administrative approval policy." : tab === "Users" ? "Manage accounts, approvals and access within your assigned scope." : tab === "Roles" ? "Choose what each role can view and change." : tab === "Approvals" ? "Review pending changes and previous decisions." : tab === "Audit" ? "Review who changed records and when." : tab === "Approval rules" ? "Choose which changes require approval." : tab === "Mobile app" ? "Connect your mobile app to the correct server." : "Manage your workspace preferences.";
  if (!canView) return <Navigate to="/" replace />;

  return <div className="page settings-page access-workspace">
    <div className="page-head"><div><BackButton /><nav aria-label={t("Breadcrumb")}><NavLink to="/">{t("Dashboard")}</NavLink> / {t("Access & Settings")}</nav><h1>{t("Access & Settings")}</h1><p className="hint">{t("Manage users, permissions, approvals, and system configuration.")}</p>{main&&<span className="badge">{t("Super Admin")}</span>}</div>
      {tab === "Users" && permitted("create") && <button className="primary" onClick={() => setShowInvite(open => !open)} aria-expanded={showInvite}>{t(showInvite ? "Close" : "Add user")}</button>}
    </div>
    <label className="settings-search">{t("Search settings")}<input type="search" value={settingsQuery} onChange={e=>setSettingsQuery(e.target.value)}/></label>
    {error && <div className="alert alert--bad" role="alert">{t(error)} <button type="button" disabled={saving} onClick={() => void load()}>{t("Try again")}</button></div>}
    {notice && <div className="alert alert--good" role="status">{t(notice)}</div>}
    {tab === "Users" && <p className="access-override-note">{t(main ? "Super Admin controls all users, roles and companies. Changes apply immediately and are recorded in Audit." : "Your access is limited to your assigned scope. You cannot grant permissions beyond your own.")}</p>}
    {showInvite && tab === "Users" && permitted("create") && <section className="card access-invite"><h2>{t("Create user account")}</h2><p className="hint">{t("Choose a role and scope, then link an employee if needed.")}</p><form className="form" onSubmit={invite}><div className="form-grid">
      <label className="form-field"><span className="field-label">{t("Role")}</span><ChoiceSelect required value={form.roleId} onChange={event => setForm({ ...form, roleId: event.target.value, companyIds: [], employeeId: "", organizationId: "", tenantOrganizationId: "" })}>{roles.map(role => <option key={role.id} value={role.id}>{t(String(role.name))}</option>)}</ChoiceSelect></label>
      {form.roleId === "role-organization-admin" ? <label className="form-field"><span className="field-label">{t("Organization")}</span><ChoiceSelect required value={form.tenantOrganizationId} onChange={event => setForm({ ...form, tenantOrganizationId: event.target.value, companyIds: [], organizationId: "", employeeId: "" })}><option value="">{t("Choose organization")}</option>{organizations.map(org => <option key={org.id} value={org.id}>{String(org.name)}</option>)}</ChoiceSelect></label> : null}{form.roleId === "role-organization-admin" && <fieldset><legend>{t("Assigned companies")}</legend>{companies.filter(company=>company.parentOrganizationId===form.tenantOrganizationId).map(company=><label className="check-field" key={company.id}><input type="checkbox" checked={form.companyIds.includes(company.id)} onChange={event=>setForm({...form,companyIds:event.target.checked?[...form.companyIds,company.id]:form.companyIds.filter(id=>id!==company.id)})}/>{String(company.name)}</label>)}<p className="hint">{t("Unassigned companies are hidden, even when the account has management permissions.")}</p></fieldset>}{!["role-main-manager","role-organization-admin"].includes(form.roleId) && <label className="form-field"><span className="field-label">{t("Company")}</span><ChoiceSelect required value={form.organizationId} onChange={event => setForm({ ...form, organizationId: event.target.value, employeeId: "" })}><option value="">{t("Choose company")}</option>{companies.filter(company => form.roleId !== "role-organization-admin" || company.parentOrganizationId === form.tenantOrganizationId).map(company => <option key={company.id} value={company.id}>{String(company.name)}</option>)}</ChoiceSelect></label>}
      <AccessInput label={t("Name")} value={form.name} set={name => setForm({ ...form, name })} /><AccessInput label={t("Email")} value={form.email} set={email => setForm({ ...form, email })} type="email" />
      <AccessInput label={t("Temporary password")} value={form.password} set={password => setForm({ ...form, password })} type="password" />
      {form.organizationId && <label className="form-field"><span className="field-label">{t("Link employee")}</span><ChoiceSelect value={form.employeeId} onChange={event => { const employee = employees.find(row => row.id === event.target.value); setForm({ ...form, employeeId: event.target.value, ...(employee ? { name: String(employee.name), email: String(employee.email || "") } : {}) }); }}><option value="">{t("Standalone account")}</option>{employees.filter(employee => (employee.companyId || employee.organizationId) === form.organizationId).map(employee => <option key={employee.id} value={employee.id}>{String(employee.name)}</option>)}</ChoiceSelect></label>}
      <label className="check-field"><input type="checkbox" checked={form.ownRecordsOnly} onChange={event => setForm({ ...form, ownRecordsOnly: event.target.checked })} />{t("Limit this user to their own records")}</label>
    </div><p className="hint">{t("Use a unique temporary password of at least 12 characters. Share it securely.")}</p><button className="primary" disabled={saving || loading}>{t(saving ? "Adding…" : "Add user")}</button></form></section>}
    <section className="card settings-shell"><SettingsNavigation tabs={visibleTabs} active={tab} onSelect={value=>setTab(value as Tab)} query={settingsQuery} collapsed={collapsed} toggle={()=>setCollapsed(value=>!value)}/>
      <div className="settings-content"><header className="settings-content-heading"><p className="eyebrow">{t("Workspace settings")}</p><h2>{t(tab)}</h2><p className="hint">{t(heading)}</p></header>
        {loading && <><p role="status">{t("Loading…")}</p><div className="settings-loading-grid" aria-busy="true" aria-hidden="true">{Array.from({length:6},(_,index)=><div className="card" key={index}><span/><span/></div>)}</div></>}
        {tab === "Users" && !loading && <UsersPanel companies={companies} organizations={organizations} employees={employees} users={users} roles={roles} main={main} canEdit={permitted("edit")} canDelete={permitted("delete")} actorPermissions={actor?.permissions || []} saving={saving} onSave={(id, input) => perform(() => api.workspace.updateUser(id, input), "User details and permissions saved. Changes apply immediately.")} onDelete={id => perform(() => api.workspace.deleteUser(id), "User deleted and sessions revoked.")} />}
        {tab === "Overview"&&main&&!loading&&<><SettingsOverview users={users.length} roles={roles.length} companies={companies.length} departments={departmentCount} approvals={pendingCount} onSelect={value=>setTab(value as Tab)} query={settingsQuery}/><h3>{t("Recent configuration changes")}</h3><AuditPanel entries={audit.slice(0,5)}/></>}
        {tab === "Onboarding & Security"&&main&&<AdministrationPolicy/>}
        {tab === "Roles" && main && <RoleManagement onChanged={load}/>}
        {tab === "Manage app" && main && <><div className="hr-link-grid">{[{ to: "/organizations", label: "Organizations & companies", detail: "Manage your organization structure" }, { to: "/stores", label: "Locations", detail: "Manage company locations" }, { to: "/hr", label: "Employees & HR", detail: "Add employees and manage HR records" }, { to: "/operations", label: "Operations", detail: "Assignments and business records" }, { to: "/inventory", label: "Inventory", detail: "Items, employee access and movements" }, { to: "/finance", label: "Finance", detail: "Accounts and financial movements" }].map(link => <NavLink className="hr-record-link" key={link.to} to={link.to}><div><strong>{t(link.label)}</strong><span>{t(link.detail)}</span></div></NavLink>)}</div><h3>{t("All records")}</h3><div className="hr-link-grid">{entities.filter(entity => entity.module !== "admin").map(entity => <NavLink className="hr-record-link" key={entity.collection} to={`/${entity.module}/${entity.collection}`}><strong>{t(entity.label)}</strong><span>{t("View, add and edit records")}</span></NavLink>)}</div></>}
        {tab === "Approval rules" && main && <ApprovalRuleManagement rules={rules} saving={saving} onSave={(id,input)=>perform(()=>id?api.workspace.updateApprovalRule(id,input):api.workspace.saveApprovalRule(input),"Approval rule saved.")}/>}
        {tab === "Approvals" && canApprovals && !loading && <ApprovalRequests items={approvals} busy={saving} refresh={load}/>}
        {tab === "Audit" && canAudit && <AuditPanel entries={audit} />}
        {tab === "App lock" && <LockSettings />}{tab === "Mobile app" && main && <ServerSettings />}
      </div>
    </section>
  </div>;
}

interface UsersProps {
  companies: CollectionItem[]; organizations: CollectionItem[]; employees: CollectionItem[]; users: CollectionItem[]; roles: CollectionItem[];
  main: boolean; canEdit: boolean; canDelete: boolean; actorPermissions: string[]; saving: boolean;
  onSave: (id: string, input: Record<string, unknown>) => Promise<boolean>; onDelete: (id: string) => Promise<boolean>;
}
function UsersPanel(props: UsersProps) {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState(""); const [status, setStatus] = useState(""); const [companyId, setCompanyId] = useState(new URLSearchParams(window.location.search).get("company")||""); const [page, setPage] = useState(1);
  const [sort, setSort] = useState("name"); const [params] = useSearchParams(); const pageSize = 10;
  const filtered = useMemo(() => props.users.filter(user => {
    const companyNames = props.companies.filter(company => values(user.organizationIds).includes(company.id)).map(company => company.name).join(" ");
    const roleName = props.roles.find(role => role.id === user.roleId)?.name || user.roleId;
    return (!status || user.status === status) && (!companyId || values(user.organizationIds).includes(companyId)) && `${user.name} ${user.email} ${roleName} ${companyNames}`.toLocaleLowerCase(language).includes(query.trim().toLocaleLowerCase(language));
  }).sort((a, b) => sort === "newest" ? String(b.createdAt || "").localeCompare(String(a.createdAt || "")) : String(a.name).localeCompare(String(b.name), language)), [props.users, props.companies, props.roles, query, status, companyId, sort, language]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); const currentPage = Math.min(page, pages);
  useEffect(() => { const target = params.get("user"); const index = filtered.findIndex(user => user.id === target); if (index >= 0) setPage(Math.floor(index / pageSize) + 1); }, [params, filtered]);
  const pending = props.users.filter(user => user.status === "pending").length;
  return <><div className="access-metrics"><div><strong>{props.users.length}</strong><span>{t(props.main?"All platform users":"Users in scope")}</span></div><div><strong>{pending}</strong><span>{t("Pending approval")}</span></div><div><strong>{props.companies.length}</strong><span>{t("Companies")}</span></div></div>
    <div className="access-filters"><label className="form-field access-search"><span className="field-label">{t("Search users")}</span><input type="search" placeholder={t("Name, email, company or role")} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><label className="form-field"><span className="field-label">{t("Account status")}</span><ChoiceSelect value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">{t("All statuses")}</option>{["active", "invited", "pending", "suspended", "inactive", "rejected"].map(value => <option key={value} value={value}>{t(value)}</option>)}</ChoiceSelect></label><label className="form-field"><span className="field-label">{t("Company")}</span><ChoiceSelect value={companyId} onChange={event => { setCompanyId(event.target.value); setPage(1); }}><option value="">{t("All companies")}</option>{props.companies.map(company => <option key={company.id} value={company.id}>{String(company.name)}</option>)}</ChoiceSelect></label><label className="form-field"><span className="field-label">{t("Sort by")}</span><ChoiceSelect value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="name">{t("Name")}</option><option value="newest">{t("Newest first")}</option></ChoiceSelect></label></div>
    <div className="account-list">{filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(user => <UserAccountEditor key={user.id} {...props} user={user} />)}{!filtered.length && <div className="empty"><p>{t(props.users.length ? "No users match these filters." : "No users in your assigned scope.")}</p>{props.users.length > 0 && <button onClick={() => { setQuery(""); setStatus(""); setCompanyId(""); }}>{t("Clear filters")}</button>}</div>}</div>
    {filtered.length > 0 && <div className="access-pagination"><span>{t("Results")}: {filtered.length} · {t("Page")} {currentPage} / {pages}</span><div className="inline-actions"><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{t("Previous")}</button><button disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>{t("Next")}</button></div></div>}
  </>;
}

function UserAccountEditor({ user, users, companies, organizations, employees, roles, main, canEdit, canDelete, actorPermissions, saving, onSave, onDelete }: UsersProps & { user: CollectionItem }) {
  const { t } = useLanguage(); const [params] = useSearchParams(); const [open, setOpen] = useState(params.get("user") === user.id);
  useEffect(() => { if (params.get("user") === user.id) setOpen(true); }, [params, user.id]);
  const initial = () => ({ companyIds: values(user.organizationIds), username: String(user.username || ""), name: String(user.name || ""), email: String(user.email || ""), password: "", roleId: String(user.roleId || ""), employeeId: String(user.employeeId || ""), organizationId: values(user.organizationIds)[0] || "", tenantOrganizationId: values(user.tenantOrganizationIds)[0] || "", locationIds: values(user.locationIds).join(", "), ownRecordsOnly: user.ownRecordsOnly === true, status: String(user.status || "active") });
  const [form, setForm] = useState(initial);
  const [customPermissions, setCustomPermissions] = useState(values(user.permissions)); const [useCustom, setUseCustom] = useState(Array.isArray(user.permissions));
  useEffect(() => { setForm(initial()); setCustomPermissions(values(user.permissions)); setUseCustom(Array.isArray(user.permissions)); }, [user]);
  const mainAccount = user.roleId === "role-main-manager";
  const lastMain = mainAccount && user.status === "active" && users.filter(account => account.roleId === "role-main-manager" && account.status === "active").length <= 1;
  const editable = canEdit && (main || !mainAccount);
  const roleName = String(roles.find(role => role.id === user.roleId)?.name || user.roleId);
  const roleOptions = roles.some(role => role.id === form.roleId) ? roles : [{ id: form.roleId, name: roleName }, ...roles];
  const scopeName = user.roleId === "role-main-manager" ? t("All organizations") : companies.filter(company => values(user.organizationIds).includes(company.id)).map(company=>String(company.name)).join(", ") || t("Not assigned");
  const availableSections = sections.filter(section => main || actions.some(action => allows(actorPermissions, section, action)));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (form.password && !window.confirm(t("Reset this user's password and revoke their existing sessions?"))) return;
    if (["suspended", "inactive", "rejected"].includes(form.status) && user.status !== form.status && !window.confirm(t("Restrict this account? Its existing sessions will lose access immediately."))) return;
    if (mainAccount && form.roleId !== "role-main-manager" && !window.confirm(t("Remove Main Admin privileges from this account?"))) return;
    const ok = await onSave(user.id, { name: form.name, email: form.email, ...(form.username ? { username: form.username } : {}), ...(form.password ? { password: form.password } : {}), roleId: form.roleId,
      permissions: useCustom ? customPermissions : null, employeeId: form.employeeId || null,
      organizationIds: form.roleId === "role-main-manager" ? [] : form.roleId === "role-organization-admin" ? form.companyIds : form.organizationId ? [form.organizationId] : [],
      tenantOrganizationIds: form.roleId === "role-organization-admin" && form.tenantOrganizationId ? [form.tenantOrganizationId] : [],
      locationIds: form.locationIds.split(",").map(id => id.trim()).filter(Boolean), ownRecordsOnly: form.ownRecordsOnly, status: form.status });
    if (ok) setOpen(false);
  }
  function togglePermission(section: string, action: string, checked: boolean) {
    const permission = `${section}.${action}`;
    setCustomPermissions(previous => { const expanded = previous.includes(`${section}.*`) ? [...previous.filter(value => value !== `${section}.*`), ...actions.map(value => `${section}.${value}`)] : previous; return checked ? [...new Set([...expanded, permission])] : expanded.filter(value => value !== permission); });
  }
  return <article className="account-card"><div className="account-summary"><div><strong>{String(user.name)}</strong><span dir="auto">{String(user.email)}</span><small>{t("Company")}: {scopeName}</small><small>{t(roleName)} · {t(user.ownRecordsOnly ? "Own records only" : "Assigned scope")}</small></div><div className="inline-actions"><span className={`badge account-status-${String(user.status)}`}>{t(String(user.status))}</span>{editable && <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{t(open ? "Close" : "Edit user & permissions")}</button>}</div></div>
    {open && editable && <form className="account-editor" onSubmit={save}><div className="form-grid"><AccessInput label={t("Username")} value={form.username} set={username => setForm({ ...form, username })} optional />
      <AccessInput label={t("Name")} value={form.name} set={name => setForm({ ...form, name })} /><AccessInput label={t("Email")} value={form.email} set={email => setForm({ ...form, email })} type="email" />
      <label className="form-field"><span className="field-label">{t("Role")}</span><ChoiceSelect disabled={lastMain} value={form.roleId} onChange={event => setForm({ ...form, roleId: event.target.value, companyIds: [], organizationId: "", tenantOrganizationId: "", employeeId: "", locationIds: "" })}>{roleOptions.map(role => <option key={role.id} value={role.id}>{t(String(role.name))}</option>)}</ChoiceSelect></label>
      <label className="form-field"><span className="field-label">{t("Account status")}</span><ChoiceSelect disabled={lastMain} value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}>{[...(user.status === "invited" ? ["invited"] : []), "active", "suspended", "inactive", "pending", "rejected"].map(status => <option key={status} value={status}>{t(status)}</option>)}</ChoiceSelect></label>
      {form.roleId === "role-organization-admin" ? <label className="form-field"><span className="field-label">{t("Organization")}</span><ChoiceSelect required value={form.tenantOrganizationId} onChange={event => setForm({ ...form, tenantOrganizationId: event.target.value, companyIds: [], organizationId: "", employeeId: "", locationIds: "" })}><option value="">{t("Choose organization")}</option>{organizations.map(org => <option key={org.id} value={org.id}>{String(org.name)}</option>)}</ChoiceSelect></label> : null}{form.roleId === "role-organization-admin" && <fieldset><legend>{t("Assigned companies")}</legend>{companies.filter(company=>company.parentOrganizationId===form.tenantOrganizationId).map(company=><label className="check-field" key={company.id}><input type="checkbox" checked={form.companyIds.includes(company.id)} onChange={event=>setForm({...form,companyIds:event.target.checked?[...form.companyIds,company.id]:form.companyIds.filter(id=>id!==company.id)})}/>{String(company.name)}</label>)}<p className="hint">{t("Unassigned companies are hidden, even when the account has management permissions.")}</p></fieldset>}{!["role-main-manager","role-organization-admin"].includes(form.roleId) && <label className="form-field"><span className="field-label">{t("Company")}</span><ChoiceSelect required={form.status === "active"} value={form.organizationId} onChange={event => setForm({ ...form, organizationId: event.target.value, employeeId: "", locationIds: "" })}><option value="">{t("Choose company")}</option>{companies.filter(company => form.roleId !== "role-organization-admin" || company.parentOrganizationId === form.tenantOrganizationId).map(company => <option key={company.id} value={company.id}>{String(company.name)}</option>)}</ChoiceSelect></label>}
      {form.organizationId && <label className="form-field"><span className="field-label">{t("Link employee")}</span><ChoiceSelect value={form.employeeId} onChange={event => setForm({ ...form, employeeId: event.target.value })}><option value="">{t("Standalone account")}</option>{employees.filter(employee => (employee.companyId || employee.organizationId) === form.organizationId).map(employee => <option key={employee.id} value={employee.id}>{String(employee.name)}</option>)}</ChoiceSelect></label>}
      <AccessInput label={t("New password")} value={form.password} set={password => setForm({ ...form, password })} type="password" optional />
      {form.roleId !== "role-main-manager" && <AccessInput label={t("Location IDs (comma-separated)")} value={form.locationIds} set={locationIds => setForm({ ...form, locationIds })} optional />}
      <label className="check-field"><input type="checkbox" checked={form.ownRecordsOnly} onChange={event => setForm({ ...form, ownRecordsOnly: event.target.checked })} />{t("Limit this user to their own records")}</label>
    </div><fieldset className="access-permission-fieldset"><legend>{t("Permissions")}</legend><label className="check-field"><input type="checkbox" checked={useCustom} onChange={event => { setUseCustom(event.target.checked); if (event.target.checked && !customPermissions.length) setCustomPermissions(values(roles.find(role => role.id === form.roleId)?.permissions).filter(permission => main || actorPermissions.includes(permission))); }} />{t("Set individual permissions instead of role defaults")}</label>
      {useCustom && <><div className="inline-actions"><button type="button" onClick={() => setCustomPermissions(availableSections.filter(section => main || allows(actorPermissions, section, "view")).map(section => `${section}.view`))}>{t("View access only")}</button><button type="button" onClick={() => setCustomPermissions([])}>{t("Clear permissions")}</button><button type="button" disabled={!shopPermissions.every(permission => { const [section, action] = permission.split('.'); return main || allows(actorPermissions, section, action); })} onClick={() => { setForm({ ...form, ownRecordsOnly: false }); setCustomPermissions(previous => [...new Set([...previous, ...shopPermissions])]); }}>{t("Full shop access")}</button></div><div className="access-permission-grid">{availableSections.map(section => <div key={section}><strong>{t(sectionLabels[section])}</strong>{[...actions, ...(section === "customerService" && main ? ["inquiries"] : [])].filter(action => (section === "payroll" || section === "shops" && action === "configure" || !["pay","configure"].includes(action)) && (main || allows(actorPermissions, section, action))).map(action => <label className="check-field" key={action}><input type="checkbox" checked={customPermissions.includes(`${section}.${action}`) || (action !== "inquiries" && customPermissions.includes(`${section}.*`))} onChange={event => togglePermission(section, action, event.target.checked)} />{t(action)}</label>)}</div>)}</div></>}
      {main && <p className="hint">{t("Website inquiries grants platform-wide public inquiry access. Grant it only to trusted STOCRANT Customer Service staff.")}</p>}<p className="hint">{t("Permissions apply only within the assigned organization, company, locations and record ownership.")}</p></fieldset>
      {lastMain && <p className="hint">{t("The last active Main Admin cannot be suspended, deleted or demoted.")}</p>}
      <div className="inline-actions"><button className="primary" disabled={saving}>{t(saving ? "Saving…" : "Save user & permissions")}</button>{canDelete && (main || !mainAccount) && <button type="button" className="danger" disabled={saving || lastMain} onClick={() => { if (window.confirm(`${t("Delete this user and revoke all sessions?")} ${String(user.name)}`)) void onDelete(user.id); }}>{t("Delete user")}</button>}<span className="field-help">{t("Administrative actions are logged in Audit.")}</span></div>
    </form>}
  </article>;
}

function AuditPanel({ entries }: { entries: CollectionItem[] }) {
  const { t, language } = useLanguage(); const [query, setQuery] = useState(""); const [page, setPage] = useState(1); const size = 25;
  const matches = entries.filter(entry => `${entry.action} ${entry.actorName}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));
  const pages = Math.max(1, Math.ceil(matches.length / size)); const current = Math.min(page, pages);
  return <><label className="form-field"><span className="field-label">{t("Search audit history")}</span><input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder={t("Action or responsible user")} /></label><div className="timeline">{matches.slice((current - 1) * size, current * size).map(entry => <div className="timeline-row" key={entry.id}><strong>{t(String(entry.action))}</strong><span>{String(entry.actorName || "")} · {dateLabel(entry.occurredAt, language)}</span>{Array.isArray(entry.changedFields) && <small>{t("Updated")}: {entry.changedFields.map(value => t(String(value))).join(", ")}</small>}</div>)}{!matches.length && <p className="empty">{t("No audit entries match these filters.")}</p>}</div>{pages > 1 && <div className="access-pagination"><span>{t("Page")} {current} / {pages}</span><div className="inline-actions"><button disabled={current <= 1} onClick={() => setPage(current - 1)}>{t("Previous")}</button><button disabled={current >= pages} onClick={() => setPage(current + 1)}>{t("Next")}</button></div></div>}</>;
}
function dateLabel(value: unknown, language: string) { const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(language === "ar" ? "ar" : "en", { dateStyle: "medium", timeStyle: "short" }); }
function AccessInput({ label, value, set, type = "text", optional = false }: { label: string; value: string; set: (value: string) => void; type?: string; optional?: boolean }) {
  const { t } = useLanguage();
  return <label className="form-field"><span className="field-label">{t(label)}{optional ? ` (${t("optional")})` : ""}</span><input required={!optional} minLength={type === "password" && value ? 12 : undefined} maxLength={type === "password" ? 256 : type === "email" ? 160 : 160} autoComplete={type === "password" ? "new-password" : type === "email" ? "off" : undefined} type={type} dir={type === "password" || type === "email" ? "ltr" : "auto"} value={value} onChange={event => set(event.target.value)} /></label>;
}
