# Group BF walk — the published installer on a clean Windows 11 (2026-09-24)

The `open-items.md` §B row "Installer on a clean Windows 11 (no dev tools, no WebView2 preinstalled? — the NSIS
bundle should fetch it)". Walked in **Windows Sandbox** on the host (Windows 11 25H2, 26200). It had been enabled
the same day and updated from the Store to the version with `wsb.exe` (0.8.107.0). Driven from the host
throughout: `wsb exec` for installers and probes, and CDP (`docs/smoke/cdp.mjs` with `CDP_HOST`) for the app's
window. Recipe: `docs/smoke/smoke-cdp.md` › *Inside Windows Sandbox*; scripts: `docs/smoke/fixtures/sandbox/`.

## The machine

The Sandbox image is **Windows 11 24H2 (10.0.26100)**, not the host's 25H2. It had the Edge browser
(153.0.4234.48) but **no WebView2 runtime**: no EdgeUpdate client key for it, and no
`Program Files (x86)\Microsoft\EdgeWebView`. So the question in the row, whether the bundle fetches WebView2, could
actually be tested. No git, no `%LOCALAPPDATA%\T4 Git UI`.

## Results

1. **Before**: as above. Pass.
2. **Install**: `T4-Git-UI_0.10.10_x64-setup.exe` from the v0.10.10 release, SHA-256 `183795929fa3…687e`,
   matching its `.sha256`. `/S` as the logged-on Sandbox user → exit 0 in 47 s. Afterwards WebView2 153.0.4234.48
   is registered and installed; `t4-git-ui.exe` + `uninstall.exe` in `%LOCALAPPDATA%\T4 Git UI`; a Start menu
   shortcut `T4 Git UI.lnk`; the uninstall key `HKCU\…\Uninstall\T4 Git UI`, version 0.10.10. **Pass — the
   installer fetches WebView2 when it is missing.**
3. **Installer pages and SmartScreen**: not seen. A silent install shows neither, and the Sandbox window was never
   clicked by hand. **Open.**
4. **First launch, no git**: **Git not found** — *"T4 Git UI needs git 2.24 or newer. Install it from
   git-scm.com or add it to PATH and retry, or point the app at the git executable."* — with **Retry** and
   **Locate git…**, detail `git executable not found`. Pass.
5. **Install git with the app open, then Retry**: Git for Windows 2.55.0.windows.5 installed silently
   (`/VERYSILENT`, 13 s; `C:\Program Files\Git\cmd\git.exe` present and on the machine `Path`). **Retry** → still
   *Git not found*. **Fail — finding 1.** After closing and restarting the app, the start screen, with footer
   `git 2.55.0.windows.5`.
6. **Clone and browse**: the Clone dialog (`Ctrl+Shift+O`) with the URL typed filled in the folder name
   `t4-git-ui` and the preview
   `git clone --progress --end-of-options https://github.com/toperux/t4-git-ui.git C:\Users\WDAGUtilityAccount\t4-git-ui`.
   **Clone** → the window titled `T4 Git UI - t4-git-ui`, 37 grid rows, status bar `main · origin · Clean`. HEAD
   (`09b68da`) → its one file, `crates/git-core/src/watch.rs +27 −10` → the diff region had 43 rows, all seven
   syntax classes, and 30 intra-line highlight spans. The Files tab listed the revision's whole tree with sizes.
   Pass.
7. **Updates**: Settings › Updates read *"T4 Git UI 0.10.10 is up to date"* on opening (the launch check) and
   again after **Check now**. Pass.
8. **Uninstall**: the window closed, then `uninstall.exe /S` → the install folder, the Start menu entry and the
   uninstall key are gone, and nothing is running. No desktop shortcut before or after. Kept:
   `%APPDATA%\dev.topher.t4gitui` (`layout.json`, `recents.json`, `.window-state.json`) and
   `%LOCALAPPDATA%\dev.topher.t4gitui` (the WebView2 profile), as a silent uninstall leaves the app data. Pass.

## Finding 1 — Retry cannot see a git installed after launch

The runner starts plain `git` (`crates/git-core/src/cli/runner.rs`), which Windows resolves against the
**process's** `PATH`. That is the `PATH` the app was launched with. Installing Git for Windows adds
`C:\Program Files\Git\cmd` to the machine `Path` in the registry, but no running process sees that. So Retry
repeats a lookup that can never succeed, and the screen's own advice ("Install it … and retry") does not work
until the app is restarted. That is the likeliest order for a new user: launch, see the screen, install git, press
Retry. Not fixed. Recorded in `open-items.md` §B with two options: re-read `Path` from the registry before a Retry
on Windows, or say "restart the app" on the screen.

## How it was driven, and what did not work

- `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` set in the PowerShell that `wsb exec` started never reached WebView2:
  its command line had no `--remote-debugging-port`, and nothing listened on 9222. The WebView2 policy key
  `HKLM\SOFTWARE\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments` (`t4-git-ui.exe` =
  `--remote-debugging-port=9222`) did.
- WebView2 listens on `127.0.0.1` only, so `netsh interface portproxy` 0.0.0.0:9223 → 127.0.0.1:9222 plus a
  firewall rule. `wsb ip` gave `172.20.127.128`, and the page's `webSocketDebuggerUrl` came back with that address
  already.
- Three clicks in a row landed on the same grid row. The `data-w` marker from an earlier step was still on it, and
  `querySelector` returns the first match. Clear the marker before tagging the next element (now in
  `smoke-cdp.md`).

## BF 3, by hand the same day

Walked by the user in a fresh Sandbox, with the setup downloaded **inside** it through Edge from the release page, so
the file carried the downloaded-file mark that SmartScreen keys on:

- **Edge warned on the download.**
- Running the setup brought **no SmartScreen prompt**.
- **Per-user only**: no all-users option.
- It **downloaded and installed WebView2**.
- **Run T4 Git UI** is ticked on the last page.
- The first launch showed **Git not found**. It still had the old "… and retry" wording; the "restart" wording
  lands with the next release.
- The interactive uninstall offers **Delete the application data**, which the silent one skips.

The missing SmartScreen prompt is the Sandbox's reading only: a real machine's SmartScreen settings need not match
it. `open-items.md` §B *Windows code signing* carries that.
