# Plan: after v1 — open items (t4-git-ui)

_Written 2026-09-02, the day after v1 was accepted. This is the one list of what is still open;
it folds together the v1 plan's "Known gaps", the 2026-09-01 codebase review's deferred rows and
the README's "Next" line (review item H4). Since 2026-09-26 every row except §C's roadmap is
scheduled in `2026-09-26-close-out-plan.md`; §Q's accepted limits wait on their reopen triggers (the one that was
also in a close-out phase, the `status.rs` row, closed in Phase 3 on 2026-10-03)._

_Done, fixed, walked and closed rows live in `open-items-done.md` (split 2026-09-24), under the same section letters — a
letter with nothing open left (§A, §D, §F, §G, §H, §I, §J, §K, §L, §M, §N, §O, §P, §T, §U, §W, §AD) is only there.
When a row here is done, move it there. Accepted limits with a reopen trigger are open, in §Q (since 2026-09-28); those
with none are closed, in the done file; of §V's deferred rows, only the CRLF test flake and the GIO-modules row remain
after the 2026-10-06 fix batch._

## B. Verification and release
- **Unticked smoke lines — recounted 2026-10-06: one**, BP 4 in `smoke-test-post-v1.md` (the fix batch's tooltip
  row: the Mac passed, Linux failed 0 of 4; kept open with §Z T15, G3 merged in, D33, D35). None in
  `smoke-test.md`. AZ 11's Linux line (now `smoke-test-post-v1.md:1892`) was ticked 2026-10-06. Its macOS line (now
  `smoke-test-post-v1.md:1898`) was ticked 2026-10-04 in close-out Phase 5
  (`docs/archive/walks/2026-10-04-phase-5-macos-walk.md`). AC (`:762`) ticked 2026-10-01 at the v0.10.15 release gate's
  AppImage half. BH 12 (the update badge in a new window) ticked 2026-10-01 at the v0.10.15 release gate. A grep for
  `- [ ]` also matches `smoke-test-post-v1.md:299`, which is prose.
  (Four records are marked `[n/a]` since close-out Phase 0; the three this machine could reach were walked in Phase 1 —
  both in the done file. Line numbers refreshed 2026-10-06.)

- **Windows code signing:** done 2026-10-01 (close-out Phase 1b), moved to `open-items-done.md` §B.
- Linux (WebKitGTK) rendering: walked on 2026-09-05 under WSLg (Ubuntu 24.04, X11 backend) — fonts, both themes, graph,
  panels, styled scrollbars (thumb + hover), all the splitters (the walk said "five"; named 2026-10-04: the sidebar,
  grid/details and the details pane's two in History, files|diff and diff|message in Changes) and the dock drag,
  native-menu suppression (toolbar / panel header / statusbar / bare diff body → nothing; text field and selected diff
  text → GTK menu), app context menu on a commit row: all as on Windows. **Walked again 2026-09-27 on native Wayland**
  (Ubuntu 26.04.1, GNOME, a VMware guest; driven by WebDriver, the two GTK menus that should show checked by eye): all
  of the above pass except the dock's range and collapse, which were walked instead under automation on Xvfb, not with
  real Wayland input (`docs/archive/walks/2026-09-27-linux-wayland-rendering-walk.md` and its addendum). Real GPU
  hardware and a HiDPI panel: an accepted limit, moved to §Q (*Linux: real GPU hardware and a HiDPI panel not walked*),
  2026-09-28. **macOS rendering: walked 2026-10-04** in close-out Phase 5 on the owner's Mac (macOS 26.7.1, WKWebView, a
  debug build of `a6a7a76`): the same list, plus the native title bar above the toolbar, ⌘, ⌘W ⌘1 ⌘Q and a tab torn off
  — all pass; its findings were triaged (`docs/archive/walks/2026-10-04-phase-5-macos-walk.md`, M1).
- **The updater writes nothing to the app log.** A check, a download and an install left no line in the app log on
  Windows in the v0.10.16 gate (2026-10-03), which followed them only through the UI, process ids and file times (the
  Linux walk checked its log for `ERROR`/`WARN` only). Reasoned from the code: check, download and install errors reach
  only the UI (`AppError`, `commands/update.rs`), and only a failed relaunch is logged (`lib.rs:320`), so an update that
  fails on a user's machine before the relaunch leaves no trace of its stage. Nothing failed. **Reopen:** an update
  failure reported, or met in a walk, whose stage the log can't tell.
- **GitHub moves `ubuntu-latest` to Ubuntu 26 from 2026-10-19.** `release.yml`'s `version`, `verify` and `publish`
  jobs run on `ubuntu-latest` (seen as an annotation on the v0.10.20 release run); whether they, or anything else on
  that label, still pass on 26 is unchecked. Added 2026-10-06 (the owner). **Reopen:** the first release after
  2026-10-19: run Release from `workflow_dispatch` first (a dry run).

## C. Roadmap — v1 out-of-scope, unchanged, unscheduled
Custom titlebar (revisited in M6, native kept) · i18n · plugins.
- **Palette search prefixes** — `#` searches commits (subject / SHA), `/` opens a file in the Files
  tab. The first palette ships with actions, views, go-to-branch and recent repositories only. Moved from §J
  2026-09-28 (close-out Phase 2a decision).

## E. Added 2026-09-10 — dated decisions
- **`ubuntu-22.04` retirement — dated, and cross-repo.** **Parked until 2026-12-23** (user,
  2026-09-24): do not offer it before three months ahead of the first brownout. Deprecated from **2026-09-17**,
  brownouts 2027-03-23 / -03-30 / -04-06 / -04-13, unsupported 2027-04-17 (`actions/runner-images#14254`).
  `release.yml` builds Linux on it deliberately, for the glibc floor the `.deb` links against.
  `checks.yml` pins it only to match that matrix — it bundles nothing, it builds and tests, so the
  glibc reason never applied there; its comment claimed it anyway until corrected on 2026-09-11.
  Either way **do not switch to `ubuntu-latest`**: the replacement (a `container: ubuntu:22.04` job,
  or `cargo-zigbuild`) has to be picked once for all three t4 repos. Recorded in
  `docs/archive/plans/ci-alignment-round-2.md` §5; nothing breaks on the deprecation date itself.
  - (2026-09-27, updated 2026-10-05) **Whatever replaces it keeps `libwayland-client` out of the AppImage.** The build
    host's copy breaks newer hosts (`open-items-done.md` §P). The repack that stripped it went with tauri-cli 2.12.1,
    whose linuxdeploy (`07333c6`) excludes it itself; `release.yml`'s *Check the AppImage has no libwayland-client*
    fails the run if it comes back. Any older-than-the-user build host needs that check, a `container: ubuntu:22.04` job
    included.
  - (§K, 2026-09-16) **Still pinned** in `checks.yml:28` and `release.yml:116`, and **the sibling app
    is in exactly the same state** (asked and answered 2026-09-16: still pinned, no decision recorded,
    the reasoning lives only in its archived `ci-alignment*.md`). So the cross-repo decision is genuinely
    unmade. The deprecation is a **label warning, not a break** — the first hard failure is the
    2027-03-23 brownout. If the Linux leg moves into a `container:`, check rustfmt is in
    the image: the sibling app runs `Format` on the Linux leg only.
- **The Certum code-signing certificate expires 2027-09-22.** After that, Release fails on Windows — most likely at
  *Bundle and sign* (Certum's service won't sign with an expired certificate), else at *Check the Windows
  signature*; releases already signed stay valid (the signatures are timestamped). **Renew by 2027-08-22**, then
  update the thumbprint in `release.yml` (*Check the Windows signature*) and in the sibling app's. Added
  2026-09-30 (close-out Phase 1b, D5).

## Q. Accepted limits — open, each with a reopen trigger

_Added 2026-09-28 (`docs/archive/plans/2026-09-28-claude-md-wording-plan.md`)._
- **The rule:** an accepted limit with a reopen trigger is open and lives here; one with no trigger is closed and
  lives in `open-items-done.md`, in the section it came from or a new dated section. A row marked "do not
  re-offer" keeps that note here: it is raised again only if its trigger fires.
- **When one closes** (its trigger fired and it was fixed, or the trigger no longer applies): it moves to
  `open-items-done.md` §Q; the pointer at its origin stays.
- **Plans:** accepted-limit tables inside live plans stay in those plans. When a plan is archived, its accepted
  limits that have a reopen trigger move here, since archived plans are frozen.
- **Scope:** the rule covers this file, the done file and the plans. A smoke doc's inline "accepted" note describes
  a walk's expected result and stays where it is.

The rows moved in on 2026-09-28 came from elsewhere in this file and from the done file, and later rows from the
phases that accepted them; each origin keeps a pointer.

- **Linux: real GPU hardware and a HiDPI panel not walked.** The WebKitGTK rendering walks ran under WSLg
  (2026-09-05) and on a VMware guest (2026-09-27). Accepted 2026-09-27, until a report, in the Wayland rendering walk
  (`docs/archive/walks/2026-09-27-linux-wayland-rendering-walk.md`, *Not covered*). **Reopen:** a user reports a
  GPU-specific or HiDPI bug. *From §B, Linux rendering.*
- **F7 of the 2026-09-27 fix batch: no focus ring after Ctrl/⌘-only chords on WebKitGTK.** Focus moved by script
  back from a text field after only Ctrl/⌘ chords (a click, then Ctrl+K twice; a paste, then Ctrl+Enter in the
  commit window) comes back unmarked. Chromium is expected to ring it; unwalked. The fix would be to also mark in
  `focusin` when `relatedTarget` is an input or textarea. Accepted 2026-09-27 (the fix batch). **Reopen:** a
  report, or the next WebKitGTK focus work. *From `open-items-done.md` §O.*
- **Linux harness: ssh cases not covered under the moved `HOME`.** Other ssh hosts, a fetch/push through the app
  itself, the unisolated `~/.ssh`, and ssh signing under the moved `HOME` (the last two documented in
  `smoke-linux.md` §2). Accepted in the 2026-09-27 triage of the T4 row (ssh under the moved `HOME`).
  **Reopen:** a harness walk that needs one of them. *From `open-items-done.md` §P, the T4 row.*
- **AppImage fix untested on an Ubuntu 22.04 host and with the NVIDIA proprietary driver.** Accepted 2026-09-26 (the
  22.04 host) and 2026-09-27 (NVIDIA), in the AppImage plan (L5). **Reopen:** a report from either. *From §P, the
  AppImage row (now in the done file §P).*
- **AppImage always under XWayland; some GPUs need `WEBKIT_DISABLE_DMABUF_RENDERER=1`.** The app forces
  `GDK_BACKEND=x11` itself inside an AppImage (`src-tauri/src/main.rs`), since the GTK hook of tauri-cli 2.12.1 no
  longer does. On a VMware SVGA II guest, XWayland also needs `WEBKIT_DISABLE_DMABUF_RENDERER=1`; the system `.deb`
  under `GDK_BACKEND=x11` is blank too. Decided 2026-09-27: no `WEBKIT_DISABLE_DMABUF_RENDERER` switch in the app (it
  would slow every AppImage user); the README documents the variable instead. **Reopen:** a report that the README
  workaround isn't enough. The second trigger, Tauri's AppImage dropping the forced `GDK_BACKEND=x11`, fired with
  tauri-cli 2.12.1 (2026-10-04); the owner kept X11, always (N1 of `docs/archive/plans/2026-10-04-tauri-2.12-plan.md`),
  so the row stands. *From §P, the AppImage row (now in the done file §P).*
- **No timeout on git ops.** A stuck ssh or https op ends only on Cancel. By choice (triage 2026-09-27): a timeout
  would misfire on a slow fetch or clone. **Reopen:** a report of a hang the ssh fail-fast change doesn't cover.
  *From `open-items-done.md` §P, the ssh prompts row.*
- **A crash after the restore report still loops.** The report fires when the log walk starts
  (`repoStore.ts:347`); a crash later in the walk or the refs load happens after the breaker's mark clears.
  **Reopen:** a loop is reported that gets past the breaker. *From `open-items-done.md` §P.*
- **The breaker can trip without a crash.** A kill during a slow restore (any OS; on a bare Xvfb, the stall with a
  second window stuck on *Starting*, `open-items-done.md` §O) can't be told from a crash; and without single-instance
  (no session bus, `window.rs:287-288`), a second process finds the first one's live mark. Either way the session is set
  aside once, with the file kept. **Reopen:** a false trip is reported. *From `open-items-done.md` §P.*
- **`Ctrl+,` does nothing while the start screen opens a repository.** While a repository opens, the *Opening…*
  overlay (`App.tsx:232`, `z-index: 50`, above dialogs at 40, swallowing clicks) covers the start screen, so
  Settings opened then would sit invisible under it, holding the keyboard, until the repo window replaces it.
  Only Init (`StartScreen.tsx:94-96`) and the overlay's 150 ms fade-in are uncovered. Accepted 2026-09-28 (Q1), no
  code. **Reopen:** the gap feels long. *From §L (in the done file).*
- **macOS notarization: won't do for now.** Needs a paid Apple Developer account. The app is signed with the shared
  self-signed certificate (stable identity, so folder grants survive updates), and the release body carries the
  quarantine step. Closed 2026-09-26 (close-out Phase 0). **Reopen:** there is a Mac user. *From the done file §B.*
- **Push sends a bare branch name.** `git push origin main` is ambiguous when a tag is also named `main`. git
  refuses that push ("src refspec main matches more than one"), so nothing is ever pushed to the wrong place; the
  case is rare; and the fix — always `refs/heads/…` — makes every push preview longer, the line the user reads
  before confirming. Closed 2026-09-20, will not fix (the 2026-09-20 review, F4 / decision D5). **Do not
  re-offer** unless the trigger fires. **Reopen:** the refusal is reported as confusing. *From the done file §I.*
- **F7 / Linux residual risk (the 2026-09-20 review): a malformed `DBUS_SESSION_BUS_ADDRESS` panics at startup.**
  `tauri-plugin-single-instance` 2.4.5 `platform_impl/linux.rs:56` unwraps
  `zbus::blocking::connection::Builder::session()`. With no session bus at all the address still resolves (zbus
  falls back to `$XDG_RUNTIME_DIR/bus`, then `/run/user/<euid>/bus`), the connect fails, and the app starts as
  before — one process per launch, no guard. Only a `DBUS_SESSION_BUS_ADDRESS` that is set but unparseable (empty,
  no `transport:`) panics at startup. All three launched under WSLg 2026-09-21 on a build of `7cc503b`: with the
  session bus a second launch hands over (one process, two windows); with the variable unset and an empty
  `XDG_RUNTIME_DIR` both launches start, two processes; with `DBUS_SESSION_BUS_ADDRESS=garbage` or set empty the app
  panics at `linux.rs:57`. Accepted by the user 2026-09-21. **Reopen:** a user reports a startup crash on Linux,
  or the plugin stops unwrapping. *From the done file §I.*
- **The `Menu.tsx` ceiling: a submenu panel takes the parent's width.** A submenu panel is `.menu`-wide, so the
  parent's width stands in for its width; the `ponytail:` comment in `Menu.tsx` still names it. Closed 2026-09-26,
  will not fix (close-out Phase 0). **Reopen:** a submenu's labels clip. *From the done file §I.*
- **A working-tree write in the 50 ms after an op isn't shown until Refresh.** `watch.rs` drops events stamped
  before `un-suppress + SUPPRESS_GRACE` as the operation's own, and the post-operation status read has already run.
  Narrowed 2026-09-21 (`bbb7e7f`, BD 18): inside the grace the watcher drops only the kinds the operation declared,
  so what is missed is a foreign write *of a declared kind* in those 50 ms — everything, for the operations that
  declare every kind (pull, merge, checkout). No person is that fast; a tool started by the commit can be, and since
  `cdba0d3` an operation ends while a hook's backgrounded child may still be writing. Accepted 2026-09-21 (Q12).
  The fix, when reopened: one more status read a grace after the operation ends, or classify by path instead of by
  time. **Reopen:** a report of a working-tree write missed after an op, e.g. from a hook's background child
  (trigger added 2026-09-28; the source names only the fix). *From the done file §N.*
- **Opening a dirty repository walks the graph twice.** `src/store/repoStore.ts:263`, `startLog({ kind: "all" },
  {})`, runs before the status is known (the line as of 2026-09-11). The fix needs `open_repo` to report
  dirtiness, and `status()` is the full scan (1.5 s at 47k tracked files, no early-exit "is it dirty" in libgit2),
  so it would trade a re-walk in the background, after the grid is up, for a scan the grid waits on. Clean
  repositories already walk once. Closed 2026-09-11, will not fix. **Do not re-offer** unless the trigger fires.
  **Reopen:** the walker learns to add the working-tree column without restarting. *From the done file §I (the
  reasoning is in its §E).*
- **Dependabot's `glib` 0.18 alert, dismissed.** Unsound `VariantStrIter`, fixed in 0.20; reached through Tauri's gtk
  0.18 pin (`tauri → muda → gtk → atk → glib`), Linux builds only, an API this app never calls. Dismissed
  2026-09-10. **Reopen:** Tauri's pin starts carrying something this app does call (worth a look at each Tauri
  bump). *From the done file §B.*
- **A ref or remote dialog closes, and its input is lost, when its op is refused.** These dialogs call `onClose()`
  before `runOp` (e.g. `src/screens/RepoWindow/dialogs/RefDialogs.tsx:243-244`, `RemoteDialogs.tsx:29-30`); if
  another operation is running, `runOp` refuses with *Operation in progress* (`src/store/opsStore.ts:189-191`) after
  the dialog has closed. No known path is left: the detached-HEAD banner's **Create branch…** button
  (`RepoWindow.tsx:386`, `banners.ts:52`) was the last ungated opener, fixed 2026-09-29 (`d7cfc61`; the row is now
  in the done file's §I). Every other opener is gated: the grid and
  sidebar menus (`RevisionGrid.tsx:310`, `Sidebar.tsx:428`, `:618`), the toolbar, the palette and Ctrl+B; shortcuts
  are ignored while a dialog is open (`useShortcuts.ts:36`); nothing starts an op in the background. Recorded in
  the worktrees + submodules notes (shipped 2026-09-13). The fix, when reopened: stay open on a `busy` refusal, as
  `WorktreeDialogs.tsx:150-152` does (`runOp` already returns `error.kind === "busy"`; the source's "`ran` flag on
  `runOp`" is superseded). **Reopen:** it bites — a report of a dialog closing on a refused op. *From the done
  file's context notes.*
- **The crash breaker doesn't catch a webview-only crash.** It catches the app process dying. If only the webview
  dies (WebView2's renderer process, WebKit's web process) while the app lives on, the window goes blank, and
  closing it counts as that window's report (`window_closed` settles it by design), so a repository that kills just
  the renderer on load still loops. Catching it would need each webview's crash event (WebView2 `ProcessFailed`,
  WebKitGTK `web-process-terminated`): no Tauri event carries it, so platform code through `with_webview`.
  Accepted 2026-09-29. **Reopen:** a renderer-crash loop is reported. *From close-out Phase 2a's change review (L1).*
- **The newer blame or history read can lose the cancel race to an older one sent in the same instant.** Each read
  cancels the one before it in the order the requests start (`RepoHandle::supersede_blame` / `supersede_history`),
  but each invoke is its own task on the multi-thread runtime, so two sent in the same JavaScript tick can start in
  either order; the newer then ends *Cancelled*, shown in the grid or the blame pane. No caller sends two in one
  tick today. Accepted 2026-09-29. **Reopen:** a *Cancelled* shows for the current blame or history. *From close-out
  Phase 2a's change review (L2).*
- **The sidebar comes back at its last actual width, not only a dragged one.** A width is kept across a view switch
  that hid the sidebar (`RepoWindow.tsx`, the `width` ref), from the panel's `onResize`, so a width a narrow window
  squeezed comes back squeezed; a 0-px report (a minimised window) is ignored. Recording only drags would need
  gesture tracking like the output dock's. Accepted 2026-09-29. **Reopen:** a sidebar comes back at a width the
  user didn't set. *From close-out Phase 2a's change review (R4).*
- **An older history call can restart a newer one's walk.** `start_log` takes the log generation (`LogCache::begin`)
  after `compute_labels`, so of two quick path calls the older one, finishing its labels last, takes the newer
  generation and stops the newer walk; its own `path_history` is then cancelled, and the newer view's next page
  fetch sees a stale generation and restarts its walk (`repoStore.ts:286-288`). At most a brief reload of the
  newer history. Accepted 2026-09-29. **Reopen:** a history view flickers or reloads after quick path changes; the
  fix is to take the generation at the top of `start_log`, with the token swap. *From close-out Phase 2a's change
  review.*
- **Two stacked dialogs would both close on one Esc.** Each open `Dialog` adds a capture-phase document `keydown`
  listener for Esc on `<body>` (`Dialog.tsx`), and `stopPropagation` doesn't stop other listeners on the same node.
  The app never stacks dialogs today (`DialogHost` renders one; the start screen's Clone and Settings exclude each
  other; Commit & Push swaps in one commit). Accepted 2026-09-29. **Reopen:** a flow opens a dialog over another;
  then act only when this form is the last `form[role=dialog]`. *From close-out Phase 2a's change review.*
- **The sidebar-width test mocks `react-resizable-panels`.** jsdom can't lay out panels, so `RepoWindow.test.tsx`
  stubs the library; that a real drag reports `onResize` in pixels was checked by smoke group BH 10 and the
  library's types only. Accepted 2026-09-29. **Reopen:** a `react-resizable-panels` upgrade — re-walk BH 10. *From
  close-out Phase 2a's change review.*
- **A Flatpak or snap build would need its own way to start host programs.** The 0.10.14 scrub (`host_command`)
  handles an AppImage's environment only; inside a Flatpak or snap sandbox a host program is reached through
  `flatpak-spawn --host` or not at all. None is planned. Accepted 2026-09-29. **Reopen:** a Flatpak or snap build is
  planned. *From the 0.10.14 hotfix plan's triage (T6).*
- ***Open* inside an AppImage parks one thread per open while `xdg-open` runs.** `open_on_host`
  (`src-tauri/src/commands/repo.rs`) skips the `open` crate's double fork: `git_core::tools::detach`'s thread waits
  on `xdg-open`, which in its generic fallback can wait for the opened program. A parked thread costs little, and
  opens are user clicks. Accepted 2026-09-29. **Reopen:** the thread count or memory grows noticeably over a long
  session. *From the 0.10.14 hotfix plan's triage (T7).*
- **A blame test failed once on Windows inside the test helper's `index.add_path`** — its reopen trigger fired
  twice on 2026-10-01; no longer an accepted limit, moved to §V (*A Windows flake inside `TempRepo` test helpers*).
  *From the 0.10.14 hotfix's change review (triage T-B).*
- **Inside an AppImage, every process the app starts is forked, not `posix_spawn`ed.** Two causes, both from the
  0.10.14 hotfix (`crates/git-core/src/lib.rs`): std forks whenever a child's `PATH` is changed and the program is
  named without a path, and `host_env` always rewrites `PATH` inside an AppImage (git by default, the tools' `sh`,
  `xdg-open`, the VS Code fallback); `drop_inherited_fds`' `pre_exec` hook makes std fork the rest (the relaunch,
  a git path set in Settings). Each start copies the app's page tables: reasoned at about 1–3 ms, not measured.
  Under strict overcommit (`vm.overcommit_memory=2`) a fork of a large process can fail with `ENOMEM` (reasoned, not
  seen). Linux AppImage only. Accepted 2026-09-29. **Reopen:** AppImage users report slow status or refresh on Linux,
  or a spawn failing with out-of-memory — then measure spawns against 0.10.13. *From the 0.10.14 hotfix's change
  review (pass 7, after the BI 8 re-walk).*
- **The end-to-end file-handle test's control doesn't go through git.** `crates/git-core/tests/host_env.rs` checks
  that an inherited pipe reaches a plain `test` before the fake mount and doesn't reach git's alias after it; if git
  or `sh` ever closed inherited descriptors themselves, the test would pass without the hook. git's `run_command`
  closes none today, and with the hook's call removed the test failed (run on WSL, 2026-09-29). Accepted 2026-09-29.
  **Reopen:** a git upgrade changes how it starts hooks or aliases — then run the same alias before the mount as the
  control. *From the 0.10.14 hotfix's change review (pass 8).*
- **One unexplained crash-reporter entry at an AppImage quit.** At the Quit that ended the final build's BI 1–7 walk
  on the VM, apport logged *executable was modified after program start*, 28 ms before the unmount: most likely a
  process running from the image (the app or a WebKit helper) crashed as it exited (reasoned, not verified; the
  process and signal weren't recorded). No dialog. Not reproduced in 6 later quits (the same spawn-heavy sequence with
  and without strace, and on the desktop); in the five on Xvfb all three image processes held the keepalive. Details:
  `docs/archive/walks/2026-09-29-group-bi-walk.md`. Accepted 2026-09-29. **Reopen:** it is seen again, or a user
  reports a crash at an AppImage quit — then run with `strace -f -e trace=none -e signal=all` attached from launch
  through the quit. The same entry came from a 0.10.13 AppImage (no fd change) stopped with SIGTERM, 111 ms before its
  image unmounted, during the v0.10.14 gate (`docs/archive/walks/2026-09-29-v0.10.14-release-gate-linux.md`), so it
  isn't unique to the hotfix. *From the 0.10.14 hotfix's BI re-walk.*
- **What the Release build still fetches unpinned.** `toolchain: stable` (whatever rustup resolves that day); the apt
  packages, unpinned and with no version floor (`squashfs-tools`' floor, triage U5, went with the AppImage repack at
  tauri-cli 2.12.1), `python3-cryptography` an import check; and two downloads the Windows bundler makes during *Bundle
  and sign* with the keys in env, `nsis-3.11.zip` and `nsis_tauri_utils.dll` v0.5.3 (both from `tauri-apps` GitHub
  releases; the DLL is then signed with our certificate as an NSIS plugin; seen in dry run 36674994686's log). The
  bundler checks both against a SHA-1 (read in tauri-bundler 2.9.4, `nsis/mod.rs`; 2.10.1, which tauri-cli 2.12.1 locks,
  has the same URLs, `nsis_tauri_utils` v0.5.3). The `Downloading` check on the bundle log runs on Linux only, so a
  third Windows download would not be caught. Accepted 2026-10-01 (close-out Phase 1b, triage T3). **Reopen:** a bundler
  change moves either fetch or adds a Windows download, or a toolchain release breaks the build. *From Phase 1b's change
  review (`docs/archive/plans/2026-09-30-phase-1b-plan.md`, "Not in this phase").*
- **On Linux and macOS a tool open holds the repository's git2 lock ~300 ms.** Detecting an early-failing custom
  tool (exit 126/127 within 300 ms, unix only) waits under the lock; other git2 reads of that repository stall
  meanwhile. A `ponytail:` comment in `crates/git-core/src/tools.rs` names it. Accepted 2026-10-01 (close-out
  Phase 2b, D4). **Reopen:** a report of a stall while opening a tool — then narrow the lock (spawn after it's
  dropped). *From the 2026-10-01 Phase 2b plan (row 3), §S.*
- **A custom tool that exits at once for another reason still shows *Opened*.** The 300 ms exit-126/127 check
  (unix only) misses the Windows `.cmd` shim with a missing target, a user-typed macOS `open -a`, and any early
  exit other than 126/127. Accepted 2026-10-01 (close-out Phase 2b, D17). **Reopen:** a report of a silent failed
  tool start. *From the 2026-10-01 Phase 2b plan (row 3), §S.*
- **Arrowing over a clipped menu row wraps it and moves the rows below.** A keyboard-focused menu row whose name
  clips past 280 px grows to 2+ lines while focused, shifting every row below it. Accepted 2026-10-01 (close-out
  Phase 2b, D5). **Reopen:** a report, or a menu whose rows commonly clip. *From the 2026-10-01 Phase 2b plan
  (row 4), §M.*
- **Changes lists a non-UTF-8 path under a replaced name; staging it, its diff and its history fail.** The Files
  tab now skips non-UTF-8 paths and says so (a count note); Changes still lists them under a replaced name, since
  hiding a change is worse than a failing stage. Accepted 2026-10-01 (close-out Phase 2b, D11(a)). **Added
  2026-10-03 (close-out Phase 3, Q26):** a staged rename whose old name isn't UTF-8 reads as its new path Added. The
  panel's rename hint carries the old name lossily, so the commit panel's two-path diff finds no Deleted side and
  shows the new path Added with no rename header (the whole-repository rebuild before Phase 3 paired it); line
  staging stays consistent with what is shown. On Windows only for a name already in the index. **Reopen:** a
  report. *From the 2026-10-01 Phase 2b plan (row 11), §I.*
- **A kill during the interactive rebase's read pass leaves the changes in the autostash until Abort.** The read
  pass (listing the todo) runs a real `rebase -i --autostash`; git's clean-tree check precedes the editor, so the
  read pass needs the flag. Proven recoverable (`git rebase --abort`) by a unix test. Accepted 2026-10-01
  (close-out Phase 2b, D12). **Reopen:** a stranded autostash is reported, or the dock's Cancel becomes reachable
  during the read. *From the 2026-10-01 Phase 2b plan (row 12), §I.*
- **Closing a window lets its repository's running op finish unseen.** `drop_repo` (from `close_repo` or a closed
  window) never cancels an in-flight op; letting it finish is the safer failure — killing a rebase, merge or commit
  halfway strands exactly the autostash row's state. The comment on `drop_repo` is corrected to say so. Accepted
  2026-10-01 (close-out Phase 2b, D13). **Amended 2026-10-03 (close-out Phase 3, T7, L5, Q20):** the status scan is
  now the exception — a close cancels it and kills its git. And a reopened handle's ops wait for a stat-cache repair
  or an op the closed one left running, instead of overlapping it: the op lock (`scan_lock`) is shared by every handle
  on one git directory, and `mutate` holds it for the whole op (`src-tauri/src/commands/stage.rs:56-77`). No `Busy`
  shows while such an op waits; its own spinner or progress bar runs until the other op ends. See also *The
  stat-cache repair holds `index.lock` for its run* below. **Reopen:** an op left running by a closed window reported
  finishing unseen, or a request to stop an op by closing its window. *From the 2026-10-01 Phase 2b plan (row 13),
  §I.*
- **After a selection shrinks to one row by itself, the header offers Stage all.** The Changes header shows
  *Stage selected* / *Unstage selected* only at 2+ rows selected; if the selection shrinks to one without a header
  action (staging one of two selected rows with its own +, or a watcher refresh), the header silently reads
  *Stage all* — still true when clicked, and Unstage undoes it. Accepted 2026-10-01 (close-out Phase 2b, D14).
  **Reopen:** a walk or report stages the whole list meaning the shrunken selection. *From the 2026-10-01 Phase 2b
  plan (row 14), §I.*
- **Commit can be enabled for a moment after an external merge abort; git refuses.** The staged count (status) and
  the merging flag (refs) refresh separately; the conflicts pairing's `stranded` is now guarded by `freshStatus`,
  but `canCommit` isn't — guarding it too would grey Commit for one status scan at every merge/rebase start and
  end. Accepted 2026-10-01 (close-out Phase 2b, D15). **Reopen:** a failure toast traced to that window. *From the
  2026-10-01 Phase 2b plan (row 15), §I.*
- **A mouse-opened menu's unmarked first item is still activated by Enter.** After grid arrows, a mouse
  right-click opens a `ContextMenu` with its first item focused but no longer keyboard-marked (row 4's fix,
  `b1241e4`: a pointer-opened menu no longer marks its first item); Enter still activates it, same as a
  mouse-only session on `main`. Accepted 2026-10-01 (close-out Phase 2b triage, B1). **Reopen:** a report of an
  unintended action from Enter after a right-click. *From the Phase 2b triage.*
- **`DetailsPane` double-mounts under React StrictMode in dev, while blame is shown under a path filter.** Dev-only;
  harmless duplicate work. Accepted 2026-10-01 (close-out Phase 2b triage, B4). **Reopen:** it confuses
  development. *From the Phase 2b triage.*
- **The Files tab's first visit to a commit takes ~270–300 ms at ~100k files.** Each commit's listing is fetched,
  sent and built once (a revisit, an expand or a collapse then takes 20–30 ms). Measured 274 ms median (worst 300)
  on `perf-synth` in smoke group BL 7, after fix 6a (Stage A: 407 ms clean, 520 ms with 12k working-tree changes).
  Accepted 2026-10-02 (close-out Phase 3, B3); rejected: a per-folder lazy listing (a large change for the least-seen
  case) and a binary payload (gain unmeasured). **Reopen:** a first visit reported slow, or measured ≥ 250 ms on a
  repository well under 100k files. *From close-out Phase 3 (row 6a).*
- **Some ref moves still take the merged badges' full walk.** Fix 1b keeps the badges as a reachability matrix over the
  tip oids and adds a new tip with one hiding walk; a backward move, a reset, an amend, a new branch or a fetched branch
  based on a commit no boundary tip reaches, and a fetch moving more than 16 tips fall back to the full walk: a walk of
  491–614 ms in a refs read of 549–660 ms on `perf-synth` and `perf-git` (BL 1's backward moves). The commonest in the
  UI are the grid's *Create branch here…* and *Reset … to here…* on a non-tip row. A `ponytail:` comment in
  `crates/git-core/src/refs.rs` names it. On a history with clock skew (a commit stamped older than its parent; git/git
  has some) the full walk can lose reachers, and the hiding walk also leans on dates (reasoned), so the two paths can
  differ there; BL 1 compared badges on `perf-synth` only (no skew). Accepted 2026-10-02 (close-out Phase 3, L1).
  **Reopen:** a sidebar reported late after one of those actions on a real repository, or a merged badge reported wrong.
  *From close-out Phase 3 (fix 1b).*
- **A few stale index entries are re-hashed by every status scan.** Scans no longer write the index (D-1); the stat
  cache is repaired (`git update-index -q --refresh`) only after a scan whose git run took ≥ 1 s (`REFRESH_AFTER`). A
  few stale entries that don't make a scan that slow are re-hashed by every scan until a slow scan or a terminal
  `git status` refreshes them (cheap: the stale files only). Accepted 2026-10-02 (close-out Phase 3, L2). **Reopen:**
  warm scans measured or reported slow on a real repository with no repair following. *From close-out Phase 3
  (fix 3).*
- **The app's status scans don't save `core.fsmonitor` / `core.untrackedCache` state.** Both still apply to the scan,
  but a lock-free scan (`GIT_OPTIONAL_LOCKS=0`) writes no index, so their saved state (the fsmonitor token, the
  untracked cache) isn't updated by it (reasoned, not measured). Accepted 2026-10-02 (close-out Phase 3, L3).
  **Reopen:** a repository with either set reported or measured slower to scan in the app than `git status` in a
  terminal. *From close-out Phase 3 (fix 3).*
- **The stat-cache repair holds `index.lock` for its run.** Only after a slow scan (≥ 1 s): an app op started meanwhile
  waits for it, and a terminal `git add` during it fails on `index.lock`. It took 0.5–7.2 s in the BL walks (2.8 s
  after all 100k files of `perf-synth` were touched, on Windows). Its lock is shared by every handle on one git
  directory (L5), so a reopened repository's ops wait for it too — *Closing a window lets its repository's running op
  finish unseen*, above. Accepted 2026-10-02 (close-out Phase 3, X2); rejected: running it outside the op lock (the
  app's own ops would then fail on `index.lock` instead of waiting). **Reopen:** an `index.lock` error reported from a
  terminal during the app's repair, or an op reported waiting on one. *From close-out Phase 3 (fix 3).*
- **While no stat-cache repair has run, every status scan re-hashes the stale files.** A repair is skipped while an op
  holds the lock, records nothing when it fails on a terminal's `index.lock` (exit 128), and backs off after a scan
  that is still slow after one (D-3, D-4: at most one per 5 minutes, D-6). Until one runs, every scan re-hashes the
  stale files: ~6 s per scan at 100k files touched (`git status` measured 5.9 s; BL 4's stale scan 4.8 s). Accepted
  2026-10-02 (close-out Phase 3, L4). **Reopen:** repeated `slow status` lines with no `status repair` between them
  on a real repository. *From close-out Phase 3 (fix 3).*
- **A staged rename can read differently in Changes and in History.** Changes' rows follow git's status (fix 3), and
  a staged rename's diff in the commit panel always pairs (L6). History and the commit panel's staged line counts
  (`changed_files(Staged)`) keep libgit2's rules: near the similarity threshold (reasoned), and for a symlink or
  score-0 rename, they show the file added + deleted where Changes shows a rename. A staged submodule move
  (`git mv sub sub2`) has no blobs to pair: the commit panel's diff shows only its new path Added, with no rename
  header, under an `old → new` row (Q19). Accepted 2026-10-02 (close-out Phase 3, L6, Q19). **Reopen:** a report of a
  rename shown one way in Changes and another in its diff or in History. *From close-out Phase 3 (fix 2).*
- **Above 3000 edited renames, a staged move reads as Added + Deleted in Changes.** The scan runs with
  `status.renameLimit=3000` (L7: measured with git 2.55 on 3000 files moved, renamed and edited — 0 pairs at the
  default 1000 in 0.11 s, all 3000 unlimited in 3.9 s per scan; quadratic, ~40 s at 10k extrapolated). Above it git
  pairs none of the renames with new names, while libgit2 still pairs per target (verified with git 2.55, libgit2's
  `diff_tform.c` read by the review), so such a move reads Added + Deleted in Changes and as a rename once committed,
  in History. Accepted 2026-10-02 (close-out Phase 3, L7). **Reopen:** a report of a move of more than 3000 renamed
  files shown unpaired. *From close-out Phase 3 (fix 3).*
- **`linked.rs:120`: the worktree / submodule snapshot has no cache.** `snapshot` opens a repository per worktree and
  re-reads every submodule on each refs refresh. It runs unawaited after the refs read, so its cost is a late
  Worktrees / Submodules section, not a late branch list. Measured 2026-10-01 on `perf-linked` (30 worktrees, 20
  submodules): `linked read` 112.8 ms median after F5 (worst 113.5), 107–109 ms on a relaunch, 448 ms once on a cold
  first launch. Closed as measured fine 2026-10-02 with its `ponytail:` comment kept, an accepted ceiling (close-out
  Phase 3, Q16). **Reopen:** a warm `linked read` ≥ 250 ms. *From §I.*
- **Fix 1b's reachability matrix grows with the square of the distinct branch tips.** Measured 2026-10-02 on
  `perf-b3000` (`perf-repo.mjs --branches 3000`: 3002 distinct tips on one line of history, the densest shape): the
  matrix held between refreshes costs +150 MB of private memory (~33 bytes a pair, ~4.5M pairs), and every refresh, a
  ref change or not, ~170 ms of `retain` plus the bitset fill, inside a 1.9 s refs read whose other ~1.6 s is the
  collect fix 1b doesn't touch. 0.10.15 on the same fixture: 87–113 s per refresh. At ~333 distinct tips
  (`perf-synth`) the matrix costs 2–3 ms and no measurable memory; ~17 MB at 1000 dense tips is reasoned, not
  measured. Accepted 2026-10-02 (close-out Phase 3, Q25); rejected: storing the cached matrix as bitsets now, and
  skipping the refill on an unchanged tip set. **Reopen:** a repository with ≥ 1000 branches reported slow or
  memory-heavy, or a refresh measured ≥ 250 ms in the matrix. *From close-out Phase 3 (fix 1b).*
- **A status scan or stat-cache repair running when the app exits can outlive it.** On Quit, or the last window
  closing, a scan or repair runs on until it ends. `drop_repo` never stops a repair
  (`src-tauri/src/commands/repo.rs:177-179`), and whether it even runs on Quit is unresolved: `on_window_destroyed`
  drops each repository before its `exiting` check (`src-tauri/src/lib.rs:121-131`), but the macOS walk logged no
  `closed repo` on ⌘Q in 3 launches (measured); a scan's kill may not land before the exit either (reasoned). The
  repair took 0.5–7.2 s in the walks and holds `index.lock` until done; killing it mid-write would leave a stale
  lock. Accepted 2026-10-03 (close-out Phase 3 triage, C-1). **Reopen:** an `index.lock` error reported right after
  quitting. *From close-out Phase 3's change review.*
- **A commit takes ~170 ms to its toast and ~240 ms to the sidebar on a large repository.** On `perf-synth` (BL 1's
  re-walk): click → toast ~170 ms, click → sidebar 233–247 ms; the refs read after it is ~60 ms, so the rest is the
  commit itself. Accepted 2026-10-03 (close-out Phase 3 triage, C-4). **Reopen:** a commit measured or reported
  ≥ 250 ms from click to toast. *From close-out Phase 3's BL walk.*
- **Tab adoption is Windows-only.** `window_at` (`src-tauri/src/commands/window.rs:627`, its `ponytail:` comment)
  answers only on Windows, so on macOS and Linux a tab dropped on another window's tab strip opens in a new window
  instead of moving there, and a window's only tab dropped on another window does nothing (smoke `:1660-1663` and
  `:1666-1670`, the ⌂ rows). The way round is two steps: close the tab, then open the repository from Recents in the
  other window (opening a repository open elsewhere only brings that window forward, `:1650-1651`). Rejected: building
  it on macOS (`objc2` / `objc2-app-kit`, already in `Cargo.lock`) and on X11 (`x11rb`, likewise) — native code with
  Cocoa's bottom-left, point-scaled coordinates that only a Mac walk could prove; Wayland hides the global pointer
  position. Accepted 2026-10-04 (close-out Phase 5, D1; triage T7). **Reopen:** a macOS or X11 user asks to drag a tab
  into another window. *From §I (the `ponytail:` ceilings).*
- **A screen reader's click opens a dropdown or submenu unmarked.** Since close-out Phase 5 D6 every menu marks its
  first item only when the last input was a key (`lastInputWasKey()`). A click that a screen reader fires with no
  keydown first (NVDA's browse mode, VoiceOver's VO+Space) now opens the menu with its first item focused but not
  highlighted; the old opener rule happened to cover it. The focus and the accessibility tree are unchanged: visual
  only. Reasoned, not tried with a screen reader. Accepted 2026-10-04 (close-out Phase 5 triage, T1). **Reopen:** a
  screen-reader user reports a missing menu highlight. *From close-out Phase 5's change review.*
- **One tear-off drag right after a relaunch made no window.** On the Mac (`cac41ed`, the BN 8 walk), the first drag
  after a relaunch left the tab in its strip and opened no window; not reproduced. Accepted 2026-10-04 (close-out Phase
  5 triage, T24). **Reopen:** a tear-off that does nothing is reported, or seen a second time. A data point, not counted
  as the second sighting (the owner, 2026-10-06): 1 of 43 XTEST tear-off drags on the Linux VM's bare Xvfb (no window
  manager, a setup the same day showed to be unreliable) made no window
  (`docs/archive/walks/2026-10-06-restore-hang-and-az-rewalk.md`, job 4). *From close-out Phase 5's BN walk
  (`docs/archive/walks/2026-10-04-phase-5-macos-walk.md`).*
- **Tear-off across two displays not walked.** A torn-off window is clamped to the screen under the drop point
  (close-out Phase 5, triage T10/T11): physical units on Windows, logical ones on macOS and Linux, where a screen's
  physical rect is its logical one times its own scale. Walked on one display only (the Mac and the Windows VM have
  one each, BN 8); which screen it lands on with two, and mixed scales, is reasoned from the tao / tauri source, not
  measured. Accepted 2026-10-04 (BN 8 ticked on the owner's word). **Reopen:** a second display is available for a walk,
  or a torn-off window is reported opening on the wrong screen. *From close-out Phase 5's BN walk.*
- **On X11 with a window manager, a torn-off window can overhang an edge by about a title bar.** `place()` clamps the
  size the window was built with plus its decorations as read (`src-tauri/src/commands/window.rs`), and on X11 the
  window manager adds its frame only after the window is mapped, so the clamp is short by it: dropped at the bottom or
  right edge, the window can stick out by about a title bar. Reasoned from the code, not measured: the Linux VM's Xvfb
  has no window manager (BN 8 on `4705c6c` was flush there); Windows and macOS read their frame up front and were
  measured flush. Accepted 2026-10-04 (close-out Phase 5 triage, T27). **Reopen:** a clipped title bar is reported, or a
  walk under a window manager measures it.
- **With no main window, a torn-off window can overhang by up to about 100 px.** `spawn` copies `main`'s size into the
  new window; with `main` closed (a tear-off from a second window) the builder gets none, so Tauri's default (800 × 600,
  reasoned) is used, while `place()` clamps the 700 × 500 floor in its stead (its `ponytail:` comment): near the
  bottom-right corner the window can overhang by the difference. Reading the real size isn't safe there (an X11 window
  not yet configured reads tiny, the bug `4705c6c` fixed). Fix sketch: always give the builder a size. Reasoned, not
  walked. Accepted 2026-10-04 (close-out Phase 5 triage, T29). **Reopen:** reported, or the next change to the
  tear-off code.
- **On X11 with no window manager, a `main` saved bigger than the screen can launch stuck on the start spinner.**
  Measured 2026-10-04 on the Linux VM (Xvfb 1600 × 1000, WebKitGTK 2.52.6): saved at 1700 × 1100, 13 of 14 launches on
  `4705c6c` stalled, and 3 of 3 on `a6a7a76` (v0.10.17's source), so it predates Phase 5. The page's JavaScript and
  rendering run on, but its calls to Rust never arrive (an `invoke` from the stuck page goes unanswered and unlogged);
  Rust's threads are idle, not deadlocked. A resize WebKit acts on wakes it. Under openbox the window manager shrinks
  the window to the screen and 3 of 3 loaded. **Measured 2026-10-06** (jobs 4–6,
  `docs/archive/walks/2026-10-06-restore-hang-and-az-rewalk.md`): the trigger is window area, with a threshold between
  1.73 and 1.87 Mpx (not "the further past the screen, no fixed threshold" as first guessed). Under gdb the main thread
  is waiting on an X reply (`XGetWindowProperty`, `net_wm_hint`), not a deadlock, with Xvfb at about 92% CPU. The same
  signature (Xvfb pinned, the new page never reaching Rust) hit 33 of 150 detaches on a bare Xvfb, against 0 of 150 on
  GNOME/Xwayland and 0 of 150 under openbox; an unmap+map frees a page stuck this way. Why a window manager prevents it
  is reasoned, not measured. §O's "a restored second window sometimes never starts" (0 of 50 restores on bare Xvfb in
  job 4; its detach cousin is the stall above) was folded into this row 2026-10-06 (`open-items-done.md` §O).
  `smoke-linux.md` §2 says to keep the saved window within the screen; the Linux harness now runs openbox for
  multi-window and restore rows. Accepted 2026-10-04 (close-out Phase 5 triage, T26); refined 2026-10-06. **Reopen:**
  seen on a real desktop or under a window manager.
- **N6's Windows update-path persist:** done 2026-10-07 (the v0.10.21 gate), moved to `open-items-done.md` §Q.
- **N6's Linux full screen, set from the window manager's own menu, isn't seen.** tao's `fullscreen()` on Linux
  reflects only the app's own full screen (`linux/window.rs:699-710`), so a window manager's full screen is
  recorded as a screen-sized normal rect, and relaunched clamped to the work area. Accepted 2026-10-05 (the Tauri
  2.12 triage, N6's design). **Reopen:** a Linux report of a window coming back screen-sized. *From
  `docs/archive/plans/2026-10-04-tauri-2.12-plan.md`, "Triage (2026-10-05) and its fixes" (Records).*
- **N8's first session after an update from 0.10.18 records `x11` as the user's `GDK_BACKEND`.** The relaunch from
  0.10.18's old hook passes `GDK_BACKEND=x11`, which N8 then records as if it were the user's own value, and hands
  it back to children in later sessions. Accepted 2026-10-05 (the Tauri 2.12 triage, N8's design). **Reopen:** a
  tool started from the app under XWayland right after an update. *From
  `docs/archive/plans/2026-10-04-tauri-2.12-plan.md`, "Triage (2026-10-05) and its fixes" (Records).*
- **TLS roots for the update check on a non-Debian distribution (#1).** Updater 2.13 dropped the `SSL_CERT_*`
  defaults the old hook set; walked only on Debian-family hosts. Accepted 2026-10-05 (the Tauri 2.12 triage).
  **Reopen:** a report of a failing update check from a non-Debian distribution.
- **CI loses its only `appimage-digest.py --check` on the built image (#2).** The strip script that ran it was
  removed; the gate's walk still checks the *published* AppImage. Accepted 2026-10-05 (the Tauri 2.12 triage).
  **Reopen:** the gate's `--check` fails on a published AppImage.
- **New AppImage stderr line, `GStreamer element appsink not found. Please install it.` (#4).** Seen on the
  branch's AppImage in BO 10, new with the 2.12 bundle; its cause not traced. Accepted 2026-10-05 (the Tauri 2.12
  triage). **Reopen:** media is needed in the webview, or a GStreamer-related crash is reported.
- **With GNOME File History off, every AppImage picker opens in the mount (#6).** Pre-existing in 0.10.18 (the
  bundled XSETTINGS), not a 2.12 regression; N4's `GSETTINGS_BACKEND=memory` fix doesn't reach it. Accepted
  2026-10-05 (the Tauri 2.12 triage). **Reopen:** a report of a picker opening inside the AppImage.
- **The AppImage ignores the user's GNOME settings (#7).** As 0.10.18 did; the GNOME proxy is moot under the
  app's CSP. Accepted 2026-10-05 (the Tauri 2.12 triage). **Reopen:** a report that a GNOME setting isn't honoured
  in the AppImage.
- **Linux: BO 3's maximize is unreachable under Xvfb (#38).** No window manager on the Linux VM's harness; BO 3's
  maximized case walked on Windows only. Accepted 2026-10-05 (the Tauri 2.12 triage). **Reopen:** a window manager
  in the Linux harness, or a Linux maximize report.
- **The folder-picker sidebar shows a `usr` entry (#41).** Cosmetic: it's the app's own working folder inside the
  AppImage mount, pre-existing. Accepted 2026-10-05 (the Tauri 2.12 triage). **Reopen:** a report, or start-folder
  work on the pickers.
- **One thread per `Moved`/`Resized` event during a drag (round 2, R1).** N6's settle timer (`sample_soon`) spawns
  a `std::thread` per event, so a drag can have roughly 20–40 threads alive at once; a per-label pending timer
  (~10 lines) would avoid it. Accepted 2026-10-05 (the Tauri 2.12 triage, round 2). **Reopen:** a drag stutters, or
  the thread count spikes.
- **G3 (a menu item's first XTEST click needing two):** merged into T15, `open-items.md` §Z, at the post-gate docs
  commit (D33); both stay open (D35).
- **Return in the Fetch dialog's remote dropdown seemed to start a fetch once on Linux.** At the v0.10.20 Linux gate
  (bare Xvfb), `git` started before the Fetch click, right after a Return in the dropdown; a second try didn't. On
  the Windows VM (2026-10-06, `cc6d58f`, CDP) Return there never submits: the dropdown is a custom combobox whose
  Enter and Space only open the list or pick (`src/components/ui/Input/Input.tsx`, `Select`), while Return on a
  native field, such as the Prune checkbox, submits the dialog by design (`Dialog` is a `<form>`, "Enter submits").
  Which element had the focus on Linux wasn't recorded; one Tab too far, or WebKitGTK treating Enter on a
  `type="button"` differently, are both reasoned only. Accepted 2026-10-06 (the v0.10.20 gate triage). **Reopen:** a
  fetch started by Return in the remote dropdown, seen again. *From
  `docs/archive/walks/2026-10-06-v0.10.20-release-gate-linux.md`.*
- **External diff/merge tools set outside the app are read only at startup.** A tool set directly in git config
  (not through Settings) shows no effect until the app is relaunched: Settings › Diff & merge and the diff
  button still show the old tool (or None) until then. Measured on Linux (D1 of the walk below): a `difftool`
  added to the isolated `.gitconfig` by hand left the button saying "No diff tool set" and Settings showing None
  until quit + relaunch, after which it read "Open in nosuch" (`settingsStore.ts:87-96`). Accepted 2026-10-06 (the
  Linux track's C+D walk). **Reopen:** a report that a tool set outside the app isn't picked up. *From
  `docs/archive/walks/2026-10-06-linux-track-c-d-walk.md`.*
- **A local clone into its own source folder makes an empty repository.** The Clone dialog auto-fills the folder
  name from a local path inside the chosen parent; git creates the destination, finds it as an empty source and
  "clones" an empty repository, which the app opens. Measured on Windows; git's own behaviour; pre-existing.
  Accepted 2026-10-06 (the ssh-fail-fast triage, T11). **Reopen:** a report of an empty repository after a local
  clone.
- **The *Checkout local…* picker blanks every option's counts when one comparison fails.** It fetches every
  candidate's ahead/behind in one `Promise.all` with an empty `catch` (`OpsDialogs.tsx`, `CheckoutLocalDialog`), so
  one failed walk (a missing or corrupt object) leaves every option as a plain name with the general warning and a
  danger button, and no message says why. Fails safe; unmeasured how often a walk fails. Accepted 2026-10-07 (the
  checkout-remote-elsewhere triage, T2). **Reopen:** a picker shows blank counts in real use, or any comparison
  failure is reported.
- **The *Checkout local…* picker starts every candidate's comparison at once.** Each opens its own repository
  handle (~100 ms cold, per the comment at `repo.rs:219-220`), so 50 trackers of one remote means 50 opens together
  and counts that may lag; until they land, plain names and a danger button. Not measured at that size; 50 trackers
  of one remote is a pathological setup. Accepted 2026-10-07 (the checkout-remote-elsewhere triage, T3).
  **Reopen:** a real repository with enough trackers of one remote that the counts lag visibly.

## R. Added 2026-09-29 — close-out Phase 2a's change review, deferred

- **macOS: an Option-typed character never reaches a select's type-ahead:** fixed 2026-10-04 (close-out Phase 5, M4),
  moved to `open-items-done.md` §R.

## S. Added 2026-09-29 — v0.10.13's AppImage release walk

- **Review the limits the 0.10.14 hotfix's change review accepted in bulk.** 21 small items (edge cases,
  pre-existing behaviour, trades already chosen, doc style) were accepted as closed without a one-by-one ruling, to
  be looked at later: `docs/plans/open-items-done.md` §T. **Next:** the owner goes through §T and moves any item
  back here. *(Owner, when time allows.)*

## V. Added 2026-10-01 — close-out Phase 2b

Found in close-out Phase 2b (plan `docs/archive/plans/2026-10-01-phase-2b-plan.md`): the Linux track's two walks the
plan owed it, every item the triage sent here with a *DEFER §V* ruling (from the BK walk and the review passes),
and the §Q flake row whose trigger fired.

- **A Windows flake inside `TempRepo` test helpers.** First seen 2026-09-29
  (`blames_the_working_tree_and_marks_the_uncommitted_line` panicked at `test_util.rs:84` during the 0.10.14
  hotfix's gates, passed on re-run; accepted then as likely a pre-existing file-timing flake, unconfirmed). Its
  reopen trigger fired twice on 2026-10-01, both inside Phase 2b's gates: (a)
  `blame::tests::a_path_that_is_not_there_is_a_cli_error`, `add_path: "LF would be replaced by CRLF in 'a.txt'"`
  inside `TempRepo::commit` (passed on re-run); (b) `cli::runner::tests::editor_is_disabled`, `git init: … could
  not read (expected 55 bytes, read 32)` at `test_util.rs:46` (passed on re-run). Case (b) closed 2026-10-03 (close-out
  Phase 3, C-5; done file §V): its cause, reasoned from the error text and not reproduced, was the global-config test
  pointing libgit2's process-wide config search path at a temp folder while other tests ran, and that test now runs
  in its own test binary (`crates/git-core/tests/global_config.rs`). Case (a), the CRLF `add_path` error, has a
  different cause, unknown. **Next:** none until it recurs. **Reopen:** the CRLF `add_path` error seen again in a test
  run. *From §Q (accepted 2026-09-29, the 0.10.14 hotfix's change review, triage T-B).*
- **The AppImage's bundled GLib can't load the host's GIO modules.** On Ubuntu 26.04 both 0.10.15 and 0.10.16 print on
  stderr `Failed to load module` for `libgvfsdbus.so` (`undefined symbol: g_task_set_static_name`),
  `libdconfsettings.so` (`g_assertion_message_cmpint`) and `libgioremote-volume-monitor.so` — seen in the v0.10.16 gate
  walk, 2026-10-03; likely the bundled GLib being older than the host's (reasoned, not checked). Open (`xdg-open` →
  `gio open`) and an HTTPS fetch worked; features that go through GVFS (network locations, trash on a mount) or dconf
  were not tried. **Reopen:** a Linux report of a feature failing that goes through GVFS or dconf, or a change to the
  bundled GLib. *From the v0.10.16 gate.* **Since the Tauri 2.12 bump** (0.10.19): the bundler's gtk hook bundles the
  build host's GIO modules and points `GIO_MODULE_DIR` at them, so the host's are no longer tried and the three
  `Failed to load module` lines are gone (the dry run's CI-built AppImage, run 37296029478, 2026-10-05). It bundles
  `libdconfsettings.so`, but the app sets `GSETTINGS_BACKEND=memory` (N4), so dconf is not read; no GVFS module is
  bundled, so GVFS features stay unavailable as before, though the picker's *Other Locations* still listed the mounted
  volumes.

## X. Added 2026-10-03 — close-out Phase 3

Deferred in close-out Phase 3 (plan `docs/archive/plans/2026-10-01-phase-3-plan.md`), each with a reopen trigger: one
from its measuring walk (`docs/archive/walks/2026-10-01-phase-3-measure.md`), the rest from its decisions, its change
review's triage and the walk of smoke group BL (`docs/archive/walks/2026-10-03-group-bl-walk.md`).

- **The interactive rebase dialog's todo read takes ~400 ms at 500 commits.** Row 7 (`canSquash` per row) measured fine,
  but under the dialog's open the backend's todo read (the read pass, a real `rebase -i --autostash`) took 392–418 ms of
  a 457–502 ms open on `perf-rebase` (1 pick + 499 fixups), 2026-10-01. Deferred: the read sits outside row 7's scope,
  which covered `canSquash` only (`docs/archive/plans/2026-10-01-phase-3-plan.md` §Stage B decisions). **Reopen:** the
  dialog's open reported slow, or measured ≥ 250 ms on a real rebase.
- **Discard on an intent-to-add file empties it (D-7), and a deleted one reads as a plain deletion (Q15).** Since
  fix 3 an intent-to-add file (`git add -N`) reads as working-tree Added; Discard on it empties the file — libgit2
  restores the empty placeholder (`crates/git-core/src/stage.rs:209-236`; reasoned) — while the row reads "added".
  Pre-existing bytes. One deleted on disk prints `1 .D N... … e69de… e69de…`, the same line as a committed empty
  file deleted on disk, so the mapping can't tell them apart: it reads as a working-tree deletion (before: index
  Added + workdir Deleted), and Blame and History are offered against HEAD for a path HEAD doesn't have (Blame
  fails). Rejected for Phase 3: discarding it like an untracked file; reading the index entry's intent-to-add flag
  under the `git2` mutex. **Reopen:** a report of a file emptied by Discard, or of Blame failing on such a row.
- **The commit panel's line counts take ~10 s on a large unstaged list (Q23).** Found in BL 4 on `perf-synth` with 12k
  changes (2000 modified, 10k untracked): 9.4–10 s per counts call (the first successful one 15.3 s), the same on `main`
  (9.6–9.8 s). libgit2 loads each working-tree file's filter attributes without an attribute session
  (`diff_file.c:362`), ~0.8 ms per file on Windows; the path list (D-10) costs nothing. While it runs, the panel's
  counts lag behind the list. Rejected for Phase 3: counting untracked lines in-process, `git diff --numstat`, a count
  cap. **Reopen:** the counts reported or measured ≥ 5 s on a real repository.
- **A listed file growing during the counts call fails the whole call (Q23).** libgit2 stops with "file changed
  before we could read it" (`diff_file.c:345`), blanking every count for that round. Seen once in BL 4: a 35 s call
  ended `ok=false` during edits to a listed file (the link reasoned, not checked). Pre-existing. **Reopen:** counts
  reported blank after an edit.
- **A WebKitGTK web-process abort on quit, seen once.** On the Linux VM (WebKitGTK 2.52.6, a debug build of
  `8246a97`), a quit with the output dock at its cap (25,010 rows) aborted `WebKitWebProcess` with `free(): corrupted
  unsorted chunks` (SIGABRT): 1 in 32 quits at the cap, 0 in 30 repro cycles (10 of them with `content-visibility`
  forced off). No stack: the crash reporter dropped the core (over its size limit), `ptrace_scope` was 1, and the
  debug symbols weren't installed. Next time: `sysctl kernel.yama.ptrace_scope=0` and gdb on the web process before
  the quit, or systemd-coredump (or a larger apport limit), plus `libwebkit2gtk-4.1-0-dbgsym` (or debuginfod).
  **Reopen:** a second sighting or a crash report.

## Y. Added 2026-10-04 — close-out Phase 4 Stage B

Deferred from close-out Phase 4 Stage B's change review triage (plan `docs/archive/plans/2026-10-03-phase-4-plan.md`),
each with a reopen trigger.

- **In dark mode the unfocused selection tint is close to the hover tint.** `--bg-selected-unfocused` sits close to
  `--bg-hover`. Seen on the Direction B canvas render; the app uses the same tokens. **Reopen:** a user can't tell
  a selected row in an unfocused list from a hovered one in dark mode.

## Z. Added 2026-10-04 — close-out Phase 5

Deferred in close-out Phase 5's triage (plan `docs/archive/plans/2026-10-04-phase-5-plan.md`, walk record
`docs/archive/walks/2026-10-04-phase-5-macos-walk.md`), each with a reopen trigger. The first three are macOS polish,
for one plan together.

- **The shortcut hints read "Ctrl+" on macOS (D8, triage T9).** About 72 hints are hard-coded in 17 files: the menus,
  the palette, tooltips, the start screen. On macOS the app takes ⌘ as well as Ctrl for its chords (`ctrlOrCmd`,
  `src/lib/keys.ts`), so the hints work but aren't what a Mac user expects. Fixing the menus alone would mix Ctrl and ⌘
  labels, so it needs its own plan covering every hint. Seen in the Mac walk (M1). Deferred 2026-10-04 (D8). **Reopen:**
  a macOS user reports the hints, or the next macOS fix batch — then plan it with the two rows below.
- **Mac detection is written three ways (triage T5).** `IS_MAC` (`src/lib/externalTools.ts:110`), an inline test for the
  ⌘ / Ctrl label (`src/screens/RepoWindow/DetailsPane.tsx:269`), and `isMac()` (`src/lib/keys.ts:16`, read per call so
  tests can stub the user agent; added by Phase 5's Option fix). The same regex each time; one would serve. Deferred
  2026-10-04, tied to D8: the hints plan merges them. **Reopen:** with the row above.
- **The macOS app menu has no *Settings…* and no *Show All* (triage T14).** The menu bar's app menu is the default one
  (a debug build's is titled `t4-git-ui`). A custom one is about 50 lines of Rust, keeping the Edit menu. The catch: an
  item with the ⌘, accelerator gets the key before the page does (reasoned, not tried), so it must open Settings through
  the app's own action, or ⌘, stops reaching the page's handler. Seen in the Mac walk (M1). Deferred 2026-10-04 for its
  own plan. **Reopen:** a macOS user asks for it, or the hints plan above is picked up.
- **A commit row's hover tooltip can cover its context menu (triage T15).** In the Mac walk (M1) the row's native
  `title` tooltip sat over the menu's first item; seen once. Fix sketch: no `title` on `GridRow` while the grid's menu
  is open. Deferred 2026-10-04. **The 2026-10-06 fix batch's row 4** strips the anchor's `title` while the context menu
  is open (D4, D14, D33): walked on the Mac, pass (no tooltip over the menu); walked on Linux under openbox with the
  gate's 1920×1200 recipe, **failed 0 of 4** — the DOM confirms the `title` is stripped, but a one-motion
  move-and-right-click still shows WebKitGTK's own already-scheduled tooltip with the old text (inferred cause: it reads
  the text off the motion event before `contextmenu` strips the attribute). Kept by the owner anyway (D35); stays open.
  *Walk: `docs/archive/walks/2026-10-06-bp-walk.md`.* **G3 merges in here (D33)** — a menu item's first XTEST click
  under Xvfb only highlighted it, a second activated it (the v0.10.19 Linux gate). Accepted 2026-10-05 (the v0.10.19
  gate). Reproduced 1 of 1 at the v0.10.20 Linux gate (bare Xvfb, 2026-10-06): the file row's native tooltip sat over
  the menu next to *Open* just before the click; that the tooltip takes the click is inferred, not traced (D14). The D14
  pre-check reproduced it on v0.10.20 under openbox with the gate's 1920×1200 recipe, pointing at an app/WebKitGTK
  interaction, not the harness. BP 4's Linux walk failed the same way, as above. The v0.10.21 Linux gate recorded it
  again, 0 of 4, under openbox (D35 — a record, not a release blocker):
  `docs/archive/walks/2026-10-07-v0.10.21-release-gate-linux.md`. Both T15 and G3 stay open (D35). **Reopen:** a report
  of a menu item needing two clicks, a tooltip over a context menu, or a reproduction that doesn't match the tooltip
  theory. *From `docs/archive/walks/2026-10-05-v0.10.19-release-gate-linux.md`.*

## AA. Added 2026-10-05 — the Tauri 2.12 triage

Deferred in the Tauri 2.12 triage (plan `docs/archive/plans/2026-10-04-tauri-2.12-plan.md`, "Triage (2026-10-05) and its
fixes"), with its reopen trigger.

- **A release run builds ssign and the Tauri CLI from source every time.** Measured on the dry run (run 37296029478):
  `cargo install tauri-cli` took 9 m 28 s on Windows, 6 m 42 s on macOS and 5 m 37 s on Linux, and the ssign build
  2 m 54 s, because rust-cache restored nothing. A tag reads caches only from its own ref or `main`, and an unused
  cache is evicted after 7 days. Options: an `actions/cache` keyed on ssign's pinned rev, upstream's prebuilt ssign
  zip pinned by hash, or the prebuilt `@tauri-apps/cli` that `npm ci` already installs. The last two trust a binary
  built upstream; whether the npm CLI carries bundler 2.10.1, which the AppImage pins are read from, wasn't checked.
  Deferred 2026-10-05. **Reopen:** the next change to the release workflow, or a release run's build time becoming a
  problem.

## AE. Added 2026-10-06 — the fix batch

Deferred in the 2026-10-06 fix batch (plan `docs/plans/2026-10-06-fix-batch-plan.md`, *Not in this batch* and the BP
walk), each with a reopen trigger.

- **The split *Fetch* button and the Stash menu's *Pop latest* / *Apply latest* disable their trigger with no dialog
  in the picture (D21).** `Toolbar.tsx:362-367`: the menu closes and the op disables `stashBtn` in one commit, so
  `useRestoreFocus` focuses a disabled button and ends on `<body>`. The split *Fetch* button's own locus: it
  disables itself while focused (`Toolbar.tsx:270-278`). The row's design question (where the focus should go) is
  still open. **Reopen:** a keyboard user's report, or the next focus work.
- **`selectWorkingTree(false)` can drop a sidebar stash preview in History (D23).** `repoStore.ts:512`, via
  `dropWorkingTreeIfClean` (`statusStore.ts:190`): a clean-tree status drops the preview. **Reopen:** a report of a
  stash preview vanishing, or the next stash work.
- **A focus ring shows on the *Fetch options* chevron after a mouse Cancel or submit, on the Mac (D36).** Seen in the
  BP walk (W1, `docs/archive/walks/2026-10-06-bp-walk.md`): `data-kbd=false`, a blue ring visible after a mouse
  Cancel (BP 3) and a mouse submit (BP 2, BP 3); WebKit's own `:focus-visible` after a script focus (inferred).
  Before this batch, the same actions left the focus on `<body>` (no ring, but keyboard stranded). Idea:
  `focus({ focusVisible: false })`, untested on WKWebView. **Reopen:** the ring is found distracting, or the idea is
  checked.

## AF. Added 2026-10-07 — the v0.10.21 gate

Found walking the v0.10.21 release gate (`docs/archive/walks/2026-10-07-v0.10.21-release-gate.md` and its `-linux`
record), each with a reopen trigger.

- **M1: a saved tab didn't come up active on the Mac.** `layout.json` named the `t4-git-ui` tab active, but another
  of the 4 tabs came up active at launch, and stayed so across the update's restart. Seen once; not investigated;
  unknown whether it is new. **Reopen:** seen again, or reproduced.
- **L1: the Linux AppImage update truncates the file before rewriting it.** The installed AppImage drops to 0 bytes,
  then is rewritten in place (about 1 s, 20:04:07.565–08.516 at the gate); a crash or power loss inside that window
  would leave a broken AppImage needing a fresh download. Measured once; that this is `tauri-plugin-updater`'s own
  install path, not the harness, is inferred. **Reopen:** a broken AppImage reported, or the updater gains an
  atomic replace.

## AG. Added 2026-10-07 — checkout-remote-elsewhere, deferred

Deferred in the triage of the checkout-remote-elsewhere change (plan
`docs/plans/2026-10-07-checkout-remote-elsewhere-plan.md`, its change reviews and the BQ walk,
`docs/archive/walks/2026-10-07-bq-walk.md`). All four are pre-existing and app-wide, not caused by the change.

- **T7: a failed op's toast cuts git's error at its colon.** With an `error:` line, the toast carries that line alone
  (`crates/git-core/src/cli/ops.rs:749-750`), so "would be overwritten by checkout:" never names the file or gives
  git's "commit or stash" advice; the output dock has them. Seen on both BQ 6 walks; every op hitting that refusal
  (checkout, merge, pull, cherry-pick) shows it. Idea: when the `error:` line ends with ":", append the indented
  lines after it (a few file names). **Reopen:** a user finds the cut-off toast confusing, or the next pass over
  error wording.
- **T15: a checkout during a resolved-but-uncommitted merge quietly abandons it.** The commit menu's checkout items
  block only mid-rebase / mid-bisect; mid-merge, `git checkout` succeeds and drops `MERGE_HEAD` (the resolved files
  stay in the tree). The plain *Checkout `<branch>`* item already did this; not walked. **Reopen:** someone loses a
  merge this way.
- **T17: a dialog left open across a repo switch acts on the new repo.** Every dialog reads the open repo when it
  confirms, not when it opened; usually the branch name doesn't exist there and git fails, but with a matching name
  and commit it would act on the wrong repo. Reasoned from the code, not observed. Idea: bind each dialog to its
  repo, or close dialogs on a switch. **Reopen:** any report of an action hitting the wrong repo.
- **T19: the status bar shows "Clean" next to "1 unstaged".** Seen on the Linux BQ 6 walk with `shared.txt` edited;
  "Clean" likely means no operation in progress, not a clean tree (not checked). **Reopen:** the next status-bar
  change, or anyone finds it confusing.

## Order

The order is set by `docs/plans/2026-09-26-close-out-plan.md` (phases 0–6).
