import { useVirtualizer } from "@tanstack/react-virtual";
import { File, Folder, Rows2, Search } from "lucide-react";
import { memo, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import type { FileChange, TreeEntry } from "../../../api/types";
import { Banner } from "../../../components/ui/Banner/Banner";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState";
import { IconButton } from "../../../components/ui/IconButton/IconButton";
import { Input } from "../../../components/ui/Input/Input";
import { PanelHeader } from "../../../components/ui/PanelHeader/PanelHeader";
import { Progress } from "../../../components/ui/Progress/Progress";
import { StatusGlyph } from "../../../components/ui/StatusGlyph/StatusGlyph";
import { TreeRow } from "../../../components/ui/TreeRow/TreeRow";
import { cx } from "../../../lib/cx";
import { folderKey } from "../../../lib/keys";
import { moveSelect, type Selection } from "../../../lib/multiSelect";
import { useDiffStore } from "../../../store/diffStore";
import { buildFileTree, flattenTree, hiddenSlot, type TreeLine } from "./fileTree";
import s from "./ChangedFileList.module.css";

/** `--row-h`; the virtualizer needs the number. */
const ROW_H = 26;
const OVERSCAN = 10;
/** Rows a filter shows before the rest becomes one "N more" line. */
const FILTER_CAP = 2000;
const NO_ITEMS: never[] = [];

/** A row's file: a changed one on the Changes tab, a tree entry on Files. */
type Item = FileChange | TreeEntry;

/** One rendered line: a folder in tree mode, or a file (the only selectable kind); flat rows carry no depth. */
type Row = TreeLine<Item> | { kind: "file"; file: Item; label: string; depth: undefined };

/** `1.2 kB` — SI steps, one decimal: a 26px row has no space for more. */
function fileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["kB", "MB", "GB"];
  let n = bytes / 1000;
  let i = 0;
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000;
    i += 1;
  }
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

/** `autoFocus`: take the focus on mount, so the diff dialog opens on the list and not its Close button. */
export function ChangedFileList({ autoFocus }: { autoFocus?: boolean }) {
  const target = useDiffStore((st) => st.target);
  const files = useDiffStore((st) => st.files);
  const selectedPath = useDiffStore((st) => st.selectedPath);
  const selectPath = useDiffStore((st) => st.selectPath);
  const mode = useDiffStore((st) => st.fileListMode);
  const setMode = useDiffStore((st) => st.setFileListMode);
  const tab = useDiffStore((st) => st.tab);
  const setTab = useDiffStore((st) => st.setTab);
  const tree = useDiffStore((st) => st.tree);
  const treeFilter = useDiffStore((st) => st.treeFilter);
  const setTreeFilter = useDiffStore((st) => st.setTreeFilter);
  const treeSelectedPath = useDiffStore((st) => st.treeSelectedPath);
  const selectTreePath = useDiffStore((st) => st.selectTreePath);

  const filesTab = tab === "files";
  const loading = useDiffStore((st) => (filesTab ? st.treeLoading : st.filesLoading));
  const error = useDiffStore((st) => (filesTab ? st.treeError : st.filesError));
  // Two folder states: the trees differ, and so do their defaults — the Changes tab starts
  // expanded and remembers what was closed, the Files tab starts collapsed and remembers what was
  // opened (a commit's whole tree expanded is thousands of rows).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const rowId = useId();

  const items: Item[] = (filesTab ? tree : files) ?? NO_ITEMS;
  const selected = filesTab ? treeSelectedPath : selectedPath;
  const select = filesTab ? selectTreePath : selectPath;
  const needle = filesTab ? treeFilter.trim().toLowerCase() : "";
  // A filter flattens to the matching files: folder rows would mostly hold nothing.
  const matches = useMemo(() => (needle ? items.filter((f) => f.path.toLowerCase().includes(needle)) : null), [needle, items]);
  const treeView = mode === "tree" && !matches;

  const rows = useMemo<Row[]>(() => {
    const flat = (list: Item[]): Row[] => list.map((f) => ({ kind: "file", file: f, label: f.path, depth: undefined }));
    // Capped: a one-letter filter over a big tree is thousands of rows nobody reads, and the count
    // of the rest is on the banner under the list.
    if (matches) return flat(matches.slice(0, FILTER_CAP));
    if (!treeView) return flat(items);
    // `flattenTree` asks "is this folder collapsed?", which on the Files tab is the negation of its
    // own state.
    const folded = filesTab ? { has: (p: string) => !opened.has(p) } : collapsed;
    return flattenTree(buildFileTree(items), folded);
  }, [matches, treeView, items, filesTab, opened, collapsed]);

  // The files on screen — the ↑/↓ ring (a collapsed folder's are skipped).
  const visible = useMemo(() => rows.flatMap((r) => (r.kind === "file" ? [r.file.path] : [])), [rows]);
  const selectedRow = rows.findIndex((r) => r.kind === "file" && r.file.path === selected);
  // A selection inside a collapsed folder: ↑/↓ resume from that folder's row.
  const hiddenAt = selectedRow < 0 && selected ? hiddenSlot(rows, selected) : -1;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: OVERSCAN,
  });
  // Only the selected row is kept in view; the others never scroll themselves.
  const scrollToIndex = virtualizer.scrollToIndex;
  useEffect(() => {
    if (selectedRow >= 0) scrollToIndex(selectedRow, { align: "auto" });
  }, [selectedRow, scrollToIndex]);
  // Another commit (or compare pair), or the other tab, is another list: it starts at the top, or
  // row 0 is off-screen.
  useEffect(() => {
    virtualizer.scrollToOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, tab]);
  // Runs before the dialog's own fallback (a child's effect goes first), so it keeps the focus.
  useEffect(() => {
    if (autoFocus) scrollRef.current?.focus();
  }, [autoFocus]);

  /** The folder row at `path` — a compacted one stands for its whole `chain`. */
  const folderRow = (path: string) => rows.find((r) => r.kind === "folder" && r.path === path);

  /** The folder row holding `path`: the deepest one whose path is a prefix of it (ancestors come first). */
  const parentRow = (path: string) => rows.filter((r) => r.kind === "folder" && path.startsWith(r.path + "/")).pop();

  /**
   * Flips the folder at `path`. Keyed by the path that was clicked and applied to the whole chain:
   * a compacted row stands for every folder in it, and a key stored against yesterday's shape must
   * still name this row (staging a file re-compacts the tree). Collapsing the Changes tab's tree
   * needs one member in the set — `flattenTree` folds on any of them — while opening the Files
   * tab's needs all of them, since there every member must say "not collapsed".
   */
  const toggleFolder = (path: string) => {
    const row = folderRow(path);
    const chain = row?.kind === "folder" ? row.chain : [path];
    const flip = (was: Set<string>, all: boolean) => {
      const next = new Set(was);
      if (all ? chain.every((p) => next.has(p)) : chain.some((p) => next.has(p))) chain.forEach((p) => next.delete(p));
      else if (all) chain.forEach((p) => next.add(p));
      else next.add(chain[chain.length - 1]);
      return next;
    };
    if (filesTab) setOpened((o) => flip(o, true));
    else setCollapsed((c) => flip(c, false));
  };

  // Delegated: every row keeps stable props, so `memo` skips the ones that didn't change.
  function onClick(e: MouseEvent<HTMLDivElement>) {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-path], [data-folder]");
    if (!el) return;
    if (el.dataset.folder !== undefined) toggleFolder(el.dataset.folder);
    else if (el.dataset.path !== undefined) select(el.dataset.path);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // A clicked folder row holds focus (it is a button): Enter / Space toggle it, ← collapses, → expands.
    // Ahead of the empty-list guard — with every file inside one collapsed folder, → is the way back out.
    const folder = (e.target as HTMLElement).closest<HTMLElement>("[data-folder]")?.dataset.folder;
    const row = folder === undefined ? undefined : folderRow(folder);
    if (folder !== undefined && row?.kind === "folder" && folderKey(e.key, !row.expanded)) {
      toggleFolder(folder);
      e.preventDefault();
      return;
    }
    // On the container itself: ↑/↓ move the selection while the focus stays here, so a folder row is
    // only ever focused after a click — ←/→ fold the folder the selected file sits in instead.
    if (folder === undefined && selected && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const parent = parentRow(selected);
      if (parent?.kind === "folder" && folderKey(e.key, !parent.expanded)) {
        toggleFolder(parent.path);
        e.preventDefault();
      }
      return;
    }
    if (visible.length === 0) return;
    const sel: Selection = { selected: selected ? [selected] : [], anchor: selected };
    let next: Selection;
    switch (e.key) {
      case "ArrowDown":
        next = moveSelect(visible, sel, 1, hiddenAt);
        break;
      case "ArrowUp":
        next = moveSelect(visible, sel, -1, hiddenAt);
        break;
      case "Home":
        next = moveSelect(visible, sel, -Infinity);
        break;
      case "End":
        next = moveSelect(visible, sel, Infinity);
        break;
      default:
        return;
    }
    e.preventDefault();
    if (next.anchor) select(next.anchor);
  }

  const n = items.length;
  const title = filesTab ? (n === 0 ? "Files" : `${n} file${n === 1 ? "" : "s"}`) : n === 0 ? "Files" : `${n} file${n === 1 ? "" : "s"} changed`;
  const empty = filesTab ? "No tracked files" : "No changed files";

  return (
    <div className={s.pane}>
      <PanelHeader icon={<File size={14} aria-hidden />} title={title}>
        <FileTabs tab={tab} setTab={setTab} />
        <IconButton label="Flat list" on={mode === "flat"} onClick={() => setMode("flat")}>
          <Rows2 size={16} aria-hidden />
        </IconButton>
        <IconButton label="Tree" on={mode === "tree"} disabled={!!matches} title={matches ? "The filter shows matching files flat" : undefined} onClick={() => setMode("tree")}>
          <Folder size={16} aria-hidden />
        </IconButton>
      </PanelHeader>
      {/* Its own row: the dialog's list panel goes down to 180px, where tabs, toggles and a field do not fit. */}
      {filesTab && (
        <div className={s.filterRow}>
          <Input
            className={s.filter}
            icon={<Search size={14} aria-hidden />}
            aria-label="Filter files"
            placeholder="Filter files"
            value={treeFilter}
            onChange={(e) => setTreeFilter(e.target.value)}
          />
        </div>
      )}
      {loading && (
        <div className={cx(s.progress, filesTab && s.progressLow)}>
          <Progress thin label="Loading files" />
        </div>
      )}
      {!target ? (
        <EmptyState icon={<File size={24} aria-hidden />} title="No commit selected" />
      ) : error ? (
        <EmptyState title="Couldn't load files" hint={error} />
      ) : matches && matches.length === 0 ? (
        <EmptyState icon={<Search size={24} aria-hidden />} title="No matching files" hint={`Nothing matches “${treeFilter.trim()}”`} />
      ) : !loading && n === 0 ? (
        <EmptyState icon={<File size={24} aria-hidden />} title={empty} />
      ) : (
        <div
          ref={scrollRef}
          className={s.list}
          // A folder row is a `treeitem`, not an `option`: tree mode can't be a listbox.
          role={treeView ? "tree" : "listbox"}
          aria-label={filesTab ? "Files" : "Changed files"}
          aria-activedescendant={selectedRow >= 0 ? `${rowId}-${selectedRow}` : undefined}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onClick={onClick}
        >
          <div className={s.rows} style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              const id = `${rowId}-${item.index}`;
              // Keyed by kind: a deleted file `a` and an added `a/b` put a file and a folder at the same path.
              if (row.kind === "folder")
                return (
                  <TreeRow
                    key={`d:${row.path}`}
                    id={id}
                    role="treeitem"
                    aria-level={row.depth + 1}
                    tabIndex={-1}
                    className={cx(s.vrow, s.treeRow)}
                    style={{ transform: `translateY(${item.start}px)` }}
                    data-folder={row.path}
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
                );
              const props = { id, top: item.start, tree: treeView, label: row.label, depth: row.depth, selected: row.file.path === selected };
              return isEntry(row.file) ? (
                <EntryRow key={`f:${row.file.path}`} entry={row.file} {...props} />
              ) : (
                <FileRow key={`f:${row.file.path}`} file={row.file} {...props} />
              );
            })}
          </div>
        </div>
      )}
      {matches && matches.length > FILTER_CAP && <Banner kind="warning">{matches.length - FILTER_CAP} more matches — narrow the filter</Banner>}
    </div>
  );
}

/** A tree entry (Files tab) rather than a changed file — only the latter carries a status. */
const isEntry = (item: Item): item is TreeEntry => !("status" in item);

/** Changes | Files. ←/→ switch, as a tab strip is expected to. */
function FileTabs({ tab, setTab }: { tab: "changes" | "files"; setTab: (tab: "changes" | "files") => void }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = e.key === "ArrowRight" ? "files" : "changes";
    setTab(next);
    // The selected tab is the only tab stop, so the focus follows the selection onto it.
    e.currentTarget.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus();
  };
  return (
    <div className={s.tabs} role="tablist" aria-label="File list" onKeyDown={onKeyDown}>
      {(["changes", "files"] as const).map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          data-tab={k}
          aria-selected={tab === k}
          tabIndex={tab === k ? 0 : -1}
          className={cx(s.tab, tab === k && s.tabOn)}
          onClick={() => setTab(k)}
        >
          {k === "changes" ? "Changes" : "Files"}
        </button>
      ))}
    </div>
  );
}

interface RowProps {
  id: string;
  top: number;
  /** Tree mode: `treeitem` with a leaf name, indented by `depth`. Flat mode: `option` with the full path. */
  tree: boolean;
  label: string;
  depth: number | undefined;
  selected: boolean;
}

/** The shared row box: `data-path` for the delegated click, indent and roles per mode. */
function rowAttrs({ id, top, tree, depth, selected }: RowProps, path: string, title: string) {
  return {
    id,
    role: tree ? "treeitem" : "option",
    "aria-selected": selected,
    "aria-level": tree && depth !== undefined ? depth + 1 : undefined,
    "data-path": path,
    className: cx(s.row, s.vrow, tree && s.treeRow, selected && s.selected),
    style: { transform: `translateY(${top}px)`, ...(tree ? ({ "--d": depth } as CSSProperties) : null) },
    title,
  };
}

const FileRow = memo(function FileRow({ file, ...props }: RowProps & { file: FileChange }) {
  const full = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;
  return (
    <div {...rowAttrs(props, file.path, full)}>
      {props.tree && <span className={s.tw} />}
      <StatusGlyph status={file.status} />
      {/* rtl + isolated ltr content: the ellipsis lands at the start so the file name stays visible */}
      <span className={s.path}>
        <bdi dir="ltr">{props.tree ? props.label : full}</bdi>
      </span>
      <Stats additions={file.additions} deletions={file.deletions} />
    </div>
  );
});

/** Files tab: name and size, no status letter — nothing here changed. */
const EntryRow = memo(function EntryRow({ entry, ...props }: RowProps & { entry: TreeEntry }) {
  return (
    <div {...rowAttrs(props, entry.path, entry.path)}>
      {props.tree && <span className={s.tw} />}
      <span className={s.path}>
        <bdi dir="ltr">{props.tree ? props.label : entry.path}</bdi>
      </span>
      <span className={s.meta}>{entry.kind === "submodule" ? "submodule" : fileSize(entry.size)}</span>
    </div>
  );
});

/** `+N −M`, each only when non-zero. */
export function Stats({ additions, deletions, className }: { additions: number; deletions: number; className?: string }) {
  if (!additions && !deletions) return null;
  return (
    <span className={cx(s.meta, className)}>
      {additions > 0 && <span className={s.add}>+{additions}</span>}
      {deletions > 0 && <span className={s.del}>−{deletions}</span>}
    </span>
  );
}
