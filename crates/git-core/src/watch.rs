//! Filesystem watcher: debounced (250 ms) change notifications for the
//! working directory and the parts of `.git` that affect status / refs.
//!
//! Events are classified into [`ChangeKind`]s. `.git/objects`, `*.lock`
//! files under `.git` and paths ignored by the repo (checked with
//! `is_path_ignored` at debounce time, so `node_modules`/`target` churn never
//! triggers a refresh) are dropped. Watch-thread errors / overflow set
//! `rescan`.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use git2::Repository;
use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::{Deserialize, Serialize};

use crate::repo::normalize_workdir_string;
use crate::{GitError, RepoHandle};

pub const DEBOUNCE: Duration = Duration::from_millis(250);

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
    debouncer: Option<Debouncer<RecommendedWatcher, RecommendedCache>>,
    suppressed: Arc<AtomicBool>,
}

fn normalized(path: &Path) -> PathBuf {
    let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    PathBuf::from(normalize_workdir_string(
        canonical.to_string_lossy().into_owned(),
    ))
}

fn classify(path: &Path, workdir: &Path, git_dir: &Path, repo: &Repository) -> Option<ChangeKind> {
    if let Ok(rel) = path.strip_prefix(git_dir) {
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
    /// Starts watching `handle`'s working directory (and its git dir when that
    /// lives elsewhere, e.g. a linked worktree). `on_change` runs on the
    /// debouncer thread.
    pub fn start(
        handle: &RepoHandle,
        on_change: impl Fn(RepoChange) + Send + 'static,
    ) -> Result<Watcher, GitError> {
        let repo = handle.open_private()?;
        let workdir = normalized(&handle.path);
        let git_dir = normalized(&handle.git_dir);
        let suppressed = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&suppressed);
        let (wd, gd) = (workdir.clone(), git_dir.clone());

        let handler = move |result: DebounceEventResult| {
            if flag.load(Ordering::Relaxed) {
                return;
            }
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

        let mut debouncer = new_debouncer(DEBOUNCE, None, handler).map_err(notify_err)?;
        debouncer
            .watch(&workdir, RecursiveMode::Recursive)
            .map_err(notify_err)?;
        if git_dir.strip_prefix(&workdir).is_err() {
            debouncer
                .watch(&git_dir, RecursiveMode::Recursive)
                .map_err(notify_err)?;
        }
        tracing::debug!(workdir = %workdir.display(), "watcher started");
        Ok(Watcher {
            debouncer: Some(debouncer),
            suppressed,
        })
    }

    /// While suppressed, events are dropped (used during our own mutations;
    /// the caller emits one synthetic change afterwards).
    pub fn set_suppressed(&self, on: bool) {
        self.suppressed.store(on, Ordering::Relaxed);
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
        t.write("a.txt", "c");
        assert!(rx.recv_timeout(Duration::from_secs(1)).is_ok());
        w.stop();
    }
}
