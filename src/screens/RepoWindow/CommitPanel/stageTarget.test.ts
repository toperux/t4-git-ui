import { describe, expect, it } from "vitest";
import type { StatusEntry } from "../../../api/types";
import { stageTarget } from "./stageTarget";

const entry = (path: string, conflicted = false): StatusEntry => ({ path, oldPath: null, index: null, workdir: "modified", conflicted, workdirStamp: "1:1" });

describe("stageTarget", () => {
  it("drops paths the list no longer holds: a selection outlives the status it was made against", () => {
    // `useCommitSync` prunes the selection in an effect, so a header runs once with fresh entries
    // and a stale selection — the vanished file must not be sent to git.
    const entries = [entry("a.rs"), entry("b.rs")];
    expect(stageTarget("unstaged", entries, ["a.rs", "gone.rs", "b.rs"], { bulk: true, where: "here" })).toEqual({ target: ["a.rs", "b.rs"], skipped: 0, note: undefined });
  });

  it("names what was refused when every file in it is conflicted, instead of counting skips", () => {
    const entries = [entry("x.rs", true), entry("y.rs", true)];
    // "here" is the whole list; a selection or a folder says so instead, because the files around
    // it may well be stageable.
    const { target, skipped, note } = stageTarget("unstaged", entries, ["x.rs", "y.rs"], { bulk: true, where: "here" });
    expect(target).toEqual([]);
    expect(skipped).toBe(2);
    expect(note).toBe("Every file here is conflicted — a conflict is staged on its own, once resolved");
  });
});
