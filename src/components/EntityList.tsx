import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { useMeta } from "../meta-context";
import { api } from "../api";
import { formatFieldValue } from "../util";
import type { CollectionItem, EntitySpec } from "../types";

export default function EntityList() {
  const { module, collection } = useParams<{
    module: string;
    collection: string;
  }>();
  const { entities, loading: metaLoading } = useMeta();
  const navigate = useNavigate();

  const spec = useMemo(() => {
    if (!module || !collection) return undefined;
    return (entities ?? []).find(
      (e) => e.module === module && e.collection === collection,
    );
  }, [module, collection, entities]);

  if (metaLoading || !spec) {
    return <p className="hint">Loading metadata&hellip;</p>;
  }

  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.collections
      .list(collection!)
      .then((res) => {
        if (!active) return;
        setItems(res.items ?? []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [collection]);

  const columns = useMemo(() => {
    const map = new Map<string, EntitySpec["fields"][number]>();
    for (const field of spec.fields) map.set(field.key, field);
    return spec.columns
      .map((key) => map.get(key))
      .filter((field): field is EntitySpec["fields"][number] => Boolean(field));
  }, [spec]);

  function handleCreate() {
    navigate(`/${module}/${collection}/new`);
  }

  async function handleDelete(id: string) {
    if (!spec) return;
    if (!window.confirm(`Delete this ${spec.singular.toLowerCase()}?`)) return;
    try {
      await api.collections.remove(collection!, id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function handleExport() {
    if (!collection) return;
    try {
      const { filename, csv } = await api.workspace.exportCollection(collection);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export records.");
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="anim-rise">
            {spec.label}
            <span className="hint">&nbsp;({items.length})</span>
          </h1>
          <p className="hint">
            {spec.singular} · <NavLink to={`/${module}/${collection}`}>view all</NavLink>
          </p>
        </div>
        <div className="inline-actions">
          <button type="button" onClick={() => void handleExport()}>Export</button>
          <button className="primary" onClick={handleCreate}>Create {spec.singular}</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="hint">Loading {spec.collection}&hellip;</p>
      ) : items.length === 0 ? (
        <div className="card">
          <p className="empty">No {spec.label.toLowerCase()} yet. Create one above to get started.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {columns.map((field) => (
                  <th key={field.key}>{field.label}</th>
                ))}
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  {columns.map((field) => (
                    <td key={field.key}>
                      {formatFieldValue(item[field.key])}
                    </td>
                  ))}
                  <td className="num">
                    <div className="row-actions">
                      <NavLink to={`/${module}/${collection}/${item.id}`} className="ghost" title="View">
                        Open
                      </NavLink>
                      <NavLink
                        to={`/${module}/${collection}/${item.id}/edit`}
                        className="ghost"
                        title="Edit"
                      >
                        Edit
                      </NavLink>
                      <button
                        type="button"
                        className="ghost danger"
                        title="Delete"
                        onClick={() => void handleDelete(item.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}