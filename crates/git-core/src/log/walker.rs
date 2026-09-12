use std::sync::atomic::{AtomicBool, Ordering};

use git2::{ErrorCode, Oid, Repository, Revwalk, Sort};

use super::graph::LaneLayout;
use super::types::{CommitInfo, GraphRow, LogFilter, RevSpec};
use crate::{map_git2, GitError};

pub const CHUNK_SIZE: usize = 1000;

/// `Revwalk::push_head` reports an unborn HEAD as a generic "reference not
/// found" error, so check via `Repository::head` instead.
fn head_is_unborn(repo: &Repository) -> bool {
    matches!(repo.head(), Err(e) if e.code() == ErrorCode::UnbornBranch)
}

/// Pushes every ref matching `glob` that peels to a commit. Refs whose object
/// is missing (stale packed-refs) or that point at a tree/blob are skipped
/// instead of failing the whole walk like `Revwalk::push_glob` would.
fn push_glob(repo: &Repository, walker: &mut Revwalk<'_>, glob: &str) -> Result<(), GitError> {
    for r in repo.references_glob(glob).map_err(map_git2)? {
        let r = r.map_err(map_git2)?;
        match r.peel_to_commit() {
            Ok(c) => walker.push(c.id()).map_err(map_git2)?,
            Err(e) => tracing::debug!(name = ?r.name(), error = %e, "skipping ref"),
        }
    }
    Ok(())
}

/// Walks `spec` (TOPOLOGICAL | TIME) and hands rows to `on_chunk` in chunks of
/// [`CHUNK_SIZE`]. The callback returns `false` to stop early. Returns the
/// number of rows emitted. `cancel` is polled per commit; once set the walk
/// returns [`GitError::Cancelled`].
///
/// `All` pushes HEAD + `refs/heads/*` + `refs/remotes/*` + `refs/tags/*`
/// (so `refs/stash` and `refs/notes` are excluded), skipping refs that don't
/// peel to a commit; `Head` pushes HEAD only; `Refs` pushes each full ref name
/// (a missing ref is an error, a ref that doesn't peel to a commit is skipped).
/// An unborn HEAD yields zero rows for `Head` and is ignored for `All`.
///
/// Under a path filter there is no revwalk at all: `history` is the ordered
/// `(commit, path there)` list [`super::history::path_history`] got from
/// `git log --follow`, and the rows are built from it. `spec` has already been
/// applied by that command, so it is not read here.
pub fn walk(
    repo: &Repository,
    spec: &RevSpec,
    filter: &LogFilter,
    history: Option<&[(Oid, String)]>,
    cancel: &AtomicBool,
    on_chunk: impl FnMut(Vec<GraphRow>) -> bool,
) -> Result<usize, GitError> {
    if let Some(history) = history {
        let items = history.iter().map(|(oid, path)| Ok((*oid, Some(path))));
        return rows(repo, filter, None, items, cancel, on_chunk);
    }
    let mut walker = repo.revwalk().map_err(map_git2)?;
    walker
        .set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(map_git2)?;

    match spec {
        RevSpec::All => {
            if !head_is_unborn(repo) {
                walker.push_head().map_err(map_git2)?;
            }
            for glob in ["refs/heads/*", "refs/remotes/*", "refs/tags/*"] {
                push_glob(repo, &mut walker, glob)?;
            }
        }
        RevSpec::Head => {
            if head_is_unborn(repo) {
                return Ok(0);
            }
            walker.push_head().map_err(map_git2)?;
        }
        RevSpec::Refs(refs) => {
            for name in refs {
                let r = repo.find_reference(name).map_err(map_git2)?;
                match r.peel_to_commit() {
                    Ok(c) => walker.push(c.id()).map_err(map_git2)?,
                    Err(e) => tracing::debug!(name, error = %e, "skipping non-commit ref"),
                }
            }
        }
    }

    // A filtered walk has no contiguous topology, so it is laid out flat.
    let layout = if filter.is_active() {
        None
    } else {
        let mut layout = LaneLayout::new();
        // ponytail: a `Refs` spec that never reaches HEAD leaves this column open to
        // the bottom; the UI only sends `all` / `head`.
        if filter.working_tree {
            if let Ok(head) = repo.head().and_then(|r| r.peel_to_commit()) {
                layout.open(head.id());
            }
        }
        Some(layout)
    };
    let items = walker.map(|oid| oid.map(|oid| (oid, None)).map_err(map_git2));
    rows(repo, filter, layout, items, cancel, on_chunk)
}

/// Turns an ordered commit source into rows: the text filter, the graph layout
/// (`None` lays every row flat) and the chunking, shared by the revwalk and the
/// path-history list. A path item carries the name the file had at that commit.
fn rows<'a>(
    repo: &Repository,
    filter: &LogFilter,
    mut layout: Option<LaneLayout>,
    items: impl Iterator<Item = Result<(Oid, Option<&'a String>), GitError>>,
    cancel: &AtomicBool,
    mut on_chunk: impl FnMut(Vec<GraphRow>) -> bool,
) -> Result<usize, GitError> {
    let text = filter
        .text
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(str::to_lowercase);
    // A hex query of 4+ characters also matches a commit id prefix.
    let text_is_hex = text
        .as_deref()
        .is_some_and(|t| t.len() >= 4 && t.bytes().all(|b| b.is_ascii_hexdigit()));

    let mut chunk: Vec<GraphRow> = Vec::with_capacity(CHUNK_SIZE);
    let mut total = 0usize;
    let mut parents: Vec<Oid> = Vec::with_capacity(4);

    for item in items {
        if cancel.load(Ordering::Relaxed) {
            return Err(GitError::Cancelled);
        }
        let (oid, path) = item?;
        let commit = repo.find_commit(oid).map_err(map_git2)?;
        let info = CommitInfo::from_commit(&commit);

        if let Some(t) = &text {
            let hit = info.summary.to_lowercase().contains(t)
                || info.author_name.to_lowercase().contains(t)
                || info.author_email.to_lowercase().contains(t)
                || (text_is_hex && info.oid.starts_with(t));
            if !hit {
                continue;
            }
        }

        let row = if let Some(layout) = layout.as_mut() {
            parents.clear();
            parents.extend(commit.parent_ids());
            let p = layout.push(oid, &parents);
            GraphRow {
                commit: info,
                lane: p.lane,
                color: p.color,
                lines: p.lines,
                max_lane: p.max_lane,
                path: path.cloned(),
            }
        } else {
            GraphRow {
                commit: info,
                lane: 0,
                color: 0,
                lines: Vec::new(),
                max_lane: 0,
                path: path.cloned(),
            }
        };

        chunk.push(row);
        total += 1;
        if chunk.len() >= CHUNK_SIZE {
            let full = std::mem::replace(&mut chunk, Vec::with_capacity(CHUNK_SIZE));
            if !on_chunk(full) {
                return Ok(total);
            }
        }
    }

    if !chunk.is_empty() {
        on_chunk(chunk);
    }
    Ok(total)
}
