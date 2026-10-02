use std::sync::Arc;
use std::time::{Duration, Instant};

use git_core::conflict;
use git_core::diff::{self, DiffOptions, DiffTarget, FileChange, FileDiff};
use git_core::status::{self, WorkdirStatus};
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
/// of watcher batches shares a scan instead of starting one each.
#[tauri::command]
pub async fn get_status(
    state: State<'_, AppState>,
    id: RepoId,
) -> Result<Arc<WorkdirStatus>, AppError> {
    let handle = state.repo(&id)?;
    let h = Arc::clone(&handle);
    handle.scan.run(|| scan(h)).await
}

/// One libgit2 scan, run by the gate holder.
async fn scan(handle: Arc<RepoHandle>) -> Result<WorkdirStatus, AppError> {
    // The scan writes the refreshed stat cache back at the end, and libgit2
    // does not check whether the index changed on disk in between: a mutation
    // that ran during the scan would be silently undone. Holding `git2` covers
    // only the libgit2-side mutations (stage / unstage / discard); the
    // CLI-backed ones (`git apply --cached`, `git commit`, merge, rebase…)
    // touch the index as a subprocess, and `scan_lock` is what serialises the
    // scan against those. Taken (an op is in flight, or about to be): scan
    // without the write-back, so status stays live during a long push. A
    // `git add` typed in a terminal during the scan is still exposed, as with
    // any libgit2 index write. Free: hold the guard for the whole scan — that
    // is what makes an op starting now wait for the write-back. Taken when
    // the scan starts, not while it waits for the gate: a queued request
    // holding it would make an op wait behind a scan that hasn't started.
    let scan_guard = handle.scan_lock.try_lock();
    let refresh = scan_guard.is_ok();
    let h = Arc::clone(&handle);
    blocking(move || {
        let t = Instant::now();
        let status = status::status_with(&h.git2.lock(), refresh)?;
        if t.elapsed() >= SLOW_STATUS {
            tracing::info!(id = %h.id, entries = status.entries.len(), refresh, elapsed = ?t.elapsed(), "slow status");
        }
        Ok(status)
    })
    .await
}
