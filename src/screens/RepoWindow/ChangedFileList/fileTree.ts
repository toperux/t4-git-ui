// Pure: changed files nested by `/` segments (folders first, both alphabetical), and the visible
// lines of such a tree given which folders are collapsed.
import type { FileChange } from "../../../api/types";

export interface FileNode<T = FileChange> {
  /** Segment, or `a/b/c` for a compacted chain of single-child folders. */
  name: string;
  /** Folder path (`a/b`) or the file's path. */
  path: string;
  /** Every folder path a compacted node stands for (`a`, `a/b`, `a/b/c`); absent when it stands for one. */
  chain?: string[];
  children: FileNode<T>[];
  /** Set on leaves. */
  file?: T;
}

export function buildFileTree<T extends { path: string }>(files: T[]): FileNode<T>[] {
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
  compact(root.children);
  return root.children;
}

/**
 * Collapse `a` → `b` → `c` chains of single-child folders into one `a/b/c` node. The node keeps the
 * *deepest* folder's `path`, so `collapsed` keys and `hiddenSlot`'s `path.startsWith(l.path + "/")`
 * test still name a real prefix of the files underneath — and the whole `chain`, because staging a
 * file re-compacts the tree and a key stored against yesterday's shape must still name this row.
 */
function compact<T>(nodes: FileNode<T>[]): void {
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
}

/** One rendered line of a tree: a folder, or a file (the only selectable kind). */
export type TreeLine<T> =
  | { kind: "folder"; path: string; name: string; /** The folder paths this row stands for; any of them collapsed collapses it. */ chain: string[]; depth: number; expanded: boolean }
  | { kind: "file"; file: T; label: string; depth: number };

/**
 * Tree → the visible lines in display order (collapsed folders contribute only their own row).
 * `collapsed` is asked about one path at a time rather than taken as a `Set`, so the Files tab —
 * whose folders start collapsed and whose session state is therefore what was *opened* — can answer
 * with the negation instead of keeping the complement of its own tree.
 */
export function flattenTree<T>(nodes: FileNode<T>[], collapsed: { has(path: string): boolean }, depth = 0, out: TreeLine<T>[] = []): TreeLine<T>[] {
  for (const n of nodes) {
    if (n.file) out.push({ kind: "file", file: n.file, label: n.name, depth });
    else {
      const chain = n.chain ?? [n.path];
      const expanded = !chain.some((p) => collapsed.has(p));
      out.push({ kind: "folder", path: n.path, name: n.name, chain, depth, expanded });
      if (expanded) flattenTree(n.children, collapsed, depth + 1, out);
    }
  }
  return out;
}

/**
 * For a file hidden inside a collapsed folder: how many file lines come before that folder's line —
 * where the keyboard walk resumes from it. −1 when the file is shown (or not in the tree at all).
 */
export function hiddenSlot(lines: ({ kind: "folder"; path: string; expanded: boolean } | { kind: "file"; file: { path: string } })[], path: string): number {
  let files = 0;
  for (const l of lines) {
    if (l.kind === "file") {
      if (l.file.path === path) return -1;
      files++;
    } else if (!l.expanded && path.startsWith(l.path + "/")) return files;
  }
  return -1;
}
