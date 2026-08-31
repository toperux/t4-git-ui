import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDownUp, Columns2, File, FileDiff, Rows2 } from "lucide-react";
import { memo, useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import type { DiffLine } from "../../../api/types";
import { Banner } from "../../../components/ui/Banner/Banner";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState";
import { IconButton } from "../../../components/ui/IconButton/IconButton";
import { PanelHeader } from "../../../components/ui/PanelHeader/PanelHeader";
import { Progress } from "../../../components/ui/Progress/Progress";
import { ToolbarSeparator } from "../../../components/ui/ToolbarButton/ToolbarButton";
import { cx } from "../../../lib/cx";
import { useDiffStore, type DiffView } from "../../../store/diffStore";
import { Stats } from "../ChangedFileList/ChangedFileList";
import { flattenSplit, flattenUnified, rowHeight, type SplitRow, type UnifiedRow } from "./diffRows";
import s from "./DiffViewer.module.css";

const OVERSCAN = 30;
const SIGN: Record<DiffLine["kind"], string> = { context: " ", add: "+", del: "−" };

export function DiffViewer() {
  const selectedPath = useDiffStore((st) => st.selectedPath);
  const file = useDiffStore((st) => st.files.find((f) => f.path === st.selectedPath));
  const diff = useDiffStore((st) => st.diff);
  const loading = useDiffStore((st) => st.diffLoading);
  const error = useDiffStore((st) => st.diffError);
  const view = useDiffStore((st) => st.view);
  const ignoreWhitespace = useDiffStore((st) => st.ignoreWhitespace);
  const setView = useDiffStore((st) => st.setView);
  const toggleWhitespace = useDiffStore((st) => st.toggleWhitespace);

  const flat = useMemo(() => {
    if (!diff || diff.binary) return null;
    return view === "unified" ? { view, ...flattenUnified(diff) } : { view, ...flattenSplit(diff) };
  }, [diff, view]);

  const path = diff?.path ?? selectedPath;
  const oldPath = diff ? diff.oldPath : (file?.oldPath ?? null);
  const stats = diff ?? file;

  let body: ReactNode;
  if (!selectedPath) body = <EmptyState icon={<FileDiff size={24} aria-hidden />} title="Select a file" />;
  else if (error) body = <EmptyState title="Couldn't load diff" hint={error} />;
  else if (diff?.binary) body = <EmptyState icon={<File size={24} aria-hidden />} title="Binary file" hint="Contents not shown" />;
  else if (flat && flat.rows.length === 0) body = <EmptyState title="No text changes" />;
  else if (flat) body = <DiffBody key={flat.view} view={flat.view} rows={flat.rows} maxCols={flat.maxCols} />;

  return (
    <div className={s.viewer}>
      <PanelHeader
        icon={<File size={14} aria-hidden />}
        title={path && <span className={s.path}>{oldPath ? `${oldPath} → ${path}` : path}</span>}
      >
        {stats && !stats.binary && <Stats additions={stats.additions} deletions={stats.deletions} className={s.stats} />}
        <ToolbarSeparator />
        <IconButton label="Unified view" on={view === "unified"} onClick={() => setView("unified")}>
          <Rows2 size={14} aria-hidden />
        </IconButton>
        <IconButton label="Split view" on={view === "split"} onClick={() => setView("split")}>
          <Columns2 size={14} aria-hidden />
        </IconButton>
        <IconButton label="Ignore whitespace" on={ignoreWhitespace} onClick={toggleWhitespace}>
          <ArrowDownUp size={14} aria-hidden />
        </IconButton>
      </PanelHeader>
      {loading && (
        <div className={s.progress}>
          <Progress thin label="Loading diff" />
        </div>
      )}
      {body}
      {diff?.truncated && <Banner kind="warning">Diff truncated at 20 000 lines</Banner>}
    </div>
  );
}

type Rows = { view: "unified"; rows: UnifiedRow[] } | { view: "split"; rows: SplitRow[] };

function DiffBody({ view, rows, maxCols }: { view: DiffView; rows: (UnifiedRow | SplitRow)[]; maxCols: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => rowHeight(rows[i]),
    overscan: OVERSCAN,
  });
  // A new row model (other file / whitespace toggle) invalidates cached sizes.
  useEffect(() => {
    virtualizer.measure();
    virtualizer.scrollToOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const model = { view, rows } as Rows;
  return (
    <div ref={scrollRef} className={s.scroll} role="region" aria-label="Diff" tabIndex={0}>
      <div
        className={cx(s.body, view === "split" && s.split)}
        style={{ height: virtualizer.getTotalSize(), "--cols": maxCols } as CSSProperties}
      >
        {virtualizer.getVirtualItems().map((item) =>
          model.view === "unified" ? (
            <UnifiedRowView key={item.index} row={model.rows[item.index]} top={item.start} />
          ) : (
            <SplitRowView key={item.index} row={model.rows[item.index]} top={item.start} />
          ),
        )}
      </div>
    </div>
  );
}

/** Line text; a trailing `\r` becomes a faint `␍` so CRLF content is visible. */
function LineText({ text }: { text: string }) {
  const cr = text.endsWith("\r");
  return (
    <>
      {cr ? text.slice(0, -1) : text}
      {cr && (
        <span className={s.cr} title="Carriage return" aria-label="CR">
          ␍
        </span>
      )}
    </>
  );
}

const NO_NEWLINE = "No newline at end of file";

const UnifiedRowView = memo(function UnifiedRowView({ row, top }: { row: UnifiedRow; top: number }) {
  const style = { top };
  if (row.kind === "hunk") {
    return (
      <div className={s.hunk} style={style}>
        <span className={s.grow}>{row.header}</span>
      </div>
    );
  }
  if (row.kind === "nonl") {
    return (
      <div className={cx(s.dl, s.nonl)} style={style}>
        <span className={s.no} />
        <span className={s.no} />
        <span className={s.sg}>\</span>
        <span className={s.tx}>{NO_NEWLINE}</span>
      </div>
    );
  }
  const { line } = row;
  return (
    <div className={cx(s.dl, line.kind === "add" && s.add, line.kind === "del" && s.del)} style={style}>
      <span className={s.no}>{line.oldNo ?? ""}</span>
      <span className={s.no}>{line.newNo ?? ""}</span>
      <span className={s.sg}>{SIGN[line.kind]}</span>
      <span className={cx(s.tx, "selectable")}>
        <LineText text={line.text} />
      </span>
    </div>
  );
});

function Side({ line, no }: { line: DiffLine | null; no: number | null }) {
  if (!line) return <div className={cx(s.side, s.filler)} />;
  return (
    <div className={cx(s.side, line.kind === "add" && s.add, line.kind === "del" && s.del)}>
      <span className={s.no}>{no ?? ""}</span>
      <span className={s.sg}>{SIGN[line.kind]}</span>
      <span className={cx(s.tx, "selectable")}>
        <LineText text={line.text} />
      </span>
    </div>
  );
}

const SplitRowView = memo(function SplitRowView({ row, top }: { row: SplitRow; top: number }) {
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
      <Side line={row.left} no={row.left?.oldNo ?? null} />
      <Side line={row.right} no={row.right?.newNo ?? null} />
    </div>
  );
});
