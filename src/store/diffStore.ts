// Bottom-pane state for the selected commit (or the compared pair): its changed files, the selected
// file and its diff, plus the Files tab's whole-tree listing and the selected file's content.
// Responses that arrive after the selection moved on are dropped (per-request sequence numbers).
import { create } from "zustand";
import * as ipc from "../api/ipc";
import { toAppError } from "../api/ipc";
import type { DiffTarget, FileChange, FileContent, FileDiff, RepoId, TreeEntry, TreeTarget } from "../api/types";

export type DiffView = "unified" | "split";
export type FileListMode = "flat" | "tree";
/** Which list the file panel shows: what this commit changed, or every file in it. */
export type FileTab = "changes" | "files";

export interface DiffStore {
  repoId: RepoId | null;
  target: DiffTarget | null;
  files: FileChange[];
  filesLoading: boolean;
  filesError: string | null;
  selectedPath: string | null;
  diff: FileDiff | null;
  diffLoading: boolean;
  diffError: string | null;
  /** Persisted in `localStorage.diffView`. */
  view: DiffView;
  ignoreWhitespace: boolean;
  /** Context lines every diff is loaded with — the commit panel's too, whose hunk / line indices depend on it. */
  context: number;
  /** Persisted in `localStorage.fileListMode`. */
  fileListMode: FileListMode;

  tab: FileTab;
  /** Every file of the target revision; `null` until the Files tab asks for it. */
  tree: TreeEntry[] | null;
  treeLoading: boolean;
  treeError: string | null;
  /** Case-insensitive substring on the path; while set, the list is flat and only matches show. */
  treeFilter: string;
  treeSelectedPath: string | null;
  content: FileContent | null;
  contentLoading: boolean;
  contentError: string | null;

  /** Loads the file list of `target` (or clears everything for `null`) and selects its first file. */
  load(repoId: RepoId | null, target: DiffTarget | null): Promise<void>;
  selectPath(path: string): void;
  setView(view: DiffView): void;
  toggleWhitespace(): void;
  setContext(n: number): void;
  setFileListMode(mode: FileListMode): void;

  setTab(tab: FileTab): void;
  /** The target's whole file list (cached by tree oid; the working tree always refetches). */
  loadTree(): Promise<void>;
  selectTreePath(path: string): void;
  setTreeFilter(text: string): void;
}

function readSetting<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the setting simply doesn't persist.
  }
}

/**
 * Which revision the Files tab lists for a diff target: the *to* commit of a compare (that is what
 * its files and diffs are about), and the working tree for any of the index / workdir targets.
 */
export function treeTargetOf(target: DiffTarget | null): TreeTarget | null {
  if (!target) return null;
  if (target.kind === "commit") return { kind: "commit", oid: target.oid };
  if (target.kind === "commitRange") return { kind: "commit", oid: target.to };
  return { kind: "workingTree" };
}

/** Identifies a target for the per-target selection memory. */
const targetKey = (target: TreeTarget | null) => (target === null ? "" : target.kind === "commit" ? target.oid : "workingTree");

let filesSeq = 0;
let diffSeq = 0;
let treeSeq = 0;
let contentSeq = 0;
/**
 * Listings by target, so walking back to a commit is no refetch. Two targets whose reply carried
 * the same tree oid share one array — that is what the oid is for; it cannot spare the *first* call
 * for a commit, since only the reply says which tree the commit has.
 */
const treeCache = new Map<string, { oid: string | null; entries: TreeEntry[] }>();
/** Listings kept: a 47k-path tree is a couple of megabytes, and the log is unbounded. */
const MAX_TREES = 20;
/** The file each target was last left on, so switching back to it resumes there. */
const treeSelection = new Map<string, string>();

/** Caches `entries` for `key`, sharing the array of an equal tree and evicting the oldest listing. */
function remember(key: string, oid: string | null, entries: TreeEntry[]): TreeEntry[] {
  const shared = oid === null ? undefined : [...treeCache.values()].find((c) => c.oid === oid)?.entries;
  const value = { oid, entries: shared ?? entries };
  treeCache.delete(key);
  treeCache.set(key, value);
  for (const oldest of treeCache.keys()) {
    if (treeCache.size <= MAX_TREES) break;
    treeCache.delete(oldest);
  }
  return value.entries;
}

export const useDiffStore = create<DiffStore>()((set, get) => {
  async function loadDiff() {
    const seq = ++diffSeq;
    const { repoId, target, selectedPath, ignoreWhitespace, context } = get();
    if (!repoId || !target || !selectedPath) {
      set({ diff: null, diffLoading: false, diffError: null });
      return;
    }
    set({ diffLoading: true, diffError: null });
    try {
      const diff = await ipc.getFileDiff(repoId, target, selectedPath, {
        context,
        ignoreWhitespace,
      });
      if (seq !== diffSeq) return; // stale
      set({ diff, diffLoading: false });
    } catch (e) {
      if (seq !== diffSeq) return;
      set({ diff: null, diffLoading: false, diffError: toAppError(e).message });
    }
  }

  async function loadContent() {
    const seq = ++contentSeq;
    const { repoId, target, treeSelectedPath } = get();
    const tree = treeTargetOf(target);
    if (!repoId || !tree || !treeSelectedPath) {
      set({ content: null, contentLoading: false, contentError: null });
      return;
    }
    set({ contentLoading: true, contentError: null });
    try {
      const content = await ipc.readFile(repoId, tree, treeSelectedPath);
      if (seq !== contentSeq) return; // stale
      set({ content, contentLoading: false });
    } catch (e) {
      if (seq !== contentSeq) return;
      set({ content: null, contentLoading: false, contentError: toAppError(e).message });
    }
  }

  return {
    repoId: null,
    target: null,
    files: [],
    filesLoading: false,
    filesError: null,
    selectedPath: null,
    diff: null,
    diffLoading: false,
    diffError: null,
    view: readSetting<DiffView>("diffView", ["unified", "split"], "unified"),
    ignoreWhitespace: false,
    context: 3,
    fileListMode: readSetting<FileListMode>("fileListMode", ["flat", "tree"], "flat"),

    tab: "changes",
    tree: null,
    treeLoading: false,
    treeError: null,
    treeFilter: "",
    treeSelectedPath: null,
    content: null,
    contentLoading: false,
    contentError: null,

    async load(repoId, target) {
      const seq = ++filesSeq;
      diffSeq++; // any diff in flight belongs to the previous target
      treeSeq++;
      contentSeq++;
      set({
        repoId,
        target,
        files: [],
        filesLoading: !!(repoId && target),
        filesError: null,
        selectedPath: null,
        diff: null,
        diffLoading: false,
        diffError: null,
        tree: null,
        treeLoading: false,
        treeError: null,
        // The file this target was last left on; another one starts with no selection.
        treeSelectedPath: treeSelection.get(targetKey(treeTargetOf(target))) ?? null,
        content: null,
        contentLoading: false,
        contentError: null,
      });
      if (!repoId || !target) return;
      // Only the tab on screen fetches: a 47k-path tree is not worth loading for a commit whose
      // changed files are all the user looked at.
      if (get().tab === "files") void get().loadTree();
      try {
        const files = await ipc.getChangedFiles(repoId, target);
        if (seq !== filesSeq) return; // stale
        set({ files, filesLoading: false, selectedPath: files[0]?.path ?? null });
        void loadDiff();
      } catch (e) {
        if (seq !== filesSeq) return;
        set({ filesLoading: false, filesError: toAppError(e).message });
      }
    },

    selectPath(path) {
      if (get().selectedPath === path) return;
      set({ selectedPath: path });
      void loadDiff();
    },

    setView(view) {
      writeSetting("diffView", view);
      set({ view });
    },

    toggleWhitespace() {
      set((s) => ({ ignoreWhitespace: !s.ignoreWhitespace }));
      void loadDiff();
    },

    setContext(context) {
      if (get().context === context) return;
      set({ context });
      void loadDiff();
    },

    setFileListMode(fileListMode) {
      writeSetting("fileListMode", fileListMode);
      set({ fileListMode });
    },

    setTab(tab) {
      if (get().tab === tab) return;
      set({ tab });
      if (tab !== "files") return;
      // First visit for this target: the listing (and the selected file's content) is loaded now.
      if (get().tree === null) void get().loadTree();
      else if (get().treeSelectedPath && !get().content) void loadContent();
    },

    async loadTree() {
      const seq = ++treeSeq;
      const { repoId, target } = get();
      const tree = treeTargetOf(target);
      if (!repoId || !tree) {
        set({ tree: null, treeLoading: false, treeError: null });
        return;
      }
      // The working tree is never served from the cache: it changes under us.
      const cached = tree.kind === "commit" ? treeCache.get(targetKey(tree)) : undefined;
      if (cached) {
        set({ tree: cached.entries, treeLoading: false, treeError: null });
        if (get().treeSelectedPath) void loadContent();
        return;
      }
      set({ treeLoading: true, treeError: null });
      try {
        const listing = await ipc.listTree(repoId, tree);
        if (seq !== treeSeq) return; // stale
        const entries = tree.kind === "commit" ? remember(targetKey(tree), listing.oid, listing.entries) : listing.entries;
        set({ tree: entries, treeLoading: false });
        if (get().treeSelectedPath) void loadContent();
      } catch (e) {
        if (seq !== treeSeq) return;
        set({ tree: null, treeLoading: false, treeError: toAppError(e).message });
      }
    },

    selectTreePath(path) {
      if (get().treeSelectedPath === path) return;
      treeSelection.set(targetKey(treeTargetOf(get().target)), path);
      set({ treeSelectedPath: path });
      void loadContent();
    },

    setTreeFilter(treeFilter) {
      set({ treeFilter });
    },
  };
});

/** Test seam: the module-level listing cache and per-target selection memory. */
export function __resetTreeCacheForTests() {
  treeCache.clear();
  treeSelection.clear();
}
