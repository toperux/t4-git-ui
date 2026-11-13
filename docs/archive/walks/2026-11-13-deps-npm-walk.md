# Dependabot #46 (the npm group) — walks, 2026-11-13

The walks of `docs/archive/plans/2026-11-12-deps-npm-group-plan.md`. #46 is the npm group, 7 updates:
`react-resizable-panels` 4.16.1 → 4.21.0, `@tanstack/react-virtual` 3.14.25 → 3.14.26 (with `virtual-core` 3.19.11),
`lucide-react` 1.66.0 → 1.70.0, `zustand` 5.0.16 → 5.1.0, `vite` 8.3.5 → 8.3.7 (with `rolldown` 1.2.15 → 1.2.18),
`@vitejs/plugin-react` 6.2.1 → 6.3.0 and `vitest` 5.0.5 → 5.1.0. The pull request was gated locally on the owner's
Windows machine and walked on a Windows VM and a Linux VM at its head `0df2549c138e1d506af7f93279a25bda4a3ea4b6`, all on
2026-11-13, then squash-merged as `a9416b226c47db635fc806b95cb8d1204d7816e8`. Every row passed on #46 on both VMs except
two cases that are not taken as changes of #46: one reads the same on a build of `main` (measured), the other is an
already recorded open row (reasoned from its 2026-10-30 measurement, not repeated on `main`). Two older limits
surfaced: a press beside the sidebar's scrollbar on Linux that does not grab the resize bar, and End on the dock's
resize bar, which collapses the dock and drops the keyboard focus.

## Local gates (the owner's machine, Windows 11)

- Worktree `.claude/worktrees/deps-npm`, branch `deps-npm` = `0df2549c138e…` (#46's head, a fast-forward from
  `origin/main` `387291d3`). Both VMware VMs were running (available memory 0.8 to 5 GB during the gates).
- #46 was open at `0df2549c` before and after the gates.
- Baseline (`origin/main`): `npm ci` 0 vulnerabilities; `vite` 8.3.5; `npx vite build --manifest` ok.
- On #46: `npm ci` 0 vulnerabilities. `npm ls`: react-virtual 3.14.26, plugin-react 6.3.0, lucide-react 1.70.0,
  react-resizable-panels 4.21.0, vite 8.3.7, rolldown 1.2.18, vitest 5.1.0 (`@vitest/mocker` 5.1.0), zustand 5.1.0.
  tauri-cli 2.12.4. `tsc --noEmit` exit 0.
- `npm test -- --run` three times: 84 files, 1291 tests passed each time, 0 failed (about 8 s a run).
- `npm run build` exit 0.
- Rust: `cargo fmt --all --check` 0; clippy `-D warnings` 0; `cargo test --workspace --locked` all ok
  (216 + 8 + 19 + 1 + 19 + 11 + 26 + 12 + 7 + 8 + 11 + 20 + 9 + 61 + 1 passed, 0 failed).
- `npm run tauri -- build --no-bundle`: exit 0 (release, 3 m 11 s).
  - The exe launched once through `smoke-launch.ps1 -Exe … -Port 9246`: the title read `T4 Git UI - ` plus the name of
    the last repository opened, and CDP answered. It was closed with `CloseMainWindow()`.
  - The store folder was backed up before and restored after. Only `recents.json` had changed; the folder is
    byte-identical to the backup again.
  - `dumpbin /dependents`: no `VCRUNTIME140.dll`.
- Build comparison, `main` against #46 (`vite build --manifest`, hashes masked):
  - The same 13 files in `dist/assets` by name: 4 fonts, 1 CSS (70017 bytes both), the entry, 6 grammar chunks and 1
    shared chunk (`_dist`, 26452 bytes both).
  - Entry chunk 706991 → 708283 bytes (+1292).
  - Grammar chunks, +5 to +15 bytes each: css 17171 → 17176, html 12824 → 12839, javascript 77803 → 77808, json
    1690 → 1695, python 37863 → 37878, rust 83134 → 83144.
  - Every grammar row keeps its dynamic flag; the entry's dynamic list has the same six, in the same order.
  - Each grammar chunk's `imports` list holds the same two chunks in the other order (`index.html, _dist` → `_dist,
    index.html`). In the json chunk the difference is the order and the local names of the import statements; the rest
    is equal.
  - `index.html` is identical after masking the hashes (1005 bytes both), inline style and script included; no preload
    link.
  - No `rolldown` error stub on either side.
  - The plan's stop condition "a grammar chunk imports the entry chunk" holds on both builds, `main`'s too: each grammar
    chunk imports two names from the entry (the shared highlight code lives there). It is not a change of #46. It was
    put to the owner, who ruled to continue.

## Windows VM

### Build
- `git fetch origin pull/46/head` → FETCH_HEAD `0df2549c138e1d506af7f93279a25bda4a3ea4b6`; `rev-parse HEAD` matches.
- `npm ci`: 109 packages added, 110 audited, 0 vulnerabilities, 10 s. tauri-cli 2.12.4.
- `npm ls`: `@tanstack/react-virtual` 3.14.26; `@vitejs/plugin-react` 6.3.0 (vite 8.3.7 deduped); `lucide-react` 1.70.0;
  `react-resizable-panels` 4.21.0; vite 8.3.7 (rolldown 1.2.18); vitest 5.1.0 (`@vitest/mocker` 5.1.0, vite deduped);
  zustand 5.1.0.
- `npm run tauri -- build --no-bundle`, foreground, `CARGO_BUILD_JOBS=1`, no app running: exit 0. Cargo 4 m 54 s; 5 m
  14 s in total. vite printed "Some chunks are larger than 500 kB after minification" (`index-CZ0me7Pp.js`, 708.28 kB).
- Exe 23,199,744 bytes, sha256 `72936517B1D954DB9DD765A5720ADD2CF261F16417E380A214BDB5EB8CF18C5D`, 0.10.25.
- The helpers of 2026-11-11 (the recorder `rec.js` and `cdpx.mjs`) were still in the scratchpad. Added this walk on the
  `cdp.mjs` copy: `--wheel` (real wheel events) and `--edgegrab` (the a2 presses and the hover reads), with the
  left-button fix. The recorder is unchanged.

### Fixtures
- Under `C:\tmp\t4bn`, built with the brief's commands: `work`, `other`, `bv`, `bx`, `by-big` (`wide/s0/f.txt` edited;
  `maint` = `1e4ee77` "commit 10") and `hl` by hand. `tall` was added for the closing check of row d. All deleted
  after.

### Windows rows

- **a1. Every separator follows the pointer — pass.** Each separator dragged three times; the centre's move read per
  drag.
  - At 1280, History, a commit selected:
    - Resize sidebar +40/−90/+50 → exact.
    - Resize details −60/+90/−30 → exact.
    - Resize commit details +40/−70/+30 → 40.02/−70.02/30.
    - Resize side column +60/−100/+40 → exact.
    - Resize output (dock open) −60/+100/−40 → exact.
  - At 1400:
    - Resize sidebar → 40/−90.02/50.
    - Resize details → exact.
    - Resize commit details → 40/−69.98/30.
    - Resize file list +50/−80/+30 → exact.
  - Changes: Resize file lists +40/−90/+50 and Resize commit message −50/+80/−30 → exact.
  - Stashes dialog (one shell stash in `by-big`, popped after): Resize stash list +40/−80/+40 and Resize file list
    +60/−100/+40 → exact.
  - Every drag inside the aria min/max. Worst error 0.02 px.
- **a2. Grab at the edges, and hover — pass.**
  - A 5 px box; pressed 1 px inside each edge and 2 px outside each edge, then moved 30 px with the button held. All 12
    presses started a drag and the separator followed 30 px (Resize details −29.98), on Resize sidebar, Resize details
    and Resize output (dock open).
  - The outside presses landed (`elementFromPoint`) on: a sidebar row button / a grid row; the grid's subject cell / the
    diff header; the Diff region / the dock header.
  - Hover: the element under the pointer and `body` compute `ew-resize` (sidebar) or `ns-resize` (details, output);
    120 px off, both `default`.
  - The first pass moved only 7.5 px per drag: the harness sent the moves without the left button. Fixed and re-run;
    the numbers are from the re-run.
- **a3. Keyboard — pass.**
  - Resize sidebar (v 20.391): → → ← gives 25.391, 30.391, 25.391; the centre moves 63.75 px per step. Home → 14.118
    (min). End → 43.922 (max).
  - Resize details (v 59.988): ↓ ↓ ↑ gives 64.988, 69.988, 64.988; the centre moves 26.3 px per step. Home → 22.814.
    End → 77.186.
  - Resize output (v 72.64, dock 200): ↑ ↑ ↓ gives 67.64/237, 62.64/273, 67.64/237. Home → 56.224, dock 320. End →
    96.17: the dock collapsed to 28 and the focus left the separator (it is disabled when the dock is closed). The
    same on `main` (see the comparisons below).
  - `aria-valuenow` followed every time. Enter on Resize output, with the dock reopened at 320 and v 56.224, pressed
    twice: nothing changed.
- **a4. BH 10 — pass.** History toggled → the rail. Changes → 260. Toggled there → the rail. History → still the rail.
  Changes untoggled → 260. Dragged +60 → 320. Alt+1 (the rail), then Alt+2 → 320 again. Ctrl+Shift+N on a second tab
  (`work`): the new window is 260 in both views, the rail at 900 and 260 at 1280. The source window kept its rail in
  History and its 320 in Changes.
- **a5. Dock regression — pass.** Dragged to 300 → Ctrl+` 28 → Ctrl+` 300. Double-click → 200. Dragged to 300 → window
  700×500 → 231 → back to 1280×800 → 300. At 1400: Resize file list dragged to 380|345, double-clicked → 320|405.
- **c. Diff reload anchor and the grid's instant scrolls — pass, the same numbers as 2026-11-11.**
  - `bv` `ws` › `w.txt` at 15000, top "820 − line 820" at −12: whitespace on → 7456 (897 rows), same row at −12; off →
    15000 (1797 rows); Refresh → 15000, no jump.
  - `bx` `a.txt` at 12000, top "657 657" at −16: a top insert → 12224, "657 664" at −16, 1808 rows; restore → 12000,
    1797 rows.
  - `by-big`: 7800 with commit 1201 at the top, kept through Alt+2/Alt+1 and Ctrl+Tab away and back. `maint`
    (`1e4ee77`, "commit 10") → st 38416, row at 350. End → commit 1, 38650. Home → the working-tree row, 0.
  - Recorder: 0 blank / 0 gap / 0 overlap in every run; the grid run 1310 frames.
- **d. The diff cursor's scrolls — three cases pass; the fourth passes near and fails far, where it is an open row.**
  - `bx` `a.txt` in Changes. Each row's start and end were read from the virtualizer's measurements; every start equals
    the sum of the 24 px hunk and 20 px line heights above it.
  - ↓ held, pass: 45 presses from line 10 at st 0, ch 611. 41 scrolled, all 41 `scrollTop` = the cursor's end − 611;
    the last st 3725 with the cursor at 4316–4336. Recorder 1162 frames, 0/0/0.
  - ↑ held, pass: 45 presses back up. 21 scrolled, all 21 = the start of the cursor's hunk header (2024, 1840, …, 552).
    0/0/0. The branch "else the cursor row's start" was not reachable with this fixture (every hunk spans at most
    184 px against a 611 px view); it passed in the closing check below.
  - Range on the bottom edge, pass: the cursor on "40 − line 40", flush at st 45. Shift+↓ → "2 lines selected" (24 px),
    ch 611 → 587, st 89 = 676 − 587. 0/0/0.
  - Staged, scrolled away, ↓:
    - Two lines staged with Space/Enter; the focus came back to the cursor ("60 − line 60"); `git diff --cached` showed
      the 40 and 50 pairs staged.
    - Near case, pass: a scroll of 4 × 100 → st 700, the cursor row at 656–676 just above the view, still
      mounted, focus kept. ↓ moved the cursor to "70 − line 70" at 820–840, inside 700–1311.
    - Far case, fail: 15 wheel notches of 400 → st 6300. The cursor row unmounted and the focus dropped to `<body>`. ↓
      only scrolled the diff natively, 6300 → 6340; the cursor was not moved or brought into view. An earlier try that
      set `scrollTop` to 8000 directly gave the same.
    - The far case is what the open row "A diff cursor scrolled out of the mounted range loses the keyboard" in
      `docs/plans/open-items.md` describes, measured on 0.10.24 on 2026-10-30. So it is taken as older than #46. That
      is reasoned from that measurement: the far case was not repeated on a build of `main`. The plan's expectation
      for it, that the cursor row lies wholly inside the view afterwards, was too wide.
  - Recorder 0/0/0 throughout row d.
  - Closing check, the ↑ branch "else the cursor row's start" (#46), pass, 0 mismatches:
    - Fixture `C:\tmp\t4bn\tall`: `t.txt`, 120 lines with " x" appended to each; one hunk, 241 rows (header 0–24, then
      20 px rows); the view's `clientHeight` 643; recorder on.
    - ↓ ×80 from line 1: 51 presses scrolled, all 51 flush at the bottom; it ended at st 1001, the cursor "81 − line
      81" at 1624–1644.
    - ↑ ×40, then ×25 more: 20 presses scrolled. 19 matched "cursor row's start" (st 1001 → 984, 964, … 644, 624; the
      last with the cursor on "31 − line 31" at 624–644, header-to-end 644 > 643). 1 matched "header start" (the cursor
      on "30 − line 30" at 604–624, span 624 ≤ 643, st = 0).
    - Recorder 0 / 0 / 0 in all runs (1880, 941 and 589 frames). Every row start equals the summed 24/20 heights.
    - #46 was rebuilt for this check, because the build of `main` had overwritten the exe (see Seen on the way).
- **e. Icons — pass.**
  - `work`: toolbar 15/15 drawn, 80–94 visible SVGs, 0 blank.
  - Menus: grid row 14/14; commit file row 5/5; branch `main` 7/8 ("Push…" has no icon in the source); remote `nowhere`
    5/5.
  - The two renamed icons, class lists:
    - Error toast (Fetch `nowhere`; "work: Operation failed / fatal: Could not read from remote repository."): `lucide
      lucide-circle-exclamation-point lucide-alert-circle lucide-circle-alert`.
    - Detached banner: `lucide lucide-triangle-exclamation-point lucide-alert-triangle lucide-triangle-alert`.
    - Status bar: no dirty-state icon exists; its `TriangleAlert` shows only for a repository state other than clean
      (`RepoWindow.tsx:532-535`). With a merge started from the shell (`git merge conflict` in `work`), "Merge in
      progress" carries the same `TriangleAlert` classes, as do the merge banner and the "1 file has conflicts" banner.
      The merge was aborted after; HEAD back on `main`.
- **f. Grammars — pass.** Each diff in `hl` shows `_syn*` spans:
  - a.ts: keyword 6, type 6, punct 29, function 1, string 6 (7 colours).
  - a.rs: keyword 4, type 7, punct 20, function 1, string 6.
  - a.css: type 7, punct 17, keyword 2, number 2.
  - a.json: punct 14, string 8, number 3.
  - a.html: punct 33, type 14, string 5.
  - a.py: keyword 3, function 1, punct 6, string 6.
  - Loaded JS resources rose from 4 to 8. Hook `[]`.

### Console hook and log
- Console hook `[]` in every window read (`by-big`, `bv`, `bx`, `work`, `hl`, the 150 % launch, the 100 % relaunch).
- App log `t4-git-ui.log.2026-11-13`, 139 lines: 0 WARN, 0 ERROR; the only "failed" line is the deliberate Fetch
  `nowhere`. No chunk or import errors.
- The later runs the same day: hook `[]` on both builds; the log's lines 140–197 (the double-click comparison's four
  launches) and 198–229 (the closing checks) hold 0 WARN and 0 ERROR.

### a6. 150 % scaling — pass, except that the root never went fractional
- Screen 1920×1200 physical at 100 % (96 DPI), work area 1920×1152. Claude Code runs on the VM itself in the console
  session (session 1, Active); no RDP; the display is the VMware SVGA adapter.
- The scale was set with `SystemParametersInfo(SPI_SETLOGICALDPIOVERRIDE 0x9F, +2 steps from the recommended 100 %)`:
  user-level, live, no sign-out, no elevation. Effective DPI 144.
- After a restart: `devicePixelRatio` 1.5, screen 1280×800 CSS (available 1280×752).
- `cdp.mjs --inner` can't size the native window at this scale: it resizes only the WebView (asked 1000×600 CSS, the
  WebView read 1000×600 while the window's client stayed 1280×800 px, overflowing). The client size was set with
  `SetWindowPos` in physical pixels instead.
- Base 1914×1104 px = 1276×736 CSS (the largest that fits the work area with its frame). History, commit 1500 selected,
  dock opened with Ctrl+`.
- Raw readings, client px → inner = root | sidebar W | details H | dock H | side column W | side column upper H:
  - 1914×1104 → 1276×736 | 260 | 253.6041717529297 | 200 | 300 | 124.30208587646484
  - 1913×1103 → 1276×736 | 260 | 253.6041717529297 | 200 | 300 | 124.30208587646484
  - 1911×1101 → 1274×734 | 259.9895935058594 | 253.59375 | 200 | 300 | 124.30208587646484
  - 1688×1104 → 1126×736 | 259.9895935058594 | 253.6041717529297 | 200 | 300 | 124.30208587646484
  - 1802×1103 → 1202×736 | 260 | 253.6041717529297 | 200 | 300 | 124.30208587646484
  - 1914×1104 → 1276×736 | the same as the first reading
- No size gave a fractional root: WebView2 reported the viewport as whole CSS pixels (1913×1103 px read 1276×736, 1688
  read 1126, 1802×1103 read 1202×736); `documentElement`, `visualViewport` and `clientWidth` agree.
- The row's limit: the fractional sizes were applied (for example 1913 px at 1.5 is not a whole number of CSS pixels)
  but could not be read back: the root's size at those steps is known only as WebView2 rounds it.
- Every panel within 0.011 px of its first reading (limit 0.67), the same at the end. The upper panel at 124.3, well off
  its 80 px minimum.
- a1 at 150 %: Resize sidebar +40/−90/+50 → 39.99/−90/50.01; Resize details −60/+90/−30 → −60/90.01/−30.01; Resize
  output −60/+100/−40 → exact.
- The scale was set back to 0 steps: DPI 96; a relaunch read `devicePixelRatio` 1.

## Linux VM

### Build
- `grep -c bmi2 /proc/cpuinfo` = 8. It was checked first because `rolldown` 1.2.18's Linux x64 binary crashes with an
  illegal instruction on CPUs without BMI2.
- FETCH_HEAD and `git rev-parse HEAD` both `0df2549c138e1d506af7f93279a25bda4a3ea4b6`.
- `npm ci`: 0 vulnerabilities. tauri-cli 2.12.4.
- `npm ls`: `@tanstack/react-virtual` 3.14.26, `@vitejs/plugin-react` 6.3.0, `lucide-react` 1.70.0,
  `react-resizable-panels` 4.21.0, vite 8.3.7 (rolldown 1.2.18), vitest 5.1.0, zustand 5.1.0.
- vite built in 1.49 s, cargo in 1 m 40 s (the `.smoke` debug build), no "Illegal instruction".
- Ubuntu VM, Xvfb :99 at 1600×1000, openbox 3.6.1, a private `dbus-run-session`, a scratch HOME with no `.gitconfig`,
  tauri-driver on port 4446.

### Fixtures
- Under `/tmp/t4bn`: `work` and `other` (`smoke-fixtures.sh`), and `hl` by hand. Deleted after.
- Every measurement carried `document.title` ("T4 Git UI - work" or "- hl", matching the opened tab). No repository,
  dialog or tab appeared that the walk didn't open.

### Linux rows

- **a1 — pass.** 9 of 9 WebDriver drags moved the separator's centre exactly by the pointer distance, every reading
  short of the panels' limits:
  - Resize sidebar: +40, −60, +25 → +40.0, −60.0, +25.0; aria-valuenow 20.392 → 23.529 → 18.823 → 20.784 (min 14.118,
    max 43.922).
  - Resize details: +30, −50, +20 → +30.0, −50.0, +20.0; valuenow 46.073 → 52.146 → 42.025 → 46.074 (min 24.291, max
    75.709).
  - Resize output, dock open: −40, +30, −20 → −40.0, +30.0, −20.0; valuenow 71.388 → 65.666 → 69.958 → 67.097 (min
    54.22, max 95.994).
- **a2 — pass, except one press that did not grab (the same on `main`).** *Resize sidebar*'s box is 5 px; each press
  dragged ±30.
  - Dock collapsed (the sidebar fits: scrollHeight 671 = clientHeight 671, no scrollbar): 4 of 4 presses grabbed and the
    separator moved 30, two runs each (1 px inside left, 1 px inside right, 2 px outside left, 2 px outside right).
  - Dock open: 1 px inside the left, 1 px inside the right and 2 px outside the right grabbed and moved 30, two runs
    each. 2 px outside the left didn't grab in 2 of 2 runs (moved 0, valuenow unchanged).
  - Under that press: with the dock open the sidebar `<nav>` overflows (scrollHeight 618, clientHeight 469) and draws a
    classic scrollbar 11 px wide (offsetWidth − clientWidth). Its right edge is the separator's left edge, so a press
    2 px left of the box lands on the scrollbar (`elementFromPoint`, and the nav's offsetWidth − clientWidth).
  - Reasoned, not checked: WebKit keeps a press on a native scrollbar from reaching the page.
  - The comparison against `main` is below.
- **f. Grammars — pass.** In `hl`, Changes view, each file's unstaged diff opened in turn; every diff had spans with
  `_syn*` classes inside its `_dl_` lines:
  - a.ts 27 spans, 5/5 lines; a.rs 21, 5/5; a.css 15, 5/5; a.json 17, 6/6; a.html 22, 4/5; a.py 18, 5/6 (the line with
    no spans is the blank one).
  - Console (`console.error`, `console.warn`, window error and `unhandledrejection` hooked before the first grammar
    loaded): 0 entries. App stderr: no import or chunk errors. Screenshots of a.css and a.py show the colours.
- **e. Icons — pass.**
  - Toolbar 14 of 14 `<svg>`s drawn; sidebar 7 of 7.
  - Branch context menu (a real xdotool right-click on `master` in `hl`): 8 items, 7 of 7 `<svg>`s drawn ("Push…" has no
    icon).
  - The warning in `work`'s Changes view ("Set user.name and user.email"): `<svg>` 12×12 with 3 paths, class list
    `lucide lucide-triangle-exclamation-point lucide-alert-triangle lucide-triangle-alert`.
- **stderr — pass.** From `t4_git_ui`: 29 INFO, 0 WARN, 0 ERROR. Other programs on the same bus: xdg-desktop-portal
  "Failed to open service channel Wayland connection" ×2 and "Failed to create secret proxy … Timeout"; libEGL "DRI3
  error" ×2.

## Comparisons against a build of `main` (`387291d3`, `react-resizable-panels` 4.16.1), the same day

### Linux, a2's missed press
- Harness as in the first pass: Xvfb 1600×1000, openbox, a private bus, a fresh scratch HOME, `work` open alone;
  viewport 1280×800; title "T4 Git UI - work" on every reading; each press dragged by 30 along y=400.
- Dock open: `<nav>` scrollHeight 618, clientHeight 531, offsetWidth − clientWidth 11 (right edge 260).
  - Run 1: 1 px inside left (261,400) `elementFromPoint` the separator, +30, valuenow 20.392 → 22.745; 1 px inside right
    (294,400) the separator, −30, 22.745 → 20.392; 2 px outside left (258,400) NAV._sidebar [References], moved 0, no
    grab; 2 px outside right (267,400) DIV._body (the details pane), −30, 20.392 → 18.039.
  - Run 2: inside left (231,400) +30, 18.039 → 20.392; inside right (264,400) −30, 20.392 → 18.039; outside left
    (228,400) NAV._sidebar, moved 0, no grab; outside right (237,400) DIV._body, −30, 18.039 → 15.686.
- Dock collapsed: `<nav>` scrollHeight 703 = clientHeight 703, offsetWidth − clientWidth 1, no scrollbar. Run 1: inside
  left (201,400) +30; inside right (234,400) −30; outside left (198,400) `elementFromPoint` BUTTON._row, +30; outside
  right (237,400) DIV._row (a grid row), −30. Run 2 the same.
- Result: each press grabbed, or missed, on both builds alike, in both dock states.
- `main`'s nav clientHeight is 531 against 469 on #46 (one tab open, no tab strip, against two tabs on #46); the nav
  still overflows.
- On #46, `elementFromPoint` at the missed press was read once after the drags, not before each press.
- Reasoned, not checked: WebKitGTK keeps a press on a native scrollbar from reaching the page.
- Build of `main`: `origin/main` = `387291d3995709de6f37f2b7b9c2ea45208f40af` = HEAD; `npm ci` 0 vulnerabilities;
  `npm ls` 4.16.1; `.smoke` debug build, cargo 1 m 38 s, exit 0.
- Cleanup after it: the app quit through `invoke('quit')`; `pgrep` empty; `/tmp/t4bn` deleted; the checkout clean,
  detached at `387291d`; nothing ticked or committed.

### Windows, the *Resize details* double-click
- On #46 the walk's double-click on *Resize details* set 69.125 rather than 60, which left *Resize commit details*
  pinned at min = max = 50.824; it was dragged back to 60. The follow-up measured both builds.
- Result: the double-click sets 60 in every state on both builds. The 69.125 was a reading-order artifact of the walk
  and reproduces identically on both builds. The builds differ in one reading: the pinned *Resize commit details*
  value, 50.824 (#46) against 50.955 (`main`).
- Explanation of 69.125 (measured): in the walk the details double-click was followed at once by a double-click on
  *Resize output*, which shrank the dock 320 → 200; the panels were read only after both. The details panel keeps its
  pixel height (`preserve-pixel-size`), so it stayed at 162.40625 and the grid took the dock's 120 px: 363.59375 /
  (531 − 5) = 69.125 %. *Resize commit details* is pinned (min = max) because the details panel sits at 162.4 px.
- Method: `getBoundingClientRect()`, unrounded. group = the separator's parent (grid + 5 px separator + details);
  v = *Resize details*' aria now / min / max. Fixture `work` only; 1280×800, History, "odd files" (HEAD) selected;
  `layout.json` absent at launch.
- #46 (`0df2549c`, exe sha256 `72936517…8C5D`, `react-resizable-panels` 4.21.0):
  - S1, fresh, dock closed, no banner: group 703, grid 418.796875, details 279.203125, v 60 / 17.192 / 82.808. The
    double-click changes nothing.
  - S2, drag −60, then double-click: grid 358.796875 / details 339.203125 / v 51.404 → grid 418.796875 / details
    279.203125 / v 60. Group 703.
  - S3, dock open at 200: on opening group 531, grid 246.796875, details 279.203125, v 46.92 / 22.814 / 77.186; drag
    −60 → grid 186.796875, details 339.203125, v 35.513; double-click → grid 315.59375, details 210.40625, v 60.
  - S4, detached banner, dock closed: with the banner group 671, grid 455.59375, details 210.40625, v 68.408 / 18.018 /
    81.982 (the details panel keeping its pixel height from S3); drag −60 → 395.59375 / 270.40625, v 59.399;
    double-click → 399.59375 / 266.40625, v 60. Then `git checkout main`.
  - S5, the walk's state replayed: banner gone, dock closed: group 703, grid 431.59375, details 266.40625, v 61.834 (the
    2026-11-11 walk's "first reading" value, also a carried-over pixel height). Dock open, *Resize output* Home (dock
    320), *Resize details* End → group 411, grid 286, details 120 (its minimum), v 70.443 / 29.557 / 70.443.
    Details double-click → grid 243.59375, details 162.40625, v 60. Then a *Resize output* double-click (dock 320 →
    200) → group 531, grid 363.59375, details 162.40625, v 69.125 / 22.814 / 77.186; *Resize commit details* pinned at
    50.824 / 50.824 / 50.824.
- `main` (`387291d3` = origin/main, exe sha256 `12DDA551718D972B2204708563354EFCC6679175596B97BEFFE41BF9BEE8401F`,
  `react-resizable-panels` 4.16.1): S1 to S5, every group, grid, details, v, min and max reading identical to #46 to
  the last digit, including 61.834 and 69.125. The only difference: *Resize commit details* pinned at 50.955 / 50.955 /
  50.955 in S5's last reading.
- Reasoned, not checked in the library's code: the difference fits 4.21.0 measuring the 162.40625 px details panel
  unrounded where 4.16.1 used a rounded size. Nothing on screen differs.
- Build of `main`: `git fetch origin main` → `387291d3995709de6f37f2b7b9c2ea45208f40af`, `rev-parse` matches; `npm ci`
  0 vulnerabilities; tauri-cli 2.12.4; `npm ls react-resizable-panels` 4.16.1; `tauri build --no-bundle`,
  `CARGO_BUILD_JOBS=1`: exit 0, cargo 3 m 33 s, 3 m 53 s in total; exe 23,199,232 bytes. `main` prints the same vite
  larger-than-500 kB chunk warning.
- The walk's full a3 sequence was replayed too: the details double-click alone still set 60.
- Cleanup of the follow-up: console hook `[]` on both builds; app log lines 140–197 (the follow-up's 4 launches) 0 WARN,
  0 ERROR; the app quit each time; `layout.json` removed; store restored, `cmp` identical, 2 files; `C:\tmp\t4bn`
  deleted; repo left detached at `387291d3`, clean; nothing ticked or committed.

### Windows, End on *Resize output*
- `work`, 1280×800, `layout.json` absent, History, dock opened with Ctrl+` (200), focus on the separator.
- `main` (`387291d3`, 4.16.1): start v 72.64 / 56.224 / 96.17, dock 200, active = Resize output. Home → v 56.224, dock
  320, focus kept. End → v 96.17, dock 28 (collapsed); the separator turns disabled (`aria-disabled` true, tabindex
  removed) and `document.activeElement` = `<body>`. A further Home does nothing.
- #46 (`0df2549c`, 4.21.0, rebuilt): the same readings at every step.
- Result: identical on both builds, not new in #46.

## Seen on the way

- Windows:
  - *Resize details* first reading was 60 exactly on #46, with commit-details limits 32.18–67.82 at 1276 (29.175–70.825
    at 1280). On 2026-11-11 (4.16.1) the first reading at 1280 was 61.834, limits 30.651–69.349. The follow-up showed
    that 61.834 is also reached on `main` (S5, a carried-over pixel height); the limits were not compared.
  - The `main` branch menu has 7 of 8 icons drawn: "Push…" has no icon in the source (the same on Linux).
  - The status bar has no dirty-state icon; its `TriangleAlert` shows only for a repository state other than clean.
  - The Windows release build is not byte-reproducible: two builds of `0df2549c` gave two SHA-256 values,
    `72936517B1D954DB9DD765A5720ADD2CF261F16417E380A214BDB5EB8CF18C5D` (first) and
    `9FE072E638170E2DED6F8130A617EB94747D5C866CEA7A3724BA5BB64000055D` (the rebuild for the closing check; cargo 3 m
    11 s, 3 m 25 s in total, exit 0).
  - vite's "larger than 500 kB" warning shows on `main` too.
  - Harness slips: a2's first pass (the moves sent without the left button, above); row d's first staging attempt
    clicked a row outside the view, nothing staged, redone.
  - The closing rebuild of #46 was `checkout 0df2549c`, `npm ci` 0 vulnerabilities, tauri-cli 2.12.4,
    `react-resizable-panels` 4.21.0.
- Linux:
  - The scratchpad was empty after the VM reboot; openbox was unpacked again with `apt-get download` (the doc's
    recipe).
  - The checkout was at `cb9d989` before; after the first pass it was detached at `0df2549` with #46's
    `node_modules`, and after the comparison with `main` at `387291d`.
  - The other programs' lines in the log: xdg-desktop-portal ×2 and the secret proxy timeout, libEGL "DRI3 error" ×2
    (counted in the stderr row above).

## Triage (the owner, 2026-11-13)

- Linux: with the sidebar's scrollbar showing, the press 2 px left of *Resize sidebar* lands on the scrollbar and does
  not grab; the same on `main`. **Accepted**, as a row in `docs/plans/open-items.md` §Q.
- End on *Resize output* collapses the dock, disables the separator and drops the focus to `<body>`; the same on `main`.
  **Fix it,** in its own plan after #46.
- Taken on the recommendation, without a question:
  - The diff cursor's far case gets a dated note on its open row.
  - The *Resize details* double-click is no finding.
  - The pinned separator's value (50.824 against 50.955), the build comparison's two differences and row a6's limit
    (the plan calls it the row's second, beside its being a regression check only) are recorded here only.

## Helpers

- The Windows VM handed over its frame recorder (`rec.js`, SHA-256
  `e3b767d219e1dd4ce49989594e08ad9f1ab98d29a1064fc88b6e74d13ab62d0d`, 3740 bytes) and its `cdp.mjs` copy (`cdpx.mjs`,
  SHA-256 `dcd6e87088c3c18f026f392b8a6098479855bb9eb576baf9d68be8ab4051adcd`, 22182 bytes) as text. Both hashes matched
  on arrival.
- They are now `docs/smoke/recorder.js` and `docs/smoke/cdp.mjs`, described in `docs/smoke/smoke-cdp.md`.
- The Windows picker driver stays outside the repository.

## Cleanup

- The owner's machine: the walk worktree and its local branch `deps-npm` removed after the merge; the app's store folder
  restored byte-identical after the one local launch.
- Windows VM:
  - The app quit with Ctrl+Q; no process left.
  - Store: `layout.json` (written by the walk) removed; `recents.json` and `.window-state.json` restored, both `cmp`
    identical; 2 files.
  - `C:\tmp\t4bn` deleted.
  - The display back at 100 % (96 DPI, override 0).
  - The installed 0.10.25 untouched.
  - Repo detached at `0df2549c`, `git status` clean. Nothing committed, pushed or ticked.
  - No window, tab or dialog the walk didn't cause.
- Linux VM:
  - The app quit through `invoke('quit')`; tauri-driver, WebKitWebDriver, openbox, Xvfb :99 and the private bus gone;
    `pgrep` shows only the desktop's own portal and at-spi processes.
  - `/tmp/t4bn` deleted.
  - The checkout clean, left detached at `387291d` after the comparison with `main`. Nothing ticked or committed.

## Merge

- `gh pr merge 46 --squash --admin --match-head-commit 0df2549c…`, subject `build(deps): Bump the npm group with 7
  updates (#46)`, empty body, merge commit `a9416b22`.
- `git diff --quiet` between the walked tree and `origin/main` exited 0.
- GitHub removed Dependabot's branch on its own. No other pull request was open.
- CI on `main`: run 43385685662, success on three OS on its first attempt.
