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
with the group letter and bullet number.

---

## A. Sidebar — merged badges, remote folders (main §2)
_Shipped 2026-09-02: `bf7b29b`, `21289fb`, review fix `ae61c75`._

- [x] A branch whose tip is already inside another branch is muted with a `merged` badge whose
      tooltip names the container: `feature` (merged into `main`), `twin-a` / `twin-b` (each other);
      `main`, `reset-me`, `topic`-style tips and `origin/reset-me` (only inside its own local
      `reset-me`) carry none. Check out `feature` → `origin/twin-remote`'s badge (merged into
      `twin-a`) stays, `feature`'s goes (the current branch never counts as merged into anything)
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

- [ ] Toggle to light, quit, relaunch on a dark-mode OS → the window is light from its first frame
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
      the same way and `git diff` is then empty — no CRs lost; the staged side, an untracked file
      and a conflicted file offer no Discard

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
- [ ] Merge `conflict` again and pick **Keep main's version** → `git status` is empty, yet the
      **Working tree · 0 changes** row stays, toolbar Commit is enabled and the banner's **Commit
      merge** opens the commit panel with the prefilled `Merge branch 'conflict'` message and Commit
      enabled with nothing staged → commit → a merge commit with two parents, the banner is gone and
      the row disappears. `git reset --hard HEAD~1` afterwards
- [x] Check out `conflict`, Rebase… onto `main` → the same file conflicts, and the labels are
      **Keep main's version** (git's *ours* = the branch rebased onto) and **Keep conflict's version**;
      pick the first → the file reads `main's line`, pick the second → `the conflict branch's line`
      — each keeps what its label says, not the other way round. Abort the rebase afterwards

## I. Create tag with push (main §5, after "Create an annotated and a lightweight tag")
_Shipped 2026-09-02: `21c2158`._

- [ ] Create tag with **Push to remote after creating** ticked → the preview ends in
      `&& git push origin refs/tags/<name>`, two ops run back to back, the tag is on the bare remote
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

## Reporting

As in the main doc: for anything that fails, note the group and bullet (`G2`), what you saw, and the
tail of the output dock or the terminal/log file; say which fixture repo it happened in.
