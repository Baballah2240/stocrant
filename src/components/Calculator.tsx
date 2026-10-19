import { useLanguage } from "../language-context";
import ChoiceSelect from "./ChoiceSelect";
import { useEffect, useState } from "react";
import { api, type Store } from "../api";

export default function Calculator() {
  const { t } = useLanguage();
  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ pct: number; capacity: number; headCount: number } | null>(null);
  const [storeId, setStoreId] = useState("");
  const [headCount, setHeadCount] = useState("");

  async function load() {
    setError(null);
    try {
      const { stores: list } = await api.stores.list();
      setStores(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stores");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId || !headCount) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const { store } = await api.occupancy.calculate(storeId, Number(headCount));
      setResult({ pct: store.occupancyPct, capacity: store.capacity, headCount: store.headCount });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to calculate occupancy");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("Occupancy Calculator")}</h1>
          <p className="hint">{t("Estimate real-time occupancy by simulating a headcount for a store.")}</p>
        </div>
      </div>

      {error && <p className="error">{t(error)}</p>}

      <section className="card">
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field"><label className="field-label">{t("Store")}</label><ChoiceSelect value={storeId} onChange={(e) => setStoreId(e.target.value)}><option value="">{t("Choose a store…")}</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</ChoiceSelect></div>
            <div className="form-field"><label className="field-label">{t("Headcount")}</label><input type="number" value={headCount} onChange={(e) => setHeadCount(e.target.value)} placeholder="e.g. 45" /></div>
          </div>
          <div className="form-actions">
            <button type="submit" className="primary" disabled={submitting}>{t("Calculate")}</button>
          </div>
        </form>
      </section>

      {result && (
        <section className="card">
          <h2>{t("Result")}</h2>
          <div className="grid-2">
            <div className="stat"><span className="stat-value">{result.pct}%</span><span className="stat-label">{t("Occupancy")}</span></div>
            <div className="stat"><span className="stat-value">{result.headCount}</span><span className="stat-label">{t("Headcount")}</span></div>
            <div className="stat"><span className="stat-value">{result.capacity}</span><span className="stat-label">{t("Capacity")}</span></div>
            <div className="stat"><span className="stat-value">{result.capacity ? Math.round((result.headCount / result.capacity) * 100) : 0}%</span><span className="stat-label">{t("Utilization")}</span></div>
          </div>
        </section>
      )}

      <div className="legend">
        <p><strong>{t("Legend:")}</strong></p>
        <ul>
          <li><span className="badge badge--open">{t("Open")}</span>  {t("Comfortable capacity")}</li>
          <li><span className="badge badge--open-limited">{t("Open-limited")}</span>  {t("Heavily occupied")}</li>
          <li><span className="badge badge--closed">{t("Closed")}</span>  {t("At or past capacity")}</li>
        </ul>
      </div>
    </div>
  );
}
