import ChoiceSelect from "./ChoiceSelect";
import { useEffect, useState } from "react";
import { api, type Person, type PersonStatus, type Store } from "../api";
import { classNames } from "../util";

type FormData = {
  storeId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: PersonStatus;
  hireDate: string;
  notes: string;
  zoneId: string;
};

const roleOptions: string[] = ["manager", "staff", "guest"];
const statusOptions: PersonStatus[] = ["active", "leave", "terminated"];

function defaultForm(): FormData {
  return {
    storeId: "",
    name: "",
    email: "",
    phone: "",
    role: "staff",
    status: "active",
    hireDate: new Date().toISOString().slice(0, 10),
    notes: "",
    zoneId: "",
  };
}

export default function PersonList() {
  const [people, setPeople] = useState<Person[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm());
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [{ people: list }, { stores: storeList }] = await Promise.all([api.people.list(), api.stores.list()]);
      setPeople(list);
      setStores(storeList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load people");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function handleChange(field: keyof FormData, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }) as FormData);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingId) await api.people.update(editingId, form);
      else await api.people.create(form);
      await load();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save person");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this person?")) return;
    try {
      await api.people.delete(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete person");
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm(defaultForm());
  }

  function openCreate() {
    resetForm();
    setEditingId(null);
  }

  function openEdit(person: Person) {
    setEditingId(person.id);
    setForm({ storeId: person.storeId, name: person.name, email: person.email ?? "", phone: person.phone ?? "", role: person.role, status: person.status, hireDate: person.hireDate, notes: person.notes ?? "", zoneId: person.zoneId ?? "" });
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>People</h1>
          <p className="hint">Track who enters the building. Occupancy updates live from staff and guests.</p>
        </div>
        <button className="primary" onClick={openCreate}>Add person</button>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="hint">Loading people&hellip;</p>
      ) : people.length === 0 ? (
        <p className="empty">No people yet. Add one above.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Store</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id}>
                  <td>{person.name}</td>
                  <td>{stores.find((s) => s.id === person.storeId)?.name ?? person.storeId}</td>
                  <td>{person.email}</td>
                  <td>{person.role}</td>
                  <td><span className={classNames("badge", badgeClass(person.status))}>{person.status}</span></td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="card">
        <h2>{editingId ? "Edit person" : "Add a new person"}</h2>
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field"><label className="field-label">Name</label><input type="text" value={form.name} onChange={(e) => handleChange("name", e.target.value)} /></div>
            <div className="form-field"><label className="field-label">Email</label><input type="email" value={form.email} onChange={(e) => handleChange("email", e.target.value)} /></div>
            <div className="form-field"><label className="field-label">Phone</label><input type="text" value={form.phone} onChange={(e) => handleChange("phone", e.target.value)} /></div>
            <div className="form-field"><label className="field-label">Hire date</label><input type="date" value={form.hireDate} onChange={(e) => handleChange("hireDate", e.target.value)} /></div>
            <div className="form-field"><label className="field-label">Store</label><ChoiceSelect value={form.storeId} onChange={(e) => handleChange("storeId", e.target.value)}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</ChoiceSelect></div>
            <div className="form-field"><label className="field-label">Role</label><ChoiceSelect value={form.role} onChange={(e) => handleChange("role", e.target.value)}>{roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}</ChoiceSelect></div>
            <div className="form-field"><label className="field-label">Status</label><ChoiceSelect value={form.status} onChange={(e) => handleChange("status", e.target.value)}>{statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}</ChoiceSelect></div>
          </div>
          <div className="form-actions">
            <button type="submit" className="primary" disabled={submitting}>{editingId ? "Save changes" : "Add person"}</button>
            {editingId && <button type="button" onClick={resetForm}>Cancel</button>}
          </div>
        </form>
      </section>

      {people.map((person) => (
        <Toolbar key={person.id} onEdit={() => openEdit(person)} onDelete={() => handleDelete(person.id)} />
      ))}
    </div>
  );
}

function badgeClass(status: string): string {
  if (status === "active") return "badge--open";
  if (status === "leave") return "badge--open-limited";
  return "badge--closed";
}

function Toolbar({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="toolbar">
      <button className="primary" onClick={onEdit}>Edit</button>
      <button className="danger" onClick={onDelete}>Delete</button>
    </div>
  );
}
