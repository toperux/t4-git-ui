// Theme preference: explicit 'light' | 'dark' persisted in localStorage('theme'); 'system' follows the OS.
export type ThemePref = "light" | "dark" | "system";

const KEY = "theme";
const osDark = window.matchMedia("(prefers-color-scheme: dark)");

function stored(): "light" | "dark" | null {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : null;
}

function apply() {
  document.documentElement.dataset.theme = stored() ?? (osDark.matches ? "dark" : "light");
}

export function setTheme(pref: ThemePref) {
  if (pref === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, pref);
  apply();
}

export function initTheme() {
  apply();
  osDark.addEventListener("change", apply);
}
