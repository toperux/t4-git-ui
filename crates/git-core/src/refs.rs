use std::cmp::Ordering;
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};

use git2::{
    BranchType, ErrorCode, ObjectType, Oid, ReferenceType, Repository, RepositoryState, Signature,
};
use serde::{Deserialize, Serialize};

use crate::config::user_identity;
use crate::log::types::{RefKind, RefLabel};
use crate::{map_git2, GitError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadInfo {
    /// `None` when HEAD is unborn (empty repository).
    pub oid: Option<String>,
    /// Short branch name when HEAD is symbolic (also set for an unborn branch).
    pub branch: Option<String>,
    pub detached: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub oid: String,
    /// Short name of the configured tracking branch (`origin/main`, or `main`
    /// for a local-tracking upstream). Taken from config, so it is set even
    /// when the tracking ref itself no longer exists (see `gone`).
    pub upstream: Option<String>,
    /// `true` when `upstream` is configured but its ref doesn't resolve
    /// (e.g. after `git remote prune`). `ahead`/`behind` are 0 then.
    pub gone: bool,
    pub ahead: u32,
    pub behind: u32,
    pub is_head: bool,
    /// A branch whose tip reaches (or sits on) this one's — so this branch adds
    /// nothing and can go. The branch's own counterparts (its upstream, the
    /// branch tracking it, a same-named branch on a remote) don't count: a
    /// local branch that is merely pushed is not "merged". See
    /// [`fill_merged_into`] for which containing branch is named.
    pub merged_into: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBranch {
    /// Short name including the remote (`origin/main`).
    pub name: String,
    pub oid: String,
    /// As [`Branch::merged_into`].
    pub merged_into: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Remote {
    pub name: String,
    pub url: Option<String>,
    pub branches: Vec<RemoteBranch>,
    /// Short name of the branch the remote's HEAD points at (`origin/main`);
    /// `None` when the remote has no `HEAD` ref (never fetched with one, or a
    /// stale group).
    pub head: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub name: String,
    /// Peeled to the tagged commit.
    pub oid: String,
    /// The annotation, `None` on a lightweight tag — which is the only thing
    /// that tells the two apart once the tag is peeled.
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stash {
    pub index: usize,
    pub oid: String,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RepoState {
    Clean,
    Merge,
    Rebase,
    CherryPick,
    Revert,
    Bisect,
}

impl From<RepositoryState> for RepoState {
    fn from(s: RepositoryState) -> Self {
        match s {
            RepositoryState::Clean => RepoState::Clean,
            RepositoryState::Merge => RepoState::Merge,
            RepositoryState::Revert | RepositoryState::RevertSequence => RepoState::Revert,
            RepositoryState::CherryPick | RepositoryState::CherryPickSequence => {
                RepoState::CherryPick
            }
            RepositoryState::Bisect => RepoState::Bisect,
            RepositoryState::Rebase
            | RepositoryState::RebaseInteractive
            | RepositoryState::RebaseMerge
            | RepositoryState::ApplyMailbox
            | RepositoryState::ApplyMailboxOrRebase => RepoState::Rebase,
        }
    }
}

/// Human labels for the two sides of an in-progress operation, in **git's**
/// sense: `ours` is what `checkout --ours` keeps, `theirs` what `--theirs`
/// does. A rebase swaps what a person would call them — git's `--ours` is the
/// branch being rebased *onto* and `--theirs` the one being replayed — so the
/// names have to come from here; nothing in the UI can work them out.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictSides {
    pub ours: String,
    pub theirs: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefsSnapshot {
    pub head: HeadInfo,
    pub state: RepoState,
    /// Set while `state` is not `Clean` and the two sides can be told apart — `None` for a bisect,
    /// a `git am`, an octopus merge (several `MERGE_HEAD`s) or when both sides would carry one name.
    pub conflict_sides: Option<ConflictSides>,
    pub local: Vec<Branch>,
    pub remotes: Vec<Remote>,
    pub tags: Vec<Tag>,
    pub stashes: Vec<Stash>,
}

/// Orders ref names the way people read them: case-insensitive, and a run of
/// digits compares by value, so `v0.2.0` < `v0.10.0` and `Feature` sits with
/// `feature`. Ties fall back to byte order so the sort stays total.
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let (mut x, mut y) = (a.as_bytes(), b.as_bytes());
    while let (Some(&cx), Some(&cy)) = (x.first(), y.first()) {
        if cx.is_ascii_digit() && cy.is_ascii_digit() {
            let nx = x.iter().take_while(|c| c.is_ascii_digit()).count();
            let ny = y.iter().take_while(|c| c.is_ascii_digit()).count();
            let (dx, dy) = (&x[..nx], &y[..ny]);
            // Compare without leading zeros: longer run = bigger, then lexicographic.
            let tx = dx.iter().position(|&c| c != b'0').unwrap_or(nx);
            let ty = dy.iter().position(|&c| c != b'0').unwrap_or(ny);
            let ord = (nx - tx)
                .cmp(&(ny - ty))
                .then_with(|| dx[tx..].cmp(&dy[ty..]));
            if ord != Ordering::Equal {
                return ord;
            }
            x = &x[nx..];
            y = &y[ny..];
        } else {
            let ord = cx.to_ascii_lowercase().cmp(&cy.to_ascii_lowercase());
            if ord != Ordering::Equal {
                return ord;
            }
            x = &x[1..];
            y = &y[1..];
        }
    }
    x.len().cmp(&y.len()).then_with(|| a.cmp(b))
}

/// What a refs snapshot has to walk history for, memoized across refreshes.
///
/// `pairs`: `(local tip, upstream tip) → (ahead, behind)`. History behind two
/// fixed oids never changes, so an entry never goes stale; the map is just
/// cleared when it grows past a few thousand pairs.
///
/// `merged`: every branch's `merged_into`, keyed by the exact list of branches
/// (name, tip, is HEAD, upstream) it was computed for — one walk per change
/// of refs.
#[derive(Debug, Default)]
pub struct AheadBehindCache {
    pairs: HashMap<(Oid, Oid), (usize, usize)>,
    merged: Option<(MergedKey, Vec<Option<String>>)>,
}

/// The branches (name, tip, is HEAD, upstream) a `merged` entry was computed
/// for; `upstream` is in because it decides who counts as a counterpart.
type MergedKey = Vec<(String, Oid, bool, Option<String>)>;

impl AheadBehindCache {
    const MAX: usize = 4096;

    fn get_or_compute(&mut self, repo: &Repository, local: Oid, upstream: Oid) -> (usize, usize) {
        if let Some(&v) = self.pairs.get(&(local, upstream)) {
            return v;
        }
        let v = repo.graph_ahead_behind(local, upstream).unwrap_or((0, 0));
        if self.pairs.len() >= Self::MAX {
            self.pairs.clear();
        }
        self.pairs.insert((local, upstream), v);
        v
    }
}

/// One branch as `fill_merged_into` sees it: local branches first, then every
/// remote's, in snapshot order.
struct Tip {
    name: String,
    oid: Oid,
    /// Name without the remote (`main` for `origin/main`): same-named branches
    /// are counterparts.
    short: String,
    upstream: Option<String>,
    is_head: bool,
    /// Listed under a remote in the snapshot (a remote-tracking branch).
    remote: bool,
}

/// Which tips reach each tip: `out[i]` has bit `j` set when `tips[j]` has
/// `tips[i]` as an ancestor or sits on the same commit (`j != i`).
///
/// One walk from every tip, newest commit first, carrying down to each parent
/// the set of tips its children were reached from, and stopping once every
/// tip has been popped — so the cost is the history newer than the oldest tip,
/// not all of it. Date order stands in for topological order (libgit2's
/// topological sort walks everything up front), except that a run of commits
/// stamped in the same second comes out in no particular order — a rebase or a
/// script stamps whole chains that way — so each run is put children-first
/// before use. A commit stamped newer than its child is still reached late and
/// its reachers lost, which costs a badge, not history.
fn reachers(repo: &Repository, tips: &[Oid]) -> Result<Vec<Vec<u64>>, GitError> {
    let words = tips.len().div_ceil(64);
    let mut at: HashMap<Oid, Vec<usize>> = HashMap::new();
    for (i, &t) in tips.iter().enumerate() {
        at.entry(t).or_default().push(i);
    }
    let mut walk = repo.revwalk().map_err(map_git2)?;
    walk.set_sorting(git2::Sort::TIME).map_err(map_git2)?;
    for &t in at.keys() {
        walk.push(t).map_err(map_git2)?;
    }
    let mut walk = walk
        .map(|oid| oid.and_then(|oid| repo.find_commit(oid)).map_err(map_git2))
        .peekable();
    let mut out = vec![vec![0u64; words]; tips.len()];
    // Tips reaching a commit the walk has not popped yet.
    let mut pending: HashMap<Oid, Vec<u64>> = HashMap::new();
    let mut left = at.len();
    'runs: while let Some(first) = walk.next() {
        let first = first?;
        let stamp = first.time().seconds();
        let mut run = vec![first];
        while let Some(Ok(next)) = walk.peek() {
            if next.time().seconds() != stamp {
                break;
            }
            run.push(walk.next().expect("peeked")?);
        }
        for commit in children_first(run) {
            let oid = commit.id();
            let mut flags = pending.remove(&oid).unwrap_or_else(|| vec![0; words]);
            if let Some(here) = at.get(&oid) {
                for &i in here {
                    flags[i / 64] |= 1 << (i % 64);
                }
                for &i in here {
                    out[i].clone_from(&flags);
                    out[i][i / 64] &= !(1 << (i % 64));
                }
                left -= 1;
                if left == 0 {
                    break 'runs;
                }
            }
            if flags.iter().all(|w| *w == 0) {
                continue;
            }
            for parent in commit.parent_ids() {
                let into = pending.entry(parent).or_insert_with(|| vec![0; words]);
                for (d, s) in into.iter_mut().zip(&flags) {
                    *d |= s;
                }
            }
        }
    }
    Ok(out)
}

/// Commits with one timestamp, ordered so that no commit comes after one of
/// its own children: Kahn's algorithm over the number of children each has
/// *inside the run*, O(n + e). A run is usually a handful of commits, but a
/// history with a pinned committer date makes it the whole walked range.
fn children_first(run: Vec<git2::Commit<'_>>) -> Vec<git2::Commit<'_>> {
    let mut children: HashMap<Oid, usize> = run.iter().map(|c| (c.id(), 0)).collect();
    for c in &run {
        for p in c.parent_ids() {
            if let Some(n) = children.get_mut(&p) {
                *n += 1;
            }
        }
    }
    // Seeded in walk order so the result is stable for a given run.
    let mut ready: VecDeque<Oid> = run
        .iter()
        .map(git2::Commit::id)
        .filter(|id| children[id] == 0)
        .collect();
    let mut by_id: HashMap<Oid, git2::Commit<'_>> = run.into_iter().map(|c| (c.id(), c)).collect();
    let mut ordered = Vec::with_capacity(by_id.len());
    while let Some(id) = ready.pop_front() {
        let Some(commit) = by_id.remove(&id) else {
            continue;
        };
        for p in commit.parent_ids() {
            if let Some(n) = children.get_mut(&p) {
                *n -= 1;
                if *n == 0 {
                    ready.push_back(p);
                }
            }
        }
        ordered.push(commit);
    }
    // A commit graph has no cycles; keep anything left over rather than lose it.
    ordered.extend(by_id.into_values());
    ordered
}

/// Sets every branch's `merged_into` to the branch whose tip reaches it —
/// the current branch when that is one, else the first local, else the first
/// remote one — ignoring the branch's own counterparts (see
/// [`Branch::merged_into`]). The checked-out branch never gets one: it can't
/// be deleted, and a feature branch ahead of it doesn't make it "merged".
fn fill_merged_into(
    repo: &Repository,
    cache: &mut AheadBehindCache,
    local: &mut [Branch],
    remotes: &mut [Remote],
) -> Result<(), GitError> {
    let parse = |s: &str| Oid::from_str(s).map_err(map_git2);
    let mut tips = Vec::new();
    for b in local.iter() {
        tips.push(Tip {
            name: b.name.clone(),
            oid: parse(&b.oid)?,
            short: b.name.clone(),
            upstream: b.upstream.clone(),
            is_head: b.is_head,
            remote: false,
        });
    }
    for r in remotes.iter() {
        for rb in &r.branches {
            // A flat `refs/remotes/x` (git-svn's `trunk`) is grouped under a
            // remote named after itself: nothing to strip.
            let short = rb
                .name
                .strip_prefix(&format!("{}/", r.name))
                .unwrap_or(&rb.name);
            tips.push(Tip {
                name: rb.name.clone(),
                oid: parse(&rb.oid)?,
                short: short.to_string(),
                upstream: None,
                is_head: false,
                remote: true,
            });
        }
    }
    let key: MergedKey = tips
        .iter()
        .map(|t| (t.name.clone(), t.oid, t.is_head, t.upstream.clone()))
        .collect();
    let merged = match &cache.merged {
        Some((k, v)) if *k == key => v.clone(),
        _ => {
            let bits = if tips.len() < 2 {
                Vec::new()
            } else {
                reachers(repo, &tips.iter().map(|t| t.oid).collect::<Vec<_>>())?
            };
            // A local upstream (`--track main`) is a merge target, not a copy.
            let counterpart = |a: &Tip, b: &Tip| {
                a.short == b.short
                    || (b.remote && a.upstream.as_deref() == Some(&b.name))
                    || (a.remote && b.upstream.as_deref() == Some(&a.name))
            };
            let merged: Vec<Option<String>> = tips
                .iter()
                .enumerate()
                .map(|(i, t)| {
                    if t.is_head {
                        return None;
                    }
                    let reached_by = |j: usize| bits[i][j / 64] & (1 << (j % 64)) != 0;
                    let mut pick: Option<&Tip> = None;
                    for (j, other) in tips.iter().enumerate() {
                        if j == i || !reached_by(j) || counterpart(t, other) {
                            continue;
                        }
                        if other.is_head {
                            return Some(other.name.clone());
                        }
                        pick.get_or_insert(other);
                    }
                    pick.map(|p| p.name.clone())
                })
                .collect();
            cache.merged = Some((key, merged.clone()));
            merged
        }
    };
    let mut it = merged.into_iter();
    for b in local.iter_mut() {
        b.merged_into = it.next().flatten();
    }
    for r in remotes.iter_mut() {
        for rb in &mut r.branches {
            rb.merged_into = it.next().flatten();
        }
    }
    Ok(())
}

pub fn head_info(repo: &Repository) -> Result<HeadInfo, GitError> {
    match repo.head() {
        Ok(head) => Ok(HeadInfo {
            oid: head.peel_to_commit().ok().map(|c| c.id().to_string()),
            branch: if head.is_branch() {
                head.shorthand().ok().map(String::from)
            } else {
                None
            },
            detached: repo.head_detached().map_err(map_git2)?,
        }),
        Err(e) if e.code() == ErrorCode::UnbornBranch => {
            let branch = repo
                .find_reference("HEAD")
                .ok()
                .and_then(|r| r.symbolic_target().ok().flatten().map(String::from))
                .map(|t| t.strip_prefix("refs/heads/").unwrap_or(&t).to_string());
            Ok(HeadInfo {
                oid: None,
                branch,
                detached: false,
            })
        }
        Err(e) => Err(map_git2(e)),
    }
}

/// A branch sitting exactly on `oid` — a local one, else a remote-tracking one,
/// else the abbreviated oid. Reuses the lists the snapshot already built.
fn branch_at(local: &[Branch], remotes: &[Remote], oid: Oid) -> String {
    let full = oid.to_string();
    local
        .iter()
        .find(|b| b.oid == full)
        .map(|b| b.name.clone())
        .or_else(|| {
            remotes
                .iter()
                .flat_map(|r| &r.branches)
                .find(|rb| rb.oid == full)
                .map(|rb| rb.name.clone())
        })
        .unwrap_or_else(|| full[..7].to_string())
}

/// Single trimmed line of a file in the git directory (`rebase-merge/onto`,
/// `CHERRY_PICK_HEAD`, …); `None` when it isn't there or is empty.
fn gitdir_line(repo: &Repository, rel: &str) -> Option<String> {
    std::fs::read_to_string(repo.path().join(rel))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// The branch name the merge itself recorded, from `MERGE_MSG`'s first line
/// (`Merge branch 'feature' into main`). Preferred over an oid → branch lookup,
/// which cannot tell a merged remote branch from a local twin sitting on the
/// same commit.
fn merge_msg_name(repo: &Repository) -> Option<String> {
    let msg = std::fs::read_to_string(repo.path().join("MERGE_MSG")).ok()?;
    let first = msg.lines().next()?.strip_prefix("Merge ")?;
    let (start, end) = (first.find('\'')?, first.rfind('\'')?);
    let name = first.get(start + 1..end)?;
    (!name.is_empty()).then(|| name.to_string())
}

/// Names the two sides of whatever `state` says is in progress (see
/// [`ConflictSides`]); `None` on a clean repository, and whenever the state
/// files do not name two *different* sides — two buttons reading the same
/// thing for opposite, destructive actions is worse than none. Needs `&mut`
/// for `mergehead_foreach`.
fn conflict_sides(
    repo: &mut Repository,
    state: RepoState,
    head: &HeadInfo,
    local: &[Branch],
    remotes: &[Remote],
) -> Option<ConflictSides> {
    let head_name = || head.branch.clone().unwrap_or_else(|| "HEAD".to_string());
    let sides = match state {
        RepoState::Clean => return None,
        RepoState::Merge => {
            let mut heads = Vec::new();
            let _ = repo.mergehead_foreach(|oid| {
                heads.push(*oid);
                true
            });
            // `git merge a b` records both and stage 3 is then not necessarily
            // either one, so there is nothing honest to name.
            let [merge_head] = heads[..] else { return None };
            ConflictSides {
                ours: head_name(),
                theirs: merge_msg_name(repo)
                    .unwrap_or_else(|| branch_at(local, remotes, merge_head)),
            }
        }
        RepoState::Rebase => {
            // `rebase-merge` for a merge/interactive rebase, `rebase-apply` for
            // the mailbox-style one — which `git am` shares, and where neither
            // file exists: no rebase to name the sides of.
            let dir = ["rebase-merge", "rebase-apply"]
                .into_iter()
                .find(|d| repo.path().join(d).is_dir())?;
            let onto = gitdir_line(repo, &format!("{dir}/onto"));
            let replayed = gitdir_line(repo, &format!("{dir}/head-name"));
            if onto.is_none() && replayed.is_none() {
                return None;
            }
            ConflictSides {
                // What the rebase was told to land on beats the oid lookup, for
                // the same reason as `MERGE_MSG` above.
                ours: gitdir_line(repo, &format!("{dir}/onto_name"))
                    .map(|n| n.strip_prefix("refs/heads/").unwrap_or(&n).to_string())
                    .or_else(|| {
                        onto.and_then(|s| Oid::from_str(&s).ok())
                            .map(|oid| branch_at(local, remotes, oid))
                    })
                    .unwrap_or_else(head_name),
                // Anything but a branch ref is git's literal `detached HEAD`.
                theirs: replayed
                    .map(|n| n.strip_prefix("refs/heads/").unwrap_or("HEAD").to_string())
                    .unwrap_or_else(head_name),
            }
        }
        // A bisect has no two sides at all.
        RepoState::Bisect => return None,
        RepoState::CherryPick | RepoState::Revert => ConflictSides {
            ours: head_name(),
            theirs: match state {
                RepoState::CherryPick => gitdir_line(repo, "CHERRY_PICK_HEAD"),
                _ => gitdir_line(repo, "REVERT_HEAD"),
            }
            .and_then(|s| Oid::from_str(&s).ok())
            .map_or_else(|| "HEAD".to_string(), |oid| branch_at(local, remotes, oid)),
        },
    };
    // Same name on both buttons names nothing.
    (sides.ours != sides.theirs).then_some(sides)
}

/// Which remote group a remote-tracking ref belongs to: the longest configured
/// remote name `name` starts a path component with, else its first component.
fn remote_of(known: &[String], name: &str) -> String {
    known
        .iter()
        .filter(|r| {
            name.len() > r.len() && name.starts_with(r.as_str()) && name.as_bytes()[r.len()] == b'/'
        })
        .max_by_key(|r| r.len())
        .cloned()
        .or_else(|| name.split('/').next().map(String::from))
        .unwrap_or_default()
}

/// Reads branches, remotes, tags and stashes. Needs `&mut` for `stash_foreach`.
pub fn snapshot(repo: &mut Repository) -> Result<RefsSnapshot, GitError> {
    snapshot_with(repo, &mut AheadBehindCache::default())
}

/// [`snapshot`] with the ahead/behind counts memoized in `cache` (one
/// merge-base walk per tracking branch otherwise, on every refresh).
pub fn snapshot_with(
    repo: &mut Repository,
    cache: &mut AheadBehindCache,
) -> Result<RefsSnapshot, GitError> {
    let head = head_info(repo)?;
    let state = repo.state().into();

    let mut local = Vec::new();
    for entry in repo.branches(Some(BranchType::Local)).map_err(map_git2)? {
        let (branch, _) = entry.map_err(map_git2)?;
        let Some(name) = branch.name().map_err(map_git2)?.map(String::from) else {
            continue;
        };
        let Ok(commit) = branch.get().peel_to_commit() else {
            continue;
        };
        let oid = commit.id();
        // Config-only lookup so a pruned tracking ref still reports as "gone".
        let upstream = branch
            .get()
            .name()
            .ok()
            .and_then(|refname| repo.branch_upstream_name(refname).ok())
            .and_then(|buf| buf.as_str().ok().map(String::from))
            .map(|full| {
                full.strip_prefix("refs/remotes/")
                    .or_else(|| full.strip_prefix("refs/heads/"))
                    .unwrap_or(&full)
                    .to_string()
            });
        let mut gone = false;
        let (mut ahead, mut behind) = (0, 0);
        if upstream.is_some() {
            match branch
                .upstream()
                .ok()
                .and_then(|up| up.get().peel_to_commit().ok())
            {
                Some(up_commit) => {
                    let (a, b) = cache.get_or_compute(repo, oid, up_commit.id());
                    ahead = u32::try_from(a).unwrap_or(u32::MAX);
                    behind = u32::try_from(b).unwrap_or(u32::MAX);
                }
                None => gone = true,
            }
        }
        local.push(Branch {
            is_head: branch.is_head(),
            name,
            oid: oid.to_string(),
            upstream,
            gone,
            ahead,
            behind,
            merged_into: None,
        });
    }
    local.sort_by(|a, b| natural_cmp(&a.name, &b.name));

    // Remotes (config) + remote-tracking branches grouped by longest remote-name prefix.
    let mut groups: BTreeMap<String, Remote> = BTreeMap::new();
    let remote_names = repo.remotes().map_err(map_git2)?;
    for name in remote_names.iter().flatten().flatten() {
        let url = repo
            .find_remote(name)
            .ok()
            .and_then(|r| r.url().ok().map(String::from))
            .filter(|u| !u.is_empty());
        groups.insert(
            name.to_string(),
            Remote {
                name: name.to_string(),
                url,
                branches: Vec::new(),
                head: None,
            },
        );
    }
    let known: Vec<String> = groups.keys().cloned().collect();
    for entry in repo.branches(Some(BranchType::Remote)).map_err(map_git2)? {
        let (branch, _) = entry.map_err(map_git2)?;
        let Some(name) = branch.name().map_err(map_git2)?.map(String::from) else {
            continue;
        };
        let remote = remote_of(&known, &name);
        if branch.get().kind() == Some(ReferenceType::Symbolic) {
            // `origin/HEAD` → the remote's default branch, kept on the group
            // instead of listed as a branch.
            if let Ok(Some(target)) = branch.get().symbolic_target() {
                let short = target
                    .strip_prefix("refs/remotes/")
                    .unwrap_or(target)
                    .to_string();
                groups
                    .entry(remote.clone())
                    .or_insert_with(|| Remote {
                        name: remote,
                        url: None,
                        branches: Vec::new(),
                        head: None,
                    })
                    .head = Some(short);
            }
            continue;
        }
        let Ok(commit) = branch.get().peel_to_commit() else {
            continue;
        };
        groups
            .entry(remote.clone())
            .or_insert_with(|| Remote {
                name: remote,
                url: None,
                branches: Vec::new(),
                head: None,
            })
            .branches
            .push(RemoteBranch {
                name,
                oid: commit.id().to_string(),
                merged_into: None,
            });
    }
    let mut remotes: Vec<Remote> = groups.into_values().collect();
    for r in &mut remotes {
        r.branches.sort_by(|a, b| natural_cmp(&a.name, &b.name));
    }
    fill_merged_into(repo, cache, &mut local, &mut remotes)?;

    let mut raw_tags: Vec<(git2::Oid, String)> = Vec::new();
    repo.tag_foreach(|oid, name| {
        let name = String::from_utf8_lossy(name);
        let short = name.strip_prefix("refs/tags/").unwrap_or(&name).to_string();
        raw_tags.push((oid, short));
        true
    })
    .map_err(map_git2)?;
    let mut tags = Vec::with_capacity(raw_tags.len());
    for (oid, name) in raw_tags {
        let peeled = repo
            .find_object(oid, None)
            .and_then(|o| o.peel(ObjectType::Commit))
            .map(|c| c.id());
        if let Ok(peeled) = peeled {
            // `tag_foreach` hands over the tag object for an annotated tag and the
            // commit itself for a lightweight one, so this lookup is the test.
            let message = repo
                .find_tag(oid)
                .ok()
                .and_then(|t| t.message().ok().flatten().map(|m| m.trim().to_string()))
                .filter(|m| !m.is_empty());
            tags.push(Tag {
                name,
                oid: peeled.to_string(),
                message,
            });
        }
    }
    tags.sort_by(|a, b| natural_cmp(&a.name, &b.name));

    let mut stashes = Vec::new();
    repo.stash_foreach(|index, message, oid| {
        stashes.push(Stash {
            index,
            oid: oid.to_string(),
            message: message.to_string(),
        });
        true
    })
    .map_err(map_git2)?;

    let conflict_sides = conflict_sides(repo, state, &head, &local, &remotes);

    Ok(RefsSnapshot {
        head,
        state,
        conflict_sides,
        local,
        remotes,
        tags,
        stashes,
    })
}

/// Labels per commit oid, ordered HEAD → current local → local → remote → tag.
///
/// A `HEAD` label is emitted only when HEAD is detached; on a branch the
/// current branch's label carries `is_current: true` instead. Stashes get no
/// label (stash commits are never walked).
///
/// Synced-chip rule: a local branch whose *tracking* upstream sits at the same
/// commit gets `remote: Some(<remote name>)` — or `Some(<remote>/<branch>)` when
/// the upstream is not named after the local branch — and the upstream's own
/// remote label is suppressed. Other remote branches at the same commit keep
/// their label.
pub fn label_map(snap: &RefsSnapshot) -> HashMap<String, Vec<RefLabel>> {
    let mut map: HashMap<String, Vec<RefLabel>> = HashMap::new();
    let mut push = |oid: &str, label: RefLabel| map.entry(oid.to_string()).or_default().push(label);

    if let Some(oid) = snap.head.oid.as_deref().filter(|_| snap.head.detached) {
        push(
            oid,
            RefLabel {
                name: "HEAD".to_string(),
                kind: RefKind::Head,
                is_current: false,
                remote: None,
            },
        );
    }

    let mut local: Vec<&Branch> = snap.local.iter().collect();
    local.sort_by(|a, b| {
        b.is_head
            .cmp(&a.is_head)
            .then_with(|| natural_cmp(&a.name, &b.name))
    });
    let mut suppressed: HashSet<&str> = HashSet::new();
    for b in local {
        let mut remote = None;
        if let Some(up) = b.upstream.as_deref() {
            let tracking = snap
                .remotes
                .iter()
                .flat_map(|r| r.branches.iter().map(move |rb| (r, rb)))
                .find(|(_, rb)| rb.name == up);
            if let Some((r, rb)) = tracking {
                if rb.oid == b.oid {
                    // The remote name alone is only unambiguous while the upstream shares the
                    // local branch's name: `feature · origin` beside an unrelated
                    // `origin/feature` reads as that branch. Spell the upstream out when it is
                    // named something else.
                    let short = rb.name.strip_prefix(&format!("{}/", r.name));
                    remote = Some(if short == Some(b.name.as_str()) {
                        r.name.clone()
                    } else {
                        rb.name.clone()
                    });
                    suppressed.insert(up);
                }
            }
        }
        push(
            &b.oid,
            RefLabel {
                name: b.name.clone(),
                kind: RefKind::Local,
                is_current: b.is_head,
                remote,
            },
        );
    }

    for r in &snap.remotes {
        for rb in &r.branches {
            if suppressed.contains(rb.name.as_str()) {
                continue;
            }
            push(
                &rb.oid,
                RefLabel {
                    name: rb.name.clone(),
                    kind: RefKind::Remote,
                    is_current: false,
                    remote: None,
                },
            );
        }
    }

    for t in &snap.tags {
        push(
            &t.oid,
            RefLabel {
                name: t.name.clone(),
                kind: RefKind::Tag,
                is_current: false,
                remote: None,
            },
        );
    }

    map
}

/// Creates local branch `name` at `target` (anything `rev-parse` accepts).
/// `force` moves an existing branch instead of failing.
pub fn create_branch(
    repo: &Repository,
    name: &str,
    target: &str,
    force: bool,
) -> Result<Branch, GitError> {
    let commit = repo
        .revparse_single(target)
        .and_then(|o| o.peel_to_commit())
        .map_err(map_git2)?;
    let branch = repo.branch(name, &commit, force).map_err(map_git2)?;
    Ok(Branch {
        name: name.to_string(),
        oid: commit.id().to_string(),
        upstream: None,
        gone: false,
        ahead: 0,
        behind: 0,
        is_head: branch.is_head(),
        merged_into: None,
    })
}

fn head_oid(repo: &Repository) -> Result<Option<Oid>, GitError> {
    match repo.head() {
        Ok(h) => Ok(Some(h.peel_to_commit().map_err(map_git2)?.id())),
        Err(e) if e.code() == ErrorCode::UnbornBranch => Ok(None),
        Err(e) => Err(map_git2(e)),
    }
}

fn is_reachable(repo: &Repository, from: Oid, target: Oid) -> Result<bool, GitError> {
    Ok(from == target || repo.graph_descendant_of(from, target).map_err(map_git2)?)
}

/// `true` when the tip of local branch `name` is HEAD or one of its ancestors
/// (`false` on an unborn HEAD).
pub fn is_merged_into_head(repo: &Repository, name: &str) -> Result<bool, GitError> {
    let tip = repo
        .find_branch(name, BranchType::Local)
        .and_then(|b| b.get().peel_to_commit())
        .map_err(map_git2)?
        .id();
    match head_oid(repo)? {
        Some(head) => is_reachable(repo, head, tip),
        None => Ok(false),
    }
}

/// Deletes local branch `name`. Without `force` the branch must be merged
/// into HEAD or into its upstream (git's `branch -d` rule); the checked-out
/// branch is never deleted. Refusals are [`GitError::Refused`].
pub fn delete_branch(repo: &Repository, name: &str, force: bool) -> Result<(), GitError> {
    let mut branch = repo
        .find_branch(name, BranchType::Local)
        .map_err(map_git2)?;
    if branch.is_head() {
        return Err(GitError::Refused(format!(
            "cannot delete '{name}': it is the current branch"
        )));
    }
    if !force {
        let tip = branch.get().peel_to_commit().map_err(map_git2)?.id();
        let merged_upstream = match branch
            .upstream()
            .ok()
            .and_then(|u| u.get().peel_to_commit().ok())
        {
            Some(up) => is_reachable(repo, up.id(), tip)?,
            None => false,
        };
        if !merged_upstream && !is_merged_into_head(repo, name)? {
            return Err(GitError::Refused(format!(
                "branch '{name}' is not fully merged; force-delete to discard its commits"
            )));
        }
    }
    branch.delete().map_err(map_git2)
}

/// Renames local branch `old` to `new` (`force` overwrites an existing `new`).
pub fn rename_branch(repo: &Repository, old: &str, new: &str, force: bool) -> Result<(), GitError> {
    repo.find_branch(old, BranchType::Local)
        .and_then(|mut b| b.rename(new, force).map(|_| ()))
        .map_err(map_git2)
}

/// Creates tag `name` at `target`: lightweight without `message`, annotated
/// (signed with `user.name`/`user.email`) with one. Fails if the tag exists.
pub fn create_tag(
    repo: &Repository,
    name: &str,
    target: &str,
    message: Option<&str>,
) -> Result<Tag, GitError> {
    // Tag the commit, not whatever `target` names: `git tag x v1.0` on an
    // annotated `v1.0` tags the commit too, never the tag object.
    let commit = repo
        .revparse_single(target)
        .and_then(|o| o.peel(ObjectType::Commit))
        .map_err(map_git2)?;
    match message {
        Some(msg) => {
            let (user, email) = user_identity(repo)?;
            let sig = Signature::now(&user, &email).map_err(map_git2)?;
            repo.tag(name, &commit, &sig, msg, false)
                .map_err(map_git2)?;
        }
        None => {
            repo.tag_lightweight(name, &commit, false)
                .map_err(map_git2)?;
        }
    }
    Ok(Tag {
        name: name.to_string(),
        oid: commit.id().to_string(),
        message: message.map(str::to_string),
    })
}

pub fn delete_tag(repo: &Repository, name: &str) -> Result<(), GitError> {
    repo.tag_delete(name).map_err(map_git2)
}

#[cfg(test)]
mod tests {
    use super::{children_first, natural_cmp, snapshot, ConflictSides, RepoState};
    use crate::test_util::TempRepo;

    #[test]
    fn natural_order_reads_numbers_and_ignores_case() {
        let mut names = vec![
            "v0.10.0",
            "v0.2.0",
            "v0.9.1",
            "Zeta",
            "alpha",
            "beta",
            "v1.0.0",
            "feature/10",
            "feature/9",
            "a01",
            "a1",
            "a2",
        ];
        names.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(
            names,
            [
                "a01",
                "a1",
                "a2",
                "alpha",
                "beta",
                "feature/9",
                "feature/10",
                "v0.2.0",
                "v0.9.1",
                "v0.10.0",
                "v1.0.0",
                "Zeta"
            ]
        );
    }

    /// master with a `feature` branch off it, `feature` one commit ahead.
    fn two_branches() -> (TempRepo, git2::Oid, git2::Oid) {
        let t = TempRepo::new();
        let base = t.commit(&[("a.txt", "a\n")], "base");
        t.branch("feature", base);
        t.checkout("feature");
        let feature = t.commit(&[("a.txt", "theirs\n")], "feature");
        t.checkout("master");
        let master = t.commit(&[("a.txt", "ours\n")], "ours");
        (t, master, feature)
    }

    #[test]
    fn conflict_sides_name_the_branches_of_a_merge_and_stay_empty_when_clean() {
        let (mut t, _, feature) = two_branches();
        assert_eq!(snapshot(&mut t.repo).unwrap().conflict_sides, None);

        t.write_ref("MERGE_HEAD", &feature.to_string());
        assert_eq!(
            snapshot(&mut t.repo).unwrap().conflict_sides,
            Some(ConflictSides {
                ours: "master".to_string(),
                theirs: "feature".to_string(),
            })
        );
    }

    #[test]
    fn a_rebase_reports_gits_own_direction_onto_is_ours() {
        // The branch being replayed is `--theirs` and the one it lands on is
        // `--ours` — the opposite of what the person running it would say.
        let (mut t, master, _) = two_branches();
        let dir = t.repo.path().join("rebase-merge");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("head-name"), "refs/heads/feature\n").unwrap();
        std::fs::write(dir.join("onto"), format!("{master}\n")).unwrap();

        assert_eq!(
            snapshot(&mut t.repo).unwrap().conflict_sides,
            Some(ConflictSides {
                ours: "master".to_string(),
                theirs: "feature".to_string(),
            })
        );
    }

    /// Writes `rebase-<kind>/<file>` state files and returns the snapshot's sides.
    fn rebase_sides(
        t: &mut TempRepo,
        kind: &str,
        files: &[(&str, String)],
    ) -> Option<ConflictSides> {
        let dir = t.repo.path().join(format!("rebase-{kind}"));
        std::fs::create_dir_all(&dir).unwrap();
        for (name, content) in files {
            std::fs::write(dir.join(name), content).unwrap();
        }
        snapshot(&mut t.repo).unwrap().conflict_sides
    }

    #[test]
    fn a_git_am_names_no_sides() {
        // `git am` uses `rebase-apply` too, but writes neither `onto` nor
        // `head-name`: both sides used to fall back to the HEAD branch.
        let (mut t, _, _) = two_branches();
        assert_eq!(
            rebase_sides(&mut t, "apply", &[("applying", String::new())]),
            None
        );
    }

    #[test]
    fn a_rebase_prefers_the_recorded_onto_name_over_a_branch_lookup() {
        let (mut t, master, _) = two_branches();
        assert_eq!(
            rebase_sides(
                &mut t,
                "merge",
                &[
                    ("head-name", "refs/heads/feature\n".to_string()),
                    ("onto", format!("{master}\n")),
                    ("onto_name", "refs/heads/mainline\n".to_string()),
                ]
            ),
            Some(ConflictSides {
                ours: "mainline".to_string(),
                theirs: "feature".to_string(),
            })
        );
    }

    #[test]
    fn a_detached_head_rebase_says_head() {
        let (mut t, master, feature) = two_branches();
        t.detach(feature);
        assert_eq!(
            rebase_sides(
                &mut t,
                "merge",
                &[
                    ("head-name", "detached HEAD\n".to_string()),
                    ("onto", format!("{master}\n")),
                ]
            ),
            Some(ConflictSides {
                ours: "master".to_string(),
                theirs: "HEAD".to_string(),
            })
        );
    }

    #[test]
    fn a_merge_prefers_the_name_merge_msg_recorded() {
        let (mut t, _, feature) = two_branches();
        // A local branch on the merged commit that sorts first: the reverse
        // lookup would name it instead of the branch actually merged.
        t.branch("aaa-twin", feature);
        t.write_ref("MERGE_HEAD", &feature.to_string());
        std::fs::write(
            t.repo.path().join("MERGE_MSG"),
            "Merge branch 'feature' into master\n\n# comment\n",
        )
        .unwrap();
        assert_eq!(
            snapshot(&mut t.repo).unwrap().conflict_sides,
            Some(ConflictSides {
                ours: "master".to_string(),
                theirs: "feature".to_string(),
            })
        );
    }

    /// The walk hands a same-second run over parents-first; every commit must
    /// come out before its own parents, a merge before both of its.
    #[test]
    fn children_first_puts_a_merge_before_both_of_its_parents() {
        let (t, master, feature) = two_branches();
        let base = t
            .repo
            .find_commit(master)
            .expect("find_commit")
            .parent_id(0)
            .expect("base");
        let merge = t.merge_commit("merge", &[master, feature]);

        let run: Vec<git2::Commit<'_>> = [base, feature, master, merge]
            .iter()
            .map(|o| t.repo.find_commit(*o).expect("find_commit"))
            .collect();
        let out: Vec<git2::Oid> = children_first(run).iter().map(git2::Commit::id).collect();

        assert_eq!(out.len(), 4);
        assert_eq!(out[0], merge);
        assert_eq!(out[3], base);
        assert!(out[1..3].contains(&master) && out[1..3].contains(&feature));
    }

    #[test]
    fn an_octopus_merge_names_no_sides() {
        let (mut t, master, feature) = two_branches();
        t.write_ref("MERGE_HEAD", &format!("{feature}\n{master}"));
        assert_eq!(snapshot(&mut t.repo).unwrap().conflict_sides, None);
    }

    #[test]
    fn a_bisect_names_no_sides() {
        let (mut t, _, _) = two_branches();
        t.write_ref("BISECT_LOG", "git bisect start");
        let snap = snapshot(&mut t.repo).unwrap();
        assert_eq!(snap.state, RepoState::Bisect);
        assert_eq!(snap.conflict_sides, None);
    }

    #[test]
    fn a_cherry_pick_names_the_branch_at_the_picked_commit() {
        let (mut t, _, feature) = two_branches();
        t.write_ref("CHERRY_PICK_HEAD", &feature.to_string());
        assert_eq!(
            snapshot(&mut t.repo).unwrap().conflict_sides,
            Some(ConflictSides {
                ours: "master".to_string(),
                theirs: "feature".to_string(),
            })
        );
    }
}
