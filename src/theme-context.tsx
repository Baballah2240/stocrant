import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type ThemeMode = "light" | "dark";

interface ThemeContextValue {
  theme: ThemeMode;
  toggle: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggle: () => {},
  setTheme: () => {},
});

function initialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem("stocrant-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // ignore
  }
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem("stocrant-theme", theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => setThemeState(mode), []);
  const toggle = useCallback(() => setThemeState((t) => (t === "light" ? "dark" : "light")), []);

  const value = useMemo(() => ({ theme, toggle, setTheme }), [theme, toggle, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
