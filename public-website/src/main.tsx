import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PublicWebsite from "./components/PublicWebsite";
import { ThemeProvider } from "./theme-context";
import "./theme.css";
import "./public-site.css";
import "./brand-palette.css";
createRoot(document.getElementById("root")!).render(<StrictMode><ThemeProvider><PublicWebsite /></ThemeProvider></StrictMode>);
