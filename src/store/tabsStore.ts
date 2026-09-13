// The repositories this window has open, one tab each. Every window runs its own React app with its
// own stores, so the stores stay single-repo: switching tabs takes a snapshot of the active
// repository's slices and puts the target's back (see each store's `snapshot` / `restore`), and a
// change reported for a background tab only marks it stale — activating it refreshes.
import { create } from "zustand";
import * as ipc from "../api/ipc";
import { toAppError } from "../api/ipc";
import type { RepoId } from "../api/types";
import { closeThisWindow, isMainWindow } from "../lib/appWindow";
import { refreshAll, refusedWhileRunning } from "../screens/RepoWindow/actions";
import { restore as restoreCommit, snapshot as commitSnapshot, type CommitSnapshot } from "./commitStore";
import { useDialogStore } from "./dialogStore";
import { restore as restoreDiff, snapshot as diffSnapshot, type DiffSnapshot } from "./diffStore";
import { restore as restoreRepo, snapshot as repoSnapshot, useRepoStore, type RepoSnapshot } from "./repoStore";
import { restore as restoreStatus, snapshot as statusSnapshot, type StatusSnapshot } from "./statusStore";
import { toastError } from "./toastStore";

export interface Tab {
  id: RepoId;
  /** Canonical workdir, as the backend reported it — what the layout and a torn-off window carry. */
  path: string;
  name: string;
  /** Something changed in this repository while the tab was in the background. */
  stale: boolean;
}

/** One background tab's window-local state. */
export interface Snapshot {
  repo: RepoSnapshot;
  status: StatusSnapshot;
  commit: CommitSnapshot;
  diff: DiffSnapshot;
}

export interface TabsStore {
  tabs: Tab[];
  active: RepoId | null;
  saved: Record<RepoId, Snapshot>;
  /** Slot a tab dragged from another window would land in, or `null` when none is hovering this one. */
  caret: number | null;

  /**
   * Opens `path` in a new tab — or activates the tab that already has it, or focuses the other
   * window that does (`openElsewhere`, which resolves quietly). Rejects with the `AppError` of a
   * real failure, so each entry point can say what it wants about it.
   */
  openTab(path: string): Promise<void>;
  activate(id: RepoId): void;
  /** Closes the tab and lets go of its repository; the last tab closes the window (or, in the main window, shows the start screen). */
  closeTab(id: RepoId): Promise<void>;
  markStale(id: RepoId): void;
  /** Moves the tab to a window of its own. */
  detach(id: RepoId): Promise<void>;
  reorder(from: number, to: number): void;
  setCaret(at: number | null): void;
}

const take = (): Snapshot => ({ repo: repoSnapshot(), status: statusSnapshot(), commit: commitSnapshot(), diff: diffSnapshot() });

/** `repoStore` first: the other stores subscribe to it, and their subscribers reset them. */
function put(s: Snapshot) {
  restoreRepo(s.repo);
  restoreStatus(s.status);
  restoreCommit(s.commit);
  restoreDiff(s.diff);
}

/** Shows the tab `snap` belongs to. The walk is restarted rather than resumed — it may be generations behind. */
function show(snap: Snapshot | undefined) {
  // Whatever was open referenced the repository being left.
  useDialogStore.getState().close();
  if (snap) put(snap);
  refreshAll();
}

export const useTabsStore = create<TabsStore>()((set, get) => ({
  tabs: [],
  active: null,
  saved: {},
  caret: null,

  async openTab(path) {
    let summary;
    try {
      // The backend answers with the id, which is the identity a tab is compared by: `\\?\`, case
      // and slash variants of a path — and a subdirectory of a repository — all land on the same
      // one. It is also what focuses the window that already has it.
      summary = await ipc.openRepo(path);
    } catch (e) {
      // `openElsewhere`: that window has the focus now, and there is nothing to say here.
      if (toAppError(e).kind === "openElsewhere") return;
      throw e;
    }
    const { tabs, active } = get();
    if (tabs.some((t) => t.id === summary.id)) {
      get().activate(summary.id);
      return;
    }
    useDialogStore.getState().close();
    set({
      tabs: [...tabs, { id: summary.id, path: summary.path, name: summary.name, stale: false }],
      active: summary.id,
      saved: active ? { ...get().saved, [active]: take() } : get().saved,
    });
    try {
      await useRepoStore.getState().openRepo(summary.path);
    } catch (e) {
      // The tab is only worth keeping if something loaded into it.
      await get().closeTab(summary.id);
      throw e;
    }
  },

  activate(id) {
    const { tabs, active, saved } = get();
    if (id === active || !tabs.some((t) => t.id === id)) return;
    // One busy guard per window: an operation is running against the repository being left, and it
    // would finish — and refresh — against a tab that is no longer the open one.
    if (refusedWhileRunning("switching tabs")) return;
    const next = active ? { ...saved, [active]: take() } : saved;
    set({ tabs: tabs.map((t) => (t.id === id ? { ...t, stale: false } : t)), active: id, saved: next });
    show(next[id]);
  },

  async closeTab(id) {
    const { tabs, active } = get();
    const i = tabs.findIndex((t) => t.id === id);
    if (i < 0) return;
    if (refusedWhileRunning("closing the tab")) return;
    const rest = tabs.filter((t) => t.id !== id);
    const saved = { ...get().saved };
    delete saved[id];

    if (active !== id) {
      set({ tabs: rest, saved });
    } else if (rest.length === 0) {
      set({ tabs: [], active: null, saved });
      // Clears every store and calls `close_repo` itself.
      await useRepoStore
        .getState()
        .closeRepo()
        .catch((e: unknown) => toastError(toAppError(e), "Couldn't close the repository"));
      // A secondary window with nothing left in it is over; the main one shows the start screen.
      if (!isMainWindow()) closeThisWindow();
      return;
    } else {
      // The tab that took its place, or the last one when it was the last.
      const next = rest[Math.min(i, rest.length - 1)];
      set({ tabs: rest, active: next.id, saved });
      show(saved[next.id]);
    }
    // Always: the handle is refcounted by window, so this is what lets it go — and a no-op when
    // another window still has it.
    await ipc.closeRepo(id).catch(() => undefined);
  },

  markStale(id) {
    if (id === get().active) return;
    set((s) => (s.tabs.some((t) => t.id === id && !t.stale) ? { tabs: s.tabs.map((t) => (t.id === id ? { ...t, stale: true } : t)) } : {}));
  },

  async detach(id) {
    const tab = get().tabs.find((t) => t.id === id);
    // The last tab already has a window to itself: moving it out would spawn a replacement and
    // destroy this one (the drag path refuses the same way, `tearOff`).
    if (!tab || get().tabs.length < 2) return;
    if (refusedWhileRunning("moving the tab to a new window")) return;
    try {
      await ipc.spawnWindow({ tabs: [tab.path], active: tab.path });
    } catch (e) {
      toastError(toAppError(e), "Couldn't open a new window");
      return;
    }
    // Only once the new window exists: a failed spawn must not lose the repository.
    await get().closeTab(id);
  },

  reorder(from, to) {
    const tabs = get().tabs.slice();
    if (from === to || from < 0 || to < 0 || from >= tabs.length || to >= tabs.length) return;
    tabs.splice(to, 0, ...tabs.splice(from, 1));
    set({ tabs });
  },

  setCaret(at) {
    if (at !== get().caret) set({ caret: at });
  },
}));

/** The active tab, for the strip and the title. */
export const selectActiveTab = (s: TabsStore) => s.tabs.find((t) => t.id === s.active) ?? null;
