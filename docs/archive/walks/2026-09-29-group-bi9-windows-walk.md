# Group BI row 9: the 0.10.14 hotfix on Windows — 2026-09-29

The walk of `smoke-test-post-v1.md` › group BI, row 9: on Windows the AppImage gate never fires, so *Open*, the
release-page button and an HTTPS fetch must behave as before, and *Open* on a missing file must still give a *could
not open* toast (D12). The `smoke-walk` skill's Windows route was used.

**Setup:**
- **Build:** a local `tauri build --no-bundle` of `f79088d` (`walk/0.10.12`: the hotfix/0.10.14 code labelled 0.10.12,
  so the app offers the published 0.10.13), in a scratch worktree. Built with
  `--config {"identifier":"dev.topher.t4gitui.smoke"}` so the build keeps its own store folder
  (`%APPDATA%\dev.topher.t4gitui.smoke`, logs in `%LOCALAPPDATA%\dev.topher.t4gitui.smoke`); the string is in the exe,
  and after the first launch the new folder held `layout.json` + `recents.json` while the real store's file times
  did not move. Windows 11 Pro 10.0.26200, Node 24.19.0.
- **Launch:** `smoke-launch.ps1 -Exe <worktree exe> -DataDir %TEMP%\t4-smoke-wv2-bi9` (CDP 9222, a fresh WebView2
  profile). The `.smoke` store was seeded with a `layout.json`: first one `c:\tmp\t4\work` tab, then `work` +
  `c:\tmp\t4\https-clone` for rows 3–4 (the app was closed with `CloseMainWindow()` in between).
- **Driver:** `docs/smoke/cdp.mjs` with a scratch tagging script, screenshots from a scratch `Page.captureScreenshot`
  helper, every one read. `document.title` was carried in every reading; no window, dialog or repository appeared that
  the walk didn't cause.
- **Fixtures:** `smoke-fixtures.ps1 -Force` (`work`), and `C:\tmp\t4\https-clone`, a `git clone` of
  `https://github.com/toperux/t4-git-ui.git` made for row 3 with `refs/remotes/origin/main` rewound one commit
  (`c02f367` → `f5dbcfa`) so the fetch had a ref to move. Deleted afterwards.
- **Store folder:** the real `%APPDATA%\dev.topher.t4gitui\` was never written. Before and after the walk, a read-only
  `cmp` against the caller's backup found all four files (`.window-state.json`, `layout.json`, `recents.json`,
  `x.json`) byte-identical and the file set the same. The `.smoke` folders and the WebView2 profile were deleted.

## Checks

- **1. Open: pass.** In `work`'s Changes view, right-click `src/a.txt` → **Open**. Notepad (the `.txt` default, the
  Store app) started with `a.txt - Notepad`; its session argument decodes to `C:\tmp\t4\work\src\a.txt`. No toast
  (only the status bar in `[role=status]`). Notepad was closed afterwards.
- **2. Release page: pass.** Settings (Ctrl+,) → **Check now** → *Version 0.10.13 is available*, with **What's new**
  and **Update to 0.10.13…** (installable, so no *Download…*; the update button was not touched). **What's new** opened
  *Release T4 Git UI v0.10.13 · toperux/t4-git-ui* in the running Edge (the window's page count went 100 → 101). No
  toast.
- **3. HTTPS fetch: pass.** `https-clone` open (status bar `origin · github.com/toperux/t4-git-ui`), toolbar **Fetch**:
  toast *Fetched origin*, the dock `$ git fetch --progress --prune --end-of-options origin` → exit 0 · 0.8 s.
  `git reflog refs/remotes/origin/main`: `c02f367 … fetch --progress --prune --end-of-options origin: fast-forward`,
  after the walk's rewind to `f5dbcfa`; `main...origin/main` level.
- **4. Open a missing file: pass.** In `work`, the row menu of `src/lib/b.txt` opened first, then the file was deleted
  on disk, then **Open**: the error toast *Couldn't open the file — could not open src/lib/b.txt: The system cannot
  find the file specified. (os error 2)*. The row turned `D` after, from the watcher.

## Also seen

- **The release-page tab was left open.** Neither Ctrl+W sent to the focused Edge window nor a UI Automation *Invoke*
  on the tab's own **Close tab** button closed it. The window title (and its page count, 101) did not change, and
  nothing else changed: the Edge window count stayed 26 and the other apps' titles were the same. The tab
  *Release T4 Git UI v0.10.13* is still open in the Edge window that was *Task Heap Screens*, for the owner to close.
- **The output dock is per window**, not per tab: after switching to `work`, it still showed the `https-clone` fetch.
  `work` had no `FETCH_HEAD` and no new reflog entry, so nothing ran there.
- **The fixture is left changed:** `work`'s `src/lib/b.txt` was deleted for row 4. Rerun `smoke-fixtures.ps1 -Force`
  before the next walk that uses `work`.
- **The window title reads `T4 Git UI - <repo>`** on this build, as in group BH.
