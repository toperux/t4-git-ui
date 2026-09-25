use std::path::PathBuf;

use serde::ser::{Serialize, SerializeStruct, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum GitError {
    /// libgit2's own message only. `git2::Error`'s Display appends `; class=Os (2); code=NotFound (-3)`,
    /// which is for a bug report, not for the toast this reaches; `kind()` already says it came from git.
    #[error("{}", .0.message())]
    Git2(#[from] git2::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("`{cmd}` exited with code {code}: {stderr}")]
    Cli {
        cmd: String,
        code: i32,
        stderr: String,
    },
    #[error("not a git repository: {}", .0.display())]
    NotARepo(PathBuf),
    #[error("git executable not found")]
    GitNotFound,
    #[error("index is locked (another git process may be running)")]
    IndexLocked,
    #[error("operation cancelled")]
    Cancelled,
    #[error("conflicts in {} file(s)", .0.len())]
    Conflicts(Vec<String>),
    #[error("invalid patch")]
    InvalidPatch,
    #[error("{0}")]
    Config(String),
    /// A safety check declined the operation (e.g. deleting an unmerged branch).
    #[error("{0}")]
    Refused(String),
}

impl GitError {
    /// camelCase discriminator used in the IPC error shape `{ kind, message }`.
    pub fn kind(&self) -> &'static str {
        match self {
            GitError::Git2(_) => "git",
            GitError::Io(_) => "io",
            GitError::Cli { .. } => "cli",
            GitError::NotARepo(_) => "notARepo",
            GitError::GitNotFound => "gitNotFound",
            GitError::IndexLocked => "indexLocked",
            GitError::Cancelled => "cancelled",
            GitError::Conflicts(_) => "conflicts",
            GitError::InvalidPatch => "invalidPatch",
            GitError::Config(_) => "config",
            GitError::Refused(_) => "refused",
        }
    }
}

/// Serializes as `{ "kind": "...", "message": "..." }`.
impl Serialize for GitError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("GitError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The toast shows `message` as it is, so the class / code tail must not reach it.
    #[test]
    fn a_libgit2_error_shows_its_message_alone() {
        let e = GitError::from(git2::Error::new(
            git2::ErrorCode::NotFound,
            git2::ErrorClass::Os,
            "could not find repository at 'x'",
        ));
        assert_eq!(e.to_string(), "could not find repository at 'x'");
        let v = serde_json::to_value(&e).unwrap();
        assert_eq!(v["kind"], "git");
        assert_eq!(v["message"], "could not find repository at 'x'");
    }
}
