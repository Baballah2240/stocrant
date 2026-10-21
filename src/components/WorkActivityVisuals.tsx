import { useEffect, useRef } from "react";
import { Chart, DoughnutController, ArcElement, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from "chart.js";
import { useLanguage } from "../language-context";
import { useTheme } from "../theme-context";
Chart.register(DoughnutController, ArcElement, BarController, BarElement, CategoryScale, LinearScale, Tooltip);
export type Workload = { total: number; completed: number; inProgress: number; pending: number; cancelled: number };
const statusKeys = ["completed", "inProgress", "pending", "cancelled"] as const;
const statusLabels = { completed: "Completed", inProgress: "In progress", pending: "Pending", cancelled: "Cancelled" };
const shades = { dark: ["#26d6ad", "#639aff", "#b296ff", "#ff9a84"], light: ["#007f65", "#2e68d7", "#7952c7", "#c14d35"] };
export function WorkloadCard({ workload }: { workload: Workload }) {
 const { t, language } = useLanguage(), { theme } = useTheme();
 const canvas = useRef<HTMLCanvasElement>(null);
 const percentage = workload.total ? Math.round(workload.completed / workload.total * 100) : null;
 useEffect(() => {
  if (!canvas.current || !workload.total) return;
  const chart = new Chart(canvas.current, { type: "doughnut", data: { labels: statusKeys.map(key => t(statusLabels[key])), datasets: [{ data: statusKeys.map(key => workload[key]), backgroundColor: shades[theme], borderWidth: 0, borderRadius: 5, spacing: 4, hoverOffset: 4 }] }, options: { cutout: "78%", responsive: true, maintainAspectRatio: false, animation: { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350 }, locale: language, plugins: { legend: { display: false }, tooltip: { rtl: language === "ar", textDirection: language === "ar" ? "rtl" : "ltr" } } } });
  return () => chart.destroy();
 }, [workload, theme, language]);
 return <section className="card activity-workload"><header className="activity-card-heading"><h3>{t("Task completion")}</h3><span className="activity-scope-tag">{t("All dates")}</span></header><p className="hint">{t("Current task status within your access scope")}</p>{workload.total ? <div className="activity-ring"><canvas ref={canvas} role="img" aria-label={t("Task status distribution")}/><div className="activity-ring-value"><strong>{percentage?.toLocaleString(language)}<small>%</small></strong><span>{t("Completed")}</span></div></div> : <div className="activity-ring-empty"><span>—</span><p>{t("No tasks in your access scope.")}</p></div>}<dl className="activity-status-legend">{statusKeys.map((key, index) => <div key={key}><dt><i style={{ backgroundColor: shades[theme][index] }}/>{t(statusLabels[key])}</dt><dd>{workload[key].toLocaleString(language)}</dd></div>)}</dl><p className="activity-workload-total">{t("Total tasks")}<strong>{workload.total.toLocaleString(language)}</strong></p></section>;
}
export function ActivityVolumeCard({ points, onSelect, label }: { points: { key: string; activity: number }[]; onSelect: (key: string) => void; label: (key: string, full?: boolean) => string }) {
 const { t, language } = useLanguage(), { theme } = useTheme(), canvas = useRef<HTMLCanvasElement>(null);
 const latest = useRef({ points, onSelect, label }); latest.current = { points, onSelect, label };
 const active = points.filter(point => point.activity > 0).length, peak = points.reduce<typeof points[number] | null>((best, point) => !best || point.activity > best.activity ? point : best, null);
 const hourly = points[0]?.key.includes("T");
 useEffect(() => {
  if (!canvas.current) return;
  const colors = theme === "dark" ? ["#27cba3", "#658fff", "#b092f5"] : ["#008365", "#3469cf", "#8051ca"], color = theme === "dark" ? "#b9bbc3" : "#636b78";
  const chart = new Chart(canvas.current, { type: "bar", data: { labels: points.map(point => label(point.key)), datasets: [{ label: t("Work updates"), data: points.map(point => point.activity), backgroundColor: points.map((_, index) => colors[index % colors.length]), borderRadius: 5, maxBarThickness: 24, minBarLength: 0 }] }, options: { responsive: true, maintainAspectRatio: false, animation: { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300 }, locale: language, onClick: (_event, elements) => { const point = latest.current.points[elements[0]?.index]; if (point) latest.current.onSelect(point.key); }, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: false }, tooltip: { rtl: language === "ar", textDirection: language === "ar" ? "rtl" : "ltr", callbacks: { title: items => { const point = latest.current.points[items[0]?.dataIndex]; return point ? latest.current.label(point.key, true) : ""; } } } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color, maxTicksLimit: 6, maxRotation: 0, font: { size: 10 } } }, y: { beginAtZero: true, border: { display: false }, grid: { color: theme === "dark" ? "#ffffff09" : "#172b4610" }, ticks: { color, precision: 0, maxTicksLimit: 4, font: { size: 10 } } } } } });
  return () => chart.destroy();
 }, [points, theme, language]);
 return <section className="card activity-volume"><header className="activity-card-heading"><h3>{t("Activity volume")}</h3><span className="activity-scope-tag">{t(hourly ? "Hourly" : "Daily")}</span></header><div className="activity-volume-stats"><div><strong>{active.toLocaleString(language)}</strong><span>{t(hourly ? "Active hours" : "Active days")}</span></div><div><strong>{peak?.activity ? label(peak.key) : "—"}</strong><span>{t(hourly ? "Busiest hour" : "Busiest day")}</span></div></div>{points.some(point => point.activity) ? <div className="activity-volume-chart"><canvas ref={canvas} role="img" aria-label={t("Activity volume")}/></div> : <p className="empty">{t("No recorded work activity in this period.")}</p>}</section>;
}
