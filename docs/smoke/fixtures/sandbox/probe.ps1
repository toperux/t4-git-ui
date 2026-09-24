# Runs inside the Sandbox; writes what it finds to C:\t4out\<name>.json.
param([string]$Name = "probe")
$wv = @(
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
  "HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
) | ForEach-Object { (Get-ItemProperty $_ -ErrorAction SilentlyContinue).pv } | Where-Object { $_ }
$inst = Join-Path $env:LOCALAPPDATA "T4 Git UI"
$startMenu = Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs" -Recurse -Filter "*T4*" -ErrorAction SilentlyContinue | ForEach-Object FullName
$uninst = Get-ChildItem "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall" -ErrorAction SilentlyContinue |
  ForEach-Object { Get-ItemProperty $_.PSPath } | Where-Object { $_.DisplayName -like "*T4*" } |
  ForEach-Object { @{ name = $_.DisplayName; version = $_.DisplayVersion; key = $_.PSChildName } }
[ordered]@{
  at          = (Get-Date).ToString("o")
  user        = "$env:USERDOMAIN\$env:USERNAME"
  os          = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion").DisplayVersion + " " + [Environment]::OSVersion.Version
  webview2    = @($wv)
  webview2Dir = @(Get-ChildItem "${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application" -Directory -ErrorAction SilentlyContinue | ForEach-Object Name)
  edgeDir     = @(Get-ChildItem "${env:ProgramFiles(x86)}\Microsoft\Edge\Application" -Directory -ErrorAction SilentlyContinue | ForEach-Object Name)
  git         = (Get-Command git -ErrorAction SilentlyContinue).Source
  installDir  = (Test-Path $inst)
  installFiles = @(Get-ChildItem $inst -ErrorAction SilentlyContinue | ForEach-Object Name)
  startMenu   = @($startMenu)
  uninstallKeys = @($uninst)
  appData     = (Test-Path "$env:APPDATA\dev.topher.t4gitui")
  running     = @(Get-Process t4-git-ui -ErrorAction SilentlyContinue | ForEach-Object Id)
} | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 "C:\t4out\$Name.json"
