import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpResult } from "../../api/types";
import { useCmdHistoryStore } from "../../store/cmdHistoryStore";
import { useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { useToastStore } from "../../store/toastStore";
import { busyLabel, closeRepo, pickAndOpenRepo, runGit, switchRepo } from "./actions";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(() => Promise.resolve("/elsewhere")) }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  return {
    ...actual,
    runGit: vi.fn(),
    // `runOp`'s trailing refresh / syncRefs must never resolve, or they'd race the assertions.
    getStatus: vi.fn(() => new Promise(() => {})),
    getRefs: vi.fn(() => new Promise(() => {})),
  };
});

import { open as openFolder } from "@tauri-apps/plugin-dialog";
import * as ipc from "../../api/ipc";

const mocked = ipc as unknown as Record<"runGit", ReturnType<typeof vi.fn>>;
const openRepo = vi.fn(() => Promise.resolve());
const closeRepoStore = vi.fn(() => Promise.resolve());
const toasts = () => useToastStore.getState().toasts;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useRepoStore.setState({
    repo: { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } },
    openRepo: openRepo as never,
    closeRepo: closeRepoStore as never,
  });
  useToastStore.setState({ toasts: [] });
  useOpsStore.setState({ ops: [], open: false, busy: null });
  useCmdHistoryStore.setState({ history: [] });
});

describe("leaving the repository while an operation runs", () => {
  it("refuses switch / open / close with one info toast each, and does nothing else", async () => {
    useOpsStore.setState({ busy: "Fetching slow…" });
    switchRepo("/other");
    await pickAndOpenRepo();
    closeRepo();
    expect(openRepo).not.toHaveBeenCalled();
    expect(closeRepoStore).not.toHaveBeenCalled();
    // No picker either: a folder chosen and then refused is worse than no picker.
    expect(openFolder).not.toHaveBeenCalled();
    expect(toasts().map((t) => t.title)).toEqual(["Operation in progress", "Operation in progress", "Operation in progress"]);
    expect(toasts().every((t) => t.kind === "info")).toBe(true);
  });

  it("goes ahead once nothing is running", async () => {
    useOpsStore.setState({ busy: null });
    switchRepo("/other");
    expect(openRepo).toHaveBeenCalledWith("/other");
    await pickAndOpenRepo();
    expect(openRepo).toHaveBeenCalledWith("/elsewhere");
    closeRepo();
    expect(closeRepoStore).toHaveBeenCalled();
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
