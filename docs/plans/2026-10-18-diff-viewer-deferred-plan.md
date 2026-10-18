# Plan: the diff viewer's deferred rows — whitespace that follows another window, the view switch, the bar, Escape

_Written 2026-10-18 against `main` `6d26651f`. Status: draft; scope ruled by the owner on 2026-10-18 (Plan A of two:
this one, then the tabs and grid rows); D1, D2 and D4 taken with the owner on 2026-10-19, all (a); plan review pass 1's
findings taken (N1 dropped as not a bug, kept as a pinning test; D3 gone with it); passes 2 and 3's taken: pass 4 next._

**Goal:** four small fixes to the diff viewer, from the rows deferred during the per-tab, polish and scroll anchor work
(`docs/plans/open-items.md` §AO and §AR):

- **AO3:** a whitespace default changed in another window flips this window's toggle without reloading its diff.
- **AO4:** switching split ↔ unified view jumps the diff to the top.
- **AR1:** the "N lines selected" bar can cover the cursor line.
- **AR2:** Escape doesn't clear a line selection in the staging diff.

AO3 is reasoned from the code; AO4's jump was measured as BV's observation; AR1 and AR2 were each seen once in a walk
(BV 4c, the BV re-walk). The walk (group BX) is the first measurement of AO3.

**N1, checked: not a bug.** Found while planning: a background tab might come back with a diff built with the old
whitespace or context setting. Plan review pass 1 showed both diffs already reload on a tab switch with the window's
current settings (*What happens now*). Kept as a test that pins it (owner, 2026-10-19).

## What happens now (from the code)

- **AO3.** `settingsStore.load` runs in every window on `settings://changed`. When the stored whitespace preference
  moved, it sets `diffStore.ignoreWhitespace` with a bare `setState` (`src/store/settingsStore.ts:119-122`), so the
  toggle flips and the open diff (and blame's `-w`) is not refetched. The same-window setter does it right:
  `setIgnoreWhitespace` calls `diffStore.toggleWhitespace()` when the value differs (`:132-138`), which reloads the diff
  and, with blame on, the blame (`diffStore.ts:323-328`). Context is fine already: `load` calls `setContext` (`:115`),
  which reloads (`diffStore.ts:330-334`), and the commit panel follows it (`commitStore.ts:663-665`). No other code sets
  `ignoreWhitespace` or `context` without a reload (pass 1's grep).
- **N1 (not a bug).**
  - History: the details pane calls `diffStore.load(repoId, target, rowPath)` whenever the repository changes
    (`DetailsPane.tsx:50-52`), which reloads the file list and the diff with the window's settings. The diff window and
    the stash browser are dialogs, and a tab switch closes every dialog (`tabsStore.ts:79`).
  - The commit panel: `commitStore.restore` clears `diffEntry` (`:641`), so the next `syncWithStatus` from
    `useCommitSync` (`CommitPanel.tsx:27-33`) sees a changed entry and calls `loadDiff` (`:394`), which reads the
    current context (`:207`).
- **AO4.** `DiffViewer` keys `DiffBody` by the view (`DiffViewer.tsx:238`), so a switch remounts it and the new scroller
  starts at 0, vertically and horizontally. The scroll anchor plan left it out (its D2 (a)); BV's observation measured
  it: Unified → Split at 15 000 → 0, and back → 0.
- **AR1.** The selection bar is rendered below the diff body when lines are selected (`DiffViewer.tsx:347-363`), so the
  scroller gets 24 px shorter (643 → 619 in BV). A cursor line on the bottom edge ends up under the bar; nothing scrolls
  it back. Seen in BV 4c's second Space.
- **AR2.** `onBodyKeyDown` (`DiffViewer.tsx:162-196`) handles ↑ / ↓, Space, Enter and Delete. Nothing in `DiffViewer/`
  handles Escape (a grep finds only the blame menu's test). The staging diff also sits in two dialogs, the commit dialog
  (`CommitDialog.tsx:37`) and the stash browser's working-tree row (`StashesDialog.tsx:225`), whose form closes on
  Escape (`Dialog.tsx:146-151`).

## Design

1. **AO3: reload when the preference moved.** In `settingsStore.load`, the branch that sees a moved preference
   (`:119-122`) calls `diffStore.toggleWhitespace()` when the diff store's value differs, exactly as
   `setIgnoreWhitespace` does, instead of the bare `setState`. `lastSeen` stays: a reload that changed nothing still
   leaves a session-only toggle alone (`settingsStore.test.ts:67-74`).
   - At startup nothing is loaded yet: `loadDiff` with no target only clears (`diffStore.ts:157-160`), and blame is off.
     The comment at `:114` changes to say so.
2. **AO4: the view switch keeps the top line.**
   - `DiffBody` is no longer keyed by the view, so a switch is a new row model of the same path: the layout effect's
     `same` is true and `carryOffset` runs. Pass 1 checked what the remount reset: `measure()` and `cancelScroll` run in
     the layout effect, the path effect no longer re-runs, and `quiet` is wanted (outside staging the picks exist, so a
     cursor row does too).
   - `drawn` (`DiffViewer.tsx:424`) also records the view, and `DiffBody` passes `sameView = prev.view === view` to
     `carryOffset`, a new last parameter that defaults to `true` (the tests' `carry` helper passes five,
     `scrollAnchor.test.ts:13`). When it is false, `carryOffset` skips the same-hunk step, whose row-index offset is
     only valid within one view, and goes straight to the line-number step, which reads both row kinds (`nums`,
     `scrollAnchor.ts:20-24`).
   - In the line-number step, a split pair whose left line is a deleted line is looked up by its old number (owner,
     2026-10-19, pass 1 #11), so Split → Unified at line 820's pair lands on the deleted 820 and the round trip is
     exact. A same-view split reload still finds the pair, by that number. The doc comment (`scrollAnchor.ts:26-32`)
     says both.
   - A view switch resets the horizontal scroll to 0, as the remount did (owner, 2026-10-19, pass 2): split's columns
     are narrower, so a kept `scrollLeft` would show another part of the lines. In the `[rows]` layout effect, inside
     `same`: `if (prev.view !== view) el.scrollLeft = 0`, whether or not the vertical offset moves. Nothing is
     virtualized horizontally, and the virtualizer reads only `scrollTop` (pass 3).
   - Staging is unified only (`DiffViewer.tsx:98`), so the view never switches with `actions`.
3. **AR1: the bar keeps a covered cursor line in view.** In `DiffBody`, a layout effect on "the bar is shown"
   (`!!actions && selected.size > 0`), declared after the `[rows]` one. When it turns on and the diff holds the focus,
   it reads the cursor row's bottom (`end`, after `getTotalSize()`, as the ↑ code does at `:487-488`). Only a line the
   bar covers moves (owner, 2026-10-19, pass 2 #2): its bottom was in the old view
   (`end ≤ el.scrollTop + virtualizer.scrollRect.height`, the height from before the bar) and is below the new bottom
   edge (`end > el.scrollTop + el.clientHeight`). Then `scrollToOffset(end − el.clientHeight)` and
   `virtualizer.scrollOffset` = that offset, the same pattern as the `[rows]` effect (`:446-449`).
   - `el.clientHeight` comes from the DOM: the bar renders in the same commit. The virtualizer's public `scrollRect` is
     written only by its ResizeObserver, so it still holds the old height there (`getSize()` is private; pass 3).
     `el.scrollTop` is the DOM's, the same source as `clientHeight`.
   - Setting `scrollOffset`: `scrollToOffset` only writes the DOM. A click that moves the cursor runs the passive cursor
     effect next (`:476-498`), whose `scrollToIndex` then computes from the new offset and leaves it (pass 2 checked
     virtual-core 3.19.2: `scrollToIndex(auto)` returns the current offset, the ResizeObserver never scrolls, and the
     scroll event returns early).
   - Every time the bar appears with the focus in the diff, by the keyboard or the mouse (D2 (a)). A cursor line out of
     view below stays where it is. The bar turning off needs nothing: the scroller grows.
   - On `main`, a click on a line that isn't the cursor likely fixes itself: the cursor effect's pending
     `scrollToIndex(auto)` recomputes from the size each frame, so once the ResizeObserver reports 619 it scrolls the
     line into view, after about a frame under the bar. A click on the cursor line itself moves nothing and stays
     covered (pass 3, reasoned from virtual-core 3.19.2). The fix covers both, without the frame.
4. **AR2: Escape clears the selection.** In `onBodyKeyDown`, Escape with lines selected clears them (`EMPTY_LINES`),
   keeps the cursor and the focus, and stops the event. With nothing selected it does nothing and lets it through (D1
   (a)).
   - Stopping it matters for the dialogs: the commit dialog's or the stash browser's form would close on the same
     Escape. With lines selected, the first Escape clears them and the second closes the dialog (owner, 2026-10-19, pass
     1 #6). Bubble-phase document and window listeners don't fire either (`Menu.tsx:115`, `SearchPopover.tsx:38`,
     `SidebarRail.tsx:29`, `useTabDrag.tsx:131`): React 19 delegates to the root, below them. Capture-phase ones still
     do (`kbdFocus.ts:23-25`, wanted).
   - A tab drag cancels on Escape at the window (`useTabDrag.tsx:127-133`). The press focuses the tab
     (`TabStrip.tsx:62-72`), so the drag likely cancels and the lines stay selected; BX row 6b checks it (owner,
     2026-10-19, pass 2).

## Decisions for the owner

D1, D2 and D4 taken by the owner on 2026-10-19: (a). D3 (N1's reload cost) went with N1.

- **D1: Escape with nothing selected.** (a) Do nothing and let it through: whatever else listens for Escape still gets
  it. (b) Swallow it in the diff always. **Recommended: (a)**; the diff has nothing to cancel then.
- **D2: AR1 on a click too.** A click that selects a line near the bottom edge shows the bar and covers it (pass 3: a
  click on another line than the cursor likely recovers after a frame; on the cursor line it stays covered). (a) Every
  time the bar appears with the focus in the diff, the keyboard or the mouse. (b) The keyboard only. **Recommended:
  (a)**; one rule, the same symptom.
- **D4: Linux.** (a) Walk Windows only and propose "Linux not walked" as an accepted limit, as the last three plans. (b)
  Also walk Linux. **Recommended: (a)**; nothing here is platform code, and the scroll timing it relies on is the
  anchor's, already accepted for Linux (`open-items.md` §Q).

**Pass 1's rulings** (owner, 2026-10-19): N1 dropped, kept as a pinning test; the sighting below deferred to
`open-items.md` §AO; the two-step Escape in a dialog; the split pair by its old number.

**Pass 2's rulings** (owner, 2026-10-19): AR1 moves only a line the bar covers; a view switch resets the horizontal
scroll; a BX row for Escape during a tab drag; accepted, closed: after a reload in a dialog with the cursor line
virtualized away, the focus is on `<body>`, so Escape closes the dialog with lines still selected (on `main` today; the
result is today's behaviour).

**Pass 3's rulings** (owner, 2026-10-19): the `<body>` case is recorded under `open-items-done.md` §AR, beside AR2; the
horizontal reset isn't walked (the fixture's lines never scroll sideways), Test 3 covers it.

## Tests

1. **AO3** (`settingsStore.test.ts`): the mock gains `getBlame`; `repoId`, `target`, `selectedPath` and
   `treeSelectedPath` set, and the `beforeEach` (`:32`) also resets `treeSelectedPath` and `blameOn`; `load()` first,
   since `lastSeen` has no reset. The preference moves (stored value changed, `load()` again) →
   `diffStore.ignoreWhitespace` follows and `getFileDiff` is called again with the new value; with blame on, `getBlame`
   too. The session-only test still passes.
2. **N1, pinned** (`diffStore.test.ts`, `commitStore.test.ts`): `diffStore.load` with the window's whitespace on and
   context 10 → `getFileDiff` with both. The window set to context 10 first, then `commitStore.restore` of a snapshot
   whose `diffContext` is 3, then `syncWithStatus` with the same status → one `getFileDiff`, with context 10.
3. **AO4** (`scrollAnchor.test.ts`): the `stripes()` fixture, unified at 15 000 (deleted 820, 12 px) → split 13 380;
   split at 13 380 → unified 15 000; a header at the top lands on the same header; the ends; a same-view split reload
   that rewrites the anchor's own hunk (lines inserted into hunk 81, so `hunkMap` misses it) still lands on the pair.
   (`DiffViewer.test.tsx`): a view switch keeps the body mounted, scrolls to the carried offset, not 0, and sets
   `scrollLeft` to 0.
4. **AR1** (`DiffViewer.test.tsx`): the mock exposes the virtualizer and records `scrollToOffset`; its `scrollRect`
   height settable per test (643 here; 400 today, `:28-31`); `clientHeight` stubbed (643, then 619 once the bar renders)
   and `scrollTop` stubbed (as `:584`). The cursor row ending at the bottom edge, Space → `scrollToOffset(end − 619)`
   and `scrollOffset` the same; the cursor row in view above the bar → nothing; the cursor row wholly below the view →
   nothing; the focus outside the diff → nothing. The mock records `scrollToIndex` without computing, so the click path
   (Design 3) is walked, not unit-tested.
5. **AR2** (`DiffViewer.test.tsx`): lines selected, Escape → none selected, the bar gone, the cursor and the focus
   unchanged, and neither a parent `onKeyDown` nor a `document` keydown listener fires; nothing selected → no state
   change, and both fire.

## Walk: smoke group BX

**Setup:** the Windows VM (session git-ui-win), a local `tauri build --no-bundle` of the branch, launched with
`smoke-launch.ps1`, driven with `docs/smoke/cdp.mjs --inner 1280x800`, as BV. Fixture: `bv-fixture.sh`
(`T4_ROOT=/c/tmp/t4`), then `cp -r /c/tmp/t4/bv /c/tmp/t4/bx`, so the two repos, their tabs and their windows have
different names; `cdp.mjs` picks a window by its title (`CDP_TITLE="- bv"` / `"- bx"`, `smoke-cdp.md:129`). Recorder,
console hook and log as BV. Numbers assume BV's 184 px hunks (164 in split).

**Rows:**

1. **AO4, Unified → Split:** `bv`, History › `ws` › `w.txt` at 15 000 (deleted 820, 12 px) → Split → 13 380, line 820's
   pair, 12 px off.
2. **AO4, Split → Unified:** at 13 380 → Unified → 15 000, the deleted line 820, 12 px off.
3. **AO3, another window:** Settings › Diff & merge › "Ignore whitespace by default" off before the row. Open `bx` as a
   second tab and tear it off into a window of its own (Ctrl+Shift+N). In `bv`'s window (`CDP_TITLE="- bv"`), `ws` ›
   `w.txt` at 15 000, whitespace off. In `bx`'s window (`CDP_TITLE="- bx"`), Settings › Diff & merge › "Ignore
   whitespace by default" on → `bv`'s toggle shows on and its diff reloads to 7 456, the same row. Off again → 15 000.
4. **AR1, the keyboard:** `bv`, Changes › `a.txt`, nothing selected; H = the region's `clientHeight` with no bar (643 in
   BV). Click a changed line mid-view, Space to unselect it (as BV 4c); set scrollTop (`--eval`) = its bottom − H, so it
   sits on the bottom edge; Space → the bar shows, scrollTop = its bottom − (H − 24), the line in view and focused.
   Then, nothing selected, scrollTop set (`--eval`) so the cursor line is out of view below but within about 20 rows
   (the overscan is 30, so it stays mounted); `document.activeElement` still the line → Space → the bar shows, scrollTop
   unchanged.
5. **AR1, the mouse (D2 (a)):** nothing selected, the cursor line (from row 4) on the bottom edge; click it → selected,
   the bar shows, the same scroll, the line in view. Also click another line on the bottom edge and record what is seen
   (pass 3: `main` would likely recover after a frame).
6. **AR2, the Changes view:** select 3 lines (click a line, Shift+↓, Ctrl+click a line of the next hunk: every `a.txt`
   hunk has two changed lines, and Shift+↓ stops at the hunk's edge) → Escape → the bar gone, `aria-selected` false on
   all, the focus on the cursor line. Escape again → nothing changes.
   - 6b. **A tab drag:** close `bx`'s window and open `bx` again as a tab in `bv`'s window. Lines selected in `bv`'s
     `a.txt`; a one-off script in a single CDP session presses on the `bx` tab, moves, sends Escape, then releases
     (`cdp.mjs` releases within each step; the pattern of `smoke-cdp.md:115-118`) → the drag cancels and the lines stay
     selected (reasoned: the press focuses the tab). Record where the focus was.
7. **AR2, a dialog:** the commit dialog on `bv` with `a.txt`'s diff; select a line → Escape → selection cleared, the
   dialog still open; Escape → the dialog closes.
8. **What must not change:** BV rows 1–6 again in short (whitespace, context, an edit, a stage keep the top line);
   recorder 0 blank / gap / overlap through rows 1–7; console hook empty; app log 0 WARN / 0 ERROR.

## Seen while planning

- **A History tab comes back on its commit's first file, at the top.** The tab switch reload (N1) loads
  `rowPath ?? files[0]`, so the file the tab was on, and its scroll, are lost; the commit is kept. Reasoned
  (`DetailsPane.tsx:49-52`). Deferred to `open-items.md` §AO, a Plan B candidate (owner, 2026-10-19); the row lands with
  this plan's records. **Reopen:** Plan B, or someone loses their place in a commit's files on a tab switch.

## Steps

0. **The owner's go.** A final plan is not a go.
1. **Branch** `diff-viewer-deferred` from `main`.
2. **AO3** (`settingsStore.ts`) with Test 1; N1's pinning Test 2 (`diffStore.test.ts`, `commitStore.test.ts`).
3. **AO4, AR1, AR2** (`scrollAnchor.ts` and its doc comment, `DiffViewer.tsx`) with Tests 3–5. `src/README.md`: Escape
   in the key list (`:474`), the view switch in the scroll sentence (`:489-491`).
4. **Gates**, from `F:/src/_ pet projects/t4-git-ui` with the uppercase `F:/`: `npm test -- --run` and `npm run build`.
5. **Group BX** in `docs/smoke/smoke-test-post-v1.md` (rows above).
6. **The change review loop** (CLAUDE.md step 5). A finding that needs a decision goes to the owner at once.
7. **Push the branch and run CI**, on the owner's go at that moment:
   `gh workflow run CI --repo toperux/t4-git-ui --ref diff-viewer-deferred` (no PR, as the last three plans).
8. **The walk** on the Windows VM, which fetches the branch (the fetch needs the owner's go on the VM).
9. **Triage** (CLAUDE.md step 6), one item at a time, starting with D4's "Linux not walked".
10. **Records**, one docs commit, hashes only after the squash:
    - the walk record and the BX ticks;
    - `open-items-done.md`: new §AO and §AR sections, in letter order around §AP (neither exists there yet), with AO3,
      AO4 and N1's check under §AO, and both §AR rows and pass 2's accepted-closed `<body>` row under §AR; the triage's
      own closed rows;
    - `open-items.md`: the §AR section removed and §AR added to the "only there" list (`:10`); the sighting above as a
      new §AO row; §AO's intro (`:927-929`) naming this plan, and a pointer line to the done rows, as §AN's
      (`:921-923`); the triage's §Q rows (with triggers) and deferrals;
    - this plan archived.
11. **Package** (CLAUDE.md step 7): squash rehearsed in a throwaway worktree, tree checked; a fix commit, the BX docs
    commit, the records commit. Force-push the branch on the owner's go, CI again.
12. **Merge** on the owner's go: fast-forward `main` locally; the push of `main` is its own go.

## Not in this plan

- **Plan B** (owner, 2026-10-18): AP2 (the grid's selection after a commit) and AO1 (a moved tab's draft, selection and
  filter); the sighting above is a candidate.
- **Left open with their triggers:** AO2 (a failed tab open, unreachable), AP1 and AQ1 (seen once, not reproduced), AP3
  (a per-tab output dock, a feature).

## Review record

- **Pass 1** (2026-10-19): 15 findings. #1–#2 (N1 can't happen: both diffs reload on a tab switch) → N1 dropped, pinning
  test (owner); #3's sighting deferred (owner); #4–#5 AR1's scroll undone by the cursor effect and clamped at the end →
  Design 3; #6 the dialog's Escape → two-step (owner); #7 row 4 reordered; #8 `bx` copy; #9 moot; #10 `drawn` records
  the view; #11 the pair by its old number (owner); #12–#13 Tests 1 and 5; #14 step 10; #15 step 3.
- **Pass 2** (2026-10-19): 8 findings and 9 remarks. #1 `scrollToOffset` clamps to the DOM's height, not the stale one →
  Design 3 uses it, Test 4's end-of-file case dropped; #2 AR1 only for a covered line (owner); #3 row 6's three lines;
  #4 Test 1's `beforeEach`; #5 the sighting's trigger and step 10; #6 rewrapped; #7 row 3's wording; #8 `sameView`'s
  default and the doc comment. Remarks: Test 2's order, Test 4's mock, `end` after `getTotalSize()`, the goal's wording,
  step 2's files taken; `scrollLeft` reset, the tab drag row, and the `<body>` case ruled (owner).
- **Pass 3** (2026-10-19): 9 findings. #1 `getSize()` is private (the build would fail) → `scrollRect.height`; #2
  `el.scrollTop` named; #3 a click on another line likely recovers on `main`: row 5 clicks the cursor line, D2's text;
  #4 where the `scrollLeft` reset goes; #5 row 1's check can't fail → dropped, Test 3 (owner); #6 row 6b's method; #7
  row 4 within the overscan, `--eval`, H; #8 Test 3's same-view case rewrites the hunk; #9 the `<body>` row under §AR
  (owner). Remarks: Design 4's listeners and step 10's pointer line taken.
