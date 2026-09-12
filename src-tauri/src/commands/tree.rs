use std::path::PathBuf;

use git_core::blame::{self, Blame};
use git_core::tree::{self, FileContent, TreeListing, TreeTarget};
use git_core::RepoId;
use tauri::State;

use super::repo::blocking;
use crate::{AppError, AppState};

/// Every file of a commit (or of the index + working tree), sorted by path.
/// One call per selection: 47k paths are tens of milliseconds in git2, and the
/// reply carries the tree oid so the frontend can skip the refetch when two
/// commits share a tree.
#[tauri::command]
pub async fn list_tree(
    state: State<'_, AppState>,
    id: RepoId,
    target: TreeTarget,
) -> Result<TreeListing, AppError> {
    let handle = state.repo(&id)?;
    // Its own `Repository`, like the refs read: the working tree's listing
    // stats every index entry, which is too long to hold the shared lock for.
    blocking(move || Ok(tree::list(&handle.open_private()?, &target)?)).await
}

/// One file's content at `target` (binary files come back without text, long
/// ones truncated at the diff's own line cap).
#[tauri::command]
pub async fn read_file(
    state: State<'_, AppState>,
    id: RepoId,
    target: TreeTarget,
    path: String,
) -> Result<FileContent, AppError> {
    let handle = state.repo(&id)?;
    blocking(move || Ok(tree::read(&handle.git2.lock(), &target, &path)?)).await
}

/// Writes the file at `target` to `dest` — the whole blob, not the truncated
/// text the view shows. `dest` comes from the native save dialog; one inside a
/// `.git` directory is refused.
#[tauri::command]
pub async fn save_file_as(
    state: State<'_, AppState>,
    id: RepoId,
    target: TreeTarget,
    path: String,
    dest: PathBuf,
) -> Result<(), AppError> {
    let handle = state.repo(&id)?;
    blocking(move || Ok(tree::save_as(&handle.git2.lock(), &target, &path, &dest)?)).await
}

/// Which commit last touched each line of `path` at `target`
/// (`git blame --porcelain`, streamed and parsed line by line).
///
/// A read: no `op://event` forwarding and no op lock, so it never makes the UI
/// busy. It is still registered as an op, which is what gives its process tree
/// the job handle every other `git` we spawn is killed through; the frontend
/// drops a reply that a newer selection has superseded.
#[tauri::command]
pub async fn get_blame(
    state: State<'_, AppState>,
    id: RepoId,
    target: TreeTarget,
    path: String,
    ignore_whitespace: bool,
) -> Result<Blame, AppError> {
    let handle = state.repo(&id)?;
    let cli = state.git_cli();
    let (op_id, cancel) = state.begin_op();
    let result = blame::blame(
        &cli,
        &handle.path,
        &op_id,
        &target,
        &path,
        ignore_whitespace,
        cancel,
    )
    .await;
    state.end_op(&op_id);
    Ok(result?)
}
