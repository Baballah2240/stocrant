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
import { z } from "zod";
import { approveRequest, audit } from "./workspace.js";
import { getCollection } from "./storage.js";

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

function requestTarget(item: Notification): { collection: string; row: Record<string, unknown> } | undefined {
  const collection = item.type === "registration_request" || item.type === "password_reset" ? "accessUsers" : item.type === "leave_request" ? "leaveRequests" : item.type === "pending_approval" ? "approvalRequests" : "";
  const row = collection && (getCollection(collection) as Record<string, unknown>[]).find(row => row.id === item.target);
  return row ? { collection, row } : undefined;
}

notificationsRouter.get("/:id", (req, res) => {
  const item = listNotifications(req.auth?.id ?? null).find(item => item.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Notification not found." });
  const target = requestTarget(item);
  const manager = req.auth?.roleId === "role-main-manager" && req.auth.accountStatus === "active";
  const details: Record<string, unknown> = {};
  if (manager && target) for (const field of ["name", "email", "type", "from", "to", "days", "reason", "status", "section", "action", "collection", "requestedByName", "createdAt", "requestedAt", "decisionNote"]) {
    if (target.row[field] !== undefined) details[field] = target.row[field];
  }
  res.json({ item, details, canDecide: Boolean(manager && target?.row.status === "pending" && ["registration_request", "leave_request", "pending_approval"].includes(item.type)), canReply: Boolean(manager && target) });
});

notificationsRouter.delete("/:id", (req, res) => {
  if (!req.auth) return res.status(401).json({ error: "Sign in is required." });
  const owned = listNotifications(req.auth.id).find(item => item.id === req.params.id);
  if (!owned) return res.status(404).json({ error: "Notification not found." });
  saveNotificationStore(getNotificationStore().filter(item => item.id !== owned.id));
  res.json({ success: true });
});

notificationsRouter.post("/:id/respond", (req, res) => {
  const user = req.auth;
  if (!user || user.roleId !== "role-main-manager" || user.accountStatus !== "active") return res.status(403).json({ error: "Only the Main Manager can respond to requests." });
  const item = listNotifications(user.id).find(item => item.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Notification not found." });
  const parsed = z.object({ action: z.enum(["approve", "reject", "comment"]), comment: z.string().trim().max(2000).default("") }).strict().safeParse(req.body);
  if (!parsed.success || (parsed.data.action === "comment" && !parsed.data.comment)) return res.status(400).json({ error: "Choose an action or enter a comment." });
  const target = requestTarget(item);
  if (!target) return res.status(409).json({ error: "This notification has no available request." });
  const { action, comment } = parsed.data;
  const recipientId = target.collection === "accessUsers" ? target.row.id : target.row.accountId || target.row.createdBy || target.row.requestedBy;
  const recipient = (getCollection("accessUsers") as Record<string, unknown>[]).find(row => row.id === recipientId);
  if (!recipient) return res.status(409).json({ error: "The sender account is no longer available." });
  if (action !== "comment") {
    if (!["registration_request", "leave_request", "pending_approval"].includes(item.type) || target.row.status !== "pending") return res.status(409).json({ error: "This request cannot be decided or has already been processed." });
    if (recipientId === user.id) return res.status(403).json({ error: "You cannot decide your own request." });
    const status = action === "approve" ? "approved" : "rejected";
    try {
      if (target.collection === "approvalRequests") approveRequest(user, String(target.row.id), action === "approve", comment);
      else {
        const updated: Record<string, unknown> = { ...target.row, status: target.collection === "accessUsers" && action === "approve" ? "active" : status, decidedBy: user.id, decidedAt: new Date().toISOString(), decisionNote: comment };
        if (target.collection === "accessUsers" && action === "approve") { delete (updated as Record<string, unknown>).permissions; }
        const data = getStore(); data.collections[target.collection] = (getCollection(target.collection) as Record<string, unknown>[]).map(row => row.id === updated.id ? updated : row); saveStore(data);
        audit(user, `${target.collection}.${status}`, { targetId: target.row.id, comment });
      }
    } catch (error) { return res.status(409).json({ error: error instanceof Error ? error.message : "Could not process the request." }); }
  } else audit(user, "notification.comment", { targetId: target.row.id, comment });
  const response = `${user.name}: ${action === "comment" ? "Comment" : action === "approve" ? "Approved" : "Rejected"}${comment ? ` — ${comment}` : ""}`;
  createNotification({ userId: String(recipient.id), user: String(recipient.name), type: "message", severity: "info", message: `${item.message}\n${response}`, target: item.id });
  saveNotificationStore(getNotificationStore().map(current => current.id === item.id ? { ...current, response, ...(action === "comment" ? {} : { decision: action === "approve" ? "approved" as const : "rejected" as const }), read: true } : current));
  res.json({ success: true });
});

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
