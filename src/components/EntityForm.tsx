import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMeta } from "../meta-context";
import { api } from "../api";
import { classNames } from "../util";
import type { FieldSpec } from "../types";

interface FieldProps {
  field: FieldSpec;
  value: string | number | null | undefined;
  onChange: (key: string, value: unknown) => void;
}

function Field({ field, value, onChange }: FieldProps) {
  const inputType: Record<string, string> = {
    text: "text",
    textarea: "textarea",
    number: "number",
    currency: "number",
    percent: "number",
    email: "email",
    tel: "tel",
    date: "date",
    time: "time",
    password: "password",
  };

  const handleChange = (e: React.ChangeEvent<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >) => {
    const raw = e.target.value;
    if (field.type === "number" || field.type === "currency" || field.type === "percent") {
      onChange(field.key, raw === "" ? "" : Number(raw));
    } else {
      onChange(field.key, raw);
    }
  };

  return (
    <div
      className={classNames("form-field", field.type === "textarea" ? "field--full" : undefined)}
    >
      <label className="field-label">
        {field.label}
        {field.required ? <span className="required" aria-hidden="true">*</span> : null}
      </label>
      {field.type === "select" ? (
        <select value={value ?? ""} onChange={(e) => onChange(field.key, e.target.value)}>
          <option value="">Choose&hellip;</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          value={value ?? ""}
          onChange={handleChange}
          rows={4}
          placeholder={field.placeholder}
        />
      ) : (
        <input
          type={inputType[field.type] ?? "text"}
          value={value ?? ""}
          onChange={handleChange}
          min={field.min}
          max={field.max}
          placeholder={field.placeholder}
        />
      )}
    </div>
  );
}

/** Build the initial form state for a collection from its registry + an optional existing item. */
export function buildInitialValues(
  fields: FieldSpec[],
  item: Record<string, unknown> | null,
): Record<string, string | number | null> {
  const values: Record<string, string | number | null> = {};
  for (const field of fields) {
    if (item && item[field.key] !== undefined && item[field.key] !== null) {
      values[field.key] = item[field.key] as string | number | null;
    } else {
      values[field.key] =
        field.type === "number" || field.type === "currency" || field.type === "percent" ? 0 : "";
    }
  }
  return values;
}

export default function EntityForm() {
  const { module, collection, id } = useParams<{
    module: string;
    collection: string;
    id?: string;
  }>();
  const { entities, loading: metaLoading } = useMeta();
  const navigate = useNavigate();

  const isEdit = Boolean(id);
  const spec = useMemo(() => {
    if (!module || !collection) return undefined;
    return (entities ?? []).find(
      (e) => e.module === module && e.collection === collection,
    );
  }, [module, collection, entities]);

  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [values, setValues] = useState<Record<string, string | number | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load the existing item when editing.
  useEffect(() => {
    if (!isEdit || !id || !collection) return;
    let active = true;
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
        if (active) {};
      });
    return () => {
      active = false;
    };
  }, [isEdit, id, collection]);

  // Seed the form with existing values (or defaults when creating).
  useEffect(() => {
    if (!spec) return;
    setValues(buildInitialValues(spec.fields, item));
  }, [spec, item]);

  function handleChange(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value as string | number | null }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!spec) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit) {
        await api.collections.update(collection!, id!, values);
      } else {
        await api.collections.create(collection!, values);
      }
      navigate(`/${module}/${collection}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  if (metaLoading || !spec) {
    return <p className="hint">Loading metadata&hellip;</p>;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="anim-rise">
            {isEdit ? "Edit" : "Create"} {spec.singular}
          </h1>
          <p className="hint">
            {isEdit ? "Update" : "Add"} {spec.collection} details
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card">
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-grid">
            {spec.fields.map((field) => (
              <Field
                key={field.key}
                field={field}
                value={values[field.key]}
                onChange={handleChange}
              />
            ))}
          </div>
          <div className="form-actions">
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? "Saving\u2026" : isEdit ? "Save changes" : "Create"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => navigate(`/${module}/${collection}`)}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
