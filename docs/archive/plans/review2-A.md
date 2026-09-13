# Review A — `f6eb8b7..main`, `crates/git-core/**`

16 commits in range (15 code + 1 docs/rustfmt). Traced each diff, then re-walked the
surrounding code in the current tree including the `src-tauri` callers that drive it.

---

### A1 · med · `crates/git-core/src/cli/ops.rs:444`

**Claim.** 235f21f ("Parse modify/delete conflict paths at their marker") regresses
`rename/delete` conflict lines: the path becomes a whole sentence.

**Trace.** `conflict_path` now falls through `rest.find("conflict in ")` → the new
`[" deleted in ", " added in "]` marker search → `&rest[..i]`. Git's rename/delete
message (merge-ort.c / merge-recursive.c) is

```
CONFLICT (rename/delete): old.txt renamed to new.txt in feat, but deleted in HEAD.
```

It has no `conflict in `, so it reaches the marker branch, and `" deleted in "` is found
at the *end* of the sentence, not after the path. `&rest[..i]` yields
`"old.txt renamed to new.txt in feat, but"`. The previous code (`rest.split(' ').next()`)
returned `"old.txt"` — correct whenever the path has no space, which is the common case.
Callers: `classify_failure` → `OpFailure::Conflicts` → `run_and_classify`
(`src-tauri/src/commands/ops.rs:142`) and the interactive-rebase read path (`:440`).

**Failure scenario.** `git merge feat` where `feat` renamed `old.txt` and HEAD deleted it →
the op result carries `conflicts: ["old.txt renamed to new.txt in feat, but"]`. Masked when
`check_conflicts` is true *and* `status()` reports conflicts (line 148 overwrites
`failure`), so it surfaces on the `check_conflicts:false` ops and in
`rebase -i`'s `failure_message` at `:440`.

**Suggested fix.** Cut at the marker only when it is the first `" ... in "` clause — e.g.
require the marker to be followed by `<ref> and (modified|added) in`, or add
`" renamed to "` to the marker list and cut at the min of all three.

---

### A2 · med · `crates/git-core/src/tools.rs:379`

**Claim.** 74dcde2 closes only half the `/tmp` hole it names: `temp_subdir` guards `base`
but never the `<base>/<sub>` it creates, and accepts a `base` that already exists as a
directory *owned by somebody else*.

**Trace.** `temp_subdir` does `symlink_metadata(&base)`; `Ok(m) if !m.is_dir()` → refuse,
`Ok(_)` → **accept unconditionally** (no uid / mode check), `NotFound` → create 0700. Then
`builder.recursive(true).create(&dir)` — `create_dir_all` semantics: an existing
*symlink-to-directory* at `base/<sub>` is followed and returns `Ok`. `conflict::stage_file`
then writes `<stem>.LOCAL.<ext>` / `.REMOTE` / `.BASE` into whatever it points at.
`temp_dir_named` appends the uid (`/tmp/t4-git-ui-diff-1000`), but that name is still
predictable and enumerable, so an attacker can create it first.

**Failure scenario.** Shared unix host. Attacker `mkdir -p /tmp/t4-git-ui-diff-1000/<hash>`
is not even needed — `mkdir /tmp/t4-git-ui-diff-1000` (they own it, mode 0777) and
`ln -s ~victim/.ssh /tmp/t4-git-ui-diff-1000/<hash>` for a `dir_key` they can compute (the
key is a 31-multiplier hash of two oids + path; a public repo makes it derivable, and they
can simply plant many). Victim opens a diff in the tool → `stage_file` writes blob content
to `~victim/.ssh/<stem>.LOCAL` as the victim. Same for `merge_temp_dir()` via
`open_merge_editor`. There is also a TOCTOU between `symlink_metadata` and `create`.

**Suggested fix.** After the `Ok(_)` branch also require `m.uid() == getuid()` and
`m.mode() & 0o022 == 0`, and apply the same `symlink_metadata`-then-refuse check to
`base.join(sub)` before creating it.

---

### A3 · med · `src-tauri/src/commands/app.rs:14` (consequence of `cli/ops.rs:108`)

**Claim.** 1da3113 raised the hard git floor from 2.20 to 2.24 (`--end-of-options`) but
nothing checks the version at runtime; on 2.20–2.23 the app starts happily and *every*
network / history op fails with an opaque git error.

**Trace.** `probe_git` / `set_git_path` call `probe(path)` and only assert that
`git --version` answers; the string is displayed, never parsed or compared. README and the
Git-missing hint were updated to "≥ 2.24", the code was not. All of `fetch(Some)`, `pull`,
`push(refspec)`, `merge`, `rebase`, `cherry_pick`, `revert`, `checkout`, `reset`,
`branch_force`, `delete_remote_branch`, `ls_remote_tags`, `clone`, `rebase::read_args`,
`rebase::run_args` now emit `--end-of-options` unconditionally.

**Failure scenario.** Debian buster / RHEL 8 / an old Git for Windows (2.20–2.23): the app
launches, the start screen shows `git 2.20.1`, and the first Fetch returns
`error: unknown option 'end-of-options'` with exit 129. `classify_failure` has no pattern
for it, so the user gets a raw git error with no hint that their git is too old.

**Suggested fix.** Parse the `git version X.Y.Z` in `probe` and refuse (→ the Git-missing
screen) below 2.24.

---

### A4 · med · `crates/git-core/src/diff.rs:348`

**Claim.** c7a834a makes `file_diff` rebuild the *entire* working-tree diff for every
untracked file, not just for the rename candidates the commit is about.

**Trace.** `build_diff(.., &[path])` is the cheap single-path diff. `maybe_rename` now
includes `Delta::Untracked`, and for `DiffTarget::Unstaged` / `Workdir` every untracked
file is exactly `Delta::Untracked`. So `idx.is_none() || maybe_rename` is true for *all* of
them → `build_diff(repo, target, opts, &[])` runs a second time, this time with
`include_untracked + recurse_untracked_dirs + show_untracked_content` over the whole tree,
plus `find_similar` with `for_untracked(true)` (which now hashes untracked blobs as rename
targets). Before the commit the untracked case took the fast path.

**Failure scenario.** Repo with a large un-ignored directory (a fresh `target/`,
`node_modules/`, a dropped tarball). Clicking any untracked file in the Changes panel now
reads and hashes every untracked byte in the repo — seconds per click, and it happens again
on every re-render because `file_diff` is not memoised in git-core.

**Suggested fix.** Gate the `Delta::Untracked` arm of `maybe_rename` on the working tree
actually having a deletion to pair with (a cached `WT_DELETED`-present flag from the last
`status`), and keep the fast path otherwise.

---

### A5 · low · `crates/git-core/src/cli/runner.rs:313`

**Claim.** The 4 MB tail cap silently corrupts `CliOutput.stdout` for the parsers that read
it, and the `truncated` flag that is supposed to "say so" is read by nobody.

**Trace.** `pump` keeps the **last** `limit` bytes (`all.drain(..all.len() - limit)`), so
the *head* is what is lost, and the cut is at an arbitrary byte — a multi-byte UTF-8
sequence straddling it becomes U+FFFD through `from_utf8_lossy`. `CliOutput.truncated`
(`runner.rs:70`) is set but grep finds no reader in `crates/` or `src-tauri/src/`; the
frontend's `TRUNCATED` marker (`src/store/opsStore.ts:15`) is an independent line cap on the
dock log. Consumers of the text: `parse_ls_remote_tags` (`ops.rs:908`) and
`classify_failure` (`ops.rs:142`, `:440`).

**Failure scenario.** `ls-remote --tags` against a remote with >4 MB of tag lines: the first
surviving line is a fragment, all earlier tags are gone, `parse_ls_remote_tags` skips the
fragment and returns a silently short list — "Refresh remote tags" drops tags with no
warning.

**Suggested fix.** Have `run_git_op`'s callers check `out.truncated` (at minimum
`refresh_remote_tags` should refuse rather than parse), and drop bytes at a UTF-8 boundary.

---

### A6 · low · `crates/git-core/src/watch.rs:204`

**Claim.** The 50 ms grace drops genuine external writes that land just after an op ends.

**Trace.** `set_suppressed(false)` stores `Suppress::Until(Instant::now() + SUPPRESS_GRACE)`
— a cutoff **in the future**. The handler drops any `ev.time < cutoff` (`watch.rs:143`).
`mutate` (`src-tauri/src/commands/stage.rs:87-89`) un-suppresses and then immediately emits
the synthetic `repo://changed`, so the compensating status read is issued at `T1`, before
the window closes at `T1+50 ms`.

**Failure scenario.** A `git fetch` returns at `T1`; the user's editor autosaves a file at
`T1+20 ms`; the frontend's post-op `get_status` reads the tree at `T1+5 ms`. The debounced
event for the editor write is stamped `T1+20 < T1+50` and dropped → the panel shows a stale
working tree until some later, unrelated event. A narrower variant: if the op *created* the
path, `notify-debouncer-full`'s `push_event` skips "modify right after create", so even a
later external modify of that path never reaches the handler.

**Suggested fix.** Use `Suppress::Until(Instant::now())` and rely on the debouncer's own
≥`DEBOUNCE` lag, or make the grace a `saturating_sub` on the *op start* rather than a
forward-dated cutoff.

---

### A7 · low · `crates/git-core/src/cli/ops.rs:454`

**Claim.** The `strip_suffix('.')` runs on *both* branches, including
`Merge conflict in <path>`, where git emits no trailing period.

**Trace.** `let path = path.strip_suffix('.').unwrap_or(path);` is applied after the
`match`, so `CONFLICT (content): Merge conflict in weird.` yields `"weird"`. (The previous
`trim_end_matches('.')` was worse — it ate every trailing dot — so this is a narrowing, not
a new bug, but the period only ever belongs to the modify/delete sentence.)

**Failure scenario.** A tracked file literally named `notes.` (legal on unix) conflicts →
the conflict list names `notes`, and "Resolve in editor" on it fails with "not conflicted".

**Suggested fix.** Move the `strip_suffix('.')` inside the marker arm, where the sentence
period actually is.

---

### A8 · low · `crates/git-core/src/cli/rebase.rs:322`

**Claim.** `write_todo` refuses the whole interactive rebase over `git_path` quoting even
when no `exec` line will be written.

**Trace.** `check_shell_path(Path::new(git_path))?` is the first statement, before the
`steps` loop that decides whether any `TodoStep::Amend` exists. On unix a configured git
path containing `\`, `$`, `` ` ``, `'` or `"` is refused; on Windows `shell_path` normalises
`\` away so only the other four bite.

**Failure scenario.** unix user with git at `/opt/g$t/git` (or a home dir with a quote)
reorders two commits — no reword, no exec line — and gets
`Refused("This repository's path contains $ …")` for a todo that would never have named git.

**Suggested fix.** Compute `git` lazily inside the `TodoStep::Amend` arm.

---

### A9 · low · `crates/git-core/src/conflict.rs:131`

**Claim.** 26801af fixed `open_diff_tool` but left its sibling `open_merge_editor` doing the
same unchecked `workdir.join(path)` — the root-cause guard was applied at one call site, not
at the shared boundary.

**Trace.** `open_merge_editor(repo, path, tool)` → `let merged = workdir.join(path);` with
no `repo_relative`. It is saved only incidentally: `stages(repo, path)?` runs first and
returns `None` for anything not present as an unmerged index entry, so an absolute path
exits with `Refused("{path} is not conflicted")` before the join. That is an accident of
ordering, not a guard, and `merged` is handed to `spawn_tool` as `$MERGED`.

**Failure scenario.** None reachable today; a future reorder or a tool launch that no longer
requires `stages()` re-opens it.

**Suggested fix.** Add `repo_relative(path)?;` as the first line of `open_merge_editor`.

---

### A10 · low · `crates/git-core/src/cli/ops.rs:169`

**Claim.** Three builders put a user-supplied argument *before* `--end-of-options` and
document themselves as infallible, so their safety lives entirely in `src-tauri`.

**Trace.** `push` pushes `remote` at `:169` and only then `END`; `delete_remote_branch`
(`:324`) and `ls_remote_tags` (`:333`) the same. The comment at `:102` says those "are
refused at the command boundary instead", and `ref_arg`
(`src-tauri/src/commands/ops.rs:241`) does refuse a leading `-` at `:301`, `:686`, `:904`,
`:924`. That works, but it is an invariant held in a different crate with nothing in
git-core enforcing it, and `crates/git-core/tests/ops.rs` only exercises `rebase`.

**Failure scenario.** A new caller (a test harness, a CLI front-end, a future command that
forgets `ref_arg`) calls `gitops::push("--receive-pack=touch pwned", …)` and git runs it.

**Suggested fix.** Make the three builders return `Result` and check the leading `-`
themselves, or add a `debug_assert!(!remote.starts_with('-'))`.

---

### A11 · low · `crates/git-core/src/cli/runner.rs:70`

**Claim.** `CliOutput.truncated` is dead weight — written, never read (see A5 trace).
Either wire it into the op result the frontend sees, or delete it.

**Suggested fix.** Surface it on `OpResult` next to `code`, or drop the field and the
`out_truncated || err_truncated` plumbing.

---

## Verified clean

Traced end to end and found sound:

- **`repo.rs` lock order.** `mutate` (`src-tauri/.../stage.rs:71-72`) takes
  `op_lock.try_lock()` → `scan_lock.lock().await`; `get_status`
  (`src-tauri/.../diff.rs:80`) takes only `scan_lock.try_lock()` and never `op_lock`.
  No path takes `scan_lock` after `git2`, and `run_and_classify`'s in-op scan
  (`ops.rs:148`) calls `status()` directly while already holding `scan_lock`, so it is not
  re-entrant. `status()` (refresh = true) has exactly two production callers, both covered.
  The `scan_guard` in `get_status` is a named binding, so it lives to the end of the
  function and really is held across the `blocking(..).await`. No deadlock, no inversion.
- **`status.rs` `status_with`.** `refresh` only feeds `StatusOptions::update_index`; the
  state stamp is still read before the scan. `refresh = false` costs a full content compare
  but cannot report anything wrong.
- **`stage.rs unstage_paths`.** `inspect_err` → `index().read(true)` force-re-reads the
  shared `git_index`, which is the same object `reset_default` mutated; the rollback is
  complete and the `read(false)` preamble is unchanged.
- **`stage.rs discard_paths`.** Unchanged apart from a comment. Both halves of a working-tree
  rename do the right thing (`WT_NEW` → delete, `WT_DELETED` → `checkout_index`), and a
  *staged* rename's old half carries no `WT_*` bit so it is a genuine no-op.
- **`patch.rs` rename header.** `!reverse && old_path != path` is the right condition; the
  `_` fallback still emits `mode_lines`, which the old rename arm did too, so an exec-bit
  change survives a partial unstage. Forward hunk-staging of a working-tree rename
  (now reachable because of c7a834a) produces a correct `rename from/to` + `--cached` patch.
  `FileStatus::Copied` is unreachable (`copies(false)`).
- **`cli/ops.rs` `--end-of-options` placement.** Every builder puts it after the last flag
  and before the first positional that follows it; `fetch`'s `--all` correctly stays on
  git's side; `-b <name>` sits before it but git's parse-options consumes an option's
  required argument unconditionally, and git rejects a branch name starting with `-`
  anyway. `git push`/`git pull`/`ls-remote` all permute options after positionals
  (`push <remote> --delete` already relied on this), so the separator is parsed where it
  sits. `stash_*` take a `usize`; `recreate_conflict_args` uses `--`.
- **`cli/runner.rs` batching.** `Batch::push` flushes on kind change, on `BATCH_LINES`, and
  on its own `since.elapsed() >= BATCH_AGE`, so a steady sub-50 ms stream still ages out;
  the `select!` sleep arm is re-armed each iteration and guarded by `!batch.lines.is_empty()`;
  the final `batch.flush(&mut on_event)` after the loop breaks means no partial batch is
  lost. The `tail drain` fix (`start = pending.len()`) is correct and the unbounded channel
  delivers the eof events before `None`. Kind interleaving preserves order.
- **`watch.rs` stamping.** `notify-debouncer-full` 0.7's `debounced_events` de-dups by
  `EventKind` within a flush keeping the *last* pushed entry, so the "last seen" claim in
  the comment holds: a path written during the op and again after survives.
- **`log/graph.rs`.** `p == p0 || rest[..i].contains(&p)` correctly collapses both the
  "duplicate of the first parent" and the "duplicate within the tail" cases, and skipping
  the duplicate leaves no orphan entry in `inserted` / `top_to_bottom`.
- **`repo.rs repo_relative`.** `Component::Normal | CurDir` rejects `RootDir`, `ParentDir`
  and (on Windows) `Prefix`; `C:foo`, `\\srv\share\x` and `a\..\..\x` are refused on Windows
  and are ordinary file names off it, which is correct. No legitimate caller passes an
  absolute or `..` path (`open_path` and `open_diff_tool` both take repo-relative status /
  diff paths). `conflict::stage_file` only uses `file_name()`, so it cannot escape the temp
  dir regardless.
- **`log/types.rs`.** Dropping `author` / `path` is safe: `LogFilter` has no
  `deny_unknown_fields`, so an older frontend sending them still deserializes, and the TS
  type was updated in the same commit.

---

## Test adequacy

| Commit | Verdict | Why |
|---|---|---|
| deba502 unstage rollback | adequate | Plants `index.lock`, asserts `IndexLocked` *and* that the path is still staged, then that it unstages once the lock is gone. Fails without the `inspect_err` (the cached index stays mutated and `status` reads it). |
| b70f1d2 reverse rename header | adequate | Unit test pins both header directions verbatim; the integration test actually runs `git apply -R --cached` and asserts `old.txt` is not back in the index. Both fail without the fix. |
| 1da3113 `--end-of-options` | adequate (narrow) | The integration test is a real exploit (upstream one commit behind so the `exec` replays) and fails without the fix — but only for `rebase`. The other twelve builders get argv-equality assertions, which pin the *shape*, never that real git accepts the separator there; nothing pins the `ref_arg` boundary for the remote-before-END builders (A10). |
| 4bd209d both halves of a rename | weak | git-core is unchanged by this commit (one comment); the two new tests characterise behaviour that already worked. The actual fix is `commitStore.discard` in TS and is not covered here. They are still useful regression pins for `discard_paths`. |
| bf5cf77 | n/a | rustfmt of one assertion. |
| c953e91 `scan_lock` | weak | The test locks and try-locks two `tokio::sync::Mutex`es on a bare `RepoHandle` and asserts tokio's own semantics. It never calls `mutate` or `get_status`, so it would pass unchanged if `mutate` took the locks in the *opposite* order; and nothing asserts that `status_with(repo, false)` leaves the index file untouched, which is the behaviour the commit exists for. |
| 4190d9d watcher stamp | adequate | `a_write_made_during_the_op_stays_dropped_after_unsuppressing` fails with the old `AtomicBool` (the flag reads false at flush time); `an_external_write_after_the_op_is_reported` guards the opposite direction. Wall-clock sleeps make it flake-prone on a loaded CI box. |
| d057c90 bound memory / event rate | adequate | `batches_lines_by_count_and_kind` pins count + kind-switch flushing; `pump_retains_only_the_tail_but_streams_every_line` pins that truncation loses text but not events, and that under the cap nothing changes. Untested: the `BATCH_AGE` timer arm, the post-loop `batch.flush`, and a multi-byte cut (A5). |
| 235f21f conflict path marker | weak | Pins only `modify/delete` with a space and with a `.d` extension. The sibling `rename/delete` message that the new marker search mis-parses is untested — the test passes *because* the only shape it feeds is the one shape the change handles (A1). |
| 0967497 configured git in exec | adequate | Asserts the exact `exec "C:/…/git.exe" commit --amend -F "…"` line and that a `$` path is refused. Fails without the change (the line said bare `git`). |
| 55d375c consume the tail | adequate | `pending3` must end empty and `l("tail")` must appear exactly once; without `start = pending.len()` the drain is a no-op and the assertion fails. |
| 659f51c duplicate parent | adequate | `push(o(1), &[o(0), o(0)])` must yield exactly one `line(Branch,0,0,0)`; two lines without the guard. |
| 26801af repo-relative diff-tool path | adequate | Covers `/etc/passwd` and `../outside.txt` for both `path` and `old_path`, plus a unit test with the Windows-only prefixes gated on `cfg!(windows)`. Does not cover `open_merge_editor` (A9). |
| 74dcde2 temp dirs 0700 | weak | Pins the refusal of a planted *file* and a planted *symlink at `base`*, and the 0700 mode of a base we create. Says nothing about a pre-existing attacker-owned `base` or a planted `base/<sub>`, which is where the hole still is (A2). |
| 1a596db drop dead log-filter fields | n/a | Deletion only, no test; serde tolerance of the removed keys is not asserted but is the default. |
| c7a834a pair a working-tree rename | adequate | Fails without `for_untracked` (status was `Untracked`) and checks both halves resolve to the same `Renamed` diff, plus that a 100 % rename has no hunks. Does not pin that a plain untracked file still reports `Untracked`, nor the extra full rebuild the change causes (A4). |
