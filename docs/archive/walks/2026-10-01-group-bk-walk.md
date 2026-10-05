# Group BK: close-out Phase 2b — 2026-10-01

The walk of `smoke-test-post-v1.md` › group BK, rows 1–8, and row 9 (added after the first walk for its finding, walked
later the same day on a build of `95f5b9b`; its own section below) (`docs/archive/plans/2026-10-01-phase-2b-plan.md`,
*Smoke group BK*).

**Setup:**
- **Build:** `target\release\t4-git-ui.exe` from `18d7a3b` (`phase-2b`), a local `tauri build --no-bundle` made by the
  owner before the walk (mtime 2026-10-01 13:07). During the walk five `fixup!` commits landed on `phase-2b`
  (`c829336..beed075`: a CSS comment, `stashSkipsSubmodules` made module-private, a test line, `history.rs` and
  `tree.rs`). None of them is in the walked build.
- **Comparison build (BK 7):** `main` at `b8f2e31`, built in a scratch worktree with its own `CARGO_TARGET_DIR`
  (`node_modules` junctioned in from the repo). It built in 3 min 43 s. The worktree and the junction were removed
  afterwards, and the repo's `node_modules` was checked intact.
- **Host:** Windows 11 Pro 10.0.26200, Git for Windows 2.55.0.windows.1, node 24.19.0.
- **Launch:** `docs/smoke/fixtures/smoke-launch.ps1` (CDP 9222, isolated WebView2 profile `t4-smoke-wv2-9222`);
  `-Exe` for the `main` build. Driven with `docs/smoke/cdp.mjs`, through a scratch copy that adds two things: an
  exact-title window match (`CDP_EXACT`, needed when the main window's title is just `T4 Git UI`) and a `--keys name n
  gapMs` step for fast repeats. `layout.json` was seeded per row with the app closed. Every quit went through Ctrl+Q.
- **Store:** `%APPDATA%\dev.topher.t4gitui` was backed up before the walk, which rewrote `layout.json` and
  `recents.json`, and restored after: `diff -rq` against the backup is clean (2026-10-01).
- **Fixtures** (`C:\tmp\t4`):
  - `bk-hooks`: `main` and `side`, each with its own commit, plus the three refusing hooks.
  - `bk-az`: 240 commits; `feature/a-very-long-branch-name-that-will-not-fit-in-a-280px-row-menu-at-all` at
    `HEAD~3`; a stash; `f.txt` modified.
  - `bk-tier/x` and `bk-tier/a-repository-with-a-really-long-name-here`.
  - `be`, from `bd2-fixture.sh`.
  - `linked`, from `linked-fixture.sh`.
  - `bk-git`, a fresh `git clone https://github.com/git/git`: 82 327 commits, 4 854 files.

## Rows

1. **Ctrl+Q on the start screen:** pass.
   - Start screen (one window, its tab closed with Ctrl+W) → Ctrl+Q: the process exited (`tasklist` empty). This
     happened twice.
   - Two windows were seeded (`main` on `bk-tier/x`, `w1` on `bk-hooks`; labels read from
     `__TAURI_INTERNALS__.metadata`). Ctrl+W in `main` → the start screen, `w1` kept. Ctrl+, opened Settings, and
     Ctrl+Q then did nothing: both windows stayed, Settings stayed open. After Esc, Ctrl+Q closed both windows and
     the process. `layout.json` was `[{"tabs":["c:\\tmp\\t4\\bk-hooks"],…}]`. The relaunch opened one window,
     label `main`, title `T4 Git UI - bk-hooks`.
2. **Hook failures** (`bk-hooks`): pass.
   - Commit with `a.txt` staged: toast *Commit failed* / *pre-commit: lint failed in a.txt*. The dock shows
     `hook1 start` and that line, `exit 1`. HEAD unchanged (`3e3dbd1`).
   - Merge `side`, from Branch › Merge… (`git merge --ff --end-of-options side`): toast *Operation failed* / *Not
     committing merge; use 'git commit' to complete the merge.* The banner reads *Merge in progress — resolve
     conflicts, then commit to finish*, with Abort / Commit merge. `.git/MERGE_HEAD` exists, and `git status` says
     *All conflicts fixed but you are still merging*. Aborted from a terminal afterwards.
   - Checkout `side`, from Branch › Checkout…: toast *Operation failed* / *Checked out, but the post-checkout hook
     failed: post-checkout: env check failed*. The dock shows `Switched to branch 'side'`, the hook line and `exit 1`.
     `git rev-parse --abbrev-ref HEAD` = `side`. The status bar and the sidebar ✓ moved to `side`.
3. **Menus opened by the mouse** (`bk-az`): pass.
   - Clicked `commit 239`, then ArrowDown ×2: the grid is focused and `:focus-visible`. Right-click on the
     `commit 237` row (the long branch): the first item, *Checkout feature/…*, is focused (natively
     `:focus-visible`) but has no `data-kbd`. It is 26 px tall like the others, with background
     `rgba(0, 0, 0, 0)`, `box-shadow: none` and `white-space: nowrap`. The screenshot shows no highlight.
   - Esc, then Shift+F10: the first item is marked `data-kbd`, background `rgb(36, 89, 190)`, 57 px tall, wrapped.
     ArrowDown ×3 onto *Merge feature/… into main…*: that row grows to 76 px and reads as one sentence, and the
     Checkout row is back at 26 px.
   - Bottom edge, at `--inner 1280x600`: Shift+F10 → menu 104–596. End → the Delete row is 54 px, from 538 to 592
     (under the 600 px window), and the menu stays inside 107–596.
4. **Toolbar tier after a tab switch:** pass, at `--inner 1000x982`.
   - Long-named tab: `_icons_` (no Branch button; More).
   - Click on tab `x`: `_tight_`, with Branch and Stash inline and the name `x` shown.
   - Back to the long tab: `_icons_`.
   - Five resizes 990 → 1100 → 990 → 1100 → 990, each with a 1.5 s rAF class sampler (≈360 frames): one class per
     sample, `icons` at 990 and `tight` at 1100, no flapping.
5. **Stash leaves submodules out** (`be`): pass.
   - Stash changes…: *Nothing to stash*, the note, and Stash disabled (`Runs git stash push -u`).
   - `many.txt` appended from a terminal while the dialog was open: the list updated itself to `M many.txt`, the
     button to *Stash 1 file*.
   - Stashed: toast *Stashed changes*. `git stash show --stat` = `many.txt | 1 +`. `git status` still has ` M
     subs/[ab]`, ` M subs/a`, and both are listed in Changes.
   - Stashes browser (Ctrl+Shift+S): it opens on stash@{0}. On the Working tree row it reads *No changes* and has
     the note, and its Stash button is disabled with the title *No changes*.
   - Contrast on the `main` build: the same dialog listed `many.txt`, `subs/[ab]` and `subs/a` → *Stash 3 files*.
6. **Blame from Changes** (`bk-az`): pass.
   - History filter `commit 1` (HEAD `commit 240` hidden). The details pane was on its Changes tab, blame off, row
     `commit 199` selected.
   - Changes view → right-click `f.txt` → Blame: toast *Not in the current view — clear the filter*, view still
     Changes. Back in History: the Changes tab, no blame, `commit 199` still selected.
   - Filter cleared (Esc in the search box). Sidebar stash `On main: bk stash` → the preview shows `f.txt` +`stashed`.
     Its file row → Blame: Files tab, Blame pressed, gutter on, 241 lines, no toast.
7. **Details pane never blank** (`bk-git`): pass.
   - Setup: a background loop wrote `bk-git/bk-touch.txt` every 200 ms. The grid was focused by a click on the first
     commit, then ArrowDown ×20 was sent through CDP `Input.dispatchKeyEvent`. A rAF sampler counted the frames with
     no text in the details pane's `[class*=_summary_]`. It also counted *stale* frames, where the summary isn't
     the selected row's subject.

   | Build | ×20, 50 ms apart | ×20, 400 ms apart |
   |---|---|---|
   | `main` `b8f2e31` (1st run) | 49 blank of 653 frames; every step 1–5 | 62 blank of 2221; every step 2–5 |
   | `main` `b8f2e31` (2nd run) | 40 blank of 557; every step 1–5 | 65 blank of 2200; every step 2–4 |
   | `18d7a3b` (1st run) | 0 of 241 | 0 of 825 |
   | `18d7a3b` (2nd run) | 0 of 656 | 0 of 2228 |

   - Stale frames were 0 in every run.
   - The first `18d7a3b` run happened while the page ran at ~90 fps; the other runs ran at ~240. The rate dropped
     for both builds right after a launch (idle `main` 85 fps, `18d7a3b` 88–91). It was back at ~240 after a click
     on a tab, so it is an environment effect. Both builds were re-run at ~240 for a like-for-like comparison.
8. **Main row for a submodule's worktree:** pass.
   - Setup: `git -C $T/linked/sub worktree add -q --detach <scratch>/sub-wt`. The location is a deviation: a local
     Claude Code hook refuses worktrees outside the repo's `.claude/worktrees` or the session temp, so it couldn't
     go in `$T/linked-wt/sub-wt`. `git worktree list` names `C:/tmp/t4/linked/.git/modules/sub` as main, the gap
     the row fixes.
   - The `sub-wt` tab's Worktrees (2) section has `sub` (*detached*, *main*, title `c:/tmp/t4/linked/sub`) and
     `sub-wt` (*current*).
   - Right-click `sub` → Open, Copy path, Lock…, Remove… (Remove disabled: *The main working tree stays*). Open →
     a new tab `sub`, title `T4 Git UI - sub`, showing the submodule checkout's dirty `dirty.txt` (1 change).
     `layout.json` at the next quit listed `c:\tmp\t4\linked\sub`.
   - Removed afterwards with `worktree remove --force`; the list is back to one entry.

## Seen on the way

- **Stashes browser previews the wrong commit (finding, pre-existing).** Both builds have it: on `main` it
  reproduces when the stash row is clicked. Repro in `be`, which has only its two moved submodules changed:
  1. `git stash clear`.
  2. Append to `many.txt`.
  3. Select `side pages` in History.
  4. Stash changes… → *Stash 1 file*.
  5. Alt+2.
  6. Ctrl+Shift+S.

  The Stashes browser opens on `WIP on main: 488de72 main pages · just now`. Its preview shows *2 files changed*,
  `pages/[id].txt` (`id page 2` → `id page SIDE`) and `pages/i.txt`: the diff of the commit selected in the grid.
  `git stash show` has only `many.txt`. Clicking Working tree and then the stash row again doesn't fix it. With
  `main pages` selected instead, the preview shows that commit's diff. The sidebar's preview of the same stash is
  right (`many.txt`). Once the browser had been opened from the sidebar stash, later opens were right too, including
  with a second stash. On `18d7a3b`, with nothing stashable, the browser opens straight on stash@{0} (row 6's
  intended change), so the wrong preview shows at once. On `main` it opens on Working tree and goes wrong when the
  stash row is clicked. Apply / Pop / Drop sit above a preview of a different commit, which matters before a Drop.
  Not dug into further.
- **Driver slip:** a CDP click at the centre of the narrow `x` tab (45 px) landed on its × and closed the tab, with
  no prompt. Re-seeded and re-walked with a click 10 px into the label. Not an app fault, but a 45 px tab puts its
  × close to the centre.
- A layout of `[]` behaved two ways on two launches. The first launch, made right after the seed, opened the owner's
  most recent repository. Later launches with `[]`, written by the app's own quit, opened the start screen. Not
  investigated.
- Alt+2 typed in the History search box did nothing (the view stayed History); a click on the Changes switch worked.
  This may be on purpose for a text field.
- The merge banner says *resolve conflicts, then commit to finish* after a hook-refused merge that has no conflicts.
  Generic wording, not wrong.
- The Stashes browser's left column clips its text: *No changes* reads *Nc*, the message help is cut, and a
  horizontal scrollbar shows. This is at 1674 px.
- The worktree menu offers **Lock…** on the main row. git refuses to lock the main working tree. Not clicked.
- On a freshly opened repository the grid selects the top commit row, not HEAD. Seen in `bk-hooks` (`side only`
  selected, HEAD `main only`) and in `sub-wt`.
- Nit, outside the walked build: `beed075..` fixup `9bb66a1` left `const stashSkipsSubmodules =(` without a space
  after `=`.

## BK 9 — the Stashes browser fix (re-walk, same day)

**Build:** `target\release\t4-git-ui.exe`, a fresh release build of `phase-2b` at `95f5b9b` (mtime 14:22, after
`95f5b9b`'s 14:18 commit). It has fix `2fe3333` and its fixups: the browser loads its own preview (D18), and
`diffStore.restore` drops stale replies on a tab switch (D19). Same launch, driver and store handling as above. One
slip: the first launch ran before `layout.json` was re-seeded, so it restored the owner's four tabs. It was quit
with Ctrl+Q at once, with nothing done in them, then re-seeded with `be` and `bk-az`.

9. **Stashes browser opened from Changes** (`C:\tmp\t4\be`): pass.
   - Setup: `git stash clear` (0 stashes); `many.txt` appended (`bk9 edit`). `git status`: `many.txt`,
     `subs/[ab]` and `subs/a` modified.
   - In History, `side pages` selected: the pane lists `pages/[id].txt` and `i.txt`.
   - Stash changes… → the dialog lists `M many.txt`, with the submodule note and *Stash 1 file*. Stashed: toast
     *Stashed changes*. `git stash show --name-only stash@{0}` = `many.txt`.
   - Alt+2 (Changes pressed), then Ctrl+Shift+S: the browser opens on `WIP on main: 488de72 main pages`. The preview
     reads *1 file changed*, `M many.txt +1`, and the diff `@@ -28,3 +28,4 @@` ends in `31 + bk9 edit`. Screenshot
     read.
   - Working tree row, then the stash row again: still `many.txt` only, with the same diff.
   - Esc, Alt+1 (the grid still on `side pages`), Ctrl+Shift+S: still `many.txt` only.
   - Tab-switch check, with the browser closed and History open. `i only` was selected in `be` and `commit 235` in
     `bk-az`.
     - Switches with an 800 ms pause, done three times: each tab's details pane, file list and diff are its own
       selected commit (`i only` → `pages/i.txt`; `commit 235` → `f.txt`). No *Loading*, no other tab's files.
     - Three fast switches, also right.

**Seen on the way:**
- **Fast tab switching loses the grid selection (pre-existing).** Ten tab switches with no pause (CDP clicks
  back-to-back), then a 1 s wait. Both tabs came back with HEAD selected (`main pages` / `commit 240`) instead of
  `i only` / `commit 235`. The pane matched HEAD in each, so it was consistent: no stuck loading, no other tab's
  files. It also happened once in an earlier run of three fast switches.
  - The `main` build (`b8f2e31`) does the same: after ten fast switches `be` came back on HEAD; `bk-az` kept
    `commit 235` that time.
  - So it isn't from D19, though D19 touches the same path. Switches with a pause never lost it.

- **After closing the browser, History keeps showing the stash.** The browser sets the repository's previewed stash
  (`repoStore.preview`). After Esc and Alt+1, History's details pane shows `stash@{0}` (Apply / Pop / Drop / Open
  browser, `many.txt`) while the grid row `side pages` stays highlighted and the sidebar's Stashes section is
  collapsed. A grid click returns it to the commit. This is the documented rule (*a previewed stash wins over the
  selection*), but here nothing visible in the grid or sidebar says the stash is selected.

**Hash map.** The builds walked above are pre-squash `phase-2b` commits: `18d7a3b` for BK 1–8, `95f5b9b` for BK 9 (its
own `fixup!` commits folded in, including `2fe3333`'s). `b8f2e31` was the plan's comparison build, on local `main` —
docs-only over `ee16e57` (it adds the plan), so its build is `ee16e57`'s code; it was never pushed, and local `main`
drops it when it moves to `phase-2b`. `phase-2b` was squashed 2026-10-01 into `25dfe4f`–`6ec35b1` (fifteen row commits,
one per row but row 14, accepted with no commit) plus a docs commit; `2fe3333` → `6ec35b1` (row 16), and every other
fixup cited above (`beed075`'s range, `9bb66a1`, and the rest) was folded into its own row commit the same way. None of
the pre-squash hashes cited in this record, nor `b8f2e31`, exist on `origin/main`.

## Cleanup

- Every launch was quit with Ctrl+Q, and `tasklist` shows no `t4-git-ui.exe`.
- The touch loop is stopped and its file removed.
- `sub-wt`, the scratch `main` worktree and its junction are removed. The `main` build's exe stays in the session
  scratch folder (`main-target`).
- No `.playwright-mcp/`.
- The fixtures stay in `C:\tmp\t4` (`bk-*`, `be`, `linked`). `be` holds BK 9's stash (`many.txt`), so its stash
  list isn't empty.
- The store folder is restored; `diff -rq` against the backup is clean.

## Re-walk of BK 6 and BK 9 on the pushed `main` (same day)

Change review changed `blameAt` (`actions.ts`) and `selectTreePathAt` (`diffStore.ts`) after the builds above, so the
rows they touch were walked again before the release.

**Build:** `target\release\t4-git-ui.exe`, a local `tauri build --no-bundle` of `main` at `f3bc5fa`, the pushed squash.
Same launch and driver, plus a scratch `--shot` (`Page.captureScreenshot`) and `--tag` step; every screenshot read. The
store was backed up first; the first two launches opened the start screen with three *Couldn't open* toasts (a
mis-escaped seed) and then the owner's most recent repository (a `[]` layout, open-items §V F2), each quit at once
untouched, before the seed of `bk-az`, `bk-blame` and `be` took.

- **BK 6, filter half** (`bk-az`): pass. Filter `commit 1`, `commit 199` selected; Changes → `f.txt` → Blame: toast
  *Not in the current view — clear the filter*, the view still Changes. Back in History: `commit 199`, the Changes
  tab, no blame, the filter kept.
- **BK 6, stash half** (`bk-az`): pass. Filter cleared; sidebar stash `On main: bk stash` → `f.txt` → Blame: History,
  the Files tab on `f.txt`, the blame gutter on, *241 lines*, no toast.
- **Blame under a path filter** (new scratch repo `bk-blame`: `add a and b`, then HEAD `change a and b`; `b.txt`
  edited): pass. History filtered to `a.txt` (HEAD visible). Changes → `b.txt` → Blame: History, the Files tab with
  `b.txt` selected and blamed (*2 lines*, `b1` / `b2 changed`), not the filter's `a.txt`, no toast. This is the
  `reloads` pin the review added.
- **BK 9** (`be`): pass. `git stash clear`, `many.txt` appended, `side pages` selected; Stash changes… lists only
  `many.txt` (with the submodule note) → *Stashed changes*, `git stash show --name-only` = `many.txt`. Alt+2,
  Ctrl+Shift+S: the browser opens on the stash, *1 file changed*, `many.txt`, `31 + bk9 edit`. The same after Working
  tree and back, and when opened from History (Alt+1, the grid still on `side pages`).

**Cleanup:** quit with Ctrl+Q, no `t4-git-ui.exe` left; the store restored, `diff -rq` against its backup clean. The
fixtures stay (`bk-blame` added; its HEAD is detached at `change a and b`, from its setup; `be` again holds a
`many.txt` stash).
