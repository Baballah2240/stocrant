import { Router } from "express";
import { storeSchema, parseJson } from "../validators.js";
import { upsertStore, deleteStore, getPrimaryCompanyId, getStore } from "../storage.js";
import type { Request, Response } from "express";
import { occupancy } from "../occupancy.js";
import { isWithinScope, requirePermission } from "../permissions.js";
import { audit, requiresApproval } from "../workspace.js";

const router = Router();

function nextId(prefix: string) {
  const data = getStore();
  const n = data.stores.length + 1;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

router.get("/", requirePermission("locations", "view"), (req: Request, res: Response) => {
  res.json({ stores: getStore().stores.filter((store) => isWithinScope(req.auth!, store as unknown as Record<string, unknown>)) });
});

router.get("/:id", requirePermission("locations", "view"), (req: Request, res: Response) => {
  const store = getStore().stores.find((s) => s.id === req.params.id as string);
  if (!store || !isWithinScope(req.auth!, store as unknown as Record<string, unknown>)) return res.status(404).json({ error: "Store not found." });
  res.json({ store: { ...store, occupancy: occupancy(req.params.id as string) } });
});

router.post("/", requirePermission("locations", "create"), (req: Request, res: Response) => {
  if (requiresApproval("locations", "create")) return res.status(409).json({ error: "A Locations create approval rule is active. Submit this change through the approval-aware workspace flow." });
  const input = parseJson(storeSchema, req.body, "store");
  const store: import("../types.js").Store = {
    ...input,
    companyId: input.companyId || getPrimaryCompanyId(),
    id: input.id || nextId("st"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const created = upsertStore(store);
  audit(req.auth, "locations.legacy-created", { targetId: created.id });
  res.status(201).json({ store: created });
});

router.patch("/:id", requirePermission("locations", "edit"), (req: Request, res: Response) => {
  if (requiresApproval("locations", "edit")) return res.status(409).json({ error: "A Locations edit approval rule is active. Submit this change through the approval-aware workspace flow." });
  const existing = getStore().stores.find((s) => s.id === req.params.id);
  if (!existing || !isWithinScope(req.auth!, existing as unknown as Record<string, unknown>)) return res.status(404).json({ error: "Store not found." });
  const input = parseJson(storeSchema, req.body, "store");
  const updated = upsertStore({ ...existing, ...input });
  audit(req.auth, "locations.legacy-updated", { targetId: updated.id });
  res.json({ store: updated });
});

router.delete("/:id", requirePermission("locations", "delete"), (req: Request, res: Response) => {
  if (requiresApproval("locations", "delete")) return res.status(409).json({ error: "A Locations delete approval rule is active. Submit this change through the approval-aware workspace flow." });
  const store = getStore().stores.find((candidate) => candidate.id === req.params.id);
  if (!store || !isWithinScope(req.auth!, store as unknown as Record<string, unknown>)) return res.status(404).json({ error: "Store not found." });
  deleteStore(req.params.id as string);
  audit(req.auth, "locations.legacy-deleted", { targetId: req.params.id as string });
  res.json({ ok: true, storesRemaining: getStore().stores.length });
});

export default router;
