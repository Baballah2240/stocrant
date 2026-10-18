import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedUser } from "./auth.js";
import { getCollection, getStore } from "./storage.js";

export type PermissionAction = "view" | "create" | "edit" | "delete" | "approve" | "reply" | "export";
export type WorkspaceSection = "organizations" | "locations" | "hr" | "operations" | "customerService" | "inventory" | "finance" | "access" | "approvals" | "audit";

const COLLECTION_SECTIONS: Record<string, WorkspaceSection> = {
  organizations: "organizations",
  companies: "organizations",
  departments: "hr", employees: "hr", attendance: "hr", shifts: "hr", leaveRequests: "hr", documents: "hr", employeeHistory: "hr", performanceReviews: "hr",
  tasks: "operations", workItems: "operations", workActivity: "operations", suppliers: "operations", customers: "operations", products: "operations",
  customerAppointments: "customerService", customerQuestions: "customerService", customerReplies: "customerService",
  warehouses: "inventory", bins: "inventory", inventory: "inventory", inventoryItems: "inventory", stockMovements: "inventory", inventoryMovements: "inventory", stockTransfers: "inventory", warehouseOrders: "inventory",
  payroll: "finance", sales: "finance", expenses: "finance", taxes: "finance", purchases: "finance", returns: "finance", financeAccounts: "finance", financeTransactions: "finance",
  accessRoles: "access", accessUsers: "access", approvalRules: "access", approvalRequests: "approvals", auditLog: "audit", locationUpdates: "locations", roles: "access", users: "access",
};

type RoleRow = Record<string, unknown> & { id: string; permissions?: unknown };

function roleFor(user: AuthenticatedUser): RoleRow | undefined {
  return (getCollection("accessRoles") as RoleRow[]).find((role) => role.id === user.roleId);
}

export function permissionsFor(user: AuthenticatedUser): string[] {
  const account = (getCollection("accessUsers") as Record<string, unknown>[]).find((account) => account.id === user.id);
  const permissions = Array.isArray(account?.permissions) ? account.permissions : roleFor(user)?.permissions;
  return Array.isArray(permissions) ? permissions.filter((permission): permission is string => typeof permission === "string") : [];
}

export function sectionForCollection(collection: string): WorkspaceSection {
  return COLLECTION_SECTIONS[collection] ?? "operations";
}

export function can(user: AuthenticatedUser | undefined, section: WorkspaceSection, action: PermissionAction): boolean {
  if (!user) return false;
  if (isMainManager(user)) return true;
  if (["access", "audit"].includes(section) && !isDelegatedAdmin(user)) return false;
  const permissions = permissionsFor(user);
  return permissions.includes("*") || permissions.includes(`${section}.*`) || permissions.includes(`${section}.${action}`);
}

/** HR write access is granted by explicit permission strings (`hr.*`, `hr.create`,
 * `hr.edit`, `hr.delete`, `hr.approve`). Account administration stays Main-Admin-only. */
export function canManageHr(user: AuthenticatedUser | undefined, action: PermissionAction): boolean {
  if (!user) return false;
  if (isMainManager(user)) return true;
  const permissions = permissionsFor(user);
  return permissions.includes("*") || permissions.includes("hr.*") || permissions.includes(`hr.${action}`);
}

/** Personal employee data (email/phone/birthday/salary) is visible to the Main Admin,
 * delegated admins, HR users with record-management permission, and the employee
 * viewing their own record. Everyone else receives a redacted record. */
export function canViewPersonalData(user: AuthenticatedUser | undefined): boolean {
  if (!user) return false;
  if (isMainManager(user) || isDelegatedAdmin(user)) return true;
  const permissions = permissionsFor(user);
  return permissions.includes("*") || permissions.includes("hr.*") || permissions.includes("hr.create") || permissions.includes("hr.edit") || permissions.includes("hr.personal.view") || can(user, "finance", "view");
}

/** The Main Admin is the sole account-administration override role. */
export function isMainManager(user: AuthenticatedUser | undefined): boolean {
  return user?.roleId === "role-main-manager";
}

export function isDelegatedAdmin(user: AuthenticatedUser | undefined) { return Boolean(user && ["role-organization-admin", "role-company-manager"].includes(user.roleId)); }
export function companyIdsFor(user: AuthenticatedUser): string[] {
  const role = roleFor(user);
  const roleCompanies = Array.isArray(role?.organizationIds) ? role.organizationIds.map(String) : [];
  if (user.roleId !== "role-organization-admin") return user.organizationIds.filter(id => !roleCompanies.length || roleCompanies.includes(id));
  const organizations = getCollection("organizations") as Record<string, unknown>[];
  const parents = (user.tenantOrganizationIds ?? []).filter(id => organizations.some(org => org.id === id && org.status === "active"));
  return (getCollection("companies") as Record<string, unknown>[])
    .filter(company => company.status !== "inactive" && parents.includes(String(company.parentOrganizationId)) && (!roleCompanies.length || roleCompanies.includes(String(company.id))))
    .map(company => String(company.id));
}
export function effectiveLocationIds(user: AuthenticatedUser): string[] {
  const role = roleFor(user);
  const locations = Array.isArray(role?.locationIds) ? role.locationIds.map(String) : [];
  return user.locationIds.length ? user.locationIds.filter(id => !locations.length || locations.includes(id)) : locations;
}
export function ownRecordsRequired(user: AuthenticatedUser) { return user.ownRecordsOnly || roleFor(user)?.ownRecordsOnly === true; }
export function hasLocationRestriction(user: AuthenticatedUser) { return user.locationIds.length > 0 || (Array.isArray(roleFor(user)?.locationIds) && (roleFor(user)!.locationIds as unknown[]).length > 0); }

export function requirePermission(section: WorkspaceSection, action: PermissionAction) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Sign in is required." });
    if (!can(req.auth, section, action)) return res.status(403).json({ error: `You do not have permission to ${action} ${section}.` });
    next();
  };
}

export function canViewSalaryData(user: AuthenticatedUser | undefined) {
  return Boolean(user && (can(user, "finance", "view") || permissionsFor(user).includes("hr.salary.view") || permissionsFor(user).includes("*")));
}

export function isWithinScope(user: AuthenticatedUser, row: Record<string, unknown>): boolean {
  if (isMainManager(user)) return true;
  const inventoryItem = row.inventoryItemId ? (getCollection("inventoryItems") as Record<string, unknown>[]).find((item) => item.id === row.inventoryItemId) : row;
  if (Array.isArray(inventoryItem?.allowedEmployeeIds) && inventoryItem.allowedEmployeeIds.length && !isMainManager(user)
    && !inventoryItem.allowedEmployeeIds.includes(user.employeeId ?? "")) return false;
  const role = roleFor(user);
  const roleOrganizations = Array.isArray(role?.organizationIds) ? role.organizationIds.filter((id): id is string => typeof id === "string") : [];
  const roleLocations = Array.isArray(role?.locationIds) ? role.locationIds.filter((id): id is string => typeof id === "string") : [];
  const organizationIds = companyIdsFor(user);
  const organizationRow = (getCollection("organizations") as Record<string, unknown>[]).find(org => org.id === row.id);
  if (organizationRow) return user.roleId === "role-organization-admin" ? (user.tenantOrganizationIds ?? []).includes(String(row.id)) : (getCollection("companies") as Record<string, unknown>[]).some(company => company.parentOrganizationId === row.id && organizationIds.includes(String(company.id)));
  if (user.roleId !== "role-organization-admin" && organizationIds.length !== 1) return false;
  const locationIds = effectiveLocationIds(user);
  if ((user.locationIds.length || roleLocations.length) && !locationIds.length) return false;
  const locationId = row.locationId ?? row.storeId;
  const location = getStore().stores.find(item => item.id === locationId || item.id === row.id);
  const employee = row.employeeId ? (getCollection("employees") as Record<string, unknown>[]).find(item => item.id === row.employeeId) : undefined;
  const companyRow = (getCollection("companies") as Record<string, unknown>[]).find(item => item.id === row.id);
  if (!row.id && row.parentOrganizationId && user.roleId === "role-organization-admin") return (user.tenantOrganizationIds ?? []).includes(String(row.parentOrganizationId));
  const organizationId = companyRow?.id ?? row.organizationId ?? row.companyId ?? inventoryItem?.organizationId ?? location?.companyId ?? employee?.organizationId;
  if (!organizationId || !organizationIds.includes(String(organizationId))) return false;
  if (roleOrganizations.length && !roleOrganizations.includes(String(organizationId))) return false;
  if (companyRow) return true;
  if (locationIds.length && (!locationId || !locationIds.includes(String(locationId)))) return false;
  if (Array.isArray(inventoryItem?.allowedEmployeeIds) && inventoryItem.allowedEmployeeIds.includes(user.employeeId ?? "")) return true;
  if (!(user.ownRecordsOnly || role?.ownRecordsOnly === true)) return true;
  const candidates = [row.employeeId, row.assigneeId, row.responsibleEmployeeId, row.assignee, row.email, row.employee, row.createdBy, row.createdById]
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

