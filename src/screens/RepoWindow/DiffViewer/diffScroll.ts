// Where the window's two main diffs (History's details pane, the Changes view's) were scrolled, per
// tab: the shown body notes its place, a tab switch moves the note into the tab left's snapshot
// (`take`) and the tab that comes forward seeds its own back (`put`). One slot each, not one per
// pane: only one main diff shows at a time.
import type { FileDiff, RepoId } from "../../../api/types";
import type { DiffView } from "../../../store/diffStore";
import type { SplitRow, UnifiedRow } from "./diffRows";

export type DiffPane = "history" | "changes";

/** What a body showed, and its scroll offset: what `carryOffset` puts back on a changed diff. */
export interface DiffScroll {
  pane: DiffPane;
  repoId: RepoId | null;
  path: string | null;
  diff: FileDiff;
  rows: (UnifiedRow | SplitRow)[];
  view: DiffView;
  top: number;
}

let note: DiffScroll | null = null;
let seed: DiffScroll | null = null;

export function noteScroll(n: DiffScroll) {
  note = n;
}

/** The note, cleared: a tab that never notes saves nothing rather than the tab before it's. */
export function takeNote(): DiffScroll | null {
  const n = note;
  note = null;
  return n;
}

export function seedScroll(s: DiffScroll | null) {
  seed = s;
}

/** The seed when it is this body's (pane, repository, path), else `null`; spent either way. */
export function takeSeed(pane: DiffPane, repoId: RepoId | null, path: string | null): DiffScroll | null {
  const s = seed;
  seed = null;
  return s && s.pane === pane && s.repoId === repoId && s.path === path ? s : null;
}

/** A new tab, or none left: nothing noted or seeded belongs to what shows next. */
export function forgetScroll() {
  note = null;
  seed = null;
}
