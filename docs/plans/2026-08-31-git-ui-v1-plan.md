# Plan: GitExtensions clone in Rust (Tauri 2) — "t4-git-ui"

_Reviewed 2026-08-31 (2 passes)._

## Context
- Goal: cross-platform (Win/macOS/Linux) GitExtensions-style git GUI w/ modern/sleek UX.
- `F:\src\_ pet projects\t4-git-ui` — git repo initialized (`main`), contains only this plan (note: path has spaces → quote in shell).
- Toolchain: Rust 1.98, tauri-cli 2.11.4, tauri 2.11.5, git2 0.21, Node 24/npm, git 2.55. No cmake (not needed — libgit2-sys builds via `cc`). GitExtensions at `C:\Program Files\GitExtensions` → parity reference.
- Decisions (user-confirmed):
  - UI: Tauri 2 + **React 19 + TS + Vite** (best dense-app lib ecosystem; mockup→JSX handoff)
  - Git: `git2` (libgit2, `default-features=false, features=["vendored-libgit2"]`) for reads + index path ops; system `git` CLI for network/hooks/merge/rebase/`apply --cached`
  - v1 scope: main window (graph/details/diff), commit panel (file+hunk+line staging, amend, msg history), branch/remote ops w/ streaming output, start screen (recent/open/clone/init)
  - Workflow: design system → screen designs → frontend implementation follows approved look
- Decided during review (simplest v1):
  - Single window, one repo open at a time; switch via start screen / recents menu (state keyed by `RepoId` so tabs can come later)
  - Native OS titlebar in v1 (custom titlebar = per-OS drag/controls work; revisit in M6)
  - Git executable: probe `git --version` at startup; configurable path in prefs; startup error screen if missing
  - Fonts: **bundle** Inter + JetBrains Mono woff2 in `src/assets/fonts` (Google Fonts won't load offline in webview); fallback stacks: `Inter, "Segoe UI", -apple-system, system-ui, Cantarell, sans-serif` / `"JetBrains Mono", "Cascadia Code", Menlo, "DejaVu Sans Mono", monospace`
  - Multi-select in file lists (Shift/Ctrl click) → `stage_paths(Vec)`; list-row selection states in A1
  - Design canvases: save `.dc.html` sources in `docs/design/canvases/` (versioned) in addition to the Artifact

### Out of scope for v1 (explicit)
Interactive rebase, blame, file history, submodules, worktrees, bisect, cherry-pick/revert UI, GPG config UI, plugins, multi-repo tabs, i18n.

## Phase A — Design system + screen designs (Claude Design `design` skill)

Two-step: build the **design system first**, then design screens *using only* the system. Afterwards, any new feature needs just a wireframe + the style guide — no bespoke visual design.

### A1. Design system / style guide (canvas 1)
- Fix metrics up front so design == code: row height 26px, lane width 13px, 8 graph colors, bundled font stacks (above).
- Scope control: light + dark as two columns on one artboard; full state matrix only for interactive components (button, icon button, input, list/tree row, tabs, chip, menu item); one-offs (empty state, spinner, toast) single state.
- Artboards:
  1. **Foundations** — color tokens (bg/fg/border/accent/semantic), type scale, spacing scale (4px base), radii, shadows, focus ring, density rules (row heights, padding), **scrollbar style** (thin overlay `::-webkit-scrollbar`; note WebView2 vs WebKitGTK/WebKit differences)
  2. **Domain tokens** — graph lane palette (8), diff add/del/hunk colors, ref chip styles (local/remote/tag/HEAD/stash), file status glyph colors (A/M/D/R/U/conflict)
  3. **Components** — button (primary/secondary/ghost/danger), icon button, toolbar, input/search, select, checkbox, tabs, list row (single + multi-select), tree row, table header, ref chip, badge, tooltip, context menu, dialog shell, panel header, split handle, status bar, toast/banner, progress/spinner, empty state
  4. **Patterns** — sidebar section, virtualized list/grid row anatomy, **graph anatomy** (node shape/size, merge curve style, line width, working-tree node, HEAD marker, selected-row lane highlight), diff line anatomy (gutter/no./content), hunk header w/ actions, output dock, dialog layout (title/body/footer buttons), keyboard shortcut hint
- Deliverables:
  - Canvas (editable by user) + source saved to `docs/design/canvases/design-system.dc.html`
  - `docs/design/style-guide.md` — written rules: **token names + values (source of truth)**, component usage/do-don't, density/spacing, iconography (lucide, 16px in rows / 18px toolbar), motion (≤150ms, ease-out), a11y (contrast ≥4.5:1, focus visible)
  - Component names in guide == React component names in `src/components/ui/*` (created at M1-UI; `src/theme/tokens.css` transcribed 1:1 from the guide at M0)
- **Gate A1**: user approves system before screens are drawn.

### A2. Screen designs (canvas 2) — composed strictly from A1 components
- Artboards (light + dark):
  1. **Start screen** — recent repos (search/pin), Open / Clone / Init; git-missing error state
  2. **Main window** — toolbar (Fetch/Pull/Push/Branch/Stash/Commit, search, branch filter), left sidebar (Local/Remotes/Tags/Stashes trees), revision grid w/ lane graph + ref chips + "working tree" pseudo-row, bottom pane: commit details | changed files | diff (unified + side-by-side)
  3. **Commit panel** — unstaged/staged lists, hunk diff w/ Stage/Unstage/Discard + line selection, message editor (history, amend, Commit / Commit & Push)
  4. **Ops dialogs + output dock** — checkout/create branch, merge, rebase, push, pull, stash; bottom streaming-output panel w/ cancel
  5. **States** — empty repo (no commits), detached HEAD, merge/rebase-in-progress banner, conflict banner, loading large repo, error toast
- Canvas: https://claude.ai/code/artifact/2e1cc7fb-d31b-4b6a-893d-b7598fdc85f5 (page 1 light, page 2 dark). Sources: `docs/design/canvases/build/parts-screens/*.mjs` + shared chrome `build/screens.mjs` → `docs/design/canvases/screens/*.dc.html`. Rebuild: `node docs/design/canvases/build/build.mjs screens`.
- Any deviation from A1 found while drawing screens → fix the system, not the screen.
- **Gate A2**: user approves screens before frontend UI work (M1-UI onward). Backend work (M0 = zero UI beyond template, git-core for M1–M4) does NOT wait — runs in parallel.

### Future features (post-v1 process)
- Wireframe only (boxes + labels, or text description) → implement w/ `src/components/ui/*` per `docs/design/style-guide.md`. No new canvas unless a new component/pattern is needed → add it to A1 first.

## Phase B — Implementation

### Repo layout (Cargo workspace)
```
Cargo.toml                 [workspace] members = ["crates/git-core","src-tauri"], resolver="2"
package.json, vite.config.ts, index.html
crates/git-core/           pure Rust, no Tauri; cargo test w/ temp repos
src-tauri/                 thin IPC glue: commands/, state.rs, watcher.rs, error.rs, capabilities/default.json
src/                       React frontend
docs/plans/                this file
docs/design/style-guide.md design system rules (from A1)
docs/design/canvases/      .dc.html canvas sources
```
Scaffold: `npm create tauri-app@latest` (react-ts template) → add workspace root + `crates/git-core` → `git-core = { path = "../crates/git-core" }` in `src-tauri/Cargo.toml` → `.gitignore` (template's + `target/`, `node_modules/`, `dist/`) → commit `Cargo.lock`.

### git-core modules
- `error.rs` — `GitError` (thiserror): Git2 | Io | Cli{cmd,code,stderr} | NotARepo | GitNotFound | IndexLocked | Cancelled | Conflicts(paths) | InvalidPatch; serializes `{kind,message}`
- `repo.rs` — `RepoHandle { id, path, git2: Mutex<Repository>, op_lock: tokio Mutex, log: RwLock<LogCache> }`; `Repository::discover`; git2 `Repository` is Send not Sync → Mutex, short borrows only. **Long-running walks open their own `Repository` handle** (cheap) so they never hold the shared mutex.
- `log/walker.rs` — Revwalk TOPOLOGICAL|TIME on a private `Repository`; all-branches = `push_head()` + `push_glob("refs/heads/*")` + `refs/remotes/*` + `refs/tags/*` (exclude `refs/stash`, `refs/notes`); current-branch = `push_head()` only. `push_head()` always → detached HEAD / rebase state visible.
- `log/graph.rs` — **lane layout** (gitk-style single pass): `columns: Vec<{expecting: Oid, color}>`; per commit: find cols expecting it (none → new tip col), merge extra cols into first (`MergeInto` lines); for parent[0]: if another col already expects it → emit line to that col and drop this lane (eager dedupe, keeps graph narrow), else replace expectation; extra parents → line to existing col or new col inserted after; emit `GraphRow { oid, lane, color, lines[{from,to,color,kind}], pass_through }`. O(rows×lanes). **Rows carry no ref labels** — labels attached at page time from current refs snapshot so ref changes don't invalidate the cache.
- `log/cache.rs` — bg task fills `LogCache` in 1000-row chunks; `generation` bumps on new walk (new HEAD/refs topology, filter change)
- `status.rs` — git2 StatusOptions (untracked recurse, renames); fallback `git status --porcelain=v2 -z` behind flag if slow on big trees
- `diff.rs` — `FileDiff { path, old_path, status, binary, hunks[{header, old/new start+len, lines[{kind, old_no, new_no, text}]}] }`. Two sources:
  - **Display** (commits): git2 `diff_tree_to_tree` (+`find_similar` for renames)
  - **Stage-able** (workdir/index): parse CLI `git diff [--cached] -z --no-color -c core.quotepath=false -- <path>` (content already passed through autocrlf/clean filters → patches round-trip into `git apply --cached` on Windows). Untracked: git2 `diff_index_to_workdir` w/ `include_untracked` + `show_untracked_content` for display only.
  - line cap + `truncated`
- `patch.rs` — build patch from selected hunks/lines of a stage-able `FileDiff` (recompute `@@` counts; unselected `+` dropped, unselected `-` → context); `reverse()` for unstage. **Untracked files: whole-file stage only** (no base to patch against).
- `stage.rs` — path stage/unstage via git2 Index (`add_path`/`reset_default`); hunk/line via CLI `git apply --cached [-R] --whitespace=nowarn -` (stdin); **discard unstaged** = `checkout_index` for paths (workdir ← index, keeps staged); "discard all incl. staged" = `checkout_head` force, separate confirm; untracked discard = delete file, confirm dialog
- `refs.rs` — branches (upstream, ahead/behind via `graph_ahead_behind`, is_head, detached flag), remotes, tags, stashes (`stash_foreach`, needs `&mut`); `label_map: HashMap<Oid, Vec<RefLabel>>`; repo state (`repository.state()` → merge/rebase/cherry-pick in progress)
- `commit.rs` — CLI `git commit -F <tmp> [--amend]` (hooks + GPG work; libgit2 runs no hooks); amend prefills HEAD message. `commit.gpgsign=true` + tty pinentry can hang → detect config, run w/ timeout, surface "signing needs GUI pinentry" error.
- `cli/runner.rs` — tokio::process; stdout+stderr concurrent, split on `\n` and `\r` (`\r` → progress kind); env `GIT_TERMINAL_PROMPT=0 LC_ALL=C.UTF-8 GIT_FLUSH=1`, args `-c core.quotepath=false`, prefer `-z` for path output; stdin null unless patch; Windows `creation_flags(CREATE_NO_WINDOW)`; `CancellationToken` → **kill process tree** (Windows: Job Object via `win32job` crate, assign child on spawn; Unix: `process_group(0)` + `killpg`) so `git-remote-https`/`ssh` die too; git path from config
- `cli/ops.rs` — fetch/pull/push/merge/rebase(+continue/abort)/checkout/branch/tag/stash/clone arg builders + result parsers; conflicts detected by exit code + status conflicted entries
- `config.rs` — user.name/email, `core.longpaths` detection, `commit.gpgsign`, git exe probe (`git --version`)
- `watch.rs` — notify + debouncer-full 250ms; watch `.git/{HEAD,refs,packed-refs,index,logs}` + workdir; workdir watch **skips ignored dirs** (walk top-level dirs, check `is_path_ignored`) to stay under Linux `max_user_watches`; on watch error → degrade to `.git`-only + manual refresh, surface toast; ignore `.git/objects`, `*.lock`; classify Workdir|Index|Refs; suppressed while `op_lock` held, one synthetic change emitted after op; `Rescan` → full refresh
- `test_util.rs` — TempRepo builder (init/write/add/commit/branch/merge via git2); tests needing system git skip at runtime if not found
- Deps: git2, thiserror, serde, tokio, tokio-util, notify, notify-debouncer-full, tracing, tracing-appender, parking_lot; win: win32job; dev: tempfile

### Tauri IPC
- `AppState { repos: RwLock<HashMap<RepoId, Arc<RepoHandle>>>, ops: Mutex<HashMap<OpId, CancellationToken>>, watchers, git_path }`; mutating cmds take `op_lock`; short reads via `spawn_blocking` on shared handle; walks on private handle
- Commands (async, `Result<T, AppError>`):
  - app: `probe_git`, `get_prefs/set_prefs`, `list_recent_repos`, `open_repo(path)`, `close_repo`, `init_repo`, `clone_repo(url, dest, Channel<CliEvent>)`
  - log: `start_log(id, spec, filter?) → generation`, `get_log_page(id, gen, offset, limit) → {rows (w/ labels), total, complete}`, `get_commit`, `get_commit_files`, `get_file_diff(id, target, path)`
  - stage: `get_status` (incl. repo state), `stage_paths(Vec)`, `unstage_paths(Vec)`, `stage_hunk`, `stage_lines`, `discard_changes(Vec, mode)`, `commit`, `get_message_history`
  - refs: `get_refs`, `checkout`, `create_branch`, `delete_branch`, `rename_branch`, `create_tag`, `delete_tag`, `stash_push/apply/pop/drop`
  - streaming (`Channel<CliEvent>` = started{op_id}|stdout|stderr|progress|exit): `fetch`, `pull`, `push`, `merge`, `rebase`, `rebase_continue/abort`, `merge_abort`; `cancel_op(op_id)`
- Events: `repo://changed {repoId, kinds}`, `log://progress {gen,total,complete}` (throttled per chunk), `op://state`
- Errors: every `AppError` from `invoke` → `api/ipc.ts` wrapper → `appStore.notify({kind, message})` → toast; ops errors also land in output dock
- Logging: `tracing` → stderr in dev, rolling file in app-data dir in release (`tracing-appender`); "Open log folder" in prefs
- Plugins: dialog, store (recents/msg history/prefs), window-state, opener, clipboard-manager. Every plugin call needs an entry in `capabilities/default.json`.
- `tauri.conf.json`: `windows[0].backgroundColor` = dark/light app bg + `<meta name="color-scheme">` → no white flash on dark launch

### Frontend
- Libs: `@tanstack/react-virtual`, `react-resizable-panels`, `@radix-ui/react-*` (menu/dialog/tooltip), `zustand`, `lucide-react`, CSS Modules + `tokens.css` (`[data-theme]` light/dark, init from `matchMedia`, persisted)
- Diff viewer: **custom renderer** from `FileDiff` hunks (not CodeMirror merge — need git hunk boundaries + virtualization + stage buttons); side-by-side pairs `-`/`+` runs; syntax highlight in M6 via `@lezer/highlight`
- Graph: per-visible-row `<canvas>` drawn from `GraphRow` per A1 graph-anatomy spec; rows `memo`'d; selection via store selectors so rows don't rerender
- Tree:
  ```
  src/
    App.tsx → GitMissingScreen | StartScreen | RepoWindow
    api/{ipc.ts, events.ts, types.ts}   store/{appStore, repoStore}   theme/{tokens.css, reset.css, fonts.css}   assets/fonts/*.woff2
    components/ui/*   — one component per A1 style-guide entry (Button, IconButton, Input, Chip, ListRow, TreeRow, Dialog, Menu, Tooltip, Toast, …)
    screens/StartScreen/*, screens/GitMissingScreen.tsx
    screens/RepoWindow/ Toolbar, Sidebar, RevisionGrid{GraphCell, RefLabels}, DetailsPane{CommitDetails, ChangedFileList, DiffViewer},
                        CommitPanel, OutputPanel, Dialogs/*, StatusBar, StateBanner
  ```

### Milestones → verify
- **M0 Scaffold** — workspace, template, `.gitignore`, `probe_git` + `ping` cmds, dialog plugin + capability, tracing setup, `tokens.css` + bundled fonts from A1 (if approved; else placeholder), window bg color. Verify: `cargo build` (vendored libgit2 on MSVC, ~1–2 min), `cargo test -p git-core`, `npm run build`, `cargo tauri dev` shows window + git version, no white flash in dark mode.
- **M1 Open + log grid + graph** — backend: repo/log/graph/refs; UI (after Gate A2): `components/ui` skeleton, RevisionGrid, read-only sidebar. Verify: snapshot tests for linear / branch+merge / octopus / orphan / detached-HEAD topologies; walk `git/git` clone (~80k commits) <2s while `get_status` stays responsive; 60fps scroll; labels on right commits; labels update on branch change w/o re-walk.
  - _M1-UI done (2026-08-31)_: bundled Inter + JetBrains Mono variable woff2 (`src/assets/fonts`, `src/theme/fonts.css`); `src/api/{types,ipc,events}.ts` mirror the Rust contract; `src/store/repoStore.ts` (zustand; 500-row pages, in-flight dedupe, stale-generation drop/restart, `log://progress`); `src/components/ui/*` ported 1:1 from `build/base.css` as CSS Modules (Button, IconButton, ToolbarButton, Chip w/ synced `.rem` segment, Badge, Input/Select, PanelHeader, SectionHeader, TreeRow + AheadBehind, StatusBar, Spinner, Progress, EmptyState, Banner); screens: StartScreen (Open repository… only; recents/clone/init → M5), GitMissingScreen, RepoWindow (Toolbar w/ disabled ops + debounced search + All/HEAD filter, Sidebar tree, virtualized RevisionGrid with per-row `<canvas>` lane graph + chips-first rows + keyboard selection, DetailsPane w/ commit details + M2 placeholders, collapsed OutputDock, StatusBar). `App.tsx` reopens `localStorage.lastRepo`. `npm test` (vitest): relativeDate, store paging, graph geometry, chips-order render test. Remaining M1 verify items (perf on `git/git`, topology snapshots) are backend-side.
- **M2 Details + diff** — diff.rs (both sources), DetailsPane, DiffViewer unified+split, resizable. Verify: tests vs `git diff --numstat/-p` (add/del/rename/binary/CRLF/untracked); 30k-line diff virtualized; truncation.
  - _M2-UI done (2026-08-31)_: `src/api/{types,ipc}.ts` + diff.rs/status.rs types and `getCommitFiles/getChangedFiles/getFileDiff/getStatus`; `src/store/diffStore.ts` (files → first file selected → `get_file_diff {kind:'commit'}`, context 3, seq-based stale drop, `diffView`/`fileListMode` in localStorage, whitespace toggle); `components/ui/StatusGlyph`; `ChangedFileList` (listbox, ↑/↓/Home/End, flat + tree modes, start-ellipsis paths, `old → new`, `+N −M`); `DiffViewer` (unified + split via `diffRows.ts` del/add run zipping, `@tanstack/react-virtual` over fixed 20/24px rows, horizontal scroll sized by widest line, CR → `␍`, no-newline marker, binary / truncated / empty / error states, thin Progress while loading); `DetailsPane` = resizable `Commit | Files | Diff` panels. Tests: split pairing, unified flatten, 30k-line flatten < 50 ms + virtual window (< 120 DOM rows), file tree, store (selection reset on commit change, stale files/diff ignored, persistence), ChangedFileList render, DiffViewer render. Not in M2-UI: workdir/staged targets in the pane (store takes commits only), word-level highlight, line selection (M3).
- **M3 Stage/commit** — status/patch/stage/commit, CLI runner, CommitPanel, multi-select, history, amend. Verify: tests stage path/hunk/line-subset/reverse then assert `git diff --cached` — **incl. `core.autocrlf=true` repo w/ CRLF file**; discard unstaged keeps staged hunk; untracked → whole-file only; failing pre-commit hook surfaces as toast; amend prefills + rewrites HEAD; watcher refresh on external edit; watcher degrades gracefully on a repo w/ 50k ignored dirs.
  - _M3-UI done (2026-08-31)_: `api/{types,ipc,events}.ts` + stage.rs/watch.rs/runner.rs types (`ChangeKind`, `RepoChanged`, `CliEvent`, `OpEvent`, `Author`, `config` error kind) and `stagePaths/unstagePaths/discardPaths/stageHunks/stageLines/commit/getHeadMessage/getAuthor/cancelOp`, `onRepoChanged/onOpEvent`; stores: `statusStore` (100 ms debounce, seq-guarded, `refs` → refreshRefs + refreshLabels | startLog when HEAD moved), `commitStore` (list selection + anchor, diff w/ backend-matching options, editor, stage/unstage/discard/hunk/lines/commit, amend prefill, message history), `opsStore` (50 ops × 5000 lines, progress redraw, cancel), `toastStore` (+ `toastError`: cli → first stderr line, indexLocked → Retry); `repoStore.wtSelected/selectWorkingTree/refreshLabels`; UI: `Checkbox`, `Menu`, `Toast/ToastStack`; `RevisionGrid` working-tree pseudo-row (dashed node, italic subject, index 0, keyboard model intact, hidden under a text filter); Toolbar Commit button w/ change count; `CommitPanel` (Files 320 | Diff | Message 340) — multi-select listboxes, Stage all / Unstage all, hover + Enter + double-click + Delete (native confirm) actions, conflicted rows blocked; `DiffViewer` actions mode (props-based now; hunk buttons on hover, add/del line selection w/ Shift range / Ctrl toggle, sticky bar, untracked = whole file, forced unified / no whitespace so indices match the backend); message editor w/ 72 counter, Amend (prefill from HEAD unless edited), Signed-off-by, author line / config warning, Ctrl+Enter, history menu (localStorage, 20); `OutputDock` real (collapsed status line, 200px log, Cancel); statusbar `N unstaged · M staged`. Tests (60 total): statusStore (other repo ignored, debounce, stale drop, refs/HEAD handling, clean tree clears wt selection), multiSelect, lineSelection, msgHistory, opsStore, CommitPanel render (lists/glyphs/conflicts, Stage all args, multi-select, Commit disabled rules, counter danger, amend header), DiffViewer actions mode + untracked, RevisionGrid wt row + arrows. Not in M3-UI: hunk-/line-level **Discard** (needs a backend reverse-apply-to-workdir command; only `discard_paths` exists — the disabled buttons were removed in the review pass, see Known gaps), drag line selection, Commit & Push (M4), context menus (M6).
- **M4 Branch ops + streaming** — cli/ops, Channel cmds, cancel, OutputPanel, dialogs, conflicts, StateBanner. Verify: fetch from local bare remote streams incrementally (`\r` progress); cancel kills **whole tree** <100ms (test: spawn `git` that spawns a sleeping helper via `credential.helper`); ops serialized; merge conflict → `Conflicts` + conflicted files + banner; push updates ahead/behind.
  - _M4-UI done (2026-08-31)_: `api/types.ts` + ops.rs types (`PullMode`, `FfMode`, `OpFailure`, `OpResult`, `refused` / `busy` error kinds, `OpEvent.repoId` nullable) and `api/ipc.ts` wrappers for every op command (`fetch/pull/push/merge/rebase/rebaseContinue/rebaseAbort/mergeAbort/checkout/stashPush/stashApply/stashPop/stashDrop/deleteRemoteBranch/createBranch/deleteBranch/renameBranch/createTag/deleteTag/getConfig/setConfig/getDefaultRemote`); `opsStore.busy` + `selectRunning` + **`runOp(busy, fn, {success, onRefused})`** — the single entry point for every op: busy guard (info toast), `OpResult.failure` → toast (conflicts → “N conflicts — resolve in the commit panel” + selects the wt row; nonFastForward → “Rejected … Pull first” w/ a Pull action; authFailed; rejected/other → message), `refused` → caller (force delete), `cancelled` → info, then status + `syncRefs` (relabel or restart the walk); `dialogStore` (one dialog at a time) + `components/ui/Dialog` (`Dialog` 440 / `.wide` 560 over `--scrim`, portal, title + close, body, footer w/ “Runs `git …`” preview, Esc closes, Enter submits, Tab trapped, focus restored, `aria-modal`; `Field` / `FieldRow` / `Options` / `DialogText` / `Mono`); `Menu` gained `ContextMenu` (portal at a viewport point, clamped) + `align` + `kbd` hints; dialogs (`screens/RepoWindow/dialogs/`): Push (wide, remote + read-only branch, Set upstream default = no upstream, Force with lease, Push tags), Pull (remote + Merge/Rebase/Fast-forward-only, default from `pull.rebase`), Fetch (remote or All remotes, Prune, Tags), Merge (branch, strategy Select, Squash, message), Rebase (onto + already-pushed warning), Checkout (searchable ref picker, ↑/↓ + Enter), Create branch (validated name, start point, checkout-after-create, Track remote), Rename / Delete branch (danger; `refused` re-shows as Force delete), Delete remote branch, Create / Delete tag, Stash changes, stash Apply/Pop/Drop; `lib/branchName.ts` (`validateRefName`), `dialogs/gitArgs.ts` (mirrors `cli/ops.rs` for the preview line), `RepoWindow/actions.ts` (fetch/checkout/stash/copy/refresh helpers), `RepoWindow/banners.ts` (pure refs+status → banners); Toolbar wired (Fetch runs `fetch{prune}` on the default remote, Pull/Push dialogs w/ ahead/behind counts, Branch + Stash menus, everything disabled w/ “Operation in progress” while an op runs); Sidebar context menus (right-click / Shift+F10) for local + remote branches, tags, stashes, double-click checks out; commit-row menu in `RevisionGrid` (checkout detached, branch/tag here, copy SHA); stacked banners above the grid (detached HEAD w/ Checkout <default> / Create branch…, merge w/ Abort / Commit merge, rebase w/ Abort / Continue, conflicts w/ Open commit panel); statusbar spinner + busy text; shortcuts (`useShortcuts`: Ctrl+Shift+U push, Ctrl+Shift+L pull, Ctrl+B create branch, Ctrl+F5 fetch, F5 refresh, Ctrl+` dock — ignored in inputs / while a dialog is open); empty-repo `EmptyState` per States.mjs; Commit & Push enabled (commit → Push dialog). Tests (93 total, +33): `runOp` failure mapping / busy guard / refused / success, opsStore progress redraw, branch-name validation, Dialog (Esc + focus restore, Enter submit, Tab wrap), Push preview combinations + args, Merge args, `gitArgs` builders, banner selection. Not in M4-UI: an in-dialog output dock (ops stream to the shared `OutputDock` instead), interactive rebase, cherry-pick / revert banners' own actions.
- **M5 Start screen** — recents (store plugin), clone w/ progress, init, git-missing screen. Verify: clone small public repo → opens; init → empty-repo state; recents persist across restart.
  - _M5-UI done (2026-08-31)_: `src/api/appIpc.ts` (`cloneRepo` / `initRepo`); `src/lib/kv.ts` (store plugin `recents.json`, falls back to `localStorage` outside Tauri) + `src/lib/cloneUrl.ts` (pure `repoNameFromUrl` / `joinPath` / `parentDir`); `src/store/recentsStore.ts` (`RecentRepo{path,name,lastOpened,pinned}`, pinned-first sort, 20 unpinned cap, case-insensitive filter, `lastOpen` / `lastCloneDir`, one-time migration of `localStorage.lastRepo`); `StartScreen` rebuilt to `Start.mjs` (header + settings icon, 560px recents column w/ filter input, 44px rows, pin toggle, hint line, keyboard ↑/↓/Home/End/Enter/Delete on `role="listbox"`, empty state, three 56px action cards w/ kbd + Ctrl+O / Ctrl+Shift+O / Ctrl+N, statusbar `git <version>` … `N recent`, toast + "Remove from list" for a recent that no longer opens); local `Dialog` + `CloneDialog` (560px: URL → derived folder name, parent folder picker persisted as `lastCloneDir`, recurse-submodules / shallow checkboxes, footer command preview, progress mode = `op://event` line + indeterminate `Progress` + Cancel → `cancel_op`, failure → danger banner keeping the inputs); `GitMissingScreen` message reworded (git ≥ 2.20 on PATH); `App.tsx` startup = probe → `recents.load()` → reopen `lastOpen` → StartScreen, `repoStore` subscription does `touch` + `setLastOpen`, `Ctrl+Shift+W` closes the repo. Tests (12): recentsStore sort/cap/filter/migration/persist-fallback, clone URL + path helpers, StartScreen render/Enter/filter/Delete + clone dialog progress. Not in M5-UI: "Locate git…" (no `set_git_path` backend command), reveal-in-folder, settings dialog (→ post-v1, see Known gaps).
- **M6 Polish/packaging** — verify UI vs A1/A2 canvases, shortcuts, syntax highlight, context menus, `cargo tauri icon`, `cargo tauri build` (NSIS), GH Actions matrix (ubuntu needs `libwebkit2gtk-4.1-dev`). Verify: installer on clean Win11; Linux + macOS smoke via CI.
  - _M6 done (2026-08-31)_: **icon** — `src-tauri/icons/app-icon.svg` (lucide git-branch: trunk + node in `#e6e8ec`, branch arc + node in `--accent #2f6feb`, on `--bg-app` dark `#16181d`, radius 22%) rasterized to `app-icon.png` (1024², 34 KB) → `npm run tauri icon` regenerated `icons/*` (`.ico`, `.icns`, PNG set); **syntax highlighting** — `src/lib/highlight.ts` (`@lezer/highlight` + per-language grammars for JS/TS/JSX/TSX, Rust, CSS, JSON, HTML, Python, code-split and loaded on first use; one line parsed at a time, spans cached in a 5k LRU) wired into both `DiffViewer` views per rendered row (`useMemo` in `LineText`, so the 30k-line diff stays virtual-only); `--syn-*` tokens in both themes audited ≥4.5:1 on panel + add/del tints (`contrast.mjs`, 99 pairs); **release** — root `[profile.release]` (`opt-level 3`, `lto thin`, `codegen-units 1`, `strip`; no `panic=abort`, git-core uses `catch_unwind`), `npm run tauri build` → NSIS + MSI under `target/release/bundle/`; `windows.webviewInstallMode` left at the default `downloadBootstrapper`; **CI** — `.github/workflows/ci.yml` (ubuntu / windows / macos: fmt, clippy `-D warnings`, `cargo test -p git-core`, tsc, vitest, vite build) + `release.yml` (`v*` tags → `tauri-apps/tauri-action`, draft release, Linux/Windows/macOS arm64+x64); **theme flash** — `index.html` sets `data-theme` from `localStorage` / `prefers-color-scheme` in an inline script before any CSS, with a fallback body background matching the window `backgroundColor` (`#16181d`); **README** rewritten (features, install, build, shortcuts, roadmap).
  - _M6 not done_: UI-vs-canvas review pass (separate review agent), custom titlebar (stays native), installer test on a clean Win11 machine, macOS signing / notarization, Linux + macOS smoke are CI-build-only (no screenshot check of WebKitGTK rendering).
- Recurring: `cargo test -p git-core`, `cargo clippy --workspace`, `npx tsc --noEmit`, `npm run build`, `cargo tauri dev`.

### Post-v1 review passes (2026-08-31)
Two integrated reviews after M6 — the frontend had been written by five agents in sequence with no cross-check. 30 findings, all fixed (`87d014d` high/medium, `dbd8bd6` low + tests + dedupe). Frontend tests 99 → 159; git-core stayed at 106.
- The IPC contract was traced command-by-command against the Rust serde types — **no mismatches found**.
- HIGH: "Create branch here…" on a commit row created the branch at HEAD; conflicted files were unstageable anywhere in the UI (merge/rebase conflict flow dead-ended despite the banner saying "resolve, then stage them"); the commit-panel diff reset scroll + cleared line selection on every `repo://changed` (e.g. an IDE autosave); a duplicate start-screen modal had no focus trap/portal.
- MEDIUM: double re-walk after every HEAD-moving op (`syncRefs` now coalesced); `refreshLabels` refetched every loaded page on any `.git/*` write incl. `FETCH_HEAD`/`logs/*` (now viewport ± 1 page, identical snapshots skipped); `revealOid` left the working-tree row selected; Commit & Push never pushed after an amend; the pull dialog sent the local branch name as the remote's; focus was lost when a dialog opened from a context menu; containers showed no focus ring with nothing selected; grid/tree/listbox roles + `aria-activedescendant` + keyboard line staging added; changed-file lists virtualized; error toasts now persist.
- LOW: `AppError::StaleGeneration` so a failed page can't loop the walk; corrupt persisted state no longer hangs startup; a cancelled clone removes its half-written dest; DPI-change redraw for graph canvases; `+N` ref popover; ≥24px hit targets; resizable output dock; test hygiene (`__resetForTests`, fake timers, no wall-clock budgets); helper dedupe (`lib/paths`, `lib/keys`, one IPC wrapper, `Kbd`).

### First real run — three bugs found and fixed (2026-08-31)
The app's first launch in a real window (release build, the user's own repo). All three were reproduced by driving the running app over CDP (WebView2 accepts `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=…`, so playwright can attach to the shipped binary — the technique to reuse for GUI bugs).
- **Empty grid on a fresh launch** (release only; `React.StrictMode`'s double effect masked it in dev). Auto-reopen calls `startLog`, which fetches page 0 immediately — before the background walk has written any rows — so the page comes back `{rows: [], total: 0}`. The `log://progress` that lands while that request is in flight sets `total` = 28, the grid asks for the rows again, but `ensureRows` skips the page because it is still in flight; when the empty response finally lands nothing re-requests it, so the grid renders `total` placeholder rows forever. Fix: `fetchPage` retries a short page when the walk's known total grew *after* the request went out (bounded by that comparison, so a backend that keeps returning short pages can't spin it). Two regression tests.
- **No way to see or change the open repository.** Only the undiscoverable `Ctrl+Shift+W` existed. Added a toolbar repo menu (name + path tooltip → Open repository… / other recents / Close repository); `actions.ts` gained `switchRepo` / `pickAndOpenRepo` / `closeRepo`, the last shared with the shortcut in `App.tsx`.
- **The sidebar splitter felt dead**: it was clamped to 220–320px, i.e. 60px of travel from the 260 default. Widened to 180–560 (style guide updated). The splitters themselves are fine — all four were confirmed to drag; an earlier "broken splitter" reading came from a test that reused stale coordinates after an ancestor pane had moved.

### Dropdowns are drawn by the app (2026-08-31)
Fourth bug from the same run: the Push dialog's remote dropdown opened a light-on-dark list in the dark app. A native `<select>` popup is a separate OS window — outside the page, so `option { background }`, `color-scheme: dark` and the whole token sheet do not reach it (all four were verified correct at runtime; the popup does not even appear in a CDP page screenshot). Its colours come from WebView2's `PreferredColorScheme`, which tauri-runtime-wry only pushes on a `ThemeChanged` event, never at startup — and forcing it would still leave a native widget that ignores the design and only fixes Windows.
- `Select` (`components/ui/Input`) now renders its own list: same public API (`value` / `onChange` shaped like a native change / `<option>` children), so all 8 call sites are unchanged. Portalled to the body over the dialog scrim, flipped above the field near the bottom edge, ↑/↓/Home/End/Enter/Esc, and focus stays on the trigger (`aria-activedescendant`) so the dialogs' focus trap is unaffected. This is what the style guide already specified — "open = focus style + chevron-up" is not a state a native select can report.

### Pinned recents did not look pinned (2026-08-31)
Fifth bug from the same run: pinning a repo on the start screen only moved it up the list. The state was correct and immediate (verified in the running app: `aria-pressed`, the reorder and `recents.json` all flip on the click) — but every row already carried a muted pin icon, and pinned added only IconButton's `--bg-active` chip, which reads exactly like the hover the user is in while clicking. So it looked like nothing had happened until a restart, when the mouse was elsewhere. The pin is now drawn at rest only on pinned rows, filled and in `--accent`; unpinned rows reveal an outline pin on hover / focus / selection.

### Opening a repository got a visible wait state (2026-09-01)
From the real-window walkthrough: opening a large repo showed only the 14px statusbar spinner (easy to miss), and switching repos from the toolbar menu showed nothing at all — the click felt ignored. `repoStore.openRepo` now exposes `opening` (the repo name, cleared in a `finally`), and `App` renders one `BusyOverlay` — full-window scrim + centered `Opening <name>…` card — over whichever screen is up, so every path in (recents, Open, clone, init, the toolbar menu, auto-reopen) is covered by the same indicator. It fades in after 150ms, so fast opens never flash it, and the scrim swallows clicks so the wait can't be doubled. Verified in the mock-IPC harness with a 2.5s `open_repo` on both flows.

### Start-screen and app-shell polish from the walkthrough (2026-09-01)
- **Opening a repository had no visible wait.** Only the 14px statusbar spinner moved, and switching repos from the toolbar menu showed nothing at all. `repoStore.openRepo` now exposes `opening`; `App` renders one `BusyOverlay` (scrim + `Opening <name>…` card, 150ms delay so fast opens don't flash) covering every path in.
- **Recents could only be removed with `Delete`.** Each row now carries an `X` next to the pin, revealed on hover / selection like the pin.
- **Right-click outside a custom menu showed the webview's own menu** (Reload / Save as / Print — browser chrome in an app window). Suppressed app-wide from `App` via `lib/nativeMenu.ts`, except in editable fields and on selected `.selectable` text, where it is the only mouse route to cut/copy/paste. Tauri 2.11 exposes no switch for this: wry has `with_default_context_menus`, but tauri-runtime-wry never calls it — and the JS rule is better anyway, since it can be selective and also covers WebKitGTK/macOS. File rows still have no menu of their own (Stage/Discard/Copy path would be the natural set) — noted, not done.

### Known gaps / deferred (v1 ships with these)
_Kept as the v1 record. The live list of open items is `2026-09-02-next-plan.md`._

**Not implemented — needs a new backend command**
- Hunk-/line-level **Discard**: needs reverse-apply-to-workdir; only file-level `discard_paths` exists. No button is rendered for it (the disabled placeholders were removed in the review pass).
- **Settings screen**: the button is disabled everywhere ("Settings arrive after v1"). Would carry the git executable path (`set_git_path` exists since the 2026-09-02 review pass and backs "Locate git…" on the git-missing screen; Settings would just expose it), theme override, and diff context/whitespace defaults.
- **Mode (exec-bit) changes in hunk / line staging**: the patches built for `git apply --cached` carry no `old mode` / `new mode` lines, so a mode change is staged whole-file only (deferred in the 2026-09-02 review: Unix-only, not verifiable on the Windows dev box).

**Accepted limits**
- Non-UTF-8 files: `diff.rs` line text is lossy UTF-8, so patches built for hunk/line staging are not byte-exact for them. Whole-file staging is unaffected.
- Syntax highlighting parses one line at a time — block comments, template strings and other multi-line constructs highlight per line.
- `status.rs` is libgit2-only; the `git status --porcelain=v2 -z` fallback (see git-core modules) is unimplemented — add behind a flag if libgit2 proves slow on very large trees.
- Linux watcher: the workdir is watched recursively including ignored dirs (filtered at debounce time), so `max_user_watches` can bite on huge trees; watcher failure degrades to a warning + manual refresh.

**v1 accepted (2026-09-01)**
- ~~The smoke test is still the gate.~~ `docs/smoke-test.md` §0–§7 was walked end to end on Windows against the `docs/smoke-fixtures.ps1` fixture, finishing at `397efa2`. Every finding from it is fixed and folded into the sections above (tag target, tag annotations, push / delete-on-remote tag ops, Fetch split button, repo-menu guard while an op runs, dock height, …).
- ~~`.github/workflows/{ci,release}.yml` have never executed.~~ The repo is on GitHub (`toperux/t4-git-ui`, private); `ci.yml` is green on ubuntu / windows / macos since `4ebfb60`, after three real fixes it forced (`cargo fmt`, inotify `Access` events leaking through the watcher, `core.autocrlf=true` breaking byte-comparing tests on Windows). `release.yml` has not run yet — no `v*` tag pushed.
- ~~The two published design canvases are one palette behind~~ — republished 2026-08-31 from the post-M6 artboards (`--syn-*` tokens included); both keep their original URLs (see A1/A2 above).

**Verification still open (needs a machine we don't have)**
- UI-vs-canvas comparison pass (M6).
- Installer on a clean Win11; macOS signing/notarization; Linux + macOS are CI-build-only (no check of WebKitGTK rendering).

**Decided, not gaps**
- Native titlebar stays (the plan flagged it to revisit in M6; revisited, kept).
- The v1 out-of-scope list at the top of this plan is unchanged.

### Risks / gotchas
- Strict libgit2/CLI split: libgit2 = reads + index path ops; CLI = hooks, creds, network, merge/rebase, `apply --cached`, stage-able diffs.
- Creds: CLI inherits GCM; `GIT_TERMINAL_PROMPT=0` + null stdin → fail fast, no hang. GPG pinentry is separate (see commit.rs).
- `core.longpaths` detection on Windows; `IndexLocked` w/ retry/remove-lock action; watcher ignores `*.lock`.
- `Revwalk<'repo>` borrows repo → run to completion in bg task on private handle, never held across IPC.
- IPC volume: page 500 rows, small row payload, cap diffs w/ "load more".
- Tauri 2: missing capability entry fails silently in release — check `capabilities/default.json` per plugin call.
- Process-tree kill differs per OS (Job Object / killpg) — test on both.
- Linux inotify limits; WebKitGTK scrollbar/font rendering differs from WebView2 — check A1 on Linux in CI screenshots (M6).
- macOS signing/notarization deferred; Linux/macOS via CI until M6.

## Critical files (to be created)
- `docs/design/style-guide.md` — token source of truth
- `crates/git-core/src/log/graph.rs` — lane layout
- `crates/git-core/src/cli/runner.rs` — streaming CLI runner + process-tree kill
- `crates/git-core/src/patch.rs` — hunk/line patch build + reverse
- `crates/git-core/src/diff.rs` — display vs stage-able diff sources
- `src-tauri/src/state.rs` — AppState + command registration
- `src/screens/RepoWindow/RevisionGrid/RevisionGrid.tsx` — virtualized grid + graph
- `src/theme/tokens.css` — design tokens from style guide
