/**
 * Company setup checklist and company licence expiry reminders.
 * The checklist reads existing settings and records; it never changes them.
 */
import type { AuthenticatedUser } from "./auth.js";
import { accountScopeActive, publicUser } from "./auth.js";
import { createNotification } from "./notifications.js";
import { can, isMainManager, isWithinScope } from "./permissions.js";
import { getCollection, getStore, nextCollectionId, saveStore, transaction } from "./storage.js";
type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
const DAY = 86_400_000;
const today = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: process.env.STOCRANT_TIME_ZONE || "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/** Licence status on a date: expired, expiring (inside its reminder window), valid, or no expiry date. */
export function licenseStatus(license: Row, date: string): { status: "expired" | "expiring" | "valid" | "no expiry"; daysLeft: number | null } {
  if (["cancelled"].includes(String(license.status))) return { status: "valid", daysLeft: null };
  const expiry = String(license.expiryDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return { status: "no expiry", daysLeft: null };
  const daysLeft = Math.round((Date.parse(expiry + "T00:00:00Z") - Date.parse(date + "T00:00:00Z")) / DAY), window = Number(license.reminderDays) > 0 ? Number(license.reminderDays) : 60;
  return { status: daysLeft < 0 ? "expired" : daysLeft <= window ? "expiring" : "valid", daysLeft };
}
/** Reminder stage, so each licence notifies at most once per stage: window (e.g. 60), 30, 7 days and expired. */
const stage = (daysLeft: number, window: number) => daysLeft < 0 ? "expired" : daysLeft <= 7 ? "7" : daysLeft <= 30 ? "30" : daysLeft <= window ? String(window) : "";

export function generateLicenseExpiryAlerts(now = new Date()) {
  return transaction(() => {
    let count = 0;
    const date = today(now), accounts = rows("accessUsers").filter(a => a.status === "active" && accountScopeActive(a));
    const events = rows("licenseExpiryEvents"), keys = new Set(events.map(e => e.key));
    for (const license of rows("companyLicenses")) {
      const { status, daysLeft } = licenseStatus(license, date);
      if (!["expired", "expiring"].includes(status) || daysLeft === null) continue;
      const step = stage(daysLeft, Number(license.reminderDays) > 0 ? Number(license.reminderDays) : 60);
      if (!step) continue;
      for (const account of accounts) {
        const user = publicUser(account as Parameters<typeof publicUser>[0]) as AuthenticatedUser;
        if (!(isMainManager(user) || can(user, "organizations", "edit")) || !isWithinScope(user, { organizationId: license.organizationId })) continue;
        const key = `${license.id}:${license.expiryDate}:${step}:${account.id}`;
        if (keys.has(key)) continue;
        const company = String(rows("companies").find(c => c.id === license.organizationId)?.name || "");
        createNotification(status === "expired"
          ? { userId: user.id, user: user.name, type: "license_expiry", severity: "critical", message: `A company licence has expired: ${license.licenseType} for ${company}.`, messageKey: "A company licence has expired: {type} for {company}.", messageValues: { type: String(license.licenseType), company }, target: null }
          : { userId: user.id, user: user.name, type: "license_expiry", severity: daysLeft <= 7 ? "warning" : "info", message: `A company licence expires in ${daysLeft} days: ${license.licenseType} for ${company}.`, messageKey: "A company licence expires in {days} days: {type} for {company}.", messageValues: { days: String(daysLeft), type: String(license.licenseType), company }, target: null });
        events.push({ id: nextCollectionId("licenseExpiryEvents"), key, licenseId: license.id, userId: user.id, createdAt: now.toISOString() }); keys.add(key); count++;
      }
    }
    if (count) { const data = getStore(); data.collections.licenseExpiryEvents = events; saveStore(data); }
    return count;
  });
}

export interface SetupItem { id: string; label: string; done: boolean; detail?: string; detailValues?: Record<string, string | number>; link: string; area: "company" | "finance" | "people" | "licences" }

/** What a company still needs before its reports, payroll and reminders are reliable. */
export function companySetup(user: AuthenticatedUser, companyId: string) {
  const company = rows("companies").find(c => c.id === companyId);
  if (!company || !isWithinScope(user, { ...company, organizationId: company.id })) throw Object.assign(new Error("Company not found."), { statusCode: 404 });
  const id = encodeURIComponent(companyId), edit = `/organization/companies/${id}?section=settings`, date = today();
  const has = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== "";
  const accounts = rows("financeAccounts").filter(a => a.organizationId === companyId);
  const otherCurrencies = accounts.some(a => a.currency !== company.currency);
  const employees = rows("employees").filter(e => e.organizationId === companyId && !["terminated", "inactive"].includes(String(e.status)));
  const licenses = rows("companyLicenses").filter(l => l.organizationId === companyId && l.status !== "cancelled");
  const expired = licenses.filter(l => licenseStatus(l, date).status === "expired").length, expiring = licenses.filter(l => licenseStatus(l, date).status === "expiring").length;
  const missingPayDetails = employees.filter(e => !(has(e.bankAccount) || has(e.mobileWalletNumber) || ["cash", "cheque"].includes(String(e.salaryPaymentMethod)))).length;
  const items: SetupItem[] = [
    { id: "contact", area: "company", label: "Contact person, phone and country", done: has(company.contactName) && has(company.contactPhone) && has(company.country), link: edit },
    { id: "type", area: "company", label: "Company type", done: has(company.organizationType) && company.organizationType !== "mixed" || has(company.industry) && company.industry !== "mixed", link: edit },
    { id: "currency", area: "finance", label: "Primary currency", done: has(company.currency), link: edit },
    { id: "fiscal", area: "finance", label: "Fiscal year start", done: has(company.fiscalYearStart), link: edit },
    { id: "terms", area: "finance", label: "Default payment terms", done: has(company.defaultPaymentTerms), link: edit },
    { id: "vat", area: "finance", label: "VAT rate and registration number", done: has(company.vatRate) && (Number(company.vatRate) === 0 || has(company.vatNumber)), detail: has(company.vatRate) && Number(company.vatRate) > 0 && !has(company.vatNumber) ? "Add the VAT registration number for the {rate}% rate." : "Set 0 if the company is not VAT registered.", detailValues: { rate: Number(company.vatRate || 0) }, link: edit },
    { id: "accounts", area: "finance", label: "Bank or cash account", done: accounts.length > 0, detail: "{count} accounts", detailValues: { count: accounts.length }, link: `/finance?tab=Banking&company=${id}` },
    ...(otherCurrencies ? [{ id: "fx", area: "finance" as const, label: "Exchange rate source for reports", done: has(company.exchangeRateSource), detail: "The company has accounts in more than one currency.", link: edit }] : []),
    { id: "employees", area: "people", label: "Employees", done: employees.length > 0, detail: "{count} active employees", detailValues: { count: employees.length }, link: `/organization/companies/${id}?section=employees` },
    { id: "payroll", area: "people", label: "Payroll rules confirmed", done: rows("payrollSettings").some(s => s.organizationId === companyId && s.configured), link: `/hr/payroll?company=${id}` },
    { id: "salaryBasis", area: "people", label: "Salary counting method", done: has(company.salaryCountingBasis), link: edit },
    { id: "eos", area: "people", label: "End-of-service rule", done: Number(company.gratuityDaysPerYear) > 0, detail: "Days of salary per year under your labour law or contracts.", link: edit },
    { id: "payDetails", area: "people", label: "Employee bank or mobile-wallet details", done: employees.length > 0 && missingPayDetails === 0, detail: employees.length ? "{count} employees without payment details" : "Add employees first.", detailValues: { count: missingPayDetails }, link: `/organization/companies/${id}?section=employees` },
    { id: "registration", area: "licences", label: "Commercial registration", done: licenses.some(l => l.licenseType === "commercial registration"), link: `/organization/companyLicenses/new?company=${id}` },
    { id: "licensesCurrent", area: "licences", label: "No expired licences", done: licenses.length > 0 && expired === 0, detail: expired ? "{count} expired" : expiring ? "{count} expiring soon" : "", detailValues: { count: expired || expiring }, link: `/organization/companyLicenses?company=${id}` },
  ];
  return { companyId, done: items.filter(i => i.done).length, total: items.length, items, licenses: licenses.map(l => ({ id: l.id, licenseType: l.licenseType, number: l.number, issuingAuthority: l.issuingAuthority, expiryDate: l.expiryDate || "", ...licenseStatus(l, date) })).sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9)) };
}
