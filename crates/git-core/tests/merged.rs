//! `Branch::merged_into` / `RemoteBranch::merged_into`: which branches add
//! nothing over another one, and which containing branch gets named.

use git_core::refs::{snapshot, snapshot_with, AheadBehindCache, RefsSnapshot};
use git_core::test_util::TempRepo;

fn local<'a>(snap: &'a RefsSnapshot, name: &str) -> Option<&'a str> {
    snap.local
        .iter()
        .find(|b| b.name == name)
        .unwrap_or_else(|| panic!("no local branch {name}"))
        .merged_into
        .as_deref()
}

fn remote<'a>(snap: &'a RefsSnapshot, name: &str) -> Option<&'a str> {
    snap.remotes
        .iter()
        .flat_map(|r| &r.branches)
        .find(|b| b.name == name)
        .unwrap_or_else(|| panic!("no remote branch {name}"))
        .merged_into
        .as_deref()
}

/// master: c1 → c2 → c3 (HEAD). Off c2: `topic` (c4), unmerged. `old` at c1 and
/// `origin/old` at c1 are both inside master. `pushed` at c5 with `origin/pushed`
/// at c5 (its upstream) is only in its counterpart. `twin-a` / `twin-b` share c6.
fn fixture() -> (TempRepo, RefsSnapshot) {
    let mut t = TempRepo::new();
    let c1 = t.commit(&[("a", "1")], "c1");
    let c2 = t.commit(&[("a", "2")], "c2");
    t.commit(&[("a", "3")], "c3");
    t.branch("topic", c2);
    t.checkout("topic");
    t.commit(&[("t", "1")], "c4");
    t.branch("old", c1);
    t.remote("origin");
    t.reference("refs/remotes/origin/old", c1);
    t.branch("pushed", c2);
    t.checkout("pushed");
    let c5 = t.commit(&[("p", "1")], "c5");
    t.reference("refs/remotes/origin/pushed", c5);
    t.set_upstream("pushed", "origin/pushed");
    t.branch("twin-a", c2);
    t.checkout("twin-a");
    let c6 = t.commit(&[("w", "1")], "c6");
    t.branch("twin-b", c6);
    t.checkout("master");
    let snap = snapshot(&mut t.repo).expect("snapshot");
    (t, snap)
}

#[test]
fn a_branch_inside_another_names_it_and_a_tip_does_not() {
    let (_t, snap) = fixture();
    assert_eq!(local(&snap, "old"), Some("master"));
    assert_eq!(remote(&snap, "origin/old"), Some("master"));
    assert_eq!(local(&snap, "topic"), None);
    assert_eq!(local(&snap, "master"), None);
}

#[test]
fn counterparts_do_not_count() {
    let (_t, snap) = fixture();
    // `pushed` sits exactly on its upstream: pushed, not merged — and the other way round.
    assert_eq!(local(&snap, "pushed"), None);
    assert_eq!(remote(&snap, "origin/pushed"), None);
}

#[test]
fn branches_on_one_commit_contain_each_other() {
    let (_t, snap) = fixture();
    assert_eq!(local(&snap, "twin-a"), Some("twin-b"));
    assert_eq!(local(&snap, "twin-b"), Some("twin-a"));
}

#[test]
fn the_current_branch_is_named_first_and_a_new_head_recomputes() {
    let (mut t, _) = fixture();
    // `old` is inside master and topic alike; on topic, topic is the one named.
    t.checkout("topic");
    let snap = snapshot(&mut t.repo).expect("snapshot");
    assert_eq!(local(&snap, "old"), Some("topic"));
}

#[test]
fn a_same_named_branch_on_a_remote_is_a_counterpart_without_tracking() {
    let mut t = TempRepo::new();
    let c1 = t.commit(&[("a", "1")], "c1");
    t.remote("origin");
    // `feature` never had an upstream configured, but origin/feature is still its remote copy.
    t.branch("feature", c1);
    t.reference("refs/remotes/origin/feature", c1);
    t.checkout("feature");
    t.commit(&[("f", "1")], "c2");
    // master (c1) is inside feature. origin/feature sits on master's commit, so it is inside
    // master — but not inside `feature`, its own copy, which is what "counterpart" is for.
    let snap = snapshot(&mut t.repo).expect("snapshot");
    assert_eq!(local(&snap, "master"), Some("feature"));
    assert_eq!(remote(&snap, "origin/feature"), Some("master"));
    assert_eq!(local(&snap, "feature"), None);
}

#[test]
fn the_current_branch_is_never_a_subject() {
    let (mut t, _) = fixture();
    // A feature branch ahead of master reaches master's tip; master is checked out.
    let c3 = t.repo.head().unwrap().target().unwrap();
    t.branch("feature", c3);
    t.checkout("feature");
    t.commit(&[("f", "1")], "c7");
    t.checkout("master");
    let snap = snapshot(&mut t.repo).expect("snapshot");
    assert_eq!(local(&snap, "master"), None);
    assert_eq!(local(&snap, "feature"), None);
    // Detached, master is a plain branch again and every subject falls back to the first local.
    t.detach(c3);
    let snap = snapshot(&mut t.repo).expect("snapshot");
    assert_eq!(local(&snap, "master"), Some("feature"));
    assert_eq!(local(&snap, "old"), Some("feature"));
}

#[test]
fn without_the_current_branch_the_first_local_is_named() {
    let mut t = TempRepo::new();
    let c1 = t.commit(&[("a", "1")], "c1");
    t.branch("b", c1);
    t.checkout("b");
    let c2 = t.commit(&[("b", "1")], "c2");
    t.branch("a", c1);
    t.checkout("a");
    t.commit(&[("a", "2")], "c3");
    t.branch("base", c1);
    t.branch("master", c2);
    // HEAD on an unrelated root reaches none of them.
    t.orphan("solo");
    t.commit(&[("s", "1")], "c4");
    let snap = snapshot(&mut t.repo).expect("snapshot");
    // `base` is inside a, b and master; `a` sorts first.
    assert_eq!(local(&snap, "base"), Some("a"));
}

#[test]
fn a_flat_remote_ref_is_its_own_remote() {
    let (mut t, _) = fixture();
    let c1 = snap_oid(&t, "refs/heads/old");
    // git-svn style: `refs/remotes/trunk` with no `trunk` remote configured.
    t.reference("refs/remotes/trunk", c1);
    let snap = snapshot(&mut t.repo).expect("snapshot");
    let r = snap
        .remotes
        .iter()
        .find(|r| r.name == "trunk")
        .expect("remote named after the ref");
    assert_eq!(r.branches.len(), 1);
    assert_eq!(remote(&snap, "trunk"), Some("master"));
}

#[test]
fn a_local_upstream_is_not_a_counterpart() {
    let mut t = TempRepo::new();
    let c1 = t.commit(&[("a", "1")], "c1");
    // `git checkout -b feat --track master`, one commit, then master fast-forwards to it.
    t.branch("feat", c1);
    t.set_upstream("feat", "master");
    t.checkout("feat");
    let c2 = t.commit(&[("f", "1")], "c2");
    t.branch("master", c2);
    t.checkout("master");
    let snap = snapshot(&mut t.repo).expect("snapshot");
    assert_eq!(local(&snap, "feat"), Some("master"));
}

#[test]
fn an_upstream_only_change_recomputes_a_cached_result() {
    let mut t = TempRepo::new();
    let c1 = t.commit(&[("a", "1")], "c1");
    t.remote("origin");
    t.branch("feat", c1);
    t.checkout("feat");
    let c2 = t.commit(&[("f", "1")], "c2");
    t.reference("refs/remotes/origin/feature-1", c2);
    t.set_upstream("feat", "origin/feature-1");
    t.checkout("master");
    let mut cache = AheadBehindCache::default();
    // Sits on its upstream: pushed, not merged.
    let snap = snapshot_with(&mut t.repo, &mut cache).expect("snapshot");
    assert_eq!(local(&snap, "feat"), None);
    // No tip moved, only the tracking config; the cache must not answer from before.
    t.repo
        .find_branch("feat", git2::BranchType::Local)
        .unwrap()
        .set_upstream(None)
        .unwrap();
    let snap = snapshot_with(&mut t.repo, &mut cache).expect("snapshot");
    assert_eq!(local(&snap, "feat"), Some("origin/feature-1"));
}

fn snap_oid(t: &TempRepo, name: &str) -> git2::Oid {
    t.repo.find_reference(name).unwrap().target().unwrap()
}
