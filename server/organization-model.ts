/** Additive tenant migration. Legacy organizationId/organizationIds mean COMPANY.
 * Keep them unchanged; only parentOrganizationId/tenantOrganizationIds mean organization. */
import type { StoreData } from "./storage.js";

export const DEFAULT_ORGANIZATION_ID = "organization-primary";
export function migrateOrganizations(data: StoreData): boolean {
  let changed = false;
  if (!Array.isArray(data.collections.organizations)) { data.collections.organizations = []; changed = true; }
  const organizations = data.collections.organizations as Record<string, unknown>[];
  const companies = (data.collections.companies ?? []) as Record<string, unknown>[];
  // Existing independent companies get independent parents, never silently share access.
  for (const company of companies) {
    if (company.parentOrganizationId) continue;
    const id = company.id === "company-primary" ? DEFAULT_ORGANIZATION_ID : `organization-for-${String(company.id)}`;
    if (!organizations.some(org => org.id === id)) organizations.push({ id, name: String(company.name || "Organization"), status: "active", migratedFromCompanyId: company.id, createdAt: new Date().toISOString() });
    company.parentOrganizationId = id;
    changed = true;
  }
  const roles = data.collections.accessRoles as Record<string, unknown>[];
  const superAdmin=roles.find(role=>role.id==="role-main-manager");
  if(superAdmin&&superAdmin.name!=="Super Admin"){superAdmin.name="Super Admin";changed=true;}
  for (const role of [
    { id: "role-shop-manager", name: "Shop Manager", permissions: ["organizations.view", "shops.*", "operations.view", "operations.create", "operations.edit", "operations.export", "inventory.view", "inventory.create", "inventory.edit", "inventory.export", "finance.view", "finance.create"], description: "Manages company products, stock, orders, storefront publication and shop connections without user administration." },
    { id: "role-organization-admin", name: "Organization Admin", permissions: ["organizations.view", "organizations.create", "organizations.edit", "organizations.delete", "organizations.export", "payroll.*", "locations.*", "hr.*", "operations.*", "inventory.*", "finance.*", "customerService.*", "access.view", "access.create", "access.edit", "access.delete", "audit.view", "approvals.view", "approvals.approve"], description: "Manages permitted records and accounts in one assigned organization." },
    { id: "role-company-manager", name: "Company Manager", permissions: ["organizations.view", "locations.*", "hr.view", "hr.create", "hr.edit", "hr.delete", "operations.*", "inventory.*", "customerService.*", "access.view", "access.create", "access.edit", "access.delete", "audit.view"], description: "Manages permitted records and staff in one assigned company." },
    { id: "role-hr-manager", name: "HR Manager", permissions: ["organizations.view", "hr.view", "hr.create", "hr.edit", "hr.approve", "approvals.view"], description: "Reviews attendance corrections and performs the HR attendance approval stage." },
    { id: "role-hr-staff", name: "HR Staff", permissions: ["organizations.view", "hr.view", "hr.create", "hr.edit"], description: "Maintains HR records in the assigned company without administrative or approval access." },
    { id: "role-general-manager", name: "General Manager", permissions: ["organizations.view", "hr.view", "approvals.view", "approvals.approve"], description: "Performs the General Manager attendance approval stage." },
    { id: "role-finance-manager", name: "Finance Manager", permissions: ["organizations.view", "hr.view", "finance.view", "approvals.view", "approvals.approve"], description: "Performs the Finance Manager attendance approval stage and reviews deductions." },
  ]) if (!roles.some(existing => existing.id === role.id)) { roles.push({ ...role, isSystem: true, dataClassification: "system" }); changed = true; }
  // Upgrade the shipped organization role only; explicit custom roles/accounts remain restricted.
  const organizationRole=roles.find(role=>role.id==="role-organization-admin");
  const previous=["organizations.view", "organizations.create", "organizations.edit", "locations.*", "hr.*", "operations.*", "inventory.*", "finance.*", "customerService.*", "access.view", "access.create", "access.edit", "access.delete", "audit.view", "approvals.view", "approvals.approve"];
  if(organizationRole&&Array.isArray(organizationRole.permissions)&&organizationRole.permissions.length===previous.length&&previous.every(grant=>(organizationRole.permissions as unknown[]).includes(grant))){organizationRole.permissions=["organizations.view", "organizations.create", "organizations.edit", "organizations.delete", "organizations.export", "payroll.*", "locations.*", "hr.*", "operations.*", "inventory.*", "finance.*", "customerService.*", "access.view", "access.create", "access.edit", "access.delete", "audit.view", "approvals.view", "approvals.approve"];changed=true;}
  const settings = (data.collections.workspaceSettings as Record<string, unknown>[]).find(row => row.id === "workspace-settings");
  const companyRole = roles.find(role => role.id === "role-company-manager");
  const oldCompanyPermissions = ["organizations.view", "locations.*", "hr.view", "hr.create", "hr.edit", "hr.delete", "operations.*", "inventory.*", "customerService.*", "access.view", "access.create", "access.edit", "access.delete", "audit.view"];
  if (companyRole && Array.isArray(companyRole.permissions) && companyRole.permissions.length === oldCompanyPermissions.length && oldCompanyPermissions.every(value => (companyRole.permissions as unknown[]).includes(value))) { companyRole.permissions = [...oldCompanyPermissions, "hr.approve", "approvals.view"]; changed = true; }
  // Upgrade shipped defaults once; preserve deliberately restricted/customized roles.
  const fullCompanyPermissions = ["organizations.view", "organizations.edit", "organizations.export", "locations.*", "hr.*", "operations.*", "inventory.*", "finance.*", "payroll.*", "customerService.*", "shops.*", "access.view", "access.create", "access.edit", "access.delete", "audit.view", "approvals.view", "approvals.approve"];
  const shippedCompany = [...oldCompanyPermissions, "hr.approve", "approvals.view"];
  if (companyRole && Array.isArray(companyRole.permissions) && companyRole.permissions.length === shippedCompany.length && shippedCompany.every(value => (companyRole.permissions as unknown[]).includes(value))) { companyRole.permissions = fullCompanyPermissions; changed = true; }
  const shippedOrganization = ["organizations.view", "organizations.create", "organizations.edit", "organizations.delete", "organizations.export", "payroll.*", "locations.*", "hr.*", "operations.*", "inventory.*", "finance.*", "customerService.*", "access.view", "access.create", "access.edit", "access.delete", "audit.view", "approvals.view", "approvals.approve"];
  if (organizationRole && Array.isArray(organizationRole.permissions) && organizationRole.permissions.length === shippedOrganization.length && shippedOrganization.every(value => (organizationRole.permissions as unknown[]).includes(value))) { organizationRole.permissions = [...shippedOrganization, "shops.*"]; changed = true; }
  for (const org of organizations) {
    if (org.mainAdminAccountId) continue;
    const account = (data.collections.accessUsers as Record<string, unknown>[]).find(account => account.status === "active" && account.roleId === "role-organization-admin" && Array.isArray(account.tenantOrganizationIds) && account.tenantOrganizationIds.includes(org.id));
    if (account) { org.mainAdminAccountId = account.id; org.adminVersion = 1; changed = true; }
  }
  if (settings && settings.schemaVersion !== 4) { settings.schemaVersion = 4; changed = true; }
  return changed;
}
