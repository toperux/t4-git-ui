// Single-repo UI state. Pages of the log cache are fetched on demand (`ensureRows`) and
// dropped when the walk generation they belong to is superseded.
import { create } from "zustand";
import * as ipc from "../api/ipc";
import { toAppError } from "../api/ipc";
import type { CommitInfo, LogFilter, LogProgress, LogRow, RefsSnapshot, RemoteTag, RepoSummary, RevSpec } from "../api/types";
import { kvGet, kvSet } from "../lib/kv";
import { baseName } from "../lib/paths";
import { toastError, useToastStore } from "./toastStore";

export const PAGE_SIZE = 500;

export interface LogState {
  /** `null` until `start_log` resolves. */
  generation: number | null;
  total: number;
  complete: boolean;
  error: string | null;
  /** A filter is active (text or path): rows carry no graph → render a flat list. */
  flat: boolean;
}

export interface RepoStore {
  gitVersion: string | null;
  repo: RepoSummary | null;
  /** Name of the repository `openRepo` is working on (drives the blocking overlay); `null` when idle. */
  opening: string | null;
  refs: RefsSnapshot | null;
  /**
   * Tags each remote had when it last answered (git keeps no local record of them), keyed by remote
   * name; `{}` until one answers or a cached entry is read on open. `at` (ms) is when it answered —
   * the sidebar dates its folder row and the `local` badge with it.
   */
  remoteTags: Record<string, { tags: RemoteTag[]; at: number }>;
  spec: RevSpec;
  filter: LogFilter;
  log: LogState;
  /** Sparse: `rows[i]` is undefined until its page arrives. */
  rows: (LogRow | undefined)[];
  /** Commit index (the working-tree pseudo-row is not part of `rows`). */
  selectedIndex: number | null;
  /** The working-tree pseudo-row is selected (takes precedence over `selectedIndex`). */
  wtSelected: boolean;
  /**
   * The two commits of a Ctrl+click compare, the selected one always among them. Snapshots, not
   * indexes: a walk restart re-finds the anchor by oid and may move indexes, the oids stay valid.
   */
  compare: { from: CommitInfo; to: CommitInfo } | null;
  /** Scroll request for the grid; `seq` bumps so the same index can be revealed twice. */
  reveal: { index: number; seq: number } | null;

  setGitVersion(v: string | null): void;
  openRepo(path: string): Promise<void>;
  closeRepo(): Promise<void>;
  refreshRefs(): Promise<void>;
  /**
   * Asks `remotes` (every remote by default) which tags they have, in parallel; a failure toasts and
   * keeps that remote's cached answer. `announce` also toasts the counts — for the user asking for
   * the check from the tag menu.
   */
  refreshRemoteTags(opts?: { remotes?: string[]; announce?: boolean }): Promise<void>;
  /** Recomputes ref labels on the backend and re-fetches every loaded page (no re-walk). */
  refreshLabels(): Promise<void>;
  startLog(spec: RevSpec, filter: LogFilter): Promise<void>;
  /** Fetches every page overlapping `[start, end)` that isn't loaded or in flight. */
  ensureRows(start: number, end: number): void;
  select(index: number | null): void;
  /** Ctrl+click on a row: the second commit of a compare, or off again; a plain select when there is nothing to compare with. */
  compareWith(index: number): void;
  selectWorkingTree(on?: boolean): void;
  /**
   * Selects the row for `oid` (loading pages as needed) and asks the grid to scroll to it;
   * `false` when the current walk has no such row (filtered out, or never fetched).
   */
  revealOid(oid: string): Promise<boolean>;
  onProgress(p: LogProgress): void;
}

const EMPTY_LOG: LogState = { generation: null, total: 0, complete: false, error: null, flat: false };

const remoteTagsKey = (id: string) => `remoteTags:${id}`;

// Page bookkeeping lives outside the reactive state: nothing renders from it.
let loaded = new Set<number>();
let inflight = new Map<number, Promise<void>>();
let startSeq = 0;
/** Row range the grid last asked for — `refreshLabels` only refetches the pages around it. */
let viewport = { start: 0, end: PAGE_SIZE };
/** Bumped by `refreshLabels`: a page fetched under an older value carries stale labels. */
let labelGen = 0;
/**
 * The commit selected when `startLog` restarted the walk, to be selected again once the new walk
 * has it (`reselect`). While set, the first page does not default the selection to row 0.
 */
let pendingSelect: { oid: string; generation: number | null } | null = null;

/** Pages worth refetching eagerly: the viewport's own pages plus one on either side. */
function nearViewport(p: number) {
  const first = Math.floor(viewport.start / PAGE_SIZE) - 1;
  const last = Math.floor(Math.max(viewport.start, viewport.end - 1) / PAGE_SIZE) + 1;
  return p >= first && p <= last;
}

function resetPages() {
  loaded = new Set();
  inflight = new Map();
}

export const useRepoStore = create<RepoStore>()((set, get) => {
  /** Index of `oid` among the rows of the current walk (a row from a page not loaded yet is stale). */
  function loadedIndex(oid: string): number | null {
    const index = get().rows.findIndex((r) => r?.row.commit.oid === oid);
    return index >= 0 && loaded.has(Math.floor(index / PAGE_SIZE)) ? index : null;
  }

  /** Index of `oid` in walk `generation`: from the loaded rows, else asked of the backend. */
  async function findIndex(oid: string, generation: number): Promise<number | null> {
    const local = loadedIndex(oid);
    if (local !== null) return local;
    const repo = get().repo;
    if (!repo) return null;
    try {
      return await ipc.findLogRow(repo.id, generation, oid);
    } catch {
      return null;
    }
  }

  /**
   * Puts the selection back on `pendingSelect` after a walk restart. A commit the walk has not
   * reached yet is tried again when the walk completes (`onProgress`); one that is gone for good
   * (rewritten, filtered out) hands the selection to the first row.
   */
  async function reselect() {
    const pending = pendingSelect;
    const { repo, log } = get();
    if (!pending || !repo || log.generation === null || pending.generation !== log.generation) return;
    const index = await findIndex(pending.oid, log.generation);
    const s = get();
    if (pendingSelect !== pending || s.repo?.id !== repo.id || s.log.generation !== log.generation) return;
    if (index === null) {
      if (!s.log.complete) return; // `onProgress` retries once the walk is complete
      pendingSelect = null;
      // Gone for good: back to the top rather than whatever now sits at the old index.
      set({ selectedIndex: s.rows[0] ? 0 : null, compare: null });
      return;
    }
    pendingSelect = null;
    set({ selectedIndex: index });
    void fetchPage(Math.floor(index / PAGE_SIZE));
  }

  function fetchPage(p: number): Promise<void> {
    // The map this request belongs to: a walk restart replaces it, and clearing the entry from the
    // one that is current by then would drop the new walk's own request for the page.
    const pages = inflight;
    const existing = pages.get(p);
    if (existing) return existing;
    if (loaded.has(p)) return Promise.resolve();
    const { repo, log } = get();
    if (!repo || log.generation === null) return Promise.resolve();
    const gen = log.generation;
    const offset = p * PAGE_SIZE;
    const lg = labelGen;
    /** What the walk was known to have when this request went out (see the short-page retry below). */
    const totalAtRequest = log.total;
    const completeAtRequest = log.complete;

    let refetch = false;
    const task = (async () => {
      try {
        const page = await ipc.getLogPage(repo.id, gen, offset, PAGE_SIZE);
        const s = get();
        if (s.repo?.id !== repo.id || s.log.generation !== gen) return; // stale
        const rows = s.rows.slice();
        page.rows.forEach((r, i) => {
          rows[offset + i] = r;
        });
        // A finished walk that is shorter than the one before it (a text filter, say) leaves the
        // old rows past its end: the grid never shows them, but `loadedIndex` would find one and
        // "reveal" an index the grid no longer has — no toast, and the selection vanishes.
        let selectedIndex = s.selectedIndex;
        let compare = s.compare;
        if (page.complete && rows.length > page.total) {
          rows.length = page.total;
          // The selection can be one of the rows that went: kept, it names nothing the grid has, and
          // a later walk whose own page is not short has no truncation left to clear it.
          if (selectedIndex !== null && selectedIndex >= rows.length) {
            selectedIndex = null;
            compare = null;
          }
        }
        set({
          rows,
          compare,
          // A page response can be older than the last `log://progress`; never move the walk backwards.
          // `error` too: a `log://progress` emitted before `start_log` resolved was dropped for
          // having no generation to match, and the page is where that failure is still readable.
          log: { ...s.log, total: Math.max(s.log.total, page.total), complete: s.log.complete || page.complete, error: s.log.error ?? page.error },
          selectedIndex: selectedIndex ?? (offset === 0 && page.rows.length > 0 && !pendingSelect ? 0 : null),
        });
        if (lg !== labelGen) {
          // Labels were recomputed while this page was in flight: what arrived is already stale.
          loaded.delete(p);
          refetch = nearViewport(p);
        } else if (page.rows.length === PAGE_SIZE || page.complete) {
          // A partial page from a walk still in progress must be re-requested later.
          loaded.add(p);
        } else if (
          nearViewport(p) &&
          ((get().log.complete && !completeAtRequest) || get().log.total > Math.max(totalAtRequest, offset + page.rows.length))
        ) {
          // The walk moved on while this request was in flight (`log://progress` arrived meanwhile),
          // and `ensureRows` skipped the page because it was in flight — so ask again here, or the
          // grid keeps rendering placeholder rows nothing ever fills. Bounded: a retry only happens
          // when the known total grew after the request went out, or the walk completed during it
          // (a restart keeps the previous total, so a same-sized walk grows nothing).
          refetch = true;
        }
      } catch (e) {
        const err = toAppError(e);
        const s = get();
        if (s.repo?.id !== repo.id || s.log.generation !== gen) return;
        if (err.kind === "staleGeneration") {
          // The backend's generation moved on without us: start a fresh walk.
          await s.startLog(s.spec, s.filter);
        } else {
          // Anything else (a panicked blocking task, IO) would loop forever if we re-walked: report once.
          toastError(err, "Couldn't load history");
        }
      } finally {
        pages.delete(p);
        if (refetch) void fetchPage(p);
      }
    })();
    pages.set(p, task);
    return task;
  }

  return {
    gitVersion: null,
    repo: null,
    opening: null,
    refs: null,
    remoteTags: {},
    spec: { kind: "all" },
    filter: {},
    log: EMPTY_LOG,
    rows: [],
    selectedIndex: null,
    wtSelected: false,
    compare: null,
    reveal: null,

    setGitVersion: (gitVersion) => set({ gitVersion }),

    async openRepo(path) {
      set({ opening: baseName(path) });
      try {
        const repo = await ipc.openRepo(path);
        const prev = get().repo;
        startSeq++;
        resetPages();
        pendingSelect = null;
        set({
          repo,
          refs: null,
          remoteTags: {},
          spec: { kind: "all" },
          filter: {},
          log: EMPTY_LOG,
          rows: [],
          selectedIndex: null,
          wtSelected: false,
          compare: null,
          reveal: null,
        });
        // One repository at a time: the backend keeps a handle and a watcher per open repo, so the
        // one being left is closed (its events were filtered out by id anyway).
        if (prev && prev.id !== repo.id) ipc.closeRepo(prev.id).catch(() => undefined);
        // The spinner waits for the grid only: on a large repository the refs snapshot queues
        // behind the status scan, and the sidebar tolerates `refs === null` (it says so).
        await get().startLog({ kind: "all" }, {});
        void get()
          .refreshRefs()
          .catch((e) => toastError(toAppError(e), "Couldn't load branches"));
        // Badges from open onward, without a network round trip. A remote op that finished
        // meanwhile has the fresher answer, so it wins.
        // An entry from the single-remote cache (it names its `remote`) is ignored, not migrated.
        const cached = await kvGet<RepoStore["remoteTags"] | { remote: string }>(remoteTagsKey(repo.id));
        if (cached && !("remote" in cached) && get().repo?.id === repo.id && Object.keys(get().remoteTags).length === 0) set({ remoteTags: cached });
      } finally {
        set({ opening: null });
      }
    },

    async closeRepo() {
      const { repo } = get();
      if (!repo) return;
      startSeq++;
      resetPages();
      pendingSelect = null;
      set({ repo: null, refs: null, remoteTags: {}, log: EMPTY_LOG, rows: [], selectedIndex: null, wtSelected: false, compare: null, reveal: null });
      await ipc.closeRepo(repo.id);
    },

    async refreshRefs() {
      const { repo } = get();
      if (!repo) return;
      const refs = await ipc.getRefs(repo.id);
      if (get().repo?.id === repo.id) set({ refs });
    },

    async refreshRemoteTags(opts) {
      const { repo, refs } = get();
      if (!repo || !refs) return;
      const names = opts?.remotes ?? refs.remotes.map((r) => r.name);
      const counts = new Map<string, number>();
      await Promise.all(
        names.map(async (remote) => {
          let tags;
          try {
            tags = await ipc.remoteTags(repo.id, remote);
          } catch (e) {
            // Offline, auth, remote gone: that remote's cached answer stays, but say so — silently
            // keeping a stale one looks like badges that disagree with git for no reason.
            toastError(toAppError(e), `Couldn't check ${remote} for tags`);
            return;
          }
          if (get().repo?.id !== repo.id) return;
          counts.set(remote, tags.length);
          // The answers land in any order: merge into whatever is current rather than a snapshot,
          // dropping the entries of remotes that are gone (removed or renamed since).
          set((s) => {
            const live = new Set(s.refs?.remotes.map((r) => r.name));
            const kept = Object.entries(s.remoteTags).filter(([name]) => name !== remote && live.has(name));
            return { remoteTags: { ...Object.fromEntries(kept), [remote]: { tags, at: Date.now() } } };
          });
          kvSet(remoteTagsKey(repo.id), get().remoteTags).catch((e: unknown) => console.warn("kv: could not persist remote tags", e));
        }),
      );
      if (!opts?.announce) return;
      const checked = names.filter((r) => counts.has(r));
      const title = checked.map((r) => `${r}: ${counts.get(r)} tag${counts.get(r) === 1 ? "" : "s"}`).join(", ");
      // Every remote failing has toasted once per remote already; there is nothing to add.
      if (names.length === 0) useToastStore.getState().push({ kind: "info", title: "No remote to check" });
      else if (checked.length > 0) useToastStore.getState().push({ kind: "info", title: `Checked ${title}` });
    },

    async refreshLabels() {
      const { repo, log } = get();
      if (!repo || log.generation === null) return;
      const generation = await ipc.refreshLabels(repo.id);
      const s = get();
      if (s.repo?.id !== repo.id || s.log.generation !== generation) return;
      labelGen++;
      // Everything loaded now carries stale labels. Only the pages around the viewport are refetched
      // now; the rest leave `loaded` so they come back with fresh labels when they scroll into view.
      const pages = [...loaded];
      loaded = new Set();
      for (const p of pages) if (nearViewport(p)) void fetchPage(p);
    },

    async startLog(spec, filter) {
      const prev = get();
      const { repo } = prev;
      if (!repo) return;
      const seq = ++startSeq;
      resetPages();
      // The walk restarts after every fetch, commit and refresh. The rows on screen stay until the
      // new walk's pages replace them (a blank grid every few seconds is worse than a stale one),
      // and the selected commit is selected again once the new walk has it — see `reselect`.
      const selectedOid = prev.wtSelected || prev.selectedIndex === null ? null : (prev.rows[prev.selectedIndex]?.row.commit.oid ?? null);
      pendingSelect = selectedOid ? { oid: selectedOid, generation: null } : null;
      const flat = !!filter.text?.trim() || !!filter.path;
      set({
        spec,
        filter,
        log: { ...EMPTY_LOG, total: prev.log.total, flat },
        // A flat walk hides the working-tree row. Selected, it would keep the commit index it sat
        // over (a row the filtered walk may not even have) and nothing would show as selected;
        // dropping both lets the first page select row 0, as it does for a walk with no selection.
        ...(prev.wtSelected && flat ? { wtSelected: false, selectedIndex: null, compare: null } : {}),
      });
      try {
        const generation = await ipc.startLog(repo.id, spec, filter);
        if (seq !== startSeq || get().repo?.id !== repo.id) return; // superseded
        if (pendingSelect) pendingSelect.generation = generation;
        set((s) => ({ log: { ...s.log, generation } }));
        // Not awaited: `startLog` resolves once the walk is started, as before; the selection is
        // put back after the first page (the commit is usually near where it was).
        void fetchPage(0).then(reselect);
      } catch (e) {
        if (seq !== startSeq) return;
        set((s) => ({ log: { ...s.log, complete: true, error: toAppError(e).message } }));
      }
    },

    ensureRows(start, end) {
      viewport = { start, end };
      const { log } = get();
      const last = Math.min(end, log.total) - 1;
      if (log.generation === null || last < start) return;
      for (let p = Math.floor(start / PAGE_SIZE); p <= Math.floor(last / PAGE_SIZE); p++) {
        if (!loaded.has(p) && !inflight.has(p)) void fetchPage(p);
      }
    },

    // The anchor is always one of the compared commits, so every write that moves it drops the pair.
    select: (selectedIndex) => set({ selectedIndex, wtSelected: false, compare: null }),

    compareWith: (index) =>
      set((s) => {
        const ai = s.wtSelected ? null : s.selectedIndex;
        const other = s.rows[index]?.row.commit;
        const anchor = ai === null ? undefined : s.rows[ai]?.row.commit;
        if (!other || !anchor || ai === null) return { selectedIndex: index, wtSelected: false, compare: null };
        if (other.oid === anchor.oid || s.compare?.from.oid === other.oid || s.compare?.to.oid === other.oid) return { compare: null };
        // A third commit replaces the pair. The selected commit is the base: the diff is what the
        // Ctrl+clicked one changed relative to it, whichever of the two is older.
        return { compare: { from: anchor, to: other } };
      }),

    selectWorkingTree: (on = true) => set({ wtSelected: on, compare: null }),

    async revealOid(oid) {
      // Two passes at most: a `startLog` during the page fetch leaves the index pointing into a walk
      // that is gone, so it is looked up again against the new one rather than written back blindly.
      for (let attempt = 0; attempt < 2; attempt++) {
        const { repo, log } = get();
        if (!repo || log.generation === null) return false;
        const index = await findIndex(oid, log.generation);
        const s = get();
        if (index === null || s.repo?.id !== repo.id || s.log.generation !== log.generation) return false;
        await fetchPage(Math.floor(index / PAGE_SIZE));
        const after = get();
        if (after.repo?.id !== repo.id) return false;
        if (after.log.generation !== log.generation) continue;
        // Revealing a commit moves the selection off the working-tree row (and out of the commit panel).
        set((st) => ({ selectedIndex: index, wtSelected: false, compare: null, reveal: { index, seq: (st.reveal?.seq ?? 0) + 1 } }));
        return true;
      }
      return false;
    },

    onProgress(p) {
      const { repo, log } = get();
      if (!repo || p.repoId !== repo.id || p.generation !== log.generation) return;
      set({ log: { ...log, total: p.total, complete: p.complete, error: p.error } });
      // The grid asks for pages when its visible range or the total changes. A restarted walk keeps
      // the previous total, so a same-sized walk changes neither: ask here for whatever the viewport
      // still lacks (a page 0 that answered before the walk had rows, say). Loaded / in-flight pages
      // are skipped, so this is idle once the viewport is filled.
      get().ensureRows(viewport.start, viewport.end);
      if (p.complete && pendingSelect) void reselect();
    },
  };
});

/** Clears the module-level page bookkeeping so tests don't leak state into each other. */
export function __resetForTests() {
  resetPages();
  startSeq = 0;
  labelGen = 0;
  pendingSelect = null;
  viewport = { start: 0, end: PAGE_SIZE };
  useRepoStore.setState({
    gitVersion: null,
    repo: null,
    opening: null,
    refs: null,
    remoteTags: {},
    spec: { kind: "all" },
    filter: {},
    log: EMPTY_LOG,
    rows: [],
    selectedIndex: null,
    wtSelected: false,
    compare: null,
    reveal: null,
  });
}

/** Mid-merge: a merge whose resolution equals HEAD has nothing in the status but still needs committing. */
export const useMerging = () => useRepoStore((st) => st.refs?.state === "merge");

/** Oid of the selected commit row, or `null` while its page is still loading (or the working tree is selected). */
export const selectSelectedOid = (s: RepoStore) =>
  s.wtSelected || s.selectedIndex === null ? null : (s.rows[s.selectedIndex]?.row.commit.oid ?? null);

/** The two commits being compared, or `null` when a single commit (or the working tree) is selected. */
export const selectCompare = (s: RepoStore) => (s.wtSelected ? null : s.compare);
