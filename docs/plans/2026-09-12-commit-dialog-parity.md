# Plan: commit panel ↔ commit window parity

Executed and walked 2026-09-12 (results at the end). Findings are from reading the code; the "verify" column
says what to confirm in the running app before/while fixing (CDP recipe, `docs/smoke-cdp.md`,
needs the app relaunched with the debug port).

## How the two surfaces relate

Both mount the **same components** on the **same stores**:

| | `CommitPanel` (pane) | `CommitDialog` (window) |
|---|---|---|
| lists | `FilesColumn` = `UnstagedFiles` + `StagedFiles`, side by side with the message column | same two, stacked in a vertical resizable group (`dialogs/CommitDialog.tsx:23-27`) |
| message | `MessageColumn onExpand=…` | `MessageColumn autoFocus onCommitted={onClose}` |
| diff | `DiffColumn` | `DiffColumn` |
| sync | `useCommitSync(wtSelected \|\| commitOpen)` in `RepoWindow.tsx:50` | same call |

So the behaviour is identical *inside* the components. Every gap below comes from one thing:
the dialog is a `position: fixed` scrim at **`z-index: 40`** (`Dialog.module.css:5`), and
anything portalled to `<body>` with a lower z-index renders **underneath it** even though it is
"open", focused and receiving keys.

## Gaps

| # | Gap in the window | Root cause | Fix | Verify |
|---|---|---|---|---|
| 1 | **Right-click / Shift+F10 / Menu key on a row: no menu appears** (the reported bug). The menu focuses its first item on open (`Menu.tsx:69`), so the list very likely looks "dead" until Escape — unverified, confirm in the walk. Also loses: Keep ours/theirs on conflicts, Copy path, Open, Reveal from the row. | `ContextMenu` portals to body with `.fixed { z-index: 35 }` (`Menu.module.css`) — under the scrim. | Raise `.fixed` above 40. `Input`/`CommandInput` portals already use **45** for exactly this reason (comment in their CSS). | right-click a row in the dialog → `[role=menu]` visible, `elementFromPoint` on its first item hits the item; Keep ours on `UU dir/a.txt` works. |
| 2 | **Every toast is invisible while the dialog is open**: "Commit failed" (+Retry), "Couldn't stage/unstage/discard" (+Retry), "Couldn't open/reveal", "Opened … in editor", "Couldn't restore the conflict". A failed commit in the window shows *nothing*. | `Toast .stack { z-index: 30 }` (`Toast.module.css:8`) — under the scrim. | Raise the stack above 40 so the toast layers **on top of** the open dialog, where it fires. It is top-centre under the toolbar, so it partly covers the dialog's title bar while shown — **decided: accepted**, no repositioning. | plant `index.lock`, click Commit in the dialog → toast visible; Retry works. |
| 3 | Conflict rows: **Keep ours/theirs only via the diff column**; the banner strip (`StateBanners`) is covered. | #1 for the row menu; banners are outside the dialog by design. | #1 restores the row menu. Banner buttons (Abort / Continue / Skip / Checkout default) stay panel-only — the window is a *commit* surface, Commit already commits the merge. **Decided: out of scope.** | after #1: Keep ours from the row menu in the dialog. |
| 4 | **z-index is hard-coded in six places** (Menu 35, Toast 30, Input 45, CommandInput 45, Dialog 40, BusyOverlay 50). Nothing stops the next portal from landing under the scrim again. | no layer scale. | **Decided: no tokens.** Two numbers (#1, #2), each with a one-line comment naming the scrim (40) like the Input/CommandInput ones already do. Tokens only if a third portal lands under the scrim. After the change four portals tie at 45 (ContextMenu, Toast, Input listbox, CommandInput); ties resolve by DOM order, the toast stack mounts first, so a menu opened *under* a toast paints over it — geometrically rare, accepted, say so in the comment. | tsc + existing tests. |

### Checked, no gap (kept for the record)

- Keyboard in lists: ArrowUp/Down, Home/End, Enter, Delete, Ctrl+A, Shift+F10 / ContextMenu key —
  same handler (`FilesColumn.tsx`), fires in both. Only the menu's *rendering* is lost (#1).
- Escape: the row `ContextMenu` and the recent-messages `Menu` stop Escape (`Menu.tsx:95-101`), so
  Escape closes the menu first, the dialog second. Escape with nothing open closes the dialog —
  intended; in the pane it does nothing.
- Enter in the summary field: `<form>` implicit submit → `preventDefault`, no `onSubmit`, and every
  `Button`/`IconButton` defaults to `type="button"`, so no stray "Stage all" click. Ctrl+Enter =
  commit in both (`MessageColumn` handler).
- Commit & Push in the window: `returnFocus` is read *before* `onCommitted` closes the dialog, then
  the Push dialog opens (`MessageColumn.tsx`). Push replaces Commit — intended.
- Recent-messages dropdown: `position: absolute; z-index: 20` *inside* the dialog DOM — not a
  portal, unaffected by the scrim. Clipping by the panel `overflow: hidden` is the same in both.
- Tab trap: only the dialog's own subtree; a portalled menu closes itself on Tab (`Menu.tsx:108`).
- Double-click row, folder toggle, folder right-click selecting the subtree, Stage all/Unstage all,
  `DisabledHint` titles, diff actions (stage/discard hunk + lines, resolve, restore conflict with the
  native confirm) — same code, no portal involved.
- Open-window button: only in the pane (`onExpand` not passed in the dialog) — by design.
- BusyOverlay (50) still covers toasts during a busy action. Error toasts persist until dismissed,
  so they surface once the overlay lifts. Pre-existing in both surfaces, out of scope.

### Not checked (needs the running app)

- Native `ask()` confirm (Discard…, Restore conflict) from *inside* the dialog: modal OS dialog, then
  focus should land back in the list, not on `<body>`. `Dialog`'s refocus effect only runs on `busy`
  changes (`Dialog.tsx:72-79`).
- Any layout jog when the toast lands over the dialog title (#2).
- Tab out of a row menu inside the dialog: `Menu` closes on Tab without stopping propagation
  (`Menu.tsx:108`), the dialog's trap then sees an active element outside its subtree and only acts
  on Shift+Tab; the menu's close effect refocuses the opener when focus is lost (`Menu.tsx:88-90`).
  Should recover; confirm focus ends on the row, not `<body>`. Same code in the pane, not a parity gap.

## Execution shape (after refinement)

1. `Menu.module.css` `.fixed` 35 → 45, `Toast.module.css` `.stack` 30 → 45, comment on each.
   No unit test: vitest runs jsdom without a `css` option, so CSS modules are not applied and a
   computed z-index assertion cannot see them; a file-grep test would only pin two numbers. The
   CDP walk (step 2) is the check.
2. CDP walk on `c:/tmp/t4/qwalk` (fixture exists, `UU dir/a.txt`, ` M other/c.txt`,
   `?? dir/sub/d.txt`): #1, #2, #3 and the three "not checked" rows, in the dialog *and* the pane.
3. Commit; no push until asked.

Decisions taken 2026-09-12: #2 toast on top of the dialog, overlap accepted; #3 banners out of scope; #4 plain numbers.
Audit 2026-09-12 folded in: unit test dropped (jsdom has no CSS), tie at 45 accepted, Tab-out-of-menu added to the walk, BusyOverlay noted as out of scope. A premature copy of step 1 was reverted; the tree holds only this plan.

## Walk results (2026-09-12, `--no-bundle` build over CDP on `qwalk`)

| # | Result |
|---|---|
| 1 | **Pass.** Row menu in the window at z 45, hit-testable, focused; Shift+F10 too. Before the fix the menu did open focused under the scrim, so the "looks dead" reading was right. |
| 2 | **Pass.** `index.lock` planted, *Stage all* in the window → "Stage failed … Retry" toast on top of the dialog (covers the right end of the title band only); lock removed, Retry staged both files and dismissed the toast. |
| 3 | **Pass.** *Keep main's version* from the row menu in the window → native "Resolve conflict" confirm → conflict gone; focus back in the window's unstaged list. (Labels name the sides, not "ours".) |
| — | Tab out of the row menu in the window: menu closes, focus lands on the list's resize handle inside the dialog, dialog stays. Fine. |
| — | Native `ask()` from inside the window: covered by #3, focus returns to the list. |
| — | **Found and fixed:** Escape on the row menu inside the window closed the menu *and* the window. `ContextMenu` had no Escape handler of its own — the dropdown `Menu` does (`closeOnEscape`) — so the key bubbled up React's tree, through the portal, to the `Dialog` form. `onMenuKeyDown` now stops Escape (`Menu.tsx`), with a unit test (`Menu.test.tsx`, fails without the fix). Re-walked: Escape closes the menu, focus stays in the dialog, a second Escape closes the dialog; pane unchanged. |
| — | Observation, not fixed: clicking a toast's *Retry* while the window is open drops the focus to `<body>` (the button vanishes with the toast). Same in the pane; toasts are mouse targets. |

Gates: tsc clean, vitest 651 passed. Fixture removed, recents restored. Not pushed.

