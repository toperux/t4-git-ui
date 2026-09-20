# Group BD: the 2026-09-20 review fixes — 2026-09-21

`docs/smoke/smoke-test-post-v1.md` group **BD**, walked the day the ten fixes landed
(`9f617ec..7cc503b`). Driven over CDP (`docs/smoke/smoke-cdp.md`) against a local
`tauri build --no-bundle` of `7cc503b`. Light theme. Git 2.55 on Windows 11.

The installed app was closed and the store folder (`%APPDATA%\dev.topher.t4gitui\`: `layout.json`,
`recents.json`, `.window-state.json`, `x.json`) copied aside first and copied back after, compared
byte for byte. The walk's node scripts were session scratch and are not kept; what they needed that
`cdp.mjs` lacks is one page target picked by title per step (several windows), a file write and a
real click issued from the same process (row 4), and `WM_CLOSE` by window title.

Fixture: `docs/smoke/fixtures/bd-fixture.sh` → `c:/tmp/t4/bd` + `bd-origin.git`. Clones made during
the walk went to `c:/tmp/t4/clones/` and were removed after.

## Results

| Step | Result |
|---|---|
| 1 bracketed names | **pass** — Discard on `pages/[id].txt` restored it and `pages/i.txt` kept its edit; both staged, Unstage on `[id].txt` left ` M pages/[id].txt` / `M  pages/i.txt` |
| 2 missing final newline | **pass** — `+c` alone → `Stage failed … the file's missing final newline is part of this change: select the lines around it too, or the whole hunk`, index untouched; Stage hunk → the index blob is `a\nb\nc\n` |
| 3 Latin-1 | **pass** — Stage hunk → `latin1.txt is not UTF-8, so a part of it cannot be applied faithfully; stage or discard the whole file`; Stage on the file → the index holds `caf\xE9 au lait` |
| 4 a diff that changed under the button | **pass**, through the real button: the file written and **Stage hunk** clicked a few milliseconds apart in one process. An edit above that shifts the hunks → `many.txt changed since this diff was shown; nothing was applied`, index untouched. A same-shape edit (`LINE 20` → `line TWENTY`, same header) → the same refusal |
| 5 push to the upstream's name | **pass** — preview `git push --progress origin --end-of-options dev:develop`, toast `Pushed dev → origin/develop`, the bare origin has `develop` at the new commit and no `dev` |
| 6 op ownership | **pass** — a rejected push in window B opened B's dock and raised B's toast; window A's dock stayed collapsed and empty, no toast. Two clones overlapping (`git/git` and `libgit2/libgit2`, each dialog showing only its own progress): Cancel on the first ended it and removed its folder, the second went from 22 % to done and opened in its own window. The no-holder `emit` fallback was **not walked** |
| 7 a hook that backgrounds a child | **pass** — four commits with `sleep 60 &` as `post-commit`: the button read `Committing…` from 26 ms to about 650 ms each time, a commit a few seconds after the last was not `Busy`, with two `sleep.exe` still alive |
| 8 one instance | **pass** — a second start: one process, a second window on the start screen. Opening `bd` there: the backend answers `openElsewhere`, the first window goes to the top of the z-order, the new one stays on its start screen. A repository cloned into the new window and its tab closed → the window closed. An empty window closed, then the app: `layout.json` held `bd` alone and the relaunch restored one window. **"In front"** could not be shown from the script — the second start came from a background script while another application had the foreground, so Windows' foreground lock applied; the plugin's `AllowSetForegroundWindow` only helps a launcher that owns the foreground, which a double-click does. Walked by hand the same day: the exe double-clicked while the app ran, the new window came up on top |
| 9 squash and no-ff | **pass** — "Always create a merge commit" unticked Squash, disabled it (title: `A squash records no merge commit, so git refuses it with this strategy`), preview `git merge --no-ff …`; back on "Fast-forward when possible" with Squash, `git merge --ff --squash` left `A  many.txt` staged and HEAD where it was |
| 10 install while an op runs | not walked — needs a published update (with group AC) |

Linux, the same day, on a WSLg build of `7cc503b`: with the session bus a second start hands over
(one process, two windows); with `DBUS_SESSION_BUS_ADDRESS` unset and an empty `XDG_RUNTIME_DIR`
both starts come up, two processes; with the variable set to `garbage` or to nothing the app panics
in the plugin (`linux.rs:57`) — accepted, `open-items.md` §I.

## Findings

1. **A write in the 50 ms after an operation ends is never shown** (older than this batch:
   `crates/git-core/src/watch.rs`, `SUPPRESS_GRACE`). The walk wrote a file the moment a commit
   returned; the status bar stayed `Clean` and the Changes badge empty for over a minute, until
   **Refresh**. The watcher drops every event stamped before `un-suppress + 50 ms` as the
   operation's own, and the post-operation status read had already run. No person is that fast; a
   tool started by the commit can be — and since `bb27c36` an operation ends while a hook's
   backgrounded child may still be writing. Recorded in `open-items.md` §N, not fixed.
2. **The fixture's bare origin pointed `HEAD` at `master`**, which does not exist, so a clone of it
   checked nothing out. Fixed in `bd-fixture.sh` (`git init --bare -b main`); the script also gained
   the thirty-line `many.txt` row 4 needs and `core.autocrlf false`.
3. **After a commit the window goes back to History** (the auto-close setting), so a scripted second
   commit has to press **Changes** again — for the next walk, not a defect.
