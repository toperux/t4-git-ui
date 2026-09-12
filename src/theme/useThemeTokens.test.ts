import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useThemeTokens } from "./useThemeTokens";

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
});
