use std::path::PathBuf;

use serde::ser::{Serialize, SerializeStruct, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error(transparent)]
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
