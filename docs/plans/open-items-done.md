# Open items — done and closed (t4-git-ui)

_Split out of `open-items.md` on 2026-09-24 so that file holds only what is still to do. Everything
here is shipped, fixed, walked, answered, or closed as will-not-fix / accepted. Section letters match
`open-items.md`, so an older reference to "open-items §N" finds its row in one of the two files.
Text is moved as written; hashes and line numbers are those of the day. Open accepted limits — those with a
reopen trigger — are in `open-items.md` §Q (since 2026-09-28); a row moved there leaves a pointer here._

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
  dialogs closing on `runOp`'s busy short-circuit is an accepted limit, moved to `open-items.md` §Q (*A ref or
  remote dialog closes, and its input is lost, when its op is refused*), 2026-09-28. Both leave §C.
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

The three rows below were closed 2026-10-03 by close-out Phase 3 (`docs/archive/plans/2026-10-01-phase-3-plan.md`),
measured first (`docs/archive/walks/2026-10-01-phase-3-measure.md`) and walked as smoke group BL
(`docs/archive/walks/2026-10-03-group-bl-walk.md`). The fixtures: `perf-synth` (100k commits, 332 local branches, 100k
files) and `perf-git` (a git/git clone).

- **`reachers` merged-badge walk** (2026-09-02 review P1): the merged computation walked every commit newer than the
  *oldest* tip — remote branches included — and reran whenever any tip oid changed (every commit, fetch, checkout).
  (The row also said "under the git2 mutex": stale — `get_refs` opens a private `Repository` and takes only the
  `ahead_behind` cache lock; corrected here.) **Fixed 2026-10-02** for close-out Phase 3 (`f2e5d02` fix 1a,
  `c6bfdef` fix 1b; smoke group BL 1). Stage A: on `perf-synth` a commit's toast → sidebar took 2346 ms median and
  every refs read ~1.8–1.9 s — the walk ~0.5 s of it, the floor ~1.1 s of per-branch upstream lookups, each taking a
  fresh config snapshot; on `perf-git` 787 ms. Fix 1a reads the upstreams from one config snapshot per refresh; fix 1b
  keeps a reachability matrix over the distinct tip oids and adds a new tip with one hiding walk (B1, X1, Q22), falling
  back to the full walk on a backward move and the like (an accepted limit, `open-items.md` §Q). BL 1's re-walk: on
  `perf-synth` toast → sidebar 68.5 ms (worst 74.5), refs read 61 ms after a commit, ~62 after a checkout, ~89 on F5,
  74 after a fetch-like move and 71 after a merged-PR move; on `perf-git` 70 / 53 ms; the merged badges identical to
  0.10.15's (662 rows). The matrix at thousands of branches is a §Q row (Q25).
- **Hunk / line diff rebuilds** (2026-09-03 review P1): every hunk / line stage, unstage and discard rebuilt the
  file's diff, and for a path that looked added / deleted the whole-repo diff a second time, to find a rename's other
  half. **Fixed 2026-10-02** for close-out Phase 3 (`f3cc948`, fix 2; smoke group BL 2, BL 3). Stage A: on `perf-git`
  a hunk stage, a line stage and a hunk discard took 98 / 124 / ~42 ms (fine); on `perf-synth` a line of a
  working-tree deletion 918 ms (the whole-repo rebuild 225–304 ms, per action and again for the reload), a line
  unstage of a staged deletion 398 ms. The commit panel's Staged and Unstaged diffs no longer rebuild the whole
  repository: a staged rename's old path comes from the status, and the working tree no longer pairs renames (B2,
  D-2). BL 2: 218 / 216 ms median (the rebuild 4–5.5 ms; the rest is the status scan and the reload). No per-burst
  cache or hunk list was needed.
- **Virtualized output dock** (review P5): the dock renders 25,000 lines in all (Q24) as plain DOM. Virtualize only if a
  long-running op's output is visibly slow to scroll. **Fixed 2026-10-02** for close-out Phase 3 (`6d1a7d5`, fix 4;
  smoke group BL 6). Stage A on `perf-git`: no jank up to 10 ops, frame gaps of 654 / 784 ms in 2 of 5 scroll samples at
  the 50-op cap. Fix 4 sets `content-visibility: auto` on each op block (the browser skips the off-screen ones) and
  drops the oldest finished ops once the total passes 25,000 lines (Q24; the newest op and running ops are never
  dropped); not virtualized. BL 6's first walk, before the cap (50 ops, 250,100 rows), still had one 696 ms gap in 10
  samples, a major GC; at the cap (5 ops, 25,010 rows) the worst of 10 samples was 49.2 ms, no frame over 50 ms. On
  WebKitGTK (BL 10) the dock at the cap scrolls and selects, and supports `content-visibility`.

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
- ~~macOS signing~~ — **done 2026-09-11**: a self-signed certificate shared with the sibling app,
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
- ~~Dependabot's `glib` 0.18 alert~~ — dismissed 2026-09-10; an accepted limit with a reopen trigger, moved to
  `open-items.md` §Q (*Dependabot's `glib` 0.18 alert, dismissed*), 2026-09-28.
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
- **macOS notarization** — closed 2026-09-26, won't do for now; an accepted limit with a reopen trigger, moved to
  `open-items.md` §Q (*macOS notarization: won't do for now*), 2026-09-28.
- **Close-out triage 2026-09-26 and 2026-09-28** — **done 2026-09-28**. The skips and accepted limits of Phases
  0–1 and PR #18's leftovers, eighteen decisions (T1–T11, U1–U5, A1, A2), in
  `docs/archive/plans/2026-09-26-triage-plan.md`. The work they called for: the Settings Esc bug to Phase 2a, the
  signing row reworded, `smoke-launch.ps1 -Proxy`, U1–U5 carried into the close-out plan, finished plans archived.
- **The user's own update to the next release (the close-out release gate)** — **done 2026-09-29**: the installed
  0.10.12 updated to v0.10.13 through Check now → Install and came back as 0.10.13 with its windows; the first
  update whose signatures carry `version:` (all three `.sig` read `version:0.10.13`).
  - **Closed accepted item (the user, 2026-09-29):** the real-install run of 0.10.12's plain-words update *errors*
    didn't happen (the update went the happy path); group BG walked them on local builds
    (`docs/archive/walks/2026-09-25-group-bg-walk.md`), and 0.10.13 carries the same code. No reopen trigger. The
    Install-over-a-draft half closed 2026-10-01 (below).
  - **Closed 2026-10-01** (*Install's confirm over a typed commit message, on a real install*), at the v0.10.15
    release gate: with the installed 0.10.14, a commit summary typed in Changes, then Settings › *Update to
    0.10.15…* asked before dropping the typed message (`docs/archive/walks/2026-10-01-v0.10.15-release-gate.md`).
    The confirm itself is F10, fixed 2026-09-25 (§I).
- **Windows code signing** — **done 2026-10-01** (close-out Phase 1b, `docs/archive/plans/2026-09-30-phase-1b-plan.md`).
  The row as it stood: the NSIS setup is not Authenticode-signed, so every new Windows user meets SmartScreen's "Windows
  protected your PC" and has to pick *More info › Run anyway*. The updater's minisign signature is a different thing: it
  protects updates, not the first download. Close-out Phase 1b ports the sibling app's setup — its
  `.github/workflows/release.yml` is the reference implementation, and the user's `signing-and-repo-setup.md` (a working
  copy outside the repo) lists the repo settings and the verify steps (Certum certificate, thumbprint `F06C…8151`,
  expires 2027-09-22). Recorded 2026-09-24 from group BF. What an unsigned setup actually met there (BF 3, in Windows
  Sandbox): **Edge warned on the download**, and running it brought **no SmartScreen prompt**. So today the friction is
  the browser's download warning. SmartScreen on run may still differ on a real machine, whose settings the Sandbox need
  not share.
  - **Closed 2026-10-01:** Release signs the setup and every exe in it with the Certum certificate through `ssign`, in
    the `signing` environment (the owner approves every run), and *Check the Windows signature* fails the leg unless
    each is `Valid`, timestamped and carries thumbprint `F06C…8151`. Both dry runs passed it — Release run 36674994686
    on `phase-1b` and 36753506004 on `main` — and smoke group BJ 4–6 walked them
    (`docs/archive/walks/2026-09-30-phase-1b-walk.md`). The first signed release was v0.10.15 (2b's, 2026-10-01); its
    gate read the installed exe `Valid`, thumbprint `F06C…8151`, timestamped
    (`docs/archive/walks/2026-10-01-v0.10.15-release-gate.md`). The certificate's expiry is a dated row in
    `open-items.md` §E.
- **UI-vs-canvas comparison pass (v1 plan M6 leftover)** — screenshots of the real app against the screens canvas, one
  pass, fix what differs or update the canvas: done as close-out Phase 4. Stage A ran 2026-10-03 (the Results and
  Rulings in `docs/archive/plans/2026-10-03-phase-4-plan.md`); Stage B's app fixes and canvas updates landed 2026-10-04,
  and smoke group BM was walked the same day (`docs/archive/walks/2026-10-04-group-bm-walk.md`). Moved here 2026-10-04.

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
    Revisit only if the walker learns to add the working-tree column without restarting. (In `open-items.md` §Q
    since 2026-09-28.)
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
commits and pushed with the CI port from the sibling app (`a904701`).

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

- `src/store/repoStore.ts:263` opening a dirty repository walks the graph twice — closed 2026-09-11, will not
  fix, do not re-offer (§E has the reasoning); an accepted limit with a reopen trigger, moved to `open-items.md` §Q
  (*Opening a dirty repository walks the graph twice*), 2026-09-28.
- Push sends a bare branch name — closed 2026-09-20, will not fix, do not re-offer; an accepted limit with a
  reopen trigger, moved to `open-items.md` §Q (*Push sends a bare branch name*), 2026-09-28.
- **F7 / Linux residual risk** — accepted 2026-09-21; an accepted limit with a reopen trigger, moved to
  `open-items.md` §Q (*F7 / Linux residual risk*), 2026-09-28.
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
- **`Menu.tsx` ceiling** — closed 2026-09-26, will not fix; an accepted limit with a reopen trigger, moved to
  `open-items.md` §Q (*The `Menu.tsx` ceiling*), 2026-09-28.
- **S1, blame and history ops are never cancelled** — **fixed 2026-09-29** for close-out Phase 2a (`f52c050`;
  unit-only, not walked). `RepoHandle` gained `latest_blame` / `latest_history` tokens, each superseded (and the
  older one cancelled) by the next blame or history request.
- **S3, the truncated flag fires on stderr too** — **fixed 2026-09-29** (`4eba53e`; unit-only, not walked).
  `CliOutput::truncated` is renamed `stdout_truncated`, set from stdout only.
- **F3, hunk buttons stay enabled on a non-UTF-8 file** — **fixed 2026-09-29** for close-out Phase 2a (`058b9a7`,
  walked as smoke group BH 7). `FileDiff::lossy` is on the wire; the commit panel hides hunk buttons and line
  selection on it, with a note.
- **The detached-HEAD banner's buttons aren't disabled while an op runs** — **fixed 2026-09-29** for close-out
  Phase 2a (`d7cfc61`, walked as smoke group BH 9). `StateBanners` gates every banner button that starts an op on
  `running`, with the *Operation in progress* title, like the grid and sidebar menus. `open-items.md` §Q's *A ref
  or remote dialog closes…* entry now points here: no known path is left.
- **`ponytail:` ceiling, `watch.rs:124`** (an app-side rewrite of `.gitmodules` didn't refresh the Submodules list
  until the next refs event) — **fixed 2026-09-29** for close-out Phase 2a (`4fe4034`, walked as smoke group BH 8).
  `kinds_for` reports `Refs` for a `.gitmodules` path, so Discard and conflict resolution reload the list.
- **`ponytail:` ceiling, `App.tsx:175`** (an update answer landing between a new window's `lastUpdateCheck()`
  reply and its `update://checked` listener attaching could be missed) — **fixed 2026-09-29** (`072b1b8`;
  unit-only, not walked). The reply is issued only after the listener attaches, and an event heard before the
  reply wins over it (R2).
- **`ponytail:` ceiling, `Input.tsx:221`** (an AltGr character never reached type-ahead) — **fixed 2026-09-29**
  (`efe1896`; unit-only, not walked). A Ctrl+Alt chord with a single-character key now passes the Alt branch. The
  macOS Option-typed variant is deferred, `open-items.md` §R. The optional hand walk with a real AltGr layout was
  skipped (triage 2026-09-29, accepted closed): the unit test's synthetic Ctrl+Alt event is what Windows sends.
- **`ponytail:` ceiling, `Toolbar.tsx:100`** (a repository switch in the `icons` tier measures the repo-name span late,
  so the toolbar stays in `icons` after switching to a short-named tab until the window is widened past the old
  breakpoint) — **fixed 2026-10-01** for close-out Phase 2b (`e4ac54f`, row 5, smoke group BK 4). `.icons .repoName` now
  hides with `position:absolute; visibility:hidden` instead of `display:none`, so it keeps measuring its real width (up
  to 160px) while taking no layout space; the `ponytail:` comment is gone; the `w > 0` guard stays, now only for an
  empty name.
- **`ponytail:` ceiling, `StashDialogs.tsx:39`** (a dirty-only or moved submodule, or an untracked nested
  repository, was listed as stashed, though `git stash` changes none of them) — **fixed 2026-10-01** for
  close-out Phase 2b (`45ab79d`, D6(a), smoke group BK 5). `stashFiles` leaves out every submodule entry with no
  staged change (dirty-only, moved, untracked nested repositories alike); a submodule with a staged pointer is
  still kept (git does stash that). Both stash surfaces show a muted note, *Submodules and nested repositories
  aren't stashed*, when any was left out; only-submodule changes now disable the button with *Nothing to stash*
  instead of a false *Stashed changes* toast. The `ponytail:` comment is gone.
- **S4: `blameAt` acts before it knows the reveal hits.** Closing the commit dialog, switching to History, seeding
  and pinning the file and turning blame on all happened before `revealOid` was awaited, so a miss left every side
  effect in place (plus a wrong *clear the filter* toast on a stash target, since `refs/stash` isn't walked).
  **Fixed 2026-10-01** for close-out Phase 2b (`870aff8`, D7(a), smoke group BK 6, change review passes 5–7).
  `blameAt` reveals first and acts only on a hit, or when the oid is already on screen (`treeTargetOf`); later
  passes fixed the seed being overwritten when the store already held the blamed commit (computed after the
  reveal, from what the store still holds) and a tab switch during the reveal, which now returns silently instead
  of acting on the wrong tab.
- **`walker.rs:94`: a `Refs` spec that never reaches HEAD** (the working-tree column's lane stayed open to the
  bottom of the graph) — **fixed by deletion 2026-10-01** for close-out Phase 2b (`dd04cc7`, D9(a)). `RevSpec::Refs`
  was unreachable from the UI (only `all` / `head` are built); the Rust variant, its TS member, the doc mentions
  and the `Refs` assertions in five tests are deleted; `chunking_early_stop_and_cancellation`'s `exact` case now uses
  `t.detach(exact)` with `RevSpec::Head` instead. The `ponytail:` comment is gone.
- **`linked.rs:134`: no main row when the main worktree's HEAD can't be read** (missing for a bare repository, a
  `--separate-git-dir` checkout, a submodule's linked worktree, or a corrupt HEAD) — **fixed the submodule case
  2026-10-01** for close-out Phase 2b (`8292622`, D10(a), smoke group BK 8). The main row's path now opens the
  common dir itself and takes its `workdir()`, so libgit2 honours `core.worktree` (set in a submodule's config);
  the comment is corrected (bare has no main row by design, `--separate-git-dir` is unknowable, git's own
  `worktree list` has the same gap). The `ponytail:` comment is gone.
- **S2: non-UTF-8 paths.** The Files tab silently missed a non-UTF-8 path from the working-tree listing, and a
  commit's tree listed it as `caf�.txt` with every click failing; a non-UTF-8 *directory* aborted the whole
  listing. **Fixed 2026-10-01** for close-out Phase 2b (`7d532a4`, D11(a) + D16, smoke: Linux-only, in
  `open-items.md` §V). Both listings now skip a non-UTF-8 path (and, for a directory, everything under it, counted
  as files) and carry a `skipped` count; the Files tab shows *N files with names that aren't UTF-8 aren't shown*.
  Changes still lists a non-UTF-8 path under a replaced name — accepted, `open-items.md` §Q.
- **R12, pairing 2 (conflicts): the `stranded` note could offer Restore conflict on a stale status/refs pairing.** Right
  after a merge commit (`commit()` refreshes status before refs), a brief window (status fresh, refs still *merge*) with
  markers still in the file could offer *Marked resolved, but the conflict markers are still here* → **Restore
  conflict**, which could overwrite a finished merge's file. **Fixed 2026-10-01** for close-out Phase 2b (`35b061b`,
  D15(a)). `stranded` is now also gated on `freshStatus(status, refs.state) !== null`. Pairing 1 (`canCommit`) is left
  unguarded — accepted, `open-items.md` §Q.
- **B3** the interactive-rebase read pass runs a real `rebase -i --autostash` — accepted 2026-10-01 (close-out
  Phase 2b, D12; a unix test proving the recovery, `8ad504e`); an accepted limit with a reopen trigger, moved to
  `open-items.md` §Q (*A kill during the interactive rebase's read pass leaves the changes in the autostash until
  Abort*).
- **C6** `close_repo` never cancels the repo's in-flight ops — accepted 2026-10-01 (close-out Phase 2b, D13; the
  comment corrected, `45414b1`); an accepted limit with a reopen trigger, moved to `open-items.md` §Q (*Closing a
  window lets its repository's running op finish unseen*).
- **R10** selected-mode header after a partial stage — accepted 2026-10-01 (close-out Phase 2b, D14); an accepted
  limit with a reopen trigger, moved to `open-items.md` §Q (*After a selection shrinks to one row by itself, the
  header offers Stage all*).
- **Q23** the details pane blank while a newly selected commit loads — moved to §Q 2026-09-28; closed 2026-10-01
  (`ce34b92`), done §Q.
- **E6** O(n²) tree build for a flat directory (`fileTree.ts`, `Sidebar.buildTree`) — **fixed 2026-10-02 for the
  Files and Changes trees** for close-out Phase 3 (`785a9f1`, fix 6a; smoke group BL 7), and **closed as measured
  fine for the sidebar** (row 6b). The row's shape was wrong: `buildFileTree` is quadratic in sibling *folders*, not
  in a flat directory's files; `Sidebar.buildTree` in the refs of one folder. Stage A on `perf-synth` (100k files): a
  Files tab first visit 520 ms, a revisit 245 ms and a folder expand 255 ms — every expand rebuilt the whole tree; the
  100k build alone 141.6 ms (142 on WebKitGTK). Fix 6a looks folders up in a `Map`, sorts with one `Intl.Collator`,
  and builds once per listing. BL 7: expand ~26 ms, collapse 21, revisit 28, the build 35.7 ms; the first visit 274 ms
  (worst 300), an accepted limit (`open-items.md` §Q, B3). The sidebar's build: 0.3 / 2.3 / 22.0 ms at 330 / 1000 /
  5000 refs in one folder (WebKitGTK the same).
- **R13** `canSquash` O(n) per row — **closed 2026-10-02 as measured fine** (close-out Phase 3, row 7). On
  `perf-rebase` (1 pick + 499 fixups): `canSquash` + `validate` for every row 4.2 ms (5 on WebKitGTK); the dialog's
  render ~64 ms of its open, one action change 24.4 ms. The ~400 ms backend todo read under the open is a new row,
  `open-items.md` §X.
- **`ponytail:` ceiling, `linked.rs:120`** (the worktree / submodule snapshot, no cache) — measured fine 2026-10-02
  for close-out Phase 3 (row 8), the comment kept; an accepted limit with a reopen trigger, moved to `open-items.md`
  §Q (*`linked.rs:120`: the worktree / submodule snapshot has no cache*), 2026-10-03 (Q16).
- **`ponytail:` ceiling, `window.rs:627`** (was `:520`; the pointer position for tab adoption is Windows-only) —
  accepted 2026-10-04 (close-out Phase 5, D1), moved to `open-items.md` §Q (*Tab adoption is Windows-only*). The last
  open row of §I: the section left `open-items.md` the same day.

## J. Added 2026-09-14 — from the UI direction B review

The open-items §J heading is gone (nothing open is left there); this section now holds the whole history.

- **Per-view sidebar state** (Direction B follow-up) — **fixed 2026-09-29** for close-out Phase 2a (`56bbea5`,
  walked as smoke group BH 10): `viewStore` keeps a `railOverride` per view, per window, in memory; a sidebar width
  dragged in one view survives a view switch that hid it.
- **Palette search prefixes** — moved to `open-items.md` §C (roadmap), 2026-09-28 (close-out Phase 2a decision).
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

The open-items §L heading is gone (nothing open is left there); this section now holds the whole history.

- **`Ctrl+,` is dead while the start screen is opening a repository.** Accepted 2026-09-28 (Q1), no code; moved to
  `open-items.md` §Q (*`Ctrl+,` does nothing while the start screen opens a repository*). This is the origin
  pointer, since the open-items §L section that named it is gone.
- **Linux `Super+O` / `Super+N` / `Super+Q` reach the app** — **fixed 2026-09-29** for close-out Phase 2a
  (`11b5b42`; unit-only, not walked; the Linux WebDriver check is in the close-out Linux track). `keys.ts` gained
  `ctrlOrCmd(e)` (`e.ctrlKey || (e.metaKey && /Mac/.test(navigator.userAgent))`), used at the four spots that had
  treated `metaKey` alone as Ctrl.
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

- **Failure toast detail cut mid-sentence, or a `warning:` line taken instead** — **fixed 2026-09-29** for
  close-out Phase 2a (`7c7294e`, walked as smoke group BH 6). `classify_failure`'s middle fallback now skips
  leading empty, fetch-chatter and `warning:` lines, then joins lines up to a blank one, at most 4.
- **The default remote can overwrite a quick pick** — **fixed 2026-09-29** (`d116c2d`; unit-only, not walked — a
  millisecond race). `useDefaultRemote` gained a `touched` ref; the late `get_default_remote` answer is skipped
  once the field was changed by hand.
- **Esc is dead in Settings after Check now** (triage T2) — **fixed 2026-09-29** for close-out Phase 2a
  (`5ada2e9`, walked as smoke group BH 4 and BH 5). `Dialog.tsx` gained a document `keydown` listener that acts on
  Esc / Tab when the focus has fallen to `<body>` (a focused control disabling itself drops it there, and
  `Dialog`'s own `busy` rule only restores it in one case). Unverified on WebKitGTK, deferred to `open-items.md`
  §R.
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
- **Menus: rows shift over a clipped name; the first item opens wrapped.** A mouse right-click after grid arrows opened
  a `ContextMenu` with its first item marked and highlighted as if by keyboard, wrapped when clipped. **Fixed
  2026-10-01** for close-out Phase 2b (`b1241e4`, D5(a), smoke group BK 3): a `ContextMenu` opened by a pointer no
  longer marks its first item (a `byKey` parameter on `useMenuDismiss`, defaulting to `openedByKey`; `ContextMenu`
  passes `lastInputWasKey`; superseded 2026-10-04 by close-out Phase 5 D6: every menu asks `lastInputWasKey` alone, and
  `byKey` / `openedByKey` are gone), and the highlight/wrap CSS rules key on `[data-kbd]:focus` only, with an
  `.item:focus-visible { box-shadow: none }` override so the global focus ring (`theme/base.css`) doesn't land on the
  natively `:focus-visible` first item. Arrowing onto a clipped row still wraps it and shifts the rows below — accepted,
  `open-items.md` §Q.
- **An external `git reset` of 1800 files took about four seconds to show in Changes** (seen in the AZ walk, on 0.10.7
  as well) — **fixed 2026-10-02** for close-out Phase 3 (`9be1867` fix 5, `a369138` fix 3; smoke group BL 5). Stage A
  on `perf-reset` (1800 tracked files): the `git add -u` control 424 ms, a mixed reset 2540 ms, `reset --hard` 5889 ms
  — each watcher batch started another scan while earlier ones still ran (7–10 at once). Fix 5 runs one scan at a time
  per repository, with at most one queued; fix 3 makes each scan cheaper. BL 5: the control 413 ms, a mixed reset 397
  ms (worst 407), `reset --hard` 97 ms (worst 229); no two of the walk's 230 scans overlapped.

Eight findings, all fixed (staging back on libgit2's ignore check, the `index.lock` match on both the CLI
and the libgit2 side, window restore, the grid's mount row, clipped menu names); a second review of the
fixes and the walk added three more. The walk is `docs/archive/walks/2026-09-19-group-az-walk.md`.

- **Window restore, accepted limits.** A Quit or a crash inside four seconds of a deliberate close brings
  that window back — indistinguishable from closing the windows one by one. More than four seconds between
  two closes of a quit by hand reads as a deliberate close of the earlier ones. `layout.json` is written
  with a plain `fs::write`, not tmp + rename: the grace timer's write could be cut by a process exit in
  the same few microseconds, and an unreadable file restores nothing. A `set_layout` that lands after its
  window's `Destroyed` re-inserts the label for the session (older than this work). Decided against:
  de-duplicating a repository held by both a closed entry and a live window, and the sibling app's
  counter design (a report from another window inside the grace drops the closed one).
- **Staging, accepted cost.** libgit2 reads the ignore files per path: 1861 untracked files under 61 nested
  `.gitignore` stage in 0.62 s against 0.48 s on 0.10.7; 1800 modified files in 0.57 s against 0.60 s.
- **`smoke-cdp.md` said a local build cannot rewrite the installed app's `recents.json`.** It can, and
  `layout.json` with it: only the WebView2 profile is isolated. Corrected there, with the backup recipe.
- **The open box in group AZ, row 11 (Linux and macOS: 3a, 3b, 3d, 3i and bullet 6, by hand).** Done 2026-10-06.
  macOS was walked 2026-10-04 in close-out Phase 5 (`docs/archive/walks/2026-10-04-phase-5-macos-walk.md`, M2).
  Linux failed on 6 on 2026-09-26 (fixed in #18, 2026-09-27) and hit the restored-window hang (§O); re-walked
  2026-10-06 on `cc6d58f`, row 3 under Xvfb + openbox: all pass, light and dark
  (`docs/archive/walks/2026-10-06-restore-hang-and-az-rewalk.md`). Both lines ticked.

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
  an operation ends is never shown until **Refresh**. Narrowed 2026-09-21 (row 4 below); what is left is an
  accepted limit with a reopen trigger, moved to `open-items.md` §Q (*A working-tree write in the 50 ms after an op
  isn't shown until Refresh*), 2026-09-28.
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
     commit shows. What is left, accepted (Q12): moved to `open-items.md` §Q, 2026-09-28 (the row above).
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
- **Closed, will not fix** (one): Push's bare branch name against a same-named tag — see §I (in `open-items.md` §Q
  since 2026-09-28).
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

## O. Added 2026-09-26 — the Linux walk of group AZ 11: closed 2026-10-06

The walk is `docs/archive/walks/2026-09-26-group-az-linux-walk.md`: a debug build of `1e795ad` on Ubuntu 26.04.1,
WebKitGTK 2.52.6, driven under Xvfb (`docs/smoke/smoke-linux.md`). Rows 3a, 3b, 3d and 3i pass. It found two bugs,
both reproduced without WebDriver. Fix plan, with a status section:
`docs/archive/plans/2026-09-26-linux-menu-focus-and-restore-plan.md`.

The 2026-09-27 fix batch and its decisions (D-a, D-b, R5b): `docs/archive/plans/2026-09-27-pr18-fix-batch-plan.md`.

- **Menus show no keyboard focus on WebKitGTK: fixed** (branch `linux-smoke-and-fixes`, merged in #18 on
  2026-09-27).
  - **The bug:** `Menu.tsx` focused items by script, WebKitGTK never gives those `:focus-visible`, and every highlight
    and the clipped-name wrap were keyed on it.
  - **The fix:** `focusItem` marks a keyboard-focused item `data-kbd`, and the CSS styles `[data-kbd]:focus` beside
    `:focus-visible`.
  - **Checked:** AZ 6 passes in full on Linux (2026-09-26, direct launch, real X keys).
  - ~~**Linux audit** of other script-focused widgets~~ **Done 2026-09-27**
    (`docs/archive/walks/2026-09-27-t18-linux-focus-audit.md`). After a click, keys that move focus by script
    showed no ring on ten paths (the sidebar tree, both tab strips, the diff cursor, Esc back to an opener, …).
    Fixed for every widget at once: `src/lib/kbdFocus.ts` marks keyboard focus `data-kbd` on every `focusin`, and
    each `:focus-visible` rule has a `[data-kbd]:focus` twin. All ten re-walked and pass on Linux.
  - ~~**Windows re-walk of AZ 6** over CDP.~~ **Done 2026-09-27** (`docs/archive/walks/2026-09-27-t19-windows-walk.md`),
    against the installed 0.10.12 as the baseline:
    - AZ 6 and all ten audit paths look as before (Chromium already rang them).
    - *Tab, then click* was already so on Windows.
    - The one visible change was a click then **Ctrl+Comma**, which rang Settings' Close. The user decided
      against it: only Ctrl/⌘ + a navigation key (arrows, Home, End, PageUp, PageDown) counts as keyboard input;
      every other Ctrl/⌘ chord is ignored. The same on every OS — a visible change on Windows too (R5b).
- **A restored second window sometimes never starts: closed 2026-10-06 as a harness artifact, not an app bug.**
  - **The bug, as it first looked:** `w1` stays on the *Starting* spinner for good.
    - **Rate:** 3 of 16 two-window restores before step C were real hangs (a live `w1` that never got its
      repository title; the one under WebDriver on the *Starting* spinner). A later 7 of 20, measured with a
      kill-and-relaunch loop, likely raced `killapp`'s own kill against the next launch; whether those 7 were alive
      wasn't recorded. With the wait added to `killapp`, 0 of 20 raced. On WSL, 0 of 40 two-window runs hung for
      real (4 of them, with the old helper, were the race and never reached `spawn`).
    - **Log:** nothing from `w1`. Under WebDriver its `plugin:store|load` never returned, and async commands then
      stalled app-wide while a sync one still answered, so the main thread was alive.
    - **Seen again 2026-10-04 on a tear-off** (close-out Phase 5, BN 8's shrink case on `4705c6c`, Xvfb with no
      window manager, triage T30): under WebDriver the torn-off window opened at the right size but its page never
      started (blank, untitled, an eval in it hung), 1 of 1; by direct launch 0 of 4. The same day a `main` saved
      bigger than the screen stalled on launch with the page's calls to Rust lost (`open-items.md` §Q, T26) — the
      same signature, as the 2026-10-06 diagnosis found.
  - **Done, on `linux-smoke-and-fixes` (plan step C):** `spawn` writes the new window's tabs to `layout.json` at
    once, and after
    `restoreTabs` the frontend reports once, so a window that never starts keeps its tabs. Checked: 20 of 20
    restores kept them; if those 7 were the race, the guard checked nothing for them, and it is untested against a
    real hang.
    - **Gated since 2026-09-27** (found in #18's review, fixed on the branch): no `layout.json` write happens
      until `main` has read the last session (`take_layout`). Without the gate, a second launch during startup
      wrote `[]` over the saved session before `main` read it, and every window and tab of the last session was
      lost. Plan: `docs/archive/plans/2026-09-27-pr18-windows-plan.md`.
    - **Gated since 2026-09-27** (`afc40f3`, Step 1 of `docs/archive/plans/2026-09-27-pr18-fix-batch-plan.md`): `take` no
      longer deletes `layout.json` and seeds `main`'s saved entry in memory, so every write from the read on holds
      it; nothing shrinks while the session restores.
  - **Diagnosed 2026-10-06 (jobs 4–6):** the stall needs Xvfb with no window manager: a new window's page never called
    Rust (`take_pending`) after Rust had built and shown the window in 33 of 150 detaches on bare Xvfb, 0 of 300 with a
    window manager (a real desktop or openbox). Ruled a harness artifact: Phase B (a fix) was not needed. Full detail in
    `docs/archive/walks/2026-10-06-restore-hang-and-az-rewalk.md` and the combined row, `open-items.md` §Q, T26.
    - ~~**Whether it happens on Windows**~~ — not seen: the Windows AZ row 3 re-walk on 2026-10-06 passed
      (`docs/archive/walks/2026-10-06-restore-hang-and-az-rewalk.md`).
- **Triaged 2026-09-26:** every decision and accepted limit is recorded in the plan's *Decisions* section; the order
  of the remaining work is its *Order* section. T14 (a test for the `catch` path) is done. T11 was reversed 2026-09-27
  (D-a): `main` is now seeded first in `take`, so the §P crash loop widens instead, to cover crashes inside `open_repo`;
  its loop-breaker is the real fix. Then Phase A, remeasured on the native Linux host with the fixed helper (D-b); its
  own review decides whether to keep the A/B. If step C raises the rate, its write moves onto the build thread (D2).
  Then Phase B (the T18 audit was done 2026-09-27). Windows: AZ 6 as soon as the branch is up, row 3 after Phase B.
  (2026-10-06: Phase A ran as jobs 4–6; Phase B was not needed; Windows row 3 was re-walked 2026-10-06, all pass.) macOS
  (AZ 11 and the WebKit click-focus check, T12): done 2026-10-04 in close-out Phase 5 (AZ 11 macOS ticked; T12 held on
  WebView2 too, fixed for every menu by D6).
- **F7, accepted 2026-09-27 (the fix batch):** an accepted limit, moved to §Q (*F7 of the 2026-09-27 fix batch*),
  2026-09-28.

**Closed 2026-10-06.** Jobs 4–6 (`docs/archive/walks/2026-10-06-restore-hang-and-az-rewalk.md`) traced the restore
hang to the Linux harness (Xvfb with no window manager); the owner ruled it closes as that artifact, folded into
`open-items.md` §Q's T26 row, with the Linux harness using openbox for multi-window and restore rows from here on.
Job 7 then re-walked AZ 11 Linux (row 3 under openbox, row 6 on bare Xvfb) and T7;
all pass. AZ 11's Linux line is ticked (`docs/smoke/smoke-test-post-v1.md`), and this section moved here.

## P. Added 2026-09-26 — the Linux harness follow-ups: the rows since closed

The whole section closed 2026-10-06: its last open row, T7, was done, and the three rows below, done 2026-09-26,
moved here from `open-items.md` the same day. The harness decisions are in
`docs/archive/plans/2026-09-26-linux-menu-focus-and-restore-plan.md`.

- ~~**Portable fixture script (T2).**~~ Done 2026-09-26 (`linux-smoke-and-fixes`): `smoke-fixtures.sh` uses `awk`
  instead of GNU `sed`, with the same output.
- ~~**Promote the direct-launch helpers (D4).**~~ Done 2026-09-26 (`linux-smoke-and-fixes`):
  `docs/smoke/fixtures/direct.sh`, pointed to from `smoke-linux.md`.
- ~~**`xclip` (T9).**~~ Done 2026-09-26 (triage): it was installed, and is now a listed prerequisite.

- ~~**Drive GTK's native parts through AT-SPI (T5).**~~ Done 2026-10-06 (close-out Linux track, plan
  `docs/archive/plans/2026-09-27-t5-atspi-plan.md`): `docs/smoke/atspi.py` (`dump`, `menu`, `click`, `wait`) and
  `smoke-linux.md`'s *AT-SPI: GTK's native parts*. Walked on the Linux VM on a debug build of `6bffe6d`, Xvfb, a
  private session: the tree and the text-field menu match the spike (8 items, Paste sensitive); tauri-driver's app
  shares the private bus, so `wd.mjs` and `atspi.py` see the same app; Paste through `atspi.py click` filled Search
  commits; `gsettings` switched the theme both ways in about 150 ms. The desktop's `toolkit-accessibility` and
  `color-scheme` were unchanged. Live Wayland, DPI and the AppImage's theme (`GSETTINGS_BACKEND=memory`) stay out of
  reach.

- ~~**Re-test WebDriver with two windows (T7).**~~ Done 2026-10-06 (job 7,
  `docs/archive/walks/2026-10-06-restore-hang-and-az-rewalk.md`): under openbox, 10 of 10 `wd.mjs` runs got 2
  handles (`w1` first, then `main`) and both pages answered; start → both titles shown in 1.48–1.91 s; quit left
  no stale sessions. Multi-window rows get DOM access back under openbox.
- ~~**ssh under the moved `HOME` (T4).**~~ Done 2026-09-27 (`linux-smoke-and-fixes`): ssh finds the real `~/.ssh`
  through the passwd entry, and a GitHub ssh `ls-remote` works with `HOME` moved. `smoke-linux.md` §2 records it,
  with the caveat that ssh isn't isolated. Its accepted cases (other ssh hosts, a fetch/push through the app itself,
  the unisolated `~/.ssh`, ssh signing under the moved `HOME`) are in `open-items.md` §Q (*Linux harness: ssh cases
  not covered under the moved `HOME`*). Moved here 2026-09-28.
- **T15, a reloaded `main` re-spawns every other window** — **closed 2026-09-27** (`afc40f3`, PR #18's fix batch).
  - **The cause:** a dev reload, a WebKit web-process crash that reloads the page, or StrictMode's second `probe`
    under `tauri dev` ran `restoreTabs` → `takeLayout` again, and spawned duplicates of every other window.
  - **The fix:** `take` now returns only `main`'s own current entry on a second call in the same process, and
    spawns nothing.
  - **Walked:** a reload of `main` with two windows up stays at two windows on both OSes. The baseline showed the
    duplicate (`docs/archive/walks/2026-09-27-pr18-linux-rewalk.md` › *After the fix batch*).
- **A window that hangs mid-restore loses its remaining tabs** (a review finding of #18, older than it) — **closed
  2026-09-28** (triage U2), fixed by `afc40f3` (the fix batch's 1b): nothing is reported while a window restores.
  Its seed A poll never went short, for `main` or a spawned window, on either OS
  (`docs/archive/walks/2026-09-27-pr18-linux-rewalk.md` › *After the fix batch*).
- **CLI pin drift** (triaged 2026-09-27, the AppImage plan's Triage L2) — **closed 2026-09-28** by the CLI pin change,
  pushed straight to `main` (`docs/archive/plans/2026-09-27-ssh-prompts-check-and-cli-pin-plan.md`, Part B).
  - **The drift:** `release.yml` pinned `tauri-cli@2.11.4` while `package-lock.json` had `@tauri-apps/cli` 2.11.5,
    against the pin's own comment.
  - **The fix:** the pin is 2.11.5; the AppImage re-sign step passes `--app-version`, so its signature carries
    `version:` like the others; `checks.yml` fails a PR whose pin and lock differ, so it can't drift again unseen.
  - **Verified:**
    - the guard locally against five scratch cases (equal, differ, pin line missing, a prerelease pin against a plain
      lock, a prerelease on both sides);
    - CI on the push to `main` (`ee59475`, run 36391087334): green on all three legs, the guard step included;
    - a `workflow_dispatch` run of `release.yml` on `main` (run 36391567783): all three build legs green, the macOS
      signature step included. The `.exe.sig`, `.app.tar.gz.sig` and `.AppImage.sig` trusted comments all end in
      `version:0.10.12`, and `verify-updater-sig.py` passes on all three against the shipped pubkey (key
      `957D5D27E85EC730`).
    - End to end: the next release's gate.
- **A repository that crashes the app while it restores crashes every later launch** — **fixed 2026-09-29** for
  close-out Phase 2a (triage U1; `a47763b`, walked as smoke group BH 1–3). A `layout.restoring` mark (plus an
  in-memory `awaiting` set) is armed by the first `take`; it clears once every restored window reports, on a
  normal exit, or just before `update.install`. A launch that finds the mark still set moves the session aside as
  `layout.crashed.json` (copied if the rename is refused), clears `lastOpen`, and shows an error toast instead of
  reopening it. Three edge cases stay open, accepted limits in `open-items.md` §Q (*A crash after the restore report
  still loops*, *The breaker can trip without a crash* and *The crash breaker doesn't catch a webview-only
  crash*).
  - **Closed accepted limit (decision Q3):** a repository that crashes when opened by hand still costs two
    crashes before the breaker trips — the breaker covers restores only. No reopen trigger.
  - **Closed accepted limit (triage 2026-09-29):** the copy-fallback test (`a_refused_rename_copies_the_session_aside`)
    is Windows only — holding the file with read-only sharing blocks a rename but not a copy, which has no portable
    equivalent. The lock it guards against (an antivirus or backup tool) is a Windows case, and CI's Windows leg
    runs it. No reopen trigger.
- **`release.yml`'s macOS signing-order comment named 2.11.5 before a run confirmed it** (the CLI pin change's
  triage T1) — **closed 2026-09-28**: run 36391567783's *Verify the macOS signature* step passed at tauri-cli
  2.11.5, so the bundler still signs the `.app` before packing the `.app.tar.gz` and `.dmg`.
- **Only the AppImage's updater `.sig` is verified in CI** (triaged 2026-09-27, the AppImage plan's Triage L4) —
  **done 2026-10-01** (close-out Phase 1b, `docs/archive/plans/2026-09-30-phase-1b-plan.md`). The row as it stood: the
  Windows `.exe.sig` and the macOS `.app.tar.gz.sig` come straight from the bundler and nothing touches the files
  after signing, so the risk the AppImage check guards against doesn't apply. To extend it, run
  `.github/scripts/verify-updater-sig.py` on those legs too, and make it check the signed `version:` on every leg.
  Scheduled in close-out Phase 1b (row 2d), 2026-09-28.
  - **Closed 2026-10-01:** one `verify` job after `build` (no secrets, read-only; the plan's D2) runs the script on
    all three `.sig` files — the setup, the `.app.tar.gz` and the AppImage — against the shipped pubkey, and fails
    unless each trusted comment carries `version:` with the `version` job's output; `publish` needs it. Both dry
    runs (Release runs 36674994686 on `phase-1b` and 36753506004 on `main`) printed `OK` three times, each with
    `version:0.10.14`; smoke group BJ 4–5 (`docs/archive/walks/2026-09-30-phase-1b-walk.md`). Its first release
    run was v0.10.15's (36843045866): all three `.sig` carry `version:0.10.15`.
- **AC :761, the AppImage half** (`smoke-test-post-v1.md:761`) — **ticked 2026-10-01**, at the v0.10.15 release
  gate's AppImage half: the installed 0.10.14 AppImage updated in place to 0.10.15 and **restarted by itself**, the
  first update that can (`docs/archive/walks/2026-10-01-v0.10.15-release-gate-linux.md`). The `.deb` passed and
  `.rpm` was ruled covered earlier (T6, walked 2026-09-26, `docs/archive/walks/2026-09-26-group-ac-linux-walk.md`).
  The 0.10.13 and 0.10.14 release walks (2026-09-29) installed in place but neither restarted by itself, so the user
  held the tick for 2b's release, the first that can.
- **The AppImage opened a blank window on Ubuntu 26.04** (found in the AC :761 walk, 2026-09-26) — **closed
  2026-10-01**. Plan: `docs/archive/plans/2026-09-26-appimage-blank-window-plan.md`.
  - **Symptom:** WebKit's web process aborted with `Could not create default EGL display: EGL_BAD_PARAMETER`, and
    the window stayed blank. The published 0.10.11 and 0.10.12 AppImages were affected; the `.deb` rendered fine.
  - **Cause:** the AppImage is built on `ubuntu-22.04` and bundles its `libwayland-client` (1.20). The host's Mesa
    `libEGL_mesa` uses symbols from 1.23+, so every host with a Mesa that new was hit, not only 26.04. Moving the
    runner wouldn't have helped: 24.04 ships 1.22.
  - **Fix:** `release.yml` repacks the AppImage without `libwayland-client` (what the upstream AppImage excludelist
    drops), rewrites the runtime's `.digest_md5`, re-signs it and verifies the `.sig` against the shipped pubkey.
    `-server` stays: the bundled WebKit needs it. The release body told 0.10.12-or-earlier AppImage users to
    download by hand, since a blank window can't reach the in-app update. Merged in #18, 2026-09-27.
  - **Accepted limits** (still open, in `open-items.md` §Q, 2026-09-28): *AppImage fix untested on an
    Ubuntu 22.04 host and with the NVIDIA proprietary driver*; *AppImage always under XWayland; some GPUs need
    `WEBKIT_DISABLE_DMABUF_RENDERER=1`*.
  - **Left, now all done:**
    - a `workflow_dispatch` run — done 2026-09-27 (run 36257070680): the CI AppImage renders on Xvfb, and on this
      desktop with the variable;
    - the next release: an old AppImage with the `LD_PRELOAD` workaround updates to the fixed one — walked
      2026-09-29 for v0.10.13 (`docs/archive/walks/2026-09-29-appimage-release-walk.md`); size and cold start
      compared against the old one (triage U4): no clear gap;
    - the release after: the fixed one updates in place — walked 2026-09-29 for v0.10.14
      (`docs/archive/walks/2026-09-29-v0.10.14-release-gate-linux.md`), then 2026-10-01 for v0.10.15, which also
      restarted by itself (`docs/archive/walks/2026-10-01-v0.10.15-release-gate-linux.md`);
    - AC ticked 2026-10-01 (row above). `.rpm` is ruled covered by the `.deb` walk (2026-09-27): without `APPIMAGE`
      both take the Download… path (`update.rs:45-50`).
- **The tauri-cli 2.12.0 bump** (added 2026-09-28, the CLI pin plan's B-1 and B-3) — **closed 2026-10-05** by the Tauri
  2.12 change (`docs/archive/plans/2026-10-04-tauri-2.12-plan.md`), which took Dependabot #19 (npm) and #20 (cargo) by
  hand on one branch.
  - **The row as it stood:** 2.12.0 (bundler 2.10.0) came out 2026-09-26; the pin stayed on 2.11.5 until a plan
    checked it (the version binding, `--app-version`, `--locked`, a dispatch run), and re-derived the AppImage tool
    pins from the new bundler's source. `checks.yml`'s guard turned Dependabot's npm group PR red on the CLI bump;
    the `@dependabot ignore` fallback the row described was never applied.
  - **Closed by:** `release.yml` pins tauri-cli 2.12.1 (bundler 2.10.1), matching `@tauri-apps/cli` 2.12.1 in
    `package-lock.json`. *Pin the AppImage tools* holds four tools: linuxdeploy re-pinned to the fixed build
    `07333c6`, the gtk and gstreamer scripts dropped (the bundler embeds them). linuxdeploy `07333c6` excludes
    `libwayland-client` itself, so the AppImage repack and its re-sign are gone, and a new step fails the run if the
    library comes back. The release's dry run and the v0.10.19 gate prove the pipeline (the plan's Verify).
- ~~**ssh prompts the app can't answer well (found in the T4 review; measured 2026-09-27).**~~ Fixed 2026-10-06 on the
  `ssh-fail-fast` branch (`docs/archive/plans/2026-09-27-ssh-fail-fast-plan.md`), walked on Windows and Linux:
  `authFailed` now names its cause (a changed or untrusted host key, an ssh key not accepted, credentials needed or
  rejected) and what to do; a failed clone is classified the same way, showing the first `fatal:` line rather than
  "Cloning into…"; on Unix git runs in its own session (`setsid`), so a terminal launch no longer hangs ssh. No timeout
  on a stuck op stays an accepted limit, in `open-items.md` §Q (*No timeout on git ops*).

## Q. Accepted limits — the rows since closed

Accepted limits that had a reopen trigger (`open-items.md` §Q) and have since closed; the pointer at each origin
stays.

- **`requireSignedVersion` is off.** A signature with no version is still accepted, which leaves a downgrade bypass:
  serve an old, version-less signature. The threat is low, since the manifest is served from GitHub releases over
  HTTPS. From tauri-cli 2.11.5 on, every updater signature carries `version:`, and updater 2.12 rejects a signed
  version that doesn't match `latest.json`. Tracked from 2026-09-27; scheduled 2026-09-28. **Reopen:** its
  precondition holds — every artifact a `latest.json` can point at carries a version, true from the first release
  after the CLI pin change (2026-09-28). Then set it in `tauri.conf.json`: scheduled in close-out Phase 1b
  (2026-09-28). *From `open-items.md` §P.*
  - **Closed 2026-10-01** (close-out Phase 1b, `docs/archive/plans/2026-09-30-phase-1b-plan.md`; `f27dfef`):
    `tauri.conf.json` sets `"requireSignedVersion": true`, so the app refuses an update whose signature carries no
    version. Smoke group BJ 1–3 walked it on a local build (the plan's D4): a version-less 0.10.12 setup offered as
    0.10.14 was refused with the plugin's `MissingSignedVersion` text, then the published 0.10.14 installed. Both dry
    runs' `verify` job (Release runs 36674994686 and 36753506004) proved every `.sig` carries `version:`
    (`docs/archive/walks/2026-09-30-phase-1b-walk.md`). It shipped in v0.10.15, 2b's release (2026-10-01); the update
    from v0.10.15 to the next release is its first real check — passed 2026-10-03 in the v0.10.16 gate.
- **Q23: the details pane goes blank when another commit is selected.** Until the new commit's details arrive, the
  pane is empty instead of keeping the previous commit's on screen. P1-4's fix (`6a95389`) clears `detail` and
  `error` on a new commit id (`src/screens/RepoWindow/DetailsPane.tsx:170-173`, checked 2026-09-28); the blank was
  decided at P1-4 (`docs/archive/plans/2026-09-12-consolidated-findings.md`, `:47`, `:233`, `:520`). ("C6/Q23" in §I
  was a label collision: this Q23 was the second pass's C6, not the consolidated C6, `close_repo`.) Still in
  close-out Phase 2's table, *design needed*. **Reopen:** it flickers on the smoke walk. *From §I.*
  - **Closed 2026-10-01** (`ce34b92`, D8 (a), BK 7): the pane now renders the grid row's own fields (summary, author,
    date, SHA, parents) at once; only the body/committer/*signed* wait for the reply, which (like an error) shows only
    when it matches the selected oid.
- **`status.rs`: no `git status` command-line fallback for very large trees** (a v1 accepted limit). The fallback
  would be `git status --porcelain=v2 -z` behind a flag, only if libgit2 status proves slow on very large trees.
  Measured 2026-09-07: 1.5 s at 47k tracked files, 50 ms at 61k files on disk / 10.7k commits — that is the limit,
  and every watcher event pays it. (2026-09-07: the scans that looked like this were the stale stat cache, not the
  tree size.) Still measured in close-out Phase 3; if it measures fine, it stays here with the numbers added.
  **Reopen:** the `slow status` log line (≥ 250 ms) shows a real machine hitting it, or Phase 3's measurement crosses
  its threshold. *From §A.* (The repository's name, beside the 47k count, removed 2026-10-03 — Phase 3's R2.)
  - **Closed 2026-10-03** (close-out Phase 3, fix 3, `a369138`; smoke group BL 4): Phase 3's measurement crossed it.
    On `perf-synth` (100k files) libgit2's scan took 268 ms warm, twice per edit (its own index write raised a second
    scan), and 552 s with every file touched (~5.5 ms per stale file); `git status --porcelain=v2 -z` on the same tree
    199–208 ms and 5.92 s. Status now always runs through `git status --porcelain=v2 -z`, with no index lock (D-1), and
    a slow scan starts a background stat-cache repair. BL 4: warm 89 ms, once per edit; stale 4.79 s, then one 2.8 s
    repair. Its ceilings are new `open-items.md` §Q rows (the stale entries, fsmonitor's state, the repair's lock,
    scans before a repair).
- **`cancel_kills_long_running_process` can miss its 800 ms bound under load.** It failed once locally while two
  builds ran in parallel, passed alone (0.38 s) and in every run since; never seen in CI. Widening the bound would
  weaken what it proves. Accepted 2026-09-29. **Reopen:** it fails in CI — then widen the bound or retry it. *From
  close-out Phase 2a's gates.* It can also fail when git's port 9418 is already taken: its `git daemon` listens on
  that fixed port, and a WSL test run at the same time shares localhost ports (seen once in the 0.10.14 hotfix's
  per-commit gates; the retry passed). **Reopen:** that failure in CI — then give the daemon a free port.
  - **Closed 2026-10-02** (close-out Phase 3, Q21; `0c9608a`), fixed instead of widened: the branch's heavier tests
    made it flaky in the gates. The test now binds a free port for its `git daemon` and times only cancel → return
    (< 500 ms; the kill itself measured 3–11 ms).

## R. Added 2026-09-29 — close-out Phase 2a's change review: the rows since closed

- **Ctrl+Q does nothing on the start screen.** Quit was bound only in a repo window; on Windows and Linux the start
  screen (including a window whose last tab closed while others stayed open) had no Quit, only the window's ×. **Closed
  2026-10-01** (`25dfe4f`, D1(a), smoke group BK 1): a Ctrl+Q arm in `StartScreen`'s key handler calls the same
  `quitApp()`, armed even while a repository is opening, ignored while Clone or Settings is open. README's shortcuts
  table lists it (the *Both screens* row). *From `open-items.md` §R (the 2026-10-01 Phase 2b plan, row 1).*
- **macOS: an Option-typed character never reached a select's type-ahead.** Option arrives as `altKey` without
  `ctrlKey`, so `Input.tsx`'s Alt branch swallowed it (Phase 2a let only Windows' AltGr, Ctrl+Alt, through). **Fixed
  2026-10-04** for close-out Phase 5 (M4; `ef3711b`, pre-squash). Measured first on the Mac: Option+a gives `key` `å`,
  `code` `KeyA`, `altKey` true; Option+o `ø`, `KeyO`; Option+1 `¡`, `Digit1`. Now on macOS an Alt keydown with a
  one-character `key` and a non-digit `code` is type-ahead (`isMac()` in `src/lib/keys.ts`); Option+digit stays the
  History / Changes switch (D3), and Option+↓ still opens the list. Walked as smoke group BN 4 on the Mac (`ef1855d`;
  `docs/archive/walks/2026-10-04-phase-5-macos-walk.md`). Its accepted edges (Option+digit characters, Option+Space,
  ⌘+Option) are in §Z. *From `open-items.md` §R (Phase 2a's change review).*
- **Esc after a self-disabling control was unverified on WebKitGTK.** The Phase 2a fix (`Dialog.tsx`, a document
  `keydown` listener for Esc / Tab on `<body>`) rested on focus falling to `<body>` when the focused button
  disables itself; walked on WebView2 only (BH 4), not on WebKitGTK. **Verified 2026-10-06** (the Linux track's
  C+D walk, C1): on the Linux VM, Check now's `activeElement` goes BUTTON (disabled) → BODY within 30 ms, and a
  real Escape at +154 ms (target BODY) closes Settings by +300 ms; same result once the check has finished.
  `docs/archive/walks/2026-10-06-linux-track-c-d-walk.md`.

## S. Added 2026-09-29 — v0.10.13's AppImage release walk: the rows since closed

- **Launching the extracted image (`squashfs-root/AppRun`, no `APPIMAGE`) isn't scrubbed.** The 0.10.14 gate
  (`git_core::in_appimage`) needs `APPIMAGE`, which only the AppImage runtime sets, so an image unpacked with
  `--appimage-extract` and started through its `AppRun` passes the image's environment on as before. Dev-only.
  **Closed accepted limit** (triage T5 of `docs/archive/plans/2026-09-29-appimage-env-hotfix-plan.md`, 2026-09-29). No
  reopen trigger.
- **The AppImage's environment leaks into the processes it spawns; the post-update restart fails on Ubuntu 26.04.**
  The AppImage bundles 22.04's `libsystemd.so.0` (249) and its `AppRun` puts `$APPDIR/usr/lib` on
  `LD_LIBRARY_PATH`, which every child inherits. Ubuntu 26.04's `/usr/bin/env` (rust-coreutils 0.10.0, a backport
  installed on the VM 2026-09-29) needs `LIBSYSTEMD_254`, so Tauri's restart (it runs the new AppImage, whose
  `AppRun` is `#! /usr/bin/env bash`) dies: the app exits and nothing relaunches. The update itself is in place;
  launching the file by hand works. Reproduced on the VM; `cat` and `ls` fail the same way, `bash`, `dash`, `git`
  and `ssh` don't. Not a 0.10.13 regression (0.10.12 restarts the same way; it worked on 2026-09-26 before the
  backport). `.deb` / `.rpm` unaffected. **Scope checked on the VM 2026-09-29:** every HTTPS fetch, pull and push
  fails (the bundled `libnghttp2.so.14` shadows the one the host's `libcurl` needs); hooks that call coreutils
  fail and a `#!/usr/bin/env bash` hook can't start; a custom diff tool fails silently; git from a terminal and the
  `.deb` (0.10.11) pass. **Decided 2026-09-29: hotfix 0.10.14**, scrubbing the image's paths from the environment
  of every process the app starts — plan `docs/archive/plans/2026-09-29-appimage-env-hotfix-plan.md`. The restart is the
  *old* app's, so the fix helps only updates from 0.10.14 on.
  `docs/archive/walks/2026-09-29-appimage-release-walk.md` (`41025ce`).
  **Closed 2026-09-29:** fixed on `hotfix/0.10.14`; smoke group BI rows 1–8 walked green on the final build (Release
  run 36548652011, after two earlier builds; one unexplained crash-reporter entry at one quit, not reproduced), row 9
  on Windows (the later changes are Linux-only) — `docs/archive/walks/2026-09-29-group-bi-walk.md`. Ships in 0.10.14.
- **A failed commit's toast shows a hook's first output line, not why it failed.** When a hook refuses, git prints
  nothing of its own, and the toast showed stderr's first line. **Closed 2026-10-01** (close-out Phase 2b,
  `acbfae0`, D2(a), smoke group BK 2): `commit` now reports the last non-empty stderr line when there's no
  `fatal:` / `error:` one; merge and pull instead show git's own line (e.g. *Not committing merge…*), not the
  hook's last line, through `classify_failure`, which also catches a failing post-checkout hook (checkout, and
  `worktree add`) with *Checked out, but the post-checkout hook failed: …* instead of showing the success line as
  a failure. Triage T1 of the 0.10.14 hotfix plan. *From `open-items.md` §S (the 2026-10-01 Phase 2b plan,
  row 2).*
- **A custom tool that fails to start still says *Opened …*.** The tool was detached and its exit status never
  read. **Closed 2026-10-01** (close-out Phase 2b, `237d6d7`, D3(c)/D4(a)/D17; unit-tested; the Linux walk is in
  `open-items.md` §V): on unix, the first ~300 ms is watched for exit 126/127 (the shell's and loader's "couldn't
  start" codes), reported as *`<prog>` could not start (exit N) — check the tool's command in Settings*; a late
  exit (kdiff3 unsaved, Beyond Compare *files differ*) still can't be told apart, so it isn't reported. Windows is
  unchanged. The ~300 ms under the git2 lock, and the exits the check still misses, are accepted limits in
  `open-items.md` §Q. Triage T2 of the 0.10.14 hotfix plan. *From `open-items.md` §S (the 2026-10-01 Phase 2b
  plan, row 3).*

## T. Added 2026-09-29 — the 0.10.14 hotfix's change review: accepted in bulk, to be reviewed

Accepted as closed by the owner on 2026-09-29 without a one-by-one ruling, kept apart so they can be reviewed later
(open-items §S points here). From change review passes 1–6 of
`docs/archive/plans/2026-09-29-appimage-env-hotfix-plan.md`.

1. `open_on_host` with no launcher at all returns a NotFound error instead of the `open` crate's panic; the
   launcher list is never empty.
2. On Linux, *Open* on a broken symlink or an unreadable file now shows *could not open* (D12's check) instead of
   failing silently.
3. If the app's exit request fails, Tauri calls `process::exit` without an `Exit` event, so an AppImage doesn't
   relaunch after an update; the update is in place (already in the plan's step 4).
4. A user with no `XDG_DATA_DIRS` gets `/usr/share` alone in children (the hook's entry survives the scrub), which
   drops the spec default `/usr/local/share`.
5. If `APPDIR` can't be canonicalized, the gate is shut: no scrub, and *Download…* instead of *Install* — fails
   safe.
6. A contrived non-root `APPDIR` that contains the program (say `/tmp`) would scrub more than the image's entries.
7. Each spawn inside an AppImage snapshots the environment, canonicalizes `APPDIR` and checks `OWD` is a folder,
   blocking, on tokio workers too (the per-spawn check chosen when W1 was reverted).
8. One Windows clippy error at a squash-rehearsal step didn't reproduce on two re-runs (likely a build-folder race).
9. W3: a start folder deleted between the check and the spawn fails the spawn with *not found*.
10. W4 / W5: a relative tool path with a `/`, and relative `PATH` entries such as `.`, are resolved against the
    image's folder by the tool lookup but against `OWD` by the started tool.
11. W6: the tool lookup drops empty `PATH` entries even when the scrub leaves `PATH` alone — moot, AppRun always
    puts an image folder on it.
12. W7: `host_env`'s doc links to the private `start_dir`, which warns only under `cargo doc` (CI doesn't run it).
13. W8: tools start in `OWD`, not the repository (`git difftool` uses the worktree's top); no regression.
14. W9: the relaunch passes the old arguments as given; the app reads none.
15. No unit test of `host_env` checking the folder per spawn (it would set process variables); `start_dir` is
    tested and BI 4 walks it.
16. A user folder literally named `.mount_*` as `OWD` falls back to `/`.
17. BI 6's environment check on an app started through D-Bus proves nothing (it gets the session's); the strace
    line is the proof.
18. No test for the *What's new* button; *Download…* is tested and both call the same function.
19. The smoke control reads the app's start-up environment only; the image's paths are all there from the start.
20. Doc style: `clippy.toml` lines (TOML inline tables can't wrap), two close-out table rows and the two launch
    commands are over 120 characters; BI 5's label *Editor-less git*; close-out item 5's count of AppImage walks;
    the §S row's record line has no *Record:* lead-in (tidied when it moves); `tools.rs` line citations shift
    with the code (the dated-line-number convention).
21. A reviewer's claim that the Linux-only code had never compiled was wrong: the WSL gate built and tested it on
    every pass. No action.

## U. Added 2026-10-01 — close-out Phase 1b's change review: accepted, closed

Ruled one by one by the owner; detail in the *Triage* section of `docs/archive/plans/2026-09-30-phase-1b-plan.md`. (T2
and T7 were fixed; T3 is an open accepted limit, `open-items.md` §Q, *What the Release build still fetches unpinned*;
T10 is the sibling app's README comma, to be pushed there on the owner's word.)

- **T1** The `signing` environment lets admins bypass its approval (`can_admins_bypass: true`); the owner is the
  only admin and the only reviewer. Accepted 2026-10-01, no reopen trigger.
- **T4** `ssign`'s session token (about 30 minutes) is left on the Windows runner's disk; the `verify` job repeats
  `permissions: contents: read`; its `apt-get install python3-cryptography` is nearly a no-op on `ubuntu-latest`.
  Accepted 2026-10-01, no reopen trigger.
- **T5** The `verify` job stops at the first bad `.sig`, so a run with two names only the first. Accepted
  2026-10-01, no reopen trigger.
- **T6** Between pushing `main` (O5) and deleting the repo-level secrets (O8), the `release` skill's "not at repo
  level" was untrue, and `phase-1b` stayed in the environment's branch policy until O6; both temporary, and both
  ended 2026-10-01. Accepted 2026-10-01, no reopen trigger.
- **T8** By design: with `requireSignedVersion` on, a future walk can't update to a pre-0.10.13 manifest; a wrong
  argument count to `verify-updater-sig.py` prints a traceback; the script compares versions literally where the
  plugin uses semver; README › *Updating* doesn't mention the refusal of a version-less signature. Accepted
  2026-10-01, no reopen trigger.
- **T9** Cosmetic: the plan's Step 8 draft wording of the skill's step 5; long plan lines; one long walk-record
  line; rounded against exact leg times in walk row 4; the close-out plan's Phase 1b table kept as a snapshot.
  Accepted 2026-10-01, no reopen trigger.
- **T11** (the review after the squash) `90a0a71`'s comment on the `verify` job speaks of `requireSignedVersion` as
  on, though it is `f27dfef` that turns it on; the two shipped in one push. Accepted 2026-10-01, no reopen trigger.
- **The records commit's review** (2026-10-01): the close-out plan's Phase 1b section still points at open-items §Q
  for the `requireSignedVersion` row, now in this file's §Q (a dated snapshot, as T9); and the walk record is named
  2026-09-30 though its last rows are dated 2026-10-01 (it notes the UTC difference). Both accepted 2026-10-01, no
  reopen trigger. (The same review's other two leave-as-is items were fixed: open-items §Q's intro count and §B's
  unticked-line count.)

## V. Added 2026-10-01 — close-out Phase 2b: the rows since closed

- **The Stashes browser opened from Changes previewed History's commit, not the stash.** With a commit selected in
  History, switching to Changes and opening the Stashes browser (Ctrl+Shift+S) showed that commit's file list and
  diff — Apply / Pop / Drop acted on the stash above another commit's diff. Pre-existing on `main`, found in the
  BK walk. **Fixed 2026-10-01** for close-out Phase 2b (`6ec35b1`, D18 + D19, smoke group BK 9). `StashesDialog`
  now loads its own stash target, keyed on the preview's oid, skipping the load only when `diffStore` already
  holds that same stash. `diffStore.restore` also now bumps its request counters, so a reply still in flight
  during an outside tab switch can no longer land in the wrong tab's store or leave the first tab stuck on
  *loading*; the next loader (History's reload, the browser's next open) re-fetches it.
- **The `TempRepo` flake's case (b)** (`cli::runner::tests::editor_is_disabled`, `git init: … could not read
  (expected 55 bytes, read 32)` at `test_util.rs:46`, in Phase 2b's gates; the row is `open-items.md` §V, *A Windows
  flake inside `TempRepo` test helpers*) — **closed 2026-10-03** for close-out Phase 3 (C-5; `e3ba77e`). Cause,
  reasoned from the error text, not reproduced: the global-config test pointed libgit2's process-wide config search
  path at a temp folder while other lib tests ran. That test moved into its own test binary
  (`crates/git-core/tests/global_config.rs`), which also redirects libgit2's ProgramData config level, so a
  machine-wide `C:\ProgramData\Git\config` can't leak into it (C-9; not part of the cause). **Reopen:** the
  `git init … expected N bytes` error seen again. Case (a), the CRLF `add_path` error, stays open there.
- **Row 3's unix tool-start walk.** `~/t4-no-such-tool "$LOCAL" "$REMOTE"` on Linux, an error toast within
  ~300 ms (exit 127, caught by D3(c)). **Walked 2026-10-06** (the Linux track's C+D walk, D1) PASS: toast at
  +52 ms, "Couldn't open the diff tool" / "~/t4-no-such-tool could not start (exit 127) — check the tool's
  command in Settings". Found on the way: the tool list is read only at app start, not while running — moved to
  `open-items.md` §Q (*External diff/merge tools set outside the app are read only at startup*).
  `docs/archive/walks/2026-10-06-linux-track-c-d-walk.md`.
- **Row 11's non-UTF-8 walk.** `touch $'caf\xe9.txt'; git add .` on Linux, then the Files tab (working tree and at
  a commit): the file should stay out of both listings, with the *N files … aren't shown* note. **Walked
  2026-10-06** (the Linux track's C+D walk, D2) PASS at a commit: header "310 files", no `caf` row, banner "1 file
  with a name that isn't UTF-8 isn't shown". The working-tree half isn't reachable in this UI: `ChangedFileList`
  is used only in `DetailsPane` and `DiffDialog`, the working-tree row opens Changes (no Files tab), and no UI
  path produces a `workdir` `DiffTarget` — `treeTargetOf`'s working-tree branch looks unreachable (read from code,
  not exhaustive; left as a remark, not a finding). Owner's ruling: closed at the commit.
  `docs/archive/walks/2026-10-06-linux-track-c-d-walk.md`.
- **Stashes browser's left column clips text (triage E2).** The left (list) column could show *"No changes"*
  clipped to *"Nc"*, with a horizontal scrollbar, instead of wrapping or eliding. Found in the BK walk, 2026-10-01.
  **Fixed 2026-10-04** for close-out Phase 4 Stage B (row 66, `docs/archive/plans/2026-10-03-phase-4-plan.md`): `.side`
  takes `flex: 1; min-width: 0` (`StashesDialog.module.css:2`). Walked 2026-10-04 as smoke BM 4. Moved here
  2026-10-04.

The triage's accepted items, ruled one by one by the owner 2026-10-01 (`docs/archive/plans/2026-10-01-phase-2b-plan.md`,
*Triage*). No reopen trigger on any of these.

- **A2 (row 7's path-filter blame fix).** The fix for `blameAt`'s reload race is proven by unit tests only; the
  in-app walk (BK 6) predates the fix. Accepted as sufficient proof.
- **A4 (a redundant `tier` dependency).** `Toolbar.tsx`'s measuring effect still lists `tier` in its dependency
  array though it no longer needs it. Left as is.
- **B2 (the non-UTF-8 skip count includes deleted files).** A non-UTF-8 index entry is counted in `skipped` even
  when it's gone from disk. Harmless; accepted.
- **B3 (a post-checkout hook's own `error:` / `fatal:` line shows without the "Checked out" wording).** When the hook
  itself prints an `error:` or `fatal:` line, `classify_failure` shows that line as-is, without the *Checked out, but
  the post-checkout hook failed* prefix row 2's fix adds when the output has no `error:` / `fatal:` line. Accepted, per
  the plan's own condition.
- **C1 (a blame reveal from A to B back to A within one loop can lose its seed).** A narrow sequencing case in the
  row-7 fix; accepted.
- **C2 (a drop-in tab's late `diffStore` reply lands tagged with the old `repoId`).** Harmless — the browser's
  guard and History's reload both see the mismatched `repoId` and reload. Accepted (documented in row 16's D19).
- **E4 (a freshly opened repository selects the grid's top row, not HEAD).** Pre-existing behaviour, not a regression;
  seen in the BK walk. Accepted.
- **F3 (a tab's × near its centre on a narrow tab closed it under automation).** Not an app fault as found — the CDP
  driver clicked the centre of a 45px tab, which is the × hit area at that width; maybe worth a wider hit area later,
  but not a bug. Accepted.
- **F4 (a Vite build-size warning).** `index-*.js` is 668 kB, over Vite's 500 kB chunk-size warning; checked
  pre-existing, not from this branch. Accepted.

## W. Added 2026-10-01 — the smoke helpers' change review: accepted, closed

Ruled one by one by the owner; detail in the *Triage* section of `docs/archive/plans/2026-10-01-smoke-helpers-plan.md`
(T1, T2, T5, T6, T7 and, from passes 3–6, R1–R4, S1–S4, U1, U3, V1 and V2 were fixed).

- **T3** `docs/reflow.mjs` refuses some ranges that would be safe to rewrap: a multi-line quote, a bare backtick run
  in prose. A refusal writes nothing and names the line. Accepted 2026-10-01, no reopen trigger. (A line merely
  starting with `--` / `==` was refused too until R4 narrowed the guard.)
- **T4** `docs/reflow.mjs` splits words on any whitespace, so a non-breaking space outside a code span becomes a
  plain space; no doc has one. Accepted 2026-10-01, no reopen trigger.
- **Y1** `docs/reflow.mjs`'s hand-wrapped header comment has an uneven right edge (within 120). Accepted 2026-10-01,
  no reopen trigger.

## X. Added 2026-10-03 — close-out Phase 3: fixed, recorded and accepted, closed

Ruled by the owner 2026-10-02 and 2026-10-03; detail in `docs/archive/plans/2026-10-01-phase-3-plan.md` (*Stage B
decisions*). The rows Phase 3 closed are in §A, §I, §M, §Q and §V above, its open rows in `open-items.md` §Q and §X.
The walk records are `docs/archive/walks/2026-10-01-phase-3-measure.md` and
`docs/archive/walks/2026-10-03-group-bl-walk.md`. No reopen trigger on any of these.

- **T7, closing a repository stops its status scan** — **fixed 2026-10-02** (`a369138`, with fix 3; smoke group BL 8,
  BL 10, BL 11). Found in Stage A: five quick reopens of a stale `perf-synth` left five scans running for up to 20
  minutes. `drop_repo` cancels the handle's token, and the scan kills its process tree (a job object on Windows, the
  process group on Unix) and returns `Cancelled`. Walked on Windows (the scan gone 5 ms after `closed repo`), Linux
  and macOS, with no `index.lock` left.
- **L9** T7's kill on Windows also ends an `fsmonitor--daemon` the scan started; git restarts it on the next query.
  Accepted 2026-10-02.
- **Q12, the commit panel's external diff tool and diff header take the old path for staged renames only** — **fixed
  2026-10-02** (`f3cc948`, with fix 2; BL 4). An unstaged-list row of a staged rename edited on disk (`RM`) sent the
  old name, which the index no longer holds, so the tool's left side was empty.
- **Q13** the row label keeps `old → new` in both lists (`FilesColumn.tsx:540`), while Q12's header shows the plain
  path. Accepted 2026-10-02.
- **Recorded behavior changes** (status through git, fix 3, and fix 2):
  - B2 + D-2: a working-tree rename shows as a deletion plus an untracked file, as `git status` shows it, with
    matching line counts (the unstaged diff no longer pairs untracked files); a staged rename is still one row.
  - Intent-to-add (`git add -N`): reads as working-tree Added (before: a staged empty Added plus an unstaged
    Modified). Its Discard and a deleted one are an open row, `open-items.md` §X.
  - Q14: an untracked nested repository (`? x/`) reads as a submodule; its row skips Discard with the submodule note,
    and the stash dialog shows its nested-repository note.
  - Status needs the git executable: without it Changes shows an error where libgit2 worked (the start screen already
    reports *Git executable not found*).
  - D-5 and D-11 are backend-only (no untracked pairing for the `Workdir` target, which no screen uses): no visible
    change.
- **States where git's answer replaces libgit2's** (measured by review pass 18; git's lines for the staged symlink
  rename and the submodule move by passes 30 and 32; libgit2 not pairing them read from `diff_tform.c:561-562`):
  - a staged symlink rename and a staged submodule move: git pairs them, libgit2 didn't (L6, Q19);
  - sparse-checkout / skip-worktree files missing from disk: libgit2 listed each as an unstaged deletion, git lists
    nothing — the largest visible change;
  - clean filter drivers such as git-lfs: libgit2 showed a touched file Modified, git shows it clean;
  - `submodule.<name>.ignore` in `.git/config`: git honors it, libgit2 only `.gitmodules`';
  - a conflicted gitlink: libgit2 added an untracked `sub/` row, git doesn't;
  - a tracked file replaced by a nested repository: git shows one `.T` submodule row with commits, `.D` only without;
    libgit2 showed `.D` + `? n/`;
  - two index entries differing only by case on a case-insensitive file system: libgit2 added a Deleted row for the
    second.
- **Stage A's own calls, A1–A6 and A8–A12** (A7 is fix T7, above), accepted 2026-10-02:
  - A1: refs moved with `update-ref` instead of a fetch (the in-app Fetch untimed).
  - A2: LFS smudge skipped on the real-repo copies.
  - A3: row 6b's in-app paint not timed.
  - A4: the Changes tree timed through the *Show as tree* toggle, not Refresh.
  - A5: a reviewer's claim that the tree-mode preference is shared across profiles, rejected (`smoke-launch.ps1`
    isolates the profile).
  - A6: the vitest timing file dropped; pure timings taken in the app.
  - A8: row 1's toast → sidebar timer not taken on real repo B (its refs read stands in).
  - A9: row 2's partial samples.
  - A10: Windows Defender's share of the stale scan not measured (`git status` under the same Defender: 5.9 s).
  - A11: 6a's revisit at 245 ms, a close call, covered by fix 6a and re-timed in BL 7 (28 ms).
  - A12: ~25 reviewer confirmations from Stage A's plan review passes 1–14, recorded as one line.
- **The 17 design calls** from Stage B's plan review passes (the `REFRESH_AFTER` value, the 16-oid cap, the
  one-revwalk X1 check and the rest), accepted as written 2026-10-02.
- **C-3** a refs read running at a tab's close finishes after it; its result is dropped by the repo-id check
  (`repoStore.ts:379`). Accepted 2026-10-03.
- **C-4, the idle frame rate**, raised as a possible Phase 3 regression: on the owner's desktop the BL walk's first
  build (`bf75367`) drew ~175 frames/s and the re-walk's (`420b545`) ~75, both Phase 3 builds. On the Windows VM (a 60
  Hz display) `main` (`cb3c9e3`) drew 63 fps and Phase 3 (`8246a97`) 60 fps (locked to the display), with no stalls.
  Recorded and closed 2026-10-03; the commit's own time is an `open-items.md` §Q row.
- **C-6** the implementers' deviations: lazy remote lookups in 1a, the parent-closure test oracle in 1b, the dropped
  discard hint, the generic gate, the scan's own repo handle, the cancel token in the gate, 6a serving the Changes
  tree too, `MAX_OPS` kept beside the 25k cap. Accepted 2026-10-03.
- **C-7** change review pass 3's 13 judged-fine items: output-drain edge cases, the scan's own repo handle, dock-cap
  edges, the fsmonitor and macOS-path edge rules, test cosmetics. Accepted 2026-10-03.
- **C-8** change review passes 4–5's four: the repair back-off per handle; unstaging a hinted rename's lines; macOS's
  `.git/fsmonitor--daemon.ipc` socket, which `classify`'s rule doesn't match (walked 2026-10-03 on the Mac, BL 11: 2
  scans and 2 refs reads in the first 10 s, none in the next 52 s); and the Unix kill test in a container whose PID 1
  doesn't reap, where the killed `sleep` would stay a zombie. Accepted 2026-10-03.

## Y. Added 2026-10-04 — close-out Phase 4: the accepted rows

**B3** (`docs/archive/plans/2026-10-03-phase-4-plan.md`, Stage B decisions), the owner, 2026-10-03: one closed-accepted
entry for the *Rulings* section's accepted rows, rather than the plan as the only record. No reopen trigger on any of
these.

- **Rows 5, 15, 18, 21, 22, 23, 25, 26, 28, 32, 40, 45** (the Start screen's dark version text colour; History ·
  1280's persisted splitter top; Changes · 1000's and History · 1000's column widths and details-pane top, carried
  across width tiers; Changes · 1000's clipped summary overflow; History · 720's details-pane left column width and
  file-list header wording; the Overflow menu's top offset and its highlighted item; the dock's bordered git input;
  and the Stash preview's metadata, On / Date only, with the pane scrolling instead) — accepted as the app's
  behaviour, the canvas left as drawn. Detail and the per-row findings are in the plan's *Results* table and
  *Rulings* section (B3).

### Stage B change review, accepted 2026-10-04 (closed)

- The ⋯ tooltip reads "Commit options" (message history isn't folded).
- The 3 px diff loading bar lies on the conflict strip's 4 px top padding.
- The folded commit options close again when the width tier changes (the options' values survive).
- Opening ⋯ at 720 scrolls ⋯ and Commit below the 200 px pane (B4).
- The Commit, Diff and Stashes dialogs clip instead of scrolling at very small window sizes (each pane scrolls
  itself).
- The conflict strip has no arrow-key navigation, like the app's other two toolbars.
- Where the plan and the app disagreed the canvas drew the app (palette groups/labels, tight toolbar widths, merge
  placeholder quotes, tree toggle position, pinned pin, Path help, toast Pull).
- ChangesMerge's columns 320 / 340 as Changes · 1280.
- The Settings board's Merge tool Save row below the 900 fold (the app's scroll not measured).
- The 1280 canvas toolbar keeps search 200 / 160 against the app's 240, and its icon buttons give 2 px each to the
  150 filter.
- The docs call the Restore conflict case (a staged file still holding markers) "conflicted".
- The screens/ Empty repository mini's toolbar Commit counts its own 3 changes (was 0), and the root Direction B and C
  boards' Commit badge reads 6 (was 4), matching their working-tree rows.
- The low-fi root Direction B and C boards overlap text at 640 px wide ("REMOTES" under "origin", the branch name
  wrapping), both boards' sidebars render sideways, and the first commit's subject wraps into the working-tree row;
  they predate Stage B and aren't the reference set.
- The screens/ cherry-pick and Empty repository minis take the app's 180 px minimum sidebar, so their working-tree
  subjects show whole; their sidebar labels clip a little more ("diff-vie…"), as the app's do at 180.

## Z. Added 2026-10-04 — close-out Phase 5: fixed, walked and accepted, closed

Ruled by the owner 2026-10-04; detail in `docs/archive/plans/2026-10-04-phase-5-plan.md` (*Decisions*, D1–D11) and the
walk record `docs/archive/walks/2026-10-04-phase-5-macos-walk.md` (*Triage*). The T-numbers here are Phase 5's own
triage rows, not the 2026-09-26 Linux menu-focus plan's T12 / T21. Hashes are pre-squash commits of `phase-5`. The
Option type-ahead fix (M4) is in §R above; Phase 5's open rows are in `open-items.md` §Q and §Z. No reopen trigger on
any of these.

**Fixed and walked** (smoke group BN, on the Mac and the Windows VM):
- **D6, one rule for every menu's keyboard mark — and the Linux plan's T12** — **fixed 2026-10-04** (`ef3711b`; BN 1–3).
  T12: a submenu opened by a click on a row still carrying the keyboard mark opened marked. Measured on `a6a7a76`: on
  Windows the first row came up marked, so it wasn't WebKit's; on the Mac the click dropped the focus to `<body>`
  instead (D10, below). `openedByKey()` counted a marked opener as a keyboard open; dropdowns and submenus now ask
  `lastInputWasKey()` alone, as context menus have since Phase 2b. So a toolbar button reached with Tab and then clicked
  opens its menu unmarked, reversing Phase 2b D5's "the dropdown keeps its opener rule".
- **D7, a select opened by a click takes the focus** — **fixed 2026-10-04** (`c38c750` + fixup `ef1855d`; BN 5). Found
  in the Mac walk (M1): WebKit gives a clicked button no focus, so a select the pointer opened got no keys and didn't
  close on an outside click. The trigger focuses itself in its click handler, and its mousedown is prevented so WebKit
  doesn't blur and close an open list first.
- **D10, a click, → or Enter on a submenu row the hover opened takes the focus in** — **fixed 2026-10-04** (`62d3bc5`;
  BN 6, by hand on the Mac). Found by D9's event logs: a real mouse rests on the row past the 150 ms hover grace, so the
  panel is open before the click; the click changed nothing, and on macOS the press had already dropped the focus to
  `<body>` (15 of 15 with the owner's mouse). `openPanel` now focuses the first row itself when the panel is already
  open.
- **D11, the submenu's "take the focus" flag is spent once used** — **fixed 2026-10-04** (`e8b78d2`, a fixup of
  `62d3bc5`; BN 6's last part). From change review pass 7, older than Phase 5: the flag was never cleared, so a later
  reopen by hover pulled the focus into the panel. The open/close effect clears it.
- **T10 / T11, a torn-off window opened off the screen** — **fixed 2026-10-04** (`4f493ef` + fixup `cac41ed`; BN 8).
  Found in the Mac walk (M1), each once: dropped near the bottom-right corner, the tab left its strip and no window
  showed (it came back after ⌘Q); a torn-off window opened at the drop point at the full 1280 × 800, mostly off the
  screen. The new window is now moved, and shrunk if bigger, into the work area of the screen under the drop point.
  Walked on the Mac and Windows; the shrink case on Windows only, a second display on neither.
- **T13, the output dock couldn't open before a command had run** — **fixed 2026-10-04** (`01930d2`; BN 7), against the
  recommendation to accept it. Its chevron was disabled until an op produced output, which also kept the dock's git
  prompt out of reach.
- **T6, `src/README.md`'s `keys.ts` line omitted `ctrlOrCmd` and `folderKey`** (older than Phase 5; M4 added `isMac`) —
  **fixed 2026-10-04** (`69f0ca1`, a fixup of `ef3711b`).
- **T18, the splitter count** — the Linux rendering row said "five splitters", but Unstaged / Staged isn't one;
  `open-items.md` §B now names them (`1afa0cb`).

**Accepted and closed:**
- **T2** Option+digit characters (¡ ™ £ ¢ ∞ § ¶ • ª º) are never type-ahead on macOS, even in dialogs where no view
  switch runs: D3's cost, so Option+1 / Option+2 keep switching the view.
- **T3** Option+Space adds U+00A0 to the type-ahead buffer on macOS; it matches nothing.
- **T4** ⌘+Option+letter now clears the type-ahead buffer instead of returning early; harmless.
- **T8** The Windows smoke profile follows the OS theme, since localStorage is private to the WebView2 profile:
  expected, not a bug. `smoke-cdp.md` says so (`1afa0cb`).
- **T12** History's grid / details and commit-details splits come back at their defaults after Changes → History (the
  sidebar and the side column keep theirs): the splits aren't stored. `smoke-cdp.md` no longer lists splitter sizes in
  localStorage (`1afa0cb`).
- **T16** A drag onto another window whose tab strip was hidden (one tab) did nothing; not repeated. By design: a
  window's only tab can't be torn off (smoke `:1659`), and adoption is Windows-only (D1, `open-items.md` §Q).
- **T17** An unnamed, hidden 500 × 500 window exists from launch on macOS, in every run; not from this repository's
  code. Noted in the walk record.
- **T19** Since D7's prevented mousedown, a field focused before blurs at the click, not at the mousedown; a press on a
  select dragged off and released elsewhere leaves the focus in the old field.
- **T20** Clicking a select no longer clears a text selection elsewhere (e.g. selected diff text).
- **T21** On Chromium the select's trigger may match `:focus-visible` after Tab then a click; nothing renders
  differently (the CSS cascade; reasoned).
- **T23** `cliclick`'s artifacts on the Mac: a lost mouseup, a missed pointerdown, a swallowed first click after opening
  Settings, clicks under 0.6 s apart paired; a real mouse never lost a click (D9's brief 4). Noted in the walk record's
  harness notes.
- **T25** One Repository › recents click did nothing, once, on the Mac (`cac41ed`); likely T23's swallowed first click.
- **T28** On WebKitGTK a menu's first item opened by a click matches `:focus-visible` (not on Windows), and nothing is
  drawn: the menu's highlight keys on `[data-kbd]:focus` alone. Menu CSS must keep keying on `data-kbd`, not
  `:focus-visible`. Measured on the Linux VM (`1e58f7c`, BN 1).

## AA. Added 2026-10-05 — Tauri 2.12 triage

Ruled by the owner 2026-10-05, after the group BO walks and its round 2 (BO 11–13); detail in
`docs/archive/plans/2026-10-04-tauri-2.12-plan.md` ("Triage (2026-10-05) and its fixes") and
`docs/archive/walks/2026-10-05-group-bo-walk.md`. Numbers are the running triage list's; R-numbers are round 2's.
No reopen trigger on any of these.

**Fixed:**
- **R6, a second launch with every window minimized opened at the minimum size, not the default size** — fixed
  `701ccf5`. With every window minimized there is no cascade reference, and the size was read from the minimized
  `main`, which reads near zero; a minimized `main` is now skipped and the builder's default size (800 × 600) used,
  as when `main` is gone.

**Accepted and closed (round 1):**
- **#13** Mac `cliclick c:` jumping after keyboard input twice misbehaved in BN 1 (no menu / first item marked);
  clean with `m:` first; likely the driver, unproven.
- **#17** BO 8: whether OK on the "is running" box closed the app through Restart Manager or a plain kill can't be
  told from the walk (the log is buffered, no exit line); the app saved its state on exit either way.
- **#18** BO 8: a pre-existing OneDrive desktop `T4 Git UI.lnk` was rewritten by the setup's passive (`/P`) runs.
- **#21** tao 0.37.1's `set_visible` focus change: the app sets no `with_focused(false)`.
- **#22** `opener`'s `Error::Win32Error` type change: the app doesn't use it.
- **#23** VC-runtime bundling, new in this bump but opt-in, stays off.
- **#24** `libpipewire`, newly excluded by linuxdeploy: 0.10.18 bundles none anyway.
- **#25** `npm update`'s `save` setting wasn't set; `package.json` is unchanged.
- **#26** The local AppImage built on 26.04 takes `plugin-appimage` and the `linuxdeploy` runtime unpinned from
  `continuous` — fine for a walk build.
- **#27** Offering the digest check inside D7 instead of at triage (pass 9 nit 4): not taken; superseded by #37's
  fix (the dry run's `--check`).
- **#28** 0.10.8 shares the app's identifier and may have run its own launch update check during BO 9; the store
  was restored after.
- **#30** Ragged wraps in the plan at lines 49, 81, 111, 116, 197, 313, 317 (render fine).
- **#31** A plan row named two ways ("The tauri-cli 2.12.0 bump" at l.9 vs. "tauri-cli 2.12.0 bump" at l.240), the
  same row.
- **#32** The coder changed the plan's Status to "Final" and wrote "gates ran" before they ran (they then passed).
- **#33** `npm update` took newer non-Tauri packages too: `@types/node` 26.6.4, `jsdom` 30.1.2 (transitive
  `data-urls` 7→8, `tr46` 6→7 majors), `lucide-react` 1.52.0, `react-resizable-panels` 4.14.2, `vite` 8.3.2,
  `vitest` 5.0.3; `why-is-node-running` 3.2.1 stayed below 3.2.2 (vitest pins it).
- **#34** The AppDir check hardcodes the product name "T4 Git UI": a rename would fail it loudly, not silently.
- **#35** `npm run build`'s Vite 500 kB chunk warning, not compared against `main`.
- **#36** `main.rs`'s test is near-tautological (`then_some`), as the plan asked for.
- **#39** N5's unmeasured case: a Linux `user-dirs.dirs` naming a deleted Downloads folder — GTK's own fallback not
  tried (the Mac falls back to home).
- **#40** `open-items-done.md` §P closes the tauri-cli 2.12.0 bump row before the push, the dry run or the
  release — left as is.

**N6's two accepted limits (its design, from the plan's Records paragraph):**
- A move in the last ~300 ms before Quit is lost (the settle timer's window).
- A window quit in full screen comes back windowed, at its last normal rect.

**Accepted and closed (round 2):**
- **R2** The cascade from a maximized window on Windows lands with a visible offset of 23 px across / 16 px down,
  not the full 32 (an 8 px invisible border plus a shrink to the work area). Measured in BO 12.4.
- **R3** The restore/cascade unit tests cover the helper functions, not the Tauri wiring around them; the walks
  (BO 11, BO 12) cover the wiring.
- **R4** A non-finite rect size (only reachable from a 0 scale) makes `read_layouts` drop the whole session, not
  just the bad entry.
- **R5** `runtime-wry`'s `rx.recv().unwrap()` (`lib.rs:2647`) could panic the single-instance callback thread if a
  second launch races the event loop's exit — upstream, not this app's code.
- **R7** The centre lookup used for `screen_at` takes the logical width on Windows, so a point can read nearer the
  top-left than the real centre above 100% scale; always still inside the right monitor.
- **R8** `screen_at`'s fallback, when a rect's point is off every monitor, is `main`'s monitor, not the reference
  window's.
- **R9** `AppState::moves` (N6's per-window settle-timer generation count) is never pruned: one `u64` per window
  label per session.
- **R10** N9's `resolve_dest` edge cases: `""` resolves to home, `"/"` to root, and a non-UTF-8 destination is
  refused.
- **R11** `main.rs` doesn't clear a stale inherited `T4_HOST_*` variable; `host_env` still strips the two names
  from a child it starts itself.
- **R13** WebKit's own helper processes (`WebKitWebProcess`, `WebKitNetworkProcess`) carry `T4_HOST_*`, since
  WebKit spawns them itself, not through `host_env`.
- **R16** Windows system-menu mode (a lone Alt tap, or a window's system menu left open) holds a second launch's
  new window hidden and its `WM_CLOSE` unanswered until the mode ends — the standard Win32 modal loop, predating
  2.12 (diagnosed as BO 12.2's "hang", see the walk record).

**Accepted and closed (the v0.10.19 gate, `docs/archive/walks/2026-10-05-v0.10.19-release-gate-linux.md`):**
- **G1** A new stderr line after the update, "A connection to the bus can't be made" (source not identified, likely
  `atk-bridge` under the private bus): harness noise.
- **G2** The editor opened on Xvfb instead of the real desktop, unlike the v0.10.18 gate: a harness difference
  between the two runs, cause not traced.

## AB. Added 2026-10-06 — ssh fail-fast: accepted, closed

Ruled by the owner 2026-10-06, in the `ssh-fail-fast` triage (`docs/archive/plans/2026-09-27-ssh-fail-fast-plan.md`,
"Execution and rulings"). No reopen trigger on any of these.

- **T2** The Clone dialog's own frontend-built preview (and the "$ git clone …" line) shows the typed password —
  the user's own input, also visible in the URL field.
- **T3** `display_cmd` shortens any URL-like argument carrying userinfo, not just a clone URL (e.g. a commit
  message containing a URL with a username).
- **T4** An unescaped `/` in a URL's password isn't stripped by `redact_url`.
- **T5** `GitError::AuthFailed`'s message is the bare cause, clone-only today (any non-clone command returning it
  would toast the raw cause word, such as "hostKey").
- **T6** Ops reporting through `cli_failure` (rebase -i, checkout -b, worktree remove, tag -a) keep the plain
  "authentication failed", with no cause.
- **T7** Other spawns via `host_command` (`git --version`, `history.rs`, tools, `conflict.rs`) get no `setsid`;
  believed not to reach ssh.
- **T9** The Rust test uses hand-written stderr lines, and an abbreviated/rebuilt changed-host-key banner (not
  captured from a real sshd).
- **T12** The reviewers' and coder's "fine" list across review passes 1–4: test row counts; rustfmt reformatting
  untouched variants; README line drift; a rustc OOM that passed on rerun (toolchain, not code); the `stage.rs`
  quoting side effect from switching to `display_cmd`; git's own ssh `-G` probe also hitting the stub (harmless);
  a cancelled GCM dialog reading as `NoCredentials` (an accepted limit); and a tester's own mangled-path warning.
- **The parent-folder ruling:** a failed clone leaves an empty parent folder that git created, when the chosen
  parent didn't exist before.

## AC. Added 2026-10-06 — the restore hang's close-out and the v0.10.20 gate: closed

Ruled by the owner 2026-10-06, in the triage after the records' review
(`docs/archive/walks/2026-10-06-restore-hang-and-az-rewalk.md`,
`docs/archive/walks/2026-10-06-v0.10.20-release-gate.md` and its `-linux` record). No reopen trigger on any of these.

- **Updater 2.13's install path (the install half of the §Q row, D6 (a) of the Tauri 2.12 plan).** Proven at the
  v0.10.20 gate: 0.10.19's own updater (tauri-plugin-updater 2.13) installed 0.10.20 on Windows, macOS and the Linux
  AppImage, each restarting by itself. The row's other half, N6's Windows update-path persist, stays in
  `open-items.md` §Q for the v0.10.21 gate.
- **The §Q row "the breaker can trip without a crash"** dropped its reopen trigger "the §O fix lands (re-check)": no
  fix is coming. Its other trigger stays.
- **Bare file-name mentions of the restore plan** in three archived plans (the triage plan, the pr18 fix-batch and
  pr18-windows plans) carry no path to rewrite; left as history.
- **AZ 6 on Linux: the menu opened on the grid's last visible row** wasn't walked (that row held other refs); the
  long-branch row in a 560 px window stood in, and the menu still moved up.
- **The stall wasn't checked on native Wayland** (no input tool on the VM) **or on desktops other than GNOME**;
  §Q's T26 reopen trigger covers it.
- **The v0.10.20 Linux gate's ssh check didn't run "no key loaded at all"**: unloading the key would change the VM
  user's agent session. The unit tests and the ssh fail-fast walks cover `noCredentials`.
- **The archived restore plan's body still reads pending in places** (its Status, the T7/T17/T19/T20/T23 rows,
  Order items 4–5); its status line and Outcome section say done.
- **T27's reopen trigger ("a walk under a window manager measures it") is now reachable** with openbox; nothing has
  fired. No action.
- **The plan's Outcome calls "0 hangs in 50 launches" superseded**, though job 4's 0 of 50 restores literally meets
  it. Wording only.
- **Review "fine" items:** the macOS gate record names only this repository's tab; the release-run facts (run ids,
  the Actions incident, assets, signatures) come from the session's own `gh` queries, not the VMs' reports.
