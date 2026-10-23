import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("./lib/kv", () => ({
  kvGet: vi.fn((key: string) => Promise.resolve(key === "lastOpen" ? lastOpen : null)),
  kvSet: vi.fn(() => Promise.resolve()),
}));
vi.mock("./api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/ipc")>();
  return {
    ...actual,
    probeGit: vi.fn(),
    setGitPath: vi.fn(),
    takePending: vi.fn(() => Promise.resolve(null)),
    takeLayout: vi.fn(() => Promise.resolve({ layouts: [], crashed: false, kept: false })),
    spawnWindow: vi.fn(() => Promise.resolve("w1")),
    setLayout: vi.fn(() => Promise.resolve()),
    getTools: vi.fn(() => Promise.resolve({ diff: null, merge: null })),
    lastUpdateCheck: vi.fn(() => Promise.resolve({ checked: false, info: null })),
  };
});
vi.mock("./api/events", () => ({
  onLogProgress: vi.fn(() => () => {}),
  onRepoChanged: vi.fn(() => () => {}),
  onOpEvent: vi.fn(() => () => {}),
  onSettingsChanged: vi.fn(() => () => {}),
  onTabSpawnFailed: vi.fn(() => () => {}),
  onTabDragOver: vi.fn(() => () => {}),
  onTabDragOut: vi.fn(() => () => {}),
  onTabAdopt: vi.fn(() => () => {}),
  onUpdateCheckedReady: vi.fn(() => Promise.resolve(() => {})),
}));

import * as events from "./api/events";
import * as ipc from "./api/ipc";
import App from "./App";
import { useCommitStore } from "./store/commitStore";
import { useDialogStore } from "./store/dialogStore";
import { useOpsStore } from "./store/opsStore";
import { useRecentsStore } from "./store/recentsStore";
import { type TabCarry, useTabsStore } from "./store/tabsStore";
import { useToastStore } from "./store/toastStore";
import { useUpdateStore } from "./store/updateStore";

const mocked = ipc as unknown as Record<
  "probeGit" | "takePending" | "takeLayout" | "spawnWindow" | "setLayout" | "lastUpdateCheck",
  ReturnType<typeof vi.fn>
>;
const openTab = vi.fn((_path: string, _at?: number, _carry?: TabCarry | null) => Promise.resolve());
/** A moved tab's state, as another window sent it. */
const carry: TabCarry = {
  draft: { summary: "wip", body: "", amend: false, signoff: false, sign: null, prefill: null },
  spec: { kind: "all" },
  filter: { text: "fix" },
  selection: { oid: "c2" },
  view: "changes",
  topRow: 40,
  total: 900,
};
/** Makes `openTab` add its tab, as the real one does once the repository opened: at `at`, else on the end. */
const openTabAdds = () =>
  openTab.mockImplementation(async (p, at) =>
    useTabsStore.setState((s) => {
      const tabs = s.tabs.slice();
      tabs.splice(at ?? tabs.length, 0, { id: p, path: p, name: p, stale: false });
      return { tabs, active: p };
    }),
  );
/** What the kv store holds for `lastOpen` — the pre-tabs way of reopening a repository. */
let lastOpen: string | null = null;

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  openTab.mockReset();
  mocked.probeGit.mockResolvedValue({ version: "git version 2.51.0", tooOld: false });
  mocked.takePending.mockResolvedValue(null);
  mocked.takeLayout.mockResolvedValue({ layouts: [], crashed: false, kept: false });
  useTabsStore.setState({ tabs: [], active: null, saved: {}, openTab: openTab as never });
  lastOpen = null;
  useRecentsStore.setState({ recents: [], lastOpen: null, lastCloneDir: null });
  useToastStore.setState({ toasts: [] });
  useOpsStore.setState({ busy: null });
  useCommitStore.setState({ busy: false, inCommit: false });
  useDialogStore.getState().close();
});

/** The launch has several awaits in it; this lets them all settle. */
const settled = () => act(() => new Promise((r) => setTimeout(r, 0)));

describe("App", () => {
  it("restores every window of the last exit: its own tabs here, a window for each of the others", async () => {
    mocked.takeLayout.mockResolvedValue({
      layouts: [
        { tabs: ["/a", "/b"], active: "/b" },
        { tabs: ["/c"], active: "/c" },
      ],
      crashed: false,
      kept: false,
    });
    render(<App />);
    await settled();
    expect(openTab.mock.calls).toEqual([["/a", undefined, null], ["/b", undefined, null]]);
    // A restore hands nothing over: no carry, so the backend moves no repository claim.
    expect(mocked.spawnWindow).toHaveBeenCalledWith({ tabs: ["/c"], active: "/c" }, null, null);
  });

  it("keeps restoring the rest when one repository will not open", async () => {
    mocked.takeLayout.mockResolvedValue({ layouts: [{ tabs: ["/gone", "/b"], active: "/b" }], crashed: false, kept: false });
    openTab.mockRejectedValueOnce({ kind: "internal", message: "not a repository" });
    render(<App />);
    await settled();
    expect(openTab.mock.calls).toEqual([["/gone", undefined, null], ["/b", undefined, null]]);
  });

  it("a window created with tabs opens those, and asks for no layout", async () => {
    mocked.takePending.mockResolvedValue({ tabs: ["/d"], active: "/d" });
    render(<App />);
    await settled();
    expect(openTab.mock.calls).toEqual([["/d", undefined, null]]);
    expect(mocked.takeLayout).not.toHaveBeenCalled();
    expect(mocked.spawnWindow).not.toHaveBeenCalled();
  });

  it("a window created for a moved tab opens it with its carry", async () => {
    mocked.takePending.mockResolvedValue({ tabs: ["/d"], active: "/d", carry });
    render(<App />);
    await settled();
    expect(openTab.mock.calls).toEqual([["/d", undefined, carry]]);
  });

  it("with no layout yet (the first launch after the upgrade) falls back to the last repository", async () => {
    lastOpen = "/last";
    render(<App />);
    await settled();
    expect(openTab.mock.calls).toEqual([["/last"]]);
  });

  it("sends a git below the 2.24 floor to the missing screen, naming the version", async () => {
    mocked.probeGit.mockResolvedValue({ version: "git version 2.23.0", tooOld: true });
    const { findByText, getByText } = render(<App />);
    expect(await findByText(/Found git version 2\.23\.0, which is older than the required git 2\.24\./)).toBeTruthy();
    expect(getByText("Git not found")).toBeTruthy();
  });

  it("reports its layout once restoring is done, even when no repository opened", async () => {
    mocked.takePending.mockResolvedValue({ tabs: ["/gone"], active: "/gone" });
    openTab.mockRejectedValueOnce({ kind: "internal", message: "not a repository" });
    render(<App />);
    await settled();
    expect(mocked.setLayout).toHaveBeenCalledWith({ tabs: [], active: "" }, true);
    expect(mocked.setLayout).toHaveBeenCalledTimes(1);
  });

  it("reports nothing while restoring, then the whole layout once: the saved entry is never shrunk", async () => {
    mocked.takeLayout.mockResolvedValue({ layouts: [{ tabs: ["/a", "/b"], active: "/b" }], crashed: false, kept: false });
    openTabAdds();
    render(<App />);
    await settled();
    expect(mocked.setLayout).toHaveBeenCalledTimes(1);
    expect(mocked.setLayout).toHaveBeenCalledWith({ tabs: ["/a", "/b"], active: "/b" }, true);
  });

  it("a last repository that no longer opens still gets the one-shot report, and is forgotten", async () => {
    lastOpen = "/gone";
    openTabAdds();
    openTab.mockRejectedValueOnce({ kind: "internal", message: "not a repository" });
    render(<App />);
    await settled();
    expect(mocked.setLayout.mock.calls).toEqual([[{ tabs: [], active: "" }, true]]);
    expect(useRecentsStore.getState().lastOpen).toBeNull();
    // The hold ends however restoring ends: later changes are reported, without `restored`.
    await act(() => useTabsStore.getState().openTab("/x"));
    expect(mocked.setLayout.mock.calls[1]).toEqual([{ tabs: ["/x"], active: "/x" }]);
  });

  it("after a launch that died restoring, opens nothing, forgets lastOpen and says so", async () => {
    lastOpen = "/crasher";
    mocked.takeLayout.mockResolvedValue({ layouts: [], crashed: true, kept: true });
    render(<App />);
    await settled();
    expect(openTab).not.toHaveBeenCalled();
    expect(mocked.spawnWindow).not.toHaveBeenCalled();
    expect(useRecentsStore.getState().lastOpen).toBeNull();
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ kind: "error", title: "Your last session wasn't reopened" });
    expect(toasts[0].detail).toMatch(/started empty this time\. Your repositories are still in Recents\. The saved windows are in layout\.crashed\.json\.$/);
    expect(mocked.setLayout.mock.calls).toEqual([[{ tabs: [], active: "" }, true]]);
  });

  it("names no file when the crashed launch left none to set aside", async () => {
    mocked.takeLayout.mockResolvedValue({ layouts: [], crashed: true, kept: false });
    render(<App />);
    await settled();
    const [toast] = useToastStore.getState().toasts;
    expect(toast.detail).toMatch(/Your repositories are still in Recents\.$/);
  });

  it("reports nothing when the recents fail to load: restoring never ran, so the layout on disk is untouched", async () => {
    const load = useRecentsStore.getState().load;
    useRecentsStore.setState({ load: () => Promise.reject(new Error("store unreadable")) });
    try {
      render(<App />);
      await settled();
      expect(mocked.takeLayout).not.toHaveBeenCalled();
      expect(mocked.setLayout).not.toHaveBeenCalled();
    } finally {
      useRecentsStore.setState({ load });
    }
  });

  it("asks for the last update answer only once the update listener is attached", async () => {
    let ready!: (unlisten: () => void) => void;
    vi.mocked(events.onUpdateCheckedReady).mockReturnValueOnce(new Promise((r) => (ready = r)));
    const info = { version: "9.9.9", installable: true };
    mocked.lastUpdateCheck.mockResolvedValueOnce({ checked: true, info });
    render(<App />);
    await settled();
    expect(mocked.lastUpdateCheck).not.toHaveBeenCalled();
    await act(async () => ready(() => {}));
    await settled();
    expect(mocked.lastUpdateCheck).toHaveBeenCalledTimes(1);
    expect(useUpdateStore.getState().info).toEqual(info);
  });

  it("an update answer heard while the last-answer read is pending wins over that read's reply", async () => {
    let heard!: (info: unknown) => void;
    vi.mocked(events.onUpdateCheckedReady).mockImplementationOnce((cb) => {
      heard = cb as never;
      return Promise.resolve(() => {});
    });
    let reply!: (c: unknown) => void;
    mocked.lastUpdateCheck.mockReturnValueOnce(new Promise((r) => (reply = r)));
    const older = { version: "1.0.0", installable: true };
    const newer = { version: "2.0.0", installable: true };
    render(<App />);
    await settled();
    act(() => heard(newer));
    await act(async () => reply({ checked: true, info: older }));
    await settled();
    expect(useUpdateStore.getState().info).toEqual(newer);
  });

  it("reports nothing when git is missing: the layout on disk has not been taken yet", async () => {
    mocked.probeGit.mockResolvedValue({ version: "git version 2.23.0", tooOld: true });
    const { findByText } = render(<App />);
    await findByText("Git not found");
    await settled();
    expect(mocked.setLayout).not.toHaveBeenCalled();
  });
});

describe("a tab that lands in this window from another one", () => {
  // Neither can be refused: a dropped tab's repository has already moved here, and a taken-back one
  // already left this window. Each waits for the operation, the commit or the dialog instead.
  const adopt = (path: string) => act(() => vi.mocked(events.onTabAdopt).mock.lastCall![0]({ path, x: 0, carry }));
  // A restore's multi-tab window carries nothing; a hand-over's one tab does.
  const spawnFailed = (paths: string[], moved: TabCarry | null = null) => act(() => vi.mocked(events.onTabSpawnFailed).mock.lastCall![0](paths, moved));
  const paths = () => useTabsStore.getState().tabs.map((t) => t.path);
  const infos = () => useToastStore.getState().toasts.filter((t) => t.kind === "info");

  beforeEach(async () => {
    openTabAdds();
    render(<App />);
    await settled();
    // Two tabs, no strip in the DOM: a drop measures slot 0.
    useTabsStore.setState({ tabs: [{ id: "/a", path: "/a", name: "a", stale: false }, { id: "/b", path: "/b", name: "b", stale: false }], active: "/a" });
  });

  it("dropped while nothing runs, opens at once in its slot, never on the end first", async () => {
    const shown: string[][] = [];
    const unsubscribe = useTabsStore.subscribe((st) => shown.push(st.tabs.map((t) => t.path)));
    adopt("/c");
    expect(openTab).toHaveBeenCalledWith("/c", 0, carry);
    await settled();
    unsubscribe();
    expect(paths()).toEqual(["/c", "/a", "/b"]);
    expect(shown.filter((order) => order.includes("/c"))).toEqual([["/c", "/a", "/b"]]);
    expect(infos()).toEqual([]);
  });

  it("dropped while an operation runs, waits for it, then opens in its slot; several in the order they came", async () => {
    useOpsStore.setState({ busy: "Fetching origin…" });
    adopt("/c");
    adopt("/d");
    await settled();
    expect(openTab).not.toHaveBeenCalled();
    expect(paths()).toEqual(["/a", "/b"]);
    expect(infos().map((t) => t.detail)).toEqual(["c opens when the current operation or dialog closes", "d opens when the current operation or dialog closes"]);

    act(() => useOpsStore.setState({ busy: null }));
    await vi.waitFor(() => expect(paths()).toEqual(["/d", "/c", "/a", "/b"]));
    expect(openTab.mock.calls).toEqual([["/c", 0, carry], ["/d", 0, carry]]);
  });

  it("taken back from a window that never opened, while a commit runs, waits for it too", async () => {
    useCommitStore.setState({ busy: true });
    spawnFailed(["/c", "/d"]);
    await settled();
    expect(openTab).not.toHaveBeenCalled();
    expect(infos().map((t) => t.detail)).toEqual(["c opens when the current operation or dialog closes", "d opens when the current operation or dialog closes"]);

    act(() => useCommitStore.setState({ busy: false }));
    await vi.waitFor(() => expect(paths()).toEqual(["/a", "/b", "/c", "/d"]));
    expect(openTab.mock.calls).toEqual([["/c", undefined, null], ["/d", undefined, null]]);
  });

  it("taken back from a hand-over's window that never opened, brings its carry", async () => {
    spawnFailed(["/c"], carry);
    await vi.waitFor(() => expect(paths()).toEqual(["/a", "/b", "/c"]));
    expect(openTab.mock.calls).toEqual([["/c", undefined, carry]]);
  });

  it("taken back while nothing runs, open one at a time: the next waits for the one before to finish", async () => {
    let first!: () => void;
    openTab.mockImplementationOnce(() => new Promise<void>((r) => (first = r)));
    spawnFailed(["/c", "/d"]);
    await settled();
    expect(openTab.mock.calls).toEqual([["/c", undefined, null]]);
    expect(infos()).toEqual([]);

    first();
    await vi.waitFor(() => expect(openTab.mock.calls).toEqual([["/c", undefined, null], ["/d", undefined, null]]));
  });

  it("dropped in a commit's tail (after `busy`, before `commit()` returns), opens once it returns", async () => {
    useCommitStore.setState({ inCommit: true });
    adopt("/c");
    await settled();
    expect(openTab).not.toHaveBeenCalled();

    act(() => useCommitStore.setState({ inCommit: false }));
    await vi.waitFor(() => expect(paths()).toEqual(["/c", "/a", "/b"]));
    expect(openTab.mock.calls).toEqual([["/c", 0, carry]]);
  });

  // Commit & Push (the commit returns, then Push opens) is pinned on the real panel: CommitPanel.test.tsx.

  it("dropped while a dialog is open, says so and opens once it closes", async () => {
    useDialogStore.getState().open({ kind: "settings" });
    adopt("/c");
    await settled();
    expect(openTab).not.toHaveBeenCalled();
    expect(infos().map((t) => t.detail)).toEqual(["c opens when the current operation or dialog closes"]);

    act(() => useDialogStore.getState().close());
    await vi.waitFor(() => expect(paths()).toEqual(["/c", "/a", "/b"]));
    expect(openTab.mock.calls).toEqual([["/c", 0, carry]]);
  });

  it("a queued open that throws outright says so too, and doesn't stall the queue", async () => {
    useOpsStore.setState({ busy: "Fetching origin…" });
    openTab.mockImplementationOnce(() => {
      throw { kind: "internal", message: "thrown" };
    });
    adopt("/c");
    adopt("/d");
    act(() => useOpsStore.setState({ busy: null }));
    await vi.waitFor(() => expect(paths()).toEqual(["/d", "/a", "/b"]));
    expect(useToastStore.getState().toasts.filter((t) => t.kind === "error").map((t) => t.title)).toEqual(["Couldn't open repository"]);
  });

  it("a queued open that fails says so, and the queue goes on to the next", async () => {
    useOpsStore.setState({ busy: "Fetching origin…" });
    openTab.mockRejectedValueOnce({ kind: "internal", message: "not a repository" });
    adopt("/c");
    adopt("/d");
    act(() => useOpsStore.setState({ busy: null }));
    await vi.waitFor(() => expect(paths()).toEqual(["/d", "/a", "/b"]));
    expect(openTab.mock.calls).toEqual([["/c", 0, carry], ["/d", 0, carry]]);
    expect(useToastStore.getState().toasts.filter((t) => t.kind === "error").map((t) => t.title)).toEqual(["Couldn't open repository"]);
  });
});
