import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileDiff, LogRow, RepoSummary } from "../api/types";

vi.mock("../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/ipc")>();
  return {
    ...actual,
    openRepo: vi.fn(),
    closeRepo: vi.fn(() => Promise.resolve()),
    spawnWindow: vi.fn(() => Promise.resolve("w1")),
    // `openRepo` waits for the walk to start; the rest is what it and the activation refresh kick
    // off without waiting, and nothing resolves there, so no late answer races an assertion.
    startLog: vi.fn(() => Promise.resolve(1)),
    getLogPage: vi.fn(() => Promise.resolve({ rows: [], total: 0, complete: true, generation: 1, error: null })),
    getRefs: vi.fn(() => new Promise(() => {})),
    getLinked: vi.fn(() => new Promise(() => {})),
    getStatus: vi.fn(() => new Promise(() => {})),
  };
});
vi.mock("../lib/kv", () => ({ kvGet: vi.fn(() => Promise.resolve(null)), kvSet: vi.fn(() => Promise.resolve()) }));

const closeWindow = vi.fn();
vi.mock("../lib/appWindow", () => ({ isMainWindow: () => label === "main", closeThisWindow: () => closeWindow() }));

import * as ipc from "../api/ipc";
import { forgetScroll, noteScroll, seedScroll, takeNote, takeSeed, type DiffScroll } from "../screens/RepoWindow/DiffViewer/diffScroll";
import { useCommitStore } from "./commitStore";
import { useDialogStore } from "./dialogStore";
import { __resetForTests as resetRepo, lastTopRow, noteTopRow, useRepoStore } from "./repoStore";
import { draftRepos, type Snapshot, type TabCarry, useTabsStore } from "./tabsStore";
import { useViewStore } from "./viewStore";

let label = "main";
const mocked = ipc as unknown as Record<"openRepo" | "closeRepo" | "spawnWindow" | "startLog" | "getLogPage", ReturnType<typeof vi.fn>>;
const summary = (path: string): RepoSummary => ({ id: path, name: path.slice(1), path, head: { oid: "a", branch: "main", detached: false } });
const tabs = () => useTabsStore.getState().tabs;
const row = (oid: string) => ({ row: { commit: { oid } } }) as unknown as LogRow;
/** Lets the walk's unawaited page requests land. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  label = "main";
  resetRepo();
  useTabsStore.setState({ tabs: [], active: null, saved: {} });
  useViewStore.getState().__resetForTests();
  // The backend answers with the canonical path, which is what a tab is keyed by.
  mocked.openRepo.mockImplementation((path: string) => Promise.resolve(summary(path)));
  mocked.closeRepo.mockResolvedValue(undefined);
  mocked.spawnWindow.mockResolvedValue("w1");
  mocked.startLog.mockImplementation(() => Promise.resolve(1));
  mocked.getLogPage.mockImplementation(() => Promise.resolve({ rows: [], total: 0, complete: true, generation: 1, error: null }));
});

describe("openTab", () => {
  it("opens one tab per repository: the same path twice activates the tab it already has", async () => {
    await useTabsStore.getState().openTab("/a");
    await useTabsStore.getState().openTab("/b");
    expect(tabs().map((t) => t.path)).toEqual(["/a", "/b"]);

    await useTabsStore.getState().openTab("/a");
    expect(tabs()).toHaveLength(2);
    expect(useTabsStore.getState().active).toBe("/a");
  });

  it("puts a new tab at `at` (a drop's slot), clamped to the strip; an open tab stays where it is", async () => {
    await useTabsStore.getState().openTab("/a");
    await useTabsStore.getState().openTab("/b");
    await useTabsStore.getState().openTab("/c", 1);
    expect(tabs().map((t) => t.path)).toEqual(["/a", "/c", "/b"]);
    expect(useTabsStore.getState().active).toBe("/c");

    await useTabsStore.getState().openTab("/d", 99);
    await useTabsStore.getState().openTab("/e", -3);
    expect(tabs().map((t) => t.path)).toEqual(["/e", "/a", "/c", "/b", "/d"]);

    await useTabsStore.getState().openTab("/b", 0);
    expect(tabs().map((t) => t.path)).toEqual(["/e", "/a", "/c", "/b", "/d"]);
    expect(useTabsStore.getState().active).toBe("/b");
  });

  it("asks the backend to open the repository once per tab open", async () => {
    await useTabsStore.getState().openTab("/a");
    expect(mocked.openRepo).toHaveBeenCalledTimes(1);
    expect(useRepoStore.getState().repo?.id).toBe("/a");
  });

  it("says nothing when another window has the repository: it has been focused instead", async () => {
    mocked.openRepo.mockRejectedValueOnce({ kind: "openElsewhere", message: "a is open in another window" });
    await expect(useTabsStore.getState().openTab("/a")).resolves.toBeUndefined();
    expect(tabs()).toEqual([]);
  });
});

describe("openTab with a tab moved from another window", () => {
  const carry = (over: Partial<TabCarry> = {}): TabCarry => ({
    draft: { summary: "moved", body: "along", amend: true, signoff: true, sign: false, prefill: null },
    spec: { kind: "head" },
    filter: { text: "fix" },
    selection: { oid: "c2" },
    view: "changes",
    topRow: 42,
    total: 1200,
    ...over,
  });
  const pages = (oids: string[], over: object = {}) =>
    mocked.getLogPage.mockImplementation(() => Promise.resolve({ rows: oids.map(row), total: oids.length, complete: true, generation: 1, error: null, ...over }));
  /** The calls that started a walk with the carry's spec. */
  const carriedWalks = () => mocked.startLog.mock.calls.filter((c) => (c[1] as { kind: string }).kind === "head");

  it("puts back its draft, walk, selection, view and top row once the repository opened", async () => {
    let gen = 0;
    mocked.startLog.mockImplementation(() => Promise.resolve(++gen));
    pages(["c0", "c1", "c2"]);
    await useTabsStore.getState().openTab("/a", undefined, carry());

    expect(useCommitStore.getState()).toMatchObject(carry().draft);
    expect(mocked.startLog).toHaveBeenLastCalledWith("/a", { kind: "head" }, { text: "fix" });
    expect(useViewStore.getState().view).toBe("changes");
    expect(lastTopRow()).toBe(42);
    expect(useRepoStore.getState().reveal).toMatchObject({ index: 42, align: "start" });
    // The selection waits for the carried walk, past `openRepo`'s own first row.
    await vi.waitFor(() => expect(useRepoStore.getState().selectedIndex).toBe(2));
    expect(useRepoStore.getState().wtSelected).toBe(false);
  });

  it("puts back the working-tree row", async () => {
    await useTabsStore.getState().openTab("/a", undefined, carry({ filter: {}, selection: "workingTree" }));
    expect(useRepoStore.getState().wtSelected).toBe(true);
  });

  it("raises the walk's total to the carried one, so the grid can scroll to the row; never lowers a larger one", async () => {
    // The carried walk's start never answers: the totals are what the carry left.
    mocked.startLog.mockImplementationOnce(() => Promise.resolve(1)).mockImplementationOnce(() => new Promise(() => {}));
    await useTabsStore.getState().openTab("/a", undefined, carry());
    expect(useRepoStore.getState().log.total).toBe(1200);

    mocked.startLog.mockImplementationOnce(() => Promise.resolve(1)).mockImplementationOnce(() => new Promise(() => {}));
    pages([], { total: 5000, complete: false });
    await useTabsStore.getState().openTab("/b", undefined, carry());
    expect(useRepoStore.getState().log.total).toBe(5000);
  });

  it("is dropped for a tab already open", async () => {
    await useTabsStore.getState().openTab("/a");
    await useTabsStore.getState().openTab("/b");
    await useTabsStore.getState().openTab("/a", undefined, carry());
    expect(useTabsStore.getState().active).toBe("/a");
    expect(useCommitStore.getState().summary).toBe("");
    expect(useViewStore.getState().view).toBe("history");
    expect(carriedWalks()).toEqual([]);
  });

  describe("is dropped when another tab is active by the time the repository opened", () => {
    /** `/a`, with a draft, a selected commit, its view and its grid's top row of its own; then `/b` opening with a carry, its walk held. */
    async function moveInWhileOnA() {
      pages(["c0", "c1"]);
      await useTabsStore.getState().openTab("/a");
      await settle();
      useRepoStore.getState().select(1);
      useCommitStore.setState({ summary: "a's own" });
      noteTopRow(5);
      let started!: (generation: number) => void;
      mocked.startLog.mockImplementationOnce(() => new Promise<number>((r) => (started = r)));
      const done = useTabsStore.getState().openTab("/b", undefined, carry());
      await vi.waitFor(() => expect(started).toBeDefined());
      return { done, started: () => started(2) };
    }
    async function expectAAlone() {
      await settle();
      const r = useRepoStore.getState();
      expect(useTabsStore.getState().active).toBe("/a");
      expect(r.repo?.id).toBe("/a");
      expect([r.selectedIndex, r.wtSelected, r.spec, r.filter]).toEqual([1, false, { kind: "all" }, {}]);
      expect(useCommitStore.getState().summary).toBe("a's own");
      expect(useViewStore.getState().view).toBe("history");
      expect(lastTopRow()).toBe(5);
      expect(carriedWalks()).toEqual([]);
    }

    it("by a switch", async () => {
      const { done, started } = await moveInWhileOnA();
      useTabsStore.getState().activate("/a");
      started();
      await done;
      await expectAAlone();
    });

    it("by a close", async () => {
      const { done, started } = await moveInWhileOnA();
      await useTabsStore.getState().closeTab("/b");
      started();
      await done;
      await expectAAlone();
    });
  });

  it("a switch during the carried walk's start leaves the other tab's selection and view alone", async () => {
    pages(["c0", "c1", "c2"]);
    await useTabsStore.getState().openTab("/a");
    await settle();
    useRepoStore.getState().select(1);
    let started!: (generation: number) => void;
    mocked.startLog.mockImplementationOnce(() => Promise.resolve(2)).mockImplementationOnce(() => new Promise<number>((r) => (started = r)));
    await useTabsStore.getState().openTab("/b", undefined, carry());
    expect(useViewStore.getState().view).toBe("changes");

    useTabsStore.getState().activate("/a");
    started(3);
    await settle();
    const r = useRepoStore.getState();
    expect([r.repo?.id, r.selectedIndex, r.wtSelected]).toEqual(["/a", 1, false]);
    expect(useViewStore.getState().view).toBe("history");
  });
});

describe("openTab's opening overlay", () => {
  const opening = () => useRepoStore.getState().opening;
  // `ipc.openRepo` held until the test answers it.
  const held = () => {
    const answer = {} as { resolve: (v: RepoSummary) => void; reject: (e: unknown) => void };
    mocked.openRepo.mockImplementationOnce(() => new Promise<RepoSummary>((resolve, reject) => Object.assign(answer, { resolve, reject })));
    return answer;
  };

  it("shows from the call, before the backend answers, and clears after an error", async () => {
    const answer = held();
    const done = useTabsStore.getState().openTab("/a");
    expect(opening()).toBe("a");
    answer.reject({ kind: "internal", message: "no such repository" });
    await expect(done).rejects.toMatchObject({ kind: "internal" });
    expect(opening()).toBeNull();
  });

  it("clears when another window has the repository", async () => {
    const answer = held();
    const done = useTabsStore.getState().openTab("/a");
    expect(opening()).toBe("a");
    answer.reject({ kind: "openElsewhere", message: "a is open in another window" });
    await done;
    expect(opening()).toBeNull();
  });

  it("clears when the repository already has a tab", async () => {
    await useTabsStore.getState().openTab("/a");
    await useTabsStore.getState().openTab("/b");
    const answer = held();
    const done = useTabsStore.getState().openTab("/a");
    expect(opening()).toBe("a");
    answer.resolve(summary("/a"));
    await done;
    expect(useTabsStore.getState().active).toBe("/a");
    expect(opening()).toBeNull();
  });

  it("stays through the load after the backend answers, and clears once the tab is open", async () => {
    let started!: (generation: number) => void;
    mocked.startLog.mockImplementationOnce(() => new Promise<number>((r) => (started = r)));
    const done = useTabsStore.getState().openTab("/a");
    await vi.waitFor(() => expect(mocked.startLog).toHaveBeenCalled());
    expect(opening()).toBe("a");
    started(1);
    await done;
    expect(opening()).toBeNull();
  });
});

describe("activate", () => {
  it("puts back what the tab was left with", async () => {
    await useTabsStore.getState().openTab("/a");
    useCommitStore.setState({ summary: "half a message" });

    await useTabsStore.getState().openTab("/b");
    // The editor belongs to the repository: opening another one clears it.
    expect(useCommitStore.getState().summary).toBe("");

    useTabsStore.getState().activate("/a");
    expect(useTabsStore.getState().active).toBe("/a");
    expect(useRepoStore.getState().repo?.id).toBe("/a");
    expect(useCommitStore.getState().summary).toBe("half a message");
  });
});

describe("the History / Changes view", () => {
  const view = () => useViewStore.getState().view;
  const toChanges = () => useViewStore.getState().setView("changes");

  it("belongs to the tab: a new one starts on History, and a switch puts each tab's own back", async () => {
    await useTabsStore.getState().openTab("/a");
    toChanges();
    await useTabsStore.getState().openTab("/b");
    expect(view()).toBe("history");
    useTabsStore.getState().activate("/a");
    expect(view()).toBe("changes");
    useTabsStore.getState().activate("/b");
    expect(view()).toBe("history");
  });

  it("an open of a repository that already has a tab keeps that tab's view", async () => {
    await useTabsStore.getState().openTab("/a");
    toChanges();
    await useTabsStore.getState().openTab("/b");
    await useTabsStore.getState().openTab("/a");
    expect(view()).toBe("changes");
    // The active tab itself, too.
    await useTabsStore.getState().openTab("/a");
    expect(view()).toBe("changes");
  });

  it("closing the active tab shows the next one's own view; closing a background tab drops its snapshot", async () => {
    await useTabsStore.getState().openTab("/a");
    toChanges();
    await useTabsStore.getState().openTab("/b");
    expect(view()).toBe("history");
    await useTabsStore.getState().closeTab("/b");
    expect(useTabsStore.getState().active).toBe("/a");
    expect(view()).toBe("changes");

    await useTabsStore.getState().openTab("/c");
    expect(useTabsStore.getState().saved["/a"]).toBeDefined();
    await useTabsStore.getState().closeTab("/a");
    expect(useTabsStore.getState().saved["/a"]).toBeUndefined();
  });

  it("the start screen: a repository opened after the last tab closed in Changes starts on History", async () => {
    await useTabsStore.getState().openTab("/a");
    toChanges();
    await useTabsStore.getState().closeTab("/a");
    await useTabsStore.getState().openTab("/b");
    expect(view()).toBe("history");
  });

  describe("a failed open", () => {
    const unreadable = { kind: "internal", message: "unreadable" };
    /** Runs `body` with `repoStore.openRepo` replaced by `fake`: the backend answered, and the load after it is `fake`. */
    async function withOpenRepo(fake: () => Promise<void>, body: () => Promise<void>) {
      const openRepo = useRepoStore.getState().openRepo;
      useRepoStore.setState({ openRepo: fake });
      try {
        await body();
      } finally {
        useRepoStore.setState({ openRepo });
      }
    }
    const failing = () => Promise.reject(unreadable);
    /** `/a` and `/b`, `/a` active and in Changes (unlike the History an open resets to, so landing there checks the restore); `/b` left in History. */
    async function aActiveInChanges() {
      await useTabsStore.getState().openTab("/a");
      await useTabsStore.getState().openTab("/b");
      useTabsStore.getState().activate("/a");
      toChanges();
    }
    /** A load held until the test fails it, for what the user does in the meantime. */
    function heldLoad() {
      const load = {} as { fail: () => void };
      const fake = () => new Promise<void>((_, reject) => (load.fail = () => reject(unreadable)));
      return { load, fake };
    }

    it("rejects with its error and goes back to the tab that was active, in its own view", async () => {
      await aActiveInChanges();
      await withOpenRepo(failing, () => expect(useTabsStore.getState().openTab("/c")).rejects.toMatchObject({ kind: "internal" }));
      expect(tabs().map((t) => t.path)).toEqual(["/a", "/b"]);
      // Not `/b`, the tab that took `/c`'s place.
      expect(useTabsStore.getState().active).toBe("/a");
      expect(useRepoStore.getState().repo?.id).toBe("/a");
      expect(view()).toBe("changes");
    });

    it("at a drop's slot goes back to the tab that was active too", async () => {
      await aActiveInChanges();
      // Slot 1: at slot 0, `/a` would take `/c`'s place and be the landing either way.
      await withOpenRepo(failing, () => expect(useTabsStore.getState().openTab("/c", 1)).rejects.toMatchObject({ kind: "internal" }));
      expect(tabs().map((t) => t.path)).toEqual(["/a", "/b"]);
      expect(useTabsStore.getState().active).toBe("/a");
      expect(view()).toBe("changes");
    });

    it("from the start screen goes back to it", async () => {
      await withOpenRepo(failing, () => expect(useTabsStore.getState().openTab("/c")).rejects.toMatchObject({ kind: "internal" }));
      expect(tabs()).toEqual([]);
      expect(useTabsStore.getState().active).toBeNull();
      expect(closeWindow).not.toHaveBeenCalled();
    });

    it("leaves the tab the user switched to during the open", async () => {
      await aActiveInChanges();
      const { load, fake } = heldLoad();
      await withOpenRepo(fake, async () => {
        const done = useTabsStore.getState().openTab("/c");
        await vi.waitFor(() => expect(load.fail).toBeDefined());
        useTabsStore.getState().activate("/b");
        load.fail();
        await expect(done).rejects.toMatchObject({ kind: "internal" });
      });
      expect(tabs().map((t) => t.path)).toEqual(["/a", "/b"]);
      expect(useTabsStore.getState().active).toBe("/b");
      expect(view()).toBe("history");
    });

    it("lands where `closeTab` picks when the tab that was active closed during the open", async () => {
      // Three tabs, so the slot's pick (`/d`, the last) is told from the first (`/b`).
      await aActiveInChanges();
      await useTabsStore.getState().openTab("/d");
      useTabsStore.getState().activate("/a");
      const { load, fake } = heldLoad();
      await withOpenRepo(fake, async () => {
        const done = useTabsStore.getState().openTab("/c");
        await vi.waitFor(() => expect(load.fail).toBeDefined());
        await useTabsStore.getState().closeTab("/a");
        load.fail();
        await expect(done).rejects.toMatchObject({ kind: "internal" });
      });
      expect(tabs().map((t) => t.path)).toEqual(["/b", "/d"]);
      expect(useTabsStore.getState().active).toBe("/d");
      expect(view()).toBe("history");
    });
  });

  it("the sidebar override stays the window's across a switch", async () => {
    await useTabsStore.getState().openTab("/a");
    await useTabsStore.getState().openTab("/b");
    useViewStore.getState().toggleRail(false);
    const before = useViewStore.getState().railOverride;
    useTabsStore.getState().activate("/a");
    expect(useViewStore.getState().railOverride).toEqual(before);
    expect(useViewStore.getState().railOverride.history).toBe(true);
  });
});

describe("the diff's scroll", () => {
  const at = (repoId: string, top: number): DiffScroll => ({ pane: "history", repoId, path: "a.ts", diff: {} as FileDiff, rows: [], view: "unified", top });
  beforeEach(forgetScroll);

  it("a switch moves the note into the tab left's snapshot and seeds the tab that comes back", async () => {
    await useTabsStore.getState().openTab("/a");
    await useTabsStore.getState().openTab("/b");
    noteScroll(at("/b", 120));
    useTabsStore.getState().activate("/a");
    expect(useTabsStore.getState().saved["/b"].scroll).toEqual(at("/b", 120));
    // Moved, not copied: /a's body mounts and notes its own place, and leaving /a saves that.
    noteScroll(at("/a", 0));
    useTabsStore.getState().activate("/b");
    expect(useTabsStore.getState().saved["/a"].scroll).toEqual(at("/a", 0));
    expect(takeSeed("history", "/b", "a.ts")).toEqual(at("/b", 120));

    // A tab whose body noted nothing (it stayed mounted through the switch) saves nothing, not the
    // tab before it's.
    useTabsStore.getState().activate("/a");
    expect(useTabsStore.getState().saved["/b"].scroll).toBeNull();
  });

  it("a new tab takes the note first, then forgets both; the last tab's close forgets both", async () => {
    await useTabsStore.getState().openTab("/a");
    noteScroll(at("/a", 40));
    seedScroll(at("/x", 10)); // one a switch left untaken
    await useTabsStore.getState().openTab("/b");
    expect(useTabsStore.getState().saved["/a"].scroll).toEqual(at("/a", 40));
    expect(takeSeed("history", "/x", "a.ts")).toBeNull();
    expect(takeNote()).toBeNull();

    await useTabsStore.getState().closeTab("/a");
    noteScroll(at("/b", 40));
    seedScroll(at("/b", 10));
    await useTabsStore.getState().closeTab("/b");
    expect(takeNote()).toBeNull();
    expect(takeSeed("history", "/b", "a.ts")).toBeNull();
  });
});

describe("markStale", () => {
  it("flags a background tab and leaves the active one alone", async () => {
    await useTabsStore.getState().openTab("/a");
    await useTabsStore.getState().openTab("/b");

    useTabsStore.getState().markStale("/a");
    useTabsStore.getState().markStale("/b");
    expect(tabs().map((t) => t.stale)).toEqual([true, false]);

    // Activating it is what clears the dot; the refresh comes with it.
    useTabsStore.getState().activate("/a");
    expect(tabs().map((t) => t.stale)).toEqual([false, false]);
  });
});

describe("closeTab", () => {
  it("hands the window to the next tab and lets the repository go", async () => {
    await useTabsStore.getState().openTab("/a");
    await useTabsStore.getState().openTab("/b");

    await useTabsStore.getState().closeTab("/b");
    expect(tabs().map((t) => t.path)).toEqual(["/a"]);
    expect(useTabsStore.getState().active).toBe("/a");
    expect(useRepoStore.getState().repo?.id).toBe("/a");
    expect(mocked.closeRepo).toHaveBeenCalledWith("/b");
  });

  it("the last tab of the main window leaves the start screen; of another window, closes it", async () => {
    await useTabsStore.getState().openTab("/a");
    await useTabsStore.getState().closeTab("/a");
    expect(tabs()).toEqual([]);
    expect(useRepoStore.getState().repo).toBeNull();
    expect(mocked.closeRepo).toHaveBeenCalledWith("/a");
    expect(closeWindow).not.toHaveBeenCalled();

    label = "w1";
    await useTabsStore.getState().openTab("/b");
    await useTabsStore.getState().closeTab("/b");
    expect(closeWindow).toHaveBeenCalled();
  });
});

describe("detach", () => {
  it("opens the window first, then gives the tab up", async () => {
    await useTabsStore.getState().openTab("/a");
    await useTabsStore.getState().openTab("/b");

    await useTabsStore.getState().detach("/b");
    expect(mocked.spawnWindow).toHaveBeenCalledWith({ tabs: ["/b"], active: "/b" }, null, expect.anything());
    expect(tabs().map((t) => t.path)).toEqual(["/a"]);
    expect(mocked.closeRepo).toHaveBeenCalledWith("/b");
  });

  /** Gives the active tab something of each kind to carry. */
  async function dress(n: number) {
    await settle();
    useCommitStore.setState({ summary: `wip ${n}`, body: "more", amend: true, signoff: true, sign: false, prefill: null });
    useRepoStore.setState({ spec: { kind: "head" }, filter: { text: "fix" }, rows: [row("c0"), row(`c${n}`)], selectedIndex: 1, wtSelected: false, log: { ...useRepoStore.getState().log, total: 1000 + n } });
    useViewStore.getState().setView("changes");
    noteTopRow(40 + n);
  }
  const dressed = (n: number): TabCarry => ({
    draft: { summary: `wip ${n}`, body: "more", amend: true, signoff: true, sign: false, prefill: null },
    spec: { kind: "head" },
    filter: { text: "fix" },
    selection: { oid: `c${n}` },
    view: "changes",
    topRow: 40 + n,
    total: 1000 + n,
  });

  it("carries the active tab's state from the live stores, its grid's top row and its walk's total", async () => {
    await useTabsStore.getState().openTab("/a");
    await useTabsStore.getState().openTab("/b");
    await dress(2);
    await useTabsStore.getState().detach("/b");
    expect(mocked.spawnWindow).toHaveBeenCalledWith({ tabs: ["/b"], active: "/b" }, null, dressed(2));
  });

  it("carries a background tab's from its snapshot: the top row its reveal keeps", async () => {
    await useTabsStore.getState().openTab("/a");
    await dress(1);
    await useTabsStore.getState().openTab("/b");
    noteTopRow(7);
    await useTabsStore.getState().detach("/a");
    expect(mocked.spawnWindow).toHaveBeenCalledWith({ tabs: ["/a"], active: "/a" }, null, dressed(1));
  });

  it("carries the working-tree row, not the commit under it", async () => {
    await useTabsStore.getState().openTab("/a");
    await useTabsStore.getState().openTab("/b");
    await dress(2);
    useRepoStore.setState({ filter: {}, wtSelected: true });
    await useTabsStore.getState().detach("/b");
    expect(mocked.spawnWindow).toHaveBeenCalledWith({ tabs: ["/b"], active: "/b" }, null, { ...dressed(2), filter: {}, selection: "workingTree" });
  });

  it("keeps the tab when the window could not be opened", async () => {
    await useTabsStore.getState().openTab("/a");
    await useTabsStore.getState().openTab("/b");
    mocked.spawnWindow.mockRejectedValueOnce({ kind: "internal", message: "no window" });

    await useTabsStore.getState().detach("/b");
    expect(tabs().map((t) => t.path)).toEqual(["/a", "/b"]);
    expect(mocked.closeRepo).not.toHaveBeenCalled();
  });

  it("does nothing with one tab: the window is already its own", async () => {
    await useTabsStore.getState().openTab("/a");

    await useTabsStore.getState().detach("/a");
    expect(mocked.spawnWindow).not.toHaveBeenCalled();
    expect(tabs().map((t) => t.path)).toEqual(["/a"]);
    expect(mocked.closeRepo).not.toHaveBeenCalled();
  });
});

describe("reorder", () => {
  it("moves a tab to another index and ignores anything out of range", async () => {
    await useTabsStore.getState().openTab("/a");
    await useTabsStore.getState().openTab("/b");
    await useTabsStore.getState().openTab("/c");

    useTabsStore.getState().reorder(2, 0);
    expect(tabs().map((t) => t.path)).toEqual(["/c", "/a", "/b"]);
    useTabsStore.getState().reorder(0, 9);
    expect(tabs().map((t) => t.path)).toEqual(["/c", "/a", "/b"]);
  });
});

describe("an open dialog", () => {
  // A dialog reads the open repository when it confirms: every switch has to close it first.
  it("is closed by every switch of the window's repository", async () => {
    const open = () => useDialogStore.getState().open({ kind: "createBranch" });
    const dialog = () => useDialogStore.getState().dialog;
    await useTabsStore.getState().openTab("/a");
    open();
    await useTabsStore.getState().openTab("/b");
    expect(dialog()).toBeNull();

    open();
    useTabsStore.getState().activate("/a");
    expect(dialog()).toBeNull();

    open();
    await useTabsStore.getState().closeTab("/a");
    expect(useTabsStore.getState().active).toBe("/b");
    expect(dialog()).toBeNull();
  });
});

describe("draftRepos", () => {
  it("names the active tab's draft and every background tab's", () => {
    useTabsStore.setState({
      tabs: [
        { id: "a", path: "/a", name: "alpha", stale: false },
        { id: "b", path: "/b", name: "beta", stale: false },
        { id: "c", path: "/c", name: "gamma", stale: false },
      ],
      active: "a",
      saved: {
        b: { commit: { summary: "wip", body: "", prefill: null } } as unknown as Snapshot,
        c: { commit: { summary: "", body: "", prefill: null } } as unknown as Snapshot,
      },
    });
    useCommitStore.setState({ summary: "", body: "", prefill: null });
    expect(draftRepos()).toEqual(["beta"]);
    useCommitStore.setState({ summary: "typed" });
    expect(draftRepos()).toEqual(["alpha", "beta"]);
  });
});
