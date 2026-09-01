//! Branch / remote / stash / tag / config commands (M4) plus clone and init.
//!
//! CLI-backed ops stream every [`CliEvent`] as `op://event` and resolve with
//! an [`OpResult`] once the process exits (a non-zero exit is a classified
//! `failure`, not an `Err`). Every op takes the repo's `op_lock` without
//! waiting: a second one while one runs fails with `AppError::Busy`. The
//! watcher is suppressed during the op and one synthetic `repo://changed`
//! (`workdir`, `index`, `refs`) is emitted afterwards.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use git_core::cli::ops::{self as gitops, CloneOpts, FfMode, MergeOpts, OpFailure, PullMode};
use git_core::cli::{CliEvent, CliOutput};
use git_core::status::status;
use git_core::watch::ChangeKind;
use git_core::{config, refs, GitError, RepoHandle, RepoId};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use super::repo::{blocking, open_repo, RepoSummary};
use super::stage::mutate;
use crate::{AppError, AppState};

const OP_EVENT: &str = "op://event";
const ALL_KINDS: &[ChangeKind] = &[ChangeKind::Workdir, ChangeKind::Index, ChangeKind::Refs];
const REFS: &[ChangeKind] = &[ChangeKind::Refs];

/// Payload of `op://event`. `repo_id` is `null` for ops without a repo (clone).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpEvent<'a> {
    repo_id: Option<&'a RepoId>,
    op_id: &'a str,
    event: CliEvent,
}

/// Outcome of a streaming op after its process exited.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpResult {
    pub op_id: String,
    pub code: i32,
    /// Conflicted paths (from `status()` after merge / rebase / pull failures).
    pub conflicts: Vec<String>,
    pub failure: Option<OpFailure>,
}

pub(crate) struct GitRun {
    pub op_id: String,
    pub out: CliOutput,
}

/// Runs `git <args>` in `dir` as a registered (cancellable) op; when `stream`,
/// every [`CliEvent`] is forwarded as `op://event`. Cancellation surfaces as
/// `GitError::Cancelled`.
pub(crate) async fn run_git_op(
    app: &AppHandle,
    state: &AppState,
    repo_id: Option<&RepoId>,
    dir: &Path,
    args: &[&str],
    stdin: Option<Vec<u8>>,
    stream: bool,
) -> Result<GitRun, AppError> {
    let (op_id, cancel) = state.begin_op();
    let cli = state.git_cli();
    let result = cli
        .run(dir, &op_id, args, stdin, cancel, |event| {
            if stream {
                let payload = OpEvent {
                    repo_id,
                    op_id: &op_id,
                    event,
                };
                if let Err(e) = app.emit(OP_EVENT, payload) {
                    tracing::warn!(error = %e, "failed to emit op event");
                }
            }
        })
        .await;
    state.end_op(&op_id);
    Ok(GitRun {
        out: result?,
        op_id,
    })
}

/// Runs a streaming CLI op under the busy-checked op lock. On a non-zero exit
/// the output is classified; with `check_conflicts` the conflicted paths are
/// read from `status()` and override whatever git printed.
async fn cli_op(
    app: &AppHandle,
    state: &AppState,
    id: &RepoId,
    args: Vec<String>,
    check_conflicts: bool,
) -> Result<OpResult, AppError> {
    mutate(app, state, id, ALL_KINDS, |handle| async move {
        let argv: Vec<&str> = args.iter().map(String::as_str).collect();
        let run = run_git_op(
            app,
            state,
            Some(&handle.id),
            &handle.path,
            &argv,
            None,
            true,
        )
        .await?;
        let mut result = OpResult {
            op_id: run.op_id,
            code: run.out.code,
            conflicts: Vec::new(),
            failure: None,
        };
        if run.out.code == 0 {
            return Ok(result);
        }
        let mut failure = gitops::classify_failure(run.out.code, &run.out.stdout, &run.out.stderr);
        if check_conflicts {
            let found =
                blocking(move || Ok(gitops::parse_conflicts(&status(&handle.git2.lock())?)))
                    .await?;
            if !found.is_empty() {
                failure = OpFailure::Conflicts { paths: found };
            }
        }
        if let OpFailure::Conflicts { paths } = &failure {
            result.conflicts = paths.clone();
        }
        tracing::info!(op_id = %result.op_id, code = result.code, ?failure, "op failed");
        result.failure = Some(failure);
        Ok(result)
    })
    .await
}

/// Runs a git2 mutation under the busy-checked op lock.
async fn git2_op<T, F>(
    app: &AppHandle,
    state: &AppState,
    id: &RepoId,
    kinds: &[ChangeKind],
    f: F,
) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce(&RepoHandle) -> Result<T, GitError> + Send + 'static,
{
    mutate(
        app,
        state,
        id,
        kinds,
        |handle: Arc<RepoHandle>| async move { blocking(move || Ok(f(&handle)?)).await },
    )
    .await
}

// ---- streaming ops ----

#[tauri::command]
pub async fn fetch(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    remote: Option<String>,
    prune: bool,
    tags: bool,
) -> Result<OpResult, AppError> {
    let args = gitops::fetch(remote.as_deref(), prune, tags);
    cli_op(&app, &state, &id, args, false).await
}

#[tauri::command]
pub async fn pull(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    remote: Option<String>,
    branch: Option<String>,
    mode: PullMode,
) -> Result<OpResult, AppError> {
    let args = gitops::pull(remote.as_deref(), branch.as_deref(), mode);
    cli_op(&app, &state, &id, args, true).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn push(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    remote: String,
    refspec: Option<String>,
    set_upstream: bool,
    force_with_lease: bool,
    tags: bool,
) -> Result<OpResult, AppError> {
    let args = gitops::push(
        &remote,
        refspec.as_deref(),
        set_upstream,
        force_with_lease,
        tags,
    );
    cli_op(&app, &state, &id, args, false).await
}

#[tauri::command]
pub async fn merge(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    branch: String,
    ff: FfMode,
    squash: bool,
    message: Option<String>,
) -> Result<OpResult, AppError> {
    let args = gitops::merge(
        &branch,
        &MergeOpts {
            ff,
            squash,
            message,
        },
    );
    cli_op(&app, &state, &id, args, true).await
}

#[tauri::command]
pub async fn rebase(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    onto: String,
) -> Result<OpResult, AppError> {
    cli_op(&app, &state, &id, gitops::rebase(&onto), true).await
}

#[tauri::command]
pub async fn rebase_continue(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
) -> Result<OpResult, AppError> {
    cli_op(&app, &state, &id, gitops::rebase_continue(), true).await
}

#[tauri::command]
pub async fn rebase_abort(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
) -> Result<OpResult, AppError> {
    cli_op(&app, &state, &id, gitops::rebase_abort(), false).await
}

#[tauri::command]
pub async fn merge_abort(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
) -> Result<OpResult, AppError> {
    cli_op(&app, &state, &id, gitops::merge_abort(), false).await
}

#[tauri::command]
pub async fn checkout(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    target: String,
    create_branch: Option<String>,
    track: bool,
) -> Result<OpResult, AppError> {
    let args = gitops::checkout(&target, create_branch.as_deref(), track);
    cli_op(&app, &state, &id, args, false).await
}

/// `git reset (--soft | --mixed | --hard) <target>`: moves the current branch
/// (or a detached HEAD) to `target`.
#[tauri::command]
pub async fn reset(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    mode: gitops::ResetMode,
    target: String,
) -> Result<OpResult, AppError> {
    let args = gitops::reset(mode, &target);
    cli_op(&app, &state, &id, args, false).await
}

/// `git branch -f <branch> <target>`: moves a branch that is not checked out
/// (the working tree is untouched).
#[tauri::command]
pub async fn reset_branch(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    branch: String,
    target: String,
) -> Result<OpResult, AppError> {
    let args = gitops::branch_force(&branch, &target);
    cli_op(&app, &state, &id, args, false).await
}

#[tauri::command]
pub async fn stash_push(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    message: Option<String>,
    include_untracked: bool,
    keep_index: bool,
) -> Result<OpResult, AppError> {
    let args = gitops::stash_push(message.as_deref(), include_untracked, keep_index);
    cli_op(&app, &state, &id, args, false).await
}

#[tauri::command]
pub async fn stash_apply(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    index: usize,
) -> Result<OpResult, AppError> {
    cli_op(&app, &state, &id, gitops::stash_apply(index), true).await
}

#[tauri::command]
pub async fn stash_pop(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    index: usize,
) -> Result<OpResult, AppError> {
    cli_op(&app, &state, &id, gitops::stash_pop(index), true).await
}

#[tauri::command]
pub async fn stash_drop(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    index: usize,
) -> Result<OpResult, AppError> {
    cli_op(&app, &state, &id, gitops::stash_drop(index), false).await
}

#[tauri::command]
pub async fn delete_remote_branch(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    remote: String,
    name: String,
) -> Result<OpResult, AppError> {
    let args = gitops::delete_remote_branch(&remote, &name);
    cli_op(&app, &state, &id, args, false).await
}

// ---- git2-backed ops ----

/// Creates `name` at `target`. With `checkout` it runs `git checkout -b`
/// instead (streams `op://event`, hooks run) and fails on a non-zero exit.
#[tauri::command]
pub async fn create_branch(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    name: String,
    target: String,
    checkout: bool,
) -> Result<(), AppError> {
    if checkout {
        let args = gitops::checkout(&target, Some(&name), false);
        let result = cli_op(&app, &state, &id, args, false).await?;
        return match result.failure {
            None => Ok(()),
            Some(f) => Err(GitError::Cli {
                cmd: "git checkout -b".into(),
                code: result.code,
                stderr: failure_message(&f),
            }
            .into()),
        };
    }
    git2_op(&app, &state, &id, REFS, move |h| {
        refs::create_branch(&h.git2.lock(), &name, &target, false).map(|_| ())
    })
    .await
}

fn failure_message(f: &OpFailure) -> String {
    match f {
        OpFailure::Conflicts { paths } => format!("conflicts in {} file(s)", paths.len()),
        OpFailure::NonFastForward => "non-fast-forward".into(),
        OpFailure::AuthFailed => "authentication failed".into(),
        OpFailure::Rejected { message } | OpFailure::Other { message } => message.clone(),
    }
}

#[tauri::command]
pub async fn delete_branch(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    name: String,
    force: bool,
) -> Result<(), AppError> {
    git2_op(&app, &state, &id, REFS, move |h| {
        refs::delete_branch(&h.git2.lock(), &name, force)
    })
    .await
}

#[tauri::command]
pub async fn rename_branch(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    old: String,
    new: String,
    force: bool,
) -> Result<(), AppError> {
    git2_op(&app, &state, &id, REFS, move |h| {
        refs::rename_branch(&h.git2.lock(), &old, &new, force)
    })
    .await
}

#[tauri::command]
pub async fn create_tag(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    name: String,
    target: String,
    message: Option<String>,
) -> Result<(), AppError> {
    git2_op(&app, &state, &id, REFS, move |h| {
        refs::create_tag(&h.git2.lock(), &name, &target, message.as_deref()).map(|_| ())
    })
    .await
}

#[tauri::command]
pub async fn delete_tag(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    name: String,
) -> Result<(), AppError> {
    git2_op(&app, &state, &id, REFS, move |h| {
        refs::delete_tag(&h.git2.lock(), &name)
    })
    .await
}

/// Effective config value (`None` when unset).
#[tauri::command]
pub async fn get_config(
    state: State<'_, AppState>,
    id: RepoId,
    key: String,
) -> Result<Option<String>, AppError> {
    let handle = state.repo(&id)?;
    blocking(move || Ok(config::get(&handle.git2.lock(), &key))).await
}

/// Writes to the repo-local config.
#[tauri::command]
pub async fn set_config(
    state: State<'_, AppState>,
    id: RepoId,
    key: String,
    value: String,
) -> Result<(), AppError> {
    let handle = state.repo(&id)?;
    blocking(move || Ok(config::set_local(&handle.git2.lock(), &key, &value)?)).await
}

#[tauri::command]
pub async fn get_default_remote(
    state: State<'_, AppState>,
    id: RepoId,
) -> Result<Option<String>, AppError> {
    let handle = state.repo(&id)?;
    blocking(move || Ok(config::default_remote(&handle.git2.lock()))).await
}

// ---- repo creation ----

/// `git clone` into `dest` (streams `op://event` with `repoId: null`), then
/// opens the result. A failed clone is a `cli` error carrying git's stderr.
#[tauri::command]
pub async fn clone_repo(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    dest: String,
    recurse_submodules: bool,
    depth: Option<u32>,
) -> Result<RepoSummary, AppError> {
    let dest_path = PathBuf::from(&dest);
    let parent = match dest_path.parent().filter(|p| !p.as_os_str().is_empty()) {
        Some(p) => p.to_path_buf(),
        None => std::env::current_dir().map_err(GitError::from)?,
    };
    std::fs::create_dir_all(&parent).map_err(GitError::from)?;
    let opts = CloneOpts {
        recurse_submodules,
        depth,
    };
    let args = gitops::clone(&url, &dest, &opts);
    let argv: Vec<&str> = args.iter().map(String::as_str).collect();
    // A cancelled or failed clone leaves a half-written directory behind; remove it so a retry
    // isn't rejected with "already exists" — but only when we created it in the first place.
    let existed = dest_path.exists();
    let cleanup = |e: AppError| {
        if !existed {
            if let Err(err) = std::fs::remove_dir_all(&dest_path) {
                if err.kind() != std::io::ErrorKind::NotFound {
                    tracing::warn!(%dest, error = %err, "could not remove partial clone");
                }
            }
        }
        e
    };
    let run = run_git_op(&app, &state, None, &parent, &argv, None, true)
        .await
        .map_err(&cleanup)?;
    run.out
        .check(&format!("git clone {url}"))
        .map_err(|e| cleanup(AppError::from(e)))?;
    tracing::info!(%url, %dest, "cloned");
    open_repo(app, state, dest).await
}

/// `git init <path>` (initial branch from `init.defaultBranch`, else `main`),
/// then opens the new repository.
#[tauri::command]
pub async fn init_repo(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<RepoSummary, AppError> {
    let p = path.clone();
    blocking(move || Ok(git_core::repo::init_repo(&p)?)).await?;
    tracing::info!(%path, "initialized repo");
    open_repo(app, state, path).await
}
