//! File history — the commits that touched one path, renames followed.
//!
//! `git log --follow` rather than a revwalk with a diff per commit: `--follow`
//! is rename detection git already does well, and it hands back the name the
//! file had at every commit, which is the file the details pane preselects.
//! Like blame this is a **read**: no output-dock forwarding and no op lock.
//!
//! The output is `%H` plus one name-status entry per commit — tens of bytes a
//! row, so unlike blame's porcelain it fits the runner's captured `stdout`
//! (`MAX_RETAINED` is 4 MB, which one path would need ~50k commits to fill).

use std::path::Path;

use git2::Oid;
use tokio_util::sync::CancellationToken;

use super::types::RevSpec;
use crate::cli::runner::display_cmd;
use crate::cli::GitCli;
use crate::GitError;

/// `git -c core.quotePath=false log --follow --format=%H --name-status -z
/// [--all] --end-of-options [<rev>…] -- <path>`.
///
/// `git log` — unlike `git blame`, which reads the same shape as two revisions
/// — takes `--end-of-options` *before* the revisions, so the separator guards
/// them as well as the path (verified against git 2.55). `--all` is an option
/// and has to stay in front of it. `core.quotePath=false` keeps a non-ASCII
/// path unquoted, so it compares equal to the path we asked for, as in blame.
pub fn history_args(spec: &RevSpec, path: &str) -> Vec<String> {
    let mut a: Vec<String> = [
        "-c",
        "core.quotePath=false",
        "log",
        "--follow",
        "--format=%H",
        "--name-status",
        "-z",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    if matches!(spec, RevSpec::All) {
        a.push("--all".into());
    }
    a.push("--end-of-options".into());
    match spec {
        // `--all` covers this one; it is already in.
        RevSpec::All => {}
        RevSpec::Head => a.push("HEAD".into()),
        RevSpec::Refs(refs) => a.extend(refs.iter().cloned()),
    }
    a.push("--".into());
    a.push(path.to_string());
    a
}

/// Ordered `(commit, path at that commit)` pairs for `path` under `spec`,
/// newest first — the row source the walker uses instead of a revwalk.
/// `op_id` and `cancel` are the runner's own, registered like an operation's so
/// the process tree dies with a cancel (as blame does).
pub async fn path_history(
    cli: &GitCli,
    repo_dir: &Path,
    op_id: &str,
    spec: &RevSpec,
    path: &str,
    cancel: CancellationToken,
) -> Result<Vec<(Oid, String)>, GitError> {
    let args = history_args(spec, path);
    let argv: Vec<&str> = args.iter().map(String::as_str).collect();
    let out = cli
        .run(repo_dir, op_id, &argv, None, cancel, |_| {})
        .await?;
    out.check(&display_cmd(&argv))?;
    if out.truncated {
        // The tail is what survives, so the *oldest* commits would be the ones
        // kept: a history that long is not worth a wrong answer.
        return Err(GitError::Io(std::io::Error::other(format!(
            "history of {path} is too long to list"
        ))));
    }
    Ok(parse(&out.stdout, path)
        .into_iter()
        .filter_map(|(oid, at)| match Oid::from_str(&oid) {
            Ok(oid) => Some((oid, at)),
            Err(e) => {
                tracing::debug!(oid, error = %e, "skipping unparseable oid");
                None
            }
        })
        .collect())
}

/// Reads the `-z` stream positionally: a commit's oid, then its name-status
/// entry (a status code and the one or two paths it takes). Positional rather
/// than by shape, so a path that happens to look like an oid cannot be mistaken
/// for one.
///
/// `path` is the name at the newest commit; from there `inherit` carries the
/// name backwards, becoming the *source* of a rename, since that is what the
/// commits older than it knew the file as. A row with no entry of its own keeps
/// whatever `inherit` holds: a merge git's default path simplification keeps
/// prints no name-status at all.
fn parse(stdout: &str, path: &str) -> Vec<(String, String)> {
    let mut rows: Vec<(String, String)> = Vec::new();
    let mut inherit = path.to_string();
    // Paths still expected for the entry being read, and the source of a rename
    // once it has gone by.
    let mut want = 0usize;
    let mut src: Option<String> = None;
    for field in stdout.split('\0') {
        // git separates a commit's header from its diff with a newline even
        // under `-z`, so it arrives glued to the front of the status code.
        let f = field.strip_prefix('\n').unwrap_or(field);
        if f.is_empty() {
            continue;
        }
        if want > 0 {
            want -= 1;
            if want == 1 {
                src = Some(f.to_string());
            } else {
                // The last path is the destination: the name the file has *at*
                // this commit, and what the row shows.
                if let Some(last) = rows.last_mut() {
                    last.1 = f.to_string();
                }
                inherit = src.take().unwrap_or_else(|| f.to_string());
            }
            continue;
        }
        if let Some(n) = status_paths(f) {
            want = n;
            continue;
        }
        rows.push((f.to_string(), inherit.clone()));
    }
    rows
}

/// `M`, `A`, `R050`, `C075`: a name-status code, and how many paths follow it
/// (two for a rename or a copy — source then destination).
fn status_paths(f: &str) -> Option<usize> {
    let mut c = f.chars();
    let head = c.next()?;
    if !head.is_ascii_uppercase() || !c.all(|d| d.is_ascii_digit()) {
        return None;
    }
    Some(if matches!(head, 'R' | 'C') { 2 } else { 1 })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::TempRepo;

    fn have_git() -> bool {
        match crate::git_version("git") {
            Ok(_) => true,
            Err(GitError::GitNotFound) => {
                eprintln!("git not on PATH; skipping");
                false
            }
            Err(e) => panic!("git --version failed: {e}"),
        }
    }

    const A: &str = "1111111111111111111111111111111111111111";
    const B: &str = "2222222222222222222222222222222222222222";
    const C: &str = "3333333333333333333333333333333333333333";

    #[test]
    fn args_carry_the_spec_with_the_path_behind_both_separators() {
        assert_eq!(
            history_args(&RevSpec::Head, "src/a.rs"),
            vec![
                "-c",
                "core.quotePath=false",
                "log",
                "--follow",
                "--format=%H",
                "--name-status",
                "-z",
                "--end-of-options",
                "HEAD",
                "--",
                "src/a.rs"
            ]
        );
        // `--all` is an option: it has to precede the separator, and replaces
        // the revisions rather than joining them.
        let all = history_args(&RevSpec::All, "a.txt");
        assert_eq!(&all[7..], ["--all", "--end-of-options", "--", "a.txt"]);
        // Full ref names go after it, where a leading `-` can do no harm.
        let refs = RevSpec::Refs(vec!["refs/heads/main".into(), "refs/tags/v1".into()]);
        assert_eq!(
            &history_args(&refs, "a.txt")[7..],
            [
                "--end-of-options",
                "refs/heads/main",
                "refs/tags/v1",
                "--",
                "a.txt"
            ]
        );
    }

    #[test]
    fn parses_a_rename_and_a_commit_with_no_entry() {
        // Newest first: a plain edit, the rename that made the file `b.txt`,
        // a merge git kept but printed no diff for, and the add.
        let out = format!("{B}\0\nM\0b.txt\0{A}\0\nR050\0a.txt\0b.txt\0{C}\0{A}\0\nA\0a.txt\0");
        assert_eq!(
            parse(&out, "b.txt"),
            vec![
                (B.to_string(), "b.txt".to_string()),
                (A.to_string(), "b.txt".to_string()),
                // No entry of its own: the name is the one the newer row had.
                (C.to_string(), "a.txt".to_string()),
                (A.to_string(), "a.txt".to_string()),
            ]
        );
        // Empty history (a path git has never seen) is no rows, not an error.
        assert!(parse("", "b.txt").is_empty());
    }

    #[test]
    fn a_path_that_looks_like_a_status_code_is_still_a_path() {
        let out = format!("{A}\0\nR100\0M\0C075\0");
        assert_eq!(parse(&out, "M"), vec![(A.to_string(), "C075".to_string())]);
    }

    /// `a.txt` added, renamed to `b.txt` and edited, with an unrelated commit
    /// in between so the list is not simply every commit.
    fn fixture() -> TempRepo {
        let t = TempRepo::new();
        t.commit(&[("a.txt", "one\ntwo\n"), ("other.txt", "x\n")], "first");
        t.rename_file("a.txt", "b.txt");
        t.write("b.txt", "one\nTWO\n");
        t.stage(&["b.txt"]);
        t.commit_index("rename and edit");
        t.commit(&[("other.txt", "x\ny\n")], "unrelated");
        t
    }

    #[tokio::test]
    async fn follow_lists_the_path_under_both_of_its_names() {
        if !have_git() {
            return;
        }
        let t = fixture();
        let rows = path_history(
            &GitCli::new("git"),
            t.path(),
            "op-1",
            &RevSpec::Head,
            "b.txt",
            CancellationToken::new(),
        )
        .await
        .expect("history");
        let names: Vec<&str> = rows.iter().map(|(_, p)| p.as_str()).collect();
        assert_eq!(
            names,
            ["b.txt", "a.txt"],
            "the rename commit, then the add under the old name — and not `unrelated`"
        );
        let head = t
            .repo
            .head()
            .expect("head")
            .peel_to_commit()
            .expect("commit");
        assert_eq!(
            rows[0].0,
            head.parent(0).expect("parent").id(),
            "newest first, and the unrelated commit is not in the list"
        );
    }

    #[tokio::test]
    async fn a_path_with_no_history_is_an_empty_list() {
        if !have_git() {
            return;
        }
        let t = fixture();
        let rows = path_history(
            &GitCli::new("git"),
            t.path(),
            "op-2",
            &RevSpec::All,
            "nope.txt",
            CancellationToken::new(),
        )
        .await
        .expect("no such path is not an error");
        assert!(rows.is_empty());
    }

    /// `git -C <dir> <args>`, stdout as text — for the one thing libgit2 has no
    /// equivalent of here, making a stash.
    fn git(dir: &Path, args: &[&str]) -> String {
        let out = std::process::Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .output()
            .expect("run git");
        assert!(
            out.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        String::from_utf8_lossy(&out.stdout).into_owned()
    }

    /// Documents current behaviour, not a requirement: `RevSpec::All` is
    /// `git log --all`, whose ref set is *not* the revwalk's — `--all` walks
    /// `refs/stash` (and notes) as well, so a commit only the stash holds is in
    /// the history. If the history ever moves to a revwalk, this is where the
    /// difference surfaces.
    ///
    /// The commit checked is the stash's *index* commit (`refs/stash^2`): the
    /// `refs/stash` tip itself is a merge, which `--follow` simplifies away, so
    /// it is not the one that proves the ref set.
    #[tokio::test]
    async fn all_sees_a_commit_only_the_stash_reaches() {
        if !have_git() {
            return;
        }
        let t = TempRepo::new();
        t.commit(&[("a.txt", "one\n")], "first");
        // Staged *and* unstaged edits, so the index commit the stash records
        // touches `a.txt` and has a history row of its own.
        t.write("a.txt", "one\nstaged\n");
        t.stage(&["a.txt"]);
        t.write("a.txt", "one\nstaged\nwork\n");
        git(t.path(), &["stash"]);
        let stash = Oid::from_str(git(t.path(), &["rev-parse", "refs/stash^2"]).trim())
            .expect("stash index commit");

        let history = |spec: RevSpec, op: &'static str| {
            let dir = t.path().to_path_buf();
            async move {
                path_history(
                    &GitCli::new("git"),
                    &dir,
                    op,
                    &spec,
                    "a.txt",
                    CancellationToken::new(),
                )
                .await
                .expect("history")
            }
        };

        let all = history(RevSpec::All, "op-3").await;
        assert!(
            all.iter().any(|(oid, _)| *oid == stash),
            "--all walks refs/stash: {all:?}"
        );
        let head = history(RevSpec::Head, "op-4").await;
        assert!(
            !head.iter().any(|(oid, _)| *oid == stash),
            "nothing reachable from HEAD is the stash: {head:?}"
        );
    }
}
