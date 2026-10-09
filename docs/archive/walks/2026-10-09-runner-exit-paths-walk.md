# Walk — a deleted repository folder, `runner-exit-paths`, 2026-10-09

The walk of `docs/plans/2026-10-09-runner-exit-paths-plan.md` (its *Walk* section): a repository folder deleted while
it is open, then a git command run in it. Expected: the toast names the folder ("repository folder not found:
<path>"), and the Output dock keeps no row running. Run on the Windows and Linux VMs over Remote Control, which
reported back; nothing was ticked or committed there. Both builds of `runner-exit-paths` at `b27c10c8`, in a scratch
worktree.

## Windows — pass

- Build: `tauri build --no-bundle` (release), launched with `smoke-launch.ps1 -Exe` (CDP). Windows 11 Pro 26300,
  WebView2 154.0.4258.62, git 2.55.0.windows.5. Store backed up first.
- Repository: `C:\tmp\rep-gone`, `git init` and one commit (3 loose objects, no packfiles), the active tab beside
  `C:\tmp\t4\work`.
- `Remove-Item -Recurse -Force` → no error, `Test-Path` False: nothing the app held blocked the delete.
- Before the run (~25 s): no toast, banner or status change in `rep-gone`; it kept its history, and its status bar
  still read "main · Clean". The *other* tab, `work`, showed the "Changed" dot when read 4 s after the delete; it
  wasn't read before, so whether the delete caused it is unknown. It cleared when `work` was activated.
- Repository menu → Run command (Ctrl+Shift+R) → `status` → Run:
  - Toast: "git status failed" / "repository folder not found: c:\tmp\rep-gone" — pass.
  - A second toast 4 ms later: "Couldn't refresh references" / "failed to resolve path 'c:\tmp\rep-gone': The
    system cannot find the file specified." — inferred to be the refs refresh that follows an op (see *Seen*).
  - Output dock: opened on "No output yet", no row, no spinner, no Cancel — pass.
- Control: on `work`, Run command → `status`: a dock row "$ git status" with its output, ending "✓ exit 0 · 0.1s".
- Log: 0 WARN, 0 ERROR. Neither the failed spawn nor the failed refs refresh is logged; the watcher logged nothing on
  the delete.
- Cleanup: app quit, store restored (`cmp` identical, same file set), worktree removed.

## Linux — pass

- Build: a debug build with a smoke identifier (`tauri build --debug --no-bundle --config
  identifier=dev.topher.t4gitui.smoke`, the owner's choice, as WebDriver on Linux needs), whose runner code is the
  same as a release build's (the runner has no debug-only code; git-core's one `debug_assert!` is in `conflict.rs`).
  Ubuntu 26.04.1, WebKitGTK 2.52.6, git 2.53.0; Xvfb, tauri-driver and xdotool. A scratch `HOME`: the real store and
  `~/.gitconfig` were checked by md5 before and after, 15 of 15 unchanged.
- Repositories: `/tmp/t4/rx-gone` and `/tmp/t4/rx-live`, each `git init` and one commit, no packfiles; `rx-gone`
  active.
- `rm -rf` → gone. 4 s after: nothing in the UI (the tab, graph and status bar unchanged, "main · Clean"), no log
  line.
- Run command → `status` → Run:
  - Toast: "git status failed" / "repository folder not found: /tmp/t4/rx-gone" — pass. Before this branch it would
    read "git executable not found" (the child's `chdir` fails with `ENOENT`; inferred from Rust's std source, per
    the plan, not walked).
  - A second toast: "Couldn't refresh references" / "failed to resolve path '/tmp/t4/rx-gone': No such file or
    directory".
  - Output dock: "No output yet", no row, nothing running, the same 5 s later — pass.
- Control: on `rx-live`, a dock row "$ git status" … "✓ exit 0 · 0.0s".
- Log (stderr, a debug build): 0 WARN, 0 ERROR; nothing logged for the failed run or the refs refresh.
- Cleanup: app quit, the harness's processes stopped by PID, repositories and worktree removed.

## Seen

- **The refs refresh after the op toasts the raw OS error** on both OS ("failed to resolve path '…': The system
  cannot find the file specified." / "No such file or directory"). The branch names the folder only in the runner's
  spawn; the refresh goes through libgit2 (inferred from the message).
- **A deleted folder goes unnoticed until something runs:** its tab kept its history and "Clean", with no toast,
  banner or log line, until the command (Windows: ~25 s watched; Linux: checked at 4 s). On Windows another tab's
  "Changed" dot appeared meanwhile, cause unknown (above).
- Toasts are per window, not per tab: `rep-gone`'s stayed up on switching tabs (Linux and Windows). Expected.
