use std::collections::HashMap;
use std::panic::AssertUnwindSafe;
use std::sync::Arc;
use std::time::{Duration, Instant};

use git_core::commit::CommitDetail;
use git_core::log::{walk, LogFilter, LogRow, RefLabel, RevSpec};
use git_core::refs::{self, HeadInfo, RefsSnapshot};
use git_core::{RepoHandle, RepoId};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::{AppError, AppState};

const PROGRESS_EVENT: &str = "log://progress";
const PROGRESS_THROTTLE: Duration = Duration::from_millis(100);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoSummary {
    pub id: RepoId,
    /// Directory name of the working directory.
    pub name: String,
    pub path: String,
    pub head: HeadInfo,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogPage {
    pub rows: Vec<LogRow>,
    pub total: usize,
    pub complete: bool,
    pub generation: u64,
}

/// Payload of `log://progress`, emitted after each chunk (throttled) and once at the end.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogProgress {
    repo_id: RepoId,
    generation: u64,
    total: usize,
    complete: bool,
    error: Option<String>,
}

/// Runs a blocking git-core call on the blocking pool.
async fn blocking<T, F>(f: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Internal(format!("blocking task failed: {e}")))?
}

fn summary(handle: &RepoHandle, head: HeadInfo) -> RepoSummary {
    RepoSummary {
        id: handle.id.clone(),
        name: handle.name(),
        path: handle.path.to_string_lossy().into_owned(),
        head,
    }
}

/// Ref labels per commit oid, computed under the shared `git2` mutex.
async fn compute_labels(
    handle: Arc<RepoHandle>,
) -> Result<Arc<HashMap<String, Vec<RefLabel>>>, AppError> {
    blocking(move || {
        let mut repo = handle.git2.lock();
        Ok(Arc::new(refs::label_map(&refs::snapshot(&mut repo)?)))
    })
    .await
}

/// Opens (or returns the already-open) repository containing `path`.
#[tauri::command]
pub async fn open_repo(state: State<'_, AppState>, path: String) -> Result<RepoSummary, AppError> {
    let opened = blocking(move || Ok(RepoHandle::open(&path)?)).await?;
    let handle = {
        let mut repos = state
            .repos
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        // The id is only known after opening, so a concurrent open of the same
        // repo can race here; `or_insert` keeps the first handle (with its log
        // cache) and drops the newcomer.
        Arc::clone(repos.entry(opened.id.clone()).or_insert(opened))
    };
    let h = Arc::clone(&handle);
    let head = blocking(move || Ok(refs::head_info(&h.git2.lock())?)).await?;
    tracing::info!(id = %handle.id, "opened repo");
    Ok(summary(&handle, head))
}

#[tauri::command]
pub async fn close_repo(state: State<'_, AppState>, id: RepoId) -> Result<(), AppError> {
    let removed = state
        .repos
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(&id);
    if let Some(handle) = removed {
        // Bump the generation and raise the cancel flag so an in-flight walk
        // stops at its next commit and abandons its result.
        handle.log.write().begin();
        tracing::info!(id = %id, "closed repo");
    }
    Ok(())
}

#[tauri::command]
pub async fn get_refs(state: State<'_, AppState>, id: RepoId) -> Result<RefsSnapshot, AppError> {
    let handle = state.repo(&id)?;
    blocking(move || Ok(refs::snapshot(&mut handle.git2.lock())?)).await
}

#[tauri::command]
pub async fn get_commit(
    state: State<'_, AppState>,
    id: RepoId,
    oid: String,
) -> Result<CommitDetail, AppError> {
    let handle = state.repo(&id)?;
    blocking(move || Ok(git_core::commit::get_commit(&handle.git2.lock(), &oid)?)).await
}

/// Starts a background walk that fills `RepoHandle::log`; returns its generation.
/// Progress is reported via `log://progress`. Ref labels are snapshotted here
/// (see [`refresh_labels`]).
#[tauri::command]
pub async fn start_log(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    spec: RevSpec,
    filter: LogFilter,
) -> Result<u64, AppError> {
    let handle = state.repo(&id)?;
    let labels = compute_labels(Arc::clone(&handle)).await?;
    let (generation, cancel) = {
        let mut log = handle.log.write();
        let generation = log.begin();
        log.labels = labels;
        (generation, Arc::clone(&log.cancel))
    };

    let emit = move |total: usize, complete: bool, error: Option<String>| {
        let payload = LogProgress {
            repo_id: id.clone(),
            generation,
            total,
            complete,
            error,
        };
        if let Err(e) = app.emit(PROGRESS_EVENT, payload) {
            tracing::warn!(error = %e, "failed to emit log progress");
        }
    };

    tauri::async_runtime::spawn_blocking(move || {
        let started = Instant::now();
        let mut last_emit: Option<Instant> = None;
        let walked = std::panic::catch_unwind(AssertUnwindSafe(|| {
            handle.open_private().and_then(|repo| {
                walk(&repo, &spec, &filter, &cancel, |chunk| {
                    let total = {
                        let mut log = handle.log.write();
                        if log.generation != generation {
                            return false;
                        }
                        log.rows.extend(chunk);
                        log.rows.len()
                    };
                    if last_emit.is_none_or(|t| t.elapsed() >= PROGRESS_THROTTLE) {
                        emit(total, false, None);
                        last_emit = Some(Instant::now());
                    }
                    true
                })
            })
        }));
        let result: Result<usize, String> = match walked {
            Ok(r) => r.map_err(|e| e.to_string()),
            Err(payload) => {
                let msg = payload
                    .downcast_ref::<&str>()
                    .map(|s| s.to_string())
                    .or_else(|| payload.downcast_ref::<String>().cloned())
                    .unwrap_or_else(|| "unknown panic".to_string());
                tracing::error!(generation, panic = %msg, "walk panicked");
                Err(format!("internal error: {msg}"))
            }
        };

        let mut log = handle.log.write();
        if log.generation != generation {
            tracing::debug!(generation, "walk abandoned (superseded)");
            return;
        }
        log.complete = true;
        let error = result.as_ref().err().cloned();
        log.error = error.clone();
        let total = log.rows.len();
        drop(log);
        match &result {
            Ok(n) => {
                tracing::info!(generation, rows = n, elapsed = ?started.elapsed(), "walk complete")
            }
            Err(e) => tracing::warn!(generation, error = %e, "walk failed"),
        }
        emit(total, true, error);
    });

    Ok(generation)
}

/// Recomputes the ref labels used by [`get_log_page`] for the current walk
/// (call after refs change); returns the current generation.
#[tauri::command]
pub async fn refresh_labels(state: State<'_, AppState>, id: RepoId) -> Result<u64, AppError> {
    let handle = state.repo(&id)?;
    let labels = compute_labels(Arc::clone(&handle)).await?;
    let mut log = handle.log.write();
    log.labels = labels;
    Ok(log.generation)
}

/// Returns rows `[offset, offset+limit)` of the walk `generation` with ref labels
/// attached. Labels are as of the last [`start_log`] / [`refresh_labels`].
#[tauri::command]
pub async fn get_log_page(
    state: State<'_, AppState>,
    id: RepoId,
    generation: u64,
    offset: usize,
    limit: usize,
) -> Result<LogPage, AppError> {
    let handle = state.repo(&id)?;
    blocking(move || {
        let log = handle.log.read();
        if log.generation != generation {
            return Err(AppError::Internal(format!(
                "log generation {generation} is stale (current {})",
                log.generation
            )));
        }
        let (rows, total, complete) = log.page(offset, limit);
        let rows = rows
            .into_iter()
            .map(|row| LogRow {
                labels: log.labels.get(&row.commit.oid).cloned().unwrap_or_default(),
                row,
            })
            .collect();
        Ok(LogPage {
            rows,
            total,
            complete,
            generation,
        })
    })
    .await
}
