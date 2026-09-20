// What the commit context menu offers for the branches sitting at a commit.
import type { RefsSnapshot, Worktree } from "../../../api/types";
import { protectedNames, stripRemote } from "../actions";

/** A branch at the commit; `remote` is set for a remote branch (`origin/x` on `origin`). */
export interface BranchAt {
  name: string;
  remote: string | null;
}

/** A ref at the commit that its row can delete; `name` is what the menu shows (`feature`, `origin/feature`, `v1.0`). */
export type DeleteAt = { kind: "local"; name: string } | { kind: "remote"; name: string; remote: string; short: string } | { kind: "tag"; name: string };

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
  /** Local branches `git branch -f` can move here: not the current one, not already here, not checked out in a worktree, not one `reset` already moves here. */
  resetHere: string[];
  /** Merge candidates: every branch at the commit but the current one and remotes a local sits on. */
  merge: BranchAt[];
  /** What a rebase of the current branch lands on: a local branch here, else a remote one, else the caller's oid. */
  rebaseOnto: BranchAt | null;
  /** A rebase has a branch to move: not at HEAD's own commit, not on a detached or unborn HEAD, and no sequencer running. */
  canRebase: boolean;
  /**
   * Same, minus the HEAD-commit guard: rebasing interactively *from* HEAD's own commit is the common
   * case (reword the last commit). The caller adds "the commit has a parent" — there is no `--root`.
   */
  canRebaseInteractive: boolean;
  /** HEAD's own commit: merging into it / rebasing onto it is a no-op, so `merge` and `rebaseOnto` are empty. */
  headCommit: boolean;
  /** Unborn HEAD: `git merge <oid>` would move the branch onto the commit, so no merge either. */
  unborn: boolean;
  /** Local branches (never the current one, nor a protected name — `protectedNames`), remote branches and tags sitting at the commit, in that order. */
  remove: DeleteAt[];
  /** Local branches at the commit, the current one included: `git branch -m` handles it, only delete is guarded. */
  rename: string[];
}

/**
 * A remote branch's local counterpart is the branch tracking it, else the one with the same short
 * name. With one at the same commit there is nothing to do; elsewhere it can be reset to the remote.
 */
export function commitBranchActions(refs: RefsSnapshot | null, oid: string, worktrees?: Worktree[]): CommitBranchActions {
  if (!refs) return { checkout: [], reset: [], resetHere: [], merge: [], rebaseOnto: null, canRebase: false, canRebaseInteractive: false, headCommit: false, unborn: false, remove: [], rename: [] };
  const locals: BranchAt[] = refs.local.filter((b) => b.oid === oid && !b.isHead).map((b) => ({ name: b.name, remote: null }));
  const checkout: BranchAt[] = [...locals];
  const remotes: BranchAt[] = [];
  const reset: ResetToRemote[] = [];
  const keep = protectedNames(refs.remotes);
  const remove: DeleteAt[] = locals.filter((b) => !keep.has(b.name)).map((b) => ({ kind: "local", name: b.name }));
  // `git branch -f` refuses a branch checked out anywhere; the current worktree's own is `isHead`
  // already. Only the other worktrees count: the current one's entry can trail `refs` and still name
  // the branch just switched away from, and `isHead` is the truth for it either way.
  const checkedOut = new Set(worktrees?.filter((w) => !w.current).map((w) => w.head?.branch));
  // Mid-rebase / mid-bisect HEAD is detached, so the branch the operation owns is nobody's `isHead`
  // and the snapshot doesn't say which one it is — `git branch -f` would refuse exactly that one.
  // No move at all until it ends; a `git reset` of the current branch is a different matter.
  const frozen = refs.state === "rebase" || refs.state === "bisect";
  for (const r of refs.remotes) {
    for (const rb of r.branches) {
      if (rb.oid !== oid) continue;
      const short = stripRemote(rb, r.name);
      const local = refs.local.find((b) => b.upstream === rb.name) ?? refs.local.find((b) => b.name === short);
      // Deletable whether or not a local counterpart sits here: it is a ref of its own.
      if (!keep.has(short)) remove.push({ kind: "remote", name: rb.name, remote: r.name, short });
      // A local counterpart right here is the same commit under a shorter name: it is already offered.
      if (local?.oid === oid) continue;
      remotes.push({ name: rb.name, remote: r.name });
      if (!local) checkout.push({ name: rb.name, remote: r.name });
      // The current branch moves with a `git reset`, which neither a worktree nor a running operation
      // blocks; every other one is a `git branch -f` and answers to both.
      else if (local.isHead || (!frozen && !checkedOut.has(local.name))) reset.push({ branch: local.name, remote: rb.name, current: local.isHead });
    }
  }
  // A branch `reset` moves to a remote sitting here is the same move under a better name.
  const resetHere = frozen
    ? []
    : refs.local.filter((b) => !b.isHead && b.oid !== oid && !checkedOut.has(b.name) && !reset.some((r) => !r.current && r.branch === b.name)).map((b) => b.name);
  const headCommit = refs.head.oid === oid;
  // An unborn HEAD sits at no commit, so nothing is HEAD's own and neither operation can run.
  const unborn = refs.head.oid === null;
  // A rebase moves the current branch; detached there is none, and git would replay the loose commits.
  // Mid-merge / mid-rebase git refuses one outright, so the items go rather than fail.
  const canRebaseInteractive = !unborn && !refs.head.detached && refs.state === "clean";
  const canRebase = canRebaseInteractive && !headCommit;
  return {
    checkout,
    reset,
    resetHere,
    merge: headCommit || unborn ? [] : [...locals, ...remotes],
    rebaseOnto: canRebase ? (locals[0] ?? remotes[0] ?? null) : null,
    canRebase,
    canRebaseInteractive,
    headCommit,
    unborn,
    // `Tag.oid` is already peeled, so an annotated tag matches its commit like a lightweight one.
    remove: [...remove, ...refs.tags.filter((t) => t.oid === oid).map((t): DeleteAt => ({ kind: "tag", name: t.name }))],
    rename: refs.local.filter((b) => b.oid === oid).map((b) => b.name),
  };
}
