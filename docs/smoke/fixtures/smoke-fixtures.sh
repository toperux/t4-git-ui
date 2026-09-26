#!/usr/bin/env bash
# Linux / macOS port of smoke-fixtures.ps1: the repositories docs/smoke/smoke-test.md section 0 needs.
# Portable on purpose (awk rather than GNU sed escapes), so BSD tools on macOS run it too.
# The .ps1 is the source of truth - a change to either is mirrored in the other.
#
#   bash docs/smoke/fixtures/smoke-fixtures.sh                  # into $T4_ROOT, default /tmp/t4
#   bash docs/smoke/fixtures/smoke-fixtures.sh --force          # rebuild it from scratch
#   bash docs/smoke/fixtures/smoke-fixtures.sh ~/t4             # somewhere else
#   bash docs/smoke/fixtures/smoke-fixtures.sh --remotes-only   # add the extra remotes to an older fixture
#
# It makes bare.git (the "remote"), work (the history the walk opens) and other (a second clone),
# plus two extra remotes on work: `nowhere` and `slow` - see the .ps1 for what each part is for.
set -euo pipefail

root=${T4_ROOT:-/tmp/t4} force= remotes_only=
for a in "$@"; do
  case $a in
    --force) force=1 ;;
    --remotes-only) remotes_only=1 ;;
    -*) echo "unknown option $a" >&2; exit 2 ;;
    *) root=$a ;;
  esac
done

die() { echo "$1" >&2; exit 1; }
g() { git -C "$work" "$@"; }
# printf '%s', not echo: these files are byte-exact on purpose.
put() { printf '%s' "$2" > "$work/$1"; }

add_extra_remotes() {
  g remote add nowhere "$root/does-not-exist"
  printf '#!/bin/sh\nsleep 60\nexec git upload-pack "$@"\n' > "$root/slow-upload-pack.sh"
  g remote add slow "$bare"
  g config remote.slow.uploadpack "sh \"$root/slow-upload-pack.sh\""
}

if [[ -n $remotes_only ]]; then
  [[ -d $root/work ]] || die "$root has no fixture to add remotes to - build one first"
elif [[ -e $root ]]; then
  [[ -n $force ]] || die "$root already exists - remove it, name another path, or pass --force"
  echo "replacing $root"
  rm -rf "$root"
fi

mkdir -p "$root"
root=$(cd "$root" && pwd)
work=$root/work
bare=$root/bare.git

if [[ -n $remotes_only ]]; then
  for name in nowhere slow; do g remote remove "$name" 2>/dev/null || true; done
  add_extra_remotes
  echo "added remotes nowhere and slow to $work"
  exit 0
fi

git init -q --bare -b main "$bare"
git init -q -b main "$work"
g config core.autocrlf false
g remote add origin "$bare"
add_extra_remotes

put a.txt $'one\n'
g add . && g commit -qm 'first'

g switch -qc feature
put a.txt $'one\ntwo\n'
g commit -qam 'feature edit'

g switch -q main
put b.txt $'main\n'
g add . && g commit -qm 'main edit'

g tag v0.1.0
g merge -q feature -m 'merge feature'

seq -f 'line %02g' 1 30 > "$work/hunks.txt"
g add . && g commit -qm 'hunks fixture'

seq -f 'line %g' 1 25000 > "$work/big.txt"
g add big.txt && g commit -qm 'big diff (25 000 lines)'
mkdir "$work/many"
for i in $(seq 1 300); do printf 'file %d\n' "$i" > "$work/many/$(printf '%03d' "$i").txt"; done
g add many && g commit -qm 'many files (300)'

g push -q -u origin main

g switch -qc feature-upstream feature
put upstream.txt $'from the upstream branch\n'
g add . && g commit -qm 'upstream branch commit'
g push -q origin feature-upstream

g switch -qc feature-decoy feature
put decoy.txt $'from the same-named branch\n'
g add . && g commit -qm 'decoy branch commit'
g push -q origin feature-decoy:feature

g switch -q main
g branch --delete --force feature-upstream feature-decoy >/dev/null
g branch --set-upstream-to=origin/feature-upstream feature >/dev/null

g switch -qc reset-me
put reset.txt $'one\n'
g add . && g commit -qm 'reset fixture 1'
put reset.txt $'one\ntwo\n'
g commit -qam 'reset fixture 2'
g push -q -u origin reset-me

g switch -qc twin-a main
put twins.txt $'three branches sit here\n'
g add . && g commit -qm 'twins (three branches here)'
g branch twin-b
g push -q origin twin-a:twin-remote

g switch -qc solo main
put solo.txt $'only on the remote\n'
g add . && g commit -qm 'solo (remote only)'
g push -q origin solo

g switch -q main
g branch --delete --force solo >/dev/null

put conflict.txt $'base\n'
g add . && g commit -qm 'conflict base'
g switch -qc conflict
put conflict.txt $'the conflict branch\'s line\n'
g commit -qam 'conflict branch side'
g switch -q main
put conflict.txt $'main\'s line\n'
g commit -qam 'main side of the conflict'

g switch -qc topic/nested
put topic.txt $'a branch in a folder\n'
g add . && g commit -qm 'topic/nested (folder branch)'
g switch -qc feature-nested main
put nested.txt $'a remote branch in a folder\n'
g add . && g commit -qm 'origin/topic/on-origin (remote folder branch)'
g push -q origin feature-nested:topic/on-origin
g switch -q main
g branch --delete --force feature-nested >/dev/null

mkdir -p "$work/examples/exclude/schema" "$work/src/lib"
put examples/exclude/schema/tables.txt $'deep down a chain of single folders\n'
put src/a.txt $'src a\n'
put src/lib/b.txt $'src lib b\n'
put gone.txt $'deleted from the working tree later\n'
seq -f 'crlf %02g' 1 10 | awk '{ printf "%s\r\n", $0 }' > "$work/crlf-hunks.txt"
g add . && g commit -qm 'nested folders'
g push -q origin main

put crlf.txt $'x\r\ny\r\n'
put nonl.txt 'no newline'
printf '\0\1\2binary' > "$work/blob.bin"
g add . && g commit -qm 'odd files'

on_disk=$(wc -c < "$work/crlf.txt")
committed=$(g cat-file -s HEAD:crlf.txt)
[[ $committed -eq $on_disk ]] ||
  die "crlf.txt lost its CRs on the way into the index ($on_disk bytes on disk, $committed committed) - core.autocrlf is overriding us"

# Three hunks: line 02 edited + one added, line 15 re-indented, line 28 deleted.
seq -f 'line %02g' 1 30 | awk '
  $0 == "line 02" { print "line 02 edited"; print "line 02b"; next }
  $0 == "line 15" { print "    line 15"; next }
  $0 == "line 28" { next }
  { print }' > "$work/hunks.txt"
hunks=$(g diff --unified=3 -- hunks.txt | grep -c '^@@' || true)
[[ $hunks -eq 3 ]] || die "hunks.txt came out as $hunks hunks, expected 3 - the edits drifted too close together"

put src/a.txt $'src a edited\n'
put src/lib/b.txt $'src lib b edited\n'
mkdir -p "$work/deep/one/two"
put deep/one/two/z.txt $'untracked, three folders down\n'
rm "$work/gone.txt"
seq -f 'crlf %02g' 1 10 | awk '{ printf "%s\r\n", ($0 == "crlf 05" ? "crlf 05 edited" : $0) }' > "$work/crlf-hunks.txt"

git clone -q "$bare" "$root/other"

echo
echo "ready - open $work in the app"
echo "  work   $(g rev-list --count HEAD) commits, the last one not pushed yet"
echo '         hunks.txt is modified in the working tree, in three hunks'
echo '         feature tracks origin/feature-upstream, while origin/feature is someone else'
echo '         reset-me, twin-a/twin-b/origin/twin-remote and origin/solo are the commit-menu branches'
echo '         "big diff" and "many files" are the section 7 commits'
echo '         conflict conflicts with main; topic/nested and origin/topic/on-origin are the folder branches'
echo '         src/ is edited, deep/one/two/z.txt untracked, gone.txt deleted, crlf-hunks.txt has a CRLF hunk'
echo '  other  second clone, for the divergence checks in section 5'
