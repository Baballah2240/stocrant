import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { arabicWebsite } from "./translations";
type Language = "en" | "ar";
const key = "stocrant.language";
function initial(): Language {
  try { const saved = localStorage.getItem(key); if (saved === "ar" || saved === "en") return saved; } catch { /* Optional preference. */ }
  return navigator.language.toLowerCase().startsWith("ar") ? "ar" : "en";
}
const Context = createContext({ language: "en" as Language, toggleLanguage: () => {}, t: (text: string) => text });
export function PublicLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(initial);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    try { localStorage.setItem(key, language); } catch { /* Optional preference. */ }
  }, [language]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === key || event.key === null) setLanguage(event.newValue === "ar" ? "ar" : "en"); };
    window.addEventListener("storage", sync); return () => window.removeEventListener("storage", sync);
  }, []);
  return <Context.Provider value={{ language, toggleLanguage: () => setLanguage(value => value === "ar" ? "en" : "ar"), t: text => language === "ar" ? arabicWebsite[text] || text : text }}>{children}</Context.Provider>;
}
export const usePublicLanguage = () => useContext(Context);
