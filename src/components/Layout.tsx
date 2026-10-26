import { isNativeApp } from "../api";
import AppearanceSelector from "./AppearanceSelector";
import { UrgentEmployeeBanner } from "./HRMessageDetails";
import MobileIcon, { type MobileIconName } from "./MobileIcon";
import { useMobile } from "../use-mobile";
import { Suspense, useEffect, useRef, useState } from "react";
import ProfilePanel from "./ProfilePanel";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import BackButton from "./BackButton";
import { useSession } from "../session-context";
import { NotificationBell } from "./NotificationBell";
import { useLanguage } from "../language-context";
import "../dashboard-reference.css";
import "../workspace-menu.css";

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
  { to: "/shops", label: "Shops & orders", icon: "inventory", section: "inventory" },
  { to: "/customer-service", label: "Customer Service", icon: "work", section: "customerService" },
  { to: "/warehouse", label: "Inventory", icon: "inventory", section: "inventory" },
  { to: "/hr/payroll", label: "Payroll", icon: "finance", section: "payroll" },
  { to: "/me/payroll", label: "My payslips", icon: "finance" },
  { to: "/finance", label: "Finance", icon: "finance", section: "finance" },
  { to: "/admin", label: "Access & Settings", icon: "settings", section: "access" },
  { to: "/security", label: "App lock", icon: "settings" },
];

const aboutItem: NavEntry = {
  to: "/about",
  label: "About", icon: "info",
};

function NavButton({ item, onNavigate }: { item: NavEntry; onNavigate?: () => void }) {
  const { t } = useLanguage();
  const { pathname } = useLocation();
  const sectionActive = item.to === "/hr" ? pathname === "/hr" || (pathname.startsWith("/hr/") && !pathname.startsWith("/hr/payroll"))
    : item.to === "/organizations" ? pathname.startsWith("/organization/") || pathname === item.to
    : item.to === "/warehouse" ? pathname.startsWith("/inventory") || pathname.startsWith("/warehouse")
    : item.to === "/locations" ? ["/locations", "/stores", "/places", "/people"].includes(pathname)
    : item.to === "/operations" ? pathname.startsWith("/operations") || pathname.startsWith("/stores/") || pathname === "/store"
    : item.to === "/admin" ? pathname.startsWith("/admin") || pathname === "/access"
    : undefined;
  return (
    <NavLink to={item.to === "/" && !isNativeApp() ? "/workspace" : item.to} end={item.end ?? item.to === "/hr"} className={({ isActive }) => `nav-item${(sectionActive ?? isActive) ? " active" : ""}`} aria-current={sectionActive ? "page" : undefined} title={t(item.label)} aria-label={t(item.label)} onClick={onNavigate}>
      {item.icon && <MobileIcon name={item.icon} />}<span className="nav-label">{t(item.label)}</span>
    </NavLink>
  );
}

export default function Layout() {
  const { language, setLanguage, t } = useLanguage();
  const mobile = useMobile();
  const location = useLocation();
  const parentPath = location.pathname.split("/").filter(Boolean).slice(0, -1).join("/");
  const backFallback = parentPath === "me" ? "/" : parentPath === "organization" ? "/organizations" : parentPath ? `/${parentPath}` : "/";
  const [profileOpen, setProfileOpen] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<File | undefined>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem("stocrant-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const menuRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = menuRef.current;
    if (!dialog) return;
    if (mobile && menuOpen && !dialog.open) dialog.showModal();
    else if ((!mobile || !menuOpen) && dialog.open) dialog.close();
  }, [mobile, menuOpen]);
  useEffect(() => {
    try {
      window.localStorage.setItem("stocrant-sidebar-collapsed", String(sidebarCollapsed));
    } catch {
      // Private browsing or device policies can disable local storage.
    }
  }, [sidebarCollapsed]);
  const { user, signOut } = useSession();
  const mainAdmin = user?.roleId === "role-main-manager";
  const canSeeSection = (section?: string) => !section || mainAdmin || Boolean(user?.permissions.includes("*") || user?.permissions.includes(`${section}.*`) || user?.permissions.includes(`${section}.view`));
  const visibleNavItems = navItems.filter(item => canSeeSection(item.section) && (item.to !== "/shops" || canSeeSection("operations")));
  const closeSidebarAfterNavigation = () => {
    // Keep the chosen navigation width when moving between sections.
  };

  return (
    <div className={`ios-app ${["/", "/workspace"].includes(location.pathname) ? "dashboard-shell" : ""} ${mobile ? "mobile-layout" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">{t("Skip to content")}</a><header className="topbar">
        {mobile ? <>{location.pathname !== "/" && <BackButton className="mobile-header-back" fallback={backFallback} />}<button className="mobile-header-control" type="button" aria-label={t("Open account menu")} aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="mobile-account-menu" onClick={() => setMenuOpen(true)}><svg className="mobile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button><div className="topbar-spacer" /><NotificationBell className="mobile-header-notifications" /></> : <><div className="topbar-brand">
          <button className="workspace-sidebar-toggle" type="button" aria-label={t("Primary navigation")} aria-controls="primary-navigation" aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <span className="brand-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <rect x="1" y="1" width="22" height="22" rx="6.5" />
              <path d="M7 7.5h10M7 12h7M7 16.5h10" />
            </svg>
          </span>
          <span className="brand-name">{t("STOCRANT")}</span>
          <span className="workspace-label">{t("Business workspace")}</span>
        </div>
        <div className="topbar-spacer" />
        <NotificationBell />
        <div className="topbar-actions">
          <button className="header-profile" type="button" aria-haspopup="dialog" onClick={() => setProfileOpen(true)}><span className="header-avatar">{user?.avatar ? <img src={user.avatar} alt="" /> : user?.name.slice(0, 2).toUpperCase()}</span><span className="header-user-name">{user?.name}<small>{t("My profile")}</small></span></button>
          <AppearanceSelector />
          <button type="button" className="theme-toggle language-toggle" lang={language === "en" ? "ar" : "en"} dir={language === "en" ? "rtl" : "ltr"} aria-label={t(language === "en" ? "Switch to Arabic" : "Switch to English")} title={t(language === "en" ? "Switch to Arabic" : "Switch to English")} onClick={() => setLanguage(language === "en" ? "ar" : "en")}>{language === "en" ? "العربية" : t("EN")}</button>
          <button type="button" className="logout-button" aria-label={t("Sign out")} title={t("Sign out")} onClick={() => void signOut()}>{t("Sign out")}</button>
        </div></>}
      </header>
      {mobile && <dialog ref={menuRef} id="mobile-account-menu" className="mobile-account-drawer" aria-labelledby="mobile-menu-title" onCancel={() => setMenuOpen(false)} onClose={() => setMenuOpen(false)} onClick={event => { if (event.target === event.currentTarget) setMenuOpen(false); }}>
        <div className="mobile-drawer-content">
          <header className="mobile-drawer-heading"><div><span className="mobile-drawer-brand">{t("STOCRANT")}</span><h2 id="mobile-menu-title">{t("My account")}</h2></div><button type="button" aria-label={t("Close menu")} onClick={() => setMenuOpen(false)}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></header>
          <button className="mobile-drawer-identity" type="button" aria-label={t("My profile")} onClick={() => { setMenuOpen(false); setProfileOpen(true); }}><span className="mobile-drawer-avatar">{user?.avatar ? <img src={user.avatar} alt="" /> : user?.name?.slice(0, 2).toUpperCase() || <MobileIcon name="profile" />}</span><span className="mobile-drawer-user"><strong>{user?.name}</strong><span>{t("My profile")}</span></span><span className="mobile-drawer-chevron" aria-hidden="true">›</span></button>
          <nav className="mobile-drawer-workspace-nav" aria-label={t("Primary navigation")}>
            <span className="mobile-drawer-nav-label">{t("Business workspace")}</span>
            {visibleNavItems.map((item) => <NavButton key={item.to} item={item} onNavigate={() => setMenuOpen(false)} />)}
          </nav>
          <nav className="mobile-drawer-controls" aria-label={t("Account controls")}>
            <NavLink to="/security" onClick={() => setMenuOpen(false)}><MobileIcon name="settings" /><span>{t("App lock")}</span></NavLink>
            <section className="language-settings" aria-labelledby="language-heading">
              <h3 id="language-heading">{t("Language")}</h3>
              <div className="language-options" role="group" aria-label={t("App language")}>
                <button type="button" className="language-option" lang="en" dir="ltr" aria-pressed={language === "en"} onClick={() => setLanguage("en")}><span className="language-code" aria-hidden="true">{t("EN")}</span><span>{t("English")}</span><span className="language-selected" aria-hidden="true">{language === "en" ? <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 10 4 4 8-8" /></svg> : null}</span></button>
                <button type="button" className="language-option" lang="ar" dir="rtl" aria-pressed={language === "ar"} onClick={() => setLanguage("ar")}><span className="language-code" aria-hidden="true">ع</span><span>العربية</span><span className="language-selected" aria-hidden="true">{language === "ar" ? <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 10 4 4 8-8" /></svg> : null}</span></button>
              </div>
              <p>{t("Saved on this device")}</p>
            </section>
            <NavLink to={canSeeSection("access") ? "/admin" : "/mobile-more"} onClick={() => setMenuOpen(false)}><MobileIcon name="settings" /><span>{t("Settings")}</span></NavLink>
            <AppearanceSelector />
          </nav>
          <footer className="mobile-drawer-footer"><NavLink to="/about" onClick={() => setMenuOpen(false)}><MobileIcon name="info" /><span>{t("About")}</span></NavLink><span>{t("STOCRANT")}</span></footer>
        </div>
      </dialog>}

      {mobile && <nav className="mobile-bottom-nav" aria-label={t("Mobile navigation")}><NavLink to={isNativeApp() ? "/" : "/workspace"} end><MobileIcon name="home" />{t("Home")}</NavLink>{user?.roleId !== "role-main-manager" && <><NavLink to="/me/attendance"><MobileIcon name="attendance" />{t("Attendance")}</NavLink><NavLink to="/me/leave"><MobileIcon name="leave" />{t("Leave")}</NavLink></>}{visibleNavItems.some((item) => item.section === "operations") && <NavLink to="/operations?view=mine"><MobileIcon name="work" />{t("Work")}</NavLink>}<NavLink to="/mobile-more"><MobileIcon name="more" />{t("More")}</NavLink></nav>}
      <div className="app">
        <aside id="primary-navigation" className="sidebar" aria-label={t("Primary navigation")} >
          <nav className="nav" aria-label={t("Main navigation")}>
            {[
              { label: "Workspace", paths: ["/", "/organizations", "/locations"] },
              { label: "People & operations", paths: ["/hr", "/operations", "/shops", "/customer-service", "/warehouse"] },
              { label: "Finance", paths: ["/hr/payroll", "/me/payroll", "/finance"] },
              { label: "Settings", paths: ["/admin", "/security"] },
            ].map(group => {
              const links = visibleNavItems.filter(item => group.paths.includes(item.to));
              return links.length ? <div className="workspace-nav-group" key={group.label}><p className="workspace-nav-heading">{t(group.label)}</p>{links.map(item => <NavButton key={item.to} item={item} onNavigate={closeSidebarAfterNavigation}/>)}</div> : null;
            })}
          </nav>
          <div className="nav-bottom">
            {["/", "/workspace"].includes(location.pathname) && <button type="button" className="dashboard-sidebar-profile" onClick={() => setProfileOpen(true)}><span className="dashboard-sidebar-avatar">{user?.avatar ? <img src={user.avatar} alt=""/> : user?.name.slice(0, 2).toUpperCase()}</span><span><strong>{user?.name}</strong><small>{t("My profile")}</small></span><span aria-hidden="true">↗</span></button>}
            <NavButton item={aboutItem} onNavigate={closeSidebarAfterNavigation} />
          </div>
        </aside>
        {profileOpen && <ProfilePanel initialPhoto={profilePhoto} onClose={() => { setProfileOpen(false); setProfilePhoto(undefined); }} />}<main className="main" id="main-content">
          <UrgentEmployeeBanner /><Suspense fallback={<p className="hint" role="status">{t("Loading…")}</p>}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}
