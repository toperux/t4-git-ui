// Bottom-pane state for the selected commit (or the compared pair): its changed files, the selected
// file and its diff. Responses that arrive after the selection moved on are dropped (per-request
// sequence numbers).
import { create } from "zustand";
import * as ipc from "../api/ipc";
import { toAppError } from "../api/ipc";
import type { DiffTarget, FileChange, FileDiff, RepoId } from "../api/types";

export type DiffView = "unified" | "split";
export type FileListMode = "flat" | "tree";

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

  /** Loads the file list of `target` (or clears everything for `null`) and selects its first file. */
  load(repoId: RepoId | null, target: DiffTarget | null): Promise<void>;
  selectPath(path: string): void;
  setView(view: DiffView): void;
  toggleWhitespace(): void;
  setContext(n: number): void;
  setFileListMode(mode: FileListMode): void;
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

let filesSeq = 0;
let diffSeq = 0;

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

    async load(repoId, target) {
      const seq = ++filesSeq;
      diffSeq++; // any diff in flight belongs to the previous target
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
      });
      if (!repoId || !target) return;
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
  };
});
