import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { languageDirection, translate, type Language, type TranslationValues } from "./translations";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (text: string, values?: TranslationValues) => string;
}
const LanguageContext = createContext<LanguageContextValue>({ language: "en", setLanguage: () => {}, t: text => text });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try { return localStorage.getItem("stocrant.language") === "ar" ? "ar" : "en"; }
    catch { return "en"; }
  });
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = languageDirection(language);
    try { localStorage.setItem("stocrant.language", language); } catch { /* Optional device preference. */ }
  }, [language]);
  // Updating display language preserves the router, page state and form drafts.
  const t = useCallback((text: string, values?: TranslationValues) => translate(text, language, values), [language]);
  const value = useMemo(() => ({ language, setLanguage, t }), [language, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export const useLanguage = () => useContext(LanguageContext);
