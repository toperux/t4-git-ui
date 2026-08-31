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
- **M3 Stage/commit** — status/patch/stage/commit, CLI runner, CommitPanel, multi-select, history, amend. Verify: tests stage path/hunk/line-subset/reverse then assert `git diff --cached` — **incl. `core.autocrlf=true` repo w/ CRLF file**; discard unstaged keeps staged hunk; untracked → whole-file only; failing pre-commit hook surfaces as toast; amend prefills + rewrites HEAD; watcher refresh on external edit; watcher degrades gracefully on a repo w/ 50k ignored dirs.
- **M4 Branch ops + streaming** — cli/ops, Channel cmds, cancel, OutputPanel, dialogs, conflicts, StateBanner. Verify: fetch from local bare remote streams incrementally (`\r` progress); cancel kills **whole tree** <100ms (test: spawn `git` that spawns a sleeping helper via `credential.helper`); ops serialized; merge conflict → `Conflicts` + conflicted files + banner; push updates ahead/behind.
- **M5 Start screen** — recents (store plugin), clone w/ progress, init, git-missing screen. Verify: clone small public repo → opens; init → empty-repo state; recents persist across restart.
- **M6 Polish/packaging** — verify UI vs A1/A2 canvases, shortcuts, syntax highlight, context menus, `cargo tauri icon`, `cargo tauri build` (NSIS), GH Actions matrix (ubuntu needs `libwebkit2gtk-4.1-dev`). Verify: installer on clean Win11; Linux + macOS smoke via CI.
- Recurring: `cargo test -p git-core`, `cargo clippy --workspace`, `npx tsc --noEmit`, `npm run build`, `cargo tauri dev`.

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
