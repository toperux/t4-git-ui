//! Which commit last touched each line of a file, grouped into hunks —
//! `git blame --porcelain` through the CLI runner.
//!
//! The CLI rather than git2 because libgit2's blame is O(history × file) and
//! has no whitespace option. Blame is a **read**: nothing is forwarded to the
//! output dock and it does not take the op lock.
//!
//! The runner keeps only the last [`crate::cli::runner`] `MAX_RETAINED` bytes
//! of each stream, and porcelain output is several times the file's own size,
//! so the parser consumes the **event stream** a line at a time and never
//! looks at `CliOutput::stdout`.

use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

use crate::cli::runner::display_cmd;
use crate::cli::{CliEvent, GitCli};
use crate::tree::TreeTarget;
use crate::GitError;

/// The commit *and* path a hunk's lines came from before this commit touched
/// them (porcelain's `previous` header). Both, because "Blame parent" across a
/// rename needs the name the file had there — which is why this is per hunk and
/// not read off the commit's parent list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlameParent {
    pub oid: String,
    pub path: String,
}

/// Consecutive lines of the blamed file that one commit is responsible for.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlameHunk {
    /// First line of the hunk in the blamed file, 1-based.
    pub start: usize,
    pub lines: usize,
    pub oid: String,
    pub short: String,
    pub author: String,
    /// Author time (UTC seconds), as the log rows carry it.
    pub time: i64,
    pub summary: String,
    /// What the file was called at `oid`, when a rename has moved it since.
    pub orig_path: Option<String>,
    /// `oid` is all zeroes: the lines are in the working tree, uncommitted.
    pub uncommitted: bool,
    pub previous: Option<BlameParent>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Blame {
    /// The path that was asked for; a hunk's `orig_path` is what it used to be.
    pub path: String,
    pub hunks: Vec<BlameHunk>,
}

/// `git -c core.quotePath=false blame --porcelain [-w] [<rev>] --end-of-options -- <path>`.
///
/// The revision sits *before* the separator, unlike every other builder here:
/// blame reads `--end-of-options <rev> -- <path>` as two revisions and fails
/// with "bad revision <path>". Nothing shields the revision, so [`blame`]
/// checks it is an oid before calling this; the path — the argument that comes
/// from outside — is behind both separators. `core.quotePath=false` keeps a
/// non-ASCII `filename` header readable, so it still compares equal to the path
/// we asked for.
pub fn blame_args(target: &TreeTarget, path: &str, ignore_ws: bool) -> Vec<String> {
    let mut a = vec![
        "-c".to_string(),
        "core.quotePath=false".to_string(),
        "blame".to_string(),
        "--porcelain".to_string(),
    ];
    if ignore_ws {
        a.push("-w".into());
    }
    if let TreeTarget::Commit { oid } = target {
        a.push(oid.clone());
    }
    a.push("--end-of-options".into());
    a.push("--".into());
    a.push(path.to_string());
    a
}

/// Blames `path` at `target`. `op_id` and `cancel` are the runner's own
/// (registered like an operation's, so the process tree dies with a cancel).
pub async fn blame(
    cli: &GitCli,
    repo_dir: &Path,
    op_id: &str,
    target: &TreeTarget,
    path: &str,
    ignore_ws: bool,
    cancel: CancellationToken,
) -> Result<Blame, GitError> {
    // The revision goes into argv ahead of `--end-of-options`, where an
    // option-shaped one (`--contents=<path>`) would be read as an option.
    if let TreeTarget::Commit { oid } = target {
        git2::Oid::from_str(oid)
            .map_err(|_| GitError::Refused(format!("{oid} is not a commit id")))?;
    }
    let args = blame_args(target, path, ignore_ws);
    let argv: Vec<&str> = args.iter().map(String::as_str).collect();
    let mut parser = Parser::new(path);
    let out = cli
        .run(repo_dir, op_id, &argv, None, cancel, |event| {
            if let CliEvent::Stdout { lines } = event {
                for line in &lines {
                    parser.line(line);
                }
            }
        })
        .await?;
    out.check(&display_cmd(&argv))?;
    Ok(Blame {
        path: path.to_string(),
        hunks: parser.finish(),
    })
}

/// Author, time and summary of one commit: porcelain emits them **once** per
/// commit in the stream, so later hunks of the same commit read them here.
#[derive(Debug, Default, Clone)]
struct Meta {
    author: String,
    time: i64,
    summary: String,
}

/// The hunk whose header has been seen but whose metadata lines are still
/// arriving. `filename` and `previous` are repeated for every hunk, which is
/// what makes them per-hunk fields rather than per-commit ones.
#[derive(Debug)]
struct Open {
    oid: String,
    start: usize,
    lines: usize,
    filename: Option<String>,
    previous: Option<BlameParent>,
}

/// Line-at-a-time porcelain reader: a header line opens a hunk, the lines that
/// follow describe it, and the next header (or [`Parser::finish`]) closes it.
#[derive(Debug)]
struct Parser<'a> {
    path: &'a str,
    meta: HashMap<String, Meta>,
    hunks: Vec<BlameHunk>,
    open: Option<Open>,
}

impl<'a> Parser<'a> {
    fn new(path: &'a str) -> Self {
        Parser {
            path,
            meta: HashMap::new(),
            hunks: Vec::new(),
            open: None,
        }
    }

    fn line(&mut self, line: &str) {
        // A content line (`\t<text>`) says nothing the hunk doesn't.
        if line.starts_with('\t') {
            return;
        }
        if let Some(open) = header(line) {
            self.close();
            self.open = Some(open);
            return;
        }
        // Two disjoint fields at once (`meta` while `open` is borrowed), which
        // the borrow checker only sees through a destructuring.
        let Parser { meta, open, .. } = self;
        let Some(open) = open.as_mut() else { return };
        let (key, value) = line.split_once(' ').unwrap_or((line, ""));
        match key {
            "filename" => open.filename = Some(value.to_string()),
            "previous" => {
                open.previous = value.split_once(' ').map(|(oid, path)| BlameParent {
                    oid: oid.to_string(),
                    path: path.to_string(),
                })
            }
            "author" | "author-time" | "summary" => {
                let m = meta.entry(open.oid.clone()).or_default();
                match key {
                    "author" => m.author = value.to_string(),
                    "author-time" => m.time = value.parse().unwrap_or_default(),
                    _ => m.summary = value.to_string(),
                }
            }
            // `author-mail`, `author-tz`, every `committer*`, `boundary`: the
            // gutter shows none of them.
            _ => {}
        }
    }

    /// Emits the open hunk. Its commit's metadata is in the map by now — it
    /// arrives between this header and the next one.
    fn close(&mut self) {
        let Some(open) = self.open.take() else { return };
        let meta = self.meta.get(&open.oid).cloned().unwrap_or_default();
        let short = open.oid[..7.min(open.oid.len())].to_string();
        let uncommitted = open.oid.bytes().all(|b| b == b'0');
        self.hunks.push(BlameHunk {
            start: open.start,
            lines: open.lines,
            oid: open.oid,
            short,
            author: meta.author,
            time: meta.time,
            summary: meta.summary,
            orig_path: open.filename.filter(|f| f.as_str() != self.path),
            uncommitted,
            previous: open.previous,
        });
    }

    fn finish(mut self) -> Vec<BlameHunk> {
        self.close();
        self.hunks
    }
}

/// `<oid> <orig-line> <final-line> <num-lines>`, the form that opens a hunk.
/// The three-field variant repeats the commit for one more line of the hunk
/// already open and is not one.
fn header(line: &str) -> Option<Open> {
    let mut f = line.split(' ');
    let oid = f.next()?;
    if oid.len() < 40 || !oid.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let _orig_line: usize = f.next()?.parse().ok()?;
    let start: usize = f.next()?.parse().ok()?;
    let lines: usize = f.next()?.parse().ok()?;
    if f.next().is_some() {
        return None;
    }
    Some(Open {
        oid: oid.to_string(),
        start,
        lines,
        filename: None,
        previous: None,
    })
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

    fn parse(path: &str, text: &str) -> Vec<BlameHunk> {
        let mut p = Parser::new(path);
        for line in text.lines() {
            p.line(line);
        }
        p.finish()
    }

    const A: &str = "1111111111111111111111111111111111111111";
    const B: &str = "2222222222222222222222222222222222222222";
    const ZERO: &str = "0000000000000000000000000000000000000000";

    #[test]
    fn parses_hunks_a_rename_a_repeated_commit_and_uncommitted_lines() {
        // Two commits over `b.txt` (renamed from `a.txt` by B), B's second hunk
        // carrying no metadata of its own, and one line still on disk only.
        let out = format!(
            "\
{B} 1 1 1
author Bea
author-mail <bea@example.com>
author-time 1700000200
author-tz +0000
committer Bea
summary rename and edit
previous {A} a.txt
filename b.txt
\ttop
{A} 1 2 2
author Al
author-time 1700000100
summary first
filename a.txt
\tone
{A} 2 3
\ttwo
{B} 2 4 1
previous {A} a.txt
filename b.txt
\tbottom
{ZERO} 5 5 1
author Not Committed Yet
author-time 1700000300
summary Version of b.txt from b.txt
filename b.txt
\tdraft
"
        );
        let hunks = parse("b.txt", &out);
        assert_eq!(
            hunks.iter().map(|h| (h.start, h.lines)).collect::<Vec<_>>(),
            vec![(1, 1), (2, 2), (4, 1), (5, 1)],
            "one hunk per four-field header; the three-field line is not one"
        );

        assert_eq!(hunks[0].oid, B);
        assert_eq!(hunks[0].short, &B[..7]);
        assert_eq!(hunks[0].author, "Bea");
        assert_eq!(hunks[0].time, 1_700_000_200);
        assert_eq!(hunks[0].summary, "rename and edit");
        // `filename` equals the path asked for: not a rename as far as this hunk knows.
        assert_eq!(hunks[0].orig_path, None);
        assert_eq!(
            hunks[0].previous,
            Some(BlameParent {
                oid: A.to_string(),
                path: "a.txt".to_string()
            }),
            "the Blame-parent target, commit and pre-rename path"
        );

        // A's hunk carries the old name, and A itself has no `previous`: it is the root.
        assert_eq!(hunks[1].orig_path.as_deref(), Some("a.txt"));
        assert_eq!(hunks[1].author, "Al");
        assert_eq!(hunks[1].previous, None);

        // B's second hunk repeats no metadata; the map fills it in.
        assert_eq!(hunks[2].oid, B);
        assert_eq!(hunks[2].author, "Bea");
        assert_eq!(hunks[2].summary, "rename and edit");

        assert!(hunks[3].uncommitted, "the zero oid is an uncommitted line");
        assert!(hunks[..3].iter().all(|h| !h.uncommitted));
    }

    #[test]
    fn args_carry_the_revision_the_path_and_the_whitespace_option() {
        let commit = TreeTarget::Commit { oid: A.to_string() };
        assert_eq!(
            blame_args(&commit, "src/a.rs", false),
            vec![
                "-c",
                "core.quotePath=false",
                "blame",
                "--porcelain",
                A,
                "--end-of-options",
                "--",
                "src/a.rs"
            ]
        );
        // `-w` is the diff's own "ignore whitespace", asserted here rather than
        // by blaming the same fixture twice.
        assert_eq!(
            blame_args(&commit, "src/a.rs", true)[4],
            "-w",
            "the flag goes before the revision"
        );
        // The working tree has no revision at all, so uncommitted lines come
        // back as the zero oid.
        assert_eq!(
            blame_args(&TreeTarget::WorkingTree, "a.txt", false),
            vec![
                "-c",
                "core.quotePath=false",
                "blame",
                "--porcelain",
                "--end-of-options",
                "--",
                "a.txt"
            ]
        );
    }

    /// Two commits, the second renaming the file, plus an uncommitted edit.
    fn fixture() -> TempRepo {
        let t = TempRepo::new();
        t.commit(&[("a.txt", "one\ntwo\n")], "first");
        t.rename_file("a.txt", "b.txt");
        t.write("b.txt", "one\nTWO\n");
        t.stage(&["b.txt"]);
        t.commit_index("rename and edit");
        t.write("b.txt", "one\nTWO\nthree\n");
        t
    }

    #[tokio::test]
    async fn blames_a_commit_following_the_rename() {
        if !have_git() {
            return;
        }
        let t = fixture();
        let head = t
            .repo
            .head()
            .expect("head")
            .peel_to_commit()
            .expect("commit");
        let target = TreeTarget::Commit {
            oid: head.id().to_string(),
        };
        let out = blame(
            &GitCli::new("git"),
            t.path(),
            "op-1",
            &target,
            "b.txt",
            false,
            CancellationToken::new(),
        )
        .await
        .expect("blame");
        assert_eq!(out.path, "b.txt");
        assert_eq!(
            out.hunks
                .iter()
                .map(|h| (h.start, h.lines))
                .collect::<Vec<_>>(),
            vec![(1, 1), (2, 1)],
            "line 1 from the first commit, line 2 from the rename commit"
        );
        assert_eq!(out.hunks[0].summary, "first");
        assert_eq!(
            out.hunks[0].orig_path.as_deref(),
            Some("a.txt"),
            "the name the file had at the commit that wrote the line"
        );
        assert_eq!(out.hunks[1].oid, head.id().to_string());
        assert_eq!(out.hunks[1].summary, "rename and edit");
        assert_eq!(out.hunks[1].author, "Test");
        assert!(out.hunks.iter().all(|h| !h.uncommitted));
        // `previous` is what "Blame parent" jumps to, pre-rename path included.
        let prev = out.hunks[1].previous.as_ref().expect("a parent to blame");
        assert_eq!(prev.path, "a.txt");
        assert_eq!(prev.oid, head.parent(0).expect("parent").id().to_string());
    }

    #[tokio::test]
    async fn blames_the_working_tree_and_marks_the_uncommitted_line() {
        if !have_git() {
            return;
        }
        let t = fixture();
        let out = blame(
            &GitCli::new("git"),
            t.path(),
            "op-2",
            &TreeTarget::WorkingTree,
            "b.txt",
            false,
            CancellationToken::new(),
        )
        .await
        .expect("blame");
        let last = out.hunks.last().expect("three lines, three hunks");
        assert_eq!(last.start, 3);
        assert!(last.uncommitted, "{last:?}");
        assert_eq!(last.short, &ZERO[..7]);
    }

    #[tokio::test]
    async fn a_revision_that_is_not_an_oid_is_refused_before_the_spawn() {
        // The revision sits before `--end-of-options`, so anything option-shaped
        // here is an option to `blame` — `--contents=<path>` blames a file of
        // the caller's choosing. Refused without running anything.
        let err = blame(
            &GitCli::new("git"),
            Path::new("no/such/dir"),
            "op-4",
            &TreeTarget::Commit {
                oid: "--contents=x".to_string(),
            },
            "a.txt",
            false,
            CancellationToken::new(),
        )
        .await
        .expect_err("not a commit id");
        assert!(matches!(err, GitError::Refused(_)), "{err:?}");
    }

    #[tokio::test]
    async fn a_path_that_is_not_there_is_a_cli_error() {
        if !have_git() {
            return;
        }
        let t = fixture();
        let err = blame(
            &GitCli::new("git"),
            t.path(),
            "op-3",
            &TreeTarget::WorkingTree,
            "nope.txt",
            false,
            CancellationToken::new(),
        )
        .await
        .expect_err("no such path");
        assert!(matches!(err, GitError::Cli { .. }), "{err:?}");
    }
}
