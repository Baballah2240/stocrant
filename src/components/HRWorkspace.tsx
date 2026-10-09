import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api";
import { formatDate } from "../util";
import BackButton from "./BackButton";
import type { CollectionItem } from "../types";

const hrLinks = [
  { collection: "employees", label: "Employees", description: "Profiles, titles, departments, contacts and employment status" },
  { collection: "departments", label: "Departments", description: "Teams, cost centers and responsible managers" },
  { collection: "attendance", label: "Attendance", description: "Daily attendance and work mode records" },
  { collection: "leaveRequests", label: "Leave", description: "Leave requests and status history" },
  { collection: "employeeHistory", label: "Employee history", description: "Hiring, changes and employment events" },
];

export default function HRWorkspace() {
  const [birthdays, setBirthdays] = useState<CollectionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; api.workspace.birthdays().then((data) => active && setBirthdays(data.items)).catch((err: unknown) => active && setError(err instanceof Error ? err.message : "Could not load upcoming birthdays.")); return () => { active = false; }; }, []);
  const visibleBirthdays = useMemo(() => birthdays.slice(0, 8), [birthdays]);
  return <div className="page"><div className="page-head"><div><BackButton /><h1>Workforce & HR</h1><p className="hint">Employee records are permission-protected; changes are retained in employee history.</p></div><NavLink className="primary-link" to="/hr/employees/new">Add employee</NavLink></div>{error && <p className="error">{error}</p>}<div className="workspace-split"><section className="card"><div className="list-heading"><h2>Upcoming birthdays</h2><span>Next 60 days</span></div>{visibleBirthdays.length ? <div className="stack-list">{visibleBirthdays.map((employee) => <div className="timeline-row" key={employee.id}><strong>{String(employee.name)}</strong><span>{String(employee.jobTitle ?? employee.department ?? "Employee")} · {formatDate(String(employee.birthday))}</span></div>)}</div> : <p className="hint">No birthdays are recorded for the next 60 days.</p>}</section><section className="card"><div className="list-heading"><h2>HR records</h2><span>Private fields are redacted where needed</span></div><div className="stack-list">{hrLinks.map((link) => <NavLink className="selection-row" key={link.collection} to={`/hr/${link.collection}`}><strong>{link.label}</strong><span>{link.description}</span></NavLink>)}</div></section></div></div>;
}