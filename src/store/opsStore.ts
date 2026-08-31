// Streamed CLI operations (`op://event`) for the output dock.
import { create } from "zustand";
import * as ipc from "../api/ipc";
import type { OpEvent } from "../api/types";

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

  onEvent(e: OpEvent): void;
  cancel(opId: string): Promise<void>;
  setOpen(open: boolean): void;
}

export const selectLastOp = (s: OpsStore) => s.ops[s.ops.length - 1] ?? null;

export const useOpsStore = create<OpsStore>()((set, get) => ({
  ops: [],
  open: false,

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
    if (event.kind === "exit") {
      next = { ...op, running: false, code: event.code, elapsedMs: event.elapsedMs };
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
    set({ ops: copy });
  },

  async cancel(opId) {
    await ipc.cancelOp(opId);
  },

  setOpen: (open) => set({ open }),
}));
