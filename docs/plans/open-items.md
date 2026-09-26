# Plan: after v1 — open items (t4-git-ui)

_Written 2026-09-02, the day after v1 was accepted. This is the one list of what is still open;
it folds together the v1 plan's "Known gaps", the 2026-09-01 codebase review's deferred rows and
the README's "Next" line (review item H4). Since 2026-09-26 every row except §C's roadmap is
scheduled in `2026-09-26-close-out-plan.md`._

_Done, fixed, walked and closed rows live in `open-items-done.md` (split 2026-09-24), under the same
section letters — a letter with nothing open left (§D, §F, §G, §H, §K, §N) is only there. When a row here is
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
- **Unticked smoke lines — recounted 2026-09-26: three**, all in `smoke-test-post-v1.md`, all needing a Linux
  or macOS machine: AC's deb / rpm box (`:759`), and AZ 11's two platform lines (`:1860`, `:1861`). A grep for
  `- [ ]` also matches `:296`, which is prose. (Four records are marked `[n/a]` since close-out Phase 0; the three
  this machine could reach were walked in Phase 1 — both in the done file.)
- **The first real run of 0.10.12's plain-words update errors and Install's confirm** over a typed commit
  message (group BG walked them on local builds only) is the user's update from 0.10.12 to the next release —
  the close-out plan's release gate. It cannot be the 0.10.11 → 0.10.12 update: an update runs the *old* app's
  code. (The user's install became 0.10.12 on 2026-09-26, through the Phase 1 updater walk.)

- **Windows code signing** — the NSIS setup is not Authenticode-signed, so every new Windows user meets
  SmartScreen's "Windows protected your PC" and has to pick *More info › Run anyway*. The updater's minisign
  signature is a different thing: it protects updates, not the first download. Close-out Phase 1b ports
  `F:/src/_ pet projects/signing-and-repo-setup.md` (Certum certificate, thumbprint `F06C…8151`, expires
  2027-09-22) from t4-markdown-viewer. Recorded 2026-09-24 from group BF. What an unsigned setup
  actually met there (BF 3, in Windows Sandbox): **Edge warned on the download**, and running it brought **no
  SmartScreen prompt**. So today the friction is the browser's download warning. SmartScreen on run may still
  differ on a real machine, whose settings the Sandbox need not share.
- Linux (WebKitGTK) rendering: walked on 2026-09-05 under WSLg (Ubuntu 24.04, X11 backend) —
  fonts, both themes, graph, panels, styled scrollbars (thumb + hover), all five splitters and the
  dock drag, native-menu suppression (toolbar / panel header / statusbar / bare diff body → nothing;
  text field and selected diff text → GTK menu), app context menu on a commit row: all as on Windows.
  Not seen on real Linux hardware or Wayland yet. macOS rendering: never seen; CI compiles only.
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

## I. Deferred with a reason — the `to revisit` rows and the `ponytail:` ceilings, in one place

Deferred findings lifted from `docs/archive/plans/2026-09-12-consolidated-findings.md` and later
reviews, plus the `ponytail:` ceilings in code. Each was low and deferred with a reason; since
2026-09-26 they are scheduled in the close-out plan (`2026-09-26-close-out-plan.md`), each row
naming its phase. (Rows closed as will-not-fix or accepted are in the done file.)

- **S1** blame / history ops are registered but nobody cancels them: 20 quick file clicks run
  20 blames to completion. Fix: a per-repo "latest blame" token cancelled by the next.
  *(Close-out Phase 2.)*
- **S2** non-UTF-8 paths are dropped from the working-tree listing (lossy decode, then `stat`
  misses) or listed but unreadable. The IPC type is `String`; log the skip at most.
  *(Close-out Phase 2.)*
- **S3** `path_history` fails on `CliOutput::truncated`, which also fires for a 4 MB *stderr*.
  Split the flag if it ever bites. *(Close-out Phase 2.)*
- **S4** `blameAt` switches tab / seeds / turns blame on before the reveal is known to hit.
  Reordering races the details-pane effect; toast only. *(Close-out Phase 2.)*
- **E6** O(n²) tree build for a flat directory (`fileTree.ts`, `Sidebar.buildTree`). Measure
  first; rare shape. *(Close-out Phase 3, measure first.)*
- **B3** the interactive-rebase read pass runs a real `rebase -i --autostash`; a kill mid-run
  strands work. Git's clean-tree check precedes the editor, so the read pass needs it; the
  banner offers `--abort`. *(Close-out Phase 2.)*
- **C6** `close_repo` never cancels the repo's in-flight ops — unreachable, the UI refuses
  close/switch while an op runs (comment on `close_repo`). **C6/Q23** clearing `detail` too
  leaves the details pane blank during the round trip — reconsider only if it flickers.
  *(Close-out Phase 2.)*
- **R10** selected-mode header after a partial stage; **R12** two stale status/refs pairings
  where a guard would flicker *(close-out Phase 2)*; **R13** `canSquash` O(n) per row
  *(close-out Phase 3, measure first)*.
- `ponytail:` ceilings in code (seven added 2026-09-26, which were in the code but never listed here):
  - `crates/git-core/src/log/walker.rs:94` — a `Refs` spec that never reaches HEAD leaves the working-tree
    column open *(Phase 2)*;
  - `src/App.tsx:154` (2026-09-25) — an update answer that lands between a new window's `lastUpdateCheck()` reply and its
    `update://checked` listener attaching is missed. Check now covers it. *(Phase 2)*;
  - `crates/git-core/src/linked.rs:120` — `snapshot` opens a repository per worktree and re-reads every
    submodule, no cache *(Phase 3, measure first)*;
  - `crates/git-core/src/linked.rs:134` — no main row when the main worktree's HEAD can't be read;
    `worktree list --porcelain` fixes it at a git ≥ 2.36 floor *(Phase 2)*;
  - `crates/git-core/src/watch.rs:124` — an app-side rewrite of `.gitmodules` does not refresh the Submodules
    list until the next refs event *(Phase 2)*;
  - `src-tauri/src/commands/window.rs:326` — the pointer position for tab adoption is Windows-only *(Phase 5)*;
  - `src/components/ui/Input/Input.tsx:221` — an AltGr character never reaches type-ahead *(Phase 2)*;
  - `src/screens/RepoWindow/Toolbar.tsx:100` — a rename while in the `icons` tier measures late *(Phase 2)*;
  - `src/screens/RepoWindow/dialogs/StashDialogs.tsx:39` — a dirty-only submodule is listed as stashed
    *(Phase 2)*.
- **F3** (2026-09-20 review, moved from §N) — the hunk buttons stay enabled on a non-UTF-8 file;
  the refusal arrives as a toast naming the reason. Reopen when such repositories are actually
  worked in — the `lossy` flag already exists on the backend (`FileDiff::lossy`,
  `#[serde(skip)]`), it only needs putting on the wire and a `DisabledHint`. *(Close-out Phase 2.)*

## J. Added 2026-09-14 — from the UI direction B review
Direction B (History | Changes view switch + Ctrl+K palette) is the chosen small-window layout;
canvases under `docs/design/` once it lands.
- **Palette search prefixes** — `#` searches commits (subject / SHA), `/` opens a file in the Files
  tab. The first palette ships with actions, views, go-to-branch and recent repositories only.
- **Per-view sidebar state** (Direction B follow-up): many will hide the sidebar while staging and want it back in History. One `railOverride` per view is a ten-line change in `viewStore` if the first weeks say so.

## L. Added 2026-09-17 — from the Ctrl+, / auto-close review and walk

Things that existed only in a session transcript. None was scheduled; each is written down so it
is not rediscovered from scratch. **Since 2026-09-26 both rows are scheduled in close-out Phase 2**; the
"reopen only if" reasoning below is kept as history. (Two more, the `commitStore` → `viewStore` note and the `smoke-dialog.ps1`
fixture, are in the done file since 2026-09-25.) The walk itself is
`docs/archive/walks/2026-09-17-autoclose-walk.md`.

- **`Ctrl+,` is dead while the start screen is opening a repository.** `StartScreen`'s handler returns
  early on `busy`, which is set for the whole of `pick()` / `init()` / `startClone()`, so the chord
  does nothing between the click and the window swap. Deliberate for the pickers (the OS dialog owns
  the keyboard anyway) and harmless for the rest — opening Settings over a repository that is half
  open is worse than a dead key. Reopen it only if the gap ever feels long; the fix is to drop
  `busy` from the comma arm alone, not from the guard.
- **Linux `Super+O` / `Super+N` / `Super+Q` reach the app.** Pre-existing, unrelated to this work:
  `useShortcuts` treats `metaKey` as Ctrl so one branch serves ⌘ on macOS, and on Linux Super is
  `metaKey` too. The desktop environment usually swallows Super chords first, which is why it has
  never been reported. A `navigator.platform` split would fix it and would also be the first
  platform test in that file, so it waits for a real report.

## M. Added 2026-09-19 — review of `v0.10.1..HEAD`, its fixes, and the walk of group AZ

The walk is `docs/archive/walks/2026-09-19-group-az-walk.md`. What is left, so it is not rediscovered.
**Since 2026-09-26 these are scheduled in the close-out plan** (the toast, default-remote and menu rows in
Phase 2, the 1800-file delay in Phase 3, AZ 11 in Phase 5); "left until one bites" below is kept as history.

- **A failed op's toast detail, known limits** (2026-09-26, the Pull fix's review). Without a `fatal:` /
  `error:` line, `classify_failure` takes the first line after a fetch's chatter. Git wraps its advice, so
  the toast can stop mid-sentence (*…but did not specify*), and a `warning:` line before the advice
  (`warning: redirecting to …`) is taken in its place. The dock has the whole text. Joining lines up to a
  blank one would cut the first, but it would also lengthen the cherry-pick advice headline that
  `cli::ops::tests::rejected_and_other` pins. So both are left until one bites.
- **The default remote can overwrite a quick pick** (pre-existing). `useDefaultRemote` sets the answer of
  `get_default_remote` whenever it lands, even after the Remote field was changed by hand. Since 2026-09-26 the
  first render already shows the same order from the refs, so the answer rarely differs. The preview follows
  the change, but an Enter right after it can still miss it. Fix: skip the `setRemote` once the field was
  touched.

- **Open box in group AZ**: 11 (Linux and macOS: rows 3a, 3b, 3d, 3i and bullet 6, by hand). (9, unit-tested
  with no hand recipe, is marked `[n/a]` since 2026-09-26.)
- **Menus.** Rows shift by a line while arrowing over a clipped name. After arrow keys in the grid a
  right-click menu opens with its first item focus-visible, so a clipped first item opens wrapped — the
  same case in which that row always had the accent highlight.
- **Seen in the walk, not acted on.** An external `git reset` of 1800 files takes about four seconds to
  show in Changes, on 0.10.7 as well. (The libgit2 error-suffix row was fixed 2026-09-25 and is in the done
  file; the walk's native-confirm reading is in §L.)

## Order

The order is set by `docs/plans/2026-09-26-close-out-plan.md` (phases 0–6).
