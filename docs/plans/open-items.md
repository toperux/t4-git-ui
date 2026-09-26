# Plan: after v1 — open items (t4-git-ui)

_Written 2026-09-02, the day after v1 was accepted. This is the one list of what is still open;
it folds together the v1 plan's "Known gaps", the 2026-09-01 codebase review's deferred rows and
the README's "Next" line (review item H4). Nothing here is scheduled yet — pick from it._

_Done, fixed, walked and closed rows live in `open-items-done.md` (split 2026-09-24), under the same
section letters — a letter with nothing open left (§D, §F, §G, §K, §N) is only there. When a row here is
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
- **Unticked smoke lines — recounted 2026-09-25: ten**, across the two smoke docs. The settings walk's 6 was
  walked the same day, and a grep for `- [ ]` also matches `smoke-test-post-v1.md:298`, which is prose. (Line numbers
  refreshed 2026-09-26.) By what
  they need:
  - **By hand on this machine (3):**
    - a DPI change (`smoke-test.md:285`);
    - AI's manual folder toggle across a refresh (`smoke-test-post-v1.md:1234`);
    - the **Remove from list** half of AJ's "buttons own their clicks" (`:1264`). Retry and Pull passed
      2026-09-16; adding a dead recent needs the native folder picker, and the recents store is shared with
      the installed app.
  - **A Linux or macOS machine (3):** AC's deb / rpm box (`:761`), and AZ 11's two platform lines (`:1867`,
    `:1870`).
  - **Records, not work (4):**
    - AG's two (`:1161`, `:1172`): one box's recipe is unachievable, and one cannot be decided by what it
      observes;
    - the viewport-anchor walk's 9 (`:1751`), which isn't drivable;
    - AZ 9 (`:1864`), which is unit-tested with no hand recipe. `check_staged`'s test covers the message only,
      not the toast or the list refresh.

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
  - (2026-09-27) **Whatever replaces it keeps the AppImage repack.** `release.yml` strips the build host's
    `libwayland-client` from the AppImage (§P). Any older-than-the-user build host needs that, a `container:
    ubuntu:22.04` job included.
  - (§K, 2026-09-16) **Still pinned** in `checks.yml:28` and `release.yml:111`, and **t4-markdown-viewer
    is in exactly the same state** (asked and answered 2026-09-16: still pinned, no decision recorded,
    the reasoning lives only in its archived `ci-alignment*.md`). So the cross-repo decision is genuinely
    unmade. The deprecation is a **label warning, not a break** — the first hard failure is the
    2027-03-23 brownout. If the Linux leg moves into a `container:`, check rustfmt is in
    the image: the markdown viewer runs `Format` on the Linux leg only.

## H. Added 2026-09-12 — after the push
- **Watch CI after the v0.10.12 push:** the three CI flakes were fixed 2026-09-25 (done file §H). The macOS
  ones could not be reproduced here, so the first macOS runs are the check. Close this row after a few green
  ones.
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
- Three `ponytail:` ceilings in code:
  - `Menu.tsx`: a submenu panel is `.menu`-wide, so the parent's width stands in;
  - `log/walker.rs`: a `Refs` spec that never reaches HEAD leaves the working-tree column open;
  - `App.tsx` (2026-09-25): an update answer that lands between a new window's `lastUpdateCheck()` reply and its
    `update://checked` listener attaching is missed. Check now covers it.
- **F3** (2026-09-20 review, moved from §N) — the hunk buttons stay enabled on a non-UTF-8 file;
  the refusal arrives as a toast naming the reason. Reopen when such repositories are actually
  worked in — the `lossy` flag already exists on the backend (`FileDiff::lossy`,
  `#[serde(skip)]`), it only needs putting on the wire and a `DisabledHint`.

## J. Added 2026-09-14 — from the UI direction B review
Direction B (History | Changes view switch + Ctrl+K palette) is the chosen small-window layout;
canvases under `docs/design/` once it lands.
- **Palette search prefixes** — `#` searches commits (subject / SHA), `/` opens a file in the Files
  tab. The first palette ships with actions, views, go-to-branch and recent repositories only.
- **Per-view sidebar state** (Direction B follow-up): many will hide the sidebar while staging and want it back in History. One `railOverride` per view is a ten-line change in `viewStore` if the first weeks say so.

## L. Added 2026-09-17 — from the Ctrl+, / auto-close review and walk

Things that existed only in a session transcript. None is scheduled; each is written down so it
is not rediscovered from scratch. (Two more, the `commitStore` → `viewStore` note and the `smoke-dialog.ps1`
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

The walk is `docs/archive/walks/2026-09-19-group-az-walk.md`. What is left, so it is not rediscovered:

- **Open boxes in group AZ**: 9 (the `git skipped <path>` toast — unit-tested, no hand recipe; a record, see §B) and
  11 (Linux and macOS: rows 3a, 3b, 3d, 3i and bullet 6, by hand). Linux was walked 2026-09-26 and failed on 6; the
  fix is committed on `linux-smoke-and-fixes`, see §O.
- **Menus.** Rows shift by a line while arrowing over a clipped name. After arrow keys in the grid a
  right-click menu opens with its first item focus-visible, so a clipped first item opens wrapped — the
  same case in which that row always had the accent highlight.
- **Seen in the walk, not acted on.** An external `git reset` of 1800 files takes about four seconds to
  show in Changes, on 0.10.7 as well. (The libgit2 error-suffix row was fixed 2026-09-25 and is in the done
  file; the walk's native-confirm reading is in §L.)

## O. Added 2026-09-26 — the Linux walk of group AZ 11

The walk is `docs/archive/walks/2026-09-26-group-az-linux-walk.md`: a debug build of `1e795ad` on Ubuntu 26.04.1,
WebKitGTK 2.52.6, driven under Xvfb (`docs/smoke/smoke-linux.md`). Rows 3a, 3b, 3d and 3i pass. It found two bugs,
both reproduced without WebDriver. Fix plan, with a status section:
`docs/plans/2026-09-26-linux-menu-focus-and-restore-plan.md`.

- **Menus show no keyboard focus on WebKitGTK: fixed** (branch `linux-smoke-and-fixes`).
  - **The bug:** `Menu.tsx` focused items by script, WebKitGTK never gives those `:focus-visible`, and every highlight
    and the clipped-name wrap were keyed on it.
  - **The fix:** `focusItem` marks a keyboard-focused item `data-kbd`, and the CSS styles `[data-kbd]:focus` beside
    `:focus-visible`.
  - **Checked:** AZ 6 passes in full on Linux (2026-09-26, direct launch, real X keys).
  - **Still open:**
    - **Linux audit** of other script-focused widgets: the Select lists (Settings), the command palette, file lists,
      and the trigger that gets focus back after Escape (`useRestoreFocus`). Any with no visible focus gets a row
      of its own.
    - **Windows re-walk of AZ 6** over CDP. It must look exactly as before.
- **A restored second window sometimes never starts: guarded, not fixed.**
  - **The bug:** `w1` stays on the *Starting* spinner for good.
    - **Rate:** about 3 of 16 two-window restores before step C, 7 of 20 after. That difference isn't significant
      (p ≈ 0.3).
    - **Log:** nothing from `w1`. Under WebDriver its `plugin:store|load` never returned, and async commands then
      stalled app-wide while a sync one still answered, so the main thread was alive.
  - **Done, on `linux-smoke-and-fixes` (plan step C):** `spawn` writes the new window's tabs to `layout.json` at
    once, and after
    `restoreTabs` the frontend reports once, so a window that never starts keeps its tabs. Checked: 20 of 20
    restores kept them, all 7 hangs included.
  - **Still open:**
    - **Plan step A, diagnose.** A repro loop that **A/Bs step C** (30 launches with it, 30 without, in case its lock
      and file write in `spawn` raise the rate). Then thread stacks of a hung process under gdb as a parent (no sudo
      needed). Then the probes: did the stuck page load (screenshot); is `main` alive (F5 and the log); does it also
      hang on a second launch or on Ctrl+Shift+N. The earlier store-lock suspect is unlikely: both paths take
      the locks in the same order. Look first at the async side and at `show_with_theme`'s `win.theme()`, a
      main-thread round trip.
    - **Plan step B, fix,** once A names the cause.
    - **Verify:** 0 hangs in 50 launches; a Linux re-walk of AZ 3a/3b/3c/3d/3f/3h/3i/3k; a Windows re-walk of AZ
      row 3.
    - **Whether it happens on Windows** (not seen in the 2026-09-19 walk).
- **AZ 11 Linux stays unticked** until both bugs pass their re-walks. Then tick it, write the walk record, and move
  this section to `open-items-done.md`.
- **Triaged 2026-09-26:** every decision and accepted limit is recorded in the plan's *Decisions* section; the order
  of the remaining work is its *Order* section. T14 (a test for the `catch` path) is done. T11 was
  dropped: reporting `main` first would widen an existing crash loop (§P), so the crash-at-launch gap is accepted.
  Then Phase A with the A/B. If Phase C raises the rate,
  its write moves onto the build thread (D2). Then the T18 audit and Phase B. Windows: AZ 6 as soon as the branch is
  up, row 3 after Phase B. macOS (AZ 11 and the WebKit click-focus check, T12): open until a Mac is available.

## P. Added 2026-09-26 — the Linux harness follow-ups, and one row found in review

The harness is `docs/smoke/smoke-linux.md` plus the `smoke-walk` skill. Its decisions are in the plan above.

- ~~**Portable fixture script (T2).**~~ Done 2026-09-26 (`linux-smoke-and-fixes`): `smoke-fixtures.sh` uses `awk`
  instead of GNU `sed`, with the same output.
- ~~**Promote the direct-launch helpers (D4).**~~ Done 2026-09-26 (`linux-smoke-and-fixes`):
  `docs/smoke/fixtures/direct.sh`, pointed to from `smoke-linux.md`.
- **AC :761 walked 2026-09-26 (T6):** the `.deb` passes; the AppImage updates in place only with a workaround (the
  blank-window bug below); `.rpm` not walked, ruled covered 2026-09-27. The row stays unticked until the AppImage
  release walks (`docs/archive/walks/2026-09-26-group-ac-linux-walk.md`).
- **ssh under the moved `HOME` (T4):** check once that ssh still finds `~/.ssh`, and correct `smoke-linux.md` if not.
  (`xclip`, T9, turned out to be installed and is now a listed prerequisite.)
- **Re-test WebDriver with two windows (T7)** once the restore hang is fixed. If it works, multi-window rows get DOM
  access back.
- **Drive live Wayland through AT-SPI (T5):** the OS theme switch, DPI and anything Wayland-only are hand-walked
  today. `python3-gi`'s `Atspi` reaches the live session. It needs a plan of its own.
- **Bug found in the AC :761 walk (2026-09-26): the AppImage opens a blank window on Ubuntu 26.04. Fixed on
  `linux-smoke-and-fixes`, pending a `workflow_dispatch` build and the release walks.**
  Plan: `docs/plans/2026-09-26-appimage-blank-window-plan.md`.
  - **Symptom:** WebKit's web process aborts with `Could not create default EGL display: EGL_BAD_PARAMETER`, and the
    window stays blank. The published 0.10.11 and 0.10.12 AppImages are affected; the `.deb` renders fine.
  - **Cause:** the AppImage is built on `ubuntu-22.04` and bundles its `libwayland-client` (1.20). The host's Mesa
    `libEGL_mesa` uses symbols from 1.23+, so every host with a Mesa that new is hit, not only 26.04. Moving the
    runner wouldn't help: 24.04 ships 1.22.
  - **Fix:** `release.yml` repacks the AppImage without `libwayland-client` (what the upstream AppImage excludelist
    drops), rewrites the runtime's `.digest_md5`, re-signs it and verifies the `.sig` against the shipped pubkey.
    `-server` stays: the bundled WebKit needs it. The release body tells 0.10.12-or-earlier AppImage users to
    download by hand, since a blank window can't reach the in-app update.
  - **Untested (accepted 2026-09-27):** an Ubuntu 22.04 host, and the NVIDIA proprietary driver.
  - **Separate, and not fixed:** the AppImage always runs under XWayland (its GTK hook forces `GDK_BACKEND=x11`).
    On this VMware SVGA II guest, XWayland also needs `WEBKIT_DISABLE_DMABUF_RENDERER=1`; the system `.deb` under
    `GDK_BACKEND=x11` is blank too. Decided 2026-09-27: no switch in the app (it would slow every AppImage user).
    README documents the variable instead.
  - **Left:**
    - ~~a `workflow_dispatch` run~~ done 2026-09-27 (run 36257070680): the CI AppImage renders on Xvfb, and on this
      desktop with the variable;
    - the next release: an old AppImage with the `LD_PRELOAD` workaround (the command is in the AC walk record)
      updates to the fixed one;
    - the release after: the fixed one updates in place;
    - then tick AC :761. `.rpm` is ruled covered by the `.deb` walk (2026-09-27): without `APPIMAGE` both take the
      Download… path (`update.rs:45-50`).
- **CLI pin drift (triaged 2026-09-27, the AppImage plan's Triage L2):** `release.yml:158` pins `tauri-cli@2.11.4`,
  while `package-lock.json` has `@tauri-apps/cli` 2.11.5, against the pin's own comment. (The macOS leg builds the
  CLI from source; `--locked` was added 2026-09-27 after the unlocked build broke on a newer `tauri-bundler`.) Align them (bump both). At
  2.11.5+, add `--app-version "$ver"` to the AppImage re-sign step, since `tauri build` then binds the version into
  the other signatures.
- **Only the AppImage's updater `.sig` is verified in CI (triaged 2026-09-27, the AppImage plan's Triage L4).** The
  Windows `.exe.sig` and the macOS `.app.tar.gz.sig` come straight from the bundler and nothing touches the files
  after signing, so the risk the AppImage check guards against doesn't apply. To extend it, run
  `.github/scripts/verify-updater-sig.py` on those legs too.
- **Row found in review: a repository that crashes the app while loading crashes every later launch.** `openTab`
  adds the tab, and the layout subscription reports it to `layout.json`, as soon as the backend open returns and
  before the repository loads (`src/store/tabsStore.ts`, `src/App.tsx`'s `useTabsStore.subscribe`). A crash during
  the load therefore leaves the path in the file, and every launch reopens it and crashes again until `layout.json`
  is deleted by hand. That happens with one window or several. "Crashes" means the process ends without a normal
  exit: a segfault, an abort, OOM, or a panic that isn't contained. Likely fix, a loop breaker:
  - **Mark the restore in progress** on the Rust side, before `take_layout` hands the layout out.
  - **Clear the mark** once every window the restore spawned has sent its post-`restoreTabs` report, not just
    `main`: spawned windows load their own repositories. Rust knows their labels from `spawn` / `pending`.
    **Also clear it on a normal exit** (`RunEvent::Exit`, which covers Quit and the last window closing). A window
    stuck on *Starting* (§O) never reports, so without this a clean quit would read as a crash next launch. **And clear
    it just before `update.install`** (`update.rs`), or in the updater's `on_before_exit` hook. On Windows the updater
    launches the installer and calls `std::process::exit(0)`, so `RunEvent::Exit` never fires, and the launch after an
    update would read as a crash (breaking AZ 10). Only a crash or a kill then leaves the mark set.
  - *This is a sketch from review, verified against Tauri 2.11 and tauri-plugin-updater 2.12. Design and test it
    properly when the row is picked up: the exit paths (Quit, last window, update restart on each OS, a kill)
    are the test list.*
  - **If the previous launch never finished restoring,** open `main` on the start screen once:
    - move `layout.json` aside rather than taking it (`take_layouts` deletes the file, and the one present is what
      the crashed launch rewrote);
    - **skip the `lastOpen` fallback too.** The subscription persists the crashing repository as `lastOpen`, which
      `restoreTabs` falls back to on an empty layout;
    - say so in a toast.
- **Row found in review (T15): a reloaded `main` re-spawns every other window.** A dev reload, or a WebKit
  web-process crash that reloads the page, runs `restoreTabs` → `takeLayout` again (`src/App.tsx`) and spawns
  duplicates of every other window. Not new, and unrelated to §O. Likely fix: take the layout once per process
  (e.g. Rust keeps it after the first `take_layout`), not once per page load.

## Suggested order, if nothing else decides it

The `ubuntu-22.04` decision in §E is parked until 2026-12-23 (three months before the 2027-03-23
brownout). Otherwise:
1. Linux/macOS rendering when a machine is available — signing is done, and never needed one. CI's
   ubuntu and macOS legs already run the `#[cfg(unix)]` exec-bit staging test on every code push
   to `main`; only group G's manual
   mode-chip check needed a Unix box (done under WSLg 2026-09-05).
2. The performance items, each only after a measurement on a `git/git` clone says so.
