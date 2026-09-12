import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy, CornerUpLeft, File, FileText, GitCommitHorizontal, History, Maximize2, UserSearch } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { BlameHunk, FileContent as FileContentModel } from "../../../api/types";
import { Banner } from "../../../components/ui/Banner/Banner";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState";
import { IconButton } from "../../../components/ui/IconButton/IconButton";
import { ContextMenu, MenuItem } from "../../../components/ui/Menu/Menu";
import { PanelHeader } from "../../../components/ui/PanelHeader/PanelHeader";
import { Progress } from "../../../components/ui/Progress/Progress";
import { cx } from "../../../lib/cx";
import { isLoaded, langForPath, loadLang, type Lang } from "../../../lib/highlight";
import { useDiffStore } from "../../../store/diffStore";
import { blameAt, copyText, showHistory } from "../actions";
import { blameLabel, blameRows, blameTitle, type BlameRow } from "./blameRows";
import { groupThousands, LineText } from "./DiffViewer";
import s from "./DiffViewer.module.css";

/** `.dl` height; the virtualizer needs the number. */
const LINE_H = 20;
const OVERSCAN = 30;

export interface FileContentProps {
  path: string | null;
  content: FileContentModel | null;
  loading: boolean;
  error: string | null;
  /** Header button that opens the diff dialog (the details pane has one; the dialog itself doesn't). */
  onExpand?: (opener: HTMLElement) => void;
}

/** Where the hunk menu sits and which hunk it acts on — a snapshot: the rows scroll under it. */
interface HunkMenuState {
  at: { x: number; y: number };
  hunk: BlameHunk;
}

/**
 * One file's content at a revision — the Files tab's right-hand side, and a sibling of
 * [`DiffViewer`] rather than a mode of it: none of the viewer's hunks, staging actions, line
 * selection or cursor model mean anything without two sides. The row CSS, the per-line syntax
 * highlighting, the virtualizer and the truncation / binary notices are shared; the gutter is one
 * line-number column and there is no sign column.
 *
 * The blame gutter (§2) is this component's alone: a left cell per row, the label on a hunk's first
 * row and a tint bar on the rest.
 */
export function FileContent({ path, content, loading, error, onExpand }: FileContentProps) {
  const blame = useDiffStore((st) => st.blame);
  const blameOn = useDiffStore((st) => st.blameOn);
  const blameLoading = useDiffStore((st) => st.blameLoading);
  const blameError = useDiffStore((st) => st.blameError);
  const setBlameOn = useDiffStore((st) => st.setBlameOn);
  // Grammar for the file's extension, loaded on demand; rows render plain until it arrives, then
  // re-render once (as the diff does).
  const wanted = useMemo(() => langForPath(path), [path]);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!wanted || isLoaded(wanted)) return;
    let alive = true;
    void loadLang(wanted).then(
      () => alive && rerender(),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [wanted]);
  const lang = isLoaded(wanted) ? wanted : null;

  const lines = useMemo(() => {
    const text = content?.text;
    if (text === null || text === undefined) return null;
    const out = text.split("\n");
    // The piece after a file's final newline is the terminator, not a line.
    if (out.length > 0 && out[out.length - 1] === "") out.pop();
    return out;
  }, [content]);
  const maxCols = useMemo(() => (lines ?? []).reduce((m, l) => Math.max(m, l.length), 0), [lines]);
  // Blame needs every line of the file: a binary one has none and a truncated one stops at the cap.
  const whole = !!content && !content.binary && !content.truncated;
  // Not while a read is in flight: the store keeps the old file's text until the new one lands, and
  // blame for the new one can arrive first — which would paint its authors on the old file's lines.
  const rows = useMemo(() => (blameOn && blame && lines && !loading ? blameRows(blame, lines.length) : null), [blameOn, blame, lines, loading]);

  let body: ReactNode;
  if (!path) body = <EmptyState icon={<FileText size={24} aria-hidden />} title="Select a file" />;
  else if (error) body = <EmptyState title="Couldn't load the file" hint={error} />;
  else if (content?.binary) body = <EmptyState icon={<File size={24} aria-hidden />} title="Binary file" hint="Contents not shown" />;
  else if (lines && lines.length === 0) body = <EmptyState title="Empty file" />;
  else if (lines) body = <ContentBody path={path} lines={lines} maxCols={maxCols} lang={lang} rows={rows} />;

  return (
    <div className={s.viewer}>
      <PanelHeader icon={<File size={14} aria-hidden />} title={path && <span className={s.path}>{path}</span>}>
        {content && !content.binary && <span className={s.note}>{`${content.truncated ? "first " : ""}${groupThousands(lines?.length ?? 0)} lines`}</span>}
        {/* Off is always reachable: a file blame cannot see whole must not strand the toggle on. */}
        <IconButton label="Blame" on={blameOn} disabled={!whole && !blameOn} title={whole || blameOn ? undefined : "Blame needs the whole file"} onClick={() => setBlameOn(!blameOn)}>
          <UserSearch size={16} aria-hidden />
        </IconButton>
        {onExpand && (
          <IconButton label="Open diff window" onClick={(e) => onExpand(e.currentTarget)}>
            <Maximize2 size={16} aria-hidden />
          </IconButton>
        )}
      </PanelHeader>
      {(loading || (blameOn && blameLoading)) && (
        <div className={s.progress}>
          <Progress thin label={loading ? "Loading file" : "Loading blame"} />
        </div>
      )}
      {body}
      {/* The cut is by lines or by bytes (16 MiB), so the count shown is what was kept, not the line cap. */}
      {content?.truncated && <Banner kind="warning">File truncated at {groupThousands(lines?.length ?? 0)} lines</Banner>}
      {blameOn && blameError && <Banner kind="warning">Couldn&apos;t blame this file: {blameError}</Banner>}
    </div>
  );
}

function ContentBody({ path, lines, maxCols, lang, rows }: { path: string; lines: string[]; maxCols: number; lang: Lang | null; rows: (BlameRow | undefined)[] | null }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // The list's one row cursor — no tab stop per hunk: rows are virtualized and a button per hunk
  // would drop out of the tab order as soon as it scrolled away. Only meaningful with blame on,
  // which is the only thing a row can be acted on for.
  const [cursor, setCursor] = useState(0);
  const [menu, setMenu] = useState<HunkMenuState | null>(null);
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LINE_H,
    overscan: OVERSCAN,
  });
  // Only another file starts over at the top; a reload of the same one keeps its position.
  useEffect(() => {
    virtualizer.scrollToOffset(0);
    setCursor(0);
    setMenu(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  // The cursor is drawn as `.pick:focus-visible`, so it only exists where the focus is (as in the
  // diff). Move the focus with it — but only while the body already holds it, or picking a file in
  // the list would yank the focus out from under whatever the user was actually using.
  useEffect(() => {
    const root = scrollRef.current;
    if (!rows || !root || !root.contains(document.activeElement)) return;
    virtualizer.scrollToIndex(cursor, { align: "auto" });
    // The row is virtualized: after a scroll it may only mount on the next frame.
    const focus = () => root.querySelector<HTMLElement>("[data-cursor]")?.focus({ preventScroll: true });
    focus();
    const id = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, rows]);

  /**
   * Clicking the gutter, or Enter on the cursor row: the hunk's commit, and the file as it was
   * named there. Stable, or every row's `memo` misses on every scroll.
   */
  const select = useCallback((hunk: BlameHunk) => void blameAt(hunk.oid, hunk.origPath ?? path), [path]);

  function openMenu(row: number, at: { x: number; y: number }) {
    const hunk = rows?.[row]?.hunk;
    if (!hunk) return;
    setCursor(row);
    setMenu({ at, hunk });
  }

  function onContextMenu(e: MouseEvent<HTMLDivElement>) {
    const line = (e.target as HTMLElement).closest<HTMLElement>("[data-line]")?.dataset.line;
    if (line === undefined) return;
    e.preventDefault();
    openMenu(Number(line) - 1, { x: e.clientX, y: e.clientY });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // No gutter, no cursor: ↑ / ↓ scroll the region as they always did.
    if (!rows) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, Math.min(lines.length - 1, c + (e.key === "ArrowDown" ? 1 : -1))));
      return;
    }
    if (e.key === "Enter") {
      const hunk = rows[cursor]?.hunk;
      if (!hunk) return;
      e.preventDefault();
      select(hunk);
      return;
    }
    if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      // Below the cursor row, found among the mounted rows; scrolled away, the region's own corner
      // stands in (as the file list's does).
      const el = e.currentTarget.querySelector<HTMLElement>("[data-cursor]");
      const box = (el ?? e.currentTarget).getBoundingClientRect();
      e.preventDefault();
      openMenu(cursor, el ? { x: box.left + 8, y: box.bottom } : { x: box.left + 8, y: box.top + 8 });
    }
  }

  return (
    <div
      ref={scrollRef}
      className={s.scroll}
      role="region"
      aria-label="File content"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
      // Tabbing in hands the focus straight to the cursor row, so the first arrow key moves off a
      // row the user can see. Without blame there is no `[data-cursor]` and the region keeps it.
      // Focus arriving from inside is Shift+Tab on its way out — the region precedes its rows in
      // tab order — and handing it back would trap it here.
      onFocus={(e) => {
        if (e.target !== e.currentTarget || (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) return;
        e.currentTarget.querySelector<HTMLElement>("[data-cursor]")?.focus({ preventScroll: true });
      }}
    >
      {/* A list only with blame on: that is when a row is a thing to act on, as the diff's picks
          are. Without it the rows are plain lines, with nothing to select. */}
      <div
        className={cx(s.body, s.content, rows && s.blamed)}
        role={rows ? "listbox" : undefined}
        aria-label={rows ? "Blame" : undefined}
        style={{ height: virtualizer.getTotalSize(), "--cols": maxCols } as CSSProperties}
      >
        {virtualizer.getVirtualItems().map((item) => (
          <ContentLine key={item.index} no={item.index + 1} text={lines[item.index]} top={item.start} lang={lang} blame={rows?.[item.index]} cursor={!!rows && item.index === cursor} onSelect={select} />
        ))}
      </div>
      <BlameHunkMenu menu={menu} path={path} onClose={() => setMenu(null)} />
    </div>
  );
}

const ContentLine = memo(function ContentLine({
  no,
  text,
  top,
  lang,
  blame,
  cursor,
  onSelect,
}: {
  no: number;
  text: string;
  top: number;
  lang: Lang | null;
  blame: BlameRow | undefined;
  cursor: boolean;
  onSelect: (hunk: BlameHunk) => void;
}) {
  return (
    <div
      className={cx(s.dl, blame && s.pick)}
      style={{ top }}
      role={blame ? "option" : undefined}
      aria-selected={blame ? cursor : undefined}
      data-line={blame ? no : undefined}
      tabIndex={blame ? (cursor ? 0 : -1) : undefined}
      data-cursor={blame && cursor ? "" : undefined}
    >
      {blame && (
        <span
          className={s.bl}
          style={{ "--age": blame.step } as CSSProperties}
          /* `img` so the label is a real accessible name on a span: it names the row's commit even
             where the gutter only draws the tint bar, while the code line stays the row's text. */
          role="img"
          aria-label={`Blame: ${blameLabel(blame.hunk)}`}
          title={blameTitle(blame.hunk)}
          onClick={() => onSelect(blame.hunk)}
        >
          {blame.first && <span className={s.blLabel}>{blameLabel(blame.hunk)}</span>}
        </span>
      )}
      <span className={s.no}>{no}</span>
      <span className={cx(s.tx, "selectable")}>
        <LineText text={text} lang={lang} />
      </span>
    </div>
  );
});

/** The hunk's own actions: its commit in the grid, the commit before it, and the SHA. */
function BlameHunkMenu({ menu, path, onClose }: { menu: HunkMenuState | null; path: string; onClose: () => void }) {
  if (!menu) return null;
  const hunk = menu.hunk;
  const previous = hunk.previous;
  /** Every item closes the menu first. */
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const notYet = "The line is not committed yet";
  return (
    <ContextMenu at={menu.at} onClose={onClose} label="Blame actions">
      <MenuItem
        icon={<GitCommitHorizontal size={16} aria-hidden />}
        disabled={hunk.uncommitted}
        title={hunk.uncommitted ? notYet : undefined}
        onClick={run(() => void blameAt(hunk.oid, hunk.origPath ?? path))}
      >
        Select in graph
      </MenuItem>
      <MenuItem
        icon={<CornerUpLeft size={16} aria-hidden />}
        disabled={!previous}
        /* Porcelain's `previous` header: the commit *and* the path before a rename, so no parent
           list is needed. Absent where the file starts. */
        title={previous ? undefined : "This commit is where the file begins"}
        onClick={run(() => previous && void blameAt(previous.oid, previous.path))}
      >
        Blame parent
      </MenuItem>
      {/* The hunk's own name for the file — a rename since means the grid should follow the file
          under the name the commits behind it know, which is what `--follow` starts from. */}
      <MenuItem icon={<History size={16} aria-hidden />} onClick={run(() => showHistory(hunk.origPath ?? path))}>
        History of this file
      </MenuItem>
      <MenuItem icon={<Copy size={16} aria-hidden />} disabled={hunk.uncommitted} title={hunk.uncommitted ? notYet : undefined} onClick={run(() => copyText(hunk.oid, "SHA"))}>
        Copy SHA
      </MenuItem>
    </ContextMenu>
  );
}
