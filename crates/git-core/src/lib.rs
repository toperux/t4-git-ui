pub mod blame;
pub mod cli;
pub mod commit;
pub mod config;
pub mod conflict;
pub mod diff;
pub mod error;
pub mod linked;
pub mod log;
pub mod patch;
pub mod refs;
pub mod repo;
pub mod stage;
pub mod status;
#[cfg(any(test, feature = "test-util"))]
pub mod test_util;
pub mod tools;
pub mod tree;
pub mod watch;

pub use error::GitError;
pub use repo::{map_git2, RepoHandle, RepoId};

use std::env;
use std::ffi::{OsStr, OsString};
use std::path::{Component, Path, PathBuf};
use std::process::Command;

/// Inside an AppImage, `AppRun` points LD_LIBRARY_PATH, PYTHONHOME and the GTK / GIO module
/// variables into the image; a host program started from here must not load the image's libraries.
/// Every process the app starts is built with `host_command` (clippy enforces it, D7) or, for a
/// `Command` made elsewhere (`open::commands`), passed through `host_env`. AppRun also changed into
/// `$APPDIR/usr`, so the child starts in [`start_dir`] instead: left inside the read-only image, it
/// would keep the mount busy after Quit or an update's relaunch. A folder the caller sets
/// afterwards (git's `repo_dir`) wins. The child also drops every descriptor from 3 up that is
/// not close-on-exec (`drop_inherited_fds`, Linux). Outside an AppImage all three do nothing.
pub fn host_env(cmd: &mut Command) {
    let Some(appdirs) = in_appimage() else {
        return;
    };
    for (name, value) in without_appdir(&appdirs, env::vars_os()) {
        match value {
            Some(value) => cmd.env(name, value),
            None => cmd.env_remove(name),
        };
    }
    cmd.current_dir(start_dir(env::var_os("OWD")));
    #[cfg(target_os = "linux")]
    drop_inherited_fds(cmd);
}

/// The folder a child starts in inside an AppImage: `OWD`, the one the image was started from,
/// when it is an absolute folder outside any `.mount_*` image, else `/`. An older AppImage that
/// relaunches the new one starts it from its own `/tmp/.mount_<old>/usr`, and the new runtime
/// records that as `OWD`: kept, every later child would hold the old mount busy.
fn start_dir(owd: Option<OsString>) -> PathBuf {
    let in_image = |dir: &Path| {
        dir.components().any(
            |c| matches!(c, Component::Normal(n) if n.to_string_lossy().starts_with(".mount_")),
        )
    };
    owd.map(PathBuf::from)
        .filter(|dir| dir.is_absolute() && dir.is_dir() && !in_image(dir))
        .unwrap_or_else(|| "/".into())
}

/// Makes `cmd`'s child mark every descriptor from 3 up close-on-exec just before it runs the
/// program, the app's own as well as inherited ones. The AppImage runtime's FUSE daemon unmounts
/// the image once every read end of its keepalive pipe is closed, and the app inherits one without
/// `O_CLOEXEC`: passed on, it kept the old image mounted after an update, through the relaunch
/// until the new app quit, through git and the external tools while they ran, and through what
/// they leave behind (git's credential-cache daemon, an app xdg-open started) for as long as that
/// lived. Only the app's own children drop it: WebKit's helper processes keep it, or the image
/// unmounts under them as they tear down and they die of SIGBUS.
/// `close_range` is one syscall, no allocation, so it is safe between fork and exec; std has
/// already put stdio on 0-2 by then, and its exec-error pipe is close-on-exec anyway.
/// `close_range` exists from Linux 5.9, its `CLOSE_RANGE_CLOEXEC` flag from 5.11. An error
/// (`ENOSYS` before 5.9, `EINVAL` on 5.9-5.10, `EPERM` under a seccomp filter) is ignored and
/// leaves the child as it was before this hook.
#[cfg(target_os = "linux")]
fn drop_inherited_fds(cmd: &mut Command) {
    use std::os::unix::process::CommandExt;
    // SAFETY: the hook makes one raw syscall, which is async-signal-safe and takes no lock.
    unsafe {
        cmd.pre_exec(|| {
            libc::syscall(
                libc::SYS_close_range,
                3u32,
                u32::MAX,
                libc::CLOSE_RANGE_CLOEXEC,
            );
            Ok(())
        });
    }
}

/// `Command::new(program)` with [`host_env`] applied: the one way the app starts a process.
pub fn host_command(program: impl AsRef<OsStr>) -> Command {
    #[allow(clippy::disallowed_methods)]
    let mut cmd = Command::new(program);
    host_env(&mut cmd);
    cmd
}

/// `APPDIR` as given and canonicalized, when this process runs from a mounted AppImage (Linux
/// only).
pub fn in_appimage() -> Option<[PathBuf; 2]> {
    if !cfg!(target_os = "linux") {
        return None;
    }
    appdir_of(
        env::var_os("APPIMAGE"),
        env::var_os("APPDIR"),
        &env::current_exe().ok()?,
    )
}

/// The gate's checks: both variables set, `APPDIR` absolute and not a root (an empty or root one
/// would match every path), and the program running from inside it. `current_exe()` is already
/// resolved, so it is compared with the canonical `APPDIR` (a symlinked `TMPDIR`).
fn appdir_of(
    appimage: Option<OsString>,
    appdir: Option<OsString>,
    exe: &Path,
) -> Option<[PathBuf; 2]> {
    appimage?;
    let raw = PathBuf::from(appdir?);
    if !raw.is_absolute() || raw.parent().is_none() {
        return None;
    }
    let canonical = std::fs::canonicalize(&raw).ok()?;
    if canonical.parent().is_none() || !exe.starts_with(&canonical) {
        return None;
    }
    Some([raw, canonical])
}

/// What to change in a child's environment: every variable with a path-list entry under one of
/// `appdirs` loses those entries and its empty ones (`None` when nothing is left), and the
/// runtime's `APPIMAGE`, `ARGV0`, `OWD` and AppRun's `PYTHONDONTWRITEBYTECODE` go. The two the
/// app overrides for itself (`main.rs`), `GDK_BACKEND` and `GSETTINGS_BACKEND`, get the user's
/// value back from where `main.rs` recorded it, `T4_HOST_<name>`, or go when none was recorded;
/// the `T4_HOST_*` names go. Variables not listed stay as they are.
fn without_appdir(
    appdirs: &[PathBuf],
    vars: impl IntoIterator<Item = (OsString, OsString)>,
) -> Vec<(OsString, Option<OsString>)> {
    const DROPPED: [&str; 4] = ["APPIMAGE", "ARGV0", "OWD", "PYTHONDONTWRITEBYTECODE"];
    const RESTORED: [(&str, &str); 2] = [
        ("GDK_BACKEND", "T4_HOST_GDK_BACKEND"),
        ("GSETTINGS_BACKEND", "T4_HOST_GSETTINGS_BACKEND"),
    ];
    let vars: Vec<(OsString, OsString)> = vars.into_iter().collect();
    let recorded = |host: &str| {
        vars.iter()
            .find(|(name, _)| name == host)
            .map(|(_, value)| value.clone())
    };
    let restored: Vec<(OsString, Option<OsString>)> = RESTORED
        .iter()
        .flat_map(|(name, host)| [(name.into(), recorded(host)), (host.into(), None)])
        .collect();
    let inside = |entry: &Path| in_appdir(appdirs, entry);
    let mut out = Vec::new();
    for (name, value) in vars {
        if RESTORED.iter().any(|(n, h)| name == *n || name == *h) {
            continue;
        }
        if DROPPED.iter().any(|d| name == *d) {
            out.push((name, None));
            continue;
        }
        let entries: Vec<PathBuf> = env::split_paths(&value).collect();
        if !entries.iter().any(|e| inside(e)) {
            continue;
        }
        let kept: Vec<PathBuf> = entries
            .into_iter()
            .filter(|e| !e.as_os_str().is_empty() && !inside(e))
            .collect();
        let value = if kept.is_empty() {
            None
        } else {
            env::join_paths(kept).ok()
        };
        out.push((name, value));
    }
    out.extend(restored);
    out
}

/// Whether a path-list `entry` lies under one of `appdirs` ([`in_appimage`]'s pair).
pub(crate) fn in_appdir(appdirs: &[PathBuf], entry: &Path) -> bool {
    appdirs.iter().any(|dir| entry.starts_with(dir))
}

/// `(major, minor)` of the oldest git the CLI layer works with: `--end-of-options`,
/// which every op passes, landed in 2.24.
pub const MIN_GIT_VERSION: (u32, u32) = (2, 24);

/// `(major, minor)` of a `git version X.Y.Z…` line (`git_version`'s output);
/// `None` when it does not look like one.
pub fn parse_git_version(version: &str) -> Option<(u32, u32)> {
    let mut parts = version.trim().strip_prefix("git version ")?.split('.');
    Some((parts.next()?.parse().ok()?, parts.next()?.parse().ok()?))
}

/// Runs `<git_path> --version` and returns its trimmed stdout (e.g. `git version 2.55.0`).
pub fn git_version(git_path: &str) -> Result<String, GitError> {
    let mut cmd = host_command(git_path);
    cmd.arg("--version");

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = match cmd.output() {
        Ok(o) => o,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Err(GitError::GitNotFound),
        Err(e) => return Err(e.into()),
    };

    if !output.status.success() {
        return Err(GitError::Cli {
            cmd: format!("{git_path} --version"),
            code: output.status.code().unwrap_or(-1),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_version_reports_version_string() {
        match git_version("git") {
            Ok(v) => assert!(v.starts_with("git version"), "unexpected output: {v:?}"),
            Err(GitError::GitNotFound) => eprintln!("git not on PATH; skipping"),
            Err(e) => panic!("git --version failed: {e}"),
        }
    }

    #[test]
    fn parse_git_version_reads_major_and_minor() {
        assert_eq!(parse_git_version("git version 2.24.0"), Some((2, 24)));
        assert_eq!(
            parse_git_version("git version 2.55.0.windows.1"),
            Some((2, 55))
        );
        assert_eq!(parse_git_version("git version 2.23.9"), Some((2, 23)));
        assert_eq!(parse_git_version("not a git at all"), None);
        // The floor: 2.23 is below it, 2.24 is not.
        assert!(parse_git_version("git version 2.23.9").is_some_and(|v| v < MIN_GIT_VERSION));
        assert!(parse_git_version("git version 2.24.0").is_some_and(|v| v >= MIN_GIT_VERSION));
    }

    #[test]
    fn start_dir_is_owd_when_it_is_a_folder_else_the_root() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            start_dir(Some(dir.path().as_os_str().to_owned())),
            dir.path()
        );
        let gone = dir.path().join("gone");
        assert_eq!(start_dir(Some(gone.into_os_string())), Path::new("/"));
        assert_eq!(start_dir(None), Path::new("/"));
        // A relative folder that exists (the test's own cwd) is refused too.
        assert_eq!(start_dir(Some(".".into())), Path::new("/"));
        // So is a folder inside a mounted image, such as an older AppImage's `$APPDIR/usr`.
        let mounted = dir.path().join(".mount_x").join("usr");
        std::fs::create_dir_all(&mounted).unwrap();
        assert_eq!(start_dir(Some(mounted.into_os_string())), Path::new("/"));
    }

    fn paths(entries: &[&Path]) -> OsString {
        env::join_paths(entries).unwrap()
    }

    #[test]
    fn without_appdir_drops_the_images_entries_and_nothing_else() {
        let d = env::temp_dir().join(".mount_x");
        let mine = Path::new("/opt/mine");
        let share = Path::new("/usr/share");
        let local = Path::new("/usr/local/share");
        let mut gio = d.clone().into_os_string();
        gio.push("//usr/lib/gio/modules");
        let vars = [
            // AppRun's trailing `:` is an empty entry: gone with the rest.
            (
                "LD_LIBRARY_PATH",
                paths(&[&d.join("usr/lib"), &d.join("lib"), Path::new("")]),
            ),
            ("LIBRARY_PATH", paths(&[&d.join("usr/lib"), mine])),
            ("PYTHONHOME", d.join("usr").join("").into_os_string()),
            ("GIO_EXTRA_MODULES", gio),
            (
                "XDG_DATA_DIRS",
                paths(&[&d.join("usr/share"), share, local, share]),
            ),
            ("DISPLAY", ":0".into()),
            ("APPDIR", d.clone().into_os_string()),
            ("APPIMAGE", "/home/u/T4.AppImage".into()),
            ("ARGV0", "./T4.AppImage".into()),
            ("OWD", "/home/u".into()),
            ("PYTHONDONTWRITEBYTECODE", "1".into()),
            ("GSETTINGS_BACKEND", "memory".into()),
        ];
        let got = without_appdir(
            &[d.clone(), d.clone()],
            vars.into_iter().map(|(k, v)| (k.into(), v)),
        );
        let want: Vec<(OsString, Option<OsString>)> = [
            ("LD_LIBRARY_PATH", None),
            ("LIBRARY_PATH", Some(paths(&[mine]))),
            ("PYTHONHOME", None),
            ("GIO_EXTRA_MODULES", None),
            ("XDG_DATA_DIRS", Some(paths(&[share, local, share]))),
            ("APPDIR", None),
            ("APPIMAGE", None),
            ("ARGV0", None),
            ("OWD", None),
            ("PYTHONDONTWRITEBYTECODE", None),
            // The app's own backends, with nothing of the user's recorded: gone.
            ("GDK_BACKEND", None),
            ("T4_HOST_GDK_BACKEND", None),
            ("GSETTINGS_BACKEND", None),
            ("T4_HOST_GSETTINGS_BACKEND", None),
        ]
        .into_iter()
        .map(|(k, v)| (k.into(), v))
        .collect();
        assert_eq!(got, want);
    }

    /// The user's own `GDK_BACKEND` and `GSETTINGS_BACKEND`, recorded by `main.rs`, go back to
    /// a child in place of the app's; one not recorded is removed; the records themselves go.
    #[test]
    fn without_appdir_gives_the_users_backends_back() {
        let d = env::temp_dir().join(".mount_x");
        let vars = [
            ("GDK_BACKEND", "x11"),
            ("T4_HOST_GDK_BACKEND", "wayland"),
            ("GSETTINGS_BACKEND", "memory"),
        ];
        let got = without_appdir(&[d], vars.into_iter().map(|(k, v)| (k.into(), v.into())));
        let want: Vec<(OsString, Option<OsString>)> = vec![
            ("GDK_BACKEND".into(), Some("wayland".into())),
            ("T4_HOST_GDK_BACKEND".into(), None),
            ("GSETTINGS_BACKEND".into(), None),
            ("T4_HOST_GSETTINGS_BACKEND".into(), None),
        ];
        assert_eq!(got, want);

        let vars = [
            ("GSETTINGS_BACKEND", "memory"),
            ("T4_HOST_GSETTINGS_BACKEND", "keyfile"),
        ];
        let got = without_appdir(&[], vars.into_iter().map(|(k, v)| (k.into(), v.into())));
        assert_eq!(got[0], ("GDK_BACKEND".into(), None));
        assert_eq!(got[2], ("GSETTINGS_BACKEND".into(), Some("keyfile".into())));
    }

    #[test]
    fn without_appdir_also_matches_the_canonical_form() {
        let raw = env::temp_dir().join(".mount_x");
        let canonical = env::temp_dir().join("real").join(".mount_x");
        let got = without_appdir(
            &[raw, canonical.clone()],
            [(
                "GTK_PATH".into(),
                canonical.join("usr/lib/gtk-3.0").into_os_string(),
            )],
        );
        // Then the backends, always (`without_appdir_gives_the_users_backends_back`).
        assert_eq!(got[0], ("GTK_PATH".into(), None));
        assert_eq!(got.len(), 5);
    }

    #[test]
    fn appdir_of_holds_only_for_a_real_mount_running_the_program() {
        let dir = tempfile::tempdir().unwrap();
        // On Windows `canonicalize` returns a `\\?\` path: the exe is built from it, as
        // `current_exe` is.
        let real = std::fs::canonicalize(dir.path()).unwrap();
        let exe = real.join("usr/bin/t4-git-ui");
        let image = || Some(OsString::from("/home/u/T4.AppImage"));
        let appdir = |p: &Path| Some(p.as_os_str().to_owned());

        assert_eq!(
            appdir_of(image(), appdir(dir.path()), &exe),
            Some([dir.path().to_path_buf(), real.clone()])
        );
        assert_eq!(appdir_of(None, appdir(dir.path()), &exe), None);
        assert_eq!(appdir_of(image(), None, &exe), None);
        assert_eq!(appdir_of(image(), Some("mount_x".into()), &exe), None);
        // A root holds every path, the exe too: only the root check refuses it.
        let root = env::temp_dir().ancestors().last().unwrap().to_path_buf();
        assert_eq!(
            appdir_of(image(), appdir(&root), &env::temp_dir().join("x")),
            None
        );
        let outside = env::temp_dir().join("t4-git-ui");
        assert_eq!(appdir_of(image(), appdir(dir.path()), &outside), None);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn drop_inherited_fds_keeps_an_inherited_pipe_from_the_child() {
        let mut fds = [0; 2];
        // SAFETY: pipe writes two ints into `fds`, made without O_CLOEXEC like the keepalive pipe.
        assert_eq!(unsafe { libc::pipe(fds.as_mut_ptr()) }, 0);
        let child_has_it = |drop_fds: bool| {
            let mut cmd = host_command("sh");
            cmd.arg("-c")
                .arg(format!("test -e /proc/self/fd/{}", fds[0]));
            if drop_fds {
                drop_inherited_fds(&mut cmd);
            }
            cmd.status().unwrap().success()
        };
        assert!(child_has_it(false));
        assert!(!child_has_it(true));
        // SAFETY: the test closes only the two descriptors it made.
        unsafe {
            libc::close(fds[0]);
            libc::close(fds[1]);
        }
    }
}
