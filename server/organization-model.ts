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
  for (const role of [
    { id: "role-organization-admin", name: "Organization Admin", permissions: ["organizations.view", "organizations.create", "organizations.edit", "locations.*", "hr.*", "operations.*", "inventory.*", "finance.*", "customerService.*", "access.view", "access.create", "access.edit", "access.delete", "audit.view", "approvals.view", "approvals.approve"], description: "Manages permitted records and accounts in one assigned organization." },
    { id: "role-company-manager", name: "Company Manager", permissions: ["organizations.view", "locations.*", "hr.view", "hr.create", "hr.edit", "hr.delete", "operations.*", "inventory.*", "customerService.*", "access.view", "access.create", "access.edit", "access.delete", "audit.view"], description: "Manages permitted records and staff in one assigned company." },
  ]) if (!roles.some(existing => existing.id === role.id)) { roles.push({ ...role, isSystem: true, dataClassification: "system" }); changed = true; }
  const settings = (data.collections.workspaceSettings as Record<string, unknown>[]).find(row => row.id === "workspace-settings");
  if (settings && settings.schemaVersion !== 3) { settings.schemaVersion = 3; changed = true; }
  return changed;
}
