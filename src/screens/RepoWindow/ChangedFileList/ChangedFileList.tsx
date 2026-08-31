import { File, Folder, Rows2 } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { FileChange } from "../../../api/types";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState";
import { IconButton } from "../../../components/ui/IconButton/IconButton";
import { PanelHeader } from "../../../components/ui/PanelHeader/PanelHeader";
import { Progress } from "../../../components/ui/Progress/Progress";
import { StatusGlyph } from "../../../components/ui/StatusGlyph/StatusGlyph";
import { TreeRow } from "../../../components/ui/TreeRow/TreeRow";
import { cx } from "../../../lib/cx";
import { useDiffStore } from "../../../store/diffStore";
import { buildFileTree, type FileNode } from "./fileTree";
import s from "./ChangedFileList.module.css";

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

  const tree = useMemo(() => (mode === "tree" ? buildFileTree(files) : []), [files, mode]);
  // Files in display order (collapsed folders skipped) — the ↑/↓ ring.
  const visible = useMemo(() => {
    if (mode === "flat") return files;
    const out: FileChange[] = [];
    const walk = (nodes: FileNode[]) => {
      for (const n of nodes) {
        if (n.file) out.push(n.file);
        else if (!collapsed.has(n.path)) walk(n.children);
      }
    };
    walk(tree);
    return out;
  }, [mode, files, tree, collapsed]);

  const toggleFolder = (path: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

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

  const renderTree = (nodes: FileNode[], depth: number): ReactNode =>
    nodes.map((node) =>
      node.file ? (
        <FileRow key={node.path} file={node.file} label={node.name} depth={depth} selected={node.path === selectedPath} onSelect={selectPath} />
      ) : (
        <div key={node.path} role="group" aria-label={node.name}>
          <TreeRow depth={depth} expanded={!collapsed.has(node.path)} icon={<Folder size={14} aria-hidden />} label={node.name} title={node.path} onClick={() => toggleFolder(node.path)} />
          {!collapsed.has(node.path) && renderTree(node.children, depth + 1)}
        </div>
      ),
    );

  return (
    <div className={s.pane}>
      <PanelHeader icon={<File size={14} aria-hidden />} title={title}>
        <IconButton label="Flat list" on={mode === "flat"} onClick={() => setMode("flat")}>
          <Rows2 size={14} aria-hidden />
        </IconButton>
        <IconButton label="Tree" on={mode === "tree"} onClick={() => setMode("tree")}>
          <Folder size={14} aria-hidden />
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
        <div className={s.list} role="listbox" aria-label="Changed files" tabIndex={0} onKeyDown={onKeyDown}>
          {mode === "flat"
            ? files.map((f) => <FileRow key={f.path} file={f} selected={f.path === selectedPath} onSelect={selectPath} />)
            : renderTree(tree, 0)}
        </div>
      )}
    </div>
  );
}

interface FileRowProps {
  file: FileChange;
  /** Tree mode: file name only, indented by `depth`. Flat mode: full path. */
  label?: string;
  depth?: number;
  selected: boolean;
  onSelect: (path: string) => void;
}

const FileRow = memo(function FileRow({ file, label, depth, selected, onSelect }: FileRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);
  const tree = depth !== undefined;
  const full = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;
  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      className={cx(s.row, tree && s.treeRow, selected && s.selected)}
      style={tree ? ({ "--d": depth } as CSSProperties) : undefined}
      title={full}
      onClick={() => onSelect(file.path)}
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
