# Runs inside the Sandbox as System: WebView2's own policy for extra browser arguments, keyed by exe name.
$k = "HKLM:\SOFTWARE\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments"
New-Item -Path $k -Force | Out-Null
New-ItemProperty -Path $k -Name "t4-git-ui.exe" -Value "--remote-debugging-port=9222" -PropertyType String -Force | Out-Null
Stop-Process -Name t4-git-ui -Force -ErrorAction SilentlyContinue
