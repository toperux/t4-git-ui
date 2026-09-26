# Driving the smoke tests on Linux

The Linux counterpart of `smoke-cdp.md`. WebKitGTK has no CDP, so the page is driven over WebDriver:
`tauri-driver` launches a debug build through `WebKitWebDriver`, and `docs/smoke/wd.mjs` talks to it.
The app runs on a headless Xvfb display, where `xdotool` reaches what WebDriver cannot: the native GTK
dialogs, real OS keys, window size. Adapted from t4-markdown-viewer's drive-app skill.

Proven 2026-09-26 on Ubuntu (GNOME, Wayland host) against 0.10.12. The run opened `work` through the
folder picker, right-clicked a grid row, double-clicked the working-tree row, staged a hunk, answered a
Discard hunk box both ways, wrote the signing config and quit through the app.

## Prerequisites

The README's Tauri packages, Node 24 (`node --version`; the build runs `tsc` and vite), then:

```bash
sudo apt install webkitgtk-webdriver xvfb xdotool imagemagick xclip
cargo install tauri-driver --locked
```

`xclip` reads the Xvfb clipboard: `xclip -display :99 -selection clipboard -o`. The `Copied …` toast carries the copied
text too, as on Windows.

## Scripts

- `docs/smoke/wd.mjs`, run from the repo root. Every verb prints one line; a WebDriver error prints one
  line and exits 1:
  - `start <app> [args…]`
  - `eval "<expr>"`: awaits a promise; a thrown error comes back as `{"thrown": …}`.
  - `click "<sel>" [Shift|Control|Alt]`
  - `rclick "<sel>"`
  - `dblclick "<sel>"`
  - `key <Key>[+<Key>…]` (`key Alt+2`, `key Control+,`)
  - `drag "x,y x,y …"`: viewport CSS px; a single point clicks there.
  - `shot <out.png>`
  - `window [n]`
  - `raw <METHOD> <path> [json]`
  - `stop`

  The session id lives in `$TMPDIR/t4-git-ui-wd-session`, so separate calls share one session.
  `WD_PORT` sets the port if tauri-driver isn't on 4444.
- `docs/smoke/fixtures/xdialog.sh`: the counterpart of `smoke-dialog.ps1`, on display `:99`. Set
  `XDISPLAY` to change the display, not `DISPLAY`: the desktop session always sets that one.
  - `<pid> --dump`: the app's visible windows and their titles.
  - `<pid> --title '^Open repository$' /tmp/t4/work/`: a folder picker. One call picks it.
  - `<pid> --title '^Discard hunk$' --ok|--cancel`: an `ask()` box. Return is the affirmative button
    (**Discard**) and Escape is Cancel. Both were checked against the file's checksum.
- `docs/smoke/fixtures/xclose.py <window id>`: closes a window as its title-bar × does, by sending
  `WM_DELETE_WINDOW`. Xvfb has no window manager to do it, and `xdotool windowclose` destroys the window
  instead, skipping the app's close handling. Run it with `DISPLAY=:99`; take the id from
  `xdialog.sh <pid> --dump`.
- `docs/smoke/fixtures/smoke-fixtures.sh`: the main fixture, into `/tmp/t4`. The group `.sh` fixtures
  take `T4_ROOT=/tmp/t4`.

## 1. Build

```bash
npm run tauri build -- --debug --no-bundle --config '{"identifier":"dev.topher.t4gitui.smoke"}'
```

- **The renamed identifier** keeps the build clear of an installed app. Single-instance keys on the
  identifier (over D-Bus), and without the rename a launch hands its argv to `/usr/bin/t4-git-ui` and
  exits.
- **`--no-bundle`** needs no signing keys.
- **Rebuild after every `src/` edit:** assets are embedded at build time.
- **The result** is `target/debug/t4-git-ui`.

## 2. Launch

Give the app its own `HOME`. The store (`~/.local/share/<id>/recents.json`, `layout.json`), the
window state (`~/.config/<id>/`), the logs and, above all, **`~/.gitconfig`** then live in the
scratchpad. Settings › Signing writes the global git config, and this keeps it out of the user's
file. Nothing needs backing up or restoring.

The cost: gpg follows `$HOME`, so `~/.gnupg` is not there. A row that really signs needs
`GNUPGHOME=$HOME/.gnupg` on the tauri-driver line, **before** `HOME=` — bash applies prefix assignments left
to right, so after it `$HOME` is already the scratch one (`GNUPGHOME=$HOME/.gnupg HOME=$S/home … tauri-driver`). (ssh
finds `~/.ssh` from the passwd entry, not `$HOME`, so ssh remotes are unaffected.) If your identity is in
`~/.config/git/config` rather than `~/.gitconfig`, copy that instead.

```bash
S=<scratchpad>/app; mkdir -p $S/home; cp ~/.gitconfig $S/home/    # user.name / email for commits
Xvfb :99 -screen 0 1600x1000x24                                        # background
HOME=$S/home DISPLAY=:99 GDK_BACKEND=x11 TAURI_WEBVIEW_AUTOMATION=true tauri-driver   # background
node docs/smoke/wd.mjs start "$PWD/target/debug/t4-git-ui"
```

- **Env doesn't carry between Bash calls**, so each command carries what it needs.
- **Check ports and displays first:** `ss -ltn | grep -E ':444[45]'` should be empty. Use `:99` unless
  `/tmp/.X11-unix/X99` exists.
- **Get the PID** for `xdialog.sh` with `pgrep -f '^[^ ]*target/debug/t4-git-ui'`.
- **Take a first `shot` and read it.**

## 3. Drive

The DOM is the one `smoke-cdp.md` § *Selectors that hold* describes, and its traps apply too. Carry
`document.title` in every measurement, and never select a toolbar button by position.

- **The grid is virtualized**, so `:nth-child` misses. Tag the row, then act on the tag, clearing old
  tags first:

  ```bash
  node docs/smoke/wd.mjs eval "document.querySelectorAll('[data-w]').forEach(e=>e.removeAttribute('data-w')),
    [...document.querySelectorAll('[role=grid][aria-label=Commits] [role=row]')]
      .find(r=>r.textContent.startsWith('Working tree')).setAttribute('data-w',''), 'ok'"
  node docs/smoke/wd.mjs dblclick '[data-w]'
  ```

- **Hover-only buttons** (a hunk's **Stage hunk** / **Discard hunk**) are still clickable by tag. No
  hover is needed.
- **Never click a broad fallback selector:** WebDriver clicks whatever matches first. A stray
  `button:has(> span)` once opened the repository tab's menu.
- **OS level.** There is no window manager: `windowfocus` works but doesn't raise, and windows stack at 0,0.
  - `DISPLAY=:99 xdotool windowfocus --sync <win> key ctrl+Tab` sends a real key.
  - `xdotool windowsize` respects the window's minimum size.
  - `DISPLAY=:99 import -window root out.png` captures the whole screen, native dialogs included.
    `wd.mjs shot` captures the page only.

## Several windows: a direct launch

A restored second window sometimes never starts: the app's own bug, about 1 restore in 3 to 5, with or without
WebDriver (`docs/plans/open-items.md` §O). The one two-window attempt under WebDriver hit it, after which the app's
async commands stalled. Until that is fixed, multi-window rows run without WebDriver, which also leaves no stale
session behind. Re-test WebDriver with two windows once the fix lands:

- **The helpers are in `docs/smoke/fixtures/direct.sh`:** `S=<scratchpad>/app; . docs/smoke/fixtures/direct.sh`,
  then `seed` / `dlaunch` / `waitfor` / `xclosetitle` / `lay` / `killapp` (its header has an example). What they
  do:
- **Launch directly:** `HOME=$S/home DISPLAY=:99 GDK_BACKEND=x11 setsid target/debug/t4-git-ui &`,
  with `layout.json` seeded first (`$S/home/.local/share/dev.topher.t4gitui.smoke/layout.json`,
  `[{"tabs":[…],"active":…}, …]`, `main` first).
- **Read state from the window titles:** `xdotool search --onlyvisible --pid <pid> --name '…'`, where each
  title is `T4 Git UI - <repo>`. Poll until every window shows its repository before acting; the second
  one can take a few seconds.
- **Close windows** with `xclose.py`, and read `layout.json` with `cat`.
- **Clear the old session first:** kill the app, then restart tauri-driver before the next `wd.mjs start`.
  A session left behind by a killed app refuses a new one (*Maximum number of active sessions*).

The group AZ walk's findings (`docs/archive/walks/2026-09-26-group-az-linux-walk.md`) are the app's own,
not the harness's: both were reproduced without WebDriver.

## Testing an AppImage

For checking a published or CI-built AppImage (the `packages-Linux` artifact of a `workflow_dispatch` Release run;
`chmod +x` it, the zip drops the bit). Learned on the blank-window fix
(`docs/plans/2026-09-26-appimage-blank-window-plan.md`):

- **Launch it isolated:** `HOME=$S/home DISPLAY=:98 setsid dbus-run-session -- ./<file>.AppImage`.
  - The identifier is the installed app's (`dev.topher.t4gitui`), not `.smoke`. Without its own session bus, a new
    launch hands off to any copy already running (the installed app, a previous run) and exits: an empty log and
    no window, which looks like a render failure.
  - The AppImage forces `GDK_BACKEND=x11` itself (its GTK hook), so it is always X11, under XWayland on a desktop.
- **Judge the render from a screenshot:** `import -window root`, then `convert <png> -format %k info:`. A blank
  window is 1–2 colours, and the start screen is several hundred. Grep the log for `EGL_BAD_PARAMETER`.
- **Kill it by executable path.** Its process shows as a bare `t4-git-ui`, so `pgrep -f` on the file name misses it
  and copies pile up. Kill the pids whose `readlink /proc/<pid>/exe` starts with `/tmp/.mount_<first 6 characters of
  the file name>`. That spares an AppImage the user is running.
- **Never `pkill -f` a pattern that is in your own command line:** it kills the shell running it. Put kill logic in
  a script written in a separate call.
- **Inspect without running it:** the payload starts at the ELF's `e_shoff + e_shentsize * e_shnum`, 944632 in
  0.10.12. `unsquashfs -l -o <offset>` lists it (no `libwayland-client` after the fix). Check the signature with
  `python3 .github/scripts/verify-updater-sig.py <file> <file>.sig src-tauri/tauri.conf.json`, and the embedded
  digest with `.github/scripts/appimage-digest.py --check <file>`.
- **On a VMware guest's desktop** the fixed AppImage still needs `WEBKIT_DISABLE_DMABUF_RENDERER=1` (the README
  note). Xvfb doesn't.

## 4. Quit, clean up

- **Quit as a user would** (the Quit path: `layout.json` and `recents.json` written) with:

  ```bash
  node docs/smoke/wd.mjs eval "window.__TAURI_INTERNALS__.invoke('quit')"
  ```

  It answers *Session terminated without a reply*; that is the app exiting. Delete
  `$TMPDIR/t4-git-ui-wd-session` afterwards. `wd.mjs stop` kills the app instead, which is not a
  close.
- **Stop the harness:**

  ```bash
  pkill -f '^tauri-driver$'; pkill -f '^/usr/bin/WebKitWebDriver'; pkill -f '^Xvfb :99'
  ```

  Then `pgrep -af '^[^ ]*(target/debug/t4-git-ui|tauri-driver|WebKitWebDriver|Xvfb :99)'` should be empty.
- **Nothing to restore:** the user's store and `~/.gitconfig` were never touched. That was checked by
  checksum before and after on 2026-09-26.

## Not reachable here

- **The live Wayland desktop:** no xdotool, and the OS theme switch and DPI are not reachable. These rows
  stay hand-walked.
- **`.deb` / `.rpm` / AppImage updates** (`smoke-test-post-v1.md` AC): these need bundled packages (the
  signing key), `sudo dpkg -i`, and a published release newer than the build. Walk them by hand.
