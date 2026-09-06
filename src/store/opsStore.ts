// Streamed CLI operations (`op://event`) for the output dock, plus `runOp`: the one way the UI
// starts a branch / remote / stash operation (busy guard, failure → toast, refresh afterwards).
import { create } from "zustand";
import * as ipc from "../api/ipc";
import { toAppError } from "../api/ipc";
import type { AppError, OpEvent, OpFailure, OpResult, RepoId } from "../api/types";
import { useDialogStore } from "./dialogStore";
import { useRepoStore } from "./repoStore";
import { useStatusStore } from "./statusStore";
import { toastError, useToastStore } from "./toastStore";

export const MAX_OPS = 50;
export const MAX_LINES = 5000;

export interface OpLine {
  kind: "stdout" | "stderr" | "progress";
  text: string;
}

export interface OpRecord {
  opId: string;
  cmd: string;
  lines: OpLine[];
  code: number | null;
  elapsedMs: number | null;
  running: boolean;
  startedAt: number;
}

export interface OpsStore {
  /** Oldest first, at most `MAX_OPS`. */
  ops: OpRecord[];
  /** Dock expanded. */
  open: boolean;
  /** Statusbar text of the operation started through `runOp` (`"Pushing to origin…"`), `null` when idle. */
  busy: string | null;

  onEvent(e: OpEvent): void;
  cancel(opId: string): Promise<void>;
  setOpen(open: boolean): void;
}

/** Ops the user cancelled: their non-zero exit is expected, so it must not open the dock. */
const cancelled = new Set<string>();

export const selectLastOp = (s: OpsStore) => s.ops[s.ops.length - 1] ?? null;

/** An operation started through `runOp` is still running. */
export const selectRunning = (s: OpsStore) => s.busy !== null;

export const useOpsStore = create<OpsStore>()((set, get) => ({
  ops: [],
  open: false,
  busy: null,

  onEvent({ opId, event }) {
    const ops = get().ops;
    if (event.kind === "started") {
      const rec: OpRecord = { opId, cmd: event.cmd, lines: [], code: null, elapsedMs: null, running: true, startedAt: Date.now() };
      set({ ops: [...ops, rec].slice(-MAX_OPS) });
      return;
    }
    const i = ops.findIndex((o) => o.opId === opId);
    if (i < 0) return;
    const op = ops[i];
    let next: OpRecord;
    // A failure puts its reason in the dock while the toast carries only the first line, so show it
    // rather than leaving the user to find it. Not for a cancel: the kill exits non-zero too, and
    // whoever pressed Cancel knows what happened.
    let reveal = false;
    if (event.kind === "exit") {
      next = { ...op, running: false, code: event.code, elapsedMs: event.elapsedMs };
      reveal = event.code !== 0 && !cancelled.delete(opId);
    } else {
      const lines = op.lines.slice();
      const last = lines[lines.length - 1];
      // A progress segment redraws the previous progress line.
      if (event.kind === "progress" && last?.kind === "progress") lines[lines.length - 1] = { kind: "progress", text: event.line };
      else lines.push({ kind: event.kind, text: event.line });
      next = { ...op, lines: lines.length > MAX_LINES ? lines.slice(-MAX_LINES) : lines };
    }
    const copy = ops.slice();
    copy[i] = next;
    set(reveal ? { ops: copy, open: true } : { ops: copy });
  },

  async cancel(opId) {
    cancelled.add(opId);
    // The op may already have exited — that is not worth a toast.
    await ipc.cancelOp(opId).catch(() => false);
  },

  setOpen: (open) => set({ open }),
}));

export interface RunOpOptions {
  /** Success toast title (none when omitted). */
  success?: string;
  /** Handles a `refused` rejection instead of the default error toast (e.g. offer a force delete). */
  onRefused?: (message: string) => void;
  /**
   * No failure toast except for conflicts / authFailed / nonFastForward / diverged (those carry an action or a
   * next step): the dock's exit line already says it, and for a typed command a non-zero exit is
   * often the answer (`grep`, `diff --exit-code`).
   */
  quietFailure?: boolean;
  /**
   * The remote the op talked to (fetch / push / pull / delete on remote): re-asked for its tags
   * afterwards. `true` = all of them, for `fetch --all` and typed commands.
   */
  remote?: string | true;
}

export type OpOutcome = { ok: true } | { ok: false; error: AppError | null; failure: OpFailure | null };

/** Toast title + optional detail / action for a classified streaming failure. */
export function failureToast(f: OpFailure): { title: string; detail?: string; action?: { label: string; onClick: () => void } } {
  switch (f.kind) {
    case "conflicts": {
      const n = f.paths.length;
      return { title: n > 0 ? `${n} conflict${n === 1 ? "" : "s"} — resolve in the commit panel` : "Conflicts — resolve in the commit panel" };
    }
    case "nonFastForward":
      return {
        title: "Rejected: remote has new commits — Pull first",
        action: { label: "Pull", onClick: () => useDialogStore.getState().open({ kind: "pull" }) },
      };
    case "diverged":
      // An `--ff-only` pull has already fetched: telling it to pull again is wrong.
      return { title: "Cannot fast-forward — the branches have diverged" };
    case "authFailed":
      return { title: "Authentication failed — check your credential helper" };
    case "rejected":
    case "other":
      return { title: "Operation failed", detail: f.message };
  }
}

/**
 * Runs one operation against the open repo. Refuses (info toast) while another `runOp` is in flight;
 * maps `OpResult.failure` / rejections to toasts; refreshes status + refs + the walk afterwards (the
 * backend's `repo://changed` does too — the seq guards make the duplicate a no-op).
 */
export async function runOp(busy: string, fn: (id: RepoId) => Promise<OpResult | void>, opts: RunOpOptions = {}): Promise<OpOutcome> {
  const push = useToastStore.getState().push;
  const repo = useRepoStore.getState().repo;
  if (!repo) return { ok: false, error: null, failure: null };
  if (useOpsStore.getState().busy !== null) {
    push({ kind: "info", title: "Operation in progress", detail: `Wait for “${useOpsStore.getState().busy}” to finish` });
    return { ok: false, error: { kind: "busy", message: "another operation is running" }, failure: null };
  }
  useOpsStore.setState({ busy });
  let outcome: OpOutcome;
  try {
    const result = await fn(repo.id);
    const failure = result?.failure ?? null;
    if (failure) {
      const loud = failure.kind === "conflicts" || failure.kind === "authFailed" || failure.kind === "nonFastForward" || failure.kind === "diverged";
      if (!opts.quietFailure || loud) push({ kind: failure.kind === "conflicts" ? "info" : "error", ...failureToast(failure) });
      if (failure.kind === "conflicts") useRepoStore.getState().selectWorkingTree();
      outcome = { ok: false, error: null, failure };
    } else {
      if (opts.success) push({ kind: "success", title: opts.success });
      outcome = { ok: true };
    }
  } catch (e) {
    const error = toAppError(e);
    if (error.kind === "refused" && opts.onRefused) opts.onRefused(error.message);
    else if (error.kind === "busy") push({ kind: "info", title: "Operation in progress", detail: "Another git operation is running" });
    else if (error.kind === "cancelled") push({ kind: "info", title: "Cancelled" });
    else toastError(error, `${busy.replace(/…$/, "")} failed`);
    outcome = { ok: false, error, failure: null };
  } finally {
    useOpsStore.setState({ busy: null });
  }
  // `syncRefs` refreshes refs and either restarts the walk (HEAD moved) or just relabels it. Calling
  // `refreshRefs` here instead would hide the HEAD move from the `repo://changed` handler.
  if (useRepoStore.getState().repo?.id === repo.id) {
    void useStatusStore.getState().refresh();
    void useStatusStore.getState().syncRefs();
    // Also after a rejected push (the remote answered, the badges must stay honest) — but not after
    // one the remote never answered: the re-ask would fail the same way and toast a second time.
    const answered = outcome.ok || (outcome.failure !== null && outcome.failure.kind !== "authFailed" && outcome.failure.kind !== "other");
    // Only the remote the op talked to: a dead mirror must not toast after every `origin` fetch.
    if (opts.remote && answered) void useRepoStore.getState().refreshRemoteTags(opts.remote === true ? undefined : { remotes: [opts.remote] });
  }
  return outcome;
}
