# Findings — full codebase review, 2026-09-20

Reviewed at `1c8d292` (v0.10.9, working tree clean). Fix plan: `2026-09-20-review-fixes-plan.md`.

**How.** One read-only review pass over the whole tree (backend command paths, git-core, the
stores, the dialogs), then every finding re-checked by hand before it was written down. Nothing in
`open-items.md` or the archived reviews already carries any of these (grepped). *REPRODUCED* = run
against real git in a scratch repo. *CONFIRMED* = whole path traced in the code. *PLAUSIBLE* =
mechanism confirmed in the code, the trigger not exercised — the plan's failing test is the experiment.

**Numbers.** 10 findings: **4 P0** (silent loss or corruption of file content), **4 P1**, **2 P2**.
Nothing found in the latest change (the T4 Git UI rename, `hooks.nsh`, `release.yml`).

---

## Triage table

| # | Id | Sev | Verdict | Area | One line | Decision |
|---|---|---|---|---|---|---|
| P0-1 | F1 | high | CONFIRMED (libgit2 half PLAUSIBLE) | git-core stage | File paths reach libgit2 and git as glob pathspecs: discarding `pages/[id].tsx` also restores `pages/i.tsx` | |
| P0-2 | F2 | high | REPRODUCED | git-core patch | A partial line selection next to `\ No newline at end of file` glues two lines together in the index | |
| P0-3 | F3 | med | CONFIRMED | git-core diff/patch | Hunk staging in a non-UTF-8 file writes U+FFFD bytes into the index | |
| P0-4 | F9 | med | CONFIRMED | tauri stage | Hunk / line indices are resolved against a diff rebuilt at click time; nothing checks it is the diff the user saw | |
| P1-1 | F4 | med | CONFIRMED | dialogs | Push sends the bare local name: `dev` tracking `origin/develop` lands on `origin/dev`, and the toast says `→ origin/develop` | |
| P1-2 | F6 | med | CONFIRMED | tauri ops + stores | `op://event` is broadcast: another window's failed op opens this window's dock, and two CloneDialogs cross their `opId`s | |
| P1-3 | F8 | med | CONFIRMED | cli runner | The run loop ends on pipe EOF, not on git's exit: a hook that backgrounds a child holds the op lock for as long as the child lives | |
| P1-4 | F7 | med | CONFIRMED | app setup | No single-instance guard: a second process wipes the first's merge-tool temp files and both overwrite `layout.json` / `recents.json` | |
| P2-1 | F5 | low | CONFIRMED | dialogs | Merge offers Squash together with "Always create a merge commit"; git always refuses the pair | |
| P2-2 | F10 | low | CONFIRMED | updater | Install never asks whether a git operation is running in any window | |

---

## P0

### F1 — file paths are matched as glob pathspecs
- `crates/git-core/src/stage.rs:206` — `discard_paths` hands each path to `CheckoutBuilder::path`
  with no `disable_pathspec_match(true)`. `diff.rs:203` sets that flag for the same reason, so the
  codebase already knows paths are not pathspecs. libgit2 matches literally first and then
  wildmatches: `pages/[id].tsx` is also the class `[id]`, so a modified `pages/i.tsx` or
  `pages/d.tsx` is force-restored with it. Its edits are gone, and the return value does not name it.
- `stage.rs:158` — `reset_default(head, paths)` takes pathspecs too and has no literal switch:
  unstaging `[id].tsx` unstages `i.tsx`.
- `stage.rs:223` (`checkout --merge --`) and `stage.rs:315` (`checkout --ours|--theirs --`) pass
  paths to git with no `--literal-pathspecs`; `log/history.rs:53` (`log --follow -- <path>`) the
  same, so the file history of `[id].tsx` can carry `i.tsx`'s commits.
- `cli/ops.rs:563` — `submodule update -- <path>` is a pathspec too. Rare (a submodule path with a
  bracket in it), but the same one-argument fix, so the plan takes it along.
- Not affected: staging (`update-index` takes paths, `stage.rs:82` says so), blame (a file, not a
  pathspec).
- Bracketed file names are ordinary in Next.js / SvelteKit routes, so this is not exotic.
- The CLI half is REPRODUCED (git 2.55, 2026-09-20): with `[id].txt` and `i.txt` both changed in
  two commits, `git log -- '[id].txt'` lists `i.txt`'s changes too; with `--literal-pathspecs` it
  names `[id].txt` alone, `--follow` included.
- The libgit2 half is PLAUSIBLE until the plan's failing tests run: if one passes before the fix,
  libgit2 matched literally there — keep the test, skip that code change.

### F2 — a line selection beside a missing final newline corrupts the staged blob
- `crates/git-core/src/patch.rs:89` — an unselected `-` line becomes context and keeps its
  `no_newline` marker (`patch.rs:95`, emitted at `:234`). A `\ No newline` marker is only valid
  after the *last* line of a side; as context the line is on both sides, and the `+` lines after it
  are appended to it.
- Reproduced with git 2.x: index `a\nb` (no newline), working tree `a\nb\nc\n`. The diff is ` a`,
  `-b\`, `+b`, `+c`. Staging only `+c` builds ` a`, ` b\`, `+c`; `git apply --cached` accepts it and
  the index becomes `a\nbc\n`. Staging only `+b` gives `a\nbb\n`. No error, no warning.
- The reverse direction has the mirror: unstaging only `-b\` leaves a no-newline line in the middle
  of the old side.
- Tests cover only the whole-hunk case (`tests/patch.rs::crlf_and_no_newline_round_trip`).

### F3 — hunk staging in a non-UTF-8 file stages replacement characters
- `crates/git-core/src/diff.rs:462` decodes every line with `from_utf8_lossy`, which is right for
  display. `patch.rs::build_patch` then rebuilds the patch from that text.
- A Latin-1 file with a changed line `caf\xE9` between ASCII context lines: the patch carries
  `+caf\xEF\xBF\xBD`, the context matches, `git apply --cached` succeeds, and the staged blob differs
  from the file. The file still shows as modified after the commit.
- When the invalid bytes sit in context lines instead, every hunk stage fails with "patch does not
  apply" and nothing says why.
- Not addressed by the plan: the hunk buttons stay enabled on such a file; the refusal arrives as a
  toast naming the reason. Disabling them needs the flag on the wire and a DiffViewer change.
- Different from `open-items.md` §I S2, which is about non-UTF-8 *paths*.

### F9 — hunk indices are trusted across a rebuild
- `src-tauri/src/commands/stage.rs:371` rebuilds the file's diff when the button is pressed and
  applies `hunks[i]` / `lines[(h, l)]` to it. The frontend sends indices only.
- An editor or formatter that rewrites the file inside the watcher debounce (250 ms) plus the
  status reload shifts the hunks. An index still in range stages — or **discards** — other lines
  than the ones on screen. `stillShown()` in `commitStore.ts` only covers the confirm prompt.
- A discard is unrecoverable.
- Decided 2026-09-20: the check is a content print per touched hunk, not the hunk header alone — a
  same-shape edit inside a hunk keeps its header, and a Discard would still take lines nobody saw.

## P1

### F4 — Push goes to the local name and reports the upstream
- `src/screens/RepoWindow/dialogs/OpsDialogs.tsx:137-142` — the refspec is `branch`, the toast target
  is `info.upstream`. Local `dev` tracking `origin/develop`: git runs `push origin dev`, creates or
  updates `origin/dev`, `origin/develop` never moves, the toast reads `Pushed dev → origin/develop`.
- The toast also shows the upstream when a different remote was picked in the dialog.
- `PullDialog` (`:192`) already resolves the remote-side name from the upstream; Push does not.
- **Closed 2026-09-20, will not fix** (decision D5; `open-items.md` §I): a bare `main` is ambiguous
  against a tag named `main`. git refuses that push ("matches more than one"), so it fails safe,
  and always sending `refs/heads/…` would lengthen every push preview.

### F6 — `op://event` has no addressee
- `src-tauri/src/commands/ops.rs:82` uses `app.emit`; `src/store/opsStore.ts:65` and
  `src/screens/StartScreen/CloneDialog.tsx:68` listen untargeted.
- Window A fails a push on repo X → window B (repo Y only) records the op and `reveal` opens its dock.
- Two windows cloning at once: both accept `repoId === null`, the other's `started` overwrites
  `opId` (`CloneDialog.tsx:72`), so Cancel kills the other window's clone and the progress lines mix.
- The backend already knows the owner: `AppState::holder_of` for a repo op, the invoking `Window`
  for a clone (`clone_repo` takes one). `emit_to` + `subscribeHere` is the pattern the tab events use.

### F8 — an op outlives git
- `crates/git-core/src/cli/runner.rs:278` — the loop breaks only when both pumps reach EOF, and
  `child.wait()` comes after it.
- A `post-commit` / `pre-push` hook that runs `some-daemon &` without redirecting its output keeps
  the pipe's write end open after git exits. The Commit button spins, the repo's op lock stays
  taken, every later mutation answers `Busy` — until the daemon dies.
- On Unix a daemon that called `setsid` also survives `kill(-pgid)`, so Cancel cannot end it either.

### F7 — two processes share one set of files
- `src-tauri/src/lib.rs:159` — every start runs `clean_merge_temp()` on the premise that "no tool
  of ours can still have them open this early". A second process breaks the premise: it deletes the
  LOCAL / REMOTE / BASE files an external merge or diff tool has open from the first.
- Both processes write `layout.json` and `recents.json`; `take_layout` is consumed by whichever
  starts second, so the first session's restore data is lost.
- The `OpenElsewhere` guard and the op locks are per process: the same repository gets two handles,
  two watchers and two independent locks.
- On Windows the NSIS update step kills every instance anyway.

## P2

### F5 — Squash + `--no-ff`
- `OpsDialogs.tsx:358-370` lets both be chosen; `cli/ops.rs:188` builds `merge --no-ff --squash`;
  git answers `fatal: You cannot combine --squash with --no-ff.` and the user sees "Operation failed".
- Two tests pin the pair as a valid preview: `dialogs.test.tsx:530`, `gitArgs.test.ts:32`.

### F10 — Install does not look for running work
- `src/store/updateStore.ts:59` → `src-tauri/src/commands/update.rs:72`. Neither consults
  `AppState::ops`. Window B mid-rebase or mid-push, window A clicks Install: on Windows the NSIS step
  kills the app, the op's result handling is lost with the process, and the orphaned git keeps running.
- Not addressed by the plan: a typed, uncommitted commit message in another window is lost too.
