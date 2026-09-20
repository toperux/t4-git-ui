# Starts t4-git-ui with the Chrome DevTools Protocol open, in its own WebView2 profile.
#
# The isolated profile is the point: WebView2 shares one browser process per user-data folder, so
# a walk that reuses the default profile fights the installed app. With -DataDir the walk cannot touch
# that profile. The store folder (recents.json, layout.json, .window-state.json under %APPDATA%) is NOT
# isolated: every build shares it - back it up first, see docs/smoke/smoke-cdp.md.
#
#   pwsh -File docs/smoke/fixtures/smoke-launch.ps1              # the local release build
#   pwsh -File docs/smoke/fixtures/smoke-launch.ps1 -Installed   # the installed app instead
#   pwsh -File docs/smoke/fixtures/smoke-launch.ps1 -Port 9333
#
# Close every other instance first. A launch whose browser arguments differ from the process
# already running never gets its webview: the new process sits without a window and only
# Stop-Process ends it. See docs/smoke/smoke-cdp.md.
[CmdletBinding()]
param(
  # Use the installed app rather than the local build.
  [switch]$Installed,
  # Explicit path to the exe; overrides -Installed.
  [string]$Exe,
  # WebView2 profile directory. Defaults to a per-port folder under TEMP.
  [string]$DataDir,
  [int]$Port = 9222,
  # Seconds to wait for the window before reporting.
  [int]$WaitSeconds = 4
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path

if (-not $Exe) {
  $Exe = if ($Installed) {
    Join-Path $env:LOCALAPPDATA 'T4 Git UI\t4-git-ui.exe'
  } else {
    Join-Path $repoRoot 'target\release\t4-git-ui.exe'
  }
}
if (-not (Test-Path $Exe)) {
  throw "No executable at $Exe. Build it with ``npx tauri build --no-bundle``, or pass -Installed."
}

if (-not $DataDir) { $DataDir = Join-Path $env:TEMP "t4-smoke-wv2-$Port" }
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$Port"
$env:WEBVIEW2_USER_DATA_FOLDER = $DataDir

$p = Start-Process -FilePath $Exe -PassThru
Start-Sleep -Seconds $WaitSeconds

# The port answering is the real readiness signal; MainWindowTitle can lag it.
$version = try { (Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 5).Content } catch { $null }

[pscustomobject]@{
  Pid       = $p.Id
  Exe       = $Exe
  Port      = $Port
  DataDir   = $DataDir
  Title     = $p.MainWindowTitle
  CdpAnswer = if ($version) { 'yes' } else { 'no - give it longer, or check for another instance' }
} | Format-List

# Close with CloseMainWindow() (or the window's x) so recents.json is written:
#   (Get-Process -Id <pid>).CloseMainWindow()
