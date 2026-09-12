//! Path-level stage / unstage / discard via the libgit2 index. Hunk and line
//! selections go through the CLI: `git apply --cached` for a stage / unstage
//! ([`stage_patch_args`]) and `git apply` on the working tree for a discard
//! ([`discard_patch_args`], deliberately without `--cached`); see
//! [`crate::patch`].

use std::path::Path;

use git2::build::CheckoutBuilder;
use git2::{ErrorCode, Index, ObjectType, Repository, Status};
use serde::{Deserialize, Serialize};

use crate::{map_git2, GitError};

fn workdir(repo: &Repository) -> Result<&Path, GitError> {
    repo.workdir()
        .ok_or_else(|| GitError::NotARepo(repo.path().to_path_buf()))
}

/// Mutates the index through `f` and writes it, rolling the in-memory copy back
/// to what is on disk on any error — a path refused halfway through `f` as much
/// as a failed write (a held `index.lock`). libgit2 caches one `Index` per
/// `Repository`, so mutations kept after an error would make the next
/// `statuses()` report a path as staged that git never wrote.
fn with_index(
    index: &mut Index,
    f: impl FnOnce(&mut Index) -> Result<(), GitError>,
) -> Result<(), GitError> {
    f(index)
        .and_then(|()| index.write().map_err(map_git2))
        .inspect_err(|_| {
            let _ = index.read(true);
        })
}

/// Stages the current working-tree state of `paths` (repo-relative, `/`-separated):
/// new/modified files are added, missing files are removed from the index.
/// A rename is staged by passing both its old and new path. An ignored file
/// that is not tracked yet is refused (`Index::add_path` would force-add it).
pub fn stage_paths(repo: &Repository, paths: &[&str]) -> Result<(), GitError> {
    let workdir = workdir(repo)?;
    let mut index = repo.index().map_err(map_git2)?;
    // The CLI may have written this index a moment ago (a merge, a checkout of
    // one conflict side, `apply --cached`), and libgit2 hands back the copy it
    // last read — writing that back would undo git's write.
    index.read(false).map_err(map_git2)?;
    with_index(&mut index, |index| {
        for p in paths {
            let rel = Path::new(p);
            if workdir.join(rel).symlink_metadata().is_ok() {
                // Stages 1–3 are the sides of a conflict: an unmerged path has no
                // stage 0, and it is tracked either way.
                let tracked = (0..=3).any(|s| index.get_path(rel, s).is_some());
                if !tracked && repo.status_should_ignore(rel).map_err(map_git2)? {
                    return Err(GitError::Refused(format!("{p} is ignored")));
                }
                index.add_path(rel)
            } else {
                index.remove_path(rel)
            }
            .map_err(map_git2)?;
        }
        Ok(())
    })
}

/// Removes the directories left empty by deleting `file`, up to (not
/// including) `workdir`.
fn prune_empty_dirs(workdir: &Path, file: &Path) {
    let mut dir = file.parent();
    while let Some(d) = dir.filter(|d| *d != workdir && d.starts_with(workdir)) {
        let empty = std::fs::read_dir(d).is_ok_and(|mut it| it.next().is_none());
        if !empty || std::fs::remove_dir(d).is_err() {
            break;
        }
        dir = d.parent();
    }
}

/// Resets the index entries of `paths` to HEAD (removes them when HEAD is unborn).
pub fn unstage_paths(repo: &Repository, paths: &[&str]) -> Result<(), GitError> {
    // As in `stage_paths`: `reset_default` writes the index libgit2 cached.
    repo.index()
        .map_err(map_git2)?
        .read(false)
        .map_err(map_git2)?;
    let head = match repo.head() {
        Ok(head) => Some(head.peel(ObjectType::Commit).map_err(map_git2)?),
        Err(e) if e.code() == ErrorCode::UnbornBranch => None,
        Err(e) => return Err(map_git2(e)),
    };
    // `reset_default` does its own write, so it cannot go through `with_index`;
    // the rollback it gives has to be done by hand.
    repo.reset_default(head.as_ref(), paths)
        .map_err(map_git2)
        .inspect_err(|_| {
            let _ = repo.index().and_then(|mut i| i.read(true));
        })
}

/// Discards UNSTAGED changes of `paths`: tracked files are restored from the
/// index (staged content is kept), untracked files are deleted. Ignored and
/// unchanged paths are skipped. Returns the paths actually touched.
pub fn discard_paths(repo: &Repository, paths: &[&str]) -> Result<Vec<String>, GitError> {
    let workdir = workdir(repo)?;
    let mut restore: Vec<&str> = Vec::new();
    let mut discarded = Vec::new();
    // A working-tree rename arrives as both halves from the caller: `status_file` runs single-path
    // with no rename detection, so it reports `WT_NEW` / `WT_DELETED` and can never pair them.
    for p in paths {
        let s = match repo.status_file(Path::new(p)) {
            Ok(s) => s,
            Err(e) if e.code() == ErrorCode::NotFound => continue,
            Err(e) => return Err(map_git2(e)),
        };
        if s.contains(Status::IGNORED) {
            continue;
        }
        if s.contains(Status::WT_NEW) {
            let file = workdir.join(p);
            std::fs::remove_file(&file)?;
            prune_empty_dirs(workdir, &file);
            discarded.push((*p).to_string());
        } else if s.intersects(
            Status::WT_MODIFIED | Status::WT_DELETED | Status::WT_TYPECHANGE | Status::WT_RENAMED,
        ) {
            restore.push(p);
        }
    }
    if !restore.is_empty() {
        let mut cb = CheckoutBuilder::new();
        cb.force();
        for p in &restore {
            cb.path(p);
        }
        repo.checkout_index(None, Some(&mut cb)).map_err(map_git2)?;
        discarded.extend(restore.into_iter().map(String::from));
    }
    Ok(discarded)
}

/// Arguments for `git checkout --merge -- <paths>`: puts `paths` back the way the
/// merge left them — the three index stages and a working file full of markers.
///
/// The recovery for staging a file whose conflict was never resolved: `git add`
/// on an unmerged path *is* "mark resolved", it drops the stages, and no `reset`
/// brings them back. Only git can do this (libgit2 has no equivalent), and it
/// overwrites the working file, so it belongs behind a confirmation.
pub fn recreate_conflict_args(paths: &[&str]) -> Vec<String> {
    let mut args = vec![
        "checkout".to_string(),
        "--merge".to_string(),
        "--".to_string(),
    ];
    args.extend(paths.iter().map(|p| (*p).to_string()));
    args
}

/// Which side of a conflict to keep, in **git's** sense — during a rebase
/// `Ours` is the branch being rebased onto (see [`crate::refs::ConflictSides`]).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConflictSide {
    Ours,
    Theirs,
}

/// Splits `paths` into those whose `side` exists as an index stage and those
/// where it does not — a modify/delete conflict, where `checkout --ours|--theirs`
/// can never succeed and one bad path aborts the whole batch. Accepting that
/// side means removing the path ([`remove_paths`]).
///
/// A path that is not unmerged at all counts as present: git's own message for
/// it is the right one.
pub fn split_by_side<'a>(
    repo: &Repository,
    paths: &[&'a str],
    side: ConflictSide,
) -> Result<(Vec<&'a str>, Vec<&'a str>), GitError> {
    let mut index = repo.index().map_err(map_git2)?;
    // The merge that made these conflicts was the CLI's write (see `stage_paths`).
    index.read(false).map_err(map_git2)?;
    let wanted = match side {
        ConflictSide::Ours => 2,
        ConflictSide::Theirs => 3,
    };
    let (mut present, mut missing) = (Vec::new(), Vec::new());
    for p in paths {
        let rel = Path::new(p);
        let unmerged = (1..=3).any(|s| index.get_path(rel, s).is_some());
        if !unmerged || index.get_path(rel, wanted).is_some() {
            present.push(*p);
        } else {
            missing.push(*p);
        }
    }
    Ok((present, missing))
}

/// Removes `paths` from the index (every stage) and deletes their working
/// files: how the side that *deleted* a file is kept.
pub fn remove_paths(repo: &Repository, paths: &[&str]) -> Result<(), GitError> {
    let workdir = workdir(repo)?;
    let mut index = repo.index().map_err(map_git2)?;
    index.read(false).map_err(map_git2)?;
    let mut files = Vec::new();
    with_index(&mut index, |index| {
        for p in paths {
            let rel = Path::new(p);
            index.remove_path(rel).map_err(map_git2)?;
            let file = workdir.join(rel);
            if file.symlink_metadata().is_ok() {
                files.push(file);
            }
        }
        Ok(())
    })?;
    // Only after the index is on disk: a failed write (a held `index.lock`)
    // rolls the stages back, and a file already deleted would leave that
    // conflict with nothing behind it.
    for file in files {
        std::fs::remove_file(&file)?;
        prune_empty_dirs(workdir, &file);
    }
    Ok(())
}

/// Arguments for `git checkout --ours|--theirs -- <paths>`: replaces each
/// conflicted file with one whole side of its conflict. libgit2 has no
/// equivalent, and a side that does not exist (deleted by the other branch)
/// is git's error to report — see [`split_by_side`] for keeping those paths
/// out of the batch.
pub fn checkout_side_args(side: ConflictSide, paths: &[&str]) -> Vec<String> {
    let flag = match side {
        ConflictSide::Ours => "--ours",
        ConflictSide::Theirs => "--theirs",
    };
    let mut args = vec!["checkout".to_string(), flag.to_string(), "--".to_string()];
    args.extend(paths.iter().map(|p| (*p).to_string()));
    args
}

/// `git apply` refuses (or silently misplaces) a zero-context hunk without
/// this: with no surrounding lines it cannot find where the hunk goes and
/// takes the line numbers literally.
fn zero_context_arg(args: &mut Vec<&'static str>, zero_context: bool) {
    if zero_context {
        args.push("--unidiff-zero");
    }
}

/// Arguments for applying a patch (on stdin) to the index; `reverse` unstages.
/// `zero_context` when the patch was built from a `context == 0` diff.
pub fn stage_patch_args(reverse: bool, zero_context: bool) -> Vec<&'static str> {
    let mut args = vec!["apply", "--cached", "--whitespace=nowarn"];
    if reverse {
        args.push("-R");
    }
    zero_context_arg(&mut args, zero_context);
    args.push("-");
    args
}

/// Arguments for reverse-applying a patch (on stdin) to the WORKING TREE — no
/// `--cached`, so the file on disk is the one edited. The patch is built from
/// the unstaged diff with `reverse = true`: its new side *is* the working tree.
pub fn discard_patch_args(zero_context: bool) -> Vec<&'static str> {
    let mut args = vec!["apply", "-R", "--whitespace=nowarn"];
    zero_context_arg(&mut args, zero_context);
    args.push("-");
    args
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diff::FileStatus;
    use crate::status::{status, StatusEntry};
    use crate::test_util::TempRepo;

    fn entry(t: &TempRepo, path: &str) -> Option<StatusEntry> {
        status(&t.repo)
            .expect("status")
            .entries
            .into_iter()
            .find(|e| e.path == path)
    }

    fn index_content(t: &TempRepo, path: &str) -> Option<String> {
        let index = t.repo.index().expect("index");
        let e = index.get_path(Path::new(path), 0)?;
        let blob = t.repo.find_blob(e.id).expect("blob");
        Some(String::from_utf8_lossy(blob.content()).into_owned())
    }

    #[test]
    fn stage_and_unstage_add_modify_delete() {
        let t = TempRepo::new();
        t.commit(&[("m.txt", "m\n"), ("d.txt", "d\n")], "base");
        t.write("m.txt", "m2\n");
        t.write("new.txt", "n\n");
        std::fs::remove_file(t.path().join("d.txt")).unwrap();

        stage_paths(&t.repo, &["m.txt", "new.txt", "d.txt"]).unwrap();
        assert_eq!(
            entry(&t, "m.txt").unwrap().index,
            Some(FileStatus::Modified)
        );
        assert_eq!(entry(&t, "new.txt").unwrap().index, Some(FileStatus::Added));
        assert_eq!(entry(&t, "d.txt").unwrap().index, Some(FileStatus::Deleted));
        assert_eq!(index_content(&t, "m.txt").as_deref(), Some("m2\n"));
        assert!(status(&t.repo)
            .unwrap()
            .entries
            .iter()
            .all(|e| e.workdir.is_none()));

        unstage_paths(&t.repo, &["m.txt", "new.txt", "d.txt"]).unwrap();
        let e = entry(&t, "m.txt").unwrap();
        assert_eq!((e.index, e.workdir), (None, Some(FileStatus::Modified)));
        let e = entry(&t, "new.txt").unwrap();
        assert_eq!((e.index, e.workdir), (None, Some(FileStatus::Untracked)));
        let e = entry(&t, "d.txt").unwrap();
        assert_eq!((e.index, e.workdir), (None, Some(FileStatus::Deleted)));
        assert_eq!(index_content(&t, "m.txt").as_deref(), Some("m\n"));
    }

    /// A failed `index.write()` must not leave the mutation in libgit2's cached
    /// index: the UI read the path back as staged while git had never written it.
    #[test]
    fn a_locked_index_leaves_the_path_unstaged() {
        let t = TempRepo::new();
        t.commit(&[("f.txt", "v0\n")], "base");
        t.write("f.txt", "v1\n");

        let lock = t.path().join(".git").join("index.lock");
        std::fs::write(&lock, "").unwrap();
        assert!(matches!(
            stage_paths(&t.repo, &["f.txt"]),
            Err(GitError::IndexLocked)
        ));
        let e = entry(&t, "f.txt").unwrap();
        assert_eq!((e.index, e.workdir), (None, Some(FileStatus::Modified)));

        std::fs::remove_file(&lock).unwrap();
        stage_paths(&t.repo, &["f.txt"]).unwrap();
        let e = entry(&t, "f.txt").unwrap();
        assert_eq!((e.index, e.workdir), (Some(FileStatus::Modified), None));
    }

    /// The mirror for unstage: `reset_default` writes the index itself, so a
    /// failed write has to be rolled back too — git still has the path staged.
    #[test]
    fn a_locked_index_leaves_the_path_staged() {
        let t = TempRepo::new();
        t.commit(&[("f.txt", "v0\n")], "base");
        t.write("f.txt", "v1\n");
        stage_paths(&t.repo, &["f.txt"]).unwrap();

        let lock = t.path().join(".git").join("index.lock");
        std::fs::write(&lock, "").unwrap();
        assert!(matches!(
            unstage_paths(&t.repo, &["f.txt"]),
            Err(GitError::IndexLocked)
        ));
        let e = entry(&t, "f.txt").unwrap();
        assert_eq!((e.index, e.workdir), (Some(FileStatus::Modified), None));

        std::fs::remove_file(&lock).unwrap();
        unstage_paths(&t.repo, &["f.txt"]).unwrap();
        let e = entry(&t, "f.txt").unwrap();
        assert_eq!((e.index, e.workdir), (None, Some(FileStatus::Modified)));
    }

    /// The refusal comes mid-loop, after the earlier path was already added to
    /// libgit2's cached index — nothing was written, so nothing may look staged.
    #[test]
    fn a_refused_path_leaves_the_earlier_ones_unstaged() {
        let t = TempRepo::new();
        t.commit(&[(".gitignore", "*.log\n"), ("a.txt", "v0\n")], "base");
        t.write("a.txt", "v1\n");
        t.write("debug.log", "x\n");

        assert!(matches!(
            stage_paths(&t.repo, &["a.txt", "debug.log"]),
            Err(GitError::Refused(_))
        ));
        let e = entry(&t, "a.txt").unwrap();
        assert_eq!((e.index, e.workdir), (None, Some(FileStatus::Modified)));
    }

    #[test]
    fn stage_refuses_an_ignored_untracked_file_but_not_a_tracked_one() {
        let t = TempRepo::new();
        t.commit(
            &[(".gitignore", "*.log\n"), ("kept.log", "tracked\n")],
            "base",
        );
        t.write("debug.log", "x\n");
        t.write("kept.log", "tracked, edited\n");
        assert!(matches!(
            stage_paths(&t.repo, &["debug.log"]),
            Err(GitError::Refused(_))
        ));
        assert!(entry(&t, "debug.log").is_none());
        // Matching an ignore pattern does not un-track a file that is in the index.
        stage_paths(&t.repo, &["kept.log"]).unwrap();
        assert_eq!(
            entry(&t, "kept.log").unwrap().index,
            Some(FileStatus::Modified)
        );
    }

    #[test]
    fn discard_of_an_untracked_file_prunes_the_empty_dirs_it_leaves() {
        let t = TempRepo::new();
        t.commit(&[("keep/a.txt", "a\n")], "base");
        t.write("new/deep/file.txt", "n\n");
        t.write("keep/other.txt", "o\n");
        let touched = discard_paths(&t.repo, &["new/deep/file.txt", "keep/other.txt"]).unwrap();
        assert_eq!(touched.len(), 2);
        assert!(!t.path().join("new").exists(), "empty parents removed");
        assert!(
            t.path().join("keep/a.txt").exists(),
            "a dir with content stays"
        );
    }

    #[test]
    fn stage_and_unstage_rename_both_halves() {
        let t = TempRepo::new();
        t.commit(&[("old.txt", "same content\nfor rename\n")], "base");
        std::fs::rename(t.path().join("old.txt"), t.path().join("new.txt")).unwrap();

        stage_paths(&t.repo, &["old.txt", "new.txt"]).unwrap();
        let e = entry(&t, "new.txt").unwrap();
        assert_eq!(e.index, Some(FileStatus::Renamed));
        assert_eq!(e.old_path.as_deref(), Some("old.txt"));
        assert!(entry(&t, "old.txt").is_none());

        unstage_paths(&t.repo, &["old.txt", "new.txt"]).unwrap();
        let e = entry(&t, "new.txt").unwrap();
        assert_eq!(e.index, None);
        assert_eq!(e.workdir, Some(FileStatus::Renamed));
        assert!(entry(&t, "old.txt").is_none(), "{:?}", entry(&t, "old.txt"));
    }

    #[test]
    fn unstage_on_unborn_head_removes_entries() {
        let t = TempRepo::new();
        t.write("a.txt", "a\n");
        stage_paths(&t.repo, &["a.txt"]).unwrap();
        assert_eq!(entry(&t, "a.txt").unwrap().index, Some(FileStatus::Added));
        unstage_paths(&t.repo, &["a.txt"]).unwrap();
        assert_eq!(
            entry(&t, "a.txt").unwrap().workdir,
            Some(FileStatus::Untracked)
        );
        assert!(index_content(&t, "a.txt").is_none());
    }

    #[test]
    fn discard_restores_from_index_and_keeps_staged() {
        let t = TempRepo::new();
        // Don't let a global `core.autocrlf` rewrite what the checkout puts on disk.
        t.set_config("core.autocrlf", "false");
        t.commit(
            &[("f.txt", "v0\n"), ("gone.txt", "g\n"), ("clean.txt", "")],
            "base",
        );
        t.write("f.txt", "v1\n");
        stage_paths(&t.repo, &["f.txt"]).unwrap();
        t.write("f.txt", "v2\n");
        std::fs::remove_file(t.path().join("gone.txt")).unwrap();

        let mut got =
            discard_paths(&t.repo, &["f.txt", "gone.txt", "clean.txt", "missing.txt"]).unwrap();
        got.sort();
        assert_eq!(got, vec!["f.txt", "gone.txt"]);
        assert_eq!(
            std::fs::read_to_string(t.path().join("f.txt")).unwrap(),
            "v1\n"
        );
        assert_eq!(
            std::fs::read_to_string(t.path().join("gone.txt")).unwrap(),
            "g\n"
        );
        let e = entry(&t, "f.txt").unwrap();
        assert_eq!((e.index, e.workdir), (Some(FileStatus::Modified), None));
        assert_eq!(index_content(&t, "f.txt").as_deref(), Some("v1\n"));
    }

    #[test]
    fn discard_deletes_untracked_but_never_ignored() {
        let t = TempRepo::new();
        t.commit(&[(".gitignore", "*.log\n")], "base");
        t.write("scratch.txt", "x");
        t.write("debug.log", "x");
        let got = discard_paths(&t.repo, &["scratch.txt", "debug.log"]).unwrap();
        assert_eq!(got, vec!["scratch.txt"]);
        assert!(!t.path().join("scratch.txt").exists());
        assert!(t.path().join("debug.log").exists());
    }

    #[test]
    fn discard_of_a_workdir_rename_restores_the_old_name() {
        let t = TempRepo::new();
        // Don't let a global `core.autocrlf` rewrite what the checkout puts on disk.
        t.set_config("core.autocrlf", "false");
        t.commit(&[("old.txt", "same content\nfor rename\n")], "base");
        std::fs::rename(t.path().join("old.txt"), t.path().join("new.txt")).unwrap();
        t.write("new.txt", "same content\nfor rename\nand an edit\n");

        let mut got = discard_paths(&t.repo, &["new.txt", "old.txt"]).unwrap();
        got.sort();
        assert_eq!(got, vec!["new.txt", "old.txt"]);
        assert_eq!(
            std::fs::read_to_string(t.path().join("old.txt")).unwrap(),
            "same content\nfor rename\n"
        );
        assert!(!t.path().join("new.txt").exists());
        assert!(entry(&t, "old.txt").is_none());
        assert!(entry(&t, "new.txt").is_none());
    }

    /// Why the caller sends both halves: `status_file` sees only `WT_NEW` for the
    /// new name, so a one-path discard deletes it and leaves the old one missing.
    #[test]
    fn discard_of_only_the_new_name_leaves_the_old_one_missing() {
        let t = TempRepo::new();
        t.commit(&[("old.txt", "same content\nfor rename\n")], "base");
        std::fs::rename(t.path().join("old.txt"), t.path().join("new.txt")).unwrap();

        assert_eq!(
            discard_paths(&t.repo, &["new.txt"]).unwrap(),
            vec!["new.txt"]
        );
        assert!(!t.path().join("new.txt").exists());
        assert!(!t.path().join("old.txt").exists());
        assert_eq!(
            entry(&t, "old.txt").unwrap().workdir,
            Some(FileStatus::Deleted)
        );
    }

    #[test]
    fn patch_args() {
        assert_eq!(
            stage_patch_args(false, false),
            ["apply", "--cached", "--whitespace=nowarn", "-"]
        );
        assert_eq!(
            stage_patch_args(true, false),
            ["apply", "--cached", "--whitespace=nowarn", "-R", "-"]
        );
    }

    #[test]
    fn zero_context_patches_carry_unidiff_zero() {
        assert_eq!(
            stage_patch_args(false, true),
            [
                "apply",
                "--cached",
                "--whitespace=nowarn",
                "--unidiff-zero",
                "-"
            ]
        );
        assert_eq!(
            stage_patch_args(true, true),
            [
                "apply",
                "--cached",
                "--whitespace=nowarn",
                "-R",
                "--unidiff-zero",
                "-"
            ]
        );
        assert_eq!(
            discard_patch_args(true),
            ["apply", "-R", "--whitespace=nowarn", "--unidiff-zero", "-"]
        );
    }

    #[test]
    fn checkout_side_args_carry_gits_own_flag() {
        assert_eq!(
            checkout_side_args(ConflictSide::Ours, &["a.rs"]),
            ["checkout", "--ours", "--", "a.rs"]
        );
        assert_eq!(
            checkout_side_args(ConflictSide::Theirs, &["a.rs", "dir/b.rs"]),
            ["checkout", "--theirs", "--", "a.rs", "dir/b.rs"]
        );
    }

    #[test]
    fn discard_patch_args_never_touch_the_index() {
        let args = discard_patch_args(false);
        assert_eq!(args, ["apply", "-R", "--whitespace=nowarn", "-"]);
        assert!(!args.contains(&"--cached"));
    }
}
