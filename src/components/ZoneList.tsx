import { useEffect, useState } from "react";
import { api, type Zone, type ZoneKind, type Store } from "../api";

type FormData = Omit<Zone, "id" | "createdAt" | "updatedAt" | "occupancy" | "storeName">;

const kindOptions: ZoneKind[] = ["floor", "dining", "counter"];

export default function ZoneList() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({
    storeId: "", name: "", kind: "floor", area: 10, capacity: 20, notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [{ zones: list }, { stores: storeList }] = await Promise.all([api.zones.list(), api.stores.list()]);
      setZones(list);
      setStores(storeList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load zones");
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
      if (editingId) await api.zones.update(editingId, form);
      else await api.zones.create(form);
      await load();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save zone");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this zone?")) return;
    try {
      await api.zones.delete(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete zone");
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm({ storeId: "", name: "", kind: "floor", area: 10, capacity: 20, notes: "" });
  }

  function openCreate() {
    resetForm();
    setEditingId(null);
  }

  function openEdit(zone: Zone) {
    setEditingId(zone.id);
    setForm({ storeId: zone.storeId, name: zone.name, kind: zone.kind, area: zone.area, capacity: zone.capacity, notes: zone.notes });
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Zones</h1>
          <p className="hint">Manage the spaces inside each store.</p>
        </div>
        <button className="primary" onClick={openCreate}>Add zone</button>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="hint">Loading zones&hellip;</p>
      ) : zones.length === 0 ? (
        <p className="empty">No zones yet. Add one above.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Store</th>
                <th>Kind</th>
                <th className="num">Area</th>
                <th className="num">Capacity</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((zone) => (
                <tr key={zone.id}>
                  <td>{zone.name}</td>
                  <td>{stores.find((s) => s.id === zone.storeId)?.name ?? zone.storeId}</td>
                  <td>{zone.kind}</td>
                  <td className="num">{zone.area} m&sup2;</td>
                  <td className="num">{zone.capacity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="card">
        <h2>{editingId ? "Edit zone" : "Add a new zone"}</h2>
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field"><label className="field-label">Name</label><input type="text" value={form.name} onChange={(e) => handleChange("name", e.target.value)} /></div>
            <div className="form-field"><label className="field-label">Store</label><select value={form.storeId} onChange={(e) => handleChange("storeId", e.target.value)}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="form-field"><label className="field-label">Kind</label><select value={form.kind} onChange={(e) => handleChange("kind", e.target.value)}>{kindOptions.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
            <div className="form-field"><label className="field-label">Area (m&sup2;)</label><input type="number" value={form.area} onChange={(e) => handleChange("area", Number(e.target.value))} /></div>
            <div className="form-field"><label className="field-label">Capacity</label><input type="number" value={form.capacity} onChange={(e) => handleChange("capacity", Number(e.target.value))} /></div>
            <div className="form-field"><label className="field-label">Notes</label><input type="text" value={form.notes} onChange={(e) => handleChange("notes", e.target.value)} /></div>
          </div>
          <div className="form-actions">
            <button type="submit" className="primary" disabled={submitting}>{editingId ? "Save changes" : "Add zone"}</button>
            {editingId && <button type="button" onClick={resetForm}>Cancel</button>}
          </div>
        </form>
      </section>

      {zones.map((zone) => (
        <Toolbar key={zone.id} onEdit={() => openEdit(zone)} onDelete={() => handleDelete(zone.id)} />
      ))}
    </div>
  );
}

function Toolbar({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="toolbar">
      <button className="primary" onClick={onEdit}>Edit</button>
      <button className="danger" onClick={onDelete}>Delete</button>
    </div>
  );
}
