/**
 * Return a local STOCRANT workspace to its first-time Main Manager setup state
 * without deleting business records.
 *
 * This removes all authentication accounts and their sessions. It deliberately
 * does not create a backup, because a backup would retain the credential data
 * the operator explicitly asked to remove.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const dataRoot = process.env.STOCRANT_DATA_DIR ? resolve(process.env.STOCRANT_DATA_DIR) : resolve("data", "..");
const storePath = join(dataRoot, "data", "stocrant.json");

if (!existsSync(storePath)) throw new Error(`STOCRANT data store was not found at ${storePath}.`);

const data = JSON.parse(readFileSync(storePath, "utf8"));
if (!data.collections || typeof data.collections !== "object") throw new Error("The store does not contain workspace collections.");

const accessUsers = Array.isArray(data.collections.accessUsers) ? data.collections.accessUsers : [];
const sessions = Array.isArray(data.collections.sessions) ? data.collections.sessions : [];
const now = new Date().toISOString();

// Emptying this collection is what makes GET /api/auth/status return
// setupRequired: true, allowing the next person at the app to choose their own
// name, email and password for the Main Manager account.
data.collections.accessUsers = [];
data.collections.sessions = [];

const auditLog = Array.isArray(data.collections.auditLog) ? data.collections.auditLog : [];
auditLog.push({
  id: `auditLog-${Date.now().toString(36)}-${auditLog.length + 1}`,
  action: "access.accounts-cleared-for-first-time-setup",
  actorId: null,
  actorName: "System",
  occurredAt: now,
  source: "local-first-time-setup-reset",
});
data.collections.auditLog = auditLog;

// Atomic replace prevents a partial write from corrupting business records.
const temporaryStorePath = `${storePath}.tmp`;
writeFileSync(temporaryStorePath, JSON.stringify(data, null, 2), "utf8");
renameSync(temporaryStorePath, storePath);

const saved = JSON.parse(readFileSync(storePath, "utf8"));
const savedUsers = Array.isArray(saved.collections?.accessUsers) ? saved.collections.accessUsers : null;
const savedSessions = Array.isArray(saved.collections?.sessions) ? saved.collections.sessions : null;
if (!savedUsers || !savedSessions || savedUsers.length !== 0 || savedSessions.length !== 0) {
  throw new Error("The first-time setup reset could not be verified.");
}

console.log(JSON.stringify({
  ok: true,
  setupRequired: true,
  accountsRemoved: accessUsers.length,
  sessionsRemoved: sessions.length,
  businessRecordsPreserved: true,
}, null, 2));