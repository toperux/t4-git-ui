# Walk: the viewport survives a tab switch and a walk restart — 2026-09-16

The report: *"I did a git pull, switched tabs, and when I got back the view was somewhere else."*
Read against the code, the selection was never the problem — it is carried by oid across a walk
restart (`repoStore.reselect`) and snapshotted per tab. The scroll position was: it is DOM state on
a grid that outlives both a tab switch and a walk restart, and nothing put it back.

Driven over CDP (`docs/smoke/smoke-cdp.md`) against a local `tauri build --no-bundle` launched with
`smoke-launch.ps1` in its own WebView2 profile. Repositories: `c:/tmp/t4/mbk-clone` (10 956 commits,
clean) and this repo in a second tab (dirty, so it carries the working-tree row). Row height 26px,
window 1280x800, so the grid scroller is 358px — about 13 rows.

## The fix

- `repoStore` keeps `topRow`, the grid's first **visible** row (`-1` = the working-tree pseudo-row),
  reported by `RevisionGrid` from `virtualizer.range` — not from `viewport.start`, which is
  overscan-inflated by 20 rows.
- `snapshot()` carries it as a `start`-aligned `reveal`, so a tab returns to its own scroll position
  instead of the one belonging to the tab being left.
- `startLog` captures the commit at that row; `reanchor()` finds it in the new walk and scrolls the
  viewport back onto it. Not from the top row — there, new commits belong in view.
- `reveal` gained `align`, and the grid now **consumes** it: it unmounts on the Changes view switch,
  and a standing request would be answered again on the next mount with an index from an older walk.

## What the first build got wrong

The first version anchored in one pass, right after the restarted walk's first page — deliberately,
to avoid scrolling under a reader seconds later. Walked, it never fired: the viewport stayed at
2600 while the rows under it moved by one.

The instrumented build said why. `reanchor:found` came back with `index: null`, and calling the
backend by hand from the page proved the row was findable *afterwards*:

```
__TAURI_INTERNALS__.invoke('find_log_row', {id, generation: 5, oid: '2b0270…'})  →  101
```

So the lookup was simply too early. **The restarted walk's first page usually comes back short**
(`page.complete === false`): the walk takes ~80ms for this repository and page 0 is requested the
moment `start_log` resolves, so neither the loaded rows nor the backend had row 101 yet. `reselect`
has always handled this — "a commit the walk has not reached yet is tried again when the walk
completes" — and `reanchor` now does the same, from `onProgress`. The guard that protects a reader
who scrolled meanwhile is what makes the later pass safe.

The unit tests passed throughout, on both versions: every mocked page is complete, so the one-pass
version looked correct. `src/store/repoStore.test.ts` now carries the short-page case explicitly.

## Results, on a build of the fix

| Step | Before | After |
|---|---|---|
| mbk-clone at row 100 → switch to the other tab → back | `scrollTop` 2600 → 2600, `2b02702` on top | same |
| A commit arrives while the viewport is at row 100 | 2600, top row **changed** `2b02702` → `cd6a8b8` | **2626**, top row still `2b02702` |
| That commit removed again (`reset --hard HEAD~1`) | — | 2626 → **2600**, still `2b02702` |
| At the top (`scrollTop` 0) when a commit arrives | — | stays **0**, the new commit `c5de855` comes into view, and the selection follows its own commit to row 1 |
| Commit lands while the tab is in the **background**, then switch back | — | **5226**, top row still `f50f6ac` (restore and anchor compose) |
| Dirty repo sitting on the working-tree row, tab round trip | — | back to `scrollTop` 0 with the row in view (the `-1` clamp) |
| F5 with nothing changed, viewport at row 150 | — | 3900 → **3900**, nothing moves |

The "before" column is from the same walk, on the build that preceded the fix.

## Second round — the walks the first round left

Four cases were owed after the first round; the smoke checklist now carries all of them as group AW.

- **Past the first page.** Every row driven in round one (100, 150, 200) sits inside the 500-row page
  0, so the anchor resolved from the loaded rows. At row 600 it goes to `find_log_row` on the backend
  instead — the path that failed before the retry landed. Walked: 15600 → **15626**, `5f85f83` still
  on top.
- **History → Changes → History, fixed here.** The View switch unmounts the grid, so its scroll goes
  with it: coming back landed at row 0 from row 601. Consuming the reveal (round one) had made that
  deterministic rather than a jump to a stale index, but neither keeps the reader's place. The grid
  now scrolls to `lastTopRow()` on mount, declared before the reveal effect so a restored tab's own
  request still wins. Re-walked: 15600 → Changes → History → **15600**, same commit.
- **The reader who scrolls during the restart: not drivable.** The window between the walk restarting
  and completing is ~90 ms and the watcher's own delay jitters more than that, so the scroll cannot be
  landed inside it from a script. Covered by the unit test instead. What the walk did see is the same
  rule from the other side: a scroll landing just *before* the restart re-anchors on the row the
  reader moved to (they scrolled from row 300 to row 800 and came back on row 801, `5647a75`, rather
  than being pulled back to 300).
- **Regression pass on the final build**: tab round trip 15600 → 15600; commit while deep →
  15626, same commit; at the top → stays 0 with the new commit in view and the selection one row
  lower; F5 → 5200 unchanged; dirty repo on the working-tree row → back in view; commit while the tab
  was backgrounded → **5226**, `14935dc` still on top.

## Environment notes

- **Close the app before rebuilding.** The linker cannot overwrite a running exe and the build dies
  with `Access is denied. (os error 5)` / `failed to build app`, which reads like a Rust error
  rather than a locked file. The walk lost a build to this.
- `smoke-launch.ps1` resolves the exe at `<repo>/target/release/t4-git-ui.exe` — the cargo target
  directory is at the repository root, not under `src-tauri/`.
- The repository menu's **More recent** submenu is how a walk opens a repository that is not in the
  first five recents; the native folder picker is unreachable over CDP. Menu items carry no stable
  selector, so tag one with `setAttribute("data-probe", …)` from `--eval` and click that — the click
  stays a real `Input.dispatchMouseEvent`.
- `__TAURI_INTERNALS__.invoke` is reachable from `--eval`, which is how a backend command can be
  questioned directly. `find_log_row` with a deliberately wrong generation answers
  `log generation 9999 is stale (current 5)` — a cheap way to read the current walk generation.

## Gates

`tsc --noEmit` clean; `vitest run` 871 passed (75 files), and 871 again after the remount fix.
