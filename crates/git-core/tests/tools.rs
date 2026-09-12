//! External diff / merge tools: the git-config round trip, the executable
//! search, and the two sides `open_diff_tool` hands its program. Nothing here
//! spawns a real tool — the command always names a program that does not exist,
//! which is what proves the NotFound → `Config` mapping.

use std::path::PathBuf;

use git_core::diff::DiffTarget;
use git_core::test_util::TempRepo;
use git_core::tools::{self, Tool, ToolKind};
use git_core::GitError;

/// A command that spawns nothing: the sides land in the temp dir all the same,
/// and `spawn_tool` reports the missing program.
const MISSING: &str = r#""t4-no-such-tool" "$LOCAL" "$REMOTE""#;

fn temp_config() -> (tempfile::TempDir, git2::Config) {
    let dir = tempfile::tempdir().expect("tempdir");
    let file = dir.path().join("gitconfig");
    std::fs::write(&file, "").expect("write");
    let cfg = git2::Config::open(&file).expect("open config");
    (dir, cfg)
}

#[test]
fn set_and_get_round_trip_through_the_config_file() {
    let (_dir, mut cfg) = temp_config();
    assert_eq!(tools::get_tool(&cfg, ToolKind::Merge), None);

    let tool = Tool {
        name: "kdiff3".into(),
        path: "C:/Program Files/KDiff3/kdiff3.exe".into(),
        cmd: r#""C:/Program Files/KDiff3/kdiff3.exe" "$BASE" "$LOCAL" "$REMOTE" -o "$MERGED""#
            .into(),
    };
    tools::set_tool(&mut cfg, ToolKind::Merge, Some(&tool)).expect("set");
    assert_eq!(tools::get_tool(&cfg, ToolKind::Merge).as_ref(), Some(&tool));
    // Both selectors, the shape GitExtensions writes.
    assert_eq!(cfg.get_string("merge.tool").expect("tool"), "kdiff3");
    assert_eq!(cfg.get_string("merge.guitool").expect("guitool"), "kdiff3");
    // The other kind is untouched.
    assert_eq!(tools::get_tool(&cfg, ToolKind::Diff), None);
}

#[test]
fn guitool_wins_over_tool_and_clearing_keeps_the_entries() {
    let (_dir, mut cfg) = temp_config();
    cfg.set_str("diff.tool", "vimdiff").expect("tool");
    cfg.set_str("diff.guitool", "bc").expect("guitool");
    cfg.set_str("difftool.bc.path", "C:/BC/BComp.exe")
        .expect("path");
    cfg.set_str("difftool.bc.cmd", r#""C:/BC/BComp.exe" "$LOCAL" "$REMOTE""#)
        .expect("cmd");

    let tool = tools::get_tool(&cfg, ToolKind::Diff).expect("a tool");
    assert_eq!(tool.name, "bc");
    assert_eq!(tool.path, "C:/BC/BComp.exe");

    // No guitool: the CLI's own pick is the fallback, with no entries of its own.
    cfg.remove("diff.guitool").expect("remove");
    let plain = tools::get_tool(&cfg, ToolKind::Diff).expect("a tool");
    assert_eq!(
        (plain.name.as_str(), plain.path.as_str(), plain.cmd.as_str()),
        ("vimdiff", "", "")
    );

    // Clearing takes both selectors and leaves the tool's own entries behind.
    tools::set_tool(&mut cfg, ToolKind::Diff, None).expect("clear");
    assert_eq!(tools::get_tool(&cfg, ToolKind::Diff), None);
    assert_eq!(
        cfg.get_string("difftool.bc.path").expect("path"),
        "C:/BC/BComp.exe"
    );
    // Clearing what is not set is not an error either.
    tools::set_tool(&mut cfg, ToolKind::Diff, None).expect("clear again");
}

#[test]
fn find_tool_prefers_an_installed_path_over_the_name() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root: PathBuf = dir.path().into();
    std::fs::create_dir_all(root.join("Beyond Compare 5")).expect("mkdir");
    let exe = root.join("Beyond Compare 5").join("BComp.exe");
    std::fs::write(&exe, "").expect("write");

    let rels = vec![
        "Beyond Compare 5/BComp.exe".to_string(),
        "Beyond Compare 4/BComp.exe".to_string(),
    ];
    let names = vec!["t4-no-such-tool".to_string()];
    assert_eq!(
        tools::find_tool_in(std::slice::from_ref(&root), &names, &rels).map(PathBuf::from),
        Some(exe)
    );
    // Nothing installed and nothing by that name on PATH.
    assert_eq!(
        tools::find_tool_in(
            std::slice::from_ref(&root),
            &names,
            &["nope/nope.exe".to_string()]
        ),
        None
    );
}

/// Contents of the two files the tool would have been handed, by the names
/// `stage_file` gives them. Every test uses a file name of its own, so the
/// lookup below cannot land on another test's directory.
fn sides(
    t: &TempRepo,
    target: &DiffTarget,
    path: &str,
    old_path: Option<&str>,
) -> (String, String) {
    let err = open_missing(t, target, path, old_path);
    assert!(
        matches!(&err, GitError::Config(m) if m.contains("t4-no-such-tool")),
        "{err}"
    );
    // A rename's LOCAL carries the old name, REMOTE the new one.
    let old_stem = stem_of(old_path.unwrap_or(path));
    let dir = side_dir(&old_stem);
    let read = |stem: &str, side: &str| {
        let file = dir.join(format!("{stem}.{side}.txt"));
        std::fs::read_to_string(&file).unwrap_or_else(|e| panic!("{}: {e}", file.display()))
    };
    (read(&old_stem, "LOCAL"), read(&stem_of(path), "REMOTE"))
}

/// Runs `open_diff_tool` with a command naming a program that does not exist:
/// the sides are written first, so only the spawn fails.
fn open_missing(t: &TempRepo, target: &DiffTarget, path: &str, old_path: Option<&str>) -> GitError {
    let tool = Tool {
        name: "missing".into(),
        path: String::new(),
        cmd: MISSING.into(),
    };
    tools::open_diff_tool(&t.repo, target, path, old_path, &tool)
        .expect_err("the tool does not exist")
}

#[test]
fn a_path_outside_the_repository_is_refused() {
    let t = TempRepo::new();
    t.commit(&[("live.txt", "one")], "first");

    // An absolute path would discard the working directory it is joined onto,
    // and `..` would climb out of it.
    for path in ["/etc/passwd", "../outside.txt"] {
        let err = open_missing(&t, &DiffTarget::Workdir, path, None);
        assert!(matches!(&err, GitError::Refused(_)), "{path}: {err}");
        // A rename's old side is caller-supplied all the same.
        let err = open_missing(&t, &DiffTarget::Workdir, "live.txt", Some(path));
        assert!(matches!(&err, GitError::Refused(_)), "old {path}: {err}");
    }
}

fn stem_of(path: &str) -> String {
    std::path::Path::new(path)
        .file_stem()
        .expect("stem")
        .to_string_lossy()
        .into_owned()
}

/// The diff directory holding `<stem>.LOCAL.txt` — the newest of them, so a
/// leftover from an earlier run of the suite is not what gets read.
fn side_dir(stem: &str) -> PathBuf {
    let root = tools::diff_temp_dir();
    std::fs::read_dir(&root)
        .expect("diff temp dir")
        .filter_map(|e| e.ok())
        .filter(|e| e.path().join(format!("{stem}.LOCAL.txt")).is_file())
        .max_by_key(|e| e.metadata().and_then(|m| m.modified()).ok())
        .unwrap_or_else(|| panic!("no diff directory holds {stem}.LOCAL.txt"))
        .path()
}

#[test]
fn commit_diff_sides_are_the_parent_and_the_commit() {
    let t = TempRepo::new();
    t.commit(&[("commit.txt", "one")], "first");
    let second = t.commit(&[("commit.txt", "two")], "second");
    let target = DiffTarget::Commit {
        oid: second.to_string(),
    };
    assert_eq!(
        sides(&t, &target, "commit.txt", None),
        ("one".to_string(), "two".to_string())
    );

    // A root commit has no parent: LOCAL is the empty file `stage_file` writes.
    let root = TempRepo::new();
    let first = root.commit(&[("root.txt", "one")], "first");
    let target = DiffTarget::Commit {
        oid: first.to_string(),
    };
    assert_eq!(
        sides(&root, &target, "root.txt", None),
        (String::new(), "one".to_string())
    );
}

#[test]
fn a_range_diffs_the_two_trees_and_a_rename_uses_the_old_name() {
    let t = TempRepo::new();
    let from = t.commit(&[("before.txt", "one")], "first");
    t.rename_file("before.txt", "after.txt");
    t.write("after.txt", "two");
    t.stage(&["after.txt"]);
    let to = t.commit_index("renamed");

    let target = DiffTarget::CommitRange {
        from: from.to_string(),
        to: to.to_string(),
    };
    assert_eq!(
        sides(&t, &target, "after.txt", Some("before.txt")),
        ("one".to_string(), "two".to_string())
    );
}

#[test]
fn staged_diffs_head_against_the_index() {
    let t = TempRepo::new();
    t.commit(&[("staged.txt", "one")], "first");
    t.write("staged.txt", "two");
    t.stage(&["staged.txt"]);
    assert_eq!(
        sides(&t, &DiffTarget::Staged, "staged.txt", None),
        ("one".to_string(), "two".to_string())
    );
}

#[test]
fn unstaged_hands_the_working_tree_file_itself_as_remote() {
    let t = TempRepo::new();
    t.commit(&[("live.txt", "one")], "first");
    t.write("live.txt", "edited");

    let err = open_missing(&t, &DiffTarget::Unstaged, "live.txt", None);
    assert!(matches!(&err, GitError::Config(_)), "{err}");
    // REMOTE is the real file, so what the tool saves lands in the working tree.
    let dir = side_dir("live");
    assert_eq!(
        std::fs::read_to_string(dir.join("live.LOCAL.txt")).expect("LOCAL"),
        "one"
    );
    assert!(
        !dir.join("live.REMOTE.txt").exists(),
        "no copy of the working file"
    );
    assert_eq!(
        std::fs::read_to_string(t.path().join("live.txt")).expect("workdir"),
        "edited"
    );
}

#[test]
fn a_file_deleted_in_the_working_tree_gets_an_empty_remote_side() {
    let t = TempRepo::new();
    t.commit(&[("gone.txt", "was here")], "first");
    std::fs::remove_file(t.path().join("gone.txt")).expect("delete");

    let err = open_missing(&t, &DiffTarget::Unstaged, "gone.txt", None);
    assert!(matches!(&err, GitError::Config(_)), "{err}");
    // No working file to hand over, so the right side is an empty copy — not a path that is not there.
    let dir = side_dir("gone");
    assert_eq!(
        std::fs::read_to_string(dir.join("gone.LOCAL.txt")).expect("LOCAL"),
        "was here"
    );
    assert_eq!(
        std::fs::read_to_string(dir.join("gone.REMOTE.txt")).expect("REMOTE"),
        ""
    );
}
