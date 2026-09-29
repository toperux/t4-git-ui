//! git started as from a mounted AppImage gets the host's environment, not the image's: every hook
//! and helper git starts inherits it, and none of them inherits the app's descriptors from 3 up.
//! Its own test binary, because it sets process variables.
#![cfg(target_os = "linux")]

use git_core::cli::GitCli;
use git_core::test_util::TempRepo;
use git_core::GitError;
use tokio_util::sync::CancellationToken;

fn have_git() -> bool {
    match git_core::git_version("git") {
        Ok(_) => true,
        Err(GitError::GitNotFound) => {
            eprintln!("git not on PATH; skipping");
            false
        }
        Err(e) => panic!("git --version failed: {e}"),
    }
}

#[tokio::test]
async fn git_and_what_it_starts_get_the_hosts_environment() {
    if !have_git() {
        return;
    }
    let mut fds = [0; 2];
    // SAFETY: pipe writes two ints into `fds`, made without O_CLOEXEC like the keepalive pipe.
    assert_eq!(unsafe { libc::pipe(fds.as_mut_ptr()) }, 0);
    let fd_path = format!("/proc/self/fd/{}", fds[0]);
    // Control: before the fake mount `host_command` changes nothing, so a child sees the pipe.
    let seen = git_core::host_command("test")
        .args(["-e", &fd_path])
        .status()
        .unwrap();
    assert!(seen.success());

    // The test binary's own folder stands in for the mount, so the gate's exe check holds.
    let d = std::env::current_exe()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf();
    let d_str = d.to_str().unwrap();
    std::env::set_var("APPDIR", &d);
    std::env::set_var("APPIMAGE", "/nonexistent/T4.AppImage");
    std::env::set_var("LD_LIBRARY_PATH", format!("{d_str}/usr/lib:"));
    std::env::set_var("PYTHONHOME", format!("{d_str}/usr/"));
    std::env::set_var("XDG_DATA_DIRS", format!("{d_str}/usr/share:/usr/share"));

    let t = TempRepo::new();
    let out = GitCli::new("git")
        .run(
            t.path(),
            "op",
            &["-c", "alias.e=!env", "e"],
            None,
            CancellationToken::new(),
            |_| {},
        )
        .await
        .expect("run");
    assert_eq!(out.code, 0, "{}", out.stderr);
    assert!(!out.stdout.contains(d_str), "{}", out.stdout);
    let lines: Vec<&str> = out.stdout.lines().collect();
    assert!(!lines.iter().any(|l| l.starts_with("LD_LIBRARY_PATH=")));
    assert!(!lines.iter().any(|l| l.starts_with("APPIMAGE=")));
    assert!(
        lines.contains(&"XDG_DATA_DIRS=/usr/share"),
        "{}",
        out.stdout
    );

    // The pipe does not reach git or what it starts: host_env's hook survives `Command::from`.
    let alias = format!("alias.f=!test ! -e {fd_path}");
    let out = GitCli::new("git")
        .run(
            t.path(),
            "op",
            &["-c", &alias, "f"],
            None,
            CancellationToken::new(),
            |_| {},
        )
        .await
        .expect("run");
    assert_eq!(out.code, 0, "{}", out.stderr);
    // SAFETY: the test closes only the two descriptors it made.
    unsafe {
        libc::close(fds[0]);
        libc::close(fds[1]);
    }
}
