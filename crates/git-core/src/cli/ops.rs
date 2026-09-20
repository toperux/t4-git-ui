//! Argument builders and output parsers for branch / remote / stash
//! operations run through the CLI runner. Everything here is pure (no git
//! needed) so it is unit-tested directly; the runner and the Tauri layer
//! wire the args to a process and the parsers to its output.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::status::WorkdirStatus;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PullMode {
    Merge,
    Rebase,
    FfOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FfMode {
    #[default]
    Auto,
    Only,
    No,
}

/// `git reset` flavor: what happens to the index and working tree when the
/// branch moves.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResetMode {
    /// Keep the index and working tree (the difference shows as staged).
    Soft,
    /// Keep the working tree, reset the index (git's default).
    #[default]
    Mixed,
    /// Discard all uncommitted changes.
    Hard,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct MergeOpts {
    pub ff: FfMode,
    pub squash: bool,
    pub message: Option<String>,
}

/// Options shared by `cherry-pick` and `revert` (`record_origin` is cherry-pick's `-x`).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PickOpts {
    pub no_commit: bool,
    pub record_origin: bool,
    /// Which parent of a merge commit the change is measured against (`-m N`).
    pub mainline: Option<u32>,
}

/// Which end of the range a `git bisect` mark names.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BisectTerm {
    Good,
    Bad,
    Skip,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CloneOpts {
    pub recurse_submodules: bool,
    pub depth: Option<u32>,
}

/// Why a CLI op exited non-zero, from well-known output patterns.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum OpFailure {
    /// Merge / rebase / pull stopped on conflicts (paths as reported by git;
    /// callers refine them from `status()`).
    Conflicts {
        paths: Vec<String>,
    },
    /// A rebase stopped without conflicts — an `edit` line, or an `exec` that
    /// failed — carrying git's own line ("Stopped at …" / "execution failed: …").
    /// Decided from the repository state, not from the exit code (an `edit`
    /// stop exits 0), so `classify_failure` never returns it.
    Paused {
        message: String,
    },
    /// Push rejected as non-fast-forward: the remote has commits we lack.
    NonFastForward,
    /// `--ff-only` pull (the fetch already happened) / merge that cannot
    /// fast-forward: the branches have diverged.
    Diverged,
    AuthFailed,
    /// Any other `! [rejected]` / `! [remote rejected]` line.
    Rejected {
        message: String,
    },
    /// Last `fatal:` / `error:` line (or, for advice without one, the first stderr line).
    Other {
        message: String,
    },
}

fn args<const N: usize>(fixed: [&str; N]) -> Vec<String> {
    fixed.iter().map(|s| s.to_string()).collect()
}

/// Ends git's option parsing (git ≥ 2.24): everything after it is a ref, path
/// or url even when it starts with `-`. Every builder puts it after its last
/// flag and before its first user-supplied argument, so a branch named
/// `--exec=<cmd>` — which `git branch` refuses but a fetch happily creates —
/// cannot arrive as an option. The few user arguments that have to sit *before*
/// it (a remote name) are refused at the command boundary instead.
const END: &str = "--end-of-options";

/// `fetch --progress [--prune] [--tags] (--end-of-options <remote> | --all)`
pub fn fetch(remote: Option<&str>, prune: bool, tags: bool) -> Vec<String> {
    let mut a = args(["fetch", "--progress"]);
    if prune {
        a.push("--prune".into());
    }
    if tags {
        a.push("--tags".into());
    }
    match remote {
        Some(r) => {
            a.push(END.into());
            a.push(r.into());
        }
        // `--all` is a flag, so it has to stay on git's side of the separator.
        None => a.push("--all".into()),
    }
    a
}

/// `pull --progress (--no-rebase | --rebase | --ff-only) [--end-of-options <remote> [<branch>]]`.
/// `branch` is ignored without `remote` (git would read it as the remote).
pub fn pull(remote: Option<&str>, branch: Option<&str>, mode: PullMode) -> Vec<String> {
    let mut a = args(["pull", "--progress"]);
    a.push(
        match mode {
            PullMode::Merge => "--no-rebase",
            PullMode::Rebase => "--rebase",
            PullMode::FfOnly => "--ff-only",
        }
        .into(),
    );
    if let Some(r) = remote {
        a.push(END.into());
        a.push(r.into());
        if let Some(b) = branch {
            a.push(b.into());
        }
    }
    a
}

/// `push --progress [-u] [--force-with-lease] [--tags] <remote> [--end-of-options <refspec>]`
pub fn push(
    remote: &str,
    refspec: Option<&str>,
    set_upstream: bool,
    force_with_lease: bool,
    tags: bool,
) -> Vec<String> {
    let mut a = args(["push", "--progress"]);
    if set_upstream {
        a.push("-u".into());
    }
    if force_with_lease {
        a.push("--force-with-lease".into());
    }
    if tags {
        a.push("--tags".into());
    }
    a.push(remote.into());
    if let Some(r) = refspec {
        a.push(END.into());
        a.push(r.into());
    }
    a
}

/// `merge (--ff | --ff-only | --no-ff) [--squash] [-m <msg>] --end-of-options <branch>`
pub fn merge(branch: &str, opts: &MergeOpts) -> Vec<String> {
    let mut a = args(["merge"]);
    a.push(
        match opts.ff {
            FfMode::Auto => "--ff",
            FfMode::Only => "--ff-only",
            FfMode::No => "--no-ff",
        }
        .into(),
    );
    if opts.squash {
        a.push("--squash".into());
    }
    if let Some(m) = &opts.message {
        a.push("-m".into());
        a.push(m.clone());
    }
    a.push(END.into());
    a.push(branch.into());
    a
}

/// `rebase --end-of-options <onto>` (non-interactive only).
pub fn rebase(onto: &str) -> Vec<String> {
    let mut a = args(["rebase", END]);
    a.push(onto.into());
    a
}

/// `rebase --continue`. The resumed commit's message would open an editor;
/// the runner's `GIT_EDITOR=true` keeps that from hanging without a tty.
pub fn rebase_continue() -> Vec<String> {
    args(["rebase", "--continue"])
}

pub fn rebase_abort() -> Vec<String> {
    args(["rebase", "--abort"])
}

/// `rebase --skip` — drops the commit the rebase stopped on.
pub fn rebase_skip() -> Vec<String> {
    args(["rebase", "--skip"])
}

pub fn merge_abort() -> Vec<String> {
    args(["merge", "--abort"])
}

/// `cherry-pick [-n] [-x] [-m N] --end-of-options <oid>`
pub fn cherry_pick(oid: &str, opts: &PickOpts) -> Vec<String> {
    let mut a = args(["cherry-pick"]);
    if opts.no_commit {
        a.push("-n".into());
    }
    if opts.record_origin {
        a.push("-x".into());
    }
    if let Some(m) = opts.mainline {
        a.push("-m".into());
        a.push(m.to_string());
    }
    a.push(END.into());
    a.push(oid.into());
    a
}

/// `revert --no-edit [-n] [-m N] --end-of-options <oid>` (`record_origin` has no revert
/// equivalent). `--no-edit` takes git's own "Revert …" message instead of
/// leaning on the runner's `GIT_EDITOR=true`.
pub fn revert(oid: &str, opts: &PickOpts) -> Vec<String> {
    let mut a = args(["revert", "--no-edit"]);
    if opts.no_commit {
        a.push("-n".into());
    }
    if let Some(m) = opts.mainline {
        a.push("-m".into());
        a.push(m.to_string());
    }
    a.push(END.into());
    a.push(oid.into());
    a
}

pub fn cherry_pick_abort() -> Vec<String> {
    args(["cherry-pick", "--abort"])
}

pub fn revert_abort() -> Vec<String> {
    args(["revert", "--abort"])
}

/// `bisect start` — the marks come after it, so it needs no revisions.
pub fn bisect_start() -> Vec<String> {
    args(["bisect", "start"])
}

/// `bisect (good | bad | skip) [<oid>]` — HEAD when no oid is given. No
/// `--end-of-options`: `git bisect` does not accept it, so the oid is checked
/// at the command boundary instead.
pub fn bisect_mark(term: BisectTerm, oid: Option<&str>) -> Vec<String> {
    let mut a = args([
        "bisect",
        match term {
            BisectTerm::Good => "good",
            BisectTerm::Bad => "bad",
            BisectTerm::Skip => "skip",
        },
    ]);
    if let Some(oid) = oid {
        a.push(oid.into());
    }
    a
}

/// `bisect reset` — ends the bisect and checks the starting branch back out.
pub fn bisect_reset() -> Vec<String> {
    args(["bisect", "reset"])
}

/// `checkout [--track] [-b <name>] [--detach] --end-of-options <target>`; `track` only applies
/// with `-b`, `detach` only without it. Without `--detach` a name that is both
/// a tag and a branch resolves to the branch, leaving HEAD attached.
pub fn checkout(
    target: &str,
    create_branch: Option<&str>,
    track: bool,
    detach: bool,
) -> Vec<String> {
    let mut a = args(["checkout"]);
    if let Some(name) = create_branch {
        if track {
            a.push("--track".into());
        }
        a.push("-b".into());
        a.push(name.into());
    } else if detach {
        a.push("--detach".into());
    }
    a.push(END.into());
    a.push(target.into());
    a
}

/// `reset (--soft | --mixed | --hard) --end-of-options <target>` — moves the current branch
/// (or a detached HEAD) to `target`.
pub fn reset(mode: ResetMode, target: &str) -> Vec<String> {
    let mut a = args(["reset"]);
    a.push(
        match mode {
            ResetMode::Soft => "--soft",
            ResetMode::Mixed => "--mixed",
            ResetMode::Hard => "--hard",
        }
        .into(),
    );
    a.push(END.into());
    a.push(target.into());
    a
}

/// `branch -f --end-of-options <name> <target>` — moves a branch that is not checked out (git
/// refuses to force-update the current branch; that is what `reset` is for).
pub fn branch_force(name: &str, target: &str) -> Vec<String> {
    let mut a = args(["branch", "-f", END]);
    a.push(name.into());
    a.push(target.into());
    a
}

/// `push <remote> --delete --end-of-options <name>`
pub fn delete_remote_branch(remote: &str, name: &str) -> Vec<String> {
    let mut a = args(["push"]);
    a.push(remote.into());
    a.push("--delete".into());
    a.push(END.into());
    a.push(name.into());
    a
}

/// `ls-remote --tags --end-of-options <remote>` (no `--refs`: the `^{}` peeled lines carry the commit)
pub fn ls_remote_tags(remote: &str) -> Vec<String> {
    let mut a = args(["ls-remote", "--tags", END]);
    a.push(remote.into());
    a
}

/// One tag a remote has, from `ls-remote`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteTag {
    pub name: String,
    /// The commit the tag points at (the peeled oid on an annotated tag).
    pub oid: String,
}

/// Tags from `ls-remote` output, by name; anything but `<oid>\trefs/tags/<name>` is skipped.
/// An annotated tag prints twice — the tag object, then `<name>^{}` with the commit it points at —
/// and the peeled line is the one that wins whichever order the two arrive in.
pub fn parse_ls_remote_tags(stdout: &str) -> Vec<RemoteTag> {
    let mut by_name: BTreeMap<&str, &str> = BTreeMap::new();
    for line in stdout.lines() {
        let Some((oid, rest)) = line.split_once('\t') else {
            continue;
        };
        let Some(name) = rest.strip_prefix("refs/tags/") else {
            continue;
        };
        match name.strip_suffix("^{}") {
            Some(peeled) => {
                by_name.insert(peeled, oid);
            }
            None => {
                by_name.entry(name).or_insert(oid);
            }
        }
    }
    by_name
        .into_iter()
        .map(|(name, oid)| RemoteTag {
            name: name.into(),
            oid: oid.into(),
        })
        .collect()
}

/// `tag -a -F <message_file> --end-of-options <name> <target>`. Annotated tags
/// go through the CLI so `tag.gpgsign` and the signing config are honoured —
/// git2's `repo.tag` never signs. Lightweight tags stay on git2. The message
/// travels in a file, like `commit`'s, so a `-` or a newline in it is text.
pub fn tag_annotated(name: &str, target: &str, message_file: &std::path::Path) -> Vec<String> {
    let mut a = args(["tag", "-a", "-F"]);
    a.push(message_file.to_string_lossy().into_owned());
    a.push(END.into());
    a.push(name.into());
    a.push(target.into());
    a
}

/// `stash push [-u] [-k] [-m <msg>]`
pub fn stash_push(message: Option<&str>, include_untracked: bool, keep_index: bool) -> Vec<String> {
    let mut a = args(["stash", "push"]);
    if include_untracked {
        a.push("-u".into());
    }
    if keep_index {
        a.push("-k".into());
    }
    if let Some(m) = message {
        a.push("-m".into());
        a.push(m.into());
    }
    a
}

fn stash_ref(index: usize) -> String {
    format!("stash@{{{index}}}")
}

pub fn stash_apply(index: usize) -> Vec<String> {
    vec!["stash".into(), "apply".into(), stash_ref(index)]
}

pub fn stash_pop(index: usize) -> Vec<String> {
    vec!["stash".into(), "pop".into(), stash_ref(index)]
}

pub fn stash_drop(index: usize) -> Vec<String> {
    vec!["stash".into(), "drop".into(), stash_ref(index)]
}

/// `stash clear` — drops every entry at once.
pub fn stash_clear() -> Vec<String> {
    vec!["stash".into(), "clear".into()]
}

/// `clone --progress [--recurse-submodules] [--depth <n>] --end-of-options <url> <dest>`
/// (run with cwd = the parent of `dest`).
pub fn clone(url: &str, dest: &str, opts: &CloneOpts) -> Vec<String> {
    let mut a = args(["clone", "--progress"]);
    if opts.recurse_submodules {
        a.push("--recurse-submodules".into());
    }
    if let Some(d) = opts.depth {
        a.push("--depth".into());
        a.push(d.to_string());
    }
    a.push(END.into());
    a.push(url.into());
    a.push(dest.into());
    a
}

/// Which branch a new worktree checks out.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorktreeBranch<'a> {
    /// A branch that exists already (git refuses one checked out elsewhere).
    Existing(&'a str),
    /// A branch created by the add, at `start` — HEAD when `None`.
    New {
        name: &'a str,
        start: Option<&'a str>,
    },
}

/// `worktree add [--no-checkout] [-b <name>] --end-of-options <path> [<branch>|<start>]`
pub fn worktree_add(path: &str, branch: WorktreeBranch<'_>, checkout: bool) -> Vec<String> {
    let mut a = args(["worktree", "add"]);
    if !checkout {
        a.push("--no-checkout".into());
    }
    if let WorktreeBranch::New { name, .. } = branch {
        a.push("-b".into());
        a.push(name.into());
    }
    a.push(END.into());
    a.push(path.into());
    match branch {
        WorktreeBranch::Existing(name) => a.push(name.into()),
        WorktreeBranch::New { start, .. } => a.extend(start.map(String::from)),
    }
    a
}

/// `worktree remove [--force] --end-of-options <path>` — refused while the
/// worktree is dirty or locked, which is what `force` is re-offered for.
pub fn worktree_remove(path: &str, force: bool) -> Vec<String> {
    let mut a = args(["worktree", "remove"]);
    if force {
        a.push("--force".into());
    }
    a.push(END.into());
    a.push(path.into());
    a
}

/// Whether git's refusal is the one `--force` gets past: the dirty-worktree
/// hint, "'<path>' contains modified or untracked files, use --force to delete
/// it".
///
/// Nothing else matches on purpose. A locked worktree says `remove -f -f` — two
/// of them, and unlocking is the answer we offer instead — and every other
/// failure (a path that is not a worktree, a broken link) is not a refusal to
/// re-offer at all. The runner pins `LC_ALL=C`, so the message is always git's
/// own English.
pub fn force_would_help(stderr: &str) -> bool {
    stderr.contains("use --force")
}

/// `worktree prune -v` (`-v` so the output names what it removed).
pub fn worktree_prune() -> Vec<String> {
    args(["worktree", "prune", "-v"])
}

/// `worktree lock [--reason <r>] --end-of-options <path>`
pub fn worktree_lock(path: &str, reason: Option<&str>) -> Vec<String> {
    let mut a = args(["worktree", "lock"]);
    if let Some(r) = reason {
        a.push("--reason".into());
        a.push(r.into());
    }
    a.push(END.into());
    a.push(path.into());
    a
}

/// `worktree unlock --end-of-options <path>`
pub fn worktree_unlock(path: &str) -> Vec<String> {
    let mut a = args(["worktree", "unlock", END]);
    a.push(path.into());
    a
}

/// `submodule update --init --recursive --progress [-- <path>]` — `--` rather
/// than [`END`]: `git submodule` is not reliably a parse-options builtin (it is
/// still a shell script on plenty of builds) and rejects `--end-of-options`.
/// The path goes as `:(literal)<path>`: `git submodule update` ignores
/// `--literal-pathspecs` and `GIT_LITERAL_PATHSPECS` both (git 2.55), so with
/// `subs/[ab]` and `subs/a` side by side it updated the wrong one.
pub fn submodule_update(path: Option<&str>) -> Vec<String> {
    let mut a = args(["submodule", "update", "--init", "--recursive", "--progress"]);
    if let Some(p) = path {
        a.push("--".into());
        // A submodule's path, not a pattern: see `stage::discard_paths`.
        a.push(format!(":(literal){p}"));
    }
    a
}

/// Paths of the conflicted entries of a status (sorted, as `status()` is).
pub fn parse_conflicts(status: &WorkdirStatus) -> Vec<String> {
    status
        .entries
        .iter()
        .filter(|e| e.conflicted)
        .map(|e| e.path.clone())
        .collect()
}

/// Path from a `CONFLICT (...)` line: `CONFLICT (content): Merge conflict in
/// <path>` or `CONFLICT (modify/delete): <path> deleted in ...`.
fn conflict_path(line: &str) -> Option<String> {
    let rest = line.strip_prefix("CONFLICT (")?;
    let close = rest.find("): ")?;
    let (kind, rest) = (&rest[..close], &rest[close + 3..]);
    let path = if kind == "modify/delete" {
        // `<path> deleted in <ref> and modified in <ref>. Version ...`: the
        // path can contain spaces, so it ends at the marker, not at a space,
        // and the period there ends git's sentence, not the name. Other kinds
        // put the markers mid-sentence (`renamed to <new> in <ref>, but
        // deleted in <ref>`), where they are not the end of the path.
        let path = match [" deleted in ", " added in "]
            .iter()
            .filter_map(|m| rest.find(m))
            .min()
        {
            Some(i) => &rest[..i],
            None => rest.split(' ').next().unwrap_or(rest),
        }
        .trim();
        path.strip_suffix('.').unwrap_or(path)
    } else {
        match rest.find("conflict in ") {
            Some(i) => &rest[i + "conflict in ".len()..],
            None => rest.split(' ').next().unwrap_or(rest),
        }
        .trim()
    };
    (!path.is_empty()).then(|| path.to_string())
}

const AUTH_PATTERNS: &[&str] = &[
    "Authentication failed",
    "could not read Username",
    "could not read Password",
    "terminal prompts disabled",
    "Permission denied (publickey",
    "Host key verification failed",
    "authentication failed",
];

const NON_FF_PATTERNS: &[&str] = &["non-fast-forward", "(fetch first)"];

const DIVERGED_PATTERNS: &[&str] = &[
    "Not possible to fast-forward",
    "not possible to fast-forward",
];

const CONFLICT_HINTS: &[&str] = &[
    "Automatic merge failed",
    "fix conflicts and then",
    "Resolve all conflicts manually",
    "could not apply",
];

/// Classifies a non-zero exit from its output. `stdout` matters for merge /
/// rebase / pull, whose `CONFLICT` lines go there; everything else is on
/// `stderr`.
pub fn classify_failure(code: i32, stdout: &str, stderr: &str) -> OpFailure {
    let mut paths: Vec<String> = stdout
        .lines()
        .chain(stderr.lines())
        .filter_map(|l| conflict_path(l.trim()))
        .collect();
    paths.sort();
    paths.dedup();
    if !paths.is_empty()
        || CONFLICT_HINTS
            .iter()
            .any(|p| stdout.contains(p) || stderr.contains(p))
    {
        return OpFailure::Conflicts { paths };
    }
    if AUTH_PATTERNS.iter().any(|p| stderr.contains(p)) {
        return OpFailure::AuthFailed;
    }
    if NON_FF_PATTERNS.iter().any(|p| stderr.contains(p)) {
        return OpFailure::NonFastForward;
    }
    if DIVERGED_PATTERNS.iter().any(|p| stderr.contains(p)) {
        return OpFailure::Diverged;
    }
    if let Some(line) = stderr
        .lines()
        .map(str::trim)
        .find(|l| l.starts_with("! [rejected]") || l.starts_with("! [remote rejected]"))
    {
        return OpFailure::Rejected {
            message: line.to_string(),
        };
    }
    // Without a `fatal:` / `error:` line git is giving advice, and advice leads with the headline
    // ("The previous cherry-pick is now empty…") and ends with a hint ("Otherwise, please use…").
    let message = stderr
        .lines()
        .map(str::trim)
        .rfind(|l| l.starts_with("fatal:") || l.starts_with("error:"))
        .or_else(|| stderr.lines().map(str::trim).find(|l| !l.is_empty()))
        .map(String::from)
        .unwrap_or_else(|| format!("git exited with code {code}"));
    OpFailure::Other { message }
}

/// Refuses argv that would need a terminal, before anything runs. The rule,
/// mirrored exactly by `interactiveFlag` in `src/lib/argv.ts`:
/// - tokens are scanned up to the first `--` (what follows are pathspecs);
/// - the token right after `-m`, `-F`, `--message` or `--file` is a value
///   and is skipped (`commit -m -p` is a message);
/// - a bundle of short flags (`-[A-Za-z]{2,}`) is treated as its letters,
///   each as `-x` (`add -ip` is `-i -p`; `checkout -pb x` is `-p -b`);
/// - `--interactive` anywhere, `-i` for add / rebase / clean / stash, and
///   `-p` / `--patch` for add / reset / checkout / restore / stash / commit
///   are refused.
///
/// An empty argv is refused too.
pub fn check_custom_args(args: &[String]) -> Result<(), String> {
    let cmd = args
        .first()
        .map(String::as_str)
        .ok_or_else(|| "Type a git command, e.g. status".to_string())?;
    let flag_i = matches!(cmd, "add" | "rebase" | "clean" | "stash");
    let flag_p = matches!(
        cmd,
        "add" | "reset" | "checkout" | "restore" | "stash" | "commit"
    );
    let interactive = |flag: &str| match flag {
        "--interactive" => true,
        "-i" => flag_i,
        "-p" | "--patch" => flag_p,
        _ => false,
    };
    let mut skip = false;
    for a in args.iter().take_while(|a| a.as_str() != "--") {
        if std::mem::replace(&mut skip, false) {
            continue;
        }
        if matches!(a.as_str(), "-m" | "-F" | "--message" | "--file") {
            skip = true;
            continue;
        }
        let bundle = a
            .strip_prefix('-')
            .filter(|l| l.len() >= 2 && l.bytes().all(|b| b.is_ascii_alphabetic()));
        let refused = match bundle {
            Some(letters) => letters
                .bytes()
                .any(|b| interactive(&format!("-{}", b as char))),
            None => interactive(a),
        };
        if refused {
            return Err(format!(
                "{a} needs a terminal; interactive mode is not supported here"
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::status::StatusEntry;

    #[test]
    fn fetch_args() {
        assert_eq!(fetch(None, false, false), ["fetch", "--progress", "--all"]);
        assert_eq!(
            fetch(Some("origin"), true, true),
            [
                "fetch",
                "--progress",
                "--prune",
                "--tags",
                "--end-of-options",
                "origin"
            ]
        );
    }

    #[test]
    fn tag_annotated_args() {
        assert_eq!(
            tag_annotated("v1.0", "HEAD", std::path::Path::new("msg.txt")),
            [
                "tag",
                "-a",
                "-F",
                "msg.txt",
                "--end-of-options",
                "v1.0",
                "HEAD"
            ]
        );
    }

    #[test]
    fn pull_args() {
        assert_eq!(
            pull(None, Some("ignored"), PullMode::Merge),
            ["pull", "--progress", "--no-rebase"]
        );
        assert_eq!(
            pull(Some("origin"), None, PullMode::Rebase),
            [
                "pull",
                "--progress",
                "--rebase",
                "--end-of-options",
                "origin"
            ]
        );
        assert_eq!(
            pull(Some("origin"), Some("main"), PullMode::FfOnly),
            [
                "pull",
                "--progress",
                "--ff-only",
                "--end-of-options",
                "origin",
                "main"
            ]
        );
    }

    #[test]
    fn push_args() {
        assert_eq!(
            push("origin", None, false, false, false),
            ["push", "--progress", "origin"]
        );
        assert_eq!(
            push("origin", Some("main:main"), true, true, true),
            [
                "push",
                "--progress",
                "-u",
                "--force-with-lease",
                "--tags",
                "origin",
                "--end-of-options",
                "main:main"
            ]
        );
    }

    #[test]
    fn ls_remote_tags_args_and_parse() {
        assert_eq!(
            ls_remote_tags("origin"),
            ["ls-remote", "--tags", "--end-of-options", "origin"]
        );
        let tag = |name: &str, oid: &str| RemoteTag {
            name: name.into(),
            oid: oid.into(),
        };
        // `v1.0` is annotated: the tag object first, its commit on the `^{}` line (which sorts
        // after `refs/tags/v1.0.1`, so the two lines of one tag are not always adjacent).
        let stdout = "aaa\trefs/tags/v1.0\nddd\trefs/tags/v1.0.1\nbbb\trefs/tags/v1.0^{}\nccc\trefs/tags/rc/2\neee\trefs/heads/main\nnot a ref line\n";
        assert_eq!(
            parse_ls_remote_tags(stdout),
            [tag("rc/2", "ccc"), tag("v1.0", "bbb"), tag("v1.0.1", "ddd")]
        );
        assert!(parse_ls_remote_tags("").is_empty());
    }

    #[test]
    fn reset_args() {
        assert_eq!(
            reset(ResetMode::Soft, "abc1234"),
            ["reset", "--soft", "--end-of-options", "abc1234"]
        );
        assert_eq!(
            reset(ResetMode::Mixed, "abc1234"),
            ["reset", "--mixed", "--end-of-options", "abc1234"]
        );
        assert_eq!(
            reset(ResetMode::Hard, "abc1234"),
            ["reset", "--hard", "--end-of-options", "abc1234"]
        );
        assert_eq!(
            branch_force("feature", "origin/feature"),
            [
                "branch",
                "-f",
                "--end-of-options",
                "feature",
                "origin/feature"
            ]
        );
    }

    #[test]
    fn merge_and_rebase_args() {
        assert_eq!(
            merge("feat", &MergeOpts::default()),
            ["merge", "--ff", "--end-of-options", "feat"]
        );
        assert_eq!(
            merge(
                "feat",
                &MergeOpts {
                    ff: FfMode::No,
                    squash: true,
                    message: Some("msg here".into()),
                }
            ),
            [
                "merge",
                "--no-ff",
                "--squash",
                "-m",
                "msg here",
                "--end-of-options",
                "feat"
            ]
        );
        assert_eq!(
            merge(
                "feat",
                &MergeOpts {
                    ff: FfMode::Only,
                    ..Default::default()
                }
            ),
            ["merge", "--ff-only", "--end-of-options", "feat"]
        );
        assert_eq!(rebase("main"), ["rebase", "--end-of-options", "main"]);
        assert_eq!(rebase_continue(), ["rebase", "--continue"]);
        assert_eq!(rebase_abort(), ["rebase", "--abort"]);
        assert_eq!(rebase_skip(), ["rebase", "--skip"]);
        assert_eq!(merge_abort(), ["merge", "--abort"]);
    }

    #[test]
    fn cherry_pick_and_revert_args() {
        assert_eq!(
            cherry_pick("abc1234", &PickOpts::default()),
            ["cherry-pick", "--end-of-options", "abc1234"]
        );
        assert_eq!(
            cherry_pick(
                "abc1234",
                &PickOpts {
                    no_commit: true,
                    record_origin: true,
                    mainline: Some(2),
                }
            ),
            [
                "cherry-pick",
                "-n",
                "-x",
                "-m",
                "2",
                "--end-of-options",
                "abc1234"
            ]
        );
        assert_eq!(
            revert("abc1234", &PickOpts::default()),
            ["revert", "--no-edit", "--end-of-options", "abc1234"]
        );
        // `-x` has no revert equivalent: it is ignored, `-n` and `-m` are not.
        assert_eq!(
            revert(
                "abc1234",
                &PickOpts {
                    no_commit: true,
                    record_origin: true,
                    mainline: Some(1),
                }
            ),
            [
                "revert",
                "--no-edit",
                "-n",
                "-m",
                "1",
                "--end-of-options",
                "abc1234"
            ]
        );
        assert_eq!(cherry_pick_abort(), ["cherry-pick", "--abort"]);
        assert_eq!(revert_abort(), ["revert", "--abort"]);
    }

    #[test]
    fn bisect_args() {
        assert_eq!(bisect_start(), ["bisect", "start"]);
        assert_eq!(bisect_reset(), ["bisect", "reset"]);
        // No oid = HEAD, which is what the banner's buttons send.
        assert_eq!(bisect_mark(BisectTerm::Good, None), ["bisect", "good"]);
        assert_eq!(bisect_mark(BisectTerm::Skip, None), ["bisect", "skip"]);
        // No `--end-of-options`: `git bisect` rejects it.
        assert_eq!(
            bisect_mark(BisectTerm::Bad, Some("abc1234")),
            ["bisect", "bad", "abc1234"]
        );
    }

    #[test]
    fn checkout_and_branch_args() {
        assert_eq!(
            checkout("main", None, true, false),
            ["checkout", "--end-of-options", "main"]
        );
        assert_eq!(
            checkout("v1.0", None, false, true),
            ["checkout", "--detach", "--end-of-options", "v1.0"]
        );
        assert_eq!(
            checkout("origin/x", Some("x"), false, false),
            ["checkout", "-b", "x", "--end-of-options", "origin/x"]
        );
        assert_eq!(
            checkout("origin/x", Some("x"), true, false),
            [
                "checkout",
                "--track",
                "-b",
                "x",
                "--end-of-options",
                "origin/x"
            ]
        );
        // `-b` wins: git refuses the two together.
        assert_eq!(
            checkout("origin/x", Some("x"), false, true),
            ["checkout", "-b", "x", "--end-of-options", "origin/x"]
        );
        assert_eq!(
            delete_remote_branch("origin", "old"),
            ["push", "origin", "--delete", "--end-of-options", "old"]
        );
    }

    #[test]
    fn stash_and_clone_args() {
        assert_eq!(stash_push(None, false, false), ["stash", "push"]);
        assert_eq!(
            stash_push(Some("wip"), true, true),
            ["stash", "push", "-u", "-k", "-m", "wip"]
        );
        assert_eq!(stash_apply(2), ["stash", "apply", "stash@{2}"]);
        assert_eq!(stash_pop(0), ["stash", "pop", "stash@{0}"]);
        assert_eq!(stash_drop(1), ["stash", "drop", "stash@{1}"]);
        assert_eq!(stash_clear(), ["stash", "clear"]);
        assert_eq!(
            clone("u", "d", &CloneOpts::default()),
            ["clone", "--progress", "--end-of-options", "u", "d"]
        );
        assert_eq!(
            clone(
                "u",
                "d",
                &CloneOpts {
                    recurse_submodules: true,
                    depth: Some(1),
                }
            ),
            [
                "clone",
                "--progress",
                "--recurse-submodules",
                "--depth",
                "1",
                "--end-of-options",
                "u",
                "d"
            ]
        );
    }

    #[test]
    fn worktree_and_submodule_args() {
        assert_eq!(
            worktree_add("/w/feat", WorktreeBranch::Existing("feat"), true),
            ["worktree", "add", "--end-of-options", "/w/feat", "feat"]
        );
        assert_eq!(
            worktree_add(
                "/w/feat",
                WorktreeBranch::New {
                    name: "feat",
                    start: None
                },
                false
            ),
            [
                "worktree",
                "add",
                "--no-checkout",
                "-b",
                "feat",
                "--end-of-options",
                "/w/feat"
            ]
        );
        assert_eq!(
            worktree_add(
                "/w/feat",
                WorktreeBranch::New {
                    name: "feat",
                    start: Some("origin/main")
                },
                true
            ),
            [
                "worktree",
                "add",
                "-b",
                "feat",
                "--end-of-options",
                "/w/feat",
                "origin/main"
            ]
        );
        assert_eq!(
            worktree_remove("/w/feat", false),
            ["worktree", "remove", "--end-of-options", "/w/feat"]
        );
        assert_eq!(
            worktree_remove("/w/feat", true),
            [
                "worktree",
                "remove",
                "--force",
                "--end-of-options",
                "/w/feat"
            ]
        );
        assert_eq!(worktree_prune(), ["worktree", "prune", "-v"]);
        assert_eq!(
            worktree_lock("/w/feat", None),
            ["worktree", "lock", "--end-of-options", "/w/feat"]
        );
        assert_eq!(
            worktree_lock("/w/feat", Some("busy")),
            [
                "worktree",
                "lock",
                "--reason",
                "busy",
                "--end-of-options",
                "/w/feat"
            ]
        );
        assert_eq!(
            worktree_unlock("/w/feat"),
            ["worktree", "unlock", "--end-of-options", "/w/feat"]
        );
        assert_eq!(
            submodule_update(None),
            ["submodule", "update", "--init", "--recursive", "--progress"]
        );
        assert_eq!(
            submodule_update(Some("vendor/dep")),
            [
                "submodule",
                "update",
                "--init",
                "--recursive",
                "--progress",
                "--",
                ":(literal)vendor/dep"
            ]
        );
    }

    /// Only the dirty-worktree refusal is worth re-offering forced; the locked
    /// one wants `remove -f -f`, which the app answers with Unlock instead.
    #[test]
    fn only_gits_dirty_worktree_hint_asks_for_force() {
        assert!(force_would_help(
            "fatal: '/w/feat' contains modified or untracked files, use --force to delete it"
        ));
        assert!(!force_would_help(
            "fatal: cannot remove a locked working tree, lock reason: on a stick\nuse 'remove -f -f' to override or unlock first"
        ));
        assert!(!force_would_help("fatal: '/w/feat' is not a working tree"));
    }

    #[test]
    fn conflicts_from_status_and_output() {
        let st = WorkdirStatus {
            entries: vec![
                StatusEntry {
                    path: "a.txt".into(),
                    old_path: None,
                    index: None,
                    workdir: None,
                    conflicted: true,
                    submodule: false,
                    submodule_dirty_only: false,
                    workdir_stamp: None,
                },
                StatusEntry {
                    path: "b.txt".into(),
                    old_path: None,
                    index: None,
                    workdir: Some(crate::diff::FileStatus::Modified),
                    conflicted: false,
                    submodule: false,
                    submodule_dirty_only: false,
                    workdir_stamp: None,
                },
            ],
            staged: 0,
            unstaged: 1,
            untracked: 0,
            conflicted: 1,
            state: crate::refs::RepoState::Merge,
        };
        assert_eq!(parse_conflicts(&st), ["a.txt"]);

        let stdout = "Auto-merging f.txt\nCONFLICT (content): Merge conflict in f.txt\n\
                      CONFLICT (add/add): Merge conflict in dir/g.txt\n\
                      CONFLICT (modify/delete): h.txt deleted in HEAD and modified in feat.\n\
                      Automatic merge failed; fix conflicts and then commit the result.\n";
        assert_eq!(
            classify_failure(1, stdout, ""),
            OpFailure::Conflicts {
                paths: vec!["dir/g.txt".into(), "f.txt".into(), "h.txt".into()]
            }
        );
        // Rebase reports the stop on stderr without a path list.
        let stderr =
            "error: could not apply 1234567... feat\nhint: Resolve all conflicts manually\n";
        assert_eq!(
            classify_failure(1, "", stderr),
            OpFailure::Conflicts { paths: vec![] }
        );
    }

    #[test]
    fn modify_delete_paths_keep_spaces_and_extensions() {
        let stdout =
            "CONFLICT (modify/delete): my notes.txt deleted in HEAD and modified in feat. \
                      Version feat of my notes.txt left in tree.\n\
                      CONFLICT (modify/delete): src/mod.d deleted in HEAD and added in feat.\n";
        assert_eq!(
            classify_failure(1, stdout, ""),
            OpFailure::Conflicts {
                paths: vec!["my notes.txt".into(), "src/mod.d".into()]
            }
        );
    }

    #[test]
    fn other_kinds_take_the_first_word_and_keep_a_trailing_period() {
        // The markers of `modify/delete` appear here too, mid-sentence.
        let rename = "CONFLICT (rename/delete): old.txt renamed to new.txt in feat, \
                      but deleted in HEAD.\n";
        assert_eq!(
            classify_failure(1, rename, ""),
            OpFailure::Conflicts {
                paths: vec!["old.txt".into()]
            }
        );
        // git ends this one without a period, so a final `.` is the name's.
        let content = "CONFLICT (content): Merge conflict in weird.\n";
        assert_eq!(
            classify_failure(1, content, ""),
            OpFailure::Conflicts {
                paths: vec!["weird.".into()]
            }
        );
    }

    #[test]
    fn non_fast_forward_and_diverged_patterns() {
        let push = "To /tmp/bare\n ! [rejected]        master -> master (fetch first)\n\
                    error: failed to push some refs to '/tmp/bare'\n";
        assert_eq!(classify_failure(1, "", push), OpFailure::NonFastForward);
        let push2 = " ! [rejected]        master -> master (non-fast-forward)\n";
        assert_eq!(classify_failure(1, "", push2), OpFailure::NonFastForward);
        let pull = "fatal: Not possible to fast-forward, aborting.\n";
        assert_eq!(classify_failure(128, "", pull), OpFailure::Diverged);
    }

    #[test]
    fn auth_patterns() {
        for s in [
            "fatal: Authentication failed for 'https://x/y.git/'\n",
            "fatal: could not read Username for 'https://x': terminal prompts disabled\n",
            "git@x: Permission denied (publickey).\nfatal: Could not read from remote repository.\n",
        ] {
            assert_eq!(classify_failure(128, "", s), OpFailure::AuthFailed, "{s}");
        }
    }

    #[test]
    fn rejected_and_other() {
        let stale =
            " ! [rejected]        main -> main (stale info)\nerror: failed to push some refs\n";
        assert_eq!(
            classify_failure(1, "", stale),
            OpFailure::Rejected {
                message: "! [rejected]        main -> main (stale info)".into()
            }
        );
        let remote = " ! [remote rejected] main -> main (pre-receive hook declined)\n";
        assert!(matches!(
            classify_failure(1, "", remote),
            OpFailure::Rejected { message } if message.contains("pre-receive")
        ));
        let other = "warning: x\nfatal: refusing to merge unrelated histories\n";
        assert_eq!(
            classify_failure(128, "", other),
            OpFailure::Other {
                message: "fatal: refusing to merge unrelated histories".into()
            }
        );
        assert_eq!(
            classify_failure(3, "", ""),
            OpFailure::Other {
                message: "git exited with code 3".into()
            }
        );
        // Advice without an error line: the headline, not the closing hint.
        let empty = "The previous cherry-pick is now empty, possibly due to conflict resolution.\nIf you wish to commit it anyway, use:\n\n    git commit --allow-empty\n\nOtherwise, please use 'git cherry-pick --skip'\n";
        assert_eq!(
            classify_failure(1, "", empty),
            OpFailure::Other {
                message:
                    "The previous cherry-pick is now empty, possibly due to conflict resolution."
                        .into()
            }
        );
    }

    #[test]
    fn failure_serde_shape() {
        let v = serde_json::to_value(OpFailure::Conflicts {
            paths: vec!["a".into()],
        })
        .unwrap();
        assert_eq!(
            v,
            serde_json::json!({ "kind": "conflicts", "paths": ["a"] })
        );
        assert_eq!(
            serde_json::to_value(OpFailure::Paused {
                message: "Stopped at abc1234...  A".into()
            })
            .unwrap(),
            serde_json::json!({ "kind": "paused", "message": "Stopped at abc1234...  A" })
        );
        assert_eq!(
            serde_json::to_value(OpFailure::NonFastForward).unwrap(),
            serde_json::json!({ "kind": "nonFastForward" })
        );
        assert_eq!(
            serde_json::to_value(OpFailure::Diverged).unwrap(),
            serde_json::json!({ "kind": "diverged" })
        );
        assert_eq!(
            serde_json::to_value(OpFailure::Rejected {
                message: "m".into()
            })
            .unwrap(),
            serde_json::json!({ "kind": "rejected", "message": "m" })
        );
        let mode: PullMode = serde_json::from_str("\"ffOnly\"").unwrap();
        assert_eq!(mode, PullMode::FfOnly);
        let ff: FfMode = serde_json::from_str("\"no\"").unwrap();
        assert_eq!(ff, FfMode::No);
    }

    #[test]
    fn custom_args_refuse_what_needs_a_terminal() {
        let v = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        for bad in [
            v(&["add", "-i"]),
            v(&["rebase", "--interactive", "main"]),
            v(&["add", "-p"]),
            v(&["stash", "push", "--patch"]),
            v(&["clean", "-i"]),
            v(&["add", "-ip"]),
            v(&["checkout", "-pb", "x"]),
            v(&[]),
        ] {
            assert!(check_custom_args(&bad).is_err(), "{bad:?}");
        }
        for ok in [
            v(&["status"]),
            v(&["commit", "-m", "x"]),
            v(&["add", "--", "-i"]),
            v(&["log", "-p"]),
            v(&["show", "-p", "HEAD"]),
            v(&["commit", "-i", "a.txt"]),
            v(&["commit", "-m", "-p"]),
            v(&["stash", "push", "-m", "--patch"]),
            v(&["commit", "--message", "-p"]),
            v(&["commit", "-F", "-p"]),
            v(&["commit", "--allow-empty-message", "-m", ""]),
        ] {
            assert!(check_custom_args(&ok).is_ok(), "{ok:?}");
        }
        assert_eq!(
            check_custom_args(&v(&["add", "-p"])).unwrap_err(),
            "-p needs a terminal; interactive mode is not supported here"
        );
        assert_eq!(
            check_custom_args(&v(&["add", "-ip"])).unwrap_err(),
            "-ip needs a terminal; interactive mode is not supported here"
        );
    }
}
