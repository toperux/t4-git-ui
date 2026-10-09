# Plan: every git run ends its dock row and its readers, and the output queue is bounded, 2026-10-09

_Written 2026-10-09. Status: scope F1 + F2 from the review of Dependabot PR #26 (tokio 1.53.2), both ruled "fix" by
the owner 2026-10-09. D1 (no row for a failed spawn) and D2 (1024 lines) taken as recommended. Plan review pass 1:
2 blockers and 7 should-fix, all fixed here; its four questions taken as recommended (Q1 keep the cap and test it, Q2
name a missing repository folder, Q3 accept the reveal on a failed wait, Q4 cancel the final wait). Pass 2: 2
should-fix (the eof tail kept on `stop`; git is probed at startup) and nits, all fixed. Pass 3: clean but two nits,
fixed. Pass 4 clean. Go given 2026-10-09. Executed on `runner-exit-paths` (code `76dd6e9`); change review pass 1:
no code bugs, 1 should-fix and 4 nits — S1 (a test that didn't catch a missing stop check), N1 and N3 fixed
(`62cde86`), N2 accepted by the owner (under Q1 below), N4 informational, no change; pass 2: two wording nits, fixed
(`bcd0d05`); pass 3: two nits in this line, fixed; pass 4 clean. `b27c10c8` walked on Windows and Linux, both pass
(`docs/archive/walks/2026-10-09-runner-exit-paths-walk.md`). Triage ruled by the owner 2026-10-09: `open-items.md` §Q
(four accepted limits) and §AJ (one deferred), `open-items-done.md` §AJ (Q3, N4, the newline-less rescan)._

**Goal:** two weak spots in the git runner, found while checking whether the app can hit the bugs tokio 1.53.2 fixes.
Neither has been seen happen.

- **F1.** A git run that fails partway out never tells the Output dock it ended, and may leave its output readers
  running. The dock row keeps showing the command as running for the rest of the session.
- **F2.** The queue between git's output readers and the event emitter has no limit. If the emitter falls behind,
  the queued lines grow in memory without bound.

Branch: `runner-exit-paths`, on `main` (`026c59e`). Line numbers are as of `026c59e`. **Verified** means read in the
code; **inferred** means reasoned, not run. Research: the PR #26 review agent and plan review passes 1–3, their
claims re-read here.

## What's there today (verified)

- **The dock row ends only on an Exit event.** `GitCli::run` emits `Started` first
  (`crates/git-core/src/cli/runner.rs:301`), which adds a row with `running: true` (`src/store/opsStore.ts:85`). Only
  `exit` sets `running: false` (`opsStore.ts:97-98`); nothing else in `src/` does. `run` emits `Exit` once, at the end
  (`runner.rs:385`).
- **What a stuck row costs:** it shows as running for the session; `capTotal` never evicts a running row
  (`opsStore.ts:66`), so it holds its lines against the dock's total; and Cancel on it adds its id to `cancelled` for
  good (`opsStore.ts:128`). The dock's header recovers when the next op starts; the row doesn't.
- **The busy bar is not affected.** `runOp` clears `ops.busy` in a `finally` when the call returns, error or not
  (`opsStore.ts:269-271`), so the toolbar's activity bar and the status bar's spinner go away.
- **Three ways out of `run` skip `Exit`** — the only `?` exits after `Started`:
  1. `spawn(&mut cmd)?` (`runner.rs:312`). A missing git is `GitError::GitNotFound` (`:268`). git is probed at
     startup (`src/App.tsx:102`; a missing one puts up the blocking *git missing* screen, `:109-111`, `:245`) and
     when a path is set (`src-tauri/src/commands/app.rs`, `set_git_path`), so a missing git at spawn time means it
     went away after launch. A repository folder deleted while it is open also fails the spawn — see *The deleted
     folder* below.
  2. `status = Some(exited?)` (`runner.rs:360`): `child.wait()` returned an error. The pumps (`out_task`,
     `err_task`, `:328-335`) were spawned detached and `stop` (`:327`) is never cancelled, so they keep reading until
     whoever holds the pipes closes them. The child is dropped on return: `kill_on_drop` (`:238`) kills git itself,
     not its tree (`ProcessTree::kill`, `:524`, isn't called).
  3. `child.wait().await?` (`runner.rs:380`): the same failed wait after the loop. The loop only ends on
     `None => break` (`:345`), so both pumps have already returned here; what's left is git's tree.
- **The final wait ignores Cancel.** `runner.rs:380` awaits `child.wait()` alone: if git closed both pipes but keeps
  running, Cancel can't end the op (inferred; predates this plan).
- **The status scan has the same gap.** `run_git` in `crates/git-core/src/status.rs:373-374`:
  `exited = child.wait() => exited?` returns with `reader` (`:372`) still running and `stop` (`:370`) never
  cancelled. It emits no events, so no dock row; the cost is the reader task and git's tree.
- **How likely `wait()` fails:** tokio's `Child::wait` fails only if the OS wait call does; nothing in the app
  provokes that (inferred). The spawn failure (1) is the reachable one.
- **The deleted folder** (Windows measured with .NET's `Process.Start`; the rest read in Rust's std source, not run):
  - Windows: `CreateProcessW` fails with error 267 (`ERROR_DIRECTORY`), which std maps to `NotADirectory`, so
    `spawn` returns `GitError::Io`: the toast reads "The directory name is invalid. (os error 267)".
  - Linux and macOS: the child's `chdir` fails with `ENOENT`, std maps it to `NotFound`, and `spawn` (`:268`) turns
    that into `GitNotFound`: the toast reads "git executable not found". Wrong. The status scan's spawn
    (`status.rs:366`) goes through the same `spawn`.
- **The output queue.** `run` creates `mpsc::unbounded_channel()` (`runner.rs:324`); each pump reads 8 KB at a time
  (`:415`), splits it into lines and sends each (`drain`, `:449-492`, `tx.send`), never waiting. The loop receives
  them (`:343-346`) and hands batches of up to 200 lines or 50 ms (`BATCH_LINES`, `BATCH_AGE`, `:27`, `:29`) to
  `on_event`, which in the app is a synchronous `app.emit_to` (`src-tauri/src/commands/ops.rs:88-105`). What's kept
  for the caller is capped at 4 MB per stream (`MAX_RETAINED`, `:40`); the queue isn't. Whether `emit_to` is ever
  slower than git's output was not measured.
- **After git exits, the pipes are read for at most `DRAIN_CAP`** (5 s, `runner.rs:37`), and stop after
  `DRAIN_GRACE` (500 ms) of silence (`:35`): that ends a child of git that kept the pipes open. Its comment
  (`:30-34`) says what git itself wrote "is read within milliseconds".
- **`drain` and `pump` are called directly only by the runner's own tests** (`runner.rs:679-759`); every other
  `drain(` in the repository is `Vec::drain`.

## Changes

### F1 — every way out of `run` ends the row, and a failed wait stops the readers and the tree

**`crates/git-core/src/cli/runner.rs`, `GitCli::run`:**

- **The spawn failure (path 1), D1 a:** emit `Started` right after `ProcessTree::attach` (`:313`), not before the
  spawn. Not between spawn and attach: on Windows a process git starts before the job-object assignment escapes
  Cancel's tree kill, and `on_event` is a synchronous IPC call that would widen that window. A failed spawn leaves no
  dock row; the error reaches the user as the op's toast (`toastError`, `opsStore.ts:267`). No caller depends on
  `Started` coming before the spawn: the dock ignores events for an unknown op id (`opsStore.ts:89-90`), the clone
  dialog takes its op id from `started` and its Cancel stays disabled until then (`CloneDialog.tsx:91`), and the
  tests that check `events[0]` is `Started` (`runner.rs:803`, `tests/ops.rs:137`) still hold.
- **A failed wait (paths 2 and 3):** keep the wait's `Result` instead of `?`:
  - `status: Option<std::io::Result<ExitStatus>>`; the `child.wait()` arm stores `Some(exited)` whatever it is, so the
    arm's `if status.is_none()` guard stops it being polled again, and `exited_at` is set as today.
  - On an `Err`: `tree.kill(&mut child)` — git's state is unknown, so end it and its tree. The pipes then close, and
    the loop ends as after a normal exit: the `DRAIN_GRACE` arm (`:367`) and the `DRAIN_CAP` check (`:372`) run
    because `status` is `Some` and `exited_at` is set. A second kill (Cancel, then a failed wait, then
    `kill_on_drop`) is harmless: `start_kill`'s error is only logged (`:540-541`).
  - After the loop (Q4): `None => select!` (`biased;`, the wait first, so a git that exited as Cancel came reports
    its exit) of `child.wait()` against `cancel.cancelled()`, the latter guarded by `if !cancelled`; on Cancel,
    `tree.kill` then `child.wait()`, and `cancelled = true`. On a wait `Err`, `tree.kill`.
  - Then, as today: await the pumps, emit `Exit` — `code: -1` when the wait failed — and return
    `Err(GitError::Cancelled)` if cancelled, else the wait's error (`GitError::Io` via `?`), else `Ok`.
  - **Accepted (Q3):** `Exit` with `-1` opens the dock (`reveal`, `opsStore.ts:101`) beside the op's error toast.
    A failed wait is near-impossible; not worth a marker on the event.

**`crates/git-core/src/status.rs`, `run_git`:** on a wait `Err`: `tree.kill(&mut child)`, `stop.cancel()`, then return
the error. Mirrors the cancel arm beside it (`:375-379`), without its second `child.wait()`.

**`runner.rs`, `spawn` (Q2):** when `cmd.spawn()` fails with any error and the command's working directory
(`if let Some(dir) = cmd.as_std().get_current_dir()`) doesn't exist (`!dir.exists()`), return `GitError::Io` with
kind `NotFound` and the message `repository folder not found: <path>`, instead of `GitNotFound` or the OS's
"directory name is invalid". The check runs only after a failed spawn. `spawn`'s doc line (`:264`) names the new
case.

- **Callers (verified):** `spawn` and `git_command` are called only by `run` (`runner.rs:306`, `:312`) and the
  status scan (`status.rs:364`, `:366`), so both get it. `git_command` always sets the directory (`:224`): a
  repository's canonical absolute path (`repo.rs:45-48`), or a clone's parent folder, created just before the
  spawn (`ops.rs:1234-1235`, `:1259`), so the clone case can't reach the message in practice.
- `exists()` over `try_exists()` on purpose: a folder that can't be read is reported as not found, which is close
  enough, rather than falling back to the raw OS error.
- A git that is missing with the folder present stays `GitNotFound`. Nothing in `src-tauri` or `src` matches an
  `io` error of kind `NotFound`, so the new error changes no other behaviour (verified by the pass 2 review).

### F2 — a bounded queue

**`runner.rs`:**

- `mpsc::channel(QUEUE_LINES)` instead of `unbounded_channel()`, with a new constant `QUEUE_LINES = 1024` (D2) and a
  doc comment: five 200-line batches of slack; counted in lines, as a line is as long as git makes it.
- `drain` stays synchronous and returns the segments it cut (`Vec<(Kind, String)>`) instead of sending them.
- `pump` sends them one by one with `tx.send(seg).await`, checking `stop.is_cancelled()` before each send inside
  the read loop: once `stop` is set, the rest of that read's segments are dropped and the loop ends. (Today a read's
  segments are all queued at once, so none are dropped; the difference is at most one read's worth, after `stop`,
  of output that belongs to whoever kept the pipe.) A send that fails (the receiver is gone) ends the loop too.
- The final `drain(eof)` is always sent, as today (`runner.rs:433`), checking only that the receiver is still there:
  it is at most one unterminated line or trailing `\r` segment, and its send can't block for good, as the loop
  receives until every sender is dropped and this pump still holds its own.
- A full queue holds the pump, which stops reading its pipe; git then blocks on its write: backpressure.

**Why no deadlock** (verified in code unless marked):

- The loop's `rx.recv()` arm has no guard, so the `select!` always has an enabled branch, and the loop is never
  blocked except inside `on_event`: a held send always makes progress.
- `run` returns only after both pumps have dropped their senders.
- tokio's bounded channel serves waiting senders in order, so neither pump starves the other.
- On Cancel: the tree is killed, the held sends complete as the loop receives, then the pumps read EOF.
- After `stop`: a pump held on a send finishes that send, sees `stop`, sends its eof tail and ends.

**What backpressure changes (Q1, inferred, not measured):**

- git now runs only as fast as the emitter takes its output. A huge typed `git log -p` holds the repository's op lock
  that much longer.
- `DRAIN_CAP` can now cut git's *own* last output, not only a child's: git's leftovers wait in the pipe for queue
  space, and if the emitter took more than 5 s to take about one pipe buffer, one read and 1024 queued lines per
  stream, the cap would end the reading and the tail would be missing from the dock and from `CliOutput`. With
  80-byte lines and a 64 KB pipe that is under ~400 lines a second; with short lines like `y` it is ~7 000. Kept as
  is (Q1 a); the slow-emitter test below shows a wide margin at a realistic rate. Accepted with it (change review
  N2): such a cut leaves `stdout_truncated` false, though `CliOutput`'s text then lacks the rest; and the dock gets
  the cut read's unterminated fragment as its last line, out of context. The comment at
  `runner.rs:30-34` is corrected to say git's own output is read within milliseconds *unless the emitter holds it*.
- Memory is bounded in lines, not bytes: output with no `\n` still grows the pump's `pending` buffer, and `drain`
  still rescans it on each read (O(n²)), as today.

**Status scan:** no change for F2 — `read_both` has no queue (`status.rs:402-427`).

## Tests

**Existing runner tests that change** (`runner.rs`):

- `drain_splits_lines_and_progress` (`:679-700`): asserts on `drain`'s returned segments instead of a channel.
- `pump_retains_only_the_tail_but_streams_every_line` (`:718-746`): `mpsc::channel(QUEUE_LINES)`; its 100 lines fit,
  so awaiting `pump` before receiving still works.
- `a_tail_that_cuts_a_character_in_half_drops_its_leftover_bytes` (`:748-759`): `mpsc::channel(QUEUE_LINES)`.
- Every other runner test (output, progress, cancel, truncation, `DRAIN_GRACE`) is unchanged and must pass.

**New tests:**

- **No row for a failed spawn:** `run` in an existing directory (a `TempRepo`, so Q2's check doesn't apply) with a
  git path that doesn't exist returns `GitNotFound` and emits no events.
- **A missing folder is named:** `run` in a directory that doesn't exist returns `GitError::Io` whose message is
  `repository folder not found: <path>`, on every OS (CI runs all three).
- **A full queue holds the pump:** `pump` on a `tokio::io::duplex` written past its buffer, with a channel of
  capacity 1 whose receiver is kept alive (`_rx`, not `_`) and never read: the writer's `write_all` is still pending
  after 200 ms.
- **`stop` while held:** the same setup, then `stop.cancel()`, then receive until the pump's handle completes,
  within 2 s: the pump ends.
- **A slow receiver loses nothing:** `pump` with 100 000 lines through a capacity-16 queue, the receiver sleeping
  1 ms every 1000 lines: every line arrives, in order.
- **A slow emitter loses nothing (Q1):** `run` of an alias `!seq 1 200000` (as the tests at `:1027` do) with an
  `on_event` that sleeps 1 ms per batch (a stand-in for a slow `emit_to`): every line is streamed, and `stdout` ends
  with `200000`. After git exits about 60 batches are left, ~60 ms against `DRAIN_CAP`'s 5 s: a margin of ~80×, not
  a proof that no rate is cut.
- **Cancel with a full queue:** `run` of an alias `!yes`, an `on_event` that sleeps 5 ms per batch, Cancel after
  300 ms: `run` returns `Cancelled` within 5 s. (`cancel_kills_long_running_process` runs `git daemon`, which prints
  nothing, so it never holds a send.)
- **Not testable without fault injection:** a failed `child.wait()` (paths 2 and 3, and `run_git`), and Q4's cancel
  of the final wait (git would have to close both pipes and keep running). Covered by code review only.

**Gates:** `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, on
Windows; CI on all three OS before any merge.

## Walk

No new smoke group: a failed wait can't be provoked. One check on Windows and one on Linux, as a walk record, not
smoke rows:

1. Make a scratch repository with `git init` and one commit (no packfiles, which libgit2 may keep open), and open it.
2. Delete its folder from a terminal (`Remove-Item -Recurse -Force <path>` on Windows, `rm -rf <path>` on Linux) —
   Explorer may refuse while the app holds files open — and check the folder is gone.
3. The repository menu → Run command (Ctrl+Shift+R) → `status`.
4. The toast reads "… repository folder not found: <path>", and the Output dock has no row left running.

The watcher may react to the deletion first; whatever it shows is recorded, not judged here. On Windows a folder
the watcher still holds may stay "delete pending" (inferred): `CreateProcess` then fails with access denied, not
error 267; the `exists()` check names the folder either way. If the message doesn't appear, record the raw error.

## Out of scope

- Whatever queues inside Tauri's `emit_to` or the webview's event delivery: not ours to bound.
- The stdin writer task (`runner.rs:317-321`): it ends when git closes stdin or exits.
- On Unix, `tree.kill` after a failed wait sends `SIGKILL` to git's process group id; if that group were already
  gone and its id reused, another group could be hit (inferred). The Cancel arm has the same exposure today.
- On Windows, `job.terminate()` ignores `TerminateJobObject`'s result (`runner.rs:589`), and `ProcessTree::kill`
  then skips the `start_kill` fallback (`:526-528`): if a terminate ever failed, the wait after a Cancel (in the loop
  today, and Q4's) would hang (inferred, predates this plan). Goes to the owner's triage list.
