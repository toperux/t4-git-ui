import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, Copy, GitBranch, GitCommitHorizontal, Plus, Search, Tag } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../../../components/ui/Button/Button";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState";
import { ContextMenu, MenuItem } from "../../../components/ui/Menu/Menu";
import { Progress } from "../../../components/ui/Progress/Progress";
import { useDialogStore, type DialogSpec } from "../../../store/dialogStore";
import { selectRunning, useOpsStore } from "../../../store/opsStore";
import { checkoutDetached, copyText } from "../actions";
import { cx } from "../../../lib/cx";
import { useRepoStore } from "../../../store/repoStore";
import { selectChangeCount, useShowWorkingTree, useStatusStore } from "../../../store/statusStore";
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
  const headBranch = useRepoStore((st) => st.refs?.head.branch ?? null);
  const reveal = useRepoStore((st) => st.reveal);
  const ensureRows = useRepoStore((st) => st.ensureRows);
  const select = useRepoStore((st) => st.select);
  const selectWorkingTree = useRepoStore((st) => st.selectWorkingTree);
  const selectedIndex = useRepoStore((st) => st.selectedIndex);
  const wtSelected = useRepoStore((st) => st.wtSelected);
  const hasWt = useShowWorkingTree();
  const changes = useStatusStore(selectChangeCount);
  const offset = hasWt ? 1 : 0;
  const count = total + offset;
  const gridId = useId();

  const [menu, setMenu] = useState<{ at: { x: number; y: number }; oid: string; el: HTMLElement } | null>(null);
  const onRowMenu = useCallback((at: { x: number; y: number }, oid: string, el: HTMLElement) => setMenu({ at, oid, el }), []);

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
    // Shift+F10 / Menu key opens the context menu of the selected commit row.
    if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      const i = st.wtSelected ? null : st.selectedIndex;
      const oid = i === null ? null : (st.rows[i]?.row.commit.oid ?? null);
      if (i === null || !oid) return;
      e.preventDefault();
      const r = scrollRef.current?.getBoundingClientRect();
      const y = (r?.top ?? 0) + (i + offset) * rowH - (scrollRef.current?.scrollTop ?? 0) + rowH;
      setMenu({ at: { x: (r?.left ?? 0) + 24, y }, oid, el: e.currentTarget });
      return;
    }
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
  // The header is a row of the grid, so it lives inside the `role="grid"` scroller (sticky at its top).
  // With no rows at all there is no grid to belong to and it renders as plain chrome.
  const header = (
    <div className={s.th} role={empty ? undefined : "row"}>
      {!flat && (
        <span className={s.col} style={{ width: graphW }} role={empty ? undefined : "columnheader"}>
          Graph
        </span>
      )}
      <span className={cx(s.col, s.sort)} style={{ flex: 1 }} role={empty ? undefined : "columnheader"} aria-sort={empty ? undefined : "descending"}>
        Subject <ChevronDown size={12} aria-hidden />
      </span>
      <span className={cx(s.col, s.author)} role={empty ? undefined : "columnheader"}>
        Author
      </span>
      <span className={cx(s.col, s.date)} role={empty ? undefined : "columnheader"}>
        Date
      </span>
      <span className={cx(s.col, s.sha)} role={empty ? undefined : "columnheader"}>
        SHA
      </span>
    </div>
  );
  const activeRow = wtSelected && hasWt ? `${gridId}-wt` : selectedIndex === null ? undefined : `${gridId}-${selectedIndex}`;

  return (
    <div className={s.grid}>
      {empty && header}
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
          <EmptyState
            icon={<GitCommitHorizontal size={24} aria-hidden />}
            title="No commits yet"
            hint={
              headBranch ? (
                <>
                  Stage files and create the first commit on <span className={s.mono}>{headBranch}</span>
                </>
              ) : (
                "Stage files and create the first commit"
              )
            }
            action={
              <Button variant="primary" icon={<GitCommitHorizontal size={14} aria-hidden />} onClick={() => selectWorkingTree()}>
                Open commit panel
              </Button>
            }
          />
        )
      ) : (
        <div
          className={s.gridEl}
          role="grid"
          tabIndex={0}
          aria-rowcount={count}
          aria-label="Commits"
          aria-activedescendant={activeRow}
          onKeyDown={onKeyDown}
        >
          {header}
          <div ref={scrollRef} className={s.scroll} role="rowgroup">
          <div className={s.body} style={{ height: virtualizer.getTotalSize() }}>
            {items.map((item) =>
              hasWt && item.index === 0 ? (
                <WorkingTreeRow key="wt" id={`${gridId}-wt`} top={item.start} rowH={rowH} lanes={lanes} graphW={graphW} changes={changes} />
              ) : (
                <GridRow
                  key={item.index - offset}
                  id={`${gridId}-${item.index - offset}`}
                  index={item.index - offset}
                  offset={offset}
                  top={item.start}
                  rowH={rowH}
                  lanes={lanes}
                  graphW={graphW}
                  flat={flat}
                  headOid={headOid}
                  onMenu={onRowMenu}
                />
              ),
            )}
            </div>
          </div>
        </div>
      )}
      <CommitContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}

/** Commit row actions: checkout (detached), branch / tag here, copy SHA. */
function CommitContextMenu({ menu, onClose }: { menu: { at: { x: number; y: number }; oid: string; el: HTMLElement } | null; onClose: () => void }) {
  const open = useDialogStore((st) => st.open);
  const running = useOpsStore(selectRunning);
  if (!menu) return null;
  const oid = menu.oid;
  const short = oid.slice(0, 7);
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  // The clicked menu item is gone by the time the dialog mounts: hand it the grid it came from.
  const openDialog = (spec: DialogSpec) => open(spec, { returnFocusTo: menu.el });
  // Everything but Copy touches the repository: greyed while an operation runs, like the toolbar.
  const op = running ? { disabled: true, title: "Operation in progress" } : {};
  return (
    <ContextMenu at={menu.at} onClose={onClose} label="Commit actions">
      <MenuItem icon={<GitBranch size={16} aria-hidden />} {...op} onClick={run(() => void checkoutDetached(oid, short))}>
        Checkout (detached)
      </MenuItem>
      <MenuItem icon={<Plus size={16} aria-hidden />} {...op} onClick={run(() => openDialog({ kind: "createBranch", startPoint: oid }))}>
        Create branch here…
      </MenuItem>
      <MenuItem icon={<Tag size={16} aria-hidden />} {...op} onClick={run(() => openDialog({ kind: "createTag", target: oid }))}>
        Create tag here…
      </MenuItem>
      <MenuItem icon={<Copy size={16} aria-hidden />} onClick={run(() => copyText(oid, "SHA"))}>
        Copy SHA
      </MenuItem>
    </ContextMenu>
  );
}
