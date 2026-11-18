import { TEST_DATA_DIR } from "./test-env.js";
import { after, before, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "./app.js";
import { getStore, saveStore } from "./storage.js";
import { buildJournal, ledgerStatements, trialBalance } from "./general-ledger.js";
type Row = Record<string, any>;

const company = { id: "c1", currency: "SAR" };
const tx = (id: string, type: string, direction: string, amount: string, extra: Row = {}) => ({ id, accountId: "bank", organizationId: "c1", type, direction, amount, currency: "SAR", status: "paid", date: "2026-03-01", ...extra });
const sample = () => buildJournal({
  asOf: "2026-12-31", companies: [company],
  accounts: [{ id: "bank", organizationId: "c1", currency: "SAR", name: "Bank", openingBalance: "1000.00" }],
  transactions: [
    tx("cap", "capital", "in", "50000"), tx("machine", "asset", "out", "12000"), tx("loan", "loan", "in", "5000"),
    tx("settle", "income", "in", "3000", { sourceCollection: "sales", sourceId: "s1" }), tx("cash-sale", "income", "in", "700"),
    tx("rent", "expense", "out", "900"), tx("bill", "expense", "out", "400", { sourceCollection: "purchases", sourceId: "p1" }),
    tx("adv", "advance", "out", "250", { employeeId: "e1" }), tx("pay", "payroll", "out", "2000"),
    tx("t-out", "transfer", "out", "100", { transferGroupId: "g" }), tx("t-in", "transfer", "in", "100", { transferGroupId: "g" }),
    tx("pending", "income", "in", "999", { status: "pending" }),
  ],
  sources: { sales: [{ id: "s1", organizationId: "c1", total: 5000, date: "2026-02-01", status: "completed" }, { id: "draft", organizationId: "c1", total: 77, date: "2026-02-01", status: "pending" }], purchases: [{ id: "p1", organizationId: "c1", total: 1500, date: "2026-02-10", status: "received" }], expenses: [], returns: [] },
  payrollEntries: [{ id: "pe", runId: "r1", organizationId: "c1", currency: "SAR", netPay: "2500.00", periodEnd: "2026-02-28", employee: "Ali" }],
  payrollRuns: [{ id: "r1", status: "Partially Paid", end: "2026-02-28" }],
  fixedAssets: [{ id: "fa", organizationId: "c1", name: "Lathe", cost: 12000, salvageValue: 0, usefulLifeYears: 10, purchaseDate: "2026-01-01", status: "in use" }],
});

it("every journal entry balances and the trial balance closes to zero", () => {
  const { entries, issues } = sample();
  assert.deepEqual(issues, []);
  for (const entry of entries) assert.equal(entry.lines.reduce((n, l) => n + l.debit - l.credit, 0n), 0n, entry.id);
  const tb = trialBalance(entries, { currency: "SAR" });
  assert.equal(tb.balanced, true);
  const closing = (code: string) => tb.rows.find(r => r.code === code)?.closing ?? 0n;
  assert.equal(closing("1100"), 200000n); // 5,000 invoiced − 3,000 collected
  assert.equal(closing("2000"), -110000n); // 1,500 billed − 400 paid
  assert.equal(closing("2100"), -50000n); // 2,500 payroll − 2,000 paid
  assert.equal(closing("1090"), 0n); // transfer legs cancel
  assert.equal(closing("1600"), 0n); // asset purchase paid and registered
  assert.equal(closing("1200"), 25000n);
  assert.equal(closing("1590"), -120000n); // a full year of 1,200 depreciation
  assert.equal(closing("1000"), 100000n + 5000000n - 1200000n + 500000n + 300000n + 70000n - 90000n - 40000n - 25000n - 200000n);
});

it("accrual statements: income statement surplus equals retained surplus and the balance sheet balances", () => {
  const { entries } = sample();
  const s = ledgerStatements(entries, { currency: "SAR", to: "2026-12-31" });
  // Revenue 5,000 + 700; expenses 1,500 purchases + 900 rent + 2,500 salaries + 1,200 depreciation.
  assert.equal(s.income.revenue, 570000n);
  assert.equal(s.income.expenses, 610000n);
  assert.equal(s.income.surplus, -40000n);
  assert.equal(s.balance.equity.find(l => l.code === "3900")!.amount, -40000n);
  assert.equal(s.balance.balanced, true);
  assert.equal(s.trialBalanced, true);
  // A period filter keeps opening balances but reports only the period's movements.
  const q1 = ledgerStatements(entries, { currency: "SAR", from: "2026-04-01", to: "2026-06-30" });
  assert.equal(q1.income.revenue, 0n);
  assert.equal(q1.income.expenses, 29917n); // 91 days of daily depreciation: 12,000 × 91 ÷ 3,650
  assert.equal(q1.balance.balanced, true);
});

it("records that cannot be posted exactly are reported, not guessed", () => {
  const { issues } = buildJournal({ asOf: "2026-12-31", companies: [company], accounts: [{ id: "bank", organizationId: "c1", currency: "SAR", openingBalance: "0" }], transactions: [tx("bad", "income", "in", "1.005")], sources: { sales: [{ id: "x", organizationId: "c1", total: "abc", date: "2026-01-01", status: "completed" }] }, payrollEntries: [], payrollRuns: [], fixedAssets: [{ id: "f", organizationId: "c1", cost: 10, purchaseDate: "" }] });
  assert.deepEqual(issues.map(i => i.id).sort(), ["bad", "f", "x"]);
});

let server: Server, base = "", cookie = "";
const call = (path: string, body?: unknown, method = body === undefined ? "GET" : "POST") => fetch(`${base}/api${path}`, { method, headers: { Cookie: cookie, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
before(async () => {
  server = createApp().listen(0, "127.0.0.1"); await new Promise<void>(done => server.once("listening", done)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const setup = await call("/auth/setup", { name: "Ledger admin", email: "ledger@example.test", password: randomBytes(24).toString("hex"), setupKey: "local-setup" }); assert.equal(setup.status, 201); cookie = setup.headers.get("set-cookie")!.split(";")[0];
});
after(async () => { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); const target = resolve(TEST_DATA_DIR); assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes("stocrant-test-data-")); fs.rmSync(target, { recursive: true, force: true }); });

it("ledger endpoint is balanced, and closed books reject back-dated finance records", async () => {
  const data = getStore(), companyId = (data.collections.companies as Row[])[0].id, currency = String((data.collections.companies as Row[])[0].currency || "QAR");
  (data.collections.financeAccounts as Row[]).push({ id: "ledger-bank", organizationId: companyId, name: "Ledger bank", type: "bank", currency, openingBalance: "500.00" });
  saveStore(data);
  const post = (date: string, key: string) => call("/workspace/finance/transactions", { accountId: "ledger-bank", type: "income", amount: "10.00", date, status: "paid", reference: "LEDGER-" + key, idempotencyKey: "ledger-key-" + key });
  assert.equal((await post("2026-05-01", "open")).status, 201);
  const ledger = await (await call(`/workspace/finance/ledger?currency=${currency}`)).json() as Row;
  assert.equal(ledger.trialBalance.balanced, true);
  assert.equal(ledger.balance.balanced, true);
  assert.ok(ledger.entries.some((e: Row) => e.memo.includes("LEDGER-open")));
  // Close the books through June: earlier dates are refused, later ones still work.
  (getStore().collections.companies as Row[])[0].booksLockedUntil = "2026-06-30"; saveStore(getStore());
  const locked = await post("2026-06-15", "locked");
  assert.equal(locked.status, 409);
  assert.match(((await locked.json()) as Row).error, /closed through 2026-06-30/);
  assert.equal((await post("2026-07-01", "after")).status, 201);
  assert.equal((await call(`/workspace/finance/ledger?currency=bad`)).status, 400);
});

it("VAT, salary advance recovery, custody receipts, asset disposal and end-of-service all post balanced entries", async () => {
  const { gratuityLiability } = await import("./general-ledger.js");
  const sdg = { id: "sd", currency: "SDG", gratuityDaysPerYear: 30, gratuityDaysAfterFiveYears: 45, gratuityMinimumYears: 1 };
  const { entries, issues } = buildJournal({
    asOf: "2026-12-31", companies: [sdg],
    accounts: [{ id: "b", organizationId: "sd", currency: "SDG", openingBalance: "0" }],
    transactions: [
      { id: "vat-pay", accountId: "b", organizationId: "sd", type: "tax", category: "VAT", direction: "out", amount: "100.00", currency: "SDG", status: "paid", date: "2026-07-15" },
      { id: "buy-asset", accountId: "b", organizationId: "sd", type: "asset", direction: "out", amount: "12000.00", currency: "SDG", status: "paid", date: "2026-01-01" },
      { id: "sale-asset", accountId: "b", organizationId: "sd", type: "asset", direction: "in", amount: "7000.00", currency: "SDG", status: "paid", date: "2026-06-30" },
      { id: "eos-pay", accountId: "b", organizationId: "sd", type: "gratuity", direction: "out", amount: "50.00", currency: "SDG", status: "paid", date: "2026-12-01" },
    ],
    sources: { sales: [{ id: "s", organizationId: "sd", total: 1170, tax: 170, date: "2026-03-01", status: "completed" }], purchases: [{ id: "p", organizationId: "sd", total: 585, tax: 85, date: "2026-03-02", status: "received" }], expenses: [{ id: "bad-vat", organizationId: "sd", amount: 10, tax: 20, date: "2026-03-03", status: "approved" }] },
    payrollEntries: [{ id: "pe", runId: "r", organizationId: "sd", currency: "SDG", netPay: "900.00", advanceRecovery: "100.00", periodEnd: "2026-03-31" }],
    payrollRuns: [{ id: "r", status: "Approved" }],
    fixedAssets: [{ id: "truck", organizationId: "sd", name: "Truck", cost: 12000, salvageValue: 0, usefulLifeYears: 4, purchaseDate: "2026-01-01", status: "disposed", disposalDate: "2026-06-30", disposalProceeds: 7000 }],
    custody: [{ id: "cu", organizationId: "sd", employee: "Ali", custodyType: "cash", settlementMethod: "expense receipts", settledAmount: "40.00", settlementDate: "2026-04-01", status: "settled" }],
    employees: [{ id: "e", organizationId: "sd", name: "Ali", hireDate: "2020-01-01" }],
    salaries: [{ employeeId: "e", frequency: "monthly", base: "3000.00", currency: "SDG", effectiveFrom: "2020-01-01" }],
  });
  assert.deepEqual(issues.map(i => i.id), ["bad-vat"]);
  for (const entry of entries) assert.equal(entry.lines.reduce((n, l) => n + l.debit - l.credit, 0n), 0n, entry.id);
  const tb = trialBalance(entries, { currency: "SDG" }), closing = (code: string) => tb.rows.find(r => r.code === code)?.closing ?? 0n;
  assert.equal(tb.balanced, true);
  assert.equal(closing("4000"), -100000n);          // revenue excludes the 170 output VAT
  assert.equal(closing("2400"), -17000n + 10000n);  // output VAT less the 100 paid
  assert.equal(closing("1400"), 8500n);             // input VAT recoverable
  assert.equal(closing("6200"), 100000n);           // salary expense is gross (900 net + 100 advance recovered)
  assert.equal(closing("1200"), -10000n + -4000n);  // advance reduced by salary recovery and custody receipts
  assert.equal(closing("1500"), 0n);                // disposed truck leaves the books
  assert.equal(closing("1590"), 0n);
  assert.equal(closing("1600"), 0n);                // purchase and sale clearing both settled
  const depreciation = closing("6500");             // half a year of 3,000 a year, charged daily
  assert.ok(depreciation > 148000n && depreciation < 150000n);
  assert.equal(closing("6800") + closing("4800"), 1200000n - depreciation - 700000n); // loss = book value − proceeds
  // End-of-service: 7 years at 3,000 a month: 5 × 30 days + 2 × 45 days = 240 days = 24,000.
  const owed = gratuityLiability({ hireDate: "2020-01-01" }, sdg, 300000n, "2026-12-31");
  assert.ok(owed > 2400000n && owed < 2403000n, String(owed)); // 2,557 days incl. two leap days ≈ 7.005 years
  assert.equal(-closing("2300"), owed - 5000n);
  assert.equal(gratuityLiability({ hireDate: "2026-06-01" }, sdg, 300000n, "2026-12-31"), 0n); // under the 1-year minimum
});

it("translates SDG books into USD at each entry's rate and revalues money balances at the closing rate", async () => {
  const { convertUnits, rateOn, scaledRate, translateJournal } = await import("./fx.js");
  const rates = [
    { date: "2026-01-01", fromCurrency: "USD", toCurrency: "SDG", rate: "600", status: "active" },
    { date: "2026-06-01", fromCurrency: "USD", toCurrency: "SDG", rate: "1000", status: "active" },
    { date: "2026-03-01", fromCurrency: "USD", toCurrency: "SDG", rate: "9999", status: "inactive" },
  ];
  assert.equal(scaledRate("0"), null); assert.equal(scaledRate("abc"), null);
  assert.equal(rateOn(rates, "SDG", "USD", "2025-12-31"), null);                      // no rate yet
  assert.equal(convertUnits(60000n, "SDG", "USD", rateOn(rates, "SDG", "USD", "2026-02-01")!), 100n); // 600 SDG = 1 USD (inverse of USD→SDG)
  assert.equal(convertUnits(100n, "USD", "SDG", rateOn(rates, "USD", "SDG", "2026-07-01")!), 100000n); // 1 USD = 1,000 SDG after June
  const sdg = { id: "sd", currency: "SDG" };
  const { entries } = buildJournal({ asOf: "2026-12-31", companies: [sdg], accounts: [{ id: "b", organizationId: "sd", currency: "SDG", openingBalance: "0" }],
    transactions: [{ id: "cap", accountId: "b", organizationId: "sd", type: "capital", direction: "in", amount: "600000.00", currency: "SDG", status: "paid", date: "2026-01-10" }],
    sources: {}, payrollEntries: [], payrollRuns: [], fixedAssets: [] });
  const usd = translateJournal(entries, rates, "USD", "2026-12-31");
  assert.deepEqual(usd.missingRates, []);
  for (const entry of usd.entries) assert.equal(entry.lines.reduce((n, l) => n + l.debit - l.credit, 0n), 0n, entry.id);
  const tb = trialBalance(usd.entries, { currency: "USD" }), closing = (code: string) => tb.rows.find(r => r.code === code)?.closing ?? 0n;
  assert.equal(tb.balanced, true);
  assert.equal(closing("3000"), -100000n);  // capital stays at the historical 1,000 USD
  assert.equal(closing("1000"), 60000n);    // 600,000 SDG of cash is worth 600 USD at the closing rate
  assert.equal(closing("6700"), 40000n);    // unrealised exchange loss of 400 USD
  const statements = ledgerStatements(usd.entries, { currency: "USD", to: "2026-12-31" });
  assert.equal(statements.balance.balanced, true);
  assert.deepEqual(translateJournal(entries, [], "USD", "2026-12-31").missingRates, [{ pair: "SDG→USD", from: "2026-01-10" }]);
});

it("ledger endpoint reports SDG books in USD using the company's chosen rate source", async () => {
  const data = getStore(), company = (data.collections.companies as Row[])[0];
  Object.assign(company, { currency: "SDG", exchangeRateSource: "central bank" });
  (data.collections.financeAccounts as Row[]).push({ id: "sdg-bank", organizationId: company.id, name: "SDG bank", type: "bank", currency: "SDG", openingBalance: "0" });
  saveStore(data);
  assert.equal((await call("/collections/exchangeRates", { date: "2026-01-01", fromCurrency: "USD", toCurrency: "SDG", rate: "600", rateSource: "central bank", status: "active" })).status, 201);
  assert.equal((await call("/collections/exchangeRates", { date: "2026-01-01", fromCurrency: "USD", toCurrency: "SDG", rate: "2000", rateSource: "market", status: "active" })).status, 201);
  assert.equal((await call("/collections/exchangeRates", { date: "2026-01-01", fromCurrency: "USD", toCurrency: "USD", rate: "1", rateSource: "manual", status: "active" })).status, 400);
  assert.equal((await call("/collections/exchangeRates", { date: "2026-01-01", fromCurrency: "USD", toCurrency: "SDG", rate: "-5", rateSource: "manual", status: "active" })).status, 400);
  assert.equal((await call("/workspace/finance/transactions", { accountId: "sdg-bank", type: "capital", direction: "in", amount: "60000.00", date: "2026-08-01", status: "paid", reference: "SDG-CAP", idempotencyKey: "sdg-capital-key" })).status, 201);
  const ledger = await (await call(`/workspace/finance/ledger?currency=SDG&reportIn=USD&company=${company.id}`)).json() as Row;
  assert.equal(ledger.currency, "USD");
  assert.equal(ledger.trialBalance.balanced, true);
  assert.equal(ledger.trialBalance.rows.find((r: Row) => r.code === "3000").closing, "-100.00"); // 60,000 SDG at the central bank rate of 600
});
