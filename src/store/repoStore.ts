// Single-repo UI state. Pages of the log cache are fetched on demand (`ensureRows`) and
// dropped when the walk generation they belong to is superseded.
import { create } from "zustand";
import * as ipc from "../api/ipc";
import { toAppError } from "../api/ipc";
import type { LogFilter, LogProgress, LogRow, RefsSnapshot, RepoSummary, RevSpec } from "../api/types";
import { toastError } from "./toastStore";

export const PAGE_SIZE = 500;

export interface LogState {
  /** `null` until `start_log` resolves. */
  generation: number | null;
  total: number;
  complete: boolean;
  error: string | null;
  /** Text filter active: rows carry no graph → render a flat list. */
  flat: boolean;
}

export interface RepoStore {
  gitVersion: string | null;
  repo: RepoSummary | null;
  refs: RefsSnapshot | null;
  spec: RevSpec;
  filter: LogFilter;
  log: LogState;
  /** Sparse: `rows[i]` is undefined until its page arrives. */
  rows: (LogRow | undefined)[];
  /** Highest lane seen so far (graph column width). */
  maxLane: number;
  /** Commit index (the working-tree pseudo-row is not part of `rows`). */
  selectedIndex: number | null;
  /** The working-tree pseudo-row is selected (takes precedence over `selectedIndex`). */
  wtSelected: boolean;
  /** Scroll request for the grid; `seq` bumps so the same index can be revealed twice. */
  reveal: { index: number; seq: number } | null;

  setGitVersion(v: string | null): void;
  openRepo(path: string): Promise<void>;
  closeRepo(): Promise<void>;
  refreshRefs(): Promise<void>;
  /** Recomputes ref labels on the backend and re-fetches every loaded page (no re-walk). */
  refreshLabels(): Promise<void>;
  startLog(spec: RevSpec, filter: LogFilter): Promise<void>;
  /** Fetches every page overlapping `[start, end)` that isn't loaded or in flight. */
  ensureRows(start: number, end: number): void;
  select(index: number | null): void;
  selectWorkingTree(on?: boolean): void;
  /** Selects the row for `oid` (loading pages as needed) and asks the grid to scroll to it. */
  revealOid(oid: string): Promise<void>;
  onProgress(p: LogProgress): void;
}

const EMPTY_LOG: LogState = { generation: null, total: 0, complete: false, error: null, flat: false };

// Page bookkeeping lives outside the reactive state: nothing renders from it.
let loaded = new Set<number>();
let inflight = new Map<number, Promise<void>>();
let startSeq = 0;
/** Row range the grid last asked for — `refreshLabels` only refetches the pages around it. */
let viewport = { start: 0, end: PAGE_SIZE };
/** Bumped by `refreshLabels`: a page fetched under an older value carries stale labels. */
let labelGen = 0;

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
  function fetchPage(p: number): Promise<void> {
    const existing = inflight.get(p);
    if (existing) return existing;
    if (loaded.has(p)) return Promise.resolve();
    const { repo, log } = get();
    if (!repo || log.generation === null) return Promise.resolve();
    const gen = log.generation;
    const offset = p * PAGE_SIZE;
    const lg = labelGen;
    /** Rows the walk was known to have when this request went out (see the short-page retry below). */
    const totalAtRequest = log.total;

    let refetch = false;
    const task = (async () => {
      try {
        const page = await ipc.getLogPage(repo.id, gen, offset, PAGE_SIZE);
        const s = get();
        if (s.repo?.id !== repo.id || s.log.generation !== gen) return; // stale
        const rows = s.rows.slice();
        let maxLane = s.maxLane;
        page.rows.forEach((r, i) => {
          rows[offset + i] = r;
          if (r.row.maxLane > maxLane) maxLane = r.row.maxLane;
        });
        set({
          rows,
          maxLane,
          // A page response can be older than the last `log://progress`; never move the walk backwards.
          log: { ...s.log, total: Math.max(s.log.total, page.total), complete: s.log.complete || page.complete },
          selectedIndex: s.selectedIndex ?? (offset === 0 && page.rows.length > 0 ? 0 : null),
        });
        if (lg !== labelGen) {
          // Labels were recomputed while this page was in flight: what arrived is already stale.
          loaded.delete(p);
          refetch = nearViewport(p);
        } else if (page.rows.length === PAGE_SIZE || page.complete) {
          // A partial page from a walk still in progress must be re-requested later.
          loaded.add(p);
        } else if (nearViewport(p) && get().log.total > Math.max(totalAtRequest, offset + page.rows.length)) {
          // The walk moved on while this request was in flight (`log://progress` arrived meanwhile),
          // and `ensureRows` skipped the page because it was in flight — so ask again here, or the
          // grid keeps rendering placeholder rows nothing ever fills. Bounded: a retry only happens
          // when the known total grew after the request went out.
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
        inflight.delete(p);
        if (refetch) void fetchPage(p);
      }
    })();
    inflight.set(p, task);
    return task;
  }

  return {
    gitVersion: null,
    repo: null,
    refs: null,
    spec: { kind: "all" },
    filter: {},
    log: EMPTY_LOG,
    rows: [],
    maxLane: 0,
    selectedIndex: null,
    wtSelected: false,
    reveal: null,

    setGitVersion: (gitVersion) => set({ gitVersion }),

    async openRepo(path) {
      const repo = await ipc.openRepo(path);
      resetPages();
      set({ repo, refs: null, log: EMPTY_LOG, rows: [], maxLane: 0, selectedIndex: null, wtSelected: false, reveal: null });
      await Promise.all([get().refreshRefs(), get().startLog({ kind: "all" }, {})]);
    },

    async closeRepo() {
      const { repo } = get();
      if (!repo) return;
      startSeq++;
      resetPages();
      set({ repo: null, refs: null, log: EMPTY_LOG, rows: [], maxLane: 0, selectedIndex: null, wtSelected: false, reveal: null });
      await ipc.closeRepo(repo.id);
    },

    async refreshRefs() {
      const { repo } = get();
      if (!repo) return;
      const refs = await ipc.getRefs(repo.id);
      if (get().repo?.id === repo.id) set({ refs });
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
      const { repo } = get();
      if (!repo) return;
      const seq = ++startSeq;
      resetPages();
      set({
        spec,
        filter,
        log: { ...EMPTY_LOG, flat: !!filter.text?.trim() },
        rows: [],
        maxLane: 0,
        selectedIndex: null,
      });
      try {
        const generation = await ipc.startLog(repo.id, spec, filter);
        if (seq !== startSeq || get().repo?.id !== repo.id) return; // superseded
        set((s) => ({ log: { ...s.log, generation } }));
        void fetchPage(0);
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

    select: (selectedIndex) => set({ selectedIndex, wtSelected: false }),

    selectWorkingTree: (on = true) => set({ wtSelected: on }),

    async revealOid(oid) {
      const find = () => get().rows.findIndex((r) => r?.row.commit.oid === oid);
      let index = find();
      if (index < 0) {
        const pages = Math.ceil(get().log.total / PAGE_SIZE);
        for (let p = 0; p < pages && index < 0; p++) {
          await fetchPage(p);
          index = find();
        }
      }
      if (index < 0) return;
      // Revealing a commit moves the selection off the working-tree row (and out of the commit panel).
      set((s) => ({ selectedIndex: index, wtSelected: false, reveal: { index, seq: (s.reveal?.seq ?? 0) + 1 } }));
    },

    onProgress(p) {
      const { repo, log } = get();
      if (!repo || p.repoId !== repo.id || p.generation !== log.generation) return;
      set({ log: { ...log, total: p.total, complete: p.complete, error: p.error } });
    },
  };
});

/** Clears the module-level page bookkeeping so tests don't leak state into each other. */
export function __resetForTests() {
  resetPages();
  startSeq = 0;
  labelGen = 0;
  viewport = { start: 0, end: PAGE_SIZE };
  useRepoStore.setState({
    gitVersion: null,
    repo: null,
    refs: null,
    spec: { kind: "all" },
    filter: {},
    log: EMPTY_LOG,
    rows: [],
    maxLane: 0,
    selectedIndex: null,
    wtSelected: false,
    reveal: null,
  });
}

/** Oid of the selected commit row, or `null` while its page is still loading (or the working tree is selected). */
export const selectSelectedOid = (s: RepoStore) =>
  s.wtSelected || s.selectedIndex === null ? null : (s.rows[s.selectedIndex]?.row.commit.oid ?? null);
