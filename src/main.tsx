import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./theme/tokens.css";
import "./theme/base.css";
import { initTheme } from "./theme/theme";

// Persisted override (localStorage 'theme') wins; otherwise follow the OS.
initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
