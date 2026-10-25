import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedUser } from "./auth.js";
import { getCollection, getStore } from "./storage.js";

export type PermissionAction = "view" | "create" | "edit" | "delete" | "approve" | "reply" | "export" | "pay" | "configure";
export type WorkspaceSection = "organizations" | "locations" | "hr" | "operations" | "customerService" | "inventory" | "finance" | "payroll" | "access" | "approvals" | "audit" | "shops";

const COLLECTION_SECTIONS: Record<string, WorkspaceSection> = {
  organizations: "organizations",
  companies: "organizations",
  departments: "hr", employees: "hr", attendance: "hr", shifts: "hr", leaveRequests: "hr", documents: "hr", contracts:"hr",employmentContracts:"hr",employeeHistory: "hr", performanceReviews: "hr",
  companyNotes: "operations", tasks: "operations", workFiles:"operations", taskNotificationEvents:"operations", workItems: "operations", workActivity: "operations", suppliers: "operations", customers: "operations", products: "operations",
  customerAppointments: "customerService", customerQuestions: "customerService", customerReplies: "customerService",
  warehouses: "inventory", bins: "inventory", inventory: "inventory", inventoryItems: "inventory", stockMovements: "inventory", inventoryMovements: "inventory", stockTransfers: "inventory", warehouseOrders: "inventory",
  payroll: "payroll", sales: "finance", expenses: "finance", taxes: "finance", purchases: "finance", returns: "finance", financeAccounts: "finance", financeTransactions: "finance", financeHistory: "finance",
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
  if(section==="organizations"&&!["view","export"].includes(action)&&!isDelegatedAdmin(user))return false;
  if (["access", "audit"].includes(section) && !isDelegatedAdmin(user)) return false;
  const permissions = permissionsFor(user);
  return permissions.includes("*") || permissions.includes(`${section}.*`) || permissions.includes(`${section}.${action}`);
}

/** HR write access is granted by explicit permission strings (`hr.*`, `hr.create`,
 * `hr.edit`, `hr.delete`, `hr.approve`). Account administration has separate
 * delegated-admin permission and company-scope checks. */
export function canManageHr(user: AuthenticatedUser | undefined, action: PermissionAction): boolean {
  if (!user) return false;
  if (isMainManager(user)) return true;
  const permissions = permissionsFor(user);
  return permissions.includes("*") || permissions.includes("hr.*") || permissions.includes(`hr.${action}`);
}

/** Personal employee data (email/phone/address/birthday) is visible to the Main Admin,
 * delegated admins, HR users with record-management permission, and the employee
 * viewing their own record. Salary uses the separate salary permission below. */
export function canViewPersonalData(user: AuthenticatedUser | undefined): boolean {
  if (!user) return false;
  if (isMainManager(user) || isDelegatedAdmin(user)) return true;
  const permissions = permissionsFor(user);
  return permissions.includes("*") || permissions.includes("hr.*") || permissions.includes("hr.create") || permissions.includes("hr.edit") || permissions.includes("hr.personal.view") || can(user, "finance", "view");
}

/** Super Admin is the platform owner; retain the existing role ID for account compatibility. */
export function isSuperAdmin(user: AuthenticatedUser | undefined): boolean {
  return user?.roleId === "role-main-manager";
}
export const isMainManager = isSuperAdmin;

export function platformWebsiteInquiries(user: AuthenticatedUser): boolean {
  return isMainManager(user) || (can(user, "customerService", "view") && permissionsFor(user).includes("customerService.inquiries"));
}
export function canReadWebsiteInquiry(user: AuthenticatedUser, _row: Record<string, unknown>): boolean {
  return platformWebsiteInquiries(user);
}

export function isDelegatedAdmin(user: AuthenticatedUser | undefined) { return Boolean(user && ["role-organization-admin", "role-company-manager", "role-shop-manager"].includes(user.roleId)); }
export function isShopManager(user: AuthenticatedUser | undefined) { return Boolean(user?.roleId==="role-shop-manager" && can(user,"shops","configure")); }
export function companyIdsFor(user: AuthenticatedUser): string[] {
  const role = roleFor(user);
  const roleCompanies = Array.isArray(role?.organizationIds) ? role.organizationIds.map(String) : [];
  if (user.roleId !== "role-organization-admin") return user.organizationIds.filter(id => !roleCompanies.length || roleCompanies.includes(id));
  const organizations = getCollection("organizations") as Record<string, unknown>[];
  const parents = (user.tenantOrganizationIds ?? []).filter(id => organizations.some(org => org.id === id && org.status === "active"));
  return (getCollection("companies") as Record<string, unknown>[])
    .filter(company => company.status !== "inactive" && parents.includes(String(company.parentOrganizationId)) && user.organizationIds.includes(String(company.id)) && (!roleCompanies.length || roleCompanies.includes(String(company.id))))
    .map(company => String(company.id));
}
export function effectiveLocationIds(user: AuthenticatedUser): string[] {
  const role = roleFor(user);
  const locations = Array.isArray(role?.locationIds) ? role.locationIds.map(String) : [];
  return user.locationIds.length ? user.locationIds.filter(id => !locations.length || locations.includes(id)) : locations;
}
export function ownRecordsRequired(user: AuthenticatedUser) { return !isSuperAdmin(user) && (user.ownRecordsOnly || roleFor(user)?.ownRecordsOnly === true); }
export function hasLocationRestriction(user: AuthenticatedUser) { return user.locationIds.length > 0 || (Array.isArray(roleFor(user)?.locationIds) && (roleFor(user)!.locationIds as unknown[]).length > 0); }

export function requirePermission(section: WorkspaceSection, action: PermissionAction) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Sign in is required." });
    if (!can(req.auth, section, action)) return res.status(403).json({ error: `You do not have permission to ${action} ${section}.` });
    next();
  };
}

export function canViewSalaryData(user: AuthenticatedUser | undefined) {
  return Boolean(user && (can(user, "finance", "view") || can(user, "payroll", "view") || permissionsFor(user).includes("hr.salary.view") || permissionsFor(user).includes("*")));
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
  if (!row.id && row.parentOrganizationId && user.roleId === "role-organization-admin") return false;
  const organizationId = companyRow?.id ?? row.organizationId ?? row.companyId ?? inventoryItem?.organizationId ?? location?.companyId ?? employee?.organizationId;
  if (!organizationId || !organizationIds.includes(String(organizationId))) return false;
  if (roleOrganizations.length && !roleOrganizations.includes(String(organizationId))) return false;
  if (companyRow) return true;
  if (locationIds.length && (!locationId || !locationIds.includes(String(locationId)))) {
    const participant=row.taskVersion===2&&Array.isArray(row.assigneeIds)&&row.assigneeIds.includes(user.employeeId||"")&&(getCollection("employees") as Record<string,unknown>[]).some(e=>e.id===user.employeeId&&e.organizationId===organizationId&&locationIds.includes(String(e.locationId)));
    if(!participant)return false;
  }
  if(role?.scope==="department"||role?.scope==="section"){
    const field=role.scope==="department"?"departmentId":"sectionId",ids=Array.isArray(role[role.scope==="department"?"departmentIds":"sectionIds"])?role[role.scope==="department"?"departmentIds":"sectionIds"] as unknown[]:[];
    const people=getCollection("employees") as Record<string,unknown>[];
    const owners=[row.employeeId,row.assigneeId,...(Array.isArray(row.assigneeIds)?row.assigneeIds:[])];
    if(!ids.includes(row[field])&&!ids.includes(row.id)&&!people.some(person=>owners.includes(person.id)&&ids.includes(person[field])))return false;
  }
  if (Array.isArray(inventoryItem?.allowedEmployeeIds) && inventoryItem.allowedEmployeeIds.includes(user.employeeId ?? "")) return true;
  if (!(user.ownRecordsOnly || role?.ownRecordsOnly === true)) return true;
  const identities = new Set([user.id, user.employeeId].filter(Boolean));
  const owners = [row.accountId, row.employeeId, row.assigneeId, row.responsibleEmployeeId,...(Array.isArray(row.assigneeIds)?row.assigneeIds:[])].filter((value): value is string => typeof value === "string" && Boolean(value));
  if (owners.length) return owners.some(id => identities.has(id));
  const employees = getCollection("employees") as Record<string, unknown>[];
  const employeeRecord = employees.find(employee => employee.id === row.id);
  if (employeeRecord) return employeeRecord.id === user.employeeId || employeeRecord.accountId === user.id;
  const stable = [row.email, row.createdBy, row.createdById, row.assignee, row.employee].filter((value): value is string => typeof value === "string");
  if (stable.some(value => identities.has(value) || value === user.email)) return true;
  // Legacy display-name assignments remain readable only through an unambiguous,
  // linked employee identity. Changing an account's display name grants no access.
  const names = [row.assignee, row.employee].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  return names.some(name => {
    const matches = employees.filter(employee => (employee.organizationId ?? employee.companyId) === organizationId && employee.name === name);
    return matches.length === 1 && matches[0].id === user.employeeId;
  });
}

export function redactRecord(collection: string, row: Record<string, unknown>, user: AuthenticatedUser): Record<string, unknown> {
  const result = { ...row };
  if (collection === "employees" && !canViewPersonalData(user) && row.id !== user.employeeId) {
    delete result.email;
    delete result.phone;
    delete result.address;
    delete result.birthday;
  }
  if (collection === "employees" && !canViewSalaryData(user) && row.id !== user.employeeId) delete result.salary;
  if (collection === "employeeHistory" && row.event === "salary-change" && !canViewSalaryData(user)) {
    for (const key of ["details","salary","amount","before","after"]) delete result[key];
  }
  if ((collection === "payroll" || collection === "financeTransactions") && !canViewSalaryData(user)) {
    for (const key of ["basic", "allowances", "deductions", "tax", "netPay", "amount"]) delete result[key];
  }
  return result;
}

