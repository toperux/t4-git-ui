//! Working-directory status via libgit2 `git_status_list`.
//!
//! The plan's `git status --porcelain=v2 -z` fallback for very large trees is
//! not implemented yet; add it behind a flag if libgit2 proves too slow.

use git2::{FileMode, Repository, Status, StatusOptions};
use serde::{Deserialize, Serialize};

use crate::diff::FileStatus;
use crate::refs::RepoState;
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
    /// A gitlink rather than a file — a submodule pointer, or an untracked
    /// nested repository. There is no discard for one (`submodule update` is
    /// the reset), so the frontend hides that action.
    pub submodule: bool,
    /// The gitlink's pointer is where the superproject wants it and only the
    /// checkout's own contents changed — nothing `git add` on the superproject
    /// can stage. `false` for everything else.
    pub submodule_dirty_only: bool,
    /// `<mtime ms>:<size>` of the file on disk, `None` when it isn't there (or has
    /// no working-tree side). The status letters say nothing about *content*: a
    /// file edited in an editor stays `modified`, and a conflict stays `conflicted`
    /// until it is staged, so this is what tells the UI its diff went stale.
    ///
    /// A gitlink is a directory, whose mtime and length say nothing about either
    /// side of it, so it carries the checkout's own HEAD oid instead — it moves
    /// with the pointer. A conflicted one has no such id and falls back to the
    /// directory stamp.
    pub workdir_stamp: Option<String>,
    /// The staged blob's oid, cut to 16 hex digits, `None` when nothing is
    /// staged or the index side has no blob (a staged deletion). The letters
    /// stay `modified` when a file is re-staged with new content, and a file
    /// staged whole has no workdir stamp, so this is what tells the UI its
    /// staged diff went stale.
    pub index_stamp: Option<String>,
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
    /// The repository state this scan ran in (a `.git` read, not part of the scan).
    /// A status whose `state` disagrees with the current refs predates the change
    /// and says nothing about the new one — the UI has to wait for the next scan.
    pub state: RepoState,
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
    status_with(repo, true)
}

/// [`status`] with the write-back made optional: `refresh = false` scans without
/// touching the index, for a scan that may overlap a mutation whose index it
/// must not write over (see [`crate::RepoHandle::scan_lock`]).
pub fn status_with(repo: &Repository, refresh: bool) -> Result<WorkdirStatus, GitError> {
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .include_ignored(false)
        // Included, so a moved submodule pointer shows up as a change at all.
        // The cost is a status scan inside each initialized submodule per scan;
        // `submodule.<name>.ignore` is the escape hatch for a vendored tree.
        .exclude_submodules(false)
        .update_index(refresh);
    // Read before the scan, not after it: the stamp has to describe the tree this scan saw, so a
    // state change while it runs (up to 1.5 s) reads as a mismatch rather than as a match.
    let state: RepoState = repo.state().into();
    let statuses = match repo.statuses(Some(&mut opts)).map_err(map_git2) {
        Ok(s) => s,
        // Something else holds `index.lock` (a `git` in a terminal, mid-commit):
        // the write-back is what needs the lock, not the scan. Scan again without
        // it, rather than report a status that could not be read.
        Err(GitError::IndexLocked) if refresh => {
            opts.update_index(false);
            repo.statuses(Some(&mut opts)).map_err(map_git2)?
        }
        Err(e) => return Err(e),
    };

    let mut entries = Vec::with_capacity(statuses.len());
    let mut out = WorkdirStatus {
        entries: Vec::new(),
        staged: 0,
        unstaged: 0,
        untracked: 0,
        conflicted: 0,
        state,
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
        // `160000` on whichever side of the delta exists — the old one when the
        // pointer was deleted.
        let gitlink = |d: Option<&git2::DiffDelta<'_>>| {
            d.is_some_and(|d| {
                d.new_file().mode() == FileMode::Commit || d.old_file().mode() == FileMode::Commit
            })
        };
        let submodule = gitlink(wt.as_ref()) || gitlink(hi.as_ref());
        // Both sides of the workdir delta name the same commit: the pointer is
        // where it belongs and libgit2 flagged the entry for what is *inside*
        // the checkout (edited, untracked), which the superproject cannot stage.
        // A conflicted one is excluded: both sides of its delta carry the zero oid,
        // which would read as "the pointer never moved".
        let dirty_only = submodule
            && !conflicted
            && wt
                .as_ref()
                .is_some_and(|d| d.old_file().id() == d.new_file().id());

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
        let workdir_stamp = if submodule {
            // The commit the pointer is at, from whichever delta carries it. A
            // conflicted gitlink has the zero oid on both sides: stamping every one
            // of them `0000…` would make them all look unchanged, so those — and only
            // those — fall back to the directory's own stamp. With the move staged and
            // the checkout back in step there is no workdir delta at all, and the
            // head→index side is what moves when the pointer is re-staged behind us —
            // without it a re-stage inside one debounce window would be invisible.
            let pointer = |d: Option<&git2::DiffDelta<'_>>| {
                d.map(|d| d.new_file().id())
                    .filter(|id| !id.is_zero())
                    .map(|id| id.to_string())
            };
            pointer(wt.as_ref())
                .or_else(|| conflicted.then(|| workdir_stamp(repo, &path)).flatten())
                .or_else(|| pointer(hi.as_ref()))
        } else if workdir.is_some() || conflicted {
            workdir_stamp(repo, &path)
        } else {
            None
        };
        // 16 hex digits, not 40: the stamp only has to change when the blob does, and it rides on
        // every status read — tens of thousands of entries when a whole tree is staged.
        let index_stamp = index
            .and(hi.as_ref())
            .map(|d| d.new_file().id())
            .filter(|id| !id.is_zero())
            .map(|id| {
                let mut s = id.to_string();
                s.truncate(16);
                s
            });
        entries.push(StatusEntry {
            path,
            old_path,
            index,
            workdir,
            conflicted,
            submodule,
            submodule_dirty_only: dirty_only,
            workdir_stamp,
            index_stamp,
        });
    }
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    out.entries = entries;
    Ok(out)
}
