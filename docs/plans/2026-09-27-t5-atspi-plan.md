# Plan: drive GTK's native parts through AT-SPI (T5)

_Written 2026-09-27, from a spike on Xvfb (`docs/archive/plans/2026-09-27-pr18-linux-extras-plan.md`, item 4). Plan only:
nothing here is implemented. Source: open-items §P, "Drive live Wayland through AT-SPI (T5)". Refreshed 2026-10-06
against `main` `c9e2dc4`: row citations by text, not line; the theme switch scoped to the debug build (the AppImage
keeps GSettings in memory since v0.10.19); premises otherwise unchanged._

## What stays hand-walked today

`smoke-linux.md`, "Not reachable here": GTK's native popups (a text field's menu), the OS theme switch and DPI. The
page itself is driven by WebDriver, on Xvfb and on live Wayland. The native picker is driven by `xdialog.sh` (X
only).

## The spike (2026-09-27, Xvfb, a debug build of `1f5fb67`)

**Setup:**
- `HOME=$S/home dbus-run-session -- <script>`. `HOME` comes first, so the dconf service the private bus starts
  writes the scratch `$S/home/.config/dconf/user`, not the desktop's.
- Accessibility on: `gdbus call --session --dest org.a11y.Bus --object-path /org/a11y/bus --method
  org.freedesktop.DBus.Properties.Set org.a11y.Status IsEnabled '<true>'`. It was `false`; at-spi-bus-launcher
  activated on demand.
- The app launched in that session on `DISPLAY=:99` (the usual Xvfb), with the askpass guard.
- Read with `python3-gi` 3.56.2 and `gir1.2-atspi-2.0` (at-spi2-core 2.60.4), all installed already.
- Afterwards, the desktop's `toolkit-accessibility` was still `false` and `color-scheme` still `prefer-dark`, and
  none of the session's processes were left running.

**Results:**
- **The app's tree:** `application 't4-git-ui'` → `frame 'T4 Git UI - work'` → `document web`, with the page's ARIA
  roles:
  - `tool bar 'Repository'`, `table 'Commits'` (22 rows, 105 cells), `page tab list 'File list'`, `list box
    'Changed files'`, `landmark 'Diff'`, `status bar`;
  - 11 `separator`s, the splitters among them named by their `aria-label` (e.g. "Resize output").
- **GTK's native text-field menu:** after a real right-click (xdotool) on Search commits, a second top-level `window`
  holds `menu` → `menu item`s: Cut, Copy, Paste, Delete, Select All, Insert Emoji, Insert Unicode Control Character
  (a submenu), Inspect Element. This is the part WebDriver's `shot` can't see.
- **The OS theme:** inside the private session, `gsettings set org.gnome.desktop.interface color-scheme
  prefer-dark|default` switched the running app between dark and light within 2 s (screenshots). This needs no
  AT-SPI, and the desktop's setting isn't touched.
- **The native picker: not tried.** The spike pressed Ctrl+O in a repository window, where it isn't bound (only the
  start screen binds it). `xdialog.sh` already drives the picker on Xvfb, through the start screen's **Open
  repository…**.

## Proposal

**`docs/smoke/atspi.py`** (about 80 lines, no dependencies beyond `python3-gi`):
- `dump [depth]`: the app's tree, as in the spike;
- `menu`: the open GTK popup's items, and whether each is sensitive;
- `click "<role>" "<name>"`: `do_action(0)` on the first match, e.g. `click "menu item" "Paste"`;
- `wait "<role>" "<name>" [s]`: poll until it appears.

**Launching:**
- `smoke-linux.md` gains an "AT-SPI" section: the `dbus-run-session` recipe above, where tauri-driver runs inside
  the same session, so WebDriver and AT-SPI share it.
- **Unverified:** that tauri-driver's app inherits the private bus. The spike launched the app directly.

**Rows it would unlock:**
- the native text-field menu (the Wayland walk's "the GTK menu showed (user)"), and the paste into a field;
- the OS theme switch (`smoke-test.md` §6, "Switch the OS theme while the app runs") on Linux, through `gsettings`
  in the private session. It needs no AT-SPI, only the same private session, and only on a debug build: inside an
  AppImage the app sets `GSETTINGS_BACKEND=memory` (`src-tauri/src/main.rs`, N4 of the Tauri 2.12 plan), so it never
  reads dconf and a `gsettings` switch can't reach it.

Neither adds a tick: the theme row is already ticked from another walk, and the text-field menu is no checklist row,
only `smoke-linux.md`'s "ask the user" note. On Linux these become driven checks instead of asking the owner.

## Limits

- **Live Wayland is unconfirmed.** The spike ran on Xvfb. On the desktop, the app's session bus is the real one, so
  enabling accessibility and switching the theme would touch the user's settings. Keep AT-SPI to Xvfb unless that
  is decided.
- **The AppImage's theme:** not switchable this way (`GSETTINGS_BACKEND=memory`, above); its theme row stays a hand
  walk on the live desktop.
- **DPI** (`smoke-test.md` §6's DPI row, a second monitor with another DPI) is out of reach in a single-display VM:
  `text-scaling-factor` is not DPI, and Xvfb has one screen.
- **The native picker** (in-process GTK3, through rfd) was not reached through AT-SPI. `xdialog.sh` covers it on X.
- Clicking through AT-SPI (`do_action`) is not a pointer event. Rows that test pointer behaviour keep xdotool.

## Steps, when it's picked up

1. Write `atspi.py`, then check `dump` and `menu` against the spike's output.
2. Run tauri-driver inside the private session, and confirm that `wd.mjs` and `atspi.py` see the same app.
3. Walk the text-field menu (Paste into Search commits) and the theme row on a Linux debug build, and record the
   walk.
4. `smoke-linux.md`: the AT-SPI section, plus the "Not reachable here" entries narrowed to live Wayland and DPI.
