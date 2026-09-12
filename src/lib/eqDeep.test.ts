import { describe, expect, it } from "vitest";
import { eqDeep } from "./eqDeep";

describe("eqDeep", () => {
  it("matches a JSON.stringify comparison on plain values", () => {
    expect(eqDeep(1, 1)).toBe(true);
    expect(eqDeep("a", "a")).toBe(true);
    expect(eqDeep(null, null)).toBe(true);
    expect(eqDeep(null, {})).toBe(false);
    expect(eqDeep(1, "1")).toBe(false);
    expect(eqDeep(undefined, null)).toBe(false);
  });

  it("compares arrays by length and position", () => {
    expect(eqDeep([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(eqDeep([1, 2], [1, 2, 3])).toBe(false);
    expect(eqDeep([1, 2], [2, 1])).toBe(false);
    // An array and an object with the same numeric keys are not the same value.
    expect(eqDeep([1], { 0: 1 })).toBe(false);
  });

  it("compares objects by key set, whatever the key order", () => {
    expect(eqDeep({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(eqDeep({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(eqDeep({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false);
  });

  it("counts an undefined-valued key as absent, the way JSON.stringify drops it", () => {
    expect(eqDeep({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(eqDeep({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    expect(eqDeep({ a: undefined }, { a: 1 })).toBe(false);
    expect(eqDeep({ a: 1, b: undefined }, { a: 1, b: 2 })).toBe(false);
    expect(eqDeep({ h: [{ text: "x", oldNo: undefined }] }, { h: [{ text: "x" }] })).toBe(true);
  });

  it("finds a mismatch nested deep in the structure", () => {
    const a = { hunks: [{ header: "@@", lines: [{ kind: "add", text: "x" }] }] };
    expect(eqDeep(a, { hunks: [{ header: "@@", lines: [{ kind: "add", text: "x" }] }] })).toBe(true);
    expect(eqDeep(a, { hunks: [{ header: "@@", lines: [{ kind: "add", text: "y" }] }] })).toBe(false);
    expect(eqDeep(a, { hunks: [{ header: "@@", lines: [] }] })).toBe(false);
  });
});
