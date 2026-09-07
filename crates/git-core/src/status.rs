//! Working-directory status via libgit2 `git_status_list`.
//!
//! The plan's `git status --porcelain=v2 -z` fallback for very large trees is
//! not implemented yet; add it behind a flag if libgit2 proves too slow.

use git2::{Repository, Status, StatusOptions};
use serde::{Deserialize, Serialize};

use crate::diff::FileStatus;
use crate::{map_git2, GitError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusEntry {
    /// Current path (`/`-separated, repo-relative).
    pub path: String,
    /// Old path when renamed (in the index or the working directory).
    pub old_path: Option<String>,
    /// HEAD → index change, `None` when nothing is staged.
    pub index: Option<FileStatus>,
    /// Index → working directory change, `None` when the workdir matches the index.
    pub workdir: Option<FileStatus>,
    pub conflicted: bool,
    /// `<mtime ms>:<size>` of the file on disk, `None` when it isn't there (or has
    /// no working-tree side). The status letters say nothing about *content*: a
    /// file edited in an editor stays `modified`, and a conflict stays `conflicted`
    /// until it is staged, so this is what tells the UI its diff went stale.
    pub workdir_stamp: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkdirStatus {
    /// Sorted by `path`.
    pub entries: Vec<StatusEntry>,
    /// Entries with an `index` change.
    pub staged: u32,
    /// Entries with a tracked `workdir` change (not untracked).
    pub unstaged: u32,
    pub untracked: u32,
    pub conflicted: u32,
}

/// `<mtime ms>:<size>` of a working-tree file — the pair git's own index cache
/// trusts to decide a file is unchanged. `None` when it cannot be read (deleted
/// on this side of a conflict, or a bare repo).
fn workdir_stamp(repo: &Repository, path: &str) -> Option<String> {
    let meta = std::fs::metadata(repo.workdir()?.join(path)).ok()?;
    let ms = meta
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis();
    Some(format!("{ms}:{}", meta.len()))
}

fn index_status(s: Status) -> Option<FileStatus> {
    if s.contains(Status::INDEX_NEW) {
        Some(FileStatus::Added)
    } else if s.contains(Status::INDEX_RENAMED) {
        Some(FileStatus::Renamed)
    } else if s.contains(Status::INDEX_DELETED) {
        Some(FileStatus::Deleted)
    } else if s.contains(Status::INDEX_TYPECHANGE) {
        Some(FileStatus::Typechange)
    } else if s.contains(Status::INDEX_MODIFIED) {
        Some(FileStatus::Modified)
    } else {
        None
    }
}

fn workdir_status(s: Status) -> Option<FileStatus> {
    if s.contains(Status::WT_NEW) {
        Some(FileStatus::Untracked)
    } else if s.contains(Status::WT_RENAMED) {
        Some(FileStatus::Renamed)
    } else if s.contains(Status::WT_DELETED) {
        Some(FileStatus::Deleted)
    } else if s.contains(Status::WT_TYPECHANGE) {
        Some(FileStatus::Typechange)
    } else if s.contains(Status::WT_MODIFIED) || s.contains(Status::WT_UNREADABLE) {
        Some(FileStatus::Modified)
    } else {
        None
    }
}

fn file_path(f: &git2::DiffFile<'_>) -> Option<String> {
    f.path_bytes()
        .map(|b| String::from_utf8_lossy(b).into_owned())
}

/// Working-tree status. `update_index` writes the refreshed stat cache back
/// like `git status` does: a tracked file whose mtime changed but not its
/// content is rehashed once, not on every scan (a formatter or branch switch
/// touching every file otherwise costs seconds per scan until someone runs
/// `git status` in a terminal).
pub fn status(repo: &Repository) -> Result<WorkdirStatus, GitError> {
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .include_ignored(false)
        .exclude_submodules(true)
        .update_index(true);
    let statuses = repo.statuses(Some(&mut opts)).map_err(map_git2)?;

    let mut entries = Vec::with_capacity(statuses.len());
    let mut out = WorkdirStatus {
        entries: Vec::new(),
        staged: 0,
        unstaged: 0,
        untracked: 0,
        conflicted: 0,
    };
    for e in statuses.iter() {
        let s = e.status();
        let index = index_status(s);
        let workdir = workdir_status(s);
        let conflicted = s.contains(Status::CONFLICTED);
        if index.is_none() && workdir.is_none() && !conflicted {
            continue;
        }
        // Prefer the workdir delta for the current path (a file renamed in the
        // index and again in the workdir reports its final name).
        let wt = e.index_to_workdir();
        let hi = e.head_to_index();
        let path = wt
            .as_ref()
            .and_then(|d| file_path(&d.new_file()))
            .or_else(|| hi.as_ref().and_then(|d| file_path(&d.new_file())))
            .unwrap_or_else(|| String::from_utf8_lossy(e.path_bytes()).into_owned());
        let old_path = if s.contains(Status::WT_RENAMED) {
            wt.as_ref().and_then(|d| file_path(&d.old_file()))
        } else if s.contains(Status::INDEX_RENAMED) {
            hi.as_ref().and_then(|d| file_path(&d.old_file()))
        } else {
            None
        }
        .filter(|old| *old != path);

        if index.is_some() {
            out.staged += 1;
        }
        match workdir {
            Some(FileStatus::Untracked) => out.untracked += 1,
            Some(_) => out.unstaged += 1,
            None => {}
        }
        if conflicted {
            out.conflicted += 1;
        }
        let workdir_stamp = if workdir.is_some() || conflicted {
            workdir_stamp(repo, &path)
        } else {
            None
        };
        entries.push(StatusEntry {
            path,
            old_path,
            index,
            workdir,
            conflicted,
            workdir_stamp,
        });
    }
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    out.entries = entries;
    Ok(out)
}
