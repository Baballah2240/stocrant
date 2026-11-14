import CustomizableDashboard, { DashboardWidget } from "./CustomizableDashboard";
import ManagerPersonalNotes from "./ManagerPersonalNotes";
import { hasManagerDashboard } from "../manager-role";
import PersonalAttendance from "./PersonalAttendance";
import WorkActivityDashboard, { type DashboardPeriod } from "./WorkActivityDashboard";
import PersonalAssignment from "./PersonalAssignment";
import AnalyticsWorkspace from "./AnalyticsWorkspace";
import { useSession } from "../session-context";
import { languageLocale } from "../translations";
import { useLanguage } from "../language-context";
import { useEffect, useRef, useState, type TouchEvent } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api";
import { formatDate, relativeLabel } from "../util";
import type { CollectionItem, Notification } from "../types";

interface PersonalProfile { name: string; email: string; employeeCode?: unknown; jobTitle?: unknown; department?: unknown; location?: unknown; employmentStatus?: unknown; manager?: unknown; [key:string]:unknown; }
interface Attendance { sessionCount?: number; date?: unknown; status?: unknown; checkIn?: unknown; checkOut?: unknown; workMode?: unknown; hours?: unknown; }
interface Shift { name?: unknown; start?: unknown; end?: unknown; days?: unknown; breakMinutes?: unknown; }
interface PolicyUpdate { id: string; title: string; publishedAt: string; fileUrl: string; isNew: boolean; }
interface Overview { organizations: number; locations: number; activeEmployees: number; work: { total: number; overdue: number }; inventory: { lowStockCount: number }; finance: { net: number | null }; pendingApprovals: number; personal: { registered: boolean; attendanceEnabled: boolean; profile: PersonalProfile; lastLoginAt?: unknown; attendance: Attendance | null; shift: Shift | null; leave: CollectionItem[]; pendingLeaveCount: number; work: CollectionItem[]; workCount: number; overdueWorkCount: number; notifications: Notification[]; unreadNotificationCount: number; policyUpdates: PolicyUpdate[]; newPolicyCount: number; }; }

export default function WorkspaceDashboard() {
  const { t, language } = useLanguage();
  const { user } = useSession();
  const manager = hasManagerDashboard(user?.roleId);
  const can = (section: string) => Boolean(user?.permissions.some(p => ["*", `${section}.*`, `${section}.view`].includes(p)));
  const [period, setPeriod] = useState<DashboardPeriod>();
  const [activityRefresh, setActivityRefresh] = useState(0);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullStartY = useRef<number | null>(null);
  const currentPullDistance = useRef(0);
  const load = async () => {
    try { setOverview(await api.workspace.overview()); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load workspace."); }
  };
  useEffect(() => { void load(); }, []);

  const refreshDashboard = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await load(); setActivityRefresh(v => v + 1); } finally { setRefreshing(false); }
  };
  const startPull = (event: TouchEvent<HTMLDivElement>) => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
    if (scrollTop > 0) return;
    pullStartY.current = event.touches[0]?.clientY ?? null;
    currentPullDistance.current = 0;
  };
  const movePull = (event: TouchEvent<HTMLDivElement>) => {
    if (pullStartY.current === null || refreshing) return;
    const distance = Math.max(0, (event.touches[0]?.clientY ?? pullStartY.current) - pullStartY.current);
    const limitedDistance = Math.min(distance, 96);
    currentPullDistance.current = limitedDistance;
    setPullDistance(limitedDistance);
  };
  const finishPull = () => {
    const shouldRefresh = currentPullDistance.current >= 72;
    pullStartY.current = null;
    currentPullDistance.current = 0;
    setPullDistance(0);
    if (shouldRefresh) void refreshDashboard();
  };
  if (error) return <div className="page"><p className="error">{t(error)}</p><button onClick={() => void load()}>{t("Try again")}</button></div>;
  if (!overview) return <div className="page"><p className="hint">{t("Loading your workday…")}</p></div>;
  const { personal } = overview;
  const money = overview.finance.net===null?t("View by currency"):new Intl.NumberFormat(languageLocale(language), { maximumFractionDigits: 0 }).format(overview.finance.net);
  const profileTitle = [personal.profile.jobTitle, personal.profile.department].filter((value) => typeof value === "string" && value).join(" · ") || t(manager ? "Manager" : "Team member");
  return <div className="page personal-dashboard" onTouchStart={startPull} onTouchMove={movePull} onTouchEnd={finishPull} onTouchCancel={finishPull}><div className={`dashboard-pull-indicator${pullDistance > 0 || refreshing ? " is-visible" : ""}${refreshing ? " is-refreshing" : ""}`} style={{ height: refreshing ? "38px" : `${pullDistance}px` }} aria-live="polite"><span>{refreshing ? t("Updating your workday…") : pullDistance >= 72 ? t("Release to update") : t("Pull down to update")}</span></div><header className="personal-hero"><div><p className="eyebrow">{t("My workday")}</p><h1>{t("Dashboard")}</h1><p>{t("Good day,")} {personal.profile.name.split(" ")[0] || personal.profile.name} · {profileTitle}</p></div>{personal.attendanceEnabled ? <NavLink to="/me/attendance" className="secondary-link">{t("Attendance history")}</NavLink> : <p className="attendance-unavailable">{t(user?.roleId === "role-main-manager" ? "Attendance is not required for the Main Admin account." : "Link an employee profile to use attendance.")}</p>}</header><CustomizableDashboard key={user?.id} enabled={manager}><DashboardWidget id="profile" title="My profile"><section className="profile-strip card"><div className="profile-avatar" aria-hidden="true">{initials(personal.profile.name)}</div><div className="profile-strip-details"><strong>{personal.profile.name}</strong><span>{personal.profile.email}</span><small>{stringValue(personal.profile.employeeCode, "Employee profile not linked")}{personal.profile.location ? ` · ${String(personal.profile.location)}` : ""}</small></div><div className="login-detail"><span>{t("Signed in for")}</span><strong><SessionDuration startedAt={personal.lastLoginAt} /></strong><small>{t("Started")} {dateTime(personal.lastLoginAt)}</small></div></section></DashboardWidget>
<DashboardWidget id="notes" available={manager} title="My private notes and reminders">{manager && <ManagerPersonalNotes />}</DashboardWidget>
<DashboardWidget id="attendance" available={personal.attendanceEnabled} title="Attendance" wide>{personal.attendanceEnabled&&<PersonalAttendance onChanged={()=>void load()}/>}</DashboardWidget>
<DashboardWidget id="activity" title="Work Activity" wide><WorkActivityDashboard key={`activity:${user?.id}`} onPeriod={setPeriod} refresh={activityRefresh}/></DashboardWidget>
<DashboardWidget id="summary" title="Workday summary" wide><div className="personal-summary-grid"><SummaryCard label={t("My work")} value={personal.workCount} detail={personal.overdueWorkCount ? t("{count} overdue", { count: personal.overdueWorkCount }) : "Up to date"} to="/operations?view=mine" tone={personal.overdueWorkCount ? "danger" : undefined} /><SummaryCard label={t("My leave")} value={personal.pendingLeaveCount} detail={personal.pendingLeaveCount ? "Waiting for decision" : "No pending requests"} to="/me/leave" /><SummaryCard label={t("Updates")} value={personal.unreadNotificationCount} detail={personal.unreadNotificationCount ? "Need your attention" : "All caught up"} to="/notifications" tone={personal.unreadNotificationCount ? "warning" : undefined} /><SummaryCard label={t("Policies")} value={personal.newPolicyCount} detail={personal.newPolicyCount ? "New since last sign-in" : "No new policies"} to="/hr/documents" /></div></DashboardWidget>
<DashboardWidget id="today" title="Today"><section className="card dashboard-section"><SectionHeading title={t("Today")} linkTo={can("hr") ? "/hr/attendance" : "/me/attendance"} linkLabel={t("Attendance")} /><div className="today-grid"><InfoBlock label={t("Attendance")} value={personal.attendance ? titleCase(personal.attendance.status ?? "Recorded") : "Not recorded"} detail={attendanceDetail(personal.attendance)} /><InfoBlock label={t("Shift")} value={personal.shift ? stringValue(personal.shift.name, "Scheduled shift") : "No shift assigned"} detail={personal.shift ? `${stringValue(personal.shift.start, "—")} – ${stringValue(personal.shift.end, "—")}` : "Contact your manager"} /><InfoBlock label={t("Leave")} value={personal.pendingLeaveCount ? t("{count} pending", { count: personal.pendingLeaveCount }) : "Clear"} detail={personal.leave[0] ? `${stringValue(personal.leave[0].type, "Leave")} · ${stringValue(personal.leave[0].status, "Submitted")}` : "No current request"} /></div></section></DashboardWidget>
<DashboardWidget id="tasks" title="My tasks"><section className="card dashboard-section"><SectionHeading title={t("My tasks")} linkTo="/operations?view=mine" linkLabel={t("View all")} />{personal.work.length ? <div className="dashboard-list">{personal.work.slice(0, 4).map((item) => <NavLink className="dashboard-row" key={item.id} to={`/operations/work/${item.id}`}><div><strong>{stringValue(item.title, stringValue(item.name, "Work item"))}</strong><span>{item.dueDate ? `Due ${relativeLabel(String(item.dueDate))}` : stringValue(item.assignee, "Assigned to you")}</span></div><span className={`work-status ${statusClass(item.status)}`}>{titleCase(item.status ?? "Open")}</span></NavLink>)}</div> : <EmptyState text="No assigned work right now." actionTo="/operations" actionLabel={t("Open operations")} />}</section></DashboardWidget>
<DashboardWidget id="notifications" title="Notifications"><section className="card dashboard-section"><SectionHeading title={t("Notifications")} linkTo="/notifications" linkLabel={t("Open")} />{personal.notifications.length ? <div className="dashboard-list">{personal.notifications.slice(0, 4).map((notification) => <div className="dashboard-row notification-row" key={notification.id}><span className={`notification-dot ${notification.severity}`}></span><div><strong>{notification.message}</strong><span>{relativeLabel(notification.createdAt)}</span></div>{!notification.read && <span className="new-pill">{t("New")}</span>}</div>)}</div> : <EmptyState text="You are all caught up." />}</section></DashboardWidget>
<DashboardWidget id="policies" title="Policy updates"><section className="card dashboard-section" id="policies"><SectionHeading title={t("Policy updates")} linkTo="/hr/documents" linkLabel={t("Open documents")} />{personal.policyUpdates.length ? <div className="dashboard-list">{personal.policyUpdates.slice(0, 4).map((policy) => <PolicyRow key={policy.id} policy={policy} />)}</div> : <EmptyState text="No company policy updates since your last sign-in." actionTo="/hr/documents" actionLabel={t("Browse documents")} />}</section></DashboardWidget>
<DashboardWidget id="assignment" available={[personal.profile.department, personal.profile.section, personal.profile.manager].some(value => typeof value === "string" && Boolean(value))} title="My assignment" wide><PersonalAssignment profile={personal.profile}/></DashboardWidget>
<DashboardWidget id="analytics" title="Analytics" wide>{period&&<AnalyticsWorkspace key={`analytics:${user?.id}`} dashboardPeriod={period}/>}</DashboardWidget>
<DashboardWidget id="shortcuts" title="Company tools" available={manager} wide><section className="card"><h2>{t("Company tools")}</h2><nav className="dashboard-company-tools" aria-label={t("Company tools")}>{[{section:"organizations",to:"/organizations",label:"Companies"},{section:"hr",to:"/hr",label:"Workforce & HR"},{section:"inventory",to:"/shops",label:"Shops & orders"},{section:"finance",to:"/finance",label:"Finance"},{section:"payroll",to:"/hr/payroll",label:"Payroll"},{section:"access",to:"/admin?tab=Users",label:"User management"}].filter(item=>can(item.section)).map(item=><NavLink key={item.to} to={item.to}>{t(item.label)}<span aria-hidden="true">&#8599;</span></NavLink>)}</nav></section></DashboardWidget><DashboardWidget id="management" available={["organizations", "locations", "hr", "operations", "inventory", "finance", "approvals"].some(can)} title="Management overview" wide><section className="manager-dashboard">{["organizations", "locations", "hr", "operations", "inventory", "finance", "approvals"].some(can) && <><header className="management-title"><div><p className="eyebrow">{t("Business workspace")}</p><h2>{t("Management overview")}</h2><p className="hint">{t("Your people, operations and finances at a glance.")}</p></div><button type="button" disabled={refreshing} onClick={() => void refreshDashboard()}>{t(refreshing ? "Refreshing\u2026" : "Refresh")}</button></header><div className="dashboard-grid">{can("locations") && <Metric label={t("Locations")} value={overview.locations} to="/locations" />}{can("operations") && <Metric label={t("All work")} value={overview.work.total} to="/operations" tone={overview.work.overdue ? "danger" : undefined} />}{can("inventory") && <Metric label={t("Low stock")} value={overview.inventory.lowStockCount} to="/warehouse" tone={overview.inventory.lowStockCount ? "warning" : undefined} />}{can("finance") && <Metric label={t("Net finance")} value={money} to="/finance" />}</div><div className="management-panels">{can("operations") && <section className="card management-work"><div className="section-heading"><h2>{t("Workload overview")}</h2><NavLink to="/operations">{t("View all")}</NavLink></div><div className="workload-total"><strong>{overview.work.total}</strong><span>{t("Work items")}</span></div><div className="workload-bar" role="img" aria-label={t("{overdue} overdue of {total} work items", { overdue: overview.work.overdue, total: overview.work.total })}><span style={{ width: overview.work.total ? Math.min(100, overview.work.overdue / overview.work.total * 100) + "%" : "0%" }} /></div><div className="workload-legend"><span>{t("Overdue")}: {overview.work.overdue}</span><span>{t("Total")}: {overview.work.total}</span></div></section>}<section className="card management-priorities"><h2>{t("Needs attention")}</h2>{can("approvals") && <NavLink to="/admin"><span>{t("Pending approvals")}</span><strong>{overview.pendingApprovals}</strong></NavLink>}{can("inventory") && <NavLink to="/warehouse"><span>{t("Low-stock alerts")}</span><strong>{overview.inventory.lowStockCount}</strong></NavLink>}{can("operations") && <NavLink to="/operations?view=overdue"><span>{t("Overdue work")}</span><strong>{overview.work.overdue}</strong></NavLink>}<small>{t("Live data within your access scope")}</small></section></div></>}</section></DashboardWidget></CustomizableDashboard></div>;
}

function SummaryCard({ label, value, detail, to, tone }: { label: string; value: number; detail: string; to: string; tone?: "danger" | "warning" }) { const { t } = useLanguage(); return <NavLink className="card personal-summary-card" to={to}><span>{t(label)}</span><strong className={tone ? `metric-${tone}` : ""}>{value}</strong><small>{t(detail)}</small></NavLink>; }
function SectionHeading({ title, linkTo, linkLabel }: { title: string; linkTo: string; linkLabel: string }) { const { t } = useLanguage(); return <div className="section-heading"><h2>{t(title)}</h2><NavLink to={linkTo}>{t(linkLabel)}</NavLink></div>; }
function InfoBlock({ label, value, detail }: { label: string; value: string; detail: string }) { const { t } = useLanguage(); return <div className="today-info"><span>{t(label)}</span><strong>{value}</strong>{detail && <small>{t(detail)}</small>}</div>; }
function EmptyState({ text, actionTo, actionLabel }: { text: string; actionTo?: string; actionLabel?: string }) { const { t } = useLanguage(); return <div className="dashboard-empty"><p>{t(text)}</p>{actionTo && actionLabel && <NavLink className="secondary-link" to={actionTo}>{t(actionLabel)}</NavLink>}</div>; }
function PolicyRow({ policy }: { policy: PolicyUpdate }) {
  const { t } = useLanguage();
  return <NavLink className="dashboard-row" to={"/hr/documents/" + encodeURIComponent(policy.id)}><div><strong>{policy.title}</strong><span>{policy.publishedAt ? t("Published {date}", { date: formatDate(policy.publishedAt) }) : t("Publication date not recorded")}</span></div>{policy.isNew && <span className="new-pill">{t("New")}</span>}</NavLink>;
}
function SessionDuration({ startedAt }: { startedAt: unknown }) {
  const [clock, setClock] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return <>{sessionElapsed(startedAt, clock)}</>;
}

function Metric({ label, value, to, tone }: { label: string; value: string | number; to: string; tone?: "danger" | "warning" }) {
  const { t } = useLanguage(); return <NavLink className="card metric-card hoverable" to={to}><span>{t(label)}</span><strong className={tone ? `metric-${tone}` : ""}>{value}</strong><small>{t("Open")}</small></NavLink>; }
function initials(name: string) { return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "ST"; }
function titleCase(value: unknown) { return String(value ?? "").split("-").join(" ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function stringValue(value: unknown, fallback = "—") { return typeof value === "string" && value.trim() ? value : fallback; }
function dateTime(value: unknown) { if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return "Not available"; return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
function sessionElapsed(value: unknown, now: number) { const started = typeof value === "string" ? Date.parse(value) : Number.NaN; if (Number.isNaN(started)) return "Not available"; const seconds = Math.max(0, Math.floor((now - started) / 1000)); const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); const remainingSeconds = seconds % 60; return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, "0")).join(":"); }
function attendanceDayLabel(value: unknown) { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ""; const [year, month, day] = value.split("-").map(Number); const date = new Date(year, (month || 1) - 1, day || 1); if (Number.isNaN(date.getTime())) return ""; const label = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); return date.toDateString() === new Date().toDateString() ? `Today · ${label}` : label; }
function attendanceDetail(attendance: Attendance | null) { if (!attendance) return "Record your work status with HR"; const checkIn = stringValue(attendance.checkIn, ""); const checkOut = stringValue(attendance.checkOut, ""); const times = [checkIn, checkOut].filter(Boolean).join(" – "); const details = [times, attendance.workMode ? titleCase(attendance.workMode) : "", attendance.hours ? `${attendance.hours}h` : ""].filter(Boolean).join(" · "); const day = attendanceDayLabel(attendance.date); return [day, details].filter(Boolean).join(" · "); }
function statusClass(value: unknown) { return String(value ?? "").toLowerCase().split(" ").join("-"); }
