import { describe, expect, it } from "vitest";
import type { FileChange } from "../../../api/types";
import { buildFileTree, flattenTree, hiddenSlot, type FileNode } from "./fileTree";

const f = (path: string): FileChange => ({ path, oldPath: null, status: "modified", additions: 1, deletions: 0, binary: false });

/** The build before the per-folder `Map` and the shared collator: the reference for its output. */
function referenceBuild<T extends { path: string }>(files: T[]): FileNode<T>[] {
  const root: FileNode<T> = { name: "", path: "", children: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      let child = last ? undefined : node.children.find((c) => c.name === part && !c.file);
      if (!child) {
        child = { name: part, path: parts.slice(0, i + 1).join("/"), children: [] };
        if (last) child.file = f;
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (nodes: FileNode<T>[]) => {
    nodes.sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name));
    nodes.forEach((n) => sort(n.children));
  };
  sort(root.children);
  const compact = (nodes: FileNode<T>[]): void => {
    nodes.forEach((n, i) => {
      if (n.file) return;
      let node = n;
      while (node.children.length === 1 && !node.children[0].file) {
        const child = node.children[0];
        node = { name: `${node.name}/${child.name}`, path: child.path, chain: [...(node.chain ?? [node.path]), child.path], children: child.children };
      }
      nodes[i] = node;
      compact(node.children);
    });
  };
  compact(root.children);
  return root.children;
}

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

  it("a compacted node is collapsed by any folder in its chain, so staging a file doesn't reopen it", () => {
    // `a` is a real row while `a/c.rs` exists, and the user collapsed it. Staging that file compacts
    // the folder into `a / b`, whose own path is `a/b` — the stored key must still name this row.
    const open = flattenTree(buildFileTree([f("a/b/x.rs"), f("a/c.rs")]), new Set(["a"]));
    expect(open).toMatchObject([{ kind: "folder", name: "a", path: "a", chain: ["a"], expanded: false }]);
    const compacted = flattenTree(buildFileTree([f("a/b/x.rs")]), new Set(["a"]));
    expect(compacted).toMatchObject([{ kind: "folder", name: "a/b", path: "a/b", chain: ["a", "a/b"], expanded: false }]);
  });

  it("compacts only the chain: a folder beside a file keeps its own line", () => {
    const tree = buildFileTree([f("a/b/c/x.rs"), f("a/d.rs")]);
    expect(tree).toMatchObject([{ name: "a", path: "a" }]);
    expect(tree[0].children.map((n) => [n.name, n.path, !!n.file])).toEqual([
      ["b/c", "a/b/c", false],
      ["d.rs", "a/d.rs", true],
    ]);
  });

  it("builds the same tree as the reference build", () => {
    // Compacted chains, a file and a folder of one name, sibling folders, non-ASCII and mixed-case
    // names, fed in a shuffled order.
    const names = ["a", "B", "b", "é", "e", "z", "Ä", "日本", "ж"];
    const paths = ["deep/one/two/three/x.rs", "deep/one/two/three/y.rs", "a", "a/b", "a/b/c/d/e.rs"];
    for (const p of names) for (const q of names) for (const r of names.slice(0, 4)) paths.push(`${p}/${q}/${r}.ts`, `${p}/${q}.md`);
    let seed = 42;
    const rand = () => (seed = (seed * 16807) % 2147483647);
    const files = paths
      .map((p) => ({ key: rand(), file: f(p) }))
      .sort((x, y) => x.key - y.key)
      .map((x) => x.file);
    const tree = buildFileTree(files);
    expect(tree).toEqual(referenceBuild(files));
    // The generator reached every case it names.
    expect(tree.find((n) => n.name === "deep/one/two/three")).toBeTruthy();
    expect(tree.filter((n) => n.path === "a").map((n) => !!n.file)).toEqual([false, true]);
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
