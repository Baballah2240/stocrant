import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
type Theme = "light" | "dark";
const Context = createContext({ theme: "light" as Theme, toggle: () => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => { try { return localStorage.getItem("stocrant-site-theme") === "dark" ? "dark" : "light"; } catch { return "light"; } });
  useEffect(() => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; try { localStorage.setItem("stocrant-site-theme", theme); } catch { /* Optional preference. */ } }, [theme]);
  return <Context.Provider value={{ theme, toggle: () => setTheme(theme === "light" ? "dark" : "light") }}>{children}</Context.Provider>;
}
export const useTheme = () => useContext(Context);
