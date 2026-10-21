import { z } from "zod";
import type { AuthenticatedUser } from "./auth.js";
import { can, isWithinScope } from "./permissions.js";
import { getCollection } from "./storage.js";
import { settingsFor, attendanceDate } from "./attendance.js";
type Row = Record<string, unknown> & { id: string };
const rows = (name: string) => getCollection(name) as Row[];
export const activityQuery = z.object({
 range: z.enum(["today", "7", "30", "custom"]).default("today"),
 start: z.string().date().optional(), end: z.string().date().optional(),
 timezone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }).optional(),
 bucket: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2})?$/).optional(),
 page: z.coerce.number().int().min(1).max(100000).default(1),
});
export function activityPeriod(input: z.infer<typeof activityQuery>, timezone: string, now = new Date()) {
 const today = attendanceDate(now, timezone), end = input.range === "custom" ? input.end : today;
 const day = new Date(today + "T12:00:00Z"); day.setUTCDate(day.getUTCDate() - (input.range === "7" ? 6 : input.range === "30" ? 29 : 0));
 const start = input.range === "custom" ? input.start : day.toISOString().slice(0, 10);
 if (!start || !end || start > end || Date.parse(end) - Date.parse(start) > 365 * 86400000) throw new Error("Choose a date range of up to one year.");
 return { start, end, timezone, hourly: start === end, today };
}
export function dashboardActivity(user: AuthenticatedUser, input: z.infer<typeof activityQuery>, now = new Date()) {
 const operations = can(user, "operations", "view");
 const employee = rows("employees").find(row => row.id === user.employeeId && isWithinScope(user, row));
 const timezone = input.timezone || settingsFor(String(employee?.organizationId || user.organizationIds[0] || "")).timezone;
 const period = activityPeriod(input, timezone, now);
 const tasks = operations ? rows("workItems").filter(row => isWithinScope(user, row)) : [];
 const taskMap = new Map(tasks.map(row => [row.id, row]));
 const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
 const stamp = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return null;
  const parts = formatter.formatToParts(new Date(value)), part = (key: string) => parts.find(p => p.type === key)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}`;
 };
 const buckets = new Map<string, { key: string; completed: number; activity: number }>();
 if (period.hourly) for (let hour = 0; hour < 24; hour++) { const key = `${period.start}T${String(hour).padStart(2, "0")}`; buckets.set(key, { key, completed: 0, activity: 0 }); }
 else for (let instant = Date.parse(period.start + "T12:00:00Z"); instant <= Date.parse(period.end + "T12:00:00Z"); instant += 86400000) { const key = new Date(instant).toISOString().slice(0, 10); buckets.set(key, { key, completed: 0, activity: 0 }); }
 if (input.bucket && !buckets.has(input.bucket)) throw new Error("Choose a data point inside the selected period.");
 const states = new Map<string, string>(), completed = new Set<string>();
 const events: { id: string; taskId: string; title: string; message: string; occurredAt: string; bucket: string; completion: boolean; status: string; to: string | null }[] = [];
 const history = rows("workActivity").filter(row => { const task = taskMap.get(String(row.workItemId)); return task && (!row.organizationId || row.organizationId === task.organizationId); }).sort((a, b) => (Date.parse(String(a.occurredAt)) || 0) - (Date.parse(String(b.occurredAt)) || 0));
 for (const row of history) {
  const local = stamp(row.occurredAt); if (!local) continue;
  const taskId = String(row.workItemId), status = typeof row.status === "string" ? row.status : "", previous = states.get(taskId);
  const transition = typeof row.completionTransition === "boolean" ? row.completionTransition : status === "Completed" && (previous !== undefined && previous !== "Completed" || row.message === "Work item created.");
  if (status) states.set(taskId, status);
  if (local.slice(0, 10) < period.start || local.slice(0, 10) > period.end) continue;
  const key = period.hourly ? local : local.slice(0, 10), bucket = buckets.get(key)!;
  const completion = transition && !completed.has(taskId);
  if (completion) { completed.add(taskId); bucket.completed++; }
  bucket.activity++;
  const task = taskMap.get(taskId)!;
  events.push({ id: row.id, taskId, title: String(task.title || task.id), message: String(row.message || "Activity"), occurredAt: String(row.occurredAt), bucket: key, completion, status, to: operations ? "/operations/work/" + encodeURIComponent(taskId) : null });
 }
 const selected = events.filter(row => !input.bucket || row.bucket === input.bucket).reverse();
 const outstanding = tasks.filter(row => !["Completed", "Cancelled"].includes(String(row.status)));
 const workload = { total: tasks.length, completed: tasks.filter(row => row.status === "Completed").length, inProgress: tasks.filter(row => row.status === "In Progress").length, cancelled: tasks.filter(row => row.status === "Cancelled").length, pending: tasks.filter(row => !["Completed", "In Progress", "Cancelled"].includes(String(row.status))).length };
 return { period, enabled: operations, points: [...buckets.values()], summary: { completed: completed.size, activity: events.length, pending: outstanding.length, overdue: outstanding.filter(row => /^\d{4}-\d{2}-\d{2}$/.test(String(row.dueDate)) && String(row.dueDate) < period.today).length },
  workload, records: selected.slice((input.page - 1) * 20, input.page * 20), recordCount: selected.length, page: input.page };
}
