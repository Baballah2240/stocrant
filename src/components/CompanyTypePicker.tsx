import { Link } from "react-router-dom";
import { companyTypeOf, companyTypes, serviceCategories } from "../company-types";
import { useLanguage } from "../language-context";
import { useSession } from "../session-context";
import MobileIcon from "./MobileIcon";
import "../company-types.css";

/** Choose what kind of business a company is, with a preview of the tools it opens with. */
export function CompanyTypePicker({ value, serviceCategory, onChange, onServiceCategory }: { value: string; serviceCategory: string; onChange: (type: string) => void; onServiceCategory: (category: string) => void }) {
  const { t } = useLanguage(), selected = companyTypeOf(value);
  return <fieldset className="company-type-picker org-field-full">
    <legend className="field-label">{t("Company type")}<span className="required" aria-hidden="true"> *</span></legend>
    <div className="company-type-options" role="radiogroup" aria-label={t("Company type")}>
      {companyTypes.map(profile => <label key={profile.type} className="company-type-option" data-selected={selected.type === profile.type}>
        <input type="radio" name="organizationType" value={profile.type} checked={selected.type === profile.type} onChange={() => onChange(profile.type)} />
        <span className="company-type-icon"><MobileIcon name={profile.icon} /></span><strong>{t(profile.label)}</strong>
      </label>)}
    </div>
    {selected.type === "services" && <label className="form-field"><span className="field-label">{t("Service category")}</span><select value={serviceCategory} onChange={event => onServiceCategory(event.target.value)}><option value="">{t("Choose…")}</option>{serviceCategories.map(category => <option key={category} value={category}>{t(category)}</option>)}</select></label>}
    <div className="company-type-preview" aria-live="polite">
      <p><strong>{t(selected.label)}</strong> · {t(selected.tagline)}</p>
      <p className="hint">{t("This company will open with these tools first. Every other tool stays available.")}</p>
      <ul>{selected.tools.map(tool => <li key={tool.label}><MobileIcon name={tool.icon} /><span><strong>{t(tool.label)}</strong><small>{t(tool.description)}</small></span></li>)}</ul>
    </div>
  </fieldset>;
}

/** The company's tailored tools, shown first on its profile. */
export function CompanyTypeTools({ company }: { company: { id: string; organizationType?: unknown; serviceCategory?: unknown } }) {
  const { t } = useLanguage(), { user } = useSession(), profile = companyTypeOf(company.organizationType);
  const can = (section?: string) => !section || user?.roleId === "role-main-manager" || Boolean(user?.permissions.some(p => ["*", `${section}.*`, `${section}.view`].includes(p)));
  const tools = profile.tools.filter(tool => can(tool.section));
  return <section className="card company-type-tools"><header className="section-heading"><div><p className="eyebrow">{t(profile.label)}{company.serviceCategory ? <> · {t(String(company.serviceCategory))}</> : null}</p><h2>{t("Business tools")}</h2><p className="hint">{t(profile.tagline)}</p></div><span className="company-type-badge"><MobileIcon name={profile.icon} />{t(profile.label)}</span></header>
    <div className="company-type-tool-grid">{tools.map(tool => <Link key={tool.label} to={tool.path(company.id)} className="company-type-tool"><MobileIcon name={tool.icon} /><span><strong>{t(tool.label)}</strong><small>{t(tool.description)}</small></span><MobileIcon name="chevron" /></Link>)}</div>
  </section>;
}
