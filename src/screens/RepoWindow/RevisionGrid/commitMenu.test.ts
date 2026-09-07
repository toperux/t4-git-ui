import { describe, expect, it } from "vitest";
import type { Branch, RefsSnapshot } from "../../../api/types";
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
    expect(commitBranchActions(REFS, "a")).toEqual({ checkout: [], reset: [], merge: [], rebaseOnto: null, canRebase: false, canRebaseInteractive: true, headCommit: true, unborn: false, remove: [], rename: ["main"] });
    const { checkout } = commitBranchActions(REFS, "b");
    expect(checkout.filter((b) => !b.remote).map((b) => b.name)).toEqual(["feature", "hotfix"]);
  });

  it("resets a remote branch's local counterpart, by upstream first, then by name", () => {
    const { checkout, reset } = commitBranchActions(REFS, "b");
    expect(reset).toEqual([
      // `main` tracks `origin/main` and is checked out → a `git reset`.
      { branch: "main", remote: "origin/main", current: true },
      // `stale` tracks `origin/renamed` despite the name.
      { branch: "stale", remote: "origin/renamed", current: false },
    ]);
    // `feature` is already at the commit: nothing to reset, and it is a checkout candidate itself.
    expect(checkout.some((b) => b.remote)).toBe(false);
  });

  it("checks out remote branches without a local counterpart as tracking locals", () => {
    // `fork/feature` → local `feature` exists (found by name) but sits elsewhere → reset, not checkout.
    expect(commitBranchActions(REFS, "d")).toEqual({
      checkout: [{ name: "origin/new", remote: "origin" }],
      reset: [{ branch: "feature", remote: "fork/feature", current: false }],
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
    expect(commitBranchActions(null, "a")).toEqual({ checkout: [], reset: [], merge: [], rebaseOnto: null, canRebase: false, canRebaseInteractive: false, headCommit: false, unborn: false, remove: [], rename: [] });
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
