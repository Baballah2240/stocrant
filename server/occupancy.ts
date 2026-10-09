import type { Person, Store, Zone, Occupancy, StoreSummary, ZoneOccupancy } from "./types.js";
import { getStore } from "./storage.js";

function countAssigned(storeId: string, zoneId?: string, status: Person["status"] = "active") {
  const data = getStore();
  const ids = new Set(
    data.people.filter((p) => p.storeId === storeId && p.status === status && (!zoneId || p.zoneId === zoneId)),
  );
  return ids.size;
}

function sumZoneCapacity(storeId: string, zoneId?: string) {
  const data = getStore();
  return data.zones
    .filter((z) => z.storeId === storeId && (!zoneId || z.id === zoneId))
    .reduce((sum, z) => sum + z.capacity, 0);
}

export function zoneUtilization(storeId: string, zoneId?: string): ZoneOccupancy[] {
  const data = getStore();
  const zones = zoneId
    ? data.zones.filter((z) => z.storeId === storeId && z.id === zoneId)
    : data.zones.filter((z) => z.storeId === storeId);

  if (zoneId) {
    const zone = zones[0];
    if (!zone) return [];
    const assigned = countAssigned(storeId, zoneId);
    const pct = Math.round((assigned / zone.capacity) * 100);
    return [
      {
        zoneId: zone.id,
        zoneName: zone.name,
        capacity: zone.capacity,
        assigned,
        pct: pct > 100 ? 100 : pct,
        over: assigned > zone.capacity,
      },
    ];
  }

  return zones.map((z) => {
    const assigned = countAssigned(storeId, z.id);
    const pct = Math.round((assigned / z.capacity) * 100);
    return {
      zoneId: z.id,
      zoneName: z.name,
      capacity: z.capacity,
      assigned,
      pct: pct > 100 ? 100 : pct,
      over: assigned > z.capacity,
    };
  });
}

export function occupancy(storeId: string): Occupancy {
  const data = getStore();
  const store = data.stores.find((s) => s.id === storeId);
  if (!store) throw new ReferenceError(`Store not found: ${storeId}`);

  const capacity = sumZoneCapacity(storeId);
  const headCount = countAssigned(storeId);
  const remaining = capacity - headCount;
  const occupancyPct = capacity === 0 ? 0 : Math.round((headCount / capacity) * 100);
  const overCapacity = headCount > capacity;

  // Zone-level detail (skip over 100% for display-friendly range)
  const zoneUtilizationRows = zoneUtilization(storeId).map((z) => ({
    ...z,
    pct: Math.min(z.pct, 100),
  }));

  return {
    storeId,
    storeName: store.name,
    headCount,
    capacity,
    remaining,
    occupancyPct,
    overCapacity,
    zoneUtilization: zoneUtilizationRows,
  };
}

/**
 * Occupancy for a store computed from a simulated current headcount.
 * Used by the occupancy calculator to estimate how a given headCount
 * would translate into occupancy percentage and over-capacity status.
 */
export function simulatedOccupancy(storeId: string, headCount: number): Occupancy {
  const data = getStore();
  const store = data.stores.find((s) => s.id === storeId);
  if (!store) throw new ReferenceError(`Store not found: ${storeId}`);

  const capacity = sumZoneCapacity(storeId);
  const head = Math.max(0, headCount);
  const remaining = capacity - head;
  const occupancyPct = capacity === 0 ? 0 : Math.round((head / capacity) * 100);
  const overCapacity = head > capacity;

  const zoneUtilizationRows = zoneUtilization(storeId).map((z) => ({
    ...z,
    pct: Math.min(z.pct, 100),
  }));

  return {
    storeId,
    storeName: store.name,
    headCount: head,
    capacity,
    remaining,
    occupancyPct,
    overCapacity,
    zoneUtilization: zoneUtilizationRows,
  };
}

/** Summary row for every store, useful for the dashboard. */
export function storeSummaries(): StoreSummary[] {
  const data = getStore();
  return data.stores.map((store) => {
    const headCount = countAssigned(store.id);
    const capacity = sumZoneCapacity(store.id);
    const remaining = capacity - headCount;
    const occupancyPct = capacity === 0 ? 0 : Math.round((headCount / capacity) * 100);
    return {
      storeId: store.id,
      storeName: store.name,
      floorCount: store.floorCount,
      totalArea: store.totalArea,
      headCount,
      capacity,
      occupancyPct,
      remaining,
      overCapacity: headCount > capacity,
    };
  });
}
