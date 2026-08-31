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

---

## 0. Fixtures

Create these once; several sections reuse them.

```bash
mkdir -p /c/tmp/t4 && cd /c/tmp/t4

# a bare "remote"
git init --bare bare.git

# a working repo with some history, a merge, a tag and a stash
git init work && cd work
git remote add origin /c/tmp/t4/bare.git
printf 'one\n' > a.txt && git add . && git commit -m "first"
git switch -c feature && printf 'two\n' >> a.txt && git commit -am "feature edit"
git switch - && printf 'main\n' > b.txt && git add . && git commit -m "main edit"
git tag v0.1.0
git merge feature -m "merge feature" || true
git push -u origin HEAD

# CRLF + binary + no-trailing-newline files, for the diff viewer
printf 'x\r\ny\r\n' > crlf.txt
printf '\x00\x01\x02binary' > blob.bin
printf 'no newline' > nonl.txt
git add . && git commit -m "odd files"

# a second clone, to create divergence later
cd /c/tmp/t4 && git clone bare.git other
```

A large repo (a `git/git` clone, ~85k commits) is useful for the performance checks in §7.

---

## 1. Start screen (M5)

- [ ] Launch with no previous repo → start screen: header `t4 git ui 0.1.0`, `RECENT` column,
      `START` column with three cards, statusbar shows `git <version>` and `N recent`
- [ ] `Ctrl+O` → folder picker → choose a **non**-repo folder → error toast, stays on start screen
- [ ] Open `/c/tmp/t4/work` → repo window opens; restart the app → it reopens automatically
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
- [ ] Click a branch or tag → grid scrolls to and selects that commit
- [ ] Type in "Search commits" → after ~250 ms a flat list (no graph column); clear it → graph returns
- [ ] Branch scope select `All branches` → `HEAD` → re-walks
- [ ] Right-click a commit row (or `Shift+F10`) → context menu with Checkout / Create branch here… /
      Create tag here… / Copy SHA
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
- [ ] Whitespace toggle on an indentation-only change → the hunk shrinks or disappears
- [ ] Long paths ellipsize at the **start** so the filename stays readable; hover shows the full path
- [ ] A renamed file reads `old → new` in both the row and the diff header
- [ ] `blob.bin` → "Binary file", no stats, no hunks
- [ ] `crlf.txt` → a faint `␍` at line ends; `nonl.txt` → a muted `\ No newline at end of file` row
- [ ] Long lines scroll horizontally **inside** the diff; the window itself never scrolls sideways
- [ ] Syntax highlighting: a `.ts` / `.rs` / `.css` / `.json` / `.py` file shows coloured keywords,
      strings and comments; an unknown extension renders plain

## 4. Commit panel (M3)

- [ ] Edit a tracked file in an external editor → within ~1 s the **Working tree** row appears at the
      top of the grid, the Commit toolbar badge and the statusbar counts update
- [ ] Click the working-tree row (or the Commit button) → three columns: Unstaged | Diff | Message
- [ ] Multi-select in the lists: click, `Ctrl+click`, `Shift+click`, `↑` `↓`, `Ctrl+A`
- [ ] Stage via `Enter`, double-click, and the hover `+` button; `Stage all` / `Unstage all` work
- [ ] Hover a hunk header → **Stage hunk**; click it → only that hunk moves to Staged
- [ ] Click add/del lines (`Shift` for a range, `Ctrl` to toggle) → the sticky bar reads
      "N lines selected"; **Stage N lines** stages exactly those
- [ ] Keyboard line staging: focus a line, `Space` toggles, `Shift+↑`/`↓` extends within the hunk,
      `Enter` stages the selection
- [ ] Select a **staged** file → the same actions read "Unstage hunk" / "Unstage N lines" and work
- [ ] An untracked file shows a whole-file note and offers no hunk/line actions
- [ ] **Staging does not jump the view**: stage a hunk in a long file → scroll position and any
      remaining line selection are preserved
- [ ] Save an unrelated file in your editor while lines are selected → the selection survives
- [ ] `Delete` on unstaged rows → confirm dialog (untracked wording says "delete") → discards
- [ ] Check **Amend** → summary and body prefill from HEAD; the staged header notes amending
- [ ] Type a summary → the counter turns danger past 72 characters
- [ ] `Ctrl+Enter` commits → the output dock shows `$ git commit …` and `✓ exit 0`; the editor clears,
      the grid gains the new commit
- [ ] Amend a commit → after success the editor is cleared and Amend is unchecked
- [ ] With `user.name` unset → a warning line appears and Commit is disabled
- [ ] `touch .git/index.lock` then try to stage → error toast **that stays put** with a Retry action;
      remove the lock, press Retry → succeeds
- [ ] A failing `pre-commit` hook surfaces its first stderr line as a toast, and the full output in
      the dock

## 5. Operations (M4)

Use `/c/tmp/t4/work` and the bare remote.

- [ ] **Push** `Ctrl+Shift+U`: remote preselected, "Set upstream" checked when there is no upstream,
      footer previews the exact `git push …`; run it → success toast, ahead/behind clears
- [ ] **Pull** `Ctrl+Shift+L` after committing in `/c/tmp/t4/other` and pushing → fast-forwards, grid
      restarts at the new HEAD
- [ ] Commit locally **and** remotely, then Push → "remote has new commits — Pull first" toast with a
      **Pull** action
- [ ] Pull with mode "Fast-forward only" on diverged history → non-fast-forward toast
- [ ] Pull on a branch whose upstream has a **different name** → pulls the upstream branch, not a
      same-named one
- [ ] **Merge** a conflicting branch → conflicts toast, working-tree row selected, danger banner
      "N files have conflicts", plus a merge-in-progress banner with Abort
- [ ] Resolve the conflict in an editor → **the file can be staged** (whole-file) → commit → banners
      clear
- [ ] **Rebase** onto a diverged branch, then Abort → the branch is restored, banner clears
- [ ] `Ctrl+B` create branch: try `a b`, `-x`, `a..b`, `.hidden`, `foo.lock`, an existing name →
      inline invalid feedback, Create disabled
- [ ] Create a branch from a **commit row** context menu → it is created at that commit, not at HEAD
- [ ] Double-click a sidebar branch → checks it out
- [ ] Right-click an unmerged branch → Delete… → refused → the dialog re-offers **Force delete**
- [ ] Create an annotated and a lightweight tag from a commit row; delete a tag
- [ ] Stash changes → appears in the sidebar; Apply / Pop / Drop from the toolbar menu
- [ ] Checkout a commit (detached) → warning banner with "Checkout <branch>" and "Create branch…"
- [ ] Start a slow fetch, expand the dock (`` Ctrl+` ``) → elapsed timer + **Cancel**; cancel → toast,
      buttons re-enable
- [ ] While an op runs, click another op → "Operation in progress" toast; buttons show that tooltip
- [ ] `Ctrl+Shift+W` during an op → refused with the same toast

## 6. Cross-cutting

- [ ] **No theme flash**: on a dark-mode OS the window never flashes light during launch (test both
      dev and the installed release build)
- [ ] Switch the OS theme while the app runs → the UI follows, including graph lane colours
- [ ] Output dock: drag its top edge → resizes between roughly 160 and 320 px; the height survives a
      restart; the collapsed bar shows the last command and its exit status
- [ ] Toasts: errors **stay** until dismissed; info/success fade after ~6 s
- [ ] Every dialog: `Esc` closes it and focus returns to whatever opened it (including when opened
      from a context menu); `Tab` stays inside the dialog
- [ ] Any dropdown (Create branch → Start point, the toolbar branch filter): the list is themed like
      the rest of the app, ↑/↓ + `Enter` pick, `Esc` closes the list only — not the dialog
- [ ] Nothing is pure white on a large surface in light theme; nothing is unreadably faint
- [ ] Drag the window to a monitor with a different DPI → the graph canvases stay crisp

## 7. Performance (needs a large repo)

- [ ] Open a `git/git` clone → the walk completes in a couple of seconds; scrolling the grid stays
      smooth while it is still loading
- [ ] Scroll deep into the history, then run `git fetch` from a terminal → the UI refreshes without a
      visible stall (only visible rows refetch their labels)
- [ ] Open a commit with a very large diff → it virtualizes; a diff over 20 000 lines shows the
      truncation banner
- [ ] A commit touching hundreds of files → the file list scrolls smoothly

---

## Expected to be missing (do not file these)

These are recorded in `docs/plans/2026-08-31-git-ui-v1-plan.md` › Known gaps:

- No **Discard** on a hunk or on selected lines — file-level discard only
- **Settings** button is disabled everywhere; the git-missing screen has no "Locate git…"
- No reveal-in-folder, no context menu on the diff, no interactive rebase / blame / file history /
  submodules / worktrees / bisect / cherry-pick / revert UI, no multi-repo tabs, no i18n
- Syntax highlighting is per line, so block comments and template strings colour line by line
- Hunk/line staging of a **non-UTF-8** file may fail or misapply — whole-file staging is fine
- Native OS titlebar (deliberate)

## Reporting

For anything that fails, note: the step number, what you saw, and the tail of the output dock or the
terminal/log file. Grid, diff and commit-panel issues are usually reproducible from the fixtures in
§0 — mention which one.
