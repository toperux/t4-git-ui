---
name: smoke-walk
description: Walk T4 Git UI's smoke tests against the real running app — build the fixtures, launch a build, drive it (CDP on Windows, WebDriver under Xvfb on Linux), answer native dialogs, then tick the passed steps and write the walk record. Use when the user asks for a smoke walk, to walk or re-walk a group or section ("walk group BG", "walk §4"), to tick smoke steps, or to check a change against the smoke checklists.
---

# Smoke walk

The checklists are `docs/smoke/smoke-test.md` (v1, sections §0–§7) and `docs/smoke/smoke-test-post-v1.md`
(groups A–…). Their ticks are the record: a ticked step was walked and passed in its last walk. This skill
runs a walk; the how-to lives in the docs it names, so read them rather than working from memory.

- Windows: `docs/smoke/smoke-cdp.md` — WebView2 over CDP, `cdp.mjs`, the `.ps1` fixtures and dialog script.
- Linux: `docs/smoke/smoke-linux.md` — WebKitGTK over WebDriver (`wd.mjs`, tauri-driver, Xvfb), `xdialog.sh`.

## 1. Pick the rows

The user names a group or section, or asks what is open: list the unticked rows with
`grep -nE '^\s*([0-9]+[a-z]?\. )?- \[ \]' docs/smoke/smoke-test*.md` (some rows are numbered: `9. - [ ]`). Read the whole group (its setup notes sit in the
prose above the boxes) and the latest `docs/archive/walks/*` record for it — that is the template for the
one you write. Say up front which rows this OS cannot reach (the docs' "not reachable" lists: native
pickers on Windows, DPI, live Wayland, package updates) and leave those for a hand walk.

## 2. Fixtures

- Windows: `pwsh -File docs/smoke/fixtures/smoke-fixtures.ps1 -Force` (into `C:\tmp\t4`).
- Linux: `bash docs/smoke/fixtures/smoke-fixtures.sh --force` (into `/tmp/t4`).
- A group with its own fixture (`ba-`, `bd-`, `linked-`, `irebase-`, …): the group's prose names it;
  on Linux run it with `T4_ROOT=/tmp/t4`.

The `.ps1` is the source of truth for the main fixture; a change to either is mirrored in the other.

## 3. Build and launch

Check `node --version` is 24 first: the build runs `tsc` and vite.

- Windows: follow `smoke-cdp.md` — close every other instance, **back up the store folder**
  (`%APPDATA%\dev.topher.t4gitui\`), `smoke-launch.ps1` on a local `tauri build --no-bundle`.
- Linux: follow `smoke-linux.md` §1–2 — the `.smoke` identifier build, an isolated `HOME`, Xvfb and
  tauri-driver in the background, `wd.mjs start`.

Take a first screenshot and read it; a blank frame means the page never loaded.

## 4. Drive and measure

One row at a time, one driver call at a time (parallel calls race on the same window).

- Carry `document.title` in every measurement. A repository, dialog or tab you did not cause is a
  **stop condition**: someone is using the window, or a click hit the wrong thing. Check `git reflog`
  in the fixture before trusting anything after it.
- Check outcomes in git, not in the UI's word for it: `git -C <fixture> diff --cached`, `status`, the
  file's bytes (`md5sum`, `od -c` for CRLF rows).
- Read every screenshot you take.
- Native dialogs: `smoke-dialog.ps1` (Windows) / `xdialog.sh` (Linux). Start it right after the click
  that opens the box, and check its last line — an unanswered confirm looks like an action that did nothing.

## 5. Record

- Tick only rows walked **and** passed on this run. Add the dated note in the doc's own style
  (`Walked 2026-09-26 on a Linux debug build of <sha> …`). A row that failed stays unticked.
- Write `docs/archive/walks/YYYY-MM-DD-<group>-walk.md`: the build (sha, OS, how launched), fixtures,
  one line per row (pass / fail / not reachable and why), and anything seen on the way.
- A failure is reported as group + bullet (`G2`), what was seen, the tail of the output dock or log,
  and which fixture repo.

## 6. Clean up

- Windows: close the app properly, restore the store folder and `cmp` it; delete `.playwright-mcp/`.
- Linux: quit through the app, stop tauri-driver / WebKitWebDriver / Xvfb, and check `pgrep` is empty
  (`smoke-linux.md` §4).

Don't commit the ticks or the walk record unless the user asks.
