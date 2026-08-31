import { memo } from "react";
import { cx } from "../../../lib/cx";
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
}

/** Style guide §4: dashed ring in the graph, italic muted "Working tree · N changes", no chips. */
export const WorkingTreeRow = memo(function WorkingTreeRow({ id, top, rowH, lanes, graphW, changes }: WorkingTreeRowProps) {
  const selected = useRepoStore((st) => st.wtSelected);
  const selectWorkingTree = useRepoStore((st) => st.selectWorkingTree);
  const first = useRepoStore((st) => st.rows[0]?.row ?? null);

  return (
    <div
      id={id}
      role="row"
      aria-rowindex={1}
      aria-selected={selected}
      className={cx(s.row, selected && s.selected)}
      style={{ transform: `translateY(${top}px)`, height: rowH }}
      onMouseDown={() => selectWorkingTree()}
    >
      <div role="gridcell" className={s.graph} style={{ width: graphW }}>
        <WorkingTreeNode lanes={lanes} first={first} />
      </div>
      <div role="gridcell" className={s.subject}>
        <span className={cx(s.text, s.wt)}>
          Working tree · {changes} change{changes === 1 ? "" : "s"}
        </span>
      </div>
      <div role="gridcell" className={cx(s.meta, s.author)} />
      <div role="gridcell" className={cx(s.meta, s.date)} />
      <div role="gridcell" className={cx(s.meta, s.mono, s.sha)} />
    </div>
  );
});
