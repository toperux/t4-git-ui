import { Archive, Cloud, Folder, GitBranch, Tag } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Branch } from "../../api/types";
import { Badge } from "../../components/ui/Badge/Badge";
import { EmptyState } from "../../components/ui/EmptyState/EmptyState";
import { SectionHeader } from "../../components/ui/SectionHeader/SectionHeader";
import { AheadBehind, TREE_PANE_CLASS, TreeRow } from "../../components/ui/TreeRow/TreeRow";
import { cx } from "../../lib/cx";
import { useRepoStore } from "../../store/repoStore";
import s from "./Sidebar.module.css";

type Section = "local" | "remotes" | "tags" | "stashes";

/** Branch names nested by `/` segments. */
interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  branch?: Branch;
}

/** A node with children is a folder (it may also carry a branch, e.g. `feature` + `feature/x`). */
function buildTree(branches: Branch[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [] };
  for (const b of branches) {
    const parts = b.name.split("/");
    let node = root;
    parts.forEach((part, i) => {
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path: parts.slice(0, i + 1).join("/"), children: [] };
        node.children.push(child);
      }
      if (i === parts.length - 1) child.branch = b;
      node = child;
    });
  }
  // Folders first, then leaves; both alphabetical.
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => Number(!a.children.length) - Number(!b.children.length) || a.name.localeCompare(b.name));
    nodes.forEach((n) => sort(n.children));
  };
  sort(root.children);
  return root.children;
}

export function Sidebar() {
  const refs = useRepoStore((st) => st.refs);
  const revealOid = useRepoStore((st) => st.revealOid);
  const [open, setOpen] = useState<Record<Section, boolean>>({ local: true, remotes: true, tags: false, stashes: true });
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggle = (k: Section) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const toggleFolder = (path: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const local = refs?.local ?? [];
  const remotes = refs?.remotes ?? [];
  const tags = refs?.tags ?? [];
  const stashes = refs?.stashes ?? [];

  const branchRow = (b: Branch, label: string, depth: number) => (
    <TreeRow
      key={b.name}
      depth={depth}
      icon={<GitBranch size={14} aria-hidden />}
      label={label}
      title={b.name}
      current={b.isHead}
      selected={b.isHead}
      meta={
        <>
          <AheadBehind ahead={b.ahead} behind={b.behind} />
          {b.gone && <Badge title="Upstream is gone">gone</Badge>}
        </>
      }
      onClick={() => void revealOid(b.oid)}
    />
  );

  function renderTree(nodes: TreeNode[], depth: number): ReactNode {
    return nodes.map((n) => {
      if (n.children.length === 0 && n.branch) return branchRow(n.branch, n.name, depth);
      const isCollapsed = collapsed.has(n.path);
      return (
        <div key={n.path}>
          <TreeRow depth={depth} expanded={!isCollapsed} icon={<Folder size={14} aria-hidden />} label={n.name} title={n.path} onClick={() => toggleFolder(n.path)} />
          {!isCollapsed && n.branch && branchRow(n.branch, n.name, depth + 1)}
          {!isCollapsed && renderTree(n.children, depth + 1)}
        </div>
      );
    });
  }

  return (
    <nav className={cx(s.sidebar, TREE_PANE_CLASS)} aria-label="References">
      <SectionHeader title="Local" count={local.length} open={open.local} onToggle={() => toggle("local")} />
      {open.local &&
        (local.length === 0 ? (
          <EmptyState className={s.empty} icon={<GitBranch size={20} aria-hidden />} title="No branches yet" />
        ) : (
          renderTree(buildTree(local), 0)
        ))}

      <SectionHeader title="Remotes" count={remotes.length} open={open.remotes} onToggle={() => toggle("remotes")} />
      {open.remotes &&
        remotes.map((r) => {
          const isCollapsed = collapsed.has(`remote:${r.name}`);
          return (
            <div key={r.name}>
              <TreeRow
                depth={0}
                expanded={!isCollapsed}
                icon={<Cloud size={14} aria-hidden />}
                label={r.name}
                title={r.url ?? r.name}
                onClick={() => toggleFolder(`remote:${r.name}`)}
              />
              {!isCollapsed &&
                r.branches.map((rb) => (
                  <TreeRow
                    key={rb.name}
                    depth={1}
                    icon={<GitBranch size={14} aria-hidden />}
                    label={rb.name.startsWith(`${r.name}/`) ? rb.name.slice(r.name.length + 1) : rb.name}
                    title={rb.name}
                    onClick={() => void revealOid(rb.oid)}
                  />
                ))}
            </div>
          );
        })}

      <SectionHeader title="Tags" count={tags.length} open={open.tags} onToggle={() => toggle("tags")} />
      {open.tags &&
        tags.map((t) => (
          <TreeRow key={t.name} icon={<Tag size={14} aria-hidden />} label={t.name} title={t.name} onClick={() => void revealOid(t.oid)} />
        ))}

      <SectionHeader title="Stashes" count={stashes.length} open={open.stashes} onToggle={() => toggle("stashes")} />
      {open.stashes &&
        stashes.map((st) => (
          <TreeRow
            key={st.index}
            icon={<Archive size={14} aria-hidden />}
            label={st.message}
            title={`stash@{${st.index}}: ${st.message}`}
            meta={<span className={s.mono}>{`stash@{${st.index}}`}</span>}
          />
        ))}
    </nav>
  );
}
