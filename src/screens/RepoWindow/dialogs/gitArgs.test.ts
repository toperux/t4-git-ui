import { describe, expect, it } from "vitest";
import { checkoutArgs, fetchArgs, gitCmd, mergeArgs, pullArgs, pushArgs, stashPushArgs } from "./gitArgs";

describe("gitArgs (preview line)", () => {
  it("push combinations", () => {
    expect(gitCmd(pushArgs("origin", "main", false, false, false))).toBe("git push --progress origin main");
    expect(gitCmd(pushArgs("origin", "main", true, false, false))).toBe("git push --progress -u origin main");
    expect(gitCmd(pushArgs("origin", "main", false, true, true))).toBe("git push --progress --force-with-lease --tags origin main");
    expect(gitCmd(pushArgs("upstream", null, true, true, true))).toBe("git push --progress -u --force-with-lease --tags upstream");
  });

  it("fetch / pull", () => {
    expect(fetchArgs(null, false, false)).toEqual(["fetch", "--progress", "--all"]);
    expect(fetchArgs("origin", true, true)).toEqual(["fetch", "--progress", "--prune", "--tags", "origin"]);
    expect(pullArgs(null, "ignored", "merge")).toEqual(["pull", "--progress", "--no-rebase"]);
    expect(pullArgs("origin", "main", "ffOnly")).toEqual(["pull", "--progress", "--ff-only", "origin", "main"]);
    expect(pullArgs("origin", null, "rebase")).toEqual(["pull", "--progress", "--rebase", "origin"]);
  });

  it("merge / checkout / stash, with quoting", () => {
    expect(mergeArgs("feat", "auto", false, null)).toEqual(["merge", "--ff", "feat"]);
    expect(gitCmd(mergeArgs("feat", "no", true, "Merge branch 'feat' into main"))).toBe(
      "git merge --no-ff --squash -m 'Merge branch '\\''feat'\\'' into main' feat",
    );
    expect(checkoutArgs("origin/x", "x", true)).toEqual(["checkout", "--track", "-b", "x", "origin/x"]);
    expect(checkoutArgs("main", null, true)).toEqual(["checkout", "main"]);
    expect(stashPushArgs("wip", true, true)).toEqual(["stash", "push", "-u", "-k", "-m", "wip"]);
  });
});
