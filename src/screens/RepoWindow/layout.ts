// The window width decides how the repository window lays itself out (spec §2, §3, §5, §6). One
// pure function holds the breakpoints; the hook is a plain `resize` subscription.
import { useCallback, useMemo, useSyncExternalStore } from "react";

/** Below this the sidebar collapses to the rail unless the user overrode it (`viewStore.railOverride`). */
export const RAIL_BELOW = 1000;
/* Below this the details pane goes to two columns. Set by what the diff is left with rather than by
   the window: three columns spend 340 on details and 320 on files before the diff gets anything, so
   at 1100 the diff sat on its 200px minimum and the details column had already been squeezed off
   340. At 1340 the diff still clears 400px; below it the other two stack and the diff roughly
   doubles. */
export const TIGHT_BELOW = 1340;
/** Below this the details pane is files | diff and the commit panel two columns. */
export const ICONS_BELOW = 800;

export type ToolbarTier = "full" | "tight" | "icons";
export type DetailsTier = "3col" | "2col" | "narrow";
export type CommitTier = "3col" | "2col";

export interface Layout {
  details: DetailsTier;
  commit: CommitTier;
  /** What the width alone says about the sidebar; the user's toggle wins over it. */
  railAuto: boolean;
}

export function layoutFor(width: number): Layout {
  const icons = width < ICONS_BELOW;
  const tight = width < TIGHT_BELOW;
  return {
    details: icons ? "narrow" : tight ? "2col" : "3col",
    commit: icons ? "2col" : "3col",
    railAuto: width < RAIL_BELOW,
  };
}

/* The toolbar keeps its own breakpoints, because what decides them is its contents, not the window:
   every control in it is fixed width bar the search box and the repo name. With the search squeezed
   to its 120px min, the width it needs is a flat base plus however wide the name renders — measured
   in the running app, the base came out the same (1167-1168 / 930) for names from 1 to 41 chars, so
   a name-relative breakpoint is exact rather than a worst case padded in. A fixed 1100 left `full`
   overflowing its own right edge from 1237 down, dropping Refresh and Settings off the window. */
export const TOOLBAR_FULL_BASE = 1168;
export const TOOLBAR_TIGHT_BASE = 930;
/* `nameWidth` arrives already bounded: `.repoName` is `max-width: 160px` with `text-overflow`, and
   it is measured with `getBoundingClientRect`, so a long name ellipsizes rather than widening. It is
   taken as measured — clamping it here would only under-reserve if that cap ever moved. */

/* One member comes and goes that the bases above cannot absorb: the file-history chip (`.history` —
   220px max-width plus its 8px margin). The row already has one elastic control, the search box, and
   its 240 → 120 give is what lets the update badge appear without pushing anything off the edge —
   that `min-width` exists for exactly that, and step 9 of smoke group AU walked it. The chip is
   nearly twice that give, so a tier chosen without counting it overflowed: walked with a history
   filter on, the row ran up to 173px past its own right edge from 1400 down to its own `full` floor,
   taking Refresh, the theme toggle and Settings off the window with it.

   Reserved at the chip's full width rather than net of the search's give, because when the badge is
   up the give is already spoken for; and reserved at every tier rather than only the ones that show
   the chip, because an extra that came and went with the tier would flap between two. The badge gets
   no reservation of its own — it is what the give is there to absorb, and reserving it as well would
   drop the tier at widths where the row demonstrably still fits. */
export const HISTORY_CHIP_W = 228;

export function toolbarTierFor(width: number, nameWidth: number, extras = 0): ToolbarTier {
  if (width < TOOLBAR_TIGHT_BASE + nameWidth + extras) return "icons";
  if (width < TOOLBAR_FULL_BASE + nameWidth + extras) return "tight";
  return "full";
}

const subscribe = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
/* Both hooks below snapshot the tier rather than the width. A drag delivers a resize event for
   every step the browser has not coalesced away, each with a different width, so a raw-width
   snapshot re-rendered every consumer for a value that only changes two or three times across the
   whole drag. A string snapshot compares equal, so React bails out in between. */
const layoutKey = () => {
  const w = window.innerWidth;
  return `${w < ICONS_BELOW ? "i" : w < TIGHT_BELOW ? "t" : "f"}${w < RAIL_BELOW ? "r" : "-"}`;
};

export function useLayout(): Layout {
  const key = useSyncExternalStore(subscribe, layoutKey, layoutKey);
  // The key is what decides when this recomputes; the width it reads is the one that produced it.
  return useMemo(() => layoutFor(window.innerWidth), [key]);
}

export function useToolbarTier(nameWidth: number, extras = 0): ToolbarTier {
  const get = useCallback(() => toolbarTierFor(window.innerWidth, nameWidth, extras), [nameWidth, extras]);
  return useSyncExternalStore(subscribe, get, get);
}
