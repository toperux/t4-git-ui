import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDownUp, Columns2, File, FileDiff, Rows2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { DiffLine, FileDiff as FileDiffModel } from "../../../api/types";
import { Banner } from "../../../components/ui/Banner/Banner";
import { Button } from "../../../components/ui/Button/Button";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState";
import { IconButton } from "../../../components/ui/IconButton/IconButton";
import { PanelHeader } from "../../../components/ui/PanelHeader/PanelHeader";
import { Progress } from "../../../components/ui/Progress/Progress";
import { ToolbarSeparator } from "../../../components/ui/ToolbarButton/ToolbarButton";
import { cx } from "../../../lib/cx";
import { highlightLine, isLoaded, langForPath, loadLang, type Lang, type SynClass } from "../../../lib/highlight";
import { mods } from "../../../lib/keys";
import { useDiffStore, type DiffView } from "../../../store/diffStore";
import { Stats } from "../ChangedFileList/ChangedFileList";
import { flattenSplit, flattenUnified, rowHeight, type SplitRow, type UnifiedRow } from "./diffRows";
import s from "./DiffViewer.module.css";
import { clickLine, EMPTY_LINES, lineKey, toPairs, type LineRef, type LineSelection } from "./lineSelection";

const OVERSCAN = 30;
const SIGN: Record<DiffLine["kind"], string> = { context: " ", add: "+", del: "−" };
const SYN: Record<SynClass, string> = {
  keyword: s.synKeyword,
  string: s.synString,
  comment: s.synComment,
  number: s.synNumber,
  type: s.synType,
  function: s.synFunction,
  punct: s.synPunct,
};

/** Staging actions (commit panel): hunk buttons + line selection on the unified view. */
export interface DiffActions {
  /** `staged` reverses (unstages). */
  target: "unstaged" | "staged";
  /** Untracked / conflicted file: whole-file only, no hunk / line actions. */
  wholeFile: boolean;
  /** Header note explaining the whole-file mode ("Untracked — stage whole file"). */
  note?: string;
  busy?: boolean;
  onStageHunk: (hunk: number) => void;
  onStageLines: (lines: [number, number][]) => void;
}

export interface DiffViewerProps {
  path: string | null;
  oldPath?: string | null;
  /** Counts from the file list, shown until the diff arrives. */
  stats?: { additions: number; deletions: number; binary: boolean } | null;
  diff: FileDiffModel | null;
  loading: boolean;
  error: string | null;
  actions?: DiffActions;
}

type Mods = { ctrl?: boolean; shift?: boolean };

export function DiffViewer({ path: selectedPath, oldPath: listOldPath, stats: listStats, diff, loading, error, actions }: DiffViewerProps) {
  const storeView = useDiffStore((st) => st.view);
  const ignoreWhitespace = useDiffStore((st) => st.ignoreWhitespace);
  const setView = useDiffStore((st) => st.setView);
  const toggleWhitespace = useDiffStore((st) => st.toggleWhitespace);
  // Hunk / line indices must match the backend's stage-able diff: unified only, no whitespace option.
  const view: DiffView = actions ? "unified" : storeView;
  const lineActions = actions && !actions.wholeFile ? actions : undefined;

  const [sel, setSel] = useState<LineSelection>(EMPTY_LINES);
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    setSel(EMPTY_LINES);
    setCursor(0);
  }, [diff]);
  const onLineClick = useCallback(
    (ref: LineRef, mods: Mods) => {
      if (diff) setSel((prev) => clickLine(diff, prev, ref, mods));
    },
    [diff],
  );

  const flat = useMemo(() => {
    if (!diff || diff.binary) return null;
    return view === "unified" ? { view, ...flattenUnified(diff) } : { view, ...flattenSplit(diff) };
  }, [diff, view]);

  // Selectable (add / del) rows in display order — the ring the keyboard cursor walks.
  const picks = useMemo(() => {
    if (!flat || flat.view !== "unified") return [];
    return flat.rows.flatMap((r, row) => (r.kind === "line" && r.line.kind !== "context" ? [{ row, ref: { hunk: r.hunk, line: r.index } }] : []));
  }, [flat]);
  const cursorRow = picks[Math.min(cursor, picks.length - 1)]?.row ?? -1;

  /** Space toggles, Shift+↑/↓ extends inside the hunk, Enter stages, plain ↑/↓ moves the cursor. */
  const onBodyKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!lineActions || !diff || picks.length === 0) return;
      const i = Math.min(cursor, picks.length - 1);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const next = e.key === "ArrowDown" ? Math.min(i + 1, picks.length - 1) : Math.max(i - 1, 0);
        e.preventDefault();
        setCursor(next);
        if (e.shiftKey) setSel((prev) => clickLine(diff, prev.anchor ? prev : clickLine(diff, prev, picks[i].ref), picks[next].ref, { shift: true }));
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        setSel((prev) => clickLine(diff, prev, picks[i].ref, { ctrl: true }));
        return;
      }
      if (e.key === "Enter" && sel.keys.size > 0 && !lineActions.busy) {
        e.preventDefault();
        lineActions.onStageLines(toPairs(sel));
      }
    },
    [lineActions, diff, picks, cursor, sel],
  );

  const path = diff?.path ?? selectedPath;
  const oldPath = diff ? diff.oldPath : (listOldPath ?? null);
  const stats = diff ?? listStats;
  // Grammar for the file's extension, loaded on demand; rows render plain until it arrives, then re-render once.
  const wanted = useMemo(() => langForPath(path), [path]);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!wanted || isLoaded(wanted)) return;
    let alive = true;
    void loadLang(wanted).then(() => alive && rerender(), () => {});
    return () => {
      alive = false;
    };
  }, [wanted]);
  const lang = isLoaded(wanted) ? wanted : null;

  let body: ReactNode;
  if (!selectedPath) body = <EmptyState icon={<FileDiff size={24} aria-hidden />} title="Select a file" />;
  else if (error) body = <EmptyState title="Couldn't load diff" hint={error} />;
  else if (diff?.binary) body = <EmptyState icon={<File size={24} aria-hidden />} title="Binary file" hint="Contents not shown" />;
  else if (flat && flat.rows.length === 0) body = <EmptyState title="No text changes" />;
  else if (flat)
    body = (
      <DiffBody
        key={flat.view}
        path={path}
        view={flat.view}
        rows={flat.rows}
        maxCols={flat.maxCols}
        lang={lang}
        actions={lineActions}
        selected={sel.keys}
        cursorRow={cursorRow}
        onLineClick={onLineClick}
        onKeyDown={onBodyKeyDown}
      />
    );

  const n = sel.keys.size;
  const verb = actions?.target === "staged" ? "Unstage" : "Stage";

  return (
    <div className={s.viewer}>
      <PanelHeader
        icon={<File size={14} aria-hidden />}
        title={path && <span className={s.path}>{oldPath ? `${oldPath} → ${path}` : path}</span>}
      >
        {actions?.wholeFile && actions.note && <span className={s.note}>{actions.note}</span>}
        {stats && !stats.binary && <Stats additions={stats.additions} deletions={stats.deletions} className={s.stats} />}
        <ToolbarSeparator />
        <IconButton label="Unified view" on={view === "unified"} onClick={() => setView("unified")}>
          <Rows2 size={16} aria-hidden />
        </IconButton>
        <IconButton label="Split view" on={view === "split"} disabled={!!actions} title={actions ? "Split view is unavailable while staging" : undefined} onClick={() => setView("split")}>
          <Columns2 size={16} aria-hidden />
        </IconButton>
        <IconButton
          label="Ignore whitespace"
          on={!actions && ignoreWhitespace}
          disabled={!!actions}
          title={actions ? "Whitespace option is unavailable while staging" : undefined}
          onClick={toggleWhitespace}
        >
          <ArrowDownUp size={16} aria-hidden />
        </IconButton>
      </PanelHeader>
      {loading && (
        <div className={s.progress}>
          <Progress thin label="Loading diff" />
        </div>
      )}
      {body}
      {diff?.truncated && <Banner kind="warning">Diff truncated at 20 000 lines</Banner>}
      {lineActions && n > 0 && (
        <div className={s.bar} role="toolbar" aria-label="Selected lines">
          <span className={s.grow}>
            {n} line{n === 1 ? "" : "s"} selected
          </span>
          <Button size="sm" variant="primary" className={s.barBtn} disabled={lineActions.busy} onClick={() => lineActions.onStageLines(toPairs(sel))}>
            {verb} {n} line{n === 1 ? "" : "s"}
          </Button>
        </div>
      )}
    </div>
  );
}

type Rows = { view: "unified"; rows: UnifiedRow[] } | { view: "split"; rows: SplitRow[] };

interface DiffBodyProps {
  /** File the rows belong to: only a different file resets the scroll position. */
  path: string | null;
  view: DiffView;
  rows: (UnifiedRow | SplitRow)[];
  maxCols: number;
  lang: Lang | null;
  actions?: DiffActions;
  selected: ReadonlySet<string>;
  /** Row index carrying `tabIndex={0}` in actions mode (`-1` = none). */
  cursorRow: number;
  onLineClick: (ref: LineRef, mods: Mods) => void;
  onKeyDown: (e: KeyboardEvent) => void;
}

function DiffBody({ path, view, rows, maxCols, lang, actions, selected, cursorRow, onLineClick, onKeyDown }: DiffBodyProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => rowHeight(rows[i]),
    overscan: OVERSCAN,
  });
  // A new row model (reload / whitespace toggle) invalidates cached sizes …
  useEffect(() => {
    virtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  // … but only another file starts over at the top: a reload of the same one keeps its position.
  useEffect(() => {
    virtualizer.scrollToOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const model = { view, rows } as Rows;
  return (
    <div ref={scrollRef} className={s.scroll} role="region" aria-label="Diff" tabIndex={0} onKeyDown={onKeyDown}>
      <div
        className={cx(s.body, view === "split" && s.split)}
        role={actions ? "listbox" : undefined}
        aria-multiselectable={actions ? true : undefined}
        aria-label={actions ? "Diff lines" : undefined}
        style={{ height: virtualizer.getTotalSize(), "--cols": maxCols } as CSSProperties}
      >
        {virtualizer.getVirtualItems().map((item) => {
          if (model.view === "split") return <SplitRowView key={item.index} row={model.rows[item.index]} top={item.start} lang={lang} />;
          const row = model.rows[item.index];
          return (
            <UnifiedRowView
              key={item.index}
              row={row}
              top={item.start}
              lang={lang}
              actions={actions}
              selected={row.kind === "line" && selected.has(lineKey(row.hunk, row.index))}
              cursor={item.index === cursorRow}
              onLineClick={onLineClick}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Line text, syntax-highlighted per line (lib/highlight, cached); a trailing `\r` becomes a faint `␍` so CRLF content is visible. */
function LineText({ text, lang }: { text: string; lang: Lang | null }) {
  const cr = text.endsWith("\r");
  const body = cr ? text.slice(0, -1) : text;
  const spans = useMemo(() => highlightLine(lang, body), [lang, body]);
  return (
    <>
      {spans.map((sp, i) =>
        sp.cls ? (
          <span key={i} className={SYN[sp.cls]}>
            {sp.text}
          </span>
        ) : (
          sp.text
        ),
      )}
      {cr && (
        <span className={s.cr} title="Carriage return" aria-label="CR">
          ␍
        </span>
      )}
    </>
  );
}

const NO_NEWLINE = "No newline at end of file";

interface UnifiedRowViewProps {
  row: UnifiedRow;
  top: number;
  lang: Lang | null;
  actions?: DiffActions;
  selected: boolean;
  /** Roving tab stop of the line list (actions mode). */
  cursor: boolean;
  onLineClick: (ref: LineRef, mods: Mods) => void;
}

const UnifiedRowView = memo(function UnifiedRowView({ row, top, lang, actions, selected, cursor, onLineClick }: UnifiedRowViewProps) {
  const style = { top };
  if (row.kind === "hunk") {
    return (
      <div className={s.hunk} style={style} role={actions ? "presentation" : undefined}>
        <span className={s.grow}>{row.header}</span>
        {actions && (
          <span className={s.hunkActions}>
            {/* No hunk / line Discard: the backend has no reverse-apply-to-workdir. File-level discard lives in FilesColumn. */}
            <Button size="sm" variant="primary" className={s.hunkBtn} disabled={actions.busy} onClick={() => actions.onStageHunk(row.hunk)}>
              {actions.target === "staged" ? "Unstage hunk" : "Stage hunk"}
            </Button>
          </span>
        )}
      </div>
    );
  }
  if (row.kind === "nonl") {
    return (
      <div className={cx(s.dl, s.nonl)} style={style} role={actions ? "presentation" : undefined}>
        <span className={s.no} />
        <span className={s.no} />
        <span className={s.sg}>\</span>
        <span className={s.tx}>{NO_NEWLINE}</span>
      </div>
    );
  }
  const { line } = row;
  const pick = !!actions && line.kind !== "context";
  const onClick = pick ? (e: MouseEvent) => onLineClick({ hunk: row.hunk, line: row.index }, mods(e)) : undefined;
  return (
    <div
      className={cx(s.dl, line.kind === "add" && s.add, line.kind === "del" && s.del, pick && s.pick, selected && s.selected)}
      style={style}
      role={pick ? "option" : actions ? "presentation" : undefined}
      aria-selected={pick ? selected : undefined}
      tabIndex={pick ? (cursor ? 0 : -1) : undefined}
      onClick={onClick}
      // Shift+click extends the selection, not the text selection.
      onMouseDown={pick ? (e) => e.shiftKey && e.preventDefault() : undefined}
    >
      <span className={s.no}>{line.oldNo ?? ""}</span>
      <span className={s.no}>{line.newNo ?? ""}</span>
      <span className={s.sg}>{SIGN[line.kind]}</span>
      <span className={cx(s.tx, "selectable")}>
        <LineText text={line.text} lang={lang} />
      </span>
    </div>
  );
});

function Side({ line, no, lang }: { line: DiffLine | null; no: number | null; lang: Lang | null }) {
  if (!line) return <div className={cx(s.side, s.filler)} />;
  return (
    <div className={cx(s.side, line.kind === "add" && s.add, line.kind === "del" && s.del)}>
      <span className={s.no}>{no ?? ""}</span>
      <span className={s.sg}>{SIGN[line.kind]}</span>
      <span className={cx(s.tx, "selectable")}>
        <LineText text={line.text} lang={lang} />
      </span>
    </div>
  );
}

const SplitRowView = memo(function SplitRowView({ row, top, lang }: { row: SplitRow; top: number; lang: Lang | null }) {
  const style = { top };
  if (row.kind === "hunk") {
    return (
      <div className={s.hunk} style={style}>
        <span className={s.grow}>{row.header}</span>
      </div>
    );
  }
  if (row.kind === "nonl") {
    const marker = (
      <>
        <span className={s.no} />
        <span className={s.sg}>\</span>
        <span className={s.tx}>{NO_NEWLINE}</span>
      </>
    );
    return (
      <div className={cx(s.dl, s.nonl)} style={style}>
        <div className={s.side}>{row.left && marker}</div>
        <div className={s.side}>{row.right && marker}</div>
      </div>
    );
  }
  return (
    <div className={s.dl} style={style}>
      <Side line={row.left} no={row.left?.oldNo ?? null} lang={lang} />
      <Side line={row.right} no={row.right?.newNo ?? null} lang={lang} />
    </div>
  );
});
