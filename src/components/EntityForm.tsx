import ChoiceSelect from "./ChoiceSelect";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMeta } from "../meta-context";
import { useSession } from "../session-context";
import { api, ApiError } from "../api";
import { classNames } from "../util";
import type { CollectionItem, FieldSpec } from "../types";
import { useLanguage } from "../language-context";
import { hasPermission, sectionForModule } from "../access-control";

interface FieldProps {
  field: FieldSpec;
  value: string | number | null | undefined;
  onChange: (key: string, value: unknown) => void;
  error?: string;
}

function Field({ field, value, onChange, error }: FieldProps) {
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
        <ChoiceSelect id={`field-${field.key}`} required={field.required} value={value ?? ""} aria-invalid={Boolean(error)} aria-describedby={error ? `error-${field.key}` : undefined} onChange={(e) => onChange(field.key, e.target.value)}>
          <option value="">{t("Choose…")}</option>
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
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `error-${field.key}` : undefined}
          value={value ?? ""}
          onChange={handleChange}
          rows={4}
          placeholder={field.placeholder ? t(field.placeholder) : undefined}
        />
      ) : (
        <input
          id={`field-${field.key}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `error-${field.key}` : undefined}
          required={field.required}
          type={inputType[field.type] ?? "text"}
          step={["number", "currency", "percent"].includes(field.type) ? "any" : undefined}
          value={value ?? ""}
          onChange={handleChange}
          min={field.min}
          max={field.max}
          placeholder={field.placeholder ? t(field.placeholder) : undefined}
        />
      )}
      {error && <p className="field-error" id={`error-${field.key}`} role="alert">{t(error)}</p>}
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
    if (field.key === "organizationId" && item && !item.organizationId && typeof item.companyId === "string") { values[field.key] = item.companyId; continue; }
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
  const { entities, loading: metaLoading, error: metaError } = useMeta();
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
  const formFields = useMemo<FieldSpec[]>(() => {
    if (!spec) return [];
    const scopedModule = ["hr", "stores", "warehouse"].includes(module ?? "");
    const fields=spec.fields.filter(field=>collection!=="employees"||field.key!=="salary"||hasPermission(user,"finance")||hasPermission(user,"payroll")||hasPermission(user,"hr","salary.view"));
    return scopedModule && !fields.some(field => ["organizationId", "companyId"].includes(field.key))
      ? [{ key: "organizationId", label: "Company", type: "select", required: true }, ...fields]
      : fields;
  }, [spec, module, collection, user]);

  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [values, setValues] = useState<Record<string, string | number | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loadingItem, setLoadingItem] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const initialValues = useRef("{}");
  const dirty = JSON.stringify(values) !== initialValues.current;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !submittingRef.current && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(t("Discard unsaved changes?"))) blocker.proceed();
    else blocker.reset();
  }, [blocker.state, t]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
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
    setLoadingItem(true);
    setItem(null);
    setError(null);
    api.collections
      .get(collection, id)
      .then((res) => {
        if (!active) return;
        setItem(res.item ?? null);
      })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Failed to load"); })
      .finally(() => {
        if (active) setLoadingItem(false);
      });
    return () => {
      active = false;
    };
  }, [isEdit, id, collection]);

  // Seed the form with existing values (or defaults when creating).
  useEffect(() => {
    if (!spec) return;
    const seeded = { ...buildInitialValues(formFields, item), ...(!isEdit && formFields.some(field => field.key === "organizationId") && user?.organizationIds.length === 1 ? { organizationId: user.organizationIds[0] } : {}), ...(!isEdit && collection === "employees" ? { status: "active", employmentType: "full-time" } : {}), ...(!isEdit && companyId ? { organizationId: companyId } : {}), ...(!isEdit && collection === "companies" && parentOrganizationId ? { parentOrganizationId } : {}) };
    initialValues.current = JSON.stringify(seeded);
    setValues(seeded);
  }, [spec, formFields, item, companyId, parentOrganizationId, isEdit, collection, user?.id]);

  function handleChange(key: string, value: unknown) {
    setFieldErrors(current => { const next = { ...current }; delete next[key]; return next; });
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
      navigate(collection === "employees" && (result.item?.id || isEdit && id) ? `/hr/employees/${result.item?.id || id}` : `/${module}/${collection}`, {
        replace: true,
        state: { success: result.pending ? "Your change was submitted for approval." : "Changes saved." },
      });
    } catch (err) {
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (metaError) return <div className="page"><p className="error" role="alert">{t("Could not load workspace metadata. Try again.")}</p><button type="button" onClick={() => window.location.reload()}>{t("Try again")}</button></div>;
  if (!metaLoading && !spec) return <div className="page"><p role="status">{t("This section could not be found.")}</p><button type="button" onClick={() => navigate("/")}>{t("Go to home")}</button></div>;
  if (metaLoading || !spec) {
    return <p className="hint">{t("Loading metadata…")}</p>;
  }
  if (isEdit && loadingItem) return <div className="page"><p className="hint" role="status">{t("Loading record…")}</p></div>;
  if (isEdit && !item) return <div className="page"><p className="error" role="alert">{t(error || "Record not found.")}</p><button type="button" onClick={() => navigate(collection === "employees" && isEdit ? `/hr/employees/${id}` : `/${module}/${collection}`)}>{t("Back")}</button></div>;

  if (!hasPermission(user, sectionForModule(module), isEdit ? "edit" : "create")) return <div className="alert alert--bad" role="alert">{t("You do not have permission to change this section.")}</div>;

  const employeeGroups = collection === "employees" ? [
    { title: "Company assignment", description: "Which company are you adding this employee to?", keys: ["organizationId"] },
    { title: "Personal details", description: "Contact details and identity information.", keys: ["employeeCode", "name", "email", "phone", "address", "birthday"] },
    { title: "Employment", description: "Role, status and reporting details.", keys: ["department", "jobTitle", "employmentType", "status", "hireDate", "manager", "salary"] },
    { title: "Location & notes", description: "Workplace assignment and internal notes.", keys: ["locationId", "location", "notes"] },
  ] : null;

  return (
    <div className="page entity-form-page">
      <div className="page-head">
        <div>
          <button type="button" className="back-button" onClick={() => navigate(`/${module}/${collection}`)}>{t("← Back to")} {t(spec.label)}</button>
          <h1 className="anim-rise">
            {t(`${isEdit ? "Edit" : "Create"} ${t(spec.singular)}`)}
          </h1>
          <p className="hint">
            {t(collection === "employees" ? "Keep personal, employment and location details organized in one profile." : "Review and save the details below.")}
          </p>
        </div>
      </div>

      {error && <p className="error">{t(error)}</p>}

      {collection === "employees" && !isEdit && <p className="hint">{t("A restricted Employee account is created automatically. Create its private activation invitation in Employee accounts & notifications.")}</p>}
      <form className="form entity-form" onSubmit={handleSubmit}>
        {employeeGroups ? employeeGroups.map((group) => {
          const fields = formFields.filter((field) => group.keys.includes(field.key));
          return <section className="card employee-form-section" key={group.title}><div className="employee-form-section-head"><h2>{t(group.title)}</h2><p>{t(group.description)}</p></div><div className="form-grid">{fields.map((field) => field.key === "organizationId" ? <div className="form-field field--full" key={field.key}><label className="field-label" htmlFor="employee-company">{t("Company")} <span className="required" aria-hidden="true">*</span></label><ChoiceSelect id="employee-company" required disabled={companiesLoading || submitting || companies.length === 1 || Boolean(companyId)} value={values.organizationId ?? ""} onChange={(event) => handleChange("organizationId", event.target.value)}><option value="">{companiesLoading ? t("Loading companies…") : t("Choose a company")}</option>{companies.map((company) => <option key={company.id} value={company.id}>{String(company.name)}</option>)}</ChoiceSelect>{values.organizationId && <small>{t("Organization")}: {String(companies.find(company => company.id === values.organizationId)?.organizationName || t("Not provided"))}</small>}{!companiesLoading && !companies.length && <p className="hint">{t("Add a company in Organizations before adding an employee.")}</p>}</div> : <Field key={field.key} field={field} value={values[field.key]} error={fieldErrors[field.key]} onChange={handleChange} />)}</div></section>;
        }) : <section className="card"><div className="form-grid">{formFields.map((field) => <Field key={field.key} field={field} value={values[field.key]} error={fieldErrors[field.key]} onChange={handleChange} />)}</div></section>}
        {collection === "employees" && !isEdit && <section className="card employee-form-section"><h2>{t("Account information")}</h2><div className="form-grid">{[["Username","Assigned automatically when saved"],["Account status","Invited after approval"],["Role","Employee"],["Secure account setup","Private activation invitation"]].map(([label,value])=><label className="form-field" key={label}><span>{t(label)}</span><input readOnly value={t(value)} /></label>)}</div><p className="hint">{t("The employee sets their own password using a private invitation. No email or SMS is sent automatically.")}</p></section>}
        <div className="card entity-form-actions-card">
          <div className="form-actions">
            <button type="submit" className="primary" disabled={submitting || (collection === "employees" && (companiesLoading || !companies.length))}>
              {submitting ? t("Saving…") : isEdit ? t("Save changes") : collection === "employees" ? t("Add employee") : t("Create")}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => navigate(collection === "employees" && isEdit ? `/hr/employees/${id}` : `/${module}/${collection}`)}
            >
               {t("Cancel")} </button>
          </div>
        </div>
      </form>
    </div>
  );
}
