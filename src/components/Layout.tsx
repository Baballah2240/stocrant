import MobileIcon, { type MobileIconName } from "./MobileIcon";
import { useMobile } from "../use-mobile";
import { useState } from "react";
import ProfilePanel from "./ProfilePanel";
import { NavLink, Outlet } from "react-router-dom";
import { useTheme } from "../theme-context";
import { useSession } from "../session-context";
import { NotificationBell } from "./NotificationBell";

interface NavEntry {
  to: string;
  label: string;
  section?: string;
  end?: boolean;
  icon?: MobileIconName;
}

const navItems: NavEntry[] = [
  { to: "/", label: "Dashboard", icon: "home", end: true },
  { to: "/organizations", label: "Organizations", icon: "companies", section: "organizations" },
  { to: "/locations", label: "Locations", icon: "locations", section: "locations" },
  { to: "/hr", label: "Workforce & HR", icon: "people", section: "hr" },
  { to: "/operations", label: "Operations", icon: "work", section: "operations" },
  { to: "/warehouse", label: "Inventory", icon: "inventory", section: "inventory" },
  { to: "/finance", label: "Finance", icon: "finance", section: "finance" },
  { to: "/admin", label: "Access & Settings", icon: "settings", section: "access" },
];

const aboutItem: NavEntry = {
  to: "/about",
  label: "About", icon: "info",
};

function NavButton({ item }: { item: NavEntry }) {
  return (
    <NavLink to={item.to} end={item.end} className="nav-item" aria-label={item.label}>
      {item.icon && <MobileIcon name={item.icon} />}<span className="nav-label">{item.label}</span>
    </NavLink>
  );
}

export default function Layout() {
  const mobile = useMobile();
  const [profileOpen, setProfileOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const { user, signOut } = useSession();
  const nextTheme = theme === "light" ? "dark" : "light";
  const visibleNavItems = navItems.filter((item) => item.section === "access" ? user?.roleId === "role-main-manager" : !item.section || user?.permissions.includes("*") || user?.permissions.includes(`${item.section}.*`) || user?.permissions.includes(`${item.section}.view`));

  return (
    <div className={`ios-app ${mobile ? "mobile-layout" : ""}`}>
      <a className="skip-link" href="#main-content">Skip to content</a><header className="topbar">
        <div className="topbar-brand">
          <span className="brand-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <rect x="1" y="1" width="22" height="22" rx="6.5" />
              <path d="M7 7.5h10M7 12h7M7 16.5h10" />
            </svg>
          </span>
          <span className="brand-name">STOCRANT</span>
          <span className="workspace-label">Business workspace</span>
        </div>
        <div className="topbar-spacer" />
        <NotificationBell />
        <div className="topbar-actions"><a className="workspace-website-link" href="/welcome" aria-label="Visit STOCRANT website" title="Visit website"><MobileIcon name="home" /><span>Website</span></a>
          <button className="header-profile" type="button" aria-haspopup="dialog" onClick={() => setProfileOpen(true)}><span className="header-avatar">{user?.avatar ? <img src={user.avatar} alt="" /> : user?.name.slice(0, 2).toUpperCase()}</span><span className="header-user-name">{user?.name}<small>My profile</small></span></button>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggle}
            aria-label={`Switch to ${nextTheme} mode`}
            title={`Switch to ${nextTheme} mode`}
          >
            <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
          </button>
          <button type="button" className="logout-button" aria-label="Log out" title="Log out" onClick={() => void signOut()}>Log out</button>
        </div>
      </header>

      {mobile && <nav className="mobile-bottom-nav" aria-label="Mobile navigation"><NavLink to="/" end><MobileIcon name="home" />Home</NavLink>{user?.roleId !== "role-main-manager" && <><NavLink to="/me/attendance"><MobileIcon name="attendance" />Attendance</NavLink><NavLink to="/me/leave"><MobileIcon name="leave" />Leave</NavLink></>}{visibleNavItems.some((item) => item.section === "operations") && <NavLink to="/operations?view=mine"><MobileIcon name="work" />Work</NavLink>}<NavLink to="/mobile-more"><MobileIcon name="more" />More</NavLink></nav>}
      <div className="app">
        <aside className="sidebar" aria-label="Primary navigation">
          <nav className="nav" aria-label="Main">
            {visibleNavItems.map((item) => (
              <NavButton key={item.to} item={item} />
            ))}
          </nav>
          <div className="nav-bottom">
            <NavButton item={aboutItem} />
          </div>
        </aside>
        {profileOpen && <ProfilePanel onClose={() => setProfileOpen(false)} />}<main className="main" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
