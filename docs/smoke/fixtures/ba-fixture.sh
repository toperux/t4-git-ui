#!/bin/sh
# Group BA fixture: c:/tmp/t4/ba (+ ba-origin.git, ba-wt). Throwaway.
set -e
R=/c/tmp/t4
rm -rf "$R/ba" "$R/ba-origin.git" "$R/ba-wt"
git init -q --bare "$R/ba-origin.git"
git init -q -b main "$R/ba"
g() { git -C "$R/ba" "$@"; }
g config user.name smoke; g config user.email smoke@example.invalid
for i in 1 2 3 4; do echo "$i" > "$R/ba/f.txt"; g add f.txt; g commit -q -m "ba commit $i"; done
g remote add origin "$R/ba-origin.git"
# origin/x at commit 2, local x at commit 4 (elsewhere)
g branch x HEAD~2
g push -q -u origin x
g branch -f x HEAD
g branch reset-me HEAD          # at commit 4
g branch topic HEAD~1           # at commit 3
g branch wt-branch HEAD~3       # at commit 1, checked out in a linked worktree
g worktree add -q "$R/ba-wt" wt-branch
# origin/wt-branch at commit 2, tracked: a reset-to-remote the linked worktree rules out (9)
g push -q origin HEAD~2:refs/heads/wt-branch
g branch -q -u origin/wt-branch wt-branch
g checkout -q -b feature HEAD   # HEAD = feature at commit 4
g log --oneline --decorate --all
g worktree list
