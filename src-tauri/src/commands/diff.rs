use std::time::{Duration, Instant};

use git_core::conflict;
use git_core::diff::{self, DiffOptions, DiffTarget, FileChange, FileDiff};
use git_core::status::{self, WorkdirStatus};
use git_core::tools::{self, ToolKind};
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

/// Opens a conflicted file's three sides in the configured merge tool, or in
/// VS Code's merge editor when none is set. Returns the launcher that was used
/// so the toast can name it.
#[tauri::command]
pub async fn open_merge_editor(
    state: State<'_, AppState>,
    id: RepoId,
    path: String,
) -> Result<String, AppError> {
    let handle = state.repo(&id)?;
    blocking(move || {
        // An unreadable config is not worth failing the resolve over: the
        // VS Code fallback still works.
        let tool = tools::default_config()
            .ok()
            .and_then(|cfg| tools::get_tool(&cfg, ToolKind::Merge));
        Ok(conflict::open_merge_editor(
            &handle.git2.lock(),
            &path,
            tool.as_ref(),
        )?)
    })
    .await
}

/// A status scan slower than this is worth a log line; anything quicker would
/// fill the file, since status refreshes on every watcher event.
const SLOW_STATUS: Duration = Duration::from_millis(250);

#[tauri::command]
pub async fn get_status(state: State<'_, AppState>, id: RepoId) -> Result<WorkdirStatus, AppError> {
    let handle = state.repo(&id)?;
    blocking(move || {
        let t = Instant::now();
        // Under the shared lock on purpose: the scan writes the refreshed stat
        // cache back at the end, and libgit2 does not check whether the index
        // changed on disk in between — a stage that ran during the scan would
        // be silently undone. The lock keeps the app's own mutations out of
        // that window (a `git add` from a terminal during the one slow scan
        // after a mass touch is still exposed, as with any libgit2 index write).
        let status = status::status(&handle.git2.lock())?;
        if t.elapsed() >= SLOW_STATUS {
            tracing::info!(id = %handle.id, elapsed = ?t.elapsed(), "slow status");
        }
        Ok(status)
    })
    .await
}
