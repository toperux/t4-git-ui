// Working-tree status of the open repository, kept fresh from `repo://changed`.
// Refreshes are debounced (100 ms) and responses that arrive out of order are dropped.
import { create } from "zustand";
import * as ipc from "../api/ipc";
import { toAppError } from "../api/ipc";
import type { RepoChanged, WorkdirStatus } from "../api/types";
import { useRepoStore } from "./repoStore";

export const STATUS_DEBOUNCE_MS = 100;

export interface StatusStore {
  status: WorkdirStatus | null;
  error: string | null;

  /** Fetches the status now (stale responses are ignored). */
  refresh(): Promise<void>;
  /** Fetches the status after the debounce window; repeated calls coalesce. */
  scheduleRefresh(): void;
  /** `repo://changed` handler: status always; refs also update refs/labels or restart the walk when HEAD moved. */
  onChanged(p: RepoChanged): void;
  /** Refs (and labels / the walk when HEAD moved) — also called after our own commit. */
  syncRefs(): Promise<void>;
}

/** staged + unstaged + untracked + conflicted. */
export const selectChangeCount = (s: StatusStore) =>
  s.status ? s.status.staged + s.status.unstaged + s.status.untracked + s.status.conflicted : 0;

export const selectHasChanges = (s: StatusStore) => (s.status?.entries.length ?? 0) > 0;

let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export const useStatusStore = create<StatusStore>()((set, get) => ({
  status: null,
  error: null,

  async refresh() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const repo = useRepoStore.getState().repo;
    if (!repo) {
      seq++;
      set({ status: null, error: null });
      return;
    }
    const mySeq = ++seq;
    try {
      const status = await ipc.getStatus(repo.id);
      if (mySeq !== seq || useRepoStore.getState().repo?.id !== repo.id) return; // stale
      set({ status, error: null });
      // A clean tree has no pseudo-row: fall back to the commit selection.
      if (status.entries.length === 0 && useRepoStore.getState().wtSelected) useRepoStore.getState().selectWorkingTree(false);
    } catch (e) {
      if (mySeq !== seq) return;
      set({ error: toAppError(e).message });
    }
  },

  scheduleRefresh() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void get().refresh();
    }, STATUS_DEBOUNCE_MS);
  },

  onChanged(p) {
    const repo = useRepoStore.getState().repo;
    if (!repo || p.repoId !== repo.id) return;
    get().scheduleRefresh();
    if (p.rescan || p.kinds.includes("refs")) void get().syncRefs();
  },

  async syncRefs() {
    const rs = useRepoStore.getState();
    if (!rs.repo) return;
    const repoId = rs.repo.id;
    const before = rs.refs?.head.oid ?? rs.repo.head.oid;
    await rs.refreshRefs();
    const after = useRepoStore.getState();
    if (after.repo?.id !== repoId) return;
    const now = after.refs?.head.oid ?? null;
    if (now !== before) await after.startLog(after.spec, after.filter);
    else await after.refreshLabels();
  },
}));

// Follow the open repository: load on open, clear on close.
useRepoStore.subscribe((st, prev) => {
  if (st.repo !== prev.repo) void useStatusStore.getState().refresh();
});
