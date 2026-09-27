#!/bin/sh
# Group BD rows 11-16 fixture: $T4_ROOT/be (+ be-origin.git, be-other.git, be-sub.git). Throwaway; T4_ROOT defaults to /c/tmp/t4.
set -e
R=${T4_ROOT:-/c/tmp/t4}
rm -rf "$R/be" "$R/be-origin.git" "$R/be-other.git" "$R/be-sub.git" "$R/be-sub-src"
git init -q --bare -b main "$R/be-origin.git"
git init -q --bare -b main "$R/be-other.git"

# The submodule's source: two commits, so a submodule can sit one behind.
git init -q -b main "$R/be-sub-src"
s() { git -C "$R/be-sub-src" "$@"; }
s config user.name smoke; s config user.email smoke@example.invalid
echo one > "$R/be-sub-src/f.txt"; s add f.txt; s commit -q -m "sub one"
echo two > "$R/be-sub-src/f.txt"; s commit -q -am "sub two"
git clone -q --bare "$R/be-sub-src" "$R/be-sub.git"
rm -rf "$R/be-sub-src"

git init -q -b main "$R/be"
g() { git -C "$R/be" "$@"; }
g config user.name smoke; g config user.email smoke@example.invalid
g config core.autocrlf false
mkdir -p "$R/be/pages"
echo "id page" > "$R/be/pages/[id].txt"
echo "i page" > "$R/be/pages/i.txt"
g add "pages/[id].txt" "pages/i.txt"
g commit -q -m "pages"
# History: two commits on [id].txt alone, one on i.txt alone.
echo "id page 2" > "$R/be/pages/[id].txt"; g commit -q -am "id only"
echo "i page 2" > "$R/be/pages/i.txt"; g commit -q -am "i only"
seq 1 30 | sed 's/^/line /' > "$R/be/many.txt"
seq 1 25000 | sed 's/^/row /' > "$R/be/huge.txt"
g add many.txt huge.txt
g commit -q -m "many and huge"

# Two submodules; `subs/[ab]` as a glob matches `subs/a`.
g -c protocol.file.allow=always submodule --quiet add "$R/be-sub.git" "subs/[ab]"
g -c protocol.file.allow=always submodule --quiet add "$R/be-sub.git" "subs/a"
g commit -q -m "submodules"

# A branch that conflicts with main on both page files.
g branch side
g checkout -q side
echo "id page SIDE" > "$R/be/pages/[id].txt"
echo "i page SIDE" > "$R/be/pages/i.txt"
g commit -q -am "side pages"
g checkout -q main
echo "id page MAIN" > "$R/be/pages/[id].txt"
echo "i page MAIN" > "$R/be/pages/i.txt"
g commit -q -am "main pages"

g remote add origin "$R/be-origin.git"
g remote add other "$R/be-other.git"
g push -q origin main
g push -q other main
g branch dev
g push -q origin dev:develop
g branch -u origin/develop dev
# A slow push, for the ops that outlive their window.
printf '#!/bin/sh\nsleep 12\n' > "$R/be/.git/hooks/pre-push"
chmod +x "$R/be/.git/hooks/pre-push"
# Last, or a later `commit -a` records the move.
(cd "$R/be/subs/[ab]" && git checkout -q HEAD~1)
git -C "$R/be/subs/a" checkout -q HEAD~1
g log --oneline --decorate --all
g branch -vv
g submodule status
