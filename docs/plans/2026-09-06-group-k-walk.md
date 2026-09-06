# Group K walk — 2026-09-06

`docs/smoke-test-post-v1.md` group K (the 2026-09-06 review fixes), the reworded F1 and H2, and the
three "Unverified" probes of `docs/reviews/2026-09-06-codebase-review.md`, driven over CDP
(`docs/smoke-cdp.md`) in the installed build of `a5a0a6b` against a fresh fixture. Native confirm
boxes were answered by a loop around `docs/smoke-dialog.ps1` (Discard → **Discard**, Resolve
conflict → **Replace**; the banner's Abort has no box). K12 is Linux-only and was not walked.

## Results

| Step | Result |
|---|---|
| Probe: menu dismissed by a mousedown on an outside focusable | pass — the search field and the Fetch button each take the focus, the menu closes, nothing pulls it back |
| Probe: dock `expand()` after a drag | **finding 1** |
| Probe: Shift+F10 menu `y` with a `--row-h` override | moot — `--row-h` is set once in `tokens.css`, overridden nowhere |
| K1 tag and branch with one name | **finding 2** |
| K2 failed clone keeps its fields | pass — focus in URL, fields kept, Enter retries, Esc closes |
| K3 background save leaves an idle focus alone | pass for the list and the diff; the row's own **+** button case is **finding 3** |
| K4 emptied list hands the focus over | pass, both halves |
| K5 Discard skips conflicted files | pass — menu and Delete; a lone conflicted file has Discard disabled and Delete does nothing |
| K6 Shift+↓ across a hunk edge | pass — two lines in the second hunk, Stage 2 lines stages those |
| K7 same file in both lists | pass — cursor at the last unstaged line, first line and no selection in the staged diff |
| K8 Commit with a search filter | pass — toolbar and banner |
| K9 merge-only prefill, history pick survives an abort | pass — the stopped cherry-pick wrote `many files (300)` to `MERGE_MSG` and the editor ignored it |
| K10 `core.commentChar` | pass — `MERGE_MSG` carried `; Conflicts:` lines, the editor shows only the summary |
| K11 completions at the minimum height | pass — a 9-entry list flips below the field; the 3-entry one fits above. The scroll cap was not reached at 600 px |
| K13 unborn HEAD | pass — no Merge, no Rebase item |
| F1 Discard hunk / lines / CRLF | pass — CRs intact (10 before and after) |
| H2 merge resolved to HEAD | pass — "merge to commit" row, "Merge to commit" button, "will record the merge", two-parent commit |

## Findings — all fixed in the same commit

1. **The dock reopens at 160 px after a drag.** Dragged to 300 px, collapsed, expanded → 160 (the
   `minSize`), not 300: `expand()` in `react-resizable-panels` 4.12 does not restore a dragged
   size. `DockPanel` now records the last open height from `onResize` and reopens with
   `resize(last)`; the first open of a session is still 200 px. New step K14; no unit test —
   jsdom lays out no panels — the CDP re-walk is the check.
2. **A tag whose name is also a branch checks the branch out (detached).** Review M1 added
   `--detach`, which fixed the *attached* half: `git checkout --detach same` with a branch and a tag
   called `same` detaches at the **branch's** commit (`git checkout` reads a bare name as a branch
   before a revision; `--detach refs/tags/same` lands on the tag — verified with git 2.55). The
   Sidebar's tag item and the quick Checkout dialog's tag pick now go through `checkoutTag`, which
   passes `refs/tags/<name>`; the commit row's item passes the oid and was never affected. The
   quick Checkout dialog's preview line now mirrors each pick: `--detach refs/tags/<name>` for a
   tag (it had shown a bare `git checkout <name>` since M1), and for a remote branch the tracking
   checkout or the existing local, whichever `checkoutRemoteBranch` will run. Unit tests in
   `actions.test.ts`, `gitArgs.test.ts` and `dialogs.test.tsx`.
3. **Clicking a row's + button lost the focus to `<body>`.** A regression of review M5: while the
   stage runs the row's button is disabled, and Chromium blurs a disabled control at once — no
   `relatedTarget`, still in the document — so the microtask release let `held` go; the row was
   removed 50 ms later with nothing to repair the loss. Traced with a blur listener
   (`atBlur: {disabled: true, connected: true}`, `at50ms: {connected: false}`). The release now
   skips a disabled target, in both the file lists and the diff. The CommitPanel test holds the
   stage promise open so the button is really disabled when it blurs; with the old code it fails.

## Observations — the first two worked later the same day, see the end

- A mouse click on the selected-lines bar's **Stage N lines** / **Discard N lines** leaves the
  focus on `<body>` (the bar sits outside `DiffBody`, so its `held` never sees the button). The
  hunk header buttons were fixed in `b15c109`; the bar was not in that row. Keyboard staging is
  unaffected.
- The lone conflicted file's disabled **Discard…** item carries the tooltip "…(1 skipped)"; "A
  conflict is resolved by keeping a side" alone would read better when nothing else is selected.
- On an unborn HEAD the commit menu still offers **Reset HEAD to here…**, which would make the
  orphan branch point at that commit. Unlike the merge item (review M4) the label says what it
  does; left as is.
- Tree mode was on from an earlier walk: the file lists were `tree` / `treeitem`, so a walk script
  should accept both forms (`docs/smoke-cdp.md` says so since L11).
- Tab from the Unstaged list goes to the Staged list, then the "Resize file lists" separator; the
  diff's cursor row is what `Tab` eventually reaches. Focusing `[data-cursor]` directly is the
  shortcut a script can take.
- The banner's **Abort** asks nothing: the merge aborted while the dialog waiter was still polling.

## Re-walk after the fix build

K1, K3 (the + button) and K14 walked again in the rebuilt installer (04:02), all pass: the tag
menu detaches at the tag's commit with a branch of the same name present; the + button's stage
puts the focus back on the list and `↓` moves; the dock reopened at 300 after a drag to 300
(200 on the first open, 28 collapsed).

## The last unticked steps, later the same day

- **Resolve in editor** (main §5), both halves, over CDP in the installed build with H1's merge in
  progress: the button opened VSCodium's three-way merge editor ("Merging: conflict.txt", the
  three sides under `%TEMP%\t4-git-ui-merge\<key>\`) and the toast read "Opened conflict.txt in
  codium.cmd"; relaunched with VSCodium's folder stripped from `PATH`, the toast read "Couldn't
  open the merge editor — No merge editor found: put VS Code's `code` (or VSCodium's `codium`) on
  PATH…". Pass.
- **Save from the editor**: the resolved file was written by a script instead of the editor — the
  same outside write. The diff lost its markers on its own within a second, the row stayed `C`
  and the Resolve button stayed until the file is staged. Pass.
- **K12 POSIX `file://`** on the WebKitGTK build under WSLg (`docs/plans/…`, recipe in memory):
  Clone… from `file:///home/toperux/bare.git` into `/home/toperux/clones` → statusbar
  `origin · /home/toperux/bare`, leading slash kept; the Windows app cloning
  `file:///C:/tmp/t4/bare.git` reads `origin · C:/tmp/t4/bare`. Pass. Along the way the Linux
  clone dialog also kept its fields and the URL focus after a failed clone (K2 holds there too).
- Still unticked: main §6 DPI change — needs a second monitor at another scale.

## Three more fixes, walked in the 11:45 build

- **Stage N lines bar keeps the focus** (observation 1): the bar takes `onMouseDown` →
  `preventDefault`, so the click never moves the focus and the diff's own repair lands it on the
  cursor row. Walked: Shift+↓ in `hunks.txt`, mouse click on **Stage 2 lines** → the focus is on a
  diff line, `↓` moves, `hunks.txt` is in Staged. New step K15.
- **Lone conflicted file's Discard tooltip** (observation 2): reads "A conflict is resolved by
  keeping a side, not discarded" with no "(1 skipped)" when nothing else is selected. K5 extended.
- **Clone refuses a relative parent folder**: found on the Linux walk, where a mistyped parent was
  relative and git cloned into the app's working directory — the Windows repo tree. `isAbsolutePath`
  (`C:\…`, `/…`, `\\server\…`) gates Clone with the hint "Use a full path — a relative one would
  clone next to the app". Walked: `clones` disables Clone and shows the hint, `C:\tmp\t4\clones`
  enables it. K2 extended. Unit tests in `paths.test.ts` and `StartScreen.test.tsx`.

