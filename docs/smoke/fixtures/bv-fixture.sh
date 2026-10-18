#!/bin/sh
# Group BV fixture: $T4_ROOT/bv. Throwaway; T4_ROOT defaults to /c/tmp/t4.
# a.txt and w.txt, 2000 lines `line N` each. Commit `ws` changes every 10th line of w.txt: the odd tens only gain a
# trailing space, the even tens become `line N changed` (a commit: Ignore whitespace is off while staging). Every
# 10th line of a.txt becomes `line N changed`, left unstaged.
set -e
R=${T4_ROOT:-/c/tmp/t4}
rm -rf "$R/bv"
git init -q -b main "$R/bv"
g() { git -C "$R/bv" "$@"; }
g config user.name smoke; g config user.email smoke@example.invalid
g config core.autocrlf false
awk 'BEGIN { for (i = 1; i <= 2000; i++) print "line " i }' > "$R/bv/a.txt"
cp "$R/bv/a.txt" "$R/bv/w.txt"
g add a.txt w.txt; g commit -q -m base

# stripe <file> [ws]: every 10th line `line N changed`; with ws, the odd tens a trailing space instead.
stripe() {
  awk -v ws="$2" 'NR % 10 { print; next } ws && NR % 20 == 10 { print $0 " "; next } { print $0 " changed" }' \
    "$R/bv/$1" > "$R/bv/$1.tmp"
  mv "$R/bv/$1.tmp" "$R/bv/$1"
}
stripe w.txt ws; g commit -q -am ws
stripe a.txt

g log --oneline
g status --short
