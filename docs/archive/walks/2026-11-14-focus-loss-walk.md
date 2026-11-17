# Focus-loss fix walk and re-walk — branch focus-loss, 2026-11-14 and 2026-11-17

The walk of 2026-11-14 at `3977b5b6` comes first; the triage of 2026-11-14 and the re-walk of 2026-11-17 at
`c28b77e7`, which adds the Changes view's fix, are the last two sections.

Two VM sessions walked the fix on branch `focus-loss` at `3977b5b6` of T4 Git UI: the keyboard focus no longer falls to
`<body>` when the control holding it goes away, in the output dock and across a window width that rebuilds a pane. The
Windows VM ran a local release build (`tauri build --no-bundle`) over CDP. The Linux VM ran a `.smoke` debug build
(WebKitGTK) over WebDriver. The plan is `docs/archive/plans/2026-11-14-focus-loss-plan.md`; the readings before the fix
are in `docs/archive/walks/2026-11-14-focus-loss-measurement.md`. Nothing was ticked or committed on the VMs. Every
reading is measured on the VM unless it says otherwise; the Windows report marks its reasoned sentences "(reasoned)".

How the reports use two words:
- "New": the focused element is a different node from the one kept before the step, and the kept (old) node reads
  disconnected (`isConnected` false). The Windows VM kept the old node in `window.__old` and compared it with `===`.
- "Ring": on Linux, `data-kbd` on the focused element. On Windows, `:focus-visible` (fv) and `data-kbd` (kbd), plus the
  screenshot.

## Result

Both VMs:
- Passed: D1 to D5, L1 to L4, W1 to W5, R1 to R3, K1 to K4, CA rows 1 to 4. Row D6 passed on Windows; on Linux it does
  not apply (below).
- D7 could not be reached on either VM: the app refuses a tab switch while an operation runs (toast "Operation in
  progress — Wait for it to finish before switching tabs"). Cancel keeps the focus.
- X1 behaved as designed: the focus falls to `<body>`, and Tab then lands on the folded commit head.
- M1 to M3 readings (measured, not rows with an expectation):
  - Windows: M1 commit, `<body>`. M2 an outside file change, `<body>`, typed text kept. M3 Escape after a resize,
    `<body>`; without the resize, Escape returns the focus to the opener, with its ring.
  - Linux: M1 commit, `<body>`. M2 an outside file change, `<body>`, the new Summary node kept its text. M3 Escape
    after a resize, `<body>`; Tab then lands on the first tab of the window's tab strip.
- Console and log: Windows console hook `[]`, app log lines 80 to 152 with 0 WARN and 0 ERROR. Linux console hooks 0
  entries, driver log 0 WARN, 0 ERROR, 61 INFO.

Differences between the VMs:
- Row D6: on Windows the log takes Tab focus ("Command output", role log) and Ctrl+` then moves the focus to "Expand
  output" with the ring. On Linux the log takes no focus (`[role=log]` has no tabindex), so that part of the row does
  not apply.
- Row K4: the element Tab lands on in the diff differs. Windows: the option "2 − line 02". Linux: `div[role=option]`
  "1 − deleted from the working tree later" inside the listbox "Diff lines". The Linux report says the focus is on a
  diff line rather than on the region.
- Row CA3, by click: Windows has the ring (fv true, the ring drawn). Linux has no ring.
- Row CA4: Windows reads "no ring (hover only)" after the toggle clicks. Linux reads no ring.
- Row D1: no ring on either VM.
- Row D7: on Linux a pointer click on the `other` tab was refused the same way, and the focus moved to that tab
  element. The Windows report gives Ctrl+Tab and Ctrl+2.
- Row M3: Windows names the dialog's opener "Open diff window" and Tab is not reported; on Linux Tab lands on the first
  tab of the window's tab strip.
- Row M1: on Linux the Changes view closed itself into History (the setting "Close the Changes view after a commit that
  leaves nothing to commit" is on). The Windows report says the view switched to History.

## Setup

### Windows VM
- `git fetch origin`; `3977b5b6` checked out detached. No commit or push in the project repository.
- `npm ci`, then `tauri build --no-bundle` in the foreground, `CARGO_BUILD_JOBS=1`: 6m47s, exe sha256 `5026D633…8BECE`,
  version 0.10.26. `react-resizable-panels` 4.21.0.
- The store backed up to `C:\tmp\t4-store-bak-fl`.
- Fixture: `smoke-fixtures.ps1 -Root C:\tmp\t4fl`. Its `other` clone was the second repository for D7.
- `smoke-launch.ps1` (local build), CDP, 1280×800.
- Real keys and pointer through `cdp.mjs`. Sizes via `setWindowBounds`, `innerWidth` checked each time.
- The old node kept in `window.__old` and compared with `===` and `isConnected`. A capture focusin/focusout log
  installed.

### Linux VM
- `3977b5b6`, detached. `npm ci`, then the `.smoke` debug build, with an isolated HOME.
- Xvfb :99 at 1920×1200 under openbox, tauri-driver on 4446, `wd.mjs`.
- Fixture: `smoke-fixtures.sh` with `T4_ROOT=/tmp/t4fx`. Tabs `work` and `other`, `work` active.
- Input: WebDriver key actions, xdotool pointer and typing. Window size through WebDriver's window rect, checked against
  `innerWidth`.
- Hooks: capture-phase focusin/focusout (each records the label at that moment), keydown and pointer events, a
  MutationObserver stamping when Cancel appears and disappears, and the console error and warn hooks.
- `document.title` read "T4 Git UI - work" in every reading.

## Rows

### The dock

- **D1. Ctrl+` with the focus in the dock's prompt; the toggle should take it.** Pass on both.
  - Windows: prompt clicked, Ctrl+`. focusout (prompt → null), then focusin "Expand output" 1 ms later. Label at
    focusin: "Expand output". Ring: none (kbd false, fv false, screenshot). (reasoned, from `kbdFocus.ts`) A Ctrl
    shortcut leaves the last-input flag as it was, which here was the click.
  - Linux: prompt focused by click, Ctrl+`. The toggle is focused; at focusin its label was "Expand output",
    relatedTarget null. Dock 28 px. No ring.
- **D2. The prompt's typed text, the completion list and the history survive closing and reopening the dock.** Pass
  on both.
  - Windows: "status" typed (list open, "Completions: status"), then Ctrl+` twice: value "status", `aria-expanded`
    false, no listbox.
    - Click mid-text (caret 3): still no list. Typing "t" gives "stattus" and the list opens with "status". Escape
      closes it.
    - ↑ walks the history once "status" and "log -1" had been run: ↑ → "log -1", ↑ → "status", ↓ → "log -1".
    - Typing "x" at caret 3 gave "staxtus" and no list: no completion matches. (reasoned) The match uses the text
      before the caret.
    - With no history, ↑ only moved the caret to 0.
    - The prompt is a new node after the reopen.
  - Linux: typed `status`, then Ctrl+` twice: value "status", `aria-expanded` false, no list. This held both after
    closing the list with Escape first, and with the list open at the close.
    - A click in the text put the caret at 4: still no list.
    - An edit opened the list: Backspace gave "statu", expanded true. Ctrl+A then `f` gave 2 options, "fetch" and
      "fsck".
    - Typing `x` in the middle of "status" left the list closed. Reasoned: "statxus" has no completion.
    - Escape, ran `status`, then ↑ recalled "status". The history held only that entry, so a second ↑ stayed on it.
- **D3. Enter on Cancel while the dock is open (`fetch slow`); the focus should go to the toggle.** Pass on both.
  - Windows: `fetch slow`, Shift+Tab ×3 (log, toggle, Cancel), Enter. Timing from the key: Cancel focusout +6 ms →
    "Collapse output" focusin; Cancel gone from the DOM +17 ms. Ring: yes (kbd and fv, screenshot).
  - Linux: `fetch slow`, Shift+Tab ×2 to Cancel (ring), Enter. focusin on "Collapse output" (ring) 9 ms after the
    keydown; the observer saw Cancel gone 7 ms later. Header: "cancelled · 1.8s".
- **D4. The same with the dock collapsed.** Pass on both.
  - Windows: the dock collapsed by Ctrl+` from the prompt during `fetch slow` → "Expand output", with the ring.
    Shift+Tab → Cancel in the collapsed header. Enter → "Expand output", with the ring. Header "cancelled · 2.1s".
  - Linux: collapsed with Ctrl+` from the prompt during `fetch slow`: focus on "Expand output" (ring). Shift+Tab
    reached Cancel. Enter: "Expand output" (ring), 19 ms after the keydown.
- **D5. Cancel goes away by itself, nothing pressed.** Pass on both.
  - Windows: Cancel focused by key, nothing pressed. At "exit 0 · 60.4s", Cancel's focusout → "Collapse output" 1 ms
    later, with the ring. Cancel was gone 3 ms after the focusout.
  - Linux: Cancel focused by key, nothing pressed. At "exit 0 · 60.0s", focus moved to "Collapse output" (ring).
- **D6. The log in the tab order, then Ctrl+` from it.** Pass on Windows; does not apply on Linux.
  - Windows: the log takes Tab focus ("Command output", role log). Ctrl+` → "Expand output", with the ring.
  - Linux: the log takes no focus. `[role=log]` has no tabindex (tabIndex -1), and Tab from the toggle goes straight to
    the prompt. So that part of the row does not apply.
- **D7. A tab switch while Cancel holds the focus during an operation.** Not reachable on either VM.
  - Windows: second tab opened from the repository menu ("other"). Ctrl+Tab and Ctrl+2 with Cancel focused during
    `fetch slow`: the tab stays on `work`, plus the toast "Operation in progress — Wait for it to finish before
    switching tabs". Cancel stays focused (same node, ring). Enter then cancelled → "Collapse output", with the ring.
  - Linux: with `fetch slow` running and Cancel focused, Ctrl+Tab did not switch tabs. The toast appeared. The title
    stayed "work" and the focus stayed on Cancel. A pointer click on the `other` tab was refused the same way; the
    focus moved to that tab element. The op was then cancelled from the dock (row L3).

### Left alone

- **L1. A mouse click on the toggle with the focus in the prompt.** Pass on both.
  - Windows: prompt focused, mouse click on the toggle → the toggle ("Expand output" after the click), no ring.
  - Linux: prompt, then a click on the toggle. Focus on the toggle, now "Expand output". `data-kbd` false afterwards.
    During focusin, the label still carried an old `data-kbd`.
- **L2. Ctrl+` with the grid focused.** Pass on both.
  - Windows: grid clicked, Ctrl+` ×2 (open, close) → the same grid node, no focus events.
  - Linux: grid focused by click, Ctrl+` twice. Same node both times, and the dock ended as it started.
- **L3. Ctrl+` with Cancel focused by key during `fetch slow`.** Pass on both.
  - Windows: the dock collapsed, Cancel kept the focus (same node, ring).
  - Linux: dock 28 px, the same Cancel node, ring. Enter then cancelled the op, and focus moved to "Expand output".
- **L4. The operation ends with the grid focused.** Pass on both.
  - Windows: grid clicked during `fetch slow`, op ended "exit 0 · 60.2s" → the same grid node, no focus events.
  - Linux: op ended at 60.0 s with the grid focused (by click). Same node, no events.

### The width, restored (focus by key)

On Linux all of W1 to W5 passed: a new node holds the focus, with the ring, in every case.

- **W1. The "Changed files" listbox, reached by Tab, across 1400 and 1300.** Pass on both.
  - Windows: History, "odd files" (3 files). 1400→1300: a new node (old disconnected), focused, with the ring. ↓ moved
    the selection at once (blob.bin → crlf.txt). 1300→1400: a new node, focused, with the ring. ↓ → nonl.txt. The
    hand-back comes 1–2 ms after the old node's focusout.
  - Linux: listbox reached by Tab at 1400. To 1300: new node, ring. One ↓ moved the selection at once, crlf-hunks.txt
    to tables.txt. Back to 1400: new node, ring. ↓ moved it again, to gone.txt.
- **W2. The diff region (and the Unified view button), 1400 → 1300 → 1400.** Pass on both.
  - Windows: Diff region: a new node with the ring at 1300, and again back at 1400. Unified view: the same, both ways.
  - Linux: diff region at 1400 → 1300 → 1400, new node with ring each way. The "Unified view" button the same, both
    ways.
- **W3. The listbox, 1300 → 780 → 1300.** Pass on both.
  - Windows: 1300→780 and 780→1300: a new node with the ring each time; the selection is kept.
  - Linux: new node with ring each way; selection and diff kept.
- **W4. The listbox, 780 → 1400 in one step.** Pass on both.
  - Windows: a new node with the ring; ↑ moved the selection.
  - Linux: new node, ring. ↑ moved the selection.
- **W5. The Changes view at 820, the Summary input with its caret.** Pass on both.
  - Windows: Summary reached by Tab, "walk word test" typed, ← ×5 (selectionStart 9). 820→780: a new node, the same
    value, sel [9,9], with the ring. 780→820: the same.
  - Linux: Summary reached by Tab (ring), typed "fix the focus", ← ×6. selectionStart and selectionEnd were 7. To 780
    and back to 820: new node with ring each way; value and caret 7/7 kept.

### The width, a row's control (focus by pointer)

On Linux all of R1 to R3 passed: the row's list takes the focus as a new node, no ring until a key, and ↓ moves the
selection.

- **R1. A folder row `src` in the Changes view's tree mode, clicked twice; 820 → 780.** Pass on both.
  - Windows: `src` clicked twice (ends expanded; focus on the `src` treeitem button, no ring). 820→780 → the "Unstaged
    files" tree, no ring. ↓ moved the selection at once (crlf-hunks.txt → gone.txt); the ring then shows (fv true,
    screenshot). `data-kbd` stays false: it is set only at focusin (reasoned, from `kbdFocus.ts`).
  - Linux: two clicks on folder row "src" (`button[role=treeitem]`) left it expanded, focus on that row. 820 → 780:
    `div[role=tree]` "Unstaged files" focused, new node, no ring, focusin with relatedTarget null. ↓ moved the
    selection, crlf-hunks.txt to gone.txt. After a key, the ring is drawn on the active row (screenshot), not on the
    list element.
- **R2. A press on a file's Stage button, released outside the list, then a width change.** Pass on both.
  - Windows: mouse pressed on a.txt's Stage button and released over the Diff region. `git status` identical before
    and after: nothing staged. The focus stayed on Stage, no ring. 780→820 → the Unstaged tree, no ring. ↓ moved the
    selection (gone.txt → hunks.txt), with the ring.
  - Linux: press on z.txt's Stage button (`tabindex=-1`) focused it. Released at 600,450, outside the list.
    `git diff --cached` was empty, and the selection was unchanged (crlf-hunks.txt). 820 → 780: tree "Unstaged files"
    focused, new node, no ring. ↓ moved the selection to gone.txt. Still nothing staged. The first try hit the
    `nowhere` error toast (see "Seen on the way").
- **R3. History file list in tree mode, "nested folders" commit, `src` clicked twice; 1400 → 1300.** Pass on both.
  - Windows: → the "Changed files" tree, no ring. ↓ moved the selection (crlf-hunks.txt → gone.txt), with the ring.
  - Linux: `div[role=tree]` "Changed files" focused, new node, no ring. ↓ moved the selection, tables.txt to b.txt.

### The width, kept without the fix (same node)

On Linux all of K1 to K4 passed: the same node keeps the focus (`===` true, `isConnected` true).

- **K1. The separator "Resize commit details" focused by key, 1400 → 1300.** Pass on both.
  - Windows: reached by Shift+Tab. The same node, relabeled "Resize side column", valuenow 30.222 → 29.126, ring kept.
  - Linux: reached by Tab at 1400. At 1300 it is the same node, now labelled "Resize side column", with the ring.
- **K2. The grid, 1400 → 1300.** Pass on both.
  - Windows: grid by Shift+Tab: the same node, with the ring.
  - Linux: grid focused by click: the same node.
- **K3. The History diff region by Tab, 1300 → 780.** Pass on both.
  - Windows: the same node, with the ring.
  - Linux: the same node, ring.
- **K4. The Changes view at 820, Tab into the diff, 820 → 780.** Pass on both.
  - Windows: Tab into the diff lands on its first line (option "2 − line 02"). 820→780: the same node, with the ring.
  - Linux: Tab put the focus on a diff line, `div[role=option]` "1 − deleted from the working tree later" inside the
    listbox "Diff lines", rather than on the region. 820 → 780: the same node, ring.

### Lost by design

- **X1. Copy SHA by Tab at 1300, then 1300 → 780.** Behaved as designed on both.
  - Windows: details folded (`aria-expanded` false) → `<body>`, focusout → null. Tab → "Show commit details: nested
    folders" (the folded head, at the details' place), with the ring.
  - Linux: History view at 1300, Copy SHA reached by Tab (ring), resized to 780. Focus fell to `<body>`. The commit
    details were folded: "Show commit details: nested folders" had `aria-expanded` false. Tab then landed on that
    fold button, with the ring.

### Measured on the way

- **M1. Stage all, Summary typed, Ctrl+Enter.** Readings.
  - Windows: committed, the tree is clean, the view switched to History. Focus `<body>` (Summary focusout → null).
  - Linux: the isolated HOME has no identity, so a placeholder name and email were set in the fixture repository's own
    local config (`/tmp/t4fx/work/.git/config`, deleted with the fixture). Stage all, then Summary (clicked) holding
    "fix the focus", then Ctrl+Enter. Commit 6c4caf5 made and the tree clean. Focus fell to `<body>`. The Changes view
    closed itself into History (the setting "Close the Changes view after a commit that leaves nothing to commit" is
    on), so Summary was unmounted. Tab then landed on the grid "Commits".
- **M2. An outside file change with text typed in Summary.** Readings.
  - Windows: clean tree, Changes view, "typed before" in Summary, then a line appended to `src/a.txt` from a terminal.
    The pane rebuilt from "Working tree clean" to the file lists. Focus `<body>`. The text is kept.
  - Linux: on the clean tree, Alt+2, clicked Summary, typed "typing here", then from a terminal appended a line to
    `hunks.txt`. About 4 s later, focus was on `<body>`. Summary is a new node, and its text "typing here" was kept.
    Tab then landed on the "Stash…" button.
- **M3. The diff window dialog, resized while open, then Escape.** Readings.
  - Windows: at 1300, the diff window opened by a click on "Open diff window" (focus moved into the dialog's file
    tree). Resized to 1400 while open: the focus stayed in the dialog. Escape → `<body>`. Control at 1400, no resize:
    Escape → "Open diff window", with the ring. (reasoned) After the resize, the opener the dialog returns to is the
    replaced node.
  - Linux: at 1300, History view, clicked "Open diff window". The dialog opened with focus on its tree "Changed
    files". Resized to 1400 while it was open: focus unchanged inside the dialog. Escape closed it, and focus fell to
    `<body>`. The page's "Open diff window" button still exists. Tab then landed on the first tab in the window's tab
    strip, "/tmp/t4fx/work": the top of the window, not the spot of the old opener.

### Regression, smoke group CA rows 1 to 4

- **CA1. End on "Resize output", then Enter and Space on the toggle.** Pass on both.
  - Windows: Tab to Resize output, End → 28 px, the same toggle (=== stored), "Expand output", with the ring. Enter →
    200, "Collapse output". Enter → 28. Space → 200. The same node and the ring throughout.
  - Linux: End on "Resize output": 28 px, "Expand output" with the ring. Enter opened to 200 with "Collapse output",
    the same node. Enter closed it to 28. Space opened it to 200. The same node each time, ring.
- **CA2. ↓ on the bar down to the collapse.** Pass on both.
  - Windows: ↓ 200 → 165 → 160 → 28, the focus on the same toggle, with the ring. The height reading is the header top
    to the status bar.
  - Linux: the bar focused by key, then ↓ gave 200 → 165.05 → 160 → 28, with focus on the toggle, the same node, ring.
- **CA3. Ctrl+` with the bar focused, by Tab and by click.** Pass on both.
  - Windows: bar by Tab, Ctrl+` → the toggle, with the ring. Bar by click, Ctrl+` → the toggle; fv true, the ring
    drawn (as recorded for Windows on 2026-11-13, `docs/archive/walks/2026-11-13-dock-end-key-focus-walk.md`).
  - Linux: by Tab, Ctrl+` on the bar gave 28 px and focus on the toggle, with the ring. By click, the click on the bar
    left the focus there with no ring. Ctrl+` gave 28 px and focus on the toggle, with no ring.
- **CA4. Ctrl+` with the grid focused, and mouse clicks on the toggle.** Pass on both.
  - Windows: grid clicked, Ctrl+` ×2 → the grid both times. Mouse clicks on the toggle open and close the dock; focus
    on the same toggle, no ring (hover only).
  - Linux: grid focused by click, Ctrl+` gave 28 px with the grid still focused. A click on the toggle gave 160 with
    focus on "Collapse output" and no ring. A second click gave 28 with "Expand output" and no ring. Redone on a
    visible row after a misaimed click (see "Seen on the way").

## Seen on the way

Windows VM:
- The view switch loses the focus: Alt+2 from History (focus on Changed files) and Alt+1 from Changes (focus in the
  trees) → `<body>`, focusout → null. Not on the plan's list.
- Stage all loses the focus: clicked, it took the focus, was relabeled "Operation in progress" and lost it 11 ms later
  (→ null) while staging ran. Not on the list.
- The ring on a rescued control follows the last non-Ctrl input. Key → ring (D3 to D6, W, K). D1, after a click and then
  Ctrl+`, gets none.
- The "work: Couldn't check nowhere for tags" toasts appeared after each `fetch slow`. Two were dismissed with the mouse
  before the width rows.
- Console hook `[]`. App log lines 80 to 152 (this walk): 0 WARN, 0 ERROR.

Linux VM:
- A loss to `<body>` that is not in the plan: a click on Stage all. The click focused "Stage all". During staging, that
  button read "Operation in progress". It then lost the focus: a focusout with relatedTarget null, and `<body>` as the
  active element.
- The first click on Stage all, made just after clicking into Summary, staged nothing. The second click staged all 6
  files (log line `stage_paths paths=6`). The report did not look into why the first did nothing.
- Alt+1 and Alt+2 still drop the focus to `<body>`, as in the earlier measurement.
- A misaimed click:
  - After M1's commit, the "nested folders" row sat above the grid's visible top (row y 30, grid top 72), and the click
    at y 43 hit the toolbar's Push button. The Push dialog opened.
  - It was closed with Escape, which returned the focus to Push. Nothing was pushed: the reflog is unchanged and
    `bare.git` main is still 5609e3e.
  - CA4 was redone on a visible row.
- `data-kbd` stays on elements after they lose focus. In one reading, seven unfocused elements still carried it. So the
  ring readings above come from the focused element at the moment of reading.
- The `nowhere` remote's error toast stays up and covers controls at narrow widths (the R2 miss). The first R2 press
  landed on the toast at 820 and nothing happened; the toast was dismissed and the press repeated.
- The placeholder identity for M1 was set in the fixture repository's own local config (see M1).
- Console hooks: 0 entries. Driver log: 0 WARN, 0 ERROR, 61 INFO.

## Cleanup

Windows VM:
- The draft Summary was cleared in the app, then Ctrl+Q. No process is left.
- The store before the restore: `recents.json` had the walk's recents, lastOpen, cmdHistory and a remoteTags cache.
  `layout.json` was new (two tabs); removed. `.window-state.json` was not compared before the restore.
- Restored: `recents.json` and `.window-state.json` `cmp` identical; the same file set.
- `C:\tmp\t4fl` is deleted, including M1's fixture commit.
- The installed app: still 0.10.26.
- The checkout is back at `49c49f37`, detached and clean. Nothing committed, pushed or ticked in the project repository.
- The `target\release` exe is now the `3977b5b6` build.
- A local copy of the report: `C:\tmp\t4-walk-focus-loss-report.md`.

Linux VM:
- The quit through `invoke('quit')` did not run: a wrong working directory in the script.
- Stopping tauri-driver took the app down with it. tauri-driver, WebKitWebDriver, openbox and Xvfb :99 are stopped, and
  `pgrep -x` finds none of them and no `t4-git-ui`.
- `/tmp/t4fx` (including its local identity) and the isolated HOME are deleted.
- The checkout is detached at `3977b5b` and clean. Nothing was ticked, committed or pushed.

## Triage

The owner ruled on 2026-11-14, one item at a time:
- **M2, the focus lost while typing in Summary when the tree turns dirty: fix now.** The Changes view uses the same
  hook on its own root (the plan's review record); the rows of the re-walk are below.
- **A control with no twin in the new layout stays lost (X1): accepted,** with the same limit across the Changes
  view's swap, read from the code when it was accepted and measured in part by the re-walk's row N4. In
  `docs/plans/open-items.md` §Q.
- **On macOS, a pointer close of the dock with the focus inside it now puts the focus on the toggle: accepted.**
  Reasoned, macOS not walked. Withdrawn on 2026-11-17: the premise is wrong by the app's own code (the plan's D1),
  and the owner ruled to drop the limit.

Taken under the owner's 2026-10-21 rule and listed to the owner, all into the open row of `open-items.md` §AX: M1
(the commit that closes the view), M3 (the dialog's opener), Stage all losing the focus while it runs, Alt+1 and
Alt+2, and the first Stage all click on Linux that staged nothing. D7 is recorded as not reachable; the code and its
unit test for a Cancel that leaves by a tab switch stay.

## Re-walk — branch focus-loss at c28b77e7, 2026-11-17

Both VMs walked five rows on `c28b77e7`, which adds the Changes view's fix to the build walked above: the Windows VM
on a local release build over CDP, the Linux VM on a `.smoke` debug build over WebDriver. N1, N2 and N5 have an
expectation and passed on both; N3 and N4 are readings. Every reading is measured unless marked. Nothing was ticked
or committed on the VMs.

### Setup

- Windows: no app running; the store backed up to `C:\tmp\t4-store-bak-n`. `git fetch origin`, `c28b77e7` detached.
  `npm ci`, `tauri build --no-bundle` in the foreground, `CARGO_BUILD_JOBS=1`: 4m56s, exe sha256 `B40345D9…87B1`.
  Fixture `smoke-fixtures.ps1 -Root C:\tmp\t4fl`. The clean tree is the fixture's `other` clone, clean as built: no
  fixture commit, no identity set. It was opened alone at 1280×800 (N5 at 820 and 780). The dirty step is one line
  appended to the tracked `a.txt` from a terminal, the clean step `git restore a.txt`. `smoke-launch.ps1`, CDP, real
  keys and pointer through `cdp.mjs`. The title read "T4 Git UI - other" in every reading.
- Linux: `c28b77e7` detached, `npm ci`, the `.smoke` debug build with an isolated HOME. Xvfb :99 at 1920×1200 under
  openbox, tauri-driver on 4446, `wd.mjs`; WebDriver key actions, xdotool pointer and typing. The VM had rebooted, so
  openbox was unpacked again with `apt-get download` (the recipe in `docs/smoke/smoke-linux.md`) and the helper
  scripts recreated. Fixture `smoke-fixtures.sh` with `T4_ROOT=/tmp/t4fx`; `work` was made clean by committing
  everything from a terminal with a throwaway identity in the fixture's own local config (commit 1f60d3a
  "walk: clean tree"). The terminal changes went to `hunks.txt`. The `nowhere` toast did not appear. The title read
  "T4 Git UI - work" in every reading.
- Both: the focused node kept in a page variable before each step, a capture focusin/focusout log, the console hooks.

### Rows

- **N1. Clean to dirty: text typed in Summary on a clean tree, a tracked file changed from a terminal; Summary
  should keep the focus as a new node, with its text and caret.** Pass on both, with Summary reached by Tab and by
  click.
  - Windows, by Tab: "tab words here", ← ×3, selection [11,11]. Tree dirtied: focusout (Summary → null), then focusin
    Summary 2 ms later. A new node (the kept one disconnected), the same value, [11,11]. "X" typed gave "tab words
    hXere", [12,12]. Ring: kbd true, fv true; the screenshot shows the accent outline and the caret after "h".
  - Windows, by click: Ctrl+A, "click words here", ← ×4, [12,12]. Tree dirtied: a new node, the same value, [12,12].
    "Y" gave "click words Yhere", [13,13]. Ring: kbd true (the last input was the arrows), fv true.
  - Linux, by Tab: Summary reached with the ring, "keep the focus", ← ×4, selection 10–10. A line appended to
    `hunks.txt`; about 4 s later the pane showed the file lists. Active: `input` Summary, new, `data-kbd` true, value
    unchanged, selection 10–10, focusin with relatedTarget null. `Z` typed gave "keep the fZocus", caret 11. The
    screenshot shows the blue focus border and the caret after "f".
  - Linux, by click: Summary clicked, End and ← ×3, selection 12–12. Tree dirtied: Summary new, `data-kbd` true,
    value and selection 12–12 kept. `Q` gave "keep the fZoQcus", caret 13. The ring was already on before the
    dirtying. (reasoned) The ← keys pressed after the click turned it on.
- **N2. Dirty to clean: from N1's end state, the change undone from a terminal; Summary should keep the focus as a
  new node.** Pass on both.
  - Windows, twice. `git restore` → "Working tree clean": Summary is a new node (the kept one disconnected), "tab
    words hXere", [12,12], kbd true, fv true. Again with a click as the very last input (mid-text, [7,7]): a new
    node, the same value, [7,7], kbd false, fv true; the screenshot shows the outline.
  - Linux: `git restore hunks.txt` → "Working tree clean": Summary new, `data-kbd` true, value "keep the fZocus" and
    selection 11–11 kept, focusin with relatedTarget null. (reasoned by this record, from the values) This ran
    after N1 by Tab and before N1 by click.
- **N3. Body with a selection on a clean tree, then the tree dirtied.** Readings.
  - Windows: Body clicked, "line one", Enter, "line two", Shift+← ×4, [13,17] ("two"). Tree dirtied: the focus on
    Body, a new node (the kept one disconnected), the same value, selection [13,17] kept and drawn.
  - Linux: Body clicked, "line one", Enter, "line two"; Shift+← ×3 then Shift+↑ selected 5–17. Tree dirtied: active
    is `textarea` Body, new, `data-kbd` true, value kept, selection 5–17 kept. On the way, the unfocused Summary's
    selection moved from 13–13 to 16–16, the end of its text. (reasoned) A new input element starts with the caret
    at the end.
- **N4. A focus on a control the clean tree does not have (the accepted limit), or on one that turns disabled (the
  open row in `open-items.md` §AX).** Readings.
  - Windows: the Unstaged files tree reached by Tab, then `git restore` → `<body>` (focusout → null). The next Tab
    landed on "Resize commit message" (the commit panel's first control), with a ring. Stash… reached by Tab on a
    dirty tree, then `git restore` → `<body>`: the same node stays in the DOM, disabled and relabeled "Nothing to
    stash", and the focusout → null came from that. The next Tab landed on Close.
  - Linux: on a dirty tree, Shift+Tab put the focus on `div[role=listbox]` "Unstaged files" with the ring; the file
    restored; at "Working tree clean" the active element is `<body>`. The next Tab landed on `button` "Close", the
    Changes view's close at the top right, with the ring. Stash… reached by Shift+Tab with the ring, enabled; the
    file restored: that node stayed connected, relabelled "Nothing to stash" and disabled; focusout fired on it with
    relatedTarget null, and the active element is `<body>`. The next Tab landed on "Close" again.
- **N5. The width regression (row W5): Summary on the dirty tree at 820, to 780 and back.** Pass on both.
  - Windows: Summary by Tab, "resize words", ← ×3, [9,9]. 820→780: a new node, the same value, [9,9], with the ring.
    780→820: the same.
  - Linux: Summary reached by Tab with the ring, " more" typed after End, then ← ×2, selection 19–19. 820 → 780:
    Summary new, `data-kbd` true, value "keep the fZoQcus more" and selection 19–19 kept. 780 → 820: new again, the
    same value and selection, ring.

### Seen on the way

- Windows: with the focus on "Resize commit message" (left there by N4's Tab), the tree was dirtied: focusout → null,
  then focusin "Resize commit message" 1 ms later. Whether it is the same node was not checked.
- Windows, a slip: at 820 a click meant for the pane header's empty text (330,56) hit Stash… in that narrower layout
  and opened "Stash changes". It was closed with Escape; `git stash list` was empty and `a.txt` was still modified, so
  nothing was stashed. The focus came back to Stash….
- Console and log: Windows console hook `[]`, the app log of 2026-11-17 (26 lines, all of this walk) with 0 WARN and
  0 ERROR. Linux console hooks 0 entries, the driver log from `t4_git_ui` 0 WARN, 0 ERROR.

### Cleanup

- Windows: Summary and Body cleared in the app, then Ctrl+Q; no process left. The store: `recents.json` had the
  walk's entries (restored), `layout.json` was new (removed), `.window-state.json` was already `cmp`-identical before
  the restore; both files `cmp` identical after it, the same file set. `C:\tmp\t4fl` deleted. The installed 0.10.26
  untouched. The checkout back at `49c49f37`, detached and clean. `target\release` holds the `c28b77e7` build. A
  local copy of the report: `C:\tmp\t4-walk-focus-loss-n-report.md`.
- Linux: the app quit through `invoke('quit')`; WebDriver replied "Session terminated", as usual. tauri-driver,
  WebKitWebDriver, openbox and Xvfb :99 are stopped; `pgrep -x` finds none of them and no `t4-git-ui`. `/tmp/t4fx`
  (including its local identity) and the isolated HOME are deleted. The checkout is detached at `c28b77e` and clean.
- Nothing was ticked, committed, pushed or tagged in the project repository on either VM.
