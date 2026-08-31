use std::sync::RwLock;

pub struct AppState {
    /// Path or name of the git executable (default: `git` from PATH).
    pub git_path: RwLock<String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            git_path: RwLock::new("git".to_string()),
        }
    }
}
