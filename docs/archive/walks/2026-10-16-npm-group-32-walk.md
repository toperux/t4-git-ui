# Front-end bumps of Dependabot #32 — Windows walk, 2026-10-16

Step 5 (D3) of `docs/archive/plans/2026-10-15-npm-group-32-plan.md`: the UI paths that #32's front-end packages touch.
These are `@tanstack/virtual-core` 3.17.11 → 3.19.2 (scroll-to-row reworked), `react-resizable-panels` 4.14.2 → 4.14.4,
`lucide-react` 1.52 → 1.55 and `@tauri-apps/api` 2.12.3. Run on the Windows VM over Remote Control (session git-ui-win),
which reported back; nothing was ticked or committed there. No smoke row covers these paths as such, so
no box changes.

## Build

- Windows 11 (26300) VM test-pc. `refs/pull/32/merge` = `62f4179` (`main` `b025e59` + the pin commit `33e710a`),
  detached.
- Node 24.21.0, `npm ci`, `npx tauri --version` → tauri-cli 2.12.2. The installed packages read back as virtual-core
  3.19.2, react-resizable-panels 4.14.4, lucide-react 1.55.0, @tauri-apps/api 2.12.3.
- `npm run tauri -- build --no-bundle`, exit 0, 3 m 35 s. A first attempt run in the background was killed for low
  memory on the VM and re-run in the foreground.
- Store backed up, `layout.json` seeded with both fixtures, launched with `smoke-launch.ps1`, driven with `cdp.mjs`
  plus a scratch copy with PageUp/PageDown and a mouse-wheel driver. `document.title` carried in every reading.

## Fixtures (under `C:\tmp\t4`, deleted after)

- `perf32`: `perf-repo.mjs --commits 20000 --files 2000` (664 refs).
- `scroll32`: 300 files of 2000 numbered lines, committed. Then every 10th line was edited in all 300 and left
  unstaged: 300 rows, +200/−200 each. In `f150` the odd tens are trailing-space-only, so `git diff -w` gives 100/100.
- A side branch `ws` carries `f150`'s change as one commit, made with a temporary index. Ignore-whitespace is disabled
  in the staging diff ("Whitespace option is unavailable while staging"), so row 5's toggle needs a commit diff.

## Rows

1. **History grid** (`perf32`) — pass. Scroll height 519 624 px.
   - Wheel: 14 × 10 000 px per leg, stops down at 140 000 / 280 000 / 420 000 / bottom and back up to 0.
   - Keys with the grid focused: PageDown moves 13 rows a press with the view following. End → commit 1, PageUp ×3,
     Home → commit 20000 at scrollTop 0.
   - Every stop: 15–16 rows in view, 0 blank, 0 uncovered, 0 overlapping. Screenshots at top, middle and bottom all
     painted.
2. **Keyboard past the edge** — pass.
   - Unstaged list (300 rows): ↓ ×14 and ↑ ×15. The selected row stayed fully in view at every step, and the list
     scrolled as the row reached the edge (scrollTop 20 → 98 → 0).
   - The commit panel's file column (300 files, about 4 rows visible): ↓ ×7, ↑ ×8. In view every step (0 → 105 → 0).
3. **Diff cursor** — pass.
   - Staging diff of `f001`: ↓ ×25 and ↑ ×30. The cursor stayed in view and focused, pinned to the edge while scrolling
     (scrollTop 0 → 1909 → 84).
   - File content (History › Files › `f001`, Blame on): ↓ ×20 and ↑ ×25. In view every step (0 → 182 → 0).
4. **Start at the top** — pass.
   - Changes: with the list at 2400 and the diff at 8000, picking `f098` put the diff at scrollTop 0. The list stays
     where it was.
   - `perf32`: commit 1 (2000 files) with its list at 20 000 → commit 2 → back to commit 1 → list at 0. Diffs at 0 each
     time; they are 1–2 lines there, so a reset can't show.
   - `scroll32`: a commit with the list at 3000 and the diff at 6000 → the Working tree row → Changes view, diff at 0.
5. **Diff reload** — pass. A 10 ms in-page recorder (rows in view, blank, gap, overlap) ran through each.
   - Whitespace toggle on `ws`'s `f150`, at scrollTop 15 000: new rows 83 ms after the press, height 36 740 → 18 340.
     Off reversed it at 91 ms.
   - A real edit in the Changes view to a hunk above the view: reloaded at 838 ms, height +140 px. Restoring the file
     reloaded at 716 ms. A `touch` (mtime only) reloaded nothing in 4 s.
   - Every sample: 0 blank, 0 gap, 0 overlap.
6. **Panels** — pass; identical on the installed 0.10.24.
   - "Resize details" dragged −120 px: 60 → 41.982, the nested "commit details" 50 → 34.383. A double-click restored
     60/50.
   - "Resize sidebar" +80 px: 20.392 → 26.667, "side column" 29.703 → 32.258. A double-click restored them.
   - 0.10.24 (`smoke-launch.ps1 -Installed`) gave exactly the same values.
   - After a restart both came back at the defaults: sizes aren't stored in either, as `smoke-cdp.md` says. The plan's
     "the layout persists across a restart" was wrong on that and was walked as an observation.
7. **Icons** — pass.
   - Repository toolbar: 16 SVGs, none empty or under 4 px. The page: 45 SVGs of 29 kinds, no button without an icon
     or text.
   - Commit context menu: 10 SVGs, every item drawn (screenshot read).
   - The activity bar has no icons. Its progress strip was exercised with Stage all on `scroll32` (added at 35 ms,
     removed at 1463 ms), then Unstage all; index back to HEAD.

**Console and log.** A console.error/warn and onerror/unhandledrejection hook, installed before row 7, caught nothing.
Rows 1–6 weren't hooked: CDP doesn't keep earlier console output. App log: 0 WARN, 0 ERROR across 4 starts. INFO
"slow status" lines, 250–550 ms, on `perf32` and once on `scroll32`.

## Seen on the way, not compared with 0.10.24

- **Diff cursor at the top:** moving back up, the view stops at the first changed line (scrollTop 84), so that hunk's
  header and context lines 7–9 stay off-screen. That's `align: "auto"` on the cursor.
- **File content:** a click on line 3's text didn't move the cursor; the first ↓ took focus at line 2.
- **Scroll position is kept in pixels:**
  - The whitespace toggle kept scrollTop 15 000, so the view landed at line ~1640 instead of ~820.
  - An edit above the view shifted the top line 657 → 650.
- **The active tab from `layout.json`:** the seed wrote `C:\…` with `perf32` active. The app restored the tabs (stored
  as `c:\…`) but came up with `scroll32` active, a mismatch across drive-letter case. It's the same family as the
  duplicate recents in `2026-10-15-v0.10.24-update-walk.md`, and it comes from a hand-written seed.
- **The History/Changes choice follows across tabs:** `perf32` opened in Changes after `scroll32` was left there.
- **The Changes view truncates the hunk header** ("@@ -7,7 +7,7 @@ fil…") to leave room for the hover buttons; the
  staged list shows it in full.

## Cleanup

- App closed with WM_CLOSE each time, no process left.
- Before the restore, `recents.json` differed (the walk's opens), `layout.json` was new, and `.window-state.json` was
  unchanged. Store restored, `cmp` identical, same file set.
- 0.10.24 left installed. The repo is back on `main` `b025e59` with `npm ci` (CLI 2.12.1). Fixtures deleted.
