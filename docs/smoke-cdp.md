# Driving the smoke tests over CDP

How the 2026-09-05/06 walks of `smoke-test.md` and `smoke-test-post-v1.md` were driven from a
script instead of by hand. WebView2 exposes the Chrome DevTools Protocol, so Playwright can click
and read the real installed app; the few native pieces (folder pickers, `ask()` message boxes, the
OS theme, DPI) are the steps this cannot reach — they stay hand-walked.

## Launch

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
Start-Process "$env:LOCALAPPDATA\t4-git-ui\t4-git-ui.exe"
```

`http://127.0.0.1:9222/json/version` answers once the window is up. **Close every other instance
first.** WebView2 shares one browser process per user-data folder, and a launch whose browser
arguments differ from the process already running (this flag on one side, not the other) never
gets its webview: the new `t4-git-ui` process sits without a window, logs only "logging to file",
and only `Stop-Process` ends it. Two instances with the same arguments — both with the flag, or
neither — each open a window; only one of them answers on the port. Connect the
Playwright MCP server with `--cdp-endpoint http://localhost:9222`; after every relaunch of the app
call its `browser_close` once to drop the page handle from the previous process. Close the app
with `CloseMainWindow()` (or the window's ×) so `recents.json` is written; edit that store only
while the app is closed.

## Selectors that hold

- Start screen: `input[aria-label="Filter repositories"]`,
  `[role="listbox"][aria-label="Recent repositories"] [role="option"]`.
- Commit grid: `[role="grid"][aria-label="Commits"] [role="row"]` — row 0 is the header, row 1 is
  the working-tree row when the tree is dirty (or a merge is still to be committed).
- Banners: `[class*="banner"]` with buttons `Abort`, `Commit merge`, `Open commit panel`,
  `Continue`.
- Toolbar: `button` with text `Commit` (`disabled` + `title="No changes"` on a clean tree,
  `title="Merge to commit"` mid-merge), `Branch` › menu items `Create branch…` / `Checkout…` /
  `Merge…` / `Rebase…`; the Merge dialog's combobox is `button[aria-label="Branch to merge"]`.
- Commit panel: list mode (the default) is `[role="listbox"][aria-label="Unstaged files"]` /
  `"Staged files"` with `[role="option"]`; tree mode is `[role="tree"]` with `[role="treeitem"]`
  (an item's text is glyph + name + stats, e.g. `Mhunks.txt+3−1`, so match the name with
  `^M*hunks\.txt`, not a substring — `crlf-hunks.txt` also contains it). Right-click an
  item for the file menu (`[role="menuitem"]`: Stage, Keep <branch>'s version, Copy path, Open,
  Reveal in folder). `[aria-label="Summary"]` is the message field; the panel's Commit is the
  primary `button` with text `Commit`.
- Diff: `[role="region"][aria-label="Diff"]` is the scroll element itself; the lines are
  `[role="listbox"][aria-label="Diff lines"] [role="option"]`, virtualized — scroll the region
  before locating a row, and read `scrollTop` before and after an action to check for a jump. Hunk
  headers are `:text("@@ -")`; a header's buttons live in its row:
  `hdr.locator('xpath=ancestor::*[.//button][1]').locator('button', { hasText: /^Stage hunk$/ })`
  (hover the header first — they are hover-visible). The keyboard cursor is the row with
  `[data-cursor]`; the selected-lines bar is `[role="toolbar"][aria-label="Selected lines"]`.
- Run git command: `input[aria-label="Git command"]`, `[role="listbox"][aria-label="Completions"]`;
  the dock is `input[aria-label="Run git command"]` + `[role="log"][aria-label="Command output"]`.
- Toasts: `[role="alert"]` (errors) / `[role="status"]` (the rest) with `Dismiss` / `Remove from
  list` buttons. A toast can cover what you want to click — dismiss first. The status bar is a
  `[role="status"]` too — match toasts by their text, not by role alone.
- Clipboard: never `navigator.clipboard.readText()` from the script — WebView2 raises a permission
  prompt in a second tab that CDP can neither answer nor close, and the call hangs. The `Copied …`
  toast carries the copied text as its detail; read that instead.
- Panels: `[data-panel]`.

Two traps that cost a walk on 2026-09-11, both of which look like something else:

- **Never select a toolbar button by position.** `[role="toolbar"][aria-label="Repository"] > button:first-of-type`
  resolves to **Pull**, not the repository button: the repo button sits inside a wrapper that the
  accessibility tree flattens away, so the snapshot shows it as the toolbar's first child and the DOM
  does not. The click reports success and opens the Pull dialog, and the symptom — "the menu never
  opened" — reads like a stuck menu rather than a wrong target, so it survives a retry. Use the
  snapshot's `ref`, or a title selector (`button[title="Branch operations"]`).
- **The app under test is a window a person can use.** Mid-walk the open repository changed and a
  dialog appeared that no scripted action had opened, because the same window was being worked in by
  hand. Nothing in the harness says so. What caught it was `document.title` in a routine measurement,
  after several steps had already been driven against the wrong repository. So carry the title (or
  the status bar) in **every** measurement, and treat a change you did not cause as a stop condition
  rather than noise — then check `git reflog` in both repositories before trusting anything measured
  either side of it.

Playwright's `click()` scrolls the target into view first, which skews a "no scroll jump" check;
measure `scrollTop` after a plain `scrollIntoViewIfNeeded()` settles, then click. Its click does
focus the target the way a real mouse does, so focus checks are meaningful; jsdom's does not.

## Native dialogs

`ask()` boxes (Discard, Resolve conflict, Abort merge…) are Win32 message boxes the page cannot
see. `docs/smoke-dialog.ps1` lists them and clicks a button by label:

```powershell
pwsh -File docs/smoke-dialog.ps1                                      # what is open
pwsh -File docs/smoke-dialog.ps1 -Title "Resolve conflict" -Button Replace
```

Poll for the box rather than assume timing: start a loop that retries the script every half
second for twenty seconds before the Playwright click that opens it (the click may return while
the box is still up, or block until it closes). `WScript.Shell` `AppActivate` + `SendKeys` was not
reliable for this — the keys reported as sent and the box stayed; `BM_CLICK` on the button is.

## Fixture and cleanup

`docs/smoke-fixtures.ps1 -Force` rebuilds `C:\tmp\t4\{bare.git,work,other}`; the app follows the
rebuild through its watcher, but close it first if the rebuild hangs on a locked file. Delete any
`.playwright-mcp/` directory the MCP server leaves in the repo before committing. Steps that pass
are ticked in the two smoke docs; findings go into a dated file under `docs/plans/`.

The Linux-only steps were walked on a WebKitGTK build under WSLg — see the "Not walked" section of
`docs/plans/2026-09-05-full-rewalk.md` for that setup.
