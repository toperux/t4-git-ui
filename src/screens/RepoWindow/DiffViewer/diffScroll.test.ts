import { beforeEach, describe, expect, it } from "vitest";
import type { FileDiff } from "../../../api/types";
import { forgetScroll, noteScroll, seedScroll, takeNote, takeSeed, type DiffScroll } from "./diffScroll";

const at = (top: number): DiffScroll => ({ pane: "history", repoId: "r", path: "a.ts", diff: {} as FileDiff, rows: [], view: "unified", top });

beforeEach(forgetScroll);

describe("diffScroll", () => {
  it("takeNote hands the note over once", () => {
    noteScroll(at(1));
    noteScroll(at(2)); // one slot: the latest wins
    expect(takeNote()).toEqual(at(2));
    expect(takeNote()).toBeNull();
  });

  it("takeSeed gives the seed to its own pane, repository and file, and spends it on any other", () => {
    seedScroll(at(5));
    expect(takeSeed("history", "r", "a.ts")).toEqual(at(5));
    expect(takeSeed("history", "r", "a.ts")).toBeNull();
    for (const [pane, repoId, path] of [["changes", "r", "a.ts"], ["history", "s", "a.ts"], ["history", "r", "b.ts"]] as const) {
      seedScroll(at(5));
      expect(takeSeed(pane, repoId, path)).toBeNull();
      expect(takeSeed("history", "r", "a.ts")).toBeNull();
    }
  });

  it("forgetScroll clears both slots", () => {
    noteScroll(at(1));
    seedScroll(at(2));
    forgetScroll();
    expect(takeNote()).toBeNull();
    expect(takeSeed("history", "r", "a.ts")).toBeNull();
  });
});
