#!/bin/sh
# Group BQ fixture: $T4_ROOT/bq (+ bq-origin.git, the bq-held worktree). Throwaway; T4_ROOT defaults to /c/tmp/t4.
# Each case's local branches (one, or several for multi and trio) track its own origin branch from elsewhere. Each
# case is on its own file so switching between them never conflicts, except dirty, which edits shared.txt on purpose.
set -e
R=${T4_ROOT:-/c/tmp/t4}
rm -rf "$R/bq" "$R/bq-origin.git" "$R/bq-held"
git init -q --bare -b main "$R/bq-origin.git"
git init -q -b main "$R/bq"
g() { git -C "$R/bq" "$@"; }
g config user.name smoke; g config user.email smoke@example.invalid
g config core.autocrlf false
echo base > "$R/bq/shared.txt"; g add shared.txt; g commit -q -m base
g remote add origin "$R/bq-origin.git"
g push -q origin main

# mk <case> <n> <tag>: n commits on <case>.txt from the current HEAD.
mk() { i=1; while [ $i -le "$2" ]; do echo "$1 $3 $i" >> "$R/bq/$1.txt"; g add "$1.txt"; g commit -q -m "$1 $3 $i"; i=$((i + 1)); done; }
start() { g checkout -q --detach main; }

# behind: origin 2 ahead of the local branch, nothing local of its own → a fast-forward.
start; mk behind 1 common; L=$(g rev-parse HEAD); mk behind 2 remote
g push -q origin HEAD:refs/heads/behind; g branch -q behind "$L"
# ahead: the local branch 2 ahead of origin.
start; mk ahead 1 common; g push -q origin HEAD:refs/heads/ahead; mk ahead 2 local; g branch -q ahead HEAD
# diverged: 2 local-only commits, 3 origin-only.
start; mk diverged 1 common; C=$(g rev-parse HEAD); mk diverged 3 remote
g push -q origin HEAD:refs/heads/diverged; g checkout -q --detach "$C"; mk diverged 2 local; g branch -q diverged HEAD
# held: behind by 1, and checked out in a linked worktree.
start; mk held 1 common; L=$(g rev-parse HEAD); mk held 1 remote
g push -q origin HEAD:refs/heads/held; g branch -q held "$L"
# multi: two local branches tracking origin/multi — multi-a 1 behind, multi-b diverged 1 local / 2 origin.
start; mk multi 1 common; C=$(g rev-parse HEAD); mk multi 1 remote; A=$(g rev-parse HEAD); mk multi 1 remote2
g push -q origin HEAD:refs/heads/multi; g branch -q multi-a "$A"
g checkout -q --detach "$C"; mk multi 1 local; g branch -q multi-b HEAD
# dirty: origin/dirty changes shared.txt; the local branch sits on main (1 behind). The walk dirties
# shared.txt before checking it out, so `git checkout -B` refuses.
start; echo remote > "$R/bq/shared.txt"; g commit -q -am "dirty remote"
g push -q origin HEAD:refs/heads/dirty; g branch -q dirty main
# racer: 1 behind origin/racer. The tag racer-next is a commit of its own the walk moves it to while the menu
# is open, so the move is either refused (a click before the watcher refreshes) or re-asked (after).
start; mk racer 1 common; L=$(g rev-parse HEAD); mk racer 1 remote
g push -q origin HEAD:refs/heads/racer; g branch -q racer "$L"
g checkout -q --detach "$L"; mk racer 1 elsewhere; g tag racer-next HEAD
# trio: three local branches tracking origin/trio — the walk checks out trio, so the other two read
# "other local". trio 1 behind, trio-b 2 behind, trio-c diverged 1 local / 2 origin.
start; mk trio 1 common; C=$(g rev-parse HEAD); mk trio 1 remote; B=$(g rev-parse HEAD); mk trio 1 remote2
g push -q origin HEAD:refs/heads/trio; g branch -q trio "$B"; g branch -q trio-b "$C"
g checkout -q --detach "$C"; mk trio 1 local; g branch -q trio-c HEAD

g checkout -q main
for b in behind ahead diverged held dirty racer trio; do g branch -q -u "origin/$b" "$b"; done
g branch -q -u origin/multi multi-a
g branch -q -u origin/multi multi-b
g branch -q -u origin/trio trio-b
g branch -q -u origin/trio trio-c
g worktree add -q "$R/bq-held" held
g log --oneline --graph --decorate --all
g branch -vv
