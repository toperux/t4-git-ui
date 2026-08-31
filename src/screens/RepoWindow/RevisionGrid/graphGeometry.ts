// Pure geometry for the lane graph — ported from `graph()` in docs/design/canvases/build/screens.mjs:
//   x(lane) = 8 + lane * laneW;  width = 8 + lanes * laneW + 4;
//   curves are cubic Béziers with vertical tangents, control points 45% into the segment.
import type { GraphRow } from "../../../api/types";

export const GRAPH_LEFT = 8;
export const GRAPH_RIGHT = 4;
export const CURVE = 0.45;
export const MIN_LANES = 3;
export const MAX_LANES = 12;
/** HEAD marker: extra ring around the node (screens.mjs: r 5.5, stroke 1.5). */
export const HEAD_RING_R = 5.5;
export const HEAD_RING_STROKE = 1.5;

export const laneX = (lane: number, laneW: number) => GRAPH_LEFT + lane * laneW;

export const graphWidth = (lanes: number, laneW: number) => GRAPH_LEFT + lanes * laneW + GRAPH_RIGHT;

/** Number of lanes to reserve for a graph whose highest column so far is `maxLane`. */
export const graphLanes = (maxLane: number) => Math.min(MAX_LANES, Math.max(MIN_LANES, maxLane + 1));

/** Control points `[c1x, c1y, c2x, c2y]` for the curve from (x0,y0) to (x1,y1). */
export function curveControls(x0: number, y0: number, x1: number, y1: number): [number, number, number, number] {
  const h = y1 - y0;
  return [x0, y0 + h * CURVE, x1, y1 - h * CURVE];
}

export interface Segment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: number;
}

/**
 * Line segments of one row in canvas coordinates (row-local, y=0 top edge).
 * `branch` runs node → bottom edge, `merge` top edge → node, `straight` top → bottom.
 */
export function rowSegments(row: GraphRow, laneW: number, rowH: number): Segment[] {
  const mid = rowH / 2;
  return row.lines.map((l) => {
    switch (l.kind) {
      case "branch":
        return { x0: laneX(l.from, laneW), y0: mid, x1: laneX(l.to, laneW), y1: rowH, color: l.color };
      case "merge":
        return { x0: laneX(l.from, laneW), y0: 0, x1: laneX(l.to, laneW), y1: mid, color: l.color };
      case "straight":
        return { x0: laneX(l.from, laneW), y0: 0, x1: laneX(l.to, laneW), y1: rowH, color: l.color };
    }
  });
}
