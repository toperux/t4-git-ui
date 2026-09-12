// Blame gutter, the pure part: which hunk owns each line of the content view, where its label goes,
// how old it reads, and the text the label and the hover show.
import type { Blame, BlameHunk } from "../../../api/types";
import { absoluteDate, relativeDate } from "../../../lib/relativeDate";

/** Tint steps, 1 (oldest hunk in the file) … 5 (newest) — five stay apart at a 20px row. */
export const TINT_STEPS = 5;

export interface BlameRow {
  hunk: BlameHunk;
  /** The hunk's first line, which carries the label; the rest carry only the tint. */
  first: boolean;
  /** 1 … `TINT_STEPS`. */
  step: number;
}

const max = (ns: number[]) => ns.reduce((m, n) => (n > m ? n : m), ns[0]);
const min = (ns: number[]) => ns.reduce((m, n) => (n < m ? n : m), ns[0]);

/**
 * One entry per line of the content view (index = line number − 1), `undefined` where blame has
 * nothing to say — past the last hunk, which is where a truncated file's tail is.
 *
 * The tint is a **log** scale over the ages in *this* file: commit times cluster, so a linear scale
 * would drop a file's whole history into one step as soon as a single hunk is a year older.
 */
export function blameRows(blame: Blame, lines: number): (BlameRow | undefined)[] {
  const out = new Array<BlameRow | undefined>(lines).fill(undefined);
  if (blame.hunks.length === 0) return out;
  const times = blame.hunks.map((h) => h.time);
  const newest = max(times);
  const span = newest - min(times);
  for (const hunk of blame.hunks) {
    // One commit, or a fixture with equal times: nothing is older than anything, so all read newest.
    const age = span === 0 ? 0 : Math.log1p(newest - hunk.time) / Math.log1p(span);
    const step = TINT_STEPS - Math.min(TINT_STEPS - 1, Math.floor(age * TINT_STEPS));
    for (let i = 0; i < hunk.lines; i++) {
      const row = hunk.start - 1 + i;
      if (row >= 0 && row < lines) out[row] = { hunk, first: i === 0, step };
    }
  }
  return out;
}

/** The gutter's label, and the row's accessible name: `<short> <author> <age>`. */
export function blameLabel(hunk: BlameHunk, now?: number): string {
  return hunk.uncommitted ? "Uncommitted" : `${hunk.short} ${hunk.author} ${relativeDate(hunk.time, now)}`;
}

/** Hover: what the label leaves out — the summary, the exact date and the name before a rename. */
export function blameTitle(hunk: BlameHunk): string {
  if (hunk.uncommitted) return "Not committed yet";
  const lines = [hunk.summary, `${hunk.author} · ${absoluteDate(hunk.time)}`];
  if (hunk.origPath) lines.push(`was ${hunk.origPath}`);
  return lines.join("\n");
}
