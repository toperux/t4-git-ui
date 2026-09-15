# Walk: the review fixes over the unpushed range — 2026-09-16

A fresh review of `origin/main..main` (`ae24dde..01235b5`) found three defects. The handoff's rail
override item made a fourth, and the toast timer a fifth. Walked over CDP (`docs/smoke/smoke-cdp.md`)
against a local `tauri build --no-bundle`, launched with `smoke-launch.ps1` in its own WebView2
profile while the installed 0.10.1 stayed open. Repositories: `t4-git-ui` for the rail and the dock,
`c:/tmp/t4/irebase` for the toasts. The fixture's `origin` was pointed at a missing path so that
Ctrl+F5 raised a persistent error toast with no origin, then restored.

## R1 — the rail override latched onto the width

`RepoWindow.tsx` had an effect that dropped the override as soon as it agreed with the width. So a
round trip through the 1000px breakpoint discarded the user's choice. The effect is deleted.
`toggleRail` still hands back to automatic when you toggle to what the width would pick.

| Step | Result |
|---|---|
| Ctrl+Shift+` at 1280 → 990 → 1400 | rail, rail, **rail** (the override holds) |
| Toolbar toggle at 1400 → 990 | sidebar (automatic again), rail (width) |
| Ctrl+Shift+` at 990 → 1400 → 990 | sidebar, sidebar, **sidebar** |
| Toggle at 990 → 1400 → 1280 | rail (automatic), sidebar, sidebar |

The toggle sat at (20, 19.5) and was `aria-pressed` exactly while the sidebar showed, in every row.

## F1 — dragging to select the error text closed the toast

A drag that started in the detail and ended on the title sent its click to the element that holds
both, so `closest(".selectable")` on the click target missed it. The toast now remembers where the
press started.

- Pressing near the end of the detail and dragging onto the title selected
  `fatal: Could not read from remote repository.`, and the toast stayed.
- A plain click on the title still closes it.

## F2 — with no origin, focus fell out of an open dialog

`restoreFocus` returned early when a toast had no origin, which also skipped the dialog fallback.
The fallback now runs when the focus is on `<body>` or on the toast's own button.

- With Settings open, clicking × on an origin-less error toast moved focus to
  `INPUT[Git executable]`, the dialog's first field.
- With the caret in `INPUT[Refs per folder]`, a click on the toast's title closed it and the caret
  stayed there.

## F3 — the heal reopened a dock the user had dragged shut

The first fix closed the store on the first resize that reached the bar. The walk showed two
problems with it:

- **F3-b:** a drag down onto the bar and back up in one press ended shut. Closing the store
  disables the separator under the pointer, so the rest of the drag was ignored. Before that fix,
  the drag ended open.
- **Pre-existing in `01235b5`:** after a drag to shut, expand reopened the dock at 160, not 200.
  On the way down the drag crosses 160 (the minimum) before it snaps to the bar, and that
  crossing was recorded as the user's height.

Reworked so that a gesture is judged once, when it ends: ending on the bar closes the store, and
ending inside 160–320 records the height. Re-walked on a rebuild:

| Step | Result |
|---|---|
| Drag to 250, double-click the separator, collapse, expand | 250 → 200 → 28 → **200** |
| Drag onto the bar | 28, `Expand output`, separator `aria-disabled` |
| Window 800 → 950 high | **28** (no reopen) |
| Expand | **200** |
| Down onto the bar and back up in one press | **200**, `Collapse output` |
| Heal: 420 high, then 800 | 141, then **200** |
| Separator focused, ArrowUp ×3, collapse, expand | 305 → 28 → **305** |

## Smoke group AU step 7

Ticked. Covered by R1 above:
- Ctrl+Shift+` swaps rail and full both ways.
- The toggle never moves: (8, 41) at 1280 in both states.
- Toggle sidebar is the only sidebar control in either state.
- The override holds past 1000 in both directions.

"A new window starts from the width again" was not re-walked here. `railOverride` lives in each
window's own store and is not persisted. The 2026-09-14 walk opened a window with Move to new
window and it started from the width.

## Second round — review of the fixups, and what the first round left unwalked

A second review, this time of the fixups (`01235b5..cc95c3c`), found two things:

- **Rail:** the reviewer reported the latch as a regression. It is R1's deliberate trade: an
  override now holds until the user toggles it back. No code change. But `01235b5`'s message still
  describes the removed effect and has to be rewritten when the fixups are squashed. The plan doc
  is updated.
- **Toast ×, fixed (`7550987`):** with the caret in a dialog's second field, clicking × on a toast
  with no origin moved the caret to the dialog's first field. The × took focus on mousedown and
  unmounted holding it, which counts as adrift. The toast now cancels the mousedown on its buttons
  too, and only the selectable detail keeps its press. From the keyboard the × still holds the
  focus when it unmounts, so the dialog fallback still applies there.

Walked on a build of `7550987` (irebase and t4-git-ui):

| Item | Result |
|---|---|
| Dock heal when a tab closes | 1280×490 with two tabs: dock squeezed to 188 → close the other tab → **200** |
| Enter on the focused dock separator | twice: nothing happens (dock 200, open). Not reproduced, same as 2026-09-15 |
| Row menu (`89123cb`) on HEAD, `other`, `mid`, `side` | no separator leads, trails, or sits next to another; groups are pointer, then cherry-pick/revert, then bisect. HEAD's row drops Merge and Cherry-pick. Its pointer group still has "Rebase interactively from here", so the commit message's "that group drops out at HEAD" only holds for a parentless commit |
| Rail flyout (`ae24dde`), Tags (12) at 990×500 | header 1px below the panel top (the panel's border), its own top border 0; header right = nav right (no notch); nav 190/190 (does not scroll); the section scrolls 520/162, no horizontal overflow (248/248); after scrolling to the end the header is still in place and the last row is visible |
| Smoke: a click on the body | `index.lock` + Unstage all → title, icon, padding each close the toast and put focus back on Unstage all; cursor is a pointer over the toast, `auto` (text caret) over the detail |
| Smoke: the detail stays selectable | drag-select keeps the toast; double-click selects `another ` and the toast stays |
| Smoke: buttons own their clicks | Retry with the lock still there: the toast closes once and exactly one new one appears; with the lock gone: the unstage runs and no toast is left; Pull on a rejected push (`main` diverged from `origin/main`): exactly one Pull dialog |

The rejected push used `-u` and set no upstream; `irebase-origin.git` is unchanged, and the
fixture was restaged to its resting state.

## Not walked

- The update badge: it renders nothing until a check finds a newer version, and the harness cannot
  force that. See `2026-09-15-toast-and-toolbar-fix-walk.md`.
- The toast timer fix (`clearTimeout` on an early dismiss): unit-tested only. There's nothing to see
  in the app.
- **Remove from list** on a dead recent: adding one needs the native folder picker, and the
  recents store is shared with the installed app.
- The × change itself: in the app, only through the unchanged box-a results (the body and icon
  still close the toast and focus returns to the origin). The caret-in-a-second-field case is
  unit-tested (`Toast.test.tsx`). It was not re-walked with Settings open.

## Gates

`tsc --noEmit` clean; `vitest run` 865 passed (75 files).
