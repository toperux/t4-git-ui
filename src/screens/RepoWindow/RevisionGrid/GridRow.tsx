import { memo } from "react";
import { cx } from "../../../lib/cx";
import { absoluteDate, relativeDate } from "../../../lib/relativeDate";
import { useRepoStore } from "../../../store/repoStore";
import { GraphCell } from "./GraphCell";
import { RefChips } from "./RefChips";
import s from "./RevisionGrid.module.css";

export interface GridRowProps {
  index: number;
  /** Row offset inside the virtual list. */
  top: number;
  rowH: number;
  lanes: number;
  graphW: number;
  /** Text filter active: no graph column. */
  flat: boolean;
  headOid: string | null;
}

/** One grid row. Reads its own data + selection from the store so siblings never re-render. */
export const GridRow = memo(function GridRow({ index, top, rowH, lanes, graphW, flat, headOid }: GridRowProps) {
  const row = useRepoStore((st) => st.rows[index]);
  const selected = useRepoStore((st) => st.selectedIndex === index);
  const select = useRepoStore((st) => st.select);
  const commit = row?.row.commit;

  return (
    <div
      role="row"
      aria-rowindex={index + 1}
      aria-selected={selected}
      className={cx(s.row, selected && s.selected)}
      style={{ transform: `translateY(${top}px)`, height: rowH }}
      onMouseDown={() => select(index)}
    >
      {!flat && (
        <div role="gridcell" className={s.graph} style={{ width: graphW }}>
          {row && <GraphCell row={row.row} lanes={lanes} isHead={commit?.oid === headOid} />}
        </div>
      )}
      <div role="gridcell" className={s.subject}>
        {row ? (
          <>
            <RefChips labels={row.labels} />
            <span className={s.text} title={commit?.summary}>
              {commit?.summary}
            </span>
          </>
        ) : (
          <span className={s.skeleton}>—</span>
        )}
      </div>
      <div role="gridcell" className={cx(s.meta, s.author)} title={commit ? `${commit.authorName} <${commit.authorEmail}>` : undefined}>
        {commit?.authorName}
      </div>
      <div role="gridcell" className={cx(s.meta, s.date)} title={commit ? absoluteDate(commit.authorTime) : undefined}>
        {commit && relativeDate(commit.authorTime)}
      </div>
      <div role="gridcell" className={cx(s.meta, s.mono, s.sha)}>
        {commit?.short}
      </div>
    </div>
  );
});
