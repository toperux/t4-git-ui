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
            .ok_or_else(|| AppError::Internal(format!("repo not open: {id}")))
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
