import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agedBalances, agingBucket, journalActivity, partnerLedger, spendByCategory } from '../src/finance-analysis.ts';

test('aging buckets follow document age in days', () => {
  assert.equal(agingBucket('2026-11-18', '2026-11-18'), '0-30');
  assert.equal(agingBucket('2026-10-18', '2026-11-18'), '31-60');
  assert.equal(agingBucket('2026-09-10', '2026-11-18'), '61-90');
  assert.equal(agingBucket('2026-01-01', '2026-11-18'), '90+');
});

test('aged balances split receivables and payables by partner, excluding payroll and other currencies', () => {
  const sources = [
    { collection: 'sales', party: 'Acme', currency: 'SAR', outstanding: '100.50', date: '2026-11-10' },
    { collection: 'sales', party: 'Acme', currency: 'SAR', outstanding: '20.00', date: '2026-06-01' },
    { collection: 'sales', party: 'Beta', currency: 'SAR', outstanding: '0.00', date: '2026-11-10' },
    { collection: 'sales', party: 'Gamma', currency: 'USD', outstanding: '50', date: '2026-11-10' },
    { collection: 'purchases', party: 'Supplier', currency: 'SAR', outstanding: '75', date: '2026-10-01' },
    { collection: 'expenses', party: '', currency: 'SAR', outstanding: '5', date: '2026-11-01', payrollManaged: true },
  ];
  const receivable = agedBalances(sources, 'SAR', 'receivable', '2026-11-18');
  assert.equal(receivable.total, '120.50');
  assert.equal(receivable.rows.length, 1);
  assert.deepEqual(receivable.rows[0].buckets, { '0-30': '100.50', '31-60': '0.00', '61-90': '0.00', '90+': '20.00' });
  assert.equal(receivable.rows[0].oldest, '2026-06-01');
  const payable = agedBalances(sources, 'SAR', 'payable', '2026-11-18');
  assert.equal(payable.total, '75.00');
  assert.equal(payable.totals['31-60'], '75.00');
});

test('partner ledger, category spend and journal activity use paid movements only', () => {
  const rows = [
    { accountId: 'a', status: 'paid', direction: 'in', amount: '10', type: 'income', personName: 'Acme', date: '2026-11-01', category: '' },
    { accountId: 'a', status: 'paid', direction: 'out', amount: '3', type: 'expense', personName: 'Acme', date: '2026-11-02', category: 'Rent' },
    { accountId: 'a', status: 'paid', direction: 'out', amount: '1', type: 'expense', date: '2026-11-03', category: '' },
    { accountId: 'a', status: 'pending', direction: 'out', amount: '99', type: 'expense' },
    { accountId: 'a', status: 'paid', direction: 'out', amount: '50', type: 'transfer' },
  ];
  const ledger = partnerLedger(rows, 'SAR', row => String(row.personName || ''));
  assert.deepEqual(ledger[0], { party: 'Acme', count: 2, last: '2026-11-02', incoming: '10.00', outgoing: '3.00', net: '7.00' });
  const spend = spendByCategory(rows, 'SAR');
  assert.equal(spend.total, '4.00');
  assert.deepEqual(spend.rows.map(r => [r.category, r.share]), [['Rent', 75], ['expense', 25]]);
  const journal = journalActivity('a', rows, 'SAR');
  assert.deepEqual(journal, { incoming: '10.00', outgoing: '54.00', count: 4, pending: 1, last: '2026-11-03' });
});
