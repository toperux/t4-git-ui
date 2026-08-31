import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpResult, RepoSummary } from "../api/types";
import { useDialogStore } from "./dialogStore";
import { MAX_OPS, runOp, useOpsStore } from "./opsStore";
import { useRepoStore } from "./repoStore";
import { useStatusStore } from "./statusStore";
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

const REPO: RepoSummary = { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } };
const ok: OpResult = { opId: "1", code: 0, conflicts: [], failure: null };

beforeEach(() => {
  useOpsStore.setState({ ops: [], open: false, busy: null });
  useToastStore.setState({ toasts: [] });
  useDialogStore.setState({ dialog: null });
  useRepoStore.setState({ repo: REPO, wtSelected: false });
  useStatusStore.setState({ status: null });
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
    expect(toasts()).toMatchObject([{ kind: "error", title: "2 conflicts — resolve in the commit panel" }]);
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

  it("refused rejection goes to onRefused; other rejections toast; busy is cleared", async () => {
    const onRefused = vi.fn();
    const out = await runOp("Deleting branch…", () => Promise.reject({ kind: "refused", message: "branch 'x' is not fully merged" }), { onRefused });
    expect(onRefused).toHaveBeenCalledWith("branch 'x' is not fully merged");
    expect(out).toMatchObject({ ok: false, error: { kind: "refused" } });
    expect(toasts()).toHaveLength(0);
    await runOp("Renaming branch…", () => Promise.reject({ kind: "git", message: "boom" }));
    expect(toasts()).toMatchObject([{ kind: "error", title: "Renaming branch failed", detail: "boom" }]);
    expect(useOpsStore.getState().busy).toBeNull();
  });
});
