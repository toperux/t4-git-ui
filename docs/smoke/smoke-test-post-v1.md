# Smoke test — features shipped after v1 acceptance

Companion to `docs/smoke/smoke-test.md` (the v1 walkthrough, accepted 2026-09-01). Every check below is a
feature that landed afterwards. The ticks are the record, as in the main doc: ticked = walked and
passed in its last walk (the 2026-09-05 CDP walks; G2 under WSLg), unticked = never walked here or
changed since and needs a retest. Each group
names the section of the main walkthrough it belongs to, so it can be run on its own or slotted in
(B, C and H check out / merge / rebase, which the fixture's dirty tree refuses: start them with
`git stash -u`, or walk E/F/G first and discard).

Same setup as the main doc: the `docs/smoke/fixtures/smoke-fixtures.ps1` repos under `C:\tmp\t4` (§0 there), a
dev run or the installed release. Rebuild the fixture with `-Force` if yours predates 2026-09-03:
the script now also makes the `conflict` branch (H), `topic/nested` and `origin/topic/on-origin`
(A), the `nested folders` commit with `examples/exclude/schema/` and `src/` (E), and leaves the
working tree with `src/a.txt` + `src/lib/b.txt` edited, `deep/one/two/z.txt` untracked, `gone.txt`
deleted and a CRLF hunk in `crlf-hunks.txt` (E, F, G). Tick as you go; note anything surprising
with the group letter and bullet number. `docs/smoke/smoke-cdp.md` is how the walks were scripted.
Groups AO and AP use their own repository, `C:\tmp\t4\linked`, built by
`docs/smoke/fixtures/linked-fixture.sh` (worktrees beside it under `linked-wt\`, two submodules).

---

## A. Sidebar — merged badges, remote folders (main §2)
_Shipped 2026-09-02: `bf7b29b`, `21289fb`, review fix `ae61c75`._

- [x] A branch whose tip is already inside another branch is muted with a `merged` badge whose
      tooltip names the container: `feature` (merged into `main`), `twin-a` / `twin-b` (each other);
      `main`, `reset-me`, `topic`-style tips and `origin/reset-me` (only inside its own local
      `reset-me`) carry none. Check out `feature` → `origin/twin-remote`'s badge (merged into
      `twin-a`) stays, `feature`'s goes (the current branch never counts as merged into anything;
      nor does a protected `main` / `master` / remote-default branch, which nothing offers to delete)
- [x] Branches with `/` in the name nest in folders — under Local and under each remote alike:
      `topic/nested` sits in a `topic` folder under Local, `origin/topic/on-origin` in one under
      origin (`origin/feature-upstream` stays flat); collapsing one folder leaves the other open
- [x] Sidebar: the checked-out branch never shows a `merged` badge, even with a branch ahead of it

## B. Commit context menu — checkout, reset, merge, rebase (main §2 and §5)
_Shipped 2026-09-02: `4bdd00e`, `7c6aadc`; ellipsis fix `ae61c75`. The checkout / reset bullets
sit in §5 next to "Checkout a commit (detached)"; the merge / rebase and ellipsis ones in §2._

- [x] Right-click the `feature edit` row → **Checkout feature** (one branch, no picker) → checks it out
- [x] Right-click `solo (remote only)` → **Checkout origin/solo** → a local `solo` tracking
      `origin/solo` is created and checked out (one chip with a remote segment on the row)
- [x] Right-click `twins (three branches here)` → **Checkout branch…** → picker lists `twin-a`,
      `twin-b`, `origin/twin-remote`; pick `origin/twin-remote` → the help line says it creates
      `twin-remote`, preview reads `git checkout --track -b twin-remote --end-of-options origin/twin-remote` → Checkout →
      `twin-remote` is the current branch
- [x] Check out `reset-me` (sidebar double-click), right-click the `reset fixture 1` row → **Reset
      reset-me to here…** → dialog defaults to Mixed, preview reads `git reset --mixed --end-of-options <sha>` → Reset →
      the `reset-me` chip moves down one row while `origin/reset-me` stays on `reset fixture 2`, and
      `reset.txt` shows up as an **unstaged** change
- [x] Right-click `reset fixture 2` → **Reset reset-me to origin/reset-me…** → same dialog (it is the
      current branch), preview reads `git reset --mixed --end-of-options origin/reset-me`; pick **Hard** → the button
      turns danger and the text warns about uncommitted changes → Reset → `reset.txt` is clean again
      and the two chips are one row again
- [x] Reset `reset-me` to `reset fixture 1` once more, this time **Hard** (no leftover change), then
      double-click `main` in the sidebar and right-click `reset fixture 2` → **Reset reset-me to
      origin/reset-me…** → a plain confirm dialog, preview reads `git branch -f --end-of-options reset-me origin/reset-me`
      (not `git reset`: the branch is not checked out) → Reset → the chip is back on the tip and the
      working tree was never touched
- [x] **Before** the Pull check on `feature` above (it needs `feature` behind its upstream — Cancel
      these dialogs): right-click `upstream branch commit` (`origin/feature-upstream`) → **Reset
      feature to origin/feature-upstream…** — the local branch is matched by **upstream**; right-click
      `decoy branch commit` (`origin/feature`) → **Reset feature to origin/feature…** — matched by
      **name**. After the Pull only the second one is still offered: `feature` then sits on
      `origin/feature-upstream`
- [x] Right-click a row where the only branch is the current one (its HEAD row) → no Checkout
      `<branch>` item and no Reset-to-remote item, just the fixed entries
- [x] On `main`, right-click `feature`'s tip → Merge `feature` into `main`… opens the Merge dialog
      with `feature` selected; Rebase `main` onto `feature`… opens the Rebase dialog with `feature`
      selected. A plain commit (no branch) → Merge commit `<sha7>` into `main`… (the dialog lists the
      7-char sha as an extra option, message `Merge commit '<sha7>'`) and Rebase `main` onto here…
      (Rebase dialog onto the sha). The HEAD row shows neither item; both are disabled while an op runs
- [x] Check out a long-named branch, right-click a row → the Reset item keeps `to here…` visible and
      ellipsizes the branch name instead; the full text is in its tooltip; same for
      "Reset `<local>` to `<remote>`…" — the long name ellipsizes, `to origin/x…` stays visible

## C. Run git command, dock prompt (main §5, after the cancel checks)
_Shipped 2026-09-02: `9e756fb`; behaviour fixes `ae61c75`._

- [x] Repository menu → **Run git command…** (`Ctrl+Shift+R`): type `sta` → the list offers `status` /
      `stash` with hints; `Tab` completes `status `; type `-` → its flags; **Run** → the dock expands
      on its own with the output and `exit 0`; no toast
- [x] Same dialog: type `checkout ` → the list shows local branches, `origin/…`, tags, `stash@{0}` and
      remote names; pick `feature` → checked out, sidebar and grid follow
- [x] `add -i` → inline "-i needs a terminal…" help, Run disabled; so does `add -ip`, while
      `commit -m -p` is allowed (`-p` is the message); `commit` with no `-m` runs and fails at once
      with "Aborting commit due to empty commit message" (no editor, no hang); `commit -m "two words"` → the
      preview reads `git commit -m 'two words'` and the dock line `git commit -m "two words"`
      (quoting survives the round trip)
- [x] Expanded dock (`` Ctrl+` ``) has a `$ git` prompt at the bottom: `status` + `Enter` runs and
      clears the line; `↑` recalls it, `↑` again the one before, `↓` returns to what was typed;
      the completion list opens **upward**; `F5` / `Ctrl+B` typed there do nothing
- [x] While an op runs the prompt stays focused and shows "Running…", Enter does nothing until it
      ends; `` Ctrl+` `` collapses the dock from inside the prompt; restart the app and open another
      repository → the history is still there (it is global)
- [x] From the prompt, `fetch slow` → elapsed timer + **Cancel** in the dock header kills it; the
      "Cancelled" toast appears; `fetch nowhere` → **no** toast; the dock's exit line shows the non-zero code
      (a typed `push` that is rejected still toasts, with its Pull action)

## D. Theme toggle (main §6, before "No theme flash")
_Shipped 2026-09-02; kv mirror `ae61c75`._

- [x] Toggle to light, quit, relaunch on a dark-mode OS → the window is light from its first frame
      (the preference is mirrored into the kv store). The toolbar toggle only flips light ↔ dark —
      Settings › Theme › **Follow system** puts it back on the OS, checked in J

## E. Commit panel — tree view, full-window commit dialog (main §4)
_Shipped 2026-09-02: `a86a494`, `82978bc`, `7f37902`. Tree bullets go after "Multi-select in the
lists"; the commit window after "Amend a commit"._

- [x] **Show as tree** (the folder button beside the Unstaged title; it turns into a list icon once in tree mode) → both lists nest by folder with
      folders first; clicking a folder collapses it and `↑` `↓` / `Shift+click` skip its files; the
      hover `+` / `−`, `Enter` and double-click still act on file rows; the choice survives a restart
- [x] Tree view look: the untracked `deep/one/two/z.txt` is one row `deep / one / two` with the
      full path in its tooltip, `src` holds `a.txt` and a `lib` folder; collapsing `deep / one / two`
      hides `z.txt`; every nested row shows a thin guide line under each ancestor's chevron, and the
      lines stay visible on hover and when selected; select the `nested folders` commit → the details
      pane's tree shows `examples / exclude / schema` as one row and does the same
- [x] Tree view keys: `Enter` / `Space` / `←` / `→` on a clicked folder row toggle it and stage nothing;
      select a file, collapse its folder → it stays selected, `Ctrl+A` then `Enter` stages the hidden
      one too; `↓` from the hidden file lands on the first file after the folder; stage a file in
      tree mode → the selection moves to the row below it (not the status-order neighbour)
- [x] **Open commit window** (the expand button in the Commit message header, a double-click on the
      working-tree row, or Repository menu › Commit…) → a full-window dialog: Unstaged / Staged / Message stacked on the left, the diff on
      the right, all three splitters drag; staging there is mirrored in the panel behind; `Esc`
      closes it, and a successful Commit closes it by itself; `Esc` with the Message history menu
      open closes only the menu; the tree toggle in the dialog flips the panel behind it too;
      Commit & Push from the dialog → after closing Push, focus is back where the dialog was opened;
      right-click (or Shift+F10) a row in the dialog → the same row menu as the panel's, drawn
      over the dialog, `Esc` closes only the menu and focus stays in the dialog; Keep <side>'s
      version from it → the native confirm, then the conflict is gone; a failed action in the
      dialog (plant `.git/index.lock`, Stage all) → its toast shows on top of the dialog and Retry
      works once the lock is gone _(walked 2026-09-12, `b1c3377`)_

## F. Discard hunks and lines (main §4, after "Hover a hunk header → Stage hunk")
_Shipped 2026-09-02: `78f8f02`._

- [x] Hover a hunk header → **Discard hunk** beside it → confirm → the hunk is gone from the working
      tree and the other hunks of `hunks.txt` are untouched; select two lines → **Discard 2 lines**
      (or `Delete`) → confirm → only those lines revert; `crlf-hunks.txt` (one CRLF hunk) discards
      the same way and `git diff` is then empty — no CRs lost; the staged side and an untracked file
      offer no Discard, and a conflicted file's row menu shows it **disabled** (K5 covers a mixed
      selection)

## G. File-row context menu, mode changes (main §4, after the `Delete` check)
_Shipped 2026-09-02: `2600ae6`, `a03c727`. The mode check needs a Unix box or WSL. §4's `Delete`
check runs on `hunks.txt` alone, so `gone.txt` is still deleted and `crlf-hunks.txt` still modified
when this group starts._

- [x] Right-click an unstaged row (or `Shift+F10`) → Stage / Discard… / Copy path / Open / Reveal in
      folder; a staged row offers Unstage instead and no Discard; right-click a row outside the
      selection → only that row is selected; with three rows selected the items read "3 files" and
      Open / Reveal are gone; **Open** launches the file's default app, **Reveal in folder** opens
      Explorer with the file selected, **Copy path** toasts the repo-relative path; `gone.txt`
      (deleted) keeps Copy path but Open / Reveal are disabled
- [x] `chmod +x` a tracked file and edit a line (WSL / Linux / macOS only) → the diff header shows
      `100644 → 100755`; **Stage hunk** → the staged entry carries the new mode (`git diff --cached`
      shows `old mode` / `new mode`) and the unstaged side is clean

## H. Keep ours / theirs per conflicted file (main §5, before "Resolve the conflict")
_Shipped 2026-09-02: `9c4bc35`._

- [x] On `main`, Branch menu › Merge… `conflict` → `conflict.txt` conflicts; **Keep main's version** /
      **Keep conflict's version** sit before "Resolve in editor" (labels are the branch names, `main`
      first — git's *ours*); the same two items are in the file row's right-click menu → pick the
      second → confirm → the file reads `the conflict branch's line`, has no markers, and is already
      staged — no **Restore conflict** here: it is only offered for a file staged *with* its markers,
      which main §5 covers. Abort the merge afterwards
- [x] Merge `conflict` again and pick **Keep main's version** → `git status` is empty, yet the
      **Working tree · merge to commit** row stays, toolbar Commit is enabled ("Merge to commit") and
      the banner's **Commit merge** opens the commit panel with the prefilled `Merge branch 'conflict'`
      message, the author line reading "will record the merge" and Commit enabled with nothing
      staged → commit → a merge commit with two parents, the banner is gone and the row disappears.
      `git reset --hard HEAD~1` afterwards
- [x] Check out `conflict`, Rebase… onto `main` → the same file conflicts, and the labels are
      **Keep main's version** (git's *ours* = the branch rebased onto) and **Keep conflict's version**;
      pick the first → the file reads `main's line`, pick the second → `the conflict branch's line`
      — each keeps what its label says, not the other way round. Abort the rebase afterwards

## I. Create tag with push (main §5, after "Create an annotated and a lightweight tag")
_Shipped 2026-09-02: `21c2158`._

- [x] Create tag with **Push to remote after creating** ticked → the preview ends in
      `&& git push --progress origin --end-of-options refs/tags/<name>`, two ops run back to back, the tag is on the bare remote
      (`git -C <bare> tag`); a name that already exists is refused inline and Create stays disabled;
      in a repo without remotes the checkbox is absent
- [x] Same dialog, same tick, but pick the `nowhere` remote (the fixture's path that does not exist)
      → the tag is created locally and its create toast shows, then the push fails with its own
      error toast; the tag stays local (it is in the sidebar, not in `git -C <bare> tag`)

## J. Settings (main §6)
_Shipped 2026-09-02: `8b8102a`._
_These controls sit on tabs since 2026-09-17 (group AX): the git path under **Git**, the theme under
**General**, the context lines and the whitespace default under **Diff & merge**._

- [x] **Settings** (toolbar gear, also on the start screen): a bogus git path + Apply → the error shows
      inline, the old path stays and the app keeps working; the real path → `git version …` shows and
      the statusbar version follows; **Theme → Follow system** → the window tracks the OS again after
      the toolbar toggle had pinned it; **Context lines** 1 → the open diff reloads with one line of
      context (the commit panel's diff reloads too) and **Stage hunk** still stages the right hunk;
      **Ignore whitespace by default** → the details-pane diff opens with the toggle on; quit and
      relaunch → every value survives

## K. Review fixes of 2026-09-06 (main §2, §4, §5, §6)
_Shipped 2026-09-06: `a5a0a6b` (`docs/archive/reviews/2026-09-06-codebase-review.md`). K5, K9 and K10 need
a merge in progress: run them right after H1's merge, before its abort. K3 to K8 start from the
dirty fixture tree. K13 last: it leaves the fixture needing a `-Force` rebuild; K14 is order-free. `git config
core.commentChar` is set and unset inside K10 alone._

- [x] **Tag and branch with one name** (§2): `git branch same HEAD~1 && git tag same` in `work` →
      Sidebar › Tags › `same` › **Checkout (detached)** → the statusbar shows a detached HEAD **at
      `main`'s commit** (`git rev-parse HEAD` = `git rev-parse main`, and `git symbolic-ref HEAD`
      fails); without `--detach` git would have checked out the *branch* `same` at `HEAD~1`. The
      commit row's own **Checkout (detached)** takes the oid and never had the problem. `git checkout
      main && git branch -D same && git tag -d same` afterwards
- [x] **Failed clone keeps its fields** (§1): Clone… with URL `C:\tmp\t4\nowhere` → Clone → the error
      shows inline and the focus is back in the **URL** field (not on the title bar's ✕); `Enter`
      retries the clone rather than closing the dialog, the URL, folder and name are still there;
      `Esc` closes it. A relative **Parent folder** (`clones`) disables Clone with the hint "Use a
      full path…"; an absolute one enables it again
- [x] **A background save does not steal the focus** (§4): click a row in Unstaged, then click the
      **Unstaged** header text so nothing has the focus → `echo x >> src\a.txt` from a terminal → the
      list refreshes, **no focus ring** appears anywhere and `Delete` / `Enter` do nothing; the same
      with the focus on a diff line, then a click on the diff's path header, then the save. Then the
      case that must still work: click a row's own **+** button and press `Enter` → the row is staged
      and the focus is back in the list (ring on the list, `↑`/`↓` move)
- [x] **Emptying a list hands the focus over** (§4): click into Unstaged, `Ctrl+A`, `Enter` → every
      file is staged, the ring is on the **Staged** list and `↑`/`↓` move there; then `Tab` into the
      empty Unstaged list ("No unstaged changes") and save a file from a terminal → the focus stays on
      the empty list, it does not jump to Staged
- [x] **Discard skips conflicted files, like Stage** (§5, mid-merge): with `conflict.txt` conflicted
      and `hunks.txt` modified, `Ctrl`-click both → right-click → **Discard 2 files…** is enabled and
      its tooltip says "(1 skipped)" → confirm → `hunks.txt` reverts, `conflict.txt` still has its
      markers; `Delete` on the same selection does the same; `conflict.txt` alone → **Discard…** is
      present but disabled, its tooltip has no "skipped" count, and `Delete` does nothing
- [x] **`Shift+↓` across a hunk edge** (§4): in `hunks.txt`, `Tab` into the diff, `Shift+↓` once
      ("2 lines selected", both in the first hunk), plain `↓` until the ring is in the second hunk,
      `Shift+↓` → "2 lines selected" again, both in the **second** hunk (the old selection is
      replaced, not collapsed to one line); **Stage 2 lines** stages exactly those two
- [x] **Same file in both lists** (§4): stage one hunk of `hunks.txt` so it sits in both lists →
      select it in Unstaged, `Tab` into the diff, `↓` to the last line → click `hunks.txt` in
      **Staged**, `Tab` into its diff → the ring is on the **first** line, and nothing is selected
      (the two diffs share a path but not their content)
- [x] **Commit with a search filter active** (§2): type `hunks` in **Search commits** → the grid is a
      flat list with no working-tree row → toolbar **Commit** → the search field empties, the graph
      is back, the working-tree row is selected and the panel is open; mid-merge (after H1), the
      same via the banner's **Commit merge**
- [x] **Only a stopped operation prefills the message** (§5, mid-merge for the second half): Run git
      command… `cherry-pick <sha>` with the `many files (300)` commit's SHA (Copy SHA on its row; it
      is already in `main`, so the pick stops empty) → the banner reads "Cherry-pick in progress —
      resolve conflicts, then commit to finish" with **Abort** and **Commit**, and the editor holds
      the picked commit's message (since group U a cherry-pick / revert prefills like a merge; before
      that the editor stayed empty and the banner pointed at a terminal); **Abort** takes the
      prefill back. Then in H1's merge, open the panel, pick an entry from **Message history** (the clock icon),
      **Abort** the merge → the picked message is still in the editor (only the merge's own prefill
      is taken back)
- [x] **`core.commentChar`** (§5): `git config core.commentChar ";"` in `work`, start H1's merge →
      the prefilled message is `Merge branch 'conflict'` with **no** `; Conflicts:` / `; conflict.txt`
      lines below it; `git config --unset core.commentChar` afterwards
- [x] **Completions at the minimum window height** (§5): shrink the window to its minimum height,
      `Ctrl+Shift+R`, type `che` → the completions list opens on the side that has room and never
      covers the input; when capped it scrolls
- [x] **POSIX `file://` remote** (Linux / WSL only): clone from `file:///home/<you>/bare.git` → the
      statusbar reads `origin · /home/<you>/bare` (leading slash kept; a Windows `file:///C:/…` clone
      still reads `C:/…`)
- [x] **Unborn HEAD offers no merge** (§2, last): `git checkout --orphan wip` in `work` → the grid
      still shows `main`'s history under All branches; right-click any commit → no **Merge commit …
      into HEAD…** item and no Rebase item; **Checkout (detached)**, **Create branch here…**,
      **Copy SHA** are still there. `git checkout -f main && git branch -D wip` afterwards, then
      rebuild the fixture with `-Force` (the orphan staged everything and `-f` drops the edits)

- [x] **Dock height survives a collapse** (§6): open the output dock (any op), drag its top edge up
      to about 300 px, collapse it with the header's chevron, expand it again → it comes back at the
      dragged height, not at the 160 px minimum; the first open of a session is still 200 px
- [x] **Stage N lines by mouse keeps the focus** (§4): in `hunks.txt`, `Tab` into the diff,
      `Shift+↓` → click the bar's **Stage 2 lines** with the mouse → the lines are staged and the
      ring is back on a diff line (`↓` moves it), not lost to the window

## L. Intra-line highlight (main §4)
_Shipped 2026-09-06; walked the same day over CDP (this commit). The working tree is always in
staging mode, so the split-view half needs a commit; the fixture's commits rewrite their lines
whole, so a real word pair comes from this repo's own history._

- [x] **Changed words only, on paired lines only** (§4): open the commit panel, click `hunks.txt` in
      **Unstaged** → in the first hunk the `line 02 edited` add tints ` edited` and nothing else, its
      `line 02` delete tints nothing at all; the unpaired `line 02b` add and the lone `line 28`
      delete tint nothing; no context line has a tint anywhere in the file; the third hunk's
      `    line 15` add tints its four leading spaces. Every line still reads exactly as before —
      select the `line 02 edited` row and `Ctrl+C`: the pasted text has no gaps or duplicates
- [x] **Both views, and a rewritten line** (§4): still in the commit panel, click the `line 02`
      delete and `Shift+↓` → the ring, the selection and the **Stage N lines** bar behave as they
      did, and the tints stay put under the selection highlight. Select the `main side of the
      conflict` commit → `conflict.txt`: `base` → `main's line` is a rewrite, so neither line tints
      a word, in **Unified** and in **Split view**. Then a commit with a word pair (this repo's
      `Walk group K…` commit → `smoke-test.md`, in the recents) in **Split view** → each `- [ ]` →
      `- [x]` pair tints the ` ` on the left side and the `x` on the right, nothing else
- [x] **Themes, syntax colours and CRLF** (§4): the fixture has no code files, so open a repo with a
      changed `.ts` / `.rs` file (this repo's own working tree, in the recents, will do) → the words
      inside a tint drop to the row's own foreground instead of their syntax colour, and the rest of
      the line keeps its colours; toggle the theme → the tint follows it in both light and dark and
      the text stays readable. Back in `work`, open `crlf-hunks.txt` → the `crlf 05 edited` add tints
      ` edited` and the trailing `␍` glyph is never inside the tint

## M. Folder stage / unstage in tree view (main §4)
_Shipped 2026-09-06; walked the same day over CDP (this commit)._

- [x] **A folder's own `+` / `−`** (§4): in the commit panel switch to tree view and hover `src` in
      **Unstaged** → a `+` appears at the row's end, in the same column as a file row's → click it →
      `a.txt` and `lib/b.txt` both move to **Staged** under `src`, and the focus is still in a list
      (`↓` moves a row; nothing lands on `<body>`). Hover `src` in **Staged** → `−` → both back
- [x] **A compacted chain, and the keys** (§4): the `deep / one / two` row's `+` stages exactly its
      files (`z.txt` and nothing else); `Enter` / `Space` on a clicked folder row still only toggle
      it, staging nothing
- [x] **The folder's context menu** (§4): right-click `src` in **Unstaged** → its two files are
      selected and the menu reads **Stage 2 files** / **Discard 2 files…** / **Copy path** (no Open
      or Reveal, as for any multi-file selection); `Esc` closes it. (The conflict skip is
      unit-tested: the fixture's conflicted file sits at the root, with no folder above it)

## N. Compare two commits (main §3)
_Shipped 2026-09-06; walked the same day over CDP, re-walked after the direction change (this commit)._

- [x] **The pair and what it shows** (§3): in `work` click `nested folders`, then Ctrl+click `main
      side of the conflict` → both rows are tinted, the details column reads **Compare** with
      **From** `nested folders` (the selected commit) and **To** `main side of the conflict` (the
      Ctrl+clicked one), and the file list is the five files whose content differs between the two
      trees — `crlf-hunks.txt`, `examples/exclude/schema/tables.txt`, `gone.txt`, `src/a.txt`,
      `src/lib/b.txt` — not every file the commits in between touched (a file changed and changed
      back would not be here). The diffs read backwards here (all five are deletions):
      the direction is the clicks', not the log's. The first file's diff renders, and `↑` `↓` in
      the list follow
- [x] **Direction by click, and a third commit** (§3): Ctrl+click either row to leave, then click
      `main side of the conflict` first and Ctrl+click `nested folders` → the pair flips: **From**
      `main side of the conflict`, **To** `nested folders`, the same five files with their diffs
      now reading forward. Ctrl+click `conflict base` → it replaces the second commit against the
      same anchor: **From** `main side of the conflict`, **To** `conflict base`, and the list is
      `conflict.txt` alone
- [x] **Leaving the compare** (§3): Ctrl+click either tinted row → one row selected and the details
      header reads **Commit** again; the same for `↓` (any keyboard move) and a plain click. The
      working-tree row never compares — Ctrl+click it, or
      Ctrl+click a commit while it is selected, and it is a plain select. A right-click selects the
      row for its single-commit menu, so it drops the compare too (known limitation)

## O. Delete branches and tags from a commit row (main §2)
_Shipped 2026-09-06; walked the same day over CDP; protected branches added and walked (this commit)._

- [x] **The group and a local branch** (§2): in `work` right-click the `twins` row → a red group
      last: **Delete twin-a…**, **Delete twin-b…**, **Delete origin/twin-remote on remote…**; pick
      **Delete twin-b…** → the Delete branch dialog, preview `git branch -d twin-b` → Delete → git
      refuses (`twin-b` is not merged into `main`) and the same dialog re-shows with **Force
      delete** and `git branch -D twin-b` → Force delete → the chip is gone.
      Restore: `git -C C:\tmp\t4\work branch twin-b twin-a`
- [x] **The current branch, and a tag** (§2): the HEAD row (`odd files`) offers no **Delete main…**;
      right-click the `v0.1.0` tag's row (`main edit`) → **Delete tag v0.1.0…** → the dialog with
      "also on remote" unchecked, preview `git tag -d v0.1.0` → Delete → the tag chip is gone.
      Restore: `git -C C:\tmp\t4\work tag v0.1.0 9f87c5f`
- [x] **A remote branch, and while an op runs** (§2): right-click `solo (remote only)` → **Delete
      origin/solo on remote…** → the dialog's preview reads `git push origin --delete --end-of-options refs/heads/solo` →
      Cancel (the push path itself is walked from the sidebar in the main doc). While an op runs
      (`fetch slow` from the Run git command dialog) every Delete item is greyed, Copy SHA is not
- [x] **Protected branches** (§2): right-click `nested folders` (`origin/main`) → no **Delete
      origin/main on remote…**; in the sidebar right-click `main` and `origin/main` → no Delete item
      and no trailing separator, `feature` → **Delete…** is there. Then
      `git -C C:\tmp\t4\work symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/feature-upstream`
      and F5 → the `upstream branch commit` row (`origin/feature-upstream`) offers no Delete.
      Restore: `git -C C:\tmp\t4\work symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main`

## P. Remote management (main §2 and §5)
_Shipped 2026-09-06 (this commit); walked the same day over CDP._

- [x] **Add a remote** (§5): on `work`, Repository menu → **Add remote…** → name `mirror`, URL
      `C:/tmp/t4/bare.git`, **Fetch now** checked, preview
      `git remote add mirror C:/tmp/t4/bare.git && git fetch --progress --prune --end-of-options mirror` → Add → toast
      `Added mirror`, the fetch runs in the dock, the sidebar gains a `mirror` folder with `main`
      under it; the Remotes count grows by its branches
- [x] **The remote's menu** (§2): right-click `mirror` → **Fetch mirror**, **Rename…**, **Change
      URL…**, **Copy URL**, **Remove…**. Rename… → `mirror2` → the folder and its branches follow.
      Change URL… → prefilled, set `C:/tmp/t4/does-not-exist` → the folder's tooltip shows it;
      **Fetch mirror2** → fails at once (toast, dock exit line). Copy URL → clipboard has it
- [x] **Remove it again** (§2): **Remove…** → the confirm names the remote, preview
      `git remote remove mirror2` → Remove → folder and count gone; `git -C C:\tmp\t4\work remote`
      no longer lists it
- [x] **A repository without remotes** (§2): open one (`git init C:\tmp\t4\noremote`, or any recent
      one whose `git remote` prints nothing) → Remotes shows **No remotes** with **Add remote…**;
      the button opens the dialog with `origin` prefilled; Cancel. Remove the throwaway folder
      afterwards

## Q. Diff window (main §3)
_Shipped 2026-09-06 (this commit); walked the same day over CDP._

- [x] **Open it** (§3): on `work`, select `nested folders` → the diff header's **Open diff window**
      (Maximize2, left of Unified / Split) → a full-window `Diff — 9099161 nested folders` dialog:
      the changed-file list left, the diff right, the splitter drags; pick another file → the diff
      follows and the pane behind shows the same selection; Split view works there; Esc closes and
      focus is back on the button
- [x] **A compare** (§3): Ctrl+click `odd files` with `nested folders` selected → the button opens
      `Diff — 9099161…00d78d3` with the compare's file list; close
- [x] **Where it isn't** (§3): select the working-tree row → the commit panel's diff header has no
      expand button, and the Commit dialog's diff has none either (only the details pane's diff
      opens a diff window; the no-target case is unit-tested, the grid always selects a row on load)

## R. External diff and merge tools (main §5, §6)
_Shipped 2026-09-06 (this commit); walked the same day over CDP (Locate… is the native picker — the path was typed instead; KDiff3 is not installed here, so its merge entry pointed at BComp.exe). The Linux sentence in the first step was walked on a WebKitGTK build under WSLg the same day (`docs/archive/walks/2026-09-05-full-rewalk.md` has the setup): a Custom tool whose command is `cat "$LOCAL" "$REMOTE" > /tmp/out && echo done >> /tmp/out` ran through sh, the temp dir carried the uid, no zombie was left, and a missing program toasted `t4-nope not found`._

- [x] **Pick a diff tool** (§6): Settings (toolbar gear) → **Diff tool** → the Select offers None,
      the ten templates and Custom; pick **Beyond Compare** → the path fills with
      `…/Beyond Compare 5/BComp.exe` (forward slashes, as GitExtensions writes them; "Found on
      this machine.") and Command reads `"…/BComp.exe" "$LOCAL" "$REMOTE"` → **Apply** → toast `Diff tool: Beyond Compare`;
      `git config --global diff.guitool` = `bc`, `diff.tool` = `bc` and `difftool.bc.cmd` is that line.
      On Linux/macOS the Select omits WinMerge and TortoiseGitMerge (Windows-only), and the Command
      help says the variables are in the environment — the line runs through `sh`, as `git difftool` runs it
- [x] **A tool that isn't installed, and Locate…** (§6): **Merge tool** → **KDiff3** → the Path help
      says "Not found — Locate it"; **Suggest** repeats the lookup; **Locate…** → pick any exe → the
      path fills and Command re-derives with the merge arguments
      (`"$BASE" "$LOCAL" "$REMOTE" -o "$MERGED"`) → **Apply** → `merge.guitool` = `kdiff3`
- [x] **Custom, and None** (§6): **Diff tool → Custom** → Apply with an empty Name → "Enter a name";
      `my tool` → "No spaces"; `my-tool` with an empty Command → "Enter a command"; with a
      command → Apply writes `difftool.my-tool.cmd`. A command typed here does not stick to the
      next pick: **Beyond Compare** again derives its own. Then
      **None** → Apply → toast `Diff tool cleared`, `git config --global --get-regexp 'diff\.(gui)?tool'`
      prints nothing while `difftool.bc.*` and `difftool.my-tool.*` are still there. Put Beyond
      Compare back for the rest of the group
- [x] **A commit's file** (§3): on `work` select `nested folders` → the diff header's **Open in diff
      tool** (ExternalLink, right of **Open diff window**) → BC opens with the parent's version left
      and the commit's right; toast `Opened <file> in BComp`. Ctrl+click a second row → the same
      button on the compare shows the two commits' versions
- [x] **The working tree** (§4): select the working-tree row, click an unstaged file → **Open in diff
      tool** → the right pane is the **real working file**: edit and save it in BC → the app's diff
      follows on its own. A staged file opens HEAD against the index; a deleted file (`gone.txt`)
      opens against an empty right side, not a path that is gone. A conflicted row and an
      untracked row have no such button
- [x] **Resolve in editor with a merge tool** (§5): with the main doc's conflict fixture and KDiff3
      (or any installed tool) set as the merge tool → the conflicted file's **Resolve in editor**
      button now reads `Resolve in KDiff3` in its tooltip (the label is unchanged) → click → the tool
      opens with the three sides; save → the file leaves conflict exactly as before
- [x] **Without a tool** (§6): Settings → Diff tool → **None** → Apply → the diff header's button is
      greyed with the tooltip `No diff tool set — Settings › Diff tool`; Merge tool → None → **Resolve
      in editor** falls back to VS Code / VSCodium as it always did (and to the same error toast
      naming `code` and `codium` with neither on PATH)
- [x] **It survives a restart** (§6): quit and relaunch → Settings shows both tools as stored, since
      they live in `~/.gitconfig`, not the app's kv store. Restore the machine's own values
      afterwards (`merge.tool BeyondCompare4`, `merge.guitool BeyondCompare5`,
      `diff.guitool beyondcompare4` — dump `git config --global --get-regexp 'tool|difftool|mergetool'`
      before starting)

## S. App name and window title (main §1, §6)
_Shipped 2026-09-06 (this commit); walked the same day over CDP on the installed build, the title bar read through `Get-Process t4-git-ui | Select MainWindowTitle` after each step; the Git-missing step by launching with git off `PATH`. The name was `T4 Git` then; it became `T4 Git UI` on 2026-09-20 (unit tests hold the strings, BC 1 reads the title bar)._

- [x] **The name** (§1): launch with no repository open → the start screen header reads `T4 Git UI`
      with the version beside it, and the window's title bar reads `T4 Git UI`
- [x] **It follows the repository** (§1): open `work` → the title bar reads `T4 Git UI - work`;
      **Repository › Close repository** → back to `T4 Git UI`; switch to another recent → its name
- [x] **Git missing** (§6): launch with git off `PATH` (or point Settings › Git executable at a
      file that is not git) → the Git-missing screen's hint starts `T4 Git UI needs git 2.24 or newer`

## T. Local-only tag badge (main §2)
_Shipped 2026-09-06 (this commit); walked the same day over CDP on the installed build in `work` (origin = `bare.git`) and a throwaway repository with no remote. Git keeps no local record of a remote's tags, so the badge comes from `git ls-remote --tags` run quietly after a fetch / push / pull / delete on remote, and the answer is cached per repository in the kv store — nothing hits the network on open._

- [x] **Nothing until the remote has been asked**: open `work` in a fresh install (no cache) → the
      Tags section shows `v0.1.0` with no badge, no toast
- [x] **Fetch marks the local-only ones**: **Fetch** → `v0.1.0` (never pushed) carries a `local`
      badge, tooltip `Not on origin (as of the last fetch or push)`; `git tag t1` in a terminal
      (the watcher or F5 picks it up) → `t1` carries `local` too
- [x] **Push clears it, delete on remote brings it back**: right-click `v0.1.0` › **Push…** →
      `Pushed tag v0.1.0 → origin`, the badge is gone (`git ls-remote --tags origin` lists it);
      **Delete on remote…** → `Deleted tag v0.1.0 on origin`, the badge is back
- [x] **Cached across opens**: **Repository › Close repository**, reopen `work` → the badges are
      there at once, without a fetch (`recents.json` holds `remoteTags:<repo>`)
- [x] **No remote, no badge**: a repository with a tag and no remote → the tag is plain, no toast

## U. Cherry-pick and revert (main §2, §5)
_Shipped 2026-09-07 (this commit); walked the same day over CDP on the installed build in `work` (`main` at `odd files`, its six unstaged edits left alone), `git log` / `git status` read from a shell after each step, the fixture put back afterwards (`reset --mixed` to `odd files`, `conflict.txt` checked out, the picked files removed). Git's own rules the UI leans on: a `-n` pick that applies cleanly leaves the change staged with `MERGE_MSG` written and no `CHERRY_PICK_HEAD`; a `-n` pick that conflicts leaves no `CHERRY_PICK_HEAD` either (so no in-progress banner — the conflicts banner and the prefilled editor are what you get, git 2.55), while a `-n` revert that conflicts does keep `REVERT_HEAD` (banner with Abort, editor prefilled); a plain commit from the panel clears `CHERRY_PICK_HEAD` / `REVERT_HEAD`._

- [x] **The row menu** (§2): right-click `topic/nested (folder branch)` → after Rebase: `Cherry-pick
      0aa57e5…`, `Revert 0aa57e5…`; on HEAD's own row only `Revert …` (picking HEAD onto itself
      records nothing)
- [x] **A clean pick** (§2): **Cherry-pick 0aa57e5…** → dialog `Cherry-pick 0aa57e5` with the
      summary, **Commit right away** (on), **Record the source commit (-x)** (off), preview
      `Runs git cherry-pick --end-of-options 0aa57e5…` → **Cherry-pick** → toast `Cherry-picked 0aa57e5`, the commit
      sits on `main` under the working-tree row, no banner
- [x] **Commit right away off** (§5): pick `twins (three branches here)` with the box unticked →
      preview `git cherry-pick -n --end-of-options …` → toast `Cherry-picked e6cbe9a — staged, commit to finish`,
      the working tree gains the staged file and the commit editor's Summary reads `twins (three
      branches here)` (from `MERGE_MSG`; the state stays clean). Undo from a shell: `git restore
      --staged twins.txt` and delete the file
- [x] **A conflicting pick, aborted** (§5): pick `conflict branch side` → toast `1 conflict — resolve
      in the commit panel`; banners `Cherry-pick in progress — resolve conflicts, then commit to
      finish` (**Abort**, **Commit**) and `1 file has conflicts — resolve, then stage it`; the status
      bar says `Cherry-pick in progress`; the editor's Summary reads `conflict branch side` →
      **Abort** → toast `Cherry-pick aborted`, both banners gone, the Summary empty again (the
      prefill was taken back)
- [x] **A conflicting pick, finished** (§5): the same pick again → resolve `conflict.txt` and stage
      it (from a shell or the panel) → the banner's **Commit** opens the panel with the message in
      place → the panel's **Commit** → the commit lands as `conflict branch side` on `main`,
      `CHERRY_PICK_HEAD` is gone, banners gone, status bar `Clean`
- [x] **Revert HEAD** (§2): right-click the new HEAD row → `Revert 9217e5e…` → dialog `Revert
      9217e5e` (summary, **Commit right away**, no `-x` box), preview `Runs git revert --no-edit
      --end-of-options 9217e5e…` → **Revert** → toast `Reverted 9217e5e`, HEAD is `Revert "conflict branch side"`
- [x] **A merge commit asks for its mainline** (§2): right-click `merge feature` → **Revert
      1574561…** → the dialog adds **Mainline parent** (`1 — 9f87c5f`, with the help line) and the
      preview reads `git revert --no-edit -m 1 --end-of-options …`; **Cancel**
- [x] **An empty pick** (§5): **Cherry-pick 9099161…** on `nested folders` (already in `main`) →
      toast `Operation failed — The previous cherry-pick is now empty, possibly due to conflict
      resolution.`, the in-progress banner with **Abort** / **Commit** and nothing staged →
      **Abort** → clean, no banner
- [x] **Commit right away off and a conflict** (§5): pick `conflict branch side` with the box
      unticked → toast `1 conflict — resolve in the commit panel`, only the conflicts banner (no
      `CHERRY_PICK_HEAD`, the status bar still says `Clean`), and the editor's Summary reads
      `conflict branch side`; resolve, stage and commit from the panel, or from a shell `git reset
      -- conflict.txt && git checkout -- conflict.txt` to drop it
- [x] **Commit right away off and a conflicting revert** (§5): from a shell, commit a further edit to
      `conflict.txt` on `main`, then **Revert 837a5a9…** (`main side of the conflict`) with the box
      unticked → preview `git revert --no-edit -n --end-of-options …` → the `Revert in progress` banner (**Abort**,
      **Commit**) and the conflicts banner both show (a `-n` revert keeps `REVERT_HEAD`, unlike a
      `-n` pick), the status bar says `Revert in progress`, the Summary reads `Revert "main side of
      the conflict"` → **Abort** → toast `Revert aborted`, `Clean`, the Summary empty; `git reset
      --mixed 00d78d3` drops the throwaway commit

## V. Open timing (main §1)
_Shipped 2026-09-07 (this commit); walked the same day over CDP on the installed build (overlay gone at 46 ms on `t4-git-ui`, `watcher started` 1.3 ms, `Loading branches…` caught by a 10 ms poll, `work` renamed with `git mv` from a shell and put back). The watcher no longer seeds a file-id cache (that walk stat'd every file under the workdir, 2.7 s on a 61k-file tree), `start_log`'s labels come from a history-free ref snapshot on their own `Repository` instead of the shared mutex, and the spinner waits for the grid — the sidebar fills a moment later. Five INFO lines say where the time went; the log is at `%LOCALAPPDATA%\dev.topher.t4gitui\logs\`._

- [x] **Open is quick**: from the start screen, open `t4-git-ui` itself (46k files under `target/`)
      → the `Opening t4-git-ui…` overlay is gone as soon as the grid has rows; in the log the gap
      from `opened repo` to `walk complete` is tens of ms, not seconds
- [x] **The timing lines are there**: the same open writes `opened repo`, `watcher started`,
      `labels computed`, `refs read` and `walk complete`, each with an `elapsed`; `watcher started`
      is a millisecond or two now (was the seconds-long seed walk)
- [x] **The sidebar says so**: on a slow open the sidebar shows a muted `Loading branches…` line
      (no empty Local / Remotes / Tags / Stashes sections), then fills with the refs
- [x] **Nothing else moved** (§2): in `work`, the labels on the graph rows, the `merged` badges and
      the ahead/behind counts in the sidebar are what they were before — the light snapshot is for
      labels only, `get_refs` still does the full one
- [x] **A rename still refreshes**: with `work` open, `git mv a.txt b.txt` in a shell → the working
      tree and the file list pick it up within a second (no file-id cache: git sees remove + create)
- [x] **`slow status` only when it is slow**: edit a few files in `work` → no `slow status` line in
      the log (the scan is well under 250 ms); the line appears only on a big tree

## W. Remote tag check (main §1)
_Shipped 2026-09-07 (this commit); walked the same day over CDP on the installed build in `work` (origin re-pointed at a missing path from a shell for the failure step and restored) and a throwaway remote-less repository. The `local` badge was only as fresh as the last fetch / push / pull / delete-on-remote from this app, and an `ls-remote` that failed (offline, auth without a terminal to prompt in) was swallowed. Now the cached answer carries the time it was given, the badge's tooltip says how old it is, `Refresh remote tags` on any tag row re-asks and reports, and a failed check toasts instead of leaving badges that quietly disagree with git._

- [x] **The tooltip dates the answer**: open `work`, **Fetch**, hover the `local` badge on a tag the
      remote does not have → `Not on origin (as of just now)`; leave it a few minutes and reopen the
      Tags section → `5m ago`. A badge from a cache written before this change reads `(as of the
      last fetch or push)` until the next check
- [x] **Re-ask from the row**: right-click any tag → after **Push…**, **Refresh remote tags** →
      toast `Checked origin: N tags` with the number `git ls-remote --tags origin | wc -l` gives
      (`1 tag`, not `1 tags`), and the badges / tooltip age update
- [x] **A failing check says so**: `git remote set-url origin c:/nowhere` in a shell →
      **Refresh remote tags** → error toast `Couldn't check origin for tags` with git's first
      stderr line, the badges unchanged (the old answer is kept, tooltip age unchanged); restore
      with `git remote set-url origin <the bare repo>` → the next check succeeds
- [x] **No remote**: in a repository with no remote, **Refresh remote tags** → info toast `No remote
      to check`, no badges
- [x] **Automatic checks stay quiet** (§5): **Fetch** in `work` → no `Checked origin…` toast, only
      the fetch's own; the tooltip age resets to `just now`

## X. Tags tree and per-remote tags (main §2)
_Shipped 2026-09-07 (this commit); walked the same day over CDP on the installed build in `work` (`mirror` = a second bare remote with `nested/one` and `releases/qas/v1.1.1`, `origin` with the latter only, `nowhere` a missing path; the `slow` fixture removed for the walk because its 60 s upload-pack holds the summary toast, and put back) and on `acme-portal`, the repository this replaces the single-remote check for (`Checked vendor: 1 tag, origin: 7 tags`; only `backujp`, `fg`, `perf-hotfix-backup` badged). The single-remote check asked the branch's tracking remote — on a repository whose checked-out branch tracks a personal mirror that is the wrong remote, and ten of eleven real tags were badged `local`. Now every remote is asked and shown._

- [x] **Local tags fold**: in `work`, tag something `releases/qas/v1.1.1` and `backup/old` from a
      shell → the Tags section shows `releases` and `backup` folders that expand and collapse like
      the branch folders, the leaf label being the last segment and the row's tooltip the full name;
      the section count is still the number of local tags (folders and remote folders don't count)
- [x] **A folder per remote**: with `origin` and `mirror` both pushed to, **Fetch** (or **Refresh
      remote tags** on any tag row) → below the local tags, a cloud-icon `origin` row and a
      `mirror` row, each expanding to that remote's tags (nested by `/` too); a tag on both remotes
      and locally appears three times, like a branch does
- [x] **The folder row is dated**: hover `origin` in the Tags section → `Checked just now`, and a
      few minutes later `5m ago`
- [x] **`local` means on no remote**: a tag pushed to `mirror` only carries **no** badge; one pushed
      nowhere is badged `local` with the tooltip `Not on origin or mirror (as of <the older of the
      two answers>)`; with nothing cached (a fresh open of a repository never checked) there are no
      badges and no remote folders at all
- [x] **A remote that is gone takes its folder with it**: `git remote remove mirror` in a shell →
      after the refresh the `mirror` folder and its share of the badge tooltip are gone, without a
      restart
- [x] **The remote tag row reveals**: click a tag under `origin` → the grid scrolls to its commit;
      click one whose commit the current walk hasn't got (filter the log to something else first, or
      a tag never fetched) → info toast `Not in the current history`, nothing else happens
- [x] **The remote tag menu**: right-click a tag under `origin` → **Copy name**, **Refresh remote
      tags**, then **Delete on remote…** (no Checkout / Create branch here — the object may not
      exist locally); the delete dialog opens with `origin` already selected, and deleting it drops
      the row from `origin`'s folder after the re-check
- [x] **One remote's failure doesn't poison the rest** (§5): `git remote set-url mirror c:/nowhere`
      in a shell → **Fetch** on `origin` alone → no toast about `mirror` at all (only the remote
      the op talked to is re-asked); **Refresh remote tags** → error toast `Couldn't check mirror
      for tags`, `origin`'s folder still updated, `mirror`'s folder unchanged; restore the URL
- [x] **The counts toast lists every remote**: **Refresh remote tags** with both remotes reachable →
      one info toast `Checked origin: N tags, mirror: 1 tag` (singular `1 tag`), matching
      `git ls-remote --tags <remote> --refs | wc -l` for each
- [x] **A real mirror**: open a repository whose current branch tracks a secondary remote (the case
      this replaces) → the tags that live on the main remote are **not** badged `local`, and only
      the genuinely unpushed ones are

## Y. Status scan off the lock, stat cache written back (main §1, §5)
_Shipped 2026-09-07 (this commit); walked the same day over CDP on the installed build in `c:/tmp/t4/acme-clone` (all 3004 tracked files touched first: `refs read` 68 ms, `slow status` 2.5 s once, the sidebar filled at ~0.8 s, an untracked file added from a shell rescanned without a second slow line, `git status` 59 ms afterwards, Stage all / Unstage all round-tripped; re-walked after the review moved the scan back under the lock: `refs read` 68 ms on a private `Repository` while the first scan ran, Stage all the moment the list appeared at 2.7 s and it landed). A tracked file whose mtime moved but not its content was rehashed on every scan, because libgit2 only writes the refreshed stat cache back when asked — after a formatter or a branch switch in another tool touched every file, `acme-portal` paid 2.4 s (17 s cold) per watcher event until `git status` ran in a terminal, and refs, details and diffs all waited behind the scan on the shared repo lock. Now the scan writes the stat cache back like `git status` (still under the shared lock: libgit2 writes the index without checking whether it changed on disk meanwhile, so the app's own staging must not interleave), and the refs snapshot reads on its own `Repository` so the sidebar never waits for a scan._

- [x] **One slow scan, not one per event**: in a clone of a big repository (`c:/tmp/t4/acme-clone`, 3000
      files), touch every tracked file's mtime from a shell (Python `os.utime` over `git ls-files`),
      open it → one `slow status` line in the log (seconds), then edit a file → no further
      `slow status` line; `git status` in a shell afterwards is instant and reports nothing
- [x] **Refs don't wait**: on that same open, `refs read` ends within ~100 ms of `opened repo`, not
      together with `slow status`; the sidebar fills while the scan still runs
- [x] **Staging cannot interleave with the scan**: libgit2 writes the index at the end of a scan without
      checking whether it changed meanwhile, so the scan holds the shared lock and a stage queues
      behind it (the Commit panel can only list a file once the first scan has landed anyway) —
      right after opening the touched clone, **Stage all** the moment the list appears → staged,
      `git status` shows `A`, and the index the scan wrote is the one the stage read
- [x] **Staging still works after the scan wrote the index**: stage and unstage a file from the
      Commit panel right after the slow scan → both land, `git status` from a shell agrees

## Z. Interactive rebase (main §2, §5)
_Shipped 2026-09-07 (this commit); walked the same day over CDP on the installed build in a fixture made for it (`c:/tmp/t4/irebase`: `base — add a — add b — [side: add s1] merged — fixup! add b — add d (branch `mid`) — add e`, a branch `other` off `add a` whose `other d` conflicts with `add d`, `a.txt` edited and `dirty.txt` staged). Git generates the todo (autosquash, `--rebase-merges`, `--update-refs`) and the dialog edits it; messages go through `exec git commit --amend -F`. Two findings fixed during the walk: git writes a blank line after every `update-ref` line and the dialog took it for a barrier between two adjacent picks; git's progress ends in `\r`, so the "Stopped at …" toast showed the last line instead._

- [x] **Dirty tree, list, merge notice**: right-click `add a` → **Rebase main interactively from
      here…** → "Uncommitted changes will be stashed…" with **Stash and continue** / Cancel; after
      it the rows `add a`, `add b`, `fixup! add b` already marked `fixup`, `add s1`, a read-only
      `merge` row, `add d`, `add e`; "1 merge commit in this range" with Keep merges / Flatten; the
      `--update-refs` checkbox (git ≥ 2.38); preview `git rebase -i --autostash --rebase-merges --end-of-options <parent oid>`
- [x] **Move barriers**: Move up / down greyed against the merge row and the section boundaries;
      `add d` ↔ `add e` swap (Alt+↑ / ↓ too, the moved row keeps focus)
- [x] **Reword + `--update-refs`**: `add e` → `reword`, the textarea prefilled with its message,
      edit it, tick Update branches, **Rebase** → `Rebased main`; the fixup folded into `add b`
      (`b.txt` has the fix, no `fixup!` commit), the merge kept, `mid` and `side` on their rewritten
      commits, the reworded message with both lines, the dirty tree back, `git stash list` empty
- [x] **Flatten + reorder + drop**: from `add a` again → **Flatten** re-reads without the merge
      row; move `add e` above `add d` (Alt+↑, focus stays on the moved row), `add d` → `drop`,
      **Rebase** → linear history without `add d` or the merge
- [x] **Squash**: from `add a` once more: move `add e` above `add s1`, `add s1` → `squash` — the
      textarea shows both messages joined by a blank line — edit it, `add b` → `drop`, **Rebase** →
      one commit `e and s1 together` with the edited body on top of `add a`, `b.txt` gone
- [x] **Edit stop**: right-click HEAD's own commit (the plain rebase item is gone there, the
      interactive one stays) → one row → `edit` → **Rebase** → info toast "Stopped at <sha>… <subject>"
      with "Continue or abort from the banner", the banner "Rebase paused — amend or add commits in
      the commit panel, then Continue" with **Abort · Skip · Continue**, the status bar "Rebase in
      progress"; **Continue** → `Rebase continued`, banner gone, dirty tree back
- [x] **Abort**: the same edit stop → **Abort** → back where it was
- [x] **Branch path with a conflict, Skip**: checkout `other`, right-click `main`'s tip → **Rebase
      other onto main…** → tick **Interactive** (preview `git rebase -i --end-of-options main`) → **Rebase** → the
      interactive dialog titled `Rebase other onto main` with the one pick → **Rebase** → `1 conflict`
      toast, both banners (rebase + conflicts) with **Skip** → `Commit skipped`, `other` on `main`
- [x] **Nothing to rebase**: Branch › Rebase… onto `main` with Interactive on → "Nothing to rebase",
      Rebase disabled
- [x] **No `--root`**: the root commit's menu has no interactive item; a non-clean state hides both
      rebase items
- [x] **Autostash decided at open** (re-walked after the review fix): dirty tree → **Stash and
      continue** → reword → **Rebase** runs with `--autostash`, `Rebased main`, the dirty tree back,
      no stash left; opened on a clean tree and dirtied from a shell while the dialog is up, the list
      stays put and **Rebase** fails with git's own line (`Please commit or stash them.`), HEAD unmoved
- [x] **From here on another branch** (review fix): All branches, right-click `add d` on `other` →
      **Rebase main interactively from here…** → Stash and continue → the dialog reads `9ade8e9 is not in
      HEAD's history`, Rebase disabled — the base would have moved `main` onto `other`'s history
- [x] **Ops while paused** (review fix): the edit stop above, then `git stash push -u` from a shell →
      Stashes › **Pop** → `Popped stash@{0}` (used to come back as a Paused failure, since every
      conflict-checked op consulted the rebase state) → **Abort** → `Rebase aborted`, the dirty tree back
- [x] **`amend!` keeps its message** (review fix): `git commit -am "amend! <HEAD's subject>" -m "<new message>"`
      from a shell → from `add a` → the row arrives as `fixup` under its target → **Rebase** → HEAD's
      message is the new one (the todo written back reads `fixup -C <oid>`), the dirty tree back
- [x] **Sidebar Merge / Rebase off a branch** (review fix): Checkout (detached) from a row → the `main`
      and `origin/main` rows' **Merge into current…** / **Rebase current onto…** greyed, title "No
      branch is checked out"; double-click `main` → enabled again, "Merge into main…"
- [x] **Typed `rebase --continue`** (review fix): two rows `edit` → **Rebase** → paused at the first;
      Repository › Run git command… `rebase --continue` → info toast "Stopped at <second>…", still paused
      (was an exit-0 "failure" with no toast, since only conflict-checked ops could report a pause) →
      **Abort**
- [x] **Re-walk: Move barriers** (`cb7c994`) — **walked 2026-09-11, passes.** The box above used to
      pass for a reason that no longer exists: `Input.tsx` bailed out of the Select's key handler on
      *every* Alt chord, app-wide, so Alt+↑/↓ reached the list by default. The list claims the chord
      in the capture phase now, and **only when the move is legal**.
      **The greyed buttons, from `add a` with Keep merges:** `add a` Move up disabled (first row);
      `fixup! add b` Move down disabled and `add d` Move up disabled (the merge row is a barrier on
      both sides); `add s1` **both** disabled, alone in its section; `add e` Move down disabled
      (last). Tick **Flatten** and the merge row goes, the six rows become one run, and only the two
      ends stay disabled — which is the cleanest proof the barrier is the merge line itself. A
      single-row dialog (`other d`, rebasing a branch) has both disabled.
      **The Alt half** is covered in full by AF's Alt+Arrow box: a refused Alt+↓ falls through and
      opens the Select's dropdown, a refused Alt+↑ commits the active option, and a **legal** Alt+↑
      moves the row — with focus staying on the moved row's own combobox, which is this box's
      original "the moved row keeps focus" assertion still holding under the new mechanism
- [x] **Re-walk: Branch path with a conflict** (`cb7c994`) — **walked 2026-09-11, passes, with the
      caveat below.** The banner-freshness fix: at the instant the conflict lands the rebase banner
      must never read "Rebase paused — amend or add commits…" and then correct itself.
      **Do not read this with a single query after the fact** — the flash is a stale status being
      replaced, so it can last one frame, and a late read sees only the settled state. (I lost the
      `Rebased main` toast in exactly that way earlier in this group.) Arm a `MutationObserver` on
      `document.body` *before* firing, logging every distinct `[class*="banner"]` / `[role="alert"]`
      text with a `performance.now()` stamp, then drain it afterwards.
      Walked on `other` (checked out from the sidebar), right-click `main`'s tip → **Rebase other
      onto main…** → tick **Interactive** (preview flips to `git rebase -i --rebase-merges --end-of-options main`) →
      **Rebase** → **Stash and continue** (the app adds `--autostash` at that step, so a dirty tree
      is fine) → the single pick `other d` → **Rebase**. The log held exactly **two** entries: the
      empty baseline at `t=0`, then both conflict banners together — "Rebase in progress — resolve
      conflicts and stage them, then continue" with Abort · Skip · Continue, and "1 file has
      conflicts — resolve, then stage it". **No intermediate state, no amend wording.** Git agreed:
      `AA d.txt`, `rebase-merge/`, `REBASE_HEAD`, detached HEAD.
      **The caveat, unchanged from when this box was written:** the stale window is one status scan,
      and `irebase` is tiny, so the scan is far too fast to leave much of a window. A failure here
      would have been strong evidence; this pass is weak evidence. The fix's real proof is the unit
      test and the ordering argument in `status.rs`, not this box
      (the checkbox's real `<input>` is visually hidden — click the wrapping `<label>`, not the input,
      or the click times out on "element is not visible")

## AA. Working tree linked to HEAD (main §2)
_Shipped 2026-09-07 (this commit); walked the same day over CDP on the installed build in `c:/tmp/t4/irebase`. While the tree is dirty (or a merge waits to be committed) the walk opens a lane column expecting HEAD before the first commit (`LogFilter.workingTree`), so HEAD's lineage takes lane 0 and the working-tree row's line runs down into it; a clean tree walks without the seed and gets the old layout back._

- [x] **HEAD on top**: dirty tree on `main` (its tip is the newest commit) → the dashed ring at lane 0
      with a line straight into `main`'s node; the rest of the graph as before
- [x] **HEAD below other tips**: checkout `other` (older than `main`'s tip) → after the re-walk the
      ring's line runs past `main`'s row into `other`'s node, both in HEAD's colour; `main` moved
      to lane 1; for the one page fetch in between, the old rows stay and the ring stands alone
- [x] **Clean**: `git stash` from a shell → the row goes, the line goes, `main` is back in lane 0
      (today's layout); `git stash pop` → row, line and lane 1 back
- [x] **Text filter**: type a filter → flat list, no row; clear it → the row and its line are back
- [x] **Back to `main`**: checkout `main` from its row → the line again ends at the top commit.
      (Walk finding, fixed: a checkout between two branches the walk already had used to relabel
      only — same commits — and left the seed column pointing at the old HEAD; a seeded walk now
      restarts when HEAD itself moves)

## AB. Rename from the commit row (main §2)
_Shipped 2026-09-07 (this commit); walked the same day over CDP on the installed build in `c:/tmp/t4/irebase`. The sidebar's Rename… reachable from a commit row: one `Rename <branch>…` per local branch at the row, in a group of its own between Copy SHA and the delete group; the checked-out branch and protected names included (only delete is guarded)._

- [x] **Rename from the row**: right-click `main`'s tip → **Rename main…** in its own group after
      Copy SHA, above the red delete items → the `Rename branch` dialog prefilled → `trunk` → `Renamed main → trunk`, the chip,
      the sidebar and the title's branch follow; a row without a local branch has no rename item;
      rename back

## AC. In-app updates (main §1, §6)
_Shipped 2026-09-10: `954830a`. `tauri-plugin-updater` behind two app commands, so
`capabilities/default.json` is untouched and every window can ask. The manifest is `latest.json`,
written by the `publish` job from the per-platform `.sig` files and read from GitHub's "latest
release" URL. Walked 2026-09-10 against the published v0.5.0, from a throwaway 0.4.9 NSIS build
upgrading itself twice. The last three boxes need a network that can be pulled and a Linux package;
they stay clear._

- [x] **Offered on launch**: with a build older than the published release installed (bump down, build
      NSIS locally with the signing env vars set, install), launch → an **Update** badge appears
      beside the Settings gear on the start screen and, after opening a repository, in the toolbar →
      clicking either opens **Settings → Updates**
- [x] **What's new**: with an update found, **What's new** appears beside the two buttons and opens
      that release's page in the browser — on Windows and macOS too, not just where the install is
      handed off
- [x] **The install**: status reads `Version <v> is available` → **Update to <v>…** is enabled →
      press it → `Downloading… N%` climbs and the bar **fills to match it** (it sweeps only while the
      total size is unknown), Esc does not close the dialog and Close is disabled → the app installs
      and restarts on the new version → the badge is gone
- [x] **Up to date**: on the current build, open Settings → the status line names this build **without**
      claiming anything (`T4 Git UI <v>`, no verdict) → **Check now** → `Checking…` → `T4 Git UI <v> is up
      to date`, and **Update to…** stays disabled reading `Up to date`
- [x] **The toggle governs the launch check only**: switch *Check for updates on launch* off, close
      and reopen the app → no badge, nothing asked → open Settings → **Check now** still answers;
      the setting survives a restart
- [ ] **A failed check is honest**: pull the network → **Check now** → the failure shows in the
      Updates section (not as a toast), the dialog stays usable, and the status line does **not**
      fall back to `is up to date`
- [ ] **A failed install unsticks**: interrupt the download (kill the network mid-transfer) → the
      message lands beside the buttons, the progress bar goes, and **Update to <v>…** can be pressed
      again
- [ ] **deb / rpm**: on a `.deb` install the button reads **Download…** and opens the releases page
      instead of installing; on the AppImage it installs in place like Windows

## AD. Stage / unstage the selection from the header (main §4)
_Shipped 2026-09-11 (this commit). The two header buttons read **Stage selected** / **Unstage selected**
and act on that list's selection alone once it owns two or more rows; at one row or none they stay
**Stage all** / **Unstage all** and take the whole list. One selection is shared between the lists
(`commitStore.list` records which owns it), so only one header is ever in "selected" mode. Two rows
rather than one because `syncWithStatus` re-seeds a single row after every refresh — flipping on one
would hide the whole-list action for good. Walked 2026-09-11 over CDP on the installed build in
`c:/tmp/t4/work`; every staging assertion was taken from `git`, not from the panel. One finding (the
header jog, last bullet) and one check that this fixture cannot reach (second-to-last)._

- [x] **The flip, and what it stages** (§4): in Unstaged click a file, `Ctrl+click` a second → the
      button reads **Stage selected** → click it → exactly those two move to Staged, the rest of the
      list is untouched (`git diff --cached --name-only` named only them; the three unselected rows
      stayed ` M`)
- [x] **Only the owning list flips** (§4): while that selection is alive in Unstaged the Staged header
      still reads **Unstage all**; now `Ctrl`-select two staged rows → Staged reads **Unstage
      selected** and Unstaged is back to **Stage all**. A *single* staged Ctrl+click moves ownership
      but keeps **Unstage all** — the threshold is two, and one row is the resting state
- [x] **Back to the whole list** (§4): click any single row → the label returns to **Stage all**.
      There is no clear-selection gesture, so mid-selection this is the only way back. A finished
      "… selected" action needs no click: it re-seeds one row itself, so the label comes back even
      when the conflicted files it skipped are still there (they used to keep the header on a dead
      **Stage selected** with the whole-list action out of reach).
- [x] **The commit dialog is the same** (§4): open the full-window commit dialog and repeat the first
      two checks — it mounts these very same headers. Both surfaces are mounted at once, so scope
      every query to the dialog: an unscoped `[aria-label="Unstaged files"]` finds the *panel* first
- [x] **A folder right-click flips it too** (tree view, cf. group M): right-click a folder holding two
      or more files → its subtree becomes the selection and the header reads **Stage selected**; the
      menu's own "Stage 2 files" agrees on the count. Dismissing the menu keeps the selection
- [x] **Conflicted files are skipped, not the whole action** (§5, mid-merge): `Ctrl`-select a modified
      file and a conflicted one → **Stage selected** is enabled, its tooltip says "(1 skipped)", and
      clicking it stages only the modified one. Check the index, not the tooltip: "(1 skipped)" reads
      the same whether counted over the selection or the whole list, so keep a third unselected file
      in the list and prove *it* was not staged. `git ls-files -u conflict.txt` must still print 3
      stages — `git diff --cached` lists a conflicted path whether or not it was staged, so it is not
      evidence on its own
- [x] **A selection with nothing to stage is refused** (§4, mid-merge): needs two or more files that
      are *all* conflicted. `git merge conflict` yields exactly one (`conflict.txt`) — confirm with
      `git merge-tree --write-tree HEAD conflict` before trying — so the stock fixture cannot reach
      it. Rather than reshape the fixture's history, build two throwaway branches off `main` that
      change the **same two files** differently and merge them: **`docs/smoke/fixtures/ad7-setup.sh`** does it
      (`tc-a`, `tc-b` → `hunks.txt` + `nonl.txt` both `UU`), and **`docs/smoke/fixtures/ad7-teardown.sh`** puts
      `work` back to `A decoy.txt` on `reset-me`. Both guard before they act — the setup refuses
      unless `work` is at its resting state, the teardown is safe to run twice and from a
      half-finished setup. (They were written in a session scratchpad on 2026-09-11 and committed on
      2026-09-12, for the reason `docs/smoke/fixtures/irebase-fixture.sh` exists: a fixture recipe that lives only
      in a scratchpad is gone by the next walk.) Walked 2026-09-11:
      selecting only the two conflicted rows flipped the header to **Stage selected**,
      `disabled: true`, titled "Every file here is conflicted — a conflict is staged on its own, once
      resolved" — its own message, **not** a "(2 skipped)" partial.
      **The quoted tooltip is the pre-`e57945d` wording and this tick is stale in that one respect.**
      `e57945d` (2026-09-12) split the message by mode, because "here" was false of exactly this
      case: the selection is refused while the list around it still holds stageable files. This
      scenario now reads "Every file **you selected** is conflicted — …", and "here" survives only
      for a whole list with nothing stageable in it — which has no cover at all, unit or smoke (see
      R5 in `docs/archive/plans/2026-09-12-review-findings.md`). Everything else this box asserts — the
      refusal, the `(2 skipped)` re-enable, the untracked control — is unaffected by that commit and
      still stands. Re-walk the tooltip half on the next build that reaches this fixture. Then adding `crlf.txt` to the selection re-enabled it with the
      "(2 skipped)" title, and clicking it staged `crlf.txt` **only**: `git diff --cached --stat`
      showed `crlf.txt | 1 +`, `ls-files -u` still showed 3 stages each for the two conflicts, and
      the unselected `decoy.txt` stayed `??`. That untracked control is the whole point — the
      "(2 skipped)" tooltip reads the same whether counted over the selection or the list, so only
      an unselected stageable file proves the action respected the selection
- [x] **The header jog is bounded** (§4, §6; was "does not jog" — see the 2026-09-12 note at the end) — **was a FINDING, 2026-09-11: it jogged.** Measured over CDP:
      at rest `Stage all` is `left: 514, width: 63`; flipped, `Stage selected` is `left: 481,
      width: 96`. The right edge stays pinned at 577, so nothing downstream moves — but the button's
      left edge **and the count badge both slide 33px left** (badge `left` 491 → 458). Cause is as
      predicted: `.headerBtn` (`CommitPanel.module.css:24-27`) sets only `height` and `font-size`.
      **Fixed the same day** with `min-width: 112px` on `.headerBtn`: the `all`→`selected` swap costs
      the same +33px on both buttons (identical prefix, identical suffix), so `Unstage selected` is
      the widest of the four at 110px and one floor covers both headers.
      **Re-walked 2026-09-11 on the rebuilt installer — it holds still.** `Stage all` at rest:
      `left 465, w 112`; flipped to `Stage selected`: `left 465, w 112`. The count badge sat at
      `left 442` in both states. Movement is **0px** either side, against 33px before. `Unstage all`
      measures `left 465, w 112` too, so the shared floor lines both headers up rather than just
      padding one. No test can stand in for this: jsdom has no layout, so the suite cannot see a
      `min-width` — it has to be measured in a real build.
      **The floor has since been found to have two costs this measurement could not see** (2026-09-12
      review, R2 and R3 in `docs/archive/plans/2026-09-12-review-findings.md`). It is paid entirely by the
      panel title, which is the only flexible item in the header, and it is paid *most* in the resting
      `Stage all` state — 112px against a 63px label — so the title ellipsizes first at a narrow
      panel. And while the button is disabled-and-titled it is wrapped by `DisabledHint`, whose
      `.wrap` carries `min-width: 0` and none of the control's own sizing, so the floor stops
      governing the slot in precisely the conflicted case this feature is about. Both were measured
      with the panel unconstrained, which is why neither showed up here; settling them needs
      `getBoundingClientRect()` at a 220px panel.
      **Measured 2026-09-12 at the files column's 220px minimum (installed build, panel forced by
      style):** with the floor, the resting `Stage all` header shows `Unstaged` at **15px of 56**
      (ellipsised); without it, 56 of 56. `Staged` fits either way (no tree toggle beside it).
      `Stage selected` clips the title in both cases (15 vs 31 of 56). Rule decided at triage:
      the floor truncates the resting title and no-floor doesn't → **the floor is gone** and the
      33px jog during a multi-selection is accepted. This box now asserts the *jog* — button and
      badge slide left while "…selected" shows and return on a single click — not its absence.

## AE. Tooltips on disabled controls (main §2, §4, §5, §6)
_Shipped 2026-09-11 (this commit). Chromium gives a disabled control no pointer events, so its
`title` never fires — and on a disabled control the `title` is almost always the explanation for
**why** it is dead ("No changes", "No URL configured", "The file is not in the working tree"). About
twenty of those were unreadable. `components/ui/DisabledHint` wraps such a control in a `<span
role="none" title=…>`, which is not itself disabled and so does take the hover. **Four** components
go through it — `Button`, `IconButton`, `MenuItem` and `ToolbarButton`. The fourth was missed on the
first pass and the walk caught it (see the toolbar bullet): the fix was driven by grepping for
`disabled`+`title` *call sites* and wiring up the three components those pointed at, when the
question that mattered was which components render a raw `<button>`. Everything else with a raw
button is genuinely unaffected: `ActionCard` renders its `title` as visible text, `Input`'s trigger
carries no title, and `Input`'s option rows use `aria-disabled`, which still takes a hover.
It wraps **only** when `disabled && title` are both true, so every enabled control renders exactly
the DOM it always did — which is what bounds this group: only disabled-with-a-reason controls can
have moved._

**What CDP can and cannot prove here.** A native `title` tooltip is drawn by the browser as an OS
widget, **not** in the DOM, and a page screenshot does not capture it. So the walk proves the hover
target exists (a `[role="none"]` wrapper carrying the title, wrapping the disabled control) and that
nothing shifted; whether the tooltip actually paints needs a human hover, held ~1s. Tick the DOM
half from CDP, and the visual half only once someone has really seen one.

- [x] **A disabled toolbar button** (§5) — **FINDING, then fixed and re-walked the same day; passes.**
      Fetching from the `slow` remote holds every toolbar control disabled for ~60s, and in that
      window the page had **9 disabled buttons but only 3 wrappers** — the three being
      `IconButton`s. The cause is in source, not inference: `ToolbarButton`
      (`components/ui/ToolbarButton/ToolbarButton.tsx:12`) renders its **own** `<button>` and never
      touched `DisabledHint`, so Fetch / Fetch options / Pull / Push / Branch / Stash / Commit &
      Push all kept an unreadable "Operation in progress". That is the most-seen dead-control
      message in the app. **Wired up the same day** and covered by a unit test; **re-walk on a fresh
      build.** The lesson generalises: the first pass grepped for `disabled`+`title` *call sites* and
      fixed the three components they pointed at, without asking which components render a raw
      `<button>`. The full set is four — `Button`, `IconButton`, `MenuItem`, `ToolbarButton`;
      `ActionCard` renders `title` as visible text, `Input`'s trigger has no title, and `Input`'s
      option rows use `aria-disabled` (which still takes a hover), so those three are unaffected.
      **Re-walked on the rebuilt binary: 9 disabled, 9 titled, 9 wrapped, `unwrappedDisabledTitled`
      empty** — covering all three families at once (`ToolbarButton` ×6, `IconButton` ×2, `Button` ×1
      for Commit & Push). Every one reported `boxesMatch: true`, i.e. the wrapper's box equals the
      button's, which settles the "has the toolbar row reflowed?" half without a separate
      measurement. If re-walking again, the race-free alternative is a **clean** repo
      (`c:/tmp/t4/other` or `mbk-clone`; `work` never qualifies, `decoy.txt` is permanently staged),
      where the commit button sits disabled at "No changes" (`Toolbar.tsx:259`) indefinitely
- [x] **A disabled item in a dropdown menu** (§2) — **walked 2026-09-11 on the rebuilt binary,
      passes**, after two failed attempts described below. With a `slow` fetch in flight the
      Repository menu had **18 items, 17 of them disabled and titled "Operation in progress", and
      all 17 wrapped** — every one 212px, identical to the single enabled item
      (`disabledWidths` == `enabledWidths` == `[212]`, `widthsMatch: true`), each `wrapDisplay:
      flex` with `boxesMatch: true`. This is the **block-layout** `.menu` (`display: block`,
      `width: 220px`), the harder of the two menu types and the exact case `.itemWrap` exists for:
      left inline, all 17 rows would have shrunk to their own text and lost their hover background.
      Direct child roles stayed `menuitem` / `none` / `separator`, so ARIA holds up at 17 wrappers.
      The disabled items must be **full width**: this is the regression the wrapper nearly caused
      (`.menu` is a block and `.item` fills it with `width: 100%`, so an inline wrapper would shrink
      the row and cut its hover background — hence `.itemWrap`). Two dead ends worth knowing:
      the **Stash** dropdown has persistently disabled items (`Pop latest`, `Apply latest`,
      `No stashes` with 0 stashes) but they carry **no `title`**, so `DisabledHint` correctly does
      not wrap them — all 212px, but that is the pre-existing baseline and proves nothing about the
      wrapper. The only dropdown items that are disabled **and** titled are the Repository menu's
      (`Toolbar.tsx:118-138`, `disabled={running}` + `title={BUSY}`), which needs an operation in
      flight. `git fetch slow` buys ~60s (`remote.slow.uploadpack` runs `slow-upload-pack.sh`, which
      sleeps 60) — but the window closed before the menu was opened, and all 18 items came back
      enabled. **Open the Repository menu first and measure immediately**, or re-trigger the fetch
      and go straight there. The equivalent check already passed in a *context* menu (see below),
      which shares the same `.item` rule and the same `.itemWrap`, so this is a gap in coverage
      rather than a suspected bug
- [x] **Keyboard still works in that menu** (§2, §6) — **walked 2026-09-11, passes.** Walked on the
      `ghost` remote-group menu (5 items, `Copy URL` disabled at index 1). From `Fetch ghost`
      (index 0), `↓` landed on `Rename…` — **index 2** — skipping the wrapped disabled row; `↑` went
      straight back to index 0, so the skip holds **upward as well**, which matters because the
      wrapper sits between the menu and the item. `Escape` closed it (`[role="menu"]` count 0) and
      returned focus to the `ghost` treeitem. `Menu.tsx` finds items with
      `[role="menuitem"]:not(:disabled)`, a descendant query the wrapper does not disturb — but that
      reasoning was written here **before** any walk, and this box was briefly reported as passing on
      the strength of it. It is now actually measured
- [x] **A disabled item in a context menu** (§4) — **walked 2026-09-11, passes.** Right-clicking the
      deleted row gave a menu of 5 items, 3 enabled and 2 disabled (`Open`, `Reveal in folder`), both
      titled "The file is not in the working tree" on the item **and** on the wrapper. Every item
      measured **212px** — `disabledWidths` and `enabledWidths` both `[212]` — so the wrapped rows
      are exactly as wide as the rest, which is the regression this bullet exists to catch. Each
      wrapper's box equalled its item's box exactly (`428/836/212/26`, `428/862/212/26`), so the
      wrapper costs no layout at all, and its computed `display` was `flex` (the `.itemWrap`
      override doing its job). The menu itself stayed 220px. The menu's direct children were 3
      `menuitem` + 1 `separator` + 2 `role="none"` spans, so `role="menu"` still owns only menuitems
- [x] **Keyboard still works in that menu** (§2, §6) — **walked, passes.** With 3 enabled and 2
      disabled items, four `ArrowDown` presses discriminate cleanly: skipping correctly lands on
      `Discard…`, while treating disabled items as reachable would land on `Reveal in folder`. Focus
      landed on **`Discard…`**, and no disabled item ever held focus. `Escape` then closed the menu
      and focus returned to the panel's listbox. So the `role="none"` wrapper does not disturb
      `[role="menuitem"]:not(:disabled)` — confirmed, not assumed
  **Setup for those two:** they need a **deleted** file, and `work` has none —
      nothing is deleted there and `gone.txt` does not exist (checked, 2026-09-11). Make one:
      `rm C:/tmp/t4/work/crlf-hunks.txt` → the row appears as ` D` → right-click it → **Open** and
      **Reveal** are disabled and carry "The file is not in the working tree"
      (`FileContextMenu.tsx:117,122`). Restore with
      `git -C C:/tmp/t4/work checkout -- crlf-hunks.txt`. Pick a file the AD 7 fixture does not
      touch — `ad7-setup.sh` conflicts `hunks.txt` and `nonl.txt` and dirties `crlf.txt`, and a
      conflicted file is not a deleted one.
      The context menu sizes to `width: max-content`, so check the menu itself did not grow or
      shrink, and that the disabled rows are as wide as the enabled ones
- [x] **A disabled icon button** (§3) — **walked 2026-09-11, passes**, though on a different control
      than this bullet first named: the output dock's **Expand output** arrives disabled, so it
      serves with no setup at all. It carried a wrapper titled "Expand output" — an `IconButton`
      falls back to its `label`, so a disabled icon button gets a tooltip even when none was passed
      — and the wrapper's box was identical to the button's (`left 1898, top 1110, 24×24`), i.e. no
      layout cost. `DiffViewer`'s `Split view` ("unavailable while staging") is the same code path
      if a second witness is ever wanted
- [x] **A disabled item in the sidebar** — **walked 2026-09-11, passes. The earlier "unreachable"
      finding recorded here was wrong.** `Sidebar.tsx:518` disables **Copy URL** with "No URL
      configured" when `!r.url`. The first attempt unset `remote.nowhere.url`; the remote vanished
      from the sidebar, and that was written up as "the branch cannot be reached by a user" — a bad
      generalisation from the one fixture that could not show it (`nowhere` had never been fetched,
      so it had no refs to fall back on). `refs.rs` builds a `Remote` with `url: None` on two
      **reachable** paths: `:704-709` and `:719-724` (`or_insert_with`) create a group from
      `refs/remotes/<name>/…` **refs** when the remote is absent from config, and `:673-676`
      `.filter(|u| !u.is_empty())` maps an **empty** configured url to `None`. A removed remote that
      left stale tracking refs — an ordinary state — lands on the first. Reproduced instantly with
      `git -C C:/tmp/t4/work update-ref refs/remotes/ghost/main $(git -C … rev-parse main)` and no
      `remote.ghost.url`: `ghost` drew in the sidebar as a `treeitem` (y 308), and its menu's **Copy
      URL** came back `disabled: true`, titled "No URL configured" on the item **and** on the
      wrapper, `wrapped: true`, wrapper width **212px** — identical to the item and to all four
      enabled rows — inside the 220px `display: block` menu. Ref deleted afterwards.
      **Do not delete that guard**: removing it would make Copy URL copy an empty string in a state
      users reach by deleting a remote
- [x] **Nothing changed where it should not** (§6) — **walked, passes, in both directions.** The
      commit panel held **0** `[role="none"]` wrappers while `Stage all` was enabled, **1** the
      moment the selection made it disabled, and **0** again once a stageable file rejoined the
      selection. In the context menu the three enabled items were `wrapped: false` and only the two
      disabled ones were wrapped. That 0→1→0 is what bounds the blast radius: an enabled control
      renders exactly the DOM it always did, so nothing outside "disabled **and** titled" can have
      moved
- [x] **This bullet was wrong — corrected and closed 2026-09-11.** It claimed
      `RebaseInteractiveDialog.tsx:191` puts a title on a **native** `<option>` that "still shows
      nothing". Measured over CDP in the rebase dialog: there is no native `<select>` and **zero
      `<option>` elements in the DOM**. The `<option>` JSX is consumed as data by `Input.tsx`'s
      `Select` (`:61-64` reads `value` / `disabled` / `title` off the children), which renders
      `div[role="option"]` rows with `aria-disabled="true"` (`:228`) and `title={o.title}` (`:229`).
      An `aria-disabled` div is not pointer-dead, so the title is on a hoverable element — which is
      what `smoke-cdp.md:41` said all along and what this group's own preamble (`:791`) says too.
      So the premise for "left alone deliberately" does not hold. **Hover confirmed in a real window
      2026-09-11**, so this is a behaviour claim now, not only a documentation fix: with the tree
      clean the toolbar's **Commit** button is `disabled` and wrapped
      (`<span role="none" title="No changes">`), and parking the **real** cursor on it painted a
      native **No changes** tooltip, absent from the control grab taken with the cursor parked away.
      A page screenshot **cannot** see this — the tooltip is an OS-drawn layer outside the page — so
      it needs the real cursor (`SetCursorPos`) and a screen grab (`Graphics.CopyFromScreen`).
      Two traps, each of which yielded a confident **wrong** result before a right one.
      (1) Gate the capture on the app genuinely being **foreground**, asserted immediately before
      *and* after every grab: `SetForegroundWindow` from a background process is downgraded to a
      taskbar flash, and a grab of whatever window is really on top is indistinguishable from
      "no tooltip appeared". Twice the capture was of another window entirely — once of the browser,
      once of a window that stole focus *mid-run*, after the opening check had already passed.
      (2) Confirm the button is still **disabled at capture time**. A stray `.playwright-mcp/`
      snapshot file dirtied the working tree, which re-enabled **Commit** and produced a perfectly
      real tooltip — of the *enabled* button's own `title` (`1 change`), which proves nothing about
      the wrapper

## AF. Squash past a drop, Alt+Arrow, banner freshness (main §2, §5)
_Shipped 2026-09-11 (`cb7c994`); **walked the same day over CDP on a build made for it** — all five
boxes pass, and the two group Z re-walks above with them. Three changes, one of which reaches the
whole app. (1) `canSquash` no longer refuses a member whose group head is `drop` — git accepts it, and with
`pick A / drop B / fixup C` it removes B and folds C into A. `groupOf` returns a contiguous span so
the drop travels with the group. (2) `Input.tsx` used to bail out of the Select's key handler on
**every** Alt chord, app-wide, purely so the rebase list could move a row while a Select had the
focus; the list claims the chord in the capture phase now, and only when the move is legal, so the
combobox has Alt+↓ opens / Alt+↑ commits back. (3) The rebase banner chose its wording from
`status.conflicted === 0`, which a status scanned **before** the rebase began also satisfies;
`WorkdirStatus` now carries the `RepoState` it was scanned in and the banner takes the pause wording
only when that agrees with the refs._

_**Fixture first.** These want `c:/tmp/t4/irebase` in the shape group Z's preamble describes
(`base — add a — add b — [side: add s1] merged — fixup! add b — add d — add e`). A walk **rewrites**
it — that is the point of it — so it is drifted more often than not: the 2026-09-07 walk left
`add e (reworded)` and `e and s1 together (rewalk reword)` behind, and this one consumed it twice
more. `smoke-fixtures.ps1` builds `work` only and never touched this one, so 2026-09-11 added
**`docs/smoke/fixtures/irebase-fixture.sh`**: it wipes and rebuilds the whole shape, including `mid` / `side` /
`other` and the resting dirty state (` M a.txt`, `A dirty.txt`), with a repo-local identity so
`~/.gitconfig` is never involved. Run it before the group and again between boxes that rewrite
history. It opens with `rm -rf`, so **point the app at another repository first** — a wipe under an
open repo can fail on a locked file and leave the fixture half-built._

- [x] **Squash past a drop** (§2) — **walked 2026-09-11, passes.** From `add a`, **tick Flatten
      first**: with Keep merges the merge row sits between `add s1` and `add d`, and `pickAbove`
      stops there (a merge line is not a pick), so `add e` would be refused for that reason and the
      box would read as a failure it isn't. Proof it is the barrier and not the fix: under Keep
      merges `add d`'s own squash/fixup were disabled and titled "No commit above to squash into";
      flattening enabled them. Flattened, set `add d` → `drop` and `add e` → `fixup`. **Control
      first** — with `add d` still `pick`, every option on `add e` is enabled; after the drop they
      are *still* enabled, unchanged, which is the assertion (before this commit the drop above
      disabled them). Todo read `pick / pick / fixup / pick / drop / fixup`, Rebase enabled, no
      validation line and **no textarea** (fixups carry no message, and no squash was present).
      **Rebase** → `base — add a — add b — add s1`: `add d` gone and `d.txt` gone from the tree, no
      merge commit, and `add s1` (`4e2a113`) carries **both `s1.txt` and `e.txt`** — folded into the
      pick *above* the drop. `b.txt` held `b` + `b fixed`, so the autosquash fixup folded too; the
      dirty tree came back (` M a.txt`, `A dirty.txt`) with `stash list` empty; `mid` and `side`
      stayed on their old oids, `--update-refs` being unticked. All of it read from `git`, none from
      the dialog. **Not** evidenced: the `Rebased main` toast — it was read too late and had already
      gone, so only the git outcome is on the record
- [x] **A run of drops is still no ladder** (§2) — **walked 2026-09-11, passes.** This is the half of
      the change that must **not** have moved. Over the three rows `add a` / `add b` / `add s1`: set
      `add s1` → `squash`, then `drop` **both** rows above it. `add s1`'s squash and fixup came back
      `aria-disabled="true"` titled "No commit above to squash into", the **Rebase button was
      disabled**, and the textarea was gone (a lone squash forms no group, so `needsMessage` is
      false). `pickAbove` walked past both drops and fell off the top, which is the refusal. Two
      free witnesses on the way: `add a`, the first row, has the same two options disabled with no
      drops involved at all; and under Keep merges the row just below the merge line does too,
      because a merge is not a pick (see the box above).
      **Probe correctly.** Read `aria-disabled`, **not** `disabled` — the action list is not a
      native select (see the AE correction below) but `Input.tsx`'s own listbox of
      `div[role="option"]` rows with a live `title`. And the validation line is **not** in a `<p>`:
      it is `span._problem_` inside the dialog, reading `4e2a113 has no commit above it to squash
      into`. A probe that scans paragraphs finds nothing and reads as a pass
- [x] **A dropped row inside a group keeps the message box** (§2) — **walked 2026-09-11, passes.**
      Build `pick` / `drop` / `squash` over three adjacent rows. The textarea must stay up and the
      drop must resolve to the group it sits *inside*, not to a group of its own.
      **It re-keys, which is more than "stays up".** With `add a` pick / `add b` pick / `add s1`
      squash the box was labelled `Message for afb6e0d` (`add b`, the head at that moment) holding
      `add b\n\nadd s1`. Setting `add b` → `drop` re-keyed it to **`Message for 95ad317`** (`add a`,
      the new head past the drop) and recomposed the default to `add a\n\nadd s1` — the head walk
      stepping over the dropped row, visible in the UI.
      **The edit survives a round trip**: typed `EDITED-KEYED-BY-HEAD`, clicked away to another row,
      clicked back **onto the dropped row** — box still up, still labelled `Message for 95ad317`,
      still holding the edit, with the drop itself the active row. That is `validate` and the dialog
      agreeing to key by the group's head rather than the drop's own oid.
      **And it lands.** On a re-seeded fixture, flattened, `add d` → `drop` and `add e` → `squash`:
      the box came up `Message for 47c1fe0` (`add s1`, again the head past the drop) defaulting to
      `add s1\n\nadd e`; typed `BOX3-MESSAGE-LANDED` → **Rebase** → toast `Rebased main`, and
      `git log` gave `base — add a — add b — BOX3-MESSAGE-LANDED`, that commit carrying `e.txt` and
      `s1.txt` together, `add d` and `d.txt` gone, `b.txt` holding the folded fixup, the dirty tree
      back and `stash list` empty.
      Selection is a **class** (`_rowActive_`), not `aria-selected` — assert on that
- [x] **Alt+Arrow in every dropdown** (§2, §6) — **the app-wide one. Walked 2026-09-11, passes in all
      four cases.** No test can stand in for it: jsdom has neither the capture-phase handoff against a
      real listbox nor a native combobox's feel.
      **Away from the rebase list** — the toolbar's **Branch filter** serves with no setup (the Push
      remote picker or Create branch would do as well). Alt+↓ opened it (`aria-expanded` true, focus
      kept on the button); ArrowDown moved the active option to `HEAD` while the value still read
      `All branches`; Alt+↑ then **set the value to `HEAD` and closed** — and the commit grid
      re-filtered to 12 rows, so the change reached the store, not just the label.
      **In the rebase action Select**, the case the capture handler exists for, all three:
      on the **last** row (move down refused) Alt+↓ **fell through and opened its own dropdown**,
      leaving the row order untouched; on the **first** row (move up refused) Alt+↑ **committed the
      active option** — value went `drop` → `edit`, list closed, order unchanged; and on a row whose
      move **was** legal, Alt+↑ **moved the row** (`add s1` swapped above `add b`) and did *not*
      commit the highlighted option. That contrast is the whole design.
      **Two things a re-walk must get right, both of which made my first attempt inconclusive.**
      (1) The highlight **parks on disabled options** — ArrowUp from `drop` stopped on `fixup`, which
      carries `aria-disabled` (correct ARIA: `aria-disabled` rows stay navigable, unlike `disabled`).
      Alt+↑ over a disabled option closes **without committing**, which reads exactly like a no-op.
      So measure `aria-activedescendant` *before* pressing Alt+↑ and pick an **enabled** option that
      differs from the current value, or the test proves nothing. (2) Pick the row by which move is
      **refused**, not by position: the last row still moves *up* happily, so Alt+↑ there exercises
      the list, not the Select.
      **Every other Alt chord is left alone — measured 2026-09-11.** On the Branch filter, closed:
      Alt+Home, Alt+End and Alt+Enter each left the value (`All branches`), `aria-expanded` and the
      button's own focus untouched. Open: Alt+End neither closed the list nor moved
      `aria-activedescendant` off `All branches`. State it precisely, though — the one Alt chord that
      **is** handled is **Alt+↓**, which opens the listbox. That is the standard ARIA combobox chord
      and is deliberate, not a leak from the rebase list
- [x] **No phantom conflicts after an abort** (§5) — **walked 2026-09-11, passes.** Continues
      straight on from the conflicted rebase in the Z re-walk above, with the same
      `MutationObserver` still armed. **Abort** → the log's next and final entry took **both**
      banners to empty in a *single* transition: no intermediate state in which the conflicts banner
      outlived the rebase banner, which is exactly the stale non-zero count this had to rule out.
      `computeBanners` resolves the status once and both banners share the freshness rule, and that
      is what the single transition shows. Git confirmed the restore: back on `other` at `other d`,
      the dirty tree returned from the autostash (` M a.txt`, `A dirty.txt`), no `rebase-merge/` or
      `REBASE_HEAD`, no unmerged paths, `stash list` empty.
      Wait on the rebase banner's text **disappearing** rather than sleeping a fixed time — the wait
      is itself the assertion, and it fails loudly if the banner never clears

## AG. One freshness rule for every status consumer (main §1, §2, §5)
_Shipped 2026-09-11 (`2c1b498`), **not yet walked**. `WorkdirStatus` already carried the `RepoState`
its scan ran in, but only `computeBanners` consulted it; four other consumers paired a status against
the refs with no such check. `src/lib/freshStatus.ts` is now the single rule — a scan from another
state predates the change and reads as "not known yet", never as "clean" — and the banners,
`walkSeedWanted()` / `useShowWorkingTree()`, `dropWorkingTreeIfClean()` and the rebase dialog's
autostash all route through it._

_**What "not known yet" resolves to differs per consumer, on one principle: whichever answer neither
destroys user state nor churns the walk.** The row is kept, the selection is not dropped, and the
rebase dialog counts an unknown tree as dirty (`--autostash` is a no-op on a clean tree, while
omitting it on a dirty one makes git refuse the whole rebase)._

_**Why this needs a walk at all.** The unit tests already cover the rule (`lib/freshStatus.test.ts`),
the no-drop / no-re-walk / row-stays case (`statusStore.test.ts`) and the stale autostash
(`dialogs.test.tsx`). What they cannot cover is the thing that made this worth holding back from the
review fixes: the two `statusStore` callers decide **when the walk restarts** and **when a selection
is dropped**, in a real app, against a real status arriving late. Fixture: `docs/smoke/fixtures/irebase-fixture.sh`
for the conflicting-rebase path — it opens with `rm -rf`, so point the app at another repository
first._

_**The trap that governs every box here: these are all transients.** A state change and its status
refresh are milliseconds apart, so reading after the fact shows the settled state and reads as a
pass whatever happened in between. Arm a `MutationObserver` **before** the action, exactly as group
AF's banner boxes do, and let the observer's log be the evidence._

- [ ] **A late status does not take you out of the working-tree row** (§2) — **recipe falsified
      2026-09-11; not walkable as written.** It wants a dirty tree, the working-tree pseudo-row
      selected, and then a conflicting rebase — but git refuses to start a non-interactive rebase
      over a dirty tree (*"error: Please commit or stash them."*, surfaced as an **Operation failed**
      toast; no `rebase-merge/` is created and the reflog does not move), so the precondition and the
      transition cannot both hold. Autostash does not rescue it: it cleans the tree on purpose, so
      the row then leaves for a real reason. Same class of error as AF box 1 — written from the code
      rather than from a repo. What it was reaching for is covered by the "blink out and back" box
      below and by the direct evidence under **What the AG walk showed**. (For whoever rewrites it:
      the selection class is `_selected_`, checked 2026-09-11; group Z's note above names
      `_rowActive_`, which this grid does not use.)
- [ ] **No spurious re-walk as the state changes** (§1, §2) — **walked 2026-09-11, partial: this
      observable cannot decide it.** A re-walk was seen (rows 10 → 11, "Loading commits… 9"), but
      HEAD had genuinely moved — the rebase detached it at `c172c6d` — so that re-walk is correct
      behaviour, not churn. A jump proves nothing when the commit set legitimately changed underneath
      it. Deciding it needs a state change that does *not* move HEAD, or an instrumented
      `syncWalkSeed`. The code-level argument is unaffected (`rowShown` returns `filter.workingTree`
      when not fresh, so `show !== filter.workingTree` cannot fire); it is just not what this box
      measures
- [x] **The pseudo-row does not blink out and back** (§2) — walked 2026-09-11 on `c:/tmp/t4/irebase`,
      observer armed before each action. On the rebase the row went `null → present` **once**; on the
      abort, `present → absent` **once**. No bouncing in either direction
- [x] **The counts keep the last known number** (§2, §4) — walked 2026-09-11. Across the rebase the
      toolbar read `Commit [disabled]` → `Commit 1`: never `Commit 0`, and the row never read
      **0 changes**. `Toolbar.tsx:46`'s gate was never seen enabled over a genuinely clean tree
- [x] **Rebase dialog: autostash still follows the tree** (§5) — dirty half walked 2026-09-11: the
      interactive dialog read *"Uncommitted changes will be stashed before the rebase and restored
      after it."*, previewed `git rebase -i --autostash --rebase-merges --end-of-options mid`, and its button read
      *Stash and continue*. **The stale-status half was not walked** — unknown ⇒ dirty needs the
      dialog opened inside the refresh window, which is not hand-reachable; `dialogs.test.tsx` covers
      it. Ticked for the half a walk can reach, and this note is the other half
- [x] **Banners unchanged** (§5) — re-walked 2026-09-11. At the conflict the rebase banner's first
      and only text was *"Rebase in progress — resolve conflicts and stage them, then continue"*; the
      amend wording never appeared, not for a single frame. On Abort both banners went **2 → 0 in one
      transition**, not one at a time

**What the AG walk showed** (2026-09-11, `c:/tmp/t4/irebase`, release build over CDP). The rule was
caught working in both directions, which is better evidence than any of the boxes above. Going in:
at rebase log entry 4 the status scan reported `1 conflicted` while the bar still read `Clean`, with
`wt: null` and `banners: []` — the stale window, treated as *not known yet* rather than as clean.
Coming out: at abort log entry 4 the refs were already on `other`/`Clean` while the status still said
`1 conflicted`; both banners stayed empty and the working-tree row **held** through entries 4–5,
removed once at entry 6. Neither direction flashed a wrong answer.

## AH. Recents: five inline, the rest in a submenu (main §1)
_Shipped 2026-09-13 (`a4856f0`). The Repository menu lists the first five recent repos inline (store
order: pinned first, then most recently opened) and puts the rest under **More recent ▸**, a real
submenu — the kit's first. Walked 2026-09-13 over CDP on a release build with 14 recents._

- [x] **Five plus the chevron** (§1): open the Repository menu → exactly five recent rows, then
      **More recent** with a right chevron, `aria-haspopup="menu"`; the row is absent altogether
      with five or fewer recents
- [x] **Keyboard** (§1): focus **More recent**, `→` opens the panel with its first row focused
      (`aria-expanded="true"`), `↓` moves inside it, `←` closes it and puts the focus back on **More
      recent**, `Enter` opens it again, `Escape` closes only the panel, a second `Escape` the menu
- [x] **Where it sits** (§1): the panel opens beside the parent menu, level with the row (parent's
      right edge = panel's left, same top as the row), as a DOM sibling of the parent menu — never
      inside it, or its rows would join the parent's ↑/↓ cycle
- [x] **Mouse** (§1): hover **More recent** → the panel opens after a beat; move onto another row →
      it closes; click a repo in the panel → it opens and both menus close

## AI. Sidebar folders: always expanded / always collapsed / past N refs (main §2)
_Shipped 2026-09-13 (`d112ab6`, issue #2). Settings → **Sidebar folders** seeds every branch and
tag folder's collapse state on repo open and whenever the setting changes; a manual toggle then wins
for the session. Top-level groups and the per-remote roots are not folders and never collapse.
Walked 2026-09-13 over CDP in `c:/tmp/t4/work` (two `topic/` folders holding one ref each)._

- [x] **Always collapsed** (§2): pick it → both `topic` folders read `aria-expanded="false"`; the
      remote roots (`origin`, `mirror`, `nowhere`) and the tag group stay open
- [x] **Collapsed when more than N** (§2): pick it, N = 1 → `topic` (1 ref) re-expands; N = 0 is
      refused (1..999) and the field is disabled under the other two modes
- [x] **Always expanded** (§2): pick it → everything open again; the app store keeps the choice
      (`sidebarFolders`, `sidebarFoldersMax` in `recents.json`) across a restart
- [ ] **A manual toggle survives a refresh** (§2, manual): under *Always collapsed* expand `topic`,
      then Fetch → it stays open; a folder that first appears mid-session (create `x/y`) arrives
      collapsed

## AJ. Toast Retry / Dismiss return the focus (main §3)
_Shipped 2026-09-13 (`2eb883b`). A failed action's toast remembers the control it started from;
Retry re-runs from it and Dismiss puts the focus back on it (or on the open dialog's first field
when that control is gone). Auto-dismiss never moves the focus. Walked 2026-09-13 over CDP in
`c:/tmp/t4/work` with `.git/index.lock` planted. The first walk found the origin detached: every
`DisabledHint`-wrapped button was remounted when an operation disabled it, so nothing was left to
focus — fixed in this commit by keeping the wrapper in the DOM (`display: contents` while idle).
Since 2026-09-15 a click anywhere on the toast dismisses it as well, so the same focus rule covers
the body click; its buttons and a text selection in the detail are excluded._

- [x] **Dismiss** (§3): plant `index.lock`, click **Unstage all** → *Unstage failed · Index is
      locked* with **Retry**; click × → the focus is on **Unstage all** again, not `<body>`
- [x] **Retry, still locked** (§3): click **Retry** → the toast reappears (one toast, not two), the
      same origin still held
- [x] **Retry, unlocked** (§3): remove the lock, click **Retry** → the files unstage, the toast goes,
      and the focus lands on **Unstage all** — now disabled (nothing left to unstage), so the browser
      drops it to `<body>`; that is the control's own state, not a lost origin
- [x] **In the commit dialog** (§3): repeat Dismiss with the full-window commit dialog open → the
      focus returns inside the dialog, never to the panel behind the scrim
- [x] **A click on the body** (§3): plant `index.lock`, click **Unstage all** → click the toast
      title, then (on a fresh one) its icon, then the padding at its edge → each closes it, and the
      focus is back on **Unstage all**, exactly as × leaves it. The cursor is a pointer over the
      toast and a text caret over the detail
- [x] **The detail stays selectable** (§3): drag across the detail text → the toast stays put and the
      selection is copyable; double-click a word in it → the word selects and the toast is still
      there; click the title, the icon or the padding → it closes
- [ ] **The buttons still own their clicks** (§3): **Retry** runs once and closes once, not twice;
      the same for **Pull** on a rejected push and **Remove from list** on a dead recent
      *(2026-09-16: Retry and Pull walked and pass; Remove from list not walked. Adding a dead recent
      needs the native folder picker, and recents are shared with the installed app.)*

## AK. Files tab: a commit's whole tree, its files' content, a row menu (main §2, §3)
_Shipped 2026-09-13 (three commits, `feat: Read a revision's whole file list…` onward). The file
list's header grows a **Changes | Files** tab strip; Files lists every file of the selected commit
(the *to* commit of a compare), folders collapsed by default, a filter row that flattens to
matches, and shows the selected file's content on the right in a sibling of the diff viewer. Both
tabs get a row menu. Walked 2026-09-13 over CDP in `c:/tmp/t4/work` (315 files at HEAD) on a release
build, pane and diff window. **Not walked: the working-tree side.** The working-tree row renders the
commit panel, not this list, so the index listing the backend serves has no surface yet — where the
tab lives on that row is an open decision (plan §1 status)._

- [x] **The strip and the tree** (§2): select HEAD → **Changes** is selected, **Files** beside it;
      click **Files** → `315 files`, tree mode with every folder collapsed (`deep/one/two`,
      `examples/exclude/schema`, `many`, `src`) and the root files under them with a size each
      (`big.txt 264 kB`), no status letter
- [x] **Content** (§2): click `hunks.txt` → the right side reads `hunks.txt · 30 lines` with one
      line-number column and no sign column; `blob.bin` → *Binary file*; `big.txt` → the first
      `max_lines` lines and the *File truncated at N lines* banner
- [x] **Folders and keyboard** (§2): click `deep/one/two` → `z.txt` appears and selecting it shows
      its content; the folder stays open after a filter round-trip. `↓` moves the selection, `Shift+F10`
      opens the row menu under it, `Escape` returns the focus to the list. `←`/`→` on the tab strip
      switch tabs and move the focus with the selection; each tab keeps its own selected file
- [x] **Filter** (§2): type `MANY/00` → the list flattens (`listbox`, 9 rows, no folders) and the
      tree toggle is disabled with a title saying why; `zzzz` → *No matching files*; clear → the tree
      is back
- [x] **Row menu, commit** (§3): right-click `a.txt` → **Copy path · Open · Save as…** (no Reveal:
      a commit's file has no working-tree path); `twins.txt`, the file HEAD changed, adds **Show in
      Changes** → the Changes tab opens with `twins.txt` selected and its diff up
- [x] **Open** (§3): **Open** on `a.txt` → a temp copy `%TEMP%\t4-git-ui-diff\<blob oid>\a.txt`
      opens in the `.txt` handler (Notepad here); the copy holds the blob
- [x] **Save as…** (§3): the native save dialog titled `Save a.txt` → name a path → the file lands
      there with the blob's bytes. The Win32 helper (`WM_SETTEXT` on the dialog's `Edit`, `BM_CLICK`
      on `&Save`) drives it; `SendKeys` and UI Automation both failed to reach the dialog
- [x] **Diff window** (§2): open it → the same strip, Files list, filter and content view inside the
      dialog; switching tabs and picking `b.txt` there is the same store, so closing the dialog leaves
      the pane on Files with `b.txt` selected

## AL. Blame (main §2, §3)
_Shipped 2026-09-13 (two commits, `feat: Blame a file's lines through git blame --porcelain` and
`feat: Show blame in the Files tab's content view`). A **Blame** toggle in the content view's header
adds a per-hunk gutter (short SHA, author, age, age tint) fed by `git blame --porcelain` parsed off
the runner's event stream. Clicking a hunk selects its commit in the grid and the Files tab follows;
the hunk menu has Select in graph, Blame parent (porcelain's `previous`) and Copy SHA. Walked
2026-09-13 over CDP in `c:/tmp/t4/work` (`hunks.txt`: hunks by `958f0c7` and `3e6b9e1`) on a
release build. One finding (last bullet), fixed in `f3587d6`. **Not walked:** uncommitted lines —
the working tree has no Files tab (plan §1's open decision), so the panel's Blame goes to HEAD._

- [x] **The gutter agrees with git** (§2): HEAD → Files → `hunks.txt` → **Blame** → six labels at
      lines 1, 2, 4, 16, 17, 29, exactly `git blame --porcelain HEAD -- hunks.txt`'s hunk starts;
      the rest of each hunk shows the tint bar only; hover reads `<summary> / <author> · <date>`;
      the age steps are 1 (oldest) and 5 (newest)
- [x] **Not an operation** (§2): while blame loads the toolbar's Fetch / Pull / Push stay enabled
      and nothing is `aria-busy` — it is registered for the kill handle only, no op lock
- [x] **Drill-down** (§2): click line 2's gutter (`3e6b9e1`) → the grid selects `zxc`, the Files tab
      keeps `hunks.txt`, blame stays on and reloads at that commit
- [x] **Hunk menu** (§3): right-click line 2 → **Select in graph · Blame parent · Copy SHA**; **Blame
      parent** → the grid moves to `hunks fixture` (`958f0c7`, the `previous` of that hunk) with one
      hunk; on a hunk whose commit is where the file begins the item is disabled with *This commit is
      where the file begins*
- [x] **Keyboard** (§2): Tab into the content → the cursor row (line 1) takes the focus; `↓` moves it;
      `Shift+F10` opens the hunk menu under it; `Escape` closes it
- [x] **Entry points** (§3): Changes tab → right-click `twins.txt` → **Blame** → Files tab, `twins.txt`,
      blame on, HEAD selected. Commit panel → right-click a modified tracked file (`a.txt`) →
      **Blame** → HEAD's `a.txt` with its two hunks; on a staged add (`decoy.txt`) the item is
      disabled with *The file has never been committed*
- [x] **A hunk's commit outside the view** (§2): search `zxc` (one row), blame `hunks.txt` there,
      click a `958f0c7` gutter → *Not in the current view — clear the filter*, selection unchanged.
      **First walk: no toast and the selection vanished** — a shrunken walk kept its stale row tail
      and the reveal found the old row. Fixed in `f3587d6` (rows truncated on a complete page)

## AM. File history: the grid filtered to one path (main §2, §3)
_Shipped 2026-09-13 (two commits, `feat: List one file's history through git log --follow` and
`feat: Filter the grid to one file's history`). **History** on a file row sets a path filter on the
revision grid, shown as a chip beside the search field ("History: <basename> ×", full path in the
title). The walker lists `git log --follow --format=%H --name-status -z` instead of a revwalk and
builds rows from those oids, each carrying the path the file had at that commit, which the details
pane preselects on both tabs. Walked 2026-09-13 over CDP in `c:/tmp/t4/work` and read-only in
`c:/tmp/t4/mbk-clone` (a real rename) on a release build. One finding (last bullet), fixed in
`5e99ca8`. **Not walked:** the working-tree row under a history filter — it is hidden like under
a text filter even when the file is modified (plan §3's edge case, not kept in this round)._

- [x] **Entry from the Files tab** (§3): HEAD → Files → right-click `hunks.txt` → **Copy path ·
      Open · Save as… · Blame · History** → **History** → two rows (`zxc`, `hunks fixture`), the
      first selected, chip `History: hunks.txt` with the path as its title, the Files tab still on
      `hunks.txt`
- [x] **Preselect on both tabs** (§3): click `hunks fixture` → Files keeps `hunks.txt`; switch to
      Changes → `hunks.txt` is the selected changed file, not the commit's first
- [x] **Composes with the search** (§2): type `fixture` → one row, chip stays; a search that matches
      nothing under the chip → *No matching commits* (the search's own empty state; *No history
      yet* is only for a path with no commits at all — it showed here on the first walk, corrected in
      `d56be8c`); clear the text → the two rows are back
- [x] **Hunk menu** (§3): Blame on, right-click a gutter → **Select in graph · Blame parent ·
      History of this file · Copy SHA**
- [x] **Chip × keeps the selection** (§3): with `zxc` selected, × → the full walk (24 rows), `zxc`
      still selected, no chip
- [x] **Rename follow** (§3, `mbk-clone`): Files → filter `html-css` → `reviews/old/html-css.md` →
      **History** → four rows across the rename; the oldest (`d153469`) preselects
      `reviews/html-css.md` on both tabs; back to HEAD → `reviews/old/html-css.md`; × → the full
      walk, HEAD still selected
- [x] **Entry from the commit panel** (§3) — walked before Direction B, when the commit panel sat inside the History layout; from the Changes view of today the same click is group BD row 17: append a line to `a.txt`, select the working-tree row →
      right-click the unstaged `a.txt` → **History** → two rows (`feature edit`, `first`), row 0
      selected, chip `History: a.txt`, the details pane preselects `a.txt`; **Commit** clears the
      chip *and* the search and returns to the working-tree row. **First walk: nothing was
      selected** — the working-tree selection kept a stale commit index under the flat walk.
      Fixed in `5e99ca8` (the selection is dropped when a filter flattens the walk)

## AN. Review pass 3 fixes (main §2, §3)
_Walked 2026-09-13 over CDP in `c:/tmp/t4/work` on a release build of `5b024f9`, after the pass-3
fixes (`docs/archive/plans/2026-09-12-consolidated-findings.md`, F1–F18). The store and backend rows are
covered by their tests; these are the ones only a window shows._

- [x] **Blame toggle on a truncated file** (F8): blame on → `big diff` → Files → `big.txt` (note
      *first 20 000 lines*, banner) → the toggle is still enabled and pressed; click → off, and only
      now disabled with *Blame needs the whole file*
- [x] **Shift+Tab leaves the content view** (F9): blame on `hunks.txt` → Tab from **Blame** → the
      cursor row (line 1); `↓` → line 2; Shift+Tab → the region, again → **Open diff window**, again →
      **Blame**. Same code in the diff viewer
- [x] **Submenu inside the window** (F10): Repository → hover **More recent** at a 977px window →
      level with the item; at a 380px window → slid up so its bottom sits 4px above the edge, scrolls
- [x] **List header at the panel minimum** (F11): drag the file list to its minimum → 200px, the
      header's four controls all inside the pane (at the old 180px the Tree toggle was 19px past it)
- [x] **Blamed rows are a listbox** (F13): with blame on the content body is `listbox` "Blame" and
      the mounted rows are `option`s, the cursor row `aria-selected`
- [x] **Re-walk after the fixes**: AL *Drill-down* and *A hunk's commit outside the view*, AM
      *Preselect on both tabs* and *Chip × keeps the selection* pass on `5b024f9`; F16 in a window
      (path + a search that matches nothing → *No matching commits*); the diff viewer's region
      Shift+Tabs out to **Ignore whitespace**; the diff dialog's file list stops at 200px, header inside

## AO. Worktrees (main §2)
_Fixture: `docs/smoke/fixtures/linked-fixture.sh` → open `C:\tmp\t4\linked`. It has four linked
worktrees under `C:\tmp\t4\linked-wt\`: `feature` (dirty), `newbr`, `locked` (on `topic`, reason
"keep for the walk") and `gone` (on `spare`, directory deleted). The sidebar shows the section
only when a repository has more than one worktree, so `work` never shows it.
Walked 2026-09-13 over CDP on a `--no-bundle` release build of `027cb59`; every row below passed,
four were reworded to what the app does (marked ※). The review fixes (`7bdda90`) changed the rows
marked † — re-walked 2026-09-13 on a release build of `7bdda90`; all pass. A second review pass
(`b4245c0`) added the rows marked ‡, walked 2026-09-13 on a release build of `81ee1f1`._

- [x] **The section**: sidebar › **Worktrees (5)** after Stashes; rows `linked` with `main` and
      `current` badges (selected), then `feature`, `gone` (`spare`, `prunable` — the branch comes from its admin HEAD, the directory is gone †), `locked` (`topic`, `locked` — hover
      the badge for the reason), `newbr`; each row's meta is its branch; hover a row → the full path
- [x] **Row click** on `feature` → the grid reveals `feature`'s tip; click on `linked` → nothing
- [x] **Open**: right-click `newbr` → **Open** → the window switches to `C:\tmp\t4\linked-wt\newbr`
      (title `T4 Git UI - newbr`), the section now marks `newbr` as `current`, `linked` keeps `main`;
      Repository › the recents list has `newbr`; **Open** on the current row and on `gone` is disabled
      with the reason in the tooltip. Open `linked` again from the row (or recents) before going on
- [x] **Create worktree here…** on branch row `feature` → disabled, *Already checked out in a
      worktree*; after Prune (below) drops `gone`: right-click `spare` → **Create worktree here…** →
      the Add dialog opens with Branch `spare` preselected, Folder name `linked-spare`, preview
      `git worktree add --end-of-options c:\tmp\t4\linked-spare spare`; Cancel
- [x] **Add worktree (new branch)** †: Repository › **Add worktree…** → Parent folder is
      `c:\tmp\t4`, Branch is empty — every branch is out somewhere (`spare` in the gone `gone`
      included) — with *Every branch is already checked out somewhere — create a new one*, so the
      dialog opens on **Create a new branch**; clear Parent folder → it turns invalid and **Add**
      greys; restore it; New branch `fix`, Start point `HEAD`, Folder name follows: `linked-fix`,
      help *Adds c:\tmp\t4\linked-fix*; preview
      `git worktree add -b fix --end-of-options c:\tmp\t4\linked-fix HEAD`; **Add** → toast
      *Worktree added*, row `linked-fix` on `fix` appears without a refresh
      **Create a new branch** → New branch `fix`, Start point `HEAD`, Folder name follows:
      `linked-fix`, help *Adds C:\tmp\t4\linked-fix*; preview
      `git worktree add -b fix --end-of-options C:\tmp\t4\linked-fix HEAD`; **Add** → toast
      *Worktree added*, row `linked-fix` on `fix` appears without a refresh
- [x] **Add without checkout**: same dialog, untick **Check out the files** → preview gains
      `--no-checkout` right after `add`; Cancel
- [x] **Remove refused, then forced**: right-click `feature` → **Remove…** → text names the path
      and says the branch stays; **Remove** → the dialog comes back with git's reason (`contains
      modified or untracked files`) and the button reads **Force remove**, preview
      `git worktree remove --force …`; **Force remove** → toast, the row is gone, branch `feature`
      still in the Branches section
- [x] **Remove disabled** † on `linked` (*The main working tree stays*), on the current row, and on
      `locked` (*Unlock it first*) — Unlock sits one item above
- [x] **Lock / Unlock**: right-click `newbr` → **Lock…** → Reason `on a USB stick` → preview
      `git worktree lock --reason 'on a USB stick' --end-of-options …` → **Lock** → row gains
      `locked`, tooltip shows the reason, its **Remove…** is now disabled †; right-click → **Unlock**
      → badge gone. `locked` → **Unlock** → gone; **Lock…** with an empty reason → preview without
      `--reason`
- [x] **Prune**: right-click the **Worktrees** header (or Shift+F10 on it) → **Prune** → output
      dock shows `Removing worktrees/gone: gitdir file points to non-existent location`, toast
      *Worktrees pruned*, the `gone` row disappears
- [x] **Branch checked out elsewhere**: Branches › right-click `topic` (out in `locked`) → **Delete…**
      → error toast *Deleting topic failed — Cannot delete branch 'refs/heads/topic' as it is the
      current HEAD of a linked repository*, the branch stays. (The Delete dialog stays open behind the
      toast on a non-`refused` failure — pre-existing, not this batch.)
- [x] **From a linked worktree** ※: **Open** on `newbr` → title `T4 Git UI - newbr`, the section
      still lists `linked` (`main`, no longer `current`) and every sibling, `newbr` is `current`;
      Submodules shows both as `not initialized` (a fresh worktree has the gitlinks, no checkouts);
      status bar `Clean`; **Open** on the `linked` row brings the window back
- [x] **Terminal add**: with `linked` open, add a worktree from a terminal
      (`git -C C:/tmp/t4/linked worktree add -b tmp C:/tmp/t4/linked-wt/tmp`) → the row appears
      within a second (the watcher sees `.git/worktrees`); remove it the same way → the row goes
- [x] **Detached and prunable** ‡: write `spare`'s oid into `.git\worktrees\gone\HEAD` (no `ref:`
      line) → the `gone` row reads `detached` + `prunable`; clicking it (or the branch form of the
      row) still selects the commit in the graph — the branch is resolved through the shared refdb
- [x] **Force that still fails** ‡: **Remove…** on `feature` → refused → before **Force remove**,
      lock it from a terminal (`git worktree lock …/feature`) → **Force remove** → the dialog closes,
      error toast *Removing the worktree failed — fatal: cannot remove a locked working tree, lock
      reason: …*, the row now shows `locked`. (A lock + unlock inside one second from a terminal
      leaves no event for the watcher — nothing to show either.)
- [x] **Broken `.gitmodules`** ‡: make it unparsable (`[submodule "sub"` without the `]`) → on
      the next refs event the Worktrees section is unchanged, the Submodules section is gone, no
      toast (one `WARN` in the log); status still runs. Restore the file → the section is back
      within a second (`81ee1f1`: a `.gitmodules` edit counts as a refs change)

## AP. Submodules (main §2, §4)
_Same fixture. `sub` is checked out one commit behind the recorded pointer with `dirty.txt`
untracked inside it; `sub2` is registered in `.gitmodules` but its checkout was removed
(`git submodule deinit`), its module directory kept — on git ≥ 2.38.1 a **file-path** submodule
that was never cloned cannot be cloned by Update at all (`transport 'file' not allowed`; the clone
runs in a child that reads no config), which is a git default, not an app limit. Real ones use
https / ssh. Walked 2026-09-13 with AO._

- [x] **The section**: sidebar › **Submodules (2)** after Worktrees; `sub` with its recorded
      pointer (`f5fb488`-style short oid) and `sub2` with the same plus a `not initialized` badge;
      hover a row → the source url
- [x] **In the change list**: `sub` sits in Unstaged as **modified**; select it → the diff is one
      hunk, `-Subproject commit <recorded>` / `+Subproject commit <checkout>-dirty`; the Files tab
      shows `sub` as a submodule row (mode `160000`, one-line content)
- [x] **Stage / unstage the pointer** ※: stage `sub` → it appears in Staged (diff: the same two
      lines without `-dirty`) **and stays in Unstaged**, because the checkout is still dirty — git's
      *modified content*; unstage → Staged empties. `dirty.txt` inside `sub` never appears in
      `linked`'s list — it is `sub`'s own change
- [x] **No Discard on it** †: right-click `sub` in Unstaged → **Discard…** is disabled, tooltip
      *A conflict is resolved by keeping a side and a submodule by updating it, not discarded* — the
      same treatment a conflicted row gets; the Delete key does nothing either (no prompt); the diff
      shows no Stage / Discard hunk or line buttons on the `Subproject commit` hunk
- [x] **Discard beside a file** ※: select `sub` together with an edited `a.txt` → right-click →
      **Discard 2 files…** with the tooltip *… not discarded (1 skipped)* — the label counts the
      selection, the tooltip what is skipped, the same as a conflicted row in the group; the native
      *Delete files* prompt → **Discard** → `a.txt` reverts, `sub` stays modified. **Stage 2 files**
      beside it carries *Content changed inside the submodule … (1 skipped)* when `sub` is
      dirty-only
- [x] **Dirty only** † (reached through Update below, which puts the pointer back while
      `dirty.txt` stays): `sub` still shows **modified** with a `content` tag, diff
      `-Subproject commit <same>` / `+Subproject commit <same>-dirty`; right-click → **Stage** is
      disabled, *Content changed inside the submodule — commit there, or Update it*; Enter and
      **Stage all** walk past it — git's *modified content*, which `git add` cannot stage either
- [x] **Update one** ※: right-click `sub` → **Update** → toast *Updated sub*, output dock
      `git submodule update --init --recursive --progress -- sub` / *checked out '6104eaf…'*; the
      pointer is back on the recorded commit — `sub` stays listed only because `dirty.txt` is
      untouched (its diff is now the dirty-only one above)
- [x] **Update all**: right-click the **Submodules** header → **Update all** → toast *Submodules
      updated*, `sub2` is checked out from its kept module directory and its `not initialized`
      badge goes
- [x] **Open**: right-click `sub` → **Open** → title `T4 Git UI - sub`, a detached-HEAD banner at
      `6104eaf` with *Checkout main*, `origin` under Remotes, no Worktrees / Submodules sections;
      Repository › `linked` brings the window back. (**Open** disabled on a `not initialized` row —
      *update it first* — is by the same `disabled`/`title` pair as the worktree rows; not clicked)
- [x] **Pointer staged, checkout dirty** ‡: stage the moved `sub` → Staged has `sub` (the pointer
      move, `+1 −1`, no `content` tag, its **−** live); Unstaged still has `sub` with `content` and
      its own **+** disabled with the dirty-only tooltip; neither row's diff header offers **Open in
      diff tool** (a gitlink is a directory)
- [x] **Mixed skip wording** ‡: with a conflicted `c.txt` (a merge in progress) beside it, **Stage
      all** reads *Conflicted files are staged one by one, once resolved (1 skipped)* while `sub`'s
      pointer is stageable, *Conflicted files and submodules with unmoved pointers are skipped (2
      skipped)* once the pointer is staged, and *Every file here is either conflicted or a
      submodule with an unmoved pointer* (disabled) when those two are all that is left
- [x] **Nested path** ‡: a `vendor/lib` submodule → row `vendor/lib`; **Open** → title
      `T4 Git UI - lib`, recents holds `c:\tmp\t4\linked\vendor\lib` (the repo's separator, not the
      `.gitmodules` slash); Repository › `linked` brings the window back
- [x] **Junction discard** ‡ (main §4): `mklink /J link C:\tmp\t4\linked-src` inside `linked` → one
      untracked row `link` (not its contents); Delete → prompt → **Delete** → the link is gone and
      `linked-src` untouched (`remove_dir` on the reparse point)
- [x] **Ordinary repositories unchanged**: `t4-git-ui` itself at launch → Local / Remotes / Tags /
      Stashes only, no Worktrees or Submodules section; its change list as before. E/F/G core
      re-walked on `work` 2026-09-13 (`81ee1f1`): tree toggle + folder collapse, folder / row
      **+** and **−**, the unstaged and staged row menus, **Discard hunk** and a two-line **Delete**
      through the native prompt (the CRLF file keeps every CR), staged side offers only
      **Unstage hunk** — all as before
- [x] **Big submodule** ‡: a 15k-file initialized submodule with a moved pointer and a dirty file
      (`c:\tmp\t4\perf`) → status ≈30 ms warm, the linked read ≈6 ms; nothing near the 250 ms
      `slow status` line
- [x] **Nested Update** ‡: right-click `vendor/lib` → **Update** → toast *Updated vendor/lib*, dock
      `git submodule update --init --recursive --progress -- vendor/lib`
- [x] **UNC and long paths** ‡ (AO Add): Parent folder `\\localhost\c$\tmp\t4` → preview and
      **Add** work, the row's tooltip is `//localhost/c$/tmp/t4/linked-clash`, **Open** on it lands
      there with the row `current` (the id normalizes the share too), **Remove…** from `linked`
      drops it; a 306-character parent → git's own *fatal: could not create leading directories*
      as a toast, the dialog closes, nothing added
- [x] **`--separate-git-dir` main** ‡: open the linked worktree of a repo whose `.git` is a
      `gitdir:` file → no Worktrees section (the main cannot be derived from the common dir, so it
      is skipped and the list is one row), no toast
- [x] **Stale recent** ‡: Repository › a removed worktree still in More recent → toast *Couldn't
      open repository — not a git repository: …*, the window stays where it was
- [x] **Linux gates** ‡: the whole batch under WSL Ubuntu — fmt, clippy `-D warnings`, cargo
      (154 in git-core, the unix-only stage tests included), tsc, vitest 753 — all green; the
      WebKitGTK build links. Not walked in the Linux app: the WSLg window sat behind the live
      desktop and the driver sends input to whatever is focused (see `smoke-cdp.md`)

## AQ. Bisect (main §2, §5)
_Fixture: `c:/tmp/t4/irebase` (`docs/smoke/fixtures/irebase-fixture.sh`) — `main` at `add e`, with
`base — add a — add b — merge side — fixup! add b — add d (branch mid) — add e` behind it. Walked
2026-09-14 over CDP on a release build of `653e90b`; all rows pass (the terminal mark landed as the
final `bad`, so the chip moved to HEAD and the banner followed)._

- [x] **Mark bad from a row starts it**: right-click `add e` → **Bisect: mark bad** → the banner
      reads *Bisecting — mark a good commit to begin* with only **Reset**; `add e`'s row carries a
      `bad` chip (Bug icon)
- [x] **Mark good moves HEAD**: right-click `add a` → **Bisect: mark good** → `add a` carries a
      `good` chip, HEAD moves to git's own midpoint and the banner reads *Bisecting — testing
      <oid7> · 1 good · 1 bad* with **Good** / **Bad** / **Skip** / **Reset**
- [x] **Banner buttons act on HEAD**: click **Good** (or **Bad**, or **Skip**) on the banner → the
      commit HEAD was sitting on gets the matching chip, HEAD moves again, the banner's counts and
      testing oid follow
- [x] **Detached banner is suppressed**: throughout the bisect, no *Detached HEAD at …* banner shows
      even though HEAD is detached at each step
- [x] **Reset returns to the branch**: click **Reset** on the banner → the banner is gone, HEAD is
      back on `main`, every `good` / `bad` / `skip` chip is gone
- [x] **Good-first ordering**: start again by right-clicking `add a` → **Bisect: mark good** first →
      the banner reads *Bisecting — mark a bad commit to begin* with only **Reset**
- [x] **A terminal mark is picked up**: with a bisect running, `git bisect good` (or `bad`) from a
      shell in `irebase` → the watcher (or F5) shows the new chip and the banner's counts without
      restarting the app

## AR. GPG signing (main §1, §3, §6)
_Walk with `gpg.format=ssh` on `c:/tmp/t4/irebase` (or any repo). The walker's own `~/.gitconfig`
must be restored afterwards — dump it first if it exists. A `HOME` override does not isolate it:
libgit2 resolves the Windows profile folder itself, so the app writes the real file (learned
2026-09-14). Walked 2026-09-14 over CDP on `653e90b` with the user's OK to back up and restore the
real file (restored byte-exact afterwards); all rows pass. The commits carried a `gpgsig` header, the
tag a `BEGIN SSH SIGNATURE` block. Row 8 was walked by moving the file aside: the Settings section
kept showing the values it had loaded, and the save created a file holding only the new key._

- [x] **Settings shows the current global values**: Settings (toolbar gear) → **Signing** → Format
      reads whatever `git config --global gpg.format` is (`OpenPGP (gpg)` when unset), Signing key
      and Program are empty unless already set, **Sign commits** / **Sign annotated tags** reflect
      `commit.gpgsign` / `tag.gpgsign`
- [x] **Set format, key, gpgsign**: Format → **SSH** → the Program field's label switches to
      `gpg.ssh.program`; Signing key → a path to an SSH public key → blur or Enter saves it;
      **Sign commits** ticked → all three land in `git config --global --get gpg.format` /
      `user.signingkey` / `commit.gpgsign`
- [x] **Commit signed, "as configured"**: in `irebase`, commit a change with the Commit panel's
      **Sign: as configured** Select left as is → the details pane's `signed` chip shows, tooltip
      *This commit carries a signature (not verified)*
- [x] **Don't sign this commit**: Select → **Don't sign this commit** → Commit → no `signed` chip;
      the output dock's commit line ends in `--no-gpg-sign`
- [x] **Sign this commit with gpgsign off**: Settings → untick **Sign commits** → back in the panel,
      Select → **Sign this commit** → Commit → the dock line carries `-S`
- [x] **Annotated tag while gpgsign is on**: with **Sign annotated tags** ticked, create an annotated
      tag → the dock line reads `git tag -a -F <message file> --end-of-options <name> <target>`
- [x] **Clearing a field unsets it**: Settings → clear Signing key → blur → `git config --global
      --get user.signingkey` fails (the key is gone), the field shows the `Not set` placeholder
- [x] **A missing `~/.gitconfig` is created**: with no `~/.gitconfig` on disk, set any signing value
      from Settings → the file exists afterwards with that value in it

## AS. Repository tabs, windows, drag and drop (main §1, §6)
_Any two or three repositories from recents (`mbk-portal`, `c:/tmp/t4/linked`, `c:/tmp/t4/irebase`).
The layout lives in `%APPDATA%\dev.topher.t4gitui\layout.json`. Walked 2026-09-14 over CDP on a
release build of `37ce413`; the two rows marked ⌂ need a real pointer and an uncovered second window
(a maximized browser over the app makes the hit test answer "not ours", which is correct) — walked
2026-09-14 on `653e90b` with a user32 `SetCursorPos` / `mouse_event` drag (`drag.ps1` in the session
scratchpad), the second window moved beside the first with `SetWindowPos`; both pass. The second
review pass (`e2a4247`) was re-checked in the app 2026-09-14: Ctrl+W and Ctrl+Shift+N refused while
a commit runs (a `pre-commit` hook that sleeps), a `tab-spawn-failed` event reopens its tabs one
after another and toasts the one that is not a repository, a whitespace preference flipped in one
window's Settings reaches the other window's diff, marking a commit bad while a cherry-pick is in
progress starts the bisect, and a stash preview survives a branch added from a shell (the walk
restarts, the preview stays)._

- [x] **A second open is a tab**: Repository › a recent → a tab strip appears above the toolbar with
      both names, the new one active, title `T4 Git UI - <new>`; with one tab the strip is hidden
- [x] **Switching restores the state**: select a commit, type a commit message, switch tabs and back →
      selection and draft are as left; Ctrl+Tab / Ctrl+Shift+Tab cycle, Ctrl+1..9 jump
- [x] **Stale dot**: touch a file in the background tab's repository from a shell → a dot
      (`Changed`) on its tab; activate it → the dot goes and the change list shows the file
- [x] **Move to new window**: tab menu › **Move to new window** (Ctrl+Shift+N) → a second window
      with that tab alone and its own title; the source loses the tab
- [x] **Already open elsewhere**: open the moved repository from the first window's recents → the
      other window comes forward, no tab is added, no toast
- [x] **Last tab closes a secondary window**: Ctrl+W on the second window's only tab → the window
      closes; on the main window it goes back to the start screen
- [x] **Reorder by drag**: with two tabs, press a tab and drag it sideways along the strip → the
      order follows the pointer, the dragged tab fades; release → the order stays, the active tab
      is unchanged
- [x] **Tear off**: drag a tab down out of the strip → the tab's slot empties and a ghost chip with
      its name follows the cursor; release anywhere that is not another T4 Git UI window → a new window
      opens at the cursor with that tab; a window's only tab cannot be torn off (nothing happens)
- [x] **Drop on another window** ⌂: drag a tab from one window onto the strip of another → a caret in
      the target strip marks the slot (the strip appears there even with one tab); release → the
      target adopts the tab at the caret, comes forward, and the source loses it — no re-open, the
      repository was never closed
- [x] **Escape cancels** ⌂: mid-drag press Escape → the ghost goes, the tab returns to where it was,
      the other window's caret goes
- [x] **The repository name is a drag handle** ⌂: with one tab (strip hidden) press the toolbar's
      repository button and drag → once the cursor leaves the button (24 px of slack) a ghost
      follows it, the menu does not open; release on another window → it adopts the tab and this
      window goes to the start screen (a secondary window closes); release anywhere else → nothing,
      the only tab is never torn off, and Enter on the still-focused button opens the menu; a plain
      click or a slip of a few pixels still opens the menu. Walked 2026-09-14 on `46707b2`, re-walked
      on `e2a4247` (slip, drop on nothing + Enter, adoption) with the real-pointer script
- [x] **Quit keeps every window**: two windows → Repository › **Quit** (Ctrl+Q) → both close;
      `layout.json` lists both with their tabs; relaunch → both come back, tabs and active tab as
      left. Closing windows one at a time keeps each in the file for four seconds — see group AZ
- [x] **Layout on every change**: after each open / close / move, `layout.json` matches what is open
      — a closed window stays listed for four seconds first (group AZ 3)

## AT. Stash preview and browser, sidebar headers, folder rows (main §2, §4)
_`c:/tmp/t4/irebase` or any repo with stashes — `git stash` a dirty tree first if it has none. Walked
2026-09-14 over CDP on `653e90b` (irebase for the stash rows, mbk-portal for the sidebar rows); the
native confirms were answered with a SendKeys Enter on the `#32770` dialog. All rows pass. Observed:
with the last stash gone the browser's file list and diff show the grid's selected commit rather than
going blank — harmless, noted._

- [x] **Click a stash row → preview**: Sidebar › **Stashes** → click a stash row → the commit panel
      is replaced by the stash's `StashDetails`: Apply · Pop · Drop… · **Open browser**, Kv rows
      **On** (the branch it was made on) / **Date**, and the file list is the stash's changes with
      an untracked file shown "included, listed as added"
- [x] **Diff and Untracked wording**: click a file in the list → its diff renders; hover or read the
      Untracked row's text — it reads the "included, listed as added" wording, not a plain modified
- [x] **Apply / Pop / Drop from the preview**: **Apply** → the stash's changes land in the working
      tree, the stash list is unchanged; **Pop** on another stash → changes land and the row is gone
      from the list; **Drop…** → confirm → the row is gone, no changes applied
- [x] **Open browser**: **Open browser** on the preview (or the sidebar's **Manage stashes** icon
      button in the Stashes header, or Toolbar › **Manage stashes…**, or `Ctrl+Shift+S`) → the
      `StashesDialog` lists every stash, an inline push form at the top, and Apply / Pop / Drop on
      each row
- [x] **Clear all**: in the browser, **Clear all** → the confirm text names the stash count → confirm
      → every stash is gone, `git stash list` is empty
- [x] **Sections default state**: on a fresh launch (or a repo opened for the first time), **Stashes**
      is collapsed while **Worktrees** and **Submodules** are open
- [x] **Sticky headers**: with enough branches to scroll the sidebar, scroll the **Local** /
      **Remotes** section → its header stays pinned at the top of the panel while the branch rows
      scroll under it
- [x] **Folder rows look like folders**: in the sidebar (a branch with `/` in its name) and in the
      commit panel's tree view / Files tab (a nested path) alike, the folder row shows the folder
      icon, bold text and the `--folder-fg` colour, distinct from a leaf row

## AU. Direction B: views, rail, adaptive toolbar, palette (spec docs/plans/2026-09-14-direction-b-spec.md)

Fixture: `c:/tmp/t4/irebase` with a dirty tree (touch two files, stage one), window 1280 × 800.

Walked 2026-09-14 over CDP on a local release build of `1cc7691` — see
`docs/archive/walks/2026-09-14-group-au-walk.md`. Its two findings (3: the row's double-click; 9: the
toolbar overflows with the badge) were fixed and 3 + 9 re-walked the same day.

1. - [x] The toolbar shows `History | Changes 2` where Commit was; History is pressed. Click Changes → `Changes on <branch> · 1 unstaged · 1 staged` over the commit panel; the search box and branch filter are gone from the toolbar; the sidebar is unchanged; `Stash…` sits beside the counts and the × at the bar's right returns to History.
2. - [x] Click a branch in the sidebar while in Changes → still Changes. Alt+1 → History with that branch's commit selected and scrolled into view.
3. - [x] The working-tree row reads `Working tree · 2 changes … Open changes →` (hint muted, lit when selected; no hover needed). Click the row → Changes (after the double-click interval). Alt+1, click the (still selected) row again → Changes. Alt+1, ArrowUp / Home onto the row → still History (details: `No commit selected`); Enter → Changes. Double-click it → the commit dialog over History; Esc → still History, focus back on the grid.
4. - [x] `git stash` in a terminal → Changes shows `Working tree clean` beside the message column; Stash… is disabled with `Nothing to stash`; Amend still works.
5. - [x] Resize to 1000 wide: Fetch / Pull / Push / Branch / Stash are icons with their counts, the repo name stays; the sidebar is a 36px rail with counts; the details pane is details-over-files | diff. Click the Local rail button → flyout with the tree; double-click a branch → checkout, the flyout stays; Esc → closed. *(The rail is `< 1000`: at exactly 1000 the sidebar is still full; walked at 990.)*
6. - [x] Resize to 720 wide: the switch is icons only; search is an icon → popover with the box and the filter (type → the grid filters; Esc closes); `⋯` holds Branch ▸, Stash…, Refresh, Switch to … theme, Settings, Command palette; the details pane is files | diff with `> <subject> <sha>` on top — click it → details expand over the list; Changes is files-over-message | diff. At 700 × 500 nothing wraps or clips. *(The 700 × 500 floor itself is a drag check — `MoveWindow` bypasses it.)*
7. - [x] Ctrl+Shift+` at 1280 → rail; again → full. The toolbar's leftmost button does the same and never moves — pressed while the sidebar shows, unpressed on the rail; it is the only collapse/expand control (none in the sidebar, none in the rail). Resize past 1000 either way → the override holds; a new window starts from the width again.
8. - [x] Ctrl+K from the grid, from the commit summary field, from the dock prompt → the palette. `st` → Stash rows first; ↓ ↵ → the dialog opens, the palette closes; Ctrl+K again → that command under Recent; Ctrl+K again → closed. `origin/` → Go to branch rows; ↵ while in Changes → still Changes, Alt+1 → the row is selected and visible. Start a fetch (Ctrl+F5) → Ctrl+K → Push… greyed with `Operation in progress`. Click outside → closed.
9. - [x] Update badge present (Settings › Updates against a newer release, or fake it): at 1280 the repo name does not wrap; the search box narrows instead. *(Walked with a same-size stand-in element: search 240 → 192, Settings stays inside the window.)*
10. - [x] Dark theme: switch, rail, flyout, palette, changes bar, search popover, collapsed details header all use the tokens — no light patches.

## AV. Changes bar close, sidebar echoes the selected commit, stash surfaces show the working tree (0.10.x fixes)

Fixture: `c:/tmp/t4/irebase` in its resting state (`a.txt` edited, `dirty.txt` staged) plus an
untracked `new.txt`; `origin` added for the `origin/main` row; window 1280 × 800.

Walked 2026-09-15 over CDP on a local release build — see
`docs/archive/walks/2026-09-15-group-av-walk.md`. Its one finding (5: popping the last stash left
nothing selected) was fixed and re-walked the same day.

1. - [x] Changes view: the bar reads `Changes on <branch> · 1 unstaged · 1 staged`, `Stash…` right beside the counts, and the × alone at the bar's right edge (tooltip `Close (Alt+1)`) — no History button. Click × → History with the grid visible. At 700 wide both are still in the bar, the × at the edge; a long branch name truncates with an ellipsis before the buttons move.
2. - [x] Click `main`'s commit in the grid → the sidebar tints the `main` row and the `origin/main` row (unfocused tint while the grid holds focus; the check on `main` is unchanged, and it is the only mark of the checkout). Click another commit → both cleared; click the working-tree row → cleared. Click the tinted `main` row itself → the tint turns to the focused colour.
3. - [x] Create `feature/x` on the selected commit (Ctrl+B), set Settings › Sidebar to always collapsed → with that commit selected the `feature` folder row is tinted; open the folder → the folder loses it and `feature/x` carries it. Tag the commit → the tag row is tinted too. Delete the branch and the tag afterwards.
4. - [x] Repository › Stash changes… → under the checkboxes a `Files to stash` list: `M a.txt`, `dirty.txt` with its staged glyph, `U new.txt`; the button reads `Stash 3 files`. Untick `Include untracked files` → `new.txt` gone, `Stash 2 files`; tick it back. Stash → the sidebar shows the new stash. Pop it (sidebar row menu) to restore the fixture. On a clean tree the dialog says `Nothing to stash` and the button is `Stash`, disabled.
5. - [x] Ctrl+Shift+S with the changes present → the browser opens on `Working tree · 3 changes` (first row, italic); above the list the push form with the mono preview and a full-width `Stash 3 files`; the middle panel is the Changes view's Unstaged / Staged lists with `a.txt` / `new.txt` and `dirty.txt`, the diff of the focused file at the right with its hunk actions. Stage `a.txt` from here → the status bar count follows. Click a stash → Apply / Pop / Drop… / Clear all… and that stash's files; ArrowUp on the list → back on the working tree. Stash from the form → the new stash is selected and the working-tree row reads `No changes`. Reopen on the clean tree → it opens on stash@{0}; click the Working tree row → `Stash` disabled with `No changes`, empty lists. Pop the stash and unstage `a.txt` afterwards. *(Walked with the push landing on the new entry and its Pop landing back on the working tree; the clean-tree open is a unit test.)*
6. - [x] Dark theme: the ×, the sidebar tints, the files-to-stash list border and muted line, the working-tree row all read the tokens.

## AW. The viewport keeps its place across a tab switch, a view switch and a pull (0.10.x fixes)

Fixture: a repository with **more than 500 commits** — the walk used `c:/tmp/t4/mbk-clone`
(10 956) — plus a second tab on any other repository, one of them dirty. Window 1280 x 800, so the
grid scroller is about 13 rows of 26px. New commits arrive from a terminal, not from the app:
`git -C <repo> commit --allow-empty -m probe`, undone with `git reset --hard HEAD~1`.

Read the scroll position and the top row together — the position alone cannot tell a viewport that
was restored from one that never moved.

Walked 2026-09-16 over CDP on a local release build — see
`docs/archive/walks/2026-09-16-viewport-anchor-walk.md`, which also records the first version's
defect (anchoring in one pass never fires, because a restarted walk's first page comes back short).

1. - [x] Scroll to row 100 → switch to the other tab → back: the same `scrollTop` and the same commit on top. The tab left behind keeps its own position too, however far apart the two are.
2. - [x] Sitting at row 100, commit from a terminal → the viewport moves down exactly one row (`scrollTop` + one row height) and the **same commit** stays on top. `git reset --hard HEAD~1` → it moves back up by one, same commit.
3. - [x] Sitting at the very top (`scrollTop` 0) when a commit arrives → the view stays at 0 and the new commit comes into view; the selected commit is still the one that was selected, one row lower.
4. - [x] Scroll past the **first page** — row 600 or beyond, which no loaded page covers after a restart — and commit from a terminal: the same one-row move, the same commit on top. (This is the path that goes to `find_log_row` on the backend rather than to the loaded rows.)
5. - [x] Scroll deep, switch to the other tab, commit in the **background** tab's repository, switch back: the tab comes back on the commit it was on, not on the row number it was on.
6. - [x] Scroll deep → **Changes** (the grid unmounts) → **History**: back on the same row. Alt+1 / the bar's × take the same path.
7. - [x] On a dirty repository sitting on the working-tree row, switch tabs and back: the row is in view again, not scrolled one row past it.
8. - [x] Refresh (F5) with nothing changed, from any scroll position: nothing moves.
9. - [ ] A reader who scrolls **during** the restart keeps their own scroll: not drivable here (the window between the walk restarting and completing is ~90 ms, and the watcher's own delay jitters more than that). Covered by `repoStore.test.ts` "does not scroll under a reader who moved while the restarted walk's first page loaded". What the walk did see: a scroll landing just *before* the restart re-anchors on the row the reader moved to, which is the same rule.

## AX. Settings in three tabs (main §6; group J's controls moved)

Fixture: any repository — the walk used `c:/tmp/t4/irebase`. `Diff & merge › Diff tool` needs a tool
configured for its Command field to exist, which bullet 5 types into. Most of this is read out of
the DOM rather than eyeballed: for a tab strip the questions are which panel is visible, which
controls are reachable and what the computed tokens are.

Walked 2026-09-17 over CDP on a local release build — see
`docs/archive/walks/2026-09-17-settings-tabs-walk.md`. Two of its findings were fixed *after* that
build, so bullets 6 and 7 are the ones its binary could not show.

Bullets 6 and 7 were walked on 2026-09-17 against a later build — see
`docs/archive/walks/2026-09-17-autoclose-walk.md`, which also re-read bullet 1's heading list
(`Theme · Sidebar · Changes · Updates`). Bullet 4's focusable counts were edited after the first walk
and are still **not** re-measured; group AY bullet 10 is what exercises the new `Changes` section.

1. - [x] The gear opens on **General** — Theme · Sidebar · Changes · Updates — with `aria-selected` on General alone, only it a tab stop, and the other two panels carrying `hidden`. The row sits under the title, **outside** the body that scrolls, pad `6px 16px` over a 1px `--border` hairline.
2. - [x] **Git** holds Git executable · Signing; **Diff & merge** holds Diff · Diff tool · Merge tool. Exactly one panel is visible at a time. Signing still fills in — its read happens once, when the dialog opens, not when its tab is first shown.
3. - [x] ←/→ move the selection **and** the focus, wrapping both ways: General → Git → Diff & merge → General, and ArrowLeft back again.
4. - [x] Tab from the last control of the open panel wraps to the title bar's Close and never lands on a control inside a hidden panel. (34 controls match the dialog's focusable selector; 11 are reachable on General, 14 on Git, 19 on Diff & merge — the counts were 33 / 10 before the Changes checkbox, whose input is `opacity: 0` rather than `hidden` and so is focusable.)
5. - [x] Type into `Diff & merge › Diff tool › Command` without pressing Apply, switch to General and back: the draft is still there. The inactive panels are hidden, not unmounted, so the field stays in the DOM inside `[hidden]` — which is what makes losing the draft impossible.
6. - [ ] Start a real update download: the whole tab row goes disabled along with Close, and the progress bar stays on screen with them. Needs a publishable newer release, so it is covered by `SettingsDialog.test.tsx` "a running download locks the tab row" and `updateStore.test.ts` "a progress subscription that never attaches unsticks the UI too".
7. - [x] Hover the **selected** tab: it keeps its `--bg-active` tint instead of dropping to the weaker `--bg-hover` one, and a disabled tab does not light up at all. Same check on the Changes | Files pair and on an open `SidebarRail` section — all three share the idiom. (Measured as computed `background-color` under a real `mouseMoved`: the
   selected tab holds `--bg-active` at .09 while hovered, an unselected one drops to `--bg-hover` at .05,
   and an unhovered one is transparent — at each of the three places. No tab goes disabled without a
   running download, so that half was read with `disabled` forced on: transparent, muted, opacity .45.)
8. - [x] Light and dark: the selected pill, the unselected labels and the hairline all read their tokens. Light gives the pill `--bg-active` at 9% under near-black text on the elevated dialog, about 8:1. Switch themes through Settings' own Appearance select — flipping `data-theme` by hand does not re-resolve the tokens the pill reads.
9. - [x] The dialog **grows with the tab** (546 → 608 → 812 px at a 929px-tall window) and Diff & merge scrolls on its own. Intended, not a defect: the tabs group related settings, they do not promise one height.
10. - [x] `Ctrl+,` opens Settings from the start screen and from the repo window — from a text field too (a commit message, the dock prompt), since the chord types nothing. Pressed again with Settings already open it does nothing rather than stacking a second one. On macOS the same key is ⌘+,.

## AY. The Changes view closes itself after a commit that empties the tree

Walked 2026-09-17 over CDP on a local release build — see
`docs/archive/walks/2026-09-17-autoclose-walk.md`. Bullets 8 and 9 were **corrected by the walk**; the
rest passed as written.

Fixture: any repository — the walk used `c:/tmp/t4/irebase`. The setting is
Settings › General › Changes ("Close the Changes view after a commit that leaves nothing to
commit"), on by default. The assertion in every bullet is which view the window is on
afterwards: the toolbar `ViewSwitch` says so, and so does whether `ChangesBar` is on screen.

1. - [x] Dirty two tracked files. Alt+2, stage both, commit → the view goes back to **History** by itself, with the commit at the top of the grid and no working-tree row.
2. - [x] Dirty two, stage **one**, commit → **stays** in Changes, the other file still listed. Partly done is not done.
3. - [x] One **untracked** file only: stage it, commit → closes. Untracked files count as something left to commit, so emptying them is emptying the tree.
4. - [x] From the Changes **empty state** on an already-clean tree, amend the last commit → **stays**. Nothing was emptied, and that empty state is the surface the amend was started from.
5. - [x] Commit from the **commit dialog** (the commit panel's *Open commit window*, or `Commit…` in the repository menu and the palette — there is no toolbar button) with Changes open behind it → the dialog closes and the view behind it is History. From **History**, the same commit moves nothing.
6. - [x] **Commit & Push** from the inline panel with the last change staged → the view closes, the Push dialog still opens over History, and closing Push leaves the focus somewhere sane rather than throwing a console error (the panel that owned the button is gone by then). Walked: focus lands on `<body>`, with nothing on the console — the same place the bar's × and Alt+1 already leave it.
7. - [x] Mid-merge with every conflict resolved and staged, commit the merge → closes. The merge is concluded by then, so the state is clean when the answer is read; the state banner sits above the view switch, so nothing is hidden either way.
8. - [x] A **paused interactive rebase** whose stop leaves the tree empty: commit from the panel its banner points at ("amend or add commits in the commit panel, then Continue") → **stays**. An unfinished operation still owes a commit, so the pane it is made from must not close under the user. A cherry-pick or revert stopped on a conflict is **not** the same: resolving and committing *finishes*
   it (git clears `CHERRY_PICK_HEAD`, and `Repository::state()` reads clean from that moment), so nothing
   is owed and the view closes like the merge in bullet 7 — walked, and correct. What keeps the pane open
   is an operation still unfinished after the commit, which is what a rebase `edit` stop is.
9. - [x] **Discard** the last change instead of committing it, and `git stash` the last change from a terminal → **stays** open both times. The trigger is a commit, not "the tree went clean". Discard's confirmation is a native `ask()` modal, invisible to the DOM and to CDP — see `smoke-cdp.md` for how to answer one, and note that a walk which leaves it unanswered looks exactly like a Discard that does nothing.
10. - [x] Uncheck the setting, commit the last change → stays in Changes on the empty state. Restart the app → still unchecked. Re-check it, and leave it checked.
11. - [x] On `c:/tmp/t4/mbk-clone` (3004 files, a slow status scan) commit the last change and note whether it closes. A status fetch overtaken by the watcher's own refresh is dropped by `fetchStatus`'s seq guard, and the answer then reads the pre-commit tree and keeps the view open — accepted, and this is the one place it could show. Walked: it **closed**, so the race did not show here.

## AZ. Review fixes after 0.10.1: staging, the index lock, window restore, the grid's row, clipped menu names

Fixtures: 1, 4 — any repository; 2 — one with ~1800 modified files; 3 — two or three windows with a tab each; 5 — a few
hundred commits; 6 — a branch name longer than the row menu's 280 px; 7 — a tracked `gen.log` under `*.log`, conflicted
by a merge, twice; 8 — an untracked file, listed. The layout lives in `%APPDATA%\dev.topher.t4gitui\layout.json`
(Linux `~/.local/share/dev.topher.t4gitui/`, macOS `~/Library/Application Support/dev.topher.t4gitui/`); the stage
timing is the `stage_paths` line in the log. A local build shares that folder with the installed app: close the
installed one and copy the folder's files aside first, copy them back after (`smoke-cdp.md` › A local build).

_Walked 2026-09-19 over CDP on a local release build (`tauri build --no-bundle`) with the installed app closed:
windows closed with a real `WM_CLOSE`, `layout.json` seeded per row, 3b / 3h / 3i relaunched to see what comes back.
Fixture `c:/tmp/t4/az` — 200-odd commits, a branch name past 280 px, the `.gitignore` of 1. All rows pass. One
finding, in 6, fixed and re-walked the same day: a two-half item wrapped its name inside its own half, six lines
tall; focused from the keyboard the label now flows as one sentence. Not walked: a grid mount whose stored row is
past the row count (5) — not reachable by hand. 3l and the Unstage half of 4 came out of a review of these
commits the same day; they and the whole of 3 were walked again on the build that has them. 3m, 7, 8 and the
bottom-edge / light-theme half of 6 were added and walked after that, 3m with a CDP drag of the repo-name handle, 7's
native confirm answered with an Enter on the `#32770` dialog; the bottom edge was a second finding — the wrapped
**Delete** row lost its last line below the window — fixed (the menu re-fits when its size changes) and re-walked.
Open: 9 (unit-tested only), 10 (needs a published update), 11 (other platforms). The record is
`docs/archive/walks/2026-09-19-group-az-walk.md`._

1. - [x] **A negated ignore rule stages**: `.gitignore` with `*.log` and `!keep.log`; create `keep.log` and `debug.log` → only `keep.log` is listed, and staging it works. The check is libgit2's, so this holds on git 2.24–2.26 too.
2. - [x] **Stage all is no slower**: stage ~1800 modified files → the `stage_paths` log line is no higher than on 0.10.7. One `git` spawn per stage now, none for the ignore check. Measured on a scratch repo, three runs each: 1800 modified files 0.57 s (0.10.7: 0.60 s); 1861 untracked files under 61 nested `.gitignore` 0.62 s (0.10.7: 0.48 s) — libgit2 reads the ignore files per path, the price of 1.
3. **A closed window keeps its place for four seconds.** The rule: `layout.json` is the open windows that
   have a tab, plus the windows closed in the last four seconds — a chain, where the four seconds is the
   gap allowed between two closes, not the time a close-all may take. The chain only runs out while some
   open window has a tab, and a window that closes with no tab left is no part of it. A, B, C are windows with a tab each; tick a row when both columns hold. The
   table is shared with t4-markdown-viewer (`docs/plans/session-review-fixes.md`, Task 3), rows 3e–3g
   being where the two designs were compared.

   | | Sequence | `layout.json` | Next launch |
   |---|---|---|---|
   | 3a [x] | Close B, leave the app alone | A + B at once; A only after 4 s, with no click in between | A |
   | 3b [x] | Close B, then A under 4 s later (a quit by hand) | A + B | A + B |
   | 3c [x] | Close C, B, A, each under 4 s after the one before — more than 4 s in all | A + B + C | all three |
   | 3d [x] | Close B, wait past 4 s, close A | A | A |
   | 3e [x] | Close B, change a tab in A under 4 s later | A (new tabs) + B until the 4 s are up, then A | — |
   | 3f [x] | Close B, close a tab in A, close A, all inside 4 s | A (without that tab) + B | A without that tab, + B |
   | 3g [x] | Close B, open a new window C under 4 s later | A + C + B until the 4 s are up, then A + C | — |
   | 3h [x] | Close B, kill the process inside the 4 s | A + B | A + B |
   | 3i [x] | Main on the start screen (no tab), B with a tab: close B, wait past 4 s, close main | B, however long the wait | B's tabs, in main |
   | 3j [x] | As 3i, but open a repository in main after the 4 s | main only | main |
   | 3k [x] | Quit (Ctrl+Q) with A and B open | A + B | A + B, as before |
   | 3l [x] | Close B, then under 4 s later close C's last tab, so C closes itself with no tab | A + B until B's own 4 s are up, then A — C's close does not restart the clock | — |
   | 3m [x] | Drag B's only tab (its repo-name handle) onto A's tab strip | A with that tab, the repository listed once — at once and after the 4 s; B is gone | — |

4. - [x] **A lock that cannot be made is not a Retry**: make `.git` read-only (or deny write), stage a file → the toast shows git's own message (`Permission denied`), not "index is locked" with a Retry. A held `index.lock` (`touch .git/index.lock`) still offers Retry. The same two for **Unstage**, which writes through libgit2: its own `failed to create locked file … Access is denied` (`Permission denied` off Windows), no Retry; the held lock a Retry.
5. - [x] **History comes back where it was**: scroll the grid to about row 50, Alt+2, Alt+1 → the same rows; do it again with a fetch that brings commits in between → the viewport stays on the same commits. Also with the commit arriving as History mounts (Alt+1 and a `git commit` from a terminal in the same moment).
6. - [x] **A clipped menu name is readable from the keyboard**: a branch name longer than the row menu's 280 px; open the row menu with Shift+F10 and arrow onto it → the row wraps and shows the whole name, the rows that fit do not change; with the mouse the row stays one line and the hover `title` still has the full name. Check a two-half item (`Merge X into Y`) reads right when wrapped: one sentence at the row's width. After arrow keys in the grid a right-click menu opens with its first item focus-visible — the grid never gave up the keyboard focus — so a clipped first item opens wrapped; it follows the accent highlight that row always had. At the window's bottom edge (a short window, the menu opened on the last visible row, **End** for the Delete row) the menu moves up as the row wraps, so the row being read is never cut. The light theme reads the same. The sidebar's branch menu has no names in its rows; a submenu's rows (Repository › More recent) are ordinary rows and wrap alike if one ever clips.
7. - [x] **A conflict under an ignore rule still stages**: a tracked `gen.log` under `*.log` (`git add -f`), changed on two branches, merged → conflicted. Resolve it by hand and **Stage** → staged, no "is ignored" refusal (the index's stages 1–3 count as tracked). On a second such file **Keep `<branch>`'s version** → staged with that side; it runs no ignore check at all.
8. - [x] **A file that became ignored is still refused**: with an untracked `new.txt` listed and selected, append `new.txt` to `.gitignore` from a terminal and press **Stage** before the list refreshes → "Stage failed — new.txt is ignored", nothing in the index.
9. - [ ] **A skipped path says so**: when `git update-index` skips a path of a batch, the toast reads `git skipped <path>; any other paths were staged` and the lists refresh. No hand recipe known — unit-tested (`check_staged`).
10. - [ ] **An update's restart keeps every window**: with two windows open, install an update from the in-app prompt → the relaunch restores both (the restart takes the Quit path, 3k). Needs a published update newer than the build — walk it with group AC.
11. **Other platforms** — nothing here is OS-specific code, but only Windows was walked. Repeat 3a, 3b, 3d, 3i (close windows, `cat` the file) and 6:
    - [ ] Linux (WebKitGTK)
    - [ ] macOS

## BA. Reset another branch to the right-clicked commit (commit menu)

Fixture: `docs/smoke/fixtures/ba-fixture.sh` builds `c:/tmp/t4/ba` — four commits, HEAD on `feature` with `main`,
`reset-me` and `x` at the tip, `topic` one commit back, `origin/x` two back (5), and `wt-branch` checked out in the
linked worktree `c:/tmp/t4/ba-wt` (4), tracking `origin/wt-branch` beside `origin/x` (9). Every move here is `git branch -f`, so the reflog
(`git reflog show <branch>`) is what says where the branch was.

Walked 2026-09-20 over CDP on a local `tauri build --no-bundle`, bullets 1–7 green, plus **Reset `x` to `origin/x`…**
through the same dialog as a regression check.

1. - [x] **A branch moves from the menu**: right-click the tip's row — `topic` is the only branch that can move there → **Reset `topic` to here…** → the dialog has no picker, says it isn't checked out and your files don't change → **Reset** → the chip moves in the grid, the working tree is untouched, and `git reflog show topic` records the move.
2. - [x] **Several candidates hand the pick to the dialog**: a row where more than one local branch can move → **Reset branch to here…** opens with **Pick a branch** showing and nothing chosen: **Reset** is greyed, the preview line is empty, and **Enter** opens the branch list rather than running anything. Pick one → the command preview and the warning appear, naming it; **Reset** runs it.
3. - [x] **`main` is movable**: nothing protects it here — the dialog is the confirmation. Moved back two commits and forward again.
4. - [x] **Never offered**: HEAD's own branch (that is **Reset `<current>` to here…**, the item above), a branch already sitting at the clicked commit, and a branch checked out in another worktree — `wt-branch` from the start, and `reset-me` once a terminal `git worktree add` takes it and the refresh lands.
5. - [x] **No duplicate of the reset-to-remote item**: right-click the row carrying `origin/x` while the local `x` sits elsewhere → **Reset `x` to `origin/x`…** names it, and the picker lists `main`, `reset-me`, `topic` without `x`: moving it there lands on the same commit.
6. - [x] **Greyed while an op runs**: `git config remote.origin.uploadpack "sleep 12; git-upload-pack"`, toolbar **Fetch**, right-click a row → both reset items are disabled with the `Operation in progress` title, like their neighbours. Unset the config afterwards. (An error toast can sit over the first rows and swallow the right-click — dismiss it first.)
7. - [x] **Refusal reads as git's own**: open the picker and leave it open, `git worktree add <dir> reset-me` from a terminal, then pick `reset-me` → **Reset** fails in the output dock and a toast with git's message (`fatal: cannot force update the branch 'reset-me' used by worktree at …`), exit 128, and the branch has not moved.
8. - [x] **The picker finds a branch as you type** (any `Select` does): `git branch tango HEAD` first — with it, `to` lands on `topic` only if the two keys made one buffer (an `o` on its own finds `tango`). Open **Reset branch to here…** on the oldest row, type `t` → the list opens with `tango` active, `o` → `topic`, and nothing is chosen yet (**Pick a branch** still showing, Reset still greyed); **Enter** picks it. With the list open: `m` jumps to `main`; after a pause `t`, `t`, `t` walks `tango` → `topic` → `tango`; Ctrl+X moves nothing; none of it changes the picked value. A pick ends the word: `to`, **Enter**, then `m` straight away reopens the list on `main` (not a search for `tom`). A space inside a word is text, not a pick: Settings › **Sidebar folders**, focus it, type `always c` → the active row goes `Always expanded` → `Always collapsed` and the setting keeps its old value until **Enter**. Walked on a rebuild the same day.
9. - [x] **The worktree rule covers reset-to-remote too**: right-click the row carrying `origin/x` and `origin/wt-branch` → **Reset `x` to `origin/x`…** is there and no **Reset `wt-branch` to `origin/wt-branch`…**: it is the same `git branch -f`, and `wt-branch` is checked out in `ba-wt`. Walked on a rebuild the same day, like 10.
10. - [x] **No branch moves under a rebase or a bisect**: `GIT_SEQUENCE_EDITOR="sed -i 1s/pick/edit/" git rebase -i HEAD~2` stops with HEAD detached — the branch being rebased is nobody's current branch, and git refuses to move exactly that one. Right-click any row → only **Reset HEAD to here…** is left: no **Reset branch to here…**, no **Reset `x` to `origin/x`…**. `git rebase --abort` brings them back. The same under `git bisect start` / `bad` / `good HEAD~3` until `git bisect reset`. Mid-merge (a conflicting `git merge`) they all stay: `git branch -f` does not mind a merge.

## BB. A running commit shows it (commit panel)

Any repo with a change to commit; group BA's `c:/tmp/t4/ba` was used. A commit is over before the eye catches it, so
slow it down with a hook: `printf '#!/bin/sh\nsleep 6\n' > .git/hooks/pre-commit` (`chmod +x` it on Linux / macOS).
Delete the hook afterwards.

Walked 2026-09-20 over CDP on a local `tauri build --no-bundle`, in the dark and the light theme.

1. - [x] **Commit**: stage a change, write a summary, press **Commit** → for the length of the hook the button reads **Committing…** with a spinner in the button's text colour, disabled but not dimmed; **Commit & Push** beside it is dimmed and keeps its name; a thin bar runs over both file lists (a screen reader hears `Committing`, not `Applying changes`). When the hook ends the bar goes — with the Changes view, if the commit took the last change and auto-close is on.
2. - [x] **Commit & Push**: the same with the other button → the spinner and **Committing…** are on **Commit & Push** — the one that was pressed — while **Commit** is dimmed and still reads **Commit**; when the hook ends the Push dialog opens.
3. - [x] **Legible in both themes**: the spinner's arc is the button's own text colour — white on the filled **Commit**, the text colour on the plain **Commit & Push** — so it shows on either button, dark or light (toolbar **Switch to light theme**).

## BC. The rename to T4 Git UI takes the old `t4-git-ui` install with it (Windows installer)

Needs a machine with 0.10.8 or older installed (Start menu entry `t4-git-ui`, in `%LOCALAPPDATA%\t4-git-ui`) and a
local `tauri build --bundles nsis` — the signing key's two variables exported, or the bundler aborts. Copy
`%APPDATA%\dev.topher.t4gitui` aside first. Close the app.

Walked 2026-09-20 on Windows 11, twice: over the installed 0.10.8, then over the published 0.10.8 setup put back for
the second run. A desktop shortcut appears even where there was none — a passive install always makes one.

1. - [x] **An update moves the install**: run the setup the way the updater does, `"T4 Git UI_<ver>_x64-setup.exe" /P /R /UPDATE` → the app comes back up titled `T4 Git UI`, recents and settings as they were. The Start menu and **Installed apps** each hold one **T4 Git UI** and no `t4-git-ui`; `%LOCALAPPDATA%\t4-git-ui` is gone and `%LOCALAPPDATA%\T4 Git UI\t4-git-ui.exe` is there; `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\t4-git-ui` and `reg query HKCU\Software\topher\t4-git-ui` both find nothing.
2. - [x] **The next update is a plain one**: close the app, run the same command again → it comes back up, still one entry in each place.

## BD. The 2026-09-20 review fixes (staging edges, push target, op ownership, one instance)

Fixture: a scratch repo with `pages/[id].txt` and `pages/i.txt` committed, a second remote-tracking
setup where local `dev` tracks `origin/develop`, and a `post-commit` hook `sleep 60 &`.
`docs/smoke/fixtures/bd-fixture.sh` builds it.

- [x] 1. Modify `pages/[id].txt` and `pages/i.txt`; Discard `[id].txt` → `i.txt` keeps its edit. Stage both, Unstage `[id].txt` → `i.txt` stays staged.
- [x] 2. A file committed without a final newline, then a line appended: staging only the appended line is refused with the "missing final newline" reason; staging the hunk works and the index ends in a newline.
- [x] 3. A Latin-1 file with one changed line: Stage hunk is refused naming UTF-8; staging the whole file works and `git diff --cached` shows the original bytes.
- [x] 4. With a diff open, rewrite the file from a terminal so its hunks shift, and press Stage hunk inside the same beat (before the panel reloads): refused with "changed since this diff was shown", index untouched. Again with a same-shape edit (one changed line's text replaced, nothing added or removed): refused too. Over CDP the beat is reachable by calling the store action right after the write; by hand it may not be — then tick it as unit-only and say so.
- [x] 5. Push `dev` (tracks `origin/develop`): preview reads `dev:develop`, `origin/develop` moves, no `origin/dev` appears, the toast names `origin/develop`.
- [x] 6. Two windows, a repo each: a failing push in window A leaves window B's dock closed and empty. Two clones at once, Cancel in one: the other finishes.
- [x] 7. Commit with the `sleep 60 &` hook installed: the Commit button stops spinning within a second and a second commit right after is not `Busy`.
- [x] 8. Start the exe twice: one process, a second window on the start screen, in front. Opening in it the repository the first window holds brings the first forward instead; closing its last tab closes it; closed while still empty, it is not restored on the next launch.
- [x] 9. Merge dialog: "Always create a merge commit" greys Squash out and unticks it; with another strategy Squash still merges.
- [ ] 10. With a long fetch running in one window, Install in another is refused with the running-operation reason. (Needs a published update — walk with group AC.)

Rows 11–16 use a second fixture, `docs/smoke/fixtures/bd2-fixture.sh` → `c:/tmp/t4/be`: the two page files
conflicting between `main` and `side`, submodules `subs/[ab]` and `subs/a` one commit behind, a second
remote `other`, `dev` tracking `origin/develop`, a `pre-push` hook `sleep 12`.

- [x] 11. `git merge side` on `main`: **Keep side's version** on `pages/[id].txt` → it holds side's text and is staged, `pages/i.txt` is still conflicted. Stage both with the markers in them, select `[id].txt`, **Restore conflict** → `UU pages/[id].txt`, `i.txt` still staged. **Keep main's version** → `[id].txt` is main's, `i.txt` untouched.
- [x] 12. **History** on the `pages/[id].txt` row: the grid lists the commits that touched it (`pages`, `id only`, `main pages`, `side pages`) and not `i only`.
- [x] 13. Sidebar › Submodules › `subs/[ab]` › **Update**: `subs/[ab]` moves to the recorded commit, `subs/a` stays where it was.
- [x] 14. Two staged hunks: **Unstage hunk** on one leaves the other staged. With the staged diff open, `git add` a new version from a terminal and press **Unstage hunk** in the same beat: refused with "changed since this diff was shown". Unstaged: **Discard hunk** and **Discard N lines** each work, and each is refused the same way when the file is rewritten between the button and the confirm's **Discard** (`write-then-click`: the write and the `BM_CLICK` from one process).
- [x] 15. On `dev`, Push with Remote = `other`: preview `git push … other … dev` (no `:develop`), `other` gains `dev`. With **Set upstream** and `origin`: preview `git push … -u origin … dev:develop`, `origin/develop` moves, no `origin/dev`, `dev` still tracks `origin/develop`.
- [x] 16. While the 12 s push runs: **Move to new window** and **Close tab** are disabled. Close the window itself mid-push: the push lands on the remote, the other window's dock and toasts stay empty, and the repository reopened afterwards fetches (the op lock was released).
- [x] 17. Changes › right-click an unstaged file › **History** → the History view, chip `History: <name>`, row 0 selected; the chip's × restores the full walk. **Blame** from the same menu → the History view, Files tab, the file blamed. **Commit…** (repository menu) with a summary typed › a row › **History** → the dialog closes onto the filtered grid; **Commit…** again → the summary is still there; **Blame** from that dialog closes it the same way. A commit's diff window (the expand button) › a file row › **Blame** → the window stays and shows the blame; **History** there closes it onto the filtered grid.
- [x] 18. Stage a file, type a summary, and from one driver process press **Commit**, wait for the button to stop reading `Committing…`, and write a new file at once: within a few seconds the Changes badge counts it, no Refresh. (On a build before the fix the file is on disk and the list does not have it.)

Row 6 also carries two things no test reaches: a window-targeted listener hears `emit_to(label)`, and it
still hears the plain `emit` of the no-holder fallback. The first is what the row shows; the second needs
a window closed mid-op — if that op's output then shows nowhere, note it and move on: nothing that worked
before breaks.

Walked 2026-09-21 over CDP on a build of `7cc503b` — `docs/archive/walks/2026-09-21-group-bd-walk.md`. Row 4
went through the real button, the write and the click a few milliseconds apart. Row 8's **in front** is the one
clause a scripted second start cannot show (Windows' foreground lock): walked by hand the same day, the
exe double-clicked while the app ran — the new window came up on top. Row 6's no-holder fallback was not walked.

Rows 11–16 walked the same day — `docs/archive/walks/2026-09-21-group-bd-second-walk.md`. Row 13 failed on
the build of `7cc503b` (`git submodule update` ignores `--literal-pathspecs`), was fixed, and passed on a rebuild.
The no-holder fallback turned out not to be reachable from the UI: a window closed mid-op (row 16) gets
`emit_to` a label nobody has, which is silent. A diff cut at the line cap offers no hunk or line action, so
the `linesShown` half of the print is unit-only.

Rows 17 and 18 walked the same day on a build of `53d7ac7`, each seen failing first on the build of `1adbeff` —
the third section of the second walk's record.

## BE. Dogfooding against the real GitHub remote (main §5)

Every other group pushes to local bare repos; this one goes to `toperux/t4-git-ui` over https, with the
credential coming from Git Credential Manager. Needs the network. `docs/smoke/fixtures/dogfood-fixture.sh`
clones the repo twice into `c:/tmp/t4/dogfood` (open this one) and `c:/tmp/t4/dogfood-other`, puts a
scratch branch `dogfood/test` with one commit on the first clone, and adds a remote `big` (git/git) to it.

On GitHub, touch only `dogfood/*` branches and `dogfood-*` tags. **Don't push `main`**: the ruleset bypass
lets it straight through. **Don't name a tag `v…`**: `release.yml` runs on `v*` and publishes a release.

- [ ] 1. **Fetch** (origin) → it finishes with a toast, and no credential prompt appears (the repo is public,
      so a fetch needs no credential).
- [ ] 2. **Push** `dogfood/test` with **Set upstream** → the credential comes from GCM: silently if one is
      stored, otherwise GCM's own sign-in window, once. No terminal prompt, no hang. The sidebar shows
      `origin/dogfood/test`, 0 ahead / 0 behind, and `git ls-remote origin dogfood/test` finds it.
      Optional, to see the sign-in: first `printf 'protocol=https\nhost=github.com\n\n' | git credential reject`
      (this forgets the stored GitHub credential, so you sign in again afterwards).
- [ ] 3. **Create tag** `dogfood-1` on HEAD with **Push after create** → `git ls-remote origin dogfood-1`
      finds it, and `gh run list -w release.yml -L 1` shows no new run.
- [ ] 4. **A rejected push**: run `sh docs/smoke/fixtures/dogfood-fixture.sh diverge`, then commit a change on
      `dogfood/test` in the app and **Push** without fetching first → the dock expands on its own with
      git's `[rejected] … (fetch first)` line, an error toast shows, and the buttons re-enable. Then
      **Pull**, **Push** again → it goes through.
- [ ] 5. **Cancel a fetch**: Fetch ▾ › `big`, expand the dock (`` Ctrl+` ``) → elapsed timer + **Cancel**.
      Cancel within a few seconds → a toast, the buttons re-enable, and the dock does not pop open on its
      own. **Fetch** (origin) right after → it works (no lock left behind).
- [ ] 6. **Clean up from the app**: right-click the `origin/dogfood/test` row › **Delete origin/dogfood/test on
      remote…** → Delete. **Delete tag dogfood-1…** with "also on remote" ticked → Delete. Then
      `git ls-remote origin 'dogfood*'` finds nothing. If anything is left:
      `sh docs/smoke/fixtures/dogfood-fixture.sh cleanup`.

## Reporting

As in the main doc: for anything that fails, note the group and bullet (`G2`), what you saw, and the
tail of the output dock or the terminal/log file; say which fixture repo it happened in.
