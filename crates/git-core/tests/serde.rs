//! IPC shape tests: the JSON the frontend sees.

use std::path::PathBuf;

use git_core::log::{CommitInfo, GraphLine, GraphRow, LineKind, RevSpec};
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
