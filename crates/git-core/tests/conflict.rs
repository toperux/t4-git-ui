//! Unmerged index entries: the three sides a merge editor needs.

use git_core::conflict;
use git_core::test_util::TempRepo;

/// `master` and `feat` both edit `f.txt`; `feat` also deletes `d.txt`, which
/// `master` edits — a modify/delete conflict, whose "theirs" side is absent.
fn conflicted() -> TempRepo {
    let t = TempRepo::new();
    let base = t.commit(&[("f.txt", "base\n"), ("d.txt", "base\n")], "base");
    t.branch("feat", base);
    t.checkout("feat");
    t.remove("d.txt");
    t.write("f.txt", "feat\n");
    t.stage(&["f.txt"]);
    let feat = t.commit_index("feat");
    t.checkout("master");
    t.commit(&[("f.txt", "master\n"), ("d.txt", "master\n")], "master");
    {
        let ann = t.repo.find_annotated_commit(feat).expect("annotated");
        t.repo.merge(&[&ann], None, None).expect("merge");
    }
    t
}

#[test]
fn stages_carry_every_side_that_exists() {
    let t = conflicted();

    let both = conflict::stages(&t.repo, "f.txt")
        .expect("stages")
        .expect("f.txt is conflicted");
    assert!(both.ancestor.is_some());
    assert!(both.ours.is_some());
    assert!(both.theirs.is_some());
    let ours = t.repo.find_blob(both.ours.unwrap()).expect("ours");
    let theirs = t.repo.find_blob(both.theirs.unwrap()).expect("theirs");
    assert_eq!(ours.content(), b"master\n");
    assert_eq!(theirs.content(), b"feat\n");

    // Deleted on their side: the merge editor gets an empty "theirs".
    let deleted = conflict::stages(&t.repo, "d.txt")
        .expect("stages")
        .expect("d.txt is conflicted");
    assert!(deleted.ours.is_some());
    assert_eq!(deleted.theirs, None);

    assert_eq!(conflict::stages(&t.repo, "nothing.txt").expect("stages"), None);
}
