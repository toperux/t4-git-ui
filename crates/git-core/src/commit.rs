use git2::{Oid, Repository};
use serde::{Deserialize, Serialize};

use crate::log::types::CommitInfo;
use crate::{map_git2, GitError};

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
}
