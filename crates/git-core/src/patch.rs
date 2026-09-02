//! Builds a unified-diff patch from a subset of a stage-able [`FileDiff`]'s
//! hunks or lines, for `git apply --cached` (stage) / `git apply --cached -R`
//! (unstage).
//!
//! Forward (index ← workdir): the index is the OLD side of the diff, so
//! unselected `+` lines are dropped and unselected `-` lines become context.
//! Reverse (index ← HEAD, applied with `-R`): the index is the NEW side, so
//! the rule mirrors — unselected `-` lines are dropped and unselected `+`
//! lines become context. Hunk ranges are recomputed and the non-anchor side's
//! start is shifted by the cumulative size change of the emitted hunks.

use std::collections::{BTreeMap, BTreeSet};

use crate::diff::{DiffLineKind, FileDiff, FileStatus, Hunk};
use crate::GitError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PatchSelection {
    /// Whole hunks by index into `FileDiff::hunks`.
    Hunks(Vec<usize>),
    /// `(hunk index, line index within the hunk)`; context lines are always
    /// included, so every touched hunk needs at least one selected `+`/`-`.
    Lines(Vec<(usize, usize)>),
}

struct OutLine<'a> {
    kind: DiffLineKind,
    text: &'a str,
    no_newline: bool,
}

struct OutHunk<'a> {
    old_start: u32,
    old_len: u32,
    new_start: u32,
    new_len: u32,
    lines: Vec<OutLine<'a>>,
}

/// Per selected hunk: `None` = the whole hunk, `Some(set)` = those line indices.
fn selected_hunks(
    diff: &FileDiff,
    selection: &PatchSelection,
) -> Result<BTreeMap<usize, Option<BTreeSet<usize>>>, GitError> {
    let mut out: BTreeMap<usize, Option<BTreeSet<usize>>> = BTreeMap::new();
    match selection {
        PatchSelection::Hunks(hunks) => {
            for &h in hunks {
                if h >= diff.hunks.len() {
                    return Err(GitError::InvalidPatch);
                }
                out.insert(h, None);
            }
        }
        PatchSelection::Lines(lines) => {
            for &(h, l) in lines {
                if h >= diff.hunks.len() || l >= diff.hunks[h].lines.len() {
                    return Err(GitError::InvalidPatch);
                }
                out.entry(h)
                    .or_insert_with(|| Some(BTreeSet::new()))
                    .get_or_insert_with(BTreeSet::new)
                    .insert(l);
            }
        }
    }
    if out.is_empty() {
        return Err(GitError::InvalidPatch);
    }
    Ok(out)
}

fn transform<'a>(
    hunk: &'a Hunk,
    lines: Option<&BTreeSet<usize>>,
    reverse: bool,
) -> Result<Vec<OutLine<'a>>, GitError> {
    let mut out = Vec::with_capacity(hunk.lines.len());
    let mut changed = false;
    for (i, line) in hunk.lines.iter().enumerate() {
        let selected = lines.is_none_or(|set| set.contains(&i));
        let kind = match (line.kind, selected) {
            (DiffLineKind::Context, _) => DiffLineKind::Context,
            (k, true) => {
                changed = true;
                k
            }
            (DiffLineKind::Add, false) if reverse => DiffLineKind::Context,
            (DiffLineKind::Del, false) if !reverse => DiffLineKind::Context,
            (_, false) => continue,
        };
        out.push(OutLine {
            kind,
            text: &line.text,
            no_newline: line.no_newline,
        });
    }
    if !changed {
        return Err(GitError::InvalidPatch);
    }
    Ok(out)
}

/// Builds the patch text for `selection`; `reverse` when it will be applied
/// with `git apply -R` (i.e. the diff is HEAD → index and the index is the
/// side being edited). `mode` emits the `old mode` / `new mode` header lines
/// for a mode change — wanted for a stage / unstage, never for a discard: `-R`
/// reverses those lines too, and the working tree's exec bit was not part of
/// the selection.
pub fn build_patch(
    diff: &FileDiff,
    selection: &PatchSelection,
    reverse: bool,
    mode: bool,
) -> Result<String, GitError> {
    if diff.binary || diff.truncated || diff.hunks.is_empty() {
        return Err(GitError::InvalidPatch);
    }
    // Blob ↔ symlink ↔ gitlink: git rejects a patch whose two modes disagree
    // in their type bits, and the two contents have nothing in common anyway.
    if let (Some(o), Some(n)) = (diff.old_mode.as_deref(), diff.new_mode.as_deref()) {
        if o.get(..2) != n.get(..2) {
            return Err(GitError::Refused(format!(
                "{} is a type change; stage the whole file",
                diff.path
            )));
        }
    }
    let selected = selected_hunks(diff, selection)?;

    let mut hunks: Vec<OutHunk<'_>> = Vec::with_capacity(selected.len());
    // Cumulative (new_len - old_len) of emitted hunks: shifts the non-anchor side.
    let mut delta: i64 = 0;
    for (h, lines) in &selected {
        let hunk = &diff.hunks[*h];
        let out = transform(hunk, lines.as_ref(), reverse)?;
        let old_len = out.iter().filter(|l| l.kind != DiffLineKind::Add).count() as u32;
        let new_len = out.iter().filter(|l| l.kind != DiffLineKind::Del).count() as u32;
        // A zero-length range points at the line BEFORE it; a non-empty side
        // starts at least at line 1 (an added/deleted file hunk starts at 0).
        let (old_start, new_start) = if reverse {
            let ns = if new_len > 0 {
                hunk.new_start.max(1)
            } else {
                hunk.new_start
            };
            let mut os = (ns as i64 - delta).max(0) as u32;
            if new_len == 0 && old_len > 0 {
                os += 1;
            } else if old_len == 0 && new_len > 0 {
                os = os.saturating_sub(1);
            }
            (os, ns)
        } else {
            let os = if old_len > 0 {
                hunk.old_start.max(1)
            } else {
                hunk.old_start
            };
            let mut ns = (os as i64 + delta).max(0) as u32;
            if old_len == 0 && new_len > 0 {
                ns += 1;
            } else if new_len == 0 && old_len > 0 {
                ns = ns.saturating_sub(1);
            }
            (os, ns)
        };
        delta += new_len as i64 - old_len as i64;
        hunks.push(OutHunk {
            old_start,
            old_len,
            new_start,
            new_len,
            lines: out,
        });
    }

    let path = diff.path.as_str();
    let old_path = diff.old_path.as_deref().unwrap_or(path);
    let all = |kind: DiffLineKind| hunks.iter().all(|h| h.lines.iter().all(|l| l.kind == kind));
    let old_mode = diff.old_mode.as_deref();
    let new_mode = diff.new_mode.as_deref();
    // Only a real change earns the header lines; git apply carries the exec bit
    // into the index from them, so a partial stage of the file takes it along.
    let mode_lines = match (old_mode, new_mode) {
        (Some(o), Some(n)) if mode && o != n => format!("old mode {o}\nnew mode {n}\n"),
        _ => String::new(),
    };
    let mut s = String::new();
    match diff.status {
        // A subset of an added/deleted file's lines is a modification of the
        // (index) file, not a whole-file creation/deletion.
        FileStatus::Added | FileStatus::Untracked if all(DiffLineKind::Add) => {
            let mode = new_mode.unwrap_or("100644");
            s.push_str(&format!(
                "diff --git a/{path} b/{path}\nnew file mode {mode}\n--- /dev/null\n+++ b/{path}\n"
            ));
        }
        FileStatus::Deleted if all(DiffLineKind::Del) => {
            let mode = old_mode.unwrap_or("100644");
            s.push_str(&format!(
                "diff --git a/{path} b/{path}\ndeleted file mode {mode}\n--- a/{path}\n+++ /dev/null\n"
            ));
        }
        FileStatus::Renamed | FileStatus::Copied if old_path != path => {
            s.push_str(&format!(
                "diff --git a/{old_path} b/{path}\nrename from {old_path}\nrename to {path}\n{mode_lines}--- a/{old_path}\n+++ b/{path}\n"
            ));
        }
        _ => {
            s.push_str(&format!(
                "diff --git a/{path} b/{path}\n{mode_lines}--- a/{path}\n+++ b/{path}\n"
            ));
        }
    }
    for h in &hunks {
        s.push_str(&format!(
            "@@ -{},{} +{},{} @@\n",
            h.old_start, h.old_len, h.new_start, h.new_len
        ));
        for l in &h.lines {
            s.push(match l.kind {
                DiffLineKind::Context => ' ',
                DiffLineKind::Add => '+',
                DiffLineKind::Del => '-',
            });
            s.push_str(l.text);
            s.push('\n');
            if l.no_newline {
                s.push_str("\\ No newline at end of file\n");
            }
        }
    }
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diff::{file_diff, DiffOptions, DiffTarget};
    use crate::test_util::TempRepo;

    fn unstaged(t: &TempRepo, path: &str) -> FileDiff {
        file_diff(
            &t.repo,
            &DiffTarget::Unstaged,
            path,
            &DiffOptions::default(),
        )
        .expect("file_diff")
    }

    fn staged(t: &TempRepo, path: &str) -> FileDiff {
        file_diff(&t.repo, &DiffTarget::Staged, path, &DiffOptions::default()).expect("file_diff")
    }

    fn numbered(n: u32) -> String {
        (1..=n).map(|i| format!("line {i}\n")).collect()
    }

    /// Indices of `+`/`-` lines in hunk `h`.
    fn change_lines(diff: &FileDiff, h: usize) -> Vec<usize> {
        diff.hunks[h]
            .lines
            .iter()
            .enumerate()
            .filter(|(_, l)| l.kind != DiffLineKind::Context)
            .map(|(i, _)| i)
            .collect()
    }

    #[test]
    fn hunk_subset_recomputes_new_start() {
        let t = TempRepo::new();
        t.commit(&[("f.txt", &numbered(30))], "base");
        // Edit line 2, insert two lines after 15, delete line 28 → three hunks.
        let mut lines: Vec<String> = numbered(30).lines().map(String::from).collect();
        lines[1] = "LINE 2".into();
        lines.insert(15, "extra a".into());
        lines.insert(16, "extra b".into());
        lines.remove(29);
        t.write("f.txt", lines.join("\n") + "\n");
        let d = unstaged(&t, "f.txt");
        assert_eq!(
            d.hunks.len(),
            3,
            "{:?}",
            d.hunks.iter().map(|h| &h.header).collect::<Vec<_>>()
        );

        // Only the middle and last hunks: the first (unselected) edit doesn't
        // shift anything, the insert shifts the last hunk's new side by +2.
        let p = build_patch(&d, &PatchSelection::Hunks(vec![1, 2]), false, true).unwrap();
        assert!(
            p.starts_with(
                "diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -13,6 +13,8 @@\n"
            ),
            "{p}"
        );
        assert!(p.contains("\n@@ -25,6 +27,5 @@\n"), "{p}");
        assert!(!p.contains("LINE 2"));
        assert!(p.contains("+extra a\n+extra b\n"));
        assert!(p.contains("-line 28\n"));
    }

    #[test]
    fn line_subset_forward_drops_adds_and_keeps_dels_as_context() {
        let t = TempRepo::new();
        t.commit(&[("f.txt", "a\nb\nc\n")], "base");
        t.write("f.txt", "a\nB1\nB2\nc\n");
        let d = unstaged(&t, "f.txt");
        let ch = change_lines(&d, 0);
        // lines: ' a', '-b', '+B1', '+B2', ' c' → ch = [1,2,3]
        assert_eq!(ch, vec![1, 2, 3]);

        // Only the first add: `-b` becomes context.
        let p = build_patch(&d, &PatchSelection::Lines(vec![(0, 2)]), false, true).unwrap();
        assert!(p.ends_with("@@ -1,3 +1,4 @@\n a\n b\n+B1\n c\n"), "{p}");

        // Only the del: both adds dropped.
        let p = build_patch(&d, &PatchSelection::Lines(vec![(0, 1)]), false, true).unwrap();
        assert!(p.ends_with("@@ -1,3 +1,2 @@\n a\n-b\n c\n"), "{p}");

        // Mixed: del + second add.
        let p = build_patch(
            &d,
            &PatchSelection::Lines(vec![(0, 1), (0, 3)]),
            false,
            true,
        )
        .unwrap();
        assert!(p.ends_with("@@ -1,3 +1,3 @@\n a\n-b\n+B2\n c\n"), "{p}");

        // Context-only selection is not a patch.
        assert!(matches!(
            build_patch(&d, &PatchSelection::Lines(vec![(0, 0)]), false, true),
            Err(GitError::InvalidPatch)
        ));
        assert!(matches!(
            build_patch(&d, &PatchSelection::Lines(vec![(0, 99)]), false, true),
            Err(GitError::InvalidPatch)
        ));
        assert!(matches!(
            build_patch(&d, &PatchSelection::Hunks(vec![]), false, true),
            Err(GitError::InvalidPatch)
        ));
    }

    #[test]
    fn line_subset_reverse_mirrors_rules() {
        let t = TempRepo::new();
        t.commit(&[("f.txt", "a\nb\nc\n")], "base");
        t.write("f.txt", "a\nB1\nB2\nc\n");
        t.stage(&["f.txt"]);
        let d = staged(&t, "f.txt");
        // Unstage only `+B1`: `+B2` stays in the index (context), `-b` is not
        // in the index (dropped).
        let p = build_patch(&d, &PatchSelection::Lines(vec![(0, 2)]), true, true).unwrap();
        assert!(p.ends_with("@@ -1,3 +1,4 @@\n a\n+B1\n B2\n c\n"), "{p}");
        // Unstage only `-b`: index gets `b` back before B1/B2.
        let p = build_patch(&d, &PatchSelection::Lines(vec![(0, 1)]), true, true).unwrap();
        assert!(
            p.ends_with("@@ -1,5 +1,4 @@\n a\n-b\n B1\n B2\n c\n"),
            "{p}"
        );
    }

    #[test]
    fn added_and_deleted_files() {
        let t = TempRepo::new();
        t.commit(&[("keep.txt", "k\n")], "base");
        t.write("new.txt", "x\ny\n");
        let d = unstaged(&t, "new.txt");
        assert_eq!(d.status, FileStatus::Untracked);
        let p = build_patch(&d, &PatchSelection::Hunks(vec![0]), false, true).unwrap();
        assert_eq!(
            p,
            "diff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+x\n+y\n"
        );

        t.stage(&["new.txt"]);
        let d = staged(&t, "new.txt");
        assert_eq!(d.status, FileStatus::Added);
        // Partial unstage of a new file: a modification of the index copy.
        let p = build_patch(&d, &PatchSelection::Lines(vec![(0, 1)]), true, true).unwrap();
        assert_eq!(
            p,
            "diff --git a/new.txt b/new.txt\n--- a/new.txt\n+++ b/new.txt\n@@ -1,1 +1,2 @@\n x\n+y\n"
        );

        std::fs::remove_file(t.path().join("keep.txt")).unwrap();
        let d = unstaged(&t, "keep.txt");
        assert_eq!(d.status, FileStatus::Deleted);
        let p = build_patch(&d, &PatchSelection::Hunks(vec![0]), false, true).unwrap();
        assert_eq!(
            p,
            "diff --git a/keep.txt b/keep.txt\ndeleted file mode 100644\n--- a/keep.txt\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-k\n"
        );
    }

    #[test]
    fn mode_change_emits_old_and_new_mode_lines() {
        let t = TempRepo::new();
        t.commit(&[("f.txt", "a\nb\n")], "base");
        t.write("f.txt", "a\nB\n");
        let mut d = unstaged(&t, "f.txt");
        // Windows never reports a mode change (core.filemode=false), so the
        // exec bit is set on the fixture; tests/patch.rs covers the real thing.
        d.old_mode = Some("100644".into());
        d.new_mode = Some("100755".into());
        let p = build_patch(&d, &PatchSelection::Hunks(vec![0]), false, true).unwrap();
        assert_eq!(
            p,
            "diff --git a/f.txt b/f.txt\nold mode 100644\nnew mode 100755\n--- a/f.txt\n+++ b/f.txt\n@@ -1,2 +1,2 @@\n a\n-b\n+B\n"
        );
    }

    #[test]
    fn new_executable_file_uses_its_mode() {
        let t = TempRepo::new();
        t.commit(&[("keep.txt", "k\n")], "base");
        t.write("new.sh", "x\n");
        let mut d = unstaged(&t, "new.sh");
        d.new_mode = Some("100755".into());
        let p = build_patch(&d, &PatchSelection::Hunks(vec![0]), false, true).unwrap();
        assert_eq!(
            p,
            "diff --git a/new.sh b/new.sh\nnew file mode 100755\n--- /dev/null\n+++ b/new.sh\n@@ -0,0 +1,1 @@\n+x\n"
        );
    }

    #[test]
    fn unchanged_mode_emits_no_mode_lines() {
        let t = TempRepo::new();
        t.commit(&[("f.txt", "a\nb\n")], "base");
        t.write("f.txt", "a\nB\n");
        let d = unstaged(&t, "f.txt");
        assert_eq!(d.old_mode.as_deref(), Some("100644"));
        assert_eq!(d.new_mode, d.old_mode);
        let p = build_patch(&d, &PatchSelection::Hunks(vec![0]), false, true).unwrap();
        assert!(!p.contains("mode"), "{p}");
    }

    #[test]
    fn a_discard_never_carries_the_mode_lines() {
        let t = TempRepo::new();
        t.commit(&[("f.txt", "a\nb\n")], "base");
        t.write("f.txt", "a\nB\n");
        let mut d = unstaged(&t, "f.txt");
        d.old_mode = Some("100644".into());
        d.new_mode = Some("100755".into());
        // `git apply -R` would reverse them too, chmod'ing a file the user only
        // asked to revert the lines of.
        let p = build_patch(&d, &PatchSelection::Hunks(vec![0]), true, false).unwrap();
        assert!(!p.contains("old mode"), "{p}");
        assert!(!p.contains("new mode"), "{p}");
        assert!(
            p.starts_with("diff --git a/f.txt b/f.txt\n--- a/f.txt\n"),
            "{p}"
        );
    }

    #[test]
    fn a_type_change_is_refused() {
        let t = TempRepo::new();
        t.commit(&[("f.txt", "a\nb\n")], "base");
        t.write("f.txt", "a\nB\n");
        let mut d = unstaged(&t, "f.txt");
        d.old_mode = Some("100644".into());
        d.new_mode = Some("120000".into());
        let e = build_patch(&d, &PatchSelection::Hunks(vec![0]), false, true);
        assert!(
            matches!(&e, Err(GitError::Refused(m)) if m == "f.txt is a type change; stage the whole file"),
            "{e:?}"
        );
        // Same type, different bits (the exec bit) is not a type change.
        d.new_mode = Some("100755".into());
        assert!(build_patch(&d, &PatchSelection::Hunks(vec![0]), false, true).is_ok());
    }

    #[test]
    fn crlf_is_byte_exact_and_no_newline_marker_kept() {
        let t = TempRepo::new();
        // Don't let a global `core.autocrlf` normalize the fixture.
        t.set_config("core.autocrlf", "false");
        t.commit(&[("f.txt", "a\r\nb\r\n")], "base");
        t.write("f.txt", "a\r\nB\r\nc");
        let d = unstaged(&t, "f.txt");
        let p = build_patch(&d, &PatchSelection::Hunks(vec![0]), false, true).unwrap();
        assert!(
            p.ends_with("@@ -1,2 +1,3 @@\n a\r\n-b\r\n+B\r\n+c\n\\ No newline at end of file\n"),
            "{p:?}"
        );
    }
}
