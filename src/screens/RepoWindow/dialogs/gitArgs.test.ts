import { describe, expect, it } from "vitest";
import { checkoutArgs, fetchArgs, gitCmd, mergeArgs, pullArgs, pushArgs, stashPushArgs } from "./gitArgs";

describe("gitArgs (preview line)", () => {
  it("push combinations", () => {
    expect(gitCmd(pushArgs("origin", "main", false, false, false))).toBe("git push --progress origin --end-of-options main");
    expect(gitCmd(pushArgs("origin", "main", true, false, false))).toBe("git push --progress -u origin --end-of-options main");
    expect(gitCmd(pushArgs("origin", "main", false, true, true))).toBe(
      "git push --progress --force-with-lease --tags origin --end-of-options main",
    );
    expect(gitCmd(pushArgs("upstream", null, true, true, true))).toBe("git push --progress -u --force-with-lease --tags upstream");
  });

  it("fetch / pull", () => {
    expect(fetchArgs(null, false, false)).toEqual(["fetch", "--progress", "--all"]);
    expect(fetchArgs("origin", true, true)).toEqual([
      "fetch",
      "--progress",
      "--prune",
      "--tags",
      "--end-of-options",
      "origin",
    ]);
    expect(pullArgs(null, "ignored", "merge")).toEqual(["pull", "--progress", "--no-rebase"]);
    expect(pullArgs("origin", "main", "ffOnly")).toEqual(["pull", "--progress", "--ff-only", "--end-of-options", "origin", "main"]);
    expect(pullArgs("origin", null, "rebase")).toEqual(["pull", "--progress", "--rebase", "--end-of-options", "origin"]);
  });

  it("merge / checkout / stash, with quoting", () => {
    expect(mergeArgs("feat", "auto", false, null)).toEqual(["merge", "--ff", "--end-of-options", "feat"]);
    expect(gitCmd(mergeArgs("feat", "no", true, "Merge branch 'feat' into main"))).toBe(
      "git merge --no-ff --squash -m 'Merge branch '\\''feat'\\'' into main' --end-of-options feat",
    );
    expect(checkoutArgs("origin/x", "x", true)).toEqual(["checkout", "--track", "-b", "x", "--end-of-options", "origin/x"]);
    expect(checkoutArgs("main", null, true)).toEqual(["checkout", "--end-of-options", "main"]);
    expect(checkoutArgs("refs/tags/v1", null, false, true)).toEqual([
      "checkout",
      "--detach",
      "--end-of-options",
      "refs/tags/v1",
    ]);
    expect(stashPushArgs("wip", true, true)).toEqual(["stash", "push", "-u", "-k", "-m", "wip"]);
  });

  it("quotes an empty argument, or the preview would drop it", () => {
    expect(gitCmd(["commit", "--allow-empty-message", "-m", ""])).toBe("git commit --allow-empty-message -m ''");
  });
});
