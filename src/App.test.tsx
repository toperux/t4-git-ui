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
    takeLayout: vi.fn(() => Promise.resolve([])),
    spawnWindow: vi.fn(() => Promise.resolve("w1")),
    setLayout: vi.fn(() => Promise.resolve()),
    getTools: vi.fn(() => Promise.resolve({ diff: null, merge: null })),
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
}));

import * as ipc from "./api/ipc";
import App from "./App";
import { useRecentsStore } from "./store/recentsStore";
import { useTabsStore } from "./store/tabsStore";

const mocked = ipc as unknown as Record<"probeGit" | "takePending" | "takeLayout" | "spawnWindow", ReturnType<typeof vi.fn>>;
const openTab = vi.fn(() => Promise.resolve());
/** What the kv store holds for `lastOpen` — the pre-tabs way of reopening a repository. */
let lastOpen: string | null = null;

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocked.probeGit.mockResolvedValue({ version: "git version 2.51.0", tooOld: false });
  mocked.takePending.mockResolvedValue(null);
  mocked.takeLayout.mockResolvedValue([]);
  useTabsStore.setState({ tabs: [], active: null, saved: {}, openTab: openTab as never });
  lastOpen = null;
  useRecentsStore.setState({ recents: [], lastOpen: null, lastCloneDir: null });
});

/** The launch has several awaits in it; this lets them all settle. */
const settled = () => act(() => new Promise((r) => setTimeout(r, 0)));

describe("App", () => {
  it("restores every window of the last exit: its own tabs here, a window for each of the others", async () => {
    mocked.takeLayout.mockResolvedValue([
      { tabs: ["/a", "/b"], active: "/b" },
      { tabs: ["/c"], active: "/c" },
    ]);
    render(<App />);
    await settled();
    expect(openTab.mock.calls).toEqual([["/a"], ["/b"]]);
    expect(mocked.spawnWindow).toHaveBeenCalledWith({ tabs: ["/c"], active: "/c" });
  });

  it("keeps restoring the rest when one repository will not open", async () => {
    mocked.takeLayout.mockResolvedValue([{ tabs: ["/gone", "/b"], active: "/b" }]);
    openTab.mockRejectedValueOnce({ kind: "internal", message: "not a repository" });
    render(<App />);
    await settled();
    expect(openTab.mock.calls).toEqual([["/gone"], ["/b"]]);
  });

  it("a window created with tabs opens those, and asks for no layout", async () => {
    mocked.takePending.mockResolvedValue({ tabs: ["/d"], active: "/d" });
    render(<App />);
    await settled();
    expect(openTab.mock.calls).toEqual([["/d"]]);
    expect(mocked.takeLayout).not.toHaveBeenCalled();
    expect(mocked.spawnWindow).not.toHaveBeenCalled();
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
});
