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

use crate::GitError;

/// Lines per batched event.
const BATCH_LINES: usize = 200;
/// How long a batch may wait for more lines before it is emitted.
const BATCH_AGE: Duration = Duration::from_millis(50);
/// Per-stream cap on the text handed back in [`CliOutput`]: everything before
/// the last of these bytes is dropped and `truncated` is set.
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
    /// Output outgrew [`MAX_RETAINED`]; `stdout` / `stderr` are the tail only.
    pub truncated: bool,
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
}

/// The command line as shown to the user (`git …`): an argument with
/// whitespace or a quote is double-quoted the way a shell would want it, so
/// `git stash push -m "wip: two words"` reads as one message.
pub fn display_cmd(args: &[&str]) -> String {
    let mut out = String::from("git");
    for a in args {
        out.push(' ');
        if a.is_empty()
            || a.chars()
                .any(|c| c.is_whitespace() || c == '"' || c == '\'')
        {
            out.push('"');
            out.push_str(&a.replace('"', "\\\""));
            out.push('"');
        } else {
            out.push_str(a);
        }
    }
    out
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
        on_event(CliEvent::Started {
            op_id: op_id.to_string(),
            cmd: cmd_line.clone(),
        });

        let mut cmd = Command::new(&self.git_path);
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
            .stdin(if stdin.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        #[cfg(unix)]
        cmd.process_group(0);

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Err(GitError::GitNotFound)
            }
            Err(e) => return Err(e.into()),
        };
        let tree = ProcessTree::attach(&child);
        tracing::debug!(op_id, cmd = %cmd_line, pid = ?child.id(), "spawned git");

        if let (Some(bytes), Some(mut pipe)) = (stdin, child.stdin.take()) {
            tokio::spawn(async move {
                // A broken pipe just means git stopped reading; its exit code tells the story.
                let _ = pipe.write_all(&bytes).await;
                let _ = pipe.shutdown().await;
            });
        }

        let (tx, mut rx) = mpsc::unbounded_channel();
        let stdout = child.stdout.take().expect("stdout piped");
        let stderr = child.stderr.take().expect("stderr piped");
        let out_task = tokio::spawn(pump(stdout, Kind::Stdout, tx.clone(), MAX_RETAINED));
        let err_task = tokio::spawn(pump(stderr, Kind::Stderr, tx, MAX_RETAINED));

        let mut cancelled = false;
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
            }
        }
        batch.flush(&mut on_event);

        let status = child.wait().await?;
        let (stdout, out_truncated) = out_task.await.unwrap_or_default();
        let (stderr, err_truncated) = err_task.await.unwrap_or_default();
        let code = status.code().unwrap_or(-1);
        on_event(CliEvent::Exit {
            code,
            elapsed_ms: started.elapsed().as_millis() as u64,
        });
        if cancelled {
            return Err(GitError::Cancelled);
        }
        tracing::debug!(op_id, code, elapsed = ?started.elapsed(), "git exited");
        Ok(CliOutput {
            code,
            stdout,
            stderr,
            truncated: out_truncated || err_truncated,
        })
    }
}

/// Reads a pipe to EOF, streaming segments; returns the last `limit` bytes of
/// the text and whether anything before them was dropped.
async fn pump<R: AsyncRead + Unpin>(
    mut r: R,
    kind: Kind,
    tx: mpsc::UnboundedSender<(Kind, String)>,
    limit: usize,
) -> (String, bool) {
    // A deque so dropping the head of a multi-gigabyte stream stays cheap.
    let mut all: VecDeque<u8> = VecDeque::new();
    let mut truncated = false;
    let mut pending = Vec::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = match r.read(&mut buf).await {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        all.extend(&buf[..n]);
        if all.len() > limit {
            all.drain(..all.len() - limit);
            truncated = true;
        }
        pending.extend_from_slice(&buf[..n]);
        drain(&mut pending, false, kind, &tx);
    }
    drain(&mut pending, true, kind, &tx);
    (
        String::from_utf8_lossy(all.make_contiguous()).into_owned(),
        truncated,
    )
}

/// Splits `pending` into `\n` / `\r\n` lines and `\r` progress segments,
/// keeping an unterminated tail (or a trailing `\r` whose successor is unknown)
/// for the next read unless `eof`.
fn drain(pending: &mut Vec<u8>, eof: bool, kind: Kind, tx: &mpsc::UnboundedSender<(Kind, String)>) {
    let line = |bytes: &[u8]| (kind, String::from_utf8_lossy(bytes).into_owned());
    let progress = |bytes: &[u8]| (Kind::Progress, String::from_utf8_lossy(bytes).into_owned());

    let mut start = 0;
    let mut i = 0;
    while i < pending.len() {
        match pending[i] {
            b'\n' => {
                let _ = tx.send(line(&pending[start..i]));
                i += 1;
                start = i;
            }
            b'\r' => {
                if i + 1 < pending.len() {
                    if pending[i + 1] == b'\n' {
                        let _ = tx.send(line(&pending[start..i]));
                        i += 2;
                    } else {
                        if i > start {
                            let _ = tx.send(progress(&pending[start..i]));
                        }
                        i += 1;
                    }
                    start = i;
                } else if eof {
                    if i > start {
                        let _ = tx.send(progress(&pending[start..i]));
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
        let _ = tx.send(line(&pending[start..]));
        start = pending.len();
    }
    pending.drain(..start);
}

/// Handle used to kill the spawned process and everything it spawned.
struct ProcessTree {
    #[cfg(windows)]
    job: Option<job::Job>,
    #[cfg(unix)]
    pgid: Option<i32>,
}

impl ProcessTree {
    #[cfg(windows)]
    fn attach(child: &Child) -> Self {
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
    fn attach(child: &Child) -> Self {
        ProcessTree {
            pgid: child.id().map(|p| p as i32),
        }
    }

    fn kill(&self, child: &mut Child) {
        #[cfg(windows)]
        if let Some(job) = &self.job {
            job.terminate();
            return;
        }
        #[cfg(unix)]
        if let Some(pgid) = self.pgid {
            // The child is the group leader (`process_group(0)`), so this
            // reaches every descendant that hasn't called `setsid`.
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
    fn drain_splits_lines_and_progress() {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let mut pending = b"a\nb\r\nc\rd\re".to_vec();
        drain(&mut pending, false, Kind::Stderr, &tx);
        assert_eq!(pending, b"e");
        let mut pending2 = b"x\r".to_vec();
        drain(&mut pending2, false, Kind::Stderr, &tx);
        assert_eq!(pending2, b"x\r", "trailing CR waits for the next byte");
        drain(&mut pending2, true, Kind::Stderr, &tx);
        assert!(pending2.is_empty());
        let mut pending3 = b"tail".to_vec();
        drain(&mut pending3, true, Kind::Stderr, &tx);
        assert!(pending3.is_empty(), "the emitted tail is consumed");
        let mut got = Vec::new();
        while let Ok(e) = rx.try_recv() {
            got.push(e);
        }
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
        let (tx, mut rx) = mpsc::unbounded_channel();
        let (text, truncated) = pump(&data[..], Kind::Stdout, tx, 32).await;
        assert!(truncated);
        assert_eq!(text.len(), 32);
        assert!(data.ends_with(text.as_bytes()), "{text:?}");
        let mut lines = 0;
        while rx.try_recv().is_ok() {
            lines += 1;
        }
        assert_eq!(lines, 100, "every line is still streamed");

        let (tx, _rx) = mpsc::unbounded_channel();
        let (text, truncated) = pump(&data[..], Kind::Stdout, tx, MAX_RETAINED).await;
        assert!(!truncated);
        assert_eq!(text.len(), data.len());
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
        // `git daemon` listens until killed; port 0 lets the OS pick a free one.
        let cancel = CancellationToken::new();
        let canceller = cancel.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(300)).await;
            canceller.cancel();
        });
        let started = Instant::now();
        let base = t.path().to_string_lossy().into_owned();
        let res = GitCli::new("git")
            .run(
                t.path(),
                "op-4",
                &[
                    "daemon",
                    "--listen=127.0.0.1",
                    "--port=0",
                    &format!("--base-path={base}"),
                    "--export-all",
                    &base,
                ],
                None,
                cancel,
                |_| {},
            )
            .await;
        let elapsed = started.elapsed();
        assert!(matches!(res, Err(GitError::Cancelled)), "{res:?}");
        // 300 ms until cancel + at most 500 ms to die.
        assert!(
            elapsed < Duration::from_millis(800),
            "cancel took {elapsed:?}"
        );
    }
}
