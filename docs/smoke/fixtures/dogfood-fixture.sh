#!/bin/sh
# Group BE fixture: two clones of the real GitHub repo — $T4_ROOT/dogfood (the app's) and
# $T4_ROOT/dogfood-other (someone else pushing). Talks to github.com over https, through GCM.
# T4_ROOT defaults to /c/tmp/t4.
# Writes only refs/heads/dogfood/* and refs/tags/dogfood-* on GitHub; never main, never a v* tag.
#   sh dogfood-fixture.sh           clone both, a scratch branch with one commit, the `big` remote
#   sh dogfood-fixture.sh diverge   the other clone pushes a commit to dogfood/test (BE 1)
#   sh dogfood-fixture.sh cleanup   delete every dogfood/* branch and dogfood-* tag left on GitHub
# Close the dogfood tab in the app before re-running setup.
set -e
R=${T4_ROOT:-/c/tmp/t4}
URL=https://github.com/toperux/t4-git-ui.git
A="$R/dogfood"
B="$R/dogfood-other"
commit() { d=$1; shift; git -C "$d" -c user.name=smoke -c user.email=smoke@example.invalid -c commit.gpgsign=false commit -q "$@"; }
# ls-remote patterns match any ref *ending* in them (feature/dogfood-x too): keep the exact prefixes.
leftovers() { git ls-remote --refs "$URL" 'dogfood*' | cut -f2 | grep -E '^refs/(heads/dogfood/|tags/dogfood-)' || true; }
case "${1:-setup}" in
setup)
  if [ -n "$(leftovers)" ]; then
    echo "a previous run left refs on GitHub — run: sh $0 cleanup" >&2
    leftovers >&2
    exit 1
  fi
  rm -rf "$A" "$B"
  git clone -q "$URL" "$A"
  git clone -q "$URL" "$B"
  git -C "$A" switch -q -c dogfood/test
  echo "dogfood $(date +%s)" > "$A/dogfood.txt"
  git -C "$A" add dogfood.txt
  commit "$A" -m "dogfood: scratch commit"
  # ~300 MB on a first fetch: long enough to cancel (BE 2). master only and --no-tags, so a fetch
  # that finishes brings no git/git v* tags that a later "Push tags" could send to GitHub.
  git -C "$A" remote add --no-tags -t master big https://github.com/git/git.git
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
  for ref in $(leftovers); do
    git -C "$B" push -q origin --delete "$ref"
  done
  leftovers
  ;;
*) echo "usage: $0 [setup|diverge|cleanup]" >&2; exit 2 ;;
esac
