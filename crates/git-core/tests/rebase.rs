//! Interactive rebase against real git: the todo git generates, read through
//! the sequence editor, and an edited one replayed. Skips at runtime when
//! `git` is missing; nothing touches the network.

use std::path::PathBuf;

use git2::Sort;
use git_core::cli::rebase::{self, Action, RawKind, RawTodoLine, RebaseFlags, TodoStep};
use git_core::cli::{ops, CliOutput, GitCli};
use git_core::refs::RepoState;
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

async fn run(t: &TempRepo, args: &[String]) -> CliOutput {
    let argv: Vec<&str> = args.iter().map(String::as_str).collect();
    let out = GitCli::new("git")
        .run(
            t.path(),
            "op",
            &argv,
            None,
            CancellationToken::new(),
            |_| {},
        )
        .await
        .expect("run");
    // libgit2 caches the index; reload so status / state see the CLI's writes.
    t.repo.index().expect("index").read(true).expect("reload");
    out
}

fn t4_dir(t: &TempRepo) -> PathBuf {
    let dir = t.repo.path().join("t4-rebase");
    std::fs::create_dir_all(&dir).expect("mkdir");
    dir
}

/// The read step: git's own todo for `base`, parsed. Git must stop with
/// `nothing to do` and leave no rebase behind.
async fn read_todo(t: &TempRepo, base: &str, flags: &RebaseFlags) -> Vec<RawTodoLine> {
    let out_file = t4_dir(t).join("read.todo");
    let out = run(t, &rebase::read_args(base, flags, &out_file)).await;
    assert_ne!(out.code, 0, "read should refuse an empty todo: {out:?}");
    assert!(out.stderr.contains("nothing to do"), "{}", out.stderr);
    assert!(
        !t.repo.path().join("rebase-merge").exists(),
        "the read left a rebase in progress"
    );
    rebase::parse_todo(&std::fs::read_to_string(&out_file).expect("todo file"))
}

/// The pick lines' action and full oid, in order.
fn picks(t: &TempRepo, lines: &[RawTodoLine]) -> Vec<(Action, String)> {
    lines
        .iter()
        .filter_map(|l| match &l.kind {
            RawKind::Pick { action, oid, .. } => {
                Some((*action, rebase::commit_oid(&t.repo, oid).expect("pick oid")))
            }
            _ => None,
        })
        .collect()
}

fn head(t: &TempRepo) -> git2::Commit<'_> {
    t.repo
        .head()
        .expect("head")
        .peel_to_commit()
        .expect("commit")
}

/// Summaries from HEAD back to the root, newest first.
fn summaries(t: &TempRepo) -> Vec<String> {
    let mut walk = t.repo.revwalk().expect("revwalk");
    walk.set_sorting(Sort::TOPOLOGICAL).expect("sorting");
    walk.push_head().expect("push_head");
    walk.map(|o| {
        let c = t.repo.find_commit(o.expect("oid")).expect("commit");
        String::from_utf8_lossy(c.summary_bytes().unwrap_or_default()).into_owned()
    })
    .collect()
}

fn message(c: &git2::Commit<'_>) -> String {
    String::from_utf8_lossy(c.message_bytes()).into_owned()
}

fn line(text: String) -> TodoStep {
    TodoStep::Line { text }
}

async fn write_and_run(
    t: &TempRepo,
    base: &str,
    flags: &RebaseFlags,
    steps: &[TodoStep],
) -> CliOutput {
    let todo = rebase::write_todo(&t4_dir(t), steps, "git").expect("write_todo");
    run(t, &rebase::run_args(base, flags, &todo)).await
}

#[tokio::test]
async fn read_lists_picks_with_the_fixup_in_place_and_pops_the_autostash() {
    if !have_git() {
        return;
    }
    // A path with a space: the app's own checkout has one and the editor
    // strings go through `sh -c`.
    let t = TempRepo::with_space();
    assert!(t.path().to_string_lossy().contains(' '));
    let base = t.commit(&[("f.txt", "base\n")], "base");
    let a = t.commit(&[("a.txt", "a\n")], "A");
    let b = t.commit(&[("b.txt", "b\n")], "B");
    let fix = t.commit(&[("a.txt", "a2\n")], "fixup! A");
    t.write("f.txt", "dirty\n");

    let flags = RebaseFlags {
        autostash: true,
        ..Default::default()
    };
    let lines = read_todo(&t, &base.to_string(), &flags).await;
    assert_eq!(
        picks(&t, &lines),
        [
            (Action::Pick, a.to_string()),
            (Action::Fixup, fix.to_string()),
            (Action::Pick, b.to_string()),
        ],
        "{lines:?}"
    );
    assert_eq!(head(&t).id(), fix, "the read must not move HEAD");
    assert_eq!(
        std::fs::read_to_string(t.path().join("f.txt")).unwrap(),
        "dirty\n",
        "autostash was not restored"
    );
    let stashes = run(&t, &["stash".into(), "list".into()]).await;
    assert!(stashes.stdout.is_empty(), "{}", stashes.stdout);
}

#[tokio::test]
async fn rebase_merges_reads_the_merge_as_a_merge_line() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    let base = t.commit(&[("f.txt", "base\n")], "base");
    t.branch("side", base);
    t.checkout("side");
    let s = t.commit(&[("s.txt", "s\n")], "S");
    t.checkout("master");
    let m = t.commit(&[("m.txt", "m\n")], "M");
    let merge = t.merge_commit("merge side", &[m, s]);

    let flags = RebaseFlags {
        rebase_merges: true,
        ..Default::default()
    };
    let lines = read_todo(&t, &base.to_string(), &flags).await;
    let merges: Vec<String> = lines
        .iter()
        .filter_map(|l| match &l.kind {
            RawKind::Merge { oid } => Some(
                rebase::commit_oid(&t.repo, oid.as_deref().expect("merge -C oid")).expect("oid"),
            ),
            _ => None,
        })
        .collect();
    assert_eq!(merges, [merge.to_string()], "{lines:?}");
    let mut oids: Vec<String> = picks(&t, &lines).into_iter().map(|(_, oid)| oid).collect();
    oids.sort();
    let mut want = vec![m.to_string(), s.to_string()];
    want.sort();
    assert_eq!(oids, want, "{lines:?}");
}

#[tokio::test]
async fn a_head_already_on_the_base_has_no_picks() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[("f.txt", "base\n")], "base");
    let lines = read_todo(&t, "HEAD", &RebaseFlags::default()).await;
    assert!(picks(&t, &lines).is_empty(), "{lines:?}");
}

#[tokio::test]
async fn run_reorders_fixes_up_and_amends() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    let base = t.commit(&[("f.txt", "base\n")], "base");
    let a = t.commit(&[("a.txt", "a\n")], "A");
    let b = t.commit(&[("b.txt", "b\n")], "B");
    let c = t.commit(&[("c.txt", "c\n")], "C");

    let steps = [
        line(format!("pick {b} B")),
        line(format!("pick {a} A")),
        line(format!("fixup {c} C")),
        TodoStep::Amend {
            message: "A and C\n\nsquashed\n".into(),
        },
    ];
    let out = write_and_run(&t, &base.to_string(), &RebaseFlags::default(), &steps).await;
    assert_eq!(out.code, 0, "{}\n{}", out.stderr, out.stdout);
    assert_eq!(RepoState::from(t.repo.state()), RepoState::Clean);
    assert_eq!(summaries(&t), ["A and C", "B", "base"]);
    assert_eq!(message(&head(&t)), "A and C\n\nsquashed\n");
    assert_eq!(
        std::fs::read_to_string(t.path().join("c.txt")).unwrap(),
        "c\n",
        "the fixup's change was lost"
    );
}

#[tokio::test]
async fn an_edit_stop_exits_zero_and_continue_finishes() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    let base = t.commit(&[("f.txt", "base\n")], "base");
    let a = t.commit(&[("a.txt", "a\n")], "A");
    let b = t.commit(&[("b.txt", "b\n")], "B");

    let steps = [line(format!("edit {a} A")), line(format!("pick {b} B"))];
    let out = write_and_run(&t, &base.to_string(), &RebaseFlags::default(), &steps).await;
    assert_eq!(out.code, 0, "an edit stop exits 0: {}", out.stderr);
    assert!(out.stderr.contains("Stopped at"), "{}", out.stderr);
    assert!(t.repo.path().join("rebase-merge").exists());
    assert_eq!(RepoState::from(t.repo.state()), RepoState::Rebase);

    let out = run(&t, &ops::rebase_continue()).await;
    assert_eq!(out.code, 0, "{}\n{}", out.stderr, out.stdout);
    assert_eq!(RepoState::from(t.repo.state()), RepoState::Clean);
    assert_eq!(summaries(&t), ["B", "A", "base"]);
}

#[tokio::test]
async fn an_update_ref_after_the_amend_moves_the_branch_to_the_reworded_commit() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    let base = t.commit(&[("f.txt", "base\n")], "base");
    let a = t.commit(&[("a.txt", "a\n")], "A");
    let b = t.commit(&[("b.txt", "b\n")], "B");
    t.branch("side", a);

    let steps = [
        line(format!("pick {a} A")),
        TodoStep::Amend {
            message: "A reworded\n".into(),
        },
        // After the amend: recorded before it, the ref would point at the
        // commit the amend orphans.
        line("update-ref refs/heads/side".into()),
        line(format!("pick {b} B")),
    ];
    let flags = RebaseFlags {
        update_refs: true,
        ..Default::default()
    };
    let out = write_and_run(&t, &base.to_string(), &flags, &steps).await;
    assert_eq!(out.code, 0, "{}\n{}", out.stderr, out.stdout);
    assert_eq!(RepoState::from(t.repo.state()), RepoState::Clean);
    assert_eq!(summaries(&t), ["B", "A reworded", "base"]);
    let side = t
        .repo
        .find_reference("refs/heads/side")
        .expect("side")
        .peel_to_commit()
        .expect("commit");
    assert_eq!(message(&side), "A reworded\n");
    assert_eq!(side.id(), head(&t).parent_id(0).unwrap());
}

#[tokio::test]
async fn a_failing_hook_leaves_the_amend_exec_paused() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    let base = t.commit(&[("f.txt", "base\n")], "base");
    let a = t.commit(&[("a.txt", "a\n")], "A");
    let hooks = t.path().join("hooks");
    std::fs::create_dir_all(&hooks).unwrap();
    let hook = hooks.join("pre-commit");
    std::fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    t.set_config("core.hooksPath", "hooks");

    let steps = [
        line(format!("pick {a} A")),
        TodoStep::Amend {
            message: "rejected\n".into(),
        },
    ];
    let out = write_and_run(&t, &base.to_string(), &RebaseFlags::default(), &steps).await;
    assert_ne!(out.code, 0, "{}", out.stdout);
    assert!(out.stderr.contains("execution failed"), "{}", out.stderr);
    assert!(t.repo.path().join("rebase-merge").exists());
    assert_eq!(RepoState::from(t.repo.state()), RepoState::Rebase);
}
