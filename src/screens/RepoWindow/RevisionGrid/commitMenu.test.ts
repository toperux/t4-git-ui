import { describe, expect, it } from "vitest";
import type { Branch, RefsSnapshot, Worktree } from "../../../api/types";
import { commitBranchActions } from "./commitMenu";

const branch = (name: string, oid: string, extra: Partial<Branch> = {}): Branch => ({
  name,
  oid,
  upstream: null,
  gone: false,
  mergedInto: null,
  ahead: 0,
  behind: 0,
  isHead: false,
  ...extra,
});

const REFS: RefsSnapshot = {
  head: { oid: "a", branch: "main", detached: false },
  state: "clean",
  local: [
    branch("main", "a", { upstream: "origin/main", isHead: true }),
    branch("feature", "b"),
    branch("hotfix", "b"),
    branch("stale", "c", { upstream: "origin/renamed" }),
    // Protected by the remote's HEAD, along with `origin/develop` and `fork/develop` at the same commit.
    branch("develop", "e"),
  ],
  remotes: [
    { name: "origin", url: null, head: "origin/develop", branches: [{ name: "origin/main", oid: "b", mergedInto: null }, { name: "origin/feature", oid: "b", mergedInto: null }, { name: "origin/renamed", oid: "b", mergedInto: null }, { name: "origin/new", oid: "d", mergedInto: null }, { name: "origin/develop", oid: "e", mergedInto: null }] },
    { name: "fork", url: null, branches: [{ name: "fork/feature", oid: "d", mergedInto: null }, { name: "fork/develop", oid: "e", mergedInto: null }] },
  ],
  tags: [{ name: "v1", oid: "d", message: null }],
  stashes: [],
};

describe("commitBranchActions", () => {
  it("offers local branches at the commit, minus the current one", () => {
    // HEAD's own commit: no plain rebase (a no-op), but rebasing interactively *from* here is the point.
    expect(commitBranchActions(REFS, "a")).toEqual({ checkout: [], reset: [], checkoutReset: [], resetHere: ["feature", "hotfix", "stale", "develop"], merge: [], rebaseOnto: null, canRebase: false, canRebaseInteractive: true, headCommit: true, unborn: false, remove: [], rename: ["main"] });
    const { checkout } = commitBranchActions(REFS, "b");
    expect(checkout.filter((b) => !b.remote).map((b) => b.name)).toEqual(["feature", "hotfix"]);
  });

  it("resets a remote branch's local counterpart, by upstream first, then by name", () => {
    const { checkout, reset } = commitBranchActions(REFS, "b");
    expect(reset).toEqual([
      // `main` tracks `origin/main` and is checked out → a `git reset`.
      { branches: ["main"], remote: "origin/main", current: true, besideCurrent: false },
      // `stale` tracks `origin/renamed` despite the name.
      { branches: ["stale"], remote: "origin/renamed", current: false, besideCurrent: false },
    ]);
    // `feature` is already at the commit: nothing to reset, and it is a checkout candidate itself.
    expect(checkout.some((b) => b.remote)).toBe(false);
  });

  it("force-moves any other local branch here — never one that is checked out somewhere", () => {
    // `main` is HEAD's own, `feature` / `hotfix` already sit at `b`, `stale` is the reset-to-remote above.
    expect(commitBranchActions(REFS, "b").resetHere).toEqual(["develop"]);
    // `hotfix` is checked out in a linked worktree: `git branch -f` would refuse it.
    const worktree = (name: string): Worktree => ({ path: `/wt/${name}`, head: { oid: "b", branch: name, detached: false }, main: false, current: false, locked: false, lockReason: null, prunable: false });
    expect(commitBranchActions(REFS, "a", [worktree("hotfix")]).resetHere).toEqual(["feature", "stale", "develop"]);
    // A detached worktree names no branch, so it takes none out.
    expect(commitBranchActions(REFS, "a", [{ ...worktree("hotfix"), head: { oid: "b", branch: null, detached: true } }]).resetHere).toEqual(["feature", "hotfix", "stale", "develop"]);
    // The current worktree's entry can trail `refs` and still name a branch just switched away from:
    // `isHead` is the truth for it, so it takes none out — a linked one alongside it still does.
    expect(commitBranchActions(REFS, "a", [{ ...worktree("hotfix"), current: true }]).resetHere).toEqual(["feature", "hotfix", "stale", "develop"]);
    expect(commitBranchActions(REFS, "a", [{ ...worktree("stale"), current: true }, worktree("hotfix")]).resetHere).toEqual(["feature", "stale", "develop"]);
  });

  it("never resets a local branch that is checked out in a linked worktree", () => {
    // `stale` tracks `origin/renamed`, which sits at `b` — but the move is a `git branch -f` too.
    const worktree: Worktree = { path: "/wt/stale", head: { oid: "c", branch: "stale", detached: false }, main: false, current: false, locked: false, lockReason: null, prunable: false };
    expect(commitBranchActions(REFS, "b", [worktree]).reset).toEqual([{ branches: ["main"], remote: "origin/main", current: true, besideCurrent: false }]);
  });

  it("moves no branch here mid-rebase or mid-bisect — the one the operation owns is unknown", () => {
    for (const state of ["rebase", "bisect"] as const) {
      const at = commitBranchActions({ ...REFS, state }, "b");
      expect(at.resetHere).toEqual([]);
      // The current branch is still a plain `git reset`, which the operation does not block.
      expect(at.reset).toEqual([{ branches: ["main"], remote: "origin/main", current: true, besideCurrent: false }]);
    }
    // A stopped merge blocks neither: `git branch -f` moves any branch but the checked-out one.
    const merging = commitBranchActions({ ...REFS, state: "merge" }, "b");
    expect(merging.resetHere).toEqual(["develop"]);
    expect(merging.reset).toEqual([
      { branches: ["main"], remote: "origin/main", current: true, besideCurrent: false },
      { branches: ["stale"], remote: "origin/renamed", current: false, besideCurrent: false },
    ]);
  });

  it("checks out a remote branch's local trackers sitting elsewhere, moved here — every one of them", () => {
    // `main` is current (a reset, never a checkout), `feature` is already here; `stale` tracks `origin/renamed` from `c`.
    expect(commitBranchActions(REFS, "b").checkoutReset).toEqual([{ remote: "origin/renamed", candidates: [{ branch: "stale", remote: "origin/renamed", localOid: "c" }], besideCurrent: false }]);
    // A second tracker of the same remote branch is a second candidate, and the reset entry carries both.
    const two: RefsSnapshot = { ...REFS, local: [...REFS.local, branch("stale2", "f", { upstream: "origin/renamed" })] };
    const at = commitBranchActions(two, "b");
    expect(at.checkoutReset).toEqual([
      {
        remote: "origin/renamed",
        candidates: [
          { branch: "stale", remote: "origin/renamed", localOid: "c" },
          { branch: "stale2", remote: "origin/renamed", localOid: "f" },
        ],
        besideCurrent: false,
      },
    ]);
    expect(at.reset).toEqual([
      { branches: ["main"], remote: "origin/main", current: true, besideCurrent: false },
      { branches: ["stale", "stale2"], remote: "origin/renamed", current: false, besideCurrent: false },
    ]);
    // Both are moved to the remote already, so neither is offered again as a plain reset-to-here.
    expect(at.resetHere).toEqual(["develop"]);
  });

  it("drops a tracker already at the commit on its own, keeping the others", () => {
    // `here` tracks `origin/renamed` right at `b`; `stale` still resets and checks out.
    const refs: RefsSnapshot = { ...REFS, local: [branch("here", "b", { upstream: "origin/renamed" }), ...REFS.local] };
    const at = commitBranchActions(refs, "b");
    expect(at.reset).toEqual([
      { branches: ["main"], remote: "origin/main", current: true, besideCurrent: false },
      { branches: ["stale"], remote: "origin/renamed", current: false, besideCurrent: false },
    ]);
    expect(at.checkoutReset).toEqual([{ remote: "origin/renamed", candidates: [{ branch: "stale", remote: "origin/renamed", localOid: "c" }], besideCurrent: false }]);
    // `here` stands in for the remote under a shorter name: not a merge candidate of its own.
    expect(at.merge.some((b) => b.name === "origin/renamed")).toBe(false);
  });

  it("resets the current tracker and the others elsewhere as two entries, current first", () => {
    // `main` (current, at `a`) and `main2` (at `f`) both track `origin/main` at `b`.
    const refs: RefsSnapshot = { ...REFS, local: [...REFS.local, branch("main2", "f", { upstream: "origin/main" })] };
    const at = commitBranchActions(refs, "b");
    expect(at.reset).toEqual([
      { branches: ["main"], remote: "origin/main", current: true, besideCurrent: false },
      { branches: ["main2"], remote: "origin/main", current: false, besideCurrent: false },
      { branches: ["stale"], remote: "origin/renamed", current: false, besideCurrent: false },
    ]);
    expect(at.checkoutReset.map((c) => c.remote)).toEqual(["origin/main", "origin/renamed"]);
  });

  it("flags several non-current trackers beside a current one, so the menu says 'other local'", () => {
    // `main` (current) plus `main2` and `main3` elsewhere, all tracking `origin/main` at `b`.
    const refs: RefsSnapshot = { ...REFS, local: [...REFS.local, branch("main2", "f", { upstream: "origin/main" }), branch("main3", "c", { upstream: "origin/main" })] };
    const at = commitBranchActions(refs, "b");
    expect(at.reset.filter((r) => r.remote === "origin/main")).toEqual([
      { branches: ["main"], remote: "origin/main", current: true, besideCurrent: false },
      { branches: ["main2", "main3"], remote: "origin/main", current: false, besideCurrent: true },
    ]);
    expect(at.checkoutReset.find((c) => c.remote === "origin/main")?.besideCurrent).toBe(true);
  });

  it("checks out no tracker a `git branch -f` could not move — the item goes, it is not greyed", () => {
    const worktree: Worktree = { path: "/wt/stale", head: { oid: "c", branch: "stale", detached: false }, main: false, current: false, locked: false, lockReason: null, prunable: false };
    expect(commitBranchActions(REFS, "b", [worktree]).checkoutReset).toEqual([]);
    for (const state of ["rebase", "bisect"] as const) expect(commitBranchActions({ ...REFS, state }, "b").checkoutReset).toEqual([]);
    // With two trackers, the one in a worktree goes and the other stays.
    const two: RefsSnapshot = { ...REFS, local: [...REFS.local, branch("stale2", "f", { upstream: "origin/renamed" })] };
    expect(commitBranchActions(two, "b", [worktree]).checkoutReset).toEqual([{ remote: "origin/renamed", candidates: [{ branch: "stale2", remote: "origin/renamed", localOid: "f" }], besideCurrent: false }]);
  });

  it("two remotes at one commit are two independent entries", () => {
    // `fork/feature` (by name → `feature` at `b`) and `origin/x` (tracked by `x` at `c`) both sit at `d`.
    const refs: RefsSnapshot = {
      ...REFS,
      local: [...REFS.local, branch("x", "c", { upstream: "origin/x" })],
      remotes: [{ ...REFS.remotes[0], branches: [...REFS.remotes[0].branches, { name: "origin/x", oid: "d", mergedInto: null }] }, REFS.remotes[1]],
    };
    expect(commitBranchActions(refs, "d").checkoutReset).toEqual([
      { remote: "origin/x", candidates: [{ branch: "x", remote: "origin/x", localOid: "c" }], besideCurrent: false },
      { remote: "fork/feature", candidates: [{ branch: "feature", remote: "fork/feature", localOid: "b" }], besideCurrent: false },
    ]);
  });

  it("offers a local branch once when two remote refs here name it, under its own upstream first", () => {
    // `feature` (at `b`) tracks `origin/feature`; `fork/feature` finds it by name. Both sit at `d`, `fork` listed first.
    const refs: RefsSnapshot = {
      ...REFS,
      local: REFS.local.map((b) => (b.name === "feature" ? { ...b, upstream: "origin/feature" } : b)),
      remotes: [REFS.remotes[1], { ...REFS.remotes[0], branches: REFS.remotes[0].branches.map((rb) => (rb.name === "origin/feature" ? { ...rb, oid: "d" } : rb)) }],
    };
    const at = commitBranchActions(refs, "d");
    expect(at.reset).toEqual([{ branches: ["feature"], remote: "origin/feature", current: false, besideCurrent: false }]);
    expect(at.checkoutReset).toEqual([{ remote: "origin/feature", candidates: [{ branch: "feature", remote: "origin/feature", localOid: "b" }], besideCurrent: false }]);
    // Two short-name matches and no upstream here: the first keeps it.
    const fork2 = { name: "fork2", url: null, branches: [{ name: "fork2/feature", oid: "d", mergedInto: null }] };
    const byName = commitBranchActions({ ...REFS, remotes: [...REFS.remotes, fork2] }, "d");
    expect(byName.reset).toEqual([{ branches: ["feature"], remote: "fork/feature", current: false, besideCurrent: false }]);
    expect(byName.checkoutReset.map((c) => c.remote)).toEqual(["fork/feature"]);
  });

  it("checks out remote branches without a local counterpart as tracking locals", () => {
    // `fork/feature` → local `feature` exists (found by name) but sits elsewhere → reset, not checkout.
    expect(commitBranchActions(REFS, "d")).toEqual({
      checkout: [{ name: "origin/new", remote: "origin" }],
      reset: [{ branches: ["feature"], remote: "fork/feature", current: false, besideCurrent: false }],
      checkoutReset: [{ remote: "fork/feature", candidates: [{ branch: "feature", remote: "fork/feature", localOid: "b" }], besideCurrent: false }],
      // `feature` is left out: the reset above already moves it here, to `fork/feature`.
      resetHere: ["hotfix", "stale", "develop"],
      merge: [{ name: "origin/new", remote: "origin" }, { name: "fork/feature", remote: "fork" }],
      rebaseOnto: { name: "origin/new", remote: "origin" },
      canRebase: true,
      canRebaseInteractive: true,
      headCommit: false,
      unborn: false,
      remove: [
        { kind: "remote", name: "origin/new", remote: "origin", short: "new" },
        { kind: "remote", name: "fork/feature", remote: "fork", short: "feature" },
        { kind: "tag", name: "v1" },
      ],
      rename: [],
    });
  });

  it("merges any branch at the commit, minus a remote one its local counterpart already names", () => {
    // `origin/main` / `origin/renamed` are no checkout candidates (a local tracks them from elsewhere)
    // but they are merge sources. `origin/feature` is not: local `feature` is the same commit, and
    // right after a push offering both would replace "Merge feature into main…" with a branch picker.
    expect(commitBranchActions(REFS, "b").merge).toEqual([
      { name: "feature", remote: null },
      { name: "hotfix", remote: null },
      { name: "origin/main", remote: "origin" },
      { name: "origin/renamed", remote: "origin" },
    ]);
  });

  it("a detached HEAD merges into itself but rebases nothing", () => {
    // Detached means no branch is checked out: with `main` still `isHead` the state is unreachable.
    const detached: RefsSnapshot = { ...REFS, head: { oid: "z", branch: null, detached: true }, local: REFS.local.map((b) => ({ ...b, isHead: false })) };
    const at = commitBranchActions(detached, "a");
    // `main` sits at `a` and is nobody's HEAD any more, so it is a merge source; a rebase has no branch to move.
    expect(at.merge).toEqual([{ name: "main", remote: null }]);
    expect(at).toMatchObject({ rebaseOnto: null, canRebase: false, headCommit: false });
  });

  it("an unborn HEAD offers neither — it sits at no commit at all", () => {
    const unborn: RefsSnapshot = { ...REFS, head: { oid: null, branch: "wip", detached: false }, local: REFS.local.map((b) => ({ ...b, isHead: false })) };
    const at = commitBranchActions(unborn, "b");
    expect(at).toMatchObject({ merge: [], rebaseOnto: null, canRebase: false, headCommit: false, unborn: true });
    // Checking one of them out is exactly what leaves the orphan branch, so those items stay.
    expect(at.checkout.map((b) => b.name)).toEqual(["feature", "hotfix"]);
  });

  it("rebases onto a local branch at the commit, else a remote one, else nothing", () => {
    expect(commitBranchActions(REFS, "b").rebaseOnto).toEqual({ name: "feature", remote: null });
    expect(commitBranchActions(REFS, "d").rebaseOnto).toEqual({ name: "origin/new", remote: "origin" });
    expect(commitBranchActions(REFS, "nothing-here").rebaseOnto).toBeNull();
  });

  it("offers neither at HEAD's own commit", () => {
    expect(commitBranchActions(REFS, "a")).toMatchObject({ merge: [], rebaseOnto: null, headCommit: true });
  });

  it("deletes every ref at the commit but the current branch", () => {
    // A remote branch is a ref of its own: `origin/feature` is deletable although local `feature` is here.
    // `origin/main` is not: `main` is a protected name on every remote.
    expect(commitBranchActions(REFS, "b").remove).toEqual([
      { kind: "local", name: "feature" },
      { kind: "local", name: "hotfix" },
      { kind: "remote", name: "origin/feature", remote: "origin", short: "feature" },
      { kind: "remote", name: "origin/renamed", remote: "origin", short: "renamed" },
    ]);
    // `main` is checked out at `a`: nothing to delete there.
    expect(commitBranchActions(REFS, "a").remove).toEqual([]);
    // Detached, `main` is nobody's HEAD any more — but it is protected by name all the same.
    const detached: RefsSnapshot = { ...REFS, head: { oid: "z", branch: null, detached: true }, local: REFS.local.map((b) => ({ ...b, isHead: false })) };
    expect(commitBranchActions(detached, "a").remove).toEqual([]);
  });

  it("renames every local branch at the commit — the current one and protected names included", () => {
    expect(commitBranchActions(REFS, "b").rename).toEqual(["feature", "hotfix"]);
    expect(commitBranchActions(REFS, "a").rename).toEqual(["main"]);
    expect(commitBranchActions(REFS, "e").rename).toEqual(["develop"]);
    const detached: RefsSnapshot = { ...REFS, head: { oid: "z", branch: null, detached: true }, local: REFS.local.map((b) => ({ ...b, isHead: false })) };
    expect(commitBranchActions(detached, "a").rename).toEqual(["main"]);
    expect(commitBranchActions(REFS, "d").rename).toEqual([]);
  });

  it("never deletes main, master or the branch the remote's HEAD points at", () => {
    // `origin/HEAD → origin/develop` keeps `develop` locally and on every remote, `fork` included.
    expect(commitBranchActions(REFS, "e").remove).toEqual([]);
  });

  it("is empty without refs", () => {
    expect(commitBranchActions(null, "a")).toEqual({ checkout: [], reset: [], checkoutReset: [], resetHere: [], merge: [], rebaseOnto: null, canRebase: false, canRebaseInteractive: false, headCommit: false, unborn: false, remove: [], rename: [] });
  });

  it("neither rebase is offered mid-merge, mid-rebase, on a detached or an unborn HEAD", () => {
    for (const state of ["merge", "rebase", "cherryPick"] as const) {
      expect(commitBranchActions({ ...REFS, state }, "b")).toMatchObject({ canRebase: false, canRebaseInteractive: false, rebaseOnto: null });
    }
    const detached: RefsSnapshot = { ...REFS, head: { oid: "z", branch: null, detached: true }, local: REFS.local.map((b) => ({ ...b, isHead: false })) };
    expect(commitBranchActions(detached, "b")).toMatchObject({ canRebase: false, canRebaseInteractive: false });
    const unborn: RefsSnapshot = { ...REFS, head: { oid: null, branch: "wip", detached: false }, local: REFS.local.map((b) => ({ ...b, isHead: false })) };
    expect(commitBranchActions(unborn, "b")).toMatchObject({ canRebase: false, canRebaseInteractive: false });
  });
});
