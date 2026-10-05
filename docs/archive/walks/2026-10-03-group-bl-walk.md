# Group BL: close-out Phase 3 — 2026-10-02 / 2026-10-03

The walk of `smoke-test-post-v1.md` › group BL, steps 1–11 (`docs/archive/plans/2026-10-01-phase-3-plan.md`, *Smoke
group BL*): steps 1–9 on Windows over CDP, with the timing lines; step 10 on the Linux VM and step 11 on the owner's
Mac, behavior only (D2). Steps 1 and 6 failed on Windows, were fixed (Q22, Q24) and re-walked the same day. Beside the
walk: Q25's 3000-branch measurement, C-4's frame-rate A/B on the Windows VM, the WebKitGTK abort's repro cycles, and BL
10's re-walk (C-10). Judged as in Stage A: ≥ 250 ms on a real action, or jank (a frame gap ≥ 100 ms, or > 10 % of frames
over 50 ms). Samples: the first run is cold, median / worst over runs 2–6.

**Setup:**
- **Windows builds** (the owner's Windows 11 laptop; local `tauri build --no-bundle` of the throwaway branch
  `phase-3b-time`, `phase-3b` plus Stage A's `p3` timing lines, never pushed or merged, D1):
  - `bf75367` = `phase-3b` `b6e3da6` plus the lines (exe built 2026-10-02 20:51 local): steps 1–9.
  - `420b545` = `phase-3b` `ba6d754` plus the lines (exe 23:17): the re-walk of steps 1 and 6, and Q25. New since
    `b6e3da6`: Q22 (the hide-walk's order, the bitset loop), Q24 (the 25,000-line dock cap), fix 2's and fix 3's later
    code fixups and Q21's test (the test-only fixups `244345a` and `86253e2` came after `ba6d754`, before `8246a97`).
- **Launch (Windows):** `docs/smoke/fixtures/smoke-launch.ps1 -Exe …` (CDP 9222, its own WebView2 profile), driven
  with `docs/smoke/cdp.mjs` and Stage A's helpers (commit, log-step, hunk, touch-all and Files-tab timers); the
  installed 0.10.15 with `smoke-launch.ps1 -Installed` for BL 1's badges. The window was visible in every sample
  (`visibilityState` recorded). Git for Windows 2.55.0.windows.1. App log in UTC.
- **Linux (BL 10):** the Linux VM (Ubuntu, kernel 7.0.0-34, WebKitGTK 2.52.6, git 2.53.0, Node 24.21.0), the pushed
  side branch `phase-3b` at `8246a97`, a debug build with the `.smoke` identifier per `docs/smoke/smoke-linux.md`
  §1–2, under Xvfb `:99`, its own `HOME`, `NO_COLOR=1 … tauri-driver > $S/app.log`. Repos opened by seeding
  `layout.json`; reopens through the start screen's Recents (Enter).
- **macOS (BL 11):** the owner's Mac, `8246a97` checked out detached in a local clone (a local hook refused a
  worktree), `npm ci` + `tauri build --debug --no-bundle` with the `.smoke` identifier; Homebrew git 2.56.0, not the
  Xcode shim. `$S`, its `HOME` and the fixtures in a folder under the home folder. Driven by seeding `layout.json` and
  keys through System Events (the preflight passed once the screen was unlocked).
- **Windows VM (C-4):** release `tauri build --no-bundle` builds of `main` `cb3c9e3` and `8246a97`, made by the owner.
- **Store:** `%APPDATA%\dev.topher.t4gitui` backed up before each Windows walk (the walk, the re-walk, Q25) and
  restored byte-exact after each.

**Fixtures:**
- Windows, `c:/tmp/t4/`: Stage A's `perf-synth` (`docs/smoke/fixtures/perf-repo.mjs`: 100k commits, 332 local branches
  with upstreams, 664 refs, 100k files), `perf-git` (a git/git clone: 3 local branches, 1024 refs) and `perf-reset`
  (1800 tracked files modified, 2 stashes). For Q25, `perf-b330` and `perf-b3000` (`perf-repo.mjs --commits 100000
  --files 1000 --branches 330` / `3000`: 332 / 3002 local branches, 664 / 6004 refs, one line of history; generated in
  38 s / 44 s).
- Linux VM and Mac: built there, `perf-repo.mjs <dir>/perf-synth --files 100000` and a git/git clone at `c46c1e3772`,
  in a folder under the home folder (on the VM, `/tmp` is a 3.7 GB tmpfs and the fixtures take ~900 MB).

## Steps, per OS

Windows times only (D2); "—" means the step isn't one for that OS.

| Step | Windows | Linux VM | Mac |
|---|---|---|---|
| 1 Refs read, badges | **fail** on `bf75367` (`perf-synth`); **pass** on `420b545` | — | — |
| 2 Line staging on deletions | pass | — | — |
| 3 A staged rename | pass | — | — |
| 4 Status through git | pass; the 12k counts call recorded (~10 s, Q23) | pass (behavior); the 12k call and Q12 not done, by rule | — |
| 5 One scan at a time | pass | — | — |
| 6 Dock at the cap | **fail** on `bf75367`; **pass** on `420b545` | pass (behavior; frames not judged) | — |
| 7 Files tab | pass; pure medians under 125 ms | the re-time not done, by rule (no Windows median ≥ 125 ms) | — |
| 8 Close stops the scan | pass (exercised) | pass (walk 1; the re-walk's retry — its first attempt not exercised) | pass (no redo) |
| 9 fsmonitor | pass | — | pass |
| 10 Linux | — | pass (walk 1 and the re-walk, C-10) | — |
| 11 macOS | — | — | pass |

## Windows, steps 1–9 (`bf75367`, 2026-10-02)

1. **Refs read and merged badges: fail on `perf-synth`, pass on `perf-git`.**
   - `perf-synth` (b = `main`; cold open: full walk 565 ms, refs read 623 ms). Commit ×6: click → toast / → sidebar /
     toast → sidebar, cold 228 / 854 / 626 ms, then a median toast → sidebar of **597 ms** (worst 609), refs read 576.
     Every walk was the incremental path (`full=false`), yet cost 504–539 ms, about the full walk; the second read
     per commit (a cache hit) 56–74 ms, walk 7.8–11.8 ms.
   - Checkout (`at-main-1` ↔ `main` ×3 each): refs read ~65 ms (worst 73); cached F5 ~97 ms (worst 108): pass.
   - Forward move ×5 (`commit-tree 'main^{tree}' -p origin/main -m p3-<n>`, `update-ref refs/remotes/origin/main`):
     refs read **535 ms** (worst 559), walk 444–473 ms, all incremental: fail.
   - Merge move (`origin/main~5` = `6d9e3ec`, no ref on it): walk 435 ms incremental (the covered case, no
     fallback), refs read **507 ms**: fail.
   - Badges, before any fallback: this build and the installed 0.10.15 on the same refs, identical — 662 DOM rows
     titled *merged into*, all `→ main`; `get_refs` over all 664 branches gave the same list and hash.
   - Backward move after a relaunch (`origin/main` → `origin/main~1`): the full walk, 491 ms, refs read 549 ms.
   - `perf-git` (b = `master`; cold open: full walk 662 ms, refs read 718 ms): toast → sidebar 75 ms (worst 91),
     first refs read 63–80 ms with a 15–17 ms walk; checkout ~52 ms; F5 ~59 ms; forward 71 ms (worst 73); the merge
     move (`origin/master~5` = `a018953`, only tag `v2.56.0` on it) 74 ms: pass. Extra: a backward move, 566 ms walk,
     609 ms refs read.
   - Cause, found after the walk: the hide-walk hid all ~332 cached tips before pushing the new oid, and libgit2 keeps
     them in reverse push order, so the walk marked most of the 100k history uninteresting before reaching it (Q22;
     its iteration measured 425–470 ms for 1–2 yielded commits). Fixed by hiding the cached oids oldest first, then
     pushing the new one, with a bitset row per oid in the `merged_into` loop. Re-walked below.
2. **Line staging on deletions (`perf-synth`): pass.** Stage one line of `src/d2/f2.txt`, deleted on disk: 218 ms (worst
   220; cold 229). Unstage one line of the staged-deleted `src/d1/f1.txt`: 216 ms (worst 221). The rebuild 4.0–5.5 ms
   and the patch 50–54 ms in all (Stage A: rebuild 225–240, total 284–299); then a ~94 ms status scan and the reload.
   Under by ~30 ms.
3. **A staged rename: pass.** `git mv src/d4/f4.txt src/d4/f4-moved.txt` plus one line, staged (`2 R. … R64`): the
   Staged row and the diff header read `src/d4/f4.txt → src/d4/f4-moved.txt +1`. Unstaging that line took 233 ms
   (rebuild 6.7); after it the index read `R100`, the line unstaged, the staged diff *No text changes* with the rename
   header. Then `git reset --hard` and the three untracked files removed.
4. **Status through git (`perf-synth`): pass.**
   - Warm edit ×6 (append to `src/d5/f5.txt`): exactly one `p3 status` per edit, **89 ms** (worst 91) (Stage A: 268 ms,
     twice per edit).
   - Stale (tab closed, all 100k touched, reopened from Recents, the warm edit kept): the scan 4.79 s (`slow status
     entries=1 elapsed=4.79s`); the list with `f5` painted at 4831 ms from the click (the scan ended at +4813); the
     counts at 4960 ms, 129 ms after the list; then `status repair code=0 elapsed=2.80s`, its rescan 97 ms. One repair
     in the whole walk; the rescan started none. No queued scan this time.
   - Rename on disk (`mv src/d6/f6.txt src/d6/f6-moved.txt`): Unstaged `D src/d6/f6.txt −2` + `U src/d6/f6-moved.txt
     +2`; both staged with their own buttons → one Staged `R src/d6/f6.txt → src/d6/f6-moved.txt` (git `R100`).
   - Q12, the diff tool (`diff.guitool` = `diff.tool` = `vscodium` already in the global config, unchanged): the
     rename edited on disk, its Unstaged row (`M src/d6/f6.txt → src/d6/f6-moved.txt +1`, the diff header without a
     rename) → *Open in VSCodium* → toast *Opened src/d6/f6-moved.txt in VSCodium*. The newest folder under
     `%TEMP%\t4-git-ui-diff\` held only `f6-moved.LOCAL.txt`, 25 bytes, equal to `git show :src/d6/f6-moved.txt` (the
     staged content). The owner's VSCodium was already running, so the diff opened as a tab in that window, and the
     walk didn't close it.
   - 12k changes (2000 `wide/` files modified, 10k untracked under `new/`): status scans 101–119 ms. The counts call
     (`p3 changed files … paths=Some(12002)`): 15.3, 10.0, 9.9, 9.8, 9.4 s — **~9.4–10 s per call**, where review pass
     9's bench had predicted +12 ms for the path list; the first call ran 35.2 s and failed (`ok=false`, no error
     logged; likely the warm edits to `f5` during it, reasoned, not checked). While one runs, later refreshes start no
     new call, so the counts lag ~10 s. Traced after the walk (Q23): the same on `main` (9.6–9.8 s) — libgit2 loads
     each working-tree file's filter attributes without an attribute session, ~0.8 ms per file; the path list costs
     nothing. Recorded as open rows (`open-items.md` §X), not judged by this step.
5. **One scan at a time (`perf-reset`): pass.** From the end of the command to the Changes bar: the `git add -u`
   control 413 ms (398–433); the mixed `reset` **397 ms** (worst 407), two 73–79 ms scans back to back; `reset --hard`
   **97 ms** (worst 229), 5–6 scans of 24–92 ms, one after another (Stage A: 2540 and 5889 ms). Overlap check (each
   scan's start against the previous one's end): 0 overlaps in this step's 76 scans and in the walk's 230, the
   smallest gap 1 ms.
6. **The output dock at the cap (`perf-git`): fail.** 50 × `log -n 5000 --format=%H` through Run git command…: 50 ops,
   250,100 rows, `scrollHeight` 4,502,110 px; `CSS.supports("content-visibility","auto")` true, `auto` on an op block.
   Scroll top → bottom, 3 s each, frames / max gap / frames over 50 ms: 528 / 33.4 / 0; 521 / 20.9 / 0; 534 / 12.7 /
   0; **373 / 695.9 / 1**; 546 / 12.6 / 0 — a gap ≥ 100 ms in 1 of 5, so a fail by D3 (the 10 % clause held, 0.3 %).
   Five more samples (not judged): worst 29.2 ms. Traced after the walk as a V8 major GC whose Blink part (Oilpan)
   took ~665 ms at 250k rows, its garbage made by the scrolling; at 25k rows the forced GC took 40–46 ms (Q24). Fixed
   with the 25,000-line cap and re-walked below.
7. **The Files tab (`perf-synth`, History, tree mode, Stage A's 12k changes present): pass.**
   - First visit ×5: **274 ms** (worst 300); the backend listing (100,000 entries) 142–150 ms. Recorded (B3; Stage A
     520 with the 12k changes, 407 clean).
   - Revisit ×5: **28 ms** (worst 29) (Stage A 245). Expand ×6: ~26 ms (worst 32) (Stage A 255). Collapse ×5: 21 ms
     (worst 26) (Stage A 246–251).
   - Pure (the script at the end of this record, run over CDP, WebView2 / Chromium 154; cold / median / worst):
     2000 sibling folders 1.7 / 3.1 / 6.2 ms; 10k files in one folder 5.8 / 3.0 / 3.3 ms; the 100k listing 39.2 /
     **35.7** / 40.3 ms (a rerun 40.4 / 35.8 / 36.9). Stage A: 11.4 / 9.4 / 9.8; 3.4 / 1.7 / 4.0; 131.7 / 141.6 /
     145.8. Every median under 125 ms, so no WebKitGTK re-time (D2).
8. **Closing a tab stops its scan (`perf-synth`): pass, exercised.** Tab closed, all 100k touched, reopened; ~1 s
   later: one `git -c status.renames=true -c status.renameLimit=3000 status --porcelain=v2 -z -uall` listed, no
   `index.lock`; the close sent. From the first poll (+212 ms) through +1.7 s: no such process, no `index.lock`. The
   log: `closed repo` at 13:36:28.956, the scan's `p3 status … elapsed_ms=1516 … ok=false` at 13:36:28.962. It was the
   first stale scan (no `status repair` since the touch), and no repair followed.
9. **fsmonitor (`perf-git`): pass.** `git config core.fsmonitor true`, the build relaunched on it, left idle 70 s: the
   open's scan (35 ms), then one watch batch that emitted nothing, and no scan for 70 s. The daemon ran meanwhile
   (`git fsmonitor--daemon run --detach`). After: the config unset, `git fsmonitor--daemon stop` (status *not
   watching*), no `git.exe` left.

No ERROR / WARN lines in the log over the walk. The installed 0.10.15, launched once for BL 1's badges, opened
`perf-synth` with a 1.543 s refs read and a 299 ms `slow status`.

## Windows, the re-walk of steps 1 and 6 (`420b545`, 2026-10-02)

1. **Refs read and merged badges: pass on both.**
   - `perf-synth` (start: `main` = `origin/main` = `da22433`; cold open: full walk 676 ms, refs read 751 ms). Commit
     ×6: toast → sidebar **68.5 ms** (worst 74.5), refs read **61.4 ms** (worst 65.7), walk 3.6–4.0 ms incremental
     (was 597 / 576 / ~500–540). Click → sidebar itself is 233–247 ms: the commit's own ~170 ms to the toast plus ~70
     (not judged by the step; C-4's §Q row). The second read per commit 83–92 ms, walk 2.2–2.8 ms.
   - Checkout ~62 ms (worst 64.6); cached F5 ~89 ms (worst 93.4); forward move ×5 **73.9 ms** (worst 76.6), walk
     3.6–4.9 ms; the merge move (`origin/main~5` = `da22433`, no ref on it) **71.3 ms**, walk 4.1 ms: pass.
   - Badges before any fallback, against the installed 0.10.15 on the same refs (`origin/main` = `f6a44c5`):
     identical — 662 rows, all `→ main`, the same hash as the first walk's. The installed app's open: labels 1.084 s,
     refs read 1.600 s.
   - Backward move after a relaunch: the full walk, 498 ms, refs read 555 ms (recorded as is).
   - `perf-git` (`origin/master` = `a018953`, `master` ahead 12): toast → sidebar **70.0 ms** (worst 77.0), refs read
     52.7 ms (worst 55.7), walk 0.27–0.51 ms (was 15–17); checkout ~55 ms (worst 76.5); F5 ~72 ms (worst 77.8);
     forward 58.8 ms (worst 62.5); the merge move 63.3 ms: pass. Extra: a backward move, 571 ms walk, 612 ms refs
     read; the restore (also backward) 614 / 660 ms. The first commit run's page timing was lost to a broken pipe in
     the driver; its log lines (walk 0.28 ms, refs read 53 ms) were kept, and the six runs redone.
   - `full=true` only where expected: the four opens, the two backward moves and the restore.
6. **The output dock at the cap (`perf-git`): pass.** The build relaunched (dock empty), 50 × `log -n 5000
   --format=%H`: after op 1, 1 op and 5,002 rows; from op 10 on, and in every sample, **5 ops / 25,010 rows** (25,000
   output lines), `scrollHeight` 450,220 px. Scroll top → bottom ×10, frames / max gap / over 50 ms: 227 / 24.8 / 0;
   225 / **49.2** / 0; 226 / 24.8 / 0; 228 / 30.8 / 0; 245 / 29.7 / 0; 221 / 24.8 / 0; 224 / 24.7 / 0; 225 / 24.8 /
   0; 222 / 23.5 / 0; 231 / 24.8 / 0. Worst gap 49.2 ms, 0 % over 50 ms. A 51st op run with the dock scrolled to the
   top: it scrolled to the bottom with the new op in view, and 5 ops / 25,010 rows stayed. A real mouse drag across
   three lines selected two full hashes.
   - The page drew ~75 frames/s in this build, idle too (233 frames per 3 s without scrolling), against ~175 in the
     first walk's build: raised as a possible regression and measured on the Windows VM (C-4, below).

No ERROR / WARN lines in the log.

## Linux, BL 10 (`8246a97`, 2026-10-03)

**Walk 1.** First check: `opened repo id=…/perf-git elapsed=534.51µs` in `$S/app.log`, so the debug build stayed.
- Step 6: pass. 8 runs of `log -n 5000 --format=%H` (Ctrl+Shift+R): 1 op / 5,002 rows … 5 ops / 25,010 rows, steady
  for runs 6–8. `scrollTop` at 0, ¼, ½, ¾ and 1 of 450,220 px rendered; a wheel `deltaY` of 3000 moved it 0 → 3000; a
  drag selected 4 lines, the right 4 hashes. `CSS.supports("content-visibility","auto")` true, `auto` on all 5 op
  blocks. Frames not judged.
- Step 4: pass. The warm edit `M src/d0/f1.txt +1`, as `git status` lists it, with no `slow status`. Stale: opened
  17:10:11.370; `slow status entries=1 elapsed=4.507s`; `status repair code=0 elapsed=7.22s`; one repair line, none in
  the next 30 s; the list right, with its +1 count, within ~4–6 s. The rename on disk (`f2` → `f2-renamed`): `U +2`
  and `D −2`, counts matching; both staged → one `R src/d0/f2.txt → src/d0/f2-renamed.txt` (git `R100`).
- Step 8: pass. The scan (`git -c status.renames=true -c status.renameLimit=3000 status --porcelain=v2 -z -uall`)
  running at 17:12:02.82 and 03.35; Ctrl+W at 03.40 (`closed repo`); none in `pgrep -ax git` at +0.26, +0.69 and +1.1
  s, no `index.lock`, no git at +10 s.
- Not done, by the step's rule: step 4's 12k counts call and Q12 check; step 7's re-time (no Windows median ≥ 125 ms).
- Slips: a `git status --short` in `perf-synth` after the first touch (re-touched before the reopen), and one click
  through a broad selector (no effect). Seen: `libEGL warning: DRI3 error` (Xvfb); a doubled `opened repo` line ~25 ms
  apart (C-2); a refs read logged 0.57 s after `closed repo` (C-3).

**Re-walk (C-10; the owner's ruling, same build).** Rules: no git in `perf-synth` between a touch and its reopen;
exact selectors only (the toolbar's `[role=toolbar][aria-label=Repository]` Changes button, `[aria-label="Unstaged
files"] [data-path=…]`, `[aria-label="Git command"]`); Recents' Enter only after the focus and the selected path are
asserted; wheel and drag inside `[role=log]`.
- Step 6: pass, as in walk 1 (1 / 5,002 … 5 / 25,010, steady; `content-visibility` supported and `auto` on 5 blocks;
  scroll, wheel and selection right).
- Step 4: pass. The warm open with no `slow status`; the warm edit as git lists it. Stale: `slow status` 13.50 s, then
  exactly one `status repair` (code 0, 0.50 s), none in the next 39 s; the list right. The rename on disk `D −2` /
  `U +2` → one `R` row (git `R100`).
- Step 8: the first attempt not exercised (the scan ended in 0.54 s, before the close). A slip on the way: the
  pre-made touch list still held the renamed-away `f2.txt`, which the touch recreated empty; reset, the list rebuilt,
  retried. The retry passed: the scan (pid listed) seen at 19:20:08.035, Ctrl+W → `closed repo` at 08.100, gone after,
  no `index.lock`, no git at +10 s; the kill read from the missing `slow status` line.
- **New:** the quit after step 6 (the dock at 25,010 rows) aborted WebKit's web process: `free(): corrupted unsorted
  chunks` in `app.log`, a `WebKitWebProcess` crash file at 19:16:18Z (libwebkit2gtk-4.1 2.52.6), no core or stack. 1
  of the 2 walks' quits; walk 1's was clean. Investigated below.

## macOS, BL 11 (`8246a97`, 2026-10-03)

- First launch: pass. `probed git version=git version 2.56.0 too_old=false`, `opened repo …/perf-git`, the scratch
  `HOME` honored.
- Step 8: pass, no redo. Seed `[perf-git, perf-synth]`, `perf-synth` active, all 100k files touched with the app quit.
  `opened repo` for `perf-git` at 18:34:10.572Z and `perf-synth` at 18:34:10.620Z, the title `perf-synth` at
  18:34:11.133Z. The `ps` line: `git -c status.renames=true -c status.renameLimit=3000 status --porcelain=v2 -z -uall`,
  its pid its own process-group id, no children. ⌘W → `closed repo id=…perf-synth` at 18:34:11.494Z. Within a second:
  no `perf-synth` scan (no parent filter), no `index.lock`, the app running with the title `T4 Git UI - perf-git`,
  exactly one `closed repo`, no `slow status` or `status repair`, no ERROR / WARN. ⌘W closed the tab, not the window.
  Whether a whole process group is reached stays the Unix unit test's (`crates/git-core/tests/status.rs`, macOS CI).
- Step 9: pass. `core.fsmonitor` set before the launch; `watcher started` at 18:34:35.79Z; the daemon *watching* and
  `.git/fsmonitor--daemon.ipc` present. The first 10 s: 2 `built-in: git status` lines and 2 refs reads; the next 52 s:
  none of either. The control (a line appended to `README.md`): a `git status` ~0.6 s later; restored with
  `git checkout`.
- Seen: a doubled `opened repo` (3–5 ms apart) at every launch (C-2); ⌘Q never logged `closed repo` in 3 launches
  (C-1); a refs read for `perf-synth` 1.5 s after its `closed repo` (C-3).

## Q25 — the reachability matrix at 3000 branches (Windows, 2026-10-02)

`420b545` against the installed 0.10.15, on `perf-b330` (332 distinct tips) and `perf-b3000` (3002 distinct tips on
one line of history, ~4.5M reach pairs: the densest shape). Each run a fresh launch with one tab; idle waited for by
the log going quiet and the app's CPU under 0.1 s per 2 s, three times; F5 over CDP; forward moves as BL 1's; then
the refs restored. Memory: `t4-git-ui.exe`'s private bytes (and its webview processes apart). Log 15:37–16:24 UTC.

| fixture | app | private MB after open (repeat) | after the F5s and moves | F5 refs read, median (worst) | F5 merged walk, median (worst) | forward refs read (walk) | cold open refs read / full walk |
|---|---|---|---|---|---|---|---|
| b330 | build | 119.0 (122.1) | 172.9 | 221.4 (243.3) | 2.52 (2.81) | 148 / 150 / 155 (3.5 / 3.7 / 3.5) | 1336.9 / 543.2 |
| b330 | 0.10.15 | 125.3 (123.8) | 168.9 | 1385.2 (1517.1) | — | 1774 / 1677 / 1746 | 1569.5 |
| b3000 | build | 290.5 (284.4) | 297.7 | 1862.6 (1946.9) | 168.6 (176.8) | 1439 / 1385 / 1329 (174 / 175 / 173) | 13226.6 / 1143.9 |
| b3000 | 0.10.15 | 137.8 | 184.9 | 106942 (113033) | — | 89998 / 86996 / 87396 | 84151 (labels 90881) |

- The matrix's cost (build − 0.10.15): at 332 tips noise (−6.3 / +4.0 MB; ~2 MB expected for 55k pairs); at 3002 tips
  +152.7 MB after the open (+146.6 on a repeat), +151 MB working set — ~33 bytes a pair, as the review estimated.
  The webview processes were the same per fixture for both apps (~260–300 MB at b330, ~455–525 MB at b3000).
- Every F5 at 3002 tips, with no ref change: a 165–177 ms walk (`retain` dropping the gone oids, plus the bitset fill),
  inside a 1.8–1.9 s refs read whose other ~1.6 s is the collect (`p3 collect walk=false` 1544–1717 ms); at 332 tips
  2–3 ms.
- 0.10.15 at 3002 tips: every refresh 87–113 s at ~1 core, its labels as long; unusable at that size. Which part of
  that is its merged walk isn't measured (no `p3` lines in 0.10.15).
- The build's first cold open of `perf-b3000` took 13.2 s (the collect 12.5 s); a later reopen 2.4 s — a cold OS file
  cache on the first open, not the matrix (its full walk 1.14 s).
- `full=true` only on the cold opens; never on F5, a forward move or the restore. A first 0.10.15 run at b3000 was
  invalid (the log-quiet idle fired mid-refresh and its F5s queued behind 90 s reads) and was redone with the CPU-idle
  wait. No ERROR / WARN lines.
- Accepted as a §Q row (Q25).

## C-4 — the idle frame rate on the Windows VM (2026-10-03)

The Windows VM (VMware SVGA 3D, a 60 Hz display, 1920×1200, DPR 1; the window focused and visible), on a git/git clone
at `c46c1e3772`. A = `main` `cb3c9e3`, B = `8246a97`, both release builds; five idle 3 s samples per run, A, then B,
then A again.

| run | frames per 3 s | max gap | frames over 50 ms |
|---|---|---|---|
| A1 (`cb3c9e3`) | 190 ×5 | 15.9–16.0 ms | 0 |
| B (`8246a97`) | 180 ×5 | 16.9 ms | 0 |
| A2 (`cb3c9e3`) | 190 ×5 | 16.0 ms | 0 |

A 63.3 fps, B 60.0 fps (locked to the display); A1 = A2, no drift; no stalls, no ERROR / WARN. The desktop's ~175 vs
~75 frames/s between the two Windows builds isn't a Phase 3 effect visible here. Recorded and closed (C-4).

## The WebKitGTK abort on quit (Linux VM, `8246a97`, 2026-10-03)

- 20 cycles, each with a fresh driver, app and `HOME`: `perf-git`, 6 × `log -n 5000` to 5 ops / 25,010 rows, a scroll
  to the bottom in 51 animation-frame steps, `invoke('quit')`, 25 s for the crash reporter. Cycles 1–10 as built;
  11–20 with `content-visibility: visible` and `contain-intrinsic-size: none` forced on every op block through a
  constructable stylesheet (a `<style>` element is blocked by the CSP nonce). A first batch that used one counts as 10
  more as-built cycles. Op blocks matched as `[role=log][aria-label="Command output"] > div`.
- Result: **0 aborts in 30 quits** (0 / 10 as built, 0 / 10 forced visible, 0 / 10 more as built): no crash files, no
  `free()` / `corrupted` / `SIGABRT` lines, every scroll reached the bottom, no ERROR / WARN. In all: **1 abort in 32
  quits** at the cap.
- No stack: the crash reporter dropped the re-walk's core (*core dump exceeded 3866 MiB*), `ptrace_scope` was 1, and
  there was no sudo for debug symbols. Next time: `sysctl kernel.yama.ptrace_scope=0` and gdb on the web process
  before the quit, or systemd-coredump or a larger apport limit, plus `libwebkit2gtk-4.1-0-dbgsym` or debuginfod.
- The web process outlived the app's pid by up to 25 s in 19 of 20 cycles (normal teardown).
- Deferred as an open row with that recipe (`open-items.md` §X).

## Hash map

The builds walked are pre-squash commits of `phase-3b`. `phase-3b` was squashed and pushed to `main` 2026-10-03 as
`6ca9960..625b886` (the twelve Phase 3 commits), plus `cb886f4`, a clippy 1.99 fix (`map_err(cleanup)` in
`commands/ops.rs`; CI run 37101322955 on `625b886` failed on it, run 37101746293 on `cb886f4` is green). The map:

| Pre-squash (`phase-3b`) | On `main` |
|---|---|
| fix 1a `4a57094` | `f2e5d02` |
| fix 1b `f2faa2a` + its fixup `22d20df` (Q22) | `c6bfdef` |
| fix 2 `7dd279a` + fixups `bb53e2e`, `86253e2` | `f3cc948` |
| fix 5 `7c3491b` | `9be1867` |
| fix 3 + T7 `5905037` + fixups `7866660`, `d2b3cfd`, `aa7142a`, `244345a`, and two later comment fixups, `8eb8103` and `a8e4941` (Q20's note in `commands/stage.rs`) | `a369138` |
| fix 4 `0b4bb7b` + fixups `070c84d`, `ba6d754` (Q24) | `6d1a7d5` |
| fix 6a `656b0c7` | `785a9f1` |
| Q21's test `b6af79e` | `0c9608a` |
| the global-config test's move `0777246` + fixup `747d9c3` (C-5, after `8246a97`) | `e3ba77e` |
| Stage A's docs (`eb05dea..c52a2cd`) | `6ca9960` |
| Stage B's plan and its review passes (`2480c63..14b428a`) | `7d0f639` |
| the BL group `b6e3da6` and the later plan / BL docs commits, `8246a97` among them | `625b886` |

- `b6e3da6` (under `bf75367`) lacks Q22, Q24, fix 2's and fix 3's later code fixups and Q21's test; all of them are in
  `ba6d754`. The test-only fixups `244345a` and `86253e2` came after it, before `8246a97`.
- `ba6d754` (under `420b545`) and `8246a97` hold the product code of `cb886f4` but for three changes that alter no
  behavior: the `commands/stage.rs` comment, the global-config test's move into its own binary, and the clippy fix
  (checked with `git diff`). Between `ba6d754` and `8246a97` only tests and docs changed.
- None of the pre-squash hashes, nor `bf75367` and `420b545`, are on `origin/main`.

## Cleanup

- Windows: `perf-synth` clean on `main`, `main` +12 commits (BL 1's, both walks), `origin/main` set to the local `main`
  per the step (Stage A's rule), every other ref unchanged; `perf-git` clean on `master`, `master` +13 commits,
  `origin/master` back at `a018953`, every other ref unchanged; `perf-reset` as before (2 stashes, 1800 modified);
  `perf-b330` / `perf-b3000` refs identical to before (`origin/main` `53dce1d`), the walk's commits left as
  unreferenced loose objects. Checked by diffing `for-each-ref` against snapshots taken before. No `.git/origin`, no
  `index.lock`, `core.fsmonitor` unset, no daemon, no `t4-git-ui.exe` or `git.exe` left; every app closed with
  `CloseMainWindow`. The store restored byte-exact after each walk.
- The owner's VSCodium may still hold BL 4's diff tab.
- Linux VM and Mac: no `t4-git-ui` or `git` process of the walks left.
- The Windows VM keeps its folders in `C:\tmp\t4` (`perf-A` and `perf-B`, the app's source clones for C-4's A and
  B builds; `perf-git`); its store restored.

## The pure 6a script (BL 7)

Run over CDP with `cdp.mjs --eval` (and, had a median reached 125 ms, through `docs/smoke/wd.mjs eval` on the VM, R5).
`buildFileTree` and `compact` are a plain-JS copy of `src/screens/RepoWindow/ChangedFileList/fileTree.ts:18-51, 59-70`
at fix 6a's `656b0c7` (unchanged on `main` since: `785a9f1`), types stripped, checked line by line; the inputs and
harness are Stage A's. Three long lines are wrapped here.

```js
(async () => {
  // BL 7 pure timing (D2, R5): plain-JS copy of fix 6a's buildFileTree + compact, inputs generated here, harness as
  // Stage A's p3/pure.js. One expression, no trailing semicolon, no comment on the last line (wd.mjs eval wraps it).
  // --- copy of src/screens/RepoWindow/ChangedFileList/fileTree.ts:18-51, 59-70 (phase-3b 656b0c7; types stripped) ---
  const byName = new Intl.Collator().compare;
  function buildFileTree(files) {
    const root = { name: "", path: "", children: [] };
    const folders = new Map([[root, new Map()]]);
    for (const f of files) {
      const parts = f.path.split("/");
      let node = root;
      parts.forEach((part, i) => {
        const last = i === parts.length - 1;
        const sub = folders.get(node);
        let child = last ? undefined : sub.get(part);
        if (!child) {
          child = { name: part, path: parts.slice(0, i + 1).join("/"), children: [] };
          if (last) child.file = f;
          else {
            sub.set(part, child);
            folders.set(child, new Map());
          }
          node.children.push(child);
        }
        node = child;
      });
    }
    const sort = (nodes) => {
      nodes.sort((a, b) => Number(!!a.file) - Number(!!b.file) || byName(a.name, b.name));
      nodes.forEach((n) => sort(n.children));
    };
    sort(root.children);
    compact(root.children);
    return root.children;
  }
  function compact(nodes) {
    nodes.forEach((n, i) => {
      if (n.file) return;
      let node = n;
      while (node.children.length === 1 && !node.children[0].file) {
        const child = node.children[0];
        node = {
          name: `${node.name}/${child.name}`,
          path: child.path,
          chain: [...(node.chain ?? [node.path]), child.path],
          children: child.children,
        };
      }
      nodes[i] = node;
      compact(node.children);
    });
  }
  // --- inputs, in the fixtures' shapes (as p3/pure.js) ---
  const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const synth = (n) => [
    ...range(n - 2000, (k) => ({ path: `src/d${Math.floor(k / 100)}/f${k % 100}.txt` })),
    ...range(2000, (k) => ({ path: `wide/s${k}/f.txt` })),
  ];
  const cases = {
    "6a sibling 2000": () => buildFileTree(range(2000, (k) => ({ path: `wide/s${k}/f.txt` }))),
    "6a one folder 10k": () => buildFileTree(range(10000, (k) => ({ path: `new/f${k}.txt` }))),
    "6a listing 100k": ((l) => () => buildFileTree(l))(synth(100000)),
  };
  const out = { engine: navigator.userAgent };
  for (const [name, fn] of Object.entries(cases)) {
    const t = [];
    for (let r = 0; r < 6; r++) {
      const s = performance.now();
      fn();
      t.push(performance.now() - s);
      await new Promise((res) => setTimeout(res, 0));
    }
    const warm = t.slice(1).sort((a, b) => a - b);
    out[name] = { cold: +t[0].toFixed(1), median: +warm[2].toFixed(1), worst: +warm[4].toFixed(1) };
  }
  return out
})()
```
