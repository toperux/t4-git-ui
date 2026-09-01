//! Diff / status tests on real temp repos, cross-checked against the system
//! `git diff --numstat` where available (skipped at runtime otherwise).

use std::path::Path;
use std::process::Command;

use git_core::diff::{
    changed_files, file_diff, DiffLineKind, DiffOptions, DiffTarget, FileChange, FileStatus,
};
use git_core::status::status;
use git_core::test_util::TempRepo;
use git_core::GitError;

/// `git diff [-M] --numstat a b` as sorted `(adds, dels, new_path)`; `None` when
/// `git` is not installed. Binary entries (`-`) count as 0/0.
fn git_numstat(dir: &Path, a: &str, b: &str) -> Option<Vec<(u32, u32, String)>> {
    let out = match Command::new("git")
        .arg("-C")
        .arg(dir)
        .args([
            "-c",
            "core.quotepath=false",
            "diff",
            "-M",
            "--numstat",
            a,
            b,
        ])
        .output()
    {
        Ok(o) => o,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            eprintln!("git not on PATH; skipping numstat cross-check");
            return None;
        }
        Err(e) => panic!("git diff failed: {e}"),
    };
    assert!(
        out.status.success(),
        "git diff --numstat: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let mut rows: Vec<(u32, u32, String)> = String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| {
            let mut it = l.splitn(3, '\t');
            let a = it.next().expect("adds");
            let d = it.next().expect("dels");
            let p = it.next().expect("path");
            (
                a.parse().unwrap_or(0),
                d.parse().unwrap_or(0),
                numstat_new_path(p),
            )
        })
        .collect();
    rows.sort_by(|x, y| x.2.cmp(&y.2));
    Some(rows)
}

/// `dir/{old => new}/x`, `{old => new}` or `old => new` → new path.
fn numstat_new_path(p: &str) -> String {
    let Some(arrow) = p.find(" => ") else {
        return p.to_string();
    };
    match (p.find('{'), p.find('}')) {
        (Some(l), Some(r)) if l < arrow && arrow < r => {
            format!("{}{}{}", &p[..l], &p[arrow + 4..r], &p[r + 1..])
        }
        _ => p[arrow + 4..].to_string(),
    }
}

fn triples(files: &[FileChange]) -> Vec<(u32, u32, String)> {
    let mut v: Vec<_> = files
        .iter()
        .map(|f| (f.additions, f.deletions, f.path.clone()))
        .collect();
    v.sort_by(|x, y| x.2.cmp(&y.2));
    v
}

fn commit(oid: git2::Oid) -> DiffTarget {
    DiffTarget::Commit {
        oid: oid.to_string(),
    }
}

fn paths(files: &[FileChange]) -> Vec<&str> {
    files.iter().map(|f| f.path.as_str()).collect()
}

fn find<'a>(files: &'a [FileChange], path: &str) -> &'a FileChange {
    files
        .iter()
        .find(|f| f.path == path)
        .unwrap_or_else(|| panic!("{path} not in {files:?}"))
}

#[test]
fn commit_vs_parent_add_modify_delete() {
    let t = TempRepo::new();
    let a = t.commit(&[("keep.txt", "1\n2\n3\n"), ("gone.txt", "x\ny\n")], "A");
    t.write("keep.txt", "1\ntwo\n3\n4\n");
    t.write("new.txt", "n1\nn2\nn3\n");
    t.stage(&["keep.txt", "new.txt"]);
    t.remove("gone.txt");
    let b = t.commit_index("B");

    let files = changed_files(&t.repo, &commit(b)).expect("changed_files");
    assert_eq!(paths(&files), vec!["gone.txt", "keep.txt", "new.txt"]);
    let gone = find(&files, "gone.txt");
    assert_eq!(
        (gone.status, gone.additions, gone.deletions),
        (FileStatus::Deleted, 0, 2)
    );
    let keep = find(&files, "keep.txt");
    assert_eq!(
        (keep.status, keep.additions, keep.deletions),
        (FileStatus::Modified, 2, 1)
    );
    let new = find(&files, "new.txt");
    assert_eq!(
        (new.status, new.additions, new.deletions),
        (FileStatus::Added, 3, 0)
    );
    assert!(files.iter().all(|f| !f.binary && f.old_path.is_none()));

    if let Some(expected) = git_numstat(t.path(), &a.to_string(), &b.to_string()) {
        assert_eq!(triples(&files), expected);
    }

    // CommitRange is the same tree pair.
    let range = changed_files(
        &t.repo,
        &DiffTarget::CommitRange {
            from: a.to_string(),
            to: b.to_string(),
        },
    )
    .expect("range");
    assert_eq!(range, files);

    // Hunks / line numbers of the modified file.
    let d = file_diff(&t.repo, &commit(b), "keep.txt", &DiffOptions::default()).expect("file_diff");
    assert_eq!(
        (d.status, d.binary, d.truncated),
        (FileStatus::Modified, false, false)
    );
    assert_eq!((d.additions, d.deletions), (2, 1));
    assert_eq!(d.hunks.len(), 1);
    let h = &d.hunks[0];
    assert_eq!(h.header, "@@ -1,3 +1,4 @@");
    assert_eq!(
        (h.old_start, h.old_lines, h.new_start, h.new_lines),
        (1, 3, 1, 4)
    );
    let rows: Vec<(DiffLineKind, Option<u32>, Option<u32>, &str)> = h
        .lines
        .iter()
        .map(|l| (l.kind, l.old_no, l.new_no, l.text.as_str()))
        .collect();
    assert_eq!(
        rows,
        vec![
            (DiffLineKind::Context, Some(1), Some(1), "1"),
            (DiffLineKind::Del, Some(2), None, "2"),
            (DiffLineKind::Add, None, Some(2), "two"),
            (DiffLineKind::Context, Some(3), Some(3), "3"),
            (DiffLineKind::Add, None, Some(4), "4"),
        ]
    );
    assert!(h.lines.iter().all(|l| !l.no_newline));

    // Deleted file: all `-` lines, addressed by its (old) path.
    let d = file_diff(&t.repo, &commit(b), "gone.txt", &DiffOptions::default()).expect("deleted");
    assert_eq!(d.status, FileStatus::Deleted);
    assert_eq!(d.hunks[0].lines.len(), 2);
    assert!(d.hunks[0].lines.iter().all(|l| l.kind == DiffLineKind::Del));
}

#[test]
fn no_newline_at_eof_is_a_flag() {
    let t = TempRepo::new();
    t.commit(&[("f.txt", "a\nb")], "A");
    t.write("f.txt", "a\nb\n");
    t.stage(&["f.txt"]);
    let b = t.commit_index("B");
    let d = file_diff(&t.repo, &commit(b), "f.txt", &DiffOptions::default()).expect("file_diff");
    let lines = &d.hunks[0].lines;
    let del = lines
        .iter()
        .find(|l| l.kind == DiffLineKind::Del)
        .expect("del");
    assert_eq!((del.text.as_str(), del.no_newline), ("b", true));
    let add = lines
        .iter()
        .find(|l| l.kind == DiffLineKind::Add)
        .expect("add");
    assert_eq!((add.text.as_str(), add.no_newline), ("b", false));
}

#[test]
fn rename_with_small_edit() {
    let t = TempRepo::new();
    let body: String = (1..=30).map(|i| format!("line {i}\n")).collect();
    let a = t.commit(&[("src/old.txt", body.as_str())], "A");
    t.rename_file("src/old.txt", "src/new.txt");
    t.write("src/new.txt", body.replacen("line 7\n", "line seven\n", 1));
    t.stage(&["src/new.txt"]);
    let b = t.commit_index("B");

    let files = changed_files(&t.repo, &commit(b)).expect("changed_files");
    assert_eq!(files.len(), 1);
    let f = &files[0];
    assert_eq!(f.status, FileStatus::Renamed);
    assert_eq!(f.path, "src/new.txt");
    assert_eq!(f.old_path.as_deref(), Some("src/old.txt"));
    assert_eq!((f.additions, f.deletions), (1, 1));
    if let Some(expected) = git_numstat(t.path(), &a.to_string(), &b.to_string()) {
        assert_eq!(triples(&files), expected);
    }

    // file_diff by the NEW path (and by the old one) resolves the rename.
    for p in ["src/new.txt", "src/old.txt"] {
        let d = file_diff(&t.repo, &commit(b), p, &DiffOptions::default()).expect("file_diff");
        assert_eq!(d.status, FileStatus::Renamed);
        assert_eq!(d.path, "src/new.txt");
        assert_eq!(d.old_path.as_deref(), Some("src/old.txt"));
        assert_eq!(d.hunks.len(), 1);
        assert_eq!(d.hunks[0].header, "@@ -4,7 +4,7 @@ line 3");
    }

    // Unknown path → error.
    assert!(matches!(
        file_diff(&t.repo, &commit(b), "nope.txt", &DiffOptions::default()),
        Err(GitError::Git2(_))
    ));
}

#[test]
fn root_commit_is_all_added() {
    let t = TempRepo::new();
    let a = t.commit(&[("a.txt", "1\n2\n"), ("d/b.txt", "x\n")], "root");
    let files = changed_files(&t.repo, &commit(a)).expect("changed_files");
    assert_eq!(paths(&files), vec!["a.txt", "d/b.txt"]);
    assert!(files.iter().all(|f| f.status == FileStatus::Added));
    assert_eq!(
        triples(&files),
        vec![(2, 0, "a.txt".into()), (1, 0, "d/b.txt".into())]
    );
    if let Some(expected) = git_numstat(
        t.path(),
        "4b825dc642cb6eb9a060e54bf8d69288fbee4904", // empty tree
        &a.to_string(),
    ) {
        assert_eq!(triples(&files), expected);
    }
    let d = file_diff(&t.repo, &commit(a), "a.txt", &DiffOptions::default()).expect("file_diff");
    assert_eq!(d.hunks[0].header, "@@ -0,0 +1,2 @@");
    assert!(d.hunks[0].lines.iter().all(|l| l.kind == DiffLineKind::Add));
}

#[test]
fn binary_file_has_no_hunks() {
    let t = TempRepo::new();
    t.commit(&[("a.txt", "a\n")], "A");
    t.write("blob.bin", [0u8, 1, 2, 3, 0, 255, 10, 0]);
    t.stage(&["blob.bin"]);
    let b = t.commit_index("B");
    let files = changed_files(&t.repo, &commit(b)).expect("changed_files");
    assert_eq!(files.len(), 1);
    assert_eq!(
        (files[0].binary, files[0].additions, files[0].deletions),
        (true, 0, 0)
    );
    assert_eq!(files[0].status, FileStatus::Added);
    let d = file_diff(&t.repo, &commit(b), "blob.bin", &DiffOptions::default()).expect("file_diff");
    assert!(d.binary);
    assert!(d.hunks.is_empty());

    // Modified binary in the workdir too.
    t.write("blob.bin", [0u8, 9, 9, 9]);
    let files = changed_files(&t.repo, &DiffTarget::Unstaged).expect("unstaged");
    assert_eq!(files.len(), 1);
    assert!(files[0].binary);
    assert_eq!(files[0].status, FileStatus::Modified);
}

/// With `core.autocrlf=false` (forced) libgit2 and git both diff raw bytes, so
/// `\r` stays on the line text. Diffs of staged content under
/// `core.autocrlf=true` go through the CLI path in M3.
#[test]
fn crlf_lines_keep_carriage_return() {
    let t = TempRepo::new();
    t.set_config("core.autocrlf", "false");
    let a = t.commit(&[("w.txt", "a\r\nb\r\nc\r\n")], "A");
    t.write("w.txt", "a\r\nB\r\nc\r\nd\r\n");
    t.stage(&["w.txt"]);
    let b = t.commit_index("B");

    let files = changed_files(&t.repo, &commit(b)).expect("changed_files");
    assert_eq!(triples(&files), vec![(2, 1, "w.txt".into())]);
    if let Some(expected) = git_numstat(t.path(), &a.to_string(), &b.to_string()) {
        assert_eq!(triples(&files), expected);
    }

    let d = file_diff(&t.repo, &commit(b), "w.txt", &DiffOptions::default()).expect("file_diff");
    let texts: Vec<&str> = d.hunks[0].lines.iter().map(|l| l.text.as_str()).collect();
    assert_eq!(texts, vec!["a\r", "b\r", "B\r", "c\r", "d\r"]);

    // Same for the workdir source.
    t.write("w.txt", "a\r\nB\r\nc\r\nd\r\ne\r\n");
    let d = file_diff(
        &t.repo,
        &DiffTarget::Unstaged,
        "w.txt",
        &DiffOptions::default(),
    )
    .expect("unstaged");
    let added: Vec<&str> = d.hunks[0]
        .lines
        .iter()
        .filter(|l| l.kind == DiffLineKind::Add)
        .map(|l| l.text.as_str())
        .collect();
    assert_eq!(added, vec!["e\r"]);
}

#[test]
fn staged_unstaged_workdir_and_status() {
    let t = TempRepo::new();
    t.commit(&[("a.txt", "a1\na2\n"), ("b.txt", "b1\nb2\n")], "A");
    t.write("a.txt", "a1\na2\na3\n");
    t.stage(&["a.txt"]);
    t.write("b.txt", "b1\nB2\n");
    t.write("dir/c.txt", "c1\nc2\n");

    let staged = changed_files(&t.repo, &DiffTarget::Staged).expect("staged");
    assert_eq!(triples(&staged), vec![(1, 0, "a.txt".into())]);
    assert_eq!(staged[0].status, FileStatus::Modified);

    let unstaged = changed_files(&t.repo, &DiffTarget::Unstaged).expect("unstaged");
    assert_eq!(
        triples(&unstaged),
        vec![(1, 1, "b.txt".into()), (2, 0, "dir/c.txt".into())]
    );
    assert_eq!(find(&unstaged, "dir/c.txt").status, FileStatus::Untracked);
    assert_eq!(find(&unstaged, "b.txt").status, FileStatus::Modified);

    let workdir = changed_files(&t.repo, &DiffTarget::Workdir).expect("workdir");
    assert_eq!(
        triples(&workdir),
        vec![
            (1, 0, "a.txt".into()),
            (1, 1, "b.txt".into()),
            (2, 0, "dir/c.txt".into())
        ]
    );

    // Untracked file: one hunk with the full content.
    let d = file_diff(
        &t.repo,
        &DiffTarget::Unstaged,
        "dir/c.txt",
        &DiffOptions::default(),
    )
    .expect("untracked diff");
    assert_eq!(d.status, FileStatus::Untracked);
    assert_eq!(d.hunks.len(), 1);
    let texts: Vec<(DiffLineKind, &str)> = d.hunks[0]
        .lines
        .iter()
        .map(|l| (l.kind, l.text.as_str()))
        .collect();
    assert_eq!(
        texts,
        vec![(DiffLineKind::Add, "c1"), (DiffLineKind::Add, "c2")]
    );
    // The staged change is not part of the unstaged diff of a.txt.
    assert!(matches!(
        file_diff(
            &t.repo,
            &DiffTarget::Unstaged,
            "a.txt",
            &DiffOptions::default()
        ),
        Err(GitError::Git2(_))
    ));

    let s = status(&t.repo).expect("status");
    assert_eq!(
        (s.staged, s.unstaged, s.untracked, s.conflicted),
        (1, 1, 1, 0)
    );
    let rows: Vec<(&str, Option<FileStatus>, Option<FileStatus>)> = s
        .entries
        .iter()
        .map(|e| (e.path.as_str(), e.index, e.workdir))
        .collect();
    assert_eq!(
        rows,
        vec![
            ("a.txt", Some(FileStatus::Modified), None),
            ("b.txt", None, Some(FileStatus::Modified)),
            ("dir/c.txt", None, Some(FileStatus::Untracked)),
        ]
    );
    assert!(s
        .entries
        .iter()
        .all(|e| !e.conflicted && e.old_path.is_none()));

    // Staged rename shows old_path; a staged + further-modified file has both sides.
    t.rename_file("b.txt", "b2.txt");
    t.write("a.txt", "a1\na2\na3\na4\n");
    let s = status(&t.repo).expect("status");
    let a = s.entries.iter().find(|e| e.path == "a.txt").expect("a");
    assert_eq!(
        (a.index, a.workdir),
        (Some(FileStatus::Modified), Some(FileStatus::Modified))
    );
    let b2 = s.entries.iter().find(|e| e.path == "b2.txt").expect("b2");
    assert_eq!(b2.index, Some(FileStatus::Renamed));
    assert_eq!(b2.old_path.as_deref(), Some("b.txt"));
    assert_eq!((s.staged, s.unstaged, s.untracked), (2, 1, 1));
}

#[test]
fn unborn_head_staged_is_added() {
    let t = TempRepo::new();
    t.write("first.txt", "hello\n");
    t.stage(&["first.txt"]);
    let staged = changed_files(&t.repo, &DiffTarget::Staged).expect("staged");
    assert_eq!(triples(&staged), vec![(1, 0, "first.txt".into())]);
    assert_eq!(staged[0].status, FileStatus::Added);
    let workdir = changed_files(&t.repo, &DiffTarget::Workdir).expect("workdir");
    assert_eq!(triples(&workdir), vec![(1, 0, "first.txt".into())]);
    assert!(changed_files(&t.repo, &DiffTarget::Unstaged)
        .expect("unstaged")
        .is_empty());
    let s = status(&t.repo).expect("status");
    assert_eq!((s.staged, s.unstaged, s.untracked), (1, 0, 0));
    assert_eq!(s.entries[0].index, Some(FileStatus::Added));
}

#[test]
fn max_lines_truncates() {
    let t = TempRepo::new();
    t.commit(&[("a.txt", "")], "A");
    let body: String = (1..=100).map(|i| format!("{i}\n")).collect();
    t.write("a.txt", body);
    t.stage(&["a.txt"]);
    let b = t.commit_index("B");
    let opts = DiffOptions {
        max_lines: 10,
        ..Default::default()
    };
    let d = file_diff(&t.repo, &commit(b), "a.txt", &opts).expect("file_diff");
    assert!(d.truncated);
    let n: usize = d.hunks.iter().map(|h| h.lines.len()).sum();
    assert_eq!(n, 10);
    // Full counts are still reported.
    assert_eq!((d.additions, d.deletions), (100, 0));

    let full = file_diff(&t.repo, &commit(b), "a.txt", &DiffOptions::default()).expect("full");
    assert!(!full.truncated);
    assert_eq!(full.hunks[0].lines.len(), 100);
}

#[test]
fn ignore_whitespace_hides_indentation_change() {
    let t = TempRepo::new();
    t.commit(&[("a.txt", "fn x() {\nreturn 1;\n}\n")], "A");
    t.write("a.txt", "fn x() {\n    return 1;\n}\n");
    t.stage(&["a.txt"]);
    let b = t.commit_index("B");
    let d = file_diff(&t.repo, &commit(b), "a.txt", &DiffOptions::default()).expect("file_diff");
    assert_eq!(d.hunks.len(), 1);
    let opts = DiffOptions {
        ignore_whitespace: true,
        ..Default::default()
    };
    let d = file_diff(&t.repo, &commit(b), "a.txt", &opts).expect("file_diff");
    assert!(d.hunks.is_empty(), "{d:?}");
    assert_eq!((d.additions, d.deletions), (0, 0));
}

#[test]
fn context_option_widens_hunks() {
    let t = TempRepo::new();
    let body: String = (1..=20).map(|i| format!("{i}\n")).collect();
    t.commit(&[("a.txt", body.as_str())], "A");
    t.write("a.txt", body.replacen("10\n", "ten\n", 1));
    t.stage(&["a.txt"]);
    let b = t.commit_index("B");
    let d = file_diff(&t.repo, &commit(b), "a.txt", &DiffOptions::default()).expect("default");
    assert_eq!(d.hunks[0].lines.len(), 8);
    let opts = DiffOptions {
        context: 0,
        ..Default::default()
    };
    let d = file_diff(&t.repo, &commit(b), "a.txt", &opts).expect("ctx0");
    assert_eq!(d.hunks[0].lines.len(), 2);
}

#[test]
fn a_conflicted_file_shows_the_markers_git_left_on_disk() {
    let t = TempRepo::new();
    let base = t.commit(&[("f.txt", "base\n")], "base");
    t.branch("feat", base);
    t.checkout("feat");
    let feat = t.commit(&[("f.txt", "feat\n")], "feat");
    t.checkout("master");
    t.commit(&[("f.txt", "master\n")], "master");
    let ann = t.repo.find_annotated_commit(feat).expect("annotated");
    t.repo.merge(&[&ann], None, None).expect("merge");

    let s = status(&t.repo).expect("status");
    assert_eq!(s.conflicted, 1);

    // libgit2's own index-to-workdir diff calls this delta `Conflicted` and emits
    // nothing for it; the panel needs the markers, which only the file has.
    let d = file_diff(
        &t.repo,
        &DiffTarget::Unstaged,
        "f.txt",
        &DiffOptions::default(),
    )
    .expect("file_diff");
    assert_eq!(d.status, FileStatus::Conflicted);
    let text: Vec<&str> = d
        .hunks
        .iter()
        .flat_map(|h| h.lines.iter())
        .map(|l| l.text.as_str())
        .collect();
    assert!(text.iter().any(|l| l.starts_with("<<<<<<<")), "{text:?}");
    assert!(text.iter().any(|l| l.starts_with("=======")), "{text:?}");
    assert!(text.iter().any(|l| l.starts_with(">>>>>>>")), "{text:?}");
    assert!(text.contains(&"feat"), "{text:?}");
}
