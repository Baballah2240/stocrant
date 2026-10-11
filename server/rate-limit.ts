/**
 * Small in-memory failed-attempt tracker for sign-in brute-force protection.
 * Single-instance scope matches the JSON-file single-process deployment; swap
 * for a shared store before running multiple replicas.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const MAX_KEYS = 10_000;

const failures = new Map<string, number[]>();

function prune(list: number[], now: number): number[] {
  return list.filter((startedAt) => now - startedAt < WINDOW_MS);
}

export function recordFailure(key: string): void {
  const now = Date.now();
  if (failures.size >= MAX_KEYS && !failures.has(key)) {
    // Bound memory: drop the oldest quarter of keys.
    const oldestFirst = [...failures.entries()].sort((a, b) => (a[1][0] ?? 0) - (b[1][0] ?? 0));
    for (const [staleKey] of oldestFirst.slice(0, Math.floor(MAX_KEYS / 4))) failures.delete(staleKey);
  }
  const list = prune(failures.get(key) ?? [], now);
  list.push(now);
  failures.set(key, list);
}

/** Seconds until the key may try again; 0 when not blocked. */
export function blockedFor(key: string): number {
  const list = prune(failures.get(key) ?? [], Date.now());
  if (list.length < MAX_FAILURES) return 0;
  return Math.max(1, Math.ceil((list[0] + WINDOW_MS - Date.now()) / 1000));
}

export function clearFailures(key: string): void {
  failures.delete(key);
}

/** Test-only: empties every counter so suites starting from one IP do not
 * leak a lockout into later tests. Not reachable over HTTP. */
export function resetFailures(): void {
  failures.clear();
}
