import { describe, expect, it } from "vitest";
import type { FileChange } from "../../../api/types";
import { buildFileTree } from "./fileTree";

const f = (path: string): FileChange => ({ path, oldPath: null, status: "modified", additions: 1, deletions: 0, binary: false });

describe("buildFileTree", () => {
  it("nests by / with folders first, alphabetical", () => {
    const tree = buildFileTree([f("src/z.ts"), f("README.md"), f("src/lib/a.ts"), f("src/b.ts")]);
    expect(tree.map((n) => n.name)).toEqual(["src", "README.md"]);
    const src = tree[0];
    expect(src.children.map((n) => n.name)).toEqual(["lib", "b.ts", "z.ts"]);
    expect(src.children[0].children[0]).toMatchObject({ name: "a.ts", path: "src/lib/a.ts", file: { path: "src/lib/a.ts" } });
    expect(tree[1].file?.path).toBe("README.md");
  });
});
