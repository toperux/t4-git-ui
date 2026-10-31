# The walk-triage fixes — walks, 2026-10-31

The walks of three fixes made from the Dependabot #36–#38 walk's triage: `503d6b62` (the dock shows a cancelled op as
"cancelled"), `445a898f` (error toasts name their repository; Retry and Pull stay on it) and `748b00c7` (the diff header
at its narrowest width). They ran on `e64e5a2c`. A second walk covered the two follow-up fixes that the first walk's row
2b led to, `6ddeb0d2` (a Retry during an operation keeps its toast) and `8d66df27` (a change started during a fetch says
to wait), on `8d66df27`. Both walks ran 2026-10-31 on the Windows VM test-pc (session git-ui-win, release builds via
`tauri build --no-bundle`, over CDP at 1280×800; 1400×800 for row 3). The first build was killed by Claude Code's memory
guard and rebuilt with `CARGO_BUILD_JOBS=1`. `document.title` was carried in every measurement and never changed
unexpectedly; every screenshot was read. CI run 41183797920 on `8d66df27` was green on three OS.

## Build

- First walk: `e64e5a2c`, node 24.21.0. A 2-job build was killed by the memory guard; rebuilt with `CARGO_BUILD_JOBS=1`,
  8 m 53 s. Exe sha256 `3a2cadd1…2301`, app version 0.10.24. Launched with `smoke-launch.ps1`.
- Second walk: `8d66df27`, node 24.21.0, run in the foreground with `CARGO_BUILD_JOBS=1`, 9 m 40 s. Exe sha256
  `24680529…7908`, app version 0.10.24. Launched with `smoke-launch.ps1`, like the first.

## Fixtures

- `smoke-fixtures.ps1 -Root C:/tmp/t4bw`; `layout.json` seeded with `work | other`.
- For the cancelled clone: `perf-big` (a `perf-repo.mjs` fixture, 100 000 commits, 151 MB, built in 42.6 s) and `tiny`,
  both under `C:/tmp/t4bw`.
- Store backed up before each walk and restored after (`recents.json`, `.window-state.json`, both `cmp` equal); the
  seeded `layout.json` (`work | other` for both walks) removed after each; `C:/tmp/t4bw` deleted.

## Rows

1. **Dock "cancelled"** — pass.
   - Fetch `slow` › Cancel (collapsed bar, after ~14 s) → toast "Cancelled"; the dock stayed collapsed; header compact
     span class `_xs _muted`, `lucide-ban` svg, "cancelled · 14.6s". Expanded exit line `<div class="_exit _muted">`,
     color rgb(158,164,176). Against Fetch `nowhere`: `_exit _err`, lucide-x, "exit 128 · 0.1s", rgb(240,97,85).
   - Seen again in row 2b: "cancelled · 9.6s".
   - **Cancelled clone, first try — not reachable.** A local clone of `bare.git` finished in 0.2 s, "exit 0", before
     Cancel could be pressed; the slow upload-pack is a per-remote setting of `work`. The Clone dialog accepts the path
     URL.
   - **Cancelled clone, addendum, same day, same build — pass.**
     - Clone… from the start screen with `file:///C:/tmp/t4bw/perf-big`. Cancel pressed about 1 s in, while git was
       enumerating objects (112 723 and 115 028 counted). Two runs; the first went into the dialog's default parent
       folder, `C:\Users\tophe`.
     - Within 150 ms the dialog went back to idle with no toast (by design: the dialog's cancel returns to the form;
       `[role=alert]` and `[role=status]` empty at +0.15, +0.55 and +2.05 s).
     - Log: `cancel requested op_id="op-1" found=true` and `cancelling git command` for both. No git process left;
       neither partial clone-x directory remained.
     - The start screen has no dock, so a small clone (`file:///C:/tmp/t4bw/tiny` into clone-y) from the same dialog
       opened a tab in that window. Its dock listed both cancelled clones as "cancelled · 1.5s" and "cancelled · 1.4s"
       (`_exit _muted`, lucide-ban, rgb 158,164,176) above the new clone's "exit 0 · 0.3s" (`_exit _ok`, lucide-check).
       The dock opened collapsed; expanded by hand.
     - Console hook `[]`; log lines 113–129, 0 WARN / 0 ERROR; the checkout untouched at `e64e5a2c`.
2. **Toasts name the repository; Retry and Pull stay on it** — pass. Every wording read from the DOM (`[role=alert]` /
   `[role=status]` text and button labels).
   - **a.** Fetch `nowhere` → alert "work: Operation failed" / "fatal: Could not read from remote repository.", Dismiss
     only; still in the stack after switching to `other`.
   - **b.** index.lock created, Stage `hunks.txt` → alert "work: Stage failed" / "Index is locked — another git process
     is running", Retry + Dismiss.
     - Retry from `other` → status toast "Retry cancelled" / "work is no longer the open tab"; the alert kept with
       Retry; `other` status and index unchanged.
     - Back in `work`, lock removed, Retry → "5 unstaged · 1 staged"; `diff --cached --stat`: `hunks.txt | 6 +++---`.
     - **Busy case** (lock back, Stage `src/a.txt`, lock removed, Fetch `slow` running, Retry): the stage was attempted
       and refused by the backend. The alert was replaced by "work: Stage failed" / "another operation is running" with
       Dismiss only (no Retry); no "Operation in progress" toast; nothing staged. Fetch cancelled after. Owner: fix
       (`6ddeb0d2`, walked as row A below).
   - **c.** `other` ahead (empty commit `5e2ebdc` pushed to `bare.git`); `work` ahead 1 (`9fed6a5`). `work` › Push →
     alert "work: Rejected: remote has new commits — Pull first", Pull + Dismiss; dock
     `! [rejected] main -> main (fetch first)`, `_err` "exit 1 · 0.1s".
     - Pull from `other` → no dialog (0 `[role=dialog]`), status "Pull cancelled" / "work is no longer the open tab",
       the alert kept.
     - Pull in `work` → the Pull dialog for `work` (title "T4 Git UI - work", Remote origin, "Runs git pull --progress
       --no-rebase --end-of-options origin main"); the alert closed; dialog cancelled; `work` still at `9fed6a5`.
3. **Diff header under 260 px** — pass. Inner 1400×800, three-column tier, History › "nested folders" (`6672873`) ›
   `examples/exclude/schema/tables.txt`, resized with "Resize file list".
   - 465 px: stats `display:flex`, separator `block`, the name wrapper already ellipsized (240 < 245).
   - 250 px: stats `none`, `[role=separator]` `none`, name span `title="examples/exclude/schema/tables.txt"`, wrapper
     ellipsis/overflow hidden, 64 / 245, screenshot "example…".
   - 275 px: stats `flex` ("+1"), separator `block`, wrapper 50 px ("examp…").
   - 200 px (the splitter's minimum): stats and separator `none`, wrapper 14 px, screenshot "e…" (the path span is
     inline, clientWidth 0; the numbers are its `_title` wrapper's).
   - Mode chip skipped (no mode change in the fixture).
   - Changes › `hunks.txt` at a 345 px diff panel: stats `flex` "+3−3", separator `block`, name not clipped (132/132).

End state of the first walk: console hook `[]` in both launches; app log `t4-git-ui.log.2026-10-31`, 112 lines, 0 WARN,
0 ERROR; the VM's checkout detached at `e64e5a2c`, clean; C: 6.7 GiB free.

## Second walk: the Retry and first-click fixes (`6ddeb0d2`, `8d66df27`)

`8d66df27`, fixtures `-Root C:/tmp/t4bw`, layout `work | other`. Counts exclude the status bar's `[role=status]`.

- **A. Retry during a fetch** — pass.
  - index.lock, Stage `src/a.txt` → 1 alert "work: Stage failed" / "Index is locked — another git process is running"
    [Retry, Dismiss].
  - Lock removed, Fetch `slow` running, Retry → the same alert kept with Retry; 1 status "Operation in progress" / "Wait
    for “git fetch --progress --prune --end-of-options slow” to finish"; no new alert; `diff --cached` empty.
  - Cancel → "Cancelled", dock "cancelled · 10.5s" `_muted`. Retry → 0 alerts, `src/a.txt` staged.
- **B. A first click during a fetch** — pass.
  - Fetch `slow` running, a fresh Stage click on `hunks.txt` → 0 alerts, 1 status with the same text, not staged.
  - Summary "walk commit during fetch", Commit at 13.3 s → 0 alerts, the same status, `git log -1` unchanged
    (`ce11147`), the summary kept. Cancel → "cancelled · 22.9s" `_muted`.
  - Commit → "Committed" / "faf5f57 walk commit during fetch", dock `_ok` "exit 0 · 0.1s", summary cleared.
- **C. Cross-repo** — not reachable as written; the two-window variant passes.
  - During Fetch `slow` in `work`, clicking `other` (twice) and Ctrl+Tab left the title "T4 Git UI - work" with the
    status "Operation in progress" / "Wait for it to finish before switching tabs" (`tabsStore.ts`
    `refusedWhileRunning("switching tabs")`, existing behaviour).
  - Two-window variant: `other` moved to its own window (Ctrl+Shift+N); with `work`'s fetch running, Stage `README.md`
    (made untracked from the shell) in `other`'s window → 0 alerts, 0 statuses, `other` `diff --cached`:
    `README.md | 1 +`; `work`'s fetch still running; Cancel → "cancelled · 12.6s" `_muted`.
- End state: console hook `[]` in both windows; quit with Ctrl+Q; log lines 130–201, 0 WARN / 0 ERROR; the checkout
  detached at `8d66df27`, clean.

## On the way

- The cancelled clone could not be reached on the first try: a local clone of `bare.git` finished in 0.2 s.
- The tab switch is refused while an op runs ("Wait for it to finish before switching tabs"); existing behaviour,
  recorded only.
- Row 2b's busy case lost the Retry; fixed in `6ddeb0d2`. The first click during a fetch was not seen on the walk; found
  in the Retry fix's change review, fixed in `8d66df27` and walked as row B.

## Rulings

The owner's decisions on the walks' findings, 2026-10-31.

- The cancelled clone's fixture built and walked → pass (row 1, addendum).
- The Retry lost during a fetch (row 2b, busy case) → fixed in `6ddeb0d2`, walked as row A.
- A first click during a fetch showing an error toast → fixed in `8d66df27`, walked as row B.
- The Retry guard's three gaps → accepted (`docs/plans/open-items.md` §Q): short libgit2 and rebase-todo mutations hold
  the lock without an ops record; a tab moved to another window mid-op; the op record whose exit event never arrives,
  which keeps refusing changes in that repository until the window reloads or 50 later ops push the record out.
- A tab switch refused while an op runs: existing behaviour, left as is (owner, 2026-10-31).
