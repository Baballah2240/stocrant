import { readFileSync } from "node:fs";
import { scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { join, resolve } from "node:path";

const scrypt = promisify(scryptCallback);
const password = process.env.STOCRANT_ADMIN_PASSWORD;
const email = (process.env.STOCRANT_ADMIN_EMAIL || "admin@stocrant.local").trim().toLowerCase();
const dataRoot = process.env.STOCRANT_DATA_DIR ? resolve(process.env.STOCRANT_DATA_DIR) : resolve("data", "..");
const store = JSON.parse(readFileSync(join(dataRoot, "data", "stocrant.json"), "utf8"));
const account = store.collections.accessUsers.find((candidate) => String(candidate.email).toLowerCase() === email);

if (!password || !account) process.exitCode = 1;
else {
  const [algorithm, salt, encoded] = String(account.passwordHash).split("$");
  const expected = Buffer.from(encoded || "", "base64url");
  const derived = algorithm === "scrypt" && salt ? await scrypt(password, salt, expected.length) : Buffer.alloc(0);
  const passwordHashVerified = expected.length === derived.length && timingSafeEqual(expected, derived);
  const oldSessions = store.collections.sessions.filter((session) => session.accountId === account.id).length;
  const plaintextPasswordFields = store.collections.accessUsers.filter((user) => Object.hasOwn(user, "password")).length;
  console.log(JSON.stringify({
    passwordHashVerified,
    email: account.email,
    roleId: account.roleId,
    status: account.status,
    oldSessions,
    plaintextPasswordFields,
  }, null, 2));
  if (!passwordHashVerified || account.roleId !== "role-main-manager" || account.status !== "active" || oldSessions !== 0 || plaintextPasswordFields !== 0) process.exitCode = 1;
}