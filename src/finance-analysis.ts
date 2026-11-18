import { decimal, minor } from './money.ts';

type Row = { [key: string]: unknown };
export const agingBuckets = ['0-30', '31-60', '61-90', '90+'] as const;
export type AgingBucket = typeof agingBuckets[number];

function daysBetween(from: string, to: string) {
  const start = Date.parse(from + 'T00:00:00Z'), end = Date.parse(to + 'T00:00:00Z');
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.floor((end - start) / 86_400_000)) : 0;
}
export function agingBucket(date: unknown, today: string): AgingBucket {
  const days = daysBetween(String(date || today).slice(0, 10), today);
  return days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
}

/** Aged receivables (sales) or payables (purchases, expenses, returns) grouped by partner, like an accounting aged balance report. */
export function agedBalances(sources: Row[], currency: string, kind: 'receivable' | 'payable', today: string) {
  const partners = new Map<string, { party: string; buckets: Record<AgingBucket, bigint>; total: bigint; documents: number; oldest: string }>();
  const totals = Object.fromEntries(agingBuckets.map(bucket => [bucket, 0n])) as Record<AgingBucket, bigint>;
  let total = 0n;
  for (const source of sources) {
    if (source.currency !== currency || source.payrollManaged || source.outstanding == null) continue;
    if ((kind === 'receivable') !== (source.collection === 'sales')) continue;
    const amount = minor(source.outstanding, currency);
    if (amount <= 0n) continue;
    const party = String(source.party || '').trim() || 'Unnamed partner', bucket = agingBucket(source.date, today), date = String(source.date || '');
    const entry = partners.get(party) || { party, buckets: Object.fromEntries(agingBuckets.map(b => [b, 0n])) as Record<AgingBucket, bigint>, total: 0n, documents: 0, oldest: date };
    entry.buckets[bucket] += amount; entry.total += amount; entry.documents += 1;
    if (date && (!entry.oldest || date < entry.oldest)) entry.oldest = date;
    partners.set(party, entry); totals[bucket] += amount; total += amount;
  }
  const money = (value: bigint) => decimal(value, currency);
  return {
    rows: [...partners.values()].sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : a.party.localeCompare(b.party)))
      .map(row => ({ party: row.party, documents: row.documents, oldest: row.oldest, total: money(row.total), buckets: Object.fromEntries(agingBuckets.map(b => [b, money(row.buckets[b])])) as Record<AgingBucket, string> })),
    totals: Object.fromEntries(agingBuckets.map(b => [b, money(totals[b])])) as Record<AgingBucket, string>,
    total: money(total),
  };
}

/** Paid money in and out per partner (person, employee or business) for the filtered movements. */
export function partnerLedger(transactions: Row[], currency: string, nameOf: (row: Row) => string) {
  const partners = new Map<string, { incoming: bigint; outgoing: bigint; count: number; last: string }>();
  for (const row of transactions) {
    if (row.status !== 'paid' || row.type === 'transfer' || (row.currency && row.currency !== currency)) continue;
    const name = nameOf(row) || 'Company', entry = partners.get(name) || { incoming: 0n, outgoing: 0n, count: 0, last: '' }, amount = minor(row.amount, currency);
    if (row.direction === 'in') entry.incoming += amount; else entry.outgoing += amount;
    entry.count += 1; if (String(row.date || '') > entry.last) entry.last = String(row.date);
    partners.set(name, entry);
  }
  return [...partners].map(([party, v]) => ({ party, count: v.count, last: v.last, incoming: decimal(v.incoming, currency), outgoing: decimal(v.outgoing, currency), net: decimal(v.incoming - v.outgoing, currency), weight: v.incoming + v.outgoing }))
    .sort((a, b) => (b.weight > a.weight ? 1 : b.weight < a.weight ? -1 : a.party.localeCompare(b.party))).map(({ weight: _weight, ...row }) => row);
}

/** Paid outgoing spend grouped by category (falling back to movement type), with each share of the total. */
export function spendByCategory(transactions: Row[], currency: string) {
  const groups = new Map<string, bigint>(); let total = 0n;
  for (const row of transactions) {
    if (row.status !== 'paid' || row.direction !== 'out' || row.type === 'transfer' || (row.currency && row.currency !== currency)) continue;
    const key = String(row.category || '').trim() || String(row.type || 'other'), amount = minor(row.amount, currency);
    groups.set(key, (groups.get(key) ?? 0n) + amount); total += amount;
  }
  return { total: decimal(total, currency), rows: [...groups].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : a[0].localeCompare(b[0])))
    .map(([category, amount]) => ({ category, amount: decimal(amount, currency), share: total ? Number(amount * 10000n / total) / 100 : 0 })) };
}

/** Per-account journal summary for the filtered period: money in, money out, count and last movement. */
export function journalActivity(accountId: unknown, transactions: Row[], currency: string) {
  let incoming = 0n, outgoing = 0n, count = 0, pending = 0, last = '';
  for (const row of transactions) {
    if (row.accountId !== accountId) continue;
    if (row.status === 'pending' || row.status === 'draft') { pending += 1; continue; }
    if (row.status !== 'paid') continue;
    const amount = minor(row.amount, currency);
    if (row.direction === 'in') incoming += amount; else outgoing += amount;
    count += 1; if (String(row.date || '') > last) last = String(row.date);
  }
  return { incoming: decimal(incoming, currency), outgoing: decimal(outgoing, currency), count, pending, last };
}
