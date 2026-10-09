# Plan: an obvious activity indicator — a bar under the toolbar, and the opening overlay without the gap, 2026-10-09

_Written 2026-10-09. Status: scope A + D taken by the owner 2026-10-08/09. Plan review passes 1–12, every finding fixed:
pass 1 re-designed D as D8's overlay (D6 withdrawn, D9 raised); pass 2 raised D10–D13; pass 3 had D9 re-asked (kept);
pass 4 dropped a sentence under the style guide's size-tier table (owner); passes 5–12 tightened the dialog note, the
gap measurement, the smoke steps and this header, with no new decisions; pass 13 clean but a nit (P13, closed by the
owner). Every decision taken by the owner 2026-10-09 as recommended (D5 retired by D8). Go given 2026-10-09. Step 0
measured the gap at 19–33 ms on Windows (`d7b9ca1`). Executed on `activity-indicator` (code `9d8558a`, `6465024`; docs
`f87c804`); change review pass 1: 4 nits, three fixed (`621e18f`), one to the triage; pass 2: 1 should-fix and 3 nits
fixed (`41ff87b`, `e90b62f`); pass 3: 1 nit fixed (`41884df`); pass 4 clean. BS 1–3 walked of `41884df` on Windows,
Linux and macOS, every walked row passes. Triage ruled by the owner 2026-10-09 (`open-items.md` §Q and §AH,
`open-items-done.md` §AH). Execution's departure: the command palette's focus fix, not in the plan — S3's check found
a click off an option left the palette deaf; fixed (`7e4fad1`) on the owner's ruling, with its review's two follow-ups
(a right-click and a drag let go over the scrim: a release handler, `62cd8ff`, `86e2032`) and Tab (`9ebd391`), walked
as BS 4 on Windows of `86e2032` and `9ebd391`. A final review of the whole branch ran 2026-10-09, its findings fixed.
The claude.ai canvases' republish waits on the owner's go at packaging; hashes here are pre-squash._

**Goal:** the only sign that an operation is running is a 10 px spinner and its text at the bottom right of the
status bar (`src/screens/RepoWindow/RepoWindow.tsx:487-492`); the owner found it too small to notice. Add:

- **A.** A thin indeterminate bar along the toolbar's bottom edge while the window is busy.
- **D.** The *Opening <name>…* overlay from the moment a repository starts opening, not only once the backend has
  answered — today nothing shows during that wait.

Walk both as smoke group **BS**; release with the batch below it when the owner names a version.

Branch: `activity-indicator`, on top of `app-wide-fixes` (`52fd957`, squashed, not pushed; the two ship together).
Line numbers are as of `52fd957`. **Verified** means read in the code; **inferred** means reasoned, not run. Research:
one read-only agent and plan review passes 1–12, the decisive claims re-read here.

## What's there today (verified)

- **Busy is per window, not per tab.** `useOpsStore.busy` (a label or null; `selectRunning` = not null,
  `src/store/opsStore.ts:47`, `:75`) is set by `runOp` and cleared in its `finally` (`:231`, `:270`): every branch,
  remote, stash, worktree, submodule and rebase op. Its labels read e.g. "Fetching origin…" (`actions.ts:45`). The
  commit panel's stage / unstage / discard / keep-side / commit set `useCommitStore.busy` instead
  (`src/store/commitStore.ts:83`, `:259-281`), with `committing` (`:87`) set and cleared beside it (`:261`, `:266`);
  it has no label and the status bar doesn't show it (the panel has its own thin `Progress`, "Committing" / "Applying
  changes", `FilesColumn.tsx:404`, and the Commit button's spinner). `refusedWhileRunning` checks both
  (`src/screens/RepoWindow/actions.ts:267-268`), so either refuses switching or closing tabs
  (`src/store/tabsStore.ts:119`, `:129`); `runOp` and the toolbar's greying check only `ops.busy` (`opsStore.ts:227`,
  `Toolbar.tsx:80`), so both stores can be busy at once.
- **`commitStore.busy` vs `applying`:** `busy` clears before the status refresh that follows (`commitStore.ts:266`),
  `applying` after it (`:279`). `runOp`'s refresh also runs after its `finally` (`opsStore.ts:270-276`), so `busy`
  matches it.
- **Stash drop / clear hold `ops.busy` during their native confirmation** (`actions.ts:104-131`), on purpose: a
  second drop answered meanwhile would hit a shifted index. The status bar already shows "Dropping stash@{n}…" then.
- **A progress component exists:** `Progress({ thin?, label = "Loading", value? })`
  (`src/components/ui/Progress/Progress.tsx:5`), `role="progressbar"` with an `aria-label`, indeterminate without
  `value`; `thin` is 3 px, square, an `--accent` bar on a `--bg-inset` track, a 1.2 s sweep; under reduced motion no
  animation, full width at half opacity (`Progress.module.css:2-38`). It takes no `className`, and `.progress` sets
  `position: relative` (`:3`), so placing it needs a wrapper. The style guide's `Progress` row names "the bar that
  hangs under a panel header or over the grid" (`docs/design/style-guide.md:110`). The status bar's `Spinner` is also
  a `progressbar`, named after `ops.busy` (`Spinner.tsx:5`, `RepoWindow.tsx:489`).
- **Layout:** `TabStrip` (only with 2+ tabs or a drag caret, `RepoWindow.tsx:112`, `:120`), then `<Toolbar />`
  (`:121`), then the panels. `.toolbar` is `flex: none` with a 1 px bottom border, no `position`, no overflow clip
  (`Toolbar.module.css:2-11`); it is `role="toolbar"` (`Toolbar.tsx:189`). `.window` has no `gap` (its `overflow:
  hidden` doesn't clip a bar inside it, `RepoWindow.module.css:1-7`). The commit panel already hangs a bar from a
  zero-height wrapper (`CommitPanel.module.css:42-47`: `position: relative; flex: none; height: 0; z-index: 1`).
  Menus and the search popover sit at `z-index: 20` (`Menu.module.css:10`, `Toolbar.module.css:86`).
- **Dialogs:** every dialog's scrim is `position: fixed; inset: 0; z-index: 40`, a translucent `--scrim`
  (`Dialog.module.css:2-5`, `tokens.css:51`, `:134`); the commit dialog, the Stashes browser and the diff view are
  `full` dialogs whose panel fills the window but for a 16 px margin (`.scrimFull`'s `--space-6` padding, `:32-35`).
  Every window with a repository renders `RepoWindow` and its toolbar (`App.tsx:252-253`); there is no separate diff
  window.
- **Opening a repository:** every path — the start screen (`StartScreen.tsx:62`, `:99`, `:107`), `switchRepo`
  (toolbar repo menu, palette, Recents, a worktree or submodule row, the tab strip's "+" and Ctrl+T via
  `pickAndOpenRepo`; `actions.ts:274-280`), a tab adopted from another window (`TabStrip.tsx:35`), a failed tab spawn
  (`App.tsx:181`) and the startup restore (`App.tsx:70`, `:76-82`) — goes through `tabsStore.openTab`, which awaits
  `ipc.openRepo` first (`tabsStore.ts:82-93`). Only then does `repoStore.openRepo` set `opening` (`repoStore.ts:330`,
  cleared in its `finally`, `:364-365`), and `App` renders `<BusyOverlay label="Opening <name>…">` (`App.tsx:259`,
  outside the phase switch, so over the start screen and the "Starting" spinner too): a fixed full-window scrim at
  `z-index: 50` that swallows clicks and appears after a 150 ms delay so a fast open doesn't flash
  (`BusyOverlay.module.css:2-11`, `BusyOverlay.tsx:5-8`). During the first await nothing shows; how long it lasts is
  **not measured**. `openRepo` can also answer "open elsewhere" (that window takes the focus, `tabsStore.ts:90-91`) or
  an id that already has a tab (`:95-97`). `opening` is not in the tab snapshot (`SNAPSHOT_KEYS`, `repoStore.ts:565`).
- **The status bar is `role="status"`** (`src/components/ui/StatusBar/StatusBar.tsx:12`), so the op's text is
  announced already.
- **Why no spinner on a background tab** (the owner's first D, dropped 2026-10-09): a background tab's walk runs on in
  the backend, but the frontend drops its events (`repoStore.ts:547-548`; they only set the tab's "changed" dot,
  `App.tsx:162-164`), and returning to the tab restarts the walk (`tabsStore.ts:68-74`).

## A. The bar under the toolbar

- **Signal (D1):** `selectRunning(ops) || commitStore.busy`.
- **Label:** the op's own (`ops.busy`) when an op runs, which wins when both are busy; else, as the commit panel's own
  bar says, `committing ? "Committing" : "Applying changes"` (`FilesColumn.tsx:404`).
- **Where:** a small `ActivityBar` component in `RepoWindow.tsx` (beside `RepoStatusBar` and `StateBanners`, so only
  it re-renders on an op's start and end), rendered right after `<Toolbar />` (`:121`): one zero-height wrapper
  (`position: relative; top: -3px; flex: none; height: 0; z-index: 1`, after the `CommitPanel.module.css:42-47`
  pattern) holding the `Progress thin` (D2: as is) in normal flow, so its 3 px overflow the wrapper over the toolbar's
  bottom edge, hairline included. Rendered only while busy, so nothing shifts; not inside `role="toolbar"`;
  `Toolbar.module.css` untouched. Menus and the search popover paint over it.
- **Show delay (D13):** the wrapper gets `animation: appear var(--dur-panel) var(--ease) 150ms both`, the line
  `BusyOverlay.module.css:11` uses, with its own copy of `@keyframes appear` (`:22-29`) in the wrapper's CSS file: CSS
  modules scope keyframe names per file, so naming BusyOverlay's from elsewhere would silently do nothing. Under
  reduced motion `--dur-panel` drops to 0 (`src/theme/base.css:56-61`) but the 150 ms delay stays, so the bar still
  waits, then shows at once. No reduced-motion override on the wrapper (it would drop the delay), and no base
  `opacity: 0` (`both` already holds 0 through the delay).
- **The status bar keeps its spinner and text** (D3). The bar adds no `aria-live`, and its wrapper is `aria-hidden`
  (D11): the status bar already announces the op.
- **Under dialogs:** an ordinary dialog's translucent scrim dims the bar; with the tab strip shown in a window whose
  content area is under about 720 px tall (worked out from the CSS, not measured), the dialog itself, 10vh from the top,
  may also cover the bar's middle. A `full` dialog covers all but the bar's 16 px ends, which the scrim dims (D9).
- **Tests** (`src/screens/RepoWindow/RepoWindow.test.tsx`, which renders `RepoWindow` with `./Toolbar` mocked, `:43`
  — the sibling placement keeps the bar outside the mock). The bar sits in an `aria-hidden` wrapper (D11), which role
  queries skip by default, and the status bar's `Spinner` is a `progressbar` with the same name: find the wrapper by a
  `data-testid`, then the bar inside with `{ hidden: true }`. Its `beforeEach` sets
  `ops.busy` to "Fetching…" (`:58`): idle cases set it to `null`; `commitStore`'s `busy` / `committing` reset in
  `afterEach`. Cases: no bar when idle; the bar with the op's label while `ops.busy` is set; "Committing" while
  `commitStore` is busy committing; the op's label when both are busy.

## D. The opening overlay from the start (D8)

- **Change:** `openTab(path)` sets `useRepoStore.setState({ opening: baseName(path) })` (`baseName`,
  `src/lib/paths.ts:4`, as `repoStore.openRepo` uses; no import cycle: `tabsStore` imports `useRepoStore` already,
  `:14`) before `await ipc.openRepo(path)` (`tabsStore.ts:88`), and wraps its whole body in `try { … } finally {
  useRepoStore.setState({ opening: null }) }`, which covers every way out: an error, "open elsewhere", an id that
  already has a tab (`:90-97`), and the normal path, where `repoStore.openRepo` has already set and cleared it
  (`:330`, `:364-365`).
- **What the user sees:** the same *Opening <name>…* overlay as today, only without the blank wait before it; still
  after 150 ms, so a fast open shows nothing. It covers the start screen's opens, the toolbar's and the restore's too
  (over the "Starting" spinner, as today once the backend answers).
- **Side effects, inferred:**
  - During the wait the overlay swallows clicks, so no op or second open can start by mouse (keyboard shortcuts still
    run under it, as under today's overlay). A hung wait now locks the window's mouse input: D10, accepted.
  - Opening a subfolder (`…\repo\src`) reads "Opening src…", then "Opening repo…" once the backend answers
    (`repoStore` labels by `summary.path`). Restore paths are the repository's own, so unaffected. D12, accepted.
  - Two opens in flight (a tab dropped in from another window, a failed tab spawn, or a keyboard open during another
    open): the first to finish clears `opening` and the overlay goes while the other still loads, as
    `repoStore.openRepo` does today. D12, accepted.
- **Tests** (`src/store/tabsStore.test.ts`, `ipc.openRepo` a `vi.fn` per test, `:4-19`): with `ipc.openRepo` held on
  a deferred promise, `opening` is set; cleared after an error, after "open elsewhere", and after an id already open;
  on the normal path, with `startLog` held pending, `opening` is still set after the backend answers and null once
  `openTab` resolves.

## Steps

0. **Measure the gap** on the Windows VM over CDP, on a `tauri build --no-bundle` of this branch before any code change
   (the code as at `52fd957`), through the UI (a raw `open_repo` call would leave a backend handle held for the window,
   `tabsStore.ts:152-154`): the time from the click on the Recents item (the last click, its target inside
   `[role="menuitem"]`, not the one that opened the menu) to the new tab's element (`div[data-tab][role="tab"]`,
   `TabStrip.tsx:65-75`) in the strip, both read from the page's `performance.now()` (a capture-phase `click` listener
   on `document` and a MutationObserver, installed with `Runtime.evaluate`, again after every relaunch; the stores
   aren't reachable from CDP). Before each run, close the target's tab and keep two other tabs open, so the strip stays
   shown and the click opens rather than activates. Runs: a small repository, `perf-synth` (~100k files) warm, and
   `perf-synth`'s first open after a relaunch (its tab closed before quitting, so the startup restore doesn't open it;
   the OS file cache stays warm, so not truly cold), three runs each. Recorded in the BS walk record
   (`docs/archive/walks/2026-10-<dd>-bs-walk.md`), started here. If `perf-synth`'s warm median is under 150 ms, D
   changes nothing visible there (the overlay's delay hides it) and stays as a guard; BS 3's check doesn't depend on it.
1. A (code + tests), its own commit.
2. D (code + tests), its own commit.
3. Gates: `npm run build`, `npm test`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets --locked
   -- -D warnings`, `cargo test --workspace` (no Rust change expected; run anyway).
4. Docs:
   - Smoke group BS.
   - The style guide: the `Progress` row (`:110`, the new use under the toolbar) and `StatusBar` (`:107`, the bar
     beside the op text). The Toolbar's size-tier table (`:269-273`) stays as is (owner, 2026-10-09); the
     `BusyOverlay` row (`:116`) stays true.
   - `App.tsx:257-258`'s comment: `tabsStore` sets `opening` too.
   - `src/README.md`: `openTab` (`:40-42`, it sets `opening` first), `BusyOverlay` (`:240-241`, `tabsStore` sets
     `opening` too) and the `RepoWindow` layout line (`:276-278`, the bar under the toolbar).
   - The canvases: `toolbarB` (`docs/design/canvases/build/build-b.mjs:112`) draws the bar off its existing `busy`
     option, which the `Dock1000` artboard already passes (`:500-504`); `toolbar()` (`screens.mjs:38-74`) gains a
     `busy` option, passed at `parts-screens/Ops.mjs:29` (a merge dialog is open there, so the bar shows dimmed);
     the Components sheet's `toolbar()` (`parts/Components.mjs:20-41`). Rebuild all three sets (`build.mjs`,
     `build.mjs screens`, `build-b.mjs`). Republishing the claude.ai canvases is an external publish: ask the owner
     first.
5. Change review loop; then walk BS; triage; package.

## Smoke group BS

Header as BR's: the plan; fixtures `perf-synth` and `perf-git` (`node docs/smoke/fixtures/perf-repo.mjs`, a `perf-git`
clone of git.git, `smoke-test-post-v1.md:2453`, `:2480`) and a small throwaway repository; Windows over CDP on a local
`tauri build --no-bundle` of `activity-indicator` (`docs/smoke/smoke-cdp.md`, store backed up and restored), Linux
under Xvfb with openbox (`docs/smoke/smoke-linux.md`), and the owner's Mac session if free (D7).

1. **The bar (A):** in `perf-git`, *Fetch* (a network fetch from GitHub, so it lasts) → a thin accent bar sweeps along
   the toolbar's bottom edge until the op ends; the status bar's spinner and text as before. In `perf-synth`, append a
   line to 1000 tracked files (a bare `touch` changes nothing git sees), then *Stage all* in the commit panel → the bar
   too; the panel's own bar may outlast it by the status refresh (it follows `applying`, the toolbar's follows `busy`,
   D1), not a fail; if the panel's own bar is gone within 150 ms, no toolbar bar is expected (D13). Idle → no bar. In
   the small throwaway repository, stage one file → no flash on the toolbar (D13; the panel's own bar has no delay and
   may flash). In `perf-synth`, *Unstage all*, open the commit dialog (it holds the commit panel,
   `CommitDialog.tsx:11-18`) and *Stage all* there → only the bar's 16 px ends show, dimmed (D9). Then
   `git reset --hard` in `perf-synth`.
2. **Reduced motion (A):** Windows: Settings › Accessibility › Visual effects › *Animation effects* off, or CDP
   `Emulation.setEmulatedMedia` with `prefers-reduced-motion: reduce`; the Mac: System Settings › Accessibility ›
   Display › *Reduce motion* → a fetch shows the bar after the delay, still, full width, half opacity. Linux: not
   walked (how WebKitGTK reads it under the harness is unverified).
3. **Opening (D):**
   - Close `perf-synth`'s tab (keep two others open, so the tab strip stays shown), then open it again from the
     toolbar's Recents → `perf-synth`'s tab open and active, no overlay left behind. On Windows, timed, three runs: step
     0's click listener, installed again on this build, and a MutationObserver on `document.body` (`subtree: true`; the
     scrim is portalled there, `BusyOverlay.tsx:17`, found by its text, since it is `role="status"` like the status
     bar). Pass: in every run the scrim arrives in an earlier MutationObserver callback than the tab (without D both
     come in one React commit, so one callback; this holds however fast the open). Record click → scrim and click → tab
     per run; where tab − scrim exceeds 150 ms the overlay was visible before the tab. On Linux and the Mac (the gap
     unmeasured there), by eye: the overlay shows, or doesn't for a fast open, then clears.
   - Open a repository already in a tab (the palette's Recents list it) → no overlay left behind, that tab active.
   - A repository open in another window (two windows; Linux under openbox) → no overlay left behind, that window
     forward.
   - A Recents entry whose folder was deleted (open a throwaway repository, close its tab, delete the folder) → the
     "Couldn't open repository" toast, no overlay left behind.

## Decisions

Taken by the owner 2026-10-09, each as recommended:

- **D1 — what lights the bar:** (a) ops and the commit panel's work (`ops.busy` or `commitStore.busy`), so the bar
  means "wait". The commit panel's work doesn't block other ops (`runOp` checks only `ops.busy`), but it does block
  tab and window moves and stash drop / clear. `busy` over `applying`, to match `runOp`'s timing.
- **D2 — the bar's look:** (a) the existing `Progress thin` as is; its grey track shows only while busy.
- **D3 — the status bar:** (a) keeps its spinner and text.
- **D4 — stash drop / clear's confirmation:** (a) accepted: the bar shows behind the native confirm, since `ops.busy`
  is held then on purpose, as the status bar already shows. Closed, no reopen trigger (`open-items-done.md` at
  triage).
- **D5 — the pending tab's delay:** retired with D8 (no pending tab).
- **D6 — the startup restore:** withdrawn (pass 1): during the restore `App` is still in its "probing" phase and
  shows only the "Starting" spinner (`App.tsx:124`, `:137`, `:248-251`); no tab strip is on screen.
- **D7 — the Mac walk:** (a) included if the owner's Mac session is free.
- **D8 — the open gap:** (a) start the existing overlay before the backend wait, instead of a placeholder tab, which
  pass 1 found would break about a dozen readers of the tab list (Move to new window, Ctrl+Tab, Ctrl+1..9, Recents,
  the saved layout, drag indices) unless kept in a separate list.
- **D9 — `full` dialogs:** (a) accepted: they cover the bar but for its 16 px ends, which the scrim dims (re-asked
  after pass 3 found the margin; owner kept (a), 2026-10-09). Closed, no reopen trigger (`open-items-done.md` at
  triage).

Raised in pass 2, taken by the owner 2026-10-09:

- **D10 — a hung open locks the window's mouse input:** (a) accepted (owner, 2026-10-09), with a reopen trigger: a
  user reports a stuck *Opening…* overlay. The same lock exists today once the backend answers; Ctrl+Q and the
  window's close button still work. A row goes to `open-items.md` §Q at triage.
- **D11 — two progressbars with one name:** (a) `aria-hidden` on the bar's wrapper (owner, 2026-10-09): the status
  bar's live region already announces the op; the bar is visual only.
- **D12 — the overlay's label switch on a subfolder, and its early end with two opens in flight:** (a) both accepted
  (owner, 2026-10-09), closed with no reopen trigger (`open-items-done.md` at triage): rare, cosmetic, and true of
  today's overlay once the backend answers; counting opens risks a stuck overlay.
- **D13 — a show delay on the bar:** (a) 150 ms, as the overlay (owner, 2026-10-09): quick stage clicks don't flash
  it; an op of 150–300 ms shows it only briefly.

## Not in this batch

The start screen's own busy state; the update download's and the clone dialog's bars; the commit history load's bar
over the grid; every open-items row. For the triage at the end (found in pass 1, pre-existing): a tab adopted from
another window (`TabStrip.tsx:28-41`) and a failed tab spawn (`App.tsx:175-187`) call `openTab` with no busy check, so
a drop during a fetch switches repositories mid-op.
