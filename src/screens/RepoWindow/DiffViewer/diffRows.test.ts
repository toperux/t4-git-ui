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

describe("intra-line emphasis", () => {
  // The smoke fixture's first hunk: one paired edit, one unpaired add, and a lone delete.
  const d = fileDiff([
    hunk("h", [
      line("context", 1, 1, "line 01"),
      line("del", 2, null, "line 02"),
      line("add", null, 2, "line 02 edited"),
      line("add", null, 3, "line 02b"),
      line("context", 3, 4, "line 03"),
      line("del", 4, null, "line 28"),
    ]),
  ]);

  it("flattenSplit attaches the changed words to the paired sides only", () => {
    const rows = flattenSplit(d).rows.filter((r) => r.kind === "pair");
    expect(rows.map((r) => [r.emphL, r.emphR])).toEqual([
      [undefined, undefined], // context
      [undefined, [[7, 14]]], // `line 02` → `line 02 edited`
      [undefined, undefined], // unpaired add
      [undefined, undefined], // context
      [undefined, undefined], // del-only run
    ]);
  });

  it("flattenUnified attaches the same ranges to the matching line rows", () => {
    const rows = flattenUnified(d).rows.filter((r) => r.kind === "line");
    expect(rows.map((r) => r.emph)).toEqual([undefined, undefined, [[7, 14]], undefined, undefined, undefined]);
  });
});

describe("large diffs", () => {
  // A wall-clock budget is flaky on a loaded CI box; what matters is that both flatteners stay
  // single-pass and produce the whole diff, so assert the shape and keep only a generous
  // "not accidentally quadratic" ceiling.
  it("flattens a 30k-line diff both ways in one pass", () => {
    const d = bigDiff(30_000);
    const t0 = performance.now();
    const u = flattenUnified(d);
    const sp = flattenSplit(d);
    const ms = performance.now() - t0;
    expect(u.rows.length).toBeGreaterThan(30_000);
    expect(sp.rows.length).toBeGreaterThan(24_000);
    expect(ms).toBeLessThan(5_000);
  });
});
