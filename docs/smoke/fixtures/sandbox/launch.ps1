# Runs inside the Sandbox as the logged-on user (wsb exec -r ExistingLogin): start the installed app.
# CDP comes from policy.ps1's registry key: WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS set here did not reach
# WebView2 when the app was started through `wsb exec` (2026-09-24).
Start-Process (Join-Path $env:LOCALAPPDATA "T4 Git UI\t4-git-ui.exe")
