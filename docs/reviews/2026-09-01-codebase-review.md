# Codebase review — 2026-09-01

Read-through of the whole tree after v1 acceptance (`9bfaf81`): `crates/git-core`, `src-tauri`,
`src`, CI. Triaged 2026-09-02; the outcome of every item is in the table below (the per-row
**Decision** column was superseded by it).

Not read (judged low value): CSS modules, tests, `docs/design/*`, `main.rs`, `build.rs`.

## Triage (2026-09-02)

| Item | Decision | Outcome |
|---|---|---|
| M1 repo switch leaks the old handle | fix | `openRepo` closes the repository it leaves (`repoStore.ts`) |
| M2 commit-panel commands wait on the op lock | fix, backend Busy (user choice) | `mutate` uses `try_lock` → `Busy`; `mutate_busy` folded into it |
| M3 walk restart blanks the grid / drops the selection | fix | rows stay until replaced; selected oid re-selected via loaded rows or `find_log_row`, retried on walk completion |
| M4 Stage all resolves conflicts | fix | conflicted entries skipped, button title says how many |
| M5 search text survives a repo switch | fix | `openRepo` resets spec/filter; toolbar input follows `repo.id` |
| L1 tag-of-tag | fix | `create_tag` tags the peeled commit |
| L2 linked worktree common dir unwatched | fix | watcher also watches `commondir()` |
| L3 merge-editor temp files | fix | `conflict::clean_merge_temp()` at app start |
| L4 exec-bit in hunk/line patches | **defer** (next plan) | mode changes stage whole-file only; documented in Known gaps |
| L5 `add_path` force-adds ignored files | fix | refused unless the path is already tracked |
| L6 discard leaves empty dirs | fix | parents pruned up to the workdir |
| L7 unquoted command line | fix | `display_cmd` quotes args with whitespace/quotes |
| L8 no `set_git_path` | fix, minimal (user choice) | `set_git_path` command (probes first), "Locate git…" on the git-missing screen, path kept in kv `gitPath` and re-applied at start |
| L9 SHA not searchable | fix | hex query ≥ 4 chars matches an oid prefix |
| L10 byte-order ref sort | fix | `natural_cmp` (numeric runs, case-insensitive) for branches, remotes, tags, labels |
| L11 `revealOid` pages sequentially | fix | `find_log_row` command; `revealOid` fetches just that page |
| L12 unawaited `kvSet` | fix | `persist()` helper logs instead of rejecting |
| L13 hard-coded "20 000" | fix | `FileDiff.maxLines` from the backend |
| L14 nested `init` | fix, refuse (user choice) | `init_repo` discovers from the nearest existing ancestor and refuses |
| L15 menus toast instead of disable | fix | sidebar + grid context menus disable while an op runs (Copy stays) |
| P1 ahead/behind per refresh | fix | `AheadBehindCache` on `RepoHandle` (`snapshot_with`) |
| P2 patch per delta in `changed_files` | fix | one `foreach` pass with a line callback |
| P3 whole diff per file click | fix | pathspec-limited diff first; full diff only when the result looks like half a rename |
| P4 watcher NoCache · P5 virtualized dock | **defer** (measure first) | — |
| H1 tsc twice in CI | fix | explicit `tsc` step dropped; `cargo test --workspace` now (src-tauri tests included) |
| H2 no src-tauri tests | fix | `state.rs` + `error.rs` unit tests |
| H3 CRLF working copies | fix | `.editorconfig` (`end_of_line = lf`); the 7 files converted |
| H4 README "Next" vs plan gaps | fix (2026-09-02) | folded into `docs/plans/2026-09-02-next-plan.md`; README points there |

Severity: **M** = user-visible misbehaviour or a real leak · **L** = edge case / polish ·
**P** = performance (no bug) · **H** = hygiene.

---

## M — medium

| # | Where | What | Scenario | Proposed fix | Decision |
|---|---|---|---|---|---|
| M1 | `src/store/repoStore.ts:163`, `src/screens/RepoWindow/actions.ts:72` | Switching repos never closes the previous one. `openRepo` replaces the store's `repo` but neither it nor `switchRepo` calls `ipc.closeRepo(old.id)`; only `closeRepo` (Ctrl+Shift+W) does. Backend `open_repo` (`src-tauri/src/commands/repo.rs:82`) just inserts into `state.repos`. | Open A, switch to B via the repo menu, repeat: every `RepoHandle` (git2 handle, log cache) and its `Watcher` stay alive for the process lifetime; old watchers keep emitting `repo://changed` that the stores filter by id. | In `repoStore.openRepo`: after the new open succeeds, `void ipc.closeRepo(prev.id)` for the previous repo (ignore errors). Or backend-side: `open_repo` closes every other id (single-repo v1 invariant). | |
| M2 | `src-tauri/src/commands/stage.rs:52` (`mutate`) vs `:70` (`mutate_busy`) | All stage/unstage/discard/stage_patch/commit commands use `mutate`, which **waits** on `op_lock`. Long ops (fetch/pull/push/merge…) hold the lock through `mutate_busy`. | Start a fetch from `slow` (60 s), click Stage on a file: request hangs; `commitStore.busy` stays true; panel is frozen with no message until the fetch ends or is cancelled. The UI's `running` guard only covers toolbar/menu ops, not the commit panel. | Either (a) commit panel disables its actions while `selectRunning`, with the existing BUSY tooltip, or (b) `mutate` uses `try_lock` + `Busy` too (then the frontend already toasts `Busy`). (b) is one line and consistent. | |
| M3 | `src/store/repoStore.ts:205` (`startLog`), `src/store/statusStore.ts:85` | Every restart of the walk resets `rows: []`, `selectedIndex: null`. `syncRefsOnce` restarts whenever the seed set changes — i.e. after every fetch that brings commits, every commit, every F5, checkout, tag push… | Select a commit half-way down, fetch: grid blanks, scrolls to top, selection lost, details pane empties. In a big repo the walk takes seconds each time. | Keep the previous `rows` visible (dimmed or not) until page 0 of the new generation arrives; remember the selected **oid** across `startLog` and re-select it via `revealOid` once rows load (already exists). | |
| M4 | `src/screens/RepoWindow/CommitPanel/FilesColumn.tsx:31` | **Stage all** includes conflicted entries. `index.add_path` on an unmerged path = "mark resolved", so one click marks every conflict resolved with markers still in the files. | Merge with 3 conflicts, click Stage all without opening any of them: conflicts vanish from the list, `Commit merge` becomes available, markers get committed. The `recreate_conflict` recovery exists but only after the user notices. | Exclude `conflicted` entries from the Stage-all path list (button title: "conflicted files are staged one by one"); or confirm when the selection includes conflicts. | |
| M5 | `src/screens/RepoWindow/Toolbar.tsx:49`, `src/store/repoStore.ts:169` | Search box `text` is component state seeded once from the store; `openRepo` restarts the walk with `filter: {}` but the Toolbar stays mounted across a switch, so the input still shows the old query. The debounce effect only fires on `text` change. | Type `fix`, switch repo: box says `fix`, grid is unfiltered; clearing the box re-runs nothing (`null === null`), typing another char filters again. | Reset `text` when `repo.id` changes (`useEffect` on `repo?.id`), or make the store `filter.text` the source of truth and drop the local copy. | |

## L — low / edge

| # | Where | What | Scenario | Proposed fix | Decision |
|---|---|---|---|---|---|
| L1 | `crates/git-core/src/refs.rs:514,518` | `create_tag` tags `object` unpeeled: when `target` names an annotated tag, the new tag points at the tag object, not the commit; `Tag.oid` returned is the peeled one, so the UI shows it on the commit while git has a tag-of-tag. | Create tag with target `v0.1.0` (annotated). | Tag the peeled commit object (`object.peel(Commit)`), which is what `git tag x v0.1.0` does. | |
| L2 | `crates/git-core/src/watch.rs:134-138` | Linked worktrees: `git_dir` is `.git/worktrees/<name>`; refs, `packed-refs`, `objects` live in the common dir, which is not watched. | Open a `git worktree add` checkout; fetch or branch changes made from another window/terminal never refresh the sidebar. | Also watch `repo.commondir()` (non-recursive is enough for `refs/`, `packed-refs`) when it differs from `git_dir`. | |
| L3 | `crates/git-core/src/conflict.rs:108-114` | `open_merge_editor` writes LOCAL/REMOTE/BASE copies under `%TEMP%/t4-git-ui-merge/<hash>` and never deletes them. | Every conflict resolved via VS Code leaves three files behind forever. | Delete the dir on `close_repo`/app exit, or at the next `open_merge_editor`; or accept as OS temp. | |
| L4 | `crates/git-core/src/patch.rs:173-178` | Patches built for hunk/line staging carry no `old mode`/`new mode` lines; libgit2 diff mode changes are dropped. | File gains the exec bit and edits a line; staging one hunk stages the content only, the mode change stays unstaged and is shown nowhere (status shows `typechange`/`modified` for the whole file). | Emit `old mode`/`new mode` headers when the delta's modes differ; or stage mode changes only via whole-file stage (document). Unix-only in practice. | |
| L5 | `crates/git-core/src/stage.rs:26` | `Index::add_path` bypasses `.gitignore` (git2 semantics). The UI never lists ignored files, so this is unreachable today, but any future "stage path" caller (drag-drop, CLI arg) would force-add. | — | Guard with `repo.status_should_ignore(rel)` → `Refused`. Low priority. | |
| L6 | `crates/git-core/src/stage.rs:62` | Discarding an untracked file removes the file but leaves now-empty parent dirs. | Discard `new/dir/file.txt` → `new/dir/` stays (git wouldn't show it, but Explorer does). | After `remove_file`, walk up removing empty dirs until the workdir. | |
| L7 | `crates/git-core/src/cli/runner.rs:110` | `cmd_line = "git " + args.join(" ")`: args with spaces (paths, commit messages) show unquoted in the output dock and dialog previews. | `stash push -m "wip: two words"` shows as `git stash push -m wip: two words`. | Quote args containing whitespace/quotes (frontend `gitCmd` helper already does this for previews — reuse or mirror). | |
| L8 | `src-tauri/src/state.rs:14`, `src/screens/GitMissingScreen/GitMissingScreen.tsx:6` | `git_path` is an `RwLock<String>` that is never written; there is no `set_git_path` command, so the GitMissing screen can only say "fix PATH and retry". | Git installed outside PATH (common on Windows with portable git) → app unusable until PATH edited. | Part of the Settings screen (already in the next-plan list); a minimal "Locate git…" file picker + `set_git_path` command would unblock it before Settings exists. | |
| L9 | `crates/git-core/src/log/walker.rs:101-103` | Log search matches summary / author name / email only — not the SHA. | Paste a short SHA into the search: no hit; the sidebar `revealOid` path is the only way. | Also match `oid.starts_with(t)` when the query is hex ≥ 4 chars. | |
| L10 | `crates/git-core/src/refs.rs:198,256,288` | Branches/tags sort by plain byte order: `v0.10.0` < `v0.2.0`, `Feature` < `abc`. | Tag list order looks wrong past 9 releases. | Natural / case-insensitive compare (git's `versionsort` for tags; `strcasecmp` for branches), or sort on the frontend with `localeCompare(…, { numeric: true })`. | |
| L11 | `src/store/repoStore.ts:243` | `revealOid` walks pages sequentially from 0 until the oid is found. | Reveal a tag near the bottom of a 100 k-commit log: up to 200 sequential page fetches. | Backend `find_row(generation, oid) → index` (the cache holds all rows), then fetch only that page. | |
| L12 | `src/store/recentsStore.ts:60,88,104,109` | Every `kvSet` is `void`ed with no `.catch` → unhandled rejection if the store plugin fails (read-only profile, disk full). Not fatal but noisy, and the recents silently stop persisting. | — | One `persist(key, value)` helper that catches and toasts once. | |
| L13 | `src/screens/RepoWindow/DiffViewer/DiffViewer.tsx:210`, `src/api/types.ts:270` | Truncation banner hard-codes "20 000"; the cap lives in Rust `DiffOptions::default`. | Change the cap in Rust, banner lies. | Return `maxLines` in `FileDiff` (or export the constant through `types.ts`) and print it. | |
| L14 | `crates/git-core/src/repo.rs:117` | `init_repo` refuses only when `path` itself is a repo (`Repository::open`, no discovery): init inside a subdirectory of an existing repo creates a nested repo. Same as `git init`, so arguably correct — but the app has no use for nested repos. | Pick `repo/src` in Init → nested `.git`. | Use `Repository::discover` and refuse (or ask) when the path is already inside a repo. | |
| L15 | `src/screens/RepoWindow/Sidebar.tsx`, `RevisionGrid` context menus | Menus toast "Operation in progress" rather than disabling items while an op runs (noted during smoke test). | — | Same `disabled={running}` + BUSY title the toolbar uses. | |

## P — performance (no bug; matters on big repos)

| # | Where | What | Proposed fix | Decision |
|---|---|---|---|---|
| P1 | `crates/git-core/src/refs.rs:180` | `snapshot` runs `graph_ahead_behind` per local branch with an upstream — one merge-base walk each, on every refs refresh (every watcher `refs` event). Hundreds of branches × deep history = visible stall under the git2 mutex. | Cache `(oid, upstream_oid) → (ahead, behind)` in `RepoHandle`, invalidated when either oid changes. | |
| P2 | `crates/git-core/src/diff.rs:243` | `changed_files` loads a full `Patch` per delta just for `line_stats`. A 300-file commit builds 300 patches; a 5 000-file one is slow. | `diff.stats()` gives per-file insert/delete via `DiffStats`… only totals. Alternative: `Diff::foreach` with a line callback counting `+`/`-` (no patch allocation), or compute stats lazily per visible row. | |
| P3 | `crates/git-core/src/diff.rs:283` | `file_diff` rebuilds the whole diff (all deltas, untracked content, rename detection) per file click. Comment explains why (rename pairing). | Restrict with a pathspec of `{path, old_path}` when the caller already knows `old_path` from `changed_files` (it does). | |
| P4 | `crates/git-core/src/watch.rs` (`RecommendedCache`) | Debouncer's file-id cache walks the entire workdir at start (`start_watcher` comment). Large monorepo → seconds before the watcher is live; runs on the blocking pool so the UI isn't blocked, but events during that window are lost. | `NoCache` (notify-debouncer-full supports it; loses rename pairing, which we don't use) — measure first. | |
| P5 | `src/screens/RepoWindow/OutputDock.tsx:95` | Renders every line of every op (≤ 50 ops × 5 000 lines) as DOM nodes, no virtualization; `scrollTop = scrollHeight` on each row-count change. | `@tanstack/react-virtual` as in the grid; only if a real op ever hits the caps. | |

## H — hygiene

| # | Where | What | Proposed fix | Decision |
|---|---|---|---|---|
| H1 | `.github/workflows/ci.yml:44,46` | `npx tsc --noEmit` then `npm run build` (which runs `tsc && vite build`): type-check runs twice on every matrix leg. | Drop the explicit `tsc` step, or make `build` skip it in CI. | |
| H2 | `src-tauri/` | No tests at all in the Tauri crate (`AppState`, `mutate` suppression, `close_repo` cleanup, error mapping). CI only runs `cargo test -p git-core`. | A handful of unit tests on `state.rs` / `error.rs`; not urgent. | |
| H3 | Working copy | 7 tracked files (`README.md`, `tsconfig.json`, `vite.config.ts`, `src-tauri/build.rs`, …) have CRLF in the working copy; `.gitattributes` `text=auto eol=lf` normalises them in the index, so git warns on every commit. Harmless. | `git add --renormalize .` is a no-op here; the fix is editor-side (`.editorconfig` `end_of_line = lf` — check it's honoured). | |
| H4 | `README.md:79`, plan › Known gaps | "Next" list and Known-gaps list overlap and will drift; the next plan should become the single source. | Fold into the next plan document when it's written. | |

## Verified OK (looked for, found no problem)

- Commit-panel diff options match the stageable diff the backend uses (context 3, whitespace shown, unified), so `stage_patch` applies what the user saw.
- `DeleteTag` remote-first ordering (remote deletion fails → local tag kept).
- `src/api/types.ts` matches every Rust serde shape (`rename_all = "camelCase"`, enums as lowercase strings).
- Theme tokens cached; no flash on launch; CSP + capabilities cover every plugin call used.
- Watcher suppression + one synthetic `repo://changed` after every mutation, including on error.
- Log cache generations: stale pages are dropped on the frontend (`seq`/`generation` checks in `fetchPage`, `onProgress`).
- CLI runner: `GIT_TERMINAL_PROMPT=0`, null stdin, kill-on-cancel via job object (Windows) / process group (unix).

## Deferred by decision (already on the next-plan list — not re-triaged here)

Hunk/line Discard (needs backend), Settings screen (git path, theme), file-row context menu,
per-file Ours/Theirs, clean-Win11 installer test, Linux/macOS rendering, macOS signing,
UI-vs-canvas review pass, "push after create" checkbox in Create tag.
