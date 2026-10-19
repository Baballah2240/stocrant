import { useLanguage } from "../language-context";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type StoreSummary } from "../api";
import { classNames, truncated } from "../util";
import { palette } from "../theme";

interface DashboardProps {
  storeSummaries?: StoreSummary[];
}

export default function Dashboard({ storeSummaries: initialSummaries }: DashboardProps) {
  const { t } = useLanguage();
  const [summaries, setSummaries] = useState<StoreSummary[]>(initialSummaries ?? []);
  const [loading, setLoading] = useState(!initialSummaries);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    api.occupancy
      .list()
      .then(({ stores }) => {
        if (active) setSummaries(stores);
      })
      .catch(() => {
        if (active) setSummaries([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const totalLocations = summaries.length;
  const totalPeople = summaries.reduce((acc, s) => acc + s.headCount, 0);
  const totalCapacity = summaries.reduce((acc, s) => acc + s.capacity, 0);
  const overallPct = totalCapacity
    ? Math.round((totalPeople / totalCapacity) * 100)
    : 0;

  const over = summaries.filter((s) => s.overCapacity).length;

  return (
    <div className="dashboard">
      <div className="grid grid--2">
        <section className="card">
          <h2 className="visually-hidden">{t("Occupancy summary")}</h2>
          <div className="stats">
            <Stat label={t("Locations")} value={String(totalLocations)} />
            <Stat label={t("Assigned people")} value={String(totalPeople)} />
            <Stat label={t("Capacity")} value={formatCount(totalCapacity)} />
            <Stat label={t("Overall occupancy")} value={`${overallPct}%`} tone={overallPct >= 90 ? "danger" : overallPct >= 70 ? "warning" : "success"} />
          </div>
          <p className="hint">
            {over}  {t("of")} {totalLocations}  {t("location")}{description(totalLocations)}  {t("currently over capacity.")} </p>
        </section>

        <section className="card">
          <h2 className="visually-hidden">{t("Locations table")}</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("Location")}</th>
                  <th>{t("People")}</th>
                  <th>{t("Capacity")}</th>
                  <th>{t("Occupancy")}</th>
                  <th>{t("Remaining")}</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={s.storeId}>
                    <td>
                      <button className="link-row" onClick={() => navigate("/locations")}>
                        {truncated(s.storeName, 30)}
                        <span className="row-detail">{t("See details")}</span>
                      </button>
                    </td>
                    <td className="num">{s.headCount}</td>
                    <td className="num">{formatCount(s.capacity)}</td>
                    <td className="num">
                      <OccupancyBar pct={s.occupancyPct} /> {s.occupancyPct}%
                    </td>
                    <td className="num">{formatCount(s.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {loading && <p className="hint">{t("Loading occupancy data…")}</p>}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" | "danger" }) {
  return (
    <div className="stat">
      <label>{label}</label>
      <span className={classNames("stat-value", tone && `stat-value--${tone}`)}>{value}</span>
    </div>
  );
}

function description(total: number): string {
  return total === 1 ? " is" : "s are";
}

function OccupancyBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? palette.danger : pct >= 70 ? palette.warning : palette.success;
  return (
    <div className="bar">
      <div className="bar-fill" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
    </div>
  );
}

function formatCount(n: number): string {
  return new Intl.NumberFormat().format(n);
}
