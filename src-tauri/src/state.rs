use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use git_core::{RepoHandle, RepoId};

use crate::AppError;

pub struct AppState {
    /// Path or name of the git executable (default: `git` from PATH).
    pub git_path: RwLock<String>,
    /// Open repositories keyed by canonical workdir.
    pub repos: RwLock<HashMap<RepoId, Arc<RepoHandle>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            git_path: RwLock::new("git".to_string()),
            repos: RwLock::new(HashMap::new()),
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
}
