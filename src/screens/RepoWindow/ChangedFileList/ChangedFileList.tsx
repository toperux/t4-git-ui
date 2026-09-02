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
import { useDiffStore } from "../../../store/diffStore";
import { buildFileTree, flattenTree, type TreeLine } from "./fileTree";
import s from "./ChangedFileList.module.css";

/** `--row-h`; the virtualizer needs the number. */
const ROW_H = 26;
const OVERSCAN = 10;

/** One rendered line: a folder in tree mode, or a file (the only selectable kind); flat rows carry no depth. */
type Row = TreeLine<FileChange> | { kind: "file"; file: FileChange; label: string; depth: undefined };

export function ChangedFileList() {
  const oid = useDiffStore((st) => st.oid);
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
  // Files in display order — the ↑/↓ ring.
  const visible = useMemo(() => rows.flatMap((r) => (r.kind === "file" ? [r.file] : [])), [rows]);
  const selectedRow = rows.findIndex((r) => r.kind === "file" && r.file.path === selectedPath);

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

  const toggleFolder = (path: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(path)) next.delete(path);
      else next.add(path);
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
    if (visible.length === 0) return;
    const cur = visible.findIndex((f) => f.path === selectedPath);
    let next: number;
    switch (e.key) {
      case "ArrowDown":
        next = Math.min(cur + 1, visible.length - 1);
        break;
      case "ArrowUp":
        next = Math.max(cur - 1, 0);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = visible.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    selectPath(visible[next].path);
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
      {!oid ? (
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
              if (row.kind === "folder")
                return (
                  <TreeRow
                    key={row.path}
                    id={id}
                    role="treeitem"
                    aria-level={row.depth + 1}
                    tabIndex={-1}
                    className={s.vrow}
                    style={{ transform: `translateY(${item.start}px)` }}
                    data-folder={row.path}
                    depth={row.depth}
                    expanded={row.expanded}
                    icon={<Folder size={14} aria-hidden />}
                    label={row.name}
                    title={row.path}
                  />
                );
              return (
                <FileRow
                  key={row.file.path}
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
