// Which content view the repository window shows (spec §1) and the user's sidebar override (§2).
// Per window, per session: a new window starts on History with the width deciding the sidebar.
import { create } from "zustand";

export type View = "history" | "changes";

export interface ViewStore {
  view: View;
  /** `null` = follow the width (`layout.railAuto`); `true` / `false` = the user said so (Alt+0). */
  railOverride: boolean | null;
  setView(view: View): void;
  /** `auto` is what the width would do right now; the toggle flips the effective state. */
  toggleRail(auto: boolean): void;
  __resetForTests(): void;
}

export const useViewStore = create<ViewStore>()((set, get) => ({
  view: "history",
  railOverride: null,
  setView: (view) => set({ view }),
  toggleRail: (auto) => set({ railOverride: !(get().railOverride ?? auto) }),
  __resetForTests: () => set({ view: "history", railOverride: null }),
}));
