//! Working-directory status through `git status --porcelain=v2 -z`.
//!
//! libgit2's scan re-hashed every file whose stat data went stale (~5.5 ms
//! each: 552 s for 100k touched files) and wrote the refreshed index back,
//! which raised a second scan per edit; git's own status takes seconds. The
//! scan never takes the index lock (`GIT_OPTIONAL_LOCKS=0`): it can't undo an
//! op's index write or fail a terminal's `git add`, and T7's kill leaves no
//! lock behind. The stale stat cache is refreshed instead by a separate
//! `git update-index -q --refresh` after a slow scan ([`RepairRules`]).

use std::collections::HashMap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::io::AsyncReadExt;
use tokio::process::{ChildStderr, ChildStdout};
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

use crate::cli::runner::{display_cmd, git_command, spawn, ProcessTree, DRAIN_CAP, DRAIN_GRACE};
use crate::cli::GitCli;
use crate::diff::FileStatus;
use crate::refs::RepoState;
use crate::{map_git2, GitError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusEntry {
    /// Current path (`/`-separated, repo-relative).
    pub path: String,
    /// Old path of a staged rename (the index side; a working-tree rename
    /// is listed as a deletion plus an untracked file).
    pub old_path: Option<String>,
    /// HEAD → index change, `None` when nothing is staged.
    pub index: Option<FileStatus>,
    /// Index → working directory change, `None` when the workdir matches the index.
    pub workdir: Option<FileStatus>,
    pub conflicted: bool,
    /// A gitlink rather than a file — a submodule pointer, or an untracked
    /// nested repository. There is no discard for one (`submodule update` is
    /// the reset), so the frontend hides that action.
    pub submodule: bool,
    /// The gitlink's pointer is where the superproject wants it and only the
    /// checkout's own contents changed — nothing `git add` on the superproject
    /// can stage. `false` for everything else.
    pub submodule_dirty_only: bool,
    /// `<mtime ms>:<size>` of the file on disk, `None` when it isn't there (or has
    /// no working-tree side). The status letters say nothing about *content*: a
    /// file edited in an editor stays `modified`, and a conflict stays `conflicted`
    /// until it is staged, so this is what tells the UI its diff went stale.
    ///
    /// A gitlink is a directory, whose mtime and length say nothing about either
    /// side of it, so it carries the checkout's own HEAD oid instead — it moves
    /// with the pointer. A conflicted one has no such id and falls back to the
    /// directory stamp.
    pub workdir_stamp: Option<String>,
    /// The staged blob's oid, cut to 16 hex digits, `None` when nothing is
    /// staged or the index side has no blob (a staged deletion). The letters
    /// stay `modified` when a file is re-staged with new content, and a file
    /// staged whole has no workdir stamp, so this is what tells the UI its
    /// staged diff went stale.
    pub index_stamp: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkdirStatus {
    /// Sorted by `path`.
    pub entries: Vec<StatusEntry>,
    /// Entries with an `index` change.
    pub staged: u32,
    /// Entries with a tracked `workdir` change (not untracked).
    pub unstaged: u32,
    pub untracked: u32,
    pub conflicted: u32,
    /// The repository state this scan ran in (a `.git` read, not part of the scan).
    /// A status whose `state` disagrees with the current refs predates the change
    /// and says nothing about the new one — the UI has to wait for the next scan.
    pub state: RepoState,
    /// The paths that weren't UTF-8: the lossy `path` an entry carries → the
    /// bytes it was read from, so a path list built from the entries can name
    /// the file (see [`path_bytes`]). Backend only.
    #[serde(skip)]
    pub raw_paths: HashMap<String, Vec<u8>>,
}

/// `paths` as the bytes to diff by: each one `status` read from a non-UTF-8
/// path is swapped back for its raw bytes, the rest stay as they are (a path
/// no scan listed keeps its lossy bytes and matches no file).
pub fn path_bytes<'a>(paths: &'a [String], status: Option<&'a WorkdirStatus>) -> Vec<&'a [u8]> {
    paths
        .iter()
        .map(|p| {
            status
                .and_then(|s| s.raw_paths.get(p))
                .map_or(p.as_bytes(), Vec::as_slice)
        })
        .collect()
}

/// A scan whose git run took this long is taken for one that re-hashed stale
/// files, and starts the stat-cache repair (a warm scan of the largest tree
/// measured is well under it).
pub const REFRESH_AFTER: Duration = Duration::from_secs(1);

/// How long repairs stay off after the scan following one was still slow.
const BACK_OFF: Duration = Duration::from_secs(5 * 60);

/// When a scan starts the stat-cache repair (`git update-index -q --refresh`).
/// Pure: the caller hands in the scan's place in start order, its git run's
/// time and the instant, so the rules are tested with chosen values.
///
/// - Only a scan whose run took [`REFRESH_AFTER`] or more.
/// - No loop: a scan that started before the last repair ended, and the first
///   to start after it (the queued scan, the repair's own rescan), never do.
/// - Back-off: if that first scan after a repair is itself still slow, the tree
///   is slow for its size or its changes, not stale — repairs stop until a
///   scan comes in under [`REFRESH_AFTER`], or for [`BACK_OFF`] at most.
/// - Only a repair that exits 0 or 1 (unmerged entries, the refreshed index is
///   still written) is recorded; a failed one (128: a held `index.lock`; -1: a
///   signal; a spawn error) would otherwise switch repairs off on a stale tree.
#[derive(Debug, Default)]
pub struct RepairRules {
    /// How many scans had started when the last recorded repair ended.
    ended_at: Option<u64>,
    /// When the back-off began.
    backed_off: Option<Instant>,
}

impl RepairRules {
    /// Whether scan number `scan` (1-based, in start order), whose git run
    /// took `run`, should start a repair. A `true` changes nothing: a repair
    /// that then can't take `scan_lock` (an op, or a repair, holds it) is
    /// simply not started.
    pub fn should_repair(&mut self, scan: u64, run: Duration, now: Instant) -> bool {
        if run < REFRESH_AFTER {
            self.backed_off = None;
            return false;
        }
        if let Some(ended) = self.ended_at {
            if scan == ended + 1 {
                self.backed_off = Some(now);
                return false;
            }
            if scan <= ended {
                return false;
            }
        }
        match self.backed_off {
            Some(since) if now.duration_since(since) < BACK_OFF => false,
            _ => {
                self.backed_off = None;
                true
            }
        }
    }

    /// A repair ended with exit `code` once `scans` scans had started.
    pub fn record(&mut self, code: i32, scans: u64) {
        if matches!(code, 0 | 1) {
            self.ended_at = Some(scans);
        }
    }
}

/// What the gate hands the scan it runs.
pub struct ScanStart {
    /// The scan's place in start order (1-based), for [`RepairRules`].
    pub index: u64,
    /// Cancelled when the repository closes: the scan kills its git.
    pub cancel: CancellationToken,
}

/// One status scan at a time per repository, at most one queued behind it.
///
/// Every request takes a number, then waits for the gate (fair: first come,
/// first served). If the last finished scan started after the request was
/// numbered, its result answers it; otherwise the request runs a scan, which
/// answers every request numbered before it started. So no caller gets a
/// status older than its request, and a burst of watcher batches costs two
/// scans, not one each. Errors are not shared: the next waiter scans again.
#[derive(Default)]
pub struct ScanGate {
    requests: AtomicU64,
    /// Scans started, for the repair rules.
    starts: AtomicU64,
    /// The start number and result of the last finished scan.
    last: tokio::sync::Mutex<Option<(u64, Arc<WorkdirStatus>)>>,
    /// The last result, readable without waiting out a running scan.
    latest: parking_lot::Mutex<Option<Arc<WorkdirStatus>>>,
    /// The repository closed: the running scan is killed and no other starts.
    cancel: CancellationToken,
    repair: parking_lot::Mutex<RepairRules>,
}

impl ScanGate {
    /// The status as of now: `scan` runs only when no scan that started after
    /// this call has finished. [`GitError::Cancelled`] once the repository
    /// has closed.
    pub async fn run<F, Fut, E>(&self, scan: F) -> Result<Arc<WorkdirStatus>, E>
    where
        F: FnOnce(ScanStart) -> Fut,
        Fut: Future<Output = Result<WorkdirStatus, E>>,
        E: From<GitError>,
    {
        let n = self.requests.fetch_add(1, Ordering::SeqCst) + 1;
        let mut last = self.last.lock().await;
        if let Some((started, status)) = last.as_ref() {
            if *started >= n {
                return Ok(Arc::clone(status));
            }
        }
        if self.cancel.is_cancelled() {
            return Err(GitError::Cancelled.into());
        }
        let started = self.requests.load(Ordering::SeqCst);
        let index = self.starts.fetch_add(1, Ordering::SeqCst) + 1;
        let status = Arc::new(
            scan(ScanStart {
                index,
                cancel: self.cancel.clone(),
            })
            .await?,
        );
        *last = Some((started, Arc::clone(&status)));
        *self.latest.lock() = Some(Arc::clone(&status));
        Ok(status)
    }

    /// The last finished scan's result, `None` before the first.
    pub fn latest(&self) -> Option<Arc<WorkdirStatus>> {
        self.latest.lock().clone()
    }

    /// Kills the running scan and refuses the next (the repository closed).
    pub fn cancel(&self) {
        self.cancel.cancel();
    }

    /// [`RepairRules::should_repair`] for scan `index`, now.
    pub fn wants_repair(&self, index: u64, run: Duration) -> bool {
        self.repair.lock().should_repair(index, run, Instant::now())
    }

    /// [`RepairRules::record`] for a repair that just ended.
    pub fn repaired(&self, code: i32) {
        let scans = self.starts.load(Ordering::SeqCst);
        self.repair.lock().record(code, scans);
    }
}

/// `git status` as the scan runs it. `status.renames=true` overrides a user's
/// `status.renames` / `diff.renames` (`false`, or `copies`), so renames pair
/// and no copy (`C`) is printed; up to 3000 renames with new names pair (git's
/// default, 1000, pairs none of 3000 — and the search is quadratic). `-uall`
/// overrides `status.showUntrackedFiles`.
const STATUS_ARGS: &[&str] = &[
    "-c",
    "status.renames=true",
    "-c",
    "status.renameLimit=3000",
    "status",
    "--porcelain=v2",
    "-z",
    "-uall",
];

/// The working-tree status of `workdir`, from the configured git. Cancelling
/// `cancel` kills the git process tree and yields [`GitError::Cancelled`].
pub async fn scan(
    git: &GitCli,
    workdir: &Path,
    cancel: CancellationToken,
) -> Result<WorkdirStatus, GitError> {
    Ok(scan_timed(git, workdir, cancel).await?.0)
}

/// [`scan`], plus how long the git run alone took (not the state read nor
/// the parse): what the `slow status` line and [`RepairRules`] go by.
pub async fn scan_timed(
    git: &GitCli,
    workdir: &Path,
    cancel: CancellationToken,
) -> Result<(WorkdirStatus, Duration), GitError> {
    // Read before the scan, not after it: the stamp has to describe the tree this scan saw, so a
    // state change while it runs reads as a mismatch rather than as a match.
    let dir = workdir.to_path_buf();
    let state = blocking(move || {
        git2::Repository::open(&dir)
            .map(|r| RepoState::from(r.state()))
            .map_err(map_git2)
    })
    .await?;
    let t = Instant::now();
    let (code, out, stderr) = run_git(git.git_path(), workdir, cancel).await?;
    let elapsed = t.elapsed();
    if code != 0 {
        return Err(GitError::Cli {
            cmd: display_cmd(STATUS_ARGS),
            code,
            stderr: stderr.trim().to_string(),
        });
    }
    let dir = workdir.to_path_buf();
    let status = blocking(move || Ok(from_porcelain(&out, &dir, state))).await?;
    Ok((status, elapsed))
}

/// The stat-cache repair: `git update-index -q --refresh` rewrites the stat
/// data of every entry whose content didn't change, so the next scan compares
/// stat data only. Its index lock is not an optional one. Returns git's exit
/// code (1: unmerged entries, the index is still written).
pub async fn repair(git: &GitCli, workdir: &Path) -> Result<i32, GitError> {
    let out = git
        .run(
            workdir,
            "status-repair",
            &["update-index", "-q", "--refresh"],
            None,
            CancellationToken::new(),
            |_| {},
        )
        .await?;
    Ok(out.code)
}

/// [`scan`] for plain `#[test]`s: its own runtime, and `git` from `PATH`. A
/// `#[tokio::test]` awaits [`scan`] instead (a nested runtime panics).
#[cfg(any(test, feature = "test-util"))]
pub fn status(repo: &git2::Repository) -> Result<WorkdirStatus, GitError> {
    let workdir = repo
        .workdir()
        .ok_or_else(|| GitError::Io(std::io::Error::other("bare repository")))?;
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?
        .block_on(scan(&GitCli::new("git"), workdir, CancellationToken::new()))
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, GitError> + Send + 'static,
) -> Result<T, GitError> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| GitError::Io(std::io::Error::other(format!("status task failed: {e}"))))?
}

/// Runs the status git with its own stdout reader: the runner's line pump
/// rescans a `\n`-less buffer (all of `-z` output) and keeps 4 MB, where a
/// 100k-entry listing is ~10 MB. stderr is drained alongside, so warnings
/// can't fill its pipe, and kept for the error. Once git has exited, the pipes
/// get the runner's [`DRAIN_GRACE`] / [`DRAIN_CAP`]: a grandchild that keeps
/// one open (an fsmonitor hook starting its server) can't hold the scan.
async fn run_git(
    git_path: &str,
    workdir: &Path,
    cancel: CancellationToken,
) -> Result<(i32, Vec<u8>, String), GitError> {
    let mut cmd = git_command(git_path, workdir, STATUS_ARGS);
    cmd.stdin(Stdio::null());
    let mut child = spawn(&mut cmd)?;
    let tree = ProcessTree::attach(&child);
    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");
    let stop = CancellationToken::new();
    let read = Arc::new(Notify::new());
    let mut reader = tokio::spawn(read_both(stdout, stderr, stop.clone(), Arc::clone(&read)));
    let status = tokio::select! {
        exited = child.wait() => match exited {
            Ok(s) => s,
            // git's state is unknown: end it and its tree, and the reader.
            Err(e) => {
                tree.kill(&mut child);
                stop.cancel();
                return Err(e.into());
            }
        },
        _ = cancel.cancelled() => {
            tree.kill(&mut child);
            let _ = child.wait().await;
            stop.cancel();
            return Err(GitError::Cancelled);
        }
    };
    let exited = Instant::now();
    let (out, err) = loop {
        tokio::select! {
            r = &mut reader => break r.unwrap_or_default(),
            // Recreated each pass: the grace runs from the last read.
            _ = read.notified() => {}
            _ = tokio::time::sleep(DRAIN_GRACE) => stop.cancel(),
        }
        // A child that keeps writing never goes silent: the cap ends it anyway.
        if exited.elapsed() >= DRAIN_CAP {
            stop.cancel();
        }
    };
    Ok((
        status.code().unwrap_or(-1),
        out,
        String::from_utf8_lossy(&err).into_owned(),
    ))
}

/// Reads both pipes to EOF (or until `stop`), with no size cap.
async fn read_both(
    mut out: ChildStdout,
    mut err: ChildStderr,
    stop: CancellationToken,
    read: Arc<Notify>,
) -> (Vec<u8>, Vec<u8>) {
    let (mut o, mut e) = (Vec::new(), Vec::new());
    let (mut ob, mut eb) = (vec![0u8; 64 * 1024], vec![0u8; 8 * 1024]);
    let (mut o_done, mut e_done) = (false, false);
    while !(o_done && e_done) {
        tokio::select! {
            r = out.read(&mut ob), if !o_done => match r {
                Ok(0) | Err(_) => o_done = true,
                Ok(n) => o.extend_from_slice(&ob[..n]),
            },
            r = err.read(&mut eb), if !e_done => match r {
                Ok(0) | Err(_) => e_done = true,
                Ok(n) => e.extend_from_slice(&eb[..n]),
            },
            _ = stop.cancelled() => break,
        }
        read.notify_one();
    }
    (o, e)
}

/// `<mtime ms>:<size>` of a working-tree file — the pair git's own index cache
/// trusts to decide a file is unchanged. `None` when it cannot be read (deleted
/// on this side of a conflict).
fn stat_stamp(path: &Path) -> Option<String> {
    let meta = std::fs::metadata(path).ok()?;
    let ms = meta
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis();
    Some(format!("{ms}:{}", meta.len()))
}

/// The commit a submodule's checkout has out, `None` when it can't be read (a
/// deleted checkout, one replaced by a file) — which never fails the scan.
fn checkout_head(dir: &Path) -> Option<String> {
    let repo = git2::Repository::open(dir).ok()?;
    let head = repo.head().ok()?.target()?;
    Some(head.to_string())
}

/// A repository-relative path as printed, as an OS path (bytes on Unix, where
/// a name need not be UTF-8).
fn os_path(p: &[u8]) -> PathBuf {
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        PathBuf::from(std::ffi::OsStr::from_bytes(p))
    }
    #[cfg(not(unix))]
    {
        PathBuf::from(String::from_utf8_lossy(p).into_owned())
    }
}

/// One entry as `git status` printed it, before the disk is read for stamps.
#[derive(Debug, Default, PartialEq)]
struct Parsed<'a> {
    path: &'a [u8],
    old_path: Option<&'a [u8]>,
    index: Option<FileStatus>,
    workdir: Option<FileStatus>,
    conflicted: bool,
    submodule: bool,
    dirty_only: bool,
    /// `hI`, when the index side has a blob (or pointer).
    hi: Option<&'a [u8]>,
    /// A submodule whose working-tree side changed: its checkout's HEAD is
    /// the stamp, when it reads.
    checkout: bool,
    /// An untracked nested repository (`? x/`): no stamp.
    nested: bool,
}

/// An `X` / `Y` letter. A `C` can't occur (`status.renames=true`); any other
/// letter reads as Modified.
fn letter(c: u8) -> Option<FileStatus> {
    Some(match c {
        b'.' => return None,
        b'T' => FileStatus::Typechange,
        b'A' => FileStatus::Added,
        b'D' => FileStatus::Deleted,
        b'R' => FileStatus::Renamed,
        _ => FileStatus::Modified,
    })
}

/// The entries of `git status --porcelain=v2 -z` output, merged by path.
fn parse(out: &[u8]) -> Vec<Parsed<'_>> {
    let mut entries: Vec<Parsed<'_>> = Vec::new();
    // Working-tree rename origins (`.R`) and untracked paths, merged below.
    let (mut deleted, mut untracked) = (Vec::new(), Vec::new());
    let mut records = out.split(|b| *b == 0);
    while let Some(rec) = records.next() {
        let fields = |n: usize| {
            let f: Vec<&[u8]> = rec.splitn(n, |b| *b == b' ').collect();
            (f.len() == n).then_some(f)
        };
        match rec.first() {
            // `1 XY sub mH mI mW hH hI path`, `2 XY sub mH mI mW hH hI Xscore path\0orig`
            Some(&kind @ (b'1' | b'2')) => {
                let Some(f) = fields(if kind == b'2' { 10 } else { 9 }) else {
                    continue;
                };
                let origin = if kind == b'2' { records.next() } else { None };
                let &[x, y] = f[1] else { continue };
                let (sub, hi, path) = (f[2], f[7], f[f.len() - 1]);
                let submodule = sub.first() == Some(&b'S');
                let mut e = Parsed {
                    path,
                    index: letter(x),
                    workdir: letter(y),
                    submodule,
                    // Only the checkout's contents changed: nothing to stage.
                    dirty_only: submodule && y == b'M' && sub.get(1) == Some(&b'.'),
                    checkout: submodule && y != b'.',
                    hi: Some(hi).filter(|h| x != b'.' && h.iter().any(|b| *b != b'0')),
                    ..Parsed::default()
                };
                if x == b'R' {
                    e.old_path = origin;
                }
                if y == b'R' {
                    // git paired an intent-to-add file with a deleted one: two
                    // rows, as any working-tree rename.
                    e.workdir = Some(FileStatus::Added);
                    deleted.extend(origin);
                }
                entries.push(e);
            }
            // `u XY sub m1 m2 m3 mW h1 h2 h3 path`: counted only as conflicted.
            Some(b'u') => {
                let Some(f) = fields(11) else { continue };
                entries.push(Parsed {
                    path: f[10],
                    conflicted: true,
                    submodule: f[3..7].iter().any(|m| *m == b"160000"),
                    ..Parsed::default()
                });
            }
            Some(b'?') if rec.len() > 2 => untracked.push(&rec[2..]),
            // `#` headers (`status.showStash`), and anything unknown.
            _ => {}
        }
    }
    // One entry per path, as printed: the frontend looks entries up by path.
    let mut at: HashMap<&[u8], usize> = entries
        .iter()
        .enumerate()
        .map(|(i, e)| (e.path, i))
        .collect();
    for origin in deleted {
        match at.get(origin) {
            // The conflict row stands for that path.
            Some(&i) if entries[i].conflicted => {}
            Some(&i) => entries[i].workdir = Some(FileStatus::Deleted),
            None => {
                at.insert(origin, entries.len());
                entries.push(Parsed {
                    path: origin,
                    workdir: Some(FileStatus::Deleted),
                    ..Parsed::default()
                });
            }
        }
    }
    for path in untracked {
        match at.get(path) {
            // `git rm --cached` of a file kept on disk: `1 D.` plus `? path`.
            Some(&i) => entries[i].workdir = Some(FileStatus::Untracked),
            None => {
                let nested = path.ends_with(b"/");
                entries.push(Parsed {
                    path,
                    workdir: Some(FileStatus::Untracked),
                    submodule: nested,
                    nested,
                    ..Parsed::default()
                });
            }
        }
    }
    entries
}

/// The status of `workdir` from `git status --porcelain=v2 -z` output.
fn from_porcelain(out: &[u8], workdir: &Path, state: RepoState) -> WorkdirStatus {
    let mut st = WorkdirStatus {
        entries: Vec::new(),
        staged: 0,
        unstaged: 0,
        untracked: 0,
        conflicted: 0,
        state,
        raw_paths: HashMap::new(),
    };
    let hex = |h: &[u8]| String::from_utf8_lossy(h).into_owned();
    for p in parse(out) {
        let path = String::from_utf8_lossy(p.path).into_owned();
        if std::str::from_utf8(p.path).is_err() {
            st.raw_paths.insert(path.clone(), p.path.to_vec());
        }
        let on_disk = || workdir.join(os_path(p.path));
        let workdir_stamp = if p.nested {
            None
        } else if p.submodule && !p.conflicted {
            // The checkout's HEAD while the working-tree side changed, else the
            // staged pointer (an uninitialized submodule; a staged deletion has none).
            p.checkout
                .then(|| checkout_head(&on_disk()))
                .flatten()
                .or_else(|| p.hi.map(hex))
        } else if p.workdir.is_some() || p.conflicted {
            stat_stamp(&on_disk())
        } else {
            None
        };
        // 16 hex digits, not 40: the stamp only has to change when the blob does, and it rides on
        // every status read — tens of thousands of entries when a whole tree is staged.
        let index_stamp = p.hi.map(|h| hex(&h[..h.len().min(16)]));
        if p.index.is_some() {
            st.staged += 1;
        }
        match p.workdir {
            Some(FileStatus::Untracked) => st.untracked += 1,
            Some(_) => st.unstaged += 1,
            None => {}
        }
        if p.conflicted {
            st.conflicted += 1;
        }
        st.entries.push(StatusEntry {
            path,
            old_path: p.old_path.map(|o| String::from_utf8_lossy(o).into_owned()),
            index: p.index,
            workdir: p.workdir,
            conflicted: p.conflicted,
            submodule: p.submodule,
            submodule_dirty_only: p.dirty_only && !p.conflicted,
            workdir_stamp,
            index_stamp,
        });
    }
    st.entries.sort_by(|a, b| a.path.cmp(&b.path));
    st
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering::SeqCst};
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    use super::*;

    /// A status that says which scan made it.
    fn scan_no(n: u64) -> WorkdirStatus {
        WorkdirStatus {
            entries: Vec::new(),
            staged: n as u32,
            unstaged: 0,
            untracked: 0,
            conflicted: 0,
            state: RepoState::Clean,
            raw_paths: HashMap::new(),
        }
    }

    #[tokio::test]
    async fn eight_requests_at_once_run_at_most_two_scans() {
        let gate = Arc::new(ScanGate::default());
        let scans = Arc::new(AtomicU64::new(0));
        let mut set = tokio::task::JoinSet::new();
        for _ in 0..8 {
            let (gate, scans) = (Arc::clone(&gate), Arc::clone(&scans));
            set.spawn(async move {
                gate.run(|_| async {
                    let n = scans.fetch_add(1, SeqCst) + 1;
                    tokio::time::sleep(Duration::from_millis(50)).await;
                    Ok::<_, GitError>(scan_no(n))
                })
                .await
                .expect("scan")
                .staged
            });
        }
        let mut got = Vec::new();
        while let Some(r) = set.join_next().await {
            got.push(r.expect("task"));
        }
        assert_eq!(got.len(), 8);
        assert!(scans.load(SeqCst) <= 2, "{} scans", scans.load(SeqCst));
        assert_eq!(gate.latest().map(|s| s.staged), got.iter().max().copied());
    }

    #[tokio::test]
    async fn a_request_made_during_a_scan_gets_a_later_one() {
        let gate = ScanGate::default();
        let scans = AtomicU64::new(0);
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = tokio::sync::oneshot::channel::<()>();
        let first = gate.run(|_| async {
            let n = scans.fetch_add(1, SeqCst) + 1;
            started_tx.send(()).expect("started");
            release_rx.await.expect("release");
            Ok::<_, GitError>(scan_no(n))
        });
        let second = async {
            started_rx.await.expect("first scan running");
            let req =
                gate.run(|_| async { Ok::<_, GitError>(scan_no(scans.fetch_add(1, SeqCst) + 1)) });
            // `run` numbers the request on its first poll; the first scan ends after that.
            let (r, ()) = tokio::join!(req, async { release_tx.send(()).expect("release") });
            r
        };
        let (first, second) = tokio::join!(first, second);
        assert_eq!(first.expect("first").staged, 1);
        assert_eq!(
            second.expect("second").staged,
            2,
            "not the scan that was running"
        );
    }

    #[tokio::test]
    async fn a_closed_repository_starts_no_scan() {
        let gate = ScanGate::default();
        gate.cancel();
        let r = gate.run(|_| async { Ok::<_, GitError>(scan_no(1)) }).await;
        assert!(matches!(r, Err(GitError::Cancelled)), "{r:?}");
    }

    #[test]
    fn path_bytes_swaps_a_lossy_path_for_its_raw_bytes() {
        let mut st = scan_no(1);
        st.raw_paths
            .insert("caf\u{FFFD}.txt".into(), b"caf\xe9.txt".to_vec());
        let paths = vec!["a.txt".to_string(), "caf\u{FFFD}.txt".to_string()];
        assert_eq!(
            path_bytes(&paths, Some(&st)),
            vec![&b"a.txt"[..], &b"caf\xe9.txt"[..]]
        );
        // No scan yet: the lossy bytes go in as they are.
        assert_eq!(path_bytes(&paths, None)[1], "caf\u{FFFD}.txt".as_bytes());
    }

    const SLOW: Duration = REFRESH_AFTER;
    const FAST: Duration = Duration::from_millis(200);

    #[test]
    fn a_slow_scan_repairs_and_the_scans_around_the_repair_do_not() {
        let t0 = Instant::now();
        let mut r = RepairRules::default();
        assert!(!r.should_repair(1, FAST, t0));
        assert!(r.should_repair(2, SLOW, t0));
        // The repair ends once 4 scans have started: 3 and 4 (the queued one)
        // started before it ended, 5 (its rescan) is the first after. None repairs.
        r.record(0, 4);
        assert!(!r.should_repair(3, SLOW, t0));
        assert!(!r.should_repair(4, SLOW, t0));
        assert!(!r.should_repair(5, FAST, t0));
        // The tree went stale again later: repair.
        assert!(r.should_repair(6, SLOW, t0));
    }

    #[test]
    fn a_slow_scan_after_a_repair_backs_off_until_a_fast_one_or_five_minutes() {
        let t0 = Instant::now();
        let mut r = RepairRules::default();
        r.record(1, 4); // unmerged entries: still recorded
        assert!(!r.should_repair(5, SLOW, t0), "the first scan after");
        assert!(!r.should_repair(6, SLOW, t0 + Duration::from_secs(60)));
        assert!(!r.should_repair(7, FAST, t0 + Duration::from_secs(61)));
        assert!(
            r.should_repair(8, SLOW, t0 + Duration::from_secs(62)),
            "a fast scan ends it"
        );

        let mut r = RepairRules::default();
        r.record(0, 4);
        assert!(!r.should_repair(5, SLOW, t0));
        assert!(!r.should_repair(6, SLOW, t0 + BACK_OFF - Duration::from_secs(1)));
        assert!(
            r.should_repair(7, SLOW, t0 + BACK_OFF),
            "five minutes at most"
        );
    }

    #[test]
    fn a_failed_repair_records_nothing_and_a_skipped_one_changes_nothing() {
        let t0 = Instant::now();
        let mut r = RepairRules::default();
        // 128: a terminal's `index.lock`; -1: killed by a signal.
        r.record(128, 4);
        r.record(-1, 4);
        assert!(
            r.should_repair(5, SLOW, t0),
            "nothing recorded: no back-off"
        );
        // `scan_lock` was taken (an op, or a repair): the scan starts nothing and
        // records nothing, so the next slow scan asks again.
        assert!(r.should_repair(6, SLOW, t0));
    }

    type Row = (String, Option<FileStatus>, Option<FileStatus>, bool);

    fn rows(out: &str) -> Vec<Row> {
        let mut rows: Vec<Row> = parse(out.as_bytes())
            .iter()
            .map(|p| {
                (
                    String::from_utf8_lossy(p.path).into_owned(),
                    p.index,
                    p.workdir,
                    p.conflicted,
                )
            })
            .collect();
        rows.sort_by(|a, b| a.0.cmp(&b.0));
        rows
    }

    const Z: &str = "0000000000000000000000000000000000000000";
    const H: &str = "1111111111111111111111111111111111111111";

    fn row(path: &str, index: Option<FileStatus>, workdir: Option<FileStatus>) -> Row {
        (path.to_string(), index, workdir, false)
    }

    #[test]
    fn headers_and_unknown_lines_are_skipped() {
        let out = format!(
            "# stash 2\0! ignored.txt\0x what\01 .M N... 100644 100644 100644 {H} {H} a.txt\0"
        );
        assert_eq!(
            rows(&out),
            vec![row("a.txt", None, Some(FileStatus::Modified))]
        );
    }

    /// A `.R` (an intent-to-add file paired with a deleted one) is two rows;
    /// the origin's Deleted side merges into the origin's own entry, whichever
    /// side of the `.R` line it is printed on, and a conflict row keeps it.
    #[test]
    fn a_workdir_rename_origin_merges_into_its_own_entry() {
        let ita = format!("2 .R N... 000000 100644 100644 {Z} {Z} R100 b.txt\0a.txt\0");
        let m = format!("1 M. N... 100644 100644 100644 {H} {H} a.txt\0");
        let staged_mv = format!("2 R. N... 100644 100644 100644 {H} {H} R100 a.txt\0x.txt\0");
        let u = format!("u UU N... 100644 100644 100644 100644 {H} {H} {H} a.txt\0");
        let new = row("b.txt", None, Some(FileStatus::Added));

        for out in [format!("{m}{ita}"), format!("{ita}{m}")] {
            assert_eq!(
                rows(&out),
                vec![
                    row(
                        "a.txt",
                        Some(FileStatus::Modified),
                        Some(FileStatus::Deleted)
                    ),
                    new.clone(),
                ]
            );
        }
        assert_eq!(
            rows(&format!("{staged_mv}{ita}")),
            vec![
                row(
                    "a.txt",
                    Some(FileStatus::Renamed),
                    Some(FileStatus::Deleted)
                ),
                new.clone(),
            ]
        );
        assert_eq!(
            rows(&format!("{u}{ita}")),
            vec![("a.txt".to_string(), None, None, true), new.clone()]
        );
        // No line of its own: a plain working-tree deletion.
        assert_eq!(
            rows(&ita),
            vec![row("a.txt", None, Some(FileStatus::Deleted)), new]
        );
    }

    #[test]
    fn a_staged_rename_keeps_its_origin_and_index_blob() {
        let out = format!("2 R. N... 100644 100644 100644 {H} {H} R50 new.txt\0old.txt\0");
        let p = &parse(out.as_bytes())[0];
        assert_eq!(p.old_path, Some(&b"old.txt"[..]));
        assert_eq!(p.hi, Some(H.as_bytes()));
        assert_eq!((p.index, p.workdir), (Some(FileStatus::Renamed), None));
    }
}
