import { describe, expect, it } from "vitest";
import { gitCmd } from "../screens/RepoWindow/dialogs/gitArgs";
import { interactiveFlag, splitArgs } from "./argv";

const args = (text: string) => {
  const r = splitArgs(text);
  if (!r.ok) throw new Error(r.error);
  return r.args;
};

describe("splitArgs", () => {
  it("splits on whitespace runs and ignores leading / trailing space", () => {
    expect(args("  log   --oneline -5 ")).toEqual(["log", "--oneline", "-5"]);
    expect(args("")).toEqual([]);
    expect(args("   ")).toEqual([]);
  });

  it("keeps a double-quoted group together, with \\\" and \\\\ escapes", () => {
    expect(args('commit -m "wip: two words"')).toEqual(["commit", "-m", "wip: two words"]);
    expect(args('commit -m "say \\"hi\\""')).toEqual(["commit", "-m", 'say "hi"']);
    expect(args('-m "a \\\\ b"')).toEqual(["-m", "a \\ b"]);
    expect(args('x ""')).toEqual(["x", ""]);
  });

  it("keeps a single-quoted group literally, with the '\\'' idiom", () => {
    expect(args("commit -m 'it'\\''s'")).toEqual(["commit", "-m", "it's"]);
    expect(args("-m 'a \\ \"b\"'")).toEqual(["-m", 'a \\ "b"']);
  });

  it("treats a backslash outside quotes as a literal unless it escapes a quote (Windows paths)", () => {
    expect(args("add C:\\tmp\\x.txt")).toEqual(["add", "C:\\tmp\\x.txt"]);
    expect(args("add \\\\server\\share")).toEqual(["add", "\\\\server\\share"]);
    expect(args("-m it\\'s")).toEqual(["-m", "it's"]);
  });

  it("reports an unterminated quote", () => {
    expect(splitArgs('commit -m "oops')).toEqual({ ok: false, error: "Unterminated quote" });
    expect(splitArgs("commit -m 'oops")).toEqual({ ok: false, error: "Unterminated quote" });
  });

  it("round-trips what gitCmd and display_cmd print", () => {
    const argv = ["merge", "--no-ff", "-m", "Merge branch 'feat' into main", "feat"];
    expect(args(gitCmd(argv).slice("git ".length))).toEqual(argv);
    // runner.rs `display_cmd` test input.
    expect(args('stash push -m "wip: two words" -- ""')).toEqual(["stash", "push", "-m", "wip: two words", "--", ""]);
  });
});

describe("interactiveFlag", () => {
  it("names the flag that needs a terminal, scoped to the commands where it means that", () => {
    expect(interactiveFlag(["add", "-i"])).toBe("-i");
    expect(interactiveFlag(["rebase", "--interactive", "main"])).toBe("--interactive");
    expect(interactiveFlag(["add", "-p"])).toBe("-p");
    expect(interactiveFlag(["stash", "push", "--patch"])).toBe("--patch");
    expect(interactiveFlag(["clean", "-i"])).toBe("-i");
  });

  it("lets pathspecs after -- and non-interactive uses of the same letters through", () => {
    expect(interactiveFlag(["add", "--", "-i"])).toBeNull();
    expect(interactiveFlag(["log", "-p"])).toBeNull();
    expect(interactiveFlag(["show", "-p", "HEAD"])).toBeNull();
    expect(interactiveFlag(["commit", "-i", "a.txt"])).toBeNull();
    expect(interactiveFlag(["status"])).toBeNull();
    expect(interactiveFlag([])).toBeNull();
  });
});
