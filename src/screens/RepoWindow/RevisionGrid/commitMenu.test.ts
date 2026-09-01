import { describe, expect, it } from "vitest";
import type { Branch, RefsSnapshot } from "../../../api/types";
import { commitBranchActions } from "./commitMenu";

const branch = (name: string, oid: string, extra: Partial<Branch> = {}): Branch => ({
  name,
  oid,
  upstream: null,
  gone: false,
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
    { name: "origin", url: null, branches: [{ name: "origin/main", oid: "b" }, { name: "origin/feature", oid: "b" }, { name: "origin/renamed", oid: "b" }, { name: "origin/new", oid: "d" }] },
    { name: "fork", url: null, branches: [{ name: "fork/feature", oid: "d" }] },
  ],
  tags: [],
  stashes: [],
};

describe("commitBranchActions", () => {
  it("offers local branches at the commit, minus the current one", () => {
    expect(commitBranchActions(REFS, "a")).toEqual({ checkout: [], reset: [] });
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
    });
  });

  it("is empty without refs", () => {
    expect(commitBranchActions(null, "a")).toEqual({ checkout: [], reset: [] });
  });
});
