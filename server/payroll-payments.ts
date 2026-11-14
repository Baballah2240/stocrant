import type { AuthenticatedUser } from "./auth.js";
import { salaryApprovalAuthorized } from "./salary-approval.js";
import { can, isWithinScope, ownRecordsRequired } from "./permissions.js";
import { getCollection, getStore, nextCollectionId, saveStore, transaction } from "./storage.js";
import { appendFinancialHistory, cashAmount, companyFinanceDate, financialError, payrollEntryPayments, runPaymentState } from "./finance-ledger.js";
import { money, precision, scaled } from "./payroll-model.js";

type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
export interface PayrollPaymentInput { version: number; reason: string; accountId?: string; paymentDate?: string; reference?: string; method?: string; confirmed?: boolean; amount?: string | number; entryId?: string; idempotencyKey?: string; }
/** One atomic cash posting, with immutable allocations to individual payslips. */
export function recordPayrollPayment(user: AuthenticatedUser, id: string, input: PayrollPaymentInput) {
  return transaction(() => {
    if (!can(user, "payroll", "pay") || !can(user, "finance", "view") || !can(user, "finance", "create") || ownRecordsRequired(user)) financialError("Payroll pay and Finance view/create permission is required.", 403);
    const run = rows("payrollRuns").find(r => r.id === id);
    const entries = rows("payrollEntries").filter(e => e.runId === id).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (!run || !entries.length || !entries.every(e => isWithinScope(user, e)) || !isWithinScope(user, { id: run.organizationId, organizationId: run.organizationId })) financialError("Payroll run not found.", 404);
    if(!salaryApprovalAuthorized(run))financialError("Salary payment requires approval from the assigned company General Manager or Super Admin.",403);
    const fingerprint = JSON.stringify({ runId: id, accountId: input.accountId, date: input.paymentDate, reference: input.reference, method: input.method, amount: input.amount === undefined ? "remaining" : String(input.amount), entryId: input.entryId || "", reason: input.reason, confirmed: input.confirmed });
    const replay = input.idempotencyKey && rows("financeTransactions").find(t => t.idempotencyKey === input.idempotencyKey && t.createdBy === user.id);
    if (replay) {
      if (replay.paymentFingerprint !== fingerprint) financialError("This payment key was used with different details.", 409);
      return { run: { ...run, ...runPaymentState(run) } as Row, transaction: replay, replayed: true };
    }
    if (!["Approved", "Partially Paid"].includes(run.status) || run.version !== input.version) financialError("Only the current approved payroll balance can be paid.", 409);
    if (rows("approvalRules").some(r => r.section === "finance" && r.action === "create" && r.active) && !can(user, "finance", "approve")) financialError("Finance approval permission is required before posting this payment.", 403);
    if (!input.confirmed || !input.paymentDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate) || Number.isNaN(Date.parse(input.paymentDate)) || new Date(input.paymentDate).toISOString().slice(0, 10) !== input.paymentDate || !input.reference?.trim() || !["cash", "bank", "cheque", "other"].includes(input.method || "")) financialError("Confirm payment and enter a valid date, reference and method.");
    if (input.paymentDate > companyFinanceDate(String(run.organizationId))) financialError("A confirmed payment cannot be in the future.");
    const account = rows("financeAccounts").find(a => a.id === input.accountId && a.organizationId === run.organizationId && a.currency === run.currency && isWithinScope(user, a));
    if (!account) financialError("Choose an accessible company account in the payroll currency.");
    if (rows("financeTransactions").some(t => t.organizationId === run.organizationId && String(t.reference).trim().toLowerCase() === input.reference!.trim().toLowerCase())) financialError("This company payment reference is already recorded.", 409);
    const digits = precision(run.currency), candidates = entries.filter(e => !input.entryId || e.id === input.entryId);
    if (!candidates.length) financialError("Choose a payslip in this payroll run.");
    const balances = candidates.map(e => ({ entry: e, remaining: scaled(payrollEntryPayments(e).outstanding, digits) }));
    if (entries.some(e => scaled(e.netPay, digits) < 0n)) financialError("Negative payslips require an authorized later-period adjustment.");
    const outstanding = balances.reduce((n, b) => n + b.remaining, 0n);
    const amount = input.amount === undefined ? money(outstanding, digits) : cashAmount(input.amount, run.currency, true);
    let remaining = scaled(amount, digits);
    if (remaining <= 0n || remaining > outstanding) financialError("The payment exceeds the selected outstanding balance.", 409);
    const allocations: Row[] = [];
    for (const b of balances) {
      const value = remaining < b.remaining ? remaining : b.remaining;
      if (value > 0n) allocations.push({ entryId: b.entry.id, employeeId: b.entry.employeeId, amount: money(value, digits) });
      remaining -= value;
    }
    const at = new Date().toISOString();
    const item = { ledgerVersion:1, id: nextCollectionId("financeTransactions"), organizationId: run.organizationId, ...(candidates.length === 1 ? { employeeId: candidates[0].employeeId, locationId: candidates[0].locationId } : {}), accountId: account.id,
      type: "payroll", category: "salary", sourceModule: "payroll", sourceId: run.id, payrollRunId: run.id, allocations, direction: "out", amount, currency: run.currency, date: input.paymentDate, paymentDate: input.paymentDate, status: "paid", method: input.method, reference: input.reference.trim(), description: input.reason,
      createdBy: user.id, approvedBy: run.approvedBy, createdAt: at, idempotencyKey: input.idempotencyKey, paymentFingerprint: fingerprint };
    const data = getStore(); data.collections.financeTransactions = [...rows("financeTransactions"), item]; saveStore(data);
    Object.assign(run, runPaymentState(run), { version: run.version + 1, updatedAt: at, payment: { date: item.date, method: item.method, reference: item.reference, accountId: account.id, transactionId: item.id, paidBy: user.id, paidByName: user.name, confirmedAt: at } });
    saveStore(data); appendFinancialHistory(user, "payroll.payment", item, input.reason);
    return { run, transaction: item, replayed: false };
  });
}
