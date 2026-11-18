import { decimal, minor } from './money.ts';
import { financeResult } from './finance-report.ts';

type Row = { [key: string]: unknown };
const DAY = 86_400_000;
const time = (date: unknown) => { const value = Date.parse(String(date || '').slice(0, 10) + 'T00:00:00Z'); return Number.isFinite(value) ? value : NaN; };
const sum = (values: bigint[]) => values.reduce((total, value) => total + value, 0n);

/** Straight-line depreciation accumulated from the purchase date up to (and including) `asOf`, in minor units. */
export function accumulatedDepreciation(asset: Row, currency: string, asOf: string): bigint {
  const cost = minor(asset.cost || 0, currency), salvage = minor(asset.salvageValue || 0, currency), years = Number(asset.usefulLifeYears);
  const start = time(asset.purchaseDate), end = time(asOf);
  if (!(years > 0) || !Number.isFinite(start) || !Number.isFinite(end) || end < start || cost <= salvage) return 0n;
  const depreciable = cost - salvage, lifeDays = BigInt(Math.round(years * 365)), days = BigInt(Math.floor((end - start) / DAY) + 1);
  return days >= lifeDays ? depreciable : depreciable * days / lifeDays;
}

/** Fixed-asset register line: annual charge, accumulated depreciation and net book value. */
export function assetValuation(asset: Row, currency: string, asOf: string, periodStart = '') {
  const cost = minor(asset.cost || 0, currency), salvage = minor(asset.salvageValue || 0, currency), years = Number(asset.usefulLifeYears);
  const annual = years > 0 && cost > salvage ? (cost - salvage) * 100n / BigInt(Math.round(years * 100)) : 0n;
  const accumulated = accumulatedDepreciation(asset, currency, asOf);
  const before = periodStart ? accumulatedDepreciation(asset, currency, new Date(time(periodStart) - DAY).toISOString().slice(0, 10)) : 0n;
  const disposed = asset.status === 'disposed';
  return { cost, annual, accumulated, period: accumulated - before, bookValue: disposed ? 0n : cost - accumulated, fullyDepreciated: cost > salvage && accumulated >= cost - salvage, disposed };
}

const paid = (row: Row, currency: string) => row.status === 'paid' && (!row.currency || row.currency === currency);
const signed = (row: Row, currency: string) => (row.direction === 'in' ? 1n : -1n) * minor(row.amount, currency);

/**
 * Statement of financial position. Assets = Liabilities + Equity, where the accumulated surplus/deficit is
 * what remains after capital: everything the business has earned or lost to date, including opening balances.
 */
export function balanceSheet(input: { accounts: Row[]; sources: Row[]; obligations: Row[]; transactions: Row[]; assets: Row[]; currency: string; asOf: string }) {
  const { currency, asOf } = input;
  const moves = input.transactions.filter(row => paid(row, currency) && String(row.date || '') <= asOf);
  const cash = sum(input.accounts.filter(a => a.currency === currency && a.balance != null).map(a => minor(a.balance, currency)));
  const outstanding = (filter: (row: Row) => boolean) => sum(input.sources.filter(s => s.currency === currency && !s.payrollManaged && s.outstanding != null && filter(s)).map(s => { const value = minor(s.outstanding, currency); return value > 0n ? value : 0n; }));
  const receivables = outstanding(s => s.collection === 'sales');
  const payables = outstanding(s => s.collection !== 'sales');
  const employeeAdvances = sum(moves.filter(row => row.employeeId && (['advance', 'loan'].includes(String(row.type)) && row.direction === 'out' || row.type === 'repayment' && row.direction === 'in')).map(row => -signed(row, currency)));
  const valuations = input.assets.filter(a => (a.currency || currency) === currency && String(a.purchaseDate || '') <= asOf).map(a => assetValuation(a, currency, asOf));
  const fixedCost = sum(valuations.filter(v => !v.disposed).map(v => v.cost)), depreciation = sum(valuations.filter(v => !v.disposed).map(v => v.accumulated));
  const payroll = sum(input.obligations.filter(o => o.currency === currency).map(o => minor(o.payroll || 0, currency)));
  const loans = sum(moves.filter(row => !row.employeeId && (row.type === 'loan' || row.type === 'repayment')).map(row => signed(row, currency)));
  const capital = sum(moves.filter(row => row.type === 'capital').map(row => signed(row, currency)));
  const assets = { cash, receivables, employeeAdvances: employeeAdvances > 0n ? employeeAdvances : 0n, fixedCost, depreciation, fixedNet: fixedCost - depreciation };
  const totalAssets = assets.cash + assets.receivables + assets.employeeAdvances + assets.fixedNet;
  const liabilities = { payables, payroll, loans: loans > 0n ? loans : 0n };
  const totalLiabilities = liabilities.payables + liabilities.payroll + liabilities.loans;
  const surplus = totalAssets - totalLiabilities - capital;
  const money = (value: bigint) => decimal(value, currency);
  return {
    assets: Object.fromEntries(Object.entries(assets).map(([k, v]) => [k, money(v)])) as Record<keyof typeof assets, string>, totalAssets: money(totalAssets),
    liabilities: Object.fromEntries(Object.entries(liabilities).map(([k, v]) => [k, money(v)])) as Record<keyof typeof liabilities, string>, totalLiabilities: money(totalLiabilities),
    equity: { capital: money(capital), surplus: money(surplus) }, totalEquity: money(capital + surplus), totalLiabilitiesAndEquity: money(totalLiabilities + capital + surplus),
  };
}

/** Income statement for the filtered movements: cash-basis operating result less depreciation for the same period. */
export function incomeStatement(transactions: Row[], assets: Row[], currency: string, periodStart: string, periodEnd: string) {
  const result = financeResult(transactions, currency);
  const depreciation = sum(assets.filter(a => (a.currency || currency) === currency && a.status !== 'disposed').map(a => assetValuation(a, currency, periodEnd, periodStart).period));
  const operating = minor(result.profit, currency);
  return { revenue: result.revenue, purchases: result.purchases, expenses: result.expenses, payroll: result.payroll, operating: result.profit, depreciation: decimal(depreciation, currency), surplus: decimal(operating - depreciation, currency) };
}

/** Outstanding financial custody per employee and company from the HR custody register. */
export function custodySummary(rows: Row[]) {
  const people = new Map<string, { employee: string; organizationId: string; items: number; open: number; value: number; settled: number }>();
  for (const row of rows) {
    if (['returned', 'settled'].includes(String(row.status))) continue;
    const key = `${row.organizationId || ''}|${String(row.employee || '').trim()}`;
    const entry = people.get(key) || { employee: String(row.employee || '').trim() || 'Unassigned', organizationId: String(row.organizationId || ''), items: 0, open: 0, value: 0, settled: 0 };
    entry.items += 1; if (row.status !== 'partially settled') entry.open += 1;
    entry.value += Number(row.value || 0); entry.settled += Number(row.settledAmount || 0);
    people.set(key, entry);
  }
  return [...people.values()].map(row => ({ ...row, outstanding: Math.max(0, Math.round((row.value - row.settled) * 1000) / 1000) })).sort((a, b) => b.outstanding - a.outstanding || a.employee.localeCompare(b.employee));
}
