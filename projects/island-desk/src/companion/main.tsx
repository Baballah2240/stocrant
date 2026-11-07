import React from "react";
import { createRoot } from "react-dom/client";
import Companion from "./Companion";
import "./companion.css";
createRoot(document.getElementById("root")!).render(<React.StrictMode><Companion/></React.StrictMode>);
