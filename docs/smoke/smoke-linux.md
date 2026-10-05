# Driving the smoke tests on Linux

The Linux counterpart of `smoke-cdp.md`. WebKitGTK has no CDP, so the page is driven over WebDriver:
`tauri-driver` launches a debug build through `WebKitWebDriver`, and `docs/smoke/wd.mjs` talks to it.
The app runs on a headless Xvfb display, where `xdotool` reaches what WebDriver cannot: the native GTK
dialogs, real OS keys, window size. Adapted from the sibling app's drive-app skill.

Proven 2026-09-26 on Ubuntu (GNOME, Wayland host) against 0.10.12. The run opened `work` through the
folder picker, right-clicked a grid row, double-clicked the working-tree row, staged a hunk, answered a
Discard hunk box both ways, wrote the signing config and quit through the app.

## Prerequisites

The README's Tauri packages, Node 24 (`node --version`; the build runs `tsc` and vite), then:

```bash
sudo apt install xvfb xdotool imagemagick xclip
# WebKitWebDriver: `webkitgtk-webdriver` (seen on Ubuntu 26.04) or `webkit2gtk-driver` (seen on 24.04);
# other releases have one of the two
sudo apt install webkitgtk-webdriver || sudo apt install webkit2gtk-driver
command -v WebKitWebDriver   # must print a path
cargo install tauri-driver --locked
```

The 26.04 name is the one this doc was first written with, on that host; the 24.04 name is from the WSL re-walk
(`docs/archive/walks/2026-09-27-pr18-linux-rewalk.md`).

`xclip` reads the Xvfb clipboard: `xclip -display :99 -selection clipboard -o`. The `Copied …` toast carries the
copied text too, as on Windows.

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
  - The desktop portal's GTK4 folder picker (the *Open repository* dialog when a portal serves it) ignores the
    path `xdialog.sh` types: navigate it by double-clicking folders and pressing **Open** (found in the v0.10.16
    gate walk, 2026-10-03).
  - `<pid> --title '^Discard hunk$' --ok|--cancel`: an `ask()` box. Return is the affirmative button
    (**Discard**) and Escape is Cancel. Both were checked against the file's checksum.
  - It waits up to 5 s for the box, so it can run right after the click that opens it: before, a first call made
    then reported "no dialog" and only a second one answered (group BO 4, 2026-10-05).
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

**The cost:** gpg follows `$HOME`, so `~/.gnupg` is not there. A row that really signs with gpg (openpgp) needs
`GNUPGHOME=$HOME/.gnupg` on the tauri-driver line, **before** `HOME=` — bash applies prefix assignments left
to right, so after it `$HOME` is already the scratch one (`GNUPGHOME=$HOME/.gnupg HOME=$S/home … tauri-driver`).

**ssh transport is unaffected by the move:** it finds `~/.ssh` from the passwd entry, not `$HOME`, so an ssh remote
behaves as it does outside the harness. Checked 2026-09-27:
- a decoy `$S/home/.ssh/config` was ignored;
- a file trace showed config, key and `known_hosts` opened under the real `~/.ssh`, and nothing under the scratch
  `HOME`;
- `git ls-remote` of a GitHub ssh remote succeeded with `HOME` moved.

**Using the passwd home also means the moved `HOME` doesn't isolate ssh:** it reads, and can write, the real `~/.ssh`
(`known_hosts` host-key updates), as any fetch would.

**`~` paths in git config do follow `$HOME`:**
- `user.signingkey`, when it is an ssh key path (with openpgp it holds a key id);
- `gpg.ssh.allowedSignersFile`;
- an `-i ~/…` in `core.sshCommand`, which the shell expands.

None of these was set on the machine checked 2026-09-27, and ssh signing under the moved `HOME` is untested. If you
sign with ssh (group AR), use absolute paths in the copied `.gitconfig`; `GNUPGHOME` doesn't apply there.

If your identity is in `~/.config/git/config` rather than `~/.gitconfig`, copy that instead.

```bash
S=<scratchpad>/app; mkdir -p $S/home; cp ~/.gitconfig $S/home/    # user.name / email for commits
Xvfb :99 -screen 0 1600x1000x24                                        # background
HOME=$S/home DISPLAY=:99 GDK_BACKEND=x11 TAURI_WEBVIEW_AUTOMATION=true \
  SSH_ASKPASS_REQUIRE=never GIT_ASKPASS= tauri-driver                   # background
node docs/smoke/wd.mjs start "$PWD/target/debug/t4-git-ui"
```

- **No askpass on Xvfb:** `SSH_ASKPASS_REQUIRE=never` and an empty `GIT_ASKPASS` stop ssh (a passphrase, an unknown
  host) and git (https credentials) from opening an askpass dialog on the invisible display. It would hang the
  walk until Cancel. They fail at once instead, as they do with no askpass installed
  (`docs/plans/2026-09-27-ssh-fail-fast-plan.md`).

- **Env doesn't carry between Bash calls**, so each command carries what it needs.
- **Check ports and displays first:** `ss -ltn | grep -E ':444[45]'` should be empty. Use `:99` unless
  `/tmp/.X11-unix/X99` exists.
- **Keep the saved window no bigger than the screen.** With no window manager, a `main` saved bigger than Xvfb's
  1600 × 1000 in `.window-state.json` often launches stuck on the start spinner (the page's calls to Rust stop
  arriving; a resize wakes it). Reset it to 1280 × 800 after a walk that resized `main` (`open-items.md` §Q, T26).
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
- **A WebDriver right-click breaks the later WebDriver clicks on that page:** `wd.mjs rclick` leaves button 2
  pressed (a `WebKitWebDriver` artifact, the same on `main`, group BO 7, 2026-10-05), and every later click logs no
  pointer events. Rows that check which menu item is marked (BN 1, BN 2) use real XTEST clicks
  (`DISPLAY=:99 xdotool mousemove <x> <y> click 1`, or `click 3` for the menu), or no WebDriver right-click earlier
  in the same page load.
- **Open and Reveal reach the live desktop:** the harness isolates `HOME` and the display, not the session bus, so
  *Open* (an editor, through D-Bus activation) and *Reveal* (the file manager) start on the user's own desktop
  (group BO 4, 2026-10-05). Close them after the row.
- **`xdotool search --name` takes a regex:** an unanchored title can match more than the window intended —
  `'other$'` also matched the main window (`"T4 Git UI - other"` vs. the main titles, group BO 11, round 2,
  2026-10-05). Use exact, anchored titles (`^…$`).
- **OS level.** There is no window manager: `windowfocus` works but doesn't raise, and windows stack at 0,0.
  - `DISPLAY=:99 xdotool windowfocus --sync <win> key ctrl+Tab` sends a real key.
  - `xdotool windowsize` respects the window's minimum size.
  - `DISPLAY=:99 import -window root out.png` captures the whole screen, native dialogs included.
    `wd.mjs shot` captures the page only.

## Several windows: a direct launch

A restored second window sometimes never starts: the app's own bug, 3 of 16 two-window restores, with or without
WebDriver (`docs/plans/open-items.md` §O). A later count of 7 of 20 was likely a race in the harness's own
`killapp`, fixed on 2026-09-27: a relaunch straight after a kill handed off to the dying instance and exited. The
first two-window attempt under WebDriver (2026-09-26) hit the real hang, after which the app's async commands
stalled; two on 2026-09-27 (WSL, the reload check) came up, which is not a verdict. Until the hang is fixed,
multi-window rows run without WebDriver, which also leaves no stale session behind. Re-test WebDriver with two
windows once the fix lands:

- **The helpers are in `docs/smoke/fixtures/direct.sh`:** `S=<scratchpad>/app; . docs/smoke/fixtures/direct.sh`,
  then `seed` / `dlaunch` / `waitfor` / `xclosetitle` / `lay` / `killapp` (its header has an example). What they
  do:
- **Launch directly:** `HOME=$S/home DISPLAY=:99 GDK_BACKEND=x11 SSH_ASKPASS_REQUIRE=never GIT_ASKPASS= setsid
  target/debug/t4-git-ui &` (the askpass guard as in §2),
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
`chmod +x` it, the zip drops the bit). A dispatch from a branch other than `main` needs the branch added to the
`signing` environment's deployment-branch policies for the run and removed after, each on the owner's word; the run
waits for the owner's approval under *Review deployments*, and makes and deletes a draft release (the `release`
skill's *Checking the packaging*). Learned on the blank-window fix
(`docs/plans/2026-09-26-appimage-blank-window-plan.md`):

- **Give it a display of its own:** `Xvfb :98 -screen 0 1600x1000x24` in the background, stopped afterwards with
  `pkill -f '^Xvfb :98'`. The harness app on `:99` has the same window title, and a root screenshot would catch it.
  With the real store, size the display above the store's saved `main` (`.window-state.json`), e.g. 1920 × 1200: a
  saved window taller than the display stalls the launch (T26, `open-items.md` §Q; v0.10.19 gate).
- **Launch it isolated:**
  `HOME=$S/home DISPLAY=:98 SSH_ASKPASS_REQUIRE=never GIT_ASKPASS= setsid dbus-run-session --
  ./<file>.AppImage > $S/appimage.log 2>&1 &` (the askpass guard as in §2).
  - The identifier is the installed app's (`dev.topher.t4gitui`), not `.smoke`. Without its own session bus, a new
    launch hands off to any copy already running (the installed app, a previous run) and exits: an empty log and
    no window, which looks like a render failure.
  - The AppImage forces `GDK_BACKEND=x11` itself (the app sets it in `main.rs` since tauri-cli 2.12.1, whose GTK hook
    no longer does), so it is always X11, under XWayland on a desktop.
- **Judge the render from a screenshot (a rough check):** first confirm the window exists
  (`xdotool search --name 'T4 Git UI'`). Then `import -window root`, then `convert <png> -format %k info:`.
  - A blank window, or no window, is 1–2 colours; the start screen is several hundred.
  - Grep `$S/appimage.log` for `EGL_BAD_PARAMETER`.
- **Kill it by its `APPIMAGE` variable.** Its process shows as a bare `t4-git-ui`, so `pgrep -f` on the file name
  misses it and copies pile up.
  - Kill the pids whose environment holds the file's resolved path, which the AppImage runtime exports:
    `tr '\0' '\n' < /proc/<pid>/environ | grep -qx "APPIMAGE=$(realpath <file>)"`.
  - The mount directory (`${TMPDIR:-/tmp}/.mount_` plus the first 6 characters of the file name) doesn't tell copies
    apart: every release's file starts `T4-Git`, so a user's own AppImage would match too.
- **Never `pkill -f` a pattern that is in your own command line:** it kills the shell running it. Put kill logic in
  a script written in a separate call.
- **Inspect without running it:** the payload starts at the ELF's `e_shoff + e_shentsize * e_shnum`, 944632 in
  0.10.12. `unsquashfs -l -o <offset>` lists it (no `libwayland-client` since the fix: repacked out up to 0.10.18,
  excluded by linuxdeploy itself from tauri-cli 2.12.1 on). Check the signature with
  `python3 .github/scripts/verify-updater-sig.py <file> <file>.sig src-tauri/tauri.conf.json <version>`, and the
  embedded digest with `python3 .github/scripts/appimage-digest.py --check <file>`.
- **On a VMware guest's desktop** the fixed AppImage still needs `WEBKIT_DISABLE_DMABUF_RENDERER=1` (the README
  note). Xvfb doesn't.
- **A host program the app starts: run the control first** (smoke group BI). The app's own environment keeps the
  image's paths (only its children are scrubbed), so it is the unscrubbed one. Run the program under it and see it
  fail, or a pass proves a changed host rather than the fix:
  `xargs -0 -a /proc/<app pid>/environ sh -c 'exec env -i "$@" <program>' sh`. Only an AppImage **built on
  Ubuntu 22.04** reproduces the bug (a CI or release build): one built on a newer host carries that host's
  libraries, and every control passes.
- **Check a child's environment:** while it runs (a slow fetch),
  `tr '\0' '\n' </proc/<git pid>/environ | grep -E 'mount_|APPDIR|APPIMAGE|PYTHONHOME|LD_LIBRARY_PATH'`
  prints nothing, where the app's own pid shows them all.
  For *Open*, the host's `xdg-open` hands off to `gio open` and exits within milliseconds, too fast for `ps`, so
  start `sudo strace -f -qq -e trace=execve -p <app pid> 2>&1 | grep xdg-open` before the click: it shows exactly
  which `xdg-open` ran: an `= -1 ENOENT` line for each `PATH` folder tried first, then the `execve` line ending
  `= 0` shows `/usr/bin/xdg-open`, not the mount's copy. The second proof: the opened app's `/proc/<pid>/environ`
  has no `mount_` path. Use an app not already running: a running one shows its own old environment.

## 4. Quit, clean up

- **Quit as a user would** (the Quit path: `layout.json` and `recents.json` written) with:

  ```bash
  node docs/smoke/wd.mjs eval "window.__TAURI_INTERNALS__.invoke('quit')"
  ```

  It answers *Session terminated without a reply*; that is the app exiting. Delete
  `$TMPDIR/t4-git-ui-wd-session` afterwards. `wd.mjs stop` kills the app instead, which is not a
  close. A kill before the restore report leaves `layout.restoring` next to `layout.json`, which trips
  the crash breaker on the next launch — the `seed` helper deletes it.
- **Stop the harness:**

  ```bash
  pkill -f '^tauri-driver$'; pkill -f '^/usr/bin/WebKitWebDriver'; pkill -f '^Xvfb :99'
  ```

  Then `pgrep -af '^[^ ]*(target/debug/t4-git-ui|tauri-driver|WebKitWebDriver|Xvfb :99)'` should be empty.
- **Nothing to restore:** the user's store and `~/.gitconfig` were never touched. That was checked by
  checksum before and after on 2026-09-26.

## Not reachable here

- **The live Wayland desktop:** no xdotool, and the OS theme switch and DPI are not reachable. These rows
  stay hand-walked. On Xvfb the OS theme can be switched, in a private D-Bus session through `gsettings`, and AT-SPI
  reaches GTK's text-field menu: not built yet, see `docs/plans/2026-09-27-t5-atspi-plan.md`.
  - **WebDriver still works there** (2026-09-27): run §2's `tauri-driver` line with `GDK_BACKEND=wayland` in place
    of `DISPLAY=:99 GDK_BACKEND=x11`, and no Xvfb. The window opens on the user's desktop. `wd.mjs` drives the
    page, and `shot` captures it.
  - **GTK's native popups** (a text field's menu) aren't in the shot: ask the user.
  - **The native picker can't be driven:** seed `layout.json` instead (the recipe under "Several windows").
  - See `docs/archive/walks/2026-09-27-linux-wayland-rendering-walk.md`.
- **`.deb` / `.rpm` updates** (`smoke-test-post-v1.md` AC): these need bundled packages (the signing key),
  `sudo dpkg -i`, and a published release newer than the build. Walk them by hand.
- **AppImage updates** can be walked before a release: a `workflow_dispatch` Release run (signed as a release) of a
  throwaway branch versioned below the published release, set the release skill's way; without a tag the version job
  skips its tag checks, so a lower version builds (`release.yml:60-74`). Its `packages-Linux` AppImage then updates to
  the published one through Settings (group BI 8). The branch goes into the `signing` environment's deployment-branch
  policies for the run and comes out after; the owner approves the run under *Review deployments*; the dispatch also
  makes and deletes a draft release. Still a hand walk: the push, the policy change and the run are the user's go.
