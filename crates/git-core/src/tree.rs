//! A revision's whole file list and one file's content at it — what the Files
//! tab shows, as opposed to [`crate::diff`]'s "what changed".
//!
//! The working tree is the **index** (tracked files, so a staged add is listed
//! and a staged delete is not) minus what is missing on disk, and content comes
//! from disk. Every disk read goes through [`repo_relative`], even though the
//! path came from our own listing: the frontend is what sends it back.

use std::io::Read;
use std::path::{Path, PathBuf};

use git2::{FileMode, ObjectType, Oid, Repository, Tree, TreeWalkMode, TreeWalkResult};
use serde::{Deserialize, Serialize};

use crate::diff::DiffOptions;
use crate::repo::{has_git_component, repo_relative};
use crate::{map_git2, GitError};

/// What a listed path is. A tree is never listed — the frontend nests the
/// paths itself, as it does for the changed-file list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EntryKind {
    Blob,
    Symlink,
    /// A gitlink: another repository's commit, with no content here.
    Submodule,
}

/// One file of a revision.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
    /// `/`-separated, repo-relative.
    pub path: String,
    /// Blob size (a symlink: its target's length; a submodule: 0).
    pub size: u64,
    /// Octal mode, as [`crate::diff`] reports it.
    pub mode: String,
    pub kind: EntryKind,
}

/// Which revision to list / read: a commit, or the index + working tree.
/// Compare mode picks the *to* commit, so there is no range here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TreeTarget {
    Commit { oid: String },
    WorkingTree,
}

/// A revision's files plus the tree they came from, which the frontend caches
/// the list by: moving between commits that share a tree is then no refetch.
/// `None` for the working tree, which has no tree object.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeListing {
    pub entries: Vec<TreeEntry>,
    pub oid: Option<String>,
}

/// One file's content at a revision.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub path: String,
    /// The text without a trailing-newline line; `None` for a binary file.
    pub text: Option<String>,
    pub binary: bool,
    /// Size of the whole file, whatever `text` was cut to.
    pub size: u64,
    /// `true` when the text was cut: at `max_lines` lines, or at the byte cap
    /// (whole lines either way).
    pub truncated: bool,
    /// The cap `truncated` refers to, so the banner quotes the real number.
    pub max_lines: usize,
    pub kind: EntryKind,
}

/// `git2::FileMode` of a raw mode word: tree entries and index entries both
/// carry one, and git2 has no conversion of its own.
fn file_mode(raw: u32) -> FileMode {
    match raw {
        0o120_000 => FileMode::Link,
        0o160_000 => FileMode::Commit,
        m if m & 0o111 != 0 => FileMode::BlobExecutable,
        _ => FileMode::Blob,
    }
}

fn kind_of(mode: FileMode) -> EntryKind {
    match mode {
        FileMode::Link => EntryKind::Symlink,
        FileMode::Commit => EntryKind::Submodule,
        _ => EntryKind::Blob,
    }
}

/// Octal text of a listed entry's mode. Unlike [`crate::diff`]'s, no tree ever
/// reaches here, so there is no `None` case to carry through the IPC type.
fn mode_text(mode: FileMode) -> String {
    match mode {
        FileMode::BlobExecutable => "100755",
        FileMode::Link => "120000",
        FileMode::Commit => "160000",
        _ => "100644",
    }
    .to_string()
}

/// The rule libgit2's own `binary` flag comes from (and so [`crate::diff`]'s):
/// a NUL byte in the first 8000 bytes.
fn looks_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8000).any(|b| *b == 0)
}

/// The line cap, shared with [`crate::diff`] so the content view and the diff
/// truncate at the same number and say so in the same banner.
fn max_lines() -> usize {
    DiffOptions::default().max_lines
}

/// Byte cap on one content read. [`max_lines`] alone bounds nothing: a file can
/// be one enormous line, and the view shows its head either way.
const MAX_BYTES: u64 = 16 << 20;
/// What is kept of a capped file that has no newline in its first [`MAX_BYTES`].
const ONE_LINE_BYTES: usize = 64 << 10;

/// At most [`MAX_BYTES`] + 1 bytes of `r` — one byte over, so the caller can
/// tell a file that ends at the cap from one that runs past it.
fn read_capped(r: impl std::io::Read) -> std::io::Result<Vec<u8>> {
    let mut buf = Vec::new();
    r.take(MAX_BYTES + 1).read_to_end(&mut buf)?;
    Ok(buf)
}

fn tree_of<'r>(repo: &'r Repository, oid: &str) -> Result<Tree<'r>, GitError> {
    let oid = Oid::from_str(oid).map_err(map_git2)?;
    repo.find_commit(oid)
        .and_then(|c| c.tree())
        .map_err(map_git2)
}

fn workdir(repo: &Repository) -> Result<&Path, GitError> {
    repo.workdir()
        .ok_or_else(|| GitError::Refused("bare repository".into()))
}

/// Every file of `target`, sorted by path (as the status is).
pub fn list(repo: &Repository, target: &TreeTarget) -> Result<TreeListing, GitError> {
    let (mut entries, oid) = match target {
        TreeTarget::Commit { oid } => {
            let tree = tree_of(repo, oid)?;
            let id = tree.id().to_string();
            (commit_entries(repo, &tree)?, Some(id))
        }
        TreeTarget::WorkingTree => (index_entries(repo)?, None),
    };
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(TreeListing { entries, oid })
}

fn commit_entries(repo: &Repository, tree: &Tree<'_>) -> Result<Vec<TreeEntry>, GitError> {
    // Object headers, not the blobs: 47k paths would otherwise mean 47k
    // inflations for nothing but a size.
    let odb = repo.odb().map_err(map_git2)?;
    let mut out = Vec::new();
    tree.walk(TreeWalkMode::PreOrder, |root, entry| {
        if entry.kind() == Some(ObjectType::Tree) {
            return TreeWalkResult::Ok;
        }
        let mode = file_mode(u32::try_from(entry.filemode_raw()).unwrap_or(0));
        let name = String::from_utf8_lossy(entry.name_bytes());
        out.push(TreeEntry {
            path: format!("{root}{name}"),
            // A submodule's commit is not an object here, and a partial clone
            // may not hold the blob either: an unreadable size shows as 0
            // rather than failing the whole listing.
            size: match odb.read_header(entry.id()) {
                Ok((size, _)) => size as u64,
                Err(_) => 0,
            },
            mode: mode_text(mode),
            kind: kind_of(mode),
        });
        TreeWalkResult::Ok
    })
    .map_err(map_git2)?;
    Ok(out)
}

/// Index entries that still exist on disk, deduped by path: a conflicted file
/// holds up to three stage entries, and the tab lists files, not stages.
fn index_entries(repo: &Repository) -> Result<Vec<TreeEntry>, GitError> {
    let workdir = workdir(repo)?.to_path_buf();
    let mut index = repo.index().map_err(map_git2)?;
    index.read(false).map_err(map_git2)?;
    let mut out: Vec<TreeEntry> = Vec::with_capacity(index.len());
    for entry in index.iter() {
        let path = String::from_utf8_lossy(&entry.path).into_owned();
        // The index is sorted by (path, stage), so the first stage of a
        // conflict is always the one already pushed.
        if out.last().is_some_and(|e| e.path == path) {
            continue;
        }
        let mode = file_mode(entry.mode);
        // `symlink_metadata`: a symlink is present as itself even when it
        // dangles, and its own length is what the listing shows.
        let Ok(meta) = std::fs::symlink_metadata(workdir.join(&path)) else {
            continue;
        };
        out.push(TreeEntry {
            path,
            size: if mode == FileMode::Commit {
                0
            } else {
                meta.len()
            },
            mode: mode_text(mode),
            kind: kind_of(mode),
        });
    }
    Ok(out)
}

/// `path`'s content at `target`: the blob at a commit, the file on disk for the
/// working tree. A symlink reads as its target, a submodule as a one-liner.
pub fn read(repo: &Repository, target: &TreeTarget, path: &str) -> Result<FileContent, GitError> {
    let rel = repo_relative(path)?;
    let (mut bytes, kind, size) = match target {
        TreeTarget::Commit { oid } => {
            let entry = tree_of(repo, oid)?.get_path(rel).map_err(map_git2)?;
            let mode = file_mode(u32::try_from(entry.filemode_raw()).unwrap_or(0));
            if mode == FileMode::Commit {
                return Ok(submodule(path, entry.id()));
            }
            let blob = repo.find_blob(entry.id()).map_err(map_git2)?;
            let content = blob.content();
            // `odb.reader` streams loose objects only (a packed one is not
            // found), so libgit2 inflates the blob whole either way; what is
            // capped is the copy taken out of it.
            let keep = content.len().min(MAX_BYTES as usize + 1);
            (
                content[..keep].to_vec(),
                kind_of(mode),
                content.len() as u64,
            )
        }
        TreeTarget::WorkingTree => {
            let abs = workdir(repo)?.join(rel);
            let meta = std::fs::symlink_metadata(&abs)?;
            if meta.is_symlink() {
                let link = std::fs::read_link(&abs)?;
                let text = link.to_string_lossy().replace('\\', "/");
                return Ok(text_content(path, text, EntryKind::Symlink, meta.len()));
            }
            if meta.is_dir() {
                // A gitlink's working-tree side is the submodule's own checkout.
                let oid = repo
                    .find_submodule(path)
                    .ok()
                    .and_then(|s| s.workdir_id())
                    .unwrap_or(Oid::ZERO_SHA1);
                return Ok(submodule(path, oid));
            }
            (
                read_capped(std::fs::File::open(&abs)?)?,
                EntryKind::Blob,
                meta.len(),
            )
        }
    };

    if looks_binary(&bytes) {
        return Ok(FileContent {
            path: path.to_string(),
            text: None,
            binary: true,
            size,
            truncated: false,
            max_lines: max_lines(),
            kind,
        });
    }
    // Past the byte cap: drop the extra byte and the half line it sat in, so
    // the text still ends where a line does.
    let capped = bytes.len() as u64 > MAX_BYTES;
    if capped {
        bytes.truncate(MAX_BYTES as usize);
        // No newline at all is one enormous line (a minified bundle): its head
        // is all the view can show, so keep just that rather than 16 MiB of it.
        let cut = bytes
            .iter()
            .rposition(|b| *b == b'\n')
            .map_or(ONE_LINE_BYTES, |i| i + 1);
        bytes.truncate(cut);
    }
    let mut content = text_content(
        path,
        String::from_utf8_lossy(&bytes).into_owned(),
        kind,
        size,
    );
    content.truncated |= capped;
    Ok(content)
}

/// Text capped at [`max_lines`] lines. A trailing `\r` is kept, as the diff
/// keeps it, so CRLF content stays visible.
fn text_content(path: &str, text: String, kind: EntryKind, size: u64) -> FileContent {
    let cap = max_lines();
    let mut lines = text.split('\n');
    let kept: Vec<&str> = lines.by_ref().take(cap).collect();
    // `split` yields one empty trailing piece for a file ending in `\n`, which
    // is not a line: the first piece past the cap counts only if it has text,
    // and anything after it is a line whatever it holds.
    let truncated = lines.next().is_some_and(|t| !t.is_empty()) || lines.next().is_some();
    FileContent {
        path: path.to_string(),
        text: Some(kept.join("\n")),
        binary: false,
        size,
        truncated,
        max_lines: cap,
        kind,
    }
}

/// A gitlink has no content here — only which commit it points at.
fn submodule(path: &str, oid: Oid) -> FileContent {
    FileContent {
        path: path.to_string(),
        text: Some(format!("submodule at {:.7}", oid.to_string())),
        binary: false,
        size: 0,
        truncated: false,
        max_lines: max_lines(),
        kind: EntryKind::Submodule,
    }
}

/// Writes `path`'s content at `target` to `dest` (the native save dialog's
/// answer) — the whole blob, never the truncated text the view shows.
///
/// A `dest` inside a `.git` directory is refused: the dialog can name anywhere
/// on disk, and overwriting `.git/index` or a hook is not a save.
pub fn save_as(
    repo: &Repository,
    target: &TreeTarget,
    path: &str,
    dest: &Path,
) -> Result<(), GitError> {
    let rel = repo_relative(path)?;
    // The dialog only ever answers with an absolute path; a relative one would
    // land wherever the process happens to be, which the `.git` check below
    // cannot see.
    if !dest.is_absolute() {
        return Err(GitError::Refused(format!(
            "{} is not an absolute path",
            dest.display()
        )));
    }
    // Any component, not only this repository's: a dest under a submodule's or
    // another checkout's `.git` is as wrong. `git_dir` covers the rest — a
    // linked worktree's admin directory is not called `.git`.
    let in_dot_git = has_git_component(dest) || dest.starts_with(repo.path());
    if in_dot_git {
        return Err(GitError::Refused(format!(
            "{} is inside a .git directory",
            dest.display()
        )));
    }
    match target {
        TreeTarget::Commit { oid } => {
            let entry = tree_of(repo, oid)?.get_path(rel).map_err(map_git2)?;
            let blob = repo.find_blob(entry.id()).map_err(map_git2)?;
            std::fs::write(dest, blob.content())?;
        }
        TreeTarget::WorkingTree => {
            std::fs::copy(workdir(repo)?.join(rel), dest)?;
        }
    }
    Ok(())
}

/// `path`'s blob at commit `oid`, written to a temp file named after the file
/// itself — what Open hands the OS for a commit's file (the working tree's own
/// file is opened in place). One directory per blob, so two revisions of one
/// file cannot overwrite each other; the same per-user temp root the diff tool
/// writes its sides to.
pub fn temp_copy(repo: &Repository, oid: &str, path: &str) -> Result<PathBuf, GitError> {
    let rel = repo_relative(path)?;
    let entry = tree_of(repo, oid)?.get_path(rel).map_err(map_git2)?;
    let blob = repo.find_blob(entry.id()).map_err(map_git2)?;
    let dir = crate::tools::temp_subdir(crate::tools::diff_temp_dir(), &entry.id().to_string())?;
    let file = dir.join(rel.file_name().unwrap_or(rel.as_os_str()));
    std::fs::write(&file, blob.content())?;
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::TempRepo;

    fn entry(id: Oid, mode: u32, stage: u16, path: &[u8]) -> git2::IndexEntry {
        git2::IndexEntry {
            ctime: git2::IndexTime::new(0, 0),
            mtime: git2::IndexTime::new(0, 0),
            dev: 0,
            ino: 0,
            mode,
            uid: 0,
            gid: 0,
            file_size: 0,
            id,
            flags: stage << 12,
            flags_extended: 0,
            path: path.to_vec(),
        }
    }

    /// Nested directories, a gitlink and — off Windows — a symlink, in one
    /// commit. Creating a symlink on Windows needs developer mode or an
    /// elevated process, so that half of the fixture is skipped there (the
    /// returned flag says whether it exists).
    fn fixture() -> (TempRepo, Oid, bool) {
        let t = TempRepo::new();
        t.commit(
            &[
                ("readme.md", "hello\n"),
                ("src/lib.rs", "fn main() {}\n"),
                ("src/deep/mod.rs", "mod a;\n"),
            ],
            "init",
        );
        // A commit of its own stands in for the submodule's tip.
        let sub = t.commit(&[("sub-marker", "x")], "sub tip");

        let mut index = t.repo.index().expect("index");
        #[allow(unused_mut)]
        let mut linked = false;
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink("src/lib.rs", t.path().join("link")).expect("symlink");
            index.add_path(Path::new("link")).expect("add link");
            linked = true;
        }
        index
            .add(&entry(sub, 0o160_000, 0, b"vendor/dep"))
            .expect("add gitlink");
        index.write().expect("index write");
        std::fs::create_dir_all(t.path().join("vendor/dep")).expect("submodule dir");
        let oid = t.commit_index("link and submodule");
        (t, oid, linked)
    }

    #[test]
    fn lists_a_commit_with_nested_dirs_a_symlink_and_a_submodule() {
        let (t, oid, linked) = fixture();
        let listing = list(
            &t.repo,
            &TreeTarget::Commit {
                oid: oid.to_string(),
            },
        )
        .expect("list");
        let paths: Vec<&str> = listing.entries.iter().map(|e| e.path.as_str()).collect();
        let mut want = vec![
            "readme.md",
            "src/deep/mod.rs",
            "src/lib.rs",
            "sub-marker",
            "vendor/dep",
        ];
        if linked {
            want.push("link");
        }
        want.sort_unstable();
        assert_eq!(paths, want, "sorted by path, no directory rows");
        assert!(listing.oid.is_some(), "the tree oid is the cache key");

        let by = |p: &str| {
            listing
                .entries
                .iter()
                .find(|e| e.path == p)
                .expect(p)
                .clone()
        };
        assert_eq!(by("readme.md").size, 6);
        assert_eq!(by("readme.md").kind, EntryKind::Blob);
        assert_eq!(by("readme.md").mode, "100644");
        assert_eq!(by("vendor/dep").kind, EntryKind::Submodule);
        assert_eq!(by("vendor/dep").mode, "160000");
        if linked {
            assert_eq!(by("link").kind, EntryKind::Symlink);
            assert_eq!(by("link").mode, "120000");
        }
    }

    #[test]
    fn working_tree_lists_the_index_minus_what_is_gone_from_disk() {
        let t = TempRepo::new();
        t.commit(&[("a.txt", "a\n"), ("gone.txt", "g\n")], "init");
        // A staged add is in the index, so it is listed …
        t.write("added.txt", "new\n");
        t.stage(&["added.txt"]);
        // … and a file deleted on disk but still in the index is not.
        std::fs::remove_file(t.path().join("gone.txt")).expect("remove");

        let listing = list(&t.repo, &TreeTarget::WorkingTree).expect("list");
        let paths: Vec<&str> = listing.entries.iter().map(|e| e.path.as_str()).collect();
        assert_eq!(paths, vec!["a.txt", "added.txt"]);
        assert_eq!(listing.oid, None, "the index has no tree object");
    }

    #[test]
    fn working_tree_lists_a_conflicted_path_once() {
        let t = TempRepo::new();
        let base = t.commit(&[("c.txt", "base\n")], "base");
        let blob = t
            .repo
            .find_commit(base)
            .expect("commit")
            .tree()
            .expect("tree")
            .get_path(Path::new("c.txt"))
            .expect("entry")
            .id();
        let mut index = t.repo.index().expect("index");
        index.remove_path(Path::new("c.txt")).expect("remove");
        for stage in 1..=3u16 {
            index
                .add(&entry(blob, 0o100_644, stage, b"c.txt"))
                .expect("add stage");
        }
        index.write().expect("index write");

        let listing = list(&t.repo, &TreeTarget::WorkingTree).expect("list");
        let paths: Vec<&str> = listing.entries.iter().map(|e| e.path.as_str()).collect();
        assert_eq!(paths, vec!["c.txt"], "three stages, one row");
    }

    #[test]
    fn reads_text_binary_and_truncated_content() {
        let t = TempRepo::new();
        let long: String = (0..25_000).map(|i| format!("line {i}\n")).collect();
        t.commit(&[("hi.txt", "one\ntwo\n"), ("long.txt", &long)], "init");
        t.write("bin.dat", [0x00, 0x01, 0x02]);
        t.stage(&["bin.dat"]);
        let oid = t.commit_index("binary");

        let target = TreeTarget::Commit {
            oid: oid.to_string(),
        };
        let text = read(&t.repo, &target, "hi.txt").expect("read text");
        assert_eq!(text.text.as_deref(), Some("one\ntwo\n"));
        assert!(!text.binary && !text.truncated);
        assert_eq!(text.size, 8);

        let bin = read(&t.repo, &target, "bin.dat").expect("read binary");
        assert!(bin.binary && bin.text.is_none());
        assert_eq!(bin.size, 3);

        let long = read(&t.repo, &target, "long.txt").expect("read long");
        assert!(long.truncated, "past the cap");
        assert_eq!(long.max_lines, DiffOptions::default().max_lines);
        assert_eq!(
            long.text.as_deref().unwrap_or_default().lines().count(),
            long.max_lines
        );
        assert!(long.size > long.text.unwrap_or_default().len() as u64);

        // The working tree reads the same path from disk.
        t.write("hi.txt", "edited\n");
        let disk = read(&t.repo, &TreeTarget::WorkingTree, "hi.txt").expect("read disk");
        assert_eq!(disk.text.as_deref(), Some("edited\n"));

        // A path that leaves the repository is refused before any read.
        assert!(matches!(
            read(&t.repo, &TreeTarget::WorkingTree, "../outside"),
            Err(GitError::Refused(_))
        ));
    }

    #[test]
    fn a_file_past_the_byte_cap_is_cut_at_a_line_boundary() {
        let t = TempRepo::new();
        t.commit(&[("a.txt", "a\n")], "init");
        // 17 MiB in 2 KiB lines: well past the byte cap, well short of the
        // line one, so it is the bytes that do the cutting.
        let big = format!("{}\n", "x".repeat(2047)).repeat(8704);
        assert!(big.len() as u64 > MAX_BYTES && big.lines().count() < max_lines());
        t.write("big.txt", &big);

        let out = read(&t.repo, &TreeTarget::WorkingTree, "big.txt").expect("read big");
        assert!(out.truncated, "past the byte cap");
        assert_eq!(out.size, big.len() as u64, "the size is the whole file's");
        let text = out.text.expect("text");
        assert!(
            big.starts_with(&text) && text.ends_with('\n'),
            "whole lines"
        );
        assert!(
            (text.len() as u64) <= MAX_BYTES,
            "{} bytes kept",
            text.len()
        );

        // A file under the cap still comes back whole.
        let small = read(&t.repo, &TreeTarget::WorkingTree, "a.txt").expect("read small");
        assert_eq!(small.text.as_deref(), Some("a\n"));
        assert!(!small.truncated);

        // One line past the cap with no newline in it: only its head is kept.
        t.write("one.txt", "y".repeat(MAX_BYTES as usize + 1));
        let one = read(&t.repo, &TreeTarget::WorkingTree, "one.txt").expect("read one");
        assert!(one.truncated);
        assert_eq!(one.text.expect("text").len(), ONE_LINE_BYTES);
    }

    #[test]
    fn a_committed_blob_past_the_byte_cap_is_cut_at_a_line_boundary() {
        let t = TempRepo::new();
        // The same 17 MiB fixture as the working-tree case, but committed: the
        // blob branch caps its own copy of the content, so the cut has to be
        // proven on that side too.
        let big = format!("{}\n", "x".repeat(2047)).repeat(8704);
        assert!(big.len() as u64 > MAX_BYTES && big.lines().count() < max_lines());
        let oid = t.commit(&[("a.txt", "a\n"), ("big.txt", &big)], "big");

        let target = TreeTarget::Commit {
            oid: oid.to_string(),
        };
        let out = read(&t.repo, &target, "big.txt").expect("read big");
        assert!(out.truncated, "past the byte cap");
        assert_eq!(out.size, big.len() as u64, "the size is the whole blob's");
        let text = out.text.expect("text");
        assert!(
            big.starts_with(&text) && text.ends_with('\n'),
            "whole lines"
        );
        assert!(
            (text.len() as u64) <= MAX_BYTES,
            "{} bytes kept",
            text.len()
        );

        // A small file in the same commit still comes back whole.
        let small = read(&t.repo, &target, "a.txt").expect("read small");
        assert_eq!(small.text.as_deref(), Some("a\n"));
        assert!(!small.truncated);
    }

    #[test]
    fn a_cap_landing_mid_line_backs_up_to_the_last_newline() {
        let t = TempRepo::new();
        // 2047-byte lines do not divide 16 MiB, so the cap lands inside a line
        // and `rposition` has to back up — unlike the 2 KiB fixture above,
        // where the boundary is already a line end and nothing is trimmed.
        let line = format!("{}\n", "x".repeat(2046));
        let big = line.repeat(8200);
        assert!(big.len() as u64 > MAX_BYTES && big.lines().count() < max_lines());
        t.write("wrap.txt", &big);

        let out = read(&t.repo, &TreeTarget::WorkingTree, "wrap.txt").expect("read wrap");
        assert!(out.truncated, "past the byte cap");
        let text = out.text.expect("text");
        assert!(big.starts_with(&text), "a prefix of the file");
        assert!(text.ends_with('\n'), "cut at a line boundary");
        assert!(
            (text.len() as u64) < MAX_BYTES,
            "the cap itself is mid-line, so the kept text is shorter: {}",
            text.len()
        );
        let backed_up = MAX_BYTES - text.len() as u64;
        assert!(
            backed_up > 0 && backed_up < line.len() as u64,
            "{backed_up} bytes dropped — less than the {}-byte line they sat in",
            line.len()
        );
        assert_eq!(text.len() % line.len(), 0, "whole lines only");
    }

    #[test]
    fn a_file_of_exactly_the_cap_is_not_truncated() {
        let cap = max_lines();
        let exact: String = std::iter::repeat_n("x\n", cap).collect();
        let at = |text: String| text_content("a.txt", text, EntryKind::Blob, 0).truncated;
        assert!(!at(exact.clone()), "the cap's own last line is not a cut");
        assert!(at(format!("{exact}x\n")), "one line past the cap");
        assert!(
            at(format!("{exact}\n")),
            "an empty line past the cap is still a line"
        );
    }

    #[test]
    fn reads_a_symlink_as_its_target_and_a_submodule_as_one_line() {
        let (t, oid, linked) = fixture();
        let target = TreeTarget::Commit {
            oid: oid.to_string(),
        };
        let sub = read(&t.repo, &target, "vendor/dep").expect("read submodule");
        assert_eq!(sub.kind, EntryKind::Submodule);
        let text = sub.text.unwrap_or_default();
        assert!(text.starts_with("submodule at "), "{text}");
        if linked {
            let link = read(&t.repo, &target, "link").expect("read symlink");
            assert_eq!(link.kind, EntryKind::Symlink);
            assert_eq!(link.text.as_deref(), Some("src/lib.rs"));
        }
    }

    #[test]
    fn save_as_writes_the_whole_blob_and_refuses_dot_git() {
        let t = TempRepo::new();
        let long: String = (0..25_000).map(|i| format!("line {i}\n")).collect();
        let oid = t.commit(&[("long.txt", &long)], "init");
        let target = TreeTarget::Commit {
            oid: oid.to_string(),
        };
        let out = tempfile::tempdir().expect("tempdir");

        let dest = out.path().join("copy.txt");
        save_as(&t.repo, &target, "long.txt", &dest).expect("save");
        assert_eq!(
            std::fs::read_to_string(&dest).expect("read back"),
            long,
            "the whole blob, not the truncated text"
        );

        for bad in [
            t.path().join(".git").join("hooks").join("pre-commit"),
            t.path().join(".GIT").join("config"),
            out.path().join("sub").join(".git").join("index"),
            PathBuf::from("relative.txt"),
        ] {
            assert!(
                matches!(
                    save_as(&t.repo, &target, "long.txt", &bad),
                    Err(GitError::Refused(_))
                ),
                "{} was not refused",
                bad.display()
            );
        }

        // The working tree copies the file on disk.
        t.write("long.txt", "short\n");
        let dest = out.path().join("wt.txt");
        save_as(&t.repo, &TreeTarget::WorkingTree, "long.txt", &dest).expect("save from disk");
        assert_eq!(
            std::fs::read_to_string(&dest).expect("read back"),
            "short\n"
        );
    }

    #[test]
    fn temp_copy_writes_the_blob_under_the_files_own_name() {
        let t = TempRepo::new();
        let oid = t.commit(&[("src/lib.rs", "fn main() {}\n")], "init");
        let file = temp_copy(&t.repo, &oid.to_string(), "src/lib.rs").expect("temp copy");
        assert_eq!(file.file_name().and_then(|n| n.to_str()), Some("lib.rs"));
        assert_eq!(
            std::fs::read_to_string(&file).expect("read back"),
            "fn main() {}\n"
        );
        std::fs::remove_file(&file).expect("clean up");
    }
}
