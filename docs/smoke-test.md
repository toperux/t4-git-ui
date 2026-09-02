# Smoke test — t4-git-ui v1

Manual walkthrough of everything v1 ships. Nothing in this app has been exercised in a real
window: every milestone was verified by unit tests, `tsc`, `vite build`, the `cargo` gates and
headless screenshots of the design canvases. **This checklist is the acceptance gate.**

Run it once end to end before calling v1 done. Tick as you go; note anything surprising with the
step number.

- Dev run: `npm run tauri dev` (logs go to stderr in the terminal)
- Release run: install `target/release/bundle/nsis/t4-git-ui_0.1.0_x64-setup.exe`
  (logs go to a daily file under the OS app-log dir)
- Full shortcut table: `README.md` › Keyboard shortcuts

Everything shipped **after** the 2026-09-01 acceptance has its own checklist,
`docs/smoke-test-post-v1.md`, grouped by feature and pointing back at the section it belongs to.
This file only changes where a v1 behaviour changed.

---

## 0. Fixtures

Build them once; several sections reuse them.

```powershell
pwsh -File docs/smoke-fixtures.ps1   # into C:\tmp\t4; add -Force to rebuild, or pass a path
```

Windows PowerShell works too: `powershell -ExecutionPolicy Bypass -File docs\smoke-fixtures.ps1`.

It creates a bare `bare.git` "remote", a `work` repo, and a second clone `other` for the divergence
checks in §5. `work` holds history with a `feature` branch, a merge, the tag `v0.1.0`, one commit
that is **not** pushed yet (§5 pushes it), the CRLF / binary / no-trailing-newline files §3 checks,
branches sitting on commits for the context-menu checks in §5 (`reset-me`, `twin-a` / `twin-b` /
`origin/twin-remote`, `origin/solo`), a `conflict` branch that conflicts with `main` (§5's merge),
and `hunks.txt` left modified in three hunks for the staging checks in §4. The rest of what it
builds — folder branches, a folder-chain commit, more working-tree edits — serves
`docs/smoke-test-post-v1.md`.

`work` turns `core.autocrlf` off, or git rewrites `crlf.txt` to LF on the way into the index and
the committed blob has no CR left for §3 to show. The script fails loudly if that happens anyway.

A large repo (a `git/git` clone, ~85k commits) is useful for the first two performance checks in
§7; the fixture covers the other two with its `big diff` and `many files` commits.

---

## 1. Start screen (M5)

- [ ] Launch with no previous repo → start screen: header `t4 git ui 0.1.0`, `RECENT` column,
      `START` column with three cards, statusbar shows `git <version>` and `N recent`
- [ ] `Ctrl+O` → folder picker → choose a **non**-repo folder → error toast, stays on start screen
- [ ] Open `C:\tmp\t4\work` → repo window opens; restart the app → it reopens automatically
- [ ] `Ctrl+Shift+W` → back to start screen; restart → no auto-open, but the repo is in RECENT
- [ ] Open a second repo → RECENT lists both, newest first
- [ ] Pin the older one → it jumps to the top and stays pinned after a restart
- [ ] Select a row, press `Delete` → removed from the list (the repo on disk is untouched); hovering
      a row shows an `X` that does the same with the mouse
- [ ] Type in the filter → list narrows; `↑`/`↓` then `Enter` opens the highlighted row
- [ ] Rename a repo folder on disk, click its row → toast with a "Remove from list" action
- [ ] `Ctrl+Shift+O` → clone dialog: paste `file:///C:/tmp/t4/bare.git` → the folder name is derived
      (`bare`); pick a parent folder; footer previews the `git clone …` command
- [ ] Clone → progress line updates live → repo window opens; reopen the dialog → the parent folder
      is remembered
- [ ] Clone again into the same folder → error banner **inside** the dialog, inputs preserved
- [ ] Start a clone and hit Cancel → returns to the form, and the half-written destination folder is
      gone (retry into the same path works)
- [ ] `Ctrl+N` on an empty folder → repo opens in the **empty-repo state**: "No commits yet", branch
      name shown, primary button "Open commit panel"
- [ ] `Ctrl+N` on an existing repo → opens it with an "Already a repository" info toast
- [ ] Launch with git removed from `PATH` → "Git not found" screen; fix `PATH`, press Retry → proceeds

## 2. Revision grid + graph + sidebar (M1)

- [ ] Grid fills progressively: thin progress line under the header, `Loading commits… N` in the
      statusbar, both stop when the walk completes
- [ ] Restart with a repository open → it reopens and the grid shows **commits**, not rows of `—`
- [ ] Toolbar repo button shows the open repository's name (full path as its tooltip); its menu opens
      the folder picker, lists the other recents (switching reloads the whole window) and closes the repo
- [ ] Opening a repository that takes a moment (from the start screen or the repo menu) dims the
      window behind an `Opening <name>…` card until it is ready; a fast open shows no flash
- [ ] Drag the sidebar / grid / details / file-list splitters — each one moves, over a useful range
- [ ] Ref chips come **before** the subject; the HEAD row shows a solid `HEAD` chip then the ringed
      current-branch chip; a branch that is in sync with its remote renders as **one** chip with a
      remote segment (not two)
- [ ] Graph: lanes coloured, merge/branch curves land on the right rows, the HEAD node has a ring
- [ ] `↑` `↓` `Home` `End` `PageUp` `PageDown` move the selection; click a row selects it
- [ ] Click outside the grid → the selected row turns neutral grey (unfocused selection)
- [ ] Tab into the grid with nothing selected → a focus ring is visible
- [ ] Sidebar: Local / Remotes / Tags / Stashes with counts; sections collapse; the current branch is
      bold with ahead/behind counts; `Tab` stops **once** per section, arrows move within it
- [ ] Each count matches the **refs** you can see: Remotes shows total remote branches across all
      remotes (not the number of remotes), local folder rows are not counted
- [ ] Click a branch or tag → grid scrolls to and selects that commit
- [ ] Type in "Search commits" → after ~250 ms a flat list (no graph column); clear it → graph returns
- [ ] Branch scope select `All branches` → `HEAD` → re-walks
- [ ] Right-click a commit row (or `Shift+F10`) → context menu with Checkout (detached) / Create
      branch here… / Reset `<current branch>` to here… / Create tag here… / Copy SHA; a row with a
      branch on it adds Checkout `<branch>` (or Checkout branch… when several sit there), and one
      with a remote branch whose local branch is elsewhere adds Reset `<local>` to `<remote>`…
- [ ] Right-click the toolbar, a panel header or the statusbar → **nothing** (no browser menu with
      Reload / Save as / Print); right-click inside a text field still offers Cut / Copy / Paste, and
      so does selected diff / commit-message / output-dock text

## 3. Commit details + diff (M2)

- [ ] Select a commit → details pane shows chips, summary, body, author, date, SHA, parents
- [ ] Click a parent SHA → the grid scrolls to and selects that commit
- [ ] File list shows status glyphs and `+N −M`; the first file is auto-selected and its diff renders
- [ ] Click files / use `↑` `↓` in the list → the diff follows
- [ ] Toggle **split** view → deletions and additions side by side, fillers on the shorter side;
      restart the app → the mode is remembered
- [ ] Toggle **tree** mode → folders nest and collapse; remembered across restarts
- [ ] Whitespace toggle on `hunks.txt` (working tree) → its middle hunk, an indentation-only change,
      disappears and the other two stay
- [ ] Long paths ellipsize at the **start** so the filename stays readable; hover shows the full path
- [ ] A renamed file reads `old → new` in both the row and the diff header
- [ ] `blob.bin` → "Binary file", no stats, no hunks
- [ ] `crlf.txt` → a faint `␍` at line ends; `nonl.txt` → a muted `\ No newline at end of file` row
      (no `␍` means the fixture repo kept `core.autocrlf` on and its blob is LF — see §0, not a bug)
- [ ] Long lines scroll horizontally **inside** the diff; the window itself never scrolls sideways
- [ ] Syntax highlighting: a `.ts` / `.rs` / `.css` / `.json` / `.py` file shows coloured keywords,
      strings and comments; an unknown extension renders plain

## 4. Commit panel (M3)

- [ ] The fixture leaves `hunks.txt` modified, so the **Working tree** row is at the top of the grid
      from the start; edit `a.txt` in an external editor → within ~1 s the Commit toolbar badge and
      the statusbar counts follow (stage and commit `a.txt` again to get back to the fixture's six
      working-tree changes)
- [ ] Click the working-tree row (or the Commit button) → three columns: Unstaged | Diff | Message
- [ ] `hunks.txt` renders as **three** hunks — an edited line plus an added one, an indentation-only
      change, and a deletion — each with its own `@@` header
- [ ] Multi-select in the lists: click, `Ctrl+click`, `Shift+click`, `↑` `↓`, `Ctrl+A`
- [ ] Stage via `Enter`, double-click, and the hover `+` button; `Stage all` / `Unstage all` work
- [ ] Hover a hunk header → **Stage hunk**; click it → only that hunk moves to Staged
- [ ] Stage a second hunk of the same file straight after → the diff drops that one too; every stage
      updates the view, not just the first (`hunks.txt` has three to work through)
- [ ] Click add/del lines (`Shift` for a range, `Ctrl` to toggle) → the sticky bar reads
      "N lines selected"; **Stage N lines** stages exactly those
- [ ] Keyboard line staging: `Tab` into the diff → the ring lands on a **line**, not the whole pane;
      `↑`/`↓` carry it line to line (and it picks up where a click left it), `Space` toggles,
      `Shift+↑`/`↓` extends within the hunk, `Enter` stages the selection
- [ ] Select a **staged** file → the same actions read "Unstage hunk" / "Unstage N lines" and work
- [ ] An untracked file shows a whole-file note and offers no hunk/line actions
- [ ] **Staging does not jump the view**: stage a hunk in a long file → scroll position and any
      remaining line selection are preserved
- [ ] Save an unrelated file in your editor while lines are selected → the selection survives
- [ ] Select `hunks.txt` **on its own**, press `Delete` → confirm dialog (untracked wording says
      "delete") → discards it. Only that row: the groups slotted in after this one still need
      `gone.txt` deleted and `crlf-hunks.txt` modified
- [ ] Check **Amend** → summary and body prefill from HEAD; the staged header notes amending
- [ ] Type a summary → the counter turns danger past 72 characters
- [ ] `Ctrl+Enter` commits → the output dock shows `$ git commit …` and `✓ exit 0`; the editor clears,
      the grid gains the new commit
- [ ] Amend a commit → after success the editor is cleared and Amend is unchecked
- [ ] With `user.name` unset → a warning line appears and Commit is disabled
- [ ] `touch .git/index.lock` then try to stage → error toast **that stays put** with a Retry action;
      remove the lock, press Retry → succeeds
- [ ] A failing `pre-commit` hook surfaces its first stderr line as a toast, and the full output in
      the dock — which **expands by itself**, no click needed

## 5. Operations (M4)

Use `C:\tmp\t4\work` and the bare remote.

- [ ] **Push** `Ctrl+Shift+U`: remote preselected, "Set upstream" checked when there is no upstream,
      footer previews the exact `git push …`; run it → success toast, ahead/behind clears
- [ ] **Pull** `Ctrl+Shift+L` after committing in `C:\tmp\t4\other` and pushing → fast-forwards, grid
      restarts at the new HEAD
- [ ] **Fetch** `Ctrl+F5` after committing and pushing from `C:\tmp\t4\other` → the fetched commits
      appear in the grid on their own, without pressing F5, and the `origin/main` chip moves with them
- [ ] Commit locally **and** remotely, then Push → "remote has new commits — Pull first" toast with a
      **Pull** action
- [ ] Pull with mode "Fast-forward only" on diverged history → non-fast-forward toast
- [ ] Check out `feature` (it tracks `origin/feature-upstream`, and an unrelated `origin/feature`
      exists too) and Pull → it brings `upstream.txt`; `decoy.txt` means it followed the name
      instead of the upstream
- [ ] Check out `main` first, then **Merge** the fixture's `conflict` branch (from `feature` it only
      fast-forwards) → conflicts toast, working-tree row selected, danger banner "N files have
      conflicts", plus a merge-in-progress banner with Abort
- [ ] Click the conflicted file → the diff shows the file **with its `<<<<<<<` / `=======` / `>>>>>>>`
      markers** (libgit2 reports no content for an unmerged path, so this is built from the index
      stages), the header says "Conflict — stage the file once resolved"
- [ ] **Resolve in editor** in the diff header → VS Code / VSCodium opens its three-way merge editor
      on the file; with neither on `PATH` → an error toast naming `code` and `codium`
- [ ] Save the resolved file from the editor **without touching the app** → the diff in the panel
      loses its markers on its own (the file's status letters don't change when it is resolved, so
      this only works because the entry carries the file's mtime/size)
- [ ] Stage the conflicted file **before** resolving it, then unstage it → it is no longer conflicted
      (git drops the three stages on `add`, and no unstage brings them back), so the header says
      "Marked resolved, but the conflict markers are still here" with a **Restore conflict** button →
      confirm → the file is conflicted again and "Resolve in editor" is back
- [ ] Resolve the conflict (in that editor or any other) → **the file can be staged** (whole-file) →
      commit → banners clear
- [ ] **Rebase** onto a diverged branch, then Abort → the branch is restored, banner clears
- [ ] `Ctrl+B` create branch: try `a b`, `-x`, `a..b`, `.hidden`, `foo.lock`, an existing name →
      inline invalid feedback, Create disabled
- [ ] Create a branch from a **commit row** context menu → it is created at that commit, not at HEAD
- [ ] Double-click a sidebar branch → checks it out
- [ ] Right-click an unmerged branch → Delete… → refused → the dialog re-offers **Force delete**
- [ ] Create an annotated and a lightweight tag from a commit row (right-click → Create tag here…) →
      both land on **that** row, not on HEAD; with a Message the preview reads `git tag -a -m '…' …`
- [ ] Select the tagged row → commit details shows the **annotated** tag's message in its own block
      under the commit message; the lightweight one adds nothing
- [ ] Sidebar → Tags → right-click the annotated tag → **Push…** → preview reads
      `git push --progress origin refs/tags/<name>` → Push → it appears on the remote
      (`git -C <bare> tag`); push it again → "Everything up-to-date"; re-create it locally on another
      commit and push → rejected toast ("already exists"), the remote tag is unchanged
- [ ] Right-click the pushed tag → **Delete on remote…** → pick the remote → preview reads
      `git push origin --delete refs/tags/<name>` → it is gone from `git -C <bare> tag`, still in
      the sidebar
- [ ] Delete a tag from the sidebar (Tags → right-click → Delete…) — local only by default; tick
      **Also delete on the remote** and pick the remote → preview chains the push first → both go;
      untick and delete a pushed tag → the next Fetch brings it back (git's own behaviour: tags are
      not tracked per remote, so the sidebar has no "remote tag" to offer Delete on remote… for)
- [ ] Stash changes → appears in the sidebar; Apply / Pop / Drop from the toolbar menu
- [ ] Checkout a commit (detached) → warning banner with "Checkout <branch>" and "Create branch…"
- [ ] Fetch via the **▾ beside Fetch** (the button itself and `Ctrl+F5` hit the default remote) from
      the `slow` remote (bare.git behind an upload-pack that sleeps 60s — the fixture adds it; a fixture
      built before it: `pwsh -File docs/smoke-fixtures.ps1 -RemotesOnly`, then `F5`), expand the
      dock (`` Ctrl+` ``) →
      elapsed timer + **Cancel**; cancel → toast, buttons re-enable, and the dock does **not** pop
      open on its own (a kill exits non-zero too)
- [ ] Push (toolbar or `Ctrl+Shift+U`), pick the `nowhere` remote (a path that doesn't exist — the
      fixture adds it; a fixture built before it: `-RemotesOnly`, as above) → the dock
      expands by itself with git's "does not appear to be a git repository" line, error toast
- [ ] While an op runs, click another op → "Operation in progress" toast; buttons show that tooltip
- [ ] `Ctrl+Shift+W` during an op → refused with the same toast; the repo menu's Open / recents /
      Close items are disabled with that tooltip (the op would finish against a repository that is
      no longer open)

## 6. Cross-cutting

- [ ] **No theme flash**: on a dark-mode OS the window never flashes light during launch (test both
      dev and the installed release build)
- [ ] Switch the OS theme while the app runs → the UI follows, including graph lane colours
- [ ] Output dock: drag its top edge → resizes between roughly 160 and 320 px (per session — it
      opens at 200 px after a restart); the collapsed bar shows the last command and its exit status
- [ ] Toasts: stacked top-centre under the toolbar; errors **stay** until dismissed; info/success
      fade after ~6 s
- [ ] Every dialog: `Esc` closes it and focus returns to whatever opened it (including when opened
      from a context menu); `Tab` stays inside the dialog
- [ ] Any dropdown (Create branch → Start point, the toolbar branch filter): the list is themed like
      the rest of the app, ↑/↓ + `Enter` pick, `Esc` closes the list only — not the dialog
- [ ] Nothing is pure white on a large surface in light theme; nothing is unreadably faint
- [ ] Drag the window to a monitor with a different DPI → the graph canvases stay crisp

## 7. Performance

The first two need a large repo; the last two use the fixture.

- [ ] Open a `git/git` clone → the walk completes in a couple of seconds; scrolling the grid stays
      smooth while it is still loading
- [ ] Scroll deep into the history, then run `git fetch` from a terminal → the UI refreshes without a
      visible stall (only visible rows refetch their labels)
- [ ] In `C:\tmp\t4\work`, select the `big diff (25 000 lines)` commit and open `big.txt` → the diff
      scrolls smoothly (only visible lines are rendered) and ends in the **truncation banner**, since
      the viewer stops at 20 000 lines
- [ ] Select the `many files (300)` commit → the file list shows 300 rows and scrolls smoothly;
      clicking any of them opens its one-line diff

---

## Expected to be missing (do not file these)

These are recorded in `docs/plans/2026-08-31-git-ui-v1-plan.md` › Known gaps:

- No context menu on the diff body or on the details pane's file list, no interactive rebase / blame /
  file history / submodules / worktrees / bisect / cherry-pick / revert UI, no multi-repo tabs, no i18n
- Syntax highlighting is per line, so block comments and template strings colour line by line
- Hunk/line staging of a **non-UTF-8** file may fail or misapply — whole-file staging is fine
- Native OS titlebar (deliberate)

## Reporting

For anything that fails, note: the step number, what you saw, and the tail of the output dock or the
terminal/log file. Grid, diff and commit-panel issues are usually reproducible from the fixtures in
§0 — mention which one.
