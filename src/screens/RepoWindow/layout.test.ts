import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HISTORY_CHIP_W, layoutFor, toolbarTierFor, useLayout, useToolbarTier } from "./layout";

describe("layoutFor", () => {
  it("maps widths to tiers at the documented breakpoints", () => {
    expect(layoutFor(1400)).toEqual({ details: "3col", commit: "3col", railAuto: false });
    expect(layoutFor(1340)).toEqual({ details: "3col", commit: "3col", railAuto: false });
    expect(layoutFor(1339)).toEqual({ details: "2col", commit: "3col", railAuto: false });
    expect(layoutFor(1280)).toEqual({ details: "2col", commit: "3col", railAuto: false });
    expect(layoutFor(1000)).toEqual({ details: "2col", commit: "3col", railAuto: false });
    expect(layoutFor(999)).toEqual({ details: "2col", commit: "3col", railAuto: true });
    expect(layoutFor(800)).toEqual({ details: "2col", commit: "3col", railAuto: true });
    expect(layoutFor(799)).toEqual({ details: "narrow", commit: "2col", railAuto: true });
    expect(layoutFor(700)).toEqual({ details: "narrow", commit: "2col", railAuto: true });
  });
});

describe("toolbarTierFor", () => {
  // A 70px name ("mbk-portal") is what the floors were measured against: 1237 full, 999 tight.
  it("carries its breakpoints with the repo name", () => {
    expect(toolbarTierFor(1280, 70)).toBe("full");
    expect(toolbarTierFor(1238, 70)).toBe("full");
    expect(toolbarTierFor(1237, 70)).toBe("tight");
    expect(toolbarTierFor(1000, 70)).toBe("tight");
    expect(toolbarTierFor(999, 70)).toBe("icons");
  });

  it("takes the widest name the CSS can produce, which is the 160px the box is capped at", () => {
    // The name cannot arrive wider: `.repoName` is `max-width: 160px` and ellipsizes, so these are
    // the outermost floors a repo name can push the tiers to.
    expect(toolbarTierFor(1328, 160)).toBe("full");
    expect(toolbarTierFor(1327, 160)).toBe("tight");
    expect(toolbarTierFor(1090, 160)).toBe("tight");
    expect(toolbarTierFor(1089, 160)).toBe("icons");
  });

  it("reserves the history chip, which the bases do not count", () => {
    // Walked 2026-09-15: with a history filter on, the row stayed `full` from 1400 down to its own
    // 1221 floor while running up to 173px past the window, taking Refresh and Settings off screen.
    expect(toolbarTierFor(1280, 70)).toBe("full");
    expect(toolbarTierFor(1280, 70, HISTORY_CHIP_W)).toBe("tight");
    expect(toolbarTierFor(1466, 70, HISTORY_CHIP_W)).toBe("full");
    // 930 + 70 + 228: one pixel below it the chip no longer fits the tight row either.
    expect(toolbarTierFor(1228, 70, HISTORY_CHIP_W)).toBe("tight");
    expect(toolbarTierFor(1227, 70, HISTORY_CHIP_W)).toBe("icons");
  });

  it("falls back to the bare bases before the name has been measured", () => {
    expect(toolbarTierFor(1168, 0)).toBe("full");
    expect(toolbarTierFor(1167, 0)).toBe("tight");
    expect(toolbarTierFor(930, 0)).toBe("tight");
    expect(toolbarTierFor(929, 0)).toBe("icons");
  });
});

describe("useToolbarTier", () => {
  it("re-renders only when the tier moves, not on every resize the drag sends", () => {
    window.innerWidth = 1400;
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useToolbarTier(70);
    });
    expect(result.current).toBe("full");
    const settled = renders;

    // Two resizes that stay inside `full` (its floor is 1168 + 70): nothing should re-render.
    act(() => {
      window.innerWidth = 1300;
      window.dispatchEvent(new Event("resize"));
    });
    act(() => {
      window.innerWidth = 1250;
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe("full");
    expect(renders).toBe(settled);

    // Crossing the floor is the one that has to get through.
    act(() => {
      window.innerWidth = 1200;
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe("tight");
    expect(renders).toBeGreaterThan(settled);
  });

  it("follows the name, so a rename moves the floor under a fixed width", () => {
    window.innerWidth = 1240;
    const { result, rerender } = renderHook(({ n }) => useToolbarTier(n), { initialProps: { n: 70 } });
    expect(result.current).toBe("full");
    rerender({ n: 160 });
    expect(result.current).toBe("tight");
  });
});

describe("useLayout", () => {
  it("follows window resizes and returns a stable object per width", () => {
    window.innerWidth = 1400;
    const { result } = renderHook(() => useLayout());
    const first = result.current;
    expect(first.details).toBe("3col");
    act(() => {
      window.innerWidth = 720;
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current.details).toBe("narrow");
    expect(result.current.railAuto).toBe(true);
    act(() => {
      window.innerWidth = 1400;
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toEqual(first);
  });
});
