import { describe, expect, it } from "vitest";
import type { GraphRow } from "../../../api/types";
import { curveControls, graphLanes, graphWidth, laneX, rowSegments, wtLink } from "./graphGeometry";

describe("graph geometry", () => {
  it("places lanes like the design canvas (8 + lane * 13)", () => {
    expect(laneX(0, 13)).toBe(8);
    expect(laneX(2, 13)).toBe(34);
    expect(graphWidth(3, 13)).toBe(51);
  });

  it("clamps lane count to [3, 40]", () => {
    expect(graphLanes(0)).toBe(3);
    expect(graphLanes(4)).toBe(5);
    expect(graphLanes(20)).toBe(21);
    expect(graphLanes(80)).toBe(40);
  });

  it("puts control points 45% into the segment with vertical tangents", () => {
    const [c1x, c1y, c2x, c2y] = curveControls(8, 0, 21, 26);
    expect(c1x).toBe(8);
    expect(c1y).toBeCloseTo(11.7);
    expect(c2x).toBe(21);
    expect(c2y).toBeCloseTo(14.3);
  });

  it("maps line kinds to row-local segments", () => {
    const row: GraphRow = {
      commit: { oid: "a", short: "a", summary: "", authorName: "", authorEmail: "", authorTime: 0, committerTime: 0, parents: [], isMerge: false },
      lane: 1,
      color: 1,
      maxLane: 2,
      lines: [
        { from: 1, to: 1, color: 1, kind: "branch" },
        { from: 2, to: 1, color: 2, kind: "merge" },
        { from: 0, to: 0, color: 0, kind: "straight" },
      ],
    };
    expect(rowSegments(row, 13, 26)).toEqual([
      { x0: 21, y0: 13, x1: 21, y1: 26, color: 1 },
      { x0: 34, y0: 0, x1: 21, y1: 13, color: 2 },
      { x0: 8, y0: 0, x1: 8, y1: 26, color: 0 },
    ]);
  });

  describe("wtLink", () => {
    const rowWith = (lines: GraphRow["lines"]): GraphRow => ({
      commit: { oid: "a", short: "a", summary: "", authorName: "", authorEmail: "", authorTime: 0, committerTime: 0, parents: [], isMerge: false },
      lane: 0,
      color: 0,
      maxLane: 1,
      lines,
    });

    it("has no line without a first row", () => {
      expect(wtLink(null)).toBeNull();
    });

    it("ignores a `branch` line, which leaves the node instead of entering the row", () => {
      expect(wtLink(rowWith([{ from: 0, to: 0, color: 3, kind: "branch" }]))).toBeNull();
    });

    it("takes the seed column's line down (top commit is not HEAD)", () => {
      const line = { from: 0, to: 0, color: 2, kind: "straight" } as const;
      expect(wtLink(rowWith([line]))).toEqual(line);
    });

    it("takes the seed column's line into HEAD's own row", () => {
      const line = { from: 0, to: 0, color: 1, kind: "merge" } as const;
      expect(wtLink(rowWith([line]))).toEqual(line);
    });

    it("has no line on an unseeded walk (nothing comes in at column 0)", () => {
      expect(wtLink(rowWith([{ from: 1, to: 1, color: 4, kind: "straight" }]))).toBeNull();
    });
  });
});
