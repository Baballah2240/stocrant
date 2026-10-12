import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMeta } from "../meta-context";
import { useSession } from "../session-context";
import { api } from "../api";
import { classNames } from "../util";
import type { CollectionItem, FieldSpec } from "../types";

interface FieldProps {
  field: FieldSpec;
  value: string | number | null | undefined;
  onChange: (key: string, value: unknown) => void;
}

function Field({ field, value, onChange }: FieldProps) {
  const { user } = useSession();
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { if (field.key === "organizationId") void api.auth.companies().then(result => setCompanies(result.companies.filter(company => user?.roleId === "role-main-manager" || user?.organizationIds.includes(company.id)))).catch(() => setCompanies([])); }, [field.key, user]);
  if (field.readOnly) return <label className="form-field"><span className="field-label">{field.label}</span><input readOnly value={value ?? ""} placeholder={field.placeholder} /><small>Assigned automatically when saved</small></label>;
  if (field.key === "organizationId") return <label className="form-field"><span className="field-label">Company</span><select required={field.required} value={value ?? ""} onChange={event => onChange(field.key, event.target.value)}><option value="">Choose company</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>;
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
      <label className="field-label" htmlFor={`field-${field.key}`}>
        {field.label}
        {field.required ? <span className="required" aria-hidden="true">*</span> : null}
      </label>
      {field.type === "select" ? (
        <select id={`field-${field.key}`} required={field.required} value={value ?? ""} onChange={(e) => onChange(field.key, e.target.value)}>
          <option value="">Choose&hellip;</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          id={`field-${field.key}`}
          required={field.required}
          value={value ?? ""}
          onChange={handleChange}
          rows={4}
          placeholder={field.placeholder}
        />
      ) : (
        <input
          id={`field-${field.key}`}
          required={field.required}
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
  const { user } = useSession();
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get("company") ?? "";

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
  const [companies, setCompanies] = useState<CollectionItem[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);

  useEffect(() => {
    if (collection !== "employees") return;
    let active = true;
    setCompaniesLoading(true);
    api.workspace.hrCompanies().then((data) => { if (active) setCompanies(data.companies); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Could not load companies."); })
      .finally(() => { if (active) setCompaniesLoading(false); });
    return () => { active = false; };
  }, [collection]);

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
    setValues({ ...buildInitialValues(spec.fields, item), ...(!isEdit && collection === "employees" && companyId ? { organizationId: companyId } : {}) });
  }, [spec, item, companyId, isEdit, collection]);

  function handleChange(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value as string | number | null }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!spec) return;
    if (collection === "employees" && !companies.some((company) => company.id === values.organizationId)) {
      setError("Choose the company this employee belongs to.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = isEdit
        ? await api.collections.update(collection!, id!, values)
        : await api.collections.create(collection!, values);
      navigate(`/${module}/${collection}`, {
        replace: true,
        state: { success: result.pending ? "Your change was submitted for approval." : `${spec.singular} ${isEdit ? "updated" : "created"} successfully.` },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  if (metaLoading || !spec) {
    return <p className="hint">Loading metadata&hellip;</p>;
  }

  if (module === "hr" && user?.roleId !== "role-main-manager") return <div className="alert alert--bad" role="alert">Only the main admin can manage HR records.</div>;

  const employeeGroups = collection === "employees" ? [
    { title: "Company assignment", description: "Which company are you adding this employee to?", keys: ["organizationId"] },
    { title: "Personal details", description: "Contact details and identity information.", keys: ["employeeCode", "name", "email", "phone", "birthday"] },
    { title: "Employment", description: "Role, status and reporting details.", keys: ["department", "jobTitle", "employmentType", "status", "hireDate", "manager", "salary"] },
    { title: "Location & notes", description: "Workplace assignment and internal notes.", keys: ["locationId", "location", "notes"] },
  ] : null;

  return (
    <div className="page entity-form-page">
      <div className="page-head">
        <div>
          <button type="button" className="back-button" onClick={() => navigate(`/${module}/${collection}`)}>← Back to {spec.label}</button>
          <h1 className="anim-rise">
            {isEdit ? "Edit" : "Create"} {spec.singular}
          </h1>
          <p className="hint">
            {collection === "employees" ? "Keep personal, employment and location details organized in one profile." : `${isEdit ? "Update" : "Add"} ${spec.collection} details`}
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <form className="form entity-form" onSubmit={handleSubmit}>
        {employeeGroups ? employeeGroups.map((group) => {
          const fields = spec.fields.filter((field) => group.keys.includes(field.key));
          return <section className="card employee-form-section" key={group.title}><div className="employee-form-section-head"><h2>{group.title}</h2><p>{group.description}</p></div><div className="form-grid">{fields.map((field) => field.key === "organizationId" ? <div className="form-field field--full" key={field.key}><label className="field-label" htmlFor="employee-company">Company <span className="required" aria-hidden="true">*</span></label><select id="employee-company" required disabled={companiesLoading || submitting} value={values.organizationId ?? ""} onChange={(event) => handleChange("organizationId", event.target.value)}><option value="">{companiesLoading ? "Loading companies…" : "Choose a company"}</option>{companies.map((company) => <option key={company.id} value={company.id}>{String(company.name)}</option>)}</select>{!companiesLoading && !companies.length && <p className="hint">Add a company in Organizations before adding an employee.</p>}</div> : <Field key={field.key} field={field} value={values[field.key]} onChange={handleChange} />)}</div></section>;
        }) : <section className="card"><div className="form-grid">{spec.fields.map((field) => <Field key={field.key} field={field} value={values[field.key]} onChange={handleChange} />)}</div></section>}
        <div className="card entity-form-actions-card">
          <div className="form-actions">
            <button type="submit" className="primary" disabled={submitting || (collection === "employees" && (companiesLoading || !companies.length))}>
              {submitting ? "Saving\u2026" : isEdit ? "Save changes" : collection === "employees" ? "Add employee" : "Create"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => navigate(`/${module}/${collection}`)}
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
