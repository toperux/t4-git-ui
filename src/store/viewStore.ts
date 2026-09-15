// Which content view the repository window shows (spec §1) and the user's sidebar override (§2).
// Per window, per session: a new window starts on History with the width deciding the sidebar.
import { create } from "zustand";

export type View = "history" | "changes";

export interface ViewStore {
  view: View;
  /** `null` = follow the width (`layout.railAuto`); `true` / `false` = the user said so (Ctrl+Shift+`). */
  railOverride: boolean | null;
  setView(view: View): void;
  /** `auto` is what the width would do right now; the toggle flips the effective state. An override
   *  that agrees with the width is not an override: it stores `null` instead, so the width keeps the
   *  decision and the user has a way back to automatic. */
  toggleRail(auto: boolean): void;
  __resetForTests(): void;
}

export const useViewStore = create<ViewStore>()((set, get) => ({
  view: "history",
  railOverride: null,
  setView: (view) => set({ view }),
  toggleRail: (auto) => {
    const next = !(get().railOverride ?? auto);
    set({ railOverride: next === auto ? null : next });
  },
  __resetForTests: () => set({ view: "history", railOverride: null }),
}));
