import { Router } from "express";
import { z } from "zod";
import { authenticatedUser, hashPassword } from "./auth.js";
import { generateUsername } from "./employee-identity.js";
import { getCollection, getStore, nextCollectionId, saveStore, transaction } from "./storage.js";
import { isMainManager, isWithinScope, can } from "./permissions.js";
import { validateAccountAssignment } from "./organization-policy.js";
import { protectOrganizationAdmin } from "./organization-admin-policy.js";
import { audit } from "./workspace.js";
type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
const publicAccount = (row: Row) => ({ id: row.id, name: row.name, email: row.email, status: row.status });
const belongs = (row: Row, orgId: string) => row.roleId === "role-organization-admin" ? row.tenantOrganizationIds?.includes(orgId) : row.organizationIds?.length === 1 && rows("companies").some(company => company.id === row.organizationIds[0] && company.parentOrganizationId === orgId);
const input = z.union([
  z.object({ version: z.number().int().min(0), accountId: z.string().min(1) }).strict(),
  z.object({ version: z.number().int().min(0), name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(160), password: z.string().min(12).max(256) }).strict(),
]);
export const organizationAdminsRouter = Router();
organizationAdminsRouter.get("/:id", (req, res) => {
  const org = rows("organizations").find(org => org.id === req.params.id);
  if (!org || !can(req.auth, "organizations", "view") || !isWithinScope(req.auth!, org)) return res.status(404).json({ error: "Organization not found." });
  const admin = rows("accessUsers").find(account => account.id === org.mainAdminAccountId && account.status === "active" && account.roleId === "role-organization-admin" && belongs(account, org.id));
  res.json({ admin: admin ? publicAccount(admin) : null, version: Number(org.adminVersion) || 0, candidates: isMainManager(req.auth) ? rows("accessUsers").filter(account => account.status === "active" && account.roleId !== "role-main-manager" && belongs(account, org.id)).map(publicAccount) : [] });
});
organizationAdminsRouter.post("/:id", async (req, res) => {
  if (!isMainManager(req.auth)) return res.status(403).json({ error: "Only the platform Main Admin can assign an organization main admin." });
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose an account or enter a name, valid email and temporary password of at least 12 characters." });
  const value = parsed.data;
  const passwordHash = "password" in value ? await hashPassword(value.password) : undefined;
  req.auth = authenticatedUser(req);
  if (!isMainManager(req.auth) || req.auth?.accountStatus !== "active") return res.status(403).json({ error: "Your account access changed. Sign in again." });
  const org = rows("organizations").find(org => org.id === req.params.id && org.status === "active");
  if (!org) return res.status(404).json({ error: "Choose an active organization." });
  if ((Number(org.adminVersion) || 0) !== value.version) return res.status(409).json({ error: "The organization admin changed. Refresh before saving." });
  const existing = "accountId" in value ? rows("accessUsers").find(account => account.id === value.accountId) : undefined;
  if ("accountId" in value && (!existing || existing.roleId === "role-main-manager" || existing.status !== "active" || !belongs(existing, org.id))) return res.status(400).json({ error: "Choose an active account from this organization." });
  if ("email" in value && rows("accessUsers").some(account => String(account.email).toLowerCase() === value.email.toLowerCase())) return res.status(409).json({ error: "An account with that email already exists." });
  const account: Row = { ...(existing || {}), ...( "email" in value ? { id: nextCollectionId("accessUsers"), name: value.name, email: value.email.toLowerCase(), username: generateUsername(rows("accessUsers"), value.name), passwordHash, mustChangePassword: true, status: "active", createdAt: new Date().toISOString() } : {}), roleId: "role-organization-admin", organizationIds: [], tenantOrganizationIds: [org.id], locationIds: [], ownRecordsOnly: false, updatedAt: new Date().toISOString() };
  delete account.permissions;
  try {
    if (existing) protectOrganizationAdmin(existing, account);
    validateAccountAssignment(req.auth!, account, existing);
    transaction(() => {
      if (existing) { Object.assign(existing, account); delete existing.permissions; } else rows("accessUsers").push(account);
      org.mainAdminAccountId = account.id; org.adminVersion = value.version + 1;
      getStore().collections.sessions = rows("sessions").filter(session => session.accountId !== account.id);
      getStore().collections.employeeInvitations = rows("employeeInvitations").filter(invite => invite.accountId !== account.id);
      audit(req.auth, "organization.main-admin-assigned", { parentOrganizationId: org.id, targetId: account.id });
      saveStore(getStore());
    });
  } catch (error) { return res.status((error as { statusCode?: number }).statusCode || 400).json({ error: (error as Error).message }); }
  return res.status(existing ? 200 : 201).json({ admin: publicAccount(account), version: org.adminVersion });
});
