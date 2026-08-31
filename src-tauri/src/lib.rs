mod commands;
mod error;
mod state;

pub use error::AppError;
pub use state::AppState;

use tauri::Manager;
use tracing_subscriber::EnvFilter;

/// Keeps the non-blocking file writer alive for the lifetime of the app.
struct LogGuard(#[allow(dead_code)] tracing_appender::non_blocking::WorkerGuard);

/// Debug builds log to stderr; release builds log to a daily-rolling file under the app log dir.
/// Never fails: if the log file can't be set up, falls back to stderr so the app still launches.
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
            app.manage(LogGuard(guard));
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

/// Match the native window background to the OS theme before first paint so a
/// light-theme user doesn't see a dark flash (config default is the dark `--bg-app`).
fn init_window_background(app: &tauri::App) {
    use tauri::window::Color;
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    if let Ok(tauri::Theme::Light) = win.theme() {
        // --bg-app (light) = #f4f5f7
        let _ = win.set_background_color(Some(Color(0xf4, 0xf5, 0xf7, 0xff)));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState::default())
        .setup(|app| {
            init_logging(app);
            init_window_background(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::ping,
            commands::app::probe_git
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
