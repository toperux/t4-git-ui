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
}

/**
 * A remote branch's local counterpart is the branch tracking it, else the one with the same short
 * name. With one at the same commit there is nothing to do; elsewhere it can be reset to the remote.
 */
export function commitBranchActions(refs: RefsSnapshot | null, oid: string): CommitBranchActions {
  if (!refs) return { checkout: [], reset: [] };
  const checkout: BranchAt[] = refs.local.filter((b) => b.oid === oid && !b.isHead).map((b) => ({ name: b.name, remote: null }));
  const reset: ResetToRemote[] = [];
  for (const r of refs.remotes) {
    for (const rb of r.branches) {
      if (rb.oid !== oid) continue;
      const local = refs.local.find((b) => b.upstream === rb.name) ?? refs.local.find((b) => b.name === stripRemote(rb, r.name));
      if (!local) checkout.push({ name: rb.name, remote: r.name });
      else if (local.oid !== oid) reset.push({ branch: local.name, remote: rb.name, current: local.isHead });
    }
  }
  return { checkout, reset };
}
