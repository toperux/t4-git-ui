// Working-tree status of the open repository, kept fresh from `repo://changed`.
// Refreshes are debounced (100 ms) and responses that arrive out of order are dropped.
import { create } from "zustand";
import * as ipc from "../api/ipc";
import { toAppError } from "../api/ipc";
import type { RefsSnapshot, RepoChanged, RevSpec, WorkdirStatus } from "../api/types";
import { freshStatus } from "../lib/freshStatus";
import { useMerging, useRepoStore } from "./repoStore";
import { toastError } from "./toastStore";

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
  /**
   * Refs (and labels / the walk when HEAD moved) — also called after our own commit and every op.
   * Coalesced: concurrent callers share one run, and errors are handled inside (never rejects).
   */
  syncRefs(): Promise<void>;
}

/** staged + unstaged + untracked + conflicted. */
export const selectChangeCount = (s: StatusStore) =>
  s.status ? s.status.staged + s.status.unstaged + s.status.untracked + s.status.conflicted : 0;

/** `lib/freshStatus` against the refs as they are now — for the imperative callers below. */
const freshNow = () => freshStatus(useStatusStore.getState().status, useRepoStore.getState().refs?.state);

/** The same, reactive: re-reads when either the status or the refs change. */
export const useFreshStatus = () =>
  freshStatus(
    useStatusStore((st) => st.status),
    useRepoStore((st) => st.refs?.state),
  );

/**
 * "The pseudo-row is shown", from a status that may predate the refs. Not fresh = not known yet, and
 * the answer that churns nothing is the one the walk already has: `filter.workingTree` is kept equal
 * to "the row is shown" (see `syncWalkSeed`), so holding it there neither hides the row nor re-walks.
 */
const rowShown = (fresh: WorkdirStatus | null, seeded: boolean) => (fresh ? fresh.entries.length > 0 : seeded);

/**
 * The working-tree pseudo-row exists: the tree is dirty and no text filter flattened the walk.
 * The grid row, the bottom pane and the grid's keyboard index math must all agree on this.
 */
export const useShowWorkingTree = () => {
  // The reactive twin of `walkSeedWanted`: same rule, same staleness fallback, or the rendered row
  // and the walk seed disagree.
  const dirty = rowShown(
    useFreshStatus(),
    useRepoStore((st) => !!st.filter.workingTree),
  );
  const merging = useMerging();
  const flat = useRepoStore((st) => st.log.flat);
  return (dirty || merging) && !flat;
};

let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

// `syncRefs` coalescing: one run at a time; a call that arrives after the run started re-runs it once.
let refsRun: Promise<void> | null = null;
let refsStarted = false;
let refsDirty = false;

const sameRefs = (a: RefsSnapshot | null, b: RefsSnapshot | null) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The oids the backend seeds the walk from under `spec` — HEAD for `head`, and every branch,
 * remote branch and tag as well for `all` (see `log::walker::walk`). Only a change here can add
 * or drop commits, and only a new walk shows them: a fetch moves `refs/remotes/*` without
 * touching HEAD, and relabelling would leave the grid on history that predates the fetch.
 * `headOid` covers the moment after `openRepo` when the snapshot has not arrived yet. A seeded
 * walk (`seeded`) also lays out around HEAD itself, so a checkout between two branches the walk
 * already had — the same commits, a different HEAD — restarts it rather than relabelling.
 */
function walkSeeds(spec: RevSpec, refs: RefsSnapshot | null, headOid: string | null, seeded: boolean): string {
  const oids = new Set<string>();
  const head = refs ? refs.head.oid : headOid;
  if (head) oids.add(head);
  if (head && seeded) oids.add(`HEAD=${head}`);
  if (refs && spec.kind !== "head") {
    for (const b of refs.local) oids.add(b.oid);
    for (const r of refs.remotes) for (const b of r.branches) oids.add(b.oid);
    for (const t of refs.tags) oids.add(t.oid);
  }
  return [...oids].sort().join(" ");
}

/**
 * The walk wants HEAD's column reserved: `useShowWorkingTree` minus `flat` — a flat walk ignores the
 * seed, and keeping the flag true to the tree makes clearing the filter come back right.
 */
function walkSeedWanted() {
  const rs = useRepoStore.getState();
  return rowShown(freshNow(), !!rs.filter.workingTree) || rs.refs?.state === "merge";
}

/**
 * Keeps `filter.workingTree` equal to "the pseudo-row is shown": the walk reserves HEAD's column
 * only while the row exists. The restart stores the flag, so this cannot loop.
 */
function syncWalkSeed() {
  const rs = useRepoStore.getState();
  if (!rs.repo) return;
  const show = walkSeedWanted();
  if (show !== !!rs.filter.workingTree) void rs.startLog(rs.spec, { ...rs.filter, workingTree: show });
}

/** Everything `refresh` does bar the walk seed; false when there was nothing to seed from (stale / failed / no repo). */
async function fetchStatus(): Promise<boolean> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const repo = useRepoStore.getState().repo;
  if (!repo) {
    seq++;
    useStatusStore.setState({ status: null, error: null });
    return false;
  }
  const mySeq = ++seq;
  try {
    const status = await ipc.getStatus(repo.id);
    if (mySeq !== seq || useRepoStore.getState().repo?.id !== repo.id) return false; // stale
    useStatusStore.setState({ status, error: null });
    dropWorkingTreeIfClean();
    return true;
  } catch (e) {
    if (mySeq !== seq) return false;
    useStatusStore.setState({ error: toAppError(e).message });
    return false;
  }
}

/** One pass: refresh refs, then restart the walk (its seeds moved) / relabel it (refs changed) / do nothing. */
async function syncRefsOnce() {
  const rs = useRepoStore.getState();
  if (!rs.repo) return;
  const repoId = rs.repo.id;
  const before = walkSeeds(rs.spec, rs.refs, rs.repo.head.oid, !!rs.filter.workingTree);
  const beforeRefs = rs.refs;
  // The watcher schedules the status refresh and calls this at once, so a pending one means the status
  // still describes the tree before the change: take it now, or the decision below seeds from a stale tree.
  await Promise.all([rs.refreshRefs(), timer ? fetchStatus() : undefined]);
  const after = useRepoStore.getState();
  if (after.repo?.id !== repoId || !after.repo) return;
  const now = walkSeeds(after.spec, after.refs, after.repo.head.oid, !!after.filter.workingTree);
  // Folded in: a moved seed and a flipped working-tree column are one new walk, not two.
  const show = walkSeedWanted();
  if (now !== before || show !== !!after.filter.workingTree) await after.startLog(after.spec, { ...after.filter, workingTree: show });
  // The watcher reports `FETCH_HEAD` / `logs/*` / `config` writes as `refs`, and a new tag on a
  // commit the walk already reached moves no seed: relabel only on a real change.
  else if (!sameRefs(beforeRefs, after.refs)) await after.refreshLabels();
}

/**
 * A clean tree has no pseudo-row: fall back to the commit selection — unless a merge is still to be
 * committed. Checked on both halves, since `commit()` refreshes the status before the refs: the
 * empty status alone keeps the selection, and the refs turning clean afterwards must drop it.
 */
function dropWorkingTreeIfClean() {
  const rs = useRepoStore.getState();
  // Only a status scanned in the state the refs are in now is evidence of an empty tree: a stale one
  // would take the user out of the pseudo-row they are working in, so "not known yet" keeps it.
  if (freshNow()?.entries.length === 0 && rs.wtSelected && rs.refs?.state !== "merge") rs.selectWorkingTree(false);
}

export const useStatusStore = create<StatusStore>()((_set, get) => ({
  status: null,
  error: null,

  async refresh() {
    if (await fetchStatus()) syncWalkSeed();
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

  syncRefs() {
    // Every HEAD-moving path calls this (the watcher event, `runOp`, `commit`): one walk, not three.
    if (refsRun) {
      if (refsStarted) refsDirty = true;
      return refsRun;
    }
    refsRun = (async () => {
      try {
        do {
          refsDirty = false;
          refsStarted = false;
          // Callers in this tick see the same repository state: let them join this run.
          await Promise.resolve();
          refsStarted = true;
          await syncRefsOnce();
        } while (refsDirty);
      } catch (e) {
        const err = toAppError(e);
        // `internal` after `closeRepo` just means the repo is gone — nothing to report.
        if (err.kind !== "internal" && useRepoStore.getState().repo) toastError(err, "Couldn't refresh references");
      } finally {
        refsRun = null;
        refsStarted = false;
        refsDirty = false;
      }
    })();
    return refsRun;
  },
}));

/** Clears the module-level debounce timer / sequence guards so tests don't leak state into each other. */
export function __resetForTests() {
  if (timer) clearTimeout(timer);
  timer = null;
  seq = 0;
  refsRun = null;
  refsStarted = false;
  refsDirty = false;
  useStatusStore.setState({ status: null, error: null });
}

// Follow the open repository: load on open, clear on close.
useRepoStore.subscribe((st, prev) => {
  if (st.repo !== prev.repo) void useStatusStore.getState().refresh();
  else if (st.refs !== prev.refs) {
    dropWorkingTreeIfClean();
    // The refs are what makes a status fresh: a seed decided without them (`openRepo` opens with
    // `refs: null`, and `refreshRefs()` callers never reach `syncRefsOnce`) was only a fallback.
    syncWalkSeed();
  }
});
