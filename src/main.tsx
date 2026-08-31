import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./theme/tokens.css";
import "./theme/base.css";

// Follow the OS theme until a persisted preference exists (prefs land with the start screen).
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => {
  document.documentElement.dataset.theme = dark.matches ? "dark" : "light";
};
applyTheme();
dark.addEventListener("change", applyTheme);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
