# PR #18 Linux re-walk (the layout gate, the Ctrl/⌘ change) — 2026-09-27

The Linux half of the re-walk after `639856e` (no layout write before the last session is read) and `f5276b6`
(a Ctrl/⌘ chord is not keyboard input for the focus ring). The Windows half is
`2026-09-27-t19-windows-walk.md`.

## Setup

- **Machine:** WSL2 Ubuntu 24.04.4 on the Windows host, WebKitGTK 2.52.6, Xvfb `:99` (1600×1000).
- **Build:** a debug build of `f5276b6` with the `.smoke` identifier (`smoke-linux.md` §1). For the baseline, a debug
  build of `a30b729`, the commit before the gate.
- **Packages:** `webkitgtk-webdriver` in `smoke-linux.md`'s prerequisites has no candidate on 24.04; the package
  there is `webkit2gtk-driver`.
- **Fixtures:** `smoke-fixtures.sh --force` into `/tmp/t4`, and a scratch `HOME` (`/tmp/t4s/home`).
- **Driving:**
  - Items 1–2 used a direct launch through `direct.sh`, with no WebDriver.
  - Item 3 used WebDriver for readings. Every click and key was a real X event through `xdotool`.

## 1. Restore guard with the gate: pass

- **The run:** two-window restores (`work` + `other`). After each, the app was SIGKILLed and `layout.json` read.
- **First batch, 20 runs, the helper as it was:** 4 did not come up, 0 lost.
  - All four were *no app*: the process had exited, not hung. That is the harness race (the finding below). Those
    four never ran `spawn`, so they tested nothing.
- **Second batch, 20 runs, with the helper patched locally to wait for the bus name:** 0 not up, 0 lost. The patch
  landed in `direct.sh` with the fix batch.

## 2. The second launch during startup: pass, and the baseline shows the loss

- **The run:**
  - Seed a two-window `layout.json`.
  - Launch, then launch again after a gap.
  - Poll `layout.json` every 50 ms for 8 s.
  - List the windows.

| Gap | `a30b729` (no gate) | `f5276b6` (gate) |
|---|---|---|
| 0.05 s | `[]` at +108 ms, then `[other]`; **`work` lost**: `main` came up on `other` | both kept; `work`, `other` + the second launch's empty window |
| 0.1 s | `[]` at +157 ms, then `[other]`; **`work` lost** | both kept (see the note below) |
| 0.3 / 0.5 / 1.0 s | both kept (the second launch landed after the read) | both kept |

- **Seen on the gated build at 0.1 s:** `layout.json` held only `[other]` for about 50 ms.
  - **When:** after `main` read the session, and before `main` reported its own tabs. `spawn`'s immediate write
    doesn't include `main` yet.
  - **Risk:** a crash in that window would lose `work`.
  - **Not a regression of the gate:** the restore guard does the same without a second launch (the "crash-at-launch
    state" in the Linux plan).
  - **Fixed by the batch's `afc40f3`:** `take` now seeds `main` and leaves the file in place (see the section at the
    end).

## 3. Focus after the Ctrl/⌘ change: pass

Each reading is `document.activeElement`, `:focus-visible`, `[data-kbd]:focus` and its box-shadow. The screenshots
were read for W2, W3 and AZ 6.

| Path | Seen | |
|---|---|---|
| A click on a grid row, then Ctrl+Comma | Close: `fv=false kbd=false`, no ring | pass |
| A click, Tab, then Ctrl+Comma | Close: `fv=true kbd=true`, ringed (screenshot) | pass |
| A click on a grid row, Ctrl+K, then Escape | the grid: `kbd=true`, the selected row outlined (screenshot) | pass |
| AZ 6: a click on a row, Shift+F10 | the menu opens on *Checkout conflict*, marked; Escape → the row outlined | pass |

**Seen on the way:**
- **A click on the grid while it already has focus kept the mark:** `kbd=true` after the click, because no `focusin`
  fires to clear it.
- **Chromium keeps `:focus-visible` in the same case:** seen on Windows in T19 (case A, and the AZ 6 note in
  `2026-09-27-t19-windows-walk.md`). So this is parity, and it stays.

## Finding: `direct.sh`'s `killapp` doesn't wait for the single-instance name

- **The race:** the D-Bus name `<identifier>.SingleInstance` outlives the killed process by about 50–100 ms. A
  launch in that window hands its argv to the dying instance and exits at once, without output.
  - **Measured:** 7 of 20 launches right after `killapp`; 0 of 20 after a 2 s pause (its own run, not §1's; the
    same count as §O's 7 of 20 by coincidence).
  - **Also 0 of 20** when polling `busctl --user status <identifier>.SingleInstance` until it fails.
- **Consequence:** `waitfor` reports these as a timeout, with *(no app)* in its listing. They look like the
  "restored second window never starts" hang.
- **So the later 7 of 20 in `open-items.md` §O is likely this race.** Its loop killed and relaunched, and whether
  those 7 were alive wasn't recorded.
  - **The 3 of 16 is not the race:** those were a live `w1` that never got its repository title (the one under
    WebDriver on the *Starting* spinner); the race leaves no window.
  - **On this machine, 0 of 40 two-window runs hung for real** (4 of them, with the old helper, were the race and
    never reached `spawn`). The rate itself is re-measured at Phase A, on the native Linux host with the fixed
    helper.

## Clean up

- **The app:** quit through the app (`invoke('quit')`).
- **The harness:** tauri-driver, WebKitWebDriver and Xvfb stopped, and `pgrep` came back empty.
- **Removed:** the baseline tree and build, and the scratch `HOME`.

## After the fix batch (`docs/plans/2026-09-27-pr18-fix-batch-plan.md`), both OSes

**Builds:**
- **Fixes:**
  - `afc40f3`: `main`'s saved tabs stay in `layout.json` while its session is restored. `take` seeds `main`, leaves
    the file in place, and a second `take` returns `main`'s own entry. No shrink while restoring.
  - `6465201`: only Ctrl/⌘ with a navigation key counts as keyboard input.
- **The new build:** `71789c9` everywhere, the fixes before review pass 2. That pass changed only comments and
  `src/README.md`, and the fixes became `afc40f3` and `6465201`. WSL ran a debug `.smoke` build; Windows a
  `tauri build --no-bundle` release with CDP on 9222.
- **Baselines:** WSL, the `f5276b6` build; Windows, the installed 0.10.12.
- **The harness:** `direct.sh` with the fixed `killapp`.
  - `bash -n` is clean.
  - The header's loop, with no pause: 20 of 20 up.
  - The same loop with `busctl() { return 1; }`, for the 1 s fallback: 10 of 10 up.
  - The WSL `/tmp` is wiped when the VM restarts: rebuild `/tmp/t4` first, or every window waits out `waitfor`.

**The poll:**
- **Method:** a synchronous Node busy loop over `layout.json`, about 10 s per launch. It logs each distinct state;
  `ENOENT` counts as absent, and other read errors are retried.
- **Seeds:**
  - A: `main` = `work`, `seed1`, `seed2`; a second window = `other`, `seed3`.
  - B: `main` alone, with the same three tabs.
- **Pass:** every state holds every seeded tab.

| Check | Baseline | `71789c9` |
|---|---|---|
| Seed A, WSL | 5 bad states: absent; `[other, seed3]` (no `main`); `main` regrowing one tab at a time; once the second window without `seed3` | 1 state, never short |
| Seed B, WSL | absent, then `[work]`, `[work, seed1]` | 1 state, never short |
| Seed A, Windows | absent, then both windows regrowing one tab at a time (5 bad states) | 1 state, never short |
| Seed B, Windows | absent, then `[work]`, `[work, seed1]` | 1 state, never short |
| Reload `main` (seed A), Windows over CDP | a third, empty window `w2` (T15) | still 2 windows; `main` back on its tabs; `layout.json` intact |
| Reload `main` (seed A), WSL over WebDriver | a third window (3 handles) | still 2 handles; `layout.json` intact |
| Second launch at 0.05 / 0.1 s, WSL | — | both kept, `app processes: 1` |
| Second launch at 0.1 s (W4), Windows | — | kept; `main` on `work`, `w2` on `other`, `w1` empty |
| 30 two-window restores, WSL | — | 0 not up, 0 lost |

**Focus.** Readings are `:focus-visible` (fv) and `data-kbd` (kbd). All keys were real: X events in WSL, CDP key
events on Windows.

| Path | 0.10.12, Windows | `71789c9`, Windows | `71789c9`, WSL |
|---|---|---|---|
| W1: click, Ctrl+Comma | — | Close: no ring | Close: no ring |
| W2: click, Tab, Ctrl+Comma | — | Close: ring | Close: ring |
| W3: click, Ctrl+K, Escape | — | the grid: kbd, row ring | the grid: kbd, row ring |
| AZ 6: click, Shift+F10, Escape | — | — | menu marked; the row ringed after Escape |
| F6: click `main` in the sidebar, Ctrl+↓ | `reset-me`: fv=false, **no ring** | `reset-me`: kbd, **ring** | `reset-me`: kbd, ring |
| Click a grid row, Ctrl+F5, Ctrl+K ×2 | the grid: no ring | the grid: no kbd | the grid: no kbd |

- **F6 is a visible change on Windows,** accepted (the plan's R5b). Chromium doesn't count Ctrl+↓ after a click;
  the mark now does, on every OS.
- **Two windows under WebDriver** came up on both reload runs. That is T7's re-test, once, not a verdict.
- **Clean up:**
  - The scratch clones, the baseline build and the harness processes are removed.
  - The Windows store was backed up with the app closed, and restored afterwards: all four files `cmp`-identical.
