import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./theme-context";
import { SessionProvider } from "./session-context";
import CursorMotion from "./components/CursorMotion";
import App from "./App";
import "./theme.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ThemeProvider>
      <CursorMotion />
      <SessionProvider>
        <App />
      </SessionProvider>
    </ThemeProvider>
  </StrictMode>,
);
