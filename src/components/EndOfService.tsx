import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../api";
import { useLanguage } from "../language-context";
import { formatDate } from "../util";
import BackButton from "./BackButton";
import ChoiceSelect from "./ChoiceSelect";

type Report = { asOf: string; companies: { id: string; name: string; currency: string; daysPerYear: number; daysAfterFiveYears: number; minimumYears: number; configured: boolean }[]; employees: { employeeId: string; employee: string; employeeCode?: string; organizationId: string; status: string; hireDate: string; terminationDate: string; years: number; monthlySalary: string; currency: string; liability: string; salaryConfirmed: boolean }[] };

/** End-of-service benefit (مكافأة نهاية الخدمة) owed to each employee under the company's own configured rule. */
export default function EndOfService() {
  const { t, language } = useLanguage(), [data, setData] = useState<Report | null>(null), [error, setError] = useState(""), [companyId, setCompanyId] = useState("");
  useEffect(() => { let active = true; void request<Report>("/workspace/payroll/end-of-service").then(value => { if (active) setData(value); }).catch(err => { if (active) setError((err as Error).message); }); return () => { active = false; }; }, []);
  const money = (value: string, currency: string) => new Intl.NumberFormat(language === "ar" ? "ar-QA" : "en-GB", { style: "currency", currency }).format(Number(value || 0));
  const companies = (data?.companies || []).filter(c => !companyId || c.id === companyId);
  return <div className="page end-of-service">
    <div className="page-head"><div><BackButton /><h1>{t("End-of-service benefits")}</h1><p className="hint">{t("Each employee's service and the end-of-service benefit owed today under the company's own rule. Labour laws differ by country (for example Sudan, Qatar or Saudi Arabia), so each company sets its own days per year in its company settings.")}</p></div></div>
    {error && <p className="alert alert--bad" role="alert">{t(error)}</p>}
    {!data && !error && <p role="status">{t("Loading…")}</p>}
    {data && <>
      <section className="card workspace-toolbar"><label>{t("Company")}<ChoiceSelect value={companyId} onChange={e => setCompanyId(e.target.value)}><option value="">{t("All companies")}</option>{data.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</ChoiceSelect></label><span>{t("As of")} {formatDate(data.asOf)}</span></section>
      {companies.map(company => { const people = data.employees.filter(e => e.organizationId === company.id), total = people.reduce((n, e) => n + Number(e.liability), 0);
        return <section className="card" key={company.id}><div className="finance-card-heading"><h2>{company.name}</h2><strong>{money(String(total), company.currency || "QAR")}</strong></div>
          {company.configured ? <p className="hint">{t("Rule: {first} days of monthly salary per year for the first 5 years, {after} days per year after, from {minimum} years of service.", { first: company.daysPerYear, after: company.daysAfterFiveYears, minimum: company.minimumYears })}</p>
            : <p className="alert">{t("No end-of-service rule is set for this company.")} <Link to={`/organization/companies/${encodeURIComponent(company.id)}/edit`}>{t("Set the rule in company settings")}</Link></p>}
          <div className="table-wrap"><table className="table"><thead><tr><th>{t("Employee")}</th><th>{t("Hire date")}</th><th>{t("Years of service")}</th><th>{t("Monthly salary")}</th><th>{t("Benefit owed")}</th></tr></thead><tbody>
            {people.map(e => <tr key={e.employeeId}><td><strong>{e.employee}</strong><span className="cell-sub">{e.employeeCode}{e.terminationDate && <> · {t("Leaving date")} {formatDate(e.terminationDate)}</>}</span></td><td>{formatDate(e.hireDate)}</td><td>{e.years.toFixed(2)}</td><td>{money(e.monthlySalary, e.currency)}{!e.salaryConfirmed && <span className="cell-sub">{t("From employee record; confirm a salary in Payroll")}</span>}</td><td><strong>{money(e.liability, e.currency)}</strong></td></tr>)}
            {!people.length && <tr><td colSpan={5}>{t("No employees with a hire date.")}</td></tr>}
          </tbody></table></div></section>; })}
      <p className="hint">{t("The same amounts build up monthly in the general ledger as an end-of-service provision. Record the final payment in Finance as an End-of-service movement.")}</p>
    </>}
  </div>;
}
