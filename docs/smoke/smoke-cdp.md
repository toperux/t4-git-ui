# Driving the smoke tests over CDP

How the 2026-09-05/06 walks of `smoke-test.md` and `smoke-test-post-v1.md` were driven from a
script instead of by hand. WebView2 exposes the Chrome DevTools Protocol, so Playwright can click
and read the real installed app; the few native pieces (folder pickers, `ask()` message boxes, the
OS theme, DPI) are the steps this cannot reach — they stay hand-walked.

## Launch

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
Start-Process "$env:LOCALAPPDATA\T4 Git UI\t4-git-ui.exe"
```

`http://127.0.0.1:9222/json/version` answers once the window is up. **Close every other instance
first.** Since the single-instance guard a second launch is not a second process: it hands over to
the running app — which opens the new window — and exits, so the installed app must be closed
before a local build is launched, or the walk drives the installed build without knowing it.
WebView2 shares one browser process per user-data folder, and a launch whose browser
arguments differ from the process already running (this flag on one side, not the other) never
gets its webview: the new `t4-git-ui` process sits without a window, logs only "logging to file",
and only `Stop-Process` ends it. Two instances with the same arguments — both with the flag, or
neither — each open a window; only one of them answers on the port. Connect the
Playwright MCP server with `--cdp-endpoint http://localhost:9222`; after every relaunch of the app
call its `browser_close` once to drop the page handle from the previous process. Close the app
with `CloseMainWindow()` (or the window's ×) so `recents.json` is written; edit that store only
while the app is closed.

## Driving it without Playwright

`docs/smoke/cdp.mjs` is a dependency-free CDP driver, used for the 2026-09-15 pane-resize and
toast/toolbar walks. Steps run in argv order:

```
node docs/smoke/cdp.mjs --inner 1280x800 --wait 400 --eval "expr" --eval @file.js \
                        --drag "Resize sidebar" 60 0 --key Alt+2 --click "sel" --dblclick "sel"
```

`--inner` resizes the real window through `Browser.setWindowBounds` and converges on an exact CSS
viewport, because `setWindowBounds` counts the frame and the script does not. Do **not** reach for
Playwright's `setViewportSize` or the MCP `browser_resize` for layout work: both install a
device-metrics override that pins the viewport and leaves the window unable to reflow until it is
cleared with a 0x0 `Emulation.setDeviceMetricsOverride`.

Three more gestures, added for the 2026-09-16 walk:
- `--clickat "sel" dx dy` clicks at an offset from an element's top-left corner, for example a
  toast's padding.
- `--dragto "from" "to"` presses near the end of one element and releases on another, for example
  a selection that overshoots.
- `--dragpath "Separator label" 150,0` makes several vertical legs inside one press.

`--click` and `--dblclick` dispatch real `Input.dispatchMouseEvent` pairs (`clickCount` 1 then 2).
Synthetic DOM events do not reach library handlers, which is what made the output dock's
double-click unprovable in an earlier walk.

### A local build, isolated from the installed app

`docs/smoke/fixtures/smoke-launch.ps1` starts a build on the debugging port with its own
`WEBVIEW2_USER_DATA_FOLDER`, so a walk cannot fight the installed app over the WebView2 profile
(localStorage: theme, settings, splitter sizes):

```powershell
pwsh -File docs/smoke/fixtures/smoke-launch.ps1              # the local release build
pwsh -File docs/smoke/fixtures/smoke-launch.ps1 -Installed   # the installed app instead
```

It prints the pid, the profile directory and whether the port answered. Group AU was walked this
way on 2026-09-14 against a local `tauri build --no-bundle` while 0.10.1 stayed installed.

**The store folder is not isolated.** `%APPDATA%\dev.topher.t4gitui\` — `recents.json`, `layout.json`,
`.window-state.json` — is one folder for every build on the machine, and a local build rewrites all three:
opening a fixture pushes it into the installed app's recents, and closing the walk's windows replaces the
installed app's saved session. Before a walk that opens or closes anything: close the installed app, copy
the folder's files aside, and copy them back with every build closed — then `cmp` them. Group AZ was walked
that way on 2026-09-19.

### Several windows, and what else group AZ needed

- **One page target per window.** `http://127.0.0.1:9222/json/list` lists them; match on the title
  (`T4 Git UI - <repo>`) and open one WebSocket per target. The title follows the active tab, so read the
  list again after a tab change or an adopted tab.
- **N windows at launch**: write `layout.json` first — `[{"tabs":[…],"active":…}, …]` — with the paths
  exactly as the app writes them (copy the spelling from a file the app wrote: backslashes on Windows). A
  forward-slash path opens, but its `active` tab is not restored.
- **Closing a window** the way its × does: `WM_CLOSE` posted to the top-level HWND (`EnumWindows`, filtered
  by the build's pid and the title). That is what AZ 3 was walked with; a killed process is row 3h, not a close.
- **The log file is buffered**: a killed process loses its tail. Close the window properly before reading
  the `stage_paths` line.
- **The CSP blocks an injected `<style>`** — the tag is there and nothing applies. Try a CSS change through
  the CSSOM (`el.style.display = …`) before rebuilding for it.
- **`:focus-visible` follows CDP key events.** After keys in the grid, a CDP right-click on a row still opens
  the menu with its first item focus-visible — the grid never gave up the keyboard focus. For a pure mouse
  path, start from a fresh launch with no key sent.
- **A tab dragged into another window**: `Input.dispatchMouseEvent` takes coordinates outside the source
  window (the strip captures the pointer). Target = the other window's `screenX/Y` minus this one's, plus
  the point on its strip; press, a dozen `mouseMoved` steps, half a second over the target so the hover
  probe runs, release — all in one CDP session.
- **Icon buttons have no text**: `button[aria-label="Stage"]`. A text match on "Stage" finds **Stage all**
  first, which is disabled while every listed file is conflicted.

### Pulling the network for the app alone

`docs/smoke/fixtures/throttle-proxy.mjs` is a CONNECT proxy: `node throttle-proxy.mjs 8888 [bytesPerSecond]`.
Launch the app with `$env:HTTPS_PROXY = "http://127.0.0.1:8888"` (and `HTTP_PROXY`) set before
`smoke-launch.ps1`. The updater follows those variables, and so does git over https. Stop the proxy and the app is
offline; start it with a rate and a download slows enough to kill it mid-transfer. That is how group AC's
failed-check and failed-install boxes were walked on 2026-09-24, with no admin rights and no firewall rule. With
several windows open, `CDP_TITLE="- <repo>"` picks the one `cdp.mjs` drives.

### Inside Windows Sandbox (a clean machine)

Group BF was walked this way on 2026-09-24. It needs the Store-updated Windows Sandbox, the one that ships
`wsb.exe`: start the built-in one once and the update installs itself in the background. The scripts are in
`docs/smoke/fixtures/sandbox/`, shared into the Sandbox read-only as `C:\t4in`, with a writable `C:\t4out`:

```
wsb start --raw --config "<Configuration><Networking>Enable</Networking><MappedFolders>…</MappedFolders></Configuration>"
wsb connect --id <id>          # opens the window; -r ExistingLogin needs a logged-on session
wsb exec --id <id> -r ExistingLogin -c "powershell -NoProfile -ExecutionPolicy Bypass -File C:\t4in\probe.ps1 -Name before"
wsb exec --id <id> -r ExistingLogin -c "C:\t4in\T4-Git-UI_<ver>_x64-setup.exe /S"
wsb exec --id <id> -r System        -c "powershell … -File C:\t4in\forward.ps1"   # port proxy 9223 → 9222 + firewall
wsb exec --id <id> -r System        -c "powershell … -File C:\t4in\policy.ps1"    # CDP flag via WebView2 policy
wsb exec --id <id> -r ExistingLogin -c "powershell … -File C:\t4in\launch.ps1"
CDP_HOST=$(wsb ip --id <id>):9223 node docs/smoke/cdp.mjs --eval "document.title"
```

- `wsb exec` returns only an exit code, so every script writes its findings to `C:\t4out`. Read them from the host.
- **The environment variable does not work there.** `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`, set in the
  launching PowerShell, never reached WebView2 when the app was started through `wsb exec`. The policy key
  `HKLM\SOFTWARE\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments`, value `t4-git-ui.exe`, did.
- WebView2 serves CDP on `127.0.0.1` only, hence the port proxy. The page's `webSocketDebuggerUrl` comes back
  with the Sandbox's own address, so `cdp.mjs` needs nothing beyond `CDP_HOST`.
- A silent install skips the installer's own pages and SmartScreen. Those still want a hand look.
- Clear the `data-w` marker before tagging the next element. `querySelector('[data-w]')` returns the
  **first** one in the DOM, so an old tag on a grid row makes every later click land on that row.

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
  list` buttons. A toast can cover what you want to click — dismiss first, through its own button
  or by waiting it out. Never `el.remove()` a toast: React still owns the node, and its later
  unmount throws `removeChild` on a node that is gone, which blanks the whole window (seen
  2026-09-13; a reload recovers). The status bar is a `[role="status"]` too — match toasts by
  their text, not by role alone.
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
see. `docs/smoke/fixtures/smoke-dialog.ps1` lists them and clicks a button by label:

```powershell
pwsh -File docs/smoke/fixtures/smoke-dialog.ps1                                      # what is open
pwsh -File docs/smoke/fixtures/smoke-dialog.ps1 -Title "Resolve conflict" -Button Replace
```

Poll for the box rather than assume timing: start a loop that retries the script every half
second for twenty seconds before the Playwright click that opens it (the click may return while
the box is still up, or block until it closes). `WScript.Shell` `AppActivate` + `SendKeys` was not
reliable for this — the keys reported as sent and the box stayed; `BM_CLICK` on the button is.

## Fixture and cleanup

`docs/smoke/fixtures/smoke-fixtures.ps1 -Force` rebuilds `C:\tmp\t4\{bare.git,work,other}`; the app follows the
rebuild through its watcher, but close it first if the rebuild hangs on a locked file. Delete any
`.playwright-mcp/` directory the MCP server leaves in the repo before committing. Steps that pass
are ticked in the two smoke docs; findings go into a dated file under `docs/archive/walks/`.

The Linux-only steps were walked on a WebKitGTK build under WSLg — see the "Not walked" section of
`docs/archive/walks/2026-09-05-full-rewalk.md` for that setup.
