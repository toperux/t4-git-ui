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
#   pwsh -File docs/smoke/fixtures/smoke-launch.ps1 -Proxy http://127.0.0.1:8888   # behind throttle-proxy.mjs
#
# Run it with pwsh -File, not & from an interactive shell: it sets WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS,
# WEBVIEW2_USER_DATA_FOLDER, and with -Proxy HTTPS_PROXY and HTTP_PROXY, and those would stay set in the
# calling shell. A leftover HTTPS_PROXY sends a later launch through a dead proxy, silently offline.
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
  # Sets HTTPS_PROXY and HTTP_PROXY for the app (the updater and git over https follow them).
  [string]$Proxy,
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
if ($Proxy) { $env:HTTPS_PROXY = $Proxy; $env:HTTP_PROXY = $Proxy }

$p = Start-Process -FilePath $Exe -PassThru
Start-Sleep -Seconds $WaitSeconds

# The port answering is the real readiness signal; MainWindowTitle can lag it.
$version = try { (Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 5).Content } catch { $null }

# MainWindowTitle can name the single-instance plugin's helper window (dev.topher.t4gitui-siw)
# rather than the app's: the process's top-level windows are read instead, that one skipped.
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$title = @($A::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,
    (New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, $p.Id))) |
  ForEach-Object { $_.Current.Name } |
  Where-Object { $_ -and $_ -ne 'dev.topher.t4gitui-siw' }) | Select-Object -First 1

[pscustomobject]@{
  Pid       = $p.Id
  Exe       = $Exe
  Port      = $Port
  DataDir   = $DataDir
  Title     = $title
  CdpAnswer = if ($version) { 'yes' } else { 'no - give it longer, or check for another instance' }
} | Format-List

# Close with CloseMainWindow() (or the window's x) so recents.json is written:
#   (Get-Process -Id <pid>).CloseMainWindow()
