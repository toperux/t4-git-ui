import { describe, expect, it } from "vitest";
import type { FileDiff } from "../../../api/types";
import { fileDiff, hunk, line, stripes } from "./diffFixtures";
import { flattenSplit, flattenUnified, rowHeight } from "./diffRows";
import { carryOffset } from "./scrollAnchor";

// Rows are 24 px (a hunk header) and 20 px (a line): a context-3 hunk of the walk's file is 184 px,
// the last one (line 2000, no trailing context) 124 px.
const unified = (d: FileDiff) => flattenUnified(d).rows;
const split = (d: FileDiff) => flattenSplit(d).rows;
const height = (rows: { kind: string }[]) => rows.reduce((y, r) => y + rowHeight(r), 0);
/** `top` in `prev` carried into `next`, in the view `flat` builds. */
const carry = (flat: typeof unified | typeof split, prev: FileDiff, top: number, next: FileDiff) => carryOffset(prev, flat(prev), top, next, flat(next));

const WS = stripes({ wsOdd: true });
const WS_HIDDEN = stripes({ wsOdd: true, ignoreWhitespace: true });

describe("carryOffset", () => {
  it("an unchanged diff keeps any offset", () => {
    const d = stripes();
    for (const top of [0, 7, 12_000, 15_000, 36_700]) expect(carry(unified, d, top, { ...d })).toBe(top);
  });

  it("the whitespace toggle keeps the top line by the same-hunk match", () => {
    // The walk's heights: 200 hunks, then 100 with `-w`.
    expect(height(unified(WS))).toBe(36_740);
    expect(height(unified(WS_HIDDEN))).toBe(18_340);
    // At 15 000 the top row is hunk 81's deleted line 820, 12 px in; with `-w` that hunk is hunk 40.
    expect(carry(unified, WS, 15_000, WS_HIDDEN)).toBe(7_456);
    expect(carry(unified, WS_HIDDEN, 7_456, WS)).toBe(15_000);
  });

  it("a line `-w` hides gives way to the header of the next hunk", () => {
    // 14 816: the deleted line 810, whitespace only. Its hunk is gone, and line 817 is the next
    // hunk's first line, so the view lands on that hunk's header.
    expect(carry(unified, WS, 14_816, WS_HIDDEN)).toBe(7_360);
    // Back: the header's hunk is the 820 one, which keeps its header on top.
    expect(carry(unified, WS_HIDDEN, 7_360, WS)).toBe(14_904);
  });

  it("an edit above moves the view with its line", () => {
    // Hunk 9 gains 7 added lines after line 100: +140 px. At 12 000: context line 657, 16 px in.
    const edited = stripes({ insertAfter: 9 });
    expect(height(unified(edited)) - height(unified(stripes()))).toBe(140);
    expect(carry(unified, stripes(), 12_000, edited)).toBe(12_140);
    // The row there is now old 657 / new 664, still 16 px in.
    const rows = unified(edited);
    let i = 0;
    let y = 0;
    while (y + rowHeight(rows[i]) <= 12_140) y += rowHeight(rows[i++]);
    const row = rows[i];
    expect(row.kind === "line" && [row.line.oldNo, row.line.newNo, 12_140 - y]).toEqual([657, 664, 16]);
  });

  it("staging the anchor's own hunk lands on the next hunk's header", () => {
    expect(carry(unified, stripes(), 12_000, stripes({ drop: 65 }))).toBe(11_960);
  });

  it("staging a hunk above keeps the same line, by the same-hunk match", () => {
    // The pixel offset would have stayed at 12 000.
    expect(carry(unified, stripes(), 12_000, stripes({ drop: 9 }))).toBe(11_816);
  });

  it("a context change finds the line by number inside the merged hunk, and back", () => {
    const ten = stripes({ context: 10 });
    expect(ten.hunks).toHaveLength(1);
    expect(carry(unified, stripes(), 12_000, ten)).toBe(14_460);
    expect(carry(unified, ten, 14_460, stripes())).toBe(12_000);
  });

  it("split rows: 164 px hunks, the same pair and the same `within`", () => {
    expect(height(split(WS))).toBe(199 * 164 + 104);
    // Case 2: line 820's pair, 12 px in.
    expect(carry(split, WS, 13_380, WS_HIDDEN)).toBe(6_656);
    expect(carry(split, WS_HIDDEN, 6_656, WS)).toBe(13_380);
    // Case 4: context line 657, 16 px in, 140 px further down.
    expect(carry(split, stripes(), 65 * 164 + 24 + 16, stripes({ insertAfter: 9 }))).toBe(65 * 164 + 24 + 16 + 140);
  });

  it("a no-newline marker on top stays on top when its hunk is rewritten", () => {
    // Rows: header 0, `1` 24, `-2` 44, `+2` 64, the marker 84. At 90 the marker is on top, 6 px in.
    const end = (old: string) =>
      fileDiff([hunk("@@ -1,2 +1,2 @@", [line("context", 1, 1, "1"), line("del", 2, null, old), line("add", null, 2, "b", true)])]);
    expect(carry(unified, end("a"), 90, end("a2"))).toBe(90);
  });

  it("a no-newline marker after a deleted line stays on top by the old side", () => {
    // Rows: header 0, `1` 24, `-2` 44, the marker 64, `+2` 84. At 70 the marker is on top, 6 px in.
    const end = (add: string) =>
      fileDiff([hunk("@@ -1,2 +1,2 @@", [line("context", 1, 1, "1"), line("del", 2, null, "a", true), line("add", null, 2, add)])]);
    expect(carry(unified, end("b"), 70, end("b2"))).toBe(70);
  });

  it("the ends: the top stays the top, and a line past the new end lands on the last row", () => {
    // Hunk 0 (line 10) is whitespace only: its header gives way to the first hunk left, at 0.
    expect(carry(unified, WS, 0, WS_HIDDEN)).toBe(0);
    // Context line 1997 of the last hunk, which was staged: nothing follows it.
    const staged = stripes({ drop: 199 });
    expect(carry(unified, stripes(), 199 * 184 + 24, staged)).toBe(height(unified(staged)) - 20);
  });
});
