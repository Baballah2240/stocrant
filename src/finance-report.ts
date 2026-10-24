import { decimal, minor } from './money.ts';

type Movement = { [key: string]: unknown };
/** Cash-basis operating result, separate from financing and balance transfers. */
export function financeResult(rows: Movement[], currency: string) {
  let revenue = 0n, purchases = 0n, expenses = 0n, payroll = 0n, cash = 0n, excluded = 0n;
  for (const row of rows) {
    if (row.status !== 'paid' || row.currency && row.currency !== currency) continue;
    const signed = (row.direction === 'in' ? 1n : -1n) * minor(row.amount, currency);
    cash += signed;
    if (row.type === 'income') revenue += signed;
    else if (row.type === 'refund' && row.sourceCollection === 'returns') revenue += signed;
    else if (row.type === 'payroll') payroll -= signed;
    else if (row.type === 'expense' && row.sourceCollection === 'purchases') purchases -= signed;
    else if (['expense', 'reimbursement', 'tax'].includes(String(row.type))) expenses -= signed;
    else excluded += signed;
  }
  return Object.fromEntries(Object.entries({ revenue, purchases, expenses, payroll, profit: revenue - purchases - expenses - payroll, cash, excluded }).map(([key, value]) => [key, decimal(value, currency)])) as Record<'revenue'|'purchases'|'expenses'|'payroll'|'profit'|'cash'|'excluded', string>;
}
