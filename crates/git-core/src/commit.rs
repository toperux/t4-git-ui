use std::path::Path;

use git2::{ErrorCode, Oid, Repository};
use serde::{Deserialize, Serialize};

use crate::log::types::CommitInfo;
use crate::{map_git2, GitError};

/// `git commit -F <message_file> [--amend] [--signoff]`.
/// Run through the CLI so hooks and GPG signing work (libgit2 runs no hooks).
pub fn commit_args(message_file: &Path, amend: bool, signoff: bool) -> Vec<String> {
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

/// The comment prefix git writes `MERGE_MSG`'s conflict block with:
/// `core.commentChar`, `#` when unset (and for `auto`, which git resolves per
/// message — `#` unless the message itself starts a line with it).
fn comment_prefix(repo: &Repository) -> String {
    crate::config::get(repo, "core.commentChar")
        .filter(|v| !v.is_empty() && v != "auto")
        .unwrap_or_else(|| "#".to_string())
}

/// The message git prepared for the commit in progress — `MERGE_MSG`, written
/// by a merge / cherry-pick / revert / rebase that stopped for conflicts —
/// cleaned up the way `git commit` would: comment lines dropped, surrounding
/// blank lines trimmed. `None` when there is no file, or nothing left of it.
pub fn pending_message(repo: &Repository) -> Option<String> {
    let raw = std::fs::read_to_string(repo.path().join("MERGE_MSG")).ok()?;
    let prefix = comment_prefix(repo);
    let msg = raw
        .lines()
        .filter(|l| !l.starts_with(prefix.as_str()))
        .collect::<Vec<_>>()
        .join("\n");
    let msg = msg.trim();
    (!msg.is_empty()).then(|| msg.to_string())
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
        assert_eq!(commit_args(f, false, false), ["commit", "-F", "msg.txt"]);
        assert_eq!(
            commit_args(f, true, true),
            ["commit", "-F", "msg.txt", "--amend", "--signoff"]
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

    #[test]
    fn pending_message_drops_the_comments_git_would() {
        let t = TempRepo::new();
        assert_eq!(pending_message(&t.repo), None);
        let path = t.repo.path().join("MERGE_MSG");
        std::fs::write(&path, "Merge branch 'conflict'\n\n# Conflicts:\n#\tf.txt\n").unwrap();
        assert_eq!(
            pending_message(&t.repo).as_deref(),
            Some("Merge branch 'conflict'")
        );
        // A body survives; the split into summary + body is the editor's job.
        std::fs::write(&path, "Revert \"x\"\n\nThis reverts commit abc.\n").unwrap();
        assert_eq!(
            pending_message(&t.repo).as_deref(),
            Some("Revert \"x\"\n\nThis reverts commit abc.")
        );
        std::fs::write(&path, "# nothing but comments\n").unwrap();
        assert_eq!(pending_message(&t.repo), None);
    }

    #[test]
    fn pending_message_follows_core_comment_char() {
        let t = TempRepo::new();
        let path = t.repo.path().join("MERGE_MSG");
        std::fs::write(&path, "Merge branch 'conflict'\n\n; Conflicts:\n;\tf.txt\n").unwrap();
        // With the default the `;` lines are message text, not comments.
        assert!(pending_message(&t.repo)
            .expect("message")
            .contains("; Conflicts:"));

        t.set_config("core.commentChar", ";");
        assert_eq!(
            pending_message(&t.repo).as_deref(),
            Some("Merge branch 'conflict'")
        );
        // `auto` is git's per-message pick; `#` is what it lands on here.
        t.set_config("core.commentChar", "auto");
        std::fs::write(&path, "Merge branch 'conflict'\n\n# Conflicts:\n#\tf.txt\n").unwrap();
        assert_eq!(
            pending_message(&t.repo).as_deref(),
            Some("Merge branch 'conflict'")
        );
    }
}
