# Open items — done and closed (t4-git-ui)

_Split out of `open-items.md` on 2026-09-24 so that file holds only what is still to do. Everything
here is shipped, fixed, walked, answered, or closed as will-not-fix / accepted. Section letters match
`open-items.md`, so an older reference to "open-items §N" finds its row in one of the two files.
Text is moved as written; hashes and line numbers are those of the day._

## Context (from the original list)
- v1 is accepted on Windows (`docs/smoke/smoke-test.md` walked end to end on 2026-09-01), CI green on
  three OSes, everything the walkthrough and the review found is fixed.
- Since acceptance (2026-09-02): commit context-menu checkout/reset, graph column sized to the
  rows in view, remote branch folders, `merged` badges, branch names set apart in the commit menu,
  light/dark toggle, custom git command with completions, tree view for the commit lists, and the
  full-window commit dialog. All shipped; none of them opened a new gap. Later the same day: merge /
  rebase from the commit context menu, and folded folder chains + guide lines in the file trees (the
  two UX follow-ups this list used to carry). Then the six deferred features that each needed a
  backend command: hunk / line Discard, the Settings dialog, the file-row context menu with Open /
  Reveal, per-file Ours / Theirs, "Push after create" for tags, and mode changes in hunk / line
  patches (§A of the first version of this list — all shipped 2026-09-02).
- Shipped 2026-09-07: cherry-pick / revert of one commit from its row (dialogs, in-progress banner
  with Abort + Commit, the commit panel prefilled from `MERGE_MSG`) — dropped from §C below. Then
  the open path: the watcher's file-id cache dropped (§A P4, gone from the list — the seed walk cost
  2.7 s on a 61k-file tree), labels off a history-free ref snapshot on their own `Repository`, the
  spinner waiting for the grid instead of the sidebar, and INFO timing lines on the five phases.
  Also 2026-09-07: interactive rebase (`docs/archive/plans/2026-09-07-interactive-rebase.md`) — git
  generates the todo, a dialog edits it, messages go through `exec git commit --amend -F`;
  dropped from §C below.
- Shipped 2026-09-08 → 09-10, after this list was last accurate: **v0.1.4** carried the interactive
  rebase work and twelve review fixes. Then **in-app updates** (`954830a`, released as **0.5.0**) —
  `tauri-plugin-updater` behind two app commands, a `latest.json` manifest the `publish` job writes
  from the per-platform `.sig` files, an Update badge on the start screen and toolbar, and an Updates
  section in Settings; walked as group AC in `docs/smoke/smoke-test-post-v1.md`. Alongside it: a security
  policy (`SECURITY.md`), third-party actions pinned to commits, and `release.yml` defaulted to
  read-only with `publish` the only job granted write. Five releases are published (v0.1.0, v0.1.2,
  v0.1.3, v0.1.4, v0.5.0) and the procedure now lives in `.claude/skills/release/SKILL.md`, so §B's
  "never run" caveats and round 2's are both spent.
- Shipped 2026-09-13 as **v0.7.0** (`05917c9`, seven releases now): a **Files tab** listing the
  whole revision with a content view and row menu, **blame** as a mode of that view, **file
  history** as a path filter on the grid (`git log --follow`), the recents submenu (#3), the
  sidebar-folder collapse setting (#2), issue forms (#1) and the toast focus return; review
  pass 3 over the new code (18 fixes, 4 residuals). Record:
  `docs/archive/plans/2026-09-12-files-blame-history.md`; blame and file history leave §C.
- Shipped 2026-09-13, after v0.7.0 (`647d7f1..`, plan `docs/archive/plans/2026-09-13-linked-checkouts.md`):
  **worktrees and submodules** as two sidebar sections — list / Open-in-this-window / Add / Remove
  with a force re-offer / Prune / Lock / Unlock, "Create worktree here…" on a branch row; Open /
  Update for submodules, and status no longer excludes them, so a moved pointer is a change (Discard
  is disabled for it). Walked 2026-09-13 as groups AO / AP against
  `docs/smoke/fixtures/linked-fixture.sh`, all rows passed (one Discard-beside-a-file row left for a
  hand walk); four review passes over the batch closed thirty-seven findings (`7bdda90`, `b4245c0`,
  `ffb59d8`, `418e313` — the last a scoped pass over the third), re-walked, plus the `.gitmodules`
  watcher gap (`81ee1f1`); Linux gates green under WSL. Known limits: an app-side rewrite of
  `.gitmodules` (discarding it) leaves the Submodules list until the next refs event (`watch.rs`
  ponytail note); a conflicted gitlink's diff pane reports *a submodule pointer has no file to
  compare* rather than the two pointers (its ours / theirs items still resolve it); the other
  dialogs still close on `runOp`'s busy short-circuit (a `ran` flag on `runOp` is the fix if it
  ever bites). Both leave §C.
- Shipped 2026-09-14, after v0.8.0 (`4f01248..37ce413`, plan
  `docs/archive/plans/2026-09-13-tabs-bisect-gpg.md`): **repository tabs and windows** (one tab per
  open repository, snapshot / restore on switch, stale dot, Move to new window, pointer-capture drag
  to reorder / tear off / drop on another window — the cross-window hit test is `WindowFromPoint`,
  Windows only — `layout.json` restored window by window, Quit), **bisect** (row marks, banner loop,
  `refs/bisect/*` chips), **signing** (a Settings section over the global signing keys, a
  per-commit override, a `signed` chip, annotated tags through the CLI), **stash preview and
  browser**, sticky sidebar section headers (stashes collapsed by default) and folder rows drawn as
  folders. Smoke groups AQ–AT: AQ, AS and AT walked 2026-09-14 over CDP (AS's two real-pointer rows
  are still open; AR and AT complete — AR writes the walker's own `~/.gitconfig`, and a `HOME`
  override does not redirect libgit2 on Windows, so it ran with a backup and a byte-exact restore). The toolbar's repository name is the drag handle
  for a window's only tab (`46707b2`, the strip stays hidden with one tab); adoption is Windows only. All three leave §C.
- Sources this list replaces: `docs/archive/plans/2026-08-31-git-ui-v1-plan.md` › Known gaps (kept there as the v1
  record, not updated further), `docs/archive/reviews/2026-09-01-codebase-review.md` › Triage rows marked
  defer/later, README › Status / roadmap.

## A. Performance
- ~~**`refs read` waits behind the status scan**~~ (seen 2026-09-07, `acme-portal`: `slow status`
  and `refs read` both 17.7 s). Done 2026-09-07 (this commit). Two causes: the scan held the shared
  git2 mutex, and the scan itself was slow because the index's stat cache was stale and libgit2
  never wrote the refreshed one back (no `update_index`) — after a formatter / branch switch touched
  every file, each scan rehashed all of them: 17 s cold, 2.4 s warm, on every watcher event, until
  someone ran `git status` in a terminal. Now the scan writes the stat cache back like `git status`
  (under the shared lock — libgit2 writes without checking for concurrent index changes, so the
  app's staging must not interleave) and the refs snapshot reads on a private `Repository`: one
  slow scan, then 50 ms, and the sidebar never waits for it.

## B. Verification and release
- **Walk `docs/smoke/smoke-test-post-v1.md`** (this machine): every feature shipped on 2026-09-02 —
  ten groups, A–J — walked 2026-09-05/06, see docs/archive/walks/2026-09-05-full-rewalk.md. Group K (the
  2026-09-06 review fixes) and the reworded F1 / H2 walked 2026-09-06 over CDP, six findings fixed
  (`docs/archive/walks/2026-09-06-group-k-walk.md`); K12 walked under WSLg the same day.
  Group G's mode check needs WSL or a Unix box — done 2026-09-05 under WSLg, see the full-rewalk plan.
- **Smoke steps no CDP walk can reach** — the done half: most walked on 2026-09-06 (by hand:
  folder pickers, clone Cancel, theme flash / switch / first frame, the large-repo checks; over CDP:
  "Git not found", I's tag push; Resolve in editor ×2 over CDP with VSCodium). What is left is in
  `open-items.md` §B.
- ~~macOS signing~~ — **done 2026-09-11**: a self-signed certificate shared with t4-markdown-viewer,
  `APPLE_CERTIFICATE` / `APPLE_CERTIFICATE_PASSWORD` set on the repo, and a verify step that reddens
  the macOS leg rather than ship an unsigned bundle. Signing is what keeps the app's identity
  stable, which is what macOS keys folder-access grants to. Everything published up to v0.5.0 is
  unsigned; the first signed release resets Mac users' grants once. (Notarization stays open —
  `open-items.md` §B.)
- Release-run history, kept as the record rather than as open work: `release.yml` ran for v0.1.0 on
  2026-09-02, all four legs green, nine assets; every macOS build up to and including v0.5.0 was
  unsigned. v0.1.2 followed on 2026-09-06, ten assets. `v0.1.1` was tagged, never published and
  then deleted: its run staged the bundles into Vite's `dist/`, fixed in `c23992d`. When the
  `publish` job dies to the Actions spending limit the built bundles stay on the run: raise the
  limit and re-run the failed job, no rebuild.
- **Dogfooding, the credential half** — reported by the user 2026-09-24: the app has been in daily use on
  a work laptop against a work repository hosted on **Azure DevOps**, and fetch, pull, push and tag push
  through GCM all work there. A second host besides the local bare remotes the smoke tests use. Not
  hit in that use: a rejected push and a cancelled fetch — **walked 2026-09-24 as smoke group BE**
  against `toperux/t4-git-ui`, both pass (`docs/archive/walks/2026-09-24-group-be-walk.md`, which also
  records three observations: the rejection toast outlives a successful pull and push, it covers the
  grid's top row, and closing windows one by one drops the earlier ones from `layout.json`).
- **Installer on a clean Windows 11** — walked 2026-09-24 as smoke group BF, in Windows Sandbox (a Windows 11
  24H2 image with the Edge browser but **no WebView2 runtime**), driven over `wsb.exe` + CDP
  (`docs/archive/walks/2026-09-24-group-bf-walk.md`). The published 0.10.10 setup installs silently without
  admin, **fetches WebView2 itself**, and registers a Start menu entry and an uninstall entry. The first launch
  shows *Git not found*. With git installed and the app restarted it clones a public repo over https; the grid,
  a syntax-coloured diff and the Files tab all work, and Updates reports up to date. The uninstall removes the
  program and its entries and keeps the app data. The installer's pages and SmartScreen were walked by hand the
  same day (BF 3): Edge warns on the download, no SmartScreen prompt on run, per-user only, it installs WebView2,
  **Run** is ticked at the end, and the interactive uninstall offers to delete the app data. **Retry on *Git not found*** cannot see a git installed after launch: git runs from the
  PATH the process started with. Decided 2026-09-24 to fix the wording rather than the lookup, so the screen now
  says *"Install it from git-scm.com, then restart T4 Git UI"* (`GitMissingScreen.tsx`).
- ~~Dependabot's `glib` 0.18 alert~~ (unsound `VariantStrIter`, fixed in 0.20): reached us through
  Tauri's gtk 0.18 pin (`tauri → muda → gtk → atk → glib`), Linux builds only, an API this app
  never calls. **Dismissed 2026-09-10** on exactly that reasoning; no open Dependabot alert remains.
  Revisit only if Tauri's pin starts carrying something this app does call.
- **Four smoke boxes that were records, not work** — **closed 2026-09-26 as records, marked `[n/a]`** (close-out
  Phase 0; the smoke legend defines the marker). All in `smoke-test-post-v1.md`:
  - AG's *a late status does not take you out of the working-tree row* (`:1152`): its recipe is unachievable —
    git refuses a non-interactive rebase over the dirty tree the box needs;
  - AG's *no spurious re-walk as the state changes* (`:1163`): the re-walk it saw was correct (HEAD had moved),
    so what the box observes cannot decide it;
  - the viewport-anchor walk's 9 (`:1745`): not drivable (a ~90 ms window), covered by `repoStore.test.ts`;
  - AZ 9, *a skipped path says so* (`:1857`): no hand recipe, covered by `check_staged`.

  (Line numbers after the Phase 1 ticks of the same day, as the entry below uses.)
- **The updater 2.12.0 walk before the next tag** — **walked 2026-09-26, pass** (close-out Phase 1,
  `docs/archive/walks/2026-09-26-phase-1-walk.md`). Dependabot #17 moved `tauri-plugin-updater` 2.11.0 → 2.12.0.
  A local build of `f9034e8` (now `59e9383`, docs-only fixes folded in) versioned 0.10.11 updated itself to the published 0.10.12 through
  `throttle-proxy.mjs`: offered on launch, *couldn't reach GitHub* offline, refused while a fetch ran, *the
  download was interrupted* on a cut download with the offer re-enabled, and a full install that restarted into
  the installed 0.10.12 with both windows (exe and uninstall entry 0.10.12, Check now offers nothing). The next
  tag is no longer blocked by it. The user's install is 0.10.12 since.
- **The three smoke boxes this machine could reach** — **walked 2026-09-26, pass** (close-out Phase 1, same
  record): DPI (`smoke-test.md:283`, a real move to a 150 % monitor, canvases re-rendered at 1.5×), AI's manual
  folder toggle across a Fetch (`smoke-test-post-v1.md:1225`), and AJ's Remove from list on a dead recent
  (`:1256`, the dead recent seeded into `recents.json` rather than through the native picker).
- **macOS notarization** — **closed 2026-09-26, won't do for now** (close-out Phase 0). Needs a paid Apple
  Developer account. The app is signed with the shared self-signed certificate (stable identity, so folder
  grants survive updates), and the release body carries the quarantine step. Reopen when there is a Mac user.

## C. Roadmap
~~Submodules · worktrees~~ — shipped 2026-09-13, see the Context bullet.
~~Bisect · GPG config UI · multi-repo tabs~~ — shipped 2026-09-14, see the Context bullet.
Custom titlebar — revisited in M6, native kept (the row stays in `open-items.md` §C).

## D. Small UI observations from the 2026-09-05 walks — done 2026-09-05
Collected in `docs/archive/walks/2026-09-05-v1-smoke-rewalk.md` (Observations) and the re-walk chat. All
taken in one pass with the full re-walk's six findings (`docs/archive/walks/2026-09-05-full-rewalk.md`, "Applied"):
the menu focus restore now yields to a dialog's own field, the lists and the diff reclaim the
focus after Enter-staging, Shift+↑/↓ clamps at the hunk edge, the renamed-folder toast detail is
the path alone. Kept here as the record of what was seen.

- **Dialog focus lands on the Close icon**, not the first field, in the Create branch (from the
  commit-row menu) and Stash dialogs. Both fields carry `autoFocus`, so the likely cause is the menu
  closing after the dialog mounts and the Dialog's mount fallback (`Dialog.tsx`, first `FOCUSABLE`
  = Close) taking over. Check the order of `onClose()` vs `open()` in the menu `run()` helpers.
- **Enter-staging drops focus to `<body>`**: Enter on a file row stages and the list loses focus
  (Space keeps it). Re-focus the list after `act()` in `FilesColumn.tsx`'s key handler.
- **Push / pull success toasts** were not seen ~3 s after a push and a fast-forward pull; fetch,
  tag-push, stash, cancel and amend toasts all appeared. Confirm by hand once; if real, look at
  `OpsDialogs.tsx` `success:` for those two `runOp` calls.
- **Renamed-folder toast** reads "Not a git repository / not a git repository: <path>" — title and
  detail say the same thing; drop the repeated phrase from the detail.
- **Shift+↑ across a hunk boundary** restarts the selection in the other hunk instead of stopping
  at the edge. Probably right (a range cannot span hunks); decide, and either document it in the
  style guide or clamp the cursor.
- The full re-walk of both checklists on 2026-09-05 (`docs/archive/walks/2026-09-05-full-rewalk.md`) adds six small
  findings and a few more observations of this size; the push / pull toast item above is retracted
  there (the toasts do appear).

## E. Added 2026-09-10
- **Three open issues**, all filed 2026-09-10 by someone outside the project, none answered:
  **#3** nest recent repositories under an `Open recent >` submenu instead of listing them flat;
  **#2** collapse branch folders by default rather than expanded; **#1** add issue form templates so
  filed reports arrive tagged. The first two are product decisions, not bugs.
  **All three delivered in v0.7.0 (2026-09-13)**: #1 the issue forms, #2 the *Sidebar folders*
  setting, #3 the recents submenu. ~~The issues are still open on GitHub; closing them is the
  user's call.~~ **All three closed on GitHub 2026-09-13** (verified 2026-09-16); nothing left here.
- **Four code leftovers** from the two review passes before v0.1.4. Three are fixed in `b00459a`
  and its review follow-up (2026-09-11); the fourth is closed as won't-fix. None loses data:
  - ~~`src/screens/RepoWindow/dialogs/rebaseTodo.ts:80`~~ — a fixup below a *dropped* row was
    refused, though git accepts it. **Fixed in `b00459a`:** the head-walk now skips dropped rows,
    and `groupOf` returns a contiguous span, so the `drop` line survives in the rewritten todo.
  - ~~`src/store/repoStore.ts:263`~~ — `startLog({ kind: "all" }, {})` runs before the status is
    known, so opening a dirty repository walks the graph twice. **Closed 2026-09-11, will not fix
    — do not re-offer.** The fix needs `open_repo` to report dirtiness, and `status()`
    (`status.rs:100`) is the full scan: `update_index(true)`, untracked recursion, rename
    detection, 1.5 s at 47k tracked files, with no early-exit "is it dirty" in libgit2. So it
    trades a re-walk that happens in the background, after the grid is already up, for a scan the
    grid waits on — worst on exactly the large repositories it was meant to help. Clean
    repositories already walk once (the flag starts falsy and `walkSeedWanted()` agrees), so only
    dirty ones pay, and defaulting the flag to true just moves the second walk onto clean ones.
    Revisit only if the walker learns to add the working-tree column without restarting.
  - ~~`src/components/ui/Input/Input.tsx:142`~~ — `if (e.altKey) return;` cost every dropdown in the
    app its conventional alt-arrow open, so the rebase list could own that chord. **Fixed in
    `b00459a`:** the interactive-rebase list now claims Alt+↑/↓ in the capture phase and stops it
    there — but only when the move can actually happen, so a refused one falls back through to the
    row's own Select. The combobox has its conventional chords again: Alt+↓ opens the list and
    Alt+↑ commits the active option, the way a native select and the ARIA pattern both do.
  - ~~`src/screens/RepoWindow/banners.ts:72`~~ — a stale but non-null status still let the rebase
    banner flash the amend wording for a beat. **Fixed in `b00459a`, completed in the review
    follow-up:** `WorkdirStatus` carries the `RepoState` it was scanned in, and the banner takes the
    pause wording only when that agrees with the refs. The first attempt read the state *after* the
    scan, so a state change during those 1.5 s stamped pre-change entries with the post-change
    state and the two agreed — the stamp is now taken before the scan. `computeBanners` resolves
    the status once, so the conflicts banner below shares the rule instead of counting a stale one.
- **One freshness rule, not four** — **landed and walked 2026-09-11.** From the 2026-09-11 review of
  those fixes.
  `WorkdirStatus` now carries the `RepoState` it was scanned in, but only `computeBanners` consults
  it. Three other places pair a status against the refs with no such check, and each will want its
  own guard as it surfaces: `statusStore.ts:84` `walkSeedWanted()` (decides whether the graph walk
  restarts), `statusStore.ts:152` `dropWorkingTreeIfClean()` (drops the working-tree selection), and
  `WorkingTreeRow.tsx:45` ("merge to commit" against "N changes"). A fourth reads the status alone:
  `RebaseInteractiveDialog.tsx:44` decides autostash from it, so a stale read stashes a clean tree or
  skips a dirty one. The fix is one selector every consumer routes through — the status, or `null`
  when its state disagrees with the refs — rather than a guard bolted onto each call site. Held back
  deliberately rather than folded into the review fixes: the two `statusStore` callers decide when
  the walk restarts and when a selection is dropped, which the hand-walked smoke checks cover far
  better than the unit tests do, so this wants its own change and its own walk.
  **Landed 2026-09-11** as `src/lib/freshStatus.ts` — pure, so store-free `banners.ts` routes through
  it too. Consumers: the banners; `walkSeedWanted()` and `useShowWorkingTree()`, which share one
  `rowShown` helper so the walk seed and the rendered row cannot drift; `dropWorkingTreeIfClean()`;
  and the rebase dialog's autostash, where unknown counts as **dirty** (`--autostash` is a no-op on a
  clean tree, while omitting it on a dirty one makes git refuse the whole rebase). A sixth consumer
  turned up in the doing: `Toolbar.tsx:46` pairs `selectChangeCount` with the refs exactly as
  `RevisionGrid.tsx:45` does. Both resolve by keeping the **last known** count rather than flashing
  "0 changes", so neither needed a guard — but the toolbar's count also gates the Commit and Stash
  buttons, so that is where to look if a stale count is ever seen enabling them wrongly.
  **Walked 2026-09-11** as smoke group AG (`caa3a56`) — the walk this was held back for. Four of the
  six boxes pass: the pseudo-row moves exactly once in each direction, the counts never flash `0`,
  the rebase dialog's autostash still follows the tree, and the rebase banner never flashes the amend
  wording (on Abort both banners clear in a single transition). The other two are not defects. One
  box's recipe is unachievable — git refuses a non-interactive rebase over a dirty tree, so its
  precondition and its transition cannot coexist — and the "no spurious re-walk" box cannot be
  decided by what it watches, because the rebase moves HEAD and a re-walk is then correct behaviour.
  Better than either: the rule was caught working in **both** directions — a status reporting
  `1 conflicted` while the bar still read `Clean` was treated as *not known yet*, and on abort the
  row held through the reverse-stale window and left exactly once. The stale-status half of the
  autostash box stays test-only (`dialogs.test.tsx`): it needs the dialog opened inside the refresh
  window, which no hand walk can hit.
- ~~**`backup-findings` — a local branch to delete after the next push.**~~ Deleted after the
  2026-09-12 push; `pre-squash-2026-09-13` is the same kind of copy (taken before the 52→14
  squash, tree byte-identical to `main` at `71e7ec8`) and goes the same way. A safety copy taken before
  the 2026-09-11 squash. Nothing in the repo referred to it, so it was set to sit there
  indefinitely; that is the only reason it is written down here. **Verified 2026-09-11: it holds
  nothing `main` lacks.** Its five commits (`b9edca2` … `73b85c6`) are the pre-review forms of
  `main`'s five (`8c79df3` … `bdf7367`), and every line unique to it is the superseded version —
  `cx(s.wrap, className)` in `DisabledHint.tsx` (the merge that stylesheet emission order made
  unreliable), `.itemWrap` missing its `min-width: 0`, and `src/README.md` missing the component's
  entry. ~~Keep it until `main` is pushed, then `git branch -D backup-findings`.~~ Done.

## F. Added 2026-09-12 — the unpushed range finally got a review

- **13 findings, in `docs/archive/plans/2026-09-12-review-findings.md`.** The 12 unpushed commits had never
  had a review pass over what *shipped*: the reviews on record either produced them or predate them.
  Four read-only reviewers, split by dimension, every claim re-traced by hand before it was written
  down. **Seven to fix before push** (R1–R7), six recorded and deliberately not fixed (R8–R13).
  The one that matters most is **R1, a regression in `2c1b498`**: opening a dirty repository leaves
  the graph walk unseeded, so the working-tree row draws with no line down to HEAD until any later
  refresh. Gates were green the whole time and stayed green — 581/581, `tsc` clean, `cargo test`
  passing — which is exactly how all of this shipped, and the reason that file leads with it.
  **R2 needs a decision that cannot be made from a test:** the `min-width` floor added to stop the
  header button jogging is paid by the panel title at every width, worst in the resting state, and
  choosing between the jog and the stolen width needs a measurement at a 220px panel on a real build.
  (Superseded by §G, which folds R1–R13 in; R2 closed per the 2026-09-12 batches.)

## G. Added 2026-09-12 — full codebase review, consolidated

- **61 items, in `docs/archive/plans/2026-09-12-consolidated-findings.md`.** Six blind area reviewers over
  the whole tree (git-core, cli+log, Tauri commands, stores, RepoWindow, dialogs/ui) plus a second
  diff pass; every high/med re-traced by hand. It supersedes §F's fix list — R1–R13 are folded in.
  **8 P0** (security or data integrity): ref names starting `--` reach git as options and
  `rebase --exec=` runs a command; a status scan can write a stale index over a CLI stage/commit;
  the diff body shows file A while its buttons act on file B during a load; discard on a renamed
  file (two ways); `unstage_paths` has no rollback on a locked index; stash Drop has no confirm; R1.
  **19 P1, 34 P2.** All landed (see §H); the `to revisit` rows live in `open-items.md` §I.

## H. Added 2026-09-12 — after the push

- **A `#[cfg(unix)]` block is invisible to Windows clippy.** The 14-commit push of 2026-09-13 went
  red on Linux and macOS only: a `let mut` flag assigned inside a `#[cfg(unix)]` test block is
  `unused_assignments` under `-D warnings`, and the local gate never compiles that branch
  (`db99d93`, `let linked = cfg!(unix)`). **Became release-skill step 4 on 2026-09-26** (close-out
  Phase 0): tag only after `main`'s CI is green on all three OS.

- **Three CI test flakes** — found in the rerun history and **fixed 2026-09-25** for v0.10.12 (test-only, no app
  change). Each had passed on its rerun.
  - **macOS `watch::tests::rename_is_reported`** (PR #7, 2026-09-12: `[Refs, Workdir]`) and **macOS
    `watch::tests::workdir_edit_is_reported`** (CI run 34859003358, 2026-09-14: `[Refs]`). Same cause: on a
    loaded runner, FSEvents delivered the setup commit's ref write after `start`'s 500 ms quiet window, into
    the test's own window. The second test also took only the first event, so it saw nothing but that `Refs`.
    Both now drop `Refs` (`without_setup_refs`), since ref classification is `commit_reports_refs_and_index`'s
    to check. `workdir_edit_is_reported` now collects until a second of quiet, and checks every change is
    free of `rescan`. Not reproducible on Windows. **Closed 2026-09-26**, after three green macOS runs:
    CI runs 36188124064 and 36225640149, and the v0.10.12 release run 36188618283.
  - **Windows `cancel_kills_push_and_its_hook`** (release run 35117912609, v0.10.3, 2026-09-16): *cancel took
    1.10 s* against an 800 ms bound. The hook sleeps 30 s, so the point is killing the tree rather than
    waiting for it. The bound is now 3 s.

The 61 items of §G are landed (29 follow-ups from a second review pass too), squashed to nine
commits and pushed with the CI port from the markdown viewer (`a904701`).

- ~~**The main ruleset's bypass list — check it.**~~ Answered 2026-09-12: the owner is on the
  bypass list by design, so the PR and review rules apply to bots and everyone else, not to them.
  #6 was an admin merge. Why `gh pr merge` on #8 was still refused under the same account is not
  known — approving it by hand worked, and that is the route for bot PRs. A direct push to `main`
  prints "Bypassed rule violations" — expected.
- ~~**Two release-workflow changes are unexercised until a tag.**~~ Exercised by **v0.6.0
  (2026-09-12)**: the `Cargo.lock` / `package-lock.json` version check passed on the dry run
  (34696639994) and on the tag run (34698147016), the 13.0 macOS floor bundled, and the macOS
  certificate import and signature verify — never run on a runner before — passed on both. The
  release skill's dry-run-before-first-tag rule was followed; the user installed 0.6.0 the same day.
- ~~**npm majors, one PR at a time, Vitest 5 first.**~~ **Done 2026-09-24** except TypeScript 7. The first grouped npm PR (#7) bundled
  TypeScript 5.8→7.0, Vite 7→8, Vitest 4→5, `@vitejs/plugin-react` 4→6 and `@types/node` 24→26
  with seven patch bumps, and two `DiffViewer.test.tsx` intra-line emphasis tests failed on every
  OS: the token `[0];` came back as four tokens. The group is now minor+patch only (`04a7eda`),
  the seven safe bumps landed as #8, and the five majors will arrive as single PRs (weekly run, or
  Insights → Dependency graph → Dependabot → *Check for updates* on npm — no CLI). A test-only
  difference points at the test runner, so take Vitest 5 first; if it is green, the tokenizer's
  behaviour changed under one of the others and the test's expectation needs a decision, not a fix.
  - (§K, 2026-09-16) **Still all open**: `typescript ~5.8.3`, `vite ^7`, `vitest ^4`,
    `@vitejs/plugin-react ^4`, `@types/node ^24`. No open PR of any kind; the last Dependabot PR was #8
    on 2026-09-12.
  - (2026-09-24) **The single PRs arrived 2026-09-17**, all open: #10 Vitest 5, #11 Vite 8, #12
    plugin-react 6 (all three red), #13 `@types/node` 26 and #9 the npm group of 7 (both green). No
    TypeScript 7 PR — Dependabot's default limit is five open npm PRs, and five were open.
  - (2026-09-24) **Vitest 5, Vite 8 and plugin-react 6 landed on `main` as one commit** (`3a802e8`,
    after the test fix `1847fa8`). #11 and #12 cannot pass apart: plugin-react 4 accepts no Vite 8 and
    plugin-react 6 needs it. #10's two red tests were the answer to the question above, and it is
    neither: the `.rs` grammar is a dynamic import, and under Vitest 5 it had resolved by render, so
    `[0];` came back as four syntax spans, each highlighted. The app draws those as one highlight
    (background only), so the tests now load the grammar first and join touching highlights. Gates
    green, `tauri build --no-bundle` built and launched, syntax + intra-line highlight seen on a `.rs`
    diff. #13 (`@types/node` 26, `9796066`) and #14 (the group of 14 that replaced #9, `27f2d1f`) merged by the user the same day; gates green on the result. TypeScript 7 left — `open-items.md` §H.
- **TypeScript 5.8 → 7.0.2** (#15, opened 2026-09-24 once the other majors freed Dependabot's five npm
  PR slots) — landed on `main` the same day with its one fix. TS 7 no longer includes `@types/*` on its
  own (`types` defaults to empty), so the one file that runs Node APIs, `src/lib/dialogCapability.test.ts`
  (`node:fs`, `process`), lost them: three `tsc` errors on every OS, tests green. It now carries
  `/// <reference types="node" />` rather than `"types": ["node"]` in `tsconfig.json`, which would hand
  `process` to app code too. `npm run build` and 928/928 green. An editor running an older TypeScript
  language server shows false errors (no `Promise`, no `JSON`) until it picks up the workspace's TS 7.
- **v0.7.0 (2026-09-13)**: release run green on every leg, 16 assets, `latest.json` at
  `releases/latest` resolves to 0.7.0 for all four platform keys; notes edited after publish.

## I. Deferred with a reason — the rows since closed

- `src/store/repoStore.ts:263` opening a dirty repository walks the graph twice — **closed
  2026-09-11, will not fix, do not re-offer** (§E has the reasoning).
- Push sends a bare branch name (`git push origin main`), which is ambiguous when a tag is also
  named `main` — **closed 2026-09-20, will not fix, do not re-offer** (2026-09-20 review, F4 /
  decision D5). git refuses that push ("src refspec main matches more than one"), so nothing is
  ever pushed to the wrong place; the case is rare; and the fix — always `refs/heads/…` — makes
  every push preview longer, the line the user reads before confirming. Reopen only if the
  refusal is actually reported as confusing.
- **F7 / Linux residual risk** — ACCEPTED by the user 2026-09-21: `tauri-plugin-single-instance`
  2.4.5 `platform_impl/linux.rs:56` unwraps `zbus::blocking::connection::Builder::session()`. With
  no session bus at all the address still resolves (zbus falls back to `$XDG_RUNTIME_DIR/bus`,
  then `/run/user/<euid>/bus`), the connect fails, and the app starts as before — one process per
  launch, no guard. Only a `DBUS_SESSION_BUS_ADDRESS` that is set but unparseable (empty, no
  `transport:`) panics at startup. All three launched under WSLg 2026-09-21 on a build of
  `7cc503b`: with the session bus a second launch hands over (one process, two windows); with the
  variable unset and an empty `XDG_RUNTIME_DIR` both launches start, two processes; with
  `DBUS_SESSION_BUS_ADDRESS=garbage` or set empty the app panics at `linux.rs:57`. Reopen if a
  user reports a startup crash on Linux, or when the plugin stops unwrapping.
- **F7 / updater restart** — **walked 2026-09-24** (`docs/archive/walks/2026-09-24-update-walk.md`): the installed
  0.10.10 updated itself to the published 0.10.11 with two windows open. The process was gone and a new one up
  within 5 s, with both windows, on 0.10.11. The single-instance lock let go on the way out, as read from the
  sources on 2026-09-21. The same walk ticked BD 10 (Install refused while a fetch runs in another window), AZ 10,
  and AC's failed-check and failed-install boxes, through `docs/smoke/fixtures/throttle-proxy.mjs` as the network.
- **F10 / a typed commit message lost to an update restart** — **fixed 2026-09-25** for v0.10.12
  (`docs/archive/plans/2026-09-25-update-and-staging-fixes.md` Task 5, walked as BG 5). Decided 2026-09-25: *confirm*,
  not refuse. Each window reports the repositories it holds a typed message for (background tabs included,
  untouched prefills not), and Install asks *"Installing restarts T4 Git UI. The commit message typed in <repos>
  will be lost."*. Two more decisions of that day, on the update flow:
  - **Broadcast**: a successful check's answer reaches every window (`update://checked`, plus the kept answer for
    a window that opens later) instead of each window checking.
  - **Keep the offer after a failed re-check**: the release still exists, and the error line says why the check
    failed. No change.
- **F8 / test cost, Windows only** —
  `a_background_child_holding_the_pipe_does_not_hold_the_op` takes ~12 s of wall time: `run()`
  returns in ~0.6 s, but tokio's blocking-pool pipe read outlives the op until the `sleep 12`
  orphan exits and `#[tokio::test]` teardown waits for it. In the app that is one parked pool
  thread per orphan, not the op or the repo lock. Was `sleep 20`; 12 is as low as it goes while the
  assert bound is 10 s.
- **S5** no Blame on a working-tree target in `FileRowMenu`, while the commit panel offers it — **closed
  2026-09-25 as moot**. The "no working-tree Files surface" decision leaves no working-tree row for that menu
  to be opened on.
- **`Menu.tsx` ceiling** — **closed 2026-09-26, will not fix** (close-out Phase 0): a submenu panel is
  `.menu`-wide, so the parent's width stands in for its width. The `ponytail:` comment in `Menu.tsx` still
  names it. Reopen if a submenu's labels clip.

## J. Added 2026-09-14 — from the UI direction B review
- ~~**Stash dialog shows nothing of what it stashes.**~~ `Stash changes…` took a message and two
  checkboxes but never listed the working tree it was about to push; the user stashed blind. The
  dialog now lists the files the push will take and its button reads `Stash N files`, and the
  Stashes browser's list opens with a Working tree row carrying the same form and the Changes
  panels. Done 2026-09-15 (this commit).

## K. Added 2026-09-16 — a state check against the repo, not against this list

Written after re-reading every row above against the working tree, `git log`, the workflows,
`package.json` and GitHub. What had gone stale:

- **Repo state.** `main` is in sync with `origin/main` at `9dd59ae`, working tree otherwise clean,
  **v0.10.2 released** (2026-09-15, the newest of eleven releases). No local branches but `main`.
  `docs/plans/2026-09-16-session-handoff.md` describes a mid-session state that no longer exists
  (four unpushed commits, the rail fix unimplemented) — everything it parked has since landed and
  been released; it is superseded by this section and moved to `docs/archive/plans/`.
- **Shipped since this list was last swept** — 0.10.0 Direction B, then 0.10.1 (`d47c7bd`: the
  Changes bar ×, sidebar selection tint, stash surfaces) and 0.10.2 (`ae24dde..f4917d3`: one sidebar
  toggle and the rail flyout, toast dismiss-anywhere at 5 s, the row-menu groups for bisect and
  cherry-pick/revert, pane resize moving only the grid and the diff, the dock height heal). Walks:
  `docs/archive/walks/2026-09-15-group-av-walk.md`, `-pane-resize-walk.md`,
  `-toast-and-toolbar-fix-walk.md`, `2026-09-16-review-fix-walk.md`.
- ~~**The rail override latches**~~ — **fixed in `f4917d3`**, walked as R1 of the 2026-09-16 record.
  The width-driven effect in `RepoWindow.tsx` is gone and `setRailOverride` with it; `toggleRail` is
  the only way back to automatic. The deliberate trade: an override now holds across a breakpoint
  round trip until the user toggles it back. A second reviewer read that as a regression — it is not.
- ~~**The toast auto-dismiss timer is never cleared**~~ — **fixed**: `toastStore.ts` keeps the handles
  in a `timers` map and an early dismiss cancels its own expiry. Unit-tested only; nothing to see in
  the app.
- **Issues #1–#3 are closed** on GitHub (2026-09-13). §E's "still open, closing them is the user's
  call" is spent.
- **Still open, re-confirmed in the code** (2026-09-16): §J's palette prefixes (`#` / `/` — no prefix
  handling in `CommandPalette/`), §J's per-view sidebar state (one global `railOverride`), §I's S1 blame
  cancellation (no token anywhere in the stores), and every §A performance row (untouched, and each
  still wants a measurement first). Those rows stay in `open-items.md`.
- ~~**The grid's scroll position is neither tab state nor anchored to the rows**~~ — reported by the
  user on 2026-09-16 as *"pulled, switched tabs, came back somewhere else"*, fixed the same day:
  `topRow` in `repoStore`, a `start`-aligned reveal in the tab snapshot, and `reanchor` after a walk
  restart. Walked over CDP against a 10 956-commit repository —
  `docs/archive/walks/2026-09-16-viewport-anchor-walk.md`, which also records what the first version
  got wrong (one-pass anchoring never fires, because the restarted walk's first page comes back
  short) and three CDP techniques worth keeping.
- ~~**`FetchDialog` still preselected one remote**~~ — it now defaults to *All remotes* when a
  repository has more than one, and to that one remote otherwise (`OpsDialogs.tsx`, plus a
  `dialogs.test.tsx` case). Landed 2026-09-16.

## L. Added 2026-09-17 — from the Ctrl+, / auto-close review and walk

- **`commitStore` is the only store that writes `viewStore`** — an architectural note, not a defect; moved here
  2026-09-25 because nothing is open about it. The auto-close lives in `commit()` because that is the single
  place every commit route lands; the alternative was threading `onCommitted` through three components. If a
  second store ever wants the view, the writes belong behind a named action on `viewStore` instead.
- **`smoke-dialog.ps1` did not match today's confirm boxes** — **fixed 2026-09-25.** Tauri's `ask()` is a task
  dialog, whose buttons are `CCPushButton` child windows, not `Button`. To UI Automation they are Panes with no
  patterns. So the script's class-`Button` search found nothing, and `SendKeys {ENTER}` could press only the
  default.

  The readings that led there:
  - 2026-09-17: the Discard confirm, answered by `SendKeys {ENTER}`;
  - 2026-09-19: the Resolve conflict box, the same;
  - 2026-09-25: group BG's *Install the update* box, where an `InvokePattern` press happened to work;
  - 2026-09-25: a Discard hunk confirm, where `InvokePattern` failed with "Unsupported Pattern".

  The script now finds the box and the button by name through UI Automation (the app's own boxes only), sends
  `BM_CLICK` to the button's own handle, and waits for the box. Checked on the Discard hunk confirm: **Cancel**
  kept the edit, **Discard** reverted it. `smoke-cdp.md` › Native dialogs says the same.

## M. Added 2026-09-19 — review of `v0.10.1..HEAD`, its fixes, and the walk of group AZ

- **A libgit2 error toast ended in git2's own `; class=Os (2); code=NotFound (-3)`** — **fixed 2026-09-25**
  for v0.10.12. `GitError::Git2` displays `git2::Error::message()` alone, not its `Display`, which appends
  the class and code. The IPC `kind` already says `git`. Test: `error::tests::a_libgit2_error_shows_its_message_alone`.
- **Pull from a remote that isn't the upstream's failed** (BG re-walk, 2026-09-25) — **fixed the same day** for
  v0.10.12. The Pull dialog now names the local branch there, as Push does, in place of a bare `git pull <remote>`,
  which git refuses. Test: `dialogs.test.tsx` › *pulls the local name when the current branch does not track the
  chosen remote*. The 2026-09-26 review added an unborn branch (`refs.head.branch`) and a first-render remote that
  follows the upstream, not `remotes[0]`, so an Enter before `get_default_remote` answers pulls the right remote.
  Walked 2026-09-26 (the BG walk record).
- **A failed op's toast detail could be a progress line** (same walk) — **fixed the same day**. With no
  `fatal:` / `error:` line, `classify_failure` now skips a fetch's own chatter (`remote:`, `From`, the indented
  ref updates, `…% (…)` progress) before taking the first line. Test: `cli::ops::tests::rejected_and_other`, the `pull` case.
- **The "unticked lines, recounted" bullet** (fourteen, 2026-09-19) — superseded 2026-09-25 by §B's recount in
  `open-items.md` (eleven). AZ 10 and AC's two network boxes were walked on 2026-09-24.

Eight findings, all fixed (staging back on libgit2's ignore check, the `index.lock` match on both the CLI
and the libgit2 side, window restore, the grid's mount row, clipped menu names); a second review of the
fixes and the walk added three more. The walk is `docs/archive/walks/2026-09-19-group-az-walk.md`.

- **Window restore, accepted limits.** A Quit or a crash inside four seconds of a deliberate close brings
  that window back — indistinguishable from closing the windows one by one. More than four seconds between
  two closes of a quit by hand reads as a deliberate close of the earlier ones. `layout.json` is written
  with a plain `fs::write`, not tmp + rename: the grace timer's write could be cut by a process exit in
  the same few microseconds, and an unreadable file restores nothing. A `set_layout` that lands after its
  window's `Destroyed` re-inserts the label for the session (older than this work). Decided against:
  de-duplicating a repository held by both a closed entry and a live window, and t4-markdown-viewer's
  counter design (a report from another window inside the grace drops the closed one).
- **Staging, accepted cost.** libgit2 reads the ignore files per path: 1861 untracked files under 61 nested
  `.gitignore` stage in 0.62 s against 0.48 s on 0.10.7; 1800 modified files in 0.57 s against 0.60 s.
- **`smoke-cdp.md` said a local build cannot rewrite the installed app's `recents.json`.** It can, and
  `layout.json` with it: only the WebView2 profile is isolated. Corrected there, with the backup recipe.

## N. Added 2026-09-20 — full codebase review at v0.10.9, fixed 2026-09-21

- **10 findings, in `docs/archive/plans/2026-09-20-codebase-review-findings.md`**; fix plan beside it
  (`2026-09-20-review-fixes-plan.md`), its five decisions made 2026-09-20 (refuse the no-newline
  selection; refuse non-UTF-8 hunk staging as a toast; a content print per hunk; single instance
  with the second launch opening another window; Push keeps the bare name when the upstream's
  matches). **Landed 2026-09-21** as ten commits `5c014d6..2e62a88` (pushed 2026-09-21): F1 literal
  pathspecs — discard, unstage, conflict checkout, file history, submodule update (`5c014d6`); F2
  a line selection beside a missing final newline is refused instead of glued (`0619b89`); F3 hunk
  staging in a non-UTF-8 file is refused instead of staging U+FFFD (`4d090a8`); F9 a per-hunk
  content print catches a diff rebuilt since it was shown (`9722116`); F4 Push writes to the
  upstream's name when it differs, bare name otherwise, toast names what was written (`6a806bd`);
  F6 `op://event` reaches only the window that owns the op (`7d698cf`); F8 an op ends when git
  exits, not when a backgrounded child's pipe closes (`cdba0d3`); F7 a second launch opens another
  window of the running app instead of a second process (`1730ab1`); F5 the merge dialog no longer
  offers Squash with Always create a merge commit (`824ffca`); F10 Install is refused while a git
  operation is running in any window (`2e62a88`). Smoke group BD walked 2026-09-21 over CDP
  (`docs/archive/walks/2026-09-21-group-bd-walk.md`): rows 1–9 pass — row 8's **in front**, which a scripted second start cannot show (the foreground
  lock), by hand the same day; row 10 needs a published update (still open, `open-items.md` §N).
- **Deferred, moved to §I** (two, unchanged from the plan): the hunk buttons staying enabled on a
  non-UTF-8 file (F3); a typed commit message lost to an update restart (F10).
- **Found on the walk, not fixed** (older than this batch): a working-tree write in the 50 ms after
  an operation ends is never shown until **Refresh** — `watch.rs` drops every event stamped before
  `un-suppress + SUPPRESS_GRACE` as the operation's own, and the post-operation status read has
  already run. No person is that fast; a tool started by the commit can be, and since `cdba0d3` an
  operation ends while a hook's backgrounded child may still be writing. Reopen with a cheap fix in
  mind: one more status read a grace after the operation ends, or classify by path instead of by time.
  (Narrowed 2026-09-21, row 4 below.)
- **From "still open from this batch"** (2026-09-21) — the rows since done:
  1. ~~**BD 8, "in front"**~~ — passed by hand 2026-09-21: the exe double-clicked while the local
     build ran, the new start-screen window came up on top.
  2. ~~**The push**~~ — pushed 2026-09-21, `1c8d292..f238ee8`; the tag's `checks` jobs are the first
     run of the new runner tests (a `sh` alias, `seq`, `sleep 0.1`) and the bracketed-name tests on
     Linux and macOS.
  3. ~~**The next release**~~ — **v0.10.10**, tagged 2026-09-21 at `f238ee8`. (The walk it unblocks is
     still open, `open-items.md` §N.)
  4. ~~**The watcher's 50 ms gap**~~ — narrowed 2026-09-21 (`bbb7e7f`, BD 18): inside the grace the
     watcher drops only the kinds the operation declared, so a working-tree write after a stage or a
     commit shows. What is left, accepted (Q12): a foreign write *of a declared kind* in those 50 ms
     — everything, for the operations that declare every kind (pull, merge, checkout).
  5. ~~**F8's test costs 20 s per Windows `cargo test`**~~ — now `sleep 12` (the assert bound is
     10 s): 8 s back. §I.
  6. ~~`graphify update .`~~ — run 2026-09-21 after the follow-ups.
- **Follow-ups, 2026-09-21** (`docs/archive/plans/2026-09-21-walk-followups-plan.md`; `edb9502`, `bbb7e7f`, and two folded in, below):
  History and Blame on a file row now open the History view — since the views were split they set
  their state there and stayed on Changes; History also closes the dialog it was clicked in, Blame
  the commit dialog only, because a diff window shows the blame itself (BD 17). The watcher (row 4),
  the 12 s test (row 5) and a test on Install's refusal helper — that `install_update` calls it
  still waits for BD 10.
- **Squashed before the push, 2026-09-21.** Three later commits were folded into the fix they
  correct: the submodule `:(literal)` fix (was `1adbeff`) into F1 `5c014d6`, the 12 s test sleep (was
  `abdffe8`) into F8 `cdba0d3`, the refusal helper's test (was `53d7ac7`) into F10 `2e62a88`; every
  docs commit after the review's own became one. The fix hashes in this file are the pushed ones.
  The walk records, the follow-up plan and every "on a build of …" keep the hashes of the day —
  those builds were of the commits as they stood: `7cc503b` = the ten fixes before the submodule
  fix, `1adbeff` = with it, `53d7ac7` = with the follow-ups (the code now at `bbb7e7f`). Old → new:
  `9f617ec` `5c014d6` · `8a19f62` `0619b89` · `e1f42ba` `4d090a8` · `6f8b324` `9722116` · `2f545b2`
  `6a806bd` · `0cf7942` `7d698cf` · `bb27c36` `cdba0d3` · `aa605eb` `1730ab1` · `20340ec` `824ffca` ·
  `7cc503b` `2e62a88` · `42ecbbc` `edb9502` · `c3e1120` `bbb7e7f`.
- **Second walk, 2026-09-21** (BD 11–16, `docs/archive/walks/2026-09-21-group-bd-second-walk.md`):
  one defect in this batch's own fix — `git submodule update` ignores `--literal-pathspecs` (the
  flag and `GIT_LITERAL_PATHSPECS` both, git 2.55), so Update on `subs/[ab]` moved `subs/a`. Now
  `:(literal)<path>`, with a test that runs git. The conflict checkouts and the file history do
  honour the flag (walked).
- **Closed, will not fix** (one): Push's bare branch name against a same-named tag — see §I.
- **A staged diff's body stayed stale after an outside `git add`** (found on the BD second walk) — **fixed
  2026-09-25** for v0.10.12 (`docs/archive/plans/2026-09-25-update-and-staging-fixes.md` Task 1, walked as BG 1).
  - Reproduced first on 0.10.11: only a rewrite plus `git add` with *no* status read in between was stale. That
    leaves the entry identical, since a file staged whole has no workdir stamp. With a read in between, it already
    reloaded.
  - The entry now carries `indexStamp`, the staged blob's oid.
  - Landed with it, from the 2026-09-24 walks:
    - a successful pull or push of the same remote and branch retires the *Rejected — Pull first* toast (BE
      observation 1, BG 3). It was per repository at first, then per remote and branch after the final review. So
      neither pushing `feature` nor pulling from `origin` clears `main`'s rejection on `mirror`;
    - the updater's network failures read *couldn't reach GitHub* / *the download was interrupted* (update-walk
      observation 1, BG 2);
    - every window learns an update check's answer (update-walk observation 3, BG 4).
  - **Closed without a change** (user, 2026-09-25), so they aren't re-offered:
    - the error toast stack sits over the grid's top row, where it caught a right-click in the BE walk (BE
      observation 2): leave it;
    - Escape once didn't close Settings (update-walk observation 4): not a bug. The user was using the machine
      at the time, and the key went to a diff window.
  - BG was walked on a build of `8c75071`, as the walk record says. After the squash, that code plus the 16-digit `indexStamp`, the cross-window install guard and the rejection toast kept per remote and branch is `76dee06`
    (`a7d6ffc` staging · `73ebed3` toast · `dbf931d` update flow · `76dee06` final-review fixes).
- **`linesShown` is unreachable from the panel** — **closed 2026-09-25, nothing to do.** A truncated diff is
  whole-file only in the panel (`wholeOnly`), so the hunk print always covers the whole hunk. The cut-hunk path
  has unit tests, and no surface reaches it. Reopen if a surface ever offers hunk actions on a truncated diff.
- **Lines for the release's notes** (shipped as v0.10.10): a second launch now opens another window of the running
  app (was: a second process); Push writes to the upstream's branch name when it differs; hunk /
  line actions are refused when the file changed under the diff, beside a missing final newline,
  and in a non-UTF-8 file; Squash is unavailable with "Always create a merge commit"; Install waits
  for running git operations.
