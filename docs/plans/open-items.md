# Plan: after v1 — open items (t4-git-ui)

_Written 2026-09-02, the day after v1 was accepted. This is the one list of what is still open;
it folds together the v1 plan's "Known gaps", the 2026-09-01 codebase review's deferred rows and
the README's "Next" line (review item H4). Since 2026-09-26 every row except §C's roadmap is
scheduled in `2026-09-26-close-out-plan.md`; §Q's accepted limits wait on their reopen triggers, and two of
them are also in a close-out phase._

_Done, fixed, walked and closed rows live in `open-items-done.md` (split 2026-09-24), under the same
section letters — a letter with nothing open left (§D, §F, §G, §H, §J, §K, §L, §N) is only there. When a row
here is done, move it there. Accepted limits with a reopen trigger are open, in §Q (since 2026-09-28); those with
none are closed, in the done file._

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
- `status.rs` `git status` fallback: an accepted limit, moved to §Q (*`status.rs`: no `git status` command-line
  fallback for very large trees*), 2026-09-28.

## B. Verification and release
- **Unticked smoke lines — recounted 2026-10-01: four**, all in `smoke-test-post-v1.md`: AC's deb / rpm box
  (`:761`) and AZ 11's two platform lines (`:1879`, `:1882`), which need a Linux or macOS machine, and BH 12
  (`:2129`, the update badge in a new window), which needs a published update and runs at 2b's release gate. A grep
  for `- [ ]` also matches `:298`, which is prose. (Four records are marked `[n/a]` since close-out Phase 0; the three
  this machine could reach were walked in Phase 1 — both in the done file. Line numbers refreshed 2026-09-27.)
- **Install's confirm over a typed commit message, on a real install** (group BG walked it on local builds only).
  The 0.10.12 → 0.10.13 gate (2026-09-29) went the happy path with no draft typed, so it runs at 2b's release gate:
  type a commit message, then Install. (The error half of this row is closed, in the done file's §B.)

- **Windows code signing:** done 2026-10-01 (close-out Phase 1b), moved to `open-items-done.md` §B.
- Linux (WebKitGTK) rendering: walked on 2026-09-05 under WSLg (Ubuntu 24.04, X11 backend) —
  fonts, both themes, graph, panels, styled scrollbars (thumb + hover), all five splitters and the
  dock drag, native-menu suppression (toolbar / panel header / statusbar / bare diff body → nothing;
  text field and selected diff text → GTK menu), app context menu on a commit row: all as on Windows.
  **Walked again 2026-09-27 on native Wayland** (Ubuntu 26.04.1, GNOME, a VMware guest; driven by WebDriver, the two
  GTK menus that should show checked by eye): all of the above pass except the dock's range and collapse, which
  were walked instead under automation on Xvfb, not with real Wayland input
  (`docs/archive/walks/2026-09-27-linux-wayland-rendering-walk.md` and its addendum).
  Real GPU hardware and a HiDPI panel: an accepted limit, moved to §Q (*Linux: real GPU hardware and a HiDPI panel
  not walked*), 2026-09-28. macOS rendering: never seen; CI compiles only.
- UI-vs-canvas comparison pass (v1 plan M6 leftover): screenshots of the real app against the
  screens canvas, one pass, fix what differs or update the canvas.

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
  - (2026-09-27) **Whatever replaces it keeps the AppImage repack.** `release.yml` strips the build host's
    `libwayland-client` from the AppImage (§P). Any older-than-the-user build host needs that, a `container:
    ubuntu:22.04` job included.
  - (§K, 2026-09-16) **Still pinned** in `checks.yml:28` and `release.yml:116`, and **t4-markdown-viewer
    is in exactly the same state** (asked and answered 2026-09-16: still pinned, no decision recorded,
    the reasoning lives only in its archived `ci-alignment*.md`). So the cross-repo decision is genuinely
    unmade. The deprecation is a **label warning, not a break** — the first hard failure is the
    2027-03-23 brownout. If the Linux leg moves into a `container:`, check rustfmt is in
    the image: the markdown viewer runs `Format` on the Linux leg only.
- **The Certum code-signing certificate expires 2027-09-22.** After that, Release fails on Windows — most likely at
  *Bundle and sign* (Certum's service won't sign with an expired certificate), else at *Check the Windows
  signature*; releases already signed stay valid (the signatures are timestamped). **Renew by 2027-08-22**, then
  update the thumbprint in `release.yml` (*Check the Windows signature*) and in t4-markdown-viewer's. Added
  2026-09-30 (close-out Phase 1b, D5).

## I. Deferred with a reason — the `to revisit` rows and the `ponytail:` ceilings (accepted ones: §Q)

Deferred findings lifted from `docs/archive/plans/2026-09-12-consolidated-findings.md` and later
reviews, plus the `ponytail:` ceilings in code. Each was low and deferred with a reason; since
2026-09-26 they are scheduled in the close-out plan (`2026-09-26-close-out-plan.md`), each row
naming its phase. (Rows closed as will-not-fix or accepted are in the done file, or in §Q when they carry a
reopen trigger — the `Menu.tsx` `ponytail:` ceiling among them.)

- **S2** non-UTF-8 paths are dropped from the working-tree listing (lossy decode, then `stat`
  misses) or listed but unreadable. The IPC type is `String`; log the skip at most.
  *(Close-out Phase 2.)*
- **S4** `blameAt` switches tab / seeds / turns blame on before the reveal is known to hit.
  Reordering races the details-pane effect; toast only. *(Close-out Phase 2.)*
- **E6** O(n²) tree build for a flat directory (`fileTree.ts`, `Sidebar.buildTree`). Measure
  first; rare shape. *(Close-out Phase 3, measure first.)*
- **B3** the interactive-rebase read pass runs a real `rebase -i --autostash`; a kill mid-run
  strands work. Git's clean-tree check precedes the editor, so the read pass needs it; the
  banner offers `--abort`. *(Close-out Phase 2.)*
- **C6** `close_repo` never cancels the repo's in-flight ops — unreachable, the UI refuses
  close/switch while an op runs (comment on `close_repo`). *(Close-out Phase 2.)* **Q23**, the details pane blank
  while a newly selected commit loads: an accepted limit, moved to §Q (*Q23: the details pane goes blank when
  another commit is selected*), 2026-09-28.
- **R10** selected-mode header after a partial stage; **R12** two stale status/refs pairings
  where a guard would flicker *(close-out Phase 2)*; **R13** `canSquash` O(n) per row
  *(close-out Phase 3, measure first)*.
- `ponytail:` ceilings in code (seven added 2026-09-26, which were in the code but never listed here; three fixed
  2026-09-29 in close-out Phase 2a, in the done file):
  - `crates/git-core/src/log/walker.rs:94` — a `Refs` spec that never reaches HEAD leaves the working-tree
    column open *(Phase 2)*;
  - `crates/git-core/src/linked.rs:120` — `snapshot` opens a repository per worktree and re-reads every
    submodule, no cache *(Phase 3, measure first)*;
  - `crates/git-core/src/linked.rs:134` — no main row when the main worktree's HEAD can't be read;
    `worktree list --porcelain` fixes it at a git ≥ 2.36 floor *(Phase 2)*;
  - `src-tauri/src/commands/window.rs:392` — the pointer position for tab adoption is Windows-only *(Phase 5)*;
  - `src/screens/RepoWindow/Toolbar.tsx:100` — a rename while in the `icons` tier measures late *(Phase 2)*;
  - `src/screens/RepoWindow/dialogs/StashDialogs.tsx:39` — a dirty-only submodule is listed as stashed
    *(Phase 2)*.

## M. Added 2026-09-19 — review of `v0.10.1..HEAD`, its fixes, and the walk of group AZ

The walk is `docs/archive/walks/2026-09-19-group-az-walk.md`. What is left, so it is not rediscovered.
**Since 2026-09-26 these are scheduled in the close-out plan** (the menu row in Phase 2, the 1800-file delay in
Phase 3, AZ 11 Linux in the Linux track, macOS in Phase 5); "left until one bites" below is kept as history. The
toast-detail and default-remote rows are fixed, in the done file's §M.

- **Open box in group AZ**: 11 (Linux and macOS: rows 3a, 3b, 3d, 3i and bullet 6, by hand). (9, unit-tested
  with no hand recipe, is marked `[n/a]` since 2026-09-26.) Linux was walked 2026-09-26 and failed on 6; the fix
  is merged (#18, 2026-09-27), see §O.
- **Menus.** Rows shift by a line while arrowing over a clipped name. After arrow keys in the grid a
  right-click menu opens with its first item focus-visible, so a clipped first item opens wrapped — the
  same case in which that row always had the accent highlight. Since #18 (the `data-kbd` mark) this happens on
  Linux too (triage U3).
- **Seen in the walk, not acted on.** An external `git reset` of 1800 files takes about four seconds to
  show in Changes, on 0.10.7 as well. (The libgit2 error-suffix row was fixed 2026-09-25 and is in the done
  file; the walk's native-confirm reading is in the done file's §L.)

## O. Added 2026-09-26 — the Linux walk of group AZ 11

The walk is `docs/archive/walks/2026-09-26-group-az-linux-walk.md`: a debug build of `1e795ad` on Ubuntu 26.04.1,
WebKitGTK 2.52.6, driven under Xvfb (`docs/smoke/smoke-linux.md`). Rows 3a, 3b, 3d and 3i pass. It found two bugs,
both reproduced without WebDriver. Fix plan, with a status section:
`docs/plans/2026-09-26-linux-menu-focus-and-restore-plan.md`.

The 2026-09-27 fix batch and its decisions (D-a, D-b, R5b): `docs/archive/plans/2026-09-27-pr18-fix-batch-plan.md`.

- **Menus show no keyboard focus on WebKitGTK: fixed** (branch `linux-smoke-and-fixes`, merged in #18 on
  2026-09-27).
  - **The bug:** `Menu.tsx` focused items by script, WebKitGTK never gives those `:focus-visible`, and every highlight
    and the clipped-name wrap were keyed on it.
  - **The fix:** `focusItem` marks a keyboard-focused item `data-kbd`, and the CSS styles `[data-kbd]:focus` beside
    `:focus-visible`.
  - **Checked:** AZ 6 passes in full on Linux (2026-09-26, direct launch, real X keys).
  - **Still open:**
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
- **A restored second window sometimes never starts: guarded, not fixed.**
  - **The bug:** `w1` stays on the *Starting* spinner for good.
    - **Rate:** 3 of 16 two-window restores before step C were real hangs (a live `w1` that never got its
      repository title; the one under WebDriver on the *Starting* spinner). A later 7 of 20, measured with a
      kill-and-relaunch loop, likely raced `killapp`'s own kill against the next launch; whether those 7 were alive
      wasn't recorded. With the wait added to `killapp`, 0 of 20 raced. On WSL, 0 of 40 two-window runs hung for
      real (4 of them, with the old helper, were the race and never reached `spawn`); re-measure on the native host
      (D-b).
    - **Log:** nothing from `w1`. Under WebDriver its `plugin:store|load` never returned, and async commands then
      stalled app-wide while a sync one still answered, so the main thread was alive.
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
  - **Still open:**
    - **Plan step A, diagnose.** Its premise (step C raised the rate from 3 of 16 to 7 of 20) no longer holds: the 7
      of 20 was likely the `killapp` race (D-b), not step C. Re-run on the native Linux host with the fixed helper
      (a 30-launch baseline, no A/B unless Phase A's own review still wants one), then thread stacks of a hung
      process under gdb as a parent (no sudo needed). Then the probes: did the stuck page load (screenshot); is
      `main` alive (F5 and the log); does it also hang on a second launch or on Ctrl+Shift+N. The earlier
      store-lock suspect is unlikely: both paths take the locks in the same order. Look first at the async side and
      at `show_with_theme`'s `win.theme()`, a main-thread round trip.
    - **Plan step B, fix,** once A names the cause.
    - **Verify:** 0 hangs in 50 launches on the native Linux host with the fixed helper; a Linux re-walk of AZ
      3a/3b/3c/3d/3f/3h/3i/3k; a Windows re-walk of AZ row 3.
    - **Whether it happens on Windows** (not seen in the 2026-09-19 walk).
- **AZ 11 Linux stays unticked** until both bugs pass their re-walks. Then tick it, write the walk record, and move
  this section to `open-items-done.md`.
- **Triaged 2026-09-26:** every decision and accepted limit is recorded in the plan's *Decisions* section; the order
  of the remaining work is its *Order* section. T14 (a test for the `catch` path) is done. T11 was reversed
  2026-09-27 (D-a): `main` is now seeded first in `take`, so the §P crash loop widens instead, to cover crashes inside
  `open_repo`; its loop-breaker is the real fix.
  Then Phase A, remeasured on the native Linux host with the fixed helper (D-b); its own review decides whether to
  keep the A/B. If step C raises the rate, its write moves onto the build thread (D2). Then Phase B (the T18 audit
  was done 2026-09-27). Windows: AZ 6 as
  soon as the branch is up, row 3 after Phase B. macOS (AZ 11 and the WebKit click-focus check, T12): open until a
  Mac is available.
- **F7, accepted 2026-09-27 (the fix batch):** an accepted limit, moved to §Q (*F7 of the 2026-09-27 fix batch*),
  2026-09-28.

## P. Added 2026-09-26 — the Linux harness follow-ups, and one row found in review

The harness is `docs/smoke/smoke-linux.md` plus the `smoke-walk` skill. Its decisions are in the plan above.

- ~~**Portable fixture script (T2).**~~ Done 2026-09-26 (`linux-smoke-and-fixes`): `smoke-fixtures.sh` uses `awk`
  instead of GNU `sed`, with the same output.
- ~~**Promote the direct-launch helpers (D4).**~~ Done 2026-09-26 (`linux-smoke-and-fixes`):
  `docs/smoke/fixtures/direct.sh`, pointed to from `smoke-linux.md`.
- **AC :761 walked 2026-09-26 (T6):** the `.deb` passes; the AppImage updates in place only with a workaround (the
  blank-window bug below); `.rpm` not walked, ruled covered 2026-09-27. The row stays unticked until the AppImage
  release walks (`docs/archive/walks/2026-09-26-group-ac-linux-walk.md`). **2026-09-29:** both release walks since
  (0.10.12 → 0.10.13, 0.10.13 → 0.10.14) installed in place and rendered without the workaround, but neither came back
  by itself (the old app runs the restart). The user: AC ticks at 2b's release, whose update from 0.10.14 is the first
  that can restart by itself.
- **ssh under the moved `HOME` (T4):** done 2026-09-27, moved to `open-items-done.md` §P on 2026-09-28; its
  accepted cases are in §Q (*Linux harness: ssh cases not covered under the moved `HOME`*). Prompts are the row
  below.
- **ssh prompts the app can't answer well (found in the T4 review; measured 2026-09-27).**
  - **The setup:** the git runner (`crates/git-core/src/cli/runner.rs`) sets no `SSH_ASKPASS` or `BatchMode`, and
    runs git with stdin null. The app has no ssh prompt UI, and a stuck op ends only on Cancel. There is no timeout:
    an accepted limit, moved to §Q (*No timeout on git ops*), 2026-09-28.
  - **What ssh does when it has to ask:** it asks about a key's passphrase (with no agent) and about an unknown host
    key. From a desktop launch, with no terminal, it falls back to `SSH_ASKPASS` (Ubuntu's default is
    `/usr/bin/ssh-askpass`) when `DISPLAY` or `WAYLAND_DISPLAY` is set.
    - **No askpass installed** (the 2026-09-27 machine), or no display: it fails at once. Either the key isn't used
      (`Permission denied (publickey)`), or "Host key verification failed".
    - **An askpass installed:** a desktop user gets its dialog, and it works. On the harness's Xvfb nobody sees it,
      so the op hangs until Cancel.
    - **A terminal launch:** ssh opens the terminal from a background process group, gets stopped, and the op hangs
      until Cancel. This affects development only.
  - **Scope:** Linux, and macOS (which fails at once without `DISPLAY`). Windows is unchecked: Git for Windows
    ships its own askpass.
  - **https has no prompt either** (added in triage, 2026-09-27). On Linux and macOS, with no helper that can prompt,
    an https op that needs auth fails at once. `GIT_TERMINAL_PROMPT=0` turns the terminal off, and git asks no
    askpass unless one is configured (`GIT_ASKPASS`, `core.askPass` or an exported `SSH_ASKPASS`, not ssh's built-in
    default). osxkeychain and libsecret only store credentials, so a first auth still fails. With an exported
    `SSH_ASKPASS`, the prompt appears, and on Xvfb it would hang unseen. Windows has GCM, which prompts (done file
    §B, "Dogfooding, the credential half"; that laptop is Windows, confirmed 2026-09-27). The decision below covers
    both: a clear message for each.
  - **Measured 2026-09-27** (`docs/archive/plans/2026-09-27-ssh-prompts-check-and-cli-pin-plan.md`, Part A).
    - **How:** the app's environment (`LC_ALL=C GIT_TERMINAL_PROMPT=0`, stdin null, no terminal under `setsid`)
      with `timeout 30`, against GitHub.
    - **Setup:** `DISPLAY` set; no `SSH_ASKPASS`, `GIT_ASKPASS`, `core.askPass` or credential helper;
      `/usr/bin/ssh-askpass` missing; `StrictHostKeyChecking ask`.
    - **A passphrase key, no agent:** 1.4 s. ssh tried the askpass
      (`exec(/usr/bin/ssh-askpass): No such file or directory`), then `Permission denied (publickey)`.
    - **The same with `BatchMode=yes`:** 1.4 s, `Permission denied (publickey)`, with no askpass attempt.
    - **An unknown host key:** 0.9 s. The askpass was attempted, then `Host key verification failed`.
    - **The same with `BatchMode=yes`:** 0.9 s, `Host key verification failed`.
    - **https that needs auth:** 0.5 s,
      `could not read Username for 'https://github.com': terminal prompts disabled`.
    - **None hangs.** Each exits 128. The ssh cases end with git's `fatal: Could not read from remote repository.`
    - `BatchMode` changes nothing the user sees here: it only skips the askpass attempt.
    - The ssh messages don't say why (a passphrase, a new host). The https one is clear enough.
    - The real `known_hosts` was unchanged (md5), and the scratch one stayed empty.
    - **Holds for this setup only:** with an askpass installed or exported, ssh and git would show a dialog instead
      (and hang unseen on Xvfb).
  - **Decided 2026-09-27: fail fast with a clear message.** The app recognises these failures and names the cause
    and the fix. The in-app prompt and "leave it as is" were rejected.
    - **Reversed in planning:** `BatchMode=yes` is dropped. Without an askpass, ssh already fails fast, and
      `BatchMode` would only remove working askpass dialogs.
    - Plus the terminal-launch `setsid` fix, and clone classification.
    - Plan: `docs/plans/2026-09-27-ssh-fail-fast-plan.md`, reviewed and decided; its own PR after #18.
- ~~**`xclip` (T9).**~~ Done 2026-09-26 (triage): it was installed, and is now a listed prerequisite.
- **Re-test WebDriver with two windows (T7)** once the restore hang is fixed (two came up on 2026-09-27 in WSL; not
  a verdict). If it works, multi-window rows get DOM access back.
- **Drive live Wayland through AT-SPI (T5):** the page itself is now driven on live Wayland through WebDriver
  (`smoke-linux.md`, "Not reachable here"). What stays hand-walked is GTK's native popups, the OS theme switch
  and DPI. Plan: `docs/plans/2026-09-27-t5-atspi-plan.md`, from a spike on Xvfb (2026-09-27): AT-SPI reaches the
  page and GTK's text-field menu, and the OS theme switches through `gsettings` in a private session. DPI stays out
  of reach in a one-display VM.
- **Bug found in the AC :761 walk (2026-09-26): the AppImage opens a blank window on Ubuntu 26.04. Fixed in #18
  (merged 2026-09-27), pending the release walks.**
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
  - **Untested:** an accepted limit, moved to §Q (*AppImage fix untested on an Ubuntu 22.04 host and with the
    NVIDIA proprietary driver*), 2026-09-28.
  - **Separate, and not fixed:** an accepted limit, moved to §Q (*AppImage always under XWayland; some GPUs need
    `WEBKIT_DISABLE_DMABUF_RENDERER=1`*), 2026-09-28.
  - **Left:**
    - ~~a `workflow_dispatch` run~~ done 2026-09-27 (run 36257070680): the CI AppImage renders on Xvfb, and on this
      desktop with the variable;
    - the next release: an old AppImage with the `LD_PRELOAD` workaround (the command is in the AC walk record)
      updates to the fixed one; also compare its size and cold start with the old one (triage U4);
    - the release after: the fixed one updates in place;
    - then tick AC :761. `.rpm` is ruled covered by the `.deb` walk (2026-09-27): without `APPIMAGE` both take the
      Download… path (`update.rs:45-50`).
- **The tauri-cli 2.12.0 bump** (added 2026-09-28, the CLI pin plan's B-1 and B-3). Not planned yet. 2.12.0 (bundler
  2.10.0) came out 2026-09-26; the pin stays on 2.11.5 until a plan checks it (the version binding, `--app-version`,
  `--locked`, a dispatch run). If the bump moves the bundler version (2.12.0 does, to 2.10.0), it also re-derives
  the six AppImage tool names, URLs and hashes in `release.yml`'s *Pin the AppImage tools* from that bundler's
  source. `checks.yml`'s guard keeps `release.yml`'s pin and `package-lock.json` in step, so
  Dependabot's npm group PR carrying 2.12.0 will go red on it. **Then:** comment
  `@dependabot ignore @tauri-apps/cli minor version` on that PR (on the user's word). That closes the group PR; the
  other bumps come back at the next weekly run. The ignore is stored by GitHub, not in the repo, and covers every
  later minor too: `@dependabot show @tauri-apps/cli ignore conditions` shows it. Lift it with
  `@dependabot unignore @tauri-apps/cli` on an open npm group PR, even if the bump is done by hand, or later minors
  are never proposed. When the ignore is applied, add *ignore active since <date>* here (a docs commit on `main`,
  pushed on the user's word).
- **Turn on `requireSignedVersion`:** an accepted limit, moved to §Q (*`requireSignedVersion` is off*), 2026-09-28;
  closed 2026-10-01 (close-out Phase 1b), moved to `open-items-done.md` §Q.
- **Only the AppImage's updater `.sig` is verified in CI:** done 2026-10-01 (close-out Phase 1b), moved to
  `open-items-done.md` §P.
- **T15 (a reloaded `main` re-spawns every other window):** closed 2026-09-27, moved to `open-items-done.md` §P.

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
  report, or the next WebKitGTK focus work. *From §O.*
- **Linux harness: ssh cases not covered under the moved `HOME`.** Other ssh hosts, a fetch/push through the app
  itself, the unisolated `~/.ssh`, and ssh signing under the moved `HOME` (the last two documented in
  `smoke-linux.md` §2). Accepted in the 2026-09-27 triage of the T4 row (ssh under the moved `HOME`).
  **Reopen:** a harness walk that needs one of them. *From §P, the T4 row (now in the done file §P).*
- **AppImage fix untested on an Ubuntu 22.04 host and with the NVIDIA proprietary driver.** Accepted 2026-09-26
  (the 22.04 host) and 2026-09-27 (NVIDIA), in the AppImage plan (L5). **Reopen:** a report from either. *From §P,
  the AppImage row.*
- **AppImage always under XWayland; some GPUs need `WEBKIT_DISABLE_DMABUF_RENDERER=1`.** The AppImage's GTK hook
  forces `GDK_BACKEND=x11`. On a VMware SVGA II guest, XWayland also needs `WEBKIT_DISABLE_DMABUF_RENDERER=1`; the
  system `.deb` under `GDK_BACKEND=x11` is blank too. Decided 2026-09-27: no switch in the app (it would slow every
  AppImage user); the README documents the variable instead. **Reopen:** a report that the README workaround isn't
  enough, or Tauri's AppImage dropping the forced `GDK_BACKEND=x11`. *From §P, the AppImage row.*
- **No timeout on git ops.** A stuck ssh or https op ends only on Cancel. By choice (triage 2026-09-27): a timeout
  would misfire on a slow fetch or clone. **Reopen:** a report of a hang the ssh fail-fast change doesn't cover.
  *From §P, the ssh prompts row.*
- **A crash after the restore report still loops.** The report fires when the log walk starts
  (`repoStore.ts:347`); a crash later in the walk or the refs load happens after the breaker's mark clears.
  **Reopen:** a loop is reported that gets past the breaker. *From §P.*
- **The breaker can trip without a crash.** A kill during a slow restore (any OS; on Linux, the §O hang with a
  second window stuck on *Starting*) can't be told from a crash; and without single-instance (no session bus,
  `window.rs:287-288`), a second process finds the first one's live mark. Either way the session is set aside
  once, with the file kept. **Reopen:** the §O fix lands (re-check), or a false trip is reported. *From §P.*
- **`Ctrl+,` does nothing while the start screen opens a repository.** While a repository opens, the *Opening…*
  overlay (`App.tsx:232`, `z-index: 50`, above dialogs at 40, swallowing clicks) covers the start screen, so
  Settings opened then would sit invisible under it, holding the keyboard, until the repo window replaces it.
  Only Init (`StartScreen.tsx:94-96`) and the overlay's 150 ms fade-in are uncovered. Accepted 2026-09-28 (Q1), no
  code. **Reopen:** the gap feels long. *From §L (in the done file).*
- **`status.rs`: no `git status` command-line fallback for very large trees** (a v1 accepted limit). The fallback
  would be `git status --porcelain=v2 -z` behind a flag, only if libgit2 status proves slow on very large trees.
  Measured 2026-09-07: 1.5 s at 47k tracked files (AutoEq), 50 ms at 61k files on disk / 10.7k commits — that is
  the limit, and every watcher event pays it. (2026-09-07: the scans that looked like this were the stale stat
  cache, not the tree size.) Still measured in close-out Phase 3; if it measures fine, it stays here with the
  numbers added. **Reopen:** the `slow status` log line (≥ 250 ms) shows a real machine hitting it, or Phase 3's
  measurement crosses its threshold. *From §A.*
- **Q23: the details pane goes blank when another commit is selected.** Until the new commit's details arrive, the
  pane is empty instead of keeping the previous commit's on screen. P1-4's fix (`6a95389`) clears `detail` and
  `error` on a new commit id (`src/screens/RepoWindow/DetailsPane.tsx:170-173`, checked 2026-09-28); the blank was
  decided at P1-4 (`docs/archive/plans/2026-09-12-consolidated-findings.md`, `:47`, `:233`, `:520`). ("C6/Q23" in §I
  was a label collision: this Q23 was the second pass's C6, not the consolidated C6, `close_repo`.) Still in
  close-out Phase 2's table, *design needed*. **Reopen:** it flickers on the smoke walk. *From §I.*
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
- **`cancel_kills_long_running_process` can miss its 800 ms bound under load.** It failed once locally while two
  builds ran in parallel, passed alone (0.38 s) and in every run since; never seen in CI. Widening the bound would
  weaken what it proves. Accepted 2026-09-29. **Reopen:** it fails in CI — then widen the bound or retry it. *From
  close-out Phase 2a's gates.* It can also fail when git's port 9418 is already taken: its `git daemon` listens on
  that fixed port, and a WSL test run at the same time shares localhost ports (seen once in the 0.10.14 hotfix's
  per-commit gates; the retry passed). **Reopen:** that failure in CI — then give the daemon a free port.
- **A Flatpak or snap build would need its own way to start host programs.** The 0.10.14 scrub (`host_command`)
  handles an AppImage's environment only; inside a Flatpak or snap sandbox a host program is reached through
  `flatpak-spawn --host` or not at all. None is planned. Accepted 2026-09-29. **Reopen:** a Flatpak or snap build is
  planned. *From the 0.10.14 hotfix plan's triage (T6).*
- ***Open* inside an AppImage parks one thread per open while `xdg-open` runs.** `open_on_host`
  (`src-tauri/src/commands/repo.rs`) skips the `open` crate's double fork: `git_core::tools::detach`'s thread waits
  on `xdg-open`, which in its generic fallback can wait for the opened program. A parked thread costs little, and
  opens are user clicks. Accepted 2026-09-29. **Reopen:** the thread count or memory grows noticeably over a long
  session. *From the 0.10.14 hotfix plan's triage (T7).*
- **A blame test failed once on Windows inside the test helper's `index.add_path`.**
  `blames_the_working_tree_and_marks_the_uncommitted_line` panicked at `test_util.rs:84` during the 0.10.14 hotfix's
  gates and passed on re-run; the code under test isn't touched by the hotfix. Likely a pre-existing Windows
  file-timing flake; unconfirmed. Accepted 2026-09-29. **Reopen:** it fails again, locally or in CI — then look at
  the helper. *From the 0.10.14 hotfix's change review (triage T-B).*
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
  packages, unpinned — only `squashfs-tools` has a version floor (triage U5), `python3-cryptography` an import check;
  and two downloads the Windows bundler makes during *Bundle and sign* with the keys in env, `nsis-3.11.zip` and
  `nsis_tauri_utils.dll` v0.5.3 (both from `tauri-apps` GitHub releases; the DLL is then signed with our certificate
  as an NSIS plugin; seen in dry run 36674994686's log). The bundler checks both against a SHA-1 (read in
  tauri-bundler 2.9.4, `nsis/mod.rs`). The `Downloading` check on the bundle log runs on Linux
  only, so a third Windows download would not be caught. Accepted 2026-10-01 (close-out Phase 1b, triage T3).
  **Reopen:** a bundler change moves either fetch or adds a Windows download, or a toolchain release breaks the build.
  *From Phase 1b's change review (`docs/plans/2026-09-30-phase-1b-plan.md`, "Not in this phase").*

## R. Added 2026-09-29 — close-out Phase 2a's change review, deferred

- **Esc after a self-disabling control is unverified on WebKitGTK.** The Phase 2a fix (`Dialog.tsx`, a document
  `keydown` listener for Esc / Tab on `<body>`) rests on focus falling to `<body>` when the focused button disables
  itself; walked on WebView2 (BH 4). If WebKitGTK keeps focus on the disabled button and doesn't dispatch keys to
  it, Esc stays dead there. (WKWebView doesn't focus a button on a mouse click, so `<body>` is already the target
  there.) *(Close-out Linux track: record `activeElement` after Check now and whether Esc closes Settings; reopen
  the fix if not.)*
- **macOS: an Option-typed character never reaches a select's type-ahead.** Option arrives as `altKey` without
  `ctrlKey`, so `Input.tsx`'s Alt branch swallows it (Phase 2a let only Windows' AltGr, Ctrl+Alt, through).
  *(Close-out Phase 5, with the macOS rows.)*
- **Ctrl+Q does nothing on the start screen.** Quit is bound only in a repo window (`useShortcuts.ts:74` and the
  repo menu); on Windows and Linux the start screen (including a window whose last tab closed while others stay
  open) has no Quit, only the window's × (macOS likely has Tauri's default app menu, with Quit, not checked). Pre-existing; met in smoke group BH's walk. Fix: a Ctrl+Q arm in `StartScreen`'s key handler
  calling the same `quit`, plus a test. *(Close-out Phase 2b.)*

## S. Added 2026-09-29 — v0.10.13's AppImage release walk

- **A failed commit's toast shows a hook's first output line, not why it failed.** When a hook refuses, git prints
  nothing of its own, and the toast shows stderr's first line (`src/store/toastStore.ts:104-107`); the VM walk saw
  *hook1 start*. Pre-existing, not from Phase 2a. Fix: in `commit`, when stderr has no `fatal:` / `error:` line,
  report the last non-empty one (~6 lines + a test); the op log has the full output. Same blind spot in merge /
  pull (a `pre-merge-commit` hook). Triage T1 of the 0.10.14 hotfix plan. *(Close-out Phase 2b.)*
- **A custom tool that fails to start still says *Opened …*.** The tool is detached; its exit status is never read
  (`crates/git-core/src/tools.rs:264-271`). Fix: watch the first ~300 ms for an early non-zero exit (a late one is
  normal for some tools — kdiff3 unsaved, Beyond Compare *files differ* — so it can't be reported; every open gets
  ~300 ms slower). Pre-existing; the hotfix removes the trigger seen on the VM. Triage T2 of the 0.10.14 hotfix
  plan. *(Close-out Phase 2b.)*
- **Review the limits the 0.10.14 hotfix's change review accepted in bulk.** 21 small items (edge cases,
  pre-existing behaviour, trades already chosen, doc style) were accepted as closed without a one-by-one ruling, to
  be looked at later: `docs/plans/open-items-done.md` §T. **Next:** the owner goes through §T and moves any item
  back here. *(Owner, when time allows.)*

## Order

The order is set by `docs/plans/2026-09-26-close-out-plan.md` (phases 0–6).
