import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { layoutFor, useLayout } from "./layout";

describe("layoutFor", () => {
  it("maps widths to tiers at the documented breakpoints", () => {
    expect(layoutFor(1280)).toEqual({ toolbar: "full", details: "3col", commit: "3col", railAuto: false });
    expect(layoutFor(1100)).toEqual({ toolbar: "full", details: "3col", commit: "3col", railAuto: false });
    expect(layoutFor(1099)).toEqual({ toolbar: "tight", details: "2col", commit: "3col", railAuto: false });
    expect(layoutFor(1000)).toEqual({ toolbar: "tight", details: "2col", commit: "3col", railAuto: false });
    expect(layoutFor(999)).toEqual({ toolbar: "tight", details: "2col", commit: "3col", railAuto: true });
    expect(layoutFor(800)).toEqual({ toolbar: "tight", details: "2col", commit: "3col", railAuto: true });
    expect(layoutFor(799)).toEqual({ toolbar: "icons", details: "narrow", commit: "2col", railAuto: true });
    expect(layoutFor(700)).toEqual({ toolbar: "icons", details: "narrow", commit: "2col", railAuto: true });
  });
});

describe("useLayout", () => {
  it("follows window resizes and returns a stable object per width", () => {
    window.innerWidth = 1280;
    const { result } = renderHook(() => useLayout());
    const first = result.current;
    expect(first.toolbar).toBe("full");
    act(() => {
      window.innerWidth = 720;
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current.toolbar).toBe("icons");
    expect(result.current.railAuto).toBe(true);
    act(() => {
      window.innerWidth = 1280;
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toEqual(first);
  });
});
