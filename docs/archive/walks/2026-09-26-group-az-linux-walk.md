# Group AZ 11 on Linux — 2026-09-26

`docs/smoke/smoke-test-post-v1.md` group **AZ**, bullet 11: repeat 3a, 3b, 3d, 3i and 6 on Linux (WebKitGTK).
First walk with the Linux harness (`docs/smoke/smoke-linux.md`). A debug build of `1e795ad`
(`npm run tauri build -- --debug --no-bundle`, identifier `dev.topher.t4gitui.smoke`) on Ubuntu 26.04.1,
WebKitGTK 2.52.6, git 2.53.0, under Xvfb `:99` with an isolated `HOME`. The user's store and
`~/.gitconfig` were checksummed before and after: untouched.

Fixtures: `/tmp/t4/{work,other}` from `smoke-fixtures.sh`, plus the branch
`long/a-very-long-branch-name-that-will-not-fit-in-a-280px-row-menu-at-all` on `work` for 6.

**Row 3 was driven without WebDriver.** The first two-window attempt under tauri-driver hung (finding 1, which
turned out to be the app's own intermittent bug, not the harness's). So the app ran directly on `:99`, and `layout.json` was seeded before each launch
(A = `work` in `main`, B = `other` in `w1`). Windows were closed with `fixtures/xclose.py`, which sends
`WM_DELETE_WINDOW` as a title-bar × does, since Xvfb has no window manager. The file was read with `cat`
at once and past the 4 s. "Next launch" was a kill plus a relaunch (3a) or the relaunch after the app
exited on its own (3b, 3d, 3i).

## Results

| Row | Result |
|---|---|
| 3a close B, leave it | **pass**: A + B at 0.3 s and 2 s, A only at 4.6 s, nothing touched between; relaunch → A |
| 3b close B, A under 4 s later | **pass**, twice: the app exits, the file holds A + B (still so 4 s later); relaunch → A + B |
| 3d close B, wait > 4 s, close A | **pass**: A + B at once, A at 5 s; after A's close the app exits with A; relaunch → A |
| 3i main on the start screen, B with a tab | **pass**: B at once, B after 5 s, B after main's close; relaunch → `other` in `main` |
| 6 clipped menu names | **fail**, keyboard half: see finding 2. Mouse half passes: every row stays 26 px, and the `title` carries the full name (82–91 characters) |

AZ 11 Linux stays unticked because 6 failed.

## Findings

1. **A restored second window sometimes never starts.**
   - **Symptom:** `w1` stays on the *Starting* spinner, titled "T4 Git UI", for as long as it was watched
     (90 s). With nothing open in it, its entry is gone from `layout.json` (`main` only), so closing
     `main` then loses B for good.
   - **Frequency:** about 3 of 16 two-window restores (twice without WebDriver, once under it). Two more
     took 7–15 s. The rest came up in about 1 s.
   - **Where it stops:** the log shows `main` probing git and opening its repo, and nothing at all from
     `w1`. Its startup `await kvGet("gitPath")` (`src/App.tsx`, the store plugin) is the first call. Under
     WebDriver, `plugin:store|load` and `probe_git` both timed out from `w1`, and then `probe_git` also
     timed out from `main`. So async commands stall app-wide; a sync one (`take_pending`) still answered.
   - **Suspect, not proven:** `spawn` → `show_with_theme` reads the same store from Rust (`app.store()`)
     while the new window's JS opens it, a race on the store plugin's lock. Proving it needs stacks of a
     stuck process: gdb needs `ptrace_scope` 0 (sudo).
   - **On Windows:** not seen in the AZ walk of 2026-09-19.
2. **Menus show no keyboard focus on WebKitGTK.**
   - **Symptom:** the menu's items are focused by script (`Menu.tsx` `.focus()` on open and on the arrow
     keys), and WebKitGTK never gives them `:focus-visible`. It didn't after Shift+F10, after arrow keys in
     the grid (the grid itself matched `:focus-visible`), or with real X keystrokes. Every highlight and
     the wrap are keyed on `.item:focus-visible` (`Menu.module.css`, `RevisionGrid.module.css`).
   - **Consequence:** a keyboard user sees **no highlight at all** in any menu, and a clipped name never
     wraps.
   - **Automation ruled out:** the same with the app launched directly (no WebDriver): a real click, then
     `xdotool key shift+F10 Down Down Down`, then a screenshot.
   - **Rest of row 6:** the bottom-edge and light-theme halves depend on the wrap and were not reached.

## Harness notes

- **Multi-window rows ran without WebDriver:** a direct launch plus `xclose.py`. The one WebDriver attempt hit
  finding 1.
- **A session left behind** by a killed app blocks the next *session not created: Maximum number of active
  sessions*. Restart tauri-driver.

## Later the same day

- **Finding 2 is fixed** (the `data-kbd` mark in `Menu.tsx`). AZ 6 passes in full on Linux.
- **Finding 1 is guarded** (a spawned window's tabs are written at once) but its cause is not found.
- **The analysis above is superseded.** The store-lock suspect is unlikely (both paths take the locks in the same
  order), and the stacks need no sudo: run the app under gdb as its parent.
- See `docs/plans/2026-09-26-linux-menu-focus-and-restore-plan.md` (status section) and `open-items.md` §O.
