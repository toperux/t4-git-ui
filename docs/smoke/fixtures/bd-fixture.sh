#!/bin/sh
# Group BD fixture: c:/tmp/t4/bd (+ bd-origin.git). Throwaway.
set -e
R=/c/tmp/t4
rm -rf "$R/bd" "$R/bd-origin.git"
# `-b main`: a bare HEAD left on `master` makes a clone of it check nothing out.
git init -q --bare -b main "$R/bd-origin.git"
git init -q -b main "$R/bd"
g() { git -C "$R/bd" "$@"; }
g config user.name smoke; g config user.email smoke@example.invalid
# The no-newline and Latin-1 files are byte-exact on purpose.
g config core.autocrlf false
mkdir -p "$R/bd/pages"
echo "id page" > "$R/bd/pages/[id].txt"
echo "i page" > "$R/bd/pages/i.txt"
g add "pages/[id].txt" "pages/i.txt"
g commit -q -m "pages"
printf 'a\nb' > "$R/bd/nonl.txt"
g add nonl.txt
g commit -q -m "nonl"
printf 'a\ncaf\351\nc\n' > "$R/bd/latin1.txt"
g add latin1.txt
g commit -q -m "latin1"
# Row 4: one changed line far from another gives two hunks to shift.
seq 1 30 | sed 's/^/line /' > "$R/bd/many.txt"
g add many.txt
g commit -q -m "many"
g remote add origin "$R/bd-origin.git"
g push -q origin main
# dev tracks origin/develop, a second remote-tracking setup beside origin/main
g branch dev
g push -q origin dev:develop
g branch -u origin/develop dev
printf '#!/bin/sh\nsleep 60 &\n' > "$R/bd/.git/hooks/post-commit"
chmod +x "$R/bd/.git/hooks/post-commit"
g log --oneline --decorate --all
g branch -vv
