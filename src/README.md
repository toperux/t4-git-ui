# `src/` — frontend (React 19 + TS + Vite, Tauri 2 webview)

```
src/
  main.tsx                 mounts App; imports fonts.css → tokens.css → base.css; LucideProvider (16px, stroke 1.75)
  App.tsx                  probe_git → GitMissingScreen | no repo → StartScreen | repo → RepoWindow; loads recents and restores
                           this window's tabs inside one try/catch (a failure lands on the start screen, never on the spinner):
                           `take_pending` (the tabs this window was created with) → else, in `main`, `take_layout` (the windows
                           of the last exit — the first entry's tabs here, `spawn_window` for each of the others) → else the
                           old `lastOpen`, which is the migration for a first launch without a `layout.json`;
                           mirrors `tabsStore` into recents (touch per open, `lastOpen` = the active tab) and reports
                           `set_layout` on every tab change; an event for a repository that is not the active tab marks that
                           tab stale; `settings://changed` from another window reloads `settingsStore`; the automatic update
                           check runs in `main` only; `listenTabDrags` is mounted here, not in the strip, so a window with
                           one tab or none can still be dropped on
  api/
    types.ts               TS mirror of the Rust IPC contract (serde camelCase) — edit only together with the Rust structs
    ipc.ts                 `call()` (the one `invoke` wrapper) + one typed function per command, including the start-screen
                           cloneRepo {url,dest,recurseSubmodules,depth?} / initRepo {path} → RepoSummary; every
                           rejection is an AppError {kind, message}; isAppError/toAppError
    events.ts              onLogProgress / onRepoChanged / onOpEvent / onSettingsChanged (cb) → unlisten  (`log://progress`,
                           `repo://changed`, `op://event`, `settings://changed` — broadcast by emitSettingsChanged after a
                           preference is written, so every window re-reads it) and onTabSpawnFailed (`tab-spawn-failed` —
                           the window some moved tabs were promised never opened, so all of them come back here);
                           onOpEventReady / onUpdateProgressReady (cb) → Promise<unlisten> for callers that must be listening
                           before they invoke (`op://event`, `update://progress` — the update download's percent, `null` until
                           the total size is known)
  store/
    tabsStore.ts           zustand: tabs [{id, path, name, stale}], active, saved {<RepoId>: Snapshot}; openTab (open_repo first —
                           the id is what a tab is compared by, and `openElsewhere` means another window has it and was
                           focused, so nothing happens here), activate (snapshot the active slices, restore the target's,
                           close the dialog, refreshAll), closeTab (always `close_repo`; the last tab closes a secondary
                           window and leaves the main one on the start screen), markStale, detach (a no-op with one tab; spawn_window, then close
                           the tab — never the other way round), reorder, setCaret (the slot a tab dragged from another
                           window would land in). Snapshot = repoStore (minus gitVersion) +
                           statusStore + commitStore + diffStore (minus the window-level view settings), each store owning
                           its own `snapshot()` / `restore()` beside its `reset`
    repoStore.ts           zustand: repo, refs, log {generation,total,complete,error,flat} (a page response never lowers `total`
                           nor clears `complete` — a late page must not undo a newer `log://progress`), sparse rows[], selection (commit index +
                           wtSelected for the working-tree row), reveal,
                           remoteTags {<remote>: {tags: RemoteTag[], at}} = each remote's tags when it last answered (git keeps no
                           local record of them), `at` = when it answered (the folder row and the badge's tooltip date it),
                           `{}` until one does; persisted through lib/kv as `remoteTags:<repo.id>` and read back on open
                           (an entry from the old single-remote shape is ignored, not migrated)
                           actions: openRepo (open_repo → startLog awaited — the spinner waits for the grid — then refreshRefs
                           unawaited, its own "Couldn't load branches" toast; the sidebar says `Loading branches…` until refs land),
                           closeRepo, refreshRefs, refreshRemoteTags({remotes?, announce?}) (`remote_tags` per remote in parallel,
                           every remote in `refs.remotes` by default; run by `runOp({remote})` with the remote the op talked to
                           (`true` = all) after fetch/push/pull/delete-on-remote when it answered — not after `authFailed` / `other` — and by the tag row's Refresh remote tags with announce;
                           each answer merges into the current state and prunes remotes that are gone, a failure toasts
                           "Couldn't check <remote> for tags" and keeps that remote's entry, `announce` toasts the counts), refreshLabels (re-fetch the pages
                           around the last `ensureRows` viewport, drop the rest so they reload lazily), startLog,
                           ensureRows (500-row pages, dedupe, stale drop), select, selectWorkingTree, revealOid,
                           noteTopRow (the grid's first visible row, `-1` = the working-tree row: module state, nothing renders
                           from it; a remounting grid skips its first report, which carries the range from before the scroll it
                           asked for in the same commit). The scroll position is the grid's own DOM state, so that row is what puts a viewport back —
                           `snapshot()` carries it as a `start`-aligned reveal (a tab returns where it was, not where the tab
                           being left is) and `startLog` anchors on it by oid, so the rows a fetch adds above the viewport
                           scroll under it instead of pushing it down; not from the top row, where new commits belong in view.
                           `reanchor` waits for the walk to reach that row exactly as `reselect` does (`onProgress`): the
                           restarted walk's first page usually comes back short, so a deeper viewport is not findable on the
                           first pass. The grid clears `reveal` once it has scrolled — it unmounts on the Changes view switch,
                           and a standing request would be answered again from an older walk's numbering;
                           a page rejected with `staleGeneration` restarts the walk, any other kind toasts once (never loops);
                           `__resetForTests()` clears the module-level page bookkeeping.
                           filter {text, workingTree, path}: `path` is the file history filter (§3) — `flat` counts it, so the
                           graph is not laid out and rows carry `path` = the name the file had at that commit
    diffStore.ts           zustand: selected commit → files (get_changed_files), selectedPath (default first, or `load`'s
                           `preselect` — the history row's own file, seeded into `treeSelection` too so the Files tab follows;
                           a path the changed list names differently falls back to the first file), diff (get_file_diff with `context` — 3 unless Settings says otherwise;
                           setContext reloads),
                           stale responses dropped via seq counters; view unified|split (localStorage.diffView), ignoreWhitespace,
                           fileListMode flat|tree (localStorage.fileListMode).
                           Files tab (§1): tab changes|files, tree (list_tree = every file of the target revision — the *to* commit of
                           a compare, the index for any working-tree target, via `treeTargetOf`), treeFilter, treeSelectedPath +
                           content (read_file), all four seq-guarded like the diff. `loadTree` runs only for the tab on screen and
                           caches listings by target (20 kept, evicted oldest-first; two targets whose reply carried the same tree oid
                           share one array — the oid cannot spare a commit's *first* call, since only the reply names its tree); the
                           working tree is never cached. `treeSelection` remembers the file per target so switching back resumes there;
                           `__resetTreeCacheForTests()` clears both maps.
                           Blame (§2): blame (get_blame), blameOn (a view mode: it stays on for the session as the selection moves),
                           blameLoading / blameError, seq-guarded too. `setBlameOn(true)` loads; `loadContent` asks for the gutter
                           alongside the text whenever it is on, so another file or another commit re-blames, and
                           `toggleWhitespace` does the same (the option *is* blame's `-w`). `selectTreePathAt(oid, path)` writes
                           `treeSelection` for a commit that is not the target yet — what makes the drill-down land on the same
                           file, since revealing a commit reloads this store from the grid selection
    statusStore.ts         zustand: WorkdirStatus; refresh (seq-guarded) / scheduleRefresh (100 ms debounce); onChanged(`repo://changed`):
                           any kind → status; refs|rescan → syncRefs (refreshRefs → walkSeeds moved ? startLog : refs changed ?
                           refreshLabels : nothing) — coalesced into one in-flight run, never rejects;
                           walkSeeds = the oids the walk is pushed from (HEAD for `head`; + branches, remote branches and
                           tags for `all`), so a fetch that moves origin/* re-walks instead of only relabelling;
                           a clean tree clears wtSelected (unless mid-merge); useShowWorkingTree() = (dirty || merging) && !flat; follows repoStore.repo;
                           nothingToCommit() = for imperative callers: a fresh status (the refs agree with it), state
                           `clean` and a zero count — a status from another state answers false rather than "clean", and
                           an unfinished merge / rebase / pick still owes a commit however empty the tree is;
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
                           stageHunk/stageLines (reverse for staged; every hunk / line action sends the context and rename hint the *shown*
                           diff was built with, and a diffStore `context` change reloads the panel diff first),
                           discardHunk/discardLines (native ask, then `discard_hunks` / `discard_lines` — `git apply -R` on
                           the working tree; dropped with a toast when the diff was replaced during the confirmation),
                           resolveConflict(paths, side, label) (ask, then
                           `resolve_conflict` = `checkout --ours|--theirs` + add; a path whose chosen side the other branch
                           deleted is resolved as a removal instead), setAmend (get_head_message prefill), prefillPending
                           (get_merge_message prefill when `refs.state` becomes `merge` / `cherryPick` / `revert`, taken back on
                           abort; `{staged: true}` for a `--no-commit` pick, which leaves the state clean), useMessage, commit
                           (→ oid | null, clears the editor incl. after an amend, msgHistory, toast, status + refs refresh,
                           then leaves the Changes view when the commit took the last change — `nothingToCommit()` and a
                           count taken before the commit, so an amend on an already-clean tree empties nothing and stays;
                           off by `autoCloseChanges`),
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
    settingsStore.ts       zustand: diffContext / ignoreWhitespace / gitPath (+ gitVersion, gitError) / autoUpdateCheck (ask GitHub
                           at launch; nothing stored means on, so only opting out is persisted) / autoCloseChanges (same rule:
                           leave the Changes view after a commit that empties the tree) from lib/kv; load() after the
                           git probe seeds diffStore; setters persist and apply at once (setGitPath clears gitError, probes through
                           set_git_path and keeps only a working path; the version is mirrored into repoStore;
                           clearGitError on edit).
                           tools {diff, merge} come from the global git config instead (get_tools in load(); setTool writes
                           through set_tool and keeps the result, so the diff header follows a Settings change at once).
                           Theme stays in theme/theme.ts
    updateStore.ts         zustand: info (UpdateInfo{version, installable, releaseUrl} — the release newer than this build, `null`
                           when there is none), checked (a check *came back*: `info === null` alone can't tell "nothing newer"
                           from "nobody asked", and a failed check answers neither), checking, installing,
                           progress (download percent, `null` while the total size is unknown), error;
                           check() (check_for_update — run at launch when settingsStore.autoUpdateCheck, and by Settings' Check now)
                           and install() (subscribes to `update://progress` *before* invoking install_update, then never comes
                           back: the app restarts into the new version — so only its failures land in `error`).
                           Settings › General › Updates and the UpdateBadge on both screens read the same answer
    dialogStore.ts         zustand: one `DialogSpec` at a time — open(spec, {returnFocusTo}) / close(); DialogHost renders it
                           and feeds `returnFocusTo` to `Dialog` through `DialogReturnFocus`
    toastStore.ts          zustand: toasts (info|success auto-dismiss after 5 s, errors persist until dismissed);
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
                           externalTools.ts (TOOLS: the ten premade diff / merge tools — git's name, PATH names, install paths
                           (Windows first, then the macOS .app bundle), diff and merge argument lines; TEMPLATES = the ones
                           this platform offers (`windowsOnly` hides WinMerge / TortoiseGitMerge off Windows), IS_WINDOWS /
                           IS_MAC, CUSTOM, command(path, args), templateArgs, toolLabel; data only,
                           the search and the `$LOCAL` substitution run in Rust),
                           branchName.ts (validateRefName: the check-ref-format subset — spaces, `..`, `//`, leading `-`,
                           leading/trailing `/`, trailing `.`, `.`-leading or `.lock`-trailing components, bare `@`, `@{`,
                           `~^:?*[\` + control chars, reserved, already taken)
                           highlight.ts (langForPath → lezer grammar, code-split + loadLang on first use; highlightLine(lang, text)
                           parses ONE line → {text, cls}[] spans, 5k-entry LRU; cls ∈ keyword|string|comment|number|type|function|punct)
                           freshStatus.ts (freshStatus(status, refsState) → the status only while its `state` still matches the
                           refs'; a scan from another state predates the change and reads as "not known yet", never as clean.
                           The one rule the banners, the walk seed, the pseudo-row, the drop-selection check and the rebase
                           dialog's autostash all route through — pure, so store-free `banners.ts` can use it too)
                           hunkPrint.ts (hunkPrint(hunk) → an 8-hex FNV-1a print of the header and each line's sign, text and
                           no-newline flag: what a hunk / line action names the hunks it touched with. git-core's
                           `patch::hunk_print` is the twin — it prints the diff it rebuilds and refuses the action when the
                           two differ; one vector pinned in both test suites keeps them in step)
                           dialogCapability.test.ts (no module of its own: it reads src-tauri/capabilities/default.json and
                           demands a permission for every `@tauri-apps/plugin-dialog` export `src` imports, mapping
                           ask / confirm / message all to the `message` command they invoke. A missing one fails only at
                           runtime — the call rejects "not allowed by ACL" and each site reads that as a decline — and every
                           other test mocks the plugin, so nothing else would notice)
  components/ui/<Name>/    one folder per style-guide component: <Name>.tsx + <Name>.module.css (incl. StatusGlyph A/M/D/R/U/C,
                           Checkbox, Kbd (the one shortcut-chip anatomy, used by MenuItem + StartScreen),
                           DisabledHint (a control that is `disabled` **and** carries a `title` gets wrapped in a
                           `role="none"` span holding that title: Chromium gives a disabled control no pointer events, so its
                           own tooltip never fires, and that title is usually the reason it is dead. Button, IconButton,
                           MenuItem and ToolbarButton route through it — Select, TreeRow and SectionHeader render their own
                           buttons unwrapped. IconButton only passes a `title` through (its `label` alone no longer hints).
                           The span is always there, `display: contents` (boxless, no title) until both are true, so the control
                           never remounts when an operation disables it and a node someone captured — a toast's focus return,
                           a dialog's return-focus target — stays live; a
                           caller whose wrapper must be a block box passes `className`, which *replaces* the default one
                           rather than joining it, since two classes both setting `display` would be settled by stylesheet
                           order),
                           CommandInput (`$ git …` field + portalled completion list from lib/gitCompletions, above or
                           below; completes the word at the caret and keeps what follows it; focus stays in the field via
                           aria-activedescendant; Tab/Enter accept, Enter alone submits, Escape closes the list before the
                           dialog sees it, ↑/↓ walk the history — the walk resets on submit),
                           Input + Select (`<option>` children, `onChange` shaped like a native change; the list is
                           app-drawn and portalled — a native <select> popup is an OS window that ignores the theme),
                           BusyOverlay (scrim + spinner card while repoStore.opening is set; rendered once in App.tsx
                           so it covers the start screen and a toolbar-menu repo switch alike),
                           Menu/MenuItem/MenuSeparator (anchor + dropdown, Esc handled on the menu itself so a surrounding
                           Dialog stays open, outside click, ↑/↓, `kbd` hint, `align`, focus back on the trigger,
                           the full label as a `title` when the row ellipsizes)
                           + ContextMenu (portal at a viewport point, clamped) + MenuRef (a branch name inside an item:
                           mono, chip colours for local / remote), ThemeToggle (Sun/Moon, theme/theme.ts `toggleTheme`),
                           UpdateBadge (sm primary Button beside the Settings gear on both screens, hidden until a check found
                           a version — a shortcut into Settings › General › Updates, where the check and the install live),
                           Progress (4px pill; indeterminate sweep, or `value` 0–100 = a filled bar + aria-valuenow),
                           Toast + ToastStack (a click anywhere on a toast dismisses it — not its buttons, and not its detail, which stays selectable),
                           Dialog (440 / `.wide` 560 / `full` = the window minus a margin, unpadded body, footer optional,
                           optional `tabs` row between the title and the body — outside the body because the body is what
                           scrolls — over `--scrim`, portal, Esc closes, Enter submits, Tab trapped (skipping controls
                           inside a `hidden` panel, which a tabbed dialog has), focus
                           restored, aria-modal) + Field / FieldRow / Options / DialogText / Mono)
  screens/
    StartScreen/           recents list (filter, keyboard, pin, remove) | Open / Clone… / Initialize… cards + shortcuts;
                           CloneDialog.tsx (components/ui/Dialog with `busy`; form → progress mode); the gear opens
                           SettingsDialog from local state (no DialogHost here), and so does Ctrl+,
    SettingsDialog/        Settings (wide Dialog, Close only — fields apply on change; context lines on blur / Enter; the git path on
                           Apply, Enter or Locate…) in three tabs of the Dialog's `tabs` row, ←/→ to switch, every panel kept
                           mounted so a tool section's uncommitted edits survive a switch and the row disabled while an update
                           downloads (Updates is under General and a download disables Close): General (Theme — Light / Dark /
                           Follow system → theme.setTheme; Sidebar; Changes — one checkbox, autoCloseChanges; Updates), Git (Git executable — path, Locate…, Apply →
                           version or error inline; Signing), Diff & merge (Diff — context lines 0–99, ignore whitespace by
                           default; Diff tool; Merge tool) — backed by store/settingsStore
                           ToolSection.tsx × 2 (Diff tool / Merge tool): template Select (None | ten TOOLS | Custom) → findTool
                           fills Path (a stale lookup is dropped by a pick counter) and derives Command until the user edits it;
                           Locate… = the same file picker, Suggest re-runs the lookup, Custom adds a free Name (validateRefName);
                           Apply (or Enter in Path / Command) → settingsStore.setTool → git config, toast — None clears it
                           SigningSection.tsx (Signing): get_signing (no repo → global values, nothing `local`) → gpg.format Select,
                           user.signingkey, gpg.program / gpg.ssh.program for the matching format, commit.gpgsign / tag.gpgsign
                           checkboxes; each change → set_signing (global config only), a repo's own entry shown as a hint
    GitMissingScreen/      probe_git failed → "Git not found" + Retry + "Locate git…" (file picker → set_git_path, kept in kv `gitPath`;
                           Settings edits the same key)
    RepoWindow/            RepoWindow (layout: [TabStrip] / toolbar 40 / sidebar 260 or rail 36 | StateBanners + (History: grid ÷
                           DetailsPane | Changes: ChangesBar + CommitPanel) / dock / statusbar 24; viewStore picks the view,
                           layout.ts the tiers from the window width; hosts DialogHost, CommandPalette, useShortcuts),
                           layout.ts (pure `layoutFor(width)` + the `useLayout` / `useToolbarTier` hooks behind it: the
                           `RAIL_BELOW 1000` / `TIGHT_BELOW 1340` / `ICONS_BELOW 800` breakpoints turned into
                           `{details: 3col|2col|narrow, commit: 3col|2col, railAuto}`, the toolbar tiering itself from its own contents — the one place
                           a breakpoint number appears, memoised so the object is stable per width),
                           Toolbar (leftmost is the sidebar toggle — the one collapse/expand control, pressed while the
                           sidebar shows, Ctrl+Shift+`; then the repo menu = open repository name → folder picker / other recents / move to new window /
                           close tab, Fetch = split
                           button: click → default remote w/ prune, ▾ → the Fetch dialog (remote, prune, tags), Pull / Push
                           dialogs + ahead/behind counts, Branch and Stash menus, the ViewSwitch where the Commit button was,
                           Repository menu › Commit… / Run git command…, a Command palette IconButton (Ctrl+K) and ThemeToggle
                           beside the Settings gear
                           (dialogStore kind `settings`); the file-history chip (§3) sits left of the search box at the same
                           height — "History: <basename>", the full path as its title, × clears `filter.path` and nothing else;
                           `useToolbarTier()` tiers it — `tight` drops the operation labels (icon + count) and narrows the
                           search, `icons` shows the repo icon alone, compacts the switch, swaps the search for SearchPopover
                           and folds Branch ▸ / Stash… / Refresh / theme / Settings / Command palette into a `⋯` Menu, the
                           palette button staying out of it;
                           every op button disabled while one runs),
                           ViewSwitch.tsx (the `History | Changes` segmented control over `viewStore.view`, Changes carrying
                           the working-tree change count; `compact` = icons only, for the toolbar's `icons` tier),
                           ChangesView.tsx (the Changes view: ChangesBar — `Changes on <branch> · N unstaged · M staged
                           [· K conflicted]`, or `· nothing to commit`, with Stash… beside the counts and a close (×) button at its right — over the
                           CommitPanel, or over the "Working tree clean" EmptyState beside the MessageColumn on a clean,
                           un-merging tree),
                           SearchPopover.tsx (the `icons` tier's search: an IconButton and, portalled under it, the search
                           Input + branch filter Select + the file-history chip; Esc or a click outside closes it),
                           Sidebar (one `role="tree"` per section with a roving tabIndex; branches with `/` nest in
                           folder rows under Local and under each remote; a `mergedInto` branch (never the current one, nor a protected main / master / remote-default) is muted with a
                           `merged` badge; rows whose ref is the selected commit are tinted (`selectSelectedOid`; collapsed
                           folders holding one too), the checked-out branch being the check + semibold only;
                           context menus per ref kind on right-click / Shift+F10, double-click = checkout;
                           flat Worktrees (only past one) and Submodules (only when there are any) sections after Stashes,
                           whose own headers carry Add worktree… / Prune and Update all; Stashes starts collapsed like Tags,
                           its header carries the stash-browser button, and a stash row previews the entry in the pane
                           (`repoStore.preview`) — stash commits are never walked, so there is no row to reveal),
                           SidebarRail.tsx (the sidebar below 1000px, or whenever the toolbar toggle says so: a 36px `nav` of one button
                           per section with its count — Worktrees and Submodules only when there are any — where a click opens
                           that section as a 260px flyout holding `<Sidebar only={section} />` — which scrolls when the
                           section outgrows it — closed by Esc or a click outside; the toolbar's leftmost button is the only
                           collapse/expand control),
                           TabStrip.tsx (shown above the toolbar with two tabs or more: repo name, path as the title, stale
                           dot, ×, middle-click closes, + opens a repository, row menu Move to new window · Copy path · Close;
                           pointer capture drags a tab (`useTabDrag`) — inside the strip it reorders, outside it a ghost follows
                           the cursor and Rust says which window is under it: `drag_over` draws that window's caret, `drop_tab`
                           hands the tab over or tears it off into a new one; the same hook makes the toolbar's repository
                           button a handle for the active tab, with no reorder phase, so the single tab of a window whose strip
                           is hidden can still be dragged out),
                           actions.ts (fetchDefault / checkout* / stash* / copyText / blameAt / refreshAll / switchRepo / pickAndOpenRepo /
                           closeTab / detachTab / quitApp / runGit, plus the banner aborts merge/rebase/cherryPick/revertAbort and
                           bisectMark(term, oid?) / bisectReset (a mark with no bisect running starts one first — decided in
                           `bisect_mark` from the repository's own state, two git calls under one op lock) — the git ones
                           through runOp; runGit with `quietFailure`: no toast on a
                           non-zero exit unless conflicts / auth / non-fast-forward / diverged, the dock's exit line says it;
                           busyLabel cuts the label by code point with a marker runOp keeps;
                           blameAt(oid, path) is every way into blame — Files tab + `selectTreePathAt` + the gutter on, then
                           `revealOid`, which misses under a filter or a `Head`-only spec and toasts "Not in the current view";
                           showHistory(path) is every way into file history (§3) — `startLog` with `filter.path`, the caller
                           having resolved the file to its tracked name; openCommitPanel clears both filters, since either flattens
                           the walk and hides the pseudo-row that mounts the panel),
                           banners.ts (pure refs+status → detached | merge | rebase (Abort · Skip · Continue; with
                           nothing conflicted and the status agreeing with refs about which state it was scanned in,
                           the text is the `edit` / exec pause, not "resolve conflicts") |
                           cherryPick | revert (each Abort +
                           the way forward: Commit for merge / pick / revert, Continue for rebase) | sequencer (bisect:
                           Good · Bad · Skip · Reset, all on HEAD, with the counts from `refs.bisect`; before a good mark
                           git has not moved HEAD, so that text asks for one and only Reset is offered) | conflicts banners),
                           useShortcuts.ts (Ctrl+Shift+U push, Ctrl+Shift+L pull, Ctrl+Shift+S stashes, Ctrl+Shift+R run git command, Ctrl+B branch,
                           Ctrl+F5 fetch, F5 refresh; Ctrl+Tab / Ctrl+Shift+Tab cycle tabs, Ctrl+W (Ctrl+Shift+W) close tab,
                           Ctrl+T open, Ctrl+1..9 jump, Ctrl+Shift+N move to new window, Ctrl+, settings; Ctrl+` and the tab keys also inside
                           text fields — Ctrl+` is the only way out of the dock prompt; Alt+1 / Alt+2 History | Changes,
                           Ctrl+Shift+` sidebar rail ↔ full (matched on `e.code`: shifted, the key is layout-dependent),
                           Ctrl+K command palette (toggles; every other shortcut sleeps while it is open); Ctrl+Shift+` and
                           Ctrl+K also work inside text fields),
                           CommandPalette/ (Ctrl+K: commands.tsx builds every Command — Views, Repository, Branch, Stash,
                           Network, Go to branch, Repositories, Window — from a context the panel gathers off the stores, each
                           with the id Recent remembers and the same disabled reason the toolbar gives; rank.ts scores a query
                           per label (prefix 3 / word start 2 / subsequence 1), orders groups by their best row and rows
                           within a group best first, so a group stays under one label; an empty query
                           leading with Recent; paletteStore.ts holds `open` + the last three ids (localStorage
                           `paletteRecent`); CommandPalette.tsx is the scrim + panel — input, grouped options with
                           aria-activedescendant, ↑/↓ Enter Esc — which hands the focus back where it found it on close),
                           dialogs/ (DialogHost + OpsDialogs Push/Push tag + Delete remote tag (`refs/tags/<name>` with a
                           remote picker, from the sidebar tag menu)/Pull/Fetch/Merge/Rebase — Merge and Rebase take a commit oid as
                           well as a branch, shown as an extra 7-char option; a commit merge defaults to git's
                           `Merge commit '<short>'` message — and PickDialog (kinds `cherryPick` / `revert`, one commit
                           from its row: Commit right away (off → `-n`, the change lands staged and the panel is
                           prefilled from `MERGE_MSG`), cherry-pick's Record the source commit (`-x`), and a Mainline
                           parent Select on a merge commit only (`-m N`)), RefDialogs Checkout picker /
                           Create-Rename-Delete branch / remote branch / tags, RemoteDialogs Add / Rename / Change URL /
                           Remove (a remote itself), WorktreeDialogs Add (where + an existing or a new branch) /
                           Remove (a refusal re-offers it forced) / Lock, StashDialogs (Stash changes — the fields over the
                           list of files the push will take, `useStashFiles`: tracked changes, untracked while the box is
                           on, nothing during a conflict since git refuses; the button reads `Stash N files` and is
                           disabled on nothing — / one entry's
                           Apply · Pop · Drop, plus the `StashPushFields` and `StashMenuItems` the browser and the sidebar
                           row menu share), StashesDialog (kind `stashes`, the stash browser as a full-window dialog, from
                           the Stash menu, the Stashes header button, the preview's Open browser or Ctrl+Shift+S: a list
                           that starts with a Working tree row — selected, the strip above the list is the push form with
                           a full-width `Stash N files` and the two right panels are the commit panel's FilesColumn |
                           DiffColumn; a stash row brings Apply · Pop · Drop… · Clear all… and ChangedFileList | CommitDiff;
                           a dirty tree opens on the working tree, a clean one on stash@{0}, a push of ours lands on the
                           stash it made; Delete on a stash row drops, ↑/↓ move across the working tree and the entries,
                           and its own effect moves the preview on once an entry is gone),
                           DiffDialog (the selected commit's / compare's / previewed stash's
                           changed files + diff as a full-window dialog, off the diff header's expand button),
                           RunCommandDialog (one
                           CommandInput; Run → actions `runGit`),
                           RebaseInteractiveDialog (kind `rebaseInteractive`, from a commit row or the Rebase
                           dialog's Interactive box: `rebase_todo` reads git's own todo, the rows edit it —
                           action Select, ↑/↓ or Alt+↑/↓, message textarea per reword / squash group, Keep
                           merges vs Flatten, `--update-refs` on git ≥ 2.38 — and `rebase_interactive` replays it),
                           rebaseTodo.ts (pure: TodoLine[] → rows + hidden lines, move / group / squash rules,
                           default messages, `validate`, `toSteps` — the amend goes before the group's
                           update-ref lines, which a pre-amend ref would otherwise orphan);
                           gitArgs.ts mirrors cli/ops.rs
                           for the footer's "Runs `git …`" preview — that file is the source of truth),
                           DetailsPane (bottom pane: CommitDetails — or CompareDetails / StashDetails (stash@{n} + message,
                           the base commit, the untracked count, Apply · Pop · Drop… · Open browser; it takes the pane from
                           the commit panel too) — 340 | ChangedFileList 320 | CommitDiff = DiffViewer, or
                           DiffViewer/FileContent on the Files tab, resizable; the selected row's `path` (§3) rides into
                           `diffStore.load` as the file to preselect, so both tabs open on the file the history is of;
                           an annotated tag pointing at the selected commit adds its own message block under the
                           commit message — `refs.tags[].message` is `null` on a lightweight tag, which is all that
                           tells the two apart once the tag is peeled),
                           OutputDock (collapsed 28px: `$ cmd` + Check/X icon, exit · elapsed / spinner + Cancel; expanded
                           `.output` log + a `$ git` prompt line (CommandInput, list opens upward, stays enabled while an op
                           runs — Enter waits — Enter → actions `runGit`) inside `RepoWindow`'s resizable `DockPanel`, 160–320px, opens
                           at 200 every launch)
      RevisionGrid/        RevisionGrid (virtualized; role=grid wraps the header row + the scrolling rowgroup, owns the keyboard
                           and aria-activedescendant; row 0 = WorkingTreeRow while dirty & unfiltered —
                           commit rows shift by one, store indices stay commit-based; an empty walk is "No history yet" under
                           `filter.path`, else "No matching commits" when flat, else "No commits yet"), GridRow (memo, per-row store selectors),
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
                           mono path + `+N −M`).
                           A `role="tablist"` **Changes | Files** strip sits in the header left of the tree toggle (←/→ switch,
                           the selected tab is the only tab stop): Files lists the whole revision through the same virtualized
                           body, `buildFileTree` / `flattenTree` and keyboard handler — rows show name + size, no status letter,
                           and its folders start **collapsed**, so its session set holds what was *opened* and `flattenTree` is
                           asked the negation (hence its `{has}` parameter rather than a `Set`). The filter `Input` is a second
                           header row of its own, rendered only on that tab (case-insensitive substring, flattens to matches,
                           2000 rows then a "N more matches" Banner) — the Diff dialog's list panel goes down to 180px, where
                           tabs, toggles and a field do not fit on one row.
                           FileRowMenu.tsx (right-click / Shift+F10 on a row of either tab — the row becomes the selection
                           first: Copy path, Open (a commit's file as a temp copy of its blob, the working tree's in place),
                           Reveal in folder (working-tree target only), Save as… (`@tauri-apps/plugin-dialog` `save` →
                           `save_file_as`, the whole blob), Blame (§2 — `blameAt` the target's commit, so the Changes tab hands
                           over to the Files tab), History (§3 — `showHistory` on the row's path, always offered: a listed file is
                           a file some commit has) and Show in Changes, which only appears on the Files tab for a
                           path the commit actually changed and switches tab + selection. All reads, so nothing here is
                           disabled while an operation runs).
                           fileTree.ts (pure: nest by `/`, folders first; a chain of single-child folders folds into one
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
                           scrolls back to the top only when the file path changes;
                           `onOpenExternal` adds an "Open in diff tool" IconButton beside the expand one — `open_diff_tool`
                           (git-core tools.rs writes the two sides to a per-user temp dir and spawns the configured tool —
                           split with no shell on Windows, `sh -c` with the variables in the environment on unix; an unstaged
                           diff's right side is the working file itself), greyed while settingsStore has no `tools.diff`,
                           and the same store makes "Resolve in editor" name the merge tool in its tooltip
                           diffRows.ts (pure: flattenUnified (rows carry hunk/index) / flattenSplit), lineSelection.ts (pure: clickLine, toPairs),
                           FileContent.tsx — the Files tab's right-hand side and a **sibling** of DiffViewer, not a mode of it:
                           none of the viewer's hunks, staging actions, line selection or cursor model mean anything with one
                           side. It shares the row CSS (`.body.content` = one gutter, no sign column), the exported `LineText`
                           and `groupThousands`, the virtualizer and the truncation / binary notices, and renders `{n, text}`
                           rows with one line-number column; `CommitDiff` picks it while `diffStore.tab === "files"`.
                           The blame gutter (§2) is this component's alone: a "Blame" IconButton in the header (dead with
                           "Blame needs the whole file" on a binary or truncated one), then a left cell per row — the label
                           (`<short> <author> <age>`) on a hunk's first row, the age tint alone on the rest, `role="img"` +
                           `aria-label` so a continuation row still names its commit, and `title` = summary · date · pre-rename
                           path. No tab stop per hunk (virtualized rows would leave the tab order): one roving cursor for the
                           list, ↑/↓ to move it, Enter or a gutter click → `blameAt`, ContextMenu / Shift+F10 or right-click →
                           the hunk menu (Select in graph, Blame parent = porcelain's `previous` commit *and* path,
                           History of this file = `showHistory` on the hunk's own `origPath` — the name its commit knew — and Copy SHA),
                           blameRows.ts (pure: line → {hunk, first, step}; the tint is 5 steps on a **log** scale over this
                           file's own hunk ages, since commit times cluster; blameLabel / blameTitle)
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
                           webview never gets an arbitrary-path opener scope — and Blame (§2), which resolves the working-tree
                           file to **HEAD**: this panel is what the working-tree row renders, so there is no Files tab on it;
                           dead for a path HEAD has never seen and for an unborn HEAD — and History (§3) on the same
                           `oldPath ?? path`, dead with the same reason for a file that has never been committed),
                           FilesColumn (Unstaged + Stage all / Staged + Unstage all — each header button reads "Stage selected" /
                           "Unstage selected" and acts on the selection alone once its own list owns two or more rows,
                           "Stage selected" skipping conflicted ones like Stage all — Unstage never filters, since
                           unstaging always took whatever it was given; virtualized 26px rows, role=listbox
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
working-tree row when changes remain, otherwise the row disappears and the fresh walk selects HEAD. The status refresh also
keeps `filter.workingTree` equal to "the row is shown" and restarts the walk when it flips, which is what gives the row its line
down to HEAD.

## Start screen (M5)

`App` probes git, then `recentsStore.load()` (store plugin `recents.json` through `lib/kv`, `localStorage` fallback; a
corrupt value reads as absent rather than throwing) and restores this window's tabs (see `App.tsx` above; `lastOpen` is the
fallback on the first launch without a `layout.json`). Every tab change touches recents, rewrites `lastOpen` from the active
tab and reports the window's tabs with `set_layout`. Recents are stored already sorted (pinned first, then
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
`status.conflicted` / `status.state` (the `RepoState` the status was scanned in — a status scanned in a different
state predates the change and reads as "not known yet" rather than as "clean"), so it re-derives on every
`repo://changed`.

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
