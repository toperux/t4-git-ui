# Group BD, rows 11–16: what the first walk left out — 2026-09-21

The first walk of the 2026-09-20 review fixes (`2026-09-21-group-bd-walk.md`) took one path through
each fix. This one takes the paths it skipped: the other bracketed-name sites (F1), the other three
hunk / line commands (F9), the other push shapes (F4), an op that outlives its window (F6), and the
Squash checkbox looked at rather than read from the DOM (F5). Same method: CDP against a local
`tauri build --no-bundle`, the store folder copied aside and compared byte for byte after. Git 2.55,
Windows 11. Fixture: `docs/smoke/fixtures/bd2-fixture.sh` → `c:/tmp/t4/be`.

Rows 11, 12, 14–16 ran on a build of `7cc503b`; row 13 failed there and was walked again on a build
with its fix.

## Results

| Row | Result |
|---|---|
| 11 conflict checkouts on `pages/[id].txt` | **pass** — Keep side's version: the file is side's and staged, `pages/i.txt` still `UU`. Both staged with their markers, **Restore conflict** on `[id].txt`: `UU pages/[id].txt`, `M  pages/i.txt`. Keep main's version: main's text, `i.txt` untouched |
| 12 file history | **pass** — the chip reads `History: [id].txt`; rows `main pages`, `side pages`, `id only`, `pages`; no `i only` |
| 13 submodule update | **fail, fixed, pass** — Update on `subs/[ab]` moved `subs/a` and left `subs/[ab]` alone: the dock showed `git --literal-pathspecs submodule update … -- subs/[ab]`, which is what the fix wrote, and git ignores it there. On the command line: plain, `--literal-pathspecs` and `GIT_LITERAL_PATHSPECS=1` all update `subs/a`; `:(literal)subs/[ab]` updates `subs/[ab]`. Fixed (`:(literal)<path>`, a test that runs git and fails on the old arguments); on the rebuilt app `subs/[ab]` moves and `subs/a` stays |
| 14 the other hunk / line commands | **pass** — Unstage hunk: the second of two staged hunks back out, the first still staged. A `git add` of a new version and **Unstage hunk** from one process: `Unstage failed — many.txt changed since this diff was shown; nothing was applied`, the index keeps the new version. Discard hunk and Discard 1 line: each works, and each is refused with the same words when the file is rewritten a few milliseconds before the confirm's **Discard** — the backend's check, not the panel's (the watcher had not fired yet) |
| 14 a diff cut at the line cap | **not reachable** — `huge.txt`, 25 000 lines rewritten: `Diff truncated at 20 000 lines`, and the panel offers no hunk or line action on it at all (`wholeOnly`). The `linesShown` half of the print has unit tests only |
| 15 the other push shapes | **pass** — Remote `other`: preview `git push --progress other --end-of-options dev`, `other` has `dev` and no `develop`. Set upstream with `origin`: `git push --progress -u origin --end-of-options dev:develop`, `origin/develop` at the new commit, no `origin/dev`, `dev` still `[origin/develop]` |
| 16 an op and its window | **pass** — during the 12 s `pre-push`: **Move to new window** and **Close tab** are disabled (a tab drag goes through the same `refusedWhileRunning`). The window closed with `WM_CLOSE` three seconds in: the push landed (`origin/develop` at `dev work 3`), the other window's dock read `No output yet` with no toast, one process, no stray `git`; `be` reopened and fetched, `exit 0` |
| 9 again, by eye | **pass** — light and dark: with "Always create a merge commit" the Squash row is dimmed and unticked next to full-strength labels; ticked under "Fast-forward when possible", choosing no-ff unticks it. The `title` is an OS tooltip and does not show in a CDP screenshot |

Not walked, and why: the update-and-restart path and the installer closing a single-instance app
both need a published update (BD 10, group AC). The no-holder `emit` fallback is not reachable
from the UI — the owner's label is read once, when the op starts, and only a window that holds the
repository can start one; a window closed mid-op gets `emit_to` a label nobody has, which is silent.

## Rows 17 and 18, after the follow-up fixes

On a build of `53d7ac7`; both rows were seen failing first on the build of `1adbeff`.

| Row | Result |
|---|---|
| 17 History and Blame from Changes and from dialogs | **fail before, pass after** — before: both clicks left the window on Changes with nothing changed on screen. After: **History** on an unstaged `many.txt` → the History view, chip `History: many.txt`, row 0 selected; the chip's × → the full walk. **Blame** → the History view, Files tab, `many.txt` with its gutter. From the commit dialog with `draft kept` typed: History closed it onto the filtered grid, and the reopened dialog still read `draft kept`; Blame closed it onto the Files tab. In a commit's diff window: Blame left the window open and the window showed the blame; History closed it onto the filtered grid |
| 18 a write the moment a commit returns | **fail before, pass after** — one driver process: Commit pressed, the button back to `Commit` at 79 ms, the file written at about 105 ms. Before: `gapred1.txt` on disk, the list showed `subs/a` alone. After, three runs of three: the badge counted the new file within three seconds, no Refresh |

While writing row 17's fix: closing every dialog from `blameAt` would have broken the diff window,
which is bound to the same store as the details pane and drills down through blame in place — so
Blame closes the commit dialog only.

## Findings

1. **`git submodule update` ignores `--literal-pathspecs`** — row 13. This batch's own fix (F1),
   wrong for one of its four sites; the other three (`checkout --ours/--theirs`, `checkout --merge`,
   `log --follow`) honour the flag and were walked. The argument-shape test passed throughout, which
   is why the new test runs git.
2. **A staged diff's body can stay stale after an outside `git add`** (older than this batch). Seen
   setting row 11 up: the file rewritten and `git add`ed from a script, a status read landing between
   the two. The row went to `+4`, the body stayed on the old blob until the row was reselected. The
   reload is keyed on the status entry, which stamps the working-tree side only. A hunk action on
   the stale body is refused by the print check. `open-items.md` §N.
3. **`linesShown` cannot differ from the hunk's length in the panel** — row 14. Harmless; noted in
   `open-items.md` §N.
