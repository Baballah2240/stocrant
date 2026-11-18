/**
 * Double-entry general ledger derived from Stocrant's operational records. Nothing here is stored:
 * documents, cash movements, payroll and fixed assets are translated into balanced journal entries
 * on demand, so every report (trial balance, balance sheet, income statement) agrees by construction.
 * Pure module: no storage access, so it can be unit tested and reused by reports.
 */
type Row = { [key: string]: any };
export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export interface LedgerAccount { code: string; name: string; type: AccountType }
export interface JournalLine { account: string; debit: bigint; credit: bigint }
export interface JournalEntry { id: string; date: string; organizationId: string; currency: string; memo: string; source: string; sourceId: string; lines: JournalLine[] }

export const chartOfAccounts: LedgerAccount[] = [
  { code: "1000", name: "Cash & bank", type: "asset" },
  { code: "1090", name: "Transfers in transit", type: "asset" },
  { code: "1100", name: "Accounts receivable", type: "asset" },
  { code: "1200", name: "Employee advances & custody", type: "asset" },
  { code: "1500", name: "Fixed assets at cost", type: "asset" },
  { code: "1590", name: "Accumulated depreciation", type: "asset" },
  { code: "1600", name: "Fixed asset purchases clearing", type: "asset" },
  { code: "2000", name: "Accounts payable", type: "liability" },
  { code: "2100", name: "Salaries payable", type: "liability" },
  { code: "2200", name: "Loans payable", type: "liability" },
  { code: "3000", name: "Paid-in capital", type: "equity" },
  { code: "3100", name: "Opening balance equity", type: "equity" },
  { code: "4000", name: "Sales revenue", type: "revenue" },
  { code: "4100", name: "Sales returns & refunds", type: "revenue" },
  { code: "4900", name: "Other income", type: "revenue" },
  { code: "5000", name: "Purchases", type: "expense" },
  { code: "6000", name: "Operating expenses", type: "expense" },
  { code: "6100", name: "Taxes", type: "expense" },
  { code: "6200", name: "Salaries & wages", type: "expense" },
  { code: "6500", name: "Depreciation expense", type: "expense" },
  { code: "6900", name: "Other expenses", type: "expense" },
];
const accountType = new Map(chartOfAccounts.map(a => [a.code, a.type]));
export const ACCRUAL_STATES: Record<string, string[]> = { sales: ["completed"], expenses: ["approved", "reimbursed"], purchases: ["ordered", "received", "partial"], returns: ["approved", "refunded"] };
const PAID_RUNS = ["Approved", "Partially Paid", "Paid"];
const digitsFor = (currency: string) => ["KWD", "BHD", "OMR"].includes(currency) ? 3 : ["JPY", "KRW"].includes(currency) ? 0 : 2;
/** Exact decimal → minor units; invalid or missing values return null so they can be reported instead of guessed. */
export function minorUnits(value: unknown, currency: string): bigint | null {
  const text = String(value ?? "").trim(), digits = digitsFor(currency);
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  if (fraction.length > digits && /[1-9]/.test(fraction.slice(digits))) return null;
  const units = BigInt(whole) * 10n ** BigInt(digits) + BigInt((fraction + "0".repeat(digits)).slice(0, digits) || "0");
  return text.startsWith("-") ? -units : units;
}
export const formatUnits = (value: bigint, currency: string) => { const digits = digitsFor(currency), negative = value < 0n, abs = negative ? -value : value, scale = 10n ** BigInt(digits), whole = abs / scale, fraction = abs % scale; return (negative ? "-" : "") + whole.toString() + (digits ? "." + fraction.toString().padStart(digits, "0") : ""); };
const sourceAmountKey = (collection: string) => collection === "expenses" ? "amount" : collection === "returns" ? "refund" : "total";
const monthEnds = (from: string, to: string) => { const out: string[] = []; let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7)); for (;;) { const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); if (end > to) { if (out.at(-1) !== to) out.push(to); break; } out.push(end); m++; if (m > 12) { m = 1; y++; } } return out; };
function depreciationTo(asset: Row, currency: string, date: string): bigint {
  const cost = minorUnits(asset.cost ?? 0, currency) ?? 0n, salvage = minorUnits(asset.salvageValue ?? 0, currency) ?? 0n, years = Number(asset.usefulLifeYears);
  const start = Date.parse(String(asset.purchaseDate) + "T00:00:00Z"), end = Date.parse(date + "T00:00:00Z");
  if (!(years > 0) || !Number.isFinite(start) || !Number.isFinite(end) || end < start || cost <= salvage) return 0n;
  const life = BigInt(Math.round(years * 365)), days = BigInt(Math.floor((end - start) / 86_400_000) + 1);
  return days >= life ? cost - salvage : (cost - salvage) * days / life;
}

export interface LedgerInput { companies: Row[]; accounts: Row[]; transactions: Row[]; sources: Record<string, Row[]>; payrollEntries: Row[]; payrollRuns: Row[]; fixedAssets: Row[]; asOf: string }

/** Build balanced journal entries. Records that cannot be posted exactly are returned as issues, never guessed. */
export function buildJournal(input: LedgerInput) {
  const entries: JournalEntry[] = [], issues: { id: string; reason: string }[] = [];
  const companyCurrency = (id: unknown) => String(input.companies.find(c => c.id === id)?.currency || "");
  const accountsById = new Map(input.accounts.map(a => [a.id, a]));
  const post = (entry: Omit<JournalEntry, "lines">, pairs: [string, string, bigint][]) => {
    const lines: JournalLine[] = [];
    for (const [debit, credit, amount] of pairs) {
      if (amount === 0n) continue;
      const value = amount < 0n ? -amount : amount, [dr, cr] = amount < 0n ? [credit, debit] : [debit, credit];
      lines.push({ account: dr, debit: value, credit: 0n }, { account: cr, debit: 0n, credit: value });
    }
    if (lines.length && entry.date && entry.date <= input.asOf) entries.push({ ...entry, lines });
  };
  // Opening balances of cash and bank accounts.
  for (const account of input.accounts) {
    const currency = String(account.currency), opening = minorUnits(account.openingBalance ?? 0, currency);
    if (opening === null) { issues.push({ id: String(account.id), reason: "Invalid opening balance" }); continue; }
    const first = input.transactions.filter(t => t.accountId === account.id).map(t => String(t.date || "")).filter(Boolean).sort()[0] || String(account.createdAt || "").slice(0, 10) || input.asOf;
    post({ id: `open:${account.id}`, date: first, organizationId: String(account.organizationId || ""), currency, memo: `Opening balance · ${account.name}`, source: "financeAccounts", sourceId: String(account.id) }, [["1000", "3100", opening]]);
  }
  // Accrual: approved documents create receivables and payables when issued.
  for (const [collection, rows] of Object.entries(input.sources)) for (const doc of rows) {
    if (!ACCRUAL_STATES[collection]?.includes(String(doc.status))) continue;
    if (collection === "expenses" && doc.category === "salaries") continue; // Salaries post from approved payroll instead.
    const currency = String(doc.currency || companyCurrency(doc.organizationId)), amount = minorUnits(doc[sourceAmountKey(collection)], currency);
    if (!currency || amount === null) { issues.push({ id: String(doc.id), reason: `Unverified ${collection} amount or currency` }); continue; }
    const meta = { id: `${collection}:${doc.id}`, date: String(doc.date || "").slice(0, 10), organizationId: String(doc.organizationId || ""), currency, source: collection, sourceId: String(doc.id) };
    if (collection === "sales") post({ ...meta, memo: `Sale ${doc.invoiceNo || doc.id}${doc.customer ? " · " + doc.customer : ""}` }, [["1100", "4000", amount]]);
    else if (collection === "purchases") post({ ...meta, memo: `Purchase ${doc.poNumber || doc.id}${doc.supplier ? " · " + doc.supplier : ""}` }, [["5000", "2000", amount]]);
    else if (collection === "expenses") post({ ...meta, memo: `Expense ${doc.title || doc.id}` }, [["6000", "2000", amount]]);
    else post({ ...meta, memo: `Return ${doc.rmaNumber || doc.id}` }, [["4100", "2000", amount]]);
  }
  // Payroll: approved payslips are an expense owed to employees until paid.
  for (const line of input.payrollEntries) {
    const run = input.payrollRuns.find(r => r.id === line.runId);
    if (!run || !PAID_RUNS.includes(String(run.status))) continue;
    const currency = String(line.currency), amount = minorUnits(line.netPay, currency);
    if (amount === null) { issues.push({ id: String(line.id), reason: "Invalid payslip amount" }); continue; }
    post({ id: `payroll:${line.id}`, date: String(line.periodEnd || run.end || "").slice(0, 10), organizationId: String(line.organizationId || run.organizationId || ""), currency, memo: `Salary · ${line.employee || line.employeeId}`, source: "payrollEntries", sourceId: String(line.id) }, [["6200", "2100", amount]]);
  }
  // Cash movements.
  for (const t of input.transactions) {
    if (t.status !== "paid") continue;
    const account = accountsById.get(t.accountId), currency = String(t.currency || account?.currency || "");
    const amount = minorUnits(t.amount, currency);
    if (!account || amount === null || !["in", "out"].includes(t.direction)) { issues.push({ id: String(t.id), reason: "Movement cannot be posted (account, amount or direction)" }); continue; }
    const signedIn = t.direction === "in" ? amount : -amount; // Positive = money into the bank account.
    let other = "6900";
    if (t.sourceCollection && ACCRUAL_STATES[t.sourceCollection]) other = t.sourceCollection === "sales" ? "1100" : "2000";
    else if (t.type === "transfer") other = "1090";
    else if (t.type === "payroll") other = "2100";
    else if (t.type === "income") other = "4000";
    else if (t.type === "expense" || t.type === "reimbursement") other = "6000";
    else if (t.type === "tax") other = "6100";
    else if (t.type === "capital") other = "3000";
    else if (t.type === "asset") other = "1600";
    else if (t.employeeId && ["advance", "loan", "repayment"].includes(t.type)) other = "1200";
    else if (t.type === "loan" || t.type === "repayment") other = "2200";
    else if (t.direction === "in") other = "4900";
    post({ id: `cash:${t.id}`, date: String(t.date || "").slice(0, 10), organizationId: String(t.organizationId || account.organizationId || ""), currency, memo: `${t.type}${t.reference ? " · " + t.reference : ""}${t.description ? " · " + t.description : ""}`, source: "financeTransactions", sourceId: String(t.id) }, [["1000", other, signedIn]]);
  }
  // Fixed assets: capitalised at cost (against the purchases clearing account) and depreciated monthly.
  for (const asset of input.fixedAssets) {
    if (asset.status === "disposed") continue;
    const currency = String(asset.currency || companyCurrency(asset.organizationId)), cost = minorUnits(asset.cost, currency), date = String(asset.purchaseDate || "").slice(0, 10);
    if (!currency || cost === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { issues.push({ id: String(asset.id), reason: "Fixed asset needs a valid cost, currency and purchase date" }); continue; }
    const meta = { organizationId: String(asset.organizationId || ""), currency, source: "fixedAssets", sourceId: String(asset.id) };
    post({ ...meta, id: `asset:${asset.id}`, date, memo: `Fixed asset · ${asset.name}` }, [["1500", "1600", cost]]);
    if (date > input.asOf) continue;
    let previous = 0n;
    for (const end of monthEnds(date, input.asOf)) {
      const total = depreciationTo(asset, currency, end);
      post({ ...meta, id: `dep:${asset.id}:${end}`, date: end, memo: `Depreciation · ${asset.name}` }, [["6500", "1590", total - previous]]);
      previous = total;
    }
  }
  return { entries: entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)), issues };
}

/** Trial balance (and the balances every statement is read from) for one currency, optionally one company and date range. */
export function trialBalance(entries: JournalEntry[], filter: { currency: string; organizationId?: string; from?: string; to?: string }) {
  const totals = new Map<string, { debit: bigint; credit: bigint; opening: bigint }>();
  for (const entry of entries) {
    if (entry.currency !== filter.currency || (filter.organizationId && entry.organizationId !== filter.organizationId) || (filter.to && entry.date > filter.to)) continue;
    const beforePeriod = Boolean(filter.from && entry.date < filter.from);
    for (const line of entry.lines) {
      const row = totals.get(line.account) || { debit: 0n, credit: 0n, opening: 0n };
      if (beforePeriod) row.opening += line.debit - line.credit; else { row.debit += line.debit; row.credit += line.credit; }
      totals.set(line.account, row);
    }
  }
  const rows = chartOfAccounts.filter(a => totals.has(a.code)).map(a => { const t = totals.get(a.code)!; return { ...a, opening: t.opening, debit: t.debit, credit: t.credit, closing: t.opening + t.debit - t.credit }; });
  const debit = rows.reduce((n, r) => n + r.debit, 0n), credit = rows.reduce((n, r) => n + r.credit, 0n);
  return { rows, debit, credit, balanced: debit === credit && rows.reduce((n, r) => n + r.closing, 0n) === 0n };
}

/** Accrual statements read from ledger balances. */
export function ledgerStatements(entries: JournalEntry[], filter: { currency: string; organizationId?: string; from?: string; to: string }) {
  const closing = trialBalance(entries, { ...filter, from: undefined }), period = trialBalance(entries, filter);
  const bal = (tb: typeof closing, code: string) => tb.rows.find(r => r.code === code);
  const debitBalance = (tb: typeof closing, code: string) => bal(tb, code)?.closing ?? 0n;
  const movement = (code: string) => { const r = bal(period, code); return r ? r.debit - r.credit : 0n; };
  const of = (type: AccountType) => chartOfAccounts.filter(a => a.type === type).map(a => a.code);
  const revenue = of("revenue").reduce((n, c) => n - movement(c), 0n), expenses = of("expense").reduce((n, c) => n + movement(c), 0n);
  const retained = [...of("revenue"), ...of("expense")].reduce((n, c) => n - debitBalance(closing, c), 0n);
  const sumType = (type: AccountType, sign: 1n | -1n) => of(type).reduce((n, c) => n + sign * debitBalance(closing, c), 0n);
  const totalAssets = sumType("asset", 1n), totalLiabilities = sumType("liability", -1n), contributed = sumType("equity", -1n);
  return {
    income: { lines: [...of("revenue"), ...of("expense")].map(code => ({ code, name: chartOfAccounts.find(a => a.code === code)!.name, type: accountType.get(code)!, amount: accountType.get(code) === "revenue" ? -movement(code) : movement(code) })).filter(l => l.amount !== 0n), revenue, expenses, surplus: revenue - expenses },
    balance: {
      assets: of("asset").map(code => ({ code, name: chartOfAccounts.find(a => a.code === code)!.name, amount: debitBalance(closing, code) })).filter(l => l.amount !== 0n),
      liabilities: of("liability").map(code => ({ code, name: chartOfAccounts.find(a => a.code === code)!.name, amount: -debitBalance(closing, code) })).filter(l => l.amount !== 0n),
      equity: [...of("equity").map(code => ({ code, name: chartOfAccounts.find(a => a.code === code)!.name, amount: -debitBalance(closing, code) })).filter(l => l.amount !== 0n), { code: "3900", name: "Retained surplus / (deficit)", amount: retained }],
      totalAssets, totalLiabilities, totalEquity: contributed + retained, balanced: totalAssets === totalLiabilities + contributed + retained,
    },
    trialBalanced: closing.balanced,
  };
}
