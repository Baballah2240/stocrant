import { Router } from "express";
import { activityQuery, dashboardActivity } from "../dashboard-activity.js";
const router = Router();
router.get("/", (req, res) => {
 const parsed = activityQuery.safeParse(req.query);
 if (!parsed.success) return res.status(400).json({ error: "Choose valid activity filters and a valid time zone." });
 try { return res.json(dashboardActivity(req.auth!, parsed.data)); }
 catch (error) { return res.status(400).json({ error: (error as Error).message }); }
});
export default router;
