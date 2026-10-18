import type { StoreData } from "./storage.js";

export const EMPLOYEE_DOCUMENT_TYPES = ["passport", "national-id", "residence-permit", "employment-contract", "work-permit", "driving-license", "education-certificate", "training-certificate", "medical-insurance", "warning-letter", "leave-document", "other"] as const;
export const COMPANY_DOCUMENT_TYPES = ["policy", "procedure", "form", "license", "template", "manual", "official-letter", "other"] as const;
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function businessToday(now = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.STOCRANT_TIME_ZONE || "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function documentExpiry(row: Record<string, unknown>, today = businessToday()) {
  if (row.lifecycle === "archived") return "archived";
  if (!row.expiresOn) return "no-expiry";
  if (!validDate(row.expiresOn) || !validDate(today)) return "unknown";
  const remaining = (Date.parse(row.expiresOn + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000;
  return remaining < 0 ? "expired" : remaining <= Number(row.warningDays || 30) ? "expiring" : "active";
}

/** Resolve only unambiguous legacy employee links; retain all original fields. */
export function migrateDocuments(data: StoreData): boolean {
  let changed = false;
  for (const collection of ["documents", "documentFiles", "documentExpiryEvents"]) {
    if (data.collections[collection] !== undefined && !Array.isArray(data.collections[collection])) throw new Error("Invalid HR document collection. Existing data must be repaired from a verified backup.");
    if (data.collections[collection] === undefined) { data.collections[collection] = []; changed = true; }
  }
  const employees = (data.collections.employees ?? []) as Record<string, unknown>[];
  for (const document of data.collections.documents as Record<string, unknown>[]) {
    if (document.version === undefined) { document.version = 1; changed = true; }
    if (document.documentSchemaVersion === 1) continue;
    const matches = employees.filter(employee => (document.employeeId ? employee.id === document.employeeId : String(employee.name ?? "").toLowerCase() === String(document.employee ?? "").toLowerCase()) && (!document.organizationId || (employee.organizationId ?? employee.companyId) === document.organizationId));
    if (matches.length === 1) {
      document.employeeId = matches[0].id;
      if (!document.organizationId) document.organizationId = matches[0].organizationId ?? matches[0].companyId;
    }
    const shared = document.type === "policy" && /^(all|all employees|everyone|company|company-wide)?$/i.test(String(document.employee ?? ""));
    document.category ??= shared ? "company" : "employee";
    document.visibility ??= shared ? "company" : "hr";
    document.lifecycle ??= "active";
    document.warningDays ??= 30;
    document.tags ??= [];
    document.documentSchemaVersion = 1;
    changed = true;
  }
  return changed;
}
