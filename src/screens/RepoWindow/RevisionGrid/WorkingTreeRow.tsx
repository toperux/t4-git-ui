import { memo } from "react";
import { cx } from "../../../lib/cx";
import { useDialogStore } from "../../../store/dialogStore";
import { useRepoStore } from "../../../store/repoStore";
import { WorkingTreeNode } from "./GraphCell";
import s from "./RevisionGrid.module.css";

export interface WorkingTreeRowProps {
  /** DOM id, so the grid can point `aria-activedescendant` at the row while it is selected. */
  id: string;
  top: number;
  rowH: number;
  lanes: number;
  graphW: number;
  changes: number;
  /** Mid-merge: a merge resolved to HEAD has an empty status and still needs committing. */
  merging: boolean;
}

/** Style guide §4: dashed ring in the graph, italic muted "Working tree · N changes", no chips. */
export const WorkingTreeRow = memo(function WorkingTreeRow({ id, top, rowH, lanes, graphW, changes, merging }: WorkingTreeRowProps) {
  const selected = useRepoStore((st) => st.wtSelected);
  const selectWorkingTree = useRepoStore((st) => st.selectWorkingTree);
  const first = useRepoStore((st) => st.rows[0]?.row ?? null);
  const openDialog = useDialogStore((st) => st.open);

  return (
    <div
      id={id}
      role="row"
      /* Row 2: the sticky header is row 1. */
      aria-rowindex={2}
      aria-selected={selected}
      className={cx(s.row, selected && s.selected)}
      style={{ transform: `translateY(${top}px)`, height: rowH }}
      onMouseDown={() => selectWorkingTree()}
      /* The grid, not the row, is what holds focus — and Commit & Push hands this on to the Push dialog. */
      onDoubleClick={(e) => openDialog({ kind: "commit" }, { returnFocusTo: e.currentTarget.closest<HTMLElement>('[role="grid"]') })}
    >
      <div role="gridcell" className={s.graph} style={{ width: graphW }}>
        <WorkingTreeNode lanes={lanes} first={first} />
      </div>
      <div role="gridcell" className={s.subject}>
        <span className={cx(s.text, s.wt)}>
          {changes === 0 && merging ? "Working tree · merge to commit" : `Working tree · ${changes} change${changes === 1 ? "" : "s"}`}
        </span>
      </div>
      <div role="gridcell" className={cx(s.meta, s.author)} />
      <div role="gridcell" className={cx(s.meta, s.date)} />
      <div role="gridcell" className={cx(s.meta, s.mono, s.sha)} />
    </div>
  );
});
