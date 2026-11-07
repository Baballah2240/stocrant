import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Sticky from "./Sticky";
import "./style.css";
createRoot(document.getElementById("root")!).render(<React.StrictMode>{new URLSearchParams(location.search).get("sticky") ? <Sticky id={new URLSearchParams(location.search).get("sticky")!}/> : <App/>}</React.StrictMode>);
