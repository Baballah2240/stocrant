/**
 * Action-required notification engine.
 *
 * Notifications live alongside the other collections in the JSON store
 * (`collections.notifications`). The module keeps an in-memory view through
 * `getStore()` so reads are cheap, and every mutation is written back through
 * `saveStore()` so alerts survive restarts.
 *
 * Surface:
 *   GET    /api/notifications          -> { items: Notification[] }
 *   POST   /api/notifications/read-all -> { success: true, count: number }
 *   POST   /api/notifications/:id/read -> { success: true, item: Notification }
 */

import { getStore, saveStore } from "./storage.js";
import { Router } from "express";
import type { Notification } from "./types.js";

const NOTIFICATIONS_COLLECTION = "notifications" as const;

export function getNotificationStore(): Notification[] {
  const data = getStore();
  const items = data.collections?.[NOTIFICATIONS_COLLECTION];
  if (!Array.isArray(items)) {
    data.collections = data.collections ?? {};
    data.collections[NOTIFICATIONS_COLLECTION] = [];
    saveStore(data);
  }
  return data.collections[NOTIFICATIONS_COLLECTION] as Notification[];
}

export function saveNotificationStore(notifications: Notification[]): void {
  const data = getStore();
  data.collections[NOTIFICATIONS_COLLECTION] = notifications;
  saveStore(data);
}

let sequence = 0;

export function createNotification(input: {
  userId: string | null;
  user: string;
  type: Notification["type"];
  severity: Notification["severity"];
  message: string;
  target: string | null;
}): Notification {
  const notification: Notification = {
    id: `ntf_${Date.now().toString(36)}_${String(++sequence).padStart(5, "0")}`,
    userId: input.userId,
    user: input.user,
    type: input.type,
    severity: input.severity,
    message: input.message,
    target: input.target,
    createdAt: new Date().toISOString(),
    read: false,
  };

  saveNotificationStore([...getNotificationStore(), notification]);
  return notification;
}

export function listNotifications(userId: string | null): Notification[] {
  return getNotificationStore().filter((notification) => notification.userId === userId);
}

export function markAsRead(id: string, userId: string): Notification | undefined {
  const notifications = getNotificationStore();
  const next = notifications.map((item) =>
    item.id === id && item.userId === userId ? { ...item, read: true } : item
  );
  saveNotificationStore(next);
  return next.find((item) => item.id === id && item.userId === userId);
}

export function markAllReadForUser(userId: string): number {
  const notifications = getNotificationStore();
  let marked = 0;
  const next = notifications.map((item) => {
    if (item.userId === userId && !item.read) {
      marked += 1;
      return { ...item, read: true };
    }
    return item;
  });
  saveNotificationStore(next);
  return marked;
}

const notificationsRouter = Router();

notificationsRouter.get("/", (req, res) => {
  res.json({ items: listNotifications(req.auth?.id ?? null) });
});

notificationsRouter.post("/read-all", (req, res) => {
  if (!req.auth) return res.status(401).json({ error: "Sign in is required." });
  res.json({ success: true, count: markAllReadForUser(req.auth.id) });
});

notificationsRouter.post("/:id/read", (req, res) => {
  if (!req.auth) return res.status(401).json({ error: "Sign in is required." });
  const id = (req.params as { id?: string }).id;
  if (!id) return res.status(400).json({ error: "A notification id is required." });
  const item = markAsRead(id, req.auth.id);
  if (!item) return res.status(404).json({ error: "Notification not found." });
  res.json({ success: true, item });
});

export const notificationRouter = notificationsRouter;
