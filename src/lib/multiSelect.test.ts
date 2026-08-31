import { describe, expect, it } from "vitest";
import { clickSelect, EMPTY_SELECTION, moveSelect, pruneSelection, selectAll } from "./multiSelect";

const ITEMS = ["a", "b", "c", "d", "e"];

describe("multiSelect", () => {
  it("plain click selects one and moves the anchor", () => {
    const s = clickSelect(ITEMS, EMPTY_SELECTION, "c");
    expect(s).toEqual({ selected: ["c"], anchor: "c" });
    expect(clickSelect(ITEMS, s, "a")).toEqual({ selected: ["a"], anchor: "a" });
  });

  it("ctrl toggles and keeps list order", () => {
    let s = clickSelect(ITEMS, EMPTY_SELECTION, "d");
    s = clickSelect(ITEMS, s, "b", { ctrl: true });
    expect(s).toEqual({ selected: ["b", "d"], anchor: "b" });
    s = clickSelect(ITEMS, s, "d", { ctrl: true });
    expect(s).toEqual({ selected: ["b"], anchor: "d" });
  });

  it("shift selects the range from the anchor (either direction); ctrl+shift adds to it", () => {
    let s = clickSelect(ITEMS, EMPTY_SELECTION, "b");
    s = clickSelect(ITEMS, s, "d", { shift: true });
    expect(s).toEqual({ selected: ["b", "c", "d"], anchor: "b" });
    s = clickSelect(ITEMS, s, "a", { shift: true });
    expect(s).toEqual({ selected: ["a", "b"], anchor: "b" });
    s = clickSelect(ITEMS, s, "e", { shift: true, ctrl: true });
    expect(s).toEqual({ selected: ["a", "b", "c", "d", "e"], anchor: "b" });
  });

  it("shift without an anchor behaves like a plain click", () => {
    expect(clickSelect(ITEMS, EMPTY_SELECTION, "c", { shift: true })).toEqual({ selected: ["c"], anchor: "c" });
  });

  it("arrows move a single selection and clamp; Home/End jump", () => {
    expect(moveSelect(ITEMS, EMPTY_SELECTION, 1)).toEqual({ selected: ["a"], anchor: "a" });
    const s = { selected: ["b", "c"], anchor: "c" };
    expect(moveSelect(ITEMS, s, 1)).toEqual({ selected: ["d"], anchor: "d" });
    expect(moveSelect(ITEMS, { selected: ["e"], anchor: "e" }, 1)).toEqual({ selected: ["e"], anchor: "e" });
    expect(moveSelect(ITEMS, s, -Infinity)).toEqual({ selected: ["a"], anchor: "a" });
    expect(moveSelect(ITEMS, s, Infinity)).toEqual({ selected: ["e"], anchor: "e" });
    expect(moveSelect([], s, 1)).toEqual(EMPTY_SELECTION);
  });

  it("select all and prune", () => {
    expect(selectAll(ITEMS, { selected: ["c"], anchor: "c" })).toEqual({ selected: ITEMS, anchor: "c" });
    expect(pruneSelection(["a", "c"], { selected: ["a", "b", "c"], anchor: "b" })).toEqual({ selected: ["a", "c"], anchor: null });
  });
});
