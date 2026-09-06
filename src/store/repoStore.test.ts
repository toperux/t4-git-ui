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
    findLogRow: vi.fn(),
    remoteTags: vi.fn(),
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
  openRepo: ReturnType<typeof vi.fn>;
  startLog: ReturnType<typeof vi.fn>;
  getLogPage: ReturnType<typeof vi.fn>;
  refreshLabels: ReturnType<typeof vi.fn>;
  closeRepo: ReturnType<typeof vi.fn>;
  getRefs: ReturnType<typeof vi.fn>;
  findLogRow: ReturnType<typeof vi.fn>;
  remoteTags: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  // `resetAllMocks` (not `clearAllMocks`): a `mockImplementation` set by one test must not
  // survive into another test's `...Once` chain. Module-level page bookkeeping is reset too.
  vi.resetAllMocks();
  __resetForTests();
  useToastStore.setState({ toasts: [] });
  useRepoStore.setState({ repo: REPO });
});

describe("repoStore walk restarts", () => {
  it("keeps the rows on screen and the selected commit across a restart", async () => {
    let resolveSecond!: (p: LogPage) => void;
    mocked.startLog.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    mocked.getLogPage
      .mockImplementationOnce((_id: string, gen: number, offset: number) => Promise.resolve(page(gen, offset, 5, 5)))
      .mockImplementationOnce(() => new Promise<LogPage>((r) => (resolveSecond = r)));
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    await flush();
    useRepoStore.getState().select(3);

    await useRepoStore.getState().startLog({ kind: "all" }, {});
    // Between the restart and its first page: the old rows are still there, nothing blanked.
    expect(useRepoStore.getState().rows[3]?.row.commit.oid).toBe("oid3");
    expect(useRepoStore.getState().selectedIndex).toBe(3);
    expect(useRepoStore.getState().log.total).toBe(5);

    // Generation 2 has one new commit on top: everything moved down one row.
    resolveSecond({ ...page(2, 0, 6, 6), rows: [row(99), ...page(2, 0, 5, 5).rows] });
    await flush();
    // oid3 is at index 4 now, found among the loaded rows (no backend lookup needed).
    expect(useRepoStore.getState().selectedIndex).toBe(4);
    expect(useRepoStore.getState().rows[4]?.row.commit.oid).toBe("oid3");
    expect(mocked.findLogRow).not.toHaveBeenCalled();
  });

  it("asks the backend for a selected commit that is beyond the first page, and waits for an unfinished walk", async () => {
    mocked.startLog.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    mocked.getLogPage.mockImplementation((_id: string, gen: number, offset: number) =>
      // Generation 2 carries 1000 new commits on top, so nothing from generation 1 is on its first page.
      Promise.resolve(gen === 1 ? page(1, offset, 5, 5) : page(2, offset + 1000, Math.min(PAGE_SIZE, 1200 - offset), 1200, false)),
    );
    mocked.findLogRow.mockResolvedValueOnce(null).mockResolvedValueOnce(700);
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    await flush();
    useRepoStore.getState().select(2);

    await useRepoStore.getState().startLog({ kind: "all" }, {});
    await flush();
    // Not walked yet: the selection is left alone (not reset to row 0) until the walk completes.
    expect(mocked.findLogRow).toHaveBeenCalledWith(REPO.id, 2, "oid2");
    expect(useRepoStore.getState().selectedIndex).toBe(2);
    useRepoStore.getState().onProgress({ repoId: REPO.id, generation: 2, total: 1200, complete: true, error: null });
    await flush();
    expect(useRepoStore.getState().selectedIndex).toBe(700);
    expect(mocked.getLogPage).toHaveBeenLastCalledWith(REPO.id, 2, 500, PAGE_SIZE);
  });

  it("falls back to the first row when the selected commit is gone from the new walk", async () => {
    mocked.startLog.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    mocked.getLogPage.mockImplementation((_id: string, gen: number, offset: number) => Promise.resolve(page(gen, offset + (gen === 1 ? 0 : 10), 3, 3)));
    mocked.findLogRow.mockResolvedValue(null);
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    await flush();
    useRepoStore.getState().select(1);
    useRepoStore.getState().compareWith(2);
    expect(useRepoStore.getState().compare).not.toBeNull();
    await useRepoStore.getState().startLog({ kind: "all" }, { text: "nothing like it" });
    await flush();
    expect(useRepoStore.getState().selectedIndex).toBe(0);
    // The anchor is gone, so the pair it belonged to goes with it.
    expect(useRepoStore.getState().compare).toBeNull();
  });

  it("revealOid uses the backend index instead of paging through the log", async () => {
    mocked.startLog.mockResolvedValue(1);
    mocked.getLogPage.mockImplementation((_id: string, gen: number, offset: number) => Promise.resolve(page(gen, offset, PAGE_SIZE, 5000)));
    mocked.findLogRow.mockResolvedValue(4321);
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    await flush();
    await useRepoStore.getState().revealOid("oid4321");
    expect(mocked.getLogPage).toHaveBeenCalledTimes(2);
    expect(mocked.getLogPage).toHaveBeenLastCalledWith(REPO.id, 1, 4000, PAGE_SIZE);
    expect(useRepoStore.getState().selectedIndex).toBe(4321);
    expect(useRepoStore.getState().reveal?.index).toBe(4321);
  });
});

describe("repoStore openRepo", () => {
  it("closes the repository being left, resets the filter, and keeps the same repo open on a reopen", async () => {
    const other: RepoSummary = { ...REPO, id: "c:\\other", path: "c:\\other", name: "other" };
    mocked.openRepo.mockResolvedValueOnce(other).mockResolvedValueOnce(other);
    mocked.closeRepo.mockResolvedValue(undefined);
    mocked.getRefs.mockResolvedValue(null);
    mocked.startLog.mockResolvedValue(1);
    mocked.getLogPage.mockResolvedValue(page(1, 0, 0, 0));
    useRepoStore.setState({ filter: { text: "fix" } });

    await useRepoStore.getState().openRepo("c:\\other");
    expect(mocked.closeRepo).toHaveBeenCalledWith(REPO.id);
    expect(useRepoStore.getState().repo?.id).toBe(other.id);
    expect(useRepoStore.getState().filter).toEqual({});

    await useRepoStore.getState().openRepo("c:\\other");
    expect(mocked.closeRepo).toHaveBeenCalledTimes(1);
  });
});

describe("repoStore remote tags", () => {
  /** `openRepo` needs the rest of the open path to resolve before it reads the cache. */
  function openable() {
    mocked.openRepo.mockResolvedValue(REPO);
    mocked.getRefs.mockResolvedValue(null);
    mocked.startLog.mockResolvedValue(1);
    mocked.getLogPage.mockResolvedValue(page(1, 0, 0, 0));
  }

  const tags = (...names: string[]) => names.map((name) => ({ name, oid: name }));
  const withRemotes = (...names: string[]) => useRepoStore.setState({ refs: { ...REFS, remotes: names.map((name) => ({ name, url: null, branches: [] })) } });
  /** Two remotes with different answers, so a merge that overwrites instead of merging shows. */
  const answers = () => mocked.remoteTags.mockImplementation((_id: string, remote: string) => Promise.resolve(remote === "origin" ? tags("v1", "v2") : tags("v1")));

  it("caches every remote's tags and reads them back when the repository opens", async () => {
    localStorage.clear();
    withRemotes("origin", "vendor");
    answers();
    const before = Date.now();
    await useRepoStore.getState().refreshRemoteTags();
    expect(mocked.remoteTags.mock.calls).toEqual([
      [REPO.id, "origin"],
      [REPO.id, "vendor"],
    ]);
    const cached = useRepoStore.getState().remoteTags;
    expect(cached).toMatchObject({ origin: { tags: tags("v1", "v2") }, vendor: { tags: tags("v1") } });
    expect(cached.origin.at).toBeGreaterThanOrEqual(before); // the badge's tooltip says how old the answer is

    await flush(); // the kv write is fire-and-forget
    __resetForTests();
    openable();
    await useRepoStore.getState().openRepo(REPO.path);
    expect(useRepoStore.getState().remoteTags).toEqual(cached);
  });

  it("keeps a failing remote's cached answer and says so, without dropping the one that answered", async () => {
    withRemotes("origin", "vendor");
    useRepoStore.setState({ remoteTags: { vendor: { tags: tags("old"), at: 1 } } });
    mocked.remoteTags.mockImplementation((_id: string, remote: string) =>
      remote === "vendor" ? Promise.reject({ kind: "cli", message: "could not read from remote" }) : Promise.resolve(tags("v1")),
    );
    await useRepoStore.getState().refreshRemoteTags();
    expect(useRepoStore.getState().remoteTags).toMatchObject({ origin: { tags: tags("v1") }, vendor: { tags: tags("old"), at: 1 } });
    expect(useToastStore.getState().toasts).toMatchObject([{ kind: "error", title: "Couldn't check vendor for tags" }]);
  });

  it("toasts every count when the user asked for the check", async () => {
    withRemotes("origin", "vendor");
    answers();
    await useRepoStore.getState().refreshRemoteTags({ announce: true });
    expect(useToastStore.getState().toasts).toMatchObject([{ kind: "info", title: "Checked origin: 2 tags, vendor: 1 tag" }]);

    useToastStore.setState({ toasts: [] });
    withRemotes();
    await useRepoStore.getState().refreshRemoteTags({ announce: true });
    expect(useToastStore.getState().toasts).toMatchObject([{ kind: "info", title: "No remote to check" }]);
  });

  it("asks only the remote it was given, and forgets the remotes that are gone", async () => {
    withRemotes("origin", "vendor");
    answers();
    await useRepoStore.getState().refreshRemoteTags();
    mocked.remoteTags.mockClear();

    withRemotes("origin"); // `vendor` removed since
    await useRepoStore.getState().refreshRemoteTags({ remotes: ["origin"] });
    expect(mocked.remoteTags.mock.calls).toEqual([[REPO.id, "origin"]]);
    expect(Object.keys(useRepoStore.getState().remoteTags)).toEqual(["origin"]);
  });

  it("ignores a cache written by the single-remote version", async () => {
    localStorage.clear();
    localStorage.setItem(`kv:remoteTags:${REPO.id}`, JSON.stringify({ remote: "origin", names: ["v1"], at: 1 }));
    openable();
    await useRepoStore.getState().openRepo(REPO.path);
    expect(useRepoStore.getState().remoteTags).toEqual({});
  });
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

  it("refetches page 0 when the walk produced its rows while the first request was in flight", async () => {
    // Fresh launch: `start_log` resolves before the walk has written any rows, so the page fetched
    // right after it comes back empty; the `log://progress` that lands meanwhile is what tells the
    // grid there are 28 rows. Without a retry the grid renders 28 placeholders forever.
    mocked.startLog.mockResolvedValue(3);
    mocked.getLogPage
      .mockResolvedValueOnce(page(3, 0, 0, 0, false))
      .mockResolvedValueOnce(page(3, 0, 28, 28, true));
    const started = useRepoStore.getState().startLog({ kind: "all" }, {});
    await Promise.resolve();
    useRepoStore.getState().onProgress({ repoId: REPO.id, generation: 3, total: 28, complete: true, error: null });
    await started;
    await flush();
    await flush();
    expect(mocked.getLogPage).toHaveBeenCalledTimes(2);
    expect(useRepoStore.getState().rows[27]?.row.commit.oid).toBe("oid27");

    // …and it settles: nothing keeps re-requesting the page once it is complete.
    useRepoStore.getState().ensureRows(0, 28);
    await flush();
    expect(mocked.getLogPage).toHaveBeenCalledTimes(2);
  });

  it("refetches the viewport after a restart whose first page beat the walk and the total did not change", async () => {
    // An op moved a branch: the walk restarts, the old rows stay on screen. Page 0 is asked for at
    // once and answers before the walk has written anything; the walk then reports the same total
    // as before. Nothing else (no selected commit → no `reselect`) would ask for the page again,
    // and the grid would keep showing the old labels until F5.
    mocked.startLog.mockResolvedValueOnce(1);
    mocked.getLogPage.mockResolvedValueOnce(page(1, 0, 16, 16, true));
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    await flush();
    useRepoStore.getState().selectWorkingTree();

    mocked.startLog.mockResolvedValueOnce(2);
    const fresh = page(2, 0, 16, 16, true);
    fresh.rows[0].labels = [{ name: "reset-me", kind: "local", isCurrent: false, remote: null }];
    mocked.getLogPage.mockResolvedValueOnce(page(2, 0, 0, 0, false)).mockResolvedValueOnce(fresh);
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    await flush();
    expect(useRepoStore.getState().rows[0]?.labels).toEqual([]); // still the old row
    useRepoStore.getState().onProgress({ repoId: REPO.id, generation: 2, total: 16, complete: true, error: null });
    await flush();
    expect(mocked.getLogPage).toHaveBeenCalledTimes(3);
    expect(useRepoStore.getState().rows[0]?.labels.map((l) => l.name)).toEqual(["reset-me"]);

    // …and it settles.
    useRepoStore.getState().onProgress({ repoId: REPO.id, generation: 2, total: 16, complete: true, error: null });
    await flush();
    expect(mocked.getLogPage).toHaveBeenCalledTimes(3);
  });

  it("refetches a short page when the walk completed while it was in flight, even at the same total", async () => {
    mocked.startLog.mockResolvedValueOnce(1);
    mocked.getLogPage.mockResolvedValueOnce(page(1, 0, 16, 16, true));
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    await flush();

    useRepoStore.getState().selectWorkingTree();

    mocked.startLog.mockResolvedValueOnce(2);
    let release = () => {};
    mocked.getLogPage
      .mockImplementationOnce(() => new Promise<LogPage>((r) => (release = () => r(page(2, 0, 10, 16, false)))))
      .mockResolvedValueOnce(page(2, 0, 16, 16, true));
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    // The walk finishes while page 0 is in flight; its answer is short of the 16 rows it will have.
    useRepoStore.getState().onProgress({ repoId: REPO.id, generation: 2, total: 16, complete: true, error: null });
    release();
    await flush();
    await flush();
    expect(mocked.getLogPage).toHaveBeenCalledTimes(3);
    expect(useRepoStore.getState().rows[15]?.row.commit.oid).toBe("oid15");
  });

  it("stops retrying a short page when the walk has not moved on", async () => {
    mocked.startLog.mockResolvedValue(1);
    let release = () => {};
    mocked.getLogPage
      .mockImplementationOnce(() => new Promise<LogPage>((r) => (release = () => r(page(1, 0, 10, 10, false)))))
      .mockResolvedValue(page(1, 0, 10, 10, false));
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    // Progress lands while page 0 is in flight, so the response is short of what the walk knows.
    useRepoStore.getState().onProgress({ repoId: REPO.id, generation: 1, total: 900, complete: false, error: null });
    release();
    await flush();
    await flush();
    await flush();
    // One retry for the progress that landed mid-flight; the backend still returns 10 rows, so it
    // gives up instead of spinning.
    expect(mocked.getLogPage).toHaveBeenCalledTimes(2);
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

  it("exposes `opening` for the whole open, and clears it on failure", async () => {
    let resolveOpen!: (r: RepoSummary) => void;
    (ipc.openRepo as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise((r) => (resolveOpen = r)));
    mocked.getRefs.mockResolvedValue({ local: [], remotes: [], tags: [], stashes: [] });
    mocked.startLog.mockResolvedValue(1);
    mocked.getLogPage.mockResolvedValue(page(1, 0, 1, 1));

    const open = useRepoStore.getState().openRepo("c:\\big\\repo");
    expect(useRepoStore.getState().opening).toBe("repo");
    resolveOpen(REPO);
    await open;
    expect(useRepoStore.getState().opening).toBeNull();

    (ipc.openRepo as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("nope"));
    await expect(useRepoStore.getState().openRepo("c:\\bad")).rejects.toThrow();
    expect(useRepoStore.getState().opening).toBeNull();
  });

  it("ignores progress for another generation", () => {
    useRepoStore.setState({ log: { generation: 3, total: 5, complete: false, error: null, flat: false } });
    useRepoStore.getState().onProgress({ repoId: REPO.id, generation: 2, total: 99, complete: true, error: null });
    expect(useRepoStore.getState().log.total).toBe(5);
    useRepoStore.getState().onProgress({ repoId: REPO.id, generation: 3, total: 50, complete: true, error: null });
    expect(useRepoStore.getState().log).toMatchObject({ total: 50, complete: true });
  });
});

describe("repoStore compare", () => {
  /** Three rows with the anchor in the middle, so a Ctrl+click can land above or below it. */
  function withRows() {
    useRepoStore.setState({ rows: [row(0), row(1), row(2)], selectedIndex: 1, wtSelected: false, compare: null });
  }

  it("the selected commit is `from`, the Ctrl+clicked one `to`, whichever is older", () => {
    withRows();
    useRepoStore.getState().compareWith(2);
    expect(useRepoStore.getState().compare).toMatchObject({ from: { oid: "oid1" }, to: { oid: "oid2" } });

    // The other way round: anchor on the lower row, click above it → the pair flips.
    useRepoStore.setState({ selectedIndex: 2, compare: null });
    useRepoStore.getState().compareWith(1);
    expect(useRepoStore.getState().compare).toMatchObject({ from: { oid: "oid2" }, to: { oid: "oid1" } });

    // A third commit replaces the second, never adds to it.
    useRepoStore.getState().compareWith(0);
    expect(useRepoStore.getState().compare).toMatchObject({ from: { oid: "oid2" }, to: { oid: "oid0" } });
  });

  it("drops the compare on a Ctrl+click of either row, and on any move of the anchor", () => {
    withRows();
    useRepoStore.getState().compareWith(2);
    useRepoStore.getState().compareWith(2); // the compared row again
    expect(useRepoStore.getState().compare).toBeNull();

    useRepoStore.getState().compareWith(2);
    useRepoStore.getState().compareWith(1); // the anchor itself
    expect(useRepoStore.getState().compare).toBeNull();

    useRepoStore.getState().compareWith(2);
    useRepoStore.getState().select(0);
    expect(useRepoStore.getState().compare).toBeNull();

    useRepoStore.getState().compareWith(2);
    useRepoStore.getState().selectWorkingTree();
    expect(useRepoStore.getState().compare).toBeNull();
  });

  it("Ctrl+click with nothing to compare against is a plain select", () => {
    useRepoStore.setState({ rows: [row(0), row(1)], selectedIndex: null, wtSelected: false, compare: null });
    useRepoStore.getState().compareWith(1);
    expect(useRepoStore.getState()).toMatchObject({ selectedIndex: 1, compare: null });

    // The working-tree row is no commit either.
    useRepoStore.getState().selectWorkingTree();
    useRepoStore.getState().compareWith(0);
    expect(useRepoStore.getState()).toMatchObject({ selectedIndex: 0, wtSelected: false, compare: null });
  });

  it("revealOid leaves the compare behind", async () => {
    mocked.startLog.mockResolvedValue(1);
    mocked.getLogPage.mockImplementation((_id: string, gen: number, offset: number) => Promise.resolve(page(gen, offset, 3, 3)));
    await useRepoStore.getState().startLog({ kind: "all" }, {});
    await flush();
    useRepoStore.setState({ selectedIndex: 1 });
    useRepoStore.getState().compareWith(2);
    await useRepoStore.getState().revealOid("oid0");
    expect(useRepoStore.getState()).toMatchObject({ selectedIndex: 0, compare: null });
  });
});
