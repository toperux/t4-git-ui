# Full smoke re-walk: v1 §1–§7 and post-v1 A–J (2026-09-05)

Both checklists (`docs/smoke-test.md`, `docs/smoke-test-post-v1.md`) walked again in the installed
build made from `b962ba8` (the build that carries every fix from the two earlier 2026-09-05 walks),
on a fresh fixture, driven over CDP. Nothing here is fixed; the list is for a go/no-go on each item.

## Findings

| # | Check | What happened | Expected | Notes |
|---|-------|---------------|----------|-------|
| 1 | E4 commit window | **Commit & Push** from the full-window commit dialog, then `Esc` on the Push dialog → focus lands on `<body>`. | Focus returns to the **Open commit window** button (as it does after a plain commit). | `MessageColumn.tsx:69-78` already reads the commit window's `returnFocus` before the window closes and hands it to the Push dialog, so the value it captured must be empty or stale on this path — log what `returnFocus` holds there when the window was opened from the toolbar button, and whether `DialogHost` overwrites it when the commit window unmounts. Low. |
| 2 | §5 merge conflict | While a merge is in progress the **Commit merge** banner button only opens the commit panel: the Summary is empty and **Commit** stays disabled until the user types something. | The summary is prefilled from `.git/MERGE_MSG` ("Merge branch 'conflict'"), the way `git commit` would. | `RepoWindow.tsx:149` → `openCommitPanel()` only. Read `MERGE_MSG` when the panel opens in the merging state and use it as the initial summary (same for `SQUASH_MSG` if that ever matters). Low–medium. |
| 3 | §5 / H external resolve | A `UU` file whose working copy no longer has conflict markers (resolved in an editor, or by rerere) shows the header "Conflict — stage the file once resolved" over an **empty diff body**. | Either the working-tree diff against the index, or a one-line note ("No conflict markers left — stage the file to mark it resolved"). | Corrected while fixing: nothing filters for markers. `diff.rs::conflicted_file_diff` diffs *ours* against the file on disk, so a working copy put back to ours has zero hunks, and libgit2 emits no content for an unmerged path either (the "ordinary diff" would be empty too). The body already showed the "No text changes" empty state; only the header was wrong. Low. |
| 4 | §6 output dock | After a restart the dock opens at **160 px** (its minimum) on `Ctrl+`` `, not the documented 200 px. Dragging within a session still clamps to 160–320. | Opens at 200 px. | The panel mounts collapsed (`RepoWindow.tsx:112`, `open` is false at launch) and the later `panel.current?.expand()` (`:104`) has no remembered expanded size, so react-resizable-panels falls back to `minSize`. Pass the default: `expand(DOCK_DEFAULT_H)` / `resize(DOCK_DEFAULT_H)` when the panel has never been expanded. Or change the doc to say 160. Low. |
| 5 | §1 start screen | Inside the **filter field**, `Home` / `End` move the list highlight instead of the caret, and `Delete` removes the highlighted recent instead of forward-deleting: with `bare` typed, `Home`, `Delete` → the text stays `bare` and the row is gone. | The input keeps its editing keys; the row shortcuts apply when the list has focus (or `Delete` only with the caret at the end and nothing selected). | `StartScreen.tsx:135-162` `onListKey` is shared by the input and the listbox and calls `preventDefault()` for every handled key. Skip `Home` / `End` / `Delete` when `e.target` is the input (keep `↑` / `↓` / `Enter`). Low. |
| 6 | C run-git-command dialog | The completions list opens **over the Cancel / Run buttons** (list y 230–316 vs Run y 275–303 at 1930×1116), so while it is open Run cannot be clicked; `Esc` closes the list first and then Run is reachable. Keyboard users never notice. | The list should not cover the dialog's own buttons — open it above the field, or push the buttons down while it is open (the dock prompt already opens its list upward). | `CommandInput.tsx` listbox positioning. Cosmetic. |

_Applied 2026-09-05, all six plus the §D items, one commit. #1: the commit window was opened
without a `returnFocusTo` (`CommitPanel.tsx`, `WorkingTreeRow.tsx`), so the Push dialog inherited
the doomed Commit & Push button; both callers now name their opener. #2: `get_merge_message` reads
`MERGE_MSG` (comment lines dropped) and `commitStore.prefillPending` fills the editor whenever
`refs.state` leaves `clean` — banner, `Ctrl+B` and the commit window alike — and takes the prefill
back on abort. #3: the conflict header says "No conflict markers left — stage the file to mark it
resolved" when the diff has no hunks. #4: the dock's first open after a collapsed mount calls
`resize(DOCK_DEFAULT_H)`. #5: the start screen's shared key handler leaves `Home` / `End` to the
input and only takes `Delete` with the caret at the end. #6: the dialog passes `placement="up"`,
which the component already had for the dock. §D: `Menu`'s focus restore only fires when the
closing menu actually dropped the focus (a dialog's `autoFocus` field keeps it); the file lists and
the diff reclaim the focus after the row it sat on unmounts (`held` ref); Shift+↑/↓ clamps at the
hunk edge; the renamed-folder toast detail is the path alone; Tab on a history row appends the
space like every other completion._

## Observations (no action proposed — extends `2026-09-02-next-plan.md` §D)

- **Dialog focus on the Close icon** also happens for the commit window opened from Repository menu ›
  Commit…, Create tag from a commit-row menu, and the Stash dialog; the toolbar and `Ctrl+B` paths
  focus the first field. Same cause as the §D item (menu closes after the dialog mounts).
- **Enter in the diff** (stage the selected lines) drops focus to `<body>`; Enter on a file row kept
  the list focused this time. Refocus the diff region after the stage, as §D proposes for the list.
- **Push / pull success toasts do appear** ("Pushed main → origin/main", "Pulled origin/…"); the
  earlier "not seen" note was timing. Drop that §D item.
- **Tag re-push** toasts "Pushed tag …" while the dock says "Everything up-to-date". Fine.
- **Stash Drop does toast** ("Dropped stash@{0}", re-checked with a 250 ms poll); an earlier
  "no toast" note in the walk was timing, like the push / pull one.
- **Repository menu › Commit…** stays enabled during an operation while Open / recents / Close are
  disabled with the tooltip. Harmless (it only opens the panel), but inconsistent.
- **Dragging the dock below 160 px collapses it** (to the 28 px bar) rather than stopping at the
  minimum. Reasonable; not in the doc.
- **`Tab` in the run-git-command field** completes to `status` without the trailing space the doc
  shows (`status `); typing ` -` then lists the flags. Doc or code, either way.
- **Typed commands never toast** (`fetch` from the prompt twice → no toast) except the rejected
  `push` special case; the doc says so for `fetch nowhere` and the dialog's Run. By design.
- **Whitespace toggle** on the working tree is disabled while staging (documented since the v1
  re-walk); the details pane honours the Settings default.
- The `#32770` native confirms (`ask()` for discard / delete / resolve / restore) do not block the
  webview and can stack silently if a script keeps clicking; a person never sees that.

## Passed

**v1 §1** start screen header / RECENT / START (three cards) / statusbar `git 2.55.0.windows.1` +
`N recent`; restart reopens the last repo; `Ctrl+Shift+W` then restart → start screen with the repo in
RECENT, no auto-open; newest first under the pinned rows; Pin jumps to the top and survives a restart
(Unpin drops the row back to its recency slot); `Delete` removes a row without touching disk; hover
shows Pin / Remove buttons; filter + `↓` + `Enter` opens the row; renamed folder → "Not a git
repository" toast with a working **Remove from list** action; `Ctrl+Shift+O` derives `bare` from
`file:///C:/tmp/t4/bare.git`, typed parent, preview `git clone --progress <url> C:\tmp\t4\clones\bare`,
clone opens the repo with `origin · C:/tmp/t4/bare`, reopen remembers the parent, re-clone into the
same folder → `fatal: destination path … already exists` banner inside the dialog with inputs
preserved, `Esc` closes it.
**§2** tooltip, keyboard navigation, search flat list (no canvas), HEAD scope, sidebar sections and
counts, Tab order, folder collapse, splitters, every context-menu variant.
**§3** details / parent click, glyphs, `↑`/`↓`, split view, flat / tree, `Binary file`, `␍`,
`\ No newline`, whitespace toggle on the committed `hunks.txt`, long paths ellipsize at the start
(`direction: rtl` + `<bdi>`, `title` = full path — checked at 200 px on the `t4-git-ui` repo),
renamed file `src/lib/cloneUrl.ts → src/lib/paths.ts` in row, tooltip and diff header, long lines
scroll inside the diff (`_scroll_` 10 864 > 365 px; document never wider than the window), syntax
classes on `.css` / `.ts` / `.rs` / `.json` (`_synKeyword` … `_synString`), `.gitignore` and
`Cargo.toml` plain; split / tree / whitespace default / commit-panel tree mode all survive a restart.
**§4** external edit badge within ~1 s, multi-select, Enter / double-click / `+` / Stage all / Unstage
all, three hunks, hunk and line staging with exact index contents, keyboard order, unstage hunk /
line, `Delete` → native "Discard changes" / "Delete files" confirms, amend prefill + "Staged
(amending)", 80/72 counter, `Ctrl+Enter` → `$ git commit -F …` / `exit 0`, amend toast, blank
`user.name` → warning + Commit disabled, `index.lock` sticky toast + Retry, pre-commit hook → first
stderr line + dock auto-expands.
**§5** `Ctrl+B` validation (six messages), Force delete re-offer, push dialog + toast, FF pull, fetch
chip + toast, rejected push toast with Pull, FF-only pull "Cannot fast-forward — the branches have
diverged", upstream-following pull, merge conflict toast / banners / markers, external resolve,
stage-with-markers → "Marked resolved…" + Restore conflict, commit clears the banners, rebase
conflict + Abort, branch from row, sidebar double-click checkout, detached banner, tags from row
with previews, annotated message, tag push / re-push / moved tag "(already exists)" / delete on
remote / fetch restores, stash + Apply + Pop + Drop, slow fetch (buttons disabled with the tooltip,
shortcuts ignored, `Ctrl+Shift+W` refused, repo menu disabled, collapsed bar shows the command +
timer + Cancel, cancel → "Cancelled" + `exit 1`), push to `nowhere` → dock expands + error toast.
**§6** dock drag 160–320, collapsed bar shows the last command and exit, toasts stack top-centre
and fade after ~6 s, dialogs `Esc` + focus return (toolbar, sidebar, commit-row menu), dropdown
`↑`/`↓` + `Enter`, `Esc` closes the list only, light-theme surfaces.
**§7** 25 000-line diff truncation banner, `many files (300)` list (virtualized, scrolls to
`many/300.txt`, one-line diff).
**A** merged badges + "Merged into twin-b — safe to delete" tooltips, remote folders.
**B** checkout / track / Checkout branch… / resets Mixed / Hard / `branch -f` / long names.
**C** completions with hints, `Tab`, flags, Run → dock + no toast, `checkout ` list (branches,
`origin/*`, tags), `-i` / `-ip` guard with the inline note and Run disabled, `commit -m -p` allowed,
`commit` with a staged file → "Aborting commit due to empty commit message" / `exit 1`, quoting
round trip (`Runs git commit -m 'two words'` → dock `$ git commit -m "two words"` → commit "two
words"); dock prompt: `Enter` runs and clears, `↑`/`↓` history, list opens upward, `F5` / `Ctrl+B`
inert in the field, "Running…" during an op and `Enter` ignored, `Ctrl+`` ` collapses from the
prompt, history survives a restart, `fetch slow` + Cancel → "Cancelled", `fetch nowhere` → no toast +
`exit 128`, typed rejected push → toast with Pull.
**D** toolbar toggle light ↔ dark, Settings › Follow system tracks the OS (dark) again, light
survives a quit + relaunch (light at the first CDP observation; the first painted frame itself is
not observable this way).
**E** tree view keys, hidden selection, `Ctrl+A` + `Enter`, folder chains, guide lines; commit
window entry points, splitters, mirrored staging, `Esc`, focus return after a plain commit.
**F** Discard lines / hunk / CRLF hunk with CRs intact; no Discard on staged, untracked, conflicted.
**G1** menu items, `Shift+F10`, right-click outside the selection, "4 files", Open / Reveal disabled
for a deleted file, Copy path toast, Reveal → Explorer at `src/lib`, Open → Notepad.
**H** Keep main's / Keep conflict's labels (header and row menu) in both merge and rebase.
**I** `&& git push --progress origin refs/tags/v-pushed` preview, "already exists" inline + Create disabled,
`nowhere` → create toast then failure toast, tag stays local.
**J** bogus git path → inline "git executable not found", old path kept, app keeps working; real
path → `git version 2.55.0.windows.1`; Follow system; Context lines 1 → `@@ -4,3 +4,3 @@` hunks and
**Stage hunk** stages exactly the line-20 change; Ignore whitespace by default → the details diff
opens with the toggle on; every value survives a relaunch.

## Not walked

Native folder pickers (`Ctrl+O` non-repo, `Ctrl+N` empty / existing, Choose folder…, so also I's
"repo without remotes → checkbox absent"), **Resolve in editor** launch, OS theme switch while
running, the first painted frame at launch, DPI change, "Git not found" screen, clone Cancel timing,
the two large-repo performance checks. (§2 native context-menu suppression was walked on Linux the
same day, below; on Windows it was part of the 2026-09-01 hand walk.)

Walked by hand on 2026-09-06 in the installed 0.1.2 build and ticked: the folder pickers (`Ctrl+O`
non-repo, `Ctrl+N` empty / existing), clone Cancel, no theme flash, the OS theme switch, the first
painted frame after a light toggle, both large-repo checks. Over CDP the same day: "Git not found"
(launched with git stripped from `PATH`: the screen, Retry staying put, a relaunch proceeding — the
step now says a relaunch or Locate git… is the fix, since a running process cannot see a `PATH`
change) and I's tag push (preview, two ops, tag on the bare remote, existing name refused inline,
no checkbox in a repo without remotes). Still unticked: Resolve in editor (both steps) and the DPI
change.

Seen on the way: launching the app while an instance was already running left a second, windowless
`t4-git-ui` process that never exited. Traced the same night: it happens only when the new launch's
WebView2 browser arguments differ from the browser process already running on the shared user-data
folder — the walks' `--remote-debugging-port` flag on one side and not the other. WebView2 then
never finishes creating the webview and the process waits on it. Two plain launches open two
windows; two launches both with the flag do too. Not a product bug; `docs/smoke-cdp.md` says to
close every other instance before launching with the flag.

G2 exec bit was walked later the same day on a Linux build of `9f53aff` under WSLg (Ubuntu 24.04,
`npm run tauri build -- --no-bundle`): `chmod +x` + one edited line → header `100644 → 100755 +1 −1`;
**Stage hunk** → `git diff --cached` shows `old mode 100644` / `new mode 100755` plus the hunk, the
unstaged list is empty; **Unstage hunk** puts both back. First look at WebKitGTK rendering: fonts,
dark theme (followed GTK), graph, panels all fine at 1500×1000.

The Linux-only leftovers were walked the same day on the same build (light theme, 121-commit repo
with a 400-line diff): styled scrollbars on the log and the diff (rounded thumb, darker on hover,
wheel and PageDown scroll); the sidebar, grid/details, commit/files and files/diff splitters all
drag, the output dock's top edge drags to ~320 px and collapses to the bar when dragged below its
minimum (its chevron is disabled until a command has run); right-click on the toolbar, a panel
header, the statusbar and the bare diff body → nothing; on the search field → GTK Cut/Copy/Paste
menu; on selected diff text → GTK Copy menu; on a commit row → the app's own menu, Esc closes it.
Note for the harness: a wheel synthesised on the Windows side (`mouse_event`) reaches the webview
unreliably through WSLg; `xdotool click 4/5` inside WSL scrolls every pane.

## Retest of the fixed steps (2026-09-05, installed build from `fe12651`)

The steps whose code the six fixes and the §D items touched, walked again over CDP: start-screen
`Delete` (row at the caret's end, forward-delete mid-text, `Home` / `End` stay in the field),
filter `↑` / `Enter`, renamed-repo toast with the path as detail; Enter-staging keeps the focus on
the list, `Tab` into the diff lands on a line, `Shift+↓` stops at the hunk edge (2 lines of a
2-line hunk after twelve presses), `Enter` stages and the focus stays on a line; staging a hunk in
a 39-hunk `big.txt` holds the scroll offset (3146 → 3128) and a line selection elsewhere; two
selected lines survive an external save; the merge summary is prefilled `Merge branch 'conflict'`,
survives the panel closing and reopening, and the commit clears the banners; the dock opens at
200 px on a fresh launch; `Esc` from a dialog opened from the commit-row menu lands on the grid;
the Run-git-command list opens above the field and leaves Run clickable. All pass; ticked in the
smoke docs.

Two observations, both fixed the same day (the merging state now counts as commit-able in the
working-tree row, the toolbar, the panel's Commit and the status refresh; a hunk button click first
moves the diff cursor to that hunk). Smoke steps added — main §4 after "Hover a hunk header",
post-v1 H after the Keep-ours step — and walked over CDP in the installed 0.1.2 build on
2026-09-06: both pass. Seen on the way: a mouse-started focus paints no cursor ring until the
first arrow key (Chromium's `:focus-visible` rule, the step says so now); after the merge commit a
dirty tree brings the working-tree row back without reopening the panel (the stale-selection case
the review of the fix caught).

- **A merge whose resolution equals HEAD cannot be committed.** Keep main's version on the
  fixture's one-file conflict leaves `git status` empty while `MERGE_HEAD` exists: the working-tree
  row disappears, the toolbar Commit is disabled ("No changes"), and the banner's **Commit merge**
  opens nothing. Only Abort is left, although `git commit` would record the merge. Needs the
  merging state to count as a commit-able change (working-tree row and Commit enabled while
  `MERGE_HEAD` exists).
- Clicking **Stage hunk** with the mouse leaves the focus on `<body>` (the button had it and
  unmounted); the `held` refocus only covers the keyboard path. Cosmetic.

Unexplained: the `t4-git-ui` entry vanished from RECENT at some point during the walk; the Delete
key paths were re-run afterwards and remove only the highlighted row. Restored by hand in
`recents.json`. Watch for it.

## Cleanup done

Fixture rebuilt with `pwsh -File docs/smoke-fixtures.ps1 -Force` (twice: the stash re-check
afterwards stashed and dropped the fixture's edits); `C:\tmp\t4\clones` and
`.playwright-mcp/` deleted; `work` unpinned; Settings back to Follow system / 3 context lines /
whitespace default off; details pane back to Flat list + Unified view, commit panel back to list
mode; the app is on `work` / `main`. Left over: the `other` entry is gone from RECENT (the `Delete`
check) and comes back on the next open; Notepad has an extra `b.txt` tab from the G1 Open check.
