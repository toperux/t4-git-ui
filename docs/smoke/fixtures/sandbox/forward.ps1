# Runs inside the Sandbox as System: WebView2 serves CDP on 127.0.0.1 only, so expose it on 9223.
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=9223 connectaddress=127.0.0.1 connectport=9222 | Out-Null
New-NetFirewallRule -DisplayName "t4 cdp" -Direction Inbound -Protocol TCP -LocalPort 9223 -Action Allow | Out-Null
netsh interface portproxy show v4tov4 | Set-Content C:\t4out\forward.txt
