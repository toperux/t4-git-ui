//! Checking GitHub for a newer release, and installing one on request.
//!
//! Wrapping the updater plugin's Rust API in app commands is what keeps
//! `capabilities/default.json` untouched: app-defined commands are not
//! permission-gated the way plugin commands are. The sibling app
//! t4-markdown-viewer wraps it the same way, so the two stay one pattern.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State, Window};
use tauri_plugin_updater::UpdaterExt;

use crate::{AppError, AppState};

const PROGRESS_EVENT: &str = "update://progress";
/// Every successful check's answer, to every window: only the main window
/// checks at launch, and the others would otherwise offer nothing until
/// Check now is pressed in each.
const CHECKED_EVENT: &str = "update://checked";

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

/// The last check's answer, for a window that opens after it came back.
/// `checked` is what tells "nothing newer" from "nobody asked yet".
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateCheck {
    pub checked: bool,
    pub info: Option<UpdateInfo>,
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

/// On Windows the NSIS step kills the whole app: a rebase or a push running in
/// any window would lose its result handling, and git would finish unobserved.
fn refuse_while_busy(state: &AppState) -> Result<(), AppError> {
    if state.op_running() {
        return Err(AppError::Internal(
            "a git operation is still running — let it finish or cancel it, then install".into(),
        ));
    }
    Ok(())
}

/// Holds [`AppState::installing`] for one `install_update`, and lets go on
/// every way out of it but the restart.
#[derive(Debug)]
struct InstallGuard<'a>(&'a AtomicBool);

impl Drop for InstallGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// Each window guards its own Install button; two windows pressing it would
/// otherwise run two downloads and two setups side by side.
fn begin_install(state: &AppState) -> Result<InstallGuard<'_>, AppError> {
    if state.installing.swap(true, Ordering::SeqCst) {
        return Err(AppError::Internal(
            "an update is already being installed from another window".into(),
        ));
    }
    Ok(InstallGuard(&state.installing))
}

const UNREACHABLE: &str = "couldn't reach GitHub — check the connection";
const INTERRUPTED: &str = "the download was interrupted — try again";

/// reqwest's own words ("error decoding response body" for a cut download)
/// describe the library, not the problem. The raw text stays in brackets:
/// it is what a bug report needs.
fn updater_error(e: tauri_plugin_updater::Error, network: &str) -> AppError {
    match e {
        tauri_plugin_updater::Error::Reqwest(inner) => {
            AppError::Internal(format!("{network} ({inner})"))
        }
        e => AppError::Internal(e.to_string()),
    }
}

/// Ask whether a newer version exists. Whether that happens automatically at
/// launch is the frontend's setting, not ours.
#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<UpdateInfo>, AppError> {
    let found = app
        .updater()
        .map_err(|e| AppError::Internal(e.to_string()))?
        .check()
        .await
        .map_err(|e| updater_error(e, UNREACHABLE))?;

    let info = found.map(|update| UpdateInfo {
        version: update.version,
        installable: installable(),
        release_url: release_url(),
    });
    state.set_last_update(info.clone());
    let _ = app.emit(CHECKED_EVENT, &info);
    Ok(info)
}

/// The last check's answer, for a window that opened after it came back.
#[tauri::command]
pub fn last_update_check(state: State<'_, AppState>) -> UpdateCheck {
    state.last_update()
}

/// Download the update, install it, and restart into it. Does not return: the
/// process is replaced either by `restart` below or, on Windows, by the NSIS
/// step terminating the app as part of installing.
///
/// The `Update` handle is fetched again rather than parked in `AppState`: it is
/// one small request, and it keeps a type from a plugin's internals out of this
/// app's shared state.
#[tauri::command]
pub async fn install_update(app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    // Refused here rather than in the caller: without this, a deb or rpm
    // install downloads the whole artifact only to fail inside `install`.
    if !installable() {
        return Err(AppError::Internal(
            "this install cannot update itself: a deb or rpm belongs to the package manager, \
             so install the new version from the releases page"
                .into(),
        ));
    }
    let _installing = begin_install(&state)?;
    refuse_while_busy(&state)?;

    let update = app
        .updater()
        .map_err(|e| AppError::Internal(e.to_string()))?
        .check()
        .await
        .map_err(|e| updater_error(e, UNREACHABLE))?
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
        .map_err(|e| updater_error(e, INTERRUPTED))?;

    // Again: the download is long enough for a push to have started meanwhile.
    refuse_while_busy(&state)?;

    update
        .install(bytes)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    app.restart()
}

/// A window reports the repositories it holds a typed commit message for,
/// whenever that list changes, so Install can ask before the restart.
#[tauri::command]
pub fn set_commit_drafts(window: Window, state: State<'_, AppState>, repos: Vec<String>) {
    state.set_drafts(window.label(), repos);
}

/// Every window's reported drafts.
#[tauri::command]
pub fn commit_drafts(state: State<'_, AppState>) -> Vec<String> {
    state.drafts()
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

    /// The helper only: that `install_update` asks it (twice) needs an `AppHandle`,
    /// and a published update to install.
    #[test]
    fn install_is_refused_while_an_operation_runs() {
        let state = AppState::default();
        assert!(refuse_while_busy(&state).is_ok());
        let (id, _cancel) = state.begin_op();
        let refused = refuse_while_busy(&state).unwrap_err().to_string();
        assert!(refused.contains("still running"), "{refused}");
        state.end_op(&id);
        assert!(refuse_while_busy(&state).is_ok());
    }

    /// Only a network failure is reworded: the rest (a bad signature, a manifest
    /// without this platform) already say what is wrong, in their own words.
    #[test]
    fn only_network_failures_are_reworded() {
        let e = updater_error(tauri_plugin_updater::Error::ReleaseNotFound, "NETWORK").to_string();
        assert!(e.contains("Could not fetch a valid release JSON"), "{e}");
        assert!(!e.contains("NETWORK"), "{e}");
    }

    /// Nothing is known until a check comes back; after that, a window that
    /// opens later is told the answer, a "nothing newer" included.
    #[test]
    fn the_last_answer_is_kept_for_windows_that_open_later() {
        let state = AppState::default();
        assert!(!state.last_update().checked);
        state.set_last_update(None);
        let kept = state.last_update();
        assert!(kept.checked && kept.info.is_none());
    }

    /// One install at a time across windows, and a failed one lets the next in.
    #[test]
    fn a_second_install_is_refused_while_one_runs() {
        let state = AppState::default();
        let first = begin_install(&state).expect("the first install starts");
        let refused = begin_install(&state).expect_err("a second is refused");
        assert!(refused.to_string().contains("already"), "{refused}");
        drop(first);
        assert!(begin_install(&state).is_ok());
    }

    /// Each window's report replaces its last one, an empty report clears it,
    /// and Install sees them all.
    #[test]
    fn drafts_are_kept_per_window() {
        let state = AppState::default();
        state.set_drafts("main", vec!["web".into(), "api".into()]);
        state.set_drafts("w1", vec!["docs".into()]);
        assert_eq!(state.drafts(), ["api", "docs", "web"]);
        state.set_drafts("main", Vec::new());
        assert_eq!(state.drafts(), ["docs"]);
    }
}
