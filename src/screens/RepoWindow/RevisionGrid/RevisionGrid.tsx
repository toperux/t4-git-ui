import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, Copy, GitBranch, GitCommitHorizontal, GitMerge, ListRestart, Plus, RotateCcw, Search, Tag, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../../../components/ui/Button/Button";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState";
import { ContextMenu, MenuItem, MenuRef, MenuSeparator } from "../../../components/ui/Menu/Menu";
import { Progress } from "../../../components/ui/Progress/Progress";
import { useDialogStore, type DialogSpec } from "../../../store/dialogStore";
import { selectRunning, useOpsStore } from "../../../store/opsStore";
import { checkoutBranch, checkoutDetached, checkoutRemoteBranch, copyText } from "../actions";
import { cx } from "../../../lib/cx";
import { useMerging, useRepoStore } from "../../../store/repoStore";
import { selectChangeCount, useShowWorkingTree, useStatusStore } from "../../../store/statusStore";
import { useThemeTokens } from "../../../theme/useThemeTokens";
import { commitBranchActions, type BranchAt, type DeleteAt } from "./commitMenu";
import { graphWidth } from "./graphGeometry";
import { GridRow } from "./GridRow";
import s from "./RevisionGrid.module.css";
import { useVisibleLanes } from "./visibleLanes";
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
  const merging = useMerging();
  const offset = hasWt ? 1 : 0;
  const count = total + offset;
  const gridId = useId();

  const gridRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; oid: string; el: HTMLElement | null } | null>(null);
  // Not the row: it is virtualized and the dialog's action refreshes the walk, so it is detached by the
  // time focus should come back. The grid container outlives both.
  const onRowMenu = useCallback((at: { x: number; y: number }, oid: string) => setMenu({ at, oid, el: gridRef.current }), []);

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
  // The graph column is as wide as the rows actually in view need (not the overscan ones).
  const lanes = useVisibleLanes(virtualizer.range, offset);

  // Fetch pages for the visible range (+ overscan) whenever it or the row count changes.
  useEffect(() => {
    if (last >= first) ensureRows(first, last + 1 + OVERSCAN);
  }, [first, last, total, ensureRows]);

  useEffect(() => {
    if (reveal) virtualizer.scrollToIndex(reveal.index + offset, { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal]);

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
    <div className={s.th} role={empty ? undefined : "row"} aria-rowindex={empty ? undefined : 1}>
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
          ref={gridRef}
          className={s.gridEl}
          role="grid"
          tabIndex={0}
          /* The sticky header is row 1 of the grid; the data rows follow it. */
          aria-rowcount={count + 1}
          aria-label="Commits"
          /* Ctrl+click compares two commits: two rows can carry `aria-selected` at once. */
          aria-multiselectable
          aria-activedescendant={activeRow}
          onKeyDown={onKeyDown}
        >
          {header}
          <div ref={scrollRef} className={s.scroll} role="rowgroup">
          <div className={s.body} style={{ height: virtualizer.getTotalSize() }}>
            {items.map((item) =>
              hasWt && item.index === 0 ? (
                <WorkingTreeRow key="wt" id={`${gridId}-wt`} top={item.start} rowH={rowH} lanes={lanes} graphW={graphW} changes={changes} merging={merging} />
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

/**
 * Commit row actions, grouped by what each one moves: HEAD (checkout a branch here / detached, reset
 * the current branch here), the current branch's history (merge / rebase, reset a branch to its
 * remote), new refs (branch / tag here), the clipboard (copy SHA), and last the refs here that can
 * go (delete a local / remote branch, a tag).
 */
function CommitContextMenu({ menu, onClose }: { menu: { at: { x: number; y: number }; oid: string; el: HTMLElement | null } | null; onClose: () => void }) {
  const open = useDialogStore((st) => st.open);
  const running = useOpsStore(selectRunning);
  const refs = useRepoStore((st) => st.refs);
  if (!menu) return null;
  const oid = menu.oid;
  const short = oid.slice(0, 7);
  const current = refs?.local.find((b) => b.isHead)?.name ?? "HEAD";
  const branches = commitBranchActions(refs, oid);
  const checkout = (b: BranchAt) => (b.remote ? checkoutRemoteBranch({ name: b.name, oid, mergedInto: null }, b.remote) : checkoutBranch(b.name));
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  // The clicked menu item is gone by the time the dialog mounts: hand it the grid it came from.
  const openDialog = (spec: DialogSpec) => open(spec, { returnFocusTo: menu.el });
  // Everything but Copy touches the repository: greyed while an operation runs, like the toolbar.
  const op = running ? { disabled: true, title: "Operation in progress" } : {};
  // With no branch here the commit itself is the merge source; several branches name the first, like the
  // rebase item — the dialog opens on it and lets the others be picked.
  const m = branches.merge;
  const mergeTitle = m.length > 0 ? `Merge ${m[0].name} into ${current}…` : `Merge commit ${short} into ${current}…`;
  const onto = branches.rebaseOnto;
  const rebaseTitle = `Rebase ${current} onto ${onto ? onto.name : "here"}…`;
  // The history group is the only one that can be empty (HEAD's own commit, no reset-to-remote item):
  // its separator hangs off the same condition so two never end up side by side. `canRebase` implies
  // the merge condition, so the merge one covers both items.
  const integrate = (!branches.headCommit && !branches.unborn) || branches.reset.length > 0;
  return (
    <ContextMenu at={menu.at} onClose={onClose} label="Commit actions">
      {branches.checkout.length === 1 && (
        <MenuItem icon={<GitBranch size={16} aria-hidden />} title={`Checkout ${branches.checkout[0].name}`} {...op} onClick={run(() => void checkout(branches.checkout[0]))}>
          Checkout <MenuRef remote={branches.checkout[0].remote !== null}>{branches.checkout[0].name}</MenuRef>
        </MenuItem>
      )}
      {branches.checkout.length > 1 && (
        <MenuItem icon={<GitBranch size={16} aria-hidden />} {...op} onClick={run(() => openDialog({ kind: "checkoutBranch", branches: branches.checkout }))}>
          Checkout branch…
        </MenuItem>
      )}
      <MenuItem icon={<GitBranch size={16} aria-hidden />} {...op} onClick={run(() => void checkoutDetached(oid, short))}>
        Checkout (detached)
      </MenuItem>
      <MenuItem
        icon={<RotateCcw size={16} aria-hidden />}
        title={`Reset ${current} to here`}
        {...op}
        onClick={run(() => openDialog({ kind: "reset", target: oid }))}
      >
        <span className={s.menuLabel}>
          Reset <MenuRef className={s.menuBranch}>{current}</MenuRef> to here…
        </span>
      </MenuItem>
      {integrate && <MenuSeparator />}
      {/* On an unborn HEAD `git merge <oid>` moves the branch onto the commit and checks its tree out. */}
      {!branches.headCommit && !branches.unborn && (
        <MenuItem
          icon={<GitMerge size={16} aria-hidden />}
          title={mergeTitle}
          {...op}
          onClick={run(() => openDialog({ kind: "merge", branch: m[0]?.name ?? oid }))}
        >
          {/* Either name can be long: the source chip and the "into <name>…" tail each ellipsize on their own. */}
          <span className={s.menuLabel}>
            {m.length > 0 ? (
              <>
                Merge <MenuRef className={s.menuBranch} remote={m[0].remote !== null}>{m[0].name}</MenuRef>{" "}
                <span className={s.menuBranch}>
                  into <MenuRef>{current}</MenuRef>…
                </span>
              </>
            ) : (
              <>
                Merge commit <MenuRef>{short}</MenuRef>{" "}
                <span className={s.menuBranch}>
                  into <MenuRef>{current}</MenuRef>…
                </span>
              </>
            )}
          </span>
        </MenuItem>
      )}
      {/* No rebase without a branch to move: a detached or unborn HEAD offers the merge only. */}
      {branches.canRebase && (
        <MenuItem
          icon={<ListRestart size={16} aria-hidden />}
          title={rebaseTitle}
          {...op}
          onClick={run(() => openDialog({ kind: "rebase", onto: onto?.name ?? oid }))}
        >
          <span className={s.menuLabel}>
            Rebase <MenuRef className={s.menuBranch}>{current}</MenuRef>{" "}
            <span className={s.menuBranch}>
              onto {onto ? <MenuRef remote={onto.remote !== null}>{onto.name}</MenuRef> : "here"}…
            </span>
          </span>
        </MenuItem>
      )}
      {branches.reset.map((r) => (
        <MenuItem
          key={r.remote}
          icon={<RotateCcw size={16} aria-hidden />}
          title={`Reset ${r.branch} to ${r.remote}`}
          {...op}
          onClick={run(() => openDialog(r.current ? { kind: "reset", target: r.remote } : { kind: "resetBranch", branch: r.branch, target: r.remote }))}
        >
          {/* Either name can be long: the local chip and the "to <remote>…" tail each ellipsize on their own. */}
          <span className={s.menuLabel}>
            Reset <MenuRef className={s.menuBranch}>{r.branch}</MenuRef>{" "}
            <span className={s.menuBranch}>
              to <MenuRef remote>{r.remote}</MenuRef>…
            </span>
          </span>
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem icon={<Plus size={16} aria-hidden />} {...op} onClick={run(() => openDialog({ kind: "createBranch", startPoint: oid }))}>
        Create branch here…
      </MenuItem>
      <MenuItem icon={<Tag size={16} aria-hidden />} {...op} onClick={run(() => openDialog({ kind: "createTag", target: oid }))}>
        Create tag here…
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<Copy size={16} aria-hidden />} onClick={run(() => copyText(oid, "SHA"))}>
        Copy SHA
      </MenuItem>
      {branches.remove.length > 0 && <MenuSeparator />}
      {/* Plain text, like the sidebar's Delete… items: one red line reads as one action. The title
          drops the ellipsis, so a long name still shows whole. */}
      {branches.remove.map((d) => (
        <MenuItem key={`${d.kind}:${d.name}`} icon={<Trash2 size={16} aria-hidden />} danger title={deleteLabel(d)} {...op} onClick={run(() => openDialog(deleteSpec(d)))}>
          {deleteLabel(d)}…
        </MenuItem>
      ))}
    </ContextMenu>
  );
}

const deleteLabel = (d: DeleteAt) => (d.kind === "local" ? `Delete ${d.name}` : d.kind === "remote" ? `Delete ${d.name} on remote` : `Delete tag ${d.name}`);

/** The same three dialogs the sidebar's reference menu opens; a remote branch is pushed by its short name. */
const deleteSpec = (d: DeleteAt): DialogSpec =>
  d.kind === "local" ? { kind: "deleteBranch", name: d.name } : d.kind === "remote" ? { kind: "deleteRemoteBranch", remote: d.remote, name: d.short } : { kind: "deleteTag", name: d.name };
