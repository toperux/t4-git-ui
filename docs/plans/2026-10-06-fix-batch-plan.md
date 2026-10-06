# Plan: a fix batch after the close-out phases — focus, selection and small fixes, 2026-10-06

_Written 2026-10-06. Status: scope (A + B + C — A = focus, rows 1–4; B = selection and state, rows 5–8; C = small fixes,
rows 9–14) and decisions D1–D11 taken by the owner 2026-10-06 (every recommendation); plan review pass 1: 6 should-fix
and 15 nits fixed; decisions D12–D19 taken; plan review pass 2: 4 should-fix and 11 nits fixed; decisions D20–D23 taken;
plan review pass 3: 3 should-fix and 8 nits fixed; plan review pass 4: 3 should-fix and 8 nits fixed; decisions D24–D25
taken; plan review pass 5: 2 should-fix and 6 nits fixed; decisions D26–D29 taken; plan review pass 6: 1 should-fix and
6 nits fixed; decision D30 taken; plan review pass 7: 1 should-fix and 3 nits fixed (WebKitGTK focuses a clicked button,
measured); decision D31 taken; plan review pass 8: 6 should-fix and 6 nits fixed; decision D32 taken; the G3 pre-check
result folded in; plan review pass 9: 3 should-fix and 4 nits fixed; decision D33 taken; plan review pass 10: 2
should-fix and 2 nits fixed; plan review pass 11: 3 should-fix and 3 nits fixed; plan review pass 12: 3 nits fixed; plan
review pass 13: clean. Execution waits on the owner's go._

**Goal:** fix the open-items rows that are plain fixes waiting on no trigger, walk them as smoke group **BP**, and
release (v0.10.21 when the owner names it). Its gate also owes two checks from the v0.10.20 triage: a Windows
two-window update step (§Q, *N6's Windows update-path persist*) and the Linux half under openbox (§Q, G3).

Row texts are in `docs/plans/open-items.md` (§V, §X, §Y, §Z, §AA, §AD). Line numbers are as of `236b4a9`, from a
research pass (three read-only agents, 2026-10-06); the review passes re-check them. **Verified** means read in the
code; **inferred** means reasoned (React scheduling, WebKit behaviour, git's behaviour) and not run.

Branch: `fix-batch` off local `main` (`236b4a9`). One commit per row while working (squashed at the end, step 7 of
`CLAUDE.md`).

## Summary

| # | Row | Fix | Decision |
|---|---|---|---|
| 1 | §Z T22: a hover close of a focused submenu drops the focus to `<body>` | refocus the parent row before the hover close | D1 |
| 2 | §AD: after a dialog submits, the focus lands on `<body>` | `Dialog` refocuses a disabled opener once it is enabled again | D2, D20, D21, D29 |
| 3 | §AA #14: macOS WebKit, Enter after Escape on a click-opened menu does nothing | record the clicked trigger (`Menu` wrap), use it as the opener in `useRestoreFocus`, plus `ToolbarButton` | D3, D17, D19, D20, D22, D24, D26, D31, D32 |
| 4 | §Z T15: a row's native tooltip covers its context menu | `ContextMenu` strips the anchor's `title` while open | D4, D14, D33 |
| 5 | §V D-1: a drill-down in the Stashes browser snaps back to the stash | leave the browser and land in History on the commit | D5 |
| 6 | §V D-2: a closed Stashes browser leaves History's pane on the stash | restore the pane's pre-open preview on dismiss | D6, D15, D16, D18, D23, D25, D27, D28, D30 |
| 7 | §V D-3: fast tab switching loses the grid selection | a failed row lookup is no verdict | D7, D29 |
| 8 | §V D-4: `diffStore` outlives a closed repository; shared tree keys | clear `diffStore` when the repository closes | D8 |
| 9 | §V E1: the merge banner says "resolve conflicts" with nothing to resolve | a no-conflict wording for merge only | D9, D12 |
| 10 | §V E3: *Lock…* offered on the main worktree | disable it, as *Remove* already is | — |
| 11 | §X C-2: each tab open calls `open_repo` twice | pass the summary through | — |
| 12 | §V F1: Alt+2 in the History search box does nothing | Alt+digit switches views from text fields too (Windows/Linux) | D10, D13 |
| 13 | §V F2: an empty session's `lastOpen` fallback | keep the rule, fix the comments | D11 |
| 14 | §Y: `smoke-fixtures.ps1` drops quotes under PowerShell 5.1 | pre-escape the inner quotes; run on 5.1 and 7 | — |

## Rows

### 1. A hover close of a focused submenu drops the focus to `<body>` (§Z, T22)

- **What the user sees:** with the focus in a submenu (after a click or a key on its row), resting the pointer on
  another row of the parent menu closes the submenu, and the keys go dead until a click or Escape.
- **Code (verified):** `src/components/ui/Menu/Menu.tsx:244-247`, `ctx.hover` sets a 150 ms timer that calls
  `setOpenSub(id)` (`id` is `null` from a plain row, `:414`). The owning item's `open` turns false (`:338`), its panel
  unmounts (`:444-464`), and nothing moves the focus first. Only Escape and ArrowLeft hand it back (`closePanel`,
  `:356-360`). The real submenus are `Toolbar.tsx:244` (More recent) and `:439` (More › Branch); both go through
  `ctx.hover`.
- **Fix:** in the timer, before `setOpenSub(id)`: if the focus is inside an open panel (`[role="menu"]
  [aria-labelledby]`, portalled into `wrap`, `:51`, `:463`, `aria-labelledby` = the parent row's id, `:400`, `:450`)
  and `id !== openSub`, focus that parent row with `focusItem(row, lastInputWasKey())`. Focusing before the state
  change keeps the parent row's `onFocus` (`:417-419`) a no-op (it sees `open === true`). A cleanup in `MenuItem`
  would run after the panel's DOM is gone and could close a panel the hover had just opened, so not there.
- **D1 — the restored row's mark:** (a) **marked if the last input was a key** (`lastInputWasKey()`, matching
  Escape's marked return; a click then a hover gives no ring); (b) never marked. **Taken: (a).**
- **Test (`Menu.test.tsx`, "MenuItem submenu", beside `:343-365`):** fake timers and `SubHarness`; click *More
  recent* (focus on *Sixth*), `mouseOver(First)`, advance 150 ms → the panel is gone and `document.activeElement` is
  the *More recent* row (today `<body>`); ArrowDown → *First*. The test at `:352-357` keeps passing (it refocuses by
  hand).
- **Walk (BP 1):** setup first — *More* exists only in the `icons` toolbar tier (`Toolbar.tsx:415-461`), so narrow
  the window to that tier first; or use *More recent* instead, which needs at least 6 other recents
  (`INLINE_RECENTS` = 5, defined at `Toolbar.tsx:59`, used at `:243`). Windows (CDP) and the Mac: open *More › Branch*
  with a click, move the pointer to a plain row of *More*, then ArrowDown moves within *More*.

### 2. After a dialog submits, the focus lands on `<body>` (§AD)

- **What the user sees:** after *Fetch options* → Fetch, the keyboard focus is nowhere; Tab starts over from the
  top.
- **Code (verified):** *Fetch options* opens the dialog with no `returnFocusTo` (`Toolbar.tsx:279-286`), so `Dialog`
  records the focused element as its opener (`Dialog.tsx:69-70`). `FetchDialog.submit` calls `onClose()` then
  `runOp` (`OpsDialogs.tsx:289-293`); `runOp` sets `busy` before its first `await` (`opsStore.ts:231`), so one React
  commit unmounts the dialog and disables the button (`Toolbar.tsx:282`, `selectRunning` `opsStore.ts:75`).
  `Dialog`'s cleanup (`Dialog.tsx:77-85`) then focuses a disabled button: a no-op. `DisabledHint` keeps the same
  node (`Toolbar.test.tsx:151-157`).
- **Most openers disabled while its dialog's op runs (verified):** Fetch options (`OpsDialogs.tsx:290`), Pull
  (`Toolbar.tsx:292`, `OpsDialogs.tsx:233`), Push (`:302`, `:160`), the Branch menu's `branchBtn` (`Toolbar.tsx:320`,
  `:330`, `:143-146`) for Create branch (`RefDialogs.tsx:60-62`), Checkout, Merge (`OpsDialogs.tsx:356`), Rebase
  (`:641`); the Stash menu's `stashBtn` (`Toolbar.tsx:345`, `:355-376`) for Stash (`StashDialogs.tsx:131`, `:173`).
  Not affected: `repoBtn`, `moreBtn` (never disabled), row openers of context menus. Two openers end on `<body>`
  anyway, so the observer never has anything to focus (listed here, not under *Not covered*): the Changes bar's
  *Stash…* (`disabled={running || total === 0}`, `ChangesView.tsx:40`: with the defaults, `total` is 0 after a
  stash, so it stays disabled — unticking untracked, ticking Keep the index, or an unstashable submodule can leave
  `total > 0`, `ChangesView.tsx:23`, `:40`, `StashDialogs.tsx:27-31`, so it re-enables and the observer refocuses it,
  fine either way) and the sidebar's *Add remote* (`Sidebar.tsx:428`, `RemoteDialogs.tsx:29`, only in the no-remotes
  empty state, `Sidebar.tsx:424-430`: it unmounts once a remote exists).
- **Fix (one place, `Dialog.tsx:81-84`):** if the resolved opener is `:disabled`, watch its `disabled` attribute
  with a `MutationObserver` and focus it once enabled, only if the focus is still adrift (`document.activeElement`
  is `<body>` or null), so a click elsewhere in the meantime wins. `runOp` always clears `busy` (`opsStore.ts:270`).
  The observer must not live forever: disconnect it on the first enable, on any user `pointerdown`/`keydown`
  (capture, on `document`), or with an `isConnected` check in the callback (an attribute observer never sees a
  detach by itself; a resize into the `icons` tier unmounts Branch/Stash, `Toolbar.tsx:309`, `:333`, and the
  observer then waits for the next input, harmless).
- **D2 — where the focus sits while the op runs:** (a) **`<body>`, then the opener when the op ends**; (b) at once on
  the next enabled control or the grid; (c) keep toolbar buttons focusable while busy (`aria-disabled` plus a click
  guard). **Taken: (a).**
- **Tests:** `Dialog.test.tsx` (the pattern at `:33-48`): focus an opener, render, disable it, unmount → `<body>`;
  enable it → `waitFor` the opener (jsdom's `MutationObserver` is asynchronous). Optional, `Toolbar.test.tsx`
  (`Host`, `:121-133`): close the dialog and set `busy` in one `act`, then clear `busy` → the focus is on *Fetch
  options*.
- **Not covered (noted):** the split's main *Fetch* button (`Toolbar.tsx:270-278`) disables itself while focused and
  drops the focus the same way (`Dialog.tsx:104-107` names the pattern, "Check now, Stage all"); it has no dialog.
  See *Not in this batch*.
- **WebKit (macOS only):** on macOS a clicked button isn't focused, so the opener recorded is `<body>` and even
  Cancel returns there (Phase 5 D7). On Linux, WebKitGTK *does* focus a clicked button (measured, C1,
  `docs/archive/walks/2026-10-06-linux-track-c-d-walk.md:16-18`), so there the opener is the real button and only
  the observer's refocus after a mouse submit (below) is new. Row 3's `ToolbarButton` change fixes the macOS half.
- **Walk (BP 2):** Windows: Tab to *Fetch options*, Enter, then Tab to the *Fetch* button (or the Prune checkbox),
  Enter — the Remote `Select` autofocuses and its own Enter would open its list instead of submitting
  (`OpsDialogs.tsx:54`; `Input.tsx:243-247`; §Q `open-items.md:518-526`, measured on the Windows VM) → the fetch
  runs, and when it ends the focus is on *Fetch options* (marked, since Enter submitted); the same for Pull and
  Push. The Mac: click *Fetch options*, submit → back on it at the end. Linux (openbox): click *Fetch options*,
  submit with the mouse, wait for the fetch to end → the focus is on it (ring? — D20, D29).

### 3. macOS WebKit: Enter after Escape on a click-opened menu does nothing (§AA, #14)

- **What the user sees (macOS):** click a menu button, press Escape, then Enter → nothing; Enter should reopen
  the menu. On Linux, WebKitGTK focuses a clicked button like Chromium does (measured, C1, below), so the bug
  doesn't occur on Linux; the fix only matters on macOS; D17 holds automatically on Linux.
- **Code (verified):** `useRestoreFocus` records `document.activeElement` when the menu opens (`Menu.tsx:141-150`).
  On macOS WebKit the click has dropped the focus to `<body>` (`Menu.tsx:351-352`; Phase 5 D10 and D7,
  `open-items-done.md:1477-1485`, measured on the Mac only), so Escape (`:174-178`) restores `<body>`; on Linux
  WebKitGTK the click focuses the button (measured, C1), so Escape restores it there too, as it would on
  Chromium. Menu triggers: `Toolbar.tsx:202` (repo), `:316` (Branch), `:340` (Stash), `:434` (More),
  `MessageColumn.tsx:132` (Message history). `SearchPopover` already focuses its button by ref
  (`SearchPopover.tsx:35`).
- **Fix (two places):**
  - `Menu`'s wrap (`Menu.tsx:252`): an `onClickCapture`, on every click (D26 drops the earlier `!open` guard), that
    records the clicked `button` (not one inside `[role="menu"]`, which excludes menu items and the portalled
    panels) as the opener, and whether it already had the focus (`wasFocused`, the D17 flag below) — no script
    focus here (D24). Chromium: `wasFocused` true, the click already focused the button. macOS WebKit (and jsdom):
    `wasFocused` false, the click left `document.activeElement` on `<body>` (Phase 5 D10 and D7).
  - `useRestoreFocus` (`Menu.tsx:141-150`): when `open` turns true, if `document.activeElement` is `<body>` (macOS
    WebKit / jsdom: the click didn't focus the button), take the recorded trigger as the opener instead of `<body>`.
    No script focus of the trigger is needed: the first item takes the focus at once, as it does today once a menu
    is open.
  - `ToolbarButton` (`ToolbarButton.tsx:15-27`): focus itself in its own bubble-phase `onClick` (not on
    `pointerdown`/`mousedown`, nor in a capture handler, so the `Menu` wrap's capture record still sees it unfocused
    on macOS WebKit), with `focus({ preventScroll: true })`, so row 2's dialog openers (Fetch options, Pull, Push)
    are recorded on macOS too (Linux WebKitGTK already focuses them on click, C1), **except when it has
    `aria-haspopup`** — every `ToolbarButton` menu trigger carries `aria-haspopup` (`Toolbar.tsx:209`, `:322`,
    `:347`), and the `Menu` wrap already owns the focus of a menu trigger (repo, Branch, Stash, `Toolbar.tsx:202`,
    `:316`, `:340`); with D24, the wrap's capture no longer script-focuses anything, but `ToolbarButton`'s own
    self-focus still would, on the click that closes an open menu or ends a repo-button drag, script-focusing the
    trigger on macOS WebKit, where the click left it unfocused: the focus would then stay on the trigger instead of
    `<body>` (against D17's macOS outcome and D26). On Linux WebKitGTK the click or press has already focused it (C1),
    so the self-focus is a no-op there. The split's main *Fetch* button (`Toolbar.tsx:270-278`) has no `aria-haspopup`,
    so it self-focuses too, beside *Fetch options*, Pull and Push; harmless, since it disables itself at once.
    `ToolbarButton` is used only in `Toolbar.tsx`. Not app-wide in `IconButton`/`Button`: `DiffViewer.tsx:348` prevents
    `mousedown` so its buttons don't take the focus, and a click handler can't see that. The Settings gear is an
    `IconButton` (`Toolbar.tsx:422`; Refresh and the palette `:412`, `:417` too), not a `ToolbarButton`, and never
    disabled: it stays out of this row's list (see *Not in this batch*).
- **D3 — scope:** (a) **the `Menu` wrap and `ToolbarButton`**; (b) the `Menu` wrap only (row 2 stays unfixed on
  macOS WebKit). **Taken: (a)**, with the ring behaviour below.
- **D17 — restoring the focus on close:** keep today's mouse behaviour on every OS. On a **pointer** close
  (clicking a menu item or outside), restore the focus to the trigger only if the capture flag says it was already
  focused before the click (Chromium and Linux WebKitGTK: as today, back on the button, since the click did focus
  it, measured, C1; macOS WebKit: as today, `<body>`, so no ring); on a
  **keyboard** close (Escape, Tab), always restore (the #14 fix this row is for). ~5 lines plus the flag in `Menu`.
  Reasoned only; walked on all three OSes. **Taken.**
  - **Mechanism (D24, pass 4):** the close reason is read with `lastInputWasKey()` (`src/lib/kbdFocus.ts:23-26`,
    `:35`), in `useRestoreFocus`'s cleanup; it's set in the capture phase on `pointerdown`/`keydown`, so it's
    current at close. `useRestoreFocus` (`Menu.tsx:141-150`) is shared with `ContextMenu` (`:282`): it gains an
    optional ref parameter — one ref holding `{ trigger, wasFocused }`, read at open (for the trigger) and at close
    (for the flag) — that `Menu` passes and `ContextMenu` doesn't (today's behaviour kept there). Consequences:
    Enter or Space on an item is a keyboard close, so it restores (correct: a keyboard user on WebKit lands back on
    the trigger) — "clicking a menu item" above means a pointer click; a close by a mouse-wheel scroll inherits
    whatever the last input was.
  - **D24 (pass 4) — record, don't focus:** pass 4 found the wrap's capture would still script-focus `repoBtn` on a
    drag's final click: the menu is closed then, so the old `!open`-gated capture focus would have run, but
    `dragged()` is read only in the button's own bubble `onClick` (`useTabDrag.tsx:265-269`, `moved` set at `:102`,
    `Toolbar.tsx:215-218`), after the capture phase — so the capture couldn't tell a drag's final click apart from a
    plain one, and would focus `repoBtn` by script on a drag's end, a script focus against D17's macOS outcome
    (on Linux WebKitGTK the click has already focused the trigger, C1, so it's a no-op there; see D31). **Taken:**
    the wrap's `onClickCapture` no longer focuses anything; it only records the clicked trigger and `wasFocused`
    (above). `useRestoreFocus` takes the recorded trigger as the opener when `document.activeElement` is `<body>`
    at open — the first item then takes the focus at once, so no script focus of the trigger is needed, and a
    drag's final click or the click that closes the menu can't script-focus it either. The D17 outcomes are
    unchanged: pointer close restores only if `wasFocused` (Chromium and Linux WebKitGTK as today, macOS WebKit
    `<body>`), keyboard close always restores.
  - **D26 (pass 5) — drop the `!open` guard:** the wrap's `onClickCapture` records `{ trigger, wasFocused }` on every
    click, not only when `!open`. The trigger is always the same element (the wrap holds only the anchor); the guard
    only changed `wasFocused` on the closing click, which matters in one case — macOS WebKit, a menu opened by keyboard,
    closed by clicking its trigger: with the guard it restored to the trigger (a script focus against D17's macOS
    outcome — on Linux WebKitGTK the click has already focused the trigger, C1, so it's a no-op there; see D31);
    without it the focus stays on `<body>`, matching D17 literally. Chromium unchanged (its mousedown focuses the
    trigger, so `wasFocused` is true).
  - **Re-entrant click:** the wrap's `onClickCapture` also runs on the click that closes the menu (the trigger
    clicked again); the record is overwritten (D26), though the trigger it names doesn't change — only
    `wasFocused` can. `ToolbarButton`'s own bubble-phase self-focus still runs on that same click — the
    `aria-haspopup` skip above (every `ToolbarButton` menu trigger carries it) covers it, and the drag case too
    (the same skip, since every `ToolbarButton` menu trigger has `aria-haspopup`). Walk: click the trigger, click it
    again → no ring on Linux.
  - **D31 (pass 7) — the D26 case is macOS-only:** the D26 walk step is dropped (BP 3, below): on Linux WebKitGTK
    the closing click focuses the trigger itself (measured, C1), so the case the D26 unit test above covers can't
    be walked there. The unit test stands in for the macOS case (jsdom behaves like macOS WebKit).
- **D20 (pass 2) — the WebKitGTK ring risk, measured or walked:** the new script focuses (`ToolbarButton`'s
  click-time focus, macOS only; the `Dialog` observer's refocus after a mouse submit, every WebKit) may draw a
  ring on WebKitGTK after mouse use (T28, `open-items-done.md:1525`, plus `theme/base.css:50`); the Branch/Stash
  menus' dialogs likely already do today (they return focus by ref; reasoned, not walked). On Linux, `ToolbarButton`'s
  own click-time self-focus is a no-op (the click already focused the button, measured, C1), so it draws no new ring
  there; only `Dialog`'s observer refocus after a mouse submit is a new script focus on Linux (after Cancel the opener
  is still enabled, the existing cleanup `Dialog.tsx:81-84` refocuses it as today) (see row 2's walk and D29).
  **Accepted: the BP 3 Linux walk records whether a ring shows** (the "ring?" notes on BP 3's Cancel step, and on Linux
  chiefly the submit step, D29). Not suppressed.
- **Risk (inferred):** WebKitGTK can make a script focus `:focus-visible` after a click (done T28,
  `open-items-done.md:1525`), so restoring the focus to the trigger on every close would likely have shown a ring
  on Linux after a pure mouse action; D17 avoids that on macOS (no restore when the click didn't focus the
  trigger); on Linux the click already focused it (C1), so a pointer close restores as today — a pre-existing
  script focus that may show a ring (T28).
- **Test (`Menu.test.tsx`, "Menu"):** jsdom, like macOS WebKit, doesn't focus a clicked button, so
  `document.activeElement` is `<body>` at open: `pointerDown` + `click` the trigger → the menu opens with the
  opener recorded as the trigger (D24); Escape on the first item → `document.activeElement` is the trigger, with
  `data-kbd`. Today `<body>`. The tests at `:63-85` keep passing. In short: a click that closes the menu leaves the
  focus where it is (not restored) (jsdom / macOS WebKit, where the click didn't focus the trigger; on Chromium and
  Linux a pointer close restores to the trigger, D17); Escape after a click-open restores to the trigger. Another (a D17
  pointer-close regression test): `pointerDown` + `click` the trigger (opens, recorded), `blur()` the item,
  `pointerDown` + `click` the trigger again (closes) → the trigger is not focused (jsdom behaves like macOS WebKit here;
  fire `pointerDown` before every `click` — `keyInput`, `kbdFocus.ts:17`, `:23-26`, is module-level and leaks between
  tests, so without it a click close would count as a keyboard close). A D26 case: focus the trigger, `keyDown` Enter +
  `click` the trigger (opens), `blur()` the item, `pointerDown` + `click` the trigger again (closes) → the trigger is
  not focused (the focus stays on `<body>`). A new `Toolbar.test.tsx` test: a click focuses *Fetch options* or Pull, a
  non-menu `ToolbarButton`. A second new test, testing the closing click (the opening click can't show that a menu
  trigger's self-focus is skipped): `pointerDown` + `click` Branch (opens), `blur()` the item, `pointerDown` + `click`
  Branch again (closes) → Branch is not focused (fails without the `aria-haspopup` skip).
- **Walk (BP 3):** D17 can't be tested on the Branch menu — every Branch item opens a dialog (`Toolbar.tsx:154-169`,
  `pickDialog`), which takes the focus. Walk the pointer close with an outside click, More › Refresh or the theme
  switch (`Toolbar.tsx:446-451`), or a Message history item (`MessageColumn.tsx:144-147`); not Stash › Apply/Pop
  latest (they disable the trigger). The Mac and Linux (openbox, real XTEST clicks): click Branch, Escape, Enter →
  the menu reopens (on Linux, a regression look only: WebKitGTK focuses a clicked button, measured, C1, so this
  row's fix shows on the Mac); click the chosen pointer-close trigger → no ring on the Mac (D17, D20); on Linux, a
  regression look: the focus is back on the trigger as on v0.10.20; note whether a ring shows (pre-existing if
  v0.10.20 shows it too); click the trigger, click it again → no ring on Linux (the re-entrant
  click); click *Fetch options*, Cancel → the focus is on it (ring? — D20; on Linux a regression look, same
  reason); click *Fetch options*, submit with the mouse, wait for the fetch to end → the focus is on it (ring? —
  D20, D29; on Linux the observer's refocus is new, so this step isn't a regression look there). Windows: focus
  back on the trigger as today (a regression look only).

### 4. A row's native tooltip covers its context menu (§Z, T15)

- **What the user sees:** right-clicking a commit row (Mac) or a file row (Linux) can put the row's `title` tooltip
  over the menu's top items (Mac: the first; Linux: *Open*, the second, over its icon and first letters); on Linux a
  quick click onto *Open* there then only highlighted it (G3, reproduced on v0.10.20 — see D14).
- **Code:** inferred cause — the tooltip of the element under the click is pending or shown when `ContextMenu` opens
  at the same point (`Menu.tsx:308-315`). Rows with a `title` and a context menu (verified): `GridRow` (`:81`, `:89`,
  `:92`; menu `RevisionGrid.tsx:327`), `ChangedFileList.tsx:391` (`rowAttrs`, used by the file rows `:398`, `:413`;
  folder rows `:313` have no menu, `:170`), `FilesColumn.tsx:468`, `:553`, ten sidebar rows
  (`Sidebar.tsx:286`–`:579`, menu `:876`), `TabStrip.tsx:74`, `StashesDialog.tsx:174`, blame `FileContent.tsx:270`,
  `RefChips.tsx:49`, `:53`. `GridRow` is memoized (`:31`), so a shared "menu open" flag would re-render every row.
- **Fix (once, in `ContextMenu`):** it already resolves the element under the click (`anchor`, `Menu.tsx:276-281`).
  While open, remove the `title` of that element's nearest `[title]` ancestor-or-self and put it back on close,
  unless React set a new one meanwhile (`hasAttribute` guard, for a recycled virtual row).
- **D4 — ship with its effect unverified:** (a) **ship, walk it on the Mac and Linux, revert if the tooltip still
  shows**; (b) a probe walk first. **Taken: (a).** The stronger fix (app-drawn tooltips) is large and not planned.
- **Test (`Menu.test.tsx`, "ContextMenu", the `elementFromPoint` stub at `:489-505`):** a `div` with a `title`
  around the stubbed target; open → no `title`; close → `title` back.
- **Walk (BP 4):** the Mac: hover a commit row until its tooltip shows, right-click → no tooltip over the menu.
  Linux, this recipe (the layout and clicks measured in the pre-check, which ran the installed AppImage under
  `dbus-run-session`; the smoke-build launch below is not run yet):
  - Fixture: `git init -b main`; `file-001.txt` … `file-600.txt` at the root (`for i in $(seq -w 1 600); do echo
    "line $i" > "file-$i.txt"; done`), one commit. The direct-launch setup (`smoke-linux.md` *Several windows: a
    direct launch*), with Xvfb at 1920×1200 instead of its 1600×1000 (`smoke-linux.md:213`) under openbox. `seed`
    `layout.json` with the repo as the only tab, and seed the main window maximized:
    `$S/home/.config/dev.topher.t4gitui.smoke/.window-state.json` (`mkdir -p` the folder first) =
    `{"main":{"width":1280,"height":800,"x":0,"y":0,"prev_x":0,"prev_y":0,"maximized":true,"visible":true,"decorated":true,"fullscreen":false}}`
    (the window-state plugin reads the config dir, not the data dir, and silently ignores the file if any field is
    missing; verified in the plugin source, window-state 2.5.0 `lib.rs:91-105`, `:423`, `:541`; not run — openbox then
    maximizes it to 1920×1179 at y 21, as in the pre-check). Launch by hand instead of `dlaunch`, which has no session
    bus of its own, so *Open* would reach the VM's live desktop (`smoke-linux.md:162-164`):
    `(HOME=$S/home DISPLAY=:99 GDK_BACKEND=x11 SSH_ASKPASS_REQUIRE=never GIT_ASKPASS= setsid dbus-run-session -- "$APP" >>$S/direct.log 2>&1 &)`;
    `killapp` still matches it (inferred). Dark theme via the toolbar toggle. X Y below are screen coordinates read off
    a root screenshot (under openbox, add the window's frame offset, `smoke-linux.md:230`).
  - The app opens in History with that commit selected; the details pane's file list (header "600 files
    changed", **Changes** tab, the default flat list). Rows 26 px apart.
  - Right-click the path text of a row near the top (file-002 … file-011) with no hover wait (`xdotool mousemove
    X Y click 3`); the menu opens downward (Copy path, *Open*, Save as…, Blame, History). Wait 1 s, screenshot →
    no tooltip over the menu (v0.10.20: the file-name tooltip, about 96×47, over *Open*'s icon and first
    letters).
  - Then the gate's click, no pause: `xdotool mousemove X Y click 1` onto *Open*'s left part (its icon and first
    letters) → the menu closes on that first click (root screenshot: no menu; G3's failure is *Open* highlighted,
    the menu still open) and *Open* runs: the handler starts (`pgrep -n gnome-text-editor` shows a new pid, not one
    there before the click; not `xdg-open`, which exits within milliseconds, `smoke-linux.md:319`); kill it before
    the next run, since a running editor gets reused (`smoke-linux.md:323`). 4 runs (v0.10.20: 0 of 4).

### 5. A drill-down in the Stashes browser snaps back to the stash (§V, D-1)

- **What the user sees:** in the Stashes browser's Files tab, a blame-gutter click or *Select in graph* (or *Blame
  parent*) snaps the browser back to the stash, while History behind it moves to the other commit and shows the
  stash.
- **Code (verified):** the browser renders `CommitDiff` (`StashesDialog.tsx:201`) → `FileContent`
  (`DetailsPane.tsx:144`); the gutter (`FileContent.tsx:159`, `:187`, `:271`) and the hunk menu (`:301`, `:311`) call
  `blameAt`. `blameAt` (`actions.ts:179-210`) reveals the commit (`revealOid`, which clears `preview`,
  `repoStore.ts:531`), closes only the commit dialog (`actions.ts:204`) and switches History to the Files tab with the
  blame (`:205-209`). The browser's "lost its preview" effect (`StashesDialog.tsx:64-71`) re-previews the stash, and
  the pane shows a preview first (`DetailsPane.tsx:36-46`) while the grid highlights the commit
  (`RevisionGrid.tsx:199`). Inferred: React may run that effect before `blameAt` resumes after its `await`, so the fix
  copes with either order.
- **Fix (`actions.ts:204`):** close the dialog when it is the commit dialog, **or** the Stashes browser and the
  reveal hit; and on a hit, `previewStash(null)` explicitly (the browser's effect may have put it back during the
  `await`). A miss (a filtered grid) still only toasts and keeps the browser open. The browser's own row-menu Blame
  (`FileRowMenu.tsx:93`, the stash's own oid: the reveal misses but the commit counts as on screen,
  `actions.ts:185`) keeps working.
- **D5:** (a) **leave the browser and land in History on the commit, with the blame** (as the commit dialog does);
  (b) drill down inside the browser; (c) disable these drill-downs in the browser. **Taken: (a).**
- **Tests (`actions.test.ts`, "History and Blame from a file row", `:163-279`):** with `dialog: stashes`, a
  `revealOid` that re-sets the preview during the reveal and resolves `true` → the dialog is closed and `preview` is
  null (both fail today). The stash-blame test (`:205-212`) runs with `dialog: commit` from `beforeEach`; "a miss
  keeps the browser open" is its own new test with `dialog: {kind:"stashes"}`.
- **Walk (BP 5):** Changes → Stashes browser → a stash's Files tab → turn Blame on before the gutter click → a
  gutter click on a line from an older commit → the browser closes, History shows that commit's Files tab with the
  blame on the file.

### 6. A closed Stashes browser leaves History's pane on the stash (§V, D-2)

- **What the user sees:** after closing the browser, History's details pane still shows the last stash browsed,
  while the grid highlights a commit; the only marker is in the sidebar's Stashes section, collapsed by default.
- **Code (verified):** the pane's target is preview > compare > commit (`DetailsPane.tsx:32-46`); closing the browser
  does nothing to `preview` (`DialogHost.tsx:106-107`). The rule is documented at `repoStore.ts:52-57`.
- **D6:** (a) keep; (b) clear the preview on dismiss; (c) **restore what the pane showed before the browser
  opened**; (d) keep, and make it visible. **Taken: (c).**
- **Fix:** `StashesDialog` captures `useRepoStore.getState().preview`, `compare` and `wtSelected` (D28) in its
  first render (a `useRef`/`useState` initialiser, as `Dialog.tsx:69-70` does — not in an effect: the effect at
  `StashesDialog.tsx:67-71` previews stash@{0} on mount first, so an effect would capture that instead of what was
  there before) (D16: opening the browser previews a stash, and `previewStash` clears `compare`, `repoStore.ts:515`,
  so both need restoring). Its dismiss (Esc or × — `StashesDialog` has no footer, `StashesDialog.tsx:126`, so there
  is no third close path; the `onClose` it passes to `Dialog`) looks the captured stash up again by oid in the
  current `refs.stashes` (its `index` may have shifted after a push/drop inside the browser; Apply/Pop/Drop act by
  index, `DetailsPane.tsx:301-307`) and re-previews that entry if found, restores `compare`, else
  `previewStash(null)`, then closes. Restore with one `setState` (React batches `preview`/`compare` and the dismiss
  together; safe either order), then `onClose()`. Restore the captured `compare` only if `selectSelectedOid`
  (`repoStore.ts:611-612`) is still one of its pair (the invariant at `repoStore.ts:48-51`) — otherwise drop it.
  `selectSelectedOid` is null while `wtSelected` is true: a conflicted Apply/Pop inside the browser runs
  `selectWorkingTree()` (`opsStore.ts:250`), which leaves `selectedIndex` on the pair but reads as no selected oid;
  checking `selectedIndex` alone would restore a compare under a working-tree selection (`selectCompare`, `:615`,
  hides it, but the `:48-51` invariant breaks), so the guard reads `selectSelectedOid`, not `selectedIndex`.
  `reselect` can also move the selection to row 0 (`repoStore.ts:180`) after an outside rewrite while the browser
  is open — covered the same way. If `wtSelected` flipped false→true during the browser (D28: captured false at
  open, true at dismiss — a conflicted Apply/Pop inside the browser ran `selectWorkingTree()`, `opsStore.ts:250`,
  clearing `preview` on purpose, `repoStore.ts:512`), restore neither `preview` nor `compare`: `previewStash(null)`
  instead — restoring the pre-open stash would show it in the pane while the grid highlights the working tree
  (`DetailsPane.tsx:36-46`), the same D-2 mismatch this row fixes. Otherwise restore as usual, even if `wtSelected`
  was already true at open (D28: a sidebar stash preview shown while the working-tree row was already selected,
  `Sidebar.tsx:521`; the working-tree row selected by keyboard, `RevisionGrid.tsx:170`, or click, `actions.ts:241`;
  the browser opened from Changes, `StashesDialog.tsx:54`) — it comes back.
  **Not** an unmount cleanup: a tab switch closes the dialog and then `put()`s the next tab's `repoStore`
  (`tabsStore.ts:71`), so a cleanup would wipe the incoming tab's preview. Row 5's drill-down closes through
  `useDialogStore.close()`, bypassing this, and clears the preview itself (intended: it lands on the commit).
- **D30 (pass 6) — D28's remaining edge, accepted, closed:** with the working-tree row already selected and a
  sidebar stash preview (`Sidebar.tsx:521`), opening the Stashes browser and a conflicted Apply/Pop inside it
  (`opsStore.ts:250` → `selectWorkingTree()`, which clears `preview`, `repoStore.ts:512`) leaves `wtSelected`
  true→true, so D28's false→true check doesn't fire and the dismiss restores the old stash while the grid shows the
  working tree with conflicts. Reasoned from the code, not run; rare (three conditions together).
- **D25 (pass 4) — the compare guard's own loading edge:** `selectSelectedOid` (`repoStore.ts:610-612`) also reads
  null while the selected row's page is still loading, not only while `wtSelected` is true — so a walk restart
  while the browser is open (a stash push refreshes the refs) can drop a valid compare on dismiss too, the same way
  as an outside rewrite off the pair. **Accepted as an edge**: the result is the plain commit instead of the
  compare, not measured to reproduce. **D27 (pass 5):** accepted, closed — → `open-items-done.md` at the docs
  commit, alongside D18 and D22.
- **D15 — sibling callers of `showHistory`:** *History of this file* from inside the browser (`FileContent.tsx:317`,
  and the row menu's History) goes through `showHistory` (`actions.ts:218-225`), which closes every dialog but
  leaves `preview`. It gets `previewStash(null)` too, but **only when called from inside the Stashes browser** (the
  stashes dialog is open); other callers keep today's behaviour (a sidebar stash preview stays when using a file
  row's History). **Taken.**
- **Tests (`StashesDialog.test.tsx`, the Esc-close pattern at `:174-190`):** no preview before → open (it previews
  s0), Escape → `preview` null; a preview of s1 before → open, click s0 in the browser, Escape → s1 (without the
  click the test would end on s0 either way, since the browser's effect previews only when `preview` is null,
  `StashesDialog.tsx:67-71`, and closing doesn't touch it, `DialogHost.tsx:106-107`); a pre-open stash that was
  dropped meanwhile → null; push a stash inside the browser, close → the restored preview has the new index
  (looked up by oid). A compare test: set a compare pair, open the browser (the preview clears it,
  `repoStore.ts:515`), Escape → the same compare is back; if an outside rewrite moves the selection off the pair
  meanwhile (`reselect`, `:180`), the compare is dropped instead — this test must seed `rows` and `selectedIndex`
  on one of the pair (the guard reads `selectSelectedOid`, `repoStore.ts:611-612`; `resetRepo` leaves `rows: []`,
  `StashesDialog.test.tsx:70`, which would fail the guard before the fix is even reached). A conflicted Apply in
  the browser (`wtSelected` flips false→true), Escape → `preview` is null, not the pre-open stash — the mocked
  `stashApply` must return `failure: { kind: "conflicts" }` (or set `wtSelected` directly), since today's mock
  returns ok (`StashesDialog.test.tsx:13`; `opsStore.ts:238`, `:250`). A D28 test: the working tree already
  selected before opening (`wtSelected` true throughout) with a sidebar stash preview of **s1** set (s0 would make
  the click below a no-op and the test would pass before the fix), open the browser, click s0 in the browser,
  Escape → the preview is back (same reason as above: without the click the test ends on s0 either way).
- `actions.test.ts`: `showHistory` clears the preview when called with the browser open.
- **D18 — a tab switch while the browser is open:** keeps its preview in the snapshot of the tab left
  (`tabsStore.ts:120`, `:71`, `:99-103`); accepted, closed — rare (the scrim blocks tab clicks, and shortcuts are
  off while a dialog is open). See *Not in this batch*.
- **D23 (pass 2) — the sibling `selectWorkingTree(false)` case:** `selectWorkingTree(false)` (`repoStore.ts:512`,
  via `dropWorkingTreeIfClean`, `statusStore.ts:190`) can drop a sidebar stash preview in History on a clean-tree
  status. **Deferred** to a new `open-items.md` row, with reopen trigger "a report of a stash preview vanishing, or
  the next stash work". See *Not in this batch*.
- **Walk (BP 6):** History on a commit → open the browser, browse two stashes, Escape → the pane is back on the
  commit; preview a stash from the sidebar → open the browser from the pane's *Open browser* (`DetailsPane.tsx:310`),
  browse another, close → the pane is back on the first stash; set a compare pair, open the browser, close → the
  same compare is back.

### 7. Fast tab switching loses the grid selection (§V, D-3)

- **What the user sees:** switching tabs rapidly (×10, once at ×3) can bring a tab back selected on the top row
  instead of where it was left.
- **Code (verified):** a switch restores the tab's `rows` and `selectedIndex` (`repoStore.ts:556-577`) and restarts
  the walk (`actions.ts:301-310`); `startLog` keeps the selected oid as `pendingSelect` (`repoStore.ts:452-453`), and
  `reselect` finds it again after page 0 (`:169-186`, `:476-479`). `findIndex` turns every `findLogRow` error into
  `null` (`:157-161`), and `reselect` reads `null` plus a complete walk as "gone for good" → row 0 (`:176-180`); later
  restarts carry row 0 forward (`:452`). Backend generations can be handed out out of call order: `start_log` awaits
  `compute_labels` (`src-tauri/src/commands/repo.rs:279`) before `log.begin()` (`:284-289`), unserialised
  (`:80-91`), with a global counter (`crates/git-core/src/log/cache.rs:7-9`, `:28-36`). Inferred sequence: a
  superseded walk begins after the newest, the frontend's generation goes stale, its `complete` event arrives first,
  `findLogRow` fails stale → `null` → row 0. Not reproduced.
- **Fix (frontend, `repoStore.ts`):** `findIndex` returns `undefined` on an error ("no verdict") and `null` only for
  "the walk has no such row". `reselect` and `reanchor` (`:201`, `:205-208`) return on `undefined` — **inferred**
  that "the stale page's restart re-runs them": only `fetchPage` restarts on `staleGeneration` (`:286-288`); with
  every viewport page already loaded nothing restarts and `pendingSelect` stays set until the next `startLog`,
  which stays on its index (inferred); if the restart renumbered rows, that index may be another commit — the case
  `repoStore.ts:179` avoids. `revealOid` (`:523-525`) treats `undefined` as a miss for its
  boolean (today an IPC error shows the misleading *Not in the current view* toast — that stays, as no verdict is
  possible; noted).
- **D7:** (a) **frontend only**; (b) also order backend generations (`begin()` before `compute_labels`); (c) also
  prefer `pendingSelect` in `startLog` (could override a click). **Taken: (a).**
- **D29 (pass 5) — the two residual limits, accepted, closed:** (i) a stale `undefined` with no restart following
  can leave `selectedIndex` on a renumbered row, so another commit is selected (inferred, rare); (ii) the
  misleading *Not in the current view* toast on an IPC error from `revealOid` stays. Both → `open-items-done.md`
  at the docs commit, alongside D18, D22 and D25.
- **Test (`repoStore.test.ts`, "repoStore walk restarts", `:68`, shape of `:94-114`):** walk 1 completes, select row
  3, walk 2's page 0 in flight, `findLogRow` rejects `staleGeneration`, a `complete` event for walk 2 →
  `selectedIndex` stays 3 (today 0). The existing *falls back to the first row* test (`:116-130`) resolves `null` and
  is unaffected.
- **Walk (BP 7):** a regression look only (D-3 never reproduced). Two tabs, each selected on a lower row; Ctrl+Tab
  ×20 quickly, then stop → both tabs keep their rows. A `console.debug` in `findIndex`'s catch, on a throwaway
  build, would confirm the cause if it reproduces first; not required.

### 8. `diffStore` outlives a closed repository; tree keys shared (§V, D-4)

- **What the code shows (verified):** `treeSelection` (`diffStore.ts:129`), `pinned` (`:131`) and `treeCache`
  (`:125`, up to `MAX_TREES` 20, `:127`) are module-level, keyed by `targetKey` (the oid, or `"workingTree"`, `:113`),
  and outside the tab snapshot (`:404-446`); `pinned` is reset by every `load`, not only `load(null)`
  (`diffStore.ts:256`). The `"workingTree"` key is unreachable: `load`'s callers (`DetailsPane.tsx:51`,
  `StashesDialog.tsx:62`) never load a working tree, and an oid names one tree in any repository — so the row's
  "another repo preselects a same-named file" can't happen today.
  The other half is wider than the row says: closing the last tab (`tabsStore.ts:136-145` → `closeRepo`, `repo:
  null`, `repoStore.ts:369`) swaps the window to the start screen in the same render (`App.tsx:92`, `:251-255`), so
  `DetailsPane` never loads `null` (inferred), from History as from Changes; `diffStore` keeps the old repository's
  target, files, tree and content. No wrong content is shown (`StashesDialog.tsx:61`, `actions.ts:184`).
- **Fix (`diffStore.ts`):** subscribe to `repoStore` as `statusStore.ts:265` and `commitStore.ts:621` do: when
  `repo` goes from set to `null`, `load(null, null)`. No import cycle (`repoStore` imports `ipc`, `kv`, `paths`,
  `pick`, `toastStore`). A tab switch never passes through `repo: null`.
- **D8:** (a) **clear on close; the shared-keys half closed as unreachable; correct the row's text**; (b) also key per
  repository (~8 lines). **Taken: (a).**
- **Test (`diffStore.test.ts`, "Files tab", beside `:402-420`):** set `repo` to a non-null value first (the
  subscription fires only on a set→null transition), load a commit, select a tree path, then set `repo: null` →
  `repoId` null; load the commit again → no tree path selected (both fail today). `setState`, since
  `ipc.closeRepo` isn't mocked there. Run the full suite: a test resetting `repo` after setting up `diffStore` now sees
  it cleared (`StashesDialog.test.tsx:70-73` resets in the safe order).

### 9. The merge banner says "resolve conflicts" with nothing to resolve (§V, E1)

- **Code (verified):** `computeBanners` (`src/screens/RepoWindow/banners.ts:56-66`) always says *Merge in progress —
  resolve conflicts, then commit to finish*; cherry-pick and revert (`:88-99`) have the same fixed text; rebase
  (`:67-85`) already branches on `fresh.conflicted === 0`. Git (verified, `crates/git-core/tests/ops.rs:650-674`: a
  refusing `pre-merge-commit` hook → `RepoState::Merge` with no conflicts): a refused `pre-merge-commit` leaves
  `MERGE_HEAD`, `MERGE_MSG` and the merged tree staged, with no conflicts.
- **Fix:** in the merge block, `fresh !== null && fresh.conflicted === 0` → *Merge in progress — nothing to
  resolve; commit to finish, or Abort*. The `freshStatus` staleness guard (`:44-46`) stays, so a stale status never
  claims "nothing to resolve".
- **D9 / D12:** (a) merge, cherry-pick and revert, with that wording; (b) **merge only**. Taken 2026-10-06 as (a);
  **narrowed 2026-10-06 (D12) to merge only.** Measured 2026-10-06 (git 2.55, scratch repo): a `pre-commit` hook
  that exits 1 does not stop `git cherry-pick` or `git revert` — both commit anyway, so the hook can't produce a
  no-conflict stop there. Their no-conflict stop is instead the empty pick, whose toast already explains it
  (`banners.ts:86-87`, `crates/git-core/src/cli/ops.rs:1430`); "commit to finish" would mislead there (nothing is
  staged). Cherry-pick and revert keep today's fixed text and the `:86-87` comment.
- **Test (`banners.test.ts`, beside the rebase case at `:59-68`):** a merge with nothing conflicted has no "resolve
  conflicts"; with conflicts, the old wording. No change to the cherry-pick/revert cases.
- **Walk (BP 9):** a `pre-merge-commit` hook that exits 1, a conflict-free merge → the banner reads *Merge in progress
  — nothing to resolve…*; remove the hook, commit → the banner goes.

### 10. *Lock…* offered on the main worktree (§V, E3)

- **Code (verified):** `Sidebar.tsx:790-828`; `noRemove` (`:796`) disables *Remove* for `wt.main`; *Lock…*/*Unlock*
  (`:807-815`) have no guard. `wt.main` comes from `crates/git-core/src/linked.rs`. There is no *Move* item.
- **Fix:** `noLock = wt.main ? "The main working tree can't be locked" : null`, applied to *Lock…* as `noRemove` is
  (`disabled` + `title`). *Unlock* can't show on a main row (it is never locked).
- **Test (`Sidebar.test.tsx`, the Remove-disabled style):** the main worktree's *Lock…* is disabled with that title;
  a linked worktree's isn't. The fixture is at `:546-547` (used by the test at `:595-609`); its only linked
  worktree is locked (`:597-598`); add an unlocked one for the "isn't disabled" case.

### 11. Each tab open calls `open_repo` twice (§X, C-2)

- **Code (verified):** `tabsStore.ts:88` calls `ipc.openRepo(path)`; `:106` then calls `repoStore.openRepo(
  summary.path)`, which calls `ipc.openRepo` again (`repoStore.ts:321`, `:324`). That is the only production caller of
  `repoStore.openRepo` (tests call it directly).
- **Fix:** `repoStore.openRepo(path, summary?)` uses the summary when given; `tabsStore.ts:106` passes it. The
  path-only call keeps working. The backend's `open_repo` for an already open path only finds the handle (the row:
  ~3–10 ms, one watcher), so the reused summary is what the second call would return (reasoned).
- **Test (`tabsStore.test.ts`):** one `ipc.openRepo` call per `openTab` (today two).

### 12. Alt+2 in the History search box does nothing (§V, F1)

- **Code (verified):** `src/screens/RepoWindow/useShortcuts.ts:105` returns for a text field (`inTextField`,
  `:27-32`) after the Ctrl window and tab keys (which work from text fields by design, `:2-5`) and before the
  Alt+digit view switch (`:111-117`, by `e.code`; `:110`: Option+1 types `¡` on a Mac).
- **D10 / D13:** (a) Alt+digit switches views from text fields too, with `preventDefault` so the Mac's Option glyph
  isn't typed into the field; (b) leave it. Taken 2026-10-06 as (a); **narrowed 2026-10-06 (D13)**: on Swedish and
  Finnish Mac keyboard layouts, Option+2 types `@` (inferred from layout knowledge, not measured), so in text
  fields Alt+digit switches views **on Windows and Linux only**; on macOS, Option+digit in a text field keeps
  typing its character. Outside text fields the view switch works on every OS as today, unchanged. Supersedes
  D10's "preventDefault so the Mac glyph isn't typed".
- **Fix:** move the Alt+digit block above the `inTextField` return, but on macOS only when `!inTextField` (checked
  with `isMac()`, `src/lib/keys.ts:16`; `useShortcuts.ts:9` already imports from `keys`); on Windows and Linux the
  block already calls `preventDefault` (`useShortcuts.ts:113`, `:116`).
- **Test (`src/screens/RepoWindow/useShortcuts.test.ts`):** Alt+2 in an `<input>` switches to Changes and is
  default-prevented on Windows and Linux; plain `2` in the input does nothing. A Mac-UA test: Option+2 in an input
  is not prevented and doesn't switch. Update the comment at `useShortcuts.ts:110`, not only the header `:2-5`.
- **Walk (BP 12):** Windows: focus History's search box, Alt+2 → Changes; Linux (openbox): the same with `xdotool key
  alt+2` (D34); the Mac: Option+2 in the box keeps typing its character, no view switch; outside a text field,
  Option+2 still switches to Changes.

### 13. An empty session's `lastOpen` fallback (§V, F2)

- **Code (verified):** with an empty saved session (`take_layout`, `src-tauri/src/commands/window.rs:736-746`), the
  frontend opens `lastOpen` (`App.tsx:65-70`). `lastOpen` mirrors the active tab and is cleared when none is active
  (`App.tsx:213`, `recentsStore.ts:105-107`). So the BK walk's two launches were deterministic: the first opened
  `lastOpen`; the tab was then closed, clearing it; the next launch had nothing to reopen.
- **D11:** (a) **keep the rule; fix the comments** (`App.tsx:38-41`, `src-tauri/src/commands/window.rs:739` say
  "first launch"); (b) never clear `lastOpen` on close. **Taken: (a).**
- **Fix:** comments only, stating the rule: an empty session reopens the last active repository unless every tab was
  closed since.

### 14. `smoke-fixtures.ps1` drops quotes under PowerShell 5.1 (§Y)

- **Code (verified):** `docs/smoke/fixtures/smoke-fixtures.ps1:93` passes `"sh `"<path>`""` through `Invoke-Git`
  (`& git @Arguments`, `:36-43`). Windows PowerShell 5.1 doesn't escape embedded quotes in a native argument
  (reasoned from its documented behaviour; measured 2026-10-04 that the quotes are dropped). Windows PowerShell 5.1
  (`powershell.exe`) is on this machine too, alongside 7, so both shells can be run here.
- **Fix:** try first a form that needs no version branch: `"sh '$($slowPack -replace '\\','/')'"` (single quotes
  inside, no embedded double quotes, so neither 5.1 nor 7.3+ rewrites it; git runs `uploadpack` through `sh`,
  reasoned, which reads the single quotes); it breaks only on a path containing `'`. Fall back to pre-escaped
  double quotes with a `$PSVersionTable.PSVersion` branch only if that fails (PowerShell 7.3+ escapes embedded
  quotes itself, so a pre-escaped `\"` would double there). The fix is **run on both** before it lands:
  `git -C <work> config remote.slow.uploadpack` must read the expected command under 5.1 and 7.
- **Check:** the read-back above, in a fixture root with a space in its path, plus the `slow` remote's fetch working.

## Smoke group BP

Written into `docs/smoke/smoke-test-post-v1.md` after BO, one step per walk bullet above; the steps take their row
numbers (BP 1–7, 9, 12), so the numbering has gaps on purpose — the other rows are covered by their unit tests.
Windows over CDP on a local `tauri build --no-bundle` of `fix-batch` (`smoke-cdp.md`, the
store backed up first and restored byte-exact); the Mac by the owner's Mac session; Linux under Xvfb with openbox
(`smoke-linux.md`, *A window manager: openbox*). The Mac and Linux walks need `fix-batch` pushed as a side branch (its
own go).

## Release and gate

- Version: the owner names it (the `release` skill). The run waits for approval in the `signing` environment.
- The gate, as v0.10.20's, plus:
  - **Windows:** before Install, open a second window, move it, and change nothing in it after the move; after the
    update, it comes back at the moved rect. That settles §Q *N6's Windows update-path persist* (done if it passes).
  - **Linux:** the AppImage half under openbox, in the gate's layout; the G3 check as in BP 4 (the no-pause click
    onto *Open*'s left part, 4 runs) → all open (if row 4 shipped; if D4 reverted it, the check records the
    v0.10.20 picture and isn't a release blocker — pre-existing, D14). **D14 — pre-check, done 2026-10-06 on
    v0.10.20:** in a 1600×1000 layout (menu opening upward) not reproduced, 16 of 16 opened. In the gate's layout
    (1920×1200, maximized, menu opening downward) the row's native tooltip — an override-redirect window about
    96×47 — sat over *Open*'s icon and first letters by 0.8 s in 10 of 10 runs; a click arriving with the pointer
    (no pause) inside the tooltip was lost 4 of 4 (*Open* highlighted, the menu stays open — the gate's picture),
    beside it 2 of 2 opened; after a 100 ms pause 10 of 10 opened. Measured. Inferred, not traced: the press lands
    on the tooltip window, GTK hides it, and the pointer only hovers *Open*; a person hits it with a quick flick
    onto *Open*'s left part. So G3 is a real app behaviour, and row 4 may fix it (whether WebKitGTK re-reads the
    tooltip after the strip isn't known; BP 4 tells, D4).
  - If the release runs on or after 2026-10-19, run Release from `workflow_dispatch` first (§B,
    `open-items.md:45-48`: `ubuntu-latest` moves to Ubuntu 26 on that date).
- After the gate: the gate records and a docs commit (pushed on the owner's word).

## Docs moves (in the branch's docs commit)

- Each fixed row → `open-items-done.md`, in its section (§V, §X, §Y, §Z, §AA) or, for row 2, a new done §AD
  (`open-items-done.md` has no §AD yet); `open-items.md`'s §AD then has no open row, and its heading is removed
  once empty — its letter joins the "nothing open left" list in `open-items.md`'s intro. Except §Z T15 (row 4): it
  stays in `open-items.md` §Z until the post-gate docs commit, where G3 merges into it (D33), and both move to done
  §Z if BP 4 and the gate check passed; if D4 reverted row 4, both stay open in §Z with the measured repro.
- §V D-4's row closes with the correction (the shared-keys half unreachable; the store was not cleared from either
  view).
- §AA #14's title ("macOS / Linux") is corrected to macOS when it moves to done: WebKitGTK focuses a clicked
  button (measured, C1), so the row's bug is macOS-only. Also correct the row's body when it moves —
  `open-items.md:693-694` "WebKit gives a clicked button no focus" → "macOS WebKit gives a clicked button no
  focus".
- No README change (checked: `README.md:25`, `:106`, both list Alt+1/Alt+2 with no scope, so there is nothing to
  change for D13).
- `useShortcuts.ts`'s header comment (`:2-5`) gains the Alt+digit view keys among those that work from text fields
  on Windows and Linux (D13).
- At the post-gate docs commit it also names its §Q moves: N6's row → `open-items-done.md` if the Windows
  update-path gate check passes; G3's §Q row (D33) leaves §Q and merges into T15 in `open-items.md` §Z (row 4's
  open-items row): it closes with T15 when BP 4 and the gate check pass; if D4 reverted row 4, it stays open there
  with the measured repro. If the Release dry run happens (the 2026-10-19 conditional), the §B row
  (`open-items.md:45-48`) is updated, or moved to done, with its result.
- Two new `open-items.md` rows (D21, D23), in a new section **§AE "Added 2026-10-06 — the fix batch"**
  (`open-items.md` has §AA and §AD; the done file already uses §AB and §AC, so §AE avoids a clash), and six closed
  items (D18, D22, D25, D29's row-7 pair, D30) in a new dated done section **"§AE. Added 2026-10-06 — the fix
  batch: accepted, closed"** (matching the open-items §AE for the deferred rows), each with the reopen trigger or
  ruling given under *Not in this batch*.
- `open-items.md:12` ("most of §V's deferred rows wait on a later fix batch") is reworded: after this batch, only
  the CRLF test flake and the GIO-modules row remain.

## Not in this batch

- The split *Fetch* button that disables itself while focused (row 2's note), and the Stash menu's *Pop latest* /
  *Apply latest* (`Toolbar.tsx:362-367`: the menu closes and the op disables `stashBtn` in one commit, so
  `useRestoreFocus` focuses a disabled button, landing on `<body>` on every OS) — both self-disable with no dialog
  in the picture. **D21 (pass 2):** deferred to a new `open-items.md` row (its own design question: where the focus
  should go), written at the docs commit with reopen trigger "a keyboard user's report, or the next focus work".
- The Settings gear's Cancel still returns the focus to `<body>` on macOS WebKit (on Linux the click focuses the
  gear, so Cancel returns to it — inferred, C1 measured a plain button) (D19: it's an `IconButton`, never disabled,
  so row 3's fix doesn't reach it). **D22 (pass 2):** accepted, closed, macOS-only — → `open-items-done.md` at the
  docs commit.
- §V D-2's sibling `selectWorkingTree(false)` (`repoStore.ts:512`, via `dropWorkingTreeIfClean`,
  `statusStore.ts:190`): a clean-tree status can drop a sidebar stash preview in History. **D23 (pass 2):** deferred
  to a new `open-items.md` row, with reopen trigger "a report of a stash preview vanishing, or the next stash
  work".
- §V D-2's tab-switch case (D18, accepted, closed): a tab switch while the Stashes browser is open keeps its
  preview in the snapshot of the tab left (`tabsStore.ts:120`, `:71`, `:99-103`); rare (the scrim blocks tab clicks,
  and shortcuts are off while a dialog is open). Goes to `open-items-done.md` at the docs commit.
- §V D-2's compare guard's loading edge (D25, accepted, closed): `selectSelectedOid` also reads null while the
  selected row's page is still loading, not only while `wtSelected` is true, so a walk restart while the browser is
  open can drop a valid compare on dismiss too. **D27 (pass 5):** → `open-items-done.md` at the docs commit,
  alongside D18 and D22.
- §V D-3's two residual limits (row 7, accepted, closed): a stale `undefined` with no restart following can leave
  `selectedIndex` on a renumbered row (inferred, rare), and the misleading *Not in the current view* toast on an
  IPC error from `revealOid` stays. **D29 (pass 5):** both → `open-items-done.md` at the docs commit.
- §V D-2's remaining D28 edge (row 6, accepted, closed): with the working-tree row already selected and a sidebar
  stash preview, opening the Stashes browser and a conflicted Apply/Pop inside it leaves `wtSelected` true→true, so
  D28's false→true check doesn't fire and Escape restores the old stash while the grid shows the working tree with
  conflicts (reasoned, not run; rare). **D30 (pass 6):** → `open-items-done.md` at the docs commit, alongside D18,
  D22, D25 and D29's two.
- §X's rows that wait on a trigger (the rebase read, intent-to-add Discard, the counts' speed and failure, the WebKit
  abort), the CRLF test flake, the GIO modules, §Y's dark tint, Phase 5 D8, T5, T14 (their own plan), §AA's
  release caching, §S's review of §T, §E's dated rows, §C's roadmap.

## Decisions

All taken by the owner 2026-10-06, each as recommended: D1 (a), D2 (a), D3 (a), D4 (a), D5 (a), D6 (c), D7 (a), D8
(a), D9 (a), D10 (a), D11 (a); the scope A + B + C.

Plan review pass 1, 2026-10-06, after the owner's rulings:

- **D12 (row 9, revisited):** narrows D9 to merge only. Measured 2026-10-06 (git 2.55, scratch repo): a refusing
  `pre-commit` hook doesn't stop `git cherry-pick` or `git revert`, so cherry-pick and revert keep today's fixed
  text; only merge gets the no-conflict wording, now verified by `crates/git-core/tests/ops.rs:650-674`.
- **D13 (row 12, revisited):** narrows D10 to Windows and Linux. On Swedish and Finnish Mac layouts Option+2 types
  `@` (inferred, not measured), so Alt+digit switches views from text fields on Windows and Linux only; on macOS a
  text field keeps today's behaviour (the view switch still works outside text fields on every OS).
- **D14 (release and gate):** a pre-check of G3 on v0.10.20 under openbox, run before the batch, so the gate's
  openbox check can tell row 4's effect apart from a pre-existing pass. Done 2026-10-06: reproduced in the gate's
  layout (see *Release and gate*).
- **D15 (row 6):** `showHistory` clears the preview only when called from inside the Stashes browser; other
  callers keep today's behaviour.
- **D16 (row 6):** the browser also captures `compare` at mount and restores it on dismiss, alongside `preview`.
- **D17 (row 3):** on a pointer close, restore the focus to the trigger only if it was focused before the click
  (today's behaviour on every OS, unchanged); on a keyboard close, always restore.
- **D18 (row 6, accepted, closed):** a tab switch while the Stashes browser is open keeps its preview in the
  snapshot of the tab left; rare enough to accept as is.
- **D19 (row 3):** the Settings gear is an `IconButton`, never disabled; dropped from row 3's list, noted under
  *Not in this batch*.

Plan review pass 2, 2026-10-06, after the owner's rulings:

- **D20 (row 3):** the new script focuses likely draw a WebKitGTK ring after mouse use (T28,
  `open-items-done.md:1525`, plus `theme/base.css:50`). Accepted, not suppressed: the BP 3 Linux walk records
  whether a ring shows on the "click *Fetch options*, Cancel" step (after C1: on Linux the Cancel step is a
  regression look; the new one is the submit step, D29).
- **D21 (row 2, pass 2):** the split *Fetch* button and the Stash menu's *Pop latest* / *Apply latest* disable
  their trigger with no dialog in the picture, so `useRestoreFocus` lands on a disabled button and ends on
  `<body>`. Deferred to a new `open-items.md` row, with reopen trigger "a keyboard user's report, or the next
  focus work".
- **D22 (row 3, pass 2):** the Settings gear's Cancel lands on `<body>` on macOS WebKit (D19). Accepted, closed,
  macOS-only — → `open-items-done.md` at the docs commit.
- **D23 (row 6, pass 2):** `selectWorkingTree(false)` (`repoStore.ts:512`, via `dropWorkingTreeIfClean`,
  `statusStore.ts:190`) can drop a sidebar stash preview in History on a clean-tree status. Deferred to a new
  `open-items.md` row, with reopen trigger "a report of a stash preview vanishing, or the next stash work".

Plan review pass 4, 2026-10-06, after the owner's rulings:

- **D24 (row 3):** record, don't focus — the behaviour D17 rules is unchanged. The `Menu` wrap's `onClickCapture`
  no longer focuses anything: it only records the clicked trigger and whether it already had the focus
  (`wasFocused`, the D17 flag; D26, pass 5, drops the not-open condition). `useRestoreFocus` (`Menu.tsx:141-150`),
  when `open` turns true, takes the recorded trigger as the opener instead of `<body>` if `document.activeElement` is
  `<body>` (macOS WebKit: the click didn't focus the button) — no script focus is needed, since the first item takes the
  focus at once. Pass 4 found the wrap's capture would still script-focus `repoBtn` on a drag's final click (the menu is
  closed then, and `dragged()` is read only in the button's bubble `onClick`, `useTabDrag.tsx:265-269`, `moved` set at
  `:102`, `Toolbar.tsx:215-218`, after the capture phase), a script focus against D17's macOS outcome (on Linux
  WebKitGTK the click has already focused the trigger, C1, so it's a no-op there; see D31). The D17 outcomes stay:
  pointer close restores only if `wasFocused` (Chromium and Linux WebKitGTK as today, macOS WebKit `<body>`), keyboard
  close always restores.
- **D25 (row 6):** the compare guard via `selectSelectedOid` also reads null while the selected row's page is still
  loading (`repoStore.ts:610-612`), so a walk restart while the browser is open (a stash push refreshes the refs)
  can drop a valid compare on dismiss. **Accepted as an edge** — the result is the plain commit instead of the
  compare.

Plan review pass 5, 2026-10-06, after the owner's rulings:

- **D26 (row 3):** drops the `!open` guard on the `Menu` wrap's capture — it now records `{ trigger, wasFocused }`
  on every click, not only when `!open`. The trigger is always the same element (the wrap holds only the anchor);
  the guard only changed `wasFocused` on the closing click, which mattered in one case — macOS WebKit, a menu
  opened by keyboard, closed by clicking its trigger: with the guard it restored to the trigger (a script focus
  against D17's macOS outcome — on Linux WebKitGTK the click has already focused the trigger, C1, so it's a no-op
  there; see D31); without it the focus stays on `<body>`, matching D17 literally. Chromium unchanged (its
  mousedown focuses the trigger, so `wasFocused` is true). Every mention of the guard (the fix, the risk notes, the
  tests, D24's "keep recording only when `!open`") is removed; the "re-entrant click" test's claim becomes a D17
  pointer-close regression test, and a new test covers the D26 case.
- **D27 (row 6):** D25 is accepted, closed — → `open-items-done.md` at the docs commit, alongside D18 and D22
  (done §AE; its final list is under D30).
- **D28 (row 6):** `StashesDialog` also captures `wtSelected` at the first render, with `preview` and `compare`; on
  dismiss it drops the stash (`previewStash(null)`, no restore) only if `wtSelected` flipped false→true during the
  browser (a conflicted Apply/Pop inside it, `opsStore.ts:250`); otherwise it restores as usual, even when
  `wtSelected` was already true at open — a sidebar stash preview shown while the working-tree row was already
  selected comes back.
- **D29 (rows 2 and 7):** row 7's two residual limits are accepted, closed — → `open-items-done.md` at the docs
  commit (a stale `undefined` with no restart following can leave `selectedIndex` on a renumbered row; the
  misleading *Not in the current view* toast on an IPC error from `revealOid` stays). D20 already covers row 2's
  observer refocus after a mouse submit (a new script focus on WebKit too): the BP 2 and BP 3 Linux walks gain a
  "ring?" note on a "click *Fetch options*, submit with the mouse, wait for the fetch to end" step. Done §AE now
  holds D18, D22, D25 and D29's two.

Plan review pass 6, 2026-10-06, after the owner's ruling:

- **D30 (row 6, accepted, closed):** D28's remaining edge — with the working-tree row already selected and a
  sidebar stash preview (`Sidebar.tsx:521`), opening the Stashes browser and a conflicted Apply/Pop inside it
  (`opsStore.ts:250` → `selectWorkingTree()`, which clears `preview`, `repoStore.ts:512`) leaves `wtSelected`
  true→true, so D28's false→true check doesn't fire and Escape restores the old stash while the grid shows the
  working tree with conflicts. Reasoned from the code, not run; rare (three conditions together). Done §AE then
  holds six items: D18, D22, D25, D29's two, D30.

Plan review pass 7, 2026-10-06, after the owner's ruling:

- **D31 (row 3, accepted):** drops the D26 Linux walk step ("Tab to Branch, Enter, click Branch → the focus is
  not on Branch"). The D26 case — a menu opened by keyboard then closed by clicking its trigger, leaving the
  focus on `<body>` rather than script-focusing the trigger — exists only on macOS WebKit: on Linux WebKitGTK the
  closing click focuses the trigger itself (measured, C1,
  `docs/archive/walks/2026-10-06-linux-track-c-d-walk.md:16-18`), so the step would fail there. The
  `Menu.test.tsx` D26 unit test stands in for it (jsdom behaves like macOS WebKit, not Linux, for a clicked
  button's focus).

Plan review pass 8, 2026-10-06, after the owner's ruling:

- **D32 (row 3, accepted):** the D26 case (menu opened by keyboard, closed by clicking its trigger) is real only on
  macOS WebKit, and BP 3 has no Mac step for it; it stays with the `Menu.test.tsx` D26 unit test (jsdom reproduces
  the macOS condition: a clicked button isn't focused). A Mac walk step was declined: Tab may not reach buttons on
  macOS without Keyboard navigation on (inferred, not checked).

Plan review pass 9, 2026-10-06, after the owner's ruling:

- **D33 (row 4, docs):** G3's §Q row (`open-items.md:507-517`) has hit its own reopen trigger ("a reproduction
  under a window manager"). At the post-gate docs commit, G3 leaves §Q and merges into T15 in `open-items.md` §Z
  (row 4's open-items row): it closes with T15 when BP 4 and the gate check pass; if D4 reverts row 4, it stays
  open there with the measured repro.

Execution, 2026-10-06, the owner's rulings:

- **D34 (row 12, walk):** BP 12 gains a Linux step (`xdotool key alt+2` in History's search box → Changes), so D13's
  Linux half is walked in the app, not only unit-tested. Whether IBus or fcitx claims Alt+digit stays untested (no
  input method under Xvfb).
- **Change review triage:** T1 (a grid row recycled while its menu is open got the old item's tooltip back) fixed —
  the title comes back unless the element emptied (`663d20c`, `57e6b01`, `b765e82`). Accepted, closed: T2 (Alt+digit
  from a field the switch removes leaves the focus on `<body>`), T3 (the "+N more" button's own tooltip can still
  cover the menu), T4 (row 2's optional `Toolbar.test.tsx` test not written), T5 (a commit with an empty author
  name, recycled onto an unloaded one, shows the old tooltip until its page loads). Row 14's `.sh` keeps its
  double quotes (`afe97ad`).
- **D35 (row 4, walk):** BP 4's Linux walk (`docs/archive/walks/2026-10-06-bp-walk.md`) failed 0 of 4 under
  openbox: the row's `title` is confirmed stripped in the DOM, but a one-motion move-and-right-click still shows
  WebKitGTK's own scheduled tooltip with the old text (the Mac passes). Owner's ruling: keep row 4 anyway — T15
  and G3 (`open-items.md` §Z and §Q) stay open with this measurement; the gate's G3 check is a record of a known
  app/WebKitGTK interaction, not a release blocker.
- **D36 (row 2 / W1, Mac walk):** the focus ring seen on the *Fetch options* chevron after a mouse Cancel or
  submit (W1, `docs/archive/walks/2026-10-06-bp-walk.md`) is deferred to an `open-items.md` row (§AE): the idea is
  `focus({ focusVisible: false })`, untested on WKWebView. **Reopen:** the ring is found distracting, or the idea
  is checked.
- **D37 (row 7, walk):** BP 7 failed intermittently on `5392166` (5 of ~30 switch sequences on the Windows VM):
  the reselect/reanchor logic judged a stale "not found" against the walk's post-await `log.complete`, so a late
  result looked like a real miss instead of "not loaded yet". Fixed in `1aa5565` (reselect and reanchor now read
  `complete` from before the `await`); `1aa5565` carries its own reselect test, `b3f6d79` adds reanchor's,
  `34dbdae` a comment fix. The Windows re-walk on `34dbdae` kept the selection 21 of 21 times, 13 of them under
  added CPU load, with a caveat: the losing run's slow status was 781 ms, and this re-walk's load only reached
  about 300 ms, so the race window it exercised may not have been as wide.
- **W2 (Mac walk):** a typed-but-unapplied History search query, dropped by a view switch — accepted, closed (no
  reopen trigger; → `open-items-done.md` §AE).
- **W3 (Windows walk):** the output dock is per window, not per tab — no record kept (the owner's call).
