# Plan: the four app-wide rows from the checkout-elsewhere triage (§AG T7, T15, T17, T19), 2026-10-08

_Written 2026-10-08. Status: decisions D1–D5 taken by the owner 2026-10-08 (every recommendation); plan review pass 1: 5
should-fix and 9 nits fixed; decision D6 taken (the recommendation); plan review pass 2: 2 should-fix and 7 nits fixed
(one optional: real-git tests for revert and rebase, added); plan review pass 3: 3 should-fix and 5 nits fixed (smoke
group BR rewritten); plan review pass 4: 3 nits fixed; plan review pass 5: 2 nits and 1 optional fixed; pass 6 clean. Go
given 2026-10-08. Executed on `app-wide-fixes` (code `3a2c7d7`, `69b4c5e`, `9b2f4ac`, `38864f6`, `2f1155a`; docs
`1efe5f5`); change review pass 1: 1 should-fix and 3 nits fixed (`2f898b1`); pass 2: 1 nit fixed (`5a88649`); pass 3
clean. BR walked on Windows and Linux of `5a88649`, all four rows pass (`17a62a8`). Triage of the walk and the reviews
ruled by the owner 2026-10-08: W1 amends the §Q dialog row; W2, W6, C1, C2, C4 accepted with reopen triggers (§Q); W3,
W4, W5 accepted closed (done file §AG); X1–X4 (execution's departures: the Components canvas, the message helper, the
bisect test's setup, the revert state now tested) kept. Docs moves done (`77295c1`: §AG closed); the three claude.ai
canvases republished 2026-10-08. Squashed into four commits 2026-10-08; hashes here are pre-squash (map:
`open-items-done.md` §AG)._

**Goal:** close `open-items.md` §AG's four rows, found in the checkout-remote-elsewhere triage, which were there before
that change and reach across the app: fix the cut-off error toast (T7), stop a checkout from quietly dropping an
in-progress merge, cherry-pick, revert or rebase (T15), settle T17 (a dialog acting on a switched-to repo), and make the
status bar's "Clean" mean what it says (T19). Walk them as smoke group **BR** and release (v0.10.23 when the owner names
it).

Line numbers are as of `5ae281b`. **Verified** means read in the code or run; **inferred** means reasoned and not run.
Research: two read-only agents (T15's entry points, T17's repository switches), then re-read here; git's behaviour
measured with git 2.55.0.windows.1 in scratch repositories.

Branch: `app-wide-fixes` off local `main` (`5ae281b`). One commit per row while working, squashed at the end (step 7 of
`CLAUDE.md`).

## Summary

Rows are §AG's (§Z has a T15 of its own, the tooltip row): commits, the walk record and the done rows say "§AG T15".

| Row | Group | Today | Fix |
|---|---|---|---|
| T7 | A | The toast ends at "…would be overwritten by checkout:" | Name the files after the colon |
| T19 | A | The status bar says "Clean" beside "1 unstaged" | "Clean" only on a clean tree (D4) |
| T15 | B | A checkout mid-merge silently drops the merge | The backend refuses it (D1, D6) |
| T17 | B | Not reachable (below) | Close the row; a test pins it (D3) |

## A1. T7 — the error toast stops at git's colon

- **What the user sees:** a checkout (or merge, pull, cherry-pick) that would overwrite local changes fails with a toast
  that reads only `error: Your local changes to the following files would be overwritten by checkout:`. It never names
  the file. The output dock has the full text. Seen on both BQ 6 walks
  (`docs/archive/walks/2026-10-07-bq-walk.md:76-77`).
- **Why (verified):** `classify_failure` (`crates/git-core/src/cli/ops.rs:723-726`) picks the last `fatal:` / `error:`
  line and uses it alone as the message (`:749-750`). git prints the file names on the lines after it, indented with
  a tab, then `Please commit your changes or stash them…`, then `Aborting` (measured, git 2.55).
- **Fix:** when the picked line is an `error:` / `fatal:` line ending in `:`, append the indented lines right after it
  (in the raw `stderr`, before trimming), joined with ", ": the first three, then "and N more" if there are more.
  Example: `error: Your local changes to the following files would be overwritten by checkout: f.txt, g.txt, h.txt
  and 2 more`. Nothing else changes: conflicts, auth, non-fast-forward and the advice paths come before it or don't
  end in `:`. Mechanics: `rposition` on `lines` (whose indices match the raw `stderr.lines()` one for one, `:723`),
  then the raw lines from `i + 1` while they start with a tab or a space.
- **Limit (inferred):** when git prints two refusal blocks in one run (local changes, then untracked files), the last
  `error:` line is picked, so only the second block's files are named. The dock has both.
- **Same shape, so covered too (inferred from git's source wording, the untracked one not run):** `…would be
  overwritten by merge:`, `The following untracked working tree files would be overwritten by checkout:` (and `by
  merge:`), and pull's merge step.
- **D5 (taken: the recommendation, 2026-10-08):** whether to also append git's next sentence
  (`Please commit your changes or stash them before you switch branches.`). Recommended: no. The toast's title already
  says the op failed, the dock has the advice, and the sentence doubles the toast's length.
- **Tests:**
  - `ops.rs` unit tests beside `rejected_and_other` (`:1414`): one file; five files ("and 2 more"); an `error:` line
    ending in `:` with nothing indented after it (unchanged).
  - The real-git test `crates/git-core/tests/ops.rs:535-549` (case (c), a dirty `f.txt`): also assert, through the
    file's `failure(&out)` helper (`:92-95`), `OpFailure::Other { message }` with `message.ends_with("f.txt")`. That
    pins git's real output, not a hand-typed copy.

## A2. T19 — "Clean" beside "1 unstaged"

- **What the user sees:** with an edited file and no operation in progress, the status bar reads
  `1 unstaged · 0 staged` and then `✓ Clean`. Seen on the Linux BQ 6 walk.
- **Why (verified):** the last status item is the repository's *operation* state: `STATE_LABEL.clean = "Clean"`
  (`src/screens/RepoWindow/RepoWindow.tsx:36-37`), shown at `:501-504` whatever the working tree holds. "Clean"
  means "no merge, rebase, cherry-pick, revert or bisect in progress". The counts item (`:495-500`) is separate.
- **D4 (taken: the recommendation, 2026-10-08), the options:**
  - **(a) Recommended:** show the state item when an operation is in progress (as now), or when the tree is known
    clean: `state !== "clean" || (fresh !== null && fresh.entries.length === 0)` with
    `fresh = freshStatus(status, refs?.state)` (`src/lib/freshStatus.ts:11-12`, the one freshness rule; a scan from
    another state reads as "not known yet", never as clean, as `banners.ts:46` does). Otherwise nothing there. A
    clean tree still reads `✓ Clean`; a dirty one shows only its counts. Cost: one condition. Risk: none known;
    while the status is unknown (loading, or a scan from before an op ended) the item is hidden (inferred: a moment).
  - (b) Rename it to "No operation in progress". Cost: a word. Downside: long, in a narrow bar.
  - (c) Never show it when no operation is in progress. Loses the reassuring `✓ Clean` on a clean tree.
- **Docs it touches (verified by grep):**
  - `smoke-test-post-v1.md:511` (a ticked record) says "the status bar still says `Clean`" with a conflict in the
    tree. Under (a) that step would show the counts instead. A dated note under the row records the change; the
    tick stays.
  - `:498`, `:519`, `:1472`, `:2061` describe clean trees, so they stay true under (a) (inferred from their steps).
  - The design canvases show counts beside `Clean` on almost every screen: the `statusbar()` helper defaults
    `state = 'Clean'` (`docs/design/canvases/build/screens.mjs:142`, the item at `:154`), and about 20 callers pass
    `counts` with the state `Clean`, by default or explicitly (`docs/design/canvases/build/parts-screens/Main.mjs:29`,
    `…/parts-screens/States.mjs:58`, `docs/design/canvases/build/build-b.mjs:457-569`, …). Fix the helper once: no state
    item when `counts` is set and the state is `Clean`, as the app will. Then rebuild with both
    `build/build.mjs screens` and `build/build-b.mjs` (the helper feeds both; `build.mjs` alone rebuilds only the system
    set) and republish (the recipe in the `canvas-republish` memory).
  - Found in execution: the system set's Components sheet has a hand-written status bar (not the helper) reading
    `3 unstaged · 1 staged · 2 conflicted` beside `Clean` (`docs/design/canvases/build/parts/Components.mjs:250`).
    It now reads `⚠ Merge in progress`, the state its conflicts imply, which also shows the alert variant; rebuilt
    with `build/build.mjs` (the system set).
  - `docs/design/style-guide.md:107` (the `StatusBar` row) lists "the tree state (`CircleCheck` clean / …; Clean,
    Merge, …)": it gains "Clean only when the working tree is clean too".
- **Test:** `RepoWindow.test.tsx`'s `RepoStatusBar` block (`:90`): dirty + no operation → no "Clean"; clean → "Clean";
  merge + dirty → "Merge in progress".

## B1. T15 — a checkout during an operation quietly abandons it

- **What the user sees:** with a merge whose conflicts are resolved and staged but not yet committed, a checkout of
  another branch succeeds. The merge is gone (no banner, `MERGE_HEAD` deleted) and the resolved files are left staged
  on the other branch. Nothing warns.
- **The row is wider than written.** `open-items.md` §AG says the commit menu's checkout items "block only mid-rebase /
  mid-bisect". They don't block at all. What is blocked then is the *branch moves* (*Reset … to here*, and the
  checkout-elsewhere items that move a tracker, *Checkout `<branch>`* / *Checkout local…*, and *Reset `<branch>` to
  `<remote>`…* / *Reset local…* for a non-current tracker, all fed by `movable`: `frozen`,
  `src/screens/RepoWindow/RevisionGrid/commitMenu.ts:89`, `:113`, `:127-129`). Plain checkout has no state guard on any
  path (verified by the research agent, re-read here for the commit menu and the actions):
  - the commit menu (`RevisionGrid.tsx:305`, `:360-372`; its checkout-elsewhere items, `:336`, `:343-357`: a
    fast-forward's *Checkout `<branch>`* with no dialog, else the confirm dialog and picker below; mid-merge they are
    still offered, since `frozen` covers only rebase and bisect), the sidebar's menus (`Sidebar.tsx:637`, `:686`,
    `:744`) and double-clicks (`:298`, `:318`), the Checkout dialog
    (`src/screens/RepoWindow/dialogs/RefDialogs.tsx:355-356`, `:408-410`), the palette's *Checkout…*
    (`src/screens/RepoWindow/CommandPalette/commands.tsx:62`), *Create branch* with *Check out* ticked
    (`RefDialogs.tsx:60`), the checkout-elsewhere confirm dialog and picker (their submits, `OpsDialogs.tsx:653`,
    `:704`) and the detached-HEAD banner's checkout (`RepoWindow.tsx:362`, offered only in the clean state,
    `banners.ts:47`).
  - All of them reach one backend command, `checkout` (`src-tauri/src/commands/ops.rs:674-704`), through
    `ipc.checkout` (`src/api/ipc.ts:385`).
  - **A second path exists, unused:** `create_branch` with `checkout: true` runs `git checkout -b` through `cli_op`
    (`src-tauri/src/commands/ops.rs:814-838`, with its doc comment) and would skip the guard. Nothing passes `true` (the
    one caller, `RefDialogs.tsx:62`, passes `false`); the comments at `RefDialogs.tsx:58` and `ipc.ts:414` still
    describe it. See D6.
  - Other `git checkout` runs don't move HEAD and need no guard (verified by the review): `worktree add`,
    `checkout --ours` / `--theirs` (`stage.rs`), `recreate_conflict`'s `checkout --merge`. The app never calls
    `checkout` itself mid-rebase or mid-bisect (the banners use their own commands).
- **What git does (measured, git 2.55, a target branch at the same tree so nothing blocks the switch):**

  | In progress | `git checkout <branch>` | State after |
  |---|---|---|
  | Merge, resolved | succeeds, no warning | `MERGE_HEAD` gone, resolution staged on the new branch |
  | Merge, unresolved | refused: `you need to resolve your current index first` | unchanged |
  | Cherry-pick, resolved | succeeds, `warning: cancelling a cherry picking in progress` | `CHERRY_PICK_HEAD` gone |
  | Revert, resolved | succeeds, `warning: cancelling a revert in progress` | `REVERT_HEAD` gone |
  | Rebase, stopped | refused in the run (the target differed in the file); a compatible target **not measured** | — |
  | Bisect | succeeds | `BISECT_LOG` kept (normal: moving around mid-bisect is allowed) |
  | Merge, `git checkout -b new` | succeeds | `MERGE_HEAD` gone |

  For comparison, `git switch` refuses mid-merge (`fatal: cannot switch branch while merging`), and per git's
  source mid-rebase, cherry-pick, revert and `am` too (inferred from git's source; only the merge case run).
- **Fix:** one guard in the backend `checkout` command, under the op lock, before git runs: first in the `mutate`
  closure, ahead of the `expect_branch_at` check (`ops.rs:697-700`), so a moved `-B` branch mid-merge gets the merge
  refusal, not a "try again" that would only meet it next. A new `refs::refuse_mid_op(repo)` returns
  `GitError::Refused` when `RepoState::from(repo.state())` is `Merge`, `CherryPick`, `Revert` or `Rebase` (`Rebase`
  covers `am` too, `refs.rs:113-117`). The message follows the banner's buttons: `A merge is in progress — commit or
  abort it first` (likewise cherry-pick, revert), `A rebase is in progress — continue or abort it first` (the rebase
  banner offers Continue, Skip, Abort, `banners.ts:84-88`). `Bisect` and `Clean` pass; a bisect with a merge open
  reports `Merge` and is refused (libgit2 checks `MERGE_HEAD` first; inferred, not run). Why there: every live path
  above goes through it, it reads the repository itself under the op lock (`mutate`, `commands/stage.rs:76`; the
  frontend's `refs.state` can be a refresh behind), and a `Refused` error shows as "Checking out X failed" with the
  message as detail, the same path as BQ 7's "racer moved since you looked" (`refs.rs:1261`, walked).
- **D1 (taken: the recommendation, 2026-10-08): refuse, or ask first?**
  - **(a) Recommended: refuse**, as `git switch` does. The banner already offers Commit and Abort. Cost: the guard
    above. Risk: a user who means to drop the merge has to Abort first (one click on the banner).
  - (b) A confirm dialog ("This abandons the merge in progress; the resolved files stay staged"). Cost: a dialog wired
    into every checkout path, or a refusal with a "Checkout anyway" action that re-runs with a force flag. More code,
    and it keeps a one-click way to lose a merge.
- **D2 (taken: the recommendation, 2026-10-08): also disable the checkout items in the menus?**
  - **(a) Recommended: no.** The backend refusal covers every path, including double-click and the dialogs, and its
    toast says why. Disabling would touch the commit menu, three sidebar menus, two double-clicks, the dialog and the
    palette, and still need the backend guard for the dialogs and a stale `refs.state`.
  - (b) Yes, with the title "Commit or abort the <merge> first", as the `frozen` branch moves are hidden mid-rebase.
    More code in five files; clearer before the click.
- **D6 (raised by plan review pass 1; taken: the recommendation, 2026-10-08): the unused `create_branch --checkout`
  path.**
  - **(a) Recommended: remove it.** Drop `create_branch`'s `checkout` parameter, its `git checkout -b` branch and the
    doc comment's sentence about it (`src-tauri/src/commands/ops.rs:814-838`), the argument in `ipc.createBranch`
    (`src/api/ipc.ts:415-416`), its one caller (`src/screens/RepoWindow/dialogs/RefDialogs.tsx:62`) and test
    (`src/screens/RepoWindow/dialogs/dialogs.test.tsx:466`), and fix the two comments (`RefDialogs.tsx:58`,
    `ipc.ts:414`). Nothing is orphaned: `cli_failure`, `cli_op`, `gitops::checkout` and `ref_arg` keep other callers
    (verified by plan review pass 2). Cost: ~20 lines removed across 4 files. Why: it's dead, and a live-looking second
    checkout path is how a later caller would skip the guard. Risk: none known (no caller passes `true`, verified by
    grep).
  - (b) Guard it too: call `refuse_mid_op` there, which means moving it from `cli_op` into `mutate` like
    `checkout`. More code for a path nothing uses.
  - (c) Leave it: a known way around the guard.
- **Not covered:** a checkout typed in the app's custom-command box runs as typed (not through `checkout`). Inferred
  as intended: that box runs what the user types.
- **Tests:**
  - `crates/git-core/tests/ops.rs` (real git): a resolved merge → `refuse_mid_op` refuses and names the merge; a
    resolved cherry-pick, a resolved revert and a stopped rebase → each refuses; a bisect → passes; clean → passes.
    The existing helpers set each up (pass 3): the merge conflict at `:254-263`, the stopped rebase at `:299-312`,
    the cherry-pick at `:397-404`, a revert as at `:415-466` but onto a changed line for a conflict (staying
    `Revert` once resolved is inferred), and `ops::bisect_start` / `bisect_mark` (`cli/ops.rs:304`, `:311`).
  - Rust unit test for the message per state (merge, cherry-pick, revert: "commit or abort"; rebase: "continue or
    abort").

## B2. T17 — a dialog left open across a repository switch

- **The row says:** "every dialog reads the open repo when it confirms, not when it opened; … with a matching name and
  commit it would act on the wrong repo. Reasoned from the code, not observed."
- **Found (verified):** the half about reading at confirm time is true (`runOp` reads `useRepoStore.getState().repo`,
  `src/store/opsStore.ts:225`). But every way the window's repository changes closes the dialog first:
  - `tabsStore.activate` and `closeTab` (to another tab) go through `show()`, whose first line is
    `useDialogStore.getState().close()` (`src/store/tabsStore.ts:69-74`, `:122`, `:150`);
  - `openTab` closes it before it sets the new tab active (`:99`), and `openRepo` with a `summary` sets the new
    repository with no await before it (`repoStore.ts:332-338`), so there is no gap;
  - closing the last tab unmounts the repo window and its `DialogHost` (`RepoWindow.tsx:187`); the dialog store keeps
    its entry until the next `openTab` clears it (`:99`), with nothing mounted to act on it.
  - Every way in: the tab strip is under the dialog's scrim (inferred, from earlier work), shortcuts return early while
    a dialog is open (`useShortcuts.ts:39`), and the backend events that can fire anyway (a failed tab spawn,
    `App.tsx:175-187`; a tab adopted from another window, Windows only, `TabStrip.tsx:19-45`) both go through
    `openTab`. A second launch opens a new window (`src-tauri/src/lib.rs:153-162`); file-system events only mark a tab
    stale (`App.tsx:162-169`).
- **D3 (taken: the recommendation, 2026-10-08):**
  - **(a) Recommended:** close the row as not reachable (to `open-items-done.md` §AG, the correction above), and add a
    `tabsStore.test.ts` test that an open dialog is closed by `activate`, `closeTab` to another tab, and `openTab`.
    No test pins it today (verified: `tabsStore.test.ts` never mentions the dialog store). Cost: one test. Why: the
    row came from a reasonable reading of the dialogs alone; the test keeps a later refactor of `show()` from
    reopening it silently.
  - (b) Close it with no test. Cost: nothing.
  - (c) Bind each dialog to the repository it opened on anyway. Cost: every dialog. Not recommended: no path needs it.

## Smoke group BR

New group in `docs/smoke/smoke-test-post-v1.md` after BQ. Windows over CDP on a local `tauri build --no-bundle` of
`app-wide-fixes`, Linux under Xvfb with openbox; the Mac is not needed (no platform code). Fixture: the BQ fixture's
`dirty` case (`docs/smoke/fixtures/bq-fixture.sh`) for BR 1, and the same `bq` repository (it ends on `main`,
`bq-fixture.sh:51`) for BR 2–4, in order. Build it fresh before BR 1: a `bq` already walked through BQ won't match
(BQ 1 moved `behind` to `origin/behind`, so BR 3's *Checkout behind* would be a plain checkout, not the `-B`
fast-forward; BQ 2 and 3 moved `ahead` and `diverged`; BQ 8 leaves HEAD on `trio`, where BR 3's double-click on
`trio` does nothing, `Sidebar.tsx:298`).

1. **T7:** BQ 6's setup (`shared.txt` edited, check out a branch that changes it) → the toast names `shared.txt`.
   Then undo the edit.
2. **T19, no operation:** the clean tree → `✓ Clean`; edit any file → only the counts, no `Clean`; undo the edit →
   `✓ Clean` again.
3. **T15 and T19, a merge:** on `main`, `git merge --no-ff --no-commit ahead` (`ahead` touches only `ahead.txt`: no
   conflict, `MERGE_HEAD` set, the merge staged) → the status bar reads `Merge in progress`. Then each of these is
   refused with the toast naming the merge, the merge banner stays and `MERGE_HEAD` is still there:
   - *Checkout* `diverged` from the sidebar menu;
   - a double-click on `trio`'s sidebar row;
   - *Checkout multi-a* from the commit menu on `multi-a`'s row;
   - *Checkout behind* on the `origin/behind` row (a fast-forward, so no dialog: a `-B` with `expect`, offered
     mid-merge because `frozen` covers only rebase and bisect, `commitMenu.ts:89`, `:113-118`; it walks the guard
     running before `expect_branch_at`);
   - *Create branch* with *Check out* ticked.

   Then the banner's **Commit merge** → the panel's **Commit** → *Checkout* `diverged` from the sidebar menu now
   works.
4. **T15, bisect:** `git bisect start main main^` (HEAD detached on one of `ahead`'s commits) → *Checkout trio* on
   `trio`'s row → the checkout lands, the bisect banner stays, `BISECT_LOG` is kept. Clean up with
   `git bisect reset`.

## Release and gate

The release skill's gates; then the owner names the version (v0.10.23 expected). Before the first release after
2026-10-19, a Release dry run from `workflow_dispatch` (`open-items.md` §B, the `ubuntu-latest` move): if this ships
after that date, the dry run comes first.

## Docs moves (in the branch's docs commit)

- §AG T7, T15, T19 → `open-items-done.md` §AG as fixed, each with its walk. T15's row closes with the correction
  above (plain checkout was unguarded in every state, not only mid-merge).
- §AG T17 → `open-items-done.md` §AG as not reachable (D3), with the evidence above.
- §AG has no open row left: its heading goes, and §AG joins the "nothing open left" list in `open-items.md`'s intro.
- `smoke-test-post-v1.md:511`'s dated note (T19), `style-guide.md:107`'s clause, and the canvases' helper fix,
  rebuild (both builds) and republish (D4).

## Not in this batch

Every other section: §B (the updater log row, the 2026-10-19 dry run), §Q's accepted limits, §AE (focus, stash
preview, Mac ring), §AF (M1, L1), §Z (the macOS hint plan and T15/G3), §X, §V, §Y, §AA, §S, §E's dated rows, §C's
roadmap.

## Decisions

All taken by the owner 2026-10-08, each as recommended: D1 (a) refuse; D2 (a) no menu disabling; D3 (a) close + a
test; D4 (a) "Clean" only on a clean tree; D5 names only, no advice sentence. Plan review pass 1: D6 (a) remove the
unused `create_branch --checkout` path.
