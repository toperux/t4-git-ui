import { describe, expect, it } from "vitest";
import type { RefsSnapshot } from "../api/types";
import { complete, MAX_HISTORY_ITEMS, MAX_ITEMS } from "./gitCompletions";

const REFS: RefsSnapshot = {
  head: { oid: "a", branch: "main", detached: false },
  state: "clean",
  local: [
    { name: "main", oid: "a", upstream: "origin/main", gone: false, mergedInto: null, ahead: 0, behind: 0, isHead: true },
    { name: "feature", oid: "b", upstream: null, gone: false, mergedInto: null, ahead: 0, behind: 0, isHead: false },
  ],
  remotes: [{ name: "origin", url: null, branches: [{ name: "origin/main", oid: "a", mergedInto: null }] }],
  tags: [{ name: "v1.0", oid: "a", message: null }],
  stashes: [{ index: 0, oid: "c", message: "wip" }],
};

const texts = (text: string, history: string[] = []) => complete(text, REFS, history).items.map((i) => i.text);

describe("complete", () => {
  it("offers commands for the first word, with hints", () => {
    const { items, replaceFrom } = complete("sta", REFS, []);
    expect(items.map((i) => [i.text, i.kind])).toEqual([
      ["status", "command"],
      ["stash", "command"],
    ]);
    expect(items[0].hint).toBe("Working tree status");
    expect(replaceFrom).toBe(0);
  });

  it("lists matching history first, replacing the whole line", () => {
    const { items } = complete("remote pr", REFS, ["remote prune origin", "status", "remote prune upstream"]);
    expect(items.slice(0, 2).map((i) => i.text)).toEqual(["remote prune origin", "remote prune upstream"]);
    expect(items[0].kind).toBe("history");
    // The line itself is not offered back.
    expect(texts("status", ["status"])).toEqual(["status"]);
  });

  it("offers a command's flags when the word starts with a dash", () => {
    expect(texts("status -")).toEqual(["-s", "-b", "--porcelain", "-u"]);
    expect(texts("fetch --pr")).toEqual(["--prune", "--prune-tags"]);
    const { replaceFrom } = complete("fetch --pr", REFS, []);
    expect(replaceFrom).toBe(6);
  });

  it("offers refs in a fixed order: branches, remote branches, tags, stashes, remotes", () => {
    expect(texts("checkout ")).toEqual(["main", "feature", "origin/main", "v1.0", "stash@{0}", "origin"]);
    expect(texts("checkout ori")).toEqual(["origin/main", "origin"]);
    expect(complete("checkout ori", REFS, []).items.map((i) => i.hint)).toEqual(["remote branch", "remote"]);
  });

  it("walks two-level commands: stash → its subcommands, stash pop → stashes", () => {
    expect(texts("stash ")).toEqual(["push", "pop", "apply", "drop", "list", "show", "branch", "clear"]);
    expect(texts("stash push -")).toEqual(["-u", "-k", "-m"]);
    expect(texts("stash pop ")).toContain("stash@{0}");
    expect(texts("remote set-url ")).toContain("origin");
  });

  it("offers nothing for a command it doesn't know, except refs once something is typed", () => {
    expect(texts("frobnicate ")).toEqual([]);
    expect(texts("frobnicate ma")).toEqual(["main"]);
    expect(texts("status a")).toEqual([]);
  });

  it("stays quiet inside an open quote and ignores quoted spaces when finding the current word", () => {
    expect(texts('commit -m "two wo')).toEqual([]);
    expect(complete('commit -m "two words" --am', REFS, []).items.map((i) => i.text)).toEqual(["--amend"]);
    expect(complete('commit -m "two words" --am', REFS, []).replaceFrom).toBe(22);
  });

  it("reads an escaped quote outside quotes as a literal, like splitArgs", () => {
    expect(texts("commit -m it\\'s --am")).toEqual(["--amend"]);
    expect(complete('commit -m say\\"hi --am', REFS, []).replaceFrom).toBe(18);
  });

  it("splits words on ASCII whitespace only", () => {
    expect(texts("commit -m a\u00a0b --am")).toEqual(["--amend"]);
    expect(complete("commit\u00a0--am", REFS, []).items).toEqual([]);
  });

  it("keeps a local branch and a remote of the same name apart by hint", () => {
    const refs = { ...REFS, local: [...REFS.local, { ...REFS.local[1], name: "upstream" }], remotes: [...REFS.remotes, { name: "upstream", url: null, branches: [] }] };
    expect(complete("checkout up", refs, []).items.map((i) => [i.text, i.hint])).toEqual([
      ["upstream", "branch"],
      ["upstream", "remote"],
    ]);
  });

  it("caps history rows on their own so flags still show, and the whole list", () => {
    const history = Array.from({ length: 40 }, (_, i) => `log -${i}`);
    const { items } = complete("log -", REFS, history);
    expect(items.filter((i) => i.kind === "history")).toHaveLength(MAX_HISTORY_ITEMS);
    expect(items.map((i) => i.text)).toContain("--oneline");
    const many = { ...REFS, local: Array.from({ length: 40 }, (_, i) => ({ ...REFS.local[1], name: `b${i}` })) };
    expect(complete("checkout ", many, []).items).toHaveLength(MAX_ITEMS);
  });
});
