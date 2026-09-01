//! Stage / unstage / discard / commit commands. Mutations run under the
//! repo's `op_lock` with the watcher suppressed and emit one synthetic
//! `repo://changed` afterwards; CLI-backed ones stream `op://event` (see
//! [`super::ops::run_git_op`]).

use std::future::Future;
use std::sync::Arc;

use git_core::diff::{self, DiffOptions, DiffTarget};
use git_core::patch::{self, PatchSelection};
use git_core::watch::{ChangeKind, RepoChange};
use git_core::{commit, refs, stage, GitError, RepoHandle, RepoId};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use super::ops::run_git_op;
use super::repo::blocking;
use crate::{AppError, AppState};

pub(crate) const CHANGED_EVENT: &str = "repo://changed";

/// Payload of `repo://changed`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepoChanged<'a> {
    pub repo_id: &'a RepoId,
    pub kinds: &'a [ChangeKind],
    pub rescan: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Author {
    pub name: String,
    pub email: String,
}

pub(crate) fn emit_changed(app: &AppHandle, id: &RepoId, change: &RepoChange) {
    let payload = RepoChanged {
        repo_id: id,
        kinds: &change.kinds,
        rescan: change.rescan,
    };
    if let Err(e) = app.emit(CHANGED_EVENT, payload) {
        tracing::warn!(error = %e, "failed to emit repo change");
    }
}

/// Runs `f` under the repo's op lock (waiting for it) with the watcher
/// suppressed, then emits one synthetic `repo://changed` with `kinds` (even
/// on error: partial changes may have landed).
pub(crate) async fn mutate<T, F, Fut>(
    app: &AppHandle,
    state: &AppState,
    id: &RepoId,
    kinds: &[ChangeKind],
    f: F,
) -> Result<T, AppError>
where
    F: FnOnce(Arc<RepoHandle>) -> Fut,
    Fut: Future<Output = Result<T, AppError>>,
{
    let handle = state.repo(id)?;
    let _guard = handle.op_lock.lock().await;
    suppressed(app, state, &handle, kinds, f).await
}

/// Like [`mutate`] but fails with [`AppError::Busy`] instead of waiting when
/// another operation holds the lock (long-running branch / remote ops).
pub(crate) async fn mutate_busy<T, F, Fut>(
    app: &AppHandle,
    state: &AppState,
    id: &RepoId,
    kinds: &[ChangeKind],
    f: F,
) -> Result<T, AppError>
where
    F: FnOnce(Arc<RepoHandle>) -> Fut,
    Fut: Future<Output = Result<T, AppError>>,
{
    let handle = state.repo(id)?;
    let _guard = handle.op_lock.try_lock().map_err(|_| AppError::Busy)?;
    suppressed(app, state, &handle, kinds, f).await
}

async fn suppressed<T, F, Fut>(
    app: &AppHandle,
    state: &AppState,
    handle: &Arc<RepoHandle>,
    kinds: &[ChangeKind],
    f: F,
) -> Result<T, AppError>
where
    F: FnOnce(Arc<RepoHandle>) -> Fut,
    Fut: Future<Output = Result<T, AppError>>,
{
    state.set_watcher_suppressed(&handle.id, true);
    let result = f(Arc::clone(handle)).await;
    state.set_watcher_suppressed(&handle.id, false);
    emit_changed(
        app,
        &handle.id,
        &RepoChange {
            kinds: kinds.to_vec(),
            rescan: false,
        },
    );
    result
}

fn as_strs(paths: &[String]) -> Vec<&str> {
    paths.iter().map(String::as_str).collect()
}

#[tauri::command]
pub async fn stage_paths(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    paths: Vec<String>,
) -> Result<(), AppError> {
    mutate(
        &app,
        &state,
        &id,
        &[ChangeKind::Index],
        |handle| async move {
            blocking(move || Ok(stage::stage_paths(&handle.git2.lock(), &as_strs(&paths))?)).await
        },
    )
    .await
}

#[tauri::command]
pub async fn unstage_paths(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    paths: Vec<String>,
) -> Result<(), AppError> {
    mutate(
        &app,
        &state,
        &id,
        &[ChangeKind::Index],
        |handle| async move {
            blocking(move || Ok(stage::unstage_paths(&handle.git2.lock(), &as_strs(&paths))?)).await
        },
    )
    .await
}

/// Discards unstaged changes (tracked: restore from index; untracked: delete).
/// Returns the paths actually touched.
#[tauri::command]
pub async fn discard_paths(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    paths: Vec<String>,
) -> Result<Vec<String>, AppError> {
    mutate(
        &app,
        &state,
        &id,
        &[ChangeKind::Workdir],
        |handle| async move {
            blocking(move || Ok(stage::discard_paths(&handle.git2.lock(), &as_strs(&paths))?)).await
        },
    )
    .await
}

/// Puts `paths` back in conflict — index stages and marker-filled working files —
/// after they were staged (and so marked resolved) without being resolved.
#[tauri::command]
pub async fn recreate_conflict(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    paths: Vec<String>,
) -> Result<(), AppError> {
    // Same shape as `apply_selection`: the closure borrows the handle and the
    // state, so they arrive as references rather than the `State` guard itself.
    run_checkout_merge(&app, &state, &id, paths).await
}

async fn run_checkout_merge(
    app: &AppHandle,
    state: &AppState,
    id: &RepoId,
    paths: Vec<String>,
) -> Result<(), AppError> {
    mutate(
        app,
        state,
        id,
        &[ChangeKind::Index, ChangeKind::Workdir],
        |handle| async move {
            let args = stage::recreate_conflict_args(&as_strs(&paths));
            let argv: Vec<&str> = args.iter().map(String::as_str).collect();
            let run = run_git_op(
                app,
                state,
                Some(&handle.id),
                &handle.path,
                &argv,
                None,
                false,
            )
            .await?;
            run.out.check(&format!("git {}", argv.join(" ")))?;
            Ok(())
        },
    )
    .await
}

/// Builds the patch for `selection` from the stage-able diff of `path`
/// (`Unstaged`, or `Staged` when `reverse`) and applies it to the index.
async fn apply_selection(
    app: &AppHandle,
    state: &AppState,
    id: &RepoId,
    path: String,
    selection: PatchSelection,
    reverse: bool,
) -> Result<(), AppError> {
    mutate(app, state, id, &[ChangeKind::Index], |handle| async move {
        let target = if reverse {
            DiffTarget::Staged
        } else {
            DiffTarget::Unstaged
        };
        let opts = DiffOptions {
            max_lines: usize::MAX,
            ..DiffOptions::default()
        };
        let h = Arc::clone(&handle);
        let patch = blocking(move || {
            let d = diff::file_diff(&h.git2.lock(), &target, &path, &opts)?;
            Ok(patch::build_patch(&d, &selection, reverse)?)
        })
        .await?;
        let args = stage::stage_patch_args(reverse);
        let run = run_git_op(
            app,
            state,
            Some(&handle.id),
            &handle.path,
            &args,
            Some(patch.into_bytes()),
            false,
        )
        .await?;
        run.out.check(&format!("git {}", args.join(" ")))?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn stage_hunks(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    path: String,
    hunks: Vec<usize>,
    reverse: bool,
) -> Result<(), AppError> {
    apply_selection(
        &app,
        &state,
        &id,
        path,
        PatchSelection::Hunks(hunks),
        reverse,
    )
    .await
}

/// `lines` are `[hunkIndex, lineIndexWithinHunk]` pairs.
#[tauri::command]
pub async fn stage_lines(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    path: String,
    lines: Vec<[usize; 2]>,
    reverse: bool,
) -> Result<(), AppError> {
    let lines = lines.into_iter().map(|[h, l]| (h, l)).collect();
    apply_selection(
        &app,
        &state,
        &id,
        path,
        PatchSelection::Lines(lines),
        reverse,
    )
    .await
}

/// Commits the index via the CLI (hooks + signing work); hook output streams
/// as `op://event`. Returns the new HEAD oid.
#[tauri::command]
pub async fn commit(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    message: String,
    amend: bool,
    signoff: bool,
) -> Result<String, AppError> {
    let (app, state) = (&app, state.inner());
    mutate(
        app,
        state,
        &id,
        &[ChangeKind::Index, ChangeKind::Refs],
        |handle| async move {
            // Fail early with a clear error instead of git's "please tell me who you are".
            let h = Arc::clone(&handle);
            blocking(move || Ok(commit::author_identity(&h.git2.lock())?)).await?;

            // Kept alive until git has read it.
            let file = tempfile::Builder::new()
                .prefix("t4-commit-msg-")
                .suffix(".txt")
                .tempfile()
                .and_then(|f| std::fs::write(f.path(), message.as_bytes()).map(|_| f))
                .map_err(GitError::from)?;
            let args = commit::commit_args(file.path(), amend, signoff, false);
            let args: Vec<&str> = args.iter().map(String::as_str).collect();
            let run = run_git_op(
                app,
                state,
                Some(&handle.id),
                &handle.path,
                &args,
                None,
                true,
            )
            .await?;
            drop(file);
            run.out.check("git commit")?;

            let oid = blocking(move || Ok(refs::head_info(&handle.git2.lock())?.oid))
                .await?
                .ok_or_else(|| AppError::Internal("HEAD unborn after commit".into()))?;
            tracing::info!(%oid, amend, "committed");
            Ok(oid)
        },
    )
    .await
}

/// Full HEAD message for amend prefill (`None` on an unborn HEAD).
#[tauri::command]
pub async fn get_head_message(
    state: State<'_, AppState>,
    id: RepoId,
) -> Result<Option<String>, AppError> {
    let handle = state.repo(&id)?;
    blocking(move || Ok(commit::head_message(&handle.git2.lock())?)).await
}

#[tauri::command]
pub async fn get_author(state: State<'_, AppState>, id: RepoId) -> Result<Author, AppError> {
    let handle = state.repo(&id)?;
    blocking(move || {
        let (name, email) = commit::author_identity(&handle.git2.lock())?;
        Ok(Author { name, email })
    })
    .await
}

/// Cancels a running CLI op (kills its process tree); `false` if unknown.
#[tauri::command]
pub fn cancel_op(state: State<'_, AppState>, op_id: String) -> bool {
    let found = state.cancel_op(&op_id);
    tracing::info!(op_id, found, "cancel requested");
    found
}
