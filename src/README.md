# `src/` — frontend (React 19 + TS + Vite, Tauri 2 webview)

```
src/
  main.tsx                 mounts App; imports fonts.css → tokens.css → base.css; LucideProvider (16px, stroke 1.75)
  App.tsx                  probe_git → GitMissingScreen | no repo → StartScreen | repo → RepoWindow; loads recents and reopens
                           `lastOpen` inside one try/catch (a failure lands on the start screen, never on the spinner),
                           records every open (touch + setLastOpen), Ctrl+Shift+W closes the repo via `actions.closeRepo`
                           (shared with the toolbar repo menu: no-op while a dialog is open; info toast while an op runs)
  api/
    types.ts               TS mirror of the Rust IPC contract (serde camelCase) — edit only together with the Rust structs
    ipc.ts                 `call()` (the one `invoke` wrapper, shared with appIpc) + one typed function per command; every
                           rejection is an AppError {kind, message}; isAppError/toAppError
    events.ts              onLogProgress / onRepoChanged / onOpEvent (cb) → unlisten  (`log://progress`, `repo://changed`, `op://event`);
                           onOpEventReady (cb) → Promise<unlisten> for callers that must be listening before they invoke
    appIpc.ts              start-screen commands (through ipc.ts's `call`): cloneRepo {url,dest,recurseSubmodules,depth?} /
                           initRepo {path} → RepoSummary
  store/
    repoStore.ts           zustand: repo, refs, log {generation,total,complete,error,flat} (a page response never lowers `total`
                           nor clears `complete` — a late page must not undo a newer `log://progress`), sparse rows[], selection (commit index +
                           wtSelected for the working-tree row), reveal
                           actions: openRepo, closeRepo, refreshRefs, refreshLabels (re-fetch the pages around the last
                           `ensureRows` viewport, drop the rest so they reload lazily), startLog,
                           ensureRows (500-row pages, dedupe, stale drop), select, selectWorkingTree, revealOid;
                           a page rejected with `staleGeneration` restarts the walk, any other kind toasts once (never loops);
                           `__resetForTests()` clears the module-level page bookkeeping
    diffStore.ts           zustand: selected commit → files (get_commit_files), selectedPath (default first), diff (get_file_diff, context 3),
                           stale responses dropped via seq counters; view unified|split (localStorage.diffView), ignoreWhitespace,
                           fileListMode flat|tree (localStorage.fileListMode)
    statusStore.ts         zustand: WorkdirStatus; refresh (seq-guarded) / scheduleRefresh (100 ms debounce); onChanged(`repo://changed`):
                           any kind → status; refs|rescan → syncRefs (refreshRefs → HEAD moved ? startLog : refs changed ?
                           refreshLabels : nothing) — coalesced into one in-flight run, never rejects;
                           a clean tree clears wtSelected; useShowWorkingTree() = dirty && !flat; follows repoStore.repo;
                           `__resetForTests()` clears the debounce timer and the seq / coalescing guards
    commitStore.ts         zustand: commit-panel state — list (unstaged|staged) + multi-selection + anchor, `+N −M` stats
                           (get_changed_files ×2), diff of the anchor (unstaged|staged target, context 3, no whitespace option so hunk /
                           line indices match the backend), editor (summary/body/amend/signoff/prefill), busy;
                           actions: select, syncWithStatus (prune → neighbour → other list; reloads the diff only when the anchor
                           or its own StatusEntry changed, keeps the `diff` object identity when the hunks are equal, and refetches
                           the stats only when the entry list changed — one call in flight), stage/unstage/discard
                           (native ask(); discard resolves `false` when declined *or* when another mutation held `busy`),
                           stageHunk/stageLines (reverse for staged), setAmend (get_head_message prefill), useMessage, commit
                           (→ oid | null, clears the editor incl. after an amend, msgHistory, toast, status + refs refresh),
                           reset on repo change
    recentsStore.ts        zustand: RecentRepo{path,name,lastOpened,pinned} persisted via lib/kv; load (migrates the M1
                           `localStorage.lastRepo`), touch (20 unpinned cap), remove, togglePin, lastOpen, lastCloneDir;
                           pure helpers sortRecents / capRecents / filterRecents
    opsStore.ts            zustand: OpRecord[] from `op://event` (started/stdout/stderr/progress-redraw/exit), max 50 ops × 5000 lines,
                           cancel(opId), dock open, `busy` (statusbar text of the running op) + selectRunning;
                           runOp(busy, fn, {success, onRefused}) — the single entry point for every branch/remote/stash op
    dialogStore.ts         zustand: one `DialogSpec` at a time — open(spec, {returnFocusTo}) / close(); DialogHost renders it
                           and feeds `returnFocusTo` to `Dialog` through `DialogReturnFocus`
    toastStore.ts          zustand: toasts (info|success auto-dismiss after 6 s, errors persist until dismissed);
                           toastError(err, title, retry?) — cli → first stderr line, indexLocked → "Index is locked…" + Retry
  theme/
    tokens.css             GENERATED from docs/design/canvases/build/tokens.css — never edit; run `node docs/design/canvases/build/build.mjs`
    base.css               reset, body, scrollbar, :focus-visible, .selectable, reduced-motion
    fonts.css              @font-face for the bundled variable fonts in assets/fonts
    theme.ts               light/dark preference → <html data-theme>
    useThemeTokens.ts      reads --graph-0..7 / --lane-w / --node-r / --lane-stroke / --row-h via getComputedStyle; re-reads on data-theme change
  assets/fonts/            InterVariable(.woff2, -Italic), JetBrainsMono[wght](.woff2, -Italic) + licenses
  lib/                     cx(), relativeDate()/absoluteDate(), multiSelect.ts (pure click/ctrl/shift/↑↓/Ctrl+A model),
                           keys.ts (mods(e) → {ctrl, shift} for the selection models),
                           nativeMenu.ts (keepsNativeMenu: the webview's own context menu is suppressed app-wide from
                           App.tsx, kept only in editable fields and on selected `.selectable` text),
                           msgHistory.ts (localStorage `msgHistory:<repoId>`, 20 entries; splitMessage/joinMessage, CRLF-safe),
                           kv.ts (store plugin `recents.json`, localStorage fallback; an unreadable value reads as absent),
                           paths.ts (baseName/parentDir/pathSep/joinPath/repoNameFromUrl/prettyUrl — the one path helper module),
                           branchName.ts (validateRefName: the check-ref-format subset — spaces, `..`, `//`, leading `-`,
                           leading/trailing `/`, trailing `.`, `.`-leading or `.lock`-trailing components, bare `@`, `@{`,
                           `~^:?*[\` + control chars, reserved, already taken)
                           highlight.ts (langForPath → lezer grammar, code-split + loadLang on first use; highlightLine(lang, text)
                           parses ONE line → {text, cls}[] spans, 5k-entry LRU; cls ∈ keyword|string|comment|number|type|function|punct)
  components/ui/<Name>/    one folder per style-guide component: <Name>.tsx + <Name>.module.css (incl. StatusGlyph A/M/D/R/U/C,
                           Checkbox, Kbd (the one shortcut-chip anatomy, used by MenuItem + StartScreen),
                           Input + Select (`<option>` children, `onChange` shaped like a native change; the list is
                           app-drawn and portalled — a native <select> popup is an OS window that ignores the theme),
                           BusyOverlay (scrim + spinner card while repoStore.opening is set; rendered once in App.tsx
                           so it covers the start screen and a toolbar-menu repo switch alike),
                           Menu/MenuItem/MenuSeparator (anchor + dropdown, Esc/outside click, ↑/↓, `kbd` hint, `align`)
                           + ContextMenu (portal at a viewport point, clamped), Toast + ToastStack,
                           Dialog (440 / `.wide` 560 over `--scrim`, portal, Esc closes, Enter submits, Tab trapped, focus
                           restored, aria-modal) + Field / FieldRow / Options / DialogText / Mono)
  screens/
    StartScreen/           recents list (filter, keyboard, pin, remove) | Open / Clone… / Initialize… cards + shortcuts;
                           CloneDialog.tsx (components/ui/Dialog with `busy`; form → progress mode)
    GitMissingScreen/      probe_git failed → "Git not found" + Retry (no set_git_path command, so no "Locate git…")
    RepoWindow/            RepoWindow (layout: toolbar 40 / sidebar 260 | StateBanners + grid ÷ (DetailsPane | CommitPanel when
                           wtSelected) / dock / statusbar 24 w/ spinner + busy text; hosts DialogHost + useShortcuts)
                           Toolbar (repo menu = open repository name → folder picker / other recents / close, Fetch → default
                           remote w/ prune, Pull / Push dialogs + ahead/behind counts, Branch and Stash menus, Commit button
                           = change count; every op button disabled while one runs),
                           Sidebar (one `role="tree"` per section with a roving tabIndex, context menus per ref kind on
                           right-click / Shift+F10, double-click = checkout),
                           actions.ts (fetchDefault / checkout* / stash* / copyText / refreshAll / switchRepo / pickAndOpenRepo /
                           closeRepo — the git ones through runOp),
                           banners.ts (pure refs+status → detached | merge | rebase | sequencer (cherry-pick/revert/bisect,
                           text only — no backend abort) | conflicts banners),
                           useShortcuts.ts (Ctrl+Shift+U push, Ctrl+Shift+L pull, Ctrl+B branch, Ctrl+F5 fetch, F5 refresh, Ctrl+`),
                           dialogs/ (DialogHost + OpsDialogs Push/Pull/Fetch/Merge/Rebase, RefDialogs Checkout picker /
                           Create-Rename-Delete branch / remote branch / tags, StashDialogs; gitArgs.ts mirrors cli/ops.rs
                           for the footer's "Runs `git …`" preview — that file is the source of truth),
                           DetailsPane (bottom pane: CommitDetails 340 | ChangedFileList 320 | DiffViewer, resizable),
                           OutputDock (collapsed 28px: `$ cmd` + Check/X icon, exit · elapsed / spinner + Cancel; expanded
                           `.output` log inside `RepoWindow`'s resizable `DockPanel`, 160–320px, height in `localStorage.dockHeight`)
      RevisionGrid/        RevisionGrid (virtualized; role=grid wraps the header row + the scrolling rowgroup, owns the keyboard
                           and aria-activedescendant; row 0 = WorkingTreeRow while dirty & unfiltered —
                           commit rows shift by one, store indices stay commit-based), GridRow (memo, per-row store selectors),
                           GraphCell (<canvas> per row, `useDevicePixelRatio()` repaints on a DPI change) + WorkingTreeNode
                           (dashed ring), graphGeometry.ts, RefChips (max 3 chips, `+N` opens a portalled popover of the rest)
      ChangedFileList/     ChangedFileList (virtualized 26px rows + aria-activedescendant; flat = role=listbox of options,
                           tree = role=tree of treeitems with aria-expanded/aria-level; ↑/↓, StatusGlyph + start-ellipsis
                           mono path + `+N −M`), fileTree.ts (pure: nest by `/`, folders first)
      DiffViewer/          DiffViewer props {path, oldPath, stats, diff, loading, error, actions?} (header: path, stats, unified/split/
                           whitespace IconButtons; virtualized body, role=region, `.selectable` text, CR → ␍, no-newline marker,
                           binary/truncated states; per-line syntax highlighting via lib/highlight → `--syn-*`). `actions` = staging mode: forced unified, hunk-row "Discard | Stage/Unstage hunk"
                           (hover), body = role=listbox of add/del `option` lines with a roving tabIndex (click/Shift/Ctrl, Space
                           toggles, Shift+↑/↓ extends inside the hunk, Enter stages) → sticky "N lines selected · Discard · Stage N
                           lines" bar; wholeFile (untracked / conflicted) = header `note`, no hunk/line actions. The body scrolls back
                           to the top only when the file path changes. No hunk/line Discard: the backend has no
                           reverse-apply-to-workdir — file-level discard lives in `CommitPanel/FilesColumn`
                           diffRows.ts (pure: flattenUnified (rows carry hunk/index) / flattenSplit), lineSelection.ts (pure: clickLine, toPairs)
      CommitPanel/         CommitPanel (Files 320 | Diff | Message 340, resizable; feeds statusStore.status → commitStore.syncWithStatus),
                           FilesColumn (Unstaged + Stage all / Staged + Unstage all; virtualized 26px rows, role=listbox
                           aria-multiselectable + aria-activedescendant, delegated click so memo(FileRow) holds, the 2px
                           accent bar only while more than one row is selected (`.list.multi`), hover Stage/Unstage IconButton, Enter/double-click act on the selection, Delete → discard w/
                           native confirm; conflicted rows = glyph C, stageable whole-file — the diff header says so),
                           MessageColumn (summary input + len/72 counter (danger past 72), body textarea, Amend (prefill) / Signed-off-by,
                           author line or "Set user.name and user.email" (config error → Commit disabled), Commit (Ctrl+Enter),
                           Commit & Push (commits, then opens the Push dialog when `commit()` returned an oid),
                           history Menu from msgHistory)
```

## How tokens flow

`docs/design/canvases/build/tokens.css` is the single source of truth. `node docs/design/canvases/build/build.mjs`
(or `… build.mjs screens`) rewrites `src/theme/tokens.css`. Components reference tokens only (`var(--…)`) —
no raw colors, sizes, radii or fonts. The one place CSS vars can't reach is the graph `<canvas>`;
`useThemeTokens()` reads the computed values once and again when `data-theme` flips.

Selection colour follows the focused pane: rows use `--bg-selected-unfocused` by default and
`--bg-selected` under `:focus-within` of their pane (`RevisionGrid` scroll container, `TREE_PANE_CLASS` for the sidebar).

## Working-tree flow (M3)

`repo://changed` (watcher, plus one synthetic event after each of our mutations) → `statusStore.onChanged` → debounced
`get_status`; `refs` kinds also refresh refs and either restart the walk (HEAD moved) or just refresh labels. The grid shows the
working-tree pseudo-row while `status.entries` is non-empty; selecting it (`repoStore.wtSelected`) swaps the bottom pane for
`CommitPanel`. Every stage/unstage/discard/commit goes through `commitStore`, which refreshes the status itself after the IPC
resolves (the event arrives too; the seq guard makes the second response a no-op). After a commit the panel stays on the
working-tree row when changes remain, otherwise the row disappears and the fresh walk selects HEAD.

## Start screen (M5)

`App` probes git, then `recentsStore.load()` (store plugin `recents.json` through `lib/kv`, `localStorage` fallback; a
corrupt value reads as absent rather than throwing) and reopens `lastOpen` — the repository that was open at the last exit, cleared by `closeRepo` (`Ctrl+Shift+W`). Every
`repoStore.repo` change touches recents and rewrites `lastOpen`. Recents are stored already sorted (pinned first, then
`lastOpened` desc) and capped at 20 unpinned entries. Opening a recent that no longer resolves shows an error toast with a
"Remove from list" action. `CloneDialog` calls `clone_repo` and, while it runs, follows `op://event` with `repoId === null`
— the subscription is awaited *before* `clone_repo` is invoked, so the `started` event that supplies the `opId` used by
Cancel (`cancel_op`) cannot be missed; later `progress` / `stderr` lines feed the single status line. A cancelled or failed
clone removes the half-written destination (backend) unless it already existed. The backend opens the clone itself, so success just hands the `RepoSummary` back and the app switches to
`RepoWindow`; a failure returns to the form with the stderr first line in a banner.

## Operations (M4)

Every branch / remote / stash operation goes through `opsStore.runOp(busy, fn, opts)`. It refuses with an info toast while
another op is in flight (the backend enforces the same with `AppError::busy`), awaits the command, and classifies the
outcome: a streamed op resolves with `OpResult` whose `failure` is a *result*, not a rejection — `conflicts` toasts
"N conflicts — resolve in the commit panel" and selects the working-tree row, `nonFastForward` offers a Pull action,
`authFailed` points at the credential helper, `rejected` / `other` show git's message. Rejections are `AppError`s:
`refused` (a safety check, e.g. an unmerged branch) is handed to `onRefused` so the Delete-branch dialog can re-offer
itself as a force delete, `cancelled` is an info toast, everything else goes through `toastError`. Afterwards it refreshes
the status and calls `statusStore.syncRefs()`, which relabels the walk or restarts it when HEAD moved (the backend's own
`repo://changed` arrives too; the seq guards make it a no-op). While an op runs, `opsStore.busy` holds the statusbar text
and disables the toolbar; the streamed output lands in the shared `OutputDock` (elapsed timer + Cancel → `cancel_op`;
a `
` progress segment replaces the previous progress line rather than appending).

Dialogs are one at a time (`dialogStore` → `DialogHost`) and every option-bearing action gets one, with a
"Runs `git …`" preview built by `dialogs/gitArgs.ts` (a mirror of `crates/git-core/src/cli/ops.rs`, so the preview and
the real argv stay in step). Banners above the grid come from `banners.ts` — a pure function of `refs.state` / `head` /
`status.conflicted`, so it re-derives on every `repo://changed`.

## Adding a component (style guide §7)

1. Wireframe → compose from existing `components/ui/*` and §4 patterns. If a new component is needed, add it to
   the Components artboard (`docs/design/canvases/build/parts/Components.mjs`) and `docs/design/style-guide.md` first,
   plus its reference CSS in `build/base.css`.
2. Create `src/components/ui/<Name>/<Name>.tsx` + `<Name>.module.css`; port the `base.css` rules 1:1
   (class states `is-hover` etc. become real pseudo-classes). Icons: `lucide-react`, sizes 16 rows / 18 toolbar /
   12 chips / 24 empty states; `aria-label` + `title` on icon-only buttons.
3. Keep tests small: pure helpers get a unit test; render tests only for rules the UI must never break
   (e.g. `RevisionGrid.test.tsx` enforces "chips before subject").

## Scripts

`npm test` (vitest, jsdom) · `npm run build` (tsc + vite) · `npm run tauri dev` (app).
