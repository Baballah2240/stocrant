import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
type Theme = "light" | "dark";
type Preference = Theme | "system";
const Context = createContext({ theme: "light" as Theme, toggle: () => {} });
function initialPreference(): Preference {
  try {
    const shared = localStorage.getItem("stocrant-theme");
    if (shared === "light" || shared === "dark" || shared === "system") return shared;
    const legacy = localStorage.getItem("stocrant-site-theme");
    if (legacy === "light" || legacy === "dark") return legacy;
  } catch { /* Preferences are optional. */ }
  return "system";
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Preference>(initialPreference);
  const [system, setSystem] = useState<Theme>(() => matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const theme = preference === "system" ? system : preference;
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystem(media.matches ? "dark" : "light");
    media.addEventListener("change", update);
    const sync = (event: StorageEvent) => { if (event.key === "stocrant-theme" || event.key === null) setPreference(event.newValue === "light" || event.newValue === "dark" ? event.newValue : "system"); };
    window.addEventListener("storage", sync);
    return () => { media.removeEventListener("change", update); window.removeEventListener("storage", sync); };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem("stocrant-theme", preference); localStorage.setItem("stocrant-site-theme", theme); } catch { /* Optional preference. */ }
  }, [theme, preference]);
  return <Context.Provider value={{ theme, toggle: () => setPreference(theme === "light" ? "dark" : "light") }}>{children}</Context.Provider>;
}
export const useTheme = () => useContext(Context);
