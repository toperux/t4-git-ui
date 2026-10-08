# Plan: checkout a remote branch whose local tracking branch sits elsewhere, 2026-10-07

_Written 2026-10-07. Status: design settled with the owner (D1-D4 below, plus the multi-tracker shape), illustrated in a
canvas covering every case including a 50-tracker extreme. Review pass 1 (against HEAD `98c04ff`): 3 real problems in
the plan's own draft code fixed — the picker `Select` is this app's custom component, not a native `<select>` (right
conclusion, wrong reason); the proposed Rust command used `repoId` where every sibling command uses `id` (and its own
`ipc.ts` wrapper three lines later already assumed `id`); the proposed command returned a bare tuple, which no command
in this codebase does — all return a named struct, so `ahead_behind` now returns `AheadBehind { ahead, behind }`. Every
citation against `commitMenu.ts`, `RevisionGrid.tsx`, `actions.ts`/`ipc.ts`/`opsStore.ts` and
`crates/git-core/src/refs.rs` checked out accurate. Not yet checked: whether `commitMenu.test.ts` /
`RevisionGrid.test.tsx` have helpers that need extending (step 1/7) — a follow-up pass before execution. Review pass 2:
the 3 fixes landed clean (confirmed object-shaped `ahead`/`behind` used consistently throughout, no leftover tuple
usage); confirmed the existing fixture helper needs no extension for the D-multi test case and clarified the new
dialogs' test assertions aren't the existing `checkoutBranch` dialog's shape — both folded into the Steps below. No open
findings. Executed on the owner's go (`62e2c30`); post-build decisions taken 2026-10-07: E1 (a failed ahead/behind walk
was cached as 0/0 and read as a fast-forward → the command now walks directly and returns the error, `1c26d9a`), E2 (the
Reset row follows D2 too: one movable tracker named, several → "Reset local to `<remote>`…" with `ResetBranchDialog`'s
existing picker, `e048be4`), E3 (the picker's confirm button is primary on a fast-forward pick, danger otherwise or when
the counts are unknown — kept as built), E4 (change review pass 1: the two-step `git branch -f` + `git checkout` left
the branch moved when the checkout failed → one `git checkout -B <branch> <oid>`, which moves the branch only if the
checkout succeeds; upstream config survives, proven by a real-git test; `dd863a5`). Change review pass 2: no bugs; this
doc's §3 brought in line with E4, comment and test-diagnostic nits fixed. BQ walked on Windows and Linux (`201f136`,
rows 1–6 pass). Triage T1–T20 ruled 2026-10-07 (fixes `8944725`, `af99b76`; records in open-items §Q, §AG and
open-items-done §AG); BQ re-walked on both of `3784d36` (rows 1, 5, 6 and new 7, 8 pass); W5 (seen on that walk) and
N1 (a review nit) fixed (`439cf94`), R1 accepted._

**Done 2026-10-08:** shipped in v0.10.22. The commit hashes above are pre-squash.

**Goal:** right-clicking a commit that carries a remote branch ref (e.g. `origin/feature`) whose local
tracking branch (`feature`) already exists but currently points at a *different* commit offers no way to
check that local branch out here. Today the menu only offers **Reset `feature` to `origin/feature`…**,
which moves the branch without switching to it. Add a **Checkout** item next to it that switches to
`feature` and lands it on `origin/feature`'s commit, confirming first whenever that move is not a
fast-forward (and silently otherwise).

Branch: `checkout-remote-elsewhere` off local `main` (`98c04ff`).

## What's there today (verified)

- `src/screens/RepoWindow/RevisionGrid/commitMenu.ts:71-86` builds, per remote branch `rb` sitting at the
  clicked commit, its local counterpart `local` (by `upstream` match, else by same short name,
  `:75` — `.find()`, so only the *first* match; see "Multiple trackers" below). Three cases:
  - no `local` → pushed to `checkout` (`:81`) — already works, out of scope here.
  - `local.oid === oid` (local already here) → skipped entirely (`:79`) — nothing to add, the plain
    local-branch checkout item already covers it.
  - `local` exists elsewhere → pushed to `reset` only (`:84`), as a `ResetToRemote { branch, remote,
    current }` (`current = local.isHead`). **This is the gap:** no `checkout`-shaped entry is ever added
    for this case.
  - The `reset` push is itself gated: always when `local.isHead` (the checked-out branch can always take
    a `git reset`), otherwise only `!frozen && !checkedOut.has(local.name)` — not mid-rebase/bisect, and
    not checked out in another worktree (`git branch -f` refuses that). The new item must reuse this
    exact gate, and only for the `!current` half (a branch that's already current has no "checkout" left
    to do, only the existing reset).
- `src/screens/RepoWindow/RevisionGrid/RevisionGrid.tsx:409-425` renders `branches.reset` as **Reset
  `<branch>` to `<remote>`…**, opening `{ kind: "reset", target: r.remote }` when `r.current`
  (`ResetDialog`, soft/mixed/hard picker) or `{ kind: "resetBranch", branches: [r.branch], target:
  r.remote }` otherwise (`ResetBranchDialog`, plain `git branch -f`, no mode picker since nothing is
  checked out). Both dialogs already exist and already warn about losing commits; neither switches HEAD.
- `src/screens/RepoWindow/RevisionGrid/RevisionGrid.tsx:328-337` is the existing precedent for "1 candidate
  → direct item named with the branch; >1 → generic item opening a picker dialog", used today for plain
  local-branch checkout. The new feature reuses this shape rather than inventing a new one.
- `src/screens/RepoWindow/dialogs/RefDialogs.tsx:346-376` (`CheckoutBranchDialog`) is that picker: the
  app's own `Select` component (`:375`, `src/components/ui/Input/Input.tsx:107`) of candidate names, a
  help line reporting what the pick will do (`:374`). This `Select` is deliberately *not* a native
  `<select>` — `Input.tsx:101-102` notes a native popup is an OS window that ignores the page theme, so
  it's custom-drawn (its own open/active state, keyboard handling). It scales to any candidate count
  because `Input.module.css:85-86` gives its open list `max-height: 320px; overflow: auto`, not because
  the browser does it for free — confirmed against the 50-tracker case in the canvas, but that scrolling
  is this component's own existing CSS, already paid for by every other `Select` in the app.
- `src/screens/RepoWindow/actions.ts:52-58`: `checkoutBranch(name)` is `ipc.checkout(id, name, null,
  false)`. `ipc.resetBranch(id, branch, target)` (`src/api/ipc.ts:383`) is `git branch -f` on a branch
  that isn't checked out — exactly what today's non-current `reset` item already calls. (The draft
  sequenced it before a checkout; E4 replaced both with one `git checkout -B`.)
- No existing helper compares two arbitrary commits for ahead/behind. The only ahead/behind code
  (`crates/git-core/src/refs.rs:196-236`, `AheadBehindCache::get_or_compute`) is already generic over any
  two oids — it's keyed `(local tip, upstream tip) → (ahead, behind)` with no assumption that `upstream`
  is the branch's *configured* upstream — but it's a private method on a cache that only `refs.rs` uses
  today, called for the real snapshot's branches. It needs a thin command wrapper to be reachable from
  the front end for an arbitrary `(local.oid, rb.oid)` pair.
- Confirmation-dialog pattern: `src/screens/RepoWindow/dialogs/OpsDialogs.tsx`, `ResetDialog` (:505-556)
  and `ResetBranchDialog` (:562-612) — a `DialogText` explaining the consequence ("commits after `<short>`
  stay reachable only through the reflog"), a `gitCmd(...)` preview line, a danger-styled confirm button
  for the destructive path. A new dialog follows the same shape.

## Decisions (settled)

- **D1 — no reset-mode picker.** The branch isn't checked out before the move, and `git checkout -B` (E4)
  moves it and checks it out in one step, so there is no index or working tree of its own for soft/mixed/hard
  to treat differently. The dialog is a plain confirm/cancel.
- **D2 — label depends on candidate count.** Exactly one tracking branch → name it: "Checkout
  `<branch>`" (matching the existing "Reset `<branch>` to `<remote>`…" phrasing and every other checkout
  item in this menu). More than one → generic: "Checkout local…" (and "Reset local to `<remote>`…" for
  the sibling item), opening the picker from D-multi below.
- **D3 — keep both items.** **Reset `<branch>` to `<remote>`…** (moves the branch without switching) and
  the new **Checkout `<branch>`** (switches into it) are offered side by side; one never replaces the
  other.
- **D4 — silent on a clean fast-forward.** When the move loses no commits (`ahead === 0`), it runs
  immediately with no dialog — just the normal success toast `runOp` already shows, same as every other
  non-destructive checkout in this menu.
- **D-multi — more than one local branch tracking the same remote ref.** `commitMenu.ts:75`'s `.find()` only ever
  returns the first match; a second local branch explicitly set (via `git branch --set-upstream-to`) to track the same
  remote ref is possible, if unusual, and today it's silently left out of the menu entirely. Fix: enumerate every local
  branch with `upstream === rb.name` (fall back to the short-name heuristic, which can only ever produce one candidate,
  only when there are zero upstream matches — never mix both kinds of match into one list). Filter out any candidate
  already at `rb.oid` (same "already here" rule as today, just applied per-candidate instead of once). What's left: 0 →
  no change from today's behaviour; 1 → the direct, named item (D2); 2+ → the generic item, opening a picker
  (`CheckoutBranchDialog`'s shape, not its component — see Design §4) listing every remaining candidate with its current
  position (behind N / ahead N / diverged N·M) and the usual confirm, chosen row decided through the same ahead/behind
  logic as the single-candidate case. Picking a row and confirming always finalizes — there's no second, nested
  fast-forward dialog once you're already in the picker. Multiple *remotes* at the same commit: `commitMenu.ts`'s loop
  is per `(remote, remote-branch)` pair, so `origin/feature` and `upstream/feature` sitting on the same commit get an
  entry each, but one local branch can be a candidate under both (one tracks it, the other matches by short name). Each
  local branch is offered once (`offered`): under its own upstream when that also sits at the commit (`remotesHere`),
  otherwise under the first remote ref that names it. _Superseded draft: the two entries were fully independent, which
  offered such a branch twice; fixed in change review pass 1 (`dd863a5`)._

## Design

1. **Candidate enumeration.** In `commitMenu.ts`, replace the single `.find()` lookup with an inline filter that lists
   every local branch tracking `rb` (upstream matches, else the one short-name match), minus any already at `rb.oid`.
   Add `checkoutReset: { remote: string; candidates: CheckoutToRemote[]; besideCurrent: boolean }[]` (built as
   `CheckoutToRemote { branch, remote, localOid }`: `ResetToRemote` has no `localOid`, and its `current` would always be
   false here) to `CommitBranchActions` — one entry per remote branch that has ≥1 eligible candidate, where `candidates`
   is the (possibly singleton) list, each carrying `branch`, `remote`, and `localOid` (needed for the ahead/behind
   call). Gate each candidate the same way `reset`'s non-current push is gated today
   (`!frozen && !checkedOut.has(local.name)`); a candidate excluded by that gate is left out of the list entirely, same
   as today's single-candidate case disappearing rather than showing disabled. `reset` changes shape too (E2):
   `ResetToRemote` is now `{ branches: string[]; remote; current; besideCurrent }`. A current tracker gets its own
   `current: true` entry; every other movable tracker elsewhere goes into one `current: false` entry, the same set as
   that remote branch's `checkoutReset` candidates. `besideCurrent` is set on the `current: false` entry and its
   `checkoutReset` entry (never on the `current: true` one) when a current tracker sits beside 2+ others, so their
   generic items read "other local" (T5). _Superseded draft: `reset` kept its shape, one
   `ResetToRemote { branch, remote, current }` per remote branch, and `checkoutReset` was purely additive._
2. **Menu items.** In `RevisionGrid.tsx`, render one row per `checkoutReset` entry, right after its
   `reset` row:
   - `candidates.length === 1`: **Checkout `<branch>`** (icon `GitBranch`), same direct-action shape as the
     single-candidate case already used for plain local checkouts (`:328-331`). Click (async, inside `run()`): call
     `ipc.aheadBehind(id, candidate.localOid, oid)`; `ahead === 0` → run `checkoutAndResetBranch(branch, oid, localOid)`
     directly (D4); otherwise open the confirm dialog with the counts.
   - `candidates.length > 1`: **Checkout local…** (**Checkout other local…** beside a current tracker, T5), opening a
     picker dialog (new kind, see §4) with the full candidate list; the picker fetches every candidate's counts once, on
     open, and finalizes on confirm, no separate fast-forward short-circuit once inside it.
3. **Action**, `checkoutAndResetBranch(branch: string, target: string, expect: string)` in `actions.ts`:
   ```ts
   export const checkoutAndResetBranch = (branch: string, target: string, expect: string) =>
     runOp(`Checking out ${branch}…`, (id) => ipc.checkout(id, target, branch, false, false, true, expect), {
       success: `Checked out ${branch} at ${target.slice(0, 7)}`,
     });
   ```
   One `git checkout -B <branch> <target>` (E4; `ipc.checkout`'s `force` flag): the branch moves only if the checkout
   succeeds, so a refused checkout (e.g. a dirty file the switch would overwrite) leaves it where it was. Its upstream
   config is kept. _Superseded draft: `git branch -f` then `git checkout`, which left the branch moved when the checkout
   failed._

   `expect` is where the branch sat when the counts were taken (T1, from the triage). The Tauri `checkout` command takes
   `expect: Option<String>`; under the op lock, right before git runs, `refs::expect_branch_at` (peeled to the commit,
   like the snapshot's `Branch.oid`) refuses unless the branch still sits there, with
   `GitError::Refused("<branch> moved since you looked — try again")`; a missing branch is refused too. All three paths
   pass the candidate's `localOid`: the silent fast-forward, `CheckoutResetDialog` and `CheckoutLocalDialog`.
4. **Dialogs**, both modeled on `ResetBranchDialog`'s shape (no mode picker, per D1):
   - `CheckoutResetDialog` (kind `"checkoutReset"`; fields `branch`, `remote`, `target` = the clicked commit's oid,
     `localOid` (T1), `ahead`, `behind`) for the single-candidate path. `DialogText`:
     - `ahead > 0 && behind === 0`: "`<branch>` is ahead of `<remote>` by N commit(s). Checking it out
       here moves it back to `<remote>`; those commits stay reachable only through the reflog."
     - `ahead > 0 && behind > 0`: "`<branch>` and `<remote>` have diverged: N commit(s) only on
       `<branch>`, M only on `<remote>`. Checking it out here moves it to `<remote>`; the N commits stay
       reachable only through the reflog."
     - Confirm: danger-styled "Checkout and reset" → `checkoutAndResetBranch(branch, target, localOid)`.
   - `CheckoutLocalDialog` (kind `"checkoutLocal"`; fields `remote`, `target`,
     `candidates: { branch: string; localOid: string }[]`, `other?: boolean`) for the multi-candidate path: a `<Select>`
     of `candidates` with no default pick ("Pick a branch", the confirm disabled until one is chosen; the move can lose
     commits, so Enter must not run it against a branch nobody chose). Label per option computed from a fetched
     ahead/behind — fetch all candidates' counts once on open, not per selection, since the list is small enough and
     avoids a flash of stale text when switching the pick. A help line restates the selected row's divergence (the
     general warning when its counts are unknown). The confirm button reads "Checkout" (primary) on a fast-forward pick
     and "Checkout and reset" (danger) otherwise, or when the counts are unknown (E3, T8) →
     `checkoutAndResetBranch(branch, target, localOid)` with the picked candidate's `localOid`. The title is "Checkout
     other local branch" when opened from **Checkout other local…** (`other`, W5), otherwise "Checkout local branch".
     _Superseded draft: the same danger "Checkout and reset" button as the single-candidate dialog._
5. **Backend**: a read-only command for the ahead/behind check (called by the single-candidate menu click and by
   `CheckoutLocalDialog`; `CheckoutResetDialog` is handed its counts).
   - `crates/git-core/src/refs.rs`: a free
     `pub fn ahead_behind(repo: &Repository, a: &str, b: &str) -> Result<(usize, usize), GitError>` that parses both
     oids and calls `graph_ahead_behind` directly, returning any error, so a failed walk is never 0/0 (E1). Beside it,
     `pub fn expect_branch_at(repo, name, oid)` for T1 (§3). _Superseded draft: make `AheadBehindCache::get_or_compute`
     `pub` (or wrap it), cached — but the cache keeps a failed walk as `(0, 0)`, which read as a fast-forward._
   - `src-tauri/src/commands/repo.rs`: new
     `#[tauri::command] fn ahead_behind(id: RepoId, a: String, b: String) -> Result<AheadBehind>` — `id: RepoId`,
     matching every sibling command's own parameter name (`get_refs`/`get_linked`, `:213-227`/`:232-246`) and matching
     `ipc.ts`'s `call("...", { id, ... })` convention below; a `repoId` param would silently mismatch that call's
     `{ id, a, b }`. No command in this codebase returns a bare tuple — every one returns a named struct or enum
     (`OpResult`, `RefsSnapshot`, …) — so this introduces `struct AheadBehind { ahead: usize, behind: usize }` rather
     than `(usize, usize)`, opens its own repository (`handle.open_private()`, as `get_refs` does) and calls
     `refs::ahead_behind(&repo, &a, &b)` (E1). _Superseded draft: parse `a`/`b` to `Oid` and call
     `handle.ahead_behind.lock().get_or_compute(...)`, the cached path._
   - `src/api/ipc.ts`: `export const aheadBehind = (id: RepoId, a: string, b: string) =>
     call<AheadBehind>("ahead_behind", { id, a, b });`, `AheadBehind` being `{ ahead: number; behind: number }` in
     `src/api/types.ts`, matching the named-struct return above.

## Steps

1. `commitMenu.ts` — candidate enumeration (D-multi) and `checkoutReset` on `CommitBranchActions`; update
   `commitMenu.test.ts` (single candidate, multiple candidates, all-excluded-by-gate, already-here
   filtering, two remotes at one commit). The existing `branch(name, oid, extra)` fixture helper
   (`commitMenu.test.ts:8`) already supports two candidates by calling it twice with the same `upstream` —
   no new fixture shape needed.
2. `crates/git-core/src/refs.rs` — a direct, uncached `ahead_behind` that returns its errors (E1).
3. `src-tauri/src/commands/repo.rs` (+ wherever commands are registered) — `ahead_behind` command.
4. `src/api/ipc.ts` — `aheadBehind` wrapper.
5. `src/screens/RepoWindow/actions.ts` — `checkoutAndResetBranch`.
6. `src/store/dialogStore.ts` + `OpsDialogs.tsx` — `checkoutReset` and `checkoutLocal` dialog kinds and
   components.
7. `RevisionGrid.tsx` — the two menu-item shapes, wired to steps 4-6; update `RevisionGrid.test.tsx` /
   `commitMenu.test.ts` for the new lists and gating. `RevisionGrid.test.tsx:340-341` is the assertion
   pattern to follow (`contextMenu` → pick the item → `expect(dialog).toEqual({ kind, ... })`), but that
   test's own `{ kind: "checkoutBranch", branches: [...] }` shape is a different, existing dialog kind
   (plain local-branch checkout) — the new `checkoutReset`/`checkoutLocal` assertions need their own
   shape built from `CheckoutResetDialog`/`CheckoutLocalDialog`'s fields (Design §4), not copied from it.
   Added after the build:
   - E4: `crates/git-core/src/cli/ops.rs` (`gitops::checkout`'s `force` → `-B`), `src-tauri/src/commands/ops.rs`
     (the `checkout` command's `force`), `ipc.checkout`'s trailing `force`, and `dialogs/gitArgs.ts`
     (`checkoutArgs`'s `force`, for the preview).
   - T1: `refs::expect_branch_at`, the `checkout` command's `expect` (checked under the op lock), `ipc.checkout`'s
     trailing `expect`, `checkoutAndResetBranch`'s third argument, and the `checkoutReset` spec's `localOid` through
     `DialogHost.tsx`.
8. Manual check in the running app: a remote branch whose local tracking branch is (a) strictly behind
   (clean fast-forward, no dialog), (b) strictly ahead, (c) diverged, (d) checked out in another worktree
   (item should not appear, same as `reset` today), (e) two local branches tracking the same remote ref
   (picker shows both).
