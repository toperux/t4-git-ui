# Close-out Phase 5: the macOS walks and group BN — 2026-10-04

The walks of close-out Phase 5 (`docs/plans/2026-10-04-phase-5-plan.md`): the macOS update (M6), macOS rendering (M1),
AZ 11's macOS line (M2), T12 before and after its fix (M3), the Option-typed type-ahead measurement (M4), D9's event
logs, and smoke group BN (`smoke-test-post-v1.md` › BN, rows 1–8) on the Mac and on the Windows VM, on the three builds
of `phase-5` the fixes went through. Findings were triaged with the owner the same day (T1–T25, below).

**Setup:**
- **Mac:** the owner's own (`topher-osx.local`, macOS 26.7.1 25G241, Apple silicon), input source U.S. Not a VM: the
  walks ran on the owner's desktop, from its Remote Control session `topher-osx-local-noble-seahorse`. Times are UTC
  (local UTC+8).
- **Mac builds:** in a separate clone, `$S/wt` (`S=/Users/topher/t4-phase5`), never the owner's checkout;
  `npm run tauri build -- --debug --no-bundle --config '{"identifier":"dev.topher.t4gitui.smoke"}'`, launched with
  `HOME=$S/home`. M1–M4 on `a6a7a76` (`main`, the v0.10.17 gate record); BN on `ef1855d`, `02c04f6` and `cac41ed` of
  `phase-5`, pushed for the Mac (D4).
- **Mac driving:** keys through System Events (`key code`), the mouse through `cliclick` 5.1 (Homebrew, D5), screenshots
  with `screencapture`; the owner's own mouse for the by-hand rows (BN 6, D9's brief 4). Preflight: the screen unlocked,
  a System Events keystroke, a `cliclick c:` read back, the `AXCloseButton` form on a Finder window — all fine.
- **Mac readouts:** a scratch probe, never committed, writing into the native title through
  `getCurrentWindow().setTitle`: Ctrl+Shift+F12 toggles a 100 ms focus poll (the active element's text and its
  `data-kbd`), the select's keydown writes `key`, `code` and `altKey`, and a second version adds an event log
  (Ctrl+Shift+F11). The `cac41ed` walk ran without it.
- **Mac fixtures:** `smoke-fixtures.sh $S/t4`, plus
  `long/a-very-long-branch-name-that-will-not-fit-in-a-280px-row-menu-at-all` and `ø-test` in `work`; recents seeded
  with `$S/r/repo1..7`.
- **Windows VM:** local release `tauri build --no-bundle` builds (the BN ones 2 min 52–56 s) of `a6a7a76` (M3's
  control), `ef1855d`, `02c04f6` and `cac41ed`, launched with `docs/smoke/fixtures/smoke-launch.ps1`, driven over CDP
  (port 9222), 1280 × 800, `work`, dark (the OS theme: a fresh WebView2 profile has no stored theme, T8). Recents seeded
  with 7, later 8 repositories (**More recent** holds `perf-B`, then `perf-B` and `t4-git-ui`).
  `%APPDATA%\dev.topher.t4gitui` backed up before each walk and restored byte-exact after; the backups deleted.

## M6 — the macOS update, 0.10.12 → 0.10.17 (the installed app)

`~/Library/Application Support/dev.topher.t4gitui` backed up first. The first macOS update ever walked.

| Step | Result |
|---|---|
| Installed app before | 0.10.12; designated requirement `identifier "dev.topher.t4gitui" and certificate leaf = H"53effb03083bba9accd9b16f4e5db6c6ae5acc39"`, *T4 Apps Self-Signed Code Signing* |
| Launched, 09:13:12 | pid 24825, 4 tabs restored |
| The update badge | ~09:13:50 |
| Badge clicked, 09:14:58 | Settings: *Update to 0.10.17…* |
| Clicked, 09:15:14 | *Downloading…* (69 % at 09:15:16); no separate install dialog |
| Restarted by itself | old pid gone 09:15:17; new pid 25440 (ppid 1) at 09:15:17; window back at 09:15:21 (behind iTerm), one window, the same 4 tabs |
| Installed app after | 0.10.17; the **same** designated requirement; `codesign --verify --deep --strict` passes |
| Settings › Check now | "T4 Git UI 0.10.17 is up to date" |
| Log | no `ERROR` / `WARN`; the updater logs nothing (open-items §B); `opened repo` doubled, as in BL 11 (C-2) |
| Closed | store restored; `diff -r` against the backup identical |

Not checked: `requireSignedVersion` (0.10.12 predates it, so the next release's macOS update would be its first macOS
check), and the folder-access prompt (no recent repository under Documents, Desktop or Downloads). The owner's Mac is on
0.10.17 since.

## M1 — macOS rendering (`a6a7a76`)

Pass: fonts, the panels and the graph, dark and light; styled scrollbars (thumb and hover); every splitter drags; the
dock drags once open; no native menu on the toolbar, a panel header, the status bar or the bare diff body; the native
menu on a text field (Cut / Copy / Paste / Writing Tools…) and on selected diff text (Look Up / Translate / Copy…); the
app's commit-row menu; the native title bar sits above the toolbar, no overlap; ⌘, ⌘W ⌘1 ⌘Q; a tab torn off into the
window body.

Findings, each seen once unless noted, triaged as T10–T18 (below). One more, fixed as D7: a select opened by a click got
no keys and didn't close on an outside click (WebKit gives a clicked button no focus) — walked as BN 5.

## M2 — AZ 11 macOS (`a6a7a76`): 3a, 3b, 3d, 3i and 6 pass, light and dark

A = `work` (seeded first, so `main`), B = `other`.
- **3a:** A + B at B's close (09:32:33.9) and 2 s later; A only at +5.2 s; the next launch A.
- **3b:** B closed at 09:32:57.5, A at 09:32:59.2 (the app exited): A + B, still at +5 s; the next launch A + B.
- **3d:** B closed, A only at +5.5 s; A closed: A; the next launch A.
- **3i:** `main` emptied with ⌘W; B closed: B at once and at +5.5 s; `main` closed: B; the next launch B's tab in
  `main`.
- **6:** Shift+F10 on the HEAD row → the first item `data-kbd` on; arrowing onto Rename / Delete `long/…` wraps the row
  to 3 lines, the others unchanged, back to one line when left; "Merge long/… into main…" reads as one sentence; grid
  arrows then a right-click → `data-kbd` off, one line; the hover title shows the full name; in a short window (1280 ×
  600), End → the Delete row wraps and stays inside the window.
- **Seen:** ⌘W on B's last tab gives a layout of A at once (a window that closes with no tab isn't kept, as AZ 3l says);
  closing `main` with its red button quits the app.

## M3 — T12, before and after

**Before (`a6a7a76`).** The Mac, through the focus poll:
- (a) click, click → `repo5` focused, `data-kbd` off: pass.
- (b) ↓ to **More recent** (`data-kbd` on), then `cliclick c:` → the focus on `<body>`, `data-kbd` off: the submenu
  open, nothing in it focused, ↓ dead.
- (c) ↓ to **More recent**, → → `repo5` with `data-kbd` on: pass.

The Windows control on the same commit, path (b): the submenu's first row came up marked — T12 confirmed, and not
WebKit's. The cause was `openedByKey()` counting an opener that still carries the mark as a keyboard open; D6 dropped it
for every menu (`ef3711b`).

**After.** BN 3 (below): on the Windows VM path (b) gives the first row focused and unmarked on `ef1855d`, `02c04f6` and
`cac41ed` (it was marked on `a6a7a76`), the parent keeping its own `data-kbd` (with no visual: the CSS keys on
`[data-kbd]:focus`). On the Mac, `<body>` kept taking the focus on `ef1855d`; D9's logs found why, and D10 fixed it.

## M4 — the Option keys, measured (`a6a7a76`)

A focused select's keydown, through the probe:

| Keys | `key` | `code` | `altKey` |
|---|---|---|---|
| Option+a | `å` | `KeyA` | true |
| Option+o | `ø` | `KeyO` | not noted |
| Option+1 | `¡` | `Digit1` | not noted |
| Option+↓ | `ArrowDown` | not noted | not noted |
| Option+u, then u | `Dead`, then a plain `u` | not noted | not noted |

On that build Option+o did nothing (the list didn't move to `ø-test`), and Option+2 / Option+1 switched the view with
the branch filter focused. The fix (`ef3711b`) is as the plan wrote it: on macOS an Alt keydown with a one-character
`key` and a non-digit `code` is type-ahead. Walked as BN 4.

## D9 — the focus lost on a menu-row click (briefs 3 and 4, `ef1855d`)

- **Brief 3, `cliclick`:** BN 3 (b) passed 4 of 7 quick clicks and failed 2 of 7 (the report doesn't say what the third
  run gave), where the mouseup and the click never arrived, and failed all 4 held presses (50 ms). The event log of a
  failure: `pointerdown`, `mousedown`, `focusout` from **More recent**, then no `mouseup` or `click`. The same failure
  hit path (a) too.
- **Brief 4, the owner's real mouse:** path (b) 0 of 10, path (a) 0 of 5. Press, release and click all arrive, but the
  focus ends on `<body>`: the hand rested on the row past the 150 ms hover grace, so the panel was already open; the
  click's `setOpenSub` changed nothing, so the focus effect never ran; and WebKit's press had already dropped the focus
  to `<body>`. Ordinary rows all worked.
- So brief 3's failures were the harness (T23), and brief 4's a real bug, on every OS for → and Enter after a hover
  (reasoned): fixed as D10 (`62d3bc5`, `openPanel` focuses the first row itself when the panel is already open) and
  walked as BN 6. Change review pass 7 then found D11 (`e8b78d2`, a fixup of `62d3bc5`): the "take the focus" flag was
  never cleared, so a later reopen by hover pulled the focus in.

## Group BN

Builds, all pre-squash on `phase-5`: `ef1855d` holds D6 and M4 (`ef3711b`) and D7 (`c38c750`); `02c04f6` adds D10 and
D11 (`62d3bc5`, `e8b78d2`); `cac41ed` adds T13 (`01930d2`) and T10/T11 (`4f493ef`). After `ef1855d` the only menu change
is the submenu's open and focus (D10, D11), and no select code changed; after `02c04f6` no menu or select code changed.
So each row stands on the last build it was walked on.

| Row | Mac | Windows VM |
|---|---|---|
| 1 A click never marks | pass on `ef1855d` (twice, then 4 more), and on `02c04f6` | pass on `ef1855d` |
| 2 A key always marks | pass on `ef1855d` | pass on `ef1855d` |
| 3 The click on a marked submenu row | `ef1855d`: intermittent under `cliclick` (D9, T23); pass on `02c04f6` (scripted, 3 of 3) and `cac41ed` | pass on `ef1855d`, `02c04f6` and `cac41ed` |
| 4 Option-typed type-ahead | pass on `ef1855d` | — (macOS only) |
| 5 A select opened by a click | pass on `ef1855d`, and on `02c04f6` | pass on `ef1855d` |
| 6 A hover-opened submenu row | pass on `02c04f6` by hand: (i) 5 of 5, (ii) 3 of 3, (iii) 3 of 3; (i) again on `cac41ed` | pass on `02c04f6`, (i)–(iii) over CDP; (i) again on `cac41ed` |
| 7 The dock opens with no output | pass on `cac41ed` | pass on `cac41ed` |
| 8 A torn-off window stays on screen | pass on `cac41ed`: (a)–(c); the shrink case and two displays not reachable | pass on `cac41ed`: (a)–(c) and the shrink case; a second display not reachable |

**Mac, brief 3 (`ef1855d`).**
- BN 1: pass twice, then 4 more times. BN 2: pass. BN 3 (c): pass; (b) as in D9.
- BN 4: Option+o → the list opened on `ø-test`; Escape, Option+↓ opened it; with the branch filter focused, Option+2 →
  Changes; with the *Sign this commit* select focused, Option+1 → History (the panel was in 3 columns).
- BN 5: pass, with spaced clicks. The first click after opening Settings was swallowed once, and clicks under 0.6 s
  apart pair like a double-click (T23). M1's select finding re-checked on the branch filter: pass.

**Mac, brief 5 (`02c04f6`).** BN 6 by hand: (i) 5 of 5, (ii) 3 of 3 (→, →, Enter), (iii) 3 of 3. BN 3 (b) scripted 3 of
3; BN 1 and BN 5 again, pass. In (iii), after the hover closed the submenu the focus was on `<body>` (T22, deferred).

**Mac, brief 6 (`cac41ed`, no probe).** The screen 1512 × 982, its visible frame y 34–982 (the Dock hidden
automatically).
- BN 7: pass.
- BN 8: (a) dropped at (1508, 978) → the window at (232, 182), 1280 × 800, flush with the bottom-right; (b) at (5, 5) →
  (0, 34), under the menu bar; (c) at (220, 170) → (80, 114), the drop less (140, 56), unclamped; a drop mid-screen
  clamps to (232, 182).
- BN 3 (b) scripted, once, and BN 6 (i) by hand: both pass (each read indirectly: ↓ then highlighted `repo6`).
- The logs clean. Seen once each: the first drag after a relaunch made no window (T24); one Repository › recents click
  did nothing (T25).

**Windows VM, `ef1855d`.**
- BN 1: Tab twice to `work` (`data-kbd` on, the ring) → a real click → the first item *Commit…* focused, `data-kbd` off,
  no highlight.
- BN 2: Escape → `work` marked; Enter → *Commit…* `data-kbd` on, accent; ↓ → *Add remote…* the only one marked; Escape,
  click commit row `49104e8`, Shift+F10 → *Checkout (detached)* marked, accent.
- BN 3: ↓ ×10 to **More recent** (marked) → a press and release with no `mouseMoved` → `perf-B` focused, `data-kbd` off,
  no highlight (on `a6a7a76` it was marked); the control, → → `perf-B` marked.
- BN 5: a click on the *Tool* select → open and focused, `:focus-visible` false; ↓ ↓ ↑ → KDiff3 / Beyond Compare /
  KDiff3; "w" → WinMerge; Enter picks; reopened, clicked again → closed and stayed closed (700 ms); reopened, a click on
  the *Context lines* label → closed, the value unchanged. No keyboard ring after a click; the field's own focus style
  shows, as on text inputs. The first "click elsewhere" landed on the open list (it covers the description) and picked
  *None*, so it was redone on the label; Apply never clicked, and the global git config has no `diff.` / `merge.` keys.

**Windows VM, `02c04f6`.**
- BN 3: as before — `perf-B` focused, unmarked; the control → → marked.
- BN 6 (i): a 300 ms hover opens the panel, the focus stays on *Commit…*; a press → `perf-B`, unmarked, `:focus-visible`
  false; ↓ → `t4-git-ui` marked.
- BN 6 (ii): ↓ to **More recent** (marked), the hover opens the panel, the focus stays; → → `perf-B` marked; Enter the
  same.
- BN 6 (iii): a click on **More recent** → `perf-B` unmarked; a 300 ms hover on *Commit…* → the panel closes, the focus
  on `<body>`; back on **More recent** → it reopens, the focus still on `<body>`, not a submenu row; ↓ → nothing marked.
- T22 measured: after the hover close the focus is on `<body>` and ↓ is dead (three tries); Escape closes the menu and
  puts the focus back on `work` (marked, the ring).

**Windows VM, `cac41ed`.** One display, 1920 × 1200 at 100 %, work area (0, 0) 1920 × 1152 (a 48 px taskbar); the main
window's outer rect 1296 × 839 (7 px invisible borders), client 1280 × 800. Drags over CDP: `mouseMoved`,
`mousePressed`, 12 moves with `buttons=1` 40 ms apart, `mouseReleased`.
- BN 7: "No output yet", the chevron enabled; a click → an empty log and the *Run git command* prompt.
- BN 8 (a): dropped at (1900, 1140) → the outer rect (624, 313)–(1920, 1152), its right and bottom on the work area's
  (unclamped it would end at (1760, 1116)); the size unchanged.
- BN 8 (b): at (10, 10) → the outer rect at (0, 0) (unclamped (−130, −14)).
- BN 8 (c): at (600, 320) → (460, 296), the drop less (140, 24), unclamped (a true mid-screen drop would clamp: 839 px
  can't fit below 313).
- BN 8, the shrink case: `main` resized with `SetWindowPos` to 1950 × 1230 → the torn-off window's outer rect is exactly
  the work area, 1920 × 1152.
- The clamp is on the outer rect, so the drawn frame stops 7 px short of the work area's edges (the taskbar isn't
  covered).
- BN 3 and BN 6 (i) again: pass.

**Linux VM, `1e58f7c` (`main` after the squash).** Ubuntu 26.04.1, WebKitGTK 2.52.6; a `.smoke` debug build under
Xvfb at 1600 × 1000 with **no window manager**, driven by WebDriver (`wd.mjs`, tauri-driver), an isolated `HOME`,
`/tmp/t4` fixtures; `main` 1280 × 800. BN 4 is macOS only.
- BN 1: Tab ×3 to `work` (marked) → a WebDriver click → *Commit…* focused, `data-kbd` off, no highlight. Its
  `:focus-visible` is true on WebKitGTK (false on Windows), but nothing is drawn: the menu's CSS keys on `data-kbd`.
- BN 2: Escape → `work` marked; Enter → *Commit…* marked; ↓ → *Add remote…* the only one marked; Shift+F10 on a commit
  row → *Checkout (detached)* marked.
- BN 3: a press and release with no move first → `repo5` focused, unmarked, 3 of 3; the control, → → marked.
- BN 5: a click opens and focuses, `:focus-visible` false; ↓ ↓ ↑, "m" → Meld, Enter picks; a second click closes it for
  good; a click on a label closes it.
- BN 6, scripted (350 ms hovers): (i), (ii) and (iii) 3 of 3 each; in (iii) the focus ends on `<body>`, as on Windows
  (T22).
- BN 7: pass.
- **BN 8 failed on the size:** every torn-off window opened wholly on the screen, but at 700 × 500, the minimum. The
  control on `2003397`'s `window.rs` gave 1280 × 800. `place()` read the window's outer and inner size before X11 had
  configured it, so the clamp started from the minimum and shrank the window to it. Fixed forward in `4705c6c`: the
  clamp starts from the size the window was built with, and the reads only give the decorations.

**Re-walks of BN 8 on `4705c6c`.**
- Linux VM, as above: (a) dropped at (1590, 990) → (320, 200), 1280 × 800, flush with the bottom-right; (b) at (10, 10)
  → (0, 0); (c) at (150, 100) → (10, 76), the drop less (140, 24), unclamped; the shrink case (`main` resized by
  `xdotool` to 1700 × 1100) → (0, 0), 1600 × 1000, the whole screen (no window manager, so no panels), 4 of 4 by direct
  launch. With no window manager the outer rect is the client.
- Windows VM, as for `cac41ed`: (a) at (1900, 1140) → the outer rect (624, 313), 1296 × 839, its right and bottom on the
  work area's; at (600, 320) → (460, 296), unclamped; the shrink case with `main` maximized → the outer rect exactly the
  work area, 1920 × 1152. (a) and the mid drop identical to `cac41ed`.
- Seen on Linux, not part of BN 8 (to triage): the shrink case under WebDriver (1 of 1) opened the window at the right
  size but its page never started (blank, untitled), the second-window pattern of `open-items.md` §O; by direct launch 4
  of 4 rendered. And with `main` saved at 1700 × 1100 (bigger than the screen) in `.window-state.json`, the next launch
  opened `work` in Rust but the page stayed on the start spinner, 4 of 4; saved at 1650 × 1050 or smaller it loaded.
  Not checked: whether that predates `4705c6c`, and whether a window manager changes it.

## Harness notes

- **`cliclick`:** plain `kp:` keys don't reach WKWebView; System Events `key code` does. `keystroke "1" using option`
  arrives as Numpad1, so Option+1 is sent as `key code 18`. A quick `cliclick` press and release sometimes lost the
  mouseup; once a click's `pointerdown` never arrived (BN 1's first try, where the mark leaked once); the first click
  after opening Settings was swallowed once; clicks under 0.6 s apart pair like a double-click. None of this happened
  with a real mouse (brief 4) — accepted as harness artifacts (T23).
- **CDP:** `Browser.setWindowBounds` resizes only the WebView, not the native window; BN 8's shrink case used Win32
  `SetWindowPos` instead.
- **The Mac's hidden window:** an unnamed, hidden 500 × 500 window at (0, 482) exists from launch in every run (T17,
  accepted and closed: not from this repository's code).
- **Windows theme:** the smoke profile follows the OS theme, since localStorage is private to the WebView2 profile (T8;
  `smoke-cdp.md` says so).

## Not reachable

- **Two displays and mixed DPI:** both machines have one display (the Mac its Retina panel, the VM 1920 × 1200 at 100
  %). BN 8's second-display step and a drop across screens of different scales weren't walked; `4f493ef` / `cac41ed`'s
  per-screen units are reasoned only.
- **BN 8's shrink case on macOS:** macOS keeps the main window within the screen, so it can't be made bigger than the
  work area. Walked on Windows only.
- **The folder-access prompt** in M6: no recent repository under Documents, Desktop or Downloads.
- **`requireSignedVersion` on macOS:** 0.10.12 predates it (M6).

## Triage (2026-10-04)

The owner's rulings, row by row (`CLAUDE.md` step 6). "T12" here is this phase's triage row, not the Linux menu-focus
plan's T12 (M3).
- **Fixed:** T6 (`src/README.md`'s `keys.ts` line), T10 / T11 (`4f493ef`, BN 8), T13 (`01930d2`, BN 7), T18
  (`open-items.md` §B names the splitters); plus D6, D7, D10, D11 and M4, above.
- **Deferred, `open-items.md` §Z:** T5 and T9 (= D8) (Mac detection and the Ctrl+ hints on macOS), T14 (the macOS app
  menu), T15 (a row's tooltip over its context menu), T22 (a hover-close drops the focus to `<body>`).
- **Accepted with a reopen trigger, `open-items.md` §Q:** T1 (screen readers), T7 (= D1, tab adoption), T24 (one
  tear-off drag that made no window).
- **Accepted and closed, `open-items-done.md` §Z:** T2, T3, T4, T8, T12, T16, T17, T19, T20, T21, T23, T25.

From the Linux walk and the BN 8 re-walks (T26–T30):
- **Fixed:** BN 8's X11 size (`4705c6c`, above).
- **Accepted with a reopen trigger, `open-items.md` §Q:** T26 (the launch stall with `main` saved bigger than the
  screen, no window manager; it predates Phase 5, measured below), T27 (X11 with a window manager: an overhang of about
  a title bar), T29 (with no main window: an overhang of up to about 100 px).
- **Accepted and closed, `open-items-done.md` §Z:** T28 (WebKitGTK's `:focus-visible` on a click-opened menu item,
  nothing drawn).
- **Added to `open-items.md` §O's "a restored second window sometimes never starts":** T30 (the tear-off under
  WebDriver whose page never started).

T26, measured on the Linux VM the same day: saved at 1700 × 1100, `4705c6c` stalled 13 of 14 launches, `1e58f7c` and
`a6a7a76` 3 of 3 each, their 1280 × 800 controls loaded; under openbox (frame 1, 1, 22, 5) the window was shrunk to
the screen and 3 of 3 loaded. In the stuck page JavaScript runs (WebDriver answers, `requestAnimationFrame` at 61 fps)
but an `invoke('probe_git')` is never answered nor logged; gdb shows the GTK main loop and the tokio workers idle. A
resize to 1280 × 800 or 1650 × 1050 wakes it, a 1 px one doesn't.

## Hash map

The walks name the `phase-5` side branch's pre-squash hashes; squashed on 2026-10-04 into eight commits on `main`:

| Squashed | Pre-squash (`phase-5`) |
|---|---|
| `42bc76d` docs: the Phase 5 plan | `ac8ecac` |
| `6b5e597` fix: a pointer-opened menu never marks its first row (D6) | the menu half of `ef3711b` + `69f0ca1` |
| `7c6da58` fix: Option-typed characters are type-ahead (M4) | the select half of `ef3711b` + `69f0ca1` |
| `99302c4` fix: a select opened by a click takes the focus (D7) | `c38c750` + `ef1855d` |
| `78d4ab8` fix: a click or key on a hover-opened submenu row takes the focus in (D10, D11) | `62d3bc5` + `e8b78d2` |
| `2003397` fix: the output dock opens before any command has run (T13) | `01930d2` |
| `5ed01d8` fix: a torn-off window opens wholly on the screen (T10/T11) | `4f493ef` + `cac41ed` + `37daa8d` + `afc91dd` |
| `1e58f7c` docs: the records | the docs of all of the above, `8d5979c`, `1afa0cb`, `7041102` and their fixups |

Pushed with `1e58f7c`; after it, `4705c6c` (fix: a torn-off window keeps its size on X11), from the Linux walk.

The walked builds, by source (`src`, `src-tauri`): `ef1855d` = `99302c4`; `02c04f6` = `78d4ab8`; `cac41ed` = `5ed01d8`
but for a comment in `window.rs` and the README's `keys.ts` line (that one lands in the records commit).

## Cleanup

- Windows VM: the store restored byte-exact after each walk, the backups deleted; the clone left on `main` at the last
  build walked (`4705c6c`).
- Mac: M6's store restored (`diff -r` identical); the installed app is 0.10.17. The scratch folder `$S` and the `.smoke`
  build were removed the same day (the plan's Order step 11, ~3.5 GB; the real store's files hashed the same before
  and after); `cliclick` stays.
