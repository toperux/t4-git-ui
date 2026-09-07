import { describe, expect, it } from "vitest";
import type { Branch, RefsSnapshot, WorkdirStatus } from "../../api/types";
import { computeBanners, defaultBranch } from "./banners";

const branch = (name: string, isHead = false): Branch => ({ name, oid: "o", upstream: null, gone: false, mergedInto: null, ahead: 0, behind: 0, isHead });
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
    expect(r[0].buttons.map((x) => x.action)).toEqual(["rebaseAbort", "rebaseSkip", "rebaseContinue"]);
    expect(r[0].text).toBe("Rebase in progress — resolve conflicts and stage them, then continue");
    expect(r[1].text).toBe("1 file has conflicts — resolve, then stage it");
  });

  it("a rebase with nothing conflicted is a pause: amend in the commit panel, then Continue", () => {
    // An `edit` line (or an `exec` a hook rejected) stops with a clean tree — there is nothing to resolve.
    const b = computeBanners(refs({ state: "rebase" }), status(0));
    expect(b.map((x) => x.id)).toEqual(["rebase"]);
    expect(b[0].text).toBe("Rebase paused — amend or add commits in the commit panel, then Continue");
    expect(b[0].buttons.map((x) => x.label)).toEqual(["Abort", "Skip", "Continue"]);
    expect(b[0].buttons.filter((x) => x.primary).map((x) => x.action)).toEqual(["rebaseContinue"]);
    // Before the status lands, "no conflicts" is unknown: don't claim the pause.
    expect(computeBanners(refs({ state: "rebase" }), null)[0].text).toBe("Rebase in progress — resolve conflicts and stage them, then continue");
  });

  it("cherry-pick / revert offer Abort + Commit, like the merge banner", () => {
    for (const [state, word] of [
      ["cherryPick", "Cherry-pick"],
      ["revert", "Revert"],
    ] as const) {
      const b = computeBanners(refs({ state }), status(0));
      expect(b).toHaveLength(1);
      expect(b[0]).toMatchObject({ id: state, kind: "warning" });
      expect(b[0].text).toBe(`${word} in progress — resolve conflicts, then commit to finish`);
      expect(b[0].buttons.map((x) => x.label)).toEqual(["Abort", "Commit"]);
    }
    expect(computeBanners(refs({ state: "cherryPick" }), status(0))[0].buttons.map((x) => x.action)).toEqual(["cherryPickAbort", "commitMerge"]);
    expect(computeBanners(refs({ state: "revert" }), status(0))[0].buttons.map((x) => x.action)).toEqual(["revertAbort", "commitMerge"]);
    // A stopped pick stacks with the conflicts banner, as a merge does.
    expect(computeBanners(refs({ state: "revert" }), status(1)).map((x) => x.id)).toEqual(["revert", "conflicts"]);
  });

  it("bisect is the one state left with no action (no backend command for it)", () => {
    const b = computeBanners(refs({ state: "bisect" }), status(0));
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ id: "sequencer", kind: "warning", buttons: [] });
    expect(b[0].text).toContain("Bisect");
    expect(b[0].text).toContain("in a terminal");
  });

  it("a detached HEAD banner is suppressed while a sequencer state is running", () => {
    // `state !== "clean"`, so the detached notice would only add noise on top of the real cause.
    const b = computeBanners(refs({ state: "cherryPick", head: { oid: "abcdef0123", branch: null, detached: true } }), status(0));
    expect(b.map((x) => x.id)).toEqual(["cherryPick"]);
  });
});
