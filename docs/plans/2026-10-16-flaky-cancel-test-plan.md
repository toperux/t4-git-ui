# Plan: the flaky macOS cancel test — measure, then fix

**Goal:** find out why `cli::runner::tests::cancel_ends_an_op_with_a_full_queue`
(`crates/git-core/src/cli/runner.rs:1282`) sometimes takes over 5 s on the macOS CI runner, then fix the test (or the
runner, if the numbers point there). Reopened from `open-items.md` §AM, the row *Two Rust tests failed once on macOS
CI*: it failed again on `main`'s CI for #32's merge (run 38893872747, 2026-10-16). Owner's ruling: measure, then fix.

## What's known

- **Failures:** 2 of 13 completed CI attempts since the test landed (`4e76d6c`, 2026-10-09), re-runs counted and
  cancelled runs not. They were #31's first run (38734513344, attempt 1) and `main`'s run for #32 (38893872747,
  attempt 1). Both on macOS, both "cancel took over 5 s: Elapsed(())" at `runner.rs:1305`, both inside the full suite
  ("running 215 tests", failing ~7 s in). It has never failed on Windows or Ubuntu.
- **The other §AM test:** `watch::tests::ignored_dir_and_lock_files_are_silent` failed once, on #32's first run
  (38734571211, attempt 1, `watch.rs:395`).
- **What the test does:** `git -c alias.y=!yes y` writes `y\n` forever. The callback sleeps 5 ms per call, so the
  output queue (`QUEUE_LINES`, 1024) fills and the pumps block. Cancel fires at 300 ms, and the run must end within
  5 s.
- **What the 5 s bound tells.** `DRAIN_CAP` (5 s) counts from git's reaped exit (`runner.rs:390, 401`).
  - If the group kill (`:600`) failed and the `start_kill` fallback (`:604`) killed git alone, `yes` would keep
    talking, and the cap would end the run at ~5.3 s. If both kills failed, git never exits and the run hangs.
  - A slow drain after a kill that worked is cut by the same cap, also at ~5.3 s.
  - So "ended under 5.3 s" means the kill worked, but "ended at ~5.3 s" is ambiguous. The count of lines delivered
    after cancel tells only one way:
    - over ~38 100 (the 37 888-line backlog plus a part batch) proves `yes` lived;
    - fewer proves nothing when callbacks are slow. A living `yes` under the cap delivers 5 s / (time per callback) ×
      200 lines: ~200 000 at 5 ms, but only ~40 000 at 25 ms, the very case under study.
    - Phase A therefore also checks directly whether `yes` is alive (below). A `pgrep` after `run` returns would miss
      it: once the pumps drop the read end, a surviving `yes` dies of SIGPIPE within milliseconds.
- **Where the time could go** (reasoned from the code, not measured):
  - After the SIGKILL, every pipe writer is dead, but the loop still delivers what was already buffered:
    - the queue, 1024 lines;
    - the segments the stdout pump holds from its last read (`runner.rs:482`), up to 8 KiB = 4096 lines;
    - the pipe buffer, up to 64 KiB on macOS = 32 768 lines.

    That is ~38 000 lines, ~190 batches of 200 (`BATCH_LINES`), and the callback runs once per batch
    (`Batch::flush`, `:217`). Then both pumps reach EOF, the channel closes and the loop ends (`:369`).
  - `DRAIN_GRACE` never fires during this: lines keep arriving, and its sleep is recreated each pass (`:396`).
  - A bare `#[tokio::test]` is single-threaded, so the callback's sleep blocks the whole loop.
  - Nominal: 0.3 s + ~190 × 5 ms ≈ 1.3 s. To pass 5 s, the drain must take over ~4.7 s: ~25 ms per callback. A
    small macOS VM running 214 other tests in parallel (`a_slow_emitter_loses_nothing` streams 200 000 lines) could
    oversleep that much.
  - **In the app:** the callback is `emit_to` (`src-tauri/src/commands/ops.rs:88-99`), which doesn't sleep. The
    runner plans for a slow emitter (`runner.rs:30-35`), and Cancel still pushes up to ~38 000 buffered lines through
    `emit_to` before the op ends, bounded by the cap. Likely harmless at real emit cost; unmeasured.

## Phase A — measure (throwaway branch, never merged)

1. **Branch `flaky-measure`** from `main`. Two temporary changes:
   - **The test, instrumented, in place.** The `timeout` goes to 20 s, so a slow run still returns and prints; on
     `Elapsed` (a hang) the line still prints from the shared counters, before the panic. The verdict is then
     asserted as `elapsed < 5 s`, the same as today. Counters live in `Arc`/atomics, since the callback moves into
     `run`. One line, with the unique prefix `CANCEL-TIMING`, records:
     - the elapsed time when cancel fires;
     - every callback's actual sleep (min/median/max), and the gaps between callbacks (time spent outside the sleeps,
       which is what would point at (iii)), each split before and after cancel: only the drain's numbers decide;
     - events and lines delivered after cancel;
     - the result of one `pgrep -fx yes`, run from the first callback ~0.5 s or more after cancel, while the drain
       still holds the pipe. `-fx` matches the whole command line, so it skips the other test's `yes 0123…`
       (`runner.rs:1114`). If no callback comes that late (the drain ended sooner), the record says "drain ended
       before 0.5 s, `pgrep` not run", which reads as killed: the pipe's EOF already proves `yes` died;
     - the time of the last Stdout batch, and `CliEvent::Exit`'s `elapsed_ms`;
     - the elapsed time when `run` returns.
   - **A workflow, `.github/workflows/flaky-measure.yml`:**
     - `on: push: branches: [flaky-measure]`, `macos-latest` only;
     - the toolchain pin and `Swatinem/rust-cache` as in `checks.yml`, with `save-if: false` so the throwaway branch
       stores no cache. Its key likely includes the job id, so the first build may be cold and take longer
       (unverified);
     - the full suite loop: `cargo test -p git-core --lib --locked -- --nocapture` 30 times, as CI runs it (~17 s
       each, ~9 min), so the 214 other tests contend as they do in CI;
     - a control loop: the cancel test alone, 10 times;
     - each iteration's result and its `CANCEL-TIMING` line are collected, and the loop counts failures with
       `|| true` rather than stopping (the default shell is `bash -e`).

     The full suite includes the watch test, so its failure rate comes for free.
2. **Push the branch — owner's go.** It runs one macOS job, ~12 min. `ci.yml` doesn't run (its `push` is `main`-only,
   and there is no PR), nor does `release.yml` (`v*` tags only).
3. **Read the numbers:** the failure rate in each loop, the sleep overshoot, the gaps, the lines after cancel and the
   drain time, and the `pgrep` result. At a best-guess rate of 2 in 13, 30 suite runs with no failure has ~1 % odds,
   but that rate is rough: at a true 5 %, 0 in 30 still comes ~21 % of the time. The timing of the passing runs says
   the most.
4. **Delete the branch — owner's go** (no PR backs it; the check-branch-before-delete rule). Its runs stay in the
   Actions history.

## Phase B — fix (shaped by Phase A, a plan update before any code)

The likely fixes, to choose from once the numbers are in:

- **(i) The callback sleeps 1 ms, or only until cancel fires.** The queue still fills, since `yes` outruns any
  callback. "Only until cancel" makes the drain near-instant whatever the runner does. 1 ms shrinks it to ~20 % only if
  the oversleep scales with the request; a fixed descheduling delay would barely shrink it. Reasoned: Phase A's
  overshoot numbers pick. Test-only.
- **(iv) Assert on the lines delivered after cancel** (bounded by queue + segments + the largest pipe, ~40 000)
  instead of only on wall time. Test-only. It **must pair with (i)'s "only until cancel"**: there a living `yes` would
  deliver millions of lines, so the bound is a real tell. With 5 ms sleeps under load, a living `yes` delivers about as
  few lines as the backlog, so the assertion could pass falsely.
- **(iii) A runner change**, only if Phase A shows time going outside the test's sleeps.

A multi-threaded runtime for the test isn't on the list: the callback still runs in `run`'s loop, so the drain takes
as long.

Phase B's fix gets the usual review loop and gates. It is verified by the same full-suite 30× macOS loop on the fix,
before any merge to `main`: mainly by margin, with the drain time well under 4.7 s and the time per callback well under
~25 ms in all 30 runs, not by 0 failures alone. Then `open-items.md` §AM's flaky row moves to `open-items-done.md` §AM,
or stays open for the watch test if Phase A shows it flaky.

## Not in this plan

- Any change to `DRAIN_CAP`, `DRAIN_GRACE` or the queue size: app behaviour, out of scope unless Phase A points
  there ((iii)).
- A fix for the watch test: Phase A only measures it; its own fix, if needed, is a new row.

## Review record

- **Pass 1:** 8 findings, all taken.
  - Run ids and test names were swapped: fixed here and in §AM.
  - There is no grace wait in the drain model.
  - The cap's mechanism made exact; lines after cancel as the tell.
  - The failing case made visible: a 20 s timeout, then assert.
  - Loop the full suite, as CI runs it, with an isolated control. This made D1 (loop the watch test?) moot.
  - Workflow details: `|| true`, `--locked`, rust-cache.
  - Option (ii) dropped; (iv) added.
  - "Not an app bug" softened.
- **Pass 2:** 5 findings, all taken.
  - The line count is a one-way tell; a direct `pgrep -fx yes` check was added during the drain.
  - (iv) must pair with "only until cancel".
  - (i)'s 1 ms shrink is reasoned, and Phase A picks.
  - The 1 % odds is a best guess, and Phase B is verified by margin.
  - §AM's row now names the second cancel failure and points here.
  - The rust-cache key and `save-if: false`.
  - The statistics are split before and after cancel.
- **Pass 3:** 3 small findings, all taken: two rewraps, the margin check's units, and a `pgrep` that wasn't run
  recorded as its own result.
- **Pass 4:** 1 minor finding, taken: the timing line also prints on a 20 s `Elapsed`.
- **Pass 5:** nothing found.
