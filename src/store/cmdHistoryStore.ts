// Lines typed into "Run git command…" / the dock prompt, newest first, shared by every repository
// (lib/kv `cmdHistory`). A line is recorded when it runs: a failing command is worth recalling too.
import { create } from "zustand";
import { kvGet, kvSet } from "../lib/kv";

export const CMD_HISTORY_MAX = 50;
const KEY = "cmdHistory";

/** `line` on top (an identical earlier entry moves up rather than repeating), capped. */
export function pushCmd(list: string[], line: string): string[] {
  return [line, ...list.filter((l) => l !== line)].slice(0, CMD_HISTORY_MAX);
}

export interface CmdHistoryStore {
  history: string[];
  load(): Promise<void>;
  push(line: string): void;
}

export const useCmdHistoryStore = create<CmdHistoryStore>()((set, get) => ({
  history: [],
  async load() {
    const v = await kvGet<unknown>(KEY);
    set({ history: Array.isArray(v) ? v.filter((l): l is string => typeof l === "string") : [] });
  },
  push(line) {
    const history = pushCmd(get().history, line);
    set({ history });
    kvSet(KEY, history).catch((e: unknown) => console.warn(`kv: could not persist "${KEY}"`, e));
  },
}));
