import { useLanguage } from "../language-context";
import ChoiceSelect from "./ChoiceSelect";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type CollectionItem, type Store, type StoreKind, type StoreStatus } from "../api";
import { classNames } from "../util";

type FormData = Omit<Store, "id" | "createdAt" | "updatedAt" | "occupancy">;

const kindOptions: StoreKind[] = ["store", "restaurant", "office", "warehouse"];
const statusOptions: StoreStatus[] = ["open", "open-limited", "closed"];

export default function StoreList() {
  const { t } = useLanguage();
  const [stores, setStores] = useState<Store[]>([]);
  const [companies, setCompanies] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({
    companyId: "", name: "", kind: "restaurant", address: "", city: "",
    totalArea: 1, floorCount: 1, status: "open", mapLink: "", responsibleEmployee: "", notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [{ stores: list }, { items: companyList }] = await Promise.all([
        api.stores.list(),
        api.collections.list("companies"),
      ]);
      setStores(list);
      setCompanies(companyList);
      setForm((current) => !current.companyId && companyList.length > 0
        ? { ...current, companyId: String(companyList[0]?.id ?? "") }
        : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load locations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function handleChange(field: keyof FormData, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingId) await api.stores.update(editingId, form);
      else await api.stores.create(form);
      await load();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save location");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this location? This also removes its assigned zones and people.")) return;
    try {
      await api.stores.delete(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete location");
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm({ companyId: String(companies[0]?.id ?? ""), name: "", kind: "restaurant", address: "", city: "", totalArea: 1, floorCount: 1, status: "open", mapLink: "", responsibleEmployee: "", notes: "" });
  }

  function openCreate() {
    resetForm();
    setEditingId(null);
  }

  function openEdit(store: Store) {
    setEditingId(store.id);
    setForm({ companyId: store.companyId, name: store.name, kind: store.kind, address: store.address, city: store.city, totalArea: store.totalArea, floorCount: store.floorCount, status: store.status, mapLink: store.mapLink ?? "", responsibleEmployee: store.responsibleEmployee ?? "", responsibleEmployeeId: store.responsibleEmployeeId ?? "", notes: store.notes ?? "" });
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("Locations")}</h1>
          <p className="hint">{t("Manage company restaurants, stores, offices, warehouses and branches. Occupancy updates automatically.")}</p>
        </div>
        <button className="primary" onClick={openCreate}>{t("Add location")}</button>
      </div>

      {error && <p className="error">{t(error)}</p>}

      {loading ? (
        <p className="hint">{t("Loading locations…")}</p>
      ) : stores.length === 0 ? (
        <p className="empty">{t("No locations yet. Add one above.")}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t("Name")}</th>
                <th>{t("Company")}</th>
                <th>{t("Kind")}</th>
                <th>{t("City")}</th>
                <th className="num">{t("Area")}</th>
                <th>{t("Status")}</th>
                <th className="num">{t("Occupancy")}</th>
                <th className="num">{t("People")}</th>
                <th className="num">{t("Capacity")}</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => (
                <tr key={store.id}>
                  <td>
                    <button className="link-row" onClick={() => navigate("/locations")}>
                      {store.name}
                      <span className="row-detail">{t("Details")}</span>
                    </button>
                  </td>
                  <td>{companyName(store.companyId, companies)}</td>
                  <td>{store.kind}</td>
                  <td>{store.city}</td>
                  <td className="num">{store.totalArea} m&sup2;</td>
                  <td><span className={classNames("badge", badgeClass(store.status))}>{store.status.replace("-", " ")}</span></td>
                  <td className="num">{store.occupancy?.occupancyPct ?? 0}%</td>
                  <td className="num">{store.occupancy?.headCount ?? 0}</td>
                  <td className="num">{store.occupancy?.capacity ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="card">
        <h2>{editingId ? t("Edit location") : t("Add a new location")}</h2>
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field"><label className="field-label">{t("Name")}</label><input type="text" value={form.name} onChange={(e) => handleChange("name", e.target.value)} /></div>
            <div className="form-field"><label className="field-label">{t("Company")}</label><ChoiceSelect required value={form.companyId} onChange={(e) => handleChange("companyId", e.target.value)}>{companies.map((company) => <option key={company.id} value={company.id}>{String(company.name ?? company.id)}</option>)}</ChoiceSelect></div>
            <div className="form-field"><label className="field-label">{t("Kind")}</label><ChoiceSelect value={form.kind} onChange={(e) => handleChange("kind", e.target.value)}>{kindOptions.map((k) => <option key={k} value={k}>{k}</option>)}</ChoiceSelect></div>
            <div className="form-field"><label className="field-label">{t("Address")}</label><input type="text" value={form.address} onChange={(e) => handleChange("address", e.target.value)} /></div>
            <div className="form-field"><label className="field-label">{t("City")}</label><input type="text" value={form.city} onChange={(e) => handleChange("city", e.target.value)} /></div>
            <div className="form-field"><label className="field-label">{t("Area (m²)")}</label><input type="number" value={form.totalArea} onChange={(e) => handleChange("totalArea", Number(e.target.value))} /></div>
            <div className="form-field"><label className="field-label">{t("Floor count")}</label><input type="number" value={form.floorCount} onChange={(e) => handleChange("floorCount", Number(e.target.value))} /></div>
            <div className="form-field"><label className="field-label">{t("Status")}</label><ChoiceSelect value={form.status} onChange={(e) => handleChange("status", e.target.value)}>{statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}</ChoiceSelect></div>
            <div className="form-field"><label className="field-label">{t("Responsible employee")}</label><input type="text" value={form.responsibleEmployee ?? ""} onChange={(e) => handleChange("responsibleEmployee", e.target.value)} /></div>
            <div className="form-field"><label className="field-label">{t("Map link")}</label><input type="url" value={form.mapLink ?? ""} onChange={(e) => handleChange("mapLink", e.target.value)} placeholder={t("https://maps.example/...")} /></div>
            <div className="form-field field--full"><label className="field-label">{t("Notes")}</label><textarea value={form.notes ?? ""} onChange={(e) => handleChange("notes", e.target.value)} rows={3} /></div>
          </div>
          <div className="form-actions">
            <button type="submit" className="primary" disabled={submitting || !form.companyId}>{editingId ? t("Save changes") : t("Add location")}</button>
            {editingId && <button type="button" onClick={resetForm}>{t("Cancel")}</button>}
          </div>
        </form>
      </section>

      {stores.map((store) => (
        <Toolbar key={store.id} onEdit={() => openEdit(store)} onDelete={() => handleDelete(store.id)} />
      ))}
    </div>
  );
}

function companyName(companyId: string, companies: CollectionItem[]): string {
  return String(companies.find((company) => company.id === companyId)?.name ?? companyId);
}

function badgeClass(status: string): string {
  if (status === "open") return "badge--open";
  if (status === "open-limited") return "badge--open-limited";
  return "badge--closed";
}

function Toolbar({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="toolbar">
      <button className="primary" onClick={onEdit}>{t("Edit")}</button>
      <button className="danger" onClick={onDelete}>{t("Delete")}</button>
    </div>
  );
}
