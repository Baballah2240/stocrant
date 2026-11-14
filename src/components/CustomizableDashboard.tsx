import { Children, isValidElement, useEffect, useRef, useState, type ReactNode, type ReactElement, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";
import { request } from "../api";
import { useLanguage } from "../language-context";
import "../dashboard-layout.css";

type Item = { id: string; hidden: boolean; wide: boolean; width?: "third" | "half" | "two-thirds" | "full"; height?: number | null };
type Density = "comfortable" | "compact";
type Layout = { version: number; items: Item[]; density?: Density };
type Widget = { id: string; title: string; wide?: boolean; available?: boolean; children: ReactNode };
export function DashboardWidget({ children }: Widget) { return <>{children}</>; }
const endpoint = "/workspace/dashboard-layout";
export default function CustomizableDashboard({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { t } = useLanguage(), location = useLocation();
  const widgets = (Children.toArray(children).filter(isValidElement) as ReactElement<Widget>[]).filter(widget => widget.props.available !== false);
  const priority = ["summary", "shortcuts", "management", "profile", "attendance", "activity", "today", "tasks", "notifications", "policies", "assignment", "analytics", "notes"];
  const defaults: Item[] = (enabled ? [...widgets].sort((a,b) => priority.indexOf(a.props.id) - priority.indexOf(b.props.id)) : widgets).map(({ props }) => ({ id: props.id, hidden: false, wide: Boolean(props.wide) }));
  const [layout, setLayout] = useState<Layout>({ version: 0, items: [] }), [draft, setDraft] = useState<Item[] | null>(null);
  const [density, setDensity] = useState<Density>("comfortable");
  const [loaded, setLoaded] = useState(!enabled), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const dragging = useRef<string | null>(null), saving = useRef(false);
  const merge = (items: Item[]) => [...items.filter(item => defaults.some(row => row.id === item.id)), ...defaults.filter(item => !items.some(row => row.id === item.id))];
  const ordered = merge(draft || layout.items);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void request<Layout>(endpoint).then(result => { if (active) { setLayout(result); setDensity(result.density || "comfortable"); setLoaded(true); } }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [enabled]);
  async function reload() {
    if (saving.current) return;
    setBusy(true); setError("");
    try { const result = await request<Layout>(endpoint); setLayout(result); setDensity(result.density || "comfortable"); setDraft(null); setLoaded(true); } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  function change(id: string, changes: Partial<Item>) { setDraft(ordered.map(item => item.id === id ? { ...item, ...changes } : item)); }
  function preset(kind: "balanced" | "daily" | "management") {
    const priority = kind === "management" ? ["shortcuts", "management", "summary", "analytics", "activity", "profile"] : kind === "daily" ? ["summary", "attendance", "tasks", "today", "notifications", "profile"] : ["summary", "shortcuts", "profile", "today", "activity", "management"];
    const sorted = [...defaults].sort((a, b) => (priority.indexOf(a.id) < 0 ? 99 : priority.indexOf(a.id)) - (priority.indexOf(b.id) < 0 ? 99 : priority.indexOf(b.id)));
    setDraft(sorted.map(item => ({ ...item, hidden: kind !== "balanced" && !priority.includes(item.id), width: ["summary", "shortcuts", "activity", "analytics", "management", "attendance"].includes(item.id) ? "full" : "half", height: null })));
    setError("");
  }
  function move(id: string, target: number) {
    const next = [...ordered], from = next.findIndex(item => item.id === id);
    if (from < 0 || target < 0 || target >= next.length) return;
    const [item] = next.splice(from, 1); next.splice(target, 0, item); setDraft(next);
  }
  async function save() {
    if (saving.current || !draft) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const result = await request<Layout>(endpoint, { method: "PUT", body: JSON.stringify({ version: layout.version, items: draft, density }) });
      setLayout(result); setDraft(null); setNotice("Dashboard layout saved.");
    } catch (err) { setError((err as Error).message); }
    finally { saving.current = false; setBusy(false); }
  }
  return <>
    {enabled && <section className="dashboard-customizer card" aria-label={t("Dashboard customization")}>
      <div><strong>{t("Your dashboard, your way")}</strong><p className="hint">{t(draft ? "Move cards with the arrows or drag a handle. Choose what to show and how wide it should be." : "Arrange your cards and keep the tools you use most within reach.")}</p></div>
      <div className="inline-actions">{draft ? <><button className="primary" disabled={busy} onClick={() => void save()}>{t("Save layout")}</button><button disabled={busy} onClick={() => { setDraft(null); setDensity(layout.density || "comfortable"); setError(""); }}>{t("Cancel")}</button><button disabled={busy} onClick={() => { setDraft(defaults); setDensity("comfortable"); }}>{t("Reset layout")}</button></> : <button disabled={!loaded || busy} onClick={() => { setDraft(merge(layout.items)); setNotice(""); }}>{t("Customize dashboard")}</button>}</div>
      {draft && <div className="dashboard-layout-options"><fieldset disabled={busy}><legend>{t("Start with a layout")}</legend><div className="inline-actions"><button type="button" onClick={() => preset("balanced")}>{t("Balanced")}</button><button type="button" onClick={() => preset("daily")}>{t("Daily focus")}</button><button type="button" onClick={() => preset("management")}>{t("Management focus")}</button></div></fieldset><fieldset disabled={busy}><legend>{t("Dashboard spacing")}</legend><div className="inline-actions">{(["comfortable", "compact"] as const).map(value => <button type="button" key={value} aria-pressed={density === value} onClick={() => setDensity(value)}>{t(value === "compact" ? "Compact" : "Comfortable")}</button>)}</div></fieldset><p className="hint">{t("{visible} visible · {hidden} hidden", { visible: ordered.filter(item => !item.hidden).length, hidden: ordered.filter(item => item.hidden).length })} <button type="button" disabled={busy || !ordered.some(item => item.hidden)} onClick={() => setDraft(ordered.map(item => ({ ...item, hidden: false })))}>{t("Show all cards")}</button></p></div>}
      {error && <div className="error" role="alert">{t(error)} <button disabled={busy} onClick={() => void reload()}>{t("Reload saved layout")}</button></div>}
      {notice && <p role="status">{t(notice)}</p>}
    </section>}
    {!draft && ordered.every(item => item.hidden) && <section className="card dashboard-layout-empty"><h2>{t("Make room for what matters")}</h2><p>{t("All dashboard cards are hidden. Customize your dashboard to bring them back.")}</p></section>}
    <div className={`custom-dashboard-grid${draft ? " is-customizing" : ""}`} data-density={density} aria-busy={busy}>
      {ordered.map((item, index) => {
        const widget = widgets.find(widget => widget.props.id === item.id)!;
        const force = item.id === "notes" && new URLSearchParams(location.search).has("personalNote");
        const width = item.width || (item.wide ? "full" : "half");
        return <div key={item.id} className={`dashboard-widget${width === "full" ? " is-wide" : ""}${item.hidden ? " is-layout-hidden" : ""}`} data-width={width} data-fixed-height={Boolean(item.height)} style={{ "--widget-height": item.height ? `${item.height}px` : undefined } as CSSProperties} data-dashboard-card={item.id} hidden={!draft && item.hidden && !force}
          onDragOver={event => { if (draft && dragging.current) event.preventDefault(); }}
          onDrop={event => { if (!draft || busy) return; event.preventDefault(); if (dragging.current) move(dragging.current, index); dragging.current = null; }}>
          {draft && <details key="controls" className="dashboard-card-controls"><summary><strong>{t(widget.props.title)}</strong><span>{t(item.hidden ? "Hidden" : "Visible")} · {t("Edit card")}</span></summary><div>
            <button type="button" draggable={!busy} disabled={busy} onDragStart={event => { dragging.current = item.id; event.dataTransfer.setData("text/plain", item.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { dragging.current = null; }} aria-label={t("Drag card")}>⠿</button>
            <button type="button" disabled={busy || index === 0} onClick={() => move(item.id, index - 1)} aria-label={t("Move card earlier")}>↑</button>
            <button type="button" disabled={busy || index === ordered.length - 1} onClick={() => move(item.id, index + 1)} aria-label={t("Move card later")}>↓</button>
            <button type="button" disabled={busy} aria-pressed={width === "full"} onClick={() => change(item.id, { wide: width !== "full", width: width === "full" ? "half" : "full" })}>{t(width === "full" ? "Full width" : "Half width")}</button>
            <label>{t("Card width")}<select disabled={busy} value={width} onChange={event => change(item.id, { width: event.target.value as Item["width"], wide: event.target.value === "full" })}>{(["third", "half", "two-thirds", "full"] as const).map((value, i) => <option key={value} value={value}>{t(["One third", "Half width", "Two thirds", "Full width"][i])}</option>)}</select></label>
            <label>{t("Card height")}<input type="range" min="240" max="1600" step="20" disabled={busy} value={item.height || 480} aria-label={`${t(widget.props.title)}: ${t("Card height")}`} onChange={event => change(item.id, { height: Number(event.target.value) })} /><span>{item.height ? `${item.height}px` : t("Automatic height")}</span></label>
            <button type="button" disabled={busy || !item.height} onClick={() => change(item.id, { height: null })}>{t("Automatic height")}</button>
            <button type="button" disabled={busy} aria-pressed={!item.hidden} onClick={() => change(item.id, { hidden: !item.hidden })}>{t(item.hidden ? "Hidden" : "Visible")}</button>
          </div></details>}
          <div key="content" className="dashboard-widget-content" tabIndex={item.height ? 0 : undefined} role={item.height ? "region" : undefined} aria-label={item.height ? t(widget.props.title) : undefined}>{widget}</div>
        </div>;
      })}
    </div>
  </>;
}
