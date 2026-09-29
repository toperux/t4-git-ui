# Group BI: the 0.10.14 AppImage hotfix on Linux — 2026-09-29

The walk of `smoke-test-post-v1.md` › group BI, rows 1–8 (`docs/plans/2026-09-29-appimage-env-hotfix-plan.md`,
step 6). Row 9 is Windows and walked there.

**Setup:**
- **Build:** the `packages-Linux` artifact of Release run 36531636558 (`workflow_dispatch` of `walk/0.10.12` at
  `f79088d`, built on ubuntu-22.04, repacked and signed like a release). `T4-Git-UI_0.10.12_x86_64.AppImage`,
  sha256 `e4707f89fa89ab3c066d969218e6c1d7416505166a1d07ab8f1bbe96766ba8ba`; the `.sha256` sidecar matched,
  `verify-updater-sig.py` OK (trusted comment `version:0.10.12`), `appimage-digest.py --check` OK, no
  `libwayland-client` in the payload. `gh run download` refused the artifact ("would result in path traversal"); it
  was fetched through `gh api …/artifacts/<id>/zip` and unzipped.
- **Host:** Ubuntu 26.04.1, kernel 7.0.0-34, GNOME on Wayland, VMware SVGA II; rust-coreutils 0.10.0 (the backport)
  for `env`, `cat`, `ls`; GNU for `cp`, `mv`, `true`. meld 3.22.3 installed for row 4; VS Code not installed.
- **Isolation:** `HOME=~/t4-bi/home` (the store, the global git config: `credential.helper` for github.com =
  `gh auth git-credential` with `GH_CONFIG_DIR` pointing at the user's gh config). The user's store folder and
  `~/.gitconfig` were backed up and `diff`ed unchanged afterwards. Started from `~/t4-bi/start`, so `OWD` is
  recognisable.
- **Rows 1–7:** on Xvfb `:98` (`xdotool` input reaches it there, not on the Wayland desktop), launched by a script
  that then `exec`s `strace -f -e trace=execve -p <app pid>`: the tracer is the app's parent, so
  `ptrace_scope=1` allows it without sudo. strace was detached after row 6's *Open* checks.
- **Row 8:** on the desktop, the row's exact command, from a terminal in the session; the clicks by the user.
- **Controls:** `env -i` + the app's own `/proc/<pid>/environ`, loaded with `mapfile -d ''` (a first try passing the
  program through `"$@"` instead of inside the recipe's `-c` string ran it with an empty environment and passed; the
  recipe as written is right).

## Rows

| Row | Result | Control (unscrubbed env) | What was seen |
|---|---|---|---|
| 1 Coreutils hook | **pass** | fails: `cat: …/libsystemd.so.0: version 'LIBSYSTEMD_254' not found` | commit `005baad` from the Commit button; the `#!/bin/sh` pre-commit ran `cat` and `ls` and logged |
| 2 Env-shebang hooks | **pass** | both fail: `/usr/bin/env: …LIBSYSTEMD_254 not found` | the same commit ran `prepare-commit-msg` (`#!/usr/bin/env bash`) and `commit-msg` (`#!/usr/bin/env python3`); both logged. They ran again on the rebase's reword |
| 3 Remotes | **pass** | HTTPS fails: `git-remote-https: symbol lookup error: …libcurl-gnutls.so.4: undefined symbol: nghttp2_option_set_no_rfc9113_…`; SSH works (baseline) | against the private scratch repo `toperux/t4-bi-walk-scratch` (created by the user for this walk): HTTPS clone from the start screen's Clone dialog; *Commit & Push* (`a7a6058..f5eb95e`); the clone rewound and pruned locally, then *Fetch* (3 objects received) and again, then *Pull* (fast-forward); an `ssh` remote added, *Fetch* of it. All exit 0 |
| 4 Tools | **pass** (VS Code fallback: not installed) | meld fails: `Fatal Python error: Failed to import encodings module` | Diff and merge tool set to the Meld preset in Settings. Merge tool on the `f2.txt` conflict, diff tool on the staged diff, each with no meld running: `python3 /usr/bin/meld …` with cwd `/home/toperux/t4-bi/start` (OWD), no `mount_` entry, no `PYTHONHOME` |
| 5 Editor-less git | **pass, no-regression only** | does **not** fail: the rebase's sequence editor runs `cp`/`mv` and `GIT_EDITOR` is `true`, all GNU on this host | interactive rebase with a reword (`46d339a main edits f2 (reworded BI 5)`); merge of `side` → conflict → *Keep side's version* → Commit (`b8be3fc`) |
| 6 Open | **pass** | the bundled `xdg-open` (first on the unscrubbed `PATH`): `realpath: …LIBSYSTEMD_254 not found`, `xdg-mime: no method available…`, exit 0 | *Open* on `f1.txt` in the Files tree: strace shows `ENOENT` for each host `PATH` folder (none under the mount), then `execve("/usr/bin/xdg-open", …) = 0` → `gio open` → gnome-text-editor started through D-Bus (not running before; cwd `/home/toperux`, no `mount_`). *Reveal* on `f3.txt`: no exec (a D-Bus call); nautilus started through D-Bus (no `mount_`). *Open* on a file deleted since the list loaded: toast *Couldn't open the file — could not open doomed.txt: No such file or directory (os error 2)*, no `xdg-open` exec. *What's new*: on the desktop (row 8's session) Firefox opened the releases page; its process had cwd = OWD and no `mount_`, `PYTHONHOME` or `APPIMAGE`. The user confirmed the editor, the file manager and Firefox on screen |
| 7 A child's environment | **pass** | — | *Fetch* of a local HTTP remote that answers after 40 s: `git fetch …` and `git remote-http …` showed none of `mount_`, `APPDIR`, `APPIMAGE`, `ARGV0`, `OWD`, `PYTHONHOME`, `PYTHONDONTWRITEBYTECODE`, `LD_LIBRARY_PATH`; the app itself 19 such lines |
| 8 Relaunch after an update | **fail on the mount count** (the rest passes) | the published 0.10.12 didn't relaunch on this host (`2026-09-29-appimage-release-walk.md`) | see below |

## Row 8

Started with the row's command from `~/t4-bi/start`; no other T4 Git UI running, no `.mount_T4-Git` mount before.
Old pid 45242, one mount. The user clicked *What's new* (row 6), then *Update to 0.10.13…* → Install.

- **Came back by itself, on 0.10.13, with both tabs** (`t4-bi-walk-scratch`, `r1`) — the user's report. New pid
  53209, 0.1 s after the old one exited.
- **The file:** replaced in place, 87550456 → 87542264 bytes, sha256 = the published 0.10.13's (`be1b1db0…`).
- **OWD:** `tr '\0' '\n' </proc/53209/environ | grep ^OWD=` → `OWD=/home/toperux/t4-bi/start`. `APPIMAGE` and
  `ARGV0` are the file's path; the new environment names only the new mount (18 entries), none of the old one.
- **Mount count (T-A): 2**, from the old process's exit through 13 s later and for as long as the new app ran:
  `/tmp/.mount_T4-Gitgnbffo` (old) and `/tmp/.mount_T4-GitPnCkpf` (new).
  - **What holds the old mount:** its FUSE daemon, pid 45248 (exe `~/.cache/tauri_current_app…/current_app.AppImage
    (deleted)`, the updater's temporary copy), still holds the **write** end of its keepalive `pipe:[213364]` (fd 4).
    The **read** end is held by the relaunched app 53209 (fd 3, `fdinfo` flags `00`: no `O_CLOEXEC`), the new
    runtime 53216 (fd 3) and both WebKit children (53262, 53266). The relaunch inherited the old runtime's read end,
    so the old daemon never sees its reader go.
  - **After Quit** (Ctrl+Q by the user): 0 mounts, 45248 and 53216 gone.
- **Not ticked:** the row expects 1.

## Seen on the way

- **Snap Firefox can't reach Xvfb** (`Error: cannot open display: :98`, the same from a clean shell), and under
  `strace` the snap's `snap-confine` loses its file capabilities. The browser check was moved to row 8's desktop
  session.
- **The row 6 missing-file check** needs the click to land before the file watcher refreshes the list (a refresh
  closes the menu): the file was deleted and the menu item clicked in the same command.
- **The Changes view's *Res…* button** (the merge tool) is cut off at 1280 px wide until the sidebar is hidden.
- **Leftovers:** meld's multiprocessing forkserver children outlive a killed meld; they were killed by hand.

## Re-walk of rows 5 and 8 — the same day, the T-A build

**Build:** the `packages-Linux` artifact of Release run 36540556155 (`walk/0.10.12-2` at `712481f`: the hotfix plus
the T-A fix — `FD_CLOEXEC` on every inherited fd ≥ 3 at startup inside an AppImage — labelled 0.10.12, built on
ubuntu-22.04). `T4-Git-UI_0.10.12_x86_64.AppImage`, sha256
`5e6ce28e04d94138cded9c3b737682b826f9531daac1ce78c5780b2f3bc41cb6`; sidecar, signature (`version:0.10.12`) and
digest OK. Same host and isolation (`HOME=~/t4-bi2/home`, started from `~/t4-bi2/start`); the user's store folder
and `~/.gitconfig` backed up and `diff`ed unchanged afterwards.

| Row | Result | What was seen |
|---|---|---|
| 5 Editor-less git | **pass** — now a proof | Launched on Xvfb `:98` with `~/t4-bi2/uu` (symlinks to `/usr/lib/cargo/bin/coreutils/{cp,mv,true}`) first on `PATH`. Controls under the unscrubbed environment fail: the sequence editor's `cp` (`cp: /tmp/.mount_T4-GitPMeeFo/usr/lib/libsystemd.so.0: version 'LIBSYSTEMD_254' not found`), and `GIT_EDITOR=true git commit -e` (`…/uu/true: …LIBSYSTEMD_254 not found`, `error: there was a problem with the editor 'true'`). In the app: interactive rebase with a reword (`343863c c3 (reworded BI 5 uutils)`), merge conflict → *Keep side's version* → Commit (`9bc5af1`). From the app's git input, `-c alias.w='!command -v cp; echo $PATH \| cut -d: -f1-2' w` printed `/home/toperux/t4-bi2/uu/cp` and `/usr/lib/git-core:/home/toperux/t4-bi2/uu`: the children ran the uutils binaries |
| 8 Relaunch after an update | **fail on the crash check** (the rest passes) | see below |

**Row 8.** The row's command on the desktop from `~/t4-bi2/start`, two tabs (`r1`, `r2`), no other T4 Git UI
running. The user clicked *Update to 0.10.13…* → Install.

- **Came back by itself on 0.10.13 with both tabs, no crash dialog** (the user's report). Old pid 64950 gone at
  16:37:11.24, new pid 65468 at 16:37:11.26.
- **The file:** replaced in place, sha256 = the published 0.10.13's (`be1b1db0…`).
- **OWD:** `OWD=/home/toperux/t4-bi2/start`.
- **Mount count: 1** when the old process was gone, 3 s and 13 s later (`/tmp/.mount_T4-GitbcHLpf`, the new image's
  only). **0 after Quit.** The T-A fix works.
- **Crash check: fail.** `coredumpctl` isn't installed (Ubuntu uses apport), so `/var/crash` and
  `/var/log/apport.log` were read. apport is called by the kernel for every crashing process, and logs it even when
  it declines to write a report (`this executable already crashed 2 times, ignoring`), so its log is the full
  record; `/var/crash` alone missed these:

  ```
  16:32:03 called for global pid 63264, signal 7   WebKitWebProcess     (clean Ctrl+Q quit of this build after row 5, Xvfb)
  16:32:04 called for global pid 63237, signal 7   WebKitNetworkProcess (same quit; report written: SIGBUS, ProcCwd /usr,
                                                                         cmdline ././/lib/x86_64-linux-gnu/webkit2gtk-4.1/…)
  16:37:11 called for global pid 64979, signal 7   WebKitNetworkProcess (the old instance's exit for the relaunch)
  16:37:12 called for global pid 64997, signal 7   WebKitWebProcess     (same)
  ```

  The quit of the relaunched app (the published 0.10.13, without the fix) logged nothing. `journalctl -b` had no
  `webkit`/`segfault`/`SIGBUS` lines outside whoopsie and apport. Signal 7 is SIGBUS: the helpers still map the
  image's libraries, and with the keepalive read end no longer inherited, the image unmounts as soon as the app
  itself exits, while they are still tearing down. That reading is reasoned from the signal and the timing, not
  traced.
- **Baseline, the build without the fix, the same day (apport's log):** no crash on any normal exit — the Xvfb
  Ctrl+Q quit, SIGTERM kills of the app during the scope check, the 15:23 update relaunch, the 15:26 quit, and six
  SIGTERM kills during the U4 timing. Its only SIGBUS pair (10:00:52 / 10:01:03) followed a `pkill -f` on the
  AppImage's file name, which also matched and killed the runtime's FUSE process.
- **Not ticked:** 2 exits out of 2 of the fixed build crashed both helpers. No crash dialog showed at the relaunch (the
  user's report; the first quit was on Xvfb), but apport records each one.

## Re-walk of row 8 — the narrowed fix

**Build:** the `packages-Linux` artifact of Release run 36548652011 (`walk/0.10.12-3` at `6c09b3f`: `hotfix/0.10.14`
`cb89281` — on `main`, the commit *fix: The old AppImage unmounts once the updated one has started*: the same
behaviour, with comments and a test added after — plus the 0.10.12 label). The startup-wide `FD_CLOEXEC` is gone;
`git_core::host_env` sets `close_range(3, ~0, CLOSE_RANGE_CLOEXEC)` in a `pre_exec` hook, so only the programs the
app starts (git, tools, the opener, the relaunch) drop the runtime's keepalive, and WebKit's helpers keep it.
`T4-Git-UI_0.10.12_x86_64.AppImage`, sha256 `cbca62a7959a00d01ce65af0459b8effc7262d0f3e4e19e68ba5cbcb2bc2e41d`;
sidecar, signature (`version:0.10.12`) and digest OK. Same host and isolation (`HOME=~/t4-bi3/home`, started from
`~/t4-bi3/start`, two tabs `r1`, `r2`); the user's store folder and `~/.gitconfig` backed up and `diff`ed unchanged
afterwards.

**Crash baseline:** 6 `called for` lines in `/var/log/apport.log`, the last the previous build's 16:37:12 signal 7.
A watcher logged every change of `findmnt -l | grep -c '\.mount_T4-Git'` every 50 ms (the count only, not the mount
names).

| Step | Result |
|---|---|
| Clean Ctrl+Q quit of this build on Xvfb `:98` (both tabs rendered first; the WebKit children held a pipe fd) | **no crash**: apport still at 6 lines; mounts 1 → 0 about 0.7 s after the quit |
| Desktop, the row's command; the user: *Update to 0.10.13…* → Install | **came back by itself on 0.10.13 with both tabs, no crash dialog** (the user's report). Old pid 71889 gone at 17:44:07.27, new pid 117234 at 17:44:07.30; the file replaced in place (sha256 `be1b1db0…`, the published 0.10.13) |
| `OWD` of the new process | `OWD=/home/toperux/t4-bi3/start` |
| Mount count | **1** at the old pid's exit, at +3 s and +13 s; the watcher never saw 2 (nor 0) from launch to Quit. The old mount `/tmp/.mount_T4-GitKJPPEi` was replaced by `/tmp/.mount_T4-GitnOlooA` within one 50 ms sample, so the old image didn't visibly linger for its helpers |
| apport after the relaunch | **no new line** (still 6) |
| Ctrl+Q quit of the relaunched app (the published 0.10.13) | no crash dialog; apport still 6; mounts 0 at 17:45:10 |

**Pass:** ticked. Both exit paths of this build — the relaunch and a clean quit — crashed no WebKit helper, where
the first T-A build crashed both on 2 exits out of 2.

## Re-walk of rows 1–7 — the final build

**Why:** rows 1–4, 6 and 7 had run only on the first build (no fd hook), and row 5 on the startup-wide T-A build
that was later removed. The final fix adds a `pre_exec` (`close_range(3, ~0, CLOSE_RANGE_CLOEXEC)`) to every
process the app starts, so every spawn path in rows 1–7 is re-proven on it.

**Build:** the same artifact as the row 8 re-walk: Release run 36548652011 (`walk/0.10.12-3` at `6c09b3f`, the
same behaviour as the fix commits on `main`; only comments and tests changed after), sha256
`cbca62a7959a00d01ce65af0459b8effc7262d0f3e4e19e68ba5cbcb2bc2e41d`, downloaded again; sidecar, signature
(`version:0.10.12`) and digest OK. **Isolation:** `HOME=~/t4-bi4/home` (the same global git config as the first walk),
started from `~/t4-bi4/start`; the user's store folder and `~/.gitconfig` backed up and `diff`ed unchanged afterwards.
**Rows 1–7** on Xvfb `:98`, launched by the first walk's script (the app, then `strace -f -e trace=execve` attached as
its parent), with `~/t4-bi4/uu` (uutils `cp`, `mv`, `true`) first on `PATH` for the whole session, not only row 5.
strace was detached (killed) after row 6. Controls: the first walk's `mapfile` recipe. **Crash baseline:** 6
`called for` lines in `/var/log/apport.log` (19 lines in all), the last at 16:37:12.

| Row | Result | Control (unscrubbed env) | What was seen |
|---|---|---|---|
| 1 Coreutils hook | **pass** | fails: `cat: …/libsystemd.so.0: version 'LIBSYSTEMD_254' not found` | commit `bbe9b5a` from the Commit button; the `#!/bin/sh` pre-commit ran `cat` and `ls` and logged |
| 2 Env-shebang hooks | **pass** | both fail: `/usr/bin/env: …LIBSYSTEMD_254 not found` | the same commit ran `prepare-commit-msg` (`#!/usr/bin/env bash`) and `commit-msg` (`#!/usr/bin/env python3`); both logged, and again on the reword and the merge commit |
| 3 Remotes | **pass** | HTTPS fails: `git-remote-https: symbol lookup error: …libcurl-gnutls.so.4: undefined symbol: nghttp2_option_set_no_rfc9113_…`; SSH works (baseline) | the scratch repo `toperux/t4-bi-walk-scratch`, recreated by the user (private, with a README): HTTPS clone from the start screen's Clone dialog (exit 0); *Commit & Push* (`5da3d34..701d82c`, confirmed on GitHub); the clone rewound and pruned, then *Fetch* (3 objects) and, pruned again, *Pull* (fast-forward); an `ssh` remote added, *Fetch* of it. All exit 0 |
| 4 Tools | **pass** (VS Code fallback: not installed) | meld fails: `Fatal Python error: Failed to import encodings module` | Diff and merge tool set to the Meld preset in Settings. Merge tool on the `f2.txt` conflict (pid 132813), diff tool on the staged diff (pid 134060), each with no meld running: `/usr/bin/python3 /usr/bin/meld …` with cwd `/home/toperux/t4-bi4/start` (OWD), no `mount_` entry, no `PYTHONHOME` |
| 5 Editor-less git | **pass** — a proof | fails: `cp: …LIBSYSTEMD_254 not found`; `GIT_EDITOR=true git commit -e`: `…/uu/true: …LIBSYSTEMD_254 not found`, `error: there was a problem with the editor 'true'` | interactive rebase with a reword (`24c2e08 main edits f2 (reworded BI 5 final)`): strace shows the sequence editor ran `/home/toperux/t4-bi4/uu/cp` and `…/uu/mv` (uutils), exit 0. Merge of `side` → conflict → *Keep side's version* → Commit (`db4c7dc`, `git commit -F`) |
| 6 Open | **pass** | the bundled `xdg-open`: `realpath: …LIBSYSTEMD_254 not found`, `xdg-mime: no method available…`, exit 0, nothing opened | *Open* on `f1.txt` in the commit's Files list (a copy under `/tmp/t4-git-ui-diff-1000`): strace shows `ENOENT` for each `PATH` folder (`~/t4-bi4/uu`, fnm, `~/.local/share/fnm`, `~/.dotnet/tools`, `~/.cargo/bin`, `~/.local/bin`, `/usr/local/sbin`, `/usr/local/bin`, `/usr/sbin`; none under the mount), then `execve("/usr/bin/xdg-open", …) = 0` → `gio open` → gnome-text-editor started through D-Bus (pid 135347, not running before, parent `systemd --user`, cwd `/home/toperux`, no `mount_`, `PYTHONHOME` or `APPIMAGE`). *Reveal in folder* on `f3.txt`: no exec; nautilus started through D-Bus (pid 135860, parent `systemd --user`, cwd `/home/toperux`, no `mount_`). *Open* on a file deleted with its menu already open: toast *Couldn't open the file — could not open doomed.txt: No such file or directory (os error 2)*, no `xdg-open` exec. *What's new* on the desktop (below): Firefox, not running before, started at 20:15:53 (pid 185166, parent `systemd --user`), cwd `/home/toperux/t4-bi4/start` (OWD), no `mount_`, `PYTHONHOME` or `APPIMAGE`; its `LD_LIBRARY_PATH` is only the snap's own; the user confirmed the releases page |
| 7 A child's environment | **pass** | — | *Fetch* of a local HTTP remote that answers after 40 s: `git fetch …` (136280) and `git remote-http …` (136281), cwd the repo, showed none of `mount_`, `APPDIR`, `APPIMAGE`, `ARGV0`, `OWD`, `PYTHONHOME`, `PYTHONDONTWRITEBYTECODE`, `LD_LIBRARY_PATH`; the app itself 22 such lines. Neither child held the runtime's keepalive pipe (the app's fd 3, `pipe:[499949]`); their fds were only their own pipes |

**Quit of the row 1–7 session (Ctrl+Q on Xvfb, after all rows):** no `called for` line, but apport logged one new
line at the quit:

```
ERROR: apport (pid 138989) 2026-09-29 19:46:40,118: executable was modified after program start, ignoring
```

- **What it means:** in this apport, `consistency_checks()` runs before the `called for` log and returns early, so
  the signal and the process aren't recorded. The error means root couldn't find the crashed process's `exe`. The
  image is a FUSE mount without `allow_other` (`findmnt`: `ro,nosuid,nodev,relatime,user_id=1000,group_id=1000`), so
  root can't reach files inside it (`sudo -n` needs a password here, so this wasn't tested directly). Reading, not
  verified: a process running from the image (`t4-git-ui` or a WebKit helper; the only real executables in it are
  these, `AppRun.wrapped` and `xdg-open`, a script) crashed while the image was still mounted. The error came 28 ms
  before systemd's `tmp-.mount_T4\x2dGitAIKmPb.mount: Deactivated` (19:46:40.146) and the `fusermount` (.149): most
  likely the last keepalive holder died with a signal as it exited. `exception-trace` is 1 and the kernel logged no
  `segfault` or `traps:` line, which argues against SIGSEGV and int3, not against SIGABRT or SIGBUS. No package or
  snap changed today.
- **Not reproduced** in five more quits of the same build, each watched every 20 ms (the pids running from the image
  and the mount count):
  - Xvfb, strace attached from launch +1 s, idle, Ctrl+Q: nothing.
  - Xvfb, **no strace**, three tabs, the spawn-heavy part of the session (meld as diff tool and as merge tool, *Open*,
    *Reveal*, the slow-remote fetch, HTTPS and SSH fetches, the folder picker, two tabs closed): at the quit the app
    left first, both helpers 43 ms later, mounts 0 at +114 ms; nothing in apport.
  - Xvfb, strace `-e trace=execve` attached then killed mid-run (as in the session), meld, the slow fetch: nothing.
  - Xvfb, strace `-f -e trace=none -e signal=all` attached from launch +1 s through the quit (strace can't start the
    AppImage itself: `fusermount` is setuid, and the mount fails under ptrace), the whole sequence again plus *Commit &
    Push*, *Pull*, a second HTTPS clone and closing all tabs: no `killed by` line and no `SIGBUS`/`SIGSEGV` at the quit
    (the only `killed by` lines are the meld processes killed by hand); nothing in apport.
  - Xvfb, the row 6 control run into a live app, then the quit: no extra process from the image; nothing in apport.
- **Before each quit:** only three processes ran from the image — `t4-git-ui`, WebKitNetworkProcess and
  WebKitWebProcess — and each held the keepalive read end (the app's fd 3 pipe inode in its `/proc/<pid>/fd`).
- **After the re-walk:** apport still at 6 `called for` lines, 20 lines in all (the one above added).

**BI 8 addendum — Ctrl+Q of the 0.10.12-versioned build on the desktop:** the row's command on the desktop display
from a terminal in the session (`GDK_BACKEND=x11` from the AppImage, `OWD=/home/toperux/t4-bi4/start`), two tabs
(`r1`, `r2`) rendered by the user, then *What's new* (row 6's browser check above), then Ctrl+Q by the user: **no crash
dialog** (the user's report). The watcher: the app (160546) gone at 20:16:57.996, WebKitNetworkProcess (160661) and
WebKitWebProcess (160680) 38 ms later, mounts 0 at 20:16:58.034; **no new line in apport's log** and no `segfault` or
`traps:` line in the journal.

**Pass:** rows 1–7 pass on the final build, and the BI 8 addendum passes. The one unexplained apport entry at the
row 1–7 session's quit is recorded above; it didn't recur in six later quits (five on Xvfb, one on the desktop).
