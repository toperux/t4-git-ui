// What the commit context menu offers for the branches sitting at a commit.
import type { RefsSnapshot } from "../../../api/types";
import { stripRemote } from "../actions";

/** A branch at the commit; `remote` is set for a remote branch (`origin/x` on `origin`). */
export interface BranchAt {
  name: string;
  remote: string | null;
}

/** A remote branch at the commit whose local counterpart sits somewhere else. */
export interface ResetToRemote {
  /** The local branch to move. */
  branch: string;
  /** The remote branch (`origin/x`) to move it to. */
  remote: string;
  /** The local branch is checked out, so it takes a `git reset` rather than `git branch -f`. */
  current: boolean;
}

export interface CommitBranchActions {
  /** Checkout candidates: local branches other than the current one, remote ones without a local counterpart. */
  checkout: BranchAt[];
  reset: ResetToRemote[];
  /** Merge candidates: every branch at the commit but the current one and remotes a local sits on. */
  merge: BranchAt[];
  /** What a rebase of the current branch lands on: a local branch here, else a remote one, else the caller's oid. */
  rebaseOnto: BranchAt | null;
  /** A rebase has a branch to move: not at HEAD's own commit, and not on a detached or unborn HEAD. */
  canRebase: boolean;
  /** HEAD's own commit: merging into it / rebasing onto it is a no-op, so `merge` and `rebaseOnto` are empty. */
  headCommit: boolean;
}

/**
 * A remote branch's local counterpart is the branch tracking it, else the one with the same short
 * name. With one at the same commit there is nothing to do; elsewhere it can be reset to the remote.
 */
export function commitBranchActions(refs: RefsSnapshot | null, oid: string): CommitBranchActions {
  if (!refs) return { checkout: [], reset: [], merge: [], rebaseOnto: null, canRebase: false, headCommit: false };
  const locals: BranchAt[] = refs.local.filter((b) => b.oid === oid && !b.isHead).map((b) => ({ name: b.name, remote: null }));
  const checkout: BranchAt[] = [...locals];
  const remotes: BranchAt[] = [];
  const reset: ResetToRemote[] = [];
  for (const r of refs.remotes) {
    for (const rb of r.branches) {
      if (rb.oid !== oid) continue;
      const local = refs.local.find((b) => b.upstream === rb.name) ?? refs.local.find((b) => b.name === stripRemote(rb, r.name));
      // A local counterpart right here is the same commit under a shorter name: it is already offered.
      if (local?.oid === oid) continue;
      remotes.push({ name: rb.name, remote: r.name });
      if (!local) checkout.push({ name: rb.name, remote: r.name });
      else reset.push({ branch: local.name, remote: rb.name, current: local.isHead });
    }
  }
  const headCommit = refs.head.oid === oid;
  // An unborn HEAD sits at no commit, so nothing is HEAD's own and neither operation can run.
  const unborn = refs.head.oid === null;
  // A rebase moves the current branch; detached there is none, and git would replay the loose commits.
  const canRebase = !headCommit && !unborn && !refs.head.detached;
  return {
    checkout,
    reset,
    merge: headCommit || unborn ? [] : [...locals, ...remotes],
    rebaseOnto: canRebase ? (locals[0] ?? remotes[0] ?? null) : null,
    canRebase,
    headCommit,
  };
}
