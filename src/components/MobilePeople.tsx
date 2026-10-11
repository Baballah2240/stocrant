import MobileIcon from "./MobileIcon";
import { useCallback, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { api } from "../api";
import { useSession } from "../session-context";
import { formatDate } from "../util";

type Overview = Awaited<ReturnType<typeof api.workspace.overview>>;
type SelfService = Awaited<ReturnType<typeof api.workspace.selfService>>;

export default function MobilePeople() {
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
    try { if (overview?.personal.attendance?.checkIn) await api.workspace.checkOut(); else await api.workspace.checkIn(); setNotice("Attendance saved."); await load(); }
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
  return <div className="page mobile-people"><header className="mobile-welcome"><div><p className="eyebrow">{management ? "People & business workspace" : "My HR workspace"}</p><h1>{tab === "Home" ? `Hello, ${user?.name.split(" ")[0] ?? "there"}` : `My ${tab.toLowerCase()}`}</h1><p className="hint">{formatDate(new Date().toISOString())} · {String(personal?.profile.jobTitle || (mainAdmin ? "Main admin" : "Employee"))}</p></div><button type="button" disabled={loading || busy} onClick={() => void load()} aria-label="Refresh workspace"><MobileIcon name="refresh" /></button></header>{error && <div className="alert alert--bad" role="alert">{error}</div>}{notice && <div className="alert alert--good" role="status">{notice}</div>}{loading && !overview && <p className="hint">Loading your workspace…</p>}{personal && <>
    {(tab === "Home" || tab === "Attendance") && !mainAdmin && <section className="card mobile-attendance"><p className="eyebrow">Today’s attendance</p><h2>{personal.attendance?.checkOut ? "Workday complete" : personal.attendance?.checkIn ? "You’re checked in" : "Ready for your workday?"}</h2><div className="mobile-time-grid"><div><span>Check in</span><strong>{String(personal.attendance?.checkIn || "—")}</strong></div><div><span>Check out</span><strong>{String(personal.attendance?.checkOut || "—")}</strong></div><div><span>Hours</span><strong>{String(personal.attendance?.hours ?? "—")}</strong></div></div><button className="primary mobile-check-button" disabled={busy || Boolean(personal.attendance?.checkOut)} onClick={() => void attendance()}>{busy ? "Saving…" : personal.attendance?.checkOut ? "Checked out" : personal.attendance?.checkIn ? "Check out" : "Check in"}</button>{personal.shift && <p className="hint">Shift: {String(personal.shift.name || "Scheduled")} · {String(personal.shift.start)}–{String(personal.shift.end)}</p>}</section>}
    {tab === "Home" && <><div className="mobile-shortcuts">{!mainAdmin && <><NavLink to="/me/leave"><span className="mobile-service-icon"><MobileIcon name="leave" /></span><strong>Time off</strong><small>{personal.pendingLeaveCount} pending requests</small></NavLink><NavLink to="/me/attendance"><span className="mobile-service-icon"><MobileIcon name="attendance" /></span><strong>Attendance</strong><small>My check-ins & hours</small></NavLink><NavLink to="/me/files"><span className="mobile-service-icon"><MobileIcon name="files" /></span><strong>My files</strong><small>Documents & policies</small></NavLink></>}{can("operations") && <NavLink to="/operations?view=mine"><span className="mobile-service-icon"><MobileIcon name="work" /></span><strong>My work</strong><small>{personal.workCount} assignments</small></NavLink>}</div><section className="card"><h2>My activities</h2>{personal.work.length ? personal.work.map((work) => <NavLink className="mobile-record" key={work.id} to="/operations?view=mine"><strong>{String(work.title)}</strong><span>{String(work.status)} · {work.dueDate ? formatDate(String(work.dueDate)) : "No deadline"}</span></NavLink>) : <p className="empty">No assigned work right now.</p>}</section>{management && <section className="card"><h2>Team & company activities</h2><p className="hint">Tools available to your role and assigned companies.</p><div className="mobile-shortcuts">{can("hr") && <NavLink to="/hr"><span className="mobile-service-icon"><MobileIcon name="people" /></span><strong>Team HR</strong><small>{overview?.activeEmployees} active employees</small></NavLink>}{can("operations") && <NavLink to="/operations"><span className="mobile-service-icon"><MobileIcon name="work" /></span><strong>Operations</strong><small>{overview?.work.overdue} overdue</small></NavLink>}{can("inventory") && <NavLink to="/inventory"><span className="mobile-service-icon"><MobileIcon name="inventory" /></span><strong>Inventory</strong><small>Stock & movements</small></NavLink>}{can("finance") && <NavLink to="/finance"><span className="mobile-service-icon"><MobileIcon name="finance" /></span><strong>Finance</strong><small>Accounts & payments</small></NavLink>}{mainAdmin && <NavLink to="/admin"><span className="mobile-service-icon"><MobileIcon name="settings" /></span><strong>Administration</strong><small>Users, permissions & approvals</small></NavLink>}</div></section>}</>}
    {tab === "Attendance" && <section className="card"><h2>Attendance history</h2>{self?.attendance.length ? self.attendance.map((record) => <div className="mobile-record" key={record.id}><strong>{formatDate(String(record.date))}</strong><span>{String(record.status)} · {String(record.checkIn || "—")}–{String(record.checkOut || "—")} · {String(record.hours ?? 0)} hours</span></div>) : <p className="empty">No attendance records yet.</p>}</section>}
    {tab === "Leave" && <section className="card"><div className="list-heading"><h2>Leave requests</h2><button className="primary" disabled={mainAdmin} onClick={() => setShowLeave((value) => !value)}>{showLeave ? "Close" : "Request leave"}</button></div>{showLeave && <form className="form mobile-leave-form" onSubmit={leave}><label className="form-field"><span>Leave type</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{["annual", "sick", "unpaid", "other"].map((type) => <option key={type}>{type}</option>)}</select></label><label className="form-field"><span>From</span><input required type="date" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} /></label><label className="form-field"><span>To</span><input required type="date" min={form.from} value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} /></label><label className="form-field"><span>Reason</span><textarea required maxLength={2000} rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label><p className="hint">Requests remain pending until the main admin reviews them. Days count calendar days.</p><button className="primary" disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button></form>}{self?.leave.length ? self.leave.map((record) => <div className="mobile-record" key={record.id}><strong>{String(record.type)} leave <span className="badge">{String(record.status)}</span></strong><span>{formatDate(String(record.from))}–{formatDate(String(record.to))} · {String(record.days)} days</span><small>{String(record.reason ?? "")}</small>{record.status === "pending" && <button type="button" disabled={busy} onClick={() => void cancel(record.id)}>Cancel request</button>}</div>) : <p className="empty">Your leave requests will appear here.</p>}</section>}
    {tab === "Files" && <section className="card"><h2>Documents & policies</h2>{self?.documents.length ? self.documents.map((file) => <div className="mobile-record" key={file.id}><strong>{String(file.title)}</strong><span>{String(file.type)}</span>{/^https?:\/\//i.test(String(file.fileUrl)) && <a href={String(file.fileUrl)} target="_blank" rel="noopener noreferrer">Open document</a>}</div>) : <p className="empty">No documents available yet.</p>}</section>}
  </>}</div>;
}
