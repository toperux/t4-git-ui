// Single-repo UI state. Pages of the log cache are fetched on demand (`ensureRows`) and
// dropped when the walk generation they belong to is superseded.
import { create } from "zustand";
import * as ipc from "../api/ipc";
import { toAppError } from "../api/ipc";
import type { LogFilter, LogProgress, LogRow, RefsSnapshot, RepoSummary, RevSpec } from "../api/types";

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
  selectedIndex: number | null;
  /** Scroll request for the grid; `seq` bumps so the same index can be revealed twice. */
  reveal: { index: number; seq: number } | null;

  setGitVersion(v: string | null): void;
  openRepo(path: string): Promise<void>;
  closeRepo(): Promise<void>;
  refreshRefs(): Promise<void>;
  startLog(spec: RevSpec, filter: LogFilter): Promise<void>;
  /** Fetches every page overlapping `[start, end)` that isn't loaded or in flight. */
  ensureRows(start: number, end: number): void;
  select(index: number | null): void;
  /** Selects the row for `oid` (loading pages as needed) and asks the grid to scroll to it. */
  revealOid(oid: string): Promise<void>;
  onProgress(p: LogProgress): void;
}

const EMPTY_LOG: LogState = { generation: null, total: 0, complete: false, error: null, flat: false };

// Page bookkeeping lives outside the reactive state: nothing renders from it.
let loaded = new Set<number>();
let inflight = new Map<number, Promise<void>>();
let startSeq = 0;

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
          log: { ...s.log, total: page.total, complete: page.complete },
          selectedIndex: s.selectedIndex ?? (offset === 0 && page.rows.length > 0 ? 0 : null),
        });
        // A partial page from a walk still in progress must be re-requested later.
        if (page.rows.length === PAGE_SIZE || page.complete) loaded.add(p);
      } catch (e) {
        const err = toAppError(e);
        const s = get();
        if (s.repo?.id === repo.id && s.log.generation === gen && err.kind === "internal") {
          // The backend's generation moved on without us: start a fresh walk.
          await s.startLog(s.spec, s.filter);
        }
      } finally {
        inflight.delete(p);
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
    reveal: null,

    setGitVersion: (gitVersion) => set({ gitVersion }),

    async openRepo(path) {
      const repo = await ipc.openRepo(path);
      resetPages();
      set({ repo, refs: null, log: EMPTY_LOG, rows: [], maxLane: 0, selectedIndex: null, reveal: null });
      await Promise.all([get().refreshRefs(), get().startLog({ kind: "all" }, {})]);
    },

    async closeRepo() {
      const { repo } = get();
      if (!repo) return;
      startSeq++;
      resetPages();
      set({ repo: null, refs: null, log: EMPTY_LOG, rows: [], maxLane: 0, selectedIndex: null, reveal: null });
      await ipc.closeRepo(repo.id);
    },

    async refreshRefs() {
      const { repo } = get();
      if (!repo) return;
      const refs = await ipc.getRefs(repo.id);
      if (get().repo?.id === repo.id) set({ refs });
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
      const { log } = get();
      const last = Math.min(end, log.total) - 1;
      if (log.generation === null || last < start) return;
      for (let p = Math.floor(start / PAGE_SIZE); p <= Math.floor(last / PAGE_SIZE); p++) {
        if (!loaded.has(p) && !inflight.has(p)) void fetchPage(p);
      }
    },

    select: (selectedIndex) => set({ selectedIndex }),

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
      set((s) => ({ selectedIndex: index, reveal: { index, seq: (s.reveal?.seq ?? 0) + 1 } }));
    },

    onProgress(p) {
      const { repo, log } = get();
      if (!repo || p.repoId !== repo.id || p.generation !== log.generation) return;
      set({ log: { ...log, total: p.total, complete: p.complete, error: p.error } });
    },
  };
});

/** Oid of the selected row, or `null` while its page is still loading. */
export const selectSelectedOid = (s: RepoStore) =>
  s.selectedIndex === null ? null : (s.rows[s.selectedIndex]?.row.commit.oid ?? null);
