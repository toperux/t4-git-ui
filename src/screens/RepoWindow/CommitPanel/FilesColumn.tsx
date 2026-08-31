import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, File, Minus, Plus } from "lucide-react";
import { memo, useCallback, useEffect, useId, useMemo, useRef, type KeyboardEvent, type MouseEvent } from "react";
import type { FileChange, StatusEntry } from "../../../api/types";
import { Badge } from "../../../components/ui/Badge/Badge";
import { Button } from "../../../components/ui/Button/Button";
import { IconButton } from "../../../components/ui/IconButton/IconButton";
import { PanelHeader } from "../../../components/ui/PanelHeader/PanelHeader";
import { StatusGlyph } from "../../../components/ui/StatusGlyph/StatusGlyph";
import { cx } from "../../../lib/cx";
import { mods } from "../../../lib/keys";
import { clickSelect, EMPTY_SELECTION, moveSelect, selectAll, type Selection } from "../../../lib/multiSelect";
import { entryStatus, splitStatus, useCommitStore, type ListId } from "../../../store/commitStore";
import { useStatusStore } from "../../../store/statusStore";
import { Stats } from "../ChangedFileList/ChangedFileList";
import s from "./CommitPanel.module.css";

/** `--row-h`; the virtualizer needs the number, and the rule below pins the same value. */
const ROW_H = 26;
const OVERSCAN = 10;

/** Unstaged (+ Stage all) over Staged (+ Unstage all); each a multi-select listbox. */
export function FilesColumn() {
  const status = useStatusStore((st) => st.status);
  const lists = useMemo(() => splitStatus(status), [status]);
  const amend = useCommitStore((st) => st.amend);
  const busy = useCommitStore((st) => st.busy);
  const stage = useCommitStore((st) => st.stage);
  const unstage = useCommitStore((st) => st.unstage);
  // Conflicted files stage whole (`index.add_path` resolves the conflict) — that is how the flow ends.
  const unstagedPaths = lists.unstaged.map((e) => e.path);

  return (
    <div className={s.col}>
      <PanelHeader icon={<File size={14} aria-hidden />} title="Unstaged">
        <Badge>{lists.unstaged.length}</Badge>
        <Button size="sm" className={s.headerBtn} disabled={busy || unstagedPaths.length === 0} onClick={() => void stage(unstagedPaths)}>
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

  const rowId = useId();
  const paths = entries.map((e) => e.path);
  const sel: Selection = active ? { selected, anchor } : EMPTY_SELECTION;
  const anchorIndex = active && anchor ? paths.indexOf(anchor) : -1;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: OVERSCAN,
  });

  // Keep the focused row in view — only that one; the rest never scroll themselves.
  const scrollToIndex = virtualizer.scrollToIndex;
  useEffect(() => {
    if (anchorIndex >= 0) scrollToIndex(anchorIndex, { align: "auto" });
  }, [anchorIndex, scrollToIndex]);

  function act(ps: string[]) {
    if (ps.length === 0) return;
    void (list === "unstaged" ? stage(ps) : unstage(ps));
  }

  // One delegated listener per list keeps every `FileRow` prop stable, so `memo` actually skips rows.
  function onClick(e: MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>("[data-path]");
    const path = row?.dataset.path;
    if (!path) return;
    // The only button in a row is its Stage / Unstage action.
    if (target.closest("button")) {
      if (!busy) act([path]);
      return;
    }
    select(list, clickSelect(paths, sel, path, mods(e)));
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
      ref={scrollRef}
      /* The 2px accent bar is a multi-selection affordance (style guide §3 ListRow), not a single-row one. */
      className={cx(s.list, sel.selected.length > 1 && s.multi)}
      role="listbox"
      aria-multiselectable
      aria-label={list === "unstaged" ? "Unstaged files" : "Staged files"}
      aria-activedescendant={anchorIndex >= 0 ? `${rowId}-${anchorIndex}` : undefined}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={onClick}
      onDoubleClick={() => !busy && act(sel.selected)}
    >
      {entries.length === 0 ? (
        <div className={s.empty}>{list === "unstaged" ? "No unstaged changes" : "Nothing staged"}</div>
      ) : (
        <div className={s.rows} style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const e = entries[item.index];
            return (
              <FileRow
                key={e.path}
                id={`${rowId}-${item.index}`}
                top={item.start}
                list={list}
                entry={e}
                stat={stats[e.path]}
                selected={active && selected.includes(e.path)}
                anchor={active && anchor === e.path}
                busy={busy}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface FileRowProps {
  id: string;
  top: number;
  list: ListId;
  entry: StatusEntry;
  stat?: FileChange;
  selected: boolean;
  anchor: boolean;
  busy: boolean;
}

const FileRow = memo(function FileRow({ id, top, list, entry, stat, selected, anchor, busy }: FileRowProps) {
  const full = entry.oldPath ? `${entry.oldPath} → ${entry.path}` : entry.path;
  // Clicks are handled by the list (delegation): the row only carries the data the handler reads.
  const stop = useCallback((e: MouseEvent) => e.stopPropagation(), []);
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      data-path={entry.path}
      className={cx(s.row, s.vrow, selected && s.selected, anchor && s.anchor)}
      style={{ transform: `translateY(${top}px)` }}
      title={full}
    >
      <StatusGlyph status={entryStatus(list, entry)} />
      {/* rtl + isolated ltr content: the ellipsis lands at the start so the file name stays visible */}
      <span className={s.path}>
        <bdi dir="ltr">{full}</bdi>
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
