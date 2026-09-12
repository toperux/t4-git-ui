import { useVirtualizer } from "@tanstack/react-virtual";
import { File, Folder, Rows2 } from "lucide-react";
import { memo, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import type { FileChange } from "../../../api/types";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState";
import { IconButton } from "../../../components/ui/IconButton/IconButton";
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

/** One rendered line: a folder in tree mode, or a file (the only selectable kind); flat rows carry no depth. */
type Row = TreeLine<FileChange> | { kind: "file"; file: FileChange; label: string; depth: undefined };

/** `autoFocus`: take the focus on mount, so the diff dialog opens on the list and not its Close button. */
export function ChangedFileList({ autoFocus }: { autoFocus?: boolean }) {
  const target = useDiffStore((st) => st.target);
  const files = useDiffStore((st) => st.files);
  const loading = useDiffStore((st) => st.filesLoading);
  const error = useDiffStore((st) => st.filesError);
  const selectedPath = useDiffStore((st) => st.selectedPath);
  const mode = useDiffStore((st) => st.fileListMode);
  const selectPath = useDiffStore((st) => st.selectPath);
  const setMode = useDiffStore((st) => st.setFileListMode);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const rowId = useId();

  const rows = useMemo<Row[]>(
    () => (mode === "flat" ? files.map((f) => ({ kind: "file", file: f, label: f.path, depth: undefined })) : flattenTree(buildFileTree(files), collapsed)),
    [mode, files, collapsed],
  );
  // The files on screen — the ↑/↓ ring (a collapsed folder's are skipped).
  const visible = useMemo(() => rows.flatMap((r) => (r.kind === "file" ? [r.file.path] : [])), [rows]);
  const selectedRow = rows.findIndex((r) => r.kind === "file" && r.file.path === selectedPath);
  // A selection inside a collapsed folder: ↑/↓ resume from that folder's row.
  const hiddenAt = selectedRow < 0 && selectedPath ? hiddenSlot(rows, selectedPath) : -1;

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
  // Another commit (or compare pair) is another list: it starts at the top, or row 0 is off-screen.
  useEffect(() => {
    virtualizer.scrollToOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  // Runs before the dialog's own fallback (a child's effect goes first), so it keeps the focus.
  useEffect(() => {
    if (autoFocus) scrollRef.current?.focus();
  }, [autoFocus]);

  /** The folder row at `path` — a compacted one stands for its whole `chain`. */
  const folderRow = (path: string) => rows.find((r) => r.kind === "folder" && r.path === path);

  // Keyed by the path that was clicked, and cleared along the whole chain: a compacted row may be
  // collapsed by an ancestor's key, and only removing that one reopens it.
  const toggleFolder = (path: string) =>
    setCollapsed((c) => {
      const row = folderRow(path);
      const chain = row?.kind === "folder" ? row.chain : [path];
      const next = new Set(c);
      if (chain.some((p) => next.has(p))) chain.forEach((p) => next.delete(p));
      else next.add(chain[chain.length - 1]);
      return next;
    });

  // Delegated: every row keeps stable props, so `memo` skips the ones that didn't change.
  function onClick(e: MouseEvent<HTMLDivElement>) {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-path], [data-folder]");
    if (!el) return;
    if (el.dataset.folder !== undefined) toggleFolder(el.dataset.folder);
    else if (el.dataset.path !== undefined) selectPath(el.dataset.path);
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
    if (visible.length === 0) return;
    const sel: Selection = { selected: selectedPath ? [selectedPath] : [], anchor: selectedPath };
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
    if (next.anchor) selectPath(next.anchor);
  }

  const n = files.length;
  const title = n === 0 ? "Files" : `${n} file${n === 1 ? "" : "s"} changed`;
  const tree = mode === "tree";

  return (
    <div className={s.pane}>
      <PanelHeader icon={<File size={14} aria-hidden />} title={title}>
        <IconButton label="Flat list" on={mode === "flat"} onClick={() => setMode("flat")}>
          <Rows2 size={16} aria-hidden />
        </IconButton>
        <IconButton label="Tree" on={tree} onClick={() => setMode("tree")}>
          <Folder size={16} aria-hidden />
        </IconButton>
      </PanelHeader>
      {loading && (
        <div className={s.progress}>
          <Progress thin label="Loading files" />
        </div>
      )}
      {!target ? (
        <EmptyState icon={<File size={24} aria-hidden />} title="No commit selected" />
      ) : error ? (
        <EmptyState title="Couldn't load files" hint={error} />
      ) : !loading && n === 0 ? (
        <EmptyState icon={<File size={24} aria-hidden />} title="No changed files" />
      ) : (
        <div
          ref={scrollRef}
          className={s.list}
          // A folder row is a `treeitem`, not an `option`: tree mode can't be a listbox.
          role={tree ? "tree" : "listbox"}
          aria-label="Changed files"
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
              return (
                <FileRow
                  key={`f:${row.file.path}`}
                  id={id}
                  top={item.start}
                  tree={tree}
                  file={row.file}
                  label={row.label}
                  depth={row.depth}
                  selected={row.file.path === selectedPath}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface FileRowProps {
  id: string;
  top: number;
  /** Tree mode: `treeitem` with a leaf name, indented by `depth`. Flat mode: `option` with the full path. */
  tree: boolean;
  file: FileChange;
  label: string;
  depth: number | undefined;
  selected: boolean;
}

const FileRow = memo(function FileRow({ id, top, tree, file, label, depth, selected }: FileRowProps) {
  const full = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;
  return (
    <div
      id={id}
      role={tree ? "treeitem" : "option"}
      aria-selected={selected}
      aria-level={tree && depth !== undefined ? depth + 1 : undefined}
      data-path={file.path}
      className={cx(s.row, s.vrow, tree && s.treeRow, selected && s.selected)}
      style={{ transform: `translateY(${top}px)`, ...(tree ? ({ "--d": depth } as CSSProperties) : null) }}
      title={full}
    >
      {tree && <span className={s.tw} />}
      <StatusGlyph status={file.status} />
      {/* rtl + isolated ltr content: the ellipsis lands at the start so the file name stays visible */}
      <span className={s.path}>
        <bdi dir="ltr">{tree ? label : full}</bdi>
      </span>
      <Stats additions={file.additions} deletions={file.deletions} />
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
