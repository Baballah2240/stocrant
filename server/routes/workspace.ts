import { Router } from "express";
import { z } from "zod";
import { hashPassword, publicUser } from "../auth.js";
import { can, isMainManager, isWithinScope, redactRecord, requirePermission, sectionForCollection } from "../permissions.js";
import { registry } from "../registry.js";
import { getCollection, getStore, nextCollectionId, saveStore } from "../storage.js";
import { createNotification, listNotifications } from "../notifications.js";
import { approveRequest, audit, financeSummary, inventorySummary, mutateCollection, type Row } from "../workspace.js";

const router = Router();

function sendError(res: import("express").Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed.";
  const status = message.includes("permission") ? 403 : message.includes("not found") ? 404 : 400;
  return res.status(status).json({ error: message });
}

function rows(name: string) {
  return getCollection(name) as Row[];
}

function scoped(req: import("express").Request, list: Row[], collection: string) {
  return list.filter((row) => isWithinScope(req.auth!, row)).map((row) => redactRecord(collection, row, req.auth!));
}

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function matchesUser(row: Row, user: NonNullable<import("express").Request["auth"]>) {
  const identities = new Set([user.id, user.employeeId, user.email, user.name].map(normalized).filter(Boolean));
  return [row.id, row.employeeId, row.assigneeId, row.assignee, row.employee, row.email, row.assignedTo, row.createdById]
    .map(normalized)
    .some((value) => identities.has(value));
}

function newestAt(row: Row) {
  for (const value of [row.updatedAt, row.createdAt, row.issuedOn, row.date]) {
    if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return value;
  }
  return "";
}

const attendanceTimeZone = process.env.STOCRANT_TIME_ZONE || "Asia/Riyadh";
function dateStamp(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: attendanceTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function timeStamp(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: attendanceTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

function attendanceTimeInMinutes(value: unknown) {
  if (typeof value !== "string") return undefined;
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return (hours * 60) + minutes;
}

type AttendanceSession = { checkIn: string; checkOut?: string; hours: number };
function attendanceSessions(row?: Row): AttendanceSession[] {
  if (Array.isArray(row?.sessions)) return row.sessions as AttendanceSession[];
  if (typeof row?.checkIn === "string") return [{ checkIn: row.checkIn, ...(typeof row.checkOut === "string" ? { checkOut: row.checkOut } : {}), hours: Number(row.hours) || 0 }];
  return [];
}

function employeeFor(user: NonNullable<import("express").Request["auth"]>) {
  const employees = rows("employees");
  if (user.employeeId) {
    const linkedEmployee = employees.find((item) => item.id === user.employeeId);
    if (linkedEmployee) return linkedEmployee;
  }
  return employees.find((item) => normalized(item.email) === normalized(user.email));
}

function attendanceForEmployee(user: NonNullable<import("express").Request["auth"]>, employee: Row, date: string) {
  return rows("attendance")
    .filter((item) => item.date === date && (item.accountId ? item.accountId === user.id : item.employeeId === employee.id || matchesUser(item, user)))
    .sort((a, b) => newestAt(b).localeCompare(newestAt(a)))[0];
}

function persistAttendance(user: NonNullable<import("express").Request["auth"]>, item: Record<string, unknown>, existing?: Row): Row {
  const data = getStore();
  const timestamp = new Date().toISOString();
  const attendance: Row = existing
    ? { ...existing, ...item, id: existing.id, updatedAt: timestamp, updatedBy: user.id, updatedByName: user.name }
    : {
      ...item,
      id: nextCollectionId("attendance"),
      createdAt: timestamp,
      createdBy: user.id,
      createdByName: user.name,
      updatedAt: timestamp,
      updatedBy: user.id,
      updatedByName: user.name,
      dataClassification: "company",
    };
  const list = rows("attendance");
  data.collections.attendance = existing ? list.map((row) => row.id === existing.id ? attendance : row) : [...list, attendance];
  saveStore(data);
  return attendance;
}

function isCompanyPolicy(row: Row, user: NonNullable<import("express").Request["auth"]>) {
  if (!isMainManager(user) && !user.organizationIds.includes(String(row.organizationId ?? row.companyId ?? ""))) return false;
  if (normalized(row.type) !== "policy") return false;
  const audience = normalized(row.employee ?? row.audience);
  return !audience || ["all", "all employees", "everyone", "company", "company-wide"].includes(audience) || matchesUser(row, user);
}

function csvCell(value: unknown) {
  const text = Array.isArray(value) ? value.map(String).join("; ") : value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

router.get("/overview", (req, res) => {
  const data = getStore();
  const user = req.auth!;
  const work = can(req.auth, "operations", "view") ? scoped(req, rows("workItems"), "workItems") : [];
  const inventory = can(req.auth, "inventory", "view") ? inventorySummary(req.auth) : { items: [], lowStockCount: 0 };
  const finance = can(req.auth, "finance", "view") ? financeSummary(req.auth) : { accounts: [], income: 0, expenses: 0, salaries: 0, net: 0 };
  const pendingApprovals = can(req.auth, "approvals", "view") ? rows("approvalRequests").filter((row) => row.status === "pending").length : 0;
  const employee = rows("employees").find((item) => isWithinScope(user, item) && matchesUser(item, user));
  const personalWork = can(req.auth, "operations", "view")
    ? rows("workItems").filter((item) => isWithinScope(user, item) && matchesUser(item, user)).sort((a, b) => String(a.dueDate ?? "").localeCompare(String(b.dueDate ?? "")))
    : [];
  const personalLeave = rows("leaveRequests").filter((item) => isWithinScope(user, item) && matchesUser(item, user)).sort((a, b) => String(b.updatedAt ?? b.from ?? "").localeCompare(String(a.updatedAt ?? a.from ?? "")));
  const todayAttendance = rows("attendance").filter((item) => item.date === dateStamp(new Date()) && (item.accountId ? item.accountId === user.id : matchesUser(item, user))).sort((a, b) => newestAt(b).localeCompare(newestAt(a)))[0];
  const nextShift = rows("shifts").find((item) => isWithinScope(user, item) && matchesUser(item, user));
  const notifications = listNotifications(user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const account = rows("accessUsers").find((item) => item.id === user.id);
  const previousLoginAt = typeof account?.previousLoginAt === "string" ? account.previousLoginAt : undefined;
  const policies = rows("documents")
    .filter((item) => isCompanyPolicy(item, user))
    .sort((a, b) => newestAt(b).localeCompare(newestAt(a)))
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: String(item.title ?? "Untitled policy"),
      publishedAt: newestAt(item),
      fileUrl: typeof item.fileUrl === "string" ? item.fileUrl : "",
      isNew: !previousLoginAt || Date.parse(newestAt(item)) > Date.parse(previousLoginAt),
    }));
  res.json({
    organizations: can(req.auth, "organizations", "view") ? scoped(req, rows("companies"), "companies").length : 0,
    locations: can(req.auth, "locations", "view") ? data.stores.filter((store) => isWithinScope(req.auth!, store as unknown as Row)).length : 0,
    activeEmployees: can(req.auth, "hr", "view") ? scoped(req, rows("employees"), "employees").filter((employee) => employee.status === "active").length : 0,
    work: { total: work.length, overdue: work.filter((item) => String(item.dueDate) < new Date().toISOString().slice(0, 10) && !["Completed", "Cancelled"].includes(String(item.status))).length },
    inventory: { lowStockCount: inventory.lowStockCount },
    finance: { net: finance.net },
    pendingApprovals,
    personal: {
      registered: Boolean(employee),
      attendanceEnabled: !isMainManager(user),
      profile: {
        name: user.name,
        email: user.email,
        employeeCode: employee?.employeeCode,
        jobTitle: employee?.jobTitle,
        department: employee?.department,
        location: employee?.location,
        employmentStatus: employee?.status,
        manager: employee?.manager,
      },
      lastLoginAt: account?.lastLoginAt,
      attendance: todayAttendance ? {
        date: todayAttendance.date,
        status: todayAttendance.status,
        checkIn: todayAttendance.checkIn,
        checkOut: todayAttendance.checkOut,
        workMode: todayAttendance.workMode,
        hours: todayAttendance.hours,
        sessions: attendanceSessions(todayAttendance),
        sessionCount: attendanceSessions(todayAttendance).length,
      } : null,
      shift: nextShift ? {
        name: nextShift.name,
        start: nextShift.start,
        end: nextShift.end,
        days: nextShift.days,
        breakMinutes: nextShift.breakMinutes,
      } : null,
      leave: personalLeave.slice(0, 3),
      pendingLeaveCount: personalLeave.filter((item) => item.status === "pending").length,
      work: personalWork.slice(0, 5),
      workCount: personalWork.length,
      overdueWorkCount: personalWork.filter((item) => String(item.dueDate) < new Date().toISOString().slice(0, 10) && !["Completed", "Cancelled"].includes(String(item.status))).length,
      notifications: notifications.slice(0, 4),
      unreadNotificationCount: notifications.filter((item) => !item.read).length,
      policyUpdates: policies,
      newPolicyCount: policies.filter((item) => item.isNew).length,
    },
  });
});

router.get("/self-service", (req, res) => {
  const user = req.auth!;
  const employee = employeeFor(user);
  const own = (row: Row) => isWithinScope(user, row) && (row.accountId ? row.accountId === user.id : row.employeeId ? row.employeeId === employee?.id : matchesUser(row, user));
  res.json({
    employee: employee ? redactRecord("employees", employee, user) : null,
    attendance: rows("attendance").filter(own).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 90),
    leave: rows("leaveRequests").filter(own).sort((a, b) => newestAt(b).localeCompare(newestAt(a))),
    documents: (can(user, "hr", "view") ? rows("documents") : []).filter((row) => own(row) || (isCompanyPolicy(row, user) && (!row.organizationId || row.organizationId === employee?.organizationId))),
  });
});

router.post("/self-service/leave", (req, res) => {
  const user = req.auth!;
  const employee = employeeFor(user);
  if (isMainManager(user)) return res.status(403).json({ error: "The main admin cannot request leave." });
  const parsed = z.object({ type: z.enum(["annual", "sick", "unpaid", "other"]), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().min(1).max(2000) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose leave dates, a type and a reason." });
  const from = Date.parse(`${parsed.data.from}T00:00:00Z`), to = Date.parse(`${parsed.data.to}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 366 * 86400000 || new Date(from).toISOString().slice(0, 10) !== parsed.data.from || new Date(to).toISOString().slice(0, 10) !== parsed.data.to) return res.status(400).json({ error: "Choose a valid date range of up to one year." });
  if (rows("leaveRequests").some((row) => (row.accountId ? row.accountId === user.id : Boolean(employee && row.employeeId === employee.id)) && ["pending", "approved"].includes(String(row.status)) && String(row.from) <= parsed.data.to && String(row.to) >= parsed.data.from)) return res.status(409).json({ error: "You already have a leave request covering these dates." });
  const item = { id: nextCollectionId("leaveRequests"), ...parsed.data, employee: employee?.name || user.name, employeeId: employee?.id, accountId: user.id, organizationId: employee?.organizationId || user.organizationIds[0], locationId: employee?.locationId || user.locationIds[0], days: Math.round((to - from) / 86400000) + 1, status: "pending", createdAt: new Date().toISOString(), createdBy: user.id, dataClassification: "company" };
  const data = getStore(); data.collections.leaveRequests = [...rows("leaveRequests"), item]; saveStore(data);
  audit(user, "leave.self-service-requested", { collection: "leaveRequests", targetId: item.id });
  for (const manager of rows("accessUsers").filter((row) => row.roleId === "role-main-manager" && row.status === "active")) createNotification({ userId: manager.id, user: String(manager.name), type: "leave_request", severity: "warning", message: `${user.name} requested ${parsed.data.type} leave from ${parsed.data.from} to ${parsed.data.to}. Review in HR leave requests.`, target: item.id });
  res.status(201).json({ item });
});

router.post("/self-service/leave/:id/cancel", (req, res) => {
  const user = req.auth!, employee = employeeFor(user);
  const item = rows("leaveRequests").find((row) => row.id === req.params.id && (row.accountId ? row.accountId === user.id : Boolean(employee && row.employeeId === employee.id)));
  if (!item) return res.status(404).json({ error: "Leave request not found." });
  if (item.status !== "pending") return res.status(409).json({ error: "Only pending requests can be cancelled." });
  const data = getStore(); data.collections.leaveRequests = rows("leaveRequests").map((row) => row.id === item.id ? { ...row, status: "cancelled", updatedAt: new Date().toISOString(), updatedBy: user.id } : row); saveStore(data);
  audit(user, "leave.self-service-cancelled", { collection: "leaveRequests", targetId: item.id }); res.json({ ok: true });
});

router.post("/attendance/check-in", (req, res) => {
  const user = req.auth!;
  if (isMainManager(user)) return res.status(403).json({ error: "The Main Manager account cannot check in or check out." });
  const employee = employeeFor(user) ?? { id: user.id, name: user.name, email: user.email, status: "active" };

  const now = new Date();
  const date = dateStamp(now);
  const existing = attendanceForEmployee(user, employee, date);
  const sessions = attendanceSessions(existing);
  if (sessions.some(session => !session.checkOut)) {
    return res.status(409).json({ error: "You have already checked in today." });
  }
  if (sessions.length >= 3) return res.status(409).json({ error: "You have completed the maximum of three attendance sessions today." });
  sessions.push({ checkIn: timeStamp(now), hours: 0 });

  const item = persistAttendance(user, {
    employee: String(employee.name ?? user.name),
    employeeId: employeeFor(user)?.id,
    accountId: user.id,
    organizationId: employee.organizationId ?? user.organizationIds[0],
    locationId: employee.locationId ?? user.locationIds[0],
    email: String(employee.email ?? user.email),
    date,
    checkIn: timeStamp(now),
    checkOut: undefined,
    sessions,
    workMode: existing?.workMode ?? "office",
    status: "present",
    hours: existing?.hours ?? 0,
  }, existing);
  audit(user, "attendance.checked-in", { collection: "attendance", targetId: item.id, employeeId: employee.id, date });
  res.status(existing ? 200 : 201).json({ item });
});

router.post("/attendance/check-out", (req, res) => {
  const user = req.auth!;
  if (isMainManager(user)) return res.status(403).json({ error: "The Main Manager account cannot check in or check out." });
  const employee = employeeFor(user) ?? { id: user.id, name: user.name, email: user.email, status: "active" };

  const now = new Date();
  const date = dateStamp(now);
  const existing = attendanceForEmployee(user, employee, date);
  const sessions = attendanceSessions(existing);
  const current = sessions[sessions.length - 1];
  const checkInMinutes = attendanceTimeInMinutes(current?.checkIn);
  if (!existing || checkInMinutes === undefined) return res.status(409).json({ error: "Check in before checking out." });
  if (Boolean(current.checkOut)) {
    return res.status(409).json({ error: "You have already checked out today." });
  }

  const checkOut = timeStamp(now);
  const workedMinutes = (attendanceTimeInMinutes(checkOut) ?? checkInMinutes) - checkInMinutes;
  if (workedMinutes < 0) return res.status(409).json({ error: "Check-out time must be after check-in time." });
  const completed = sessions.map((session, index) => index === sessions.length - 1 ? { ...session, checkOut, hours: Number((workedMinutes / 60).toFixed(2)) } : session);
  const item = persistAttendance(user, {
    ...existing,
    employee: String(employee.name ?? user.name),
    employeeId: employee.id,
    email: String(employee.email ?? user.email),
    date,
    checkOut,
    status: "present",
    sessions: completed,
    hours: Number(completed.reduce((sum, session) => sum + session.hours, 0).toFixed(2)),
  }, existing);
  audit(user, "attendance.checked-out", { collection: "attendance", targetId: item.id, employeeId: employee.id, date, hours: item.hours });
  res.json({ item });
});

router.get("/export/:collection", (req, res) => {
  const collection = req.params.collection as string;
  const known = registry.some((spec) => spec.collection === collection) || ["workItems", "inventoryItems", "inventoryMovements", "financeAccounts", "financeTransactions", "locationUpdates"].includes(collection);
  if (!known) return res.status(404).json({ error: "Unknown export collection." });
  const section = sectionForCollection(collection);
  if (!can(req.auth, section, "export")) return res.status(403).json({ error: `You do not have permission to export ${section}.` });
  const items = scoped(req, rows(collection), collection).map((item) => {
    const safe = { ...item };
    delete safe.passwordHash;
    return safe;
  });
  const keys = [...new Set(items.flatMap((item) => Object.keys(item)))].filter((key) => !["id", "createdAt", "updatedAt"].includes(key));
  const csv = [keys.join(","), ...items.map((item) => keys.map((key) => csvCell(item[key])).join(","))].join("\n");
  audit(req.auth, "data.exported", { collection, section, count: items.length });
  res.json({ filename: `stocrant-${collection}.csv`, csv });
});

router.get("/locations", requirePermission("locations", "view"), (req, res) => {
  const data = getStore();
  const employees = rows("employees");
  const updates = rows("locationUpdates");
  const items = data.stores.filter((store) => isWithinScope(req.auth!, store as unknown as Row)).map((store) => ({
    ...store,
    linkedEmployees: employees.filter((employee) => employee.locationId === store.id || employee.storeId === store.id).length,
    updates: updates.filter((update) => update.locationId === store.id).sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt))),
  }));
  const companies = rows("companies").filter((company) => isWithinScope(req.auth!, { ...company, organizationId: company.id }));
  res.json({ items, companies });
});

router.post("/locations/:id/updates", requirePermission("locations", "edit"), (req, res) => {
  const parsed = z.object({ note: z.string().trim().min(1).max(2000), status: z.string().trim().max(80).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A location update note is required." });
  const location = getStore().stores.find((store) => store.id === req.params.id);
  if (!location || !isWithinScope(req.auth!, location as unknown as Row)) return res.status(404).json({ error: "Location not found." });
  const result = mutateCollection(req.auth!, "locationUpdates", "create", {
    locationId: location.id,
    organizationId: location.companyId,
    note: parsed.data.note,
    status: parsed.data.status ?? location.status,
    occurredAt: new Date().toISOString(),
    madeBy: req.auth!.name,
    madeById: req.auth!.id,
  });
  res.status(result.pending ? 202 : 201).json(result);
});

router.get("/hr/companies", requirePermission("hr", "view"), (req, res) => {
  const companies = rows("companies").filter((company) => isWithinScope(req.auth!, { ...company, organizationId: company.id }));
  res.json({ companies, employees: scoped(req, rows("employees"), "employees") });
});

router.get("/hr/birthdays", requirePermission("hr", "view"), (req, res) => {
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(today.getDate() + 60);
  const upcoming = scoped(req, rows("employees"), "employees").filter((employee) => {
    if (typeof employee.birthday !== "string") return false;
    const [, month, day] = employee.birthday.split("-").map(Number);
    const occurrence = new Date(today.getFullYear(), month - 1, day);
    if (occurrence < today) occurrence.setFullYear(today.getFullYear() + 1);
    return occurrence <= horizon;
  }).sort((a, b) => String(a.birthday).slice(5).localeCompare(String(b.birthday).slice(5)));
  res.json({ items: upcoming });
});

router.get("/hr/overview", requirePermission("hr", "view"), (req, res) => {
  const now = new Date();
  const today = dateStamp(now);
  const employees = scoped(req, rows("employees"), "employees");
  const attendance = scoped(req, rows("attendance"), "attendance").filter((item) => item.date === today);
  const leaveRequests = scoped(req, rows("leaveRequests"), "leaveRequests");
  const history = scoped(req, rows("employeeHistory"), "employeeHistory");
  const allPendingApprovals = can(req.auth, "approvals", "view")
    ? rows("approvalRequests")
      .filter((item) => item.status === "pending" && item.section === "hr")
      .sort((a, b) => newestAt(b).localeCompare(newestAt(a)))
    : [];
  const pendingApprovals = allPendingApprovals.slice(0, 6);
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 60);
  const birthdays = employees
    .filter((employee) => {
      if (typeof employee.birthday !== "string") return false;
      const [, month, day] = employee.birthday.split("-").map(Number);
      const occurrence = new Date(now.getFullYear(), month - 1, day);
      if (occurrence < now) occurrence.setFullYear(occurrence.getFullYear() + 1);
      return occurrence <= horizon;
    })
    .sort((a, b) => String(a.birthday).slice(5).localeCompare(String(b.birthday).slice(5)))
    .slice(0, 5);
  const present = attendance.filter((item) => ["present", "late", "remote", "half-day"].includes(normalized(item.status))).length;

  res.json({
    today,
    metrics: {
      totalEmployees: employees.length,
      activeEmployees: employees.filter((item) => normalized(item.status) === "active").length,
      onLeaveEmployees: employees.filter((item) => normalized(item.status) === "on-leave").length,
      presentEmployees: present,
      attendanceRecorded: attendance.length,
      pendingLeave: leaveRequests.filter((item) => normalized(item.status) === "pending").length,
      pendingApprovals: allPendingApprovals.length,
    },
    attendance: attendance
      .sort((a, b) => String(a.employee ?? "").localeCompare(String(b.employee ?? "")))
      .slice(0, 8),
    leaveRequests: leaveRequests
      .filter((item) => normalized(item.status) === "pending")
      .sort((a, b) => String(a.from ?? "").localeCompare(String(b.from ?? "")))
      .slice(0, 6),
    birthdays,
    activity: history
      .sort((a, b) => String(b.updatedAt ?? b.createdAt ?? b.date ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? a.date ?? "")))
      .slice(0, 6),
    approvals: pendingApprovals,
  });
});

router.get("/work", requirePermission("operations", "view"), (req, res) => {
  const view = String(req.query.view ?? "all");
  const today = new Date().toISOString().slice(0, 10);
  let items = scoped(req, rows("workItems"), "workItems");
  if (view === "mine") items = items.filter((item) => item.assigneeId === req.auth!.employeeId || item.assignee === req.auth!.name || item.assignee === req.auth!.email);
  if (view === "upcoming") items = items.filter((item) => String(item.dueDate) >= today && !["Completed", "Cancelled"].includes(String(item.status)));
  if (view === "overdue") items = items.filter((item) => String(item.dueDate) < today && !["Completed", "Cancelled"].includes(String(item.status)));
  res.json({ companies: rows("companies").filter((company) => isWithinScope(req.auth!, { ...company, organizationId: company.id })), items: items.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))), activity: scoped(req, rows("workActivity"), "workActivity") });
});

router.post("/work", requirePermission("operations", "create"), (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(1).max(180), organizationId: z.string().optional(), locationId: z.string().optional(),
    assignee: z.string().trim().max(120).optional(), assigneeId: z.string().optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    priority: z.enum(["Low", "Medium", "High", "Urgent"]).default("Medium"), status: z.enum(["Planned", "Assigned", "In Progress", "Awaiting Approval", "Completed", "Cancelled"]).default("Planned"),
    workflow: z.string().trim().max(120).optional(), progress: z.coerce.number().min(0).max(100).default(0), comments: z.string().max(4000).optional(), attachments: z.string().max(2000).optional(), inventoryUsage: z.string().max(1000).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  try {
    const result = mutateCollection(req.auth!, "workItems", "create", parsed.data);
    res.status(result.pending ? 202 : 201).json(result);
  } catch (error) { sendError(res, error); }
});

router.patch("/work/:id", requirePermission("operations", "edit"), (req, res) => {
  const existing = rows("workItems").find((item) => item.id === req.params.id);
  if (!existing || !isWithinScope(req.auth!, existing)) return res.status(404).json({ error: "Work item not found." });
  try {
    const result = mutateCollection(req.auth!, "workItems", "edit", req.body as Record<string, unknown>, existing.id);
    res.status(result.pending ? 202 : 200).json(result);
  } catch (error) { sendError(res, error); }
});

router.post("/work/:id/activity", requirePermission("operations", "edit"), (req, res) => {
  const parsed = z.object({ message: z.string().trim().min(1).max(2000), progress: z.coerce.number().min(0).max(100).optional(), status: z.enum(["Planned", "Assigned", "In Progress", "Awaiting Approval", "Completed", "Cancelled"]).optional(), attachments: z.string().max(2000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter an activity update." });
  const existing = rows("workItems").find((item) => item.id === req.params.id);
  if (!existing || !isWithinScope(req.auth!, existing)) return res.status(404).json({ error: "Work item not found." });
  try {
    const result = mutateCollection(req.auth!, "workItems", "edit", { ...parsed.data, comments: parsed.data.message }, existing.id);
    if (!result.pending) mutateCollection(req.auth!, "workActivity", "create", { workItemId: existing.id, message: parsed.data.message, progress: parsed.data.progress ?? existing.progress, status: parsed.data.status ?? existing.status, occurredAt: new Date().toISOString() });
    res.status(result.pending ? 202 : 201).json(result);
  } catch (error) { sendError(res, error); }
});

router.get("/inventory", requirePermission("inventory", "view"), (req, res) => {
  const summary = inventorySummary(req.auth);
  const items = scoped(req, summary.items, "inventoryItems");
  const companies = rows("companies").filter((company) => isWithinScope(req.auth!, { ...company, organizationId: company.id }));
  const employees = isMainManager(req.auth) ? rows("employees").filter((employee) => isWithinScope(req.auth!, employee)).map((employee) => ({ id: employee.id, name: employee.name, organizationId: employee.organizationId ?? employee.companyId })) : [];
  res.json({ items, companies, employees, lowStockCount: items.filter((item) => item.lowStock).length, movements: scoped(req, summary.movements, "inventoryMovements"), history: scoped(req, rows("inventoryHistory"), "inventoryHistory") });
});

router.post("/inventory/items", requirePermission("inventory", "create"), (req, res) => {
  const parsed = z.object({ sku: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(180), unit: z.string().trim().min(1).max(40), stockLocation: z.string().trim().min(1).max(140), organizationId: z.string().min(1), itemType: z.enum(["ingredient", "finished-product", "equipment", "consumable", "packaging", "other"]), allowedEmployeeIds: z.array(z.string()).default([]), notes: z.string().max(2000).default(""), locationId: z.string().optional(), openingStock: z.coerce.number().min(0).default(0), reorderPoint: z.coerce.number().min(0).default(0), allowNegative: z.boolean().default(false) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  const company = rows("companies").find((company) => company.id === parsed.data.organizationId);
  if (!company || !isWithinScope(req.auth!, { ...company, organizationId: company.id })) return res.status(400).json({ error: "Choose a valid company." });
  if (parsed.data.allowedEmployeeIds.length && !isMainManager(req.auth)) return res.status(403).json({ error: "Only the main admin can assign inventory access." });
  if (parsed.data.allowedEmployeeIds.some((id) => !rows("employees").some((employee) => employee.id === id && (employee.organizationId ?? employee.companyId) === company.id))) return res.status(400).json({ error: "Select employees from this company." });
  try { const result = mutateCollection(req.auth!, "inventoryItems", "create", parsed.data); res.status(result.pending ? 202 : 201).json(result); } catch (error) { sendError(res, error); }
});

router.patch("/inventory/items/:id", requirePermission("inventory", "edit"), (req, res) => {
  const existing = rows("inventoryItems").find((item) => item.id === req.params.id);
  if (!existing || !isWithinScope(req.auth!, existing)) return res.status(404).json({ error: "Inventory item not found." });
  const parsed = z.object({ name: z.string().trim().min(1).max(180), unit: z.string().trim().min(1).max(40), stockLocation: z.string().trim().min(1).max(140), itemType: z.enum(["ingredient", "finished-product", "equipment", "consumable", "packaging", "other"]), reorderPoint: z.coerce.number().min(0), notes: z.string().max(2000), allowedEmployeeIds: z.array(z.string()).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Check the item details." });
  if (parsed.data.allowedEmployeeIds && !isMainManager(req.auth)) return res.status(403).json({ error: "Only the main admin can assign inventory access." });
  if (parsed.data.allowedEmployeeIds?.some((id) => !rows("employees").some((employee) => employee.id === id && (employee.organizationId ?? employee.companyId) === existing.organizationId))) return res.status(400).json({ error: "Select employees from this company." });
  try { const result = mutateCollection(req.auth!, "inventoryItems", "edit", parsed.data, existing.id); res.status(result.pending ? 202 : 200).json(result); } catch (error) { sendError(res, error); }
});

router.post("/inventory/movements", requirePermission("inventory", "create"), (req, res) => {
  const parsed = z.object({ inventoryItemId: z.string().min(1), type: z.enum(["incoming", "outgoing", "return", "adjustment"]), quantity: z.coerce.number().refine((value) => value !== 0, "Quantity cannot be zero."), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().min(1).max(500), relatedOperationId: z.string().optional(), reference: z.string().trim().max(160).optional(), permitNegative: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  const item = rows("inventoryItems").find((candidate) => candidate.id === parsed.data.inventoryItemId);
  if (!item || !isWithinScope(req.auth!, item)) return res.status(404).json({ error: "Inventory item not found." });
  const duplicateKey = [parsed.data.inventoryItemId, parsed.data.type, parsed.data.quantity, parsed.data.date, parsed.data.reason, parsed.data.reference ?? ""].join("|");
  if (rows("inventoryMovements").some((movement) => movement.duplicateKey === duplicateKey)) return res.status(409).json({ error: "An identical stock movement already exists. Review it before entering another." });
  const summary = inventorySummary(req.auth).items.find((candidate) => candidate.id === item.id);
  const effect = parsed.data.type === "outgoing" ? -Math.abs(parsed.data.quantity) : parsed.data.type === "adjustment" ? parsed.data.quantity : Math.abs(parsed.data.quantity);
  const nextQuantity = Number(summary?.available ?? item.openingStock ?? 0) + effect;
  if (nextQuantity < 0 && !(item.allowNegative === true && parsed.data.permitNegative === true && can(req.auth, "inventory", "approve"))) return res.status(400).json({ error: "This movement would make stock negative. Enable and approve negative stock explicitly first." });
  try {
    const result = mutateCollection(req.auth!, "inventoryMovements", "create", { ...parsed.data, quantity: Math.abs(parsed.data.quantity), duplicateKey, responsibleUserId: req.auth!.id, responsibleUser: req.auth!.name, organizationId: item.organizationId, locationId: item.locationId });
    res.status(result.pending ? 202 : 201).json(result);
  } catch (error) { sendError(res, error); }
});

router.get("/finance", requirePermission("finance", "view"), (req, res) => {
  const summary = financeSummary(req.auth);
  res.json({ ...summary, companies: rows("companies").filter((company) => isWithinScope(req.auth!, { ...company, organizationId: company.id })), people: scoped(req, rows("employees"), "employees").map((person) => ({ id: person.id, name: person.name, organizationId: person.organizationId })), accounts: scoped(req, summary.accounts, "financeAccounts"), transactions: scoped(req, summary.transactions, "financeTransactions") });
});

router.post("/finance/accounts", requirePermission("finance", "create"), (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(140), type: z.enum(["bank", "cash", "wallet", "other"]), currency: z.string().trim().min(3).max(8), openingBalance: z.coerce.number().default(0), organizationId: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Provide a valid account." });
  if (parsed.data.organizationId) { const company = rows("companies").find((row) => row.id === parsed.data.organizationId); if (!company || !isWithinScope(req.auth!, { ...company, organizationId: company.id })) return res.status(400).json({ error: "Choose a valid company." }); }
  try { const result = mutateCollection(req.auth!, "financeAccounts", "create", parsed.data); res.status(result.pending ? 202 : 201).json(result); } catch (error) { sendError(res, error); }
});

router.post("/finance/transactions", requirePermission("finance", "create"), (req, res) => {
  const parsed = z.object({ type: z.enum(["income", "expense", "payroll", "transfer", "advance", "reimbursement", "loan", "repayment", "refund", "tax", "other"]), direction: z.enum(["in", "out"]).optional(), personName: z.string().trim().max(160).optional(), category: z.string().trim().max(100).optional(), accountId: z.string().min(1), destinationAccountId: z.string().optional(), amount: z.coerce.number().positive(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(value + "T00:00:00Z"); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }, "Choose a valid date"), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), status: z.enum(["draft", "pending", "paid", "cancelled"]).default("pending"), reference: z.string().trim().max(160).optional(), description: z.string().trim().max(1000).optional(), supportingDocument: z.string().trim().max(2000).optional(), employeeId: z.string().optional(), organizationId: z.string().optional(), locationId: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  const account = rows("financeAccounts").find((candidate) => candidate.id === parsed.data.accountId);
  if (!account || !isWithinScope(req.auth!, account)) return res.status(404).json({ error: "Source account not found." });
  parsed.data.organizationId = String(account.organizationId ?? "");
  if (parsed.data.employeeId) {
    const employee = rows("employees").find((employee) => employee.id === parsed.data.employeeId);
    if (!employee || !isWithinScope(req.auth!, employee) || (account.organizationId && employee.organizationId !== account.organizationId)) return res.status(400).json({ error: "Choose a person from the account company." });
    parsed.data.personName = String(employee.name);
  }
  if (parsed.data.type === "transfer") {
    if (!parsed.data.destinationAccountId || parsed.data.destinationAccountId === parsed.data.accountId) return res.status(400).json({ error: "Choose a different destination account for an internal transfer." });
    const destination = rows("financeAccounts").find((candidate) => candidate.id === parsed.data.destinationAccountId);
    if (!destination || !isWithinScope(req.auth!, destination)) return res.status(404).json({ error: "Destination account not found." });
    if (destination.currency !== account.currency) return res.status(400).json({ error: "Transfers require accounts in the same currency." });
  }
  try {
    if (parsed.data.type === "transfer") {
      const group = `transfer-${Date.now().toString(36)}`;
      const outgoing = mutateCollection(req.auth!, "financeTransactions", "create", { ...parsed.data, direction: "out", transferGroupId: group });
      const destination = rows("financeAccounts").find((row) => row.id === parsed.data.destinationAccountId)!;
      const incoming = mutateCollection(req.auth!, "financeTransactions", "create", { ...parsed.data, organizationId: destination.organizationId, accountId: parsed.data.destinationAccountId, destinationAccountId: parsed.data.accountId, direction: "in", transferGroupId: group });
      return res.status(outgoing.pending || incoming.pending ? 202 : 201).json({ pending: outgoing.pending || incoming.pending, items: [outgoing.item, incoming.item].filter(Boolean) });
    }
    const direction = parsed.data.type === "income" ? "in" : ["expense", "payroll", "advance", "reimbursement", "tax"].includes(parsed.data.type) ? "out" : parsed.data.direction;
    if (!direction) return res.status(400).json({ error: "Choose money in or money out for this movement." });
    const result = mutateCollection(req.auth!, "financeTransactions", "create", { ...parsed.data, direction });
    return res.status(result.pending ? 202 : 201).json(result);
  } catch (error) { return sendError(res, error); }
});

router.get("/access/roles", requirePermission("access", "view"), (_req, res) => res.json({ items: rows("accessRoles") }));
router.get("/access/users", requirePermission("access", "view"), (_req, res) => res.json({ items: rows("accessUsers").map(({ passwordHash: _passwordHash, ...user }) => user) }));
router.patch("/access/roles/:id", requirePermission("access", "edit"), (req, res) => {
  const role = rows("accessRoles").find((item) => item.id === req.params.id);
  if (!role) return res.status(404).json({ error: "Role not found." });
  if (role.id === "role-main-manager" && Array.isArray(req.body.permissions) && !req.body.permissions.includes("*")) return res.status(400).json({ error: "The Main Manager role must retain full permissions." });
  const parsed = z.object({ permissions: z.array(z.string()).optional(), organizationIds: z.array(z.string()).optional(), locationIds: z.array(z.string()).optional(), ownRecordsOnly: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid role permissions or access scope." });
  try { res.json(mutateCollection(req.auth!, "accessRoles", "edit", parsed.data, role.id)); } catch (error) { sendError(res, error); }
});
router.get("/access/approval-rules", requirePermission("access", "view"), (_req, res) => res.json({ items: rows("approvalRules") }));
router.post("/access/approval-rules", requirePermission("access", "create"), (req, res) => {
  const parsed = z.object({ section: z.enum(["organizations", "locations", "hr", "operations", "inventory", "finance", "access"]), action: z.enum(["create", "edit", "delete"]), active: z.boolean().default(true) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a section and sensitive action." });
  try {
    const existing = rows("approvalRules").find((rule) => rule.section === parsed.data.section && rule.action === parsed.data.action);
    const result = mutateCollection(req.auth!, "approvalRules", existing ? "edit" : "create", parsed.data, existing?.id);
    res.status(result.pending ? 202 : existing ? 200 : 201).json(result);
  } catch (error) { sendError(res, error); }
});
router.patch("/access/approval-rules/:id", requirePermission("access", "edit"), (req, res) => {
  const rule = rows("approvalRules").find((item) => item.id === req.params.id);
  if (!rule) return res.status(404).json({ error: "Approval rule not found." });
  try { res.json(mutateCollection(req.auth!, "approvalRules", "edit", req.body as Record<string, unknown>, rule.id)); } catch (error) { sendError(res, error); }
});

router.post("/access/users", requirePermission("access", "create"), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(160), password: z.string().min(12).max(256), roleId: z.string().min(1), employeeId: z.string().optional(), organizationIds: z.array(z.string()).default([]), locationIds: z.array(z.string()).default([]), ownRecordsOnly: z.boolean().default(false) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  if (parsed.data.roleId === "role-main-manager" && !isMainManager(req.auth)) return res.status(403).json({ error: "Only the Main Manager can create another Main Manager account." });
  if (rows("accessUsers").some((user) => String(user.email).toLowerCase() === parsed.data.email.toLowerCase())) return res.status(409).json({ error: "An account with that email already exists." });
  if (!rows("accessRoles").some((role) => role.id === parsed.data.roleId)) return res.status(400).json({ error: "Choose a valid role." });
  if (parsed.data.employeeId) { const employee = rows("employees").find((row) => row.id === parsed.data.employeeId); if (!employee) return res.status(400).json({ error: "Choose an existing employee." }); if (employee.organizationId) parsed.data.organizationIds = [String(employee.organizationId)]; }
  if (parsed.data.roleId !== "role-main-manager" && (parsed.data.organizationIds.length !== 1 || !rows("companies").some(company => company.id === parsed.data.organizationIds[0]))) return res.status(400).json({ error: "Assign this user to one existing company." });
  if (parsed.data.locationIds.some(id => !getStore().stores.some(location => location.id === id && parsed.data.organizationIds.includes(location.companyId)))) return res.status(400).json({ error: "Choose locations from the assigned company." });
  const { password: accountPassword, ...accountInput } = parsed.data;
  const account = { id: nextCollectionId("accessUsers"), ...accountInput, email: parsed.data.email.toLowerCase(), passwordHash: await hashPassword(accountPassword), status: "active", createdAt: new Date().toISOString(), dataClassification: "company" };
  const data = getStore();
  data.collections.accessUsers = [...rows("accessUsers"), account];
  saveStore(data);
  audit(req.auth, "access.user-created", { targetId: account.id, email: account.email, roleId: account.roleId });
  res.status(201).json({ item: publicUser(account) });
});

router.patch("/access/users/:id", requirePermission("access", "edit"), async (req, res) => {
  if (!isMainManager(req.auth)) return res.status(403).json({ error: "Only the Main Manager can directly edit user accounts." });
  const parsed = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(160).optional(),
    password: z.string().min(12).max(256).optional(),
    roleId: z.string().trim().min(1).max(160).optional(),
    employeeId: z.string().trim().max(160).nullable().optional(),
    permissions: z.array(z.string().trim().regex(/^(organizations|locations|hr|operations|inventory|finance)\.(view|create|edit|delete|approve|export|\*)$/)).nullable().optional(),
    organizationIds: z.array(z.string().trim().min(1).max(160)).max(200).optional(),
    locationIds: z.array(z.string().trim().min(1).max(160)).max(200).optional(),
    ownRecordsOnly: z.boolean().optional(),
    status: z.enum(["active", "inactive", "pending", "rejected"]).optional(),
  }).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one account change.").safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  const users = rows("accessUsers");
  const existing = users.find((user) => user.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "User not found." });
  if (parsed.data.roleId && !rows("accessRoles").some((role) => role.id === parsed.data.roleId)) return res.status(400).json({ error: "Choose a valid role." });
  if (parsed.data.email && users.some((user) => user.id !== existing.id && normalized(user.email) === normalized(parsed.data.email))) return res.status(409).json({ error: "An account with that email already exists." });
  const { password, employeeId, ...changes } = parsed.data;
  const next: Row = {
    ...existing,
    ...changes,
    ...(parsed.data.email ? { email: parsed.data.email.toLowerCase() } : {}),
    ...(employeeId !== undefined ? { employeeId: employeeId || undefined } : {}),
    id: existing.id,
    updatedAt: new Date().toISOString(),
  };
  if (password) next.passwordHash = await hashPassword(password);
  if (next.roleId !== "role-main-manager") {
    const companies = Array.isArray(next.organizationIds) ? next.organizationIds : [];
    if (companies.length !== 1 || !rows("companies").some(company => company.id === companies[0])) return res.status(400).json({ error: "Assign this user to one existing company." });
    if (next.employeeId) { const employee = rows("employees").find(employee => employee.id === next.employeeId); if (!employee || (employee.organizationId ?? employee.companyId) !== companies[0]) return res.status(400).json({ error: "Choose an employee from the assigned company." }); }
  }
  const wasManager = existing.roleId === "role-main-manager" && existing.status === "active";
  const remainsManager = next.roleId === "role-main-manager" && next.status === "active";
  if (wasManager && !remainsManager && users.filter((user) => user.roleId === "role-main-manager" && user.status === "active").length <= 1) return res.status(400).json({ error: "The last Main Manager cannot be removed or deactivated." });
  const data = getStore();
  data.collections.accessUsers = users.map((user) => user.id === existing.id ? next : user);
  if (password) data.collections.sessions = rows("sessions").filter((session) => session.accountId !== existing.id);
  saveStore(data);
  const changedFields = ["name", "email", "roleId", "employeeId", "organizationIds", "locationIds", "ownRecordsOnly", "status", "permissions"]
    .filter((field) => JSON.stringify(existing[field]) !== JSON.stringify(next[field]));
  if (password) changedFields.push("password");
  audit(req.auth, "access.user-directly-updated", {
    targetId: existing.id,
    targetName: next.name,
    changedFields,
    directMainManagerOverride: true,
    sessionsRevoked: Boolean(password),
  });
  const { passwordHash: _passwordHash, ...safe } = next;
  res.json({ item: safe });
});

router.get("/approvals", requirePermission("approvals", "view"), (req, res) => res.json({ items: rows("approvalRequests").filter(row => isWithinScope(req.auth!, row)) }));
router.post("/approvals/:id", requirePermission("approvals", "approve"), (req, res) => {
  const parsed = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().max(2000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose approve or reject." });
  try { res.json({ item: approveRequest(req.auth!, req.params.id as string, parsed.data.decision === "approve", parsed.data.note) }); } catch (error) { sendError(res, error); }
});

router.get("/audit", requirePermission("audit", "view"), (_req, res) => res.json({ items: rows("auditLog").sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt))) }));

export default router;
