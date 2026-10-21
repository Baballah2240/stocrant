import { z } from "zod";
import type { AuthenticatedUser } from "./auth.js";
import { isMainManager, isWithinScope } from "./permissions.js";
import { getCollection } from "./storage.js";
import { attendanceClockEmployee, attendanceDate, attendanceSessionsUtc, employeeForUser, ownAttendanceRows, settingsFor, zonedDateTimeToIso } from "./attendance.js";
type Row = Record<string, unknown> & { id: string };
const rows = (name: string) => getCollection(name) as Row[];
export const selfAttendanceQuery = z.object({ range: z.enum(["today", "week", "month", "custom"]).default("month"), from: z.string().date().optional(), to: z.string().date().optional(), page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(50).default(10) }).strict();
function failure(message: string, statusCode = 400): never { throw Object.assign(new Error(message), { statusCode }); }
function rangeDates(input: z.infer<typeof selfAttendanceQuery>, today: string) {
 const day = new Date(today + "T12:00:00Z"), end = new Date(day);
 if (input.range === "week") { day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7); end.setUTCDate(day.getUTCDate() + 6); }
 if (input.range === "month") { day.setUTCDate(1); end.setUTCMonth(end.getUTCMonth() + 1, 0); }
 const from = input.range === "custom" ? input.from : day.toISOString().slice(0, 10), to = input.range === "custom" ? input.to : end.toISOString().slice(0, 10);
 if (!from || !to || from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000) failure("Choose a valid attendance date range of up to one year.");
 return { from, to };
}
function seconds(record: Row, instant: number, start = -Infinity, end = Infinity) {
 return Math.floor(attendanceSessionsUtc(record).reduce((sum, session) => { const first = Date.parse(session.checkIn), last = session.checkOut ? Date.parse(session.checkOut) : instant; return Number.isFinite(first) && Number.isFinite(last) ? sum + Math.max(0, Math.min(last, end) - Math.max(first, start)) / 1000 : sum; }, 0));
}
function shiftFor(user: AuthenticatedUser, employee: Row) {
 const unique = rows("employees").filter(row => row.organizationId === employee.organizationId && row.name === employee.name).length === 1;
 return rows("shifts").find(row => row.organizationId === employee.organizationId && isWithinScope(user, {...row,employeeId:employee.id,locationId:employee.locationId}) && (employee.shiftId === row.id || row.employeeId === employee.id || row.assigneeId === employee.id || [employee.id,user.id,user.email].includes(String(row.assignedTo)) || unique && [row.employee,row.assignedTo].includes(employee.name)));
}
function scheduleFor(user: AuthenticatedUser, employee: Row, date: string) {
 const saved = rows("attendanceSettings").some(row => row.organizationId === employee.organizationId), policy = settingsFor(String(employee.organizationId || "")), shift = shiftFor(user, employee);
 if (!saved && !shift) return null;
 const week = ["sun","mon","tue","wed","thu","fri","sat"], days=String(shift?.days||"").toLowerCase(), range=days.match(/(sun|mon|tue|wed|thu|fri|sat)\s*[-–]\s*(sun|mon|tue|wed|thu|fri|sat)/);
 let working = policy.workingDays;
 if(range){working=[];for(let day=week.indexOf(range[1]);working.length<7;day=(day+1)%7){working.push(day);if(day===week.indexOf(range[2]))break;}}else{const names=days.match(/sun|mon|tue|wed|thu|fri|sat/g);if(names?.length)working=names.map(name=>week.indexOf(name));}
 if(!working.includes(new Date(date+"T12:00:00Z").getUTCDay()))return null;
 const start = String(shift?.start || policy.expectedStart), end = String(shift?.end || policy.expectedEnd);
 if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null;
 const minute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3)); let span = minute(end) - minute(start); if (span <= 0) span += 1440;
 const breakMinutes = Number(shift?.breakMinutes ?? policy.breakMinutes);
 return { name: String(shift?.name || "Company schedule"), start, end, breakMinutes, expectedSeconds: Math.max(0, span - breakMinutes) * 60 };
}
function safeRecord(user: AuthenticatedUser, record: Row, employee: Row, instant: number) {
 const policy = settingsFor(String(employee.organizationId || "")), sessions = attendanceSessionsUtc(record), schedule = scheduleFor(user, employee, String(record.date)), first = sessions[0], last = sessions.at(-1);
 const start = first ? Date.parse(first.checkIn) : NaN, finish = last?.checkOut ? Date.parse(last.checkOut) : NaN;
 let lateMinutes = 0, earlyDepartureMinutes = 0;
 if (schedule) { const expectedStart = Date.parse(zonedDateTimeToIso(String(record.date), schedule.start, policy.timezone)), endDate = new Date(String(record.date) + "T12:00:00Z"); if (schedule.end <= schedule.start) endDate.setUTCDate(endDate.getUTCDate() + 1); const expectedEnd = Date.parse(zonedDateTimeToIso(endDate.toISOString().slice(0, 10), schedule.end, policy.timezone)); lateMinutes = Number.isFinite(start) ? Math.max(0, Math.floor((start - expectedStart) / 60000) - policy.lateGraceMinutes) : 0; earlyDepartureMinutes = Number.isFinite(finish) ? Math.max(0, Math.floor((expectedEnd - finish) / 60000) - policy.earlyDepartureGraceMinutes) : 0; }
 return { id: record.id, date: String(record.date), status: String(record.status || "present"), approvalStatus: String(record.approvalStatus || "Draft"), sessions, checkInAt: first?.checkIn || null, checkOutAt: last?.checkOut || null, recordedSeconds: seconds(record, instant), policyHours: Number.isFinite(Number(record.hours)) ? Number(record.hours) : null, lateMinutes, earlyDepartureMinutes, open: sessions.some(session => !session.checkOut), precision: sessions.some(session => session.precision === "minute") ? "minute" : "second" };
}
export function personalAttendance(user: AuthenticatedUser, input = selfAttendanceQuery.parse({}), instant = new Date()) {
 const serverNow = instant.toISOString(), linked = employeeForUser(user);
 const employee = isMainManager(user) ? null : attendanceClockEmployee(user, true), policy = settingsFor(String(employee?.organizationId || user.organizationIds[0] || ""));
 const today = attendanceDate(instant, policy.timezone), filters = rangeDates(input, today), own = employee ? ownAttendanceRows(user, employee) : [];
 const current = own.find(row => row.date === today), open = own.filter(row => attendanceSessionsUtc(row).some(session => !session.checkOut));
 const dayStart = Date.parse(zonedDateTimeToIso(today, "00:00", policy.timezone)), nextDay = new Date(today + "T12:00:00Z"); nextDay.setUTCDate(nextDay.getUTCDate() + 1); const dayEnd = Date.parse(zonedDateTimeToIso(nextDay.toISOString().slice(0, 10), "00:00", policy.timezone));
 const todayRecordedSeconds = own.reduce((sum, row) => sum + seconds(row, instant.getTime(), dayStart, dayEnd), 0);
 const active = open[0], sessionCount = current ? attendanceSessionsUtc(current).length : 0;
 const editable = (row?: Row) => !row || ["Draft", "Rejected", "Returned for Correction"].includes(String(row.approvalStatus || "Draft"));
 const enabled = Boolean(employee && ["active", "probation"].includes(String(employee.status)) && policy.trackingEnabled);
 const filtered = own.filter(row => String(row.date) >= filters.from && String(row.date) <= filters.to).sort((a, b) => String(b.date).localeCompare(String(a.date)));
 return { serverNow, timezone: policy.timezone, today, dayEnd: new Date(dayEnd).toISOString(), linked: Boolean(linked), enabled, trackingEnabled: policy.trackingEnabled, sessionLimit: 3, sessionCount,
  canCheckIn: enabled && open.length === 0 && sessionCount < 3 && editable(current), canCheckOut: Boolean(employee && ["active","probation"].includes(String(employee.status)) && open.length === 1 && editable(active)),
  status: open.length ? "checked-in" : sessionCount ? "checked-out" : "not-checked-in", needsReview: open.length > 1,
  todayRecordedSeconds, schedule: employee ? scheduleFor(user, employee, today) : null,
  current: employee && (active || current) ? safeRecord(user, active || current!, employee, instant.getTime()) : null,
  filters: { ...filters, range: input.range, page: input.page, limit: input.limit }, total: filtered.length,
  records: employee ? filtered.slice((input.page - 1) * input.limit, input.page * input.limit).map(row => safeRecord(user, row, employee, instant.getTime())) : [] };
}
export function personalAttendanceDetail(user: AuthenticatedUser, id: string) {
 const employee = attendanceClockEmployee(user, true), record = ownAttendanceRows(user, employee).find(row => row.id === id);
 if (!record) failure("Attendance record not found.", 404);
 return { item: safeRecord(user, record, employee, Date.now()), timezone: settingsFor(String(employee.organizationId || "")).timezone, serverNow: new Date().toISOString() };
}
