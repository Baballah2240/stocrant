import { NavLink, Outlet } from "react-router-dom";
import { useTheme } from "../theme-context";
import { useSession } from "../session-context";
import { NotificationBell } from "./NotificationBell";

interface NavEntry {
  to: string;
  label: string;
  section?: string;
  end?: boolean;
}

const navItems: NavEntry[] = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/organizations", label: "Organizations", section: "organizations" },
  { to: "/locations", label: "Locations", section: "locations" },
  { to: "/hr", label: "Workforce & HR", section: "hr" },
  { to: "/operations", label: "Operations", section: "operations" },
  { to: "/warehouse", label: "Inventory", section: "inventory" },
  { to: "/finance", label: "Finance", section: "finance" },
  { to: "/admin", label: "Access & Settings", section: "access" },
];

const aboutItem: NavEntry = {
  to: "/about",
  label: "About",
};

function NavButton({ item }: { item: NavEntry }) {
  return (
    <NavLink to={item.to} end={item.end} className="nav-item" aria-label={item.label}>
      <span className="nav-label">{item.label}</span>
    </NavLink>
  );
}

export default function Layout() {
  const { theme, toggle } = useTheme();
  const { user, signOut } = useSession();
  const nextTheme = theme === "light" ? "dark" : "light";
  const visibleNavItems = navItems.filter((item) => !item.section || user?.permissions.includes("*") || user?.permissions.includes(`${item.section}.*`) || user?.permissions.includes(`${item.section}.view`));

  return (
    <div className="ios-app">
      <header className="topbar">
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
        <div className="topbar-actions">
          <span className="user-label">{user?.name}</span>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggle}
            aria-label={`Switch to ${nextTheme} mode`}
            title={`Switch to ${nextTheme} mode`}
          >
            <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
          </button>
          <button type="button" className="ghost" onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>

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
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
