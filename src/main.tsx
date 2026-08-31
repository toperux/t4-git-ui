import { LucideProvider } from "lucide-react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./theme/fonts.css";
import "./theme/tokens.css";
import "./theme/base.css";
import { initTheme } from "./theme/theme";

// Persisted override (localStorage 'theme') wins; otherwise follow the OS.
initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* Style guide §2: lucide, stroke 1.75, 16px default (rows/menus/inputs). */}
    <LucideProvider size={16} strokeWidth={1.75}>
      <App />
    </LucideProvider>
  </React.StrictMode>,
);
