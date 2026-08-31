//! Streaming runner for the system `git` executable.
//!
//! Output is delivered line by line while the process runs: `\n`-terminated
//! segments become [`CliEvent::Stdout`] / [`CliEvent::Stderr`], `\r`-terminated
//! segments (progress meters) become [`CliEvent::Progress`]. Cancelling the
//! token kills the whole process tree (Job Object on Windows, process group on
//! Unix) so credential helpers, `ssh`, `git-remote-https` etc. die with it.

use std::path::Path;
use std::process::Stdio;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::GitError;

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
        line: String,
    },
    Stderr {
        line: String,
    },
    /// A `\r`-terminated segment (progress meter redraw).
    Progress {
        line: String,
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

#[derive(Debug, Clone)]
pub struct GitCli {
    git_path: String,
}

#[derive(Clone, Copy)]
enum Stream {
    Out,
    Err,
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
        let cmd_line = format!("git {}", args.join(" "));
        let started = Instant::now();
        on_event(CliEvent::Started {
            op_id: op_id.to_string(),
            cmd: cmd_line.clone(),
        });

        let mut cmd = Command::new(&self.git_path);
        cmd.args(args)
            .current_dir(repo_dir)
            .env("GIT_TERMINAL_PROMPT", "0")
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
        let out_task = tokio::spawn(pump(stdout, Stream::Out, tx.clone()));
        let err_task = tokio::spawn(pump(stderr, Stream::Err, tx));

        let mut cancelled = false;
        loop {
            tokio::select! {
                ev = rx.recv() => match ev {
                    Some(ev) => on_event(ev),
                    None => break,
                },
                _ = cancel.cancelled(), if !cancelled => {
                    cancelled = true;
                    tracing::info!(op_id, "cancelling git command");
                    tree.kill(&mut child);
                }
            }
        }

        let status = child.wait().await?;
        let stdout = out_task.await.unwrap_or_default();
        let stderr = err_task.await.unwrap_or_default();
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
        })
    }
}

/// Reads a pipe to EOF, streaming segments as events; returns the full text.
async fn pump<R: AsyncRead + Unpin>(
    mut r: R,
    stream: Stream,
    tx: mpsc::UnboundedSender<CliEvent>,
) -> String {
    let mut all = Vec::new();
    let mut pending = Vec::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = match r.read(&mut buf).await {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        all.extend_from_slice(&buf[..n]);
        pending.extend_from_slice(&buf[..n]);
        drain(&mut pending, false, stream, &tx);
    }
    drain(&mut pending, true, stream, &tx);
    String::from_utf8_lossy(&all).into_owned()
}

/// Splits `pending` into `\n` / `\r\n` lines and `\r` progress segments,
/// keeping an unterminated tail (or a trailing `\r` whose successor is unknown)
/// for the next read unless `eof`.
fn drain(pending: &mut Vec<u8>, eof: bool, stream: Stream, tx: &mpsc::UnboundedSender<CliEvent>) {
    let line = |bytes: &[u8]| {
        let line = String::from_utf8_lossy(bytes).into_owned();
        match stream {
            Stream::Out => CliEvent::Stdout { line },
            Stream::Err => CliEvent::Stderr { line },
        }
    };
    let progress = |bytes: &[u8]| CliEvent::Progress {
        line: String::from_utf8_lossy(bytes).into_owned(),
    };

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
    fn drain_splits_lines_and_progress() {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let mut pending = b"a\nb\r\nc\rd\re".to_vec();
        drain(&mut pending, false, Stream::Err, &tx);
        assert_eq!(pending, b"e");
        let mut pending2 = b"x\r".to_vec();
        drain(&mut pending2, false, Stream::Err, &tx);
        assert_eq!(pending2, b"x\r", "trailing CR waits for the next byte");
        drain(&mut pending2, true, Stream::Err, &tx);
        assert!(pending2.is_empty());
        let mut got = Vec::new();
        while let Ok(e) = rx.try_recv() {
            got.push(e);
        }
        let l = |s: &str| CliEvent::Stderr {
            line: s.to_string(),
        };
        let p = |s: &str| CliEvent::Progress {
            line: s.to_string(),
        };
        assert_eq!(got, vec![l("a"), l("b"), p("c"), p("d"), p("x")]);
    }

    #[test]
    fn events_serialize_camel_case_tagged() {
        let json = serde_json::to_string(&CliEvent::Started {
            op_id: "op-1".into(),
            cmd: "git x".into(),
        })
        .unwrap();
        assert_eq!(json, r#"{"kind":"started","opId":"op-1","cmd":"git x"}"#);
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
            matches!(&events[1], CliEvent::Stdout { line } if line.starts_with("git version")),
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
        assert!(events
            .lock()
            .unwrap()
            .iter()
            .any(|e| matches!(e, CliEvent::Stderr { line } if line.contains("fatal"))));
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
