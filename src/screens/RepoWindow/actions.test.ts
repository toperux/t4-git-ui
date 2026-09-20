import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpResult } from "../../api/types";
import { useCmdHistoryStore } from "../../store/cmdHistoryStore";
import { useCommitStore } from "../../store/commitStore";
import { useDialogStore } from "../../store/dialogStore";
import { useDiffStore } from "../../store/diffStore";
import { useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { useToastStore } from "../../store/toastStore";
import { useTabsStore } from "../../store/tabsStore";
import { useViewStore } from "../../store/viewStore";
import { blameAt, busyLabel, checkoutTag, closeTab, pickAndOpenRepo, runGit, showHistory, stashDrop, switchRepo } from "./actions";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(() => Promise.resolve("/elsewhere")), ask: vi.fn(() => Promise.resolve(true)) }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  return {
    ...actual,
    runGit: vi.fn(),
    checkout: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    stashDrop: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    // `runOp`'s trailing refresh / syncRefs must never resolve, or they'd race the assertions.
    getStatus: vi.fn(() => new Promise(() => {})),
    getRefs: vi.fn(() => new Promise(() => {})),
    getLinked: vi.fn(() => Promise.resolve(null)),
  };
});

import { ask, open as openFolder } from "@tauri-apps/plugin-dialog";
import * as ipc from "../../api/ipc";

const mocked = ipc as unknown as Record<"runGit" | "checkout" | "stashDrop", ReturnType<typeof vi.fn>>;
const asked = ask as unknown as ReturnType<typeof vi.fn>;
const openTab = vi.fn(() => Promise.resolve());
const closeTabStore = vi.fn(() => Promise.resolve());
const toasts = () => useToastStore.getState().toasts;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useRepoStore.setState({ repo: { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } } });
  useTabsStore.setState({ tabs: [{ id: "r", path: "/r", name: "r", stale: false }], active: "r", openTab: openTab as never, closeTab: closeTabStore as never });
  useToastStore.setState({ toasts: [] });
  useOpsStore.setState({ ops: [], open: false, busy: null });
  useCommitStore.setState({ busy: false });
  useCmdHistoryStore.setState({ history: [] });
});

describe("leaving the repository while an operation runs", () => {
  it("refuses switch / open / close with one info toast each, and does nothing else", async () => {
    useOpsStore.setState({ busy: "Fetching slow…" });
    switchRepo("/other");
    await pickAndOpenRepo();
    closeTab();
    expect(openTab).not.toHaveBeenCalled();
    expect(closeTabStore).not.toHaveBeenCalled();
    // No picker either: a folder chosen and then refused is worse than no picker.
    expect(openFolder).not.toHaveBeenCalled();
    expect(toasts().map((t) => t.title)).toEqual(["Operation in progress", "Operation in progress", "Operation in progress"]);
    expect(toasts().every((t) => t.kind === "info")).toBe(true);
  });

  it("refuses during a commit too, whose busy flag never reaches the ops store", () => {
    useCommitStore.setState({ busy: true });
    switchRepo("/other");
    closeTab();
    expect(openTab).not.toHaveBeenCalled();
    expect(closeTabStore).not.toHaveBeenCalled();
    expect(toasts().map((t) => t.title)).toEqual(["Operation in progress", "Operation in progress"]);
  });

  it("goes ahead once nothing is running", async () => {
    useOpsStore.setState({ busy: null });
    switchRepo("/other");
    expect(openTab).toHaveBeenCalledWith("/other");
    await pickAndOpenRepo();
    expect(openTab).toHaveBeenCalledWith("/elsewhere");
    closeTab();
    expect(closeTabStore).toHaveBeenCalledWith("r");
    expect(toasts()).toEqual([]);
  });
});

describe("runGit", () => {
  it("records the line, opens the dock, runs the argv under a `git …` label, and a non-zero exit is not a toast", async () => {
    let resolve!: (r: OpResult) => void;
    mocked.runGit.mockImplementation(() => new Promise<OpResult>((r) => (resolve = r)));
    const p = runGit('  commit -m "two words"  ');
    expect(useCmdHistoryStore.getState().history).toEqual(['commit -m "two words"']);
    expect(useOpsStore.getState().open).toBe(true);
    expect(useOpsStore.getState().busy).toBe("git commit -m 'two words'");
    expect(mocked.runGit).toHaveBeenCalledWith("r", ["commit", "-m", "two words"]);
    resolve({ opId: "1", code: 1, conflicts: [], failure: { kind: "other", message: "exit 1" } });
    expect(await p).toMatchObject({ ok: false, failure: { kind: "other" } });
    expect(useOpsStore.getState().busy).toBeNull();
    expect(toasts()).toEqual([]);
  });

  it("a refused command (the backend's terminal check) is still an error toast naming the command", async () => {
    mocked.runGit.mockRejectedValue({ kind: "refused", message: "-p needs a terminal; interactive mode is not supported here" });
    await runGit("add -p");
    expect(toasts()).toMatchObject([{ kind: "error", title: "git add -p failed", detail: "-p needs a terminal; interactive mode is not supported here" }]);
  });

  it("does nothing with an empty or unbalanced line", () => {
    expect(runGit("   ")).toBeUndefined();
    expect(runGit('commit -m "oops')).toBeUndefined();
    expect(mocked.runGit).not.toHaveBeenCalled();
    expect(useOpsStore.getState().open).toBe(false);
    expect(useCmdHistoryStore.getState().history).toEqual([]);
  });
});

describe("busyLabel", () => {
  it("leaves 48 code points alone and cuts longer ones by code point, with a marker runOp keeps", () => {
    expect(busyLabel("git status")).toBe("git status");
    expect(busyLabel("x".repeat(48))).toBe("x".repeat(48));
    const label = busyLabel(`git commit -m '${"🎉".repeat(60)}'`);
    expect([...label]).toHaveLength(48);
    expect(label).toBe(`git commit -m '${"🎉".repeat(30)}[…]`);
    // What a failure would be titled: the cut stays visible.
    expect(`${label.replace(/…$/, "")} failed`).toMatch(/\[…\] failed$/);
  });
});

describe("stashDrop", () => {
  it("refuses a second drop while the first confirmation is still up: the index it names has already shifted", async () => {
    let confirm!: (ok: boolean) => void;
    asked.mockImplementation(() => new Promise<boolean>((r) => (confirm = r)));

    const first = stashDrop(0, "wip");
    const second = stashDrop(1, "older wip");
    expect(asked).toHaveBeenCalledTimes(1);
    expect(await second).toBeUndefined();
    expect(toasts().map((t) => t.title)).toEqual(["Operation in progress"]);

    confirm(true);
    await first;
    expect(mocked.stashDrop).toHaveBeenCalledTimes(1);
    expect(mocked.stashDrop).toHaveBeenCalledWith("r", 0);
  });

  it("drops nothing when the confirmation is declined, and lets the next one through", async () => {
    asked.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await stashDrop(0, "wip");
    expect(mocked.stashDrop).not.toHaveBeenCalled();
    await stashDrop(0, "wip");
    expect(mocked.stashDrop).toHaveBeenCalledWith("r", 0);
  });
});

describe("checkoutTag", () => {
  it("checks the tag out by its full ref, detached: a branch of the same name must not win", async () => {
    await checkoutTag("v1.0");
    expect(mocked.checkout).toHaveBeenCalledWith("r", "refs/tags/v1.0", null, false, true);
    expect(toasts().map((t) => t.title)).toContain("Checked out v1.0 (detached)");
  });
});

// Both land in the History layout (the grid's path filter, the details pane's Files tab). From the
// Changes view, or from a row menu inside the commit dialog, the click used to change nothing on screen.
describe("History and Blame from a file row", () => {
  const startLog = vi.fn();
  beforeEach(() => {
    useRepoStore.setState({ startLog: startLog as never, revealOid: vi.fn(() => Promise.resolve(true)) as never });
    useDiffStore.setState({ setTab: vi.fn(), selectTreePathAt: vi.fn(), setBlameOn: vi.fn() } as never);
    useViewStore.setState({ view: "changes" });
    useDialogStore.setState({ dialog: { kind: "commit" }, returnFocus: null });
  });

  it("History filters the grid, opens the History view and closes the dialog it was clicked in", () => {
    showHistory("a.txt");
    expect(startLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ path: "a.txt" }));
    expect(useViewStore.getState().view).toBe("history");
    expect(useDialogStore.getState().dialog).toBeNull();
  });

  it("Blame does the same from the commit dialog", async () => {
    await blameAt("abc", "a.txt");
    expect(useDiffStore.getState().selectTreePathAt).toHaveBeenCalledWith("abc", "a.txt");
    expect(useViewStore.getState().view).toBe("history");
    expect(useDialogStore.getState().dialog).toBeNull();
  });

  it("Blame leaves a diff window open: it shows the blame itself, and a hunk click drills down inside it", async () => {
    useDialogStore.setState({ dialog: { kind: "diff" } });
    await blameAt("abc", "a.txt");
    expect(useDialogStore.getState().dialog).toEqual({ kind: "diff" });
  });
});
