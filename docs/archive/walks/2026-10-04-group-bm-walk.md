# Group BM: close-out Phase 4 Stage B — 2026-10-04

The walk of `smoke-test-post-v1.md` › group BM, rows 1–13 (`docs/plans/2026-10-03-phase-4-plan.md`, *Part 1 — app
fixes*).

**Setup:**
- **Build:** `target\release\t4-git-ui.exe`, a local `tauri build --no-bundle` release build of `e13d479` on
  `phase-4b`, a temporary side branch holding `main`'s unpushed Stage B commits.
- **Host:** the Windows VM session (`test-pc`).
- **Launch:** `docs/smoke/fixtures/smoke-launch.ps1`. Driven with `docs/smoke/cdp.mjs` over CDP.
- **Store:** `%APPDATA%\dev.topher.t4gitui` backed up to `%TEMP%\t4-store-backup-bm` before the walk and restored
  byte-exact after. The BM 11 follow-up measurement used a second backup, `%TEMP%\t4-store-backup-bm11`; `cmp`
  showed `recents.json`, `layout.json` and `.window-state.json` byte-identical to it afterwards.
- **Fixtures:** rebuilt under `C:\tmp\t4cap`, as the BM intro in `smoke-test-post-v1.md` describes (`work`, `other`,
  `irebase`, `perf`).
- **Screenshots:** kept on the VM, `C:\tmp\t4cap-shots\bm-*.png`, plus `bm-11b-folded.png` and
  `bm-11b-open-scrolled.png`. The VM's full measurements are in `C:\tmp\t4cap-shots\bm-results.md` there.

## Rows

1. **The palette's input row keeps 40 px:** pass. `.head` 40 px both empty and with "st"; `.foot` 27 px both times.
2. **No focus ring on the palette input:** pass. `activeElement` is the palette input; `boxShadow` "none".
3. **`Dialog.module.css`, one batch**, at 1440 × 900: pass.
   - Commit, Diff window and Stashes: each first Panel at the form's left edge and the title bar's bottom (dx 0 /
     dy 0).
   - Rebase: 6 action rows plus 1 merge row (no dropdown); with `reword` set, "1 merge commit" at y 530, radios at
     559, footer centre at 641. Cancel left the tree as it was.
   - Delete branch (`mid`): title bottom 134, message top 150 (body padding 16 only) — no 12 px band.
4. **The Stashes browser's left pane fits:** pass. At the default 280, list 280 = 280, help wraps to 2 lines,
   "Stash 2 files" 262 = 262; at the 220 minimum, 220 = 220, 2 lines, 202 = 202.
5. **"Loading commits… 96 000":** pass. "Loading commits… 2 000" → "37 000" → "73 000"; the separator is a plain
   space, U+0020.
6. **No "Open commit panel" on the conflicts banner in Changes:** pass. History has the button; Changes has the
   same banner with none.
7. **The Unstaged badge turns danger while an entry is conflicted:** pass. `rgb(160,40,32)` (`--danger`) while
   conflicted, `rgb(168,171,176)` (`--bg-inset`) once staged; Restore conflict → `smoke-dialog.ps1` Restore → back
   to UU.
8. **The Working tree row's dashed circle:** pass. Class `"lucide lucide-circle-dashed"`.
9. **The branch being rebased in the status bar:** pass. Status bar read "other | 0 unstaged · 0 staged · 1
   conflicted | Rebase in progress"; the rebase was aborted, back on `main`.
10. **The conflict strip:** pass, at 1280 and 1000, the rail not forced at 1000. In each state (conflicted, staged
    with markers, unstaged again) every control sat inside the strip and the header's scrollWidth = clientWidth
    (480 / 200). Strip heights: conflicted 63 px at 1280 / 135 px at 1000 (wrapped); with markers 33 px at 1280 /
    75 px at 1000 (Restore conflict on its own line).
11. **Changes at 720 folds the commit options** (720 × 540; 3 staged `src/a.txt`, `src/lib/b.txt`,
    `crlf-hunks.txt` + 3 unstaged `deep/one/two/z.txt`, `gone.txt`, `hunks.txt`): pass, with the bullet reworded
    (below).
    - Each list showed 2 whole rows: viewport 75 px, rows at 100–126 / 126–152 / 152–178 against a bottom of 175,
      so the 3rd row was cut by 3 px; the top row was not clipped.
    - Amend, Signed-off-by and Sign showed inline; `aria-expanded` went false → true → false; `aria-pressed` was
      absent.
    - With ⋯ open the column didn't scroll by itself, but could be scrolled to Commit. Follow-up measurement, same
      build, column `.col` rect 283–483: before scrolling, scrollTop 0 / scrollHeight 302 / clientHeight 200,
      Commit at 557–585 (below the 540 window); after `scrollTop = max` (102), Commit at 455–483 (fully inside the
      column, flush with its bottom, inside the window); folded, scrollHeight 200 = clientHeight, Commit at
      443–471 (fully visible).
12. **The Commit dialog's author line** (1280 × 800): pass. Author line 16 px at y 718, painted ("… · will commit
    0 staged files"); column 320 = 320, no scroll. With `user.name ""` set in `work` and the repo reopened: "Set
    user.name and user.email" (`role=alert`); unset after.
13. **No two separators side by side at the icons tier** (720): pass. One separator between Push and the view
    switch, 4 in all.

## BM 11's acceptance

Row 11's plan (`docs/plans/2026-10-03-phase-4-plan.md`, Part 1 row 24) said the walk records the measured row
count, and if it shows 2, that goes to the owner — the plan aimed for ≥ 3. The walk measured 2 whole rows and a
third cut by 3 px (viewport 75 px). The owner accepted 2 whole rows plus most of a third on 2026-10-04, instead of
asking for an unequal split. The bullet in `smoke-test-post-v1.md` was reworded to say so.

The column-scroll half of row 11 also needed a reword: the original bullet said "with ⋯ open the column scrolls to
Commit", which reads as automatic. The walk found it doesn't scroll by itself — it can be scrolled to bring Commit
into view. A follow-up measurement (same build) confirmed that scrolling the column to its end brings Commit fully into
view with ⋯ open; folded, Commit is visible without scrolling.

## Walker's doc notes and how they were addressed

- BM 3: the bullet said "7 rows, one a merge row"; the rebase view actually shows 6 action rows plus a merge row,
  with no dropdown — reworded in `smoke-test-post-v1.md`.
- BM 5: the bullet was updated to name the digit-group separator as a plain space (U+0020).
- BM 10: the bullet was updated to add that the rail isn't forced at 1000.
- BM 11: reworded both halves as above (the row count and the column-scroll wording).

**Hash map.** `e13d479` is a pre-squash commit on the temporary branch `phase-4b`. `main` was squashed 2026-10-04
into five commits; `e13d479`'s app code (everything outside `docs/` and `src/README.md`) is `7cea279`'s unchanged,
and it differs from `main` only in this walk's docs. `e13d479` isn't on `origin/main`.

## Cleanup

- The store folder was restored byte-exact; the BM 11 follow-up's own backup/restore was also checked byte-exact
  with `cmp`.
- The fixtures in `C:\tmp\t4cap` are back at their start state; screenshots and the VM's `bm-results.md` stay
  on the VM. The VM's clone (`C:\src\t4-git-ui`) was left detached at `e13d479` with the build in place (it was on
  `main` at `0977e1f`).
