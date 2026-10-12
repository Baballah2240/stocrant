import { Router } from "express";
import { zoneSchema, parseJson } from "../validators.js";
import { upsertZone, deleteZone, getStore } from "../storage.js";
import type { Request, Response } from "express";
import { zoneUtilization } from "../occupancy.js";
import { isWithinScope, requirePermission } from "../permissions.js";
import { audit, requiresApproval } from "../workspace.js";

const router = Router();

function nextId(prefix: string) {
  const n = getStore().zones.length + 1;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

router.get("/", requirePermission("locations", "view"), (req: Request, res: Response) => {
  const data = getStore();
  const zones = data.zones.filter((zone) => isWithinScope(req.auth!, zone as unknown as Record<string, unknown>)).map((z) => ({
    ...z,
    storeName: data.stores.find((s) => s.id === z.storeId)?.name ?? "Unknown",
  }));
  res.json({ zones });
});

router.get("/:id", requirePermission("locations", "view"), (req: Request, res: Response) => {
  const zone = getStore().zones.find((z) => z.id === req.params.id);
  if (!zone || !isWithinScope(req.auth!, zone as unknown as Record<string, unknown>)) return res.status(404).json({ error: "Zone not found." });
  res.json({ zone });
});

router.post("/", requirePermission("locations", "create"), (req: Request, res: Response) => {
  if (requiresApproval("locations", "create")) return res.status(409).json({ error: "A Locations create approval rule is active. Submit this change through the approval-aware workspace flow." });
  const input = parseJson(zoneSchema, req.body, "zone");
  const zone: import("../types.js").Zone = { ...input, id: input.id || nextId("z") };
  if (!isWithinScope(req.auth!, zone as unknown as Record<string, unknown>)) return res.status(403).json({ error: "Choose a location within your assigned company." });
  const created = upsertZone(zone);
  audit(req.auth, "locations.legacy-zone-created", { targetId: created.id });
  res.status(201).json({ zone: created });
});

router.patch("/:id", requirePermission("locations", "edit"), (req: Request, res: Response) => {
  if (requiresApproval("locations", "edit")) return res.status(409).json({ error: "A Locations edit approval rule is active. Submit this change through the approval-aware workspace flow." });
  const existing = getStore().zones.find((z) => z.id === req.params.id);
  if (!existing || !isWithinScope(req.auth!, existing as unknown as Record<string, unknown>)) return res.status(404).json({ error: "Zone not found." });
  const input = parseJson(zoneSchema, req.body, "zone");
  if (!isWithinScope(req.auth!, { ...existing, ...input } as unknown as Record<string, unknown>)) return res.status(403).json({ error: "The record must stay within your assigned company." });
  const updated = upsertZone({ ...existing, ...input });
  audit(req.auth, "locations.legacy-zone-updated", { targetId: updated.id });
  res.json({ zone: updated });
});

router.delete("/:id", requirePermission("locations", "delete"), (req: Request, res: Response) => {
  if (requiresApproval("locations", "delete")) return res.status(409).json({ error: "A Locations delete approval rule is active. Submit this change through the approval-aware workspace flow." });
  const zone = getStore().zones.find((candidate) => candidate.id === req.params.id);
  if (!zone || !isWithinScope(req.auth!, zone as unknown as Record<string, unknown>)) return res.status(404).json({ error: "Zone not found." });
  deleteZone(req.params.id as string);
  audit(req.auth, "locations.legacy-zone-deleted", { targetId: req.params.id as string });
  res.json({ ok: true, zonesRemaining: getStore().zones.length });
});

export default router;
