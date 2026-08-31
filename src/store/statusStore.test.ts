import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot, RepoSummary, WorkdirStatus } from "../api/types";

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
import { useRepoStore } from "./repoStore";
import { STATUS_DEBOUNCE_MS, useStatusStore } from "./statusStore";

const mocked = ipc as unknown as Record<"getStatus" | "getRefs" | "refreshLabels" | "startLog", ReturnType<typeof vi.fn>>;
const REPO: RepoSummary = { id: "r1", name: "r1", path: "r1", head: { oid: "h1", branch: "main", detached: false } };
const status = (n: number): WorkdirStatus => ({
  entries: Array.from({ length: n }, (_, i) => ({ path: `f${i}`, oldPath: null, index: null, workdir: "modified", conflicted: false })),
  staged: 0,
  unstaged: n,
  untracked: 0,
  conflicted: 0,
});
const refs = (oid: string): RefsSnapshot => ({ head: { oid, branch: "main", detached: false }, state: "clean", local: [], remotes: [], tags: [], stashes: [] });
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getStatus.mockResolvedValue(status(2));
  mocked.getRefs.mockResolvedValue(refs("h1"));
  mocked.refreshLabels.mockResolvedValue(1);
  mocked.startLog.mockResolvedValue(2);
  // Opening a repo triggers one refresh via the store subscription; not what these tests count.
  useRepoStore.setState({ repo: REPO, refs: refs("h1"), log: { generation: 1, total: 0, complete: true, error: null, flat: false }, wtSelected: false });
  useStatusStore.setState({ status: null, error: null });
  mocked.getStatus.mockClear();
});
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

  it("refs kind: refreshes refs + labels; a moved HEAD restarts the walk", async () => {
    vi.useFakeTimers();
    useStatusStore.getState().onChanged({ repoId: "r1", kinds: ["index", "refs"], rescan: false });
    await vi.runAllTimersAsync();
    expect(mocked.getRefs).toHaveBeenCalledTimes(1);
    expect(mocked.refreshLabels).toHaveBeenCalledTimes(1);
    expect(mocked.startLog).not.toHaveBeenCalled();

    mocked.getRefs.mockResolvedValue(refs("h2"));
    useStatusStore.getState().onChanged({ repoId: "r1", kinds: ["refs"], rescan: false });
    await vi.runAllTimersAsync();
    expect(mocked.startLog).toHaveBeenCalledTimes(1);
    expect(mocked.refreshLabels).toHaveBeenCalledTimes(1);
  });

  it("a clean tree drops the working-tree selection", async () => {
    useRepoStore.setState({ wtSelected: true });
    mocked.getStatus.mockResolvedValue(status(0));
    await useStatusStore.getState().refresh();
    expect(useRepoStore.getState().wtSelected).toBe(false);
  });
});
