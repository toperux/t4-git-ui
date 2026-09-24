# Answers the app's native dialogs (Tauri `ask()` / `message()`) from a script, for the CDP-driven
# smoke walks: CDP drives the page but not a Win32 dialog. Lists them, or presses a button by its
# label through UI Automation.
#
# On Windows `ask()` is a task dialog: its buttons are drawn inside one surface, not `Button` child
# windows, so `BM_CLICK` finds nothing, and `SendKeys {ENTER}` can only press the default button. UI
# Automation sees them by name, and a classic message box's buttons as well.
#
#   pwsh -File docs/smoke/fixtures/smoke-dialog.ps1                                   # list open dialogs
#   pwsh -File docs/smoke/fixtures/smoke-dialog.ps1 -Title "Install the update"      # its text and buttons
#   pwsh -File docs/smoke/fixtures/smoke-dialog.ps1 -Title "Resolve conflict" -Button Replace
#
# With -Title it waits up to -WaitSeconds for the box, so it can be started right after the click that
# opens it, and it reports whether the box went away after the press.
param([string]$Title = "", [string]$Button = "", [int]$WaitSeconds = 10)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]

$proc = Get-Process t4-git-ui -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) { "t4-git-ui is not running"; exit 1 }

# Both kinds of box are class #32770, and only this app's count: a same-titled box from another
# program must not be pressed. An owned box can sit under its owner in the UI Automation tree, so
# the search is not limited to top-level windows.
$boxes = New-Object System.Windows.Automation.AndCondition(
  (New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, $proc.Id)),
  (New-Object System.Windows.Automation.PropertyCondition($A::ClassNameProperty, "#32770")))
function Dialogs { @($A::RootElement.FindAll($Scope::Descendants, $boxes)) }
function Find { Dialogs | Where-Object { $_.Current.Name -like "$Title*" } | Select-Object -First 1 }
function Describe($d) {
  $names = @($d.FindAll($Scope::Descendants, [System.Windows.Automation.Condition]::TrueCondition) |
      ForEach-Object { $_.Current.Name } | Where-Object { $_ })
  "$($d.Current.Name) || $($names -join ' | ')"
}

if (-not $Title) {
  $all = Dialogs
  if ($all.Count -eq 0) { "no dialogs" } else { $all | ForEach-Object { Describe $_ } }
  exit 0
}

$deadline = (Get-Date).AddSeconds($WaitSeconds)
while (-not ($dlg = Find) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
if (-not $dlg) { "no dialog titled $Title after $WaitSeconds s"; exit 1 }
if (-not $Button) { Describe $dlg; exit 0 }

# By name, whatever the control type. A task dialog's button is a `CCPushButton` window — not class
# `Button`, and to UI Automation a Pane with no patterns at all — so it is pressed with BM_CLICK on its
# own handle. An element that can only be invoked (no window of its own) is invoked.
$btn = @($dlg.FindAll($Scope::Descendants, (New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, $Button)))) |
  Where-Object { $_.Current.NativeWindowHandle -ne 0 -or $_.GetSupportedPatterns() -contains [System.Windows.Automation.InvokePattern]::Pattern } |
  Select-Object -First 1
if (-not $btn) { "no button '$Button' on: " + (Describe $dlg); exit 1 }
if ($btn.Current.NativeWindowHandle -ne 0) {
  Add-Type -Namespace SmokeDlg -Name User32 -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);'
  [void][SmokeDlg.User32]::SendMessage([IntPtr]$btn.Current.NativeWindowHandle, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) # BM_CLICK
} else {
  $btn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
}

$deadline = (Get-Date).AddSeconds(3)
while ((Find) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }
"pressed $Button; dialog still up: $([bool](Find))"
