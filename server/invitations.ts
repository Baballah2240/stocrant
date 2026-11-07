import { randomBytes } from "node:crypto";
import { Router, type Response } from "express";
import { z } from "zod";
import { accountScopeActive, hashPassword, publicUser, type AuthenticatedUser } from "./auth.js";
import { can, requirePermission } from "./permissions.js";
import { canManageAccount, validateAccountAssignment, policyError } from "./organization-policy.js";
import { tokenDigest, employmentInactive } from "./employee-accounts.js";
import { generateUsername } from "./employee-identity.js";
import { administrationPolicy } from "./admin-policy.js";
import { getCollection, getStore, nextCollectionId, saveStore, transaction } from "./storage.js";
import { blockedFor, recordFailure, releaseAttempt } from "./rate-limit.js";
import { audit } from "./workspace.js";

type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
const now = () => new Date().toISOString();
const pending = (row: Row) => row.status === "pending" && Date.parse(row.expiresAt) > Date.now();
const safe = ({ tokenHash: _hash, ...row }: Row) => ({ ...row, status: row.status === "pending" && !pending(row) ? "expired" : row.status });
function sendError(res: Response, error: unknown) { return res.status((error as { statusCode?: number }).statusCode || 400).json({ error: (error as Error).message }); }
function assignment(invite: Row) {
  return { name: invite.name, email: invite.email, roleId: invite.roleId, employeeId: invite.employeeId,
    organizationIds: [invite.companyId], tenantOrganizationIds: [], locationIds: [], ownRecordsOnly: invite.roleId === "role-employee", status: "active" };
}
function invitedAccount(invite: Row) {
  return invite.employeeId ? rows("accessUsers").find(row => row.employeeId === invite.employeeId && row.status === "invited" && row.activationRequired === true) : undefined;
}
function validate(actor: AuthenticatedUser, invite: Row) {
  if (["role-main-manager", "role-organization-admin"].includes(invite.roleId)) policyError("Choose a company-scoped role.");
  const existing = invitedAccount(invite);
  validateAccountAssignment(actor, { ...assignment(invite), ...(existing ? { id: existing.id } : {}) }, existing);
  if (rows("accessUsers").some(row => row.id !== existing?.id && String(row.email).toLowerCase() === invite.email)) policyError("An account with that email already exists.", 409);
  const employee = rows("employees").find(row => row.id === invite.employeeId);
  if (invite.employeeId && (!employee || employmentInactive(employee.status))) policyError("Choose an active employee.");
  if (employee?.email && String(employee.email).toLowerCase() !== invite.email) policyError("Use the employee's assigned email.");
  if (rows("employees").some(row => row.id !== invite.employeeId && String(row.email || "").toLowerCase() === invite.email)) policyError("Link the employee assigned to this email.");
}
function rotate(actor: AuthenticatedUser, invite: Row) {
  const token = randomBytes(32).toString("base64url");
  Object.assign(invite, { tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + administrationPolicy().invitationHours * 3600000).toISOString(), updatedAt: now(), status: "pending", createdBy: actor.id, deliveryStatus: "link-created" });
  delete invite.deliveryError;
  const existing = invitedAccount(invite);
  if (existing) getStore().collections.employeeInvitations = rows("employeeInvitations").filter(row => row.accountId !== existing.id);
  saveStore(getStore());
  audit(actor, "access.invitation-issued", { targetId: invite.id, organizationId: invite.companyId, roleId: invite.roleId });
  return token;
}
export const invitationsRouter = Router();
invitationsRouter.get("/", requirePermission("access", "view"), (req, res) => {
  res.json({ items: rows("accessInvitations").filter(row => canManageAccount(req.auth!, assignment(row))).map(safe) });
});
const schema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(160), companyId: z.string().min(1).max(160), roleId: z.string().min(1).max(160), employeeId: z.string().min(1).max(160).optional() }).strict();
invitationsRouter.post("/", requirePermission("access", "create"), (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a recipient, company and role." });
  try { transaction(() => {
    const invite: Row = { ...parsed.data, email: parsed.data.email.toLowerCase(), id: nextCollectionId("accessInvitations"), createdAt: now() };
    validate(req.auth!, invite);
    if (rows("accessInvitations").some(row => pending(row) && row.email === invite.email)) policyError("A pending invitation already exists. Resend or revoke it.", 409);
    getStore().collections.accessInvitations = [...rows("accessInvitations"), invite];
    const token = rotate(req.auth!, invite);
    res.status(201).json({ item: safe(invite), token });
  }); } catch (error) { sendError(res, error); }
});
for (const action of ["resend", "revoke", "send"] as const) invitationsRouter.post(`/:id/${action}`, requirePermission("access", "edit"), async (req, res) => {
  try {
    const invite = rows("accessInvitations").find(row => row.id === req.params.id);
    if (!invite || !canManageAccount(req.auth!, assignment(invite))) policyError("Invitation not found.", 404);
    if (invite.status !== "pending") policyError("Only pending invitations can be changed.", 409);
    if (action === "revoke") {
      invite.status = "revoked"; delete invite.tokenHash; invite.updatedAt = now(); saveStore(getStore());
      audit(req.auth, "access.invitation-revoked", { targetId: invite.id, organizationId: invite.companyId });
      return res.json({ item: safe(invite) });
    }
    validate(req.auth!, invite);
    if (action === "send") {
      if (req.body?.confirmDelivery !== true) policyError("Confirm sending this invitation email.");
      let origin: URL;
      try { origin = new URL(process.env.STOCRANT_APP_URL || ""); } catch { policyError("Configure the public HTTPS application URL.", 409); }
      if (origin!.protocol !== "https:" || origin!.username || origin!.password || origin!.hash || origin!.search || !process.env.STOCRANT_EMAIL_API_KEY || !process.env.STOCRANT_EMAIL_FROM) policyError("Email delivery is not configured.", 409);
      const key = `invitation-email:${req.auth!.id}`;
      if (blockedFor(key)) policyError("Too many invitation emails. Try again later.", 429);
      recordFailure(key);
      const token = rotate(req.auth!, invite);
      origin!.pathname = "/login"; origin!.hash = "invite=" + token;
      // Tokens stay in memory; only their digest is persisted. Resending invalidates prior links.
      try {
        const endpoint = process.env.NODE_TEST_CONTEXT ? process.env.STOCRANT_EMAIL_TEST_ENDPOINT || "https://api.resend.com/emails" : "https://api.resend.com/emails";
        const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${process.env.STOCRANT_EMAIL_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.STOCRANT_EMAIL_FROM, to: [invite.email], subject: "Your Stocrant invitation", text: `Hello ${invite.name},\nSet your own password: ${origin!}\nCompany: ${rows("companies").find(row => row.id === invite.companyId)?.name}\nRole: ${rows("accessRoles").find(row => row.id === invite.roleId)?.name}\nSingle use. Expires: ${invite.expiresAt}` }), signal: AbortSignal.timeout(10000), redirect: "error" });
        if (!response.ok || typeof (await response.json() as Row).id !== "string") throw new Error();
        if (invite.tokenHash === tokenDigest(token) && invite.status === "pending") { invite.deliveryStatus = "provider-accepted"; invite.sentAt = now(); saveStore(getStore()); }
        audit(req.auth, "access.invitation-email-accepted", { targetId: invite.id, organizationId: invite.companyId });
        return res.json({ item: safe(invite), token });
      } catch { if (invite.tokenHash === tokenDigest(token)) { invite.deliveryStatus = "failed"; saveStore(getStore()); } return res.status(502).json({ error: "Email delivery failed. Resend the invitation to retry." }); }
    }
    const token = rotate(req.auth!, invite);
    return res.json({ item: safe(invite), token });
  } catch (error) { return sendError(res, error); }
});

export const invitationAcceptanceRouter = Router();
invitationAcceptanceRouter.post("/accept-invitation", async (req, res) => {
  const key = `invitation-accept:${req.ip}`;
  if (blockedFor(key)) return res.status(429).json({ error: "Too many attempts. Try again later." });
  recordFailure(key);
  const parsed = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), email: z.string().trim().email().max(160), password: z.string().min(12).max(256) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Use a valid invitation, email and password of at least 12 characters." });
  const valid = () => {
    const invite = rows("accessInvitations").find(row => row.tokenHash === tokenDigest(parsed.data.token) && pending(row) && row.email === parsed.data.email.toLowerCase());
    if (!invite) policyError("This invitation is invalid, expired, or no longer available.");
    const issuer = rows("accessUsers").find(row => row.id === invite.createdBy && row.status === "active" && accountScopeActive(row));
    if (!issuer) policyError("The inviting administrator no longer has access.");
    const actor = publicUser(issuer as Parameters<typeof publicUser>[0]);
    if (!can(actor, "access", "create")) policyError("The inviting administrator no longer has access.");
    validate(actor, invite);
    return invite;
  };
  try {
    valid();
    const passwordHash = await hashPassword(parsed.data.password);
    transaction(() => {
      const invite = valid(); // Recheck after asynchronous hashing to prevent replay and revocation races.
      const existing = invitedAccount(invite);
      const account = { ...assignment(invite), id: existing?.id || nextCollectionId("accessUsers"), passwordHash, username: existing?.username || generateUsername(rows("accessUsers"), invite.name), activationRequired: false, mustChangePassword: false, createdAt: existing?.createdAt || now(), activatedAt: now() };
      getStore().collections.accessUsers = [...rows("accessUsers").filter(row => row.id !== account.id), account];
      getStore().collections.employeeInvitations = rows("employeeInvitations").filter(row => row.accountId !== account.id);
      if (invite.employeeId) { const employee = rows("employees").find(row => row.id === invite.employeeId)!; employee.accountId = account.id; employee.email = invite.email; }
      invite.status = "accepted"; invite.acceptedAt = now(); invite.accountId = account.id; delete invite.tokenHash;
      saveStore(getStore()); audit(undefined, "access.invitation-accepted", { targetId: invite.id, accountId: account.id, organizationId: invite.companyId, roleId: invite.roleId });
    });
    releaseAttempt(key);
    return res.json({ ok: true });
  } catch (error) { return sendError(res, error); }
});
