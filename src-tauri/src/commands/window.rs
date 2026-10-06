//! Windows and their tabs: creating a second window, bringing one forward, the
//! layout every window reports so the next launch can put them all back, and
//! the screen-space hit test a tab dragged between windows is steered by.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use git_core::RepoId;
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, State, WebviewUrl,
    WebviewWindowBuilder, Window,
};

use crate::AppState;

/// What one window has open: repository paths in tab order, and the active one.
/// The same shape travels three ways — parked for a window being created
/// (`pending`), reported by a live one (`set_layout`), and written to disk.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Layout {
    pub tabs: Vec<String>,
    pub active: String,
    /// Where a secondary window stood ([`record`]); `main` never has one (window-state places
    /// it). Left out of the file when `None`, and missing from an older one, which reads as
    /// `None`: an older app reads a newer file as before.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rect: Option<Rect>,
}

/// A secondary window's restored (not maximized) frame: its outer top-left in the units a
/// [`Screen`] moves in (physical on Windows, logical elsewhere), its inner size in logical
/// pixels (as [`place`] builds it), and whether it was maximized over it.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: f64,
    pub height: f64,
    pub maximized: bool,
}

const LAYOUT_FILE: &str = "layout.json";

/// How long a closed window keeps its place in the file — the gap allowed
/// between two closes, not the time a whole close-all may take, since each
/// close restarts the clock for the ones before it. Long enough that a
/// close-all one window at a time, or a crash right after a close, still comes
/// back whole; short enough that a window closed and left closed is forgotten
/// while the app is still running.
const CLOSE_GRACE: Duration = Duration::from_secs(4);

/// What the app has open: the live windows, and the ones closed inside the
/// last [`CLOSE_GRACE`] — a chain, since each close keeps the ones before it
/// alive (see [`restorable`]).
#[derive(Debug, Default)]
pub struct Layouts {
    pub open: HashMap<String, Layout>,
    pub closed: Vec<(Instant, String, Layout)>,
    /// Whether `main` has taken the file yet ([`take`]). Until then nothing is
    /// written: nothing may overwrite a session nobody has read. Only [`take`]
    /// sets it — a second launch during startup, or a tab adopted by `main`
    /// while it still says *Starting*, would otherwise write over the saved
    /// session before `main` took it.
    pub read: bool,
    /// The windows of this launch's restore that have not reported back yet
    /// ([`settle`]); `None` once the restore is over. While it is `Some`, the
    /// mark file next to `layout.json` says so on disk — a launch that finds
    /// the mark knows the one before it died restoring ([`take`]).
    pub awaiting: Option<HashSet<String>>,
}

/// What `layout.json` should say at `now`: the open windows plus the closed
/// chain, which expires as a whole once its *last* close is more than a grace
/// old. Every write goes through this, so the file is always "what should come
/// back", whichever way the app ends.
///
/// The chain only expires while some open window has a tab. With nothing open
/// anywhere, closing the last thing leaves the waiting session alone: a window
/// closed while `main` sits on the start screen comes back, rather than the
/// next launch starting from nothing. No window at all is the same case, and
/// the one that matters most — the app on its way out, where a slow exit (more
/// than a grace between the last `Destroyed` and the process ending) would
/// otherwise let a timer write an empty file.
fn restorable(l: &mut Layouts, now: Instant) -> HashMap<String, Layout> {
    expire(l, now);
    let mut out = l.open.clone();
    out.extend(
        l.closed
            .iter()
            .map(|(_, label, layout)| (label.clone(), layout.clone())),
    );
    out
}

/// Writes what should come back at `now`, once the saved session has been read
/// (see [`Layouts::read`]). The chain expires either way, so the state in
/// memory is the same whether the write happens or not.
fn persist(l: &mut Layouts, path: &Path, now: Instant) {
    let list = restorable(l, now);
    if l.read {
        write_layouts(path, &list);
    }
}

/// Drops a chain whose last close is more than a grace old — see [`restorable`]
/// for when it is kept regardless.
fn expire(l: &mut Layouts, now: Instant) {
    let something_open = l.open.values().any(|layout| !layout.tabs.is_empty());
    let old = l
        .closed
        .last()
        .is_some_and(|(t, _, _)| now.duration_since(*t) > CLOSE_GRACE);
    if something_open && old {
        l.closed.clear();
    }
}

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
/// point for its top-left, in `source`'s scale; kept on that screen by
/// [`place`]) or wherever the OS puts it. Returns its label. A payload with a
/// [`Rect`] (a restored window) goes back to it instead, at its own size,
/// maximized if it was.
/// `source` is the window the tabs came from, told if the build fails; `None`
/// for a second launch of the app (`lib.rs`), which moves nothing and whose
/// window has to come forward by itself — no click of the user's raised it.
/// `reference` is the window a second launch cascades from ([`cascade_from`]):
/// `placement` is in its scale, and the new window takes its size rather than
/// `main`'s, shrunk where it would not fit at the offset ([`place`]).
///
/// The build runs on a worker thread on purpose: `build()` waits on the event
/// loop to construct the webview, and this command already runs *on* that loop,
/// so building inline deadlocks the app. Reserving the label and parking the
/// payload happens first and synchronously, so the new window's `take_pending`
/// cannot race it.
pub fn spawn(
    app: &AppHandle,
    source: Option<String>,
    payload: Layout,
    placement: Option<(f64, f64)>,
    reference: Option<String>,
) -> String {
    // In a block: `state` borrows `app`, and the thread below takes a clone of it.
    let label = {
        let state = app.state::<AppState>();
        let label = state.next_window_label();
        state.pending().insert(label.clone(), payload.clone());
        let mut layouts = state.layouts();
        spawned(&mut layouts, &label, payload.clone());
        persist(&mut layouts, &layout_file(app), Instant::now());
        label
    };

    let rect = payload.rect;
    // Logical, not physical: the builder's size is in CSS pixels, and main may
    // be on a scaled monitor. A restored window has its own; a cascade takes its
    // reference's. A minimized main reads near zero: the builder's default then.
    let size = match rect {
        Some(r) => Some((r.width, r.height)),
        None => app
            .get_webview_window(reference.as_deref().unwrap_or("main"))
            .filter(|w| w.is_minimized().is_ok_and(|m| !m))
            .and_then(|w| {
                let s = w.inner_size().ok()?;
                let scale = w.scale_factor().unwrap_or(1.0);
                Some((s.width as f64 / scale, s.height as f64 / scale))
            }),
    };
    let screen = match rect {
        // Looked up by its centre: a window flush left on Windows has its top-left at about
        // x = −7, outside every monitor. The size is logical, so on a scaled Windows monitor
        // the point is nearer the top-left than the centre, still well inside the window.
        Some(r) => screen_at(
            app,
            (r.x as f64 + r.width / 2.0, r.y as f64 + r.height / 2.0),
        )
        .map(|s| Screen {
            point: (r.x, r.y),
            ..s
        }),
        None => placement
            .and_then(|(x, y)| lookup_point(app, reference.as_deref().or(source.as_deref()), x, y))
            .and_then(|p| screen_at(app, p)),
    };
    let cascade = rect.is_none() && reference.is_some();
    let target = label.clone();
    let app = app.clone();
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
                if let Some(s) = screen {
                    place(&win, s, size, cascade);
                } else if let Some((x, y)) = placement {
                    let _ =
                        win.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
                }
                // Before the show: on Windows a hidden window's maximize applies as it shows; on
                // macOS it zooms after, from the restored size.
                if rect.is_some_and(|r| r.maximized) {
                    let _ = win.maximize();
                }
                crate::show_with_theme(&app, &win);
                if source.is_none() {
                    let _ = win.set_focus();
                }
                // Whoever placed it, the OS too (no rect): its entry gets the frame it shows at.
                sample_soon(&app, &target);
            }
            Err(e) => {
                tracing::warn!(label = %target, error = %e, "window failed to open");
                let state = app.state::<AppState>();
                state.pending().remove(&target);
                // The tabs go back to the source below, so the entry `spawned` made must not
                // restore them a second time.
                // A window that never opened will never report: the restore
                // must not wait for it.
                {
                    let mut layouts = state.layouts();
                    let path = layout_file(&app);
                    layouts.open.remove(&target);
                    persist(&mut layouts, &path, Instant::now());
                    settle(&mut layouts, &path, &target);
                }
                // Give the tabs back to the window that let them go, or they are
                // lost — every one of them, not just the active one.
                if let Some(source) = &source {
                    let _ = app.emit_to(
                        source,
                        "tab-spawn-failed",
                        serde_json::json!({ "paths": payload.tabs }),
                    );
                }
            }
        }
    });
    label
}

/// Where a torn-off window goes: the drop point and the work area of the screen
/// under it, in the units it is moved in — physical pixels on Windows, logical
/// ones elsewhere. macOS and GDK look a point up, and lay their screens out, in
/// logical points; a screen's physical rect there is that times its own scale,
/// so two screens' physical rects need not line up, nor match the drop point
/// (physical in the source window's scale). `k` is units per logical pixel.
#[derive(Clone, Copy)]
struct Screen {
    point: (i32, i32),
    area: (i32, i32, u32, u32),
    k: f64,
}

/// The physical point `(x, y)` in `window`'s scale (a drop's source, a
/// cascade's reference) in the units monitors are looked up in ([`screen_at`]):
/// as is on Windows, over that scale elsewhere. `None` off Windows with no
/// window's scale to convert it with.
fn lookup_point(app: &AppHandle, window: Option<&str>, x: f64, y: f64) -> Option<(f64, f64)> {
    if cfg!(windows) {
        return Some((x, y));
    }
    let s = app.get_webview_window(window?)?.scale_factor().ok()?;
    Some((x / s, y / s))
}

/// The [`Screen`] for the point `(x, y)`, in [`Screen`]'s units: the monitor
/// under it, else main's, else the primary one. Any thread: runtime-wry builds
/// the `Monitor` on the event loop, which a call from another thread waits on
/// and one on the main thread runs inline. `None` when there is no monitor.
fn screen_at(app: &AppHandle, (x, y): (f64, f64)) -> Option<Screen> {
    let m = app
        .monitor_from_point(x, y)
        .ok()
        .flatten()
        .or_else(|| app.get_webview_window("main")?.current_monitor().ok()?)
        .or_else(|| app.primary_monitor().ok()?)?;
    let k = if cfg!(windows) { m.scale_factor() } else { 1.0 };
    let unit = |v: f64| (v * k / m.scale_factor()).round();
    let a = m.work_area();
    Some(Screen {
        point: (x.round() as i32, y.round() as i32),
        area: (
            unit(a.position.x as f64) as i32,
            unit(a.position.y as f64) as i32,
            unit(a.size.width as f64) as u32,
            unit(a.size.height as f64) as u32,
        ),
        k,
    })
}

/// Puts a new window's top-left at its point (a drop, a cascade, a restored
/// rect), kept whole on the screen under it: dropped near the bottom-right
/// corner it would otherwise open off the edge or under the Dock, and the tab
/// seem to vanish. A `cascade` that would not fit at its offset is shrunk by it
/// first ([`cascade_fit`]).
///
/// The size clamped is the one the window was `built` with (logical; `None`
/// when there was no main window to copy), not what the fresh window reports:
/// an X11 window not yet configured reads tiny, which would shrink it to the
/// floor. Only its decorations come from the reads ([`decorations`]), so on X11,
/// where they are not known yet either, the clamp is short by the window
/// manager's frame: a window dropped at the bottom or right edge can overhang
/// by about a title bar.
fn place(win: &tauri::WebviewWindow, s: Screen, built: Option<(f64, f64)>, cascade: bool) {
    // ponytail: with no main window the OS picks the size, unknown here; the floor
    // stands in for it, so such a window may still hang over by the difference.
    let (bw, bh) = built.unwrap_or((MIN_W, MIN_H));
    let built = ((bw * s.k).round() as u32, (bh * s.k).round() as u32);
    // Physical in the window's own scale, the target screen's only once it is
    // moved there: taken over to its units. A failed read counts as nothing.
    let read = |p: tauri::Result<tauri::PhysicalSize<u32>>| match (p, win.scale_factor()) {
        (Ok(p), Ok(ws)) => {
            let u = |v: u32| (v as f64 * s.k / ws).round() as u32;
            (u(p.width), u(p.height))
        }
        _ => (0, 0),
    };
    let (outer, inner) = (read(win.outer_size()), read(win.inner_size()));
    let deco = (
        decorations(built.0, outer.0, inner.0),
        decorations(built.1, outer.1, inner.1),
    );
    let size = (built.0 + deco.0, built.1 + deco.1);
    let min = (
        (MIN_W * s.k).round() as u32 + deco.0,
        (MIN_H * s.k).round() as u32 + deco.1,
    );
    let fit = if cascade {
        let off = (CASCADE * s.k).round() as u32;
        (
            cascade_fit(s.point.0, size.0, s.area.0, s.area.2, off),
            cascade_fit(s.point.1, size.1, s.area.1, s.area.3, off),
        )
    } else {
        size
    };
    let ((x, y), (w, h)) = clamp_rect(s.point, fit, s.area, min);
    // Logical, which a move across monitors keeps.
    if w < size.0 || h < size.1 {
        let _ = win.set_size(LogicalSize::new(
            (w - deco.0) as f64 / s.k,
            (h - deco.1) as f64 / s.k,
        ));
    }
    let _ = if cfg!(windows) {
        win.set_position(PhysicalPosition::new(x, y))
    } else {
        win.set_position(LogicalPosition::new(x, y))
    };
}

/// One axis of a cascaded window's size: shrunk by the `offset` it was moved by
/// when it would run past the area's far edge (a cascade from a maximized
/// window, whose size is the work area's), so the clamp does not move it back
/// over the window it cascades from. [`clamp_rect`]'s floor still wins.
fn cascade_fit(pos: i32, size: u32, start: i32, len: u32, offset: u32) -> u32 {
    if pos + size as i32 > start + len as i32 {
        size.saturating_sub(offset)
    } else {
        size
    }
}

/// How far a second launch's window sits from the one it cascades from, each
/// way, in logical pixels.
const CASCADE: f64 = 32.0;

/// Where a second launch's window goes ([`spawn`]'s `reference` and
/// `placement`): [`CASCADE`] from the window last focused, at its outer
/// position plus the offset in its scale (physical, as `outer_position` is). A
/// minimized one (at about (−32000, −32000) on Windows) or a closed one (its
/// label finds no window) gives way to any other open window that is not
/// minimized; `None`, and the OS places it, when there is none.
pub(crate) fn cascade_from(app: &AppHandle) -> Option<(String, (f64, f64))> {
    let usable = |w: &tauri::WebviewWindow| w.is_minimized().is_ok_and(|m| !m);
    let w = app
        .state::<AppState>()
        .last_focused()
        .and_then(|label| app.get_webview_window(&label))
        .filter(usable)
        .or_else(|| app.webview_windows().into_values().find(usable))?;
    let pos = w.outer_position().ok()?;
    let off = CASCADE * w.scale_factor().ok()?;
    Some((
        w.label().to_string(),
        (pos.x as f64 + off, pos.y as f64 + off),
    ))
}

/// One axis of a window's frame: what its `outer` read has over the larger of
/// its `inner` read and the size it was `built` with. Reads below the built size
/// — a window not configured yet, or a failed read — give none.
fn decorations(built: u32, outer: u32, inner: u32) -> u32 {
    outer.saturating_sub(inner.max(built))
}

/// The rect at `pos` of `size` moved, and shrunk if it is too big (never below
/// `min`), to lie inside `area` (x, y, width, height). All in one unit, physical
/// or logical; the top-left wins when even `min` does not fit.
fn clamp_rect(
    pos: (i32, i32),
    size: (u32, u32),
    area: (i32, i32, u32, u32),
    min: (u32, u32),
) -> ((i32, i32), (u32, u32)) {
    let axis = |p: i32, s: u32, start: i32, len: u32, min: u32| {
        let s = s.min(len).max(min);
        (p.min(start + len as i32 - s as i32).max(start), s)
    };
    let (x, w) = axis(pos.0, size.0, area.0, area.2, min.0);
    let (y, h) = axis(pos.1, size.1, area.1, area.3, min.1);
    ((x, y), (w, h))
}

#[tauri::command]
pub fn spawn_window(
    app: AppHandle,
    window: Window,
    payload: Layout,
    placement: Option<(f64, f64)>,
) -> String {
    spawn(
        &app,
        Some(window.label().to_string()),
        payload,
        placement,
        None,
    )
}

/// Hands this window whatever it was created to open. Consumed on first call;
/// `None` in the main window, which reads [`take_layout`] instead.
#[tauri::command]
pub fn take_pending(state: State<'_, AppState>, window: Window) -> Option<Layout> {
    state.pending().remove(window.label())
}

/// What this window has open now. Written out on every change, so the file is
/// current whichever way the app goes away (the last window closing, a quit, a
/// crash). `restored` is the one-shot report after the window's restore: it
/// counts the window as back ([`settle`]).
#[tauri::command]
pub fn set_layout(app: AppHandle, window: Window, layout: Layout, restored: Option<bool>) {
    let state = app.state::<AppState>();
    let mut layouts = state.layouts();
    let path = layout_file(&app);
    report(&mut layouts, window.label(), layout);
    persist(&mut layouts, &path, Instant::now());
    if restored == Some(true) {
        settle(&mut layouts, &path, window.label());
    }
}

/// A window's report replaces its entry's tabs, not its rect: the frontend
/// knows nothing of that, only samples set it ([`record`]).
fn report(l: &mut Layouts, label: &str, layout: Layout) {
    let rect = l.open.get(label).and_then(|old| old.rect);
    l.open.insert(label.to_string(), Layout { rect, ..layout });
}

/// How long a secondary window has to keep still before it is sampled
/// ([`sample_soon`]).
const SETTLE: Duration = Duration::from_millis(300);

/// A secondary window moved, resized or has just shown: it is sampled once it
/// has kept still for [`SETTLE`], rather than recorded from each event. The
/// events around a maximize, a zoom or full screen come in a different order on
/// each OS, and a state can trail its geometry; a sample after they stop asks
/// the window what it is now. Each call makes the timers before it stale (the
/// count in [`AppState::moved`], a lock of its own: the event handler never
/// waits on `layouts`).
pub(crate) fn sample_soon(app: &AppHandle, label: &str) {
    if label == "main" {
        return;
    }
    let count = app.state::<AppState>().moved(label);
    let app = app.clone();
    let label = label.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(SETTLE);
        if !app.state::<AppState>().is_last_move(&label, count) {
            return;
        }
        // Read before the lock: each getter waits on the event loop, which may be waiting on
        // the lock. A getter that fails is a window that is gone: nothing is recorded.
        if let Some(s) = read_window(&app, &label) {
            record(&mut app.state::<AppState>().layouts(), &label, s);
        }
    });
}

/// What a sample reads of a window: its state, and its frame in a [`Rect`]'s
/// units ([`rect_units`]).
#[derive(Debug, Clone, Copy)]
struct Sample {
    minimized: bool,
    fullscreen: bool,
    maximized: bool,
    pos: (i32, i32),
    size: (f64, f64),
}

fn read_window(app: &AppHandle, label: &str) -> Option<Sample> {
    let w = app.get_webview_window(label)?;
    let scale = w.scale_factor().ok()?;
    let pos = w.outer_position().ok()?;
    let size = w.inner_size().ok()?;
    let (pos, size) = rect_units(
        (pos.x, pos.y),
        (size.width, size.height),
        scale,
        cfg!(windows),
    );
    Some(Sample {
        minimized: w.is_minimized().ok()?,
        fullscreen: w.is_fullscreen().ok()?,
        maximized: w.is_maximized().ok()?,
        pos,
        size,
    })
}

/// A window's physical outer position and inner size in a [`Rect`]'s units: the
/// position stays physical where windows move in physical pixels (`physical`:
/// Windows) and goes over the window's scale elsewhere; the size goes over it
/// everywhere.
fn rect_units(
    pos: (i32, i32),
    size: (u32, u32),
    scale: f64,
    physical: bool,
) -> ((i32, i32), (f64, f64)) {
    let p = |v: i32| {
        if physical {
            v
        } else {
            (v as f64 / scale).round() as i32
        }
    };
    (
        (p(pos.0), p(pos.1)),
        (size.0 as f64 / scale, size.1 as f64 / scale),
    )
}

/// What a sample makes of a window's rect. Minimized or full screen, nothing:
/// neither is a frame to come back to (minimized first: Windows clears tao's
/// maximized flag on a minimize). Maximized, the restored rect stays and is
/// marked maximized; with none yet, there is none (the window comes back at
/// `main`'s size, not maximized). Otherwise the frame it has now, so an
/// un-maximize, or a maximized window moved to another monitor and restored
/// there, records where it now is.
fn sampled(old: Option<Rect>, s: Sample) -> Option<Rect> {
    if s.minimized || s.fullscreen {
        return old;
    }
    if s.maximized {
        return old.map(|r| Rect {
            maximized: true,
            ..r
        });
    }
    Some(Rect {
        x: s.pos.0,
        y: s.pos.1,
        width: s.size.0,
        height: s.size.1,
        maximized: false,
    })
}

/// Puts a sample in `label`'s entry, in memory only: the next write carries it
/// (a report's, a close's, or the one at exit, [`save_on_exit`]). Only while the
/// window is still open: a close has moved its entry to the closed chain, and a
/// late sample must not bring it back.
fn record(l: &mut Layouts, label: &str, s: Sample) {
    if let Some(entry) = l.open.get_mut(label) {
        entry.rect = sampled(entry.rect, s);
    }
}

/// A window being created is in the file from the start, not from its first
/// `set_layout`: one stuck on *Starting* never reports, and its tabs would
/// otherwise be gone once `main` closes. Its first `set_layout` replaces this.
///
/// A torn-off tab is in both entries until the source window reports again, so
/// a crash inside those milliseconds restores it twice; accepted. At launch
/// `main` spawns before its own first `set_layout`, but [`take`] has already
/// seeded its entry, so the file holds both windows from the first spawn.
///
/// Until `main` has taken the file ([`Layouts::read`]) that entry stays in
/// memory only: a second launch during startup spawns an empty window before
/// `main` reads the layout, and writing it then would replace the saved session
/// with nothing.
///
/// While a restore is running ([`Layouts::awaiting`]), the new window joins it:
/// the restore is over only once it has reported too.
fn spawned(l: &mut Layouts, label: &str, payload: Layout) {
    l.open.insert(label.to_string(), payload);
    if let Some(awaiting) = &mut l.awaiting {
        awaiting.insert(label.to_string());
    }
}

/// The restore mark: `layout.restoring` next to `layout.json`, on disk from
/// `main`'s first [`take`] until every window of the restore has reported.
fn mark_file(path: &Path) -> PathBuf {
    path.with_extension("restoring")
}

/// Where a session that crashed the app while it was restored is set aside:
/// `layout.crashed.json`.
fn crashed_file(path: &Path) -> PathBuf {
    path.with_extension("crashed.json")
}

/// Starts a restore: `main` is the one window it waits for so far, and the
/// mark goes on disk.
fn arm(l: &mut Layouts, path: &Path) {
    l.awaiting = Some(HashSet::from(["main".to_string()]));
    let mark = mark_file(path);
    if let Some(dir) = mark.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Err(e) = std::fs::write(&mark, "") {
        tracing::warn!(path = %mark.display(), error = %e, "could not write the restore mark");
    }
}

/// `label` is done restoring — it reported, closed, or never opened. The last
/// one ends the restore. A no-op once the restore is over, or for a window it
/// never waited for.
fn settle(l: &mut Layouts, path: &Path, label: &str) {
    let Some(awaiting) = &mut l.awaiting else {
        return;
    };
    awaiting.remove(label);
    if awaiting.is_empty() {
        clear_mark(l, path);
    }
}

/// Ends the restore whoever is left: the app is exiting normally, or about to
/// be replaced by an update. Only this process's own mark: with no restore
/// running, a mark on disk is a crash the next launch has to find, or another
/// process's restore (no single-instance).
fn clear_mark(l: &mut Layouts, path: &Path) {
    if l.awaiting.take().is_some() {
        let _ = std::fs::remove_file(mark_file(path));
    }
}

/// For `RunEvent::Exit` and the update install: writes the layout one last
/// time, since a window moved after the last write is only in memory
/// ([`record`]), then [`clear_mark`]. Before `main`'s read nothing is written
/// ([`persist`]).
pub(crate) fn save_on_exit(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut layouts = state.layouts();
    let path = layout_file(app);
    persist(&mut layouts, &path, Instant::now());
    clear_mark(&mut layouts, &path);
}

/// What a close does to the state; `false` for a window with no entry in `open`.
fn close(l: &mut Layouts, label: &str, now: Instant) -> bool {
    // A chain that had already run out does not get extended by this close —
    // judged with this window still open: its tabs are what let it run out.
    expire(l, now);
    let Some(layout) = l.open.remove(label) else {
        return false;
    };
    // A window without a tab has nothing to come back, and as the chain's last
    // entry it would hand the windows closed before it a fresh grace.
    if !layout.tabs.is_empty() {
        l.closed.push((now, label.to_string(), layout));
    }
    true
}

/// A window is gone: it keeps its place in the file for [`CLOSE_GRACE`], so a
/// close-all one window at a time — or a crash right after a close — still
/// restores the whole session. The timer writes the file again once the grace
/// is up, so the window drops out of it with nobody touching the app.
///
/// The timer holds nothing: a later close brings its own, and if the app is
/// gone by then the file already says what should come back.
///
/// A window closed before its restore report counts as reported: the restore
/// must not wait on it.
pub(crate) fn window_closed(app: &AppHandle, label: &str) {
    let state = app.state::<AppState>();
    let path = layout_file(app);
    {
        let mut layouts = state.layouts();
        settle(&mut layouts, &path, label);
        let now = Instant::now();
        if !close(&mut layouts, label, now) {
            return;
        }
        persist(&mut layouts, &path, now);
    }

    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(CLOSE_GRACE + Duration::from_millis(50));
        let state = app.state::<AppState>();
        let mut layouts = state.layouts();
        persist(&mut layouts, &path, Instant::now());
    });
}

/// The layout the last exit left, read and left in place: `main` opens the
/// first entry itself and spawns a window for each of the others, and the next
/// write (a `spawn`, or `main`'s one-shot report) replaces the file. Empty
/// with no saved session or an empty one — the frontend falls back to
/// `lastOpen` then: the last active repository, unless every tab was closed
/// since, which clears it — and after a launch that died restoring (`crashed`,
/// see [`take`]). Of two processes without single-instance (no reachable
/// session bus), one started while the other restores finds its mark and takes
/// that for a crash; accepted.
#[tauri::command]
pub fn take_layout(app: AppHandle) -> Taken {
    take(&mut app.state::<AppState>().layouts(), &layout_file(&app))
}

/// What [`take_layout`] answers.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Taken {
    pub layouts: Vec<Layout>,
    /// The launch before this one died while it restored: nothing is restored
    /// this time.
    pub crashed: bool,
    /// With `crashed`: the session was set aside in `layout.crashed.json`
    /// (false when there was no `layout.json` to set aside).
    pub kept: bool,
}

/// Reads the saved session and opens the gate on writes ([`Layouts::read`]),
/// set after the read, under the lock: a write before the read would replace
/// the session `main` is about to restore. `main` is seeded with the first
/// entry, so its tabs are in every write from here rather than from its first
/// report, which replaces the seed. Nothing of the session is written here:
/// until the next write, the file on disk is already right.
///
/// The seed replaces whatever `main` reported before its read, so a tab dragged
/// onto a `main` still on *Starting* is in no entry until `main`'s one-shot
/// report; rare, and accepted.
///
/// The crash-loop breaker: the first take arms the restore mark, always — with
/// no saved session too, since the frontend's `lastOpen` fallback can crash as
/// well. Finding the mark already there means the last launch died before its
/// restore finished: the session is set aside rather than restored into the
/// same crash, `main` is not seeded, and the mark is armed again for `main`'s
/// own (empty) report to clear.
fn take(l: &mut Layouts, path: &Path) -> Taken {
    // Once per process: a reloaded `main` (or StrictMode's second run in dev)
    // gets its own tabs back and spawns nothing.
    if l.read {
        return Taken {
            layouts: l.open.get("main").cloned().into_iter().collect(),
            ..Default::default()
        };
    }
    l.read = true;
    if mark_file(path).exists() {
        // A rename refused (a scanner or sync client holding `layout.json` on
        // Windows) falls back to a copy: the session is still kept.
        let kept = match std::fs::rename(path, crashed_file(path)) {
            Ok(()) => true,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => false,
            Err(e) => match std::fs::copy(path, crashed_file(path)) {
                Ok(_) => true,
                Err(c) => {
                    tracing::warn!(path = %path.display(), rename = %e, copy = %c, "could not set the crashed session aside");
                    false
                }
            },
        };
        arm(l, path);
        return Taken {
            layouts: Vec::new(),
            crashed: true,
            kept,
        };
    }
    let layouts = read_layouts(path);
    // Without its rect: the first entry can be a second window's that outlived `main`, and
    // window-state places `main`.
    if let Some(first) = layouts.first() {
        l.open.insert(
            "main".to_string(),
            Layout {
                rect: None,
                ..first.clone()
            },
        );
    }
    arm(l, path);
    Taken {
        layouts,
        ..Default::default()
    }
}

/// Quits the app rather than closing one window: every window goes at once, so
/// `RunEvent::ExitRequested` raises [`AppState::exiting`] before any of them is
/// destroyed, and none of them takes the `window_closed` path at all — the map
/// keeps them and the file has them all. Closing them one by one comes back to
/// the same place as long as the closes are less than [`CLOSE_GRACE`] apart.
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
/// works (at the drop point, kept on that screen by `place`; on Wayland where
/// the compositor puts it) and adoption does not.
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
                rect: None,
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

/// Reads the layout file. A corrupt or missing one restores nothing.
pub(crate) fn read_layouts(path: &Path) -> Vec<Layout> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn layout(tabs: &[&str]) -> Layout {
        Layout {
            tabs: tabs.iter().map(|s| (*s).to_string()).collect(),
            active: tabs[0].to_string(),
            rect: None,
        }
    }

    /// A layout path of its own per test, with no mark or set-aside session
    /// left by an earlier run.
    fn temp_path(tag: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("t4-layout-{tag}-{}.json", std::process::id()));
        remove(&path);
        path
    }

    /// The layout file, the restore mark and the set-aside session.
    fn remove(path: &Path) {
        let _ = std::fs::remove_file(path);
        let _ = std::fs::remove_file(mark_file(path));
        let _ = std::fs::remove_file(crashed_file(path));
    }

    /// The round trip the relaunch depends on: `main` first whatever the map's
    /// order, windows with no tabs left out, and the file left in place by a read.
    #[test]
    fn layouts_round_trip_main_first_and_survive_a_read() {
        let path = temp_path("round");
        let mut map = HashMap::new();
        map.insert("w1".to_string(), layout(&["c:/b"]));
        map.insert("main".to_string(), layout(&["c:/a", "c:/c"]));
        map.insert("w2".to_string(), Layout::default());
        write_layouts(&path, &map);

        let expected = vec![layout(&["c:/a", "c:/c"]), layout(&["c:/b"])];
        assert_eq!(read_layouts(&path), expected);
        assert_eq!(read_layouts(&path), expected);
        remove(&path);
    }

    /// A window closed after the main one becomes `main` on the next launch, so
    /// a map without a `main` entry still restores.
    #[test]
    fn a_secondary_window_alone_is_the_first_entry() {
        let path = temp_path("secondary");
        let mut map = HashMap::new();
        map.insert("w1".to_string(), layout(&["c:/b"]));
        write_layouts(&path, &map);
        assert_eq!(read_layouts(&path), vec![layout(&["c:/b"])]);
        remove(&path);
    }

    fn labels(map: HashMap<String, Layout>) -> Vec<String> {
        let mut labels: Vec<String> = map.into_keys().collect();
        labels.sort();
        labels
    }

    /// A closed window stays in the file until its grace runs out — the window
    /// that is left rewrites it by then, and so does the timer if nothing else does.
    #[test]
    fn a_closed_window_is_kept_for_the_grace() {
        let t0 = Instant::now();
        let mut l = Layouts {
            open: HashMap::from([("main".to_string(), layout(&["c:/a"]))]),
            closed: vec![(t0, "w1".to_string(), layout(&["c:/b"]))],
            ..Default::default()
        };
        let second = Duration::from_secs(1);
        assert_eq!(
            labels(restorable(&mut l, t0 + CLOSE_GRACE - second)),
            ["main", "w1"]
        );
        assert_eq!(
            labels(restorable(&mut l, t0 + CLOSE_GRACE + second)),
            ["main"]
        );
        assert!(l.closed.is_empty(), "an expired chain is gone for good");
    }

    /// A window that closed its last tab and then itself is no part of the
    /// chain: the window closed before it runs out on its own clock.
    #[test]
    fn an_empty_window_closing_does_not_extend_the_chain() {
        let t0 = Instant::now();
        let second = Duration::from_secs(1);
        let mut l = Layouts {
            open: HashMap::from([
                ("main".to_string(), layout(&["c:/a"])),
                ("w2".to_string(), Layout::default()),
            ]),
            closed: vec![(t0, "w1".to_string(), layout(&["c:/b"]))],
            ..Default::default()
        };
        assert!(close(&mut l, "w2", t0 + CLOSE_GRACE - second));
        assert_eq!(l.closed.len(), 1, "w2 had nothing to restore");
        assert_eq!(
            labels(restorable(&mut l, t0 + CLOSE_GRACE + second)),
            ["main"]
        );
        assert!(!close(&mut l, "w2", t0 + CLOSE_GRACE + second));
    }

    /// Closing them one by one: each close keeps the ones before it, so only
    /// the last one's age decides whether the chain is still there.
    #[test]
    fn closes_within_a_grace_of_each_other_are_one_chain() {
        let t0 = Instant::now();
        let second = Duration::from_secs(1);
        // The grace is the gap between two closes, not the time the whole run takes.
        let t1 = t0 + CLOSE_GRACE - second;
        let mut l = Layouts {
            open: HashMap::from([("main".to_string(), layout(&["c:/d"]))]),
            closed: vec![
                (t0, "w1".to_string(), layout(&["c:/c"])),
                (t1, "w2".to_string(), layout(&["c:/b"])),
            ],
            ..Default::default()
        };
        // More than a grace after the first close, less than one after the second.
        assert_eq!(
            labels(restorable(&mut l, t1 + CLOSE_GRACE - second)),
            ["main", "w1", "w2"]
        );
        assert_eq!(
            labels(restorable(&mut l, t1 + CLOSE_GRACE + second)),
            ["main"]
        );
    }

    /// Closing the last thing open leaves the waiting session alone: `main` on
    /// the start screen has nothing to restore, so the closed window is kept
    /// until a window has a tab again.
    #[test]
    fn with_no_tab_open_anywhere_the_chain_is_kept() {
        let t0 = Instant::now();
        let empty = Layout::default();
        let mut l = Layouts {
            open: HashMap::from([("main".to_string(), empty)]),
            closed: vec![(t0, "w1".to_string(), layout(&["c:/b"]))],
            ..Default::default()
        };
        let later = t0 + Duration::from_secs(60);
        assert_eq!(labels(restorable(&mut l, later)), ["main", "w1"]);

        l.open.insert("main".to_string(), layout(&["c:/a"]));
        assert_eq!(labels(restorable(&mut l, later)), ["main"]);
    }

    /// A window that never reports (stuck on *Starting*) is still in the file;
    /// one created with nothing to show is not.
    #[test]
    fn a_spawned_window_is_written_before_it_reports() {
        let path = temp_path("spawned");
        let mut l = Layouts::default();
        spawned(&mut l, "w1", layout(&["c:/b"]));
        spawned(&mut l, "w2", Layout::default());
        write_layouts(&path, &restorable(&mut l, Instant::now()));
        assert_eq!(read_layouts(&path), vec![layout(&["c:/b"])]);
        remove(&path);
    }

    /// A window whose tabs all failed to open reports an empty layout once
    /// `restoreTabs` is done, and drops out rather than coming back every launch.
    #[test]
    fn an_empty_report_replaces_the_spawned_entry() {
        let path = temp_path("spawned-empty");
        let mut l = Layouts::default();
        spawned(&mut l, "w1", layout(&["c:/b"]));
        l.open.insert("w1".to_string(), Layout::default());
        write_layouts(&path, &restorable(&mut l, Instant::now()));
        assert_eq!(read_layouts(&path), Vec::<Layout>::new());
        remove(&path);
    }

    /// Closing a window that never reported is a real close: its tabs join the
    /// chain and expire after the grace like any other window's.
    #[test]
    fn closing_a_spawned_window_puts_it_in_the_chain() {
        let t0 = Instant::now();
        let mut l = Layouts {
            open: HashMap::from([("main".to_string(), layout(&["c:/a"]))]),
            closed: Vec::new(),
            ..Default::default()
        };
        spawned(&mut l, "w1", layout(&["c:/b"]));
        assert!(close(&mut l, "w1", t0));
        assert_eq!(labels(restorable(&mut l, t0)), ["main", "w1"]);
        assert_eq!(
            labels(restorable(
                &mut l,
                t0 + CLOSE_GRACE + Duration::from_secs(1)
            )),
            ["main"]
        );
    }

    /// No window left is the app on its way out: however long the exit takes,
    /// the timer must not write the session away.
    #[test]
    fn with_no_window_left_the_chain_never_expires() {
        let t0 = Instant::now();
        let mut l = Layouts {
            open: HashMap::new(),
            closed: vec![(t0, "main".to_string(), layout(&["c:/a"]))],
            ..Default::default()
        };
        assert_eq!(
            labels(restorable(&mut l, t0 + Duration::from_secs(60))),
            ["main"]
        );
    }

    /// A session nobody has read yet, in the file.
    fn saved_session(tag: &str) -> (PathBuf, Vec<u8>) {
        let path = temp_path(tag);
        let map = HashMap::from([
            ("main".to_string(), layout(&["c:/a"])),
            ("w1".to_string(), layout(&["c:/b"])),
        ]);
        write_layouts(&path, &map);
        let bytes = std::fs::read(&path).unwrap();
        (path, bytes)
    }

    /// A second launch during startup spawns an empty window before `main` has
    /// read the layout: the saved session must still be there for `main`.
    #[test]
    fn a_spawn_before_the_read_leaves_the_session_alone() {
        let (path, before) = saved_session("unread-spawn");
        let mut l = Layouts::default();
        spawned(&mut l, "w1", Layout::default());
        persist(&mut l, &path, Instant::now());
        assert_eq!(std::fs::read(&path).unwrap(), before);
        remove(&path);
    }

    /// A tab adopted by `main` while it still says *Starting* makes it report
    /// before its read; that report must not write over the saved session.
    #[test]
    fn a_report_before_the_read_leaves_the_session_alone() {
        let (path, before) = saved_session("unread-report");
        let mut l = Layouts::default();
        l.open.insert("main".to_string(), layout(&["c:/z"]));
        persist(&mut l, &path, Instant::now());
        assert_eq!(std::fs::read(&path).unwrap(), before);
        remove(&path);
    }

    /// `take` hands back the saved session and opens the gate: the next write
    /// is the current state.
    #[test]
    fn take_returns_the_session_and_opens_the_gate() {
        let (path, _) = saved_session("take");
        let mut l = Layouts::default();
        assert_eq!(
            take(&mut l, &path).layouts,
            vec![layout(&["c:/a"]), layout(&["c:/b"])]
        );
        assert!(l.read);
        l.open.insert("main".to_string(), layout(&["c:/z"]));
        persist(&mut l, &path, Instant::now());
        assert_eq!(read_layouts(&path), vec![layout(&["c:/z"])]);
        remove(&path);
    }

    /// Once read, every write goes through as before.
    #[test]
    fn after_the_read_persist_writes() {
        let path = temp_path("read-persist");
        let mut l = Layouts {
            read: true,
            ..Default::default()
        };
        l.open.insert("w1".to_string(), layout(&["c:/b"]));
        l.open.insert("main".to_string(), layout(&["c:/a", "c:/c"]));
        spawned(&mut l, "w2", Layout::default());
        persist(&mut l, &path, Instant::now());
        assert_eq!(
            read_layouts(&path),
            vec![layout(&["c:/a", "c:/c"]), layout(&["c:/b"])]
        );
        remove(&path);
    }

    /// `main` is seeded at its read: the first spawn writes it together with
    /// the spawned window, not the spawned window alone.
    #[test]
    fn main_is_in_the_file_from_its_read() {
        let (path, _) = saved_session("seed");
        let mut l = Layouts::default();
        take(&mut l, &path);
        spawned(&mut l, "w2", layout(&["c:/b"]));
        persist(&mut l, &path, Instant::now());
        assert_eq!(
            read_layouts(&path),
            vec![layout(&["c:/a"]), layout(&["c:/b"])]
        );
        remove(&path);
    }

    /// A single-window session has no spawn to write it again: the read alone
    /// must leave it on disk.
    #[test]
    fn a_single_window_session_survives_its_read() {
        let path = temp_path("single");
        write_layouts(
            &path,
            &HashMap::from([("main".to_string(), layout(&["c:/a"]))]),
        );
        let mut l = Layouts::default();
        assert_eq!(take(&mut l, &path).layouts, vec![layout(&["c:/a"])]);
        assert_eq!(read_layouts(&path), vec![layout(&["c:/a"])]);
        remove(&path);
    }

    /// A `main` whose repositories are all gone reports empty once restored,
    /// and its seed drops out of the file.
    #[test]
    fn mains_report_replaces_the_seed() {
        let (path, _) = saved_session("seed-report");
        let mut l = Layouts::default();
        take(&mut l, &path);
        spawned(&mut l, "w2", layout(&["c:/b"]));
        l.open.insert("main".to_string(), Layout::default());
        persist(&mut l, &path, Instant::now());
        assert_eq!(read_layouts(&path), vec![layout(&["c:/b"])]);
        remove(&path);
    }

    /// No file: nothing to seed, and nothing written — but the restore mark is
    /// armed all the same: the `lastOpen` fallback can crash too.
    #[test]
    fn a_first_launch_seeds_nothing() {
        let path = temp_path("first");
        remove(&path);
        let mut l = Layouts::default();
        assert_eq!(take(&mut l, &path), Taken::default());
        assert!(!l.open.contains_key("main"));
        assert!(!path.exists());
        assert!(mark_file(&path).exists());
        assert_eq!(l.awaiting, Some(HashSet::from(["main".to_string()])));
        remove(&path);
    }

    /// A reloaded `main` takes again in the same process: it gets its own
    /// current tabs, and nothing for the windows that are already open.
    #[test]
    fn a_second_take_returns_mains_own_entry() {
        let (path, _) = saved_session("second-take");
        let mut l = Layouts::default();
        take(&mut l, &path);
        spawned(&mut l, "w2", layout(&["c:/b"]));
        l.open.insert("main".to_string(), layout(&["c:/z"]));
        persist(&mut l, &path, Instant::now());
        // Its own restore's mark is on disk: no crash for all that.
        let again = take(&mut l, &path);
        assert!(!again.crashed);
        assert_eq!(again.layouts, vec![layout(&["c:/z"])]);
        remove(&path);
    }

    /// The restore is over once every window of it has reported — `main` and
    /// the windows spawned for the other entries — and the mark goes with it.
    #[test]
    fn the_mark_clears_once_every_restored_window_reports() {
        let (path, _) = saved_session("mark-reports");
        let mut l = Layouts::default();
        take(&mut l, &path);
        assert!(mark_file(&path).exists());
        spawned(&mut l, "w1", layout(&["c:/b"]));
        settle(&mut l, &path, "main");
        assert!(mark_file(&path).exists(), "w1 has not reported yet");
        settle(&mut l, &path, "w1");
        assert!(!mark_file(&path).exists());
        assert_eq!(l.awaiting, None);
        remove(&path);
    }

    /// A window closed before its report counts as reported (`window_closed`
    /// settles it), as does one that never opened (`spawn`'s failure branch).
    #[test]
    fn a_window_gone_mid_restore_counts_as_reported() {
        let (path, _) = saved_session("mark-closed");
        let mut l = Layouts::default();
        take(&mut l, &path);
        spawned(&mut l, "w1", layout(&["c:/b"]));
        spawned(&mut l, "w2", layout(&["c:/c"]));
        settle(&mut l, &path, "w1");
        settle(&mut l, &path, "w2");
        assert!(mark_file(&path).exists(), "main has not reported yet");
        settle(&mut l, &path, "main");
        assert!(!mark_file(&path).exists());
        remove(&path);
    }

    /// A window spawned after the restore ended is not waited for: the mark
    /// does not come back.
    #[test]
    fn a_spawn_after_the_restore_is_not_awaited() {
        let (path, _) = saved_session("mark-after");
        let mut l = Layouts::default();
        take(&mut l, &path);
        settle(&mut l, &path, "main");
        spawned(&mut l, "w1", layout(&["c:/b"]));
        assert_eq!(l.awaiting, None);
        settle(&mut l, &path, "w1");
        assert!(!mark_file(&path).exists());
        remove(&path);
    }

    /// Exit and the update install end the restore whoever is left, and the
    /// reports still to come change nothing.
    #[test]
    fn clear_mark_ends_the_restore() {
        let (path, _) = saved_session("mark-clear");
        let mut l = Layouts::default();
        take(&mut l, &path);
        spawned(&mut l, "w1", layout(&["c:/b"]));
        clear_mark(&mut l, &path);
        assert!(!mark_file(&path).exists());
        assert_eq!(l.awaiting, None);
        settle(&mut l, &path, "main");
        settle(&mut l, &path, "w1");
        assert!(!mark_file(&path).exists());
        remove(&path);
    }

    /// With no restore running, a mark on disk is not this process's: another
    /// process's, or a crash the next launch has to find.
    #[test]
    fn clear_mark_leaves_a_mark_it_did_not_set() {
        let path = temp_path("mark-foreign");
        std::fs::write(mark_file(&path), "").unwrap();
        let mut l = Layouts::default();
        clear_mark(&mut l, &path);
        assert!(mark_file(&path).exists());
        remove(&path);
    }

    /// A launch that died restoring: the session is set aside rather than
    /// restored into the same crash, `main` is not seeded, and the mark is
    /// armed again until `main`'s own report.
    #[test]
    fn a_restore_that_never_finished_is_set_aside() {
        let (path, before) = saved_session("trip");
        std::fs::write(mark_file(&path), "").unwrap();
        let mut l = Layouts::default();
        assert_eq!(
            take(&mut l, &path),
            Taken {
                layouts: Vec::new(),
                crashed: true,
                kept: true,
            }
        );
        assert!(!l.open.contains_key("main"));
        assert!(!path.exists());
        assert_eq!(std::fs::read(crashed_file(&path)).unwrap(), before);
        assert!(mark_file(&path).exists());
        settle(&mut l, &path, "main");
        assert!(!mark_file(&path).exists());
        remove(&path);
    }

    /// A `layout.json` held open without delete sharing refuses the rename; the
    /// session is copied aside instead. Windows only: no portable way to make a
    /// rename fail while a copy of the same file into the same folder succeeds.
    #[cfg(windows)]
    #[test]
    fn a_refused_rename_copies_the_session_aside() {
        use std::os::windows::fs::OpenOptionsExt;
        let (path, before) = saved_session("trip-locked");
        std::fs::write(mark_file(&path), "").unwrap();
        // FILE_SHARE_READ only: reads pass, a rename (delete access) does not.
        let hold = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(1)
            .open(&path)
            .unwrap();
        let mut l = Layouts::default();
        let taken = take(&mut l, &path);
        drop(hold);
        assert!(taken.crashed);
        assert!(taken.kept);
        assert_eq!(std::fs::read(crashed_file(&path)).unwrap(), before);
        remove(&path);
    }

    /// A crash on the `lastOpen` path left no `layout.json`: still a trip,
    /// with nothing set aside.
    #[test]
    fn a_trip_without_a_layout_keeps_nothing() {
        let path = temp_path("trip-empty");
        std::fs::write(mark_file(&path), "").unwrap();
        let mut l = Layouts::default();
        let taken = take(&mut l, &path);
        assert!(taken.crashed);
        assert!(!taken.kept);
        assert!(!crashed_file(&path).exists());
        remove(&path);
    }

    /// A torn-off window kept whole on the screen it was dropped on: moved in
    /// from any edge, shrunk only when bigger than the screen, never below the
    /// floor.
    #[test]
    fn a_dropped_window_is_kept_on_the_screen() {
        // A 1920×1040 work area right of a primary screen, under a 40 px menu bar.
        let area = (1920, 40, 1920, 1040);
        let min = (700, 500);
        let clamp = |pos, size| clamp_rect(pos, size, area, min);
        // Inside: unchanged.
        assert_eq!(clamp((2000, 100), (800, 600)), ((2000, 100), (800, 600)));
        // Off the right and bottom: moved in.
        assert_eq!(clamp((3500, 1000), (800, 600)), ((3040, 480), (800, 600)));
        // Off the left and top: moved in.
        assert_eq!(clamp((1800, 0), (800, 600)), ((1920, 40), (800, 600)));
        // Bigger than the area: shrunk to it, at its origin.
        assert_eq!(clamp((2500, 500), (2500, 1200)), ((1920, 40), (1920, 1040)));
        // An area smaller than the floor: the floor, at the area's top-left.
        assert_eq!(
            clamp_rect((50, 50), (800, 600), (0, 0, 600, 400), min),
            ((0, 0), (700, 500))
        );
    }

    /// The frame comes from the reads only when they are of the built window: an
    /// X11 window not yet configured reads 0 or 1 px, which must not count, nor
    /// shrink a 1280×800 window dropped mid-screen.
    #[test]
    fn a_window_not_yet_configured_keeps_its_built_size() {
        assert_eq!(decorations(1280, 0, 0), 0);
        assert_eq!(decorations(800, 1, 1), 0);
        // Configured: the frame, also when the inner read rounds a pixel short.
        assert_eq!(decorations(800, 830, 800), 30);
        assert_eq!(decorations(800, 830, 799), 30);
        // Windows at 100 %: the frame is mostly invisible resize borders.
        assert_eq!(decorations(1280, 1296, 1280), 16);
        let area = (0, 0, 1920, 1040);
        assert_eq!(
            clamp_rect((300, 200), (1280, 800), area, (700, 500)),
            ((300, 200), (1280, 800))
        );
    }

    fn rect(x: i32, y: i32, maximized: bool) -> Rect {
        Rect {
            x,
            y,
            width: 1000.0,
            height: 700.0,
            maximized,
        }
    }

    /// A sample of a window at (x, y), 1000×700, with these flags.
    fn sample(x: i32, y: i32, minimized: bool, fullscreen: bool, maximized: bool) -> Sample {
        Sample {
            minimized,
            fullscreen,
            maximized,
            pos: (x, y),
            size: (1000.0, 700.0),
        }
    }

    /// Each state a sample can find, from a window that has a rect and from one
    /// that has none yet.
    #[test]
    fn a_sample_keeps_the_restored_rect() {
        let old = Some(rect(10, 20, false));
        // Normal: the frame it has now, an un-maximize included.
        assert_eq!(
            sampled(old, sample(50, 60, false, false, false)),
            Some(rect(50, 60, false))
        );
        assert_eq!(
            sampled(
                Some(rect(10, 20, true)),
                sample(50, 60, false, false, false)
            ),
            Some(rect(50, 60, false))
        );
        // Maximized: the restored rect stays, marked; with none, none.
        assert_eq!(
            sampled(old, sample(-8, -8, false, false, true)),
            Some(rect(10, 20, true))
        );
        assert_eq!(sampled(None, sample(-8, -8, false, false, true)), None);
        // Minimized (whatever the maximized flag says) or full screen: nothing.
        assert_eq!(
            sampled(old, sample(-32000, -32000, true, false, false)),
            old
        );
        assert_eq!(sampled(old, sample(-32000, -32000, true, false, true)), old);
        assert_eq!(sampled(old, sample(0, 0, false, true, false)), old);
        assert_eq!(sampled(None, sample(0, 0, false, true, false)), None);
        // A window the OS placed gets its first rect.
        assert_eq!(
            sampled(None, sample(50, 60, false, false, false)),
            Some(rect(50, 60, false))
        );
    }

    /// A sample that lands after the window closed changes nothing: its entry
    /// is in the closed chain, and a window not in `open` is not added.
    #[test]
    fn a_sample_after_a_close_changes_nothing() {
        let t0 = Instant::now();
        let mut l = Layouts {
            open: HashMap::from([("main".to_string(), layout(&["c:/a"]))]),
            ..Default::default()
        };
        spawned(
            &mut l,
            "w1",
            Layout {
                rect: Some(rect(10, 20, false)),
                ..layout(&["c:/b"])
            },
        );
        record(&mut l, "w1", sample(50, 60, false, false, false));
        assert_eq!(l.open["w1"].rect, Some(rect(50, 60, false)));
        assert!(close(&mut l, "w1", t0));
        record(&mut l, "w1", sample(90, 90, false, false, false));
        assert!(!l.open.contains_key("w1"));
        assert_eq!(l.closed[0].2.rect, Some(rect(50, 60, false)));
    }

    /// A report carries tabs only: the entry keeps the rect its samples set.
    #[test]
    fn a_report_keeps_the_rect() {
        let mut l = Layouts::default();
        report(&mut l, "w1", layout(&["c:/b"]));
        assert_eq!(l.open["w1"].rect, None);
        record(&mut l, "w1", sample(50, 60, false, false, false));
        report(&mut l, "w1", layout(&["c:/b", "c:/c"]));
        assert_eq!(
            l.open["w1"],
            Layout {
                rect: Some(rect(50, 60, false)),
                ..layout(&["c:/b", "c:/c"])
            }
        );
    }

    /// The first entry seeds `main` without its rect (window-state places
    /// `main`); the others keep theirs for `spawn`, in the file too.
    #[test]
    fn main_is_seeded_without_a_rect() {
        let path = temp_path("seed-rect");
        let with_rect = |tabs, x| Layout {
            rect: Some(rect(x, 20, x > 100)),
            ..layout(tabs)
        };
        write_layouts(
            &path,
            &HashMap::from([
                ("w1".to_string(), with_rect(&["c:/a"], 10)),
                ("w2".to_string(), with_rect(&["c:/b"], 200)),
            ]),
        );
        let mut l = Layouts::default();
        let taken = take(&mut l, &path);
        assert_eq!(
            taken.layouts,
            vec![with_rect(&["c:/a"], 10), with_rect(&["c:/b"], 200)]
        );
        assert_eq!(l.open["main"], layout(&["c:/a"]));
        remove(&path);
    }

    /// No rect, no `rect` key: an older app reads the file as before, and a
    /// file it wrote reads as no rect.
    #[test]
    fn a_layout_without_a_rect_reads_and_writes_as_before() {
        let text = serde_json::to_string(&layout(&["c:/a"])).unwrap();
        assert_eq!(text, r#"{"tabs":["c:/a"],"active":"c:/a"}"#);
        assert_eq!(
            serde_json::from_str::<Layout>(&text).unwrap(),
            layout(&["c:/a"])
        );
    }

    /// The getters are physical: the position stays so on Windows and goes
    /// over the window's scale elsewhere; the size goes over it everywhere.
    #[test]
    fn a_frame_is_taken_to_the_rects_units() {
        assert_eq!(
            rect_units((-11, 300), (1500, 1050), 1.5, true),
            ((-11, 300), (1000.0, 700.0))
        );
        assert_eq!(
            rect_units((3000, 300), (2000, 1400), 2.0, false),
            ((1500, 150), (1000.0, 700.0))
        );
    }

    /// A cascade from a maximized window (Windows at 100 %: outer at −8, inner
    /// the 1920×1040 work area, an 8 px border each side) lands 32 px in at its
    /// size less the offset, not moved back over it; one that fits keeps its
    /// size; on a small work area the floor wins and it lands over it.
    #[test]
    fn a_cascade_that_would_not_fit_shrinks_by_the_offset() {
        let area = (0, 0, 1920, 1040);
        let min = (716, 508);
        let fit = |pos: (i32, i32), size: (u32, u32), area: (i32, i32, u32, u32)| {
            let fit = (
                cascade_fit(pos.0, size.0, area.0, area.2, 32),
                cascade_fit(pos.1, size.1, area.1, area.3, 32),
            );
            clamp_rect(pos, fit, area, min)
        };
        // Maximized: offset from (−8, −8), the work area plus its borders.
        assert_eq!(fit((24, 24), (1936, 1056), area), ((16, 16), (1904, 1024)));
        // Mid-screen: offset, at its size.
        assert_eq!(
            fit((332, 232), (1016, 708), area),
            ((332, 232), (1016, 708))
        );
        // Near the right edge only: that axis shrinks, the other keeps.
        assert_eq!(
            fit((1032, 232), (916, 708), area),
            ((1032, 232), (884, 708))
        );
        // A work area under the floor plus the offset: the floor, moved back in, less than
        // the offset from the window at (0, 0).
        assert_eq!(
            fit((32, 32), (744, 536), (0, 0, 740, 530)),
            ((24, 22), (716, 508))
        );
    }

    /// A window flush left on Windows sits at about x = −7, its invisible
    /// border off the screen: it comes back those few pixels in.
    #[test]
    fn a_restored_rect_is_kept_on_the_screen() {
        let area = (0, 0, 1920, 1040);
        assert_eq!(
            clamp_rect((-7, 0), (1014, 707), area, (714, 507)),
            ((0, 0), (1014, 707))
        );
    }
}
