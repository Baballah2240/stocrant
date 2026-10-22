import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PublicWebsite from "./components/PublicWebsite";
import { ThemeProvider } from "./theme-context";


import "./explorer.css";
createRoot(document.getElementById("root")!).render(<StrictMode><ThemeProvider><PublicWebsite /></ThemeProvider></StrictMode>);
