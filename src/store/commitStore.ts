// Commit-panel state: which working-tree files are selected (one list at a time), the diff of the
// focused file, and the message editor. Mutations go through the IPC and then refresh `statusStore`;
// the panel feeds status changes back via `syncWithStatus`.
import { ask } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import * as ipc from "../api/ipc";
import { toAppError } from "../api/ipc";
import type { FileChange, FileDiff, FileStatus, StatusEntry, WorkdirStatus } from "../api/types";
import { joinMessage, pushHistory, splitMessage } from "../lib/msgHistory";
import { EMPTY_SELECTION, pruneSelection, type Selection } from "../lib/multiSelect";
import { DIFF_CONTEXT } from "./diffStore";
import { useRepoStore } from "./repoStore";
import { useStatusStore } from "./statusStore";
import { toastError, useToastStore } from "./toastStore";

export type ListId = "unstaged" | "staged";

export interface StatusLists {
  unstaged: StatusEntry[];
  staged: StatusEntry[];
}

/** Unstaged = workdir change or conflict; staged = index change. A file may be in both. */
export function splitStatus(status: WorkdirStatus | null): StatusLists {
  const entries = status?.entries ?? [];
  return {
    unstaged: entries.filter((e) => e.workdir !== null || e.conflicted),
    staged: entries.filter((e) => e.index !== null),
  };
}

/** Glyph status of an entry in `list`. */
export function entryStatus(list: ListId, e: StatusEntry): FileStatus {
  if (list === "staged") return e.index ?? "modified";
  return e.conflicted ? "conflicted" : (e.workdir ?? "modified");
}

const other = (list: ListId): ListId => (list === "unstaged" ? "staged" : "unstaged");

export interface CommitStore {
  /** List that owns the selection. */
  list: ListId;
  selected: string[];
  /** Focused row (its diff is shown). */
  anchor: string | null;
  /** Index of `anchor` in its list when selected — where the selection lands after the row vanishes. */
  anchorIndex: number;
  /** `+N −M` per path from `get_changed_files`. */
  stats: Record<ListId, Record<string, FileChange>>;

  diff: FileDiff | null;
  diffPath: string | null;
  diffList: ListId;
  diffLoading: boolean;
  diffError: string | null;

  summary: string;
  body: string;
  amend: boolean;
  signoff: boolean;
  /** Message last written by an amend prefill / history pick (an untouched editor may be overwritten). */
  prefill: { summary: string; body: string } | null;
  /** A mutation is in flight. */
  busy: boolean;

  select(list: ListId, sel: Selection): void;
  /** Prunes the selection against a fresh status, picks a neighbour when the focused row vanished, reloads diff + stats. */
  syncWithStatus(status: WorkdirStatus | null): void;
  stage(paths: string[]): Promise<void>;
  unstage(paths: string[]): Promise<void>;
  /** Confirms with a native dialog first; resolves `false` when cancelled or when a mutation was already running. */
  discard(paths: string[]): Promise<boolean>;
  /** Hunk of the shown diff; unstages when the diff is the staged one. */
  stageHunk(hunk: number): Promise<void>;
  stageLines(lines: [number, number][]): Promise<void>;
  setSummary(v: string): void;
  setBody(v: string): void;
  setSignoff(v: boolean): void;
  /** Turning amend on prefills the editor from HEAD unless the user already typed something. */
  setAmend(on: boolean): Promise<void>;
  /** Fills the editor from a history entry. */
  useMessage(message: string): void;
  /** Resolves the new oid, or `null` when nothing was committed (invalid state / failure). */
  commit(): Promise<string | null>;
  reset(): void;
}

let diffSeq = 0;
let statsSeq = 0;
/** The `StatusEntry` the shown diff was loaded for — an unrelated `repo://changed` must not reload it. */
let diffEntry: StatusEntry | null = null;
/** Entry list the current stats belong to, plus the one-in-flight guard (`get_changed_files` walks the tree). */
let statsKey = "";
let statsInflight = false;
let statsPending: string | null = null;

const EMPTY_STATS = { unstaged: {}, staged: {} };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Signature of a status: stats only need refetching when an entry appears, vanishes or changes state. */
const entriesKey = (status: WorkdirStatus | null) => JSON.stringify(status?.entries ?? []);

export const useCommitStore = create<CommitStore>()((set, get) => {
  const repoId = () => useRepoStore.getState().repo?.id ?? null;

  async function loadDiff() {
    const mySeq = ++diffSeq;
    const id = repoId();
    const { anchor, list } = get();
    diffEntry = anchor ? (useStatusStore.getState().status?.entries.find((e) => e.path === anchor) ?? null) : null;
    if (!id || !anchor) {
      set({ diff: null, diffPath: null, diffLoading: false, diffError: null });
      return;
    }
    set({ diffLoading: true, diffError: null, diffPath: anchor, diffList: list });
    try {
      // Must match the backend's stage-able diff (default options) so hunk / line indices line up.
      const diff = await ipc.getFileDiff(id, { kind: list }, anchor, { context: DIFF_CONTEXT });
      if (mySeq !== diffSeq) return;
      // Identical content → keep the old object: `DiffViewer` keys its scroll / line selection off it.
      const prev = get().diff;
      const unchanged = prev && prev.path === diff.path && same(prev.hunks, diff.hunks);
      set({ diff: unchanged ? prev : diff, diffLoading: false });
    } catch (e) {
      if (mySeq !== diffSeq) return;
      set({ diff: null, diffLoading: false, diffError: toAppError(e).message });
    }
  }

  /** `get_changed_files` walks the whole tree twice: only on a real entry change, one call at a time. */
  async function loadStats(key: string) {
    if (key === statsKey) return;
    if (statsInflight) {
      statsPending = key;
      return;
    }
    const mySeq = ++statsSeq;
    const id = repoId();
    if (!id) return;
    statsInflight = true;
    const byPath = (files: FileChange[]) => Object.fromEntries(files.map((f) => [f.path, f]));
    try {
      const [unstaged, staged] = await Promise.all([
        ipc.getChangedFiles(id, { kind: "unstaged" }).catch(() => []),
        ipc.getChangedFiles(id, { kind: "staged" }).catch(() => []),
      ]);
      if (mySeq !== statsSeq) return;
      statsKey = key;
      set({ stats: { unstaged: byPath(unstaged), staged: byPath(staged) } });
    } finally {
      statsInflight = false;
      const next = statsPending;
      statsPending = null;
      if (next !== null) void loadStats(next);
    }
  }

  /**
   * Runs one mutation (errors → toast with Retry), then refreshes the status.
   * `false` when it never ran because no repo is open or another mutation holds `busy`.
   */
  async function run(title: string, op: (id: string) => Promise<unknown>): Promise<boolean> {
    const id = repoId();
    if (!id || get().busy) return false;
    set({ busy: true });
    try {
      await op(id);
    } catch (e) {
      toastError(toAppError(e), title, () => void run(title, op));
    } finally {
      set({ busy: false });
    }
    await useStatusStore.getState().refresh();
    return true;
  }

  return {
    list: "unstaged",
    selected: [],
    anchor: null,
    anchorIndex: 0,
    stats: EMPTY_STATS,
    diff: null,
    diffPath: null,
    diffList: "unstaged",
    diffLoading: false,
    diffError: null,
    summary: "",
    body: "",
    amend: false,
    signoff: false,
    prefill: null,
    busy: false,

    select(list, sel) {
      const s = get();
      const lists = splitStatus(useStatusStore.getState().status);
      const anchorIndex = sel.anchor ? Math.max(0, lists[list].findIndex((e) => e.path === sel.anchor)) : s.anchorIndex;
      set({ list, selected: sel.selected, anchor: sel.anchor, anchorIndex });
      if (sel.anchor !== s.diffPath || list !== s.diffList) void loadDiff();
    },

    syncWithStatus(status) {
      const s = get();
      const lists = splitStatus(status);
      const paths = { unstaged: lists.unstaged.map((e) => e.path), staged: lists.staged.map((e) => e.path) };
      let list = s.list;
      let sel = pruneSelection(paths[list], { selected: s.selected, anchor: s.anchor });
      if (sel.selected.length === 0) {
        const own = paths[list];
        let item = own[Math.min(s.anchorIndex, own.length - 1)];
        if (item === undefined && paths[other(list)].length > 0) {
          list = other(list);
          item = paths[list][0];
        }
        sel = item === undefined ? EMPTY_SELECTION : { selected: [item], anchor: item };
      }
      set({ list, selected: sel.selected, anchor: sel.anchor, anchorIndex: sel.anchor ? paths[list].indexOf(sel.anchor) : s.anchorIndex });
      // An unrelated file changing on disk must not reload (and so reset the scroll / line selection of)
      // the shown diff: only reload when the focused row moved or its own status entry changed.
      const entry = sel.anchor ? (status?.entries.find((e) => e.path === sel.anchor) ?? null) : null;
      if (sel.anchor !== s.diffPath || list !== s.diffList || !same(entry, diffEntry)) void loadDiff();
      void loadStats(entriesKey(status));
    },

    async stage(paths) {
      await run("Stage failed", (id) => ipc.stagePaths(id, paths));
    },

    async unstage(paths) {
      await run("Unstage failed", (id) => ipc.unstagePaths(id, paths));
    },

    async discard(paths) {
      const entries = useStatusStore.getState().status?.entries ?? [];
      const untracked = paths.filter((p) => entries.find((e) => e.path === p)?.workdir === "untracked").length;
      const n = paths.length;
      const files = n === 1 ? paths[0] : `${n} files`;
      const message =
        untracked === n
          ? `Delete ${files}? Untracked files are removed from disk.`
          : untracked > 0
            ? `Discard changes in ${files}? Tracked files are restored from the index; ${untracked} untracked file${untracked === 1 ? " is" : "s are"} deleted.`
            : `Discard changes in ${files}? This cannot be undone.`;
      // No confirmation available (no Tauri dialog plugin) → treat it as declined; nothing is lost.
      const ok = await ask(message, { title: untracked === n ? "Delete files" : "Discard changes", kind: "warning", okLabel: untracked === n ? "Delete" : "Discard" }).catch(() => false);
      if (!ok) return false;
      // `false` too when another mutation was already running: nothing was discarded.
      return await run("Discard failed", (id) => ipc.discardPaths(id, paths));
    },

    async stageHunk(hunk) {
      const { diffPath, diffList } = get();
      if (!diffPath) return;
      const reverse = diffList === "staged";
      await run(reverse ? "Unstage failed" : "Stage failed", (id) => ipc.stageHunks(id, diffPath, [hunk], reverse));
    },

    async stageLines(lines) {
      const { diffPath, diffList } = get();
      if (!diffPath || lines.length === 0) return;
      const reverse = diffList === "staged";
      await run(reverse ? "Unstage failed" : "Stage failed", (id) => ipc.stageLines(id, diffPath, lines, reverse));
    },

    setSummary: (summary) => set({ summary }),
    setBody: (body) => set({ body }),
    setSignoff: (signoff) => set({ signoff }),

    async setAmend(on) {
      set({ amend: on });
      const id = repoId();
      if (!on || !id) return;
      const message = await ipc.getHeadMessage(id).catch(() => null);
      if (!message || !get().amend) return;
      const { summary, body, prefill } = get();
      const untouched = (!summary.trim() && !body.trim()) || (prefill !== null && prefill.summary === summary && prefill.body === body);
      if (!untouched) return;
      const split = splitMessage(message);
      set({ summary: split.summary, body: split.body, prefill: split });
    },

    useMessage(message) {
      const split = splitMessage(message);
      set({ summary: split.summary, body: split.body, prefill: split });
    },

    async commit() {
      const id = repoId();
      const { summary, body, amend, signoff, busy } = get();
      if (!id || busy || !summary.trim()) return null;
      const message = joinMessage(summary, body);
      set({ busy: true });
      let committed: string | null = null;
      try {
        const oid = await ipc.commit(id, message, amend, signoff);
        committed = oid;
        pushHistory(id, message);
        useToastStore.getState().push({ kind: "success", title: amend ? "Amended HEAD" : "Committed", detail: `${oid.slice(0, 7)} ${summary.trim()}` });
        // The message is spent either way — an amend also drops the amend flag and its prefill memory.
        set({ summary: "", body: "", amend: false, prefill: null });
      } catch (e) {
        toastError(toAppError(e), "Commit failed", () => void get().commit());
      } finally {
        set({ busy: false });
      }
      // Status first (clears the working-tree row when clean), then refs → HEAD moved → fresh walk.
      const st = useStatusStore.getState();
      await st.refresh();
      await st.syncRefs();
      return committed;
    },

    reset() {
      diffSeq++;
      statsSeq++;
      diffEntry = null;
      statsKey = "";
      statsPending = null;
      set({
        list: "unstaged",
        selected: [],
        anchor: null,
        anchorIndex: 0,
        stats: EMPTY_STATS,
        diff: null,
        diffPath: null,
        diffLoading: false,
        diffError: null,
        summary: "",
        body: "",
        amend: false,
        signoff: false,
        prefill: null,
        busy: false,
      });
    },
  };
});

// The editor belongs to one repository.
useRepoStore.subscribe((st, prev) => {
  if (st.repo?.id !== prev.repo?.id) useCommitStore.getState().reset();
});
