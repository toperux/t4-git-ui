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
    refreshLabels: vi.fn(),
  };
});

import * as ipc from "../api/ipc";
import { __resetForTests, PAGE_SIZE, useRepoStore } from "./repoStore";
import { useToastStore } from "./toastStore";

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
const mocked = ipc as unknown as {
  startLog: ReturnType<typeof vi.fn>;
  getLogPage: ReturnType<typeof vi.fn>;
  refreshLabels: ReturnType<typeof vi.fn>;
  closeRepo: ReturnType<typeof vi.fn>;
  getRefs: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  // `resetAllMocks` (not `clearAllMocks`): a `mockImplementation` set by one test must not
  // survive into another test's `...Once` chain. Module-level page bookkeeping is reset too.
  vi.resetAllMocks();
  __resetForTests();
  useToastStore.setState({ toasts: [] });
  useRepoStore.setState({ repo: REPO });
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
      .mockRejectedValueOnce({ kind: "staleGeneration", message: "log generation 1 is stale (current 2)" })
      .mockImplementation((_id: string, gen: number, offset: number) => Promise.resolve(page(gen, offset, 1, 1)));
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    await flush();
    await flush();
    expect(mocked.startLog).toHaveBeenCalledTimes(2);
    expect(useRepoStore.getState().log.generation).toBe(2);
    expect(useRepoStore.getState().rows[0]?.row.commit.oid).toBe("oid0");
  });

  it("reports any other page error once instead of re-walking in a loop", async () => {
    mocked.startLog.mockResolvedValue(1);
    mocked.getLogPage.mockRejectedValue({ kind: "internal", message: "walk task panicked" });
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    await flush();
    await flush();
    // One walk only — a panicked blocking task must not spin `start_log`.
    expect(mocked.startLog).toHaveBeenCalledTimes(1);
    expect(mocked.getLogPage).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0]).toMatchObject({ kind: "error", title: "Couldn't load history" });
  });

  it("never moves the walk backwards when a late page undercuts a progress event", async () => {
    mocked.startLog.mockResolvedValue(1);
    // A page snapshot taken early: 10 of an unfinished walk.
    mocked.getLogPage.mockResolvedValue(page(1, 0, 10, 10, false));
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    // The newer `log://progress` lands first…
    useRepoStore.getState().onProgress({ repoId: REPO.id, generation: 1, total: 900, complete: true, error: null });
    await flush();
    // …and the older page response must not undo it (statusbar would stick on "Loading commits…").
    expect(useRepoStore.getState().log).toMatchObject({ total: 900, complete: true });
  });

  it("refreshLabels only refetches the pages around the viewport; the rest reload lazily", async () => {
    mocked.startLog.mockResolvedValue(1);
    mocked.refreshLabels.mockResolvedValue(1);
    mocked.getLogPage.mockImplementation((_id: string, gen: number, offset: number) => Promise.resolve(page(gen, offset, PAGE_SIZE, 5 * PAGE_SIZE)));
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    await flush();
    // Scroll to the end, then back to the top: five pages loaded, viewport on page 0.
    useRepoStore.getState().ensureRows(0, 5 * PAGE_SIZE);
    await flush();
    expect(mocked.getLogPage).toHaveBeenCalledTimes(5);
    useRepoStore.getState().ensureRows(0, 100);
    mocked.getLogPage.mockClear();

    // A terminal `git fetch` relabels: only pages 0 and 1 (viewport ± 1) are worth refetching now.
    await useRepoStore.getState().refreshLabels();
    await flush();
    expect(mocked.getLogPage.mock.calls.map((c) => c[2])).toEqual([0, PAGE_SIZE]);

    // Page 4 left `loaded`, so scrolling back down fetches it again (with fresh labels).
    useRepoStore.getState().ensureRows(4 * PAGE_SIZE, 5 * PAGE_SIZE);
    await flush();
    expect(mocked.getLogPage).toHaveBeenCalledTimes(3);
    expect(mocked.getLogPage).toHaveBeenLastCalledWith(REPO.id, 1, 4 * PAGE_SIZE, PAGE_SIZE);
  });

  it("revealOid selects the commit row and leaves the working-tree row", async () => {
    mocked.startLog.mockResolvedValue(1);
    mocked.getLogPage.mockImplementation((_id: string, gen: number, offset: number) => Promise.resolve(page(gen, offset, 3, 3)));
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    await flush();
    useRepoStore.getState().selectWorkingTree(true);
    await useRepoStore.getState().revealOid("oid2");
    expect(useRepoStore.getState()).toMatchObject({ selectedIndex: 2, wtSelected: false });
  });

  it("refetches a page whose labels went stale while it was in flight", async () => {
    let resolvePage!: (p: LogPage) => void;
    mocked.startLog.mockResolvedValue(1);
    mocked.refreshLabels.mockResolvedValue(1);
    mocked.getLogPage
      .mockImplementationOnce(() => new Promise<LogPage>((r) => (resolvePage = r)))
      .mockImplementation((_id: string, gen: number, offset: number) => Promise.resolve(page(gen, offset, 3, 3)));

    await useRepoStore.getState().startLog({ kind: "all" }, {});
    // Labels are recomputed while page 0 is still in flight: what it carries is already stale.
    await useRepoStore.getState().refreshLabels();
    resolvePage(page(1, 0, 3, 3));
    await flush();
    await flush();
    expect(mocked.getLogPage).toHaveBeenCalledTimes(2);
  });

  it("closeRepo supersedes an in-flight startLog", async () => {
    let resolveStart!: (g: number) => void;
    mocked.startLog.mockImplementation(() => new Promise<number>((r) => (resolveStart = r)));
    mocked.closeRepo.mockResolvedValue(undefined);

    const walking = useRepoStore.getState().startLog({ kind: "all" }, {});
    await useRepoStore.getState().closeRepo();
    resolveStart(9);
    await walking;
    await flush();
    // The superseded walk must not revive the closed repo's generation or fetch its pages.
    expect(useRepoStore.getState().repo).toBeNull();
    expect(useRepoStore.getState().log.generation).toBeNull();
    expect(mocked.getLogPage).not.toHaveBeenCalled();
  });

  it("ignores progress for another generation", () => {
    useRepoStore.setState({ log: { generation: 3, total: 5, complete: false, error: null, flat: false } });
    useRepoStore.getState().onProgress({ repoId: REPO.id, generation: 2, total: 99, complete: true, error: null });
    expect(useRepoStore.getState().log.total).toBe(5);
    useRepoStore.getState().onProgress({ repoId: REPO.id, generation: 3, total: 50, complete: true, error: null });
    expect(useRepoStore.getState().log).toMatchObject({ total: 50, complete: true });
  });
});
