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
pub fn walk(
    repo: &Repository,
    spec: &RevSpec,
    filter: &LogFilter,
    cancel: &AtomicBool,
    mut on_chunk: impl FnMut(Vec<GraphRow>) -> bool,
) -> Result<usize, GitError> {
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

    let text = filter
        .text
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(str::to_lowercase);
    let use_graph = text.is_none();

    let mut layout = LaneLayout::new();
    let mut chunk: Vec<GraphRow> = Vec::with_capacity(CHUNK_SIZE);
    let mut total = 0usize;
    let mut parents: Vec<Oid> = Vec::with_capacity(4);

    for oid in walker {
        if cancel.load(Ordering::Relaxed) {
            return Err(GitError::Cancelled);
        }
        let oid = oid.map_err(map_git2)?;
        let commit = repo.find_commit(oid).map_err(map_git2)?;
        let info = CommitInfo::from_commit(&commit);

        if let Some(t) = &text {
            let hit = info.summary.to_lowercase().contains(t)
                || info.author_name.to_lowercase().contains(t)
                || info.author_email.to_lowercase().contains(t);
            if !hit {
                continue;
            }
        }

        let row = if use_graph {
            parents.clear();
            parents.extend(commit.parent_ids());
            let p = layout.push(oid, &parents);
            GraphRow {
                commit: info,
                lane: p.lane,
                color: p.color,
                lines: p.lines,
                max_lane: p.max_lane,
            }
        } else {
            GraphRow {
                commit: info,
                lane: 0,
                color: 0,
                lines: Vec::new(),
                max_lane: 0,
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
