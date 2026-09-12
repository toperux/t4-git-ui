use tauri::State;

use crate::{AppError, AppState};

async fn probe(git_path: String) -> Result<String, AppError> {
    let version = tauri::async_runtime::spawn_blocking(move || git_core::git_version(&git_path))
        .await
        .map_err(|e| AppError::Internal(format!("git_version task failed: {e}")))??;
    Ok(version)
}

/// `probe_git`'s answer: the `git --version` line, and whether it names a git
/// older than the supported floor (`git_core::MIN_GIT_VERSION`). An unparseable
/// version is taken at its word — it answered `--version`, so it is a git.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitProbe {
    pub version: String,
    pub too_old: bool,
}

/// Runs `git --version` with the configured git executable.
#[tauri::command]
pub async fn probe_git(state: State<'_, AppState>) -> Result<GitProbe, AppError> {
    let git_path = state
        .git_path
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    let version = probe(git_path).await?;
    let too_old =
        git_core::parse_git_version(&version).is_some_and(|v| v < git_core::MIN_GIT_VERSION);
    tracing::info!(%version, too_old, "probed git");
    Ok(GitProbe { version, too_old })
}

/// Points every later git invocation at `path` (a git executable), after
/// checking it answers `--version`; a path that does not is refused and the
/// previous setting stays. Returns the version. The frontend persists the path.
#[tauri::command]
pub async fn set_git_path(state: State<'_, AppState>, path: String) -> Result<String, AppError> {
    let path = path.trim().to_string();
    if path.is_empty() {
        return Err(AppError::Internal("git path is empty".into()));
    }
    let version = probe(path.clone()).await?;
    *state
        .git_path
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = path.clone();
    tracing::info!(%path, %version, "git path set");
    Ok(version)
}
