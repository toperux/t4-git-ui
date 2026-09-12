import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot, RepoState, RepoSummary, WorkdirStatus } from "../api/types";

vi.mock("../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/ipc")>();
  return {
    ...actual,
    getStatus: vi.fn(),
    getRefs: vi.fn(),
    refreshLabels: vi.fn(),
    startLog: vi.fn(),
    getLogPage: vi.fn(() => new Promise(() => {})),
  };
});

import * as ipc from "../api/ipc";
import { __resetForTests as resetRepo, useRepoStore } from "./repoStore";
import { __resetForTests as resetStatus, STATUS_DEBOUNCE_MS, useShowWorkingTree, useStatusStore } from "./statusStore";
import { useToastStore } from "./toastStore";

const mocked = ipc as unknown as Record<"getStatus" | "getRefs" | "refreshLabels" | "startLog" | "getLogPage", ReturnType<typeof vi.fn>>;
const REPO: RepoSummary = { id: "r1", name: "r1", path: "r1", head: { oid: "h1", branch: "main", detached: false } };
const status = (n: number, state: RepoState = "clean"): WorkdirStatus => ({
  entries: Array.from({ length: n }, (_, i) => ({ path: `f${i}`, oldPath: null, index: null, workdir: "modified", conflicted: false, workdirStamp: "1:1" })),
  staged: 0,
  unstaged: n,
  untracked: 0,
  conflicted: 0,
  state,
});
const refs = (oid: string, tags: string[] = []): RefsSnapshot => ({
  head: { oid, branch: "main", detached: false },
  state: "clean",
  local: [],
  remotes: [],
  tags: tags.map((name) => ({ name, oid, message: null })),
  stashes: [],
});
const withRemote = (headOid: string, originOid: string): RefsSnapshot => ({
  ...refs(headOid),
  remotes: [{ name: "origin", url: null, branches: [{ name: "origin/main", oid: originOid, mergedInto: null }] }],
});
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  // `resetAllMocks`: a `mockImplementation` from one test must not leak into another's `...Once` chain.
  vi.resetAllMocks();
  resetStatus();
  resetRepo();
  useToastStore.setState({ toasts: [] });
  mocked.getLogPage.mockImplementation(() => new Promise(() => {}));
  mocked.getStatus.mockResolvedValue(status(2));
  mocked.getRefs.mockResolvedValue(refs("h1"));
  mocked.refreshLabels.mockResolvedValue(1);
  mocked.startLog.mockResolvedValue(2);
  // Opening a repo triggers one refresh via the store subscription; not what these tests count, so it
  // is awaited here. `workingTree: true` is what the dirty status it lands on wants, so it re-walks nothing.
  useRepoStore.setState({
    repo: REPO,
    refs: refs("h1"),
    filter: { workingTree: true },
    log: { generation: 1, total: 0, complete: true, error: null, flat: false },
    wtSelected: false,
  });
  await flush();
  useStatusStore.setState({ error: null });
  mocked.getStatus.mockClear();
});
// Vitest runs without `globals`, so RTL never auto-cleans: `renderHook` would leak into the next file.
afterEach(cleanup);
afterEach(() => vi.useRealTimers());

describe("statusStore", () => {
  it("ignores events for other repositories", () => {
    useStatusStore.getState().onChanged({ repoId: "other", kinds: ["workdir"], rescan: false });
    expect(mocked.getStatus).not.toHaveBeenCalled();
  });

  it("debounces bursts of events into one get_status", async () => {
    vi.useFakeTimers();
    const st = useStatusStore.getState();
    st.onChanged({ repoId: "r1", kinds: ["workdir"], rescan: false });
    st.onChanged({ repoId: "r1", kinds: ["workdir"], rescan: false });
    vi.advanceTimersByTime(STATUS_DEBOUNCE_MS - 10);
    st.onChanged({ repoId: "r1", kinds: ["index"], rescan: false });
    expect(mocked.getStatus).not.toHaveBeenCalled();
    vi.advanceTimersByTime(STATUS_DEBOUNCE_MS);
    expect(mocked.getStatus).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(useStatusStore.getState().status?.entries).toHaveLength(2);
  });

  it("drops a stale response that resolves after a newer one", async () => {
    let resolveSlow!: (s: WorkdirStatus) => void;
    mocked.getStatus.mockImplementationOnce(() => new Promise<WorkdirStatus>((r) => (resolveSlow = r))).mockResolvedValueOnce(status(3));
    const st = useStatusStore.getState();
    void st.refresh();
    await st.refresh();
    expect(useStatusStore.getState().status?.entries).toHaveLength(3);
    resolveSlow(status(1));
    await flush();
    expect(useStatusStore.getState().status?.entries).toHaveLength(3);
  });

  it("refs kind: relabels when a ref changed; a moved HEAD restarts the walk", async () => {
    vi.useFakeTimers();
    mocked.getRefs.mockResolvedValue(refs("h1", ["v1.0"]));
    useStatusStore.getState().onChanged({ repoId: "r1", kinds: ["index", "refs"], rescan: false });
    await vi.runAllTimersAsync();
    expect(mocked.getRefs).toHaveBeenCalledTimes(1);
    expect(mocked.refreshLabels).toHaveBeenCalledTimes(1);
    expect(mocked.startLog).not.toHaveBeenCalled();

    mocked.getRefs.mockResolvedValue(refs("h2", ["v1.0"]));
    useStatusStore.getState().onChanged({ repoId: "r1", kinds: ["refs"], rescan: false });
    await vi.runAllTimersAsync();
    expect(mocked.startLog).toHaveBeenCalledTimes(1);
    expect(mocked.refreshLabels).toHaveBeenCalledTimes(1);
  });

  it("a checkout between two branches the walk already had restarts a seeded walk, relabels an unseeded one", async () => {
    vi.useFakeTimers();
    // `main` at h1 and `other` at h2 are both in the walk either way; only HEAD moves.
    const two = (head: string): RefsSnapshot => ({
      ...refs(head),
      local: [
        { name: "main", oid: "h1", upstream: null, gone: false, mergedInto: null, ahead: 0, behind: 0, isHead: head === "h1" },
        { name: "other", oid: "h2", upstream: null, gone: false, mergedInto: null, ahead: 0, behind: 0, isHead: head === "h2" },
      ],
    });
    // The clean status first: the refs are what decides the seed, so arriving at an unseeded walk
    // with a dirty status still in the store would (correctly) re-seed it.
    useStatusStore.setState({ status: status(0) });
    useRepoStore.setState({ refs: two("h1"), filter: {} });
    mocked.getStatus.mockResolvedValue(status(0));
    mocked.getRefs.mockResolvedValue(two("h2"));
    useStatusStore.getState().onChanged({ repoId: "r1", kinds: ["refs"], rescan: false });
    await vi.runAllTimersAsync();
    expect(mocked.startLog).not.toHaveBeenCalled();
    expect(mocked.refreshLabels).toHaveBeenCalledTimes(1);

    // Seeded: the layout is built around HEAD, so the same commits with a new HEAD are a new walk.
    useRepoStore.setState({ filter: { workingTree: true } });
    useStatusStore.setState({ status: status(1) });
    mocked.getStatus.mockResolvedValue(status(1));
    mocked.getRefs.mockResolvedValue(two("h1"));
    useStatusStore.getState().onChanged({ repoId: "r1", kinds: ["refs"], rescan: false });
    await vi.runAllTimersAsync();
    expect(mocked.startLog).toHaveBeenCalledTimes(1);
    expect(mocked.startLog).toHaveBeenCalledWith("r1", { kind: "all" }, { workingTree: true });
    expect(mocked.refreshLabels).toHaveBeenCalledTimes(1);
  });

  it("ignores a refs event whose snapshot is unchanged (a terminal `git fetch` rewrites FETCH_HEAD)", async () => {
    vi.useFakeTimers();
    // The watcher classifies FETCH_HEAD / logs/* / config writes as `refs`, but nothing actually moved.
    useStatusStore.getState().onChanged({ repoId: "r1", kinds: ["refs"], rescan: false });
    await vi.runAllTimersAsync();
    expect(mocked.getRefs).toHaveBeenCalledTimes(1);
    expect(mocked.refreshLabels).not.toHaveBeenCalled();
    expect(mocked.startLog).not.toHaveBeenCalled();
  });

  it("a fetch that moved a remote branch restarts the walk", async () => {
    // `all` walks refs/remotes/* as well, so commits that arrive on origin/main belong in the grid.
    // HEAD does not move during a fetch, and relabelling cannot add rows a walk never produced.
    useRepoStore.setState({ refs: withRemote("h1", "r1") });
    mocked.getRefs.mockResolvedValue(withRemote("h1", "r2"));

    await useStatusStore.getState().syncRefs();

    expect(mocked.startLog).toHaveBeenCalledTimes(1);
    expect(mocked.refreshLabels).not.toHaveBeenCalled();
  });

  it("the same fetch only relabels a walk scoped to HEAD", async () => {
    // Nothing off HEAD is in this walk, so a moved remote branch can only change a label.
    useRepoStore.setState({ spec: { kind: "head" }, refs: withRemote("h1", "r1") });
    mocked.getRefs.mockResolvedValue(withRemote("h1", "r2"));

    await useStatusStore.getState().syncRefs();

    expect(mocked.startLog).not.toHaveBeenCalled();
    expect(mocked.refreshLabels).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent syncRefs into one refs fetch and one walk", async () => {
    mocked.getRefs.mockResolvedValue(refs("h2"));
    const st = useStatusStore.getState();
    // The `repo://changed` handler and `runOp` both ask right after a HEAD-moving operation.
    await Promise.all([st.syncRefs(), st.syncRefs()]);
    expect(mocked.getRefs).toHaveBeenCalledTimes(1);
    expect(mocked.startLog).toHaveBeenCalledTimes(1);
  });

  it("syncRefs never rejects: a failing getRefs is handled inside", async () => {
    mocked.getRefs.mockRejectedValue({ kind: "git", message: "boom" });
    await expect(useStatusStore.getState().syncRefs()).resolves.toBeUndefined();
  });

  it("a rescan syncs refs even without a `refs` kind", async () => {
    vi.useFakeTimers();
    useStatusStore.getState().onChanged({ repoId: "r1", kinds: ["workdir"], rescan: true });
    await vi.runAllTimersAsync();
    expect(mocked.getStatus).toHaveBeenCalledTimes(1);
    expect(mocked.getRefs).toHaveBeenCalledTimes(1);
  });

  it("a failing get_status lands in `error` and leaves the last status alone", async () => {
    await useStatusStore.getState().refresh();
    expect(useStatusStore.getState().status?.entries).toHaveLength(2);
    mocked.getStatus.mockRejectedValue({ kind: "git", message: "index is locked" });
    await useStatusStore.getState().refresh();
    expect(useStatusStore.getState().error).toBe("index is locked");
    expect(useStatusStore.getState().status?.entries).toHaveLength(2);
    // A later success clears the error.
    mocked.getStatus.mockResolvedValue(status(1));
    await useStatusStore.getState().refresh();
    expect(useStatusStore.getState().error).toBeNull();
  });

  it("refresh with no repo open clears the status", async () => {
    await useStatusStore.getState().refresh();
    expect(useStatusStore.getState().status).not.toBeNull();
    useRepoStore.setState({ repo: null });
    await useStatusStore.getState().refresh();
    expect(useStatusStore.getState().status).toBeNull();
    expect(mocked.getStatus).toHaveBeenCalledTimes(1);
  });

  it("compares the refs snapshot without stringifying it", async () => {
    await useStatusStore.getState().syncRefs();
    const stringify = vi.spyOn(JSON, "stringify");
    await useStatusStore.getState().syncRefs();
    expect(stringify).not.toHaveBeenCalled();
    stringify.mockRestore();
  });

  it("a failing syncRefs toasts once", async () => {
    mocked.getRefs.mockRejectedValue({ kind: "git", message: "boom" });
    await useStatusStore.getState().syncRefs();
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0]).toMatchObject({ kind: "error", title: "Couldn't refresh references" });
  });

  it("stays quiet for a closed repo, but reports a real internal failure", async () => {
    mocked.getRefs.mockRejectedValue({ kind: "notOpen", message: "repo not open: r1" });
    await useStatusStore.getState().syncRefs();
    expect(useToastStore.getState().toasts).toHaveLength(0);

    mocked.getRefs.mockRejectedValue({ kind: "internal", message: "blocking task failed" });
    await useStatusStore.getState().syncRefs();
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it("a clean tree drops the working-tree selection", async () => {
    useRepoStore.setState({ wtSelected: true });
    mocked.getStatus.mockResolvedValue(status(0));
    await useStatusStore.getState().refresh();
    expect(useRepoStore.getState().wtSelected).toBe(false);
  });

  it("a merge whose resolution equals HEAD keeps the working-tree selection and its row", async () => {
    useRepoStore.setState({ wtSelected: true, refs: { ...refs("h1"), state: "merge" } });
    mocked.getStatus.mockResolvedValue(status(0));
    await useStatusStore.getState().refresh();
    expect(useRepoStore.getState().wtSelected).toBe(true);
    expect(renderHook(() => useShowWorkingTree()).result.current).toBe(true);
    // `commit()` refreshes the status before the refs: the merge ending afterwards drops the row.
    useRepoStore.setState({ refs: refs("h2") });
    expect(useRepoStore.getState().wtSelected).toBe(false);
  });

  it("a text filter flattens the walk: no pseudo-row, mid-merge included", async () => {
    // The flat walk has no row to hang it on, so the grid's index math must not count one either.
    useRepoStore.setState({ refs: { ...refs("h1"), state: "merge" }, log: { generation: 1, total: 0, complete: true, error: null, flat: true } });
    mocked.getStatus.mockResolvedValue(status(2));
    await useStatusStore.getState().refresh();
    expect(renderHook(() => useShowWorkingTree()).result.current).toBe(false);
  });

  it("a tree turning dirty re-walks with HEAD's column seeded, and stays there", async () => {
    useRepoStore.setState({ filter: {} });
    useStatusStore.setState({ status: status(0) });
    await useStatusStore.getState().refresh();
    expect(mocked.startLog).toHaveBeenCalledWith("r1", { kind: "all" }, { workingTree: true });
    // The restart stored the flag, so a second dirty status is not another walk.
    await useStatusStore.getState().refresh();
    expect(mocked.startLog).toHaveBeenCalledTimes(1);
  });

  it("opening a dirty repository seeds the walk once the refs land", async () => {
    // `openRepo` leaves `refs: null` and `filter: {}`, and the status lands first: nothing is fresh
    // yet, so the seed is only decidable once the refs snapshot arrives.
    useRepoStore.setState({ refs: null, filter: {} });
    await useStatusStore.getState().refresh();
    expect(mocked.startLog).not.toHaveBeenCalled();

    useRepoStore.setState({ refs: refs("h1") });
    await flush();
    expect(mocked.startLog).toHaveBeenCalledWith("r1", { kind: "all" }, { workingTree: true });
  });

  it("a commit in a terminal on a dirty tree walks once, from the tree as it is now", async () => {
    vi.useFakeTimers();
    // The watcher schedules the status refresh and syncs the refs at once: taking the seed from the
    // status the commit has already cleared would walk seeded, then unseeded 100 ms later.
    useStatusStore.setState({ status: status(2) });
    mocked.getStatus.mockResolvedValue(status(0));
    mocked.getRefs.mockResolvedValue(refs("h2"));
    useStatusStore.getState().onChanged({ repoId: "r1", kinds: ["refs"], rescan: false });
    await vi.runAllTimersAsync();
    expect(mocked.startLog).toHaveBeenCalledTimes(1);
    expect(mocked.startLog).toHaveBeenCalledWith("r1", { kind: "all" }, { workingTree: false });
  });

  it("a merge still to commit seeds the column even with an empty status", async () => {
    useRepoStore.setState({ filter: {}, refs: { ...refs("h1"), state: "merge" } });
    mocked.getStatus.mockResolvedValue(status(0));
    await useStatusStore.getState().refresh();
    expect(mocked.startLog).toHaveBeenCalledWith("r1", { kind: "all" }, { workingTree: true });
  });

  it("a tree turning clean re-walks without the seed", async () => {
    mocked.getStatus.mockResolvedValue(status(0));
    await useStatusStore.getState().refresh();
    expect(mocked.startLog).toHaveBeenCalledTimes(1);
    expect(mocked.startLog).toHaveBeenCalledWith("r1", { kind: "all" }, { workingTree: false });
  });

  it("a stopped rebase with an empty status has no pseudo-row: only a merge is committed from the panel", async () => {
    useRepoStore.setState({ refs: { ...refs("h1"), state: "rebase" } });
    // Scanned during the rebase: a `clean` one would predate the stop and say nothing about it.
    mocked.getStatus.mockResolvedValue(status(0, "rebase"));
    await useStatusStore.getState().refresh();
    expect(renderHook(() => useShowWorkingTree()).result.current).toBe(false);
  });

  it("a status scanned in another state is 'not known yet': no drop, no re-walk, the row stays", async () => {
    // The refs already say `rebase`; this status still describes the tree as it was before the stop.
    useRepoStore.setState({ wtSelected: true, refs: { ...refs("h1"), state: "rebase" } });
    mocked.getStatus.mockResolvedValue(status(0));
    await useStatusStore.getState().refresh();
    expect(useRepoStore.getState().wtSelected).toBe(true);
    expect(mocked.startLog).not.toHaveBeenCalled();
    expect(renderHook(() => useShowWorkingTree()).result.current).toBe(true);
  });
});
