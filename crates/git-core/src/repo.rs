use std::path::{Path, PathBuf};
use std::sync::Arc;

use git2::{ErrorCode, Repository};
use parking_lot::{Mutex, RwLock};
use serde::{Deserialize, Serialize};

use crate::log::cache::LogCache;
use crate::GitError;

/// Identifies an open repository: the canonical working-directory path
/// (Windows: no `\\?\` prefix, lowercase drive letter) so the same repo opened
/// via different spellings / subdirectories maps to one id.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct RepoId(String);

/// Normalizes a canonicalized workdir path string: strips the Windows verbatim
/// prefix (`\\?\`, `\\?\UNC\`), lowercases the drive letter and drops trailing
/// separators — except on a drive root (`d:\`), where the separator is what
/// makes the path absolute rather than drive-relative.
pub fn normalize_workdir_string(mut s: String) -> String {
    if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
        s = format!(r"\\{rest}");
    } else if let Some(rest) = s.strip_prefix(r"\\?\") {
        s = rest.to_string();
    }
    if s.len() >= 2 && s.as_bytes()[1] == b':' {
        s[..1].make_ascii_lowercase();
    }
    while s.len() > 1 && (s.ends_with('\\') || s.ends_with('/')) && !s[..s.len() - 1].ends_with(':')
    {
        s.pop();
    }
    s
}

impl RepoId {
    fn from_workdir(workdir: &Path) -> (RepoId, PathBuf) {
        let canonical = std::fs::canonicalize(workdir).unwrap_or_else(|_| workdir.to_path_buf());
        let s = normalize_workdir_string(canonical.to_string_lossy().into_owned());
        (RepoId(s.clone()), PathBuf::from(s))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for RepoId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// An open repository shared between commands.
///
/// `git2::Repository` is `Send` but not `Sync`, so it lives behind a mutex and
/// should only be borrowed briefly. Long walks call [`RepoHandle::open_private`]
/// for their own handle so they never block short reads.
pub struct RepoHandle {
    pub id: RepoId,
    /// Working directory (canonical, see [`RepoId`]).
    pub path: PathBuf,
    pub git_dir: PathBuf,
    pub git2: Mutex<Repository>,
    pub log: RwLock<LogCache>,
}

impl RepoHandle {
    /// Discovers the repository containing `path`. Bare repositories are rejected.
    pub fn open(path: impl AsRef<Path>) -> Result<Arc<RepoHandle>, GitError> {
        let path = path.as_ref();
        let repo = Repository::discover(path).map_err(|e| {
            if e.code() == ErrorCode::NotFound {
                GitError::NotARepo(path.to_path_buf())
            } else {
                map_git2(e)
            }
        })?;
        let Some(workdir) = repo.workdir().filter(|_| !repo.is_bare()) else {
            return Err(GitError::NotARepo(path.to_path_buf()));
        };
        let (id, path) = RepoId::from_workdir(workdir);
        let git_dir = repo.path().to_path_buf();
        Ok(Arc::new(RepoHandle {
            id,
            path,
            git_dir,
            git2: Mutex::new(repo),
            log: RwLock::new(LogCache::default()),
        }))
    }

    /// Opens a second `Repository` handle on the same repo (cheap) for
    /// long-running work such as revwalks.
    pub fn open_private(&self) -> Result<Repository, GitError> {
        Repository::open(&self.path).map_err(map_git2)
    }

    /// Directory name of the working directory (used as display name).
    pub fn name(&self) -> String {
        self.path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| self.id.as_str().to_string())
    }
}

/// Converts a libgit2 error, recognizing lock contention (`index.lock` etc.)
/// as [`GitError::IndexLocked`].
pub fn map_git2(e: git2::Error) -> GitError {
    if e.code() == ErrorCode::Locked || e.message().contains("index.lock") {
        GitError::IndexLocked
    } else {
        GitError::Git2(e)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicBool;

    use super::*;
    use crate::log::{walk, LogFilter, RevSpec};
    use crate::test_util::TempRepo;

    #[test]
    fn open_from_subdir_yields_same_id() {
        let t = TempRepo::new();
        t.commit(&[("dir/a.txt", "a")], "init");
        let a = RepoHandle::open(t.path()).expect("open root");
        let b = RepoHandle::open(t.path().join("dir")).expect("open subdir");
        assert_eq!(a.id, b.id);
        assert!(a.git_dir.ends_with(".git") || a.git_dir.ends_with(".git/"));
        assert!(!a.name().is_empty());
        #[cfg(windows)]
        {
            let s = a.id.as_str();
            assert!(!s.starts_with(r"\\?\"), "id has verbatim prefix: {s}");
            assert!(
                s.as_bytes()[0].is_ascii_lowercase(),
                "drive not lowercase: {s}"
            );
        }
    }

    #[test]
    fn normalize_workdir_strings() {
        let n = |s: &str| normalize_workdir_string(s.to_string());
        assert_eq!(n(r"\\?\D:\"), r"d:\");
        assert_eq!(n(r"D:\"), r"d:\");
        assert_eq!(n(r"\\?\C:\repo\"), r"c:\repo");
        assert_eq!(n(r"\\?\C:\repo"), r"c:\repo");
        assert_eq!(n(r"\\?\UNC\srv\share\x\"), r"\\srv\share\x");
        assert_eq!(n("/home/x/repo/"), "/home/x/repo");
        assert_eq!(n("/"), "/");
    }

    #[test]
    fn linked_worktree_is_a_separate_repo() {
        let t = TempRepo::new();
        let a = t.commit(&[("a", "1")], "A");
        let wt_dir = tempfile::tempdir().expect("tempdir");
        let wt_path = wt_dir.path().join("wt");
        // Creates branch `wt` at HEAD and checks it out in `wt_path`.
        t.repo.worktree("wt", &wt_path, None).expect("worktree");
        let b = t.commit(&[("b", "1")], "B");

        let main = RepoHandle::open(t.path()).expect("open main");
        let wt = RepoHandle::open(&wt_path).expect("open worktree");
        assert_ne!(main.id, wt.id);

        let heads = |h: &RepoHandle| {
            let repo = h.open_private().expect("open_private");
            let mut out = Vec::new();
            walk(
                &repo,
                &RevSpec::Head,
                &LogFilter::default(),
                &AtomicBool::new(false),
                |chunk| {
                    out.extend(chunk.into_iter().map(|r| r.commit.oid));
                    true
                },
            )
            .expect("walk");
            out
        };
        assert_eq!(heads(&main), vec![b.to_string(), a.to_string()]);
        assert_eq!(heads(&wt), vec![a.to_string()]);
    }

    #[test]
    fn open_non_repo_is_not_a_repo() {
        let dir = tempfile::tempdir().expect("tempdir");
        match RepoHandle::open(dir.path()) {
            Err(GitError::NotARepo(_)) => {}
            other => panic!("expected NotARepo, got {:?}", other.map(|_| ())),
        }
    }

    #[test]
    fn open_bare_is_not_a_repo() {
        let dir = tempfile::tempdir().expect("tempdir");
        Repository::init_bare(dir.path()).expect("init bare");
        match RepoHandle::open(dir.path()) {
            Err(GitError::NotARepo(_)) => {}
            other => panic!("expected NotARepo, got {:?}", other.map(|_| ())),
        }
    }

    #[test]
    fn map_git2_detects_lock() {
        let e = git2::Error::new(ErrorCode::Locked, git2::ErrorClass::Index, "locked");
        assert!(matches!(map_git2(e), GitError::IndexLocked));
        let e = git2::Error::new(
            ErrorCode::GenericError,
            git2::ErrorClass::Os,
            "failed to lock file '/x/.git/index.lock' for writing",
        );
        assert!(matches!(map_git2(e), GitError::IndexLocked));
        let e = git2::Error::new(ErrorCode::NotFound, git2::ErrorClass::Odb, "nope");
        assert!(matches!(map_git2(e), GitError::Git2(_)));
    }
}
