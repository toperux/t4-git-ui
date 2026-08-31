use std::collections::{BTreeMap, HashMap, HashSet};

use git2::{BranchType, ErrorCode, ObjectType, ReferenceType, Repository, RepositoryState};
use serde::{Deserialize, Serialize};

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
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBranch {
    /// Short name including the remote (`origin/main`).
    pub name: String,
    pub oid: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Remote {
    pub name: String,
    pub url: Option<String>,
    pub branches: Vec<RemoteBranch>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub name: String,
    /// Peeled to the tagged commit.
    pub oid: String,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefsSnapshot {
    pub head: HeadInfo,
    pub state: RepoState,
    pub local: Vec<Branch>,
    pub remotes: Vec<Remote>,
    pub tags: Vec<Tag>,
    pub stashes: Vec<Stash>,
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

/// Reads branches, remotes, tags and stashes. Needs `&mut` for `stash_foreach`.
pub fn snapshot(repo: &mut Repository) -> Result<RefsSnapshot, GitError> {
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
                    let (a, b) = repo
                        .graph_ahead_behind(oid, up_commit.id())
                        .unwrap_or((0, 0));
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
        });
    }
    local.sort_by(|a, b| a.name.cmp(&b.name));

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
            },
        );
    }
    let known: Vec<String> = groups.keys().cloned().collect();
    for entry in repo.branches(Some(BranchType::Remote)).map_err(map_git2)? {
        let (branch, _) = entry.map_err(map_git2)?;
        if branch.get().kind() == Some(ReferenceType::Symbolic) {
            continue; // e.g. origin/HEAD
        }
        let Some(name) = branch.name().map_err(map_git2)?.map(String::from) else {
            continue;
        };
        let Ok(commit) = branch.get().peel_to_commit() else {
            continue;
        };
        let remote = known
            .iter()
            .filter(|r| {
                name.len() > r.len()
                    && name.starts_with(r.as_str())
                    && name.as_bytes()[r.len()] == b'/'
            })
            .max_by_key(|r| r.len())
            .cloned()
            .or_else(|| name.split('/').next().map(String::from))
            .unwrap_or_default();
        groups
            .entry(remote.clone())
            .or_insert_with(|| Remote {
                name: remote,
                url: None,
                branches: Vec::new(),
            })
            .branches
            .push(RemoteBranch {
                name,
                oid: commit.id().to_string(),
            });
    }
    let mut remotes: Vec<Remote> = groups.into_values().collect();
    for r in &mut remotes {
        r.branches.sort_by(|a, b| a.name.cmp(&b.name));
    }

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
            tags.push(Tag {
                name,
                oid: peeled.to_string(),
            });
        }
    }
    tags.sort_by(|a, b| a.name.cmp(&b.name));

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

    Ok(RefsSnapshot {
        head,
        state,
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
/// commit gets `remote: Some(<remote name>)` and the upstream's own remote label
/// is suppressed. Other remote branches at the same commit keep their label.
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
    local.sort_by_key(|b| (!b.is_head, &b.name));
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
                    remote = Some(r.name.clone());
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
