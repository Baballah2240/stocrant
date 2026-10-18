import type { AuthenticatedUser } from "./auth.js";
import { getCollection, getStore } from "./storage.js";
import { can, companyIdsFor, effectiveLocationIds, hasLocationRestriction, isMainManager, isWithinScope, ownRecordsRequired } from "./permissions.js";
type Row = Record<string, unknown>;
const rows = (name: string) => getCollection(name) as Row[];
const normalized = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase();
export function policyError(message: string, statusCode = 400): never { throw Object.assign(new Error(message), { statusCode }); }

/** A deactivated company, or one below a deactivated organization, retains its
 * history but cannot receive new assignments or operational records. */
function activeCompany(id: unknown): Row | undefined {
  const company = rows("companies").find(candidate => candidate.id === id);
  if (!company || company.status === "inactive") return undefined;
  // The additive migration assigns a parent on normal load. Keep an
  // unparented record usable for Main Admin repair/import compatibility until
  // that next migration pass; it is never visible to Organization Admins.
  if (!company.parentOrganizationId) return company;
  return rows("organizations").some(organization => organization.id === company.parentOrganizationId && organization.status === "active") ? company : undefined;
}

export function validateAccountAssignment(actor: AuthenticatedUser, next: Row, existing?: Row) {
  const main = isMainManager(actor);
  if (!main && existing && !canManageAccount(actor, existing)) policyError("User not found.", 404);
  if (!rows("accessRoles").some(role => role.id === next.roleId)) policyError("Choose a valid role.");
  if (!main && ["role-main-manager", "role-organization-admin"].includes(String(next.roleId))) policyError("You do not have permission to assign this role.", 403);
  if (!main && next.id === actor.id) policyError("You cannot change your own administrative access.", 403);
  const companies = Array.isArray(next.organizationIds) ? next.organizationIds.map(String) : [];
  const parents = Array.isArray(next.tenantOrganizationIds) ? next.tenantOrganizationIds.map(String) : [];
  if (next.roleId === "role-organization-admin") {
    if (parents.length !== 1 || !rows("organizations").some(org => org.id === parents[0] && org.status === "active")) policyError("Assign the Organization Admin to one active organization.");
    if (companies.length && companies.some(id => activeCompany(id)?.parentOrganizationId !== parents[0])) policyError("Choose active companies from the assigned organization.");
    if (next.employeeId && !rows("employees").some(employee => employee.id === next.employeeId && activeCompany(employee.organizationId)?.parentOrganizationId === parents[0])) policyError("Choose an employee from the assigned organization.");
  } else if (next.roleId !== "role-main-manager") {
    // An unassigned pending registration may stay pending; activation always needs scope.
    if (!(next.status === "pending" && !companies.length) && (companies.length !== 1 || !activeCompany(companies[0]))) policyError("Assign this user to one active company.");
    if (parents.length && (parents.length !== 1 || activeCompany(companies[0])?.parentOrganizationId !== parents[0])) policyError("Company and organization assignments must match.");
    if (!main && companies.some(id => !companyIdsFor(actor).includes(id))) policyError("You do not have permission to assign another company.", 403);
    if (next.employeeId && !rows("employees").some(employee => employee.id === next.employeeId && (employee.organizationId ?? employee.companyId) === companies[0] && activeCompany(companies[0]))) policyError("Choose an employee from the assigned company.");
  }
  const locations = Array.isArray(next.locationIds) ? next.locationIds.map(String) : [];
  const allowed = next.roleId === "role-organization-admin"
    ? rows("companies").filter(company => parents.includes(String(company.parentOrganizationId)) && activeCompany(company.id)).map(company => String(company.id))
    : companies.filter(company => activeCompany(company));
  if (locations.some(id => !getStore().stores.some(location => location.id === id && allowed.includes(location.companyId)))) policyError("Choose locations from the assigned company.");
  const actorLocations = effectiveLocationIds(actor);
  if (!main && hasLocationRestriction(actor) && !actorLocations.length) policyError("You do not have permission to use this location scope.", 403);
  if (!main && ownRecordsRequired(actor)) policyError("Own-record access does not permit creating or managing other login accounts.", 403);
  if (!main && actorLocations.length && (!locations.length || locations.some(id => !actorLocations.includes(id)))) policyError("You do not have permission to broaden location access.", 403);
  if (next.employeeId && rows("accessUsers").some(account => account.id !== next.id && account.employeeId === next.employeeId)) policyError("This employee already has a login account.");
  if (!main) {
    const role = rows("accessRoles").find(role => role.id === next.roleId);
    const grants = Array.isArray(next.permissions) ? next.permissions : Array.isArray(role?.permissions) ? role.permissions : [];
    const actions = ["view", "create", "edit", "delete", "approve", "reply", "export"] as const;
    for (const grant of grants.map(String)) {
      const [section, action] = grant.split(".");
      if (grant === "*" || !section || !action) policyError("You do not have permission to grant unrestricted access.", 403);
      if ((action === "*" ? actions : [action]).some(value => !can(actor, section as Parameters<typeof can>[1], value as typeof actions[number]))) policyError("You cannot grant permissions you do not have.", 403);
    }
    if (ownRecordsRequired(actor) && next.ownRecordsOnly !== true) policyError("You cannot broaden record ownership access.", 403);
  }
}

export function canManageAccount(actor: AuthenticatedUser, account: Row) {
  if (isMainManager(actor)) return true;
  if (["role-main-manager", "role-organization-admin"].includes(String(account.roleId))) return false;
  const companies = Array.isArray(account.organizationIds) ? account.organizationIds.map(String) : [];
  const locations = effectiveLocationIds(actor);
  return companies.length === 1 && companyIdsFor(actor).includes(companies[0]) && (!locations.length || (Array.isArray(account.locationIds) && account.locationIds.length > 0 && account.locationIds.every(id => locations.includes(String(id))))) && isWithinScope(actor, { ...account, organizationId: companies[0], locationId: Array.isArray(account.locationIds) ? account.locationIds[0] : undefined });
}

export function validateHierarchyMutation(user: AuthenticatedUser, collection: string, action: string, input: Row, current?: Row): Row {
  const next = { ...current, ...input };
  if (collection === "attendance" && ["create", "edit", "delete"].includes(action)) policyError("Use the Attendance & Timesheets workflow to create or change attendance records.", 409);
  if (["roles", "users", "accessRoles", "accessUsers", "approvalRules"].includes(collection) && !isMainManager(user)) policyError("Only the Main Admin has permission to change global access settings.", 403);
  if (collection === "organizations") {
    if ((action !== "edit" || (input.status !== undefined && input.status !== current?.status)) && !isMainManager(user)) policyError("Only the Main Admin has permission to create, activate or deactivate organizations.", 403);
    if (action === "delete" && rows("companies").some(company => company.parentOrganizationId === current?.id)) policyError("This organization contains companies. Deactivate it to preserve its records.");
    if (action !== "delete" && rows("organizations").some(org => org.id !== current?.id && normalized(org.name) === normalized(next.name))) policyError("An organization with this name already exists.", 409);
    return input;
  }
  if (collection === "companies") {
    const parent = rows("organizations").find(org => org.id === next.parentOrganizationId);
    if (action !== "delete" && (!parent || parent.status !== "active")) policyError("Choose an active organization for this company.");
    if (!isMainManager(user) && !(user.roleId === "role-company-manager" && action === "edit" && current && companyIdsFor(user).includes(String(current.id))) && (user.roleId !== "role-organization-admin" || !(user.tenantOrganizationIds ?? []).includes(String(next.parentOrganizationId)))) policyError("You do not have permission to manage this organization's companies.", 403);
    if (current && next.parentOrganizationId !== current.parentOrganizationId && !isMainManager(user)) policyError("Only the Main Admin has permission to transfer a company.", 403);
    if (action !== "delete" && rows("companies").some(company => company.id !== current?.id && company.parentOrganizationId === next.parentOrganizationId && normalized(company.name) === normalized(next.name))) policyError("A company with this name already exists in this organization.", 409);
    if (action === "delete") {
      const id = current?.id;
      if (getStore().stores.some(location => location.companyId === id) || Object.entries(getStore().collections).some(([name, list]) => name !== "companies" && list.some(raw => { const row = raw as Row; return row.organizationId === id || row.companyId === id || (Array.isArray(row.organizationIds) && row.organizationIds.includes(id)); }))) policyError("This company has linked records. Deactivate it to preserve its history.");
    }
    return input;
  }
  const companyId = next.organizationId ?? next.companyId;
  if (next.organizationId && next.companyId && next.organizationId !== next.companyId) policyError("Company assignments must match.");
  if (action !== "delete" && companyId && !activeCompany(companyId)) policyError("Choose an active company in an active organization.");
  for (const field of ["locationId", "storeId"]) if (action !== "delete" && next[field]) {
    const location = getStore().stores.find(location => location.id === next[field]);
    if (!location || (companyId && location.companyId !== companyId)) policyError("Choose a location from the assigned company.");
  }
  const relations: Record<string, string> = { employeeId: "employees", assignedStaffId: "employees", assigneeId: "employees", inventoryItemId: "inventoryItems", accountId: "financeAccounts", customerId: "customers", questionId: "customerQuestions", workItemId: "workItems" };
  for (const [key, relatedCollection] of Object.entries(relations)) if (action !== "delete" && next[key]) {
    const related = rows(relatedCollection).find(row => row.id === next[key]);
    const relatedCompany = related?.organizationId ?? related?.companyId;
    if (!related || !isWithinScope(user, related) || (relatedCompany && !activeCompany(relatedCompany)) || (companyId && relatedCompany && relatedCompany !== companyId)) policyError("Choose a related record from the assigned company.");
  }
  if (collection === "employees") {
    if (action !== "delete" && !companyId) policyError("Choose a valid company for this employee.");
    for (const key of ["employeeCode", "email"]) if (action !== "delete" && normalized(next[key]) && rows("employees").some(employee => employee.id !== current?.id && normalized(employee[key]) === normalized(next[key]) && (key === "email" || employee.organizationId === companyId))) policyError(key === "email" ? "An employee with this email already exists." : "This employee ID already exists in the company.", 409);
    if (current && action === "edit" && companyId !== current.organizationId && rows("accessUsers").some(account => account.employeeId === current.id)) policyError("Transfer the linked login account before moving this employee.");
    if (action === "delete" && rows("accessUsers").some(account => account.employeeId === current?.id)) policyError("This employee has a login account. Deactivate the employee instead.");
  }
  return input;
}
