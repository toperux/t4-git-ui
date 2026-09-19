# Group AZ: the review fixes after 0.10.1 — 2026-09-19

`docs/smoke/smoke-test-post-v1.md` group **AZ**, walked in three passes on the same day as the code
changed under it: the five commits on top of 0.10.7 (`d55e026` staging, `0962f1a` window restore,
`7a37808` the grid's mount row, `4ddc160` clipped menu names, plus the docs commit). Driven over CDP
(`docs/smoke/smoke-cdp.md`) against a local `tauri build --no-bundle`, rebuilt for each pass. Dark
theme unless said. Git 2.55 on Windows 11.

The installed app was closed for every pass and the store folder
(`%APPDATA%\dev.topher.t4gitui\`: `layout.json`, `recents.json`, `.window-state.json`) copied aside
first and copied back after, compared byte for byte — a local build shares that folder, which
`smoke-cdp.md` used to deny. The walk's node scripts were session scratch and are not kept; what they
needed is written into `smoke-cdp.md` › Several windows.

Fixtures: `c:/tmp/t4/az` (240-odd commits, the branch
`feature/a-very-long-branch-name-that-will-not-fit-in-a-280px-row-menu-at-all`, a `.gitignore` of
`*.log` + `!keep.log`), `c:/tmp/t4/azc` (two tracked `*.log` files conflicted by a merge),
`c:/tmp/t4/{irebase,work,linked,other}` for the windows, and a scratch repository of 1861 files under
61 nested `.gitignore` for the timing.

## Results

| Step | Result |
|---|---|
| 1 negated rule | **pass** — only `keep.log` listed; staged as `A  keep.log` |
| 2 stage all is no slower | **pass** for the case the bullet names, three runs each against the installed 0.10.7: 1800 modified files 0.57 s (0.60 s). The other way round for 1861 untracked files: 0.62 s (0.48 s) — libgit2 reads the ignore files per path. Accepted |
| 3a–3k | **pass**, 22 checks, twice (before and after the second review's change to `window_closed`); 3b, 3h and 3i relaunched |
| 3l an empty window closing | **pass** — B closed at 0 s, C closed itself empty at about 3.4 s, B out of the file at its own 4 s |
| 3m a tab dragged across | **pass** — B's repo-name handle dragged onto A's strip; one window left, the repository listed once at once and five seconds later |
| 4 a lock that cannot be made | **pass** for Stage (git's `Permission denied`, no Retry; a held lock → Retry → staged) and for Unstage (libgit2's `failed to create locked file … Access is denied`, no Retry; a held lock → Retry → unstaged). `.git` was write-denied with `icacls /deny <user>:(WD,AD)` and the deny removed after |
| 5 History comes back | **pass**, three ways: plain, with a commit arriving while in Changes, and with a commit arriving as History mounted. The viewport moved by exactly one row height per arrived commit |
| 6 clipped menu names | **pass after two fixes**, see below. Light theme reads the same. The sidebar's branch menu has no names in its rows; the Repository › More recent submenu rows never clipped with real names |
| 7 a conflict under an ignore rule | **pass** both ways — **Stage** after a hand resolve, and **Keep side's version** (its native confirm answered with Enter on the `#32770` box) |
| 8 a file that became ignored | **pass** — "Stage failed · new.txt is ignored", nothing in the index |
| 9, 10, 11 | **not walked** — no hand recipe; needs a published update; other platforms |

Not walked either: a grid mount whose stored row is past the row count (bullet 5's residual). No path
was found that empties the rows without resetting the stored row, and a stored row with no commit
behind it yields no anchor, so nothing can jump.

## Findings

1. **A two-half menu label wrapped inside its own half.** `Merge X into Y`, `Rebase X onto Y` and
   `Rename X` are two flex items; focused from the keyboard the row wrapped, and the branch name wrapped
   within its half — six lines, 108 px, beside the rest of the sentence. Fixed in
   `RevisionGrid.module.css`: `[role="menuitem"]:focus-visible .menuLabel { display: block }` — one
   sentence at the row's width, three or four lines. Tried live first through the CSSOM, since the CSP
   blocks an injected `<style>`.
2. **At the window's bottom edge the wrapped row was cut.** `ContextMenu` clamped to the viewport once,
   before the first item took the focus and wrapped; on a 521 px window the focused **Delete** row — the
   last in the menu, and the one whose name matters most — lost its last line, 20 px below the edge.
   Fixed in `Menu.tsx`: the clamp runs again from a `ResizeObserver` on the menu. Re-walked: the menu
   stays 4 px inside for the first row, the Merge row and the Delete row, and a mouse-opened menu still
   opens, fits and closes on Escape.

The review of the fixes, not the walk, found the other two that were folded in the same day: `map_git2`
read a lock that cannot be created as contention (bullet 4's Unstage half), and a window closing with
no tab restarted the grace of the ones before it (row 3l).

## Observations, no change made

- After arrow keys in the grid, a right-click menu opens with its first item `:focus-visible` — the grid
  never gave up the keyboard focus, so the script focus inherits it. A clipped first item then opens
  wrapped. It is the case in which that row always had the accent highlight.
- An external `git reset` of 1800 files takes about four seconds to show in Changes, on 0.10.7 as well;
  an external `git add -A` of the same files shows in 0.6 s.
- A libgit2 error toast ends in git2's own `; class=Os (2); code=NotFound (-3)`.
- The log file is buffered: the `stage_paths` lines of a killed process never reach it.
