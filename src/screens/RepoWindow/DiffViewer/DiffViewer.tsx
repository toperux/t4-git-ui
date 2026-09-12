import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDownUp, Columns2, ExternalLink, File, FileDiff, Maximize2, Rows2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { ConflictSide, ConflictSides, DiffLine, FileDiff as FileDiffModel } from "../../../api/types";
import { Banner } from "../../../components/ui/Banner/Banner";
import { Button } from "../../../components/ui/Button/Button";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState";
import { IconButton } from "../../../components/ui/IconButton/IconButton";
import { PanelHeader } from "../../../components/ui/PanelHeader/PanelHeader";
import { Progress } from "../../../components/ui/Progress/Progress";
import { ToolbarSeparator } from "../../../components/ui/ToolbarButton/ToolbarButton";
import { sideLabel } from "../../../lib/conflictSides";
import { cx } from "../../../lib/cx";
import { highlightLine, isLoaded, langForPath, loadLang, type Lang, type SynClass } from "../../../lib/highlight";
import { toolLabel } from "../../../lib/externalTools";
import { mods } from "../../../lib/keys";
import { useDiffStore, type DiffView } from "../../../store/diffStore";
import { useSettingsStore } from "../../../store/settingsStore";
import { Stats } from "../ChangedFileList/ChangedFileList";
import { flattenSplit, flattenUnified, rowHeight, type SplitRow, type UnifiedRow } from "./diffRows";
import s from "./DiffViewer.module.css";
import { cut, type EmphRange } from "./intraLine";
import { carryRef, carrySelection, clickLine, EMPTY_LINES, hunkMap, lineKey, toPairs, type LineRef, type LineSelection } from "./lineSelection";

const OVERSCAN = 30;
/** Why the header's conflict buttons are dead while a mutation runs, like the toolbar's. */
const BUSY = "Operation in progress";
/** `20000` → `20 000` (the style guide's thousands separator); shared with the content view. */
export const groupThousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
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
  /** Untracked / conflicted file, a truncated diff or a typechange: whole-file only, no hunk / line actions. */
  wholeFile: boolean;
  /** Header note explaining the file's state ("Untracked — stage whole file"). */
  note?: string;
  busy?: boolean;
  /** Conflicted file: opens its three sides in an external merge editor. */
  onResolve?: () => void;
  /** Conflicted file: what to call the two sides. Absent → git's own "our" / "their" (`sideLabel`). */
  sides?: ConflictSides | null;
  /** Replaces the file with one whole side of its conflict; the two buttons exist only with it. */
  onKeepSide?: (side: ConflictSide) => void;
  /** File staged (and so marked resolved) with its conflict markers still in it. */
  onRestoreConflict?: () => void;
  onStageHunk: (hunk: number) => void;
  onStageLines: (lines: [number, number][]) => void;
  /** Unstaged diff only: throws the hunk / lines away instead of staging them. */
  onDiscardHunk?: (hunk: number) => void;
  onDiscardLines?: (lines: [number, number][]) => void;
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
  /**
   * Header button that opens the diff dialog (the details pane has one; the dialog itself doesn't).
   * Takes the button, which the dialog names as its opener.
   */
  onExpand?: (opener: HTMLElement) => void;
  /**
   * Header button that hands this file's two sides to the external diff tool. Rendered when the
   * prop is given, disabled without a file or a tool configured in Settings.
   */
  onOpenExternal?: () => void;
}

type Mods = { ctrl?: boolean; shift?: boolean };

export function DiffViewer({ path: selectedPath, oldPath: listOldPath, stats: listStats, diff, loading, error, actions, onExpand, onOpenExternal }: DiffViewerProps) {
  const storeView = useDiffStore((st) => st.view);
  // Settings writes both back into the store, so a change here shows without a reload.
  const diffTool = useSettingsStore((st) => st.tools.diff);
  const mergeTool = useSettingsStore((st) => st.tools.merge);
  const ignoreWhitespace = useDiffStore((st) => st.ignoreWhitespace);
  const setView = useDiffStore((st) => st.setView);
  const toggleWhitespace = useDiffStore((st) => st.toggleWhitespace);
  // Hunk / line indices must match the backend's stage-able diff: unified only, no whitespace option.
  const view: DiffView = actions ? "unified" : storeView;
  const lineActions = actions && !actions.wholeFile ? actions : undefined;

  const [sel, setSel] = useState<LineSelection>(EMPTY_LINES);
  const [cursor, setCursor] = useState(0);
  // Staging one hunk reloads the file's diff: the selection in the hunks that survived is carried
  // over, and so is the cursor — an index into `picks`, which a staged hunk above it would otherwise
  // leave pointing that many lines further down (and scroll to). Only another file starts over.
  const loaded = useRef<FileDiffModel | null>(null);
  // The same path in the other list is a different diff: nothing carries over between them.
  const loadedTarget = useRef<DiffActions["target"] | undefined>(undefined);
  const prevPicks = useRef<{ row: number; ref: LineRef }[]>([]);
  useEffect(() => {
    const prev = loaded.current;
    const prevTarget = loadedTarget.current;
    loaded.current = diff;
    loadedTarget.current = actions?.target;
    if (diff && prev && prev.path === diff.path && prevTarget === actions?.target) {
      // One hunk match for both carry-overs: `hunkMap` walks every hunk's text of both diffs.
      const hunks = hunkMap(prev, diff);
      setSel((s) => carrySelection(s, hunks));
      const was = prevPicks.current[Math.min(cursor, prevPicks.current.length - 1)]?.ref;
      const moved = was && carryRef(was, hunks);
      // `pickAt` is rebuilt during render, so it already holds the reloaded picks.
      const i = moved ? pickAt.current.get(lineKey(moved.hunk, moved.line)) : undefined;
      // Nothing to move to — the cursor's own line was staged: leave it to `cursorRow`'s clamp.
      if (i !== undefined) setCursor(i);
    } else {
      setSel(EMPTY_LINES);
      setCursor(0);
    }
    // Only a new diff carries the cursor; `cursor` is read as it stood when that diff arrived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff]);
  const onLineClick = useCallback(
    (ref: LineRef, mods: Mods) => {
      if (diff) setSel((prev) => clickLine(diff, prev, ref, mods));
      // The cursor follows the mouse, or the next arrow key resumes from wherever it was left
      // and Space toggles a line nowhere near the one that was just clicked.
      setCursor(pickAt.current.get(lineKey(ref.hunk, ref.line)) ?? 0);
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
  // Declared after the `[diff]` effect, which needs the picks from before the reload.
  useEffect(() => {
    prevPicks.current = picks;
  }, [picks]);
  const cursorRow = picks[Math.min(cursor, picks.length - 1)]?.row ?? -1;
  // Line key → cursor index, for `onLineClick` (a ref, so clicking does not re-subscribe on every diff).
  const pickAt = useRef(new Map<string, number>());
  pickAt.current = useMemo(() => new Map(picks.map((p, i) => [lineKey(p.ref.hunk, p.ref.line), i])), [picks]);

  /** Space toggles, Shift+↑/↓ extends inside the hunk, Enter stages, Delete discards, plain ↑/↓ moves the cursor. */
  const onBodyKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!lineActions || !diff || picks.length === 0) return;
      const i = Math.min(cursor, picks.length - 1);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const next = e.key === "ArrowDown" ? Math.min(i + 1, picks.length - 1) : Math.max(i - 1, 0);
        e.preventDefault();
        // A range cannot span hunks: with Shift the cursor stops at the hunk's edge rather than
        // starting a new selection in the next one. Plain ↑ / ↓ still cross.
        if (e.shiftKey && picks[next].ref.hunk !== picks[i].ref.hunk) return;
        setCursor(next);
        // The anchor is left behind when plain ↑ / ↓ cross a hunk. `clickLine` only ranges within the
        // anchor's own hunk, so re-seed it at the cursor — otherwise the range falls through to a
        // plain click and replaces the selection with one line.
        if (e.shiftKey)
          setSel((prev) => clickLine(diff, prev.anchor?.hunk === picks[i].ref.hunk ? prev : clickLine(diff, prev, picks[i].ref), picks[next].ref, { shift: true }));
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
        return;
      }
      if (e.key === "Delete" && sel.keys.size > 0 && !lineActions.busy && lineActions.onDiscardLines) {
        e.preventDefault();
        lineActions.onDiscardLines(toPairs(sel));
      }
    },
    [lineActions, diff, picks, cursor, sel],
  );

  // A hunk button is not a line: without this the cursor stays wherever it was left, so the reload
  // refocuses a row far from the click (or none at all, if it is virtualized away, dropping the
  // focus to `<body>`). Move it onto the hunk first and the `[diff]` carry-over lands on the line
  // that takes the hunk's place, exactly as Enter on a selection does.
  const hunkActions = useMemo(() => {
    if (!lineActions) return undefined;
    // `onDiscardHunk` gates the Discard button: stay undefined when the original is.
    const onHunk = (run: ((hunk: number) => void) | undefined) =>
      run &&
      ((hunk: number) => {
        setCursor(Math.max(0, picks.findIndex((p) => p.ref.hunk === hunk)));
        run(hunk);
      });
    return { ...lineActions, onStageHunk: onHunk(lineActions.onStageHunk)!, onDiscardHunk: onHunk(lineActions.onDiscardHunk) };
  }, [lineActions, picks]);

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
        actions={hunkActions}
        selected={sel.keys}
        cursorRow={cursorRow}
        onLineClick={onLineClick}
        onKeyDown={onBodyKeyDown}
      />
    );

  // An exec-bit / symlink change the line rows can't show. An added or deleted file has one side
  // only — worth a chip when it isn't the ordinary 100644, the one case where the bit is invisible.
  const modeChip = fileMode(diff?.oldMode, diff?.newMode);

  const n = sel.keys.size;
  const verb = actions?.target === "staged" ? "Unstage" : "Stage";
  const sides = actions?.sides;
  const onKeepSide = actions?.onKeepSide;

  return (
    <div className={s.viewer}>
      <PanelHeader
        icon={<File size={14} aria-hidden />}
        title={path && <span className={s.path}>{oldPath ? `${oldPath} → ${path}` : path}</span>}
      >
        {actions?.note && <span className={s.note}>{actions.note}</span>}
        {onKeepSide && (
          <>
            <KeepSide side="ours" sides={sides} busy={actions?.busy} onKeepSide={onKeepSide} />
            <KeepSide side="theirs" sides={sides} busy={actions?.busy} onKeepSide={onKeepSide} />
          </>
        )}
        {actions?.onResolve && (
          <Button
            size="sm"
            className={s.resolve}
            disabled={actions.busy}
            /* Dead while a mutation runs, and a disabled title is hoverable: say that, not what the
               click would have done. */
            title={actions.busy ? BUSY : mergeTool ? `Resolve in ${toolLabel(mergeTool.name)}` : "Resolve in editor"}
            onClick={actions.onResolve}
          >
            Resolve in editor
          </Button>
        )}
        {actions?.onRestoreConflict && (
          <Button size="sm" className={s.resolve} disabled={actions.busy} title={actions.busy ? BUSY : "Restore conflict"} onClick={actions.onRestoreConflict}>
            Restore conflict
          </Button>
        )}
        {modeChip && (
          <span className={s.mode} title="File mode">
            {modeChip}
          </span>
        )}
        {stats && !stats.binary && <Stats additions={stats.additions} deletions={stats.deletions} className={s.stats} />}
        <ToolbarSeparator />
        {onExpand && (
          <IconButton label="Open diff window" onClick={(e) => onExpand(e.currentTarget)}>
            <Maximize2 size={16} aria-hidden />
          </IconButton>
        )}
        {onOpenExternal && (
          <IconButton
            label="Open in diff tool"
            disabled={!diffTool || !path}
            title={diffTool ? `Open in ${toolLabel(diffTool.name)}` : "No diff tool set — Settings › Diff tool"}
            onClick={onOpenExternal}
          >
            <ExternalLink size={16} aria-hidden />
          </IconButton>
        )}
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
      {diff?.truncated && <Banner kind="warning">Diff truncated at {groupThousands(diff.maxLines)} lines</Banner>}
      {lineActions && n > 0 && (
        // The bar sits outside the diff body: a click here must not take the focus, or the rows it
        // remounts have nobody to hand it back to (the body only repairs a loss it still held).
        <div className={s.bar} role="toolbar" aria-label="Selected lines" onMouseDown={(e) => e.preventDefault()}>
          <span className={s.grow}>
            {n} line{n === 1 ? "" : "s"} selected
          </span>
          <Button size="sm" variant="primary" className={s.barBtn} disabled={lineActions.busy} onClick={() => lineActions.onStageLines(toPairs(sel))}>
            {verb} {n} line{n === 1 ? "" : "s"}
          </Button>
          {lineActions.onDiscardLines && (
            <Button size="sm" variant="danger" className={s.barBtn} disabled={lineActions.busy} onClick={() => lineActions.onDiscardLines?.(toPairs(sel))}>
              Discard {n} line{n === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * `100644 → 100755`, or the one side an added / deleted file has when it is not the ordinary
 * `100644`. Two equal modes, or nothing but a default one, say nothing worth a chip.
 */
function fileMode(oldMode: string | null | undefined, newMode: string | null | undefined): string | null {
  if (oldMode && newMode) return oldMode === newMode ? null : `${oldMode} → ${newMode}`;
  if (newMode && newMode !== PLAIN_MODE) return `→ ${newMode}`;
  if (oldMode && oldMode !== PLAIN_MODE) return `${oldMode} →`;
  return null;
}
const PLAIN_MODE = "100644";

/** Header button replacing the file with one whole side of its conflict; the label is ellipsized, `title` isn't. */
function KeepSide({ side, sides, busy, onKeepSide }: { side: ConflictSide; sides?: ConflictSides | null; busy?: boolean; onKeepSide: (side: ConflictSide) => void }) {
  const label = sideLabel(sides, side);
  return (
    <Button size="sm" className={s.resolve} disabled={busy} title={busy ? BUSY : `${label} (git checkout --${side})`} onClick={() => onKeepSide(side)}>
      <span className={s.resolveLabel}>{label}</span>
    </Button>
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

  // The cursor is drawn as `.pick:focus-visible`, so it only exists where the focus is. Move the
  // focus with it — but only while the diff already holds it, or picking a file in the list, or a
  // reload, would yank the focus out from under whatever the user was actually using. Staging the
  // selected lines unmounts the row the focus was on and drops it to `<body>`: `held` says the diff
  // still owns it, so the reloaded cursor takes it back instead.
  const held = useRef(false);
  // The row is virtualized: after a scroll it may only mount on the next frame.
  const focusCursor = (root: HTMLElement) => {
    const focus = () => root.querySelector<HTMLElement>("[data-cursor]")?.focus({ preventScroll: true });
    focus();
    const id = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(id);
  };
  useEffect(() => {
    const root = scrollRef.current;
    if (cursorRow < 0 || !root || !root.contains(document.activeElement)) return;
    virtualizer.scrollToIndex(cursorRow, { align: "auto" });
    return focusCursor(root);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorRow]);
  // A reload remounts the row the focus sat on. Take it back without scrolling: the view stays
  // wherever the user left it, and a cursor scrolled out of sight stays unfocused until ↑ / ↓.
  useEffect(() => {
    const root = scrollRef.current;
    const lost = !document.activeElement || document.activeElement === document.body;
    if (cursorRow < 0 || !root || !held.current || !lost) return;
    return focusCursor(root);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const model = { view, rows } as Rows;
  return (
    <div
      ref={scrollRef}
      className={s.scroll}
      role="region"
      aria-label="Diff"
      tabIndex={0}
      onKeyDown={onKeyDown}
      // Tabbing into the diff hands the focus straight to the cursor line, so the first arrow key
      // moves off a line the user can see. Nothing to hand it to outside staging mode: no picks, no
      // `[data-cursor]`, and the region keeps the focus for scrolling. Focus arriving from inside is
      // Shift+Tab on its way out — the region precedes its rows in tab order — and handing it back
      // would trap it here.
      onFocus={(e) => {
        held.current = true;
        if (e.target !== e.currentTarget || (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) return;
        e.currentTarget.querySelector<HTMLElement>("[data-cursor]")?.focus({ preventScroll: true });
      }}
      onBlur={(e) => {
        if (e.relatedTarget) {
          if (!e.currentTarget.contains(e.relatedTarget)) held.current = false;
          return;
        }
        // No `relatedTarget`: either a row was removed under the focus — the diff's loss to repair —
        // or the click landed on something unfocusable (the header, the path) and the focus is idle
        // from here on. A removed row is out of the document by the next microtask.
        const target = e.target;
        void Promise.resolve().then(() => {
          // A row button disabled while the operation runs blurs this way too, and its row goes a
          // moment later: that loss is ours as well.
          if (target.isConnected && !(target as HTMLElement & { disabled?: boolean }).disabled) held.current = false;
        });
      }}
    >
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

/**
 * Line text, syntax-highlighted per line (lib/highlight, cached); a trailing `\r` becomes a faint
 * `␍` so CRLF content is visible. Shared with the content view, which passes no `emph`.
 */
export function LineText({ text, lang, emph }: { text: string; lang: Lang | null; emph?: EmphRange[] }) {
  const cr = text.endsWith("\r");
  const body = cr ? text.slice(0, -1) : text;
  const spans = useMemo(() => highlightLine(lang, body), [lang, body]);
  // The changed words cut across the syntax spans; the `␍` stays outside them (no range reaches it).
  const parts = useMemo(() => cut(spans, emph), [spans, emph]);
  return (
    <>
      {parts.map((p, i) =>
        p.on || p.cls ? (
          <span key={i} className={cx(p.on && s.emph, p.cls && SYN[p.cls])}>
            {p.text}
          </span>
        ) : (
          p.text
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
            <Button size="sm" variant="primary" className={s.hunkBtn} disabled={actions.busy} onClick={() => actions.onStageHunk(row.hunk)}>
              {actions.target === "staged" ? "Unstage hunk" : "Stage hunk"}
            </Button>
            {actions.onDiscardHunk && (
              <Button size="sm" variant="danger" className={s.hunkBtn} disabled={actions.busy} onClick={() => actions.onDiscardHunk?.(row.hunk)}>
                Discard hunk
              </Button>
            )}
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
      data-cursor={pick && cursor ? "" : undefined}
      onClick={onClick}
      // Shift+click extends the selection, not the text selection.
      onMouseDown={pick ? (e) => e.shiftKey && e.preventDefault() : undefined}
    >
      <span className={s.no}>{line.oldNo ?? ""}</span>
      <span className={s.no}>{line.newNo ?? ""}</span>
      <span className={s.sg}>{SIGN[line.kind]}</span>
      <span className={cx(s.tx, "selectable")}>
        <LineText text={line.text} lang={lang} emph={row.emph} />
      </span>
    </div>
  );
});

function Side({ line, no, lang, emph }: { line: DiffLine | null; no: number | null; lang: Lang | null; emph?: EmphRange[] }) {
  if (!line) return <div className={cx(s.side, s.filler)} />;
  return (
    <div className={cx(s.side, line.kind === "add" && s.add, line.kind === "del" && s.del)}>
      <span className={s.no}>{no ?? ""}</span>
      <span className={s.sg}>{SIGN[line.kind]}</span>
      <span className={cx(s.tx, "selectable")}>
        <LineText text={line.text} lang={lang} emph={emph} />
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
      <Side line={row.left} no={row.left?.oldNo ?? null} lang={lang} emph={row.emphL} />
      <Side line={row.right} no={row.right?.newNo ?? null} lang={lang} emph={row.emphR} />
    </div>
  );
});
