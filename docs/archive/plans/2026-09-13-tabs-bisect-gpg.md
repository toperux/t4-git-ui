# Plan: multi-repo tabs, bisect, GPG settings — plus small features

Three roadmap rows from `open-items.md` §C, built as three independent series (each its own
commits, smoke group and review pass), then a §4 of small features the user adds. Order:
**§3 GPG → §4 stash preview + browser → §2 bisect → §1 tabs + windows** — smallest first; §4
before tabs because it adds fields (`repoStore.preview`, `Stash`) that the tab snapshot must
include; tabs last because it touches every store and adds a second window. Decisions D1–D11
were taken with the user on 2026-09-13 and are recorded inline as **decided**; an audit the
same day folded 19 fixes in (marked *audit*).

## 0. What exists, and what each feature reuses

- **Backend is already multi-repo.** `AppState.repos: HashMap<RepoId, Arc<RepoHandle>>` and
  `watchers: HashMap<RepoId, Watcher>` (`src-tauri/src/commands/repo.rs:94-179`); `open_repo`
  returns the cached handle on a second open; `repo://changed` and `log://progress` both carry the
  repo id. Nothing in Rust changes for tabs.
- **Frontend is single-repo.** `repoStore` holds one `repo` and closes the previous handle inside
  `openRepo` (`repoStore.ts:284`); `statusStore`, `commitStore` (message draft, selection, amend)
  hold one repo's state with no id; `diffStore` alone is keyed by `repoId` (`diffStore.ts:15`).
  `opsStore` is global: one `busy` guard, one log. `App.tsx:91-100` mirrors `repo` into
  recents + `lastOpen`, which is what reopens on launch (`App.tsx:58`).
- **Bisect state is read but inert.** `RepoState::Bisect` (`refs.rs:95`), banner text with
  `buttons: []` (`banners.ts:100`), `conflict_sides` `None` for bisect (`refs.rs:556`). The
  watcher classifies `.git/BISECT_*` and `refs/bisect/*` as `Refs` (`watch.rs:86-90`), so every
  bisect step already triggers `syncRefs`. Op-arg builders + `cli_op` + `ref_arg` are the shape
  (`cli/ops.rs:228-259`, `commands/ops.rs:96-106, 242-250`).
- **Signing already works** because commits run through the CLI (`commit.rs:9-24`), so
  `commit.gpgsign` / `user.signingkey` / `gpg.*` are honoured from the effective config. There is no
  UI over them. `config.rs` has `get` (effective) and `set_local` (repo `.git/config`) only; tools
  are written to `~/.gitconfig` by `commands/tools.rs:set_tool`. Settings dialog sections:
  Git executable · Theme · Sidebar · Diff · External diff tool · External merge tool · Updates
  (`SettingsDialog.tsx:144-272`).
- Shortcuts in use (`useShortcuts.ts`): F5, Ctrl+F5, Ctrl+Shift+U/L/R, Ctrl+B, Ctrl+`,
  Ctrl+Shift+W (close repository), Ctrl+O (start screen). Ctrl+Tab, Ctrl+W, Ctrl+T, Ctrl+1..9 free.

## 1. Multi-repo tabs, detachable into windows

**Goal.** One window holds N open repositories in a tab strip; a tab can be moved to its own
window; every window is a full T4 Git window. A worktree's or submodule's **Open**, a recent,
**Open repository…** and a start-screen click all land in a tab.

### Decisions (taken 2026-09-13)
- **D1 — decided: cold tabs inside a window, windows as separate app instances.** Each Tauri
  window runs its own React app with its own stores, so nothing is shared across windows except
  the backend. Inside a window the stores stay single-repo; switching tabs snapshots the active
  slices (`repoStore` minus `gitVersion`, `statusStore`, `commitStore`, `diffStore` — *audit:*
  `diffStore.repoId` is one field, not a map, so it is snapshotted like the rest)
  into `tabsStore.saved[RepoId]` and restores the target's; `dialogStore` is closed on every
  switch (*audit:* an open dialog references the active repo). A `repo://changed` / `log://progress`
  for an inactive id only flags that tab **stale** (dot on the tab); activation runs the normal
  refresh. Hot tabs rejected: re-keys every selector for no visible gain.
- **Detach — decided (revised 2026-09-13): drag and drop, ported from t4-markdown-viewer.**
  Drag a tab within the strip to reorder; drag it out of the strip to tear it off into a new
  window at the cursor; drag it over another T4 Git window's strip to move it there (Windows
  only — see the DnD section). **Move to new window** stays in the tab menu (+ Ctrl+Shift+N) as
  the keyboard path and the macOS / Linux path for tear-off.
- **Same repo in two windows — decided: refused.** Opening a path shown in another window focuses
  that window instead. Within a window, an already-open path activates its tab. Both compare by
  `RepoId`, so `\\?\` / case / slash variants match.
- **D2 — decided: one busy guard per window** (each window's `opsStore` is its own; the backend
  already rejects a second op on the same repo with kind `busy`, `ipc.ts:234`). An op in tab A
  blocks tab B and tab switching in that window, like `switchRepo` is refused today.
- **D3 — decided: every open is a new tab** in the calling window.
- **D4 — decided: restore windows + their tabs on launch.** *Audit 2 — the layout is owned by
  Rust, not `recents.json`:* every window writes the same store file, a window only knows its
  own tabs, and "user closed one window" must not be confused with "app quit closed them all".
  So, markdown-viewer's `session.rs` shape: each window calls `set_layout(window, { tabs,
  active })` on every tab change; `AppState.layouts: HashMap<label, Layout>`; `Destroyed` drops
  the label's entry unless the app is exiting; `RunEvent::ExitRequested` writes the map to
  `layout.json` in the app data dir. On launch `main` reads it (`take_layout`), opens the first
  entry's tabs itself and calls `spawn_window` for each other entry (pending payload = that
  entry). Missing paths dropped silently; if `main` was closed earlier and only `w1` was alive
  at quit, `w1`'s entry becomes `main`'s. Window frames stay with `tauri-plugin-window-state`
  for `main` only (see the filter below). Migration: `recents.json`'s `lastOpen` string seeds a
  one-tab layout on the first launch without a `layout.json`, then is ignored.
- **D5 — decided: strip hidden with one tab.** With two or more, the strip sits under the
  native title bar, above the toolbar. Entry points with one tab: Repository menu
  "Open repository…" / recents (new tab), Ctrl+T. *Audit:* a one-tab window has no strip, so its
  only detach path is the menu item / Ctrl+Shift+N — accepted.
- **Decided by default (say so to change):** Ctrl+Tab / Ctrl+Shift+Tab cycle, Ctrl+W closes the
  tab (Ctrl+Shift+W stays as its alias; closing the last tab of a secondary window closes the
  window, of the main window shows the start screen), Ctrl+1..9 jump; tab label = repo name,
  tooltip = path, stale dot, middle-click closes; window title
  `T4 Git - <active repo>` per window; a settings change in one window is broadcast as
  `settings://changed` and the other windows reload `settingsStore` (no reload = stale theme /
  diff prefs in the other window).

### Backend
- **Handle refcount by window label.** `open_repo(window: tauri::Window, path)` records
  `label → {ids}` in `AppState.holders`; `close_repo(window, id)` removes the label and drops the
  handle + watcher only when no label holds the id. `on_window_event(Destroyed)` clears that
  label's set the same way, so a closed or crashed window never leaks a watcher. Without this
  the old window's `close_repo` kills the handle the new window just received.
- *Audit:* the "already open elsewhere" check lives **inside `open_repo`**: when another label
  holds the id it calls `focus_window(that)` and returns `AppError::OpenElsewhere`, which
  `openTab` maps to nothing (the other window now has focus). One IPC call, no separate
  `focus_repo_window`. The same-window tab-level check is frontend-only.
- `spawn_window(path, placement)`: `WebviewWindowBuilder::new(app, format!("w{n}"), "index.html")`
  built invisible on a worker thread, main window's size, `Placement::Cursor(x, y)` or default;
  the payload is parked in `AppState.pending: HashMap<label, { tabs: Vec<String>, active }>`
  (*audit:* a window restored from the layout carries N tabs, a tear-off carries one) and the
  new window pulls it with `take_pending()` on startup (markdown-viewer's shape — no URL-encoding
  of paths). On build failure emit `tab-spawn-failed { path }` back to the source so it keeps
  its tab.
- *Audit:* `tauri-plugin-window-state` restores **every** window on creation, so a torn-off
  `w1` would snap to its saved frame instead of the cursor. Restrict the plugin to `main`
  (`Builder::with_filter(|label| label == "main")` — **verify** the installed version has it,
  else `with_denylist` of `w1..w9`); secondary windows keep no frame across launches and open
  at the main window's size, offset. Persisting their frames like markdown-viewer's `Frame` is
  the upgrade if asked.
  `capabilities/default.json` `windows: ["main", "w*"]` (the glob is what markdown-viewer ships).
- No native menu exists (the toolbar is HTML), so nothing is per-window there. The updater dialog
  runs in whichever window checked; guard the automatic check with "main window only" so two
  windows do not both prompt.

### Drag and drop (ported from `t4-markdown-viewer`, `src/app.js:1325-1586` + `main.rs:290-842`)
HTML5 DnD cannot cross a webview, so it is **pointer capture** on the strip, a **ghost chip**
that follows the cursor once the tab leaves the strip, and Rust doing the **screen-space
hit-test** of other windows. Same constants: 5 px start threshold, 24 px strip slack before a
drag counts as detached, 30 ms probe throttle.
- **Rust commands** (copy from markdown-viewer, adjust the payload to `{ path }`):
  - `window_origin() -> { x, y, scale, exact }` — `inner_position()`; Wayland has no exact
    position (`exact: false`, x/y 0), which disables cross-window drops there.
  - `drag_over(x, y) -> Option<label>` — `window_at(x, y)` excluding the source; on target change
    emit `tab-drag-out` to the old target and `tab-drag-over { x, y }` (CSS px, local) to the new;
    `AppState.drag_target: Mutex<Option<String>>`.
  - `drag_cancel()` — `tab-drag-out` to the current target, clear it.
  - `drop_tab(x, y, path, tear_off)` — target window found → **move the holder** (add the
    target label to `holders[id]`, drop the source label) then emit `tab-adopt { path, x }` and
    `focus_window(target)`; no target and `tear_off` → `spawn_window(path,
    Placement::Cursor(x − 140·scale, y − 24·scale))`; neither → nothing (the source keeps the tab).
    Moving the holder in Rust before the adopt keeps the handle + watcher alive across the hop,
    so the target's `open_repo` hits the cache and the source's `closeTab` never drops it.
  - `window_at(x, y)`: **Windows only** — `WindowFromPoint` + `GetAncestor(GA_ROOT)` matched
    against the app's webview windows, returning the label + local CSS px. macOS / Linux return
    `None`: tear-off still works (position unknown → default placement), adoption does not.
  - `focus_window(label)`: `unminimize` + `show` + `set_focus` (also serves the "already open
    elsewhere" focus inside `open_repo`).
- **Frontend** (`TabStrip.tsx`, React port of `beginDrag` / `onDragMove` / `onDragEnd` /
  `onDragCancel`): `pointerdown` on a tab captures the pointer on the strip and fetches
  `window_origin` once; `pointermove` past the threshold reorders in place (`reorderTo` splices
  `tabsStore.tabs`) while inside the strip + slack, else marks the drag detached, shows the ghost
  (`position: fixed`, `pointer-events: none`, `transform: translate(clientX − 16, clientY − 14)`)
  and probes `drag_over` with `screenPoint()` = origin + client × scale; `pointerup` detached →
  `drop_tab(…, tearOff: true)`; result `adopted` / `spawned` → `closeTab` (*audit:* it always
  calls `close_repo`; the refcount makes that a no-op once the holder moved, so no
  result-dependent branch); result `none` → tab stays; `pointercancel` / Escape →
  `drag_cancel` + revert to `startIndex`. *Audit:* a secondary window whose **last** tab is
  torn off closes itself only after `spawned` comes back — a failed spawn must not lose the repo.
- **Listeners** (scoped to this window: `listen(evt, h, { target: { kind: "AnyLabel", label } })`):
  `tab-drag-over` → `insertionIndex(x)` → caret; `tab-drag-out` → caret off; `tab-adopt` →
  `openTab(path)` at the caret index (cached handle, so it is instant) + activate;
  `tab-spawn-failed` → toast, tab stays.
- **CSS** (`TabStrip.module.css`, from `base.css:758-895`): `.dragging` opacity .4, `.detached`
  `visibility: hidden` (keeps the slot), `.ghost`, `.caret` 2 px accent bar, `html.dragging-tab *
  { cursor: grabbing }`.
- **Tab payload is only `{ path }`**: the repo's state lives in the backend handle, and the
  window-local slices (selection, commit draft) are dropped on the hop. Carrying the `Snapshot`
  across is a follow-up if it bites (markdown-viewer carries history + scroll; a commit draft is
  the one thing worth carrying here).

### Frontend
- New `src/store/tabsStore.ts`: `tabs: { id, path, name, stale }[]`, `active: RepoId | null`,
  `saved: Record<RepoId, Snapshot>`; `openTab(path)`, `activate(id)`, `closeTab(id)`,
  `markStale(id)`, `detach(id)`, `reorder(from, to)`. `Snapshot` = the three store slices; a
  `snapshot()`/`restore()` pair per store next to its `reset`, so the field list lives with the
  store it belongs to.
- `repoStore.openRepo` no longer closes the previous handle (tabs owns closing); `closeRepo(id)`
  closes only that id. `App.tsx:91` mirrors `tabs` into recents (`touch` per open) and calls
  `set_layout` on every tab change; on launch `take_pending` (secondary window) or `take_layout`
  (main, which also spawns the other windows) opens the tabs in order, active last.
- `statusStore.onChanged` / `repoStore.onProgress`: `p.repoId !== active` → `markStale`. A paused
  walk: the snapshot keeps `rows` + `log` state; on activation call `refreshAll` so the walk
  restarts at the current generation rather than trusting `repo.rs:175`'s cancel flag.
- `RepoWindow.tsx`: `TabStrip` above `Toolbar` when `tabs.length > 1`; `Sidebar` Open items →
  `openTab`; `actions.ts` `switchRepo` → `openTab`, `closeRepo` → `closeTab(active)`; Toolbar
  Repository menu: "Close tab" replaces "Close repository", "Move to new window" added; tab row
  menu: Move to new window · Copy path · Close.
- Start screen: shown when `tabs.length === 0` in the main window.
- Tests: `tabsStore.test.ts` (open twice = one tab, activate restores the snapshot, close last →
  start screen, stale flag on a foreign change, reorder, detach calls `ipc.spawnWindow` then
  closes the tab), `TabStrip.test.tsx` with synthetic pointer events (below threshold = click,
  reorder inside the strip, leaving the strip → ghost + `dragOver` probes, drop → `dropTab` +
  tab removed on `spawned`/`adopted`, kept on `none`, Escape reverts), `recentsStore.test.ts`
  layout migration, Rust `holders` refcount (two labels open, one closes → handle alive; last
  closes → gone; destroyed event → gone; `drop_tab` moves the label without dropping the handle).
  markdown-viewer has no DnD tests; these are new. *Audit:* jsdom has no `setPointerCapture` /
  `releasePointerCapture` — stub both on `Element.prototype` in the test's setup.

### Smoke
- Group **AS**: two repos in tabs, switch keeps selection + commit draft, a terminal commit in the
  background tab shows the stale dot and refreshes on activation, drag-reorder, drag out → new
  window at the cursor, drag from window B into A's strip → caret then adopted at that index
  with no status re-scan (handle kept), Move to new window from the menu, opening that path
  again focuses the window, close last tab of the secondary window closes it, relaunch restores
  both windows and their tabs. Pointer drags over CDP: `page.mouse.move/down/up` with
  `steps` — one `mousemove` per probe interval; WSLg walk only for tear-off (no adoption there).

### Risks
- Snapshot/restore misses a field → a stale panel after switching; the per-store `snapshot()`
  next to `reset` is the guard (one list, one place).
- Two windows, one backend `git2` mutex: a long status scan in window A delays window B's
  reads. Same as today with one window and two repos' events; note, don't fix.
- ~~`tauri-plugin-window-state` restores `w<n>` positions by label …~~ *audit:* wrong — it
  restores on creation, which fights the cursor placement; see the filter in Backend.
- Cross-window adoption is Windows-only (`WindowFromPoint`); macOS / Linux get reorder and
  tear-off, and "Move to new window". Same ceiling as markdown-viewer; no `ponytail:` needed
  beyond the `window_at` stub's comment.
- The Win32 hit-test needs `Win32_UI_WindowsAndMessaging` — *audit:* `windows-sys 0.61` is
  already a `cfg(windows)` dependency of git-core; add the same crate + that feature under
  `src-tauri`'s `[target.'cfg(windows)'.dependencies]`, no new crate (port markdown-viewer's
  calls to `windows-sys` if it uses `windows`).
- Memory: N handles + N watchers + N row arrays per window. No cap.

## 2. Bisect

**Goal.** Start, mark good / bad / skip, and reset from the UI; the banner drives the loop; the
graph shows which commits are marked and which one is under test.

### Decisions
- **D6 — decided: row menu only.** A commit row gets "Bisect: mark good" / "Bisect: mark bad"
  (the first mark runs `bisect start` implicitly, then `bisect good|bad <oid>`); the banner's
  buttons act on HEAD. No start dialog.
- **Decided by default:** banner text "Bisecting — testing `<short>` · N good · M bad" with
  buttons **Good · Bad · Skip · Reset** (all on HEAD; Reset = `bisect reset`, returns to the
  starting branch); graph chips `good` / `bad` / `skip` from `refs/bisect/*` (a new `RefKind`
  `"bisect"`, drawn in the label snapshot like tags); the row under test is HEAD, already
  highlighted. *Audit:* with only a bad mark git has not moved HEAD yet — the banner then reads
  "Bisecting — mark a good commit to begin" with Reset alone enabled (Good on HEAD would mark the
  bad commit good). `bisect run`, custom terms (`--term-old/new`), `bisect log`/`replay`,
  `bisect visualize` are out (add when asked). *Audit:* `bisect start` succeeds on a dirty
  tree; it is the checkout on the first mark that refuses when a dirty file would be
  overwritten — git's message toasts as-is either way.

### Backend
- `cli/ops.rs`: `bisect_start()`, `bisect_mark(term: Good|Bad|Skip, oid: Option<&str>)`
  (`["bisect", "good", "--end-of-options"?, oid]` — `git bisect` is a builtin since 2.30 and takes
  `END`? *audit:* **no** — `git bisect (bad|good) [<rev>]` takes no `--end-of-options` even on
  2.55, so the vector is `["bisect", term, oid]` and the 40-hex oid check at the command boundary
  is the whole guard), `bisect_reset()`; arg-vector tests beside `cherry_pick_and_revert_args`.
- `refs.rs`: `RefsSnapshot` gains `bisect: Option<{ bad: Option<oid>, good: Vec<oid>,
  skip: Vec<oid> }>` read from `refs/bisect/*` (*audit:* the banner reads `refs`, not the grid's
  label map, so the counts live here); `label_snapshot` derives the `RefLabel { kind: Bisect,
  name: "bad"|"good"|"skip" }` chips from the same read; test with `write_ref`.
- `commands/ops.rs`: `bisect_start`, `bisect_mark`, `bisect_reset` via `cli_op` (no conflict
  check); `oid` through `ref_arg`. Register in `lib.rs`.

### Frontend
- `types.ts`: `RefKind += "bisect"` (*audit 2:* `Chip.tsx:21`'s icon map and
  `gitCompletions.ts:136`'s ref kinds are typed on it — add the icon, exclude bisect refs from
  completions); `ipc.ts` three calls; `actions.ts` `bisectMark(term, oid?)`,
  `bisectReset` via `runOp`; `bisectMark` from a row when `state !== "bisect"` runs `start` then
  the mark (two ops, one `runOp`).
- `banners.ts`: the bisect banner gets its four buttons + counts from `refs.bisect` (and the
  "mark a good commit" variant when `good` is empty); `RevisionGrid.tsx` `CommitContextMenu`: two items after Revert; `RefChips`: a chip
  style for `bisect` (good = green, bad = red, skip = grey).
- Tests: `banners.test.ts` (buttons + counts), grid menu test, `RefChips` kind.

### Smoke
- New group **AQ** on `c:/tmp/t4/irebase` (linear history exists): mark bad on HEAD, good five
  back → banner shows the midpoint, Good/Bad narrow it, Skip moves on, chips appear, Reset
  returns to the branch; a dirty tree refuses start; a terminal `git bisect good` refreshes the
  banner (watcher).

## 3. GPG / signing settings

**Goal.** A **Signing** section in Settings over the config keys git already honours, so a user
can turn signing on without a terminal.

### Decisions
- **D7 — decided: global only.** Writes go to `~/.gitconfig` like the tool settings; the section
  shows the effective value with a "set in this repository" hint when the local config overrides
  it. No per-repo UI.
- **D8 — decided:** a **Sign this commit** override in the commit panel (`-S` / `--no-gpg-sign`,
  next to Signed-off-by; unset = config decides) and a **signed** badge in commit details
  (presence only via libgit2 `extract_signature`, no verification). Key picker rejected:
  `user.signingkey` is a text field.
- **Decided by default:** fields `gpg.format` (openpgp · ssh · x509 select), `user.signingkey`
  (text), `commit.gpgsign` + `tag.gpgsign` (checkboxes), `gpg.program` / `gpg.ssh.program`
  (path with the same picker as the tools section, shown for the matching format). No "test
  signature" button: a failing key fails the next commit with git's own message in the toast,
  which is the real test.
- **Audit — decided: annotated tags move to the CLI.** `create_tag` builds them through git2
  (`refs.rs:1008`), which never signs, so `tag.gpgsign` would be a setting the app ignores. New
  `cli/ops.rs::tag_annotated(name, target, message_file)` → `git tag -a -F <file>
  --end-of-options <name> <target>` through the runner (signing and hooks both work);
  lightweight tags stay on git2. `user_identity` is no longer read for tags — git reports a
  missing identity itself.

### Backend
- `config.rs`: `set_global(key, value)` / `unset_global(key)` beside `set_local` — *audit:*
  `tools.rs:69 global_config()` already opens the global file the right way (`open_global`,
  created on the first set, never a multi-level write); move it into `config.rs` and have the
  tools call it, one write path.
- `commands/ops.rs`: `create_tag` with a message runs `tag_annotated` via the runner (message
  through a temp file like `commit`); the lightweight path is unchanged. Arg-vector test.
- `commands/ops.rs` or a new `commands/config.rs`: `get_signing(id) -> SigningConfig` (effective
  values + `local: bool` per key) and `set_signing(key, value | null)` with an allow-list of the
  six keys. `commit_args` gains `sign: Option<bool>` (`-S` / `--no-gpg-sign`), passed through
  `commands/stage.rs:commit`. `CommitDetail` gains `signed: bool` from
  `Repository::extract_signature` (`Ok` = signed, `NotFound` = not).

### Frontend
- `SettingsDialog.tsx`: **Signing** section after the merge tool (`ToolSection` is the model for
  the program path); `ipc.ts` two calls; `types.ts` `SigningConfig`. *Audit:* the "set in this
  repository" hint needs an open repo — hidden on the start screen, where `get_signing` runs
  with no id and returns the global values only.
- `MessageColumn.tsx:163`: **Sign this commit** tri-state next to Signed-off-by (unset / on / off),
  passed to `ipc.commit`. Commit details pane: a `signed` chip beside the author line.
- Tests: `config.rs` global round-trip against a temp `HOME`/`GIT_CONFIG_GLOBAL`;
  `SettingsDialog.test.tsx` renders and writes each field.

### Smoke
- Group **AR**: set format + key + `commit.gpgsign` in Settings → `git config --global --list`
  shows them → a commit on the fixture is signed (`git log --show-signature -1`) → unset →
  next commit unsigned. Wrong key → commit fails with git's message. An annotated tag from the
  Create tag dialog with `tag.gpgsign` on is signed (`git tag -v`). *Audit:* walk with
  `gpg.format = ssh` — Windows 11's OpenSSH signs with `ssh-keygen -Y` and needs no gpg4win;
  `openpgp` only if gpg4win is installed.

## 4. Small features (user-added) — smoke group **AT**, one series

### 4.1 Stash preview

**Today.** A stash row's click calls `revealOid(stash.oid)` (`Sidebar.tsx:483`), but stash
commits are never walked (`refs.rs:799`), so every click ends in the "Not in the current
history" toast. The row menu is Apply · Pop · Drop with nothing to look at first.

**Goal.** Click a stash → the details pane shows what it holds (file list + diffs, untracked files
included) with Apply · Pop · Drop at hand; the full-window Diff dialog inherits it.

**Design — reuse the compare pane's plumbing, add one diff target.**
- **git-core:** `DiffTarget::Stash { oid }` in `diff.rs` `build_diff`: `tree_to_tree(parent0,
  stash)` (tracked changes: index + worktree, which is what `apply` restores) and, when the
  stash commit has a third parent (`stash -u` / `-a`), `tree_to_tree(None, parent2.tree)` merged
  in with `git2::Diff::merge` so its files appear as **Added**. `changed_files`, `patch_for` and
  the per-file diff all route through `build_diff`, so nothing else changes. Test: stash with a
  modified, a staged and an untracked file → three entries, statuses M / M / A; per-file patch
  for the untracked one is one-sided.
- **Types / IPC:** `DiffTarget += { kind: "stash"; oid }` (`types.ts:306`); `Stash` gains
  `baseOid` so the header can name the base commit without a second call. *Audit:*
  `stash_foreach` takes `&mut Repository` (`refs.rs:772`), so `find_commit` cannot run inside
  its callback — collect `(index, message, oid)` first, then a second loop reads `parent_id(0)`
  (and §4.2's `time` / `hasUntracked`).
- **Store:** `repoStore.preview: Stash | null`, set by `previewStash(st)`; cleared by any row
  selection, `compareWith`, `closeRepo`, and by `refreshRefs` when the stash's oid is no longer
  in `refs.stashes` (popped or dropped here or in a terminal). *Audit:* indices shift after a
  drop (`stash@{1}` becomes `stash@{0}`), so `refreshRefs` re-finds the preview **by oid** and
  replaces it with the fresh entry, clearing only when the oid is gone. Mutually exclusive with
  `compare` the way `compare` is with the plain selection.
- **Pane choice (audit 2):** `RepoWindow.tsx:73` swaps the details pane for the commit panel
  while the working-tree row is selected, so a preview set then would show nothing — the rule
  becomes `preview ? <DetailsPane/> : wtSelected ? <CommitPanel/> : <DetailsPane/>`, and
  selecting the working-tree row clears the preview like any other row.
- **Files tab / row menu (audit 2):** the stash commit's tree *is* the working-tree snapshot,
  so the Files tab uses `TreeTarget { kind: "commit", oid: stash.oid }` unchanged, and Blame /
  History / Save as on a previewed file resolve at that oid like any commit. Nothing to special-case.
- **DetailsPane:** target = `preview ? { kind: "stash", oid } : compare ? … : commit`
  (`DetailsPane.tsx:29`); a `StashDetails` header next to `CompareDetails`: `stash@{n}` +
  message, `Kv` "On" = base commit short + summary, `Kv` "Untracked" = count when the third
  parent exists, buttons **Apply · Pop · Drop** (existing `stashApply` / `stashPop` / `stashDrop`,
  same busy guard). `DiffDialog.tsx:9` title `Diff — stash@{n}`. Grid: no row is highlighted
  (there is none); the selected row keeps its selection so Escape / a click returns to it.
- **Sidebar:** row click → `previewStash(st)`; row menu gains **Preview** as the first item;
  the preview row gets the selected tint (`aria-selected`).
- **Tests:** `DetailsPane.test.tsx` (preview renders the header, loads the stash target, buttons
  call the actions; a refs refresh without that stash clears it); `Sidebar.test.tsx` click sets
  `preview`; Rust as above.
- **Smoke:** one row in the small-features group: stash with an untracked file → click → three
  files, the untracked one Added, per-file diffs open, Pop clears the preview and the changes
  reappear in the change list; `git stash drop` in a terminal clears a stale preview.

**Rejected:** driving it through `compare = { from: base, to: stash }` with zero Rust changes.
Same plumbing, but the untracked parent is invisible and the header reads From/To; the
`Stash` target is ~30 lines and makes the preview honest.

### 4.2 Stash browser (GitExtensions-style manager)

**Decided 2026-09-13:** D9 full-window dialog · D10 inline new-stash form at the top ·
D11 **Clear all…** only (no Branch-from-stash, no multi-select).

**Today.** Stashes are reachable three ways — the sidebar section (row menu Apply / Pop / Drop),
the Toolbar Stash menu (Stash changes… / Pop latest / Apply latest / one row per stash → the
per-entry `StashDialog`), and `StashPushDialog`. None shows what a stash holds; §4.1 adds that
to the pane. The browser is that preview with a list beside it and the push form above.

**Design — `StashesDialog`, a full-window `Dialog` in the `DiffDialog` shape, three panels.**
- **Left panel (280 px): the push form + the list.**
  - Form: Message · Include untracked · Keep index · **Stash** button, disabled with no
    changes. The fields move out of `StashPushDialog` into a `StashPushFields` component both
    render, so the dialog and the browser cannot drift (`gitArgs.stashPushArgs` preview line
    kept under the form). Successful push → the new `stash@{0}` becomes the previewed row.
  - List: one row per `refs.stashes` entry — `stash@{n}`, message, age (needs `time` on
    `Stash`, from the stash commit's committer time in `stash_foreach`, `refs.rs:772`), an
    `untracked` dot when a third parent exists (needs `hasUntracked` there too; both are cheap
    `find_commit` reads on a list that is rarely long). Click → `previewStash`; the row is
    `aria-selected` when it is the preview; Up/Down move the preview; Delete = Drop…; the row menu
    is the sidebar's (Apply · Pop · Drop…). Header buttons: **Apply · Pop · Drop…** for the
    previewed row and **Clear all…** (`git stash clear`, new arg builder + `stash_clear` command,
    confirm text "Drop all N stashes? This cannot be undone.", same `DeleteBranchDialog`-style
    confirm). Empty state: "No stashes".
- **Middle + right: `ChangedFileList` + `CommitDiff`**, exactly `DiffDialog.tsx:23-36`, bound
  to the same stores, so they show the preview target and the pane behind the scrim stays in
  sync (parity rule). No preview (list empty) → the file list's existing empty state.
- **Entry points:** Toolbar Stash menu **Manage stashes…** (first item, always enabled), a
  small icon button in the sidebar Stashes `SectionHeader`'s `children` slot (*audit 2:* the
  header's click toggles the section, so the button is the Remotes-style child control,
  `Sidebar.tsx:406`), the §4.1 `StashDetails` header gets **Open browser**, and `Ctrl+Shift+S`.
  Opening with no preview set previews `stash@{0}` (*audit 2*). Closing the dialog leaves the
  preview in the pane (the user was looking at it), Escape closes. The Delete-key Drop is bound
  on the list element only, never while the push form's fields have focus (*audit 2*).
- **Ops:** every button goes through `runOp` with the busy guard; after Pop / Drop / Clear the
  refs refresh removes the row and §4.1's one rule clears the preview. *Audit:* the "move to
  the next entry" behaviour is the **dialog's own effect** (when `preview` becomes null while it
  is open and `stashes` is non-empty, it previews `stashes[min(lastIndex, length − 1)]`), not a
  second store rule — the pane behind it keeps the simple clear.
- **Stash type:** `Stash { index, oid, message, baseOid, time, hasUntracked }` (`types.ts:169`,
  `refs.rs:140`); `label_snapshot` already reads stashes, so no new call.
- **Store / dialogs:** `dialogStore` `{ kind: "stashes" }`; `DialogHost` case; `gitArgs` preview
  for `stash clear`; `previewStash` from §4.1.
- **Tests:** `StashesDialog.test.tsx` (rows from `refs.stashes`, click sets preview, buttons call
  the actions with the previewed index, Clear all confirm → `ipc.stashClear`, Delete key →
  Drop confirm, push form disabled at zero changes); `StashPushDialog` test keeps passing
  through the shared fields; Rust `stash_clear` arg vector; `Stash.time` / `hasUntracked` in
  the `refs.rs` stash test.
- **Smoke:** rows in the small-features group: three stashes (one with `-u`) → browser lists
  them with ages and the untracked dot → click each → files + diffs → Apply keeps it, Pop
  removes it and the preview moves to the next → Clear all… names the count and empties the list
  → the form stashes with keep-index and the new row is previewed.

**Rejected:** a `git stash list` CLI parse for the list (git2's `stash_foreach` plus one
`find_commit` per entry gives the same fields with no runner round-trip), and keeping the push
form as a button (GitExtensions' inline form is what was asked for, and the fields already
exist).

### 4.3 Sidebar: section defaults and header contrast

**Decided 2026-09-13.**
- **Defaults:** Stashes collapsed like Tags; Local, Remotes, Worktrees, Submodules open. One
  literal: `stashes: true` → `false` in `Sidebar.tsx:163` (the state is per session, not
  persisted — unchanged). `Sidebar.test.tsx`: a stash row is not rendered until the header is
  clicked.
- **Headers — "band + sticky".** Cause: `SectionHeader.module.css` draws the header as
  `--fg-muted` text on a transparent background, so it is *lighter* than the rows it heads.
  Change, CSS only, in that file (the component has no other user than the sidebar):
  `background: var(--bg-panel)` (lighter than the sidebar's `--bg-app` in both themes),
  `border-top: 1px solid var(--border)`, `color: var(--fg)` (the chevron `.tw` too),
  `position: sticky; top: 0; z-index: 1`. Sticky works as-is: every header is a direct child of
  the `.sidebar` scroller (`overflow: auto`, `Sidebar.module.css:13`), nothing in between
  clips. The hover rule keeps `--bg-hover`; focus ring unchanged. First header: `border-top`
  on all of them is fine against the sidebar's 4 px top padding.
- **Smoke:** one row: scroll a long branch list → the Local header stays pinned; theme toggle
  → band visible in dark too.

### 4.4 Sidebar: folder rows — coloured icon, bold, count

**Decided 2026-09-13** ("coloured folder icon + bold"; guides rejected for now).

**Today.** A folder row is a leaf row with `Folder` for its icon (`Sidebar.tsx:364`), both
drawn in `--fg-muted`; nothing else differs, so `feature/` reads like a branch named feature.

**Design — one `folder` prop on `TreeRow`, so every tree draws folders the same way.**
- `TreeRow` gains `folder?: boolean`: the icon slot renders `FolderOpen` when `expanded`, else
  `Folder`, both `fill="currentColor"` with `fill-opacity` .25 and a new `.folder` class on the
  row: icon `color: var(--folder-fg)`, label `font-weight: var(--weight-semibold)`. Hover /
  selected keep their current icon rule (`--fg`) — the folder colour is the resting state.
- Token `--folder-fg` in `tokens.css`, both themes, next to the chip colours: light `#8a5a06`
  (the tag chip's amber, ≥4.5:1 on `--bg-app`), dark `#f0c060`. Not `--warning`: a folder is not
  a warning, and the two must be free to drift.
- **Count (sidebar only):** the folder row passes `meta={counts.get(key)}` — `trees.counts`
  (`Sidebar.tsx:219-232`) already holds every folder's ref count for the auto-collapse rule, so
  it is a lookup, drawn muted and right-aligned like the other `meta` slots. File trees get no
  count.
- **Where the styling applies (decided: file lists too):** the sidebar (local / remote / tag
  folders), the Files tab and Changes tree mode (`ChangedFileList.tsx`), and the commit panel's
  tree mode (`FilesColumn.tsx`) — the three `TreeRow` trees with folders — by passing `folder`
  where each already passes the `Folder` icon. One look for every folder in the app.
- **Tests:** `TreeRow.test.tsx` renders `folder` with the class and the open/closed icon;
  `Sidebar.test.tsx` a folder row shows its count; one `ChangedFileList` / `FilesColumn`
  assertion each that a folder line renders with the `folder` class.
- **Smoke:** one row: sidebar folders amber + bold with counts, open one → open-folder icon;
  Files tab and tree-mode change list folders match the look; dark theme.

## 5. Verification, per series
```
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npx tsc --noEmit -p tsconfig.json
npm test -- --run
```
Then the CDP walk (`docs/smoke/smoke-cdp.md`) of the series' group, a `/code-review` pass folded
into the series' commits, and Linux gates in WSL for anything touching `config.rs` (HOME paths).
Docs per series: `open-items.md` §C strike-through + Shipped bullet, `README.md` one sentence,
smoke group in `smoke-test-post-v1.md`.
