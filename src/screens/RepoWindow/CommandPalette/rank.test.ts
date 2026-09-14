import { describe, expect, it } from "vitest";
import type { Command } from "./commands";
import { rankCommands, score } from "./rank";

const cmd = (id: string, group: Command["group"], label: string): Command => ({ id, group, label, run: () => {} });
const all = [
  cmd("view.history", "Views", "History"),
  cmd("view.changes", "Views", "Changes"),
  cmd("stash.push", "Stash", "Stash changes…"),
  cmd("stash.manage", "Stash", "Manage stashes…"),
  cmd("stash.pop", "Stash", "Pop latest"),
  cmd("repo.run", "Repository", "Run git command…"),
  cmd("goto.feature/lane-graph", "Go to branch", "feature/lane-graph"),
];

describe("score", () => {
  it("prefix > word start > subsequence > none", () => {
    expect(score("st", "Stash changes…")).toBe(3);
    expect(score("st", "Manage stashes…")).toBe(2);
    expect(score("st", "History")).toBe(1);
    expect(score("st", "Changes")).toBe(0);
    expect(score("lgr", "feature/lane-graph")).toBe(1);
    expect(score("graph", "feature/lane-graph")).toBe(2);
  });
});

describe("rankCommands", () => {
  it("empty query: Recent first (newest first), then every group in order", () => {
    const out = rankCommands("", all, ["repo.run", "stash.push"]);
    expect(out.slice(0, 2).map((c) => [c.group, c.id])).toEqual([["Recent", "repo.run"], ["Recent", "stash.push"]]);
    expect(out.slice(2).map((c) => c.id)).toEqual(["view.history", "view.changes", "repo.run", "stash.push", "stash.manage", "stash.pop", "goto.feature/lane-graph"]);
  });
  it("a query: groups by their best row, rows best first, a group stays together; no Recent group, no misses", () => {
    // "Pop latest" only matches as a subsequence (1), like History — it still sits with the other Stash rows.
    expect(rankCommands("st", all, ["repo.run"]).map((c) => c.id)).toEqual(["stash.push", "stash.manage", "stash.pop", "view.history"]);
    expect(rankCommands("lgr", all, []).map((c) => c.id)).toEqual(["goto.feature/lane-graph"]);
    expect(rankCommands("zzz", all, [])).toEqual([]);
  });
});
