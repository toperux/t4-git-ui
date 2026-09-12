//! Unmerged index entries: the three sides a merge editor needs, and resolving
//! a conflict by keeping one whole side (`git checkout --ours|--theirs` through
//! the CLI runner, then the libgit2 staging). The CLI-backed tests are skipped
//! at runtime when `git` is missing.

use std::path::Path;

use git_core::cli::GitCli;
use git_core::conflict;
use git_core::stage::{self, ConflictSide};
use git_core::test_util::TempRepo;
use git_core::tools::Tool;
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

/// Runs `args` in the repo through the same runner the app uses; panics on failure.
async fn git(t: &TempRepo, args: &[String]) {
    let argv: Vec<&str> = args.iter().map(String::as_str).collect();
    let out = GitCli::new("git")
        .run(
            t.path(),
            "test",
            &argv,
            None,
            CancellationToken::new(),
            |_| {},
        )
        .await
        .expect("run");
    out.check(&format!("git {}", argv.join(" "))).expect("git");
}

fn index_content(t: &TempRepo, path: &str) -> Option<String> {
    let mut index = t.repo.index().expect("index");
    index.read(false).expect("read index");
    let e = index.get_path(Path::new(path), 0)?;
    let blob = t.repo.find_blob(e.id).expect("blob");
    Some(String::from_utf8_lossy(blob.content()).into_owned())
}

/// `master` and `feat` both edit `f.txt`; `feat` also deletes `d.txt`, which
/// `master` edits — a modify/delete conflict, whose "theirs" side is absent.
fn conflicted() -> TempRepo {
    let t = TempRepo::new();
    let base = t.commit(&[("f.txt", "base\n"), ("d.txt", "base\n")], "base");
    t.branch("feat", base);
    t.checkout("feat");
    t.remove("d.txt");
    t.write("f.txt", "feat\n");
    t.stage(&["f.txt"]);
    let feat = t.commit_index("feat");
    t.checkout("master");
    t.commit(&[("f.txt", "master\n"), ("d.txt", "master\n")], "master");
    {
        let ann = t.repo.find_annotated_commit(feat).expect("annotated");
        t.repo.merge(&[&ann], None, None).expect("merge");
    }
    t
}

#[test]
fn stages_carry_every_side_that_exists() {
    let t = conflicted();

    let both = conflict::stages(&t.repo, "f.txt")
        .expect("stages")
        .expect("f.txt is conflicted");
    assert!(both.ancestor.is_some());
    assert!(both.ours.is_some());
    assert!(both.theirs.is_some());
    let ours = t.repo.find_blob(both.ours.unwrap()).expect("ours");
    let theirs = t.repo.find_blob(both.theirs.unwrap()).expect("theirs");
    assert_eq!(ours.content(), b"master\n");
    assert_eq!(theirs.content(), b"feat\n");

    // Deleted on their side: the merge editor gets an empty "theirs".
    let deleted = conflict::stages(&t.repo, "d.txt")
        .expect("stages")
        .expect("d.txt is conflicted");
    assert!(deleted.ours.is_some());
    assert_eq!(deleted.theirs, None);

    assert_eq!(
        conflict::stages(&t.repo, "nothing.txt").expect("stages"),
        None
    );
}

/// With a merge tool configured the three sides go to its command line; the
/// program here does not exist, which is the one thing a test may spawn.
#[test]
fn a_configured_merge_tool_that_is_not_installed_is_a_config_error() {
    let t = conflicted();
    let tool = Tool {
        name: "missing".into(),
        path: String::new(),
        cmd: r#""t4-no-such-tool" "$LOCAL" "$REMOTE" "$BASE" "$MERGED""#.into(),
    };
    let err = conflict::open_merge_editor(&t.repo, "f.txt", Some(&tool))
        .expect_err("the tool does not exist");
    assert!(
        matches!(&err, GitError::Config(m) if m.contains("t4-no-such-tool")),
        "{err}"
    );
    // A path that is not unmerged is still refused before anything is spawned.
    assert!(matches!(
        conflict::open_merge_editor(&t.repo, "nothing.txt", Some(&tool)),
        Err(GitError::Refused(_))
    ));
    // An absolute path would have replaced the working directory in the join.
    let abs = t.path().join("f.txt");
    let err = conflict::open_merge_editor(&t.repo, &abs.to_string_lossy(), Some(&tool))
        .expect_err("absolute");
    assert!(
        matches!(&err, GitError::Refused(m) if m.contains("inside the repository")),
        "{err}"
    );
}

/// The panel's guard for "the file on screen changed": an editor writing the
/// working file leaves every other field of the entry alone.
#[test]
fn resolving_a_conflict_on_disk_moves_the_stamp_and_nothing_else() {
    let t = conflicted();
    let before = entry(&t, "f.txt");
    assert!(before.conflicted);
    assert!(before.workdir_stamp.is_some());

    // Same shape as a merge editor saving its result.
    std::thread::sleep(std::time::Duration::from_millis(20));
    t.write("f.txt", "resolved\n");
    let after = entry(&t, "f.txt");

    assert_ne!(after.workdir_stamp, before.workdir_stamp);
    assert_eq!(
        (after.conflicted, after.index, after.workdir),
        (before.conflicted, before.index, before.workdir),
        "only the stamp may move — the letters are what used to be compared"
    );
}

#[tokio::test]
async fn keeping_a_side_that_exists_resolves_the_path() {
    if !have_git() {
        return;
    }
    let t = conflicted();
    let (present, missing) =
        stage::split_by_side(&t.repo, &["f.txt"], ConflictSide::Theirs).expect("split");
    assert_eq!((present, missing), (vec!["f.txt"], vec![]));

    git(
        &t,
        &stage::checkout_side_args(ConflictSide::Theirs, &["f.txt"]),
    )
    .await;
    // `git checkout --theirs` rewrites .git/index and leaves the path unmerged;
    // staging is what resolves it, and it must not write back a stale index.
    stage::stage_paths(&t.repo, &["f.txt"]).expect("stage");

    assert_eq!(conflict::stages(&t.repo, "f.txt").expect("stages"), None);
    assert_eq!(index_content(&t, "f.txt").as_deref(), Some("feat\n"));
    assert_eq!(
        std::fs::read_to_string(t.path().join("f.txt")).expect("read"),
        "feat\n"
    );
    // The other conflict is untouched.
    assert!(conflict::stages(&t.repo, "d.txt")
        .expect("stages")
        .is_some());
}

#[test]
fn a_side_the_other_branch_deleted_is_resolved_as_a_removal() {
    let t = conflicted();
    // `d.txt` has no stage 3: `checkout --theirs` could never produce it, and
    // one such path aborts the whole batch.
    let (present, missing) = stage::split_by_side(
        &t.repo,
        &["f.txt", "d.txt", "untracked.txt"],
        ConflictSide::Theirs,
    )
    .expect("split");
    assert_eq!(present, vec!["f.txt", "untracked.txt"]);
    assert_eq!(missing, vec!["d.txt"]);
    // Ours exists on both, so nothing is missing that way round.
    let (_, missing) =
        stage::split_by_side(&t.repo, &["f.txt", "d.txt"], ConflictSide::Ours).expect("split");
    assert!(missing.is_empty());

    stage::remove_paths(&t.repo, &["d.txt"]).expect("remove");
    assert_eq!(conflict::stages(&t.repo, "d.txt").expect("stages"), None);
    assert_eq!(index_content(&t, "d.txt"), None);
    assert!(!t.path().join("d.txt").exists());
}

/// A held `index.lock` must leave the conflict whole on both sides: the write
/// is rolled back, so the working file the row still needs must survive too.
#[test]
fn a_locked_index_leaves_the_stages_and_the_file() {
    let t = conflicted();
    let lock = t.path().join(".git").join("index.lock");
    std::fs::write(&lock, "").unwrap();

    assert!(matches!(
        stage::remove_paths(&t.repo, &["f.txt"]),
        Err(GitError::IndexLocked)
    ));
    let stages = conflict::stages(&t.repo, "f.txt")
        .expect("stages")
        .expect("f.txt is still conflicted");
    assert!(stages.ancestor.is_some());
    assert!(stages.ours.is_some());
    assert!(stages.theirs.is_some());
    assert!(t.path().join("f.txt").exists());
}

/// The ignore guard used to look at stage 0 only, which an unmerged path never
/// has — so a tracked, conflicted, ignored file was refused *after* the
/// checkout had already overwritten it.
#[test]
fn staging_a_conflicted_file_is_not_blocked_by_an_ignore_rule() {
    let t = conflicted();
    t.write(".gitignore", "*.txt\n");
    stage::stage_paths(&t.repo, &["f.txt"]).expect("stage");
    assert_eq!(conflict::stages(&t.repo, "f.txt").expect("stages"), None);
}

fn entry(t: &TempRepo, path: &str) -> git_core::status::StatusEntry {
    git_core::status::status(&t.repo)
        .expect("status")
        .entries
        .into_iter()
        .find(|e| e.path == path)
        .expect("entry")
}
