use std::path::Path;

use git2::{ErrorCode, Oid, Repository};
use serde::{Deserialize, Serialize};

use crate::log::types::CommitInfo;
use crate::{map_git2, GitError};

/// `git commit -F <message_file> [--amend] [--signoff] [--allow-empty]`.
/// Run through the CLI so hooks and GPG signing work (libgit2 runs no hooks).
pub fn commit_args(
    message_file: &Path,
    amend: bool,
    signoff: bool,
    allow_empty: bool,
) -> Vec<String> {
    let mut args = vec![
        "commit".to_string(),
        "-F".to_string(),
        message_file.to_string_lossy().into_owned(),
    ];
    if amend {
        args.push("--amend".to_string());
    }
    if signoff {
        args.push("--signoff".to_string());
    }
    if allow_empty {
        args.push("--allow-empty".to_string());
    }
    args
}

/// Full message of HEAD (for amend prefill); `None` when HEAD is unborn.
pub fn head_message(repo: &Repository) -> Result<Option<String>, GitError> {
    match repo.head() {
        Ok(head) => {
            let commit = head.peel_to_commit().map_err(map_git2)?;
            Ok(Some(
                String::from_utf8_lossy(commit.message_bytes()).into_owned(),
            ))
        }
        Err(e) if e.code() == ErrorCode::UnbornBranch => Ok(None),
        Err(e) => Err(map_git2(e)),
    }
}

/// Moved to [`crate::config::user_identity`]; kept under its old name.
pub use crate::config::user_identity as author_identity;

/// Full commit details for the details pane. Ref labels are attached by the caller.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub info: CommitInfo,
    /// Full commit message (summary + body).
    pub message: String,
    pub committer_name: String,
    pub committer_email: String,
}

pub fn get_commit(repo: &Repository, oid: &str) -> Result<CommitDetail, GitError> {
    let oid = Oid::from_str(oid).map_err(map_git2)?;
    let commit = repo.find_commit(oid).map_err(map_git2)?;
    let committer = commit.committer();
    Ok(CommitDetail {
        info: CommitInfo::from_commit(&commit),
        message: String::from_utf8_lossy(commit.message_bytes()).into_owned(),
        committer_name: String::from_utf8_lossy(committer.name_bytes()).into_owned(),
        committer_email: String::from_utf8_lossy(committer.email_bytes()).into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::TempRepo;

    #[test]
    fn reads_full_message() {
        let t = TempRepo::new();
        let oid = t.commit(&[("a.txt", "a")], "Subject line\n\nBody text.\n");
        let d = get_commit(&t.repo, &oid.to_string()).expect("get_commit");
        assert_eq!(d.info.summary, "Subject line");
        assert_eq!(d.message, "Subject line\n\nBody text.\n");
        assert_eq!(d.info.oid.len(), 40);
        assert_eq!(d.info.short, d.info.oid[..7]);
        assert!(!d.info.is_merge);
        assert_eq!(d.committer_email, "test@example.com");
    }

    #[test]
    fn bad_oid_is_error() {
        let t = TempRepo::new();
        assert!(get_commit(&t.repo, "nope").is_err());
        assert!(get_commit(&t.repo, &"0".repeat(40)).is_err());
    }

    #[test]
    fn commit_args_shapes() {
        let f = Path::new("msg.txt");
        assert_eq!(
            commit_args(f, false, false, false),
            ["commit", "-F", "msg.txt"]
        );
        assert_eq!(
            commit_args(f, true, true, true),
            [
                "commit",
                "-F",
                "msg.txt",
                "--amend",
                "--signoff",
                "--allow-empty"
            ]
        );
    }

    #[test]
    fn head_message_and_identity() {
        let t = TempRepo::new();
        assert_eq!(head_message(&t.repo).unwrap(), None);
        t.commit(&[("a", "a")], "Subject\n\nBody\n");
        assert_eq!(
            head_message(&t.repo).unwrap().as_deref(),
            Some("Subject\n\nBody\n")
        );
        assert_eq!(
            author_identity(&t.repo).unwrap(),
            ("Test".to_string(), "test@example.com".to_string())
        );
        t.set_config("user.email", "");
        assert!(
            matches!(author_identity(&t.repo), Err(GitError::Config(m)) if m.contains("user.email"))
        );
    }
}
