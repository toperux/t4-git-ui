import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, GitCommitHorizontal, Search } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState";
import { Progress } from "../../../components/ui/Progress/Progress";
import { cx } from "../../../lib/cx";
import { useRepoStore } from "../../../store/repoStore";
import { selectChangeCount, selectHasChanges, useStatusStore } from "../../../store/statusStore";
import { useThemeTokens } from "../../../theme/useThemeTokens";
import { graphLanes, graphWidth } from "./graphGeometry";
import { GridRow } from "./GridRow";
import s from "./RevisionGrid.module.css";
import { WorkingTreeRow } from "./WorkingTreeRow";

const OVERSCAN = 20;

/**
 * Virtualized history grid. Row 0 is the working-tree pseudo-row while the tree is dirty (and no
 * text filter is active); commit rows follow, shifted by that offset. Store indices stay commit-based.
 */
export function RevisionGrid() {
  const tokens = useThemeTokens();
  const rowH = tokens.rowH;
  const total = useRepoStore((st) => st.log.total);
  const complete = useRepoStore((st) => st.log.complete);
  const error = useRepoStore((st) => st.log.error);
  const flat = useRepoStore((st) => st.log.flat);
  const maxLane = useRepoStore((st) => st.maxLane);
  const headOid = useRepoStore((st) => st.refs?.head.oid ?? null);
  const reveal = useRepoStore((st) => st.reveal);
  const ensureRows = useRepoStore((st) => st.ensureRows);
  const select = useRepoStore((st) => st.select);
  const selectWorkingTree = useRepoStore((st) => st.selectWorkingTree);
  const hasWt = useStatusStore(selectHasChanges) && !flat;
  const changes = useStatusStore(selectChangeCount);
  const offset = hasWt ? 1 : 0;
  const count = total + offset;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: OVERSCAN,
  });
  const items = virtualizer.getVirtualItems();
  const first = Math.max(0, (items[0]?.index ?? 0) - offset);
  const last = items.length ? items[items.length - 1].index - offset : -1;

  // Fetch pages for the visible range (+ overscan) whenever it or the row count changes.
  useEffect(() => {
    if (last >= first) ensureRows(first, last + 1 + OVERSCAN);
  }, [first, last, total, ensureRows]);

  useEffect(() => {
    if (reveal) virtualizer.scrollToIndex(reveal.index + offset, { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal]);

  const lanes = graphLanes(maxLane);
  const graphW = graphWidth(lanes, tokens.laneW);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const st = useRepoStore.getState();
    const n = st.log.total + offset;
    if (n === 0) return;
    const cur = st.wtSelected && hasWt ? 0 : st.selectedIndex === null ? -1 : st.selectedIndex + offset;
    const pageRows = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 0) / rowH) - 1);
    let next: number | null = null;
    switch (e.key) {
      case "ArrowDown":
        next = Math.min(cur + 1, n - 1);
        break;
      case "ArrowUp":
        next = Math.max(cur - 1, 0);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = n - 1;
        break;
      case "PageDown":
        next = Math.min(cur + pageRows, n - 1);
        break;
      case "PageUp":
        next = Math.max(cur - pageRows, 0);
        break;
      default:
        return;
    }
    e.preventDefault();
    if (next === 0 && hasWt) selectWorkingTree();
    else select(next - offset);
    virtualizer.scrollToIndex(next, { align: "auto" });
  }

  const empty = complete && total === 0 && !hasWt;

  return (
    <div className={s.grid}>
      <div className={s.th} role="row">
        {!flat && (
          <span className={s.col} style={{ width: graphW }} role="columnheader">
            Graph
          </span>
        )}
        <span className={cx(s.col, s.sort)} style={{ flex: 1 }} role="columnheader" aria-sort="descending">
          Subject <ChevronDown size={12} aria-hidden />
        </span>
        <span className={cx(s.col, s.author)} role="columnheader">
          Author
        </span>
        <span className={cx(s.col, s.date)} role="columnheader">
          Date
        </span>
        <span className={cx(s.col, s.sha)} role="columnheader">
          SHA
        </span>
      </div>
      {!complete && (
        <div className={s.progress}>
          <Progress thin label="Loading commits" />
        </div>
      )}
      {empty ? (
        error ? (
          <EmptyState title="Couldn't load history" hint={error} />
        ) : flat ? (
          <EmptyState icon={<Search size={24} aria-hidden />} title="No matching commits" hint="Try a different search" />
        ) : (
          <EmptyState icon={<GitCommitHorizontal size={24} aria-hidden />} title="No commits yet" hint="Stage files and create the first commit" />
        )
      ) : (
        <div
          ref={scrollRef}
          className={s.scroll}
          role="grid"
          tabIndex={0}
          aria-rowcount={count}
          aria-label="Commits"
          onKeyDown={onKeyDown}
        >
          <div className={s.body} style={{ height: virtualizer.getTotalSize() }} role="rowgroup">
            {items.map((item) =>
              hasWt && item.index === 0 ? (
                <WorkingTreeRow key="wt" top={item.start} rowH={rowH} lanes={lanes} graphW={graphW} changes={changes} />
              ) : (
                <GridRow
                  key={item.index - offset}
                  index={item.index - offset}
                  offset={offset}
                  top={item.start}
                  rowH={rowH}
                  lanes={lanes}
                  graphW={graphW}
                  flat={flat}
                  headOid={headOid}
                />
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
