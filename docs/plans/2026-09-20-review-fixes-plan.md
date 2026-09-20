# 2026-09-20 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the ten findings of the 2026-09-20 codebase review — four that lose or corrupt file content first.

**Architecture:** Ten independent fixes, one commit each, smallest change at the point every caller routes through. Where the honest answer is "this selection cannot be expressed as a patch" the fix is a refusal with a reason, not a cleverer patch builder. One new dependency (`tauri-plugin-single-instance`); everything else is a few lines in place.

**Tech Stack:** Rust (`crates/git-core`: git2 + the git CLI; `src-tauri`: Tauri 2), TypeScript / React / zustand, vitest, cargo test.

**Spec:** `docs/plans/2026-09-20-codebase-review-findings.md` — ids F1–F10 below are its ids.

## Decisions — all five made 2026-09-20

Walked one by one with the user; each task below is written for the decided option.

| # | Task | Question | Recommended (what the task does) | Alternative |
|---|---|---|---|---|
| D1 | 2 (F2) | A line selection that cannot be a valid patch beside a missing final newline | **Decided 2026-09-20: refuse** with a reason ("select the lines around it, or the hunk") | Auto-include the paired `-b` / `+b` lines — more code, and it stages lines the user did not pick |
| D2 | 3 (F3) | Non-UTF-8 file, hunk / line staging | **Decided 2026-09-20: refuse** on the backend ("stage the whole file"); the buttons stay enabled and the refusal is a toast | Also send a `lossy` flag to the frontend and disable the hunk buttons — a types + DiffViewer change |
| D3 | 4 (F9) | What proves the diff is the one the user saw | **Decided 2026-09-20: a content print per touched hunk** (FNV-1a over header + lines, computed on both sides of the IPC, one shared test vector) — also catches a same-shape edit inside the hunk | ~~Hunk header only~~ — misses a same-shape edit, and for Discard that is still lost lines |
| D4 | 8 (F7) | Second launch | **Decided 2026-09-20: single instance, and the second launch opens another window** of the running app, on the start screen | ~~Only focus the running window~~ · ~~keep multi-process and only guard the temp wipe~~ |
| D5 | 5 (F4) | Same-named upstream | **Decided 2026-09-20:** refspec stays the bare `main` (previews and tests unchanged); only a differing name becomes `dev:develop` | Always `refs/heads/dev:refs/heads/develop` — also removes the tag-name ambiguity, changes every push preview |

## Global Constraints

- Nothing is pushed. Commit per task; pushing waits for the user's word.
- Commit subjects follow the log's style: `fix: <a sentence about what the app now does>`. No backticks inside a double-quoted `-m` — use `git commit -F -` with a quoted heredoc when a message needs them.
- Run npm gates from the upper-case drive path (`F:/src/_ pet projects/t4-git-ui`); lower-case `f:/` fails every vitest file at collection.
- Bash on Windows: no `cd` in a compound command that writes; use `git -C`, `npm --prefix`, `cargo --manifest-path` or absolute paths.
- Full gates (Task 11, and before any commit that touches both sides): `cargo fmt --all --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, `cargo test --workspace --locked`, `npm test -- --run`, `npm run build`.
- `#[cfg(unix)]` code is invisible to Windows clippy (open-items §H): Task 7 touches none; if a task adds any, it needs a CI run before a tag.
- `src/screens/RepoWindow/dialogs/gitArgs.ts` mirrors `crates/git-core/src/cli/ops.rs`; a flag changed in one is changed in the other.
- Match the surrounding comment density and voice: comments say *why*.

## File map

| File | Tasks | Change |
|---|---|---|
| `crates/git-core/src/stage.rs` | 1 | literal discard, hand-rolled literal unstage, `--literal-pathspecs` in two arg builders |
| `crates/git-core/src/log/history.rs`, `crates/git-core/src/cli/ops.rs` (`submodule_update`) | 1 | `--literal-pathspecs` |
| `crates/git-core/src/patch.rs` | 2, 3, 4 | no-newline rule, lossy refusal, `hunk_print` + `check_seen` |
| `src/lib/hunkPrint.ts` (+ test), `src/README.md` | 4 | the frontend twin of `hunk_print` |
| `crates/git-core/tests/patch.rs` | 2, 3 | end-to-end refusals |
| `crates/git-core/src/diff.rs`, `tests/serde.rs` | 3 | `FileDiff::lossy` (`#[serde(skip)]`) |
| `src-tauri/src/commands/stage.rs` | 4, 6 | `seen` param ×4 commands; `OpOwner` at 5 call sites |
| `src/api/ipc.ts`, `src/store/commitStore.ts` (+ tests) | 4 | `seen` on the wire |
| `src/screens/RepoWindow/dialogs/OpsDialogs.tsx` (+ `dialogs.test.tsx`, `gitArgs.test.ts`) | 5, 9 | push refspec / toast; squash vs no-ff |
| `src-tauri/src/commands/ops.rs` | 6 | `OpOwner`, `emit_to` |
| `src/api/events.ts` (+ `events.test.ts`) | 6 | op events listened to per window |
| `crates/git-core/src/cli/runner.rs` | 7 | wait for git, grace, stop the pumps |
| `src-tauri/Cargo.toml`, `Cargo.lock`, `src-tauri/src/lib.rs`, `src-tauri/src/commands/window.rs` | 8 | single-instance plugin; `spawn` split out of `spawn_window` |
| `src-tauri/src/state.rs`, `src-tauri/src/commands/update.rs` | 10 | `op_running`, refusal |
| `docs/smoke/smoke-test-post-v1.md`, `docs/plans/open-items.md` | 11 | group BD, §N |

---

### Task 1: Paths are paths, not glob pathspecs (F1)

**Files:**
- Modify: `crates/git-core/src/stage.rs:143-163` (`unstage_paths`), `:203-207` (`discard_paths`), `:221-229` (`recreate_conflict_args`), `:310-318` (`checkout_side_args`), tests at `:680-690`
- Modify: `crates/git-core/src/log/history.rs:30-56` and its test `:173-207`
- Modify: `crates/git-core/src/cli/ops.rs:560-570` (`submodule_update`) and its test `:1135-1145`

**Interfaces:**
- Consumes: `with_index(index, f)` (`stage.rs:26`), `TempRepo` (`test_util.rs`)
- Produces: no signature changes

- [ ] **Step 1: Write the failing tests** — in `stage.rs` `mod tests`, after `discard_restores_from_index_and_keeps_staged`:

```rust
    /// `[id]` is a character class to a pathspec: without the literal switch a
    /// discard of `[id].txt` also restores `i.txt`, and those edits are gone.
    #[test]
    fn discard_takes_a_bracketed_name_literally() {
        let t = TempRepo::new();
        t.set_config("core.autocrlf", "false");
        t.commit(&[("[id].txt", "v0\n"), ("i.txt", "v0\n")], "base");
        t.write("[id].txt", "v1\n");
        t.write("i.txt", "keep me\n");

        let got = discard_paths(&t.repo, &["[id].txt"]).unwrap();
        assert_eq!(got, vec!["[id].txt"]);
        assert_eq!(
            std::fs::read_to_string(t.path().join("[id].txt")).unwrap(),
            "v0\n"
        );
        assert_eq!(
            std::fs::read_to_string(t.path().join("i.txt")).unwrap(),
            "keep me\n",
            "the sibling the class matches is not the file that was discarded"
        );
    }

    #[test]
    fn unstage_takes_a_bracketed_name_literally() {
        let t = TempRepo::new();
        t.commit(&[("[id].txt", "v0\n"), ("i.txt", "v0\n")], "base");
        t.write("[id].txt", "v1\n");
        t.write("i.txt", "v1\n");
        t.stage(&["[id].txt", "i.txt"]);

        unstage_paths(&t.repo, &["[id].txt"]).unwrap();
        let e = entry(&t, "[id].txt").unwrap();
        assert_eq!((e.index, e.workdir), (None, Some(FileStatus::Modified)));
        let e = entry(&t, "i.txt").unwrap();
        assert_eq!((e.index, e.workdir), (Some(FileStatus::Modified), None));
    }

    /// A staged deletion and a staged new file, the two shapes `reset_default`
    /// handled that a plain "copy the HEAD entry" could miss.
    #[test]
    fn unstage_brings_back_a_deleted_entry_and_drops_an_added_one() {
        let t = TempRepo::new();
        t.commit(&[("gone.txt", "g\n")], "base");
        // `remove` takes it off the disk and out of the index: a staged deletion.
        t.remove("gone.txt");
        t.write("new.txt", "n\n");
        t.stage(&["new.txt"]);

        unstage_paths(&t.repo, &["gone.txt", "new.txt"]).unwrap();
        assert_eq!(index_content(&t, "gone.txt").as_deref(), Some("g\n"));
        assert!(index_content(&t, "new.txt").is_none());
    }

    /// A moved submodule pointer is an index entry like any other to `reset_default`;
    /// the hand-rolled reset has to put the gitlink back with its mode and the old commit.
    #[test]
    fn unstage_puts_a_moved_submodule_pointer_back() {
        let src = TempRepo::new();
        src.commit(&[("s.txt", "1\n")], "s1");
        let t = TempRepo::new();
        t.commit(&[("f.txt", "v0\n")], "base");
        t.add_submodule("sub", &src);
        let pointer = |t: &TempRepo| t.repo.index().unwrap().get_path(Path::new("sub"), 0).unwrap();
        let before = pointer(&t);
        assert_eq!(before.mode, 0o160000);

        // Move the submodule's HEAD, then stage the new pointer in the superproject.
        let sub = Repository::open(t.path().join("sub")).unwrap();
        let head = sub.head().unwrap().peel_to_commit().unwrap();
        let sig = git2::Signature::now("t", "t@example.com").unwrap();
        sub.commit(Some("HEAD"), &sig, &sig, "s2", &head.tree().unwrap(), &[&head])
            .unwrap();
        t.stage(&["sub"]);
        assert_ne!(pointer(&t).id, before.id);

        unstage_paths(&t.repo, &["sub"]).unwrap();
        let after = pointer(&t);
        assert_eq!((after.id, after.mode), (before.id, 0o160000));
    }
```

(`t.stage` is `Index::add_path`, which stages a submodule directory as its gitlink. If libgit2 refuses it there, stage the pointer with `sub`'s own handle instead: `t.repo.find_submodule("sub").unwrap().add_to_index(true).unwrap()`.)

- [ ] **Step 2: Run them** — cargo takes one name filter per run:

Run: `cargo test -p git-core --lib bracketed_name`
Expected: both tests FAIL on the `i.txt` assertion.
Run: `cargo test -p git-core --lib unstage_brings_back` and `cargo test -p git-core --lib moved_submodule_pointer`
Expected: both PASS — they pin what `reset_default` does today, for Step 3 to keep.
**If a `bracketed_name` test passes before any change**, libgit2 already matched literally on that path: keep the test, skip the matching half of Step 3, and say so in the commit body.

- [ ] **Step 3: Implement**

`discard_paths` — one line, the switch `diff.rs:203` already uses:

```rust
        let mut cb = CheckoutBuilder::new();
        // Paths, not pathspecs: `[id].tsx` is also the class `[id]`, and would
        // force-restore a modified `i.tsx` along with it.
        cb.force().disable_pathspec_match(true);
```

`unstage_paths` — `reset_default` has no literal switch, so the reset is done by hand (add `IndexEntry, IndexTime` to the `git2` import):

```rust
/// Resets the index entries of `paths` to HEAD (removes them when HEAD is unborn).
pub fn unstage_paths(repo: &Repository, paths: &[&str]) -> Result<(), GitError> {
    let mut index = repo.index().map_err(map_git2)?;
    // The CLI may have written this index a moment ago (a merge, `update-index`,
    // `apply --cached`), and libgit2 hands back the copy it last read: writing
    // that back would undo git's write.
    index.read(false).map_err(map_git2)?;
    let tree = match repo.head() {
        Ok(head) => Some(head.peel_to_tree().map_err(map_git2)?),
        Err(e) if e.code() == ErrorCode::UnbornBranch => None,
        Err(e) => return Err(map_git2(e)),
    };
    // Not `reset_default`: it takes pathspecs and cannot be told to read them
    // literally, so unstaging `[id].tsx` unstaged `i.tsx` with it.
    with_index(&mut index, |index| {
        for p in paths {
            let rel = Path::new(p);
            // Every stage goes, so an unmerged path is reset as well.
            match index.remove_path(rel) {
                Ok(()) => {}
                Err(e) if e.code() == ErrorCode::NotFound => {}
                Err(e) => return Err(map_git2(e)),
            }
            let Some(entry) = tree.as_ref().and_then(|t| t.get_path(rel).ok()) else {
                continue;
            };
            // Zeroed stat fields: the next status rehashes the file, as it does
            // after `git reset`.
            index
                .add(&IndexEntry {
                    ctime: IndexTime::new(0, 0),
                    mtime: IndexTime::new(0, 0),
                    dev: 0,
                    ino: 0,
                    mode: entry.filemode() as u32,
                    uid: 0,
                    gid: 0,
                    file_size: 0,
                    id: entry.id(),
                    flags: 0,
                    flags_extended: 0,
                    path: p.as_bytes().to_vec(),
                })
                .map_err(map_git2)?;
        }
        Ok(())
    })
}
```

The two checkout builders — git's global switch leads the argv:

```rust
pub fn recreate_conflict_args(paths: &[&str]) -> Vec<String> {
    let mut args = vec![
        // Paths from the status list, not patterns: see `discard_paths`.
        "--literal-pathspecs".to_string(),
        "checkout".to_string(),
        "--merge".to_string(),
        "--".to_string(),
    ];
```

```rust
    let mut args = vec![
        "--literal-pathspecs".to_string(),
        "checkout".to_string(),
        flag.to_string(),
        "--".to_string(),
    ];
```

`history_args` — insert after the `-c` pair, and update its doc comment's first line to name the switch:

```rust
    let mut a: Vec<String> = [
        "-c",
        "core.quotePath=false",
        // The path is one file's name: `[id].tsx` must not also follow `i.tsx`.
        "--literal-pathspecs",
        "log",
```

`cli/ops.rs::submodule_update` (`:563`) — the path after `--` is a pathspec too. The switch is git's own global option, so it works whether `git submodule` is the builtin or still the shell script (the script's children inherit it as `GIT_LITERAL_PATHSPECS`). Only when a path is named:

```rust
pub fn submodule_update(path: Option<&str>) -> Vec<String> {
    let mut a = match path {
        // A submodule's path, not a pattern: see `stage::discard_paths`.
        Some(_) => args(["--literal-pathspecs", "submodule", "update", "--init", "--recursive", "--progress"]),
        None => args(["submodule", "update", "--init", "--recursive", "--progress"]),
    };
    if let Some(p) = path {
        a.push("--".into());
        a.push(p.into());
    }
    a
}
```

Add a sentence to its doc comment naming the switch. No frontend preview mirrors this builder (`gitArgs.ts` has no submodule entry), so nothing changes there.

- [ ] **Step 4: Update the pinned argv tests**

`cli/ops.rs`: the test that pins `submodule_update(Some(..))` (grep `submodule_update(` in its `mod tests`) gains the leading `"--literal-pathspecs"`; the `None` expectation stays. `stage.rs::checkout_side_args_carry_gits_own_flag`: both expectations gain a leading `"--literal-pathspecs"`. `history.rs::args_carry_the_spec…`: add `"--literal-pathspecs",` after `"core.quotePath=false",` in the first expectation and change both `[7..]` slices to `[8..]`.

- [ ] **Step 5: Run**

Run: `cargo test -p git-core`
Expected: PASS, including `a_locked_index_leaves_the_path_staged` (rollback now comes from `with_index`), `unstage_on_unborn_head_removes_entries`, `tests/ops.rs` (the `checkout --merge` round trip at `:814`) and the file-history integration tests. (Checked against git 2.55 when this plan was reviewed: `git --literal-pathspecs log --follow … -- '[id].txt'` and `git --literal-pathspecs checkout --merge -- '[id].txt'` both run and name only that file, where the same `log` without the switch also lists `i.txt`'s commits. `--literal-pathspecs` has been a global option since git 1.8, well under the 2.24 floor.)

- [ ] **Step 6: Commit**

```bash
git -C "F:/src/_ pet projects/t4-git-ui" add crates/git-core/src/stage.rs crates/git-core/src/log/history.rs crates/git-core/src/cli/ops.rs
git -C "F:/src/_ pet projects/t4-git-ui" commit -m "fix: A file name with brackets in it is a name, not a pattern — discard, unstage, conflict checkout, file history and submodule update no longer reach its siblings"
```

---

### Task 2: A selection beside a missing final newline is refused, not glued (F2)

**Files:**
- Modify: `crates/git-core/src/patch.rs:73-102` (`transform`)
- Test: `crates/git-core/src/patch.rs` `mod tests`, `crates/git-core/tests/patch.rs`

**Interfaces:**
- Produces: `build_patch` can now return `GitError::Refused(..)` for a line selection; callers already surface `Refused` as a toast.

- [ ] **Step 1: Write the failing tests** — in `patch.rs` `mod tests`:

```rust
    /// Index `a\nb` (no newline), working tree `a\nb\nc\n`: the diff is ` a`,
    /// `-b\`, `+b`, `+c`. Any selection that leaves `b\` as context with a `+`
    /// after it appends to that line — git applies it and the index reads `bc`.
    #[test]
    fn a_selection_that_would_follow_a_no_newline_line_is_refused() {
        let t = TempRepo::new();
        t.set_config("core.autocrlf", "false");
        t.commit(&[("f.txt", "a\nb")], "base");
        t.write("f.txt", "a\nb\nc\n");
        let d = unstaged(&t, "f.txt");
        assert_eq!(change_lines(&d, 0), vec![1, 2, 3]);

        for lines in [vec![(0, 3)], vec![(0, 2)], vec![(0, 2), (0, 3)]] {
            assert!(
                matches!(
                    build_patch(&d, &PatchSelection::Lines(lines.clone()), false, true),
                    Err(GitError::Refused(_))
                ),
                "{lines:?}"
            );
        }
        // The pair that carries the newline change is a valid patch, and so is the hunk.
        let p = build_patch(&d, &PatchSelection::Lines(vec![(0, 1), (0, 2)]), false, true).unwrap();
        assert!(p.ends_with("-b\n\\ No newline at end of file\n+b\n"), "{p}");
        build_patch(&d, &PatchSelection::Hunks(vec![0]), false, true).unwrap();
    }

    /// The mirror: unstaging only `-b\` would leave it in the middle of the old side.
    #[test]
    fn the_reverse_direction_refuses_the_same_shape() {
        let t = TempRepo::new();
        t.set_config("core.autocrlf", "false");
        t.commit(&[("f.txt", "a\nb")], "base");
        t.write("f.txt", "a\nb\nc\n");
        t.stage(&["f.txt"]);
        let d = staged(&t, "f.txt");
        assert!(matches!(
            build_patch(&d, &PatchSelection::Lines(vec![(0, 1)]), true, true),
            Err(GitError::Refused(_))
        ));
        // Unstaging `+c` alone touches no no-newline line.
        build_patch(&d, &PatchSelection::Lines(vec![(0, 3)]), true, true).unwrap();
    }
```

And end to end in `tests/patch.rs`, after `crlf_and_no_newline_round_trip`:

```rust
#[tokio::test]
async fn the_newline_pair_stages_cleanly_and_the_index_gains_the_newline() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.set_config("core.autocrlf", "false");
    t.commit(&[("f.txt", "a\nb")], "base");
    t.write("f.txt", "a\nb\nc\n");
    let d = diff(&t, DiffTarget::Unstaged, "f.txt");
    let p = build_patch(&d, &PatchSelection::Lines(vec![(0, 1), (0, 2)]), false, true).unwrap();
    apply(&t, &p, false).await;
    assert_eq!(index_content(&t, "f.txt").unwrap(), "a\nb\n");
}
```

- [ ] **Step 2: Run** — `cargo test -p git-core no_newline_line_is_refused` and `cargo test -p git-core reverse_direction_refuses`
Expected: both FAIL (`Ok(_)` where `Refused` is expected). The end-to-end one PASSES already; it guards the allowed path.

- [ ] **Step 3: Implement** — in `transform`, between the loop and the `if !changed` check:

```rust
    // `\ No newline at end of file` is only true of the LAST line of a side. A
    // `-` line demoted to context is on both sides, so a `+` after it would be
    // appended to it: git applies that patch and the blob reads `bc`.
    for (i, l) in out.iter().enumerate().filter(|(_, l)| l.no_newline) {
        let (on_old, on_new) = (l.kind != DiffLineKind::Add, l.kind != DiffLineKind::Del);
        let follows = out[i + 1..].iter().any(|r| {
            (on_old && r.kind != DiffLineKind::Add) || (on_new && r.kind != DiffLineKind::Del)
        });
        if follows {
            return Err(GitError::Refused(
                "the file's missing final newline is part of this change: select the lines around it too, or the whole hunk".into(),
            ));
        }
    }
```

- [ ] **Step 4: Run** — `cargo test -p git-core patch`
Expected: PASS, all of `src/patch.rs` and `tests/patch.rs`.

- [ ] **Step 5: Commit**

```bash
git -C "F:/src/_ pet projects/t4-git-ui" add crates/git-core/src/patch.rs crates/git-core/tests/patch.rs
git -C "F:/src/_ pet projects/t4-git-ui" commit -m "fix: A line selection that would glue two lines at a missing final newline is refused with the reason"
```

---

### Task 3: Hunk staging refuses a file that is not UTF-8 (F3)

**Files:**
- Modify: `crates/git-core/src/diff.rs:112-133` (struct), `:414-428` and `:430-490` (`file_diff_from_patch`)
- Modify: `crates/git-core/src/patch.rs:116-118` (`build_patch`)
- Modify: `crates/git-core/tests/serde.rs:202` (add `lossy: false` to the literal)
- Test: `crates/git-core/tests/patch.rs`

**Interfaces:**
- Produces: `FileDiff::lossy: bool`, `#[serde(skip)]` — never on the wire, so `src/api/types.ts` does not change.

- [ ] **Step 1: Write the failing test** — `tests/patch.rs`:

```rust
/// The diff's text is a lossy decode, fine to look at and wrong to stage from:
/// `caf\xE9` would reach the index as `caf\xEF\xBF\xBD`.
#[test]
fn a_file_that_is_not_utf8_is_refused_for_hunk_staging() {
    let t = TempRepo::new();
    t.set_config("core.autocrlf", "false");
    t.commit(&[("f.txt", "a\nb\nc\n")], "base");
    t.write("f.txt", b"a\ncaf\xE9\nc\n");
    let d = diff(&t, DiffTarget::Unstaged, "f.txt");
    assert!(d.lossy);
    let err = build_patch(&d, &PatchSelection::Hunks(vec![0]), false, true).unwrap_err();
    assert!(matches!(&err, GitError::Refused(m) if m.contains("UTF-8")), "{err:?}");

    t.write("f.txt", "a\ncafé\nc\n");
    let d = diff(&t, DiffTarget::Unstaged, "f.txt");
    assert!(!d.lossy);
    build_patch(&d, &PatchSelection::Hunks(vec![0]), false, true).unwrap();
}
```

- [ ] **Step 2: Run** — `cargo test -p git-core --test patch not_utf8`
Expected: FAIL to compile (`no field lossy`).

- [ ] **Step 3: Implement**

`diff.rs`, struct (after `new_mode`):

```rust
    /// Some line was not UTF-8, so `text` holds U+FFFD where the file holds
    /// other bytes: fine to show, wrong to build a patch from. Backend only.
    #[serde(skip)]
    pub lossy: bool,
```

`file_diff_from_patch`: `lossy: false` in the binary early return; in the main path declare `let mut lossy = false;` beside `truncated`, replace the decode, and add `lossy,` to the final literal:

```rust
            let text = String::from_utf8_lossy(line.content());
            lossy |= matches!(text, std::borrow::Cow::Owned(_));
            let mut text = text.into_owned();
```

`patch.rs::build_patch`, right after the `binary || truncated` check:

```rust
    if diff.lossy {
        return Err(GitError::Refused(format!(
            "{} is not UTF-8, so a part of it cannot be applied faithfully; stage or discard the whole file",
            diff.path
        )));
    }
```

`tests/serde.rs:202`: add `lossy: false,` to the `FileDiff { .. }` literal. The JSON it asserts does not change.

- [ ] **Step 4: Run** — `cargo test -p git-core`
Expected: PASS (serde snapshot untouched).

- [ ] **Step 5: Commit**

```bash
git -C "F:/src/_ pet projects/t4-git-ui" add crates/git-core/src/diff.rs crates/git-core/src/patch.rs crates/git-core/tests/patch.rs crates/git-core/tests/serde.rs
git -C "F:/src/_ pet projects/t4-git-ui" commit -m "fix: Hunk and line staging refuse a file that is not UTF-8 instead of staging replacement characters"
```

---

### Task 4: A hunk action names the hunk it saw (F9)

**Files:**
- Modify: `crates/git-core/src/patch.rs` (new `hunk_print`, `check_seen` + tests)
- Create: `src/lib/hunkPrint.ts`, `src/lib/hunkPrint.test.ts`; Modify: `src/README.md` (the `src/lib` list)
- Modify: `src-tauri/src/commands/stage.rs:338-507` (`apply_selection` + the four commands)
- Modify: `src/api/ipc.ts:243-256`, `src/store/commitStore.ts:429-461`
- Test: `src/store/commitStore.test.ts`, `src/screens/RepoWindow/CommitPanel/CommitPanel.test.tsx:409`

**Interfaces:**
- Produces (Rust): `pub fn hunk_print(hunk: &Hunk, lines: usize) -> String` and `pub fn check_seen(diff: &FileDiff, seen: &[(usize, usize, String)]) -> Result<(), GitError>`
- Produces (TS): `src/lib/hunkPrint.ts` — `hunkPrint(hunk: Hunk): string`, the same function as `hunk_print(hunk, hunk.lines.len())`
- Produces (IPC): the four commands take `seen: Vec<(usize, usize, String)>` — JSON `[hunkIndex, linesShown, print][]`
- Produces (TS): `stageHunks(id, path, hunks, reverse, context, seen, oldPath?)`, `stageLines(id, path, lines, reverse, context, seen, oldPath?)`, `discardHunks(id, path, hunks, context, seen, oldPath?)`, `discardLines(id, path, lines, context, seen, oldPath?)`

**The print.** FNV-1a, 32-bit, over UTF-8 bytes: the header and `\n`, then per line its sign (` `, `+`, `-`), its text, a `\` when `no_newline`, and `\n`. It is a change detector, not a security boundary, so 32 bits is enough. It exists twice — Rust and TypeScript — and **one shared vector pinned in both test suites keeps them in step**: header `@@ -1,2 +1,4 @@ fn x()`, lines ` a`, `-b` (no newline), `+b`, `+café\r` → `6b34fb19`; the first two lines only → `53a53432`. `linesShown` exists because the shown diff can be cut at `max_lines` while the rebuild never is: the backend prints the first `linesShown` lines of its hunk, so acting on a cut hunk still works.

- [ ] **Step 1: Failing Rust tests** — `patch.rs` `mod tests` (add `DiffLine` to the `crate::diff` import of the test module):

```rust
    fn line(kind: DiffLineKind, text: &str, no_newline: bool) -> DiffLine {
        DiffLine { kind, old_no: None, new_no: None, text: text.into(), no_newline }
    }

    /// The vector `src/lib/hunkPrint.test.ts` pins too: the two implementations
    /// have to agree, or every hunk action is refused.
    #[test]
    fn hunk_print_matches_the_shared_vector() {
        let hunk = Hunk {
            header: "@@ -1,2 +1,4 @@ fn x()".into(),
            old_start: 1,
            old_lines: 2,
            new_start: 1,
            new_lines: 4,
            lines: vec![
                line(DiffLineKind::Context, "a", false),
                line(DiffLineKind::Del, "b", true),
                line(DiffLineKind::Add, "b", false),
                line(DiffLineKind::Add, "café\r", false),
            ],
        };
        assert_eq!(hunk_print(&hunk, 4), "6b34fb19");
        assert_eq!(hunk_print(&hunk, 2), "53a53432", "a hunk shown cut at max_lines");
    }

    #[test]
    fn a_hunk_that_changed_since_it_was_shown_is_refused() {
        let t = TempRepo::new();
        t.commit(&[("f.txt", &numbered(30))], "base");
        let mut lines: Vec<String> = numbered(30).lines().map(String::from).collect();
        lines[19] = "LINE 20".into();
        t.write("f.txt", lines.join("\n") + "\n");
        let shown = unstaged(&t, "f.txt");
        let n = shown.hunks[0].lines.len();
        let seen = vec![(0, n, hunk_print(&shown.hunks[0], n))];
        check_seen(&shown, &seen).unwrap();
        // A hunk the panel showed cut short is still the same hunk.
        check_seen(&shown, &[(0, 2, hunk_print(&shown.hunks[0], 2))]).unwrap();

        // Same place, same size, other content: the header alone would pass this.
        lines[19] = "line TWENTY".into();
        t.write("f.txt", lines.join("\n") + "\n");
        let same_shape = unstaged(&t, "f.txt");
        assert_eq!(same_shape.hunks[0].header, shown.hunks[0].header);
        assert!(matches!(check_seen(&same_shape, &seen), Err(GitError::Refused(_))));

        // An edit above: the old hunk 0 is hunk 1 now.
        lines[1] = "LINE 2".into();
        t.write("f.txt", lines.join("\n") + "\n");
        assert!(check_seen(&unstaged(&t, "f.txt"), &seen).is_err());
        // An index or a line count past the end is the same refusal, not a panic.
        assert!(check_seen(&shown, &[(9, 0, String::new())]).is_err());
        assert!(check_seen(&shown, &[(0, n + 1, String::new())]).is_err());
    }
```

Run: `cargo test -p git-core hunk_print` and `cargo test -p git-core changed_since` → FAIL to compile (`hunk_print` / `check_seen` not found).

- [ ] **Step 2: Implement** — `patch.rs`, above `build_patch`:

```rust
/// A fingerprint of the first `lines` lines of `hunk`: FNV-1a (32-bit) over the
/// header and each line's sign, text and no-newline flag. The frontend computes
/// the same over the hunk it rendered (`src/lib/hunkPrint.ts`); a vector pinned
/// in both test suites keeps the two in step. A change detector, nothing more.
pub fn hunk_print(hunk: &Hunk, lines: usize) -> String {
    let mut h: u32 = 0x811c_9dc5;
    let mut eat = |s: &str| {
        for b in s.bytes() {
            h ^= u32::from(b);
            h = h.wrapping_mul(0x0100_0193);
        }
    };
    eat(&hunk.header);
    eat("\n");
    for l in hunk.lines.iter().take(lines) {
        eat(match l.kind {
            DiffLineKind::Context => " ",
            DiffLineKind::Add => "+",
            DiffLineKind::Del => "-",
        });
        eat(&l.text);
        if l.no_newline {
            eat("\\");
        }
        eat("\n");
    }
    format!("{h:08x}")
}

/// The indices of a selection come from a diff the frontend rendered; this one
/// was rebuilt when the button was pressed. `seen` is `(hunk index, lines shown,
/// print)` for every hunk the selection touches: a file rewritten in between
/// shifts or rewrites the hunks, and an index still in range would stage — or
/// discard — lines nobody looked at. `lines shown` because the rendered diff can
/// be cut at `max_lines` and this one never is.
pub fn check_seen(diff: &FileDiff, seen: &[(usize, usize, String)]) -> Result<(), GitError> {
    let same = seen.iter().all(|(h, lines, print)| {
        diff.hunks
            .get(*h)
            .is_some_and(|x| *lines <= x.lines.len() && &hunk_print(x, *lines) == print)
    });
    if same {
        Ok(())
    } else {
        Err(GitError::Refused(format!(
            "{} changed since this diff was shown; nothing was applied",
            diff.path
        )))
    }
}
```

Run: both tests → PASS.

- [ ] **Step 3: Backend wiring** — `src-tauri/src/commands/stage.rs`: `apply_selection` gains `seen: Vec<(usize, usize, String)>` (after `selection`); inside the `blocking` closure:

```rust
            let d = diff::file_diff(&h.git2.lock(), &target, &path, old_path.as_deref(), &opts)?;
            patch::check_seen(&d, &seen)?;
            Ok(patch::build_patch(&d, &selection, reverse, mode)?)
```

Each of `stage_hunks`, `stage_lines`, `discard_hunks`, `discard_lines` gains the parameter `seen: Vec<(usize, usize, String)>` (after `hunks` / `lines`) and passes it through. `discard_hunks` and `discard_lines` now have eight arguments: add `#[allow(clippy::too_many_arguments)]` as the stage pair has. Extend `apply_selection`'s doc comment with one sentence: *`seen` is how a rebuild that no longer matches the shown diff is caught — see `patch::check_seen`.*

Run: `cargo clippy --workspace --all-targets --locked -- -D warnings` → clean.

- [ ] **Step 4: Failing frontend tests**

Create `src/lib/hunkPrint.test.ts` — the shared vector:

```ts
import { describe, expect, it } from "vitest";
import type { Hunk } from "../api/types";
import { hunkPrint } from "./hunkPrint";

describe("hunkPrint", () => {
  // The same vector as `patch::tests::hunk_print_matches_the_shared_vector` in git-core: the two
  // implementations have to agree, or the backend refuses every hunk action.
  const line = (kind: "context" | "add" | "del", text: string, noNewline = false) => ({ kind, oldNo: null, newNo: null, text, noNewline });
  const hunk: Hunk = { header: "@@ -1,2 +1,4 @@ fn x()", oldStart: 1, oldLines: 2, newStart: 1, newLines: 4, lines: [line("context", "a"), line("del", "b", true), line("add", "b"), line("add", "café\r")] };

  it("matches the backend's print", () => {
    expect(hunkPrint(hunk)).toBe("6b34fb19");
    expect(hunkPrint({ ...hunk, lines: hunk.lines.slice(0, 2) })).toBe("53a53432");
  });
});
```

`commitStore.test.ts`, in `describe("commitStore mutations")`. Use the file's existing helpers (`sync`, `entry`, `mocked`, `REPO`); set the shown diff directly so the prints are known (import `hunkPrint` from `../lib/hunkPrint`):

```ts
  it("a hunk / line action carries the print of every hunk it touches", async () => {
    await sync([entry("a.rs")]);
    const hunk = (header: string) => ({ header, oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: "add" as const, oldNo: null, newNo: 1, text: "x", noNewline: false }] });
    const hunks = [hunk("@@ -1 +1 @@"), hunk("@@ -9 +9 @@ fn x()")];
    useCommitStore.setState({ diff: { ...useCommitStore.getState().diff!, hunks } });

    await useCommitStore.getState().stageHunk(1);
    expect(mocked.stageHunks).toHaveBeenLastCalledWith(REPO.id, "a.rs", [1], false, 3, [[1, 1, hunkPrint(hunks[1])]], undefined);
    // Two lines of one hunk name it once.
    await useCommitStore.getState().stageLines([[0, 0], [0, 0], [1, 0]]);
    expect(mocked.stageLines).toHaveBeenLastCalledWith(REPO.id, "a.rs", [[0, 0], [0, 0], [1, 0]], false, 3, [[0, 1, hunkPrint(hunks[0])], [1, 1, hunkPrint(hunks[1])]], undefined);
  });
```

If `diff` is `null` after `sync` in this file's setup, build the object whole instead of spreading: copy the `FileDiff` shape from the fixture the file's `getFileDiff` mock returns.

Run (from `F:/src/_ pet projects/t4-git-ui`): `npm test -- --run src/lib/hunkPrint.test.ts src/store/commitStore.test.ts` → FAIL (no `hunkPrint` module; 6 args received).

- [ ] **Step 5: Frontend wiring**

Create `src/lib/hunkPrint.ts`:

```ts
import type { DiffLineKind, Hunk } from "../api/types";

const SIGN: Record<DiffLineKind, string> = { context: " ", add: "+", del: "-" };
const utf8 = new TextEncoder();

/**
 * A fingerprint of a hunk as it was rendered: FNV-1a (32-bit) over the header and each line's sign,
 * text and no-newline flag. The same function as `patch::hunk_print` in git-core, which prints the
 * hunk of the diff it rebuilds and refuses the action when the two differ — a file rewritten between
 * the render and the click would otherwise have other lines staged or discarded. One vector pinned in
 * both test suites keeps the two in step.
 */
export function hunkPrint(hunk: Hunk): string {
  let h = 0x811c9dc5;
  const eat = (s: string) => {
    for (const b of utf8.encode(s)) {
      h ^= b;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  eat(`${hunk.header}\n`);
  for (const l of hunk.lines) eat(`${SIGN[l.kind]}${l.text}${l.noNewline ? "\\" : ""}\n`);
  return h.toString(16).padStart(8, "0");
}
```

`src/api/ipc.ts` — a type beside the four exports, and the exports replaced (doc comments above them stay; add to `stageHunks`'s: *`seen` names every hunk touched as the panel showed it — the backend refuses when its rebuilt diff disagrees*):

```ts
/** `[hunkIndex, linesShown, print]` — see `hunkPrint`. `linesShown` because a shown hunk can be cut at the line cap. */
export type SeenHunk = [number, number, string];

export const stageHunks = (id: RepoId, path: string, hunks: number[], reverse: boolean, context: number, seen: SeenHunk[], oldPath?: string) =>
  call<void>("stage_hunks", { id, path, oldPath, hunks, seen, reverse, context });

export const stageLines = (id: RepoId, path: string, lines: [number, number][], reverse: boolean, context: number, seen: SeenHunk[], oldPath?: string) =>
  call<void>("stage_lines", { id, path, oldPath, lines, seen, reverse, context });

export const discardHunks = (id: RepoId, path: string, hunks: number[], context: number, seen: SeenHunk[], oldPath?: string) =>
  call<void>("discard_hunks", { id, path, oldPath, hunks, seen, context });

export const discardLines = (id: RepoId, path: string, lines: [number, number][], context: number, seen: SeenHunk[], oldPath?: string) =>
  call<void>("discard_lines", { id, path, oldPath, lines, seen, context });
```

`src/store/commitStore.ts` — a module-level helper near `renameHint` / `stillShown` (import `hunkPrint` from `../lib/hunkPrint`, and `FileDiff` from `../api/types` if the file does not already):

```ts
/** Every hunk a selection touches, as the shown diff has it — the backend rebuilds the diff and refuses when they differ. A hunk the diff does not have prints as nothing, which no rebuild matches. */
const seenHunks = (diff: FileDiff | null, hunks: number[]): ipc.SeenHunk[] =>
  [...new Set(hunks)].map((h) => {
    const hunk = diff?.hunks[h];
    return hunk ? [h, hunk.lines.length, hunkPrint(hunk)] : [h, 0, ""];
  });
```

and the four actions read `diff` from `get()` and pass it:

```ts
    async stageHunk(hunk) {
      // The indices are the shown diff's, so the backend has to rebuild it with the same context
      // and the same rename hint — and gets the headers, to refuse when the rebuild is another diff.
      const { diffPath, diffList, diffContext, diff } = get();
      if (!diffPath) return;
      const reverse = diffList === "staged";
      await run(reverse ? "Unstage failed" : "Stage failed", (id) => ipc.stageHunks(id, diffPath, [hunk], reverse, diffContext, seenHunks(diff, [hunk]), renameHint(diffPath)));
    },

    async stageLines(lines) {
      const { diffPath, diffList, diffContext, diff } = get();
      if (!diffPath || lines.length === 0) return;
      const reverse = diffList === "staged";
      await run(reverse ? "Unstage failed" : "Stage failed", (id) => ipc.stageLines(id, diffPath, lines, reverse, diffContext, seenHunks(diff, lines.map(([h]) => h)), renameHint(diffPath)));
    },
```

`discardHunk` / `discardLines`: same insertion — `seenHunks(diff, [hunk])` / `seenHunks(diff, lines.map(([h]) => h))` as the argument before `renameHint(diffPath)`. They already read `diff` (captured *before* the confirm prompt, which is the diff the user was looking at — correct).

- [ ] **Step 6: Update the pinned expectations** — every `toHaveBeenCalledWith` / `toHaveBeenLastCalledWith` on `stageHunks`, `stageLines`, `discardHunks`, `discardLines` in `commitStore.test.ts` (lines 267-346) and `CommitPanel.test.tsx:409` gains the `seen` argument just before the trailing `undefined` / `"old.txt"`. Its value has one entry per distinct hunk index `h` in the call: `[h, 0, ""]` when the test's diff fixture has no hunk `h` (most of these fixtures have none), else `[h, fixture.hunks[h].lines.length, hunkPrint(fixture.hunks[h])]` — computed in the test, never a pasted hex string. Example: `(REPO.id, "a.rs", [0], false, 3, undefined)` → `(REPO.id, "a.rs", [0], false, 3, [[0, 0, ""]], undefined)`; a lines call `[[0, 1]]` → `[[0, 0, ""]]`.

- [ ] **Step 7: Run** — `npm test -- --run src/lib/hunkPrint.test.ts src/store/commitStore.test.ts src/screens/RepoWindow/CommitPanel/CommitPanel.test.tsx` then `npx tsc --noEmit -p "F:/src/_ pet projects/t4-git-ui"`
Expected: PASS, no type errors. The vector (`6b34fb19` / `53a53432`) was computed when this plan was written with both functions as given here — node for the TypeScript one, a scratch `rustc` build for the Rust one — and they agreed; a test that disagrees means the implementation drifted from the plan's code, not that the vector is wrong. Add a `hunkPrint.ts` entry to the `src/lib` list in `src/README.md` (after `freshStatus.ts`, same style: what it prints, that git-core has the twin, that the shared vector ties them).

- [ ] **Step 8: Commit**

```bash
git -C "F:/src/_ pet projects/t4-git-ui" add crates/git-core/src/patch.rs src-tauri/src/commands/stage.rs src/api/ipc.ts src/lib/hunkPrint.ts src/lib/hunkPrint.test.ts src/README.md src/store/commitStore.ts src/store/commitStore.test.ts src/screens/RepoWindow/CommitPanel/CommitPanel.test.tsx
git -C "F:/src/_ pet projects/t4-git-ui" commit -m "fix: A hunk or line action is refused when the file changed since its diff was shown, instead of landing on other lines"
```

---

### Task 5: Push goes where the branch tracks, and the toast says where it went (F4)

**Files:**
- Modify: `src/screens/RepoWindow/dialogs/OpsDialogs.tsx:126-143`
- Test: `src/screens/RepoWindow/dialogs/dialogs.test.tsx` (`describe("PushDialog")`)

**Interfaces:** none change — `ipc.push(id, remote, refspec, …)` already takes a refspec string.

- [ ] **Step 1: Failing test** — in `describe("PushDialog")`, reusing the file's `REFS`, `preview`, `mocked`:

```tsx
  it("pushes to the upstream's name when it differs, and to the local name on another remote", async () => {
    useRepoStore.setState({ refs: { ...REFS, local: [{ ...REFS.local[0], upstream: "origin/trunk" }] } });
    const { getByRole } = render(<PushDialog onClose={() => {}} />);
    const dialog = getByRole("dialog", { name: "Push" });
    await waitFor(() => expect(preview(dialog)).toBe("git push --progress origin --end-of-options main:trunk"));
    fireEvent.click(getByRole("button", { name: "Push" }));
    await waitFor(() => expect(mocked.push).toHaveBeenCalledWith("r", "origin", "main:trunk", false, false, false));
  });
```

If the file has a helper that picks another remote in `RemoteField` (the delete-remote-tag tests at `:312-324` switch to `fork`), add the second half with it: after switching to `fork`, the preview is `git push --progress fork --end-of-options main` — the upstream belongs to `origin`, so the local name is used.

Run: `npm test -- --run src/screens/RepoWindow/dialogs/dialogs.test.tsx -t "upstream's name"` → FAIL (`… main`).

- [ ] **Step 2: Implement** — replace `preview` / `target` / the `runOp` line:

```tsx
  // The remote-side name: local `dev` may track `origin/develop`, and a bare `dev` would create
  // `origin/dev` beside it. Only an upstream on the picked remote counts (as in PullDialog).
  const remoteBranch = info?.upstream && remote && info.upstream.startsWith(`${remote}/`) ? info.upstream.slice(remote.length + 1) : branch;
  const refspec = remoteBranch === branch ? branch : `${branch}:${remoteBranch}`;
  const preview = gitCmd(pushArgs(remote || "origin", refspec || null, setUpstream, force, tags));
  // What the push wrote, not what the branch tracks: they differ when another remote is picked.
  const target = `${remote}/${remoteBranch}`;

  function submit() {
    if (!remote || !branch) return;
    onClose();
    void runOp(`Pushing to ${remote}…`, (id) => ipc.push(id, remote, refspec, setUpstream, force, tags), { success: `Pushed ${branch} → ${target}`, remote });
  }
```

- [ ] **Step 3: Run** — `npm test -- --run src/screens/RepoWindow/dialogs/dialogs.test.tsx`
Expected: PASS — the existing previews (`… origin --end-of-options main`) are unchanged because `main` tracks `origin/main`.

- [ ] **Step 4: Commit**

```bash
git -C "F:/src/_ pet projects/t4-git-ui" add src/screens/RepoWindow/dialogs/OpsDialogs.tsx src/screens/RepoWindow/dialogs/dialogs.test.tsx
git -C "F:/src/_ pet projects/t4-git-ui" commit -m "fix: Push writes to the branch's upstream name when it differs from the local one, and the toast names what was written"
```

---

### Task 6: An op's output goes to the window that owns it (F6)

**Files:**
- Modify: `src-tauri/src/commands/ops.rs:60-93` (`run_git_op`), its 5 call sites there (one is `clone_repo` `:1217`), and the 5 in `src-tauri/src/commands/stage.rs`
- Modify: `src/api/events.ts:67-84`
- Test: `src/api/events.test.ts`

**Interfaces:**
- Produces (Rust): `pub(crate) enum OpOwner<'a> { Repo(&'a RepoId), Window(&'a str) }`; `run_git_op(app, state, owner: OpOwner<'_>, dir, args, stdin, stream)`
- The `op://event` payload is unchanged (`repoId` still `null` for a clone).

- [ ] **Step 1: Failing frontend test** — `events.test.ts` (it already mocks `listen`; import `onOpEventReady` too):

```ts
  it("op events are listened to as this window, so another window's op never lands in this dock", async () => {
    mockedListen.mockResolvedValue(() => {});
    onOpEvent(() => {});
    await onOpEventReady(() => {});
    const target = { target: { kind: "Window", label: "main" } };
    expect(mockedListen).toHaveBeenNthCalledWith(1, "op://event", expect.any(Function), target);
    expect(mockedListen).toHaveBeenNthCalledWith(2, "op://event", expect.any(Function), target);
  });
```

(Reset the mock in a `beforeEach` if the file does not: `mockedListen.mockReset()`. Outside Tauri `windowLabel()` falls back to `"main"`.)

Run: `npm test -- --run src/api/events.test.ts` → FAIL (third argument `undefined`).

- [ ] **Step 2: Frontend** — `events.ts`:

```ts
/**
 * Streamed output of a CLI op (`op://event`), addressed to the window that owns the op: untargeted,
 * a failed push in another window opened this one's dock, and two clones crossed their op ids.
 */
export const onOpEvent = (cb: (p: OpEvent) => void) => subscribeHere<OpEvent>("op://event", cb);
```

`subscribeReady` gains an optional target and `onOpEventReady` passes this window:

```ts
async function subscribeReady<T>(name: string, cb: (payload: T) => void, target?: EventTarget): Promise<() => void> {
  try {
    return await listen<T>(name, (e) => cb(e.payload), target && { target });
  } catch {
```

```ts
export const onOpEventReady = (cb: (p: OpEvent) => void) => subscribeReady<OpEvent>("op://event", cb, { kind: "Window", label: windowLabel() });
```

Run: `npm test -- --run src/api/events.test.ts` → PASS.

- [ ] **Step 3: Backend** — `ops.rs`, above `run_git_op`:

```rust
/// Who an op's events are for: the window holding the repository, or — with
/// no repository yet (a clone) — the window that asked.
pub(crate) enum OpOwner<'a> {
    Repo(&'a RepoId),
    Window(&'a str),
}
```

`run_git_op`: parameter `repo_id: Option<&RepoId>` becomes `owner: OpOwner<'_>`; before `begin_op`:

```rust
    let (repo_id, label) = match owner {
        OpOwner::Repo(id) => (Some(id), state.holder_of(id, "")),
        OpOwner::Window(label) => (None, Some(label.to_string())),
    };
```

and the emit:

```rust
                // To the owner alone: every window listens, and a broadcast put
                // window A's failed push in window B's dock. No holder (a window
                // that went away mid-op) falls back to everyone.
                let sent = match &label {
                    Some(label) => app.emit_to(label.as_str(), OP_EVENT, payload),
                    None => app.emit(OP_EVENT, payload),
                };
                if let Err(e) = sent {
                    tracing::warn!(error = %e, "failed to emit op event");
                }
```

Update the doc comment's second sentence: *…is forwarded as `op://event` to the window that owns the op.* Call sites: every `Some(&handle.id)` → `OpOwner::Repo(&handle.id)` (4 in `ops.rs`, 5 in `stage.rs` — extend stage.rs's `use super::ops::…` import with `OpOwner`); `clone_repo`: `None` → `OpOwner::Window(window.label())`.

- [ ] **Step 4: Run** — `cargo clippy --workspace --all-targets --locked -- -D warnings` and `cargo test -p t4-git-ui`
Expected: clean / PASS. (`holder_of` is already unit-tested in `state.rs`.)

Two things no test here reaches, both for the walk (smoke BD 6): that a window-targeted listener hears `emit_to(label)` — the tab events already work this way, so this is the safe half — and that it still hears the plain `emit` of the no-holder fallback. If the fallback turns out not to reach targeted listeners, nothing breaks that works today (that op's output is simply not shown anywhere); note it and move on. The owner is resolved once, at the op's start: a tab dragged to another window mid-op keeps streaming to the window it left.

- [ ] **Step 5: Commit**

```bash
git -C "F:/src/_ pet projects/t4-git-ui" add src-tauri/src/commands/ops.rs src-tauri/src/commands/stage.rs src/api/events.ts src/api/events.test.ts
git -C "F:/src/_ pet projects/t4-git-ui" commit -m "fix: A git operation's output reaches only the window that owns it — no foreign dock opening, no crossed clone cancel"
```

---

### Task 7: An op ends when git does (F8)

**Files:**
- Modify: `crates/git-core/src/cli/runner.rs:270-300` (run loop), `:321-345` (`pump`), its tests (4 `pump(` calls at `:598`, `:609`, `:620`)

**Interfaces:**
- `pump(r, kind, tx, limit, stop: CancellationToken)` — private.

- [ ] **Step 1: Failing test** — `runner.rs` `mod tests`:

```rust
    /// A hook that backgrounds a child without redirecting it leaves the pipe's
    /// write end open after git exits. The op used to last as long as that
    /// child — with the repo's op lock held the whole time.
    #[tokio::test]
    async fn a_background_child_holding_the_pipe_does_not_hold_the_op() {
        if !have_git() {
            return;
        }
        let t = TempRepo::new();
        let started = std::time::Instant::now();
        let out = GitCli::new("git")
            .run(
                t.path(),
                "op-bg",
                &["-c", "alias.bg=!sleep 20 & echo started", "bg"],
                None,
                CancellationToken::new(),
                |_| {},
            )
            .await
            .expect("run");
        assert_eq!(out.code, 0);
        assert!(out.stdout.contains("started"), "{:?}", out.stdout);
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "returned after {:?}",
            started.elapsed()
        );
    }
```

And the child that never goes quiet — bounded at ten seconds of output so the test leaves nothing running behind it:

```rust
    #[tokio::test]
    async fn a_background_child_that_keeps_writing_is_cut_at_the_cap() {
        if !have_git() {
            return;
        }
        let t = TempRepo::new();
        let started = std::time::Instant::now();
        let alias = "alias.chat=!(for i in $(seq 1 100); do echo tick; sleep 0.1; done) & echo started";
        let out = GitCli::new("git")
            .run(t.path(), "op-chat", &["-c", alias, "chat"], None, CancellationToken::new(), |_| {})
            .await
            .expect("run");
        assert_eq!(out.code, 0);
        assert!(
            started.elapsed() < Duration::from_secs(8),
            "returned after {:?}",
            started.elapsed()
        );
    }
```

Run: `cargo test -p git-core --lib background_child` → both FAIL on the elapsed assertion (after ~20 s and ~10 s).

- [ ] **Step 2: Implement**

Constant beside `BATCH_AGE`:

```rust
/// How long the pipes may stay *silent* after git itself has exited before the
/// pumps are stopped. What git wrote is read within milliseconds; what is left
/// is a child it spawned that kept the handles (a hook's `daemon &`), and that
/// can be hours. Measured from the last line, not from the exit: a loaded
/// machine still draining git's own output is never cut short.
const DRAIN_GRACE: Duration = Duration::from_millis(500);
/// The most a child that keeps writing can add to an op after git exited.
const DRAIN_CAP: Duration = Duration::from_secs(5);
```

`pump` takes `stop: CancellationToken` as its last parameter and the read becomes:

```rust
        let n = tokio::select! {
            read = r.read(&mut buf) => match read {
                Ok(0) | Err(_) => break,
                Ok(n) => n,
            },
            // git is gone and the grace is over: whoever still holds the pipe is not git.
            _ = stop.cancelled() => break,
        };
```

Run loop:

```rust
        let stop = CancellationToken::new();
        let out_task = tokio::spawn(pump(stdout, Kind::Stdout, tx.clone(), MAX_RETAINED, stop.clone()));
        let err_task = tokio::spawn(pump(stderr, Kind::Stderr, tx, MAX_RETAINED, stop.clone()));

        let mut cancelled = false;
        let mut status = None;
        let mut exited_at: Option<Instant> = None;
        let mut batch = Batch::default();
        loop {
            tokio::select! {
                ev = rx.recv() => match ev {
                    Some((kind, line)) => batch.push(kind, line, &mut on_event),
                    None => break,
                },
                // (the BATCH_AGE and cancel arms stay exactly as they are)
                // Pipe EOF alone is not "git exited": a background child of a hook
                // inherits the handles and keeps them open.
                exited = child.wait(), if status.is_none() => {
                    status = Some(exited?);
                    exited_at = Some(Instant::now());
                }
                // git is gone and nothing has come through for `DRAIN_GRACE` (the
                // sleep is recreated each iteration, like the batch one above):
                // whoever still holds the pipes is not git. The pumps return what
                // they have and the channel closes.
                _ = tokio::time::sleep(DRAIN_GRACE), if status.is_some() && !stop.is_cancelled() => {
                    stop.cancel();
                }
            }
            // A child that keeps *talking* never goes silent: the cap ends it anyway.
            if exited_at.is_some_and(|t| t.elapsed() >= DRAIN_CAP) {
                stop.cancel();
            }
        }
        batch.flush(&mut on_event);

        let status = match status {
            Some(s) => s,
            None => child.wait().await?,
        };
```

Tests: the existing `pump(` calls gain `CancellationToken::new()` as the last argument.

- [ ] **Step 3: Run** — `cargo test -p git-core --lib cli::runner` then `cargo test -p git-core`
Expected: PASS; the silent-child test returns in under 2 s, the chatty one in about 5. (The `sleep 20` and the tick loop outlive their tests by a few seconds by design — that is the scenario; both end on their own.)

- [ ] **Step 4: Commit**

```bash
git -C "F:/src/_ pet projects/t4-git-ui" add crates/git-core/src/cli/runner.rs
git -C "F:/src/_ pet projects/t4-git-ui" commit -m "fix: A git operation ends when git exits, not when the last process holding its output pipe does"
```

---

### Task 8: One instance (F7)

**Files:**
- Modify: `src-tauri/Cargo.toml` (dependencies), `Cargo.lock`
- Modify: `src-tauri/src/lib.rs:136-137`
- Modify: `src-tauri/src/commands/window.rs:96-156` (`spawn_window` → `spawn` + a thin command)

**Interfaces:**
- Produces: `pub fn spawn(app: &AppHandle, source: Option<String>, payload: Layout, placement: Option<(f64, f64)>) -> String`; the `spawn_window` command's signature and IPC shape do not change.

- [ ] **Step 1: Add the dependency** — `src-tauri/Cargo.toml`, after `tauri-plugin-updater = "2"`:

```toml
tauri-plugin-single-instance = "2"
```

Run: `cargo check --manifest-path "F:/src/_ pet projects/t4-git-ui/src-tauri/Cargo.toml"` (updates `Cargo.lock`; CI builds `--locked`, so the lock is part of the commit).

- [ ] **Step 2: A window can be spawned without a window asking** — `src-tauri/src/commands/window.rs`. `spawn_window` is a command and takes the calling `Window` (only to know whom to hand the tabs back to if the build fails); the plugin callback has none. Split the body out, unchanged but for the source being optional and the forward-bringing a second launch needs:

```rust
/// Creates a window showing `payload`'s tabs, at `placement` (a physical screen
/// point for its top-left) or wherever the OS puts it. Returns its label.
/// `source` is the window the tabs came from, told if the build fails; `None`
/// for a second launch of the app (`lib.rs`), which moves nothing and whose
/// window has to come forward by itself — no click of the user's raised it.
///
/// (the existing paragraph about the worker thread moves here, word for word)
pub fn spawn(
    app: &AppHandle,
    source: Option<String>,
    payload: Layout,
    placement: Option<(f64, f64)>,
) -> String {
    // In a block: `state` borrows `app`, and the thread below takes a clone of it.
    let label = {
        let state = app.state::<AppState>();
        let label = state.next_window_label();
        state.pending().insert(label.clone(), payload.clone());
        label
    };
    // … the `size` lookup, unchanged …
    let target = label.clone();
    let app = app.clone();
    std::thread::spawn(move || {
        // … the builder, unchanged …
        match builder.build() {
            Ok(win) => {
                // … set_position, unchanged …
                crate::show_with_theme(&app, &win);
                if source.is_none() {
                    let _ = win.set_focus();
                }
            }
            Err(e) => {
                tracing::warn!(label = %target, error = %e, "window failed to open");
                let state = app.state::<AppState>();
                state.pending().remove(&target);
                // Give the tabs back to the window that let them go, or they are
                // lost — every one of them, not just the active one.
                if let Some(source) = &source {
                    let _ = app.emit_to(
                        source,
                        "tab-spawn-failed",
                        serde_json::json!({ "paths": payload.tabs }),
                    );
                }
            }
        }
    });
    label
}

#[tauri::command]
pub fn spawn_window(
    app: AppHandle,
    window: Window,
    payload: Layout,
    placement: Option<(f64, f64)>,
) -> String {
    spawn(&app, Some(window.label().to_string()), payload, placement)
}
```

- [ ] **Step 3: Register the plugin first** — `lib.rs`, as the first `.plugin(…)`:

```rust
    tauri::Builder::default()
        // First, so a second launch is turned away before anything touches the
        // files both would share: it would wipe the temp files an external merge
        // tool still has open (`clean_merge_temp` below assumes a cold start),
        // consume `layout.json`, and open a repository under a second set of
        // locks. The second process exits, and what it was started for — another
        // window — is opened here instead, on the start screen: an empty layout,
        // so it does not reach for the repository another window already holds.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            commands::window::spawn(app, None, commands::window::Layout::default(), None);
        }))
        .plugin(tauri_plugin_opener::init())
```

Why an empty layout lands on the start screen: `restoreTabs` (`src/App.tsx:33`) takes a parked layout as this window's own, so it opens no tab and never falls back to `lastOpen`; with no repository `App` renders `StartScreen`. No frontend change.

- [ ] **Step 4: Gates** — `cargo clippy --workspace --all-targets --locked -- -D warnings`, `cargo test --workspace --locked` → clean / PASS (`window.rs`'s existing tests cover the layout chain the new window joins).

- [ ] **Step 5: Verify in the real app** (no unit test reaches this) — close every instance, `npx tauri build --no-bundle`, start `target/release/t4-git-ui.exe`, open a repository, start the exe again:
  - one process in Task Manager, a second window on the start screen, in front and focused (if Windows only flashes the taskbar button instead, note it — that is the foreground lock, and the fix is the plugin's or `AllowSetForegroundWindow`, not more `set_focus`);
  - open a repository in it, close that tab → the window closes (a secondary window with nothing left in it is over — `tabsStore.ts:144`);
  - open the repository the *first* window holds → the first window comes forward instead (`OpenElsewhere`), the new one stays on its start screen;
  - close the new window while it is still on the start screen, then quit and relaunch → the layout restores the first window only (an empty window stays out of the closed chain).
  Anything that fails here is a finding for this task, not a follow-up. Record the result in Task 11's smoke group.

- [ ] **Step 5b: Two platform risks the Windows walk cannot see** — read before committing, walk where a machine allows:
  - **Linux, no session bus.** The plugin claims a D-Bus name. Open the installed crate (`~/.cargo/registry/src/*/tauri-plugin-single-instance-*/src/platform_impl/linux.rs`) and check what it does when the session bus is missing: if it `unwrap`s, the app would not start on a bare WSLg / container session. Then launch the Linux build under WSLg (memory: `wsl-linux-build`) once. If it panics there, gate the plugin with `#[cfg(not(target_os = "linux"))]`, say so in the commit body, and record Linux as still multi-process in `open-items.md`.
  - **The updater's restart.** `commands/update.rs` ends in `app.restart()` (macOS, AppImage; on Windows NSIS kills and relaunches). A relaunch that starts while the old process still holds the instance lock would hand over to a dying app and exit — the update would "close the app". The plugin releases its lock on `RunEvent::Exit`, and tauri 2.11 (`Cargo.lock`) routes `restart()` through that exit; confirm both in the crate sources rather than trusting this sentence. It cannot be walked without a published update, so add it to smoke box AZ 10 / BD 10: *after the update installs, the app comes back*.

- [ ] **Step 6: Commit**

```bash
git -C "F:/src/_ pet projects/t4-git-ui" add src-tauri/Cargo.toml Cargo.lock src-tauri/src/lib.rs src-tauri/src/commands/window.rs
git -C "F:/src/_ pet projects/t4-git-ui" commit -m "fix: A second launch opens another window of the running app instead of a second process that shares its files"
```

Known consequence: `smoke-launch.ps1` already says *close every other instance first*; with this it is enforced — a local build started while the installed app runs hands over to it (the installed app gets the new window) and exits. Task 11 adds that sentence to `docs/smoke/smoke-cdp.md`.

Not in scope: a path argument (`t4-git-ui.exe <repo>`). The app reads no arguments today, in the first process either; `_args` is where it would arrive if that is ever wanted.

---

### Task 9: Squash and "always a merge commit" cannot be picked together (F5)

**Files:**
- Modify: `src/screens/RepoWindow/dialogs/OpsDialogs.tsx:358-371`
- Test: `src/screens/RepoWindow/dialogs/dialogs.test.tsx:521-534`, `src/screens/RepoWindow/dialogs/gitArgs.test.ts:32`

- [ ] **Step 1: Change the test that pins the refused pair** — in `"builds the merge args from strategy / squash / message"` pick the fast-forward-only strategy instead of "Always create a merge commit" (use that option's label from `FF_LABEL`), expect `git merge --ff-only --squash -m 'custom msg' --end-of-options feature/lane-graph` and `mocked.merge` called with `"only"`. Add:

```tsx
  it("squash is off the table with 'always a merge commit': git refuses the pair", () => {
    const { getByRole } = render(<MergeDialog onClose={() => {}} />);
    const squash = () => getByRole("checkbox", { name: "Squash into one commit" }) as HTMLInputElement;
    fireEvent.click(squash());
    expect(squash().checked).toBe(true);
    fireEvent.click(getByRole("combobox", { name: "Strategy" }));
    fireEvent.click(getByRole("option", { name: "Always create a merge commit" }));
    expect(squash().checked).toBe(false);
    expect(squash().disabled).toBe(true);
    expect(preview(getByRole("dialog"))).toBe("git merge --no-ff --end-of-options feature/lane-graph");
  });
```

`gitArgs.test.ts:32`: change that case's strategy to `"auto"` and its expectation to `git merge --ff --squash -m …` (same message quoting as now). The builder is mechanical and stays; the test should not advertise a command git rejects.

Run: `npm test -- --run src/screens/RepoWindow/dialogs/dialogs.test.tsx -t "off the table"` → FAIL.

- [ ] **Step 2: Implement**

```tsx
        <Select
          aria-label="Strategy"
          value={ff}
          onChange={(e) => {
            const m = e.target.value as FfMode;
            setFf(m);
            // git: "You cannot combine --squash with --no-ff" — a squash records no merge commit.
            if (m === "no") setSquash(false);
          }}
        >
```

```tsx
        <Checkbox
          checked={squash}
          onChange={setSquash}
          disabled={ff === "no"}
          title={ff === "no" ? "A squash records no merge commit, so git refuses it with this strategy" : "Applies the changes without recording a merge; commit them yourself"}
        >
          Squash into one commit
        </Checkbox>
```

- [ ] **Step 3: Run** — `npm test -- --run src/screens/RepoWindow/dialogs` → PASS.

- [ ] **Step 4: Commit**

```bash
git -C "F:/src/_ pet projects/t4-git-ui" add src/screens/RepoWindow/dialogs/OpsDialogs.tsx src/screens/RepoWindow/dialogs/dialogs.test.tsx src/screens/RepoWindow/dialogs/gitArgs.test.ts
git -C "F:/src/_ pet projects/t4-git-ui" commit -m "fix: The merge dialog no longer offers Squash with Always create a merge commit, a pair git refuses"
```

---

### Task 10: Install waits for running git operations (F10)

**Files:**
- Modify: `src-tauri/src/state.rs` (new method + test), `src-tauri/src/commands/update.rs:71-122`

**Interfaces:**
- Produces: `AppState::op_running(&self) -> bool`

- [ ] **Step 1: Failing test** — `state.rs` `mod tests`:

```rust
    #[test]
    fn an_op_counts_as_running_until_it_ends() {
        let state = AppState::default();
        assert!(!state.op_running());
        let (id, _token) = state.begin_op();
        assert!(state.op_running());
        state.end_op(&id);
        assert!(!state.op_running());
    }
```

Run: `cargo test -p t4-git-ui op_counts_as_running` → FAIL to compile.

- [ ] **Step 2: Implement** — `state.rs`, after `end_op`:

```rust
    /// Whether any CLI operation is registered, in any window. Reads (blame,
    /// `ls-remote`) count too: an update's install ends them all alike.
    pub fn op_running(&self) -> bool {
        !lock(&self.ops).is_empty()
    }
```

`update.rs`: `install_update` takes `state: tauri::State<'_, crate::AppState>`; a helper used twice — once beside the `installable()` refusal, once again right before `update.install(bytes)` (the download is long enough for a push to start in another window):

```rust
/// On Windows the NSIS step kills the whole app: a rebase or a push running in
/// any window would lose its result handling, and git would finish unobserved.
fn refuse_while_busy(state: &crate::AppState) -> Result<(), AppError> {
    if state.op_running() {
        return Err(AppError::Internal(
            "a git operation is still running — let it finish or cancel it, then install".into(),
        ));
    }
    Ok(())
}
```

`updateStore.install()` already shows any rejection beside the buttons; no frontend change.

- [ ] **Step 3: Run** — `cargo test -p t4-git-ui`, `cargo clippy --workspace --all-targets --locked -- -D warnings` → PASS / clean.

- [ ] **Step 4: Commit**

```bash
git -C "F:/src/_ pet projects/t4-git-ui" add src-tauri/src/state.rs src-tauri/src/commands/update.rs
git -C "F:/src/_ pet projects/t4-git-ui" commit -m "fix: Installing an update is refused while a git operation is running in any window"
```

Not covered (recorded in Task 11): a typed, uncommitted commit message in another window is still lost to the restart.

---

### Task 11: Full gates, smoke group BD, the record

**Files:**
- Modify: `docs/smoke/smoke-test-post-v1.md` (append after group BC), `docs/smoke/smoke-cdp.md`, `docs/plans/open-items.md`, `docs/plans/2026-09-20-codebase-review-findings.md` (Decision column)

- [ ] **Step 1: Full gates** (a `tester` run): `cargo fmt --all --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, `cargo test --workspace --locked`, `npm test -- --run`, `npm run build`. All green before anything below.

- [ ] **Step 2: Append smoke group BD** to `smoke-test-post-v1.md`:

```markdown
## BD. The 2026-09-20 review fixes (staging edges, push target, op ownership, one instance)

Fixture: a scratch repo with `pages/[id].txt` and `pages/i.txt` committed, a second remote-tracking
setup where local `dev` tracks `origin/develop`, and a `post-commit` hook `sleep 60 &`.

- [ ] 1. Modify `pages/[id].txt` and `pages/i.txt`; Discard `[id].txt` → `i.txt` keeps its edit. Stage both, Unstage `[id].txt` → `i.txt` stays staged.
- [ ] 2. A file committed without a final newline, then a line appended: staging only the appended line is refused with the "missing final newline" reason; staging the hunk works and the index ends in a newline.
- [ ] 3. A Latin-1 file with one changed line: Stage hunk is refused naming UTF-8; staging the whole file works and `git diff --cached` shows the original bytes.
- [ ] 4. With a diff open, rewrite the file from a terminal so its hunks shift, and press Stage hunk inside the same beat (before the panel reloads): refused with "changed since this diff was shown", index untouched. Again with a same-shape edit (one changed line's text replaced, nothing added or removed): refused too. Over CDP the beat is reachable by calling the store action right after the write; by hand it may not be — then tick it as unit-only and say so.
- [ ] 5. Push `dev` (tracks `origin/develop`): preview reads `dev:develop`, `origin/develop` moves, no `origin/dev` appears, the toast names `origin/develop`.
- [ ] 6. Two windows, a repo each: a failing push in window A leaves window B's dock closed and empty. Two clones at once, Cancel in one: the other finishes.
- [ ] 7. Commit with the `sleep 60 &` hook installed: the Commit button stops spinning within a second and a second commit right after is not `Busy`.
- [ ] 8. Start the exe twice: one process, a second window on the start screen, in front. Opening in it the repository the first window holds brings the first forward instead; closing its last tab closes it; closed while still empty, it is not restored on the next launch.
- [ ] 9. Merge dialog: "Always create a merge commit" greys Squash out and unticks it; with another strategy Squash still merges.
- [ ] 10. With a long fetch running in one window, Install in another is refused with the running-operation reason. (Needs a published update — walk with group AC.)
```

- [ ] **Step 2b: The fixture as a script** — `docs/smoke/fixtures/bd-fixture.sh`, in the style of `ba-fixture.sh` (read it first: same shebang, same `C:/tmp/t4/<group>` target, same idempotent wipe-and-rebuild). It builds `c:/tmp/t4/bd` with: `pages/[id].txt` + `pages/i.txt` committed; `nonl.txt` committed as `a\nb` with no final newline (`printf 'a\nb'`); `latin1.txt` committed with a `caf\xE9` line (`printf 'a\ncaf\351\nc\n'`); a bare `origin` beside it with branch `develop`, and local `dev` tracking `origin/develop` (`git push origin dev:develop`, `git branch -u origin/develop dev`); a `.git/hooks/post-commit` of `#!/bin/sh` + `sleep 60 &`, made executable. Name the script in group BD's Fixture line and add it to the `fixtures/` list in `docs/README.md`.

- [ ] **Step 3: `smoke-cdp.md`** — beside the "close every other instance" note: *since the single-instance guard a second launch is not a second process: it hands over to the running app — which opens the new window — and exits, so the installed app must be closed before a local build is launched, or the walk drives the installed build without knowing it.*

- [ ] **Step 4: `open-items.md`** — turn §N's "plan written, not executed" into what landed, with the commit range, and move §N's two **deferred** rows under §I with their reopen conditions: the hunk buttons staying enabled on a non-UTF-8 file (F3 — the refusal is a toast), a typed commit message lost to an update restart (F10 — needs a design choice). The push tag-name ambiguity (F4) is already in §I as **closed, will not fix, do not re-offer** — leave it as it is.

- [ ] **Step 4b: Lines for the next release's notes** — in the same §N, so the `release` skill's notes edit has them: a second launch now opens another window of the running app (was: a second process); Push writes to the upstream's branch name when it differs; hunk / line actions are refused when the file changed under the diff, beside a missing final newline, and in a non-UTF-8 file; Squash is unavailable with "Always create a merge commit"; Install waits for running git operations. v0.10.9 is tagged and `main` is in sync with it, so these ship as the next version — not part of this plan.

- [ ] **Step 5: Findings doc** — fill the Decision column per row (`done <hash> — <what was done>`), in the 2026-09-12 file's style.

- [ ] **Step 6: Commit the docs**, then walk group BD on a `tauri build --no-bundle` (close the installed app first) and tick the boxes in a follow-up docs commit. Both docs move to `docs/archive/plans/` once every row is carried by `open-items.md`.

```bash
git -C "F:/src/_ pet projects/t4-git-ui" add docs
git -C "F:/src/_ pet projects/t4-git-ui" commit -m "docs: Smoke group BD and the record of the 2026-09-20 review fixes"
```
