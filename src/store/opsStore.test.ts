import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpResult, RepoSummary } from "../api/types";
import { useDialogStore } from "./dialogStore";
import { MAX_LINES, MAX_OPS, runOp, useOpsStore } from "./opsStore";
import { __resetForTests as resetRepo, useRepoStore } from "./repoStore";
import { __resetForTests as resetStatus } from "./statusStore";
import { useToastStore } from "./toastStore";

vi.mock("../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/ipc")>();
  return {
    ...actual,
    cancelOp: vi.fn(),
    getStatus: vi.fn(() => new Promise(() => {})),
    getRefs: vi.fn(() => new Promise(() => {})),
  };
});

import * as ipc from "../api/ipc";

const mocked = ipc as unknown as Record<"cancelOp" | "getStatus" | "getRefs", ReturnType<typeof vi.fn>>;
const REPO: RepoSummary = { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } };
const ok: OpResult = { opId: "1", code: 0, conflicts: [], failure: null };
/** `runOp` fires `refresh` / `syncRefs` without awaiting them; let those settle before asserting. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.resetAllMocks();
  // The trailing refresh / syncRefs must never resolve, or they'd race the assertions.
  mocked.getStatus.mockImplementation(() => new Promise(() => {}));
  mocked.getRefs.mockImplementation(() => new Promise(() => {}));
  useOpsStore.setState({ ops: [], open: false, busy: null });
  useToastStore.setState({ toasts: [] });
  useDialogStore.setState({ dialog: null });
  resetStatus();
  resetRepo();
  useRepoStore.setState({ repo: REPO });
});

const toasts = () => useToastStore.getState().toasts;

describe("opsStore", () => {
  it("records started → lines (progress redraws) → exit", () => {
    const st = useOpsStore.getState();
    st.onEvent({ repoId: "r", opId: "1", event: { kind: "started", opId: "1", cmd: "git commit -F msg" } });
    st.onEvent({ repoId: "r", opId: "1", event: { kind: "stdout", line: "hook: ok" } });
    st.onEvent({ repoId: "r", opId: "1", event: { kind: "progress", line: "50%" } });
    st.onEvent({ repoId: "r", opId: "1", event: { kind: "progress", line: "100%" } });
    st.onEvent({ repoId: "r", opId: "1", event: { kind: "stderr", line: "warn" } });
    st.onEvent({ repoId: "r", opId: "unknown", event: { kind: "stdout", line: "ignored" } });
    let op = useOpsStore.getState().ops[0];
    expect(op.running).toBe(true);
    expect(op.lines).toEqual([
      { kind: "stdout", text: "hook: ok" },
      { kind: "progress", text: "100%" },
      { kind: "stderr", text: "warn" },
    ]);
    st.onEvent({ repoId: "r", opId: "1", event: { kind: "exit", code: 1, elapsedMs: 1234 } });
    op = useOpsStore.getState().ops[0];
    expect(op).toMatchObject({ running: false, code: 1, elapsedMs: 1234, cmd: "git commit -F msg" });
    expect(useOpsStore.getState().ops).toHaveLength(1);
  });

  it("caps one op's log at MAX_LINES, keeping the newest", () => {
    const st = useOpsStore.getState();
    st.onEvent({ repoId: "r", opId: "1", event: { kind: "started", opId: "1", cmd: "git clone x" } });
    for (let i = 0; i < MAX_LINES + 10; i++) st.onEvent({ repoId: "r", opId: "1", event: { kind: "stdout", line: `l${i}` } });
    const { lines } = useOpsStore.getState().ops[0];
    expect(lines).toHaveLength(MAX_LINES);
    expect(lines[lines.length - 1].text).toBe(`l${MAX_LINES + 9}`);
    expect(lines[0].text).toBe("l10");
  });

  it("cancel calls cancel_op for the running op", async () => {
    mocked.cancelOp.mockResolvedValue(true);
    const st = useOpsStore.getState();
    st.onEvent({ repoId: "r", opId: "7", event: { kind: "started", opId: "7", cmd: "git fetch" } });
    await useOpsStore.getState().cancel("7");
    expect(mocked.cancelOp).toHaveBeenCalledWith("7");
  });

  it("opens the dock when a command fails, so its output is on screen with the toast", () => {
    const st = useOpsStore.getState();
    st.onEvent({ repoId: "r", opId: "1", event: { kind: "started", opId: "1", cmd: "git commit -F msg" } });
    st.onEvent({ repoId: "r", opId: "1", event: { kind: "stderr", line: "lint: 3 problems in 2 files" } });
    expect(useOpsStore.getState().open).toBe(false);

    st.onEvent({ repoId: "r", opId: "1", event: { kind: "exit", code: 1, elapsedMs: 12 } });
    expect(useOpsStore.getState().open).toBe(true);
  });

  it("leaves the dock alone when a command succeeds, or when the user cancelled it", async () => {
    mocked.cancelOp.mockResolvedValue(true);
    const st = useOpsStore.getState();
    st.onEvent({ repoId: "r", opId: "1", event: { kind: "started", opId: "1", cmd: "git fetch" } });
    st.onEvent({ repoId: "r", opId: "1", event: { kind: "exit", code: 0, elapsedMs: 12 } });
    expect(useOpsStore.getState().open).toBe(false);

    // A killed process exits non-zero, but the user asked for that and knows why.
    st.onEvent({ repoId: "r", opId: "2", event: { kind: "started", opId: "2", cmd: "git fetch" } });
    await useOpsStore.getState().cancel("2");
    st.onEvent({ repoId: "r", opId: "2", event: { kind: "exit", code: 1, elapsedMs: 12 } });
    expect(useOpsStore.getState().open).toBe(false);
  });

  it("keeps at most MAX_OPS records", () => {
    const st = useOpsStore.getState();
    for (let i = 0; i < MAX_OPS + 5; i++) st.onEvent({ repoId: "r", opId: `${i}`, event: { kind: "started", opId: `${i}`, cmd: `c${i}` } });
    const ops = useOpsStore.getState().ops;
    expect(ops).toHaveLength(MAX_OPS);
    expect(ops[0].opId).toBe("5");
  });
});

describe("runOp", () => {
  it("sets busy while running and shows the success toast", async () => {
    let resolve!: (r: OpResult) => void;
    const p = runOp("Pushing to origin…", () => new Promise<OpResult>((r) => (resolve = r)), { success: "Pushed main → origin/main" });
    expect(useOpsStore.getState().busy).toBe("Pushing to origin…");
    resolve(ok);
    expect(await p).toEqual({ ok: true });
    expect(useOpsStore.getState().busy).toBeNull();
    expect(toasts()).toMatchObject([{ kind: "success", title: "Pushed main → origin/main" }]);
  });

  it("refuses with an info toast while another op runs", async () => {
    useOpsStore.setState({ busy: "Fetching…" });
    const fn = vi.fn(() => Promise.resolve(ok));
    const out = await runOp("Pushing…", fn);
    expect(fn).not.toHaveBeenCalled();
    expect(out).toMatchObject({ ok: false, error: { kind: "busy" } });
    expect(toasts()).toMatchObject([{ kind: "info", title: "Operation in progress" }]);
  });

  it("conflicts → toast + selects the working-tree row", async () => {
    const out = await runOp("Merging…", () => Promise.resolve({ ...ok, code: 1, conflicts: ["a", "b"], failure: { kind: "conflicts", paths: ["a", "b"] } }));
    expect(out).toMatchObject({ ok: false, failure: { kind: "conflicts" } });
    expect(toasts()).toMatchObject([{ kind: "info", title: "2 conflicts — resolve in the commit panel" }]);
    expect(useRepoStore.getState().wtSelected).toBe(true);
  });

  it("nonFastForward → toast with a Pull action that opens the Pull dialog", async () => {
    await runOp("Pushing…", () => Promise.resolve({ ...ok, code: 1, failure: { kind: "nonFastForward" } }));
    const t = toasts()[0];
    expect(t).toMatchObject({ kind: "error", title: "Rejected: remote has new commits — Pull first", action: { label: "Pull" } });
    t.action!.onClick();
    expect(useDialogStore.getState().dialog).toEqual({ kind: "pull" });
  });

  it("authFailed / other → toasts", async () => {
    await runOp("Pushing…", () => Promise.resolve({ ...ok, code: 128, failure: { kind: "authFailed" } }));
    await runOp("Merging…", () => Promise.resolve({ ...ok, code: 128, failure: { kind: "other", message: "fatal: refusing to merge unrelated histories" } }));
    expect(toasts()).toMatchObject([
      { kind: "error", title: "Authentication failed — check your credential helper" },
      { kind: "error", title: "Operation failed", detail: "fatal: refusing to merge unrelated histories" },
    ]);
  });

  it("quietFailure: no toast for a plain failure, still one for conflicts / authFailed / nonFastForward", async () => {
    const out = await runOp("git grep needle", () => Promise.resolve({ ...ok, code: 1, failure: { kind: "other", message: "exit 1" } }), { quietFailure: true });
    expect(out).toMatchObject({ ok: false, failure: { kind: "other" } });
    expect(toasts()).toHaveLength(0);
    await runOp("git merge x", () => Promise.resolve({ ...ok, code: 1, conflicts: ["a"], failure: { kind: "conflicts", paths: ["a"] } }), { quietFailure: true });
    await runOp("git push", () => Promise.resolve({ ...ok, code: 128, failure: { kind: "authFailed" } }), { quietFailure: true });
    await runOp("git push", () => Promise.resolve({ ...ok, code: 1, failure: { kind: "nonFastForward" } }), { quietFailure: true });
    expect(toasts().map((t) => t.title)).toEqual([
      "1 conflict — resolve in the commit panel",
      "Authentication failed — check your credential helper",
      "Rejected: remote has new commits — Pull first",
    ]);
    expect(useRepoStore.getState().wtSelected).toBe(true);
  });

  it("refused rejection goes to onRefused; other rejections toast; busy is cleared", async () => {
    const onRefused = vi.fn();
    const out = await runOp("Deleting branch…", () => Promise.reject({ kind: "refused", message: "branch 'x' is not fully merged" }), { onRefused });
    expect(onRefused).toHaveBeenCalledWith("branch 'x' is not fully merged");
    expect(out).toMatchObject({ ok: false, error: { kind: "refused" } });
    expect(toasts()).toHaveLength(0);
    await runOp("Renaming branch…", () => Promise.reject({ kind: "git", message: "boom" }));
    expect(toasts()).toMatchObject([{ kind: "error", title: "Renaming branch failed", detail: "boom" }]);
    expect(useOpsStore.getState().busy).toBeNull();
    await settle();
  });

  it("a cancelled op is an info toast, not an error", async () => {
    const out = await runOp("Cloning…", () => Promise.reject({ kind: "cancelled", message: "cancelled" }));
    expect(out).toMatchObject({ ok: false, error: { kind: "cancelled" } });
    expect(toasts()).toMatchObject([{ kind: "info", title: "Cancelled" }]);
    await settle();
  });

  it("the backend's own busy rejection is an info toast too", async () => {
    const out = await runOp("Pushing…", () => Promise.reject({ kind: "busy", message: "another operation is running" }));
    expect(out).toMatchObject({ ok: false, error: { kind: "busy" } });
    expect(toasts()).toMatchObject([{ kind: "info", title: "Operation in progress" }]);
    await settle();
  });

  it("does nothing with no repository open", async () => {
    useRepoStore.setState({ repo: null });
    const fn = vi.fn(() => Promise.resolve(ok));
    expect(await runOp("Pushing…", fn)).toMatchObject({ ok: false, error: null });
    expect(fn).not.toHaveBeenCalled();
    expect(toasts()).toHaveLength(0);
  });
});
