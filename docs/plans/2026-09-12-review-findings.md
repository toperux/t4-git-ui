# Review of the unpushed range — findings

> Superseded 2026-09-12 by `2026-09-12-consolidated-findings.md`, which folds R1–R13 into the
> full-codebase list. Kept for the analysis; tick boxes there, not here.

The 12 commits on `main` that have never been pushed (`origin/main..main`, `7a31e19..e57945d`) had
never had a review pass over what actually shipped. The reviews that exist either **produced** these
commits or predate them, which is not the same thing. Walked 2026-09-11/12.

**How.** Four read-only reviewers in parallel, split by dimension so each could hold its whole area
in view: shared UI primitives (`8c79df3`), the commit-panel selection feature (`56c9508`, `e57945d`,
the `min-width` rule), the freshness rule (`2c1b498`), and the rebase-todo / Alt-chord / Rust
leftovers (`1435459`). Every finding below was then re-traced in the code by hand before it was
written down — two of the reviewers' claims were about reasoning in commit messages I wrote myself,
and both turned out to be right.

**Verdicts.** *CONFIRMED* = the whole path was traced in the code. *PLAUSIBLE* = a real risk that
could not be fully settled by reading, with the experiment that would settle it named. Nothing here
is a style preference; the reviewers were told to report defects only.

Gates were green throughout and stayed green: `tsc --noEmit` clean, 581/581 vitest, `cargo test`
passing. That is the point of several of these findings — **green gates are what let them ship.**

---

## Fix before push

- [ ] **R1 — Opening a dirty repository leaves the walk unseeded.** CONFIRMED. A regression from
      `2c1b498`, introduced by me. `openRepo` sets `refs: null` and `filter: {}`
      (`src/store/repoStore.ts:247,250`); the status lands first (the refs snapshot queues behind the
      scan, as `repoStore.ts:261` says), so `freshStatus(status, undefined)` returns `null`,
      `rowShown` falls back to `filter.workingTree` — just cleared to `false` — and `syncWalkSeed`
      compares `false !== false` and does nothing. Nothing re-runs it afterwards: `openRepo` calls
      `refreshRefs()` directly rather than `syncRefs()`, so `syncRefsOnce`'s seed recompute
      (`statusStore.ts:159`) never fires, and the store subscription's refs branch
      (`statusStore.ts:245`) only calls `dropWorkingTreeIfClean()`. Once refs arrive
      `useShowWorkingTree()` *is* fresh and returns `true`, so the row renders against a walk laid
      out without it — exactly the disagreement `rowShown` exists to prevent.
      **What you see:** open any repo with uncommitted changes → the working-tree row has no line
      down to HEAD (`wtLink` returns `null` on an unseeded walk — its own doc comment at
      `src/screens/RepoWindow/RevisionGrid/graphGeometry.ts:26` says so) and HEAD's column is not
      reserved. Self-corrects on the first watcher event, op, commit or F5.
      **Root cause:** "not fresh ⇒ keep what the walk already has" assumes the walk's current seed
      was once a correct answer. At open there is no previous answer and `filter` was just cleared,
      so the fallback is guaranteed wrong for a dirty repo.
      **Fix:** call `syncWalkSeed()` in the subscription's refs branch beside
      `dropWorkingTreeIfClean()` — covers open and any other direct `refreshRefs()` caller, and the
      existing `show !== filter.workingTree` guard stops it churning.
      **Note before fixing:** the old code's second `startLog` here *is* the documented double walk
      on opening a dirty repo (`repoStore.ts:263`, closed won't-fix). This change had silently
      removed it — by breaking the seed, not by fixing anything — so restoring correctness restores
      that known cost. Not a reopening of the won't-fix; just don't be surprised by the second walk.
      **Test that would have caught it:** open with `refs: null`, resolve a dirty status, then set
      refs, and assert `startLog` was called with `{ workingTree: true }`. No test does this —
      `src/store/statusStore.test.ts:59-65` seeds every case with refs already loaded **and**
      `filter: { workingTree: true }`, with a comment noting that is already what the dirty status
      wants, so nothing re-walks.

- [ ] **R2 — `min-width: 112px` on `.headerBtn` permanently steals the header title's width.**
      CONFIRMED mechanism, exact crossover PLAUSIBLE.
      `src/screens/RepoWindow/CommitPanel/CommitPanel.module.css:30`. `.title` is the only flexible
      item in the header (`flex: 1; min-width: 0; text-overflow: ellipsis`, PanelHeader.module.css);
      the icon, badge and button are all `flex: none`. So the floor is paid entirely by the title,
      and it is paid **in the resting state too, where the label is shortest**: `Stage all` is 63px
      against a 112px floor, so +49px of dead space, versus +2px for `Unstage selected`. The cost is
      inverted — largest exactly when nothing is selected, which is where the panel sits almost all
      the time. The files panel's floor is reachable (`CommitPanel.tsx:38`, `minSize={220}`).
      **Needs a decision, see the bottom of this file.**

- [ ] **R3 — `DisabledHint`'s wrapper cancels the control's own flex sizing.** CONFIRMED mechanism,
      visible magnitude unmeasured. `src/components/ui/DisabledHint/DisabledHint.module.css:6-11`:
      `.wrap { display: inline-flex; min-width: 0 }` becomes the flex item in the control's place,
      but carries none of the control's own sizing and explicitly permits shrinking below content.
      Everything the control declared to hold its slot now applies to a box *inside* the flex item,
      where it has no say in how the row distributes space. Live cases:
      `IconButton.module.css:15` (`flex: none` — and `IconButton.tsx:14` computes `tip = title ?? label`
      with `label` required, so **every disabled IconButton in the app is wrapped**);
      `DiffViewer.module.css:41-46` (`.resolve { flex: none; max-width: 12rem }`, whose own comment
      says the cap exists so a branch name does not squeeze the path out of the header — applied at
      `DiffViewer.tsx:274,283,369`, all `disabled={busy}` and titled); and `.headerBtn` itself, which
      means **R2's floor is cancelled in exactly the disabled-and-titled case the jog fix was about.**
      **Failure scenario:** commit panel on a conflicted tree with the files column dragged narrow →
      click "Keep ours" → `busy` flips → those buttons become wrapped, the row now contains
      shrinkable items where it had none, and they collapse for the duration of the operation and
      snap back when it ends.
      **Fix:** use the escape hatch that already exists — `DisabledHint`'s `className` **replaces**
      `.wrap`, which is how `Menu` already solves this (`Menu.module.css:73-77`, `.itemWrap`). Give
      the affected callers a wrapper class that restores the sizing the control declared.
      **Settles the magnitude:** `getBoundingClientRect()` on a `.resolve` button and on `Stage all`
      before vs. during `busy`, with the pane dragged narrow. The AE walk measured only the
      unconstrained case, which cannot see this.

- [ ] **R4 — The `Unstage selected` test is vacuous.** CONFIRMED.
      `src/screens/RepoWindow/CommitPanel/CommitPanel.test.tsx:482-491`. The fixture's staged list is
      exactly `["both.rs", "new.rs"]` — the only two entries with `index !== null` (`:76`, `:78`) —
      and the test selects both, so its expected payload is byte-identical to what whole-list mode
      would send. Rewrite `StagedFiles` to ignore the selection entirely and this test still passes;
      the only thing it pins is the button's name. The staged half is the half with **no conflict
      filter** to fall back on, and it has zero payload cover.
      **Fix:** add a third staged entry to the fixture so a selection of two is a proper subset.

- [ ] **R5 — The `entries` ∩ `selected` intersection is untested.** CONFIRMED.
      `src/screens/RepoWindow/CommitPanel/FilesColumn.tsx:56-57`. Delete the `inList` filter — the
      exact guard the commit message says `useSelectedTarget` exists for — and **every test in the
      file still passes**. No test renders a header while `commitStore.selected` names a path absent
      from the current entries. Harm if it regressed is mild (a wrong label, dead paths in a payload
      that `stage_paths` no-ops on), but the guard is load-bearing by assertion only.
      Same shape: the `"here"` branch of the refusal string (`FilesColumn.tsx:83`) has neither a unit
      test nor smoke cover — and `e57945d` is precisely a commit that edited that string.

- [ ] **R6 — `Toolbar.tsx:90` names the menu's trigger by DOM position, which a wrapper breaks.**
      Mechanism CONFIRMED, race PLAUSIBLE.
      `closest('[role="menu"]')?.previousElementSibling` is meant to reach the anchor `<button>`, and
      `Menu.tsx:98-106` does render `{anchor}` and the `role="menu"` div as siblings. But the Branch
      and Stash anchors (`Toolbar.tsx:187-196,217-228`) are `disabled={running}` with a title that
      `opTitle` always returns, so while an operation runs the anchor **is** a `<span role="none">`.
      `Dialog.tsx:58` then calls `.focus()` on a span with no `tabIndex` — a silent no-op, and focus
      falls to `<body>`.
      **Reachability:** needs an operation to start while the menu is already open, then an item
      click. Settle it by starting a slow fetch with the Branch menu open and clicking an item.
      **Worth fixing regardless of the race:** this is the same class of bug as the
      `> button:first-of-type` selector that resolved to Pull (see `docs/smoke-cdp.md`) — naming an
      element by position when a wrapper can appear between. Hold a ref instead.

- [ ] **R7 — The staged side's missing conflict filter is defended by unsound reasoning.** CONFIRMED.
      `src/screens/RepoWindow/CommitPanel/FilesColumn.tsx:122-125` argues that `splitStatus` can put
      a file in both lists "when it has an index change and a conflict". That conflates the real
      both-lists case (`both.rs`: index **and** workdir, not conflicted) with a conflicted-and-staged
      file, which appears unreachable: `index_status` (`crates/git-core/src/status.rs:63-77`) reads
      only the `INDEX_*` bits, and libgit2 reports an unmerged path as `CONFLICTED` rather than
      through those, so a conflicted entry carries `index: null` and never enters the staged list.
      Both fixtures in the repo agree.
      **Why it matters either way:** if it *is* reachable, `unstage_paths` → `reset_default(HEAD, …)`
      (`crates/git-core/src/stage.rs:81-92`) collapses the three stages to a single stage-0 entry,
      i.e. silently marks the conflict resolved to HEAD with the markers still in the working file —
      the very hazard the unstaged side filters conflicts out to avoid. So the comment is wrong
      whichever way reachability falls: if unreachable its premise is false, if reachable it is not a
      reason to leave the side unfiltered.
      **Settles it:** in a temp repo, conflict a path and also stage an unrelated index change to
      that same path, then check whether `status()` returns `index: Some(_)` alongside
      `conflicted: true`.

---

## Recorded, not being fixed

- **R8 — Alt+↑/↓ is stolen from an *open* dropdown.** CONFIRMED, cosmetic.
  `RebaseInteractiveDialog.tsx:116`'s capture guard asks "can the move happen", not "is the Select
  open". Focus the last row's action Select, press Alt+↓ (refused, so it falls through and the
  dropdown opens), then Alt+↑ — the list claims the chord and moves the row, while the row keeps the
  same DOM node so the open portal travels with it; `useDropPosition` (`Input.tsx:70`) has dep array
  `[open, anchor, list]`, all stable across a reorder, so the listbox keeps its old rect and floats
  over a different row. No data loss.
- **R9 — Five banner fixtures silently exercise the stale path.** CONFIRMED.
  `banners.test.ts:78,84,85,91,100` pair `status(0)` (default `state: "clean"`) against non-clean
  refs states. Their assertions target text and buttons that never consult freshness, so nothing is
  asserted falsely — but the consequence is that **no test covers a fresh cherry-pick / revert /
  bisect status.** Invert `freshStatus` for those states and only the two new rebase tests would
  notice. (`:87` is the one that matches deliberately.)
- **R10 — A shrinking selection silently promotes the button to the whole list.** CONFIRMED path,
  narrow window. `FilesColumn.tsx:58`: falling to `null` does not mean "act on nothing", it means
  "act on everything". Ctrl-select 3 files, let a refresh remove 2 of them, and the button relabels
  to `Stage all` with the whole working tree as its payload. The label and the payload never
  disagree — both come from one render body — so this is a hazard of the `> 1` threshold rather than
  a logic bug, and there is no free fix. Worst outcome in the feature; recovery is one `Unstage all`.
- **R11 — While `busy`, the tooltip blames conflicts instead of the running op.**
  `FilesColumn.tsx:102-103` keeps `title={skipNote}` while `disabled={busy || …}`, so a greyed button
  mid-mutation explains a skip rather than saying an operation is running. `FileContextMenu.tsx:67`
  gets this right for the same state. Pre-existing shape, not introduced by `56c9508`.
- **R12 — Two stale status/refs pairings that `2c1b498`'s message never named.** Neither wants a
  guard — guarding would make the control flicker dead at every state change — but they belong in
  the list: `MessageColumn.tsx:46,63` (`canCommit` pairs a status-derived staged count with a
  refs-derived `merging`; worst case is one refused commit and a toast), and `CommitPanel.tsx:67-82`
  (`stranded` gates **Restore conflict**, which calls `ipc.recreateConflict` and overwrites the
  working file). The second is the only stale pairing in the app behind a state-mutating button; it
  additionally needs conflict markers in the already-loaded diff and a confirmation click.
- **R13 — `canSquash` is O(n) per call**, and `RebaseInteractiveDialog.tsx:180` calls it once per
  row, so O(n²) per render on drop-heavy todos. Not a defect. Noted only because the comment at
  `:178` frames a hoist as the fix, and the hoist removes a constant factor, not the quadratic.

---

## Verified clean

Stated positively, because "we looked and it holds" is worth as much as a finding:

- **The rebase-todo logic was brute-forced, not argued about.** `rebaseTodo.ts` was transpiled into a
  scratchpad harness and run over every action sequence of length 1–4 across the full alphabet
  (`pick/reword/edit/squash/fixup/drop` + merge row + hidden line), plus lengths 5–7 over
  `pick/squash/fixup/drop` — **26,184 sequences, 0 failures.** Asserted: `toSteps`'s output equals
  the per-row expected lines in index order (nothing lost, duplicated or reordered); `groupOf` is
  contiguous, ascending, contains `i`, has head ≤ `i` and never crosses a non-pick; every index in a
  group returns the identical group; `validate`'s message key equals the one `toSteps` uses for every
  emitted group; and whenever `validate` returns `null`, no member folds into a dropped, member or
  non-pick head. That covers drop-at-head, drops between members, runs of drops, drops trailing past
  the last member, drops-only-above, groups at the list end, and merge/hidden rows as barriers. The
  harness lived in the session scratchpad and is gone; the recipe above is enough to rebuild it, and
  it is worth rebuilding before any future change to `groupOf`/`toSteps`.
- **Rust stamp ordering** — `status.rs:116` reads `repo.state()` strictly before `repo.statuses()` on
  `:117`, and `update_index(true)` runs inside `statuses()`. Reading it after would reinstate the
  stale-banner bug.
- **Serde / IPC agreement** — Rust `pub state: RepoState` (required), `RepoState`'s camelCase variants
  match `src/api/types.ts:171` one-for-one, `WorkdirStatus` is built in one place and never
  deserialized from anything persisted, so the new required field cannot break an old payload.
- **No positional CSS selector resolves to a `DisabledHint` wrapper.** Every `>`/`+`/`~`/`:first-child`
  rule in `src/` that could reach these components was checked; each first child is an `Input`, a
  deliberate spacer, or a `CommandInput`. The Pull-button trap has no analogue here. (R6 is the same
  *class* of bug, but in JS, not CSS.)
- **Prop forwarding, accessibility, focus and keyboard** — `className`, `onClick`, `type`, `aria-*`,
  `disabled`, `title` and `ref` all still reach the `<button>`; role and accessible name are
  unchanged; `role="none"` keeps the span out of the a11y tree; every menu/dialog/sidebar query is
  descendant-scoped or uses `closest()`, so an intervening span changes nothing. An enabled control
  renders byte-identical DOM (`DisabledHint.tsx:37`).
- **Both deliberately-inverted tests are legitimate**, not bent to fit a bug: git's `todo_list_check`
  does not clear "has been picked" on a `drop`, so `pick A / drop B / fixup C` folds C into A; and
  Alt+↓ opens / Alt+↑ commits matches both a native `<select>` and the ARIA combobox pattern.
- **Commit-panel store interactions** — the intersection can only shrink the target and never yields
  a path outside the list; the reverse ordering (selection ahead of entries) is unreachable; panel
  and dialog sharing one store flip together, which is correct, and `run()` rejects a double-fire on
  `busy`; tree mode counts and stages files hidden inside collapsed folders correctly.

---

## Needs a decision

**R2 has no free fix.** Restoring the button's natural width brings back the 33px jog that the floor
was added to remove; flooring `.title` instead just moves the overflow somewhere else. Picking
between them needs `getBoundingClientRect()` at a 220px panel on a real build — **jsdom has no
layout, so no test can see this, and neither could the AE walk, which measured only the
unconstrained case.** Do the measurement before choosing.

R3 should be fixed in the same pass, since the two interact: whatever floor `.headerBtn` ends up
with is cancelled anyway while the button is disabled-and-titled.
