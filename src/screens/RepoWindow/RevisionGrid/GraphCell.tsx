import { memo, useEffect, useRef, useState } from "react";
import type { GraphRow } from "../../../api/types";
import { useThemeTokens, type ThemeTokens } from "../../../theme/useThemeTokens";
import { curveControls, graphWidth, HEAD_RING_R, HEAD_RING_STROKE, laneX, rowSegments, wtLink } from "./graphGeometry";
import s from "./RevisionGrid.module.css";

export interface GraphCellProps {
  row: GraphRow;
  lanes: number;
  /** Draw the HEAD ring around the node. */
  isHead: boolean;
}

function draw(ctx: CanvasRenderingContext2D, row: GraphRow, t: ThemeTokens, isHead: boolean) {
  const color = (i: number) => t.graph[i % 8] ?? "";
  // Pass-through lanes first so they render under the node.
  ctx.lineWidth = t.laneStroke;
  ctx.lineCap = "round";
  for (const seg of rowSegments(row, t.laneW, t.rowH)) {
    ctx.strokeStyle = color(seg.color);
    ctx.beginPath();
    ctx.moveTo(seg.x0, seg.y0);
    if (seg.x0 === seg.x1) {
      ctx.lineTo(seg.x1, seg.y1);
    } else {
      const [c1x, c1y, c2x, c2y] = curveControls(seg.x0, seg.y0, seg.x1, seg.y1);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, seg.x1, seg.y1);
    }
    ctx.stroke();
  }

  const cx = laneX(row.lane, t.laneW);
  const cy = t.rowH / 2;
  const col = color(row.color);
  if (isHead) {
    ctx.beginPath();
    ctx.arc(cx, cy, HEAD_RING_R, 0, Math.PI * 2);
    ctx.lineWidth = HEAD_RING_STROKE;
    ctx.strokeStyle = col;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, t.nodeR, 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.fill();
}

/**
 * `window.devicePixelRatio`, re-read when it changes — moving the window to a monitor with a
 * different DPI fires the `(resolution: Xdppx)` query and every canvas repaints at the new scale.
 */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = () => setDpr(window.devicePixelRatio || 1);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [dpr]);
  return dpr;
}

/** DPR-aware canvas of the graph column's width × row height; `paint` runs whenever `deps` change. */
function useGraphCanvas(lanes: number, paint: (ctx: CanvasRenderingContext2D, t: ThemeTokens) => void, deps: unknown[]) {
  const t = useThemeTokens();
  const dpr = useDevicePixelRatio();
  const ref = useRef<HTMLCanvasElement>(null);
  const w = graphWidth(lanes, t.laneW);
  const h = t.rowH;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    paint(ctx, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, w, h, dpr, ...deps]);

  return <canvas ref={ref} className={s.canvas} style={{ width: w, height: h }} aria-hidden />;
}

/** One row of the lane graph on a DPR-aware canvas. */
export const GraphCell = memo(function GraphCell({ row, lanes, isHead }: GraphCellProps) {
  return useGraphCanvas(lanes, (ctx, t) => draw(ctx, row, t, isHead), [row, isHead]);
});

/** screens.mjs `wt` node: r 3.5 dashed (2 2) ring, stroke 1.5. */
export const WT_RING_STROKE = 1.5;
export const WT_RING_DASH = [2, 2];

/**
 * Working-tree pseudo-row: dashed ring at lane 0 and, when the walk was seeded with HEAD,
 * a line down into the seed column in its color.
 */
export const WorkingTreeNode = memo(function WorkingTreeNode({ lanes, first }: { lanes: number; first: GraphRow | null }) {
  return useGraphCanvas(
    lanes,
    (ctx, t) => {
      const link = wtLink(first);
      // A ring stands alone for the one page fetch between a status change and the new walk's rows.
      const col = t.graph[(link?.color ?? 0) % 8] ?? "";
      const cx = laneX(0, t.laneW);
      const cy = t.rowH / 2;
      if (link) {
        ctx.lineWidth = t.laneStroke;
        ctx.lineCap = "round";
        ctx.strokeStyle = col;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, t.rowH);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, t.nodeR, 0, Math.PI * 2);
      ctx.setLineDash(WT_RING_DASH);
      ctx.lineWidth = WT_RING_STROKE;
      ctx.strokeStyle = col;
      ctx.stroke();
      ctx.setLineDash([]);
    },
    [first],
  );
});
