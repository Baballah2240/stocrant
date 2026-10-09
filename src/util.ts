/** Small shared helpers for the frontend. */

export function formatDate(value: string, fallback = "—"): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** "3 days ago" / "2 weeks ago" style relative label. */
export function relativeLabel(value: string): string {
  const d = new Date(value).getTime();
  if (Number.isNaN(d)) return "—";
  const diff = Date.now() - d;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
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
