//! Interactive rebase: reading git's todo list and writing back an edited one.
//!
//! `git rebase -i` generates the todo itself — autosquash order,
//! `--rebase-merges` structure, `--update-refs` lines — and hands it to the
//! *sequence editor*. The app plays that editor twice ([`read_args`] copies the
//! list out and empties it, [`run_args`] hands the edited one back), so none of
//! git's todo generation is reimplemented here. Both editor strings and the
//! `exec` lines [`write_todo`] emits go through `sh -c`, hence
//! [`check_shell_path`].
//!
//! [`parse_todo`] is pure — no repository needed — and [`resolve_lines`] looks
//! up the commits it named afterwards.

use std::path::{Path, PathBuf};

use git2::Repository;
use serde::{Deserialize, Serialize};

use crate::repo::map_git2;
use crate::GitError;

/// What a pick-family todo line does to its commit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    Pick,
    Reword,
    Edit,
    Squash,
    Fixup,
    Drop,
}

/// A todo line as parsed, before its oid is looked up.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RawKind {
    Pick {
        action: Action,
        oid: String,
        /// `fixup -C` / `-c`: the fixup replaces the message too.
        amend: bool,
    },
    /// `merge [-C <oid>] <label>`; the oid is absent when git is asked to
    /// create a fresh merge commit.
    Merge {
        oid: Option<String>,
    },
    UpdateRef,
    /// `label` / `reset` / `noop` / `exec` / `break`, blanks and comments.
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawTodoLine {
    pub kind: RawKind,
    /// Git's line, verbatim — what goes back in the edited todo.
    pub text: String,
}

/// The commit a todo line names, as the dialog shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoCommit {
    pub oid: String,
    pub short: String,
    pub summary: String,
    /// Full message (the reword / squash textarea is prefilled with it).
    pub message: String,
}

/// A todo line with its commit resolved.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum TodoLine {
    Pick {
        action: Action,
        text: String,
        commit: TodoCommit,
        /// `fixup -C` / `-c`: the fixup replaces the message too.
        amend: bool,
    },
    Merge {
        text: String,
        commit: Option<TodoCommit>,
    },
    UpdateRef {
        text: String,
    },
    Other {
        text: String,
    },
}

/// One entry of the edited list: a literal todo line, or the amend that gives
/// the commit before it a new message.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TodoStep {
    Line { text: String },
    Amend { message: String },
}

/// The whole list as read, with what HEAD and the base resolved to at the time
/// (the run refuses if either has moved since).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebaseTodo {
    pub head: String,
    pub base_oid: String,
    pub lines: Vec<TodoLine>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct RebaseFlags {
    pub autostash: bool,
    pub rebase_merges: bool,
    pub update_refs: bool,
}

fn action(word: &str) -> Option<Action> {
    Some(match word {
        "pick" | "p" => Action::Pick,
        "reword" | "r" => Action::Reword,
        "edit" | "e" => Action::Edit,
        "squash" | "s" => Action::Squash,
        "fixup" | "f" => Action::Fixup,
        "drop" | "d" => Action::Drop,
        _ => return None,
    })
}

/// Parses git's todo list. Only the command word and the oid are trusted: git
/// 2.55 writes `pick <oid> # <subject>` and older git `pick <oid> <subject>`,
/// so subjects come from the object database instead. Anything unrecognised is
/// [`RawKind::Other`] and travels through untouched.
pub fn parse_todo(text: &str) -> Vec<RawTodoLine> {
    text.lines()
        .map(|line| {
            let mut words = line.split_whitespace();
            let cmd = words.next().unwrap_or_default();
            let flagged = matches!(words.clone().next(), Some("-C" | "-c"));
            if flagged {
                words.next();
            }
            let kind = match action(cmd) {
                // `fixup -C <oid>` (from an `amend!` commit) also takes that
                // commit's message. `-c` is the same with an editor first, and
                // the app runs git with none, so it is recorded as `-C`: the
                // message the editor would have opened is the one that lands.
                Some(action) => match words.next() {
                    Some(oid) => RawKind::Pick {
                        action,
                        oid: oid.to_string(),
                        amend: flagged,
                    },
                    None => RawKind::Other,
                },
                // `merge -C <oid> <label>`: without the flag the next word is a
                // label, not a commit.
                None if cmd == "merge" || cmd == "m" => RawKind::Merge {
                    oid: flagged.then(|| words.next().map(str::to_string)).flatten(),
                },
                None if cmd == "update-ref" || cmd == "u" => RawKind::UpdateRef,
                None => RawKind::Other,
            };
            RawTodoLine {
                kind,
                text: line.to_string(),
            }
        })
        .collect()
}

/// Full oid of the commit `rev` names.
pub fn commit_oid(repo: &Repository, rev: &str) -> Result<String, GitError> {
    Ok(commit(repo, rev)?.id().to_string())
}

fn commit<'a>(repo: &'a Repository, rev: &str) -> Result<git2::Commit<'a>, GitError> {
    repo.revparse_single(rev)
        .and_then(|o| o.peel_to_commit())
        .map_err(map_git2)
}

fn todo_commit(repo: &Repository, rev: &str) -> Result<TodoCommit, GitError> {
    let c = commit(repo, rev)?;
    let oid = c.id().to_string();
    Ok(TodoCommit {
        short: oid[..7].to_string(),
        oid,
        summary: String::from_utf8_lossy(c.summary_bytes().unwrap_or_default()).into_owned(),
        message: String::from_utf8_lossy(c.message_bytes()).into_owned(),
    })
}

/// Looks up the commits a parsed todo names. Split from [`parse_todo`] so the
/// parser needs no repository.
pub fn resolve_lines(repo: &Repository, raw: Vec<RawTodoLine>) -> Result<Vec<TodoLine>, GitError> {
    raw.into_iter()
        .map(|l| {
            Ok(match l.kind {
                RawKind::Pick { action, oid, amend } => TodoLine::Pick {
                    action,
                    text: l.text,
                    commit: todo_commit(repo, &oid)?,
                    amend,
                },
                RawKind::Merge { oid } => TodoLine::Merge {
                    text: l.text,
                    commit: oid.map(|o| todo_commit(repo, &o)).transpose()?,
                },
                RawKind::UpdateRef => TodoLine::UpdateRef { text: l.text },
                RawKind::Other => TodoLine::Other { text: l.text },
            })
        })
        .collect()
}

/// Path as the `sh -c` strings need it: forward slashes. Callers guard the
/// repository path with [`check_shell_path`] first.
fn shell_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace(std::path::MAIN_SEPARATOR, "/")
}

/// The path the sequence editor and `exec` lines will name, or the reason it
/// cannot be used. Those strings go through `sh -c`, where a quote, a `$` or a
/// backtick escapes the double quotes around the path and a surviving `\` (a
/// literal one — the separator is normalised away) is eaten by the shell.
/// Spaces are fine.
pub fn check_shell_path(path: &Path) -> Result<String, String> {
    let s = shell_path(path);
    match s
        .chars()
        .find(|c| matches!(c, '\'' | '"' | '$' | '`' | '\\'))
    {
        Some(c) => Err(format!(
            "This repository's path contains {c}, which an interactive rebase cannot quote: {s}"
        )),
        None => Ok(s),
    }
}

fn rebase_args(editor: String, autosquash: bool, flags: &RebaseFlags) -> Vec<String> {
    let mut a = vec![
        "-c".to_string(),
        format!("sequence.editor={editor}"),
        "rebase".to_string(),
        "-i".to_string(),
    ];
    if autosquash {
        a.push("--autosquash".into());
    }
    if flags.rebase_merges {
        a.push("--rebase-merges".into());
    }
    if flags.update_refs {
        a.push("--update-refs".into());
    }
    if flags.autostash {
        a.push("--autostash".into());
    }
    a
}

/// Args that dump the todo git would have opened to `out` and empty the
/// original, so git stops with `nothing to do` (exit 1), removes
/// `rebase-merge/`, leaves HEAD alone and pops the autostash.
/// `--autosquash` is always on: `fixup!` / `squash!` commits arrive pre-marked.
pub fn read_args(base: &str, flags: &RebaseFlags, out: &Path) -> Vec<String> {
    let out = shell_path(out);
    let mut a = rebase_args(
        format!("sh -c 'cp \"$1\" \"{out}\" && : > \"$1\"' _"),
        true,
        flags,
    );
    // Ends option parsing, so a base named `--exec=<cmd>` stays a ref.
    a.push("--end-of-options".into());
    a.push(base.into());
    a
}

/// Args that replace git's todo with `todo` and replay it. No `--autosquash`:
/// the list is already what the user approved. The copy is a write-then-rename,
/// not a plain `cp`: a cancel landing inside the copy would otherwise leave a
/// truncated todo for a later `--continue` to replay, silently dropping commits.
pub fn run_args(base: &str, flags: &RebaseFlags, todo: &Path) -> Vec<String> {
    let todo = shell_path(todo);
    let mut a = rebase_args(
        format!("sh -c 'cp \"{todo}\" \"$1.t4\" && mv \"$1.t4\" \"$1\"' _"),
        false,
        flags,
    );
    a.push("--end-of-options".into());
    a.push(base.into());
    a
}

/// Whether `base` is in `head`'s history — `head` itself counts. "Rebase from
/// here" moves the current branch, so a row from some other branch (the graph
/// can show them all) has to be refused rather than replayed onto.
pub fn is_ancestor(repo: &Repository, head: &str, base: &str) -> Result<bool, GitError> {
    let (head, base) = (oid(head)?, oid(base)?);
    Ok(head == base || repo.graph_descendant_of(head, base).map_err(map_git2)?)
}

fn oid(s: &str) -> Result<git2::Oid, GitError> {
    git2::Oid::from_str(s).map_err(map_git2)
}

/// Writes the edited list into `dir` (cleared first, so a previous run's
/// message files cannot be picked up). Each [`TodoStep::Amend`] becomes a
/// `msg-N.txt` file plus the `exec` line that applies it. Returns the todo file.
///
/// The `exec` lines run under `sh`, so a configured `git_path` is checked and
/// quoted; the default bare `git` is left as it is.
pub fn write_todo(dir: &Path, steps: &[TodoStep], git_path: &str) -> Result<PathBuf, GitError> {
    let git = check_shell_path(Path::new(git_path)).map_err(GitError::Refused)?;
    let git = if git == "git" {
        git
    } else {
        format!("\"{git}\"")
    };
    if let Err(e) = std::fs::remove_dir_all(dir) {
        if e.kind() != std::io::ErrorKind::NotFound {
            return Err(e.into());
        }
    }
    std::fs::create_dir_all(dir)?;
    let base = shell_path(dir);
    let mut lines = Vec::new();
    let mut msgs = 0;
    for step in steps {
        match step {
            TodoStep::Line { text } => lines.push(text.clone()),
            TodoStep::Amend { message } => {
                let name = format!("msg-{msgs}.txt");
                std::fs::write(dir.join(&name), message)?;
                lines.push(format!("exec {git} commit --amend -F \"{base}/{name}\""));
                msgs += 1;
            }
        }
    }
    let todo = dir.join("todo");
    std::fs::write(&todo, lines.join("\n") + "\n")?;
    Ok(todo)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kinds(text: &str) -> Vec<RawKind> {
        parse_todo(text).into_iter().map(|l| l.kind).collect()
    }

    fn pick(action: Action, oid: &str) -> RawKind {
        RawKind::Pick {
            action,
            oid: oid.into(),
            amend: false,
        }
    }

    #[test]
    fn parses_both_subject_formats_and_the_one_letter_forms() {
        // git 2.55 writes `# <subject>`, older git writes the subject bare.
        let text = "pick 1111111 # first\nreword 2222222 second\ns 3333333 # third\n\
                    f 4444444 fourth\nd 5555555 # fifth\ne 6666666 sixth\n";
        assert_eq!(
            kinds(text),
            [
                pick(Action::Pick, "1111111"),
                pick(Action::Reword, "2222222"),
                pick(Action::Squash, "3333333"),
                pick(Action::Fixup, "4444444"),
                pick(Action::Drop, "5555555"),
                pick(Action::Edit, "6666666"),
            ]
        );
        // `fixup -C` / `-c` (from an `amend!` commit) carries the new message.
        let amended = |oid: &str| RawKind::Pick {
            action: Action::Fixup,
            oid: oid.into(),
            amend: true,
        };
        assert_eq!(
            kinds("fixup -C 7777777 # amend! first\nfixup -c 8888888 # amend! second\n"),
            [amended("7777777"), amended("8888888")]
        );
        assert_eq!(
            kinds("fixup 7777777 # fixup! first\n"),
            [pick(Action::Fixup, "7777777")]
        );
        assert_eq!(
            parse_todo("pick 1111111 # first\n")[0].text,
            "pick 1111111 # first"
        );
    }

    #[test]
    fn parses_a_rebase_merges_todo() {
        let text = "label onto\n\n# Branch side\nreset onto\npick aaaaaaa # side work\n\
                    label side\n\nreset onto\npick bbbbbbb # main work\n\
                    update-ref refs/heads/main\nmerge -C ccccccc side # merge side\n\
                    merge dddddd fresh\nnoop\n";
        assert_eq!(
            kinds(text),
            [
                RawKind::Other, // label onto
                RawKind::Other, // blank
                RawKind::Other, // comment
                RawKind::Other, // reset onto
                pick(Action::Pick, "aaaaaaa"),
                RawKind::Other, // label side
                RawKind::Other,
                RawKind::Other,
                pick(Action::Pick, "bbbbbbb"),
                RawKind::UpdateRef,
                RawKind::Merge {
                    oid: Some("ccccccc".into())
                },
                // No `-C`: a fresh merge, not a commit we can name.
                RawKind::Merge { oid: None },
                RawKind::Other, // noop
            ]
        );
        assert_eq!(kinds("u refs/heads/x\n"), [RawKind::UpdateRef]);
        assert!(parse_todo("").is_empty());
    }

    #[test]
    fn writes_message_files_and_exec_lines() {
        let dir = tempfile::tempdir().expect("tempdir");
        let dir = dir.path().join("t4-rebase");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("stale.txt"), "old").unwrap();
        let steps = vec![
            TodoStep::Line {
                text: "pick 1111111 first".into(),
            },
            TodoStep::Amend {
                message: "new first\n".into(),
            },
            TodoStep::Line {
                text: "pick 2222222 second".into(),
            },
            TodoStep::Amend {
                message: "new second\n".into(),
            },
        ];
        let todo = write_todo(&dir, &steps, "git").expect("write_todo");
        assert_eq!(todo, dir.join("todo"));
        let base = shell_path(&dir);
        assert_eq!(
            std::fs::read_to_string(&todo).unwrap(),
            format!(
                "pick 1111111 first\nexec git commit --amend -F \"{base}/msg-0.txt\"\n\
                 pick 2222222 second\nexec git commit --amend -F \"{base}/msg-1.txt\"\n"
            )
        );
        assert_eq!(
            std::fs::read_to_string(dir.join("msg-0.txt")).unwrap(),
            "new first\n"
        );
        assert_eq!(
            std::fs::read_to_string(dir.join("msg-1.txt")).unwrap(),
            "new second\n"
        );
        assert!(!dir.join("stale.txt").exists(), "dir was not cleared");
    }

    #[test]
    fn exec_lines_name_the_configured_git() {
        let dir = tempfile::tempdir().expect("tempdir");
        let dir = dir.path().join("t4-rebase");
        let steps = vec![TodoStep::Amend {
            message: "msg\n".into(),
        }];
        let todo =
            write_todo(&dir, &steps, "C:/Program Files/Git/bin/git.exe").expect("write_todo");
        let base = shell_path(&dir);
        assert_eq!(
            std::fs::read_to_string(&todo).unwrap(),
            format!(
                "exec \"C:/Program Files/Git/bin/git.exe\" commit --amend -F \"{base}/msg-0.txt\"\n"
            )
        );
        assert!(write_todo(&dir, &steps, "/opt/g$t/git").is_err());
    }

    #[test]
    fn args_for_every_flag() {
        let out = Path::new("/tmp/t4 repo/.git/t4-rebase/read.todo");
        assert_eq!(
            read_args("main", &RebaseFlags::default(), out),
            [
                "-c",
                "sequence.editor=sh -c 'cp \"$1\" \"/tmp/t4 repo/.git/t4-rebase/read.todo\" && : > \"$1\"' _",
                "rebase",
                "-i",
                "--autosquash",
                "--end-of-options",
                "main",
            ]
        );
        let flags = RebaseFlags {
            autostash: true,
            rebase_merges: true,
            update_refs: true,
        };
        assert_eq!(
            read_args("abc123", &flags, out)[4..],
            [
                "--autosquash",
                "--rebase-merges",
                "--update-refs",
                "--autostash",
                "--end-of-options",
                "abc123"
            ]
        );
        let todo = Path::new("/tmp/t4 repo/.git/t4-rebase/todo");
        assert_eq!(
            run_args("main", &RebaseFlags::default(), todo),
            [
                "-c",
                "sequence.editor=sh -c 'cp \"/tmp/t4 repo/.git/t4-rebase/todo\" \"$1.t4\" && mv \"$1.t4\" \"$1\"' _",
                "rebase",
                "-i",
                "--end-of-options",
                "main",
            ]
        );
        assert_eq!(
            run_args("main", &flags, todo)[4..],
            [
                "--rebase-merges",
                "--update-refs",
                "--autostash",
                "--end-of-options",
                "main"
            ]
        );
    }

    #[test]
    fn resolves_the_commits_a_todo_names() {
        let t = crate::test_util::TempRepo::new();
        let a = t.commit(&[("f.txt", "a")], "A subject\n\nbody\n");
        let short = &a.to_string()[..7];
        let lines = resolve_lines(
            &t.repo,
            parse_todo(&format!(
                "pick {short} # A subject\nmerge -C {short} side\nupdate-ref refs/heads/x\nlabel onto\n"
            )),
        )
        .expect("resolve");
        let commit = TodoCommit {
            oid: a.to_string(),
            short: short.to_string(),
            summary: "A subject".into(),
            message: "A subject\n\nbody\n".into(),
        };
        assert_eq!(
            lines,
            [
                TodoLine::Pick {
                    action: Action::Pick,
                    text: format!("pick {short} # A subject"),
                    commit: commit.clone(),
                    amend: false,
                },
                TodoLine::Merge {
                    text: format!("merge -C {short} side"),
                    commit: Some(commit),
                },
                TodoLine::UpdateRef {
                    text: "update-ref refs/heads/x".into(),
                },
                TodoLine::Other {
                    text: "label onto".into(),
                },
            ]
        );
        assert_eq!(commit_oid(&t.repo, "HEAD").unwrap(), a.to_string());
        assert!(resolve_lines(&t.repo, parse_todo("pick 0000000 # gone\n")).is_err());
    }

    #[test]
    fn an_ancestor_of_head_is_recognised_and_a_sibling_is_not() {
        let t = crate::test_util::TempRepo::new();
        let root = t.commit(&[("f.txt", "a")], "root");
        let side = t.commit(&[("f.txt", "b")], "side");
        t.detach(root);
        let other = t.commit(&[("g.txt", "c")], "other").to_string();
        assert!(is_ancestor(&t.repo, &other, &root.to_string()).unwrap());
        assert!(is_ancestor(&t.repo, &other, &other).unwrap(), "head itself");
        assert!(!is_ancestor(&t.repo, &other, &side.to_string()).unwrap());
        assert!(is_ancestor(&t.repo, &other, "nope").is_err());
    }

    #[test]
    fn shell_unsafe_paths_are_refused() {
        assert_eq!(
            check_shell_path(Path::new("/tmp/t4 repo/.git")).unwrap(),
            "/tmp/t4 repo/.git"
        );
        for bad in ["/tmp/it's/.git", "/tmp/a\"b/.git", "/tmp/a$b/.git"] {
            let err = check_shell_path(Path::new(bad)).expect_err(bad);
            assert!(err.contains("cannot quote"), "{err}");
        }
    }
}
