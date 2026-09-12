use std::collections::HashMap;
use std::panic::AssertUnwindSafe;
use std::sync::Arc;
use std::time::{Duration, Instant};

use git_core::commit::CommitDetail;
use git_core::log::{walk, LogFilter, LogRow, RefLabel, RevSpec};
use git_core::refs::{self, HeadInfo, RefsSnapshot};
use git_core::repo::repo_relative;
use git_core::watch::Watcher;
use git_core::{GitError, RepoHandle, RepoId};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt;

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
    /// Why the walk stopped, if it failed. A `log://progress` emitted before
    /// the frontend knew the generation is dropped; this is how it recovers it.
    pub error: Option<String>,
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
pub(crate) async fn blocking<T, F>(f: F) -> Result<T, AppError>
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

/// Ref labels per commit oid. Its own `Repository` like the walk's, off the
/// shared `git2` mutex: labels are the last thing the grid waits for on open,
/// and the mutex has the status scan and `get_refs` queued on it.
async fn compute_labels(
    handle: Arc<RepoHandle>,
) -> Result<Arc<HashMap<String, Vec<RefLabel>>>, AppError> {
    blocking(move || {
        let t = Instant::now();
        let mut repo = handle.open_private()?;
        let labels = refs::label_map(&refs::label_snapshot(&mut repo)?);
        tracing::info!(id = %handle.id, elapsed = ?t.elapsed(), "labels computed");
        Ok(Arc::new(labels))
    })
    .await
}

/// Opens (or returns the already-open) repository containing `path`.
#[tauri::command]
pub async fn open_repo(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<RepoSummary, AppError> {
    let t = Instant::now();
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
    tracing::info!(id = %handle.id, elapsed = ?t.elapsed(), "opened repo");
    start_watcher(&app, &state, &handle).await;
    Ok(summary(&handle, head))
}

/// Starts the filesystem watcher for `handle` (no-op when one is already
/// running). Failure degrades to manual refresh with a warning.
async fn start_watcher(app: &AppHandle, state: &AppState, handle: &Arc<RepoHandle>) {
    let already = state
        .watchers
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .contains_key(&handle.id);
    if already {
        return;
    }
    let app = app.clone();
    let id = handle.id.clone();
    let h = Arc::clone(handle);
    let t = Instant::now();
    let started = blocking(move || {
        let event_id = h.id.clone();
        Ok(Watcher::start(&h, move |change| {
            super::stage::emit_changed(&app, &event_id, &change)
        })?)
    })
    .await;
    match started {
        Ok(w) => {
            state
                .watchers
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .insert(id.clone(), w);
            tracing::info!(id = %id, elapsed = ?t.elapsed(), "watcher started");
        }
        Err(e) => tracing::warn!(id = %id, error = %e, "watcher unavailable; manual refresh only"),
    }
}

/// Drops the repository, its watcher and its log walk. In-flight operations
/// are deliberately not cancelled here: the UI refuses close and switch while
/// one runs (`refusedWhileRunning` in `src/screens/RepoWindow/actions.ts`), so
/// there is nothing to cancel by the time this command is reachable.
#[tauri::command]
pub async fn close_repo(state: State<'_, AppState>, id: RepoId) -> Result<(), AppError> {
    let removed = state
        .repos
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(&id);
    let watcher = state
        .watchers
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(&id);
    if let Some(w) = watcher {
        w.stop();
    }
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
    blocking(move || {
        let t = Instant::now();
        // Its own `Repository`, like the labels: the status scan can hold the
        // shared lock for seconds on a big tree, and the sidebar must not wait
        // for it. Costs a cold object cache (~100 ms instead of ~20 ms here).
        let mut repo = handle.open_private()?;
        let snap = refs::snapshot_with(&mut repo, &mut handle.ahead_behind.lock())?;
        tracing::info!(id = %handle.id, elapsed = ?t.elapsed(), "refs read");
        Ok(snap)
    })
    .await
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
            return Err(AppError::StaleGeneration(format!(
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
            error: log.error.clone(),
        })
    })
    .await
}

/// Opens a working-tree file with the OS handler, or reveals it in the file
/// manager (`reveal`). `path` is repository-relative and validated by
/// [`repo_relative`]: the opener itself is not scope-restricted.
#[tauri::command]
pub async fn open_path(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    path: String,
    reveal: bool,
) -> Result<(), AppError> {
    let handle = state.repo(&id)?;
    let abs = handle.path.join(repo_relative(&path)?);
    blocking(move || {
        let opener = app.opener();
        if reveal {
            opener.reveal_item_in_dir(&abs)
        } else {
            opener.open_path(abs.to_string_lossy(), None::<&str>)
        }
        .map_err(|e| {
            GitError::Io(std::io::Error::other(format!("could not open {path}: {e}"))).into()
        })
    })
    .await
}

/// Row index of `oid` in walk `generation` (`None` when it is not among the
/// rows walked so far), so revealing a commit deep in the log is one call
/// rather than a page-by-page scan.
#[tauri::command]
pub async fn find_log_row(
    state: State<'_, AppState>,
    id: RepoId,
    generation: u64,
    oid: String,
) -> Result<Option<usize>, AppError> {
    let handle = state.repo(&id)?;
    blocking(move || {
        let log = handle.log.read();
        if log.generation != generation {
            return Err(AppError::StaleGeneration(format!(
                "log generation {generation} is stale (current {})",
                log.generation
            )));
        }
        Ok(log.find(&oid))
    })
    .await
}
