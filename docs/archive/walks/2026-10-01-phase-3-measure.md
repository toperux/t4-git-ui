# Phase 3 Stage A, the measuring walk — 2026-10-01

Stage A of `docs/archive/plans/2026-10-01-phase-3-plan.md`: rows 1–8 timed once on the fixtures and the owner's two real
repositories, against T1 (≥ 250 ms on a real action, or visible jank by D3). The numbers are summed up in the plan's
*Results*; this record keeps the samples and the attribution behind them.

**Setup:**
- Build: the throwaway branch `phase-3-measure` (`87aee28` = `main` `f2977a2` plus temporary `p3 …` timing lines,
  never merged, D1), `tauri build --no-bundle`, launched with `docs/smoke/fixtures/smoke-launch.ps1` (CDP port 9222,
  its own WebView2 profile) and driven with `docs/smoke/cdp.mjs`.
- Machine: the owner's Windows 11 laptop (D5). Display at 240 Hz (720 frames per 3 s sample). Defender real-time
  protection on; its exclusions can't be read without admin, so the numbers are as the owner runs the app.
- The window stayed visible in every sample (`visibilityState` recorded each time). `core.fsmonitor` unset and
  `commit.gpgsign` false in every fixture and both real repos.
- The store (`%APPDATA%\dev.topher.t4gitui`) was backed up before and restored after; `diff -r` found it identical.
- Fixtures in `c:/tmp/t4/`: `perf-synth` (`docs/smoke/fixtures/perf-repo.mjs`: 100k commits, 664 refs, 100k files),
  `perf-git` (a git/git clone: ~82k commits on `master`, 1024 refs incl. 1012 tags, ~4.9k files), `perf-reset`
  (1800 tracked files), `perf-rebase` (base + 499 `fixup!` commits), `perf-linked` (30 worktrees, 20 submodules).
- Real repos A and B are full folder copies with hooks and remotes disabled (R1), named only by letter (D5).
  Real repo A: ~50k tracked files, ~500 commits, ~10 refs. Real repo B: ~3k tracked files, ~10k commits, ~200 refs.
- Timers: a page helper stamps "click → condition true, +2 frames" on DOM mutations; where the DOM can't show the
  change (a cached revisit), "settle" takes the frame ending the last ≥ 25 ms frame gap after the click. On the
  first visits both ran and agreed within ~4 ms. Backend parts come from the app log (UTC, µs).

| # | Row | Verdict | Median (worst) |
|---|---|---|---|
| 1 | Merged-branch walk → sidebar late | **over** on `perf-synth`, `perf-git`; under on A, B | toast → sidebar 2346 ms (2484) / 787 ms (801) |
| 2 | Hunk / line rebuilds | **over** for a working-tree deletion on `perf-synth`; fine otherwise | stage 1 line 918 ms (928) |
| 3 | Status at size | **over** warm on `perf-synth` and A; under on B | 268 ms (313) / ~670 ms (697), twice per edit |
| 4 | Output dock | **jank** at the 50-op cap; none up to 10 ops | frame gaps 654 / 784 ms in 2 of 5 samples |
| 5 | External reset → Changes | **over** on every repo | mixed reset 2540 ms; `--hard` 5889 ms |
| 6a | Changes / Files trees | **over** for a Files first visit and a folder expand; toggle fine | 520 ms (528); expand 255 ms (260) |
| 6b | Sidebar tree build | fine | 22 ms at 5000 tags (pure) |
| 7 | Rebase dialog `canSquash` | fine | open render ~64 ms; change 24 ms |
| 8 | Linked snapshot | fine warm; one cold open over | 113 ms (114); first open 448 ms |

## Row 1 — the merged-branch walk (§A)

**`perf-synth`** (100k commits, 332 local branches with upstreams, 664 refs, 100k files).
- Cold open: opened 21 ms; status 1.131 s; labels 2.291 s; walk complete 664 ms; merged walk 492 ms; refs read
  1.667 s; linked read 101 ms. Opens 2–5 (Ctrl+W, reopen from recents): status 316–376 ms; labels 1.117–1.258 s; walk
  complete 664–734 ms; merged walk 483–571 ms; refs read 1.718–2.034 s; linked read 111–134 ms.
- Commit, click → toast / → sidebar ahead count (the judged number is toast → sidebar):

  | run | toast | sidebar | toast → sidebar | refs read | merged walk | status after (refresh true / false) |
  |---|---|---|---|---|---|---|
  | cold | 1071 | 3248 | 2177 | 2.084 s | 586 ms | 278 / 533 ms |
  | 2 | 165 | 2384 | 2219 | 2.137 s | 568 ms | 297 / 564 ms |
  | 3 | 179 | 2525 | 2346 | 2.254 s | 568 ms | 365 / 650 ms |
  | 4 | 171 | 2485 | 2315 | 2.229 s | 672 ms | 324 / 606 ms |
  | 5 | 168 | 2597 | 2430 | 2.339 s | 562 ms | 315 / 588 ms |
  | 6 | 172 | 2655 | 2484 | 2.392 s | 573 ms | 307 / 563 ms |

  Median (runs 2–6): toast → sidebar 2346 ms → **over**. One refs read per commit here (the event and
  `commitStore`'s refresh coalesced).
- Moved tip (`origin/b200` moved back 10–50 commits by a terminal `update-ref`), refs read / walk: 2.043 s / 531 ms
  (plus a second, cached read 1.582 s / 0.16 ms), 2.147 / 554, 1.788 / 494, 1.787 / 509, 1.822 / 511 → median 1.82 s.
- Stale local (R4: `origin/maint` moved to `main~1..~5`, `maint` ~100k behind): 1.875 s / 158 ms, 1.836 / 175, 1.976 /
  157, 1.893 / 186, 1.825 / 173 → median 1.875 s. The ahead / behind count adds little over the floor below.
- Checkout from a terminal (alternating two branches): 1.886 / 505, 1.943 / 521, 1.960 / 517, 1.834 / 513, 1.844 /
  505, 2.018 / 533 → median 1.91 s.
- Cached F5 (no tip moved; walk 0.18–0.25 ms): refs read 2.033, 1.897, 2.030, 1.795, 1.948, 1.681 s → median 1.92 s.
- **Attribution:** the refs read has a ~1.7–2.0 s floor with no walk at all; the merged walk is only ~0.5 s of it.
  The rest is elsewhere in `get_refs` (to find in Stage B), and it scales with the 332 branches.

**`perf-git`** (git/git).
- Cold open: opened 24 ms; labels 132 ms; status 226 ms; merged walk 670 ms; refs read 710 ms; linked read 9 ms;
  walk complete 1.054 s (85,840 rows). Opens 2–5: labels 69–79 ms; status 38–40 ms; merged walk 699–712 ms; refs read
  762–779 ms; walk complete 1.118–1.158 s.
- Commit (toast / sidebar / toast → sidebar; refs read / walk): cold 626 / 1409 / 783 (757 / 695); 81 / 882 / 801
  (772 / 701); 91 / 862 / 771 (747 / 677); 86 / 873 / 787 (763 / 692); 80 / 867 / 787 (757 / 688); 89 / 852 / 763
  (740 / 681) → median (2–6) 787 ms → **over**. Two refs reads per commit; the second is the cache hit (walk ~7 µs,
  read 62–77 ms).
- Moved tip (`origin/bisect` back 10–50): refs read 738–751 ms (median 746), walk 665–678 ms. Checkout: 735–746 ms
  (median 743). Cached F5: 83–90 ms, walk ~10 µs.
- **Attribution:** here the walk is the cost (~670 of ~745 ms).

**Real repo A.** Cold open (first after the copy): refs read 30 ms, merged walk 24 ms, linked read 525 ms, status
2.287 s (stale after the copy). Opens 2–5: refs read 8–9 ms, linked 101–112 ms, status 683–760 ms. Commit: toast →
sidebar 8, 13, 8, 17, 8, 13 ms (median 13). Moved tip 11–15 ms; checkout 7–9 ms; cached F5 7–13 ms → under.

**Real repo B.** Cold open: refs read 118 ms, merged walk 72 ms, status 88 ms, walk complete 104 ms (~10k rows).
Opens 2–5: refs read 110–120 ms. Commit: click → toast 394 ms cold, then 96–105 ms. Toast → sidebar not taken: the
timer looked for the branch row at the top level, and HEAD's branch sits in a sidebar folder (a driver limit). Judged
on the refs read instead: 102–114 ms (walk 68–76 ms), then the cache hit 32–39 ms. Moved tip 104–118 ms; checkout
102–111 ms; cached F5 38–47 ms → under.

## Row 2 — hunk and line rebuilds (§A)

- **Modified file** (`perf-git`, `sequencer.c`, 20 replaced lines; click → the diff header's counts change):
  - Stage hunk ×20: 85, 89, 94, 88, 102, 88, 89, 87, 105, 101, 97, 101, 91, 103, 131, 115, 108, 109, 116, 87 ms
    (median ~98, worst 131). Rebuild 6.9–11.5 ms; backend total 31–53 ms.
  - Stage one line ×5: 124, 132, 124, 124, 123 ms; rebuild 9–11 ms; total 43–50 ms. (Runs 6–20 not taken: the driver
    clicked lines the virtualized view had scrolled out.)
  - Discard hunk ×20 (native confirm answered by `smoke-dialog.ps1`; timed from the backend lines, 3 runs' lines
    missed by the log read): rebuild 6–11 ms; total 30–62 ms (median ~42).
- **Added, staged side** (`perf-synth`, a new 200-line file) ×5: unstage one line, rebuild 15.5–19.0 ms, total 69–78
  ms; unstage the hunk, rebuild 16.7–20.5 ms, total 66–88 ms. Click → UI not taken (the header shows only "+200",
  which the timer's pattern missed until fixed after).
- **Deleted, staged side** (`perf-synth`, `git rm` again before each), unstage one line ×5: click → UI 485, 398, 384,
  402, 388 ms (median 398); rebuild 16.8–17.9 ms; total 74–83 ms. ~300 ms of the wait comes after the patch: the
  status re-scan of 100k files before the diff redraws (row 3), not the rebuild.
- **Deleted, working-tree side** (`perf-synth`, two files deleted, unstaged) ×5: stage one line, click → UI 926, 881,
  928, 897, 918 ms (median 918); rebuild 225–240 ms; total 284–299 ms. Discard hunk: rebuild 251–304 ms; total
  280–336 ms. → **over**: the whole-repository index → workdir rebuild (`diff.rs:226-231`, `:388-391`) costs ~230–300
  ms on its own, and the action ~0.9 s end to end.

## Row 3 — status at size (§Q)

- **`perf-synth`, warm** (touch one file ×6): the Workdir event's scan 258, 255, 259, 313, 296, 277 ms (median 268) →
  **over**. Every edit is scanned twice: the first scan writes the stat cache back to the index, the watcher reports
  that as an Index change, and status runs again: 249, 238, 255, 290, 274, 252 ms. One edit ≈ 2 × ~260 ms.
- **`perf-synth`, stale** (touch all 100k files, reopen): one clean run, the log quiet 60 s before and nothing else
  running: the reopen's scan **552.3 s (~9.2 min)**; the next scan (the write-back's Index event) 516 ms. For those 9
  minutes Changes shows the pre-touch state. Two earlier attempts were invalid: closing a tab doesn't stop its scan, so
  back-to-back reopens left up to 5 scans running at once (565–1186 s, all ending at the same instant).
- **Real repo A, warm** (touch one file ×6): 686, 670, 647, 648, 675, 697 ms, then the write-back scan 619–662 ms →
  **over** (~1.3 s of scanning per edit). Stale (touch all ~50k): 253 s (~4.2 min), then 1.50 s.
- **Real repo B, warm:** 58–116 ms, then 53–60 ms → under. Stale: 20.2 s, then 103 ms.
- Per-file stale cost is about the same everywhere: ~5.5 ms (`perf-synth`), ~5 ms (A), ~7 ms (B). Defender's
  real-time scan is likely a large share of it (reasoned, not measured).

## Row 4 — the output dock (§A)

`perf-git`, *Run git command…*, build restarted before the row (dock empty, 135 px high, the default).
- Paced output (300 lines over ~30 s) ×5, a 3 s sample from 4 s in: 720 of 720 frames every time, max gap 4.3–4.6 ms.
- `log -n 5000` burst ×5 (sample from 0.3 s in): max gap 4.3–9.9 ms, no frame over 50 ms. Scrolling top → bottom
  after each: max gap 4.4–37.4 ms, none over 50 ms (up to 10 ops / 26,520 lines).
- At the cap (40 more bursts: 50 ops, 226,600 rows, a 4.08M px scroll height), 5 scroll samples: max gap 4.7,
  **783.5**, 4.4, 4.4, **654.3** ms; 0.2 % of frames over 50 ms → **jank** by D3 (a gap ≥ 100 ms), at the cap only.

## Row 5 — an external 1800-file reset (§M)

End of the terminal command → the Changes bar shows the target counts (a 16 ms page poll). The control is `git add -u`
on the same files.
- **`perf-reset`** (1800 tracked files, all modified):
  - Control: 410, 424, 427 ms (scan 8–12 ms; the stat cache stays intact).
  - Mixed `git reset`: 2659, 2852, 2852, 2540, 2439, 2491, 2535 ms (median 2540) → **over** (control + ~2.1 s). The
    first watcher batch lands ~190 ms after the end, a second ~300 ms later; scan 1 takes 1.08–1.31 s and scan 2
    (overlapping) 1.75–2.15 s. The mixed reset leaves the index entries without stat data, so both scans re-hash
    every file, and the bar lands when the second ends. Watcher classify costs µs per batch.
  - `git reset --hard` (end → the bar gone): 4571, 5147, 5992, 6234, 5889 ms (median 5889) → **over**. Per reset,
    7–10 status scans start, one per watcher batch while 1800 files are rewritten, and finish within the same second
    (118 emitting batches over the 5 runs).
- **Real repo A** (~2000 tracked files modified by a script): control 1149–1398 ms (median 1255); mixed reset 6930,
  5913, 5842, 5407, 5681 ms (median 5842) → **over** (control + ~4.6 s). Three scans per reset: 0.77–1.02 s,
  2.61–3.44 s, 4.71–6.23 s; the last sets the landing. This matches §M's original "~4 s".
- **Real repo B** (~2000 modified): control 438–472 ms; mixed reset 2759, 14193, 2728, 3250, 2408, 2412, 2449, 2399 ms
  (median 2580; one 14.2 s outlier with a 13.9 s scan) → **over** (control + ~2 s). Per reset a ~70–100 ms scan,
  then a 2.1–3.0 s one.

## Row 6 — tree builds (§I E6)

**6a in the app** (`perf-synth` with 2000 sibling-folder files modified and 10k untracked files in one new folder:
12,000 changes):
- Changes, *Show as tree* (click → the first folder row painted; the condition checked false in list mode first),
  from list mode ×6: 20.2, 16.0, 18.4, 15.9, 16.5, 16.4 ms (median 16.5) → fine.
- Files tab on the 100k-file tree, tree mode (History view; the tab set once, untimed):
  - First visit, a click on 5 different commit rows → painted: 528.1, 521.3, 509.5, 520.4, 511.5 ms (median 520) →
    **over**. Each holds exactly one long frame of 242–263 ms (the build and render); the rest is the listing fetch.
  - Revisit of the same 5 (served from `treeCache`, no fetch; the settle timer): 242.8, 244.3, 261.4, 245.1, 260.8 ms
    (median 245) → under by 5 ms, a close call.
  - Folder expand, a different folder each time ×6: 253.6, 252.8, 256.7, 259.1, 250.7, 260.2 ms (median 255) →
    **over**, just. Collapses between them: 246.3, 250.9, 250.0, 246.5 ms. Each is one ~230–255 ms frame: the whole
    100k tree is rebuilt per click (`ChangedFileList.tsx:83-93`).

**Pure timings** (the plan's self-contained script run in the measuring build over CDP, WebView2 / Chromium 154;
cold / median / worst):
- 6a `buildFileTree`: 2000 sibling folders 11.4 / 9.4 / 9.8 ms; 10k files in one folder 3.4 / 1.7 / 4.0 ms; the 100k
  listing 131.7 / **141.6** / 145.8 ms. The build alone is ~140 of the ~250 ms frame; flatten, sort and render take the
  rest. At ≥ 125 ms, D2 has the VM session re-time the script on WebKitGTK.
- 6b sidebar `buildTree`: 330 branches under one remote 0.6 / 0.3 / 0.4 ms; 1000 flat tags 2.5 / 2.3 / 2.4 ms; 5000
  flat tags 54.7 / 22.0 / 40.9 ms → fine. Row 1's late sidebar is the backend refs read, not this build.
- 7 `canSquash` per row + `validate`: 1 pick + 499 fixups 6.3 / 4.2 / 4.4 ms; 500 picks 0.1 / 0.1 / 0.1 ms → fine.

## Row 7 — the interactive rebase dialog (§I R13)

`perf-rebase`, from the base row's menu (500 rows: 1 pick, 499 fixups).
- Open (menu click → 500 action rows painted; Escape between) ×6: 475.9, 460.1, 465.3, 479.0, 502.1, 456.7 ms. The
  backend todo read (`p3 rebase read`) took 402.3, 392.2, 410.4, 418.4, 407.7, 396.4 ms of it, so the render is 73.6,
  67.9, 54.9, 60.6, 94.4, 60.3 ms (median ~64) → fine. The read itself (~400 ms) isn't this row's question; it is put
  to the owner.
- One action change on the bottom row (option click → value painted), alternating fixup ↔ squash ×6: 34.1, 25.0,
  23.8, 22.4, 27.2, 21.8 ms (median 24.4) → fine.

## Row 8 — the worktree / submodule snapshot (§I)

`perf-linked` (30 worktrees, 20 submodules).
- `linked read` at the open: 448.4 ms on the first launch, beside a 378.9 ms status scan. The fixture hadn't been read
  since it was built, so the OS file cache was likely cold (reasoned, not measured). Two relaunches: 107.1, 109.4 ms.
- After F5 ×5: 113.0, 112.8, 113.5, 110.8, 111.2 ms (median 112.8) → fine. The cold first open is over T1 once.

## Not taken, and limits

- Row 1 on B: toast → sidebar (driver limit, above); the refs read stands in.
- Row 2: line stages beyond 5 on the modified file; click → UI on the added file.
- Row 3: Defender's share of the per-file cost is reasoned, not measured (exclusions unreadable without admin).

## Follow-up, 2026-10-02 (for the owner's rulings and Stage B)

**Linux re-time (D2, R5).** The VM session ran the pure script verbatim through `wd.mjs eval` on WebKitGTK 2.52.6
(Ubuntu 26.04.1, VMware, 8 vCPUs, idle; a debug build, which doesn't matter for pure JS). Its `performance.now()`
resolves to 1 ms. Cold / median / worst: the 100k listing 203 / **142** / 201 ms, the same as Windows (141.6);
2000 sibling folders 14 / 10 / 11; 10k in one folder 23 / 5 / 25 (one warm spike, likely GC, reasoned); 6b 330 /
1000 / 5000 refs 0–2 / 0–2 / 19–22; row 7 1 + 499 fixups 12 / 5 / 5, 500 picks 0. No platform difference.

**Row 3, the git command line on the same fixture** (`git status --porcelain=v2 -z`, git 2.55.0.windows.1): clean
warm 199–208 ms (the app: 268, run twice per edit); with 12k changes 233–255 ms; with `core.fsmonitor` and
`core.untrackedCache` 136–146 ms. Stale (all 100k touched): **5.92 s** (the app: 552 s), then 221 ms.

**Row 1, where the refs read goes** (`perf-synth`, 332 local branches; per-phase lines on `phase-3-measure` `0b05a7e`):
`branch_upstream_name` 487–600 ms and `branch.upstream()` 503–622 ms in total, ~1.7 ms per call; peel 4 ms, `is_head`
~31 ms, the cached ahead / behind 0.15 ms, remotes + tags + stashes ~3 ms. Without the walk 1.075–1.261 s. → The floor
is the two per-branch config lookups. Each F5 runs the enumeration twice (the labels and the refs read), each paying it.

**Row 6a, the first visit split** (5 commits, clean `perf-synth`): painted 402–427 ms (median 407); the backend
listing 144–145 ms (100,000 entries); the long frame 150–184 ms; the rest, ~80–110 ms, is serialization, transfer and
parse (inferred). On 10-01, with 12k working-tree changes present, the same click read 520 ms with a ~250 ms frame;
what made the difference wasn't measured.
