# Plan: "Checkout `origin/x`" in the commit menu's first group, 2026-10-15

_Written 2026-10-15. Status: decisions P1–P4, F1 and the duplicate-row rulings RA, RB, RC, RX taken with the owner;
review pass 4 clean. Executed 2026-10-15, smoke group BT walked (`docs/archive/walks/2026-10-15-bt-walk.md`).
Change review loop 2 (R2 below) done 2026-10-15: its second pass's rulings are in `open-items-done.md` §AL. Squashed
to `85e5c4e` (feat) and `9223b96` (fix) plus the docs commit; §AL has the squash map._

**Done 2026-10-15:** shipped in v0.10.24 (bump `68a050c`, Release run 38716006592). The commit hashes above are
pre-squash unless the squash map says otherwise.

**Goal:** right-clicking a commit where a remote branch (`origin/x`) sits always offers **Checkout `origin/x`** in the
menu's first group, next to **Checkout (detached)**. It does what a CLI user types: `git checkout -B x origin/x`. Today
that item exists only when no local branch tracks `origin/x`. When one does, v0.10.22's item ("Checkout `x`" /
"Checkout local…", plan `docs/archive/plans/2026-10-07-checkout-remote-elsewhere-plan.md`) sits in the second group
under the reset rows, and nothing is offered when the tracker is the current branch.

## What's there today (verified)

- `commitMenu.ts:94-124` loops over every remote branch `rb` at the commit. Its trackers are the local branches with
  `upstream === rb.name`, else the one with the same short name. `fresh` = trackers elsewhere, not offered under another
  remote already. `head` (the current branch among them) gets a `reset` entry only. `movable` = `fresh` minus `head`,
  minus branches checked out in another worktree, empty mid-rebase / mid-bisect (`frozen`); it feeds both a `reset`
  entry and a `checkoutReset` entry. No tracker at all → `checkout.push({ name: rb.name, remote })`, the first group's
  existing "Checkout `origin/x`" (`checkoutRemoteBranch`, `git checkout --track -b x origin/x`).
- `RevisionGrid.tsx:343-357` renders a `checkoutReset` entry: one candidate → "Checkout `x`" (`checkoutMoved`:
  ahead/behind first, `ahead === 0` runs `checkoutAndResetBranch` at once, else the `checkoutReset` dialog); several →
  "Checkout local…" / "Checkout other local…" (`besideCurrent`), the `checkoutLocal` picker. `RevisionGrid.tsx:459`
  places them right after each non-current reset row, in the second group.
- `actions.ts:66-69` `checkoutAndResetBranch(branch, target, expect)` runs `git checkout -B <branch> <target>` with the
  backend's `expect_branch_at` guard (`ops.rs:699-704`): refused if the branch moved since the counts. Its toast:
  `Checked out <branch> at <target.slice(0, 7)>`.
- `OpsDialogs.tsx:616-737`: `CheckoutResetDialog` (title "Checkout `x`") and `CheckoutLocalDialog` (title "Checkout
  local branch" / "Checkout other local branch") take one `target` used both for the run and, in the picker, for
  `ipc.aheadBehind`. `refs::ahead_behind` (`refs.rs:241`) parses both sides as oids only.

## Measured (git 2.55.0.windows.1, scratch repos)

- `checkout -B x origin/x` and `checkout -B x refs/remotes/origin/x` both set `x`'s upstream to `origin/x`: a branch
  tracking `fork/x` before is switched to `origin/x`; one with no upstream gets it. `--no-track` keeps it (not used,
  P3).
- On the current branch, behind `origin/main`: `checkout -B main refs/remotes/origin/main` with an uncommitted edit to a
  file the move changes → exit 1, "would be overwritten", `main` unmoved. With an edit to a file the move doesn't touch
  → exit 0, `main` moved, the edit kept (`M g`).

- `merge --ff-only --end-of-options refs/remotes/origin/main` on the current branch, behind only (RB): a clashing
  uncommitted edit → exit 1, "would be overwritten by merge", `main` unmoved; a non-clashing one → fast-forwarded,
  edit kept, upstream unchanged.

Not measured: a local branch literally named `origin/x` shadowing the bare name — reasoned from git's ref lookup order
(`refs/heads/` before `refs/remotes/`); the full ref (P4) sidesteps it either way.

## Decisions (owner, 2026-10-15)

- **P1 — move every row the v0.10.22 change added to the first group.** Those rows are the checkout items ("Checkout
  `x`", "Checkout local…", "Checkout other local…"). The reset rows ("Reset `x` to `origin/x`…", and "Reset (other)
  local to `origin/x`…" with several trackers) existed before that change, which only relabelled the several-tracker
  case; they stay in the second group with the other branch moves (owner confirmed, Q1).
- **P2 — offered for the current branch too.** The current branch joins the candidates. Behind only → runs at once;
  ahead or diverged → the existing confirm dialog with the counts. "Reset `main` to `origin/main`…" stays as is.
- **P3 — like the CLI.** The command is `git checkout -B x <remote ref>`, so `x` ends up tracking `origin/x` as git sets
  it. Standing rule: this app wraps CLI workflows; side effects follow the CLI.
- **P4 — the full ref.** The target is `refs/remotes/origin/x`, like `checkoutTag`'s `refs/tags/<name>`
  (`actions.ts:75-76`).

## Design

1. **Label and place.** One item per remote branch with candidates, in the first group after the existing checkout
   items and before "Checkout (detached)", labelled **Checkout `origin/x`** with the remote chip (`MenuRef remote`), the
   same as the no-tracker item. One candidate → `checkoutMoved` as today; when its name isn't the remote's short name
   (`stripRemote`), the label reads **Checkout `origin/x` as `feat`** (F1), the CLI's `-B feat`. Several → **Checkout
   `origin/x`…**, the picker, which names each. `besideCurrent` goes from `checkoutReset` (the current branch is now
   a candidate, so "other local" no longer applies); the reset rows keep theirs.
2. **Candidates.** `commitMenu.ts`: checkout candidates = `fresh` minus other worktrees' branches, empty when `frozen`
   — i.e. `movable` plus `head`, except a behind-only `head` (Design 8). `reset` is unchanged. Doc comments on
   `CommitBranchActions.checkoutReset` and `commitBranchActions` updated ("not the current one" goes).
3. **Target vs counts.** The run takes the full ref; ahead/behind keeps the clicked oid (`refs::ahead_behind` takes
   oids). `CheckoutToRemote.remote` stays the short name for labels; the full ref is `refs/remotes/${remote}`. The
   `checkoutReset` / `checkoutLocal` dialog kinds gain `oid` for the counts, and `target` becomes the full ref.
4. **Dialog titles follow the item:** "Checkout `origin/x`" (or "… as `feat`") for both dialogs; the picker's `other`
   prop goes. Body text (`CheckoutResetText`) unchanged.
5. **Toast.** `checkoutAndResetBranch` succeeds with `Checked out x at origin/x` (the full ref minus `refs/remotes/`)
   instead of a 7-character slice of the target.
6. **Unchanged:** the `expect` guard, `refuse_mid_op`, the no-tracker item, the non-current reset rows, the Sidebar.
7. **RA — one Reset row for the current branch.** When `reset` holds a `current: true` entry (the current branch's
   remote sits here), the first group's "Reset `main` to here…" reads "Reset `main` to `origin/main`…" and opens
   `{ kind: "reset", target: "refs/remotes/<remote>" }`, the remote's full ref (R1; the second group's row ran its
   short name); that second-group row is no longer rendered. `pointer` (the second group's separator) stops counting
   a `current` reset entry, so the separator can't lead an empty run.
8. **RB — Fast-forward.** `commitBranchActions` gains `fastForward: string | null`: the remote branch (`origin/main`)
   when the current branch (`isHead`, not detached) tracks a remote branch here by `upstream`, its snapshot counts read
   `ahead === 0 && behind > 0`, and `refs.state === "clean"`. Then: the current branch is not a `checkoutReset`
   candidate; `canRebase` is false; and the menu skips the Merge row whenever `fastForward` is set (every merge or
   rebase onto this commit is the same fast-forward). The Merge row is drawn on `canApply` (`RevisionGrid.tsx:322, 385`
   as of `8fcf86e`), not on `merge`: emptying `merge` would only turn it into "Merge commit `<short>` into `main`…".
   `pointer` counts the Merge row by the same condition. Cherry-pick (also on `canApply`) stays. The Reset row
   (Design 7) stays. The menu shows **Fast-forward `main` to `origin/main`** first in the first group:
   `ipc.merge(id, "refs/remotes/origin/main", "only", false, null, <oid>)` (R2) through `runOp`, toast "Fast-forwarded
   main to origin/main". A short-name tracker (no `upstream`) has no snapshot counts: it keeps the plan's rows.
9. **RX — "Already in `main`".** On open, when the commit is not HEAD's own and HEAD isn't unborn, the menu calls
   `ipc.aheadBehind(id, oid, head.oid)`; `ahead === 0` means HEAD already contains the commit. Then Merge, "Rebase
   onto" and Cherry-pick render disabled, title "Already in `<current>`" ("HEAD" when detached). Until the answer, and
   on an error, the rows stay as today; an answer for a menu since closed or reopened on another commit is dropped.
   An operation running still disables every row with its own title, which wins.
10. **R2 — the remote ref guarded (owner ruled 2026-10-15: add it).** Every `-B` and `--ff-only` run from this menu
    carries the clicked oid (`expectTarget`); under the op lock, right before git, `refs::expect_ref_at` refuses with
    "`origin/x` moved since you looked — try again" if the remote ref no longer sits there. Other `checkout` / `merge`
    callers pass none. Scope (owner, loop 2's second pass): only those two are guarded. The menu's other moves by a
    remote ref's name — the Reset rows (Design 7's included), the no-tracker checkout, Merge and Rebase onto a remote —
    show no counts or commit, and their dialogs name the ref, so landing on its newest tip is what they say.

## Steps

1. `commitMenu.ts` per Design 1–2; `commitMenu.test.ts`: current branch now a candidate (alone, and with other
   trackers), `besideCurrent` gone from `checkoutReset`, worktree and `frozen` exclusions still hold.
2. `RevisionGrid.tsx` per Design 1, 3: items move to the first group, labels, full-ref target; `RevisionGrid.test.tsx`:
   order in the first group (before "Checkout (detached)"), nothing checkout-like left in the second group, the
   current-branch case, `checkoutAndResetBranch` called with `refs/remotes/...`.
3. `dialogStore.ts`, `DialogHost.tsx`, `OpsDialogs.tsx` per Design 3–4; `dialogs.test.tsx`: titles, counts asked with
   the oid, preview `git checkout -B x refs/remotes/origin/x`.
4. `actions.ts` toast per Design 5; `actions.test.ts`.
5. `crates/git-core/tests/ops.rs`: a real-git test of `-B` with a full remote ref — on the current branch (moves, keeps
   a non-clashing edit, refuses a clashing one) and the upstream set to the remote (P3).
6. Smoke group **BT** in `docs/smoke/smoke-test-post-v1.md` on the BQ fixture (`docs/smoke/fixtures/bq-fixture.sh`):
   placement, current branch behind (silent) / ahead (dialog), a picker, upstream after the move. BQ's walked rows keep
   their record; a note there points to BT for the new labels.
7. Design 7–9: `commitMenu.ts` (`fastForward`, the `checkoutReset` / `merge` / `canRebase` changes) with
   `commitMenu.test.ts` (behind-only upstream → `fastForward` set, merge and rebase gone, current branch out of the
   candidates; `behind 0`, a short-name tracker, a non-clean state → `fastForward` null); `RevisionGrid.tsx` with
   `RevisionGrid.test.tsx` (the single named Reset row and no second-group duplicate; the Fast-forward row first and
   its `ipc.merge` call; the three rows disabled with "Already in main" after a mocked `aheadBehind` of `ahead: 0`,
   enabled for `ahead > 0`, unchanged on a rejected call and for an answer arriving after the menu closed).
8. Smoke group BT gains rows for Design 7–9: the single Reset row; Fast-forward on a behind-only current branch
   (one click, branch at `origin/main`, upstream unchanged); a commit already in `main` → three grey rows with the
   hover note.
9. Gates: `npm run build` (tsc), `npm test`, `cargo test` (uppercase `F:/`).

## Duplicate rows in the commit menu (owner review, 2026-10-15)

Drawn on a throwaway canvas (claude.ai artifact `UxvyvuJJggVdC8Zu6bJKtW`). Right-clicking the commit a remote branch
sits on, with the current branch tracking it:

- **RA — two Reset rows, one dialog.** "Reset `main` to here…" and "Reset `main` to `origin/main`…" both open the
  `reset` dialog for the same commit (true before this plan too). **Owner: one row, in the first group where "to here"
  sits, reading "Reset `main` to `origin/main`…"; the second group's row goes.** Holds whether the branch is behind,
  ahead or diverged (owner, on C).
- **RB — current branch only behind (its `ahead` is 0, `behind` > 0 against that upstream).** "Checkout `origin/main`",
  Merge, "Rebase onto" and the Reset row all end at a fast-forward. **Owner: one "Fast-forward `main` to
  `origin/main`" row at the top, `git merge --ff-only --end-of-options refs/remotes/origin/main` (`ipc.merge` with
  `ff: "only"`), one click, no network (not `git pull`, which fetches and can land past the clicked commit). It
  replaces "Checkout `origin/main`"; Merge and "Rebase onto" go, since any merge or rebase onto this commit is that
  same fast-forward. The Reset row stays:** Reset exists only in this menu (checked: the sidebar and toolbar have
  none), and its soft/mixed modes have no other way in. A `--no-ff` merge stays reachable from the sidebar and
  toolbar. The upstream counts come from the refs snapshot, whose failed walk reads 0/0; requiring `behind > 0`
  makes that fall back to the plan's rows, never to a wrong fast-forward. With several trackers, the current branch
  leaves the "Checkout `origin/main`…" picker in this case (the new row covers it).
- **RC — current branch with its own commits.** "Checkout `origin/main`" (`checkout -B`) and the Reset row overlap but
  treat uncommitted edits differently. **Owner: keep both** (with RA's single Reset row).
- **RX — Merge / Rebase that would do nothing.** On a commit the current branch already contains, "Merge … into
  `main`…" ("Already up to date") and "Rebase `main` onto …" ("up to date") change nothing, and Cherry-pick makes an
  empty pick. **Owner: include all three, greyed out rather than hidden** (canvas board "Extra, how", option 1): the
  menu opens as today, asks git on open whether the commit is in HEAD, and on yes disables the three rows with the
  hover note "Already in `main`". Nothing moves under the pointer. Rejected: hiding them once git answers (the menu
  shrinks under the pointer) and a per-row flag in the graph (larger Rust change, a walk per graph load). Not
  measured: the walk's time on a large repository.

## Review

**Pass 1 (against `8fcf86e`).** Citations in "What's there today" checked. One finding:

- **F1 — the label can hide which branch moves.** "Checkout `origin/x`" says nothing of the local branch when it isn't
  named `x`: a `feat` tracking `origin/x`, or a second tracker `y` when `x` already sits at the commit (then the menu
  shows both "Checkout `x`" and a "Checkout `origin/x`" that actually moves and checks out `y`). A behind-only branch
  runs with no dialog, so nothing names it before it moves. **Owner: "Checkout `origin/x` as `feat`" when the names
  differ** (Design 1, 4; tests in steps 2–3).

**Pass 2.** F1's fix checked against Design and Steps; the no-tracker item and a candidate item can't both appear for
one remote (a short-name match is a tracker); the reset rows' `besideCurrent` stays and the existing "Reset other local
to `origin/main`…" assertion (`RevisionGrid.test.tsx:526`) keeps its reset half. No findings.

**Pass 3 (after the owner's duplicate-row rulings RA, RB, RC, RX).** One finding, fixed: Design 8 hid Merge by
emptying `merge`, but the row renders on `canApply` and would have read "Merge commit `<short>` into `main`…"; it now
skips the row on `fastForward`, and `pointer` follows. Checked: a `current` reset entry exists only when the current
branch sits elsewhere, so a synced commit keeps "Reset `main` to here…"; RX skips HEAD's own commit and an unborn
HEAD, where the three rows are already gone; the detached case reads "Already in HEAD". Measured `merge --ff-only`
with dirty files (above).

**Pass 4.** The Design 8 fix checked against `RevisionGrid.tsx:320-328`: `pointer`'s `canApply` term is the Merge
row's, Cherry-pick sits in the apply group with its own separator, so skipping Merge leaves no stray separator; RX and
RB never meet (a behind-only commit is not in HEAD). No findings.

**Change review, loop 2 (after the squash).**

- **R2 — the run can land on a tip nobody saw.** "Checkout `origin/x`" and "Fast-forward" ran against the remote ref
  by name, while the counts and the confirm dialog describe the clicked commit: a fetch from outside between the
  click and the run moved the branch past it. **Owner: add the guard** (Design 10), like `expect_branch_at` for the
  local branch.
- **Second pass, on the fixes.** Every first-pass finding resolved or ruled. New: no command-level test that
  `checkout` / `merge` run the guard before git (accepted, closed); the menu's other remote-name moves stay unguarded
  (accepted, scope recorded in Design 10); git resolves the ref again after the guard (accepted, closed); and three
  doc nits (line widths, a stale citation in Design 8, review numbers used as names in §AL), fixed.
