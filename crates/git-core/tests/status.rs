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
