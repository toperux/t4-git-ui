#!/usr/bin/env bash
# Rebuilds the interactive-rebase fixture in the shape group Z's preamble describes:
#
#   base - add a - add b - [side: add s1] merged - fixup! add b - add d (branch mid) - add e
#
# plus a branch `other` off `add a` whose `other d` conflicts with `add d`, `a.txt` edited in the
# working tree and `dirty.txt` staged. Nothing here touches ~/.gitconfig: identity is repo-local.
#
# The 2026-09-07 walk rewrote this fixture in place (it left `add e (reworded)` and
# `e and s1 together` behind), so re-run this before any group Z / AF walk. Destructive: it wipes
# the directory first. Close the app before running -- it holds handles on an open repo.
set -euo pipefail

F=/c/tmp/t4/irebase

rm -rf "$F"
mkdir -p "$F"
git -C "$F" init -q -b main
git -C "$F" config user.name "Christopher Montevirgen"
git -C "$F" config user.email "topher.m@gmail.com"

c() { git -C "$F" add -A && git -C "$F" commit -q -m "$1"; }

printf 'base\n' > "$F/base.txt"
c "base"

printf 'a\n' > "$F/a.txt"
c "add a"
A=$(git -C "$F" rev-parse HEAD)

printf 'b\n' > "$F/b.txt"
c "add b"

# side branches off `add b` and is merged back, so the todo has a real merge row under --rebase-merges
git -C "$F" checkout -q -b side
printf 's1\n' > "$F/s1.txt"
c "add s1"
git -C "$F" checkout -q main
git -C "$F" merge -q --no-ff side -m "merge side"

# autosquash marks this one `fixup` under `add b` when the dialog opens
printf 'b fixed\n' >> "$F/b.txt"
c "fixup! add b"

printf 'd from main\n' > "$F/d.txt"
c "add d"
git -C "$F" branch mid

printf 'e\n' > "$F/e.txt"
c "add e"

# `other` forks at `add a`; its d.txt is an add/add conflict against main's `add d`
git -C "$F" checkout -q -b other "$A"
printf 'd from other\n' > "$F/d.txt"
c "other d"
git -C "$F" checkout -q main

# the resting dirty state: one unstaged edit, one staged add
printf 'a edited\n' >> "$F/a.txt"
printf 'dirty\n' > "$F/dirty.txt"
git -C "$F" add dirty.txt

echo "--- log:"
git -C "$F" log --graph --oneline --all
echo "--- branches:"
git -C "$F" branch -v
echo "--- status:"
git -C "$F" status --short
