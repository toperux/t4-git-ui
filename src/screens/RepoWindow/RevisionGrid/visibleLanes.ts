// The graph column's lane count follows the rows in view, not the busiest row loaded so far.
import { useEffect, useState } from "react";
import { useRepoStore } from "../../../store/repoStore";
import { graphLanes } from "./graphGeometry";

/** Rows scrolled out of view stop counting once the view has stayed put for this long. */
export const SHRINK_DELAY_MS = 300;

/** Grid rows in view (the virtualizer's range without overscan). */
export interface VisibleRange {
  startIndex: number;
  endIndex: number;
}

/**
 * Lanes for the graph column: enough for the busiest row in `range` (grid indices; `offset` grid
 * rows precede the first commit). It grows at once — a clipped lane is worse than a subject column
 * that shifts — and shrinks only after the view has settled, so scrolling through a merge-heavy
 * stretch doesn't make the subject column jitter.
 */
export function useVisibleLanes(range: VisibleRange | null, offset: number): number {
  const busiest = useRepoStore((st) => {
    let max = -1;
    if (range) {
      for (let i = Math.max(0, range.startIndex - offset); i <= range.endIndex - offset; i++) {
        const lane = st.rows[i]?.row.maxLane ?? -1;
        if (lane > max) max = lane;
      }
    }
    return max;
  });
  const wanted = graphLanes(busiest);
  const [lanes, setLanes] = useState(wanted);
  useEffect(() => {
    if (wanted > lanes) {
      setLanes(wanted);
      return;
    }
    if (wanted === lanes) return;
    const timer = setTimeout(() => setLanes(wanted), SHRINK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [wanted, lanes]);
  return lanes;
}
