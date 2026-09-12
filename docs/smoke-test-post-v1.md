# Smoke test — features shipped after v1 acceptance

Companion to `docs/smoke-test.md` (the v1 walkthrough, accepted 2026-09-01). Every check below is a
feature that landed afterwards. The ticks are the record, as in the main doc: ticked = walked and
passed in its last walk (the 2026-09-05 CDP walks; G2 under WSLg), unticked = never walked here or
changed since and needs a retest. Each group
names the section of the main walkthrough it belongs to, so it can be run on its own or slotted in
(B, C and H check out / merge / rebase, which the fixture's dirty tree refuses: start them with
`git stash -u`, or walk E/F/G first and discard).

Same setup as the main doc: the `docs/smoke-fixtures.ps1` repos under `C:\tmp\t4` (§0 there), a
dev run or the installed release. Rebuild the fixture with `-Force` if yours predates 2026-09-03:
the script now also makes the `conflict` branch (H), `topic/nested` and `origin/topic/on-origin`
(A), the `nested folders` commit with `examples/exclude/schema/` and `src/` (E), and leaves the
working tree with `src/a.txt` + `src/lib/b.txt` edited, `deep/one/two/z.txt` untracked, `gone.txt`
deleted and a CRLF hunk in `crlf-hunks.txt` (E, F, G). Tick as you go; note anything surprising
with the group letter and bullet number. `docs/smoke-cdp.md` is how the walks were scripted.

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

- [x] **Settings** (toolbar gear, also on the start screen): a bogus git path + Apply → the error shows
      inline, the old path stays and the app keeps working; the real path → `git version …` shows and
      the statusbar version follows; **Theme → Follow system** → the window tracks the OS again after
      the toolbar toggle had pinned it; **Context lines** 1 → the open diff reloads with one line of
      context (the commit panel's diff reloads too) and **Stage hunk** still stages the right hunk;
      **Ignore whitespace by default** → the details-pane diff opens with the toggle on; quit and
      relaunch → every value survives

## K. Review fixes of 2026-09-06 (main §2, §4, §5, §6)
_Shipped 2026-09-06: `a5a0a6b` (`docs/reviews/2026-09-06-codebase-review.md`). K5, K9 and K10 need
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
_Shipped 2026-09-06 (this commit); walked the same day over CDP (Locate… is the native picker — the path was typed instead; KDiff3 is not installed here, so its merge entry pointed at BComp.exe). The Linux sentence in the first step was walked on a WebKitGTK build under WSLg the same day (`docs/plans/2026-09-05-full-rewalk.md` has the setup): a Custom tool whose command is `cat "$LOCAL" "$REMOTE" > /tmp/out && echo done >> /tmp/out` ran through sh, the temp dir carried the uid, no zombie was left, and a missing program toasted `t4-nope not found`._

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
_Shipped 2026-09-06 (this commit); walked the same day over CDP on the installed build, the title bar read through `Get-Process t4-git-ui | Select MainWindowTitle` after each step; the Git-missing step by launching with git off `PATH`._

- [x] **The name** (§1): launch with no repository open → the start screen header reads `T4 Git`
      with the version beside it, and the window's title bar reads `T4 Git`
- [x] **It follows the repository** (§1): open `work` → the title bar reads `T4 Git - work`;
      **Repository › Close repository** → back to `T4 Git`; switch to another recent → its name
- [x] **Git missing** (§6): launch with git off `PATH` (or point Settings › Git executable at a
      file that is not git) → the Git-missing screen's hint starts `T4 Git needs git 2.24 or newer`

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
      claiming anything (`T4 Git <v>`, no verdict) → **Check now** → `Checking…` → `T4 Git <v> is up
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
      change the **same two files** differently and merge them: **`docs/ad7-setup.sh`** does it
      (`tc-a`, `tc-b` → `hunks.txt` + `nonl.txt` both `UU`), and **`docs/ad7-teardown.sh`** puts
      `work` back to `A decoy.txt` on `reset-me`. Both guard before they act — the setup refuses
      unless `work` is at its resting state, the teardown is safe to run twice and from a
      half-finished setup. (They were written in a session scratchpad on 2026-09-11 and committed on
      2026-09-12, for the reason `docs/irebase-fixture.sh` exists: a fixture recipe that lives only
      in a scratchpad is gone by the next walk.) Walked 2026-09-11:
      selecting only the two conflicted rows flipped the header to **Stage selected**,
      `disabled: true`, titled "Every file here is conflicted — a conflict is staged on its own, once
      resolved" — its own message, **not** a "(2 skipped)" partial.
      **The quoted tooltip is the pre-`e57945d` wording and this tick is stale in that one respect.**
      `e57945d` (2026-09-12) split the message by mode, because "here" was false of exactly this
      case: the selection is refused while the list around it still holds stageable files. This
      scenario now reads "Every file **you selected** is conflicted — …", and "here" survives only
      for a whole list with nothing stageable in it — which has no cover at all, unit or smoke (see
      R5 in `docs/plans/2026-09-12-review-findings.md`). Everything else this box asserts — the
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
      review, R2 and R3 in `docs/plans/2026-09-12-review-findings.md`). It is paid entirely by the
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
**`docs/irebase-fixture.sh`**: it wipes and rebuilds the whole shape, including `mid` / `side` /
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
is dropped**, in a real app, against a real status arriving late. Fixture: `docs/irebase-fixture.sh`
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

## Reporting

As in the main doc: for anything that fails, note the group and bullet (`G2`), what you saw, and the
tail of the output dock or the terminal/log file; say which fixture repo it happened in.
