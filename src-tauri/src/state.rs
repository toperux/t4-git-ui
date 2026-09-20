use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, RwLock};

use git_core::cli::GitCli;
use git_core::watch::Watcher;
use git_core::{RepoHandle, RepoId};
use tokio_util::sync::CancellationToken;

use crate::commands::window::{Layout, Layouts};
use crate::AppError;

pub struct AppState {
    /// Path or name of the git executable (default: `git` from PATH).
    pub git_path: RwLock<String>,
    /// Open repositories keyed by canonical workdir.
    pub repos: RwLock<HashMap<RepoId, Arc<RepoHandle>>>,
    /// Running CLI operations by op id (see `cancel_op`).
    pub ops: Mutex<HashMap<String, CancellationToken>>,
    /// One filesystem watcher per open repo (emits `repo://changed`).
    pub watchers: Mutex<HashMap<RepoId, Watcher>>,
    /// Which window has which repository open. A handle (and its watcher) lives
    /// as long as any window holds its id — see [`AppState::unhold`].
    holders: Mutex<HashMap<String, HashSet<RepoId>>>,
    /// What a window being created should open, until its webview asks.
    pending: Mutex<HashMap<String, Layout>>,
    /// What each window last reported having open, plus the ones closed a
    /// moment ago (window.rs `restorable`).
    layouts: Mutex<Layouts>,
    /// The window a detached tab drag is over, so it can be told when the drag
    /// leaves it again (`tab-drag-out`).
    drag_target: Mutex<Option<String>>,
    /// The app is quitting, so a window going away is not the user closing it:
    /// its layout entry stays, to be restored next launch.
    pub exiting: AtomicBool,
    next_op: AtomicU64,
    next_window: AtomicU64,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            git_path: RwLock::new("git".to_string()),
            repos: RwLock::new(HashMap::new()),
            ops: Mutex::new(HashMap::new()),
            watchers: Mutex::new(HashMap::new()),
            holders: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
            layouts: Mutex::new(Layouts::default()),
            drag_target: Mutex::new(None),
            exiting: AtomicBool::new(false),
            next_op: AtomicU64::new(1),
            next_window: AtomicU64::new(0),
        }
    }
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl AppState {
    pub fn repo(&self, id: &RepoId) -> Result<Arc<RepoHandle>, AppError> {
        self.repos
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(id)
            .cloned()
            .ok_or_else(|| AppError::NotOpen(format!("repo not open: {id}")))
    }

    /// Records that `label` has `id` open.
    pub fn hold(&self, label: &str, id: &RepoId) {
        lock(&self.holders)
            .entry(label.to_string())
            .or_default()
            .insert(id.clone());
    }

    /// The window other than `except` that has `id` open, if any.
    pub fn holder_of(&self, id: &RepoId, except: &str) -> Option<String> {
        lock(&self.holders)
            .iter()
            .find(|(label, ids)| label.as_str() != except && ids.contains(id))
            .map(|(label, _)| label.clone())
    }

    /// Drops `label`'s claim on `id`; true when no window holds it any more, so
    /// the handle and its watcher can go.
    pub fn unhold(&self, label: &str, id: &RepoId) -> bool {
        let mut holders = lock(&self.holders);
        if let Some(ids) = holders.get_mut(label) {
            ids.remove(id);
        }
        !holders.values().any(|ids| ids.contains(id))
    }

    /// Drops every claim `label` had (its window is gone); the ids no window
    /// holds any more.
    pub fn release_all(&self, label: &str) -> Vec<RepoId> {
        let mut holders = lock(&self.holders);
        let held = holders.remove(label).unwrap_or_default();
        held.into_iter()
            .filter(|id| !holders.values().any(|ids| ids.contains(id)))
            .collect()
    }

    pub fn pending(&self) -> MutexGuard<'_, HashMap<String, Layout>> {
        lock(&self.pending)
    }

    pub fn layouts(&self) -> MutexGuard<'_, Layouts> {
        lock(&self.layouts)
    }

    pub fn drag_target(&self) -> MutexGuard<'_, Option<String>> {
        lock(&self.drag_target)
    }

    /// Label for the next window: `w1`, `w2`, … (`main` is Tauri's own).
    pub fn next_window_label(&self) -> String {
        format!("w{}", self.next_window.fetch_add(1, Ordering::Relaxed) + 1)
    }

    pub fn git_cli(&self) -> GitCli {
        GitCli::new(
            self.git_path
                .read()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .clone(),
        )
    }

    /// Registers a new cancellable operation; pair with [`AppState::end_op`].
    pub fn begin_op(&self) -> (String, CancellationToken) {
        let id = format!("op-{}", self.next_op.fetch_add(1, Ordering::Relaxed));
        let token = CancellationToken::new();
        self.ops
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(id.clone(), token.clone());
        (id, token)
    }

    pub fn end_op(&self, id: &str) {
        self.ops
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(id);
    }

    /// Whether any CLI operation is registered, in any window. Reads (blame,
    /// `ls-remote`) count too: an update's install ends them all alike.
    pub fn op_running(&self) -> bool {
        !lock(&self.ops).is_empty()
    }

    /// Cancels a running operation; `false` when no such op is running.
    pub fn cancel_op(&self, id: &str) -> bool {
        match self
            .ops
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(id)
        {
            Some(token) => {
                token.cancel();
                true
            }
            None => false,
        }
    }

    pub fn set_watcher_suppressed(&self, id: &RepoId, on: bool) {
        if let Some(w) = self
            .watchers
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(id)
        {
            w.set_suppressed(on);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ops_are_registered_cancelled_and_removed() {
        let state = AppState::default();
        let (id, token) = state.begin_op();
        let (id2, _) = state.begin_op();
        assert_ne!(id, id2);
        assert!(!token.is_cancelled());
        assert!(state.cancel_op(&id));
        assert!(token.is_cancelled());
        state.end_op(&id);
        assert!(
            !state.cancel_op(&id),
            "a finished op is no longer cancellable"
        );
        assert!(!state.cancel_op("op-nope"));
    }

    #[test]
    fn an_op_counts_as_running_until_it_ends() {
        let state = AppState::default();
        assert!(!state.op_running());
        let (id, _token) = state.begin_op();
        assert!(state.op_running());
        state.end_op(&id);
        assert!(!state.op_running());
    }

    #[test]
    fn unknown_repo_is_a_not_open_error() {
        let state = AppState::default();
        let id: RepoId = serde_json::from_str("\"c:/nope\"").expect("repo id");
        let err = state.repo(&id).err().expect("a closed repo has no handle");
        // Its own kind, not `internal`: the frontend stays quiet about a repo that was closed and
        // still reports the failures that are bugs.
        let v = serde_json::to_value(&err).expect("serializes");
        assert_eq!(v["kind"], "notOpen");
        assert!(
            v["message"]
                .as_str()
                .unwrap_or_default()
                .contains("not open"),
            "{v}"
        );
        // Suppressing a watcher that does not exist is a no-op, not a panic.
        state.set_watcher_suppressed(&id, true);
    }

    /// The refcount the tabs rely on: a repository open in two windows survives
    /// one of them closing it, and goes when the last holder lets go — whether
    /// that is a `close_repo` or the whole window being destroyed.
    #[test]
    fn a_repo_is_held_until_every_window_lets_go() {
        let state = AppState::default();
        let a: RepoId = serde_json::from_str("\"c:/a\"").expect("repo id");
        let b: RepoId = serde_json::from_str("\"c:/b\"").expect("repo id");
        state.hold("main", &a);
        state.hold("w1", &a);
        state.hold("w1", &b);

        // The same window opening it twice is one claim.
        state.hold("main", &a);
        assert_eq!(state.holder_of(&a, "main").as_deref(), Some("w1"));
        assert_eq!(state.holder_of(&b, "w1"), None, "only w1 has it");

        assert!(!state.unhold("main", &a), "w1 still has it open");
        assert!(state.unhold("w1", &a), "the last holder closed it");
        // Closing an id this window never held takes it from nobody else.
        assert!(!state.unhold("main", &b), "w1 still has b open");

        assert_eq!(state.release_all("w1"), vec![b], "a destroyed window's ids");
        assert!(state.release_all("w1").is_empty());
    }

    #[test]
    fn window_labels_count_up_from_one() {
        let state = AppState::default();
        assert_eq!(state.next_window_label(), "w1");
        assert_eq!(state.next_window_label(), "w2");
    }

    #[test]
    fn git_path_defaults_to_path_lookup() {
        let state = AppState::default();
        assert_eq!(state.git_cli().git_path(), "git");
        *state.git_path.write().unwrap() = "C:/tools/git.exe".into();
        assert_eq!(state.git_cli().git_path(), "C:/tools/git.exe");
    }
}
