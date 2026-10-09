import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMeta } from "../meta-context";
import { api } from "../api";
import { formatFieldValue } from "../util";
import type { EntitySpec } from "../types";

export default function EntityDetail() {
  const { module, collection, id } = useParams<{
    module: string;
    collection: string;
    id?: string;
  }>();
  const { entities, loading: metaLoading } = useMeta();
  const navigate = useNavigate();

  const spec = useMemo(() => {
    if (!module || !collection) return undefined;
    return (entities ?? []).find(
      (e) => e.module === module && e.collection === collection,
    );
  }, [module, collection, entities]);

  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !collection) return;
    let active = true;
    setLoading(true);
    setError(null);
    api.collections
      .get(collection, id)
      .then((res) => {
        if (!active) return;
        setItem(res.item ?? null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, collection]);

  const fields = useMemo(() => {
    if (!spec) return [];
    const map = new Map<string, EntitySpec["fields"][number]>();
    for (const field of spec.fields) map.set(field.key, field);
    return spec.columns
      .map((key) => map.get(key))
      .filter((field): field is EntitySpec["fields"][number] => Boolean(field));
  }, [spec]);

  if (metaLoading || !spec) {
    return <p className="hint">Loading metadata&hellip;</p>;
  }
  if (loading) {
    return <p className="hint">Loading {spec.singular.toLowerCase()}&hellip;</p>;
  }
  if (error) {
    return <p className="error">{error}</p>;
  }
  if (!item) {
    return <p className="empty">This {spec.singular.toLowerCase()} could not be found.</p>;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="anim-rise">
            {spec.label}
            <span className="hint">&nbsp;·&nbsp;{formatFieldValue(item[spec.columns[0]] ?? "—")}</span>
          </h1>
          <p className="hint">{spec.singular} details</p>
        </div>
        <button className="primary" onClick={() => navigate(`/${module}/${collection}/${id}/edit`)}>
          Edit
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card">
        {fields.map((field) => (
          <div key={field.key} className="field">
            <p className="field-label">{field.label}</p>
            <p className="field-value">{formatFieldValue(item[field.key])}</p>
          </div>
        ))}
      </div>
    </div>
  );
}