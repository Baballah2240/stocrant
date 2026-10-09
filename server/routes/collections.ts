import { Router } from "express";
import type { Request, Response } from "express";
import { MODULES, registry } from "../registry.js";
import { createCollectionRouter, collectionsMeta } from "../crud.js";

const router = Router();

/** Entity metadata consumed by the UI + mobile clients. */
router.get("/meta", (_req: Request, res: Response) => {
  res.json({ modules: MODULES, entities: collectionsMeta() });
});

router.get("/meta/:collection", (req: Request, res: Response) => {
  const spec = registry.find((e) => e.collection === req.params.collection);
  if (!spec) return res.status(404).json({ error: "Unknown collection." });
  res.json({ entity: spec });
});

/** Mount one CRUD sub-router per registered collection. */
for (const spec of registry) {
  router.use(
    `/${spec.collection}`,
    createCollectionRouter(spec),
  );
}

export default router;
