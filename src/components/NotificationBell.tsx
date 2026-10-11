import { useEffect, useRef, useState } from "react";
import { useSession } from "../session-context";
import { api } from "../api";
import { NavLink } from "react-router-dom";
import { relativeLabel as formatDate } from "../util";
import type { Notification, NotificationType } from "../types";

interface NotificationBellProps {
  className?: string;
}

function typeLabel(type: NotificationType): string {
  if (type === "leave_request") return "Leave request";
  if (type === "password_reset") return "Password reset";
  if (type === "overdue_work") return "Overdue";
  if (type === "low_stock") return "Low stock";
  if (type === "pending_approval") return "Approval";
  return "Access";
}

export function NotificationBell({ className = "" }: NotificationBellProps) {
  const { user } = useSession();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
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
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={open}
        aria-controls="notifications-panel"
        onClick={() => { setOpen((value) => !value); setRefreshKey((value) => value + 1); }}
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
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>

      {open && (
        <div
          className="notification-panel"
          id="notifications-panel"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="notification-panel__head">
            <h2 className="notification-panel__title">Notifications <small>{unreadCount} unread</small></h2><button type="button" aria-label="Close notifications" onClick={() => setOpen(false)}>Close</button>
            <button
              type="button"
              className="button-tiny button-ghost"
              disabled={busy || !unreadCount} onClick={markAllRead}
            >
              Mark all read
            </button>
          </div>

          <div className="notification-filters"><button type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>All</button><button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>Unread</button><button type="button" onClick={() => setRefreshKey((value) => value + 1)}>Refresh</button></div>
          {error ? (
            <p className="notification-panel__empty">{error}</p>
          ) : notifications.filter((notification) => !unreadOnly || !notification.read).length === 0 ? (
            <p className="notification-panel__empty">No notifications</p>
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
                      style={{
                        backgroundColor: notification.read
                          ? "var(--color-neutral-soft)"
                          : "var(--color-primary)",
                        color: notification.read ? "var(--color-neutral-muted)" : "#fff",
                      }}
                    >
                      {typeLabel(notification.type)}
                    </span>
                    <p className="notification-list__message">{notification.message}</p>
                    <p className="notification-list__meta">
                      {formatDate(notification.createdAt)}
                    </p>
                  </div>
                  <div className="notification-list__actions">
                    <NavLink to={notification.type === "leave_request" ? `/hr/leaveRequests/${encodeURIComponent(notification.target ?? "")}` : notification.type === "password_reset" ? `/admin?user=${encodeURIComponent(notification.target ?? "")}` : notification.type === "low_stock" ? "/inventory" : notification.type === "overdue_work" ? "/operations?view=overdue" : user?.roleId === "role-main-manager" ? "/admin" : "/operations"} onClick={() => setOpen(false)}>Open</NavLink>
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
        </div>
      )}
    </div>
  );
}
