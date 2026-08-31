import { Archive, Cloud, Copy, Folder, GitBranch, GitMerge, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { Branch, RemoteBranch, Stash } from "../../api/types";
import { Badge } from "../../components/ui/Badge/Badge";
import { ContextMenu, MenuItem, MenuSeparator } from "../../components/ui/Menu/Menu";
import { EmptyState } from "../../components/ui/EmptyState/EmptyState";
import { SectionHeader } from "../../components/ui/SectionHeader/SectionHeader";
import { AheadBehind, TREE_PANE_CLASS, TreeRow } from "../../components/ui/TreeRow/TreeRow";
import { cx } from "../../lib/cx";
import { useDialogStore, type DialogSpec } from "../../store/dialogStore";
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

const ITEMS = '[role="treeitem"]';

/**
 * One sidebar tree. ARIA asks for a single tab stop per tree, so the rows carry a roving `tabIndex`
 * (managed on the DOM nodes — `TreeRow` renders plain buttons) and ↑/↓/Home/End move focus inside it.
 */
function Tree({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const items = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(ITEMS) ?? []);

  useEffect(() => {
    const list = items();
    const i = Math.min(active, Math.max(list.length - 1, 0));
    list.forEach((el, n) => (el.tabIndex = n === i ? 0 : -1));
  });

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    if (list.length === 0) return;
    const cur = list.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (e.key === "ArrowDown") next = Math.min(cur + 1, list.length - 1);
    else if (e.key === "ArrowUp") next = Math.max(cur - 1, 0);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = list.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
    list[next].focus();
  }

  return (
    <div
      ref={ref}
      role="tree"
      aria-label={label}
      className={s.tree}
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        const i = items().indexOf(e.target as HTMLElement);
        if (i >= 0) setActive(i);
      }}
    >
      {children}
    </div>
  );
}

export function Sidebar() {
  const refs = useRepoStore((st) => st.refs);
  const revealOid = useRepoStore((st) => st.revealOid);
  const [open, setOpen] = useState<Record<Section, boolean>>({ local: true, remotes: true, tags: false, stashes: true });
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; target: Target; el: HTMLElement } | null>(null);

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
      onContextMenu: (e: MouseEvent<HTMLElement>) => {
        e.preventDefault();
        setMenu({ at: { x: e.clientX, y: e.clientY }, target, el: e.currentTarget });
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        setMenu({ at: { x: r.left + 8, y: r.bottom }, target, el: e.currentTarget });
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
      role="treeitem"
      aria-level={depth + 1}
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
        <div key={n.path} className={s.tree}>
          <TreeRow
            role="treeitem"
            aria-level={depth + 1}
            depth={depth}
            expanded={!isCollapsed}
            icon={<Folder size={14} aria-hidden />}
            label={n.name}
            title={n.path}
            onClick={() => toggleFolder(n.path)}
          />
          {!isCollapsed && (
            <div role="group" className={s.tree}>
              {n.branch && branchRow(n.branch, n.name, depth + 1)}
              {renderTree(n.children, depth + 1)}
            </div>
          )}
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
          <Tree label="Local branches">{renderTree(buildTree(local), 0)}</Tree>
        ))}

      {/* Branches, not remotes: every other section counts refs, and the remotes are right there to count by eye. */}
      <SectionHeader title="Remotes" count={remotes.reduce((n, r) => n + r.branches.length, 0)} open={open.remotes} onToggle={() => toggle("remotes")} />
      {open.remotes && remotes.length > 0 && (
        <Tree label="Remote branches">
          {remotes.map((r) => {
            const isCollapsed = collapsed.has(`remote:${r.name}`);
            return (
              <div key={r.name} className={s.tree}>
                <TreeRow
                  role="treeitem"
                  aria-level={1}
                  depth={0}
                  expanded={!isCollapsed}
                  icon={<Cloud size={14} aria-hidden />}
                  label={r.name}
                  title={r.url ?? r.name}
                  onClick={() => toggleFolder(`remote:${r.name}`)}
                />
                {!isCollapsed && (
                  <div role="group" className={s.tree}>
                    {r.branches.map((rb) => (
                      <TreeRow
                        key={rb.name}
                        role="treeitem"
                        aria-level={2}
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
                )}
              </div>
            );
          })}
        </Tree>
      )}

      <SectionHeader title="Tags" count={tags.length} open={open.tags} onToggle={() => toggle("tags")} />
      {open.tags && tags.length > 0 && (
        <Tree label="Tags">
          {tags.map((t) => (
            <TreeRow
              key={t.name}
              role="treeitem"
              aria-level={1}
              icon={<Tag size={14} aria-hidden />}
              label={t.name}
              title={t.name}
              onClick={() => void revealOid(t.oid)}
              {...rowMenu({ kind: "tag", name: t.name, oid: t.oid })}
            />
          ))}
        </Tree>
      )}

      <SectionHeader title="Stashes" count={stashes.length} open={open.stashes} onToggle={() => toggle("stashes")} />
      {open.stashes && stashes.length > 0 && (
        <Tree label="Stashes">
          {stashes.map((st) => (
            <TreeRow
              key={st.index}
              role="treeitem"
              aria-level={1}
              icon={<Archive size={14} aria-hidden />}
              label={st.message}
              title={`stash@{${st.index}}: ${st.message}`}
              meta={<span className={s.mono}>{`stash@{${st.index}}`}</span>}
              onClick={() => void revealOid(st.oid)}
              {...rowMenu({ kind: "stash", stash: st })}
            />
          ))}
        </Tree>
      )}

      <RefContextMenu menu={menu} onClose={() => setMenu(null)} />
    </nav>
  );
}

/** Per-kind context menu for a sidebar row. */
function RefContextMenu({ menu, onClose }: { menu: { at: { x: number; y: number }; target: Target; el: HTMLElement } | null; onClose: () => void }) {
  const open = useDialogStore((st) => st.open);
  const current = useRepoStore((st) => st.refs?.local.find((b) => b.isHead)?.name ?? null);
  if (!menu) return null;
  const { target } = menu;
  // The clicked menu item is gone by the time the dialog mounts: hand it the row the menu came from.
  const openDialog = (spec: DialogSpec) => open(spec, { returnFocusTo: menu.el });
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
