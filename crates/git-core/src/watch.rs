//! Filesystem watcher: debounced (250 ms) change notifications for the
//! working directory and the parts of `.git` that affect status / refs.
//!
//! Events are classified into [`ChangeKind`]s. `.git/objects`, `*.lock`
//! files under `.git` and paths ignored by the repo (checked with
//! `is_path_ignored` at debounce time, so `node_modules`/`target` churn never
//! triggers a refresh) are dropped. Watch-thread errors / overflow set
//! `rescan`.
//!
//! No file-id cache ([`NoCache`], roadmap §A P4): seeding the recommended one
//! stats every file under the workdir on `watch()` — ignored directories
//! included — which is seconds on a large tree and held up the open path. Its
//! only job is pairing a rename into one event; without it a rename arrives as
//! remove + create, which classify to the same kinds.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use git2::Repository;
use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer_opt, DebounceEventResult, Debouncer, NoCache};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::repo::normalize_workdir_string;
use crate::{GitError, RepoHandle};

pub const DEBOUNCE: Duration = Duration::from_millis(250);

/// How long after an operation ends its own writes keep being dropped. The
/// event is stamped when the watch thread sees it, which can be a moment after
/// the write that produced it — and after a fast op has already returned.
const SUPPRESS_GRACE: Duration = Duration::from_millis(50);

/// Watcher suppression state.
#[derive(Debug, Clone, Copy)]
enum Suppress {
    /// One of our own operations is running: drop everything.
    Running,
    /// Drop events last seen before this instant — they are the writes that
    /// operation made, flushed by the debouncer after it returned.
    Until(Instant),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ChangeKind {
    Workdir,
    Index,
    Refs,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoChange {
    /// Distinct kinds, in first-seen order.
    pub kinds: Vec<ChangeKind>,
    /// The watcher lost events (overflow / error); refresh everything.
    pub rescan: bool,
}

/// Stops watching when dropped.
pub struct Watcher {
    debouncer: Option<Debouncer<RecommendedWatcher, NoCache>>,
    suppress: Arc<Mutex<Suppress>>,
}

fn normalized(path: &Path) -> PathBuf {
    let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    PathBuf::from(normalize_workdir_string(
        canonical.to_string_lossy().into_owned(),
    ))
}

fn classify(
    path: &Path,
    workdir: &Path,
    git_dirs: &[PathBuf],
    repo: &Repository,
) -> Option<ChangeKind> {
    if let Some(rel) = git_dirs.iter().find_map(|d| path.strip_prefix(d).ok()) {
        if rel.extension().is_some_and(|e| e == "lock") {
            return None;
        }
        let first = rel.components().next()?.as_os_str().to_string_lossy();
        return match &*first {
            "objects" => None,
            "index" => Some(ChangeKind::Index),
            _ => Some(ChangeKind::Refs),
        };
    }
    if let Ok(rel) = path.strip_prefix(workdir) {
        if !rel.as_os_str().is_empty() && repo.is_path_ignored(rel).unwrap_or(false) {
            return None;
        }
    }
    Some(ChangeKind::Workdir)
}

impl Watcher {
    /// Starts watching `handle`'s working directory, plus its git dir and
    /// common dir when those live elsewhere: a linked worktree keeps `HEAD`
    /// and `index` under `.git/worktrees/<name>` but shares `refs/`,
    /// `packed-refs` and `objects/` with the main repository. `on_change`
    /// runs on the debouncer thread.
    pub fn start(
        handle: &RepoHandle,
        on_change: impl Fn(RepoChange) + Send + 'static,
    ) -> Result<Watcher, GitError> {
        let repo = handle.open_private()?;
        let workdir = normalized(&handle.path);
        let mut git_dirs = vec![normalized(&handle.git_dir)];
        let common = normalized(repo.commondir());
        if !git_dirs.contains(&common) {
            git_dirs.push(common);
        }
        let suppress = Arc::new(Mutex::new(Suppress::Until(Instant::now())));
        let flag = Arc::clone(&suppress);
        let (wd, gd) = (workdir.clone(), git_dirs.clone());

        let handler = move |result: DebounceEventResult| {
            let cutoff = match *flag.lock() {
                Suppress::Running => return,
                Suppress::Until(t) => t,
            };
            let mut change = RepoChange {
                kinds: Vec::new(),
                rescan: false,
            };
            match result {
                Ok(events) => {
                    for ev in &events {
                        // inotify reports opens and reads too; nothing changed. Left in,
                        // `is_path_ignored` reading `.gitignore` right here would report
                        // `.gitignore` as edited on the next round — and so would every
                        // file an editor opens.
                        if ev.kind.is_access() {
                            continue;
                        }
                        // `time` is when the merged event was last seen: a path
                        // written during the op and again after it survives.
                        if ev.time < cutoff {
                            continue;
                        }
                        if ev.need_rescan() {
                            change.rescan = true;
                        }
                        for p in &ev.paths {
                            if let Some(kind) = classify(p, &wd, &gd, &repo) {
                                if !change.kinds.contains(&kind) {
                                    change.kinds.push(kind);
                                }
                            }
                        }
                    }
                }
                Err(errors) => {
                    for e in &errors {
                        tracing::warn!(error = %e, "watch error");
                    }
                    change.rescan = true;
                }
            }
            if change.rescan || !change.kinds.is_empty() {
                on_change(change);
            }
        };

        let mut debouncer = new_debouncer_opt::<_, RecommendedWatcher, NoCache>(
            DEBOUNCE,
            None,
            handler,
            NoCache::new(),
            notify::Config::default(),
        )
        .map_err(notify_err)?;
        debouncer
            .watch(&workdir, RecursiveMode::Recursive)
            .map_err(notify_err)?;
        for dir in &git_dirs {
            if dir.strip_prefix(&workdir).is_err() {
                debouncer
                    .watch(dir, RecursiveMode::Recursive)
                    .map_err(notify_err)?;
            }
        }
        tracing::debug!(workdir = %workdir.display(), "watcher started");
        Ok(Watcher {
            debouncer: Some(debouncer),
            suppress,
        })
    }

    /// While suppressed, events are dropped (used during our own mutations;
    /// the caller emits one synthetic change afterwards). Un-suppressing keeps
    /// dropping the events the operation itself produced: the debouncer only
    /// flushes them [`DEBOUNCE`] after the last write, long after a short op
    /// has returned.
    pub fn set_suppressed(&self, on: bool) {
        *self.suppress.lock() = if on {
            Suppress::Running
        } else {
            Suppress::Until(Instant::now() + SUPPRESS_GRACE)
        };
    }

    pub fn stop(mut self) {
        if let Some(d) = self.debouncer.take() {
            d.stop_nonblocking();
        }
    }
}

impl Drop for Watcher {
    fn drop(&mut self) {
        if let Some(d) = self.debouncer.take() {
            d.stop_nonblocking();
        }
    }
}

fn notify_err(e: notify::Error) -> GitError {
    match e.kind {
        notify::ErrorKind::Io(io) => GitError::Io(io),
        other => GitError::Io(std::io::Error::other(format!("{other:?}"))),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc;
    use std::time::Instant;

    use super::*;
    use crate::test_util::TempRepo;

    fn start(t: &TempRepo) -> (Watcher, mpsc::Receiver<RepoChange>) {
        let handle = RepoHandle::open(t.path()).expect("open");
        let (tx, rx) = mpsc::channel();
        let w = Watcher::start(&handle, move |c| {
            let _ = tx.send(c);
        })
        .expect("watcher");
        // Let the OS watch settle (Windows reports late directory-mtime
        // events for the setup commit) before producing events.
        while rx.recv_timeout(Duration::from_millis(500)).is_ok() {}
        (w, rx)
    }

    /// All kinds received within `window`.
    fn kinds_within(rx: &mpsc::Receiver<RepoChange>, window: Duration) -> Vec<ChangeKind> {
        let deadline = Instant::now() + window;
        let mut kinds = Vec::new();
        while let Some(left) = deadline.checked_duration_since(Instant::now()) {
            match rx.recv_timeout(left) {
                Ok(c) => {
                    for k in c.kinds {
                        if !kinds.contains(&k) {
                            kinds.push(k);
                        }
                    }
                }
                Err(_) => break,
            }
        }
        kinds
    }

    #[test]
    fn workdir_edit_is_reported() {
        let t = TempRepo::new();
        t.commit(&[("a.txt", "a")], "init");
        let (_w, rx) = start(&t);
        t.write("a.txt", "b");
        let c = rx
            .recv_timeout(Duration::from_secs(1))
            .expect("change within 1s");
        assert_eq!(c.kinds, vec![ChangeKind::Workdir]);
        assert!(!c.rescan);
    }

    #[test]
    fn rename_is_reported() {
        let t = TempRepo::new();
        t.commit(&[("a.txt", "a")], "init");
        let (_w, rx) = start(&t);
        // Without a file-id cache the rename arrives as remove + create; both
        // sides are workdir paths, so the refresh is the same one.
        std::fs::rename(t.path().join("a.txt"), t.path().join("b.txt")).unwrap();
        let kinds = kinds_within(&rx, Duration::from_millis(1200));
        assert_eq!(kinds, vec![ChangeKind::Workdir]);
    }

    #[test]
    fn commit_reports_refs_and_index() {
        let t = TempRepo::new();
        t.commit(&[("a.txt", "a")], "init");
        let (_w, rx) = start(&t);
        t.commit(&[("a.txt", "b")], "second");
        let kinds = kinds_within(&rx, Duration::from_millis(1200));
        assert!(kinds.contains(&ChangeKind::Refs), "{kinds:?}");
        assert!(kinds.contains(&ChangeKind::Index), "{kinds:?}");
    }

    #[test]
    fn ignored_dir_and_lock_files_are_silent() {
        let t = TempRepo::new();
        t.commit(&[(".gitignore", "ignored/\n")], "init");
        let (_w, rx) = start(&t);
        t.write("ignored/x.txt", "x");
        t.write("ignored/deep/y.txt", "y");
        std::fs::write(t.repo.path().join("index.lock"), b"").unwrap();
        std::fs::write(t.repo.path().join("objects/zz"), b"").unwrap();
        assert!(
            rx.recv_timeout(Duration::from_millis(600)).is_err(),
            "unexpected change"
        );
    }

    #[test]
    fn suppressed_drops_events_and_stop_is_clean() {
        let t = TempRepo::new();
        t.commit(&[("a.txt", "a")], "init");
        let (w, rx) = start(&t);
        w.set_suppressed(true);
        t.write("a.txt", "b");
        assert!(rx.recv_timeout(Duration::from_millis(600)).is_err());
        w.set_suppressed(false);
        std::thread::sleep(SUPPRESS_GRACE);
        t.write("a.txt", "c");
        assert!(rx.recv_timeout(Duration::from_secs(1)).is_ok());
        w.stop();
    }

    #[test]
    fn a_write_made_during_the_op_stays_dropped_after_unsuppressing() {
        let t = TempRepo::new();
        t.commit(&[("a.txt", "a")], "init");
        let (w, rx) = start(&t);
        w.set_suppressed(true);
        t.write("a.txt", "b");
        // The op returns at once; the debouncer only flushes it ~250 ms later.
        w.set_suppressed(false);
        assert!(
            rx.recv_timeout(Duration::from_secs(1)).is_err(),
            "our own write must not come back as a change"
        );
    }

    #[test]
    fn an_external_write_after_the_op_is_reported() {
        let t = TempRepo::new();
        t.commit(&[("a.txt", "a")], "init");
        let (w, rx) = start(&t);
        w.set_suppressed(true);
        w.set_suppressed(false);
        std::thread::sleep(Duration::from_millis(200));
        t.write("a.txt", "b");
        assert!(rx.recv_timeout(Duration::from_secs(1)).is_ok());
    }
}
