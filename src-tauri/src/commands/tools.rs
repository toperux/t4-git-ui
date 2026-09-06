use git_core::diff::DiffTarget;
use git_core::tools::{self, Tool, ToolKind};
use git_core::{GitError, RepoId};
use serde::Serialize;
use tauri::State;

use super::repo::blocking;
use crate::{AppError, AppState};

/// Both configured tools, as the Settings dialog and the diff header read them.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tools {
    pub diff: Option<Tool>,
    pub merge: Option<Tool>,
}

/// The tools from the effective git config. No repository: Settings opens from
/// the start screen too, and the tools are app-wide (global config).
#[tauri::command]
pub async fn get_tools() -> Result<Tools, AppError> {
    blocking(move || {
        let cfg = tools::default_config()?;
        Ok(Tools {
            diff: tools::get_tool(&cfg, ToolKind::Diff),
            merge: tools::get_tool(&cfg, ToolKind::Merge),
        })
    })
    .await
}

/// Writes `<kind>.tool` / `<kind>.guitool` and the tool's own entries to the
/// global config; `None` clears the two selectors.
#[tauri::command]
pub async fn set_tool(kind: ToolKind, tool: Option<Tool>) -> Result<(), AppError> {
    blocking(move || {
        let mut cfg = tools::global_config()?;
        tools::set_tool(&mut cfg, kind, tool.as_ref())?;
        Ok(())
    })
    .await
}

/// Path of the first of `rels` (under the install roots) or `names` (on `PATH`)
/// that exists; `None` when the tool isn't installed here.
#[tauri::command]
pub async fn find_tool(names: Vec<String>, rels: Vec<String>) -> Result<Option<String>, AppError> {
    blocking(move || Ok(tools::find_tool(&names, &rels))).await
}

/// Opens one file's two sides in the configured diff tool. Returns the program
/// that was spawned, so the toast can name it.
#[tauri::command]
pub async fn open_diff_tool(
    state: State<'_, AppState>,
    id: RepoId,
    target: DiffTarget,
    path: String,
    old_path: Option<String>,
) -> Result<String, AppError> {
    let handle = state.repo(&id)?;
    blocking(move || {
        let cfg = tools::default_config()?;
        let tool = tools::get_tool(&cfg, ToolKind::Diff).ok_or_else(|| {
            GitError::Config("No diff tool set — pick one in Settings › Diff tool".into())
        })?;
        Ok(tools::open_diff_tool(
            &handle.git2.lock(),
            &target,
            &path,
            old_path.as_deref(),
            &tool,
        )?)
    })
    .await
}
