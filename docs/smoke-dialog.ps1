# Answers the app's native message boxes (Tauri `ask()` / `message()`) from a script, for the
# CDP-driven smoke walks: CDP can drive the page but not a Win32 dialog. Lists them, or clicks a
# button by its label with BM_CLICK. Sending keys with WScript.Shell is unreliable here — the dialog
# is up while the page's click is still being dispatched — so click the button directly.
#
#   pwsh -File docs/smoke-dialog.ps1                                  # list open dialogs
#   pwsh -File docs/smoke-dialog.ps1 -Title "Resolve conflict" -Button Replace
param([string]$Title = "", [string]$Button = "")
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;
public class SmokeDlg {
  public delegate bool CB(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(CB cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, CB cb, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  static string Txt(IntPtr h) { var t = new StringBuilder(1024); GetWindowText(h, t, 1024); return t.ToString(); }
  static string Cls(IntPtr h) { var c = new StringBuilder(256); GetClassName(h, c, 256); return c.ToString(); }
  // Top-level #32770 (dialog-class) windows owned by the process.
  public static List<IntPtr> Dialogs(uint pid) { var o = new List<IntPtr>(); EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && Cls(h) == "#32770") o.Add(h); return true; }, IntPtr.Zero); return o; }
  public static string Title(IntPtr h) { return Txt(h); }
  public static string Describe(IntPtr h) { var parts = new List<string>(); EnumChildWindows(h, (c, l) => { var t = Txt(c); if (t.Length > 0) parts.Add(Cls(c) + ":" + t); return true; }, IntPtr.Zero); return Txt(h) + " || " + string.Join(" | ", parts); }
  public static IntPtr Button(IntPtr dlg, string text) { IntPtr o = IntPtr.Zero; EnumChildWindows(dlg, (c, l) => { if (Cls(c) == "Button" && Txt(c) == text) { o = c; return false; } return true; }, IntPtr.Zero); return o; }
  public static void Click(IntPtr b) { SendMessage(b, 0x00F5, IntPtr.Zero, IntPtr.Zero); } // BM_CLICK
}
'@
$proc = Get-Process t4-git-ui -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) { "t4-git-ui is not running"; exit 1 }
$dialogs = [SmokeDlg]::Dialogs($proc.Id)
if (-not $Title) {
  if ($dialogs.Count -eq 0) { "no dialogs" } else { $dialogs | ForEach-Object { [SmokeDlg]::Describe($_) } }
  exit 0
}
$dlg = $dialogs | Where-Object { [SmokeDlg]::Title($_) -like "$Title*" } | Select-Object -First 1
if (-not $dlg) { "no dialog titled $Title"; exit 1 }
$btn = [SmokeDlg]::Button($dlg, $Button)
if ($btn -eq [IntPtr]::Zero) { "no button '$Button' on: " + [SmokeDlg]::Describe($dlg); exit 1 }
[SmokeDlg]::Click($btn)
Start-Sleep -Milliseconds 700
$left = ([SmokeDlg]::Dialogs($proc.Id) | Where-Object { [SmokeDlg]::Title($_) -like "$Title*" }).Count
"clicked $Button; dialog still up: $($left -gt 0)"
