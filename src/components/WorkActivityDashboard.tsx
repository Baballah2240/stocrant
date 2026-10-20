import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler } from "chart.js";
import { request } from "../api";
import { useLanguage } from "../language-context";
import { useSession } from "../session-context";
import { useTheme } from "../theme-context";
import ChoiceSelect from "./ChoiceSelect";
import "../work-activity.css";
Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);
export type DashboardPeriod = { start: string; end: string; timezone: string };
type Filters = { range: string; start: string; end: string; timezone: string };
type Point = { key: string; completed: number; activity: number };
type ActivityRecord = { id: string; taskId: string; title: string; message: string; occurredAt: string; bucket: string; completion: boolean; status: string; to: string | null };
type Result = { period: DashboardPeriod & { hourly: boolean }; enabled: boolean; points: Point[]; summary: { completed: number; activity: number; pending: number; overdue: number }; records: ActivityRecord[]; recordCount: number; page: number };
const defaults: Filters = { range: "today", start: "", end: "", timezone: "" };
export default function WorkActivityDashboard({ onPeriod, refresh = 0 }: { onPeriod: (period: DashboardPeriod) => void; refresh?: number }) {
 const { user } = useSession(), { t, language } = useLanguage();
 const key = `stocrant.activity.${user?.id}`;
 const [filters, setFilters] = useState<Filters>(() => { try { const saved = JSON.parse(localStorage.getItem(key) || "null"); if (saved && ["today", "7", "30", "custom"].includes(saved.range) && Object.keys(defaults).every(k => typeof saved[k] === "string")) return saved; } catch { /* Optional device preferences. */ } return defaults; });
 const [result, setResult] = useState<Result | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
 const [bucket, setBucket] = useState(""), [page, setPage] = useState(1), [detail, setDetail] = useState<Result | null>(null), [detailError, setDetailError] = useState(""), [detailLoading, setDetailLoading] = useState(false);
 const callback = useRef(onPeriod); callback.current = onPeriod;
 const params = (extra: Record<string, string> = {}) => new URLSearchParams({ range: filters.range, ...(filters.timezone ? { timezone: filters.timezone } : {}), ...(filters.range === "custom" ? { start: filters.start, end: filters.end } : {}), ...extra });
 const valid = filters.range !== "custom" || Boolean(filters.start && filters.end && filters.start <= filters.end);
 const change = (patch: Partial<Filters>) => { setFilters(old => ({ ...old, ...patch })); setBucket(""); setDetail(null); };
 useEffect(() => { try { localStorage.setItem(key, JSON.stringify(filters)); } catch { /* Preferences remain usable. */ } }, [key, filters]);
 useEffect(() => {
  let active = true; setLoading(true); setError(""); setBucket(""); setDetail(null);
  if (!valid) { setLoading(false); setError("Choose both dates for a valid custom range."); return; }
  const timer = setTimeout(() => void request<Result>("/workspace/dashboard-activity?" + params()).then(data => { if (active) { setResult(data); setLoading(false); callback.current(data.period); } }).catch(err => { if (active) { setError(err.message); setLoading(false); } }), 150);
  return () => { active = false; clearTimeout(timer); };
 }, [filters, revision, refresh, valid]);
 // Rolling presets follow the next calendar day, including daylight-saving changes.
 useEffect(() => { let day = result?.period.end || ""; const timer = window.setInterval(() => { if (!result || filters.range === "custom") return; const next = new Intl.DateTimeFormat("en-CA", { timeZone: result.period.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); if (day && next !== day) setRevision(v => v + 1); day = next; }, 30000); return () => clearInterval(timer); }, [result?.period.timezone, result?.period.end, filters.range]);
 useEffect(() => {
  if (!bucket || !result) return;
  let active = true; setDetailLoading(true); setDetailError("");
  void request<Result>("/workspace/dashboard-activity?" + new URLSearchParams({ range: "custom", ...result.period, hourly: String(result.period.hourly), bucket, page: String(page) })).then(data => { if (active) { setDetail(data); setDetailLoading(false); } }).catch(err => { if (active) { setDetailError(err.message); setDetailLoading(false); } });
  return () => { active = false; };
 }, [bucket, page, revision]);
 const select = (key: string) => { setPage(1); setBucket(key); };
 const label = (key: string, full = false) => key.includes("T") ? `${full ? key.slice(0, 10) + " · " : ""}${key.slice(-2)}:00` : new Date(key + "T12:00:00Z").toLocaleDateString(language === "ar" ? "ar" : "en", { timeZone: "UTC", month: "short", day: "numeric", ...(full ? { year: "numeric" } : {}) });
 const records = (items: ActivityRecord[]) => <div className="work-activity-records">{items.map(row => <article key={row.id}><div>{row.to ? <Link to={row.to}>{row.title}</Link> : <strong>{row.title}</strong>}<p dir="auto">{t(row.message)}</p><small>{t(row.completion ? "Task completed" : "Work update")} · {t(row.status)}</small></div><time dateTime={row.occurredAt}>{new Date(row.occurredAt).toLocaleString(language, { timeZone: result!.period.timezone, dateStyle: "medium", timeStyle: "short" })}</time></article>)}</div>;
 return <section className="work-activity-dashboard" aria-label={t("Work Activity")}>
  <header className="work-activity-heading"><div><p className="eyebrow">{t("Dashboard period")}</p><h2>{t("Work Activity")}</h2><p className="hint">{t("Recorded task completions and work updates within your access scope.")}</p></div><div className="work-activity-controls"><label>{t("Date range")}<ChoiceSelect value={filters.range} onChange={e => change({ range: e.target.value })}>{[["today", "Today"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["custom", "Custom range"]].map(([value, text]) => <option key={value} value={value}>{t(text)}</option>)}</ChoiceSelect></label><label>{t("Time zone")}<ChoiceSelect searchable value={filters.timezone} onChange={e => change({ timezone: e.target.value })}><option value="">{t("Company time zone")}</option>{[...new Set([Intl.DateTimeFormat().resolvedOptions().timeZone, "Asia/Riyadh", "Asia/Qatar", "UTC", ...((Intl as typeof Intl & {supportedValuesOf?: (key: string) => string[]}).supportedValuesOf?.("timeZone") || [])])].sort().map(zone => <option key={zone} value={zone}>{zone}</option>)}</ChoiceSelect></label><button type="button" disabled={loading} onClick={() => setRevision(v => v + 1)}>{t("Refresh")}</button></div></header>
  {filters.range === "custom" && <div className="work-activity-custom"><label>{t("From")}<input type="date" value={filters.start} max={filters.end || undefined} onChange={e => change({ start: e.target.value })}/></label><label>{t("To")}<input type="date" value={filters.end} min={filters.start || undefined} onChange={e => change({ end: e.target.value })}/></label></div>}
  {loading && <p role="status" className="card">{t("Loading work activity…")}</p>}
  {error && <div role="alert" className="card"><p>{t(error)}</p><button disabled={!valid} onClick={() => setRevision(v => v + 1)}>{t("Try again")}</button></div>}
  {result && !loading && !error && <><p className="hint activity-period-label">{result.period.start} – {result.period.end} · {result.period.timezone}</p><div className="work-activity-kpis">{([ ["completed", "Completed tasks"], ["activity", "Work updates"], ["pending", "Outstanding tasks"], ["overdue", "Overdue tasks"] ] as const).map(([key, title]) => <div className="card" key={key}><span>{t(title)}</span><strong data-activity-kpi={key}>{result.summary[key].toLocaleString(language)}</strong><small>{t(["pending", "overdue"].includes(key) ? "Current backlog · all dates" : "Selected period")}</small></div>)}</div><section className="card work-activity-panel" aria-label={t("Work Activity chart")}>
   {!result.enabled ? <p className="empty">{t("No work activity is available for your account.")}</p> : !result.summary.activity ? <p className="empty">{t("No recorded work activity in this period.")}</p> : <><WorkActivityChart points={result.points} onSelect={select} label={label} timezone={result.period.timezone}/><p className="hint">{t("Select a chart point or table row to view its records.")}</p><details><summary>{t("View data table")}</summary><div className="table-wrap"><table className="table"><thead><tr><th>{t("Date")}</th><th>{t("Completed tasks")}</th><th>{t("Work updates")}</th><th>{t("Records")}</th></tr></thead><tbody>{result.points.map(point => <tr key={point.key}><td>{label(point.key, true)}</td><td>{point.completed}</td><td>{point.activity}</td><td><button onClick={() => select(point.key)}>{t("Open")}</button></td></tr>)}</tbody></table></div></details></>}
   <p className="hint">{t("Completions count each task once per selected period. Unrecorded history is excluded.")}</p></section>
   {bucket && <section className="card work-activity-detail" aria-label={t("Activity records")}><header className="section-heading"><h3>{t("Activity records")} · {label(bucket, true)}</h3><button onClick={() => setBucket("")}>{t("Close")}</button></header>{detailLoading ? <p role="status">{t("Loading work activity…")}</p> : detailError ? <p role="alert">{t(detailError)}</p> : detail && <>{!detail.records.length ? <p>{t("No recorded work activity in this period.")}</p> : records(detail.records)}<div className="company-actions"><button disabled={page <= 1} onClick={() => setPage(v => v - 1)}>{t("Previous")}</button><span>{page} / {Math.max(1, Math.ceil(detail.recordCount / 20))}</span><button disabled={page * 20 >= detail.recordCount} onClick={() => setPage(v => v + 1)}>{t("Next")}</button></div></>}</section>}
   <section className="card work-activity-recent"><h3>{t("Recent work activity")}</h3>{result.records.length ? records(result.records.slice(0, 8)) : <p>{t("No recorded work activity in this period.")}</p>}</section></>}
 </section>;
}
function WorkActivityChart({ points, onSelect, label, timezone }: { points: Point[]; onSelect: (key: string) => void; label: (key: string, full?: boolean) => string; timezone: string }) {
 const canvas = useRef<HTMLCanvasElement>(null), chart = useRef<Chart<"line"> | null>(null), latest = useRef({ points, onSelect, label, timezone }); latest.current = { points, onSelect, label, timezone };
 const { theme } = useTheme(), { language, t } = useLanguage();
 useEffect(() => {
  if (!canvas.current) return;
  const dark = theme === "dark", color = dark ? "#dce9fa" : "#1b344e", grid = dark ? "#293c55" : "#e0e8f1";
  chart.current = new Chart(canvas.current, { type: "line", data: { labels: [], datasets: [] }, options: { responsive: true, maintainAspectRatio: false, animation: { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 280 }, interaction: { mode: "index", intersect: false }, onClick: (_event, elements) => { const point = latest.current.points[elements[0]?.index]; if (point) latest.current.onSelect(point.key); }, onHover: (event, elements) => { if (event.native?.target instanceof HTMLCanvasElement) event.native.target.style.cursor = elements.length ? "pointer" : "default"; }, locale: language, plugins: { legend: { rtl: language === "ar", textDirection: language === "ar" ? "rtl" : "ltr", labels: { color, usePointStyle: true } }, tooltip: { rtl: language === "ar", textDirection: language === "ar" ? "rtl" : "ltr", callbacks: { title: items => { const point = latest.current.points[items[0]?.dataIndex]; return point ? latest.current.label(point.key, true) + " · " + latest.current.timezone : ""; } } } }, scales: { x: { ticks: { color, maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false }, title: { display: true, text: t("Date"), color } }, y: { beginAtZero: true, ticks: { precision: 0, color }, grid: { color: grid }, title: { display: true, text: t("Count"), color } } } } });
  return () => { chart.current?.destroy(); chart.current = null; };
 }, [theme, language]);
 useEffect(() => {
  const current = chart.current; if (!current) return;
  current.data.labels = points.map(point => label(point.key));
  current.data.datasets = [{ label: t("Completed tasks"), data: points.map(point => point.completed), borderColor: theme === "dark" ? "#4cdbf2" : "#007b98", backgroundColor: context => { const { ctx, chartArea } = context.chart; if (!chartArea) return "transparent"; const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom); gradient.addColorStop(0, "rgba(30,190,231,.25)"); gradient.addColorStop(1, "rgba(30,190,231,.01)"); return gradient; }, fill: true, tension: .32, pointRadius: 3, pointHitRadius: 12, borderWidth: 2.5 }, { label: t("Work updates"), data: points.map(point => point.activity), borderColor: theme === "dark" ? "#a5bfff" : "#405cca", backgroundColor: "transparent", borderDash: [5, 4], fill: false, tension: .32, pointRadius: 2, pointHitRadius: 12, borderWidth: 2 }];
  current.update();
 }, [points, theme, language]);
 return <div className="work-activity-canvas"><canvas ref={canvas} role="img" aria-label={t("Work Activity chart")} aria-describedby="work-activity-accessibility"/><p id="work-activity-accessibility" className="sr-only">{t("The data table provides keyboard access to all chart points.")}</p></div>;
}
