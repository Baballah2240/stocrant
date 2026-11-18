import { documentDueDate } from "./payment-terms.js";
import { randomUUID, createHash } from "node:crypto";
import type { AuthenticatedUser } from "./auth.js";
import { can, isWithinScope, ownRecordsRequired } from "./permissions.js";
import { getCollection, getStore, nextCollectionId, saveStore, transaction } from "./storage.js";
import { dateSchema, money, precision, scaled } from "./payroll-model.js";
import { financialCategory } from "./finance-categories.js";

type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
export function automaticFinanceReference(kind: string, company: string, key?: string): string { return `${kind}-${createHash("sha256").update(`${company}:${key || randomUUID()}`).digest("hex").slice(0,20).toUpperCase()}`; }
export function financialError(message: string, statusCode = 400): never { throw Object.assign(new Error(message), { statusCode }); }
export const currencies = ["QAR", "USD", "EUR", "GBP", "AED", "SAR", "KWD", "BHD", "OMR", "JPY", "KRW", "INR", "PKR", "BDT", "PHP", "EGP", "SDG"];
export function companyFinanceDate(companyId:string,instant=new Date()) {
  const timezone=rows("payrollSettings").find(r=>r.organizationId===companyId)?.timezone||rows("attendanceSettings").find(r=>r.organizationId===companyId)?.timezone||process.env.STOCRANT_TIME_ZONE||"Asia/Qatar";
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(instant);
  const part=(name:string)=>parts.find(p=>p.type===name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
/** Cash inputs must already be representable in minor units; never silently round a payment. */
export function cashAmount(value: unknown, currency: string, positive = false): string {
  if (!currencies.includes(currency)) financialError("Select a supported currency.");
  if (typeof value !== "string" && typeof value !== "number") financialError("Enter a decimal amount.");
  let units: bigint;
  try { units = scaled(value, 4); } catch { return financialError("Enter a valid decimal amount."); }
  const divisor = 10n ** BigInt(4 - precision(currency));
  if (units % divisor) financialError("The amount has more decimal places than this currency supports.");
  if (positive && units <= 0n) financialError("Enter a positive amount.");
  return money(units / divisor, precision(currency));
}
export function appendFinancialHistory(user: AuthenticatedUser, action: string, record: Row, reason: string) {
  const previousHash = rows("financeHistory").at(-1)?.hash ?? "";
  const entry = { id: nextCollectionId("financeHistory"), organizationId: record.organizationId, locationId: record.locationId, employeeId: record.employeeId,
    action, targetId: record.id, actorId: user.id, at: new Date().toISOString(), reason, record: structuredClone(record), previousHash };
  const hash = createHash("sha256").update(JSON.stringify(entry)).digest("hex");
  const data = getStore(); data.collections.financeHistory = [...rows("financeHistory"), { ...entry, hash }]; saveStore(data);
}
export function financialHistoryValid() {
  let previousHash = "";
  for (const { hash, ...entry } of rows("financeHistory")) {
    if (entry.previousHash !== previousHash || createHash("sha256").update(JSON.stringify(entry)).digest("hex") !== hash) return false;
    previousHash = hash;
  }
  return true;
}
export function validatePayrollRecovery(source: Row, ignoreId?: string) {
  if (!["advance", "loan"].includes(source.type)) return;
  const tx = rows("financeTransactions").find(t => t.id === source.financeTransactionId && t.type === source.type && t.employeeId === source.employeeId && t.organizationId === source.organizationId && t.direction === "out" && t.status === "paid");
  if (!tx || tx.currency !== source.currency || rows("financeTransactions").some(t => t.reversalOf === tx.id)) financialError("A payroll recovery must reference a confirmed employee advance or loan in the salary currency.");
  const reserved = rows("payrollSources").filter(s => s.id !== ignoreId && s.financeTransactionId === tx.id && !["rejected", "superseded"].includes(s.status)).reduce((n, s) => n + scaled(s.amount), 0n);
  const cash = rows("financeTransactions").filter(t => t.recoversTransactionId === tx.id && t.status === "paid").reduce((n, t) => n + (t.direction === "in" ? 1n : -1n) * scaled(t.amount), 0n);
  if (reserved + cash + scaled(source.amount) > scaled(tx.amount)) financialError("Installments and repayments exceed the advance or loan balance.", 409);
}
export const sourceCollections = ["sales", "expenses", "purchases", "returns"];
export const sourceStates:Record<string,string[]>={sales:["completed"],expenses:["approved","reimbursed"],purchases:["ordered","received","partial"],returns:["approved","refunded"]};
const sourceAmount = (name: string, row: Row) => row[name === "expenses" ? "amount" : name === "returns" ? "refund" : "total"];
export function settlementRows(name: string, source: Row) {
  const company = rows("companies").find(c => c.id === source.organizationId);
  const currency = String(source.currency || company?.currency || "");
  if (!currencies.includes(currency)) return { currency, amount: null, paid: null, outstanding: null, status: "unverified" };
  const digits = precision(currency);
  try {
    const total = scaled(cashAmount(sourceAmount(name, source), currency), digits);
    const expected = name === "sales" ? "in" : "out";
    const paid = rows("financeTransactions").filter(t => t.status === "paid" && t.sourceCollection === name && t.sourceId === source.id && t.currency === currency)
      .reduce((n, t) => n + (t.direction === expected ? 1n : -1n) * scaled(t.amount, digits), 0n);
    return { currency, amount: money(total, digits), paid: money(paid, digits), outstanding: money(total - paid, digits), status: paid === 0n ? "unpaid" : paid === total ? "paid" : "partially paid" };
  } catch { return { currency, amount: null, paid: null, outstanding: null, status: "unverified" }; }
}

/** Runs both on submission and approval, including generic collection APIs. */
/** Closed periods: no finance record dated on or before a company's "Books closed through" date may be added, changed or removed. */
const lockedDateFields: Record<string,string> = { financeTransactions: "date", sales: "date", purchases: "date", expenses: "date", returns: "date", fixedAssets: "purchaseDate" };
export function assertBooksOpen(organizationId: unknown, date: unknown) {
  const lock = String(rows("companies").find(c => c.id === organizationId)?.booksLockedUntil || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(lock) && date && String(date).slice(0, 10) <= lock) financialError(`The books are closed through ${lock}. Record a correction in an open period instead.`, 409);
}
export function validateFinancialMutation(user: AuthenticatedUser, collection: string, action: string, payload: Row, current?: Row): Row {
  if (collection === "financeHistory") financialError("Financial audit history is immutable.");
  if (collection === "exchangeRates" && action !== "delete") { const item = { ...current, ...payload }; if (!/^\d+(\.\d{1,12})?$/.test(String(item.rate ?? "").trim()) || Number(item.rate) <= 0) financialError("Enter a positive exchange rate with up to 12 decimal places."); if (item.fromCurrency === item.toCurrency) financialError("Choose two different currencies."); }
  const lockedField = lockedDateFields[collection];
  if (lockedField) for (const record of [current, action === "delete" ? undefined : { ...current, ...payload }]) if (record) assertBooksOpen(record.organizationId, record[lockedField]);
  if (sourceCollections.includes(collection)) {
    if(collection==="returns"&&current?.shopOrderId)financialError("Shop returns are immutable. Record a correction through Finance.");
    if(collection==="purchases"&&current&&rows("shopReceipts").some(r=>r.purchaseId===current.id)){
      const currency=current.currency||rows("companies").find(c=>c.id===current.organizationId)?.currency;
      if(action==="delete"||payload.organizationId!==undefined&&payload.organizationId!==current.organizationId||payload.currency!==undefined&&payload.currency!==currency||payload.status!==undefined&&!["ordered","partial","received"].includes(payload.status))financialError("A purchase linked to stock receipts must retain its company, currency and receiving status.");
    }
    if (current && rows("financeTransactions").some(t => t.sourceCollection === collection && t.sourceId === current.id)) financialError("A settled source cannot be rewritten. Reverse its settlement and record a correction.");
    if (action === "delete") return payload;
    const item = { ...current, ...payload };
    const company = rows("companies").find(c => c.id === item.organizationId);
    const currency = String(item.currency || company?.currency || "");
    const key = collection === "expenses" ? "amount" : collection === "returns" ? "refund" : "total";
    const reference = collection === "sales" ? "invoiceNo" : collection === "purchases" ? "poNumber" : collection === "returns" ? "rmaNumber" : undefined;
    if (reference && rows(collection).some(s => s.id !== current?.id && s.organizationId === item.organizationId && String(s[reference]).toLowerCase() === String(item[reference]).toLowerCase())) financialError("This company source reference already exists.", 409);
    return { ...payload, currency, [key]: cashAmount(item[key] ?? "0", currency) };
  }
  if (!["financeAccounts", "financeTransactions"].includes(collection)) return payload;
  if (ownRecordsRequired(user)) financialError("Financial management requires company-level permission.", 403);
  if (collection === "financeAccounts") {
    if (current && rows("financeTransactions").some(t => t.accountId === current.id || t.destinationAccountId === current.id)) financialError("An account with movements cannot be changed or deleted.");
    if (action === "delete") return payload;
    const item = { ...current, ...payload };
    const company = rows("companies").find(c => c.id === item.organizationId && c.status !== "inactive");
    if (!company || !isWithinScope(user, { ...company, organizationId: company.id })) financialError("Choose an accessible company.");
    return { ...payload, currency: String(item.currency).toUpperCase(), openingBalance: cashAmount(item.openingBalance ?? "0", String(item.currency).toUpperCase()) };
  }
  if (current?.status === "paid" || current?.payrollRunId || current?.transferGroupId || current?.reversalOf) financialError("Posted ledger entries are immutable. Use an authorized reversal.");
  if (action === "delete") return payload;
  const item = { ...current, ...payload };
  if (item.type === "payroll" || ["salary","salaries"].includes(String(item.category||"").toLowerCase())) financialError("Use approved payroll for salary payments.");
  if (item.payrollRunId || item.allocations || item.reversalOf) financialError("Use the controlled payroll or reversal operation.");
  const account = rows("financeAccounts").find(a => a.id === item.accountId && isWithinScope(user, a));
  if (!account || account.organizationId !== item.organizationId) financialError("Choose an accessible account in this company.");
  if (item.currency && item.currency !== account.currency) financialError("The transaction currency must match its account.");
  const amount = cashAmount(item.amount, account.currency, true);
  if (!dateSchema.safeParse(item.date).success) financialError("Choose a valid transaction date.");
  if (!["draft", "pending", "paid", "cancelled"].includes(item.status)) financialError("Choose a valid transaction status.");
  if (item.status === "paid" && item.date > companyFinanceDate(String(account.organizationId))) financialError("A confirmed payment cannot be in the future.");
  const direction = item.type === "income" ? "in" : ["expense", "payroll", "advance", "reimbursement", "tax", "gratuity"].includes(item.type) ? "out" : item.direction;
  if (!["income", "expense", "payroll", "transfer", "advance", "reimbursement", "loan", "repayment", "refund", "tax", "capital", "asset", "gratuity", "other"].includes(item.type) || !["in", "out"].includes(direction)) financialError("Choose a valid movement type and direction.");
  if (item.type === "transfer") {
    const other = rows("financeAccounts").find(a => a.id === item.destinationAccountId && isWithinScope(user, a));
    if (!item.transferGroupId || !other || other.id === account.id || other.currency !== account.currency) financialError("Transfers require a matching pair of accounts in the same currency.");
  }
  if (item.employeeId && !rows("employees").some(e => e.id === item.employeeId && e.organizationId === account.organizationId && isWithinScope(user, e))) financialError("Choose an employee from the account company.");
  if (item.type === "repayment" && item.employeeId && !item.recoversTransactionId) financialError("Choose a confirmed advance or loan for this employee repayment.");
  if (item.recoversTransactionId) {
    const debt = rows("financeTransactions").find(t => t.id === item.recoversTransactionId && ["advance", "loan"].includes(t.type) && t.direction === "out" && t.status === "paid" && t.organizationId === item.organizationId && t.currency === account.currency && isWithinScope(user, t));
    if (!debt || item.type !== "repayment" || direction !== "in" || debt.employeeId !== item.employeeId || rows("financeTransactions").some(t => t.reversalOf === debt.id)) financialError("Choose a confirmed advance or loan for this employee repayment.");
    const reserved = rows("payrollSources").filter(s => s.financeTransactionId === debt.id && !["rejected", "superseded"].includes(s.status)).reduce((n, s) => n + scaled(s.amount), 0n);
    const repaid = rows("financeTransactions").filter(t => t.id !== current?.id && t.recoversTransactionId === debt.id && t.status === "paid").reduce((n, t) => n + (t.direction === "in" ? 1n : -1n) * scaled(t.amount), 0n);
    if (item.status === "paid" && reserved + repaid + scaled(amount) > scaled(debt.amount)) financialError("Repayment exceeds the unreserved debt balance.", 409);
  }
  if (item.reference && rows("financeTransactions").some(t => t.id !== current?.id && t.organizationId === item.organizationId && t.type !== "transfer" && String(t.reference).trim().toLowerCase() === String(item.reference).trim().toLowerCase())) financialError("This company payment reference is already recorded.", 409);
  if (item.sourceId || item.sourceCollection) {
    const source = sourceCollections.includes(item.sourceCollection) && rows(item.sourceCollection).find(s => s.id === item.sourceId && s.organizationId === account.organizationId && isWithinScope(user, s));
    if (!source || !sourceStates[item.sourceCollection]?.includes(source.status)) financialError("Choose an approved source record in this company.");
    const expectedType = item.sourceCollection === "sales" ? "income" : item.sourceCollection === "returns" ? "refund" : "expense";
    if (item.type !== expectedType || direction !== (item.sourceCollection === "sales" ? "in" : "out")) financialError("The payment type must match its source record.");
    if (item.sourceCollection === "expenses" && source.category === "salaries") financialError("Use approved payroll to settle salaries and avoid double counting.");
    const settlement = settlementRows(item.sourceCollection, source);
    if (settlement.currency !== account.currency || settlement.outstanding === null) financialError("Confirm the source currency before settlement.");
    if (item.status === "paid" && scaled(amount) > scaled(settlement.outstanding)) financialError("The payment exceeds the source outstanding balance.", 409);
    // Freeze explicit source currency on the new movement; historical sources remain untouched.
  }
  return { ...payload, reference: item.reference?.trim() || automaticFinanceReference("FIN", item.organizationId, item.idempotencyKey), ledgerVersion:1, currency: account.currency, amount, direction, sourceModule: item.sourceId ? item.sourceCollection : "finance", paymentDate: item.status === "paid" ? item.date : null, method: item.method || account.type };
}

export function payrollEntryPayments(entry: Row) {
  const digits = precision(entry.currency);
  const payments: Row[] = [];
  let paid = 0n;
  for (const t of rows("financeTransactions").filter(t => t.payrollRunId === entry.runId && t.status === "paid" && t.currency === entry.currency)) {
    // Old full-run postings are allocated from their frozen payslips, without creating new cash.
    const amount = t.allocations ? t.allocations.find((a: Row) => a.entryId === entry.id)?.amount : t.direction === "out" ? entry.netPay : undefined;
    if (amount === undefined) continue;
    paid += (t.direction === "in" ? -1n : 1n) * scaled(amount, digits);
    payments.push({ id: t.id, amount, direction: t.direction, date: t.date, method: t.method, reference: t.reference, externalReference: t.externalReference, reversalOf: t.reversalOf });
  }
  const net = scaled(entry.netPay, digits);
  return { paidAmount: money(paid, digits), outstanding: money(net - paid, digits), paymentStatus: paid === net ? "Paid" : paid > 0n ? "Partially Paid" : "Unpaid", payments };
}
export function runPaymentState(run: Row) {
  const entries = rows("payrollEntries").filter(e => e.runId === run.id), digits = precision(run.currency);
  const paid = entries.reduce((n, e) => n + scaled(payrollEntryPayments(e).paidAmount, digits), 0n);
  const net = scaled(run.totals.netPay, digits);
  return { paidAmount: money(paid, digits), outstanding: money(net - paid, digits), status: net === paid ? "Paid" : paid > 0n ? "Partially Paid" : "Approved" };
}

/** Exact per-currency reporting. Never add currencies into a fictional aggregate balance. */
export function ledgerSummary(user?: AuthenticatedUser) {
  const accounts = rows("financeAccounts").filter(a => !user || isWithinScope(user, a));
  const transactions = rows("financeTransactions").filter(t => !user || isWithinScope(user, t));
  const issues: Row[] = [];
  const valid: Array<Row & {id:string}> = transactions.filter(t => {
    const account = accounts.find(a => a.id === t.accountId);
    if (!account) { issues.push({ id: t.id, reason: "Account missing or outside report scope" }); return false; }
    if (!["in", "out"].includes(t.direction)) { issues.push({ id: t.id, reason: "Invalid legacy direction" }); return false; }
    if (t.currency && t.currency !== account.currency) { issues.push({ id: t.id, reason: "Currency mismatch" }); return false; }
    try { cashAmount(t.amount, account.currency, true); return true; } catch { issues.push({ id: t.id, reason: "Invalid legacy amount" }); return false; }
  }).map(t => ({ ...t, id:String(t.id), currency: t.currency || accounts.find(a => a.id === t.accountId)!.currency }));
  const balances: Array<Row & {id:string}> = accounts.map(a => {
    const digits = precision(a.currency);
    const movement = valid.filter(t => t.accountId === a.id && t.status === "paid").reduce((n, t) => n + (t.direction === "in" ? 1n : -1n) * scaled(t.amount, digits), 0n);
    try { return { ...a, id:String(a.id), balance: money(scaled(cashAmount(a.openingBalance ?? "0", a.currency), digits) + movement, digits) }; }
    catch { issues.push({id:a.id,reason:"Unverified account opening balance or currency"}); return {...a,id:String(a.id),balance:null}; }
  });
  const totals = [...new Set(accounts.map(a => String(a.currency)))].filter(c=>currencies.includes(c)).map(currency => {
    const digits = precision(currency), paid = valid.filter(t => t.currency === currency && t.status === "paid");
    const sum = (items: Row[]) => items.reduce((n,t)=>n+(t.direction === "in"?1n:-1n)*scaled(t.amount,digits),0n);
    const income=sum(paid.filter(t=>financialCategory(t)==="revenue"));
    const salaries=-sum(paid.filter(t=>financialCategory(t)==="payroll"));
    const purchases=-sum(paid.filter(t=>financialCategory(t)==="purchases"));
    const expenses=purchases-sum(paid.filter(t=>financialCategory(t)==="expenses"));
    const net=sum(paid),profit=income-expenses-salaries;
    const payroll = (!user || can(user,"payroll","view")&&!ownRecordsRequired(user)) ? rows("payrollEntries").filter(e=>e.currency===currency&&(!user||isWithinScope(user,e))&&rows("payrollRuns").some(r=>r.id===e.runId&&["Approved","Partially Paid","Paid"].includes(r.status))) : [];
    return { currency, profit:money(profit,digits), purchases:money(purchases,digits), otherCash:money(net-profit,digits), income: money(income, digits), expenses: money(expenses, digits), salaries: money(salaries, digits), net: money(net, digits), balance: money(balances.filter(a => a.currency === currency&&a.balance!==null).reduce((n, a) => n + scaled(a.balance, digits), 0n), digits),
      approvedPayroll:money(payroll.reduce((n,e)=>n+scaled(e.netPay,digits),0n),digits), outstandingPayroll:money(payroll.reduce((n,e)=>n+scaled(payrollEntryPayments(e).outstanding,digits),0n),digits) };
  });
  const sources = sourceCollections.flatMap(collection => rows(collection).filter(s => !user || isWithinScope(user, s)).map(s => {
    const settlement=settlementRows(collection,s);
    const payrollManaged=collection==="expenses"&&s.category==="salaries"&&rows("payrollSettings").some(rule=>rule.organizationId===s.organizationId&&rule.configured);
    return {payrollManaged,id:String(s.id),collection,organizationId:s.organizationId,label:(collection==="returns"?s.rmaNumber:undefined)||s.title||s.invoiceNo||s.poNumber||s.rmaNumber||s.id,date:s.date,dueDate:documentDueDate({...s,paymentTerms:s.paymentTerms||rows("companies").find(c=>c.id===s.organizationId)?.defaultPaymentTerms}),paymentTerms:s.paymentTerms||"",sourceStatus:s.status,party:s.customer||s.supplier||"",shopOrderId:s.shopOrderId,receiptCount:collection==="purchases"?rows("shopReceipts").filter(r=>r.purchaseId===s.id&&r.organizationId===s.organizationId).length:0,...settlement,eligible:sourceStates[collection].includes(s.status)&&!payrollManaged,canSettle:sourceStates[collection].includes(s.status)&&!payrollManaged&&settlement.outstanding!==null&&scaled(settlement.outstanding)>0n};
  }));
  const obligations:Row[]=[];
  const obligation=(organizationId:string,currency:string)=>{
    let row=obligations.find(r=>r.organizationId===organizationId&&r.currency===currency);
    if(!row){row={id:organizationId+":"+currency,organizationId,currency,receivable:"0",payable:"0",payroll:"0"};obligations.push(row);}return row;
  };
  for(const source of sources){
    if(!source.eligible)continue;
    if(source.outstanding===null){issues.push({id:source.id,organizationId:source.organizationId,currency:source.currency,reason:"Unverified source amount or currency"});continue;}
    if(scaled(source.outstanding)<0n||source.paid!==null&&scaled(source.paid)<0n){issues.push({id:source.id,organizationId:source.organizationId,currency:source.currency,reason:"Source settlement is outside its allowed balance"});continue;}
    const row=obligation(String(source.organizationId),source.currency),key=source.collection==="sales"?"receivable":"payable",digits=precision(source.currency);
    row[key]=money(scaled(row[key],digits)+scaled(source.outstanding,digits),digits);
  }
  if(!user||can(user,"payroll","view")&&!ownRecordsRequired(user))for(const entry of rows("payrollEntries").filter(e=>(!user||isWithinScope(user,e))&&rows("payrollRuns").some(r=>r.id===e.runId&&["Approved","Partially Paid","Paid"].includes(r.status)))){
    const row=obligation(String(entry.organizationId),String(entry.currency)),digits=precision(entry.currency);
    row.payroll=money(scaled(row.payroll,digits)+scaled(payrollEntryPayments(entry).outstanding,digits),digits);
  }
  // Legacy numeric fields are meaningful only in a single currency; old clients see no mixed-currency sum.
  const single = totals.length === 1 ? totals[0] : null;
  return { accounts: balances, transactions: valid, totals, sources, obligations, issues:issues.map(issue=>{const record=transactions.find(t=>t.id===issue.id)||accounts.find(a=>a.id===issue.id);return {...issue,organizationId:issue.organizationId||record?.organizationId,currency:issue.currency||record?.currency};}), income: single ? Number(single.income) : totals.length ? null : 0, expenses: single ? Number(single.expenses) : totals.length ? null : 0, salaries: single ? Number(single.salaries) : totals.length ? null : 0, net: single ? Number(single.net) : totals.length ? null : 0 };
}

export function reverseFinancialTransaction(user: AuthenticatedUser, id: string, input: { reason: string; date: string; reference?: string; externalReference?: string; idempotencyKey: string }) {
  return transaction(() => {
    if (!can(user, "finance", "create") || !can(user, "finance", "approve") || !can(user, "finance", "view") || ownRecordsRequired(user)) financialError("Finance view, create and approval permission is required for reversals.", 403);
    const original = rows("financeTransactions").find(t => t.id === id && isWithinScope(user, t));
    if (!original) financialError("Transaction not found.", 404);
    const reference = input.reference?.trim() || automaticFinanceReference("REV", original.organizationId, input.idempotencyKey);
    const replay = rows("financeTransactions").find(t => t.idempotencyKey === input.idempotencyKey && t.createdBy === user.id);
    if (replay) {
      if (replay.reversalOf !== id || replay.reference !== reference || (replay.externalReference || "") !== (input.externalReference || "") || replay.date !== input.date || replay.description !== input.reason) financialError("This payment key was used with different details.", 409);
      return replay;
    }
    if (original.status !== "paid" || original.reversalOf || original.transferGroupId) financialError("Only posted non-transfer payments can be reversed. Transfers require a new opposite transfer.");
    if (original.payrollRunId && !can(user, "payroll", "pay")) financialError("Payroll payment permission is required.", 403);
    if (rows("financeTransactions").some(t => t.reversalOf === id)) financialError("This transaction has already been reversed.", 409);
    if (rows("payrollSources").some(s => s.financeTransactionId === id && !["rejected", "superseded"].includes(s.status))) financialError("Resolve the linked payroll recovery before reversing this advance or loan.", 409);
    if (rows("financeTransactions").some(t => t.recoversTransactionId === id && !t.reversalOf && !rows("financeTransactions").some(r => r.reversalOf === t.id))) financialError("Reverse the linked cash repayments before reversing the disbursement.", 409);
    if (!dateSchema.safeParse(input.date).success || input.date < original.date || input.date > companyFinanceDate(String(original.organizationId))) financialError("Use a reversal date between the payment date and today.");
    assertBooksOpen(original.organizationId, input.date);
    if (rows("financeTransactions").some(t => t.organizationId === original.organizationId && String(t.reference).toLowerCase() === reference.toLowerCase())) financialError("This company reference is already recorded.", 409);
    const currency=String(original.currency||rows("financeAccounts").find(a=>a.id===original.accountId)?.currency||"");
    const allocations=original.allocations||(original.payrollRunId?rows("payrollEntries").filter(e=>e.runId===original.payrollRunId).map(e=>({entryId:e.id,employeeId:e.employeeId,amount:e.netPay})):undefined);
    const item: Row = { ...original, ledgerVersion:1, currency, amount:cashAmount(original.amount,currency,true), ...(allocations?{allocations}:{}), id: nextCollectionId("financeTransactions"), reversalOf: id, sourceModule: "reversal", direction: original.direction === "out" ? "in" : "out", date: input.date, paymentDate: input.date, reference, externalReference: input.externalReference || "", description: input.reason, idempotencyKey: input.idempotencyKey, createdBy: user.id, submittedBy:user.id, approvedBy: user.id, createdAt: new Date().toISOString() };
    const data = getStore(); data.collections.financeTransactions = [...rows("financeTransactions"), item]; saveStore(data);
    if (original.payrollRunId) {
      const run = rows("payrollRuns").find(r => r.id === original.payrollRunId)!;
      Object.assign(run, runPaymentState(run), { version: run.version + 1 }); saveStore(data);
    }
    appendFinancialHistory(user, "reversed", item, input.reason);
    return item;
  });
}
