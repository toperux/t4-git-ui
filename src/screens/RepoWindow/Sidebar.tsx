import { Archive, ArrowDown, Cloud, Copy, Folder, GitBranch, GitMerge, Link, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { Branch, Remote, RemoteBranch, Stash } from "../../api/types";
import { Badge } from "../../components/ui/Badge/Badge";
import { Button } from "../../components/ui/Button/Button";
import { ContextMenu, MenuItem, MenuSeparator } from "../../components/ui/Menu/Menu";
import { EmptyState } from "../../components/ui/EmptyState/EmptyState";
import { SectionHeader } from "../../components/ui/SectionHeader/SectionHeader";
import { AheadBehind, TREE_PANE_CLASS, TreeRow } from "../../components/ui/TreeRow/TreeRow";
import { cx } from "../../lib/cx";
import { useDialogStore, type DialogSpec } from "../../store/dialogStore";
import { selectRunning, useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { checkoutBranch, checkoutRemoteBranch, checkoutTag, copyText, fetchRemote, protectedNames, stashApply, stashDrop, stashPop, stripRemote } from "./actions";
import s from "./Sidebar.module.css";

type Section = "local" | "remotes" | "tags" | "stashes";

/** Which row the context menu belongs to. */
type Target =
  | { kind: "local"; branch: Branch }
  | { kind: "remote"; remote: string; branch: RemoteBranch }
  /** The remote's own folder row, not one of its branches. */
  | { kind: "remoteGroup"; remote: Remote }
  | { kind: "tag"; name: string; oid: string }
  | { kind: "stash"; stash: Stash };

/** Names nested by `/` segments (local branches, or one remote's branches without the remote prefix). */
interface TreeNode<T> {
  name: string;
  path: string;
  children: TreeNode<T>[];
  leaf?: T;
}

/** A node with children is a folder (it may also carry a leaf, e.g. `feature` + `feature/x`). */
function buildTree<T>(items: T[], nameOf: (item: T) => string): TreeNode<T>[] {
  const root: TreeNode<T> = { name: "", path: "", children: [] };
  for (const item of items) {
    const parts = nameOf(item).split("/");
    let node = root;
    parts.forEach((part, i) => {
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path: parts.slice(0, i + 1).join("/"), children: [] };
        node.children.push(child);
      }
      if (i === parts.length - 1) child.leaf = item;
      node = child;
    });
  }
  // Folders first, then leaves; both alphabetical.
  const sort = (nodes: TreeNode<T>[]) => {
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
  // `open` is the section state below, so the dialog opener keeps its own name here.
  const openDialog = useDialogStore((st) => st.open);
  const running = useOpsStore(selectRunning);
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
  const keep = protectedNames(remotes);

  /** A branch inside another one is muted and says so: it adds nothing and can go. */
  const mergedLabel = (label: string, mergedInto: string | null) => (mergedInto ? <span className={s.merged}>{label}</span> : label);
  const mergedBadge = (mergedInto: string | null) => mergedInto && <Badge title={`Merged into ${mergedInto} — safe to delete`}>merged</Badge>;
  const mergedTitle = (name: string, mergedInto: string | null) => (mergedInto ? `${name} — merged into ${mergedInto}` : name);

  const branchRow = (b: Branch, label: string, depth: number) => {
    // The checked-out branch and a protected one cannot be deleted, so neither is ever "safe to delete" whatever the backend says.
    const mergedInto = b.isHead || keep.has(b.name) ? null : b.mergedInto;
    return (
      <TreeRow
        key={b.name}
        role="treeitem"
        aria-level={depth + 1}
        depth={depth}
        icon={<GitBranch size={14} aria-hidden />}
        label={mergedLabel(label, mergedInto)}
        title={mergedTitle(b.name, mergedInto)}
        current={b.isHead}
        selected={b.isHead}
        meta={
          <>
            <AheadBehind ahead={b.ahead} behind={b.behind} />
            {b.gone && <Badge title="Upstream is gone">gone</Badge>}
            {mergedBadge(mergedInto)}
          </>
        }
        onClick={() => void revealOid(b.oid)}
        onDoubleClick={() => !b.isHead && void checkoutBranch(b.name)}
        {...rowMenu({ kind: "local", branch: b })}
      />
    );
  };

  const remoteRow = (remote: string) => (rb: RemoteBranch, label: string, depth: number) => {
    const mergedInto = keep.has(stripRemote(rb, remote)) ? null : rb.mergedInto;
    return (
      <TreeRow
        key={rb.name}
        role="treeitem"
        aria-level={depth + 1}
        depth={depth}
        icon={<GitBranch size={14} aria-hidden />}
        label={mergedLabel(label, mergedInto)}
        title={mergedTitle(rb.name, mergedInto)}
        meta={mergedBadge(mergedInto)}
        onClick={() => void revealOid(rb.oid)}
        onDoubleClick={() => void checkoutRemoteBranch(rb, remote)}
        {...rowMenu({ kind: "remote", remote, branch: rb })}
      />
    );
  };

  /** Leaves render through `row` with their last segment as the label; folders collapse under `folderKey(path)`. */
  function renderTree<T>(nodes: TreeNode<T>[], depth: number, row: (leaf: T, label: string, depth: number) => ReactNode, folderKey: (path: string) => string): ReactNode {
    return nodes.map((n) => {
      if (n.children.length === 0 && n.leaf !== undefined) return row(n.leaf, n.name, depth);
      const key = folderKey(n.path);
      const isCollapsed = collapsed.has(key);
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
            onClick={() => toggleFolder(key)}
          />
          {!isCollapsed && (
            <div role="group" className={s.tree}>
              {n.leaf !== undefined && row(n.leaf, n.name, depth + 1)}
              {renderTree(n.children, depth + 1, row, folderKey)}
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
          <Tree label="Local branches">{renderTree(buildTree(local, (b) => b.name), 0, branchRow, (path) => path)}</Tree>
        ))}

      {/* Branches, not remotes: every other section counts refs, and the remotes are right there to count by eye. */}
      <SectionHeader title="Remotes" count={remotes.reduce((n, r) => n + r.branches.length, 0)} open={open.remotes} onToggle={() => toggle("remotes")} />
      {open.remotes && remotes.length === 0 && (
        <EmptyState
          className={s.empty}
          icon={<Cloud size={20} aria-hidden />}
          title="No remotes"
          action={
            <Button size="sm" disabled={running} title={running ? "Operation in progress" : undefined} onClick={() => openDialog({ kind: "addRemote" })}>
              Add remote…
            </Button>
          }
        />
      )}
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
                  {...rowMenu({ kind: "remoteGroup", remote: r })}
                />
                {!isCollapsed && (
                  <div role="group" className={s.tree}>
                    {/* Nested by `/` like the local branches; folder state is per remote. */}
                    {renderTree(
                      buildTree(r.branches, (rb) => stripRemote(rb, r.name)),
                      1,
                      remoteRow(r.name),
                      (path) => `remote:${r.name}/${path}`,
                    )}
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
  const remotes = useRepoStore((st) => st.refs?.remotes);
  const running = useOpsStore(selectRunning);
  if (!menu) return null;
  const { target } = menu;
  // The clicked menu item is gone by the time the dialog mounts: hand it the row the menu came from.
  const openDialog = (spec: DialogSpec) => open(spec, { returnFocusTo: menu.el });
  // Everything but Copy touches the repository: greyed while an operation runs, like the toolbar.
  const op = running ? { disabled: true, title: "Operation in progress" } : {};
  /** Every item closes the menu first. */
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  // Branches never offered for deletion have no Delete item at all — nor the separator above it.
  const keep = protectedNames(remotes ?? []);

  const items = () => {
    switch (target.kind) {
      case "local": {
        const b = target.branch;
        return (
          <>
            <MenuItem icon={<GitBranch size={16} aria-hidden />} disabled={b.isHead} {...op} onClick={run(() => void checkoutBranch(b.name))}>
              Checkout
            </MenuItem>
            <MenuItem icon={<GitMerge size={16} aria-hidden />} disabled={b.isHead} {...op} onClick={run(() => openDialog({ kind: "merge", branch: b.name }))}>
              Merge into {current ?? "current"}…
            </MenuItem>
            <MenuItem icon={<GitMerge size={16} aria-hidden />} disabled={b.isHead} {...op} onClick={run(() => openDialog({ kind: "rebase", onto: b.name }))}>
              Rebase {current ?? "current"} onto…
            </MenuItem>
            <MenuItem icon={<Plus size={16} aria-hidden />} {...op} onClick={run(() => openDialog({ kind: "createBranch", startPoint: b.name }))}>
              Create branch here…
            </MenuItem>
            <MenuItem icon={<Pencil size={16} aria-hidden />} {...op} onClick={run(() => openDialog({ kind: "renameBranch", name: b.name }))}>
              Rename…
            </MenuItem>
            <MenuItem {...op} onClick={run(() => openDialog({ kind: "push", branch: b.name }))}>Push…</MenuItem>
            <MenuItem icon={<Copy size={16} aria-hidden />} onClick={run(() => copyText(b.name, "branch name"))}>
              Copy name
            </MenuItem>
            {!keep.has(b.name) && (
              <>
                <MenuSeparator />
                <MenuItem icon={<Trash2 size={16} aria-hidden />} danger disabled={b.isHead} {...op} onClick={run(() => openDialog({ kind: "deleteBranch", name: b.name }))}>
                  Delete…
                </MenuItem>
              </>
            )}
          </>
        );
      }
      case "remote": {
        const rb = target.branch;
        const short = stripRemote(rb, target.remote);
        return (
          <>
            <MenuItem icon={<GitBranch size={16} aria-hidden />} {...op} onClick={run(() => void checkoutRemoteBranch(rb, target.remote))}>
              Checkout
            </MenuItem>
            <MenuItem icon={<GitMerge size={16} aria-hidden />} {...op} onClick={run(() => openDialog({ kind: "merge", branch: rb.name }))}>
              Merge into {current ?? "current"}…
            </MenuItem>
            <MenuItem icon={<Plus size={16} aria-hidden />} {...op} onClick={run(() => openDialog({ kind: "createBranch", startPoint: rb.name }))}>
              Create branch here…
            </MenuItem>
            <MenuItem icon={<Copy size={16} aria-hidden />} onClick={run(() => copyText(rb.name, "branch name"))}>
              Copy name
            </MenuItem>
            {!keep.has(short) && (
              <>
                <MenuSeparator />
                <MenuItem icon={<Trash2 size={16} aria-hidden />} danger {...op} onClick={run(() => openDialog({ kind: "deleteRemoteBranch", remote: target.remote, name: short }))}>
                  Delete on remote…
                </MenuItem>
              </>
            )}
          </>
        );
      }
      case "remoteGroup": {
        const r = target.remote;
        return (
          <>
            <MenuItem icon={<ArrowDown size={16} aria-hidden />} {...op} onClick={run(() => void fetchRemote(r.name))}>
              Fetch {r.name}
            </MenuItem>
            <MenuItem icon={<Pencil size={16} aria-hidden />} {...op} onClick={run(() => openDialog({ kind: "renameRemote", name: r.name }))}>
              Rename…
            </MenuItem>
            <MenuItem icon={<Link size={16} aria-hidden />} {...op} onClick={run(() => openDialog({ kind: "setRemoteUrl", name: r.name, url: r.url }))}>
              Change URL…
            </MenuItem>
            <MenuItem icon={<Copy size={16} aria-hidden />} disabled={!r.url} title={r.url ? undefined : "No URL configured"} onClick={run(() => copyText(r.url ?? "", "URL"))}>
              Copy URL
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 size={16} aria-hidden />} danger {...op} onClick={run(() => openDialog({ kind: "removeRemote", name: r.name }))}>
              Remove…
            </MenuItem>
          </>
        );
      }
      case "tag":
        return (
          <>
            <MenuItem icon={<GitBranch size={16} aria-hidden />} {...op} onClick={run(() => void checkoutTag(target.name))}>
              Checkout (detached)
            </MenuItem>
            <MenuItem icon={<Plus size={16} aria-hidden />} {...op} onClick={run(() => openDialog({ kind: "createBranch", startPoint: target.name }))}>
              Create branch here…
            </MenuItem>
            <MenuItem {...op} onClick={run(() => openDialog({ kind: "pushTag", name: target.name }))}>Push…</MenuItem>
            <MenuItem icon={<Copy size={16} aria-hidden />} onClick={run(() => copyText(target.name, "tag name"))}>
              Copy name
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 size={16} aria-hidden />} danger {...op} onClick={run(() => openDialog({ kind: "deleteTag", name: target.name }))}>
              Delete…
            </MenuItem>
            <MenuItem icon={<Trash2 size={16} aria-hidden />} danger {...op} onClick={run(() => openDialog({ kind: "deleteRemoteTag", name: target.name }))}>
              Delete on remote…
            </MenuItem>
          </>
        );
      case "stash": {
        const i = target.stash.index;
        return (
          <>
            <MenuItem {...op} onClick={run(() => void stashApply(i))}>Apply</MenuItem>
            <MenuItem {...op} onClick={run(() => void stashPop(i))}>Pop</MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 size={16} aria-hidden />} danger {...op} onClick={run(() => void stashDrop(i))}>
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
