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

Build them once; several sections reuse them.

```powershell
pwsh -File docs/smoke-fixtures.ps1   # into C:\tmp\t4; add -Force to rebuild, or pass a path
```

Windows PowerShell works too: `powershell -ExecutionPolicy Bypass -File docs\smoke-fixtures.ps1`.

It creates a bare `bare.git` "remote", a `work` repo, and a second clone `other` for the divergence
checks in §5. `work` holds history with a `feature` branch, a merge, the tag `v0.1.0`, one commit
that is **not** pushed yet (§5 pushes it), the CRLF / binary / no-trailing-newline files §3 checks,
branches sitting on commits for the context-menu checks in §5 (`reset-me`, `twin-a` / `twin-b` /
`origin/twin-remote`, `origin/solo`), and `hunks.txt` left modified in three hunks for the staging
checks in §4.

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
- [ ] A branch whose tip is already inside another branch is muted with a `merged` badge whose
      tooltip names the container: `feature` (merged into `main`), `twin-a` / `twin-b` (each other);
      `main`, `reset-me`, `topic`-style tips and `origin/reset-me` (only inside its own local
      `reset-me`) carry none. Check out `feature` → `origin/feature`'s badge stays, `feature`'s goes
      (the current branch never counts as merged into anything)
- [ ] Branches with `/` in the name nest in folders — under Local and under each remote alike (the
      fixture's `feature-upstream` is flat; `git push origin main:feature/nested` gives origin one);
      a folder collapses independently of its namesake on another remote
- [ ] Each count matches the **refs** you can see: Remotes shows total remote branches across all
      remotes (not the number of remotes), local folder rows are not counted
- [ ] Click a branch or tag → grid scrolls to and selects that commit
- [ ] Type in "Search commits" → after ~250 ms a flat list (no graph column); clear it → graph returns
- [ ] Branch scope select `All branches` → `HEAD` → re-walks
- [ ] Right-click a commit row (or `Shift+F10`) → context menu with Checkout (detached) / Create
      branch here… / Reset `<current branch>` to here… / Create tag here… / Copy SHA; a row with a
      branch on it adds Checkout `<branch>` (or Checkout branch… when several sit there), and one
      with a remote branch whose local branch is elsewhere adds Reset `<local>` to `<remote>`…
- [ ] Check out a long-named branch, right-click a row → the Reset item keeps `to here…` visible and
      ellipsizes the branch name instead; the full text is in its tooltip; same for
      "Reset `<local>` to `<remote>`…" — only the local name ellipsizes, `to origin/x…` stays
- [ ] Sidebar: the checked-out branch never shows a `merged` badge, even with a branch ahead of it
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
      the statusbar counts follow (stage and commit `a.txt` again to leave `hunks.txt` on its own)
- [ ] Click the working-tree row (or the Commit button) → three columns: Unstaged | Diff | Message
- [ ] `hunks.txt` renders as **three** hunks — an edited line plus an added one, an indentation-only
      change, and a deletion — each with its own `@@` header
- [ ] Multi-select in the lists: click, `Ctrl+click`, `Shift+click`, `↑` `↓`, `Ctrl+A`
- [ ] **Show as tree** (the folder button beside the Unstaged title; it turns into a list icon once in tree mode) → both lists nest by folder with
      folders first; clicking a folder collapses it and `↑` `↓` / `Shift+click` skip its files; the
      hover `+` / `−`, `Enter` and double-click still act on file rows; the choice survives a restart
- [ ] Tree view look: a chain of single folders (`a/b/c/x.rs` alone) is one row `a / b / c` with the
      full path in its tooltip; collapsing it hides everything under it; every nested row shows a thin
      guide line under each ancestor's chevron, and the lines stay visible on hover and when selected;
      the details pane's changed-files tree does the same
- [ ] Tree view keys: `Enter` / `Space` / `←` / `→` on a clicked folder row toggle it and stage nothing;
      select a file, collapse its folder → it stays selected, `Ctrl+A` then `Enter` stages the hidden
      one too; `↓` from the hidden file lands on the first file after the folder; stage a file in
      tree mode → the selection moves to the row below it (not the status-order neighbour)
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
- [ ] `Delete` on unstaged rows → confirm dialog (untracked wording says "delete") → discards
- [ ] Check **Amend** → summary and body prefill from HEAD; the staged header notes amending
- [ ] Type a summary → the counter turns danger past 72 characters
- [ ] `Ctrl+Enter` commits → the output dock shows `$ git commit …` and `✓ exit 0`; the editor clears,
      the grid gains the new commit
- [ ] Amend a commit → after success the editor is cleared and Amend is unchecked
- [ ] **Open commit window** (the expand button in the Commit message header, a double-click on the
      working-tree row, or Repository menu › Commit…) → a full-window dialog: Unstaged / Staged / Message stacked on the left, the diff on
      the right, all three splitters drag; staging there is mirrored in the panel behind; `Esc`
      closes it, and a successful Commit closes it by itself; `Esc` with the Message history menu
      open closes only the menu; the tree toggle in the dialog flips the panel behind it too;
      Commit & Push from the dialog → after closing Push, focus is back where the dialog was opened
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
- [ ] **Merge** a conflicting branch → conflicts toast, working-tree row selected, danger banner
      "N files have conflicts", plus a merge-in-progress banner with Abort
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
- [ ] Right-click the `feature edit` row → **Checkout feature** (one branch, no picker) → checks it out
- [ ] Right-click `solo (remote only)` → **Checkout origin/solo** → a local `solo` tracking
      `origin/solo` is created and checked out (one chip with a remote segment on the row)
- [ ] Right-click `twins (three branches here)` → **Checkout branch…** → picker lists `twin-a`,
      `twin-b`, `origin/twin-remote`; pick `origin/twin-remote` → the help line says it creates
      `twin-remote`, preview reads `git checkout --track -b twin-remote origin/twin-remote` → Checkout →
      `twin-remote` is the current branch
- [ ] Check out `reset-me` (sidebar double-click), right-click the `reset fixture 1` row → **Reset
      reset-me to here…** → dialog defaults to Mixed, preview reads `git reset --mixed <sha>` → Reset →
      the `reset-me` chip moves down one row while `origin/reset-me` stays on `reset fixture 2`, and
      `reset.txt` shows up as an **unstaged** change
- [ ] Right-click `reset fixture 2` → **Reset reset-me to origin/reset-me…** → same dialog (it is the
      current branch), preview reads `git reset --mixed origin/reset-me`; pick **Hard** → the button
      turns danger and the text warns about uncommitted changes → Reset → `reset.txt` is clean again
      and the two chips are one row again
- [ ] Reset `reset-me` to `reset fixture 1` once more, this time **Hard** (no leftover change), then
      double-click `main` in the sidebar and right-click `reset fixture 2` → **Reset reset-me to
      origin/reset-me…** → a plain confirm dialog, preview reads `git branch -f reset-me origin/reset-me`
      (not `git reset`: the branch is not checked out) → Reset → the chip is back on the tip and the
      working tree was never touched
- [ ] **Before** the Pull check on `feature` above (it needs `feature` behind its upstream — Cancel
      these dialogs): right-click `upstream branch commit` (`origin/feature-upstream`) → **Reset
      feature to origin/feature-upstream…** — the local branch is matched by **upstream**; right-click
      `decoy branch commit` (`origin/feature`) → **Reset feature to origin/feature…** — matched by
      **name**. After the Pull only the second one is still offered: `feature` then sits on
      `origin/feature-upstream`
- [ ] Right-click a row where the only branch is the current one (its HEAD row) → no Checkout
      `<branch>` item and no Reset-to-remote item, just the fixed entries
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
- [ ] Repository menu → **Run git command…** (`Ctrl+Shift+R`): type `sta` → the list offers `status` /
      `stash` with hints; `Tab` completes `status `; type `-` → its flags; **Run** → the dock expands
      on its own with the output and `exit 0`; no toast
- [ ] Same dialog: type `checkout ` → the list shows local branches, `origin/…`, tags, `stash@{0}` and
      remote names; pick `feature` → checked out, sidebar and grid follow
- [ ] `add -i` → inline "-i needs a terminal…" help, Run disabled; so does `add -ip`, while
      `commit -m -p` is allowed (`-p` is the message); `commit` with no `-m` runs and fails at once
      with "Aborting commit due to empty commit message" (no editor, no hang); `commit -m "two words"` → the
      preview reads `git commit -m 'two words'` and the dock line `git commit -m "two words"`
      (quoting survives the round trip)
- [ ] Expanded dock (`` Ctrl+` ``) has a `$ git` prompt at the bottom: `status` + `Enter` runs and
      clears the line; `↑` recalls it, `↑` again the one before, `↓` returns to what was typed;
      the completion list opens **upward**; `F5` / `Ctrl+B` typed there do nothing
- [ ] While an op runs the prompt stays focused and shows "Running…", Enter does nothing until it
      ends; `` Ctrl+` `` collapses the dock from inside the prompt; restart the app and open another
      repository → the history is still there (it is global)
- [ ] From the prompt, `fetch slow` → elapsed timer + **Cancel** in the dock header kills it; the
      "Cancelled" toast appears; `fetch nowhere` → **no** toast; the dock's exit line shows the non-zero code
      (a typed `push` that is rejected still toasts, with its Pull action)

## 6. Cross-cutting

- [ ] Toggle to light, quit, relaunch on a dark-mode OS → the window is light from its first frame
      (the preference is mirrored into the kv store; toggle back to "system" → follows the OS again)
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

- No **Discard** on a hunk or on selected lines — file-level discard only
- **Settings** button is disabled everywhere (the git-missing screen's "Locate git…" covers the git path)
- No reveal-in-folder, no context menu on the diff, no interactive rebase / blame / file history /
  submodules / worktrees / bisect / cherry-pick / revert UI, no multi-repo tabs, no i18n
- Syntax highlighting is per line, so block comments and template strings colour line by line
- Hunk/line staging of a **non-UTF-8** file may fail or misapply — whole-file staging is fine
- Native OS titlebar (deliberate)

## Reporting

For anything that fails, note: the step number, what you saw, and the tail of the output dock or the
terminal/log file. Grid, diff and commit-panel issues are usually reproducible from the fixtures in
§0 — mention which one.
