import { Router } from "express";
import { z } from "zod";
import { isNotebookManager } from "./personal-notes.js";
import { getCollection, getStore, saveStore, transaction } from "./storage.js";

const ids = ["shortcuts", "profile", "notes", "attendance", "activity", "summary", "today", "tasks", "notifications", "policies", "assignment", "analytics", "management"] as const;
const input = z.object({ version: z.number().int().min(0), density: z.enum(["comfortable", "compact"]).optional(), items: z.array(z.object({ id: z.enum(ids), hidden: z.boolean(), wide: z.boolean(), width: z.enum(["third", "half", "two-thirds", "full"]).optional(), height: z.number().int().min(240).max(1600).nullable().optional() }).strict()).max(ids.length).refine(items => new Set(items.map(item => item.id)).size === items.length) }).strict();
type Layout = { ownerId: string; version: number; density?: "comfortable" | "compact"; items: z.infer<typeof input>["items"] };
const layouts = () => getCollection("managerDashboardLayouts") as Layout[];
export const dashboardLayoutRouter = Router();
dashboardLayoutRouter.use((req, res, next) => isNotebookManager(req.auth) ? next() : res.status(403).json({ error: "A manager account is required to customize the dashboard." }));
dashboardLayoutRouter.get("/", (req, res) => {
  const layout = layouts().find(item => item.ownerId === req.auth!.id);
  res.json(layout ? { version: layout.version, items: layout.items, density: layout.density || "comfortable" } : { version: 0, items: [], density: "comfortable" });
});
dashboardLayoutRouter.put("/", (req, res) => {
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose valid dashboard cards and sizes." });
  const current = layouts().find(item => item.ownerId === req.auth!.id);
  if (parsed.data.version !== (current?.version || 0)) return res.status(409).json({ error: "Your dashboard changed elsewhere. Reload the saved layout before editing." });
  const next: Layout = { ownerId: req.auth!.id, version: parsed.data.version + 1, items: parsed.data.items, density: parsed.data.density || current?.density || "comfortable" };
  transaction(() => { if (current) Object.assign(current, next); else layouts().push(next); saveStore(getStore()); });
  res.json({ version: next.version, items: next.items, density: next.density });
});
