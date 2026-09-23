#!/bin/sh
# Group BE fixture: two clones of the real GitHub repo — c:/tmp/t4/dogfood (the app's) and
# c:/tmp/t4/dogfood-other (someone else pushing). Talks to github.com over https, through GCM.
# Writes only refs named dogfood/* and dogfood-* on GitHub; never main, never a v* tag.
#   sh dogfood-fixture.sh           clone both, a scratch branch with one commit, the `big` remote
#   sh dogfood-fixture.sh diverge   the other clone pushes a commit to dogfood/test (BE 4)
#   sh dogfood-fixture.sh cleanup   delete every dogfood* branch and tag left on GitHub
set -e
R=/c/tmp/t4
URL=https://github.com/toperux/t4-git-ui.git
A="$R/dogfood"
B="$R/dogfood-other"
commit() { d=$1; shift; git -C "$d" -c user.name=smoke -c user.email=smoke@example.invalid -c commit.gpgsign=false commit -q "$@"; }
case "${1:-setup}" in
setup)
  rm -rf "$A" "$B"
  git clone -q "$URL" "$A"
  git clone -q "$URL" "$B"
  git -C "$A" switch -q -c dogfood/test
  echo "dogfood $(date +%s)" > "$A/dogfood.txt"
  git -C "$A" add dogfood.txt
  commit "$A" -m "dogfood: scratch commit"
  # ~300 MB on a first fetch: long enough to cancel (BE 5).
  git -C "$A" remote add big https://github.com/git/git.git
  git -C "$A" log --oneline -2
  ;;
diverge)
  git -C "$B" fetch -q origin dogfood/test
  git -C "$B" switch -q -C dogfood/test origin/dogfood/test
  echo "the other side $(date +%s)" >> "$B/dogfood.txt"
  commit "$B" -am "dogfood: the other side"
  git -C "$B" push -q origin dogfood/test
  git -C "$B" log --oneline -2
  ;;
cleanup)
  for ref in $(git ls-remote --refs "$URL" 'dogfood*' | cut -f2); do
    git -C "$A" push -q origin --delete "$ref"
  done
  git ls-remote --refs "$URL" 'dogfood*'
  ;;
*) echo "usage: $0 [setup|diverge|cleanup]" >&2; exit 2 ;;
esac
