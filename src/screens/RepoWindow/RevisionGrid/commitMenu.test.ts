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
  ],
  remotes: [
    { name: "origin", url: null, branches: [{ name: "origin/main", oid: "b", mergedInto: null }, { name: "origin/feature", oid: "b", mergedInto: null }, { name: "origin/renamed", oid: "b", mergedInto: null }, { name: "origin/new", oid: "d", mergedInto: null }] },
    { name: "fork", url: null, branches: [{ name: "fork/feature", oid: "d", mergedInto: null }] },
  ],
  tags: [],
  stashes: [],
};

describe("commitBranchActions", () => {
  it("offers local branches at the commit, minus the current one", () => {
    expect(commitBranchActions(REFS, "a")).toEqual({ checkout: [], reset: [], merge: [], rebaseOnto: null, headCommit: true });
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
      headCommit: false,
    });
  });

  it("merges any branch at the commit, a remote one with a local counterpart included", () => {
    // `origin/main` / `origin/feature` are no checkout candidates (a local sits on them) but are merge sources.
    expect(commitBranchActions(REFS, "b").merge).toEqual([
      { name: "feature", remote: null },
      { name: "hotfix", remote: null },
      { name: "origin/main", remote: "origin" },
      { name: "origin/feature", remote: "origin" },
      { name: "origin/renamed", remote: "origin" },
    ]);
    // The checked-out branch is never a merge source, even when HEAD has moved off it.
    const detached: RefsSnapshot = { ...REFS, head: { oid: "z", branch: null, detached: true } };
    expect(commitBranchActions(detached, "a").merge).toEqual([]);
  });

  it("rebases onto a local branch at the commit, else a remote one, else nothing", () => {
    expect(commitBranchActions(REFS, "b").rebaseOnto).toEqual({ name: "feature", remote: null });
    expect(commitBranchActions(REFS, "d").rebaseOnto).toEqual({ name: "origin/new", remote: "origin" });
    expect(commitBranchActions(REFS, "nothing-here").rebaseOnto).toBeNull();
  });

  it("offers neither at HEAD's own commit", () => {
    expect(commitBranchActions(REFS, "a")).toMatchObject({ merge: [], rebaseOnto: null, headCommit: true });
  });

  it("is empty without refs", () => {
    expect(commitBranchActions(null, "a")).toEqual({ checkout: [], reset: [], merge: [], rebaseOnto: null, headCommit: false });
  });
});
