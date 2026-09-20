# Follow-ups from the 2026-09-21 walks — plan

Five small items left by the two walks of group BD. Two fixes, three cleanups. Base: `main` at
`c22bc3c` plus this plan's own docs commits (count with `git rev-list --count origin/main..main`),
nothing pushed. Not started — waits for a go. Reviewed 2026-09-21, amendments at the end.

Execution: Tasks 1, 3, 4 are one-file edits of a few lines — the main session makes them. Task 2 is a
`coder` (three files, a type change, tests). One commit per task on `main`, never pushed. Order: Task 2's `coder` starts first, in the background;
Task 1 (TypeScript only — no cargo lock to fight over) runs beside it; Tasks 3 and 4 wait for the coder
to hand back, since they share its working tree and cargo's target lock. Every commit stages its own
paths by name. Each task's own test runs before its commit; the full gates after
the last code task: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets --locked -- -D
warnings`, `cargo test --workspace --locked`, `npm test -- --run`, `npm run build` (npm from `F:/`).

## Decisions (made 2026-09-21)

| # | Question | Decision |
|---|---|---|
| D1 | The watcher in the 50 ms after an operation | **A** — drop by declared kind (table below) |
| D2 | History on a file row from the Changes view | **Switch to the History view** (not: stay and toast; not: leave) |
| D4 | History / Blame on a row inside a dialog (commit dialog, diff window, stashes) | **(b) the item closes the dialog too** — in `showHistory` / `blameAt` themselves, not per menu |
| D3 | How the fixes land | **New commits**, one per task; no fold into the originals, no cited hash moves |


**D1. The watcher gap was ruled "won't fix" once.** Review pass 2, row Q12
(`docs/archive/plans/2026-09-12-consolidated-findings.md:509`): *"50 ms grace also drops a real
external write in that window — wont, accept; autosave in that exact window is rare and the next
event catches up."* What changed since: `bb27c36` (F8) ends an operation while a hook's backgrounded
child may still be writing, so "nothing writes right after an op" is no longer true for commits with
hooks. The first BD walk hit the gap for real (status `Clean` for over a minute).

| Option | What | Cost | Ceiling |
|---|---|---|---|
| **A (recommended)** | Inside the grace, drop only events of a kind the op declared (`mutate`'s `kinds`); other kinds pass | No extra status scan. ~30 lines, `watch.rs` + two call sites | A foreign write *of a declared kind* within 50 ms is still lost — all of it for `ALL_KINDS` ops (pull, merge, checkout). Commit declares `Index`+`Refs`, staging `Index`: a working-tree write after either is caught, which is the hook case |
| B | One more synthetic `repo://changed` a grace after every op | A second full status scan per op — what P1-10 (`4190d9d`) removed; staging on a big repo pays it on every click | None |
| C | Leave Q12 standing | Nothing | The walk finding stays |

Task 2 below is written for **A**.

## Task 1 — History from a file row shows the history

**Defect.** `showHistory` (`src/screens/RepoWindow/actions.ts:191`) sets the path filter and nothing
else. From the Changes view the window stays on Changes, so the click appears to do nothing; the
filtered grid is only there after pressing History. A regression of Direction B (`72887c3`): smoke
row "Entry from the commit panel" (`smoke-test-post-v1.md:1357`) was walked when the commit panel
still sat inside the History layout. Three callers, all through `showHistory`: `FileRowMenu.tsx:92`,
`FileContextMenu.tsx:150`, `FileContent.tsx:317` — the first and third are already on History, where
`setView("history")` is a no-op.

**Same shape, by code, not yet seen in the app: `blameAt` (`actions.ts:177`).** It sets the details
pane's Files tab, the path and the blame switch — all of it in the History layout — and never opens
that view, so **Blame** on a Changes row should look just as dead. Step 0 settles it.

**Not fixed by a view switch: the same two items inside a modal** — the commit dialog
(`dialogs/CommitDialog.tsx` renders the same panel and row menu) and the diff window. The view
changes behind the dialog, which stays on top. **D4 = (b):** both functions also call
`useDialogStore.getState().close()` (`actions.ts` imports the store already; one dialog is open at a
time, and a click on these items can only come from inside it, so closing "the" dialog is closing the
right one; with none open it is a no-op). Every caller routes through the two functions, so no menu
and no dialog is touched — one file, not the three the first draft of D4 guessed. The diff window
(`DiffDialog.tsx`) hosts `ChangedFileList`, whose row menu has both items; the commit dialog hosts the
panel's `FileContextMenu`. The commit draft lives in `commitStore`, not in the dialog.

0. On the current build: Changes › right-click a file › **Blame**. Dead like History → it is in this
   task; works → strike the Blame half here and say why.
1. `actions.test.ts` (`startLog` replaced on the store the way the file already replaces `openTab`):
   from `view: "changes"`, `showHistory("a.txt")` → `useViewStore` reads
   `history`, and `startLog` was called with `path: "a.txt"`. → verify: fails first.
2. `showHistory`: `useViewStore.getState().setView("history")` after the `startLog` call
   (`useViewStore` is already imported — `openCommitPanel` uses it). → verify: the test passes.
   The same line and the same test for `blameAt`, if step 0 says so.
   And for D4: with `dialogStore.dialog` set to `{ kind: "commit" }`, either call leaves it `null`
   — test first, then the `close()` line in each.
3. Smoke doc: a BD row 17 — *Changes › right-click an unstaged file › History → the History view,
   chip `History: <name>`, row 0 selected; the chip's × restores the full walk; **Blame** from the same
   menu → the History view, Files tab, the file blamed. **Commit…** (repository menu) with a summary
   typed › right-click a row › History → the dialog closes onto the filtered grid; **Commit…** again →
   the summary is still there. A commit's diff window (the expand button) › a file row › Blame → the
   window closes, the file is blamed.* Walked in Task 5. The old row at `:1357`
   ("Entry from the commit panel") gets one line pointing here: it describes the layout before
   Direction B.

Commit: `fix: History on a file in the Changes view opens the History view — it set the filter and stayed put`

## Task 2 — The watcher keeps a foreign write made right after an operation (option A)

`crates/git-core/src/watch.rs`, `src-tauri/src/state.rs:174`, `src-tauri/src/commands/stage.rs:88-90`
(`suppressed`, the only un-suppress site; `state.rs:234` is a test).

1. Tests first, in `watch.rs` beside `suppressed_drops_events_and_stop_is_clean`:
   - un-suppress declaring `[Index]`, write a working-tree file at once → a change with `Workdir`
     arrives;
   - un-suppress declaring `[Workdir]`, write a working-tree file at once → nothing arrives (today's
     behaviour, kept);
   - a working-tree write made *while* suppressed, then **100 ms or more**, then un-suppress declaring
     `[Index]` → nothing arrives: the op's synthetic refresh covers it, and passing it would bring
     back the second scan. The pause is the point — an event stamped late is exactly what the grace
     exists for, and without it this test fails whenever the watch thread lags.
   → verify: the first fails on today's code, the other two pass. (The first can pass for the wrong
   reason when the stamp lags past 50 ms; nothing to do about that, and it cannot fail for it.)
2. `Suppress::Until(Instant)` → `Until { ended: Instant, kinds: Vec<ChangeKind> }` (the enum stops
   being `Copy`; the handler clones it out of the lock). `set_suppressed(on)` → `set_suppressed(on,
   kinds: &[ChangeKind])`, `kinds` ignored when `on`.
3. Handler: `time < ended` → drop, as now. `ended <= time < ended + SUPPRESS_GRACE` → classify each
   path and drop it only when its kind is in `kinds`. Later → keep, as now. A `need_rescan` event
   has no path and so no kind: before `ended` it is dropped as now, inside the grace it **passes** —
   rare, and the refresh it costs is the safe side.
4. `AppState::set_watcher_suppressed(id, on, kinds)`; `suppressed` passes `&[]` going in and its
   `kinds` coming out. The other callers of the old signature are tests (`state.rs:234`, the
   `watch.rs` ones) — they follow.
5. Rewrite the `SUPPRESS_GRACE` and `Suppress::Until` doc comments: what is dropped, and the ceiling
   (a declared-kind write inside the grace) with Q12's number.
   → verify: `cargo test -p git-core watch` green, then the full gates.

Known cost, accepted: an operation whose declared kinds understate what it writes (Discard declares
`Workdir`, and libgit2's checkout may refresh the index too) gets its occasional late-stamped event
through — one extra status scan, never a lost one. No audit of the six `kinds` lists in this plan.
Checked and fine: the status scan's own index write-back lands after the grace on any real repository
and is self-limiting (the second scan finds the stat cache clean), today and under A alike.

Commit: `fix: A file written the moment an operation ends shows up — the watcher dropped everything for 50 ms, now only what the operation itself writes`

## Task 3 — F8's silent-child test sleeps 12 s, not 20

`crates/git-core/src/cli/runner.rs:858`: `sleep 20` → `sleep 12`. The assert bound is 10 s
(`:868`), so 12 still proves the op did not wait for the child; the test's wall time follows the
sleep (tokio's blocking pipe read outlives the op), so this gives 8 s back per Windows `cargo test`.
→ verify: `cargo test -p git-core a_background_child_holding` passes; note the wall time.
Docs in the same commit: `open-items.md` §I (`:395`, "~20 s" / `sleep 20`) and §N row 5 struck through.

Commit: `test: The backgrounded-child test sleeps 12 s — 8 s off every Windows test run`

## Task 4 — `refuse_while_busy` has a test

`src-tauri/src/commands/update.rs`, in `mod tests`: `AppState::default()` → `Ok`; after
`begin_op()` → `Err` whose text names a running operation; after `end_op(&id)` → `Ok` again.
This covers the helper, not that `install_update` calls it (twice, `:93` and `:133`) — that needs an
`AppHandle` and stays with BD 10, which needs a published update.
→ verify: `cargo test -p t4-git-ui refuse` passes; breaking the `op_running()` check makes it fail.

Commit: `test: Install's running-operation refusal, on the helper`

## Task 5 — Walk, docs, graph

1. App closed by the user; store folder backed up, restored and `cmp`'d as before. `tauri build
   --no-bundle`, `smoke-launch.ps1`, fixture `c:/tmp/t4/be` (`bd2-fixture.sh`).
2. **BD 17** (Task 1) as written above.
3. **BD 18** (Task 2): the first walk's repro — a file written by the driver the moment the Commit
   button stops reading `Committing…` → the Changes badge shows it without Refresh. **Run it on the
   current build first**: it has to fail there (status `Clean`), or the row proves nothing. No hook
   variant: a hook's child that holds the pipe keeps the op open for `DRAIN_GRACE` (500 ms) after
   git exits, so its early writes land *inside* the op and the post-op refresh already covers them;
   hitting the 50 ms after that from a shell `sleep` is a lottery.
   If option A's ceiling bites here (it should not: commit declares `Index`+`Refs`), say so plainly.
4. Docs: tick the rows; `open-items.md` §N — row 4 (watcher) rewritten to what is left of it, rows 5
   and 6 struck, the History finding recorded as found-and-fixed; a line in the second walk's record
   or a short third one. One `docs:` commit.
5. `graphify update .` last, after every source edit (`graphify-out/` is git-ignored — nothing to
   commit). → verify: exits 0.
6. Memory: `review-2026-09-20-plan`, `smoke-test-status`, the `MEMORY.md` count from
   `git rev-list --count origin/main..main`.

## Not in this plan

- The stale staged-diff body (`open-items.md` §N row 7) — no data at risk, left for later.
- The push, the release, BD 10 and the update-restart walk — the user's call / need a published update.
- Linux and macOS gates — CI runs them on the push.

## Review of this plan, 2026-09-21

Read against the code before any of it ran. Changed above: Task 1 widened to `blameAt` (same missing
view switch, by code) with a step 0 that checks it in the app, and the modal case named and put to
D4; Task 2's rescan rule made definite, its third test given the pause that keeps it from flaking,
its known cost written down; BD 18's hook example dropped — it does not reach the gap — and the
repro run red on the current build first; the order of work and who holds cargo's lock said out
loud. Checked, no change needed: the `actions.test.ts` harness fits Task 1; Task 3's margin (12 s
sleep, 10 s bound); Task 4's `begin_op` / `end_op` / `AppState::default()` exist; `graphify` 0.9.49
is on PATH.

**D4 — decided 2026-09-21: (b)**, see the table and Task 1. As first put: History / Blame on a file row *inside the commit dialog or the diff window*: (a) leave
for now and record it in `open-items.md` — this plan fixes the Changes view only; (b) the item also
closes the dialog (the commit draft lives in the store and survives); needs the dialog's close handed
down to the row menu, two more files.

## Execution notes, 2026-09-21

- **Step 0: Blame from a Changes row is dead too** — seen on the build of `1adbeff`; it is in Task 1.
- **D4 narrowed while writing it.** A diff window is bound to the same store as the details pane, so
  **Blame already works inside it**: the window turns into the blamed file, and a click on a blame hunk
  drills down in place. Closing it from `blameAt` would have broken that. So: **History** closes
  whatever dialog it was clicked in (the grid is behind all of them); **Blame** closes the commit dialog
  only. Both open the History view. No shared helper — the two differ.
- **BD 18 was red first**, as the plan asked: on the build of `1adbeff` a file written the moment
  Commit returned was on disk and not in the list.
- **Done 2026-09-21**: Task 1 `42ecbbc`, Task 2 `c3e1120`, Task 3 `abdffe8`, Task 4 `53d7ac7`; gates green
  (cargo fmt / clippy / test, vitest 928, `vite build`); BD 17 and 18 walked on a build of `53d7ac7`.
  Task 4's "break the check and see it fail" was not run — the test unwraps the `Err`, so it fails by
  construction. This file moved to `docs/archive/plans/` with the closing docs commit.
