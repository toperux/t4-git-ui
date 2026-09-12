import { describe, expect, it } from "vitest";
import type { RepoState, WorkdirStatus } from "../api/types";
import { freshStatus } from "./freshStatus";

const status = (state: RepoState): WorkdirStatus => ({ entries: [], staged: 0, unstaged: 0, untracked: 0, conflicted: 0, state });

describe("freshStatus", () => {
  it("keeps a status scanned in the state the refs are in", () => {
    const s = status("rebase");
    expect(freshStatus(s, "rebase")).toBe(s);
  });

  it("drops one scanned in another state, whichever side moved first", () => {
    expect(freshStatus(status("clean"), "rebase")).toBeNull();
    expect(freshStatus(status("rebase"), "clean")).toBeNull();
  });

  it("no status, and no refs yet, are the same 'not known yet'", () => {
    expect(freshStatus(null, "clean")).toBeNull();
    expect(freshStatus(status("clean"), undefined)).toBeNull();
  });
});
