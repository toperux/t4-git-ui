//! End-to-end hunk / line staging: build a patch from a stage-able diff, apply
//! it with the system `git apply --cached` through the CLI runner, and check
//! the resulting index content. Skipped at runtime when `git` is missing.

use std::path::Path;

use git_core::cli::GitCli;
use git_core::diff::{
    changed_files, file_diff, DiffLineKind, DiffOptions, DiffTarget, FileDiff, FileStatus,
};
use git_core::patch::{build_patch, PatchSelection};
use git_core::stage::{discard_patch_args, stage_patch_args};
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

fn diff(t: &TempRepo, target: DiffTarget, path: &str) -> FileDiff {
    file_diff(&t.repo, &target, path, &DiffOptions::default()).expect("file_diff")
}

fn index_content(t: &TempRepo, path: &str) -> Option<String> {
    let index = t.repo.index().expect("index");
    let e = index.get_path(Path::new(path), 0)?;
    let blob = t.repo.find_blob(e.id).expect("blob");
    Some(String::from_utf8_lossy(blob.content()).into_owned())
}

fn change_lines(d: &FileDiff, h: usize) -> Vec<usize> {
    d.hunks[h]
        .lines
        .iter()
        .enumerate()
        .filter(|(_, l)| l.kind != DiffLineKind::Context)
        .map(|(i, _)| i)
        .collect()
}

/// `git apply --cached --check` then the real apply; panics on failure.
async fn apply(t: &TempRepo, patch: &str, reverse: bool) {
    let cli = GitCli::new("git");
    let mut check = stage_patch_args(reverse, false);
    check.insert(1, "--check");
    let out = cli
        .run(
            t.path(),
            "check",
            &check,
            Some(patch.as_bytes().to_vec()),
            CancellationToken::new(),
            |_| {},
        )
        .await
        .expect("run");
    out.check("git apply --check")
        .unwrap_or_else(|e| panic!("{e}\npatch:\n{patch}"));
    let out = cli
        .run(
            t.path(),
            "apply",
            &stage_patch_args(reverse, false),
            Some(patch.as_bytes().to_vec()),
            CancellationToken::new(),
            |_| {},
        )
        .await
        .expect("run");
    out.check("git apply")
        .unwrap_or_else(|e| panic!("{e}\npatch:\n{patch}"));
    // libgit2 caches the index; reload so `index_content` / diffs see git's write.
    t.repo
        .index()
        .expect("index")
        .read(true)
        .expect("reload index");
}

/// `git apply -R` on the working tree (no `--cached`, no `--check`); panics on failure.
async fn discard(t: &TempRepo, patch: &str) {
    let cli = GitCli::new("git");
    let args = discard_patch_args(false);
    let out = cli
        .run(
            t.path(),
            "discard",
            &args,
            Some(patch.as_bytes().to_vec()),
            CancellationToken::new(),
            |_| {},
        )
        .await
        .expect("run");
    out.check("git apply -R")
        .unwrap_or_else(|e| panic!("{e}\npatch:\n{patch}"));
}

fn numbered(n: u32) -> String {
    (1..=n).map(|i| format!("line {i}\n")).collect()
}

fn read(t: &TempRepo, path: &str) -> String {
    std::fs::read_to_string(t.path().join(path)).expect("read")
}

#[tokio::test]
async fn stage_hunk_subset_then_unstage_it() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[("f.txt", &numbered(30))], "base");
    let mut lines: Vec<String> = numbered(30).lines().map(String::from).collect();
    lines[1] = "LINE 2".into();
    lines.insert(15, "extra a".into());
    lines.insert(16, "extra b".into());
    lines.remove(29);
    let workdir = lines.join("\n") + "\n";
    t.write("f.txt", &workdir);

    let d = diff(&t, DiffTarget::Unstaged, "f.txt");
    assert_eq!(d.hunks.len(), 3);
    let p = build_patch(&d, &PatchSelection::Hunks(vec![1, 2]), false, true).unwrap();
    apply(&t, &p, false).await;

    let mut expected: Vec<String> = numbered(30).lines().map(String::from).collect();
    expected.insert(15, "extra a".into());
    expected.insert(16, "extra b".into());
    expected.remove(29);
    let expected = expected.join("\n") + "\n";
    assert_eq!(index_content(&t, "f.txt").unwrap(), expected);
    // Workdir untouched.
    assert_eq!(
        std::fs::read_to_string(t.path().join("f.txt")).unwrap(),
        workdir
    );
    // Remaining unstaged diff is just the first edit.
    let rest = diff(&t, DiffTarget::Unstaged, "f.txt");
    assert_eq!(rest.hunks.len(), 1);
    assert!(rest.hunks[0].lines.iter().any(|l| l.text == "LINE 2"));

    // Now unstage the insertion only (reverse of the staged diff's first hunk).
    let s = diff(&t, DiffTarget::Staged, "f.txt");
    assert_eq!(s.hunks.len(), 2);
    let p = build_patch(&s, &PatchSelection::Hunks(vec![0]), true, true).unwrap();
    apply(&t, &p, true).await;
    let mut expected: Vec<String> = numbered(30).lines().map(String::from).collect();
    expected.remove(27);
    assert_eq!(
        index_content(&t, "f.txt").unwrap(),
        expected.join("\n") + "\n"
    );
}

#[tokio::test]
async fn stage_line_subsets() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[("f.txt", "a\nb\nc\nd\n")], "base");
    t.write("f.txt", "a\nB1\nB2\nc\nD\n");
    let d = diff(&t, DiffTarget::Unstaged, "f.txt");
    assert_eq!(d.hunks.len(), 1);
    let ch = change_lines(&d, 0);
    // ' a' '-b' '+B1' '+B2' ' c' '-d' '+D'
    assert_eq!(ch, vec![1, 2, 3, 5, 6]);

    // Only `+B1`: index gets b, B1 (b kept as context), d unchanged.
    let p = build_patch(&d, &PatchSelection::Lines(vec![(0, 2)]), false, true).unwrap();
    apply(&t, &p, false).await;
    assert_eq!(index_content(&t, "f.txt").unwrap(), "a\nb\nB1\nc\nd\n");

    // Then only `-d` from the remaining diff.
    let d = diff(&t, DiffTarget::Unstaged, "f.txt");
    let del_d = d.hunks[0]
        .lines
        .iter()
        .position(|l| l.kind == DiffLineKind::Del && l.text == "d")
        .unwrap();
    let p = build_patch(&d, &PatchSelection::Lines(vec![(0, del_d)]), false, true).unwrap();
    apply(&t, &p, false).await;
    assert_eq!(index_content(&t, "f.txt").unwrap(), "a\nb\nB1\nc\n");

    // Reverse: unstage `+B1` only from the staged diff.
    let s = diff(&t, DiffTarget::Staged, "f.txt");
    let add_b1 = s.hunks[0]
        .lines
        .iter()
        .position(|l| l.kind == DiffLineKind::Add && l.text == "B1")
        .unwrap();
    let p = build_patch(&s, &PatchSelection::Lines(vec![(0, add_b1)]), true, true).unwrap();
    apply(&t, &p, true).await;
    assert_eq!(index_content(&t, "f.txt").unwrap(), "a\nb\nc\n");
}

#[tokio::test]
async fn added_deleted_and_partial_new_file() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[("old.txt", "o1\no2\n")], "base");
    t.write("new.txt", "n1\nn2\nn3\n");
    std::fs::remove_file(t.path().join("old.txt")).unwrap();

    let d = diff(&t, DiffTarget::Unstaged, "new.txt");
    let p = build_patch(&d, &PatchSelection::Hunks(vec![0]), false, true).unwrap();
    apply(&t, &p, false).await;
    assert_eq!(index_content(&t, "new.txt").unwrap(), "n1\nn2\nn3\n");

    let d = diff(&t, DiffTarget::Unstaged, "old.txt");
    let p = build_patch(&d, &PatchSelection::Hunks(vec![0]), false, true).unwrap();
    apply(&t, &p, false).await;
    assert!(index_content(&t, "old.txt").is_none());

    // Unstage the middle line of the new file: index keeps n1, n3.
    let s = diff(&t, DiffTarget::Staged, "new.txt");
    let p = build_patch(&s, &PatchSelection::Lines(vec![(0, 1)]), true, true).unwrap();
    apply(&t, &p, true).await;
    assert_eq!(index_content(&t, "new.txt").unwrap(), "n1\nn3\n");

    // Unstage the deletion of `o2` only: index gets o2 back (partial deletion).
    let s = diff(&t, DiffTarget::Staged, "old.txt");
    let p = build_patch(&s, &PatchSelection::Lines(vec![(0, 1)]), true, true).unwrap();
    apply(&t, &p, true).await;
    assert_eq!(index_content(&t, "old.txt").unwrap(), "o2\n");
}

#[tokio::test]
async fn crlf_and_no_newline_round_trip() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.set_config("core.autocrlf", "false");
    t.commit(&[("f.txt", "a\r\nb\r\nc\r\n")], "base");
    t.write("f.txt", "a\r\nB\r\nc\r\nd");
    let d = diff(&t, DiffTarget::Unstaged, "f.txt");
    let p = build_patch(&d, &PatchSelection::Hunks(vec![0]), false, true).unwrap();
    apply(&t, &p, false).await;
    assert_eq!(index_content(&t, "f.txt").unwrap(), "a\r\nB\r\nc\r\nd");
}

#[tokio::test]
async fn autocrlf_repo_stages_lf_content() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.set_config("core.autocrlf", "true");
    t.commit(&[("f.txt", "a\nb\n")], "base");
    // Workdir holds CRLF; the stage-able diff is post-filter (LF), so the
    // patch applies to the LF index content.
    t.write("f.txt", "a\r\nB\r\nc\r\n");
    let d = diff(&t, DiffTarget::Unstaged, "f.txt");
    assert!(
        d.hunks[0].lines.iter().all(|l| !l.text.ends_with('\r')),
        "{:?}",
        d.hunks[0].lines
    );
    let p = build_patch(&d, &PatchSelection::Hunks(vec![0]), false, true).unwrap();
    apply(&t, &p, false).await;
    assert_eq!(index_content(&t, "f.txt").unwrap(), "a\nB\nc\n");
    // Nothing left to stage.
    let rest = changed_files(&t.repo, &DiffTarget::Unstaged).unwrap();
    assert!(rest.iter().all(|f| f.path != "f.txt"), "{rest:?}");
}

/// Unix only: Windows sets `core.filemode=false`, so no mode change is ever
/// reported there and there is nothing to stage.
#[cfg(unix)]
#[tokio::test]
async fn stages_the_exec_bit_with_the_first_hunk() {
    use std::os::unix::fs::PermissionsExt;

    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.set_config("core.filemode", "true");
    t.commit(&[("s.sh", "a\nb\n")], "base");

    let full = t.path().join("s.sh");
    std::fs::write(&full, "a\nB\n").expect("write");
    let mut perms = std::fs::metadata(&full).expect("metadata").permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(&full, perms).expect("chmod");

    let d = diff(&t, DiffTarget::Unstaged, "s.sh");
    assert_eq!(d.old_mode.as_deref(), Some("100644"));
    assert_eq!(d.new_mode.as_deref(), Some("100755"));

    let p = build_patch(&d, &PatchSelection::Hunks(vec![0]), false, true).unwrap();
    apply(&t, &p, false).await;

    let index = t.repo.index().expect("index");
    let e = index.get_path(Path::new("s.sh"), 0).expect("entry");
    assert_eq!(e.mode, 0o100755, "{p}");
    assert_eq!(index_content(&t, "s.sh").unwrap(), "a\nB\n");
}

/// Discard = the unstaged patch reverse-applied to the working tree: the diff's
/// new side *is* the file on disk, so `-R` without `--cached` undoes it there.
#[tokio::test]
async fn discard_hunk_subset_keeps_the_other_hunk() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.set_config("core.autocrlf", "false");
    t.commit(&[("f.txt", &numbered(30))], "base");
    let mut lines: Vec<String> = numbered(30).lines().map(String::from).collect();
    lines[2] = "LINE 3".into();
    lines[26] = "LINE 27".into();
    t.write("f.txt", lines.join("\n") + "\n");

    let d = diff(&t, DiffTarget::Unstaged, "f.txt");
    assert_eq!(d.hunks.len(), 2);
    // Stage the second edit first: dropping `--cached` is what keeps the
    // discard off the index, so there has to be something in it to keep.
    let p = build_patch(&d, &PatchSelection::Hunks(vec![1]), false, true).unwrap();
    apply(&t, &p, false).await;
    let staged = index_content(&t, "f.txt").unwrap();

    let d = diff(&t, DiffTarget::Unstaged, "f.txt");
    assert_eq!(d.hunks.len(), 1);
    let p = build_patch(&d, &PatchSelection::Hunks(vec![0]), true, false).unwrap();
    discard(&t, &p).await;

    let mut expected: Vec<String> = numbered(30).lines().map(String::from).collect();
    expected[26] = "LINE 27".into();
    assert_eq!(read(&t, "f.txt"), expected.join("\n") + "\n");
    assert_eq!(
        index_content(&t, "f.txt").unwrap(),
        staged,
        "the index keeps the hunk that was staged"
    );
}

/// The working-tree apply runs the content through the filters on write, so a
/// discard in an `autocrlf` repo has to come back out with CRLFs.
#[tokio::test]
async fn discard_hunk_in_an_autocrlf_repo() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.set_config("core.autocrlf", "true");
    t.commit(&[("f.txt", "a\nb\n")], "base");
    t.write("f.txt", "a\r\nB\r\nc\r\n");

    let d = diff(&t, DiffTarget::Unstaged, "f.txt");
    // The stage-able diff is post-filter (LF); the patch is built from it.
    assert!(d.hunks[0].lines.iter().all(|l| !l.text.ends_with('\r')));
    let p = build_patch(&d, &PatchSelection::Hunks(vec![0]), true, false).unwrap();
    discard(&t, &p).await;
    assert_eq!(read(&t, "f.txt"), "a\r\nb\r\n");
}

/// Unix only, as [`stages_the_exec_bit_with_the_first_hunk`]: `git apply -R`
/// reverses `old mode` / `new mode` along with the hunks, so a discard must
/// not emit them — the exec bit was never part of the selection.
#[cfg(unix)]
#[tokio::test]
async fn discard_hunk_leaves_the_exec_bit_alone() {
    use std::os::unix::fs::PermissionsExt;

    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.set_config("core.filemode", "true");
    t.set_config("core.autocrlf", "false");
    t.commit(&[("s.sh", &numbered(30))], "base");

    let mut lines: Vec<String> = numbered(30).lines().map(String::from).collect();
    for i in [2, 14, 26] {
        lines[i] = format!("LINE {}", i + 1);
    }
    t.write("s.sh", lines.join("\n") + "\n");
    let full = t.path().join("s.sh");
    let mut perms = std::fs::metadata(&full).expect("metadata").permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(&full, perms).expect("chmod");

    let d = diff(&t, DiffTarget::Unstaged, "s.sh");
    assert_eq!(d.hunks.len(), 3);
    assert_eq!(d.new_mode.as_deref(), Some("100755"));
    let p = build_patch(&d, &PatchSelection::Hunks(vec![0]), true, false).unwrap();
    discard(&t, &p).await;

    let mode = std::fs::metadata(&full)
        .expect("metadata")
        .permissions()
        .mode();
    assert_eq!(mode & 0o777, 0o755, "{p}");
    let mut expected: Vec<String> = numbered(30).lines().map(String::from).collect();
    for i in [14, 26] {
        expected[i] = format!("LINE {}", i + 1);
    }
    assert_eq!(read(&t, "s.sh"), expected.join("\n") + "\n");
}

/// The mirror of [`stages_the_exec_bit_with_the_first_hunk`]: the mode change
/// rides back out with the first partial unstage.
#[cfg(unix)]
#[tokio::test]
async fn unstage_carries_the_mode_change_out_of_the_index() {
    use std::os::unix::fs::PermissionsExt;

    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.set_config("core.filemode", "true");
    t.commit(&[("s.sh", "a\nb\n")], "base");

    let full = t.path().join("s.sh");
    std::fs::write(&full, "a\nB\n").expect("write");
    let mut perms = std::fs::metadata(&full).expect("metadata").permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(&full, perms).expect("chmod");

    let d = diff(&t, DiffTarget::Unstaged, "s.sh");
    let p = build_patch(&d, &PatchSelection::Hunks(vec![0]), false, true).unwrap();
    apply(&t, &p, false).await;
    let entry_mode = |t: &TempRepo| {
        t.repo
            .index()
            .expect("index")
            .get_path(Path::new("s.sh"), 0)
            .expect("entry")
            .mode
    };
    assert_eq!(entry_mode(&t), 0o100755);

    let s = diff(&t, DiffTarget::Staged, "s.sh");
    assert_eq!(s.old_mode.as_deref(), Some("100644"));
    assert_eq!(s.new_mode.as_deref(), Some("100755"));
    let p = build_patch(&s, &PatchSelection::Hunks(vec![0]), true, true).unwrap();
    apply(&t, &p, true).await;
    assert_eq!(entry_mode(&t), 0o100644, "{p}");
    assert_eq!(index_content(&t, "s.sh").unwrap(), "a\nb\n");
}

#[tokio::test]
async fn discard_lines_subset() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.set_config("core.autocrlf", "false");
    t.commit(&[("f.txt", "a\nb\n")], "base");
    t.write("f.txt", "a\nX\nY\nb\n");
    let d = diff(&t, DiffTarget::Unstaged, "f.txt");
    assert_eq!(change_lines(&d, 0).len(), 2);
    let x = d.hunks[0]
        .lines
        .iter()
        .position(|l| l.kind == DiffLineKind::Add && l.text == "X")
        .unwrap();

    // Only `+X` goes; `+Y` is unselected, so it stays as context.
    let p = build_patch(&d, &PatchSelection::Lines(vec![(0, x)]), true, false).unwrap();
    discard(&t, &p).await;
    assert_eq!(read(&t, "f.txt"), "a\nY\nb\n");
}

#[tokio::test]
async fn discard_hunk_in_a_crlf_file() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    // The patch carries the `\r`s verbatim; git apply must still match the file.
    t.set_config("core.autocrlf", "false");
    let crlf = |lines: &[String]| lines.join("\r\n") + "\r\n";
    let base: Vec<String> = (1..=30).map(|i| format!("line {i}")).collect();
    t.commit(&[("f.txt", &crlf(&base))], "base");
    let mut lines = base.clone();
    lines[2] = "LINE 3".into();
    lines[26] = "LINE 27".into();
    t.write("f.txt", crlf(&lines));

    let d = diff(&t, DiffTarget::Unstaged, "f.txt");
    assert_eq!(d.hunks.len(), 2);
    let p = build_patch(&d, &PatchSelection::Hunks(vec![0]), true, false).unwrap();
    discard(&t, &p).await;

    let mut expected = base.clone();
    expected[26] = "LINE 27".into();
    assert_eq!(read(&t, "f.txt"), crlf(&expected));
}

/// `git apply -R` reverses a `rename from` / `rename to` header along with the
/// hunks, putting the file back under its old name with the edits that were
/// not selected: unstaging one hunk of a staged rename must keep the rename.
#[tokio::test]
async fn a_partial_unstage_of_a_staged_rename_keeps_the_rename() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[("old.txt", &numbered(30))], "base");
    t.rename_file("old.txt", "new.txt");
    let mut lines: Vec<String> = numbered(30).lines().map(String::from).collect();
    lines[2] = "LINE 3".into();
    lines[26] = "LINE 27".into();
    t.write("new.txt", lines.join("\n") + "\n");
    t.stage(&["new.txt"]);

    let s = diff(&t, DiffTarget::Staged, "new.txt");
    assert_eq!(s.status, FileStatus::Renamed, "{:?}", s.status);
    assert_eq!(s.old_path.as_deref(), Some("old.txt"));
    assert_eq!(s.hunks.len(), 2);

    let p = build_patch(&s, &PatchSelection::Hunks(vec![0]), true, true).unwrap();
    apply(&t, &p, true).await;

    let mut expected: Vec<String> = numbered(30).lines().map(String::from).collect();
    expected[26] = "LINE 27".into();
    assert_eq!(
        index_content(&t, "new.txt").unwrap(),
        expected.join("\n") + "\n"
    );
    assert!(index_content(&t, "old.txt").is_none(), "{p}");
}
