import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import { getCollection, getStore, saveStore } from "./storage.js";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "stocrant_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const sessionSecret = process.env.STOCRANT_SESSION_SECRET || randomBytes(32).toString("hex");

export interface AuthenticatedUser {
  accountStatus?: string;
  id: string;
  email: string;
  name: string;
  roleId: string;
  employeeId?: string;
  organizationIds: string[];
  locationIds: string[];
  ownRecordsOnly: boolean;
  permissions: string[];
  phone?: string;
  avatar?: string;
  position?: string;
  description?: string;
  bio?: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
    }
  }
}

type AccountRow = Record<string, unknown> & {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  roleId: string;
  status: string;
};

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return header.split(";").reduce<Record<string, string>>((result, entry) => {
    const separator = entry.indexOf("=");
    if (separator > 0) {
      try { result[entry.slice(0, separator).trim()] = decodeURIComponent(entry.slice(separator + 1).trim()); }
      catch { /* Malformed cookies are ignored rather than crashing authentication. */ }
    }
    return result;
  }, {});
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function hashToken(token: string) {
  return createHmac("sha256", sessionSecret).update(`session:${token}`).digest("hex");
}

function sessionTokenFromRequest(req: Request): string | undefined {
  const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  return bearer || parseCookies(req.headers.cookie)[SESSION_COOKIE];
}

function verifiedSessionToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const [token, signature] = value.split(".");
  if (!token || !signature) return undefined;
  const expected = Buffer.from(sign(token));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return undefined;
  return token;
}

function cookie(value: string, maxAge: number) {
  const flags = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAge / 1000)}`,
  ];
  if (process.env.NODE_ENV === "production") flags.push("Secure");
  return flags.join("; ");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, encoded] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !encoded) return false;
  const expected = Buffer.from(encoded, "base64url");
  const derived = await scrypt(password, salt, expected.length) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export function publicUser(account: AccountRow): AuthenticatedUser {
  const role = (getCollection("accessRoles") as Array<Record<string, unknown>>).find((candidate) => candidate.id === account.roleId);
  const employee = (getCollection("employees") as Record<string, unknown>[]).find((employee) => employee.id === account.employeeId || String(employee.email ?? "").toLowerCase() === account.email.toLowerCase());
  return {
    accountStatus: account.status,
    id: account.id,
    email: account.email,
    name: account.name,
    phone: typeof account.phone === "string" ? account.phone : "",
    avatar: typeof account.avatar === "string" ? account.avatar : "",
    position: String(employee?.jobTitle || role?.name || "Employee"),
    description: String(role?.description || ""),
    bio: typeof account.bio === "string" ? account.bio : "",
    roleId: account.roleId,
    employeeId: typeof account.employeeId === "string" ? account.employeeId : undefined,
    organizationIds: Array.isArray(account.organizationIds) ? account.organizationIds.filter((id): id is string => typeof id === "string") : [],
    locationIds: Array.isArray(account.locationIds) ? account.locationIds.filter((id): id is string => typeof id === "string") : [],
    ownRecordsOnly: account.ownRecordsOnly === true,
    permissions: account.status !== "active" ? [] : account.roleId === "role-main-manager" ? ["*"] : (Array.isArray(account.permissions) ? account.permissions : Array.isArray(role?.permissions) ? role.permissions : []).filter((permission): permission is string => typeof permission === "string" && !["*", "access.*", "audit.*"].includes(permission) && !permission.startsWith("access.") && !permission.startsWith("audit.")),
  };
}

function accountRows() {
  return getCollection("accessUsers") as AccountRow[];
}

function sessionRows() {
  return getCollection("sessions") as Array<Record<string, unknown>>;
}

function activeAccountById(id: string) {
  return accountRows().find((account) => account.id === id && ["active", "pending", "rejected"].includes(account.status));
}

export function authenticatedUser(req: Request): AuthenticatedUser | undefined {
  const token = verifiedSessionToken(sessionTokenFromRequest(req));
  if (!token) return undefined;
  const session = sessionRows().find(
    (row) => row.tokenHash === hashToken(token) && typeof row.expiresAt === "string" && Date.parse(row.expiresAt) > Date.now(),
  );
  if (!session || typeof session.accountId !== "string") return undefined;
  const account = activeAccountById(session.accountId);
  return account ? publicUser(account) : undefined;
}

export function attachAuth(req: Request, _res: Response, next: NextFunction) {
  req.auth = authenticatedUser(req);
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: "Sign in is required." });
  next();
}

export function createSession(res: Response, account: AccountRow): string {
  const token = randomBytes(32).toString("base64url");
  const data = getStore();
  const signedInAt = new Date().toISOString();
  // Keep active sessions for the same account on other devices. The web
  // management dashboard and a phone can therefore work simultaneously.
  const sessions = sessionRows().filter((row) => typeof row.expiresAt === "string" && Date.parse(row.expiresAt) > Date.now());
  sessions.push({
    id: `session-${randomBytes(10).toString("hex")}`,
    accountId: account.id,
    tokenHash: hashToken(token),
    createdAt: signedInAt,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  // The personal dashboard uses these timestamps to show the latest sign-in
  // and highlight policy documents published since the prior sign-in.
  data.collections.accessUsers = accountRows().map((storedAccount) => storedAccount.id === account.id
    ? { ...storedAccount, previousLoginAt: storedAccount.lastLoginAt, lastLoginAt: signedInAt }
    : storedAccount);
  data.collections.sessions = sessions;
  saveStore(data);
  const signed = `${token}.${sign(token)}`;
  res.setHeader("Set-Cookie", cookie(signed, SESSION_TTL_MS));
  return signed;
}

export function clearSession(req: Request, res: Response) {
  const token = verifiedSessionToken(sessionTokenFromRequest(req));
  if (token) {
    const data = getStore();
    data.collections.sessions = sessionRows().filter((row) => row.tokenHash !== hashToken(token));
    saveStore(data);
  }
  res.setHeader("Set-Cookie", cookie("", 0));
}

export function setupKeyConfigured() {
  return Boolean(process.env.STOCRANT_SETUP_KEY || process.env.NODE_ENV !== "production");
}

export function matchesSetupKey(value: string) {
  const required = process.env.STOCRANT_SETUP_KEY || (process.env.NODE_ENV !== "production" ? "local-setup" : "");
  const expected = Buffer.from(required);
  const received = Buffer.from(value);
  return expected.length > 0 && expected.length === received.length && timingSafeEqual(expected, received);
}

export function productionConfigurationError() {
  if (process.env.NODE_ENV !== "production") return undefined;
  if (!process.env.STOCRANT_SESSION_SECRET) return "STOCRANT_SESSION_SECRET must be set in production.";
  if (process.env.STOCRANT_SESSION_SECRET.length < 32 || /replace-with|example|changeme/i.test(process.env.STOCRANT_SESSION_SECRET)) return "STOCRANT_SESSION_SECRET must be a private random secret of at least 32 characters.";
  if (!process.env.STOCRANT_SETUP_KEY && accountRows().length === 0) return "STOCRANT_SETUP_KEY must be set before the first production account is created.";
  if (accountRows().length === 0 && (process.env.STOCRANT_SETUP_KEY!.length < 16 || /replace-with|example|changeme/i.test(process.env.STOCRANT_SETUP_KEY!))) return "STOCRANT_SETUP_KEY must be a private setup key of at least 16 characters.";
  return undefined;
}

/**
 * Pre-computed hash verified when an email has no account, so unknown-email
 * and wrong-password responses take the same time (prevents user enumeration
 * via response timing).
 */
let timingPadHash: Promise<string> | undefined;
export function loginTimingPad(): Promise<string> {
  timingPadHash ??= hashPassword(randomBytes(32).toString("base64url"));
  return timingPadHash;
}
