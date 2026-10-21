import type { AuthenticatedUser } from "./auth.js";
import type { Notification } from "./types.js";
import { getCollection } from "./storage.js";
import { can, isMainManager, isWithinScope, canViewSalaryData } from "./permissions.js";
import { canReadDocument } from "./documents.js";
import { inventorySummary } from "./workspace.js";

type Row = Record<string, unknown>;
const find = (collection: string, id: string) => (getCollection(collection) as Row[]).find(row => row.id === id);

/** Enrich only an already-owned notification, with live, allowlisted, scoped data. */
export function notificationContext(user: AuthenticatedUser, item: Notification) {
  const details: Record<string, unknown> = {};
  let link: { to: string; label: string } | undefined;
  const target = item.target || "";
  const add = (row: Row, fields: string[]) => {
    for (const field of fields) if (row[field] !== undefined && row[field] !== null && row[field] !== "") details[field] = row[field];
    const company = find("companies", String(row.organizationId || row.companyId || ""));
    if (company) details.company = company.name;
  };
  if(target.startsWith("task:")){
    const row=find("workItems",target.slice(5));if(row&&can(user,"operations","view")&&isWithinScope(user,row)){add(row,["title","description","status","priority","dueDate","assignee","progress"]);link={to:`/operations/work/${encodeURIComponent(String(row.id))}`,label:"Open work item"};}
  } else if (item.type === "overdue_work") {
    const row = find("workItems", target);
    if (row && can(user, "operations", "view") && isWithinScope(user, row)) {
      add(row, ["title", "status", "priority", "dueDate", "assignee", "description"]);
      link = { to: `/operations/work/${encodeURIComponent(target)}`, label: "Open work item" };
    }
  } else if (item.type === "low_stock" && can(user, "inventory", "view")) {
    const row = inventorySummary(user).items.find(row => row.id === target);
    if (row) { add(row, ["name", "sku", "available", "reorderPoint", "unit", "stockLocation"]); link = { to: "/warehouse", label: "Manage inventory" }; }
  } else if (item.type === "document_expiry" && target.startsWith("document:")) {
    const row = find("documents", target.slice(9));
    if (row && canReadDocument(user, row)) { add(row, ["name", "title", "type", "expiryDate", "status", "employee"]); link = { to: `/hr/documents/${encodeURIComponent(target.slice(9))}`, label: "Open document" }; }
  } else if (target.startsWith("attendance:") || target.startsWith("attendance-missing:") || target.startsWith("attendance-correction:") || target.startsWith("attendance-adjustment:")) {
    const [prefix, id] = target.split(":");
    const collection = prefix === "attendance" || prefix === "attendance-missing" ? "attendance" : prefix === "attendance-correction" ? "attendanceCorrectionRequests" : "attendancePayrollAdjustments";
    const row = find(collection, id);
    const own = row && (Boolean(user.employeeId) && row.employeeId === user.employeeId || row.accountId === user.id);
    const permitted = prefix === "attendance-adjustment" ? can(user, "finance", "view") || can(user, "payroll", "view") : own || can(user, "hr", "view");
    if (row && permitted && isWithinScope(user, row)) {
      add(row, ["employee", "date", "attendanceDate", "checkIn", "checkOut", "hours", "status", "approvalStatus", "lateMinutes", "earlyDepartureMinutes", "requestedCheckIn", "requestedCheckOut", "reason", "period"]);
      if (prefix === "attendance-adjustment" && canViewSalaryData(user)) { add(row, ["amount"]); const company=find("companies",String(row.organizationId||"")); if(company?.currency)details.currency=company.currency; }
      link = { to: prefix === "attendance-adjustment" ? can(user,"finance","view") ? "/finance" : "/hr/payroll" : own ? "/me/attendance" : "/hr/attendance", label: prefix === "attendance-adjustment" ? "Open payroll adjustments" : "Open attendance" };
    }
  } else if (item.type === "leave_request") {
    const row = find("leaveRequests", target);
    if (row && (isMainManager(user) || can(user, "hr", "view") && isWithinScope(user, row))) {
      add(row, ["employee", "type", "from", "to", "days", "reason", "status", "decisionNote"]);
      link = { to: "/hr/leaveRequests", label: "Open leave request" };
    }
  } else if (item.type === "pending_approval") {
    const row = find("approvalRequests", target);
    if (row && (isMainManager(user) || can(user, "approvals", "view") && isWithinScope(user, row))) {
      add(row, ["section", "action", "collection", "status", "requestedByName", "requestedAt", "decisionNote"]);
      link = { to: row.collection === "documents" ? `/hr/documents/requests/${encodeURIComponent(target)}` : "/admin?tab=Approvals", label: "Open approvals" };
    }
  } else if (["registration_request", "password_reset"].includes(item.type) && isMainManager(user)) {
    const row = find("accessUsers", target);
    if (row) {
      add(row, ["name", "email", "status"]);
      if (Array.isArray(row.organizationIds)) details.companies = row.organizationIds.map(id => find("companies", String(id))?.name).filter(Boolean);
      link = { to: `/admin?tab=Users&user=${encodeURIComponent(target)}`, label: "Manage password & account" };
    }
  }
  return { details, ...(link ? { link } : {}) };
}
