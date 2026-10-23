// The repositories this window has open, one tab each. Every window runs its own React app with its
// own stores, so the stores stay single-repo: switching tabs takes a snapshot of the active
// repository's slices and puts the target's back (see each store's `snapshot` / `restore`), and a
// change reported for a background tab only marks it stale — activating it refreshes.
import { create } from "zustand";
import * as ipc from "../api/ipc";
import { toAppError } from "../api/ipc";
import type { LogFilter, RepoId, RevSpec } from "../api/types";
import { closeThisWindow, isMainWindow } from "../lib/appWindow";
import { baseName } from "../lib/paths";
import { pick } from "../lib/pick";
import { refreshAll, refusedWhileRunning } from "../screens/RepoWindow/actions";
import { forgetScroll, seedScroll, takeNote, type DiffScroll } from "../screens/RepoWindow/DiffViewer/diffScroll";
import { hasDraft, restore as restoreCommit, snapshot as commitSnapshot, type CommitSnapshot, useCommitStore } from "./commitStore";
import { useDialogStore } from "./dialogStore";
import { restore as restoreDiff, snapshot as diffSnapshot, type DiffSnapshot } from "./diffStore";
import { lastTopRow, restore as restoreRepo, selectSelectedOid, snapshot as repoSnapshot, useRepoStore, type RepoSnapshot } from "./repoStore";
import { restore as restoreStatus, snapshot as statusSnapshot, type StatusSnapshot } from "./statusStore";
import { toastError } from "./toastStore";
import { restore as restoreView, snapshot as viewSnapshot, useViewStore, type View, type ViewSnapshot } from "./viewStore";

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
  view: ViewSnapshot;
  /** Where its History or Changes diff was scrolled (`diffScroll`), `null` when nothing noted it. */
  scroll: DiffScroll | null;
}

const DRAFT_KEYS = ["summary", "body", "amend", "signoff", "sign", "prefill"] as const;

/**
 * What a tab moved to another window takes with it, beside its path (detach, and a drag onto another
 * window or into a window of its own): opaque to Rust, and never in `layout.json`.
 */
export interface TabCarry {
  /** The commit editor. */
  draft: Pick<CommitSnapshot, (typeof DRAFT_KEYS)[number]>;
  spec: RevSpec;
  filter: LogFilter;
  /** The working-tree row, or the selected commit — a compare's or a stash preview's own; `null` for nothing. */
  selection: "workingTree" | { oid: string } | null;
  view: View;
  /** The grid's first visible row, and the walk's total that lets the grid scroll there before the pages land. */
  topRow: number;
  total: number;
}

/** A background tab with no snapshot carries nothing. */
const NO_CARRY: TabCarry = {
  draft: { summary: "", body: "", amend: false, signoff: false, sign: null, prefill: null },
  spec: { kind: "all" },
  filter: {},
  selection: null,
  view: "history",
  topRow: 0,
  total: 0,
};

export interface TabsStore {
  tabs: Tab[];
  active: RepoId | null;
  saved: Record<RepoId, Snapshot>;
  /** Slot a tab dragged from another window would land in, or `null` when none is hovering this one. */
  caret: number | null;

  /**
   * Opens `path` in a new tab — or activates the tab that already has it, or focuses the other
   * window that does (`openElsewhere`, which resolves quietly). Rejects with the `AppError` of a
   * real failure, so each entry point can say what it wants about it. A new tab goes on the end, or
   * at `at` (a drop's slot, clamped); one already open stays where it is. `carry`: a tab moved from
   * another window, its state put back once the repository opened (`applyCarry`); dropped for a tab
   * already open, or when another tab is active by then.
   */
  openTab(path: string, at?: number, carry?: TabCarry | null): Promise<void>;
  activate(id: RepoId): void;
  /** Closes the tab and lets go of its repository; the last tab closes the window (or, in the main window, shows the start screen). */
  closeTab(id: RepoId): Promise<void>;
  markStale(id: RepoId): void;
  /** Moves the tab to a window of its own, with its state (`tabCarry`). */
  detach(id: RepoId): Promise<void>;
  reorder(from: number, to: number): void;
  setCaret(at: number | null): void;
}

const take = (): Snapshot => ({
  repo: repoSnapshot(),
  status: statusSnapshot(),
  commit: commitSnapshot(),
  diff: diffSnapshot(),
  view: viewSnapshot(),
  scroll: takeNote(),
});

/**
 * `repoStore` first: the other stores subscribe to it, and their subscribers reset them. The view
 * subscribes to nothing.
 */
function put(s: Snapshot) {
  restoreRepo(s.repo);
  restoreStatus(s.status);
  restoreCommit(s.commit);
  restoreDiff(s.diff);
  restoreView(s.view);
  seedScroll(s.scroll);
}

/** Shows the tab `snap` belongs to. The walk is restarted rather than resumed — it may be generations behind. */
function show(snap: Snapshot | undefined) {
  // Whatever was open referenced the repository being left.
  useDialogStore.getState().close();
  if (snap) put(snap);
  refreshAll();
}

/**
 * Puts a moved tab's state back, after `openRepo`'s resets. In one synchronous run: an `await`
 * between the steps would let a tab switch land the rest on the other tab. The walk is started, not
 * awaited, so `reselectTo` waits for that walk; the top row comes after its start, as `restore` does.
 */
function applyCarry(c: TabCarry) {
  useCommitStore.setState(c.draft);
  const repo = useRepoStore.getState();
  void repo.startLog(c.spec, c.filter);
  if (c.selection === "workingTree") repo.selectWorkingTree();
  else if (c.selection) repo.reselectTo(c.selection.oid);
  useViewStore.getState().setView(c.view);
  repo.restoreTopRow(c.topRow, c.total);
}

export const useTabsStore = create<TabsStore>()((set, get) => ({
  tabs: [],
  active: null,
  saved: {},
  caret: null,

  async openTab(path, at, carry) {
    // The *Opening…* overlay from the click, not from the backend's answer: `repoStore.openRepo`
    // sets it too, but only after the wait below, which showed nothing. Cleared on every way out.
    useRepoStore.setState({ opening: baseName(path) });
    try {
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
      const next = tabs.slice();
      next.splice(Math.min(Math.max(at ?? tabs.length, 0), tabs.length), 0, { id: summary.id, path: summary.path, name: summary.name, stale: false });
      set({
        tabs: next,
        active: summary.id,
        saved: active ? { ...get().saved, [active]: take() } : get().saved,
      });
      // After `take()`, which needs the note: what the slots still hold belongs to another tab.
      forgetScroll();
      // A new tab starts on History, whatever the tab left (or the start screen) showed.
      useViewStore.getState().setView("history");
      try {
        await useRepoStore.getState().openRepo(summary.path, summary);
      } catch (e) {
        // The tab is only worth keeping if something loaded into it.
        await get().closeTab(summary.id);
        throw e;
      }
      // Only while it is still the tab shown: a switch or a close during the open (Ctrl+Tab, Ctrl+W,
      // a second open) would put its draft in another repository's editor.
      if (carry && get().active === summary.id) applyCarry(carry);
    } finally {
      useRepoStore.setState({ opening: null });
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
      forgetScroll();
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
      await ipc.spawnWindow({ tabs: [tab.path], active: tab.path }, null, tabCarry(id));
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

/** What `id` takes to another window: from the live stores when it is the active tab, else from its snapshot. */
export function tabCarry(id: RepoId): TabCarry {
  const { active, saved } = useTabsStore.getState();
  const live = id === active;
  const snap = saved[id];
  if (!live && !snap) return NO_CARRY;
  const repo = live ? useRepoStore.getState() : snap.repo;
  const oid = selectSelectedOid(repo);
  return {
    draft: pick(live ? useCommitStore.getState() : snap.commit, DRAFT_KEYS),
    spec: repo.spec,
    filter: repo.filter,
    selection: repo.wtSelected ? "workingTree" : oid ? { oid } : null,
    view: live ? useViewStore.getState().view : snap.view.view,
    // A snapshot keeps its top row as the reveal a switch back would answer.
    topRow: live ? lastTopRow() : (snap.repo.reveal?.index ?? 0),
    total: repo.log.total,
  };
}

/** The active tab, for the strip and the title. */
export const selectActiveTab = (s: TabsStore) => s.tabs.find((t) => t.id === s.active) ?? null;

/** This window's repositories with a typed commit message: the active tab's editor, and every background tab's snapshot. */
export function draftRepos(): string[] {
  const { tabs, active, saved } = useTabsStore.getState();
  return tabs.filter((t) => (t.id === active ? hasDraft(useCommitStore.getState()) : !!saved[t.id] && hasDraft(saved[t.id].commit))).map((t) => t.name);
}
