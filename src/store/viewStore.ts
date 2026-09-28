// Which content view the repository window shows (spec §1) and the user's sidebar override (§2),
// kept per view. Per window, per session: a new window starts on History with the width deciding
// the sidebar in both views.
import { create } from "zustand";

export type View = "history" | "changes";

const NO_OVERRIDE: Record<View, boolean | null> = { history: null, changes: null };

export interface ViewStore {
  view: View;
  /** Per view: `null` = follow the width (`layout.railAuto`); `true` / `false` = the user said so (Ctrl+Shift+`). */
  railOverride: Record<View, boolean | null>;
  setView(view: View): void;
  /** Works on the current view. `auto` is what the width would do right now; the toggle flips the
   *  effective state. An override that agrees with the width is not an override: it stores `null`
   *  instead, so the width keeps the decision and the user has a way back to automatic. */
  toggleRail(auto: boolean): void;
  __resetForTests(): void;
}

export const useViewStore = create<ViewStore>()((set, get) => ({
  view: "history",
  railOverride: NO_OVERRIDE,
  setView: (view) => set({ view }),
  toggleRail: (auto) => {
    const { view, railOverride } = get();
    const next = !(railOverride[view] ?? auto);
    set({ railOverride: { ...railOverride, [view]: next === auto ? null : next } });
  },
  __resetForTests: () => set({ view: "history", railOverride: NO_OVERRIDE }),
}));
