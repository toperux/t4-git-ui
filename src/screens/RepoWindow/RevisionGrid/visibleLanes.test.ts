import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogRow } from "../../../api/types";
import { __resetForTests, useRepoStore } from "../../../store/repoStore";
import { SHRINK_DELAY_MS, useVisibleLanes, type VisibleRange } from "./visibleLanes";

const row = (i: number, maxLane: number): LogRow => ({
  row: {
    commit: { oid: `oid${i}`, short: `oid${i}`, summary: `c${i}`, authorName: "", authorEmail: "", authorTime: 0, committerTime: 0, parents: [], isMerge: false },
    lane: 0,
    color: 0,
    lines: [],
    maxLane,
  },
  labels: [],
});

const render = (range: VisibleRange, offset = 0) =>
  renderHook(({ range, offset }) => useVisibleLanes(range, offset), { initialProps: { range, offset } });

beforeEach(() => {
  vi.useFakeTimers();
  __resetForTests();
  // Commit 2 is the merge-heavy one.
  useRepoStore.setState({ rows: [row(0, 0), row(1, 1), row(2, 9), row(3, 0), row(4, 0)] });
});
afterEach(() => vi.useRealTimers());

describe("useVisibleLanes", () => {
  it("fits the busiest row in view (at least the minimum), growing at once", () => {
    const { result, rerender } = render({ startIndex: 0, endIndex: 1 });
    expect(result.current).toBe(3);
    rerender({ range: { startIndex: 0, endIndex: 2 }, offset: 0 });
    expect(result.current).toBe(10);
  });

  it("shrinks only once the view has settled", () => {
    const { result, rerender } = render({ startIndex: 2, endIndex: 2 });
    expect(result.current).toBe(10);
    rerender({ range: { startIndex: 3, endIndex: 4 }, offset: 0 });
    expect(result.current).toBe(10);
    act(() => void vi.advanceTimersByTime(SHRINK_DELAY_MS - 1));
    expect(result.current).toBe(10);
    // Back onto the busy row before it settles: that shrink never happens.
    rerender({ range: { startIndex: 2, endIndex: 3 }, offset: 0 });
    act(() => void vi.advanceTimersByTime(SHRINK_DELAY_MS));
    expect(result.current).toBe(10);
    rerender({ range: { startIndex: 3, endIndex: 4 }, offset: 0 });
    act(() => void vi.advanceTimersByTime(SHRINK_DELAY_MS));
    expect(result.current).toBe(3);
  });

  it("keeps the count while the view holds unloaded rows, however long the page takes", () => {
    const { result, rerender } = render({ startIndex: 2, endIndex: 2 });
    expect(result.current).toBe(10);
    // Dragged into an unloaded page: nothing in view says how many lanes it needs.
    useRepoStore.setState({ rows: [row(0, 0), row(1, 1), row(2, 9), undefined, row(4, 0)] });
    rerender({ range: { startIndex: 3, endIndex: 4 }, offset: 0 });
    act(() => void vi.advanceTimersByTime(SHRINK_DELAY_MS * 2));
    expect(result.current).toBe(10);
    // The page lands: the shrink starts from there.
    act(() => useRepoStore.setState({ rows: [row(0, 0), row(1, 1), row(2, 9), row(3, 0), row(4, 0)] }));
    expect(result.current).toBe(10);
    act(() => void vi.advanceTimersByTime(SHRINK_DELAY_MS));
    expect(result.current).toBe(3);
  });

  it("maps grid rows to commits past the working-tree row", () => {
    // Grid rows 0–2 with the pseudo-row first are commits 0 and 1; the busy commit 2 is not in view.
    expect(render({ startIndex: 0, endIndex: 2 }, 1).result.current).toBe(3);
    expect(render({ startIndex: 0, endIndex: 2 }, 0).result.current).toBe(10);
  });

  it("uses the minimum before the virtualizer has a range", () => {
    expect(renderHook(() => useVisibleLanes(null, 0)).result.current).toBe(3);
  });
});
