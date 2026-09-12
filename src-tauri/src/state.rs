use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use git_core::cli::GitCli;
use git_core::watch::Watcher;
use git_core::{RepoHandle, RepoId};
use tokio_util::sync::CancellationToken;

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
    next_op: AtomicU64,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            git_path: RwLock::new("git".to_string()),
            repos: RwLock::new(HashMap::new()),
            ops: Mutex::new(HashMap::new()),
            watchers: Mutex::new(HashMap::new()),
            next_op: AtomicU64::new(1),
        }
    }
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

    #[test]
    fn git_path_defaults_to_path_lookup() {
        let state = AppState::default();
        assert_eq!(state.git_cli().git_path(), "git");
        *state.git_path.write().unwrap() = "C:/tools/git.exe".into();
        assert_eq!(state.git_cli().git_path(), "C:/tools/git.exe");
    }
}
