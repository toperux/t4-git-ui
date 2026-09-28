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
  or macOS machine: AC's deb / rpm box (`:761`), and AZ 11's two platform lines (`:1879`, `:1882`). A grep for
  `- [ ]` also matches `:298`, which is prose. (Four records are marked `[n/a]` since close-out Phase 0; the three
  this machine could reach were walked in Phase 1 — both in the done file. Line numbers refreshed 2026-09-27.)
- **The first real run of 0.10.12's plain-words update errors and Install's confirm** over a typed commit
  message (group BG walked them on local builds only) is the user's update from 0.10.12 to the next release —
  the close-out plan's release gate. It cannot be the 0.10.11 → 0.10.12 update: an update runs the *old* app's
  code. (The user's install became 0.10.12 on 2026-09-26, through the Phase 1 updater walk.)

- **Windows code signing** — the NSIS setup is not Authenticode-signed, so every new Windows user meets
  SmartScreen's "Windows protected your PC" and has to pick *More info › Run anyway*. The updater's minisign
  signature is a different thing: it protects updates, not the first download. Close-out Phase 1b ports
  t4-markdown-viewer's setup — its public `.github/workflows/release.yml` (`toperux/t4-markdown-viewer`) is the
  reference implementation, and the user's `signing-and-repo-setup.md` (a working copy outside the repo) lists the
  repo settings and the verify steps (Certum certificate, thumbprint `F06C…8151`, expires 2027-09-22). Recorded
  2026-09-24 from group BF. What an unsigned setup actually met there (BF 3, in Windows Sandbox): **Edge warned
  on the download**, and running it brought **no SmartScreen prompt**. So today the friction is the browser's
  download warning. SmartScreen on run may still differ on a real machine, whose settings the Sandbox need not
  share.
- Linux (WebKitGTK) rendering: walked on 2026-09-05 under WSLg (Ubuntu 24.04, X11 backend) —
  fonts, both themes, graph, panels, styled scrollbars (thumb + hover), all five splitters and the
  dock drag, native-menu suppression (toolbar / panel header / statusbar / bare diff body → nothing;
  text field and selected diff text → GTK menu), app context menu on a commit row: all as on Windows.
  **Walked again 2026-09-27 on native Wayland** (Ubuntu 26.04.1, GNOME, a VMware guest; driven by WebDriver, the two
  GTK menus that should show checked by eye): all of the above pass except the dock's range and collapse, which
  were walked instead under automation on Xvfb, not with real Wayland input
  (`docs/archive/walks/2026-09-27-linux-wayland-rendering-walk.md` and its addendum).
  Real GPU hardware and a HiDPI panel are not walked, accepted until a report. macOS rendering: never seen; CI
  compiles only.
- UI-vs-canvas comparison pass (v1 plan M6 leftover): screenshots of the real app against the
  screens canvas, one pass, fix what differs or update the canvas.

## C. Roadmap — v1 out-of-scope, unchanged, unscheduled
Custom titlebar (revisited in M6, native kept) · i18n · plugins.

## E. Added 2026-09-10 — one dated decision
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
  - `src/App.tsx:175` (2026-09-25) — an update answer that lands between a new window's `lastUpdateCheck()` reply
    and its `update://checked` listener attaching is missed. Check now covers it. *(Phase 2)*;
  - `crates/git-core/src/linked.rs:120` — `snapshot` opens a repository per worktree and re-reads every
    submodule, no cache *(Phase 3, measure first)*;
  - `crates/git-core/src/linked.rs:134` — no main row when the main worktree's HEAD can't be read;
    `worktree list --porcelain` fixes it at a git ≥ 2.36 floor *(Phase 2)*;
  - `crates/git-core/src/watch.rs:124` — an app-side rewrite of `.gitmodules` does not refresh the Submodules
    list until the next refs event *(Phase 2)*;
  - `src-tauri/src/commands/window.rs:392` — the pointer position for tab adoption is Windows-only *(Phase 5)*;
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
- **Per-view sidebar state** (Direction B follow-up): many will hide the sidebar while staging and want it back in
  History. One `railOverride` per view is a ten-line change in `viewStore` if the first weeks say so.

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
Phase 2, the 1800-file delay in Phase 3, AZ 11 Linux in the Linux track, macOS in Phase 5); "left until one bites"
below is kept as history.

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
  is merged (#18, 2026-09-27), see §O.
- **Menus.** Rows shift by a line while arrowing over a clipped name. After arrow keys in the grid a
  right-click menu opens with its first item focus-visible, so a clipped first item opens wrapped — the
  same case in which that row always had the accent highlight. Since #18 (the `data-kbd` mark) this happens on
  Linux too (triage U3).
- **Esc is dead in Settings after Check now** (triage T2, 2026-09-26; Phase 2a). `Dialog` catches Esc in its
  form's `onKeyDown` (`Dialog.tsx:97-103`), so it works only while the focus is inside the dialog. **Check now**
  is `disabled={checking || installing}` (`SettingsDialog.tsx:232`), and disabling the focused button drops the
  focus to `<body>`. `Dialog` puts it back only when its `busy` prop clears (`Dialog.tsx:88-95`), and Settings
  passes `busy={installing}` (`:160`), not `checking`. Repro: Settings › Check now → Esc → nothing; a click inside
  → Esc works. A mouse or keyboard user meets it too.
- **Seen in the walk, not acted on.** An external `git reset` of 1800 files takes about four seconds to
  show in Changes, on 0.10.7 as well. (The libgit2 error-suffix row was fixed 2026-09-25 and is in the done
  file; the walk's native-confirm reading is in §L.)

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
- **F7, accepted 2026-09-27 (the fix batch):** on WebKitGTK, focus moved by script back from a text field after
  only Ctrl/⌘ chords (a click, then Ctrl+K twice; a paste, then Ctrl+Enter in the commit window) comes back
  unmarked. Chromium is expected to ring it; unwalked. The fix would be to also mark in `focusin` when
  `relatedTarget` is an input or textarea.

## P. Added 2026-09-26 — the Linux harness follow-ups, and one row found in review

The harness is `docs/smoke/smoke-linux.md` plus the `smoke-walk` skill. Its decisions are in the plan above.

- ~~**Portable fixture script (T2).**~~ Done 2026-09-26 (`linux-smoke-and-fixes`): `smoke-fixtures.sh` uses `awk`
  instead of GNU `sed`, with the same output.
- ~~**Promote the direct-launch helpers (D4).**~~ Done 2026-09-26 (`linux-smoke-and-fixes`):
  `docs/smoke/fixtures/direct.sh`, pointed to from `smoke-linux.md`.
- **AC :761 walked 2026-09-26 (T6):** the `.deb` passes; the AppImage updates in place only with a workaround (the
  blank-window bug below); `.rpm` not walked, ruled covered 2026-09-27. The row stays unticked until the AppImage
  release walks (`docs/archive/walks/2026-09-26-group-ac-linux-walk.md`).
- ~~**ssh under the moved `HOME` (T4).**~~ Done 2026-09-27 (`linux-smoke-and-fixes`): ssh finds the real `~/.ssh`
  through the passwd entry, and a GitHub ssh `ls-remote` works with `HOME` moved. `smoke-linux.md` §2 records it,
  with the caveat that ssh isn't isolated. Triage 2026-09-27: other ssh hosts, a fetch/push through the app itself,
  the unisolated `~/.ssh` and ssh signing under the moved `HOME` are accepted (the last two are documented in §2).
  Prompts are the row below.
- **ssh prompts the app can't answer well (found in the T4 review; measured 2026-09-27).**
  - **The setup:** the git runner (`crates/git-core/src/cli/runner.rs`) sets no `SSH_ASKPASS` or `BatchMode`, and
    runs git with stdin null. The app has no ssh prompt UI, and a stuck op ends only on Cancel. There is no timeout,
    by choice (triage 2026-09-27): one would misfire on a slow fetch or clone.
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
  - **Untested (accepted 2026-09-27):** an Ubuntu 22.04 host, and the NVIDIA proprietary driver.
  - **Separate, and not fixed:** the AppImage always runs under XWayland (its GTK hook forces `GDK_BACKEND=x11`).
    On this VMware SVGA II guest, XWayland also needs `WEBKIT_DISABLE_DMABUF_RENDERER=1`; the system `.deb` under
    `GDK_BACKEND=x11` is blank too. Decided 2026-09-27: no switch in the app (it would slow every AppImage user).
    README documents the variable instead.
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
  `--locked`, a dispatch run). `checks.yml`'s guard keeps `release.yml`'s pin and `package-lock.json` in step, so
  Dependabot's npm group PR carrying 2.12.0 will go red on it. **Then:** comment
  `@dependabot ignore @tauri-apps/cli minor version` on that PR (on the user's word). That closes the group PR; the
  other bumps come back at the next weekly run. The ignore is stored by GitHub, not in the repo, and covers every
  later minor too: `@dependabot show @tauri-apps/cli ignore conditions` shows it. Lift it with
  `@dependabot unignore @tauri-apps/cli` on an open npm group PR, even if the bump is done by hand, or later minors
  are never proposed. When the ignore is applied, add *ignore active since <date>* here (a docs commit on `main`,
  pushed on the user's word).
- **`release.yml`'s macOS signing-order comment names 2.11.5 before a run confirmed it** (the CLI pin change's triage
  T1, 2026-09-28). The *Verify the macOS signature* comment says the bundler at 2.11.5 signs before it packs the
  `.app.tar.gz` and `.dmg`. A `workflow_dispatch` run of `release.yml` on `main` confirms it: that step fails red if
  the order changed. Close this row when that run's macOS leg is green.
- **Turn on `requireSignedVersion` (decided 2026-09-27 to track, not schedule).** From tauri-cli 2.11.5 on, every
  updater signature carries `version:`, and updater 2.12 rejects a signed version that doesn't match `latest.json`.
  A signature with no version is still accepted while `requireSignedVersion` is off, which leaves a downgrade
  bypass: serve an old, version-less signature. The threat is low, since the manifest is served from GitHub
  releases over HTTPS. **Precondition:** every artifact a `latest.json` can point at carries a version, which is true
  from the first release after the CLI pin change (2026-09-28). Then set it in `tauri.conf.json`.
- **Only the AppImage's updater `.sig` is verified in CI (triaged 2026-09-27, the AppImage plan's Triage L4).** The
  Windows `.exe.sig` and the macOS `.app.tar.gz.sig` come straight from the bundler and nothing touches the files
  after signing, so the risk the AppImage check guards against doesn't apply. To extend it, run
  `.github/scripts/verify-updater-sig.py` on those legs too.
- **Row found in review: a repository that crashes the app while loading crashes every later launch.** Wider since
  the fix batch: a restored window's tabs are in the file before they open (since Phase C for spawned windows,
  since the 2026-09-27 seed for `main`), so the loop also covers crashes inside `open_repo`. Scheduled in Phase 2a
  (triage U1, 2026-09-28). Outside a restore, `openTab` adds a tab, and the layout subscription reports it, as soon
  as the backend open returns and before the repository loads (`src/store/tabsStore.ts`, `src/App.tsx`'s
  `useTabsStore.subscribe`). A crash during the load therefore leaves the path in the file, and every launch
  reopens it and crashes again until `layout.json` is deleted by hand. That happens with one window or several.
  "Crashes" means the process ends without a normal exit: a segfault, an abort, OOM, or a panic that isn't
  contained. Likely fix, a loop breaker:
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
    - move `layout.json` aside rather than taking it (`take` now leaves the file in place, and the one present is what
      the crashed launch rewrote);
    - **skip the `lastOpen` fallback too.** The subscription persists the crashing repository as `lastOpen`, which
      `restoreTabs` falls back to on an empty layout;
    - say so in a toast.
- **T15 (a reloaded `main` re-spawns every other window):** closed 2026-09-27, moved to `open-items-done.md` §P.

## Order

The order is set by `docs/plans/2026-09-26-close-out-plan.md` (phases 0–6).
