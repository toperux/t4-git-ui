// Pure: flattens a FileDiff into the fixed-height row models the virtualized viewer renders.
import type { DiffLine, FileDiff } from "../../../api/types";

export const HUNK_ROW_H = 24;
export const LINE_ROW_H = 20;
/** Tabs render at `tab-size: 4`; used for the horizontal scroll width estimate. */
const TAB_COLS = 4;

export type UnifiedRow =
  | { kind: "hunk"; header: string }
  | { kind: "line"; line: DiffLine }
  /** `\ No newline at end of file` marker for the preceding line. */
  | { kind: "nonl" };

export type SplitRow =
  | { kind: "hunk"; header: string }
  /** `null` side = filler cell. */
  | { kind: "pair"; left: DiffLine | null; right: DiffLine | null }
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

export function flattenUnified(diff: FileDiff): Flattened<UnifiedRow> {
  const rows: UnifiedRow[] = [];
  let maxCols = 0;
  for (const h of diff.hunks) {
    rows.push({ kind: "hunk", header: h.header });
    for (const line of h.lines) {
      rows.push({ kind: "line", line });
      if (line.noNewline) rows.push({ kind: "nonl" });
      const c = cols(line.text);
      if (c > maxCols) maxCols = c;
    }
  }
  return { rows, maxCols };
}

/**
 * Side by side: context lines on both sides; within a hunk each run of non-context lines is
 * split into its dels and adds and zipped, the longer run's tail paired with a filler.
 */
export function flattenSplit(diff: FileDiff): Flattened<SplitRow> {
  const rows: SplitRow[] = [];
  let maxCols = 0;
  const push = (left: DiffLine | null, right: DiffLine | null) => {
    rows.push({ kind: "pair", left, right });
    if (left?.noNewline || right?.noNewline) rows.push({ kind: "nonl", left: !!left?.noNewline, right: !!right?.noNewline });
  };
  for (const h of diff.hunks) {
    rows.push({ kind: "hunk", header: h.header });
    const lines = h.lines;
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const c = cols(line.text);
      if (c > maxCols) maxCols = c;
      if (line.kind === "context") {
        push(line, line);
        i++;
        continue;
      }
      const dels: DiffLine[] = [];
      const adds: DiffLine[] = [];
      while (i < lines.length && lines[i].kind !== "context") {
        const l = lines[i];
        (l.kind === "del" ? dels : adds).push(l);
        const lc = cols(l.text);
        if (lc > maxCols) maxCols = lc;
        i++;
      }
      const n = Math.max(dels.length, adds.length);
      for (let k = 0; k < n; k++) push(dels[k] ?? null, adds[k] ?? null);
    }
  }
  return { rows, maxCols };
}
