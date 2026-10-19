import { useLanguage } from "../language-context";
import { NavLink } from "react-router-dom";
import { useSession } from "../session-context";
import BackButton from "./BackButton";
export default function AboutPage() {
  const { t } = useLanguage();
 const { user } = useSession();
 const features = [["Companies & locations", "Company profiles, locations and activity history in one place."], ["Workforce & HR", "Employee profiles, attendance, leave and employment records."], ["Operations", "Assignments, deadlines and progress for daily work."], ["Inventory", "Stock balances, employee access and movement history."], ["Finance", "Company accounts, payments, people and printable reports."], ["Access & accountability", "Main-admin permission controls and recorded changes."]];
 return <div className="page about-page"><BackButton /><section className="card about-hero"><p className="eyebrow">{t("One workspace for your business")}</p><h1>{t("About STOCRANT")}</h1><p>{t("Connect your companies, people, daily work and money in one place.")}</p><span className="badge">{t("Version 1.0.0")}</span></section><section className="about-feature-grid">{features.map(([title, description]) => <article className="card" key={title}><h2>{title}</h2><p className="hint">{description}</p></article>)}</section><section className="card"><h2>{t("Make the workspace yours")}</h2><p>{t("Open your name in the header to update your personal details, profile photo or password. Use the notification bell to review work and alerts.")}</p><p>{t("Search records by company and print inventory or financial reports from their sections.")}</p><div className="inline-actions"><NavLink className="primary-link" to="/">{t("Open dashboard")}</NavLink>{user?.roleId === "role-main-manager" && <NavLink to="/admin">{t("Manage access & settings")}</NavLink>}</div></section></div>;
}
