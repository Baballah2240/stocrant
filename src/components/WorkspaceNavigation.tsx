import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { isNativeApp } from "../api";
import { useLanguage } from "../language-context";
import { useSession } from "../session-context";
import { workspaceNavGroups, workspaceEntryActive, type WorkspaceNavEntry } from "../workspace-navigation";
import MobileIcon from "./MobileIcon";

export function WorkspaceNavLink({ item, onNavigate }: { item: WorkspaceNavEntry; onNavigate?: () => void }) {
  const { t } = useLanguage(); const { pathname } = useLocation();
  const active = workspaceEntryActive(item, pathname);
  return <Link to={item.to === "/" && !isNativeApp() ? "/workspace" : item.to} className={"nav-item" + (active ? " active" : "")} aria-current={active ? "page" : undefined} aria-label={t(item.label)} title={t(item.label)} onClick={onNavigate}><MobileIcon name={item.icon} /><span className="nav-label">{t(item.label)}</span>{active && <span className="workspace-current-dot" aria-hidden="true" />}</Link>;
}
export default function WorkspaceNavigation({ items, onNavigate }: { items: WorkspaceNavEntry[]; onNavigate?: () => void }) {
  const { t } = useLanguage(), { user } = useSession(), { pathname } = useLocation();
  const uid = useId(), root = useRef<HTMLDivElement>(null);
  const activeGroup = items.find(item => workspaceEntryActive(item, pathname))?.group;
  const storageKey = "stocrant.navigation.groups." + (user?.id || "guest");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    let saved: Record<string, boolean> = {};
    try { const value: unknown = JSON.parse(localStorage.getItem(storageKey) || "{}"); if (value && typeof value === "object") saved = Object.fromEntries(Object.entries(value).filter(([key, value]) => workspaceNavGroups.some(group => group.id === key) && typeof value === "boolean")); } catch { /* Storage is optional. */ }
    return { workspace: true, ...saved, ...(activeGroup ? { [activeGroup]: true } : {}) };
  });
  useEffect(() => { if (activeGroup) setOpen(previous => previous[activeGroup] ? previous : { ...previous, [activeGroup]: true }); }, [pathname, activeGroup]);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(open)); } catch { /* Storage is optional. */ } }, [storageKey, open]);
  useEffect(() => {
    const list = root.current?.querySelector<HTMLElement>(".workspace-section-list"); if (!list) return;
    const revealCurrent = () => {
      const current = list.querySelector<HTMLElement>('a[aria-current="page"]');
      if (!current?.getClientRects().length || !list.clientWidth || list.scrollHeight <= list.clientHeight) return;
      const viewport = list.getBoundingClientRect(), item = current.getBoundingClientRect();
      if (item.bottom > viewport.bottom) list.scrollTop += item.bottom - viewport.bottom + 8;
      else if (item.top < viewport.top) list.scrollTop += item.top - viewport.top - 8;
    };
    const frame = requestAnimationFrame(revealCurrent), observer = new ResizeObserver(revealCurrent); observer.observe(list);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [pathname]);
  const search = query.trim().toLocaleLowerCase();
  const groups = workspaceNavGroups.map(group => ({ ...group, links: items.filter(item => item.group === group.id && (!search || [group.label, t(group.label), item.label, t(item.label)].join(" ").toLocaleLowerCase().includes(search))) })).filter(group => group.links.length);
  return <div className="workspace-navigation" ref={root}>
    <div className="workspace-menu-intro"><span>{t("Workspace menu")}</span><small>{t("Your tools, organized")}</small></div>
    <div className="workspace-nav-search"><MobileIcon name="search" /><input type="search" aria-label={t("Search navigation")} placeholder={t("Find a page…")} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape" && query) { event.preventDefault(); event.stopPropagation(); setQuery(""); } }} />{query && <button type="button" aria-label={t("Clear navigation search")} onClick={() => setQuery("")}><MobileIcon name="close" /></button>}</div>
    <div className="workspace-section-list">{groups.map(group => {
      const expanded = Boolean(search || open[group.id]); const active = activeGroup === group.id;
      return <section key={group.id} className={"workspace-nav-section" + (active ? " contains-current" : "")} data-nav-group={group.id} aria-label={t(group.label)}>
        <h2 className="workspace-section-heading"><button type="button" disabled={Boolean(search)} className="workspace-section-toggle" aria-expanded={expanded} aria-controls={uid + "-" + group.id} onClick={() => { if (!search) setOpen(previous => ({ ...previous, [group.id]: !expanded })); }} onKeyDown={event => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return; event.preventDefault();
          const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>(".workspace-section-toggle") || []), index = buttons.indexOf(event.currentTarget);
          const target = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length; buttons[target]?.focus();
        }}><span className="workspace-section-icon"><MobileIcon name={group.icon} /></span><span className="workspace-section-label">{t(group.label)}</span>{!expanded && active && <span className="workspace-current-dot" aria-hidden="true" />}<MobileIcon name="chevron" /></button></h2>
        <div className="workspace-group-links" id={uid + "-" + group.id} hidden={!expanded}>{group.links.map(item => <WorkspaceNavLink key={item.to} item={item} onNavigate={onNavigate} />)}</div>
      </section>;
    })}</div>
    {!groups.length && <p className="workspace-nav-empty" role="status">{t("No pages match your search.")}</p>}
  </div>;
}
