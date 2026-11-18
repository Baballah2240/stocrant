/**
 * Multi-currency reporting. Journal entries in other currencies are translated into a reporting currency at
 * the rate on each entry's date; money balances (cash, receivables, payables, loans, VAT, provisions) are then
 * revalued at the closing rate and the difference is posted as an unrealised exchange gain or loss, so the
 * translated books still balance. Pure module: no storage access.
 */
import type { JournalEntry } from "./general-ledger.js";
type Row = { [key: string]: any };
const RATE_SCALE = 10n ** 12n;
const digitsFor = (currency: string) => ["KWD", "BHD", "OMR"].includes(currency) ? 3 : ["JPY", "KRW"].includes(currency) ? 0 : 2;
/** Accounts whose balances are amounts of money and so are revalued at the closing rate. */
export const MONETARY_ACCOUNTS = ["1000", "1090", "1100", "1200", "1400", "1600", "2000", "2100", "2200", "2300", "2400"];

/** Exact decimal rate → scaled integer (12 decimals). */
export function scaledRate(value: unknown): bigint | null {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > 12) return null;
  const rate = BigInt(whole) * RATE_SCALE + BigInt((fraction + "0".repeat(12)).slice(0, 12) || "0");
  return rate > 0n ? rate : null;
}

/** Rate for 1 unit of `from` in `to` on `date`: the latest rate on or before the date, direct or inverted. */
export function rateOn(rates: Row[], from: string, to: string, date: string): bigint | null {
  if (from === to) return RATE_SCALE;
  let best: { date: string; rate: bigint } | null = null;
  for (const row of rates) {
    const rowDate = String(row.date || "").slice(0, 10);
    if (!rowDate || rowDate > date || row.status === "inactive") continue;
    const value = scaledRate(row.rate);
    if (value === null) continue;
    let rate: bigint | null = null;
    if (row.fromCurrency === from && row.toCurrency === to) rate = value;
    else if (row.fromCurrency === to && row.toCurrency === from) rate = RATE_SCALE * RATE_SCALE / value;
    if (rate !== null && (!best || rowDate >= best.date)) best = { date: rowDate, rate };
  }
  return best?.rate ?? null;
}

/** Convert minor units of one currency into minor units of another, rounding half away from zero. */
export function convertUnits(units: bigint, from: string, to: string, rate: bigint): bigint {
  const numerator = units * rate * 10n ** BigInt(digitsFor(to)), denominator = RATE_SCALE * 10n ** BigInt(digitsFor(from));
  const quotient = numerator / denominator, remainder = numerator % denominator;
  const half = (remainder < 0n ? -remainder : remainder) * 2n >= denominator;
  return half ? quotient + (numerator < 0n ? -1n : 1n) : quotient;
}

/** Translate journal entries into `reporting`, revalue money balances at `asOf`, and report missing rates. */
export function translateJournal(entries: JournalEntry[], rates: Row[], reporting: string, asOf: string) {
  const out: JournalEntry[] = [], missing = new Map<string, string>();
  const originalBalances = new Map<string, bigint>(), translatedBalances = new Map<string, bigint>();
  for (const entry of entries) {
    if (entry.date > asOf) continue;
    if (entry.currency === reporting) { out.push(entry); continue; }
    const rate = rateOn(rates, entry.currency, reporting, entry.date);
    if (rate === null) { const key = `${entry.currency}→${reporting}`; if (!missing.has(key) || entry.date < missing.get(key)!) missing.set(key, entry.date); continue; }
    const lines = entry.lines.map(line => ({ account: line.account, debit: convertUnits(line.debit, entry.currency, reporting, rate), credit: convertUnits(line.credit, entry.currency, reporting, rate) }));
    // Keep the translated entry balanced despite rounding: adjust the largest line.
    const difference = lines.reduce((n, l) => n + l.debit - l.credit, 0n);
    if (difference !== 0n) { const target = lines.reduce((a, b) => (a.debit + a.credit >= b.debit + b.credit ? a : b)); if (target.debit > 0n) target.debit -= difference; else target.credit += difference; }
    out.push({ ...entry, id: `${entry.id}@${reporting}`, currency: reporting, memo: `${entry.memo} (${entry.currency})`, lines });
    for (const [index, line] of entry.lines.entries()) {
      if (!MONETARY_ACCOUNTS.includes(line.account)) continue;
      const key = `${entry.organizationId}|${entry.currency}|${line.account}`;
      originalBalances.set(key, (originalBalances.get(key) ?? 0n) + line.debit - line.credit);
      translatedBalances.set(key, (translatedBalances.get(key) ?? 0n) + lines[index].debit - lines[index].credit);
    }
  }
  // Closing-rate revaluation of money balances held in other currencies.
  const revaluations = new Map<string, { organizationId: string; currency: string; lines: { account: string; debit: bigint; credit: bigint }[] }>();
  for (const [key, original] of originalBalances) {
    const [organizationId, currency, account] = key.split("|"), closing = rateOn(rates, currency, reporting, asOf);
    if (closing === null) continue;
    const delta = convertUnits(original, currency, reporting, closing) - (translatedBalances.get(key) ?? 0n);
    if (delta === 0n) continue;
    const group = revaluations.get(organizationId + "|" + currency) || { organizationId, currency, lines: [] };
    group.lines.push(delta > 0n ? { account, debit: delta, credit: 0n } : { account, debit: 0n, credit: -delta });
    revaluations.set(organizationId + "|" + currency, group);
  }
  for (const [key, group] of revaluations) {
    const net = group.lines.reduce((n, l) => n + l.debit - l.credit, 0n);
    if (net !== 0n) group.lines.push(net > 0n ? { account: "4700", debit: 0n, credit: net } : { account: "6700", debit: -net, credit: 0n });
    out.push({ id: `fx:${key}:${asOf}`, date: asOf, organizationId: group.organizationId, currency: reporting, memo: `Exchange revaluation of ${group.currency} balances at the closing rate`, source: "exchangeRates", sourceId: "", lines: group.lines });
  }
  return { entries: out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)), missingRates: [...missing].map(([pair, from]) => ({ pair, from })) };
}
