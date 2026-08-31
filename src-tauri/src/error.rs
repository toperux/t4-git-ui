use git_core::GitError;
use serde::{Serialize, Serializer};

/// Error type returned from every Tauri command. Serializes as `{ kind, message }`.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)]
    Git(#[from] GitError),
    /// Bugs / infrastructure failures (e.g. a blocking task panicked).
    #[error("internal error: {0}")]
    Internal(String),
}

impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        AppError::Internal(e.to_string())
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        match self {
            AppError::Git(e) => e.serialize(serializer),
            AppError::Internal(msg) => {
                let mut s = serializer.serialize_struct("AppError", 2)?;
                s.serialize_field("kind", "internal")?;
                s.serialize_field("message", msg)?;
                s.end()
            }
        }
    }
}
