# Linux track C+D: the Esc/Super fixes, and §V's two Linux walks — 2026-10-06

The walk of the close-out plan's Linux track rows (`docs/plans/2026-09-26-close-out-plan.md`, *Linux track*): Phase
2a's Esc fix on WebKitGTK (open-items §R), Phase 2a's Super fix (`11b5b42`), and Phase 2b's two Linux walks
(open-items §V, row 3's unix tool-start walk and row 11's non-UTF-8 walk).

**Setup:** Linux VM (Ubuntu 26.04.1), `main` `c9e2dc4`. Build: `npm run tauri -- build --debug --no-bundle --config
'{"identifier":"dev.topher.t4gitui.smoke"}'` (1 min 54 s). Isolated `HOME`, Xvfb `:99` 1600 × 1000, `tauri-driver`
with the askpass guard, `wd.mjs`; fixtures `smoke-fixtures.sh --force`, seeded to open `/tmp/t4/work`. Real keys via
`xdotool windowfocus --sync <win> key …`; clicks = move, 100 ms, click.

## C1 — Esc after Check now (open-items §R row 1)

PASS.

- Before: focus on the × close button; recorder on `pointerup` + capture `keydown`.
- Real click on Check now, real Escape 50 ms later. `activeElement`: +0 ms BUTTON "Check now" `disabled=true`;
  +30 ms and later BODY. Escape keydown at +154 ms, target BODY; Settings gone by +300 ms. WebKitGTK drops focus
  to `<body>` when the button disables itself; `Dialog.tsx`'s document listener catches it.
- Second run after the check finished (3 s): `activeElement` BODY, button enabled again, status "T4 Git UI
  0.10.19 is up to date"; real Escape → target BODY, Settings closed.

Esc on WebKitGTK behaves as Phase 2a assumed: focus falls to `<body>`, so the document `keydown` listener catches
Esc even though it rested on an assumption only walked on WebView2 before.

## C2 — Super keys (close-out plan Linux track, Phase 2a's `11b5b42`)

PASS.

- `navigator.userAgent` = "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)
  Version/60.5 Safari/605.1.15" — no "Mac".
- Real Super+Q in a repo window: app still running (same pid), title unchanged. But the page got `key=Super
  code=OSLeft`, then `key=q` with `metaKey=false`: Xvfb's default keymap has `Meta_L` on mod1 (with Alt) and Super
  on mod4, so a real Super chord can't exercise the Meta path. `xmodmap` at runtime didn't change it (GDK had
  already read the keymap); restored.
- The plan's method ("over WebDriver on Xvfb"): `wd.mjs key Meta+q` → keydown `q` with `metaKey=true, ctrl=false`
  → app did not quit.
- Start screen: real Super+O (`metaKey=false`) and WebDriver Meta+O (`metaKey=true`) → no dialog (`xdialog.sh
  --dump`: only "T4 Git UI"); both typed "o" into Recent's filter (value "oo"), as an unhandled chord should.
- Contrast: real Ctrl+O → "Open repository" appeared; cancelled with `xdialog.sh`.
- Owner's ruling: the real-Super/Meta keymap limit accepted closed; WebDriver's Meta+Q is the proof the plan
  asked for — a real Super chord on this Xvfb keymap carries no `metaKey`, so it can't drive the test.

## D1 — row 3's unix tool-start walk (open-items §V)

PASS.

- Isolated `HOME`'s `.gitconfig` only (`git config --file`): `diff.tool=nosuch`,
  `difftool.nosuch.cmd='~/t4-no-such-tool "$LOCAL" "$REMOTE"'`. Real `~/.gitconfig` md5 unchanged.
- The tools are read once at app start (`settingsStore.ts:87-96`): until a relaunch the button said "No diff tool
  set" and Settings › Diff & merge showed None; after quit + relaunch: "Open in nosuch". Owner's ruling: accepted,
  open-items §Q, reopen trigger "a report that a tool set outside the app isn't picked up".
- `work`, Working tree, `crlf-hunks.txt`, real click on "Open in nosuch" → alert toast at +52 ms, then +26 ms and
  +26 ms on two repeats (`pointerup` → toast, `MutationObserver`). Text: "Couldn't open the diff tool" /
  "~/t4-no-such-tool could not start (exit 127) — check the tool's command in Settings". Error toasts persist
  (three stacked).

## D2 — row 11's non-UTF-8 walk (open-items §V)

PASS at a commit; the working-tree half not reachable.

- Scratch copy `/tmp/t4/d2` of `other`: `touch $'caf\xe9.txt'; git add .` → status `A "caf\351.txt"`; index 311
  files, HEAD tree 310.
- Working tree: no Files tab exists for it in the UI. `ChangedFileList` (Changes/Files tabs) is used only in
  `DetailsPane` and `DiffDialog`; the working-tree row opens the Changes view (no Files tab); keyboard-selecting it
  in History shows Changes/Files but "No commit selected". No UI produces a `workdir` `DiffTarget` (only
  `types.ts` has it); `treeTargetOf`'s working-tree branch looks unreachable (read from code, not exhaustive).
  Owner's ruling: close row 11 as walked at a commit, noting the UI has no working-tree Files tab; the dead
  `workdir` branch noted as a remark, not a finding to fix.
- `git commit -m x` → `8b0b356` (tree 311). Files tab at that commit: header "310 files", no `caf` row, banner "1
  file with a name that isn't UTF-8 isn't shown" (exact DOM text; cut to "…isn't sh…" at the 300 px pane width).
  PASS.
- Seen, already an accepted §Q limit (Phase 2b D11(a), `open-items.md:449`): the Changes view's Staged list and the
  commit's Changes tab list it as "caf�.txt"; both diffs read "Couldn't load diff — path not in diff: caf�.txt".

## Cleanup

Quit through the app; `tauri-driver`, `WebKitWebDriver`, Xvfb `:99` stopped, `pgrep` empty; `/tmp/t4/d2` removed;
keymap restored; real `~/.gitconfig` unchanged; clone clean at `c9e2dc4`.
