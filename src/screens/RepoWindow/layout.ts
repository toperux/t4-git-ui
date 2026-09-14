// The window width decides how the repository window lays itself out (spec §2, §3, §5, §6). One
// pure function holds the breakpoints; the hook is a plain `resize` subscription.
import { useMemo, useSyncExternalStore } from "react";

/** Below this the sidebar collapses to the rail unless the user overrode it (`viewStore.railOverride`). */
export const RAIL_BELOW = 1000;
/** Below this the operation buttons drop their labels and the details pane goes to two columns. */
export const TIGHT_BELOW = 1100;
/** Below this the toolbar is icons + overflow, the details pane files | diff, the commit panel two columns. */
export const ICONS_BELOW = 800;

export type ToolbarTier = "full" | "tight" | "icons";
export type DetailsTier = "3col" | "2col" | "narrow";
export type CommitTier = "3col" | "2col";

export interface Layout {
  toolbar: ToolbarTier;
  details: DetailsTier;
  commit: CommitTier;
  /** What the width alone says about the sidebar; the user's toggle wins over it. */
  railAuto: boolean;
}

export function layoutFor(width: number): Layout {
  const icons = width < ICONS_BELOW;
  const tight = width < TIGHT_BELOW;
  return {
    toolbar: icons ? "icons" : tight ? "tight" : "full",
    details: icons ? "narrow" : tight ? "2col" : "3col",
    commit: icons ? "2col" : "3col",
    railAuto: width < RAIL_BELOW,
  };
}

const subscribe = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const read = () => window.innerWidth;

export const useWindowWidth = () => useSyncExternalStore(subscribe, read, read);

export function useLayout(): Layout {
  const w = useWindowWidth();
  return useMemo(() => layoutFor(w), [w]);
}
