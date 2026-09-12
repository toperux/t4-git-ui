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

use git_core::cli::ops::{
    self as gitops, CloneOpts, FfMode, MergeOpts, OpFailure, PickOpts, PullMode, RemoteTag,
};
use git_core::cli::rebase::{self, RebaseFlags, RebaseTodo, TodoStep};
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
        run_and_classify(app, state, handle, args, check_conflicts).await
    })
    .await
}

/// [`cli_op`]'s body, for callers that already hold the op lock.
async fn run_and_classify(
    app: &AppHandle,
    state: &AppState,
    handle: Arc<RepoHandle>,
    args: Vec<String>,
    check_conflicts: bool,
) -> Result<OpResult, AppError> {
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
    // An `edit` stop exits 0 and a failed `exec` exits 1, both leaving the
    // rebase in progress: only the repository state tells them from success.
    // Rebase commands only — the other conflict-checked ops (stash pop, cherry
    // pick…) are what the user runs *while* stopped, and would all come back
    // paused.
    let paused = is_rebase(&args) && rebase_in_progress(&handle).await?;
    if result.code == 0 && !paused {
        return Ok(result);
    }
    let mut failure = gitops::classify_failure(run.out.code, &run.out.stdout, &run.out.stderr);
    let found = if check_conflicts {
        // `status`, not `get_status`: this runs inside the op, which already
        // holds `scan_lock` — going through the command would see it taken and
        // skip the write-back this scan is entitled to.
        let h = Arc::clone(&handle);
        blocking(move || Ok(gitops::parse_conflicts(&status(&h.git2.lock())?))).await?
    } else {
        Vec::new()
    };
    if !found.is_empty() {
        failure = OpFailure::Conflicts { paths: found };
    } else if paused {
        // Also for a typed `rebase --continue` (no conflict check): a stop is
        // not an error, and a "failure" with exit 0 would be reported as one.
        failure = OpFailure::Paused {
            message: pause_message(&run.out.stderr),
        };
    }
    if let OpFailure::Conflicts { paths } = &failure {
        result.conflicts = paths.clone();
    }
    tracing::info!(op_id = %result.op_id, code = result.code, ?failure, "op failed");
    result.failure = Some(failure);
    Ok(result)
}

/// Whether an argv rebases: the subcommand is the first token that is not a
/// `-c <config>` pair (the interactive rebase leads with one), and a
/// `pull --rebase` stops the same way a rebase does.
fn is_rebase(args: &[String]) -> bool {
    let mut rest = args.iter();
    while let Some(a) = rest.next() {
        if a != "-c" {
            return a == "rebase" || (a == "pull" && args.iter().any(|x| x == "--rebase"));
        }
        rest.next();
    }
    false
}

async fn rebase_in_progress(handle: &Arc<RepoHandle>) -> Result<bool, AppError> {
    let handle = Arc::clone(handle);
    blocking(move || {
        Ok(refs::RepoState::from(handle.git2.lock().state()) == refs::RepoState::Rebase)
    })
    .await
}

/// Git's own line for a pause: the `Stopped at` of an `edit` stop, the
/// `execution failed` of a rejected `exec`, else its last error line.
fn pause_message(stderr: &str) -> String {
    // Git's progress ends in `\r`, not `\n`: "Rebasing (1/1)\rStopped at …" is one line to
    // `lines()`, so split on both.
    let lines: Vec<&str> = stderr
        .split(['\n', '\r'])
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    lines
        .iter()
        .find(|l| l.starts_with("Stopped at"))
        .or_else(|| lines.iter().find(|l| l.contains("execution failed")))
        .or_else(|| {
            lines
                .iter()
                .rfind(|l| l.starts_with("error:") || l.starts_with("fatal:"))
        })
        .or_else(|| lines.last())
        .map_or_else(|| "The rebase is paused".to_string(), |l| l.to_string())
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

/// A user-supplied ref / remote / refspec / url, refused when git would read it
/// as an option. The builders end option parsing with `--end-of-options` before
/// their first positional; this covers the arguments that have to sit *before*
/// it (a remote name) and keeps the builders themselves infallible. A typed
/// command (`run_git`) is the user's own argv and is not checked here.
fn ref_arg(s: &str) -> Result<&str, AppError> {
    if s.starts_with('-') {
        return Err(GitError::Refused(format!(
            "{s:?} starts with -, which git would read as an option"
        ))
        .into());
    }
    Ok(s)
}

/// [`ref_arg`] for an argument that may be absent.
fn opt_ref(s: Option<&str>) -> Result<Option<&str>, AppError> {
    s.map(ref_arg).transpose()
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
    let args = gitops::fetch(opt_ref(remote.as_deref())?, prune, tags);
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
    let args = gitops::pull(
        opt_ref(remote.as_deref())?,
        opt_ref(branch.as_deref())?,
        mode,
    );
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
        ref_arg(&remote)?,
        opt_ref(refspec.as_deref())?,
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
        ref_arg(&branch)?,
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
    cli_op(&app, &state, &id, gitops::rebase(ref_arg(&onto)?), true).await
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
pub async fn rebase_skip(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
) -> Result<OpResult, AppError> {
    cli_op(&app, &state, &id, gitops::rebase_skip(), true).await
}

/// `<git dir>/t4-rebase`, where the todo and its message files live. The
/// sequence editor and `exec` lines name it inside `sh -c`, so a path that
/// cannot be quoted is refused here rather than mangled.
fn rebase_dir(handle: &RepoHandle) -> Result<PathBuf, AppError> {
    rebase::check_shell_path(&handle.git_dir).map_err(GitError::Refused)?;
    Ok(handle.git_dir.join("t4-rebase"))
}

/// The todo list `git rebase -i <base>` would open, without replaying
/// anything: the sequence editor copies git's list out and empties it, so git
/// stops with `nothing to do`, HEAD stays put and the autostash is popped.
/// `from_here` is the commit row's "rebase from here", which only makes sense
/// for a base HEAD can actually reach.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn rebase_todo(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    base: String,
    autostash: bool,
    rebase_merges: bool,
    update_refs: bool,
    from_here: bool,
) -> Result<RebaseTodo, AppError> {
    ref_arg(&base)?;
    let flags = RebaseFlags {
        autostash,
        rebase_merges,
        update_refs,
    };
    // Borrowed up front so the closure captures references, not the bindings.
    let (app, state) = (&app, &*state);
    mutate(app, state, &id, ALL_KINDS, |handle| async move {
        let dir = rebase_dir(&handle)?;
        std::fs::create_dir_all(&dir).map_err(GitError::from)?;
        let out = dir.join("read.todo");
        let h = Arc::clone(&handle);
        let rev = base.clone();
        let (head, base_oid) = blocking(move || {
            let repo = h.git2.lock();
            let head = rebase::commit_oid(&repo, "HEAD")?;
            let base_oid = rebase::commit_oid(&repo, &rev)?;
            // The graph can show every branch, so the row "from here" names
            // need not be on HEAD's: rebasing onto it would move the current
            // branch to a foreign base instead.
            if from_here && !rebase::is_ancestor(&repo, &head, &base_oid)? {
                return Err(GitError::Refused(format!(
                    "{} is not in HEAD's history",
                    &base_oid[..7]
                ))
                .into());
            }
            Ok((head, base_oid))
        })
        .await?;

        let args = rebase::read_args(&base, &flags, &out);
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
        // The emptied todo is what makes git refuse; any other outcome is a
        // real error (unstaged changes, an upstream that does not resolve).
        if run.out.code == 0 || !run.out.stderr.contains("nothing to do") {
            let f = gitops::classify_failure(run.out.code, &run.out.stdout, &run.out.stderr);
            return Err(GitError::Cli {
                cmd: "git rebase -i".into(),
                code: run.out.code,
                stderr: failure_message(&f),
            }
            .into());
        }
        let text = std::fs::read_to_string(&out).map_err(GitError::from)?;
        let before = head.clone();
        let lines = blocking(move || {
            let repo = handle.git2.lock();
            if rebase::commit_oid(&repo, "HEAD")? != before {
                return Err(
                    GitError::Refused("HEAD moved while the rebase list was read".into()).into(),
                );
            }
            Ok(rebase::resolve_lines(&repo, rebase::parse_todo(&text))?)
        })
        .await?;
        Ok(RebaseTodo {
            head,
            base_oid,
            lines,
        })
    })
    .await
}

/// Replays `steps` as `git rebase -i <base>`: the todo is written to
/// `<git dir>/t4-rebase` and handed to git through the sequence editor.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn rebase_interactive(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    head: String,
    base_oid: String,
    base: String,
    steps: Vec<TodoStep>,
    autostash: bool,
    rebase_merges: bool,
    update_refs: bool,
) -> Result<OpResult, AppError> {
    ref_arg(&base)?;
    let flags = RebaseFlags {
        autostash,
        rebase_merges,
        update_refs,
    };
    // Borrowed up front so the closure captures references, not the bindings.
    let (app, state) = (&app, &*state);
    mutate(app, state, &id, ALL_KINDS, |handle| async move {
        let dir = rebase_dir(&handle)?;
        let h = Arc::clone(&handle);
        let rev = base.clone();
        blocking(move || {
            let repo = h.git2.lock();
            // A moved base would replay the approved list onto a different tip;
            // a moved HEAD would replay different commits.
            if rebase::commit_oid(&repo, "HEAD")? != head
                || rebase::commit_oid(&repo, &rev)? != base_oid
            {
                return Err(GitError::Refused(
                    "The branch moved since the list was read — reopen the dialog".into(),
                )
                .into());
            }
            Ok(())
        })
        .await?;
        let todo = rebase::write_todo(&dir, &steps)?;
        let args = rebase::run_args(&base, &flags, &todo);
        run_and_classify(app, state, handle, args, true).await
    })
    .await
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
pub async fn cherry_pick(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    oid: String,
    no_commit: bool,
    record_origin: bool,
    mainline: Option<u32>,
) -> Result<OpResult, AppError> {
    let args = gitops::cherry_pick(
        ref_arg(&oid)?,
        &PickOpts {
            no_commit,
            record_origin,
            mainline,
        },
    );
    cli_op(&app, &state, &id, args, true).await
}

#[tauri::command]
pub async fn revert(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    oid: String,
    no_commit: bool,
    mainline: Option<u32>,
) -> Result<OpResult, AppError> {
    let args = gitops::revert(
        ref_arg(&oid)?,
        &PickOpts {
            no_commit,
            record_origin: false,
            mainline,
        },
    );
    cli_op(&app, &state, &id, args, true).await
}

#[tauri::command]
pub async fn cherry_pick_abort(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
) -> Result<OpResult, AppError> {
    cli_op(&app, &state, &id, gitops::cherry_pick_abort(), false).await
}

#[tauri::command]
pub async fn revert_abort(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
) -> Result<OpResult, AppError> {
    cli_op(&app, &state, &id, gitops::revert_abort(), false).await
}

#[tauri::command]
pub async fn checkout(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    target: String,
    create_branch: Option<String>,
    track: bool,
    detach: bool,
) -> Result<OpResult, AppError> {
    let args = gitops::checkout(
        ref_arg(&target)?,
        opt_ref(create_branch.as_deref())?,
        track,
        detach,
    );
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
    let args = gitops::reset(mode, ref_arg(&target)?);
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
    let args = gitops::branch_force(ref_arg(&branch)?, ref_arg(&target)?);
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
    let args = gitops::delete_remote_branch(ref_arg(&remote)?, ref_arg(&name)?);
    cli_op(&app, &state, &id, args, false).await
}

/// `git <args>` as typed by the user: the same op lock, streaming and refresh
/// as every other CLI op. Flags that need a terminal are refused (kind
/// `refused`) before anything runs.
#[tauri::command]
pub async fn run_git(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    args: Vec<String>,
) -> Result<OpResult, AppError> {
    gitops::check_custom_args(&args).map_err(GitError::Refused)?;
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
        let args = gitops::checkout(ref_arg(&target)?, Some(ref_arg(&name)?), false, false);
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
        OpFailure::Diverged => "not possible to fast-forward".into(),
        OpFailure::AuthFailed => "authentication failed".into(),
        OpFailure::Paused { message }
        | OpFailure::Rejected { message }
        | OpFailure::Other { message } => message.clone(),
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
pub async fn add_remote(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    name: String,
    url: String,
) -> Result<(), AppError> {
    git2_op(&app, &state, &id, REFS, move |h| {
        refs::add_remote(&h.git2.lock(), &name, &url)
    })
    .await
}

#[tauri::command]
pub async fn rename_remote(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    old: String,
    new: String,
) -> Result<(), AppError> {
    git2_op(&app, &state, &id, REFS, move |h| {
        refs::rename_remote(&h.git2.lock(), &old, &new)
    })
    .await
}

#[tauri::command]
pub async fn set_remote_url(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    name: String,
    url: String,
) -> Result<(), AppError> {
    git2_op(&app, &state, &id, REFS, move |h| {
        refs::set_remote_url(&h.git2.lock(), &name, &url)
    })
    .await
}

#[tauri::command]
pub async fn remove_remote(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    name: String,
) -> Result<(), AppError> {
    git2_op(&app, &state, &id, REFS, move |h| {
        refs::remove_remote(&h.git2.lock(), &name)
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

/// Tags `remote` has right now (`git ls-remote`), each with the commit it
/// points at. A read: no `op_lock`, so it never makes a later mutation report
/// busy, and nothing is streamed to the output dock. A non-zero exit (offline,
/// auth, no such remote) is a `cli` error.
#[tauri::command]
pub async fn remote_tags(
    app: AppHandle,
    state: State<'_, AppState>,
    id: RepoId,
    remote: String,
) -> Result<Vec<RemoteTag>, AppError> {
    let handle = state.repo(&id)?;
    let args = gitops::ls_remote_tags(ref_arg(&remote)?);
    let argv: Vec<&str> = args.iter().map(String::as_str).collect();
    let run = run_git_op(&app, &state, Some(&id), &handle.path, &argv, None, false).await?;
    run.out.check("git ls-remote --tags")?;
    Ok(gitops::parse_ls_remote_tags(&run.out.stdout))
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
    ref_arg(&url)?;
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

#[cfg(test)]
mod tests {
    use super::{is_rebase, opt_ref, pause_message, ref_arg};
    use crate::AppError;
    use git_core::GitError;

    fn argv(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn only_rebasing_argvs_are_checked_for_a_pause() {
        assert!(is_rebase(&argv(&["rebase", "--continue"])));
        assert!(is_rebase(&argv(&[
            "-c",
            "sequence.editor=x",
            "rebase",
            "-i",
            "abc"
        ])));
        assert!(is_rebase(&argv(&["pull", "--progress", "--rebase"])));
        assert!(!is_rebase(&argv(&["pull", "--progress", "--no-rebase"])));
        assert!(!is_rebase(&argv(&["stash", "pop"])));
        assert!(!is_rebase(&argv(&["-c", "x=y"])));
        assert!(!is_rebase(&argv(&[])));
    }

    #[test]
    fn pause_message_finds_the_stop_behind_a_progress_carriage_return() {
        let edit = "Rebasing (1/1)\rStopped at bea0395...  add e\nYou can amend the commit now, with\n\n  git commit --amend \n\nOnce you are satisfied with your changes, run\n\n  git rebase --continue\n";
        assert_eq!(pause_message(edit), "Stopped at bea0395...  add e");
        let exec = "Rebasing (2/3)\rExecuting: false\nwarning: execution failed: false\nYou can fix the problem, and then run\n\n  git rebase --continue\n";
        assert_eq!(pause_message(exec), "warning: execution failed: false");
        assert_eq!(pause_message(""), "The rebase is paused");
    }

    #[test]
    fn a_ref_that_starts_with_a_dash_is_refused_at_the_boundary() {
        for bad in ["--exec=touch$IFS'pwned.txt'", "--upload-pack=sh", "-x", "-"] {
            assert!(
                matches!(ref_arg(bad), Err(AppError::Git(GitError::Refused(_)))),
                "{bad}"
            );
            assert!(opt_ref(Some(bad)).is_err(), "{bad}");
        }
        for ok in [
            "main",
            "origin/x",
            "0123456789abcdef0123456789abcdef01234567",
            "refs/heads/x",
            "origin",
            "HEAD~2",
        ] {
            assert_eq!(ref_arg(ok).unwrap(), ok, "{ok}");
        }
        assert_eq!(opt_ref(None).unwrap(), None);
    }
}
