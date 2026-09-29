# Plan: hotfix 0.10.14 — the AppImage's environment stops reaching the processes it starts, 2026-09-29

_Written 2026-09-29. Status: executing on `hotfix/0.10.14`; change review in progress. Decision taken before writing:
hotfix 0.10.14 with an environment scrub, ahead of Phase 1b (the user, 2026-09-29). Plan review: pass 1 — 1 blocker (the
test build must come from 22.04), 6 should-fix, 5 nits, folded in; D1–D3 and D5–D10 and T1–T7 ruled. Pass 2 — 3
should-fix, 10 nits, folded in; D11 ruled (drop `releaseUrl`), D10 kept after a correction to its reasoning. Pass 3 — 4
should-fix, 8 nits, folded in, nothing for the user. Pass 4 — 1 should-fix (the missing-file check's error type), 7
nits, folded in. Pass 5 — 3 nits, folded in; D12 ruled (the missing-file check on every OS). Pass 6 — 2 should-fix
(D12's premise: new on Linux only, ruling kept; the plugin's private `Result`), 4 nits, folded in. Pass 7 — 6 nits: 5
folded in, 1 optional alternative not taken, told to the user: if D4 keeps the plugin, D12 could be a swap to the
plugin's free `open_path`, which has the check built in. Pass 8 — 2 wording nits, folded in. Pass 9 — clean apart from
one line citation, fixed and checked against the source. Plan review done. Step 0 answered D4 (own spawn), plus D13 and
a D2 recheck. Pass 10 — 5 nits, folded in. Pass 11 — clean apart from 2 optional nits, both taken. **Plan review
done.**_

**Goal:** a program the AppImage starts (git, and through git every hook, remote helper and credential helper; a
custom diff or merge tool; the file opener; the relaunch after an update) runs with the host's own libraries, not
the AppImage's. Walk it on the Ubuntu 26.04 VM, then release 0.10.14. Row text: `docs/plans/open-items.md` §S.
Line numbers are as of `056ed02`.

Branch: `hotfix/0.10.14` off `main`. One commit per step while working, squashed at the end (step 7 of `CLAUDE.md`).

## What is broken (VM, 2026-09-29, the published 0.10.13 AppImage on Ubuntu 26.04)

The AppImage's start script (`AppRun`) points `LD_LIBRARY_PATH` at 10 folders inside the mounted image
(`/tmp/.mount_T4-Git…/usr/lib…`), and every child inherits it. The image carries Ubuntu 22.04's libraries, so a host
program that needs a newer one fails to start:

- **Every HTTPS fetch, pull, push and clone fails.** git's `git-remote-https` loads the host's `libcurl`, which needs
  a newer `libnghttp2` than the bundled `libnghttp2.so.14`.
- **Hooks that call coreutils fail** (`cat`, `ls`: 26.04's rust-coreutils needs `LIBSYSTEMD_254`, the image has
  249). A `#!/usr/bin/env bash` hook can't start at all.
- **A custom diff/merge tool fails silently** (the app still says *Opened …*; see Triage).
- **The relaunch after an update fails.** Tauri's restart runs the new AppImage, whose `AppRun` starts with
  `#! /usr/bin/env bash`; `env` dies; the app exits and nothing comes back. The update itself is in place.
- **Not affected:** `bash`, `dash`, `git`, `ssh` on their own; git from a terminal; the `.deb` (0.10.11 as the
  control). `.rpm` is the same build as the `.deb`, not walked.
- **Step 0 (VM, 2026-09-29, same image):** *Open* and the release-page button fail too — the image ships its own
  `usr/bin/xdg-open` and puts its folders first on `PATH`, so the bundled script runs, hits the `libsystemd` error,
  then starts the text editor with our libraries, which crashes — and `xdg-open` still exits 0. `gio open` fails
  (the bundled glib), `/usr/bin/python3` fails (`PYTHONHOME`), a `#!/usr/bin/env python3` script fails. With the
  image's entries stripped, all pass and the host's `/usr/bin/xdg-open` runs. `true` and `perl` pass either way.
- **Reasoned, not walked:** interactive rebase and *continue* (the runner sets `GIT_EDITOR=true`, `runner.rs:239`;
  the rebase's sequence editor is `sh -c 'cp … && mv …'`, and `cp` / `mv` are rust-coreutils on the VM).

Record: `docs/archive/walks/2026-09-29-appimage-release-walk.md`, committed on the VM as `41025ce` (not yet on
`main`; it lands with this batch's docs, step 5).

**What `AppRun` sets** (read off the 0.10.13 image in step 0): `AppRun` is linuxdeploy's bash script
(`#! /usr/bin/env bash`), which sources one hook (`linuxdeploy-plugin-gtk.sh`) and execs `AppRun.wrapped`
(AppImageKit's C AppRun). The hook sets `GTK_DATA_PREFIX`, `GTK_THEME=Adwaita:<dark|light>`, `GDK_BACKEND=x11`,
`XDG_DATA_DIRS`, `GSETTINGS_SCHEMA_DIR`, `GI_TYPELIB_PATH`, `GTK_EXE_PREFIX`, `GTK_PATH`, `GTK_IM_MODULE_FILE`,
`GDK_PIXBUF_MODULE_FILE`, `GIO_EXTRA_MODULES` (several in the `$APPDIR//usr/…` form). `AppRun.wrapped` puts the
image's folders in front of `PATH`, `LD_LIBRARY_PATH`, `PYTHONPATH`, `XDG_DATA_DIRS`, `PERLLIB`,
`GSETTINGS_SCHEMA_DIR`, `QT_PLUGIN_PATH`, `GST_PLUGIN_SYSTEM_PATH`, `GST_PLUGIN_SYSTEM_PATH_1_0` (most with a
trailing `:`), and sets `PYTHONHOME=$APPDIR/usr/` and `PYTHONDONTWRITEBYTECODE=1`. The runtime sets `APPIMAGE`,
`APPDIR`, `OWD`, `ARGV0`. 18 values carry the mount path, each with `APPDIR`'s string exactly (`/tmp` isn't a
symlink on the VM; the symlinked case is untested, hence the canonical match in step 1). Nothing saves the original
values, and nothing needs to: dropping the image's entries leaves the user's — except that the hook writes
`XDG_DATA_DIRS=$APPDIR/usr/share:/usr/share:$XDG_DATA_DIRS`, so a child keeps an extra `/usr/share` in front
(harmless; seen in step 0's live environment).

**Why not process-wide:** WebKitGTK starts its own helper processes (web, network) whenever a window opens, and
those need the bundled libraries. So the scrub is per child, at each place the app starts one.

## Steps

### 0. Read `AppRun` and the live environment off the VM (no code) — done 2026-09-29

Results above (*What `AppRun` sets*, *Step 0*); nothing changed on the VM. The check, on the published 0.10.13
AppImage:
`./T4*.AppImage --appimage-extract AppRun; ./T4*.AppImage --appimage-extract 'apprun-hooks/*'`, and
`tr '\0' '\n' </proc/<app pid>/environ | grep -E 'mount_|APPDIR|APPIMAGE|GDK|GTK|GIO|PYTHON|PERL|QT_|XDG_DATA'`.
Also, from a shell with that environment (as the scope check did): `xdg-open <a .txt file>` and a
`#!/usr/bin/env python3` script. Confirms the variable list above, and whether the opener (step 3) is broken at all.

### 1. `host_env` / `host_command`: drop the image's paths from a child's environment (`crates/git-core/src/lib.rs`)

```rust
/// Inside an AppImage, `AppRun` points LD_LIBRARY_PATH, PYTHONHOME and the GTK / GIO module variables into
/// the image; a host program started from here must not load the image's libraries. Every process the app
/// starts is built with `host_command` (clippy enforces it, D7) or, for a `Command` made elsewhere
/// (`open::commands`), passed through `host_env`. The child also starts in the user's first folder (`OWD` when
/// absolute, a folder, and not inside a `.mount_`; else `/`; checked on each spawn), not the image's `usr` (Q7, Q9,
/// W2). Outside an AppImage both do nothing.
pub fn host_env(cmd: &mut std::process::Command)
pub fn host_command(program: impl AsRef<OsStr>) -> std::process::Command // new + host_env
pub fn in_appimage() -> Option<[PathBuf; 2]> // the gate; APPDIR raw and canonical when it holds
```

- **Gate (`in_appimage`, also used by step 4):** Linux only (`cfg!(target_os = "linux")` inside the function, as
  `installable()` does at `update.rs:48-54`, so the pure helpers still compile and test everywhere); `APPIMAGE`
  and `APPDIR` both set; `APPDIR` absolute, and neither it nor its canonical form a root (`parent().is_none()`,
  which also catches `//`; the canonical check catches `/tmp/..`; an empty or root one would match every path);
  and, per D10, `current_exe()` under `fs::canonicalize(APPDIR)` —
  `current_exe()` on Linux is always resolved (`/proc/self/exe`) while `APPDIR` is `${TMPDIR:-/tmp}/.mount_…` as
  given, so a symlinked `TMPDIR` would otherwise fail the gate silently (Tauri's own check,
  `tauri-utils-2.9.3/src/lib.rs:292-307`, only warns). A `.deb` user with an unrelated `APPDIR` in their shell is
  untouched.
- **Which variables:** every variable (D1), not a fixed list. For each whose value, split as a path list
  (`env::split_paths`), has an entry under `APPDIR` — raw or canonical, both always checked (`Path::starts_with`,
  component-wise, so AppRun's `$APPDIR//usr/lib` form matches): drop those entries and the empty ones, set what is left,
  or remove the variable when nothing is. A value with no entry under `APPDIR` (`DISPLAY`, `LS_COLORS`,
  `WEBKIT_DISABLE_DMABUF_RENDERER`) is never touched. Dropping the empty entries is wanted: AppRun's trailing `:` makes
  the current directory a library search path.
- **Plus `APPIMAGE`, `ARGV0`, `OWD` removed** (D3): a Tauri app the child starts (a merge tool, or what `xdg-open`
  opens) would read `APPIMAGE` and restart into our app (`tauri-2.11.6/src/process.rs:48-53`). And
  `PYTHONDONTWRITEBYTECODE` (D13): AppRun sets it for the image, not for the programs it starts.
- **`PATH` decides which program runs.** The image ships its own `usr/bin/xdg-open` ahead of the host's; cleaning `PATH`
  on the `Command` makes a bare name (`xdg-open`, `git`, `sh`) resolve to the host's — std looks a name up in the `PATH`
  set on the `Command` (Rust 1.98 `library/std/src/sys/process/unix/unix.rs:397-413, :469`, `sys/process/env.rs:79-81`:
  an explicit `PATH` makes the child look the name up in it; BI 6 shows it).
- `GDK_BACKEND` and `GTK_THEME` stay (D2): a GTK child runs under XWayland with the plain Adwaita theme.
- **Core for tests:** `fn without_appdir(appdirs: &[PathBuf], vars) -> Vec<(OsString, Option<OsString>)>` (pure)
  and the gate's checks as `fn appdir_of(appimage, appdir, exe) -> Option<[PathBuf; 2]>` (it canonicalizes, so it
  touches the file system); `in_appimage` feeds it the process's values, `host_env` applies both. And
  `fn start_dir(owd) -> PathBuf`, the child's folder: `OWD` when it is absolute, a folder and not inside a `.mount_*`
  image (Q9), else `/`; `host_env` checks it on each spawn (W1's once-per-process cache was reversed in change
  review pass 4).
- **Tests** (`lib.rs` `mod tests`; inputs built with `env::join_paths` and the test `APPDIR` from `env::temp_dir()`, so
  they pass on the Windows and macOS CI legs too — `/tmp/.mount_x` isn't absolute on Windows): AppRun's
  `LD_LIBRARY_PATH` with its trailing `:` → removed; `$APPDIR/usr/lib` + `/opt/mine` → `/opt/mine`;
  `PYTHONHOME=$APPDIR/usr/` → removed; `$APPDIR//usr/lib/gio/modules` → removed; `XDG_DATA_DIRS` keeps its host entries
  in order; `DISPLAY=:0` untouched; a variable equal to `APPDIR` → removed; `APPIMAGE` / `ARGV0` / `OWD` /
  `PYTHONDONTWRITEBYTECODE` → removed; an entry under the canonical form only → removed; the gate: no `APPIMAGE`, no
  `APPDIR`, a relative `APPDIR`, a root `APPDIR` (built as `env::temp_dir().ancestors().last()`, absolute on every OS,
  with the exe under it, `temp_dir().join("x")`, so only the root check refuses it — on Windows the `\\?\` canonical
  form refuses it anyway, so the Linux and macOS legs prove it), an exe outside `APPDIR` → `None`; an exe under a real
  `tempfile::tempdir()` → `Some` (the exe path built from the canonicalized directory: on Windows `canonicalize` returns
  a `\\?\` path). `start_dir`: a `tempfile::tempdir()` → itself; a missing folder, no `OWD`, a relative existing
  folder (`.`) and a real `<tempdir>/.mount_x/usr` → `/`.

### 2. Every spawn builds its `Command` with `host_command` (D7)

- `cli/runner.rs:232` (every git command; hooks, remote and credential helpers, ssh and `GIT_EDITOR` inherit it):
  `Command::from(host_command(&self.git_path))` (tokio's `Command`, the import at `runner.rs:20`, whose only use this
  is).
- `lib.rs:39` `git_version` (`git --version`; a configured git path can be a wrapper script).
- `tools.rs:291` and `:312` `spawn_tool` (custom diff and merge tools; direct on Windows, `sh -c` on unix).
- `conflict.rs:169` (the VS Code / VSCodium `--merge` fallback).
- The test-only spawns (`log/history.rs:307`, `tests/diff.rs:20`) use `host_command` too (a no-op outside an
  AppImage), so they need no `#[allow]`.
- The `use std::process::Command;` lines this leaves unused go (`conflict.rs:9`, `tools.rs:15`,
  `tests/diff.rs:6`, and `lib.rs:24` if the new functions spell the path out; `-D warnings` fails on them);
  `runner.rs:20` keeps tokio's.
- `update.rs:207`'s tail `app.restart()` becomes the statement `#[allow(clippy::disallowed_methods)]
  app.restart();` in this step (the block still diverges), so the step's commit passes clippy before step 4.
- **The guard (D7):** `clippy.toml` at the workspace root (none today; clippy finds it from each crate) with
  `disallowed-methods` on `std::process::Command::new`, `tokio::process::Command::new`,
  `tauri::AppHandle::restart`, `tauri::AppHandle::request_restart` and `tauri::process::restart` (the last two
  unused today, same unscrubbed spawn), each with a reason pointing at `host_command`. Two `#[allow]`s: inside
  `host_command`, and on step 4's `app.restart();` statement (on a statement, not a tail expression). git-core
  doesn't load tauri; if the toolchain warns about the unresolved tauri paths there, add `allow-invalid = true` to
  those entries — the local gate shows it. Since `allow-invalid` would also hide a typo'd path in src-tauri,
  prove the guard once: remove the `#[allow]` on `app.restart();`, see clippy fail, put it back (and likewise a
  bare `Command::new` in git-core). It can't see spawns inside dependencies (`open::commands`, Tauri's
  restart) — those are steps 3 and 4.
- **One end-to-end test**, `crates/git-core/tests/host_env.rs` (its own file, so its own process — it sets
  process variables; edition 2021, no `unsafe`), Linux only, one `#[tokio::test]` in the pattern of
  `tests/ops.rs:19-56` (`have_git`, `GitCli::new("git").run`): `APPDIR=<D>`, the test binary's own folder
  (`current_exe().parent()`, so D10's check holds without a seam), `APPIMAGE=/nonexistent/T4.AppImage` (outside
  `<D>`), `LD_LIBRARY_PATH=<D>/usr/lib:`, `PYTHONHOME=<D>/usr/`, `XDG_DATA_DIRS=<D>/usr/share:/usr/share`; git run
  from a temp repo outside `<D>` with `-c alias.e=!env e`: no `<D>`, no `LD_LIBRARY_PATH`, no `APPIMAGE` in the
  output, and `XDG_DATA_DIRS=/usr/share` (so over-scrubbing fails too).

### 3. The file opener (D4)

`open_path` (`src-tauri/src/commands/repo.rs:448`) and the release-page button (`SettingsDialog.tsx:124`, JS
`openUrl`) go through `tauri-plugin-opener`, which spawns `xdg-open` (or `gio` / `gnome-open` / `kde-open`) with the
app's environment — so the image's own `xdg-open`, first on `PATH`, runs (step 0); the plugin has no hook for it.

- Add `open = "5"` to `src-tauri/Cargo.toml` (already in `Cargo.lock` at 5.4.2 through the plugin; nothing new is
  downloaded, but the lock's `t4-git-ui` entry changes and CI runs `--locked`, so `Cargo.lock` is committed with it).
- `pub(crate) fn open_on_host(target: &str) -> Result<(), tauri_plugin_opener::Error>` in
  `src-tauri/src/commands/repo.rs` (`&str` fits both `open_url`'s `AsRef<str>` and `open::commands`' `AsRef<OsStr>`;
  `open_path` passes `&abs.to_string_lossy()`, as lossy as today; the plugin's `Result` alias isn't public,
  `lib.rs:27`): inside an AppImage (`in_appimage`), try each of
  `open::commands(target)` with `host_env`, null stdio, spawn, reap with `git_core::tools::detach` (made `pub`,
  `tools.rs:268`); the first that starts wins, and if none starts the last spawn error is returned (the `open`
  crate's own pattern, `open-5.4.2/src/lib.rs:296-305`). Everywhere else, the plugin's public free function
  `tauri_plugin_opener::open_url(target, None::<&str>)` (re-exported at `lib.rs:29`; no `AppHandle` needed) — the
  same `crate::open::open` as the `Opener::open_path` used today (`open.rs:33-36`, `lib.rs:116-125`). A spawn's
  `io::Error` converts through the plugin's `Error::Io` (`error.rs:17-18`), so `open_path`'s existing `map_err`
  (`repo.rs:450-452`, *could not open {path}*) covers it unchanged. (It skips
  the `open` crate's double fork: `detach`'s thread waits on `xdg-open`, which in its generic fallback can wait for
  the opened program — one parked thread per open; T7.)
- **Missing file (D12, every OS):** `open_path` checks `abs.metadata()` before opening, through
  the same `map_err` (the `blocking` closure returns `AppError`, which converts only from `GitError`, `error.rs:8`;
  the metadata error is lifted into the plugin's `Error` first). New behaviour on Linux only (every package): the
  detached `xdg-open` spawn succeeds whatever the file. Windows and macOS already refuse a missing file —
  `ShellExecuteExW` returns *file not found* (`open-5.4.2/src/windows.rs:292-317, :370-373`; the plugin turns on
  `shellexecute-on-windows`, `tauri-plugin-opener-2.5.5/Cargo.toml:67`), macOS's `open` exits non-zero and
  `that_detached` waits for it and turns that into an error (`open-5.4.2/src/lib.rs:285-289, :181-191, :346-352`)
  — so there it errors earlier with the same wording. Proven on the VM (BI 6).
- `open_path` uses it for *Open* only. *Reveal* goes over D-Bus (the file manager is started by the bus, not by us)
  and stays.
- A new argument-free `async` command `open_release_page` in `update.rs`, beside the private `release_url()`
  (`update.rs:56-58`), so no URL from the page is trusted: `open_on_host(&release_url())` (which picks the plugin
  outside an AppImage itself), run through `blocking(...)` as `open_path` does (`use super::repo::{blocking,
  open_on_host};`, the pattern at `ops.rs:27`; a sync command runs on the main thread, and on macOS
  `that_detached` waits for `/usr/bin/open`); its error mapped the way `update.rs`
  maps every error, `AppError::Internal(e.to_string())` (the frontend's toast already carries the title *Couldn't
  open the release page*, `SettingsDialog.tsx:124`). Registered in `src-tauri/src/lib.rs:183+`; `ipc.ts` gains
  `openReleasePage`, imported into `SettingsDialog.tsx` under an alias; the local `openReleasePage` (`:123-125`,
  called by *Download…* `:131` and *What's new* `:238`) loses its argument and calls it, keeping its toast.
- `UpdateInfo.releaseUrl` then has no reader and is dropped (D11): it is always `release_url()`'s fixed
  `/releases/latest` (`update.rs:125`). Edits: `update.rs:31-34, :125`, the test comment `:227-228` (the backend
  opens the link now), `types.ts:665-672`, `src/README.md:151`, and the test fixtures (`App.test.tsx:189,
  :208-209`, `updateStore.test.ts:22`).
- With `openUrl` gone, the webview's opener grants (`opener:allow-open-url`, `opener:allow-default-urls`,
  `src-tauri/capabilities/default.json:15-16`) and `@tauri-apps/plugin-opener` (`package.json:26`, with
  `package-lock.json`) have no user and go. The plugin's click interceptor acts on `<a target=_blank>` and on a
  ctrl- or shift-click of any `<a href>`, and `src/` has no `<a>` at all. The Rust plugin stays (Reveal, and Open
  outside an AppImage).

### 4. The relaunch after an update, AppImage only (`update.rs:207`, `lib.rs:303`, `state.rs`)

`app.restart()` (from a command thread) asks the event loop to exit and, on `RunEvent::Exit`, Tauri runs
`process::restart`: `Command::new($APPIMAGE).args(…).spawn()` with the app's environment, no hook
(`tauri-2.11.6/src/app.rs:594-604, :1430-1437`, `process.rs:74-89`).

- `AppState` gains `relaunch: AtomicBool` (next to `installing`, `state.rs:45`, and in its `Default`, `:63-64`).
- `install_update`'s doc comment (`update.rs:138-140`: replaced by `restart` or by NSIS) gains the third way out:
  the AppImage exits and the `Exit` arm relaunches it.
- Per D10, `installable()` (`update.rs:48-54`) asks `git_core::in_appimage()` instead of reading `APPIMAGE` alone;
  its test (`:242`) becomes `assert!(!installable())` on Linux (a test binary is never under an `APPDIR`, even run
  from an AppImage's terminal; the gate's logic is tested through `appdir_of`); its doc comment (`:45-47`, *its
  absence on Linux means this is a deb or rpm install*) is reworded to the gate.
- `install_update`, after `install` succeeds: inside an AppImage (`in_appimage`), set `relaunch`, call
  `app.exit(0)` and never return (`std::future::pending::<()>().await; unreachable!()`, as `restart` never returns);
  everywhere else, `app.restart()` as today (its one `#[allow]`, D7). Windows (the installer ends the process inside
  `install`) and macOS are unchanged; `.deb` / `.rpm` never get here (`installable()`, `update.rs:48-54`).
  `app.exit(0)` is Quit's path (`window.rs:452-453`); the frontend already expects `install_update` never to
  resolve (`ipc.ts:183`).
- The `RunEvent::Exit` arm (`lib.rs:303`), after `end_restore`, before `shutdown_logging`: if `relaunch` is set, spawn
  `tauri::process::current_binary(&app.env())` (the `$APPIMAGE`) with `app.env().args_os.iter().skip(1)` through
  `host_command` (so it also starts in `OWD`, not the old mount; R1, Q7), as Tauri's restart does (`process.rs:48-53,
  :83`); log a failure. Exit is the right moment: Tauri runs plugins' exit handlers before ours (`app.rs:2645-2648`,
  then `:1431`), so single-instance has already let go of its D-Bus name (`single-instance-2.4.5 linux.rs:95-111`), and
  the new process doesn't hand its launch to the dying one. `ExitRequested` (`lib.rs:297-300`) already marks `exiting`
  on every exit, so the windows come back the same way — no change there.
- If `request_exit` fails, `app.exit` falls back to `process::exit` without an `Exit` event (`app.rs:574-579`), so
  no relaunch — Tauri's restart has a fallback spawn there (`app.rs:605-609`). Accepted as the Quit path's
  behaviour; the update is in place and a manual start works.
- A variable the user launched with (`WEBKIT_DISABLE_DMABUF_RENDERER=1`, the README's workaround) carries over, as
  the README promises (`README.md:43-45`); the new image's runtime sets fresh `APPIMAGE` / `APPDIR`.
- **Only helps updates from 0.10.14 on:** the relaunch is done by the old app. 0.10.13 → 0.10.14 on an affected
  host still exits without coming back (D5); the release body says so.
- No unit test (it ends the process); step 6 walks it.

### 5. Docs

- `docs/plans/open-items.md` §S: the scope results (done in this plan's commit); the env row moves to the done file in
  the walk-record commit, once group BI passes on the VM and its record (`41025ce`) is merged, before the squash (the
  user, 2026-09-29).
- `README.md` install notes: nothing (the AppImage just works); release body (`release.yml:505`, a static template
  that ships with every later release): one line scoped by version, as the 0.10.12 line is — *an AppImage from
  0.10.13 or earlier doesn't reopen after updating on some distributions; start it again yourself* — with a
  markdown `<!-- drop with the 0.10.12 line -->` right beside it (a `#` inside the `|` block would be published;
  an HTML comment isn't rendered).
- The rule *every spawn goes through `host_command`* lives in its doc comment and the clippy reason (the Rust side
  has no README; `src/README.md` is the frontend's: its `:151` `UpdateInfo` line changes (D11)).
- Triage filings (the rulings below): T1 and T2 → `docs/plans/open-items.md` §S (their source, the 0.10.13 AppImage
  walk; each row *→ Phase 2b*; §S stays open for them once the env row closes); T6 → §Q, and T7 → §Q, with their reopen
  triggers; T5 → `docs/plans/open-items-done.md`; the close-out plan's Phase 2 table gains T1 and T2.
- `docs/smoke/smoke-linux.md` *Testing an AppImage* (`:177-209`): the control step and the `/proc/<pid>/environ`
  check; `:244-245` (*AppImage updates need the signing key; walk by hand*) per D9.
- Smoke: a new group **BI** in `docs/smoke/smoke-test-post-v1.md` with step 6's rows; the walk record in
  `docs/archive/walks/`; the VM's `41025ce` record merged in.
- `docs/plans/2026-09-26-close-out-plan.md`: the hotfix in *Order* before Phase 1b.

### 6. Walk on the VM — smoke group BI (Ubuntu 26.04 with the rust-coreutils backport)

Build: the hotfix as an AppImage **built on Ubuntu 22.04** — the bug exists because the image carries 22.04's
libraries; one built on the 26.04 VM would carry 26.04's, and every control below would pass without the fix — and
versioned **0.10.12** (D9), so it can update to the published 0.10.13 and prove the relaunch before the release.
Before rows 1–6 and 8, run the control: the same host program under the unscrubbed environment still fails, so a pass
means the fix and not a changed host. BI 3's SSH fetch is a no-regression check (ssh was never affected), BI 7 has no
control, and BI 9 is Windows.

1. A `pre-commit` hook that runs `cat` and `ls`: the commit goes through.
2. A `#!/usr/bin/env bash` hook and a `#!/usr/bin/env python3` hook: both run.
3. HTTPS clone, fetch, pull and push against GitHub (a credential helper in use); one SSH fetch.
4. A custom diff tool and a custom merge tool, both meld (itself a Python program); the VS Code fallback if installed.
   With no meld already running (meld may be single-instance and hand a new start off to the running one), the
   started meld's `readlink /proc/<pid>/cwd` is the folder the app was first started from, not a `.mount_` path. Not
   the VS Code fallback's: `code` hands off to a running instance, or forks and exits.
5. An interactive rebase with a reword, and a merge conflict resolved then *continue*.
6. *Open* a file from the tree: it opens in the host's default app, and
   `sudo strace -f -qq -e trace=execve -p <app pid> 2>&1 | grep xdg-open`, started before the click, shows exactly
   which `xdg-open` ran: an `= -1 ENOENT` line for each `PATH` folder tried first, then the `execve` line ending `= 0`
   shows `/usr/bin/xdg-open`, not the mount's. Open it in an app not already running (a running one shows its own old
   environment): the opened app's `/proc/<pid>/environ` has no `mount_` path, and its `readlink /proc/<pid>/cwd` is
   not a `.mount_` path (the folder the app was first started from, or the session's when D-Bus starts the app). The
   bundled `xdg-open` also exits 0, so the absence of an error toast proves nothing. The release-page button opens
   the browser; *Reveal*: the file manager shows the file; *Open* a file deleted since the tree loaded — a *could not
   open* toast (D12; before the fix, nothing happened).
7. `/proc/<git pid>/environ` during a slow fetch: no `mount_` path, no `PYTHONHOME`.
8. Update the 0.10.12-versioned build to the published 0.10.13 through Settings: the app comes back by itself, on
   0.10.13, with its windows; `tr '\0' '\n' </proc/<new pid>/environ | grep ^OWD=` shows the folder the app was first
   started from, not a `/tmp/.mount_*` path (R1); once the old process is gone,
   `findmnt -l | grep -c '\.mount_T4-Git'` shows 1 (only the new image's mount; other AppImages may be mounted too).
   Walked from a terminal in the desktop session, on the desktop's display (not Xvfb), with the isolated store but
   without `smoke-linux.md`'s `dbus-run-session` (its bus dies with the old process):
   `HOME=$S/home WEBKIT_DISABLE_DMABUF_RENDERER=1 SSH_ASKPASS_REQUIRE=never GIT_ASKPASS= setsid ./<file>.AppImage > $S/appimage.log 2>&1 &`
   — and with no other T4 Git UI running (a running one would take the launch through single-instance, or add a
   `.mount_T4-Git` mount).
9. Windows over CDP: open a file, the release-page button, an HTTPS fetch — unchanged (the gate never fires); open
   a file deleted since the tree loaded — still a *could not open* toast.

## Decisions (the user)

Taken 2026-09-29 after review pass 1: **D3 remove**, **D7 constructor + clippy**, **D9 (a) CI dispatch run**,
**D10 yes, check the exe**; then **D1 every variable**, **D2 leave**, **D5 release-body line**, **D6 no** — each as
recommended; **D8 declare `open = "5"`**. After pass 2: **D11 drop
`releaseUrl`**; **D10 kept** after the correction to its reasoning. After pass 5: **D12 the missing-file check on
every OS** (as recommended). After step 0: **D4 own spawn**, **D13 remove `PYTHONDONTWRITEBYTECODE`**, **D2 kept**
after the `GTK_THEME` fact — each as recommended. Nothing open.

Triage rulings 2026-09-29: **T1 → Phase 2b**, **T2 → Phase 2b** (both open-items §S, with the batch's docs);
**T3 → BI 3**; T4 = D5; **T5 accept, closed** (done file); **T6 accept, §Q** — reopen when a Flatpak or snap
build is planned; **T7 accept, §Q** — reopen when the thread count or memory grows noticeably over a long session.

- **D1. Which variables.** Every variable with an entry inside the image *(recommended: catches `PYTHONHOME`, the
  GTK/GIO module paths and any hook variable not yet seen; a value without such an entry is never touched)*, or a
  fixed list (`LD_LIBRARY_PATH` + named ones: easier to read, misses what isn't on the list).
- **D2. `GDK_BACKEND=x11` (and `GTK_THEME` if set).** Leave them *(recommended: not a path; children just run under
  XWayland)*, or remove `GDK_BACKEND` from children when it is `x11` (risk: removes a value the user set on purpose,
  indistinguishable from AppRun's). Step 0 showed the hook sets `GTK_THEME=Adwaita:<dark|light>`, so a GTK child
  gets plain Adwaita instead of the user's theme — cosmetic; ruling kept.
- **D3. `APPIMAGE`, `ARGV0`, `OWD` in children** (`APPDIR` goes under D1: its value is inside the image). Remove
  them *(recommended, flipped in review pass 1: a Tauri app the child starts reads `APPIMAGE` and its restart would
  launch our app instead of itself; a child AppImage's own runtime sets fresh ones)*, or leave them.
- **D4. The file opener.** Own spawn through `open::commands` with `host_env` *(recommended if step 0 shows
  `xdg-open` failing; ~30 lines + a new command)*, or leave it on the plugin (if step 0 shows it working, the
  opener only risks loading the image's GIO modules into the host's `gio`). Step 0: it fails, silently.
- **D13. `PYTHONDONTWRITEBYTECODE=1`** (set by AppRun, not a path, so D1 doesn't catch it). Remove it from children
  *(recommended: set for the image, not for what it starts; a value the user set on purpose can't be told apart)*,
  or leave it (harmless: Python just doesn't cache bytecode).
- **D5. 0.10.13 → 0.10.14 on an affected host still doesn't relaunch.** A release-body line *(recommended)*, or
  patch `AppRun` in the repack to `#!/bin/bash` so the old app's restart finds it (fragile: our repack edits a
  linuxdeploy file, and every later bundler change can break it).
- **D6. Also drop the bundled `libsystemd` / `libnghttp2` in the repack.** No *(recommended: whack-a-mole — the next
  host library to move ahead breaks the next thing, and the image needs its own copies on older hosts)*, or yes as
  belt and braces.
- **D7. Guard against a future spawn that skips the scrub.** A `host_command` constructor plus `clippy.toml`
  `disallowed-methods` on the plain constructors and `AppHandle::restart` (step 2; ~15 lines; CI's clippy is
  `-D warnings`, so a new `Command::new` fails the build) *(recommended: the next spawn site would otherwise regress
  silently, and only on one distro)*, or the doc comment and review only.
- **D8. `open` crate version.** Declare `open = "5"` matching the lock *(recommended)*; no choice really, listed so
  a new direct dependency isn't a surprise.
- **D9. Where the 22.04-built test AppImage comes from** (reopened in review pass 1: a VM build can't reproduce the
  bug). **(a), chosen:** a Release `workflow_dispatch` run — the established route (`smoke-linux.md:179`, the
  `packages-Linux` artifact), signed and repacked exactly as a release — of a separate branch `walk/0.10.12`: the hotfix
  plus one throwaway commit setting 0.10.12 the release skill's way (edit `Cargo.toml` and `package.json`, then `cargo
  check` and `npm install` pull both lock files along, git-core's entry included). `hotfix/0.10.14` never carries it, so
  its squash needs no force-push. The dispatch has no inputs, and without a tag the version job skips its tag checks,
  so a lower version builds (`release.yml:60-74`); `checks` and `publish` run
  only on tags. ~25 min; pushing `walk/0.10.12` is your go at that moment. (b) an `ubuntu:22.04` container on the VM
  repeating the release's build steps (`release.yml:123-129, :160, :220, :234-246`; nothing pushed, but it rebuilds the
  pipeline by hand, and the VM's container tooling is unchecked); (c) walk BI 1–7 on the dispatch build but prove the
  relaunch (BI 8) only at the release after 0.10.14.
- **D10. Should the gate also require the running program to be inside `APPDIR`?** (review pass 1's question) Yes
  *(recommended: two lines; Tauri checks the same thing but only warns. It also closes a pre-existing hazard when
  `installable()` uses the same gate: a `.deb` install started from a terminal that is itself an AppImage inherits
  that image's `APPIMAGE`, so today it offers *Install*)*; or only the variables (then `installable()` stays as
  is). **Corrected in review pass 2:** the hazard is a false *Install* offer and a ~60 MB download that then
  fails, not an overwrite of the other program's file — a `.deb` binary carries the bundle-type marker
  (`tauri-utils platform.rs:353-358`), so the updater routes to `install_deb` (`updater.rs:1045-1050`), which
  rejects AppImage bytes (`:1126-1131`). Reasoned from the source, assuming the bundler patches the marker per
  package; not reproduced.

- **D11. `UpdateInfo.releaseUrl`, unread once the release-page command takes no argument** (review pass 2). Drop it from
  the backend, types, README and fixtures *(recommended: it always holds the same fixed URL, so it carries nothing; ~8
  small edits, TypeScript catches every leftover)*, or keep it (a dead field on the wire, zero risk).

- **D12. A missing file on *Open*** (review pass 5: the check added in pass 2 matched a plugin function the app
  doesn't call). Check on every OS, error *could not open {path}* *(recommended: one call, same on every
  platform)*; only inside the AppImage; or no check (a missing file fails silently inside the AppImage).
  **Corrected in pass 6, ruling kept:** Windows and macOS already refuse a missing file (read from the `open` crate's
  source, not run), so the check is new on Linux only (every package).

## Triage carried in (ruled 2026-09-29, see Decisions)

- **T1. A failed commit's toast shows a hook's first output line** (the VM saw *hook1 start*), not why it failed:
  git prints nothing of its own when a hook refuses, and the toast shows stderr's first line
  (`src/store/toastStore.ts:104-107`). Pre-existing, not from Phase 2a. Fix: in `commit`, when stderr has no
  `fatal:` / `error:` line, report the last non-empty one (~6 lines + a test); the op log has the full output. Same
  blind spot in merge / pull (a `pre-merge-commit` hook). *Recommended: Phase 2b, keeping the hotfix to the env.*
- **T2. A custom tool that fails to start still says *Opened …*.** The tool is detached; its exit status is never
  read (`tools.rs:268-272`). Fix: watch the first ~300 ms for an early non-zero exit (a late one is normal for some
  tools — kdiff3 unsaved, Beyond Compare *files differ* — so it can't be reported; every open gets ~300 ms slower).
  Pre-existing; the hotfix removes the trigger seen here. *Recommended: Phase 2b.*
- **T3. SSH remotes weren't walked from the AppImage.** *Recommended: in BI 3 (one SSH fetch).*
- **T4. 0.10.13 AppImage users must start the app by hand after updating to 0.10.14.** See D5.
- **T5. Launching the extracted image (`squashfs-root/AppRun`, no `APPIMAGE`) isn't scrubbed.** Dev-only.
  *Recommended: accept, closed.*
- **T6. A Flatpak or snap build would need its own escape (`flatpak-spawn --host`).** None is planned.
  *Recommended: accept, closed. Ruled: accept, §Q (reopen when a Flatpak or snap build is planned).*
- **T7. *Open* inside an AppImage parks one thread per open while `xdg-open` runs** (step 3 skips the `open`
  crate's double fork; `xdg-open`'s generic fallback can wait for the opened program). *Recommended: accept, closed
  — a parked thread costs little, and opens are user clicks. Ruled: accept, §Q (reopen when the thread count or
  memory grows noticeably over a long session).*

## Change review

Pass 1 (2026-09-29, steps 1–5 on `hotfix/0.10.14`): code 1 should-fix, docs 2 should-fix, and nits; each fix is a
fixup commit onto its step.

- **Code (should-fix):** `clippy.toml` now also bans the opener plugin's `open_url` / `open_path` and the `open`
  crate's `that*` / `with*`, which start the opener with the app's environment; the one plugin call left (outside
  an AppImage, in `open_on_host`) carries an `#[allow]`.
- **Docs (should-fix):** BI 6's `ps` check could miss (the host's `xdg-open` exits within milliseconds, and
  `grep xdg-open` matches itself): a polling loop now, and the opened app's `/proc/<pid>/environ`. The close-out
  plan's *Next* still named the AppImage walk.
- **Nits:** a vitest for *Download…* on an update that can't be installed; BI's control scope; wording in BI 6,
  BI 8 and D9.
- **R1 (the user: fix).** The relaunch started the new AppImage in the old one's working folder: AppRun changes into
  `$APPDIR/usr`, so the new image pinned the old mount and took it as its `OWD`. It now starts in `OWD` (`/` when
  that is gone); BI 8 checks it.
- **R2 (the user: fix).** A tool's lookup searched the app's `PATH`, where the image's folders come first, while the
  tool runs with them scrubbed: the lookup now skips them (the scrub's own test).

Pass 2 (2026-09-29): docs 2 should-fix, and nits; the user's Q7 and Q8, both fixed. Each fix is a fixup commit onto
its step.

- **Docs (should-fix, S1):** BI 8's `/proc/<new pid>/cwd` check was wrong: AppImageKit's `AppRun.wrapped` always
  changes into the new image's `$APPDIR/usr`. It now reads the new process's `OWD`, and counts the `.mount_` mounts
  once the old process is gone.
- **Docs (should-fix, S2):** BI 6's `ps` loop could still miss the host's `xdg-open`, which exits within
  milliseconds: `strace -e trace=execve` on the app, started before the click, shows which one ran; the opened app's
  environment stays the second proof.
- **Nits:** a plan line over 120 columns; step 6's control sentence matched to BI's intro; the status line.
- **Q7 (the user: fix).** Inside an AppImage every child now starts in `OWD` (`/` when that is gone), set in
  `host_env`: AppRun changes into `$APPDIR/usr`, so a tool, the merge editor, the opener and what it opens started
  inside the read-only image and kept the old mount busy after Quit or an update's relaunch. A folder the caller sets
  afterwards (git's `repo_dir`) wins. The relaunch's own `OWD` code (R1) goes: `host_command` sets it now. BI 4 and
  BI 6 check a child's folder.
- **Q8 (the user: fix).** Inside an AppImage the tool lookup also skips `PATH`'s empty entries, as the scrub does;
  outside one nothing changes.

Pass 3 (2026-09-29): no code findings; the user's Q9, W1 and W2, and doc nits N1–N4, all fixed. Each fix is a fixup
commit onto its step.

- **Q9 (the user: fix).** `start_dir` refuses an `OWD` with a `.mount_*` component (`/` then): where 0.10.13's own
  relaunch works, it starts 0.10.14 from `/tmp/.mount_<old>/usr`, the new runtime records that as `OWD`, and every
  later child and update would carry it forward.
- **W1 (the user: fix).** `host_env` works the folder out once per process (a `OnceLock`), so a hung network folder
  hangs one spawn, not every git op. `start_dir` stays pure and tested. *Reversed in pass 4.*
- **W2 (the user: fix).** `start_dir` also requires `OWD` to be absolute.
- **Doc nits:** N1, BI 6: strace prints an `ENOENT` line for each `PATH` folder before the one that runs, so the
  line ending `= 0` is the proof, and the opened app must not be running already. N2, BI 4: the folder check names
  meld or the Python tool, not the VS Code fallback. N3, BI 8: the mount count greps `.mount_T4-Git`, walked from the
  desktop session. N4: step 1 lists `start_dir` and its test.

Pass 4 (2026-09-29): code 1 should-fix, and doc fixes; each fix is a fixup commit onto its step.

- **Code (should-fix): W1's cache.** The `OnceLock` froze the first `is_dir` answer: a start folder deleted during
  the session made every later spawn fail with *NotFound* — *Open*, the custom tools, the `git_version` check and
  the relaunch. And it didn't help a folder that hangs for good: every caller waits in `get_or_init` behind the
  first. The user reverted W1: `host_env` checks the folder on each spawn again, so a deleted one falls back to `/`.
- **Docs:** pass 3's nit labels D1–D4 clashed with the Decisions' D1–D4, now N1–N4. BI 4: the custom tool is
  meld (a Python program), checked with no meld already running. BI 8: walked with `HOME=$S/home` but without
  `dbus-run-session`, and with no other T4 Git UI running. BI 6 and row 6 reflowed.

Pass 5 (2026-09-29): clean apart from nits — BI 8's launch command spelled out, *and* → *or*. The user: the §S env
row closes in the walk-record commit (step 5). Pass 6: clean apart from one wording nit (*the desktop's display (not
Xvfb)*), fixed. Loop done.

**Triage (the user, 2026-09-29):**

- **T-A.** The relaunched app may inherit the old runtime's keepalive pipe and keep the old mount (pre-existing,
  unmeasured): BI 8's mount count measures it; decide after the walk if it shows 2. → reproduced; fixed.
- **T-B.** A blame test failed once on Windows (`test_util.rs:84`), passed on re-run: accepted, open-items §Q.
- **T-C.** The WSL clone `~/t4-hotfix`: kept for the per-commit Linux check after the squash, then deleted.
- **T-D.** 21 small items (edge cases, pre-existing behaviour, trades already chosen, doc style): accepted as
  closed in bulk, kept apart for a later review — `docs/plans/open-items-done.md` §T, pointed to from open-items §S.

**Walk finding T-A (BI 8, VM, 2026-09-29).** Measured: after an in-app update, 2 `.mount_T4-Git` mounts stay until
the relaunched app quits. The old runtime's FUSE daemon holds the write end of a keepalive pipe and unmounts once every
read end is closed; the read end sits in the relaunched app, the new runtime's FUSE daemon and the WebKit children,
inherited without `O_CLOEXEC` (fd 3, fdinfo flags `00`). Every process the app starts — git, meld, the opener —
inherits it the same way, and the new runtime's own keepalive too. The user: fix in 0.10.14. Design:
`git_core::keep_inherited_fds_from_children`, called first thing in `run()`, before the Tauri builder and any spawn;
inside an AppImage only (Linux), it walks `/proc/self/fd` and sets `FD_CLOEXEC` on every fd from 3 up, ignoring
errors. The app keeps its own copy, so the runtime still unmounts when the app exits; children just stop inheriting
it. Tested on Linux with a `pipe` made without `O_CLOEXEC` (`cloexec_from`). Review: the mount now lasts as long as
the app, not also its WebKit helpers (they run from inside the image); a helper still tearing down at exit could crash
on the unmounted image. Unlikely, unmeasured — the user: the BI 8 re-walk checks for crashes (`coredumpctl list`,
`journalctl -b | grep -i webkit`) after Quit and after the relaunch.

**Re-walk finding (BI 8, VM, 2026-09-29).** The mount count is fixed, but the process-wide fix made WebKitWebProcess
and WebKitNetworkProcess die with SIGBUS on every exit (apport's log, signal 7, 2 exits out of 2; the build without
the fix: none): no longer holding the keepalive, they lost the image while tearing down. The user: only the
processes the app starts drop it. Design, replacing the one above: `host_env`, inside an AppImage, adds a `pre_exec`
hook (`drop_inherited_fds`) that runs `close_range(3, ~0, CLOSE_RANGE_CLOEXEC)` in the child before exec — one
syscall, no allocation between fork and exec; an error (`ENOSYS` before Linux 5.9, `EINVAL` on 5.9–5.10, `EPERM`
under a seccomp filter) is ignored and leaves the pre-fix behaviour. `keep_inherited_fds_from_children` and its call
in `run()` are gone. WebKit's helpers inherit the keepalive as before, so the image unmounts once the app and its
helpers have exited. Tested on Linux: a `pipe` made without `O_CLOEXEC` reaches `sh` started plainly, not with the
hook (`drop_inherited_fds_keeps_an_inherited_pipe_from_the_child`), and not git started through the runner under a fake
mount (`tests/host_env.rs`). BI 8 passed on it (Release run 36548652011).

**Change review pass 7 (after the re-walk).** 2 should-fix, 8 nits. The user: rows 1–7 re-walked on the final build
(only row 8 had run on it); the fork-per-spawn §Q row kept, reworded (the environment scrub already forked programs
named without a path; the hook adds a fork only for full paths); the cancel test's false `--port=0` comment fixed; all
nits fixed (error codes by kernel version, comment and commit-message wording, BI 8 needs a Quit of the hotfix build
itself, the walk record's pre-squash hash, an end-to-end test of the hook through the runner).

**Pass 8** — 1 should-fix, 4 nits, all in pass 7's fixes, all fixed: the walk record named a hash the re-squash would
retire again (now the commit's subject), the VS Code fallback belongs to the bare-name cause in the §Q row, gpg-agent
and ssh dropped from the doc comment's examples (both close inherited descriptors), test wording, wraps; one
suggestion not applied (the end-to-end test's control doesn't go through git), accepted by the user to open-items §Q.
The VM also quits the hotfix build on the desktop display in the rows 1–7 re-walk (BI 8's new wording). **Pass 9**
— 1 should-fix (this paragraph was missing), 2 nits (wraps, one test-doc wording), fixed. **Pass 10** — clean.

**Rows 1–7 re-walked** on the final build (Release run 36548652011), all green, plus a desktop Quit for BI 8. One
crash-reporter entry at the long session's quit, unexplained and not reproduced in 6 later quits, accepted by the
user to open-items §Q. **Pass 11** (the docs since pass 10) — 2 should-fix (an unverified crash worded as fact; this
plan missing the rulings above), 3 nits: 2 fixed, 1 put to the user at cleanup (the walk records cite hashes that
exist only on the walk branches, so they vanish if those branches are deleted). **Pass 12** — 1 should-fix, 2 nits,
all in this record, fixed. **Pass 13** — clean.

## Verify

- Local gates (Windows): `cargo fmt`, `cargo clippy --workspace --all-targets -- -D warnings`,
  `cargo test --workspace`, `tsc`, `npm test`.
- CI on all three OS (clippy on Linux compiles the `#[cfg(unix)]` code the Windows gate never sees).
- Group BI on the VM, BI 9 on Windows.

## How it runs

1. Plan review loop until a pass is clean; decisions asked as they come.
2. On your go: branch, steps 1–5 (a `coder` agent), gates, change review loop, triage.
3. Step 0 done on the VM 2026-09-29 (read-only). Step 6: the 22.04 build per D9 (ask to push
   `walk/0.10.12`, then dispatch Release), the AppImage handed to the VM session with the walk rows; its record
   committed there, merged here. The walk branches (`walk/0.10.12`, `walk/0.10.12-2`, `walk/0.10.12-3`, and the VM's
   `bi-walk`) are deleted (local and remote, on your word) after the walk.
4. Squash (rehearsed in a throwaway worktree, tree identical), then ask to push, then ask to tag 0.10.14 (release
   skill), then the release gate: the VM's 0.10.13 AppImage updated to 0.10.14 by hand-relaunch (D5), and your
   Windows install updated through the updater.
