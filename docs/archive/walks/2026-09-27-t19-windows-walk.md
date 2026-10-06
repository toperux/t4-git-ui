# T19 (first half): the focus fix on Windows — 2026-09-27

PR #18's pre-merge walk (`docs/archive/plans/2026-09-26-linux-menu-focus-and-restore-plan.md`, T19;
`docs/plans/2026-09-27-pr18-windows-plan.md`, Step 6). The `data-kbd` fix (`src/lib/kbdFocus.ts`, Menu's own mark)
is shared, so Windows was re-walked: AZ 6, the T18 audit's ten paths, and its two cases new on Windows. The
`smoke-walk` skill's Windows route was used throughout, which is also T8.

**Setup:**
- **Baseline:** the installed 0.10.12, the published build of `cce4da6`. `git diff --stat v0.10.12 origin/main --
  src src-tauri crates` is empty, so it is `main`'s code, with no `data-kbd`.
- **PR build:** a local `tauri build --no-bundle` of `639856e`, the branch with the layout-gate fix.
- **Launch:** both through `smoke-launch.ps1` (isolated WebView2 profile, CDP 9222), one after the other.
- **Fixtures:** `smoke-fixtures.ps1 -Force`. `layout.json` was seeded with `c:\tmp\t4\work` before each launch, and
  the store folder was backed up first and restored byte-exact after (`cmp`).
- **The theme** was light (the profile's own); AZ 6 was checked in dark too.
- **Every reading:** `document.hasFocus()` (true after the first key, throughout), `document.activeElement`,
  `:focus-visible`, `[data-kbd]:focus`, and the computed `box-shadow` of the element or of its selected row, which is
  where the grid and the lists draw focus. `cdp.mjs` has no screenshot step, so the computed style is the reading,
  as in the audit.
- **Positive control:** before the paths on each build, a Tab onto a toolbar button matched `:focus-visible` with the
  ring. On the PR build it was also `data-kbd`.

**Two tool changes, made during the walk** (`docs/smoke/cdp.mjs`):
- `F10`, `Home` and `End` in KEYS. Without them `Shift+F10` never opened a menu and `End` was the E key.
- Enter now carries its `text` (`"\r"`) on keyDown. A bare CDP keyDown doesn't activate a focused button, since
  Chromium fires the click from the char event. Found when **Open diff window** ignored Enter.

## The ten paths

Each was driven after a click (pointer focus), then the key. "Ring" means the element's or its selected row's
box-shadow ring is drawn.

| # | Path | Baseline 0.10.12 | PR build |
|---|---|---|---|
| 1 | Sidebar tree: click `main`, ↓ | click: no ring; ↓: ring (`:focus-visible`) | the same, and ↓ is `data-kbd` |
| 2 | Changes \| Files: click Changes, → | ring on Files | ring, `data-kbd` |
| 3 | Settings tabs: click General, → | ring on Git | ring, `data-kbd` (the click itself: no ring) |
| 4 | Click a grid row, Ctrl+K, Escape → the grid | the selected row ringed | the same, `data-kbd` |
| 5 | Click a grid row, Shift+F10, Escape → the grid | menu opens with its first item `:focus-visible`; Escape: row ringed | the same, both `data-kbd` |
| 6 | Search popover (720 px wide): click, Escape → its button | ring | ring, `data-kbd` |
| 7 | Diff line cursor: click a line, ↓ | click: `:focus-visible` false; ↓: true | the same, ↓ `data-kbd` |
| 8 | Unstaged list: click, Ctrl+A, Enter → Staged list | Staged list focused, row ringed | the same, `data-kbd` |
| 9 | Diff window opened by Enter on **Open diff window** → its list | list's row ringed | the same, `data-kbd` |
| 10 | Diff window, Escape → its opener | ring on **Open diff window** | the same, `data-kbd` |

**All ten look as before on Windows.** Chromium already rings a script focus after a key, so the mark adds nothing
visible here. It only shows up as the extra attribute.

**Also:**
- **Opened by a click,** the diff window's list has no ring on either build (pointer, as intended).
- **Not walked, as in the Linux audit:** the Files tab's cursor (`FileContent.tsx:148/215`), the busy refocus
  (`Dialog.tsx:94`) and the other emptied-list direction (`FilesColumn.tsx:235`). The same mechanism covers them.

## The two cases new on Windows

**A — Tab to a control, then click it:**
- **The control:** the ring stays on both builds. Chromium keeps `:focus-visible` when an already-focused element
  is clicked, so this is **not a change on Windows**.
- **A menu button** (the repository name) in the same state, clicked: the menu opens with its first item
  `:focus-visible` on both builds (marked on the PR build). **Not a change either.**

**B — A click, then Ctrl+Comma:**
- **The change:** Settings opens with the focus on **Close**:
  - baseline: no ring (`:focus-visible` false);
  - PR build: ringed through `data-kbd` (`:focus-visible` still false).
- Chromium doesn't count a Ctrl shortcut as keyboard input; the shared mark does.
- This is **the one visible change on Windows.**
- Escape back to the sidebar is ringed on both.

## AZ 6 on the PR build: pass

- **Keyboard open:** a branch name longer than the menu's width (a fixture branch made for the walk). Shift+F10 on
  its row opens the menu with the first item, *Checkout <long name>*, focused and marked. It wraps to 57 px, while
  every other row stays 26 px. Arrowing off it: back to one line.
- **Merge row:** *Merge <long name> into main…*, arrowed onto, wraps to 57 px as one sentence.
- **Bottom edge:** a 560 px-tall window, the long branch on the last visible row, Shift+F10 then **End**. The Delete
  row wraps to 54 px, and the menu ends at 556, inside the window.
- **Mouse:** right-click after a click elsewhere. The first item is focused but unmarked, one line, with its `title`.
- **Right-click after arrow keys in the grid:** the first item opens marked, `:focus-visible` and wrapped (57 px), as
  it always did (open-items §M "Menus").
- **Themes:** light (the walk's theme) and dark read the same. The focused item has the accent background and white
  text in dark.

The two long fixture branches were deleted afterwards. The review's worry (PLAUSIBLE) was that Chromium drops
`:focus-visible` when a focused list is clicked, so a right-click there would newly open keyboard-style. It didn't
hold: the grid stayed `:focus-visible` after a click on its own row. The keyboard-style right-click menu is
therefore unchanged on Windows.

## Addendum, 2026-09-27: case B reversed

The user decided against case B's change. `kbdFocus.ts` now ignores a keydown with Ctrl or ⌘ held, which is what
Chromium does. A Ctrl or ⌘ shortcut leaves the flag as the last plain key or click set it. After a click,
Ctrl+Comma opens Settings with no ring again, as on the baseline. The code is shared, so this holds on Linux and
macOS too. A plain key after the shortcut still counts: Ctrl+K, then **Escape**, still rings the grid.
Unit-tested (`kbdFocus.test.ts`: a shortcut after the pointer isn't a key; after a key it leaves it a key; Shift+F10
still counts), not re-walked in the app.

## Addendum, 2026-09-27: re-walk of the pushed head `f5276b6`

A local `tauri build --no-bundle` of `f5276b6`, walked the same way (store backed up and restored byte-exact).

- **W1, a click then Ctrl+Comma:** Settings' Close has no ring and no mark, as on the baseline. Pass.
- **W2, Tab then Ctrl+Comma:** Close is ringed (`:focus-visible` and `data-kbd`). Pass.
- **W3, a click on a grid row, then Ctrl+K, then Escape:** the grid's selected row is ringed. Pass.
- **W4, a second launch during startup** (the #18 blocker, which the gate fixes). Pass.
  - **Setup:** `layout.json` seeded with two windows, `work` and `other`. The build was launched, and launched again
    300 ms later. `layout.json` was polled every 100 ms for 8 s.
  - **Result:** the file never became `[]`. Both saved windows came back, `main` on `work` and `w2` on `other`. The
    second launch opened its own empty window, `w1`, on the start screen.
  - **A first attempt was void.** `dogfood` was in the seed, but `smoke-fixtures.ps1 -Force` had removed it, so its
    window correctly came back empty. A second attempt was void too: the previous process was still alive, and
    both launches handed over to it.
- **W5, Enter in a dialog, for the `cdp.mjs` change:**
  - Enter on the *Create branch…* item opened the dialog. Typing a name, then Enter, created exactly one branch and
    one checkout: one reflog entry, the toast *Created and checked out …*, and no "already exists" error.
  - So sending Enter's text causes no double submit. The branch was deleted afterwards.

## Addendum, 2026-09-27: the fix batch (the Ctrl/⌘ rule narrowed)

- **What "which is what Chromium does" rests on** (the "case B reversed" addendum above):
  - It was observed for Ctrl+Comma after a click (case B's baseline).
  - The fix batch added Ctrl+↓ after a click in the sidebar, on the installed 0.10.12: no ring (`:focus-visible`
    false).
  - The ⌘ half and macOS are unwalked. `base.css` also ORs WebKit's own `:focus-visible`, which this flag doesn't
    control.
- **The rule is now narrower** (`6465201`): a Ctrl/⌘ chord counts only with an arrow, Home, End, PageUp or
  PageDown. Every other shortcut still leaves the flag as it was.
- **The result is a visible change on Windows, accepted:** after a click, Ctrl+↓ in the sidebar rings via the mark,
  where 0.10.12 and Chromium show none.
- **Walked on a release build of `71789c9`** (the same code as `6465201`, before a comment-only review fold), all
  pass:
  - W1–W3 as above.
  - F6: Ctrl+↓ after a click rings.
  - A click, then Ctrl+F5 and Ctrl+K twice: the grid gets no mark.
  - W4 at 0.1 s.
- **The layout half of the batch** (`afc40f3`) and the Linux side are recorded in
  `2026-09-27-pr18-linux-rewalk.md` › *After the fix batch*.
