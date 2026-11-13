# The output dock's resize bar and the keyboard focus — walks, 2026-11-13

The walks of `docs/archive/plans/2026-11-13-dock-end-key-focus-plan.md`. Closing the output dock from its resize bar
(*Resize output*) used to drop the keyboard focus to `<body>`; now the dock header's toggle button takes it, and keeps
it when it opens or closes the dock. Two walks were made the same day on a Windows VM and a Linux VM. The first walk, 12
rows, took the fix at `fa39e7974419f07d3fdd647d509dd3fc04614363` against a build of `main` at
`20dbeef26dc9c6c16fd9b64e9af14ad9b30853e1`. The re-walk, 8 rows, took `42359765e61b0b774f672c6c01d7ed030d6fe0d8` after
the triage. The keyboard cases pass on both platforms. The drag's row failed on both, and on `main` alike: the library
blurs the bar when a drag ends, so the drag ends with the focus on `<body>` whatever the fix does; the owner ruled it
left alone. The toggle's focus ring, measured in the first walk as clipped in the collapsed header, was fixed and
re-walked whole: all 8 rows of the re-walk passed on both VMs.

## Builds

### Windows VM
- First walk:
  - `fa39e797` was fetched as `origin/dock-end-key-focus` (the hash matches) and `origin/main` was
    `20dbeef26dc9c6c16fd9b64e9af14ad9b30853e1`.
  - Both builds: `npm ci` 0 vulnerabilities; tauri-cli 2.12.4; `react-resizable-panels` 4.21.0; `tauri build
    --no-bundle` in the foreground with `CARGO_BUILD_JOBS=1`, exit 0. Both exes 23,199,744 bytes, version 0.10.25.
  - `main`: cargo 4 m 35 s, 5 m 05 s in total; sha256
    `17644EE80850CAEC36C4FD1FA123F890BE1EFAD20C0BE7BBB860C7CC2726E9DB`.
  - Fix: cargo 3 m 50 s, 4 m 08 s in total; sha256
    `D4A8872DAC5400E0F5578B4EF8EEB274770886D45809BD3AFB5B2BE19BDE574C`.
  - The exe copies were kept aside and each was launched with `smoke-launch.ps1 -Exe`.
- Re-walk:
  - `origin/dock-end-key-focus` = `42359765e61b0b774f672c6c01d7ed030d6fe0d8` (matches). The diff from `fa39e797` is
    `OutputDock.module.css` (+7), `RepoWindow.tsx` and `RepoWindow.test.tsx`.
  - `npm ci` 0 vulnerabilities; tauri-cli 2.12.4; `react-resizable-panels` 4.21.0; `tauri build --no-bundle`,
    `CARGO_BUILD_JOBS=1`: exit 0, cargo 4 m 06 s, 4 m 25 s in total.
  - Exe 23,199,744 bytes, version 0.10.25, sha256 `66449ACD6531662FFEB93DEA648D9CAD1094C35A731B49B087B930C059FBB0C0`.

### Linux VM
- First walk:
  - `origin/dock-end-key-focus` = FETCH_HEAD = HEAD = `fa39e7974419f07d3fdd647d509dd3fc04614363`; `origin/main` = HEAD =
    `20dbeef26dc9c6c16fd9b64e9af14ad9b30853e1`.
  - Both builds: `npm ci` 0 vulnerabilities; `react-resizable-panels` 4.21.0; build exit 0; no "Illegal instruction".
    tauri-cli 2.12.4 is stated for the fix build. The binary of the fix build was copied aside before `main`'s build.
  - The report gives no build times for this walk.
- Re-walk: `origin/dock-end-key-focus` = FETCH_HEAD = HEAD = `42359765e61b0b774f672c6c01d7ed030d6fe0d8`; `npm ci` 0
  vulnerabilities; the `.smoke` debug build with `CARGO_BUILD_JOBS=1`, exit 0, no "Illegal instruction".
- Harness: Xvfb 1600×1000, openbox, a private bus, a fresh scratch HOME for each build, viewport 1280×800. The console
  was hooked before the first step. "Same" below means `=== window.__t`, the toggle kept in a page variable at row 1.

## Fixtures

- Windows VM: `C:\tmp\t4dk`, `work` open alone, `layout.json` absent at every launch. CDP at 1280×800. Every reading
  carried `document.title`, "T4 Git UI - work". The re-walk's `fetch slow` row used the fixture's `slow` remote, a
  local path whose upload-pack sleeps 60 s. The store was backed up to `C:\tmp\t4-store-bak-dock` first.
- Linux VM: `/tmp/t4dk`, `work` open alone. The title read "T4 Git UI - work" on every reading. The `slow` remote
  sleeps 60 s as well.

## The first walk, 12 rows

Each row names what it checks. Windows first, then Linux. The ring of the toggle on the fix build, where a row speaks
of it, is `rgb(28,31,38) 0 0 0 2px, rgb(58,110,224) 0 0 0 4px` on Windows (dark theme) and
`rgb(205,206,208) 0 0 0 2px, rgb(36,89,190) 0 0 0 4px` on Linux (light theme); `outline` is none on both. The first
walk's reports name no theme: it is told here by the accent colour, as the re-walk read it for each theme.

- **1. End, then Enter, Enter, Space — pass on both.** The dock opened with Ctrl+` (200 px). The bar was reached by a
  click on the Diff region (`[aria-label=Diff]`, the element before the bar in tab order), then Tab.
  - Windows: End → 28, the focus on the button "Expand output" (`data-dock-toggle`, `data-kbd`, ring), the same
    element as the saved toggle. Enter → 200, "Collapse output", the same element. Enter → 28, the same. Space → 200,
    the same. The ring each time. A screenshot shows the ring on the collapsed toggle.
  - Linux: End → 28, the focus on "Expand output" (`data-dock-toggle`, `data-kbd`, same = true, ring). Enter → 200,
    "Collapse output", same, ring. Enter → 28, "Expand output", same, ring. Space → 200, "Collapse output", same,
    ring.
- **2. ↓ at the smallest height — pass on both.** The dock does collapse on ↓ at 160 px, as the plan read in the
  library.
  - Windows: ↓ took the dock 200 → 163.453125 → 160 (`aria-valuenow` 72.64 → 77.64 → 78.112). One more ↓ →
    `aria-valuenow` 96.17, dock 28, the focus on "Expand output" (toggle, `data-kbd`, ring). Further ↓ does nothing.
  - Linux: Shift+Tab from the toggle put the focus on the bar, with `data-kbd`. ↓ 200 → 163.45, ↓ → 160. One more ↓:
    28, the focus on the toggle "Expand output", `data-kbd`, ring, same = true.
- **3. A drag onto the header — fail on both, and on `main` alike.** The dock closes, but the focus is on `<body>`.
  - Windows: a real drag, a press on the bar, moves, a release over the header's span at y 758.5. The Enter that
    follows can't be reached (Enter on `<body>` does nothing). The page-side event log: the bar's `focusout`
    (`relatedTarget` null) fires 1 ms after `pointerup`; the store's close comes 17 ms later (`aria-disabled`,
    `tabindex` removed, the label → "Expand output"); `document.activeElement` is already `<body>`, so the fix's note
    that the bar held the focus reads false.
  - Linux: a WebDriver pointer drag of the bar onto the header, released at y=770, closed the dock (28), and the focus
    was on `<body>` with no `data-kbd`. Enter then did nothing: still 28, still `<body>`. Repeated: the same. The
    timeline (focusin/focusout and pointer listeners, MutationObservers on the bar and the toggle): t=0 `pointerdown`
    on the bar and `focusin` on the bar; t=+48 `pointerup` on the bar, then `focusout` from the bar to `<body>` in
    the same millisecond (`relatedTarget` null); t≈+95 the toggle changes to "Expand output" and the bar to
    `tabindex` null, `aria-disabled` true, the focus already on `<body>`. So the store's close runs after the blur.
  - The cause, found by the Windows VM and read again on the owner's machine: `react-resizable-panels` 4.21.0,
    `dist/react-resizable-panels.js:440-441`. When an active drag that moved ends, the library blurs the separator
    if it holds the focus (`n.element.blur()`). The Linux VM's own search for `.blur(` had found nothing, and its
    report called the cause not known; the call is there, and the same library runs on both.
  - A drag that leaves the dock open ends the same way, on both. Windows: −40 px, dock 160 → 200, the focus on
    `<body>` after the release. Linux: a drag of 20 px that leaves the dock open also ends with `focusout` to `<body>`
    at `pointerup`, for a WebDriver drag and for a real XTEST drag (xdotool mousedown, moves, mouseup).
  - A press with no move (a click on the bar) focuses the bar and the focus stays there, on both.
  - `main` does the same. Windows: the identical sequence, `pointerup` → `focusout`, 13 ms later `disabled` and
    `tabindex` gone, ending on `<body>`. Linux: the same moving drag on `main` also leaves the focus on `<body>`.
  - Windows' reading of how to cover it, not tested: take the note at `pointerdown` or `pointerup` rather than at the
    store's change. Not done: the owner ruled to leave the drag alone (Triage).
- **4. Ctrl+` pressed on the bar — pass on both, both ways.**
  - (a) The bar reached by Tab. Windows: Ctrl+` → 28, the focus on the toggle, the same element, `data-kbd` true, ring
    shown. Linux: 28, the toggle "Expand output", same, `data-kbd`, ring.
  - (b) The bar focused by a mouse click. Windows: the bar had the focus, no `data-kbd`, no ring. Ctrl+` → 28, the
    focus on the toggle, the same element, `data-kbd` false, ring shown: it comes from `:focus-visible` (it matches
    true), because the last input was the keyboard. A screenshot shows the ring. Linux: a real xdotool click (press
    and release, no move) left the focus on the bar, no `data-kbd`. Ctrl+` → 28, the toggle, same, no `data-kbd`,
    `box-shadow` none, so no ring.
- **5. Ctrl+` with the focus elsewhere — pass on both.** A click on a commit row focuses the grid, not the row.
  - Windows: a click on the "odd files" row focused the grid (`DIV` `role=grid` "Commits"); that element was saved.
    Ctrl+` → 28, the focus still on the same grid element, no ring.
  - Linux: a WebDriver click on the "conflict branch side" row; the active element is the grid itself
    (`DIV[role=grid]` "Commits"). Ctrl+` → 28, the focus on that same element (`===`).
- **6. A click on the toggle — pass on Windows; readings on Linux.** The focus started in the grid.
  - Windows: a toggle click → 160 (its last height); the focus on "Collapse output", the same element, no `data-kbd`,
    no ring. A second click → 28, "Expand output", the same element, no ring.
  - Linux: a real xdotool click 1 → 180 (the last height); the focus moved to the toggle "Collapse output", same, no
    `data-kbd`, no ring. Click 2 → 28, "Expand output", same, no ring. WebKitGTK focuses the button on a click.
- **7. The boxes — pass on both: identical on the two builds, to the digit.** Unrounded `getBoundingClientRect()`
  as x, y, width, height. The collapsed header is 28 high and as wide as the window (1280).
  - Windows:
    - Collapsed: panel 0,748,1280,28; header 0,748,1280,28; toggle 1248,750.5,24,24. Header border-top 1 px,
      border-bottom 0 px.
    - Open at 200: panel 0,576,1280,200; header 0,576,1280,28; toggle 1248,578,24,24; log 0,604,1280,135; prompt
      59,745,1204,26. Borders 1 px and 1 px.
    - The DOM differs as intended: on the fix, the header sits inside the new `.panel` div (overflow hidden) in both
      states; on `main`, the collapsed header is the library panel's only child.
  - Linux:
    - Collapsed: Panel 0,748,1280,28; header 0,748,1280,28; toggle 1248,750.5,24,24; border-top 1 px, border-bottom
      0 px.
    - Open at 200: Panel 0,576,1280,200; header 0,576,1280,28; toggle 1248,578,24,24; log 0,604,1280,135; prompt
      58,745,1205,26; border-top 1 px, border-bottom 1 px.
- **8. The focus ring in the collapsed header — the same on both builds: the ring is cut at the top and at the
  bottom.** The toggle was focused by key: on the fix, Tab and End onto the toggle (Windows: a Diff click, then Tab,
  which reaches the toggle directly because the bar is disabled while collapsed); on `main`, the Diff region and Tab
  to the toggle. Both had `data-kbd` and the ring.
  - Windows:
    - The toggle's box is y 750.5–774.5 inside the header's 748–776. The 4 px ring spans 746.5–778.5.
    - The clipping: on the fix, the dock's `.panel` (overflow hidden) and the library panel (overflow auto), both
      748–776; on `main`, the library panel (overflow auto), 748–776.
    - Pixel column at x=1260, identical on both: y 748 blue (it covers the header's top border); y 749–750 the dark
      inner ring; y 775 the dark inner ring; y 776 the next element's line; no blue anywhere at the bottom.
    - So the top is cut by 1.5 px (1 of the 2 blue pixels shows) and the bottom by 2.5 px (no blue, and half a pixel
      of the inner ring gone). That matches the plan reviewer's estimate. In the zoomed crops the sides and top show;
      the bottom edge is open.
  - Linux:
    - The 120×60 crops of the header's right end are identical pixel for pixel (`compare -metric AE` = 0), and so is
      the pixel column at x=1260.
    - The ring is cut at both ends. The clipping ancestor is `DIV._panel_` (`OutputDock`, overflow hidden, y
      748–776).
    - Top: the outer blue ring keeps 1 of its 2 px (row 748, over the border line); rows 746–747 are clipped. Bottom:
      the inner grey ring shows at row 775; the outer blue is cut entirely (row 776 is the status bar's border).
- **9. Nothing else moved — pass on both.**
  - Windows: bar arrows ↑ 236.546875, ↑ 273.109375, ↓ 236.546875; Home → 320; double-click → 200 (the bar was
    focused by the double-click, because the Diff pane was gone with "odd files" selected). Drag −100 → 300; Ctrl+` →
    28; Ctrl+` → 300. The window squeezed to 700×500 → dock 231; grown back to 1280×800 → 300. `status` and Enter in
    the prompt: the log shows "$ git status" … exit 0, 17 lines; the header shows "$ git status" and "exit 0 ·
    0.0s"; the focus stayed in "Run git command". The toggle clicked twice (close, reopen): the log's `innerText`
    identical, 17 lines.
  - Linux: the bar by Shift+Tab: ↑ 200 → 236.55, ↑ → 273.11, ↓ → 236.55, Home → 320; `main` gives the identical
    sequence. A real double-click on the bar → 200, the focus stays on the bar with `data-kbd`. The prompt: a click,
    "status" typed with real keys, Return: 18 lines in the log ("$ git status", "On branch main", …), and the prompt
    keeps the focus. The toggle clicked twice: the log text identical, 18 lines.
- **10. Ctrl+` from the dock's prompt — today's behaviour, not fixed here.** A click in the prompt (`INPUT` "Run git
  command"), then Ctrl+`: 28, the focus on `<body>`. `main` gives `<body>` too. The same on Linux, fix build and
  `main`.
- **11. `main`, today's behaviour — not fixed on `main`, which is the point of the pair.** End on the bar (reached by
  Tab) → 28, the focus on `<body>`; on Linux with no ring. Enter on "Collapse output" (reached by Tab twice from the
  Diff region, a Diff click and two Tabs on Windows) → 28, the focus on `<body>`. Both on both VMs.
- **12. Console and log — pass on both.**
  - Windows: the console hook read `[]` at the end of every session (fix twice, `main` twice). App log 2026-11-13,
    lines 230–273, all of this walk's launches: 0 WARN, 0 ERROR.
  - Linux: the console hook `[]` on both builds. stderr from `t4_git_ui`: fix 13 INFO, 0 WARN, 0 ERROR; `main` 9 INFO,
    0 WARN, 0 ERROR.

## The re-walk, 8 rows, `42359765`

The commit gave the header's controls an inset ring, `inset 0 0 0 1px var(--accent)`. Both VMs passed all 8 rows.
Zoomed crops were taken at 8× with nearest-neighbour scaling on Windows. The pixel column runs through the toggle's
centre, x=1260, and the pixel row through its middle.

The themes. Windows: theme A is dark (`data-theme=dark`, `--accent` #3a6ee0, read as `rgb(58,110,224)`), theme B light
(`data-theme=light`, `--accent` #2459be, `rgb(36,89,190)`). It started dark and switched to light for row 7, with the
toolbar's "Switch to light theme" button by mouse; that writes only the scratch store's `recents.json`, restored after.
Linux: rows 1 to 6 in light (the starting theme, `--accent` read as `rgb(36,89,190)`); row 7 switched with the
toolbar's "Switch to dark theme" button (`data-theme=dark`, body `rgb(22,24,29)`).

- **1. The toggle's ring, collapsed, by key — pass on both.**
  - Windows (dark): the Diff click, Tab. The focus on "Expand output": `data-kbd`, `:focus-visible` true; box-shadow
    `rgb(58,110,224) 0 0 0 1px inset`; outline none. Button box 1248,750.5,24,24. Pixel column at x=1260: accent at y
    751 and 774 only; 748 and 776 keep the grey border and line (43,47,56); 749–750 and 775 are the plain background.
    Pixel row at y=762: accent at x 1248 and 1271 only; 1247 and 1272 are background. All four sides inside the
    button, nothing drawn outside it. The shot shows a whole square ring with softened corners.
  - Linux (light): the Diff region, then Tab onto the toggle "Expand output": `data-kbd`, box-shadow
    `rgb(36,89,190) 0 0 0 1px inset`, outline none. Toggle box 1248,750.5,24,24. Column x=1260: accent (36,89,190) at
    y=751 and y=774; background (188,190,194) at 749–750 and at 775; 748 and 776 are the header's top border and the
    status bar's border. Row y=762: accent at x=1248 and x=1271; background at 1244–1247 and 1272–1276. A 1 px line
    on all four sides, inside the button, nothing cut, nothing outside.
- **2. The same with the dock open — pass on both.**
  - Windows (dark): Enter opened the dock, the focus kept on "Collapse output", the same element; the same shadow. Box
    1248,578,24,24. Column: accent at 578 and 601; 576 and 603 are the header borders, untouched. Row at y=590:
    accent at 1248 and 1271.
  - Linux (light): open at 200 (Enter on the toggle; the same element, `data-kbd`). Box 1248,578,24,24. Accent at y=578
    and y=601 (x=1260), and at x=1248 and x=1271 (y=590). Nothing outside.
- **3. The ring under the pointer's hover — pass on both.**
  - Windows (dark): the toggle key-focused and collapsed, the mouse moved over it: `:hover` true; background
    `rgba(255,255,255,0.05)`, which renders 33,35,40 against 22,24,29. The accent line unchanged at 751 and 774 and at
    1248 and 1271.
  - Linux (light, open): a real xdotool pointer over the toggle with the key focus on it: `:hover` true, background
    `rgba(17,24,39,0.05)`, so the inner pixels go 188 → (179,181,186). The accent stays at (1260,578), (1260,601),
    (1248,590) and (1271,590).
- **4. No ring after a mouse click — pass on both.**
  - Windows: mouse clicks on the toggle (open, then close): the focus on the toggle, the same element; `data-kbd`
    false; box-shadow none; 0 accent pixels in the crop. The theme is not stated for this row; the walk was in dark
    until row 7.
  - Linux (light): starting from the grid's focus (a WebDriver click on a commit row), real clicks on the toggle:
    click 1 closes (28), click 2 opens (200). Both times the focus is on the toggle (same element), no `data-kbd`,
    box-shadow none, no accent pixel at the four ring points. A caveat on how it is reached: clicking the toggle
    while it already holds a key focus keeps `data-kbd` and the ring, because the focus does not change (seen once,
    before the clean run).
- **5. The Cancel button's ring while an operation runs — pass on both.** The operation was held by typing `fetch slow`
  in the prompt.
  - Windows (dark): the header read "$ git fetch slow | 2.5s | Cancel". Shift+Tab ×2 from the prompt went prompt →
    toggle (inset ring) → Cancel. Cancel: `data-kbd`, `:focus-visible` true; box-shadow
    `rgb(58,110,224) 0 0 0 1px inset`; border `1px solid rgb(97,106,124)`; radius 5px; box
    1184.15625,578,57.84375,24. Pixels: the grey border at y 578 and 601 and x 1184 and 1241; the accent just inside
    it, at y 579 and 600 and x 1185 and 1240. The shot shows a grey outer edge with a blue line inside it, like a
    double border with rounded corners; all inside the button, none cut.
  - Linux (light, open): from the prompt, Shift+Tab ×2 went toggle → Cancel (it overshot to the bar and the Diff
    region, then Tab ×2 back to Cancel). Cancel: `BUTTON` "Cancel", `data-kbd`, box 1183,578,59,24, box-shadow
    `rgb(36,89,190) 0 0 0 1px inset`, border 1px `rgb(90,100,116)`, outline none. Column x=1212: the border
    (90,100,116) at 578, the accent at 579, the face (205,206,208) from 580; at the bottom, the accent at 600 and the
    border at 601. Row y=590: the border at 1183, the accent at 1184. A grey border with a blue line just inside it,
    rounded corners, nothing outside.
- **6. Row 1 of the first walk once more on the new commit — pass on both.**
  - Windows (dark): the Diff click, Tab → *Resize output* (`data-kbd`; the bar's own ring is still the 4 px outer one,
    as it sits outside the dock). End → 28, the focus on "Expand output", the same element (`===`), `data-kbd`,
    inset ring. Enter → 200, "Collapse output", the same element. Enter → 28, "Expand output", the same element.
  - Linux (light): the Diff region, then Tab to the bar (`data-kbd`). End: dock 28, the focus on the toggle "Expand
    output", same (`===`), `data-kbd`, inset ring. Enter: 200, "Collapse output", same, ring. Enter: 28, "Expand
    output", same, ring.
- **7. Both themes — pass on both.**
  - Windows (light): collapsed: shadow `rgb(36,89,190) 0 0 0 1px inset`; accent at column 751 and 774 and row 1248 and
    1271; 748 and 776 keep their grey lines (157,161,166). Open: accent at 578 and 601 and 1248 and 1271. Hover:
    background `rgba(17,24,39,0.05)`, which renders 179,181,186 against 188,190,194; the ring unchanged. The hover
    fill is faint in light, but the ring reads clearly over it.
  - Linux (dark): collapsed, key focus by the Diff region and Tab: box-shadow `rgb(58,110,224) 0 0 0 1px inset`,
    `data-kbd`; accent (58,110,224) at y=751 and 774, and at x=1248 and 1271; background (22,24,29) on either side;
    748 and 776 are borders (43,47,56). Open at 200 (Enter, the same element): accent at y=578 and 601, and at x=1248
    and 1271. Whole, inside, nothing outside.
- **8. Console and log — pass on both.**
  - Windows: the console hook `[]` at quit. App log lines 274–289, this walk's one launch: 0 WARN, 0 ERROR.
  - Linux: the console hook (installed before row 1) `[]`. stderr from `t4_git_ui`: 14 INFO, 0 WARN, 0 ERROR.

## Seen on the way

- After Enter on Cancel the operation ends, the button unmounts and the focus falls to `<body>`. Windows: the header
  read "cancelled · 15.7s", the log has "cancel requested op_id=op-1 found=true", and no git process was left. Linux:
  "cancelled · 19.7s". The Linux VM did not check `main`; the Windows report does not say whether it did.
- The bar keeps a stale `data-kbd` after it loses the focus (seen on Windows). Harmless: the CSS also needs `:focus`.
- On Windows, after a click on the bar and Ctrl+`, the toggle shows a ring through `:focus-visible` although it has no
  `data-kbd`, because the last input was the keyboard. On Linux the same sequence shows no ring.
- A commit row does not take the focus itself; the grid does (both VMs).
- The repository's `docs/smoke/cdp.mjs` behaved as the Windows VM's own copy for the steps used: `--key`, `--click`,
  `--dblclick`, `--drag`, `--dragpath`, `--inner`, `--shot`, `--tag`, `--eval`. The copy differs from it by exactly
  the stated fixes (`--fling` cleans up its listeners and throws before touch emulation goes on; `afterEnd` and
  `msAfterEnd` read null with no `touchend`; `--edgegrab`'s hover read has the `e&&` guard). `recorder.js` was not
  needed, as the walk scrolls no list. The Linux reports say nothing about the helpers.

## Triage (the owner, 2026-11-13)

- The drag that shuts the dock: **left alone** (decision A). The plan had expected the toggle to take the focus; that
  expectation was the plan's miss.
- The toggle's focus ring, clipped in the collapsed header: **fix now** (decision F); re-walked whole, above.
- Taken on the recommendation, without a question:
  - Ctrl+` from the dock's prompt and Enter on Cancel each lose the focus to `<body>`: into one open row in
    `docs/plans/open-items.md` (§AX). Both are older than this fix: the prompt's loss measured on `main`, Cancel's by
    the code only.
  - That any drag of a resize bar ends with the focus on `<body>` (the library's own doing: read there for every bar,
    measured on the dock's bar only), and the Windows and Linux difference in the ring after a click and Ctrl+`, are
    recorded here only.
  - Left as they are: Cancel's ring as a second line inside the button's own grey border, and the bar's stale
    `data-kbd` mark.

## Cleanup

- Windows VM:
  - First walk: the store backed up to `C:\tmp\t4-store-bak-dock` and restored; `recents.json` and
    `.window-state.json` compare identical with `cmp`; `layout.json` removed. `C:\tmp\t4dk` deleted. No app process
    left. The repository detached at `fa39e797`, `git status` clean. Nothing ticked, nothing committed.
  - Re-walk: the store restored from `C:\tmp\t4-store-bak-dock` (`recents.json` with the theme back to its saved value,
    and `.window-state.json`, compared identical with `cmp`; `layout.json` removed); `C:\tmp\t4dk` deleted; no app or
    git process left; the repository detached at `42359765`, `git status` clean; nothing ticked, nothing committed.
- Linux VM:
  - First walk: both apps quit through `invoke('quit')`; tauri-driver, WebKitWebDriver, openbox and Xvfb stopped;
    `pgrep` empty. `/tmp/t4dk` deleted. The checkout clean, detached at `20dbeef`. Nothing ticked or committed. The
    screenshots stay on the VM.
  - Re-walk: quit through `invoke('quit')`; `pgrep` empty; `/tmp/t4dk` deleted; the checkout clean, detached at
    `4235976`; nothing ticked or committed.
