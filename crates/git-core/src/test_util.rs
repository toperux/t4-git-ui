//! Temp-repo builder for tests (enabled under `cfg(test)` or the `test-util` feature).
//! Each commit gets a strictly increasing timestamp so TIME-sorted walks are deterministic.

use std::cell::Cell;
use std::path::Path;

use git2::{
    build::CheckoutBuilder, Commit, Oid, Repository, RepositoryInitOptions, Signature, Time,
};
use tempfile::TempDir;

pub struct TempRepo {
    dir: TempDir,
    pub repo: Repository,
    clock: Cell<i64>,
}

impl Default for TempRepo {
    fn default() -> Self {
        Self::new()
    }
}

impl TempRepo {
    pub fn new() -> Self {
        let dir = tempfile::tempdir().expect("tempdir");
        // Fixed initial branch so tests don't depend on the user's `init.defaultBranch`.
        let repo = Repository::init_opts(
            dir.path(),
            RepositoryInitOptions::new().initial_head("master"),
        )
        .expect("git init");
        {
            let mut cfg = repo.config().expect("config");
            cfg.set_str("user.name", "Test").expect("user.name");
            cfg.set_str("user.email", "test@example.com")
                .expect("user.email");
        }
        TempRepo {
            dir,
            repo,
            clock: Cell::new(1_700_000_000),
        }
    }

    pub fn path(&self) -> &Path {
        self.dir.path()
    }

    fn sig(&self) -> Signature<'static> {
        let t = self.clock.get() + 1;
        self.clock.set(t);
        Signature::new("Test", "test@example.com", &Time::new(t, 0)).expect("signature")
    }

    /// Writes `files`, stages them and commits on the current HEAD (root commit if unborn).
    pub fn commit(&self, files: &[(&str, &str)], msg: &str) -> Oid {
        let mut index = self.repo.index().expect("index");
        for (rel, content) in files {
            let full = self.path().join(rel);
            if let Some(parent) = full.parent() {
                std::fs::create_dir_all(parent).expect("mkdir");
            }
            std::fs::write(&full, content).expect("write file");
            index.add_path(Path::new(rel)).expect("add_path");
        }
        index.write().expect("index write");
        let tree_id = index.write_tree().expect("write_tree");
        let tree = self.repo.find_tree(tree_id).expect("find_tree");
        let parent = self.repo.head().ok().and_then(|h| h.peel_to_commit().ok());
        let parents: Vec<&Commit> = parent.iter().collect();
        let sig = self.sig();
        self.repo
            .commit(Some("HEAD"), &sig, &sig, msg, &tree, &parents)
            .expect("commit")
    }

    /// Creates (or moves) a local branch at `oid`.
    pub fn branch(&self, name: &str, oid: Oid) {
        let commit = self.repo.find_commit(oid).expect("find_commit");
        self.repo.branch(name, &commit, true).expect("branch");
    }

    /// Checks out local branch `name` (force).
    pub fn checkout(&self, name: &str) {
        self.repo
            .set_head(&format!("refs/heads/{name}"))
            .expect("set_head");
        self.repo
            .checkout_head(Some(CheckoutBuilder::new().force()))
            .expect("checkout_head");
    }

    /// Points HEAD at an unborn branch with an empty index (next `commit` is a new root).
    pub fn orphan(&self, name: &str) {
        self.repo
            .set_head(&format!("refs/heads/{name}"))
            .expect("set_head");
        let mut index = self.repo.index().expect("index");
        index.clear().expect("index clear");
        index.write().expect("index write");
    }

    /// Detaches HEAD at `oid`.
    pub fn detach(&self, oid: Oid) {
        self.repo.set_head_detached(oid).expect("set_head_detached");
    }

    /// Creates a merge commit on the current HEAD with the given parents
    /// (tree taken from `parents[0]`; content is irrelevant for topology tests).
    pub fn merge_commit(&self, msg: &str, parents: &[Oid]) -> Oid {
        let commits: Vec<Commit> = parents
            .iter()
            .map(|p| self.repo.find_commit(*p).expect("find_commit"))
            .collect();
        let tree = commits
            .first()
            .expect("at least one parent")
            .tree()
            .expect("tree");
        let refs: Vec<&Commit> = commits.iter().collect();
        let sig = self.sig();
        self.repo
            .commit(Some("HEAD"), &sig, &sig, msg, &tree, &refs)
            .expect("merge commit")
    }

    /// Lightweight tag.
    pub fn tag(&self, name: &str, oid: Oid) {
        let obj = self.repo.find_object(oid, None).expect("find_object");
        self.repo.tag_lightweight(name, &obj, true).expect("tag");
    }

    /// Annotated tag on commit `oid`.
    pub fn tag_annotated(&self, name: &str, oid: Oid) {
        let obj = self.repo.find_object(oid, None).expect("find_object");
        let sig = self.sig();
        self.repo
            .tag(name, &obj, &sig, &format!("tag {name}"), true)
            .expect("annotated tag");
    }

    /// Lightweight tag pointing at the tree of commit `oid` (not a committish).
    pub fn tag_tree(&self, name: &str, oid: Oid) {
        let tree = self
            .repo
            .find_commit(oid)
            .expect("find_commit")
            .tree()
            .expect("tree");
        self.repo
            .tag_lightweight(name, tree.as_object(), true)
            .expect("tag tree");
    }

    /// Creates/updates an arbitrary direct ref (e.g. `refs/remotes/origin/main`).
    pub fn reference(&self, name: &str, oid: Oid) {
        self.repo
            .reference(name, oid, true, "test")
            .expect("reference");
    }

    /// Writes a loose ref file verbatim, bypassing libgit2's object-existence
    /// check (simulates a stale ref whose object is missing).
    pub fn write_ref(&self, name: &str, oid: &str) {
        let full = self.repo.path().join(name);
        std::fs::create_dir_all(full.parent().expect("parent")).expect("mkdir");
        std::fs::write(full, format!("{oid}\n")).expect("write ref");
    }

    /// Deletes ref `name` (full name).
    pub fn delete_ref(&self, name: &str) {
        self.repo
            .find_reference(name)
            .expect("find_reference")
            .delete()
            .expect("delete ref");
    }

    /// Adds a remote (config only, no network) so `set_upstream` can resolve it.
    pub fn remote(&self, name: &str) {
        self.repo
            .remote(name, &format!("https://example.invalid/{name}.git"))
            .expect("remote");
    }

    /// Sets `branch.<local>.remote/merge` so `local` tracks `upstream` (`origin/main`).
    pub fn set_upstream(&self, local: &str, upstream: &str) {
        let mut b = self
            .repo
            .find_branch(local, git2::BranchType::Local)
            .expect("find_branch");
        b.set_upstream(Some(upstream)).expect("set_upstream");
    }
}
