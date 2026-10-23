import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Shop from "./Shop";
import "./style.css";
import "./browse-design.css";
createRoot(document.getElementById("root")!).render(<StrictMode><Shop /></StrictMode>);
