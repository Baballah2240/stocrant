import { Router } from "express";
import { z } from "zod";
import { personalAttendance, personalAttendanceDetail, selfAttendanceQuery } from "../self-attendance.js";
import {
  attendanceDashboard,
  attendanceCompanyForUser,
  attendanceSettingsForUser,
  clockIn,
  clockOut,
  correctionRequests,
  createManualAttendance,
  decideAttendanceApproval,
  decideCorrectionRequest,
  saveAttendanceSettings,
  submitAttendanceForApproval,
  submitCorrectionRequest,
  type AttendanceFilters,
} from "../attendance.js";

const router = Router();
const clockSchema = z.object({requestId:z.string().uuid().optional()}).strict();
router.get("/self", (req, res) => {const parsed=selfAttendanceQuery.safeParse(req.query);if(!parsed.success)return res.status(400).json({error:"Choose valid personal attendance filters."});try{return res.json(personalAttendance(req.auth!,parsed.data));}catch(error){return sendError(res,error);}});
router.get("/self/:id", (req, res) => {try{return res.json(personalAttendanceDetail(req.auth!,req.params.id));}catch(error){return sendError(res,error);}});
for(const action of ["check-in","check-out"] as const)router.post("/"+action,(req,res)=>{const parsed=clockSchema.safeParse(req.body||{});if(!parsed.success)return res.status(400).json({error:"Use a valid attendance request."});try{const item=action==="check-in"?clockIn(req.auth!,true,parsed.data.requestId):clockOut(req.auth!,true,parsed.data.requestId);return res.status(action==="check-in"&&Array.isArray(item.sessions)&&item.sessions.length===1?201:200).json({item});}catch(error){return sendError(res,error);}});

function sendError(res: import("express").Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Attendance request failed.";
  return res.status((error as { statusCode?: number }).statusCode ?? 400).json({ error: message });
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD dates.");
const time = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM times.");
const companyId = z.string().trim().min(1).max(160);
const attendanceStatus = z.enum(["present", "absent", "late", "half-day", "on-leave", "pending-review", "approved-correction"]);

const dashboardQuery = z.object({
  organizationId: companyId.optional(), employeeId: z.string().trim().max(160).optional(), department: z.string().trim().max(160).optional(),
  status: z.enum(["present", "absent", "late", "half-day", "on-leave", "pending-review", "approved-correction", "all"]).optional(),
  from: date.optional(), to: date.optional(), month: z.string().regex(/^\d{4}-\d{2}$/).optional(), year: z.string().regex(/^\d{4}$/).optional(),
  query: z.string().trim().max(160).optional(), page: z.coerce.number().int().min(1).max(10_000).optional(), limit: z.coerce.number().int().min(10).max(100).optional(),
});

router.get("/dashboard", (req, res) => {
  const parsed = dashboardQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  try { res.json(attendanceDashboard(req.auth!, parsed.data as AttendanceFilters)); } catch (error) { sendError(res, error); }
});

router.get("/settings", (req, res) => {
  const parsed = z.object({ organizationId: companyId.optional() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Use a valid company." });
  const target = attendanceCompanyForUser(req.auth!, parsed.data.organizationId);
  if (!target) return res.status(400).json({ error: "Choose a company." });
  try { res.json({ item: attendanceSettingsForUser(req.auth!, target) }); } catch (error) { sendError(res, error); }
});

const settingsSchema = z.object({
  organizationId: companyId,
  trackingEnabled: z.boolean().optional(), deductionsEnabled: z.boolean().optional(), timezone: z.string().trim().min(1).max(100).optional(),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).optional(), expectedStart: time.optional(), expectedEnd: time.optional(),
  breakMinutes: z.number().int().min(0).max(720).optional(), lateGraceMinutes: z.number().int().min(0).max(240).optional(), earlyDepartureGraceMinutes: z.number().int().min(0).max(240).optional(), overtimeAfterMinutes: z.number().int().min(0).max(1_440).optional(),
  deductLateMinutes: z.boolean().optional(), deductEarlyDepartureMinutes: z.boolean().optional(), deductMissingHours: z.boolean().optional(), deductUnpaidAbsence: z.boolean().optional(),
  deductionMethod: z.enum(["hourly", "daily"]).optional(), workingDaysPerMonth: z.number().int().min(1).max(31).optional(),
  approvalStages: z.array(z.object({ key: z.enum(["hr", "general", "finance"]), label: z.string().trim().min(2).max(100), roleId: z.string().trim().min(1).max(160) })).min(1).max(3).optional(),
});
router.put("/settings", (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  try { res.json({ item: saveAttendanceSettings(req.auth!, parsed.data.organizationId, parsed.data) }); } catch (error) { sendError(res, error); }
});

router.post("/clock-in", (_req, res) => {
  const parsed=clockSchema.safeParse(_req.body||{});if(!parsed.success)return res.status(400).json({error:"Use a valid attendance request."});
  try { res.status(201).json({ item: clockIn(_req.auth!,false,parsed.data.requestId) }); } catch (error) { sendError(res, error); }
});
router.post("/clock-out", (req, res) => {
  const parsed=clockSchema.safeParse(req.body||{});if(!parsed.success)return res.status(400).json({error:"Use a valid attendance request."});
  try { res.json({ item: clockOut(req.auth!,false,parsed.data.requestId) }); } catch (error) { sendError(res, error); }
});

const manualSchema = z.object({ organizationId: companyId, employeeId: z.string().trim().min(1).max(160), date, checkIn: time.optional(), checkOut: time.optional(), status: attendanceStatus.optional(), note: z.string().trim().max(2_000).optional() });
router.post("/records", (req, res) => {
  const parsed = manualSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  try { res.status(201).json({ item: createManualAttendance(req.auth!, parsed.data) }); } catch (error) { sendError(res, error); }
});

router.post("/records/:id/submit", (req, res) => {
  const parsed = z.object({ comment: z.string().trim().max(2_000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Use a valid approval comment." });
  try { res.json({ item: submitAttendanceForApproval(req.auth!, req.params.id, parsed.data.comment) }); } catch (error) { sendError(res, error); }
});
router.post("/records/:id/decision", (req, res) => {
  const parsed = z.object({ decision: z.enum(["approve", "reject", "return"]), comment: z.string().trim().max(2_000).default("") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a valid attendance decision." });
  try { res.json({ item: decideAttendanceApproval(req.auth!, req.params.id, parsed.data.decision, parsed.data.comment) }); } catch (error) { sendError(res, error); }
});

router.get("/correction-requests", (req, res) => {
  const parsed = z.object({ organizationId: companyId.optional() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Use a valid company." });
  try { res.json({ items: correctionRequests(req.auth!, parsed.data.organizationId) }); } catch (error) { sendError(res, error); }
});
const correctionSchema = z.object({ attendanceDate: date, requestedCheckIn: time.optional(), requestedCheckOut: time.optional(), reason: z.string().trim().min(3).max(4_000), attachmentUrl: z.string().trim().url().max(1_000).optional().or(z.literal("")) });
router.post("/correction-requests", (req, res) => {
  const parsed = correctionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  try { res.status(201).json({ item: submitCorrectionRequest(req.auth!, parsed.data) }); } catch (error) { sendError(res, error); }
});
router.post("/correction-requests/:id/decision", (req, res) => {
  const parsed = z.object({ action: z.enum(["approve", "reject", "more-information"]), comment: z.string().trim().max(2_000).default("") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a valid correction decision." });
  try { res.json({ item: decideCorrectionRequest(req.auth!, req.params.id, parsed.data.action, parsed.data.comment) }); } catch (error) { sendError(res, error); }
});

export default router;
