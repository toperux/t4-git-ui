//! IPC shape tests: the JSON the frontend sees.

use std::path::PathBuf;

use git_core::log::{CommitInfo, GraphLine, GraphRow, LineKind, LogFilter, RevSpec};
use git_core::GitError;
use serde_json::{json, Value};

#[test]
fn rev_spec_round_trips() {
    let all: RevSpec = serde_json::from_value(json!({ "kind": "all" })).expect("all");
    assert_eq!(all, RevSpec::All);
    assert_eq!(
        serde_json::to_value(&all).expect("ser"),
        json!({ "kind": "all" })
    );

    let head: RevSpec = serde_json::from_value(json!({ "kind": "head" })).expect("head");
    assert_eq!(head, RevSpec::Head);

    let v = json!({ "kind": "refs", "refs": ["refs/heads/main"] });
    let refs: RevSpec = serde_json::from_value(v.clone()).expect("refs");
    assert_eq!(refs, RevSpec::Refs(vec!["refs/heads/main".into()]));
    assert_eq!(serde_json::to_value(&refs).expect("ser"), v);
}

#[test]
fn log_filter_working_tree_is_optional() {
    // The frontend omits the flag on a plain text filter.
    let f: LogFilter = serde_json::from_value(json!({ "text": null })).expect("filter");
    assert!(!f.working_tree);

    let v = serde_json::to_value(LogFilter {
        working_tree: true,
        ..Default::default()
    })
    .expect("ser");
    assert_eq!(v["workingTree"], true);
}

#[test]
fn graph_row_shape() {
    let row = GraphRow {
        commit: CommitInfo {
            oid: "a".repeat(40),
            short: "aaaaaaa".into(),
            summary: "s".into(),
            author_name: "n".into(),
            author_email: "e".into(),
            author_time: 1,
            committer_time: 2,
            parents: vec![],
            is_merge: false,
        },
        lane: 1,
        color: 2,
        lines: vec![GraphLine {
            from: 1,
            to: 2,
            color: 3,
            kind: LineKind::Straight,
        }],
        max_lane: 2,
        path: None,
    };
    let v = serde_json::to_value(&row).expect("ser");
    assert_eq!(v["maxLane"], 2);
    assert_eq!(v["lines"][0]["kind"], "straight");
    assert_eq!(v["lines"][0]["from"], 1);
    assert_eq!(v["commit"]["authorName"], "n");
    assert_eq!(v["commit"]["isMerge"], false);
    assert!(v.get("max_lane").is_none());
    let back: GraphRow = serde_json::from_value(v).expect("de");
    assert_eq!(back, row);
    assert_eq!(
        serde_json::to_value(LineKind::Branch).expect("ser"),
        Value::from("branch")
    );
    assert_eq!(
        serde_json::to_value(LineKind::Merge).expect("ser"),
        Value::from("merge")
    );
}

#[test]
fn git_error_shape() {
    let v = serde_json::to_value(GitError::NotARepo(PathBuf::from("x"))).expect("ser");
    assert_eq!(v["kind"], "notARepo");
    assert!(v["message"]
        .as_str()
        .expect("message")
        .contains("not a git repository"));
    assert_eq!(v.as_object().expect("obj").len(), 2);

    let kinds: Vec<&str> = [
        GitError::GitNotFound,
        GitError::IndexLocked,
        GitError::Cancelled,
        GitError::Conflicts(vec![]),
        GitError::InvalidPatch,
        GitError::Io(std::io::Error::other("io")),
        GitError::Cli {
            cmd: "git".into(),
            code: 1,
            stderr: String::new(),
        },
    ]
    .iter()
    .map(GitError::kind)
    .collect();
    assert_eq!(
        kinds,
        vec![
            "gitNotFound",
            "indexLocked",
            "cancelled",
            "conflicts",
            "invalidPatch",
            "io",
            "cli"
        ]
    );
}

/// `RefsSnapshot.conflictSides` and the side the UI sends back
/// (`src/api/types.ts`).
#[test]
fn conflict_sides_are_camel_case() {
    use git_core::refs::{ConflictSides, HeadInfo, RefsSnapshot, RepoState};
    use git_core::stage::ConflictSide;

    let snap = RefsSnapshot {
        head: HeadInfo {
            oid: Some("abc".into()),
            branch: Some("main".into()),
            detached: false,
        },
        state: RepoState::Merge,
        conflict_sides: Some(ConflictSides {
            ours: "main".into(),
            theirs: "feature".into(),
        }),
        local: vec![],
        remotes: vec![],
        tags: vec![],
        stashes: vec![],
    };
    let v = serde_json::to_value(&snap).expect("ser");
    assert_eq!(v["state"], "merge");
    assert_eq!(v["conflictSides"]["ours"], "main");
    assert_eq!(v["conflictSides"]["theirs"], "feature");
    assert!(v.get("conflict_sides").is_none());

    assert_eq!(
        serde_json::to_value(ConflictSide::Ours).expect("ser"),
        json!("ours")
    );
    assert_eq!(
        serde_json::to_value(ConflictSide::Theirs).expect("ser"),
        json!("theirs")
    );
}

#[test]
fn diff_target_round_trips() {
    use git_core::diff::DiffTarget;
    let cases = [
        (
            json!({ "kind": "commit", "oid": "abc" }),
            DiffTarget::Commit { oid: "abc".into() },
        ),
        (
            json!({ "kind": "commitRange", "from": "a", "to": "b" }),
            DiffTarget::CommitRange {
                from: "a".into(),
                to: "b".into(),
            },
        ),
        (json!({ "kind": "staged" }), DiffTarget::Staged),
        (json!({ "kind": "unstaged" }), DiffTarget::Unstaged),
        (json!({ "kind": "workdir" }), DiffTarget::Workdir),
    ];
    for (v, expected) in cases {
        let t: DiffTarget = serde_json::from_value(v.clone()).expect("de");
        assert_eq!(t, expected);
        assert_eq!(serde_json::to_value(&t).expect("ser"), v);
    }
}

#[test]
fn diff_shapes_are_camel_case() {
    use git_core::diff::{
        DiffLine, DiffLineKind, DiffOptions, FileChange, FileDiff, FileStatus, Hunk,
    };
    use git_core::status::{StatusEntry, WorkdirStatus};

    let d = FileDiff {
        path: "b".into(),
        old_path: Some("a".into()),
        status: FileStatus::Renamed,
        binary: false,
        hunks: vec![Hunk {
            header: "@@ -1 +1 @@".into(),
            old_start: 1,
            old_lines: 1,
            new_start: 1,
            new_lines: 1,
            lines: vec![DiffLine {
                kind: DiffLineKind::Del,
                old_no: Some(1),
                new_no: None,
                text: "x\r".into(),
                no_newline: true,
            }],
        }],
        truncated: false,
        max_lines: 20_000,
        additions: 1,
        deletions: 1,
        old_mode: Some("100644".into()),
        new_mode: Some("100755".into()),
    };
    let v = serde_json::to_value(&d).expect("ser");
    assert_eq!(v["oldPath"], "a");
    assert_eq!(v["newMode"], "100755");
    assert_eq!(v["maxLines"], 20_000);
    assert_eq!(v["status"], "renamed");
    assert_eq!(v["hunks"][0]["oldStart"], 1);
    assert_eq!(v["hunks"][0]["newLines"], 1);
    assert_eq!(v["hunks"][0]["lines"][0]["kind"], "del");
    assert_eq!(v["hunks"][0]["lines"][0]["oldNo"], 1);
    assert_eq!(v["hunks"][0]["lines"][0]["newNo"], Value::Null);
    assert_eq!(v["hunks"][0]["lines"][0]["noNewline"], true);
    assert!(v.get("old_path").is_none());
    let back: FileDiff = serde_json::from_value(v).expect("de");
    assert_eq!(back, d);

    let statuses: Vec<Value> = [
        FileStatus::Added,
        FileStatus::Modified,
        FileStatus::Deleted,
        FileStatus::Renamed,
        FileStatus::Copied,
        FileStatus::Typechange,
        FileStatus::Untracked,
        FileStatus::Conflicted,
        FileStatus::Ignored,
    ]
    .iter()
    .map(|s| serde_json::to_value(s).expect("ser"))
    .collect();
    assert_eq!(
        statuses,
        vec![
            "added",
            "modified",
            "deleted",
            "renamed",
            "copied",
            "typechange",
            "untracked",
            "conflicted",
            "ignored"
        ]
    );
    assert_eq!(
        serde_json::to_value(DiffLineKind::Context).expect("ser"),
        "context"
    );
    assert_eq!(serde_json::to_value(DiffLineKind::Add).expect("ser"), "add");

    let fc = serde_json::to_value(FileChange {
        path: "p".into(),
        old_path: None,
        status: FileStatus::Added,
        additions: 2,
        deletions: 0,
        binary: false,
    })
    .expect("ser");
    assert_eq!(fc["oldPath"], Value::Null);
    assert_eq!(fc["additions"], 2);

    let ws = serde_json::to_value(WorkdirStatus {
        entries: vec![StatusEntry {
            path: "p".into(),
            old_path: None,
            index: Some(FileStatus::Modified),
            workdir: None,
            conflicted: false,
            workdir_stamp: Some("1700000000000:12".into()),
        }],
        staged: 1,
        unstaged: 0,
        untracked: 0,
        conflicted: 0,
        state: git_core::refs::RepoState::CherryPick,
    })
    .expect("ser");
    assert_eq!(ws["state"], "cherryPick");
    assert_eq!(ws["entries"][0]["index"], "modified");
    assert_eq!(ws["entries"][0]["workdir"], Value::Null);
    assert_eq!(ws["entries"][0]["oldPath"], Value::Null);
    assert_eq!(ws["entries"][0]["workdirStamp"], "1700000000000:12");
    assert_eq!(ws["staged"], 1);

    // Options: all fields default, camelCase keys.
    let o: DiffOptions = serde_json::from_value(json!({ "ignoreWhitespace": true })).expect("de");
    assert_eq!(
        (o.context, o.max_lines, o.ignore_whitespace),
        (3, 20_000, true)
    );
    let o: DiffOptions = serde_json::from_value(json!({})).expect("de");
    assert_eq!(o, DiffOptions::default());
}

#[test]
fn rebase_todo_shapes_are_camel_case() {
    use git_core::cli::rebase::{Action, RebaseTodo, TodoCommit, TodoLine, TodoStep};

    let commit = TodoCommit {
        oid: "a".repeat(40),
        short: "aaaaaaa".into(),
        summary: "s".into(),
        message: "s\n\nbody\n".into(),
    };
    let v = serde_json::to_value(RebaseTodo {
        head: "b".repeat(40),
        base_oid: "c".repeat(40),
        lines: vec![
            TodoLine::Pick {
                action: Action::Fixup,
                text: "fixup -C aaaaaaa # s".into(),
                commit: commit.clone(),
                amend: true,
            },
            TodoLine::Merge {
                text: "merge side".into(),
                commit: None,
            },
            TodoLine::UpdateRef {
                text: "update-ref refs/heads/x".into(),
            },
            TodoLine::Other {
                text: "label onto".into(),
            },
        ],
    })
    .expect("ser");
    assert_eq!(v["baseOid"], "c".repeat(40));
    assert_eq!(v["lines"][0]["kind"], "pick");
    assert_eq!(v["lines"][0]["action"], "fixup");
    assert_eq!(v["lines"][0]["commit"]["short"], "aaaaaaa");
    assert_eq!(v["lines"][0]["amend"], true);
    assert_eq!(v["lines"][1]["kind"], "merge");
    assert_eq!(v["lines"][1]["commit"], Value::Null);
    assert_eq!(v["lines"][2]["kind"], "updateRef");
    assert_eq!(v["lines"][3]["kind"], "other");

    let steps: Vec<TodoStep> = serde_json::from_value(json!([
        { "kind": "line", "text": "pick aaaaaaa s" },
        { "kind": "amend", "message": "new\n" },
    ]))
    .expect("de");
    assert_eq!(
        steps,
        [
            TodoStep::Line {
                text: "pick aaaaaaa s".into()
            },
            TodoStep::Amend {
                message: "new\n".into()
            },
        ]
    );
}
