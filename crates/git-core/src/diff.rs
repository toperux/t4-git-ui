//! Display diffs via libgit2: changed-file lists and per-file hunks for a
//! commit, a commit range, or the index / working directory.
//!
//! Stage-able diffs (CLI `git diff` output that round-trips through
//! `git apply --cached` after autocrlf/clean filters) come in M3; everything
//! here is for display only.

use std::cell::{Cell, RefCell};

use git2::{Delta, DiffFindOptions, DiffLineType, Oid, Patch, Repository, Tree};
use serde::{Deserialize, Serialize};

use crate::{map_git2, GitError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    Typechange,
    Untracked,
    Conflicted,
    Ignored,
}

impl From<Delta> for FileStatus {
    fn from(d: Delta) -> Self {
        match d {
            Delta::Added => FileStatus::Added,
            Delta::Deleted => FileStatus::Deleted,
            Delta::Renamed => FileStatus::Renamed,
            Delta::Copied => FileStatus::Copied,
            Delta::Typechange => FileStatus::Typechange,
            Delta::Untracked => FileStatus::Untracked,
            Delta::Conflicted => FileStatus::Conflicted,
            Delta::Ignored => FileStatus::Ignored,
            Delta::Modified | Delta::Unmodified | Delta::Unreadable => FileStatus::Modified,
        }
    }
}

/// One entry of a changed-file list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    /// New path (`/`-separated, repo-relative).
    pub path: String,
    /// Old path for renames / copies.
    pub old_path: Option<String>,
    pub status: FileStatus,
    pub additions: u32,
    pub deletions: u32,
    pub binary: bool,
}

/// What to diff.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DiffTarget {
    /// Commit vs its first parent (root commit vs the empty tree).
    Commit { oid: String },
    /// Tree of `from` → tree of `to`.
    CommitRange { from: String, to: String },
    /// HEAD tree → index (unborn HEAD: empty tree → index).
    Staged,
    /// Index → working directory, including untracked file content.
    Unstaged,
    /// HEAD tree → working directory (staged + unstaged), including untracked.
    Workdir,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiffLineKind {
    Context,
    Add,
    Del,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: DiffLineKind,
    pub old_no: Option<u32>,
    pub new_no: Option<u32>,
    /// Line content without the trailing `\n`; a `\r` before it is kept so
    /// CRLF content stays visible (the M3 patch builder needs it).
    pub text: String,
    /// `true` when this line is the last of its file and has no trailing
    /// newline (`\ No newline at end of file`).
    pub no_newline: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    /// `@@ -a,b +c,d @@ context` without the trailing newline.
    pub header: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub old_path: Option<String>,
    pub status: FileStatus,
    pub binary: bool,
    pub hunks: Vec<Hunk>,
    /// `true` when line collection stopped at [`DiffOptions::max_lines`].
    pub truncated: bool,
    /// The cap `truncated` refers to (`DiffOptions::max_lines`), so the banner
    /// quotes the number the backend actually used.
    pub max_lines: usize,
    /// Full counts (not affected by truncation).
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DiffOptions {
    /// Context lines per hunk.
    pub context: u32,
    /// Stop collecting lines past this many (sets `truncated`).
    pub max_lines: usize,
    pub ignore_whitespace: bool,
}

impl Default for DiffOptions {
    fn default() -> Self {
        DiffOptions {
            context: 3,
            max_lines: 20_000,
            ignore_whitespace: false,
        }
    }
}

fn tree_of<'r>(repo: &'r Repository, oid: &str) -> Result<Tree<'r>, GitError> {
    let oid = Oid::from_str(oid).map_err(map_git2)?;
    repo.find_commit(oid)
        .and_then(|c| c.tree())
        .map_err(map_git2)
}

/// Tree of the first parent, `None` for a root commit.
fn parent_tree<'r>(repo: &'r Repository, oid: &str) -> Result<Option<Tree<'r>>, GitError> {
    let oid = Oid::from_str(oid).map_err(map_git2)?;
    let commit = repo.find_commit(oid).map_err(map_git2)?;
    match commit.parent(0) {
        Ok(p) => Ok(Some(p.tree().map_err(map_git2)?)),
        Err(_) => Ok(None),
    }
}

/// HEAD tree, `None` when HEAD is unborn.
fn head_tree(repo: &Repository) -> Result<Option<Tree<'_>>, GitError> {
    match repo.head() {
        Ok(h) => Ok(Some(h.peel_to_tree().map_err(map_git2)?)),
        Err(e) if e.code() == git2::ErrorCode::UnbornBranch => Ok(None),
        Err(e) => Err(map_git2(e)),
    }
}

/// Builds the libgit2 diff for `target` with renames detected; `paths`
/// (repo-relative, exact) restricts it, empty means everything.
fn build_diff<'r>(
    repo: &'r Repository,
    target: &DiffTarget,
    opts: &DiffOptions,
    paths: &[&str],
) -> Result<git2::Diff<'r>, GitError> {
    let mut o = git2::DiffOptions::new();
    o.context_lines(opts.context)
        .ignore_whitespace(opts.ignore_whitespace)
        .disable_pathspec_match(true);
    for p in paths {
        o.pathspec(p);
    }
    let mut diff = match target {
        DiffTarget::Commit { oid } => {
            let old = parent_tree(repo, oid)?;
            let new = tree_of(repo, oid)?;
            repo.diff_tree_to_tree(old.as_ref(), Some(&new), Some(&mut o))
        }
        DiffTarget::CommitRange { from, to } => {
            let old = tree_of(repo, from)?;
            let new = tree_of(repo, to)?;
            repo.diff_tree_to_tree(Some(&old), Some(&new), Some(&mut o))
        }
        DiffTarget::Staged => {
            let old = head_tree(repo)?;
            repo.diff_tree_to_index(old.as_ref(), None, Some(&mut o))
        }
        DiffTarget::Unstaged => {
            o.include_untracked(true)
                .recurse_untracked_dirs(true)
                .show_untracked_content(true);
            repo.diff_index_to_workdir(None, Some(&mut o))
        }
        DiffTarget::Workdir => {
            o.include_untracked(true)
                .recurse_untracked_dirs(true)
                .show_untracked_content(true);
            let old = head_tree(repo)?;
            repo.diff_tree_to_workdir_with_index(old.as_ref(), Some(&mut o))
        }
    }
    .map_err(map_git2)?;
    let mut find = DiffFindOptions::new();
    find.renames(true).copies(false);
    diff.find_similar(Some(&mut find)).map_err(map_git2)?;
    Ok(diff)
}

fn path_string(f: &git2::DiffFile<'_>) -> String {
    String::from_utf8_lossy(f.path_bytes().unwrap_or_default()).into_owned()
}

/// `(path, old_path)` of a delta; `old_path` only for renames / copies.
fn delta_paths(delta: &git2::DiffDelta<'_>) -> (String, Option<String>) {
    let new = path_string(&delta.new_file());
    let old = path_string(&delta.old_file());
    let old_path = match delta.status() {
        Delta::Renamed | Delta::Copied if old != new => Some(old),
        _ => None,
    };
    (new, old_path)
}

fn count(n: usize) -> u32 {
    u32::try_from(n).unwrap_or(u32::MAX)
}

/// Loads the patch for delta `idx`; `None` means binary (or unmodified).
fn patch_for<'d>(diff: &git2::Diff<'d>, idx: usize) -> Result<Option<Patch<'d>>, GitError> {
    let patch = Patch::from_diff(diff, idx).map_err(map_git2)?;
    Ok(patch.filter(|p| !p.delta().flags().is_binary()))
}

/// Changed files of `target` with per-file line counts (renames detected).
/// One pass over the diff with a line callback: the counts come out without
/// a `Patch` (every line, as a struct) being built per file.
pub fn changed_files(repo: &Repository, target: &DiffTarget) -> Result<Vec<FileChange>, GitError> {
    let diff = build_diff(repo, target, &DiffOptions::default(), &[])?;
    // Shared by the three callbacks (libgit2 calls them one at a time).
    let out: RefCell<Vec<FileChange>> = RefCell::new(Vec::with_capacity(diff.deltas().len()));
    // Index into `out` of the delta the callbacks are currently on; `None`
    // while on a delta that was skipped.
    let current: Cell<Option<usize>> = Cell::new(None);
    diff.foreach(
        &mut |delta, _| {
            current.set(None);
            if delta.status() != Delta::Unmodified {
                let (path, old_path) = delta_paths(&delta);
                let mut out = out.borrow_mut();
                out.push(FileChange {
                    path,
                    old_path,
                    status: delta.status().into(),
                    additions: 0,
                    deletions: 0,
                    binary: false,
                });
                current.set(Some(out.len() - 1));
            }
            true
        },
        Some(&mut |_, _| {
            if let Some(i) = current.get() {
                out.borrow_mut()[i].binary = true;
            }
            true
        }),
        None,
        Some(&mut |_, _, line| {
            if let Some(i) = current.get() {
                let mut out = out.borrow_mut();
                match line.origin_value() {
                    DiffLineType::Addition => out[i].additions = out[i].additions.saturating_add(1),
                    DiffLineType::Deletion => out[i].deletions = out[i].deletions.saturating_add(1),
                    _ => {}
                }
            }
            true
        }),
    )
    .map_err(map_git2)?;
    Ok(out.into_inner())
}

fn locate<'d>(diff: &git2::Diff<'d>, path: &str) -> Option<usize> {
    diff.deltas().position(|d| {
        d.new_file().path_bytes() == Some(path.as_bytes())
            || d.old_file().path_bytes() == Some(path.as_bytes())
    })
}

/// Hunks of one file of `target`, addressed by its new path (a renamed file
/// is also found by its old path).
pub fn file_diff(
    repo: &Repository,
    target: &DiffTarget,
    path: &str,
    opts: &DiffOptions,
) -> Result<FileDiff, GitError> {
    if matches!(target, DiffTarget::Unstaged | DiffTarget::Workdir) {
        if let Some(d) = conflicted_file_diff(repo, path, opts)? {
            return Ok(d);
        }
    }
    // The diff of this one path first (cheap: no other content is loaded).
    // Its other half of a rename is outside that pathspec, so an `Added` or
    // `Deleted` result may really be a rename: only then is the whole diff
    // built, where rename detection can pair it up.
    let mut diff = build_diff(repo, target, opts, &[path])?;
    let mut idx = locate(&diff, path);
    let maybe_rename = idx.is_some_and(|i| {
        matches!(
            diff.get_delta(i).map(|d| d.status()),
            Some(Delta::Added | Delta::Deleted)
        )
    });
    if idx.is_none() || maybe_rename {
        diff = build_diff(repo, target, opts, &[])?;
        idx = locate(&diff, path);
    }
    let idx = idx.ok_or_else(|| {
        GitError::Git2(git2::Error::new(
            git2::ErrorCode::NotFound,
            git2::ErrorClass::None,
            format!("path not in diff: {path}"),
        ))
    })?;
    let patch = patch_for(&diff, idx)?;
    let delta = diff.get_delta(idx).expect("delta index in range");
    let (path, old_path) = delta_paths(&delta);
    file_diff_from_patch(patch, path, old_path, delta.status().into(), opts)
}

/// Hunks — or the binary marker — of one patch that has already been located.
fn file_diff_from_patch(
    patch: Option<Patch<'_>>,
    path: String,
    old_path: Option<String>,
    status: FileStatus,
    opts: &DiffOptions,
) -> Result<FileDiff, GitError> {
    let Some(patch) = patch else {
        return Ok(FileDiff {
            path,
            old_path,
            status,
            binary: true,
            hunks: Vec::new(),
            truncated: false,
            max_lines: opts.max_lines,
            additions: 0,
            deletions: 0,
        });
    };

    let (_, additions, deletions) = patch.line_stats().map_err(map_git2)?;
    let mut hunks = Vec::with_capacity(patch.num_hunks());
    let mut collected = 0usize;
    let mut truncated = false;
    'hunks: for h in 0..patch.num_hunks() {
        let (hunk, n_lines) = patch.hunk(h).map_err(map_git2)?;
        let mut lines = Vec::with_capacity(n_lines);
        for l in 0..n_lines {
            if collected >= opts.max_lines {
                truncated = true;
                if !lines.is_empty() {
                    hunks.push(make_hunk(&hunk, lines));
                }
                break 'hunks;
            }
            let line = patch.line_in_hunk(h, l).map_err(map_git2)?;
            let kind = match line.origin_value() {
                DiffLineType::Context => DiffLineKind::Context,
                DiffLineType::Addition => DiffLineKind::Add,
                DiffLineType::Deletion => DiffLineKind::Del,
                DiffLineType::ContextEOFNL | DiffLineType::AddEOFNL | DiffLineType::DeleteEOFNL => {
                    // Marker for the preceding line.
                    if let Some(prev) = lines.last_mut() {
                        let prev: &mut DiffLine = prev;
                        prev.no_newline = true;
                    }
                    continue;
                }
                DiffLineType::FileHeader | DiffLineType::HunkHeader | DiffLineType::Binary => {
                    continue;
                }
            };
            let mut text = String::from_utf8_lossy(line.content()).into_owned();
            if text.ends_with('\n') {
                text.pop();
            }
            lines.push(DiffLine {
                kind,
                old_no: line.old_lineno(),
                new_no: line.new_lineno(),
                text,
                no_newline: false,
            });
            collected += 1;
        }
        hunks.push(make_hunk(&hunk, lines));
    }

    Ok(FileDiff {
        path,
        old_path,
        status,
        binary: false,
        hunks,
        truncated,
        max_lines: opts.max_lines,
        additions: count(additions),
        deletions: count(deletions),
    })
}

/// Hunks of a conflicted file: the version it is being merged into ("ours",
/// falling back to the merge base) against the file on disk, which is what git
/// left there — conflict markers and all. libgit2's own diffs report an
/// unmerged path as `Conflicted` and emit no content for it, so the panel had
/// a file it could stage and nothing to look at.
fn conflicted_file_diff(
    repo: &Repository,
    path: &str,
    opts: &DiffOptions,
) -> Result<Option<FileDiff>, GitError> {
    let Some(stages) = crate::conflict::stages(repo, path)? else {
        return Ok(None);
    };
    // Bytes rather than the blob itself: with the side missing entirely
    // (added on the other side alone) there is no blob to hand `Patch`.
    let old = match stages.ours.or(stages.ancestor) {
        Some(id) => repo.find_blob(id).map_err(map_git2)?.content().to_vec(),
        None => Vec::new(),
    };
    // Deleted on one side and kept on the other: there may be nothing on disk.
    let workdir = repo.workdir().map(|w| w.join(path));
    let new = workdir
        .as_deref()
        .and_then(|p| std::fs::read(p).ok())
        .unwrap_or_default();

    let mut o = git2::DiffOptions::new();
    o.context_lines(opts.context)
        .ignore_whitespace(opts.ignore_whitespace);
    let as_path = std::path::Path::new(path);
    let patch = Patch::from_buffers(&old, Some(as_path), &new, Some(as_path), Some(&mut o))
        .map_err(map_git2)?;
    let patch = Some(patch).filter(|p| !p.delta().flags().is_binary());
    Ok(Some(file_diff_from_patch(
        patch,
        path.to_string(),
        None,
        FileStatus::Conflicted,
        opts,
    )?))
}

fn make_hunk(hunk: &git2::DiffHunk<'_>, lines: Vec<DiffLine>) -> Hunk {
    let mut header = String::from_utf8_lossy(hunk.header()).into_owned();
    while header.ends_with('\n') || header.ends_with('\r') {
        header.pop();
    }
    Hunk {
        header,
        old_start: hunk.old_start(),
        old_lines: hunk.old_lines(),
        new_start: hunk.new_start(),
        new_lines: hunk.new_lines(),
        lines,
    }
}
