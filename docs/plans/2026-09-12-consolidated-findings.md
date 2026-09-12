# Consolidated findings — full codebase review, 2026-09-12

Supersedes the "Fix before push" list in `2026-09-12-review-findings.md` (kept for its R1–R13
analysis; R-ids below refer to it). Everything here is one list, ordered by what to fix first.

**How.** Six read-only reviewers in parallel, one per area, each told to ignore existing review
files: git-core core (A), git-core cli+log (B), Tauri commands (C), stores/api/lib (D), RepoWindow
screens (E), dialogs/start/settings/ui (F). Plus a second diff-only pass over `origin/main..main`
(X). Every high/med finding was re-traced by hand in the code before it was written down; verdicts
below are mine, not the reviewers'. *CONFIRMED* = whole path traced. *PLAUSIBLE* = mechanism
confirmed, a step still needs an experiment (named).

**Numbers.** 65 fresh findings (A6 B8 C8 D13 E11 F9 X10) plus the 13 existing R-items → **61
checklist items** below (four cluster entries bundle 16 of the inputs; 6 were exact duplicates):
**8 P0, 19 P1, 34 P2**. R12/R13 stay recorded-only.

**Caveat on the diff pass (X).** That reviewer inherited this session's context, which already
summarised R1–R7, so its re-finding R1/R3/R8 is not independent confirmation. The six area
reviewers were blind; notably the stores reviewer (D) did *not* find R1 — it checked that every
consumer applies `freshStatus` and stopped there. R1 stands on my own trace, not on any reviewer.

---

## Triage table

One row per checklist item. **Decision** filled 2026-09-12, walked together row by row. Details for
every row are in the sections below, keyed by the same id.

| # | Id | Sev | Verdict | Area | One line | Decision |
|---|---|---|---|---|---|---|
| P0-1 | B1 | high | CONFIRMED | git-core cli | Ref names starting `--` reach git as options; `rebase --exec=` runs a command | done `1da3113` — both: refuse leading `-` at the boundary AND `--end-of-options` in every builder; typed commands out of scope; bump git floor 2.20→2.24 |
| P0-2 | C1=A3 | high | CONFIRMED mech | tauri/git-core | Status scan under `git2` only; CLI stage/commit under `op_lock` only → stale index written back | done `c953e91` — new `scan_lock` (tokio) on RepoHandle. **Order matters:** `mutate` takes `op_lock.try_lock()` FIRST (still `Busy` during another op), THEN `scan_lock.lock().await` (waits ≤ one scan), holds both for the op. `get_status`: `scan_lock.try_lock()` → Ok = writing scan holding it; Err = scan with `update_index(false)`. Scans never take `op_lock`; no deadlock. Test the protocol, no clobber repro; fix the `diff.rs:87` comment |
| P0-3 | E1 | high | CONFIRMED | commit panel | During a diff load the body shows file A, buttons act on file B | done `ff46e63` — store: `loadDiff` clears `diff` when path or list changes (same-path reloads keep it); fold E5 in (add `diffList` to the `unchanged` check + viewer effect key); accept a blank body during the round trip |
| P0-4 | A1 | med | CONFIRMED | git-core | Discard on a workdir rename deletes the new file, never restores the old | done `4bd209d` — discard = undo the rename; frontend sends both halves (`oldPath` added to the IPC payload for `workdir === "renamed"` entries, **after** the confirm — `discard()` counts `paths.length` for its prompt), Rust unchanged; pin with one Rust test (two-path call restores) + one frontend payload test; leave the dead `WT_RENAMED` arm with a comment |
| P0-5 | A4 | med | CONFIRMED | git-core | Partial discard of a renamed file renames it back | done `ff0ed6b` — header guarded on `!reverse`. **Discard half turned out unreachable**: `file_diff(Unstaged)` (diff.rs:234, `find.renames` without `for_untracked`) reports a workdir rename as `Untracked`, never `Renamed`, so the rename arm can't fire on discard. Unstage half real, tested. New low finding **N1**: status row says Renamed (status.rs:105) while the diff for the same path says Untracked — the UI enables hunk discard on that row and `git apply -R` of a partial new-file patch fails with a git error (safe, but a dead action) |
| P0-6 | A2 | med | CONFIRMED | git-core | `unstage_paths` has no rollback on a locked index | done `deba502` — on `reset_default` error, `index.read(true)` (two lines, same guarantee as `with_index`); automated test mirrors `a_locked_index_leaves_the_path_unstaged` |
| P0-7 | E3 | med | CONFIRMED | sidebar | Stash Drop has no confirmation | done `9b02c28` — native `ask()` in `actions.stashDrop` naming `stash@{n}` + message, "cannot be undone"; Pop untouched; Sidebar test: not called until accepted |
| P0-8 | R1 | high | CONFIRMED | stores | Opening a dirty repo leaves the walk unseeded (regression, unpushed) | done `20f0a50` — `syncWalkSeed()` in the subscription's refs branch; test opens with `refs: null`; restores the known second walk |
| P1-1 | F2 | med | CONFIRMED | dialogs | Merge/Rebase/Create-branch keep a ref the refresh removed; button still armed | done `453d3d5` — vanished ref = no selection: `valid = options.some(...)`, button disabled; `Select` has no placeholder prop today — render the stale name greyed with "(no longer exists)" rather than adding one; inline at all three sites, no hook; test: refs replaced without the ref → disabled |
| P1-2 | D2 | med | CONFIRMED | stores | `revealOid` applies an index from a superseded walk | done `b31cac5` — re-check repo+generation after `fetchPage`; on change retry once against the new generation, then `false`; test with a walk restart mid-fetch |
| P1-3 | D1 | med | CONFIRMED | theme | Theme token cache stale after the grid unmounts | done `fbb4c8c` — `cache = null` beside `observer.disconnect()`; mount/unmount/flip/remount test |
| P1-4 | E2 | med | CONFIRMED | details pane | `CommitDetails` never clears error/detail on a new oid | done `6a95389` — clear both at the top of the effect (blank during the round trip); reject-then-resolve test |
| P1-5 | F1 | med | CONFIRMED | ui/Select | Select closes when its own listbox scrolls | done `e1f69f9` — copy CommandInput's `list.contains(e.target)` guard; 40-option scroll test |
| P1-6 | X3+X4+F6+R8 | med | CONFIRMED | ui/Select + rebase dialog | Select keyboard cluster: disabled options, Alt+↑ commits hover, chord stolen from open list | done `909a22f` — `move()` + `onMouseMove` skip disabled; Alt+↑ keeps commit-active semantics; dialog capture guard yields when `e.target.closest('[role=combobox]')` is `aria-expanded=true`; 3 new tests |
| P1-7 | X7+X6+R11 | low | CONFIRMED | commit panel | DisabledHint surfaces titles written for the enabled state (~9 sites) + "(N skipped)" on a full refusal | done `79431aa` — rule: disabled title = why it is dead or absent; sites: MessageColumn:183, DiffViewer:276/283/369, FilesColumn:103, FileContextMenu:80 + FilesColumn:445; IconButton: `DisabledHint` gets only the explicit `title` (the enabled `title={tip}` fallback stays); fold X10: one `stageTarget(entries, paths) → {target, skipped, note}` helper |
| P1-8 | X8+R10 | low | CONFIRMED | commit panel | Selected-mode rules: dead header after partial stage / silent promotion to whole list | done `84fdc82` — X8: a header "… selected" action resets the selection to a single seed on completion; R10 = wont (recorded); correct smoke-test-post-v1.md:772 |
| P1-9 | R3 (+R2) | med | CONFIRMED mech | ui/DisabledHint | Wrapper cancels the control's flex sizing; R2 header floor needs a 220px measurement | done `d64e3fa` + R2 `3834aed` (floor dropped: 220px measurement 15/56 vs 56/56) — drop `min-width: 0` from `.wrap` (item min-width auto = control's own box); audit wrapped growers, per-caller class only if one exists. R2: measure title rect at 220px with/without the floor on a real build; rule: floor truncates the title and no-floor doesn't → drop the floor, accept the jog; else keep |
| P1-10 | C2 | med | CONFIRMED | tauri | Every mutation triggers a second full status scan (suppression lifted before the debounce flushes) | done `4190d9d` — time-stamped: record `last_unsuppress` at op end, handler drops events with `time < last_unsuppress + ~50ms` (or while suppressed); no timer; two watch tests (own write dropped, external write 200ms later kept) |
| P1-11 | D4 (+D8) | med | CONFIRMED | stores | `same()` / `sameRefs` / `entriesKey` JSON-stringify whole payloads per event | done `31d7e62` — one generic `eqDeep` in src/lib (exact, recursive, early exit, no allocation) at all three sites; `entriesKey` built from the four entry fields; unit test + stringify spy |
| P1-12 | B2 (+D9) | med | CONFIRMED | cli runner + opsStore | Streamed CLI output retained and emitted per line without bound; O(n²) on the frontend | done `d057c90` — cap retained buffer to a ~4 MB tail + `truncated` flag; Rust batches lines (~50 ms / 200 lines) into one `op://event` with `lines: string[]`, frontend one `set` per batch; stop streaming after MAX_LINES with a truncation marker; runner + opsStore tests |
| P1-13 | D3 | med | PLAUSIBLE | stores | Walk error emitted before `start_log` returns is dropped | done `a890a79` — `get_log_page` returns `error` from the cache; `fetchPage` applies it beside total/complete; store test with progress-before-resolve |
| P1-14 | E5 | low | PLAUSIBLE | diff viewer | Unstaged→staged selection-carry guard can never fire | done `ff46e63` — folded into P0-3 |
| P1-15 | F9 | low | CONFIRMED | dialogs | Delete remote branch sends the bare short name (tag dialogs send a full ref) | done `98f337d` — `refs/heads/${name}` + preview; payload test |
| P1-16 | C7 | low | CONFIRMED | tauri/stores | "repo not open" is `internal`; frontend uses `internal` as "stay quiet" | done `b00a15c` — new `AppError::NotOpen` → `"notOpen"`; the two frontend sites suppress on it, `internal` toasts again; state test + statusStore toast test |
| P1-17 | C6 | low | CONFIRMED | tauri | `close_repo` never cancels the repo's in-flight ops | done `44f9e38` (wont, comment) — unreachable: `refusedWhileRunning()` blocks close/switch in the UI (actions.ts:140-175); add a comment on `close_repo` naming that invariant |
| P1-18 | F4 | low | CONFIRMED | ui/Menu | ContextMenu never closes on scroll/resize | done `f6eb328` — same resize + capture-scroll → onClose effect as Select (with the inside guard); scroll test |
| P1-19 | F8 | low | CONFIRMED | start screen | Ctrl+O etc. ignore `busy`; picked folder dropped silently | done `889c39c` — `|| busy` in the key handler; Ctrl+O-while-busy test |
| P2 | C3=A5 | low | CONFIRMED | tools | `open_diff_tool` joins the caller path unchecked |done `26801af` — `repo_relative` check like `open_path`; refusal test |
| P2 | C4 | low | CONFIRMED | capabilities | `opener:default` grants unscoped reveal-item-in-dir |done `c2bf5d1` — capability: only `allow-open-url` + `allow-default-urls` |
| P2 | C5 | low | PLAUSIBLE | tauri | Clone URL positional, no `--`, no scheme check |done `1da3113` — folded into P0-1 (separator only; no scheme allowlist) |
| P2 | A6 | low | PLAUSIBLE | tools | Unix temp dirs 0755 + predictable; symlink survives cleanup |done `74dcde2` — 0700 on unix, refuse non-dir/symlink at the path |
| P2 | B3 | low | PLAUSIBLE | cli rebase | Read pass runs `--autostash`; a kill strands work |wont — git's clean-tree check precedes the editor, so the read pass needs it; Rebase banner offers --abort |
| P2 | B4 | low | CONFIRMED | cli ops | `conflict_path` truncates at first space / strips trailing dots |done `235f21f` — parse before ` deleted in `/` added in `, trim one period; test row |
| P2 | B5 | low | PLAUSIBLE | cli rebase | `exec git commit --amend` ignores configured `git_path` |done `0967497` — emit the configured git_path, quoted via check_shell_path |
| P2 | B6 | low | CONFIRMED | cli runner | `drain` at EOF leaves the tail in `pending` (latent) |done `55d375c` — clear pending on eof; extend existing test |
| P2 | B7 | low | CONFIRMED | log graph | Repeated parent oid → duplicate Branch line |done `659f51c` — skip a parent already in `out`; unit test |
| P2 | B8 | low | CONFIRMED | log types | `LogFilter.author/path` deserialized and ignored |done `1a596db` — delete both fields (Rust + types.ts) |
| P2 | C8=D13 | low | CONFIRMED | tauri | `get_commit_files` (and `ping`) have no caller; README stale |done `d820b93` — delete both commands + registrations; fix README line |
| P2 | F3 | med | CONFIRMED | dialogs/a11y | Checkout filter field not combobox-associated with its listbox |done `dbb06e6` — combobox roles/aria as Select + CommandInput; activedescendant test |
| P2 | F5 | low | CONFIRMED | ui/Menu | Tab walks out of an open menu; no Home/End |done `6d852bd` — onClose on Tab, Home/End in onMenuKeyDown |
| P2 | F7 | low | PLAUSIBLE | dialogs | "Remount on kind change" not enforced (unreachable today) |done `fd0e6b8` — `key={dialog.kind}` |
| P2 | E7 | low | CONFIRMED | changed files | Scroll not reset on target change |done `e0ab5c5` — reset offset on target change like DiffBody |
| P2 | E8 | low | CONFIRMED | changed files | ↓ from a collapsed folder restarts at the top |done `5c42315` — reuse hiddenSlot + moveSelect as FilesColumn |
| P2 | E9 | low | CONFIRMED | changed files/a11y | `role="tree"` with no key to expand/collapse |done `790b1b1` — ←/→/Enter/Space as FilesColumn.folderKey |
| P2 | E10 | low | PLAUSIBLE | grid | Ctrl+right-click toggles compare pair before the menu wipes it |done `b8aff4c` — `if (e.button !== 0) return` |
| P2 | N1 | low | CONFIRMED | diff/commit panel | Status says Renamed, unstaged diff says Untracked for a workdir rename; hunk discard on that row is a dead action (git apply error) | done `c7a834a` — `for_untracked(true)` + `Untracked` in the rebuild guard; the unstaged diff and `changed_files` now report the pair like status does |
| P2 | E11 | low | CONFIRMED | context menu | "Copied path" singular for N paths |done `52e410e` — pluralise toast title |
| P2 | D7 | low | CONFIRMED | opsStore | `cancelled` Set leaks on cancel-after-exit |done `a25f5f3` — skip the add when the op is not running |
| P2 | D10 | low | PLAUSIBLE | theme | `localStorage` unguarded at module eval |done `8ce075e` — try/catch like readSetting/writeSetting |
| P2 | D11 | low | CONFIRMED | events | `listen` rejection swallowed silently |done `ddbd650` — console.warn |
| P2 | D6 | low | CONFIRMED | toasts | No cap; error toasts never expire |done `16552da` — cap in push (~8, drop oldest); no dedupe |
| P2 | D5 | low | CONFIRMED | repoStore | Stale page task deletes the new `inflight` entry → duplicate fetch |done `7dff5c6` — capture the map in the closure |
| P2 | D12 | low | CONFIRMED | recentsStore | `loaded` is dead state |done `bfaa244` — delete field + two test assertions |
| P2 | E4 | low | CONFIRMED | commit panel | Inline `actions` object defeats row memo |done `73c4d80` — useMemo |
| P2 | E6 | low | CONFIRMED | file tree | O(n²) tree build for a flat directory |fix-later — measure first (standing perf rule); rare shape |
| P2 | R6 | low | CONFIRMED mech | toolbar | Menu trigger found by DOM position; wrapper breaks it |done `a4cfec8` — hold a ref to the anchor |
| P2 | X9 | low | CONFIRMED | docs | Two false README claims |done `830d291` — scope both claims (four wrapped components; Stage only) |
| P2 | X10 | low | CONFIRMED | commit panel | Conflict filter + skip count in four copies | done `79431aa` — folded into P1-7 |
| P2 | R4 | low | CONFIRMED | tests | "Unstage selected" test is vacuous |done `0e4c436` — third staged fixture entry |
| P2 | R5 | low | CONFIRMED | tests | Intersection guard and `"here"` branch untested |done `79431aa` — two tests, alongside P1-7's helper |
| P2 | R9 | low | CONFIRMED | tests | Banner fixtures exercise the stale path only |done `5205abc` — matching `state` on the fixtures + three fresh cases |
| P2 | R7 | low | SETTLED | commit panel | Comment premise false; hazard unreachable — fix the comment |done `7fa85e6` — rewrite the comment only |
| — | R12 | — | recorded | commit panel | Two stale status/refs pairings; guarding would flicker | wont |
| — | R13 | — | recorded | rebase dialog | `canSquash` O(n) per row | wont |

---

## P0 — security or data integrity. Fix before push.

- [ ] **P0-1 · B1 — Ref names beginning with `--` are parsed as git options; `git rebase
      --exec=<cmd>` runs a shell command.** CONFIRMED (reviewer reproduced end to end: a branch
      named `--exec=touch$IFS'pwned.txt'` offered in the Rebase *Onto* list created the file).
      `crates/git-core/src/cli/ops.rs:184` — `rebase(onto)` pushes the ref bare; same in `merge`,
      `checkout`, `reset`, `branch_force`, `pull`, `push` (`--receive-pack=`), `delete_remote_branch`,
      `clone` (`--upload-pack=`), and `cli/rebase.rs` `read_args`/`run_args` (base appended last).
      git accepts the name (`check-ref-format refs/heads/--exec=…` → 0), so a fetched hostile remote
      puts it in the UI. Likelihood is low (the user has to pick it); consequence is RCE-class.
      **Fix:** `--end-of-options` (git ≥ 2.24) before every user-supplied ref/path in the builders,
      and before `base` in `rebase.rs`. Belt-and-braces: reject a leading `-` at the command boundary.
      **Test:** `tests/ops.rs` — create `refs/heads/--exec=touch$IFS'x'`, run `gitops::rebase(name)`
      through `GitCli::run`, assert `x` was not created. Today it is.

- [ ] **P0-2 · C1 = A3 — A status scan can write a pre-mutation index back over a CLI-backed stage
      or commit.** CONFIRMED lock claim; the clobber step is PLAUSIBLE (libgit2's `git_index_write`
      after `GIT_DIFF_UPDATE_INDEX` does no on-disk freshness check — from reading, not from a repro).
      `src-tauri/src/commands/diff.rs:83-98` holds only `handle.git2` (std `Mutex<Repository>`);
      `mutate()` (`stage.rs:54-67`) holds only `op_lock` (tokio); `git apply --cached` (`stage.rs:320`),
      `git commit -F` (`:469`) and every `cli_op` (`ops.rs:103`) run as subprocesses touching neither.
      `status.rs:113` sets `update_index(true)`. So the comment at `diff.rs:87-91` — "the lock keeps
      the app's own mutations out of that window" — is true only for the libgit2-side mutations
      (`stage_paths`/`unstage_paths`/`discard_paths`, which do take `git2.lock()`).
      **Scenario:** watcher-triggered scan on a big/just-touched tree (up to 1.5 s) → user stages a
      hunk mid-scan → scan finishes, refreshed a stat entry, writes its stale index → hunk unstaged
      silently. After a commit: the pre-commit index is written back and the committed files
      reappear as staged.
      **Fix options (decide in the fix):** (a) `get_status` takes `op_lock.lock().await` before
      scanning — ops issued mid-scan get `Busy`, and status waits behind a long push; (b)
      `op_lock.try_lock()` — if held, scan with `update_index(false)`; (c) hold the guard only when a
      write would actually happen (not knowable up front). (b) is the smallest and keeps every
      current behaviour except the stat-cache refresh during an op.
      **Test:** stall a `status()` with a big tree while `git apply --cached` stages a hunk on
      another thread; assert the hunk is still staged afterwards.

- [ ] **P0-3 · E1 — During a diff load the body shows the previous file while every button acts
      on the newly selected one.** CONFIRMED. `src/store/commitStore.ts:161` sets `diffPath` to the
      new anchor synchronously and leaves `diff` as the old file's until the IPC resolves;
      `DiffViewer.tsx:211` computes `path = diff?.path ?? selectedPath` so the header and hunks are
      file A while `DiffColumn`'s `actions` (`CommitPanel.tsx:86`) and `stageHunk`
      (`commitStore.ts:365-370`) address `diffPath` = file B. `loading` only adds a thin progress
      bar (`DiffViewer.tsx:325`); the body stays interactive. A line selection made on A survives
      too — `sel` resets on `diff` identity only.
      **Scenario:** click a.ts, click b.ts, click "Stage hunk" on a.ts's second hunk before the load
      lands → `stageHunks(id, "b.ts", [1])`. Reversible for stage/unstage; discard is guarded after
      the confirm by `stillShown`, so the window is real but the destructive path is covered.
      **Fix:** clear `diff` (and let DiffViewer drop its selection) whenever `loadDiff` changes
      `diffPath`/`diffList` — the "identical content → keep the object" optimisation at `:168-171`
      can stay, it applies after the load. Or have `DiffViewer` refuse a `diff` whose `path` is not
      the selected `path`.
      **Test:** with `getFileDiff` pending, select b.ts after a.ts loaded → `getState().diff` is
      null (today it is a.ts's diff).

- [ ] **P0-4 · A1 — Discarding a working-tree rename deletes the new file and never restores the
      old one.** CONFIRMED; severity med rather than high because the committed content is in HEAD
      and the user asked to discard the edits — but the end state is wrong and surprising.
      `crates/git-core/src/stage.rs:103-125`. `status()` pairs `old.txt`(WT_DELETED) +
      `new.txt`(WT_NEW) into one *renamed* row via `renames_index_to_workdir(true)`; the UI enables
      Discard for it (`CommitPanel.tsx:85`) and sends `["new.txt"]`. `discard_paths` asks
      `repo.status_file("new.txt")`, which runs single-path with no rename flags → `WT_NEW` →
      `remove_file` + `prune_empty_dirs`. `old.txt` stays missing; the `WT_RENAMED` arm at `:118` is
      dead. The user is left with a `D old.txt` row and no `new.txt`.
      **Fix:** in `discard_paths`, when `status_file` reports `WT_NEW` but the path is a rename
      target in the full status (or: accept `old_path` from the caller and restore both halves) →
      delete the new path and `checkout_index` the old one.
      **Test:** commit `old.txt`, `fs::rename` → `new.txt`, edit, `discard_paths(["new.txt"])` →
      `old.txt` exists with committed content, `new.txt` gone.

- [ ] **P0-5 · A4 — Discarding one hunk of a renamed file renames it back.** CONFIRMED.
      `crates/git-core/src/patch.rs:205-209` emits `rename from`/`rename to` whenever
      `status == Renamed`, regardless of whether the hunks cover the file. For `PatchOp::Discard`
      that patch goes to `git apply -R` against the working tree, and `-R` reverses the rename with
      it — the file lands back at `old_path` with the other, un-discarded edits under the old name.
      Reachable: hunk discard is enabled for a renamed row.
      **Fix:** emit the plain `a/<path> b/<path>` header for a partial patch, or at least for
      `Discard`. (For `Stage` the rename header is arguably right — git's own `add -p` on a rename
      stages delete+add — leave it.)
      **Test:** rename + two edits, `discard_hunks([0])` → file still at the new path, second edit
      intact.

- [ ] **P0-6 · A2 — `unstage_paths` has no rollback on a failed index write.** CONFIRMED.
      `crates/git-core/src/stage.rs:81-93`. `reset_default` mutates libgit2's cached index entry by
      entry and then `git_index_write`s; on `index.lock` held by another process the write fails,
      the cache stays mutated, and the next `status()` (`git_index_read_safely` is a no-op — disk
      unchanged) shows the path unstaged while `git commit` would commit it. `stage_paths` /
      `remove_paths` guard exactly this with `with_index` (+ `index.read(true)` on error), and
      `a_locked_index_leaves_the_path_unstaged` pins the mirror case.
      **Fix:** route `reset_default` through `with_index`.
      **Test:** copy that test for unstage: stage `f.txt`, plant `.git/index.lock`, `unstage_paths`
      → `IndexLocked`, assert the entry is still `index: Some(Modified)`.

- [ ] **P0-7 · E3 — Stash *Drop* runs with no confirmation.** CONFIRMED. `Sidebar.tsx:588` →
      `actions.ts:73` `stashDrop` → `runOp` → `ipc.stashDrop`. Every comparable destructive action
      (delete branch/tag/remote, discard files/hunks/lines, reset --hard) confirms; Drop sits one
      row under Pop in the context menu. No undo in the UI.
      **Fix:** a `dialogStore` spec like the delete dialogs (or `ask()` as `commitStore.discard`
      does) naming `stash@{n}` and its message.
      **Test:** `Sidebar.test.tsx` — Drop → `ipc.stashDrop` not called until accepted.

- [ ] **P0-8 · R1 — Opening a dirty repository leaves the walk unseeded.** CONFIRMED regression in
      the unpushed range; full trace in `2026-09-12-review-findings.md`. Fix: `syncWalkSeed()` in
      the store subscription's refs branch beside `dropWorkingTreeIfClean()` (`statusStore.ts:245`).
      Test: open with `refs: null`, resolve a dirty status, then set refs → `startLog` called with
      `{ workingTree: true }`.

## P1 — user-visible correctness. Fix in the same push.

- [x] **P1-1 · F2 — Merge / Rebase / Create-branch keep a ref name the refs refresh removed.**
      CONFIRMED. `OpsDialogs.tsx:302` (`useState(initial ?? candidates[0])`), `:546` (Rebase),
      `RefDialogs.tsx:41` (start point). `candidates` recomputes; `branch` does not. `Select` then
      renders `opts[-1]?.label` (blank) while `disabled={!branch}` keeps the button armed → `git merge
      feature` against a pruned ref. Fix: derive the effective value
      (`options.some(o => o.value === branch) ? branch : options[0]?.value ?? ""`) or clear it in an
      effect. Test: render with `feature`, replace refs without it → button disabled / real option.

- [x] **P1-2 · D2 — `revealOid` applies an index from a superseded walk.** CONFIRMED.
      `repoStore.ts:401-411` re-checks repo + generation after `findIndex` but not after
      `await fetchPage(...)`. A `startLog` during the page fetch (a fetch landing → `syncRefsOnce`
      re-seeds) bumps the generation; the final `set` writes the old index into the new walk and
      returns `true`, so no "Not in the current history" toast. Fix: repeat the guard after
      `fetchPage`. Test: stub `getLogPage` to resolve after a second `startLog`; assert selection
      unchanged and `false`.

- [x] **P1-3 · D1 — Theme token cache goes stale once the grid unmounts.** CONFIRMED.
      `useThemeTokens.ts:52-55` disconnects the `MutationObserver` at zero subscribers but keeps
      `cache`. Open repo → close → switch theme on the Start screen → reopen: lanes drawn in the old
      theme until the next toggle. Fix: `cache = null` beside `observer.disconnect()`. Test:
      mount, unmount, set `data-theme`, remount → dark tokens.

- [x] **P1-4 · E2 — `CommitDetails` never clears `error`/`detail` on a new oid.** CONFIRMED.
      `DetailsPane.tsx:85`. One rejected `getCommit` shows its error for every later commit; without
      an error, arrowing shows the previous commit's fields under the new chips for the round trip.
      Fix: reset both at the top of the effect. Test: reject once then resolve → body, not stale error.

- [x] **P1-5 · F1 — `Select` closes itself when its own listbox scrolls.** CONFIRMED.
      `Input.tsx:109-118` — capture-phase `scroll` on `document` with no target check;
      `scrollIntoView` at `:121` (or the wheel) fires it on the listbox. Any list past
      `max-height: 320px` (Create branch › Start point on a repo with many refs) vanishes
      mid-navigation. `CommandInput.tsx:91-93` has the exact guard. Fix: same
      `list.current?.contains(e.target)` check. Test: 40 options, `fireEvent.scroll(listbox)` →
      still open.

- [x] **P1-6 · Select keyboard cluster — X3 + X4 + F6 + R8.** Four findings, one component.
      *X3* (`Input.tsx:153`): Alt+↑ → `pick(active)` bails on a disabled option *before*
      `setOpen(false)`, so the chord is consumed and neither commits nor closes.
      *X4* (`:231`): `onMouseMove` sets `active` and Alt+↑ now commits `active`, so a pointer sweep
      over `drop` + Alt+↑ (meant as "move row up") schedules the commit for removal; which meaning
      Alt+↑ has depends on whether the row is movable, which the user cannot see.
      *F6* (`:136`): ↑/↓ do not skip disabled options; Enter on one is swallowed with no close.
      *R8* (`RebaseInteractiveDialog.tsx:116`): the capture guard checks `canMoveUp/Down`, not
      whether the Select is open, so Alt+↑ is stolen from an open list and the portal floats over
      the old row. **Fix together:** `move()` steps over disabled; `pick()` on disabled closes (or
      is unreachable once `move` skips); the dialog's capture guard yields when the focused Select is
      open; reconsider whether Alt+↑ should commit at all when `active` came from hover (commit the
      *selected* value, or require keyboard-set `active`). Tests: disabled-skip on ArrowDown; Alt+↑
      on a disabled active closes; Alt+↑ with the list open does not move the row.

- [x] **P1-7 · DisabledHint title cluster — X7 + X6 + R11.** `DisabledHint` made every disabled
      control's `title` visible for the first time, and ~9 titles were written for the enabled state.
      *X7* (`MessageColumn.tsx:183` and others): a dead Commit button says "Commit, then open the
      Push dialog"; a disabled "Move up" arrow says "Move up"; `DiffViewer.tsx:369` shows the
      checkout description while `busy`. `IconButton`'s `tip = title ?? label` wraps *every* disabled
      icon button with its bare label. *X6* (`FileContextMenu.tsx:80`, `FilesColumn.tsx:445`): the
      context-menu Stage item and the folder-row action still say "(N skipped)" when the whole
      action was refused — the misreading `e57945d` fixed for the header only; the Discard item at
      `FileContextMenu.tsx:92-97` already branches on `length === 0`. *R11* (`FilesColumn.tsx:102`):
      `title={skipNote}` while `disabled={busy || …}` blames conflicts for a busy button.
      **Fix:** audit every `disabled` + `title` pair; a disabled control's title says *why it is
      dead*, or is omitted. Consider `IconButton` not falling back to `label` for the hint.

- [x] **P1-8 · Selected-mode rules — X8 + R10.** Two hazards of the `> 1` selection threshold in
      `FilesColumn.tsx:56-58,102`. *X8*: after a partial "Stage selected" (3 conflicted of 5), the
      surviving conflicted selection keeps the header in selected mode with `target = []` — "Stage
      selected" disabled, "Every file you selected is conflicted" — while stageable files remain and
      the whole-list action is unreachable until a single click. `docs/smoke-test-post-v1.md:772`'s
      claim that the re-seed restores the label is false when survivors remain. *R10*: the inverse —
      a selection shrinking to 1 silently promotes the button to "Stage all" with the whole tree as
      payload. **Decide one rule** (e.g. drop the conflicted survivors from the selection after a
      stage, and/or treat an all-conflicted selection as "no selection") and pin it.

- [x] **P1-9 · R3 (+ R2 decision) — `DisabledHint`'s wrapper cancels the control's flex sizing.**
      CONFIRMED mechanism (X5 re-found it). `DisabledHint.module.css:6-11` `.wrap { display:
      inline-flex; min-width: 0 }` replaces the control as the flex item; `IconButton`'s
      `flex: none`, `DiffViewer`'s `.resolve { flex: none; max-width: 12rem }` and `.headerBtn`'s
      112px floor all now sit on an inner box. Fix: the `className` escape hatch (as `Menu`'s
      `.itemWrap` does) restoring the declared sizing for the affected callers. **R2 still needs the
      220px-panel measurement on a real build** before choosing the header floor.

- [x] **P1-10 · C2 — Every mutation triggers a second full status scan.** CONFIRMED.
      `commands/stage.rs:83-84` lifts watcher suppression the instant the op returns;
      `notify_debouncer_full` flushes ~250 ms later and `watch.rs:108` reads the flag at handler time
      → a second `repo://changed` → a second `get_status` (+ `syncRefs` for refs kinds) per stage /
      commit. Suppression only works for ops still running 250 ms past their last write. Fix: keep
      suppressed for one `watch::DEBOUNCE` window after the op (delayed un-suppress), or stamp
      events. Test: extend `suppressed_drops_events_and_stop_is_clean` — un-suppress immediately
      after the write, assert nothing arrives within 1 s (fails today).

- [x] **P1-11 · D4 — `same(prev.hunks, diff.hunks)` JSON-stringifies whole diffs on every load.**
      CONFIRMED. `commitStore.ts:170`. Runs after every `run()` and every debounced watcher event on
      the focused file; near the 20 000-line cap that is ~2×4 MB serialised on the main thread per
      keystroke-in-another-editor. Fix: cheap compare first (hunk count, per-hunk header +
      `lines.length`), deep only on a match. Same shape: **D8** `statusStore.ts:75` `sameRefs` and
      `commitStore.ts:147` `entriesKey` stringify whole snapshots per event.

- [x] **P1-12 · B2 — Streamed CLI output is retained and emitted without bound.** CONFIRMED.
      `cli/runner.rs:213` keeps all of stdout+stderr in `all: Vec<u8>`, copies it into
      `CliOutput::stdout`, and `app.emit`s one IPC event per line from the select loop. A typed
      `log -p` (allowed by `check_custom_args`) on a big repo is hundreds of MB resident and millions
      of events; the frontend's `MAX_LINES` cap re-slices per event (**D9** `opsStore.ts:75` —
      O(n²) copies, one render per line). Fix: cap `all`, coalesce line events (rAF/timer batch on
      both sides).

- [x] **P1-13 · D3 — A walk error emitted before `start_log` returns is dropped.** PLAUSIBLE
      (needs a repro on a corrupt/empty repo). `repoStore.ts:364,415` — `onProgress` filters on a
      still-`null` generation; `LogPage` has no `error` field to recover it from, so the grid shows
      an empty history instead of the failure. Fix: return `error` from `get_log_page` alongside
      `complete`, or buffer the last progress per generation.

- [ ] **P1-14 · E5 — The unstaged→staged selection-carry guard can never fire.** PLAUSIBLE.
      `DiffViewer.tsx:112` keys `loadedTarget` on `diff` identity, but `commitStore.loadDiff`
      keeps the old object when path + hunks match and never compares the target. Same file in both
      lists with identical hunks → the line selection survives into the staged diff and the bar
      reads "Unstage N lines" over a selection made against unstaged. The test at
      `DiffViewer.test.tsx:399` passes a fresh object the store would not produce. Fix: include the
      target in the effect key and in `unchanged`.

- [x] **P1-15 · F9 — Delete remote branch sends the bare short name.** CONFIRMED.
      `RefDialogs.tsx:185` → `git push origin --delete release`; with `refs/tags/release` on the
      remote too, git refuses ("matches more than one"). The tag dialogs pass `refs/tags/<name>`
      (`OpsDialogs.tsx:95`, `RefDialogs.tsx:289`). Fix: `refs/heads/${name}`. Safe failure today.

- [x] **P1-16 · C7 — "repo not open" is `AppError::Internal`, and the frontend uses `internal` as
      "stay quiet".** CONFIRMED. `state.rs:43`; `statusStore.ts:220` and `actions.ts:181` suppress
      the toast on `kind === "internal"`, so a real internal error (a panicked blocking task in
      `get_refs`) stops refs updating with nothing on screen. Fix: own kind (`notOpen`), branch on it.

- [x] **P1-17 · C6 — `close_repo` never cancels the repo's in-flight ops.** CONFIRMED.
      `commands/repo.rs:149`. Switch repo mid-push: the push keeps running against A, its events are
      dropped by the id filter, and there is no UI to cancel it. Fix: track op ids per `RepoId`,
      cancel them on close.

- [x] **P1-18 · F4 — `ContextMenu` never closes on scroll/resize.** CONFIRMED. `Menu.tsx:119`;
      `useMenuDismiss` listens for mousedown and Escape only. Wheel-scroll the grid under an open
      row menu → the menu visually labels a different commit than its items act on. Fix: the
      resize/capture-scroll → `onClose` effect `Select` and `CommandInput` already have.

- [x] **P1-19 · F8 — Start-screen shortcuts ignore `busy`.** CONFIRMED. `StartScreen.tsx:124`:
      Ctrl+O during a slow open picks a folder that `openPath` (`:55`) then drops silently. Fix:
      `|| busy` in the key handler.

## P2 — low. Batch when touching the file.

*Security hardening (defence in depth; not reachable from the shipped UI):*
- [x] **C3 = A5** `tools.rs:417` / `commands/tools.rs:70` — `open_diff_tool` joins the caller path
      unchecked (absolute paths discard the base). Run it through `repo_relative` like `open_path`.
- [x] **C4** `capabilities/default.json:12` — `opener:default` grants unscoped `reveal-item-in-dir`.
      Keep only `allow-open-url` + `allow-default-urls`.
- [x] **C5** `commands/ops.rs:899` — clone URL positional with no `--` and no scheme check
      (`ext::` transport). PLAUSIBLE. `--` + scheme allowlist.
- [x] **A6** `tools.rs:342` — unix temp dirs `/tmp/t4-git-ui-{merge,diff}-<uid>` at 0755,
      predictable; a planted symlink survives `remove_dir_all`. PLAUSIBLE. 0700, refuse non-dir.

*Rust correctness:*
- [ ] **B3** `cli/rebase.rs:274` — read pass runs a real `rebase -i --autostash`; a kill mid-run
      strands work in `rebase-merge/autostash`. PLAUSIBLE. Drop `--autostash` from `read_args`.
- [x] **B4** `cli/ops.rs:418` — `conflict_path` truncates modify/delete lines at the first space and
      strips every trailing dot. Only reached via typed commands (`check_conflicts=false`).
- [x] **B5** `cli/rebase.rs:331` — `exec git commit --amend` uses bare `git`, ignoring the
      configured `git_path`. PLAUSIBLE (needs git off PATH).
- [x] **B6** `cli/runner.rs:277` — `drain` at EOF leaves the emitted tail in `pending`; latent.
- [x] **B7** `log/graph.rs:156` — repeated parent oid → two identical Branch lines. Cosmetic.
- [x] **B8** `log/types.rs:139` — `LogFilter.author`/`path` deserialized and ignored. Delete.
- [x] **C8 = D13** `lib.rs:152` / `commands/diff.rs:15` — `get_commit_files` has no caller
      (`app::ping` likewise); `src/README.md:38` still names it. Delete.

*Frontend correctness / a11y:*
- [x] **F3** `RefDialogs.tsx:435` — Checkout filter field is not a combobox (no
      `aria-activedescendant`); ↑/↓ moves are silent to AT. `Select`/`CommandInput` show the pattern.
- [x] **F5** `Menu.tsx:81` — Tab walks out of an open menu that stays open; no Home/End.
- [x] **F7** `DialogHost.tsx:34` — "remount on kind change" not enforced (`cherryPick`/`revert`
      share `PickDialog`). Unreachable today. `key={dialog.kind}`.
- [x] **E7** `ChangedFileList.tsx:53` — scroll not reset on target change (row 0 → row 0).
- [x] **E8** `ChangedFileList.tsx:83` — tree mode, selection inside a collapsed folder, ↓ restarts
      at the top; `hiddenSlot` exists and is only used by `FilesColumn`.
- [x] **E9** `ChangedFileList.tsx:135` — `role="tree"` with no key to expand/collapse folders.
- [x] **E10** `GridRow.tsx:56` — Ctrl+right-click toggles the compare pair before the context menu
      wipes it (macOS secondary click). PLAUSIBLE. `if (e.button !== 0) return`.
- [x] **E11** `FileContextMenu.tsx:116` — "Copied path" (singular) for N paths.
- [x] **D7** `opsStore.ts:88` — `cancelled` Set leaks an id when cancel lands after exit.
- [x] **D10** `theme.ts:16` — `localStorage` unguarded at module eval; a throwing accessor kills
      the app at import. PLAUSIBLE. try/catch like `readSetting`.
- [x] **D11** `events.ts:14` — `subscribe` rejection swallowed; a failed `listen` silently kills
      live updates. `console.warn`.
- [x] **D6** `toastStore.ts:34` — no cap; error toasts never expire (dead mirror × N ops).
- [x] **D5** `repoStore.ts:212` — `finally { inflight.delete(p) }` reads the *new* map after a
      walk restart → duplicate page fetch. Capture the map.
- [x] **D12** `recentsStore.ts:27` — `loaded` is dead state.
- [x] **E4** `CommitPanel.tsx:86` — `actions` built inline defeats `UnifiedRowView`'s memo; every
      row re-renders on every parent render. `useMemo`.
- [ ] **E6** `fileTree.ts:24` (+ `Sidebar.buildTree`) — `children.find` per segment → O(n²) for a
      flat directory. `Map` per node.
- [x] **R6** `Toolbar.tsx:90` — menu trigger found by `previousElementSibling`; a `DisabledHint`
      wrapper breaks it while an op runs. Hold a ref.

*Docs and tests:*
- [x] **X9** `src/README.md:143` — two false claims: `DisabledHint` covers "every raw `<button>`"
      (`Select`, `TreeRow`, `SectionHeader` do not), and "Unstage selected skips conflicted like
      Stage all" (`StagedFiles` has no filter).
- [x] **X10** `FilesColumn.tsx:75` — conflict filter + skip count in four copies (`:75-78`,
      `:235-242`, `:248-253`, `FileContextMenu.tsx:53-54`); `useSelectedTarget` re-implements
      `pruneSelection`. Hoist once; X6/X7's wording gap is a direct consequence.
- [x] **R4** `CommitPanel.test.tsx:482-491` — "Unstage selected" test is vacuous (selection =
      whole list). Add a third staged fixture entry.
- [x] **R5** `FilesColumn.tsx:56-57` — the `entries ∩ selected` guard and the `"here"` refusal
      branch have no test.
- [x] **R9** `banners.test.ts:78-100` — five fixtures silently exercise the stale path; no fresh
      cherry-pick/revert/bisect status is tested.
- [x] **R7** `FilesColumn.tsx:122-125` — the comment's premise is false (settled: reviewer A
      independently confirmed a conflicted path never carries `index: Some`, so it never enters the
      staged list). The hazard is unreachable; fix the comment, not the code.

## Recorded, not fixing

- **R12** — two stale status/refs pairings (`MessageColumn.tsx:46,63`, `CommitPanel.tsx:67-82`);
  guarding would flicker. **R13** — `canSquash` O(n) per row; not a defect.

## Pre-execution audit (2026-09-12)

Every decision re-checked against the code before implementation. Corrections applied above:
P0-2's lock order (op_lock first, then scan_lock — the reverse turns every mid-op click into a
silent wait, the exact UX `mutate`'s comment exists to avoid); P0-4's payload must gain `oldPath`
after the confirm, not before; P1-7 keeps `IconButton`'s enabled tooltip; P1-1 needs no new
`Select` prop.

Verified live on git 2.55.0.windows.1, scratch repo, hostile ref created via `update-ref`
(`git branch` refuses the name; `check-ref-format` also rejects spaces, so the reviewer's `$IFS`
form is the one to use in the test):
- **Exploit reproduces**: `git rebase '--exec=touch$IFS'"'"'pwned.txt'"'"'` with an upstream
  configured and one commit ahead prints `Executing: touch$IFS'pwned.txt'` and creates the file.
- **`--end-of-options` blocks it** and is honoured by every builder subcommand: checkout, merge,
  rebase, rebase -i (read pass), reset --hard, branch -f, push, push --delete, pull, ls-remote,
  clone. Placement: after every option, before the first user arg (`push origin
  --end-of-options <refspec>`, `clone --progress … --end-of-options <url> <dest>`).
- **Boundary refusal** goes in the Tauri command layer (one `ref_arg()` check), so the `gitops`
  builders stay infallible; `remote_tags` (ls-remote, outside `mutate`) is included.

Implementation notes that fell out:
- P0-2: `run_and_classify`'s post-op `status()` runs inside the op (holds `scan_lock` already) —
  call `status::status` directly there, not `get_status`. The `tokio::MutexGuard` moves into the
  `blocking()` closure.
- P0-3: with `diff: null` + `loading`, `DiffViewer`'s body chain (`:228-231`) renders nothing —
  blank, not "Select a file". Correct.
- P1-10: `notify_debouncer_full::DebouncedEvent.time` is the *last* time the merged event was
  seen — a path written during the op and again after it is delivered (right), one written only
  during the op is dropped (right). The `AtomicBool` becomes `Mutex<Option<Instant>>`.
- P1-13: `LogCache` already stores `error`; only `LogPage` needs the field.
- P1-9's R2 measurement needs a real build: do it last in the batch, once `DisabledHint` is fixed.

Execution order: P0-1 → P0-8 (R1, one line) → P0-6 → P0-2 → P0-4 → P0-5 → P0-3 → P0-7, then P1 in
table order with P1-7 before P1-9, then P2 grouped by file. One commit per row, failing test first.

## Duplicates folded

X1→R1 · X2→R8 · X5→R3 · A3→C1 · A5→C3 · D13→C8 · F6/X3/X4→P1-6 · X6/X7/R11→P1-7 · X8/R10→P1-8 ·
D8→P1-11 · D9→P1-12.

## Refuted or settled this pass

- R7's reachability question — settled unreachable (see above).
- "`unstage_paths` collapses conflict stages" — true of libgit2, unreachable from the UI.
- "Credentials leak in captured stderr" — git redacts URL passwords (verified live).
- "`sh -c` in `spawn_tool` is injection" — paths go through env vars, not the string.
- "Concurrent `openRepo`" — `BusyOverlay` scrim swallows clicks from the first frame.
- "`DisabledHint` click-through" — Blink truncates the event path at a disabled control.
- Full per-area "verified clean" lists are in the session scratchpad only; the load-bearing ones:
  every `await → set` in the stores is generation/repo-guarded (except D2); `ipc.ts` matches every
  Rust command signature; `validateRefName` misses no `check-ref-format` rule; `gitArgs` matches
  the Rust builders; `GitCli::run` never goes through a shell; lock order `op_lock → git2` with no
  guard across an await; CSP is `default-src 'self'`.
