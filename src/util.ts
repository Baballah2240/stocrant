/** Small shared helpers for the frontend. */

function displayLocale() {
  return typeof document !== "undefined" && document.documentElement.lang === "ar" ? "ar-QA" : "en-GB";
}

export function formatDate(value: string, fallback = "—"): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString(displayLocale(), { year: "numeric", month: "short", day: "numeric" });
}

/** "3 days ago" / "2 weeks ago" style relative label. */
export function relativeLabel(value: string): string {
  const d = new Date(value).getTime();
  if (Number.isNaN(d)) return "—";
  const seconds = (d - Date.now()) / 1000;
  const relative = new Intl.RelativeTimeFormat(displayLocale(), { numeric: "auto" });
  if (Math.abs(seconds) < 60) return relative.format(0, "second");
  if (Math.abs(seconds) < 3600) return relative.format(Math.trunc(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400) return relative.format(Math.trunc(seconds / 3600), "hour");
  if (Math.abs(seconds) < 2592000) return relative.format(Math.trunc(seconds / 86400), "day");
  return formatDate(value);
}

export function classNames(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function truncated(value: string, max = 30): string {
  return value.length > max ? value.slice(0, max) + "…" : value;
}

/** Render any scalar from the API/seed into a readable cell value (dates, times, booleans). */
export function formatFieldValue(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : fallback;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return formatDate(trimmed);
    if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
    return trimmed;
  }
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}
