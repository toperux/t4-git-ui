mod commands;
mod error;
mod state;

pub use error::AppError;
pub use state::AppState;

use std::sync::atomic::Ordering;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tauri_plugin_store::StoreExt;
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

/// The kv store `src/lib/kv.ts` writes (app_data_dir); the theme toggle
/// mirrors its preference there because Rust can't read the WebView's
/// localStorage.
const KV_STORE: &str = "recents.json";

/// Window title before a repository is open; `useWindowTitle` owns it after that.
pub(crate) const APP_TITLE: &str = "T4 Git UI";

fn init_window_background(app: &tauri::App) {
    if let Some(win) = app.get_webview_window("main") {
        show_with_theme(&app.handle().clone(), &win);
    }
}

/// Match the native window background to the theme before first paint so a
/// light-theme user doesn't see a dark flash (a window starts hidden, see
/// `visible: false` in `tauri.conf.json` and in `spawn_window`, and is shown
/// once the color is set). The stored preference wins, as in `index.html`; else
/// the OS theme.
pub(crate) fn show_with_theme(app: &AppHandle, win: &tauri::WebviewWindow) {
    use tauri::window::Color;
    // Missing / unreadable store or no preference: follow the OS.
    let stored = app
        .store(KV_STORE)
        .ok()
        .and_then(|s| s.get("theme"))
        .and_then(|v| v.as_str().map(String::from));
    let light = match stored.as_deref() {
        Some("light") => true,
        Some("dark") => false,
        _ => matches!(win.theme(), Ok(tauri::Theme::Light)),
    };
    // --bg-app: light #bcbec2, dark #16181d (index.html paints the same two)
    let color = if light {
        Color(0xbc, 0xbe, 0xc2, 0xff)
    } else {
        Color(0x16, 0x18, 0x1d, 0xff)
    };
    if let Err(e) = win.set_background_color(Some(color)) {
        tracing::warn!(error = %e, "failed to set window background color");
    }
    if let Err(e) = win.show() {
        tracing::warn!(label = win.label(), error = %e, "failed to show the window");
    }
}

/// A window has gone: it takes its tabs' claims on the open repositories with
/// it (so a closed or crashed window never leaks a handle or a watcher), and
/// its layout entry moves to the closed chain, which the file keeps for a
/// grace ([`commands::window::window_closed`]) — unless the app is quitting,
/// when every window is being closed and the map keeps them all.
fn on_window_destroyed(app: &AppHandle, label: &str) {
    let state = app.state::<AppState>();
    state.pending().remove(label);
    for id in state.release_all(label) {
        commands::repo::drop_repo(&state, &id);
    }
    if state.exiting.load(Ordering::Relaxed) {
        return;
    }
    commands::window::window_closed(app, label);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        // Don't let window-state re-show the window before `init_window_background` runs
        // (the window starts hidden; a restored VISIBLE flag would cause a theme flash).
        // `main` only: the plugin restores a frame on *creation*, which would
        // snap a torn-off window to wherever that label last stood instead of
        // leaving it where `spawn_window` put it.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .with_filter(|label| label == "main")
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .setup(|app| {
            init_logging(app);
            init_window_background(app);
            // The sides of every conflict and diff ever opened in an external
            // tool; no tool of ours can still have them open this early.
            tauri::async_runtime::spawn_blocking(|| {
                if let Err(e) = git_core::conflict::clean_merge_temp() {
                    tracing::warn!(error = %e, "could not clean the merge-editor temp dir");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::probe_git,
            commands::app::set_git_path,
            commands::update::check_for_update,
            commands::update::install_update,
            commands::window::spawn_window,
            commands::window::take_pending,
            commands::window::set_layout,
            commands::window::take_layout,
            commands::window::quit,
            commands::window::window_origin,
            commands::window::drag_over,
            commands::window::drag_cancel,
            commands::window::drop_tab,
            commands::repo::open_repo,
            commands::repo::close_repo,
            commands::repo::get_refs,
            commands::repo::get_linked,
            commands::repo::get_commit,
            commands::repo::start_log,
            commands::repo::get_log_page,
            commands::repo::find_log_row,
            commands::repo::refresh_labels,
            commands::repo::open_path,
            commands::diff::get_changed_files,
            commands::diff::get_file_diff,
            commands::diff::open_merge_editor,
            commands::diff::get_status,
            commands::tools::get_tools,
            commands::tools::set_tool,
            commands::tools::find_tool,
            commands::tools::open_diff_tool,
            commands::tree::list_tree,
            commands::tree::read_file,
            commands::tree::save_file_as,
            commands::tree::get_blame,
            commands::stage::stage_paths,
            commands::stage::unstage_paths,
            commands::stage::discard_paths,
            commands::stage::recreate_conflict,
            commands::stage::resolve_conflict,
            commands::stage::stage_hunks,
            commands::stage::stage_lines,
            commands::stage::discard_hunks,
            commands::stage::discard_lines,
            commands::stage::commit,
            commands::stage::get_head_message,
            commands::stage::get_merge_message,
            commands::stage::get_author,
            commands::stage::cancel_op,
            commands::ops::fetch,
            commands::ops::pull,
            commands::ops::push,
            commands::ops::merge,
            commands::ops::rebase,
            commands::ops::rebase_continue,
            commands::ops::rebase_abort,
            commands::ops::rebase_skip,
            commands::ops::rebase_todo,
            commands::ops::rebase_interactive,
            commands::ops::merge_abort,
            commands::ops::cherry_pick,
            commands::ops::revert,
            commands::ops::cherry_pick_abort,
            commands::ops::revert_abort,
            commands::ops::bisect_mark,
            commands::ops::bisect_reset,
            commands::ops::checkout,
            commands::ops::reset,
            commands::ops::reset_branch,
            commands::ops::stash_push,
            commands::ops::stash_apply,
            commands::ops::stash_pop,
            commands::ops::stash_drop,
            commands::ops::stash_clear,
            commands::ops::delete_remote_branch,
            commands::ops::run_git,
            commands::ops::create_branch,
            commands::ops::delete_branch,
            commands::ops::rename_branch,
            commands::ops::add_remote,
            commands::ops::worktree_add,
            commands::ops::worktree_remove,
            commands::ops::worktree_prune,
            commands::ops::worktree_lock,
            commands::ops::worktree_unlock,
            commands::ops::submodule_update,
            commands::ops::rename_remote,
            commands::ops::set_remote_url,
            commands::ops::remove_remote,
            commands::ops::create_tag,
            commands::ops::delete_tag,
            commands::ops::get_config,
            commands::ops::set_config,
            commands::ops::get_signing,
            commands::ops::set_signing,
            commands::ops::get_default_remote,
            commands::ops::remote_tags,
            commands::ops::clone_repo,
            commands::ops::init_repo
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                on_window_destroyed(&window.app_handle().clone(), window.label());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            // Quitting with windows still open: they are all to come back, so
            // their `Destroyed` events must not take them off the layout.
            RunEvent::ExitRequested { .. } => app
                .state::<AppState>()
                .exiting
                .store(true, Ordering::Relaxed),
            RunEvent::Exit => shutdown_logging(app),
            _ => {}
        });
}
