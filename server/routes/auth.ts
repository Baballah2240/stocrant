import { generateUsername, validUsername } from "../employee-identity.js";
import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { accountScopeActive, clearSession, createSession, hashPassword, loginTimingPad, matchesSetupKey, publicUser, requireAuth, setupKeyConfigured, verifyPassword } from "../auth.js";
import { isWithinScope } from "../permissions.js";
import { createNotification } from "../notifications.js";
import { blockedFor, clearFailures, recordFailure } from "../rate-limit.js";
import { getCollection, getStore, nextCollectionId, saveStore, transaction } from "../storage.js";
import { tokenDigest, employmentInactive } from "../employee-accounts.js";
import { audit } from "../workspace.js";

const router = Router();
router.post("/activate-employee", async (req, res) => {
  const key = `employee-activation:${req.ip ?? "unknown"}`;
  if (blockedFor(key)) return res.status(429).json({ error: "Too many attempts. Try again later." });
  recordFailure(key);
  const parsed = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), email: z.string().trim().email().max(160), password: z.string().min(12).max(256) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Use a valid invitation, email, and password of at least 12 characters." });
  const digest = tokenDigest(parsed.data.token);
  const valid = () => {
    const invite = (getCollection("employeeInvitations") as Record<string, unknown>[]).find(row => row.tokenHash === digest && Date.parse(String(row.expiresAt)) > Date.now());
    const account = invite && accounts().find(row => row.id === invite.accountId && row.status === "invited" && row.activationRequired === true);
    const employee = account && (getCollection("employees") as Record<string, unknown>[]).find(row => row.id === account.employeeId && !employmentInactive(row.status));
    return account && employee && accountScopeActive(account) ? { account, employee } : undefined;
  };
  if (!valid()) return res.status(400).json({ error: "This invitation is invalid, expired, or no longer available." });
  const hash = await hashPassword(parsed.data.password);
  // Hashing yields: atomically recheck one-time token, employment, scope, and uniqueness.
  try {
    transaction(() => {
      const current = valid();
      if (!current) throw new Error("This invitation is invalid, expired, or no longer available.");
      const email = parsed.data.email.toLowerCase();
      if (accounts().some(row => row.id !== current.account.id && row.email.toLowerCase() === email) || (getCollection("employees") as Record<string, unknown>[]).some(row => row.id !== current.employee.id && String(row.email || "").toLowerCase() === email)) throw new Error("This email is already in use.");
      // An existing HR-provided email is verified by handing over the invitation to that employee.
      if (current.employee.email && String(current.employee.email).toLowerCase() !== email) throw new Error("Use the email assigned by HR, or ask HR to update your profile first.");
      Object.assign(current.account, { email, passwordHash: hash, status: "active", activationRequired: false, activatedAt: new Date().toISOString() });
      current.employee.email = email;
      const data = getStore();
      data.collections.employeeInvitations = (getCollection("employeeInvitations") as Record<string, unknown>[]).filter(row => row.accountId !== current.account.id);
      saveStore(data);
      audit(undefined, "access.employee-account-activated", { targetId: current.account.id, employeeId: current.employee.id, organizationId: current.employee.organizationId });
    });
    clearFailures(key);
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ error: (error as Error).message }); }
});
const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(160),
  password: z.string().min(12, "Use at least 12 characters").max(256),
});

type Account = Record<string, unknown> & { id: string; email: string; name: string; passwordHash: string; roleId: string; status: string };

function authResponse(req: Request, account: Account, sessionToken: string) {
  return {
    user: publicUser(account),
    // Browser sessions stay in HTTP-only cookies. A packaged WebView needs the
    // same signed session in an Authorization header for cross-origin API calls.
    ...(req.get("X-STOCRANT-NATIVE") === "1" ? { sessionToken } : {}),
  };
}

function accounts() {
  return getCollection("accessUsers") as Account[];
}

router.get("/status", (req, res) => {
  const user = req.auth;
  res.json({
    authenticated: Boolean(user),
    setupRequired: accounts().length === 0,
    setupKeyConfigured: setupKeyConfigured(),
    user: user ?? null,
  });
});

router.post("/setup", async (req, res) => {
  if (accounts().length > 0) return res.status(409).json({ error: "A Main Admin has already been configured." });
  const parsed = credentialsSchema.extend({ name: z.string().trim().min(2).max(120), setupKey: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  if (!matchesSetupKey(parsed.data.setupKey)) return res.status(403).json({ error: "The setup key is invalid." });
  const account: Account = {
    id: nextCollectionId("accessUsers"),
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    passwordHash: await hashPassword(parsed.data.password),
    username: generateUsername(accounts(), parsed.data.name),
    roleId: "role-main-manager",
    status: "active",
    dataClassification: "company",
    createdAt: new Date().toISOString(),
  };
  // Password hashing yields; another setup request may have completed meanwhile.
  if (accounts().length > 0) return res.status(409).json({ error: "A Main Admin has already been configured." });
  const data = getStore();
  data.collections.accessUsers = [account];
  data.collections.auditLog = [
    ...(data.collections.auditLog as Record<string, unknown>[]),
    { id: nextCollectionId("auditLog"), action: "access.main-manager-created", actorId: account.id, actorName: account.name, occurredAt: new Date().toISOString() },
  ];
  saveStore(data);
  const sessionToken = createSession(res, account);
  res.status(201).json(authResponse(req, account, sessionToken));
});

function accountByEmail(email: string): Account | undefined {
  return accounts().find((candidate) => candidate.email.toLowerCase() === email.toLowerCase());
}

router.post("/forgot-password", (req, res) => {
  const parsed = z.object({ email: z.string().trim().email().max(160) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email address." });
  const key = `reset-request:${req.ip ?? "unknown"}`;
  if (blockedFor(key)) return res.status(429).json({ error: "Too many reset requests. Try again in a few minutes." });
  recordFailure(key);
  const account = accountByEmail(parsed.data.email);
  if (account?.status === "active") {
    const recent = (getCollection("notifications") as Record<string, unknown>[]).some((notification) => notification.type === "password_reset" && notification.target === account.id && !notification.read && Date.parse(String(notification.createdAt)) > Date.now() - 15 * 60 * 1000);
    if (!recent) for (const manager of accounts().filter((user) => user.roleId === "role-main-manager" && user.status === "active")) {
      createNotification({ userId: manager.id, user: manager.name, type: "password_reset", severity: "warning", message: `${account.name} (${account.email}) requested a password reset. Verify their identity before setting a new password in Users.`, target: account.id });
    }
  }
  res.json({ ok: true, message: "If this email has an active account, the main admin has been notified. Contact them to complete your password reset." });
});

router.get("/companies", requireAuth, (req, res) => {
  res.json({ companies: (getCollection("companies") as Record<string, unknown>[]).filter(company => company.status !== "inactive" && isWithinScope(req.auth!, company)).map(company => ({ id: String(company.id), name: String(company.name) })) });
});
router.post("/register", async (req, res) => {
  const parsed = credentialsSchema.extend({ name: z.string().trim().min(2).max(120) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(issue => issue.message).join("; ") });
  const key = `registration:${req.ip ?? "unknown"}`;
  if (blockedFor(key)) return res.status(429).json({ error: "Too many registration requests. Try again later." });
  recordFailure(key);
  const managers = accounts().filter(account => account.status === "active" && account.roleId === "role-main-manager");
  if (!managers.length) return res.status(409).json({ error: "The workspace must be set up by its Main Admin first." });
  const message = "Your request has been received. Sign in to check your approval status and messages.";
  if (accountByEmail(parsed.data.email)) return res.json({ ok: true, message });
  const passwordHash = await hashPassword(parsed.data.password);
  if (accountByEmail(parsed.data.email)) return res.json({ ok: true, message });
  const account: Account = { id: nextCollectionId("accessUsers"), username: generateUsername(accounts(), parsed.data.name), name: parsed.data.name, email: parsed.data.email.toLowerCase(), passwordHash, roleId: "role-employee", status: "pending", permissions: [], ownRecordsOnly: true, organizationIds: [], locationIds: [], dataClassification: "company", createdAt: new Date().toISOString() };
  const data = getStore(); data.collections.accessUsers = [...accounts(), account]; saveStore(data);
  for (const manager of managers) createNotification({ userId: manager.id, user: manager.name, type: "registration_request", severity: "info", message: `${account.name} (${account.email}) requested an account.`, target: account.id });
  createNotification({ userId: account.id, user: account.name, type: "message", severity: "info", message: "Your registration is awaiting Main Admin approval. You cannot access business records yet.", target: null });
  res.status(201).json({ ok: true, message });
});

function recordDeniedLoginAttempt(email: string): void {
  const target = accountByEmail(email);
  createNotification({
    userId: target?.id ?? null,
    user: target?.name ?? "Unknown",
    type: "unauthorized_access",
    severity: "warning",
    message: `Login attempt with ${email} was denied.`,
    target: email,
  });
}

router.post("/login", async (req, res) => {
  const parsed = credentialsSchema.extend({ email: z.string().trim().min(3).max(160).refine(value => validUsername(value.toLowerCase()) || z.string().email().safeParse(value).success, "Enter a valid email or username.") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  const email = parsed.data.email.toLowerCase();
  // Brute-force protection: per-IP and per-account failure windows.
  const ipKey = `ip:${req.ip ?? "unknown"}`;
  const accountKey = `acct:${email}`;
  const wait = Math.max(blockedFor(ipKey), blockedFor(accountKey));
  if (wait > 0) {
    res.setHeader("Retry-After", String(wait));
    return res.status(429).json({ error: "Too many sign-in attempts. Try again in a few minutes." });
  }
  const account = accountByEmail(email) || accounts().find(row => String(row.username || "").toLowerCase() === email);
  // Always run one scrypt verification (against a pad hash when the account is
  // unknown) so response timing does not reveal whether the email exists.
  const stored = account?.passwordHash ?? (await loginTimingPad());
  const passwordOk = await verifyPassword(parsed.data.password, stored);
  const currentAccount = account && accounts().find(current => current.id === account.id);
  if (!currentAccount || currentAccount.passwordHash !== stored || !["active", "pending", "rejected"].includes(currentAccount.status) || !accountScopeActive(currentAccount) || !passwordOk) {
    recordFailure(ipKey);
    recordFailure(accountKey);
    recordDeniedLoginAttempt(email);
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  clearFailures(ipKey);
  clearFailures(accountKey);
  const sessionToken = createSession(res, currentAccount);
  res.json(authResponse(req, currentAccount, sessionToken));
});

router.post("/logout", (req, res) => {
  clearSession(req, res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.auth });
});

router.patch("/profile", requireAuth, async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(160), phone: z.string().trim().max(40), bio: z.string().trim().max(1000).optional(), avatar: z.string().max(350000).refine((value) => value === "" || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value), "Choose a JPG, PNG or WebP photo."), currentPassword: z.string().max(256).optional() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  const existing = accounts().find((account) => account.id === req.auth!.id);
  if (!existing) return res.status(404).json({ error: "Account not found." });
  const email = parsed.data.email.toLowerCase();
  if (email !== existing.email && !await verifyPassword(parsed.data.currentPassword ?? "", existing.passwordHash)) return res.status(400).json({ error: "Enter your current password to change your email." });
  if (accounts().some((account) => account.id !== existing.id && account.email.toLowerCase() === email)) return res.status(409).json({ error: "That email is already in use." });
  const { currentPassword: _password, ...details } = parsed.data;
  const current = accounts().find(account => account.id === existing.id);
  if (!current || current.passwordHash !== existing.passwordHash || current.status !== existing.status) return res.status(409).json({ error: "Your account changed. Sign in again before updating your profile." });
  const updated = { ...current, ...details, email, updatedAt: new Date().toISOString() };
  const data = getStore();
  data.collections.accessUsers = accounts().map((account) => account.id === existing.id ? updated : account);
  data.collections.auditLog = [...(getCollection("auditLog") as Record<string, unknown>[]), { id: nextCollectionId("auditLog"), action: "profile.updated", actorId: existing.id, actorName: updated.name, occurredAt: updated.updatedAt, changedFields: ["name", "email", "phone", "avatar", "bio"].filter((key) => existing[key] !== updated[key as keyof typeof updated]) }];
  saveStore(data);
  res.json({ user: publicUser(updated) });
});

router.post("/password", requireAuth, async (req, res) => {
  const parsed = z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(12).max(256) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter your current password and a new password of at least 12 characters." });
  const key = `password:${req.auth!.id}`;
  if (blockedFor(key)) return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
  const existing = accounts().find((account) => account.id === req.auth!.id);
  if (!existing || !await verifyPassword(parsed.data.currentPassword, existing.passwordHash)) { recordFailure(key); return res.status(400).json({ error: "Your current password is incorrect." }); }
  clearFailures(key);
  const passwordHash = await hashPassword(parsed.data.newPassword);
  const current = accounts().find(account => account.id === existing.id);
  if (!current || current.passwordHash !== existing.passwordHash || current.status !== existing.status) return res.status(409).json({ error: "Your account changed. Sign in again before changing your password." });
  const data = getStore();
  data.collections.accessUsers = accounts().map((account) => account.id === existing.id ? { ...account, passwordHash, updatedAt: new Date().toISOString() } : account);
  data.collections.sessions = (getCollection("sessions") as Record<string, unknown>[]).filter((session) => session.accountId !== existing.id);
  data.collections.auditLog = [...(getCollection("auditLog") as Record<string, unknown>[]), { id: nextCollectionId("auditLog"), action: "profile.password-changed", actorId: existing.id, actorName: existing.name, occurredAt: new Date().toISOString() }];
  saveStore(data);
  clearSession(req, res);
  res.json({ ok: true });
});

export default router;
