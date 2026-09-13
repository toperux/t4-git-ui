#!/usr/bin/env bash
# Undo everything the AD 7 / AE walk did to `work`. Puts it back to exactly
# `A decoy.txt` on reset-me, with no refs/remotes/slow.
#
# Safe to run twice, and safe to run from a half-finished setup.
#
# Covers more than ad7-setup.sh created, because the AE walk added two things:
#   * crlf-hunks.txt was deleted (to get a ' D' row for the context-menu check)
#   * `git fetch slow` created refs/remotes/slow/* -- the repo had NONE at session
#     start (only refs/remotes/origin/*), so they are ours to remove
#
# NOTE the last assertion expects group P's `nowhere` remote to still be
# configured, byte-exact. That is true of the `work` this was written against, but
# a fixture rebuilt by smoke-fixtures.ps1 since then may not have it -- in which
# case this exits 1 having already restored everything else. Drop that one line
# rather than concluding the teardown failed.
set -euo pipefail

R="C:/tmp/t4/work"
g() { git -C "$R" "$@"; }

echo "== abort the merge (no-op if none)"
g merge --abort 2>/dev/null || true

echo "== restore every file the walk touched"
# crlf.txt (dirtied as the control, then staged), hunks.txt + nonl.txt (conflicted),
# crlf-hunks.txt (deleted for the context-menu check).
g checkout -q -- crlf.txt hunks.txt nonl.txt crlf-hunks.txt 2>/dev/null || true

echo "== back to reset-me and drop the throwaway branches"
g checkout -q reset-me
g branch -D tc-a tc-b 2>/dev/null || true

echo "== drop refs/remotes/slow/* (created by the fetch used to hold 'running' open)"
slow_refs=$(g for-each-ref --format='%(refname)' refs/remotes/slow || true)
if [ -n "$slow_refs" ]; then
  printf '%s\n' "$slow_refs" | while read -r ref; do
    [ -n "$ref" ] && g update-ref -d "$ref"
  done
fi

echo "== decoy.txt goes back to being a staged add"
g add decoy.txt

echo
echo "== final state"
g status --short
echo "branch: $(g rev-parse --abbrev-ref HEAD)"
echo "refs/remotes/slow count: $(g for-each-ref refs/remotes/slow | wc -l)"
echo "remotes: $(g remote | tr '\n' ' ')"
echo "nowhere.url: $(g config --get remote.nowhere.url || echo '(MISSING -- restore it)')"

ok=1
[ "$(g rev-parse --abbrev-ref HEAD)" = "reset-me" ] || { echo "FAIL: wrong branch"; ok=0; }
[ "$(g status --porcelain | wc -l)" -eq 1 ] || { echo "FAIL: tree is not just 'A decoy.txt'"; ok=0; }
g status --porcelain | grep -q '^A  decoy\.txt$' || { echo "FAIL: decoy.txt is not a staged add"; ok=0; }
[ "$(g for-each-ref refs/remotes/slow | wc -l)" -eq 0 ] || { echo "FAIL: refs/remotes/slow left behind"; ok=0; }
[ "$(g config --get remote.nowhere.url)" = 'C:\tmp\t4\does-not-exist' ] || { echo "FAIL: nowhere.url not byte-exact"; ok=0; }
if g rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then echo "FAIL: still mid-merge"; ok=0; fi

[ "$ok" -eq 1 ] && echo "OK: fixture fully restored." || { echo "NOT restored -- inspect before walking anything else."; exit 1; }
