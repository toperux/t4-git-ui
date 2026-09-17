//! Windows and their tabs: creating a second window, bringing one forward, the
//! layout every window reports so the next launch can put them all back, and
//! the screen-space hit test a tab dragged between windows is steered by.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use git_core::RepoId;
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindowBuilder, Window,
};

use crate::AppState;

/// What one window has open: repository paths in tab order, and the active one.
/// The same shape travels three ways — parked for a window being created
/// (`pending`), reported by a live one (`set_layout`), and written to disk.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Layout {
    pub tabs: Vec<String>,
    pub active: String,
}

const LAYOUT_FILE: &str = "layout.json";

/// The window sizes `tauri.conf.json` gives `main`; a spawned window has no
/// entry there, so the floor is repeated rather than left at the OS default.
const MIN_W: f64 = 700.0;
const MIN_H: f64 = 500.0;

/// Brings `label` forward: the window that already has a repository open
/// ([`super::repo::open_repo`]) rather than opening it twice.
pub fn focus_window(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Creates a window showing `payload`'s tabs, at `placement` (a physical screen
/// point for its top-left) or wherever the OS puts it. Returns its label.
///
/// The build runs on a worker thread on purpose: `build()` waits on the event
/// loop to construct the webview, and this command already runs *on* that loop,
/// so building inline deadlocks the app. Reserving the label and parking the
/// payload happens first and synchronously, so the new window's `take_pending`
/// cannot race it.
#[tauri::command]
pub fn spawn_window(
    app: AppHandle,
    window: Window,
    payload: Layout,
    placement: Option<(f64, f64)>,
) -> String {
    let state = app.state::<AppState>();
    let label = state.next_window_label();
    state.pending().insert(label.clone(), payload.clone());

    // Logical, not physical: the builder's size is in CSS pixels, and main may
    // be on a scaled monitor.
    let size = app.get_webview_window("main").and_then(|w| {
        let s = w.inner_size().ok()?;
        let scale = w.scale_factor().unwrap_or(1.0);
        Some((s.width as f64 / scale, s.height as f64 / scale))
    });
    let source = window.label().to_string();
    let target = label.clone();
    std::thread::spawn(move || {
        let mut builder =
            WebviewWindowBuilder::new(&app, &target, WebviewUrl::App("index.html".into()))
                .title(crate::APP_TITLE)
                .min_inner_size(MIN_W, MIN_H)
                .visible(false);
        if let Some((w, h)) = size {
            builder = builder.inner_size(w, h);
        }
        match builder.build() {
            Ok(win) => {
                if let Some((x, y)) = placement {
                    let _ =
                        win.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
                }
                crate::show_with_theme(&app, &win);
            }
            Err(e) => {
                tracing::warn!(label = %target, error = %e, "window failed to open");
                let state = app.state::<AppState>();
                state.pending().remove(&target);
                // Give the tabs back to the window that let them go, or they are
                // lost — every one of them, not just the active one.
                let _ = app.emit_to(
                    &source,
                    "tab-spawn-failed",
                    serde_json::json!({ "paths": payload.tabs }),
                );
            }
        }
    });
    label
}

/// Hands this window whatever it was created to open. Consumed on first call;
/// `None` in the main window, which reads [`take_layout`] instead.
#[tauri::command]
pub fn take_pending(state: State<'_, AppState>, window: Window) -> Option<Layout> {
    state.pending().remove(window.label())
}

/// What this window has open now. Written out on every change, so the file is
/// current whichever way the app goes away (the last window closing, a quit, a
/// crash).
#[tauri::command]
pub fn set_layout(app: AppHandle, window: Window, layout: Layout) {
    let state = app.state::<AppState>();
    let mut layouts = state.layouts();
    layouts.insert(window.label().to_string(), layout);
    write_layouts(&layout_file(&app), &layouts);
}

/// The layout the last exit left, consumed: `main` opens the first entry itself
/// and spawns a window for each of the others, and nothing may restore them
/// twice. Empty on a first launch — the frontend falls back to `lastOpen` then.
#[tauri::command]
pub fn take_layout(app: AppHandle) -> Vec<Layout> {
    take_layouts(&layout_file(&app))
}

/// Quits the app rather than closing one window: every window goes at once, so
/// `RunEvent::ExitRequested` raises [`AppState::exiting`] before any of them is
/// destroyed, so every window is still in the map and the file keeps them all.
/// Closing them one by one usually comes back to the same place, the file being
/// written by no window's close — but a window closed *before* another one
/// changes a tab is gone from the write that change makes. Quit is the one that
/// keeps a session whatever happened before it.
#[tauri::command]
pub fn quit(app: AppHandle) {
    app.exit(0);
}

// ---- dragging a tab between windows ----

/// Where this window's content starts on the virtual screen, and its scale, so
/// the frontend can turn a pointer position into a screen point Rust can
/// hit-test.
#[derive(Debug, Clone, Serialize)]
pub struct Origin {
    x: f64,
    y: f64,
    scale: f64,
    /// False when the compositor will not say where the window is (Wayland):
    /// the frontend falls back to the pointer's own screen coordinates, which
    /// place a torn-off window but cannot find another one.
    exact: bool,
}

#[tauri::command]
pub fn window_origin(window: Window) -> Origin {
    let scale = window.scale_factor().unwrap_or(1.0);
    match window.inner_position() {
        Ok(pos) => Origin {
            x: pos.x as f64,
            y: pos.y as f64,
            scale,
            exact: true,
        },
        Err(_) => Origin {
            x: 0.0,
            y: 0.0,
            scale,
            exact: false,
        },
    }
}

/// The top-level window the compositor draws at a physical screen point, or
/// null. `WindowFromPoint` answers with the deepest child — the WebView2
/// surface — so this walks back up to the frame Tauri owns.
#[cfg(windows)]
fn hwnd_at(x: f64, y: f64) -> isize {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetAncestor, WindowFromPoint, GA_ROOT};

    let point = POINT {
        x: x.round() as i32,
        y: y.round() as i32,
    };
    unsafe {
        let hit = WindowFromPoint(point);
        if hit.is_null() {
            return 0;
        }
        GetAncestor(hit, GA_ROOT) as isize
    }
}

/// The app window a physical screen point lands on, plus that point in the
/// window's own CSS pixels.
///
/// A true z-order test rather than a scan of window rectangles: the answer has
/// to be the window the user can actually *see* at the cursor. It can name the
/// dragging window itself; the callers filter that out, since releasing over
/// your own window tears the tab off.
///
/// ponytail: Windows only. macOS and X11 could answer this natively, but
/// Wayland deliberately hides the global pointer position, so there is no
/// answer that holds everywhere — elsewhere this is `None`, tear-off still
/// works (at the OS's own placement) and adoption does not.
#[cfg(windows)]
fn window_at(app: &AppHandle, x: f64, y: f64) -> Option<(String, f64, f64)> {
    let target = hwnd_at(x, y);
    if target == 0 {
        return None;
    }
    for (label, w) in app.webview_windows() {
        let Ok(handle) = w.hwnd() else { continue };
        if handle.0 as isize != target {
            continue;
        }
        let Ok(pos) = w.inner_position() else {
            continue;
        };
        let scale = w.scale_factor().unwrap_or(1.0);
        return Some((
            label,
            (x - pos.x as f64) / scale,
            (y - pos.y as f64) / scale,
        ));
    }
    None
}

#[cfg(not(windows))]
fn window_at(_app: &AppHandle, _x: f64, _y: f64) -> Option<(String, f64, f64)> {
    None
}

/// Takes the drop caret off whichever window was showing one.
fn clear_drag(app: &AppHandle, state: &AppState) {
    if let Some(prev) = state.drag_target().take() {
        let _ = app.emit_to(&prev, "tab-drag-out", ());
    }
}

/// Follows a detached tab drag: answers with the window under the cursor, and
/// tells that window where to draw its drop caret.
#[tauri::command]
pub fn drag_over(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
    x: f64,
    y: f64,
) -> Option<String> {
    // Hovering your own window is not a drop target: releasing there tears off.
    let hit = window_at(&app, x, y).filter(|(label, _, _)| label != window.label());
    let next = hit.as_ref().map(|(label, _, _)| label.clone());

    {
        let mut current = state.drag_target();
        if current.as_deref() != next.as_deref() {
            if let Some(prev) = current.take() {
                let _ = app.emit_to(&prev, "tab-drag-out", ());
            }
        }
        current.clone_from(&next);
    }

    if let Some((label, lx, ly)) = hit {
        let _ = app.emit_to(
            &label,
            "tab-drag-over",
            serde_json::json!({ "x": lx, "y": ly }),
        );
    }
    next
}

#[tauri::command]
pub fn drag_cancel(app: AppHandle, state: State<'_, AppState>) {
    clear_drag(&app, &state);
}

/// Releases a tab dragged to a physical screen point: over another window it is
/// `adopted` there, over anything else it is `spawned` into a window of its own
/// — unless `tear_off` is false, when there is nowhere for it to go (`none`) and
/// the source keeps it. The caller drops its own tab on the first two.
#[tauri::command]
pub fn drop_tab(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
    x: f64,
    y: f64,
    path: String,
    tear_off: bool,
) -> &'static str {
    clear_drag(&app, &state);
    let source = window.label().to_string();

    match window_at(&app, x, y).filter(|(label, _, _)| *label != source) {
        Some((label, lx, _)) => {
            // The holder moves here, before the target hears about the tab: the handle and its
            // watcher have to stay alive across the hop, or the source's `close_repo` drops them
            // between the two windows and the target reopens the repository from scratch.
            let (id, _) = RepoId::from_workdir(Path::new(&path));
            state.hold(&label, &id);
            state.unhold(&source, &id);
            let _ = app.emit_to(
                &label,
                "tab-adopt",
                serde_json::json!({ "path": path, "x": lx }),
            );
            focus_window(&app, &label);
            "adopted"
        }
        None if !tear_off => "none",
        None => {
            // The step back that puts the cursor on the new window's tab strip is in CSS pixels
            // and `x`/`y` are physical: on a 150% display an unscaled one lands two thirds of the
            // way there.
            let scale = window.scale_factor().unwrap_or(1.0);
            let payload = Layout {
                tabs: vec![path.clone()],
                active: path,
            };
            spawn_window(
                app.clone(),
                window,
                payload,
                Some((x - 140.0 * scale, y - 24.0 * scale)),
            );
            "spawned"
        }
    }
}

pub(crate) fn layout_file(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(LAYOUT_FILE)
}

/// Writes the windows that have something open, `main` first: on a relaunch the
/// first entry is the main window's, so whichever window outlived the others
/// becomes it.
pub(crate) fn write_layouts(path: &Path, layouts: &HashMap<String, Layout>) {
    let mut entries: Vec<(&str, &Layout)> = layouts
        .iter()
        .filter(|(_, l)| !l.tabs.is_empty())
        .map(|(label, l)| (label.as_str(), l))
        .collect();
    entries.sort_by_key(|(label, _)| (*label != "main", *label));
    let list: Vec<&Layout> = entries.into_iter().map(|(_, l)| l).collect();

    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let text = serde_json::to_string(&list).unwrap_or_else(|_| "[]".into());
    if let Err(e) = std::fs::write(path, text) {
        tracing::warn!(path = %path.display(), error = %e, "could not write the window layout");
    }
}

/// Reads and clears the layout file. A corrupt or missing one restores nothing.
pub(crate) fn take_layouts(path: &Path) -> Vec<Layout> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    let _ = std::fs::remove_file(path);
    serde_json::from_str(&text).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn layout(tabs: &[&str]) -> Layout {
        Layout {
            tabs: tabs.iter().map(|s| (*s).to_string()).collect(),
            active: tabs[0].to_string(),
        }
    }

    fn temp_path(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!("t4-layout-{tag}-{}.json", std::process::id()))
    }

    /// The round trip the relaunch depends on: `main` first whatever the map's
    /// order, windows with no tabs left out, and the file consumed once.
    #[test]
    fn layouts_round_trip_main_first_and_are_taken_once() {
        let path = temp_path("round");
        let mut map = HashMap::new();
        map.insert("w1".to_string(), layout(&["c:/b"]));
        map.insert("main".to_string(), layout(&["c:/a", "c:/c"]));
        map.insert("w2".to_string(), Layout::default());
        write_layouts(&path, &map);

        assert_eq!(
            take_layouts(&path),
            vec![layout(&["c:/a", "c:/c"]), layout(&["c:/b"])]
        );
        assert_eq!(take_layouts(&path), Vec::<Layout>::new());
        assert!(!path.exists());
    }

    /// A window closed after the main one becomes `main` on the next launch, so
    /// a map without a `main` entry still restores.
    #[test]
    fn a_secondary_window_alone_is_the_first_entry() {
        let path = temp_path("secondary");
        let mut map = HashMap::new();
        map.insert("w1".to_string(), layout(&["c:/b"]));
        write_layouts(&path, &map);
        assert_eq!(take_layouts(&path), vec![layout(&["c:/b"])]);
    }
}
