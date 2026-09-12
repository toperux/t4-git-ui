// Commit-panel state: which working-tree files are selected (one list at a time), the diff of the
// focused file, and the message editor. Mutations go through the IPC and then refresh `statusStore`;
// the panel feeds status changes back via `syncWithStatus`.
import { ask } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import * as ipc from "../api/ipc";
import { toAppError } from "../api/ipc";
import type { AppError, Author, ConflictSide, FileChange, FileDiff, FileStatus, RepoState, StatusEntry, WorkdirStatus } from "../api/types";
import { eqDeep } from "../lib/eqDeep";
import { joinMessage, pushHistory, splitMessage } from "../lib/msgHistory";
import { EMPTY_SELECTION, pruneSelection, type Selection } from "../lib/multiSelect";
import { useDiffStore } from "./diffStore";
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
  /**
   * Each list's files as its mounted view orders them (tree or flat), registered by `FileList`; `null`
   * until one mounts. Where the selection lands when the focused row vanishes.
   */
  order: Record<ListId, string[] | null>;
  /** `+N −M` per path from `get_changed_files`. */
  stats: Record<ListId, Record<string, FileChange>>;

  /** Author line — fetched once per repository, shared by every `MessageColumn` (panel and dialog). */
  author: Author | null;
  authorError: AppError | null;

  diff: FileDiff | null;
  diffPath: string | null;
  diffList: ListId;
  /** Context lines the shown diff was built with — its hunk / line indices line up with nothing else. */
  diffContext: number;
  diffLoading: boolean;
  diffError: string | null;

  summary: string;
  body: string;
  amend: boolean;
  signoff: boolean;
  /**
   * Message last written by a prefill (an untouched editor may be overwritten), and which entry
   * point wrote it — an abort takes back only its own (`pending`).
   */
  prefill: { summary: string; body: string; from: "amend" | "pending" | "history" } | null;
  /** A mutation is in flight. */
  busy: boolean;

  select(list: ListId, sel: Selection): void;
  /** `FileList` registers its display order; a focused row missing from the new order hands the selection to its neighbour. */
  setOrder(list: ListId, order: string[]): void;
  /** Prunes the selection against a fresh status (first row when nothing is left), reloads diff + stats. */
  syncWithStatus(status: WorkdirStatus | null): void;
  /** Rebuilds the shown diff: the context setting moved, so the indices of what is on screen did too. */
  reloadDiff(): Promise<void>;
  /** Fetches the author unless known; a failed fetch is retried on the next call (the user may have just set user.name). */
  loadAuthor(): Promise<void>;
  stage(paths: string[]): Promise<void>;
  unstage(paths: string[]): Promise<void>;
  /** Confirms with a native dialog first; resolves `false` when cancelled or when a mutation was already running. */
  discard(paths: string[]): Promise<boolean>;
  /**
   * Keeps one whole side of `paths`' conflicts, `label` naming it for the confirmation (`side` is
   * git's own sense, `label` the branch the backend put on it). Overwrites the working files.
   */
  resolveConflict(paths: string[], side: ConflictSide, label: string): Promise<void>;
  /** Hunk of the shown diff; unstages when the diff is the staged one. */
  stageHunk(hunk: number): Promise<void>;
  stageLines(lines: [number, number][]): Promise<void>;
  /** Hunk of the shown unstaged diff, thrown away after a confirmation (the working file loses it). */
  discardHunk(hunk: number): Promise<void>;
  discardLines(lines: [number, number][]): Promise<void>;
  setSummary(v: string): void;
  setBody(v: string): void;
  setSignoff(v: boolean): void;
  /** Turning amend on prefills the editor from HEAD unless the user already typed something. */
  setAmend(on: boolean): Promise<void>;
  /**
   * A merge / cherry-pick / revert that stopped (`on`) prefills the editor from `MERGE_MSG`, the way
   * `git commit` would; ending it without a commit (abort) takes that prefill back. Neither touches
   * a message the user typed. `staged`: the caller is a `--no-commit` pick, which left the state
   * clean with the change staged — the message is still git's to hand over.
   */
  prefillPending(on: boolean, opts?: { staged?: boolean }): Promise<void>;
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
let statsFor: StatusEntry[] | null = null;
let statsInflight = false;
let statsPending: StatusEntry[] | null = null;
/** Repository whose author fetch is in flight. */
let authorFor: string | null = null;
/** Both prefill entry points await an IPC and then write the editor: the later start wins. */
let prefillSeq = 0;

const EMPTY_STATS = { unstaged: {}, staged: {} };
const NO_ORDER = { unstaged: null, staged: null };

/** States that stop with a message prepared and are finished by a plain commit from the panel. */
const PENDING = new Set<RepoState>(["merge", "cherryPick", "revert"]);

/**
 * The other half of a working-tree rename of `path`, which is what lets the backend pair the two
 * from that file's diff alone instead of diffing every untracked file in the tree. Every call that
 * makes the backend build the diff of a file — the panel's own load, and each hunk / line action,
 * which resolves its indices against a rebuild — has to send the same hint, or they are two
 * different diffs.
 */
function renameHint(path: string | null): string | undefined {
  const e = path ? useStatusStore.getState().status?.entries.find((x) => x.path === path) : undefined;
  return e?.workdir === "renamed" ? (e.oldPath ?? undefined) : undefined;
}

/** Nothing the user typed is in the editor: it is empty, or holds exactly what the last prefill put there. */
const untouched = ({ summary, body, prefill }: CommitStore) =>
  (!summary.trim() && !body.trim()) || (prefill !== null && prefill.summary === summary && prefill.body === body);

export const useCommitStore = create<CommitStore>()((set, get) => {
  const repoId = () => useRepoStore.getState().repo?.id ?? null;

  async function loadDiff() {
    const mySeq = ++diffSeq;
    const id = repoId();
    const { anchor, list, diffPath, diffList } = get();
    const entry = anchor ? (useStatusStore.getState().status?.entries.find((e) => e.path === anchor) ?? null) : null;
    diffEntry = entry;
    if (!id || !anchor) {
      set({ diff: null, diffPath: null, diffLoading: false, diffError: null });
      return;
    }
    // Another file — or the same one in the other list — is another diff: the body goes blank for the
    // round trip, because `diffPath` / `diffList` move now and every hunk / line action reads them.
    // A reload of the same target (watcher, post-mutation, context change) keeps what is on screen.
    const changed = anchor !== diffPath || list !== diffList;
    set({ ...(changed && { diff: null }), diffLoading: true, diffError: null, diffPath: anchor, diffList: list });
    // The context the shown diff is built with is what every hunk / line action has to send back:
    // the backend rebuilds the diff to resolve the indices, and another context merges / splits hunks.
    const context = useDiffStore.getState().context;
    try {
      const diff = await ipc.getFileDiff(id, { kind: list }, anchor, { context }, renameHint(anchor));
      if (mySeq !== diffSeq) return;
      // Identical content → keep the old object: `DiffViewer` keys its scroll / line selection off it.
      // Only for the same target, though — a selection made against the unstaged diff means something
      // else in the staged one, however alike the two patches are.
      const prev = get().diff;
      const unchanged = !changed && prev && prev.path === diff.path && eqDeep(prev.hunks, diff.hunks);
      set({ diff: unchanged ? prev : diff, diffContext: context, diffLoading: false });
    } catch (e) {
      if (mySeq !== diffSeq) return;
      set({ diff: null, diffLoading: false, diffError: toAppError(e).message });
    }
  }

  /** `get_changed_files` walks the whole tree twice: only on a real entry change, one call at a time. */
  async function loadStats(entries: StatusEntry[]) {
    if (eqDeep(entries, statsFor)) return;
    if (statsInflight) {
      statsPending = entries;
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
      statsFor = entries;
      set({ stats: { unstaged: byPath(unstaged), staged: byPath(staged) } });
    } finally {
      statsInflight = false;
      const next = statsPending;
      statsPending = null;
      if (next !== null) void loadStats(next);
    }
  }

  /**
   * The native confirmation blocks nothing behind it: a `repo://changed` (a save by another tool) can
   * reload the diff while it is up, and the picked hunk / line indices belong to the diff the user saw.
   * An in-range index still applies — at the wrong lines, with no undo — so the discard is dropped.
   */
  function stillShown(diff: FileDiff | null): boolean {
    if (get().diff === diff) return true;
    useToastStore.getState().push({ kind: "info", title: "Discard cancelled", detail: "The diff changed while you were confirming — try again" });
    return false;
  }

  /**
   * Runs one mutation (errors → toast with Retry), then refreshes the status.
   * `false` when it never ran because no repo is open or another mutation holds `busy`.
   *
   * The focus is read here, on entry: by the time the op fails, `busy` has disabled the control that
   * was clicked and dropped the focus to `<body>`. `origin` is how a Retry carries the same control
   * through a whole retry loop.
   */
  async function run(title: string, op: (id: string) => Promise<unknown>, origin?: HTMLElement | null): Promise<boolean> {
    const from = origin ?? (document.activeElement as HTMLElement | null);
    const id = repoId();
    if (!id) return false;
    if (get().busy) {
      // A Retry action has already dismissed its own toast: without this the error just vanishes.
      useToastStore.getState().push({ kind: "info", title: "Operation in progress", detail: "Another change is being applied" });
      return false;
    }
    set({ busy: true });
    try {
      await op(id);
    } catch (e) {
      toastError(toAppError(e), title, () => void run(title, op, from), from);
    } finally {
      set({ busy: false });
    }
    // We just rewrote the index for the shown file, so the diff and the `+N −M` beside it are stale
    // whatever the status says: staging one hunk out of several leaves the entry at
    // modified/modified, and both guards read that as "nothing to see". Forgetting what they were
    // computed for makes them reload. (Identical content still keeps the `diff` object, so a reload
    // that finds nothing new never jumps the view.)
    diffEntry = null;
    statsFor = null;
    await useStatusStore.getState().refresh();
    return true;
  }

  return {
    list: "unstaged",
    selected: [],
    anchor: null,
    order: NO_ORDER,
    stats: EMPTY_STATS,
    author: null,
    authorError: null,
    diff: null,
    diffPath: null,
    diffList: "unstaged",
    diffContext: useDiffStore.getState().context,
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
      set({ list, selected: sel.selected, anchor: sel.anchor });
      if (sel.anchor !== s.diffPath || list !== s.diffList) void loadDiff();
    },

    setOrder(list, order) {
      const s = get();
      const prev = s.order[list];
      set({ order: { ...s.order, [list]: order } });
      if (list !== s.list || !s.anchor || !prev || order.includes(s.anchor)) return;
      // The focused row left the list (staged / unstaged / discarded). The list's effect runs before
      // `syncWithStatus` prunes (child effects first), so `prev` still says where the row was: land on
      // the one below it, else the last one above. Only when nothing else stays selected — a surviving
      // multi-selection keeps its rows and just loses the focus.
      if (order.some((p) => s.selected.includes(p))) return;
      const i = prev.indexOf(s.anchor);
      const live = new Set(order);
      const next = prev.slice(i + 1).find((p) => live.has(p)) ?? prev.slice(0, i).reverse().find((p) => live.has(p));
      if (next !== undefined) get().select(list, { selected: [next], anchor: next });
    },

    syncWithStatus(status) {
      const s = get();
      const lists = splitStatus(status);
      const paths = { unstaged: lists.unstaged.map((e) => e.path), staged: lists.staged.map((e) => e.path) };
      let list = s.list;
      let sel = pruneSelection(paths[list], { selected: s.selected, anchor: s.anchor });
      if (sel.selected.length === 0) {
        // Nothing (left) selected: the first row of this list, else of the other one.
        let item = paths[list][0];
        if (item === undefined && paths[other(list)].length > 0) {
          list = other(list);
          item = paths[list][0];
        }
        sel = item === undefined ? EMPTY_SELECTION : { selected: [item], anchor: item };
      }
      set({ list, selected: sel.selected, anchor: sel.anchor });
      // An unrelated file changing on disk must not reload (and so reset the scroll / line selection of)
      // the shown diff: only reload when the focused row moved or its own status entry changed.
      const entry = sel.anchor ? (status?.entries.find((e) => e.path === sel.anchor) ?? null) : null;
      if (sel.anchor !== s.diffPath || list !== s.diffList || !eqDeep(entry, diffEntry)) void loadDiff();
      void loadStats(status?.entries ?? []);
    },

    reloadDiff: loadDiff,

    async loadAuthor() {
      const id = repoId();
      if (!id || get().author || authorFor === id) return;
      authorFor = id;
      try {
        const author = await ipc.getAuthor(id);
        if (repoId() === id) set({ author, authorError: null });
      } catch (e) {
        if (repoId() === id) set({ authorError: toAppError(e) });
      } finally {
        if (authorFor === id) authorFor = null;
      }
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
      const ok = await ask(message, { title: untracked === n ? "Delete files" : "Discard changes", kind: "warning", cancelLabel: "Cancel", okLabel: untracked === n ? "Delete" : "Discard" }).catch(() => false);
      if (!ok) return false;
      // A working-tree rename is one row here but two halves on disk, and `status_file` cannot pair
      // them back up — so the old name rides along or it is never restored. After the prompt: the
      // user picked one file and the wording above must keep saying so. The tree can have moved
      // while the prompt was up, so the pairing reads the status of now, not the one it was worded on.
      const fresh = useStatusStore.getState().status?.entries ?? [];
      const targets = [
        ...new Set(
          paths.flatMap((p) => {
            const e = fresh.find((x) => x.path === p);
            return e?.workdir === "renamed" && e.oldPath ? [p, e.oldPath] : [p];
          }),
        ),
      ];
      // `false` too when another mutation was already running: nothing was discarded.
      return await run("Discard failed", (id) => ipc.discardPaths(id, targets));
    },

    async resolveConflict(paths, side, label) {
      const n = paths.length;
      const files = n === 1 ? paths[0] : `${n} files`;
      // No confirmation available → declined: the checkout overwrites the working file.
      const ok = await ask(`Replace ${files} with ${label}'s version? Your edits to ${n === 1 ? "it" : "them"} are lost.`, { title: "Resolve conflict", kind: "warning", cancelLabel: "Cancel", okLabel: "Replace" }).catch(() => false);
      if (!ok) return;
      await run("Resolve failed", (id) => ipc.resolveConflict(id, paths, side));
    },

    async stageHunk(hunk) {
      // The indices are the shown diff's, so the backend has to rebuild it with the same context
      // and the same rename hint.
      const { diffPath, diffList, diffContext } = get();
      if (!diffPath) return;
      const reverse = diffList === "staged";
      await run(reverse ? "Unstage failed" : "Stage failed", (id) => ipc.stageHunks(id, diffPath, [hunk], reverse, diffContext, renameHint(diffPath)));
    },

    async stageLines(lines) {
      const { diffPath, diffList, diffContext } = get();
      if (!diffPath || lines.length === 0) return;
      const reverse = diffList === "staged";
      await run(reverse ? "Unstage failed" : "Stage failed", (id) => ipc.stageLines(id, diffPath, lines, reverse, diffContext, renameHint(diffPath)));
    },

    async discardHunk(hunk) {
      const { diffPath, diff, diffContext } = get();
      if (!diffPath) return;
      // No confirmation available → declined; a discard has no undo.
      const ok = await ask(`Discard this hunk from ${diffPath}? This cannot be undone.`, { title: "Discard hunk", kind: "warning", cancelLabel: "Cancel", okLabel: "Discard" }).catch(() => false);
      if (!ok || !stillShown(diff)) return;
      await run("Discard failed", (id) => ipc.discardHunks(id, diffPath, [hunk], diffContext, renameHint(diffPath)));
    },

    async discardLines(lines) {
      const { diffPath, diff, diffContext } = get();
      if (!diffPath || lines.length === 0) return;
      const n = lines.length;
      const ok = await ask(`Discard ${n} selected line${n === 1 ? "" : "s"} from ${diffPath}? This cannot be undone.`, { title: "Discard lines", kind: "warning", cancelLabel: "Cancel", okLabel: "Discard" }).catch(() => false);
      if (!ok || !stillShown(diff)) return;
      await run("Discard failed", (id) => ipc.discardLines(id, diffPath, lines, diffContext, renameHint(diffPath)));
    },

    setSummary: (summary) => set({ summary }),
    setBody: (body) => set({ body }),
    setSignoff: (signoff) => set({ signoff }),

    async setAmend(on) {
      set({ amend: on });
      const id = repoId();
      if (!on || !id) return;
      const mySeq = ++prefillSeq;
      const message = await ipc.getHeadMessage(id).catch(() => null);
      // A prefill that started later has the say — it knows about this one, not the other way round.
      if (mySeq !== prefillSeq || !message || !get().amend || !untouched(get())) return;
      const split = splitMessage(message);
      set({ summary: split.summary, body: split.body, prefill: { ...split, from: "amend" } });
    },

    async prefillPending(on, { staged = false } = {}) {
      if (!on) {
        // Aborted: the editor holds a message for an operation that is no longer happening. An amend
        // prefill (HEAD's message) or a history pick is still the user's, so those stay.
        if (get().prefill?.from === "pending" && untouched(get())) set({ summary: "", body: "", prefill: null });
        return;
      }
      const id = repoId();
      if (!id) return;
      const mySeq = ++prefillSeq;
      const message = await ipc.getMergeMessage(id).catch(() => null);
      // The operation may have ended (or the repo changed) while the read was in flight: a message
      // for an aborted pick must not land. A `--no-commit` pick usually never entered a pending
      // state — but a conflicting `-n` revert does keep `REVERT_HEAD` (a `-n` cherry-pick does not).
      const state = useRepoStore.getState().refs?.state;
      const live = !!state && (PENDING.has(state) || (staged && state === "clean"));
      if (mySeq !== prefillSeq || !message || repoId() !== id || !live || !untouched(get())) return;
      const split = splitMessage(message);
      set({ summary: split.summary, body: split.body, prefill: { ...split, from: "pending" } });
    },

    useMessage(message) {
      const split = splitMessage(message);
      set({ summary: split.summary, body: split.body, prefill: { ...split, from: "history" } });
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
      statsFor = null;
      statsPending = null;
      authorFor = null;
      set({
        list: "unstaged",
        selected: [],
        anchor: null,
        order: NO_ORDER,
        stats: EMPTY_STATS,
        author: null,
        authorError: null,
        diff: null,
        diffPath: null,
        diffContext: useDiffStore.getState().context,
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

// A merge / cherry-pick / revert that stops leaves the message it prepared behind; the editor opens
// with it, as `git commit` would, and gives it back when the operation ends without a commit.
useRepoStore.subscribe((st, prev) => {
  const state = st.refs?.state;
  // A switch between two repos both mid-operation is a change too (the reset above ran first).
  if (!state || (state === prev.refs?.state && st.repo?.id === prev.repo?.id)) return;
  void useCommitStore.getState().prefillPending(PENDING.has(state));
});

// `setContext` reloads the details-pane diff only. The panel's is built with the same setting, so it
// has to follow — otherwise the hunks on screen keep the old shape while the next action sends the new one.
useDiffStore.subscribe((st, prev) => {
  if (st.context !== prev.context && useCommitStore.getState().diffPath) void useCommitStore.getState().reloadDiff();
});
