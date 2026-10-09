import { useEffect, useState } from "react";
import { api, type Store, type Zone } from "../api";
import { classNames } from "../util";

interface StoreSummary extends Store {
  peopleCount: number;
  zoneCount: number;
}

export default function ReportView() {
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [{ stores: list }, { zones: zoneList }] = await Promise.all([api.stores.list(), api.zones.list()]);
        const storeSummary = list.map((s) => {
          const storeZones = zoneList.filter((z) => z.storeId === s.id);
          const peopleCount = s.occupancy?.headCount ?? 0;
          return { ...s, peopleCount, zoneCount: storeZones.length };
        });
        setStores(storeSummary);
        setZones(zoneList);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load report");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const groupedZones = stores.map((store) => ({
    store,
    zones: zones.filter((z) => z.storeId === store.id),
  })).filter((g) => g.zones.length > 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Occupancy Report</h1>
          <p className="hint">A snapshot of every location, its people, and zone-level detail.</p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="hint">Loading report&hellip;</p>
      ) : stores.length === 0 ? (
        <p className="empty">No stores to report on yet.</p>
      ) : (
        <div className="report">
          {groupedZones.map(({ store, zones: storeZones }) => (
            <section className="card report-card" key={store.id}>
              <div className="report-head">
                <h2>{store.name}</h2>
                <span className={classNames("badge", badgeClass(store.status))}>{store.status.replace("-", " ")}</span>
              </div>
              <div className="grid-2">
                <div className="stat"><span className="stat-value">{store.peopleCount}</span><span className="stat-label">People</span></div>
                <div className="stat"><span className="stat-value">{store.occupancy?.occupancyPct ?? 0}%</span><span className="stat-label">Occupancy</span></div>
                <div className="stat"><span className="stat-value">{store.occupancy?.capacity ?? 0}</span><span className="stat-label">Capacity</span></div>
                <div className="stat"><span className="stat-value">{storeZones.length}</span><span className="stat-label">Zones</span></div>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Zone</th>
                      <th className="num">Occupancy</th>
                      <th className="num">Assigned / Capacity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(store.occupancy?.zoneUtilization ?? []).map((z) => (
                      <tr key={z.zoneId}>
                        <td>{z.zoneName}</td>
                        <td className="num">{z.pct}%</td>
                        <td className="num">{z.assigned} / {z.capacity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function badgeClass(status: string): string {
  if (status === "open") return "badge--open";
  if (status === "open-limited") return "badge--open-limited";
  return "badge--closed";
}
