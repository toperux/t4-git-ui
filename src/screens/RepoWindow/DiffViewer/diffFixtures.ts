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
