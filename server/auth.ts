import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import { getCollection, getStore, saveStore } from "./storage.js";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "stocrant_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const sessionSecret = process.env.STOCRANT_SESSION_SECRET || randomBytes(32).toString("hex");

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  employeeId?: string;
  organizationIds: string[];
  locationIds: string[];
  ownRecordsOnly: boolean;
  permissions: string[];
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
    if (separator > 0) result[entry.slice(0, separator).trim()] = decodeURIComponent(entry.slice(separator + 1).trim());
    return result;
  }, {});
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function hashToken(token: string) {
  return createHmac("sha256", sessionSecret).update(`session:${token}`).digest("hex");
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
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    roleId: account.roleId,
    employeeId: typeof account.employeeId === "string" ? account.employeeId : undefined,
    organizationIds: Array.isArray(account.organizationIds) ? account.organizationIds.filter((id): id is string => typeof id === "string") : [],
    locationIds: Array.isArray(account.locationIds) ? account.locationIds.filter((id): id is string => typeof id === "string") : [],
    ownRecordsOnly: account.ownRecordsOnly === true,
    permissions: Array.isArray(role?.permissions) ? role.permissions.filter((permission): permission is string => typeof permission === "string") : [],
  };
}

function accountRows() {
  return getCollection("accessUsers") as AccountRow[];
}

function sessionRows() {
  return getCollection("sessions") as Array<Record<string, unknown>>;
}

function activeAccountById(id: string) {
  return accountRows().find((account) => account.id === id && account.status === "active");
}

export function authenticatedUser(req: Request): AuthenticatedUser | undefined {
  const signed = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!signed) return undefined;
  const [token, signature] = signed.split(".");
  if (!token || !signature) return undefined;
  const expected = Buffer.from(sign(token));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return undefined;
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

export function createSession(res: Response, account: AccountRow) {
  const token = randomBytes(32).toString("base64url");
  const data = getStore();
  const sessions = sessionRows().filter(
    (row) => row.accountId !== account.id && typeof row.expiresAt === "string" && Date.parse(row.expiresAt) > Date.now(),
  );
  sessions.push({
    id: `session-${randomBytes(10).toString("hex")}`,
    accountId: account.id,
    tokenHash: hashToken(token),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  data.collections.sessions = sessions;
  saveStore(data);
  res.setHeader("Set-Cookie", cookie(`${token}.${sign(token)}`, SESSION_TTL_MS));
}

export function clearSession(req: Request, res: Response) {
  const signed = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (signed) {
    const token = signed.split(".")[0];
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
  if (!process.env.STOCRANT_SETUP_KEY && accountRows().length === 0) return "STOCRANT_SETUP_KEY must be set before the first production account is created.";
  return undefined;
}