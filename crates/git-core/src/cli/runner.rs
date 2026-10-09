//! Streaming runner for the system `git` executable.
//!
//! Output is delivered while the process runs: `\n`-terminated segments become
//! [`CliEvent::Stdout`] / [`CliEvent::Stderr`], `\r`-terminated segments
//! (progress meters) become [`CliEvent::Progress`]. Lines are batched
//! ([`BATCH_LINES`] or [`BATCH_AGE`], whichever comes first) so a command that
//! prints millions of them costs the UI thousands of events, not millions, and
//! only the last [`MAX_RETAINED`] bytes of each stream are kept for the caller.
//! Cancelling the token kills the whole process tree (Job Object on Windows,
//! process group on Unix) so credential helpers, `ssh`, `git-remote-https` etc.
//! die with it.

use std::collections::VecDeque;
use std::path::Path;
use std::process::Stdio;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::{host_command, GitError};

/// Lines per batched event.
const BATCH_LINES: usize = 200;
/// How long a batch may wait for more lines before it is emitted.
const BATCH_AGE: Duration = Duration::from_millis(50);
/// How long the pipes may stay *silent* after git itself has exited before the
/// pumps are stopped. What git wrote is read within milliseconds unless the
/// emitter holds it (a full [`QUEUE_LINES`] queue); what is left is a child it
/// spawned that kept the handles (a hook's `daemon &`), and that can be hours.
/// Measured from the last line, not from the exit: a loaded machine still
/// draining git's own output is never cut short.
pub(crate) const DRAIN_GRACE: Duration = Duration::from_millis(500);
/// The most a child that keeps writing can add to an op after git exited.
/// git's own output still waiting behind a slow emitter (a full
/// [`QUEUE_LINES`] queue) is cut at it too.
pub(crate) const DRAIN_CAP: Duration = Duration::from_secs(5);
/// Lines queued between the pumps and the emitter: five [`BATCH_LINES`]
/// batches of slack. Counted in lines, as a line is as long as git makes it.
/// A full queue holds the pumps, and git then blocks on its write.
const QUEUE_LINES: usize = 1024;
/// Per-stream cap on the text handed back in [`CliOutput`]: everything before
/// the last of these bytes is dropped (and, for stdout, `stdout_truncated` is set).
const MAX_RETAINED: usize = 4 * 1024 * 1024;

/// One streamed event of a running git command.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum CliEvent {
    Started {
        op_id: String,
        cmd: String,
    },
    Stdout {
        lines: Vec<String>,
    },
    Stderr {
        lines: Vec<String>,
    },
    /// `\r`-terminated segments (progress meter redraws).
    Progress {
        lines: Vec<String>,
    },
    Exit {
        code: i32,
        elapsed_ms: u64,
    },
}

/// Collected result of a finished command. A non-zero `code` is not an error
/// here; see [`CliOutput::check`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CliOutput {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
    /// Stdout outgrew [`MAX_RETAINED`] and `stdout` is its tail only. A long
    /// stderr (progress, warnings) is cut the same way but doesn't set it, so
    /// it never makes a caller refuse a stdout that came through whole.
    pub stdout_truncated: bool,
}

impl CliOutput {
    /// Converts a non-zero exit into [`GitError::Cli`].
    pub fn check(&self, cmd: &str) -> Result<(), GitError> {
        if self.code == 0 {
            Ok(())
        } else {
            Err(GitError::Cli {
                cmd: cmd.to_string(),
                code: self.code,
                stderr: self.stderr.trim().to_string(),
            })
        }
    }

    /// [`check`](Self::check) for a command that may print a `warning:` per
    /// file (`LF will be replaced by CRLF`): those lines are dropped, so the
    /// error shows what failed. A held `index.lock` is [`GitError::IndexLocked`],
    /// as libgit2's is (`map_git2`), so the UI offers Retry either way — git's
    /// own "File exists" line, not the file name alone: a lock that cannot be
    /// created for any other reason (no permission, no space) is a real error
    /// with a real message, and retrying it changes nothing.
    pub fn check_quiet(&self, cmd: &str) -> Result<(), GitError> {
        if self.code == 0 {
            return Ok(());
        }
        if self.stderr.contains("index.lock': File exists") {
            return Err(GitError::IndexLocked);
        }
        let stderr: Vec<&str> = self
            .stderr
            .lines()
            .filter(|l| !l.starts_with("warning:"))
            .collect();
        Err(GitError::Cli {
            cmd: cmd.to_string(),
            code: self.code,
            stderr: stderr.join("\n").trim().to_string(),
        })
    }
}

/// The command line as shown to the user (`git …`) and logged: each argument
/// through [`redact_url`], so a `user:password@` never reaches the dock, an
/// error or the log; an argument with whitespace or a quote is double-quoted
/// the way a shell would want it, so `git stash push -m "wip: two words"`
/// reads as one message. Display only: git itself gets the argv as given.
pub fn display_cmd(args: &[&str]) -> String {
    let mut out = String::from("git");
    for a in args {
        let a = redact_url(a);
        out.push(' ');
        if a.is_empty()
            || a.chars()
                .any(|c| c.is_whitespace() || c == '"' || c == '\'')
        {
            out.push('"');
            out.push_str(&a.replace('"', "\\\""));
            out.push('"');
        } else {
            out.push_str(&a);
        }
    }
    out
}

/// `url` without its userinfo: `scheme://user:pass@host/x` → `scheme://host/x`.
/// An scp-style `git@host:path` or a local path has no `://` and is kept as
/// it is.
pub fn redact_url(url: &str) -> String {
    let Some(i) = url.find("://") else {
        return url.to_string();
    };
    let (scheme, rest) = url.split_at(i + 3);
    let host_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    match rest[..host_end].rfind('@') {
        Some(at) => format!("{scheme}{}", &rest[at + 1..]),
        None => url.to_string(),
    }
}

#[derive(Debug, Clone)]
pub struct GitCli {
    git_path: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    Stdout,
    Stderr,
    Progress,
}

impl Kind {
    fn event(self, lines: Vec<String>) -> CliEvent {
        match self {
            Kind::Stdout => CliEvent::Stdout { lines },
            Kind::Stderr => CliEvent::Stderr { lines },
            Kind::Progress => CliEvent::Progress { lines },
        }
    }
}

/// Lines waiting to go out as one event. One batch carries one kind.
#[derive(Default)]
struct Batch {
    kind: Option<Kind>,
    lines: Vec<String>,
    since: Option<Instant>,
}

impl Batch {
    fn push(&mut self, kind: Kind, line: String, on_event: &mut impl FnMut(CliEvent)) {
        if self.kind != Some(kind) {
            self.flush(on_event);
            self.kind = Some(kind);
            self.since = Some(Instant::now());
        }
        self.lines.push(line);
        let aged = self.since.is_some_and(|t| t.elapsed() >= BATCH_AGE);
        if self.lines.len() >= BATCH_LINES || aged {
            self.flush(on_event);
        }
    }

    fn flush(&mut self, on_event: &mut impl FnMut(CliEvent)) {
        if let Some(kind) = self.kind.take() {
            if !self.lines.is_empty() {
                on_event(kind.event(std::mem::take(&mut self.lines)));
            }
        }
        self.since = None;
    }
}

/// `git <args>` in `repo_dir` with every setting a git run gets here, so no
/// caller can drift from another: no prompt, no editor, `LC_ALL=C`, no
/// optional locks, piped stdout / stderr, killed with its handle, no console
/// window on Windows and its own session on Unix. stdin is the caller's.
pub(crate) fn git_command(git_path: &str, repo_dir: &Path, args: &[&str]) -> Command {
    let mut cmd = Command::from(host_command(git_path));
    cmd.args(args)
        .current_dir(repo_dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        // No tty to edit in: a command that wants a message (`commit`,
        // `tag -a`, `rebase --continue`) fails with "empty message"
        // instead of popping the user's editor or stalling until Cancel.
        .env("GIT_EDITOR", "true")
        // The env var beats `-c sequence.editor`, which is how the
        // interactive rebase hands git its todo list.
        .env_remove("GIT_SEQUENCE_EDITOR")
        .env("LC_ALL", "C")
        .env("GIT_FLUSH", "1")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    // Its own session, not just its own process group: with no controlling terminal, ssh
    // can't open the one the app was launched from (where it would be stopped as a
    // background group, and the op hang), so it goes to the askpass or fails at once.
    // Not alongside `process_group(0)`: std runs `setpgid` first, and `setsid` then
    // fails with EPERM for a group leader.
    #[cfg(unix)]
    {
        // SAFETY: `setsid` is one async-signal-safe syscall and takes no lock.
        unsafe {
            cmd.pre_exec(|| {
                if libc::setsid() == -1 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }
    cmd
}

/// Spawns `cmd`; a missing executable is [`GitError::GitNotFound`], a missing
/// working directory an `Io` error that names it.
pub(crate) fn spawn(cmd: &mut Command) -> Result<Child, GitError> {
    let e = match cmd.spawn() {
        Ok(c) => return Ok(c),
        Err(e) => e,
    };
    // A deleted repository folder fails the spawn with `NotFound` on Unix (the
    // child's `chdir`), which would read as a missing git, and with "directory
    // name is invalid" on Windows. Checked only after a failed spawn.
    if let Some(dir) = cmd.as_std().get_current_dir().filter(|d| !d.exists()) {
        return Err(GitError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("repository folder not found: {}", dir.display()),
        )));
    }
    if e.kind() == std::io::ErrorKind::NotFound {
        Err(GitError::GitNotFound)
    } else {
        Err(e.into())
    }
}

impl GitCli {
    pub fn new(git_path: impl Into<String>) -> Self {
        GitCli {
            git_path: git_path.into(),
        }
    }

    pub fn git_path(&self) -> &str {
        &self.git_path
    }

    /// Runs `git <args>` in `repo_dir`, streaming events to `on_event`.
    ///
    /// `op_id` is echoed in the `Started` event so callers can correlate the
    /// stream with the cancellation token they registered. `stdin` is closed
    /// after the bytes are written (null when `None`). Cancelling `cancel`
    /// kills the process tree and yields [`GitError::Cancelled`].
    pub async fn run(
        &self,
        repo_dir: &Path,
        op_id: &str,
        args: &[&str],
        stdin: Option<Vec<u8>>,
        cancel: CancellationToken,
        mut on_event: impl FnMut(CliEvent) + Send,
    ) -> Result<CliOutput, GitError> {
        let cmd_line = display_cmd(args);
        let started = Instant::now();

        let mut cmd = git_command(&self.git_path, repo_dir, args);
        cmd.stdin(if stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        });
        let mut child = spawn(&mut cmd)?;
        let tree = ProcessTree::attach(&child);
        // After the spawn, so a failed one leaves no dock row that never ends (its
        // error is the op's), and after the attach: on Windows a process git starts
        // before it joins the job escapes Cancel's tree kill.
        on_event(CliEvent::Started {
            op_id: op_id.to_string(),
            cmd: cmd_line.clone(),
        });
        tracing::debug!(op_id, cmd = %cmd_line, pid = ?child.id(), "spawned git");

        if let (Some(bytes), Some(mut pipe)) = (stdin, child.stdin.take()) {
            tokio::spawn(async move {
                // A broken pipe just means git stopped reading; its exit code tells the story.
                let _ = pipe.write_all(&bytes).await;
                let _ = pipe.shutdown().await;
            });
        }

        let (tx, mut rx) = mpsc::channel(QUEUE_LINES);
        let stdout = child.stdout.take().expect("stdout piped");
        let stderr = child.stderr.take().expect("stderr piped");
        let stop = CancellationToken::new();
        let out_task = tokio::spawn(pump(
            stdout,
            Kind::Stdout,
            tx.clone(),
            MAX_RETAINED,
            stop.clone(),
        ));
        let err_task = tokio::spawn(pump(stderr, Kind::Stderr, tx, MAX_RETAINED, stop.clone()));

        let mut cancelled = false;
        let mut status = None;
        let mut exited_at: Option<Instant> = None;
        let mut batch = Batch::default();
        loop {
            tokio::select! {
                ev = rx.recv() => match ev {
                    Some((kind, line)) => batch.push(kind, line, &mut on_event),
                    None => break,
                },
                // Recreated each iteration, so it measures the wait since the
                // last line: a stalled stream still gets its partial batch out.
                _ = tokio::time::sleep(BATCH_AGE), if !batch.lines.is_empty() => {
                    batch.flush(&mut on_event);
                }
                _ = cancel.cancelled(), if !cancelled => {
                    cancelled = true;
                    tracing::info!(op_id, "cancelling git command");
                    tree.kill(&mut child);
                }
                // Pipe EOF alone is not "git exited": a background child of a hook
                // inherits the handles and keeps them open.
                exited = child.wait(), if status.is_none() => {
                    // A failed wait leaves git's state unknown: end it and its tree,
                    // so the pipes close and the loop ends as after an exit.
                    if exited.is_err() {
                        tree.kill(&mut child);
                    }
                    status = Some(exited);
                    exited_at = Some(Instant::now());
                }
                // git is gone and nothing has come through for `DRAIN_GRACE` (the
                // sleep is recreated each iteration, like the batch one above):
                // whoever still holds the pipes is not git. The pumps return what
                // they have and the channel closes.
                _ = tokio::time::sleep(DRAIN_GRACE), if status.is_some() && !stop.is_cancelled() => {
                    stop.cancel();
                }
            }
            // A child that keeps *talking* never goes silent: the cap ends it anyway.
            if exited_at.is_some_and(|t| t.elapsed() >= DRAIN_CAP) {
                stop.cancel();
            }
        }
        batch.flush(&mut on_event);

        let status = match status {
            Some(s) => s,
            // Both pipes closed but git may still run: Cancel still ends it. The
            // wait goes first, so a git that exited as Cancel came reports its exit.
            None => {
                let exited = tokio::select! {
                    biased;
                    exited = child.wait() => exited,
                    _ = cancel.cancelled(), if !cancelled => {
                        cancelled = true;
                        tracing::info!(op_id, "cancelling git command");
                        tree.kill(&mut child);
                        child.wait().await
                    }
                };
                if exited.is_err() {
                    tree.kill(&mut child);
                }
                exited
            }
        };
        let (stdout, out_truncated) = out_task.await.unwrap_or_default();
        let (stderr, _) = err_task.await.unwrap_or_default();
        let code = status.as_ref().map_or(-1, |s| s.code().unwrap_or(-1));
        // Every way out after `Started` ends the dock row, a failed wait too.
        on_event(CliEvent::Exit {
            code,
            elapsed_ms: started.elapsed().as_millis() as u64,
        });
        if cancelled {
            return Err(GitError::Cancelled);
        }
        status?;
        tracing::debug!(op_id, code, elapsed = ?started.elapsed(), "git exited");
        Ok(CliOutput {
            code,
            stdout,
            stderr,
            stdout_truncated: out_truncated,
        })
    }
}

/// Reads a pipe to EOF, streaming segments; returns the last `limit` bytes of
/// the text and whether anything before them was dropped.
async fn pump<R: AsyncRead + Unpin>(
    mut r: R,
    kind: Kind,
    tx: mpsc::Sender<(Kind, String)>,
    limit: usize,
    stop: CancellationToken,
) -> (String, bool) {
    // A deque so dropping the head of a multi-gigabyte stream stays cheap.
    let mut all: VecDeque<u8> = VecDeque::new();
    let mut truncated = false;
    let mut pending = Vec::new();
    let mut buf = [0u8; 8192];
    'read: loop {
        let n = tokio::select! {
            read = r.read(&mut buf) => match read {
                Ok(0) | Err(_) => break,
                Ok(n) => n,
            },
            // git is gone and the grace is over: whoever still holds the pipe is not git.
            _ = stop.cancelled() => break,
        };
        all.extend(&buf[..n]);
        if all.len() > limit {
            all.drain(..all.len() - limit);
            truncated = true;
        }
        pending.extend_from_slice(&buf[..n]);
        // A full queue holds the pump here, and git blocks on its write. Once
        // `stop` is set, the rest of this read is dropped: it belongs to
        // whoever kept the pipe.
        for seg in drain(&mut pending, false, kind) {
            if stop.is_cancelled() || tx.send(seg).await.is_err() {
                break 'read;
            }
        }
    }
    // At most one unterminated line or a trailing `\r`, always sent: it can't
    // block for good, as the loop receives until every sender is dropped and
    // this pump still holds its own.
    for seg in drain(&mut pending, true, kind) {
        if tx.send(seg).await.is_err() {
            break;
        }
    }
    // The cut can land inside a multi-byte character; drop the continuation
    // bytes it left at the front so the tail starts on a character boundary
    // instead of a U+FFFD.
    while truncated && all.front().is_some_and(|b| b & 0b1100_0000 == 0b1000_0000) {
        all.pop_front();
    }
    (
        String::from_utf8_lossy(all.make_contiguous()).into_owned(),
        truncated,
    )
}

/// Splits `pending` into `\n` / `\r\n` lines and `\r` progress segments,
/// keeping an unterminated tail (or a trailing `\r` whose successor is unknown)
/// for the next read unless `eof`. Returns the segments it cut.
fn drain(pending: &mut Vec<u8>, eof: bool, kind: Kind) -> Vec<(Kind, String)> {
    let line = |bytes: &[u8]| (kind, String::from_utf8_lossy(bytes).into_owned());
    let progress = |bytes: &[u8]| (Kind::Progress, String::from_utf8_lossy(bytes).into_owned());

    let mut segs = Vec::new();
    let mut start = 0;
    let mut i = 0;
    while i < pending.len() {
        match pending[i] {
            b'\n' => {
                segs.push(line(&pending[start..i]));
                i += 1;
                start = i;
            }
            b'\r' => {
                if i + 1 < pending.len() {
                    if pending[i + 1] == b'\n' {
                        segs.push(line(&pending[start..i]));
                        i += 2;
                    } else {
                        if i > start {
                            segs.push(progress(&pending[start..i]));
                        }
                        i += 1;
                    }
                    start = i;
                } else if eof {
                    if i > start {
                        segs.push(progress(&pending[start..i]));
                    }
                    i += 1;
                    start = i;
                } else {
                    break;
                }
            }
            _ => i += 1,
        }
    }
    if eof && start < pending.len() {
        segs.push(line(&pending[start..]));
        start = pending.len();
    }
    pending.drain(..start);
    segs
}

/// Handle used to kill the spawned process and everything it spawned.
pub(crate) struct ProcessTree {
    #[cfg(windows)]
    job: Option<job::Job>,
    #[cfg(unix)]
    pgid: Option<i32>,
}

impl ProcessTree {
    #[cfg(windows)]
    pub(crate) fn attach(child: &Child) -> Self {
        let job = child
            .raw_handle()
            .and_then(|h| match job::Job::new().and_then(|j| j.assign(h).map(|_| j)) {
                Ok(j) => Some(j),
                Err(e) => {
                    tracing::warn!(error = %e, "job object unavailable; cancel will only kill git itself");
                    None
                }
            });
        ProcessTree { job }
    }

    #[cfg(unix)]
    pub(crate) fn attach(child: &Child) -> Self {
        ProcessTree {
            pgid: child.id().map(|p| p as i32),
        }
    }

    pub(crate) fn kill(&self, child: &mut Child) {
        #[cfg(windows)]
        if let Some(job) = &self.job {
            job.terminate();
            return;
        }
        #[cfg(unix)]
        if let Some(pgid) = self.pgid {
            // The child leads its own session (`setsid`), and so its own
            // group, whose id is its pid: this reaches every descendant
            // that hasn't called `setsid` itself.
            // SAFETY: plain libc call with a pgid we own.
            if unsafe { libc::kill(-pgid, libc::SIGKILL) } == 0 {
                return;
            }
        }
        if let Err(e) = child.start_kill() {
            tracing::warn!(error = %e, "failed to kill git process");
        }
    }
}

#[cfg(windows)]
mod job {
    use std::io;
    use std::os::windows::io::RawHandle;

    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, TerminateJobObject,
    };

    /// A Job Object the git process is assigned to right after spawn; its
    /// descendants inherit membership so `terminate` kills the whole tree.
    /// No limits at all: no kill-on-close (an app crash must not take a
    /// running `git` or a spawned `fsmonitor--daemon` down with it) and no
    /// breakaway — the MSYS runtime behind Git for Windows' `sh` (hooks,
    /// credential helpers) breaks away whenever the job allows it, which
    /// would leave those children alive after a cancel.
    pub struct Job(HANDLE);

    // SAFETY: a job handle is a kernel object usable from any thread.
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}

    impl Job {
        pub fn new() -> io::Result<Job> {
            // SAFETY: FFI with null security attributes / name (anonymous job).
            let h = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
            if h.is_null() {
                return Err(io::Error::last_os_error());
            }
            Ok(Job(h))
        }

        pub fn assign(&self, process: RawHandle) -> io::Result<()> {
            // SAFETY: both handles are valid for the duration of the call.
            if unsafe { AssignProcessToJobObject(self.0, process as HANDLE) } == 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        }

        pub fn terminate(&self) {
            // SAFETY: valid job handle; exit code 1 for every member.
            unsafe { TerminateJobObject(self.0, 1) };
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            // SAFETY: handle owned by this struct, closed once.
            unsafe { CloseHandle(self.0) };
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use super::*;
    use crate::test_util::TempRepo;

    fn have_git() -> bool {
        match crate::git_version("git") {
            Ok(_) => true,
            Err(GitError::GitNotFound) => {
                eprintln!("git not on PATH; skipping");
                false
            }
            Err(e) => panic!("git --version failed: {e}"),
        }
    }

    fn collect() -> (Arc<Mutex<Vec<CliEvent>>>, impl FnMut(CliEvent) + Send) {
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&events);
        (events, move |e| sink.lock().unwrap().push(e))
    }

    #[test]
    fn display_cmd_quotes_what_needs_it() {
        assert_eq!(
            display_cmd(&["fetch", "--prune", "origin"]),
            "git fetch --prune origin"
        );
        assert_eq!(
            display_cmd(&["stash", "push", "-m", "wip: two words", "--", ""]),
            "git stash push -m \"wip: two words\" -- \"\""
        );
        assert_eq!(
            display_cmd(&["commit", "-m", "say \"hi\""]),
            "git commit -m \"say \\\"hi\\\"\""
        );
    }

    #[test]
    fn display_cmd_drops_a_urls_credentials() {
        assert_eq!(
            display_cmd(&[
                "clone",
                "--end-of-options",
                "https://u:p@host/x.git",
                "C:/src/x"
            ]),
            "git clone --end-of-options https://host/x.git C:/src/x"
        );
        assert_eq!(
            display_cmd(&["clone", "git@github.com:u/x.git", "/home/u/x"]),
            "git clone git@github.com:u/x.git /home/u/x"
        );
    }

    #[test]
    fn redact_url_drops_userinfo_only() {
        for (url, shown) in [
            ("https://user:pass@host/u/x.git", "https://host/u/x.git"),
            ("https://user@host:8443/x", "https://host:8443/x"),
            // An `@` in the password, unescaped: the host starts after the last one.
            ("https://u:p@ss@host/x", "https://host/x"),
            ("ssh://git@host/x.git", "ssh://host/x.git"),
            // An `@` past the host is the path's, not userinfo.
            ("https://host/u/x@y.git", "https://host/u/x@y.git"),
            ("https://host", "https://host"),
            ("file:///C:/src/x", "file:///C:/src/x"),
            ("git@github.com:u/x.git", "git@github.com:u/x.git"),
            ("C:/src/x", "C:/src/x"),
            ("/home/u/x", "/home/u/x"),
        ] {
            assert_eq!(redact_url(url), shown, "{url}");
        }
    }

    #[test]
    fn drain_splits_lines_and_progress() {
        let mut got = Vec::new();
        let mut pending = b"a\nb\r\nc\rd\re".to_vec();
        got.extend(drain(&mut pending, false, Kind::Stderr));
        assert_eq!(pending, b"e");
        let mut pending2 = b"x\r".to_vec();
        assert!(drain(&mut pending2, false, Kind::Stderr).is_empty());
        assert_eq!(pending2, b"x\r", "trailing CR waits for the next byte");
        got.extend(drain(&mut pending2, true, Kind::Stderr));
        assert!(pending2.is_empty());
        let mut pending3 = b"tail".to_vec();
        got.extend(drain(&mut pending3, true, Kind::Stderr));
        assert!(pending3.is_empty(), "the emitted tail is consumed");
        let l = |s: &str| (Kind::Stderr, s.to_string());
        let p = |s: &str| (Kind::Progress, s.to_string());
        assert_eq!(got, vec![l("a"), l("b"), p("c"), p("d"), p("x"), l("tail")]);
    }

    #[test]
    fn batches_lines_by_count_and_kind() {
        let (events, mut sink) = collect();
        let mut batch = Batch::default();
        for i in 0..BATCH_LINES + 5 {
            batch.push(Kind::Stdout, format!("l{i}"), &mut sink);
        }
        batch.push(Kind::Stderr, "e".into(), &mut sink);
        batch.flush(&mut sink);
        let events = events.lock().unwrap();
        assert_eq!(events.len(), 3, "{events:?}");
        assert!(matches!(&events[0], CliEvent::Stdout { lines } if lines.len() == BATCH_LINES));
        assert!(matches!(&events[1], CliEvent::Stdout { lines } if lines.len() == 5));
        assert!(matches!(&events[2], CliEvent::Stderr { lines } if lines == &["e"]));
    }

    #[tokio::test]
    async fn pump_retains_only_the_tail_but_streams_every_line() {
        let data: Vec<u8> = (0..100u8)
            .flat_map(|i| format!("line {i}\n").into_bytes())
            .collect();
        let (tx, mut rx) = mpsc::channel(QUEUE_LINES);
        let (text, truncated) =
            pump(&data[..], Kind::Stdout, tx, 32, CancellationToken::new()).await;
        assert!(truncated);
        assert_eq!(text.len(), 32);
        assert!(data.ends_with(text.as_bytes()), "{text:?}");
        let mut lines = 0;
        while rx.try_recv().is_ok() {
            lines += 1;
        }
        assert_eq!(lines, 100, "every line is still streamed");

        let (tx, _rx) = mpsc::channel(QUEUE_LINES);
        let (text, truncated) = pump(
            &data[..],
            Kind::Stdout,
            tx,
            MAX_RETAINED,
            CancellationToken::new(),
        )
        .await;
        assert!(!truncated);
        assert_eq!(text.len(), data.len());
    }

    #[tokio::test]
    async fn a_tail_that_cuts_a_character_in_half_drops_its_leftover_bytes() {
        // 40 bytes of two-byte characters kept back to 15: the cut lands
        // between the halves of one of them.
        let data = "é".repeat(20).into_bytes();
        let (tx, _rx) = mpsc::channel(QUEUE_LINES);
        let (text, truncated) =
            pump(&data[..], Kind::Stdout, tx, 15, CancellationToken::new()).await;
        assert!(truncated);
        assert!(!text.contains('\u{FFFD}'), "{text:?}");
        assert_eq!(text, "é".repeat(7));
    }

    #[test]
    fn events_serialize_camel_case_tagged() {
        let json = serde_json::to_string(&CliEvent::Started {
            op_id: "op-1".into(),
            cmd: "git x".into(),
        })
        .unwrap();
        assert_eq!(json, r#"{"kind":"started","opId":"op-1","cmd":"git x"}"#);
        let json = serde_json::to_string(&CliEvent::Stdout {
            lines: vec!["a".into(), "b".into()],
        })
        .unwrap();
        assert_eq!(json, r#"{"kind":"stdout","lines":["a","b"]}"#);
        let json = serde_json::to_string(&CliEvent::Exit {
            code: 0,
            elapsed_ms: 5,
        })
        .unwrap();
        assert_eq!(json, r#"{"kind":"exit","code":0,"elapsedMs":5}"#);
    }

    #[tokio::test]
    async fn version_streams_one_line_and_exit() {
        if !have_git() {
            return;
        }
        let t = TempRepo::new();
        let (events, sink) = collect();
        let out = GitCli::new("git")
            .run(
                t.path(),
                "op-1",
                &["--version"],
                None,
                CancellationToken::new(),
                sink,
            )
            .await
            .expect("run");
        assert_eq!(out.code, 0);
        assert!(out.stdout.starts_with("git version"), "{:?}", out.stdout);
        let events = events.lock().unwrap();
        assert!(matches!(&events[0], CliEvent::Started { op_id, .. } if op_id == "op-1"));
        assert!(
            matches!(&events[1], CliEvent::Stdout { lines } if lines[0].starts_with("git version")),
            "{events:?}"
        );
        assert!(matches!(
            events.last(),
            Some(CliEvent::Exit { code: 0, .. })
        ));
        assert_eq!(events.len(), 3, "{events:?}");
    }

    /// The dock's `started` line carries no credentials; git still gets them.
    #[tokio::test]
    async fn the_started_line_drops_a_urls_credentials() {
        if !have_git() {
            return;
        }
        let t = TempRepo::new();
        let (events, sink) = collect();
        let out = GitCli::new("git")
            .run(
                t.path(),
                "op-r",
                &["-c", "t4.url=https://u:p@host/x", "config", "t4.url"],
                None,
                CancellationToken::new(),
                sink,
            )
            .await
            .expect("run");
        assert_eq!(out.stdout.trim(), "https://u:p@host/x");
        let events = events.lock().unwrap();
        assert!(
            matches!(&events[0], CliEvent::Started { cmd, .. } if cmd == "git -c t4.url=https://host/x config t4.url"),
            "{events:?}"
        );
    }

    #[tokio::test]
    async fn failure_reports_code_and_stderr() {
        if !have_git() {
            return;
        }
        let t = TempRepo::new();
        let (events, sink) = collect();
        let out = GitCli::new("git")
            .run(
                t.path(),
                "op-2",
                &["rev-parse", "--verify", "no-such-ref-xyz"],
                None,
                CancellationToken::new(),
                sink,
            )
            .await
            .expect("run");
        assert_ne!(out.code, 0);
        assert!(out.stderr.contains("fatal"), "{:?}", out.stderr);
        assert!(events.lock().unwrap().iter().any(
            |e| matches!(e, CliEvent::Stderr { lines } if lines.iter().any(|l| l.contains("fatal")))
        ));
        assert!(
            matches!(out.check("git rev-parse"), Err(GitError::Cli { code, .. }) if code == out.code)
        );
    }

    #[tokio::test]
    async fn stdin_is_delivered_and_closed() {
        if !have_git() {
            return;
        }
        let t = TempRepo::new();
        let out = GitCli::new("git")
            .run(
                t.path(),
                "op-3",
                &["hash-object", "--stdin"],
                Some(b"hello\n".to_vec()),
                CancellationToken::new(),
                |_| {},
            )
            .await
            .expect("run");
        assert_eq!(out.code, 0);
        assert_eq!(
            out.stdout.trim(),
            "ce013625030ba8dba906f756967f9e9ca394464a"
        );
    }

    #[tokio::test]
    async fn editor_is_disabled() {
        if !have_git() {
            return;
        }
        let t = TempRepo::new();
        let out = GitCli::new("git")
            .run(
                t.path(),
                "op-5",
                &["var", "GIT_EDITOR"],
                None,
                CancellationToken::new(),
                |_| {},
            )
            .await
            .expect("run");
        assert_eq!(out.stdout.trim(), "true", "{:?}", out.stderr);
    }

    #[tokio::test]
    async fn cancel_kills_long_running_process() {
        if !have_git() {
            return;
        }
        let t = TempRepo::new();
        // `git daemon` listens until killed. `--port=0` still binds git's default port 9418, so it
        // gets a port the OS just handed out and was let go.
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .and_then(|l| l.local_addr())
            .expect("free port")
            .port();
        let cancel = CancellationToken::new();
        let canceller = cancel.clone();
        let cancelled_at = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(300)).await;
            let at = Instant::now();
            canceller.cancel();
            at
        });
        let base = t.path().to_string_lossy().into_owned();
        let res = GitCli::new("git")
            .run(
                t.path(),
                "op-4",
                &[
                    "daemon",
                    "--listen=127.0.0.1",
                    &format!("--port={port}"),
                    &format!("--base-path={base}"),
                    "--export-all",
                    &base,
                ],
                None,
                cancel,
                |_| {},
            )
            .await;
        let done = Instant::now();
        assert!(matches!(res, Err(GitError::Cancelled)), "{res:?}");
        // Only cancel -> return is timed (the kill itself measured 3-11 ms).
        let elapsed = done - cancelled_at.await.expect("canceller");
        assert!(
            elapsed < Duration::from_millis(500),
            "cancel took {elapsed:?}"
        );
    }

    /// git runs in its own session, so ssh can't open the terminal the app was
    /// started from. The session id is field 6 of `/proc/self/stat`, read by a
    /// child of git's (`ps -o sid=` isn't everywhere).
    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn git_runs_in_its_own_session() {
        if !have_git() {
            return;
        }
        let t = TempRepo::new();
        let out = GitCli::new("git")
            .run(
                t.path(),
                "op-sid",
                &["-c", "alias.sid=!cut -d' ' -f6 /proc/self/stat", "sid"],
                None,
                CancellationToken::new(),
                |_| {},
            )
            .await
            .expect("run");
        assert_eq!(out.code, 0, "{:?}", out.stderr);
        let sid: i32 = out.stdout.trim().parse().expect("a session id");
        // SAFETY: plain libc call about this process.
        assert_ne!(sid, unsafe { libc::getsid(0) });
    }

    /// A hook that backgrounds a child without redirecting it leaves the pipe's
    /// write end open after git exits. The op used to last as long as that
    /// child — with the repo's op lock held the whole time.
    #[tokio::test]
    async fn a_background_child_holding_the_pipe_does_not_hold_the_op() {
        if !have_git() {
            return;
        }
        let t = TempRepo::new();
        let started = std::time::Instant::now();
        let out = GitCli::new("git")
            .run(
                t.path(),
                "op-bg",
                &["-c", "alias.bg=!sleep 12 & echo started", "bg"],
                None,
                CancellationToken::new(),
                |_| {},
            )
            .await
            .expect("run");
        assert_eq!(out.code, 0);
        assert!(out.stdout.contains("started"), "{:?}", out.stdout);
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "returned after {:?}",
            started.elapsed()
        );
    }

    #[tokio::test]
    async fn a_background_child_that_keeps_writing_is_cut_at_the_cap() {
        if !have_git() {
            return;
        }
        let t = TempRepo::new();
        let started = std::time::Instant::now();
        let alias =
            "alias.chat=!(for i in $(seq 1 100); do echo tick; sleep 0.1; done) & echo started";
        let out = GitCli::new("git")
            .run(
                t.path(),
                "op-chat",
                &["-c", alias, "chat"],
                None,
                CancellationToken::new(),
                |_| {},
            )
            .await
            .expect("run");
        assert_eq!(out.code, 0);
        assert!(
            started.elapsed() < Duration::from_secs(8),
            "returned after {:?}",
            started.elapsed()
        );
    }

    /// Past the cap on stderr alone, stdout is still whole.
    #[tokio::test]
    async fn a_long_stderr_does_not_mark_stdout_truncated() {
        if !have_git() {
            return;
        }
        let t = TempRepo::new();
        let alias = "alias.loud=!yes 0123456789012345678901234567890123456789 | head -c 5000000 >&2; echo ok";
        let out = GitCli::new("git")
            .run(
                t.path(),
                "op-loud",
                &["-c", alias, "loud"],
                None,
                CancellationToken::new(),
                |_| {},
            )
            .await
            .expect("run");
        assert_eq!(out.code, 0);
        assert!(!out.stdout_truncated);
        assert_eq!(out.stdout.trim(), "ok", "{:?}", out.stdout);
    }

    /// A spawn that fails leaves no dock row: `Started` comes after it.
    #[tokio::test]
    async fn a_failed_spawn_emits_no_events() {
        let t = TempRepo::new();
        let (events, sink) = collect();
        let res = GitCli::new("no-such-git-xyz")
            .run(
                t.path(),
                "op-ns",
                &["--version"],
                None,
                CancellationToken::new(),
                sink,
            )
            .await;
        assert!(matches!(res, Err(GitError::GitNotFound)), "{res:?}");
        assert!(events.lock().unwrap().is_empty());
    }

    /// A deleted repository folder is named, not reported as a missing git
    /// (Unix) or an invalid directory name (Windows).
    #[tokio::test]
    async fn a_missing_folder_is_named() {
        let t = TempRepo::new();
        let dir = t.path().join("gone");
        let res = GitCli::new("git")
            .run(
                &dir,
                "op-gone",
                &["status"],
                None,
                CancellationToken::new(),
                |_| {},
            )
            .await;
        let want = format!("repository folder not found: {}", dir.display());
        assert!(
            matches!(&res, Err(GitError::Io(e))
                if e.kind() == std::io::ErrorKind::NotFound && e.to_string() == want),
            "{res:?}"
        );
    }

    /// A pipe written past its buffer into a capacity-1 queue nobody reads.
    #[tokio::test]
    async fn a_full_queue_holds_the_pump() {
        let (mut w, r) = tokio::io::duplex(64);
        let (tx, _rx) = mpsc::channel(1);
        let _task = tokio::spawn(pump(
            r,
            Kind::Stdout,
            tx,
            MAX_RETAINED,
            CancellationToken::new(),
        ));
        let data = "line\n".repeat(10_000);
        let write =
            tokio::time::timeout(Duration::from_millis(200), w.write_all(data.as_bytes())).await;
        assert!(write.is_err(), "the writer was never held");
    }

    /// The same held pump, then `stop`.
    #[tokio::test]
    async fn stop_ends_a_held_pump() {
        let (mut w, r) = tokio::io::duplex(64);
        let (tx, mut rx) = mpsc::channel(1);
        let stop = CancellationToken::new();
        let mut task = tokio::spawn(pump(r, Kind::Stdout, tx, MAX_RETAINED, stop.clone()));
        let data = "line\n".repeat(10_000);
        let _ =
            tokio::time::timeout(Duration::from_millis(200), w.write_all(data.as_bytes())).await;
        stop.cancel();
        // `w` stays open: only `stop` can end the pump. What still comes is the
        // queued line, the held send and the read's unterminated tail; without
        // the check before each send, the rest of what was read would too.
        let mut after = 0;
        let ended = tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                tokio::select! {
                    r = &mut task => break r,
                    Some(_) = rx.recv() => after += 1,
                }
            }
        })
        .await;
        assert!(ended.is_ok(), "the pump didn't end");
        assert!(after <= 3, "{after} segments sent after stop");
        drop(w);
    }

    #[tokio::test]
    async fn a_slow_receiver_loses_nothing() {
        let data: String = (0..100_000).map(|i| format!("{i}\n")).collect();
        let (tx, mut rx) = mpsc::channel(16);
        let task = tokio::spawn(pump(
            std::io::Cursor::new(data.into_bytes()),
            Kind::Stdout,
            tx,
            MAX_RETAINED,
            CancellationToken::new(),
        ));
        let mut n = 0;
        while let Some((kind, line)) = rx.recv().await {
            assert_eq!((kind, line), (Kind::Stdout, n.to_string()));
            n += 1;
            if n % 1000 == 0 {
                tokio::time::sleep(Duration::from_millis(1)).await;
            }
        }
        assert_eq!(n, 100_000);
        task.await.expect("pump");
    }

    /// Backpressure holds git's own output in the pipe while the emitter is
    /// slow; `DRAIN_CAP` must not cut it at a realistic rate.
    #[tokio::test]
    async fn a_slow_emitter_loses_nothing() {
        if !have_git() {
            return;
        }
        let t = TempRepo::new();
        let next = Arc::new(Mutex::new(1u32));
        let seen = Arc::clone(&next);
        let out = GitCli::new("git")
            .run(
                t.path(),
                "op-slow",
                &["-c", "alias.count=!seq 1 200000", "count"],
                None,
                CancellationToken::new(),
                move |e| {
                    if let CliEvent::Stdout { lines } = e {
                        let mut n = seen.lock().unwrap();
                        for l in lines {
                            assert_eq!(l, n.to_string());
                            *n += 1;
                        }
                    }
                    // A stand-in for a slow `emit_to`.
                    std::thread::sleep(Duration::from_millis(1));
                },
            )
            .await
            .expect("run");
        assert_eq!(out.code, 0, "{:?}", out.stderr);
        assert_eq!(*next.lock().unwrap(), 200_001, "every line is streamed");
        assert!(out.stdout.ends_with("\n200000\n"), "stdout cut short");
    }

    /// Cancel still ends an op whose pumps are held on a full queue.
    #[tokio::test]
    async fn cancel_ends_an_op_with_a_full_queue() {
        if !have_git() {
            return;
        }
        let t = TempRepo::new();
        let cancel = CancellationToken::new();
        let canceller = cancel.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(300)).await;
            canceller.cancel();
        });
        let res = tokio::time::timeout(
            Duration::from_secs(5),
            GitCli::new("git").run(
                t.path(),
                "op-yes",
                &["-c", "alias.y=!yes", "y"],
                None,
                cancel,
                |_| std::thread::sleep(Duration::from_millis(5)),
            ),
        )
        .await
        .expect("cancel took over 5 s");
        assert!(matches!(res, Err(GitError::Cancelled)), "{res:?}");
    }
}
