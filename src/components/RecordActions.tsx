import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { useLanguage } from "../language-context";
export default function RecordActions({ to, name, editable, removable, busy, onDelete }: { to: string; name: string; editable: boolean; removable: boolean; busy: boolean; onDelete: () => void }) {
  const { t } = useLanguage(), id = useId();
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ top: 0, left: 0 });
  function close(restore = false) { setOpen(false); if (restore) trigger.current?.focus(); }
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const anchor = trigger.current.getBoundingClientRect(), box = menu.current.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(innerWidth - box.width - 8, document.documentElement.dir === "rtl" ? anchor.left : anchor.right - box.width)), top: Math.max(8, anchor.bottom + box.height + 8 > innerHeight ? anchor.top - box.height - 6 : anchor.bottom + 6) });
    menu.current.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(); };
    const dismiss = () => close();
    document.addEventListener("pointerdown", outside); window.addEventListener("resize", dismiss); window.addEventListener("scroll", dismiss, true);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", dismiss); window.removeEventListener("scroll", dismiss, true); };
  }, [open]);
  return <div className="record-actions"><NavLink to={to} className="record-open">{t("Open")}<span aria-hidden="true">↗</span></NavLink>{(editable || removable) && <button ref={trigger} type="button" className="record-menu-trigger" disabled={busy} aria-label={t("More actions for {name}", { name })} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>•••</button>}
    {open && createPortal(<div ref={menu} id={id} role="menu" aria-label={t("Record actions")} className="record-action-menu" style={position} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); close(true); }
      else if (event.key === "Tab") { event.preventDefault(); close(true); }
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []), current = items.indexOf(document.activeElement as HTMLElement); items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus(); }
    }}><p>{name}</p><NavLink role="menuitem" to={to} onClick={() => close()}><span aria-hidden="true">↗</span>{t("Open record")}</NavLink>{editable && <NavLink role="menuitem" to={`${to}/edit`} onClick={() => close()}><span aria-hidden="true">✎</span>{t("Edit")}</NavLink>}{removable && <button role="menuitem" className="record-delete" type="button" onClick={() => { close(true); onDelete(); }}><span aria-hidden="true">×</span>{t("Delete")}</button>}</div>, document.querySelector(".ios-app") || document.body)}
  </div>;
}
