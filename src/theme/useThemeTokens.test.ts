import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getThemeTokens, useThemeTokens } from "./useThemeTokens";

// Vitest runs without `globals`, so RTL never auto-cleans: a hook left mounted keeps its observer,
// and the theme attributes below would be dropped into the next test's cache.
afterEach(cleanup);
afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
});

describe("useThemeTokens", () => {
  it("re-reads the tokens when the theme changed while nothing was subscribed", () => {
    document.documentElement.style.setProperty("--lane-w", "11px");
    const first = renderHook(() => useThemeTokens());
    expect(first.result.current.laneW).toBe(11);
    // The grid unmounts (a repo close), the theme flips with no observer watching, the grid comes back.
    first.unmount();
    document.documentElement.style.setProperty("--lane-w", "20px");
    document.documentElement.setAttribute("data-theme", "dark");
    expect(renderHook(() => useThemeTokens()).result.current.laneW).toBe(20);
  });

  it("an imperative read with nothing subscribed leaves no cache behind", () => {
    // `getThemeTokens` is called from canvas code outside React; nothing watches `data-theme` then,
    // so a value it cached could only go stale, and the next subscriber would be handed it.
    document.documentElement.style.setProperty("--lane-w", "11px");
    expect(getThemeTokens().laneW).toBe(11);
    document.documentElement.style.setProperty("--lane-w", "20px");
    document.documentElement.setAttribute("data-theme", "dark");
    expect(renderHook(() => useThemeTokens()).result.current.laneW).toBe(20);
  });
});
