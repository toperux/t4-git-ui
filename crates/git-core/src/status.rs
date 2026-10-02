//! Working-directory status via libgit2 `git_status_list`.
//!
//! The plan's `git status --porcelain=v2 -z` fallback for very large trees is
//! not implemented yet; add it behind a flag if libgit2 proves too slow.

use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

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
    /// Old path of a staged rename (the index side; a working-tree rename
    /// is listed as a deletion plus an untracked file).
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
    /// The paths that weren't UTF-8: the lossy `path` an entry carries → the
    /// bytes it was read from, so a path list built from the entries can name
    /// the file (see [`path_bytes`]). Backend only.
    #[serde(skip)]
    pub raw_paths: HashMap<String, Vec<u8>>,
}

/// `paths` as the bytes to diff by: each one `status` read from a non-UTF-8
/// path is swapped back for its raw bytes, the rest stay as they are (a path
/// no scan listed keeps its lossy bytes and matches no file).
pub fn path_bytes<'a>(paths: &'a [String], status: Option<&'a WorkdirStatus>) -> Vec<&'a [u8]> {
    paths
        .iter()
        .map(|p| {
            status
                .and_then(|s| s.raw_paths.get(p))
                .map_or(p.as_bytes(), Vec::as_slice)
        })
        .collect()
}

/// One status scan at a time per repository, at most one queued behind it.
///
/// Every request takes a number, then waits for the gate (fair: first come,
/// first served). If the last finished scan started after the request was
/// numbered, its result answers it; otherwise the request runs a scan, which
/// answers every request numbered before it started. So no caller gets a
/// status older than its request, and a burst of watcher batches costs two
/// scans, not one each. Errors are not shared: the next waiter scans again.
#[derive(Default)]
pub struct ScanGate {
    requests: AtomicU64,
    /// The start number and result of the last finished scan.
    last: tokio::sync::Mutex<Option<(u64, Arc<WorkdirStatus>)>>,
    /// The last result, readable without waiting out a running scan.
    latest: parking_lot::Mutex<Option<Arc<WorkdirStatus>>>,
}

impl ScanGate {
    /// The status as of now: `scan` runs only when no scan that started after
    /// this call has finished.
    pub async fn run<F, Fut, E>(&self, scan: F) -> Result<Arc<WorkdirStatus>, E>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<WorkdirStatus, E>>,
    {
        let n = self.requests.fetch_add(1, Ordering::SeqCst) + 1;
        let mut last = self.last.lock().await;
        if let Some((started, status)) = last.as_ref() {
            if *started >= n {
                return Ok(Arc::clone(status));
            }
        }
        let started = self.requests.load(Ordering::SeqCst);
        let status = Arc::new(scan().await?);
        *last = Some((started, Arc::clone(&status)));
        *self.latest.lock() = Some(Arc::clone(&status));
        Ok(status)
    }

    /// The last finished scan's result, `None` before the first.
    pub fn latest(&self) -> Option<Arc<WorkdirStatus>> {
        self.latest.lock().clone()
    }
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
        // As `git status` shows it: a file renamed on disk is a deletion plus
        // an untracked file (and the untracked files are not read for it).
        .renames_index_to_workdir(false)
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
        raw_paths: HashMap::new(),
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
        let raw = wt
            .as_ref()
            .and_then(|d| d.new_file().path_bytes())
            .or_else(|| hi.as_ref().and_then(|d| d.new_file().path_bytes()))
            .unwrap_or_else(|| e.path_bytes());
        let path = String::from_utf8_lossy(raw).into_owned();
        if std::str::from_utf8(raw).is_err() {
            out.raw_paths.insert(path.clone(), raw.to_vec());
        }
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

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering::SeqCst};
    use std::sync::Arc;
    use std::time::Duration;

    use super::*;

    /// A status that says which scan made it.
    fn scan_no(n: u64) -> WorkdirStatus {
        WorkdirStatus {
            entries: Vec::new(),
            staged: n as u32,
            unstaged: 0,
            untracked: 0,
            conflicted: 0,
            state: RepoState::Clean,
            raw_paths: HashMap::new(),
        }
    }

    #[tokio::test]
    async fn eight_requests_at_once_run_at_most_two_scans() {
        let gate = Arc::new(ScanGate::default());
        let scans = Arc::new(AtomicU64::new(0));
        let mut set = tokio::task::JoinSet::new();
        for _ in 0..8 {
            let (gate, scans) = (Arc::clone(&gate), Arc::clone(&scans));
            set.spawn(async move {
                gate.run(|| async {
                    let n = scans.fetch_add(1, SeqCst) + 1;
                    tokio::time::sleep(Duration::from_millis(50)).await;
                    Ok::<_, GitError>(scan_no(n))
                })
                .await
                .expect("scan")
                .staged
            });
        }
        let mut got = Vec::new();
        while let Some(r) = set.join_next().await {
            got.push(r.expect("task"));
        }
        assert_eq!(got.len(), 8);
        assert!(scans.load(SeqCst) <= 2, "{} scans", scans.load(SeqCst));
        assert_eq!(gate.latest().map(|s| s.staged), got.iter().max().copied());
    }

    #[tokio::test]
    async fn a_request_made_during_a_scan_gets_a_later_one() {
        let gate = ScanGate::default();
        let scans = AtomicU64::new(0);
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = tokio::sync::oneshot::channel::<()>();
        let first = gate.run(|| async {
            let n = scans.fetch_add(1, SeqCst) + 1;
            started_tx.send(()).expect("started");
            release_rx.await.expect("release");
            Ok::<_, GitError>(scan_no(n))
        });
        let second = async {
            started_rx.await.expect("first scan running");
            let req =
                gate.run(|| async { Ok::<_, GitError>(scan_no(scans.fetch_add(1, SeqCst) + 1)) });
            // `run` numbers the request on its first poll; the first scan ends after that.
            let (r, ()) = tokio::join!(req, async { release_tx.send(()).expect("release") });
            r
        };
        let (first, second) = tokio::join!(first, second);
        assert_eq!(first.expect("first").staged, 1);
        assert_eq!(
            second.expect("second").staged,
            2,
            "not the scan that was running"
        );
    }

    #[test]
    fn path_bytes_swaps_a_lossy_path_for_its_raw_bytes() {
        let mut st = scan_no(1);
        st.raw_paths
            .insert("caf\u{FFFD}.txt".into(), b"caf\xe9.txt".to_vec());
        let paths = vec!["a.txt".to_string(), "caf\u{FFFD}.txt".to_string()];
        assert_eq!(
            path_bytes(&paths, Some(&st)),
            vec![&b"a.txt"[..], &b"caf\xe9.txt"[..]]
        );
        // No scan yet: the lossy bytes go in as they are.
        assert_eq!(path_bytes(&paths, None)[1], "caf\u{FFFD}.txt".as_bytes());
    }
}
