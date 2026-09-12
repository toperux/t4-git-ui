import { describe, expect, it } from "vitest";
import type { Blame, BlameHunk } from "../../../api/types";
import { blameLabel, blameRows, blameTitle, TINT_STEPS } from "./blameRows";

const DAY = 86_400;
const NOW = 1_800_000_000;

const hunk = (over: Partial<BlameHunk> = {}): BlameHunk => ({
  start: 1,
  lines: 1,
  oid: "a".repeat(40),
  short: "aaaaaaa",
  author: "Ada",
  time: NOW,
  summary: "a change",
  origPath: null,
  uncommitted: false,
  previous: null,
  ...over,
});

const blame = (...hunks: BlameHunk[]): Blame => ({ path: "a.ts", hunks });

describe("blameRows", () => {
  it("labels a hunk's first line and tints the rest of it", () => {
    const rows = blameRows(blame(hunk({ start: 1, lines: 3 }), hunk({ start: 4, lines: 1, oid: "b".repeat(40) })), 4);
    expect(rows.map((r) => r?.first)).toEqual([true, false, false, true]);
    expect(rows.map((r) => r?.hunk.oid.slice(0, 1))).toEqual(["a", "a", "a", "b"]);
  });

  it("says nothing about lines no hunk covers — a truncated file's tail", () => {
    const rows = blameRows(blame(hunk({ start: 1, lines: 2 })), 4);
    expect(rows.slice(2)).toEqual([undefined, undefined]);
    // A hunk running past the cap keeps the rows it does cover.
    expect(blameRows(blame(hunk({ start: 1, lines: 99 })), 2).every((r) => r?.first !== undefined)).toBe(true);
    expect(blameRows(blame(), 2)).toEqual([undefined, undefined]);
  });

  it("tints newest to oldest on a log scale over this file's own ages", () => {
    const rows = blameRows(
      blame(
        hunk({ start: 1, time: NOW }),
        hunk({ start: 2, time: NOW - DAY }),
        hunk({ start: 3, time: NOW - 400 * DAY }),
        hunk({ start: 4, time: NOW - 3650 * DAY }),
      ),
      4,
    );
    const steps = rows.map((r) => r?.step);
    expect(steps[0]).toBe(TINT_STEPS);
    expect(steps[3]).toBe(1);
    // Monotonic: older never reads newer. A day out of ten years still separates on a log scale,
    // where a linear one would have put the first three in the same step.
    expect(steps).toEqual([...steps].sort((a, b) => (b ?? 0) - (a ?? 0)));
    expect(new Set(steps).size).toBeGreaterThan(2);
    // One commit (or equal times): nothing is older than anything, so everything reads newest.
    expect(blameRows(blame(hunk({ start: 1 }), hunk({ start: 2 })), 2).map((r) => r?.step)).toEqual([TINT_STEPS, TINT_STEPS]);
  });

  it("names the commit in the label and puts the rest in the hover", () => {
    expect(blameLabel(hunk(), NOW)).toBe("aaaaaaa Ada just now");
    expect(blameLabel(hunk({ uncommitted: true }), NOW)).toBe("Uncommitted");
    expect(blameTitle(hunk({ summary: "the change" }))).toContain("the change");
    expect(blameTitle(hunk())).toContain("Ada · ");
    expect(blameTitle(hunk({ origPath: "old.ts" }))).toContain("was old.ts");
    expect(blameTitle(hunk({ origPath: "old.ts", uncommitted: true }))).toBe("Not committed yet");
  });
});
