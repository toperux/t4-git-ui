#!/usr/bin/env bash
# AD 7 fixture: two SIMULTANEOUSLY conflicted files in the `work` smoke repo.
#
# `git merge conflict` only ever yields one conflicted file, so AD 7 (a selection
# with nothing stageable) is unreachable on the stock fixture. This builds a pair
# of throwaway branches that both touch the same two files, so merging them
# conflicts on both at once -- without touching main, conflict, reset-me, the
# tags or the mirror remote that other walk groups depend on.
#
# Leaves: tc-a mid-merge with hunks.txt + nonl.txt conflicted, and crlf.txt
# dirty-but-clean-merging as a CONTROL row (proves the refusal is about the
# selection, not the whole list).
#
# Undo with docs/ad7-teardown.sh. Everything it creates is deleted there.
#
# Unlike docs/irebase-fixture.sh this does NOT set a repo-local identity: it
# commits into `work`, which smoke-fixtures.ps1 already built with one. If those
# commits ever fail asking for user.email, that is why -- set it on the repo, not
# globally.
set -euo pipefail

R="C:/tmp/t4/work"
g() { git -C "$R" "$@"; }
say() { printf '\n== %s\n' "$1"; }
resting() { [ "$(g status --porcelain | wc -l)" -eq 1 ] && g status --porcelain | grep -q '^A  decoy\.txt$'; }

say "guard: expected resting state (reset-me, only 'A decoy.txt')"
branch=$(g rev-parse --abbrev-ref HEAD)
[ "$branch" = "reset-me" ] || { echo "FAIL: on '$branch', expected reset-me"; exit 1; }
if g rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then echo "FAIL: a merge is already in progress"; exit 1; fi
if ! resting; then echo "FAIL: tree is not the resting fixture:"; g status --short; exit 1; fi
for b in tc-a tc-b; do
  if g rev-parse -q --verify "$b" >/dev/null 2>&1; then echo "FAIL: branch $b already exists -- run teardown first"; exit 1; fi
done

say "guard: the files we need exist on main"
for f in hunks.txt nonl.txt crlf.txt; do
  g cat-file -e "main:$f" 2>/dev/null || { echo "FAIL: main:$f missing"; exit 1; }
done

say "unstage decoy.txt (a staged ADD refuses the merge -- index/HEAD divergence,"
say "not a tree difference. The file itself stays put.)"
g restore --staged decoy.txt

say "build tc-a off main"
g checkout -q -B tc-a main
printf 'tc-a side\n' >> "$R/hunks.txt"
printf 'tc-a side\n' >> "$R/nonl.txt"
g commit -q -am "tc-a: touch both files"

say "build tc-b off the SAME base, changing the SAME two files differently"
g checkout -q -B tc-b main
printf 'tc-b side\n' >> "$R/hunks.txt"
printf 'tc-b side\n' >> "$R/nonl.txt"
g commit -q -am "tc-b: touch both files differently"

say "merge -- expected to fail"
g checkout -q tc-a
if g merge tc-b; then echo "FAIL: merge succeeded; no conflicts produced"; exit 1; fi

say "verify from git, not from the panel"
unmerged=$(g ls-files -u | awk '{print $4}' | sort -u)
count=$(printf '%s\n' "$unmerged" | grep -c . || true)
printf '%s\n' "$unmerged"
[ "$count" -ge 2 ] || { echo "FAIL: need 2+ conflicted paths, got $count"; exit 1; }

say "control row: dirty but NOT conflicted"
printf 'control edit\n' >> "$R/crlf.txt"

say "final state"
g status --short
cat <<'NOTE'

Ready. The Unstaged list should show 2 conflicted files + crlf.txt modified.

Walk:
  1. Ctrl-select ONLY the two conflicted -> `Stage selected` must be DISABLED.
  2. Add crlf.txt to the selection    -> enabled, "(2 skipped)", stages ONLY crlf.txt.
  3. Check the index, never the tooltip:
       git -C C:/tmp/t4/work diff --cached --name-only
       git -C C:/tmp/t4/work ls-files -u      # the 2 must still show 3 stages each

Teardown: bash docs/ad7-teardown.sh
NOTE
