import ChoiceSelect from "./ChoiceSelect";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMeta } from "../meta-context";
import { useSession } from "../session-context";
import { api } from "../api";
import { classNames } from "../util";
import type { CollectionItem, FieldSpec } from "../types";
import { useLanguage } from "../language-context";
import { hasPermission, sectionForModule } from "../access-control";

interface FieldProps {
  field: FieldSpec;
  value: string | number | null | undefined;
  onChange: (key: string, value: unknown) => void;
}

function Field({ field, value, onChange }: FieldProps) {
  const { t } = useLanguage();
  const { user } = useSession();
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { if (field.key === "organizationId") void api.auth.companies().then(result => setCompanies(result.companies)).catch(() => setCompanies([])); if (field.key === "parentOrganizationId") void api.collections.list("organizations").then(result => setCompanies(result.items.filter(item => item.status === "active").map(item => ({ id: item.id, name: String(item.name) })))).catch(() => setCompanies([])); }, [field.key, user]);
  if (field.readOnly) return <label className="form-field"><span className="field-label">{t(field.label)}</span><input readOnly value={value ?? ""} placeholder={t("Assigned automatically when saved")} /><small>{t("Assigned automatically when saved")}</small></label>;
  if (["organizationId", "parentOrganizationId"].includes(field.key)) return <label className="form-field"><span className="field-label">{t(field.key === "organizationId" ? "Company" : "Organization")}</span><ChoiceSelect required={field.required} value={value ?? ""} onChange={event => onChange(field.key, event.target.value)}><option value="">{t(field.key === "organizationId" ? "Choose company" : "Choose organization")}</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</ChoiceSelect></label>;
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
        {t(field.label)}
        {field.required ? <span className="required" aria-hidden="true">*</span> : null}
      </label>
      {field.type === "select" ? (
        <ChoiceSelect id={`field-${field.key}`} required={field.required} value={value ?? ""} onChange={(e) => onChange(field.key, e.target.value)}>
          <option value="">Choose&hellip;</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {t(opt)}
            </option>
          ))}
        </ChoiceSelect>
      ) : field.type === "textarea" ? (
        <textarea
          id={`field-${field.key}`}
          required={field.required}
          value={value ?? ""}
          onChange={handleChange}
          rows={4}
          placeholder={field.placeholder ? t(field.placeholder) : undefined}
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
          placeholder={field.placeholder ? t(field.placeholder) : undefined}
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
  const { t } = useLanguage();
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
  const parentOrganizationId = searchParams.get("org") ?? "";

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
  const submittingRef = useRef(false);
  const [clientRequestId] = useState(() => crypto.randomUUID());
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
    setValues({ ...buildInitialValues(spec.fields, item), ...(!isEdit && collection === "employees" ? { status: "active", employmentType: "full-time" } : {}), ...(!isEdit && collection === "employees" && companyId ? { organizationId: companyId } : {}), ...(!isEdit && collection === "companies" && parentOrganizationId ? { parentOrganizationId } : {}) });
  }, [spec, item, companyId, parentOrganizationId, isEdit, collection]);

  function handleChange(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value as string | number | null, ...(key === "organizationId" ? { locationId: "", location: "" } : {}) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!spec || submittingRef.current) return;
    if (collection === "employees" && !companies.some((company) => company.id === values.organizationId)) {
      setError("Choose the company this employee belongs to.");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = isEdit
        ? await api.collections.update(collection!, id!, values)
        : await api.collections.create(collection!, { ...values, ...(collection === "employees" ? { clientRequestId } : {}) });
      navigate(collection === "employees" && !isEdit && result.item?.id ? `/hr/employees/${result.item.id}` : `/${module}/${collection}`, {
        replace: true,
        state: { success: result.pending ? "Your change was submitted for approval." : `${spec.singular} ${isEdit ? "updated" : "created"} successfully.` },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (metaLoading || !spec) {
    return <p className="hint">Loading metadata&hellip;</p>;
  }

  if (!hasPermission(user, sectionForModule(module), isEdit ? "edit" : "create")) return <div className="alert alert--bad" role="alert">{t("You do not have permission to change this section.")}</div>;

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
            {t(`${isEdit ? "Edit" : "Create"} ${spec.singular}`)}
          </h1>
          <p className="hint">
            {t(collection === "employees" ? "Keep personal, employment and location details organized in one profile." : `${isEdit ? "Update" : "Add"} ${spec.collection} details`)}
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {collection === "employees" && !isEdit && <p className="hint">{t("A restricted Employee account is created automatically. Create its private activation invitation in Employee accounts & notifications.")}</p>}
      <form className="form entity-form" onSubmit={handleSubmit}>
        {employeeGroups ? employeeGroups.map((group) => {
          const fields = spec.fields.filter((field) => group.keys.includes(field.key));
          return <section className="card employee-form-section" key={group.title}><div className="employee-form-section-head"><h2>{t(group.title)}</h2><p>{t(group.description)}</p></div><div className="form-grid">{fields.map((field) => field.key === "organizationId" ? <div className="form-field field--full" key={field.key}><label className="field-label" htmlFor="employee-company">{t("Company")} <span className="required" aria-hidden="true">*</span></label><ChoiceSelect id="employee-company" required disabled={companiesLoading || submitting || companies.length === 1 || Boolean(companyId)} value={values.organizationId ?? ""} onChange={(event) => handleChange("organizationId", event.target.value)}><option value="">{companiesLoading ? "Loading companies…" : "Choose a company"}</option>{companies.map((company) => <option key={company.id} value={company.id}>{String(company.name)}</option>)}</ChoiceSelect>{values.organizationId && <small>{t("Organization")}: {String(companies.find(company => company.id === values.organizationId)?.organizationName || t("Not provided"))}</small>}{!companiesLoading && !companies.length && <p className="hint">Add a company in Organizations before adding an employee.</p>}</div> : <Field key={field.key} field={field} value={values[field.key]} onChange={handleChange} />)}</div></section>;
        }) : <section className="card"><div className="form-grid">{spec.fields.map((field) => <Field key={field.key} field={field} value={values[field.key]} onChange={handleChange} />)}</div></section>}
        {collection === "employees" && !isEdit && <section className="card employee-form-section"><h2>{t("Account information")}</h2><div className="form-grid">{[["Username","Assigned automatically when saved"],["Account status","Invited after approval"],["Role","Employee"],["Secure account setup","Private activation invitation"]].map(([label,value])=><label className="form-field" key={label}><span>{t(label)}</span><input readOnly value={t(value)} /></label>)}</div><p className="hint">{t("The employee sets their own password using a private invitation. No email or SMS is sent automatically.")}</p></section>}
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
