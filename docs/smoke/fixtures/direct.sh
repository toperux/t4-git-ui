# Helpers for driving the app on Linux without WebDriver: multi-window rows, and the restore-hang loop. See
# docs/smoke/smoke-linux.md › Several windows. Source it from the repo root, with Xvfb already up:
#
#   S=<scratchpad>/app; . docs/smoke/fixtures/direct.sh
#   seed '[{"tabs":["/tmp/t4/work"],"active":"/tmp/t4/work"},{"tabs":["/tmp/t4/other"],"active":"/tmp/t4/other"}]'
#   dlaunch; waitfor 'T4 Git UI - work' 'T4 Git UI - other' || echo hung
#   xclosetitle 'T4 Git UI - other'; lay; killapp
#
#   for i in $(seq 20); do seed '…'; dlaunch
#     waitfor 'T4 Git UI - work' 'T4 Git UI - other' || running; lay; killapp; done
#
# S must be set: HOME=$S/home is where the app keeps its store, so nothing touches yours. APP, XDISPLAY and ID
# default to the smoke build (`--config '{"identifier":"dev.topher.t4gitui.smoke"}'`), :99 and its identifier.

: "${S:?set S to a scratch directory first}"
# Kept under a name of its own: `S=… . direct.sh` (no `;`) would unset S once the source is done.
DIRECT_S=$S
APP=${APP:-$PWD/target/debug/t4-git-ui}
XDISPLAY=${XDISPLAY:-:99}
ID=${ID:-dev.topher.t4gitui.smoke}
L=$S/home/.local/share/$ID/layout.json
mkdir -p "$S/home"
[ -f "$S/home/.gitconfig" ] || cp ~/.gitconfig "$S/home/" 2>/dev/null || true

ts() { date +%T.%N | cut -c1-12; }
x() { DISPLAY=$XDISPLAY "$@"; }
# Exact full path: an installed /usr/bin/t4-git-ui (or an AppImage) is never matched, so never killed.
pidof_app() { pgrep -o -fx "$APP"; }   # -o: one pid, and pgrep's own exit status (no pipe to hide it)

# seed '<json>' — write layout.json while the app is down; `main` is the first entry. Also removes a stale
# layout.restoring mark, which would otherwise trip the crash breaker on the next launch.
seed() { mkdir -p "$(dirname "$L")"; printf '%s' "$1" > "$L"; rm -f "$(dirname "$L")/layout.restoring"; }
lay() { echo "$(ts) layout: $(cat "$L" 2>/dev/null || echo '(none)')"; }

# dlaunch [seconds] — start the app detached on the Xvfb display, then wait.
# No askpass on the invisible display: ssh and git fail at once instead (smoke-linux.md §2).
dlaunch() { (HOME=$DIRECT_S/home DISPLAY=$XDISPLAY GDK_BACKEND=x11 SSH_ASKPASS_REQUIRE=never GIT_ASKPASS= \
  setsid "$APP" >>"$DIRECT_S/direct.log" 2>&1 &); sleep "${1:-1}"; }
# SIGKILL, then wait until it's gone, and until the bus has dropped its single-instance name (50-100 ms after the
# pid): a launch before that hands its argv to the dead instance and exits.
killapp() {
  pkill -9 -fx "$APP"
  local i; for i in $(seq 20); do pidof_app >/dev/null || break; sleep 0.25; done
  pidof_app >/dev/null && { echo "$(ts) app still running after 5 s"; return 1; }
  # No reachable user bus (or no busctl): a fixed pause, not measured.
  busctl --user list >/dev/null 2>&1 || { sleep 1; return 0; }
  for i in $(seq 40); do busctl --user status "$ID.SingleInstance" >/dev/null 2>&1 || return 0; sleep 0.05; done
  echo "$(ts) $ID.SingleInstance still on the bus after 2 s"; return 1
}
running() { pidof_app >/dev/null && echo "$(ts) app running" || echo "$(ts) app exited"; }

# wins — every visible window of the app, with its title (`T4 Git UI - <repo>`, or `T4 Git UI` with none open).
wins() {
  local p; p=$(pidof_app)
  [ -n "$p" ] || { echo "$(ts) (no app)"; return; }
  for w in $(x xdotool search --onlyvisible --pid "$p" 2>/dev/null); do
    echo "$(ts) $w $(x xdotool getwindowname "$w")"
  done
}

# waitfor '<title>'... — until every exact title shows (30 s cap). Fails on a timeout, listing what is up.
waitfor() {
  local t i
  for i in $(seq 60); do
    sleep 0.5
    for t in "$@"; do
      x xdotool search --all --onlyvisible --pid "$(pidof_app)" --name "^$t\$" >/dev/null 2>&1 || continue 2
    done
    echo "$(ts) up after ~$((i / 2)) s"; return 0
  done
  echo "$(ts) TIMEOUT (30 s) waiting for: $*"; wins; return 1
}

# xclosetitle '<exact title>' — close that window as its title-bar × would (WM_DELETE_WINDOW, xclose.py).
xclosetitle() {
  local id; id=$(x xdotool search --all --onlyvisible --pid "$(pidof_app)" --name "^$1\$" | head -1)
  [ -n "$id" ] || { echo "$(ts) no window titled '$1'"; return 1; }
  x python3 "$(dirname "${BASH_SOURCE[0]}")/xclose.py" "$id" >/dev/null && echo "$(ts) closed '$1'"
}
