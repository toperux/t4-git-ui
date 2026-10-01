# Plan: close-out Phase 2b — the design-needed rows, 2026-10-01

_Written 2026-10-01. Status: decisions D1–D15 taken by the owner 2026-10-01 (every recommendation); plan review pass 1:
9 should-fix / nits fixed, decisions D16–D17 taken; pass 2: 1 should-fix, 11 nits fixed; pass 3: 2 should-fix, 13 nits
fixed (the Linux-track rows placed in a new open-items §V); pass 4: 3 should-fix, 9 nits fixed (`worktree add`'s stderr
measured); pass 5: clean (4 nits, fixed); pass 6: clean. **Executed on `phase-2b` 2026-10-01: BK 1–9 walked green,
change review passes 1–10 (pass 10 clean), triaged** (see *Triage* below), **squashed**, pushed; **released as v0.10.15
2026-10-01** (release run 36843045866), its gate passed on both platforms, the AppImage half restarting by itself
for the first time
(`docs/archive/walks/2026-10-01-v0.10.15-release-gate.md`,
`docs/archive/walks/2026-10-01-v0.10.15-release-gate-linux.md`).

**Goal:** settle every Phase 2b row of `docs/plans/2026-09-26-close-out-plan.md` (the Phase 2 table's rows marked
*design needed*, plus the three rows given to 2b: §R Ctrl+Q, §S hook toast, §S tool start), walk the fixes as smoke
group **BK**, and release: the first signed release, and the first with `requireSignedVersion` on. Each row ends
either fixed, or as an accepted limit in open-items §Q with a reopen trigger — the owner's 2026-09-26 rule is that
§I rows are fixed, not closed as won't-fix, so every *accept* below was ruled by the owner one by one
(*Decisions*), with the reason a fix isn't worth it.

Row texts are in `docs/plans/open-items.md`; `CF` = `docs/archive/plans/2026-09-12-consolidated-findings.md`. Line
numbers are as of `ee16e57`, from the research pass (four read-only agents, 2026-10-01); the review passes re-check
them. **Measured** marks what was run in a scratch repo on this machine (Git for Windows); everything else about git's
behaviour is read from the code or reasoned.

Branch: `phase-2b` off `origin/main` (`ee16e57`). One commit per row while working (squashed at the end, step 7 of
`CLAUDE.md`).

## Summary

| # | Row | Recommendation | Decision |
|---|---|---|---|
| 1 | §R Ctrl+Q on the start screen | fix (StartScreen arm) | D1 |
| 2 | §S failed commit toast shows a hook's first line | fix (commit: last line; merge: *Not committing merge*) | D2 |
| 3 | §S custom tool that fails to start says *Opened* | fix, unix: report exit 126/127 within 300 ms | D3, D4, D17 |
| 4 | §M menus: row shift, wrapped first item | fix (b); accept (a) → §Q | D5 |
| 5 | §I `Toolbar.tsx:100` rename in the `icons` tier | fix (CSS: keep the name measurable) | — |
| 6 | §I `StashDialogs.tsx:39` dirty-only submodule | fix (leave unstaged submodules out, with a note) | D6 |
| 7 | §I S4 `blameAt` ordering | fix (reveal first) | D7 |
| 8 | §Q Q23 details pane blank | fix (show the grid row's fields at once) | D8 |
| 9 | §I `walker.rs:94` `Refs` spec | fix by deletion (the variant is unused) | D9 |
| 10 | §I `linked.rs:134` no main row | fix the submodule case + correct the comment | D10 |
| 11 | §I S2 non-UTF-8 paths | fix in the Files tab (skip + a count note, directories too); Changes list → §Q | D11, D16 |
| 12 | §I B3 rebase read pass `--autostash` | accept → §Q, plus a test proving the recovery | D12 |
| 13 | §I C6 `close_repo` never cancels ops | accept → §Q, correct the wrong comment | D13 |
| 14 | §I R10 selected-mode header after a partial stage | accept → §Q | D14 |
| 15 | §I R12 stale status/refs pairings | fix the `stranded` pairing; accept `canCommit` → §Q | D15 |
| 16 | Stashes browser opened from Changes previews History's commit (found in the BK walk) | fix (the browser loads its own preview; `restore` drops stale replies) | D18, D19 |

## Rows

### 1. Ctrl+Q does nothing on the start screen (§R)

- **What the user sees:** on the start screen (also the **main** window after its last tab closed while other
  windows stay open — a secondary window closes itself with its last tab, `tabsStore.ts:143-144`), Ctrl+Q does
  nothing on Windows and Linux; only the window's × closes it.
- **Code:** `src/screens/StartScreen/StartScreen.tsx:125-143`, a window `keydown` handler; `:129` returns early
  unless `ctrlOrCmd(e)` and no Alt, Clone, Settings or `busy`; arms for `o`, Shift+`o`, `n`, `,`. No `q`.
  `quitApp()` is `src/screens/RepoWindow/actions.ts:266-268` (`ipc.quit()` + a *Couldn't quit* toast);
  `src-tauri/src/commands/window.rs:451-454` is `app.exit(0)`: every window closes, `layout.json` keeps only
  windows with tabs (`:663-666`) — the same as Quit from a repo window.
- **Fix (~5 lines):** import `quitApp` (a precedent: `src/store/tabsStore.ts:10` imports from `actions`), add
  `k === "q" && !e.shiftKey` → `quitApp()`. Ignored while Clone or Settings is open (the existing gate, and
  `useShortcuts.ts:37` does the same in a repo window).
- **D1 — Ctrl+Q while a repository is opening (`busy`).** Today's early return would drop it.
  - (a) **Quit even while opening:** move the `busy` check below the `q` arm. A hung open is when Quit is wanted,
    and a repo window's Ctrl+Q isn't blocked by a running op either (`useShortcuts.ts:74-78`, no confirm).
  - (b) Keep the gate: nothing while opening.
  - **Recommend (a).**
- **Docs:** README shortcuts table (`README.md:105`): *Both screens | `Ctrl+,` · `Ctrl+Q` | Settings · Quit* (Ctrl+Q
  is missing from the table today).
- **macOS** (reasoned): no app menu is set (`src-tauri/src/lib.rs:138-293`), so Tauri's default macOS menu, with
  ⌘Q, likely handles it natively. Not checked; goes with the Phase 5 macOS rows.
- **Tests (`StartScreen.test.tsx`):** add `quit: vi.fn(() => Promise.resolve())` to the `ipc` mock (`:10-23`) — a bare
  `vi.fn()` returns `undefined`, and `quitApp`'s `.catch` (`actions.ts:267`) would throw inside the keydown listener;
  Ctrl+Q calls it; ⌘Q with a Mac user agent calls it; add `q` to the *Super+O / Super+N do nothing off macOS* test
  (`:160-165`); Ctrl+Q with Settings open doesn't; with D1 (a), Ctrl+Q while opening does (the pattern at `:96-106`).
- **Walk (BK 1):** start screen → Ctrl+Q → the process exits; two windows, the main one's last tab closed →
  Ctrl+Q in it → both close, and a relaunch opens one window, the main one, holding the other window's tabs
  (`window.rs:660-669`); Settings open → Ctrl+Q does nothing.

### 2. A failed commit's toast shows a hook's first output line (§S, hotfix triage T1)

- **What the user sees:** a pre-commit hook refuses; the toast shows the hook's first line (*hook1 start*), not why.
- **Measured** (scratch repo, Git for Windows, `LC_ALL=C`):
  - a refusing pre-commit: exit 1, stderr is only the hook's own lines — no `error:` / `fatal:` from git;
  - a refusing pre-merge-commit on `merge --no-ff`: exit 1, the hook's line, then *Not committing merge; use 'git
    commit' to complete the merge.*; `MERGE_HEAD` stays;
  - a failing post-checkout: exit 1, stderr *Switched to branch 'side'* then the hook's line — **the checkout
    happened** (HEAD on `side`).
- **Where the text comes from:**
  - commit: `src-tauri/src/commands/stage.rs:549-560` `run.out.check("git commit")` → `GitError::Cli` with the
    whole stderr (`crates/git-core/src/cli/runner.rs:85-95`) → `commitStore.ts:534` `toastError` → `cliDetail`
    takes the first non-empty line (`src/store/toastStore.ts:104-107`);
  - merge, pull, push, checkout, rebase, cherry-pick: `run_and_classify` (`src-tauri/src/commands/ops.rs:130-188`)
    → `classify_failure` (`crates/git-core/src/cli/ops.rs:645-709`), whose middle fallback shows git's *first*
    advice paragraph on purpose (its tests `:1336-1367`). stderr can't tell a hook's lines from git's advice, so
    there is no one shared fix.
- **Fix:**
  - commit (~10 lines): a `failure_line(stderr)` helper in `crates/git-core/src/commit.rs`: the **first**
    `error:` / `fatal:` line if any (a signing failure prints `error: gpg failed to sign the data` then `fatal:`,
    reasoned), else the **last** non-empty line; empty stderr keeps today's text. `stage.rs:560` builds
    `GitError::Cli { stderr: failure_line(..) }` on a non-zero exit. The dock keeps the full output.
  - merge / pull (~4 lines): in `classify_failure`, after the `fatal:` / `error:` search (`:683-687`), before the
    paragraph fallback, take a line starting `Not committing merge`.
  - pre-push already ends in git's `error: failed to push some refs` (classified today); rebase picks and
    cherry-pick don't run pre-commit, and an exec step's commit refused by a hook pauses with git's own *execution
    failed* line (`tests/rebase.rs:295-324`). Unchanged.
  - Optional: `src/README.md:555` (`rejected` / `other` show git's message) mentions the post-checkout message.
- **D2 — a failing post-checkout hook** (found in research, measured above). The checkout succeeds but the toast
  says *Operation failed: Switched to branch 'side'*.
  - (a) **Fix here** (~8 lines): in `classify_failure`, when **any** stderr line starts with git's success text
    (`Switched to`, `Already on`, `HEAD is now at`, `Preparing worktree`) and none is `fatal:` / `error:`, report
    *Checked out, but the post-checkout hook failed: <the hook's last line>* — the last non-empty line after that
    success line; if there is none (a silent hook), no detail. *Any* line, not the first: from a detached HEAD git
    prints the multi-line *Warning: you are leaving 1 commit behind…* before *Switched to branch* (**measured**).
    `worktree add` (same `cli_op`, `src-tauri/src/commands/ops.rs:903-927`) with a failing post-checkout exits 1 with
    stderr *Preparing worktree (detached HEAD …)* then the hook's lines; its *HEAD is now at* goes to **stdout**
    (**measured**), hence the fourth prefix. The refs refresh runs either way (read: `mutate` / `suppressed` emit
    `repo://changed` on error too, `src-tauri/src/commands/stage.rs:88-99`, and `runOp` calls `syncRefs`). The Create
    branch dialog with *checkout* creates the branch, then calls `ipc.checkout` (`RefDialogs.tsx:60-62`), so it gets the
    same message through the `checkout` command. (`create_branch(checkout: true)`, `ops.rs:808-814`, has no frontend
    caller; it goes through `cli_failure` → `classify_failure` and gets it too.)
    - **Where:** after the `! [rejected]` arm (`ops.rs:669-677`) and before `let message` (`:683`); the earlier arms
      (conflicts `:646-659`, auth `:660`, non-ff `:663`, diverged `:666`) can't match a successful checkout, and its
      own condition excludes `fatal:` / `error:`.
    - **What the user sees:** `OpFailure::Other` → `failureToast` (`opsStore.ts:165-167`): a red toast titled
      *Operation failed*, detail *Checked out, but the post-checkout hook failed: …*; no *Checked out X* success
      toast (`outcome.ok` is false). The branch change shows (the refs refresh, above).
  - (b) A new §S row for later.
  - **Recommend (a):** same root, same file, and the close-out aims to empty the list, not add to it.
- **Docs:** `docs/smoke/smoke-test.md:195` says a hook failure *surfaces its first stderr line* → *its last line*.
- **Tests:** a `TempRepo::hook(name, body)` helper in `crates/git-core/src/test_util.rs` (the pattern is copied at
  `tests/ops.rs:576-585` and `tests/rebase.rs:302-311`; migrating those is optional). `failure_line` unit tests
  (hook-only → last line; gpg-style → the `error:` line; warning then fatal → fatal). `tests/ops.rs`: a refusing
  pre-commit → stderr has no `error:` / `fatal:` (pins git's silence) and `failure_line` gives the hook's last
  line; a refusing pre-merge-commit → `Other("Not committing merge; …")` and `RepoState::Merge`; with D2 (a), a
  failing post-checkout → the checked-out message, from a branch, from a detached HEAD (the warning first) and on
  `worktree add`, and a silent failing hook → the message with no detail. The existing advice tests
  (`:1336-1381`) still pass.
- **Walk (BK 2):** a scratch repo with two diverged branches (each with its own commit, so a merge can't
  fast-forward), hooks written under `.git/hooks` (Git for Windows runs them without chmod). A two-line refusing
  pre-commit → commit in the app → the toast shows the last line, the dock both; a refusing pre-merge-commit →
  merge the other branch → *Not committing merge…* and the merge banner; with D2 (a), a failing post-checkout →
  checkout → *Operation failed* / *Checked out, but the post-checkout hook failed: …*, and the branch did change.

### 3. A custom tool that fails to start still says *Opened …* (§S, hotfix triage T2)

- **Code:** `spawn_tool`, `crates/git-core/src/tools.rs:287-342`; `detach` `:278-282`.
  - Windows (`:299-307`): started directly (no shell). A missing exe already fails the spawn and is reported
    (`:339`, *not found — check the tool's path*). Only a `.cmd` shim whose target is gone slips through.
  - Unix and macOS (`:308-328`): through `sh -c`, with a missing-program pre-check that skips programs starting
    with `~` or containing `$`, and checks `is_file`, not the execute bit. Slipping through: exit 127 (not found,
    or the loader's missing library — the 0.10.13 AppImage trigger), 126 (not executable), and `open -a Missing`
    on macOS (exit 1).
  - Callers hold the repo's `git2` lock for the whole call: `src-tauri/src/commands/tools.rs:67-68`,
    `src-tauri/src/commands/diff.rs:68-69`.
- **D3 — how to detect it.**
  - (a) Any non-zero exit within 300 ms. Catches `open -a`, but a launcher handing off to a running instance can
    exit fast with a "files differ" code (Beyond Compare 1/11/13, reasoned) → a false *failed*.
  - (b) Reply *Opened* at once and send a later event. No wait, but git-core callback + Tauri emit + a frontend
    listener (~40 lines) and two contradicting toasts.
  - (c) **Unix only, exit 126 / 127 within 300 ms** (~12 lines: poll `try_wait()` every ~20 ms under
    `#[cfg(unix)]`, then *<prog> could not start (exit N) — check the tool's command in Settings*, else `detach`).
    126/127 are the shell's and loader's "couldn't start" codes, so no false alarms. Misses macOS `open -a`.
  - (d) Accept → §Q, optionally with an execute-bit check in the pre-check (~3 lines; misses the loader case).
  - **Recommend (c).**
- **D4 — the 300 ms under the `git2` lock** (with D3 (c)). Every tool open on Linux and macOS waits ~300 ms, and
  other `git2` reads of that repo stall meanwhile.
  - (a) **Accept:** a user-started, once-per-open cost; a `ponytail:` comment names it, and (open-items §I's rule:
    accepted `ponytail:` limits live in §Q) a §Q row: *On Linux and macOS a tool open holds the repository's git2
    lock ~300 ms.* **Reopen:** a report of a stall while opening a tool — then narrow the lock (option (b)).
  - (b) Narrow the lock: build the sides under it, spawn after it's dropped (touches `open_diff_tool`,
    `open_merge_editor` and both commands).
  - **Recommend (a).**
- **When `try_wait` returns an exit**, the child is already reaped: return from there, don't `detach` it.
- Doc comments made true: `spawn_tool`'s *without waiting for it* (`tools.rs:284-286`), and `tests/tools.rs:1-4`
  (*Nothing here spawns a real tool* — the new tests spawn `sh`).
- **Still uncaught after the fix** (D17, taken 2026-10-01) → open-items §Q: *A custom tool that exits at once for
  another reason still shows Opened* — the Windows `.cmd` shim with a missing target, a user-typed macOS `open -a`,
  any early exit other than 126 / 127. **Reopen:** a report of a silent failed tool start.
- **Tests (`crates/git-core/tests/tools.rs`, `#[cfg(unix)]`):** `~/t4-no-such-tool` → `Err(Config)` naming 127;
  `sh -c "exit 126"` → Err; `sh -c "exit 1"` → Ok; `sh -c "sleep 2"` → Ok in under 1 s. The `MISSING` tests
  (`:15`, `:130-140`) are unchanged.
- **Walk:** Windows shows no change (unit + the existing tool steps, group R, `smoke-test-post-v1.md:404-446`).
  The Linux case (`~/nope "$LOCAL" "$REMOTE"` → error toast) goes with the Linux track's next walk, noted in
  open-items §V (*Docs moves*).

### 4. Menus: rows shift over a clipped name; the first item opens wrapped (§M)

- **What the user sees:**
  - (a) Arrowing through a menu onto a row whose name is clipped (over the 280 px max): the row grows to 2+ lines
    and every row below moves; off it, they move back.
  - (b) Arrow keys in the grid, then a **mouse** right-click: the menu opens with its first item highlighted and,
    if clipped (*Checkout <long-branch>*), wrapped. Seen on Windows in the AZ walk
    (`docs/archive/walks/2026-09-19-group-az-walk.md:62-64`); on Linux too since #18 (`data-kbd`, triage U3). Every
    `ContextMenu` shares it.
- **Code:** the wrap is on purpose, keyboard only: `src/components/ui/Menu/Menu.module.css:79-91`
  (`:focus-visible` / `[data-kbd]:focus` → `height:auto; white-space:normal`), `RevisionGrid.module.css:219-224`.
  (a) is built into "wrap the focused row". (b): `openedByKey()` (`Menu.tsx:81-84`) is true when the opener shows
  keyboard focus; after grid arrows it still does, a right-click doesn't move focus, so `useMenuDismiss` marks the
  first item (`:130-133`); and Chromium gives a script-focused item `:focus-visible` natively when focus came from
  a ringed element, so the CSS's `:focus-visible` half highlights it even without the mark. Tested on purpose:
  `Menu.test.tsx:73-82`; AZ 6's text (`smoke-test-post-v1.md:1873`).
- **D5.**
  - (a) **Fix (b), accept (a) → §Q:** a `ContextMenu` opened by a pointer never marks its first item — as native
    menus on Windows and GTK: right-click shows no highlight, Shift+F10 / the Menu key highlight the first item
    (`lastInputWasKey()` decides; a `byKey` parameter on `useMenuDismiss`, defaulting to `openedByKey`). And the
    menu-item highlight and wrap rules key on `[data-kbd]:focus` only, dropping their `:focus-visible` half
    (`Menu.module.css:68, 75, 82, 88, 124, 136, 159`, `RevisionGrid.module.css:221`), or Chromium still highlights
    through its own rule. **Keep** a `.item:focus-visible { box-shadow: none }` rule: the global ring
    (`src/theme/base.css:50-54`) otherwise lands on the natively `:focus-visible` first item (review pass 1). ~5
    lines TS, 8 selectors changed. Safe because every focus inside a menu goes through `focusItem` (explicit mark)
    or a click (clears it), and Tab closes the menu (read, and a grep: only these two files target menu items).
    The dropdown `Menu` (toolbar) keeps its opener rule. Then (a) happens only when someone arrows over a clipped
    name — the price of AZ 6's "wrap so the name can be read".
  - (b) Also fix (a): wrap clipped rows always, not only on focus (~10 lines CSS). A visible design change: taller
    menus for mouse users, the grid's two-half ellipsis (`RevisionGrid.module.css:204`) goes.
  - (c) Accept both → §Q.
  - **Recommend (a).** §Q row for (a): *Arrowing over a clipped menu row wraps it and moves the rows below.*
    **Reopen:** a report, or a menu whose rows commonly clip.
  - Comments that become false, rewritten: `Menu.tsx:68-73` (`focusItem`: a pointer-opened menu from a marked
    opener is still a keyboard menu — now the dropdown only), `Menu.tsx:80` (`openedByKey`'s doc), `kbdFocus.ts:1`
    (*which the CSS styles beside `:focus-visible`* — menu items no longer are).
- **Tests (`Menu.test.tsx`):** a `ContextMenu` opened from a marked, focused opener after a `pointerDown` → first
  item focused, not marked (fails at HEAD); Shift+F10 then open → marked; `:73-82` (dropdown) kept. The CSS half is
  the walk's.
- **Walk (BK 3):** AZ 6's fixture (a branch name over 280 px). Grid arrows, then a CDP right-click → the first item
  isn't `[data-kbd]`, is one line tall, has no accent background and a computed `box-shadow` of `none`;
  Shift+F10 → marked; arrowing onto the clipped row wraps it (the accepted shift). AZ 6's bottom-edge step still
  passes. **Docs:** AZ 6's step text (`smoke-test-post-v1.md:1873`) says a right-click after grid arrows opens
  with no highlight; `docs/smoke/smoke-cdp.md:93-95` (the note on this inherited highlight) is updated to match.

### 5. `Toolbar.tsx:100`: a repository switch in the `icons` tier measures late (§I)

- **What the user sees:** "a rename" is any change of `repo?.name`, in practice a tab switch or a Recent. In a
  window 700–1090 px wide, on a tab with a long name the toolbar is in the `icons` tier (no repo name; Branch and
  Stash under More). Switching to a short-named tab keeps `icons` although `tight` would fit, until the window is
  widened past the old breakpoint. (Long → short only; short → long is corrected before paint. Reasoned.)
- **Code:** `Toolbar.tsx:66-69` (`nameWidth` feeds `useToolbarTier`), `:96-104` (the measuring effect, `w > 0`
  guard), `Toolbar.module.css:19-25` (`.repoName`, `max-width:160px`), `:75-78` (`.icons .repoName
  { display:none }`), `layout.ts:43-44, 64-68`. In `icons` the span measures 0; taking the 0 would drop the tier to
  `tight`, which shows the name, which raises it back — the guard keeps the last real width, which is the stale one.
- **Fix (~3 lines CSS):** in `.icons`, hide the name with `position:absolute; visibility:hidden` instead of
  `display:none`: it keeps its width (up to 160 px) and takes no space; `visibility:hidden` also drops it from the
  accessibility tree (the button has `aria-label={repo?.name}`, `:210`). Split `.icons .repoName` out of the
  shared rule at `Toolbar.module.css:75-78` (`.icons .op [data-label]` keeps `display:none`). The guard stays for
  an empty name; the `ponytail:` comment goes, and so does `Toolbar.tsx:96-97`'s (*the tier itself brings the
  name back into view*). Same on WebView2 and WebKitGTK. Checked in review: the absolutely positioned span's
  width is min(text, 160) as in flow (same inherited font, no padding, `white-space:nowrap`), and the empty
  `[data-label]` flex item keeps the button's gap as with `display:none` today.
- **Tests:** none can fail first — jsdom has no layout (`getBoundingClientRect` is 0); `layout.test.ts` covers
  `toolbarTierFor`. Walk only.
- **Walk (BK 4):** two repos, `x` and a 30+ character name; `cdp.mjs --inner 1000`; long tab → `icons`; switch to
  `x` → `tight` (the `.tight` class, an inline Branch button; at HEAD it stays `icons`); back → `icons`; resize
  990 ↔ 1100 → no flapping.

### 6. `StashDialogs.tsx:39`: a submodule is listed as stashed (§I)

- **Measured** (scratch repo, a submodule `subs/a`):

  | Case | `git stash push` | After |
  |---|---|---|
  | submodule with edited files only, nothing else | *No local changes to save*, exit 0, no stash | submodule still changed |
  | the same + an edited file | stash made | submodule still changed |
  | submodule checked out on another commit, nothing else | *No local changes to save*, exit 0, no stash | still moved |
  | the same + an edited file | stash made | submodule still on the other commit |

  An **untracked nested repository** (also `submodule: true`, `index` null: `types.ts:522-525`, `status.rs:199`)
  with *Include untracked*: `git stash -u` prints *Ignoring path nested/* and leaves it in place (**measured**).
  So stash never changes a submodule's checkout or a nested repository. Stashing only submodule changes makes no
  stash, yet the app's *Stash 1 file* button runs and toasts *Stashed changes* (`stashPushOp`,
  `StashDialogs.tsx:57-58`); with other files the count is too high and the submodule stays in Changes.
- **Code:** `stashFiles` (`StashDialogs.tsx:35-43`) keeps any entry with `index` or `workdir` set; users
  `:49-52`, `:105-147`, `StashesDialog.tsx:41-42, 124`. Entries carry `submodule` and `submoduleDirtyOnly`
  (`src/api/types.ts:520-531`). A submodule entry can carry a staged pointer (`CommitPanel.test.tsx:918`); git
  stashes that (the index is saved and reset), so it stays listed.
- **D6.**
  - (a) **Leave out every submodule entry with no staged change** (`e.submodule && e.index === null`: dirty-only,
    moved and untracked nested repositories alike, as measured), plus one muted line *Submodules and nested
    repositories aren't stashed* when any was left out, on both push surfaces (`StashPushDialog` and the Stashes
    browser's inline form, `StashesDialog.tsx:119-126`). Only-submodule changes → *Nothing to stash*, button
    disabled, so no false toast. The `ponytail:` comment (`StashDialogs.tsx:39-40`) goes; `src/README.md:362-365`
    (what `useStashFiles` keeps) is updated. ~10 lines.
  - (b) Only dirty-only ones (the row's literal scope). Leaves the moved case wrong.
  - (c) Keep them listed, muted, *not stashed*, out of the count. More render code.
  - **Recommend (a).**
- **Tests** (in `StashesDialog.test.tsx`: status helper `:63`, *Nothing to stash* `:249`, the button-label tests
  `:136-243`): pure `stashFiles` cases: dirty-only excluded; moved excluded; an untracked nested repository excluded; a
  submodule with a staged pointer kept; a plain file kept. RTL cases, only a submodule changed: `StashPushDialog` →
  *Nothing to stash*, disabled button, the note; the Stashes browser (select its *Working tree* row first — with nothing
  stashable `wt` now starts false, `StashesDialog.tsx:41`, so the browser opens on stash@{0}, a correct change) → *No
  changes* (`:43`) and the note.
- **Walk (BK 5):** `docs/smoke/fixtures/bd2-fixture.sh` leaves both submodules moved (`:62-63`) in
  `${T4_ROOT:-/c/tmp/t4}/be` → Stash changes… → *Nothing to stash* + the note; edit `many.txt` → *Stash 1 file*
  lists only it; stash → the submodules still in Changes.

### 7. S4: `blameAt` acts before it knows the reveal hits (§I)

- **What the user sees:** `blameAt` (`src/screens/RepoWindow/actions.ts:177-188`) closes the commit dialog, switches
  to History, the Files tab, seeds the file and pins it, turns blame on — then awaits `revealOid` (`:187`). On a
  miss all of it stays, plus *Not in the current view — clear the filter*; the doc comment (`:172-175`) says
  "nothing but the toast happens then", which is false. Reachable (read):
  - from Changes: a text filter in History, switch to Changes (the filter stays, `ViewSwitch.tsx:20`), Blame on a
    modified file (`FileContextMenu.tsx:140`, at HEAD) with HEAD filtered out → History with *No commit
    selected*, an empty Files tab, blame on, the toast; from the commit dialog, the dialog closes too (the draft is
    kept in `commitStore`);
  - a stash preview's Blame (`FileRowMenu.tsx:86`, the stash oid): the blame shows correctly, but the walk never
    includes `refs/stash` (`walker.rs:36-37`), so the toast tells the user to clear a filter that doesn't exist.
  - Reasoned: from Changes, `DetailsPane` mounts on `setView` before the reveal returns and its `load` clears the
    pin (`diffStore.ts:252`); under a path filter the file then comes out wrong.
  - **Change review pass 5:** reveal-first alone fixes that only when the store held another commit. When it
    already holds the blamed one, `selectTreePathAt` applies the seed at once and leaves no pin, yet the pane still
    reloads it — it mounts (from Changes), its repo changes, or the reveal ends a compare — and the path filter's
    preselect overwrites the seed. Fixed: `blameAt` computes `reloads` after the reveal (not from History, another
    repo's store, or — pass 6 — a hit while the store still holds a `commitRange`: the reveal's own re-render may
    already have reloaded the pane) and `selectTreePathAt(oid, path, reloads)` pins through that load too. Tests:
    `diffStore.test.ts` (a seed on the current commit survives an announced reload; failed before the fix) and
    `actions.test.ts` (the flag is `false` in History on the shown commit, `true` from a compare still held after
    a hit, `false` once the reveal reloaded it or on a miss).
    Pass 7: History before *and* after the reveal (a view switch during it counts as a reload; the worst case
    is a stale pin, never an overwrite), and a tab switch during the reveal returns silently (the blame was the
    other tab's). Tests: a view switch during the reveal → `true`; a tab switch → no blame, no view change, no
    toast.
- **D7.**
  - (a) **Reveal first, act only on a hit (~10 lines):** before the await,
    `const t = treeTargetOf(useDiffStore.getState().target); const onScreen = t?.kind === "commit" && t.oid === oid;`
    (`treeTargetOf`, `diffStore.ts:101`, exported, maps a stash or a compare's `to` to a commit — the same test
    `selectTreePathAt` makes at `:373`); `if (!(await revealOid(oid)) && !onScreen) { toast; return; }`, then today's
    steps. If `DetailsPane`'s `load` runs before the seed, `selectTreePathAt` takes its current-target path (one wasted
    read); after it, the pin holds; both paths tested (`diffStore.test.ts:261`, `:308`). The view switch waits one
    reveal round trip (milliseconds). Fixes the miss, the wrong stash toast and the lost pin. Rewrite the doc comment
    (`actions.ts:172-175`, which explains why the seed came first) and `src/README.md:326-327` (*Files tab +
    `selectTreePathAt` + the gutter on, then `revealOid`*) for the new order.
  - (b) Toast only: skip the toast when `onScreen`, correct the comment (~3 lines); the miss's side effects stay.
  - (c) Roll back on a miss: flickers, can't reopen the dialog.
  - **Recommend (a).**
- **Tests (`actions.test.ts`, the *History and Blame from a file row* block, `:163-191`):** a miss → `setTab` and
  `setBlameOn` not called, view still `changes`, the commit dialog still open, the toast; a stash target + a miss →
  no toast, `setBlameOn(true)`. **Existing tests that change** (review pass 2): `ChangedFileList.test.tsx:240-251`
  checks `tab: "files"`, `blameOn` and `treeSelectedPath` right after the click (`:249`), before `revealOid` — it
  fails with reveal-first; `CommitPanel.test.tsx:817-818`, `FileContent.test.tsx:136-141` and `:174-176`
  (*Blame parent* → `treeSelectedPath` `"old.rs"`) check state after `waitFor(revealOid called)` and pass only
  because pending promises happen to settle. All four move their state checks inside `waitFor`.
  `FileContent.test.tsx:143`'s comment (*a toast, nothing else*) becomes true; its file comment at `:9` (*nothing
  here waits for them*) is reworded.
- **Walk (BK 6):** History text filter, switch to Changes, Blame on a modified file → the toast, view and tab
  unchanged; a stash preview's Blame → gutter on, no toast.

### 8. Q23: the details pane goes blank when another commit is selected (§Q)

- **What the user sees:** `CommitDetails` (`DetailsPane.tsx:170-182`) clears `detail` on every new oid; until
  `getCommit` answers, only the header shows (`info &&`, `:205`). `get_commit` is microseconds of work
  (`src-tauri/src/commands/repo.rs:239-246`) but takes the `git2` lock, so it can queue behind a status scan (1.5 s
  at 47k files). No log line times it. Holding an arrow key likely blanks a frame per step (reasoned).
- **D8.**
  - (a) **Show the grid row's fields at once (~5 lines):** the row's `CommitInfo` (`types.ts:56-68`; read as
    `rows[selectedIndex]?.row.commit`, as `DetailsHeaderCollapsed` does at `:117`) has summary, author, date, oid,
    short SHA and parents (the real ones, not rewritten under a path filter): render
    `info = detail?.info.oid === oid ? detail.info : rowCommit`, and gate body, committer and *signed* on the same
    match — `detail?.info ?? rowCommit` would show the previous commit's detail for the one render before the
    effect clears it, when the selection changes from outside (a reveal, a parent link). Body, committer and
    *signed* come with the reply. The error is keyed the same way (stored with its oid, shown only on a match);
    otherwise the previous commit's error shows for a frame (the effect clears it after paint, `:170-173`). The
    comment at `:171` (*Blank for the round trip*) is rewritten. Nothing stale: Copy SHA (`:193`) and the parent
    links (`:247`) are right at once. The body pops in below the summary.
  - (b) Keep the previous detail, dimmed: must make Copy SHA and the parent links inert, and still mismatches the
    row's chips — P1-4's complaint (CF:235).
  - (c) Blank after 150 ms: the same stale hazard for 150 ms.
  - (d) Keep as is (stays in §Q).
  - **Recommend (a);** the §Q row then moves to the done file's §Q.
- **Tests (`DetailsPane.test.tsx`, the pattern at `:126-138`):** `getCommit` for commit b returns a deferred
  promise → its summary and SHA show, the body doesn't; resolve it → the body shows. The unsigned-commit test
  (`:114-118`) becomes vacuous — `findByText("Ship it")` now resolves from the grid row before `getCommit` answers —
  so it waits for the reply (e.g. `await act(async () => {})` after the find) before checking *signed* is absent.
- **Walk (BK 7):** grid focused, ArrowDown ×20 over CDP with a `requestAnimationFrame` sampler: frames with the
  summary missing = 0. On a large repository — a `git/git` clone (the one Phase 3 will use) — with a background
  loop touching a file (e.g. every 200 ms) for the whole run, so status scans keep taking the `git2` lock (the blank
  is longest when `get_commit` queues behind one); and the same run against a build of `main` first, so the step
  shows the difference — on a small fixture both may read 0.

### 9. `walker.rs:94`: a `Refs` spec that never reaches HEAD (§I)

- **What it is:** with the working-tree row on, `LaneLayout::open(head)` reserves a column for HEAD
  (`crates/git-core/src/log/walker.rs:93-100`); `RevSpec::Refs` (`:78-86`) pushes only the named refs, so if none
  reaches HEAD the column runs to the bottom of the graph. **Unreachable from the UI** (read): it builds only `all` /
  `head` (`Toolbar.tsx:131`); `Refs` exists only in the TS type (`src/api/types.ts:119`), `statusStore.ts:104`
  (handled like `all`), `log/history.rs:53`, and tests (`crates/git-core/tests/log.rs:83, 114, 393, 397, 600`,
  `tests/serde.rs:23`, `history.rs:199`).
- **D9.**
  - (a) **Delete `RevSpec::Refs`** (~−40 lines): the Rust variant and its `content = "refs"` (`log/types.rs:131`),
    the match arms (`walker.rs:78-86`, `history.rs:53`), the doc mention at `walker.rs:36-39`, the TS member and its
    comment (`src/api/types.ts:118-119`), and the `Refs` assertions inside wider tests — no test exists only for it:
    `linear` (`log.rs:82-85`), `branch_and_merge` (`:114-115`), `tags_are_peeled_and_non_commit_tags_are_skipped`
    (`:391-404`, keep its `All` check at `:392`), `rev_spec_round_trips` (`serde.rs:21-24`), the args test
    (`history.rs:198-209`). Delete the assertions, not the tests. `statusStore.ts:104` only tests
    `kind !== "head"`: unchanged. `crates/git-core/tests/log.rs:596-611` (the `exact` case of
    `chunking_early_stop_and_cancellation`) uses `Refs` only to start a walk of exactly `CHUNK_SIZE` commits:
    rewrite it with `t.detach(exact)` (`test_util.rs:124`) and `RevSpec::Head`, don't delete it. The ceiling goes.
  - (b) Keep it, and open the column only when a pushed tip is HEAD or descends from it (~10 lines + a test).
  - **Recommend (a):** speculative and unused; a per-branch view would re-add it with (b).
- **Tests:** the `Refs` assertions go and the `exact` case is rewritten (above); `cargo test`, `tsc` stay green.
  Unit only.

### 10. `linked.rs:134`: no main row when the main worktree's HEAD can't be read (§I)

- **What it is:** opened from a linked worktree, the main row's path is `repo.commondir().parent()`
  (`crates/git-core/src/linked.rs:125-127`); the row is pushed only if that opens and has a HEAD (`:137`). An
  unborn HEAD still gives a row (`refs.rs:451-476`). The row is missing (reasoned) for a bare repository (right:
  no main checkout), a `--separate-git-dir` checkout (the parent isn't the checkout), a **submodule's** linked
  worktree (the common dir is `super/.git/modules/sub`), and a corrupt HEAD. The user sees no main row to click
  back to in the sidebar's Worktrees list.
- **The comment is wrong.** It says `worktree list --porcelain` fixes it at a git ≥ 2.36 floor. **Measured:** from
  a submodule's linked worktree, `git worktree list` names `.git/modules/subs/a` — the git dir — as the main
  worktree; git's own list has the same gap. (The app's floor is git 2.24, `MIN_GIT_VERSION`,
  `crates/git-core/src/lib.rs:179`.)
- **D10.**
  - (a) **Fix the submodule case + correct the comment (~5 + 3 lines):** open the common dir itself
    (`Repository::open(repo.commondir())`) and take its `workdir()`: libgit2 honours `core.worktree` (set in a
    submodule's config, so it points at the checkout) and `core.bare` (no row, as today). **Read** in libgit2 1.9.7
    (libgit2-sys 0.18.8), `repository.c` `load_workdir`: `core.bare` → no workdir (`:388`); `core.worktree` read
    (`:404-411`) and resolved against the git dir (`:436-440`) before the parent-directory fallback (`:441-442`);
    `--separate-git-dir` gets the same parent as today, so no change there. The exact replacement at
    `linked.rs:127`: `repo.commondir().parent().map(Path::to_path_buf)` →
    `Repository::open(repo.commondir()).ok().and_then(|r| r.workdir().map(Path::to_path_buf))` (libgit2's trailing
    `/` is already stripped by `row` → `normalize_workdir_string`, `repo.rs:33-36`). Rewrite the comment at
    `:131-135`: bare has no main row by design; `--separate-git-dir` is unknowable (git records the checkout
    nowhere; git itself lists the git dir); a corrupt HEAD gets no row.
  - (b) Correct the comment only, close the ceiling as won't fix.
  - **Recommend (a).** If the test shows otherwise, fall back to (b) and ask.
- **Tests (`linked.rs` tests, `TempRepo`; the submodule through `TempRepo::add_submodule`, `test_util.rs:209`,
  which clones through libgit2 and avoids git's `protocol.file.allow` refusal):** a submodule's linked worktree
  lists the submodule checkout as main; a bare repository's worktree has no main row.
- **Walk (BK 8):** the fixture stays as it is — adding a worktree to `sub` would give it a *Worktrees (2)* section and
  break AP's *Open* step (`smoke-test-post-v1.md:1523-1526`: opening `sub` shows no Worktrees section). BK 8 runs, after
  `linked-fixture.sh` (with `T=${T4_ROOT:-/c/tmp/t4}`, the fixture's default),
  `git -C "$T/linked/sub" worktree add -q --detach "$T/linked-wt/sub-wt"`; open `sub-wt` → the Worktrees list has the
  submodule checkout as its main row; right-click it → **Open** opens the submodule checkout (a plain click only
  reveals, AO `:1421-1422`). At the end, `git -C "$T/linked/sub" worktree remove --force "$T/linked-wt/sub-wt"`.

### 11. S2: non-UTF-8 paths (§I)

- **What the user sees** (read; Linux / macOS with a legacy-encoded name, e.g. Latin-1 `caf\xe9.txt`):
  - Files tab, working tree: missing (`crates/git-core/src/tree.rs:204-234`: a lossy decode at `:210`, the `stat`
    at `:219` misses, a silent `continue`);
  - Files tab at a commit: listed as `caf�.txt`, clicking fails (`:183`, `:238-242`);
  - Changes: listed as `caf�.txt`, staging and diff fail (`status.rs:114-117`, `:183`);
  - file history: empty.
  - Windows (reasoned): only through a commit made elsewhere; checkout and libgit2 conversion unverified.
  - The IPC paths are `String`; a byte-safe path across every command is out of scale.
- **D11.**
  - (a) **Files tab: skip them in both listings and say so** (~35 lines): `skipped: u32` on `TreeListing` (`tree.rs:57`;
    `TreeListing` in `src/api/types.ts:440`), one `tracing::warn!` per listing with the count (not one per path), the
    frontend carries it — a field on the `DiffStore` interface and its initial state, `diffStore.loadTree` (`:332-358`)
    keeps it, `load()`'s reset block (`:263`, beside `tree: null`) clears it (else the previous commit's count shows
    while the next loads), the tree cache (`remember` `:131-141`, the cached branch `:341-345`) stores it,
    `SNAPSHOT_KEYS` (`:399-421`) includes it, `diffStore.test.ts:20`'s `listing()` helper sets it, `src/README.md:85-91`
    describes it, `loadTree`'s other `set({ tree… })` branches (no target `:337`, error `:356`) clear it, the
    `treeCache` value type (`:122`) gains it — and the Files tab's tree component,
    `src/screens/RepoWindow/ChangedFileList/ChangedFileList.tsx` (`tree` at `:57`, its error at `:65`), shows *N files
    with names that aren't UTF-8 aren't shown*. Changes keeps listing them (hiding a change is worse than a failing
    stage) → §Q: *Changes lists a non-UTF-8 path under a replaced name; staging it, its diff and its history fail.*
    **Reopen:** a report.
  - (b) Log only (~6 lines): the listings agree, the user sees nothing.
  - (c) Accept all → §Q. **Reopen:** a report of a missing or unreadable non-UTF-8 file.
  - **Recommend (a):** a silent skip is what the row complains about; the Files tab can say it for little code.
- **D16 — a non-UTF-8 *directory*** (review pass 1): git2's `tree.walk` aborts when a directory's name isn't UTF-8
  (git2 0.21.0 `src/tree.rs:219-222`, `treewalk_cb` returns -1), so `commit_entries` fails and the Files tab at that
  commit shows an error, not a listing — today and after (a). **Taken 2026-10-01: fix** — `commit_entries` walks
  the tree itself (a recursive `tree.iter()` with `name_bytes()`, ~20 lines; recurse on `Some(Tree)` only, so
  submodule `Commit` entries stay as today; `list` sorts afterwards, `:169`, so order doesn't matter), skipping a
  non-UTF-8 entry and everything under it. **The count is files:** a skipped directory counts the files under it
  (keep walking it with a skip flag), matching the note's *N files*; on the index side a conflicted path's up to
  three stage entries count once (dedupe on the raw bytes, as `:213` dedupes paths). `tree.walk` has no other
  caller (`tree.rs:178` only); the `get_path` reads look a path up and don't abort.
- **Tests (`tree.rs`, `TempRepo`):** an index entry `b"caf\xe9.txt"` via `Index::add_frombuffer` (no file on disk,
  so every platform) and a commit tree via `TreeBuilder::insert`: both listings omit it, `skipped == 1`; a commit
  tree with `b"d\xe9/f.txt"` lists its other entries and counts the skip (fails at HEAD with an error).
- **Walk:** Linux only (`touch $'caf\xe9.txt'; git add .`) → the Linux track; Windows unit only.

### 12. B3: the interactive-rebase read pass runs a real `rebase -i --autostash` (§I)

- **What it is:** to list the todo, `rebase_todo` (`src-tauri/src/commands/ops.rs:425-504`) runs `read_args`
  (`crates/git-core/src/cli/rebase.rs:274-285`): a real `rebase -i` whose editor copies the todo out and empties
  it, so git stops with "nothing to do" and pops the autostash. `--autostash` only when the tree is dirty
  (`RebaseInteractiveDialog.tsx:47-49`). Reasoned from git's source: a kill after the autostash and before the
  editor exits leaves `rebase-merge/`, HEAD unmoved, a clean tree, and the changes only in the autostash commit;
  the app's banner then offers Abort, and `git rebase --abort` applies the autostash back (in a tiny earlier window,
  `git rebase --quit` saves it to the stash list).
- **Reachability:** the dock's Cancel is under the dialog's scrim (`OutputDock.tsx:33-36`, `Dialog.tsx:153`); quit
  doesn't kill git (no kill-on-close job on Windows, `runner.rs:505-545`; its own process group on unix, `:260`).
  Only an external kill, a crash or power loss in a sub-second window.
- **Why no fix:** dropping `--autostash` fails a dirty tree at git's clean-tree check (`tests/rebase.rs:116` relies
  on it); building the todo ourselves re-implements autosquash, `--rebase-merges` and `update-ref` lines
  (`rebase.rs:3-7` rules that out); a throwaway worktree costs a full checkout.
- **D12.**
  - (a) **Accept → §Q, with a unix test proving the recovery:** `a_read_killed_mid_editor_is_recovered_by_abort` in
    `tests/rebase.rs` (dirty tree; `sequence.editor` = an executable script file **outside the repository** (an
    untracked file in the work tree would survive the autostash and spoil the clean-tree check) that runs
    `kill -9 $PPID` — a path with no shell metacharacters, so git execs it directly and `$PPID` is git, unlike an inline
    `sh -c` whose outer shell may not exec; `rebase-merge/autostash` exists and the tree is clean; `git rebase --abort`;
    the changes are back). The argv is built by hand (`-c sequence.editor=<script> rebase -i --autostash <base>`:
    `rebase_args` is private, `cli/rebase.rs:248`, and `read_args` sets its own editor); `TempRepo::new()`, not
    `with_space()` — a space is a shell metacharacter to git. §Q: *A kill during the interactive rebase's read pass
    leaves the changes in the autostash until Abort.* **Reopen:** a stranded autostash is reported, or the dock's Cancel
    becomes reachable during the read.
  - (b) Accept without the test.
  - **Recommend (a).**

### 13. C6: `close_repo` never cancels the repository's running ops (§I)

- **What it is:** `close_repo` → `drop_repo` (`src-tauri/src/commands/repo.rs:166-201`) removes the handle and
  watcher and cancels the log walk, not ops. Ops live in `AppState.ops` (`src-tauri/src/state.rs:20`), not keyed by
  repository.
- **The comment is wrong** (`repo.rs:177-180`: the UI refusal leaves "nothing to cancel"). `refusedWhileRunning`
  (`actions.ts:228-232`) guards switch, tab close and detach, but **closing the window (× / Alt+F4) isn't
  refused**: `WindowEvent::Destroyed` → `on_window_destroyed` (`lib.rs:289`, `:122-129`) → `drop_repo`. So it is
  reachable: the op carries on to the end, invisibly (it holds its own `Arc<RepoHandle>`); a rebase or merge
  that stops on a conflict shows its banner when the repository is reopened. Reopening while it still runs makes a
  new handle with a new lock, so a second mutation could overlap it; git's `index.lock` catches most. (Update
  install is refused while any op runs, `update.rs:71`.)
- **D13.**
  - (a) **Accept → §Q and correct the comment (~4 lines):** letting the op finish is the safer failure — killing a
    rebase, merge or commit halfway strands exactly B3's state. §Q: *Closing a window lets its repository's running
    op finish unseen.* **Reopen:** overlapping operations after a reopen, or a request to stop an op by closing
    its window.
  - (b) Cancel on drop (~20 lines + a test: `begin_op` records the `RepoId`, `drop_repo` cancels those tokens).
    Turns a harmless orphan into a stranded rebase.
  - (c) Ask before closing a window whose repository has an op running (a `CloseRequested` guard). A new prompt;
    not sized.
  - **Recommend (a).**

### 14. R10: the selected-mode header after a partial stage (§I)

- **What it is:** the Changes header shows *Stage selected* / *Unstage selected* only while 2+ rows are selected
  (`useSelectedTarget`, `FilesColumn.tsx:56-65`), else *Stage all* with the whole list. X8 (P1-8, `84fdc82`) collapses
  the selection to one row after a header *… selected* action (`reseed`, `:78-82`; `CommitPanel.test.tsx:557-599`,
  smoke AD `smoke-test-post-v1.md:791-795`). R10 is the other way: the selection shrinks to one without a header action
  — stage one of two selected rows with its own +, or a watcher refresh drops one — and the header silently becomes
  *Stage all*. A click then stages everything. The label is true when clicked, and Unstage undoes it.
- **D14.**
  - (a) **Accept → §Q.** §Q: *After a selection shrinks to one row by itself, the header offers Stage all.*
    **Reopen:** a walk or report stages the whole list meaning the shrunken selection.
  - (b) A sticky selected mode (~8 lines in `commitStore` + tests): a `multi` flag set by a 2+ selection, cleared by
    a one-row `select()` (so X8 holds), kept while pruning leaves survivors; the header stays *Stage selected* at
    one row. Changes smoke AD's documented model (its *at one row … Stage all* wording).
  - **Recommend (a):** the button says what it will do, the action is undone by Unstage, and (b) adds state to a
    finely pinned model.

### 15. R12: two stale status/refs pairings (§I)

- **What it is** (CF:427; the lines there have drifted): the status (`statusStore`) and the repository state
  (`repoStore.refs`) refresh separately; after a watcher refs event both reads start together (`statusStore.ts:167`),
  but the refs read lands first and the status scan can take up to ~1.5 s; `commit()` refreshes status, then refs
  (`commitStore.ts:524-537`). All reasoned; nothing was hit in the app.
  - **Pairing 1, `canCommit`** (`MessageColumn.tsx:52-53, 74, 209`): staged count (status) + merging (refs). After
    an external merge abort, Commit is briefly enabled on the old staged count; git refuses and a failure toast
    shows.
  - **Pairing 2, conflicts** (`CommitPanel.tsx:95, 97-98, 113-114`): `conflicted` (status) + `merging` / `sides`
    (refs) drive the Keep-side buttons and `stranded`, the *Marked resolved, but the conflict markers are still
    here* note with **Restore conflict**, which runs `git checkout --merge -- path` (`stage.rs:249`). In
    `commit()`'s window (status fresh, refs still *merge*) with markers still in the file, Restore conflict is
    offered; on a finished merge that likely overwrites the file from the index (reasoned; behind an `ask()`
    confirm).
  - A guard exists: `freshStatus(status, refs.state)` (`src/lib/freshStatus.ts:11`); guarding everything greys buttons
    for one status scan at every merge/rebase start and end — the flicker CF meant (`RevisionGrid.tsx:47-50` is
    unguarded for that reason).
- **D15.**
  - (a) **Guard `stranded` only; accept pairing 1 → §Q** (1–2 lines): `stranded` also needs
    `freshStatus(status, state) !== null`. It only changes anything during a state change, so no steady flicker, and
    it closes the one path that could overwrite a file. §Q: *Commit can be enabled for a moment after an external
    merge abort; git refuses.* **Reopen:** a failure toast traced to that window.
  - (b) Also guard `canCommit`: Commit greys for one status scan at every merge / rebase start and end.
  - (c) Accept both → §Q.
  - **Recommend (a).**
- **Tests (`CommitPanel.test.tsx`):** the existing stranded-note test (`:396-400`) sets refs `state: "merge"` over
  `STATUS`, whose `state` is `"clean"` (`:103`) — exactly the new negative case, so it would fail: give it a status
  with `state: "merge"`. New: the same setup with the `"clean"` status → no *Marked resolved…* note. Unit only (a
  window of one status scan). (Restore conflict's command is built in `recreate_conflict`, `stage.rs:243`.)

### 16. The Stashes browser opened from Changes previews History's commit (found in the BK walk, D18)

- **What the user sees:** with a commit selected in History, switch to Changes and open the Stashes browser
  (Ctrl+Shift+S): the previewed stash's file list and diff are that commit's. Apply / Pop / Drop act on the stash
  (`preview.index`), above another commit's diff. Pre-existing (on `main` when a stash row is clicked); row 6
  makes the browser open straight on stash@{0} when nothing is stashable, so it shows at once.
- **Cause** (read): only `DetailsPane`'s effect calls `diffStore.load` (`DetailsPane.tsx:35-52`), and it is
  mounted in History only (`RepoWindow.tsx:140-151`); the browser's `ChangedFileList` / `CommitDiff` read
  `diffStore`. The same stale target reaches the browser's *Open in diff tool*, its file row menu and `blameAt`'s
  on-screen check.
- **D18, taken 2026-10-01: (a) the small fix** — `StashesDialog` loads `{ kind: "stash", oid }` itself, keyed on
  the preview's oid, skipping the load when `diffStore` already holds that stash (History, where the pane loaded
  it). Not taken: (b) lifting `DetailsPane`'s loader into an always-mounted hook (~20 lines moved), (c) defer.
- **Test (`StashesDialog.test.tsx`):** with `diffStore` on another commit, opening loads stash@{0} and clicking
  stash@{1} loads it (failed before the fix); with the store already on the stash, no stash is fetched again
  (fails without the guard). **Walk:** BK 9.
- **D19, taken 2026-10-01 (change review pass 2): fix `diffStore.restore`.** Loading in Changes made a reply in
  flight during an outside tab switch reachable: on a switch to an open tab (`activate`, `closeTab`, `openTab` of
  an open repo — the paths through `restore`) it landed in the other tab's store, and the first tab came back
  stuck on *loading*. `restore` now bumps the five request counters, and a snapshot taken mid-load comes back with
  `target: null`, so the next loader (History's pane on its reload, the browser's check on its next open) loads
  it again. A tab dropped in from another window opens a new repo without `restore`; its late reply still lands,
  but tagged with the old `repoId`, which the browser's guard and History's reload both see (change review
  pass 3), and the stuck-loading half is fixed there too.
  Test (`diffStore.test.ts`): the late reply is dropped, the mid-load tab comes back with no target (failed
  before the fix). Not taken: accept to §Q.

## Smoke group BK

Written into `docs/smoke/smoke-test-post-v1.md` after BJ, one step per walk bullet above (BK 1–9, numbered in
execution), walked over CDP on a local `tauri build --no-bundle` of `phase-2b` (`smoke-cdp.md`; the store backed up
first, restored byte-exact after). Linux-only steps (row 3's Linux case, row 11) go to open-items §V for the Linux
track.

## Release and gate

**Done 2026-10-01, both platforms:** v0.10.15 released; the Windows gate passed (BH 12, Install's confirm,
the crash-breaker clear, the signature); the VM's AppImage walk passed too, with the first restart-by-itself, and
AC ticked (`docs/archive/walks/2026-10-01-v0.10.15-release-gate.md`,
`docs/archive/walks/2026-10-01-v0.10.15-release-gate-linux.md`).

- Version: the owner names it at release time (the `release` skill). The Release run waits for approval under
  *Actions › the run › Review deployments* (the `signing` environment).
- The gate (close-out plan, *Gate after every close-out release*), on the user's installed 0.10.14:
  - before Install: Ctrl+Shift+N → the new window shows the update badge → tick BH 12; type a commit message, then
    Install asks before dropping it (open-items §B);
  - after: the first launch shows no crash toast (§P's update clear); `Get-AuthenticodeSignature` on
    `%LOCALAPPDATA%\T4 Git UI\t4-git-ui.exe` → `Valid`, thumbprint `F06C1EC1FAC43DFEC92FBE47B0FC959D1CE38151`;
  - the VM: the AppImage 0.10.14 updates in place **and restarts by itself** (the first update that can) → tick AC
    (`smoke-test-post-v1.md:761`).
- **After the gate:** a gate record `docs/archive/walks/<date>-v<version>-release-gate.md` (as
  `2026-09-29-v0.10.14-release-gate-linux.md`), and a docs commit on `main` (pushed on the owner's word):
  - open-items §B's unticked count (`:34-38`) four → two (AZ 11's `:1879`, `:1882`) once BH 12 and AC are ticked;
  - §B *Install's confirm over a typed commit message* (`:39-41`) → done §B;
  - §P's AC row (`:229-234`) and the AppImage blank-window row (`:292-315`, *pending the release walks*, its
    *Left* list) → done §P;
  - the close-out plan's gate section (`:141-147`, the Windows gate; `:149-168`, *At the release after*, *Then tick
    AC*) and the crash-breaker update clear (`:176-177`) marked done;
  - the close-out plan's *Status* and *Order* 5; the Status line carries that the update from 2b's release to the
    next is `requireSignedVersion`'s first real check (close-out plan `:146-147`).

## Docs moves (in the branch's docs commit; the post-gate ones are under *Release and gate*)

- open-items: each fixed row → `open-items-done.md` (its section); Q23 → done §Q (D8 (a)); §R's Ctrl+Q → a new
  done §R (the done file has none yet, it goes Q → S); §S's two rows → done §S; row 16 → done §V; the close-out
  plan's Phase 2 table strikes each row with its commit.
- **New §Q rows** (each with its trigger as written in its row; the origin keeps a pointer): row 3 D4 (the git2
  lock ~300 ms, with its `ponytail:` comment); row 3 D17 (other early tool exits still say *Opened*); row 4 (a)
  (the row shift over a clipped name); row 11 (Changes lists a non-UTF-8 path under a replaced name); row 12 (B3);
  row 13 (C6); row 14 (R10); row 15 pairing 1 (`canCommit`).
- §I's `ponytail:` list (`open-items.md:113-124`): four more ceilings leave (`walker.rs:94`, `linked.rs:134`,
  `Toolbar.tsx:100`, `StashDialogs.tsx:39`); update its count line (*seven added … three fixed*).
- New rows for the Linux track, in a new open-items section **§V** *Added 2026-10-01 — close-out Phase 2b* (§R is
  Phase 2a's; the done file already has §T and §U): row 3's Linux walk, row 11's Linux walk; and a bullet in the
  close-out plan's *Linux track* (`:253-275`) pointing at them, as Phase 2a's Esc and Super checks are there
  (`:266-269`).
- open-items intro (`:6-7`): *two* §Q rows also in a close-out phase → one (`status.rs`), once Q23 leaves §Q.
- The close-out plan's `:38`: *§A–§S* → *§A–§V*.

## Not in this phase

- §S's bulk review of the hotfix's 21 accepted items (the owner, when time allows).
- ssh fail-fast, T5, T7, the restore hang (the Linux track).
- The tauri-cli 2.12.0 bump (§P).
- §R's two other rows: *Esc after a self-disabling control on WebKitGTK* (the Linux track) and *macOS
  Option-typed type-ahead* (Phase 5). Only §R's Ctrl+Q row is this phase's.

## Triage

Every ruling from the owner's 2026-10-01 triage pass, one line each, with its destination.

- **FE5** (stash note shown with untracked off): verified not real, closed — no ruling needed.
- **A1** (row 11's frontend `skipped` count: untested plumbing + banner text): FIX (~25 lines: the count survives
  the tree cache and resets on reload; the banner's render and plural wording).
- **A2** (row 7's path-filter blame fix: unit-only proof): ACCEPT the unit proof → `open-items-done.md` §V.
- **A3** (the tab-switch-during-reveal guard, added in review): KEEP.
- **A4** (a redundant `tier` dependency in `Toolbar.tsx`'s measuring effect): LEAVE → `open-items-done.md` §V.
- **B1** (a mouse-opened menu's unmarked first item still activated by Enter): → `open-items.md` §Q, reopen on a
  report of an unintended action from Enter after a right-click.
- **B2** (the non-UTF-8 skip count includes deleted files): ACCEPT, closed → `open-items-done.md` §V.
- **B3** (a post-checkout hook's own `error:` / `fatal:` line shows without the "Checked out" wording): ACCEPT,
  closed → `open-items-done.md` §V.
- **B4** (a dev-only StrictMode double mount of `DetailsPane` under a path-filtered blame): → `open-items.md` §Q,
  reopen if it confuses development.
- **C1** (a blame reveal A→B→A within one loop can lose its seed): ACCEPT, closed → `open-items-done.md` §V.
- **C2** (a drop-in tab's late `diffStore` reply tagged with the old `repoId`): ACCEPT, closed →
  `open-items-done.md` §V.
- **C3** (the §V placement for the Linux-track rows, and leaving the BK 8 fixture untouched): RATIFIED, as
  proposed.
- **C4** (BK 8's worktree path refused by a local hook): NOTE it in the BK 8 walk text (fall back to a scratch
  folder if refused).
- **D-1** (the Stashes browser's blame-gutter drill-down): DEFER → `open-items.md` §V.
- **D-2** (a closed browser leaves History on the stash): DEFER → `open-items.md` §V.
- **D-3** (rapid tab switching lands on HEAD): DEFER → `open-items.md` §V.
- **D-4** (`treeSelection` keys shared across repos; a last-tab close in Changes keeps `diffStore`): DEFER →
  `open-items.md` §V.
- **E1** (the merge banner's wording after a hook refusal): DEFER → `open-items.md` §V.
- **E2** (the Stashes browser's left column clipping): DEFER → `open-items.md` §V.
- **E3** (Lock… offered on the main worktree row): DEFER → `open-items.md` §V.
- **E4** (a fresh repo selects the top grid row): ACCEPT, closed → `open-items-done.md` §V.
- **F1** (Alt+2 in the History search box): DEFER → `open-items.md` §V.
- **F2** (the empty-session `lastOpen` fallback on first launch only): DEFER → `open-items.md` §V (confirm
  the fallback's rule).
- **F3** (a tab's × near centre on a narrow tab): ACCEPT, closed → `open-items-done.md` §V.
- **F4** (a Vite build-chunk-size warning): ACCEPT, closed → `open-items-done.md` §V.
- **Flake** (§Q blame-helper row's trigger fired twice on 2026-10-01): DEFER → `open-items.md` §V.
- Every other reviewer "fine / acceptable / not a finding" item: no record needed (verification only).

## Decisions

Taken by the owner 2026-10-01, before the first review pass: **every recommendation** — D1 (a), D2 (a), D3 (c),
D4 (a), D5 (a), D6 (a), D7 (a), D8 (a), D9 (a), D10 (a), D11 (a), D12 (a), D13 (a), D14 (a), D15 (a). D12–D14
are accepts against the 2026-09-26 rule (§I rows fixed, not closed); the owner ruled each one by one.

From review pass 1, taken 2026-10-01: **D16** fix the non-UTF-8 directory case (row 11); **D17** row 3's
remaining uncaught tool starts → §Q with a trigger.

From the BK walk, taken 2026-10-01: **D18** fix the Stashes browser's preview (row 16), the small fix.

From change review pass 2, taken 2026-10-01: **D19** fix `diffStore.restore` (row 16).
