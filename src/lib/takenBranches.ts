import type { LinkedSnapshot, RefsSnapshot } from "../api/types";

/**
 * Branches a checkout already holds: git refuses a second worktree on any of them.
 *
 * The open repository's own branch comes from `refs`, not from the linked snapshot: that one trails
 * the branch list by a fetch and may never land at all (a broken worktree link), and the current
 * branch is the one a user is most likely to try.
 */
export function takenBranches(linked: LinkedSnapshot | null, refs: RefsSnapshot | null): Set<string> {
  const names = (linked?.worktrees ?? []).flatMap((w) => (w.head?.branch ? [w.head.branch] : []));
  if (refs?.head.branch) names.push(refs.head.branch);
  return new Set(names);
}
