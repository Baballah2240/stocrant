import { useLanguage } from "../language-context";
import { languageLocale } from "../translations";
import ChoiceSelect from "./ChoiceSelect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api";
import { useSession } from "../session-context";
import type { CollectionItem } from "../types";
import { relativeLabel } from "../util";

interface HrOverview {
  today: string;
  metrics: { totalEmployees: number; activeEmployees: number; onLeaveEmployees: number; presentEmployees: number; attendanceRecorded: number; pendingLeave: number; pendingApprovals: number };
  attendance: CollectionItem[];
  leaveRequests: CollectionItem[];
  birthdays: CollectionItem[];
  activity: CollectionItem[];
}

const recordLinks = [
  { collection: "employees", label: "Employee directory", description: "Profiles, contacts, jobs and assignments" },
  { collection: "attendance", label: "Attendance log", description: "Daily check-ins, work status and hours" },
  { collection: "leaveRequests", label: "Time off", description: "Leave requests and approval status" },
  { collection: "employeeHistory", label: "Employment history", description: "Hires, changes and employment events" },
  { collection: "departments", label: "Departments", description: "Teams, managers and cost centers" },
];

function can(permissions: string[] | undefined, section: string, action: string) {
  return Boolean(permissions?.includes("*") || permissions?.includes(`${section}.*`) || permissions?.includes(`${section}.${action}`));
}

function initials(name: unknown) {
  return String(name ?? "ST").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "ST";
}

function readable(value: unknown, fallback = "Not recorded") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function titleCase(value: unknown) {
  return String(value ?? "").split("-").filter(Boolean).map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

function StatusPill({ status }: { status: unknown }) {
  const { t } = useLanguage();
  const value = String(status ?? "unrecorded").toLowerCase().replace(/ /g, "-");
  return <span className={`hr-status hr-status--${value}`}>{t(value) === value ? t(titleCase(value)) : t(value)}</span>;
}

function MetricCard({ label, value, detail, to, tone }: { label: string; value: string | number; detail: string; to: string; tone?: "green" | "amber" | "slate" }) {
  const { t } = useLanguage();
  return <NavLink className={`hr-metric-card${tone ? ` hr-metric-card--${tone}` : ""}`} to={to}><span>{t(label)}</span><strong>{value}</strong><small>{t(detail)}</small></NavLink>;
}

function EmptyState({ message, actionTo, actionLabel }: { message: string; actionTo?: string; actionLabel?: string }) {
  const { t } = useLanguage();
  return <div className="hr-empty-state"><p>{t(message)}</p>{actionTo && actionLabel ? <NavLink to={actionTo}>{t(actionLabel)}</NavLink> : null}</div>;
}

export default function HRWorkspace() {
  const { t, language } = useLanguage();
  const { user } = useSession();
  const [companies, setCompanies] = useState<CollectionItem[]>([]);
  const [employees, setEmployees] = useState<CollectionItem[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [overview, setOverview] = useState<HrOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const main = user?.roleId === "role-main-manager";
  const canCreate = main || can(user?.permissions, "hr", "create");
  const canViewApprovals = can(user?.permissions, "approvals", "view");
  const canViewFinance = can(user?.permissions, "finance", "view");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try { const [summary, companyData] = await Promise.all([api.workspace.hrOverview(), api.workspace.hrCompanies()]); setOverview(summary); setCompanies(companyData.companies); setEmployees(companyData.employees); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load the HR overview."); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const attendanceRate = useMemo(() => {
    if (!overview?.metrics.activeEmployees) return 0;
    return Math.min(100, Math.round((overview.metrics.attendanceRecorded / overview.metrics.activeEmployees) * 100));
  }, [overview]);
  const company = companies.find((item) => item.id === companyId);
  const companyEmployees = employees.filter((item) => (item.organizationId ?? item.companyId) === companyId);
  async function removeEmployee(employee: CollectionItem) { if (!window.confirm(`Remove ${String(employee.name)}? This cannot be undone.`)) return; try { const result = await api.collections.remove("employees", employee.id); if (result.pending) setError("Removal was submitted for approval."); else await load(true); } catch (err) { setError(err instanceof Error ? err.message : "Could not remove employee."); } }
  const firstName = user?.name.split(" ")[0] || "";
  const formatDate = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? t("Not recorded") : date.toLocaleDateString(languageLocale(language), { year: "numeric", month: "short", day: "numeric" }); };

  return <div className="page hr-dashboard">
    <header className="hr-hero">
      <div><p className="eyebrow">{t("Workforce command center")}</p><h1>{t("Workforce & HR")}</h1><p>{t("Welcome back,")}{firstName}{t(". Keep people, attendance and time off in one clear view.")}</p></div>
      <div className="hr-hero-actions"><button type="button" className="ghost" onClick={() => void load(true)} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button>{canCreate ? <NavLink className="primary-link" to={companyId ? `/hr/employees/new?company=${encodeURIComponent(companyId)}` : "/hr/employees/new"}>{t("Add employee")}</NavLink> : <NavLink className="secondary-link" to="/hr/employees">{t("Open directory")}</NavLink>}</div>
    </header>

    {error ? <div className="alert alert--bad" role="alert"><div><strong>{t("HR data could not be loaded.")}</strong><p>{error}</p></div><button type="button" className="ghost" onClick={() => void load()}>{t("Try again")}</button></div> : null}
    {loading && !overview ? <div className="hr-loading-grid" aria-label={t("Loading HR overview")} aria-busy="true"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /><div className="skeleton hr-loading-panel" /><div className="skeleton hr-loading-panel" /></div> : null}

    {!loading && <section className="card"><h2>{t("Company HR")}</h2><label className="form-field"><span className="field-label">{t("Select company")}</span><ChoiceSelect value={companyId} onChange={(event) => setCompanyId(event.target.value)}><option value="">{t("Choose a company")}</option>{companies.map((item) => <option key={item.id} value={item.id}>{String(item.name)}</option>)}</ChoiceSelect></label>{company ? <><h3>{String(company.name)}</h3><div className="detail-grid">{["tradeName", "organizationType", "industry", "country", "currency", "status", "contactName", "contactEmail", "contactPhone", "taxId"].map((key) => <div className="detail-item" key={key}><span>{({ tradeName: "Trading name", organizationType: "Type", contactName: "Contact", contactEmail: "Email", contactPhone: "Phone", taxId: "Registration ID" } as Record<string, string>)[key] ?? titleCase(key)}</span><strong>{String(company[key] || "Not recorded")}</strong></div>)}</div><div className="list-heading"><h3>{t("Employees (")}{companyEmployees.length})</h3>{canCreate && <NavLink className="primary-link" to={`/hr/employees/new?company=${encodeURIComponent(companyId)}`}>{t("Add employee")}</NavLink>}</div><div className="stack-list">{companyEmployees.map((employee) => <div className="approval-row" key={employee.id}><div><strong>{String(employee.name)}</strong><span>{String(employee.jobTitle || "Employee")}  ? {String(employee.status || "")}</span></div><div className="inline-actions"><NavLink to={`/hr/employees/${employee.id}`}>{t("View")}</NavLink>{canCreate && <><NavLink to={`/hr/employees/${employee.id}/edit`}>{t("Edit")}</NavLink><button type="button" className="ghost danger" onClick={() => void removeEmployee(employee)}>{t("Remove")}</button></>}</div></div>)}</div>{!companyEmployees.length && <p className="empty">{t("No employees assigned to this company yet.")}</p>}</> : <p className="empty">{t("Select a company to see its properties and employees.")}</p>}</section>}
    {overview ? <><h2>{t("Workspace HR overview")}</h2>
      <section className="hr-metric-grid" aria-label={t("HR overview metrics")}>
        <MetricCard label={t("Team members")} value={overview.metrics.totalEmployees} detail={`${overview.metrics.activeEmployees} active`} to="/hr/employees" tone="green" />
        <MetricCard label={t("Attendance today")} value={`${overview.metrics.attendanceRecorded}/${overview.metrics.activeEmployees}`} detail={overview.metrics.activeEmployees ? `${overview.metrics.presentEmployees} present · ${attendanceRate}% recorded` : "Add employee records to begin"} to="/hr/attendance" />
        <MetricCard label={t("Pending leave")} value={overview.metrics.pendingLeave} detail={overview.metrics.pendingLeave ? "Needs review" : "No requests waiting"} to="/hr/leaveRequests" tone={overview.metrics.pendingLeave ? "amber" : "slate"} />
        <MetricCard label={t("Away from work")} value={overview.metrics.onLeaveEmployees} detail={overview.metrics.onLeaveEmployees ? "Employee profiles marked on leave" : "No employees marked on leave"} to="/hr/employees" tone="slate" />
      </section>

      {canViewApprovals && overview.metrics.pendingApprovals ? <NavLink className="hr-approval-banner" to="/admin"><span className="hr-banner-dot" aria-hidden="true" /><span><strong>{overview.metrics.pendingApprovals} {t("HR approval")}{overview.metrics.pendingApprovals === 1 ? "" : "s"} {t("awaiting action")}</strong><small>{t("Review authorized changes in Access & Settings.")}</small></span><span aria-hidden="true">→</span></NavLink> : null}

      <section className="hr-overview-grid">
        <article className="card hr-attendance-card"><div className="hr-section-heading"><div><p className="eyebrow">{t("Today ·")}{formatDate(overview.today)}</p><h2>{t("Attendance snapshot")}</h2></div><NavLink to="/hr/attendance">{t("View log")}</NavLink></div><div className="hr-attendance-summary"><strong>{attendanceRate}%</strong><span>{t("of active employees have an attendance record")}</span></div><div className="hr-progress" role="progressbar" aria-label={t("Attendance recorded")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={attendanceRate}><span style={{ width: `${attendanceRate}%` }} /></div>{overview.attendance.length ? <div className="hr-compact-list">{overview.attendance.slice(0, 4).map((record) => <div className="hr-person-row" key={record.id}><span className="hr-avatar" aria-hidden="true">{initials(record.employee)}</span><div><strong>{readable(record.employee, "Unnamed employee")}</strong><small>{record.checkIn ? `Checked in ${String(record.checkIn)}` : "No check-in time"}{record.workMode ? ` · ${titleCase(record.workMode)}` : ""}</small></div><StatusPill status={record.status} /></div>)}</div> : <EmptyState message={t("No attendance has been recorded for today.")} actionTo={canCreate ? "/hr/attendance/new" : "/hr/attendance"} actionLabel={canCreate ? "Record attendance" : "Open attendance"} />}</article>

        <article className="card"><div className="hr-section-heading"><div><p className="eyebrow">{t("Time away")}</p><h2>{t("Leave requests")}</h2></div><NavLink to="/hr/leaveRequests">{t("View all")}</NavLink></div>{overview.leaveRequests.length ? <div className="hr-compact-list">{overview.leaveRequests.map((request) => <NavLink className="hr-request-row" to={`/hr/leaveRequests/${request.id}`} key={request.id}><span className="hr-avatar hr-avatar--soft" aria-hidden="true">{initials(request.employee)}</span><div><strong>{readable(request.employee, "Unnamed employee")}</strong><small>{titleCase(request.type)} · {formatDate(String(request.from))} – {formatDate(String(request.to))}</small></div><StatusPill status={request.status} /></NavLink>)}</div> : <EmptyState message={t("There are no leave requests waiting for review.")} actionTo={canCreate ? "/hr/leaveRequests/new" : undefined} actionLabel={t("Create request")} />}</article>

        <article className="card"><div className="hr-section-heading"><div><p className="eyebrow">{t("Employee record")}</p><h2>{t("Recent updates")}</h2></div><NavLink to="/hr/employeeHistory">{t("View history")}</NavLink></div>{overview.activity.length ? <div className="hr-timeline">{overview.activity.map((entry) => <NavLink to={`/hr/employeeHistory/${entry.id}`} className="hr-timeline-row" key={entry.id}><span className="hr-timeline-marker" aria-hidden="true" /><div><strong>{readable(entry.employee, "Employee record")} · {titleCase(entry.event)}</strong><small>{readable(entry.details, "No details recorded")} · {entry.date ? relativeLabel(String(entry.date)) : "Date not recorded"}</small></div></NavLink>)}</div> : <EmptyState message={t("Updates to employee records will appear here.")} actionTo="/hr/employees" actionLabel={t("Open employees")} />}</article>

        <article className="card"><div className="hr-section-heading"><div><p className="eyebrow">{t("Celebrate")}</p><h2>{t("Upcoming birthdays")}</h2></div><span className="hr-muted">{t("Next 60 days")}</span></div>{overview.birthdays.length ? <div className="hr-compact-list">{overview.birthdays.map((employee) => <NavLink to={`/hr/employees/${employee.id}`} className="hr-birthday-row" key={employee.id}><span className="hr-avatar hr-avatar--green" aria-hidden="true">{initials(employee.name)}</span><div><strong>{readable(employee.name, "Unnamed employee")}</strong><small>{readable(employee.jobTitle, readable(employee.department, "Employee"))}</small></div><time dateTime={String(employee.birthday)}>{formatDate(String(employee.birthday))}</time></NavLink>)}</div> : <EmptyState message={t("Add birthdays to employee profiles to see upcoming celebrations.")} actionTo="/hr/employees" actionLabel={t("Open employees")} />}</article>
      </section>

      <section className="hr-library card"><div className="hr-section-heading"><div><p className="eyebrow">{t("Workforce records")}</p><h2>{t("Manage HR")}</h2></div>{canViewFinance ? <NavLink to="/finance">{t("Payroll & finance →")}</NavLink> : null}</div><div className="hr-link-grid">{recordLinks.map((link) => <NavLink className="hr-record-link" key={link.collection} to={`/hr/${link.collection}`}><div><strong>{link.label}</strong><span>{link.description}</span></div><span aria-hidden="true">→</span></NavLink>)}</div></section>
    </> : null}
  </div>;
}
