# Plan: linked checkouts — worktrees + submodules

**Executed and walked 2026-09-13** (`647d7f1`, `45cc34e`, `85ae7fd`, `027cb59`; smoke groups AO / AP).

## Context

Two roadmap rows from `docs/plans/open-items.md` §C share one shape (a list of other checkouts
reachable from this repo, a flat sidebar section with a row menu, a few CLI ops, and "Open" =
switch this window to that path), so they ship as one batch. Worktrees is the item the user wants
first; submodules ride on the same pattern and fix a real gap: status excludes submodules today
(`status.rs:119`), so a moved submodule pointer never shows as a change.

Decisions (user, 2026-09-13): worktrees = list · Open · Add · Remove (force re-offer) · Prune ·
Lock/Unlock · "Create worktree here…" on branch rows; submodules = list · Open · Update (row + all)
+ include in status. Multi-repo tabs stay out of scope — Open uses the existing `switchRepo`
(`src/screens/RepoWindow/actions.ts:189`); when tabs arrive it becomes "open in tab".

## Design decisions (traced)

1. **List via git2, in a new `get_linked` command — not inside `RefsSnapshot`.** `repo.worktrees()`
   + `find_worktree` give path / `is_locked()` (with reason) / `is_prunable()`; `Repository::open(path)`
   + existing `refs::head_info` (`refs.rs:431`) give branch / detached, reusing the `HeadInfo` TS type.
   `repo.submodules()` gives path / url / `head_id` / `workdir_id` (`None` = not initialized). CLI
   `worktree list --porcelain` rejected: `locked`/`prunable` lines need git ≥ 2.36, floor is 2.24
   (`lib.rs:25-27`). Kept out of `label_snapshot` (`refs.rs:602`, the fast path behind the grid) so
   N `Repository::open`s and a dangling worktree link cannot slow or fail the branch list.
2. **Open repo is a linked worktree:** git2 enumerates all siblings (incl. itself) but never main.
   Add main explicitly: `repo.workdir()` when `!repo.is_worktree()`, else `commondir().parent()`; if
   that fails to open (bare / `--separate-git-dir`) skip the main row with a `ponytail:` comment.
   `current` = `RepoId::from_workdir(path)` (`repo.rs:40`, make `pub`) equals the handle's id — that
   normalizes `\\?\`, drive case and slashes, so no hand-rolled path compare.
3. **Open repo is itself a submodule:** out of scope; only this repo's own submodules are listed.
4. **Status flip is enough for the change row and the diff:** libgit2 reports `WT_MODIFIED` on the
   gitlink and synthesizes `Subproject commit <oid>` content, so `patch_for` (`diff.rs:263`) yields a
   one-line −/+ hunk and `mode_text` already maps `160000` (`diff.rs:138`); `stage_paths` uses
   `index.add_path`, which handles gitlinks; unstage is path-agnostic. **Discard needs one guard:**
   `discard_paths` (`stage.rs:104`) would `checkout_index` a gitlink (silent no-op) or
   `remove_file` an untracked nested repo dir (error aborts the batch) → `continue` when
   `workdir.join(p).is_dir()`. Git has no discard for a pointer either; `git submodule update` is
   the reset, which is the Update action. No `clean`/`-d` path exists in git-core, so nothing can
   delete a submodule checkout.
5. **Add-worktree args** (parse-options builtin, `END` safe): existing branch →
   `worktree add [--no-checkout] --end-of-options <path> <branch>`; new →
   `worktree add [--no-checkout] -b <name> --end-of-options <path> [<start>]`. Branch/start also pass
   `ref_arg` at the command boundary like `create_branch` (`src-tauri/src/commands/ops.rs:718`).
6. **Remove + force:** `worktree remove [--force] --end-of-options <path>`; a failure becomes
   `Err(GitError::Refused(failure_message(&f)))` (same conversion as `create_branch`, `ops.rs:722-729`),
   which `runOp`'s `onRefused` (`opsStore.ts:195`) hands to a dialog copied from `DeleteBranchDialog`
   (`RefDialogs.tsx:147-188`: `refused` state → "Force remove", preview flips to `--force`).
7. **Delete-branch guard:** libgit2 already refuses a branch checked out in another worktree with
   "current HEAD of a linked repository"; surfaces through the existing `delete_branch` path. No
   row annotation.
8. **Refresh:** `watch.rs` `classify` (82-92) forwards anything under a git dir that is not
   `objects`/`index` as `Refs`, so `.git/worktrees/**` changes (ours or a terminal's) already call
   `syncRefs`, and `runOp` calls it after every op. Only wiring: `repoStore.refreshRefs`
   (`repoStore.ts:307`) — **set `refs` first, then** `void ipc.getLinked(id).then(set).catch(() => null)`
   as a separate step, so the branch list never waits on N `Repository::open`s and a broken
   worktree link cannot fail it. (`git_dirs` order is git_dir then commondir — `watch.rs:113-117` —
   so a linked worktree's own `index` stays `Index`; a sibling's `worktrees/<x>/index` arrives as
   `Refs`, i.e. a 50 ms refs refresh per stage in another worktree's window. Harmless; noted.)
9. **Recents:** `touch(path)` names the entry from `baseName(path)` → `work-feature`; nothing to do.

### Audit fixes (2026-09-13, folded into the steps below)
- `Worktree.head` is `Option<HeadInfo>`: a prunable worktree (dir deleted) or one whose `.git` link is
  broken cannot be opened; Open is disabled when `prunable`.
- Discard on a submodule is **hidden, not a silent no-op**: the status entry gains `submodule: bool`
  (delta new-file mode `== Commit`), and `FileContextMenu.tsx:64` filters it out of `discardTarget`
  the way conflicted paths already are. The Rust `is_dir()` guard stays as belt-and-braces (it also
  fixes an untracked nested repo dir aborting a batch discard today). No confirm-text wording.
- Dirty-only submodule (pointer unchanged, checkout dirty) shows as Modified, and stage is a no-op
  that leaves the row — identical to `git status`'s "modified content". Recorded in AP as expected.
- Test mocks: ten test files stub `ipc.getRefs`; every mock that reaches `refreshRefs`
  (`repoStore.test.ts`, `actions.test.ts`, `opsStore.test.ts`, `Sidebar.test.tsx` at least) gets
  `getLinked: vi.fn().mockResolvedValue(null)`; grep `getRefs` under `src/**/*.test.*`.
- Smoke fixture: git ≥ 2.38.1 refuses the `file` transport for submodules, so the fixture runs
  `git config protocol.file.allow always` in `work` (local config, so the app's Update inherits it)
  and passes `-c protocol.file.allow=always` to its own `submodule add`. Without it Update fails with
  "transport 'file' not allowed".
- `worktree_remove`: every failure becomes a Force offer (missing path included), and the forced
  retry then toasts the real error — same shape as Delete branch. Accepted.
- `get_linked` opens N worktrees + N submodules per refs event; no caching (`ponytail:` comment on
  the fn: cache on `.git/worktrees` mtime if a repo with dozens ever shows up in the log timings).

## Steps (4 commits; `coder` implements + runs gates per commit, main session reviews the diff)

### 1 — git-core: listing, arg builders, two safety fixes
- New `crates/git-core/src/linked.rs` (+ `pub mod linked;` in `lib.rs`): serde types
  `Worktree { path, head: Option<HeadInfo>, main, current, locked, lockReason, prunable }`,
  `Submodule { path, url, headOid, workdirOid }`, `LinkedSnapshot { worktrees, submodules }`
  (`rename_all = "camelCase"` like `RefsSnapshot`); `worktrees(repo, current: &RepoId)`, `submodules(repo)`.
- `cli/ops.rs` after `clone` (~410): `worktree_add`, `worktree_remove`, `worktree_prune` (`-v`),
  `worktree_lock` (`--reason` optional), `worktree_unlock`, `submodule_update`
  (`update --init --recursive --progress -- [<path>]`; `git submodule` is a script, so `--` not `END`).
- `status.rs:119` → `exclude_submodules(false)`; status entry gains `submodule: bool` from the
  delta's new-file mode (mirrored in `src/api/types.ts`).
- `stage.rs:110` → `if workdir.join(p).is_dir() { continue; }` with a comment naming both cases.
- Tests: `linked.rs` (main + linked from both sides, `current`, branch names, lock reason,
  deleted dir → `prunable`; submodule fields, `workdirOid` None after deleting the checkout — add a
  `TempRepo::add_submodule` helper in `test_util.rs` beside `remote()`, built on `repo.submodule()` +
  `add_finalize()`); `cli/ops.rs` six arg vectors (`v(&[..])` helper); `stage.rs` discard skips a
  submodule path without error; `status.rs` moved pointer = one Modified entry.
- Verify: `cargo test -p git-core`, `cargo clippy -p git-core --all-targets -- -D warnings`.

### 2 — Tauri commands, IPC, types, store
- `src-tauri/src/commands/repo.rs`: `get_linked` after `get_refs` (180-194), same blocking +
  `open_private` shape.
- `src-tauri/src/commands/ops.rs`: six commands after `add_remote` (777-789); five are one-line
  `cli_op(...)`; `worktree_remove` does the Refused conversion. Guards: `ref_arg` on branch/start,
  `repo_relative` (`repo.rs:178`) on the submodule path.
- `src-tauri/src/lib.rs` handler list: register all seven.
- `src/api/types.ts` (next to `RefsSnapshot` ~190), `src/api/ipc.ts` (`getLinked` beside `getRefs:88`,
  ops beside `addRemote:327`).
- `src/store/repoStore.ts`: `linked: LinkedSnapshot | null`, cleared in open/close, set in `refreshRefs`.
- Verify: workspace clippy, `npx tsc --noEmit -p tsconfig.json`.

### 3 — UI: sections, menus, dialogs
- `SectionHeader.tsx`: spread `...rest` onto the `<button>` so `rowMenu()` can attach
  `onContextMenu`/`onKeyDown` for section-level Add / Prune / Update-all (no nested buttons).
- `Sidebar.tsx`: `Section` (20) += `worktrees`, `submodules`; `Target` (23-31) += worktree /
  submodule / two section kinds; two flat sections copied from Stashes (445-462), shown only when
  `worktrees.length > 1` / `submodules.length > 0` so an ordinary repo's sidebar is unchanged.
  Row badges: `main`, `current`, branch or `detached`, `locked`, `prunable`, `not initialized`.
  Menus copied from the stash menu (643-654): worktree → Open (off when current or prunable) ·
  Copy path · Lock… / Unlock · Remove… (off when main or current); submodule → Open (off when not
  initialized) · Update · Copy path. Local-branch menu (~513) gains "Create worktree here…".
- `CommitPanel/FileContextMenu.tsx:64`: drop `submodule` entries from `discardTarget` (same idiom as
  conflicted), so Discard never targets a gitlink.
- `actions.ts`: one-liners beside `stashApply` (72) for unlock / prune / submodule update; Open =
  `switchRepo`, Copy path = `copyText` (161).
- New `dialogs/WorktreeDialogs.tsx`: `AddWorktreeDialog` (folder picker from `CloneDialog.tsx:121-160`,
  branch mode from `CreateBranchDialog` `RefDialogs.tsx:35-109`; existing-branch list = local branches
  minus those checked out in a worktree; default path `parentDir(repo.path)/<name>-<branch>` via
  `src/lib/paths.ts`), `RemoveWorktreeDialog` (copy of `DeleteBranchDialog`), `LockWorktreeDialog`
  (copy of `AddRemoteDialog`, one optional reason field).
- `dialogStore.ts` specs, `DialogHost.tsx` cases, `dialogs/gitArgs.ts` preview mirrors.
- `Toolbar.tsx:136`: "Add worktree…" beside "Add remote…" (the discoverable entry point when a repo
  has no worktrees yet).
- Tests: `Sidebar.test.tsx` (both sections, current marker, Open → `ipc.openRepo`, Remove hidden on
  current); `dialogs.test.tsx` (Add preview for both modes, Remove force re-offer on `refused`).
- Verify: `npm test -- --run`, tsc.

### 4 — smoke groups AO / AP + fixture + docs
- New `docs/smoke/fixtures/linked-fixture.sh` (Git Bash, like `irebase-fixture.sh`): on
  `C:/tmp/t4/work` add a worktree on an existing branch, one with a new branch, one locked with a
  reason, one whose dir is then deleted (prunable), and a `sub` submodule from `bare.git` with the
  pointer moved and the checkout left dirty; sets `protocol.file.allow=always` in `work`'s local
  config first (see audit fixes).
- `docs/smoke/smoke-test-post-v1.md`: **AO. Worktrees** and **AP. Submodules** after AN, header
  paragraph names the fixture. AO: badges; Open switches + lands in recents; Add from branch row
  prefills; Remove dirty → refused → Force; Lock/Unlock; Prune; delete a branch checked out elsewhere
  → libgit2 message. AP: list + not-initialized badge; Update one / all; moved pointer shows, stages,
  unstages, diff shows −/+ `Subproject commit`; Discard on it is a no-op.
- `docs/plans/open-items.md` §C: drop submodules · worktrees; add a Shipped bullet. `README.md`
  feature list: one sentence. `src/README.md` if it indexes dialogs/sections.

## Verification
```
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npx tsc --noEmit -p tsconfig.json
npm test -- --run
```
Then the CDP walk (`docs/smoke/smoke-cdp.md`) over AO/AP against the fixture, plus a re-walk of the
staging groups E/F/G — commit 1 changes what `status()` reports for every repo with submodules.
Unix-only test code (none planned) would need a CI run before a tag (§H lesson).

## Risks
- **Path shapes:** libgit2 returns forward-slash paths, `RepoHandle.path` is backslashed → both sides
  through `RepoId::from_workdir` or `current` never matches and Open would open a second handle. A
  missing worktree dir makes `canonicalize` fail → keep the raw path (can never be current); Remove /
  Lock pass git the path as listed.
- **Status cost:** `exclude_submodules(false)` runs a status inside each initialized submodule per
  scan; libgit2 honours `submodule.<name>.ignore` / `diff.ignoreSubmodules` as the escape hatch if a
  vendored tree regresses the 1.5 s budget.
- **`.git` is a file in a linked worktree:** `RepoHandle::open`, the watcher and `tree.rs:365` already
  handle it; new code must not assume `<workdir>/.git` is a directory.
- **Main-worktree derivation** via `commondir().parent()` is wrong under `--separate-git-dir` → main
  row skipped, `ponytail:` comment; upgrade to `worktree list --porcelain` only if it comes up.
- **Long paths:** `worktree add` into a > 260-char dest fails without `core.longpaths`; surfaces as
  a CLI failure toast, no pre-validation.
