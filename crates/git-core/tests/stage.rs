//! Path staging through the system `git` (the libgit2 ignore check, then
//! `update-index`), run the way `commands::stage` runs it. Skipped at runtime
//! when `git` is missing.

use std::path::Path;

use git_core::cli::GitCli;
use git_core::diff::FileStatus;
use git_core::stage::{check_staged, refuse_ignored, stage_paths_args, stage_stdin, unstage_paths};
use git_core::status::{status, StatusEntry};
use git_core::test_util::TempRepo;
use git_core::GitError;
use tokio_util::sync::CancellationToken;

fn have_git() -> bool {
    match git_core::git_version("git") {
        Ok(_) => true,
        Err(GitError::GitNotFound) => {
            eprintln!("git not on PATH; skipping");
            false
        }
        Err(e) => panic!("git --version failed: {e}"),
    }
}

async fn stage(t: &TempRepo, paths: &[&str]) -> Result<(), GitError> {
    // A handle of its own, as the command's `open_private` is: `TempRepo`'s
    // cached index is stale the moment the CLI writes one.
    refuse_ignored(&git2::Repository::open(t.path()).expect("open"), paths)?;
    let stdin = stage_stdin(paths)?;
    let out = GitCli::new("git")
        .run(
            t.path(),
            "test",
            &stage_paths_args(),
            Some(stdin),
            CancellationToken::new(),
            |_| {},
        )
        .await
        .expect("run");
    check_staged(&out)
}

fn entry(t: &TempRepo, path: &str) -> Option<StatusEntry> {
    status(&t.repo)
        .expect("status")
        .entries
        .into_iter()
        .find(|e| e.path == path)
}

fn index_content(t: &TempRepo, path: &str) -> Option<String> {
    let mut index = t.repo.index().expect("index");
    index.read(false).expect("read index");
    let e = index.get_path(Path::new(path), 0)?;
    let blob = t.repo.find_blob(e.id).expect("blob");
    Some(String::from_utf8_lossy(blob.content()).into_owned())
}

#[tokio::test]
async fn stage_and_unstage_add_modify_delete() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[("m.txt", "m\n"), ("d.txt", "d\n")], "base");
    t.write("m.txt", "m2\n");
    t.write("new.txt", "n\n");
    std::fs::remove_file(t.path().join("d.txt")).unwrap();

    stage(&t, &["m.txt", "new.txt", "d.txt"]).await.unwrap();
    assert_eq!(
        entry(&t, "m.txt").unwrap().index,
        Some(FileStatus::Modified)
    );
    assert_eq!(entry(&t, "new.txt").unwrap().index, Some(FileStatus::Added));
    assert_eq!(entry(&t, "d.txt").unwrap().index, Some(FileStatus::Deleted));
    assert_eq!(index_content(&t, "m.txt").as_deref(), Some("m2\n"));
    assert!(status(&t.repo)
        .unwrap()
        .entries
        .iter()
        .all(|e| e.workdir.is_none()));

    // libgit2 picks up git's write before resetting from it.
    unstage_paths(&t.repo, &["m.txt", "new.txt", "d.txt"]).unwrap();
    let e = entry(&t, "m.txt").unwrap();
    assert_eq!((e.index, e.workdir), (None, Some(FileStatus::Modified)));
    let e = entry(&t, "new.txt").unwrap();
    assert_eq!((e.index, e.workdir), (None, Some(FileStatus::Untracked)));
    let e = entry(&t, "d.txt").unwrap();
    assert_eq!((e.index, e.workdir), (None, Some(FileStatus::Deleted)));
}

#[tokio::test]
async fn a_locked_index_is_index_locked_and_stages_nothing() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    t.write("f.txt", "v1\n");
    let lock = t.path().join(".git").join("index.lock");
    std::fs::write(&lock, "").unwrap();

    assert!(matches!(
        stage(&t, &["f.txt"]).await,
        Err(GitError::IndexLocked)
    ));
    let e = entry(&t, "f.txt").unwrap();
    assert_eq!((e.index, e.workdir), (None, Some(FileStatus::Modified)));

    std::fs::remove_file(&lock).unwrap();
    stage(&t, &["f.txt"]).await.unwrap();
    let e = entry(&t, "f.txt").unwrap();
    assert_eq!((e.index, e.workdir), (Some(FileStatus::Modified), None));
}

/// Refused before anything runs: the rest of the batch stays unstaged too.
#[tokio::test]
async fn an_ignored_untracked_file_refuses_the_batch_but_a_tracked_one_stages() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(
        &[
            (".gitignore", "*.log\n"),
            ("a.txt", "v0\n"),
            ("kept.log", "tracked\n"),
        ],
        "base",
    );
    t.write("a.txt", "v1\n");
    t.write("debug.log", "x\n");
    t.write("kept.log", "tracked, edited\n");

    assert!(matches!(
        stage(&t, &["a.txt", "debug.log"]).await,
        Err(GitError::Refused(m)) if m == "debug.log is ignored"
    ));
    let e = entry(&t, "a.txt").unwrap();
    assert_eq!((e.index, e.workdir), (None, Some(FileStatus::Modified)));
    assert!(index_content(&t, "debug.log").is_none());

    // Matching an ignore pattern does not un-track a file that is in the index.
    stage(&t, &["kept.log"]).await.unwrap();
    assert_eq!(
        entry(&t, "kept.log").unwrap().index,
        Some(FileStatus::Modified)
    );
}

/// A `!negation` un-ignores a path: `git check-ignore` without `-v` called it
/// ignored all the same on git 2.24–2.26, which is why the check is libgit2's.
#[tokio::test]
async fn a_negated_ignore_rule_stages() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[(".gitignore", "*.log\n!keep.log\n")], "base");
    t.write("keep.log", "k\n");
    t.write("debug.log", "d\n");

    stage(&t, &["keep.log"]).await.unwrap();
    assert_eq!(
        entry(&t, "keep.log").unwrap().index,
        Some(FileStatus::Added)
    );
    assert!(matches!(
        stage(&t, &["debug.log"]).await,
        Err(GitError::Refused(m)) if m == "debug.log is ignored"
    ));
}

#[tokio::test]
async fn stage_and_unstage_rename_both_halves() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[("old.txt", "same content\nfor rename\n")], "base");
    std::fs::rename(t.path().join("old.txt"), t.path().join("new.txt")).unwrap();

    stage(&t, &["old.txt", "new.txt"]).await.unwrap();
    let e = entry(&t, "new.txt").unwrap();
    assert_eq!(e.index, Some(FileStatus::Renamed));
    assert_eq!(e.old_path.as_deref(), Some("old.txt"));
    assert!(entry(&t, "old.txt").is_none());

    unstage_paths(&t.repo, &["old.txt", "new.txt"]).unwrap();
    let e = entry(&t, "new.txt").unwrap();
    assert_eq!((e.index, e.workdir), (None, Some(FileStatus::Renamed)));
}

#[tokio::test]
async fn stage_on_an_unborn_head() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.write("a.txt", "a\n");
    stage(&t, &["a.txt"]).await.unwrap();
    assert_eq!(entry(&t, "a.txt").unwrap().index, Some(FileStatus::Added));
}

/// Paths, not pathspecs: `f[1].txt` is not a glob that also takes `f1.txt`.
#[tokio::test]
async fn a_glob_character_in_a_name_matches_only_that_file() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[("base.txt", "b\n")], "base");
    t.write("f[1].txt", "x\n");
    t.write("f1.txt", "y\n");
    stage(&t, &["f[1].txt"]).await.unwrap();
    assert_eq!(
        entry(&t, "f[1].txt").unwrap().index,
        Some(FileStatus::Added)
    );
    assert_eq!(entry(&t, "f1.txt").unwrap().index, None);
}

/// Gone from disk and index alike (staged by a terminal since the list was
/// drawn): nothing to do, and the rest of the batch still stages.
#[tokio::test]
async fn a_path_gone_everywhere_is_a_no_op() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    t.write("f.txt", "v1\n");
    stage(&t, &["gone.txt", "f.txt"]).await.unwrap();
    assert_eq!(
        entry(&t, "f.txt").unwrap().index,
        Some(FileStatus::Modified)
    );
}

/// Status lists an untracked nested repository as `sub/`; libgit2 refused that
/// path, and `update-index` would skip it silently.
#[tokio::test]
async fn a_nested_repository_is_refused() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    let inner = git2::Repository::init(t.path().join("sub")).unwrap();
    std::fs::write(t.path().join("sub/x.txt"), "x\n").unwrap();
    let mut index = inner.index().unwrap();
    index.add_path(Path::new("x.txt")).unwrap();
    let tree = inner.find_tree(index.write_tree().unwrap()).unwrap();
    let sig = git2::Signature::now("t", "t@example.invalid").unwrap();
    inner
        .commit(Some("HEAD"), &sig, &sig, "inner", &tree, &[])
        .unwrap();
    assert_eq!(
        entry(&t, "sub/").unwrap().workdir,
        Some(FileStatus::Untracked)
    );

    assert!(matches!(
        stage(&t, &["sub/"]).await,
        Err(GitError::Refused(_))
    ));
    assert!(index_content(&t, "sub").is_none());
}

/// A moved submodule pointer stages as the new gitlink, as `add_path` did.
#[tokio::test]
async fn a_moved_submodule_pointer_stages() {
    if !have_git() {
        return;
    }
    let src = TempRepo::new();
    let first = src.commit(&[("s.txt", "1\n")], "s1");
    src.commit(&[("s.txt", "2\n")], "s2");
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    t.add_submodule("sub", &src);
    git2::Repository::open(t.path().join("sub"))
        .unwrap()
        .set_head_detached(first)
        .unwrap();
    assert_eq!(
        entry(&t, "sub").unwrap().workdir,
        Some(FileStatus::Modified)
    );

    stage(&t, &["sub"]).await.unwrap();
    // Only the index side: the checkout's files still hold `s2`, so it stays dirty.
    assert_eq!(entry(&t, "sub").unwrap().index, Some(FileStatus::Modified));
    let mut index = t.repo.index().unwrap();
    index.read(false).unwrap();
    assert_eq!(index.get_path(Path::new("sub"), 0).unwrap().id, first);
}

/// `subs/[ab]` as a pattern is `subs/a`. Run through git, because the argument's
/// shape proves nothing: `--literal-pathspecs` looked right and git ignored it.
#[tokio::test]
async fn updating_a_bracketed_submodule_leaves_its_glob_match_alone() {
    if !have_git() {
        return;
    }
    let src = TempRepo::new();
    let first = src.commit(&[("s.txt", "1\n")], "s1");
    let second = src.commit(&[("s.txt", "2\n")], "s2");
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    t.add_submodule("subs/[ab]", &src);
    t.add_submodule("subs/a", &src);
    let head = |sub: &str| {
        git2::Repository::open(t.path().join(sub))
            .unwrap()
            .refname_to_id("HEAD")
            .unwrap()
    };
    for sub in ["subs/[ab]", "subs/a"] {
        git2::Repository::open(t.path().join(sub))
            .unwrap()
            .set_head_detached(first)
            .unwrap();
    }

    let args = git_core::cli::ops::submodule_update(Some("subs/[ab]"));
    let argv: Vec<&str> = args.iter().map(String::as_str).collect();
    let out = GitCli::new("git")
        .run(
            t.path(),
            "op-sub",
            &argv,
            None,
            CancellationToken::new(),
            |_| {},
        )
        .await
        .expect("run");
    assert_eq!(out.code, 0, "{}", out.stderr);
    assert_eq!(head("subs/[ab]"), second);
    assert_eq!(head("subs/a"), first);
}
