# Group AU walk — 2026-09-14

`docs/smoke/smoke-test-post-v1.md` group AU (Direction B: views, rail, adaptive toolbar, palette),
driven over CDP (`docs/smoke/smoke-cdp.md`) against a local `tauri build --no-bundle` of `1cc7691`
(`target/release/t4-git-ui.exe`, launched with `WEBVIEW2_USER_DATA_FOLDER` pointed at a scratch
directory so the installed 0.8.0 could stay open). Fixture `c:/tmp/t4/irebase` in its resting state
(`a.txt` edited, `dirty.txt` staged) with `irebase-origin.git` added as `origin` for the go-to-branch
rows and, for the fetch-in-flight check, as `slow` with `remote.slow.uploadpack` =
`slow-upload-pack.sh` (removed after the walk). Window sizes were set natively with `MoveWindow`, so
the 700 × 500 floor was not exercised — that is a drag constraint. Dark theme throughout (the
machine's setting), which is what step 10 wants.

## Results

| Step | Result |
|---|---|
| 1 switch, changes bar, toolbar in Changes | pass — `Changes on main · 1 unstaged · 1 staged`, Stash… / History at the right; search + filter gone; sidebar untouched |
| 2 sidebar click in Changes, Alt+1 | pass — `other` stays in Changes, Alt+1 lands on its commit, scrolled into view |
| 3 working-tree row | pass except the double-click — **finding AU-1**. Hint muted `#9ea4b0`, lit `#e6e8ec` when selected; click → Changes; re-click of the selected row → Changes; ArrowUp / Home → History with `No commit selected`; Enter → Changes; Esc from the dialog (opened via Repository › Commit…) → still Changes |
| 4 clean tree in Changes | pass — `Working tree clean · Edit files, or amend the last commit.`, Stash… disabled `Nothing to stash`, Amend prefilled `add e` with Commit enabled |
| 5 1000 wide | pass — walked at 990: the rail is `< 1000` (at 1000 the sidebar is still full; the tight toolbar and the two-column details pane are `< 1100` and already hold). Rail 36px with counts, flyout 260px, double-click `mid` → `Checked out mid`, flyout stays, Esc closes |
| 6 720 wide, 700 × 500 | pass — icon-only switch; search icon → popover (focused, filter inside; `add d` filters to 2 rows; Esc closes and the icon stays lit while the query is active); More = Branch ▸ (Create / Checkout / Merge / Rebase), Stash…, Refresh, Switch to light theme, Settings, Command palette; collapsed header `add e c172c6d` expands over the list; Changes = files-over-message (280) \| diff. At 700 × 500 no element leaves the viewport in either view |
| 7 Alt+0 override | pass — rail ↔ full at 1280 and at 900; the choice survives 1280 → 900 → 1280 both ways; Move to new window at 900 opens with the rail while the original keeps its explicit full |
| 8 palette | pass — opens from the grid, the Summary field and the dock prompt (focus returns to the prompt on Esc); `st` → Stash changes…, Manage stashes… first; ↓ ↵ → Stashes dialog, palette closed; Recent shows Manage stashes…; second Ctrl+K closes; `origin/` → origin/main, origin/other; ↵ in Changes stays in Changes and Alt+1 shows the row selected; during `fetch slow` Push… / Pull… / Fetch carry `Operation in progress`; a scrim click closes |
| 9 update badge at 1280 | **finding AU-2** |
| 10 dark theme | pass — switch, pressed segment, rail, flyout, palette panel / row / scrim, changes bar, search popover, collapsed header all read dark tokens (backgrounds 18–48 luminance, text `#e6e8ec`) |

## Findings

### AU-1 — the working-tree row's double-click never reaches the commit dialog

`WorkingTreeRow.tsx` switches to Changes on `onMouseDown` (`openCommitPanel`). The first press of a
double-click therefore swaps the grid out; the second press and the `dblclick` land on the commit
panel, and `onDoubleClick` on the row is dead code. Playwright's `dblclick()` and a real mouse both
end in Changes with no dialog. Before Direction B the click only swapped the details pane, so the
row stayed mounted and the double-click worked.

The spec (§1) keeps "double-click keeps opening the full-window commit dialog". Options: defer the
view switch by the double-click interval (`click` with `e.detail === 1` + a ~250 ms timer that
`dblclick` cancels), or drop the row's double-click and let Repository › Commit… and the palette be
the dialog's routes (doc + spec change). The dialog is reachable either way.

### AU-2 — with the Update badge the toolbar overflows at 1280

Measured with a stand-in for the badge (a 79px inline button beside Settings; the real one is a
`sm` primary Button with a 14px icon and "Update", about the same). At 1280 the `.grow` spacer is
33px; the extra 79px pushes Settings' right edge to 1296. The search wrap (`.search`, `width: 240px`,
`flex: 0 1 auto`) can only shrink to its min-content — the inner `<input>` has `min-width: 0` but
the wrap does not, so the input's intrinsic ~178px (its default `size`) is the floor. The search
narrowed 240 → 216 and the rest fell off the right edge (the toolbar is `overflow: visible`, so the
Settings button paints under the window edge).

The repo name itself holds (`white-space: nowrap`, 87px, no wrap). Fix: `min-width` on `.search`
(e.g. `min-width: 120px` — the spec's tight tier already uses 110), so the search keeps giving way
before anything overflows.

## Fixed the same day

- AU-1: `WorkingTreeRow` selects on mousedown, switches to Changes from a `click` with `detail === 1`
  after a 250 ms timer, and `dblclick` cancels the timer and opens the dialog. Re-walked on a
  rebuild: double-click → full commit dialog over History, Esc → History with the grid focused;
  a single click reaches Changes after the interval; Enter is unchanged.
- AU-2: `.search { min-width: 120px }`. Re-walked with the stand-in: the search goes 240 → 192 and
  Settings' right edge stays at 1272.

## Review after the squash

Reading the squashed feat diff found two more flyout defects, fixed in the same commit and
re-walked on a rebuild at 900 wide:

- Switching rail sections while a flyout was open reused the mounted Sidebar, whose open-section
  state is seeded once — Tags and Stashes came up collapsed. The flyout now keys the Sidebar by
  section; Local → Stashes → Tags each open expanded.
- A row's context menu portals to `body`, so the press on a menu item counted as outside, closed
  the flyout and unmounted the menu before its click ran. Presses inside a `role="menu"` are now
  ignored; Copy name and Checkout from the flyout's menu both run with the flyout staying open.
  Esc and a click on the grid still close it.

## The rest, later the same day

What the walk above had not covered, done against the squashed `328ecdd` build (Windows over CDP
with the viewport emulated, so window sizes are `innerWidth` — the native floor still not dragged):

- Light theme: switch track / pressed pill, changes bar, rail + count pills, flyout, search popover,
  collapsed details header, palette panel / scrim / active row all read the light tokens.
- Rail on `c:/tmp/t4/linked`: Worktrees 5 and Submodules 3 buttons appear with the same counts as
  the sidebar's headers; each opens its section in the flyout.
- `cargo clippy -D warnings` and `contrast.mjs` (`all pass`) re-run after the squash.
- Linux (WebKitGTK under WSLg, `t4-q2` clone, driven from the Windows side): Alt+1 / Alt+2 switch
  the views, Alt+0 folds and restores the sidebar, Ctrl+K opens the palette (and `st` ranks Stash
  first), a rail button opens its flyout and a click outside closes it, and the 900 / 720 toolbar
  tiers, the search icon and the collapsed details header render as on Windows.

### Found

- **AV-1 — the compact message column overlaps at small heights.** In the two-column commit panel
  (`< 800`) at 720 × 540, `.editor` (`flex: 1; min-height: 0`, overflow visible) shrinks to 8px and
  the Summary input and body textarea paint under the Amend / Signed-off-by checkboxes. Seen on
  WebKitGTK first, measured the same on Windows (summary bottom 334 > amend top 327). A
  `min-height` on `.editor` would let the column scroll (`.col` is `overflow: auto`) instead.
- **Palette: a group's label repeats when its items score differently.** `st` lists *Stash* (Stash
  changes…, Manage stashes…), then *Views*, *Repository*, then *Stash* again (Pop latest, Apply
  latest) — `rankCommands` orders by score and then group, so a group splits around better-scored
  rows from other groups. Cosmetic; ordering groups by their best row would keep each together.
- README's feature line says the toolbar goes to icons and the panes to two columns "below
  1000px"; those tiers are `< 800` and `< 1100` (the rail alone is `< 1000`).
- Observation: the sidebar `Panel` has no `autoSaveId`, so a dragged width was never persisted;
  a rail round-trip (Alt+0 twice) now also resets it to the 260px default within the session.

Fixed the same evening: `.editor { min-height: 108px }` plus a 300px default for the message row
(its fixed rows ~180 + the editor), so at 720 × 700 the Commit button is in view without scrolling
and at the 540 / 500 floor the column scrolls ~20–40px to it instead of the fields collapsing under
the checkboxes — re-measured on a rebuild; `rankCommands` orders groups by
their best row and rows within a group best first (`rank.test.ts` covers a Stash row that only
matches as a subsequence), and the README line names the `< 800` tiers.

## Not walked

- The 700 × 500 window floor (native drag; `MoveWindow` ignores min-track size).
- Step 9 against a real newer release — none exists above this build's 0.9.0; the layout was
  probed with a same-size stand-in element.
- A bare Alt press on GTK (whether it arms a menu bar): SendKeys cannot send a lone modifier.
