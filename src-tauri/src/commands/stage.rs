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

/// Runs `f` under the repo's op lock with the watcher suppressed, then emits
/// one synthetic `repo://changed` with `kinds` (even on error: partial changes
/// may have landed). Fails with [`AppError::Busy`] instead of waiting when
/// another operation holds the lock: a stage or commit issued during a fetch
/// would otherwise sit there, with nothing on screen, until the fetch ended.
///
/// `op_lock` first, `scan_lock` second, both held for the whole op: reversed,
/// a click during a long push would wait on the scan lock instead of coming
/// back `Busy`. Waiting on `scan_lock` costs at most one status scan, and a
/// scan never takes `op_lock`, so the pair cannot deadlock.
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
    let _guard = handle.op_lock.try_lock().map_err(|_| AppError::Busy)?;
    let _scan_guard = handle.scan_lock.lock().await;
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

/// Replaces `paths` with one whole side of their conflict (`git checkout
/// --ours|--theirs`) and stages them, which is what takes them out of the
/// conflicted state. A path whose chosen side does not exist (a modify/delete
/// conflict) is resolved as the deletion instead — `checkout --<side>` can
/// never produce it, and one such path would abort the whole batch.
#[tauri::command]
pub async fn resolve_conflict(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    paths: Vec<String>,
    side: stage::ConflictSide,
) -> Result<(), AppError> {
    let (app, state) = (&app, state.inner());
    mutate(
        app,
        state,
        &id,
        &[ChangeKind::Index, ChangeKind::Workdir],
        |handle| async move {
            let h = Arc::clone(&handle);
            let split = paths.clone();
            let (present, missing) = blocking(move || {
                let repo = h.git2.lock();
                let (present, missing) = stage::split_by_side(&repo, &as_strs(&split), side)?;
                let own = |v: Vec<&str>| v.into_iter().map(str::to_string).collect::<Vec<_>>();
                Ok((own(present), own(missing)))
            })
            .await?;

            if !present.is_empty() {
                let args = stage::checkout_side_args(side, &as_strs(&present));
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
                let h = Arc::clone(&handle);
                blocking(move || Ok(stage::stage_paths(&h.git2.lock(), &as_strs(&present))?))
                    .await?;
            }
            if !missing.is_empty() {
                blocking(move || {
                    Ok(stage::remove_paths(
                        &handle.git2.lock(),
                        &as_strs(&missing),
                    )?)
                })
                .await?;
            }
            Ok(())
        },
    )
    .await
}

/// What a hunk / line selection does. `Discard` reverse-applies to the working
/// tree instead of the index: the unstaged diff's NEW side *is* the file on
/// disk, so the same patch `git apply -R` takes — minus `--cached`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PatchOp {
    Stage,
    Unstage,
    Discard,
}

/// Builds the patch for `selection` from the stage-able diff of `path`
/// (`Staged` for an unstage, `Unstaged` otherwise) and applies it. `old_path`
/// is the rename hint the frontend loaded the shown diff with: without the
/// same hint the rebuild here is a different diff, and the indices would point
/// at other hunks.
#[allow(clippy::too_many_arguments)]
async fn apply_selection(
    app: &AppHandle,
    state: &AppState,
    id: &RepoId,
    path: String,
    old_path: Option<String>,
    selection: PatchSelection,
    op: PatchOp,
    context: u32,
) -> Result<(), AppError> {
    // A discard rewrites the working tree, a stage / unstage the index.
    let kinds = match op {
        PatchOp::Discard => [ChangeKind::Workdir],
        _ => [ChangeKind::Index],
    };
    mutate(app, state, id, &kinds, |handle| async move {
        let target = match op {
            PatchOp::Unstage => DiffTarget::Staged,
            _ => DiffTarget::Unstaged,
        };
        // The hunk / line indices come from a diff the frontend rendered, so the
        // context has to match the one it asked for.
        let opts = DiffOptions {
            context,
            max_lines: usize::MAX,
            ..DiffOptions::default()
        };
        let reverse = op != PatchOp::Stage;
        // The exec bit is not part of a hunk selection, and `-R` would reverse
        // its header lines along with the hunks (see `build_patch`).
        let mode = op != PatchOp::Discard;
        let h = Arc::clone(&handle);
        let patch = blocking(move || {
            let d = diff::file_diff(&h.git2.lock(), &target, &path, old_path.as_deref(), &opts)?;
            Ok(patch::build_patch(&d, &selection, reverse, mode)?)
        })
        .await?;
        // Zero-context hunks have nothing for git apply to match on.
        let zero = context == 0;
        let args = match op {
            PatchOp::Discard => stage::discard_patch_args(zero),
            _ => stage::stage_patch_args(reverse, zero),
        };
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
#[allow(clippy::too_many_arguments)]
pub async fn stage_hunks(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    path: String,
    old_path: Option<String>,
    hunks: Vec<usize>,
    reverse: bool,
    context: u32,
) -> Result<(), AppError> {
    let op = if reverse {
        PatchOp::Unstage
    } else {
        PatchOp::Stage
    };
    apply_selection(
        &app,
        &state,
        &id,
        path,
        old_path,
        PatchSelection::Hunks(hunks),
        op,
        context,
    )
    .await
}

/// `lines` are `[hunkIndex, lineIndexWithinHunk]` pairs.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn stage_lines(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    path: String,
    old_path: Option<String>,
    lines: Vec<[usize; 2]>,
    reverse: bool,
    context: u32,
) -> Result<(), AppError> {
    let lines = lines.into_iter().map(|[h, l]| (h, l)).collect();
    let op = if reverse {
        PatchOp::Unstage
    } else {
        PatchOp::Stage
    };
    apply_selection(
        &app,
        &state,
        &id,
        path,
        old_path,
        PatchSelection::Lines(lines),
        op,
        context,
    )
    .await
}

/// Throws away `hunks` of the unstaged diff of `path` — the working file loses
/// them, the index keeps whatever is staged. Not undoable.
#[tauri::command]
pub async fn discard_hunks(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    path: String,
    old_path: Option<String>,
    hunks: Vec<usize>,
    context: u32,
) -> Result<(), AppError> {
    apply_selection(
        &app,
        &state,
        &id,
        path,
        old_path,
        PatchSelection::Hunks(hunks),
        PatchOp::Discard,
        context,
    )
    .await
}

/// `lines` are `[hunkIndex, lineIndexWithinHunk]` pairs of the unstaged diff.
#[tauri::command]
pub async fn discard_lines(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    path: String,
    old_path: Option<String>,
    lines: Vec<[usize; 2]>,
    context: u32,
) -> Result<(), AppError> {
    let lines = lines.into_iter().map(|[h, l]| (h, l)).collect();
    apply_selection(
        &app,
        &state,
        &id,
        path,
        old_path,
        PatchSelection::Lines(lines),
        PatchOp::Discard,
        context,
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
            let args = commit::commit_args(file.path(), amend, signoff);
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

/// The message a stopped merge / cherry-pick / rebase left in `MERGE_MSG`, for
/// the commit editor to start from (`None` when there is none).
#[tauri::command]
pub async fn get_merge_message(
    state: State<'_, AppState>,
    id: RepoId,
) -> Result<Option<String>, AppError> {
    let handle = state.repo(&id)?;
    blocking(move || Ok(commit::pending_message(&handle.git2.lock()))).await
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
