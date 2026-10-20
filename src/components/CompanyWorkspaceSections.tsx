import { ReportLink } from "./CompanyReport";
import { hasPermission } from "../access-control";
import { useSession } from "../session-context";
import { Link } from "react-router-dom";
import { useLanguage } from "../language-context";
import type { CollectionItem } from "../types";

export const companySections = [
  ["overview", "Overview", "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"],
  ["employees", "Employees", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6m-3-3h6"],
  ["hr", "HR & Attendance", "M8 2v4m8-4v4M3 10h18M3 4h18v17H3zM7 14h3m4 0h3m-10 4h3"],
  ["payroll", "Payroll", "M3 5h18v14H3zM3 9h18M7 15h3m6-2v4"],
  ["notifications", "Notifications", "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"],
  ["users", "Users & Permissions", "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7zM8 12l3 3 5-6"],
  ["reports", "Reports", "M4 3v18h17M8 17v-5m5 5V8m5 9V5"],
  ["settings", "Company Settings", "M4 7h16M4 17h16M8 4v6m8 4v6"],
] as const;
export type CompanySection = typeof companySections[number][0];
export function CompanySectionIcon({ path }: { path: string }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg>; }
export type WorkspaceData = { records: Record<string, CollectionItem[]>; payroll: CollectionItem[]; users: {id:string;name:string;username?:string;status:string;roleName?:string}[] };
const text = (v: unknown) => typeof v === "string" || typeof v === "number" ? String(v) : "";
export default function CompanyWorkspaceSections({ section, data, companyId, manageAccount, viewHr, viewPayroll }: { section: CompanySection; data: WorkspaceData; companyId:string; manageAccount:boolean; viewHr:boolean; viewPayroll:boolean }) {
  const {t,language}=useLanguage();
  const {user}=useSession();
  const query=`?company=${encodeURIComponent(companyId)}`;
  const records = (name:string, title:string, columns:string[]) => {
    const items=[...(data.records[name]??[])].sort((a,b)=>text(b.date??b.createdAt).localeCompare(text(a.date??a.createdAt)));
    return <section className="card company-record-panel" key={name}><header><h2>{t(title)} <span className="badge">{items.length}</span></h2><Link to={`/hr/${name}${query}`}>{t("Open records")}</Link></header>{items.length?<div className="table-wrap"><table className="table"><thead><tr>{columns.map(c=><th key={c}>{t(c)}</th>)}<th>{t("Actions")}</th></tr></thead><tbody>{items.slice(0,10).map(row=><tr key={row.id}>{columns.map(c=><td key={c}>{(c==="Status"||c==="Type"?t:text)(text(row[({Employee:"employee",Date:"date",Status:"status",Name:"name",Start:"start",End:"end",Type:"type"} as Record<string,string>)[c]]))||"—"}</td>)}<td><Link to={`/hr/${name}/${encodeURIComponent(row.id)}`}>{t("View")}</Link></td></tr>)}</tbody></table></div>:<p className="empty">{t("No company records yet.")}</p>}</section>;
  };
  if(section==="hr")return <div className="company-panel-stack">{records("shifts","Shifts",["Name","Start","End"])}{records("attendance","Attendance records",["Employee","Date","Status"])}{records("leaveRequests","Leave management",["Employee","Type","Status"])}</div>;
  if(section==="payroll")return <section className="card company-record-panel"><header><div><h2>{t("Company payroll")}</h2><p className="hint">{t("Salary versions, periods, overtime and deductions.")}</p></div><Link className="primary-link" to={`/hr/payroll${query}`}>{t("Open payroll")}</Link></header>{data.payroll.length?<div className="table-wrap"><table className="table"><thead><tr>{["Period","Status","Currency","Actions"].map(c=><th key={c}>{t(c)}</th>)}</tr></thead><tbody>{[...data.payroll].sort((a,b)=>text(b.start).localeCompare(text(a.start))).map(row=><tr key={row.id}><td>{text(row.start)} — {text(row.end)}</td><td><span className="badge">{t(text(row.status))}</span></td><td>{text(row.currency)}</td><td><Link to={`/hr/payroll${query}&run=${encodeURIComponent(row.id)}`}>{t("View report")}</Link></td></tr>)}</tbody></table></div>:<p className="empty">{t("No company payroll periods yet.")}</p>}</section>;
  if(section==="notifications")return <section className="card company-record-panel"><h2>{t("Company communication")}</h2><p className="hint">{t("Send announcements, shift updates and meeting invitations to company employees.")}</p><div className="company-feature-grid">{["Important Announcement","Urgent Shift Change","Meeting Invitation","General Message"].map(type=><Link key={type} to={`/hr/communication${query}&type=${encodeURIComponent(type)}`}><CompanySectionIcon path={companySections[4][2]}/><strong>{t(type)}</strong><span>{t("Open composer")}</span></Link>)}</div></section>;
  if(section==="users")return <section className="card company-record-panel"><header><h2>{t("Assigned users")}</h2>{manageAccount&&<Link to={`/admin?tab=Users&company=${encodeURIComponent(companyId)}`}>{t("Manage accounts")}</Link>}</header>{data.users.length?<ul className="company-user-list">{data.users.map(user=><li key={user.id}><div><strong>{user.name}</strong><small>{user.username} · {t(user.roleName||"Employee")}</small></div><span className="badge">{t(user.status)}</span>{manageAccount&&<Link to={`/admin?tab=Users&user=${encodeURIComponent(user.id)}`}>{t("Manage account")}</Link>}</li>)}</ul>:<p className="empty">{t("No assigned users.")}</p>}</section>;
  if(section==="reports")return <section className="card company-record-panel"><h2>{t("Company reports")}</h2><div className="company-feature-grid">{hasPermission(user,"organizations","export")&&<ReportLink companyId={companyId} kind="company" label="Company information"/>}{hasPermission(user,"hr","export")&&viewHr&&[["employees","Complete employee list"],["contacts","Employee contact directory"],["attendance","Attendance report"],["shifts","Shift report"],["leave","Leave records"]].map(([kind,label])=><ReportLink key={kind} companyId={companyId} kind={kind} label={label}/>)}</div><p className="hint">{t("Reports use only records available within your company access.")}</p><div className="company-feature-grid">{viewHr&&<><Link to={`?section=employees`}><strong>{t("Employee summary")}</strong><span>{t("Directory, status and department filters")}</span></Link><Link to={`/hr/attendance?company=${encodeURIComponent(companyId)}`}><strong>{t("Attendance report")}</strong><span>{t("Timesheets and attendance records")}</span></Link></>}{viewPayroll&&<Link to={`/hr/payroll${query}`}><strong>{t("Payroll report")}</strong><span>{t("Periods, payslips and export")}</span></Link>}</div><p className="hint">{t("Updated")}: {new Date().toLocaleDateString(language==="ar"?"ar":"en-US")}</p></section>;
  return null;
}
