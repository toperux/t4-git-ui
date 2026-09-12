use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use git2::{ErrorCode, Repository, RepositoryInitOptions};
use parking_lot::{Mutex, RwLock};
use serde::{Deserialize, Serialize};

use crate::log::cache::LogCache;
use crate::refs::AheadBehindCache;
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
    /// Memoized ahead/behind counts for `refs::snapshot_with`.
    pub ahead_behind: Mutex<AheadBehindCache>,
    /// Serializes mutating operations (stage / commit / branch ops) per repo.
    pub op_lock: tokio::sync::Mutex<()>,
    /// Held by a status scan that writes the refreshed stat cache back, and by
    /// a mutating operation for its whole run — CLI-backed ops touch the index
    /// as a subprocess, so `git2` alone does not stop a scan from writing a
    /// pre-mutation index over one. An operation takes `op_lock` *first* (so a
    /// mutation issued during another op still fails fast with `Busy` instead
    /// of waiting), then this one; scans never take `op_lock`, so the two can
    /// never deadlock.
    pub scan_lock: tokio::sync::Mutex<()>,
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
            ahead_behind: Mutex::new(AheadBehindCache::default()),
            op_lock: tokio::sync::Mutex::new(()),
            scan_lock: tokio::sync::Mutex::new(()),
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

/// `git init <path>` (creating the directory): the initial branch comes from
/// the global `init.defaultBranch`, else `main`. Refused when `path` is a
/// repository already — or sits inside one: `git init` would nest a second
/// repository there, which nothing in this app can use.
pub fn init_repo(path: impl AsRef<Path>) -> Result<(), GitError> {
    let path = path.as_ref();
    // `path` may not exist yet: discover from its nearest existing ancestor.
    let existing = path.ancestors().find(|p| p.exists());
    if let Some(repo) = existing.and_then(|p| Repository::discover(p).ok()) {
        let root = repo.workdir().unwrap_or_else(|| repo.path());
        return Err(GitError::Refused(if root == path {
            format!("{} is already a git repository", path.display())
        } else {
            format!(
                "{} is inside the repository at {}",
                path.display(),
                root.display()
            )
        }));
    }
    let branch = git2::Config::open_default()
        .ok()
        .and_then(|c| c.get_string("init.defaultBranch").ok())
        .filter(|b| !b.trim().is_empty())
        .unwrap_or_else(|| "main".to_string());
    let mut opts = RepositoryInitOptions::new();
    opts.initial_head(&branch).mkpath(true);
    Repository::init_opts(path, &opts).map_err(map_git2)?;
    Ok(())
}

/// A `.git` path component, case-insensitively (the admin directory is spelled
/// `.GIT` on a case-insensitive filesystem just as well) and ignoring trailing
/// dots and spaces, which Win32 strips when it resolves a name (`.git.` opens
/// `.git`).
pub(crate) fn has_git_component(path: &Path) -> bool {
    path.components().any(|c| {
        c.as_os_str()
            .to_string_lossy()
            .trim_end_matches(['.', ' '])
            .eq_ignore_ascii_case(".git")
    })
}

/// Checks that `path` is a plain repository-relative name before it is joined
/// onto the working directory: no absolute path, no `..`, no `.git` component
/// (git tracks no path inside one) and, on Windows, no drive prefix, UNC prefix
/// or leading separator.
///
/// The test is **lexical**. A symlink or junction stored inside the repository
/// still resolves wherever it points, so this bounds what the frontend can
/// name, not what the OS ends up opening.
pub fn repo_relative(path: &str) -> Result<&Path, GitError> {
    let p = Path::new(path);
    let inside = p
        .components()
        .all(|c| matches!(c, Component::Normal(_) | Component::CurDir))
        && !has_git_component(p);
    if path.is_empty() || !inside {
        return Err(GitError::Refused(format!(
            "{path} is not a path inside the repository"
        )));
    }
    Ok(p)
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
    fn repo_relative_takes_plain_names_only() {
        assert_eq!(repo_relative("a/b.txt").unwrap(), Path::new("a/b.txt"));
        assert_eq!(repo_relative("./x").unwrap(), Path::new("./x"));
        // Only the directory itself is out; a name that merely starts with it
        // is an ordinary tracked file.
        assert_eq!(
            repo_relative(".gitignore").unwrap(),
            Path::new(".gitignore")
        );

        // Everything that could leave the working directory, plus the `.git`
        // directory, which git never tracks a path inside of. The drive- and
        // UNC-prefixed ones are plain file names off Windows, so they are only
        // components there.
        let mut bad = vec![
            "",
            "..",
            "../x",
            "a/../../x",
            "/abs",
            ".git/config",
            ".GIT/x",
            "a/.git/b",
            ".git./config",
            ".git /x",
        ];
        if cfg!(windows) {
            bad.extend(["C:foo", r"C:\abs", r"\\srv\share\x", r"a\..\..\x"]);
        }
        for path in bad {
            let e = repo_relative(path);
            assert!(matches!(&e, Err(GitError::Refused(_))), "{path:?} → {e:?}");
        }
    }

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

    /// The order `mutate` (src-tauri) takes the two locks in, and what a status
    /// scan sees while an op holds them.
    #[tokio::test]
    async fn an_op_takes_the_op_lock_first_then_waits_out_one_scan() {
        let t = TempRepo::new();
        t.commit(&[("a.txt", "a")], "init");
        let h = RepoHandle::open(t.path()).expect("open");

        // A scan that will write the refreshed index back holds `scan_lock`
        // and never takes `op_lock`.
        let scan = h.scan_lock.lock().await;

        // `op_lock` first: a mutation issued during *another op* still fails
        // fast with `Busy` rather than waiting silently.
        let op = h.op_lock.try_lock().expect("no other op is running");
        // Then `scan_lock`: the op waits for the scan instead of racing its
        // index write-back.
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(50), h.scan_lock.lock())
                .await
                .is_err(),
            "the op took scan_lock while a scan held it"
        );

        drop(scan);
        let scan_guard =
            tokio::time::timeout(std::time::Duration::from_secs(5), h.scan_lock.lock())
                .await
                .expect("the op proceeds once the scan finishes");

        // Op in flight, holding both: a scan starting now finds `scan_lock`
        // taken and runs without the write-back, and a second mutation is busy.
        assert!(h.scan_lock.try_lock().is_err());
        assert!(h.op_lock.try_lock().is_err());
        drop(scan_guard);
        drop(op);
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
    fn init_repo_creates_empty_repo_and_refuses_existing() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("new").join("repo");
        init_repo(&path).expect("init");
        let h = RepoHandle::open(&path).expect("open");
        let head = crate::refs::head_info(&h.git2.lock()).expect("head");
        assert_eq!(head.oid, None);
        assert!(head.branch.is_some());
        assert!(matches!(init_repo(&path), Err(GitError::Refused(_))));
        // Inside an existing repository, even at a path that does not exist yet.
        match init_repo(path.join("sub").join("deeper")) {
            Err(GitError::Refused(msg)) => assert!(msg.contains("inside"), "{msg}"),
            other => panic!("expected Refused, got {:?}", other),
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
