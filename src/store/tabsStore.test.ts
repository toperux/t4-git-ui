import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RepoSummary } from "../api/types";

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
import { useCommitStore } from "./commitStore";
import { __resetForTests as resetRepo, useRepoStore } from "./repoStore";
import { useTabsStore } from "./tabsStore";

let label = "main";
const mocked = ipc as unknown as Record<"openRepo" | "closeRepo" | "spawnWindow", ReturnType<typeof vi.fn>>;
const summary = (path: string): RepoSummary => ({ id: path, name: path.slice(1), path, head: { oid: "a", branch: "main", detached: false } });
const tabs = () => useTabsStore.getState().tabs;

beforeEach(() => {
  vi.clearAllMocks();
  label = "main";
  resetRepo();
  useTabsStore.setState({ tabs: [], active: null, saved: {} });
  // The backend answers with the canonical path, which is what a tab is keyed by.
  mocked.openRepo.mockImplementation((path: string) => Promise.resolve(summary(path)));
  mocked.closeRepo.mockResolvedValue(undefined);
  mocked.spawnWindow.mockResolvedValue("w1");
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

  it("says nothing when another window has the repository: it has been focused instead", async () => {
    mocked.openRepo.mockRejectedValueOnce({ kind: "openElsewhere", message: "a is open in another window" });
    await expect(useTabsStore.getState().openTab("/a")).resolves.toBeUndefined();
    expect(tabs()).toEqual([]);
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
    expect(mocked.spawnWindow).toHaveBeenCalledWith({ tabs: ["/b"], active: "/b" });
    expect(tabs().map((t) => t.path)).toEqual(["/a"]);
    expect(mocked.closeRepo).toHaveBeenCalledWith("/b");
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
