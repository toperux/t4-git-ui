import { useVirtualizer } from "@tanstack/react-virtual";
import { File, FileText, Maximize2 } from "lucide-react";
import { memo, useEffect, useMemo, useReducer, useRef, type CSSProperties, type ReactNode } from "react";
import type { FileContent as FileContentModel } from "../../../api/types";
import { Banner } from "../../../components/ui/Banner/Banner";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState";
import { IconButton } from "../../../components/ui/IconButton/IconButton";
import { PanelHeader } from "../../../components/ui/PanelHeader/PanelHeader";
import { Progress } from "../../../components/ui/Progress/Progress";
import { cx } from "../../../lib/cx";
import { isLoaded, langForPath, loadLang, type Lang } from "../../../lib/highlight";
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

/**
 * One file's content at a revision — the Files tab's right-hand side, and a sibling of
 * [`DiffViewer`] rather than a mode of it: none of the viewer's hunks, staging actions, line
 * selection or cursor model mean anything without two sides. The row CSS, the per-line syntax
 * highlighting, the virtualizer and the truncation / binary notices are shared; the gutter is one
 * line-number column and there is no sign column.
 */
export function FileContent({ path, content, loading, error, onExpand }: FileContentProps) {
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

  let body: ReactNode;
  if (!path) body = <EmptyState icon={<FileText size={24} aria-hidden />} title="Select a file" />;
  else if (error) body = <EmptyState title="Couldn't load the file" hint={error} />;
  else if (content?.binary) body = <EmptyState icon={<File size={24} aria-hidden />} title="Binary file" hint="Contents not shown" />;
  else if (lines && lines.length === 0) body = <EmptyState title="Empty file" />;
  else if (lines) body = <ContentBody path={path} lines={lines} maxCols={maxCols} lang={lang} />;

  return (
    <div className={s.viewer}>
      <PanelHeader icon={<File size={14} aria-hidden />} title={path && <span className={s.path}>{path}</span>}>
        {content && !content.binary && <span className={s.note}>{`${content.truncated ? "first " : ""}${groupThousands(lines?.length ?? 0)} lines`}</span>}
        {onExpand && (
          <IconButton label="Open diff window" onClick={(e) => onExpand(e.currentTarget)}>
            <Maximize2 size={16} aria-hidden />
          </IconButton>
        )}
      </PanelHeader>
      {loading && (
        <div className={s.progress}>
          <Progress thin label="Loading file" />
        </div>
      )}
      {body}
      {/* The cut is by lines or by bytes (16 MiB), so the count shown is what was kept, not the line cap. */}
      {content?.truncated && <Banner kind="warning">File truncated at {groupThousands(lines?.length ?? 0)} lines</Banner>}
    </div>
  );
}

function ContentBody({ path, lines, maxCols, lang }: { path: string; lines: string[]; maxCols: number; lang: Lang | null }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LINE_H,
    overscan: OVERSCAN,
  });
  // Only another file starts over at the top; a reload of the same one keeps its position.
  useEffect(() => {
    virtualizer.scrollToOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return (
    <div ref={scrollRef} className={s.scroll} role="region" aria-label="File content" tabIndex={0}>
      <div className={cx(s.body, s.content)} style={{ height: virtualizer.getTotalSize(), "--cols": maxCols } as CSSProperties}>
        {virtualizer.getVirtualItems().map((item) => (
          <ContentLine key={item.index} no={item.index + 1} text={lines[item.index]} top={item.start} lang={lang} />
        ))}
      </div>
    </div>
  );
}

const ContentLine = memo(function ContentLine({ no, text, top, lang }: { no: number; text: string; top: number; lang: Lang | null }) {
  return (
    <div className={s.dl} style={{ top }}>
      <span className={s.no}>{no}</span>
      <span className={cx(s.tx, "selectable")}>
        <LineText text={text} lang={lang} />
      </span>
    </div>
  );
});
