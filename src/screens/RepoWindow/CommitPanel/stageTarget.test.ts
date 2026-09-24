import { describe, expect, it } from "vitest";
import type { StatusEntry } from "../../../api/types";
import { stageTarget } from "./stageTarget";

const entry = (path: string, conflicted = false): StatusEntry => ({ path, oldPath: null, index: null, workdir: "modified", conflicted, submodule: false, submoduleDirtyOnly: false, workdirStamp: "1:1", indexStamp: null });

describe("stageTarget", () => {
  it("drops paths the list no longer holds: a selection outlives the status it was made against", () => {
    // `useCommitSync` prunes the selection in an effect, so a header runs once with fresh entries
    // and a stale selection — the vanished file must not be sent to git.
    const entries = [entry("a.rs"), entry("b.rs")];
    expect(stageTarget("unstaged", entries, ["a.rs", "gone.rs", "b.rs"], { bulk: true, where: "here" })).toEqual({ target: ["a.rs", "b.rs"], skipped: 0, note: undefined });
  });

  it("counts what was asked for, not what survived: a stale group must not resolve a conflict", () => {
    // The other member of the selection left the list a render ago. One path is left, but the click
    // was a group's — degrading it to the lone row's action would mark the conflict resolved with
    // the markers still in the file.
    const entries = [entry("conflict.rs", true)];
    expect(stageTarget("unstaged", entries, ["conflict.rs", "gone.rs"], { where: "you selected" })).toEqual({
      target: [],
      skipped: 1,
      note: "Every file you selected is conflicted — a conflict is staged on its own, once resolved",
    });
  });

  it("takes the conflicted set from the caller: a folder row would rebuild it per row per render", () => {
    const entries = [entry("a.rs"), entry("b.rs")];
    const { target, skipped } = stageTarget("unstaged", entries, ["a.rs", "b.rs"], { conflicted: new Set(["b.rs"]) });
    expect(target).toEqual(["a.rs"]);
    expect(skipped).toBe(1);
  });

  it("skips a submodule whose pointer never moved, lone row included — `git add` has nothing to do", () => {
    // Not a group action and not a conflict: the row's own Stage would still stage nothing.
    const sub: StatusEntry = { ...entry("sub"), submodule: true, submoduleDirtyOnly: true };
    expect(stageTarget("unstaged", [sub], ["sub"], { where: "you selected" })).toEqual({
      target: [],
      skipped: 1,
      note: "Content changed inside the submodule — commit there, or Update it",
    });
    // Beside a file it is a skip like any other, counted in the note.
    const { target, note } = stageTarget("unstaged", [entry("a.rs"), sub], ["a.rs", "sub"], { where: "you selected" });
    expect(target).toEqual(["a.rs"]);
    expect(note).toBe("Content changed inside the submodule — commit there, or Update it (1 skipped)");
    // The staged list is the pointer, not the contents: unstaging it is fine.
    expect(stageTarget("staged", [sub], ["sub"]).target).toEqual(["sub"]);
  });

  it("names both kinds when a group skipped both: neither wording is the whole story", () => {
    const sub: StatusEntry = { ...entry("sub"), submodule: true, submoduleDirtyOnly: true };
    const entries = [entry("a.rs"), entry("x.rs", true), sub];
    const { note } = stageTarget("unstaged", entries, ["a.rs", "x.rs", "sub"], { bulk: true, where: "here" });
    expect(note).toBe("Conflicted files and submodules with unmoved pointers are skipped (2 skipped)");

    // Nothing left to act on: the count gives way to what the whole group is.
    const empty = stageTarget("unstaged", entries, ["x.rs", "sub"], { bulk: true, where: "here" });
    expect(empty.target).toEqual([]);
    expect(empty.note).toBe("Every file here is either conflicted or a submodule with an unmoved pointer");
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
