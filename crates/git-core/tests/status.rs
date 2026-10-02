use git_core::diff::FileStatus;
use git_core::status::{status, StatusEntry, WorkdirStatus};
use git_core::test_util::TempRepo;
use git_core::GitError;

/// The scan is `git status`: every test here needs git.
fn have_git() -> bool {
    match git_core::git_version("git") {
        Ok(_) => true,
        Err(GitError::GitNotFound) => {
            eprintln!("git not on PATH; skipping");
            false
        }
        Err(e) => panic!("git --version failed: {e}"),
    }
}

/// A `git` in a terminal holds `index.lock` while it commits. The scan takes
/// no lock (`GIT_OPTIONAL_LOCKS=0`: no refreshed stat cache is written back),
/// so a held lock must not turn into a failed status.
///
/// A racy entry — its mtime not older than the index — is what a locking
/// `git status` would refresh and write back. Rewriting the file right after
/// the commit, same content, is that case.
#[test]
fn a_held_index_lock_still_yields_a_status() {
    if !have_git() {
        return;
    }
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

/// Submodules are in the scan (`git status`, no `--ignore-submodules`), so a moved pointer
/// is a change like any other — one entry, flagged as the gitlink it is.
#[test]
fn a_moved_submodule_pointer_is_one_modified_entry() {
    if !have_git() {
        return;
    }
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
    if !have_git() {
        return;
    }
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
    if !have_git() {
        return;
    }
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
    if !have_git() {
        return;
    }
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
    if !have_git() {
        return;
    }
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
    if !have_git() {
        return;
    }
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
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    // `remove` takes the path out of the index too — that is the staging.
    t.remove("f.txt");
    let s = status(&t.repo).expect("status");
    let e = s.entries.iter().find(|e| e.path == "f.txt").expect("f.txt");
    assert_eq!(e.index, Some(FileStatus::Deleted));
    assert_eq!(e.index_stamp, None);
}

/// `git <args>` in `t`, which must succeed.
fn git(t: &TempRepo, args: &[&str]) {
    let out = git_core::host_command("git")
        .arg("-C")
        .arg(t.path())
        .args(args)
        .output()
        .expect("run git");
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

fn find<'a>(s: &'a WorkdirStatus, path: &str) -> &'a StatusEntry {
    s.entries
        .iter()
        .find(|e| e.path == path)
        .unwrap_or_else(|| panic!("{path} not in {:?}", s.entries))
}

/// Each kind of conflict is one entry, counted only as conflicted: no index or
/// working-tree side, as libgit2 reported them.
#[test]
fn every_conflict_kind_is_conflicted_only() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    let base = t.commit(
        &[
            ("both.txt", "base\n"),
            ("ours-del.txt", "base\n"),
            ("theirs-del.txt", "base\n"),
        ],
        "base",
    );
    t.branch("feat", base);
    t.checkout("feat");
    t.write("both.txt", "feat\n");
    t.write("added.txt", "feat\n");
    t.write("ours-del.txt", "feat\n");
    t.stage(&["both.txt", "added.txt", "ours-del.txt"]);
    t.remove("theirs-del.txt");
    t.commit_index("feat");
    t.checkout("master");
    t.write("both.txt", "master\n");
    t.write("added.txt", "master\n");
    t.write("theirs-del.txt", "master\n");
    t.stage(&["both.txt", "added.txt", "theirs-del.txt"]);
    t.remove("ours-del.txt");
    t.commit_index("master");
    let out = git_core::host_command("git")
        .arg("-C")
        .arg(t.path())
        .args(["merge", "feat"])
        .output()
        .expect("merge");
    assert!(!out.status.success(), "the merge conflicts");

    let s = status(&t.repo).expect("status");
    for p in ["both.txt", "added.txt", "ours-del.txt", "theirs-del.txt"] {
        let e = find(&s, p);
        assert!(e.conflicted, "{e:?}");
        assert_eq!((e.index, e.workdir), (None, None), "{e:?}");
        assert!(!e.submodule && !e.submodule_dirty_only, "{e:?}");
    }
    assert_eq!(
        (s.conflicted, s.staged, s.unstaged, s.untracked),
        (4, 0, 0, 0)
    );
    // A side on disk has its stamp; one deleted on this side has none.
    assert!(find(&s, "both.txt").workdir_stamp.is_some());
}

/// The rename conflicts: one file renamed to two names (rename/rename) leaves
/// the old name both deleted (`DD`) and each new one added by one side only
/// (`AU`, `UA`) — each conflicted-only, as libgit2 reported them.
#[test]
fn rename_conflict_kinds_are_conflicted_only() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    let body: String = (1..=20).map(|i| format!("line {i}\n")).collect();
    let base = t.commit(&[("a.txt", body.as_str())], "base");
    t.branch("feat", base);
    t.checkout("feat");
    t.rename_file("a.txt", "c.txt");
    t.commit_index("feat renames to c");
    t.checkout("master");
    t.rename_file("a.txt", "b.txt");
    t.commit_index("master renames to b");
    let out = git_core::host_command("git")
        .arg("-C")
        .arg(t.path())
        .args(["merge", "feat"])
        .output()
        .expect("merge");
    assert!(!out.status.success(), "the merge conflicts");
    // The index has the three kinds: base only (DD), ours only (AU), theirs only (UA).
    let mut index = t.repo.index().unwrap();
    index.read(true).unwrap();
    let mut kinds: Vec<(String, bool, bool, bool)> = index
        .conflicts()
        .unwrap()
        .map(|c| {
            let c = c.unwrap();
            let entry = c.ancestor.as_ref().or(c.our.as_ref()).or(c.their.as_ref());
            let path = String::from_utf8_lossy(&entry.unwrap().path).into_owned();
            (
                path,
                c.ancestor.is_some(),
                c.our.is_some(),
                c.their.is_some(),
            )
        })
        .collect();
    kinds.sort();
    assert_eq!(
        kinds,
        vec![
            ("a.txt".into(), true, false, false),
            ("b.txt".into(), false, true, false),
            ("c.txt".into(), false, false, true),
        ]
    );

    let s = status(&t.repo).expect("status");
    for p in ["a.txt", "b.txt", "c.txt"] {
        let e = find(&s, p);
        assert!(e.conflicted, "{e:?}");
        assert_eq!((e.index, e.workdir), (None, None), "{e:?}");
        assert!(!e.submodule && !e.submodule_dirty_only, "{e:?}");
    }
    assert_eq!(
        (s.conflicted, s.staged, s.unstaged, s.untracked),
        (3, 0, 0, 0)
    );
    // Both new names are on disk; the old one is gone on both sides.
    assert!(find(&s, "b.txt").workdir_stamp.is_some());
    assert!(find(&s, "c.txt").workdir_stamp.is_some());
    assert_eq!(find(&s, "a.txt").workdir_stamp, None);
}

/// A gitlink staged with no checkout (an empty directory): the stamp is the
/// staged pointer itself.
#[test]
fn an_uninitialized_submodule_is_stamped_from_the_index() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    let pointer = git2::Oid::from_str("1111111111111111111111111111111111111111").unwrap();
    std::fs::create_dir(t.path().join("sub")).unwrap();
    let mut index = t.repo.index().unwrap();
    index
        .add(&git2::IndexEntry {
            ctime: git2::IndexTime::new(0, 0),
            mtime: git2::IndexTime::new(0, 0),
            dev: 0,
            ino: 0,
            mode: 0o160_000,
            uid: 0,
            gid: 0,
            file_size: 0,
            id: pointer,
            flags: 0,
            flags_extended: 0,
            path: b"sub".to_vec(),
        })
        .unwrap();
    index.write().unwrap();

    let s = status(&t.repo).expect("status");
    let e = find(&s, "sub");
    assert!(e.submodule && !e.submodule_dirty_only, "{e:?}");
    assert_eq!((e.index, e.workdir), (Some(FileStatus::Added), None));
    assert_eq!(
        e.workdir_stamp.as_deref(),
        Some(pointer.to_string().as_str())
    );
    assert_eq!(e.index_stamp.as_deref(), Some("1111111111111111"));
}

/// `git add -N`: a working-tree addition, nothing staged. Paired with a file
/// deleted on disk (`.R`), it is two rows, as any working-tree rename; deleted
/// on disk itself, a plain working-tree deletion (Q15).
#[test]
fn intent_to_add_is_a_working_tree_addition() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    let body: String = (1..=12).map(|i| format!("line {i}\n")).collect();
    t.commit(&[("old.txt", body.as_str())], "base");
    t.write("ita.txt", "new\n");
    git(&t, &["add", "-N", "ita.txt"]);
    let s = status(&t.repo).expect("status");
    let e = find(&s, "ita.txt");
    assert_eq!((e.index, e.workdir), (None, Some(FileStatus::Added)));
    assert!(e.workdir_stamp.is_some());
    assert_eq!((s.staged, s.unstaged, s.untracked), (0, 1, 0));

    // Paired by git with a file deleted on disk: two rows.
    std::fs::rename(t.path().join("old.txt"), t.path().join("moved.txt")).unwrap();
    git(&t, &["add", "-N", "moved.txt"]);
    let s = status(&t.repo).expect("status");
    let rows: Vec<(&str, Option<FileStatus>, Option<FileStatus>)> = s
        .entries
        .iter()
        .map(|e| (e.path.as_str(), e.index, e.workdir))
        .collect();
    assert_eq!(
        rows,
        vec![
            ("ita.txt", None, Some(FileStatus::Added)),
            ("moved.txt", None, Some(FileStatus::Added)),
            ("old.txt", None, Some(FileStatus::Deleted)),
        ]
    );

    // Deleted on disk: the same line as a committed empty file deleted (Q15).
    std::fs::remove_file(t.path().join("ita.txt")).unwrap();
    let s = status(&t.repo).expect("status");
    let e = find(&s, "ita.txt");
    assert_eq!((e.index, e.workdir), (None, Some(FileStatus::Deleted)));
    assert_eq!(e.workdir_stamp, None);
}

/// A submodule's checkout deleted (`.D`), deleted after a staged pointer move
/// (`MD`), and replaced by a file (`.T`): stageable, and stamped only by a
/// staged pointer.
#[test]
fn a_missing_or_replaced_submodule_checkout_stays_stageable() {
    if !have_git() {
        return;
    }
    let src = TempRepo::new();
    let first = src.commit(&[("s.txt", "1\n")], "s1");
    src.commit(&[("s.txt", "2\n")], "s2");
    let fresh = || {
        let t = TempRepo::new();
        t.commit(&[("f.txt", "v0\n")], "base");
        t.add_submodule("sub", &src);
        t
    };
    let sub = |t: &TempRepo| {
        let s = status(&t.repo).expect("status");
        find(&s, "sub").clone()
    };

    let t = fresh();
    std::fs::remove_dir_all(t.path().join("sub")).unwrap();
    let e = sub(&t);
    assert_eq!((e.index, e.workdir), (None, Some(FileStatus::Deleted)));
    assert!(e.submodule && !e.submodule_dirty_only, "{e:?}");
    assert_eq!(e.workdir_stamp, None);

    let t = fresh();
    let checkout = git2::Repository::open(t.path().join("sub")).unwrap();
    checkout.set_head_detached(first).unwrap();
    drop(checkout);
    t.stage(&["sub"]);
    std::fs::remove_dir_all(t.path().join("sub")).unwrap();
    let e = sub(&t);
    assert_eq!(
        (e.index, e.workdir),
        (Some(FileStatus::Modified), Some(FileStatus::Deleted))
    );
    assert!(e.submodule && !e.submodule_dirty_only, "{e:?}");
    assert_eq!(e.workdir_stamp.as_deref(), Some(first.to_string().as_str()));

    let t = fresh();
    std::fs::remove_dir_all(t.path().join("sub")).unwrap();
    std::fs::write(t.path().join("sub"), "a file now\n").unwrap();
    let e = sub(&t);
    assert_eq!((e.index, e.workdir), (None, Some(FileStatus::Typechange)));
    assert!(e.submodule && !e.submodule_dirty_only, "{e:?}");
    assert_eq!(e.workdir_stamp, None);
}

/// A path that isn't UTF-8 (an index entry only, so no file on disk on any
/// OS) is listed lossily, and the scan keeps the bytes it was read from.
#[test]
fn a_non_utf8_path_keeps_its_raw_bytes() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[("a.txt", "a\n")], "init");
    let blob = t.repo.blob(b"x").unwrap();
    let mut index = t.repo.index().unwrap();
    index
        .add(&git2::IndexEntry {
            ctime: git2::IndexTime::new(0, 0),
            mtime: git2::IndexTime::new(0, 0),
            dev: 0,
            ino: 0,
            mode: 0o100_644,
            uid: 0,
            gid: 0,
            file_size: 0,
            id: blob,
            flags: 0,
            flags_extended: 0,
            path: b"caf\xe9.txt".to_vec(),
        })
        .unwrap();
    index.write().unwrap();

    let s = status(&t.repo).expect("status");
    let lossy = "caf\u{FFFD}.txt";
    let e = find(&s, lossy);
    assert_eq!(e.index, Some(FileStatus::Added));
    assert_eq!(
        s.raw_paths.get(lossy).map(Vec::as_slice),
        Some(&b"caf\xe9.txt"[..])
    );
}

/// `status.showStash` adds a `# stash` header line, which is skipped.
#[test]
fn a_stash_header_line_is_skipped() {
    if !have_git() {
        return;
    }
    let mut t = TempRepo::new();
    t.commit(&[("a.txt", "a\n")], "init");
    t.write("a.txt", "stashed\n");
    let sig = t.repo.signature().unwrap();
    t.repo.stash_save(&sig, "wip", None).unwrap();
    t.set_config("status.showStash", "true");
    t.write("a.txt", "edited\n");

    let s = status(&t.repo).expect("status");
    assert_eq!(s.entries.len(), 1, "{:?}", s.entries);
    assert_eq!(find(&s, "a.txt").workdir, Some(FileStatus::Modified));
}

/// A user's `status.renames` / `diff.renames` = `copies` would make git print
/// a copy (`C`); the scan asks for plain renames, so a copy is an addition.
#[test]
fn a_users_copies_setting_prints_no_copy() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    let body: String = (1..=20).map(|i| format!("line {i}\n")).collect();
    t.commit(&[("a.txt", body.as_str())], "init");
    t.set_config("status.renames", "copies");
    t.set_config("diff.renames", "copies");
    t.write("a.txt", format!("{body}more\n"));
    t.write("b.txt", body.as_str());
    t.stage(&["a.txt", "b.txt"]);

    let s = status(&t.repo).expect("status");
    let b = find(&s, "b.txt");
    assert_eq!(
        (b.index, b.old_path.as_deref()),
        (Some(FileStatus::Added), None)
    );
    assert_eq!(find(&s, "a.txt").index, Some(FileStatus::Modified));
}

/// `git rm --cached` of a file kept on disk is one entry (staged deletion,
/// untracked file); of a gitlink, its `? sub/` stays a second entry.
#[test]
fn rm_cached_of_a_kept_file_is_one_entry() {
    if !have_git() {
        return;
    }
    let src = TempRepo::new();
    src.commit(&[("s.txt", "1\n")], "s1");
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    t.add_submodule("sub", &src);
    git(&t, &["rm", "--cached", "-q", "f.txt", "sub"]);

    let s = status(&t.repo).expect("status");
    let f = find(&s, "f.txt");
    assert_eq!(
        (f.index, f.workdir),
        (Some(FileStatus::Deleted), Some(FileStatus::Untracked))
    );
    assert!(f.workdir_stamp.is_some());
    let sub = find(&s, "sub");
    assert_eq!((sub.index, sub.workdir), (Some(FileStatus::Deleted), None));
    let nested = find(&s, "sub/");
    assert_eq!(nested.workdir, Some(FileStatus::Untracked));
    assert_eq!(s.entries.iter().filter(|e| e.path == "f.txt").count(), 1);
    // f.txt counts once as untracked, beside `sub/`.
    assert_eq!(s.untracked, 2);
}

/// An untracked nested repository (`? x/`) reads as a submodule with no stamp,
/// and keeps its `/` (Q14).
#[test]
fn an_untracked_nested_repository_reads_as_a_submodule() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    let nested = git2::Repository::init(t.path().join("x")).unwrap();
    std::fs::write(t.path().join("x").join("n.txt"), "n\n").unwrap();
    drop(nested);

    let s = status(&t.repo).expect("status");
    let e = find(&s, "x/");
    assert_eq!(e.workdir, Some(FileStatus::Untracked));
    assert!(e.submodule && !e.submodule_dirty_only, "{e:?}");
    assert_eq!(e.workdir_stamp, None);
}

/// A skip-worktree file missing from disk (a sparse checkout) is no change.
#[test]
fn a_skip_worktree_file_missing_from_disk_is_no_entry() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n"), ("g.txt", "g\n")], "base");
    git(&t, &["update-index", "--skip-worktree", "f.txt"]);
    std::fs::remove_file(t.path().join("f.txt")).unwrap();

    let s = status(&t.repo).expect("status");
    assert!(s.entries.is_empty(), "{:?}", s.entries);
}

/// L7: past git's default limit of 1000, renames with new names and an edit
/// each still pair (up to 3000).
#[test]
fn a_thousand_and_one_edited_renames_pair() {
    if !have_git() {
        return;
    }
    let t = TempRepo::new();
    let body = |i: usize| -> String { (0..10).map(|k| format!("{i}-{k}\n")).collect() };
    let files: Vec<(String, String)> = (0..1001).map(|i| (format!("f{i}.txt"), body(i))).collect();
    let refs: Vec<(&str, &str)> = files
        .iter()
        .map(|(p, c)| (p.as_str(), c.as_str()))
        .collect();
    t.commit(&refs, "base");
    for (i, (p, c)) in files.iter().enumerate() {
        std::fs::remove_file(t.path().join(p)).unwrap();
        t.write(&format!("g{i}.txt"), c.replace(&format!("{i}-9"), "edited"));
    }
    git(&t, &["add", "-A"]);

    let s = status(&t.repo).expect("status");
    assert_eq!(s.entries.len(), 1001);
    assert!(
        s.entries
            .iter()
            .all(|e| e.index == Some(FileStatus::Renamed) && e.old_path.is_some()),
        "{:?}",
        s.entries
            .iter()
            .find(|e| e.index != Some(FileStatus::Renamed))
    );
}

/// T7: cancelling the scan kills git's whole process group and returns
/// `Cancelled` at once. The "git" is a script that starts a sleeper and waits.
#[cfg(unix)]
#[tokio::test]
async fn cancelling_a_scan_kills_its_process_group() {
    use std::os::unix::fs::PermissionsExt;
    use std::time::{Duration, Instant};

    use git_core::cli::GitCli;
    use git_core::status::scan;
    use tokio_util::sync::CancellationToken;

    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    let dir = tempfile::tempdir().unwrap();
    let pid = dir.path().join("pid");
    let script = dir.path().join("git");
    std::fs::write(
        &script,
        format!(
            // Written aside and moved in, so the file never exists empty.
            "#!/bin/sh\nsleep 30 &\necho $! > '{0}.tmp'\nmv '{0}.tmp' '{0}'\nwait\n",
            pid.display()
        ),
    )
    .unwrap();
    std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();

    let cancel = CancellationToken::new();
    let canceller = cancel.clone();
    let pid_file = pid.clone();
    tokio::spawn(async move {
        while !pid_file.exists() {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        canceller.cancel();
    });
    let started = Instant::now();
    let r = scan(&GitCli::new(script.to_string_lossy()), t.path(), cancel).await;
    assert!(matches!(r, Err(GitError::Cancelled)), "{r:?}");
    assert!(
        started.elapsed() < Duration::from_secs(10),
        "{:?}",
        started.elapsed()
    );

    let sleeper: i32 = std::fs::read_to_string(&pid)
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    // SAFETY: signal 0 only probes the pid.
    while unsafe { libc::kill(sleeper, 0) } == 0 {
        assert!(Instant::now() < deadline, "the sleeper outlived the cancel");
        std::thread::sleep(Duration::from_millis(20));
    }
}
