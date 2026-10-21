import type { StoreData } from "./storage.js";
/** Additive only: no cash movements are inferred from legacy paid flags. */
export function migrateFinance(data: StoreData) {
  let changed = false;
  for (const name of ["financeHistory"]) {
    if (!Array.isArray(data.collections[name])) { data.collections[name] = []; changed = true; }
  }
  return changed;
}
