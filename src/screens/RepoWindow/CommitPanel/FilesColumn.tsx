import { Check, File, Minus, Plus } from "lucide-react";
import { memo, useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent } from "react";
import type { FileChange, StatusEntry } from "../../../api/types";
import { Badge } from "../../../components/ui/Badge/Badge";
import { Button } from "../../../components/ui/Button/Button";
import { IconButton } from "../../../components/ui/IconButton/IconButton";
import { PanelHeader } from "../../../components/ui/PanelHeader/PanelHeader";
import { StatusGlyph } from "../../../components/ui/StatusGlyph/StatusGlyph";
import { cx } from "../../../lib/cx";
import { clickSelect, EMPTY_SELECTION, moveSelect, selectAll, type Mods, type Selection } from "../../../lib/multiSelect";
import { entryStatus, splitStatus, useCommitStore, type ListId } from "../../../store/commitStore";
import { useStatusStore } from "../../../store/statusStore";
import { Stats } from "../ChangedFileList/ChangedFileList";
import s from "./CommitPanel.module.css";

const CONFLICT_HINT = "Resolve conflicts first";

/** Unstaged (+ Stage all) over Staged (+ Unstage all); each a multi-select listbox. */
export function FilesColumn() {
  const status = useStatusStore((st) => st.status);
  const lists = useMemo(() => splitStatus(status), [status]);
  const amend = useCommitStore((st) => st.amend);
  const busy = useCommitStore((st) => st.busy);
  const stage = useCommitStore((st) => st.stage);
  const unstage = useCommitStore((st) => st.unstage);
  const stageable = lists.unstaged.filter((e) => !e.conflicted).map((e) => e.path);

  return (
    <div className={s.col}>
      <PanelHeader icon={<File size={14} aria-hidden />} title="Unstaged">
        <Badge>{lists.unstaged.length}</Badge>
        <Button size="sm" className={s.headerBtn} disabled={busy || stageable.length === 0} onClick={() => void stage(stageable)}>
          Stage all
        </Button>
      </PanelHeader>
      <FileList list="unstaged" entries={lists.unstaged} />
      <PanelHeader className={s.stagedHeader} icon={<Check size={14} aria-hidden />} title={amend ? "Staged (amending)" : "Staged"}>
        <Badge>{lists.staged.length}</Badge>
        <Button size="sm" className={s.headerBtn} disabled={busy || lists.staged.length === 0} onClick={() => void unstage(lists.staged.map((e) => e.path))}>
          Unstage all
        </Button>
      </PanelHeader>
      <FileList list="staged" entries={lists.staged} />
    </div>
  );
}

function FileList({ list, entries }: { list: ListId; entries: StatusEntry[] }) {
  const active = useCommitStore((st) => st.list === list);
  const selected = useCommitStore((st) => st.selected);
  const anchor = useCommitStore((st) => st.anchor);
  const stats = useCommitStore((st) => st.stats[list]);
  const busy = useCommitStore((st) => st.busy);
  const select = useCommitStore((st) => st.select);
  const stage = useCommitStore((st) => st.stage);
  const unstage = useCommitStore((st) => st.unstage);
  const discard = useCommitStore((st) => st.discard);

  const paths = entries.map((e) => e.path);
  const sel: Selection = active ? { selected, anchor } : EMPTY_SELECTION;
  const conflicted = (p: string) => list === "unstaged" && !!entries.find((e) => e.path === p)?.conflicted;

  function act(ps: string[]) {
    const targets = ps.filter((p) => !conflicted(p));
    if (targets.length === 0) return;
    void (list === "unstaged" ? stage(targets) : unstage(targets));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (entries.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        select(list, moveSelect(paths, sel, 1));
        break;
      case "ArrowUp":
        select(list, moveSelect(paths, sel, -1));
        break;
      case "Home":
        select(list, moveSelect(paths, sel, -Infinity));
        break;
      case "End":
        select(list, moveSelect(paths, sel, Infinity));
        break;
      case "a":
      case "A":
        if (!(e.ctrlKey || e.metaKey)) return;
        select(list, selectAll(paths, sel));
        break;
      case "Enter":
        if (busy) return;
        act(sel.selected);
        break;
      case "Delete":
        if (busy || list !== "unstaged" || sel.selected.length === 0) return;
        void discard(sel.selected);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  return (
    <div
      className={s.list}
      role="listbox"
      aria-multiselectable
      aria-label={list === "unstaged" ? "Unstaged files" : "Staged files"}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      {entries.length === 0 ? (
        <div className={s.empty}>{list === "unstaged" ? "No unstaged changes" : "Nothing staged"}</div>
      ) : (
        entries.map((e) => (
          <FileRow
            key={e.path}
            list={list}
            entry={e}
            stat={stats[e.path]}
            selected={active && selected.includes(e.path)}
            anchor={active && anchor === e.path}
            busy={busy}
            onClick={(p, mods) => select(list, clickSelect(paths, sel, p, mods))}
            onDoubleClick={() => !busy && act(sel.selected)}
            onAction={(p) => act([p])}
          />
        ))
      )}
    </div>
  );
}

interface FileRowProps {
  list: ListId;
  entry: StatusEntry;
  stat?: FileChange;
  selected: boolean;
  anchor: boolean;
  busy: boolean;
  onClick: (path: string, mods: Mods) => void;
  onDoubleClick: () => void;
  onAction: (path: string) => void;
}

const FileRow = memo(function FileRow({ list, entry, stat, selected, anchor, busy, onClick, onDoubleClick, onAction }: FileRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (anchor) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [anchor]);
  const conflicted = list === "unstaged" && entry.conflicted;
  const full = entry.oldPath ? `${entry.oldPath} → ${entry.path}` : entry.path;
  const mods = (e: MouseEvent) => ({ ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      aria-disabled={conflicted || undefined}
      className={cx(s.row, selected && s.selected, anchor && s.anchor)}
      title={conflicted ? CONFLICT_HINT : full}
      onClick={(e) => onClick(entry.path, mods(e))}
      onDoubleClick={conflicted ? undefined : onDoubleClick}
    >
      <StatusGlyph status={entryStatus(list, entry)} />
      {/* rtl + isolated ltr content: the ellipsis lands at the start so the file name stays visible */}
      <span className={s.path}>
        <bdi dir="ltr">{full}</bdi>
      </span>
      {stat && <Stats additions={stat.additions} deletions={stat.deletions} />}
      {!conflicted && (
        <IconButton
          className={s.action}
          label={list === "unstaged" ? "Stage" : "Unstage"}
          disabled={busy}
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onAction(entry.path);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {list === "unstaged" ? <Plus size={14} aria-hidden /> : <Minus size={14} aria-hidden />}
        </IconButton>
      )}
    </div>
  );
});
