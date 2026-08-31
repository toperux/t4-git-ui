import { memo, useEffect, useRef } from "react";
import type { GraphRow } from "../../../api/types";
import { useThemeTokens, type ThemeTokens } from "../../../theme/useThemeTokens";
import { curveControls, graphWidth, HEAD_RING_R, HEAD_RING_STROKE, laneX, rowSegments } from "./graphGeometry";
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

/** One row of the lane graph on a DPR-aware canvas. */
export const GraphCell = memo(function GraphCell({ row, lanes, isHead }: GraphCellProps) {
  const t = useThemeTokens();
  const ref = useRef<HTMLCanvasElement>(null);
  const w = graphWidth(lanes, t.laneW);
  const h = t.rowH;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    draw(ctx, row, t, isHead);
  }, [row, t, isHead, w, h]);

  return <canvas ref={ref} className={s.canvas} style={{ width: w, height: h }} aria-hidden />;
});
