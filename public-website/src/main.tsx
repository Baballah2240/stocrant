import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PublicWebsite from "./components/PublicWebsite";
import { ThemeProvider } from "./theme-context";
import { PublicLanguageProvider } from "./language-context";


import "./explorer.css";
import "./explorer-cards.css";
import "./atmosphere.css";
import "./brand-theme.css";
import "./chapters.css";
import "./arabic.css";
createRoot(document.getElementById("root")!).render(<StrictMode><ThemeProvider><PublicLanguageProvider><PublicWebsite /></PublicLanguageProvider></ThemeProvider></StrictMode>);
