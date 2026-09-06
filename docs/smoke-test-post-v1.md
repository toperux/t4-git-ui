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
      `twin-remote`, preview reads `git checkout --track -b twin-remote origin/twin-remote` → Checkout →
      `twin-remote` is the current branch
- [x] Check out `reset-me` (sidebar double-click), right-click the `reset fixture 1` row → **Reset
      reset-me to here…** → dialog defaults to Mixed, preview reads `git reset --mixed <sha>` → Reset →
      the `reset-me` chip moves down one row while `origin/reset-me` stays on `reset fixture 2`, and
      `reset.txt` shows up as an **unstaged** change
- [x] Right-click `reset fixture 2` → **Reset reset-me to origin/reset-me…** → same dialog (it is the
      current branch), preview reads `git reset --mixed origin/reset-me`; pick **Hard** → the button
      turns danger and the text warns about uncommitted changes → Reset → `reset.txt` is clean again
      and the two chips are one row again
- [x] Reset `reset-me` to `reset fixture 1` once more, this time **Hard** (no leftover change), then
      double-click `main` in the sidebar and right-click `reset fixture 2` → **Reset reset-me to
      origin/reset-me…** → a plain confirm dialog, preview reads `git branch -f reset-me origin/reset-me`
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
      Commit & Push from the dialog → after closing Push, focus is back where the dialog was opened

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
      `&& git push --progress origin refs/tags/<name>`, two ops run back to back, the tag is on the bare remote
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
      origin/solo on remote…** → the dialog's preview reads `git push origin --delete solo` →
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
      `git remote add mirror C:/tmp/t4/bare.git && git fetch --progress --prune mirror` → Add → toast
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
      file that is not git) → the Git-missing screen's hint starts `T4 Git needs git 2.20 or newer`

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
      `Runs git cherry-pick 0aa57e5…` → **Cherry-pick** → toast `Cherry-picked 0aa57e5`, the commit
      sits on `main` under the working-tree row, no banner
- [x] **Commit right away off** (§5): pick `twins (three branches here)` with the box unticked →
      preview `git cherry-pick -n …` → toast `Cherry-picked e6cbe9a — staged, commit to finish`,
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
      9217e5e…` → **Revert** → toast `Reverted 9217e5e`, HEAD is `Revert "conflict branch side"`
- [x] **A merge commit asks for its mainline** (§2): right-click `merge feature` → **Revert
      1574561…** → the dialog adds **Mainline parent** (`1 — 9f87c5f`, with the help line) and the
      preview reads `git revert --no-edit -m 1 …`; **Cancel**
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
      unticked → preview `git revert --no-edit -n …` → the `Revert in progress` banner (**Abort**,
      **Commit**) and the conflicts banner both show (a `-n` revert keeps `REVERT_HEAD`, unlike a
      `-n` pick), the status bar says `Revert in progress`, the Summary reads `Revert "main side of
      the conflict"` → **Abort** → toast `Revert aborted`, `Clean`, the Summary empty; `git reset
      --mixed 00d78d3` drops the throwaway commit
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

## Reporting

As in the main doc: for anything that fails, note the group and bullet (`G2`), what you saw, and the
tail of the output dock or the terminal/log file; say which fixture repo it happened in.
