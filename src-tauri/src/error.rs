use git_core::GitError;
use serde::{Serialize, Serializer};

/// Error type returned from every Tauri command. Serializes as `{ kind, message }`.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)]
    Git(#[from] GitError),
    /// Another mutating operation holds the repo's op lock.
    #[error("another operation is running")]
    Busy,
    /// Bugs / infrastructure failures (e.g. a blocking task panicked).
    #[error("internal error: {0}")]
    Internal(String),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let (kind, message) = match self {
            AppError::Git(e) => return e.serialize(serializer),
            AppError::Busy => ("busy", self.to_string()),
            AppError::Internal(msg) => ("internal", msg.clone()),
        };
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("kind", kind)?;
        s.serialize_field("message", &message)?;
        s.end()
    }
}
