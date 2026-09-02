import { describe, expect, it } from "vitest";
import type { FileChange } from "../../../api/types";
import { buildFileTree, flattenTree, hiddenSlot } from "./fileTree";

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

  it("a file and a folder at the same path are two nodes, told apart by kind", () => {
    // Deleted tracked file `a`, new untracked `a/b`.
    const tree = buildFileTree([f("a"), f("a/b")]);
    expect(tree.map((n) => [n.path, !!n.file])).toEqual([
      ["a", false],
      ["a", true],
    ]);
    const lines = flattenTree(tree, new Set());
    expect(lines.map((l) => (l.kind === "folder" ? `d:${l.path}` : `f:${l.file.path}`))).toEqual(["d:a", "f:a/b", "f:a"]);
  });

  it("compacts a chain of single-child folders into one line named a/b/c, pathed at the deepest", () => {
    const lines = flattenTree(buildFileTree([f("a/b/c/x.rs"), f("a/b/c/y.rs")]), new Set());
    expect(lines[0]).toMatchObject({ kind: "folder", name: "a/b/c", path: "a/b/c", depth: 0 });
    expect(lines.slice(1)).toMatchObject([
      { kind: "file", label: "x.rs", depth: 1 },
      { kind: "file", label: "y.rs", depth: 1 },
    ]);
  });

  it("a folder with two children is never compacted", () => {
    const lines = flattenTree(buildFileTree([f("a/b/x.rs"), f("a/c/y.rs")]), new Set());
    expect(lines.map((l) => (l.kind === "folder" ? `d:${l.name}` : `f:${l.label}`))).toEqual(["d:a", "d:b", "f:x.rs", "d:c", "f:y.rs"]);
  });

  it("compacts only the chain: a folder beside a file keeps its own line", () => {
    const tree = buildFileTree([f("a/b/c/x.rs"), f("a/d.rs")]);
    expect(tree).toMatchObject([{ name: "a", path: "a" }]);
    expect(tree[0].children.map((n) => [n.name, n.path, !!n.file])).toEqual([
      ["b/c", "a/b/c", false],
      ["d.rs", "a/d.rs", true],
    ]);
  });
});

describe("hiddenSlot", () => {
  it("counts the file lines above the collapsed folder that hides the path; −1 when the file is shown", () => {
    const tree = buildFileTree([f("a/n/y.ts"), f("a/x.ts"), f("b/z.ts")]);
    expect(hiddenSlot(flattenTree(tree, new Set()), "b/z.ts")).toBe(-1);
    // a / n / y.ts / x.ts / b(collapsed): two files above.
    expect(hiddenSlot(flattenTree(tree, new Set(["b"])), "b/z.ts")).toBe(2);
    expect(hiddenSlot(flattenTree(tree, new Set(["a/n"])), "a/n/y.ts")).toBe(0);
    // The outermost collapsed ancestor is the one on screen.
    expect(hiddenSlot(flattenTree(tree, new Set(["a", "a/n"])), "a/n/y.ts")).toBe(0);
    expect(hiddenSlot(flattenTree(tree, new Set(["a"])), "nope.ts")).toBe(-1);
  });

  it("a compacted chain is collapsed by its deepest path, and still hides the files under it", () => {
    const tree = buildFileTree([f("a/b/c/x.ts"), f("z.ts")]);
    expect(hiddenSlot(flattenTree(tree, new Set(["a/b/c"])), "a/b/c/x.ts")).toBe(0);
  });
});
