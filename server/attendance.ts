import type { AuthenticatedUser } from "./auth.js";
import { createNotification } from "./notifications.js";
import { can, companyIdsFor, isDelegatedAdmin, isMainManager, isWithinScope } from "./permissions.js";
import { getCollection, getStore, nextCollectionId, saveStore, transaction } from "./storage.js";
import { audit, type Row } from "./workspace.js";

export const ATTENDANCE_TIME_ZONE = process.env.STOCRANT_TIME_ZONE || "Asia/Qatar";

export type AttendanceStatus = "present" | "absent" | "late" | "half-day" | "on-leave" | "pending-review" | "approved-correction";
export type AttendanceApprovalStatus = "Draft" | "Pending HR Approval" | "Pending General Manager Approval" | "Pending Finance Approval" | "Approved" | "Rejected" | "Returned for Correction";
export type AttendanceDecision = "approve" | "reject" | "return";

type AttendanceRow = Row & {
  organizationId: string;
  employeeId?: string;
  employee?: string;
  date: string;
  sessions?: AttendanceSession[];
  checkIn?: string;
  checkOut?: string;
  checkInAt?: string;
  checkOutAt?: string;
  status?: AttendanceStatus;
  approvalStatus?: AttendanceApprovalStatus;
  approvalHistory?: AttendanceApprovalEntry[];
};

type AttendanceSession = { checkIn: string; checkOut?: string; hours?: number; precision?: "minute" | "second" };
type AttendanceApprovalEntry = {
  stage: string;
  roleId: string;
  decision: "approved" | "rejected" | "returned";
  comment: string;
  decidedAt: string;
  decidedBy: string;
  decidedByName: string;
};

type AttendanceSettings = Row & {
  organizationId: string;
  trackingEnabled: boolean;
  deductionsEnabled: boolean;
  timezone: string;
  workingDays: number[];
  expectedStart: string;
  expectedEnd: string;
  breakMinutes: number;
  lateGraceMinutes: number;
  earlyDepartureGraceMinutes: number;
  overtimeAfterMinutes: number;
  deductLateMinutes: boolean;
  deductEarlyDepartureMinutes: boolean;
  deductMissingHours: boolean;
  deductUnpaidAbsence: boolean;
  deductionMethod: "hourly" | "daily";
  workingDaysPerMonth: number;
  approvalStages: Array<{ key: "hr" | "general" | "finance"; label: string; roleId: string }>;
};

type CorrectionRequest = Row & {
  organizationId: string;
  employeeId: string;
  employee: string;
  attendanceDate: string;
  requestedCheckIn?: string;
  requestedCheckOut?: string;
  reason: string;
  attachmentUrl?: string;
  status: "Pending HR Review" | "Approved" | "Rejected" | "More information requested";
  attendanceId?: string;
  originalAttendance?: Record<string, unknown>;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  hrComment?: string;
};

export interface AttendanceFilters {
  organizationId?: string;
  employeeId?: string;
  department?: string;
  status?: AttendanceStatus | "all";
  from?: string;
  to?: string;
  month?: string;
  year?: string;
  query?: string;
  page?: number;
  limit?: number;
}

const DEFAULT_APPROVAL_STAGES: AttendanceSettings["approvalStages"] = [
  { key: "hr", label: "HR Manager", roleId: "role-hr-manager" },
  { key: "general", label: "General Manager", roleId: "role-general-manager" },
  { key: "finance", label: "Finance Manager", roleId: "role-finance-manager" },
];

function rows(name: string): Row[] {
  return getCollection(name) as Row[];
}

function now() {
  return new Date().toISOString();
}

function failure(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function formatParts(date: Date, timeZone: string) {
  const values = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(values.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

export function attendanceDate(date = new Date(), timeZone = ATTENDANCE_TIME_ZONE) {
  const parts = formatParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function attendanceTime(date = new Date(), timeZone = ATTENDANCE_TIME_ZONE) {
  const parts = formatParts(date, timeZone);
  return `${parts.hour}:${parts.minute}`;
}

function validTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && Number(match[1]) < 24 && Number(match[2]) < 60);
}

function validTimeZone(value: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; }
  catch { return false; }
}

function minutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Converts an unambiguous local business date/time into an ISO UTC timestamp.
 * The iterative conversion also handles zones that observe DST. */
export function zonedDateTimeToIso(date: string, time: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !validTime(time)) failure("Use a valid attendance date and time.");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const intended = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = intended;
  for (let pass = 0; pass < 3; pass += 1) {
    const current = formatParts(new Date(candidate), timeZone);
    const observed = Date.UTC(Number(current.year), Number(current.month) - 1, Number(current.day), Number(current.hour), Number(current.minute), Number(current.second));
    candidate += intended - observed;
  }
  return new Date(candidate).toISOString();
}

function localMinute(value: string, date: string, timeZone: string) {
  if (/^\d{2}:\d{2}$/.test(value)) return minutes(value);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return Number.NaN;
  const parts = formatParts(parsed, timeZone);
  return parts.year === date.slice(0, 4) && `${parts.year}-${parts.month}-${parts.day}` === date ? minutes(`${parts.hour}:${parts.minute}`) : minutes(`${parts.hour}:${parts.minute}`);
}

function sessionHours(session: AttendanceSession) {
  if (!session.checkOut) return 0;
  const start = Date.parse(session.checkIn);
  const end = Date.parse(session.checkOut);
  if (!Number.isNaN(start) && !Number.isNaN(end)) return Math.max(0, (end - start) / 3_600_000);
  const legacyStart = minutes(session.checkIn);
  const legacyEnd = minutes(session.checkOut);
  return Number.isNaN(legacyStart) || Number.isNaN(legacyEnd) || legacyEnd < legacyStart ? 0 : (legacyEnd - legacyStart) / 60;
}

export function attendanceSessionsUtc(record?: Partial<AttendanceRow>): AttendanceSession[] {
  if (!record) return [];
  const source = Array.isArray(record.sessions) ? record.sessions.filter((session): session is AttendanceSession => Boolean(session && typeof session.checkIn === "string")) : typeof record.checkIn === "string" ? [{checkIn: record.checkInAt || record.checkIn, ...(record.checkOutAt || record.checkOut ? {checkOut: record.checkOutAt || record.checkOut} : {})}] : [];
  const timezone = settingsFor(String(record.organizationId || "")).timezone;
  const normalize = (value: string) => validTime(value) && record.date ? zonedDateTimeToIso(record.date, value, timezone) : value;
  return source.map(session => ({...session, checkIn: normalize(session.checkIn), ...(session.checkOut ? {checkOut: normalize(session.checkOut)} : {}), precision: session.precision || (validTime(session.checkIn) ? "minute" : "second")}));
}
const sessionsFor = attendanceSessionsUtc;

function existingSetting(companyId: string) {
  return rows("attendanceSettings").find((row) => row.organizationId === companyId) as AttendanceSettings | undefined;
}

export function defaultAttendanceSettings(companyId: string): AttendanceSettings {
  return {
    id: `attendance-settings-${companyId}`,
    organizationId: companyId,
    trackingEnabled: true,
    deductionsEnabled: false,
    timezone: ATTENDANCE_TIME_ZONE,
    workingDays: [0, 1, 2, 3, 4],
    expectedStart: "08:00",
    expectedEnd: "17:00",
    breakMinutes: 60,
    lateGraceMinutes: 10,
    earlyDepartureGraceMinutes: 0,
    overtimeAfterMinutes: 480,
    deductLateMinutes: true,
    deductEarlyDepartureMinutes: true,
    deductMissingHours: true,
    deductUnpaidAbsence: true,
    deductionMethod: "hourly",
    workingDaysPerMonth: 26,
    approvalStages: structuredClone(DEFAULT_APPROVAL_STAGES),
  };
}

export function settingsFor(companyId: string): AttendanceSettings {
  const saved = existingSetting(companyId);
  if (!saved) return defaultAttendanceSettings(companyId);
  const defaults = defaultAttendanceSettings(companyId);
  const stages = Array.isArray(saved.approvalStages) && saved.approvalStages.length
    ? saved.approvalStages.filter((stage): stage is AttendanceSettings["approvalStages"][number] => Boolean(stage && typeof stage.roleId === "string" && typeof stage.label === "string" && ["hr", "general", "finance"].includes(String(stage.key))))
    : defaults.approvalStages;
  return { ...defaults, ...saved, ...(process.env.STOCRANT_ATTENDANCE_PILOT === "1" ? { deductionsEnabled: false } : {}), workingDays: Array.isArray(saved.workingDays) ? saved.workingDays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : defaults.workingDays, approvalStages: stages.length ? stages : defaults.approvalStages };
}

export function attendanceSettingsForUser(user: AuthenticatedUser, companyId: string) {
  ensureCompanyScope(user, companyId);
  if (!canManageAttendance(user, companyId) && !employeeForUser(user)) failure("You do not have permission to view attendance settings.", 403);
  return settingsFor(companyId);
}

function employeeById(employeeId?: string) {
  return rows("employees").find((employee) => employee.id === employeeId);
}

export function employeeForUser(user: AuthenticatedUser) {
  const employee = user.employeeId ? employeeById(user.employeeId) : undefined;
  return employee;
}

function companyForEmployee(employee: Row) {
  return text(employee.organizationId) || text(employee.companyId);
}

export function attendanceCompanyForUser(user: AuthenticatedUser, requested?: string) {
  if (requested) return requested;
  if (user.organizationIds[0]) return user.organizationIds[0];
  if (isMainManager(user)) {
    const company = rows("companies").find((item) => item.status !== "inactive");
    if (company?.id) return String(company.id);
  }
  return "";
}

function ensureCompanyScope(user: AuthenticatedUser, companyId: string) {
  if (isMainManager(user)) return;
  if (!companyId || !companyIdsFor(user).includes(companyId)) failure("This attendance record is outside your assigned company.", 403);
}

function canManageAttendance(user: AuthenticatedUser, companyId: string) {
  ensureCompanyScope(user, companyId);
  return isMainManager(user) || isDelegatedAdmin(user) || can(user, "hr", "edit") || user.roleId === "role-hr-manager";
}

function canConfigureAttendance(user: AuthenticatedUser, companyId: string) {
  ensureCompanyScope(user, companyId);
  return isMainManager(user) || isDelegatedAdmin(user);
}

function isRoleApprover(user: AuthenticatedUser, roleId: string) {
  return isMainManager(user) || user.roleId === roleId;
}

function activeEmployee(employee: Row) {
  return employee.status === "active" || employee.status === "probation";
}

function isApprovedLeave(employee: Row, date: string) {
  return rows("leaveRequests").some((leave) => {
    const sameEmployee = leave.employeeId === employee.id || text(leave.employee).toLowerCase() === text(employee.name).toLowerCase();
    return sameEmployee && leave.status === "approved" && text(leave.from) <= date && text(leave.to) >= date;
  });
}

function expectedMinutes(settings: AttendanceSettings) {
  const start = minutes(settings.expectedStart);
  const end = minutes(settings.expectedEnd);
  return Math.max(0, end - start - Math.max(0, settings.breakMinutes));
}

function stageStatus(stage: AttendanceSettings["approvalStages"][number]): AttendanceApprovalStatus {
  if (stage.key === "hr") return "Pending HR Approval";
  if (stage.key === "general") return "Pending General Manager Approval";
  return "Pending Finance Approval";
}

function currentStage(record: AttendanceRow, settings: AttendanceSettings) {
  const history = Array.isArray(record.approvalHistory) ? record.approvalHistory : [];
  return settings.approvalStages[history.filter((entry) => entry.decision === "approved").length];
}

function canReviewAttendance(user: AuthenticatedUser, companyId: string) {
  ensureCompanyScope(user, companyId);
  return isMainManager(user) || isDelegatedAdmin(user) || ["role-hr-manager", "role-general-manager", "role-finance-manager"].includes(user.roleId) || (can(user, "hr", "view") && !user.ownRecordsOnly);
}

function notifyMissingPunches(user: AuthenticatedUser, companyId: string, settings: AttendanceSettings) {
  const currentDate = attendanceDate(new Date(), settings.timezone);
  for (const record of rows("attendance") as AttendanceRow[]) {
    if (record.organizationId !== companyId || record.date >= currentDate || !sessionsFor(record).some((session) => !session.checkOut)) continue;
    const employee = employeeById(record.employeeId);
    if (!employee) continue;
    const target = `attendance-missing:${record.id}`;
    const duplicate = rows("notifications").some((notification) => notification.target === target);
    if (duplicate) continue;
    notifyEmployee(employee, `Your attendance for ${record.date} is missing a clock-out. Submit a correction request for review.`, target);
    const hrStage = settings.approvalStages.find((stage) => stage.key === "hr") ?? settings.approvalStages[0];
    notifyRole(companyId, hrStage.roleId, `${employee.name} has an attendance record missing a clock-out for ${record.date}.`, target);
    audit(user, "attendance.missing-punch.notified", { collection: "attendance", targetId: record.id, employeeId: employee.id, date: record.date });
  }
}

function payrollPeriod(date: string) {
  return date.slice(0, 7);
}

function employeeDeductionEnabled(employee: Row, settings: AttendanceSettings) {
  return settings.deductionsEnabled && employee.attendanceDeductionEnabled !== false;
}

export function enrichAttendance(record: AttendanceRow, employee: Row, settings: AttendanceSettings) {
  const sessions = sessionsFor(record);
  const completed = sessions.filter((session) => Boolean(session.checkOut));
  const recordedMinutes = Math.round(completed.reduce((sum, session) => sum + sessionHours(session) * 60, 0));
  // A single continuous session includes the planned unpaid break; multiple
  // completed sessions already represent actual on-the-clock intervals.
  const totalMinutes = Math.max(0, recordedMinutes - (completed.length === 1 ? Math.max(0, settings.breakMinutes) : 0));
  const first = sessions[0];
  const last = completed[completed.length - 1];
  const firstMinute = first ? localMinute(first.checkIn, record.date, settings.timezone) : Number.NaN;
  const lastMinute = last?.checkOut ? localMinute(last.checkOut, record.date, settings.timezone) : Number.NaN;
  const start = minutes(settings.expectedStart);
  const end = minutes(settings.expectedEnd);
  const rawLateMinutes = Number.isNaN(firstMinute) ? 0 : Math.max(0, firstMinute - start);
  const rawEarlyDepartureMinutes = Number.isNaN(lastMinute) ? 0 : Math.max(0, end - lastMinute);
  const lateMinutes = Math.max(0, rawLateMinutes - settings.lateGraceMinutes);
  const earlyDepartureMinutes = Math.max(0, rawEarlyDepartureMinutes - settings.earlyDepartureGraceMinutes);
  const expected = expectedMinutes(settings);
  const missingMinutes = !sessions.length ? expected : Math.max(0, expected - totalMinutes);
  const overtimeMinutes = Math.max(0, totalMinutes - settings.overtimeAfterMinutes);
  const onLeave = isApprovedLeave(employee, record.date);
  let status: AttendanceStatus = record.status ?? "absent";
  if (onLeave) status = "on-leave";
  else if (!["pending-review", "approved-correction", "absent"].includes(status)) {
    if (!sessions.length) status = "absent";
    else if (totalMinutes < expected / 2) status = "half-day";
    else if (lateMinutes > 0) status = "late";
    else status = "present";
  }
  const unpaidAbsenceMinutes = status === "absent" && !onLeave ? expected : 0;
  // Missing time reported from total working hours includes late arrivals and
  // early departures. Keep their policy calculations mutually exclusive so an
  // employee is not charged twice for the same missed minutes.
  const unaccountedMissingMinutes = Math.max(0, missingMinutes - rawLateMinutes - rawEarlyDepartureMinutes);
  const actualDeductionMinutes = status === "on-leave" ? 0 : (settings.deductUnpaidAbsence && unpaidAbsenceMinutes
    ? unpaidAbsenceMinutes
    : (settings.deductMissingHours ? unaccountedMissingMinutes : 0) + (settings.deductLateMinutes ? lateMinutes : 0) + (settings.deductEarlyDepartureMinutes ? earlyDepartureMinutes : 0));
  const monthlySalary = Number(employee.salary ?? 0);
  const dailyRate = monthlySalary > 0 ? monthlySalary / Math.max(1, settings.workingDaysPerMonth) : 0;
  const hourlyRate = dailyRate / Math.max(1, expected / 60);
  const estimatedDeduction = employeeDeductionEnabled(employee, settings)
    ? settings.deductionMethod === "daily" && unpaidAbsenceMinutes ? dailyRate : hourlyRate * (actualDeductionMinutes / 60)
    : 0;
  return {
    ...record,
    employee: employee.name,
    employeeCode: employee.employeeCode,
    department: employee.department,
    sessions: sessions.map((session) => ({ ...session, hours: Number(sessionHours(session).toFixed(2)) })),
    checkIn: first ? attendanceTime(new Date(first.checkIn), settings.timezone) : record.checkIn,
    checkOut: last?.checkOut ? attendanceTime(new Date(last.checkOut), settings.timezone) : record.checkOut,
    hours: Number((totalMinutes / 60).toFixed(2)),
    expectedHours: Number((expected / 60).toFixed(2)),
    lateMinutes,
    earlyDepartureMinutes,
    missingMinutes,
    overtimeMinutes,
    status,
    approvalStatus: record.approvalStatus ?? "Draft",
    estimatedDeduction: Number(estimatedDeduction.toFixed(2)),
    deductionBreakdown: {
      enabled: employeeDeductionEnabled(employee, settings),
      method: settings.deductionMethod,
      hourlyRate: Number(hourlyRate.toFixed(4)),
      dailyRate: Number(dailyRate.toFixed(4)),
      unpaidAbsenceMinutes,
      lateMinutes: settings.deductLateMinutes ? lateMinutes : 0,
      earlyDepartureMinutes: settings.deductEarlyDepartureMinutes ? earlyDepartureMinutes : 0,
      missingMinutes: settings.deductMissingHours ? unaccountedMissingMinutes : 0,
      reportedMissingMinutes: missingMinutes,
      deductedMinutes: actualDeductionMinutes,
    },
  };
}

function recordFor(employeeId: string, date: string) {
  const employee = employeeById(employeeId);
  const employeeName = text(employee?.name).toLowerCase();
  return rows("attendance").find((record) => record.date === date && (record.employeeId === employeeId || (!record.employeeId && employeeName && text(record.employee).toLowerCase() === employeeName))) as AttendanceRow | undefined;
}

function writeRow(name: string, value: Row) {
  const data = getStore();
  const current = (data.collections[name] ?? []) as Row[];
  const index = current.findIndex((row) => row.id === value.id);
  data.collections[name] = index >= 0 ? current.map((row) => row.id === value.id ? value : row) : [...current, value];
  saveStore(data);
  return value;
}

function notifyRole(companyId: string, roleId: string, message: string, target: string) {
  for (const account of rows("accessUsers")) {
    const inCompany = account.roleId === "role-main-manager" || list(account.organizationIds).includes(companyId);
    if (account.status === "active" && inCompany && (account.roleId === roleId || account.roleId === "role-main-manager")) {
      createNotification({ userId: account.id, user: String(account.name ?? "Approver"), type: "message", severity: "info", message, target });
    }
  }
}

function notifyEmployee(employee: Row, message: string, target: string) {
  const account = rows("accessUsers").find((candidate) => candidate.employeeId === employee.id);
  if (account?.id) createNotification({ userId: account.id, user: String(account.name ?? employee.name), type: "message", severity: "info", message, target });
}

export function attendanceClockEmployee(user: AuthenticatedUser, accountOnly = false): Row {
  if (isMainManager(user)) failure("The Main Admin account cannot check in or check out.", 403);
  const linked = employeeForUser(user);
  if (linked) { if (!isWithinScope(user, linked)) failure("Your employee attendance profile is outside your assigned scope.", 403); return linked; }
  if (!accountOnly) failure("Your account must be linked to an active employee profile before you can clock in.", 403);
  return {id:user.id, name:user.name, email:user.email, organizationId:user.organizationIds[0], locationId:user.locationIds[0], status:"active", accountOnly:true};
}
export function ownAttendanceRows(user: AuthenticatedUser, employee: Row) {
  const uniqueName = rows("employees").filter(row => row.organizationId === employee.organizationId && row.name === employee.name).length === 1;
  return (rows("attendance") as AttendanceRow[]).filter(row => row.organizationId === employee.organizationId && (employee.accountOnly ? row.accountId === user.id && (!row.employeeId || row.employeeId === user.id) : row.employeeId === employee.id || !row.employeeId && (row.accountId === user.id || !row.accountId && (Boolean(employee.email) && row.email === employee.email || uniqueName && row.employee === employee.name))) && isWithinScope(user, row));
}
function editableClockRecord(record?: AttendanceRow) {
  if (record && !["Draft", "Rejected", "Returned for Correction"].includes(record.approvalStatus || "Draft")) failure("This attendance record is under review or finalized. Ask HR for a correction.", 409);
}
export function clockIn(user: AuthenticatedUser, accountOnly = false, requestId?: string) {
  return transaction(() => {
    const employee = attendanceClockEmployee(user, accountOnly);
    if (!activeEmployee(employee)) failure("Only active employees can clock in.", 403);
    const companyId = companyForEmployee(employee);
    ensureCompanyScope(user, companyId);
    const settings = settingsFor(companyId);
    if (!settings.trackingEnabled) failure("Attendance tracking is disabled for this company.", 409);
    const instant = new Date();
    const date = attendanceDate(instant, settings.timezone);
    const own = ownAttendanceRows(user, employee);
    const requestKey = requestId ? `${user.id}:in:${requestId}` : "";
    const replay = requestKey && own.find(row => Array.isArray(row.clockRequests) && row.clockRequests.includes(requestKey));
    if (replay) return enrichAttendance(replay, employee, settings);
    if (own.some(row => sessionsFor(row).some(session => !session.checkOut))) failure("Clock out of your current attendance session before clocking in again.", 409);
    const active = own.find(row => row.date === date);
    editableClockRecord(active);
    const sessions = sessionsFor(active);
    if (sessions.length >= 3) failure("You have completed the maximum of three attendance sessions today.", 409);
    if (sessions.some((session) => !session.checkOut)) failure("Clock out of your current attendance session before clocking in again.", 409);
    const next: AttendanceRow = {
      ...(active ?? { id: nextCollectionId("attendance"), organizationId: companyId, employeeId: employee.id, employee: employee.name, date, approvalStatus: "Draft" as const }),
      organizationId: companyId,
      employeeId: employee.accountOnly ? undefined : employee.id,
      accountId: user.id,
      locationId: employee.locationId,
      clockRequests: [...(Array.isArray(active?.clockRequests) ? active.clockRequests : []), ...(requestKey ? [requestKey] : [])].slice(-6),
      createdAt: active?.createdAt || instant.toISOString(),
      employee: String(employee.name),
      date,
      sessions: [...sessions, { checkIn: instant.toISOString() }],
      checkInAt: active?.checkInAt ?? instant.toISOString(),
      checkIn: active?.checkIn ?? attendanceTime(instant, settings.timezone),
      checkOutAt: undefined,
      checkOut: undefined,
      status: "present",
      updatedAt: now(),
    };
    writeRow("attendance", next);
    audit(user, "attendance.clocked-in", { collection: "attendance", targetId: next.id, employeeId: employee.id, date });
    return {...enrichAttendance(next, employee, settings), status: "present"};
  });
}

export function clockOut(user: AuthenticatedUser, accountOnly = false, requestId?: string) {
  return transaction(() => {
    const employee = attendanceClockEmployee(user, accountOnly);
    const companyId = companyForEmployee(employee);
    ensureCompanyScope(user, companyId);
    const settings = settingsFor(companyId);
    const own = ownAttendanceRows(user, employee), requestKey = requestId ? `${user.id}:out:${requestId}` : "";
    const replay = requestKey && own.find(row => Array.isArray(row.clockRequests) && row.clockRequests.includes(requestKey));
    if (replay) return enrichAttendance(replay, employee, settings);
    const open = own.filter(row => sessionsFor(row).some(session => !session.checkOut));
    if (open.length > 1) failure("Multiple open attendance records need HR review.", 409);
    const record = open[0];
    if (!record) failure("No open attendance session was found for today.", 409);
    editableClockRecord(record);
    const sessions = sessionsFor(record);
    let sessionIndex = -1;
    for (let index = sessions.length - 1; index >= 0; index -= 1) {
      if (!sessions[index].checkOut) { sessionIndex = index; break; }
    }
    if (sessionIndex < 0) failure("There is no open attendance session to clock out from.", 409);
    const instant = new Date();
    if (Date.parse(instant.toISOString()) <= Date.parse(sessions[sessionIndex].checkIn)) failure("Clock-out must be later than clock-in.", 409);
    const complete = { ...sessions[sessionIndex], checkOut: instant.toISOString() };
    sessions[sessionIndex] = { ...complete, hours: Number(sessionHours(complete).toFixed(2)) };
    const next: AttendanceRow = {
      ...record,
      clockRequests: [...(Array.isArray(record.clockRequests) ? record.clockRequests : []), ...(requestKey ? [requestKey] : [])].slice(-6),
      sessions,
      checkOutAt: instant.toISOString(),
      checkOut: attendanceTime(instant, settings.timezone),
      updatedAt: now(),
    };
    writeRow("attendance", next);
    const enriched = enrichAttendance(next, employee, settings);
    writeRow("attendance", { ...next, status: enriched.status, hours: enriched.hours, lateMinutes: enriched.lateMinutes, earlyDepartureMinutes: enriched.earlyDepartureMinutes, missingMinutes: enriched.missingMinutes, overtimeMinutes: enriched.overtimeMinutes, estimatedDeduction: enriched.estimatedDeduction });
    audit(user, "attendance.clocked-out", { collection: "attendance", targetId: next.id, employeeId: employee.id, date: record.date });
    return enrichAttendance({ ...next, status: enriched.status }, employee, settings);
  });
}

function filterDates(filters: AttendanceFilters, settings: AttendanceSettings) {
  const today = attendanceDate(new Date(), settings.timezone);
  if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) return { from: `${filters.month}-01`, to: `${filters.month}-31` };
  if (filters.year && /^\d{4}$/.test(filters.year)) return { from: `${filters.year}-01-01`, to: `${filters.year}-12-31` };
  return { from: filters.from || today, to: filters.to || today };
}

function datesBetween(from: string, to: string) {
  const result: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) failure("Use a valid attendance date range.");
  if ((end.getTime() - start.getTime()) / 86_400_000 > 366) failure("Attendance reports can cover up to 367 days at a time.");
  for (let current = start; current <= end; current = new Date(current.getTime() + 86_400_000)) result.push(current.toISOString().slice(0, 10));
  return result;
}

function visibleEmployees(user: AuthenticatedUser, companyId: string, employeeId?: string) {
  return rows("employees").filter((employee) => activeEmployee(employee) && companyForEmployee(employee) === companyId && (!employeeId || employee.id === employeeId) && isWithinScope(user, employee));
}

export function attendanceDashboard(user: AuthenticatedUser, filters: AttendanceFilters = {}) {
  const companyId = attendanceCompanyForUser(user, filters.organizationId);
  if (!companyId) failure("Choose a company to view attendance.");
  ensureCompanyScope(user, companyId);
  const settings = settingsFor(companyId);
  notifyMissingPunches(user, companyId, settings);
  const self = employeeForUser(user);
  const reviews = canReviewAttendance(user, companyId);
  const manages = canManageAttendance(user, companyId);
  const employeeId = reviews ? filters.employeeId : self?.id;
  if (!reviews && !employeeId) failure("Your account is not linked to an employee attendance profile.", 403);
  const { from, to } = filterDates(filters, settings);
  const employeeRows = visibleEmployees(user, companyId, employeeId).filter((employee) => !filters.department || filters.department === "all" || employee.department === filters.department);
  const dates = datesBetween(from, to);
  const persisted = rows("attendance") as AttendanceRow[];
  const output: Array<Record<string, unknown>> = [];
  for (const employee of employeeRows) {
    for (const date of dates) {
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (!settings.workingDays.includes(weekday) || (text(employee.hireDate) && text(employee.hireDate) > date)) continue;
      const saved = persisted.find((record) => record.date === date && (record.employeeId === employee.id || (!record.employeeId && text(record.employee).toLowerCase() === text(employee.name).toLowerCase())) && (!record.organizationId || record.organizationId === companyId));
      const virtual: AttendanceRow = saved ?? { id: `missing-${employee.id}-${date}`, organizationId: companyId, employeeId: employee.id, employee: String(employee.name), date, status: isApprovedLeave(employee, date) ? "on-leave" : "absent", approvalStatus: "Draft" };
      const enriched = { ...enrichAttendance(virtual, employee, settings), virtual: !saved };
      if (filters.status && filters.status !== "all" && enriched.status !== filters.status) continue;
      const needle = text(filters.query).toLowerCase();
      if (needle && ![enriched.employee, enriched.employeeCode, enriched.department, enriched.date, enriched.status].some((value) => String(value ?? "").toLowerCase().includes(needle))) continue;
      output.push(enriched);
    }
  }
  output.sort((a, b) => `${String(b.date)}-${String(a.employee)}`.localeCompare(`${String(a.date)}-${String(b.employee)}`));
  const today = attendanceDate(new Date(), settings.timezone);
  const todayRows = output.filter((record) => record.date === today);
  const present = todayRows.filter((record) => ["present", "late", "half-day", "approved-correction"].includes(String(record.status)));
  const pendingCorrections = (rows("attendanceCorrectionRequests") as CorrectionRequest[]).filter((request) => request.organizationId === companyId && request.status === "Pending HR Review").length;
  const trend = dates.map((date) => {
    const items = output.filter((record) => record.date === date);
    return { date, present: items.filter((record) => ["present", "late", "half-day", "approved-correction"].includes(String(record.status))).length, absent: items.filter((record) => record.status === "absent").length, late: items.filter((record) => record.status === "late").length, hours: Number(items.reduce((sum, record) => sum + Number(record.hours ?? 0), 0).toFixed(2)) };
  });
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const limit = Math.min(100, Math.max(10, Math.floor(filters.limit ?? 25)));
  const start = (page - 1) * limit;
  return {
    settings,
    permissions: { canReview: reviews, canManage: manages, canConfigure: canConfigureAttendance(user, companyId), canApprove: settings.approvalStages.some((stage) => isRoleApprover(user, stage.roleId)) },
    filters: { companyId, from, to, page, limit },
    employees: employeeRows.map((employee) => ({ id: employee.id, name: employee.name, employeeCode: employee.employeeCode, department: employee.department })),
    departments: [...new Set(employeeRows.map((employee) => text(employee.department)).filter(Boolean))].sort(),
    metrics: {
      totalEmployees: employeeRows.length,
      presentToday: present.length,
      absentToday: todayRows.filter((record) => record.status === "absent").length,
      lateToday: todayRows.filter((record) => record.status === "late").length,
      currentlyWorking: todayRows.filter((record) => Array.isArray(record.sessions) && (record.sessions as AttendanceSession[]).some((session) => !session.checkOut)).length,
      pendingCorrections,
      totalRecordedHours: Number(output.reduce((sum, record) => sum + Number(record.hours ?? 0), 0).toFixed(2)),
    },
    trend,
    records: output.slice(start, start + limit),
    total: output.length,
  };
}

export function saveAttendanceSettings(user: AuthenticatedUser, companyId: string, input: Partial<AttendanceSettings>) {
  return transaction(() => {
    if (!canConfigureAttendance(user, companyId)) failure("Only authorized administrators can change attendance settings.", 403);
    const current = settingsFor(companyId);
    if (process.env.STOCRANT_ATTENDANCE_PILOT === "1" && input.deductionsEnabled === true) failure("Salary deductions are disabled during the attendance pilot.", 409);
    if (!isMainManager(user) && input.approvalStages && JSON.stringify(input.approvalStages) !== JSON.stringify(current.approvalStages)) failure("Only the Main Admin can change approval stages.", 403);
    const next: AttendanceSettings = {
      ...current,
      ...input,
      id: current.id,
      organizationId: companyId,
      workingDays: Array.isArray(input.workingDays) ? input.workingDays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : current.workingDays,
      approvalStages: Array.isArray(input.approvalStages) ? input.approvalStages : current.approvalStages,
      updatedAt: now(),
    };
    if (!validTimeZone(next.timezone)) failure("Choose a valid IANA business timezone, for example Asia/Qatar.");
    if (!validTime(next.expectedStart) || !validTime(next.expectedEnd) || minutes(next.expectedEnd) <= minutes(next.expectedStart)) failure("Working hours must have a valid start and end time.");
    if (!next.workingDays.length) failure("Select at least one working day.");
    if (!Number.isInteger(next.breakMinutes) || next.breakMinutes < 0 || next.breakMinutes >= minutes(next.expectedEnd) - minutes(next.expectedStart)) failure("Break duration must be shorter than the scheduled workday.");
    if (!Number.isInteger(next.workingDaysPerMonth) || next.workingDaysPerMonth < 1 || next.workingDaysPerMonth > 31) failure("Working days per month must be between 1 and 31.");
    if (next.approvalStages.length < 1 || next.approvalStages.some((stage) => !stage || !["hr", "general", "finance"].includes(String(stage.key)) || !text(stage.label) || !text(stage.roleId) || !rows("accessRoles").some((role) => role.id === stage.roleId))) failure("Choose valid approval roles.");
    const keys = next.approvalStages.map((stage) => stage.key);
    if (keys.length !== 3 || keys.some((key, index) => key !== ["hr", "general", "finance"][index])) failure("Approval stages must include HR, General Manager, then Finance Manager in that order.");
    writeRow("attendanceSettings", next);
    audit(user, "attendance.settings.updated", { collection: "attendanceSettings", targetId: next.id, organizationId: companyId });
    return next;
  });
}

export function createManualAttendance(user: AuthenticatedUser, input: { organizationId: string; employeeId: string; date: string; checkIn?: string; checkOut?: string; status?: AttendanceStatus; note?: string }) {
  return transaction(() => {
    if (!canManageAttendance(user, input.organizationId)) failure("You do not have permission to record attendance.", 403);
    const employee = employeeById(input.employeeId);
    if (!employee || companyForEmployee(employee) !== input.organizationId || !isWithinScope(user, employee)) failure("Choose an employee in your assigned company.", 403);
    if (recordFor(input.employeeId, input.date)) failure("An attendance record already exists for this employee and date.", 409);
    const settings = settingsFor(input.organizationId);
    if (input.date > attendanceDate(new Date(), settings.timezone)) failure("Attendance cannot be recorded for a future business date.");
    if (input.checkIn && !validTime(input.checkIn) || input.checkOut && !validTime(input.checkOut)) failure("Use valid clock-in and clock-out times.");
    if (input.checkIn && input.checkOut && minutes(input.checkOut) <= minutes(input.checkIn)) failure("Clock-out must be later than clock-in.");
    const sessions = input.checkIn ? [{ checkIn: zonedDateTimeToIso(input.date, input.checkIn, settings.timezone), ...(input.checkOut ? { checkOut: zonedDateTimeToIso(input.date, input.checkOut, settings.timezone) } : {}) }] : [];
    const row: AttendanceRow = {
      id: nextCollectionId("attendance"), organizationId: input.organizationId, employeeId: employee.id, employee: String(employee.name), date: input.date,
      sessions, checkIn: input.checkIn, checkOut: input.checkOut, checkInAt: sessions[0]?.checkIn, checkOutAt: sessions[0]?.checkOut,
      status: input.status ?? (sessions.length ? "present" : "absent"), approvalStatus: isMainManager(user)?"Approved":"Draft", ...(isMainManager(user)?{finalizedAt:now(),finalizedBy:user.id}:{}), note: text(input.note), createdBy: user.id, createdByName: user.name,
    };
    const enriched = enrichAttendance(row, employee, settings);
    writeRow("attendance", { ...row, status: enriched.status, hours: enriched.hours, estimatedDeduction: enriched.estimatedDeduction });
    if(isMainManager(user))postPayrollDeduction(row,employee,settings,user);
    audit(user, "attendance.recorded", { collection: "attendance", targetId: row.id, employeeId: employee.id, date: row.date });
    return enriched;
  });
}

export function submitAttendanceForApproval(user: AuthenticatedUser, attendanceId: string, comment = "") {
  return transaction(() => {
    const record = rows("attendance").find((candidate) => candidate.id === attendanceId) as AttendanceRow | undefined;
    if (!record) failure("Attendance record not found.", 404);
    if (!canManageAttendance(user, record.organizationId) || !isWithinScope(user, record)) failure("You do not have permission to submit this attendance record.", 403);
    if (!["Draft", "Returned for Correction", "Rejected"].includes(record.approvalStatus ?? "Draft")) failure("This attendance record is already in an approval workflow.", 409);
    const settings = settingsFor(record.organizationId);
    if(isMainManager(user)){const next:AttendanceRow={...record,approvalStatus:"Approved",submittedBy:user.id,submittedAt:now(),finalizedBy:user.id,finalizedAt:now(),updatedAt:now()};writeRow("attendance",next);const employee=employeeById(record.employeeId);if(employee)postPayrollDeduction(next,employee,settings,user);audit(user,"attendance.main-finalized",{targetId:record.id,organizationId:record.organizationId});if(!employee)failure("Employee not found.",404);return enrichAttendance(next,employee,settings);}
    const first = settings.approvalStages[0];
    const next: AttendanceRow = { ...record, approvalStatus: stageStatus(first), approvalHistory: [], submittedAt: now(), submittedBy: user.id, submittedByName: user.name, submissionComment: text(comment), updatedAt: now() };
    writeRow("attendance", next);
    audit(user, "attendance.submitted", { collection: "attendance", targetId: record.id, employeeId: record.employeeId });
    notifyRole(record.organizationId, first.roleId, `Attendance for ${record.employee ?? "an employee"} on ${record.date} is awaiting ${first.label} approval.`, `attendance:${record.id}`);
    return next;
  });
}

function postPayrollDeduction(record: AttendanceRow, employee: Row, settings: AttendanceSettings, actor: AuthenticatedUser) {
  const detailed = enrichAttendance(record, employee, settings);
  const amount = Number(detailed.estimatedDeduction ?? 0);
  if (!employeeDeductionEnabled(employee, settings) || amount <= 0) return { posted: false, reason: "Deductions are disabled or no attendance deduction is due." };
  const period = payrollPeriod(record.date);
  const existingAdjustment = rows("attendancePayrollAdjustments").find((adjustment) => adjustment.attendanceId === record.id);
  if (existingAdjustment) return { posted: existingAdjustment.status === "posted", adjustment: existingAdjustment };
  // New payroll runs derive attendance once from immutable source snapshots.
  // Queue approval metadata; never update their salary totals or legacy drafts.
  if (rows("payrollSettings").some(setting => setting.organizationId === record.organizationId && setting.configured === true)) {
    const adjustment: Row = { id: nextCollectionId("attendancePayrollAdjustments"), organizationId: record.organizationId, attendanceId: record.id, employeeId: employee.id, period, amount, status: "source-approved", reason: "Available to the controlled payroll calculator; not posted separately.", createdBy: actor.id, createdAt: now() };
    writeRow("attendancePayrollAdjustments", adjustment);
    return { posted: false, adjustment };
  }
  const payroll = rows("payroll").find((item) => (item.employeeId === employee.id || text(item.employee) === text(employee.name)) && item.period === period);
  if (payroll && ["approved", "paid", "final"].includes(String(payroll.status).toLowerCase())) {
    const adjustment: Row = { id: nextCollectionId("attendancePayrollAdjustments"), organizationId: record.organizationId, attendanceId: record.id, employeeId: employee.id, employee: employee.name, period, amount, status: "pending", reason: "Attendance deduction approved after the payroll record was finalized.", createdBy: actor.id, createdAt: now() };
    writeRow("attendancePayrollAdjustments", adjustment);
    const financeStage = settings.approvalStages.find((stage) => stage.key === "finance");
    notifyRole(record.organizationId, financeStage?.roleId ?? "role-finance-manager", `Attendance deduction for ${employee.name} requires a payroll adjustment for ${period}.`, `attendance-adjustment:${adjustment.id}`);
    return { posted: false, adjustment };
  }
  const base = payroll ?? { id: nextCollectionId("payroll"), organizationId: record.organizationId, employeeId: employee.id, employee: employee.name, period, basic: Number(employee.salary ?? 0), allowances: 0, deductions: 0, tax: 0, status: "draft", attendanceDeductionIds: [] };
  const appliedIds = list(base.attendanceDeductionIds);
  if (appliedIds.includes(record.id)) return { posted: true, payroll: base };
  const totalDeductions = Number(base.deductions ?? 0) + amount;
  const netPay = Number(base.basic ?? 0) + Number(base.allowances ?? 0) - totalDeductions - Number(base.tax ?? 0);
  const nextPayroll: Row = { ...base, deductions: Number(totalDeductions.toFixed(2)), netPay: Number(netPay.toFixed(2)), attendanceDeductionIds: [...appliedIds, record.id], attendanceDeductionBreakdown: [...(Array.isArray(base.attendanceDeductionBreakdown) ? base.attendanceDeductionBreakdown : []), { attendanceId: record.id, date: record.date, amount, breakdown: detailed.deductionBreakdown }], updatedAt: now() };
  writeRow("payroll", nextPayroll);
  const adjustment: Row = { id: nextCollectionId("attendancePayrollAdjustments"), organizationId: record.organizationId, attendanceId: record.id, payrollId: nextPayroll.id, employeeId: employee.id, employee: employee.name, period, amount, status: "posted", reason: "Approved attendance-based deduction.", createdBy: actor.id, createdAt: now() };
  writeRow("attendancePayrollAdjustments", adjustment);
  notifyEmployee(employee, `An attendance deduction of ${amount.toFixed(2)} was calculated for ${record.date}.`, `attendance:${record.id}`);
  return { posted: true, payroll: nextPayroll, adjustment };
}

export function decideAttendanceApproval(user: AuthenticatedUser, attendanceId: string, decision: AttendanceDecision, comment: string) {
  return transaction(() => {
    const record = rows("attendance").find((candidate) => candidate.id === attendanceId) as AttendanceRow | undefined;
    if (!record) failure("Attendance record not found.", 404);
    ensureCompanyScope(user, record.organizationId);
    if (!isWithinScope(user, record)) failure("This attendance record is outside your assigned scope.", 403);
    const settings = settingsFor(record.organizationId);
    const stage = currentStage(record, settings);
    if (!stage || !String(record.approvalStatus ?? "").startsWith("Pending ")) failure("This attendance record is not awaiting a decision.", 409);
    if (!isRoleApprover(user, stage.roleId)) failure(`Only the assigned ${stage.label} can decide this attendance record.`, 403);
    if (["reject", "return"].includes(decision) && text(comment).length < 3) failure("Provide a comment when rejecting or returning attendance.");
    const history = Array.isArray(record.approvalHistory) ? record.approvalHistory : [];
    if (history.some((entry) => entry.stage === stage.key)) failure("This approval stage has already been decided.", 409);
    const entry: AttendanceApprovalEntry = { stage: stage.key, roleId: stage.roleId, decision: decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "returned", comment: text(comment), decidedAt: now(), decidedBy: user.id, decidedByName: user.name };
    let approvalStatus: AttendanceApprovalStatus;
    if (decision === "reject") approvalStatus = "Rejected";
    else if (decision === "return") approvalStatus = "Returned for Correction";
    else {
      const approvedStages = history.filter((item) => item.decision === "approved").length + 1;
      approvalStatus = isMainManager(user)||approvedStages >= settings.approvalStages.length ? "Approved" : stageStatus(settings.approvalStages[approvedStages]);
    }
    const next: AttendanceRow = { ...record, approvalStatus, approvalHistory: [...history, entry], updatedAt: now(), ...(approvalStatus === "Approved" ? { finalizedAt: now(), finalizedBy: user.id } : {}) };
    writeRow("attendance", next);
    const employee = employeeById(record.employeeId);
    if (employee) {
      notifyEmployee(employee, `Attendance for ${record.date} was ${decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "returned for correction"} by ${stage.label}.${comment ? ` ${text(comment)}` : ""}`, `attendance:${record.id}`);
      if (approvalStatus === "Approved") postPayrollDeduction(next, employee, settings, user);
    }
    if (decision === "approve" && approvalStatus !== "Approved") {
      const nextStage = currentStage(next, settings);
      if (nextStage) notifyRole(next.organizationId, nextStage.roleId, `Attendance for ${record.employee ?? "an employee"} on ${record.date} is awaiting ${nextStage.label} approval.`, `attendance:${record.id}`);
    }
    audit(user, `attendance.approval.${decision}`, { collection: "attendance", targetId: record.id, employeeId: record.employeeId, stage: stage.key, comment: text(comment) });
    return next;
  });
}

export function submitCorrectionRequest(user: AuthenticatedUser, input: { attendanceDate: string; requestedCheckIn?: string; requestedCheckOut?: string; reason: string; attachmentUrl?: string }) {
  return transaction(() => {
    const employee = employeeForUser(user);
    if (!employee) failure("Your account must be linked to an employee profile to request an attendance correction.", 403);
    const companyId = companyForEmployee(employee);
    ensureCompanyScope(user, companyId);
    const settings = settingsFor(companyId);
    if (input.attendanceDate > attendanceDate(new Date(), settings.timezone)) failure("Attendance corrections can only be requested for a current or past business date.");
    if (!input.requestedCheckIn && !input.requestedCheckOut) failure("Provide a requested clock-in or clock-out time.");
    if (input.requestedCheckIn && !validTime(input.requestedCheckIn) || input.requestedCheckOut && !validTime(input.requestedCheckOut)) failure("Use valid requested clock times.");
    if (input.requestedCheckIn && input.requestedCheckOut && minutes(input.requestedCheckOut) <= minutes(input.requestedCheckIn)) failure("Requested clock-out must be later than requested clock-in.");
    if (text(input.reason).length < 3) failure("Explain why this attendance correction is needed.");
    const duplicate = (rows("attendanceCorrectionRequests") as CorrectionRequest[]).some((request) => request.employeeId === employee.id && request.attendanceDate === input.attendanceDate && request.status === "Pending HR Review");
    if (duplicate) failure("A correction request for this date is already awaiting HR review.", 409);
    const source = recordFor(employee.id, input.attendanceDate);
    const request: CorrectionRequest = {
      id: nextCollectionId("attendanceCorrectionRequests"), organizationId: companyId, employeeId: employee.id, employee: String(employee.name), attendanceDate: input.attendanceDate,
      ...(input.requestedCheckIn ? { requestedCheckIn: input.requestedCheckIn } : {}), ...(input.requestedCheckOut ? { requestedCheckOut: input.requestedCheckOut } : {}),
      reason: text(input.reason), ...(text(input.attachmentUrl) ? { attachmentUrl: text(input.attachmentUrl) } : {}), status: "Pending HR Review", attendanceId: source?.id, originalAttendance: source ? structuredClone(source) : undefined, submittedAt: now(), timezone: settings.timezone,
    };
    writeRow("attendanceCorrectionRequests", request);
    const hrStage = settings.approvalStages.find((stage) => stage.key === "hr") ?? settings.approvalStages[0];
    notifyRole(companyId, hrStage.roleId, `${employee.name} submitted an attendance correction request for ${input.attendanceDate}.`, `attendance-correction:${request.id}`);
    audit(user, "attendance.correction.submitted", { collection: "attendanceCorrectionRequests", targetId: request.id, employeeId: employee.id, attendanceDate: input.attendanceDate });
    return request;
  });
}

export function correctionRequests(user: AuthenticatedUser, companyId?: string) {
  const scope = companyId || user.organizationIds[0];
  if (!scope) failure("Choose a company to review correction requests.");
  ensureCompanyScope(user, scope);
  const employee = employeeForUser(user);
  const manages = canManageAttendance(user, scope);
  return (rows("attendanceCorrectionRequests") as CorrectionRequest[])
    .filter((request) => request.organizationId === scope && (manages ? isWithinScope(user, request) : request.employeeId === employee?.id))
    .sort((a, b) => String(b.submittedAt ?? b.createdAt).localeCompare(String(a.submittedAt ?? a.createdAt)));
}

export function decideCorrectionRequest(user: AuthenticatedUser, requestId: string, action: "approve" | "reject" | "more-information", comment: string) {
  return transaction(() => {
    const request = rows("attendanceCorrectionRequests").find((row) => row.id === requestId) as CorrectionRequest | undefined;
    if (!request) failure("Attendance correction request not found.", 404);
    if (!canManageAttendance(user, request.organizationId)) failure("You do not have permission to review attendance corrections.", 403);
    if (!isWithinScope(user, request)) failure("This correction request is outside your assigned scope.", 403);
    const settings = settingsFor(request.organizationId);
    const hrStage = settings.approvalStages.find((stage) => stage.key === "hr") ?? settings.approvalStages[0];
    if (!isRoleApprover(user, hrStage.roleId)) failure("Only the assigned HR Manager can review attendance corrections.", 403);
    if (request.status !== "Pending HR Review" && request.status !== "More information requested") failure("This correction request has already been finalized.", 409);
    if (action !== "approve" && text(comment).length < 3) failure("Provide an HR comment for this decision.");
    const employee = employeeById(request.employeeId);
    if (!employee) failure("The employee linked to this request no longer exists.", 409);
    let attendanceId = request.attendanceId;
    if (action === "approve") {
      const original = recordFor(request.employeeId, request.attendanceDate);
      const nextSessions: AttendanceSession[] = request.requestedCheckIn
        ? [{ checkIn: zonedDateTimeToIso(request.attendanceDate, request.requestedCheckIn, settings.timezone), ...(request.requestedCheckOut ? { checkOut: zonedDateTimeToIso(request.attendanceDate, request.requestedCheckOut, settings.timezone) } : {}) }]
        : sessionsFor(original);
      if (!nextSessions.length && request.requestedCheckOut) failure("A clock-in time is required before a clock-out correction can be approved.");
      const base: AttendanceRow = original ?? { id: nextCollectionId("attendance"), organizationId: request.organizationId, employeeId: employee.id, employee: String(employee.name), date: request.attendanceDate, approvalStatus: "Draft" };
      const corrected: AttendanceRow = { ...base, sessions: nextSessions, checkIn: request.requestedCheckIn ?? base.checkIn, checkOut: request.requestedCheckOut ?? base.checkOut, checkInAt: nextSessions[0]?.checkIn, checkOutAt: nextSessions[nextSessions.length - 1]?.checkOut, status: "approved-correction", approvalStatus: !isMainManager(user)&&settings.approvalStages.length > 1 ? stageStatus(settings.approvalStages[1]) : "Approved", approvalHistory: [{ stage: hrStage.key, roleId: hrStage.roleId, decision: "approved", comment: text(comment), decidedAt: now(), decidedBy: user.id, decidedByName: user.name }], correctionRequestId: request.id, updatedAt: now() };
      const enriched = enrichAttendance(corrected, employee, settings);
      writeRow("attendance", { ...corrected, status: "approved-correction", hours: enriched.hours, estimatedDeduction: enriched.estimatedDeduction });
      attendanceId = corrected.id;
      if (corrected.approvalStatus === "Approved") postPayrollDeduction(corrected, employee, settings, user);
      else {
        const stage = currentStage(corrected, settings);
        if (stage) notifyRole(request.organizationId, stage.roleId, `Corrected attendance for ${employee.name} on ${request.attendanceDate} is awaiting ${stage.label} approval.`, `attendance:${corrected.id}`);
      }
    } else if (action === "reject") {
      const source = recordFor(request.employeeId, request.attendanceDate);
      const base: AttendanceRow = source ?? { id: nextCollectionId("attendance"), organizationId: request.organizationId, employeeId: employee.id, employee: String(employee.name), date: request.attendanceDate, sessions: [], approvalStatus: "Draft" };
      if (["Approved", "Pending General Manager Approval", "Pending Finance Approval"].includes(base.approvalStatus ?? "Draft")) failure("The related attendance record is already in a finalized or downstream workflow.", 409);
      const absence: AttendanceRow = {
        ...base,
        sessions: sessionsFor(base),
        status: "absent",
        approvalStatus: settings.approvalStages.length > 1 ? stageStatus(settings.approvalStages[1]) : "Approved",
        approvalHistory: [{ stage: hrStage.key, roleId: hrStage.roleId, decision: "approved", comment: `Correction rejected: ${text(comment)}`, decidedAt: now(), decidedBy: user.id, decidedByName: user.name }],
        correctionRequestId: request.id,
        updatedAt: now(),
      };
      const enriched = enrichAttendance(absence, employee, settings);
      writeRow("attendance", { ...absence, hours: enriched.hours, estimatedDeduction: enriched.estimatedDeduction });
      attendanceId = absence.id;
      if (absence.approvalStatus === "Approved") postPayrollDeduction(absence, employee, settings, user);
      else {
        const stage = currentStage(absence, settings);
        if (stage) notifyRole(request.organizationId, stage.roleId, `Absent attendance for ${employee.name} on ${request.attendanceDate} is awaiting ${stage.label} approval.`, `attendance:${absence.id}`);
      }
    }
    const status = action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "More information requested";
    const nextRequest: CorrectionRequest = { ...request, status, attendanceId, reviewedAt: now(), reviewedBy: user.id, reviewedByName: user.name, hrComment: text(comment), updatedAt: now() };
    writeRow("attendanceCorrectionRequests", nextRequest);
    notifyEmployee(employee, `Your attendance correction request for ${request.attendanceDate} was ${status.toLowerCase()}.${comment ? ` ${text(comment)}` : ""}`, `attendance-correction:${request.id}`);
    audit(user, `attendance.correction.${action}`, { collection: "attendanceCorrectionRequests", targetId: request.id, employeeId: employee.id, attendanceId, comment: text(comment) });
    return nextRequest;
  });
}
