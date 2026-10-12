import { useLanguage } from "../language-context";
import MobileIcon from "./MobileIcon";
import { useCallback, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { api } from "../api";
import { useSession } from "../session-context";
import { formatDate } from "../util";

type Overview = Awaited<ReturnType<typeof api.workspace.overview>>;
type SelfService = Awaited<ReturnType<typeof api.workspace.selfService>>;

export default function MobilePeople() {
  const { t, language } = useLanguage();
  const { user } = useSession();
  const path = useLocation().pathname;
  const tab = path.endsWith("attendance") ? "Attendance" : path.endsWith("leave") ? "Leave" : path.endsWith("files") ? "Files" : "Home";
  const [overview, setOverview] = useState<Overview | null>(null);
  const [self, setSelf] = useState<SelfService | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  const [form, setForm] = useState({ type: "annual", from: "", to: "", reason: "" });
  const mainAdmin = user?.roleId === "role-main-manager";
  const management = mainAdmin || user?.roleId === "role-manager";
  const can = (section: string) => Boolean(user?.permissions.some((permission) => ["*", `${section}.*`, `${section}.view`].includes(permission)));
  const hrAllowed = can("hr");
  const load = useCallback(async () => {
    setLoading(true);
    try { const [summary, records] = await Promise.all([api.workspace.overview(), api.workspace.selfService()]); setOverview(summary); setSelf(records); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load your workspace."); }
    finally { setLoading(false); }
  }, [hrAllowed]);
  useEffect(() => { void load(); }, [load]);
  async function attendance() {
    setBusy(true); setError("");
    try { if (overview?.personal.attendance?.checkIn && !overview.personal.attendance.checkOut) await api.workspace.checkOut(); else await api.workspace.checkIn(); setNotice("Attendance saved."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not record attendance."); }
    finally { setBusy(false); }
  }
  async function leave(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api.workspace.requestLeave(form); setShowLeave(false); setForm({ type: "annual", from: "", to: "", reason: "" }); setNotice("Leave request sent to the main admin for review."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not submit leave."); }
    finally { setBusy(false); }
  }
  async function cancel(id: string) {
    setBusy(true);
    try { await api.workspace.cancelLeave(id); setNotice("Request cancelled."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not cancel request."); }
    finally { setBusy(false); }
  }
  const personal = overview?.personal;
  const checkedIn = Boolean(personal?.attendance?.checkIn && !personal.attendance.checkOut);
  const sessionCount = Number(personal?.attendance?.sessionCount ?? (personal?.attendance?.checkIn ? 1 : 0));
  const dayComplete = sessionCount >= 3 && !checkedIn;
  return <div className="page mobile-people"><header className="mobile-welcome"><div><p className="eyebrow">{management ? "People & business workspace" : "My HR workspace"}</p><h1>{tab === "Home" ? `Hello, ${user?.name.split(" ")[0] ?? "there"}` : `My ${tab.toLowerCase()}`}</h1><p className="hint">{formatDate(new Date().toISOString())} · {String(personal?.profile.jobTitle || (mainAdmin ? "Main admin" : "Employee"))}</p></div><button className="mobile-refresh-button" type="button" disabled={loading || busy} onClick={() => void load()} aria-label={loading ? "Refreshing workspace" : "Refresh workspace"} aria-busy={loading} title={loading ? "Refreshing…" : "Refresh workspace"}><MobileIcon name="refresh" /></button></header>{error && <div className="alert alert--bad" role="alert">{error}</div>}{notice && <div className="alert alert--good" role="status">{notice}</div>}{loading && !overview && <p className="hint">Loading your workspace…</p>}{personal && <>
    {(tab === "Home" || tab === "Attendance") && !mainAdmin && <section className="card mobile-attendance"><p className="eyebrow">Today’s attendance</p><h2>{personal.attendance?.checkOut ? "Workday complete" : personal.attendance?.checkIn ? "You’re checked in" : "Ready for your workday?"}</h2><div className="mobile-time-grid"><div><span>{t("Check in")}</span><strong>{String(personal.attendance?.checkIn || "—")}</strong></div><div><span>{t("Check out")}</span><strong>{String(personal.attendance?.checkOut || "—")}</strong></div><div><span>{t("Hours")}</span><strong>{String(personal.attendance?.hours ?? "—")}</strong></div></div><button className={`primary mobile-check-button ${checkedIn ? "attendance-checkout" : "attendance-checkin"}`} disabled={busy || dayComplete} onClick={() => void attendance()}>{busy ? "Saving…" : dayComplete ? "Daily limit reached" : checkedIn ? "Check out" : "Check in"}</button><p className="hint">{sessionCount} / 3 {language === "ar" ? "????? ?????" : "sessions today"}</p>{personal.shift && <p className="hint">Shift: {String(personal.shift.name || "Scheduled")} · {String(personal.shift.start)}–{String(personal.shift.end)}</p>}</section>}
    {tab === "Home" && <><div className="mobile-shortcuts">{!mainAdmin && <><NavLink to="/me/leave"><span className="mobile-service-icon"><MobileIcon name="leave" /></span><strong>{t("Time off")}</strong><small>{personal.pendingLeaveCount} pending requests</small></NavLink><NavLink to="/me/attendance"><span className="mobile-service-icon"><MobileIcon name="attendance" /></span><strong>{t("Attendance")}</strong><small>{t("My check-ins & hours")}</small></NavLink><NavLink to="/me/files"><span className="mobile-service-icon"><MobileIcon name="files" /></span><strong>{t("My files")}</strong><small>{t("Documents & policies")}</small></NavLink></>}{can("operations") && <NavLink to="/operations?view=mine"><span className="mobile-service-icon"><MobileIcon name="work" /></span><strong>{t("My work")}</strong><small>{personal.workCount} assignments</small></NavLink>}</div><section className="card"><h2>{t("My activities")}</h2>{personal.work.length ? personal.work.map((work) => <NavLink className="mobile-record" key={work.id} to="/operations?view=mine"><strong>{String(work.title)}</strong><span>{String(work.status)} · {work.dueDate ? formatDate(String(work.dueDate)) : "No deadline"}</span></NavLink>) : <p className="empty">{t("No assigned work right now.")}</p>}</section>{management && <section className="card"><h2>{t("Team & company activities")}</h2><p className="hint">{t("Tools available to your role and assigned companies.")}</p><div className="mobile-shortcuts">{can("hr") && <NavLink to="/hr"><span className="mobile-service-icon"><MobileIcon name="people" /></span><strong>{t("Team HR")}</strong><small>{overview?.activeEmployees} active employees</small></NavLink>}{can("operations") && <NavLink to="/operations"><span className="mobile-service-icon"><MobileIcon name="work" /></span><strong>{t("Operations")}</strong><small>{overview?.work.overdue} overdue</small></NavLink>}{can("inventory") && <NavLink to="/inventory"><span className="mobile-service-icon"><MobileIcon name="inventory" /></span><strong>{t("Inventory")}</strong><small>{t("Stock & movements")}</small></NavLink>}{can("finance") && <NavLink to="/finance"><span className="mobile-service-icon"><MobileIcon name="finance" /></span><strong>{t("Finance")}</strong><small>{t("Accounts & payments")}</small></NavLink>}{mainAdmin && <NavLink to="/admin"><span className="mobile-service-icon"><MobileIcon name="settings" /></span><strong>{t("Administration")}</strong><small>{t("Users, permissions & approvals")}</small></NavLink>}</div></section>}</>}
    {tab === "Attendance" && <section className="card"><h2>{t("Attendance history")}</h2>{self?.attendance.length ? self.attendance.map((record) => <div className="mobile-record" key={record.id}><strong>{formatDate(String(record.date))}</strong><span>{String(record.status)} · {String(record.checkIn || "—")}–{String(record.checkOut || "—")} · {String(record.hours ?? 0)} hours</span></div>) : <p className="empty">{t("No attendance records yet.")}</p>}</section>}
    {tab === "Leave" && <section className="card"><div className="list-heading"><h2>{t("Leave requests")}</h2><button className="primary" disabled={mainAdmin} onClick={() => setShowLeave((value) => !value)}>{showLeave ? "Close" : "Request leave"}</button></div>{showLeave && <form className="form mobile-leave-form" onSubmit={leave}><label className="form-field"><span>{t("Leave type")}</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{["annual", "sick", "unpaid", "other"].map((type) => <option key={type}>{type}</option>)}</select></label><label className="form-field"><span>{t("From")}</span><input required type="date" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} /></label><label className="form-field"><span>{t("To")}</span><input required type="date" min={form.from} value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} /></label><label className="form-field"><span>{t("Reason")}</span><textarea required maxLength={2000} rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label><p className="hint">{t("Requests remain pending until the main admin reviews them. Days count calendar days.")}</p><button className="primary" disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button></form>}{self?.leave.length ? self.leave.map((record) => <div className="mobile-record" key={record.id}><strong>{String(record.type)} leave <span className="badge">{String(record.status)}</span></strong><span>{formatDate(String(record.from))}–{formatDate(String(record.to))} · {String(record.days)} days</span><small>{String(record.reason ?? "")}</small>{record.status === "pending" && <button type="button" disabled={busy} onClick={() => void cancel(record.id)}>{t("Cancel request")}</button>}</div>) : <p className="empty">{t("Your leave requests will appear here.")}</p>}</section>}
    {tab === "Files" && <section className="card"><h2>{t("Documents & policies")}</h2>{self?.documents.length ? self.documents.map((file) => <div className="mobile-record" key={file.id}><strong>{String(file.title)}</strong><span>{String(file.type)}</span>{/^https?:\/\//i.test(String(file.fileUrl)) && <a href={String(file.fileUrl)} target="_blank" rel="noopener noreferrer">{t("Open document")}</a>}</div>) : <p className="empty">{t("No documents available yet.")}</p>}</section>}
  </>}</div>;
}
