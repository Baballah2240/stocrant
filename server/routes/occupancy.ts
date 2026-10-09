import { Router } from "express";
import { storeSummaries, occupancy, simulatedOccupancy } from "../occupancy.js";
import { isWithinScope, requirePermission } from "../permissions.js";
import { getStore } from "../storage.js";

const router = Router();

/** All stores with their live occupancy summary. */
router.get("/", requirePermission("locations", "view"), (req, res) => {
  const visibleIds = new Set(getStore().stores.filter((store) => isWithinScope(req.auth!, store as unknown as Record<string, unknown>)).map((store) => store.id));
  res.json({ stores: storeSummaries().filter((store) => visibleIds.has(store.storeId)) });
});

/** Occupancy for a single store. */
router.get("/:storeId", requirePermission("locations", "view"), (req, res) => {
  const storeId = req.params.storeId as string;
  const store = getStore().stores.find((candidate) => candidate.id === storeId);
  if (!store || !isWithinScope(req.auth!, store as unknown as Record<string, unknown>)) return res.status(404).json({ error: "Store not found" });
  try {
    res.json({ store: occupancy(storeId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Store not found";
    res.status(404).json({ error: message });
  }
});

/** Occupancy for a single store given a simulated current headcount. */
router.post("/", requirePermission("locations", "view"), (req, res) => {
  const body = req.body as { storeId?: string; headCount?: number };
  const { storeId, headCount } = body;
  if (!storeId || typeof headCount !== "number") {
    return res.status(400).json({ error: "storeId and a numeric headCount are required" });
  }
  const store = getStore().stores.find((candidate) => candidate.id === storeId);
  if (!store || !isWithinScope(req.auth!, store as unknown as Record<string, unknown>)) return res.status(404).json({ error: "Store not found" });
  try {
    res.json({ store: simulatedOccupancy(storeId, headCount) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Store not found";
    res.status(404).json({ error: message });
  }
});

export default router;
