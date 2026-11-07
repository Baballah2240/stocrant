import { EmployeeActivation } from "./components/EmployeeActivation";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./theme-context";
import { LanguageProvider } from "./language-context";
import { SessionProvider } from "./session-context";
import { AppLockProvider } from "./app-lock-context";
import { isNativeApp } from "./api";
import App from "./App";
import ActionToasts from "./components/ActionToasts";
import ErrorBoundary from "./components/ErrorBoundary";
import "./theme.css";
import "./ui-refresh.css";
import "./auth-experience.css";
import "./brand-palette.css";
import "./mobile-polish.css";
import "./glass-theme.css";
import "./settings-layout.css";
import "./auth-notifications.css";
import "./app-lock.css";
import "./attendance-motion.css";
import "./attendance-workspace.css";
import "./choice-controls.css";
import "./mobile-drawer.css";
import "./mobile-navigation.css";
import "./notification-scroll.css";
import "./notification-panel.css";
import "./choice-picker.css";
import "./sidebar-workspace.css";
import "./hr-dashboard.css";
import "./enterprise.css";
import "../public-website/src/brand-theme.css";
import "./auth-connected.css";
import "./mobile-workspace.css";
import "./aer-workspace.css";

// Native builds have no hover pointer and need safe-area padding; the CSS
// keys off this attribute so the browser layout stays untouched.
if (isNativeApp()) {
  document.documentElement.setAttribute("data-native", "true");
  const platform = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
  if (platform) document.documentElement.setAttribute("data-native-platform", platform);
}

const employeeActivation = (new URLSearchParams(location.hash.slice(1)).has("activate") || new URLSearchParams(location.hash.slice(1)).has("invite"));

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <LanguageProvider><ThemeProvider>
      <ErrorBoundary><SessionProvider>
        {employeeActivation ? <EmployeeActivation /> : <AppLockProvider>
        <App />
        <ActionToasts />
        </AppLockProvider>}
      </SessionProvider></ErrorBoundary>
    </ThemeProvider></LanguageProvider>
  </StrictMode>,
);
