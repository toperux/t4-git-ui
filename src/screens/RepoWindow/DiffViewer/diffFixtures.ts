// Test fixtures: hand-built and synthetic FileDiffs.
import type { DiffLine, FileDiff, Hunk } from "../../../api/types";

export function line(kind: DiffLine["kind"], oldNo: number | null, newNo: number | null, text: string, noNewline = false): DiffLine {
  return { kind, oldNo, newNo, text, noNewline };
}

export function hunk(header: string, lines: DiffLine[]): Hunk {
  return { header, oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines };
}

export function fileDiff(hunks: Hunk[], extra: Partial<FileDiff> = {}): FileDiff {
  let additions = 0;
  let deletions = 0;
  for (const h of hunks)
    for (const l of h.lines) {
      if (l.kind === "add") additions++;
      if (l.kind === "del") deletions++;
    }
  return { path: "src/a.ts", oldPath: null, status: "modified", binary: false, hunks, truncated: false, maxLines: 20_000, additions, deletions, ...extra };
}

/** `n` lines in hunks of 100: 60 context, 20 del, 20 add each. */
export function bigDiff(n: number): FileDiff {
  const hunks: Hunk[] = [];
  let o = 1;
  let nn = 1;
  for (let start = 0; start < n; start += 100) {
    const lines: DiffLine[] = [];
    for (let i = 0; i < 60 && start + i < n; i++) lines.push(line("context", o++, nn++, `\tcontext line ${o}`));
    for (let i = 0; i < 20 && start + 60 + i < n; i++) lines.push(line("del", o++, null, `old line ${o}\r`));
    for (let i = 0; i < 20 && start + 80 + i < n; i++) lines.push(line("add", null, nn++, `new line ${nn}`));
    hunks.push({ header: `@@ -${o} +${nn} @@`, oldStart: o, oldLines: 80, newStart: nn, newLines: 80, lines });
  }
  return fileDiff(hunks, { path: "big.txt" });
}

/**
 * The #32 walk's file as git diffs it: 2000 lines `line N`, every 10th changed to `line N changed`.
 * `wsOdd`: the odd tens (10, 30, …) only gain a trailing space, and `ignoreWhitespace` drops them.
 * `insertAfter` / `drop` name change `i` (line 10 (i + 1)): 7 lines added right after its changed
 * line, or the change gone (staged). At context 3 each change is its own hunk, so `i` is its hunk too.
 */
export function stripes({ wsOdd = false, ignoreWhitespace = false, context = 3, insertAfter = -1, drop = -1 } = {}): FileDiff {
  const changes: { at: number; text: string; extra: number }[] = [];
  for (let i = 0; i < 200; i++) {
    const at = 10 * (i + 1);
    const ws = wsOdd && i % 2 === 0;
    if (i === drop || (ws && ignoreWhitespace)) continue;
    changes.push({ at, text: ws ? `line ${at} ` : `line ${at} changed`, extra: i === insertAfter ? 7 : 0 });
  }
  // Changes whose context windows meet share a hunk, as git merges them.
  const groups: (typeof changes)[] = [];
  for (const c of changes) {
    const g = groups[groups.length - 1];
    if (g && c.at - g[g.length - 1].at - 1 <= 2 * context) g.push(c);
    else groups.push([c]);
  }
  let shift = 0; // new line number − old, from the lines inserted above
  const hunks = groups.map((g): Hunk => {
    const oldStart = Math.max(1, g[0].at - context);
    const oldEnd = Math.min(2000, g[g.length - 1].at + context);
    const newStart = oldStart + shift;
    const lines: DiffLine[] = [];
    let k = 0;
    for (let o = oldStart; o <= oldEnd; o++) {
      const c = g[k];
      if (c?.at !== o) {
        lines.push(line("context", o, o + shift, `line ${o}`));
        continue;
      }
      lines.push(line("del", o, null, `line ${o}`), line("add", null, o + shift, c.text));
      for (let e = 1; e <= c.extra; e++) lines.push(line("add", null, o + shift + e, `inserted ${e}`));
      shift += c.extra;
      k++;
    }
    const oldLines = oldEnd - oldStart + 1;
    const newLines = oldEnd + shift - newStart + 1;
    return { header: `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`, oldStart, oldLines, newStart, newLines, lines };
  });
  return fileDiff(hunks, { path: "w.txt" });
}
