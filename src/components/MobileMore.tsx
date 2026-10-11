import MobileIcon, { type MobileIconName } from "./MobileIcon";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useSession } from "../session-context";
import ProfilePanel from "./ProfilePanel";

export default function MobileMore() {
  const { user, signOut } = useSession();
  const [profile, setProfile] = useState(false);
  const can = (section: string) => Boolean(user?.permissions.some((permission) => ["*", `${section}.*`, `${section}.view`].includes(permission)));
  const links: { to: string; section: string; label: string; icon: MobileIconName }[] = [{ to: "/organizations", section: "organizations", icon: "companies", label: "Companies" }, { to: "/locations", section: "locations", icon: "locations", label: "Locations & activity" }, { to: "/hr", section: "hr", icon: "people", label: "Workforce & HR" }, { to: "/operations", section: "operations", icon: "work", label: "Operations" }, { to: "/inventory", section: "inventory", icon: "inventory", label: "Inventory" }, { to: "/finance", section: "finance", icon: "finance", label: "Finance" }];
  return <div className="page mobile-people"><h1>More</h1><section className="card"><h2>My account</h2><p className="hint">{user?.name} · {user?.email}</p><button className="primary" onClick={() => setProfile(true)}><MobileIcon name="profile" />My profile & password</button>{can("hr") && <NavLink className="mobile-record" to="/me/files">My files & policies</NavLink>}</section><section className="card"><h2>Workspace services</h2>{links.filter((link) => can(link.section)).map((link) => <NavLink className="mobile-record mobile-service-row" key={link.to} to={link.to}><span className="mobile-service-icon"><MobileIcon name={link.icon} /></span><strong>{link.label}</strong><MobileIcon name="chevron" /></NavLink>)}{user?.roleId === "role-main-manager" && <NavLink className="mobile-record" to="/admin"><strong>Access & Settings</strong><span>Manage companies, employees and permissions</span></NavLink>}</section><section className="card"><a className="mobile-record mobile-service-row" href="/welcome"><MobileIcon name="home" /><strong>STOCRANT website</strong><MobileIcon name="chevron" /></a><NavLink className="mobile-record" to="/about">About STOCRANT</NavLink><button onClick={() => void signOut()}><MobileIcon name="logout" />Sign out</button></section>{profile && <ProfilePanel onClose={() => setProfile(false)} />}</div>;
}
