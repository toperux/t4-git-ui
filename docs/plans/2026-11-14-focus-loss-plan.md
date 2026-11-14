# Plan: the keyboard focus survives a control that goes away

_Drafted 2026-11-14 against `main` `fea9207e` (the code of v0.10.26). Status: **final after review pass 4
(2026-11-14); not started, it waits for the owner's go.**
Measurement: `docs/archive/walks/2026-11-14-focus-loss-measurement.md`. The row it answers:
`docs/plans/open-items.md` §AX._

**Goal:** a keyboard user whose focused control disappears keeps a working place in the window: in the output dock,
and when the window's width rebuilds the details pane or the commit panel.

## Where it stands

All of this was measured on 2026-11-14 on both VMs (Windows: the installed 0.10.26 over CDP; Linux: a debug build of
the same code over WebDriver), unless a line says read or reasoned.

- **What a loss is.** The focused element is removed from the page and `document.activeElement` becomes `<body>`.
  Arrows and letters then do nothing visible, nor Space (tried on Windows) nor Enter (tried on Linux), until the next
  Tab or click; Ctrl+` still works.
- **Where Tab goes then.** Tab and Shift+Tab continue from about the lost control's place, on both webviews, in
  every row but one: after Ctrl+` in the prompt, which is the window's last control, the first Tab on Windows leaves
  the page and the second lands on the toolbar's first control; on Linux the first Tab lands on the dock's toggle.
- **No event tells the app.** Linux fires no `focusout` when the focused element is removed; Windows fires one with a
  null `relatedTarget`. A fix cannot hang on that event.
- **The dock:**
  - Ctrl+` with the focus in the prompt (*Run git command*): the open dock's body is unmounted
    (`OutputDock.tsx:54-61`), the prompt with it. The shortcut is let through in a text field on purpose
    (`useShortcuts.ts:49-52`).
  - The text typed in the prompt and not yet run is gone when the dock reopens: it is the prompt's own state
    (`OutputDock.tsx:72`).
  - Cancel in the header exists only while the last operation shown runs (`OutputDock.tsx:37-41`). It went away
    under the focus after Enter on it, with the dock open and collapsed, and when the operation ended by itself.
    Read: it also goes when a tab switch shows another repository's operations.
  - Reasoned from one Windows reading (Cancel took three Shift+Tab with output present): on WebView2 the log, a
    scroller with no `tabindex`, can hold the focus too, and is unmounted with the open dock in the same way.
- **The window's width, two panes.** `DetailsPane.tsx:60-112` returns a different tree for each of three layouts,
  picked by the window's inner width (`layout.ts`: three columns from 1340 px, two below, narrow below 800).
  `CommitPanel.tsx:44-81` has two, split at 800. Read: React keeps what sits at the same place with the same type
  in both trees and rebuilds the rest.
  - Rebuilt across 1340: the commit details, the file list and the diff. Measured lost there: the file list
    (*Changed files*), the diff's body (*Diff*) and the diff header's buttons (*Unified view*, *Open diff window*).
  - Rebuilt across 800 in the details pane: the commit details and the file list (the list measured lost). Read,
    not measured: the diff is at the same place in the two-column and the narrow tree, so it survives.
  - Rebuilt across 800 in the commit panel: the file lists and the message column (*Summary* measured lost). Read,
    not measured: the diff column and the bar *Resize file lists* are at the same place in both trees and survive.
  - Kept, measured across 1340: the first resize bar of the details pane, which is only relabelled (across 800 it is
    read, not measured), and the revision grid, which is outside the pane. The selected file, its diff and the
    typed summary are kept in every case; only the focus goes.
- **The file lists draw their rows late (read in `@tanstack/virtual-core` 3.19.11, not measured).** A list that was
  just mounted has no row in its first commit: the rows come once it has measured itself. So a rebuilt row, or a
  button on it, does not exist yet at the moment a layout effect of the pane runs.
- **How often (reasoned, not measured).** Maximizing or restoring a window usually crosses 1340 px, so the width case
  is the one a user is likely to meet: the arrow keys stop stepping through files. The dock cases need an unusual
  key sequence.
- **What already exists.** `DockPanel` (`RepoWindow.tsx:280-297`) hands the focus to the header's toggle when the dock
  closes while its resize bar holds the focus: a note taken in the ops store's own change, before the render, and
  the move in a layout effect after it (`docs/archive/plans/2026-11-13-dock-end-key-focus-plan.md`).

## Decisions

- **S. Scope: the dock and the width change. Ruled by the owner, 2026-11-14,** on three options (the dock alone; the
  dock and the width change; everything seen). "The width change" is the two panes that were measured; the toolbar
  and the sidebar across a width are sightings (taken under the owner's 2026-10-21 rule and listed the same day).
  The toast's *Dismiss* and the switch of view get open rows, not a fix (see *Not in this plan*).
- **D1. In the dock, the header's toggle takes the focus. Confirmed by the owner, 2026-11-14.** Whenever the dock
  closes while the focus is on its resize bar or anywhere inside the dock, and the focus is not inside the dock
  afterwards, the toggle takes it; and when Cancel goes away under the focus, the toggle takes it. This rewrites
  decision B of the 2026-11-13 plan, which left alone a dock closed with the focus anywhere but the bar. Left alone
  still: a click on the toggle, Ctrl+` with the focus outside the dock, Ctrl+` with the focus on a Cancel that
  stays. Not taken: going back to whatever held the focus before the dock was entered (it needs a record of that,
  and the element may be gone too); the prompt after Cancel (it exists only in the open dock).
- **D2. The prompt's text survives a close and a reopen** (taken under the owner's 2026-10-21 rule, listed
  2026-11-14). The state moves from `DockPrompt` to `OutputDock`, which stays mounted. It is shared across the
  window's tabs, as today (`DockPrompt` is not keyed by the repository). The completion list does not open by itself
  on the reopened text; the history cursor and the error line start fresh, as on any reopen today.
  - **What that changes for a user:** in a field that appears with text already in it, the list opens at the first
    typed character, not when a click moves the caret, and ↑ walks the history at once. Today no field appears with
    text, so nothing visible changes outside the reopened prompt. Not taken: letting a caret move open the list
    too, which would open it at the first click into the reopened prompt and again after every Escape. Taken under
    the owner's 2026-10-21 rule and listed to the owner on 2026-11-14.
- **D3. Across a rebuilt layout, the same control takes the focus back, and a control on a file row hands it to its
  list. The second half ruled by the owner, 2026-11-14,** against leaving a row's control lost. The rule:
  - **What "the same" means:** the same tag, the same `role` attribute and the same name. The name is the
    `aria-label`; for a form field without one, the text of its `<label>`; otherwise the element's own text.
  - **Before the rebuild,** if the focused element is inside the pane, note it, its tag, role and name, the same for
    each of its ancestors inside the pane that has a `tabindex` attribute, and for a text field its selection.
  - **After the rebuild,** if the noted element is gone: take the noted entries from the element outwards, and focus
    the first whose tag, role and name fit exactly one element of the new tree, if that one is not disabled (two
    that fit, or one that is disabled, is no fit). If none does, do nothing, as today.
  - A row's control finds no twin, so the entry that fits is its list, which is there from the first commit and has
    a `tabindex` (read, for all four lists). That no row exists at that moment is reasoned from the list library,
    not measured; an entry that fits two elements is skipped in any case, so the focus does not land on one of
    several same-named buttons.
  - Focus with `preventScroll`, and put a text field's selection back.
  - One case to know: the two-column layout's own bar *Resize commit details* has no twin at its place in three
    columns, and the one bar of that name there is the first bar, so the focus lands on it. It is the bar that
    resizes the commit details in that layout, on the other axis (read: ← and → move it, not ↑ and ↓).
- **D4. A control that the new layout does not have, and that sits in no list, stays lost (proposed; to be listed at
  the triage as an accepted limit).** Tab still continues from the place. Known cases, read:
  - every control of the commit details when the narrow layout folds them: *Copy SHA*, the parent links, the "+N"
    ref chip, a stash's buttons;
  - *Show commit details*, which only the narrow layout has (the Linux VM saw that loss, 780 → 1400);
  - three bars: *Resize file list*, which only three columns have; the two-column layout's own *Resize commit
    details*, into the narrow layout; *Resize commit message* and *Resize message row*, one in each commit-panel
    tree;
  - *Commit options* going from two columns to three, which has no such button; the controls under it going from
    three columns to two, because the rebuilt message column starts with its options folded (going from two to
    three with the options open they find their twins); an open *Message history* menu, which the rebuild closes.
- **D5. Tests for the rules, a walk for the webviews (proposed),** as on 2026-11-13: `jsdom` shows that the right
  element is focused; only the walk shows it on WebView2 and WebKitGTK, with real keys and a real window size.
- **D6. Three ways to take the note, each where it fits (proposed).**
  - `DockPanel` keeps its note in the ops store's change and only widens the condition.
  - Cancel's note is taken in the cleanup of its ref callback. Read in `react-dom` 19.3.1: React detaches a removed
    element's ref before it takes the element out of the page, so the cleanup still finds Cancel focused, whatever
    removed it (the operation ending, a tab switch).
  - The layout's note is taken while the pane renders the new layout name, when the old elements are still in the
    page. A ref is read and written during render there. Read: the layout name reaches React through
    `useSyncExternalStore`, which renders synchronously; the app has no transition, `Suspense` or error boundary
    that could throw a render away; no lint step and no compiler forbids it; `StrictMode`'s second render in
    development finds the note already taken, as long as it is written only when the name differs.

## Steps

1. **`CommandInput.tsx`: no list on a field that mounts with text.** `closed` starts true (`:62`). Only an edit
   sets it false (`change`, `:107-113`), and with an empty field the list needs an edit before it can open, so a
   field that mounts empty behaves as today. The only other user, `RunCommandDialog.tsx`, starts empty. One
   existing test mounts the field with text and expects the list after a caret move alone ("completes the word at
   the caret and keeps what follows it", `CommandInput.test.tsx:113-124`): it is rewritten to type first, then move
   the caret. → verify: a new case: mounted with text, no listbox; a caret move brings none; a typed character
   brings it. The rewritten case and the rest of the file pass.
2. **`OutputDock.tsx`: the prompt's text.** `text` and `setText` move up into `OutputDock` and reach `DockPrompt` as
   props; `error` stays in `DockPrompt`. → verify: a new case in `OutputDock.test.tsx`: type, close, reopen: the
   text is there and no listbox is shown.
3. **`OutputDock.tsx`: Cancel.** `Button` gains a typed `ref` prop, as `IconButton` has. The note is a `useRef` in
   `OutputDock`, so it dies with the dock (a note kept outside the component would outlive a closed tab and move
   the focus in the next one). Cancel gets a ref callback made once (`useCallback` with no dependencies); its
   cleanup sets the note when `document.activeElement` is the button. A layout effect that runs after every render
   of `OutputDock` clears a set note and focuses the toggle (through a ref on the `IconButton`) with
   `preventScroll`. → verify: cases in `OutputDock.test.tsx`: Cancel
   focused and the op ends → the toggle is focused; Cancel focused and the repository changes to one whose last op
   is not running → the toggle; Cancel not focused and the op ends → the focus is where it was; Cancel focused and
   a new op starts while one runs → still Cancel, the same node.
4. **`RepoWindow.tsx`, `DockPanel`: the dock closing under a focus inside it.** The note becomes: the dock was open
   and the active element is the bar or is inside the dock panel's element. The move becomes: the dock is closed,
   the note is set, and the active element is not inside the dock panel's element. The comment above it is
   rewritten to say so. → verify: in `RepoWindow.test.tsx` the `OutputDock` stand-in gains an input that exists
   only while the dock is open and a second button that is always there (a Cancel that stays); cases: the input
   focused and the store closes the dock → the toggle is focused; the second button focused and the dock closes →
   still that button (this is the case that fails without the "not inside" half); the four existing cases pass
   unchanged.
5. **A hook, `src/screens/RepoWindow/useKeepFocus.ts`,** for D3: `useKeepFocus(key, root)`, where `key` is the
   layout's name and `root` a ref to an element that survives the rebuild. While rendering, when `key` differs from
   the last render's, it takes D3's note from `document.activeElement` if `root` contains it. A layout effect on
   `key` applies D3's rule and clears the note. Candidates are filtered by tag and role before any text is read.
   → verify: `useKeepFocus.test.tsx` with a small two-layout component whose controls are new nodes in each layout
   (each positive case asserts the focused node is not the old one): a labelled button regains the focus; a
   checkbox named by its `<label>` regains it; a field regains it with its selection; a button inside a list with a
   `tabindex`, with no twin → the list; with two twins → the list, not a button; with one twin that is disabled →
   the list; with two twins of which one is disabled → the list; no twin and no list → `<body>`; a focus outside
   `root` → untouched; an element that survived (the same node) → untouched.
6. **`DetailsPane.tsx` and `CommitPanel.tsx` use it.** Each passes its layout name and a ref on its root `Group`
   (`elementRef`; read: the root `Group` is at the same place in every tree, so its element survives, and the
   library merges `elementRef` onto its root `div`). The `Group` stand-ins in `DetailsPane.test.tsx` and
   `CommitPanel.test.tsx` forward `elementRef`, as the `Panel` stand-in in `RepoWindow.test.tsx` does. → verify:
   one case in each pane's test file (set `window.innerWidth`, dispatch `resize`): in the details pane, with files
   seeded, the *Changed files* list focused across 1340 → the new list is focused; in the commit panel, *Summary*
   focused across 800 → the new field is focused, its selection kept. No pane test of a row's control: the panes'
   stand-in for the list library draws rows at once, which the webviews do not, so that case belongs to step 5's
   test and to the walk.
7. **Gates:** `tsc`, the full `vitest` suite, the build. No Rust file changes, so the Rust gates are not run.
8. **Change review loop** (CLAUDE.md step 5), then the branch pushed for the walk on the owner's go.
9. **Walk on both VMs,** the fix's build against the measurement's readings, real keys and real window sizes. In
   the rows on the width, the focus is put on the control by key before each resize (the rows on a row's control
   excepted), and each row records whether the control then shows the focus ring.
   - **The dock:** the measurement's rows A1, A2, B1, B3: the focus is on the toggle after each loss, and the label
     it has at that moment is the right one; A2's text is back in the reopened prompt, with no completion list
     open, and a typed character brings the list. B2 with its new setup: after the close the focus is on the
     toggle, so Cancel is reached with Shift+Tab. Ctrl+` with the focus on the log, on Windows, if the log takes
     the focus there. Each row records the ring, with no expectation (it follows the last input before Ctrl+`).
   - **Left alone:** a click on the toggle (A3); Ctrl+` with the focus in the grid; Ctrl+` with the focus on a
     running Cancel; an operation ending with the focus in the grid.
   - **The width, restored:** rows C1, C2 (both runs) and C6, each in both directions, and C4: the same control
     holds the focus after the resize, the arrow keys step through the file list at once, *Summary* keeps its text
     and its caret.
   - **The width, a row's control (D3):** these controls are not in the tab order, so the pointer puts the focus
     on them and no ring is expected. In the Changes view in tree mode, with a change inside a folder (made in the
     fixture's working tree if it has none): a folder row clicked twice, so it ends as it was; and a row's *Stage*
     button pressed and released outside the list, so nothing is staged and no other file is selected. Each across
     800 → the row's list has the focus, with no ring until the first key, and ↓ moves in it. The same for a
     folder row in the History view's file list, in tree mode, across 1340.
   - **The width, kept without the hook:** C3 and C5; the diff focused in the History view, 1300 → 780; the diff
     focused in the Changes view, 820 → 780.
   - **The width, lost by D4:** *Copy SHA* into the narrow layout with the commit details folded: `<body>`, and Tab
     continues from the place.
   - **Measured on the way, no expectation:** in the Changes view, a commit that cleans the tree made with the
     focus in *Summary*; a file changed on disk from a terminal while typing in *Summary* on a clean tree; a
     maximize while the diff window is open, then Escape: where is the focus each time.
   - **Regression:** smoke group CA rows 1 to 4 once more, since `DockPanel` changes; the console and the log
     clean.
10. **Triage** with the owner, then **records:** a smoke group for the rows above; `open-items.md` §AX's row
    rewritten to what is left (see *Not in this plan*, D4, and whatever the walk measures on the way); the walk
    record; this plan archived.
11. **Package** (CLAUDE.md step 7): the fix with its tests as one `fix:` commit, the records as one `docs:` commit;
    every push on the owner's go. It ships with the next release.

## Not in this plan

Each of these goes into the open row, with what is known.

- **A toast's *Dismiss* loses the focus when the toast leaves by itself** (seen on the Windows VM, not driven as a
  row). The question there is whether a toast that holds the focus should wait, not where the focus goes.
- **A switch of view with the focus on a control only the old view has** (Alt+2 with the focus on *Resize details*,
  seen on the Linux VM, not driven as a row). Where the focus belongs after a switch of view is its own question.
- **The Changes view swapping its message column** when the tree goes from clean to dirty or back
  (`ChangesView.tsx:58-74`; reasoned, not measured): a commit that cleans the tree, or a file changing on disk while
  a message is typed on a clean tree, would drop the focus. Step 9 measures it; a fix would be its own plan.
- **The toolbar and the sidebar across a width** (reasoned only): `Toolbar.tsx` picks its contents by width too, and
  the sidebar folds to a rail below 1000 px.
- **A dialog that returns the focus to its opener** (*Open diff window*, *Open commit window*): after a rebuild
  while the dialog is open the opener is a detached node (reasoned; step 9 measures it).
- **Where Ctrl+` puts the focus when it reopens the dock,** now that the prompt keeps its text: unchanged here.
- **A tab switch with the focus on the log** (WebView2 only): the log is rebuilt per repository.
- **A menu open over a pane that is rebuilt** (a row's context menu, the ref chip's list; read): the menus are drawn
  outside the pane, so the hook never notes a focus in one, and the rebuild takes away the row that owns it.
- The scroll position of a rebuilt diff or of the *Body* field, the commit options folding on a rebuild, and
  anything else about what the rebuilt panes show.
- The drag that shuts the dock (left alone on 2026-11-13, decision A of that plan).
- Any change to which key closes the dock or to what Cancel does.

## Review record

- **S, 2026-11-14:** the owner ruled the dock and the width change, after the measurement.
- **Pass 1 (2026-11-14): two serious defects, eight smaller, seven points for the owner; all taken.**
  - **D3's first form matched a repeated control by its place among its twins.** The file lists draw their rows
    after the first commit, so no row exists when the focus is put back; the test stand-ins do draw them, so a test
    would have passed, and an equal count by chance would have focused another file's *Stage*. Put to the owner,
    who ruled that a row's control hands the focus to its list: D3's present form.
  - **Keeping the prompt's text alone would open the completion list by itself** on the reopened dock
    (`CommandInput`'s `closed` starts false): step 1.
  - **D1 rewrites decision B of the 2026-11-13 plan** and had been taken as obvious: put to the owner, who confirmed
    it.
  - **"Where it stands" said every part of both panes is rebuilt.** The diff survives two of the four changes, and
    one bar of the commit panel survives: corrected, with walk rows for what is kept.
  - **Cancel's note compared `running` across renders** and would have missed a tab switch to a repository with no
    operations: now the ref callback's cleanup (D6).
  - **Two tests could not fail:** the toggle-focused case passes without the "not inside" half (step 4 gains a
    Cancel that stays), and a two-layout test that keeps its nodes passes without the hook (step 5 asserts new
    nodes).
  - Also taken: the pane tests forward `elementRef` and seed files, so the "leave it to the walk" way out is gone;
    D4's list of controls with no twin; the name of a checkbox from its `<label>`, and `role` as the attribute;
    Space and Enter each tried on one VM only; the first Tab after the prompt's loss on each VM; the log as a
    WebView2 scroller; the walk's B2 setup, its focus-by-key rule and the folded details for *Copy SHA*.
  - Into *Not in this plan*, under the owner's 2026-10-21 rule and listed the same day: the scope's reading (the two
    measured panes), the Changes view's swap, the reopening Ctrl+`. Added there without a question: the dialog's
    opener and the log across a tab switch.
- **D1 and D3, 2026-11-14:** the owner confirmed the wider dock rule and ruled that a row's control hands the focus
  to its list.
- **Pass 2 (2026-11-14): five defects, all taken; one point taken under the owner's 2026-10-21 rule.** D3's rule was
  checked against every focusable control of both panes in every layout: each finds its twin, its list, or nothing,
  and no twin is missed. Steps 3 and 4 hold as described.
  - **Step 1 would have failed an existing test,** which mounts the field with text and expects the list after a
    caret move alone. The test is rewritten and the change for a user is stated under D2. The reviewer put it as
    the owner's choice between "only typing opens the list" and "a caret move opens it too"; the first is taken, as
    the smaller change and the one that keeps the reopened prompt quiet.
  - **The walk's row for a row's *Stage* button could not be driven:** those buttons and the folder rows are not in
    the tab order. The row now says how the pointer puts the focus there, and expects no ring.
  - **D4's list** gained the two-column layout's own bar and the other controls of the folded commit details; D3
    names the one case where a bar's twin is a bar on the other axis.
  - **Step 3 now says where Cancel's note lives:** kept outside the component it would outlive a closed tab.
  - **Two overstatements:** "never another file's button" rests on a reasoned fact and says so; the first bar was
    measured across 1340 only.
  - Also taken: a disabled twin is no fit; the dock rows record the ring; menus drawn outside the pane, under *Not
    in this plan*; no pane test of a row's control.
- **Pass 3 (2026-11-14): one small defect, and points of wording and detail, all taken; nothing that blocks the
  work.**
  Step 1's `closed` starting true was checked against every path that opens the list and every test that expects
  one: only the named test relies on a list without an edit.
  - **D4 listed *Commit* while a commit runs.** The button is disabled for the whole commit and holds no focus
    then, so it is no loss of a rebuild: removed.
  - D3 says how a disabled twin and two twins count; D4 says in which direction *Commit options* and the controls
    under it are lost; the pass 2 entry no longer files *Commit* under D4's list; D2 says that ↑ walks the history
    at once; the walk's row for a row's control names the tree mode for the History list, where the *Stage* press
    is released, and "no ring until the first key".
- **Pass 4 (2026-11-14): no defects.** The changed sentences agree with the code and with the rest of the plan.
