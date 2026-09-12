pub mod blame;
pub mod cli;
pub mod commit;
pub mod config;
pub mod conflict;
pub mod diff;
pub mod error;
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

use std::process::Command;

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
    let mut cmd = Command::new(git_path);
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
}
