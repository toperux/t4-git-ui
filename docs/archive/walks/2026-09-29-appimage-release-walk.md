# AppImage release gate, v0.10.13 on Linux — 2026-09-29

The close-out plan's *Gate after every close-out release* › *The AppImage, from #18*
(`docs/plans/2026-09-26-close-out-plan.md`), walked for **v0.10.13**. Host: Ubuntu 26.04.1, kernel 7.0.0-34, GNOME on
Wayland, VMware SVGA II (the AC walk's VM, `docs/archive/walks/2026-09-26-group-ac-linux-walk.md`). Packages: the
published v0.10.12 and v0.10.13 AppImages, sha256-checked; 0.10.13's `.sig` verified with
`verify-updater-sig.py` (trusted comment ends `version:0.10.13`), and both embedded digests with
`appimage-digest.py --check`. App data (`~/.local/share/dev.topher.t4gitui`, `~/.config/dev.topher.t4gitui`) backed
up first, restored after, and `diff -r` identical.

## Results

| Step | Result |
|---|---|
| 0.10.12 with the AC workaround (`LD_PRELOAD` of the four host `libwayland-*` + `WEBKIT_DISABLE_DMABUF_RENDERER=1`) | **pass**: renders, the Update badge shows |
| Settings → Check now → offers 0.10.13 → Install | **pass** (clicked by hand; mutter drops `xdotool`'s synthetic input under Wayland) |
| The file replaced in place | **pass**: 86354424 → 87542264 bytes, mtime 09:59:01 (+08:00), sha256 = the published 0.10.13 asset |
| The app restarts as 0.10.13 | **fail**: the old app exited, nothing came back (finding 1) |
| The replaced file launched as shipped (no env) on the desktop | **blank window**, the known VMware/XWayland one (the README note, `smoke-linux.md:208`). The title changes (the page runs) and there's no `EGL_BAD_PARAMETER` abort in the log, which was #18's symptom |
| The replaced file with only `WEBKIT_DISABLE_DMABUF_RENDERER=1` (no `LD_PRELOAD`) | **pass**: renders; no Update badge (0.10.13 is the latest). The repack fix holds: the `LD_PRELOAD` is no longer needed |
| The replaced file as shipped on Xvfb (`:98`, no env) | **pass**: renders |
| Native Wayland or XWayland | **XWayland** always: the bundled GTK hook exports `GDK_BACKEND=x11` (`apprun-hooks/linuxdeploy-plugin-gtk.sh`) |
| AC (`smoke-test-post-v1.md:761`) | not ticked, per the plan (ticks after the next release updates in place) |
| Phase 2a optional Linux checks (Esc in Settings; Meta+Q / Meta+O; `navigator.userAgent`) | **not walked**, by the owner's choice: the release AppImage has no devtools, so `activeElement` / the UA can't be read; left for a WebDriver walk |

## U4 — the old AppImage (no repack) vs the new (repacked)

| | 0.10.12 | 0.10.13 |
|---|---|---|
| Payload offset | 944632 | 944632 |
| Compressor / block size | zstd, default options (none stored) / 131072 | zstd, default options (none stored) / 131072 |
| squashfs size | 85405984 | 86594040 (+1188056, +1.4%) |
| File size | 86354424 | 87542264 |
| Inodes | 365 | 364 (`libwayland-client.so.0` gone) |
| Cold start, launch → window mapped (median of 3) | 0.536 s (0.578, 0.535, 0.536) | 0.536 s (0.535, 0.536, 0.539) |

- **Method:** `sync; echo 3 > drop_caches` before each launch; `xdotool search --sync --name 'T4 Git'`; old and new
  alternated. Old with the `LD_PRELOAD` workaround, new with `WEBKIT_DISABLE_DMABUF_RENDERER=1` only. Script:
  `~/t4-appimage-walk/u4.sh` (not in the repo).
- **Uncompressed contents** differ by the binary (+28672 bytes), `libwayland-client` (−69128) and the icon / `.desktop`
  swapping file and symlink. So the +1.19 MB is compression, not content: the repack's `appimagetool` packs the same
  files less tightly at the same compressor and block size. How (level, ordering, dedup) wasn't looked into.
- **Verdict:** no clear gap. Start time identical; size +1.4%. Matching appimagetool's options isn't called for.

## Findings

1. **The in-app update's restart fails on this host, since today.** Seen once; the cause reproduced by hand.
   - **Symptom:** after Install, the app exits and doesn't come back. `stderr`:
     `/usr/bin/env: /tmp/.mount_T4-GitDhAPiP/usr/lib/libsystemd.so.0: version 'LIBSYSTEMD_254' not found (required by /usr/bin/env)`.
   - **Cause:** the AppImage bundles Ubuntu 22.04's `libsystemd.so.0` (249), and `AppRun.wrapped` puts
     `$APPDIR/usr/lib` on `LD_LIBRARY_PATH`, which every child inherits. Tauri's restart spawns the new AppImage
     (`tauri-2.11.6/src/process.rs:83`) with that environment; its `AppRun` is `#! /usr/bin/env bash`. On Ubuntu 26.04
     `/usr/bin/env` is `rust-coreutils`, and 0.10.0, upgraded on this VM **today at 01:34** (the backport,
     LP: #2166202), links `libsystemd` and needs `LIBSYSTEMD_254`. The old 0.8.0 didn't, which is why the AC walk's
     restart worked on 2026-09-26.
   - **Reproduced:** `LD_LIBRARY_PATH=<0.10.13's usr/lib> /usr/bin/env true` fails the same way; so do `cat` and `ls`.
     `bash`, `sh` (dash), `git` and `ssh` run.
   - **Wider, reasoned, not tested:** anything the app spawns that runs a coreutils command inherits the same path, so
     a git hook, credential helper or editor script calling `cat`, `env`, `ls`… would fail from the AppImage on such
     a host. The `.deb` / `.rpm` aren't affected (no bundled libraries).
   - **Not a 0.10.13 regression:** 0.10.12 did this restart and bundles the same library. Any AppImage update on an
     up-to-date Ubuntu 26.04 hits it, including the next release's in-place update that AC waits on.
   - **Workaround:** start the updated file by hand; it's already replaced.
2. **Synthetic input doesn't reach the app on the GNOME Wayland desktop.** `xdotool` moves the pointer but its clicks
   and keys are dropped, so the updater clicks were done by hand. A walk-tooling note, not an app issue.

## Finding 1 scope — the same session, later

Asked for by the Windows session (t4-git-ui-28) at the owner's request, before deciding hotfix vs batch. The updated
0.10.13 AppImage, run with `WEBKIT_DISABLE_DMABUF_RENDERER=1` only, on Xvfb `:98`, where `xdotool` input reaches it.
`HOME` pointed at a throwaway directory, so the store and the global git config were the throwaway's; the real store
and `~/.gitconfig` were backed up anyway and `diff`ed unchanged afterwards. A throwaway repo, commits from the
Changes view's Commit button (the app commits through the git CLI, so hooks run). Settings › General read
*T4 Git UI 0.10.13 is up to date*.

| # | Check | 0.10.13 AppImage | Output |
|---|---|---|---|
| 1 | pre-commit `#!/bin/sh`, runs `cat /etc/hostname >/dev/null && ls >/dev/null` | **fail**, nothing committed | Dock: `hook1 start` / `cat: /tmp/.mount_T4-GiteKGGFb/usr/lib/libsystemd.so.0: version 'LIBSYSTEMD_254' not found (required by cat)` / exit 1. Toast: *Commit failed* / *hook1 start* (the hook's first stderr line, which isn't the error) |
| 2 | the same, `#!/usr/bin/env bash` | **fail**, nothing committed; the hook never starts | Dock and toast: `/usr/bin/env: …libsystemd.so.0: version 'LIBSYSTEMD_254' not found (required by /usr/bin/env)`, exit 1 |
| 3 | control hook, only `git` and builtins (`git rev-parse`, `test`, `:`) | **pass** | `hook3 start`, committed `c85993d` |
| 4 | Settings › Diff & merge › Custom: path `/usr/bin/cat`, command `cat "$LOCAL" "$REMOTE" >out 2>err; echo $? >rc`, opened on a changed file | **fail, silently** | The toast says *Opened a.txt in cat*; the tool exited 1 with the same `cat: …LIBSYSTEMD_254 not found`. The app spawns tools detached and doesn't see their exit |
| 5 | credential helper `!f(){ cat >/dev/null; echo username=x; echo password=y; }; f` on an HTTP remote answering 401 | **not reachable**: HTTP transport itself fails first (finding 3) | Dock: `/usr/lib/git-core/git-remote-http: symbol lookup error: /usr/lib/x86_64-linux-gnu/libcurl-gnutls.so.4: undefined symbol: nghttp2_option_set_no_rfc9113_leading_and_trailing_ws_validation` / `fatal: remote helper 'http' aborted session`, exit 128. Toast: *Operation failed*. The server logged no request |
| 6 | controls: a terminal `git commit` with hooks 1 and 2; the installed `.deb` (0.10.11) with hook 1, the same diff tool and the same Fetch | **pass**, all | Terminal: both exit 0. `.deb`: committed `ec8fbef` (`hook1 start` in the dock); the diff tool exited 0 with the file contents; the Fetch reached the server, the helper sent `x:y`, toast *Authentication failed — check your credential helper* |
| 7 | the running app's environment | — | `APPDIR=/tmp/.mount_T4-GiteKGGFb`, `GDK_BACKEND=x11`, `LD_LIBRARY_PATH=/tmp/.mount_T4-GiteKGGFb/usr/lib/:…/usr/lib/i386-linux-gnu/:…/usr/lib/x86_64-linux-gnu/:…/usr/lib32/:…/usr/lib64/:…/lib/:…/lib/i386-linux-gnu/:…/lib/x86_64-linux-gnu/:…/lib32/:…/lib64/:` (every entry under the mount) |

The server for 5 was a local `http.server` on `127.0.0.1` answering 401 with `WWW-Authenticate: Basic`; plain HTTP,
not HTTPS, to keep it on the loopback. `git-remote-https` fails the same way (the probe below).

**A probe of other commands** under the bundled library path (`usr/lib` of 0.10.13 extracted, `LD_LIBRARY_PATH` as in
row 7; `--version` or the equivalent, not a real use):

- **Fail:** `git-remote-https`, `curl` (nghttp2); `env`, `cat`, `ls`, every uutils coreutils command (libsystemd).
- **Run:** `ssh`, `ssh-keygen`, `gpg`, `gpgsm`, `less`, `python3`, `perl`, `sed`, `grep`, `awk`, `sudo`, `bash`,
  `dash`, `git` itself.
- **Not installed here:** `git-lfs`, `meld`, `code`.

### Findings from the scope check

3. **Every HTTP(S) fetch, pull, push and clone fails from the AppImage on Ubuntu 26.04.** The AppImage bundles 22.04's
   `libnghttp2.so.14`, which shadows the host's; 26.04's `libcurl` needs a newer symbol. Unlike finding 1, nothing
   points to this being new today: the host's `libcurl` was last upgraded 2026-09-26, and 26.04's curl is 8.18. When
   it started wasn't checked; no earlier walk fetched from the AppImage. SSH remotes aren't affected, by the probe
   (not walked).
4. **Finding 1 reaches past the restart:** any hook, custom diff / merge tool, or credential helper that runs a
   coreutils command fails from the AppImage, and a hook with an `env` shebang can't start at all. A failed custom
   tool looks like a success (row 4).
- **Common cause, both findings:** the AppImage's `LD_LIBRARY_PATH` reaches every child process. Bundled libraries
   older than the host's shadow them for host programs. `.deb` / `.rpm` are unaffected.
