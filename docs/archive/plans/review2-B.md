# Review B — `f6eb8b7..main`, scope `src-tauri/**`, `src/api/**`, `src/store/**`, `src/lib/**`, `src/theme/**`

24 commits in range. Supporting `crates/git-core` hunks of those same commits were read where the
traced path crosses into them (runner, cli/ops, cli/rebase, repo, status, stage, tools, conflict).
Nothing under `docs/plans/` was opened.

---

### B1 · med · src/store/opsStore.ts:88-92 (`d057c90`)

**Claim.** The new dock cap keeps the **first** `MAX_LINES` and discards everything after, so a long
command's *ending* — the error lines the dock exists to show — is lost. The old code kept the last
`MAX_LINES` (`lines.slice(-MAX_LINES)`).

**Trace.** `onEvent` → non-exit branch → lines appended → `if (lines.length > MAX_LINES) { lines.length =
MAX_LINES; lines.push(TRUNCATED) }` and `op.truncated = true`. Every subsequent `stdout`/`stderr`/
`progress` event for that op returns at `if (op.truncated) return;` (opsStore.ts:80). The dock
auto-scrolls to the bottom (`OutputDock.tsx:144`), so the user lands on the marker plus the exit row.
The store's own comment two lines above (`opsStore.ts:70-72`) states the contract this breaks: "A
failure puts its reason in the dock while the toast carries only the first line, so show it". Note the
Rust side went the *other* way deliberately — `pump` retains the **tail** of each stream
(`runner.rs:311-315`) precisely so the failure text survives; the frontend cap now contradicts it.

**Failure scenario.** A pre-push hook (or `git fetch` on a repo with tens of thousands of refs, or a
typed `git log --oneline` in the Run-command dialog) prints > 5000 lines and then fails. Dock shows
lines 1…5000, `… output truncated`, `exited with code 1` — the `error:`/`fatal:` lines that explain the
failure are never recorded. With `quietFailure` ops there is no toast either, so the reason is
unreachable from the UI.

**Suggested fix.** Cap by dropping the head instead: keep `lines.slice(-(MAX_LINES))` with the marker
pushed to the *front* once, or keep a head slice plus a tail ring (e.g. first 1000 + last 4000).

---

### B2 · med · src/store/statusStore.ts:248 (`20f0a50`)

**Claim.** Adding `syncWalkSeed()` to the `refs` branch of the `useRepoStore` subscription makes the
*watcher* path start two walks for one event whenever the status response beats the refs response —
defeating the explicit fold-in in `syncRefsOnce` ("a moved seed and a flipped working-tree column are
one new walk, not two", statusStore.ts:157).

**Trace.** `onChanged({kinds:["refs"]})` → `scheduleRefresh()` (sets `timer`) + `syncRefs()` →
`syncRefsOnce` → `await Promise.all([rs.refreshRefs(), timer ? fetchStatus() : undefined])`. Both IPCs
are in flight concurrently. If `getStatus` resolves first, `fetchStatus` writes a now-dirty status;
then `refreshRefs` does `set({ refs })` (repoStore.ts:294) and zustand notifies **synchronously** →
subscription → `syncWalkSeed()` → `walkSeedWanted()` is now `true` while `filter.workingTree` is still
`false` → `void rs.startLog(spec, {…, workingTree:true})` — **walk A**. Control returns to
`syncRefsOnce`, which recomputes `now = walkSeeds(…, seeded=true)`; `walkSeeds` adds the `HEAD=<oid>`
token only when seeded, so `now !== before` unconditionally → `await after.startLog(...)` — **walk B**.

**Failure scenario.** Clean tree, `filter.workingTree === false`; user runs `git stash pop` (or
`git merge`) in a terminal on a repo with many refs (`getRefs` slower than `getStatus`). Two
`start_log` round trips, two `resetPages()`, the grid drops to `generation: null` twice and re-fetches
page 0 twice; walk A's backend walk is pure waste. The existing test
("a commit in a terminal on a dirty tree walks once") does not catch it because its `beforeEach` sets
`filter: { workingTree: true }` and it exercises the dirty→clean direction, where `syncWalkSeed` is a
no-op.

**Suggested fix.** Guard the subscription's `syncWalkSeed()` against a run already in progress (skip
while `refsRun !== null`), leaving `syncRefsOnce` as the single decision point on that path.

---

### B3 · med · crates/git-core/src/cli/ops.rs:108 + README.md:39 (`1da3113`)

**Claim.** `--end-of-options` raises the hard git floor from 2.20 to 2.24, but nothing in the code
enforces or even inspects the version — the floor exists only in prose and a hint string.

**Trace.** `const END = "--end-of-options"` is now emitted by `fetch` (with a remote), `pull`, `push`
(with a refspec), `merge`, `rebase`, `cherry_pick`, `revert`, `checkout`, `reset`, `branch_force`,
`delete_remote_branch`, `ls_remote_tags`, `clone` and `rebase::run_args`. The only version handling in
the tree is `probe_git` / `set_git_path` → `git_core::git_version` → a string returned verbatim
(`commands/app.rs:5-23`), stored as `settingsStore.gitVersion` and *rendered* only
(`SettingsDialog.tsx:132`, `StartScreen.tsx:175`). `GitMissingScreen.tsx:25` says "needs git 2.24 or
newer" but is only reached when `git --version` fails outright. No comparison, no gate.

**Failure scenario.** A user on git 2.20–2.23 (RHEL 8 ships 2.27, but Debian buster ships 2.20 and
many corporate images pin older): the app starts fine, shows the version happily, and then *every*
fetch / pull / push / merge / rebase / checkout / reset / clone fails with
`error: unknown option 'end-of-options'`, classified as `OpFailure::Other` and toasted as an opaque
git error. Before this commit those same operations worked.

**Suggested fix.** Parse the `major.minor` out of `git_version` in `probe`/`set_git_path` and refuse
below 2.24 with the Git-missing screen's message, so the documented floor is the enforced floor.

---

### B4 · low · src/store/opsStore.ts:77 (`a25f5f3`)

**Claim.** The commit closes one door on the `cancelled` set leak and leaves another open: the
`&&` short-circuit means `cancelled.delete(opId)` is never evaluated when the op exits **0**.

**Trace.** `cancel()` now adds the id only while the op is running (opsStore.ts:102). But the only
removal is `reveal = event.code !== 0 && !cancelled.delete(opId)` — for `code === 0` the right-hand
side is not evaluated, so the id survives.

**Failure scenario.** User clicks Cancel on a `git push` that completes successfully in the same
instant (the kill loses the race, or the command was already done and the process reaped with 0). The
id stays in `cancelled` for the process lifetime. Harm is bounded to memory, because
`AppState::begin_op` hands out monotonically increasing `op-N` ids (`state.rs:57`) that are never
reused — which also means the failure the commit message describes ("swallow the reveal of a later
failure") was not reachable in production before the fix either.

**Suggested fix.** Delete unconditionally: `const wasCancelled = cancelled.delete(opId); reveal =
event.code !== 0 && !wasCancelled;`

---

### B5 · low · src/lib/eqDeep.ts:6 (`31d7e62`)

**Claim.** The doc comment says eqDeep gives "the same answer comparing two `JSON.stringify` results
gives (key order aside)". It does not: a key whose value is `undefined` is dropped by
`JSON.stringify` but counted by `Object.keys`.

**Trace.** `eqDeep({a:1,b:undefined},{a:1})` → `Object.keys(a).length` 2 vs 1 → `false`;
`JSON.stringify` on both yields `{"a":1}` → the old `same()` said `true`. Also `eqDeep(NaN,NaN)` is
`false` where stringify said `true`. Neither divergence is exercised by `eqDeep.test.ts` (its first
case is literally named "matches a JSON.stringify comparison on plain values").

**Failure scenario.** Today all four call sites compare serde-produced IPC payloads
(`prev.hunks`/`diff.hunks`, `entry`/`diffEntry`, `entries`/`statsFor`, `beforeRefs`/`after.refs`), none
of which can carry `undefined`, so there is no live bug. The risk is the next call site: any comparison
against a locally built object with an optional field left `undefined` (e.g. `{ text: undefined }`
against `{}`) now reports "changed" and would re-trigger `loadDiff` / `refreshLabels` on every
`repo://changed`.

**Suggested fix.** Either drop the "same as JSON.stringify" claim from the doc comment and state
"`undefined` is a value, not a missing key", or skip `undefined`-valued keys on both sides.

---

### B6 · low · src/store/toastStore.ts:36 (`16552da`)

**Claim.** The cap evicts the oldest toast regardless of kind, so a transient info/success toast
silently destroys a persistent error the user has not read.

**Trace.** `push` → `[...s.toasts, t].slice(-MAX_TOASTS)`. Errors never auto-expire (`if (toast.kind !==
"error") setTimeout(...)`), so a full stack is typically eight errors.

**Failure scenario.** Eight failed remote-tag refreshes have stacked up (`refreshRemoteTags` toasts once
per remote). The user then copies a SHA; the "Copied SHA" info toast evicts the oldest error, then
auto-dismisses 6 s later. Repeat n times and n errors are gone without ever being seen or dismissed.
Also: the dropped toast's `setTimeout(dismiss)` still fires against an id that no longer exists.

**Suggested fix.** Evict the oldest **non-error** first, and only fall back to the oldest error when
the stack is all errors.

---

### B7 · low · crates/git-core/src/cli/runner.rs:313 → src-tauri/src/commands/ops.rs:908 (`d057c90`)

**Claim.** `pump` truncates `CliOutput.stdout` at the **head** and sets `truncated`, but no consumer
reads `truncated` — including the one consumer that *parses* stdout.

**Trace.** `pump` keeps the last `MAX_RETAINED` (4 MiB) bytes (`all.drain(..all.len() - limit)`) and
returns `(text, truncated)`; `run` folds them into `CliOutput { stdout, stderr, truncated }`
(`runner.rs:284-289`). `remote_tags` does `run.out.check(...)?` (exit code only) then
`gitops::parse_ls_remote_tags(&run.out.stdout)`. `CliOutput` is not serialized to the frontend
(`OpResult` carries only `opId`/`code`/`conflicts`/`failure`), so the flag has no reader anywhere.

**Failure scenario.** `git ls-remote --tags` against a remote with roughly > 70 000 tags emits > 4 MiB;
the earliest tags are dropped and the first surviving line is a mid-line fragment. The tag badge counts
silently under-report and the peeled `^{}` pairing at the cut is wrong, with no indication. Same shape
for `classify_failure(&run.out.stdout, ...)` if git ever puts the decisive line at the top.

**Suggested fix.** Have `remote_tags` (and any future stdout parser) return
`GitError::Refused`/log a warning when `run.out.truncated` is set, rather than parsing a fragment.

---

### B8 · low · crates/git-core/src/conflict.rs:131 (`26801af`)

**Claim.** `repo_relative` was added to `open_diff_tool`'s two path arguments but not to the sibling
`workdir.join(path)` in `open_merge_editor`, which takes the same untrusted frontend string.

**Trace.** `commands/diff.rs:41 open_merge_editor(state, id, path)` → `conflict::open_merge_editor(repo,
&path, tool)` → `let merged = workdir.join(path);` and `stage_file(repo, &dir, path, "LOCAL", …)` which
builds a temp file name from `path`. No `repo_relative` on either.

**Failure scenario.** Currently unreachable: `stages(repo, path)?` returns `None` for anything that is
not a conflicted index entry, and index paths can be neither absolute nor contain `..`, so the function
bails before the join. It is a guard-by-accident, not a guard — one refactor of the `stages` lookup (or
a future caller that skips it) reopens the exact hole the commit closed next door.

**Suggested fix.** `repo_relative(path)?` as the first statement of `conflict::open_merge_editor`, for
the same reason it is now the first statement of `open_diff_tool`.

---

### B9 · low · src/theme/useThemeTokens.ts:37 (`fbb4c8c`)

**Claim.** Clearing `cache` on the last unsubscribe fixes the reported staleness, but the exported
imperative getter can re-poison the cache while no observer is attached; the fix holds only because
`getThemeTokens` currently has no caller outside the hook.

**Trace.** `subscribe`'s teardown sets `cache = null` when `listeners.size === 0`. `subscribe` itself
never calls `read()` — the cache is only refilled by the `MutationObserver` callback or by
`getThemeTokens()`'s `cache ??= read()`. So: no subscribers → any `getThemeTokens()` call fills the
cache → theme flips with no observer → next mount's `subscribe` does not re-read → `getSnapshot`
returns the stale object.

**Failure scenario.** Reachable the moment anything draws from the tokens imperatively (canvas
pre-render, a non-React measurement, a test helper). Grep confirms the only references today are
`GraphCell.tsx:66` and `RevisionGrid.tsx:30`, both via the hook.

**Suggested fix.** Drop the separate `cache = null` and instead `cache = read()` at the top of
`subscribe` when `listeners.size === 1`, so attaching an observer always refreshes.

---

### B10 · low · src/store/commitStore.ts:336 & 355 (`4bd209d`)

**Claim.** The rename pairing is computed from an `entries` snapshot taken **before** the blocking
native confirmation, so the second half it appends can describe a tree the user no longer has.

**Trace.** `discard(paths)` reads `useStatusStore.getState().status?.entries` at line 336, then
`await ask(...)` (native modal — `stillShown()` exists at line 214 precisely because a `repo://changed`
can land while it is up), then builds `targets` from that same stale `entries` at line 355.

**Failure scenario.** The row is a working-tree rename `old.txt → new.txt`. While the dialog is open
the user stages the rename in a terminal. On OK the app sends `["new.txt","old.txt"]`; `discard_paths`
now sees `new.txt` with no `WT_*` bits (no-op) and `old.txt` likewise (no-op) — benign here, but
the pairing is doing its work on a snapshot no guard validates, unlike the hunk/line paths.

**Suggested fix.** Re-read `status.entries` after `ask` resolves (or route whole-file discard through
the same `stillShown`-style freshness check the hunk paths use).

---

## Verified clean

Traced end to end and found sound:

- **`c953e91` scan/op lock pair.** `mutate` takes `op_lock.try_lock()` → `Busy`, then
  `scan_lock.lock().await` (stage.rs:70-71); `get_status` takes `scan_lock.try_lock()` and passes
  `refresh = guard.is_ok()` into `status_with` (diff.rs:80-85). The guard is bound to a named local, so
  it is dropped after the tail `blocking(...).await` — held for the whole scan, as intended. Lock order
  is `op_lock → scan_lock → git2` for mutations and `scan_lock → git2` for scans; no path takes
  `op_lock` after `scan_lock`, so the pair cannot deadlock. `run_and_classify`'s post-op conflict scan
  correctly calls `status()` directly (ops.rs:148) because the op already holds `scan_lock`. Grep
  confirms `update_index(true)` is now reachable from exactly two places, both accounted for.
- **`1da3113` `ref_arg` coverage.** Every `gitops::` builder call in `commands/ops.rs` that passes a
  user string is wrapped (`fetch`, `pull`, `push`, `merge`, `rebase`, `rebase_todo`,
  `rebase_interactive`, `cherry_pick`, `revert`, `checkout`, `reset`, `branch_force`,
  `delete_remote_branch`, `create_branch`, `ls_remote_tags`, `clone_repo`). The remaining CLI argv
  builders that take user strings use `--` (`recreate_conflict_args`, `checkout_side_args`) or a
  value-taking flag (`stash_push -m`); the rest are libgit2-backed (`delete_branch`, `rename_branch`,
  `add_remote`) where argv injection does not apply. `fetch`'s `--all` correctly stays before `END`.
- **`7dff5c6` captured `inflight`.** `const pages = inflight` + `pages.delete(p)` in `finally` is the
  right asymmetry: `loaded` is deliberately read live because every `loaded` mutation sits behind the
  `s.log.generation !== gen` stale guard, whereas the `finally` delete does not. `ensureRows` reads the
  live map, so a stale task can no longer hide a live request.
- **`b31cac5` `revealOid`.** Two-pass loop, `continue` only on a generation change, `return false` on a
  repo change or a null index; `findIndex`'s `loadedIndex` shortcut cannot return a stale index because
  `resetPages()` clears `loaded` on restart. Bounded at two `find_log_row` calls.
- **`a890a79` `LogPage.error`.** `log.error` is reset by `LogCache::begin()` and `get_log_page` rejects
  a stale generation before reading it, so a page can only ever carry its own walk's error;
  `s.log.error ?? page.error` keeps the first one, and `startLog` clears it via `EMPTY_LOG`.
- **`ff46e63` `loadDiff`.** `changed = anchor !== diffPath || list !== diffList` blanks only on a real
  target move; watcher / post-mutation / context reloads keep the object (and therefore the scroll and
  line selection). The same flag correctly disables the identical-content shortcut, which previously
  handed the unstaged diff's object to the staged view. `DiffViewer` renders a `Progress` bar for
  `loading` (DiffViewer.tsx:329), so the blank is not an empty panel.
- **`4bd209d` rename halves.** `status.rs:152` gives `WT_RENAMED` priority over `INDEX_RENAMED` for
  `old_path`, so a `workdir === "renamed"` entry's `oldPath` is always the working-tree old name — the
  right half to append. `new Set` dedupes, and the prompt text is built before the expansion.
- **`b00a15c` `notOpen`.** Both suppression sites moved (`statusStore.ts:219`,
  `screens/RepoWindow/actions.ts:187`); grep finds no third site still keyed on `internal`, and
  `repoStore.ts:209` correctly still keys on `staleGeneration`.
- **`d057c90` runner.** `Batch` flushes on kind change, on `BATCH_LINES`, on `BATCH_AGE` measured from
  the batch start, on the `select!` sleep arm, and once after the loop before `Exit` — no line can be
  lost. `pump` keeps the stream **tail** and the deque makes head-dropping cheap. `CloneDialog.tsx:73`
  is the only `event.line` consumer and was correctly migrated to `lines[lines.length - 1]`.
- **`c2bf5d1` ACL.** `openUrl` in `SettingsDialog.tsx:86` is the only `@tauri-apps/plugin-opener` call
  from TS; `open_path`/`reveal_item_in_dir` are invoked from Rust (`commands/repo.rs`), which the ACL
  does not gate. `allow-open-url` + `allow-default-urls` is exactly the pair `openUrl(https://…)` needs.
- **`0967497` rebase exec.** `check_shell_path` runs before `remove_dir_all`, so a rejected git path
  does not wipe the todo directory; the bare default `git` is emitted unquoted and anything else is
  quoted after the quote/`$`/backtick/backslash screen.
- **`8ce075e` theme storage.** Both the module-evaluation read and the write are wrapped; `kvGet` /
  `kvSet` in `lib/kv.ts` were already guarded or `.catch()`ed by callers, so no other module-scope
  `localStorage` touch can take startup down.
- **`d820b93` / `1a596db` / `bfaa244` deletions.** No remaining caller for `ping`, `get_commit_files`,
  `LogFilter.author`/`.path`, or `RecentsStore.loaded`; the Rust `LogFilter` lost the fields too and has
  no `deny_unknown_fields`, so an older payload still deserializes.
- **`790b1b1` `folderKey`.** Pure predicate in `lib/keys.ts`, shared by both file trees.

---

## Test adequacy

| Commit | Verdict | Why |
|---|---|---|
| `20f0a50` seed on refs | adequate | "opening a dirty repository seeds the walk once the refs land" fails without the subscription hook. Does **not** cover the status-before-refs ordering (B2); the reordered arrangement lines in the checkout test weaken that test's original intent. |
| `ff46e63` blank diff | adequate | Both halves pinned: `diff: null` while in flight, and same-path-other-list returning a different object. Would fail without either change. |
| `1da3113` `--end-of-options` | adequate | `crates/git-core/tests/ops.rs` plants a `--exec=…` ref and asserts no `pwned.txt`; the unit test covers `ref_arg`/`opt_ref` both ways. Nothing pins the git ≥ 2.24 requirement (B3). |
| `4bd209d` rename discard | adequate | Both behaviours pinned in Rust (two-path restores, one-path does not) plus the TS payload + prompt wording. Strong. |
| `c953e91` scan lock | adequate for ordering, weak for the bug | `an_op_takes_the_op_lock_first_then_waits_out_one_scan` pins the lock protocol, but nothing reproduces the original corruption (a scan's `update_index` write-back landing over a CLI mutation) — the test would pass against any implementation that takes the two locks in that order, including one that still passed `refresh = true`. |
| `44f9e38` docs | n/a | Comment only. |
| `d057c90` bounded output | adequate | `batches_lines_by_count_and_kind`, `pump_retains_only_the_tail_but_streams_every_line`, and the store's "one state update per batch" / "nothing after the cap costs a render". Untested: `BATCH_AGE`, and the *direction* of the frontend cap — "stops recording … leaving a truncation marker" asserts `lines[0] === "l0"`, i.e. it actively pins the head-keeping behaviour of B1 as if it were correct. |
| `a890a79` page error | adequate | Drops the early `log://progress`, then asserts `log.error` came from the page. Fails without the change. |
| `b31cac5` reveal generation | adequate | Fails without the re-check (the old code wrote 4321 into walk 2). Weak on one point: the second `findLogRow` returns `null`, so the loop exits via the index guard and the "at most two passes" bound is never exercised. |
| `fbb4c8c` token cache | adequate | Unmount → flip `--lane-w` → remount → 20. Fails without `cache = null`. Does not cover the imperative-getter hole (B9). |
| `b00a15c` `notOpen` | adequate | Both directions in one test (quiet on `notOpen`, toasts on `internal`) plus the Rust serialization assertion. |
| `31d7e62` eqDeep | **weak / partly vacuous** | `eqDeep.test.ts` itself is fine. The two call-site tests ("compares the status and the diff without stringifying them", "compares the refs snapshot without stringifying it") assert only `expect(JSON.stringify).not.toHaveBeenCalled()` — they would pass with `eqDeep = () => true` **or** `() => false`, and pin performance rather than the equality semantics they nominally guard. No test covers the `undefined`-key divergence from the stringify behaviour being replaced (B5). |
| `a25f5f3` cancel memory | **weak** | Fails without the guard, but the scenario it constructs — the *same* `opId` arriving twice — cannot occur: `begin_op` issues monotonic `op-N`. So it pins the guard while the stated harm ("swallow the reveal of a later failure") is unreachable, and the remaining leak path (exit code 0, B4) is untested. |
| `8ce075e` theme storage | adequate | Spies all three `Storage.prototype` accessors to throw, then re-imports the module — fails without the try/catch, and pins both the read and the write. |
| `ddbd650` listen warning | adequate | Asserts one `console.warn` naming `op://event`. Minimal but exactly the claim. |
| `16552da` toast cap | adequate | Length and `toasts[0].title === "e1"` pin both the cap and which end is dropped. Does not consider kind (B6). |
| `7dff5c6` inflight map | adequate | Without the capture, the late page deletes the new map's entry and `onProgress`→`ensureRows` issues a third `getLogPage`; the test asserts exactly two. |
| `bfaa244` `loaded` flag | adequate | Assertion removed with the field; nothing else to pin. |
| `0967497` rebase exec git | adequate | Asserts the quoted configured path in the todo **and** that a `$`-bearing path is refused. |
| `26801af` diff-tool path | adequate | `repo_relative` unit test moved intact plus `crates/git-core/tests/tools.rs` covering the tool entry point. Nothing covers `open_merge_editor` (B8). |
| `c2bf5d1` opener ACL | **vacuous (none)** | No test. Reasonable — it is a capability-manifest change — but the "only `openUrl` is called from TS" premise is unpinned; a future `revealItemInDir()` import would fail only at runtime. |
| `d820b93` / `1a596db` dead code | adequate | Deletion-only; the compiler and the existing suites are the test. |
| `790b1b1` folder keys | adequate | `ChangedFileList.test.tsx` exercises the four keys. |
