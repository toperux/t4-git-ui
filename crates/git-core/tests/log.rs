//! Topology tests: row order, lane assignment and ref labels on real temp repos.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};

use git2::Oid;
use git_core::log::walker::CHUNK_SIZE;
use git_core::log::{walk, GraphRow, LogFilter, RefKind, RefLabel, RevSpec};
use git_core::refs::{label_map, snapshot};
use git_core::test_util::TempRepo;
use git_core::GitError;

fn no_cancel() -> AtomicBool {
    AtomicBool::new(false)
}

fn rows(t: &TempRepo, spec: &RevSpec) -> Vec<GraphRow> {
    let mut out = Vec::new();
    walk(
        &t.repo,
        spec,
        &LogFilter::default(),
        &no_cancel(),
        |chunk| {
            out.extend(chunk);
            true
        },
    )
    .expect("walk");
    out
}

fn oids(rows: &[GraphRow]) -> Vec<String> {
    rows.iter().map(|r| r.commit.oid.clone()).collect()
}

fn lanes(rows: &[GraphRow]) -> Vec<u16> {
    rows.iter().map(|r| r.lane).collect()
}

fn s(o: Oid) -> String {
    o.to_string()
}

fn labels(t: &mut TempRepo) -> HashMap<String, Vec<RefLabel>> {
    let snap = snapshot(&mut t.repo).expect("snapshot");
    label_map(&snap)
}

fn label(name: &str, kind: RefKind, is_current: bool, remote: Option<&str>) -> RefLabel {
    RefLabel {
        name: name.to_string(),
        kind,
        is_current,
        remote: remote.map(String::from),
    }
}

#[test]
fn linear() {
    let mut t = TempRepo::new();
    let a = t.commit(&[("a", "1")], "A");
    let b = t.commit(&[("a", "2")], "B");
    let c = t.commit(&[("a", "3")], "C");

    let r = rows(&t, &RevSpec::All);
    assert_eq!(oids(&r), vec![s(c), s(b), s(a)]);
    assert_eq!(lanes(&r), vec![0, 0, 0]);
    assert!(r.iter().all(|r| r.max_lane == 0 && r.color == 0));
    assert_eq!(r[0].commit.summary, "C");
    assert_eq!(r[0].commit.parents, vec![s(b)]);
    assert!(r[2].commit.parents.is_empty());
    assert!(r[0].commit.author_time > r[2].commit.author_time);

    // On a branch: no HEAD label, the current branch label carries `is_current`.
    let m = labels(&mut t);
    assert_eq!(m[&s(c)], vec![label("master", RefKind::Local, true, None)]);
    assert!(!m.contains_key(&s(b)));

    assert_eq!(oids(&rows(&t, &RevSpec::Head)), vec![s(c), s(b), s(a)]);
    assert_eq!(
        oids(&rows(&t, &RevSpec::Refs(vec!["refs/heads/master".into()]))),
        vec![s(c), s(b), s(a)]
    );
}

#[test]
fn branch_and_merge() {
    let mut t = TempRepo::new();
    let a = t.commit(&[("a", "1")], "A");
    let b = t.commit(&[("b", "1")], "B");
    t.branch("feat", a);
    t.checkout("feat");
    let c = t.commit(&[("c", "1")], "C");
    t.checkout("master");
    let m = t.merge_commit("M", &[b, c]);

    let r = rows(&t, &RevSpec::All);
    assert_eq!(oids(&r), vec![s(m), s(c), s(b), s(a)]);
    assert_eq!(lanes(&r), vec![0, 1, 0, 0]);
    assert!(r[0].commit.is_merge);
    assert_eq!(r[0].max_lane, 1);
    // A inherits the color of C's lane (B's lane was deduped into it).
    assert_eq!(r[3].color, r[1].color);
    assert_ne!(r[3].color, r[2].color);

    let lm = labels(&mut t);
    assert_eq!(lm[&s(m)], vec![label("master", RefKind::Local, true, None)]);
    assert_eq!(lm[&s(c)], vec![label("feat", RefKind::Local, false, None)]);

    // Head-only walk skips the feature branch tip? No: C is reachable from M.
    assert_eq!(rows(&t, &RevSpec::Head).len(), 4);
    let only_feat = rows(&t, &RevSpec::Refs(vec!["refs/heads/feat".into()]));
    assert_eq!(oids(&only_feat), vec![s(c), s(a)]);

    // A whitespace-only text filter is no filter: the graph is still laid out.
    let filter = LogFilter {
        text: Some("   ".into()),
        ..Default::default()
    };
    let mut out = Vec::new();
    walk(&t.repo, &RevSpec::All, &filter, &no_cancel(), |chunk| {
        out.extend(chunk);
        true
    })
    .expect("walk");
    assert_eq!(out.len(), 4);
    assert!(!out[0].lines.is_empty());
    assert_eq!(out[0].max_lane, 1);
}

#[test]
fn octopus() {
    let t = TempRepo::new();
    let a = t.commit(&[("a", "1")], "A");
    let b = t.commit(&[("b", "1")], "B");
    t.branch("f1", a);
    t.checkout("f1");
    let c = t.commit(&[("c", "1")], "C");
    t.branch("f2", a);
    t.checkout("f2");
    let d = t.commit(&[("d", "1")], "D");
    t.checkout("master");
    let m = t.merge_commit("M", &[b, c, d]);

    let r = rows(&t, &RevSpec::All);
    assert_eq!(oids(&r), vec![s(m), s(d), s(c), s(b), s(a)]);
    assert_eq!(lanes(&r), vec![0, 2, 1, 0, 0]);
    assert_eq!(r[0].commit.parents.len(), 3);
    assert_eq!(r[0].max_lane, 2);
    assert_eq!(r[0].lines.len(), 3);
}

#[test]
fn two_orphan_roots() {
    let mut t = TempRepo::new();
    let a = t.commit(&[("a", "1")], "A");
    t.orphan("side");
    let c = t.commit(&[("c", "1")], "C");
    t.checkout("master");
    let b = t.commit(&[("b", "1")], "B");
    t.checkout("side");
    let d = t.commit(&[("d", "1")], "D");

    let r = rows(&t, &RevSpec::All);
    assert_eq!(oids(&r), vec![s(d), s(b), s(c), s(a)]);
    assert_eq!(lanes(&r), vec![0, 1, 0, 0]);
    assert!(r[2].commit.parents.is_empty());
    assert!(r[3].commit.parents.is_empty());
    // A sits in B's (shifted) lane and keeps B's color.
    assert_eq!(r[3].color, r[1].color);

    let lm = labels(&mut t);
    assert_eq!(lm[&s(d)], vec![label("side", RefKind::Local, true, None)]);
    assert_eq!(
        lm[&s(b)],
        vec![label("master", RefKind::Local, false, None)]
    );

    // Head-only: just the current root chain.
    assert_eq!(oids(&rows(&t, &RevSpec::Head)), vec![s(d), s(c)]);
}

#[test]
fn detached_head() {
    let mut t = TempRepo::new();
    let a = t.commit(&[("a", "1")], "A");
    let b = t.commit(&[("b", "1")], "B");
    t.detach(a);

    let snap = snapshot(&mut t.repo).expect("snapshot");
    assert!(snap.head.detached);
    assert_eq!(snap.head.oid.as_deref(), Some(s(a).as_str()));
    assert_eq!(snap.head.branch, None);
    assert_eq!(snap.local.len(), 1);
    assert!(!snap.local[0].is_head);

    let r = rows(&t, &RevSpec::All);
    assert_eq!(oids(&r), vec![s(b), s(a)]);
    assert_eq!(oids(&rows(&t, &RevSpec::Head)), vec![s(a)]);

    // Detached: the HEAD label is present.
    let lm = label_map(&snap);
    assert_eq!(lm[&s(a)], vec![label("HEAD", RefKind::Head, false, None)]);
    assert_eq!(
        lm[&s(b)],
        vec![label("master", RefKind::Local, false, None)]
    );
}

#[test]
fn synced_local_and_remote_collapse_to_one_label() {
    let mut t = TempRepo::new();
    let a = t.commit(&[("a", "1")], "A");
    t.remote("origin");
    t.reference("refs/remotes/origin/master", a);
    t.set_upstream("master", "origin/master");
    // Same commit, but not the tracking branch → keeps its own remote chip.
    t.reference("refs/remotes/origin/feature", a);
    // A remote that is not configured (stale refs) still groups by prefix.
    t.reference("refs/remotes/upstream/master", a);
    t.tag("v1", a);

    let snap = snapshot(&mut t.repo).expect("snapshot");
    assert_eq!(snap.local[0].upstream.as_deref(), Some("origin/master"));
    assert!(!snap.local[0].gone);
    assert_eq!((snap.local[0].ahead, snap.local[0].behind), (0, 0));
    assert_eq!(snap.remotes.len(), 2);
    assert_eq!(snap.remotes[0].name, "origin");
    assert!(snap.remotes[0].url.is_some());
    assert_eq!(snap.remotes[0].branches.len(), 2);
    assert_eq!(snap.remotes[1].name, "upstream");
    assert_eq!(snap.remotes[1].url, None);
    assert_eq!(snap.tags.len(), 1);

    let lm = label_map(&snap);
    assert_eq!(
        lm[&s(a)],
        vec![
            label("master", RefKind::Local, true, Some("origin")),
            label("origin/feature", RefKind::Remote, false, None),
            label("upstream/master", RefKind::Remote, false, None),
            label("v1", RefKind::Tag, false, None),
        ]
    );

    // Diverge: local moves ahead → remote label comes back on the old commit.
    let b = t.commit(&[("b", "1")], "B");
    let snap = snapshot(&mut t.repo).expect("snapshot");
    assert_eq!((snap.local[0].ahead, snap.local[0].behind), (1, 0));
    let lm = label_map(&snap);
    assert_eq!(lm[&s(b)], vec![label("master", RefKind::Local, true, None)]);
    assert_eq!(
        lm[&s(a)][0],
        label("origin/feature", RefKind::Remote, false, None)
    );
    assert_eq!(
        lm[&s(a)][1],
        label("origin/master", RefKind::Remote, false, None)
    );

    // Remote refs are part of `All` but not `Head`.
    t.reference("refs/remotes/origin/other", a);
    assert_eq!(rows(&t, &RevSpec::All).len(), 2);
}

#[test]
fn a_differently_named_upstream_is_spelled_out_in_the_synced_label() {
    let mut t = TempRepo::new();
    let a = t.commit(&[("a", "1")], "A");
    t.remote("origin");
    t.reference("refs/remotes/origin/trunk", a);
    t.set_upstream("master", "origin/trunk");
    // The trap the remote name alone walks into: a same-named remote branch that is
    // *not* the upstream, sitting on the same commit.
    t.reference("refs/remotes/origin/master", a);

    let snap = snapshot(&mut t.repo).expect("snapshot");
    let lm = label_map(&snap);
    assert_eq!(
        lm[&s(a)],
        vec![
            label("master", RefKind::Local, true, Some("origin/trunk")),
            label("origin/master", RefKind::Remote, false, None),
        ]
    );
}

#[test]
fn upstream_gone_after_prune() {
    let mut t = TempRepo::new();
    let a = t.commit(&[("a", "1")], "A");
    t.remote("origin");
    t.reference("refs/remotes/origin/master", a);
    t.set_upstream("master", "origin/master");
    t.commit(&[("b", "1")], "B");
    t.delete_ref("refs/remotes/origin/master");

    let snap = snapshot(&mut t.repo).expect("snapshot");
    let b = &snap.local[0];
    assert_eq!(b.upstream.as_deref(), Some("origin/master"));
    assert!(b.gone);
    assert_eq!((b.ahead, b.behind), (0, 0));
}

#[test]
fn local_tracking_upstream_uses_bare_name() {
    let mut t = TempRepo::new();
    let a = t.commit(&[("a", "1")], "A");
    t.branch("feat", a);
    t.set_upstream("feat", "master");
    let snap = snapshot(&mut t.repo).expect("snapshot");
    let feat = snap.local.iter().find(|b| b.name == "feat").expect("feat");
    assert_eq!(feat.upstream.as_deref(), Some("master"));
    assert!(!feat.gone);
}

#[test]
fn remote_without_fetch_url_has_no_url() {
    let mut t = TempRepo::new();
    t.commit(&[("a", "1")], "A");
    t.repo
        .config()
        .expect("config")
        .set_str("remote.pushonly.pushurl", "https://example.invalid/p.git")
        .expect("set pushurl");
    let snap = snapshot(&mut t.repo).expect("snapshot");
    let r = snap
        .remotes
        .iter()
        .find(|r| r.name == "pushonly")
        .expect("remote listed");
    assert_eq!(r.url, None);
}

#[test]
fn tags_are_peeled_and_non_commit_tags_are_skipped() {
    let mut t = TempRepo::new();
    let a = t.commit(&[("a", "1")], "A");
    t.tag_annotated("v1", a);
    t.tag_tree("treetag", a);

    let snap = snapshot(&mut t.repo).expect("snapshot");
    assert_eq!(snap.tags.len(), 1);
    assert_eq!(
        (snap.tags[0].name.as_str(), snap.tags[0].oid.as_str()),
        ("v1", s(a).as_str())
    );
    let lm = label_map(&snap);
    assert!(lm[&s(a)].contains(&label("v1", RefKind::Tag, false, None)));

    // `All` still walks (the tree tag is skipped), `Refs` on it yields nothing.
    assert_eq!(oids(&rows(&t, &RevSpec::All)), vec![s(a)]);
    assert!(rows(&t, &RevSpec::Refs(vec!["refs/tags/treetag".into()])).is_empty());
    assert!(matches!(
        walk(
            &t.repo,
            &RevSpec::Refs(vec!["refs/heads/nope".into()]),
            &LogFilter::default(),
            &no_cancel(),
            |_| true
        ),
        Err(GitError::Git2(_))
    ));
}

#[test]
fn dangling_ref_is_skipped() {
    let t = TempRepo::new();
    let a = t.commit(&[("a", "1")], "A");
    let b = t.commit(&[("b", "1")], "B");
    t.write_ref("refs/heads/stale", &"1".repeat(40));
    t.write_ref("refs/remotes/origin/stale", &"2".repeat(40));
    assert_eq!(oids(&rows(&t, &RevSpec::All)), vec![s(b), s(a)]);
}

#[test]
fn all_includes_slashed_branches_and_unborn_head() {
    let t = TempRepo::new();
    let a = t.commit(&[("a", "1")], "A");
    t.branch("feature/x", a);
    t.checkout("feature/x");
    let b = t.commit(&[("b", "1")], "B");
    t.checkout("master");
    assert_eq!(oids(&rows(&t, &RevSpec::All)), vec![s(b), s(a)]);

    // Unborn HEAD on a new orphan branch: `All` still walks the other branch.
    t.orphan("empty");
    assert_eq!(oids(&rows(&t, &RevSpec::All)), vec![s(b), s(a)]);
    assert!(rows(&t, &RevSpec::Head).is_empty());
}

#[test]
fn text_filter_matches_summary_and_author() {
    let t = TempRepo::new();
    let a = t.commit(&[("a", "1")], "Fix parser");
    let b = t.commit(&[("b", "1")], "Add feature");
    t.commit(&[("c", "1")], "fix typo");

    let mut out = Vec::new();
    let filter = LogFilter {
        text: Some("FIX".into()),
        ..Default::default()
    };
    let n = walk(&t.repo, &RevSpec::All, &filter, &no_cancel(), |chunk| {
        out.extend(chunk);
        true
    })
    .expect("walk");
    assert_eq!(n, 2);
    assert!(out.iter().all(|r| r.commit.oid != s(b)));
    assert!(out.iter().all(|r| r.lines.is_empty()));

    let filter = LogFilter {
        text: Some("test@example".into()),
        ..Default::default()
    };
    assert_eq!(
        walk(&t.repo, &RevSpec::All, &filter, &no_cancel(), |_| true).expect("walk"),
        3
    );

    // A hex query of four or more characters also matches a commit id prefix.
    let filter = LogFilter {
        text: Some(s(a)[..7].to_uppercase()),
        ..Default::default()
    };
    let mut out = Vec::new();
    walk(&t.repo, &RevSpec::All, &filter, &no_cancel(), |chunk| {
        out.extend(chunk);
        true
    })
    .expect("walk");
    assert_eq!(oids(&out), vec![s(a)]);
}

#[test]
fn empty_repo_walks_nothing() {
    let mut t = TempRepo::new();
    assert_eq!(rows(&t, &RevSpec::All).len(), 0);
    assert_eq!(rows(&t, &RevSpec::Head).len(), 0);
    let snap = snapshot(&mut t.repo).expect("snapshot");
    assert_eq!(snap.head.oid, None);
    assert_eq!(snap.head.branch.as_deref(), Some("master"));
    assert!(label_map(&snap).is_empty());
}

/// One 1100-commit repo (expensive to build) shared by the chunking cases.
#[test]
fn chunking_early_stop_and_cancellation() {
    let t = TempRepo::new();
    let mut exact = None;
    for i in 0..(CHUNK_SIZE + 100) {
        let oid = t.commit(&[("a", &i.to_string())], &format!("c{i}"));
        if i + 1 == CHUNK_SIZE {
            exact = Some(oid);
        }
    }
    t.branch("exact", exact.expect("exact tip"));

    // Callback returning false stops after the first chunk.
    let mut calls = 0;
    let n = walk(
        &t.repo,
        &RevSpec::All,
        &LogFilter::default(),
        &no_cancel(),
        |chunk| {
            calls += 1;
            assert_eq!(chunk.len(), CHUNK_SIZE);
            false
        },
    )
    .expect("walk");
    assert_eq!((calls, n), (1, CHUNK_SIZE));

    // Exactly CHUNK_SIZE commits → exactly one callback, no empty tail chunk.
    let mut calls = 0;
    let n = walk(
        &t.repo,
        &RevSpec::Refs(vec!["refs/heads/exact".into()]),
        &LogFilter::default(),
        &no_cancel(),
        |chunk| {
            calls += 1;
            assert_eq!(chunk.len(), CHUNK_SIZE);
            true
        },
    )
    .expect("walk");
    assert_eq!((calls, n), (1, CHUNK_SIZE));

    // Raising the flag from inside the first chunk callback cancels the walk.
    let cancel = AtomicBool::new(false);
    let mut calls = 0;
    let r = walk(
        &t.repo,
        &RevSpec::All,
        &LogFilter::default(),
        &cancel,
        |_| {
            calls += 1;
            cancel.store(true, Ordering::Relaxed);
            true
        },
    );
    assert!(matches!(r, Err(GitError::Cancelled)), "{r:?}");
    assert_eq!(calls, 1);
}
