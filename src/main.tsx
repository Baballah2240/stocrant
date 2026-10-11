import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./theme-context";
import { LanguageProvider } from "./language-context";
import { SessionProvider } from "./session-context";
import { isNativeApp } from "./api";
import CursorMotion from "./components/CursorMotion";
import App from "./App";
import ActionToasts from "./components/ActionToasts";
import "./theme.css";
import "./ui-refresh.css";
import "./auth-experience.css";
import "./brand-palette.css";
import "./mobile-polish.css";
import "./glass-theme.css";
import "./settings-layout.css";
import "./auth-notifications.css";

// Native builds have no hover pointer and need safe-area padding; the CSS
// keys off this attribute so the browser layout stays untouched.
if (isNativeApp()) {
  document.documentElement.setAttribute("data-native", "true");
  const platform = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
  if (platform) document.documentElement.setAttribute("data-native-platform", platform);
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <LanguageProvider><ThemeProvider>
      <CursorMotion />
      <SessionProvider>
        <App />
        <ActionToasts />
      </SessionProvider>
    </ThemeProvider></LanguageProvider>
  </StrictMode>,
);
