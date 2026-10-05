# Group BH: close-out Phase 2a — 2026-09-29

The walk of `smoke-test-post-v1.md` › group BH, the Phase 2a fixes (`docs/archive/plans/2026-09-28-phase-2a-plan.md`,
rows 1, 2, 3, 6, 7, 9 and 14, and the triage T8 proxy check). The `smoke-walk` skill's Windows route was used.

**Setup:**
- **Build:** a local `tauri build --no-bundle` of `e5d8eb5` (the `phase-2a` head), version 0.10.12. Windows 11 Pro
  10.0.26200.
- **Launch:** `smoke-launch.ps1`'s environment (CDP 9222, the isolated WebView2 profile `t4-smoke-wv2-9222`). Rows 1–3
  used a scratch copy of it that times the kill and polls `layout.restoring` every 5 ms. Row 11 used `smoke-launch.ps1
  -Proxy` itself. Kills were `taskkill /F /PID`. A window was closed with `WM_CLOSE`, as its × does. Quit was Ctrl+Q
  in a repo window.
- **Driver:** `docs/smoke/cdp.mjs`. Screenshots came from a scratch `Page.captureScreenshot` helper, and every one was
  read. `document.title` was carried in every reading, and no window, dialog or repository appeared that the walk
  didn't cause.
- **Fixtures:**
  - `smoke-fixtures.ps1 -Force` (`work`, `other`), `bd-fixture.sh` (`bd`) and `bd2-fixture.sh` (`be`).
  - `c:\tmp\t4\big-repo-clone`, a local clone of a 12k-commit repository.
  - `c:\tmp\t4\slowrefs`, a clone of `big-repo-clone` with 150 000 lightweight tags (`update-ref --stdin`, then
    `pack-refs`). It was made for rows 1 and 3 and deleted afterwards.
- **Store folder:** the installed app was closed. The caller had already backed up `%APPDATA%\dev.topher.t4gitui\`
  (`.window-state.json`, `layout.json`, `recents.json`, `x.json`). After the walk, `layout.crashed.json` was deleted
  (no `layout.restoring` was left) and the four files were copied back. `cmp` found all four byte-identical and the
  file set the same.

## Why rows 1 and 3 needed a slow repository

- **The mark is short-lived on small repositories.** `layout.restoring` lives from ~420 ms to ~620 ms after the
  launch, for `work` + `other` and also for `big-repo-clone` + `work`.
- **`taskkill` is slower than that.** It takes ~350 ms itself, so three attempts killed the app just after the mark
  was cleared, even when fired 50–100 ms after the mark appeared. In all three the mark existed at the check before
  the kill and was gone after it, the session restored, and there was no toast. That is also a no-false-trip result.
- **The fix:** with `slowrefs` as the second window, labelling the 150 000 refs before the log walk keeps the mark for
  ~4.4 s (seen at 423 ms, gone at 4 779 ms). That is wide enough for a kill at ~1 s and for the two mid-restore cases
  of row 3.

## Rows

- **0: pass.** The backup was taken before the walk, and the restore was byte-exact (`cmp`, above).
- **1: pass.** Seeded `[work, slowrefs]` and killed at ~1 s, with the mark present at the kill and still on disk
  after it. The relaunch showed:
  - the start screen, with the error toast *Your last session wasn't reopened — The app closed while reopening it,
    so it started empty this time. Your repositories are still in Recents. The saved windows are in
    layout.crashed.json.*;
  - `layout.crashed.json` byte-equal to the `layout.json` from before the trip (`cmp`);
  - `lastOpen: null` (it was `c:\tmp\t4\slowrefs`);
  - the mark gone at 417 ms, once `main` was up.

  A second relaunch opened nothing and showed no toast. Between the two, the mark was armed at 416 ms and cleared at
  431 ms by `main`'s empty report.
- **2: pass.** Seeded `[work, other]`, with a hand-created empty `layout.restoring` and a non-null `lastOpen`. The
  launch tripped the same way:
  - the toast, with the file sentence;
  - `lastOpen` cleared to null;
  - the mark cleared at 552 ms.

  The old `layout.crashed.json` (`work` + `slowrefs`) was replaced by the new session (`work` + `other`), byte-equal
  to the seed. Walked twice. The first run didn't read `lastOpen` back before the launch. In the second, the hand
  edit had garbled it to `c:\tmp\t4work` (shell escaping), which is still non-null, and it was cleared to null.
- **3: pass,** in five cases:
  - **Kill after a full restore** (`big-repo-clone` + `work`, mark gone): both windows back, no toast.
  - **Quit** (Ctrl+Q): both back, no toast.
  - **Windows closed one by one** (`WM_CLOSE`, 1 s apart): both back, no toast.
  - **Quit while the second window is still restoring** (`work` + `slowrefs`): Ctrl+Q went to `work` with the mark
    present (`slowrefs` needs ~4.4 s). The mark was gone after the Quit and `layout.json` kept both windows. The
    relaunch restored both, with no toast.
  - **Close the second window mid-restore, then kill `main`:** `slowrefs` was closed with the mark present
    (`markBeforeClose=True`) and the mark was gone right after (`markAfterClose=False`). `main` was then killed.
    The relaunch showed no toast. Walked twice.
    - In the first run, the kill landed after the 4 s close grace, and only `work` came back.
    - In the second, the kill landed inside the grace, and `slowrefs` came back too. That is the close-grace
      design, not the breaker.
- **4: pass.** Settings was opened from the gear, with a capture-phase `focusout` logger and a 10 ms `activeElement`
  poller installed through `Runtime.evaluate`. Check now was clicked. It was disabled for 200 ms and answered *T4 Git
  UI 0.10.12 is up to date*. Esc closed Settings with the focus on the gear (`:focus-visible`, `data-kbd`). The second
  run was Check now, then Tab: the focus went to the Theme select (`:focus-visible`), and Esc closed Settings.
  - **The Blink answer:** a focused button that disables itself fires `focusout` on itself, in the same tick as
    `disabled` flips, with `relatedTarget` null. `document.activeElement` becomes `<body>` and stays there after the
    button enables again. So the key events go to `<body>`, outside the dialog's form, which is the case the new
    document handler covers. Stage all in row 5 behaved the same.
- **5: pass.** The Commit dialog was opened from the repository menu in `work` (six unstaged changes). Stage all
  moved the focus from Summary to `<body>` (the same `focusout` pattern), and `git diff --cached` showed all six
  staged. Esc closed the dialog with the focus on the `work` repository button, its opener. The index was reset
  afterwards.
- **6: pass.** In `work`, **Cherry-pick d27161e…** was run on `nested folders`, an ancestor of `main`. The toast read
  *Operation failed — The previous cherry-pick is now empty, possibly due to conflict resolution. If you wish to
  commit it anyway, use:* (the joined sentence). The in-progress banner showed **Abort** / **Commit**,
  `CHERRY_PICK_HEAD` was present and nothing was staged. The banner's Abort gave the toast *Cherry-pick aborted*,
  `CHERRY_PICK_HEAD` was gone and no banner was left.
- **7: pass.** In `bd`, the `c` line of `latin1.txt` was changed to `d`, keeping its `caf\351` byte. In the Changes
  view:
  - the diff header reads *Not UTF-8 — stage whole file*, with no Stage/Discard hunk buttons;
  - the diff rows render as plain rows, with no `Diff lines` listbox, so there is no line cursor. A click on a line
    gave no *Selected lines* bar.

  The row's Stage staged the whole file. `git show :latin1.txt` is `a\ncaf\351\nd\n`, so the original byte was kept.
  The fixture was restored.
- **8: pass.** In `be`, a `[submodule "subs/zz"]` section was appended to `.gitmodules` by hand, and the sidebar's
  Submodules list gained `subs/zz` with no Refresh. **Discard…** was used on `.gitmodules` in the Changes view, and
  the native box *Discard changes in .gitmodules?* was answered **Discard** through `smoke-dialog.ps1`, which
  confirmed the box closed. `git status` showed `.gitmodules` clean, and the list went back to `subs/[ab]`, `subs/a`
  with no Refresh.
  - **Seen on the way:** deleting a section (`subs/a`) by hand does not remove it from the list, even after a manual
    Refresh. `repo.submodules()` (libgit2) lists the index's gitlinks as well as `.gitmodules` entries. So "the list
    follows" is walkable by adding a section, not by removing one. This is expected, not a finding.
- **9: pass.** HEAD was detached in `work` from a shell. At rest, the banner (*Detached HEAD at eab2229 …*) had
  **Checkout main** and **Create branch…** enabled. Then **Fetch** was run from the `slow` remote, whose upload-pack
  sleeps 60 s (`git fetch --progress --prune --end-of-options slow`). Both buttons were then disabled, with the title
  *Operation in progress*. After the fetch was cancelled from the dock (toast *Cancelled*), both were enabled with no
  title. `main` was checked out again afterwards.
- **10: pass,** at 1280×800 (`cdp.mjs --inner`):
  - **History, toggled:** the rail. The toggle's `aria-pressed` went from true to false and the content area widened
    from 1015 to 1244 px.
  - **Alt+2 to Changes:** the full sidebar (260 px, `aria-pressed` true).
  - **Toggled there:** the rail.
  - **Alt+1 back to History:** still the rail.
  - **Changes untoggled again:** the full sidebar; History was still the rail. The two views are independent.
  - **A new window:** the ask's "new window" is Ctrl+Shift+N, which detaches the active tab (`detachTab`) and needs
    a second tab. The app was relaunched with one window holding `work` + `other`, History was toggled to the rail,
    and Ctrl+Shift+N moved `work` into a new window. The new window (1674 px wide) opened with the full sidebar and
    followed its width: the rail at 900 px, full at 1280. The source window (`other`, 1280 px) kept its rail
    override.
- **11: pass.** `throttle-proxy.mjs 8888` was run, then `smoke-launch.ps1 -Proxy http://127.0.0.1:8888`. The launch's
  update check went through the proxy: `CONNECT github.com`, then `CONNECT release-assets.githubusercontent.com`.
- **12: not reachable.** The build is 0.10.12, the same as the latest release, so no update is offered: Settings'
  Check now said up to date. The row waits for a newer release, as rows AZ 9/10 do.

## Also seen

- **Ctrl+Q does nothing on the start screen.** It is a repo-window shortcut (`useShortcuts.ts`). During row 1, a
  relaunch after a Ctrl+Q on the start screen therefore handed over to the still-running app and opened a second
  empty window. That run was void and was redone after closing the windows with `WM_CLOSE`. This is not a finding.
- **The window title reads `T4 Git UI - <repo>`** on this build.
- **No leftovers:** no stray `git`/`sh` processes from the cancelled slow fetch, and no `t4-git-ui.exe` or proxy after
  the walk.

## Addendum, 2026-09-29: row 10 re-walked on `713da2d` (review fix R4)

The change review's other fixups (`ca5169b..713da2d`) need no re-walk: R1 changes only the branch where the
set-aside rename fails, which rows 1–2 can't reach (unit-tested on Windows); R3's 4-line cap leaves row 6's 2-line
toast unchanged; R2 is unit-only (row 12 isn't reachable); the rest are tests, comments and docs.

A local `tauri build --no-bundle` of `713da2d`, which adds the review's width fix: the sidebar width survives a view
switch that hid it. Launched the same way, with one window holding `work` + `other` at 1280×800. The store folder was
checked equal to the backup with `cmp` before the launch, and restored byte-exact after (`cmp`).

- **Toggle sequence: pass.**
  - History toggled: the rail, content 1244 px.
  - Changes: the full sidebar, 260 px.
  - Toggled there: the rail.
  - Back to History: still the rail.
- **Width, sidebar dragged in Changes: pass.**
  - Changes un-toggled: the full sidebar, 260 px.
  - `--drag "Resize sidebar" 140 0`: 400 px, content 875 px.
  - Alt+1 to History (the rail, so the sidebar is hidden), then Alt+2 back to Changes: the sidebar is 400 px again.
- **Width, sidebar dragged in History: pass.**
  - Changes toggled to the rail. History un-toggled: the full sidebar at 400 px, so the dragged width carries over to
    the other view.
  - Dragged −80: 320 px.
  - Alt+2 to Changes (the rail), then Alt+1 back to History: the sidebar is 320 px again.
- **New window: pass.**
  - History toggled to the rail, then Ctrl+Shift+N moved `work` to a new window (1674 px wide).
  - The new window opened with the full sidebar at the default 260 px. The dragged 320 is per window and stayed with
    the source.
  - The new window follows its width: the rail at 900 px, the full sidebar at 1280 px.
  - The source window (`other`, 1280 px) kept its rail.
