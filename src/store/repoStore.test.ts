import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LogPage, LogRow, RepoSummary } from "../api/types";

vi.mock("../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/ipc")>();
  return {
    ...actual,
    openRepo: vi.fn(),
    getRefs: vi.fn(),
    startLog: vi.fn(),
    getLogPage: vi.fn(),
    closeRepo: vi.fn(),
  };
});

import * as ipc from "../api/ipc";
import { PAGE_SIZE, useRepoStore } from "./repoStore";

const REPO: RepoSummary = { id: "c:\\repo", name: "repo", path: "c:\\repo", head: { oid: "a", branch: "main", detached: false } };

function row(i: number): LogRow {
  return {
    row: {
      commit: { oid: `oid${i}`, short: `oid${i}`, summary: `c${i}`, authorName: "", authorEmail: "", authorTime: 0, committerTime: 0, parents: [], isMerge: false },
      lane: 0,
      color: 0,
      lines: [],
      maxLane: 0,
    },
    labels: [],
  };
}

function page(generation: number, offset: number, count: number, total: number, complete = true): LogPage {
  return { rows: Array.from({ length: count }, (_, i) => row(offset + i)), total, complete, generation };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const mocked = ipc as unknown as { startLog: ReturnType<typeof vi.fn>; getLogPage: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  useRepoStore.setState({ repo: REPO, rows: [], maxLane: 0, selectedIndex: null, log: { generation: null, total: 0, complete: false, error: null, flat: false } });
});

describe("repoStore paging", () => {
  it("requests one page per 500-row window and dedupes repeat calls", async () => {
    mocked.startLog.mockResolvedValue(1);
    mocked.getLogPage.mockImplementation((_id: string, gen: number, offset: number) =>
      Promise.resolve(page(gen, offset, PAGE_SIZE, 1200)),
    );
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    await flush();
    expect(mocked.getLogPage).toHaveBeenCalledTimes(1); // page 0 auto-fetched
    expect(useRepoStore.getState().log.total).toBe(1200);

    useRepoStore.getState().ensureRows(10, 700);
    useRepoStore.getState().ensureRows(10, 700);
    useRepoStore.getState().ensureRows(600, 650);
    await flush();
    expect(mocked.getLogPage).toHaveBeenCalledTimes(2);
    expect(mocked.getLogPage).toHaveBeenLastCalledWith(REPO.id, 1, 500, PAGE_SIZE);
    expect(useRepoStore.getState().rows[999]?.row.commit.oid).toBe("oid999");
    expect(useRepoStore.getState().selectedIndex).toBe(0);
  });

  it("drops page results from a superseded generation", async () => {
    let resolveFirst!: (p: LogPage) => void;
    mocked.startLog.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    mocked.getLogPage
      .mockImplementationOnce(() => new Promise<LogPage>((r) => (resolveFirst = r)))
      .mockImplementation((_id: string, gen: number, offset: number) => Promise.resolve(page(gen, offset, 3, 3)));

    await useRepoStore.getState().startLog({ kind: "all" }, {});
    await flush();
    await useRepoStore.getState().startLog({ kind: "head" }, {});
    await flush();
    expect(useRepoStore.getState().log.generation).toBe(2);
    expect(useRepoStore.getState().rows[0]?.row.commit.oid).toBe("oid0");

    resolveFirst(page(1, 0, PAGE_SIZE, 999));
    await flush();
    expect(useRepoStore.getState().log.total).toBe(3); // stale page ignored
    expect(useRepoStore.getState().rows.length).toBe(3);
  });

  it("re-requests a partial page while the walk is still running", async () => {
    mocked.startLog.mockResolvedValue(7);
    mocked.getLogPage
      .mockResolvedValueOnce(page(7, 0, 10, 10, false))
      .mockResolvedValueOnce(page(7, 0, 40, 40, true));
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    await flush();
    expect(useRepoStore.getState().log.complete).toBe(false);

    useRepoStore.getState().onProgress({ repoId: REPO.id, generation: 7, total: 40, complete: true, error: null });
    useRepoStore.getState().ensureRows(0, 40);
    await flush();
    expect(mocked.getLogPage).toHaveBeenCalledTimes(2);
    expect(useRepoStore.getState().rows[39]?.row.commit.oid).toBe("oid39");

    useRepoStore.getState().ensureRows(0, 40);
    await flush();
    expect(mocked.getLogPage).toHaveBeenCalledTimes(2); // fully loaded now
  });

  it("restarts the walk when the backend reports a stale generation", async () => {
    mocked.startLog.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    mocked.getLogPage
      .mockRejectedValueOnce({ kind: "internal", message: "log generation 1 is stale (current 2)" })
      .mockImplementation((_id: string, gen: number, offset: number) => Promise.resolve(page(gen, offset, 1, 1)));
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    await flush();
    await flush();
    expect(mocked.startLog).toHaveBeenCalledTimes(2);
    expect(useRepoStore.getState().log.generation).toBe(2);
    expect(useRepoStore.getState().rows[0]?.row.commit.oid).toBe("oid0");
  });

  it("ignores progress for another generation", () => {
    useRepoStore.setState({ log: { generation: 3, total: 5, complete: false, error: null, flat: false } });
    useRepoStore.getState().onProgress({ repoId: REPO.id, generation: 2, total: 99, complete: true, error: null });
    expect(useRepoStore.getState().log.total).toBe(5);
    useRepoStore.getState().onProgress({ repoId: REPO.id, generation: 3, total: 50, complete: true, error: null });
    expect(useRepoStore.getState().log).toMatchObject({ total: 50, complete: true });
  });
});
