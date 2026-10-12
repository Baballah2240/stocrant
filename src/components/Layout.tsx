import MobileIcon, { type MobileIconName } from "./MobileIcon";
import { useMobile } from "../use-mobile";
import { Suspense, useEffect, useRef, useState } from "react";
import ProfilePanel from "./ProfilePanel";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import BackButton from "./BackButton";
import { useTheme } from "../theme-context";
import { useSession } from "../session-context";
import { NotificationBell } from "./NotificationBell";
import { useLanguage } from "../language-context";

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
  { to: "/security", label: "App lock", icon: "settings" },
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
  const { language, setLanguage, t } = useLanguage();
  const mobile = useMobile();
  const location = useLocation();
  const parentPath = location.pathname.split("/").filter(Boolean).slice(0, -1).join("/");
  const backFallback = parentPath === "me" ? "/" : parentPath === "organization" ? "/organizations" : parentPath ? `/${parentPath}` : "/";
  const [profileOpen, setProfileOpen] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<File | undefined>();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = menuRef.current;
    if (!dialog) return;
    if (mobile && menuOpen && !dialog.open) dialog.showModal();
    else if ((!mobile || !menuOpen) && dialog.open) dialog.close();
  }, [mobile, menuOpen]);
  const { theme, toggle } = useTheme();
  const { user, signOut } = useSession();
  const nextTheme = theme === "light" ? "dark" : "light";
  const visibleNavItems = navItems.filter((item) => item.section === "access" ? user?.roleId === "role-main-manager" : !item.section || user?.permissions.includes("*") || user?.permissions.includes(`${item.section}.*`) || user?.permissions.includes(`${item.section}.view`));

  return (
    <div className={`ios-app ${mobile ? "mobile-layout" : ""}`}>
      <a className="skip-link" href="#main-content">{t("Skip to content")}</a><header className="topbar">
        {mobile ? <>{location.pathname !== "/" && <BackButton className="mobile-header-back" fallback={backFallback} />}<button className="mobile-header-control" type="button" aria-label="Open account menu" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="mobile-account-menu" onClick={() => setMenuOpen(true)}><svg className="mobile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button><div className="topbar-spacer" /><NotificationBell className="mobile-header-notifications" /></> : <><div className="topbar-brand">
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
          <button
            type="button"
            className="theme-toggle"
            onClick={toggle}
            aria-label={`Switch to ${nextTheme} mode`}
            title={`Switch to ${nextTheme} mode`}
          >
            <MobileIcon name={theme === "light" ? "moon" : "sun"} /><span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
          </button>
          <button type="button" className="logout-button" aria-label="Log out" title="Log out" onClick={() => void signOut()}>{t("Log out")}</button>
        </div></>}
      </header>
      {mobile && <dialog ref={menuRef} id="mobile-account-menu" className="mobile-account-drawer" aria-labelledby="mobile-menu-title" onCancel={() => setMenuOpen(false)} onClose={() => setMenuOpen(false)} onClick={event => { if (event.target === event.currentTarget) setMenuOpen(false); }}>
        <div className="mobile-drawer-content">
          <header className="mobile-drawer-heading"><div><span className="mobile-drawer-brand">STOCRANT</span><h2 id="mobile-menu-title">{t("My account")}</h2></div><button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}>×</button></header>
          <button className="mobile-drawer-identity" type="button" aria-label={t("My profile")} onClick={() => { setMenuOpen(false); setProfileOpen(true); }}><span className="mobile-drawer-avatar">{user?.avatar ? <img src={user.avatar} alt="" /> : user?.name?.slice(0, 2).toUpperCase() || <MobileIcon name="profile" />}</span><span className="mobile-drawer-user"><strong>{user?.name}</strong><span>{t("My profile")}</span></span><span className="mobile-drawer-chevron" aria-hidden="true">›</span></button>
          <nav className="mobile-drawer-controls" aria-label="Account controls">
            <NavLink to="/security" onClick={() => setMenuOpen(false)}><MobileIcon name="settings" /><span>{language === "ar" ? "قفل التطبيق" : "App lock"}</span></NavLink>
            <section className="language-settings" aria-labelledby="language-heading">
              <h3 id="language-heading">{language === "ar" ? "اللغة" : "Language"}</h3>
              <div className="language-options" role="group" aria-label={language === "ar" ? "لغة التطبيق" : "App language"}>
                <button type="button" className="language-option" lang="en" dir="ltr" aria-pressed={language === "en"} onClick={() => setLanguage("en")}><span className="language-code" aria-hidden="true">EN</span><span>English</span><span className="language-selected" aria-hidden="true">{language === "en" ? <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 10 4 4 8-8" /></svg> : null}</span></button>
                <button type="button" className="language-option" lang="ar" dir="rtl" aria-pressed={language === "ar"} onClick={() => setLanguage("ar")}><span className="language-code" aria-hidden="true">ع</span><span>العربية</span><span className="language-selected" aria-hidden="true">{language === "ar" ? <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 10 4 4 8-8" /></svg> : null}</span></button>
              </div>
              <p>{language === "ar" ? "يتم حفظ اختيارك على هذا الجهاز" : "Saved on this device"}</p>
            </section>
            <NavLink to={user?.roleId === "role-main-manager" ? "/admin" : "/mobile-more"} onClick={() => setMenuOpen(false)}><MobileIcon name="settings" /><span>{t("Settings")}</span></NavLink>
            <button type="button" role="switch" aria-checked={theme === "dark"} aria-label={t("Dark mode")} onClick={toggle}><MobileIcon name={theme === "light" ? "moon" : "sun"} /><span>{t("Dark mode")}</span><span className="mobile-drawer-switch" aria-hidden="true" /></button>
          </nav>
          <footer className="mobile-drawer-footer"><NavLink to="/about" onClick={() => setMenuOpen(false)}><MobileIcon name="info" /><span>{t("About")}</span></NavLink><span>STOCRANT</span></footer>
        </div>
      </dialog>}

      {mobile && <nav className="mobile-bottom-nav" aria-label="Mobile navigation"><NavLink to="/" end><MobileIcon name="home" />{t("Home")}</NavLink>{user?.roleId !== "role-main-manager" && <><NavLink to="/me/attendance"><MobileIcon name="attendance" />{t("Attendance")}</NavLink><NavLink to="/me/leave"><MobileIcon name="leave" />{t("Leave")}</NavLink></>}{visibleNavItems.some((item) => item.section === "operations") && <NavLink to="/operations?view=mine"><MobileIcon name="work" />{t("Work")}</NavLink>}<NavLink to="/mobile-more"><MobileIcon name="more" />{t("More")}</NavLink></nav>}
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
        {profileOpen && <ProfilePanel initialPhoto={profilePhoto} onClose={() => { setProfileOpen(false); setProfilePhoto(undefined); }} />}<main className="main" id="main-content">
          <Suspense fallback={<p className="hint" role="status">{language === "ar" ? "جارٍ التحميل…" : "Loading…"}</p>}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}
