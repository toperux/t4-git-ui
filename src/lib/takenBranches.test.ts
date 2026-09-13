import { describe, expect, it } from "vitest";
import type { LinkedSnapshot, RefsSnapshot } from "../api/types";
import { takenBranches } from "./takenBranches";

const refs = (branch: string | null): RefsSnapshot => ({ head: { oid: "h", branch, detached: branch === null }, state: "clean", local: [], remotes: [], tags: [], stashes: [] });
const worktree = (path: string, branch: string | null, prunable = false) => ({
  path,
  head: { oid: "h", branch, detached: false },
  main: false,
  current: false,
  locked: false,
  lockReason: null,
  prunable,
});

describe("takenBranches", () => {
  it("names the current branch before the linked snapshot lands — it may never land at all", () => {
    expect(takenBranches(null, refs("main"))).toEqual(new Set(["main"]));
    expect(takenBranches(null, null)).toEqual(new Set());
    expect(takenBranches(null, refs(null))).toEqual(new Set());
  });

  it("counts a prunable worktree: its directory is gone, but git still holds its branch", () => {
    const linked: LinkedSnapshot = { worktrees: [worktree("/src/work", "main", false), worktree("/src/spare", "spare", true)], submodules: [] };
    expect(takenBranches(linked, refs("main"))).toEqual(new Set(["main", "spare"]));
  });
});
