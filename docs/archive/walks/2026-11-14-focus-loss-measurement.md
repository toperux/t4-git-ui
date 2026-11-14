# Focus-loss measurement — 0.10.26, 2026-11-14

Two VM sessions measured, read-only, where the keyboard focus goes in T4 Git UI when the control that holds it
disappears. The Windows VM ran the installed 0.10.26 over CDP. The Linux VM ran a `.smoke` debug build of `49c49f37`
(WebKitGTK) over WebDriver. This is the factual base of `docs/plans/2026-11-14-focus-loss-plan.md`; it follows the open
row in `docs/plans/open-items.md` §AX. It ticks nothing, commits nothing and fixes nothing. Every reading is measured
on the VM unless it says otherwise.

## Result

Common to both VMs:
- Every loss ends on `<body>`, except C3 and C5, which kept the focus.
- On `<body>`, arrows, letters and Enter do nothing visible (the screenshots are identical before and after). The
  Windows report names Space too. Ctrl+` still works.
- Tab and Shift+Tab continue from the lost control's place: the next control after that spot in DOM order, the
  previous one for Shift+Tab. Neither goes to the top of the window (Linux report); the Windows report says Tab resumes
  from the lost control's place in every row, with one exception (below).
- C3 is no loss: the same separator element keeps the focus and is relabelled "Resize side column".
- C5 holds: the grid keeps the focus, with no `focusout`.

Differences between the VMs:
- Windows: `focusout` fires with `relatedTarget` null when the focused element is removed, and `hasFocus` stays true.
- Linux: no `focusout` fires when the focused element is removed. The Linux VM adds that a `focusout` handler can't
  detect any of these losses.
- After row A1, the first Tab leaves the page on Windows (the dock prompt is the last control; the 2nd Tab wraps to
  "Toggle sidebar"). On Linux the first Tab lands on the dock header's toggle "Expand output".
- Windows saw a 4th kind of loss, a toast's "Dismiss" (see "Seen on the way"). Linux saw two more losses it did not
  drive as rows.

## Setup

### Windows VM
- The installed 0.10.26, driven over CDP. The checkout is detached at `49c49f37`.
- Fixture `C:\tmp\t4ax`, relaunched on it after a first launch on an older fixture (see "Seen on the way").
- The full report is at `C:\tmp\t4-walk-ax-focus-report.md` on the VM; this record follows its short form.

### Linux VM
- `49c49f37`, detached. `npm ci`, then the `.smoke` debug build (cargo 3m16s), with an isolated HOME.
- Xvfb :99 at 1920×1200 under openbox 3.6.1, tauri-driver on port 4446, `wd.mjs`.
- Fixture: `smoke-fixtures.sh` with `T4_ROOT=/tmp/t4fx`, opening `work`. Window 1280×800 for rows A, B and D.
- Input: keys through WebDriver key actions, as in the walk of 2026-11-13, and pointer clicks through `xdotool`.
  `xdotool type` for text. Window size through WebDriver's window rect.
- Hook: capture-phase `focusin`/`focusout` on `window`, `keydown`, and a MutationObserver stamping when Cancel
  disappears. Plus the console error and warn hooks. `document.title` was "T4 Git UI - work" at each reading.

## Rows

Row ids as the reports name them. Each line reads before → after → where Tab lands.

- **A1. Ctrl+` with the focus in the dock's prompt.**
  - Windows: prompt → `<body>` → Tab: nothing, then "Toggle sidebar". Shift+Tab → "Expand output".
  - Linux: the prompt `input[role=combobox]` "Run git command" → after Ctrl+` closed the dock, `<body>`, no `focusout`
    → Tab: the dock header's toggle "Expand output", with the keyboard ring (`data-kbd`). Shift+Tab: the details pane's
    diff region `div[role=region]` "Diff", the last control before the dock.
- **A2. The same, with `status` typed in the prompt and no Enter.**
  - Windows: the typed "status" is lost when the dock reopens; reopening leaves the focus on `<body>`.
  - Linux: before, the prompt holding `status`. After close, `<body>`. Ctrl+` again reopened the dock, the focus still
    on `<body>`. The prompt's value was `""`, so the typed text was lost.
- **A3. A mouse click on the dock header's toggle with the focus in the prompt.**
  - Windows: the focus is on the toggle, "Expand output".
  - Linux: the real click collapsed the dock. After: the toggle, now "Expand output", with `focusout` from the prompt
    and `focusin` on the toggle. No ring, since it was a pointer click. Tab wrapped to the toolbar's first control,
    "Toggle sidebar", because the toggle is the last focusable control in the window.
- **B1. Cancel going away, dock open (`fetch slow`).**
  - Windows: Cancel → `<body>` (`focusout` at 8 ms, gone at 21 ms) → Tab: "Collapse output". Shift+Tab: "Resize
    output".
  - Linux: `button` "Cancel" with the ring. Enter; Cancel was removed 14 ms after the `keydown`, and the header read
    "$ git fetch slow cancelled · 7.8s". After: `<body>`, no `focusout`. Tab: "Collapse output". Repeated with
    Shift+Tab: removal 15 ms after the key, and Shift+Tab landed on the separator "Resize output". In the open dock,
    from the prompt, Shift+Tab goes to "Collapse output", then to Cancel, so Cancel comes before the toggle.
- **B2. Cancel going away, dock collapsed (the collapsed header).**
  - Windows: Cancel → `<body>` (7 / 11 ms) → Tab: "Expand output".
  - Linux: Ctrl+` from the prompt collapsed the dock and the focus fell to `<body>`, as in A1. Tab from there went
    straight to Cancel in the collapsed header. Before: Cancel with the ring. Enter; removal 15 ms after the key, and
    the header read "cancelled · 18.0s". After: `<body>`, no `focusout`. Tab: "Expand output". The Shift+Tab
    variant was not run.
- **B3. Cancel going away by itself, nothing pressed.**
  - Windows: the fetch ends by itself at 60.1 s → `<body>` → Tab: "Collapse output". With output present, Cancel takes
    Shift+Tab ×3, because the log is focusable.
  - Linux: Cancel with the ring, focused by keyboard. The op ended at 60.0 s with "exit 0" and Cancel was removed at
    that moment. After: `<body>`, no `focusout`. Tab: "Collapse output".
- **C1. Details pane across width tiers: the file list focused, 1400 → 1300.**
  - Windows: the file listbox, 1400 → 1300 → `<body>` → Tab: "Open diff window". Shift+Tab: the side-column bar.
    `crlf.txt` stays selected and shown. 1300 → 1400 also loses; Tab: the "Changes" tab.
  - Linux (History view, commit "nested folders", 5 files): at 1400 `gone.txt` clicked; the focus is the
    `div[role=listbox]` "Changed files" (the row is `aria-selected`). Resized to 1300 (`innerWidth` 1300): `<body>`, no
    `focusout`. `gone.txt` stayed selected and its diff stayed shown. Tab: the diff header's "Open diff window", the top
    of the 2-column diff column. Clicked `gone.txt` again at 1300, then back to 1400: `<body>` again, selection and
    diff kept. Tab: "Copy SHA" in the commit column header, the first details control in 3 columns.
- **C2. The same resize with the diff focused.**
  - Windows: the diff body, or "Open diff window" → `<body>` → Tab: "Expand output" (skips the rest of the diff).
  - Linux: at 1400 a click into the diff body put the focus on `div[role=region]` "Diff". Resized to 1300: `<body>`.
    Tab: "Open diff window". Selection and diff kept. Second run: Shift+Tab from the diff to the diff header's
    "Unified view", with the ring. Resized to 1300: `<body>`. Tab: "Open diff window".
- **C3. The same resize with the separator "Resize commit details" focused.**
  - Windows: no loss. The same element keeps the focus (`aria-valuenow` 30.222 → 29.126). Tab: "Open diff window".
  - Linux: no loss, in both directions. At 1400, Shift+Tab reached `div[role=separator]` "Resize commit details" with
    the ring (vertical, `aria-valuenow` 30.222). Resized to 1300: the same DOM node (`===` true, `isConnected` true),
    now labelled "Resize side column", the ring kept, no focus events. Tab: "Open diff window". The 2-column layout has
    its own "Resize commit details", a horizontal 300×5 bar, which was not focused. 1300 → 1400 went the same way: the
    same node, relabelled "Resize commit details". Tab: the Changes tab in the file list.
- **C4. The file list focused, 1300 → 780.**
  - Windows: the listbox, 1300 → 780 → `<body>` → Tab: "Show commit details: odd files". The selection is kept. The
    window reaches 600, so there's no limit.
  - Linux: the window reached `innerWidth` 780, so there was no limit. Before: the "Changed files" listbox, with
    `gone.txt` selected. After: `<body>`. Selection and diff kept. Tab: "Show commit details: nested folders", the
    narrow tier's folded commit bar at the top of the details pane.
- **C5. Control: the commit grid focused, the same resize.**
  - Windows: the grid → the same element, no `focusout` → Tab: "1 more ref".
  - Linux: at 1400 a click on a commit row focused `div[role=grid]` "Commits". Resized to 1300: still the grid, no
    events. Tab: the separator "Resize details".
- **C6. The Changes view, the Summary input focused, 820 → 780.**
  - Windows: Summary, Changes view, 820 → 780 → `<body>`. The input is a new element, and "walkword" is kept. Tab:
    "Expand output" (skips the commit panel). Shift+Tab: a diff line.
  - Linux: at 820, Alt+2, then a click into the Summary `input` and `hello` typed. Resized to 780: `<body>`. Summary
    still read "hello". Tab: the diff header's "Unified view", next after the commit form's column in the narrow
    layout.
- **D. Keys after a loss to `<body>`.**
  - Windows: no separate row in the report; its Result gives arrows, letters and Space doing nothing visible
    (byte-identical screenshots), and Ctrl+` still working.
  - Linux: after an A1-style loss. ArrowDown, ArrowUp, `j`, `a` and Enter: the WebDriver screenshot was pixel-identical
    after each key. The selected commit stayed the same and the focus stayed on `<body>`. Ctrl+` opened the dock, the
    focus still on `<body>`.

## Seen on the way

- Windows: a new, 4th loss. A toast's "Dismiss" reached by Tab is lost when the toast leaves by itself.
- Linux, two more losses to `<body>`, seen in the readings and not driven as rows:
  - Alt+2 from the History view, with the focus on the separator "Resize details": the focus ended on `<body>`.
  - 780 → 1400 with the focus on "Show commit details" (left by C4's Tab): the focus ended on `<body>`. A later
    `focusin` came with `relatedTarget` null.
- Both: the fixture's `nowhere` remote raises an error toast.
  - Windows: "Couldn't check nowhere for tags" error toasts appeared after the fetches. They aren't in the log.
  - Linux: "work: Couldn't check nowhere for tags", raised by the app by itself on launch. It stayed on screen and took
    no focus.
- Windows: the first launch opened the older `c:\tmp\t4\work` through a seed slip: opened only, then relaunched on
  `t4ax`.
- Linux: a screenshot saved into the checkout by mistake was deleted.
- Console and log. Windows: console hook `[]`; log lines 33–79: 0 WARN, 0 ERROR. Linux: console hooks 0 entries;
  driver log 0 WARN and 0 ERROR from `t4_git_ui`.

## Cleanup

- Windows VM:
  - Before the restore, the store held `recents.json` (`lastOpened` plus a `remoteTags` cache) and a new `layout.json`;
    `.window-state.json` was unchanged.
  - The store restored, `cmp` identical.
  - `C:\tmp\t4ax` deleted. 0.10.26 left installed.
  - The checkout is detached at `49c49f37`, clean. Nothing committed.
- Linux VM:
  - Quit through `invoke('quit')`, then tauri-driver, WebKitWebDriver, openbox and Xvfb :99 stopped. `pgrep -x` finds
    none of them and no `t4-git-ui`.
  - `/tmp/t4fx` and the isolated HOME deleted. The screenshot saved into the checkout by mistake deleted.
  - The checkout is detached at `49c49f3` and clean, with that commit's `node_modules`. Nothing was ticked, committed
    or pushed.
