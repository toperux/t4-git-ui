use git_core::diff::FileStatus;
use git_core::status::status;
use git_core::test_util::TempRepo;

/// A `git` in a terminal holds `index.lock` while it commits. The scan writes
/// the refreshed stat cache back, and that write needs the lock — the scan
/// itself does not, so a held lock must not turn into a failed status.
///
/// The write-back only happens when an entry is racy: its mtime is not older
/// than the index, so libgit2 rehashes it and marks the index dirty. Rewriting
/// the file right after the commit, same content, is that case.
#[test]
fn a_held_index_lock_still_yields_a_status() {
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    t.write("f.txt", "v0\n");
    t.write("g.txt", "new\n");

    let lock = t.path().join(".git").join("index.lock");
    std::fs::write(&lock, "").unwrap();
    let s = status(&t.repo).expect("a held lock is not a failed scan");
    assert_eq!(s.untracked, 1);
    assert!(
        s.entries.iter().all(|e| e.path != "f.txt"),
        "{:?}",
        s.entries
    );

    std::fs::remove_file(&lock).unwrap();
    assert_eq!(status(&t.repo).expect("status").untracked, 1);
}

/// Submodules are in the scan (`exclude_submodules(false)`), so a moved pointer
/// is a change like any other — one entry, flagged as the gitlink it is.
#[test]
fn a_moved_submodule_pointer_is_one_modified_entry() {
    let src = TempRepo::new();
    let first = src.commit(&[("s.txt", "1\n")], "s1");
    src.commit(&[("s.txt", "2\n")], "s2");
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    t.add_submodule("sub", &src);
    // The checkout's HEAD goes back one commit; the recorded pointer stays.
    git2::Repository::open(t.path().join("sub"))
        .unwrap()
        .set_head_detached(first)
        .unwrap();
    t.write("f.txt", "v1\n");

    let s = status(&t.repo).expect("status");
    let sub: Vec<_> = s.entries.iter().filter(|e| e.path == "sub").collect();
    assert_eq!(sub.len(), 1, "{:?}", s.entries);
    assert_eq!(sub[0].workdir, Some(FileStatus::Modified));
    assert!(sub[0].submodule);
    // The pointer moved, so this is stageable — and the stamp is the checkout's
    // own HEAD, not the directory's mtime.
    assert!(!sub[0].submodule_dirty_only, "{:?}", sub[0]);
    assert_eq!(
        sub[0].workdir_stamp.as_deref(),
        Some(first.to_string().as_str())
    );

    let f = s.entries.iter().find(|e| e.path == "f.txt").expect("f.txt");
    assert_eq!(f.workdir, Some(FileStatus::Modified));
    assert!(!f.submodule);
}

/// Content changed *inside* the checkout with the pointer where it belongs:
/// there is nothing for the superproject to stage, so the entry says so — and
/// the stamp is still the checkout's HEAD, which has not moved.
#[test]
fn a_dirty_submodule_with_an_unmoved_pointer_is_flagged_dirty_only() {
    let src = TempRepo::new();
    let tip = src.commit(&[("s.txt", "1\n")], "s1");
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    t.add_submodule("sub", &src);
    std::fs::write(t.path().join("sub").join("untracked.txt"), "x\n").unwrap();

    let s = status(&t.repo).expect("status");
    let sub = s.entries.iter().find(|e| e.path == "sub").expect("sub");
    assert_eq!(sub.workdir, Some(FileStatus::Modified));
    assert!(sub.submodule && sub.submodule_dirty_only, "{sub:?}");
    assert_eq!(sub.workdir_stamp.as_deref(), Some(tip.to_string().as_str()));
}

/// The pointer move is staged and the checkout matches it again: no working-tree
/// side is left, so the stamp comes from the head→index delta instead. That side
/// moves when the pointer is re-staged outside the app, which is what makes a
/// re-stage inside one debounce window visible to the diff refetch.
#[test]
fn a_staged_only_pointer_move_is_stamped_from_the_index() {
    let src = TempRepo::new();
    let first = src.commit(&[("s.txt", "1\n")], "s1");
    src.commit(&[("s.txt", "2\n")], "s2");
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    t.add_submodule("sub", &src);
    // A real checkout, not just a moved HEAD: the files have to match the pointer,
    // or the entry keeps a working-tree side for what is dirty inside.
    let sub = git2::Repository::open(t.path().join("sub")).unwrap();
    sub.set_head_detached(first).unwrap();
    sub.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
        .unwrap();
    t.stage(&["sub"]);

    let s = status(&t.repo).expect("status");
    let sub = s.entries.iter().find(|e| e.path == "sub").expect("sub");
    assert_eq!((sub.index, sub.workdir), (Some(FileStatus::Modified), None));
    assert!(sub.submodule && !sub.submodule_dirty_only, "{sub:?}");
    assert_eq!(
        sub.workdir_stamp.as_deref(),
        Some(first.to_string().as_str()),
        "{sub:?}"
    );
}

/// Both sides of a conflicted gitlink's workdir delta carry the zero oid, which
/// reads as "the pointer never moved" — the one entry that must not be flagged
/// dirty-only, and the one that falls back to the directory's own stamp.
#[test]
fn a_conflicted_gitlink_is_neither_dirty_only_nor_stampless() {
    let src = TempRepo::new();
    let c1 = src.commit(&[("s.txt", "1\n")], "s1");
    let c2 = src.commit(&[("s.txt", "2\n")], "s2");
    src.commit(&[("s.txt", "3\n")], "s3");
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    // Branched from the commit that adds the submodule: an earlier one has no `sub`
    // in its tree, and checking it out would delete the directory.
    let base = t.add_submodule("sub", &src);
    let sub = git2::Repository::open(t.path().join("sub")).unwrap();
    // Two branches move the pointer to different commits; the merge cannot pick one.
    t.branch("feat", base);
    t.checkout("feat");
    sub.set_head_detached(c1).unwrap();
    t.stage(&["sub"]);
    let feat = t.commit_index("feat moves the pointer");
    t.checkout("master");
    sub.set_head_detached(c2).unwrap();
    t.stage(&["sub"]);
    t.commit_index("master moves it elsewhere");
    let ann = t.repo.find_annotated_commit(feat).unwrap();
    t.repo.merge(&[&ann], None, None).unwrap();

    let s = status(&t.repo).expect("status");
    let e = s.entries.iter().find(|e| e.path == "sub").expect("sub");
    assert!(e.conflicted && e.submodule, "{e:?}");
    assert!(!e.submodule_dirty_only, "{e:?}");
    assert!(e.workdir_stamp.is_some(), "{e:?}");
}

/// The stamp is what tells the UI a gitlink's diff went stale, so moving the
/// pointer has to change it (a directory's mtime and length never would).
#[test]
fn a_gitlinks_stamp_moves_with_its_pointer() {
    let src = TempRepo::new();
    let first = src.commit(&[("s.txt", "1\n")], "s1");
    src.commit(&[("s.txt", "2\n")], "s2");
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    t.add_submodule("sub", &src);
    std::fs::write(t.path().join("sub").join("untracked.txt"), "x\n").unwrap();

    let stamp = |s: &git_core::status::WorkdirStatus| {
        s.entries
            .iter()
            .find(|e| e.path == "sub")
            .and_then(|e| e.workdir_stamp.clone())
    };
    let before = stamp(&status(&t.repo).expect("status"));
    git2::Repository::open(t.path().join("sub"))
        .unwrap()
        .set_head_detached(first)
        .unwrap();
    let after = stamp(&status(&t.repo).expect("status"));
    assert!(before.is_some() && before != after, "{before:?} {after:?}");
}

/// A file staged whole and re-staged with new content behind the app keeps its
/// letters (`modified` in the index, nothing in the workdir) and has no workdir
/// stamp, so only the index side's stamp can tell the panel its staged diff
/// went stale (open-items §N).
#[test]
fn restaging_new_content_moves_the_index_stamp() {
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    let stamp = |t: &TempRepo| {
        let s = status(&t.repo).expect("status");
        let e = s
            .entries
            .into_iter()
            .find(|e| e.path == "f.txt")
            .expect("f.txt");
        assert_eq!((e.index, e.workdir), (Some(FileStatus::Modified), None));
        e.index_stamp
    };
    t.write("f.txt", "v1\n");
    t.stage(&["f.txt"]);
    let before = stamp(&t);
    t.write("f.txt", "v2\n");
    t.stage(&["f.txt"]);
    let after = stamp(&t);
    assert!(before.is_some() && before != after, "{before:?} {after:?}");
}

/// A staged deletion has no blob on the index side: its oid is zero, and a
/// zero stamp would make every such entry look alike.
#[test]
fn a_staged_deletion_has_no_index_stamp() {
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    // `remove` takes the path out of the index too — that is the staging.
    t.remove("f.txt");
    let s = status(&t.repo).expect("status");
    let e = s.entries.iter().find(|e| e.path == "f.txt").expect("f.txt");
    assert_eq!(e.index, Some(FileStatus::Deleted));
    assert_eq!(e.index_stamp, None);
}
