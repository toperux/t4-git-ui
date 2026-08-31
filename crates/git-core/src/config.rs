//! Git config reads / writes that the UI needs: identity, `core.longpaths`,
//! the default remote for fetch / push dialogs.

use git2::{ConfigLevel, ErrorCode, Repository};

use crate::{map_git2, GitError};

fn snapshot(repo: &Repository) -> Result<git2::Config, GitError> {
    repo.config()
        .and_then(|mut c| c.snapshot())
        .map_err(map_git2)
}

/// `(user.name, user.email)` from the effective config; [`GitError::Config`]
/// when either is missing or empty.
pub fn user_identity(repo: &Repository) -> Result<(String, String), GitError> {
    let cfg = snapshot(repo)?;
    let get = |key: &str| -> Result<String, GitError> {
        match cfg.get_string(key) {
            Ok(v) if !v.trim().is_empty() => Ok(v),
            Ok(_) => Err(GitError::Config(format!("{key} is empty"))),
            Err(e) if e.code() == ErrorCode::NotFound => {
                Err(GitError::Config(format!("{key} is not set")))
            }
            Err(e) => Err(map_git2(e)),
        }
    };
    Ok((get("user.name")?, get("user.email")?))
}

/// Effective value of `key`, `None` when unset (or unreadable).
pub fn get(repo: &Repository, key: &str) -> Option<String> {
    snapshot(repo).ok()?.get_string(key).ok()
}

/// Writes `key = value` to the repository-local config (`.git/config`).
pub fn set_local(repo: &Repository, key: &str, value: &str) -> Result<(), GitError> {
    repo.config()
        .and_then(|c| c.open_level(ConfigLevel::Local))
        .and_then(|mut local| local.set_str(key, value))
        .map_err(map_git2)
}

/// `core.longpaths` (Windows: lets git handle paths over 260 chars).
pub fn long_paths_enabled(repo: &Repository) -> bool {
    snapshot(repo)
        .ok()
        .and_then(|c| c.get_bool("core.longpaths").ok())
        .unwrap_or(false)
}

/// Remote to preselect: `branch.<current>.remote` when it names a remote,
/// else `origin` if it exists, else the first remote (`None` without remotes).
pub fn default_remote(repo: &Repository) -> Option<String> {
    let remotes = repo.remotes().ok()?;
    let has = |name: &str| remotes.iter().flatten().flatten().any(|r| r == name);
    let tracking = repo
        .head()
        .ok()
        .filter(|h| h.is_branch())
        .and_then(|h| h.shorthand().ok().map(String::from))
        .and_then(|b| get(repo, &format!("branch.{b}.remote")))
        .filter(|r| r != "." && has(r));
    tracking
        .or_else(|| has("origin").then(|| "origin".to_string()))
        .or_else(|| remotes.iter().flatten().flatten().next().map(String::from))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::TempRepo;

    #[test]
    fn get_set_local_and_longpaths() {
        let t = TempRepo::new();
        assert_eq!(get(&t.repo, "user.name").as_deref(), Some("Test"));
        assert_eq!(get(&t.repo, "t4.nothing"), None);
        assert!(!long_paths_enabled(&t.repo));

        set_local(&t.repo, "t4.answer", "42").unwrap();
        assert_eq!(get(&t.repo, "t4.answer").as_deref(), Some("42"));
        let file = std::fs::read_to_string(t.repo.path().join("config")).unwrap();
        assert!(file.contains("answer = 42"), "{file}");

        set_local(&t.repo, "core.longpaths", "true").unwrap();
        assert!(long_paths_enabled(&t.repo));
        assert_eq!(
            user_identity(&t.repo).unwrap(),
            ("Test".to_string(), "test@example.com".to_string())
        );
    }

    #[test]
    fn default_remote_prefers_tracking_then_origin_then_first() {
        let t = TempRepo::new();
        t.commit(&[("a", "1")], "A");
        assert_eq!(default_remote(&t.repo), None);
        t.remote("upstream");
        assert_eq!(default_remote(&t.repo).as_deref(), Some("upstream"));
        t.remote("origin");
        assert_eq!(default_remote(&t.repo).as_deref(), Some("origin"));
        set_local(&t.repo, "branch.master.remote", "upstream").unwrap();
        assert_eq!(default_remote(&t.repo).as_deref(), Some("upstream"));
        // A local-tracking upstream (`.`) is not a remote.
        set_local(&t.repo, "branch.master.remote", ".").unwrap();
        assert_eq!(default_remote(&t.repo).as_deref(), Some("origin"));
    }
}
