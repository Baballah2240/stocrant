import { Router } from "express";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import type { AuthenticatedUser } from "./auth.js";
import type { Notification } from "./types.js";
import { getCollection, getStore, saveStore, transaction } from "./storage.js";

export const managerRoles = ["role-shop-manager", "role-main-manager", "role-manager", "role-organization-admin", "role-company-manager", "role-hr-manager", "role-general-manager", "role-finance-manager"];
export const isNotebookManager = (user: AuthenticatedUser | undefined) => Boolean(user && managerRoles.includes(user.roleId));
type Note = { id: string; ownerId: string; title: string; body: string; phone: string; dueAt: string | null; completed: boolean; pinned: boolean; createdAt: string; updatedAt: string; version: number; requestId: string; requestHash: string; notifiedDueAt: string | null };
const notes = () => getCollection("managerPersonalNotes") as Note[];
const safe = ({ ownerId: _owner, requestId: _key, requestHash: _hash, notifiedDueAt: _notified, ...item }: Note) => item;
const due = z.string().datetime().refine(value => Number.isFinite(Date.parse(value))).nullable();
const fields = {
  title: z.string().trim().min(1).max(120), body: z.string().trim().max(6000),
  phone: z.string().trim().max(45).refine(value => !value || /^[+\d\s().-]+$/.test(value) && value.replace(/\D/g, "").length >= 6 && value.replace(/\D/g, "").length <= 20),
  dueAt: due, completed: z.boolean(), pinned: z.boolean(),
};
const createInput = z.object({ ...fields, body: fields.body.default(""), phone: fields.phone.default(""), dueAt: due.default(null), completed: fields.completed.default(false), pinned: fields.pinned.default(false), requestId: z.string().uuid() }).strict();
const updateInput = z.object({ title: fields.title.optional(), body: fields.body.optional(), phone: fields.phone.optional(), dueAt: due.optional(), completed: fields.completed.optional(), pinned: fields.pinned.optional(), version: z.number().int().positive() }).strict();
export const personalNotesRouter = Router();
personalNotesRouter.use((req, res, next) => isNotebookManager(req.auth) ? next() : res.status(403).json({ error: "A manager account is required for the private notebook." }));
const own = (user: AuthenticatedUser, id: string) => notes().find(row => row.id === id && row.ownerId === user.id);
function removeAlerts(item: Note) {
  getStore().collections.notifications = (getCollection("notifications") as Notification[]).filter(row => row.userId !== item.ownerId || row.target !== `personal-note:${item.id}`);
}

personalNotesRouter.get("/", (req, res) => {
  const all = notes().filter(row => row.ownerId === req.auth!.id), now = Date.now();
  const query = String(req.query.q || "").trim().slice(0, 200).toLowerCase(), filter = String(req.query.filter || "open");
  const filtered = all.filter(row => (!query || [row.title, row.body, row.phone].some(value => value.toLowerCase().includes(query))) &&
    (filter === "all" || filter === "completed" ? filter === "all" || row.completed : !row.completed && (filter !== "reminders" || Boolean(row.dueAt))));
  filtered.sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(a.completed) - Number(b.completed) ||
    (a.dueAt && b.dueAt ? a.dueAt.localeCompare(b.dueAt) : a.dueAt ? -1 : b.dueAt ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt));
  const pages = Math.max(1, Math.ceil(filtered.length / 20)), page = Math.min(pages, Math.max(1, Math.trunc(Number(req.query.page) || 1)));
  res.json({ items: filtered.slice((page - 1) * 20, page * 20).map(safe), page, pages, total: filtered.length,
    counts: { open: all.filter(row => !row.completed).length, completed: all.filter(row => row.completed).length, due: all.filter(row => !row.completed && row.dueAt && Date.parse(row.dueAt) <= now).length } });
});
personalNotesRouter.get("/:id", (req, res) => {
  const item = own(req.auth!, String(req.params.id));
  return item ? res.json({ item: safe(item) }) : res.status(404).json({ error: "Private note not found." });
});
personalNotesRouter.post("/", (req, res) => {
  const parsed = createInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a title, a valid phone number and a valid reminder time." });
  const input = parsed.data, hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const previous = notes().find(row => row.ownerId === req.auth!.id && row.requestId === input.requestId);
  if (previous) return previous.requestHash === hash ? res.json({ item: safe(previous) }) : res.status(409).json({ error: "This request changed. Start a new note before sending it again." });
  if (notes().filter(row => row.ownerId === req.auth!.id).length >= 1000) return res.status(400).json({ error: "Your notebook is full. Delete an old note before adding another." });
  const at = new Date().toISOString();
  const item: Note = { ...input, id: randomUUID(), ownerId: req.auth!.id, dueAt: input.dueAt ? new Date(input.dueAt).toISOString() : null, createdAt: at, updatedAt: at, version: 1, requestHash: hash, notifiedDueAt: null };
  transaction(() => { notes().push(item); saveStore(getStore()); });
  res.status(201).json({ item: safe(item) });
});
personalNotesRouter.patch("/:id", (req, res) => {
  const item = own(req.auth!, String(req.params.id));
  if (!item) return res.status(404).json({ error: "Private note not found." });
  const parsed = updateInput.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length < 2) return res.status(400).json({ error: "Enter valid note changes and the current version." });
  if (parsed.data.version !== item.version) return res.status(409).json({ error: "This note changed. Reload the saved note before updating it." });
  const changes = parsed.data as Partial<z.infer<typeof createInput>>;
  transaction(() => {
    const { version: _version, ...update } = changes as Partial<Note>;
    if (update.dueAt) update.dueAt = new Date(update.dueAt).toISOString();
    if (update.dueAt !== undefined && update.dueAt !== item.dueAt) { removeAlerts(item); item.notifiedDueAt = null; }
    if (update.completed === true) removeAlerts(item);
    Object.assign(item, update, { version: item.version + 1, updatedAt: new Date().toISOString() });
    saveStore(getStore());
  });
  res.json({ item: safe(item) });
});
personalNotesRouter.delete("/:id", (req, res) => {
  const item = own(req.auth!, String(req.params.id));
  if (!item) return res.status(404).json({ error: "Private note not found." });
  const parsed = z.object({ version: z.number().int().positive() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "The current note version is required." });
  if (parsed.data.version !== item.version) return res.status(409).json({ error: "This note changed. Reload the saved note before updating it." });
  transaction(() => { removeAlerts(item); getStore().collections.managerPersonalNotes = notes().filter(row => row.id !== item.id); saveStore(getStore()); });
  res.json({ success: true });
});

/** Evaluated on the owner's authenticated notification poll, including after time offline. */
export function dispatchPersonalReminders(user: AuthenticatedUser, notify: (input: { userId: string; user: string; type: "message"; severity: "info"; message: string; messageKey: string; target: string }) => unknown, now = Date.now()) {
  if (!isNotebookManager(user) || user.accountStatus && user.accountStatus !== "active") return;
  const ready = notes().filter(row => row.ownerId === user.id && !row.completed && row.dueAt && Date.parse(row.dueAt) <= now && row.notifiedDueAt !== row.dueAt);
  if (!ready.length) return;
  transaction(() => {
    for (const item of ready) {
      notify({ userId: user.id, user: user.name, type: "message", severity: "info", message: "A private reminder is due. Open your notebook.", messageKey: "A private reminder is due. Open your notebook.", target: `personal-note:${item.id}` });
      item.notifiedDueAt = item.dueAt;
    }
    saveStore(getStore());
  });
}
