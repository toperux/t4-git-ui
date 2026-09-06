import { memo } from "react";
import { cx } from "../../../lib/cx";
import { mods } from "../../../lib/keys";
import { absoluteDate, relativeDate } from "../../../lib/relativeDate";
import { useRepoStore } from "../../../store/repoStore";
import { GraphCell } from "./GraphCell";
import { RefChips } from "./RefChips";
import s from "./RevisionGrid.module.css";

export interface GridRowProps {
  /** DOM id, so the grid can point `aria-activedescendant` at the selected row. */
  id: string;
  /** Commit index into `rows`. */
  index: number;
  /** Grid rows above the first commit (1 while the working-tree row is shown). */
  offset: number;
  /** Row offset inside the virtual list. */
  top: number;
  rowH: number;
  lanes: number;
  graphW: number;
  /** Text filter active: no graph column. */
  flat: boolean;
  headOid: string | null;
  /** Right-click / Shift+F10 on the row (viewport point, the row's oid, the element to give focus back to). */
  onMenu: (at: { x: number; y: number }, oid: string, el: HTMLElement) => void;
}

/** One grid row. Reads its own data + selection from the store so siblings never re-render. */
export const GridRow = memo(function GridRow({ id, index, offset, top, rowH, lanes, graphW, flat, headOid, onMenu }: GridRowProps) {
  const row = useRepoStore((st) => st.rows[index]);
  // Both compared rows are tinted; the anchor among them keeps the focus ring. While a pair is set
  // the tint goes by oid alone: between a walk restart's first page and `reselect`, `selectedIndex`
  // can name a different commit for a moment, and the anchor is one of the pair anyway. One boolean
  // selector, so a row outside the pair still skips its re-render.
  const selected = useRepoStore((st) => {
    if (st.wtSelected) return false;
    if (!st.compare) return st.selectedIndex === index;
    const oid = st.rows[index]?.row.commit.oid;
    return !!oid && (st.compare.from.oid === oid || st.compare.to.oid === oid);
  });
  const select = useRepoStore((st) => st.select);
  const compareWith = useRepoStore((st) => st.compareWith);
  const commit = row?.row.commit;

  return (
    <div
      id={id}
      role="row"
      /* +2: the header is row 1, and `offset` is the working-tree pseudo-row above the commits. */
      aria-rowindex={index + 2 + offset}
      aria-selected={selected}
      className={cx(s.row, selected && s.selected)}
      style={{ transform: `translateY(${top}px)`, height: rowH }}
      onMouseDown={(e) => (mods(e).ctrl ? compareWith(index) : select(index))}
      onContextMenu={(e) => {
        if (!commit) return;
        e.preventDefault();
        select(index);
        onMenu({ x: e.clientX, y: e.clientY }, commit.oid, e.currentTarget);
      }}
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
