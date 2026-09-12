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
    /// The requested walk generation has been superseded — the caller should restart its walk.
    #[error("{0}")]
    StaleGeneration(String),
    /// The repo id names no open repository — normal after a close, so the frontend stays quiet.
    #[error("{0}")]
    NotOpen(String),
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
            AppError::StaleGeneration(msg) => ("staleGeneration", msg.clone()),
            AppError::NotOpen(msg) => ("notOpen", msg.clone()),
            AppError::Internal(msg) => ("internal", msg.clone()),
        };
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("kind", kind)?;
        s.serialize_field("message", &message)?;
        s.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_kind_and_message() {
        let v = serde_json::to_value(AppError::Busy).unwrap();
        assert_eq!(v["kind"], "busy");
        assert_eq!(v["message"], "another operation is running");

        let v = serde_json::to_value(AppError::StaleGeneration("gen 3 is old".into())).unwrap();
        assert_eq!(v["kind"], "staleGeneration");
        assert_eq!(v["message"], "gen 3 is old");

        let v = serde_json::to_value(AppError::NotOpen("repo not open: c:/x".into())).unwrap();
        assert_eq!(v["kind"], "notOpen");
        assert_eq!(v["message"], "repo not open: c:/x");

        let v = serde_json::to_value(AppError::Internal("boom".into())).unwrap();
        assert_eq!(v["kind"], "internal");
        assert_eq!(v["message"], "boom");

        // Git errors keep git-core's own `{kind, message}` shape.
        let v = serde_json::to_value(AppError::Git(GitError::Refused("no".into()))).unwrap();
        assert_eq!(v["kind"], "refused");
        assert_eq!(v["message"], "no");
    }
}
