# T18: script-focused widgets on WebKitGTK — 2026-09-27

The follow-up to the AZ 6 menu bug (`docs/archive/plans/2026-09-26-linux-menu-focus-and-restore-plan.md`, T18): which
other widgets that move focus by script show no focus on Linux? Plan: `docs/plans/2026-09-27-pr18-linux-extras-plan.md`,
item 1.

**Setup:**
- **Build:** a debug build of `1f5fb67` (the `.smoke` identifier), then the same with the fix.
- **Machine:** Ubuntu 26.04.1, WebKitGTK 2.52.6.
- **Driving:** WebDriver on Xvfb for readings. Every key and click was a real X event through `xdotool`.
- **Each reading:** `document.hasFocus()` (true throughout), `document.activeElement`, `:focus-visible`,
  `[data-kbd]:focus`, and its box-shadow. A screenshot of the element was read each time, except where a row says
  otherwise.
- **Positive control:** a Tab onto a toolbar button matched `:focus-visible` and showed the ring, before and after
  the fix.

## What WebKitGTK does

- **In the paths walked, script focus kept the ring when the element losing focus had it:** every chain that started
  with Tab passed. Not always: in the AZ walk a menu opened from a ringed grid still got none
  (`2026-09-26-group-az-linux-walk.md`).
- **Chromium is expected to also count "the last input was a key"** (not measured here; T19 checks it). WebKitGTK
  doesn't. So after any **click**, a key that moves focus by script showed no ring on Linux before the fix.
- **Confirmed once without WebDriver** (a direct launch, X keys, `import`): after a click in the sidebar, ↓ left no
  visible focus in the tree. Only that path was checked directly; the other nine share its mechanism, and all ten
  were re-walked after the fix.

## Before the fix

**Passing:**
- Settings opened with Ctrl+, after a Tab, focus on its Close button;
- the Settings tabs, ←/→ after a Tab;
- the dialog's Tab wrap, both ways;
- Esc back to an opener that was Tab-focused;
- the toast's Dismiss (reached by Tab) returning focus to **Stage all**;
- the palette's input (a text field always matches).

**Failing**, each after a click:

| Path | Code | Seen |
|---|---|---|
| Sidebar tree, ↓ | `Sidebar.tsx:136` | none: the focused row had no ring, and the clicked row kept its tint |
| Changes \| Files tabs, → | `ChangedFileList.tsx:340` | tint only (the selected tab) |
| Settings tabs, → after a click | `SettingsDialog.tsx:332` | tint only |
| Palette, Ctrl+K then Esc → the grid | `CommandPalette.tsx:45` | selection tint only, no focus style |
| A menu opened with Shift+F10, Esc → the grid | `Menu.tsx` `useRestoreFocus` | selection tint only. The menu's items were marked (the AZ 6 fix) |
| Search popover (narrow toolbar), Esc → its button | `SearchPopover.tsx:35` | none |
| Diff line cursor, ↓ in a working-tree diff | `DiffViewer.tsx:423/462` | none: the cursor line had no box |
| A file list emptied by Enter → the sibling list | `FilesColumn.tsx:232` | selection tint only |
| Diff window opened by Enter → its file list | `ChangedFileList.tsx:120` | no focus style (read from the DOM) |
| Diff window, Esc → its opener | `Dialog.tsx:84` | none |

**Not walked:**
- `FileContent.tsx:148/215` (the Files tab's cursor), `Dialog.tsx:94` (the busy refocus) and `FilesColumn.tsx:235`.
  The same mechanism applies, and the shared fix covers them.
- The toast's Retry.

## The fix

`src/lib/kbdFocus.ts` makes the rule explicit, for every widget at once:
- **The flag:** a capture-phase `keydown`/`pointerdown` flag (moved out of `Menu.tsx`; a modifier alone doesn't
  count).
- **The mark:** one `focusin` listener marks the target `data-kbd` when the last input was a key, and unmarks it
  otherwise.
- **The CSS:** every `:focus-visible` rule has a `[data-kbd]:focus` twin in the same selector list, and `base.css`
  has `[data-kbd]:where(:focus)`.
- **The menu:** Menu still sets its own mark after focusing, so a pointer open from a marked opener stays a keyboard
  menu.
- **Gates:** `npm test` 954 passed, `tsc` clean.

## After the fix

Rebuilt from the working tree, then re-walked the same way.

| Path | Seen |
|---|---|
| Sidebar tree, ↓ | **pass**: the focused row outlined |
| Changes \| Files tabs, → | **pass**: ring |
| Settings tabs, → after a click | **pass**: ring |
| Palette Esc → the grid | **pass**: the selected row outlined (the grid's focus style) |
| Menu Esc → the grid | **pass**: the same |
| Search popover Esc → its button | **pass**: ring |
| Diff line cursor, ↓ | **pass**: the cursor line boxed |
| A file list emptied → the sibling | **pass**: the selected row outlined |
| Diff window opened by Enter → its list | **pass**: the selected row outlined |
| Diff window Esc → its opener | **pass**: ring |

**Pointer focus is unchanged:**
- a clicked row, tab or list got no mark;
- a menu opened by right-click opened with its first item unmarked.

**Windows:** the fix is shared, so these paths join the AZ 6 re-walk over CDP (T19). They are expected to look as
before, if Chromium already rings them. Two cases are new there, because the mark is fixed when focus lands; T19
judges them:
- **Tab to a button, then click it:** the ring stays, and a menu it opens opens keyboard-style.
- **Click, then a Ctrl shortcut that moves focus** (Ctrl+, or Ctrl+K then Esc): now ringed. Whether Chromium counts a
  Ctrl shortcut as keyboard input is unverified.
