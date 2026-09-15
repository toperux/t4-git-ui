# Pane resize walk — 2026-09-15

The `preserve-pixel-size` change ("resizing the window moves only the commit grid and the diff"),
walked over CDP against a local release build of the working tree, `mbk-portal` open in History view.

Driven by a hand-rolled CDP script rather than the Playwright MCP server: `browser_resize` calls
`page.setViewportSize`, which installs a device-metrics emulation override that pins the viewport and
leaves the window unable to reflow — `Emulation.clearDeviceMetricsOverride` does not lift it
(Playwright re-applies), only a `0×0` `setDeviceMetricsOverride` does. That cost an hour earlier in
the session. Real window changes go through `Browser.getWindowForTarget` → `Browser.setWindowBounds`,
converging on an exact CSS viewport because the bounds count the frame and `innerWidth` does not.

Sizes below are `offsetWidth`/`offsetHeight` of `[data-panel]` — the same quantity the library sums.
Group them by `parentElement`, not by a `data-panel-group` attribute: the groups are marked
`data-group`, and a wrong attribute guess reports an empty walk that reads like a passing one.

## Results

| Step | Result |
|---|---|
| 1 Baseline 1280×800, fresh launch | pass — sidebar **260**, details **340**, files **320**, dock **28**, exactly as authored |
| 2 Widen to 1600×800 | pass — sidebar/details/files unmoved, diff 345 → **665**, the whole +320 |
| 3 Heighten to 1600×1000 | pass — grid 296 → **496**, the whole +200; details pane and dock unmoved |
| 4 Drag sidebar to 320, widen to 1800 | pass — sidebar holds **320**, the +200 lands in the diff |
| 5 Narrow 1100 → 1000 → 800 → 700×500 | pass — no overflow at any width, diff alone shrinks to its 200 floor, then details gives way first (DOM order), rail takes over below 1000 |
| 6 Dock at the 700×500 floor | pass — dock stays open at **160**, does not self-collapse (see finding 3) |
| 7 Dock collapse/expand/resize (re-walk of K14) | pass — collapse 28, expand back to its dragged 160, and **160 held across a window resize**; this is the case that drifts before the change |
| 8 1000×1000, 2col details tier | pass with a note — nested details/files split 141/80 on a short details pane; files sits on its 80 min (finding 4) |
| 9 Changes view, widen 1000 → 1400 | pass — files **220** and message **305** unmoved, diff takes the whole +400 |
| 10 Sidebar hogging: 560 max, forced visible, narrow to 700 | pass — content pinned at exactly **440**, sidebar walks back 560 → 555 → 255; nothing beside it collapses |

Step 6 was walked without a second tab open, so the tab strip was not present. It costs 33px of the
main area; at 700×500 the dock had 160 with ~78px of slack above the panes' squeeze point, so the
strip does not change the outcome.

## Findings

**1. Panes do not recover an authored size once squeezed — by design, and bounded.** `preserve-pixel-size`
keeps whatever size a pane currently has, so a column squeezed below its authored width while the
window was narrow (files 320 → 220, message 340 → 305 at 1000px) keeps the squeezed value when the
window grows again. The details pane's *height* behaves the same way, and is decided by the window
height at mount.

This is the requested behaviour, not a defect, and it is self-limiting: switching History ↔ Changes
re-mounts the rows group and re-derives everything. Verified — after a switch at 1400×1000 the split
returned to a true 60/40 (519/346) with details/files back at **340/320**. Nothing is stuck until a
restart; a single Alt+2/Alt+1 restores it.

**2. The dock's toggle is disabled until an op has run** (`OutputDock.tsx:38`, `disabled={!last}`).
A dock check that opens it by clicking reports three silent no-ops before you notice the panel never
moved. Run something first — `Ctrl+Shift+R` → `status` is read-only and enough.

**3. At 700×500 with the dock open, grid and details both sit at 117**, under their 120 minimums.
Pre-existing: a layout applied as `flexGrow` ratios cannot overflow, so when the pixel minimums stop
fitting every pane is squeezed proportionally. `scrollWidth - innerWidth` was 0 at every size walked,
and no panel reached 0.

**4. The nested 2col details/files split is tight on a short details pane.** With the pane at 226px the
`"50%"` details panel resolved to 141 and files sat on its 80 min. Acceptable — it is a tier only
reachable below 1100px — and `defaultSize={180}` remains the fallback if it proves cramped in use.

## Not walked

Dialogs (`CommitDialog`, `DiffDialog`, `StashesDialog`) keep the proportional behaviour; scope was the
main window. Nothing here is unit-testable: jsdom reports `offsetWidth`/`offsetHeight` of 0, so the
library's zero-size guards fire and the pixel-vs-relative branch is unreachable by construction — the
same reason the structurally identical dock fix has no unit test
(`docs/archive/walks/2026-09-06-group-k-walk.md:37`).
