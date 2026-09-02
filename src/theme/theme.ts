// Theme preference: explicit 'light' | 'dark' persisted in localStorage('theme'); 'system' follows the OS.
import { useSyncExternalStore } from "react";

export type ThemePref = "light" | "dark" | "system";
export type Theme = "light" | "dark";

const KEY = "theme";
// jsdom has no matchMedia; there the OS counts as light.
const osDark = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const listeners = new Set<() => void>();

function stored(): Theme | null {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : null;
}

function resolve(): Theme {
  return stored() ?? (osDark?.matches ? "dark" : "light");
}

let current = resolve();

function apply() {
  current = resolve();
  document.documentElement.dataset.theme = current;
  listeners.forEach((l) => l());
}

export function setTheme(pref: ThemePref) {
  if (pref === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, pref);
  apply();
}

/** Flip to the other theme, as an explicit preference (no longer following the OS). */
export function toggleTheme() {
  setTheme(current === "dark" ? "light" : "dark");
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

/** The theme in effect. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, () => current);
}

export function initTheme() {
  apply();
  osDark?.addEventListener("change", apply);
}
