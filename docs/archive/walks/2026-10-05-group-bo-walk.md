# Group BO: Tauri 2.12 — the crate bumps, the installer's running-app check, the AppImage on X11 — 2026-10-05

The walk of `smoke-test-post-v1.md` › group BO, rows 1–10 (`docs/plans/2026-10-04-tauri-2.12-plan.md`, *Verify*). BO
covers the crates the Tauri 2.12 bump moves under tear-off, window restore, single-instance, the updater and the
installer, on branch `deps/tauri-2.12`. BO 1–10's first pass walked `102b47e`; BO 4's *Save as…* and BO 10 were
re-walked on `75aecc3` after the N4 and N5 fixes landed.

**Setup:**
- **Windows VM (`test-pc`, Win11), ~19:45Z (03:45 local):** `102b47e`, `npm ci`, tauri-cli 2.12.1, rustc 1.99.0, node
  24.21.0; `npm run tauri -- build --no-bundle` from PowerShell, rc 0, 4 min 42 s, no version mismatch, exe 0.10.18.
  Store backed up to `%TEMP%\t4-store-backup-bo`; fixtures `smoke-fixtures.ps1 -Force`, recents seeded, layout `[]`;
  `smoke-launch.ps1`, CDP 9222; 1920 × 1200 @ 100 %, work area 1920 × 1152. The NSIS setup (BO 8, BO 9) was built in the
  same clone at `102b47e` with `C:\tmp\bo8.json`; the BO 3 control used a separate worktree on `main`. The re-walk on
  `75aecc3` rebuilt from PowerShell, cli 2.12.1, rc 0, 234 s, store backup `-p5`.
- **Linux VM (`topher-ubuntu-vm`, Ubuntu 26.04.1, WebKitGTK + `webkitgtk-webdriver` 2.52.6):** worktree
  `.claude/worktrees/tauri212` at `102b47e`; tauri-cli 2.12.1; rustc 1.99.0; a `.smoke` debug build (3 min 26 s, no
  mismatch) under Xvfb `:99` 1600 × 1000 with no window manager, isolated `HOME`, `/tmp/t4` fixtures, driven by
  WebDriver; `main` 1280 × 800, for BO 1–9. BO 10 built the branch's AppImage and ran it on the live GNOME Wayland
  desktop with the owner's own `HOME` and session bus. The re-walk on `75aecc3` rebuilt the `.smoke` debug binary
  (49 s) and the AppImage (89.40 MiB).
- **Mac (`noble-seahorse`, `topher-osx.local`, macOS 26.7.1 25G241, arm64), ~19:42–19:50Z:** a scratch clone
  `/Users/topher/t4-bo/wt` detached at `102b47e`; tauri-cli 2.12.1; rustc 1.99.0 (Cargo.lock: tauri 2.12.1, tao
  0.37.1, wry 0.57.0, updater 2.13.1). `npm run tauri build -- --debug --no-bundle --config
  '{"identifier":"dev.topher.t4gitui.smoke"}'`, exit 0, 57.86 s, `HOME=$S/home` (`S=/Users/topher/t4-bo`), fixtures
  `smoke-fixtures.sh $S/t4`. Screen 1512 × 982, visible 0,34–1512,982. BO 1, 2, 6 and 7 only (the plan's D5 (a)). The
  re-walk on `75aecc3` (BO 4's *Save as…*) rebuilt the same `.smoke` debug binary with `HOME=$S/home`.

## Results

**BO 1, launch and single-instance** — PASS on all three.
- Windows: work loads (LOCAL 7, REMOTES 7, TAGS 1, 22 rows, HEAD `fbc2b6b`, 6 unstaged = `git status`); second
  launch → no second process, new start window at (52, 52).
- Linux: work via `xdialog.sh` picker, 19 tree items, 22 rows, 6 unstaged = `git status`; second launch exit 0 in
  0.16 s, the running pid opened a new window.
- Mac: "T4 Git UI - work" at 116,71 1280 × 800, refs 3.6 ms, 6 unstaged; second launch exited 0, the running app
  (pid 16870) opened a start-screen window, frontmost.

**BO 2, tear-off placement** — PASS on all three.
- Windows: drop 1900,1140 → outer (624,313) 1296 × 839, right/bottom = work area; mid drop 600,320 → (460,296) =
  drop − (140,24); with `main` maximized, drop ~1890,1131 → outer (0,0) 1920 × 1152 = work area.
- Linux (direct launch, `xdotool` drag, grab (106,19)): 1590,990 → (320,200) 1280 × 800 flush; mid 150,100 →
  (10,76), 300,180 → (160,156) = drop − (140,24); shrink (main 1700 × 1100) → (0,0) 1600 × 1000, rendered.
- Mac: bottom-right drop 1508,978 → 232,182 1280 × 800 (right 1512, bottom 982); mid drop 220,170 → 80,114 (drop
  minus grab offset 140,56); drop 600,450 → 232,182 (clamped). The maximized case is Windows-only, not walked.

**BO 3, restore** — PASS on Windows; PARTIAL on Linux (maximize not reachable, no window manager under Xvfb);
not walked on the Mac (not in D5 (a)'s subset).
- Windows: work maximized + other at (300,150) 1100 × 700, Repository › Quit, relaunch → both windows, work
  `IsZoomed`, both tabs/repos loaded. Side finding: `other` restored at outer (0,32) 1936 × 1168 (main's maximized
  inner size as a normal window), overhanging the work area by 41 px bottom / 9 px right; `.window-state.json`
  stores only "main".
- Linux: two windows, Ctrl+Q, relaunch → both back with repos, rendered; maximize not reachable (no window
  manager). Side finding: the torn-off window restored at (0,0) (only main in `.window-state.json`; no WM).
- Control (Windows): worktree on `origin/main` `25cb745` (tauri 2.11.6, tao 0.35.3, wry 0.55.1), cli
  2.11.5, build 5 min 29 s. Same setup → `other` back at outer (0,32) 1936 × 1168, client 1920 × 1129, not zoomed;
  work zoomed. `.window-state.json` only "main". Identical to the branch → the overhang predates 2.12. `CloseMainWindow`
  closed only one of two windows (harness note).

**BO 4, plugins** — PASS on all three, first pass and the re-walk.
- Windows (`102b47e`): Discard via native box (`smoke-dialog.ps1`), `src/a.txt` gone from status; Copy SHA toast +
  clipboard = `6e2d1163…`; Open → Notepad; Reveal → Explorer with `b.txt` selected.
- Linux (`102b47e`): Discard hunk `crlf-hunks.txt` (Cancel → md5 unchanged `a59a4d72…`; Discard → = HEAD
  `7b6d765f…`); Copy SHA toast + clipboard = `rev-parse HEAD`; Open → `gnome-text-editor` via D-Bus activation on
  the live desktop; Reveal → `nautilus` on the live desktop (selection not seen). `xdialog.sh` doesn't wait for the
  box (first call "no dialog", second answered).
- *Save as…* (re-walk, `75aecc3`): exists only on a commit's file — the working-tree file menu has none.
  - Windows: History › HEAD "odd files" › Changes › `crlf.txt` › *Save as…* → dialog "Save crlf.txt", address
    "Downloads" (= `%USERPROFILE%\Downloads`, list matched), file name "crlf" (extensions hidden), saved as
    `crlf.txt`; toast "Saved crlf.txt C:\Users\tophe\Downloads\crlf.txt"; sha256 `6adc129c…` = `git show
    HEAD:crlf.txt`, CRLFs kept.
  - Linux (Xvfb, isolated `HOME` without `user-dirs.dirs`, XTEST): commit `c6df552` `a.txt` → "Save a.txt", name
    `a.txt`, folder = the isolated home (the fallback, no Downloads entry) → saved, md5 = the blob.
  - Mac: *Save as…* only on a commit's file (History › `46c2461` "reset fixture 1" › `reset.txt`). Pass 1,
    `$S/home/Downloads` missing: panel "Save reset.txt", name "reset" (stem selected), Where = home (NSSavePanel
    fell back, no error) → saved `home/reset.txt`, cmp = blob. Pass 2, `Downloads` created: Where = Downloads →
    saved, cmp = blob.

**BO 5, store** — PASS on Windows and Linux (not in the Mac's D5 (a) subset).
- Windows: `ignoreWhitespace` true survives relaunch.
- Linux: `autoCloseChanges` false survives relaunch.

**BO 6, updater 2.13's check** — PASS on all three.
- Windows: Check now → "T4 Git UI 0.10.18 is up to date" at 339 ms.
- Linux: Check now "Checking…" 141 ms → "0.10.18 is up to date" 408 ms; `ss` showed `ESTABLISHED` to GitHub :443;
  no `SSL_CERT_*` in the app's environ.
- Mac: launch check already "T4 Git UI 0.10.18 is up to date"; Check now → "Up to date".

**BO 7, menus** — PASS on all three (BN 1, BN 2).
- Windows: BN 1, BN 2, including Shift+F10 → *Checkout (detached)* marked.
- Linux (real XTEST clicks): BN 1 (5 of 5), BN 2 including Shift+F10. Harness finding: WebDriver clicks were
  unreliable for BN 1 on this build (pointerdown with no pointerup, then clicks with no pointerdown → a false
  fail, 3 of 4) — a control on `main` requested, see below.
- Mac: BN 1 (click → no item marked; ↓ → *Add remote…*), BN 2 (Enter → *Commit…* marked; Esc → ring back;
  Shift+F10 on a commit row → *Checkout (detached)* marked).

**BO 8 (Windows, NSIS install closes the running app)** — PASS.
- Driving: NSIS pages via UI Automation, buttons by posted `WM_COMMAND`/`BN_CLICKED`, states by `BM_GETCHECK`;
  "Create desktop shortcut" unticked on finish pages; same-version page kept the default *Add/Reinstall* every
  time.
- Setup build: `102b47e`, `C:/tmp/bo8.json` (47 bytes, no BOM, od-checked), `npm run tauri -- build --bundles nsis
  --config C:/tmp/bo8.json` rc 0, 202 s; "T4 Git UI_0.10.18_x64-setup.exe" 6.15 MiB, sha256 `8063f08c…47bb`,
  NotSigned (expected). Store backed up to `-p2`.
- Branch install over 0.10.18: the installed exe embeds tao 0.37.1 / tauri 2.12.1 / wry 0.57.0, sha256
  `183709DB…0642`, differs from the target exe by 3 bytes (a bundle-type patch).
- (i) PASS: two windows (work 208,208; other 52,52); setup again → "T4 Git UI is running! Click OK to kill it" →
  OK → the app gone within 2 s, `.window-state.json` + `recents.json` rewritten on the way out, `layout.json` kept
  both windows; finish page Run → both windows back (work 208,208; other 182,182). The harness can't tell Restart
  Manager from a plain kill from here — the app saved its state on exit either way.
- (ii) PASS: `setup.exe /P /UPDATE /R` → no question, the app gone in ~2 s, restarted with both windows;
  `layout.json` the same 2 windows.
- Put back: the published 0.10.18 setup (sha256 = published; Authenticode Valid) `/P` → installed exe 0.10.18,
  sha256 `671CDCD4…6996` (same as before), Valid, thumbprint `F06C1EC1…8151`, Certum timestamp; tao 0.35.3 / tauri
  2.11.6. Store restored from `-p2` (cmp identical). Worktree removed.

**BO 9 (Windows, the rename path, N3)** — PASS.
- Published v0.10.8 (sha256 = published `.sha256`, NotSigned) installed under `%LOCALAPPDATA%\t4-git-ui`, started
  (2 windows restored); branch setup interactive → exactly one "is running" box while 0.10.8 still ran (04:17:31);
  OK → 0.10.8 gone, install complete; watched to 04:18:11, no second prompt. Old dir gone, one uninstall entry
  "T4 Git UI", `HKCU\Software\topher\t4-git-ui` gone, one Start-menu lnk.

**BO 10 (Linux, the AppImage stays on X11, N1)** — PASS for X11, render, Open, *Save as…* and the child
environment (re-walk); the picker FAIL on both local builds (cause under *The controls*), left to the dry run.
- First pass (`102b47e`), live GNOME: AppImage build `89.40 MiB`; `T4 Git UI.AppDir` beside it; no
  `libwayland-client*` (cursor/egl/server present). Stores backed up (`diff -r` identical); no T4 running. Launched
  from the owner's GNOME Wayland terminal, real `HOME` + session bus, `GDK_BACKEND=wayland
  WEBKIT_DISABLE_DMABUF_RENDERER=1`.
  - X11 PASS: `xwininfo` lists `0x1800003 "T4 Git UI - t4-git-ui"` 1853 × 1131 inside a mutter-x11-frames frame;
    `WebKitWebProcess` environ `GDK_BACKEND=x11` (the app's own: `wayland`, as started — expected).
  - Render PASS: 4367 colours, the owner's `t4-git-ui` repo drawn.
  - Picker (owner's hand, Ctrl+T): opened; *Other Locations* listed the mounted volumes; but it did NOT open in
    the home folder (where it opened wasn't recorded). The code passes no `defaultPath`.
  - Open PASS (owner: "editor opens"); the handler wasn't captured (the watcher had expired).
  - stderr: no GIO lines; only "GStreamer element appsink not found. Please install it."
- Re-walk (`75aecc3`), live GNOME: AppImage 89.40 MiB, AppDir present, no `libwayland-client*`, the binary
  contains `GSETTINGS_BACKEND`.
  - X11 PASS: `xwininfo`; `WebKitWebProcess` + `WebKitNetworkProcess` `GDK_BACKEND=x11`.
  - Render PASS: 3925 colours, the repo drawn.
  - `GSETTINGS_BACKEND=memory` seen in both WebKit children. (The app's own `/proc` environ can't show it: it's
    exec-time, so it still reads what the shell was started with before the app's `set_var`.)
  - Child drop PASS: Open `README.md` → `/usr/bin/t4-markdown-viewer`, environ has no `GSETTINGS_BACKEND` / mount
    vars; has `GDK_BACKEND=x11`, as 0.10.18's children did.
  - Picker (owner, Ctrl+T): FAIL — still `/tmp/.mount_T4 GitEpnLaa/usr`. *Other Locations* PASS.
  - *Save as…* (owner): PASS — "Save .editorconfig", path `toperux › Downloads`, saved 164 B, `hash-object` =
    `75aecc3:.editorconfig`. (The owner's first try clicked a `.deb` row, which replaced the name — ordinary GTK
    behaviour; cancelled.)
  - Open PASS. stderr: only the GStreamer appsink line; no memory-backend line.

## The controls

- **BO 3's overhang** (side finding): a worktree on `origin/main` `25cb745` (tauri 2.11.6, tao 0.35.3, wry 0.55.1),
  same setup → the identical `other` overhang (outer (0,32) 1936 × 1168). Identical on `main` → the overhang
  predates Tauri 2.12; not a bump regression.
- **The WebDriver right-click control** (BO 7's harness finding): `origin/main` `25cb745` (`.smoke` debug, cli
  2.11.5): a fresh session was 6/6 clean on both `main` and the branch; after one WebDriver right-click, every
  later click logs no pointer events → false fails 4/4, **identical on `main` and the branch** → a
  `WebKitWebDriver` harness artifact (a context click leaves button 2 pressed), not the Tauri bump. Advice: use
  XTEST clicks for mark rows, or no WebDriver right-click earlier in the same page load.
- **The picker control** (Linux, owner's hand, Ctrl+T in a repo window, live GNOME):
  - Installed 0.10.18 (`~/Applications/T4-Git-UI_0.10.13_x86_64.AppImage`, self-updated, Settings says 0.10.18):
    the picker opens on *Recent*. stderr: `libgvfscommon.so` undefined symbol `g_task_set_static_name` /
    `Failed to load libgvfsdbus.so` ×3; `canberra-gtk-module` ×4. No dconf/GIO module mapped;
    `GIO_EXTRA_MODULES=<mount>/usr/lib/x86_64-linux-gnu/gio/modules` → GSettings defaults → GTK3 `'recent'`.
  - The branch's local AppImage (26.04-built): the picker opens inside the AppImage mount
    `/tmp/.mount_T4 Git…/usr` (also BO 10's "not home"). Maps bundled `libdconfsettings.so`,
    `libgvfsdbus.so`, `libgioremote-volume-monitor.so` and `/run/user/1000/dconf/user` → reads the owner's dconf
    `org.gtk.Settings.FileChooser startup-mode = 'cwd'`.
  - Both apps run with cwd = `$APPDIR/usr` (`AppRun`), `OWD` = the shell's dir. Neither app passes a `defaultPath`.
  - **Cause chain:** dconf read → the picker opens inside the mount → fixed as N4 (`GSETTINGS_BACKEND=memory`).
  - Re-walked on `75aecc3`: the local 26.04-built AppImage still opens the picker inside the mount, because the
    build host's own Ubuntu schema override is bundled too. Measured: `GSETTINGS_BACKEND=memory gsettings
    --schemadir <mount>/usr/share/glib-2.0/schemas get … startup-mode` → `'cwd'`, from
    `/usr/share/glib-2.0/schemas/10_ubuntu-settings.gschema.override:113` (`startup-mode='cwd'`), Ubuntu's own
    schema default, bundled because the local build ran on a 26.04 desktop.
  - The installed 0.10.18 (CI-built, 22.04) bundles only `10_gsettings-desktop-schemas.gschema.override` (default
    `'recent'`) — not Ubuntu's override. So N4 fixes a user's own dconf value; the picker clause is decided on the
    dry run's CI-built AppImage (owner's ruling, 2026-10-05).

## Seen on the way

- Windows: `smoke-launch.ps1`'s first-launch printout showed the single-instance helper window title
  `dev.topher.t4gitui-siw` and `CdpAnswer: no` at 8 s (CDP answered later) — cosmetic. Logs 0 ERROR/WARN.
- Windows: `CloseMainWindow` closed only one of two windows (BO 3 control).
- Windows (BO 8/9): watching to 04:18:11 found no second "is running" prompt; old install dir, registry key and
  Start-menu entry all cleaned up.
- Linux (BO 4): `xdialog.sh` doesn't wait for the box — its first call reported "no dialog", the second answered.
- Linux (BO 10, first pass): the folder picker's actual open location (home vs. elsewhere) wasn't recorded by the
  owner; re-walked with the cause measured, above.
- Mac: cliclick `c:` jumping after keyboard input twice misbehaved (no menu / "Commit…" marked); `m:` first + a
  300 ms wait was clean; likely a cliclick synthetic-event issue, unproven (no probe) — not part of BO, carried
  over from the macOS walk harness.
- Mac: the single-instance window opens exactly over `main`, no cascade offset.
- Mac: no tao 0.37 focus/window anomalies seen in any BO row.

## Harness notes

- **WebDriver right-click leaves button 2 pressed:** after a WebDriver context-click, every later WebDriver click
  on the same page logs no pointer events, 4/4, identical on `main` and the branch — use XTEST clicks for mark
  rows instead, or avoid a WebDriver right-click earlier in the same page load.
- **`xdialog.sh` doesn't wait for the box:** the first call after the dialog's trigger can report "no dialog"; a
  second call afterward answers it.
- **The Windows Save dialog's file-name box and Save button aren't in UI Automation:** read/set the name with
  `WM_GETTEXT` on `Edit 1001`, and click Save with `WM_COMMAND IDOK`.
- **`smoke-launch.ps1`'s first-launch printout catches the single-instance helper window:** its title,
  `dev.topher.t4gitui-siw`, shows up in the printout — harmless, but worth knowing when reading the log.
- **`/proc` environ is exec-time:** a process's own `/proc/<pid>/environ` shows what it was started with, not a
  later `set_var`; only children started after the `set_var` show the new value. Seen for both `GDK_BACKEND`
  (BO 10 first pass) and `GSETTINGS_BACKEND` (BO 10 re-walk) — read the value from a WebKit helper process, not
  the app's own.

## Fixes found by the walks

- **N4 — inside an AppImage, GSettings in memory.** The picker control (above) traced the mount-opening picker to
  the build's bundled dconf module reading the user's `startup-mode = 'cwd'`. The fix sets
  `GSETTINGS_BACKEND=memory` inside an AppImage. A first fix tried moving the app's working folder to `OWD`
  instead; the change review found that breaks WebKit's helper paths (the gtk hook rewrites libwebkit's `/usr` to
  `././`), so it was reverted before any walk, and N4 was re-ruled to the memory backend. Owner's ruling,
  2026-10-05: keep N4; the picker clause is decided at the dry run's CI-built AppImage, over also giving every
  folder picker a start folder inside the AppImage (a new command, ~30 lines).
- **N5 — *Save as…* starts in Downloads, else home.** Found by N4's change review (reasoned from the GTK source):
  a bare file name started GTK's Save dialog (which never shows *Recent*) in the app's working folder — inside the
  AppImage's read-only mount, so the save failed, as in 0.10.18. The fix passes Downloads joined with the file's
  name on every OS (home when there is none; the Mac's pass 1 shows NSSavePanel's own fallback to home, the Linux
  isolated-home pass the code's). Walked PASS on all three OS (BO 4) and on the live desktop's AppImage (BO 10).
  *Save as…* exists only on a commit's file; the walks found the working-tree menu has none.

## Round 2

The walk of BO 11–13 (the plan's *Triage (2026-10-05) and its fixes*, N6/N7/N8), on `df14320` (BO 1–10's fixes plus
the triage fixes). Builds and stores as above, rebuilt on `df14320`: Windows store backup `-p6`, fixtures rebuilt
(`work` at `d1fc2b6`); Linux `.smoke` debug rebuilt, AppImage 89.41 MiB; Mac a fresh debug `.smoke` build,
`HOME=$S/home`.

**BO 11, a second window comes back at its own rect (N6)** — PASS on Windows, Mac and Linux.
- Windows: 11.1 `other` at (300,150) 1100 × 700 → rect `{300,150,1084×661,false}`, relaunch there, `work` zoomed.
  11.2 moved to (500,250) → relaunch there. 11.3 (400,200) 1000 × 650 then maximized → rect
  `{400,200,984×611,true}`, relaunch zoomed, un-max → (400,200) 1000 × 650. 11.4 quit again maximized → rect
  unchanged, relaunch, un-max → (400,200) 1000 × 650.
- Mac: 11.1 `other` 300,200 900 × 600 → rect `{300,200,900×600,false}`, relaunch both. 11.2 moved 420,260 → there.
  11.3 200,150 1000 × 650 then zoom → rect `{200,150,1000×650,true}` (no intermediate frame), relaunch zoomed,
  un-zoom → 200,150 1000 × 650. 11.4 quit again zoomed → same rect, un-zoom → 200,150. 11.5 250,180 950 × 620 then
  full screen → rect `{250,180,950×620,false}`, back windowed there. Notes: `main`'s own un-zoom goes to 1,34 (its
  own window-state `prev_x`, not N6); full screen moves the window to another Space. Logs 0 ERROR/WARN.
- Linux (Xvfb `:99`, no window manager, scratch `HOME`): `other` torn off, moved to 210,130 and sized 1000 × 700,
  1.5 s settle, Ctrl+Q → rect `{210,130,1000×700,false}`, relaunch `main` (0,0) 1280 × 800, `other` (210,130)
  1000 × 700, rendered. Harness slip, first try: `xdotool search --name 'other$'` also matched `main`
  (`"T4 Git UI - other"` vs. the main titles) — redone with an exact, anchored title (harness note, below).

**BO 12, a second launch cascades from the last-focused window (N7)** — PASS on Windows, Mac and Linux.
- Windows: 12.1 `work` (208,208) 1296 × 839 focused → second launch at (240,240) 1296 × 839 = `work` + 32 at its
  size. PASS.
- Windows 12.2, the harness hang: ~2 s after closing 12.1's window (`WM_CLOSE`), `other` focused, second launch →
  the new window stayed hidden (`IsWindowVisible` false, over 3 minutes), no log line, CDP dead (`json/list` hung
  then returned 000), `WM_CLOSE` to `work`/`other` ignored, the process still `Responding=True`. Cause, found after
  a dump and retries: the focus helper's lone Alt tap (`keybd_event VK_MENU`) put the foreground app window into
  system-menu mode (`GetGUIThreadInfo` flags `0xc`, the menu's owner `other`), so tao's event loop sat inside the
  modal loop. Reproduced with and without CDP, with a pause, without running 12.1 first, and on the *installed*
  0.10.18 — not an app bug, and not new in 2.12 (standard Win32 behaviour). Without the Alt tap: `other` foreground
  → second launch at outer (432,232) 1000 × 650 = `other` (400,200) + 32 at its size, CDP alive, closed and quit
  normally. 12.2 PASS once the harness stopped tapping Alt.
- Windows 12.3, first try confounded: minimizing `other` to set up the case handed the foreground to `work`
  instead, so the result didn't test what it meant to. Redone with focus by `AttachThreadInput` +
  `SetForegroundWindow`, `GetGUIThreadInfo` flags checked at 0 before each launch: `other` focused, the foreground
  moved out of the app (an Open With box), `other` minimized → second launch at outer (240,240) 1296 × 839 =
  `work` + 32 at its size. PASS.
- Windows 12.4: `work` maximized (outer (-8,-8) 1936 × 1168, frame (0,0)–(1920,1152)), focused → second launch at
  outer (16,16) 1904 × 1136, frame (23,16)–(1913,1145): offset, then shrunk to end at the work area's edges. The
  visible frame sits 23 px across and 16 px down from `main`'s, not the full 32 (an 8 px invisible border). PASS.
- Mac: A `work` focused (1,34 1280 × 800) → 33,66 1280 × 800; B `other` (250,180 950 × 620) → 282,212 950 × 620;
  C `other` minimized → 33,66 from `work`; D `work` zoomed → 32,66 1480 × 916 (shrunk by 32, on screen, not over
  `main`).
- Linux (real XTEST clicks): click `main` → second launch at (32,32) 1280 × 800; click `other` → (242,162)
  1000 × 700; back to `main` → (32,32). Focus tracking followed the XTEST clicks.

**BO 13, a program the AppImage starts gets the user's `GDK_BACKEND` and `GSETTINGS_BACKEND` (N8)** — PASS.
- Run on a private Xvfb `:98` with a scratch `HOME`, not the live desktop (owner's ruling): the diff tool is set
  in git's *global* config, so running it on the live desktop with the real `HOME` would have edited the walker's
  own `~/.gitconfig`.
- `envdump.sh` as the external diff tool: A shell with `GDK_BACKEND=wayland` → the child has `wayland`; B shell
  with none → no `GDK_BACKEND`; C shell with `GSETTINGS_BACKEND=keyfile` → the child has `keyfile`. Each: no
  `T4_HOST_*`, no mount paths. WebKit's own helper processes still show `x11` and `memory` (spawned by WebKit, not
  through `host_env`). Rendered.
- Seen: WebKit's helper processes carry `T4_HOST_*` too (they're spawned by WebKit, not by `host_env`, which is
  what strips the two names from a program the app starts itself). stderr: only the D-Bus activation lines and the
  GStreamer `appsink` line.
- `xdialog.sh` polling (#10's fix): one immediate call right after a WebDriver click on Discard hunk → "dialog
  closed", rc 0, 1.30 s; md5 unchanged.

**Cleanup:** all processes stopped on every machine; real stores untouched; Windows store restored from `-p7`, cmp
identical, log has no ERROR/WARN; `~/.gitconfig`'s md5 on the Linux VM unchanged.

**The item 6 fix (`701ccf5`), a second launch with every window minimized** — PASS on Windows. Its one line applied
by hand to `df14320` (not pushed); `main` only, at (208,208) 1296 × 839, minimized; GUI flags 0 before each launch.
- Control, unpatched `df14320`: the new window at inner 700 × 500, the minimum size.
- Patched: inner 800 × 600, the builder's default size, at the OS's default place (outer (78,78)).
- Patched, `main` normal and focused: outer (240,240), inner 1280 × 800 = `main` + 32 at its size, unchanged.
- Store restored from `-p8`, cmp identical; log has no ERROR/WARN; the clone back to clean `df14320`.

## The release dry run and its AppImage

Run 37296029478, a `workflow_dispatch` of Release on `main` `e0936f6` (the squashed branch), 10:21–10:47Z: every job
green, `checks` skipped as on any dispatch.
- *Pin the AppImage tools*: four `OK`. ``Installed package `tauri-cli v2.12.1` `` on all three legs (a cold cache:
  rust-cache restored nothing). No "bundler downloaded a tool" failure. D7's AppDir check green.
- macOS signature valid and its designated requirement met; Windows: the Certum signature valid on the exe and the
  uninstaller. `verify`: OK ×3. `publish`: draft `dry-run-37296029478` made and deleted, no tag left.
- Which appimage output plugin linuxdeploy used isn't in the log (the bundler isn't verbose); the runtime is
  `dd6cebe`, as 0.10.18's.

**BO 10 on the CI-built AppImage** (the Linux VM, live GNOME, real `HOME`, `GDK_BACKEND=wayland
WEBKIT_DISABLE_DMABUF_RENDERER=1`) — PASS:
- `appimage-digest.py --check` → `digest ok: f091a3ed…`; `--appimage-version` → type2-runtime `dd6cebe`.
- `unsquashfs -l` against the published 0.10.18 (532 entries vs 364): removed `/usr/bin/xdg-open` (no
  `bundleXdgOpen`), the old `x86_64-linux-gnu/gio/modules/libgiognutls.so`, 11 `copyright` files; added
  `/usr/lib/gio/modules/` (`giomodule.cache`, `libdconfsettings.so`, `libgioenvironmentproxy.so`,
  `libgiognomeproxy.so`, `libgiognutls.so`, `libgiolibproxy.so`), `libproxy.so.1`, an empty `/usr/share/pixmaps`, 92
  `copyright` files of libraries already bundled. No `libwayland-client`; the only schema override is
  `10_gsettings-desktop-schemas` (no `10_ubuntu-settings`); no GVFS module.
- N1: `xwininfo` lists the window; `WebKitWebProcess` and `WebKitNetworkProcess` show `GDK_BACKEND=x11`,
  `GSETTINGS_BACKEND=memory`, `GIO_MODULE_DIR` in the mount.
- Renders. *Open* on `README.md` started the host's viewer, its environment with the user's `GDK_BACKEND=wayland`
  and none of the app's (N8).
- By the owner's hand: the picker (Ctrl+T) opened on *Recent*, a `usr` sidebar entry as expected; *Other Locations*
  listed the mounted volumes (the owner's word). *Save as…* opened in Downloads with the name `README.md`, and the
  saved file's `git hash-object` matched `e0936f6:README.md`.
- stderr: only `canberra-gtk-module` ×4; 0.10.18's three `libgvfscommon.so` / `libgvfsdbus.so` failures are gone
  (`GIO_MODULE_DIR` replaces the host's folder); no "Using the 'memory' GSettings backend" line, as expected.
- Seen: mid-walk, another session in the shared store's log (19:19:01–19:19:14 local, the repo opened, closed after
  13 s) and Firefox opening the releases page at 19:19:09; which copy it was isn't known.
- Cleanup: quit with Ctrl+Q; the saved file removed; both stores restored, `diff -r` and `cmp` ok; `~/.gitconfig`
  unchanged.

## Cleanup

Kept on the owner's word, for cleanup when said:
- **Windows:** store backups `-bo`/`-p1`/`-p2`/`-p5`, `C:\tmp\setups`, `C:\tmp\bo8.json`, `C:\tmp\t4`, the clone on
  `deps/tauri-2.12` with `target\release` in place.
- **Linux:** worktrees `tauri212` and `main-control`, and their scratch dirs; `/tmp/t4`.
- **Mac:** `/Users/topher/t4-bo` ($S above).

All stores were restored byte-exact (`cmp`/`diff -r`) after every walk and control; no app was left running on any
machine; `gnome-text-editor` and `nautilus`, opened by BO 4's Linux pass, were closed before cleanup.
