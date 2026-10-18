import { request } from "../api";
import { EmployeeCommunicationLink } from "./EmployeeActivation";
import ChoiceSelect from "./ChoiceSelect";
import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useLanguage } from "../language-context";
import type { CollectionItem } from "../types";
import { formatFieldValue } from "../util";

function initials(name: unknown) {
  return String(name ?? "ST").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "ST";
}

function readable(value: unknown, fallback = "Not recorded") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function titleCase(value: unknown) {
  return String(value ?? "").split("-").filter(Boolean).map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

function StatusPill({ status }: { status: unknown }) {
  const { t } = useLanguage();
  const value = String(status ?? "unrecorded").toLowerCase().replace(/ /g, "-");
  return <span className={`hr-status hr-status--${value}`}>{t(value) === value ? t(titleCase(value)) : t(value)}</span>;
}

export type EmployeeSort = "name" | "code" | "department" | "hireDate";
const PAGE_SIZE = 12;

export default function EmployeeDirectory({ employees, departments, canCreate, canEdit, canDelete, deleting, onDelete }: {
  employees: CollectionItem[];
  departments: CollectionItem[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  deleting: boolean;
  onDelete: (id: string) => void;
}) {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Record<string,string>>({});
  useEffect(() => { if (!canEdit) return; let active = true; void request<{employees: {id:string; account: {status:string}|null}[]}>("/workspace/hr/communication/employees").then(result => { if(active) setAccounts(Object.fromEntries(result.employees.map(item => [item.id,item.account?.status || "No linked account"]))); }).catch(() => {}); return () => {active=false;}; },[employees,canEdit]);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [location, setLocation] = useState("all");
  const [status, setStatus] = useState("all");
  const [hrOnly, setHrOnly] = useState(false);
  const [sort, setSort] = useState<EmployeeSort>("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const locale = language === "ar" ? "ar" : "en";
  const locations = useMemo(() => [...new Set(employees.map((item) => String(item.location ?? "")).filter(Boolean))].sort(), [employees]);
  const statuses = useMemo(() => [...new Set(employees.map((item) => String(item.status ?? "")).filter(Boolean))].sort(), [employees]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return employees.filter((item) => {
      if (needle) {
        const haystack = [item.name, item.employeeCode, item.id, item.email, item.phone].map((value) => String(value ?? "").toLocaleLowerCase()).join(" ");
        if (!haystack.includes(needle)) return false;
      }
      if (department !== "all" && String(item.department ?? "") !== department) return false;
      if (location !== "all" && String(item.location ?? "") !== location) return false;
      if (status !== "all" && String(item.status ?? "") !== status) return false;
      if (hrOnly && !/hr|human resources/i.test(String(item.department ?? ""))) return false;
      return true;
    });
  }, [employees, query, department, location, status, hrOnly]);
  const sorted = useMemo(() => {
    const key = (item: CollectionItem) => sort === "name" ? String(item.name ?? "") : sort === "code" ? String(item.employeeCode ?? item.id) : sort === "department" ? String(item.department ?? "") : String(item.hireDate ?? "");
    return [...filtered].sort((a, b) => direction === "asc" ? key(a).localeCompare(key(b), locale) : key(b).localeCompare(key(a), locale));
  }, [filtered, sort, direction, locale]);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const rows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const resetPage = () => setPage(1);
  const toggleSort = (column: EmployeeSort) => {
    if (sort === column) setDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSort(column); setDirection("asc"); }
    resetPage();
  };
  const sortLabel = (column: EmployeeSort) => sort === column ? (direction === "asc" ? " ↑" : " ↓") : "";
  return <section className="card hr-directory" aria-labelledby="hr-directory-title">
    <div className="hr-section-heading"><div><p className="eyebrow">{t("Employee management")}</p><h2 id="hr-directory-title">{t("Employee table")}</h2></div>{canCreate ? <button type="button" className="primary" onClick={() => navigate("/hr/employees/new")}>{t("Add employee")}</button> : null}</div>
    <DirectoryToolbar query={query} setQuery={setQuery} resetPage={resetPage} department={department} setDepartment={setDepartment} departments={departments} location={location} setLocation={setLocation} locations={locations} status={status} setStatus={setStatus} statuses={statuses} hrOnly={hrOnly} setHrOnly={setHrOnly} />
    {employees.length ? rows.length ? <div className="table-wrap"><table className="table hr-directory-table">
      <thead><tr>
        <th scope="col"><button type="button" className="hr-sort" onClick={() => toggleSort("code")}>{t("Employee ID")}{sortLabel("code")}</button></th>
        <th scope="col">{t("Employee")}</th>
        <th scope="col"><button type="button" className="hr-sort" onClick={() => toggleSort("name")}>{t("Name")}{sortLabel("name")}</button></th>
        <th scope="col"><button type="button" className="hr-sort" onClick={() => toggleSort("department")}>{t("Department")}{sortLabel("department")}</button></th>
        <th scope="col">{t("Job title")}</th>
        <th scope="col">{t("Work location")}</th>
        <th scope="col">{t("Phone")}</th>
        <th scope="col">{t("Status")}</th><th scope="col">{t("Account status")}</th>
        <th scope="col"><button type="button" className="hr-sort" onClick={() => toggleSort("hireDate")}>{t("Join date")}{sortLabel("hireDate")}</button></th>
        <th scope="col"><span className="visually-hidden">{t("Actions")}</span></th>
      </tr></thead>
      <tbody>{rows.map((item) => <tr key={item.id}>
        <td>{readable(item.employeeCode, String(item.id))}</td>
        <td><button type="button" className="hr-directory-person" onClick={() => navigate(`/hr/employees/${item.id}`)}><span className="hr-avatar" aria-hidden="true">{initials(item.name)}</span><span><strong>{readable(item.name, "Unnamed employee")}</strong><small>{readable(item.email, "No email on file")}</small></span></button></td>
        <td>{readable(item.name, "Unnamed employee")}</td>
        <td>{readable(item.department, "—")}</td>
        <td>{readable(item.jobTitle, "—")}</td>
        <td>{readable(item.location, "—")}</td>
        <td dir="ltr">{readable(item.phone, "—")}</td>
        <td><StatusPill status={item.status} /></td><td>{accounts[item.id] ? t(accounts[item.id]) : "?"}</td>
        <td>{formatFieldValue(item.hireDate)}</td>
        <td><span className="hr-directory-actions">{canEdit && <EmployeeCommunicationLink employeeId={item.id} />}<button type="button" onClick={() => navigate(`/hr/employees/${item.id}`)}>{t("View")}</button>{canEdit ? <button type="button" onClick={() => navigate(`/hr/employees/${item.id}/edit`)}>{t("Edit")}</button> : null}{canDelete ? <button type="button" className="danger" disabled={deleting} onClick={() => onDelete(item.id)}>{t("Delete")}</button> : null}</span></td>
      </tr>)}</tbody>
    </table></div> : <div className="hr-empty-state"><p>{t("No employees match these filters.")}</p></div> : <div className="hr-empty-state"><p>{t("No employees yet.")}</p>{canCreate ? <NavLink to="/hr/employees/new">{t("Add the first employee")}</NavLink> : null}</div>}
    {pages > 1 ? <div className="hr-pagination"><span>{t("Page")} {currentPage} / {pages} · {sorted.length} {t("employees")}</span><div className="inline-actions"><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{t("Previous")}</button><button type="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>{t("Next")}</button></div></div> : null}
  </section>;
}

function DirectoryToolbar({ query, setQuery, resetPage, department, setDepartment, departments, location, setLocation, locations, status, setStatus, statuses, hrOnly, setHrOnly }: {
  query: string; setQuery: (value: string) => void; resetPage: () => void;
  department: string; setDepartment: (value: string) => void; departments: CollectionItem[];
  location: string; setLocation: (value: string) => void; locations: string[];
  status: string; setStatus: (value: string) => void; statuses: string[];
  hrOnly: boolean; setHrOnly: (value: boolean) => void;
}) {
  const { t } = useLanguage();
  return <div className="hr-directory-toolbar">
    <label className="hr-directory-search"><span className="visually-hidden">{t("Search employees")}</span><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); resetPage(); }} placeholder={t("Search name or ID…")} /></label>
    <label className="hr-directory-field"><span>{t("Department")}</span><ChoiceSelect value={department} onChange={(event) => { setDepartment(event.target.value); resetPage(); }}><option value="all">{t("All departments")}</option>{departments.map((item) => String(item.name ?? "")).filter(Boolean).sort().map((name) => <option key={name} value={name}>{name}</option>)}</ChoiceSelect></label>
    <label className="hr-directory-field"><span>{t("Work location")}</span><ChoiceSelect value={location} onChange={(event) => { setLocation(event.target.value); resetPage(); }}><option value="all">{t("All locations")}</option>{locations.map((name) => <option key={name} value={name}>{name}</option>)}</ChoiceSelect></label>
    <label className="hr-directory-field"><span>{t("Status")}</span><ChoiceSelect value={status} onChange={(event) => { setStatus(event.target.value); resetPage(); }}><option value="all">{t("All statuses")}</option>{statuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</ChoiceSelect></label>
    <label className="hr-directory-check"><input type="checkbox" checked={hrOnly} onChange={(event) => { setHrOnly(event.target.checked); resetPage(); }} />{t("HR department only")}</label>
  </div>;
}
