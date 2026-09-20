import { describe, expect, it } from "vitest";
import type { Hunk } from "../api/types";
import { hunkPrint } from "./hunkPrint";

describe("hunkPrint", () => {
  // The same vector as `patch::tests::hunk_print_matches_the_shared_vector` in git-core: the two
  // implementations have to agree, or the backend refuses every hunk action.
  const line = (kind: "context" | "add" | "del", text: string, noNewline = false) => ({ kind, oldNo: null, newNo: null, text, noNewline });
  const hunk: Hunk = { header: "@@ -1,2 +1,4 @@ fn x()", oldStart: 1, oldLines: 2, newStart: 1, newLines: 4, lines: [line("context", "a"), line("del", "b", true), line("add", "b"), line("add", "café\r")] };

  it("matches the backend's print", () => {
    expect(hunkPrint(hunk)).toBe("6b34fb19");
    expect(hunkPrint({ ...hunk, lines: hunk.lines.slice(0, 2) })).toBe("53a53432");
  });
});
