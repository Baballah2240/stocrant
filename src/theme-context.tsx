import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { syncDeviceAppearance } from "./device-actions";
export type ThemeMode = "light" | "dark";
export type ThemePreference = ThemeMode | "system";
interface ThemeContextValue { theme: ThemeMode; preference: ThemePreference; toggle: () => void; setTheme: (mode: ThemePreference) => void; }
const ThemeContext = createContext<ThemeContextValue>({ theme: "light", preference: "system", toggle: () => {}, setTheme: () => {} });
function initialPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem("stocrant-theme");
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
    const website = localStorage.getItem("stocrant-site-theme");
    if (website === "light" || website === "dark") return website;
  } catch { /* Device storage is optional. */ }
  return "system";
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);
  const [system, setSystem] = useState<ThemeMode>(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const theme = preference === "system" ? system : preference;
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key !== "stocrant-theme" && event.key !== null) return;
      setPreference(event.newValue === "light" || event.newValue === "dark" ? event.newValue : "system");
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystem(media.matches ? "dark" : "light");
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    void syncDeviceAppearance(theme).catch(() => { /* Keep the workspace usable if native appearance is unavailable. */ });
    try { localStorage.setItem("stocrant-theme", preference); } catch { /* Device storage is optional. */ }
  }, [theme, preference]);
  const setTheme = useCallback((mode: ThemePreference) => setPreference(mode), []);
  const toggle = useCallback(() => setPreference(theme === "light" ? "dark" : "light"), [theme]);
  const value = useMemo(() => ({ theme, preference, toggle, setTheme }), [theme, preference, toggle, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
