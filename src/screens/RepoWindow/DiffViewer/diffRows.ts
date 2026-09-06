// Pure: flattens a FileDiff into the fixed-height row models the virtualized viewer renders.
import type { DiffLine, FileDiff } from "../../../api/types";
import { emphasis, type EmphRange } from "./intraLine";

export const HUNK_ROW_H = 24;
export const LINE_ROW_H = 20;
/** Tabs render at `tab-size: 4`; used for the horizontal scroll width estimate. */
const TAB_COLS = 4;

/** Unified rows carry their `FileDiff` indices so the actions mode can address hunks / lines. */
export type UnifiedRow =
  | { kind: "hunk"; header: string; hunk: number }
  /** `emph` = the changed words of the del/add pair this line belongs to. */
  | { kind: "line"; line: DiffLine; hunk: number; index: number; emph?: EmphRange[] }
  /** `\ No newline at end of file` marker for the preceding line. */
  | { kind: "nonl" };

export type SplitRow =
  | { kind: "hunk"; header: string }
  /** `null` side = filler cell; `emphL` / `emphR` = the changed words of a del/add pair. */
  | { kind: "pair"; left: DiffLine | null; right: DiffLine | null; emphL?: EmphRange[]; emphR?: EmphRange[] }
  | { kind: "nonl"; left: boolean; right: boolean };

export interface Flattened<R> {
  rows: R[];
  /** Widest line in columns (tabs expanded) — sizes the horizontal scroll area. */
  maxCols: number;
}

export const rowHeight = (row: { kind: string }) => (row.kind === "hunk" ? HUNK_ROW_H : LINE_ROW_H);

function cols(text: string): number {
  let n = text.length;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 9) n += TAB_COLS - 1;
  return n;
}

/**
 * The pairing both views share: a context line on both sides, and within a hunk each run of
 * non-context lines split into its dels and adds and zipped, the longer run's tail against a
 * filler (`null` line, `-1` index). A del/add pair is what carries an intra-line highlight.
 */
function walkPairs(lines: DiffLine[], pair: (left: DiffLine | null, right: DiffLine | null, li: number, ri: number) => void) {
  let i = 0;
  while (i < lines.length) {
    if (lines[i].kind === "context") {
      pair(lines[i], lines[i], i, i);
      i++;
      continue;
    }
    const dels: number[] = [];
    const adds: number[] = [];
    while (i < lines.length && lines[i].kind !== "context") {
      (lines[i].kind === "del" ? dels : adds).push(i);
      i++;
    }
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) {
      const li = dels[k] ?? -1;
      const ri = adds[k] ?? -1;
      pair(li < 0 ? null : lines[li], ri < 0 ? null : lines[ri], li, ri);
    }
  }
}

export function flattenUnified(diff: FileDiff): Flattened<UnifiedRow> {
  const rows: UnifiedRow[] = [];
  let maxCols = 0;
  diff.hunks.forEach((h, hunk) => {
    rows.push({ kind: "hunk", header: h.header, hunk });
    // Unified has no pair row to hang the highlight off, so walk the hunk's pairs first and keep
    // the ranges by line index — the same pairing, and so the same highlight, as the split view.
    const emph: (EmphRange[] | undefined)[] = [];
    walkPairs(h.lines, (left, right, li, ri) => {
      const e = left?.kind === "del" && right ? emphasis(left.text, right.text) : null;
      if (e?.del.length) emph[li] = e.del;
      if (e?.add.length) emph[ri] = e.add;
    });
    h.lines.forEach((line, index) => {
      rows.push({ kind: "line", line, hunk, index, emph: emph[index] });
      if (line.noNewline) rows.push({ kind: "nonl" });
      const c = cols(line.text);
      if (c > maxCols) maxCols = c;
    });
  });
  return { rows, maxCols };
}

/**
 * Side by side: context lines on both sides; within a hunk each run of non-context lines is
 * split into its dels and adds and zipped, the longer run's tail paired with a filler.
 */
export function flattenSplit(diff: FileDiff): Flattened<SplitRow> {
  const rows: SplitRow[] = [];
  let maxCols = 0;
  const wide = (text: string) => {
    const c = cols(text);
    if (c > maxCols) maxCols = c;
  };
  for (const h of diff.hunks) {
    rows.push({ kind: "hunk", header: h.header });
    walkPairs(h.lines, (left, right) => {
      if (left) wide(left.text);
      // A context line is the same object on both sides; measuring it twice would be waste.
      if (right && right !== left) wide(right.text);
      const row: SplitRow = { kind: "pair", left, right };
      const e = left?.kind === "del" && right ? emphasis(left.text, right.text) : null;
      if (e?.del.length) row.emphL = e.del;
      if (e?.add.length) row.emphR = e.add;
      rows.push(row);
      if (left?.noNewline || right?.noNewline) rows.push({ kind: "nonl", left: !!left?.noNewline, right: !!right?.noNewline });
    });
  }
  return { rows, maxCols };
}
