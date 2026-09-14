# Direction B — the repository window at small sizes

Decided 2026-09-14 on the design canvas https://claude.ai/code/artifact/e747c922-c0fa-4143-804b-2d5e09dc7c05
(36 artboards: 1280 / 1000 / 720 wide, states, the full-window dialogs, dark twins). This file is
the written form of what the canvas shows; the plan next to it implements it.

## Why

The window is cramped on a 13" laptop and in a non-maximised window: the toolbar needs ~1100px
before labels wrap, the sidebar (min 180) plus the commit panel's three columns (min 220 + 200 +
260) already exceed the 900px minimum, and nothing in the layout adapts to width.

## What changes

1. **One content view at a time.** The toolbar's Commit button becomes a `History | Changes`
   segmented switch (Changes carries the working-tree change count).
   - *History* = revision grid over the details pane, full height, as today.
   - *Changes* = the commit panel (Unstaged / Staged | diff | message) over the whole content
     area, under a one-line *Changes bar*: `Changes on <branch> · N unstaged · M staged
     [· K conflicted]`, with `Stash…` and `History` buttons at its right.
   - Selecting the working-tree row in the grid switches to Changes (a click does that today by
     swapping the pane); the row carries an always-visible muted `Open changes →` hint at its
     right (no hover needed); double-click keeps opening the full-window commit dialog. `Alt+1` /
     `Alt+2` switch views from the keyboard. (`Ctrl+1..9` are taken by repository tabs.)
   - Selecting a commit or branch while in Changes (sidebar click, palette) stays in Changes; the
     selection is there when you return.
   - A clean tree in Changes is an empty state (`Working tree clean` · `Edit files, or amend the
     last commit.`) beside the message column, not an empty list.
   - The search box and the branch filter belong to History and leave the toolbar in Changes.
   - The full-window commit dialog and diff window stay reachable at every size.
2. **Sidebar rail.** Below 1000px the sidebar collapses to a 36px rail: one icon button per
   section (Local, Remotes, Tags, Stashes, Worktrees and Submodules when present) with its count.
   Clicking one opens that section as a 260px flyout over the content; Esc or a click outside
   closes it. `Alt+0` (and a button at the top of the sidebar / bottom of the rail) toggles rail
   ↔ full at any width; the choice lasts the session.
3. **Adaptive toolbar** (window width):
   - `≥ 1100` full: repo ▾ · Fetch ▾ Pull Push · Branch Stash · switch · search 240 · branch
     filter · palette · Refresh · Theme · Update · Settings
   - `800–1099` tight: Fetch / Pull / Push / Branch / Stash drop their labels (icon + count),
     search 140, filter 110
   - `< 800` icons: repo icon only, switch icons only, search becomes an icon opening a popover
     with the search box and the filter, Branch / Stash / Refresh / Theme / Settings fold into a
     `⋯` overflow menu (Branch as a submenu) — the palette icon stays
   - The search box is the one control that gives way; everything else is fixed width.
4. **Command palette** (`Ctrl+K`, and the palette icon button). Scrim + 520px panel under the
   toolbar: an input, then groups of items: *Recent* (last 3 run, empty query only), *Views*
   (History `Alt+1`, Changes `Alt+2`), *Repository* (Commit…, Add remote…, Add worktree…, Run git
   command…, Open repository…), *Branch* (Create…, Checkout…, Merge…, Rebase…), *Stash* (Stash
   changes…, Manage stashes…, Pop latest, Apply latest), *Network* (Fetch, Pull…, Push…), *Go to
   branch* (every local and remote branch → reveal in the grid), *Repositories* (recents → switch),
   *Window* (Toggle sidebar, Refresh, Settings, Move to new window, Close tab). Typing filters
   across groups (prefix, then word start, then subsequence); `↑ ↓` move, `Enter` runs, `Esc`
   closes; items an operation in progress would disable are disabled with the same reason as the
   toolbar. Commit search stays in the toolbar. `#` / `/` prefixes are on the roadmap, not here.
5. **Details pane by width:** `≥ 1100` three columns (details | files | diff, as today);
   `800–1099` two columns: details over the file list on the left (300px), diff on the right;
   `< 800` the left column is the file list (220px) with the commit details collapsed to a one-line
   header (subject · short SHA) that expands over the list.
6. **Commit panel by width:** three columns down to 800; below that two: files over message on the
   left (280px), diff on the right — the commit dialog's arrangement.
7. **Window minimum** 700 × 500 (was 900 × 600), in `tauri.conf.json` and for spawned windows.

## Out of scope

Dark theme work (tokens already cover it), the commit dialog, the stash dialog's missing file list
(roadmap §J), palette prefixes (roadmap §J), remembering a per-view sidebar state (open question,
roadmap §J).
