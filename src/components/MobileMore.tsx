import { useLanguage } from "../language-context";
import MobileIcon, { type MobileIconName } from "./MobileIcon";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useSession } from "../session-context";
import ProfilePanel from "./ProfilePanel";

export default function MobileMore() {
  const { t } = useLanguage();
  const { user, signOut } = useSession();
  const [profile, setProfile] = useState(false);
  const can = (section: string) => Boolean(user?.permissions.some((permission) => ["*", `${section}.*`, `${section}.view`].includes(permission)));
  const links: { to: string; section: string; label: string; icon: MobileIconName }[] = [{ to: "/shops", label: "Shops & orders", icon: "shop", section: "inventory" },{ to: "/hr/payroll", section: "payroll", icon: "payroll", label: "Payroll" }, { to: "/organizations", section: "organizations", icon: "companies", label: "Companies" }, { to: "/locations", section: "locations", icon: "locations", label: "Locations & activity" }, { to: "/hr", section: "hr", icon: "people", label: "Workforce & HR" }, { to: "/operations", section: "operations", icon: "work", label: "Operations" }, { to: "/customer-service", section: "customerService", icon: "support", label: "Customer Service" }, { to: "/inventory", section: "inventory", icon: "inventory", label: "Inventory" }, { to: "/finance", section: "finance", icon: "finance", label: "Finance" }];
  return <div className="page mobile-people mobile-more-page">
    <header><p className="eyebrow">{t("Business workspace")}</p><h1>{t("More")}</h1></header>
    <section className="card">
      <div className="mobile-more-heading"><span className="mobile-account-avatar">{user?.avatar ? <img src={user.avatar} alt="" /> : user?.name.slice(0,2).toUpperCase()}</span><div><h2>{user?.name}</h2><p className="hint">{user?.email}</p></div></div>
      <button type="button" className="primary" onClick={() => setProfile(true)}><MobileIcon name="profile" />{t("My profile & password")}</button>
      <nav className="mobile-account-links" aria-label={t("My account")}><NavLink to="/me/payroll"><MobileIcon name="payslip" />{t("My payslips")}</NavLink>{can("hr") && <NavLink to="/me/files"><MobileIcon name="files" />{t("My files & policies")}</NavLink>}</nav>
    </section>
    <section className="mobile-more-section"><h2>{t("Workspace services")}</h2><nav className="mobile-services-grid" aria-label={t("Workspace services")}>
      {links.filter(link => can(link.section) && (link.to !== "/shops" || can("operations"))).map(link => <NavLink className="mobile-service-tile" key={link.to} to={link.to}><span className="mobile-service-icon"><MobileIcon name={link.icon} /></span><strong>{t(link.label)}</strong></NavLink>)}
      {user?.roleId === "role-main-manager" && <NavLink className="mobile-service-tile" to="/admin"><span className="mobile-service-icon"><MobileIcon name="settings" /></span><strong>{t("Access & Settings")}</strong></NavLink>}
    </nav></section>
    <section className="card mobile-more-footer"><NavLink to="/about">{t("About STOCRANT")}</NavLink><button type="button" onClick={() => void signOut()}><MobileIcon name="logout" />{t("Sign out")}</button></section>
    {profile && <ProfilePanel onClose={() => setProfile(false)} />}
  </div>;
}
