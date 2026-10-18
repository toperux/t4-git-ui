# Plan: diff viewer polish — the hunk header at the top, a click moves the blame cursor, full hunk headers

_Written 2026-10-17. Status: decisions D1–D7 taken with the owner 2026-10-17; review passes 1–7 taken, pass 7 found
nothing (the drill-down added as S2b in pass 1); step 14's re-walk narrowed to code/test conflicts (owner, after pass
7); pass 8's README finding and the anchor plan's pass-8 F1/F2 applied; pass 9 found nothing; pass 10's 1 finding taken;
pass 11's 1 nit taken; pass 12 found nothing: final; T1–T3 listed for triage; executed 2026-10-17 (BU walked on
Windows, rows 10, 11, 12 and 14 walked again after two fixes; T1–T3 and the review's findings ruled by the owner);
squashed into `f2d5089`…`944bf0d` and `1471247`, records next; archived._

**Goal:** three rows of `open-items.md` §AN, found on the way in the #32 walk
(`docs/archive/walks/2026-10-16-npm-group-32-walk.md`, *Seen on the way*, its bullets 1, 2 and 6), plus one the owner
added in review:

- **S1.** Moving the staging diff's cursor up shows the hunk's `@@` header, not just the changed line (§AN bullet 1).
- **S2.** A click on a line in the file content view (History › Files, Blame on) moves the blame cursor there, as a
  click in the staging diff does (§AN bullet 2).
- **S2b.** A blame drill-down (the gutter click, Enter, *Select in graph*) lands on the clicked line in the commit it
  opens, with the cursor on it and the focus in the view, instead of line 1 at the top (owner, review pass 1).
- **S6.** The staging diff shows its hunk headers in full; the hover buttons stop taking width while hidden (§AN
  bullet 4).

§AN bullet 3 (the scroll position kept in pixels across a reload) and the per-tab view choice are separate plans.

Terms used below:
- **Staging diff:** `DiffViewer` with `actions`, rendered by `DiffColumn` in the Changes view (`CommitPanel.tsx:62,
  73`), the Commit dialog (`CommitDialog.tsx:37`) and the Stashes dialog's working-tree preview
  (`StashesDialog.tsx:225`). Always unified.
- **Read-only diff:** `DiffViewer` without `actions`, through `CommitDiff` (`DetailsPane.tsx:132-157`): the details
  pane, the diff dialog (`DiffDialog.tsx:33`) and the Stashes dialog's stash preview. Unified or split.
- **Content view:** `FileContent`, the Files tab's right side, also through `CommitDiff` (`DetailsPane.tsx:144`), so the
  same three places.
- **Pick:** an add or del row of the staging diff, the rows the keyboard cursor walks (`DiffViewer.tsx:147-150`).
  Context rows and hunk headers are skipped.
- **Cursor:** the roving tab stop (`tabIndex=0`, `data-cursor`) of the staging diff's picks or of the content view's
  blamed rows. It is drawn as `:focus-visible` / `[data-kbd]:focus`, so a mouse click focuses it without a ring.
- **Drill-down:** `blameAt(oid, path)` (`actions.ts:194-229`): select a blame hunk's commit in the grid and show the
  file there in the Files tab, blame on.

S1, S2 and S6 land in `DiffViewer.tsx`, `FileContent.tsx` or `DiffViewer.module.css`, which all the places above share.
S2b also touches `actions.ts`, `diffStore.ts` and `api/types.ts`, and the blame parser in
`crates/git-core/src/blame.rs` (D6 (b)).

## What's there today (read from the code at `266fc96`)

### S1 — the cursor at the top edge hides the hunk header

- **Seen** (walk, measured): moving back up, the view stops at the first changed line with scrollTop 84, so the hunk's
  header and context lines 7–9 stay off-screen. 84 px = the header (24 px, `HUNK_ROW_H`, `diffRows.ts:5`) plus 3
  context rows of 20 px (`LINE_ROW_H`, `:6`).
- **Cause:** `DiffBody`'s cursor effect (`DiffViewer.tsx:437-443`) calls `virtualizer.scrollToIndex(cursorRow,
  { align: "auto" })`. In `@tanstack/virtual-core` 3.19.2 (`dist/esm/index.js:1084-1109`), `auto` aligns a row above
  the view to the view's top edge and does nothing for a row in view. The cursor only lands on picks, so the header
  and context rows above a hunk's first pick are never scrolled to.
- **Not only at a row boundary** (review pass 1, reasoned): after ↓, `auto` leaves the view at `row.end - height`,
  off the 20 px row grid, and a wheel scroll leaves it anywhere. So ↑ reaching a hunk's first change often finds that
  row partly visible and its `@@` row cut off, with no scroll at all.
- **How many rows sit above a first pick:** the header plus the context lines, which are a setting: Settings' diff
  context, 0–99, default 3 (`settingsStore.ts:14-20`; sent with every diff at `diffStore.ts:150-158`, default
  `:222`). A fixed margin of 84 px covers the default only.
- **What moves the cursor** (each re-runs the effect when `cursorRow` changes):
  - ↑ / ↓ (with or without Shift) in `onBodyKeyDown` (`:161-195`);
  - a click on a pick, `onLineClick` (`:131-139`);
  - a hunk button, which first moves the cursor onto the hunk (`:201-211`);
  - the carry-over after a reload (`:109-130`), and the reset to 0 on another file.
- **Focus rules kept as they are:** the effect scrolls and refocuses only while the diff already holds the focus
  (comment `:424-428`); the `[rows]` effect (`:444-452`) takes a lost focus back without scrolling.
- **Row heights are exact:** `estimateSize` is `rowHeight` (24 / 20) and nothing calls `measureElement`, so the
  virtualizer's `measurementsCache[i].start` / `.end` are the rows' real offsets (reasoned from the code). The cache
  is rebuilt lazily: `measure()` bumps `itemSizeCacheVersion`, and only the next `getMeasurements()` (through
  `getTotalSize()` or `getVirtualItems()`) refreshes `measurementsCache` (`index.js:632-667`).
- **The view's height:** `virtualizer.scrollRect` comes from a border-box observer (`index.js:51-62`), so it includes
  a horizontal scrollbar. The region's `clientHeight` doesn't.

### S2 — a click in the content view doesn't move the blame cursor

- **Seen** (walk, measured): a click on line 3's text didn't move the cursor; the first ↓ took the focus at line 2.
- **Cause:** `ContentLine` (`FileContent.tsx:235-282`) has no click handler on the row. The cursor moves by
  ↑ / ↓ (`:175-182`) and by a right-click, whose `openMenu` sets it (`:161-166`, found through `data-line`,
  `:168-173`). A left click on the text only focuses the row: rows are `tabIndex=-1` (`:259`), so the mousedown
  focuses the clicked row while `cursor` still names the old one, and the next ↓ moves from the old one.
- **The staging diff, for comparison:** `onClick` on a pick row (`DiffViewer.tsx:593, 602`) → `onLineClick` sets the
  selection and the cursor (`:131-139`). Shift+click's mousedown is prevented so it extends the line selection, not the
  text selection (`:603-604`); a plain click leaves the browser's text selection alone.

### S2b — a drill-down starts the new view at line 1

- **The entry points:** the gutter's `onClick` (`FileContent.tsx:271`), Enter on the cursor row (`:183-188`) and the
  hunk menu's *Select in graph* (`:301`) all call `blameAt(hunk.oid, hunk.origPath ?? path)`. *Blame parent* (`:311`)
  calls it with the hunk's `previous` commit and path.
- **What happens** (read from the code, not walked): `blameAt` reveals the commit in the grid; the details pane then
  reloads the diff store for it. `diffStore.load` sets `content: null` (`diffStore.ts:258-281`), so `FileContent`
  renders no body (`FileContent.tsx:71-91`) and `ContentBody` unmounts. It comes back when the new content arrives,
  with `cursor` 0 and scrollTop 0 (`:125, 134-139`). The focused row was removed with it, so the focus is on `<body>`.
- **Only a hunk of the commit already on screen** keeps the view: `blameAt`'s `onScreen` (`actions.ts:200`) is a hit
  that loads nothing, and `selectTreePath` on the same path returns at once (`diffStore.ts:367`).
- **Renames:** the drill-down opens the file under the hunk's `origPath`, its name at that commit.
- **Where the clicked line is in the older commit:** git knows it exactly. Porcelain's hunk header is `<oid>
  <orig-line> <final-line> <num-lines>`, and a group is contiguous on both sides. The parser reads `<orig-line>` and
  drops it (`blame.rs:241`), so `BlameHunk` (`blame.rs:38-53`, `types.ts:490-505`) has no field for it. The same line
  number can name another line there when lines were added or removed above it since.

### S6 — hidden hover buttons cut the hunk header short

- **Seen** (walk, measured): "@@ -7,7 +7,7 @@ fil…" in the Changes view; the staged list showed its header in full.
- **Cause** (reasoned from the CSS, not measured with devtools): the hunk row is a flex row (`.hunk`,
  `DiffViewer.module.css:221-234`). The header is `.grow` (`:235-239`: `flex: 1`, `overflow: hidden`, ellipsis). Its
  buttons, `.hunkActions` (`:241-250`), are in the flow at `opacity: 0` until `:hover` / `:focus-within`, so they take
  their width all the time. The unstaged list has two buttons (Stage hunk, Discard hunk), the staged list one
  (Unstage hunk), which fits the walk seeing the staged header whole (reasoned).
- **Markup:** `UnifiedRowView` (`DiffViewer.tsx:562-579`); `.hunkActions` is rendered only with `actions` and not
  `wholeFile`. Split rows (`:631-636`) and read-only unified rows have no buttons, so they are already full width.
- **Shared class:** `.grow` is also the "N lines selected" label of the selection bar (`DiffViewer.tsx:349`), so the fix
  must leave `.grow` alone.
- **Tokens:** `--diff-hunk-bg` is opaque in both themes (`tokens.css:102, 179`), so an element painted with it hides the
  text under it.
- **Narrowest pane:** every diff column has `minSize={200}` px (`CommitPanel.tsx:61, 72`, `CommitDialog.tsx:36`,
  `DiffDialog.tsx:32`, `StashesDialog.tsx:224`).

## Design

### S1 — on ↑, bring the hunk header into view (D1 (B), F1 (a))

1. **A "moved by ↑" ref in `DiffBody`.** The region's `onKeyDown` (`DiffViewer.tsx:462`) sets `upKey.current =
   e.key === "ArrowUp"` (with or without Shift), then calls `DiffViewer`'s handler. The region's `onMouseDown` clears
   it, so an ↑ that moved nothing (the first pick) can't leak into the next click. The `[rows]` effect (`:414-417`)
   clears it too, so it can't leak into a later reload; it is declared before the cursor effect and so runs first in
   a commit with new rows. The cursor effect clears it after reading it.
2. **In the cursor effect** (`:437-443`), when `upKey` was set:
   1. Call `virtualizer.getTotalSize()`, which refreshes `measurementsCache` after a `measure()`.
   2. Find the cursor's hunk header: walk `rows` back from `cursorRow` to the first `kind === "hunk"`.
   3. Read `top` = the header's `start`, `bottom` = the cursor row's `end`, `view` = `virtualizer.scrollOffset ?? 0`
      (public, `index.d.ts:114`), `height` = `scrollRef.current.clientHeight` (no scrollbar).
   4. If the header isn't wholly in view (`top < view`) and header-to-cursor fits (`bottom - top <= height`):
      `virtualizer.scrollToOffset(top)`. The header lands on the top edge, the cursor below it in view.
   5. Otherwise, and for every other move: as today, `scrollToIndex(cursorRow, { align: "auto" })`.

Sketch, about fifteen lines:

```ts
// In DiffBody: const upKey = useRef(false); the region's onKeyDown sets it, its onMouseDown clears it.
const up = upKey.current;
upKey.current = false;
if (up) {
  virtualizer.getTotalSize(); // refreshes measurementsCache after a measure()
  const m = virtualizer.measurementsCache;
  let h = cursorRow;
  while (h > 0 && rows[h].kind !== "hunk") h--;
  const view = virtualizer.scrollOffset ?? 0;
  const height = root.clientHeight;
  if (m[h].start < view && m[cursorRow].end - m[h].start <= height) virtualizer.scrollToOffset(m[h].start);
  else virtualizer.scrollToIndex(cursorRow, { align: "auto" });
} else virtualizer.scrollToIndex(cursorRow, { align: "auto" });
```

What it does in practice (reasoned):
- **↑ onto a hunk's first change** with its `@@` row cut or off-screen: the header and its context come into view.
  The walk's case: scrollTop 0 instead of 84. The same when the first change is still partly visible (*Not only at a
  row boundary* above).
- **↑ inside a hunk** whose header is above the view: the view moves up to the header as soon as header-to-cursor
  fits, even with the cursor still in view. Within a hunk that fits, the header therefore stays in view on ↑.
- **↑ out of the top edge into the previous hunk's last change:** the view jumps to that hunk's header when it fits,
  so the whole hunk from its header down to the cursor shows. The jump is at most one view's height.
- **↓:** never reveals (the ref is ↑ only); as today.
- **A click:** never reveals (the mousedown clears the ref); as today, at most the 20 px to bring a cut-off row in
  whole. A double-click on a word near the top edge stays on its line.
- **The carry-over after a reload** (staging, a hunk button, an outside edit): never reveals, since the `[rows]` effect
  clears the ref; as today. The scroll-anchor plan changes this path (*Overlap* below).
- **A hunk taller than the view** (header-to-cursor over `height`): the cursor stays pinned to the top edge, as today,
  until header-to-cursor fits; on that press the header jumps to the top once.

Edge cases:
- **Split view:** no cursor; staging forces unified (`DiffViewer.tsx:97`). Unchanged.
- **Read-only unified diff:** `onBodyKeyDown` returns early without `lineActions` (`:163`), so ↑ moves no cursor and
  the region scrolls as before. The ref may be set, but the effect only runs on a `cursorRow` change.
- **Context 0:** the header sits right above the first change; the rule still applies.
- **Shift+↑:** stops at the hunk's edge (`:170`); inside the hunk the same rule applies.
- **A pane shorter than header + cursor:** fails the fit test, falls back to today.
- **Focus:** `focusCursor` keeps `preventScroll` and its next-frame retry for a row that only mounts after the scroll
  (`:431-436`).
- **`scrollToOffset` and the reconcile loop:** `scrollToOffset` sets `scrollState.index = null`
  (`virtual-core index.js:1110-1124`), so the virtualizer's reconcile doesn't pull the view back to the cursor row
  (reasoned from the library code).
- **The content view** gets nothing: it has no hunk headers (see *Not in this plan*).

### S2 — a click on a blamed row moves the cursor (D2 (a), D3 (a))

`ContentBody` (`FileContent.tsx:200-217`) gets an `onClick` on the region beside `onContextMenu`, by the same
`data-line` lookup:

```ts
function onClick(e: MouseEvent<HTMLDivElement>) {
  const line = (e.target as HTMLElement).closest<HTMLElement>("[data-line]")?.dataset.line;
  if (line !== undefined) setCursor(Number(line) - 1);
}
```

- **Where it applies:** `data-line` exists only on blamed rows (`:258`). With blame off, or on a row past the last hunk
  (`blameRows.ts:21-22`), a click does nothing, as today.
- **The gutter (D2 (a)):** its click bubbles to the region, so it also moves the cursor, then the drill-down runs.
  That is the right-click's behaviour already (`openMenu` → `setCursor`). On the commit already on screen nothing
  reloads, and the cursor stays on the clicked line. Otherwise the view remounts and S2b places it.
- **Text selection (D3 (a)):** no `preventDefault`. A plain click collapses an old text selection, as any click does
  today. A drag inside one line selects text and moves the cursor to that line. A drag across lines fires its `click`
  on the rows' common ancestor (the body), which has no `data-line`, so the selection stays and the cursor doesn't
  move. The focus is then on the drag's start row (its mousedown focused it) while the cursor stays put, so the next
  ↓ moves from the old cursor line. This matches the staging diff (reasoned from the browser's click targeting; walk
  row 7 checks it).
- **Focus:** the mousedown already focuses the clicked row (`tabIndex=-1`); the cursor effect (`:143-153`) then focuses
  the same `[data-cursor]` row, a no-op, with `preventScroll`. No focus ring after a click (mouse focus), as in the
  staging diff. Keyboard use is unchanged.
- **Scrolling:** the effect's `scrollToIndex(cursor, "auto")` moves the view only for a row cut off at an edge.
- **The hunk menu** (`BlameHunkMenu`, rendered inside the region, `:230`): a click on its items has no `data-line`
  ancestor, so it moves nothing.

### S2b — the drill-down lands on the clicked line (D6, D7)

1. **What is carried:** `{ repoId, oid, path, line, y }`. `oid` and `path` are what `blameAt` opens, `repoId` the
   repository it runs in (worktrees share oids, `actions.ts:198`). `line` is the target line in that commit's file
   (D6). `y` is the clicked row's distance from the region's top, `row * LINE_H - scrollRef.current.scrollTop`, clamped
   to `0 … clientHeight - LINE_H`, so the line lands at the same height on screen, under the mouse. The clamp covers
   Enter or the menu key on a cursor row wheeled out of sight.
2. **Who computes it:** `ContentBody`. `select(hunk)` (`FileContent.tsx:159`) becomes `select(hunk, row)`:
   - the gutter's `onSelect` passes its row (`no - 1`);
   - Enter passes `cursor`;
   - *Select in graph* passes the menu's row, which `HunkMenuState` (`:33-36`) gains;
   - *Blame parent* passes the menu's row too, with the hunk's `previous` oid and path (D7 (b)).
3. **The target line (D6 (b)):** `BlameHunk` gains `orig_start` (serde → `origStart` in `types.ts`), the
   `<orig-line>` the parser already reads (`blame.rs:241`, kept in `Open` and copied in `close`). A pure
   `originLine(hunk, row) = hunk.origStart + row - (hunk.start - 1)` in `blameRows.ts`: the clicked line's number in
   the hunk's own commit, exact.
   - *Blame parent* (D7 (b)) lands on the same `originLine` in the parent commit. The hunk's lines don't exist there
     yet, so it is an approximation: near where the hunk went in.
   - `src-tauri` (`commands/tree.rs:64`) passes `Blame` through as it is; no change there.
4. **Where it is carried:** `diffStore` gains `revealLine: { repoId; oid; path; line; y } | null`.
   - `blameAt(oid, path, at?)` sets it after the hit check (a miss toasts and sets nothing), before
     `selectTreePathAt`.
   - `load` clears it unless the new `repoId` and the new target's tree oid are `revealLine`'s (`load(null)` included);
     the drill-down's own load keeps it. `selectTreePath` clears it for any other path.
   - `restore` (`diffStore.ts:439-447`) sets it to `null`. A tab switch merges the snapshot into the store and
     `revealLine` isn't in `SNAPSHOT_KEYS` (`:405-428`), so without this tab A's value would stay live in tab B.
   - It isn't cleared when used. The details pane and the diff window can both be mounted on the same store
     (`actions.ts:216-220`), and both should land. A later remount of the same commit's same file lands on the line
     again (*For triage*, T3).
5. **Where it is applied:** `FileContent` passes `ContentBody` a `reveal` prop: `revealLine` when its `repoId` is the
   store's, its `oid` is the commit `treeTargetOf(target)` names, and its `path` is the view's; else `null`. Path alone
   isn't enough: two tabs or two commits can share a path.
   - **The cursor starts there:** `useState(() => reveal ? clamp(reveal.line) - 1 : 0)`, with the line clamped to
     `1 … lines.length` (a line past the end lands on the last one). So the first commit already has the cursor, and
     `[data-cursor]`, on the line.
   - **The `[path]` effect** (`:134-139`), on mount and on a path change: with a `reveal`,
     `scrollToOffset(max(0, (line - 1) * LINE_H - y))` (the browser clamps the end), `setCursor(line - 1)` (a no-op on
     mount) and a `reclaim` ref set. Without one, as today (cursor 0, scrollTop 0).
6. **The focus:** while `reclaim` is set and the focus is on `<body>` (the focused row went with the remount), the
   cursor effect (`:143-153`) **only focuses** `[data-cursor]`, with no `scrollToIndex`. It keeps the effect's
   next-frame retry (`:148-151`): right after the reveal's scroll the row may only mount on the next frame. `reclaim`
   is cleared only once `document.activeElement` is the cursor row, or on the first key or mousedown in the region,
   so a first attempt that finds no row doesn't give up.
   - Why no scroll there: when blame is already loaded at mount, the `[path]` effect and the cursor effect run in the
     same commit. A `scrollToIndex` right after the reveal's `scrollToOffset` reads the virtualizer's old offset
     (`scrollToOffset` writes only the DOM) and would align the row to an edge, or to line 1 with a stale cursor.
   - Blame usually arrives after the content (`rows` is `null` until then), so the focus waits for the rows:
     `[data-cursor]` exists only with blame.
   - **Dialogs:** no reclaim when `useDialogStore.getState().dialog !== null && !root.closest('[role="dialog"]')`. A
     view behind an open dialog (the pane behind a diff window) can't take the focus from it.
7. **Edge cases:**
   - **A rename:** `path` is the hunk's `origPath`, the same name the remounted view gets as `treeSelectedPath`.
   - **Blame fails or the file is truncated:** `rows` stays `null`. The scroll and `cursor` still apply; with no
     `[data-cursor]` the focus stays on `<body>`.
   - **The commit already on screen:** nothing remounts; S2's click already put the cursor on the line.
   - **Uncommitted lines:** their zero oid misses in `revealOid`; the toast as today, nothing carried.
   - **From the Stashes dialog:** a hit closes the dialog (`actions.ts:222-223`), and its unmount returns the focus to
     its opener (`Dialog.tsx:61`). The line and the cursor land in History; the focus doesn't come into the view
     (*For triage*, T2).

### S6 — the buttons over the header's end, on hover only (D4 (a))

`DiffViewer.module.css` `.hunkActions` only:

```css
.hunkActions {
  position: absolute;
  top: 0;
  bottom: 0;
  right: var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-left: var(--space-4);
  background: var(--diff-hunk-bg);
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
}
```

- `.hunk` is already `position: absolute`, so it is the containing block. `.grow` now takes the whole row.
- **Shown** on `.hunk:hover` and `.hunk:focus-within`, as today: Tab still reaches the buttons (opacity, not
  `display: none`), and focusing one shows both.
- **While shown,** the buttons cover the header's last ~170 px (two buttons; reasoned, not measured). The opaque
  background and `padding-left` keep the covered text from showing through or touching the buttons.
- **No markup change.** Split, read-only and whole-file diffs have no `.hunkActions` and don't change. The selection bar
  keeps its `.grow`.
- **Narrow pane:** hovering may cover the whole header, which today's layout would also have ellipsized to nothing. In
  a row narrower than the overlay (~170 px plus padding, against the 200 px column minimum), the overlay runs past the
  row's left edge and is clipped by the region, with its leftmost button cut (reasoned).
- **A diff wider than the pane** (long lines): `.body` takes the longest line's width (`:93-96`). The hunk row spans
  it, so the buttons sit at the far right, off-screen until scrolled there — today and after (reasoned). Not in this
  plan.
- **Busy:** the buttons show disabled on hover, as today.

## Decisions for the owner

**D1. S1: how the header comes back into view.**
- *What it is:* moving the staging diff's cursor up, the view scrolls just enough to show the changed line, so the
  hunk's `@@` header and context above it stay hidden. You can't see which hunk you're in or what surrounds it.
- *Why now:* it is the design choice of S1; the tests and walk rows depend on it.
- *Options:*
  - **(A) A margin of rows around the cursor** (the virtualizer's own `scrollPaddingStart` / `scrollPaddingEnd`, 3.19.2
    `index.js:1091-1104`). For example the header + 3 rows above (84 px) and 3 rows below (60 px).
    - *Cost:* two option lines, plus a "moved by a key" flag passed to `DiffBody`, about 6 lines. Without the flag,
      a click in the top 84 px or bottom 60 px scrolls the view under the mouse, and a double-click's second click
      lands on another line. VS Code's `cursorSurroundingLines` is keyboard-only by default, likely for this reason
      (from memory of its settings, not checked here).
    - *Covers:* the default context of 3. With a larger setting the header stays hidden again (with 8, five context
      rows still sit between the header and the margin).
    - *Gains:* look-ahead inside long hunks too.
  - **(B) Bring the cursor's hunk header into view when it fits** (*Design*, S1).
    - *Cost:* about 10 lines in the cursor effect. As first written, without a flag: it acted only when the cursor
      left the view, which a click never does. Review pass 1 found that leaves a cut-off header unrevealed (F1), and
      the owner chose a key flag (below).
    - *Covers:* any context setting.
    - *Risk:* ↑ out of the top into a short previous hunk jumps up to that hunk's header, up to one view's height,
      instead of one row. There is no margin inside a hunk taller than the view.
  - **(C) Both.** Two rules on one scroll, more to test, for look-ahead nobody reported missing.
- *Known:* the walk's scrollTop 84 is measured. The library behaviour is read from its source. How either option
  feels in use is reasoned.
- *Recommend (B):* it fixes what was reported at every context setting, and is unit-testable through the existing
  `scrollToOffset` recorder in `DiffViewer.test.tsx:16-31`.
- *Owner, 2026-10-17:* (B), scroll so the hunk header is at the top.
- *Owner, 2026-10-17 (review pass 1, F1):* (a) a "moved by a key" ref, set in `DiffBody`'s `onKeyDown` and cleared in
  the effect. On ↑ by key, reveal whenever the header isn't wholly in view and header-to-cursor fits; clicks
  untouched. This reintroduces a flag, only to tell keys from clicks.

**D2. S2: which part of a row a click moves the cursor from.**
- *What it is:* today only keys and a right-click move the content view's cursor. The fix adds the left click; the
  question is whether the gutter's click counts too. Today the gutter's click drills down to the line's commit.
- *Why now:* it decides whether the gutter needs a `stopPropagation`.
- *Options:*
  - **(a) The whole row, gutter included;** the gutter still drills down. Same as the right-click today.
  - **(b) The text and the line number only;** `stopPropagation` in the gutter's handler.
- *What differs between them* (corrected in review pass 1): a drill-down to another commit remounts the view
  (*S2b — what happens*), so there the cursor is S2b's to place either way. The choice shows only for a hunk of the
  commit already on screen: nothing reloads, and with (a) the cursor sits on the clicked line, with (b) where it was.
- *Known:* read from the code, not walked.
- *Recommend (a):* one rule for left and right clicks, and on the commit on screen the cursor follows the click.
- *Owner, 2026-10-17:* (a), the whole row, gutter included. Kept in review pass 1, with the reasons corrected.

**D3. S2: when the cursor moves, and what happens to a text selection.**
- *What it is:* clicking text can also mean selecting it. The fix must not break copying text out of the file.
- *Why now:* it decides between `onClick` and `onMouseDown`.
- *Options:*
  - **(a) On click, no `preventDefault`** (*Design*, S2). A drag inside a line selects and moves the cursor. A drag
    across lines selects and leaves the cursor; the focus sits on the drag's start row, and the next ↓ moves from the
    old cursor line. A plain click clears an old selection as it does today. Same as the staging diff.
  - **(b) On mousedown.** The cursor moves at the press, so a drag across lines moves it to where the drag started.
    It differs from the staging diff, and its `held` / focus comments assume clicks.
- *Known:* that a cross-line drag fires its click on the common ancestor is Chromium's behaviour as understood, not
  measured here. Walk row 7 checks it.
- *Recommend (a):* one behaviour for both views, and text selection works as it does now.
- *Owner, 2026-10-17:* (a), on click, no `preventDefault`, the selection kept.

**D4. S6: how the header gets its width back.**
- *What it is:* the hidden Stage / Discard buttons keep their space, so the header is cut with an ellipsis even when
  nothing is hovered.
- *Why now:* the design choice of S6.
- *Options:*
  - **(a) Buttons laid over the header's end, shown on hover / focus** (*Design*, S6). About 8 lines of CSS, no markup.
    *Risk:* while hovering, the covered end of the header is hidden; moving off shows it.
  - **(b) A `title` with the full header.** One attribute, but the text stays cut; you have to hover and wait.
  - **(c) (a) plus (b).** The title helps only a header longer than the whole pane, which nobody reported.
  - **(d) `display: none` until hover.** Tab can no longer reach the buttons (a hidden element can't take the focus),
    and the header re-cuts as the mouse arrives.
  - **(e) Let the header wrap.** Rows have a fixed 24 px height in the virtualizer (`diffRows.ts:30`); a taller row
    needs measured rows, a much larger change.
- *Known:* the cause is reasoned from the CSS; the walk measured the symptom only.
- *Recommend (a):* the smallest change that removes the cut, and keyboard reach stays as it is.
- *Owner, 2026-10-17:* (a), the overlay.

**D5. Where the walk runs.**
- *What it is:* the fixes are CSS and scroll behaviour; WebView2 (Windows) and WebKitGTK (Linux) lay out and fire
  click events by the same specs, but they are different engines.
- *Why now:* the walk is a step of this plan.
- *Options:*
  - **(a) Windows VM over CDP only** (session git-ui-win), about 30 min.
  - **(b) Also Linux under Xvfb + openbox** (`docs/smoke/smoke-linux.md`), about 30 min more.
- *Known:* nothing in the change is platform-specific (reasoned). Linux hover and click targeting weren't measured for
  these rows.
- *Recommend (a),* with "Linux not walked" put to the owner in triage as an accepted limit.
- *Owner, 2026-10-17:* (a), the Windows VM only; Linux offered as an accepted limit in triage.

**D6. S2b: which line the drill-down lands on.**
- *What it is:* clicking line 200's gutter opens the file as it was in that line's commit. There, the same text may sit
  at another number (lines were added or removed above it since). The view should show the clicked line.
- *Why now:* S2b needs a target line, and one option changes the Rust blame parser.
- *Options:*
  - **(a) The same line number** (200), clamped to the file's end. Front end only. In the older file it can be a
    different line, off by however many lines were added or removed above it since. The owner's request in review
    read "the same file line number, or nearest".
  - **(b) git's own line:** porcelain's `<orig-line>`, which says where that exact line sat in the commit. The parser
    reads it and drops it (`blame.rs:241`); keeping it is a new `orig_start` field on `BlameHunk` (Rust, the TS type,
    the test fixtures), about 10 lines and a parser test. It adds `cargo` gates to the plan.
- *Known:* the porcelain format and the parser are read from the code. That a hunk's lines are contiguous in the old
  file too is git's porcelain contract (one header per group), read from the parser. The plan's real-git parser test
  (*Tests*, S2b) checks it on a renumbered file, and walk row 9 in the app.
- *Recommend (b):* it lands on the line that was clicked, not one that happens to share its number, at the cost of a
  small Rust change.
- *Owner, 2026-10-17:* (b), git's own original line: porcelain's `<orig-line>` kept as `orig_start` on `BlameHunk`, a
  parser test, and the Rust gates in the steps.

**D7. S2b: does *Blame parent* carry a line too?**
- *What it is:* *Blame parent* (the hunk menu) opens the file at the commit *before* the hunk's, where the hunk's lines
  don't exist yet. git gives no line number there.
- *Why now:* S2b changes the other three entry points; this one would stay at line 1 unless decided.
- *Options:*
  - **(a) Unchanged:** line 1 at the top, as today.
  - **(b) An approximate line:** the hunk's line in its own commit (D6 (b)'s `originLine`). It lands near where the
    hunk went in, which may be an unrelated line.
- *Known:* reasoned only.
- *Recommend (b):* near the right place beats the top of a long file, and it is the same mechanism with no extra code
  path. The walk row for it records where it landed rather than asserting a line.
- *Owner, 2026-10-17:* (b), *Blame parent* carries the approximate line (the hunk's line in its own commit); its walk
  row records where it lands.

## Tests

Unit (vitest, jsdom). jsdom has no layout and vitest runs with `css: false` (`DiffViewer.test.tsx:90`), so these can't
be unit-tested: the real scroll position, whether the header is on screen, the overlay, the ellipsis, hover. The walk
covers them.

- **`DiffViewer.test.tsx` (S1):** the virtualizer mock (`:16-34`) gains an `observeElementOffset` stub,
  `(instance, cb) => { cb(scrolls.top, false); return () => {}; }` (virtual-core 3.19.2 `index.d.ts:66`,
  `index.js:464`), reporting a hoisted `scrolls.top`. It also records `scrollToIndex` calls next to `scrollToOffset`'s.
  `afterEach` resets `scrolls.top` and both records. The mock's `clientHeight` comes from jsdom (0) unless the test
  defines it on the region; the tests set it to 400. Fixture: two or three hunks, enough rows to exceed 400 px. New
  tests:
  - ↑ from a hunk's second change to its first, with the view at that first change (the walk's 84) →
    `scrollToOffset(0)`, the header's start;
  - ↑ from a hunk's first pick into the previous hunk, its header above the view → `scrollToOffset` with that header's
    `start`;
  - the same with a hunk taller than 400 px → no `scrollToOffset`; `scrollToIndex(cursorRow, auto)`;
  - ↓ onto a pick with its header above the view → no `scrollToOffset`;
  - a click on a pick with its header above the view → no `scrollToOffset` (F1's key flag);
  - an ↑ at the first pick (no move), then a click → no `scrollToOffset` (the mousedown clears the flag);
  - an ↑ at the first pick (no move), then a rerender with a reloaded diff that moves `cursorRow` → no
    `scrollToOffset` (the `[rows]` effect clears the flag);
  - the existing *the keyboard cursor takes the focus with it* (`:342`) still passes: focus follows the reveal.
- **`FileContent.test.tsx` (S2):**
  - a click on line 3's text with blame on → the options' `aria-selected` reads `false, false, true`, the `tabindex=0`
    is on line 3, and ↑ then lands on line 2;
  - a gutter click → the cursor is on that row right after the click, before awaiting `revealOid`; then `revealOid` is
    called (extends `:129-151`);
  - with blame off a click leaves no tab stop (extends `:250-257`).
- **S2b:**
  - `blame.rs`: `orig_start` assertions added to the pure-parse test
    `parses_hunks_a_rename_a_repeated_commit_and_uncommitted_lines` (`:285`): `{A} 1 2 2` → `orig_start` 1 at
    `start` 2; `{B} 2 4 1` → 2 at 4. No other Rust code builds a `BlameHunk`; the only literal is `close`
    (`:212`).
  - `blame.rs`, beside them: a real-git `TempRepo` test, skipped without git like the others (`have_git()`, `:261`).
    Commit 2 inserts lines above a commit-1 hunk; blaming HEAD asserts that hunk's `orig_start` is its line in commit
    1 and `start` its line now. This is what checks the renumbering against git itself.
  - `blameRows.test.ts`: `originLine` for the first, a middle and the last row of a hunk. Its `hunk()` fixture
    (`:8-20`) gains `origStart`; `tsc` checks the tests.
  - `diffStore.test.ts`: `revealLine` survives a `load` of its own commit, and is cleared by:
    - a `load` of another commit, of the same oid in another repo, and `load(null)`;
    - `selectTreePath` to another file;
    - `restore` of another tab's snapshot.
  - `FileContent.test.tsx`:
    - a gutter click on a hit sets `revealLine` to the repo, the hunk's commit and path, the line from `originLine`
      and the row's `y`; a miss sets none;
    - with a scroll recorder added to this file's mock: rendering with a matching `revealLine` → the cursor on that
      line and `scrollToOffset((line - 1) * 20 - y)`;
    - a `revealLine` with the same path but another oid or repo → cursor 0, scrollTop 0;
    - **the mount race:** blame and content both ready at mount, the focus on `<body>` → the cursor on the line, no
      `scrollToOffset(0)` or `scrollToIndex` after the reveal's `scrollToOffset`, and the focus on that row. The
      line sits inside the first rendered window (≤ ~40 with the mock's 400 px view and 30 rows of overscan), since
      the mocked `scrollToOffset` doesn't scroll;
    - blame arriving after the content → the focus on `[data-cursor]` then;
    - with a dialog open in the store and the view outside it → no reclaim;
    - a line past the end → the last line; a `y` past the view's bottom → clamped to `clientHeight - 20`;
    - Enter and *Select in graph* carry their rows; *Blame parent* carries `previous`'s oid and path with the row's
      `originLine` (D7 (b), extends `:153-183`);
    - the `hunk()` fixture gains `origStart`.
- **S6:** no unit test. No markup changes and CSS isn't loaded in vitest.

Walk: smoke group **BU** in `docs/smoke/smoke-test-post-v1.md`, after BT. The file adds one group per change batch; the
rows sit beside AL (Blame) and F / AD (staging) in subject but walk on their own fixture. Windows VM over CDP on a local
`tauri build --no-bundle` of the branch (`docs/smoke/smoke-cdp.md`: close other instances, store backed up and
restored, `smoke-launch.ps1`, `cdp.mjs`).

Fixture, built in Git Bash on the VM, in a fresh repo `C:\tmp\t4\bu` (deleted after, with row 13's clone
`C:\tmp\t4\bu-clone`):
- commit 1: `bu.txt`, 400 lines `line NNNN of the BU fixture, …`, padded to the length row 5 needs; `r.txt`, 100
  lines `r line NNN`;
- commit 2: 5 lines inserted after `bu.txt`'s line 10, lines 100–110 (now 105–115) edited, so blame has two commits
  and commit 1's lines below 10 sit 5 lower; `r.txt` renamed to `r2.txt` with 5 lines inserted at its top;
- unstaged: every 20th line of `bu.txt` edited, plus lines 300–340 replaced (one hunk taller than the pane).

Rows, each with its pass criteria:

1. **↑ shows the header (S1):** Changes › `bu.txt` → click the first change → ↓ ×40 → ↑ one press at a time to the
   top. *Pass:* at every press the cursor row is focused and in view. At every press that lands on a hunk's first
   change, that hunk's `@@` row is wholly inside the region (its rect top ≥ the region's). Back at the top, scrollTop
   is 0. Record scrollTop per press.
2. **Another context (S1, D1 (B)):** Settings › diff context 8 → row 1 again → the same pass. Context back to 3.
3. **A hunk taller than the pane (S1):** wheel-scroll to the bottom of the 300–340 hunk and click its last added line
   (a click doesn't reveal). Then ↑ one press at a time. *Pass:* the cursor stays pinned to the top edge while
   header-to-cursor is taller than the region. On the first press where it fits, the header jumps to the top once,
   with the cursor in view below it. Record scrollTop per press.
4. **A click doesn't scroll (S1):** wheel-scroll so a hunk's `@@` row is just above the top edge, click a fully visible
   change of that hunk → scrollTop unchanged. Double-click a word on a change row near the top → that word is
   selected (`getSelection()`), on the clicked line.
5. **The header in full (S6):** at `--inner 1280x800`, first measure the Changes diff column's width and the headers'
   text width. The fixture's line length is set so a header's text falls between (row width − ~170 px) and the row
   width; rebuild with another padding if it doesn't. Read every `@@` row in view while nothing is hovered: the header
   element's `scrollWidth` and `clientWidth`. *Pass:* `scrollWidth ≤ clientWidth` on the branch, where the installed
   0.10.24 (`-Installed`, the same reading) has `scrollWidth > clientWidth`; both readings recorded. Hover a header →
   Stage hunk and Discard hunk show over its right end. Stage hunk → the hunk moves to the staged list. There, hover →
   Unstage hunk → back. Tab from a change row to the buttons → they show while focused.
6. **A click moves the blame cursor (S2):** History › commit 2 › Files › `bu.txt` → Blame → click line 50's text.
   *Pass:* line 50 has `aria-selected="true"` and `tabindex=0`; ↓ → line 51.
7. **Text selection kept (S2, D3 (a)):** drag across a word inside line 60 → the cursor on line 60, the selection
   non-empty. Drag from line 70 to line 72 → the selection kept, the cursor still on 60; ↓ → line 61. Right-click line
   80 → the menu → Escape → the cursor on 80, as before.
8. **Gutter click on the commit on screen (S2, D2 (a)):** on commit 2, click line 110's gutter (commit 2's own hunk).
   *Pass:* the grid stays on commit 2, nothing reloads, the cursor is on line 110, scrollTop unchanged.
9. **The drill-down keeps the line (S2b, D6):** on commit 2, scroll so line 200 is mid-view; note its text and its
   `y`. Click its gutter (commit 1's hunk). *Pass:* the grid selects commit 1; the Files tab shows `bu.txt`, blame on.
   The line with the same text (line 195 in commit 1, git's original line) has the cursor and the focus
   (`document.activeElement`), at the same `y` ±20 px. ↓ → the next line.
10. **Enter and *Select in graph* (S2b):** back on commit 2: the cursor on line 250 by keys → Enter → commit 1, line
    245, as row 9. Back again: right-click line 300 → *Select in graph* → line 295. Then right-click line 110 (commit
    2's hunk, its own line 110) → *Blame parent* → commit 1. *Record* the line with the cursor and its text, with no
    pass line to meet (D7 (b): expected near commit 1's line 110, an approximation). The cursor and the focus are in
    the view.
11. **A rename (S2b):** commit 2 › `r2.txt` → Blame → line 50's gutter → commit 1's `r.txt`, line 45 with the cursor.
12. **The diff window (S2b):** commit 2 › Files › `bu.txt` › Open diff window → Blame → line 200's gutter. *Pass:*
    the window's view lands on line 195 with the focus inside the window, not in the pane behind.
13. **A tab switch doesn't carry the line (S2b):** the same repo can't have two tabs (`openTab` only switches to the
    existing one, `tabsStore.ts:100-103`), so tab B opens a clone: `git clone C:/tmp/t4/bu C:/tmp/t4/bu-clone`
    (forward slashes: Git Bash eats unquoted backslashes). Same oids and paths, another repo id. In B, commit 1 › Files
    › `bu.txt` at the top. In tab A, drill down as row 9 (to commit 1's `bu.txt`). Switch to B. *Pass:* B's view stays
    at line 1, scrollTop 0, its cursor on line 1. This checks the `restore` clear: the switch clears `revealLine`
    before any repo comparison could run, so the `repoId` check itself is covered by the unit tests only.
14. **The Stashes dialog route (S2b, *For triage* T2):** stash an edit to `bu.txt` (`git stash`), open the Stashes
    dialog → the stash → Files › `bu.txt` → Blame → a commit-1 line's gutter. *Record:* the dialog closes, History
    shows commit 1 with the cursor on the line; where the focus is (expected: the Stashes opener, not the view). Then
    `git stash pop`, not `drop`: the stash holds the fixture's unstaged edits too, which a re-walk of rows 1–5 needs.
15. **Read-only diffs unchanged (S1, S6):** History › commit 2's diff of `bu.txt`, unified and split, and the diff
    window → headers in full, no buttons; ↑ / ↓ scroll the region as before.

A console.error / warn and unhandledrejection hook installed before row 1; the app log read for WARN / ERROR after.

## Steps

0. **The owner's go.** A final plan isn't one.
1. **Branch** `diff-viewer-polish` from the pushed `origin/main`. Before any go to execute, the coordinator commits
   this plan, its two sibling plans and `open-items.md` §AO on `main`, and pushes that commit to `origin/main` on the
   owner's go. So the branch carries this plan, step 12.2 can archive it in the worktree, and the squash base is
   `origin/main` with the plan already on it: the plan's commit isn't folded into the squash. Step 14's local
   `git merge --ff-only origin/main` then works. Of the three plans, the branch edits only this one.
   - **Check first:** after `git fetch`, `git log --oneline origin/main --
     docs/plans/2026-10-17-diff-viewer-polish-plan.md` is non-empty. If it is empty, stop and ask the owner.
2. **S1** per *Design*, with its unit tests. `src/README.md:462-463` in the same commit: ↑ brings the cursor's hunk
   header into view when it fits, not only the cursor. Commit `fix: moving up the staging diff shows the hunk header
   above the cursor`.
3. **S2** per *Design*, with its unit tests. `src/README.md:492-493` in the same commit: a click on a blamed row moves
   the cursor too, beside ↑/↓. Commit `fix: a click in the file content view moves the blame cursor`.
4. **S2b** per *Design*, with its unit tests, in two commits:
   - the parser keeps `<orig-line>` as `orig_start`, with its test and the TS type: `refactor(blame): keep git's
     original line number on each blame hunk`;
   - the drill-down: `feat: a blame drill-down lands on the clicked line in the commit it opens` (owner: `feat:`;
     S1, S2 and S6 stay `fix:`). `src/README.md` in the same commit:
     - `:98-105`, the diff store's blame section: `revealLine` and when it is cleared (a `load` of another repo or
       commit, `load(null)`, `selectTreePath` to another file, `restore`);
     - `:339`: `blameAt(oid, path, at?)` carries the clicked line;
     - `:493-494`: Enter, a gutter click and the hunk menu land on the clicked line in the commit they open, through
       `origStart` and `originLine` (*Blame parent* on an approximate line);
     - `:496-497`: `blameRows.ts` gains `originLine`.
5. **S6** per *Design*. `src/README.md:459-460` in the same commit: the hunk buttons lie over the header's end on hover
   or focus and take no width. Commit `fix: the staging diff shows hunk headers in full, buttons on hover`.
6. **Gates** after each commit, run in `F:/src/_ pet projects/t4-git-ui` (the uppercase `F:/` path; a lowercase `f:/`
   fails vitest at collection):
   - `npm test` (= `vitest run`);
   - `npm run build` (= `tsc && vite build`; its `tsc` is the type check, so no separate `npx tsc --noEmit`);
   - from step 4's parser commit on, the Rust gates of `checks.yml:81-94`, against the workspace manifest (the cwd
     doesn't persist between shell calls):
     - `cargo fmt --manifest-path "F:/src/_ pet projects/t4-git-ui/Cargo.toml" --all -- --check`;
     - `cargo clippy --manifest-path "F:/src/_ pet projects/t4-git-ui/Cargo.toml" --workspace --all-targets --locked
       -- -D warnings`;
     - `cargo test --manifest-path "F:/src/_ pet projects/t4-git-ui/Cargo.toml" --workspace --locked`.
   - **Linux and macOS for the Rust change** (reasoned): the parser reads git's porcelain text, the same on every
     OS, and the new field is one more number from a line it already splits. The real-git parser test runs it
     against each OS's own git. CI runs on a pull request to `main` (`ci.yml:11-22`), with the same three gates on
     all three OS (`checks.yml`). The PR of step 9 is what covers the parser there before the merge. No Linux or macOS
     walk is added for it (D5 (a)).
7. **Smoke group BU** rows as above, unticked. Commit `docs: smoke group BU for the diff viewer fixes`.
8. **Change review loop** (CLAUDE.md step 5): review, fix, review again until a pass is clean. Every skipped finding and
   proposed limit goes on the triage list.
9. **Push the branch and open a PR to `main` — the owner's go at that moment** (owner, review pass 2). CI runs on the
   PR on three OS (`ci.yml:11-22`). A red run goes to the owner before anything else.
   - **The PR opens early, with the unsquashed commits** (owner, review pass 5): a deliberate departure from CLAUDE.md
     step 7's order (squash, then push), so CI runs on three OS before the walk. The squash comes in step 12 and
     reaches the PR by a force-push.
10. **The walk** on the Windows VM (session git-ui-win).
    - **Getting the branch there:** the VM fetches the PR's branch `diff-viewer-polish`; the fetch needs the owner's
      approval there.
    - **Build from PowerShell:** `npm ci`, then `npm run tauri -- build --no-bundle`, every app copy closed first (the
      exe lock). Not from the VM's Git Bash, which resolves `link.exe` to coreutils' `link`.
    - **The store backup** on the VM needs the owner's approval there.
    - Record in `docs/archive/walks/<date>-bu-walk.md`, naming the walked (pre-squash) head hash. Tick BU's rows with a
      *(Walked …)* note each, as BT does.
    - **A row that fails:** fix → the change review loop (step 8) → triage of what it leaves. Each push of a fix to the
      PR's branch is on the owner's go at that moment, and every affected row is walked again on the new build.
11. **Triage** with the owner, one item at a time (CLAUDE.md step 6), starting from *For triage* below. An item the
    owner rules *Fix it*: the fix → step 8's review loop → the affected BU rows walked again → a push to the PR on the
    owner's go → CI green → back to triage for the next item.
12. **Package, then the records** (CLAUDE.md step 7; owner, review pass 3: the records carry the squashed hashes).
    All in a throwaway worktree, in this order:
    1. Squash into logical commits, and check that the squashed tree is identical to the branch's. Review-fix commits
       fold into the commit they fix, and fixes from walk findings or triage fold the same way, by what they fix (an S1
       fix into S1's commit, a walk-doc fix into the BU commit). What comes out, in order:
       - `fix: moving up the staging diff shows the hunk header above the cursor` (S1);
       - `fix: a click in the file content view moves the blame cursor` (S2);
       - `refactor(blame): keep git's original line number on each blame hunk` (S2b's parser);
       - `feat: a blame drill-down lands on the clicked line in the commit it opens` (S2b);
       - `fix: the staging diff shows hunk headers in full, buttons on hover` (S6);
       - `docs: smoke group BU for the diff viewer fixes`, with the walk's ticks and record folded in;
       - the records commit (2. below).

       `src/README.md`'s edits stay in the S1, S2, S2b drill-down and S6 commits, each with the behaviour it
       describes (steps 2–5), as in the scroll-anchor plan.
    2. The records, one docs commit on top, written with the squashed hashes. They cite only the code commits' hashes,
       never the records commit's own. The walk record keeps its walked pre-squash hash and gains the post-squash hash
       beside it ("same tree").
       - `open-items.md` §AN: bullets 1, 2 and 4 → `open-items-done.md`, a new section *AN. Added <date> — the #32
         walk's diff viewer rows: fixed, closed* (the file ends at §AM), each with its fix hash and the walk record.
         S2b goes in the same section as a row of its own (added in review). Bullet 3 (scroll anchoring) stays in
         §AN.
       - Triage outcomes in their sections (`open-items.md` §Q for an accepted limit with a reopen trigger).
       - This plan → `docs/archive/plans/`, and every hit of `git grep` on its old path outside this plan
         repointed there (today `open-items.md` §AO's preamble), except in a sibling plan still under
         `docs/plans/`: the anchor plan repoints its own *Overlap* reference in its step 1.
    3. Check the final tree is the branch's tree plus the records commit's files only, then move the branch there.
13. **Force-push to the PR's branch — the owner's go at that moment;** CI runs again.
14. **Merge once CI is green — the owner's go at that moment** (owner, 2026-10-17): fast-forward `main` to the PR's
    head, not GitHub's merge button, so the squashed hashes the records cite survive.
    - `git push origin diff-viewer-polish:main`, which the remote accepts only as a fast-forward (no `--force`); then
      locally `git checkout main` and `git merge --ff-only origin/main`.
    - **If `main` has moved since** (owner, review pass 5):
      1. rebase the branch onto it;
      2. `git range-diff <old main>..<old head> <new main>..<new head>` shows the change identical in code and test
         files; doc hunks differ only by the hand resolution of a conflict;
      3. redo step 12's records hashes (the squash check against the rebased tree);
      4. re-run the local gates (step 6);
      5. the walk record notes "same change, rebased onto `<main hash>`", that the range-diff is clean in code and
         tests, and names each doc file resolved by hand;
      6. re-walk the affected BU rows **only if the rebase had conflicts in code or test files this change touches**
         (`DiffViewer/*`, `FileContent.tsx`, `blame.rs`, `blameRows.ts`, `diffStore.ts`, `actions.ts`, `api/types.ts`;
         owner, 2026-10-17). A conflict in a doc is resolved by hand and checked in the range-diff, with no re-walk.
         The docs most likely to conflict when a sibling plan lands first: `open-items.md`, `open-items-done.md`,
         `src/README.md`, the smoke doc;
      7. force-push on the owner's go, CI green, then the fast-forward above.
    - A release is not part of this plan.
15. **Optional, after the merge:** delete the branch, local and remote, on the owner's go, after looking up that no
    open PR still uses it.

## Overlap with the scroll-anchor plan

`docs/archive/plans/2026-10-17-diff-scroll-anchor-plan.md` (§AN bullet 3, the diff's top line kept across a reload,
smoke group BV) also changes `DiffBody`'s scroll code. **This plan is proposed to land first;** the anchor plan then
rebases onto it.

- **Code both touch,** in `DiffViewer.tsx` `DiffBody`:
  - **The region's `onKeyDown`.** This plan sets the ↑ ref there; the anchor plan clears its `quiet` ref there (its
    Design 5). Both wrap the same handler before it calls `DiffViewer`'s.
  - **The cursor effect** (`:437-443`). This plan branches its scroll on the ↑ ref. The anchor plan skips the scroll
    while `quiet` is set and only refocuses. Merged order: `quiet` → focus only; else ↑ → the reveal rule; else
    `scrollToIndex(…, "auto")`.
  - **The `[rows]` effect** (`:414-417`): the anchor plan turns it into a layout effect that carries the offset and
    sets `virtualizer.scrollOffset` after its jump. This plan adds one line there, clearing the ↑ ref. A layout effect
    still runs before the cursor effect (a passive one), so the clear keeps its place.
  - **`DiffViewer.test.tsx`'s mock** (`:15-34`): this plan adds the `observeElementOffset` stub and the
    `scrollToIndex` recorder. The anchor plan seeds its component test through that stub.
- **How they meet** (reasoned from the two designs):
  - S1 acts only on an ↑ key press, and a reload never sets the ↑ ref. A reload's scroll is therefore the anchor's
    alone, and the cursor effect refocuses only (`quiet`).
  - The next key clears `quiet`; an ↑ then takes S1's rule against the anchored position.
  - S1 reads `virtualizer.scrollOffset`, which the anchor plan keeps current after its jump, so no DOM `scrollTop` read
    is needed.
- **Before the anchor plan lands,** S1 leaves the carry-over after staging as today (`scrollToIndex(…, "auto")`). With
  the anchor plan in, that scroll goes and the anchor keeps the view.

## For triage

Limits known now, to put to the owner at triage (step 11) with whatever the change review and the walk add:

- **T1. Linux not walked** (D5 (a)): WebKitGTK's hover, click targeting and scroll timing for these rows are unmeasured.
  Proposed: an accepted limit, reopened by a Linux report about the diff or the content view.
- **T2. The Stashes dialog route leaves the focus outside the view** (review pass 2): a drill-down from the Stashes
  dialog closes it, and the dialog hands the focus back to its opener. The line and cursor land; the focus doesn't.
  Walk row 14 records it. Options at triage: accept, or have the reclaim run after the dialog's focus return.
- **T3. A remount lands on the drilled line again** (review pass 2): `revealLine` stays until the target or the file
  changes. Files → Changes → Files, or opening the diff window, puts the cursor back on the drilled line even after
  the user moved it by keys. This is the stated design (both mounted views must land); listed so the owner rules on it.

## Not in this plan

- §AN bullet 3, the scroll position kept in pixels across a reload: its own plan.
- The History / Changes choice following across tabs, and the active tab from a hand-written `layout.json` (walk
  bullets 4–5): not §AN's deferred rows, and not in scope.
- A margin or reveal in the content view: it has no hunk headers. A blame hunk's label sits on its first row, and
  moving up into a tall blame hunk leaves the label off-screen. Not reported; ask if wanted.
- Hunk buttons off-screen on a diff wider than the pane (*Design*, S6): today's behaviour, unchanged.
- Rows past the last blame hunk: ↓ can reach them, a click can't (no `data-line`). Today's behaviour.
- Linux and macOS walks (D5).

## Review record

- **Pass 1** (2026-10-17): 12 findings, all taken (F1, F3 decided by the owner; the drill-down added as S2b).
  - F1: S1's reveal missed a header cut off with its first change partly visible; now an ↑ key ref (owner).
  - F2: walk row 3's criterion matched to the design; how to reach the tall hunk's bottom.
  - F3: D2's reasons corrected (a drill-down remounts the view); D2 (a) kept (owner); S2b added (owner), with D6–D7.
  - F4: *Overlap* rewritten against the anchor plan's `quiet` ref and `scrollOffset` assignment.
  - F5: walk row 5 sizes the fixture's header and records `scrollWidth` before and after.
  - F6: five unit tests added; `scrolls.top` reset in `afterEach`; the gutter test asserts the cursor first.
  - F7: step 9 names how the VM gets the branch, the PowerShell build and the store-backup approval.
  - F8: `getTotalSize()` before reading `measurementsCache`.
  - F9: "↓ never triggers" rewritten; with the ↑ ref it is true by construction.
  - F10: the fit test uses the region's `clientHeight`, not the border-box `scrollRect`.
  - F11: the Commit dialog in *Terms*; the context refs; D3 (a)'s focus after a cross-line drag.
  - F12: S6's overlay in a pane narrower than the buttons.
  - Also: the `observeElementOffset` signature confirmed (`index.d.ts:66`, `index.js:464`); its "to be confirmed"
    note dropped.
- **After pass 1** (2026-10-17): the owner took D6 (b) and D7 (b). S2b's design, tests, walk rows 9–10 and steps 4 and
  6 updated to match.
- **Pass 2** (2026-10-17): 11 findings, all taken (F1, F11 decided by the owner; F9, F10 to triage).
  - F1: no CI without a PR; a PR to `main` on the owner's go (step 9), the merge after CI is green (step 14), the VM
    fetching the PR branch (owner).
  - F2: `revealLine` carries `repoId`, is cleared by `restore` and `load(null)`, and applies only on a repo + commit +
    path match; tests and walk row 13.
  - F3: the mount race; the cursor starts on the line and the reclaim only focuses; a unit test.
  - F4: `y` clamped to the view.
  - F5: `blameRows.test.ts`'s fixture gains `origStart`.
  - F6: the Rust test is assertions on the pure-parse test at `blame.rs:285`; the wrong "hand-built hunks" line dropped.
  - F7: the `[rows]` effect clears the ↑ ref; a unit test; *Overlap* updated.
  - F8: the reclaim's dialog check spelled out.
  - F9: the Stashes route's focus → *For triage* T2, walk row 14.
  - F10: the remount re-landing → *For triage* T3.
  - F11: S2b's commit is `feat:` (owner).
- **Pass 3** (2026-10-17): 5 findings, all taken (F3 decided by the owner).
  - F1: walk row 13's tab B is a clone of the fixture (one repo can't have two tabs); the clone deleted with it.
  - F2: the real-git `TempRepo` parser test restored beside the pure-parse assertions; D6's *Known* updated.
  - F3: the records are written after the squash, with its hashes, in the rehearsal worktree (step 12, owner).
  - F4: the reclaim keeps the next-frame retry and clears only once the row has the focus; the mount-race test's line
    sits in the first rendered window.
  - F5: walk row 14 pops the stash rather than dropping it.
- **Pass 4** (2026-10-17): 3 findings, all taken; merge by fast-forward (owner); walk-findings path; squash output
  named.
  - F1: row 13's clone command uses forward slashes.
  - F2: row 13 checks the `restore` clear; the `repoId` check is the unit tests'.
  - F3: the walk record keeps its pre-squash hash with the post-squash one beside it; records cite code commits only.
  - Owner: `main` is fast-forwarded to the PR's head and pushed (step 14), with the rebase path if `main` moved.
  - Step 10 says what a failed row goes through; step 12 names the squash's commits; step 15, the optional branch
    deletion.
- **Pass 5** (2026-10-17): 5 findings, all taken; re-walk only on conflicts in own files (owner); PR opens before the
  squash (owner).
  - F1: step 1's branch carries this plan, committed on `main` by the coordinator; the sibling plans stay untouched.
  - F2: the rebase path in step 14: `range-diff`, local gates, the walk record's note, a re-walk only on conflicts in
    this change's files (owner).
  - F3: triage's *Fix it* path in step 11.
  - F4: the PR opens early with unsquashed commits, a departure from CLAUDE.md step 7's order (owner, step 9).
  - F5: the VM's fetch needs the owner's approval there (step 10).
  - Also: the fast-forward push spelled out (step 14); walk-finding fixes fold by kind at the squash (step 12).
- **Pass 6** (2026-10-17): 2 findings (step 1: §AO committed with the plans; the plans commit pushed first), both
  covered by the step-1 edit.
- **Pass 7** (2026-10-17): nothing to fix. One optional wording tweak held for the owner: step 1's "the branch edits
  only this plan's file" could read as no other docs; "of the three plans, the branch edits only this one".
- **Owner ruling** (2026-10-17, after pass 7): step 14's re-walk counts only conflicts in code or test files; a doc
  conflict is resolved by hand and checked in the range-diff (raised by the per-tab plan's pass 9, same for all three).
- **Pass 8** (2026-10-17): 1 finding (src/README.md edits), taken; plus the anchor plan's pass-8 F1/F2 applied here for
  consistency.
  - F1: `src/README.md` edits folded into the S1, S2, S2b drill-down and S6 commits (steps 2–5; refs `:98-105`,
    `:339`, `:459-463`, `:488-497` checked), and named in step 12.1.
  - The anchor plan's F1: step 1 checks the plan is on `origin/main` before branching.
  - The anchor plan's F2: step 14's range-diff is identical in code and tests, doc hunks differ only by the hand
    resolution; the walk record names the docs resolved by hand; the likely-conflict docs listed.
- **Pass 9** (2026-10-17): nothing found. The owner then took pass 7's optional wording tweak in step 1.
- **Pass 10** (2026-10-17): 1 finding, taken: archiving left stale references to the old path; step 12.2 repoints
  them. The same rule applied to the sibling plans.
- **Pass 11** (2026-10-17): 1 nit, taken: the repoint skips this plan's own text (step 1's check names the path as it
  was then); the same in the sibling plans.
- **Pass 12** (2026-10-17): nothing found.
