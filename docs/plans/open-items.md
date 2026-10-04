# Plan: after v1 — open items (t4-git-ui)

_Written 2026-09-02, the day after v1 was accepted. This is the one list of what is still open;
it folds together the v1 plan's "Known gaps", the 2026-09-01 codebase review's deferred rows and
the README's "Next" line (review item H4). Since 2026-09-26 every row except §C's roadmap is
scheduled in `2026-09-26-close-out-plan.md`; §Q's accepted limits wait on their reopen triggers (the one that was
also in a close-out phase, the `status.rs` row, closed in Phase 3 on 2026-10-03)._

_Done, fixed, walked and closed rows live in `open-items-done.md` (split 2026-09-24), under the same
section letters — a letter with nothing open left (§A, §D, §F, §G, §H, §J, §K, §L, §N) is only there. When a row
here is done, move it there. Accepted limits with a reopen trigger are open, in §Q (since 2026-09-28); those with
none are closed, in the done file; most of §V's deferred rows wait on a later fix batch._

## B. Verification and release
- **Unticked smoke lines — recounted 2026-10-01: two**, both in `smoke-test-post-v1.md`: AZ 11's two platform lines
  (`:1882`, `:1885`), which need a Linux or macOS machine. AC (`:761`) ticked 2026-10-01 at the v0.10.15 release
  gate's AppImage half. BH 12 (the update badge in a new window) ticked 2026-10-01 at the v0.10.15 release gate. A
  grep for `- [ ]` also matches `:298`, which is prose.
  (Four records are marked `[n/a]` since close-out Phase 0; the three this machine could reach were walked in Phase 1 —
  both in the done file. Line numbers refreshed 2026-10-01.)

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
- **The updater writes nothing to the app log.** A check, a download and an install left no line in the app log on
  Windows in the v0.10.16 gate (2026-10-03), which followed them only through the UI, process ids and file times (the
  Linux walk checked its log for `ERROR`/`WARN` only). Reasoned from the code: check, download and install errors reach
  only the UI (`AppError`, `commands/update.rs`), and only a failed relaunch is logged (`lib.rs:320`), so an update that
  fails on a user's machine before the relaunch leaves no trace of its stage. Nothing failed. **Reopen:** an update
  failure reported, or met in a walk, whose stage the log can't tell.

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

## I. Deferred with a reason — the `to revisit` rows and the `ponytail:` ceilings (accepted ones: §Q)

Deferred findings lifted from `docs/archive/plans/2026-09-12-consolidated-findings.md` and later
reviews, plus the `ponytail:` ceilings in code. Each was low and deferred with a reason; since
2026-09-26 they are scheduled in the close-out plan (`2026-09-26-close-out-plan.md`), each row
naming its phase. (Rows closed as will-not-fix or accepted are in the done file, or in §Q when they carry a
reopen trigger — the `Menu.tsx` `ponytail:` ceiling among them.)

- E6 (the tree builds) and R13 (`canSquash` per row): closed 2026-10-02 in close-out Phase 3 (moved 2026-10-03), E6
  fixed for the Files and Changes trees and measured fine for the sidebar, R13 measured fine — both in the done file's
  §I.
- `ponytail:` ceilings in code (nine — seven of them added 2026-09-26; the seven fixed are in the done file;
  `linked.rs:120`, measured fine with its comment kept, moved to §Q 2026-10-03 (close-out Phase 3, Q16); one is
  left):
  - `src-tauri/src/commands/window.rs:520` — the pointer position for tab adoption is Windows-only *(Phase 5)*.

## M. Added 2026-09-19 — review of `v0.10.1..HEAD`, its fixes, and the walk of group AZ

The walk is `docs/archive/walks/2026-09-19-group-az-walk.md`. What is left, so it is not rediscovered.
**Since 2026-09-26 these are scheduled in the close-out plan** (AZ 11 Linux in the Linux track, macOS in Phase 5); "left
until one bites" below is kept as history. The toast-detail and default-remote rows are fixed, in the done file's §M;
the menu row's fix is in the done file's §M too (close-out Phase 2b), its row-shift half accepted in §Q.

- **Open box in group AZ**: 11 (Linux and macOS: rows 3a, 3b, 3d, 3i and bullet 6, by hand). (9, unit-tested
  with no hand recipe, is marked `[n/a]` since 2026-09-26.) Linux was walked 2026-09-26 and failed on 6; the fix
  is merged (#18, 2026-09-27), see §O.
- The 1800-file `git reset` delay seen in the walk: fixed 2026-10-02 in close-out Phase 3, in the done file's §M.

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
- **AC :761 walked 2026-09-26 (T6):** done 2026-10-01 at the v0.10.15 release gate's AppImage half, moved to
  `open-items-done.md` §P.
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
- **The AppImage blank-window bug** (found in the AC :761 walk, 2026-09-26; fixed in #18, merged 2026-09-27) — **done
  2026-10-01**, moved to `open-items-done.md` §P: both release walks it waited on (0.10.12 → 0.10.13, 0.10.13 → 0.10.14)
  landed, and AC ticked at 0.10.14 → 0.10.15.
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
- **AppImage fix untested on an Ubuntu 22.04 host and with the NVIDIA proprietary driver.** Accepted 2026-09-26 (the
  22.04 host) and 2026-09-27 (NVIDIA), in the AppImage plan (L5). **Reopen:** a report from either. *From §P, the
  AppImage row (now in the done file §P).*
- **AppImage always under XWayland; some GPUs need `WEBKIT_DISABLE_DMABUF_RENDERER=1`.** The AppImage's GTK hook forces
  `GDK_BACKEND=x11`. On a VMware SVGA II guest, XWayland also needs `WEBKIT_DISABLE_DMABUF_RENDERER=1`; the system
  `.deb` under `GDK_BACKEND=x11` is blank too. Decided 2026-09-27: no switch in the app (it would slow every AppImage
  user); the README documents the variable instead. **Reopen:** a report that the README workaround isn't enough, or
  Tauri's AppImage dropping the forced `GDK_BACKEND=x11`. *From §P, the AppImage row (now in the done file §P).*
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
  packages, unpinned — only `squashfs-tools` has a version floor (triage U5), `python3-cryptography` an import check;
  and two downloads the Windows bundler makes during *Bundle and sign* with the keys in env, `nsis-3.11.zip` and
  `nsis_tauri_utils.dll` v0.5.3 (both from `tauri-apps` GitHub releases; the DLL is then signed with our certificate
  as an NSIS plugin; seen in dry run 36674994686's log). The bundler checks both against a SHA-1 (read in
  tauri-bundler 2.9.4, `nsis/mod.rs`). The `Downloading` check on the bundle log runs on Linux
  only, so a third Windows download would not be caught. Accepted 2026-10-01 (close-out Phase 1b, triage T3).
  **Reopen:** a bundler change moves either fetch or adds a Windows download, or a toolchain release breaks the build.
  *From Phase 1b's change review (`docs/plans/2026-09-30-phase-1b-plan.md`, "Not in this phase").*
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

## S. Added 2026-09-29 — v0.10.13's AppImage release walk

- **Review the limits the 0.10.14 hotfix's change review accepted in bulk.** 21 small items (edge cases,
  pre-existing behaviour, trades already chosen, doc style) were accepted as closed without a one-by-one ruling, to
  be looked at later: `docs/plans/open-items-done.md` §T. **Next:** the owner goes through §T and moves any item
  back here. *(Owner, when time allows.)*

## V. Added 2026-10-01 — close-out Phase 2b

Found in close-out Phase 2b (plan `docs/plans/2026-10-01-phase-2b-plan.md`): the Linux track's two walks the
plan owed it, every item the triage sent here with a *DEFER §V* ruling (from the BK walk and the review passes),
and the §Q flake row whose trigger fired.

- **Row 3's unix tool-start walk.** `~/t4-no-such-tool "$LOCAL" "$REMOTE"` on Linux should show an error toast
  within ~300 ms (exit 127, caught by D3(c)); unwalked, this machine being Windows. *(Linux track.)*
- **Row 11's non-UTF-8 walk.** `touch $'caf\xe9.txt'; git add .` on Linux, then the Files tab (working tree and
  at a commit): the file stays out of both listings, with the *N files … aren't shown* note; unwalked. *(Linux
  track.)*
- **The Stashes browser's Files tab blame-gutter / "Select in graph" doesn't drill down (triage D-1).** Opened from
  Changes with a preview on stash X: a blame-gutter hunk click or "Select in graph" calls `blameAt`, which hits another
  commit Y and clears the preview; the browser's own "lost its preview" effect re-previews stash X, so the browser snaps
  back to the stash while History's grid behind it moves to Y and stays pinned to the stale Y. Pre-existing, also on
  `main`. Found in change review pass 6, 2026-10-01. **Next:** a later fix batch.
- **A closed Stashes browser leaves History's pane on the stash (triage D-2).** Closing the browser after previewing a
  stash leaves History's details pane on the stash (the grid highlights a commit, the sidebar's Stashes section stays
  collapsed) — the documented rule, "a previewed stash wins over the selection", working as designed, but confusing.
  Pre-existing, also on `main`. Found in the BK 9 walk, 2026-10-01. **Next:** the owner's next pass.
- **Fast back-to-back tab switching can lose the grid selection (triage D-3).** Switching tabs rapidly (×10, once seen
  at ×3) can bring a tab back selected on HEAD instead of where it was left; no stuck loading, no wrong content shown.
  Pre-existing, also on `main`. Found in the BK 9 walk, 2026-10-01. **Next:** a later fix batch.
- **`treeSelection` keys are shared across repos and tabs; a last-tab close in Changes doesn't clear
  `diffStore` (triage D-4).** Pre-existing, outside the Phase 2b branch — read during change review pass 3,
  2026-10-01, while checking row 16's fix. At worst, another repo's working tree preselects a same-named file in
  the Files tab; no wrong content is shown. Not reproduced as a user-visible bug. **Next:** a later fix batch.
- **Merge banner says "resolve conflicts" after a hook refused a conflict-free merge (triage E1).** A `pre-merge-commit`
  hook refusing a merge that has no conflicts still shows the conflicts banner's wording. Found in the BK walk,
  2026-10-01. **Next:** a later fix batch.
- **The worktree row menu offers Lock… on the main worktree row (triage E3).** git refuses locking the main worktree;
  the app's menu doesn't grey the option out. Found in the BK walk, 2026-10-01. **Next:** a later fix batch.
- **Alt+2 typed into the History search box does nothing (triage F1).** Unclear what, if anything, Alt+2 is meant to do
  there; found in the BK walk, 2026-10-01. **Next:** a later fix batch.
- **An empty session's `lastOpen` fallback may only be meant for the first launch (triage F2).** With `layout.json` as
  `[]`, the app opened a repository from `lastOpen` rather than the start screen; a later launch with the same empty
  session went to the start screen instead. Whether `lastOpen` should fall back past the first launch wasn't confirmed.
  Found in the BK walk, 2026-10-01. **Next:** confirm the fallback's intended rule, then a later fix batch.
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
  bundled GLib. *From the v0.10.16 gate.*

## X. Added 2026-10-03 — close-out Phase 3

Deferred in close-out Phase 3 (plan `docs/plans/2026-10-01-phase-3-plan.md`), each with a reopen trigger: one from
its measuring walk (`docs/archive/walks/2026-10-01-phase-3-measure.md`), the rest from its decisions, its change
review's triage and the walk of smoke group BL (`docs/archive/walks/2026-10-03-group-bl-walk.md`).

- **The interactive rebase dialog's todo read takes ~400 ms at 500 commits.** Row 7 (`canSquash` per row) measured fine,
  but under the dialog's open the backend's todo read (the read pass, a real `rebase -i --autostash`) took 392–418 ms of
  a 457–502 ms open on `perf-rebase` (1 pick + 499 fixups), 2026-10-01. Deferred: the read sits outside row 7's scope,
  which covered `canSquash` only (`docs/plans/2026-10-01-phase-3-plan.md` §Stage B decisions). **Reopen:** the dialog's
  open reported slow, or measured ≥ 250 ms on a real rebase.
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
- **Each tab open calls `open_repo` twice (C-2).** `tabsStore.ts:88`, then `repoStore.ts:324`; the second finds the
  open handle (one watcher, ~3–10 ms; the doubled `opened repo` line was seen on Windows, Linux and macOS, 0.10.15
  included). The fix: pass the summary through and skip the second call. **Reopen:** an open measured slow because of
  it.
- **A WebKitGTK web-process abort on quit, seen once.** On the Linux VM (WebKitGTK 2.52.6, a debug build of
  `8246a97`), a quit with the output dock at its cap (25,010 rows) aborted `WebKitWebProcess` with `free(): corrupted
  unsorted chunks` (SIGABRT): 1 in 32 quits at the cap, 0 in 30 repro cycles (10 of them with `content-visibility`
  forced off). No stack: the crash reporter dropped the core (over its size limit), `ptrace_scope` was 1, and the
  debug symbols weren't installed. Next time: `sysctl kernel.yama.ptrace_scope=0` and gdb on the web process before
  the quit, or systemd-coredump (or a larger apport limit), plus `libwebkit2gtk-4.1-0-dbgsym` (or debuginfod).
  **Reopen:** a second sighting or a crash report.

## Y. Added 2026-10-04 — close-out Phase 4 Stage B

Deferred from close-out Phase 4 Stage B's change review triage (plan `docs/plans/2026-10-03-phase-4-plan.md`), each with
a reopen trigger.

- **In dark mode the unfocused selection tint is close to the hover tint.** `--bg-selected-unfocused` sits close to
  `--bg-hover`. Seen on the Direction B canvas render; the app uses the same tokens. **Reopen:** a user can't tell
  a selected row in an unfocused list from a hovered one in dark mode.
- **Under Windows PowerShell 5.1, `docs/smoke/fixtures/smoke-fixtures.ps1` drops the quotes around the `slow`
  remote's upload-pack path (~:93).** Measured 2026-10-04; it works while the path has no spaces. **Reopen:** a
  smoke group uses the `slow` remote on the VM, or the fixture root gains a space.

## Order

The order is set by `docs/plans/2026-09-26-close-out-plan.md` (phases 0–6).
