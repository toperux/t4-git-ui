# Plan: interactive rebase — reorder, reword, squash, fixup, drop, edit, in a dialog

_Status: shipped 2026-09-07 as planned; smoke group Z in `docs/smoke-test-post-v1.md` is the walk record._

## Decisions taken (2026-09-07)

| Question | Decision |
|---|---|
| Entry points | Commit row: rebase interactively from here. Branch row / Rebase dialog: rebase onto a branch, interactively. |
| Todo editor | In-app dialog (no external editor ever opens; the runner's `GIT_EDITOR=true` stays). |
| Messages | Edited up front in the dialog, one textarea per reword row / squash group. |
| Actions | pick / reword / squash / fixup / drop / edit + reorder. |
| Reorder | Move up / down buttons + Alt+↑ / Alt+↓ on the focused row. |
| Dirty tree | Autostash, after a notice that lets the user back out and commit by hand. |
| Autosquash | Always (`fixup!` / `squash!` commits land in place, pre-marked). |
| `--update-refs` | Checkbox, off by default, hidden on git < 2.38. |
| Merges in range | Kept (`--rebase-merges`) by default, with a **Flatten** option; the user can also cancel. |

## How it works: git writes the todo, the app edits it

`git rebase -i` builds the todo list itself — with `--autosquash` ordering, `--rebase-merges`
structure (`label` / `reset` / `merge`) and `--update-refs` lines — then hands it to the
*sequence editor*. The app plays that editor twice, so it never has to reimplement any of git's
todo generation:

1. **Read** (`rebase_todo`): run `git -c sequence.editor='sh -c "cp \"$1\" <out> && : > \"$1\"" _'
   rebase -i --autosquash [--rebase-merges] [--update-refs] [--autostash] <base>`. The editor
   copies git's todo out and empties it; git answers `error: nothing to do` (exit 1), removes
   `rebase-merge/`, leaves HEAD alone and pops the autostash. Verified with git 2.55 on Windows:
   both with and without `--rebase-merges`, dirty tree included, HEAD / stash list / files unchanged.
2. **Run** (`rebase_interactive`): write the edited todo to `.git/t4-rebase/todo` and run
   `git -c sequence.editor='cp "<todo>"' rebase -i [--rebase-merges] [--update-refs] [--autostash] <base>`.

Messages are applied with `exec` lines, so no editor and no `GIT_EDITOR` tricks:

- reword → `pick <oid>` + `exec git commit --amend -F "<.git/t4-rebase/msg-N.txt>"`
- squash group → head `pick`, members `fixup`, then one `exec git commit --amend -F "<combined msg>"`
- fixup → `fixup` (head message kept, no exec) · drop → `drop` · edit → `edit`

Verified: a `pick` + `fixup` + `exec … --amend -F` todo produced the reworded, squashed commit and
restored the autostash. Message files live in `.git/t4-rebase/` (cleared at the start of each run;
leftovers are harmless) so they survive a pause and never leak into the working tree.

Pauses: an `edit` stop **exits 0** with `rebase-merge/` still present; a failed `exec` (a commit
hook rejecting the amend) exits 1 with the same state; conflicts exit 1 with conflicted paths. So
after any rebase-family op the backend checks the repository state, not just the exit code.

## UI

**Dialog** `{ kind: "rebaseInteractive"; base: string }` (`RebaseInteractiveDialog.tsx`, 560px
`wide`), title `Rebase <current>` (`… onto <base>` from the branch path).

1. Dirty tree (`status.staged + status.unstaged > 0`): the body is a notice —
   "Uncommitted changes will be stashed before the rebase and restored after it." with
   **Stash and continue** / **Cancel** — before anything runs. (Cost accepted: the read step then
   stashes and pops once before the list appears; file contents are untouched, mtimes bump, one
   status rescan.) Clean tree: straight to the list.
2. Rows, oldest first as git lists them: `[action ▾] <short> <subject> [↑] [↓]`. Merge lines show
   as read-only rows (`merge  <subject>`); `label` / `reset` / `update-ref` / comments are kept
   in order but not shown. A pick moves only past another pick (never across a merge, a `label` /
   `reset` or a comment line; its own `update-ref` lines move with it); squash / fixup are offered
   only when the previous shown line is a pick or part of its group and that group's head is not
   dropped (disabled option with a title otherwise).
3. Selecting a row whose action is `reword`, or that heads a group with a `squash` in it, shows a
   textarea below the list: prefilled with the commit's full message, or head + blank line + each
   `squash` member's message (fixup members contribute nothing, like git). Once edited by the user
   the text is kept even if the group changes. `# ` lines are the user's business (git strips
   nothing here: `-F` takes the file verbatim — so the prefill has no comment lines).
4. Notice line when the todo has `merge` lines: "N merge commits in this range" with
   **Keep merges** (default) / **Flatten** — Flatten re-reads the todo without `--rebase-merges`.
5. `Update branches that point into this range (--update-refs)` checkbox, off, hidden on git < 2.38
   (`repoStore.gitVersion`); off strips the `update-ref` lines from the todo the read step returned.
6. Preview `Runs git rebase -i [--autostash] [--rebase-merges] [--update-refs] <base>`; primary
   button **Rebase**, disabled while the list is empty / loading. Submit closes the dialog and runs
   under `runOp("Rebasing <current>…")` with success `Rebased <current>`.

**Entry points**

- Commit row menu: `Rebase <current> interactively from here…` → base = the row's first parent
  (the row's commit is the oldest one in the list). Shown when `commitMenu.canRebaseInteractive`:
  not unborn, not detached, `refs.state === "clean"`, and the commit has a parent (no `--root`).
  Unlike `canRebase` it is allowed on HEAD's own commit (reword / amend the last commit is the
  common case). The dialog's rows are the truth of what gets replayed; a commit off HEAD's
  history simply lists more.
- Rebase dialog (branch row, Repository menu, commit row's plain item): an **Interactive**
  checkbox; with it on, submit opens the interactive dialog with `base = onto`.
- `commitMenu.canRebase` also requires `refs.state === "clean"` (git refuses a rebase during a
  merge / rebase anyway; the plain item gets the same guard).

**In progress** (existing rebase banner + commit panel):

- `computeBanners`: `state === "rebase"`, no conflicts → "Rebase paused — amend or add commits
  in the commit panel, then Continue"; with conflicts → today's text. Buttons: Abort · **Skip**
  (new, `git rebase --skip`) · Continue (primary).
- The `edit` stop and the exec failure are reported as `OpFailure::Paused { message }` (info toast:
  git's "Stopped at 8bb7f34…" / "execution failed: …" line, detail "Continue or abort from the
  banner"); `runOp` treats it like conflicts: info toast + select the working tree, no success toast.
- Typed commands keep refusing `rebase -i` (the dialog is the way in).

## Changes

1. **`crates/git-core/src/cli/rebase.rs`** (new; `ops.rs` keeps the plain rebase builders):
   - `TodoLine { kind: Pick { action } | Merge | UpdateRef | Other, text, commit: Option<TodoCommit { oid, short, summary, message }> }`;
     `parse_todo(text) -> Vec<TodoLine>` — command word = first token: `pick` / `reword` / `edit` /
     `squash` / `fixup` / `drop` (and their one-letter forms) are `Pick` with that initial action
     (autosquash pre-marks `fixup!` / `squash!` commits as `fixup` / `squash`; `fixup -C` / `-c`
     from `amend!` is read as plain `fixup` — ponytail, the message change is lost), `merge` / `m`
     is `Merge` (oid from `-C <oid>`), `update-ref` / `u` is `UpdateRef`, everything else
     (`label`, `reset`, `noop`, blanks, comments) is `Other`. Git 2.55 writes `pick <oid> # <subject>`,
     older `pick <oid> <subject>`: only the oid is trusted, subjects come from git2. A todo whose
     only command is `noop` (HEAD already on the base, or behind it) yields no picks.
   - `TodoStep = Line { text } | Amend { message }`; `write_todo(dir, steps) -> PathBuf` writes
     `msg-N.txt` files and the todo with `exec git commit --amend -F "<forward-slash path>"` lines.
     Pick lines are written as `<action> <oid> <subject>` so git's `Stopped at <oid>... <subject>`
     names the commit.
   - `read_args(base, &RebaseFlags { autostash, rebase_merges, update_refs }, out) -> Vec<String>`
     and `run_args(base, &flags, todo) -> Vec<String>`; both start with `-c sequence.editor=…`.
     Both editor strings and the exec lines go through `sh -c`, so a git dir containing any of
     `'`, `"`, `$`, `\` or a backtick is refused up front with a clear message rather than mangled;
     spaces are fine (quoted) and get a test, since the app's own checkout has them.
   - Tests: parser on the two subject formats, a `--rebase-merges` sample and an `update-ref` line;
     `write_todo` output; args.
2. **`crates/git-core/src/cli/runner.rs`**: `.env_remove("GIT_SEQUENCE_EDITOR")` next to
   `GIT_EDITOR` — the env var would beat `-c sequence.editor`.
3. **`crates/git-core/src/cli/ops.rs`**: `OpFailure::Paused { message }`; `rebase_skip()` builder.
   `classify_failure` unchanged (the pause is decided from repository state, below).
4. **`src-tauri/src/commands/ops.rs`**:
   - `cli_op`: when `check_conflicts` and no conflicts were found, a repository still in
     `RepositoryState::Rebase*` after the run — exit 0 or not — is `Paused { message }` (the
     `Stopped at` / `execution failed` / last `error:` line). Covers `rebase`, `rebase_continue`,
     `rebase_skip`, the new run command and `pull --rebase` alike. Side effect, accepted: a
     `rebase --continue` that git refuses (nothing staged, unresolved files) is also `Paused`,
     with git's own line as the toast — still true, the rebase is still paused.
   - `rebase_todo(id, base, autostash, rebase_merges, update_refs) -> RebaseTodo { head, baseOid, lines }`:
     under the op lock (`mutate`, non-streaming `run_git_op`); expects exit 1 + `nothing to do`,
     anything else is that git error (`cannot rebase: You have unstaged changes`, bad upstream);
     reads the dumped file from `.git/t4-rebase/read.todo`, resolves each oid through git2 for
     `short` / `summary` / `message`; `head` / `baseOid` = what HEAD and `base` resolved to at read time.
   - `rebase_interactive(id, head, base_oid, base, steps, autostash, rebase_merges, update_refs)`: refuses
     when HEAD or `base` no longer resolve to those oids ("The branch moved since the list was
     read — reopen the dialog": a base that moved would replay the old list onto a new tip), clears
     `.git/t4-rebase/`, writes the todo, `cli_op(check_conflicts = true)`.
   - `rebase_skip(id)`.
   - Tests (`crates/git-core/tests/ops.rs` style, real git): read returns picks in order with the
     fixup pre-placed (as a `fixup` pick), a merge line under `--rebase-merges` and `noop` for a
     HEAD already on the base; run with reorder + fixup + reword yields the expected log and
     messages, in a repository path with a space; a reworded commit with an `update-ref` line keeps
     the branch on the reworded commit; `edit` → `Paused` with the rebase dir present, then
     `rebase --continue` finishes; exec failure (`exec false` is not reachable through the API —
     use a rejecting `pre-commit` hook) → `Paused`; conflict → `Conflicts`; stale `head` refused;
     dirty tree + autostash restored.
5. **Frontend**
   - `src/api/types.ts` / `ipc.ts`: `RebaseTodo`, `TodoLine`, `TodoStep`, `OpFailure.paused`;
     `rebaseTodo`, `rebaseInteractive`, `rebaseSkip`.
   - `src/screens/RepoWindow/dialogs/rebaseTodo.ts` (pure, tested): row model
     `{ line: TodoLine; action: Action; refs: TodoLine[] }[]` — the `update-ref` lines that
     followed a pick travel with it (they say "branch X points at this commit") — plus
     `messages: Record<headOid, string>`; `canMoveUp/Down` (only past another pick row; `label` /
     `reset` / comment lines are barriers), `canSquash` (a pick or group member above, and that
     group's head not dropped), `moveRow`, `groupOf`, `defaultMessage`,
     `toSteps(rows, messages, updateRefs)`. `toSteps` emits, per group: the head line, its members,
     the `Amend` step if the group has a message, **then** the head's and members' `update-ref`
     lines and any `label` line that followed the group — a ref or label recorded before the amend
     would point at the pre-amend commit, which the amend orphans. `validate(rows)` names the
     first problem (a squash / fixup with no commit to fold into — its head was dropped or moved
     away — or an empty list: "Nothing to rebase — <current> is already on <base>"); the Rebase
     button is disabled with that text while one exists.
   - `RebaseInteractiveDialog.tsx`: the dialog above; `DialogSpec` + `DialogHost` entries;
     `RebaseDialog` gains the Interactive checkbox.
   - `RevisionGrid.tsx` menu item + `commitMenu.ts` guard; `banners.ts` texts + Skip; `actions.ts`
     `rebaseSkip`; `RepoWindow.tsx` dispatch; `opsStore.failureToast` `paused` + the conflicts-like
     handling in `runOp`.
   - Tests: `rebaseTodo.test.ts` (move rules across a merge line, group messages, emitted steps
     with amend placement, update-ref stripping), `dialogs.test.tsx` (dirty notice → read call
     with autostash; Flatten re-reads; submit payload), `banners.test.ts`, `RevisionGrid.test.tsx`
     (item present / hidden for a root commit and off a clean state), `opsStore.test.ts` (paused toast).
6. **Docs**: `docs/smoke-test-post-v1.md` group **Z** (reorder + reword + squash + drop on `work`,
   an `edit` stop → amend in the commit panel → Continue, a conflict → resolve → Continue, Skip,
   Abort, dirty tree with the notice, a merge in range kept vs flattened, `--update-refs` moving a
   side branch, the branch path through the Rebase dialog); `docs/design/style-guide.md` dialog
   list; `src/README.md` dialog + store notes; `docs/plans/2026-09-02-next-plan.md` roadmap line.

## Not in this change

- `--onto` (rebase a range somewhere else), `--root`, rewording a merge commit (`merge -c`),
  `break`, `exec` typed by the user, drag-and-drop reordering, per-row diff preview.
- Autostash pop conflicts at the end: git exits 0 and leaves the stash; the generic conflicts
  banner (from status) is what the user sees. Acceptable; no special text.
- Step progress (`msgnum` / `end`) in the banner: the count includes exec lines and would not match
  the rows the user saw.

## Ceilings (ponytail)

- Rows are plain DOM, not virtualized: a 500-commit range is 500 rows (scrolling list, fine).
- Move up / down is one swap per click; no multi-select, no drag.
- A `'` in the repository path breaks the `sh -c` quoting: refused with a clear message rather than
  handled.

## Verification

Gates (cargo fmt / clippy / test, tsc, vitest). `npm run tauri build`, silent install, walk group Z
over CDP on `c:/tmp/t4/work` plus a hand walk on `acme-clone`; commit, no push.

## Open points for refinement

1. Skip button in the banner — included above; drop it if unwanted.
2. Dirty-tree notice lives inside the dialog (one dialog, two states) rather than a separate
   confirm; the read step's stash/pop before the list shows is the price of git generating the todo.
3. The commit-row item on a commit outside HEAD's history rebases onto its parent as git would; the
   rows show what that means. Alternative: hide the item there (needs an ancestry check per menu open).
4. `edit` + squash members on the same head is allowed (git stops at the head, the fixups apply on
   Continue). Could be disallowed for simplicity.
5. Dialog width 560 vs full-window — 560 with an ellipsized subject column is the proposal.
6. `update-ref` lines travel with their pick when it moves; `label` / `reset` lines are barriers a
   pick cannot cross. Alternative: every structural line is a barrier (simpler, but with
   `--update-refs` on, no pick could move past a branch tip).

## Review notes (2026-09-07, self-review of the draft)

Fixed in this revision: autosquash-marked `fixup` / `squash` lines were parsed as hidden `Other`
lines (they are picks with an initial action); a moved `onto` branch between read and run was
unchecked (`baseOid` added); an `update-ref` / `label` line recorded before a reword's amend
would point at the orphaned pre-amend commit (emitted after the amend now); a squash under a
dropped head was allowed (`validate`); `noop` todos (nothing to rebase) had no handling; the
commit-row guard contradicted `canRebase` (own `canRebaseInteractive`); `sh -c` quoting refused
only `'`; pick lines carried no subject, so git's "Stopped at" line was blank.
