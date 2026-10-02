use std::sync::Arc;
use std::time::{Duration, Instant};

use git_core::cli::GitCli;
use git_core::conflict;
use git_core::diff::{self, DiffOptions, DiffTarget, FileChange, FileDiff};
use git_core::status::{self, ScanStart, WorkdirStatus};
use git_core::tools::{self, ToolKind};
use git_core::{RepoHandle, RepoId};
use tauri::State;

use super::repo::blocking;
use crate::{AppError, AppState};

/// On a private handle: the line counts read every listed file (seconds for a
/// few thousand large ones), and on the shared one they held up the status
/// refresh — and the stage / unstage after it — for all that time. `paths`
/// (the status's paths) limits the diff to them, so a stale but unchanged
/// file is never re-hashed.
#[tauri::command]
pub async fn get_changed_files(
    state: State<'_, AppState>,
    id: RepoId,
    target: DiffTarget,
    paths: Option<Vec<String>>,
) -> Result<Vec<FileChange>, AppError> {
    let handle = state.repo(&id)?;
    // A path the status read lossily (not UTF-8) names no file: the last
    // scan's raw bytes stand in for it.
    let lossy = paths
        .as_ref()
        .is_some_and(|p| p.iter().any(|s| s.contains('\u{FFFD}')));
    let latest = lossy.then(|| handle.scan.latest()).flatten();
    blocking(move || {
        let paths = paths
            .as_ref()
            .map(|p| status::path_bytes(p, latest.as_deref()));
        Ok(diff::changed_files(
            &handle.open_private()?,
            &target,
            paths.as_deref(),
        )?)
    })
    .await
}

#[tauri::command]
pub async fn get_file_diff(
    state: State<'_, AppState>,
    id: RepoId,
    target: DiffTarget,
    path: String,
    opts: Option<DiffOptions>,
    // The status entry's `oldPath` for a staged rename: the diff of the two
    // paths pairs them, and the working-tree targets build no other diff.
    old_path: Option<String>,
) -> Result<FileDiff, AppError> {
    let handle = state.repo(&id)?;
    let opts = opts.unwrap_or_default();
    blocking(move || {
        Ok(diff::file_diff(
            &handle.git2.lock(),
            &target,
            &path,
            old_path.as_deref(),
            &opts,
        )?)
    })
    .await
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

/// One scan at a time per repository ([`git_core::status::ScanGate`]): a burst
/// of watcher batches shares a scan instead of starting one each. The scan
/// takes no lock — neither `scan_lock` nor the index's — so it can't undo an
/// op's index write, and an op never waits for it.
#[tauri::command]
pub async fn get_status(
    state: State<'_, AppState>,
    id: RepoId,
) -> Result<Arc<WorkdirStatus>, AppError> {
    let handle = state.repo(&id)?;
    let git = state.git_cli();
    let h = Arc::clone(&handle);
    handle.scan.run(|start| scan(h, git, start)).await
}

/// One `git status`, run by the gate holder; a slow one starts the stat-cache
/// repair (see [`repair`]).
async fn scan(
    handle: Arc<RepoHandle>,
    git: GitCli,
    start: ScanStart,
) -> Result<WorkdirStatus, AppError> {
    let (status, elapsed) = status::scan_timed(&git, &handle.path, start.cancel).await?;
    if elapsed >= SLOW_STATUS {
        tracing::info!(id = %handle.id, entries = status.entries.len(), elapsed = ?elapsed, "slow status");
    }
    if handle.scan.wants_repair(start.index, elapsed) {
        repair(&handle, git);
    }
    Ok(status)
}

/// The scan never writes the index, so a stale stat cache stays stale and
/// every scan re-hashes those files: after a slow scan, `git update-index -q
/// --refresh` rewrites it, in the background. It holds `scan_lock` for its run
/// (an op started meanwhile waits for it, as for any op) — taken here without
/// waiting: an op holding it refreshes the status itself when it ends, and a
/// repair holding it ends with its own rescan, so a taken lock starts nothing
/// and records nothing. A closing repository doesn't stop it.
fn repair(handle: &Arc<RepoHandle>, git: GitCli) {
    let Ok(guard) = Arc::clone(&handle.scan_lock).try_lock_owned() else {
        return;
    };
    let h = Arc::clone(handle);
    tauri::async_runtime::spawn(async move {
        let t = Instant::now();
        match status::repair(&git, &h.path).await {
            Ok(code) => {
                tracing::info!(id = %h.id, code, elapsed = ?t.elapsed(), "status repair");
                h.scan.repaired(code);
            }
            Err(e) => {
                tracing::info!(id = %h.id, error = %e, elapsed = ?t.elapsed(), "status repair")
            }
        }
        drop(guard);
    });
}
