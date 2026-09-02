// Pure: changed files nested by `/` segments (folders first, both alphabetical), and the visible
// lines of such a tree given which folders are collapsed.
import type { FileChange } from "../../../api/types";

export interface FileNode<T = FileChange> {
  name: string;
  /** Folder path (`a/b`) or the file's path. */
  path: string;
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
  return root.children;
}

/** One rendered line of a tree: a folder, or a file (the only selectable kind). */
export type TreeLine<T> =
  | { kind: "folder"; path: string; name: string; depth: number; expanded: boolean }
  | { kind: "file"; file: T; label: string; depth: number };

/** Tree → the visible lines in display order (collapsed folders contribute only their own row). */
export function flattenTree<T>(nodes: FileNode<T>[], collapsed: ReadonlySet<string>, depth = 0, out: TreeLine<T>[] = []): TreeLine<T>[] {
  for (const n of nodes) {
    if (n.file) out.push({ kind: "file", file: n.file, label: n.name, depth });
    else {
      const expanded = !collapsed.has(n.path);
      out.push({ kind: "folder", path: n.path, name: n.name, depth, expanded });
      if (expanded) flattenTree(n.children, collapsed, depth + 1, out);
    }
  }
  return out;
}
