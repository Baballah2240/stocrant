import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedUser } from "./auth.js";
import { getCollection } from "./storage.js";

export type PermissionAction = "view" | "create" | "edit" | "delete" | "approve" | "export";
export type WorkspaceSection = "organizations" | "locations" | "hr" | "operations" | "inventory" | "finance" | "access" | "approvals" | "audit";

const COLLECTION_SECTIONS: Record<string, WorkspaceSection> = {
  companies: "organizations",
  departments: "hr", employees: "hr", attendance: "hr", shifts: "hr", leaveRequests: "hr", documents: "hr", employeeHistory: "hr", performanceReviews: "hr",
  tasks: "operations", workItems: "operations", workActivity: "operations", suppliers: "operations", customers: "operations", products: "operations",
  warehouses: "inventory", bins: "inventory", inventory: "inventory", inventoryItems: "inventory", stockMovements: "inventory", inventoryMovements: "inventory", stockTransfers: "inventory", warehouseOrders: "inventory",
  payroll: "finance", sales: "finance", expenses: "finance", taxes: "finance", purchases: "finance", returns: "finance", financeAccounts: "finance", financeTransactions: "finance",
  accessRoles: "access", accessUsers: "access", approvalRules: "access", approvalRequests: "approvals", auditLog: "audit", locationUpdates: "locations", roles: "access", users: "access",
};

type RoleRow = Record<string, unknown> & { id: string; permissions?: unknown };

function roleFor(user: AuthenticatedUser): RoleRow | undefined {
  return (getCollection("accessRoles") as RoleRow[]).find((role) => role.id === user.roleId);
}

function permissionsFor(user: AuthenticatedUser): string[] {
  const permissions = roleFor(user)?.permissions;
  return Array.isArray(permissions) ? permissions.filter((permission): permission is string => typeof permission === "string") : [];
}

export function sectionForCollection(collection: string): WorkspaceSection {
  return COLLECTION_SECTIONS[collection] ?? "operations";
}

export function can(user: AuthenticatedUser | undefined, section: WorkspaceSection, action: PermissionAction): boolean {
  if (!user) return false;
  const permissions = permissionsFor(user);
  return permissions.includes("*") || permissions.includes(`${section}.*`) || permissions.includes(`${section}.${action}`);
}

export function requirePermission(section: WorkspaceSection, action: PermissionAction) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Sign in is required." });
    if (!can(req.auth, section, action)) return res.status(403).json({ error: `You do not have permission to ${action} ${section}.` });
    next();
  };
}

export function canViewPersonalData(user: AuthenticatedUser | undefined) {
  return Boolean(user && (can(user, "hr", "edit") || can(user, "finance", "view") || permissionsFor(user).includes("hr.personal.view") || permissionsFor(user).includes("*")));
}

export function canViewSalaryData(user: AuthenticatedUser | undefined) {
  return Boolean(user && (can(user, "finance", "view") || permissionsFor(user).includes("hr.salary.view") || permissionsFor(user).includes("*")));
}

export function isWithinScope(user: AuthenticatedUser, row: Record<string, unknown>): boolean {
  const role = roleFor(user);
  const roleOrganizations = Array.isArray(role?.organizationIds) ? role.organizationIds.filter((id): id is string => typeof id === "string") : [];
  const roleLocations = Array.isArray(role?.locationIds) ? role.locationIds.filter((id): id is string => typeof id === "string") : [];
  const organizationIds = [...new Set([...roleOrganizations, ...user.organizationIds])];
  const locationIds = [...new Set([...roleLocations, ...user.locationIds])];
  const organizationId = row.organizationId ?? row.companyId;
  const locationId = row.locationId ?? row.storeId;
  if (organizationIds.length && (!organizationId || !organizationIds.includes(String(organizationId)))) return false;
  if (locationIds.length && (!locationId || !locationIds.includes(String(locationId)))) return false;
  if (!(user.ownRecordsOnly || role?.ownRecordsOnly === true)) return true;
  const candidates = [row.employeeId, row.assigneeId, row.responsibleEmployeeId, row.assignee, row.email, row.employee]
    .filter((value): value is string => typeof value === "string");
  return candidates.includes(user.id) || candidates.includes(user.employeeId ?? "") || candidates.includes(user.name) || candidates.includes(user.email);
}

export function redactRecord(collection: string, row: Record<string, unknown>, user: AuthenticatedUser): Record<string, unknown> {
  const result = { ...row };
  if (collection === "employees" && !canViewPersonalData(user) && row.email !== user.email) {
    delete result.email;
    delete result.phone;
    delete result.birthday;
    delete result.salary;
  }
  if ((collection === "payroll" || collection === "financeTransactions") && !canViewSalaryData(user)) {
    for (const key of ["basic", "allowances", "deductions", "tax", "netPay", "amount"]) delete result[key];
  }
  return result;
}

