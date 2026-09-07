// What the commit context menu offers for the branches sitting at a commit.
import type { RefsSnapshot } from "../../../api/types";
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
export function commitBranchActions(refs: RefsSnapshot | null, oid: string): CommitBranchActions {
  if (!refs) return { checkout: [], reset: [], merge: [], rebaseOnto: null, canRebase: false, canRebaseInteractive: false, headCommit: false, unborn: false, remove: [], rename: [] };
  const locals: BranchAt[] = refs.local.filter((b) => b.oid === oid && !b.isHead).map((b) => ({ name: b.name, remote: null }));
  const checkout: BranchAt[] = [...locals];
  const remotes: BranchAt[] = [];
  const reset: ResetToRemote[] = [];
  const keep = protectedNames(refs.remotes);
  const remove: DeleteAt[] = locals.filter((b) => !keep.has(b.name)).map((b) => ({ kind: "local", name: b.name }));
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
      else reset.push({ branch: local.name, remote: rb.name, current: local.isHead });
    }
  }
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
