use tauri::State;

use crate::{AppError, AppState};

#[tauri::command]
pub fn ping() -> String {
    "pong".to_string()
}

/// Runs `git --version` with the configured git executable.
#[tauri::command]
pub async fn probe_git(state: State<'_, AppState>) -> Result<String, AppError> {
    let git_path = state
        .git_path
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();

    let version = tauri::async_runtime::spawn_blocking(move || git_core::git_version(&git_path))
        .await
        .map_err(|e| AppError::Internal(format!("git_version task failed: {e}")))??;

    tracing::info!(%version, "probed git");
    Ok(version)
}
