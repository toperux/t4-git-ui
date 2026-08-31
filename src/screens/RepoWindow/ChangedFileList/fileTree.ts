// Pure: changed files nested by `/` segments (folders first, both alphabetical).
import type { FileChange } from "../../../api/types";

export interface FileNode {
  name: string;
  /** Folder path (`a/b`) or the file's path. */
  path: string;
  children: FileNode[];
  /** Set on leaves. */
  file?: FileChange;
}

export function buildFileTree(files: FileChange[]): FileNode[] {
  const root: FileNode = { name: "", path: "", children: [] };
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
  const sort = (nodes: FileNode[]) => {
    nodes.sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name));
    nodes.forEach((n) => sort(n.children));
  };
  sort(root.children);
  return root.children;
}
