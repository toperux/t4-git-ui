# Plan: the diff keeps its top line across a reload, 2026-10-17

_Written 2026-10-17 against `main` `266fc96`. Status: decisions D1–D5 taken with the owner on 2026-10-17, all (a);
review passes 1–9 taken; pass 10 found nothing; the polish plan's pass-10 finding applied; pass 11's 2 taken; pass
12 found nothing: final._

**Goal:** when a diff reloads and the file stays the same, the line at the top of the view stays at the top. Today
the view keeps its pixel offset, and the rows above it change height. `open-items.md` §AN, the row *The diff keeps
its scroll position in pixels across a reload*, found in `docs/archive/walks/2026-10-16-npm-group-32-walk.md` (row 5
and *Seen on the way*).

## What the user sees now (measured)

From the #32 walk: Windows, a build of #32 merged into `main`, fixture `scroll32` (300 files of 2000 numbered lines,
every 10th line edited; in `f150` the odd tens (10, 30, 50, …) only gain a trailing space).

- **Whitespace toggle**, History › the `ws` commit › `f150`, at scrollTop 15 000: the height goes 36 740 → 18 340 px.
  scrollTop stays at 15 000, so the view lands at about line 1640 instead of 820.
- **An edit to a hunk above the view** (Changes view): the height grows 140 px and the top line goes 657 → 650.
- **A `touch`** (mtime only): nothing reloads in 4 s, nothing moves.
- Every 10 ms sample: 0 blank, 0 gap, 0 overlapping rows. The virtualizer paints; only the position is wrong.

The measured heights match the row model exactly (computed, not measured):

- Each change is its own hunk: a 24 px header, then 3 context lines, the deleted line, the added line and 3 context
  lines at 20 px each, so 184 px. The last hunk (line 2000) has no trailing context: 124 px.
- Without `-w`: 200 hunks, 199 × 184 + 124 = 36 740. With `-w`: 100 hunks, 99 × 184 + 124 = 18 340.
- At 15 000 the top row sits in hunk 81 (0-based), line 820's. With `-w` the same pixel falls in hunk 81 of 100,
  which is line 1640's.

## Root cause

- `DiffBody` (`DiffViewer.tsx:405-426`) reacts to new rows only with `virtualizer.measure()` (`:417-421`). It scrolls
  only when the path changes, and then to 0 (`:423-426`). scrollTop is DOM state: it stays in pixels while every row
  above it can change.
- The body stays mounted through a reload, so nothing else resets it:
  - `diffStore.loadDiff` keeps the old `diff` on screen until the new one lands (`diffStore.ts:155-174`);
  - `commitStore.loadDiff` does too, for a reload of the same file in the same list (`commitStore.ts:200-204`), and
    keeps the old object when the hunks are equal (`:211-216`), so a reload that finds nothing new never reaches the
    body.
- Rows have fixed heights: `HUNK_ROW_H` 24 and `LINE_ROW_H` 20 (`diffRows.ts:5-6, 30`; CSS `.dl` 20 px at
  `DiffViewer.module.css:140`, `.hunk` 24 px at `:228`). A row's offset is a sum over the rows above it, so the fix
  can be a pure function.

## Surfaces

Every diff goes through `DiffViewer` → `DiffBody`, so a fix in `DiffBody` covers all of them:

- the details pane, `CommitDiff` (`DetailsPane.tsx:132-157`), for a commit, a compare or a stash (`:36-46`);
- the diff dialog (`dialogs/DiffDialog.tsx:33`), the same `CommitDiff` on the same store; the pane behind it stays
  mounted and reloads as well;
- the commit panel, `DiffColumn` (`CommitPanel.tsx:84-178`): the Changes view (`:62, :73`), the Commit dialog
  (`dialogs/CommitDialog.tsx:37`), and the Stashes dialog's working-tree row (`dialogs/StashesDialog.tsx:225`);
- the Stashes dialog's stash preview (`CommitDiff`, same line).

## Reload triggers

**Reloads of the same file, body mounted.** These are what the fix covers:

1. **Ignore whitespace**, in the details pane and the dialog (`diffStore.toggleWhitespace`, `diffStore.ts:323-328`),
   also from Settings (`settingsStore.ts:132-138`). Not offered while staging (`DiffViewer.tsx:299-307`). Measured.
   The top line stays on top. A line `-w` hides gives way to the first shown line after it.
2. **Context lines**, Settings › Diff & merge: `diffStore.setContext` (`diffStore.ts:330-334`) reloads the pane, and
   the subscription at `commitStore.ts:663-664` reloads the panel. Not measured. Both files are unchanged, and more
   context only adds lines, so the top line exists before and after and stays on top.
3. **The working file changes on disk** (the watcher → status refresh → `syncWithStatus`, `commitStore.ts:375-396`).
   This reloads only when the shown file's own status entry changed (`:391-394`). Measured (the edit above). The same
   line stays on top, though its new-side number moved.
4. **Stage, unstage or discard a hunk or lines** (`withApplying` → status refresh → `loadDiff`,
   `commitStore.ts:277-299`). Not measured. See D3.
5. **git from outside**: `add`, `commit` or `reset` in a terminal reach the panel through the watcher, as in 3.

**Not reloads of the same rows.** These keep today's behaviour:

- **Another file:** the body scrolls to 0 (`DiffViewer.tsx:423-426`); measured in the #32 walk's row 4. **The same
  path in the other list** (unstaged ↔ staged): `commitStore` clears the diff first (`commitStore.ts:203-204`), the
  body unmounts and comes back at the top.
- **Split ↔ unified:** `DiffBody` is keyed on the view (`DiffViewer.tsx:237`), so it remounts at the top. Reasoned,
  not measured. See D2.
- **File content and blame** (`FileContent.tsx`). See D4.
- **A reload that leaves no rows** ("No text changes", `DiffViewer.tsx:233`, for example `-w` on a whitespace-only
  file) or a binary result: the body unmounts, and the next reload starts at the top. There is nothing to anchor to.

## Design

1. **The anchor** is the top row: the row of the previous model whose span holds the old scrollTop, and `within`, how
   many pixels of it are scrolled off. It carries:
   - its hunk (the count of hunk rows up to it, which works in both views) and its row index inside that hunk;
   - its line numbers. A unified line has `oldNo` / `newNo`. A split pair has `left.oldNo` / `right.newNo`. A hunk
     header takes its first line's numbers and is flagged as a header. A no-newline marker takes the line before it.
2. **The mapping**, first match wins:
   1. **Same hunk.** `hunkMap(prev, next)` (`lineSelection.ts:56-71`) matches hunks by the kind and text of their
      lines, not by the header. The cursor and selection carry uses the same match (`DiffViewer.tsx:114-123`). A
      matched hunk renders the same rows in the same order, so the anchor goes to the same row index inside the new
      hunk, with the same `within`. This keeps an edit or a stage elsewhere in the file exact: the anchor's line
      numbers moved, but its hunk's text didn't. The row index is clamped to the new hunk's row count: `hunkId`
      ignores `noNewline` (`lineSelection.ts:54`), so a matched last hunk can gain or lose its no-newline row
      (`diffRows.ts:81, 111`).
   2. **By line number**, when the anchor's hunk has no match: the whitespace toggle or a context change rewrote it,
      or the edit or stage was inside it. A deleted-line anchor is compared with the new rows' `oldNo`; any other
      anchor with their `newNo`. Rows without that side are skipped: added lines for `oldNo`, deleted lines for
      `newNo`, headers and no-newline markers for both. Find the first remaining row whose number is at least the
      anchor's. Both numbers only grow down the rows, in both views. Which side stays fixed depends on the trigger
      (L2).
      - An equal number: that row, same `within`.
      - Otherwise the line is hidden or gone: the first line after it, `within` 0. When that line is its hunk's
        first, use the hunk's header instead, so the hunk lands whole.
      - A header anchor: `within` 0, with the same header rule.
   3. **Past the last row:** the last row; the browser clamps the offset to the end. No previous rows, or another
      path: nothing, and the path reset stays.
3. **Where it lives:** a new pure module, `DiffViewer/scrollAnchor.ts`, with one export:
   `carryOffset(prevDiff, prevRows, top, nextDiff, nextRows): number`. It computes the offsets from `rowHeight`
   (`diffRows.ts:30`).
   - **Cost:** `carryOffset` runs `hunkMap` a second time per reload; the `[diff]` effect already runs it once
     (`:116`). Each run joins the text of every line of both diffs (`lineSelection.ts:54`). So a reload costs about
     twice the total line text of both diffs, plus one pass over the rows.
4. **`DiffBody`:**
   - It takes `diff` as a prop, and a ref keeps `{ path, diff, rows }` from its last commit.
   - The `[rows]` effect (`:417-421`) becomes one `useLayoutEffect`, in this order:
     1. Read `old = virtualizer.scrollOffset`. It still holds the old position: the browser's clamp to a shorter body
        only reaches the virtualizer through the next scroll event (virtual-core `index.js:495`).
     2. When the path is the same and `carryOffset(...)` differs from `old`: call `scrollToOffset(next)`, then set
        `virtualizer.scrollOffset` to the value the DOM accepts, `Math.min(next, el.scrollHeight - el.clientHeight)`.
        This is what virtual-core's own anchor path does (`index.js:372-375`):
        `scrollToOffset` writes only the DOM (`:1110-1124`), so without the assignment any read before the scroll
        event gets the old offset back. That includes the render that `measure()` triggers and a
        `scrollToIndex(…, "auto")`, which returns the current offset when the row looks in view (`:1095-1096`) and
        writes it (`:1148`).
     3. On any same-path reload, set the `quiet` ref (Design 5). When the path changed, clear it.
     4. Call `measure()`. Its re-render then draws the rows around the anchored offset.
   - It is a layout effect so that the first paint of the new rows is already at the anchor. The comment at `:422`
     is rewritten.
   - Reasoned, not measured: the re-render already reads the new offset, so no frame should show blank, whenever the
     scroll event arrives. The walk's recorder checks this.
   - `scrollOffset` is a public field (virtual-core 3.19.2 `index.d.ts:114`).
5. **The cursor** (owner, 2026-10-17, review passes 1–3). On a reload the cursor effect (`:441-460`) doesn't
   scroll; it only refocuses. The anchor owns the reload's scroll, and the next key press brings the cursor into view.
   - **The mechanism is a `quiet` ref.**
     - It is set by step 3 above, on any same-path reload.
     - It ends on the body's `pointerdown`, which covers a click's edge nudge and a hunk button's cursor move, and in
       step 3 when the path changes. A reload while the diff doesn't have the focus is then harmless, and a second
       reload before any key sets it again.
     - While it is set, the cursor effect's scroll branch is skipped, S1's reveal and `scrollToIndex` alike, but its
       `focusCursor` still runs.
   - **The first key after a reload** (owner, passes 2 and 3). It is handled in the body's `onKeyDown` wrapper, when
     all of these hold:
     - `quiet` is set;
     - the diff is in staging mode (`actions`, which `DiffViewer` passes only with `lineActions`) and
       `cursorRow >= 0`, the effect's own guard (`:445`). Without it, split view's empty picks give `cursorRow` −1,
       which `scrollToIndex` clamps to row 0 (virtual-core `index.js:1130`) and so jumps to the top; and the
       read-only unified diff would jump to a cursor it doesn't draw (`:147-155`);
     - the key is one `onBodyKeyDown` acts on: ↑, ↓, Space, Enter or Delete.

     Then the wrapper clears `quiet`, calls `scrollToIndex(cursorRow, { align: "auto" })` to bring the cursor in, and
     sets `virtualizer.scrollOffset = scrollRef.current.scrollTop`, so that the cursor effect and S1's reveal read the
     true offset. It then calls `focusCursor(root)` (`:435-440`, which retries a frame later), because the cursor line
     may not have been mounted when the reload refocused: it can sit outside the 30-row overscan. Rows are keyed by
     index (`:525`), so until then the focus stays on whatever row fills the old slot. Then it passes the key to
     `DiffViewer`'s handler as usual.
     - Every other key leaves `quiet` set: Tab and Shift+Tab, a lone Shift or Ctrl, PageUp, PageDown, Home and End.
     - This covers the keys that don't move the cursor: Space, Enter, Delete, ↑ on the first pick, ↓ on the last, and
       Shift+↑ / ↓ stopped at a hunk's edge (`:170`). Without it, those keys would act on a line nobody can see.
     - A key that does move the cursor then scrolls a second time, through the cursor effect, by the merged rule
       (*Overlap*). Because `scrollOffset` was updated, the end state shows the cursor.
   - **Why a ref that lasts until the next key,** rather than a skip only in the commit that brings the new rows: a
     reload changes `cursorRow` twice. First, in the commit with the new rows, the old index points into the new
     picks (`:155`). Then `setCursor` corrects it one render later (`:118-123`), in a commit with no new rows. A skip
     limited to the first commit would still scroll on the second.
   - The selection carry (`:109-130`) doesn't change.
6. **Also unchanged:** the path reset, the focus repair (`:463-469`), the virtualizer options and the stores.

**Known limits**, flagged:

- **L1:** `hunkMap` pairs identical hunks in order, so two hunks with exactly the same lines (context included) can
  send the anchor to the wrong one. Rare, and the cursor carry already has the same limit. No guard is planned. Add
  one (for example, accept a match only when one side's start line is unchanged) if it ever shows.
- **L2:** step 2 goes by the new side (the old side for a deleted line), but which side stays fixed depends on the
  trigger.
  - In the unstaged diff, a disk edit leaves the old side (the index) fixed; a stage leaves the new side (the file)
    fixed.
  - In the staged diff, an unstage leaves the old side (HEAD) fixed.
  - The whitespace toggle and a context change leave both fixed.

  So when the anchor's own hunk changes under a disk edit or an unstage, an edit inside that hunk, above the anchor,
  moves the view by that edit's own added lines, which the hunk bounds. Reasoned.

## Decisions for the owner

**D1. Anchor on the top row, or on the cursor?**

- *What it is:* a cursor row exists wherever `picks` does. That is the staging diff, and the read-only unified diff
  too (`DiffViewer.tsx:147-150`). Only staging moves it by key and draws it (`:163`, `:616-625`), but the cursor
  effect (`:441-460`) scrolls on any change of `cursorRow` while the diff holds the focus, and a reload's change
  counts. After a reload, the view can keep the top row at the top, or keep the cursor's line where it sat.
- *Why now:* it decides what the anchor is, and the rest of the design follows from it.
- *Options:*
  - (a) **The top row, everywhere.** One rule for every surface. When the cursor's hunk survives, the cursor moves with
    the rows around it, so it stays where it sat (reasoned).
  - (b) **The cursor when it is in view and focused, else the top row.** Two rules. The cursor's new row is set one
    render later, by `setCursor` in an effect (`:123`), so this needs a second scroll after the anchor's: a visible
    jump, or a rework of the effect order.
- *Known and not:*
  - The cursor carry is unit-tested (`DiffViewer.test.tsx`). Where it ends up on screen after a reload was never
    measured.
  - Review pass 1 found that today's code can already undo a reload's scroll. Read in virtual-core, not measured:
    `scrollToIndex(…, "auto")` reads `scrollOffset`, which only the scroll event updates (`index.js:495`). With an
    in-view row it returns that offset (`:1095-1096`) and writes it back (`:1148`). React's passive effects likely
    run before the scroll event, because zustand's `useSyncExternalStore` renders at sync priority. In that same
    commit `cursorRow` is still the old index on the new picks (`:155`).
- *Recommend (a):* one rule, and in the common case it keeps the cursor in place too.
- **Owner, 2026-10-17: (a)**, the top row everywhere.
- **Owner, 2026-10-17, review pass 1 (finding F1):** on a reload the cursor effect doesn't scroll, it only refocuses.
  The anchor owns the reload's scroll, and the next key press brings the cursor into view (Design 5). After that key,
  the polish plan's S1 header reveal applies as usual.
- **Owner, 2026-10-17, review pass 2 (findings F1, F2):**
  - On the first key after a reload, while `quiet` is set: clear it, scroll the cursor into view, then let the key act
    as usual.
  - `quiet` also ends on the body's `pointerdown`, and when the path changes (Design 5).
- **Owner, 2026-10-17, review pass 3 (finding F2):** only the keys `onBodyKeyDown` acts on (↑, ↓, Space, Enter,
  Delete) clear `quiet` and scroll the cursor in first. Other keys leave it set. Pass 3's F1 limits this to the
  staging diff with a cursor (Design 5), a scoping of the ruling, not a new decision.

**D2. Is split ↔ unified in scope?**

- *What it is:* switching views starts the diff at the top today, because `DiffBody` remounts (`key={flat.view}`,
  `DiffViewer.tsx:237`). This is reasoned from the code; the #32 walk didn't try it.
- *Why now:* it is the one remaining trigger that §AN's fix idea could reach. A "no" leaves it as an open-items row.
- *Options:*
  - (a) **Out.** It stays at the top, the walk records it as an observation, and a new row goes in `open-items.md`
    §AN with the reopen trigger "the jump to the top gets in the way". Costs nothing now.
  - (b) **In.** Keep the anchor across the switch. The two views' rows differ, so only step 2 (by line number)
    applies. The previous rows and offset must outlive the remount. Either lift the ref into `DiffViewer` (~15 lines
    and a test), or drop the key. Dropping the key also carries the virtualizer's state and the `held` focus flag
    across views, which no test covers.
- *Recommend (a):* it isn't the measured problem, switching views is a deliberate act, and the top is a predictable
  place to land.
- **Owner, 2026-10-17: (a)**, out of scope. The coordinator wrote the row, in `open-items.md` §AO.

**D3. Where should the view land after a hunk is staged?**

- *What it is:* Stage hunk or Discard hunk in the unstaged diff, or Unstage in the staged one, removes that hunk, and
  the rows below it move up.
- *Why now:* it is the one reload where the user's own action changes the content.
- *Options:*
  - (a) **Let the anchor handle it, with no extra code.** If the top row is above the staged hunk, nothing above
    moves and the next hunk slides into its place (today's pixel offset does the same; reasoned). If the top row is
    in the staged hunk (its header at the top, where the button is), the next hunk's header lands where the staged
    one's was. A hunk staged above the view (from a terminal) no longer shifts the view.
  - (b) **Scroll to the line the cursor lands on**, the one that takes the hunk's place (`:197-200`, `:123`). A
    second rule, and mostly the same place as (a).
  - (c) **Keep the pixel offset after the app's own mutations.** `DiffBody` would have to know what triggered the
    reload, which it doesn't today.
- *Known and not:* no walk has staged with the view scrolled down. (a)'s outcome is reasoned, and walk row 5 checks
  it.
- *Recommend (a).*
- **Owner, 2026-10-17: (a)**, the anchor handles staging, with no extra code.

**D4. Is file content and blame in scope?**

- *What it is:* `FileContent.tsx:173-189` also keeps a reload of the same file in pixels.
- *Why now:* it follows the same pattern, and the §AN row could be read as covering it.
- *Known, reasoned from the code, not walked:* it never reloads different lines for the same path.
  - Its targets are commits, compares and stashes (`DetailsPane.tsx:36-46`, `treeTargetOf` at `diffStore.ts:112-118`),
    and their content never changes.
  - Every row is 20 px (`FileContent.tsx:21, 170`).
  - The whitespace toggle only re-blames the gutter (`diffStore.ts:327`), which changes no height.

  So nothing can shift.
- *Options:* (a) out of scope, with no row; (b) apply the same anchor, which no case would ever use.
- *Recommend (a).*
- **Owner, 2026-10-17: (a)**, file content and blame are out of scope.

**D5. Walk on Linux too?**

- *What it is:* the fix is front-end only, but the scroll clamp and the timing of scroll events belong to the web
  engine: WebView2 on Windows, WebKitGTK on Linux.
- *Options:*
  - (a) **Only the Windows VM over CDP**, like the #32 walk. The walk record says that Linux wasn't walked.
  - (b) **Also Linux**, under Xvfb with openbox (`docs/smoke/smoke-linux.md`), as group BT was. About 30 min more.
- *Known and not:* nobody has measured WebKitGTK's scroll timing for this diff, and the jsdom tests can't see it. The
  ordering in Design 4 follows the HTML event loop, which both engines implement (reasoned).
- *Recommend (a):* the fix is engine-neutral, and the risk it carries (one blank frame) is cosmetic. Take (b) if you
  want the same coverage BT had.
- **Owner, 2026-10-17: (a)**, the Windows VM only. "Linux not walked" goes on the triage list (step 9) as a proposed
  accepted limit.

## Tests

**Unit, `scrollAnchor.test.ts`.** Pure, so jsdom's missing layout doesn't matter. A builder in `diffFixtures.ts`,
`stripes({ wsOdd, ignoreWhitespace, context, insertAfter, drop })`, builds the walk's file as a `FileDiff`:

- 2000 lines `line N`, every 10th changed; `wsOdd` turns the odd tens into a trailing space only;
- context 3 gives one hunk per change. Context 10 gives the single merged hunk git emits, because the gaps of 9 lines
  are within 2 × 10;
- `insertAfter` adds 7 lines right after one hunk's changed line, and `drop` removes one hunk (a stage).

The numbers below come from the 24 / 20 px rows.

1. **An unchanged diff** keeps any offset. With an equal result there's no scroll call, so `DiffViewer.test.tsx:490-500`
   stays green.
2. **Whitespace on, at 15 000** (top row: the deleted line 820, 12 px in) → 7 456: hunk 81 goes to hunk 40 by the
   same-hunk step. Off, at 7 456 → 15 000.
3. **A line `-w` hides, at 14 816** (top row: the deleted line 810, whitespace only) → 7 360, the header of the hunk
   that starts at 817. Off, at 7 360 → 14 904, the 820 hunk's header. The asymmetry is expected.
4. **An edit above:** hunk 9 gains 7 added lines right after its changed line 100, so +140 px and the hunk stays
   apart from the next one. At 12 000 (top row: context line 657, 16 px in) → 12 140. The top row is now old 657 /
   new 664.
5. **Stage the anchor's own hunk** (hunk 65 dropped), at 12 000 → 11 960, the next hunk's header.
6. **Stage a hunk above** (hunk 9 dropped), at 12 000 → 11 816, the same line, by the same-hunk step. The pixel offset
   would have stayed at 12 000.
7. **Context 3 → 10**, at 12 000 → 14 460 (context line 657 inside the merged hunk, 16 px in); back from 14 460
   → 12 000.
8. **Split rows** (`flattenSplit`): a hunk is 164 px (24 + 7 × 20) and the last one 104 px. Case 2: line 820's pair
   12 px in, 13 380 with whitespace not ignored → 6 656 with it ignored, and back. Case 4: the same top pair and the
   same `within`.
9. **The ends:** a top of 0 → 0; a top row past the new end → the last row's start.

**Component, `DiffViewer.test.tsx`.**

- **The mock:** method recorders, today's `scrollToOffset` stub (`:36`) plus the polish plan's `scrollToIndex`
  recorder, with the old position seeded through its `observeElementOffset` stub (*Overlap* below).
  - Not `scrollToFn`: jsdom has no layout, so `getMaxScrollOffset` is 0 and every DOM write clamps to 0
    (`index.js:1048-1051, 1081-1082`). Mounting, clicks and the reconcile add writes of their own (`:551, :1096,
    :1148`, rAF under `pretendToBeVisual`).
  - With `quiet` set, the reload path never calls `scrollToIndex`. So the assertions are `scrollToOffset`'s
    arguments, and no `scrollToIndex` call.
- **Whitespace:** render `stripes()`, then the `-w` diff of the same path → `scrollToOffset` gets `[7456]` and
  `scrollToIndex` nothing. Another path → `[0]` only.
- **Focus in the diff, an edit above** (pass 1, F1): staging mode, a click on a changed line in view, so the cursor sits
  there with the focus. Then the `insertAfter` diff of the same path → `scrollToOffset` gets `[12140]` and
  `scrollToIndex` nothing. The cursor line keeps the focus.
- **The cursor pushed out of view by a reload** → no `scrollToIndex`. Then ↓ → two calls, in this order: the
  wrapper's `scrollToIndex(old cursorRow, "auto")`, then the cursor effect's on the row ↓ moved to.
- **A key that `onBodyKeyDown` ignores** (pass 3, F2): reload, then Tab or PageDown → no `scrollToIndex`; then Space →
  one, since `quiet` was still set.
- **Not the staging diff** (pass 3, F1): split view, and the read-only unified diff; reload, then ↓ → no
  `scrollToIndex`.
- **The first key doesn't move the cursor** (pass 2, F1): a reload pushes the cursor out, then Space → exactly one
  `scrollToIndex(cursorRow, "auto")`, and the line Space toggles is the cursor's.
- **`quiet` ends on `pointerdown`** (pass 2, F2): reload, a pointerdown on the body, then a cursor move by click → the
  cursor effect calls `scrollToIndex` again, as today.
- **Enter on selected lines with the focus held** (pass 1, F2): select a line in the top hunk, Enter, and the staged
  diff arrives → only the anchor's `scrollToOffset`, if any; no `scrollToIndex`.

**What jsdom can't test:** the browser's clamp, the timing of scroll events and a blank frame, whether the CSS row
heights really are 24 / 20, and the focus and cursor on screen. The walk covers these.

## Walk: smoke group BV

A new group **BV** in `docs/smoke/smoke-test-post-v1.md`, after BU (the polish plan's group; BW is the per-tab view
plan's).

**Fixture**, new: `docs/smoke/fixtures/bv-fixture.sh` (`T4_ROOT`, as `bq-fixture.sh` does). It builds a repo `bv`:

- `a.txt` and `w.txt`, 2000 lines `line N` each, committed;
- a commit `ws` that changes every 10th line of `w.txt`: the odd tens get a trailing space, the even tens become
  `line N changed`. A commit is needed because Ignore whitespace is off while staging;
- every 10th line of `a.txt` changed to `line N changed`, left unstaged.

**Setup:** the Windows VM (session git-ui-win), a local `tauri build --no-bundle` of the branch, launched with
`smoke-launch.ps1`. The store is backed up and restored (`docs/smoke/smoke-cdp.md`), the window is
`cdp.mjs --inner 1280x800`, and readings go through `--eval`.

**What each step reads:**

- scrollTop;
- the top row: the row under the scroller's top edge, with its two line numbers or its header text;
- how many pixels of that row are scrolled off;
- through each reload, the 10 ms recorder from the #32 walk (blank, gap and overlapping rows).

**Rows:**

1. **Whitespace, unified:** History › `ws` › `w.txt`. At scrollTop 15 000, Ignore whitespace on → scrollTop 7 456, top
   row the deleted line 820, 12 px off. Off → 15 000, the same row.
2. **A hidden line:** at 14 816 (top row: the deleted line 810), on → 7 360, top row the header
   `@@ -817,7 +817,7 @@`. Off → 14 904, the same header text.
3. **Split view, and the dialog:** the same commit in Split view, at 13 380 (top row: line 820's pair, 12 px off;
   split hunks are 164 px). Ignore whitespace on → 6 656, the same pair, 12 px off; off → 13 380. Then the same in
   **Open diff window**: the dialog's view gives the same numbers, and after closing it the pane's view does too.
4. **An edit above:** Changes › `a.txt` (unstaged). At 12 000 (top row: context line 657, 16 px off), insert 7 lines
   right after `line 100 changed` from a shell (+140 px; after line 101 would add a context row and merge two hunks)
   → the reload → 12 140, top row old 657 / new 664, 16 px off. Restore the file → 12 000, 657 / 657.
   - **4b, with the focus held (F1):** the same, after a click on `line 670 changed` (in view) so the cursor sits
     there with the focus. Edit → 12 140; the recorder sees one scrollTop change. `document.activeElement` is still
     that line, and it is in view.
     - Then ↓ → the cursor moves to the next change, the deleted `line 680`, at 12 552–12 572 after the edit.
     - With the diff region H px tall (read `clientHeight`): for H ≥ 432 it is in view and scrollTop stays 12 140;
       otherwise scrollTop becomes 12 572 − H, the line on the bottom edge.
     - Restore the file.
   - **4c, the cursor pushed below the view, then Space** (pass 3, F6):
     - At 12 000, click `line 670 changed` (12 248–12 268) so the cursor sits there with the focus.
     - From a shell, insert 40 lines right after `line 660 changed`. That is inside the top row's own hunk, so the
       anchor goes by line number, and the cursor's hunk is pushed down 800 px.
     - The reload → scrollTop stays 12 000, top row context line 657, 16 px off. The cursor line now sits at
       13 048–13 068: wholly below the view while H ≤ 1 048, and at least partly below it while H < 1 068.
     - Space, for any H < 1 068 → scrollTop 13 068 − H, with `line 670 changed` on the bottom edge and shown selected
       (`aria-selected="true"`). `document.activeElement` is `line 670 changed`.
     - Space again to unselect, then restore the file.
5. **Stage the hunk at the top (D3):** at 11 960 (the header of line 660's hunk at the top), hover → Stage hunk → the
   unstaged diff stays at 11 960 with `@@ -667,7 +667,7 @@` at the top. Then `git -C <fixture>/bv reset -q a.txt` → the
   staged hunk comes back above → 12 144, the same `@@ -667…` header still at the top.
   - **5b, Enter on selected lines, with the focus held (F1, F2):** at 11 960, click `line 660` (the deleted line) and
     press Enter → it is staged alone. The hunk's text changes, so the anchor goes by line number, to the same
     hunk's header: the view stays at 11 960 with `@@ -657,6 +657,7 @@` at the top, and the recorder sees no scroll
     from the cursor. Then `git -C <fixture>/bv reset -q a.txt` → back to `@@ -657,7 +657,7 @@`.
6. **Context lines:** Settings › Diff & merge › context 10, with `a.txt` at 12 000 → 14 460, top row context line 657,
   16 px off. Back to 3 → 12 000.
7. **What must not change:**
   - another file → scrollTop 0;
   - `touch a.txt` → nothing moves for 4 s;
   - every recorder sample through rows 1–6 (4b, 4c and 5b included): 0 blank, 0 gap, 0 overlap;
   - a console.error / warn and onerror hook installed before row 1 catches nothing;
   - the app log shows 0 WARN and 0 ERROR.
8. **Observation, no box (D2 (a)):** Unified ↔ Split at 15 000 → scrollTop 0, recorded as it is.

The expected numbers assume 184 px hunks. If the walk reads a different hunk height (a font or zoom setting), it
recomputes them from the measured height and says so.

## Steps

0. **The owner's go.** A final plan is not a go.
1. **Branch** `diff-scroll-anchor` once the polish plan has merged (*Overlap* below), not from `266fc96`.
   - **Where from:** before any of the three plans' goes, the coordinator commits the three plans and `open-items.md`
     §AO on `main` once and pushes that commit to `origin/main` on the owner's go. Run `git fetch`, then confirm
     that `git log origin/main..main` is empty and that
     `git log --oneline origin/main -- docs/plans/2026-10-17-diff-scroll-anchor-plan.md` is not; stop and ask the
     owner if either check fails. Then branch from `origin/main`.
   - **Why it matters:** the squash base is then `origin/main` with this plan already on it. The plan isn't folded
     into the squash, and step 12's `git merge --ff-only origin/main` works.
   - **Re-cite first:** every line number this plan quotes, against that `main`, not only `DiffViewer.tsx` and
     `DiffViewer.test.tsx`. The polish plan's S2b also edits `diffStore.ts` (it adds `revealLine`) and
     `FileContent.tsx` (its `[path]` effect). This plan quotes `diffStore.ts:112-118, 155-174, 323-334, 327` and
     `FileContent.tsx:21, 170, 173-189`.
   - The polish plan is archived by then: repoint its path in *Overlap* to
     `docs/archive/plans/2026-10-17-diff-viewer-polish-plan.md`.
   - The re-cite is a docs commit to this plan file. At the squash it folds, by kind, into the records commit
     (step 11).
2. **`scrollAnchor.ts`**, `scrollAnchor.test.ts` and the `stripes()` builder in `diffFixtures.ts` (Tests 1–9).
3. **`DiffViewer.tsx`** per Design 4, and the component test. In `src/README.md`, `:490` "scrolls back to the top only
   when the file path changes" gains "; a reload of the same file keeps its top line (`scrollAnchor.ts`)", and `:496`'s
   list of pure modules gains `scrollAnchor.ts`.
4. **Gates**, from `F:/src/_ pet projects/t4-git-ui` with the uppercase `F:/`: `npm test -- --run` and `npm run build`
   (which runs `tsc` itself, `package.json:8`), the two CI runs. There's no Rust change, so no `cargo test`. Commit
   `fix: a reloaded diff keeps the same line at the top`.
5. **The fixture and group BV** (rows above). Commit `docs: smoke group BV and its fixture for the diff's top line`.
6. **The change review loop** (CLAUDE.md step 5). A finding that needs a decision goes to the owner at once.
7. **Push the branch and open a PR to `main`, on the owner's go at that moment** (owner, 2026-10-17: the polish
   plan's flow). The PR opens early, with the commits not yet squashed. This departs from the order in CLAUDE.md's
   step 7 on purpose (owner), so that CI runs on three OS before the walk. CI is triggered by `ci.yml:11-22` and runs
   the OS matrix at `checks.yml:28`. A red run goes to the owner before anything else.
8. **The walk** on the Windows VM, which fetches the PR's branch `diff-scroll-anchor`. The fetch needs the owner's
   approval there. Then: `npm ci`, then `npm run tauri -- build --no-bundle` with every running copy of the app closed
   (the exe lock), then `smoke-launch.ps1`. Record it in `docs/archive/walks/YYYY-MM-DD-bv-walk.md`, naming the walked
   commit's (pre-squash) hash, and tick BV's rows with the walk's note. The walk record and the ticks are committed in
   the records commit (step 10).
   - **A walk finding** goes through a fix and the change review loop (step 6), then triage. Each push to the PR is on
     the owner's go at that moment, and the rows it affects are walked again.
9. **Triage** (CLAUDE.md step 6), one item at a time. The list starts with "Linux not walked" (D5), proposed as an
   accepted limit.
   - **"Fix it"** goes: fix → the change review loop (step 6) → re-walk the affected rows → push on the owner's go →
     CI → back to triage.
10. **Records**, one docs commit, with no commit hashes yet:
    - the walk record and BV's ticks (step 8);
    - `open-items.md` §AN: the row *The diff keeps its scroll position in pixels across a reload* moves to
      `open-items-done.md`. The polish plan's records create that file's §AN section first, and this row goes into the
      same section, closed with the walk record. The fix commit's hash is left for step 11;
    - check that the split ↔ unified row exists in `open-items.md` §AO (the coordinator wrote it under D2 (a));
    - triage outcomes (CLAUDE.md step 6), starting with "Linux not walked":
      - a deferred row goes to `open-items.md`;
      - an accepted limit with a reopen trigger goes to `open-items.md` §Q;
      - one without a trigger goes to `open-items-done.md`;
    - the plan archived to `docs/archive/plans/` (it is already on `main`, step 1), and every hit of `git grep` on
      its old path outside this plan repointed there (today `open-items.md` §AO's preamble and the archived polish
      plan's *Overlap*).
11. **Package** (CLAUDE.md step 7). The squash rewrites every hash, so hashes are written only after it (owner,
    2026-10-17):
    1. In a throwaway worktree, squash the related commits into three:
       - `fix: a reloaded diff keeps the same line at the top`: `scrollAnchor.ts` and its test, `diffFixtures.ts`,
         `DiffViewer.tsx`, `DiffViewer.test.tsx`, `src/README.md`;
       - `docs: smoke group BV and its fixture for the diff's top line`;
       - the records commit (step 10).

       Fix commits from the review loops, the walk and triage fold by kind: code fixes into the `fix:` commit, smoke
       or fixture fixes into the BV `docs:` commit, and record fixes and step 1's re-cite of this plan into the
       records commit.
    2. Check that its tree is identical to the branch's.
    3. In that worktree, write the hashes and amend the records commit:
       - the squashed fix commit's hash into the §AN done row;
       - in the walk record, the post-squash hash beside the walked pre-squash one ("same tree").

       The records cite only code commits' hashes, never the docs commit's own.
    4. Check that the worktree's diff against the branch is only those hash lines, then move the branch.

    **Force-push to the PR's branch, on the owner's go at that moment.** CI runs again.
12. **Merge once CI is green** (owner, 2026-10-17): fast-forward `main` to the PR's head, on the owner's go at that
    moment. Not GitHub's merge button, so the hashes step 11 wrote survive.
    - The push is `git push origin diff-scroll-anchor:main`, a fast-forward only: no `--force`, and git refuses it if
      `main` has moved. Then, on local `main` (`git switch main`), run `git merge --ff-only origin/main`.
    - If `main` has moved by then because something else landed meanwhile (step 1 already branches after the polish
      plan merged):
      1. rebase onto it;
      2. check with `git range-diff` that the change is identical in code and test files, and that doc hunks differ
         only by the hand resolution of a conflict;
      3. redo step 11 (the tree check and the hashes);
      4. re-run the local gates (step 4);
      5. force-push on the owner's go, wait for CI green, then fast-forward.

      The walk record then says "same change, rebased onto `<main hash>`, range-diff identical in code and test
      files", plus "docs resolved by hand: …" when there were any. The affected BV rows are walked again only if the
      rebase had conflicts in code or test files this change edits (owner, 2026-10-17):
      - `src/screens/RepoWindow/DiffViewer/*`, which takes in `scrollAnchor.ts` and its test, `diffFixtures.ts`,
        `DiffViewer.tsx` and `DiffViewer.test.tsx`;
      - `docs/smoke/fixtures/bv-fixture.sh`.

      A conflict in a doc (most likely `open-items.md`, `open-items-done.md`, `src/README.md`, the smoke doc) is
      resolved by hand and checked in the range-diff, with no re-walk.
    - Optional: delete the branch afterwards, on the owner's go, after a PR lookup on its own step.

    A release isn't part of this plan.

## Overlap with the polish plan

`docs/archive/plans/2026-10-17-diff-viewer-polish-plan.md` (smoke group BU) also changes `DiffBody`'s scroll code.

- **What both touch:**
  - `DiffViewer.tsx`, `DiffBody`.
    - **S1** branches the cursor effect (`:441-460`) on a "moved by ↑" ref, which the region's `onKeyDown` sets and its
      `onMouseDown` clears (polish plan `:121-135`). After an ↑, `scrollToOffset(header start)` brings the cursor's
      hunk header to the top whenever the header is above the view and header-to-cursor fits, even with the cursor
      still in view (`:159-160`). Every other move keeps `scrollToIndex(…, "auto")`.
    - **This plan** rewrites the `[rows]` effect (`:417-421`) into the anchor's layout effect, and adds `quiet` to the
      same `onKeyDown` wrapper.
    - These are different effects in the same function, so they won't conflict textually, but the line numbers shift.
  - `DiffViewer.test.tsx`'s virtualizer mock (`:16-41`). S1 adds an `observeElementOffset` stub that reports a
    hoisted `scrolls.top`, and records `scrollToIndex`. This plan's component test should seed the old offset through
    that stub rather than through `initialOffset`.
  - Both read `virtualizer.scrollOffset`.
- **How the two behaviours meet, on a reload while the diff holds the focus:**
  1. The anchor's layout effect moves the view, sets `scrollOffset` to the new offset and sets `quiet`. All of this
     happens in the commit that brings the new rows.
  2. `cursorRow` changes in that commit, because the old index points into the new picks (`:155`), and once more a
     render later, when `setCursor` corrects it (`:118-123`).
  3. On both changes the cursor effect, by then S1's, sees `quiet`. It skips its scroll, S1's header reveal
     included, and only refocuses (Design 5, the owner's rule from F1).
  4. The next ↑, ↓, Space, Enter or Delete, in the staging diff with a cursor, clears `quiet` and brings the cursor in
     with `scrollToIndex(…, "auto")` (pass 2, F1; scoped in pass 3, F1 and F2). A `pointerdown` or another file also
     clears it.
  - **The merged order in the cursor effect,** the same in both plans: `quiet` → focus only; else a move by ↑ → S1's
    reveal; else `scrollToIndex(…, "auto")`.
  - **Once this plan lands, F1 supersedes S1's carry-over bullets** (polish plan *Design* S1, "The carry-over after a
    reload", and its *Overlap*, "Before the anchor plan lands"). An off-screen carried cursor, after staging, no
    longer scrolls on the reload, and its header isn't revealed either. The anchor keeps the view, and the next key
    brings the cursor in.
- **The risk** came from today's code, not from S1. Review pass 1 found it: `scrollToIndex(…, "auto")` reads a
  `scrollOffset` that only the scroll event updates, so it can write the old offset back over the anchor's (D1,
  *Known and not*). S1 reads the same field. Two things close it: the `scrollOffset` assignment (Design 4, step 2)
  and the `quiet` skip. The checks are in *Tests* (the component tests with the focus held) and in BV rows 4b, 4c and
  5b.
- A staged hunk drops the focus to `<body>` (`:428-432`), so after the button the cursor effect doesn't scroll anyway.
- **Proposed order: polish first, then this plan rebased onto it.** The polish plan is smaller and changes the
  cursor effect that this plan only has to reason about. Rebasing then means:
  - moving the `[rows]` effect;
  - the `quiet` check, gating S1's scroll branch (the reveal and `scrollToIndex`) while `focusCursor` still runs. It is
    not an early return that would skip the refocus;
  - the `quiet` handling in the region's `onKeyDown` wrapper beside S1's ↑ ref, and the `pointerdown` handler;
  - re-citing the line numbers;
  - reusing S1's mock stub;
  - the component tests above.

  The other order would make S1 rebase onto a layout effect it has to reason about too.

## Not in this plan

- **§AN's other rows:** the cursor at the top edge hiding the hunk header (the same scroll code,
  `DiffViewer.tsx:446-457`), a click in file content not moving the blame cursor, and the cut hunk headers. They are the
  polish plan's (*Overlap* above).
- **Split ↔ unified,** under D2 (a): `open-items.md` §AO.
- **A tab switch:** the diff's scroll after `tabsStore` restores a snapshot. That remounts the view; it doesn't reload
  rows in a mounted body.
- **A reload that ends in no rows or a binary file:** the body unmounts (*Reload triggers* above).
- **Seen while reading, not verified, unrelated to scrolling:** `settingsStore.load` sets
  `diffStore.ignoreWhitespace` with a bare `setState` (`settingsStore.ts:119-122`), which doesn't reload the open diff.
  A whitespace default changed in another window would flip the toggle before the diff follows. Never seen. Owner,
  2026-10-17: its own row, `open-items.md` §AO, written by the coordinator.

## Review record

- **Pass 1** (2026-10-17): 10 findings, all taken (F1's cursor rule decided by the owner).
- **Pass 2** (2026-10-17): 7 findings, all taken (F1, F2 decided by the owner).
- **Pass 3** (2026-10-17): 6 findings, all taken (F2 decided by the owner).
- **Pass 4** (2026-10-17): 3 findings, all taken.
- **Pass 5** (2026-10-17): nothing found.
- **After pass 5:** hashes after the squash; PR flow aligned (owner).
- **After pass 5:** merge by fast-forward (owner); walk-findings path; walk-record hashes; squash output named.
- **Pass 6** (2026-10-17): 5 findings, all taken; re-walk only on conflicts in own files (owner); PR opens before the
  squash (owner).
- **Pass 7** (2026-10-17): 4 findings, all taken.
- **Owner ruling** (2026-10-17, after pass 7): the re-walk counts only conflicts in code or test files; a doc conflict
  is resolved by hand and checked in the range-diff (raised by the per-tab plan's pass 9, same for all three).
- **Pass 8** (2026-10-17): 2 findings, both taken (step 1's plan-on-`origin/main` check; step 12's range-diff wording
  under the doc-conflict ruling); applied to the sibling plans too.
- **Pass 9** (2026-10-17): 2 nits, both taken (step 12's walk-record wording; a broken wrap).
- **Pass 10** (2026-10-17): nothing found.
- **After pass 10** (2026-10-17): the polish plan's pass-10 finding applied here: the archive step repoints references
  to the old path; step 1 repoints *Overlap* to the archived polish plan.
- **Pass 11** (2026-10-17): 2 findings, both taken (the repoint skips this plan's own step-1 check; a doubled "to").
- **Pass 12** (2026-10-17): nothing found.
