import { HrMessageDetails } from "./HRMessageDetails";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "../session-context";
import { api } from "../api";
import type { Notification, NotificationType } from "../types";
import { isImportantActivity, type ActionFeedback } from "../action-feedback";
import { Link } from "react-router-dom";
import BackButton from "./BackButton";
import { useLanguage } from "../language-context";

type RecentActivity = { id: string; message: string; createdAt: string; read: boolean };

interface NotificationBellProps {
  className?: string;
}

function typeLabel(type: NotificationType): string {
  if (type === "hr_message") return "Employee notification";
  if (type === "document_expiry") return "Document expiry";
  if (type === "registration_request") return "Registration";
  if (type === "message") return "Message";
  if (type === "leave_request") return "Leave request";
  if (type === "password_reset") return "Password reset";
  if (type === "overdue_work") return "Overdue";
  if (type === "low_stock") return "Low stock";
  if (type === "pending_approval") return "Approval";
  return "Access";
}

export function NotificationBell(props: NotificationBellProps) {
  const { user } = useSession();
  return <UserNotifications key={user?.id ?? "signed-out"} {...props} />;
}

function UserNotifications({ className = "" }: NotificationBellProps) {
  const { language, t } = useLanguage();
  const popupRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const detailRequest = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listScrollPosition = useRef(0);
  const { user } = useSession();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState<"all" | "requests" | "activity">("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activity, setActivity] = useState<RecentActivity[]>([]);
  const activityKey = user ? `stocrant.activity.${user.id}` : "";
  const totalUnread = unreadCount + activity.filter(item => !item.read).length;
  const needle = query.trim().toLocaleLowerCase();
  const visibleActivity = activity.filter(item => category !== "requests" && (!unreadOnly || !item.read) && (!needle || t(item.message).toLocaleLowerCase().includes(needle)));
  const visibleNotifications = notifications.filter(item => category !== "activity" && (!unreadOnly || !item.read) && (category !== "requests" || (!item.decision && ["registration_request", "leave_request", "password_reset", "pending_approval"].includes(item.type))) && (!needle || `${item.message} ${t(typeLabel(item.type))}`.toLocaleLowerCase().includes(needle))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const formatDate = (date: string) => Number.isNaN(Date.parse(date)) ? t("Date unavailable") : new Intl.DateTimeFormat(t("en-GB"), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
  function updateActivity(update: (items: RecentActivity[]) => RecentActivity[]) {
    setActivity(items => {
      const next = update(items);
      try { if (activityKey) localStorage.setItem(activityKey, JSON.stringify(next)); } catch { /* Activity still works for this session. */ }
      return next;
    });
  }
  useEffect(() => {
    let saved: RecentActivity[] = [];
    try {
      const value: unknown = JSON.parse(localStorage.getItem(activityKey) || "[]");
      if (Array.isArray(value)) saved = value.filter(item => item && typeof item.id === "string" && typeof item.message === "string" && typeof item.createdAt === "string" && typeof item.read === "boolean" && isImportantActivity(item.message)).slice(0, 50);
    } catch { /* Ignore unavailable or invalid device storage. */ }
    setActivity(saved);
    if (!activityKey) return;
    const record = (event: Event) => {
      const feedback = (event as CustomEvent<ActionFeedback>).detail;
      if (!feedback || feedback.kind !== "success" || !feedback.recordActivity || !isImportantActivity(feedback.message)) return;
      updateActivity(items => [{ id: crypto.randomUUID(), message: feedback.message, createdAt: new Date().toISOString(), read: false }, ...items].slice(0, 50));
    };
    window.addEventListener("stocrant:action", record);
    return () => window.removeEventListener("stocrant:action", record);
  }, [activityKey]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Awaited<ReturnType<typeof api.notifications.detail>> | null>(null);
  const [comment, setComment] = useState("");
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState("");
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: selected ? 0 : listScrollPosition.current, behavior: "instant" });
  }, [selected?.item.id, open, unreadOnly]);
  useLayoutEffect(() => { listScrollPosition.current = 0; scrollRef.current?.scrollTo({ top: 0, behavior: "instant" }); }, [query, category]);
  async function showDetails(id: string) {
    const requestId = ++detailRequest.current;
    listScrollPosition.current = scrollRef.current?.scrollTop ?? 0;
    setDetailBusy(true); setDetailError(""); setComment("");
    try { const detail = await api.notifications.detail(id); if (requestId !== detailRequest.current) return; setSelected(detail); await markAsRead(id); }
    catch (err) { setDetailError(err instanceof Error ? err.message : "Could not load notification."); }
    finally { if (requestId === detailRequest.current) setDetailBusy(false); }
  }
  async function removeNotification(id: string) {
    if (!window.confirm(t("Delete this notification? This cannot be undone."))) return;
    if (activity.some(item => item.id === id)) { updateActivity(items => items.filter(item => item.id !== id)); setSelected(null); return; }
    setDetailBusy(true); setDetailError("");
    try { await api.notifications.remove(id); setSelected(null); setNotifications(items => items.filter(item => item.id !== id)); setNotice("Notification deleted."); setRefreshKey(value => value + 1); }
    catch (err) { setDetailError(err instanceof Error ? err.message : "Could not delete notification."); }
    finally { setDetailBusy(false); }
  }
  async function respond(action: "approve" | "reject" | "comment") {
    if (!selected) return;
    if (action !== "comment" && !window.confirm(t(action === "approve" ? "Approve this request?" : "Reject this request?"))) return;
    setDetailBusy(true); setDetailError("");
    try { await api.notifications.respond(selected.item.id, action, comment); setSelected(await api.notifications.detail(selected.item.id)); setComment(""); setRefreshKey(value => value + 1); }
    catch (err) { setDetailError(err instanceof Error ? err.message : "Could not send response."); }
    finally { setDetailBusy(false); }
  }
  function showActivity(item: RecentActivity) {
    listScrollPosition.current = scrollRef.current?.scrollTop ?? 0;
    setDetailError("");
    setSelected({ item: { ...item, userId: user?.id ?? null, user: user?.name ?? "", type: "message", severity: "info", target: null }, details: {}, canDecide: false, canReply: false });
    updateActivity(items => items.map(current => current.id === item.id ? { ...current, read: true } : current));
  }

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    let active = true;
    const refresh = () => api.notifications
      .list()
      .then((data) => {
        if (!active) return;
        setNotifications(data.items ?? []);
        setUnreadCount(data.items?.filter((item) => !item.read).length ?? 0);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load notifications.");
        setLoading(false);
      });
    void refresh();
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, [user?.id, refreshKey]);

  useEffect(() => {
    if (!open) return;
    popupRef.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", escape);
    return () => { detailRequest.current++; document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", escape); triggerRef.current?.focus(); };
  }, [open]);

  const markAsRead = async (id: string) => {
    if (busy || notifications.find(item => item.id === id)?.read) return; setBusy(true);
    try {
      await api.notifications.markAsRead(id);
      setNotifications((prev) =>
        prev.map((item) => (item.id === id ? { ...item, read: true } : item)),
      );
      setUnreadCount((prev) => Math.max(prev - 1, 0));
    } catch {
      setError("Could not mark notification as read. Try again.");
    } finally { setBusy(false); }
  };

  const markAllRead = async () => {
    setBusy(true); try {
      await api.notifications.readAll();
      setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
      setNotice("All notifications marked as read.");
    } catch {
      setError("Could not update notifications. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className={`topbar-actions${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        ref={triggerRef}
        className="notification-trigger"
        aria-label={t("Notifications, {count} unread", { count: totalUnread })}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notifications-panel"
        onClick={() => { setSelected(null); setDetailBusy(false); setDetailError(""); setNotice(""); setOpen((value) => !value); setRefreshKey((value) => value + 1); }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {totalUnread > 0 && <span className="notification-badge">{totalUnread > 99 ? "99+" : totalUnread}</span>}
      </button>

      {open && (
        <dialog ref={popupRef} onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setOpen(false); } }}
          className="notification-panel inbox-panel"
          id="notifications-panel"
          role="dialog"
          aria-label={t("Notifications")}
        >
          <div className="notification-panel__head">
            <h2 className="notification-panel__title">{t("Notifications")} <small>{totalUnread ? t("{count} unread updates", { count: totalUnread.toLocaleString(language) }) : t("You’re all caught up")}</small></h2><button type="button" className="inbox-close" aria-label={t("Close notifications")} onClick={() => setOpen(false)}>×</button>
            <button
              type="button"
              className="button-tiny button-ghost"
              disabled={busy || !totalUnread} onClick={() => { updateActivity(items => items.map(item => ({ ...item, read: true }))); if (unreadCount) void markAllRead(); else setNotice("All notifications marked as read."); }}
            >
              {t("Mark all read")}
            </button>
          </div>

          {!selected && <div className="inbox-controls"><label className="inbox-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Search notifications")} aria-label={t("Search notifications")} /></label><div className="notification-filters" role="group" aria-label={t("Filter notifications")}><button type="button" aria-pressed={!unreadOnly && category === "all"} onClick={() => { setUnreadOnly(false); setCategory("all"); }}>{t("All")}</button><button type="button" aria-pressed={unreadOnly && category === "all"} onClick={() => { setUnreadOnly(true); setCategory("all"); }}>{t("Unread")}</button><button type="button" aria-pressed={category === "requests"} onClick={() => { setUnreadOnly(false); setCategory("requests"); }}>{t("Requests")}</button><button type="button" aria-pressed={category === "activity"} onClick={() => { setUnreadOnly(false); setCategory("activity"); }}>{t("Activity")}</button></div><div className="inbox-toolbar"><span>{t("{count} updates", { count: (visibleNotifications.length + visibleActivity.length).toLocaleString(language) })}</span><button type="button" onClick={() => setRefreshKey((value) => value + 1)}>{t("Refresh")}</button></div></div>}
          {notice && <p className="inbox-notice" role="status">{t(notice)}</p>}
          <div className="notification-panel__scroll" ref={scrollRef} tabIndex={0} role="region" aria-label={t("Notifications")}>
          {detailError && <p className="error" role="alert">{t(detailError)}</p>}
          {detailBusy && <p className="hint" role="status">{t("Please wait…")}</p>}
          {selected ? <section className="notification-detail">
            <BackButton disabled={detailBusy} onBack={() => setSelected(null)} label={t("Notifications")} />
            <h3>{selected.item.title || t(typeLabel(selected.item.type))}</h3>{selected.item.type === "hr_message" && <HrMessageDetails item={selected.item} onChange={() => void showDetails(selected.item.id)} />}<p className="notification-detail-message" dir="auto">{selected.item.message}</p><p className="notification-list__meta">{formatDate(selected.item.createdAt)}</p>
            <dl>{Object.entries(selected.details).map(([field, value]) => <div key={field}><dt>{t(field.charAt(0).toUpperCase() + field.slice(1))}</dt><dd>{String(value)}</dd></div>)}</dl>
            {selected.item.response && <p className="notification-response">{selected.item.response}</p>}
            {selected.item.type === "document_expiry" && selected.item.target?.startsWith("document:") && <Link to={`/hr/documents/${encodeURIComponent(selected.item.target.slice(9))}`} onClick={() => setOpen(false)}>{t("Open document")}</Link>}
            {user?.roleId === "role-main-manager" && <div className="notification-list__actions">
              {selected.item.type === "password_reset" && <Link to={`/admin?tab=Users&user=${encodeURIComponent(selected.item.target ?? "")}`} onClick={() => setOpen(false)}>{t("Manage password & account")}</Link>}
              {selected.item.type === "registration_request" && <Link to={`/admin?tab=Users&user=${encodeURIComponent(selected.item.target ?? "")}`} onClick={() => setOpen(false)}>{t("Manage company & permissions")}</Link>}
              {selected.item.type === "leave_request" && <Link to="/hr" onClick={() => setOpen(false)}>{t("Open workforce & HR")}</Link>}
              {selected.item.type === "low_stock" && <Link to="/warehouse" onClick={() => setOpen(false)}>{t("Manage inventory")}</Link>}
              {selected.item.type === "overdue_work" && <Link to="/operations" onClick={() => setOpen(false)}>{t("Manage work")}</Link>}
              {selected.item.type === "pending_approval" && <Link to={selected.details.collection === "documents" ? `/hr/documents/requests/${encodeURIComponent(selected.item.target || "")}` : "/admin?tab=Approvals"} onClick={() => setOpen(false)}>{t("Open approvals")}</Link>}
              {selected.item.target?.startsWith("attendance:") && <Link to="/hr/attendance" onClick={() => setOpen(false)}>{t("Open attendance")}</Link>}
              {selected.item.target?.startsWith("attendance-missing:") && <Link to="/hr/attendance" onClick={() => setOpen(false)}>{t("Review missing attendance")}</Link>}
              {selected.item.target?.startsWith("attendance-correction:") && <Link to="/hr/attendance" onClick={() => setOpen(false)}>{t("Open correction requests")}</Link>}
              {selected.item.target?.startsWith("attendance-adjustment:") && <Link to="/finance" onClick={() => setOpen(false)}>{t("Open payroll adjustments")}</Link>}
            </div>}
            {selected.canReply && <div className="notification-reply"><label className="form-field"><span>{t("Comment to sender")}</span><textarea rows={3} maxLength={2000} disabled={detailBusy} value={comment} onChange={event => setComment(event.target.value)} /></label><div className="inline-actions">{selected.canDecide && <><button className="primary" disabled={detailBusy} onClick={() => void respond("approve")}>{t("Approve")}</button><button className="danger" disabled={detailBusy} onClick={() => void respond("reject")}>{t("Reject")}</button></>}<button disabled={detailBusy || !comment.trim()} onClick={() => void respond("comment")}>{t("Send comment")}</button></div></div>}
            {selected.item.type !== "hr_message" && <button className="notification-delete" disabled={detailBusy} onClick={() => void removeNotification(selected.item.id)}>{t("Delete notification")}</button>}
          </section> : <>
          {visibleActivity.length > 0 && <section className="notification-activity"><h3>{t("My recent changes")}</h3><p className="hint">{t("Saved on this device")}</p><ul className="notification-list">{visibleActivity.map(item => <li key={item.id} className={`notification-list__item notification-list__item--${item.read ? "read" : "unread"}`}><div className="notification-list__main"><span className="notification-list__type">{t("Activity")}</span><button className="notification-message-button" disabled={detailBusy} onClick={() => showActivity(item)}>{t(item.message)}</button><p className="notification-list__meta">{formatDate(item.createdAt)}</p></div>{!item.read && <div className="notification-list__actions"><button type="button" onClick={() => updateActivity(items => items.map(current => current.id === item.id ? { ...current, read: true } : current))}>{t("Mark read")}</button></div>}</li>)}</ul></section>}
          {error ? (
            <div className="notification-panel__empty" role="alert"><p>{t(error)}</p><button type="button" onClick={() => setRefreshKey(value => value + 1)}>{t("Try again")}</button></div>
          ) : loading ? <div className="inbox-loading" role="status">{t("Loading notifications…")}<div /><div /><div /></div> : visibleNotifications.length === 0 && visibleActivity.length === 0 ? (
            <div className="notification-panel__empty inbox-empty"><span aria-hidden="true">✓</span><h3>{t(query ? "No matching notifications" : unreadOnly ? "You’re all caught up" : category === "requests" ? "No requests to review" : "No notifications yet")}</h3><p>{t(query ? "Try another search or clear your filters." : "New updates will appear here.")}</p>{(query || category !== "all" || unreadOnly) && <button type="button" onClick={() => { setQuery(""); setUnreadOnly(false); setCategory("all"); }}>{t("Clear filters")}</button>}</div>
          ) : (
            <ul className="notification-list">
              {visibleNotifications.map((notification) => (
                <li
                  key={notification.id}
                  className={`notification-list__item${
                    notification.read ? " notification-list__item--read" : " notification-list__item--unread"
                  }`}
                >
                  <div className="notification-list__main">
                    <span
                      className="notification-list__type"
                    >
                      {t(typeLabel(notification.type))}
                    </span>
                    <button className="notification-message-button" disabled={detailBusy} onClick={() => void showDetails(notification.id)}>{notification.title ? `${notification.priority === "Urgent" ? t("URGENT") + " ? " : ""}${notification.title}: ` : ""}{notification.message}</button>
                    <p className="notification-list__meta">
                      {notification.senderName ? `${notification.senderName} ? ` : ""}{notification.priority ? `${t(notification.priority)} ? ` : ""}{formatDate(notification.createdAt)}
                    </p>
                  </div>
                  <div className="notification-list__actions">
                    <button disabled={detailBusy} onClick={() => void showDetails(notification.id)}>{user?.roleId === "role-main-manager" && ["registration_request", "leave_request", "pending_approval", "password_reset"].includes(notification.type) ? t("Review & act") : t("Details")}</button>
                    {notification.type !== "hr_message" && <button disabled={detailBusy} onClick={() => void removeNotification(notification.id)}>{t("Delete")}</button>}
                    {!notification.read && <button
                      disabled={busy}
                      type="button"
                      className="button-tiny button-ghost"
                      onClick={() => void markAsRead(notification.id)}
                      aria-label="Mark as read"
                    >
                      {t("Mark read")}
                    </button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          </>}
          </div><footer className="inbox-footer"><Link to="/notifications" onClick={() => setOpen(false)}>{t("Notification history")}</Link> ? {t("Only notifications for your account are shown.")}</footer>
        </dialog>
      )}
    </div>
  );
}
