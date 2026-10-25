import { taskOverdue, taskToday } from "../operations.js";
import { reverseFinancialTransaction } from "../finance-ledger.js";
import { attendanceDate as dateStamp, attendanceDate, settingsFor } from "../attendance.js";
import { payrollCan } from "../payroll.js";
import analyticsRouter from "./analytics.js";
import administrationRouter from "./administration.js";
import dashboardActivityRouter from "./dashboard-activity.js";
import { randomUUID } from "node:crypto";
import { csvCell } from "../csv.js";
import { generateUsername, validUsername } from "../employee-identity.js";
import { Router } from "express";
import { z } from "zod";
import { authenticatedUser, hashPassword, publicUser } from "../auth.js";
import { can, companyIdsFor, isMainManager, isWithinScope, redactRecord, requirePermission, sectionForCollection } from "../permissions.js";
import { canManageAccount, canAssignRole, validateAccountAssignment } from "../organization-policy.js";
import { protectOrganizationAdmin } from "../organization-admin-policy.js";
import { registry } from "../registry.js";
import { getCollection, getStore, nextCollectionId, saveStore, transaction } from "../storage.js";
import { createNotification, listNotifications } from "../notifications.js";
import { approveRequest, audit, canReadApproval, financeSummary, inventorySummary, mutateCollection, type Row } from "../workspace.js";
import { canReadDocument, safeDocument } from "../documents.js";
import {canApproveContract} from "../employment-contracts.js";

const router = Router();
router.use("/analytics", analyticsRouter);
router.use("/administration", administrationRouter);
router.use("/dashboard-activity", dashboardActivityRouter);

function sendError(res: import("express").Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed.";
  const status = (error as { statusCode?: number })?.statusCode ?? (message.includes("permission") ? 403 : message.includes("not found") ? 404 : 400);
  return res.status(status).json({ error: message });
}

function rows(name: string) {
  return getCollection(name) as Row[];
}

function scoped(req: import("express").Request, list: Row[], collection: string) {
  if (collection === "documents") return list.filter(row => canReadDocument(req.auth!, row)).map(row => safeDocument(req.auth!, row));
  return list.filter((row) => isWithinScope(req.auth!, row)).map((row) => redactRecord(collection, row, req.auth!));
}

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function matchesUser(row: Row, user: NonNullable<import("express").Request["auth"]>) {
  const identities = new Set([user.id, user.employeeId, user.email, user.name].map(normalized).filter(Boolean));
  return [row.id, row.employeeId, row.assigneeId, row.assignee, row.employee, row.email, row.assignedTo, row.createdById,...(Array.isArray(row.assigneeIds)?row.assigneeIds:[])]
    .map(normalized)
    .some((value) => identities.has(value));
}

function newestAt(row: Row) {
  for (const value of [row.updatedAt, row.createdAt, row.issuedOn, row.date]) {
    if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return value;
  }
  return "";
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

function isCompanyPolicy(row: Row, user: NonNullable<import("express").Request["auth"]>) {
  if (!isMainManager(user) && !companyIdsFor(user).includes(String(row.organizationId ?? row.companyId ?? ""))) return false;
  if (normalized(row.type) !== "policy") return false;
  const audience = normalized(row.employee ?? row.audience);
  return !audience || ["all", "all employees", "everyone", "company", "company-wide"].includes(audience) || matchesUser(row, user);
}

router.get("/overview", (req, res) => {
  const data = getStore();
  const user = req.auth!;
  const work = can(req.auth, "operations", "view") ? scoped(req, rows("workItems"), "workItems") : [];
  const inventory = can(req.auth, "inventory", "view") ? inventorySummary(req.auth) : { items: [], lowStockCount: 0 };
  const finance = can(req.auth, "finance", "view") ? financeSummary(req.auth) : { accounts: [], income: 0, expenses: 0, salaries: 0, net: 0 };
  const pendingApprovals = can(req.auth, "approvals", "view") ? rows("approvalRequests").filter((row) => row.status === "pending" && canReadApproval(user, row)).length : 0;
  const employee = rows("employees").find((item) => isWithinScope(user, item) && matchesUser(item, user));
  const personalWork = can(req.auth, "operations", "view")
    ? rows("workItems").filter((item) => isWithinScope(user, item) && matchesUser(item, user)).sort((a, b) => String(a.dueDate ?? "").localeCompare(String(b.dueDate ?? "")))
    : [];
  const personalLeave = rows("leaveRequests").filter((item) => isWithinScope(user, item) && matchesUser(item, user)).sort((a, b) => String(b.updatedAt ?? b.from ?? "").localeCompare(String(a.updatedAt ?? a.from ?? "")));
  const todayAttendance = rows("attendance").filter((item) => item.date === attendanceDate(new Date(), settingsFor(String(employee?.organizationId || user.organizationIds[0] || "")).timezone) && (item.accountId ? item.accountId === user.id : matchesUser(item, user))).sort((a, b) => newestAt(b).localeCompare(newestAt(a)))[0];
  const nextShift = rows("shifts").find((item) => isWithinScope(user, item) && matchesUser(item, user));
  const notifications = listNotifications(user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const account = rows("accessUsers").find((item) => item.id === user.id);
  const previousLoginAt = typeof account?.previousLoginAt === "string" ? account.previousLoginAt : undefined;
  const policies = rows("documents")
    .filter((item) => isCompanyPolicy(item, user) && canReadDocument(user, item) && item.lifecycle !== "archived")
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
    work: { total: work.length, overdue: work.filter(item=>taskOverdue(item)).length },
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
        department: rows("departments").find(row=>row.id===employee?.departmentId&&row.organizationId===employee?.organizationId)?.name??employee?.department,
        section: rows("departments").find(row=>row.id===employee?.sectionId&&row.organizationId===employee?.organizationId)?.name,
        location: employee?.location,
        employmentStatus: employee?.status,
        manager: rows("employees").find(row=>row.id===employee?.managerId&&row.organizationId===employee?.organizationId)?.name??employee?.manager,
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
      overdueWorkCount: personalWork.filter(item=>taskOverdue(item)).length,
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
    documents: rows("documents").filter(row => row.lifecycle !== "archived" && canReadDocument(user, row) && (row.category === "company" || row.employeeId === employee?.id)).map(row => safeDocument(user, row)),
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

router.get("/export/:collection", (req, res) => {
  const collection = req.params.collection as string;
  const known = registry.some((spec) => spec.collection === collection) || ["workItems", "inventoryItems", "inventoryMovements", "financeAccounts", "financeTransactions", "locationUpdates"].includes(collection);
  if (!known) return res.status(404).json({ error: "Unknown export collection." });
  const section = sectionForCollection(collection);
  if (!can(req.auth, section, "export")) return res.status(403).json({ error: `You do not have permission to export ${section}.` });
  if(section==="finance"&&!can(req.auth,"finance","view"))return res.status(403).json({error:"Finance view permission is required for financial exports."});
  if(collection === "payroll" && !payrollCan(req.auth!, "view")) return res.status(403).json({error:"Use your employee payslip view for private payroll records."});
  const items = scoped(req, rows(collection), collection).map((item) => {
    const safe = { ...item };
    delete safe.passwordHash;
    if(section==="finance"){delete safe.financialFingerprint;delete safe.paymentFingerprint;delete safe.idempotencyKey;if(safe.allocations)safe.allocations=JSON.stringify(safe.allocations); }
    return safe;
  });
  const keys = [...new Set(items.flatMap((item) => Object.keys(item)))].filter((key) => !["id", "createdAt", "updatedAt"].includes(key));
  const csv = [keys.map(csvCell).join(","), ...items.map((item) => keys.map((key) => csvCell(item[key])).join(","))].join("\r\n");
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

router.get("/hr/companies", (req, res) => {
  if (!can(req.auth, "hr", "view") && !can(req.auth, "access", "view")) return res.status(403).json({ error: "You do not have permission to view these records." });
  const companies = rows("companies").filter((company) => isWithinScope(req.auth!, { ...company, organizationId: company.id }));
  res.json({ companies: companies.map(company => ({...company, organizationName: rows("organizations").find(row=>row.id===company.parentOrganizationId)?.name})), employees: scoped(req, rows("employees"), "employees") });
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
      .filter((item) => item.status === "pending" && item.section === "hr" && canReadApproval(req.auth!, item))
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
  let items = scoped(req, rows("workItems"), "workItems");
  if (view === "mine") items = items.filter((item) => item.assigneeId === req.auth!.employeeId || Array.isArray(item.assigneeIds) && item.assigneeIds.includes(req.auth!.employeeId) || item.assignee === req.auth!.name || item.assignee === req.auth!.email);
  if (view === "upcoming") items = items.filter((item) => Boolean(item.dueDate) && String(item.dueDate) >= taskToday(item) && !["Completed", "Cancelled"].includes(String(item.status)));
  if (view === "overdue") items = items.filter((item) => taskOverdue(item));
  res.json({ companies: rows("companies").filter((company) => isWithinScope(req.auth!, { ...company, organizationId: company.id })), items: items.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))), activity: scoped(req, rows("workActivity"), "workActivity").filter(event=>rows("workItems").some(task=>task.id===event.workItemId&&isWithinScope(req.auth!,task))) });
});

const workSchema = z.object({
    title: z.string().trim().min(1).max(180), organizationId: z.string().optional(), locationId: z.string().optional(),
    assignee: z.string().trim().max(120).optional(), assigneeId: z.string().optional(), dueDate: z.string().date("Choose a valid date.").optional(),
    priority: z.enum(["Low", "Medium", "High", "Urgent"]).default("Medium"), status: z.enum(["Pending", "Planned", "Assigned", "In Progress", "Awaiting Approval", "Completed", "Cancelled"]).default("Planned"),
    workflow: z.string().trim().max(120).optional(), progress: z.coerce.number().min(0).max(100).default(0), comments: z.string().max(4000).optional(), attachments: z.string().max(2000).optional(), inventoryUsage: z.string().max(1000).optional(),
  }).strict();

router.post("/work", requirePermission("operations", "create"), (req, res) => {
  const parsed = workSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  try {
    const result = mutateCollection(req.auth!, "workItems", "create", parsed.data);
    res.status(result.pending ? 202 : 201).json(result);
  } catch (error) { sendError(res, error); }
});

router.patch("/work/:id", requirePermission("operations", "edit"), (req, res) => {
  const existing = rows("workItems").find((item) => item.id === req.params.id);
  if (!existing || !isWithinScope(req.auth!, existing)) return res.status(404).json({ error: "Work item not found." });
  const parsed = workSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter valid work details, status, progress, and date." });
  try {
    const result = mutateCollection(req.auth!, "workItems", "edit", parsed.data, existing.id);
    res.status(result.pending ? 202 : 200).json(result);
  } catch (error) { sendError(res, error); }
});

router.post("/work/:id/activity", requirePermission("operations", "edit"), (req, res) => {
  const parsed = z.object({ message: z.string().trim().min(1).max(2000), progress: z.coerce.number().min(0).max(100).optional(), status: z.enum(["Pending", "Planned", "Assigned", "In Progress", "Awaiting Approval", "Completed", "Cancelled"]).optional(), attachments: z.string().max(2000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter an activity update." });
  const existing = rows("workItems").find((item) => item.id === req.params.id);
  if (!existing || !isWithinScope(req.auth!, existing)) return res.status(404).json({ error: "Work item not found." });
  try {
    const result = mutateCollection(req.auth!, "workItems", "edit", { ...parsed.data, comments: parsed.data.message }, existing.id);
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
    const result = mutateCollection(req.auth!, "inventoryMovements", "create", { ...parsed.data, quantity: parsed.data.type === "adjustment" ? parsed.data.quantity : Math.abs(parsed.data.quantity), duplicateKey, responsibleUserId: req.auth!.id, responsibleUser: req.auth!.name, organizationId: item.organizationId, locationId: item.locationId });
    res.status(result.pending ? 202 : 201).json(result);
  } catch (error) { sendError(res, error); }
});

router.get("/finance", requirePermission("finance", "view"), (req, res) => {
  const summary = financeSummary(req.auth);
  res.json({ ...summary, companies: rows("companies").filter((company) => isWithinScope(req.auth!, { ...company, organizationId: company.id })), people: scoped(req, rows("employees"), "employees").map((person) => ({ id: person.id, name: person.name, organizationId: person.organizationId })), accounts: scoped(req, summary.accounts, "financeAccounts"), transactions: scoped(req, summary.transactions, "financeTransactions") });
});

router.post("/finance/transactions/:id/reverse", requirePermission("finance", "create"), (req,res) => {
  const parsed=z.object({reason:z.string().trim().min(5).max(1000),date:z.string(),reference:z.string().trim().min(1).max(160),idempotencyKey:z.string().min(8).max(160)}).strict().safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Enter a date, reference, reason and payment key."});
  try { return res.json({item:reverseFinancialTransaction(req.auth!,String(req.params.id),parsed.data)}); } catch(error) { return sendError(res,error); }
});

router.post("/finance/accounts", requirePermission("finance", "create"), (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(140), type: z.enum(["bank", "cash", "wallet", "other"]), currency: z.string().trim().min(3).max(8), openingBalance: z.union([z.string(),z.number()]).default("0"), organizationId: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Provide a valid account." });
  if (parsed.data.organizationId) { const company = rows("companies").find((row) => row.id === parsed.data.organizationId); if (!company || !isWithinScope(req.auth!, { ...company, organizationId: company.id })) return res.status(400).json({ error: "Choose a valid company." }); }
  try { const result = mutateCollection(req.auth!, "financeAccounts", "create", parsed.data); res.status(result.pending ? 202 : 201).json(result); } catch (error) { sendError(res, error); }
});

router.post("/finance/transactions", requirePermission("finance", "create"), (req, res) => {
  const parsed = z.object({ type: z.enum(["income", "expense", "payroll", "transfer", "advance", "reimbursement", "loan", "repayment", "refund", "tax", "other"]), direction: z.enum(["in", "out"]).optional(), personName: z.string().trim().max(160).optional(), category: z.string().trim().max(100).optional(), accountId: z.string().min(1), destinationAccountId: z.string().optional(), amount: z.union([z.string(),z.number()]), idempotencyKey: z.string().trim().min(8).max(160).optional(), method: z.enum(["bank","cash","card","cheque","other"]).optional(), sourceCollection: z.enum(["sales","expenses","purchases","returns"]).optional(), sourceId: z.string().max(160).optional(), recoversTransactionId: z.string().max(160).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(value + "T00:00:00Z"); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }, "Choose a valid date"), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), status: z.enum(["draft", "pending", "paid", "cancelled"]).default("pending"), reference: z.string().trim().max(160).optional(), description: z.string().trim().max(1000).optional(), supportingDocument: z.string().trim().max(2000).optional(), employeeId: z.string().optional(), organizationId: z.string().optional(), locationId: z.string().optional() }).safeParse(req.body);
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
      const result = transaction(() => {
        const group = `transfer-${randomUUID()}`;
        const outgoing = mutateCollection(req.auth!, "financeTransactions", "create", { ...parsed.data, direction: "out", transferGroupId: group, idempotencyKey: parsed.data.idempotencyKey ? `${parsed.data.idempotencyKey}:out` : undefined });
        const destination = rows("financeAccounts").find((row) => row.id === parsed.data.destinationAccountId)!;
        const incoming = mutateCollection(req.auth!, "financeTransactions", "create", { ...parsed.data, organizationId: destination.organizationId, accountId: parsed.data.destinationAccountId, destinationAccountId: parsed.data.accountId, direction: "in", transferGroupId: group, idempotencyKey: parsed.data.idempotencyKey ? `${parsed.data.idempotencyKey}:in` : undefined });
        return { pending: outgoing.pending || incoming.pending, items: [outgoing.item, incoming.item].filter(Boolean) };
      });
      return res.status(result.pending ? 202 : 201).json(result);
    }
    const direction = parsed.data.type === "income" ? "in" : ["expense", "payroll", "advance", "reimbursement", "tax"].includes(parsed.data.type) ? "out" : parsed.data.direction;
    if (!direction) return res.status(400).json({ error: "Choose money in or money out for this movement." });
    const result = mutateCollection(req.auth!, "financeTransactions", "create", { ...parsed.data, direction });
    return res.status(result.pending ? 202 : 201).json(result);
  } catch (error) { return sendError(res, error); }
});

const appointmentSchema = z.object({
  customerId: z.string().trim().max(160).optional(),
  customerName: z.string().trim().min(2).max(160),
  customerEmail: z.string().trim().email().max(160).optional().or(z.literal("")),
  customerPhone: z.string().trim().max(50).optional(),
  organizationId: z.string().trim().min(1),
  locationId: z.string().trim().max(160).optional(),
  appointmentAt: z.string().datetime(),
  assignedStaffId: z.string().trim().max(160).optional(),
  assignedStaffName: z.string().trim().max(160).optional(),
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no-show"]).default("scheduled"),
  notes: z.string().trim().max(4000).optional(),
});

router.get("/customer-service", requirePermission("customerService", "view"), (req, res) => {
  res.json({
    customers: scoped(req, rows("customers"), "customers"),
    appointments: scoped(req, rows("customerAppointments"), "customerAppointments"),
    questions: scoped(req, rows("customerQuestions"), "customerQuestions"),
    replies: scoped(req, rows("customerReplies"), "customerReplies"),
    companies: scoped(req, rows("companies"), "companies"),
    employees: scoped(req, rows("employees"), "employees"),
  });
});
router.post("/customer-service/appointments", requirePermission("customerService", "create"), (req, res) => {
  const parsed = appointmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(issue => issue.message).join("; ") });
  if (!isWithinScope(req.auth!, parsed.data)) return res.status(403).json({ error: "The appointment is outside your assigned company or location." });
  try { const result = mutateCollection(req.auth!, "customerAppointments", "create", parsed.data); res.status(result.pending ? 202 : 201).json(result); } catch (error) { sendError(res, error); }
});
router.patch("/customer-service/appointments/:id", requirePermission("customerService", "edit"), (req, res) => {
  const existing = rows("customerAppointments").find(row => row.id === req.params.id);
  if (!existing || !isWithinScope(req.auth!, existing)) return res.status(404).json({ error: "Appointment not found." });
  const parsed = appointmentSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(issue => issue.message).join("; ") });
  try { res.json(mutateCollection(req.auth!, "customerAppointments", "edit", parsed.data, existing.id)); } catch (error) { sendError(res, error); }
});
router.post("/customer-service/questions", requirePermission("customerService", "create"), (req, res) => {
  const parsed = z.object({ customerId: z.string().max(160).optional(), customerName: z.string().trim().min(2).max(160), customerEmail: z.string().trim().email().optional().or(z.literal("")), organizationId: z.string().min(1), subject: z.string().trim().min(2).max(240), message: z.string().trim().min(1).max(8000), status: z.enum(["open", "resolved"]).default("open") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(issue => issue.message).join("; ") });
  if (!isWithinScope(req.auth!, parsed.data)) return res.status(403).json({ error: "The question is outside your assigned company." });
  try { const result = mutateCollection(req.auth!, "customerQuestions", "create", parsed.data); res.status(result.pending ? 202 : 201).json(result); } catch (error) { sendError(res, error); }
});
router.patch("/customer-service/questions/:id", requirePermission("customerService", "edit"), (req, res) => {
  const existing = rows("customerQuestions").find(row => row.id === req.params.id);
  if (!existing || !isWithinScope(req.auth!, existing)) return res.status(404).json({ error: "Question not found." });
  const parsed = z.object({ status: z.enum(["open", "resolved"]), subject: z.string().trim().min(2).max(240).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a valid question status." });
  try { res.json(mutateCollection(req.auth!, "customerQuestions", "edit", parsed.data, existing.id)); } catch (error) { sendError(res, error); }
});
router.post("/customer-service/questions/:id/replies", requirePermission("customerService", "reply"), (req, res) => {
  const question = rows("customerQuestions").find(row => row.id === req.params.id);
  if (!question || !isWithinScope(req.auth!, question)) return res.status(404).json({ error: "Question not found." });
  const parsed = z.object({ message: z.string().trim().min(1).max(8000), resolve: z.boolean().default(false) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a reply." });
  if (parsed.data.resolve && !can(req.auth!, "customerService", "edit")) return res.status(403).json({ error: "You do not have permission to resolve customer questions." });
  try {
    const result = mutateCollection(req.auth!, "customerReplies", "create", { questionId: question.id, organizationId: question.organizationId, message: parsed.data.message, authorId: req.auth!.id, authorName: req.auth!.name, createdAt: new Date().toISOString(), channel: "local" }, undefined, "reply");
    if (parsed.data.resolve) mutateCollection(req.auth!, "customerQuestions", "edit", { status: "resolved", resolvedAt: new Date().toISOString(), resolvedBy: req.auth!.id }, question.id);
    res.status(result.pending ? 202 : 201).json(result);
  } catch (error) { sendError(res, error); }
});

router.get("/access/roles", requirePermission("access", "view"), (req, res) => res.json({ items: rows("accessRoles").filter(role => canAssignRole(req.auth!, role)) }));
router.get("/access/users", requirePermission("access", "view"), (req, res) => res.json({ items: rows("accessUsers").filter(account => canManageAccount(req.auth!, account)).map(({ passwordHash: _passwordHash, ...user }) => user) }));
router.patch("/access/roles/:id", requirePermission("access", "edit"), (req, res) => {
  if (!isMainManager(req.auth)) return res.status(403).json({ error: "Only the Main Admin has permission to change global roles." });
  const role = rows("accessRoles").find((item) => item.id === req.params.id);
  if (!role) return res.status(404).json({ error: "Role not found." });
  if (role.id === "role-main-manager" && Array.isArray(req.body.permissions) && !req.body.permissions.includes("*")) return res.status(400).json({ error: "The Main Admin role must retain full permissions." });
  const parsed = z.object({ permissions: z.array(z.string()).optional(), organizationIds: z.array(z.string()).optional(), locationIds: z.array(z.string()).optional(), ownRecordsOnly: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid role permissions or access scope." });
  try { res.json(mutateCollection(req.auth!, "accessRoles", "edit", parsed.data, role.id)); } catch (error) { sendError(res, error); }
});
const approvalRuleSchema=z.object({section:z.enum(["organizations","locations","hr","operations","customerService","inventory","finance","access"]),action:z.enum(["create","edit","delete"]),active:z.boolean().default(true)}).strict();
router.get("/access/approval-rules", requirePermission("access", "view"), (req, res) => { if (!isMainManager(req.auth)) return res.status(403).json({ error: "Only the Main Admin has permission to view global approval rules." }); res.json({ items: rows("approvalRules") }); });
router.post("/access/approval-rules", requirePermission("access", "create"), (req, res) => {
  if (!isMainManager(req.auth)) return res.status(403).json({ error: "Only the Main Admin has permission to change global approval rules." });
  const parsed = approvalRuleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a section and sensitive action." });
  try {
    const existing = rows("approvalRules").find((rule) => rule.section === parsed.data.section && rule.action === parsed.data.action);
    const result = mutateCollection(req.auth!, "approvalRules", existing ? "edit" : "create", parsed.data, existing?.id);
    res.status(result.pending ? 202 : existing ? 200 : 201).json(result);
  } catch (error) { sendError(res, error); }
});
router.patch("/access/approval-rules/:id", requirePermission("access", "edit"), (req, res) => {
  if (!isMainManager(req.auth)) return res.status(403).json({ error: "Only the Main Admin has permission to change global approval rules." });
  const rule = rows("approvalRules").find((item) => item.id === req.params.id);
  if (!rule) return res.status(404).json({ error: "Approval rule not found." });
  const parsed=approvalRuleSchema.partial().safeParse(req.body);
  if(!parsed.success||!Object.keys(parsed.data).length)return res.status(400).json({error:"Choose a section, action and valid active status."});
  const next={...rule,...parsed.data};
  if(rows("approvalRules").some(item=>item.id!==rule.id&&item.section===next.section&&item.action===next.action))return res.status(409).json({error:"An approval rule already exists for this section and action."});
  try { res.json(mutateCollection(req.auth!, "approvalRules", "edit", parsed.data, rule.id)); } catch (error) { sendError(res, error); }
});

router.post("/access/users", requirePermission("access", "create"), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(160), password: z.string().min(12).max(256), roleId: z.string().min(1), employeeId: z.string().optional(), organizationIds: z.array(z.string()).default([]), tenantOrganizationIds: z.array(z.string()).max(1).default([]), locationIds: z.array(z.string()).default([]), ownRecordsOnly: z.boolean().default(false) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  if (parsed.data.roleId === "role-main-manager" && !isMainManager(req.auth)) return res.status(403).json({ error: "Only the Main Admin can create another Main Admin account." });
  if (rows("accessUsers").some((user) => String(user.email).toLowerCase() === parsed.data.email.toLowerCase())) return res.status(409).json({ error: "An account with that email already exists." });
  if (!rows("accessRoles").some((role) => role.id === parsed.data.roleId)) return res.status(400).json({ error: "Choose a valid role." });
  if (parsed.data.employeeId) { const employee = rows("employees").find((row) => row.id === parsed.data.employeeId); if (!employee) return res.status(400).json({ error: "Choose an existing employee." }); const company = employee.organizationId ?? employee.companyId; if (company && parsed.data.organizationIds.length && !parsed.data.organizationIds.includes(String(company))) return res.status(400).json({ error: "Choose an employee from the assigned company." }); if (company && parsed.data.roleId !== "role-organization-admin") parsed.data.organizationIds = [String(company)]; }
  try { validateAccountAssignment(req.auth!, { ...parsed.data, status: "active" }); } catch (error) { return sendError(res, error); }
  const { password: accountPassword, ...accountInput } = parsed.data;
  const account = { id: nextCollectionId("accessUsers"), ...accountInput, email: parsed.data.email.toLowerCase(), passwordHash: await hashPassword(accountPassword), username: generateUsername(rows("accessUsers"), accountInput.name), mustChangePassword: true, status: "active", createdAt: new Date().toISOString(), dataClassification: "company" };
  req.auth = authenticatedUser(req);
  if (!can(req.auth, "access", "create")) return res.status(403).json({ error: "Your account access changed. Sign in again." });
  if (rows("accessUsers").some(user => normalized(user.email) === account.email)) return res.status(409).json({ error: "An account with that email already exists." });
  try { validateAccountAssignment(req.auth!, account); } catch (error) { return sendError(res, error); }
  const data = getStore();
  data.collections.accessUsers = [...rows("accessUsers"), account];
  if (account.employeeId) { const employee = rows("employees").find(row => row.id === account.employeeId); if (employee) employee.accountId = account.id; }
  saveStore(data);
  audit(req.auth, "access.user-created", { targetId: account.id, email: account.email, roleId: account.roleId });
  res.status(201).json({ item: publicUser(account) });
});

router.patch("/access/users/:id", requirePermission("access", "edit"), async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    username: z.string().trim().toLowerCase().refine(validUsername, "Choose a valid username.").optional(),
    email: z.string().trim().email().max(160).optional(),
    password: z.string().min(12).max(256).optional(),
    roleId: z.string().trim().min(1).max(160).optional(),
    employeeId: z.string().trim().max(160).nullable().optional(),
    permissions: z.array(z.string().trim().regex(/^(organizations|locations|hr|operations|customerService|inventory|finance|payroll|approvals|access|audit|shops)\.(view|create|edit|delete|approve|reply|export|pay|configure|inquiries|\*)$/)).nullable().optional(),
    organizationIds: z.array(z.string().trim().min(1).max(160)).max(200).optional(),
    tenantOrganizationIds: z.array(z.string().trim().min(1).max(160)).max(1).optional(),
    locationIds: z.array(z.string().trim().min(1).max(160)).max(200).optional(),
    ownRecordsOnly: z.boolean().optional(),
    status: z.enum(["active", "invited", "suspended", "inactive", "pending", "rejected"]).optional(),
  }).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one account change.").safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  // Finish asynchronous hashing before reading the account snapshot for this write.
  const passwordHash = parsed.data.password ? await hashPassword(parsed.data.password) : undefined;
  req.auth = authenticatedUser(req);
  if (!can(req.auth, "access", "edit")) return res.status(403).json({ error: "Your account access changed. Sign in again." });
  const users = rows("accessUsers");
  const existing = users.find((user) => user.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "User not found." });
  if (!canManageAccount(req.auth!, existing)) return res.status(404).json({ error: "User not found." });
  if (parsed.data.permissions?.some(permission => /^(access|audit)\./.test(permission)) && !["role-main-manager", "role-organization-admin", "role-company-manager", "role-shop-manager"].includes(String(parsed.data.roleId ?? existing.roleId))) return res.status(400).json({ error: "Account administration requires an administrator role." });
  if (parsed.data.roleId && !rows("accessRoles").some((role) => role.id === parsed.data.roleId)) return res.status(400).json({ error: "Choose a valid role." });
  if (parsed.data.email && users.some((user) => user.id !== existing.id && normalized(user.email) === normalized(parsed.data.email))) return res.status(409).json({ error: "An account with that email already exists." });
  if(parsed.data.email&&rows("employees").some(row=>row.id!==existing.employeeId&&normalized(row.email)===normalized(parsed.data.email)))return res.status(409).json({error:"This email is already in use."});
  if (parsed.data.username && users.some(user => user.id !== existing.id && normalized(user.username) === parsed.data.username)) return res.status(409).json({ error: "This username is already in use." });
  const { password, employeeId, ...changes } = parsed.data;
  const next: Row = {
    ...existing,
    ...changes,
    ...(parsed.data.email ? { email: parsed.data.email.toLowerCase() } : {}),
    ...(employeeId !== undefined ? { employeeId: employeeId || undefined } : {}),
    id: existing.id,
    updatedAt: new Date().toISOString(),
  };
  if (passwordHash) { next.passwordHash = passwordHash; next.mustChangePassword = true; next.activationRequired = false; }
  try { validateAccountAssignment(req.auth!, next, existing); } catch (error) { return sendError(res, error); }
  try { protectOrganizationAdmin(existing, next); } catch (error) { return sendError(res, error); }
  if (next.status === "invited" && existing.activationRequired !== true) return res.status(400).json({ error: "Only accounts awaiting password setup can remain invited." });
  if (next.status === "active" && existing.activationRequired === true && !passwordHash) return res.status(400).json({ error: "Complete employee activation or set a new password before activating this account." });
  const wasManager = existing.roleId === "role-main-manager" && existing.status === "active";
  const remainsManager = next.roleId === "role-main-manager" && next.status === "active";
  if (wasManager && !remainsManager && users.filter((user) => user.roleId === "role-main-manager" && user.status === "active").length <= 1) return res.status(400).json({ error: "The last Main Admin cannot be removed or deactivated." });
  const data = getStore();
  data.collections.accessUsers = users.map((user) => user.id === existing.id ? next : user);
  if (existing.employeeId && existing.employeeId !== next.employeeId) { const oldEmployee = rows("employees").find(row => row.id === existing.employeeId); if (oldEmployee?.accountId === existing.id) delete oldEmployee.accountId; }
  if (next.employeeId) { const employee = rows("employees").find(row => row.id === next.employeeId); if (employee) {employee.accountId = next.id;if(parsed.data.email)employee.email=next.email;} }
  if(["email","employeeId","roleId","organizationIds","tenantOrganizationIds"].some(field=>JSON.stringify(existing[field])!==JSON.stringify(next[field])))data.collections.employeeInvitations=rows("employeeInvitations").filter(row=>row.accountId!==existing.id);
  const accessRevoked = next.status !== "active" || next.roleId !== existing.roleId || passwordHash !== undefined;
  if (accessRevoked) data.collections.sessions = rows("sessions").filter((session) => session.accountId !== existing.id);
  saveStore(data);
  const changedFields = ["name", "email", "username", "roleId", "employeeId", "organizationIds", "tenantOrganizationIds", "locationIds", "ownRecordsOnly", "status", "permissions"]
    .filter((field) => JSON.stringify(existing[field]) !== JSON.stringify(next[field]));
  if (password) changedFields.push("password");
  audit(req.auth, "access.user-directly-updated", {
    targetId: existing.id,
    targetName: next.name,
    changedFields,
    directMainManagerOverride: isMainManager(req.auth),
    organizationId: Array.isArray(next.organizationIds) ? next.organizationIds[0] : undefined,
    tenantOrganizationIds: next.tenantOrganizationIds,
    sessionsRevoked: accessRevoked,
  });
  const { passwordHash: _passwordHash, ...safe } = next;
  res.json({ item: safe });
});

router.delete("/access/users/:id", requirePermission("access", "delete"), (req, res) => {
  const users = rows("accessUsers");
  const existing = users.find(user => user.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "User not found." });
  if (!canManageAccount(req.auth!, existing)) return res.status(404).json({ error: "User not found." });
  if (existing.id === req.auth!.id) return res.status(400).json({ error: "You cannot delete your own signed-in account." });
  try { protectOrganizationAdmin(existing); } catch (error) { return sendError(res, error); }
  if (existing.roleId === "role-main-manager" && existing.status === "active" && users.filter(user => user.roleId === "role-main-manager" && user.status === "active").length <= 1) return res.status(400).json({ error: "The last active Main Admin cannot be deleted." });
  const data = getStore();
  data.collections.accessUsers = users.filter(user => user.id !== existing.id);
  const linkedEmployee = rows("employees").find(row => row.id === existing.employeeId && row.accountId === existing.id);
  if (linkedEmployee) delete linkedEmployee.accountId;
  data.collections.employeeInvitations = rows("employeeInvitations").filter(row => row.accountId !== existing.id);
  data.collections.sessions = rows("sessions").filter(session => session.accountId !== existing.id);
  saveStore(data);
  audit(req.auth!, "access.user-deleted", { targetId: existing.id, targetName: existing.name, email: existing.email, sessionsRevoked: true });
  res.json({ ok: true });
});

router.get("/approvals", requirePermission("approvals", "view"), (req, res) => res.json({ items: rows("approvalRequests").filter(row => canReadApproval(req.auth!, row)).map(row=>({...row,canSelfApprove:row.requestedBy===req.auth!.id&&isMainManager(req.auth),canDecide:(row.collection!=="employmentContracts"||canApproveContract(req.auth!,row))&&can(req.auth,"approvals","approve")&&(row.requestedBy!==req.auth!.id||isMainManager(req.auth))})) }));
router.post("/approvals/:id/changes",requirePermission("approvals","approve"),(req,res)=>{
 const parsed=z.object({note:z.string().trim().min(8).max(2000)}).strict().safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Explain the required changes in at least 8 characters."});
 const row=rows("approvalRequests").find(row=>row.id===req.params.id&&canReadApproval(req.auth!,row));if(!row)return res.status(404).json({error:"Approval request not found."});
 if(row.collection==="employmentContracts")return res.status(400).json({error:"Reject the contract with a note so HR can prepare a new revision."});
 if(row.status!=="pending"||row.requestedBy===req.auth!.id)return res.status(400).json({error:"Only another pending request can be returned for changes."});
 transaction(()=>{Object.assign(row,{status:"changes-requested",decisionNote:parsed.data.note,decidedBy:req.auth!.id,decidedByName:req.auth!.name,decidedAt:new Date().toISOString()});saveStore(getStore());audit(req.auth,"approval.changes-requested",{targetId:row.id,collection:row.collection,organizationId:row.organizationId,requesterId:row.requestedBy,reason:parsed.data.note,outcome:"changes-requested"});createNotification({userId:String(row.requestedBy),user:String(row.requestedByName||""),type:"message",severity:"info",message:"Changes were requested. Revise and submit through the original workflow: "+parsed.data.note,target:row.id});});res.json({item:row});
});
router.post("/approvals/:id", requirePermission("approvals", "approve"), (req, res) => {
  const parsed = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().max(2000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose approve or reject." });
  try { res.json({ item: approveRequest(req.auth!, req.params.id as string, parsed.data.decision === "approve", parsed.data.note) }); } catch (error) { sendError(res, error); }
});

router.get("/audit", requirePermission("audit", "view"), (req, res) => res.json({ items: rows("auditLog").filter(entry => isMainManager(req.auth) || isWithinScope(req.auth!, entry)).sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt))) }));

export default router;
