import { randomBytes } from "node:crypto";
import type { StoreData } from "./storage.js";

type Row = Record<string, unknown>;
const normalized = (value: unknown) => String(value || "").trim().toLowerCase();
export const validUsername = (value: string) => /^[a-z][a-z0-9._-]{2,39}$/.test(value);
export function generateEmployeeCode(employees: Row[], year = new Date().getUTCFullYear(), entropy = () => randomBytes(4).toString("hex").toUpperCase()) {
  const used = new Set(employees.map(row => normalized(row.employeeCode)));
  for (let attempt = 0; attempt < 128; attempt++) {
    const code = `EMP-${year}-${entropy()}`;
    if (!used.has(normalized(code))) return code;
  }
  throw new Error("Could not allocate an Employee ID. Please try again.");
}
export function generateUsername(accounts: Row[], name: unknown, fallback: unknown = "employee") {
  const slug = (value: unknown) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
  let base = (slug(name) || slug(fallback) || "employee").slice(0, 28).replace(/\.+$/g, "");
  if (!/^[a-z]/.test(base)) base = `emp.${base}`;
  if (base.length < 3) base = `emp.${base}`;
  if (["admin", "root", "mainadmin", "system"].includes(base)) base = `emp.${base}`;
  const used = new Set(accounts.map(row => normalized(row.username)));
  for (let attempt = 0; attempt < 128; attempt++) {
    const username = attempt ? `${base}.${randomBytes(3).toString("hex")}` : base;
    if (!used.has(username)) return username;
  }
  throw new Error("Could not allocate a username. Please try again.");
}

/** Additive, backed-up on load: emails/passwords/IDs and existing usernames remain unchanged. */
export function migrateEmployeeIdentities(data: StoreData) {
  let changed = false;
  const accounts = (data.collections.accessUsers || []) as Row[];
  if (!Array.isArray(accounts)) throw new Error("Invalid account collection.");
  for (const account of accounts) if (!account.username) {
    const employee = (data.collections.employees || []).find(raw => (raw as Row).id === account.employeeId) as Row | undefined;
    account.username = generateUsername(accounts, account.name, employee?.employeeCode);
    changed = true;
  }
  assertEmployeeIdentities(data);
  return changed;
}

/** JSON-store equivalent of unique indexes, enforced before every atomic disk commit. */
export function assertEmployeeIdentities(data: StoreData) {
  const codes = new Set<string>(), usernames = new Set<string>();
  for (const raw of data.collections.employees || []) {
    const row = raw as Row;
    if (!normalized(row.employeeCode)) continue;
    // Historical custom IDs were company-scoped; generated IDs check all companies.
    const key = `${row.organizationId || row.companyId || ""}\0${normalized(row.employeeCode)}`;
    if (codes.has(key)) throw Object.assign(new Error("This Employee ID already exists in the company."), { statusCode: 409 });
    codes.add(key);
  }
  for (const raw of data.collections.accessUsers || []) {
    const row = raw as Row;
    if (!row.username) continue;
    const key = normalized(row.username);
    if (!validUsername(key) || usernames.has(key)) throw Object.assign(new Error("Choose a unique username using 3–40 letters, numbers, dots, hyphens or underscores, starting with a letter."), { statusCode: 409 });
    usernames.add(key);
  }
}
