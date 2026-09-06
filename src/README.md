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
    ipc.ts                 `call()` (the one `invoke` wrapper) + one typed function per command, including the start-screen
                           cloneRepo {url,dest,recurseSubmodules,depth?} / initRepo {path} → RepoSummary; every
                           rejection is an AppError {kind, message}; isAppError/toAppError
    events.ts              onLogProgress / onRepoChanged / onOpEvent (cb) → unlisten  (`log://progress`, `repo://changed`, `op://event`);
                           onOpEventReady (cb) → Promise<unlisten> for callers that must be listening before they invoke
  store/
    repoStore.ts           zustand: repo, refs, log {generation,total,complete,error,flat} (a page response never lowers `total`
                           nor clears `complete` — a late page must not undo a newer `log://progress`), sparse rows[], selection (commit index +
                           wtSelected for the working-tree row), reveal
                           actions: openRepo, closeRepo, refreshRefs, refreshLabels (re-fetch the pages around the last
                           `ensureRows` viewport, drop the rest so they reload lazily), startLog,
                           ensureRows (500-row pages, dedupe, stale drop), select, selectWorkingTree, revealOid;
                           a page rejected with `staleGeneration` restarts the walk, any other kind toasts once (never loops);
                           `__resetForTests()` clears the module-level page bookkeeping
    diffStore.ts           zustand: selected commit → files (get_commit_files), selectedPath (default first), diff (get_file_diff with `context` — 3 unless Settings says otherwise;
                           setContext reloads),
                           stale responses dropped via seq counters; view unified|split (localStorage.diffView), ignoreWhitespace,
                           fileListMode flat|tree (localStorage.fileListMode)
    statusStore.ts         zustand: WorkdirStatus; refresh (seq-guarded) / scheduleRefresh (100 ms debounce); onChanged(`repo://changed`):
                           any kind → status; refs|rescan → syncRefs (refreshRefs → walkSeeds moved ? startLog : refs changed ?
                           refreshLabels : nothing) — coalesced into one in-flight run, never rejects;
                           walkSeeds = the oids the walk is pushed from (HEAD for `head`; + branches, remote branches and
                           tags for `all`), so a fetch that moves origin/* re-walks instead of only relabelling;
                           a clean tree clears wtSelected (unless mid-merge); useShowWorkingTree() = (dirty || merging) && !flat; follows repoStore.repo;
                           `__resetForTests()` clears the debounce timer and the seq / coalescing guards
    commitStore.ts         zustand: commit-panel state — list (unstaged|staged) + multi-selection + anchor, `+N −M` stats
                           (get_changed_files ×2), diff of the anchor (unstaged|staged target, the settings' context — remembered as
                           `diffContext` beside the diff — no whitespace option, so hunk / line indices match the backend), editor (summary/body/amend/signoff/prefill), busy;
                           actions: select, syncWithStatus (prune → neighbour → other list; reloads the diff only when the anchor
                           or its own StatusEntry changed — the entry carries `workdirStamp` (mtime:size) precisely so an edit on
                           disk counts as a change: resolving a conflict in an editor leaves every status letter as it was —
                           plus always after one of our own mutations, which clear `diffEntry`:
                           staging a second hunk leaves the entry at modified/modified and would look like nothing happened —
                           keeps the `diff` object identity when the hunks are equal, and refetches
                           the stats only when the entry list changed — one call in flight), stage/unstage/discard
                           (native ask(); discard resolves `false` when declined *or* when another mutation held `busy`),
                           stageHunk/stageLines (reverse for staged; every hunk / line action sends the context the *shown*
                           diff was built with, and a diffStore `context` change reloads the panel diff first),
                           discardHunk/discardLines (native ask, then `discard_hunks` / `discard_lines` — `git apply -R` on
                           the working tree; dropped with a toast when the diff was replaced during the confirmation),
                           resolveConflict(paths, side, label) (ask, then
                           `resolve_conflict` = `checkout --ours|--theirs` + add; a path whose chosen side the other branch
                           deleted is resolved as a removal instead), setAmend (get_head_message prefill), prefillPending
                           (get_merge_message prefill when `refs.state` becomes `merge`, taken back on abort), useMessage, commit
                           (→ oid | null, clears the editor incl. after an amend, msgHistory, toast, status + refs refresh),
                           reset on repo change
    recentsStore.ts        zustand: RecentRepo{path,name,lastOpened,pinned} persisted via lib/kv; load (migrates the M1
                           `localStorage.lastRepo`), touch (20 unpinned cap), remove, togglePin, lastOpen, lastCloneDir;
                           pure helpers sortRecents / capRecents / filterRecents
    cmdHistoryStore.ts     zustand: lines typed into "Run git command…" / the dock prompt, newest first, global across
                           repositories (lib/kv `cmdHistory`, 50 entries); pushCmd (dedupe → front, cap)
    opsStore.ts            zustand: OpRecord[] from `op://event` (started/stdout/stderr/progress-redraw/exit), max 50 ops × 5000 lines,
                           cancel(opId), dock open (a non-zero exit opens it, unless that op was cancelled),
                           `busy` (statusbar text of the running op) + selectRunning;
                           runOp(busy, fn, {success, onRefused}) — the single entry point for every branch/remote/stash op
    settingsStore.ts       zustand: diffContext / ignoreWhitespace / gitPath (+ gitVersion, gitError) from lib/kv; load() after the
                           git probe seeds diffStore; setters persist and apply at once (setGitPath clears gitError, probes through
                           set_git_path and keeps only a working path; the version is mirrored into repoStore;
                           clearGitError on edit).
                           Theme stays in theme/theme.ts
    dialogStore.ts         zustand: one `DialogSpec` at a time — open(spec, {returnFocusTo}) / close(); DialogHost renders it
                           and feeds `returnFocusTo` to `Dialog` through `DialogReturnFocus`
    toastStore.ts          zustand: toasts (info|success auto-dismiss after 6 s, errors persist until dismissed);
                           toastError(err, title, retry?) — cli → first stderr line, indexLocked → "Index is locked…" + Retry
  theme/
    tokens.css             GENERATED from docs/design/canvases/build/tokens.css — never edit; run `node docs/design/canvases/build/build.mjs`
    base.css               reset, body, scrollbar, :focus-visible, .selectable, reduced-motion
    fonts.css              @font-face for the bundled variable fonts in assets/fonts
    theme.ts               light/dark preference → <html data-theme>; also mirrored into kv `theme` so src-tauri/lib.rs can
                           colour the native window before the first paint
    useThemeTokens.ts      reads --graph-0..7 / --lane-w / --node-r / --lane-stroke / --row-h via getComputedStyle; re-reads on data-theme change
  assets/fonts/            InterVariable(.woff2, -Italic), JetBrainsMono[wght](.woff2, -Italic) + licenses
  lib/                     cx(), relativeDate()/absoluteDate(), multiSelect.ts (pure click/ctrl/shift/↑↓/Ctrl+A model over an all-items list plus the visible
                           order — hidden items stay selected, ranges and ↑/↓ walk what is visible),
                           keys.ts (mods(e) → {ctrl, shift} for the selection models),
                           conflictSides.ts (sideLabel / sideName: the two sides' names for the diff header, the file
                           menu and the resolve confirmation — "our" / "their" when the backend names none),
                           nativeMenu.ts (keepsNativeMenu: the webview's own context menu is suppressed app-wide from
                           App.tsx, kept only in editable fields and on selected `.selectable` text),
                           msgHistory.ts (localStorage `msgHistory:<repoId>`, 20 entries; splitMessage/joinMessage, CRLF-safe),
                           argv.ts (splitArgs: a typed `git …` line → argv, shell quoting rules; interactiveFlag mirrors
                           cli/ops.rs `check_custom_args` for the inline error — the Rust side is what enforces it),
                           gitCompletions.ts (GIT_COMMANDS table: porcelain commands, everyday flags with hints, two-level
                           stash/remote/submodule/worktree; complete(text, refs, history) → up to 8 history lines first, then
                           commands | subcommands | flags | refs for the word at the caret, 30 max),
                           kv.ts (store plugin `recents.json` — the same file src-tauri/lib.rs reads at startup for `theme` —,
                           localStorage fallback; an unreadable value reads as absent),
                           paths.ts (baseName/parentDir/pathSep/joinPath/repoNameFromUrl/prettyUrl — the one path helper module),
                           branchName.ts (validateRefName: the check-ref-format subset — spaces, `..`, `//`, leading `-`,
                           leading/trailing `/`, trailing `.`, `.`-leading or `.lock`-trailing components, bare `@`, `@{`,
                           `~^:?*[\` + control chars, reserved, already taken)
                           highlight.ts (langForPath → lezer grammar, code-split + loadLang on first use; highlightLine(lang, text)
                           parses ONE line → {text, cls}[] spans, 5k-entry LRU; cls ∈ keyword|string|comment|number|type|function|punct)
  components/ui/<Name>/    one folder per style-guide component: <Name>.tsx + <Name>.module.css (incl. StatusGlyph A/M/D/R/U/C,
                           Checkbox, Kbd (the one shortcut-chip anatomy, used by MenuItem + StartScreen),
                           CommandInput (`$ git …` field + portalled completion list from lib/gitCompletions, above or
                           below; completes the word at the caret and keeps what follows it; focus stays in the field via
                           aria-activedescendant; Tab/Enter accept, Enter alone submits, Escape closes the list before the
                           dialog sees it, ↑/↓ walk the history — the walk resets on submit),
                           Input + Select (`<option>` children, `onChange` shaped like a native change; the list is
                           app-drawn and portalled — a native <select> popup is an OS window that ignores the theme),
                           BusyOverlay (scrim + spinner card while repoStore.opening is set; rendered once in App.tsx
                           so it covers the start screen and a toolbar-menu repo switch alike),
                           Menu/MenuItem/MenuSeparator (anchor + dropdown, Esc handled on the menu itself so a surrounding
                           Dialog stays open, outside click, ↑/↓, `kbd` hint, `align`, focus back on the trigger)
                           + ContextMenu (portal at a viewport point, clamped) + MenuRef (a branch name inside an item:
                           mono, chip colours for local / remote), ThemeToggle (Sun/Moon, theme/theme.ts `toggleTheme`),
                           Toast + ToastStack,
                           Dialog (440 / `.wide` 560 / `full` = the window minus a margin, unpadded body, footer optional —
                           over `--scrim`, portal, Esc closes, Enter submits, Tab trapped, focus
                           restored, aria-modal) + Field / FieldRow / Options / DialogText / Mono)
  screens/
    StartScreen/           recents list (filter, keyboard, pin, remove) | Open / Clone… / Initialize… cards + shortcuts;
                           CloneDialog.tsx (components/ui/Dialog with `busy`; form → progress mode); the gear opens
                           SettingsDialog from local state (no DialogHost here)
    SettingsDialog/        Settings (wide Dialog, Close only — fields apply on change; context lines on blur / Enter; the git path on
                           Apply, Enter or Locate…): Git executable (path, Locate…, Apply → version or error inline), Theme
                           (Light / Dark / Follow system → theme.setTheme), Diff (context lines 0–99, ignore whitespace by default) — backed by store/settingsStore
    GitMissingScreen/      probe_git failed → "Git not found" + Retry + "Locate git…" (file picker → set_git_path, kept in kv `gitPath`;
                           Settings edits the same key)
    RepoWindow/            RepoWindow (layout: toolbar 40 / sidebar 260 | StateBanners + grid ÷ (DetailsPane | CommitPanel when
                           wtSelected) / dock / statusbar 24 w/ spinner + busy text; hosts DialogHost + useShortcuts)
                           Toolbar (repo menu = open repository name → folder picker / other recents / close, Fetch = split
                           button: click → default remote w/ prune, ▾ → the Fetch dialog (remote, prune, tags), Pull / Push
                           dialogs + ahead/behind counts, Branch and Stash menus, Commit button
                           = change count, Repository menu › Commit… / Run git command…, ThemeToggle beside the Settings gear
                           (dialogStore kind `settings`);
                           every op button disabled while one runs),
                           Sidebar (one `role="tree"` per section with a roving tabIndex; branches with `/` nest in
                           folder rows under Local and under each remote; a `mergedInto` branch (never the current one, nor a protected main / master / remote-default) is muted with a
                           `merged` badge; context menus per ref kind on right-click / Shift+F10, double-click = checkout),
                           actions.ts (fetchDefault / checkout* / stash* / copyText / refreshAll / switchRepo / pickAndOpenRepo /
                           closeRepo / runGit — the git ones through runOp; runGit with `quietFailure`: no toast on a
                           non-zero exit unless conflicts / auth / non-fast-forward / diverged, the dock's exit line says it;
                           busyLabel cuts the label by code point with a marker runOp keeps),
                           banners.ts (pure refs+status → detached | merge | rebase | sequencer (cherry-pick/revert/bisect,
                           text only — no backend abort) | conflicts banners),
                           useShortcuts.ts (Ctrl+Shift+U push, Ctrl+Shift+L pull, Ctrl+Shift+R run git command, Ctrl+B branch,
                           Ctrl+F5 fetch, F5 refresh; Ctrl+` also inside text fields — it is the only way out of the dock prompt),
                           dialogs/ (DialogHost + OpsDialogs Push/Push tag + Delete remote tag (`refs/tags/<name>` with a
                           remote picker, from the sidebar tag menu)/Pull/Fetch/Merge/Rebase — Merge and Rebase take a commit oid as
                           well as a branch, shown as an extra 7-char option; a commit merge defaults to git's
                           `Merge commit '<short>'` message —, RefDialogs Checkout picker /
                           Create-Rename-Delete branch / remote branch / tags, RemoteDialogs Add / Rename / Change URL /
                           Remove (a remote itself), StashDialogs, DiffDialog (the selected commit's / compare's
                           changed files + diff as a full-window dialog, off the diff header's expand button),
                           RunCommandDialog (one
                           CommandInput; Run → actions `runGit`); gitArgs.ts mirrors cli/ops.rs
                           for the footer's "Runs `git …`" preview — that file is the source of truth),
                           DetailsPane (bottom pane: CommitDetails 340 | ChangedFileList 320 | DiffViewer, resizable;
                           an annotated tag pointing at the selected commit adds its own message block under the
                           commit message — `refs.tags[].message` is `null` on a lightweight tag, which is all that
                           tells the two apart once the tag is peeled),
                           OutputDock (collapsed 28px: `$ cmd` + Check/X icon, exit · elapsed / spinner + Cancel; expanded
                           `.output` log + a `$ git` prompt line (CommandInput, list opens upward, stays enabled while an op
                           runs — Enter waits — Enter → actions `runGit`) inside `RepoWindow`'s resizable `DockPanel`, 160–320px, opens
                           at 200 every launch)
      RevisionGrid/        RevisionGrid (virtualized; role=grid wraps the header row + the scrolling rowgroup, owns the keyboard
                           and aria-activedescendant; row 0 = WorkingTreeRow while dirty & unfiltered —
                           commit rows shift by one, store indices stay commit-based), GridRow (memo, per-row store selectors),
                           GraphCell (<canvas> per row, `useDevicePixelRatio()` repaints on a DPI change) + WorkingTreeNode
                           (dashed ring; double-click opens the commit dialog), graphGeometry.ts, visibleLanes.ts (graph
                           column width follows the busiest row in view, grows at once / shrinks after 300 ms, up to 40
                           lanes), commitMenu.ts (pure: the Checkout / Reset / Merge / Rebase targets for the branches at a commit;
                           merge and rebase are empty on HEAD's own commit and on an unborn HEAD, a remote branch whose local
                           twin sits at the commit is skipped, `canRebase` is false while HEAD is detached), the row ContextMenu (checkout / merge into
                           current — the branch on the row, or the commit itself when none sits there / rebase current onto
                           the branch on the row, else the commit / branch / reset / tag / copy SHA; branch names via MenuRef),
                           RefChips (max 3 chips, `+N` opens a portalled popover of the rest)
      ChangedFileList/     ChangedFileList (virtualized 26px rows + aria-activedescendant; flat = role=listbox of options,
                           tree = role=tree of treeitems with aria-expanded/aria-level; ↑/↓, StatusGlyph + start-ellipsis
                           mono path + `+N −M`), fileTree.ts (pure: nest by `/`, folders first; a chain of single-child folders folds into one
                           node named `a/b/c`, keyed by its deepest path, rendered `a / b / c`); tree rows draw a guide line
                           under each ancestor's chevron (`.rows .treeRow` background-image, so hover / selected rules use
                           `background-color`)
      DiffViewer/          DiffViewer props {path, oldPath, stats, diff, loading, error, actions?} (header: path, stats, unified/split/
                           whitespace IconButtons; virtualized body, role=region, `.selectable` text, CR → ␍, no-newline marker,
                           binary/truncated states; per-line syntax highlighting via lib/highlight → `--syn-*`). `actions` = staging mode: forced unified, hunk-row "Discard | Stage/Unstage hunk"
                           (hover), body = role=listbox of add/del `option` lines with a roving tabIndex (click/Shift/Ctrl, Space
                           toggles, Shift+↑/↓ extends inside the hunk, Enter stages) → sticky "N lines selected · Discard · Stage N
                           lines" bar. The cursor owns the DOM focus, not just the tab stop — `.pick:focus-visible` is the only
                           thing that draws it: ↑/↓ scroll it into view and focus it (`[data-cursor]`), a click adopts it, and
                           focusing the region hands off to the cursor line (outside staging there is none, so the region keeps
                           the focus for scrolling); wholeFile (untracked / conflicted) = header `note`, no hunk/line actions;
                           `onResolve` / `onRestoreConflict` add a "Resolve in editor" / "Restore conflict" button, `sides` +
                           `onKeepSide` add "Keep <ours>'s version" / "Keep <theirs>'s version" (labels = refs.conflictSides via
                           lib/conflictSides, git's own direction — during a rebase *ours* is the branch rebased onto; the
                           label column is capped at 12rem, full text in `title`); `onDiscardHunk` /
                           `onDiscardLines` add "Discard hunk" / "Discard N lines" (+ `Delete` on a selection), wired for the
                           unstaged side only; a mode change shows as a `100644 → 100755` chip beside the stats. The body
                           scrolls back to the top only when the file path changes
                           diffRows.ts (pure: flattenUnified (rows carry hunk/index) / flattenSplit), lineSelection.ts (pure: clickLine, toPairs)
      CommitPanel/         CommitPanel (Files 320 | Diff | Message 340, resizable; `useCommitSync` — called once from RepoWindow
                           while the panel or the commit dialog is up — feeds statusStore.status →
                           commitStore.syncWithStatus; the message header's "Open commit window" opens dialogs/CommitDialog:
                           the same columns as a full-window dialog, Unstaged / Staged / Message stacked left, diff right,
                           closing itself after a commit — also Repository menu › Commit… and a double-click on the working-tree row;
                           the details pane's diff header carries the sibling "Open diff window", which opens dialogs/DiffDialog
                           the same way),
                           FileContextMenu (right-click / Shift+F10 on a row — a row outside the selection is selected alone
                           first: Stage / Unstage the selection — a lone conflicted file stages, which marks it resolved, like
                           its row's + / Enter / double-click; a multi-file selection and Stage all skip conflicted ones with
                           a "(N skipped)" title — Discard… (unstaged, none conflicted), Keep <side>'s version when every
                           selected file is conflicted, Copy path, Open (OS default app) and Reveal in folder — single file,
                           still on disk — through `open_path`, a Rust command that joins the repo-relative path itself so the
                           webview never gets an arbitrary-path opener scope),
                           FilesColumn (Unstaged + Stage all / Staged + Unstage all; virtualized 26px rows, role=listbox
                           aria-multiselectable + aria-activedescendant — or role=tree with folder rows when the header's
                           "Show as tree" toggle beside the title is on (store/treeModeStore.ts, one mode for every mount, `localStorage.commitFileListMode`;
                           ChangedFileList/fileTree builds + flattens it; a collapsed folder's files leave the ↑/↓ + Shift *walk*
                           only — they stay selected, Ctrl+A takes every file, Enter acts on all, ↑/↓ from a hidden anchor resume at
                           its folder row (fileTree `hiddenSlot`); Enter / Space / ← / → on a folder row toggle it; a row that
                           vanishes hands the selection to its display-order neighbour (`commitStore.setOrder`)), delegated click so memo(FileRow) holds, the 2px
                           accent bar only while more than one row is selected (`.list.multi`), hover Stage/Unstage IconButton, Enter/double-click act on the selection, Delete → discard w/
                           native confirm; conflicted rows = glyph C, stageable whole-file — the diff header says so, and shows
                           the file with the markers git left in it plus a "Resolve in editor" button → `open_merge_editor`;
                           staging one unresolved drops its index stages for good, so a still-markered file mid-merge/rebase
                           offers "Restore conflict" → `recreate_conflict` (`git checkout --merge`, behind a native confirm)),
                           MessageColumn (summary input + len/72 counter (danger past 72), body textarea, Amend (prefill) / Signed-off-by,
                           author line (cached per repo in commitStore `loadAuthor`) or "Set user.name and user.email" (config error →
                           Commit disabled), Commit (Ctrl+Enter),
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
"N conflicts — resolve in the commit panel" and selects the working-tree row, `nonFastForward` (a rejected push) offers a Pull action while `diverged` (an `--ff-only` pull that already fetched) just says so,
`authFailed` points at the credential helper, `rejected` / `other` show git's message. Rejections are `AppError`s:
`refused` (a safety check, e.g. an unmerged branch) is handed to `onRefused` so the Delete-branch dialog can re-offer
itself as a force delete, `cancelled` is an info toast, everything else goes through `toastError`. Afterwards it refreshes
the status and calls `statusStore.syncRefs()`, which relabels the walk or restarts it when its seeds moved (the backend's own
`repo://changed` arrives too; the seq guards make it a no-op). While an op runs, `opsStore.busy` holds the statusbar text
and disables the toolbar; the streamed output lands in the shared `OutputDock` (elapsed timer + Cancel → `cancel_op`;
a `
` progress segment replaces the previous progress line rather than appending). A non-zero exit expands the dock:
the toast carries only the first stderr line, so the reason is on screen instead of behind a click. An op the user
cancelled is exempt — its kill exits non-zero too, and whoever pressed Cancel already knows why.

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
