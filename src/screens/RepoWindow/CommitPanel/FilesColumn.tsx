import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, File, Folder, FolderTree, Minus, Plus, Rows2 } from "lucide-react";
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import type { FileChange, StatusEntry } from "../../../api/types";
import { Badge } from "../../../components/ui/Badge/Badge";
import { Button } from "../../../components/ui/Button/Button";
import { IconButton } from "../../../components/ui/IconButton/IconButton";
import { PanelHeader } from "../../../components/ui/PanelHeader/PanelHeader";
import { StatusGlyph } from "../../../components/ui/StatusGlyph/StatusGlyph";
import { TreeRow } from "../../../components/ui/TreeRow/TreeRow";
import { cx } from "../../../lib/cx";
import { folderKey, mods } from "../../../lib/keys";
import { clickSelect, EMPTY_SELECTION, moveSelect, selectAll, type Selection } from "../../../lib/multiSelect";
import { entryStatus, splitStatus, useCommitStore, type ListId } from "../../../store/commitStore";
import { useStatusStore } from "../../../store/statusStore";
import { useTreeMode } from "../../../store/treeModeStore";
import { Stats } from "../ChangedFileList/ChangedFileList";
import { buildFileTree, flattenTree, hiddenSlot, type TreeLine } from "../ChangedFileList/fileTree";
import s from "./CommitPanel.module.css";
import { FileContextMenu, type FileMenuState } from "./FileContextMenu";
import { stageTarget } from "./stageTarget";

/** `--row-h`; the virtualizer needs the number, and the rule below pins the same value. */
const ROW_H = 26;
const OVERSCAN = 10;

const NONE: ReadonlySet<string> = new Set();

/** Why every button here is dead while a mutation runs, like the toolbar's. */
const BUSY = "Operation in progress";

/** Unstaged (+ Stage all) over Staged (+ Unstage all); each a multi-select listbox, or a tree. */
export function FilesColumn() {
  const [tree, toggleTree] = useTreeMode();
  return (
    <div className={s.col}>
      <UnstagedFiles tree={tree} onToggleTree={toggleTree} />
      <StagedFiles tree={tree} headerClassName={s.stagedHeader} />
    </div>
  );
}

/**
 * What a header's button acts on: the selection, when this list owns a real multi-selection, else
 * `null` for "the whole list". The two lists share one selection and `list` says which owns it, so
 * at most one of the two headers is ever in "selected" mode.
 *
 * Two or more, not one: `syncWithStatus` re-seeds the selection onto the first row after every
 * refresh, so a single selected row is the resting state — flipping on one would hide the "all"
 * action for good. A lone file already has Enter, double-click and the row's own +/−.
 *
 * Intersected with `entries` because the two stores are a render apart: `useCommitSync` prunes the
 * selection in an effect, so after a refresh this runs once with fresh entries and a stale selection.
 */
function useSelectedTarget(list: ListId, entries: StatusEntry[]): string[] | null {
  const owns = useCommitStore((st) => st.list === list);
  const selected = useCommitStore((st) => st.selected);
  return useMemo(() => {
    if (!owns) return null;
    const inList = new Set(entries.map((e) => e.path));
    const chosen = selected.filter((p) => inList.has(p));
    return chosen.length > 1 ? chosen : null;
  }, [owns, selected, entries]);
}

/**
 * Ends selected mode once a header's "… selected" action is done. What it acted on has left the
 * list, but a conflict it skipped has not: a surviving multi-selection would leave the header on a
 * dead "Stage selected" while the stageable files below it have no whole-list action to reach them
 * with. One selected row is the resting state (`syncWithStatus` seeds it after every refresh), so
 * keep the first survivor — or leave it to that seeding when nothing survived.
 */
function reseed(list: ListId) {
  const { selected, select } = useCommitStore.getState();
  const first = selected[0];
  if (first !== undefined) select(list, { selected: [first], anchor: first });
}

/** Unstaged header (tree toggle, count, Stage all / Stage selected) + list. */
export function UnstagedFiles({ tree, onToggleTree }: { tree: boolean; onToggleTree: () => void }) {
  const status = useStatusStore((st) => st.status);
  const entries = useMemo(() => splitStatus(status).unstaged, [status]);
  const busy = useCommitStore((st) => st.busy);
  const stage = useCommitStore((st) => st.stage);
  const selectedTarget = useSelectedTarget("unstaged", entries);
  // Stage all and Stage selected are both bulk actions, so both skip conflicts (see `stageTarget`).
  const { target, note } = stageTarget("unstaged", entries, selectedTarget ?? entries.map((e) => e.path), { bulk: true, where: selectedTarget ? "you selected" : "here" });

  return (
    <div className={s.col}>
      <PanelHeader
        icon={<File size={14} aria-hidden />}
        title="Unstaged"
        after={
          /* Beside the title, not with the right-aligned actions; the icon shows the view a click switches to. */
          <IconButton label={tree ? "Show as list" : "Show as tree"} onClick={onToggleTree}>
            {tree ? <Rows2 size={16} aria-hidden /> : <FolderTree size={16} aria-hidden />}
          </IconButton>
        }
      >
        <Badge>{entries.length}</Badge>
        <Button
          size="sm"
          className={s.headerBtn}
          disabled={busy || target.length === 0}
          /* A disabled title is hoverable (`DisabledHint`), so it says why the button is dead: while
             a mutation runs that is the mutation, whatever the conflicts in the list would have said. */
          title={busy ? BUSY : note}
          onClick={() =>
            void stage(target).then(() => {
              if (selectedTarget) reseed("unstaged");
            })
          }
        >
          {selectedTarget ? "Stage selected" : "Stage all"}
        </Button>
      </PanelHeader>
      <FileList list="unstaged" entries={entries} tree={tree} />
    </div>
  );
}

/** Staged header (count, Unstage all / Unstage selected) + list. */
export function StagedFiles({ tree, headerClassName }: { tree: boolean; headerClassName?: string }) {
  const status = useStatusStore((st) => st.status);
  const entries = useMemo(() => splitStatus(status).staged, [status]);
  const amend = useCommitStore((st) => st.amend);
  const busy = useCommitStore((st) => st.busy);
  const unstage = useCommitStore((st) => st.unstage);
  const selectedTarget = useSelectedTarget("staged", entries);
  // No conflict filter, unlike Stage all: an unmerged path reports CONFLICTED and no INDEX_* bit, so
  // it never carries an `index` status and `splitStatus` never puts it in this list. There is
  // nothing here for a filter to skip.
  const target = selectedTarget ?? entries.map((e) => e.path);
  return (
    <div className={s.col}>
      <PanelHeader className={headerClassName} icon={<Check size={14} aria-hidden />} title={amend ? "Staged (amending)" : "Staged"}>
        <Badge>{entries.length}</Badge>
        <Button
          size="sm"
          className={s.headerBtn}
          disabled={busy || target.length === 0}
          onClick={() =>
            void unstage(target).then(() => {
              if (selectedTarget) reseed("staged");
            })
          }
        >
          {selectedTarget ? "Unstage selected" : "Unstage all"}
        </Button>
      </PanelHeader>
      <FileList list="staged" entries={entries} tree={tree} />
    </div>
  );
}

/** Flat mode has no folders and shows full paths; `depth` is what indents a tree row. */
type Row = TreeLine<StatusEntry> | { kind: "file"; file: StatusEntry; label: string; depth: undefined };

function FileList({ list, entries, tree }: { list: ListId; entries: StatusEntry[]; tree: boolean }) {
  const active = useCommitStore((st) => st.list === list);
  const selected = useCommitStore((st) => st.selected);
  const anchor = useCommitStore((st) => st.anchor);
  const stats = useCommitStore((st) => st.stats[list]);
  const busy = useCommitStore((st) => st.busy);
  const select = useCommitStore((st) => st.select);
  const setOrder = useCommitStore((st) => st.setOrder);
  const stage = useCommitStore((st) => st.stage);
  const unstage = useCommitStore((st) => st.unstage);
  const discard = useCommitStore((st) => st.discard);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<FileMenuState | null>(null);

  const rowId = useId();
  const nodes = useMemo(() => (tree ? buildFileTree(entries) : null), [tree, entries]);
  const rows = useMemo<Row[]>(
    () => (nodes ? flattenTree(nodes, collapsed) : entries.map((e) => ({ kind: "file", file: e, label: e.path, depth: undefined }))),
    [nodes, entries, collapsed],
  );
  // Every file in display order: the selection's order (Ctrl+A takes them all, collapsed or not) and
  // where the store lands when the focused row vanishes.
  const all = useMemo(() => (nodes ? filePaths(flattenTree(nodes, NONE)) : entries.map((e) => e.path)), [nodes, entries]);
  // The files on screen — what ↑/↓ and Shift ranges walk (a collapsed folder's are skipped).
  const visible = useMemo(() => filePaths(rows), [rows]);
  const sel: Selection = active ? { selected, anchor } : EMPTY_SELECTION;
  const anchorRow = active && anchor ? rows.findIndex((r) => r.kind === "file" && r.file.path === anchor) : -1;
  // An anchor inside a collapsed folder: ↑/↓ resume from that folder's row.
  const hiddenAt = anchorRow < 0 && sel.anchor ? hiddenSlot(rows, sel.anchor) : -1;

  useEffect(() => setOrder(list, all), [list, all, setOrder]);
  // The menu's paths are a snapshot of the selection: once the list itself changes (a background
  // refresh re-prunes the selection onto other files) they name rows the user never right-clicked.
  // Keyed on what the menu reads, not on `entries`' identity: a refresh that changes nothing at all
  // (a save by another tool) rebuilds the array and must not close the menu under the pointer.
  const signature = entries.map((e) => `${e.path} ${entryStatus(list, e)}`).join("\n");
  useEffect(() => setMenu(null), [signature]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: OVERSCAN,
  });

  // Staging / unstaging / discarding unmounts the rows it acted on, and the focus goes with them
  // when it sat on one (a row's own +/− button): Enter would leave it on `<body>`. `held` is what
  // says the loss is this list's to repair — a background refresh must not grab an idle focus.
  const held = useRef(false);
  const hadRows = useRef(entries.length > 0);
  useEffect(() => {
    const root = scrollRef.current;
    const had = hadRows.current;
    hadRows.current = entries.length > 0;
    if (!held.current || !root) return;
    // Nothing left to focus here, and an empty list answers no keys: `syncWithStatus` has handed the
    // selection to the other list, so the focus goes there. Only when this list just emptied — a
    // list the user focused while it was already empty keeps the focus where they put it.
    if (entries.length === 0) {
      if (!had) return;
      held.current = false;
      siblingList(root, list === "unstaged" ? "Staged files" : "Unstaged files")?.focus();
      return;
    }
    if (!document.activeElement || document.activeElement === document.body) root.focus();
  }, [rows, entries.length, list]);

  // Keep the focused row in view — only that one; the rest never scroll themselves.
  const scrollToIndex = virtualizer.scrollToIndex;
  useEffect(() => {
    if (anchorRow >= 0) scrollToIndex(anchorRow, { align: "auto" });
  }, [anchorRow, scrollToIndex]);

  /** The folder row at `path` — a compacted one stands for its whole `chain`. */
  const folderRow = (path: string) => rows.find((r) => r.kind === "folder" && r.path === path);

  // Keyed by the path that was clicked, and cleared along the whole chain: after a compaction the
  // row on screen may be collapsed by an ancestor's key, and only removing that one reopens it.
  const toggleFolder = (chain: string[]) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (chain.some((p) => next.has(p))) chain.forEach((p) => next.delete(p));
      else next.add(chain[chain.length - 1]);
      return next;
    });

  function act(ps: string[]) {
    if (ps.length === 0) return;
    void (list === "unstaged" ? stage(ps) : unstage(ps));
  }

  // A set, not a `find`: every visible folder row asks for each file under it on every render.
  const conflictedPaths = useMemo(() => new Set(entries.filter((e) => e.conflicted).map((e) => e.path)), [entries]);
  const conflicted = (p: string) => conflictedPaths.has(p);
  /** Enter, double-click and the menu act on the rows they were pointed at, so a lone one stages (see `stageTarget`). */
  const stageable = (ps: string[]) => stageTarget(list, entries, ps).target;
  /** A conflicted file has no single version to go back to: Discard skips them, the way Stage all does. */
  const discardable = (ps: string[]) => ps.filter((p) => !conflicted(p));
  /** Every file under a folder row: a compacted chain keeps the deepest folder's path, a real prefix of them all. */
  const under = (folder: string) => all.filter((p) => p.startsWith(folder + "/"));
  /** What a folder row's own +/− acts on — one closure so the render and the click can't drift apart. */
  const folderTarget = (folder: string) => stageTarget(list, entries, under(folder), { bulk: true, where: "in this folder" });

  // One delegated listener per list keeps every `FileRow` prop stable, so `memo` actually skips rows.
  function onClick(e: MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>("[data-path], [data-folder]");
    if (!row) return;
    if (row.dataset.folder !== undefined) {
      // The only button beside the folder row itself is its Stage / Unstage folder action.
      if (target.closest("[data-act]")) {
        if (!busy) act(folderTarget(row.dataset.folder).target);
        return;
      }
      const folder = folderRow(row.dataset.folder);
      toggleFolder(folder?.kind === "folder" ? folder.chain : [row.dataset.folder]);
      return;
    }
    const path = row.dataset.path;
    if (!path) return;
    // The only button in a file row is its Stage / Unstage action.
    if (target.closest("button")) {
      if (!busy) act([path]);
      return;
    }
    select(list, clickSelect(all, sel, path, mods(e), visible));
  }

  /**
   * The menu acts on the row it was opened over, so a row outside the selection becomes the
   * selection first — and the paths are snapshotted here, not read back while the menu is up.
   */
  function openMenu(path: string, at: { x: number; y: number }) {
    const inSelection = sel.selected.includes(path);
    if (!inSelection) select(list, { selected: [path], anchor: path });
    setMenu({ at, paths: inSelection ? sel.selected : [path] });
  }

  function onContextMenu(e: MouseEvent<HTMLDivElement>) {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-path], [data-folder]");
    if (!row) return;
    const at = { x: e.clientX, y: e.clientY };
    // A folder's menu is its files' menu, on the same contract as `openMenu`: the rows it names
    // become the selection, and it acts on that snapshot.
    if (row.dataset.folder !== undefined) {
      const ps = under(row.dataset.folder);
      if (ps.length === 0) return;
      e.preventDefault();
      select(list, { selected: ps, anchor: ps[0] });
      setMenu({ at, paths: ps });
      return;
    }
    const path = row.dataset.path;
    if (!path) return;
    e.preventDefault();
    openMenu(path, at);
  }

  function onDoubleClick(e: MouseEvent<HTMLDivElement>) {
    if (busy || (e.target as HTMLElement).closest("[data-folder]")) return;
    act(stageable(sel.selected));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (entries.length === 0) return;
    // A clicked folder row holds focus (it is a button): Enter / Space toggle it, ← collapses, → expands —
    // none of them stage. Other keys fall through to the list.
    const folder = (e.target as HTMLElement).closest<HTMLElement>("[data-folder]")?.dataset.folder;
    const row = folder === undefined ? undefined : folderRow(folder);
    if (folder !== undefined && row?.kind === "folder" && folderKey(e.key, !row.expanded)) {
      toggleFolder(row.chain);
      e.preventDefault();
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        select(list, moveSelect(visible, sel, 1, hiddenAt));
        break;
      case "ArrowUp":
        select(list, moveSelect(visible, sel, -1, hiddenAt));
        break;
      case "Home":
        select(list, moveSelect(visible, sel, -Infinity));
        break;
      case "End":
        select(list, moveSelect(visible, sel, Infinity));
        break;
      case "a":
      case "A":
        if (!(e.ctrlKey || e.metaKey)) return;
        select(list, selectAll(all, sel));
        // From a focused folder row: the next Enter should act on the selection, not toggle the folder.
        e.currentTarget.focus();
        break;
      case "Enter":
        if (busy) return;
        act(stageable(sel.selected));
        break;
      case "Delete": {
        // Like the menu item: the conflicted files in the selection are skipped, not the whole action.
        if (busy || list !== "unstaged") return;
        const ps = discardable(sel.selected);
        if (ps.length === 0) return;
        void discard(ps);
        break;
      }
      case "F10":
      case "ContextMenu": {
        if (e.key === "F10" && !e.shiftKey) return;
        // The focused row, or the first one on screen in a list that has never been clicked.
        const path = sel.anchor ?? visible[0];
        if (path === undefined) return;
        // Below that row, found by walking the mounted rows — a path is not a safe selector. Inside a
        // collapsed folder it is not mounted at all: the list's own top-left corner stands in.
        const el = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-path]")).find((r) => r.dataset.path === path);
        const r = (el ?? e.currentTarget).getBoundingClientRect();
        openMenu(path, el ? { x: r.left + 8, y: r.bottom } : { x: r.left + 8, y: r.top + 8 });
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  }

  return (
    <div
      ref={scrollRef}
      /* The 2px accent bar is a multi-selection affordance (style guide §3 ListRow), not a single-row one. */
      className={cx(s.list, sel.selected.length > 1 && s.multi)}
      // A folder row is a `treeitem`, not an `option`: tree mode can't be a listbox.
      role={tree ? "tree" : "listbox"}
      aria-multiselectable
      aria-label={list === "unstaged" ? "Unstaged files" : "Staged files"}
      aria-activedescendant={anchorRow >= 0 ? `${rowId}-${anchorRow}` : undefined}
      tabIndex={0}
      onFocus={() => (held.current = true)}
      onBlur={(e) => {
        if (e.relatedTarget) {
          if (!e.currentTarget.contains(e.relatedTarget)) held.current = false;
          return;
        }
        // No `relatedTarget`: either a row was removed under the focus — this list's loss to repair —
        // or the click landed on something unfocusable (a header, the panel background) and the focus
        // is idle from here on. A removed row is out of the document by the next microtask.
        const target = e.target;
        void Promise.resolve().then(() => {
          // A row button disabled while the operation runs blurs this way too, and its row goes a
          // moment later: that loss is ours as well.
          if (target.isConnected && !(target as HTMLElement & { disabled?: boolean }).disabled) held.current = false;
        });
      }}
      onKeyDown={onKeyDown}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
    >
      {entries.length === 0 ? (
        <div className={s.empty}>{list === "unstaged" ? "No unstaged changes" : "Nothing staged"}</div>
      ) : (
        <div className={s.rows} style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            const id = `${rowId}-${item.index}`;
            // Keyed by kind: a deleted file `a` and an untracked `a/b` put a file and a folder at the same path.
            if (row.kind === "folder") {
              const { target, note } = folderTarget(row.path);
              return (
                /* `TreeRow` is a button, so its Stage / Unstage action sits beside it, not inside;
                   `data-folder` is on the wrapper so `closest` resolves from the row and the action alike. */
                <div key={`d:${row.path}`} className={cx(s.vrow, s.folderLine)} style={{ transform: `translateY(${item.start}px)` }} data-folder={row.path}>
                  <TreeRow
                    id={id}
                    role="treeitem"
                    aria-level={row.depth + 1}
                    tabIndex={-1}
                    className={s.treeRow}
                    depth={row.depth}
                    expanded={row.expanded}
                    icon={<Folder size={14} aria-hidden />}
                    /* A compacted chain reads as `a / b / c`, ellipsized at the start like a file row;
                       the tooltip keeps the real path. */
                    label={
                      <span className={s.folder}>
                        <bdi dir="ltr">{row.name.split("/").join(" / ")}</bdi>
                      </span>
                    }
                    title={row.path}
                  />
                  <IconButton
                    className={s.action}
                    label={list === "unstaged" ? "Stage folder" : "Unstage folder"}
                    disabled={busy || target.length === 0}
                    title={busy ? BUSY : note}
                    tabIndex={-1}
                    data-act=""
                    /* Mouse-only, like a file row's, but a child of the tree rather than of a treeitem: hidden from the tree's outline. */
                    aria-hidden
                  >
                    {list === "unstaged" ? <Plus size={16} aria-hidden /> : <Minus size={16} aria-hidden />}
                  </IconButton>
                </div>
              );
            }
            const e = row.file;
            return (
              <FileRow
                key={`f:${e.path}`}
                id={id}
                top={item.start}
                list={list}
                entry={e}
                label={row.label}
                depth={row.depth}
                stat={stats[e.path]}
                selected={active && selected.includes(e.path)}
                anchor={active && anchor === e.path}
                busy={busy}
              />
            );
          })}
        </div>
      )}
      <FileContextMenu list={list} paths={menu?.paths ?? []} entries={entries} menu={menu} onClose={() => setMenu(null)} act={act} discard={(ps) => void discard(ps)} />
    </div>
  );
}

const filePaths = (rows: Row[]) => rows.flatMap((r) => (r.kind === "file" ? [r.file.path] : []));

/** The other list of the same mount — the panel and the commit dialog each have their own pair. */
function siblingList(root: HTMLElement, label: string): HTMLElement | null {
  for (let el = root.parentElement; el; el = el.parentElement) {
    const other = el.querySelector<HTMLElement>(`[aria-label="${label}"]`);
    if (other) return other;
  }
  return null;
}

interface FileRowProps {
  id: string;
  top: number;
  list: ListId;
  entry: StatusEntry;
  /** Leaf name in a tree, full path in a flat list. */
  label: string;
  /** Tree mode: `treeitem` indented by `depth`. Flat mode: `option`. */
  depth: number | undefined;
  stat?: FileChange;
  selected: boolean;
  anchor: boolean;
  busy: boolean;
}

const FileRow = memo(function FileRow({ id, top, list, entry, label, depth, stat, selected, anchor, busy }: FileRowProps) {
  const full = entry.oldPath ? `${entry.oldPath} → ${entry.path}` : entry.path;
  const tree = depth !== undefined;
  // Clicks are handled by the list (delegation): the row only carries the data the handler reads.
  const stop = useCallback((e: MouseEvent) => e.stopPropagation(), []);
  return (
    <div
      id={id}
      role={tree ? "treeitem" : "option"}
      aria-selected={selected}
      aria-level={tree ? depth + 1 : undefined}
      data-path={entry.path}
      className={cx(s.row, s.vrow, tree && s.treeRow, selected && s.selected, anchor && s.anchor)}
      style={{ transform: `translateY(${top}px)`, ...(tree ? ({ "--d": depth } as CSSProperties) : null) }}
      title={full}
    >
      {tree && <span className={s.tw} />}
      <StatusGlyph status={entryStatus(list, entry)} />
      {/* rtl + isolated ltr content: the ellipsis lands at the start so the file name stays visible */}
      <span className={s.path}>
        <bdi dir="ltr">{tree ? label : full}</bdi>
      </span>
      {stat && <Stats additions={stat.additions} deletions={stat.deletions} />}
      <IconButton
        className={s.action}
        label={list === "unstaged" ? "Stage" : "Unstage"}
        disabled={busy}
        tabIndex={-1}
        onDoubleClick={stop}
      >
        {list === "unstaged" ? <Plus size={16} aria-hidden /> : <Minus size={16} aria-hidden />}
      </IconButton>
    </div>
  );
});
