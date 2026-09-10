//! Checking GitHub for a newer release, and installing one on request.
//!
//! Wrapping the updater plugin's Rust API in app commands is what keeps
//! `capabilities/default.json` untouched: app-defined commands are not
//! permission-gated the way plugin commands are. The sibling app
//! t4-markdown-viewer wraps it the same way, so the two stay one pattern.

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

use crate::AppError;

const PROGRESS_EVENT: &str = "update://progress";

/// What the frontend needs to describe an available release.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    /// False when this build cannot replace itself: a deb or rpm install is
    /// the package manager's business, and asking the plugin to update one
    /// only produces a failure further along.
    installable: bool,
    /// Where to send someone whose install cannot update itself, and where the
    /// real release notes live. `latest.json` is generated before the GitHub
    /// release exists, so the manifest can carry a link but never the body.
    release_url: String,
}

/// Only an AppImage can rewrite itself in place. The plugin sets `APPIMAGE`
/// nowhere — the AppImage runtime does — so its absence on Linux means this is
/// a deb or rpm install.
fn installable() -> bool {
    if cfg!(target_os = "linux") {
        std::env::var_os("APPIMAGE").is_some()
    } else {
        true
    }
}

fn release_url() -> String {
    format!("{}/releases/latest", env!("CARGO_PKG_REPOSITORY"))
}

/// Ask whether a newer version exists. Whether that happens automatically at
/// launch is the frontend's setting, not ours.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, AppError> {
    let found = app
        .updater()
        .map_err(|e| AppError::Internal(e.to_string()))?
        .check()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(found.map(|update| UpdateInfo {
        version: update.version,
        installable: installable(),
        release_url: release_url(),
    }))
}

/// Download the update, install it, and restart into it. Does not return: the
/// process is replaced either by `restart` below or, on Windows, by the NSIS
/// step terminating the app as part of installing.
///
/// The `Update` handle is fetched again rather than parked in `AppState`: it is
/// one small request, and it keeps a type from a plugin's internals out of this
/// app's shared state.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), AppError> {
    // Refused here rather than in the caller: without this, a deb or rpm
    // install downloads the whole artifact only to fail inside `install`.
    if !installable() {
        return Err(AppError::Internal(
            "this install cannot update itself: a deb or rpm belongs to the package manager, \
             so install the new version from the releases page"
                .into(),
        ));
    }

    let update = app
        .updater()
        .map_err(|e| AppError::Internal(e.to_string()))?
        .check()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or_else(|| AppError::Internal("there is no update to install".into()))?;

    let progress_app = app.clone();
    let done_app = app.clone();
    let mut done = 0u64;
    // The percentage last sent; `u64::MAX` stands for "nothing sent yet", so
    // the first chunk always emits — including the null that puts the bar in
    // its indeterminate state.
    let mut last = Some(u64::MAX);

    let bytes = update
        .download(
            move |chunk, total| {
                done += chunk as u64;
                // A manifest without a content length gives no percentage;
                // null tells the frontend to show an indeterminate state.
                let percent = total.map(|t| (done * 100 / t.max(1)).min(100));
                // One event per chunk is thousands of them for a 60 MB
                // installer, all carrying one of 101 values.
                if percent != last {
                    last = percent;
                    let _ = progress_app.emit(PROGRESS_EVENT, percent);
                }
            },
            move || {
                let _ = done_app.emit(PROGRESS_EVENT, Some(100u64));
            },
        )
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    update
        .install(bytes)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    app.restart()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The link the frontend opens for deb/rpm installs is built from the
    /// manifest, so a typo here would ship a dead button.
    #[test]
    fn release_url_points_at_the_releases_page() {
        assert_eq!(
            release_url(),
            "https://github.com/toperux/t4-git-ui/releases/latest"
        );
    }

    /// Every platform but Linux can replace itself; on Linux it depends on how
    /// the app was installed. Also the guard `install_update` refuses on.
    #[test]
    fn installable_everywhere_except_a_packaged_linux_install() {
        if cfg!(target_os = "linux") {
            assert_eq!(installable(), std::env::var_os("APPIMAGE").is_some());
        } else {
            assert!(installable());
        }
    }
}
