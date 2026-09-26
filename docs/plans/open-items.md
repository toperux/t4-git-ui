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
  with no hand recipe, is marked `[n/a]` since 2026-09-26.) Linux was walked 2026-09-26 and failed on 6; the fix
  is on `linux-smoke-and-fixes`, see §O.
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
  blank-window bug below); `.rpm` not walked. The row stays unticked
  (`docs/archive/walks/2026-09-26-group-ac-linux-walk.md`).
- **ssh under the moved `HOME` (T4):** check once that ssh still finds `~/.ssh`, and correct `smoke-linux.md` if not.
  (`xclip`, T9, turned out to be installed and is now a listed prerequisite.)
- **Re-test WebDriver with two windows (T7)** once the restore hang is fixed. If it works, multi-window rows get DOM
  access back.
- **Drive live Wayland through AT-SPI (T5):** the OS theme switch, DPI and anything Wayland-only are hand-walked
  today. `python3-gi`'s `Atspi` reaches the live session. It needs a plan of its own.
- **Bug found in the AC :761 walk (2026-09-26): the AppImage opens a blank window on Ubuntu 26.04.**
  - **Symptom:** WebKit's web process aborts with `Could not create default EGL display: EGL_BAD_PARAMETER`. The
    window stays blank. It affects the published 0.10.11 **and 0.10.12** AppImages.
  - **Scope:** the same on the Wayland desktop (VMware SVGA II) and on a headless Xvfb display in software, so it isn't
    GPU- or session-specific. The `.deb` (system WebKitGTK 2.52.6) renders fine.
  - **Cause, verified:** the AppImage is built on `ubuntu-22.04` (`release.yml:111`) and bundles that system's
    `libwayland-client` / `-egl` / `-cursor` / `-server`. Those shadow the host's, and the host's Mesa EGL fails
    against them.
    - **On X11** (Xvfb, software), either of these makes it render: removing the bundled `libwayland-*` from the
      extracted 0.10.11 AppImage, or running the real AppImage with `LD_PRELOAD` of the host's
      `libwayland-client.so.0` and `libwayland-egl.so.1`.
    - **On the Wayland desktop** (VMware SVGA II), those two preloaded left it blank, though the page ran (the title
      changed). It rendered with all four host libraries preloaded (`-client`, `-egl`, `-cursor`, `-server`)
      **plus** `WEBKIT_DISABLE_DMABUF_RENDERER=1`. The same four under XWayland (`GDK_BACKEND=x11`) stayed blank,
      with no error.
    - **Not yet separated:** whether native Wayland needs the extra two libraries, the DMA-BUF switch, or both.
  - **Fix direction:** leave the `libwayland-*` libraries out of the AppImage (the host always has them). Then check
    whether native Wayland still needs the DMA-BUF renderer off. If it does, the app could set
    `WEBKIT_DISABLE_DMABUF_RENDERER=1` for itself when `APPIMAGE` is set. Find the
    supported way in Tauri 2's AppImage bundler (linuxdeploy); failing that, a post-bundle step that strips them and
    repacks before signing, since the `.sig` covers the final file. Then re-test on Ubuntu 26.04, and on 22.04 so
    nothing regresses there.
  - **Also relevant:** the `ubuntu-22.04` runner decision (§E, parked until 2026-12-23), since the gap between build
    host and user system is the root.
  - **Workaround until then:** `LD_PRELOAD` of the four host `libwayland-*` libraries plus
    `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
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

## Order

The order is set by `docs/plans/2026-09-26-close-out-plan.md` (phases 0–6).
