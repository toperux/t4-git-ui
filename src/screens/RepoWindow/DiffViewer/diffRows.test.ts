import { describe, expect, it } from "vitest";
import { bigDiff, fileDiff, hunk, line } from "./diffFixtures";
import { flattenSplit, flattenUnified, type SplitRow } from "./diffRows";

const pairs = (rows: SplitRow[]) =>
  rows.filter((r) => r.kind === "pair").map((r) => [r.left?.text ?? null, r.right?.text ?? null]);

describe("flattenUnified", () => {
  it("emits hunk rows, line rows and a no-newline marker", () => {
    const d = fileDiff([hunk("@@ -1 +1 @@", [line("context", 1, 1, "a"), line("del", 2, null, "b"), line("add", null, 2, "c", true)])]);
    const { rows, maxCols } = flattenUnified(d);
    expect(rows.map((r) => r.kind)).toEqual(["hunk", "line", "line", "line", "nonl"]);
    expect(maxCols).toBe(1);
  });

  it("counts tabs as 4 columns for the scroll width", () => {
    const { maxCols } = flattenUnified(fileDiff([hunk("h", [line("context", 1, 1, "\tab")])]));
    expect(maxCols).toBe(6);
  });
});

describe("flattenSplit", () => {
  it("zips a del run with the following add run", () => {
    const d = fileDiff([hunk("h", [line("del", 1, null, "d1"), line("del", 2, null, "d2"), line("add", null, 1, "a1"), line("add", null, 2, "a2")])]);
    expect(pairs(flattenSplit(d).rows)).toEqual([
      ["d1", "a1"],
      ["d2", "a2"],
    ]);
  });

  it("fills the shorter side of an uneven run", () => {
    const d = fileDiff([hunk("h", [line("del", 1, null, "d1"), line("add", null, 1, "a1"), line("add", null, 2, "a2"), line("add", null, 3, "a3")])]);
    expect(pairs(flattenSplit(d).rows)).toEqual([
      ["d1", "a1"],
      [null, "a2"],
      [null, "a3"],
    ]);
    const only = fileDiff([hunk("h", [line("del", 1, null, "d1"), line("del", 2, null, "d2")])]);
    expect(pairs(flattenSplit(only).rows)).toEqual([
      ["d1", null],
      ["d2", null],
    ]);
  });

  it("passes context through on both sides and separates runs by context", () => {
    const d = fileDiff([
      hunk("h", [line("context", 1, 1, "c1"), line("del", 2, null, "d1"), line("context", 3, 2, "c2"), line("add", null, 3, "a1")]),
    ]);
    const rows = flattenSplit(d).rows;
    expect(rows[0]).toEqual({ kind: "hunk", header: "h" });
    expect(pairs(rows)).toEqual([
      ["c1", "c1"],
      ["d1", null],
      ["c2", "c2"],
      [null, "a1"],
    ]);
  });

  it("marks no-newline per side", () => {
    const d = fileDiff([hunk("h", [line("del", 1, null, "d", true), line("add", null, 1, "a")])]);
    const rows = flattenSplit(d).rows;
    expect(rows[2]).toEqual({ kind: "nonl", left: true, right: false });
    const both = fileDiff([hunk("h", [line("context", 1, 1, "c", true)])]);
    expect(flattenSplit(both).rows[2]).toEqual({ kind: "nonl", left: true, right: true });
  });
});

describe("performance", () => {
  it("flattens a 30k-line diff both ways in under 50 ms", () => {
    const d = bigDiff(30_000);
    const t0 = performance.now();
    const u = flattenUnified(d);
    const sp = flattenSplit(d);
    const ms = performance.now() - t0;
    expect(u.rows.length).toBeGreaterThan(30_000);
    expect(sp.rows.length).toBeGreaterThan(24_000);
    expect(ms).toBeLessThan(50);
  });
});
