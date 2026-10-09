/** Design tokens shared by STOCRANT components. */

export const palette = {
  primary: "#2563eb",
  primarySoft: "rgba(37, 99, 235, 0.12)",
  success: "#16a34a",
  successSoft: "rgba(22, 163, 74, 0.12)",
  warning: "#d97706",
  warningSoft: "rgba(217, 119, 6, 0.12)",
  danger: "#dc2626",
  dangerSoft: "rgba(220, 38, 38, 0.12)",
  info: "#0369a1",
  infoSoft: "rgba(3, 105, 161, 0.12)",
  neutral: "#111827",
  neutralSoft: "#f3f4f6",
  neutralMuted: "#6b7280",
  border: "#e5e7eb",
  background: "#ffffff",
  surface: "#f9fafb",
} as const;

export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  xxl: "32px",
};

export const borderRadius = {
  sm: "6px",
  md: "8px",
  lg: "12px",
  xl: "16px",
};

export const font = {
  body: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  heading: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
};
