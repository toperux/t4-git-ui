import { describe, expect, it } from "vitest";
import { fileDiff, hunk, line } from "./diffFixtures";
import { carryRef, carrySelection, clickLine, EMPTY_LINES, hunkMap, toPairs } from "./lineSelection";

const DIFF = fileDiff([
  hunk("@@ -1 +1 @@", [
    line("context", 1, 1, "ctx"), // 0
    line("del", 2, null, "old"), // 1
    line("add", null, 2, "new"), // 2
    line("context", 3, 3, "ctx"), // 3
    line("add", null, 4, "new2"), // 4
  ]),
  hunk("@@ -10 +10 @@", [
    line("add", null, 10, "x"), // 0
    line("add", null, 11, "y"), // 1
  ]),
]);

describe("lineSelection", () => {
  it("ignores context lines", () => {
    expect(clickLine(DIFF, EMPTY_LINES, { hunk: 0, line: 0 })).toBe(EMPTY_LINES);
    expect(clickLine(DIFF, EMPTY_LINES, { hunk: 0, line: 3 }, { shift: true })).toBe(EMPTY_LINES);
  });

  it("plain click, ctrl toggle", () => {
    let s = clickLine(DIFF, EMPTY_LINES, { hunk: 0, line: 2 });
    expect(toPairs(s)).toEqual([[0, 2]]);
    s = clickLine(DIFF, s, { hunk: 1, line: 0 }, { ctrl: true });
    expect(toPairs(s)).toEqual([
      [0, 2],
      [1, 0],
    ]);
    s = clickLine(DIFF, s, { hunk: 0, line: 2 }, { ctrl: true });
    expect(toPairs(s)).toEqual([[1, 0]]);
    expect(clickLine(DIFF, s, { hunk: 0, line: 1 }).keys.size).toBe(1);
  });

  it("shift range stays within the anchor's hunk and skips context lines", () => {
    let s = clickLine(DIFF, EMPTY_LINES, { hunk: 0, line: 1 });
    s = clickLine(DIFF, s, { hunk: 0, line: 4 }, { shift: true });
    expect(toPairs(s)).toEqual([
      [0, 1],
      [0, 2],
      [0, 4],
    ]);
    // Reverse direction keeps the anchor.
    s = clickLine(DIFF, s, { hunk: 0, line: 2 }, { shift: true });
    expect(toPairs(s)).toEqual([
      [0, 1],
      [0, 2],
    ]);
    // A different hunk: no range, plain click semantics.
    s = clickLine(DIFF, s, { hunk: 1, line: 1 }, { shift: true });
    expect(toPairs(s)).toEqual([[1, 1]]);
  });

  it("carries a selection over a reload, dropping the refs of the hunk that was staged", () => {
    const three = fileDiff([DIFF.hunks[0], hunk("@@ -20 +20 @@", [line("del", 20, null, "z")]), DIFF.hunks[1]]);
    // Hunk 2's selection survives the removal of hunk 0 — as hunk 1.
    let s = clickLine(three, EMPTY_LINES, { hunk: 2, line: 1 });
    s = clickLine(three, s, { hunk: 1, line: 0 }, { ctrl: true });
    const after = fileDiff([three.hunks[1], three.hunks[2]]);
    const moved = hunkMap(three, after);
    const carried = carrySelection(s, moved);
    expect(toPairs(carried)).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(carried.anchor).toEqual({ hunk: 0, line: 0 });

    // A selection inside the staged hunk is dropped, anchor and all.
    const gone = carrySelection(clickLine(three, EMPTY_LINES, { hunk: 0, line: 2 }), moved);
    expect(toPairs(gone)).toEqual([]);
    expect(gone.anchor).toBeNull();
  });

  it("carries a single ref over a reload, or drops it with its hunk", () => {
    const three = fileDiff([DIFF.hunks[0], hunk("@@ -20 +20 @@", [line("del", 20, null, "z")]), DIFF.hunks[1]]);
    const after = fileDiff([three.hunks[1], three.hunks[2]]);
    const moved = hunkMap(three, after);
    expect(carryRef({ hunk: 2, line: 1 }, moved)).toEqual({ hunk: 1, line: 1 });
    expect(carryRef({ hunk: 0, line: 2 }, moved)).toBeNull();
  });

  it("emits [hunk, line] pairs in diff order", () => {
    let s = clickLine(DIFF, EMPTY_LINES, { hunk: 1, line: 1 });
    s = clickLine(DIFF, s, { hunk: 0, line: 4 }, { ctrl: true });
    s = clickLine(DIFF, s, { hunk: 0, line: 1 }, { ctrl: true });
    expect(toPairs(s)).toEqual([
      [0, 1],
      [0, 4],
      [1, 1],
    ]);
  });
});
