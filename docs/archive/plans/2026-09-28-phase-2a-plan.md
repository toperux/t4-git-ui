# Plan: close-out Phase 2a — the rows with a known fix, 2026-09-28

_Written 2026-09-28. Status: executed on `phase-2a` 2026-09-29; change review passes 1–5 (pass 1: decisions
R1–R4; pass 5 clean); triaged. Plan review: decisions C1–C4, P1–P12 and §J taken by the user 2026-09-28 before
the first pass; pass 1: 6 should-fix, nits, decisions Q1–Q4; pass 2: 5 nits; pass 3: 1 nit, decision Q5; pass 4:
1 should-fix, Q5 revisited._

**Goal:** fix every Phase 2a row of `docs/plans/2026-09-26-close-out-plan.md` (the Phase 2 table's rows with a fix
given, plus §J's per-view sidebar), walk them as smoke group **BH**, and release. Row texts are in
`docs/plans/open-items.md`; line numbers below are as of `efaaacf` and were checked by the research pass.

Branch: `phase-2a` off `main`. One commit per row while working (squashed at the end, step 7 of `CLAUDE.md`).

## Rows

### 1. Crash-loop breaker (§P, triage U1; C1–C4)

A repository that crashes the app while the session restores crashes every later launch.

- **Mark.** `layout.restoring` next to `layout.json` (`path.with_extension("restoring")`); in memory, a new
  `Layouts` field `awaiting: Option<HashSet<String>>` (`src-tauri/src/commands/window.rs:40`).
- **Set.** In `take` on the first take only (`:310-311`), **always**, even with no saved layout (the `lastOpen`
  fallback loops too: `App.tsx:188` keeps `lastOpen` on the crasher). `awaiting = {"main"}`; create the directory
  first as `write_layouts` does (`:544-546`).
- **Track.** `spawned()` (`:236`) adds the label while `awaiting` is `Some` (restored windows, a tear-off or a
  second-launch spawn during the restore).
- **Clear** (`settle` removes one label and, when the set empties, deletes the file and sets `None`; `clear_mark`
  does it unconditionally):
  - the window's restore report: `set_layout` (`:216`) gains `restored: Option<bool>`, and `settle`s when true;
    `ipc.setLayout(layout, restored?)` (`src/api/ipc.ts:108`); `App.tsx:113` (the one-shot report after
    `restoreTabs`) passes `true`; the subscription (`:189`) doesn't;
  - a window closed mid-restore: `settle` at the top of `window_closed` (`:263`), before the `!close` return;
  - a failed window build: `settle` in `spawn`'s `Err` branch (`:175-179`);
  - normal exit: `RunEvent::Exit` in `src-tauri/src/lib.rs:299` calls `clear_mark` before `shutdown_logging`
    (Quit, last window, macOS/Linux update restart);
  - update: `clear_mark` just before `update.install(bytes)` (`src-tauri/src/commands/update.rs:199`). On Windows
    the plugin exits the process inside `install` (`on_before_exit` then `exit(0)`, updater 2.12.0
    `updater.rs:849-882`), so `Exit` never fires; the plugin's own `on_before_exit` is not overridden.
- **`lastOpen` fallback.** Wrap its `openTab` (`App.tsx:51`) in a try/catch that clears `lastOpen`, so a failed open
  still sends the one-shot report (today it throws into `:114` and leaves the mark set).
- **Trip.** `take`, first call, finding the mark: rename `layout.json` to `layout.crashed.json` (replacing an older
  one; C2; a missing `layout.json`, i.e. a crash on the `lastOpen` path, is not an error; any other rename error
  falls back to a copy, R1), return no layouts, don't
  seed `main`, re-arm the mark (`main`'s empty report clears it). `take_layout` returns `{ layouts, crashed, kept }`
  (`ipc.ts:111`; `kept`: a file was actually set aside); a second `take` always has `crashed: false`.
  `App.tsx:48` (its `.catch(() => [])` becomes `{ layouts: [], crashed: false, kept: false }`): if `crashed`, clear
  `lastOpen` (`recents.setLastOpen(null)` — else the next launch reopens the crasher through the fallback and the
  loop runs every other launch), push an **`error`** toast (it stays until dismissed; Q2), and stop before the
  `lastOpen` fallback. Title *Your last session wasn't reopened*; detail *The app closed while reopening it, so it
  started empty this time. Your repositories are still in Recents.* plus, when `kept`, *The saved windows are in
  layout.crashed.json.*
- **Harness and docs.** `docs/smoke/fixtures/direct.sh`'s `seed` (`:31`) removes a stale `layout.restoring`;
  `docs/smoke/smoke-cdp.md:82` (*N windows at launch*) and `docs/smoke/smoke-linux.md` (`wd.mjs stop` kills the
  app) get the same note; AZ 3h (`smoke-test-post-v1.md:1864`, a kill) waits until `layout.restoring` is gone;
  `src/README.md:6-12, :524-528` describe the breaker with `take_layout` / `set_layout` and the fallback.
- **Tests (Rust, `window.rs` `mod tests`; existing `take` tests also clean the mark, and their assertions at
  `:811, :867, :892, :907` read `.layouts`):** the mark is armed by the first take, also with no layout (extend
  `a_first_launch_seeds_nothing`, `:888`); it clears once every restored window reports; a window closed
  mid-restore counts as reported; a spawn after the restore isn't awaited; `clear_mark` ends the restore and later
  settles are harmless; a restore that never finished is set aside (`crashed` and `kept` true, no layouts, `main`
  not seeded, `layout.crashed.json` has the old bytes, mark re-armed, `main`'s report clears it); a trip with no
  `layout.json` has `kept: false`; a second take never reports `crashed` (extend `:900`); Windows only, a refused
  rename copies the session aside (R1).
- **Tests (vitest, `App.test.tsx`):** `takeLayout` mocks (`:16, :56, :67, :78, :118`) become `{ layouts, crashed:
  false, kept: false }`; `:113` and `:123` expect the one-shot report's second argument `true`; new: a crashed
  launch opens nothing (not even `lastOpen`), clears `lastOpen`, pushes the error toast (with the file sentence
  only when `kept`), and reports `({tabs:[],active:""}, true)`; new: only the one-shot report passes `true`;
  `:126` changes: a failing `lastOpen` still reports and clears `lastOpen`.
- **No crash hook (C3).** The walk kills the app mid-restore and hand-creates the mark.
- **The update clear** isn't exercised by this release's gate (0.10.12 does the installing). 2b's update walk
  checks it: after updating from 2a's release, the first launch shows no toast (a note in the close-out plan's
  release gate).
- **Limits** (C1, C4, Q3, Q4):
  - §Q, *A crash after the restore report still loops.* The report fires when the log walk starts
    (`repoStore.ts:347`); a crash later in the walk or the refs load is past the clear. **Reopen:** a loop is
    reported that gets past the breaker. *From §P.*
  - §Q, *The breaker can trip without a crash.* A kill during a slow restore (any OS; on Linux, the §O hang with a
    second window stuck on *Starting*) can't be told from a crash; and without single-instance (no session bus,
    `window.rs:287-288`), a second process finds the first one's live mark. Either way the session is set aside
    once, with the file kept. **Reopen:** the §O fix lands (re-check), or a false trip is reported. *From §P.*
  - Done file (closed, Q3): a repository that crashes when opened by hand costs two crashes before the breaker
    trips (the design covers restores only).

### 2. Esc dead in a dialog after its own control disables itself (§M, triage T2; P9–P12)

A focused button that disables itself (Check now) drops focus to `<body>`, outside the dialog's `<form>`, whose
`onKeyDown` (`src/components/ui/Dialog/Dialog.tsx:97-103`) is the only Esc/Tab handler.

- **Fix (D, P9).** In `Dialog.tsx`, a document `keydown` listener while the dialog is mounted: with `e.target ===
  document.body`, Esc closes (unless `busy`, then it focuses), Tab focuses the first body field (P10). Pull `:94`'s
  lookup into a local `focusFirst()` shared with the busy rule, which stays (P11). It reacts only to events and is
  removed in cleanup, so it doesn't fight the return of focus to the opener (`:77-85`), and in Commit & Push the new
  dialog's `autoFocus` holds focus, so `target` isn't body.
- **Registered in the capture phase, `stopPropagation()` on Esc only.** Menu (`Menu.tsx:105-107`), SidebarRail
  (`SidebarRail.tsx:25-29`) and SearchPopover (`SearchPopover.tsx:32-38`) act on any Esc reaching `document`; today
  the form's `stopPropagation` shields them. Without this, one Esc on body would also close a rail flyout or a
  search popover left open under the dialog, and SearchPopover's refocus of its button would make the dialog's
  cleanup (`Dialog.tsx:82`) skip returning focus to the opener. Tab is left alone (`kbdFocus.ts` also listens in
  capture, registered earlier).
- **Tests (P12).** `Dialog.test.tsx`: Esc on body closes; Tab on body focuses the first field; while `busy`, Esc on
  body focuses and doesn't close; after unmount, Esc on body does nothing and focus stays on the opener; the Commit &
  Push test (`:50`) also checks Esc on body closes the Push dialog; a SearchPopover (or rail flyout) open under the
  dialog stays open on Esc on body, and focus returns to the opener. One test per audited case, each simulating the
  webview's focus drop (jsdom keeps focus on a disabled element: `blur()` then keyDown on body, as `:81` does):
  - `SettingsDialog.test.tsx`: Check now (`SettingsDialog.tsx:232`), Git path Apply (`:281`), a tool Apply
    (`ToolSection.tsx:240`), a Signing checkbox (`SigningSection.tsx:131`);
  - `CommitPanel.test.tsx` (rendering `CommitDialog` as `:719` does): a failing Commit (`MessageColumn.tsx:218`),
    Stage all (`FilesColumn.tsx:110`), a hunk Stage (`DiffViewer.tsx:559`);
  - `StashesDialog.test.tsx`: Apply (`StashesDialog.tsx:129`);
  - `dialogs.test.tsx`: rebase Move up to the top (`RebaseInteractiveDialog.tsx:210`).
  - Noted, not tested: focus lost by unmounting (the rebase merges radios `:237/:241`, stash push success); D covers
    them generically.

### 3. Failure toast detail cut mid-sentence (§M; P5)

`classify_failure` (`crates/git-core/src/cli/ops.rs:645`), the middle fallback (`:681-693`): skip leading empty,
fetch-chatter and `warning:` lines, then join lines up to a blank one, at most 4 (R3; trimmed, `' '`). The
`fatal:`/`error:` path and the last-resort fallback stay, so a stderr of only warnings still shows the warning.
- **Tests:** `rejected_and_other` (`:1295`): cherry-pick expects *The previous cherry-pick is now empty, possibly
  due to conflict resolution. If you wish to commit it anyway, use:*; pull expects the joined advice paragraph;
  new: `warning: redirecting …` then advice gives the advice; new: `warning: x` alone gives `warning: x`; new: six
  lines with no blank line give the first four joined (R3).
- **Docs:** the expected toast text at `docs/smoke/smoke-test-post-v1.md:505`.

### 4. Blame and history never cancelled (§I S1; P1)

- `RepoHandle` (`crates/git-core/src/repo.rs:65-84`) gains `latest_blame` and `latest_history`
  (`parking_lot::Mutex<Option<CancellationToken>>`, initialised in `open`, `:102-111`), and `supersede_blame` /
  `supersede_history` that swap in the new token and cancel the old one.
- Call them right after `begin_op` in `get_blame` (`src-tauri/src/commands/tree.rs:63-85`), and in every
  `start_log` (`src-tauri/src/commands/repo.rs:270-279`) — not only path calls, since a `start_log` that clears
  the path filter (`Toolbar.tsx:182`, `actions.ts:218`) must also stop the old `log --follow`. **The swap happens at
  the very top of `start_log`, before `compute_labels` (`repo.rs:263`)** (Q5): a path call moves its `begin_op`
  (today `:274`, after the labels) up there and swaps its op token in; a call without a path cancels the old
  history token and stores `None`. So the swaps run in the order the calls arrived: an older path call that is slow
  in `compute_labels` can no longer register late and cancel a newer one (whose `Cancelled` would show in the grid,
  `repoStore.ts:481-482`). The path call's `end_op` runs on every way out, including the `?` after
  `compute_labels`. Cost: the op is registered during the label computation too. A cancelled one returns
  `GitError::Cancelled`; the frontend already drops stale replies (`diffStore.ts:187-204`, `repoStore.ts:470`).
- **Test:** `repo.rs` `#[cfg(test)]` (`:207`): supersede t1 then t2 → t1 cancelled, t2 not; same for history.

### 5. The truncated flag fires on stderr (§I S3; P2)

Rename `CliOutput::truncated` to `stdout_truncated`, set from `out_truncated` only (`cli/runner.rs:78, :351`).
Uses: `log/history.rs:78`, `src-tauri/src/commands/ops.rs:1198` (`remote_tags_of`), literals at `ops.rs:1291,
:1296`, `crates/git-core/src/stage.rs:708`. `err_truncated` (`runner.rs:337`) is bound as `_` (else clippy's
`-D warnings` fails on it); reword the field's doc comment (`runner.rs:77`).
- **Tests:** rename in `a_truncated_ls_remote_is_not_parsed`; new runner test (with the `have_git` guard, alias
  style of `runner.rs:875`) writing 5 MB to stderr and `ok` to stdout: exit 0, `!stdout_truncated`, stdout has `ok`.

### 6. Hunk buttons on a non-UTF-8 file (§I F3; P3)

- `FileDiff::lossy` (`crates/git-core/src/diff.rs:132-135`) loses `#[serde(skip)]`; fix its doc comment.
- `src/api/types.ts:390-406`: `lossy?: boolean`.
- `CommitPanel.tsx:107`: `|| diff.lossy` in `wholeOnly` (hides hunk buttons and line selection, as for truncated
  and typechange); a header note in the `:124-134` chain: *Not UTF-8 — stage whole file*.
- **Tests:** `crates/git-core/tests/serde.rs:227-242` asserts `lossy` on the wire (false and true);
  `CommitPanel.test.tsx:433` gains a `lossy: true` case (no Stage/Discard hunk, the note shows).
- **Docs:** reword BD 3 (`smoke-test-post-v1.md:1937`); fix the stale *may fail or misapply* at
  `docs/smoke/smoke-test.md:312`.

### 7. `.gitmodules` rewritten by the app (§I `watch.rs`; P4)

- In `src-tauri/src/commands/stage.rs`, `fn kinds_for(base, paths)` appends `Refs` when a path is `.gitmodules`;
  used by `discard_paths` (`:208`), `recreate_conflict` (`:240`), `resolve_conflict` (`:279`) and
  `apply_selection`'s Discard (`:351-354`). The frontend's refs path reloads Submodules (`repoStore.ts:385`).
- Rewrite the `ponytail:` comment at `crates/git-core/src/watch.rs:122-127`.
- **Test:** a `stage.rs` unit test on `kinds_for` (with and without `.gitmodules`).

### 8. Default remote overwrites a quick pick (§M)

`useDefaultRemote` (`src/screens/RepoWindow/dialogs/OpsDialogs.tsx:27-44`): a `touched` ref; the returned setter
sets it; the late `get_default_remote` answer is skipped once touched.
- **Test:** `dialogs.test.tsx` near `:367`: with a deferred `getDefaultRemote`, pick `fork` in `PushDialog`, resolve
  with `origin`, the preview still says `fork`. No smoke bullet (a millisecond race).

### 9. Banner buttons not disabled while an op runs (§I; P6)

`StateBanners` (`src/screens/RepoWindow/RepoWindow.tsx:324-396`): `running = useOpsStore(selectRunning)`; at
`:386`, buttons whose action starts an op get `disabled` + title *Operation in progress*; `commitMerge` and
`openCommitPanel` (view switches) stay enabled.
- **Test:** export `StateBanners`; new `RepoWindow.test.tsx` (mocks as `Toolbar.test.tsx`): detached HEAD + busy →
  Create branch… and `Checkout <default>` (the label is `Checkout ${def}`, `banners.ts:52`) disabled with
  the title, a click opens no dialog; busy cleared → enabled; a merge state + busy → Commit merge enabled, Abort
  disabled.
- **Docs:** §Q *A ref or remote dialog closes on a refused op* (`open-items.md:527-533`): no known path left; the
  §I row moves to the done file.

### 10. `Ctrl+,` dead while the start screen opens a repo (§L) — accepted, no code (Q1)

While a repository opens, the *Opening…* overlay (`App.tsx:232`, `z-index: 50`, above dialogs at 40, swallowing
clicks) covers the start screen, so Settings opened then would sit invisible under it, holding the keyboard, until
the repo window replaces it. Only Init (`StartScreen.tsx:94-96`) and the overlay's 150 ms fade-in are uncovered.
The row moves to §Q: *`Ctrl+,` does nothing while the start screen opens a repository*, with the overlay reason.
**Reopen:** the gap feels long. *From §L.*

### 11. Super chords reach the app on Linux (§L; P7)

`src/lib/keys.ts` gains `ctrlOrCmd(e)`: `e.ctrlKey || (e.metaKey && /Mac/.test(navigator.userAgent))`, evaluated
per call (stubbable). Used at `useShortcuts.ts:37`, `StartScreen.tsx:128`, `MessageColumn.tsx:108` (Enter commits)
and `FilesColumn.tsx:362` (select all). `mods()` (`keys.ts:5`) and `kbdFocus.ts:23` stay.
- **Tests:** stub a Mac UA in `useShortcuts.test.ts:55` and `StartScreen.test.tsx:151`; new: with a Linux UA,
  Super+Q/,/K do nothing in `useShortcuts`, Super+O/N do nothing on the start screen, Super+Enter doesn't commit,
  Super+A doesn't select all.
- **Smoke:** not reachable on Windows (the OS owns the Win key); a Linux WebDriver bullet (Meta+Q, Meta+O on Xvfb)
  for the Linux track, which also records WebKitGTK's real `navigator.userAgent` and confirms it has no `Mac`
  (the tests only stub it).

### 12. Update answer missed by a new window (§I `App.tsx:175`)

Issue the one `lastUpdateCheck()` after the `update://checked` listener attaches: `onUpdateCheckedReady` via
`subscribeReady` (`src/api/events.ts:49`, `:83-90`); `App.tsx:154, :174-180` rewritten; cleanup awaits the unlisten.
Drop the `ponytail:` comment; update `src/README.md:21, :26, :150` (they name `onUpdateChecked`). The reply is
dropped once an `update://checked` event was heard (R2).
- **Test:** the events mock (`App.test.tsx:23-33`) gains `onUpdateCheckedReady` (else every App test throws); with
  a deferred ready promise, `lastUpdateCheck` isn't called before it resolves, is called once after, and the store
  learns the answer; an event heard before the reply resolves wins over the reply (R2).

### 13. AltGr never reaches type-ahead (§I `Input.tsx:221`)

`src/components/ui/Input/Input.tsx`: `altGr = e.ctrlKey && e.altKey && e.key.length === 1`; the Alt branch
(`:204-215`) skips it, and the type-ahead condition (`:227`) accepts `(!e.ctrlKey || altGr)`. Drop the
`ponytail:` comment (`:221-223`).
- **Test:** `Input.test.tsx`: Ctrl+Alt+`ł` opens the list with `łódź` active; the existing Ctrl+f / Alt+f and
  Alt+↓/↑ tests still pass.

### 14. Per-view sidebar (§J; decided 2026-09-28; P8)

`src/store/viewStore.ts`: `railOverride: Record<View, boolean | null>`, per window, in memory; `toggleRail`
works on the current view; readers `RepoWindow.tsx:54` and `Toolbar.tsx:71` select `st.railOverride[st.view]`.
The sidebar's width is kept in `RepoWindow` (a ref), so a width dragged in one view comes back after a switch that
hid the sidebar (R4).
- **Tests:** `viewStore.test.ts`: the override belongs to the view it was made in; `useShortcuts.test.ts:97` and
  `Toolbar.test.tsx:51` read `.railOverride.history`; `RepoWindow.test.tsx`: a dragged width survives a view switch
  that hid the sidebar (R4).
- **Docs:** root `README.md:106` says the sidebar toggle is per view. Release notes are generated from commits
  (`.claude/skills/release/SKILL.md:156`), so the squashed commit's message says it too.

## Docs — two commits

**Before the walk** (with the code):
- `open-items.md`:
  - §J: the palette prefixes row moves to §C (roadmap). §L: the `Ctrl+,` row moves to §Q (row 10).
  - §Q: the two breaker entries (row 1), the `Ctrl+,` entry (row 10), and the *ref or remote dialog* entry
    reworded (row 9: no known path left).
- `docs/plans/2026-09-26-close-out-plan.md`: §J decided — the Phase 2 table's §J row (*decided 2026-09-28*:
  prefixes → §C, per-view sidebar → 2a), *Order* step 1 and the status line's "Next: the §J decision" struck, open
  decision 1 (`:252`) closed; the table rows at `:155` (`navigator.platform`) and `:170` (a `Linked` kind) reworded
  to the decisions (P7, P4); the release gate gains row 1's update-clear check for 2b's walk.
- The smoke and README edits named in the rows (`smoke-test-post-v1.md:505`, BD 3 `:1937`, AZ 3h `:1864`;
  `smoke-test.md:312`; `smoke-cdp.md:82`; `smoke-linux.md`; `direct.sh`; `src/README.md`; root `README.md:106`);
  new group **BH**.

**After the walk:** the ticks and the walk record. **After the squash** (step 4 of *How it runs*, so the hashes are
final):
- The fixed rows move to `open-items-done.md`, each with its squashed commit: §M ×3 (toast detail, default remote,
  Esc), §I (S1, S3, F3, the banner row, and the `ponytail:` rows `watch.rs`, `App.tsx`, `Input.tsx`), §L's Super
  row, §J's per-view row, §P's crash loop; plus the closed limit from row 1 (Q3).
- §J and §L are then empty: their headings go, and the done file's §J / §L carry the pointers — including the
  origin pointer for the `Ctrl+,` row now in §Q (the §Q rule keeps a pointer at the origin). The §I
  intro's count of the `ponytail:` list is updated.
- The close-out plan's status line: Phase 2a done.

## Smoke group BH (Windows over CDP, local `tauri build --no-bundle`)

0. **Before anything:** with the installed app closed (`smoke-cdp.md:73`), back up `%APPDATA%\dev.topher.t4gitui\`
   (the local build shares it with the installed app, `smoke-cdp.md:70-75`). After the walk: restore it, delete
   `layout.crashed.json` and `layout.restoring` if left, and `cmp` against the backup — a stale mark would
   trip the installed app's next launch.
1. **Breaker:** seed `layout.json` with two windows, launch, kill within ~1 s; if `layout.restoring` exists, the
   relaunch shows the start screen and the error toast (with the file sentence), `layout.crashed.json` holds the
   session, `lastOpen` is cleared (the `lastOpen` key in the store folder's `recents.json`), and the mark is gone
   once `main` is up (if the mark was already gone, repeat on a bigger repo). A second relaunch opens nothing and
   shows no toast.
   - **Every kill in BH 1 and BH 3 that should not trip waits until `layout.restoring` is gone** (the report goes
     out when `startLog` resolves, after the title shows), as AZ 3h does.
2. **Breaker, no kill:** hand-create `layout.restoring` next to a seeded layout; the launch trips the same way.
3. **No false trip:**
   - after a full restore: kill → restores; Quit → restores; closing windows one by one → restores;
   - Quit while the second window is still restoring → the relaunch restores, no toast (the `Exit` clear);
   - close the second window mid-restore, then kill `main` after it's up → no toast (the `window_closed` settle).
4. **Esc after Check now:** Settings from the gear, log `focusout` via `Runtime.evaluate`, Check now, wait; record
   `activeElement` (the Blink answer); Esc closes and focus is on the gear; again with Tab first → the Theme select.
5. **Esc after Stage all** in the Commit dialog.
6. **Toast text:** the empty cherry-pick row's toast shows the joined sentence.
7. **Non-UTF-8:** BD 3 reworded (`latin1.txt`, bd fixture): no hunk buttons, the note, whole-file stage works.
8. **Submodules:** bd2 fixture: edit `.gitmodules` by hand → the list follows; Discard it → the list reverts with no
   Refresh.
9. **Banner:** detached HEAD + a long op: Create branch… and `Checkout <default>` disabled with the title; enabled
   after.
10. **Per-view sidebar** at 1280 wide: toggle in History, switch to Changes (full sidebar), toggle there, back to
    History (still toggled); a new window follows the width.
11. **T8 proxy check** (triage T8): launch with `smoke-launch.ps1 -Proxy http://127.0.0.1:8888` and
    `throttle-proxy.mjs` running; `CONNECT github.com` in the proxy's log.
12. **Update badge in a new window** (optional regression): with an update available, Ctrl+Shift+N shows the badge.

Unit-only (ticked as such): rows 4, 5, 8, 12; row 11 on the Linux track; row 13 (AltGr) by hand with a Polish
layout if the user wants.

## Decisions (the user, 2026-09-28)

- **§J:** palette prefixes → §C roadmap; per-view sidebar → build in 2a.
- **C1:** clear the mark at each window's restore report; late-walk crashes → §Q. **C2:** rename to
  `layout.crashed.json`. **C3:** no crash hook. **C4:** accept the hang-then-kill trip → §Q.
- **P1:** blame and history both cancelled. **P2:** one `stdout_truncated` field. **P3:** hide the hunk buttons +
  a note. **P4:** `.gitmodules` ops report `Refs`, no new kind. **P5:** accept the longer toasts. **P6:** gate
  every banner button that starts an op. **P7:** `ctrlOrCmd` at all four spots. **P8:** per window.
- **P9:** document key handler. **P10:** Tab → first body field. **P11:** keep the busy rule. **P12:** one test per
  audited case (~9), unmount cases noted.
- **Q1:** `Ctrl+,` row accepted → §Q (reopen: the gap feels long); no code. **Q2:** the breaker's toast is an
  `error` toast. **Q3:** the two-crashes limit is closed in the done file. **Q4:** a second process without
  single-instance joins the §Q false-trip entry. **Q5:** the history token is swapped at the top of `start_log`, before
  the labels (first accepted as a closed limit, then revisited after pass 4 showed a newer call could be cancelled).
- **Change review pass 1 (2026-09-29): R1:** a failed set-aside rename falls back to a copy. **R2:** a window
  ignores the `lastUpdateCheck()` reply once it has heard an `update://checked` event. **R3:** the joined advice is
  capped at 4 lines. **R4:** the dragged sidebar width survives a view switch that hid the sidebar.
- **Triage (2026-09-29), after change review pass 5 was clean:** L1 (a webview-only crash isn't caught), L2 (the
  cancel race for two reads in one tick) and R4's edge (the last actual width comes back, not only a dragged one)
  → accepted, open-items §Q; R4's 0-px report ignored (a one-line guard). L3 (the Esc fix on WebKitGTK) → deferred
  to the Linux track, and N6 (Option-typed type-ahead on macOS) → deferred to Phase 5, both in open-items §R. N5b
  (`useShortcuts.ts`'s AltGr comment said "and Linux") → fixed.
- **Triage, second round (2026-09-29):** eight items the loop had waved off without asking. Accepted, §Q: the
  history generation race, stacked dialogs on one Esc, the panel-library mock in the width test, the flaky
  `cancel_kills_long_running_process`. Accepted, closed: the Windows-only copy-fallback test, the skipped AltGr hand
  walk. Deferred: Ctrl+Q on the start screen → 2b (open-items §R); BH 12 → 2b's release gate.

## Verify

- Gates, as CI runs them (`checks.yml:81-101`), from `F:/` (uppercase): `cargo fmt --all --check`, `cargo clippy
  --workspace --all-targets --locked -- -D warnings`, `cargo test --workspace --locked`, `npm test`, `npm run build`.
- Group BH walked on Windows; results in `docs/archive/walks/2026-09-29-group-bh-walk.md`; the store folder restored
  and `cmp`'d.
- Every open-items row named above moved, with its commit; `git grep` finds no open row still pointing at Phase 2a.

## How it runs

1. On the user's go: branch `phase-2a`, one commit per row (rows 1–9, 11–14), then the first docs commit; gates
   green.
2. Walk group BH; record it; the second docs commit.
3. Change review loop; a review fix that touches a walked BH step re-walks that step. Triage anything skipped or
   proposed for acceptance.
4. Squash into logical commits (rehearsed in a throwaway worktree); then the after-the-squash docs commit with the
   final hashes; then ask before merging to `main` and pushing.
5. Release on the user's word (the `release` skill), then the release gate (the user's installed 0.10.12 updates
   through the updater — the first update whose signature carries `version:`), and the first AppImage release walk
   on the Linux machine (with U4).
