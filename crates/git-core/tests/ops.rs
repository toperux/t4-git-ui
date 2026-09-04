//! Branch / remote / stash ops end to end: arg builders → CLI runner against a
//! local bare "remote", plus the git2-backed ref mutations. CLI tests skip at
//! runtime when `git` is missing; nothing touches the network.

use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use git2::{Repository, RepositoryInitOptions};
use git_core::cli::ops::{self, FfMode, MergeOpts, OpFailure, PullMode};
use git_core::cli::{CliEvent, CliOutput, GitCli};
use git_core::refs::{self, snapshot, RepoState};
use git_core::status::status;
use git_core::test_util::TempRepo;
use git_core::GitError;
use tempfile::TempDir;
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

/// A bare repository usable as a local remote; `.1` is its path as a URL.
fn bare_remote() -> (TempDir, String) {
    let dir = tempfile::tempdir().expect("tempdir");
    let mut opts = RepositoryInitOptions::new();
    opts.bare(true).initial_head("master");
    Repository::init_opts(dir.path(), &opts).expect("init bare");
    let url = dir.path().to_string_lossy().into_owned();
    (dir, url)
}

fn add_origin(t: &TempRepo, url: &str) {
    t.repo.remote("origin", url).expect("remote add");
}

async fn run(dir: &Path, args: &[String]) -> (CliOutput, Vec<CliEvent>) {
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&events);
    let argv: Vec<&str> = args.iter().map(String::as_str).collect();
    let out = GitCli::new("git")
        .run(dir, "op", &argv, None, CancellationToken::new(), move |e| {
            sink.lock().unwrap().push(e)
        })
        .await
        .expect("run");
    let events = events.lock().unwrap().clone();
    (out, events)
}

async fn run_ok(t: &TempRepo, args: &[String]) -> CliOutput {
    let (out, _) = run(t.path(), args).await;
    assert_eq!(
        out.code,
        0,
        "git {}: {}\n{}",
        args.join(" "),
        out.stderr,
        out.stdout
    );
    reload(t);
    out
}

/// libgit2 caches the index; reload so status / diffs see the CLI's writes.
fn reload(t: &TempRepo) {
    t.repo.index().expect("index").read(true).expect("reload");
}

fn head(t: &TempRepo) -> git2::Oid {
    t.repo.head().expect("head").target().expect("oid")
}

fn ref_oid(t: &TempRepo, name: &str) -> Option<git2::Oid> {
    t.repo.find_reference(name).ok().and_then(|r| r.target())
}

fn failure(out: &CliOutput) -> OpFailure {
    assert_ne!(out.code, 0, "expected failure, got success: {}", out.stdout);
    ops::classify_failure(out.code, &out.stdout, &out.stderr)
}

/// `t1` has commit A pushed to a bare origin; `t2` has fetched it and checked
/// out `master` at A.
async fn pair() -> (TempRepo, TempRepo, TempDir, git2::Oid) {
    let t1 = TempRepo::new();
    let a = t1.commit(&[("f.txt", "1\n")], "A");
    let (bare, url) = bare_remote();
    add_origin(&t1, &url);
    run_ok(
        &t1,
        &ops::push("origin", Some("master"), true, false, false),
    )
    .await;

    let t2 = TempRepo::new();
    add_origin(&t2, &url);
    run_ok(&t2, &ops::fetch(Some("origin"), false, false)).await;
    assert_eq!(ref_oid(&t2, "refs/remotes/origin/master"), Some(a));
    t2.reference("refs/heads/master", a);
    t2.checkout("master");
    t2.set_upstream("master", "origin/master");
    (t1, t2, bare, a)
}

#[tokio::test]
async fn push_streams_then_reports_up_to_date() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    let a = t.commit(&[("f.txt", "1\n")], "A");
    let (_bare, url) = bare_remote();
    add_origin(&t, &url);

    let (out, events) = run(
        t.path(),
        &ops::push("origin", Some("master"), true, false, false),
    )
    .await;
    assert_eq!(out.code, 0, "{}", out.stderr);
    assert!(
        matches!(&events[0], CliEvent::Started { op_id, cmd } if op_id == "op" && cmd.starts_with("git push --progress -u"))
    );
    assert!(matches!(
        events.last(),
        Some(CliEvent::Exit { code: 0, .. })
    ));
    assert!(
        events.iter().any(|e| matches!(
            e,
            CliEvent::Stderr { .. } | CliEvent::Stdout { .. } | CliEvent::Progress { .. }
        )),
        "no output lines: {events:?}"
    );

    let mut t = t;
    let snap = snapshot(&mut t.repo).unwrap();
    let master = snap.local.iter().find(|b| b.name == "master").unwrap();
    assert_eq!(master.upstream.as_deref(), Some("origin/master"));
    assert_eq!((master.ahead, master.behind), (0, 0));
    assert_eq!(ref_oid(&t, "refs/remotes/origin/master"), Some(a));

    let out = run_ok(
        &t,
        &ops::push("origin", Some("master"), false, false, false),
    )
    .await;
    assert!(
        out.stderr.contains("Everything up-to-date"),
        "{}",
        out.stderr
    );
}

#[tokio::test]
async fn fetch_updates_remote_tracking_and_pull_ff_only_fast_forwards() {
    if !have_git() {
        return;
    }
    let (t1, mut t2, _bare, a) = pair().await;
    assert_eq!(head(&t2), a);

    let b = t1.commit(&[("f.txt", "2\n")], "B");
    run_ok(
        &t1,
        &ops::push("origin", Some("master"), false, false, false),
    )
    .await;

    run_ok(&t2, &ops::fetch(None, true, false)).await; // --all
    assert_eq!(ref_oid(&t2, "refs/remotes/origin/master"), Some(b));
    assert_eq!(head(&t2), a, "fetch must not move HEAD");
    let snap = snapshot(&mut t2.repo).unwrap();
    let master = snap.local.iter().find(|b| b.name == "master").unwrap();
    assert_eq!((master.ahead, master.behind), (0, 1));

    run_ok(
        &t2,
        &ops::pull(Some("origin"), Some("master"), PullMode::FfOnly),
    )
    .await;
    assert_eq!(head(&t2), b);
    assert_eq!(
        std::fs::read_to_string(t2.path().join("f.txt")).unwrap(),
        "2\n"
    );
}

#[tokio::test]
async fn pull_ff_only_on_diverged_history_is_non_fast_forward() {
    if !have_git() {
        return;
    }
    let (t1, t2, _bare, _a) = pair().await;
    let c = t2.commit(&[("local.txt", "c\n")], "C");
    t1.commit(&[("f.txt", "d\n")], "D");
    run_ok(
        &t1,
        &ops::push("origin", Some("master"), false, false, false),
    )
    .await;

    let (out, _) = run(
        t2.path(),
        &ops::pull(Some("origin"), Some("master"), PullMode::FfOnly),
    )
    .await;
    assert_eq!(failure(&out), OpFailure::NonFastForward, "{}", out.stderr);
    assert_eq!(head(&t2), c, "failed pull must not move HEAD");

    // And the push side of the same divergence.
    let (out, _) = run(
        t2.path(),
        &ops::push("origin", Some("master"), false, false, false),
    )
    .await;
    assert_eq!(failure(&out), OpFailure::NonFastForward, "{}", out.stderr);
}

/// `master` and `feat` both edit `f.txt` from a common base.
fn conflicting_branches(t: &TempRepo) -> (git2::Oid, git2::Oid) {
    let base = t.commit(&[("f.txt", "base\n")], "base");
    t.branch("feat", base);
    t.checkout("feat");
    let feat = t.commit(&[("f.txt", "feat\n")], "feat");
    t.checkout("master");
    let master = t.commit(&[("f.txt", "master\n")], "master");
    (master, feat)
}

#[tokio::test]
async fn merge_conflict_is_classified_then_abort_cleans() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    let (master, _feat) = conflicting_branches(&t);

    let (out, _) = run(t.path(), &ops::merge("feat", &MergeOpts::default())).await;
    match failure(&out) {
        OpFailure::Conflicts { paths } => assert_eq!(paths, ["f.txt"]),
        other => panic!("{other:?}\n{}\n{}", out.stdout, out.stderr),
    }
    reload(&t);
    let st = status(&t.repo).unwrap();
    assert_eq!(st.conflicted, 1);
    assert_eq!(ops::parse_conflicts(&st), ["f.txt"]);
    assert_eq!(RepoState::from(t.repo.state()), RepoState::Merge);

    run_ok(&t, &ops::merge_abort()).await;
    let st = status(&t.repo).unwrap();
    assert_eq!((st.conflicted, st.staged, st.unstaged), (0, 0, 0));
    assert_eq!(RepoState::from(t.repo.state()), RepoState::Clean);
    assert_eq!(head(&t), master);

    // A clean merge with --no-ff creates a merge commit.
    t.branch("side", master);
    t.checkout("side");
    let side = t.commit(&[("g.txt", "g\n")], "side");
    t.checkout("master");
    run_ok(
        &t,
        &ops::merge(
            "side",
            &MergeOpts {
                ff: FfMode::No,
                squash: false,
                message: Some("merge side".into()),
            },
        ),
    )
    .await;
    let h = t.repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(h.parent_count(), 2);
    assert_eq!(h.parent_id(1).unwrap(), side);
    assert_eq!(h.summary().unwrap(), Some("merge side"));
}

#[tokio::test]
async fn rebase_conflict_then_abort_restores_head() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    let (_master, feat) = conflicting_branches(&t);
    t.checkout("feat");

    let (out, _) = run(t.path(), &ops::rebase("master")).await;
    assert!(
        matches!(failure(&out), OpFailure::Conflicts { .. }),
        "{}\n{}",
        out.stdout,
        out.stderr
    );
    reload(&t);
    assert_eq!(ops::parse_conflicts(&status(&t.repo).unwrap()), ["f.txt"]);
    assert_eq!(RepoState::from(t.repo.state()), RepoState::Rebase);

    run_ok(&t, &ops::rebase_abort()).await;
    assert_eq!(RepoState::from(t.repo.state()), RepoState::Clean);
    assert_eq!(head(&t), feat);
    assert_eq!(status(&t.repo).unwrap().conflicted, 0);

    // Resolve and continue: the editor is disabled so this cannot hang.
    let (out, _) = run(t.path(), &ops::rebase("master")).await;
    assert_ne!(out.code, 0);
    t.write("f.txt", "resolved\n");
    t.stage(&["f.txt"]);
    run_ok(&t, &ops::rebase_continue()).await;
    assert_eq!(RepoState::from(t.repo.state()), RepoState::Clean);
    let h = t.repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(h.summary().unwrap(), Some("feat"));
    assert_ne!(h.id(), feat);
}

#[tokio::test]
async fn checkout_creates_branch_and_detaches() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    let a = t.commit(&[("f.txt", "1\n")], "A");
    run_ok(&t, &ops::checkout("master", Some("topic"), false)).await;
    let h = refs::head_info(&t.repo).unwrap();
    assert_eq!((h.branch.as_deref(), h.detached), (Some("topic"), false));
    assert_eq!(ref_oid(&t, "refs/heads/topic"), Some(a));

    let detach = vec!["checkout".into(), "--detach".into(), a.to_string()];
    run_ok(&t, &detach).await;
    let h = refs::head_info(&t.repo).unwrap();
    assert_eq!((h.branch, h.detached), (None, true));

    run_ok(&t, &ops::checkout("master", None, false)).await;
    assert_eq!(
        refs::head_info(&t.repo).unwrap().branch.as_deref(),
        Some("master")
    );
}

#[tokio::test]
async fn stash_push_and_pop_round_trip() {
    if !have_git() {
        return;
    }
    let mut t = TempRepo::new();
    t.commit(&[("f.txt", "1\n")], "A");
    t.write("f.txt", "2\n");
    t.write("new.txt", "n\n");

    run_ok(&t, &ops::stash_push(Some("wip work"), true, false)).await;
    assert_eq!(
        std::fs::read_to_string(t.path().join("f.txt")).unwrap(),
        "1\n"
    );
    assert!(!t.path().join("new.txt").exists());
    let stashes = snapshot(&mut t.repo).unwrap().stashes;
    assert_eq!(stashes.len(), 1);
    assert!(stashes[0].message.contains("wip work"), "{:?}", stashes[0]);

    run_ok(&t, &ops::stash_pop(0)).await;
    assert_eq!(
        std::fs::read_to_string(t.path().join("f.txt")).unwrap(),
        "2\n"
    );
    assert!(t.path().join("new.txt").exists());
    assert!(snapshot(&mut t.repo).unwrap().stashes.is_empty());

    run_ok(&t, &ops::stash_push(None, false, false)).await;
    run_ok(&t, &ops::stash_apply(0)).await;
    assert_eq!(snapshot(&mut t.repo).unwrap().stashes.len(), 1);
    run_ok(&t, &ops::stash_drop(0)).await;
    assert!(snapshot(&mut t.repo).unwrap().stashes.is_empty());
}

#[tokio::test]
async fn delete_remote_branch_removes_ref_on_remote() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    let a = t.commit(&[("f.txt", "1\n")], "A");
    t.branch("topic", a);
    let (bare, url) = bare_remote();
    add_origin(&t, &url);
    run_ok(&t, &ops::push("origin", Some("topic"), false, false, false)).await;
    let remote = Repository::open_bare(bare.path()).unwrap();
    assert!(remote.find_reference("refs/heads/topic").is_ok());

    run_ok(&t, &ops::delete_remote_branch("origin", "topic")).await;
    assert!(remote.find_reference("refs/heads/topic").is_err());
    assert!(ref_oid(&t, "refs/remotes/origin/topic").is_none());
}

#[tokio::test]
async fn cancel_kills_push_and_its_hook() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[("f.txt", "1\n")], "A");
    let (bare, url) = bare_remote();
    add_origin(&t, &url);
    // A pre-push hook that sleeps: git → sh → sleep must all die on cancel.
    let hooks = t.path().join("hooks");
    std::fs::create_dir_all(&hooks).unwrap();
    let hook = hooks.join("pre-push");
    std::fs::write(&hook, "#!/bin/sh\nsleep 30\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    t.set_config("core.hooksPath", "hooks");

    let cancel = CancellationToken::new();
    let canceller = cancel.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(300)).await;
        canceller.cancel();
    });
    let args = ops::push("origin", Some("master"), false, false, false);
    let argv: Vec<&str> = args.iter().map(String::as_str).collect();
    let started = Instant::now();
    let res = GitCli::new("git")
        .run(t.path(), "op", &argv, None, cancel, |_| {})
        .await;
    let elapsed = started.elapsed();
    assert!(matches!(res, Err(GitError::Cancelled)), "{res:?}");
    assert!(
        elapsed < Duration::from_millis(800),
        "cancel took {elapsed:?}"
    );
    let remote = Repository::open_bare(bare.path()).unwrap();
    assert!(
        remote.find_reference("refs/heads/master").is_err(),
        "push went through"
    );
}

// ---- git2-backed ref mutations (no CLI) ----

#[test]
fn create_and_rename_branch() {
    let t = TempRepo::new();
    let a = t.commit(&[("f.txt", "1\n")], "A");
    let b = refs::create_branch(&t.repo, "x", "master", false).unwrap();
    assert_eq!(
        (b.name.as_str(), b.oid.as_str(), b.is_head),
        ("x", a.to_string().as_str(), false)
    );
    assert!(refs::create_branch(&t.repo, "x", "master", false).is_err());
    assert!(refs::create_branch(&t.repo, "y", "no-such-rev", false).is_err());
    let c = t.commit(&[("f.txt", "2\n")], "B");
    let moved = refs::create_branch(&t.repo, "x", &c.to_string(), true).unwrap();
    assert_eq!(moved.oid, c.to_string());

    refs::rename_branch(&t.repo, "x", "z", false).unwrap();
    assert!(ref_oid(&t, "refs/heads/x").is_none());
    assert_eq!(ref_oid(&t, "refs/heads/z"), Some(c));
    refs::create_branch(&t.repo, "w", "master", false).unwrap();
    assert!(refs::rename_branch(&t.repo, "z", "w", false).is_err());
    refs::rename_branch(&t.repo, "z", "w", true).unwrap();
    assert_eq!(ref_oid(&t, "refs/heads/w"), Some(c));
}

#[test]
fn delete_branch_refuses_unmerged_and_current_unless_forced() {
    let t = TempRepo::new();
    let a = t.commit(&[("f.txt", "1\n")], "A");
    t.branch("merged", a);
    t.commit(&[("f.txt", "2\n")], "B");
    assert!(refs::is_merged_into_head(&t.repo, "merged").unwrap());
    refs::delete_branch(&t.repo, "merged", false).unwrap();
    assert!(ref_oid(&t, "refs/heads/merged").is_none());

    t.branch("unmerged", a);
    t.checkout("unmerged");
    t.commit(&[("u.txt", "u\n")], "U");
    t.checkout("master");
    assert!(!refs::is_merged_into_head(&t.repo, "unmerged").unwrap());
    match refs::delete_branch(&t.repo, "unmerged", false) {
        Err(GitError::Refused(m)) => assert!(m.contains("not fully merged"), "{m}"),
        other => panic!("{other:?}"),
    }
    assert!(ref_oid(&t, "refs/heads/unmerged").is_some());
    refs::delete_branch(&t.repo, "unmerged", true).unwrap();
    assert!(ref_oid(&t, "refs/heads/unmerged").is_none());

    assert!(matches!(
        refs::delete_branch(&t.repo, "master", true),
        Err(GitError::Refused(_))
    ));
    assert!(refs::delete_branch(&t.repo, "nope", true).is_err());

    // Merged into its upstream (but not HEAD) also counts, as with `git branch -d`.
    t.branch("up", a);
    t.checkout("up");
    let u2 = t.commit(&[("v.txt", "v\n")], "V");
    t.checkout("master");
    t.remote("origin");
    t.reference("refs/remotes/origin/up", u2);
    t.set_upstream("up", "origin/up");
    refs::delete_branch(&t.repo, "up", false).unwrap();
}

#[test]
fn create_tag_lightweight_and_annotated_then_delete() {
    let mut t = TempRepo::new();
    let a = t.commit(&[("f.txt", "1\n")], "A");
    let b = t.commit(&[("f.txt", "2\n")], "B");

    let lw = refs::create_tag(&t.repo, "lw", &a.to_string(), None).unwrap();
    assert_eq!(
        (lw.name.as_str(), lw.oid.as_str()),
        ("lw", a.to_string().as_str())
    );
    assert_eq!(ref_oid(&t, "refs/tags/lw"), Some(a));

    let ann = refs::create_tag(&t.repo, "ann", "HEAD", Some("release notes")).unwrap();
    assert_eq!(ann.oid, b.to_string());
    {
        let r = t.repo.find_reference("refs/tags/ann").unwrap();
        let tag = r.peel_to_tag().expect("annotated tag object");
        assert_eq!(tag.message().unwrap(), Some("release notes"));
        assert_eq!(tag.target_id(), b);
        assert_eq!(tag.tagger().unwrap().email().unwrap(), "test@example.com");
    }

    assert!(refs::create_tag(&t.repo, "ann", "HEAD", None).is_err());
    // A tag made from an annotated tag points at its commit, not at the tag object.
    let from_tag = refs::create_tag(&t.repo, "from-ann", "ann", None).unwrap();
    assert_eq!(from_tag.oid, b.to_string());
    assert_eq!(ref_oid(&t, "refs/tags/from-ann"), Some(b));
    // Both are peeled to a commit in the snapshot, so the annotation is the only
    // thing left that tells them apart.
    let snap = snapshot(&mut t.repo).unwrap();
    let messages: Vec<(&str, Option<&str>)> = snap
        .tags
        .iter()
        .map(|t| (t.name.as_str(), t.message.as_deref()))
        .collect();
    assert_eq!(
        messages,
        [
            ("ann", Some("release notes")),
            ("from-ann", None),
            ("lw", None)
        ]
    );
    assert_eq!(lw.message, None);
    assert_eq!(ann.message.as_deref(), Some("release notes"));

    let names: Vec<String> = snapshot(&mut t.repo)
        .unwrap()
        .tags
        .into_iter()
        .map(|t| format!("{}@{}", t.name, &t.oid[..7]))
        .collect();
    assert_eq!(
        names,
        [
            format!("ann@{}", &b.to_string()[..7]),
            format!("from-ann@{}", &b.to_string()[..7]),
            format!("lw@{}", &a.to_string()[..7])
        ]
    );

    refs::delete_tag(&t.repo, "lw").unwrap();
    refs::delete_tag(&t.repo, "ann").unwrap();
    refs::delete_tag(&t.repo, "from-ann").unwrap();
    assert!(refs::delete_tag(&t.repo, "ann").is_err());
    assert!(snapshot(&mut t.repo).unwrap().tags.is_empty());

    t.set_config("user.email", "");
    assert!(matches!(
        refs::create_tag(&t.repo, "x", "HEAD", Some("m")),
        Err(GitError::Config(_))
    ));
}

#[tokio::test]
async fn staging_an_unresolved_file_is_undone_by_checkout_merge() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    conflicting_branches(&t);
    let (out, _) = run(t.path(), &ops::merge("feat", &MergeOpts::default())).await;
    assert!(
        matches!(failure(&out), OpFailure::Conflicts { .. }),
        "{}",
        out.stderr
    );
    reload(&t);
    assert_eq!(status(&t.repo).unwrap().conflicted, 1);

    // `git add` on an unmerged path *is* "mark resolved": the three stages go, and
    // no reset brings them back — the markers just sit in the file as a change.
    run_ok(&t, &["add".into(), "f.txt".into()]).await;
    run_ok(
        &t,
        &["reset".into(), "-q".into(), "--".into(), "f.txt".into()],
    )
    .await;
    reload(&t);
    let st = status(&t.repo).unwrap();
    assert_eq!(st.conflicted, 0);
    assert_eq!(st.unstaged, 1);

    run_ok(&t, &git_core::stage::recreate_conflict_args(&["f.txt"])).await;
    reload(&t);
    assert_eq!(status(&t.repo).unwrap().conflicted, 1);
    let body = std::fs::read_to_string(t.path().join("f.txt")).expect("read");
    assert!(body.contains("<<<<<<<"), "{body}");
}
