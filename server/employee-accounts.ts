import { protectOrganizationAdmin } from "./organization-admin-policy.js";
import { generateUsername } from "./employee-identity.js";
import { createHash, randomBytes } from "node:crypto";
import type { AuthenticatedUser } from "./auth.js";
import { getCollection, getStore, nextCollectionId, saveStore } from "./storage.js";
import { audit } from "./workspace.js";
import { isMainManager, ownRecordsRequired } from "./permissions.js";
import { administrationPolicy } from "./admin-policy.js";
import { queueOnboarding } from "./onboarding.js";

type Row = Record<string, unknown> & { id: string };
const rows = (key: string) => getCollection(key) as Row[];
export const tokenDigest = (value: string) => createHash("sha256").update(value).digest("hex");
export const employmentInactive = (value: unknown) => ["inactive", "terminated", "suspended"].includes(String(value).toLowerCase());

/** Called inside the employee mutation transaction, including approved mutations. */
export function syncEmployeeAccount(actor: AuthenticatedUser, employee: Row, previous?: Row) {
  const data = getStore();
  let account = rows("accessUsers").find(row => row.employeeId === employee.id);
  const email = String(employee.email || "").trim().toLowerCase();
  const collision = email && rows("accessUsers").find(row => row.id !== account?.id && String(row.email).toLowerCase() === email);
  if (collision) throw new Error("This email already belongs to an account. Link it through authorized user management first.");
  if (!account) {
    if(!administrationPolicy().automaticAccounts||employee.loginAccount===false)return;
    if (ownRecordsRequired(actor)) throw new Error("Own-record access does not permit creating employee login accounts.");
    const role = rows("accessRoles").find(row => row.id === administrationPolicy().defaultRoleId&&row.status!=="inactive");
    if (!role) throw new Error("The Employee role is unavailable. Ask the Main Admin to restore it.");
    account = { id: nextCollectionId("accessUsers"), employeeId: employee.id, name: employee.name,
      email: email || `employee-${employee.id}@employee.invalid`, phone: employee.phone || "",
      username: generateUsername(rows("accessUsers"), employee.name, employee.employeeCode),
      roleId: role.id, ...(role.id==="role-employee"?{permissions:["hr.view"]}:{}), ownRecordsOnly: true,
      organizationIds: [employee.organizationId], tenantOrganizationIds: [],
      locationIds: employee.locationId ? [employee.locationId] : [],
      status: employmentInactive(employee.status) ? "suspended" : "invited",
      passwordHash: "activation-required", createdAt: new Date().toISOString(), createdBy: actor.id,
      activationRequired: true, mustChangePassword: false };
    data.collections.accessUsers = [...rows("accessUsers"), account];
    employee.accountId = account.id;
    audit(actor, "access.employee-account-created", { targetId: account.id, employeeId: employee.id, organizationId: employee.organizationId,employeeCode:employee.employeeCode,username:account.username,outcome:"success" });
    saveStore(data);
    if(administrationPolicy().automaticEmail)queueOnboarding(actor,employee);
  } else {
    // HR may update identity but must not silently grant access or reactivate suspended accounts.
    if (employmentInactive(employee.status) && account.roleId === "role-main-manager" && rows("accessUsers").filter(row => row.roleId === "role-main-manager" && row.status === "active").length <= 1) throw new Error("The last active Main Admin cannot be suspended.");
    if (previous && !isMainManager(actor) && ["role-main-manager", "role-organization-admin"].includes(String(account.roleId)) && (employee.email !== previous.email || employee.name !== previous.name || employmentInactive(employee.status))) throw new Error("Only the Main Admin can change this administrator's linked identity.");
    account = { ...account, name: employee.name, phone: employee.phone || "", ...(email ? { email } : {}), ...(employmentInactive(employee.status) ? { status: "suspended" } : {}) };
    if (employmentInactive(employee.status)) protectOrganizationAdmin(account);
    data.collections.accessUsers = rows("accessUsers").map(row => row.id === account!.id ? account! : row);
    employee.accountId = account.id;
    if(previous&&String(previous.email||"").toLowerCase()!==email){
      data.collections.employeeInvitations=rows("employeeInvitations").filter(row=>row.accountId!==account!.id);
      saveStore(data);
      if(account.status==="invited"&&administrationPolicy().automaticEmail)queueOnboarding(actor,employee);
    }
    if (employmentInactive(employee.status)) {
      data.collections.sessions = rows("sessions").filter(row => row.accountId !== account!.id);
      data.collections.employeeInvitations = rows("employeeInvitations").filter(row => row.accountId !== account!.id);
      audit(actor, "access.employee-account-suspended", { targetId: account.id, employeeId: employee.id, organizationId: employee.organizationId });
    }
  }
  saveStore(data);
}

export function issueEmployeeInvitation(actor: AuthenticatedUser, employee: Row) {
  const account = rows("accessUsers").find(row => row.employeeId === employee.id);
  if (!account || account.status !== "invited" || !account.activationRequired || employmentInactive(employee.status)) throw new Error("Only an invited employee account can receive an activation invitation.");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + administrationPolicy().invitationHours * 60 * 60 * 1000).toISOString();
  const data = getStore();
  data.collections.employeeInvitations = [...rows("employeeInvitations").filter(row => row.accountId !== account.id), { id: nextCollectionId("employeeInvitations"), accountId: account.id, tokenHash: tokenDigest(token), expiresAt, createdBy: actor.id }];
  saveStore(data);
  audit(actor, "access.employee-invitation-issued", { targetId: account.id, employeeId: employee.id, organizationId: employee.organizationId });
  return { token, expiresAt };
}
