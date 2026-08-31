import { Archive, Cloud, Copy, Folder, GitBranch, GitMerge, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";
import type { Branch, RemoteBranch, Stash } from "../../api/types";
import { Badge } from "../../components/ui/Badge/Badge";
import { ContextMenu, MenuItem, MenuSeparator } from "../../components/ui/Menu/Menu";
import { EmptyState } from "../../components/ui/EmptyState/EmptyState";
import { SectionHeader } from "../../components/ui/SectionHeader/SectionHeader";
import { AheadBehind, TREE_PANE_CLASS, TreeRow } from "../../components/ui/TreeRow/TreeRow";
import { cx } from "../../lib/cx";
import { useDialogStore } from "../../store/dialogStore";
import { useRepoStore } from "../../store/repoStore";
import { checkoutBranch, checkoutDetached, checkoutRemoteBranch, copyText, stashApply, stashDrop, stashPop, stripRemote } from "./actions";
import s from "./Sidebar.module.css";

type Section = "local" | "remotes" | "tags" | "stashes";

/** Which row the context menu belongs to. */
type Target =
  | { kind: "local"; branch: Branch }
  | { kind: "remote"; remote: string; branch: RemoteBranch }
  | { kind: "tag"; name: string; oid: string }
  | { kind: "stash"; stash: Stash };

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
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; target: Target } | null>(null);

  const toggle = (k: Section) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const toggleFolder = (path: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  /** Right-click, and Shift+F10 / the Menu key on the focused row. */
  function rowMenu(target: Target) {
    return {
      onContextMenu: (e: MouseEvent) => {
        e.preventDefault();
        setMenu({ at: { x: e.clientX, y: e.clientY }, target });
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        setMenu({ at: { x: r.left + 8, y: r.bottom }, target });
      },
    };
  }

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
      onDoubleClick={() => !b.isHead && void checkoutBranch(b.name)}
      {...rowMenu({ kind: "local", branch: b })}
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
                    label={stripRemote(rb, r.name)}
                    title={rb.name}
                    onClick={() => void revealOid(rb.oid)}
                    onDoubleClick={() => void checkoutRemoteBranch(rb, r.name)}
                    {...rowMenu({ kind: "remote", remote: r.name, branch: rb })}
                  />
                ))}
            </div>
          );
        })}

      <SectionHeader title="Tags" count={tags.length} open={open.tags} onToggle={() => toggle("tags")} />
      {open.tags &&
        tags.map((t) => (
          <TreeRow
            key={t.name}
            icon={<Tag size={14} aria-hidden />}
            label={t.name}
            title={t.name}
            onClick={() => void revealOid(t.oid)}
            {...rowMenu({ kind: "tag", name: t.name, oid: t.oid })}
          />
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
            onClick={() => void revealOid(st.oid)}
            {...rowMenu({ kind: "stash", stash: st })}
          />
        ))}

      <RefContextMenu menu={menu} onClose={() => setMenu(null)} />
    </nav>
  );
}

/** Per-kind context menu for a sidebar row. */
function RefContextMenu({ menu, onClose }: { menu: { at: { x: number; y: number }; target: Target } | null; onClose: () => void }) {
  const openDialog = useDialogStore((st) => st.open);
  const current = useRepoStore((st) => st.refs?.local.find((b) => b.isHead)?.name ?? null);
  if (!menu) return null;
  const { target } = menu;
  /** Every item closes the menu first. */
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const items = () => {
    switch (target.kind) {
      case "local": {
        const b = target.branch;
        return (
          <>
            <MenuItem icon={<GitBranch size={16} aria-hidden />} disabled={b.isHead} onClick={run(() => void checkoutBranch(b.name))}>
              Checkout
            </MenuItem>
            <MenuItem icon={<GitMerge size={16} aria-hidden />} disabled={b.isHead} onClick={run(() => openDialog({ kind: "merge", branch: b.name }))}>
              Merge into {current ?? "current"}…
            </MenuItem>
            <MenuItem icon={<GitMerge size={16} aria-hidden />} disabled={b.isHead} onClick={run(() => openDialog({ kind: "rebase", onto: b.name }))}>
              Rebase {current ?? "current"} onto…
            </MenuItem>
            <MenuItem icon={<Plus size={16} aria-hidden />} onClick={run(() => openDialog({ kind: "createBranch", startPoint: b.name }))}>
              Create branch here…
            </MenuItem>
            <MenuItem icon={<Pencil size={16} aria-hidden />} onClick={run(() => openDialog({ kind: "renameBranch", name: b.name }))}>
              Rename…
            </MenuItem>
            <MenuItem onClick={run(() => openDialog({ kind: "push", branch: b.name }))}>Push…</MenuItem>
            <MenuItem icon={<Copy size={16} aria-hidden />} onClick={run(() => copyText(b.name, "branch name"))}>
              Copy name
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 size={16} aria-hidden />} danger disabled={b.isHead} onClick={run(() => openDialog({ kind: "deleteBranch", name: b.name }))}>
              Delete…
            </MenuItem>
          </>
        );
      }
      case "remote": {
        const rb = target.branch;
        const short = stripRemote(rb, target.remote);
        return (
          <>
            <MenuItem icon={<GitBranch size={16} aria-hidden />} onClick={run(() => void checkoutRemoteBranch(rb, target.remote))}>
              Checkout
            </MenuItem>
            <MenuItem icon={<GitMerge size={16} aria-hidden />} onClick={run(() => openDialog({ kind: "merge", branch: rb.name }))}>
              Merge into {current ?? "current"}…
            </MenuItem>
            <MenuItem icon={<Plus size={16} aria-hidden />} onClick={run(() => openDialog({ kind: "createBranch", startPoint: rb.name }))}>
              Create branch here…
            </MenuItem>
            <MenuItem icon={<Copy size={16} aria-hidden />} onClick={run(() => copyText(rb.name, "branch name"))}>
              Copy name
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 size={16} aria-hidden />} danger onClick={run(() => openDialog({ kind: "deleteRemoteBranch", remote: target.remote, name: short }))}>
              Delete on remote…
            </MenuItem>
          </>
        );
      }
      case "tag":
        return (
          <>
            <MenuItem icon={<GitBranch size={16} aria-hidden />} onClick={run(() => void checkoutDetached(target.name))}>
              Checkout (detached)
            </MenuItem>
            <MenuItem icon={<Plus size={16} aria-hidden />} onClick={run(() => openDialog({ kind: "createBranch", startPoint: target.name }))}>
              Create branch here…
            </MenuItem>
            <MenuItem icon={<Copy size={16} aria-hidden />} onClick={run(() => copyText(target.name, "tag name"))}>
              Copy name
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 size={16} aria-hidden />} danger onClick={run(() => openDialog({ kind: "deleteTag", name: target.name }))}>
              Delete…
            </MenuItem>
          </>
        );
      case "stash": {
        const i = target.stash.index;
        return (
          <>
            <MenuItem onClick={run(() => void stashApply(i))}>Apply</MenuItem>
            <MenuItem onClick={run(() => void stashPop(i))}>Pop</MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 size={16} aria-hidden />} danger onClick={run(() => void stashDrop(i))}>
              Drop
            </MenuItem>
          </>
        );
      }
    }
  };

  return (
    <ContextMenu at={menu.at} onClose={onClose} label="Reference actions">
      {items()}
    </ContextMenu>
  );
}
