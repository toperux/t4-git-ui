#!/usr/bin/env bash
# Builds the linked-checkouts fixture for groups AO (worktrees) and AP (submodules):
# T4_ROOT defaults to /c/tmp/t4.
#
#   $T4_ROOT/linked           the main worktree, branch main; branches feature / topic / spare
#   $T4_ROOT/linked-wt/
#     feature                 worktree on `feature`, left dirty (Remove is refused until forced)
#     newbr                   worktree created with `-b newbr`
#     locked                  worktree on `topic`, locked with the reason "keep for the walk"
#     gone                    worktree on `spare` whose directory was then deleted (prunable)
#   $T4_ROOT/linked-src       the repository both submodules clone from (two commits)
#   linked/sub                submodule, pointer moved back one commit and a dirty file inside
#   linked/sub2               submodule registered but not initialized (deinit'd)
#
# Its own repository rather than `work`: a branch checked out in a worktree can no longer be
# checked out in `work`, which the other groups rely on. Identity is repo-local; nothing here
# touches ~/.gitconfig.
#
# The submodules clone from a local path, which git >= 2.38.1 refuses (`transport 'file' not
# allowed`) unless `-c protocol.file.allow=always` is on the command line -- the clone runs in a
# child that reads neither the superproject's config nor its own, so the app's Update could not
# clone one either. That is why sub2 is cloned here and then `deinit`'d: its `.git/modules/sub2`
# stays, so the app's Update only has to check it out again. Real submodules use https / ssh.
# Destructive: wipes the four directories first. Close the app before running.
set -euo pipefail

T=${T4_ROOT:-/c/tmp/t4}
L=$T/linked
W=$T/linked-wt
S=$T/linked-src

rm -rf "$L" "$W" "$S"
mkdir -p "$L" "$W" "$S"

ident() { git -C "$1" config user.name "Christopher Montevirgen"; git -C "$1" config user.email "topher.m@gmail.com"; }

# the submodule source
git -C "$S" init -q -b main
ident "$S"
printf 'one\n' > "$S/s.txt"
git -C "$S" add -A && git -C "$S" commit -q -m "sub one"
SUB_FIRST=$(git -C "$S" rev-parse HEAD)
printf 'one\ntwo\n' > "$S/s.txt"
git -C "$S" add -A && git -C "$S" commit -q -m "sub two"

# the main repository
git -C "$L" init -q -b main
ident "$L"
printf 'base\n' > "$L/a.txt"
git -C "$L" add -A && git -C "$L" commit -q -m "base"
git -C "$L" branch feature
git -C "$L" branch topic
git -C "$L" branch spare
printf 'main\n' > "$L/b.txt"
git -C "$L" add -A && git -C "$L" commit -q -m "main edit"

# two submodules from the same source
git -C "$L" -c protocol.file.allow=always submodule add -q "$S" sub
git -C "$L" -c protocol.file.allow=always submodule add -q "$S" sub2
git -C "$L" commit -q -m "add submodules"
# sub: pointer moved back one commit, plus a dirty file inside the checkout
git -C "$L/sub" checkout -q "$SUB_FIRST"
printf 'dirty\n' > "$L/sub/dirty.txt"
# sub2: registered in .gitmodules, checkout removed (its module dir stays, see above)
git -C "$L" submodule deinit -q -f sub2

# the worktrees
git -C "$L" worktree add -q "$W/feature" feature
printf 'edited in the worktree\n' >> "$W/feature/a.txt"
git -C "$L" worktree add -q -b newbr "$W/newbr"
git -C "$L" worktree add -q "$W/locked" topic
git -C "$L" worktree lock --reason "keep for the walk" "$W/locked"
git -C "$L" worktree add -q "$W/gone" spare
rm -rf "$W/gone"

echo "--- worktrees:"
git -C "$L" worktree list
echo "--- submodules:"
git -C "$L" submodule status
echo "--- status:"
git -C "$L" status --short
