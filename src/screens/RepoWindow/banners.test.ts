import { describe, expect, it } from "vitest";
import type { Branch, RefsSnapshot, WorkdirStatus } from "../../api/types";
import { computeBanners, defaultBranch } from "./banners";

const branch = (name: string, isHead = false): Branch => ({ name, oid: "o", upstream: null, gone: false, ahead: 0, behind: 0, isHead });
const refs = (over: Partial<RefsSnapshot>): RefsSnapshot => ({
  head: { oid: "abcdef0123", branch: "main", detached: false },
  state: "clean",
  local: [branch("main", true), branch("dev")],
  remotes: [],
  tags: [],
  stashes: [],
  ...over,
});
const status = (conflicted: number): WorkdirStatus => ({ entries: [], staged: 0, unstaged: 0, untracked: 0, conflicted });

describe("banners", () => {
  it("defaultBranch prefers main, then master, then the first branch", () => {
    expect(defaultBranch([branch("dev"), branch("master"), branch("main")])).toBe("main");
    expect(defaultBranch([branch("dev"), branch("master")])).toBe("master");
    expect(defaultBranch([branch("zed"), branch("dev")])).toBe("zed");
    expect(defaultBranch([])).toBeNull();
  });

  it("nothing on a clean attached HEAD", () => {
    expect(computeBanners(refs({}), status(0))).toEqual([]);
    expect(computeBanners(null, status(3))).toEqual([]);
  });

  it("detached HEAD → warning with Checkout <default> + Create branch…", () => {
    const b = computeBanners(refs({ head: { oid: "abcdef0123", branch: null, detached: true }, local: [branch("dev"), branch("main")] }), null);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ id: "detached", kind: "warning" });
    expect(b[0].text).toContain("abcdef0");
    expect(b[0].buttons.map((x) => x.label)).toEqual(["Checkout main", "Create branch…"]);
    // No local branches: only Create branch…
    expect(computeBanners(refs({ head: { oid: "abcdef0123", branch: null, detached: true }, local: [] }), null)[0].buttons.map((x) => x.action)).toEqual(["createBranch"]);
  });

  it("merge / rebase state + conflicts stack", () => {
    const m = computeBanners(refs({ state: "merge" }), status(2));
    expect(m.map((x) => x.id)).toEqual(["merge", "conflicts"]);
    expect(m[0].buttons.map((x) => x.action)).toEqual(["mergeAbort", "commitMerge"]);
    expect(m[1]).toMatchObject({ kind: "danger", text: "2 files have conflicts — resolve, then stage them" });
    const r = computeBanners(refs({ state: "rebase", head: { oid: "abcdef0123", branch: null, detached: true } }), status(1));
    expect(r.map((x) => x.id)).toEqual(["rebase", "conflicts"]);
    expect(r[0].buttons.map((x) => x.action)).toEqual(["rebaseAbort", "rebaseContinue"]);
    expect(r[1].text).toBe("1 file has conflicts — resolve, then stage it");
  });
});
