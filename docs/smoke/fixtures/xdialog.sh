#!/usr/bin/env bash
# Answers the app's native GTK dialogs under Xvfb, the Linux counterpart of smoke-dialog.ps1
# (see docs/smoke/smoke-linux.md). Taken from the sibling app's drive-app skill.
#   xdialog.sh <pid> --dump                          list the app's visible windows and titles
#   xdialog.sh <pid> --title <regex> <path>          folder picker: type the path, pick it
#   xdialog.sh <pid> --title <regex> --ok|--cancel   ask() box: Return or Escape
# Titles are the app's own ("Open repository", "Clone into folder", the ask() title), so --dump
# first when unsure. Keys go through XTEST to the focused window: `xdotool key --window` sends
# synthetic events, which GTK ignores. No window manager, so focus, not activate.
set -euo pipefail
# Not $DISPLAY: the desktop session always sets that, to its own display.
export DISPLAY="${XDISPLAY:-:99}"
pid=${1:-}
if [[ ${2:-} == --dump ]]; then
  wins=$(xdotool search --onlyvisible --pid "$pid" 2>/dev/null || true)
  for w in $wins; do echo "$w $(xdotool getwindowname "$w")"; done
  exit
fi
[[ -n $pid && ${2:-} == --title && -n ${4:-} ]] || { echo "usage: xdialog.sh <pid> --dump | --title <regex> <path>|--ok|--cancel"; exit 2; }
title=$3 what=$4
# --all: xdotool ORs its conditions otherwise.
find_dialog() {
  xdotool search --all --onlyvisible --pid "$pid" --name "$title" 2>/dev/null | head -1 | grep .
}
# The box maps a moment after the click that opens it, and a first call made right after that
# click found nothing: up to 5 s for it to show up.
dlg=
for _ in $(seq 10); do
  dlg=$(find_dialog || true)
  [[ -n $dlg ]] && break
  sleep 0.5
done
[[ -n $dlg ]] || { echo "no dialog matching '$title' open for pid $pid after 5 s"; exit 1; }
xdotool windowfocus --sync "$dlg"
case $what in
  --cancel) xdotool key Escape ;;
  --ok) xdotool key Return ;;
  *)
    # Ctrl+L opens the location box; typing a path then Return picks it.
    xdotool key ctrl+l
    xdotool type --delay 5 "$what"
    xdotool key Return
    ;;
esac
# GTK takes a moment to unmap it.
for _ in 1 2 3 4 5 6; do
  sleep 0.5
  find_dialog >/dev/null || { echo "dialog closed"; exit; }
done
echo "dialog still open"
