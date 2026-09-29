//! git started as from a mounted AppImage gets the host's environment, not the image's: every hook
//! and helper git starts inherits it. Its own test binary, because it sets process variables.
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
}
