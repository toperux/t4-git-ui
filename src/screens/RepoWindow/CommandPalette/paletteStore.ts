import { create } from "zustand";

const RECENT_KEY = "paletteRecent";
const RECENT_MAX = 3;

/** Storage can be unavailable (locked-down WebView): then the list is per session. */
function readRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export interface PaletteStore {
  open: boolean;
  /** Ids of the last commands run, newest first. */
  recent: string[];
  setOpen(open: boolean): void;
  markRun(id: string): void;
  __resetForTests(): void;
}

export const usePaletteStore = create<PaletteStore>()((set, get) => ({
  open: false,
  recent: readRecent(),
  setOpen: (open) => set({ open }),
  markRun: (id) => {
    const recent = [id, ...get().recent.filter((r) => r !== id)].slice(0, RECENT_MAX);
    set({ recent });
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
      /* per session then */
    }
  },
  __resetForTests: () => {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      /* nothing stored */
    }
    set({ open: false, recent: [] });
  },
}));
