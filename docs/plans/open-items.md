# Plan: after v1 — open items (t4-git-ui)

_Written 2026-09-02, the day after v1 was accepted. This is the one list of what is still open;
it folds together the v1 plan's "Known gaps", the 2026-09-01 codebase review's deferred rows and
the README's "Next" line (review item H4). Nothing here is scheduled yet — pick from it._

_Done, fixed, walked and closed rows live in `open-items-done.md` (split 2026-09-24), under the same
section letters — a letter with nothing open left (§D, §F, §G, §K) is only there. When a row here is
done, move it there._

## A. Performance — measure before touching
- **`reachers` merged-badge walk** (2026-09-02 review P1): the merged computation walks every commit
  newer than the *oldest* tip — remote branches included — under the git2 mutex, and reruns whenever
  any tip oid changes (every commit, fetch, checkout); one ancient `origin/maint`-style branch
  pushes the bound to nearly all of history. Measured 2026-09-07: ~400 ms on a synthetic 100k-commit
  / 330-branch repository, and it no longer holds the open spinner (labels come from
  `refs::label_snapshot`, which skips it). Cap the walk, or reuse the previous result for tips whose
  oids did not change — but read the open timings on the laptop first (`opened repo`, `refs read`,
  `labels computed`, `walk complete`, `slow status` in the app log).
- **Hunk / line diff rebuilds** (2026-09-03 review P1): every hunk / line stage, unstage and discard
  rebuilds the file's diff with `max_lines: usize::MAX`, and may build the whole-repo diff a second
  time for a path that looks added / deleted — discarding twenty hunks one by one is twenty of them
  under the git2 mutex. Cache the rebuilt `FileDiff` per (path, target, context) for a burst, or
  accept a hunk list in one call. Measure first.
- **Virtualized output dock** (review P5): the dock renders up to 50 ops × 5000 lines as plain
  DOM. Virtualize only if a long-running op's output is visibly slow to scroll.
- `status.rs` `git status --porcelain=v2 -z` fallback behind a flag, only if libgit2 status proves
  slow on very large trees (v1 accepted limit). Measured 2026-09-07: 1.5 s at 47k tracked files
  (AutoEq), 50 ms at 61k files on disk / 10.7k commits — that is the limit, and every watcher event
  pays it. The `slow status` log line (≥ 250 ms) says whether a real machine hits it. (2026-09-07: the
  scans that looked like this were the stale stat cache, not the tree size.)

## B. Verification and release
- **Smoke steps no CDP walk can reach** (this machine, by hand). Left: **eight** unticked
  lines across the two smoke docs (recounted 2026-09-16), of which **six** are work still owed:
  a DPI change (`docs/smoke/smoke-test.md:283`); group AC's three update boxes
  (`docs/smoke/smoke-test-post-v1.md:750` a failed check, `:753` a failed install, `:756` deb / rpm),
  which need a pullable network and a Linux package; group AI's manual folder toggle across a refresh
  (`:1222`); and the **Remove from list** half of AJ's "buttons own their clicks" (`:1252`) — Retry and
  Pull passed on 2026-09-16, but adding a dead recent needs the native folder picker and the recents
  store is shared with the installed app. The other two are group AG's (`:1149`, `:1160`): deliberate
  records, not work — one box's recipe is unachievable, and one cannot be decided by what it observes.
  So a grep for `- [ ]` finds eight and only six are owed; read AG before counting it as a backlog.
  (Recounted 2026-09-19 in §M: fourteen lines, the line numbers above moved by two.)

- **Windows code signing** — the NSIS setup is not Authenticode-signed, so every new Windows user meets
  SmartScreen's "Windows protected your PC" and has to pick *More info › Run anyway*. The updater's minisign
  signature is a different thing: it protects updates, not the first download. Fixing it needs a code-signing
  certificate (paid, or a signing service), then `bundle.windows.certificateThumbprint` / `signCommand` and a
  release-workflow step, the same shape as the macOS certificate. Recorded 2026-09-24 from group BF. What an unsigned setup
  actually met there (BF 3, in Windows Sandbox): **Edge warned on the download**, and running it brought **no
  SmartScreen prompt**. So today the friction is the browser's download warning. SmartScreen on run may still
  differ on a real machine, whose settings the Sandbox need not share.
- Linux (WebKitGTK) rendering: walked on 2026-09-05 under WSLg (Ubuntu 24.04, X11 backend) —
  fonts, both themes, graph, panels, styled scrollbars (thumb + hover), all five splitters and the
  dock drag, native-menu suppression (toolbar / panel header / statusbar / bare diff body → nothing;
  text field and selected diff text → GTK menu), app context menu on a commit row: all as on Windows.
  Not seen on real Linux hardware or Wayland yet. macOS rendering: never seen; CI compiles only.
- **macOS notarization** — needs a paid Apple Developer account, so Gatekeeper still asks and the
  quarantine step remains in the release notes. (Signing is done, 2026-09-11 — see the done file.)
- UI-vs-canvas comparison pass (v1 plan M6 leftover): screenshots of the real app against the
  screens canvas, one pass, fix what differs or update the canvas.

## C. Roadmap — v1 out-of-scope, unchanged, unscheduled
Custom titlebar (revisited in M6, native kept) · i18n · plugins.

## E. Added 2026-09-10 — one dated decision
- **`ubuntu-22.04` retirement — dated, and cross-repo.** **Parked until 2026-12-23** (user,
  2026-09-24): do not offer it before three months ahead of the first brownout. Deprecated from **2026-09-17**, brownouts
  2027-03-23 / -03-30 / -04-06 / -04-13, unsupported 2027-04-17 (`actions/runner-images#14254`).
  `release.yml` builds Linux on it deliberately, for the glibc floor the `.deb` links against.
  `checks.yml` pins it only to match that matrix — it bundles nothing, it builds and tests, so the
  glibc reason never applied there; its comment claimed it anyway until corrected on 2026-09-11.
  Either way **do not switch to `ubuntu-latest`**: the replacement (a `container: ubuntu:22.04` job,
  or `cargo-zigbuild`) has to be picked once for all three t4 repos. Recorded in
  `docs/archive/plans/ci-alignment-round-2.md` §5; nothing breaks on the deprecation date itself.
  - (§K, 2026-09-16) **Still pinned** in `checks.yml:28` and `release.yml:111`, and **t4-markdown-viewer
    is in exactly the same state** (asked and answered 2026-09-16: still pinned, no decision recorded,
    the reasoning lives only in its archived `ci-alignment*.md`). So the cross-repo decision is genuinely
    unmade. The deprecation is a **label warning, not a break** — the first hard failure is the
    2027-03-23 brownout. If the Linux leg moves into a `container:`, check rustfmt is in
    the image: the markdown viewer runs `Format` on the Linux leg only.

## H. Added 2026-09-12 — after the push
- **`watch::tests::rename_is_reported` flaked once on macOS** (PR #7's first run, 2026-09-12);
  passed on the rerun and on every run since. FSEvents timing is the usual reason. Watch, do not
  act: a second flake makes it a finding (bound the wait on the rename pair, or accept either
  order).
- **A `#[cfg(unix)]` block is invisible to Windows clippy.** The 14-commit push of 2026-09-13 went
  red on Linux and macOS only: a `let mut` flag assigned inside a `#[cfg(unix)]` test block is
  `unused_assignments` under `-D warnings`, and the local gate never compiles that branch
  (`db99d93`, `let linked = cfg!(unix)`). Any unix-only test code wants a CI run before a tag.

## I. Deferred with a reason — the `to revisit` rows, in one place

Lifted from `docs/archive/plans/2026-09-12-consolidated-findings.md` so that file could be
archived. Each is low, confirmed or plausible, and deliberately not fixed; the reason is the
condition that reopens it. (Rows closed as will-not-fix or accepted are in the done file.)

- **S1** blame / history ops are registered but nobody cancels them: 20 quick file clicks run
  20 blames to completion. Fix: a per-repo "latest blame" token cancelled by the next.
- **S2** non-UTF-8 paths are dropped from the working-tree listing (lossy decode, then `stat`
  misses) or listed but unreadable. The IPC type is `String`; log the skip at most.
- **S3** `path_history` fails on `CliOutput::truncated`, which also fires for a 4 MB *stderr*.
  Split the flag if it ever bites.
- **S4** `blameAt` switches tab / seeds / turns blame on before the reveal is known to hit.
  Reordering races the details-pane effect; toast only.
- **S5** no Blame on a working-tree target in `FileRowMenu` while the commit panel offers it —
  moot under the "no working-tree Files surface" decision.
- **E6** O(n²) tree build for a flat directory (`fileTree.ts`, `Sidebar.buildTree`). Measure
  first; rare shape.
- **B3** the interactive-rebase read pass runs a real `rebase -i --autostash`; a kill mid-run
  strands work. Git's clean-tree check precedes the editor, so the read pass needs it; the
  banner offers `--abort`.
- **C6** `close_repo` never cancels the repo's in-flight ops — unreachable, the UI refuses
  close/switch while an op runs (comment on `close_repo`). **C6/Q23** clearing `detail` too
  leaves the details pane blank during the round trip — reconsider only if it flickers.
- **R10** selected-mode header after a partial stage; **R12** two stale status/refs pairings
  where a guard would flicker; **R13** `canSquash` O(n) per row. All wont-for-now, recorded.
- Two `ponytail:` ceilings in code: `Menu.tsx` (a submenu panel is `.menu`-wide, the parent's
  width stands in) and `log/walker.rs` (a `Refs` spec that never reaches HEAD leaves the
  working-tree column open).
- **F3** (2026-09-20 review, moved from §N) — the hunk buttons stay enabled on a non-UTF-8 file;
  the refusal arrives as a toast naming the reason. Reopen when such repositories are actually
  worked in — the `lossy` flag already exists on the backend (`FileDiff::lossy`,
  `#[serde(skip)]`), it only needs putting on the wire and a `DisabledHint`.
- **F10** (2026-09-20 review, moved from §N) — a typed, uncommitted commit message in another
  window is lost to an update's restart. Needs a design choice first: persist the draft across the
  restart, or refuse Install while one exists.
- **F7 / updater restart** — verified from sources 2026-09-21: the plugin releases its lock on
  `RunEvent::Exit` on all three platforms, and tauri 2.11.5's `restart()` delivers that exit before
  spawning the new process when called off the main thread, which `install_update` (an async
  command) is. It would NOT hold if `restart()` were ever called on the main thread
  (`cleanup_before_exit` does not reach plugins). Not walkable without a published update: smoke
  BD 10 / AZ 10 carries "after the update installs, the app comes back".

## J. Added 2026-09-14 — from the UI direction B review
Direction B (History | Changes view switch + Ctrl+K palette) is the chosen small-window layout;
canvases under `docs/design/` once it lands.
- **Palette search prefixes** — `#` searches commits (subject / SHA), `/` opens a file in the Files
  tab. The first palette ships with actions, views, go-to-branch and recent repositories only.
- **Per-view sidebar state** (Direction B follow-up): many will hide the sidebar while staging and want it back in History. One `railOverride` per view is a ten-line change in `viewStore` if the first weeks say so.

## L. Added 2026-09-17 — from the Ctrl+, / auto-close review and walk

Four things that existed only in a session transcript. None is scheduled; each is written down so it
is not rediscovered from scratch. The walk itself is
`docs/archive/walks/2026-09-17-autoclose-walk.md`.

- **`Ctrl+,` is dead while the start screen is opening a repository.** `StartScreen`'s handler returns
  early on `busy`, which is set for the whole of `pick()` / `init()` / `startClone()`, so the chord
  does nothing between the click and the window swap. Deliberate for the pickers (the OS dialog owns
  the keyboard anyway) and harmless for the rest — opening Settings over a repository that is half
  open is worse than a dead key. Reopen it only if the gap ever feels long; the fix is to drop
  `busy` from the comma arm alone, not from the guard.
- **The `smoke-dialog.ps1` fixture may not match today's confirm boxes.** `docs/smoke/smoke-cdp.md`
  §"Native dialogs" clicks a button by label with `BM_CLICK` on a class-`Button` child window, and
  warns that `WScript.Shell` `AppActivate` + `SendKeys` is unreliable. On 2026-09-17 the Discard
  confirm exposed its buttons to UI Automation as TaskDialog command-link **Panes**
  (`CommandButton_1000` / `_1001`), not as class-`Button` children, and what worked was exactly the
  `AppActivate` + `SendKeys {ENTER}` the section warns against. `WM_COMMAND` to the dialog's own HWND
  did nothing. Both readings were taken on the same machine, so this is a box-style difference to
  measure against a live dialog before either the fixture or the doc is changed — not a reason to
  change either yet. Until then: whichever route is used, **poll for the box**, because an
  unanswered confirm is indistinguishable from a Discard that silently did nothing.
  (A second reading, 2026-09-19, is in §M.)
- **Linux `Super+O` / `Super+N` / `Super+Q` reach the app.** Pre-existing, unrelated to this work:
  `useShortcuts` treats `metaKey` as Ctrl so one branch serves ⌘ on macOS, and on Linux Super is
  `metaKey` too. The desktop environment usually swallows Super chords first, which is why it has
  never been reported. A `navigator.platform` split would fix it and would also be the first
  platform test in that file, so it waits for a real report.
- **`commitStore` is the only store that writes `viewStore`.** An architectural note, not a defect:
  the auto-close lives in `commit()` because that is the single place every commit route lands, and
  the alternative was threading `onCommitted` through three components. Worth remembering if a
  second store ever wants the view — two writers and it belongs behind a named action on
  `viewStore` instead.

## M. Added 2026-09-19 — review of `v0.10.1..HEAD`, its fixes, and the walk of group AZ

The walk is `docs/archive/walks/2026-09-19-group-az-walk.md`. What is left, so it is not rediscovered:

- **Open boxes in group AZ**: 9 (the `git skipped <path>` toast — unit-tested, no hand recipe), 10 (an
  update's restart keeps every window — needs a published update, walk it with group AC), 11 (Linux and
  macOS: rows 3a, 3b, 3d, 3i and bullet 6, by hand).
- **Unticked lines, recounted**: fourteen across the two smoke docs. The eight of §B (now
  `smoke-test-post-v1.md:752`, `:755`, `:758`, `:1151`, `:1162`, `:1224`, `:1254` and `smoke-test.md:283`),
  the viewport-anchor walk's 9 (`:1741`, not drivable), the settings walk's 6 (`:1764`, a real update
  download), and AZ's 9, 10 and the two under 11.
- **Menus.** Rows shift by a line while arrowing over a clipped name. After arrow keys in the grid a
  right-click menu opens with its first item focus-visible, so a clipped first item opens wrapped — the
  same case in which that row always had the accent highlight.
- **Seen in the walk, not acted on.** An external `git reset` of 1800 files takes about four seconds to
  show in Changes, on 0.10.7 as well. A libgit2 error toast ends in git2's own
  `; class=Os (2); code=NotFound (-3)`. And a second reading for §L's native-confirm bullet: on
  2026-09-19 `SendKeys {ENTER}` after `SetForegroundWindow` on the `#32770` box answered the **Resolve
  conflict** confirm at the first try.

## N. Added 2026-09-20 — full codebase review at v0.10.9, fixed 2026-09-21

The ten fixes, the walks and the squash map (old → new hashes) are in the done file. Still open
(2026-09-21), none of it blocking:
- **BD 10 + the update restart** — now that v0.10.10 is published: BD 10 (Install refused while an
  operation runs) and, with it, "after the update installs, the app comes back" (§I, F7 / updater
  restart). Walk both with group AC, from an installed 0.10.9 or older. That `install_update` calls
  the refusal helper also waits for BD 10.
- **A staged diff's body can stay stale after an outside `git add`** — found on the second walk
  (BD 11), older than this batch. The panel reloads a diff when the row's status entry changes:
  its letters, or `workdir_stamp` (mtime:size). Nothing stamps the index side, so a tool that
  writes a file and `git add`s it with a status read landing in between leaves the staged body
  on the old blob (the row's `+N −M` does update). Reselecting the row reloads it. No data at
  risk: a hunk action on the stale body is refused by the print check. The cheap fix is the
  index entry's oid beside `workdir_stamp`.
- **`linesShown` is unreachable from the panel** — a truncated diff is whole-file only there
  (`wholeOnly`), so the hunk print always covers the whole hunk; the cut-hunk path has unit
  tests only.

## Suggested order, if nothing else decides it

The `ubuntu-22.04` decision in §E is parked until 2026-12-23 (three months before the 2027-03-23
brownout). Otherwise:
1. Linux/macOS rendering when a machine is available — signing is done, and never needed one. CI's
   ubuntu and macOS legs already run the `#[cfg(unix)]` exec-bit staging test on every code push
   to `main`; only group G's manual
   mode-chip check needed a Unix box (done under WSLg 2026-09-05).
2. The performance items, each only after a measurement on a `git/git` clone says so.
