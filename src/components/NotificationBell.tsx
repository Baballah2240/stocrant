import { useEffect, useRef, useState } from "react";
import { useSession } from "../session-context";
import { api } from "../api";
import { relativeLabel as formatDate } from "../util";
import type { Notification, NotificationType } from "../types";
import type { ActionFeedback } from "../action-feedback";
import { useLanguage } from "../language-context";

type RecentActivity = { id: string; message: string; createdAt: string; read: boolean };

interface NotificationBellProps {
  className?: string;
}

function typeLabel(type: NotificationType): string {
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
  const { user } = useSession();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activity, setActivity] = useState<RecentActivity[]>([]);
  const activityKey = user ? `stocrant.activity.${user.id}` : "";
  const totalUnread = unreadCount + activity.filter(item => !item.read).length;
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
      if (Array.isArray(value)) saved = value.filter(item => item && typeof item.id === "string" && typeof item.message === "string" && typeof item.createdAt === "string" && typeof item.read === "boolean").slice(0, 50);
    } catch { /* Ignore unavailable or invalid device storage. */ }
    setActivity(saved);
    if (!activityKey) return;
    const record = (event: Event) => {
      const feedback = (event as CustomEvent<ActionFeedback>).detail;
      if (!feedback || feedback.kind !== "success" || /^(Signed |Notification marked|All notifications marked)/.test(feedback.message)) return;
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
  async function showDetails(id: string) {
    setDetailBusy(true); setDetailError(""); setComment("");
    try { setSelected(await api.notifications.detail(id)); await markAsRead(id); }
    catch (err) { setDetailError(err instanceof Error ? err.message : "Could not load notification."); }
    finally { setDetailBusy(false); }
  }
  async function removeNotification(id: string) {
    if (activity.some(item => item.id === id)) { updateActivity(items => items.filter(item => item.id !== id)); setSelected(null); return; }
    setDetailBusy(true); setDetailError("");
    try { await api.notifications.remove(id); setSelected(null); setNotifications(items => items.filter(item => item.id !== id)); setRefreshKey(value => value + 1); }
    catch (err) { setDetailError(err instanceof Error ? err.message : "Could not delete notification."); }
    finally { setDetailBusy(false); }
  }
  async function respond(action: "approve" | "reject" | "comment") {
    if (!selected) return;
    setDetailBusy(true); setDetailError("");
    try { await api.notifications.respond(selected.item.id, action, comment); setSelected(await api.notifications.detail(selected.item.id)); setComment(""); setRefreshKey(value => value + 1); }
    catch (err) { setDetailError(err instanceof Error ? err.message : "Could not send response."); }
    finally { setDetailBusy(false); }
  }
  function showActivity(item: RecentActivity) {
    setDetailError("");
    setSelected({ item: { ...item, userId: user?.id ?? null, user: user?.name ?? "", type: "message", severity: "info", target: null }, details: {}, canDecide: false, canReply: false });
    updateActivity(items => items.map(current => current.id === item.id ? { ...current, read: true } : current));
  }
  const panelRef = useRef<HTMLDivElement>(null);

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
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load notifications.");
      });
    void refresh();
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, [user?.id, refreshKey]);

  useEffect(() => {
    if (!open) return;
    popupRef.current?.showModal();
    const handleMouseDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", escape);
    document.addEventListener("mousedown", handleMouseDown);
    return () => { document.removeEventListener("mousedown", handleMouseDown); document.removeEventListener("keydown", escape); };
  }, [open]);

  const markAsRead = async (id: string) => {
    if (busy) return; setBusy(true);
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
    } catch {
      setError("Could not update notifications. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className={`topbar-actions${className ? ` ${className}` : ""}`} ref={panelRef}>
      <button
        type="button"
        className="notification-trigger"
        aria-label={`Notifications, ${totalUnread} unread`}
        aria-expanded={open}
        aria-controls="notifications-panel"
        onClick={() => { setSelected(null); setDetailError(""); setOpen((value) => !value); setRefreshKey((value) => value + 1); }}
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
        <dialog ref={popupRef} onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}
          className="notification-panel"
          id="notifications-panel"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="notification-panel__head">
            <h2 className="notification-panel__title">{t("Notifications")} <small>{totalUnread} {language === "ar" ? "غير مقروء" : "unread"}</small></h2><button type="button" aria-label="Close notifications" onClick={() => setOpen(false)}>{t("Close")}</button>
            <button
              type="button"
              className="button-tiny button-ghost"
              disabled={busy || !totalUnread} onClick={() => { updateActivity(items => items.map(item => ({ ...item, read: true }))); if (unreadCount) void markAllRead(); }}
            >
              Mark all read
            </button>
          </div>

          <div className="notification-filters"><button type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>{t("All")}</button><button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>{t("Unread")}</button><button type="button" onClick={() => setRefreshKey((value) => value + 1)}>{t("Refresh")}</button></div>
          {detailError && <p className="error" role="alert">{detailError}</p>}
          {detailBusy && <p className="hint" role="status">{language === "ar" ? "جارٍ التحميل…" : "Please wait…"}</p>}
          {selected ? <section className="notification-detail">
            <button type="button" disabled={detailBusy} onClick={() => setSelected(null)}>{language === "ar" ? "العودة للإشعارات" : "Back to notifications"}</button>
            <h3>{t(typeLabel(selected.item.type))}</h3><p className="notification-detail-message">{selected.item.message}</p><p className="notification-list__meta">{formatDate(selected.item.createdAt)}</p>
            <dl>{Object.entries(selected.details).map(([field, value]) => <div key={field}><dt>{t(field.charAt(0).toUpperCase() + field.slice(1))}</dt><dd>{String(value)}</dd></div>)}</dl>
            {selected.item.response && <p className="notification-response">{selected.item.response}</p>}
            {selected.canReply && <div className="notification-reply"><label className="form-field"><span>{language === "ar" ? "تعليق للمرسل" : "Comment to sender"}</span><textarea rows={3} maxLength={2000} disabled={detailBusy} value={comment} onChange={event => setComment(event.target.value)} /></label><div className="inline-actions">{selected.canDecide && <><button className="primary" disabled={detailBusy} onClick={() => void respond("approve")}>{language === "ar" ? "موافقة" : "Approve"}</button><button className="danger" disabled={detailBusy} onClick={() => void respond("reject")}>{language === "ar" ? "رفض" : "Reject"}</button></>}<button disabled={detailBusy || !comment.trim()} onClick={() => void respond("comment")}>{language === "ar" ? "إرسال تعليق" : "Send comment"}</button></div></div>}
            <button className="notification-delete" disabled={detailBusy} onClick={() => void removeNotification(selected.item.id)}>{language === "ar" ? "حذف الإشعار" : "Delete notification"}</button>
          </section> : <>
          {activity.filter(item => !unreadOnly || !item.read).length > 0 && <section className="notification-activity"><h3>{t("My recent changes")}</h3><p className="hint">{t("Saved on this device")}</p><ul className="notification-list">{activity.filter(item => !unreadOnly || !item.read).map(item => <li key={item.id} className={`notification-list__item notification-list__item--${item.read ? "read" : "unread"}`}><div className="notification-list__main"><span className="notification-list__type">{t("Activity")}</span><button className="notification-message-button" onClick={() => showActivity(item)}>{t(item.message)}</button><p className="notification-list__meta">{formatDate(item.createdAt)}</p></div>{!item.read && <div className="notification-list__actions"><button type="button" onClick={() => updateActivity(items => items.map(current => current.id === item.id ? { ...current, read: true } : current))}>{t("Mark read")}</button></div>}</li>)}</ul></section>}
          {error ? (
            <p className="notification-panel__empty">{error}</p>
          ) : notifications.filter((notification) => !unreadOnly || !notification.read).length === 0 ? (
            <p className="notification-panel__empty">{activity.some(item => !unreadOnly || !item.read) ? "No workspace alerts" : "No notifications"}</p>
          ) : (
            <ul className="notification-list">
              {[...notifications].filter((notification) => !unreadOnly || !notification.read).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((notification) => (
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
                    <button className="notification-message-button" disabled={detailBusy} onClick={() => void showDetails(notification.id)}>{notification.message}</button>
                    <p className="notification-list__meta">
                      {formatDate(notification.createdAt)}
                    </p>
                  </div>
                  <div className="notification-list__actions">
                    <button disabled={detailBusy} onClick={() => void showDetails(notification.id)}>{language === "ar" ? "التفاصيل" : "Details"}</button>
                    <button disabled={detailBusy} onClick={() => void removeNotification(notification.id)}>{language === "ar" ? "حذف" : "Delete"}</button>
                    {!notification.read && <button
                      disabled={busy}
                      type="button"
                      className="button-tiny button-ghost"
                      onClick={() => void markAsRead(notification.id)}
                      aria-label="Mark as read"
                    >
                      Mark read
                    </button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          </>}
        </dialog>
      )}
    </div>
  );
}
