# Review 2 — slice C (CommitPanel / ChangedFileList / DiffViewer / DetailsPane / Toolbar / ui bits / keys.ts)

Range `f6eb8b7..main`, 14 commits touching the assigned paths:
`ff46e63 79431aa 84fdc82 d64e3fa 6a95389 a4cfec8 e0ab5c5 5c42315 790b1b1 52e410e 73c4d80 0e4c436 7fa85e6 3834aed`.
Targeted suite re-run read-only: 8 files / 96 tests, all green.

Counts: **0 high · 4 med · 7 low**.

---

### C1 · med · src/screens/RepoWindow/CommitPanel/FilesColumn.tsx:66-75 (`reseed`), 110-114, 141-146

**Claim.** `reseed` runs one microtask too early: it reads a selection that `syncWithStatus`
has not pruned yet, so `selected[0]` is the path the action just removed, not "the first
survivor" the doc comment promises. The test that pins it only passes because `act()`
interleaves React's flush with the promise chain.

**Trace.** `stage(target)` → `commitStore.run()` (`src/store/commitStore.ts:223-248`) sets
`busy:false`, then `await useStatusStore.getState().refresh()`. `refresh` →
`fetchStatus` → `useStatusStore.setState({status})` and returns — nothing else is awaited
(`src/store/statusStore.ts:119-142,181-183`). Pruning happens in an **effect**
(`useCommitSync`, `CommitPanel.tsx:25-31` → `syncWithStatus`), and a zustand store update
outside a React event schedules a DefaultLane render through the Scheduler (MessageChannel
= macrotask). The `.then(() => reseed(...))` continuation is a microtask, so it always wins:
at `reseed` time `useCommitStore.getState().selected` is still the pre-stage array.
Under `@testing-library`'s `act()` the flush is interleaved with `await null` hops, which is
why `CommitPanel.test.tsx:497-516` observes `["conflict.rs"]`.

**Failure scenario.** Unstaged = `a.rs, both.rs, conflict.rs`. Ctrl-select `a.rs` +
`conflict.rs` → **Stage selected** → `stagePaths(["a.rs"])`.
reseed sets `selected=["a.rs"], anchor="a.rs"` — a path that is no longer in the list —
which calls `select()` and therefore `loadDiff()` for a vanished unstaged path (one wasted
IPC, a blank/`diffError` flash). The following render's `setOrder` effect
(`commitStore.ts:275-291`) then lands the selection on `both.rs`, the *neighbour*, and
`syncWithStatus` keeps it. Net: the surviving `conflict.rs` the comment says is kept is not
kept, and the transient selection names a file that is gone.
(The commit's actual goal — header back to "Stage all" — is still met, by a different route.)

**Suggested fix.** Compute the survivor at click time and pass it in:
`const keep = selectedTarget.filter((p) => !target.includes(p))[0]` → `reseed(list, keep)`,
or just `select(list, EMPTY_SELECTION)` and let `syncWithStatus` seed.

---

### C2 · med · src/screens/RepoWindow/CommitPanel/stageTarget.ts:33-36

**Claim.** The "more than one = a group, so skip conflicts" threshold moved from the
asked-for paths to the *surviving* ones (`chosen.length > 1`, after the new intersection
with `entries`). A two-path group whose non-conflicted member has just left the list
therefore degrades into a lone-file stage — which is exactly the "mark resolved with the
markers still in it" the filter exists to prevent.

**Trace.** Old (`FileContextMenu.tsx` pre-79431aa, `FilesColumn.tsx` `stageable`):
`list === "unstaged" && ps.length > 1 ? ps.filter(not conflicted) : ps`.
New: `const chosen = paths.filter((p) => inList.has(p)); const filter = list === "unstaged"
&& (opts.bulk || chosen.length > 1);`. The intersection is a genuine improvement, but it is
applied *before* the threshold. Non-`bulk` call sites are the keyboard/double-click
`stageable` (`FilesColumn.tsx:257`) and the context menu (`FileContextMenu.tsx:49`).

**Failure scenario.** Selection `["conflict.rs", "a.rs"]` in Unstaged. A background refresh
(watcher, another tool, a `git add` in a terminal) drops `a.rs` from the unstaged list.
`useCommitSync` prunes in an effect, so for one render `selected` still has both. Press
**Enter** in that window:
- old → `chosen` n/a, 2 paths, filter on → target `["a.rs"]` → harmless no-op;
- new → `chosen = ["conflict.rs"]`, length 1 → filter **off** → `stagePaths(["conflict.rs"])`
  → `index.add_path` drops the three stages, conflict markers still in the file, and no
  unstage brings the stages back.
The menu is protected by chance only (`FilesColumn.tsx:190-192` closes it on any signature
change); Enter and double-click are not.

**Suggested fix.** `const filter = list === "unstaged" && (opts.bulk || paths.length > 1);`

---

### C3 · med · src/screens/RepoWindow/CommitPanel/stageTarget.ts:32-34 + FilesColumn.tsx:254-262

**Claim.** `stageTarget` rebuilds two `Set`s over the *whole* entry list on every call, and
`folderTarget` now calls it once per rendered folder row per render — reintroducing the
exact O(rows × entries) cost the neighbouring `conflictedPaths` memo was added to avoid.
That memo is now dead weight for this path (only `discardable` still uses it).

**Trace.** Before: `folderTarget` closed over the memoised `conflictedPaths` set, so a
folder row cost O(files under it). After: each call does
`new Set(entries.map(...))` + `new Set(entries.filter(...).map(...))`. The header
(`FilesColumn.tsx:75`) adds two more per render, and `stageable` two more per keypress.
The comment three lines above it still reads "A set, not a `find`: every visible folder row
asks for each file under it on every render."

**Failure scenario.** 5 000-entry status in tree mode, ~20 visible folder rows + overscan 10
→ ~30 × 2 × 5 000 ≈ 300 000 set insertions per render of `FileList`, on every arrow key,
scroll tick and status refresh. Visible input lag on a large repo mid-rebase.

**Suggested fix.** Hoist the two sets: `const sets = useMemo(() => ({inList, conflicted}), [entries])`
and give `stageTarget` an overload that takes them (or memoise a per-list bound closure).

---

### C4 · med · src/screens/RepoWindow/ChangedFileList/ChangedFileList.tsx:93-102 (+ src/lib/keys.ts:10)

**Claim.** "Give the changed-file tree keyboard expand and collapse" is not reachable from
the keyboard. The new branch keys off `e.target.closest("[data-folder]")`, but nothing ever
gives a folder row DOM focus except a mouse click, so a keyboard-only user can never trigger
it. The test asserts the handler, not the reachability.

**Trace.** Folder rows render as `TreeRow` (`<button>`) with `tabIndex={-1}`
(`ChangedFileList.tsx:175`); the scroll container carries `tabIndex={0}` and
`aria-activedescendant` (`:156-161`). ↑/↓/Home/End only move `selectedPath` — DOM focus
stays on the container, so `e.target` is the container and `closest("[data-folder]")` is
`null`. There is no roving tabindex, and ArrowLeft/ArrowRight are not handled for file rows
(a `role="tree"` is expected to move to / collapse the parent). The test
(`ChangedFileList.test.tsx:74-85`) calls `fireEvent.keyDown(getByTitle("src/log"), …)`
directly on the button, which bypasses the focus question entirely.

**Failure scenario.** Tab into the changed-file tree, press ArrowRight/ArrowLeft/Enter on
any row → nothing collapses or expands; the only way in is a mouse click on the folder first.
With every file inside one collapsed folder — the case the code comment names as the reason
the branch sits above the empty-list guard — a keyboard user is stuck.

**Suggested fix.** When focus is on the container, resolve the folder from the *selected*
row's ancestry (ArrowLeft → collapse/ascend, ArrowRight → expand) instead of from `e.target`.

---

### C5 · low · src/screens/RepoWindow/ChangedFileList/ChangedFileList.tsx:110-111

**Claim.** Silent behaviour change: ArrowUp with nothing selected used to select the *first*
file; via `moveSelect` it now selects the *last*.

**Trace.** Old: `cur = -1`; `next = Math.max(cur - 1, 0)` → 0. New: `moveSelect`
(`src/lib/multiSelect.ts:66`) with `cur < 0` and `hiddenAt === -1` → `delta < 0 ? last : 0`.

**Failure scenario.** Freshly opened commit whose file list failed to auto-select (or a
stale `selectedPath` from another target), press ↑ → jumps to the bottom of the list instead
of the top. It matches `FilesColumn`'s convention, so this may be intended — but the commit
message does not mention it and no test pins it.

**Suggested fix.** Either assert it in `ChangedFileList.test.tsx`, or pass `hiddenAt = 0` when
`selectedPath === null` to keep the old top-first behaviour.

---

### C6 · low · src/screens/RepoWindow/DetailsPane.tsx:85-88

**Claim.** The fix clears `detail` as well as `error`, so the Commit pane goes fully blank
for the whole IPC round trip with no placeholder. The commit message only claims the error
fix; the blanking is an unannounced UX change.

**Trace.** `!oid ? EmptyState : error ? … : info && (…)` (`DetailsPane.tsx:115-128`) — with
`detail === null` and `error === null`, `info` is undefined and the body renders nothing.
`CommitDetails` has no `loading` state and no `Progress`, unlike `ChangedFileList`.

**Failure scenario.** Hold ↓ in the history grid: the Commit pane flashes empty between
every row instead of swapping message text in place.

**Suggested fix.** Keep the clear, and render a `Progress thin` / skeleton while
`!detail && !error && oid`.

---

### C7 · low · src/screens/RepoWindow/Toolbar.tsx:91-95 + DisabledHint.tsx:37

**Claim.** The ref fix hands the dialog the right *node*, but the node is still a snapshot:
`DisabledHint` flips between `<>{children}</>` and `<span>{children}</span>`, which React
reconciles as a type change and remounts the `<button>`. An op finishing while the dialog is
open leaves `returnFocus` pointing at a detached element.

**Trace.** `openDialog(spec, { returnFocusTo: trigger.current })` stores the element in
`dialogStore.returnFocus`; `Dialog.tsx:42-45` reads it once into `opener.current` and focuses
it on close. `branchBtn.current` is re-assigned on the remount, but the value already handed
to the store is not.

**Failure scenario.** Push is running → **Branch** is disabled+titled → wrapped. Click
**Create branch…** (the item is still enabled) → dialog opens with the wrapped button as the
return target. The push finishes → `running` false → `DisabledHint` unwraps → the button
remounts. Close the dialog → focus goes to `<body>`, not the toolbar.

**Suggested fix.** Store the ref object (or a `() => HTMLElement | null` getter) in
`dialogStore.returnFocus` and resolve it at close time.

---

### C8 · low · src/components/ui/DisabledHint/DisabledHint.module.css:8-12

**Claim.** The replacement comment is wrong on both counts it makes, and its one concrete
example was deleted two commits later.

**Trace.**
1. "a control that really has to shrink below its content still says so on itself
   (`min-width: 0` on `DiffViewer`'s `.resolve`), which reaches through the wrapper either
   way" — it does not. `min-width: 0` on the child removes the *child's* automatic minimum;
   the wrapper's own automatic minimum is its min-content size, which is still content-based.
   (`.resolve` is also `flex: none`, so it never shrank in the header row to begin with —
   `DiffViewer.module.css:41-46`.)
2. "`.headerBtn`'s 112px" — `3834aed` removed that floor (`CommitPanel.module.css:23-32`),
   so the named beneficiary no longer exists.
3. Unaddressed by either commit: the wrapper does not carry the control's `flex` shorthand,
   so a disabled `flex: none` / `flex: 1` control still sizes differently from its enabled
   self. (`.commitBtn { flex: 1 }` escapes only because that button never gets a `title`.)

**Failure scenario.** No live regression found from the removal itself — toolbar buttons are
`white-space: nowrap` and would have overflowed *with* `min-width: 0`, so the removal is a net
improvement. The risk is the comment misleading the next change.

**Suggested fix.** Trim the comment to "no floor of its own — the control's `min-width`
governs", and drop the `.headerBtn` reference.

---

### C9 · low · src/screens/RepoWindow/CommitPanel/MessageColumn.tsx:180-187

**Claim.** For the "dead for want of a summary or a staged file" case the fix removes the
tooltip rather than replacing it with a reason, which is the opposite of the commit's title
("Make a dead control's tooltip say why it is dead").

**Trace.** `title={running ? BUSY : canCommit ? "Commit, then open the Push dialog" : undefined}`.
Its neighbour `Commit` (`:180`) has never had a title. `canCommit` folds four conditions
(`:65`: `!busy && summary.trim() && (staged || amend || merging) && !noIdentity`), every one
of which has a one-line explanation available.

**Failure scenario.** Empty summary, nothing staged: both buttons are grey and neither says
anything on hover. The `noIdentity` case at least has the inline `role="alert"`; the other
three do not.

**Suggested fix.** `title={running ? BUSY : canCommit ? "Commit, then open the Push dialog"
: !summary.trim() ? "Enter a summary" : "Nothing staged to commit"}` (and the same on `Commit`).

---

### C10 · low · src/screens/RepoWindow/CommitPanel/FilesColumn.tsx:136-146 and :537-544

**Claim.** The BUSY sweep missed two controls in the file it edited, leaving the panel
inconsistent.

**Trace.** `StagedFiles`' header `Button` has `disabled={busy || target.length === 0}` and
**no `title` at all** (`:139-143`), and every `FileRow`'s own +/− `IconButton` has
`disabled={busy}` with no `title` (`:537-542`). Their counterparts — the Unstaged header
(`:106-107`) and the folder action (`:453`) — now say `"Operation in progress"`.
`IconButton` after `79431aa` only wraps on an explicit `title`, so the row buttons say
nothing at all now, where they previously at least exposed `label` on the wrapper.

**Failure scenario.** Mid-op, hover the staged header or a row's +: no tooltip. Hover the
folder row's +: "Operation in progress". Same reason, two answers.

**Suggested fix.** Add `title={busy ? BUSY : undefined}` to both (staged header also needs an
empty-list reason).

---

### C11 · low · src/screens/RepoWindow/CommitPanel/FileContextMenu.tsx:49 + FilesColumn.tsx:262, 303-311

**Claim.** A folder's *context menu* and a folder's *row button* disagree about the same
target, in wording and in outcome.

**Trace.** `onContextMenu` for a folder row selects `under(folder)` and snapshots it
(`FilesColumn.tsx:303-311`); the menu then calls
`stageTarget(list, entries, paths, { where: "you selected" })` — no `bulk`. So:
- wording: an all-conflicted folder is refused with "Every file **you selected** is
  conflicted" from the menu and "Every file **in this folder** is conflicted" from the row
  button (`:262`);
- behaviour: a folder holding exactly **one** conflicted file → menu `n === 1`, filter off →
  **Stage** marks it resolved; the row's own + is disabled and refuses it.

**Failure scenario.** Right-click `src/conflicted-only/` (one conflicted file) → Stage →
conflict marked resolved with markers in the file. Click the same folder's `+` → nothing
happens, tooltip says it is refused. (Pre-existing, but `stageTarget` is where it is now
cheap to settle.)

**Suggested fix.** Pass `{ bulk: true, where: "in this folder" }` from the folder branch of
`onContextMenu` (thread a flag through `FileMenuState`).

---

## Verified clean

- **`ff46e63`** — `const changed = anchor !== diffPath || list !== diffList` guards both the
  blanking and the "identical content keeps the old object" shortcut; the same path in the
  other list correctly gets a fresh object. `diffSeq` still discards stale responses.
  `diffEntry`/`statsFor` invalidation in `run()` untouched.
- **`73c4d80`** — the `useMemo` dependency list is **complete**. Every reactive value in the
  body is listed (`path, list, conflicted, untracked, wholeOnly, stranded, canDiscard, busy,
  diff, sides` + the five store actions); `resolveInEditor` and `restoreConflict` are
  module-level functions (`CommitPanel.tsx:139,163`) and `sideName` is an import, so their
  absence is correct, not an omission. No stale `busy` / `canDiscard` closure is possible.
  The premise holds: `lineActions` → `hunkActions` (`DiffViewer.tsx:201-214`) → `DiffBody`'s
  `actions` prop feeds memoised rows, and `onBodyKeyDown`'s `useCallback` depends on it.
- **`e0ab5c5`** — `target` is memoised in `DetailsPane` on `[oid, compare]` and `load()` is
  the only caller, so the reset effect fires on real target changes only. `scrollToOffset` is
  null-safe with no scroll element (`virtual-core` `scrollWithAdjustments` optional-chains
  `scrollElement`), so the mount-time call with the EmptyState branch rendered cannot throw.
  It does not race the `scrollToIndex` effect: `load()` sets `selectedPath: null` first, so
  `selectedRow` is `-1` at that commit.
- **`5c42315`** — `hiddenSlot` + `moveSelect(…, hiddenAt)` reuse is faithful; `hiddenSlot`'s
  shape requirement (`{kind:"file", file:{path}}`) matches both flat and tree rows; Home/End
  still land on first/last (`!Number.isFinite(delta)` branch ignores `hiddenAt`, correctly);
  `if (next.anchor)` covers `moveSelect`'s `EMPTY_SELECTION` return.
- **`790b1b1`** (mechanics) — `e.preventDefault()` on keydown suppresses the `<button>`'s
  native Enter/Space activation, so the delegated `onClick` does not toggle a second time.
  Guard placement is right in both files: above the guard in `ChangedFileList` (`visible`
  can be 0 with files present), below it in `FilesColumn` (`entries.length === 0` ⇒ no
  folder rows at all). `folderKey` is byte-identical to the version it replaced.
- **`79431aa`** (core contract) — a lone conflicted row still stages as "mark resolved" from
  the row button, Enter and double-click (`CommitPanel.test.tsx:165,174,259` all still pass);
  the partial-skip string is byte-identical to the old `stageSkipNote`; `op.title ?? note`
  yields no tooltip in the enabled state, as before; no `stageSkipNote` references remain.
  `DiffViewer`'s three `busy ? BUSY : …` swaps are sound (`actions.busy` is the only reason
  those controls are disabled).
- **`a4cfec8`** — no `previousElementSibling` left anywhere in `src`; React 19 (`^19.1.0`)
  makes `ref` a plain prop so the spread in `ToolbarButton` reaches the real `<button>`;
  all three toolbar menus are covered.
- **`7fa85e6`** — the corrected comment is right: `index_status`
  (`crates/git-core/src/status.rs:63-77`) returns `None` unless an `INDEX_*` bit is set, and
  libgit2 reports `CONFLICTED` alone for an unmerged path, so `splitStatus`'s
  `e.index !== null` filter (`commitStore.ts:29`) can never put a conflict in the staged list.
- **`3834aed`** — CSS + docs only; the measurement and the trade-off are recorded in both
  the rule and the smoke doc.

---

## Test adequacy

| Commit | Verdict | Why |
|---|---|---|
| `ff46e63` | adequate | Two store tests + one panel test; each fails without the `changed` guard (the old code kept `prev` for the same path in the other list, and left `diff` set during the round trip). |
| `79431aa` | adequate | DisabledHint tests pin both IconButton branches; `CommitPanel.test.tsx:497` fails on the old `(1 skipped)` title; the folder "only" assertion pins the refused wording. Gap: `stageTarget.test.ts` never exercises `bulk` vs the `>1` rule (the helper's central claim) — covered only indirectly by three pre-existing conflict tests — and the `MessageColumn` / `DiffViewer` title changes got **no** test. |
| `84fdc82` | **weak / misleading** | Passes, and fails without `reseed`, but the assertion `selected === ["conflict.rs"]` holds only because `act()` flushes React between the microtasks (see C1). In production `reseed` sees the unpruned selection and the list ends on `both.rs`. The test pins an `act()` artefact, not the behaviour. |
| `d64e3fa` | **vacuous w.r.t. the change** | The commit removes `min-width: 0`; the test asserts that `MenuItem` still passes `itemWrap` as the wrapper class. jsdom has no layout, so nothing here could fail if the floor behaved wrongly. The real evidence is the (undocumented) manual measurement. |
| `6a95389` | adequate (partial) | Reject-then-resolve; fails without the fix because the old effect never cleared `error`. Does not pin the second half of the change (clearing `detail` → blank pane), which is C6. |
| `a4cfec8` | adequate | Wraps the trigger mid-test, then asserts `returnFocus` is the `<button>`; with `previousElementSibling` it would be the `DisabledHint` span. Does not cover the unwrap-while-open case (C7). |
| `e0ab5c5` | adequate | Stubs `scrollToOffset`, clears the mount call, asserts exactly `[0]` on a target change; empty without the effect. Does not pin ordering against `scrollToIndex`. |
| `5c42315` | adequate | Collapses a mid-list folder and checks both directions; the old `Math.min/max` on `cur = -1` gives `a/one.rs` for ↓, so it fails without the fix. |
| `790b1b1` | **weak** | Fires keyDown on the folder element directly, so it proves the handler but not that a keyboard user can ever reach it (C4). Also cannot catch a double-toggle, since jsdom's `fireEvent.keyDown` synthesises no click. |
| `52e410e` | adequate | Asserts the exact toast title `"Copied 2 paths"`; the old code produced `"Copied path"`. |
| `73c4d80` | adequate | Captures every `actions` object handed to a mocked `DiffViewer` and asserts identity across a `diffLoading` flip — a fresh object per render fails it. Narrow (one dep flip) but it pins the property that matters. |
| `0e4c436` | adequate (it *is* the fix) | Correctly diagnoses the previous assertion as vacuous — with two staged files the selection was the whole list — and adds a third entry so `unstagePaths` must be a strict subset. |
| `7fa85e6` | n/a | Comment only. Claim verified against `status.rs` + `splitStatus`. |
| `3834aed` | n/a | CSS + docs; the trade-off is measured and recorded, not asserted. |
