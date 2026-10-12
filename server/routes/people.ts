import { Router } from "express";
import { personSchema, parseJson } from "../validators.js";
import { upsertPerson, deletePerson, getStore } from "../storage.js";
import type { Request, Response } from "express";
import { occupancy } from "../occupancy.js";
import { isWithinScope, requirePermission } from "../permissions.js";
import { audit, requiresApproval } from "../workspace.js";

const router = Router();

function nextId(prefix: string) {
  const n = getStore().people.length + 1;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

router.get("/", requirePermission("hr", "view"), (req: Request, res: Response) => {
  const data = getStore();
  const people = data.people.map((p) => ({
    ...p,
    storeName: data.stores.find((s) => s.id === p.storeId)?.name ?? "Unknown",
  }));
  const storeFilter = req.query.store as string | undefined;
  const filtered = (storeFilter ? people.filter((p) => p.storeId === storeFilter) : people)
    .filter((person) => isWithinScope(req.auth!, person as unknown as Record<string, unknown>));
  res.json({ people: filtered });
});

router.get("/:id", requirePermission("hr", "view"), (req: Request, res: Response) => {
  const person = getStore().people.find((p) => p.id === req.params.id);
  if (!person || !isWithinScope(req.auth!, person as unknown as Record<string, unknown>)) return res.status(404).json({ error: "Person not found." });
  res.json({ person });
});

router.post("/", requirePermission("hr", "create"), (req: Request, res: Response) => {
  if (requiresApproval("hr", "create")) return res.status(409).json({ error: "An HR create approval rule is active. Submit this change through the approval-aware employee workflow." });
  const input = parseJson(personSchema, req.body, "person");
  const person: import("../types.js").Person = {
    ...input,
    id: input.id || nextId("p"),
    storeId: input.storeId,
    createdAt: new Date().toISOString(),
  };
  if (!isWithinScope(req.auth!, person as unknown as Record<string, unknown>)) return res.status(403).json({ error: "Choose a location within your assigned company." });
  const created = upsertPerson(person);
  audit(req.auth, "hr.legacy-person-created", { targetId: created.id });
  res.status(201).json({ person: created });
});

router.patch("/:id", requirePermission("hr", "edit"), (req: Request, res: Response) => {
  if (requiresApproval("hr", "edit")) return res.status(409).json({ error: "An HR edit approval rule is active. Submit this change through the approval-aware employee workflow." });
  const existing = getStore().people.find((p) => p.id === req.params.id);
  if (!existing || !isWithinScope(req.auth!, existing as unknown as Record<string, unknown>)) return res.status(404).json({ error: "Person not found." });
  const input = parseJson(personSchema, req.body, "person");
  if (!isWithinScope(req.auth!, { ...existing, ...input } as unknown as Record<string, unknown>)) return res.status(403).json({ error: "The record must stay within your assigned company." });
  const updated = upsertPerson({ ...existing, ...input });
  audit(req.auth, "hr.legacy-person-updated", { targetId: updated.id });
  res.json({ person: updated });
});

router.delete("/:id", requirePermission("hr", "delete"), (req: Request, res: Response) => {
  if (requiresApproval("hr", "delete")) return res.status(409).json({ error: "An HR delete approval rule is active. Deactivate access or use the approval-aware employee workflow instead." });
  const person = getStore().people.find((candidate) => candidate.id === req.params.id);
  if (!person || !isWithinScope(req.auth!, person as unknown as Record<string, unknown>)) return res.status(404).json({ error: "Person not found." });
  deletePerson(req.params.id as string);
  audit(req.auth, "hr.legacy-person-deleted", { targetId: req.params.id as string });
  res.json({ ok: true, peopleRemaining: getStore().people.length });
});

export default router;
