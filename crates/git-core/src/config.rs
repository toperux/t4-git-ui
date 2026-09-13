//! Git config reads / writes that the UI needs: identity, `core.longpaths`,
//! the default remote for fetch / push dialogs, the signing keys the Settings
//! dialog shows, and the one write path to the global file.

use std::collections::BTreeMap;

use git2::{Config, ConfigLevel, ErrorCode, Repository};
use serde::{Deserialize, Serialize};

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

/// The file writes go to: "the global/XDG configuration file according to
/// git's rules" — `~/.gitconfig` unless the user created the XDG file, and
/// created on the first set. Never a multi-level `set_str`: libgit2 would pick
/// the highest level present, which may be neither.
pub fn global_config() -> Result<Config, GitError> {
    Config::open_default()
        .and_then(|mut c| c.open_global())
        .map_err(map_git2)
}

/// Writes `key = value` to the global config (see [`global_config`]).
pub fn set_global(key: &str, value: &str) -> Result<(), GitError> {
    global_config()?.set_str(key, value).map_err(map_git2)
}

/// Removes `key` from the global config; one that was never set is not an error.
pub fn unset_global(key: &str) -> Result<(), GitError> {
    match global_config()?.remove(key) {
        Err(e) if e.code() == ErrorCode::NotFound => Ok(()),
        r => r.map_err(map_git2),
    }
}

/// The config keys the Settings dialog's Signing section reads and writes.
pub const SIGNING_KEYS: [&str; 6] = [
    "gpg.format",
    "user.signingkey",
    "commit.gpgsign",
    "tag.gpgsign",
    "gpg.program",
    "gpg.ssh.program",
];

/// One signing key: its effective value (`None` when unset) and whether the
/// repository's own `.git/config` is what sets it — the dialog writes globally,
/// so a local entry would win over whatever it saves.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SigningEntry {
    pub value: Option<String>,
    pub local: bool,
}

/// [`SIGNING_KEYS`] as `repo` sees them; without a repository (the start
/// screen) the effective config answers alone and nothing is `local`.
pub fn signing(repo: Option<&Repository>) -> Result<BTreeMap<String, SigningEntry>, GitError> {
    let cfg = match repo {
        Some(r) => snapshot(r)?,
        None => Config::open_default()
            .and_then(|mut c| c.snapshot())
            .map_err(map_git2)?,
    };
    let local = repo
        .and_then(|r| r.config().ok())
        .and_then(|c| c.open_level(ConfigLevel::Local).ok())
        .and_then(|mut c| c.snapshot().ok());
    Ok(SIGNING_KEYS
        .iter()
        .map(|key| {
            let entry = SigningEntry {
                value: cfg.get_string(key).ok(),
                local: local.as_ref().is_some_and(|l| l.get_string(key).is_ok()),
            };
            ((*key).to_string(), entry)
        })
        .collect())
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

    /// The global file is process-wide state, so this is the one test that touches
    /// it: libgit2's three search paths are pointed at an empty temp directory for
    /// the round trip and reset afterwards — the user's own `~/.gitconfig` is never
    /// read or written.
    #[test]
    fn global_round_trip_and_signing_entries() {
        let home = tempfile::tempdir().expect("tempdir");
        const LEVELS: [ConfigLevel; 3] =
            [ConfigLevel::System, ConfigLevel::Global, ConfigLevel::XDG];
        // Restores the paths on the way out, a failed assertion included — otherwise the
        // rest of the run would keep reading the temp directory.
        struct Reset;
        impl Drop for Reset {
            fn drop(&mut self) {
                for level in LEVELS {
                    let _ = unsafe { git2::opts::reset_search_path(level) };
                }
            }
        }
        let _reset = Reset;
        for level in LEVELS {
            // Safe here: `_reset` restores the paths, and no other test writes them.
            unsafe { git2::opts::set_search_path(level, home.path()) }.expect("search path");
        }

        set_global("user.signingkey", "ABCD1234").unwrap();
        set_global("commit.gpgsign", "true").unwrap();
        let global = signing(None).expect("signing");
        assert_eq!(global["user.signingkey"].value.as_deref(), Some("ABCD1234"));
        assert!(!global["user.signingkey"].local);
        assert_eq!(global["gpg.format"].value, None);
        assert_eq!(global.len(), SIGNING_KEYS.len());

        // A repository's own entry wins over the global one, and says so.
        let t = TempRepo::new();
        set_local(&t.repo, "commit.gpgsign", "false").unwrap();
        let repo = signing(Some(&t.repo)).expect("signing");
        assert_eq!(repo["commit.gpgsign"].value.as_deref(), Some("false"));
        assert!(repo["commit.gpgsign"].local);
        assert_eq!(repo["user.signingkey"].value.as_deref(), Some("ABCD1234"));
        assert!(!repo["user.signingkey"].local);

        unset_global("user.signingkey").unwrap();
        // Removing a key that was never set is not an error.
        unset_global("gpg.ssh.program").unwrap();
        assert_eq!(
            signing(None).expect("signing")["user.signingkey"].value,
            None
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
