import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accumulatedDepreciation, assetValuation, balanceSheet, custodySummary, incomeStatement } from '../src/finance-statements.ts';

const machine = { cost: '10000', salvageValue: '1000', usefulLifeYears: 5, purchaseDate: '2026-01-01', status: 'in use' };

test('straight-line depreciation accrues daily and stops at cost less salvage', () => {
  assert.equal(accumulatedDepreciation(machine, 'SAR', '2025-12-31'), 0n);
  const oneYear = assetValuation(machine, 'SAR', '2026-12-31');
  assert.equal(oneYear.annual, 180000n); // 1,800.00 a year
  assert.ok(oneYear.accumulated >= 179900n && oneYear.accumulated <= 180100n);
  assert.equal(accumulatedDepreciation(machine, 'SAR', '2040-01-01'), 900000n);
  assert.equal(assetValuation(machine, 'SAR', '2040-01-01').fullyDepreciated, true);
  assert.equal(assetValuation({ ...machine, status: 'disposed' }, 'SAR', '2027-01-01').bookValue, 0n);
  const period = assetValuation(machine, 'SAR', '2027-12-31', '2027-01-01').period;
  assert.ok(period >= 179500n && period <= 180500n);
});

test('balance sheet balances and classifies capital, loans, advances and fixed assets', () => {
  const tx = (type, direction, amount, extra = {}) => ({ type, direction, amount, status: 'paid', currency: 'SAR', date: '2026-02-01', ...extra });
  const sheet = balanceSheet({
    currency: 'SAR', asOf: '2026-12-31',
    accounts: [{ currency: 'SAR', balance: '50000.00' }],
    sources: [{ collection: 'sales', currency: 'SAR', outstanding: '2000' }, { collection: 'purchases', currency: 'SAR', outstanding: '1500' }, { collection: 'expenses', currency: 'SAR', outstanding: '99', payrollManaged: true }],
    obligations: [{ currency: 'SAR', payroll: '700' }],
    transactions: [tx('capital', 'in', '60000'), tx('loan', 'in', '10000'), tx('repayment', 'out', '2000'), tx('advance', 'out', '300', { employeeId: 'e1' }), tx('repayment', 'in', '100', { employeeId: 'e1' }), tx('capital', 'in', '5', { status: 'pending' })],
    assets: [machine],
  });
  assert.equal(sheet.assets.receivables, '2000.00');
  assert.equal(sheet.assets.employeeAdvances, '200.00');
  assert.equal(sheet.assets.fixedCost, '10000.00');
  assert.equal(sheet.liabilities.payables, '1500.00');
  assert.equal(sheet.liabilities.payroll, '700.00');
  assert.equal(sheet.liabilities.loans, '8000.00');
  assert.equal(sheet.equity.capital, '60000.00');
  assert.equal(sheet.totalAssets, sheet.totalLiabilitiesAndEquity);
});

test('income statement subtracts period depreciation; capital and asset purchases are not expenses', () => {
  const rows = [
    { type: 'income', direction: 'in', amount: '5000', status: 'paid', currency: 'SAR' },
    { type: 'expense', direction: 'out', amount: '1000', status: 'paid', currency: 'SAR' },
    { type: 'capital', direction: 'in', amount: '90000', status: 'paid', currency: 'SAR' },
    { type: 'asset', direction: 'out', amount: '10000', status: 'paid', currency: 'SAR' },
  ];
  const report = incomeStatement(rows, [machine], 'SAR', '2026-01-01', '2026-12-31');
  assert.equal(report.operating, '4000.00');
  assert.ok(Number(report.depreciation) > 1790 && Number(report.depreciation) < 1810);
  assert.equal(Number(report.surplus), 4000 - Number(report.depreciation));
});

test('custody summary groups outstanding items per employee and ignores settled ones', () => {
  const rows = custodySummary([
    { employee: 'Ali', organizationId: 'c1', value: '500', settledAmount: '200', status: 'partially settled' },
    { employee: 'Ali', organizationId: 'c1', value: '3000', status: 'open' },
    { employee: 'Sara', organizationId: 'c1', value: '100', status: 'settled' },
  ]);
  assert.deepEqual(rows.map(r => [r.employee, r.items, r.outstanding]), [['Ali', 2, 3300]]);
});

import { salaryBasis, salaryWindowStart } from '../server/salary-basis.ts';
test('salary counting basis: period start, assignment date or day after last salary paid', () => {
  const base = { periodStart: '2026-11-01', periodEnd: '2026-11-30' };
  assert.equal(salaryBasis({}), 'from payroll period start');
  assert.equal(salaryBasis({ salaryCountingBasis: 'bogus' }), 'from payroll period start');
  // Period start: hired before the period → counted from the period start; hired inside → from hire date.
  assert.equal(salaryWindowStart({ ...base, basis: 'from payroll period start', hireDate: '2026-09-10' }), '2026-11-01');
  assert.equal(salaryWindowStart({ ...base, basis: 'from payroll period start', hireDate: '2026-11-12' }), '2026-11-12');
  // Assignment date: first salary goes back to the assignment date; later salaries use the period start.
  assert.equal(salaryWindowStart({ ...base, basis: 'from assignment date', hireDate: '2026-10-15' }), '2026-10-15');
  assert.equal(salaryWindowStart({ ...base, basis: 'from assignment date', hireDate: '2026-10-15', lastPaidEnd: '2026-10-31' }), '2026-11-01');
  // Last salary paid: continue the day after the last counted period, including unpaid gaps.
  assert.equal(salaryWindowStart({ ...base, basis: 'from last salary paid', hireDate: '2026-01-01', lastPaidEnd: '2026-09-30' }), '2026-10-01');
  assert.equal(salaryWindowStart({ ...base, basis: 'from last salary paid', hireDate: '2026-01-01', lastPaidEnd: '2026-11-10' }), '2026-11-11');
  assert.equal(salaryWindowStart({ ...base, basis: 'from last salary paid', hireDate: '2026-10-20' }), '2026-10-20');
  assert.throws(() => salaryWindowStart({ ...base, basis: 'from last salary paid', lastPaidEnd: '2026-11-30' }), /already counted through 2026-11-30/);
  assert.throws(() => salaryWindowStart({ ...base, basis: 'from last salary paid', hireDate: '2024-01-01' }), /longer than 400 days/);
});
