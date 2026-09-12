use std::path::PathBuf;

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
