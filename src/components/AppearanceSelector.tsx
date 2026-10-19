import { useTheme, type ThemePreference } from "../theme-context";
import { useLanguage } from "../language-context";
import MobileIcon from "./MobileIcon";
export default function AppearanceSelector() {
  const { preference, theme, setTheme } = useTheme();
  const { t } = useLanguage();
  return <label className="appearance-selector"><MobileIcon name={theme === "dark" ? "moon" : "sun"} /><span className="sr-only">{t("Appearance")}</span><select aria-label={t("Appearance")} value={preference} onChange={event => setTheme(event.target.value as ThemePreference)}><option value="light">{t("Morning \u2014 Light")}</option><option value="dark">{t("Night \u2014 Dark")}</option><option value="system">{t("System")}</option></select></label>;
}
