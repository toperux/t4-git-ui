// Theme preference: explicit 'light' | 'dark' persisted in localStorage('theme'); 'system' follows the OS.
// Also mirrored into the kv store (`theme`), which the Rust side reads to colour the native window
// before the first paint (localStorage is WebView-private).
import { useSyncExternalStore } from "react";
import { kvSet } from "../lib/kv";

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
  // Fire-and-forget: the window colour at the next launch is a nicety, not state the UI waits on.
  kvSet(KEY, pref === "system" ? null : pref).catch(() => {});
  apply();
}

/** The stored preference, not the resolved theme — the settings dialog shows the three-way choice. */
export function getThemePref(): ThemePref {
  return stored() ?? "system";
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
