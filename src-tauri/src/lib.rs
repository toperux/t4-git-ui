mod commands;
mod error;
mod state;

pub use error::AppError;
pub use state::AppState;

use std::sync::Mutex;

use tauri::{Manager, RunEvent};
use tauri_plugin_window_state::StateFlags;
use tracing_subscriber::EnvFilter;

/// Keeps the non-blocking file writer alive for the lifetime of the app.
/// Taken and dropped on `RunEvent::Exit` so buffered lines are flushed before
/// Tauri calls `process::exit` (which would skip the drop otherwise).
struct LogGuard(Mutex<Option<tracing_appender::non_blocking::WorkerGuard>>);

/// Debug builds log to stderr; release builds log to a daily-rolling file under the app log dir.
/// Never fails: if the log file can't be set up, falls back to stderr so the app still launches.
/// `.init()` also installs the `log` → `tracing` bridge (`tracing-subscriber`'s
/// default `tracing-log` feature), so plugin/library `log` records land in the same sink.
fn init_logging(app: &tauri::App) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    let file_target = if cfg!(debug_assertions) {
        None
    } else {
        app.path()
            .app_log_dir()
            .ok()
            .and_then(|dir| std::fs::create_dir_all(&dir).ok().map(|_| dir))
    };

    match file_target {
        Some(dir) => {
            let (writer, guard) = tracing_appender::non_blocking(tracing_appender::rolling::daily(
                &dir,
                "t4-git-ui.log",
            ));
            tracing_subscriber::fmt()
                .with_env_filter(filter)
                .with_ansi(false)
                .with_writer(writer)
                .init();
            app.manage(LogGuard(Mutex::new(Some(guard))));
            tracing::info!(dir = %dir.display(), "logging to file");
        }
        None => {
            tracing_subscriber::fmt()
                .with_env_filter(filter)
                .with_writer(std::io::stderr)
                .init();
            if !cfg!(debug_assertions) {
                tracing::warn!("could not set up log file; logging to stderr");
            }
        }
    }
}

/// Flushes the file logger (see [`LogGuard`]).
fn shutdown_logging(app: &tauri::AppHandle) {
    if let Some(guard) = app.try_state::<LogGuard>() {
        let taken = guard.0.lock().unwrap_or_else(|p| p.into_inner()).take();
        drop(taken);
    }
}

/// Match the native window background to the OS theme before first paint so a
/// light-theme user doesn't see a dark flash (the window starts hidden, see
/// `visible: false` in `tauri.conf.json`, and is shown once the color is set).
fn init_window_background(app: &tauri::App) {
    use tauri::window::Color;
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    // --bg-app: light #e0e3e8, dark #16181d
    let color = match win.theme() {
        Ok(tauri::Theme::Light) => Color(0xe0, 0xe3, 0xe8, 0xff),
        _ => Color(0x16, 0x18, 0x1d, 0xff),
    };
    if let Err(e) = win.set_background_color(Some(color)) {
        tracing::warn!(error = %e, "failed to set window background color");
    }
    if let Err(e) = win.show() {
        tracing::warn!(error = %e, "failed to show main window");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        // Don't let window-state re-show the window before `init_window_background` runs
        // (the window starts hidden; a restored VISIBLE flag would cause a theme flash).
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState::default())
        .setup(|app| {
            init_logging(app);
            init_window_background(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::ping,
            commands::app::probe_git,
            commands::repo::open_repo,
            commands::repo::close_repo,
            commands::repo::get_refs,
            commands::repo::get_commit,
            commands::repo::start_log,
            commands::repo::get_log_page,
            commands::repo::refresh_labels,
            commands::diff::get_commit_files,
            commands::diff::get_changed_files,
            commands::diff::get_file_diff,
            commands::diff::open_merge_editor,
            commands::diff::get_status,
            commands::stage::stage_paths,
            commands::stage::unstage_paths,
            commands::stage::discard_paths,
            commands::stage::recreate_conflict,
            commands::stage::stage_hunks,
            commands::stage::stage_lines,
            commands::stage::commit,
            commands::stage::get_head_message,
            commands::stage::get_author,
            commands::stage::cancel_op,
            commands::ops::fetch,
            commands::ops::pull,
            commands::ops::push,
            commands::ops::merge,
            commands::ops::rebase,
            commands::ops::rebase_continue,
            commands::ops::rebase_abort,
            commands::ops::merge_abort,
            commands::ops::checkout,
            commands::ops::stash_push,
            commands::ops::stash_apply,
            commands::ops::stash_pop,
            commands::ops::stash_drop,
            commands::ops::delete_remote_branch,
            commands::ops::create_branch,
            commands::ops::delete_branch,
            commands::ops::rename_branch,
            commands::ops::create_tag,
            commands::ops::delete_tag,
            commands::ops::get_config,
            commands::ops::set_config,
            commands::ops::get_default_remote,
            commands::ops::clone_repo,
            commands::ops::init_repo
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                shutdown_logging(app);
            }
        });
}
