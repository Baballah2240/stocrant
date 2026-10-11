/**
 * Local emergency Main Manager password reset.
 *
 * Usage (PowerShell):
 *   $env:STOCRANT_ADMIN_PASSWORD = "a-long-unique-password"
 *   npm run admin:reset
 *
 * This deliberately takes the password from the process environment instead
 * of a command-line argument, so it is not saved in npm history or log files.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const scrypt = promisify(scryptCallback);
const password = process.env.STOCRANT_ADMIN_PASSWORD;
const email = (process.env.STOCRANT_ADMIN_EMAIL || "admin@stocrant.local").trim().toLowerCase();
const dataRoot = process.env.STOCRANT_DATA_DIR ? resolve(process.env.STOCRANT_DATA_DIR) : resolve("data", "..");
const storePath = join(dataRoot, "data", "stocrant.json");

if (!password || password.length < 12) {
  throw new Error("Set STOCRANT_ADMIN_PASSWORD to a unique password of at least 12 characters before running this command.");
}
if (!existsSync(storePath)) throw new Error(`STOCRANT data store was not found at ${storePath}.`);

async function hashPassword(value) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(value, salt, 64);
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

async function hashMatches(value, stored) {
  const [algorithm, salt, encoded] = String(stored).split("$");
  if (algorithm !== "scrypt" || !salt || !encoded) return false;
  const expected = Buffer.from(encoded, "base64url");
  const derived = await scrypt(value, salt, expected.length);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

const raw = readFileSync(storePath, "utf8");
const data = JSON.parse(raw);
const users = data?.collections?.accessUsers;
if (!Array.isArray(users)) throw new Error("The store does not contain an accessUsers collection.");

const account = users.find((candidate) =>
  String(candidate?.email || "").toLowerCase() === email,
);
if (!account) throw new Error(`No account exists for ${email}.`);
if (account.roleId !== "role-main-manager") throw new Error(`${email} is not a Main Manager account.`);

const now = new Date().toISOString();
account.passwordHash = await hashPassword(password);
account.status = "active";
account.updatedAt = now;

// Password hashes are the only password representation the server uses. Clear
// accidental legacy plaintext fields without changing the corresponding hash.
let legacyPlaintextFieldsRemoved = 0;
for (const user of users) {
  if (Object.hasOwn(user, "password")) {
    delete user.password;
    legacyPlaintextFieldsRemoved += 1;
  }
}

const sessions = Array.isArray(data.collections.sessions) ? data.collections.sessions : [];
const sessionsRevoked = sessions.filter((session) => session?.accountId === account.id).length;
data.collections.sessions = sessions.filter((session) => session?.accountId !== account.id);

const auditLog = Array.isArray(data.collections.auditLog) ? data.collections.auditLog : [];
auditLog.push({
  id: `auditLog-${Date.now().toString(36)}-${auditLog.length + 1}`,
  action: "access.admin-password-reset",
  actorId: account.id,
  actorName: account.name,
  targetId: account.id,
  email: account.email,
  occurredAt: now,
  source: "local-admin-reset-cli",
});
data.collections.auditLog = auditLog;

// Write atomically: an interrupted reset never leaves a partial JSON store.
mkdirSync(dirname(storePath), { recursive: true });
const tmpPath = `${storePath}.tmp`;
writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
renameSync(tmpPath, storePath);

// Verify the new value against the exact hash that reached disk before
// reporting success. The secret itself is intentionally never printed.
const saved = JSON.parse(readFileSync(storePath, "utf8"));
const savedAccount = saved.collections.accessUsers.find((candidate) => candidate.id === account.id);
if (!savedAccount || !(await hashMatches(password, savedAccount.passwordHash))) {
  throw new Error("The password hash did not verify after writing the data store.");
}

console.log(JSON.stringify({
  ok: true,
  email: savedAccount.email,
  roleId: savedAccount.roleId,
  status: savedAccount.status,
  sessionsRevoked,
  legacyPlaintextFieldsRemoved,
}, null, 2));