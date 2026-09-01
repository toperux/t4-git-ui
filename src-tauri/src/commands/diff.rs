use git_core::conflict;
use git_core::diff::{self, DiffOptions, DiffTarget, FileChange, FileDiff};
use git_core::status::{self, WorkdirStatus};
use git_core::RepoId;
use tauri::State;

use super::repo::blocking;
use crate::{AppError, AppState};

/// Files changed by commit `oid` vs its first parent.
#[tauri::command]
pub async fn get_commit_files(
    state: State<'_, AppState>,
    id: RepoId,
    oid: String,
) -> Result<Vec<FileChange>, AppError> {
    let handle = state.repo(&id)?;
    blocking(move || {
        Ok(diff::changed_files(
            &handle.git2.lock(),
            &DiffTarget::Commit { oid },
        )?)
    })
    .await
}

#[tauri::command]
pub async fn get_changed_files(
    state: State<'_, AppState>,
    id: RepoId,
    target: DiffTarget,
) -> Result<Vec<FileChange>, AppError> {
    let handle = state.repo(&id)?;
    blocking(move || Ok(diff::changed_files(&handle.git2.lock(), &target)?)).await
}

#[tauri::command]
pub async fn get_file_diff(
    state: State<'_, AppState>,
    id: RepoId,
    target: DiffTarget,
    path: String,
    opts: Option<DiffOptions>,
) -> Result<FileDiff, AppError> {
    let handle = state.repo(&id)?;
    let opts = opts.unwrap_or_default();
    blocking(move || Ok(diff::file_diff(&handle.git2.lock(), &target, &path, &opts)?)).await
}

/// Opens a conflicted file's three sides in VS Code's merge editor. Returns the
/// launcher it found (`code`, `codium`, …) so the toast can name it.
#[tauri::command]
pub async fn open_merge_editor(
    state: State<'_, AppState>,
    id: RepoId,
    path: String,
) -> Result<String, AppError> {
    let handle = state.repo(&id)?;
    blocking(move || Ok(conflict::open_merge_editor(&handle.git2.lock(), &path)?)).await
}

#[tauri::command]
pub async fn get_status(state: State<'_, AppState>, id: RepoId) -> Result<WorkdirStatus, AppError> {
    let handle = state.repo(&id)?;
    blocking(move || Ok(status::status(&handle.git2.lock())?)).await
}
