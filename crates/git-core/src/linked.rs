//! The other checkouts reachable from a repository: linked worktrees and
//! submodules.
//!
//! Deliberately not part of [`crate::refs`]: one `Repository::open` per row is
//! more than the branch list should ever wait on, and a dangling worktree link
//! must not be able to fail it.

use std::path::Path;

use git2::{Repository, WorktreeLockStatus};
use serde::{Deserialize, Serialize};

use crate::refs::{head_info, HeadInfo};
use crate::repo::{normalize_workdir_string, RepoId};
use crate::GitError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    /// Working directory, in the shape [`crate::RepoHandle::path`] has (no
    /// `\\?\` prefix, no trailing separator) so it can be opened as it stands.
    pub path: String,
    /// `None` only when neither the checkout nor its administrative HEAD can be
    /// read — the directory is gone (see `prunable`) *and* the entry with it.
    pub head: Option<HeadInfo>,
    /// The working tree the linked ones hang off. libgit2 never lists it, so it
    /// is added by hand; it is never locked or prunable.
    pub main: bool,
    /// The checkout this snapshot was taken from.
    pub current: bool,
    pub locked: bool,
    pub lock_reason: Option<String>,
    /// `git worktree prune` would remove the administrative entry.
    pub prunable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Submodule {
    /// Repo-relative path of the checkout (`/`-separated).
    pub path: String,
    pub url: Option<String>,
    /// The commit the superproject points at.
    pub head_oid: Option<String>,
    /// HEAD of the checkout on disk; `None` when the submodule is not initialized.
    pub workdir_oid: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedSnapshot {
    /// Main working tree first, then by path.
    pub worktrees: Vec<Worktree>,
    pub submodules: Vec<Submodule>,
}

/// HEAD of a worktree whose directory will not open, straight out of its
/// administrative file (`ref: refs/heads/<b>`, or a detached oid): a prunable
/// row still knows which branch it was on, which is the only thing about it
/// worth showing — with the branch resolved through `repo`, whose refdb the
/// linked worktree shares, so the row's click can still reveal its commit.
fn head_from_admin(repo: &Repository, admin: &Path) -> Option<HeadInfo> {
    let text = std::fs::read_to_string(admin.join("HEAD")).ok()?;
    let text = text.trim();
    Some(match text.strip_prefix("ref:").map(str::trim) {
        Some(r) => HeadInfo {
            oid: repo
                .find_reference(r)
                .and_then(|rf| rf.peel_to_commit())
                .ok()
                .map(|c| c.id().to_string()),
            branch: Some(r.strip_prefix("refs/heads/").unwrap_or(r).to_string()),
            detached: false,
        },
        None => HeadInfo {
            oid: Some(text.to_string()),
            branch: None,
            detached: true,
        },
    })
}

/// One worktree row for `path`, with its head read by opening it — or, when
/// that fails and `name` says which administrative entry it is, read from
/// `<commondir>/worktrees/<name>/HEAD`.
fn row(
    repo: &Repository,
    path: &Path,
    name: Option<&str>,
    main: bool,
    current: &RepoId,
) -> Worktree {
    let path = normalize_workdir_string(path.to_string_lossy().into_owned());
    Worktree {
        head: Repository::open(&path)
            .ok()
            .and_then(|r| head_info(&r).ok())
            .or_else(|| {
                name.and_then(|n| {
                    head_from_admin(repo, &repo.commondir().join("worktrees").join(n))
                })
            }),
        // Through `RepoId`, which normalizes drive case and separators — a
        // missing directory fails to canonicalize and keeps its raw spelling,
        // so it can never match the open repo.
        current: RepoId::from_workdir(Path::new(&path)).0 == *current,
        path,
        main,
        locked: false,
        lock_reason: None,
        prunable: false,
    }
}

/// Every checkout reachable from `repo`: the main working tree and the linked
/// worktrees (`current` marks the one `current` identifies), plus this
/// repository's own submodules — a repository that *is* a submodule knows
/// nothing about its superproject and is listed nowhere.
///
// ponytail: opens one repository per worktree and re-reads every submodule on
// every call, with no cache. Fine for the handful a repo has; key one on
// `.git/worktrees`' mtime if a repo with dozens ever shows up in the timings.
pub fn snapshot(repo: &Repository, current: &RepoId) -> Result<LinkedSnapshot, GitError> {
    let mut worktrees = Vec::new();
    let main_dir = if repo.is_worktree() {
        // `commondir` is the main repository's admin directory.
        repo.commondir().parent().map(Path::to_path_buf)
    } else {
        repo.workdir().map(Path::to_path_buf)
    };
    // No head at all means the directory did not open as a repository: a bare
    // one, or `--separate-git-dir`, where `commondir` sits outside the working
    // tree. Then there is simply no main row.
    // ponytail: `worktree list --porcelain` would get that case right, at the
    // cost of a git ≥ 2.36 floor for its `locked` / `prunable` lines.
    if let Some(main) = main_dir.map(|d| row(repo, &d, None, true, current)) {
        if main.head.is_some() {
            worktrees.push(main);
        }
    }
    // Neither list is worth failing the snapshot over: the sidebar shows what
    // could be read and says nothing about the rest.
    match repo.worktrees() {
        Ok(names) => {
            for name in names.iter().filter_map(|n| n.ok().flatten()) {
                // An administrative entry libgit2 cannot even read is not worth
                // dropping the other rows over.
                let Ok(wt) = repo.find_worktree(name) else {
                    continue;
                };
                let mut w = row(repo, wt.path(), Some(name), false, current);
                if let Ok(WorktreeLockStatus::Locked(reason)) = wt.is_locked() {
                    w.locked = true;
                    w.lock_reason = reason;
                }
                w.prunable = wt.is_prunable(None).unwrap_or(false);
                worktrees.push(w);
            }
        }
        Err(e) => tracing::warn!(error = %e, "worktree list unreadable; linked worktrees omitted"),
    }
    worktrees.sort_by(|a, b| b.main.cmp(&a.main).then_with(|| a.path.cmp(&b.path)));

    let submodules = repo
        .submodules()
        .unwrap_or_else(|e| {
            tracing::warn!(error = %e, "submodule list unreadable (.gitmodules); none listed");
            Vec::new()
        })
        .iter()
        .map(|s| Submodule {
            path: s.path().to_string_lossy().into_owned(),
            url: s.url().ok().flatten().map(String::from),
            head_oid: s.head_id().map(|o| o.to_string()),
            workdir_oid: s.workdir_id().map(|o| o.to_string()),
        })
        .collect();

    Ok(LinkedSnapshot {
        worktrees,
        submodules,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::TempRepo;

    fn snap(path: &Path) -> LinkedSnapshot {
        let repo = Repository::open(path).expect("open");
        let id = RepoId::from_workdir(path).0;
        snapshot(&repo, &id).expect("snapshot")
    }

    /// A repo with one linked worktree on branch `feature`, plus the temp dir
    /// holding it (dropping that deletes the checkout).
    fn with_worktree() -> (TempRepo, tempfile::TempDir, std::path::PathBuf) {
        let t = TempRepo::new();
        t.commit(&[("a.txt", "a")], "A");
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("feature");
        t.repo.worktree("feature", &path, None).expect("worktree");
        (t, dir, path)
    }

    #[test]
    fn lists_the_main_worktree_and_the_linked_one_from_either_side() {
        let (t, _dir, wt_path) = with_worktree();

        let from_main = snap(t.path());
        assert_eq!(from_main.worktrees.len(), 2);
        let (main, linked) = (&from_main.worktrees[0], &from_main.worktrees[1]);
        assert!(main.main && main.current, "{main:?}");
        assert!(!linked.main && !linked.current, "{linked:?}");
        assert!(!linked.locked && !linked.prunable, "{linked:?}");
        let branch = |w: &Worktree| w.head.as_ref().expect("head").branch.clone();
        assert_eq!(branch(main).as_deref(), Some("master"));
        assert_eq!(branch(linked).as_deref(), Some("feature"));

        // The same two rows from the linked side, `current` moved over.
        let from_linked = snap(&wt_path);
        let paths = |s: &LinkedSnapshot| {
            s.worktrees
                .iter()
                .map(|w| w.path.clone())
                .collect::<Vec<_>>()
        };
        assert_eq!(paths(&from_linked), paths(&from_main));
        assert!(from_linked.worktrees[0].main && !from_linked.worktrees[0].current);
        assert!(!from_linked.worktrees[1].main && from_linked.worktrees[1].current);
    }

    #[test]
    fn a_lock_reason_round_trips() {
        let (t, _dir, _wt_path) = with_worktree();
        t.repo
            .find_worktree("feature")
            .expect("find_worktree")
            .lock(Some("mid rebase"))
            .expect("lock");

        let linked = snap(t.path()).worktrees.remove(1);
        assert!(linked.locked);
        assert_eq!(linked.lock_reason.as_deref(), Some("mid rebase"));
    }

    /// The directory is gone, so nothing opens — but the administrative HEAD is
    /// still there, and the branch is what the row is worth showing.
    #[test]
    fn a_deleted_checkout_is_prunable_and_still_names_its_branch() {
        let (t, _dir, wt_path) = with_worktree();
        std::fs::remove_dir_all(&wt_path).expect("remove checkout");

        let linked = snap(t.path()).worktrees.remove(1);
        assert!(linked.prunable);
        let head = linked.head.expect("head from the admin directory");
        assert_eq!(head.branch.as_deref(), Some("feature"));
        assert!(!head.detached);
        // The branch still resolves in the shared refdb, so the row can reveal it.
        assert!(head.oid.is_some(), "{head:?}");
        assert!(!linked.current);
    }

    /// The same, detached: there is no branch to resolve, and the oid the
    /// administrative HEAD holds is the answer as it stands.
    #[test]
    fn a_deleted_detached_checkout_keeps_the_oid_from_its_admin_head() {
        let (t, _dir, wt_path) = with_worktree();
        let tip = t.repo.head().unwrap().peel_to_commit().unwrap().id();
        std::fs::write(
            t.path().join(".git/worktrees/feature/HEAD"),
            format!("{tip}\n"),
        )
        .expect("write admin HEAD");
        std::fs::remove_dir_all(&wt_path).expect("remove checkout");

        let head = snap(t.path()).worktrees.remove(1).head.expect("head");
        assert!(head.detached && head.branch.is_none(), "{head:?}");
        assert_eq!(head.oid.as_deref(), Some(tip.to_string().as_str()));
    }

    /// A `.gitmodules` git itself would refuse must not cost the worktree rows:
    /// the two lists are read independently and neither fails the snapshot.
    #[test]
    fn an_unparsable_gitmodules_leaves_the_worktrees_alone() {
        let (t, _dir, _wt_path) = with_worktree();
        let src = TempRepo::new();
        src.commit(&[("s.txt", "s")], "sub tip");
        t.add_submodule("sub", &src);
        assert_eq!(snap(t.path()).submodules.len(), 1);

        std::fs::write(t.path().join(".gitmodules"), "[submodule\nnot a config\n")
            .expect("write .gitmodules");
        let s = snap(t.path());
        assert_eq!(s.worktrees.len(), 2, "{s:?}");
        assert!(s.submodules.is_empty(), "{s:?}");
    }

    #[test]
    fn lists_a_submodule_with_both_its_oids() {
        let src = TempRepo::new();
        let tip = src.commit(&[("s.txt", "s")], "sub tip");
        let t = TempRepo::new();
        t.commit(&[("a.txt", "a")], "A");
        t.add_submodule("sub", &src);

        let s = snap(t.path());
        assert_eq!(s.submodules.len(), 1);
        let m = &s.submodules[0];
        assert_eq!(m.path, "sub");
        assert!(m.url.is_some(), "{m:?}");
        assert_eq!(m.head_oid.as_deref(), Some(tip.to_string().as_str()));
        assert_eq!(m.workdir_oid.as_deref(), Some(tip.to_string().as_str()));

        // No checkout on disk: not initialized.
        std::fs::remove_dir_all(t.path().join("sub")).expect("remove checkout");
        let s = snap(t.path());
        assert_eq!(s.submodules[0].workdir_oid, None);
        assert_eq!(
            s.submodules[0].head_oid.as_deref(),
            Some(tip.to_string().as_str())
        );
    }
}
