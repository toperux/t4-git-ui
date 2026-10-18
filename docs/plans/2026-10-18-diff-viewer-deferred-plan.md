# Plan: the diff viewer's deferred rows — whitespace and context that agree, the view switch, the selection bar, Escape

_Written 2026-10-18 against `main` `6d26651f`. Status: draft; scope ruled by the owner on 2026-10-18 (Plan A of two:
this one, then the tabs and grid rows; N1 added to it); decisions D1–D4 taken with the owner on 2026-10-19, all (a);
plan review pass 1 next._

**Goal:** five small fixes to the diff viewer, from the rows deferred during the per-tab, polish and scroll anchor
work (`docs/plans/open-items.md` §AO and §AR), plus one sibling found while planning (N1):

- **AO3:** a whitespace default changed in another window flips this window's toggle without reloading its diff.
- **N1:** a background tab comes back with a diff built with the old whitespace or context setting.
- **AO4:** switching split ↔ unified view jumps the diff to the top.
- **AR1:** the "N lines selected" bar can cover the cursor line.
- **AR2:** Escape doesn't clear a line selection in the staging diff.

None of these was measured as a bug on purpose; each is either reasoned from the code (AO3, AO4, N1) or seen once in a
walk (AR1 in BV 4c, AR2 in the BV re-walk). The walk (group BX) is the first measurement of AO3, AO4 and N1.

## What happens now (from the code)

- **AO3.** `settingsStore.load` runs in every window on `settings://changed`. When the stored whitespace preference
  moved, it sets `diffStore.ignoreWhitespace` with a bare `setState` (`src/store/settingsStore.ts:119-122`), so the
  toggle flips and the open diff (and blame's `-w`) is not refetched. The same-window setter does it right:
  `setIgnoreWhitespace` calls `diffStore.toggleWhitespace()` when the value differs (`:132-138`), which reloads the
  diff and, with blame on, the blame (`diffStore.ts:323-328`). Context is fine already: `load` calls `setContext`
  (`:115`), which reloads (`diffStore.ts:330-334`), and the commit panel follows it (`commitStore.ts:663-665`).
- **N1.** Whitespace, context and view are the window's, not a tab's, so they are left out of the diff store's tab
  snapshot on purpose (`diffStore.ts:412-416`). The diff, the blame and the commit panel's diff are in the snapshots
  (`diffStore.ts:417-440`, `commitStore.ts:612-631`) and come back as they were (`diffStore.ts:451-460`,
  `commitStore.ts:638-645`). So: toggle whitespace or change the context in tab A, switch to tab B, and B shows a diff
  built with the old setting under the new toggle. Nothing reloads it until something else does.
  - Staging is safe: the commit panel sends back the context its diff was built with (`diffContext`,
    `commitStore.ts:205-216`, `:452`), so the indices stay its own. Only what is shown is stale.
- **AO4.** `DiffViewer` keys `DiffBody` by the view (`DiffViewer.tsx:238`), so a switch remounts it and the new
  scroller starts at 0. The scroll anchor plan left it out (its D2 (a)); BV's observation measured it: Unified → Split
  at 15 000 → 0, and back → 0.
- **AR1.** The selection bar is rendered below the diff body when lines are selected (`DiffViewer.tsx:347-363`), so
  the scroller gets 24 px shorter (643 → 619 in BV). A cursor line on the bottom edge ends up under the bar; nothing
  scrolls it back. Seen in BV 4c's second Space.
- **AR2.** `onBodyKeyDown` (`DiffViewer.tsx:162-196`) handles ↑ / ↓, Space, Enter and Delete. Nothing in
  `DiffViewer/` handles Escape (a grep finds only the blame menu's test).

## Design

1. **AO3: reload when the preference moved.** In `settingsStore.load`, the branch that sees a moved preference
   (`:119-122`) calls `diffStore.toggleWhitespace()` when the diff store's value differs, exactly as
   `setIgnoreWhitespace` does, instead of the bare `setState`. `lastSeen` stays: a reload that changed nothing still
   leaves a session-only toggle alone (`settingsStore.test.ts:67-74`).
   - At startup nothing is loaded yet: `loadDiff` with no target only clears (`diffStore.ts:157-160`), and blame is
     off. The comment at `:114` changes to say so.
2. **N1: a restored tab reloads what the window's settings changed.**
   - The diff store's snapshot records the window's `ignoreWhitespace` and `context` at the moment it is taken
     (`takenWith`). The tab was in front until then, so its diff and blame were built with those.
   - `restore` applies the snapshot as now, then, when the snapshot had a `diff` or a `blame` and `takenWith` differs
     from the window's current values, reloads the diff (and the blame, with blame on and whitespace changed). A new
     store action `reload()` exposes `loadDiff` (+ `loadBlame` when asked); the snapshot's `diff` stays on screen
     until the reply lands, so the scroll anchor carries the top line.
   - The commit panel's `restore` reloads its diff when the snapshot's `diffContext` differs from
     `useDiffStore.getState().context` and it has a `diffPath`. No new field: `diffContext` is already there.
   - A mid-load snapshot is unchanged: its target is cleared, and the next loader loads it with the current settings.
3. **AO4: the view switch keeps the top line.**
   - `DiffBody` is no longer keyed by the view, so a switch is a new row model of the same path: the layout effect's
     `same` is true and `carryOffset` runs.
   - `carryOffset` gets the two views (or `DiffBody` passes a `sameView` flag): when they differ, it skips the
     same-hunk step, whose row-index offset is only valid within one view, and goes straight to the line-number step,
     which reads both row kinds (`nums`, `scrollAnchor.ts:20-24`).
   - Staging is unified only (`DiffViewer.tsx:98`), so the view never switches with `actions`; `quiet` is set and
     changes nothing there.
   - **Known limit (reasoned):** a split pair holds a deleted and an added line; it maps to its new side in unified,
     so Split → Unified at line 820's pair lands on the added line 820, one row below the deleted one. Unified →
     Split lands on the pair either way.
4. **AR1: the bar keeps the cursor line in view.** In `DiffBody`, a layout effect on "the bar is shown"
   (`!!actions && selected.size > 0`): when it turns on, the diff holds the focus and the cursor row's bottom is
   below the scroller's new bottom edge, scroll by the difference (`scrollToOffset(end − clientHeight)`), reading
   `clientHeight` from the DOM. The virtualizer's own size comes from a ResizeObserver and still holds the old
   height in that frame, so `scrollToIndex` would see the line as visible.
   - The bar turning off needs nothing: the scroller grows.
5. **AR2: Escape clears the selection.** In `onBodyKeyDown`, Escape with lines selected clears them (`EMPTY_LINES`),
   keeps the cursor and the focus, and stops the event, so an open popover or menu listening on `document`
   (`SearchPopover.tsx:33`, `Menu.tsx:163`) doesn't also close. With nothing selected it does nothing and lets the
   event through (D1).

## Decisions for the owner

All four taken by the owner on 2026-10-19: (a).

- **D1: Escape with nothing selected.** (a) Do nothing and let it through: whatever else listens for Escape still
  gets it. (b) Swallow it in the diff always. **Recommended: (a)**; the diff has nothing to cancel then.
- **D2: AR1 on a click too.** A click that selects a line near the bottom edge shows the bar and covers it the same
  way. (a) Every time the bar appears with the focus in the diff, the keyboard or the mouse. (b) The keyboard only.
  **Recommended: (a)**; one rule, the same symptom.
- **D3: N1's reload cost.** (a) Reload on restore only when `takenWith` differs (one diff request, plus blame when on).
  (b) Reload every restored diff. **Recommended: (a)**; a tab switch with nothing changed stays free.
- **D4: Linux.** (a) Walk Windows only and propose "Linux not walked" as an accepted limit, as the last three plans.
  (b) Also walk Linux. **Recommended: (a)**; nothing here is platform code, and the scroll timing it relies on is the
  anchor's, already accepted for Linux (`open-items.md` §Q).

## Tests

1. **AO3** (`settingsStore.test.ts`): the preference moves in another window (stored value changed, `load()` again)
   → `diffStore.ignoreWhitespace` follows and `ipc.getFileDiff` is called again with the new value; with blame on,
   `getBlame` too. The existing session-only test still passes.
2. **N1** (`diffStore.test.ts`, `commitStore.test.ts`): a snapshot taken with whitespace off, the window toggled on,
   `restore` → one `getFileDiff` with `ignoreWhitespace: true`; the same with context 3 → 10; an unchanged setting →
   no request; a mid-load snapshot → no request (its target cleared). The commit panel: `diffContext` 3, window 10,
   `restore` → `reloadDiff` once; equal → none.
3. **AO4** (`scrollAnchor.test.ts`): the `stripes()` fixture, unified at 15 000 (deleted 820, 12 px) → split 13 380;
   split at 13 380 → unified 15 020 (the added 820, 12 px: the known limit); a header at the top lands on the same
   header; the ends. (`DiffViewer.test.tsx`): a view switch keeps the body mounted and calls `scrollToOffset` with
   the carried offset, not 0.
4. **AR1** (`DiffViewer.test.tsx`): with `clientHeight` stubbed (643, then 619 once the bar renders) and the cursor
   row ending at the bottom edge, Space → one `scrollToOffset(end − 619)`; the cursor row in view → none; the focus
   outside the diff → none.
5. **AR2** (`DiffViewer.test.tsx`): lines selected, Escape → none selected, the bar gone, the cursor and the focus
   unchanged, `stopPropagation` called; nothing selected → no state change, the event not stopped.

## Walk: smoke group BX

**Setup:** the Windows VM (session git-ui-win), a local `tauri build --no-bundle` of the branch, launched with
`smoke-launch.ps1`, driven with `docs/smoke/cdp.mjs --inner 1280x800`, as BV. Fixture: `bv-fixture.sh` twice, with
`T4_ROOT=/c/tmp/t4` and `T4_ROOT=/c/tmp/t4/b` (two repos named `bv`, opened as two tabs). Recorder, console hook and
log as BV. Numbers assume BV's 184 px hunks (164 in split).

**Rows:**

1. **AO4, Unified → Split:** History › `ws` › `w.txt` at 15 000 (deleted 820, 12 px) → Split → 13 380, line 820's
   pair, 12 px off.
2. **AO4, Split → Unified:** at 13 380 → Unified → 15 020, the added line 820, 12 px off (the known limit).
3. **AO3, another window:** tear off the second `bv` tab into a window of its own; in the first window, `ws` ›
   `w.txt` at 15 000, whitespace off. In the second window, Settings › Ignore whitespace on → the first window's
   toggle shows on and its diff reloads to 7 456, the same row. Off again → 15 000.
4. **N1, whitespace:** two tabs in one window. Tab B: `ws` › `w.txt` at 15 000, off. Tab A: the same, toggle on.
   Back to B → B's toggle on, its diff reloads (height 18 340), 7 456.
5. **N1, context, the commit panel:** tab B in Changes › `a.txt` at 12 000. Tab A: Settings › context 10. Back to B →
   `a.txt` reloads, 14 460, top row context line 657 (BV row 6). Context back to 3.
6. **N1, nothing changed:** switch A ↔ B twice with no setting changed → no `get_file_diff` in the app log's IPC
   lines (or the recorder sees no reload), the view unchanged.
7. **AR1:** Changes › `a.txt`, nothing selected; scroll so a changed line's bottom is the region's bottom edge
   (scrollTop = its bottom − 643); focus it (click, then Space to unselect, as BV 4c); Space → the bar shows,
   scrollTop = its bottom − 619, the line in view and focused. Then a click on a line on the bottom edge (D2 (a)) →
   the same.
8. **AR2:** select 3 lines (click, Shift+↓ ×2) → Escape → "lines selected" bar gone, `aria-selected` false on all,
   the focus on the cursor line. Escape again → nothing changes.
9. **What must not change:** BV rows 1–6 again in short (whitespace, context, an edit, a stage keep the top line);
   recorder 0 blank / gap / overlap through rows 1–8; console hook empty; app log 0 WARN / 0 ERROR.

## Steps

0. **The owner's go.** A final plan is not a go.
1. **Branch** `diff-viewer-deferred` from `main`.
2. **AO3 and N1** (`settingsStore.ts`, `diffStore.ts`, `commitStore.ts`) with Tests 1–2.
3. **AO4, AR1, AR2** (`scrollAnchor.ts`, `DiffViewer.tsx`) with Tests 3–5; `src/README.md` if a line there describes
   the view switch or the selection bar.
4. **Gates**, from `F:/src/_ pet projects/t4-git-ui` with the uppercase `F:/`: `npm test -- --run` and
   `npm run build`.
5. **Group BX** in `docs/smoke/smoke-test-post-v1.md` (rows above).
6. **The change review loop** (CLAUDE.md step 5). A finding that needs a decision goes to the owner at once.
7. **Push the branch and run CI**, on the owner's go at that moment: `gh workflow run CI --repo toperux/t4-git-ui
   --ref diff-viewer-deferred` (no PR, as the last three plans).
8. **The walk** on the Windows VM, which fetches the branch (the fetch needs the owner's go on the VM).
9. **Triage** (CLAUDE.md step 6), one item at a time, starting with D4's "Linux not walked" if (a).
10. **Records**, one docs commit, hashes only after the squash: the walk record; BX ticks; §AO's AO3 and AO4 rows and
    §AR's two rows moved to `open-items-done.md` (a new dated section), with N1; this plan archived.
11. **Package** (CLAUDE.md step 7): squash rehearsed in a throwaway worktree, tree checked; a fix commit, the BX docs
    commit, the records commit. Force-push the branch on the owner's go, CI again.
12. **Merge** on the owner's go: fast-forward `main` locally; the push of `main` is its own go.

## Not in this plan

- **Plan B** (owner, 2026-10-18): AP2 (the grid's selection after a commit) and AO1 (a moved tab's draft, selection
  and filter).
- **Left open with their triggers:** AO2 (a failed tab open, unreachable), AP1 and AQ1 (seen once, not reproduced),
  AP3 (a per-tab output dock, a feature).

## Review record

- _None yet._
