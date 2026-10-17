// Pure: where a reloaded diff's view lands, so that the line at the top stays at the top.
import type { FileDiff } from "../../../api/types";
import { rowHeight, type SplitRow, type UnifiedRow } from "./diffRows";
import { hunkMap } from "./lineSelection";

type Row = UnifiedRow | SplitRow;

/** Each row's top offset, the rows being fixed-height. */
function starts(rows: Row[]): number[] {
  const out: number[] = [];
  let y = 0;
  for (const r of rows) {
    out.push(y);
    y += rowHeight(r);
  }
  return out;
}

/** A line row's two numbers, `null` on the side it doesn't have; headers and no-newline markers have none. */
function nums(row: Row): { old: number | null; new: number | null } | null {
  if (row.kind === "line") return { old: row.line.oldNo, new: row.line.newNo };
  if (row.kind === "pair") return { old: row.left?.oldNo ?? null, new: row.right?.newNo ?? null };
  return null;
}

/**
 * The offset in `nextRows` that puts the row at `top` in `prevRows` back at the top, as many pixels
 * of it scrolled off as before. A hunk `hunkMap` matches renders the same rows, so the anchor keeps
 * its row inside it. A rewritten hunk is searched by line number instead (the old side for a deleted
 * line, the new side otherwise); a line that is hidden or gone gives way to the first one after it,
 * and a hunk's first line to its header, so the hunk lands whole. Past the last row: the last row.
 */
export function carryOffset(prevDiff: FileDiff, prevRows: Row[], top: number, nextDiff: FileDiff, nextRows: Row[]): number {
  if (prevRows.length === 0 || nextRows.length === 0) return top;
  const was = starts(prevRows);
  // The top row, and its hunk: one header per hunk in both views, so headers count hunks.
  let a = 0;
  let hunk = -1;
  let head = 0;
  for (let i = 0; i < prevRows.length && was[i] <= top; i++) {
    a = i;
    if (prevRows[i].kind === "hunk") {
      hunk++;
      head = i;
    }
  }
  const within = top - was[a];
  const now = starts(nextRows);

  const j = hunkMap(prevDiff, nextDiff).get(hunk);
  if (j !== undefined) {
    let k = -1;
    for (let h = -1; h < j; ) if (nextRows[++k].kind === "hunk") h++;
    let end = k + 1;
    while (end < nextRows.length && nextRows[end].kind !== "hunk") end++;
    // `hunkId` ignores `noNewline`: a matched last hunk can gain or lose its marker row.
    return now[Math.min(k + a - head, end - 1)] + within;
  }

  // A header takes its first line's numbers, a no-newline marker the line before it.
  const header = prevRows[a].kind === "hunk";
  const marker = prevRows[a].kind === "nonl";
  const n = nums(prevRows[header ? a + 1 : marker ? a - 1 : a])!;
  const side = n.new === null ? "old" : "new";
  const want = n[side]!;
  for (let k = 0; k < nextRows.length; k++) {
    const m = nums(nextRows[k])?.[side];
    if (m == null || m < want) continue;
    if (m === want && !header) return now[marker && nextRows[k + 1]?.kind === "nonl" ? k + 1 : k] + within;
    return now[nextRows[k - 1].kind === "hunk" ? k - 1 : k];
  }
  return now[nextRows.length - 1];
}
