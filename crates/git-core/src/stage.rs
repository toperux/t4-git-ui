//! Path-level stage / unstage / discard via the libgit2 index. Hunk and line
//! staging goes through the CLI (`git apply --cached`), see
//! [`stage_patch_args`] and [`crate::patch`].

use std::path::Path;

use git2::build::CheckoutBuilder;
use git2::{ErrorCode, ObjectType, Repository, Status};

use crate::{map_git2, GitError};

fn workdir(repo: &Repository) -> Result<&Path, GitError> {
    repo.workdir()
        .ok_or_else(|| GitError::NotARepo(repo.path().to_path_buf()))
}

/// Stages the current working-tree state of `paths` (repo-relative, `/`-separated):
/// new/modified files are added, missing files are removed from the index.
/// A rename is staged by passing both its old and new path.
pub fn stage_paths(repo: &Repository, paths: &[&str]) -> Result<(), GitError> {
    let workdir = workdir(repo)?;
    let mut index = repo.index().map_err(map_git2)?;
    for p in paths {
        let rel = Path::new(p);
        if workdir.join(rel).symlink_metadata().is_ok() {
            index.add_path(rel)
        } else {
            index.remove_path(rel)
        }
        .map_err(map_git2)?;
    }
    index.write().map_err(map_git2)
}

/// Resets the index entries of `paths` to HEAD (removes them when HEAD is unborn).
pub fn unstage_paths(repo: &Repository, paths: &[&str]) -> Result<(), GitError> {
    let head = match repo.head() {
        Ok(head) => Some(head.peel(ObjectType::Commit).map_err(map_git2)?),
        Err(e) if e.code() == ErrorCode::UnbornBranch => None,
        Err(e) => return Err(map_git2(e)),
    };
    repo.reset_default(head.as_ref(), paths).map_err(map_git2)
}

/// Discards UNSTAGED changes of `paths`: tracked files are restored from the
/// index (staged content is kept), untracked files are deleted. Ignored and
/// unchanged paths are skipped. Returns the paths actually touched.
pub fn discard_paths(repo: &Repository, paths: &[&str]) -> Result<Vec<String>, GitError> {
    let workdir = workdir(repo)?;
    let mut restore: Vec<&str> = Vec::new();
    let mut discarded = Vec::new();
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
            std::fs::remove_file(workdir.join(p))?;
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

/// Arguments for applying a patch (on stdin) to the index; `reverse` unstages.
pub fn stage_patch_args(reverse: bool) -> Vec<&'static str> {
    let mut args = vec!["apply", "--cached", "--whitespace=nowarn"];
    if reverse {
        args.push("-R");
    }
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
    fn patch_args() {
        assert_eq!(
            stage_patch_args(false),
            ["apply", "--cached", "--whitespace=nowarn", "-"]
        );
        assert_eq!(
            stage_patch_args(true),
            ["apply", "--cached", "--whitespace=nowarn", "-R", "-"]
        );
    }
}
