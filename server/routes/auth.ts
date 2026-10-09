import { Router } from "express";
import { z } from "zod";
import { clearSession, createSession, hashPassword, matchesSetupKey, publicUser, requireAuth, setupKeyConfigured, verifyPassword } from "../auth.js";
import { createNotification } from "../notifications.js";
import { getCollection, getStore, nextCollectionId, saveStore } from "../storage.js";

const router = Router();
const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(160),
  password: z.string().min(12, "Use at least 12 characters").max(256),
});

type Account = Record<string, unknown> & { id: string; email: string; name: string; passwordHash: string; roleId: string; status: string };

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
  if (accounts().length > 0) return res.status(409).json({ error: "A Main Manager has already been configured." });
  const parsed = credentialsSchema.extend({ name: z.string().trim().min(2).max(120), setupKey: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  if (!matchesSetupKey(parsed.data.setupKey)) return res.status(403).json({ error: "The setup key is invalid." });
  const account: Account = {
    id: nextCollectionId("accessUsers"),
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    passwordHash: await hashPassword(parsed.data.password),
    roleId: "role-main-manager",
    status: "active",
    dataClassification: "company",
    createdAt: new Date().toISOString(),
  };
  const data = getStore();
  data.collections.accessUsers = [account];
  data.collections.auditLog = [
    ...(data.collections.auditLog as Record<string, unknown>[]),
    { id: nextCollectionId("auditLog"), action: "access.main-manager-created", actorId: account.id, actorName: account.name, occurredAt: new Date().toISOString() },
  ];
  saveStore(data);
  createSession(res, account);
  res.status(201).json({ user: publicUser(account) });
});

function accountByEmail(email: string): Account | undefined {
  return accounts().find((candidate) => candidate.email.toLowerCase() === email.toLowerCase());
}

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
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  const account = accountByEmail(parsed.data.email);
  if (!account || account.status !== "active" || !(await verifyPassword(parsed.data.password, account.passwordHash))) {
    recordDeniedLoginAttempt(parsed.data.email);
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  createSession(res, account);
  res.json({ user: publicUser(account) });
});

router.post("/logout", (req, res) => {
  clearSession(req, res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.auth });
});

export default router;