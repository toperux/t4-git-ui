// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Before `run()`, which starts every thread: `set_var` must not race another thread's read.
    let in_appimage = git_core::in_appimage().is_some();
    if let Some(backend) = gdk_backend(in_appimage) {
        keep_host_value("GDK_BACKEND");
        std::env::set_var("GDK_BACKEND", backend);
    }
    // Bundler 2.10's gtk hook bundles the build host's GIO modules, dconf's among them, so GTK
    // would read the user's settings: with the file chooser's `startup-mode` at `cwd`, every
    // picker opened inside the read-only mount, the folder AppRun leaves the app in (and must:
    // the hook points libwebkit's helper paths at `././`). In memory, GTK keeps its defaults, as
    // 0.10.18 did: the bundled schemas', `recent` on CI's Ubuntu 22.04 (a build on an Ubuntu
    // desktop bundles that desktop's override, `cwd`). `host_env` gives the processes the app
    // starts the user's own value back, or none, so they read the user's settings (WebKit's
    // helpers, not started through it, keep the app's).
    if in_appimage {
        keep_host_value("GSETTINGS_BACKEND");
        std::env::set_var("GSETTINGS_BACKEND", "memory");
    }
    t4_git_ui_lib::run()
}

/// The `GDK_BACKEND` to force: `x11` inside an AppImage, whatever the variable held, else none.
/// linuxdeploy's gtk hook used to export it (tauri#8541, a crash on Wayland), and native Wayland
/// ignores the app's window positions (the tear-off placement, window-state's restore); the hook
/// embedded in tauri-bundler 2.10 no longer does. `host_env` gives the processes the app starts
/// the user's own value back, or none: an editor started from the app runs as it would outside
/// it.
fn gdk_backend(in_appimage: bool) -> Option<&'static str> {
    in_appimage.then_some("x11")
}

/// Records the user's `name`, as is, in `T4_HOST_<name>` before the app overrides it, for
/// git-core's `without_appdir` to hand back to the processes the app starts; set only when
/// `name` was.
fn keep_host_value(name: &str) {
    if let Some(value) = std::env::var_os(name) {
        std::env::set_var(format!("T4_HOST_{name}"), value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gdk_backend_is_x11_only_inside_an_appimage() {
        assert_eq!(gdk_backend(true), Some("x11"));
        assert_eq!(gdk_backend(false), None);
    }
}
