// Pure line-selection model for the actions mode of the unified diff.
// Only `add` / `del` lines are selectable; Shift ranges stay within one hunk.
import type { FileDiff, Hunk } from "../../../api/types";

export interface LineRef {
  hunk: number;
  line: number;
}

export interface LineSelection {
  /** `"<hunk>:<line>"` keys. */
  keys: ReadonlySet<string>;
  anchor: LineRef | null;
}

export const EMPTY_LINES: LineSelection = { keys: new Set(), anchor: null };

export const lineKey = (hunk: number, line: number) => `${hunk}:${line}`;

function isSelectable(diff: FileDiff, ref: LineRef): boolean {
  const kind = diff.hunks[ref.hunk]?.lines[ref.line]?.kind;
  return kind === "add" || kind === "del";
}

/**
 * Click: plain = only this line; Ctrl = toggle; Shift = every add/del line between the anchor and this
 * line when both sit in the same hunk (replacing, or added to with Ctrl+Shift). Context lines are ignored.
 */
export function clickLine(diff: FileDiff, sel: LineSelection, ref: LineRef, mods: { ctrl?: boolean; shift?: boolean } = {}): LineSelection {
  if (!isSelectable(diff, ref)) return sel;
  const key = lineKey(ref.hunk, ref.line);
  if (mods.shift && sel.anchor && sel.anchor.hunk === ref.hunk) {
    const keys = new Set(mods.ctrl ? sel.keys : []);
    const lo = Math.min(sel.anchor.line, ref.line);
    const hi = Math.max(sel.anchor.line, ref.line);
    for (let l = lo; l <= hi; l++) if (isSelectable(diff, { hunk: ref.hunk, line: l })) keys.add(lineKey(ref.hunk, l));
    return { keys, anchor: sel.anchor };
  }
  if (mods.ctrl) {
    const keys = new Set(sel.keys);
    if (keys.has(key)) keys.delete(key);
    else keys.add(key);
    return { keys, anchor: ref };
  }
  return { keys: new Set([key]), anchor: ref };
}

/** `[hunk, line]` pairs in diff order. */
export function toPairs(sel: LineSelection): [number, number][] {
  return Array.from(sel.keys, (k) => k.split(":").map(Number) as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** A hunk's identity across a reload: its lines, which staging another hunk leaves untouched. */
const hunkId = (h: Hunk) => h.lines.map((l) => `${l.kind} ${l.text}`).join("\n");

/** Old hunk index → new one across a reload of the same file, matched by content in order (each new hunk claimed once). */
function hunkMap(oldDiff: FileDiff, newDiff: FileDiff): Map<number, number> {
  const free = new Map<string, number[]>();
  newDiff.hunks.forEach((h, j) => {
    const id = hunkId(h);
    const q = free.get(id);
    if (q) q.push(j);
    else free.set(id, [j]);
  });
  const moved = new Map<number, number>();
  oldDiff.hunks.forEach((h, i) => {
    const j = free.get(hunkId(h))?.shift();
    if (j !== undefined) moved.set(i, j);
  });
  return moved;
}

/** Where one ref lands after a reload; `null` if its hunk is gone — the one that was just staged. */
export function carryRef(ref: LineRef, oldDiff: FileDiff, newDiff: FileDiff): LineRef | null {
  const j = hunkMap(oldDiff, newDiff).get(ref.hunk);
  return j === undefined ? null : { hunk: j, line: ref.line };
}

/**
 * Carries a selection across a reload of the same file: line indices inside a matched hunk are
 * unchanged, and refs whose hunk is gone — the one that was just staged — are dropped.
 */
export function carrySelection(sel: LineSelection, oldDiff: FileDiff, newDiff: FileDiff): LineSelection {
  const moved = hunkMap(oldDiff, newDiff);
  const keys = new Set<string>();
  for (const [h, l] of toPairs(sel)) {
    const j = moved.get(h);
    if (j !== undefined) keys.add(lineKey(j, l));
  }
  const anchorHunk = sel.anchor ? moved.get(sel.anchor.hunk) : undefined;
  return { keys, anchor: anchorHunk === undefined ? null : { hunk: anchorHunk, line: sel.anchor!.line } };
}
