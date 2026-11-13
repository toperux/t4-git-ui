# Plan: the output dock's resize bar keeps the keyboard focus when it closes the dock

_Drafted 2026-11-13 against `main` `a9416b22`. Status: **final after review pass 4; not started.** Nothing runs before
the owner's go._

**Goal:** a keyboard user who closes the output dock from its resize bar keeps a place in the window, and can reopen
the dock with the next key without losing that place again.

## Where it stands

- **What happens today.** With the output dock open and the focus on its resize bar (*Resize output*), End takes the
  dock to its collapsed height (28 px). The bar then turns disabled (`aria-disabled`, no `tabindex`),
  `document.activeElement` is `<body>`, and Home does nothing more. The user has to tab back in from the top of the
  window; Ctrl+` still reopens the dock.
- **Measured** on the Windows VM on 2026-11-13, on a build of `main` at `387291d3` (`react-resizable-panels` 4.16.1)
  and on #46's build (4.21.0): identical at every step (`docs/archive/walks/2026-11-13-deps-npm-walk.md`). So it is
  older than #46. The owner ruled the same day: fix it, in its own plan (`open-items.md` §AW).
- **Why End closes the dock (read).** The dock's panel is `collapsible` (`RepoWindow.tsx:333-340`), so the bar's
  lowest position is the collapsed one, and the library's End goes there. The app treats that as the user shutting
  the dock: the bar's `onKeyDown` raises the dock gesture (`:181-185`), the gesture's end sees 28 px and calls
  `setOpen(false)` (`:321-328`), and a closed dock disables the bar (`:173`). A drag down to the header does the
  same on purpose (`:315-319`).
- **Other keys on the bar.** ↓ with the dock at its smallest open height (160 px) should close it the same way: the
  library turns a step past a collapsible panel's minimum into a jump to its collapsed size (read in its 4.21.0
  `dist`, not measured). Enter on the bar does nothing (measured, row a3 of that walk).
- **Why the focus is lost (reasoned, not measured apart from the result).** The focus sits on the bar's element, and
  the disabled bar is no longer focusable, so the browser drops the focus to `<body>`. Two more ways into the same
  loss, neither walked:
  - a drag that ends on the header: the library focuses the bar on the press (read), and the drag's end goes through
    the same close;
  - Ctrl+` pressed while the bar holds the focus: the shortcut is let through there (`useShortcuts.ts:49-52`).
- **What closes the dock (read):** the gesture's end (`RepoWindow.tsx:327`), the header's toggle (`OutputDock.tsx:43`)
  and Ctrl+` (`useShortcuts.ts:51`). Operations only ever open it.
- **Where the focus could go.** The dock's header has a toggle button, labelled *Collapse output* while the dock is
  open and *Expand output* while it is closed (`OutputDock.tsx:43`). It is the control that undoes what End just
  did.
- **The toggle does not survive an open or a close (read).** Closed, `OutputDock` returns the header itself; open, it
  returns a wrapper with the header inside (`OutputDock.tsx:48-57`). The root element changes, so React removes the
  old header, toggle included, and mounts a new one. A focused toggle is therefore removed from the page whenever it
  is used: Enter on *Collapse output* loses the focus today. That is true in the tests' `jsdom`; in the app it is
  reasoned, not measured.
- **What the library lets through on the bar (read in the 4.21.0 `dist`).** `Separator` sets its own `onFocus`,
  `onBlur` and `ref` over anything passed in, so the app cannot watch the bar's focus through props. It honours
  `elementRef`, and it passes `onKeyDown`, `onPointerDown` and `onDoubleClick` through, which the app already uses.
  `Panel` takes an `elementRef` too.

## Decisions

- **D1. What End should do: (a), ruled by the owner on 2026-11-13.**
  - **(a) Keep the collapse, move the focus to the header's toggle.** End still shuts the dock, as a drag to the
    header does. The focus lands on *Expand output*, so Enter or Space reopens the dock at its last height. No key is
    taken from the library, and the bar stays disabled while there is nothing to resize.
  - **(b) Keep the bar focusable while the dock is closed,** so Home or ↑ reopens it from the bar. It reverses the
    current rule that the bar is disabled while the dock is collapsed (`:169`), and a closed dock could then be
    dragged open from the bar, which the dock's height bookkeeping (`:315-328`) was not written for. Larger, and
    riskier for the dock's height rules, which took several walks to get right.
  - **(c) Stop End at the dock's smallest open height (160 px)** and leave collapsing to Ctrl+`, the toggle and the
    drag. The key has to be caught before the library's own listener on the bar. It makes the keyboard differ from
    the drag, which does collapse.
- **D2. The header stays in place across open and close: ruled by the owner on 2026-11-13.** Without it the fix ends
  one key later: Enter on *Expand output* opens the dock and removes the button that had the focus. `OutputDock.tsx`
  keeps the header at one place in its tree in both states, so the toggle is the same element before and after. It
  also mends today's loss on Enter on *Collapse output*. The alternative, leaving it out and deferring that loss, was
  not taken.
- **A. A drag that ends on the header gets the same focus move** under (a), because it goes through the same close
  with the focus on the bar. Taken as part of the fix, not as a separate behaviour.
- **B. The focus moves only when the bar holds it at the moment the dock closes, whichever way it closes.** That
  covers the key gesture, the drag and Ctrl+` pressed on the bar. A dock closed while the focus is anywhere else
  (Ctrl+` from the grid, a click on the toggle) is left alone.
- **C. Home after the close stays as it is** (the bar is disabled). With the focus on the toggle it no longer
  reaches the bar.
- **D. Tests for the app's rule, a walk for the webviews.** `jsdom` 31 does move the focus off an element that
  stopped being focusable, but later, on its rendering interval. So a test can show today's loss by waiting for it,
  if the stand-in for the bar drops its `tabindex` when disabled as the library does. Whether WebView2 or WebKitGTK
  blurs the bar at once when its `tabindex` goes, or at the next rendering update, is not known; the fix must not
  depend on it (step 1), and the walk looks at both.
- **E. No `aria-expanded` on the toggle.** A review suggested it so that a screen reader hears the state where the
  focus lands. The button's label already changes with the state (*Expand output* means the dock is closed), so it
  is left as it is.

## Steps

1. **The header stays in place** (D2), in `OutputDock.tsx`: one root element in both states, the header its first
   child, the log and the prompt added while open. The collapsed dock keeps its 28 px box and its look; the open
   dock keeps its layout. What that asks of the styles (`OutputDock.module.css`, read):
   - the root fills the panel's row in both states. Today the closed header is the panel's only child, a flex item
     in a row, and `.dock`'s `width: 100%` is what keeps it from shrinking to its text;
   - the header keeps `flex: none`, its top border, and its bottom border only while open (`.dockOpen`);
   - the root has `min-height: 0` and `overflow: hidden` in both states, as the open root has today;
   - the comments at `OutputDock.module.css:1` and `:3-4` describe the old tree and are brought in line.
2. **The focus move,** in `RepoWindow.tsx`:
   - the bar's element comes from the `Separator`'s `elementRef`, and the dock's from its `Panel`'s `elementRef`;
   - **the check** is made when the store's `open` goes from true to false (the previous state open, the new one
     not), in a subscription to the store. That runs inside `setOpen`, before React re-renders and so before the
     bar loses its `tabindex`. It only notes whether `document.activeElement` is the bar. Nothing depends on when
     the browser blurs a bar that stopped being focusable. The note is written on every change of `open` (set only
     on a close with the bar focused), and the layout effect clears it whenever it runs, moved or not, so a note
     cannot wait for a later close;
   - **the move** is made in a layout effect on the open-to-closed change: if the note says so, the toggle inside
     the dock's element takes the focus (`preventScroll`). By then its label reads *Expand output*, so a screen
     reader announces the state the dock is in. Focusing it straight from the subscription would announce
     *Collapse output* on a dock that has just closed;
   - the toggle is found inside the dock's own element by a marker on the button (`IconButton` passes a `data-*`
     attribute through), not by its label, which changes with the state, and not by a document-wide query;
   - a prop that `DockPanel` gains for this is optional, or passed at its three call sites in
     `OutputDock.test.tsx`.
3. **Tests.**
   - `RepoWindow.test.tsx`: its mock of `react-resizable-panels` copies what the library does with these props, or a
     broken fix would pass. `Separator` honours `elementRef`, drops `onFocus`, `onBlur` and `ref`, passes
     `onKeyDown`, `onPointerDown` and `onDoubleClick`, and renders its label, `aria-disabled` and a `tabindex` only
     while enabled. `Panel` honours `elementRef` and keeps the dock panel's props, so a test can call its
     `onResize`. `Group` stays as it is: forwarding its `elementRef` would start the dock's heal, which needs a
     `ResizeObserver` the file does not stub. The `OutputDock` mock renders a toggle that reads the store and stays
     mounted. The cases, each with the dock open at the start:
     - the key gesture: the bar focused, End pressed on it, the dock panel reporting 28 px, two animation frames:
       the store is closed and the focus is on the toggle. On `main` this case fails (the focus is on the bar, then
       on `<body>`, never on the toggle);
     - the drag: the bar focused (the library focuses it on a press; the mock does not), a primary-button press on
       it, 28 px reported, a `pointerup` on the window, two frames: the same;
     - Ctrl+`'s path, the store closed directly while the bar holds the focus: the focus is on the toggle;
     - the store closed while a button outside the dock holds the focus: the focus does not move.
   - `OutputDock.test.tsx`, on the real component: with the toggle focused, opening and then closing the dock
     leaves the focus on the same element both times. On `main` this fails.
4. **Gates,** with `node_modules` at the lock's versions (`npm ls react-resizable-panels vitest zustand` reads
   4.21.0, 5.1.0 and 5.1.0; `npm ci` if not): `tsc`, `npm test -- --run`, `npm run build`; the Rust gates are
   untouched but run before a push as always.
5. **Change review** (CLAUDE.md step 5) until a pass finds nothing.
6. **The walk,** on the Windows VM and the Linux VM, a build of the fix commit, `document.activeElement` read
   after each step:
   - dock open, focus on *Resize output*, End: the dock is collapsed and the focus is on *Expand output*; Enter: the
     dock is open at the height it had before End, and the focus is on the same button, now *Collapse output*;
     Enter again: closed, the focus still there;
   - ↓ on the bar with the dock at 160 px: the same as End (or, if ↓ does not close the dock, recorded as that);
   - the bar dragged down onto the header with the mouse: the dock is closed and the focus is on the toggle;
   - Ctrl+` with the focus on the bar: the dock closes and the focus is on the toggle;
   - Ctrl+` with the focus in the revision grid: the dock closes and the focus stays in the grid;
   - the focus ring on the toggle, recorded for each of the above (expected, reasoned: a ring after a key, none
     after the drag);
   - the collapsed dock's header and the open dock's header, log and prompt read with `getBoundingClientRect()` on
     this build and on a build of `main`: the same boxes (step 1 changed the tree, not the layout);
   - arrows, Home and a double-click on the bar behave as in rows a3 and a5 of the 2026-11-13 walk, End excepted.
7. **Records:** a smoke row for the bar's End key and the toggle's Enter in the dock's group of
   `docs/smoke/smoke-test-post-v1.md`, ticked from the walk; `open-items.md` §AW's row moved to the done file; an
   open row for what "Not in this plan" leaves; the walk record; this plan archived.
8. **Package** (CLAUDE.md step 7): the fix with its tests as one `fix:` commit, the records as one `docs:` commit;
   push on the owner's go. It ships with the next release.

## Not in this plan

- **Ctrl+` with the focus in the dock's prompt.** The prompt unmounts with the open dock (`OutputDock.tsx:48-57`),
  so the focus is lost there too (read, not measured). It is a different control and a different answer (where
  should the focus go when the field it was in is gone?), so it gets an open row in step 7, not a fix here.
- **The details pane's resize bars,** which mount by layout tier (`DetailsPane.tsx`) and could unmount under the
  focus when the window changes tier (reasoned only). Into the same open row.
- The diff cursor that loses the keyboard after a long scroll (`open-items.md` §AT): the same kind of loss, a
  different mechanism, with its own reopen trigger.
- Any change to what a drag or a key does to the dock, to the dock's heights or to the heal after a squeeze.
- The other resize bars' panels: none is collapsible, so none can disable its own bar under the focus.

## Review record

- **D1, 2026-11-13:** the owner ruled (a), on the three options as written above.
- **Pass 1 (2026-11-13): 12 findings, all taken; one needed the owner.**
  - **The toggle is rebuilt on every open and close,** so the reopening Enter would lose the focus again. Put to the
    owner, who ruled to include the header's fix: decision D2, step 1, the `OutputDock.test.tsx` case and two walk
    rows.
  - **`Separator` drops `onFocus`, `onBlur` and `ref`,** so step 1's "its focus and blur events" could not be built,
    and a mock that forwarded them would have passed with a fix that does nothing in the app. The bar is reached
    through `elementRef`, and the mock copies the library's handling.
  - **The timing of the browser's own blur is not known,** so the check moved to the store's change, ahead of the
    render that disables the bar.
  - **Decision B contradicted the fix for Ctrl+` pressed on the bar,** where the focus is lost today as well. B now
    reads "whichever way it closes".
  - **Decision D was wrong about `jsdom` 31,** which does apply the rule, later. Reworded.
  - **The third test did not test a drag,** and "the dock's own group" was the window-wide group, whose ref the
    test file cannot forward without a `ResizeObserver`. The drag is driven as a gesture; the toggle is found in
    the dock panel's element.
  - **"By an operation ending" was wrong:** nothing but the gesture's end, the toggle and Ctrl+` closes the dock.
  - Added: ↓ at 160 px, the focus ring and the boxes in the walk; "End excepted" in its last row; the prompt and
    the details pane's bars under "Not in this plan".
  - Not taken: `aria-expanded` on the toggle (decision E).
- **D2, 2026-11-13:** the owner ruled to include the header's fix.
- **Pass 2 (2026-11-13): one defect of wording and four points, all taken.** The mechanism, the header's change,
  the toggle's element and the five tests were checked against the code and hold.
  - **Focusing the toggle from the subscription would announce the wrong state** (reasoned): the label still reads
    *Collapse output* until React re-renders, and decision E leans on the label. The reviewer put it as a choice;
    taken under the owner's 2026-10-21 rule, since one of the three ways is right at no cost: the subscription only
    notes that the bar held the focus, and a layout effect moves it once the label has changed.
  - The drag test focuses the bar itself, which the library does on a press and the mock does not.
  - Step 1 names the styles that must survive the new root; a new `DockPanel` prop is optional or passed in three
    test calls; the gates check the installed versions first.
  - Noted, no change: Ctrl+` pressed on the bar also raises the bar's gesture, so `setOpen(false)` is called twice;
    the check reads the change from open to closed, not the call.
- **Pass 3 (2026-11-13): one defect, about the review itself, and one gap; both taken.**
  - **Passes 1 and 2 had read the library in 4.16.1, not 4.21.0:** the checkout's `node_modules` were still from
    before #46 (`react-resizable-panels` 4.16.1, `vitest` 5.0.5, `zustand` 5.0.16, against the lock's 4.21.0, 5.1.0
    and 5.1.0). `npm ci` was run in the checkout the same day, and pass 4 reads the same facts again in what is now
    installed: what `Separator` does with `onFocus`, `onBlur`, `ref` and `elementRef`, the press that focuses the
    bar, ↓ at the minimum, `Panel`'s `elementRef`, and `vitest`'s `requestAnimationFrame` under `jsdom`.
  - **The note's life was not stated:** when it is written and when it is cleared. Step 2 says so now.
- **Pass 4 (2026-11-13): no findings.** Every library fact above holds in the installed 4.21.0, `vitest` 5.1.0 and
  `zustand` 5.1.0; nothing that changed since 4.16.1 touches the plan.
