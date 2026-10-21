import { useEffect, useRef, useState } from "react";
import { Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler } from "chart.js";
import { useTheme } from "../theme-context";
import { useLanguage } from "../language-context";
Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);
type Point = { key: string; completed: number; activity: number };
export default function InteractiveActivityChart({ points, onSelect, label, timezone, selected }: { points: Point[]; onSelect: (key: string) => void; label: (key: string, full?: boolean) => string; timezone: string; selected: string }) {
 const canvas = useRef<HTMLCanvasElement>(null), chart = useRef<Chart<"line"> | null>(null);
 const latest = useRef({ points, onSelect, label, timezone }); latest.current = { points, onSelect, label, timezone };
 const { theme } = useTheme(), { language, t } = useLanguage();
 const [visible, setVisible] = useState([true, true]);
 const colors = theme === "dark" ? ["#28d9b1", "#b29aff"] : ["#00836a", "#7952c7"];
 useEffect(() => {
  if (!canvas.current) return;
  const dark = theme === "dark", color = dark ? "#b9bbc5" : "#596576";
  chart.current = new Chart(canvas.current, {
   type: "line", data: { labels: [], datasets: [] },
   plugins: [{ id: "activity-guide", afterDatasetsDraw(current) { const active = current.getActiveElements()[0]; if (!active) return; const { ctx, chartArea } = current, x = active.element.x; ctx.save(); ctx.beginPath(); ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = dark ? "#ffffff35" : "#33415545"; ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke(); ctx.restore(); } }],
   options: {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350 },
    interaction: { mode: "index", intersect: false },
    onClick: (_event, elements) => { const point = latest.current.points[elements[0]?.index]; if (point) latest.current.onSelect(point.key); },
    onHover: (event, elements) => { if (event.native?.target instanceof HTMLCanvasElement) event.native.target.style.cursor = elements.length ? "pointer" : "default"; },
    locale: language,
    plugins: { legend: { display: false }, tooltip: {
     rtl: language === "ar", textDirection: language === "ar" ? "rtl" : "ltr", usePointStyle: true, padding: 12, cornerRadius: 9,
     backgroundColor: dark ? "#191b21" : "#ffffff", titleColor: dark ? "#f5f6fa" : "#18283d", bodyColor: dark ? "#e4e6ed" : "#405065", borderColor: dark ? "#ffffff20" : "#dce4ee", borderWidth: 1,
     callbacks: { title: items => { const point = latest.current.points[items[0]?.dataIndex]; return point ? latest.current.label(point.key, true) + " · " + latest.current.timezone : ""; } },
    } },
    scales: { x: { border: { display: false }, ticks: { color, maxTicksLimit: 7, maxRotation: 0, font: { size: 10 } }, grid: { display: false } }, y: { beginAtZero: true, border: { display: false }, ticks: { precision: 0, color, maxTicksLimit: 5, font: { size: 10 } }, grid: { color: dark ? "#ffffff0b" : "#172b4610" } } },
   },
  });
  return () => { chart.current?.destroy(); chart.current = null; };
 }, [theme, language]);
 useEffect(() => {
  const current = chart.current; if (!current) return;
  current.data.labels = points.map(point => label(point.key));
  current.data.datasets = (["completed", "activity"] as const).map((key, index) => ({
   label: t(index === 0 ? "Completed tasks" : "Work updates"), data: points.map(point => point[key]), hidden: !visible[index],
   borderColor: colors[index], backgroundColor: context => {
    const { ctx, chartArea } = context.chart; if (!chartArea) return "transparent";
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, index === 0 ? "rgba(24,198,160,.26)" : "rgba(149,107,240,.16)");
    gradient.addColorStop(1, index === 0 ? "rgba(24,198,160,.005)" : "rgba(149,107,240,0)"); return gradient;
   },
   fill: true, tension: .35, cubicInterpolationMode: "monotone", borderDash: index ? [5, 4] : [],
   pointRadius: points.map(point => point.key === selected ? 5 : point[key] ? index ? 4 : 2.5 : 0), pointBackgroundColor: colors[index], pointBorderColor: theme === "dark" ? "#2b2d35" : "#ffffff", pointBorderWidth: 1.5,
   pointHoverRadius: 6, pointHitRadius: 12, borderWidth: index ? 2 : 2.7,
  }));
  current.update();
 }, [points, theme, language, visible, selected]);
 return <><div className="activity-series-controls">{(["completed", "activity"] as const).map((key, index) => <button type="button" key={key} aria-pressed={visible[index]} disabled={visible[index] && !visible[1 - index]} onClick={() => setVisible(old => old.map((value, i) => i === index ? !value : value))}><i style={{ backgroundColor: colors[index] }}/><span>{t(index === 0 ? "Completed tasks" : "Work updates")}<strong>{points.reduce((sum, point) => sum + point[key], 0).toLocaleString(language)}</strong></span></button>)}</div><div className="work-activity-canvas"><canvas ref={canvas} role="img" aria-label={t("Work Activity chart")} aria-describedby="work-activity-accessibility"/><p id="work-activity-accessibility" className="sr-only">{t("The data table provides keyboard access to all chart points.")}</p></div></>;
}
