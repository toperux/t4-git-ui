# Walk: the toast's detail, the toast's focus, and the toolbar's two uncounted members

Walked 2026-09-15 over CDP against a local `tauri build --no-bundle`, on the working tree above
`c12a5dd`. Three defects, all found by reviewing the five unpushed commits rather than by using the
app; each was reproduced in the running app before it was fixed, and re-walked after.

The repo under test was `t4-git-ui` itself (repo name 53px, so the toolbar's `full` floor is
1168 + 53 = **1221** — that number matters below).

## R1 — the toolbar's width model counted neither the history chip nor the update badge

`2db492d` sized the toolbar as "a flat base plus the rendered repo name", on the premise that every
other control is fixed width. Two members break it: the file-history chip, which renders at its
220px `max-width`, and the update badge. Neither can shrink, and neither was in the model, so the
tier stayed `full` while the row no longer fitted.

Reproduced by right-clicking a file in **Changed files** → **History**, then narrowing:

| inner width | toolbar clipped by | controls pushed offscreen |
|---|---|---|
| 1400 | 0 | 0 |
| 1300 | 94px | 4 |
| 1240 | 154px | 5 |
| 1221 (the `full` floor) | 173px | 5 |
| 1190 (`tight`) | 0 | 0 |

Refresh, the theme toggle and Settings were what went over the edge — the same failure the 1168 base
was introduced to eliminate, reintroduced by members the base does not know about.

**Fixed** by giving `toolbarTierFor` an `extras` term and reserving `HISTORY_CHIP_W` (228 = the
chip's 220 `max-width` plus its 8px margin) while the chip is on screen. Reserved at the chip's full
width rather than net of the search box's give, because when the badge is up that give is already
spoken for; and reserved at every tier rather than only the ones that show the chip, because an
extra that came and went with the tier would flap between two.

Re-walked, same filter on:

| inner width | chip | search | clipped | offscreen |
|---|---|---|---|---|
| 1400 | 220 | 102 | 0 | 0 |
| 1300 | 220 | 102 | 0 | 0 |
| 1240 | 220 | 102 | 0 | 0 |
| 1221 | 220 | 102 | 0 | 0 |
| 1190 | — | — | 0 | 0 |

At 1190 the row folds to `icons` and the chip moves inside the search popover, which is why it stops
being measurable there — and it matches the model: with the chip reserved, the `tight` floor is
930 + 53 + 228 = 1211, so 1221 is `tight` and 1190 is `icons`.

**The badge is deliberately not reserved**, and the first version of this fix got that wrong. It
reserved 96px for the badge as well, on the assumption that it was the same kind of uncounted member
as the chip. It is not: `.search` carries `min-width: 120px` against its 240px width, with a comment
saying in as many words that the give exists so "the Update badge pushes Settings past the window
edge at 1280" does *not* happen, and step 9 of smoke group AU walked exactly that case with a
same-size stand-in — search 240 → 192, Settings still inside the window.

So reserving the badge would have dropped the toolbar to `tight`, hiding the operation labels,
at widths where the row demonstrably still fits. Reserving the chip alone also covers the case where
both are up (228 ≥ 228 + 96 − 120 of give), so the badge term was pure cost and was removed.

The badge case remains **unwalked** rather than unverified-by-argument: `UpdateBadge` renders nothing
until a check has found a version, which cannot be forced from the harness. The evidence above is the
CSS's own stated intent plus the earlier group AU walk, not a fresh measurement.

## T1 — a double-click in a toast's detail dismissed the toast

`f8e53d8` made the whole toast a dismiss target, guarded by `window.getSelection()`. The guard only
survives a *drag*-select: a double-click's first click still has a collapsed selection, so the toast
closed on click 1 and `dblclick` never arrived. Selecting a word to copy was impossible.

Walked: `Copy SHA` → toast with the SHA as its detail → double-click the detail → **toast gone,
nothing selected**.

**Fixed** by taking the detail out of the dismiss target entirely (`closest("button, .selectable")`),
which drops the selection guard and covers drag-, double- and triple-click alike. The title, the
icon, the padding and the action row still dismiss.

Re-walked: toast survives, `c12a5dd79a3d1e95e8a7d29b4e310d781dac1ace` selected.

## T2 — dismissing a toast moved the focus into an open dialog

`dismiss` → `restoreFocus(origin)`, and for an info/success toast `origin` is `undefined`, so the
`else if (dialog) firstDialogField()?.focus()` branch ran — a toast with nothing to restore moved
the focus anyway. Pre-existing for the `×`, but the hit target had grown from a 24px button to the
whole 360px toast, so it became easy to hit by accident.

Walked: Settings open, focus on **Close**, a `Copied SHA` toast on screen → click the toast body →
focus **jumped to `INPUT[Git executable]`**, the dialog's first field.

**Fixed in two parts**, because the first fix left a smaller version of the same problem:

1. `restoreFocus` returns early when there is no `origin`, so an origin-less toast moves the focus
   nowhere. Re-walked: no jump — but the focus landed on `BODY`, because a mousedown on a
   non-focusable div blurs whatever held the caret. The harm was gone; the caret was still lost.
2. The toast cancels its own mousedown unless the press is on a button or the selectable detail, so
   the focus never leaves the field in the first place.

Re-walked with the caret actually in a field: focus `INPUT[Git executable]` before the body click,
`INPUT[Git executable]` after, toast dismissed.

## Harness

`cdp.mjs` gained `--click`, `--rclick`, `--dblclick` and `--seltext` (real CDP mouse events, not
synthetic ones — the distinction that made the dock's double-click unprovable in the previous walk).

Two things that cost a run each, worth knowing next time:

- **The toast stack sits top-centre, over the first grid rows.** A right-click aimed at row 2 or 3
  while a toast is up hits the toast instead. Dismiss first, or aim at a lower row.
- **Selecting a commit repopulates Changed files asynchronously.** Right-clicking the first file
  500ms later found no row and opened no menu; 1500ms is enough. The walk script now dumps the
  menu's items when the one it wants is missing, rather than dying on a missing selector.

## Gates

`tsc --noEmit` clean; `vitest run` 862 passed (75 files) — 860 before, plus one new toolbar-tier case
and one new toast mousedown case, with the old selection test rewritten in place.
