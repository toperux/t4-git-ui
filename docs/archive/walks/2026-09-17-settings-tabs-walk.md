# Settings tabs walk — 2026-09-17

`docs/smoke/smoke-test-post-v1.md` group AX (Settings in three tabs), driven over CDP
(`docs/smoke/smoke-cdp.md`) against a local `tauri build --no-bundle` of the uncommitted tabs work,
launched with `docs/smoke/fixtures/smoke-launch.ps1` so its own `WEBVIEW2_USER_DATA_FOLDER` kept the
installed 0.10.4 out of it. Fixture `c:/tmp/t4/irebase`, opened from the last session; viewport
1792 × 929, dark theme. `Diff & merge › Diff tool` had VSCodium configured, so its Command field was
present for the draft check.

Most steps were read out of the DOM rather than eyeballed: for a tab strip the questions are which
panel is visible, which controls are reachable and what the computed tokens are, and those are
exactly what `--eval` answers.

## Results

| Step | Result |
|---|---|
| 1 opens on General | pass — `aria-selected="true"` on General alone, roving `tabIndex` 0/−1/−1, every `aria-controls` and `aria-labelledby` resolving; panels `general` visible / `git` + `diff` `hidden` with height 0; headings `Theme\|Sidebar\|Updates`. The row is outside the scrolling body (`barOutsideBody: true`), pad `6px 16px`, 1px `--border` bottom |
| 2 the other two tabs | pass — Git → `Git executable\|Signing`, height 442, no overflow; Diff & merge → `Diff\|Diff tool\|Merge tool`, height 646. Exactly one panel visible at each step. Signing's own read happens once, at dialog open, because its panel is mounted from the start |
| 3 ←/→ | pass **after finding AX-1** — General → Git → Diff & merge → General, and ArrowLeft back to Diff & merge; `focus` follows `selected` every time |
| 4 Tab trap | pass — from the footer Close, Tab → the title Close → the selected tab, never a control inside a hidden panel. 33 controls match `FOCUSABLE` in the form, 10 reachable on General, 14 on Git, 19 on Diff & merge |
| 5 tool draft | pass — on Diff & merge the Command input is in the DOM and outside `[hidden]`; on General it is still in the DOM, now inside `[hidden]`. The panel is hidden, not unmounted, so the local draft cannot be lost. (`--type` never landed a character — see the note below — so mounted-ness is what was measured, which is the actual guarantee) |
| 6 download locks the row | not walked — needs a publishable newer release. Covered by `SettingsDialog.test.tsx` "a running download locks the tab row" and `updateStore.test.ts` "a progress subscription that never attaches unsticks the UI too" |
| 7 hover keeps the tint | not walked — **finding AX-3** was fixed after this build, so its binary still had the defect |
| 8 light and dark | pass — light: selected pill `rgba(17,24,39,0.09)` with `rgb(26,29,36)` text on the `rgb(197,199,200)` dialog (≈8:1), unselected `rgb(58,62,73)` (≈6:1), hairline `rgb(157,161,166)`. Dark: pill `rgba(255,255,255,0.09)`, hairline `rgb(43,47,56)`. Switched through Settings' own Appearance select and put back to Dark |
| 9 height per tab | pass as intended — dialog 546 → 608 → 812 px, and Diff & merge scrolls (`scrollHeight` 893 vs `clientHeight` 678). See finding AX-2 |

## Findings

### AX-1 — `cdp.mjs` could not send an arrow or a Tab

`--key ArrowRight` moved nothing. A `keydown` listener showed why: the page received
`key: ""`, `code: ""`, `keyCode: 65` — the letter A. `KEYS` in `docs/smoke/cdp.mjs` had `ArrowUp` and
`ArrowDown` but no `ArrowLeft`, `ArrowRight` or `Tab`, so the fallback built `Key${name.toUpperCase()}`
and took `charCodeAt(0)` of the name. Every ←/→ and Tab behaviour in the app was undrivable, not
just this dialog's. Added the three entries; steps 3 and 4 then walked on the same binary.

The lesson for the next walk: when a key does nothing, check what the page *received* before
suspecting the feature. A driver that silently sends the wrong key looks exactly like a broken
handler.

### AX-2 — the dialog changes height between tabs, and one tab still scrolls

Measured 546 / 608 / 812 px, with Diff & merge overflowing its body by 215 px. The `min-height: 380px`
floor on `.panel` only pads General; it does not equalise the three. At this window the Diff & merge
content is 893 px against 678 px available, so no floor can make it fit — only splitting the two tool
sections onto a fourth tab would.

Accepted, not a defect: the point of the change was to group related settings, not to hold one
height, and one tab scrolling 215 px replaces a single column that scrolled roughly three times that.
Recorded as group AX bullet 9 so a later walk does not re-file it. A comment on `.panel` claiming the
floor "keeps the dialog — and Close — still between tabs" was wrong and was corrected to say what it
actually does.

### AX-3 — a hovered selected tab read as deselected (found by review, not by the walk)

`.tab:hover` is specificity (0,2,0) and `.tabOn` is (0,1,0), and both set `background-color`, so
hovering the current tab replaced `--bg-active` (0.09) with the weaker `--bg-hover` (0.05) — erasing
the only cue for which panel is open. `.tab:disabled` sets only `opacity`, so a locked tab lit up as
live too. A sweep for the same pattern found three instances in all: the new
`SettingsDialog.module.css`, the `ChangedFileList.module.css` pair it was copied from, and
`SidebarRail.module.css` (`.btn:hover` vs `.on`, so a hovered open rail section read as closed).
All three now exclude their state, which is the idiom `TabStrip.module.css` already used
(`.tab:not(.active):hover`). Fifteen other selectable components were checked and are clean.

### AX-4 — a failed progress subscription stranded the whole dialog

`updateStore.install()` set `installing: true`, then awaited `onUpdateProgressReady(...)` *outside*
its `try`/`finally`. A rejected subscription skipped the `finally`, left `installing` true for the
rest of the session, and `getUpdate()`'s `void install()` swallowed the rejection. `busy={installing}`
already disabled Close and Esc, so the dialog was unclosable; with the tab row disabled on the same
flag it became completely inert. Fixed at the root — the await moved inside the `try`, `unlisten`
guarded — with a test that fails without it.

## Note on measuring themes

The first attempt at step 8 flipped `data-theme` on `documentElement` from `--eval` to avoid writing
the user's preference. It produced nonsense: `dialogBg` and the hairline changed but the pill's
background and foreground came back byte-identical in both themes, because the custom properties the
pill reads did not re-resolve. Those numbers were discarded. The real comparison went through
Settings' own Appearance select and was set back to Dark afterwards — which does persist to the
shared app data dir, so it has to be put back.
