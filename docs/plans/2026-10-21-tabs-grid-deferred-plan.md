# Plan: the tabs and grid deferred rows — a tab's state across windows and switches, the new HEAD, the scrollbar

_Written 2026-10-21 against `main` `51c773a6`. Status: final, plan review loop done (pass 34 found nothing); waiting for
the owner's go. Scope ruled by the owner on 2026-10-21: all five rows (Plan B of two, after
`docs/archive/plans/2026-10-18-diff-viewer-deferred-plan.md`). D1–D5 taken with the owner on 2026-10-21: D1 (a), D2 (b),
D3 (a), D4 (a), D5 (a). Plan review pass 1's findings taken, its four decisions (F1, F9, F10, the detach race) and F14
with the owner, all (a). Pass 2's taken, its three decisions (P2-1, P2-3, P2-15) with the owner, all (a). Pass 3's
taken, P3-7 and P3-8 accepted by the owner. Pass 4's taken, P4-1 (a), P4-2 (b) and P4-3 (a) with the owner. Pass 5's
taken, P5-1 (a) and P5-5 (a) with the owner. Pass 6's taken, P6-1 (i), P6-2 (a) and P6-4 (a) with the owner. Pass 7's
taken, P7-1 (b) with the owner. Pass 8's taken (nits only), P8-4 (a) with the owner. Pass 9's taken (nits only), P9-2
(a) with the owner. Pass 10's taken (nits only), P10-2, P10-O1, P10-O2 and P10-N, all (a), with the owner. Pass 11's
taken (one nit), P11-O1, P11-O2 and P11-O3, all (a), with the owner. Pass 12's taken (one nit), P12-O1, P12-O2 and
P12-O3, all (a), with the owner. Pass 13's taken (two nits), P13-O1 and P13-O2, both (a), with the owner. Pass 14's
taken (one nit), P14-O1, P14-O2 and P14-O3, all (a), with the owner. Pass 15's taken (one should-fix), P15-1, P15-O1,
P15-O2 and P15-O3, all (a), with the owner. Pass 16's taken (one should-fix, one nit), P16-1, P16-O1 to P16-O5, all (a),
with the owner. Pass 17's taken (two nits), P17-2 and P17-O1 to P17-O3, all (a), with the owner. Pass 18's taken (one
nit), P18-O1 (a) with the owner. Pass 19's taken (one nit), its "fine as is" items under the owner's rule for obvious
answers. Pass 20's taken (one nit), likewise. Pass 21's taken (three nits), likewise. Pass 22's taken (one should-fix,
one nit), P22-1 (b) with the owner. Pass 23's taken (one should-fix, two nits), under the owner's rule. Pass 24's taken
(one should-fix, one nit), P24-1 (b) with the owner. Pass 25's taken (one nit), P25-O1 (a) with the owner. Pass 26's
taken (two nits), under the owner's rule. Pass 27's taken (one should-fix), P27-1 (b) with the owner. Pass 28's taken
(one should-fix, four nits), under the owner's rule. Pass 29's taken (one decision, three nits), P29-1 (a) with the
owner. Pass 30's taken (three nits), under the owner's rule. Pass 31's taken (two nits), likewise. Pass 32's taken (one
nit), likewise. Pass 33's taken (one nit), likewise. Pass 34: no findings._

**Goal:** five fixes from the rows deferred during the per-tab, polish, scroll anchor and Plan A work
(`docs/plans/open-items.md` §AO and §AP):

- **AP2:** after a commit, the grid's selection stays on the previous HEAD.
- **AO1:** a tab moved to another window loses its commit draft, grid selection and history filter.
- **AO5:** a History tab comes back on its commit's first file, at the top.
- **AO6:** a tab switch brings the Changes diff back at the top.
- **AO7:** a keyboard move to a line below the bottom edge leaves it 10 px behind a horizontal scrollbar.

What is measured: AP2 was seen in BW 5 and 12, AO6 once in BX 6b. AO1, AO5 and AO7 are reasoned from the code. None
of the causes below was run; each is read from the code (three read-only surveys and plan review pass 1, 2026-10-21).

## What happens now (from the code)

- **AP2.**
  - `commitStore.commit()` gets the new commit's oid from `ipc.commit` (`src/store/commitStore.ts:543`) and uses it
    only for the toast and the message history. It then calls `syncRefs()` (`:553`), which restarts the walk when HEAD
    moved (`src/store/statusStore.ts:175`).
  - `startLog` records the selected commit's oid and selects it again in the new walk (`src/store/repoStore.ts:462-463`,
    `reselect` at `:173-193`). The selection follows the commit, not HEAD, so a selected old HEAD stays selected.
  - The usual path is a commit from the Changes view, entered with the working-tree row selected (`openCommitPanel`,
    `src/screens/RepoWindow/actions.ts:266-271`). A commit that empties the tree drops that row in `withApplying`'s
    status refresh (`dropWorkingTreeIfClean`, `statusStore.ts:186-191`, which calls `selectWorkingTree(false)`). That
    leaves `selectedIndex` at whatever commit index it held before the row was picked. The walk restarts then reselect
    that commit. When it was the old HEAD (row 0), the grid shows the old HEAD selected under the new one: the BW
    symptom.
  - Nothing anywhere selects a new HEAD: no other HEAD-moving operation does (`runOp`, `src/store/opsStore.ts:274-277`).
    The commit dialog calls the same `commit()`.
- **AO1.**
  - Three senders move a tab (two call sites, `tabsStore.ts:188` and `useTabDrag.tsx:236`): *Move to new window*
    (`tabsStore.detach`, `src/store/tabsStore.ts:181-195`), and a drag of a tab or of the toolbar's repository button
    (both `useTabDrag.endDrag`, `src/screens/RepoWindow/useTabDrag.tsx:207-243`) onto another window's strip or onto
    empty space (a tear-off).
  - Each hands over the path alone. `spawn_window` parks a `Layout` (`{tabs, active, rect}`) for the new window
    (`src-tauri/src/commands/window.rs:438-452`, `spawn` at `:152-261`), which takes it with `take_pending` (`:456-459`)
    and opens each path with `openTab` (`src/App.tsx:49-89`). `drop_tab` emits `tab-adopt` with `{path, x}` to the
    window under the cursor (`window.rs:987-1036`), whose handler opens the path
    (`src/screens/RepoWindow/TabStrip.tsx:28-35`).
  - `openTab` → `repoStore.openRepo` starts the tab fresh: `spec` all, `filter` empty, nothing selected
    (`repoStore.ts:340-357`), and the commit store resets on the repository change (`commitStore.ts:648-650`).
  - The tab's state is in the source window's stores (the active tab) or in `tabsStore.saved` (a background tab). Every
    field is plain data (the survey checked each snapshot).
  - The view is lost the same way: §Q accepted it on 2026-10-17 (`open-items.md:619-623`, *A tab moved to another
    window opens in History*) because carrying it needed this same Rust change.
  - A window that fails to build gives its paths back to the source (`tab-spawn-failed`, `window.rs:233-257`), which
    reopens them fresh (`App.tsx:176-183`).
  - **The detach race.** `spawn_window` resolves before the new window exists, and detach does not move the
    repository's holder the way `drop_tab` does (`window.rs:1006-1007`). If the new window's `open_repo` ever ran
    before the source's `close_repo`, it would get `openElsewhere` (`src-tauri/src/commands/repo.rs:106-108`), focus
    the source and open nothing (`tabsStore.ts:103`). The tear-off from `drop_tab` (`window.rs:1017-1034`) is the
    same. Reasoned; the new window takes far longer to load.
- **AO5.**
  - A tab switch restores the diff store's `selectedPath` and `diff` (`src/store/diffStore.ts:417-460`), and the first
    render shows them.
  - Then the details pane's effect runs on the new `repoId` and calls `load(repoId, target, rowPath)`
    (`src/screens/RepoWindow/DetailsPane.tsx:49-52`). `rowPath` is `null` outside a path filter. `load` blanks the
    selection and the diff (`diffStore.ts:269-293`), so the diff body unmounts, then picks `preselect ?? files[0]`
    (`:303-304`). A fresh body mounts at scrollTop 0. Nothing stores a diff's scroll.
  - That reload is wanted: it applies the window's current whitespace and context settings (N1 of Plan A, pinned by
    `diffStore.test.ts:67`). Only the blank and the choice of file are the bug.
  - StrictMode (`src/main.tsx:15`) runs the effect twice in dev, so a second same-target `load` follows the first.
- **AO6.**
  - The commit store's snapshot keeps the open file and its diff (`commitStore.ts:612-636`). It leaves out `diffList`,
    the list (`unstaged` or `staged`) the shown diff was loaded from, and `reset()` doesn't touch it
    (`:568-598`), so after a switch it still holds the tab left's value.
  - So when the two tabs' lists differ, the next `loadDiff` sees another list (`commitStore.ts:203`), blanks the diff,
    and the body remounts at the top.
  - When the lists match, the diff object survives. The body still starts at the top when the Changes view mounts
    fresh (the tab left was in History). It also starts at the top when the file differs from the tab left's
    (`useEffect(…, [path])`, `src/screens/RepoWindow/DiffViewer/DiffViewer.tsx:500-503`). And when both tabs show the
    same path, the other tab's scroll is carried over (the `[rows]` effect, `:446-472`).
  - Which of these BX 6b hit isn't known.
- **AO7.**
  - virtual-core's default size watch reports the border box: `offsetHeight` at first, then the ResizeObserver's
    `borderBoxSize` (`node_modules/@tanstack/virtual-core/src/index.ts:84-87`, `:108-155`). `scrollToIndex` with `auto`
    aligns a row's end to that height (`getOffsetForIndex`, `:2058-2097`). The scrollbar is 10 px
    (`src/theme/base.css:32-35`), so a line brought in from below stops with its bottom 10 px under a horizontal
    scrollbar.
  - The clamp uses `clientHeight` (`index.ts:1999-2006`), so the last line is not affected.
  - The diff body (`DiffViewer.tsx:427-432`) and the file content view (`FileContent.tsx:167-172`) scroll sideways and
    call `scrollToIndex` for the cursor (`DiffViewer.tsx:536`, `:576`; `FileContent.tsx:207`). Their scroller
    (`.scroll`, `DiffViewer.module.css:72-82`) has no padding or border, so its content box is its client box.
  - The two file lists don't scroll sideways. The grid might, with many lanes in a narrow pane: its graph cell has no
    width cap and its rows don't clip (`RevisionGrid.module.css:94-130`). Reasoned, not seen.
  - Reasoned from the ResizeObserver spec: an observer on the border box doesn't fire when only a horizontal scrollbar
    comes or goes, since the border box doesn't change.

## Design

1. **AP2: the new HEAD takes the selection when the old one had it.**
   - In `commit()`, before the commit, note the selection (D1 (a)):
     - the working-tree row (`wtSelected`);
     - nothing (`selectedIndex === null && !wtSelected`);
     - or a commit index, and whether its row's oid is HEAD (`refs?.head.oid ?? repo.head.oid`). A row whose page isn't
       loaded counts as another commit, and so does a compare (`compare` set), whichever commit anchors it (P4-1 (a)):
       `reselect` sets only `selectedIndex` (`repoStore.ts:190-191`), so moving it would leave the pair without its
       selected commit (`:48`).
   - After `syncRefs()`, for a commit that landed, in the same tab (`repoId() === id`), the new commit takes the
     selection if any of these held, and only while the working-tree row is not selected now:
     - the working-tree row was selected;
     - nothing was selected;
     - HEAD was selected.
   - With changes left, the working-tree row stays: the user is still staging. Another selected commit stays, as
     today. An amend follows the same rule (the old HEAD was rewritten).
   - **A selection the user makes during the commit's wait wins (P5-1 (a)).** The wait (hooks, signing, the status
     refresh, a refs round trip, `commitStore.ts:541-553`) blocks no click or view switch. A counter in `repoStore`,
     bumped by `select`, `compareWith`, `revealOid` and `selectWorkingTree(true)` (not `dropWorkingTreeIfClean`'s
     `false`), is noted before the commit; a different value after `syncRefs()` skips the move.
     - Each bumps only when its `set` changes `selectedIndex`, `wtSelected`, `compare` or `preview` (P6-4 (a), P7-1
       (b)): a click on the working-tree row already selected is no pick, and one that closes a stash preview is.
     - Accepted with P7-1 (b) (the owner, 2026-10-21): `revealOid` of the commit already selected (a sidebar branch,
       the palette's *Go to branch*, a blame drill-down, `actions.ts:206`) with no preview open changes none of them,
       so it still loses to the move; for the drill-down the pane then reloads for the new HEAD.
     - The `pendingSelect` clear (P2-1) happens on every call that reaches its selecting `set`, changed or not (a
       `revealOid` miss reaches none); only the counter's bump depends on a change.
     - `revealOid` bumps in its selecting `set` (`repoStore.ts:542`), not on entry: a miss (`:536`) selects nothing.
   - The mechanism is a new `repoStore.reselectTo(oid)`: `pendingSelect = {oid, generation: log.generation}`, then
     `reselect()`.
     - `reselect` already waits for a walk that hasn't reached the row, and falls back to the first row when it's gone.
     - A `generation` of `null` (a walk being started) is filled in by `startLog` (`repoStore.ts:481`).
     - Replacing `pendingSelect` also stops the old selection's reselect, which checks `pendingSelect !== pending` after
       its wait (`repoStore.ts:179`).
     - No `reveal`, so the grid doesn't scroll.
   - **Not under a filter (P2-15 (a)).** A walk with a text or path filter (`log.flat`, read after `syncRefs()` with
     the other checks; `syncRefs` never changes the text or path filter, only `workingTree`, `statusStore.ts:175`)
     skips it: the new HEAD may not match, and `reselect` would fall back to the first row (`repoStore.ts:187`).
     Today's behaviour stays there.
   - **The app's own waiting selection survives a walk restart (F10 (a), P2-1 (a)).** A `reselectTo` marks its
     `pendingSelect` as the app's. `startLog` keeps a marked one, still marked and with its generation reset to `null`
     for `repoStore.ts:481` to fill, rather than recomputing it from `rows[selectedIndex]` (`repoStore.ts:462-463`);
     so it survives any number of restarts (the AO1 target can see two after the carry's `reselectTo`: the status
     refresh's and the refs' `syncWalkSeed`, `statusStore.ts:266-271`; the carry's own `startLog` runs before it,
     Design 2). Without it, a status or refs restart before the row is found would put the selection back on the old
     row (AO1's first page selects row 0, `repoStore.ts:272`). A restart's own carried oid is still recomputed, as
     today (pinned by `repoStore.test.ts:210-231`).
   - **A user's selection clears any waiting one (P2-1 (a)).** `select`, `selectWorkingTree`, `compareWith` and
     `revealOid` (`repoStore.ts:508-546`) set `pendingSelect = null`, so a click made while a reselect waits is not
     undone when it answers. Today a restart's own reselect overrides such a click (pre-existing, reasoned); this fixes
     that too. Each clears it in the `set` that selects: for the async `revealOid`, at `:542`, not on entry, or a
     restart during its page fetch would compute a new pending one from the old selection. The two internal callers
     clear it too, harmlessly:
     - `dropWorkingTreeIfClean` (`statusStore.ts:190`) runs only with the working-tree row selected, when no
       `pendingSelect` exists (`repoStore.ts:462`);
     - `runOp`'s conflict `selectWorkingTree()` (`opsStore.ts:250`) can clear a restart's own waiting selection, but
       with the row selected the hidden `selectedIndex` isn't shown, and today's restarts already stop tracking it
       then (`repoStore.ts:462`).
   - **Accepted (F10 (a)):** `withApplying`'s status refresh restarts the walk before `syncRefs` does
     (`statusStore.ts:198` → `:129`). That walk can show the old HEAD selected for about one refs round trip before
     `reselectTo` moves it, plus a page round trip when the restart's first page comes back empty (P24-1).
2. **AO1: a tab carries its state to the other window.**
   - A `TabCarry` (`src/store/tabsStore.ts`):
     - the commit draft: `summary`, `body`, `amend`, `signoff`, `sign`, `prefill`;
     - the walk: `spec`, `filter`;
     - the selection: the working-tree row, or a commit's oid (a compare or a stash preview is not carried; its
       selected commit is);
     - the view (D2 (b));
     - the grid's top row (P27-1 (b), the owner, 2026-10-22): `lastTopRow()` for the active tab, the snapshot's
       `reveal.index` for a background one (`repoStore.ts:571-577`), as a tab switch keeps it (smoke AW 1); and the
       walk's total with it (the active tab's `log.total`, a background one's `repo.log.total`, P28-1).
   - It's built from the live stores for the active tab, from `saved[id]` for a background one.
   - It travels as opaque JSON beside the path, never inside `Layout`. `Layout` is what `layout.json` holds, and the
     draft must not reach the disk.
     - `AppState.pending` holds a `Pending { #[serde(flatten)] layout: Layout, carry: Option<Value> }` (F8), with
       `skip_serializing_if = "Option::is_none"` on `carry`. The frontend then still reads `{tabs, active, rect?,
       carry?}` from `take_pending`, and a carry-less reply is the `Layout` it reads today.
     - Every hand-over sends one (P5-3): detach and the drags always pass a carry object, its fields at their
       defaults when the tab has nothing to carry or a background tab has no `saved[id]`. Its presence is how
       `spawn` tells a hand-over from a restore (Design 2's claim move), so a forgotten one must not compile (P6-1
       (i)): `carry` is a required parameter of `ipc.dropTab`, and `spawnWindow`'s `placement` and `carry` lose
       their defaults (`ipc.ts:102`), so restore passes `null, null` (`App.tsx:75`) and detach `null, carry`
       (`tabsStore.ts:188`).
     - `spawn_window(payload, placement, carry)` parks it.
     - `drop_tab(…, carry)`: the `tab-adopt` event's payload gains `carry`, and the tear-off passes it to the spawn.
     - A window that fails to build puts the carry back in `tab-spawn-failed` (`{paths, carry}`), and
       `onTabSpawnFailed` hands it to `openTab` (F9 (a)). The carry belongs to the one path: detach and the tear-off
       move one tab, and a restore's multi-tab spawns carry none.
     - Restore and the second launch pass none.
   - The target applies it in `openTab(path, at, carry)`, after `openRepo` resolves, where the resets are over:
     - the draft with a `setState` on the commit store (`amend` has no side effect set this way: pass 1 checked);
     - the walk with `startLog(spec, filter)`, which supersedes `openRepo`'s own walk;
     - the selection with `selectWorkingTree()` or `reselectTo(oid)` (Design 1's);
     - the view with `setView`;
     - the top row after the carry's `startLog`, the way `restore` puts it back (`repoStore.ts:579-588`: `topRow` and a
       `reveal` aligned `start`), through a small repoStore action, so the grid opens where the tab was (its mount
       effect, `RevisionGrid.tsx:87-98`, or the `reveal` effect, `:100-109`). The same repository and walk give the
       same rows, so the index usually names the same commit; a ref moved in between can shift it by a few rows
       (reasoned; accepted with this ruling).
     - The same action raises `log.total` to the carried total (P28-1, taken under the owner's rule). A tab that
       arrives in History has its grid mounted during `openRepo` (`tabsStore.ts:120`), and the carry's `startLog`
       keeps `openRepo`'s total (`repoStore.ts:472`), which can be short or 0 then (an empty first page, `repo.rs:432`;
       a first progress dropped before the generation is known, `repoStore.ts:550`, with the next one no sooner than
       100 ms later, unless the walk ends first, `repo.rs:358`, `:22`, `:396`). The `reveal` effect would clamp the
       row to that total and clear the request (`RevisionGrid.tsx:107`; virtual-core `index.ts:2139`), so the grid
       would open at the top. With the carried total the grid shows placeholder rows until the pages land, as after a
       tab switch (`restore` brings the snapshot's `log`); a complete page or the final progress corrects it
       (`repoStore.ts:271`, `:551`). Reasoned, not measured. In Changes the request waits in the store until History
       mounts.
     - Accepted (P29-1 (a), the owner, 2026-10-22): every progress, not only the final one, sets `total` to the rows
       walked so far (`repoStore.ts:551`), in steps of 1000 (`walker.rs:9`). A carried row near or past row 1000
       (within a screen of it, since the scroll stops a screen short of the count), with the walk still running
       when the grid scrolls, loses its place: the count drops too low to scroll to it, the browser clamps the
       scroll, and nothing puts it back. A tab switch has the same gap today (`reanchor` gives up once `topRow` moved,
       `repoStore.ts:211`). Reasoned, not measured; a §Q row in Steps 8.
   - A tab already open in the target keeps its own state, and the carry is dropped.
   - **Only while the moved tab is still active (P15-1 (a)).** The tab becomes active (`tabsStore.ts:116`) before
     `openRepo`'s wait (`:122`, about two round trips), and Ctrl+Tab or Ctrl+W still work in it (the overlay only
     swallows clicks, `BusyOverlay.tsx:7`; `activate` guards only running ops, `tabsStore.ts:138`). So the carry is
     applied only if `get().active` is still the moved tab's id when `openRepo` resolves; otherwise it's dropped, so a
     draft can't land in another repository's editor. Reachable by a drop onto another window (its strip shown or not,
     `TabStrip.tsx:21-23`) or onto any window still restoring (`App.tsx:33-34`), the spawn-failed reopen, and a second
     open started from the keyboard during the wait (Ctrl+T, `useShortcuts.ts:66-68`; the palette's recents,
     `commands.tsx:74`), in any window, a detach's or tear-off's own included (P17-1). Reasoned, not run.
   - **In one synchronous run after that check (P16-1 (a)).** The carry's steps don't wait between them: `startLog` is
     called, not awaited, and `reselectTo` comes after its synchronous part, so `repoStore.ts:481` fills the `null`
     generation (Design 1). An `await` there would let a Ctrl+Tab split the carry, its selection or view (or a draft
     set after it) landing on the other tab. A switch during that walk's start only drops the waiting selection, the
     case accepted under P5-5 / P6-2 (*Not in this plan*).
   - **The detach race, folded in (the owner, 2026-10-21).** A hand-over's `spawn` (detach and the tear-off: the
     spawns that pass a carry, P4-3 (a)) moves the source's claim on the tab's repository to the new window's label at
     once, as `drop_tab`'s adopt does, through a new `AppState::move_claim(from, to, id) -> bool` (`holders` is
     private, `state.rs:25`, and `holder_of` can't ask about one label). It moves only a claim `from` has. The id comes
     from the path as `drop_tab` gets it (`RepoId::from_workdir`, `window.rs:1005`). Restore and second-launch spawns
     never move a claim: `layout.json` can list one repository in two windows (a closed window's entry kept for its
     grace, `window.rs:86-95`), and a move there could take `main`'s live claim.
   - A hand-over's window that fails to build gives the claim back before `tab-spawn-failed`, if `move_claim` moved
     it and the source window still exists (`app.get_webview_window(source)`). If it's gone (closed in the gap;
     `release_all` already ran, `lib.rs:123-128`), the target's claim is dropped instead, and the handle with it when
     nobody holds it (as `close_repo` does). A claim given back to a window that's gone would block the repository for
     the rest of the session (pass 2).
   - D3 (a): a failed open in the target loses the carry with the tab. With the claim moved first, the target also
     keeps a claim for a tab it doesn't have, until it closes: opening the repository elsewhere focuses it (P2-3 (a),
     accepted). Three more rare cases are accepted with it (the owner, 2026-10-21):
     - **P3-7:** the source closing between the failure branch's window check and the give-back leaves the claim on a
       dead label, and the repository answers "open elsewhere" for the rest of the session. Reasoned; needs a failed
       build and a close in that gap.
     - **P3-8:** an operation started in the round trip between the hand-over's running check and `closeTab`'s keeps
       the source's tab, and with the claim moved the target opens the repository too: two windows own it. The adopt
       path already has this (`useTabDrag.tsx:226-227`). The operation's output also streams to the target's dock, not
       the source's where it runs: op events go to the holder (`ops.rs:82`, `:98-101`). Reasoned; nothing starts an
       operation on its own.
     - **P15-1:** a tab switch or close during the moved tab's open drops its carry (the guard above).
   - All of these go in the §Q row at the records step.
3. **AO5: a History tab comes back on its file, and stays on screen through the reload (F1 (a)).**
   - `diffStore.load`, when the call is for the target the store already holds, in the same repository (compared by
     value with `eqDeep`: after a restore the store holds the snapshot's object and `DetailsPane` builds a fresh one,
     `DetailsPane.tsx:36-46`):
     - keeps `files`, `selectedPath` and `diff` on screen while it reloads (the other fields reset as today);
     - picks `preselect ?? the held selectedPath` (read before any `set`), if it's in the new list, else the first file.
   - The shared `loadDiff` (`diffStore.ts:155-174`, also behind `selectPath`, `toggleWhitespace` and `setContext`)
     keeps the old diff object when the reloaded hunks are identical, for the same path and target, as `commitStore`'s
     does (`commitStore.ts:214-216`).
   - So the body stays mounted, Design 4's seed applies on the first render, and Plan A's `[rows]` anchor
     (`DiffViewer.tsx:451-466`) carries the top line if the reload brings a different diff.
   - The cost: for one round trip, the restored diff shows with the tab's old whitespace and context settings. N1's
     reload itself stays.
   - Other same-target loads keep their file too: a compare range or a stash preview coming back on a tab switch, a
     blame drill-down onto the commit already shown (`actions.ts:221`), and StrictMode's second call. The stash browser
     already skips a same-target load (`StashesDialog.tsx:67`).
   - So does clearing a path filter while the same commit stays selected (P10-O1 (a)): only `rowPath` changes, to
     `null` (`DetailsPane.tsx:49-52`), so the pane stays on the file the filter showed, where today it goes back to
     the first file. With P22-1's in-page reselect (below), the page that holds the commit sets the selection to its
     new, path-less row in the same `set` that writes it, so the load is a same-target one and the file is usually
     kept: whenever the old row's page doesn't land first without the commit (`repoStore.ts:272` keeps the old index
     until then), when today's first file follows. Reasoned (P11-O1 (a), revised by passes 23 and 24).
   - The Files tab already has its own memory (`treeSelection`, `diffStore.ts:137`).
   - The changed-file list still scrolls to its top on the switch (its `[target, tab]` effect,
     `ChangedFileList.tsx:117-120`): its selected row stays.
   - **A tab left mid-reload (P4-2 (b)).** `restore` clears the target of a snapshot taken mid-load
     (`diffStore.ts:457-459`), and this same-target reload is one (`filesLoading`, then `diffLoading`). So a tab passed
     through with Ctrl+Tab faster than one round trip would come back as a new target. `restore` keeps the target it
     cleared in a module variable, and `load`'s same-target check compares against `target ?? that one`; the next
     `load` or `restore` clears it. The store's `target` stays `null`, which the stash browser's guard
     (`StashesDialog.tsx:67`) relies on.
   - **A tab whose repository changed in the background (P22-1 (b), the owner, 2026-10-21).** On the switch,
     `refreshAll`'s walk restart (`actions.ts:385`) writes its first page into `rows` but keeps the old
     `selectedIndex` (`repoStore.ts:245-252`, `:272`), and the reselect by oid only runs after that page
     (`repoStore.ts:486-487`). With commits added above the selected one (a commit or pull in a terminal), the row at
     that index is briefly another commit: the details pane loads it as a new target, then the reselect's commit as
     another, and the tab lands on the first file at the top, its seed spent. The fix is at the root, in `fetchPage`:
     when a page of `pendingSelect`'s generation holds its oid, the same `set` that writes the rows sets
     `selectedIndex` to that row and clears `pendingSelect`, before the truncation check (`:254-262`), so a surviving
     anchor keeps its compare pair. Every walk restart goes through it (fetch, pull, commit, tab switch), so it also
     removes the same wrong-commit flash after a pull in the active tab (reasoned, not seen). It is no pick (Design 1's
     counter): like `reselect`'s, its `set` bumps nothing, and it sets no `reveal`, so the grid doesn't scroll.
   - **`reselect` lets the page select (P24-1 (b), the owner, 2026-10-22).** A restart's first page often comes back
     empty (`start_log` returns before the walk has rows, `src-tauri/src/commands/repo.rs:338-399`; `get_log_page`
     doesn't wait, `:432`; `repoStore.ts:201`, `:554`), so there is no in-page match, and `reselect` asks `findLogRow`.
     Today it then sets `selectedIndex` at once (`repoStore.ts:191-192`), into the old walk's rows if the answer beats
     the page: P22-1's symptom again. So when the index comes from the backend (its page isn't loaded), `reselect`
     keeps `pendingSelect` and calls `void fetchPage(page)`, and the in-page match selects it when that page lands. An
     index from a loaded page (`loadedIndex`, or equally a backend index whose page is in `loaded`) is set at once, as
     today; the "gone for good" fallback is unchanged. Also on `onProgress`'s retry (`:556-557`), where the lookup can
     beat the page-0 refetch.
     - Left over, accepted with P22-1: the old row's page landing first without the commit shows another commit at
       the old index until the commit's own page lands (reasoned).
     - Accepted with this ruling: a fetch of that page failing with a non-stale error leaves the selection on the old
       index and `pendingSelect` waiting until the next restart; a click still clears it (P2-1).
     - Accepted by the owner (P25-O1 (a), 2026-10-22): `fetchPage` joins a request already in flight for that page
       (`repoStore.ts:227-228`). One answered before the walk reached the commit lands without it, and is fetched
       again only near the viewport (`:277`, `:282`) or on a later `onProgress`; so after the walk completed and with
       the grid scrolled away, the selection waits for the next click or restart. Reasoned; a sub-second race plus a
       scroll.
   - Reasoned from the code, not run: both depend on React rendering the shifted row before the reselect's promise
     lands, and on IPC timing (how often a first page is empty) that wasn't measured.
4. **AO5 and AO6: the diff comes back where it was scrolled.** A per-tab scroll memory for the window's two main
   diffs, the way the grid keeps its row (`noteTopRow` → the snapshot's `reveal`, `repoStore.ts:118-126`, `:571-588`).
   It lives in a new `src/screens/RepoWindow/DiffViewer/diffScroll.ts`, beside the pure `scrollAnchor.ts`.
   - **Who notes.** A `remember: "history" | "changes"` prop on `DiffViewer` → `DiffBody`, passed through `CommitDiff`
     and `DiffColumn`, and set only at `DetailsPane.tsx:57` and `CommitPanel.tsx:62` and `:73`. The dialogs (diff,
     commit, stash browser) mount the same two components without it: one open during a switch would note over the pane,
     since `take()` runs before `show()` closes it.
   - **When.** The body notes `{pane, repoId, path, diff, rows, view, top}` on mount, on each scroll (a new `onScroll`
     on the scroller, which has none today, `DiffViewer.tsx:553-615`), and when it applies a seed. One slot for the
     note and one for the seed, not one per pane: only one main diff shows at a time.
   - **Saving.** `take()` moves the note into the tab's `Snapshot` and clears it. `put()` replaces the seed with the
     snapshot's. `openTab`'s new-tab branch, after its `take()` (`tabsStore.ts:117`), and the last tab's close clear
     both (P14-1): not at the top of `openTab` (an already-open tab goes through `activate`, whose `take()` needs the
     note) nor at its end (that would wipe the seed `activate`'s `put()` set).
   - **Restoring.** The first body with the seed's pane, repository and path scrolls to
     `carryOffset(seed.diff, seed.rows, seed.top, diff, rows, seed.view === view)`, Plan A's anchor
     (`scrollAnchor.ts:38`). So a diff that changed while the tab was away keeps its top line, not its pixels. It
     takes the place of the `[rows]` effect's carry for that commit. A ref holding the seeded path makes the `[path]`
     effect (`DiffViewer.tsx:500-503`) skip its scroll to 0 for that path; the next change of path clears it, so
     StrictMode's second run of the effect skips too. A body with another pane, repository or path drops the seed, and
     a seed no body took by the restore's first committed render is dropped then (a Changes tab with no file
     selected mounts no body, `DiffViewer.tsx:242`), so it can't land on a later click. The drop is a passive effect
     in `RepoWindow` keyed on `tabsStore.active`: all of a commit's layout effects run before any of its passive
     effects, so a body that mounts or stays mounted in that commit has taken the seed in its `[rows]` layout effect
     (`DiffViewer.tsx:446`) by then. Reasoned from React's order and its batching of `put()`'s synchronous updates
     into one commit, not run.
   - **AO6's blanking.** The commit store's snapshot adds `diffList`, so the diff object survives a switch whatever the
     other tab's list (`loadDiff`'s `changed` is false, and `commitStore.ts:214-216` keeps the identical object).
   - The cursor and the line selection are not kept (*Not in this plan*).
5. **AO7: the size watch reports the visible box (D4 (a)).**
   - An `observeVisibleRect` in `src/lib/` reports `{width: clientWidth, height: clientHeight}`.
   - It reads them at once, then on each callback of a ResizeObserver on the scroller's content box
     (`observe(el, {box: "content-box"})`). The spec has the content box change when a scrollbar comes or goes, where
     the border box does not. Reasoned; to be measured in the walk.
   - Without a ResizeObserver (jsdom: `DetailsPane.test.tsx`'s diff and Files-tab tests run the real watch), it
     reads once and returns a no-op, as virtual-core does (`index.ts:128-130`).
   - Used by the diff body and the file content view.
   - Plan A's `[bar]` effect (`DiffViewer.tsx:483-498`) writes `scrollRect` itself; it changes to the same box:
     - it writes `clientWidth` / `clientHeight`, not `offsetWidth` / `offsetHeight`;
     - `before` becomes `scrollRect.height`, without the `offsetHeight - clientHeight` it subtracts now;
     - the jsdom guard (`if (el.offsetHeight)`) stays.

## Decisions for the owner

- **D1 (AP2): which selections move to the new HEAD after a commit.** Taken: (a), the owner, 2026-10-21.
  - (a) The working-tree row once the tree is clean, nothing, or the old HEAD. Another commit stays, and the
    working-tree row stays while changes are left. Recommended: it fixes the BW case and leaves a selection the user
    made elsewhere alone.
  - (b) Always the new HEAD, whatever was selected. Simpler to explain. It takes away a commit the user picked on
    purpose (to compare, say) and moves them out of the working-tree row with changes left.
- **D2 (AO1): what travels with the tab.** Taken: (b), the owner, 2026-10-21.
  - (a) The draft, the walk and the selection: the row's scope.
  - (b) As (a), plus the view. One more field on the same channel; it closes the §Q row *A tab moved to another window
    opens in History* (`open-items.md:619`). Recommended: the Rust change that row was waiting for is this one.
    Widened by P27-1 (b) to the grid's top row (and by P28-1 to the walk's total that keeps it).
  - (c) As (b), plus the open diff file and its scroll (Design 4's memory). More to apply in the target, and a larger
    walk.
- **D3 (AO1): a failed open in the target.** Taken: (a), the owner, 2026-10-21.
  - Today the source closes its tab once the hand-over is sent (`tabsStore.ts:188-194`, `useTabDrag.tsx:236-239`). If
    the target's open then fails, the carried draft goes with the tab, as the tab itself does today.
  - (a) Accept, as a §Q row with a trigger. Recommended: the target opens a repository the source had open a moment
    ago, so a failure needs the repository to vanish in between. Reasoned, not seen.
  - (b) Keep the source's tab until the target confirms. That needs a confirm round trip through Rust for all three
    paths, and a rule for a target that never answers.
- **D4 (AO7): which scrollers get the visible-box watch.** Taken: (a), the owner, 2026-10-21.
  - (a) The two that scroll sideways: the diff body and the file content view. Recommended: the only ones with the bug.
  - (b) All five virtualizers. The other three would gain nothing measurable today, but they would be safe if one ever
    scrolls sideways.
  - Pass 1's F14 found the grid might scroll sideways after all (*What happens now*, AO7); the owner kept (a) and a
    note in *Not in this plan* (2026-10-21).
- **D5 (the walk): where it runs.** Taken: (a), the owner, 2026-10-21.
  - (a) Windows in full on the VM, plus AO1's *Move to new window* and tear-off rows on the Linux VM. Recommended:
    AO1's Rust change runs on every OS, and the drop onto another window is Windows-only (`window_at`,
    `window.rs:908-935`).
  - (b) Windows only, with a §Q row for Linux and macOS like Plan A's.

## Tests

1. **AP2** (`commitStore.test.ts`):
   - A commit with the working-tree row selected that empties the tree selects the new HEAD (`reselectTo` called with
     the returned oid).
   - One with changes left keeps the working-tree row.
   - One with the old HEAD selected moves; one with another commit selected stays; one with nothing selected moves.
   - An amend with HEAD selected moves.
   - A failed commit moves nothing.
   - A commit whose tab was switched away during the wait moves nothing.
   - A commit under a text or path filter doesn't call `reselectTo`.
   - A commit with a compare whose anchor is HEAD keeps the compare and its selection.
   - A click (`select`), a compare, `revealOid` or the working-tree row picked during the commit's wait stays: no
     `reselectTo`. The tree turning clean (`dropWorkingTreeIfClean`), a failed `revealOid` and a click on the
     working-tree row already selected don't count as a pick. A click on the selected row that closes a stash preview
     does.
2. **`reselectTo`, `startLog` and `fetchPage`** (`repoStore.test.ts`):
   - A restart whose first page holds the selected commit at a new index (commits added above it) selects it in the
     page's own `set`: no store state has `rows[selectedIndex]` naming another commit (P22-1). One whose page lacks it
     still waits for `reselect`, as today; the `:210-231` test stays as it is.
   - `repoStore.test.ts:139-163` (a "not found yet" answer after the walk completed is no verdict) keeps its later
     `getLogPage` calls in flight, as its anchor twin does (`:294-298`): otherwise `onProgress`'s page-0 refetch now
     selects the commit itself, and the test passes without exercising the `repoStore.ts:184` guard.
   - A page match with a compare open keeps the pair, the truncation after it notwithstanding.
   - A `findLogRow` answer for a page not loaded (an empty first page) sets no `selectedIndex`: no store state names
     another commit, and the selection lands when that page does (P24-1). A loaded-page index is set at once. A failed
     fetch of that page leaves the old index and the pending selection, which a click clears.
   - `repoStore.test.ts:94-114`'s mock places `oid2` on the page `reselect` now fetches (its generation-2 pages are
     offset by 1000, so page 1 never holds it today).
   - It selects a row of the current walk.
   - It waits for an unfinished walk (`onProgress`).
   - It falls back to the first row for a gone oid.
   - It beats a pending reselect of the old selection that answers later.
   - Called while a walk is being started (`generation` `null`), it resolves against that walk.
   - A walk restart before it resolves keeps its oid, not `rows[selectedIndex]`'s; so do two restarts.
   - A restart's own carried oid is still recomputed at the next restart (`:210-231` unchanged).
   - A click (`select`), the working-tree row, a compare and `revealOid` made while a reselect waits win: at its
     answer, and after a restart. So does a click on the row already selected.
3. **AO1:**
   - `tabsStore.test.ts`: `detach` sends the carry of the active tab and of a background one (from `saved`). `openTab`
     with a carry applies the draft, the walk, the selection (the working-tree row and a commit), the view and the
     top row (a `reveal` aligned `start` and `lastTopRow()`, P27-1), after `openRepo`; `detach` carries the active
     tab's `lastTopRow()` and a background tab's snapshot `reveal.index`, each with its walk's total. With a target
     `log.total` below the carried row, the carry raises it to the carried total, and never lowers a larger one
     (P28-1). A tab already open ignores the carry. A switch to another tab, or a close, during the open leaves the
     tab then active with its draft, walk, selection, view and top row alone, and the carry is dropped (P15-1,
     P16-O3). A switch during the carried walk's start (after `openRepo` resolves) leaves the other tab's selection,
     working-tree row and view alone (P16-1).
   - `TabStrip.test.tsx` and `Toolbar.test.tsx`: the drag's `dropTab` sends the carry, from a tab and from the
     toolbar's repository button.
   - `App.test.tsx`: a pending window opens with its carry; `tab-adopt`'s carry reaches `openTab` (its adopt helper,
     `:240`); `tab-spawn-failed`'s carry reaches `openTab`.
   - Rust:
     - `window.rs` tests: the `Pending` struct's serde round trip, with and without a carry, flattened into the
       `Layout` fields, and a carry-less one serializing as the bare `Layout`.
     - `state.rs` tests (`AppState::default()` builds there, `:316-337`): `move_claim` moves a claim `from` has, moves
       nothing for one it doesn't, and moves one back (the give-back's primitive). That only a hand-over's spawn moves
       a claim is read in review, with the wiring below.
     - The commands' wiring (`take_pending`, `spawn_window`, `drop_tab`'s event, the failure branch with its window
       check, `unhold` and `drop_repo`) takes `State`, `Window` or an `AppHandle`, which the tests can't build: read in
       review.
   - Existing exact-argument assertions change with the new argument: `TabStrip.test.tsx:115`, `Toolbar.test.tsx:298`
     and `:311` (`dropTab`), `tabsStore.test.ts:303` and `App.test.tsx:95` (`spawnWindow`), and every exact `openTab`
     argument assertion in `App.test.tsx` (`:94`, `:103`, `:110`, `:257`, `:276`, `:288`, `:296`, `:300`, `:311`,
     `:325`, `:347`, those whose call gains a carry: vitest's `equals` compares argument arrays' lengths). The
     flattened `Pending` keeps `App.test.tsx:107` and `:130` as they are. The event helpers at `App.test.tsx:240-241`
     (adopt: `({ path, x: 0 })`; spawn-failed: `(paths)`) gain the carry too: `npm run build` type-checks test files.
4. **AO5** (`diffStore.test.ts`):
   - A tab that comes back reloads with the window's settings (the `:67` test), stays on its file, and keeps `files`,
     `selectedPath` and `diff` set during the reload.
   - An identical reloaded diff keeps the old object; a different one replaces it.
   - A new target still blanks and starts on `preselect` or the first file.
   - A held file gone from the reloaded list falls back to the first.
   - A tab left mid-reload (its snapshot's target cleared) comes back on its file, and the store's `target` stays
     `null` until then.
5. **AO5 and AO6** (`DiffViewer.test.tsx`, `tabsStore.test.ts`, `commitStore.test.ts`, a `diffScroll` test):
   - A seeded body scrolls to the carried offset on mount, and no scroll to 0 follows it (`scrolls.offsets`).
   - A seed for another pane, repository or path is dropped, and a body without `remember` neither takes nor notes.
   - A same-path body that stays mounted across the switch takes the seed, not the other tab's offset.
   - `take()` moves the note into the snapshot and clears it; `put` seeds it; a tab that never scrolled saves its own
     mount note, not the previous tab's.
   - A `DetailsPane` test end to end: restore, the same-target load, and the body keeps its seeded offset through it.
     It needs a virtualizer mock like `DiffViewer.test.tsx:29-57`, and goes in a file of its own (P10-O2 (a)): a
     `vi.mock` applies to a whole file, and `DetailsPane.test.tsx` (no virtualizer mock today; its mocks are at
     `:31-54`) keeps the real watch.
   - A seed no body takes (a Changes tab with no file selected) is dropped after the restore's first render, and a
     later click on its path starts at the top.
   - StrictMode: the `[path]` effect's second run doesn't scroll a seeded body to 0.
   - `commitStore.test.ts`: a diff object survives a switch between a tab on a staged file and one on an unstaged
     file, both ways.
6. **AO7** (a `src/lib/` test, and `DiffViewer.test.tsx`, `FileContent.test.tsx`):
   - With a stub ResizeObserver (jsdom has none): the watch reports `clientHeight` at once, observes with
     `{box: "content-box"}`, reports again on a callback, and disconnects on cleanup. Without one, it reports once
     and its cleanup is a no-op.
   - The components pass the new option: the mocks spread `opts` and then override `observeElementRect`
     (`DiffViewer.test.tsx:34-40`), so they check `opts.observeElementRect` is the new watch before overriding it.
   - The bar effect writes the client box and its `before` holds: `covered()` (`DiffViewer.test.tsx:860-865`) sets
     `scrolls.height` to the client height (643 less the scrollbar), since the virtualizer's rect is now that box. The
     `:895` test's 619 holds with a scrollbar of 0.

## Walk: smoke group BY

On the Windows VM, the `bv` fixture plus, for the window moves, a repository with more than 500 commits (AW's
`c:/tmp/t4/big-repo-clone`, `smoke-test-post-v1.md:1758-1759`; on the Linux VM, any repository with more than 500
commits): the moved tab is that one, so a selected commit and a top row below the first screen survive a text filter.
Rows:

1. AP2: open the commit panel (`openCommitPanel`: the working-tree row selected), commit everything; History shows the
   new HEAD selected, with its details.
2. AP2: a partial commit keeps the working-tree row. With the old HEAD selected in History, a commit from the commit
   dialog moves the selection. With an older commit selected, it stays.
3. AO1: *Move to new window* with a draft, a text filter, a selected commit below the first screen and the Changes
   view: the new window has all four, and back in History its grid at the same top row. Again from a background tab,
   and with the working-tree row selected and no filter (the two can't coexist, `repoStore.ts:476`). Again from the
   History view: the new window opens in History at the same top row (P28-1; the unit test pins the raise, the walk
   can't tell it from timing). Keep the top row well inside the first 1000 rows, a screen or more short of row 1000:
   past that is the accepted P29-1 gap (its §Q row in Steps 8), so a lost row there is not a fail (P30-3, P31-1).
4. AO1: the same by a drag onto another window's strip (Windows only), by a tear-off, and by a one-tab window's toolbar
   drag onto another window.
5. AO5: a History tab on its third file, scrolled down; Ctrl+Tab away and back: same file, same top line. Again
   with a commit made in that repository from a terminal while the tab is in the background (P22-1).
6. AO6: the same for the Changes diff, between a tab on a staged file and one on an unstaged file, both ways.
7. AO7, where ↓ moves a cursor: the Changes view's staging diff (History's diff scrolls natively,
   `DiffViewer.tsx:167`) and the file content view with blame on (`FileContent.tsx:246`).
   - A staging diff wider than the pane (a horizontal scrollbar from the start): ↓ to a line below the edge stops with
     the line flush above the scrollbar; the bar shown and hidden keeps it so.
   - The scrollbar coming after the mount with no resize: an unstaged file's staging diff that fits (a staged diff
     doesn't change on an edit), then a long line appended to the file, so the watcher's reload keeps the body mounted
     and the scrollbar appears; the same ↓. This is the content-box callback the jsdom tests can't show (narrowing
     the pane would change the border box too).
   - The same after narrowing the split until a fitting diff doesn't fit.
   - The file content view (Files tab, blame on, a wide file): the same ↓.

Rows 3 and 4's tear-off also run on the Linux VM (D5 (a)).

## Steps

Steps 2–5 each also update any other `src/README.md` entry their change makes stale (P12-1); the lines named are the
ones found.

1. Branch `tabs-grid-deferred` from `main`.
2. AP2, `reselectTo`, `startLog`'s waiting selection, `fetchPage`'s in-page reselect (P22-1) and `reselect`'s page
   fetch (P24-1), with Tests 1–2; the README's repoStore actions (`:72`) and commitStore's `commit` entry
   (`:146-150`), and its repoStore `log` note (`:57-58`), already stale: a complete page does lower `total`
   (`repoStore.ts:271`, P29-O3).
3. AO7, with Test 6; `src/README.md`'s `src/lib` list (`:222`).
4. AO5 and AO6, with Tests 4–5; the README's `scrollAnchor.ts` lines (README `:493`, `:500`) gain `diffScroll.ts`,
   and its Snapshot list (`:54-56`) and diffStore entry (`:87-92`: the held file, the remembered cleared target)
   change.
5. AO1: Rust (`Pending`, the carry on the three commands and the failure event, the claim's move), the IPC types,
   `openTab`, the three senders, with Test 3; the README's `take_pending` and `tab-spawn-failed` lines (`:8`, `:25`,
   `:37`), its `openTab` / `detach` entries (`:44-52`), and its repoStore actions (`:72`) for the top-row action.
6. Gates:
   - `npm --prefix "F:/src/_ pet projects/t4-git-ui" test -- --run` and `… run build`;
   - `cargo fmt --all --check --manifest-path "F:/src/_ pet projects/t4-git-ui/Cargo.toml"`;
   - `cargo clippy --workspace --all-targets --manifest-path "…/Cargo.toml" -- -D warnings`;
   - `cargo test --workspace --manifest-path "…/Cargo.toml"`.
7. Smoke group BY in `docs/smoke/smoke-test-post-v1.md`; the walk on the VM(s).
8. Change review loop, triage, records, squash, on the owner's go at each push. The records already ruled:
   - D2 (b) closes the §Q row at `open-items.md:619`;
   - D3 (a) adds a §Q row, with P2-3, P3-7, P3-8 and P15-1 in it. **Reopen** (the owner, 2026-10-21, P8-4 (a)): a
     moved tab or its draft is lost, or a repository won't open (opening it does nothing, or brings forward a window
     that doesn't show it), or a moved tab stays open in both windows, or an operation's output lands in another
     window's dock (P9-2 (a), P10-2 (a); "after the target fails to open it" dropped from the first case by P15-1
     (a), which loses a carry without a failure);
   - the tab switch before the app's waiting selection is reached (P5-5, P6-2, accepted, with its trigger in *Not in
     this plan*) → a §Q row;
   - a top row near or past row 1000 (within a screen of it) lost to a mid-walk progress (P29-1 (a), the owner,
     2026-10-22; Design 2) → a §Q row. **Reopen:** a moved or switched-back tab opens away from its row near or past
     row 1000 (rows, not commits: under a filter they differ, P31-2; within a screen of it, P32-1);
   - the grid behind a horizontal scrollbar (F14, noted with a trigger in *Not in this plan*) → the owner in triage,
     as a §Q row or a deferral;
   - F10's old-HEAD flash, P7-1's reveal of the selected commit, F1 (a)'s one round trip with the tab's old
     whitespace and context settings, P22-1's flash when the old row's page lands first without the commit, P24-1's
     failed page fetch leaving the old index, P25-O1's reselect joining a page fetch sent before the walk reached
     the commit, and P27-1's carried top row shifted a few rows by a moved ref have no trigger:
     `open-items-done.md`, unless the owner gives one in triage.

## Not in this plan

- The diff's cursor and line selection across a tab switch: they live in `DiffViewer`'s own state, and keeping them
  needs a store.
- Keeping the diff's scroll across a view switch in one tab (History ↔ Changes): Design 4 seeds only on a tab switch.
  Design 3 does keep the History file across one.
- The Files tab's content view scroll across a tab switch: its `[path]` effect starts at the top
  (`FileContent.tsx:175-189`).
- The grid behind a horizontal scrollbar (pass 1's F14; D4 (a) kept by the owner). **Reopen:** the grid is seen
  scrolling sideways, or a row is seen behind its scrollbar.
- A tab switch before the app's waiting selection is reached: `restore` clears it (`repoStore.ts:583`). Accepted by
  the owner, 2026-10-21 (P5-5 (a), reconfirmed as P6-2 (a) with both cases below). In every case the wait is until the
  commit's page lands (P22-1, P24-1; the first page when the commit is on it and the page isn't empty), reasoned, not
  measured.
  - A moved tab comes back on row 0 when a second tab is there to switch to: every way Design 2's P15-1 bullet names
    (a drop onto another window, `window.rs:1000-1014`, `TabStrip.tsx:28-34`, or onto a window still restoring, the
    spawn-failed reopen, a keyboard open during the wait). Reconfirmed with that list by the owner (P17-2 (a)).
  - AP2: `refreshAll`'s walk then re-reads the old selection (`repoStore.ts:462-463`), so the tab comes back on the
    old HEAD, the BW symptom, for a switch inside that wait (the new HEAD is on the first page, so the wait is until
    a non-empty first page lands).
  - **Reopen:** someone loses a carried selection, or sees the old HEAD after a commit, that way.
- AP1, AP3, AO2 and AQ1 stay open in `open-items.md`.

## Review record

- **Pass 1 (2026-10-21):** 21 findings (1 blocker, 9 should-fix, 11 nits), all taken.
  - The owner's rulings: F1 (a), the History diff stays on screen through the reload (it unmounted, and the seed with
    it); F9 (a), the failure event carries the carry back; F10 (a), a waiting selection survives a walk restart, the
    old HEAD's brief flash accepted; the detach race folded in; F14 (a), the grid noted, D4 kept.
  - Fixed in the text: the `[path]` effect's skip (F2); `remember` on `CommitDiff` and `DiffColumn` (F3); the note's
    mechanism, lifetime and key (F4); `diffList` isn't reset (F5); the bar tests' height (F6); the walk's content-box
    and file view steps (F7); the flattened `Pending` and what the Rust tests can reach (F8); `reselectTo`'s generation
    (F10); the broken assertions and the toolbar sender (F11); the walk's extra cases (F12); `diffScroll.ts` beside the
    pure `scrollAnchor.ts` (F13); the Files tab's scroll (F16); HEAD and "nothing" defined (F17); the cargo gates
    (F18); the other same-target loads (F19); the ResizeObserver stub and the option check (F20); the spec claim marked
    reasoned (F21). F15 (no recommendation on the race) went with the race's ruling.
- **Pass 2 (2026-10-21):** 16 findings (1 blocker, 6 should-fix, 9 nits), all taken.
  - The owner's rulings: P2-1 (a), only the app's own waiting selection survives a restart and every user selection
    clears a waiting one (F10's rule kept `repoStore.test.ts:210` red and let a lookup with no verdict linger); P2-3
    (a), the target's leftover claim after a failed open is accepted and named in D3's §Q row; P2-15 (a), no new-HEAD
    selection under a filter.
  - Fixed in the text: the claim given back only to a window that still exists (P2-2); `move_claim` and its
    `state.rs` tests (P2-4); the watch without a ResizeObserver (P2-5); walk row 7's cursor views, the no-resize
    case and blame on (P2-6); `App.test.tsx`'s assertions and the adopt test's file (P2-7); the target compared by
    value, and the file list's scroll (P2-8); a new `onScroll` (P2-9); the `[path]` skip tied to the path (P2-10);
    one slot, and an untaken seed dropped (P2-11); `skip_serializing_if` (P2-12); the restore case marked reasoned
    (P2-13); the carry's one path (P2-14); the `DetailsPane` test's mock (P2-16).
- **Pass 3 (2026-10-21):** 10 findings (2 should-fix, 8 nits, two of them the owner's), all taken.
  - The owner's rulings: P3-7 (a) and P3-8 (a), both accepted into D3's §Q row.
  - Fixed in the text: the untaken seed's drop as a `RepoWindow` effect (P3-1); where each setter clears
    `pendingSelect`, `revealOid` at its select (P3-2); the filter test under Tests 1 (P3-3); walk row 7's unstaged
    file (P3-4); the Rust tests cover the primitives, the failure branch read in review (P3-5); the ids from the paths
    and the give-back gated on what moved (P3-6); the identical-diff keep in `loadDiff` (P3-9); when `log.flat` is
    read (P3-10).
- **Pass 4 (2026-10-21):** 10 findings (4 should-fix, 6 nits), all taken.
  - The owner's rulings: P4-1 (a), a compare counts as another commit and stays; P4-2 (b), `restore` keeps the
    target it cleared so a tab left mid-reload still counts as the same target; P4-3 (a), only a hand-over's spawn
    moves a claim (the restore case rested on IPC order, and `layout.json` can list one repository twice).
  - Fixed in the text: the kept waiting selection stays marked, its generation reset (P4-4); each internal caller's
    own reason (P4-5); "the text or path filter" (P4-6); the layout-before-passive reason (P4-7); pass 3's count
    (P4-8); the op output going to the target's dock (P4-9); the README edits in Steps, and "An" (P4-10).
- **Pass 5 (2026-10-21):** 6 findings (1 should-fix, 5 nits), all taken.
  - The owner's rulings: P5-1 (a), a selection made during the commit's wait wins (a pick counter); P5-5 (a), a tab
    switch dropping a moved tab's waiting selection accepted in *Not in this plan*.
  - Fixed in the text: `runOp`'s reason (P5-2); every hand-over sends a carry, a required argument (P5-3); the full
    list of `App.test.tsx` assertions (P5-4); two paragraphs reflowed (P5-6).
- **Pass 6 (2026-10-21):** 6 findings (2 should-fix, 4 nits), all taken.
  - The owner's rulings: P6-1 (i), the carry required on every `spawnWindow` call, restore passing `null`; P6-2 (a),
    P5-5 reconfirmed with the drop-onto-a-strip and AP2 cases written in; P6-4 (a), only a real change of selection
    counts as a pick.
  - Fixed in the text: `revealOid` bumps at its select (P6-3); `repoStore.ts:462` named (P6-5); three senders, two
    call sites (P6-6).
- **Pass 7 (2026-10-21):** 6 findings (1 should-fix, 5 nits), all taken.
  - The owner's ruling: P7-1 (b), closing a stash preview counts as a pick; `revealOid` of the selected commit with
    no preview open still loses to the move (accepted).
  - Fixed in the text: the `pendingSelect` clear on every call (P7-2); `repoStore.ts:462-463` named (P7-3); the
    records already ruled, listed in Steps 8 (P7-4); the `[target, tab]` effect (P7-5); two wraps, vitest's length
    check, detach's `null, carry` (P7-6).
- **Pass 8 (2026-10-21):** 4 nits, no blocker or should-fix, all taken.
  - The owner's ruling: P8-4 (a), D3's §Q row takes the proposed reopen trigger.
  - Fixed in the text: `DiffColumn.test.tsx` mocks the viewer (P8-1); the clear on a call that reaches its `set`
    (P8-2); P5-5/P6-2 straight to a §Q row in Steps 8, F14 to triage (P8-3).
- **Pass 9 (2026-10-21):** 3 nits, no blocker or should-fix, all taken.
  - The owner's rulings: P9-2 (a), D3's trigger names P3-8's symptoms too; the reviewer's "seen, not a finding" (a
    click on stale rows during a restart's first page keeps an index the new walk may renumber; pre-existing, not
    made worse) gets no record.
  - Fixed in the text: only `DetailsPane.test.tsx` runs the real watch (P9-1); `main.tsx:14` (P9-3, wrong by one:
    pass 10).
- **Pass 10 (2026-10-21):** 3 nits, no blocker or should-fix, all taken, and the reviewer's optional items ruled.
  - The owner's rulings: P10-2 (a), D3's trigger in what a user sees; P10-O1 (a), the path filter's clear named in
    Design 3; P10-O2 (a), the end-to-end test in its own file; P10-N (a), no change for three not-findings (a stash
    preview opened during the wait, pass 8's superseded record, a carried cherry-pick prefill cleared as on a tab
    switch) and the routine move of the fixed rows at the records step.
  - Fixed in the text: `main.tsx:15` (P10-1); `App.test.tsx:240-241`'s helpers (P10-3).
- **Pass 11 (2026-10-21):** 1 nit, no blocker or should-fix, taken, and the reviewer's optional items ruled.
  - The owner's rulings: P11-O1 (a), Design 3's path-filter note says the file is usually not kept; P11-O2 (a), the
    status line names pass 10's rulings; P11-O3 (a), two slightly different but correct line ranges left as they are.
  - Fixed in the text: `DetailsPane.test.tsx`'s mocks (P11-1).
- **Pass 12 (2026-10-21):** 1 nit, no blocker or should-fix, taken, and the reviewer's optional items ruled.
  - The owner's rulings, all (a), no change: P12-O1, a diff kept mounted through a switch notes no scroll for the new
    tab (what it showed was the other tab's offset); P12-O2, the README `:222` citation; P12-O3, the watch's
    `disconnect` where virtual-core `unobserve`s.
  - Fixed in the text: every README entry the change touches, in Steps 2–5 (P12-1).
- **Pass 13 (2026-10-21):** 2 nits, no blocker or should-fix, taken, and the reviewer's "fine as is" items ruled.
  - The owner's rulings, both (a), no change: P13-O1, the README `:44-52` range (the detach entry ends on `:53`);
    P13-O2, "loses its default" for the new `carry` parameter.
  - Fixed in the text: commitStore's `commit` README entry in Step 2 (P13-1); the README line moved above the steps
    (P13-2).
- **Pass 14 (2026-10-21):** 1 nit, no blocker or should-fix, taken, and the reviewer's "fine as is" items ruled.
  - The owner's rulings, all (a), no change: P14-O1, the gate's redundant `--run`; P14-O2, a History tab on the Files
    tab still reloads its content view on a switch (its scroll is already out of scope); P14-O3, a carried draft and
    prefill are guarded as today (`commitStore.ts:506`, `:518`) and the drafts warning follows them.
  - Fixed in the text: where `openTab` clears the note and the seed (P14-1).
- **Pass 15 (2026-10-21):** 1 should-fix, taken, and the reviewer's "fine as is" items ruled.
  - The owner's rulings: P15-1 (a), the carry applied only while the moved tab is still active, else dropped, in
    D3's §Q row with its trigger widened; P15-O1 (a), a closed tab's note left in the slot (keyed by repository,
    harmless); P15-O2 (a), both clears kept; P15-O3 (a), a failed open showing the neighbour tab (existing), no row.
- **Pass 16 (2026-10-21):** 1 should-fix and 1 nit, taken, and the reviewer's optional items ruled.
  - The owner's rulings: P16-1 (a), the carry applied in one synchronous run after the check; P16-O1 (a), D3's
    trigger paragraph rewrapped; P16-O3 (a), the close case in Tests 3; P16-O2, O4, O5 (a), no change (the guard
    compares repository ids, so a same-repository reopen in the gap takes the carry, harmlessly; the trigger names
    the draft, what a user notices; no walk row for P15-1).
  - Fixed in the text: more ways a second tab reaches the guard (P16-2; pass 17 found two more).
- **Pass 17 (2026-10-21):** 2 nits, no blocker or should-fix, taken, and the reviewer's "fine as is" items ruled.
  - The owner's rulings: P17-2 (a), P5-5 / P6-2's accepted case kept and reworded to every way in; P17-O1, O2, O3
    (a), no change (the walk-start test needs no draft, applied first; `openRepo`'s old reselect runs against the
    carry's pending selection harmlessly, gated on generation; the `TabStrip.tsx` range mismatch, as P11-O3).
  - Fixed in the text: the keyboard open and any restoring window in the guard's "Reachable by" (P17-1).
- **Pass 18 (2026-10-21):** 1 nit, taken, and the reviewer's "fine as is" item ruled.
  - The owner's ruling: P18-O1 (a), no change (the start screen's keyboard opens, Enter on a recent and Ctrl+O, are
    covered by "a second open started from the keyboard"; only the examples are partial).
  - Fixed in the text: "Three more rare cases" in D3 (P18-1).
- **Pass 19 (2026-10-21):** 1 nit, taken. From here on, items with an obvious answer take the recommendation without
  a question (the owner's standing rule, 2026-10-21); only a real tradeoff or equally viable options go to the owner.
  - Taken under that rule, all no change: P19-O1, Step 5 doesn't name `lib.rs:155-161`'s second-launch `spawn` (the
    compiler forces the new argument, and Design 2 says it passes none); P19-O2, `diffList` joins the snapshot keys
    but not `reset()`, so the comment at `commitStore.ts:609-611` reads slightly off (harmless: `reset` nulls
    `diffPath`, `:203`); P19-O3, a same-target load onto another file shows the old file's diff for one round trip,
    as `selectPath` does today (`diffStore.ts:312-316`); P19-O4, the note's `repoId` is a store read in `DiffBody`.
  - Fixed in the text: the restarts the app's waiting selection survives are the status store's, after the carry
    (P19-1).
- **Pass 20 (2026-10-21):** 1 nit, taken; its one "fine as is" item taken under the owner's rule.
  - Taken, no change: "the AO1 target can see two" restarts is a possibility, not a measurement (each
    `syncWalkSeed` restarts only when the working-tree seed flips, `statusStore.ts:128-129`; "any number" covers it).
  - Fixed in the text: `repoStore.ts:272` named after pass 19's `statusStore.ts` cite (P20-1).
- **Pass 21 (2026-10-21):** 3 nits (bare `:N` cites resolving to the wrong file), taken; its "fine as is" items taken
  under the owner's rule.
  - Taken: Steps 4's README cites made explicit; no change for the P7-1 bullet not saying "no compare" (a compare open
    before the commit already blocks the move, P4-1, and one opened during the wait is a pick).
  - Fixed in the text: `index.ts:1999-2006`, `tabsStore.ts:138`, `commitStore.ts:214-216` named (P21-1 to P21-3).
- **Pass 22 (2026-10-21):** 1 should-fix and 1 nit, taken; its "fine as is" items taken under the owner's rule.
  - The owner's ruling: P22-1 (b), a background-changed History tab's file and scroll were lost to the walk restart's
    shifted row; fixed at the root in `fetchPage` (Design 3's last bullet), with a test and a walk case. The reviewer
    recommended (a), accept, to keep the plan's scope.
  - Taken: Design 3's one-round-trip cost and P22-1's beyond-first-page flash join Steps 8's trigger-less records
    (O1); walk row 3's working-tree variant says "no filter" (O2); no change for `repoStore.ts:118-126` ending a line
    short (O3, as P11-O3).
  - Fixed in the text: `commitStore.ts:203`, `repoStore.ts:481` and `:462-463` named (P22-2).
- **Pass 23 (2026-10-21):** 1 should-fix and 2 nits, taken; its "fine as is" items taken under the owner's rule.
  - Fixed in the text: with P22-1, clearing a path filter usually keeps the file (Design 3's path-filter bullet,
    P23-1; a change the user sees more often than the text said, for the owner's note); P22-1's remaining flash is a
    commit whose new row is on another page, until its page lands, and the waits in *Not in this plan* follow (P23-2);
    `repoStore.test.ts:139-163` keeps its later pages in flight so the `repoStore.ts:184` guard stays tested (P23-3).
  - Taken: the page match comes before the truncation check, so a surviving anchor keeps its pair, with a test (O4);
    the in-page reselect is named as no pick and no scroll (O2, O5); no change for the generation check that can't fail
    (O1) or the AP2 path now selecting through `fetchPage` (O3).
- **Pass 24 (2026-10-22):** 1 should-fix and 1 nit, taken; its "fine as is" items taken under the owner's rule.
  - The owner's ruling: P24-1 (b), an empty first page let `findLogRow`'s answer set the index into the old rows,
    P22-1's symptom again; `reselect` now fetches that page and lets it select (Design 3), with tests.
  - Taken: the path-filter sentence says the selection moves (and its condition follows P24-1); no change for
    "usually kept" (its condition follows it) or Tests 2's `:210-231`, which resolve through the heading.
  - Fixed in the text: `repoStore.ts:184` named (P24-2).
- **Pass 25 (2026-10-22):** 1 nit, taken; one new limit with the owner, the rest under the owner's rule.
  - The owner's ruling: P25-O1 (a), a reselect joining a page fetch sent before the walk reached the commit accepted
    (Design 3, P24-1's bullets).
  - Taken: F10's flash plus a page round trip on an empty first page (O2); "set at once" may key on the page being
    loaded (O3); no change for the failed-fetch bullet's "until the next restart" (O4: an unfinished walk's
    `onProgress` also retries).
  - Fixed in the text: Step 2 rewrapped (P25-1).
- **Pass 26 (2026-10-22):** 2 nits, taken; its "fine as is" items taken under the owner's rule, all no change (the
  P5-5 wait's longer accepted cases are recorded on their own; the page-keyed "set at once" behaves the same; the
  `ipc.ts:102` cite resolves).
  - Fixed in the text: P24-1's bullet rewrapped (P26-1); Steps 8's list worded without "stale" (P26-2).
- **Pass 27 (2026-10-22):** 1 should-fix, taken with the owner; its "fine as is" items taken under the owner's rule.
  - The owner's ruling: P27-1 (b), a moved tab's selected commit could land off screen; the carry takes the grid's top
    row and the target restores it as a tab switch does (Design 2), with a test and walk row 3's commit below the
    first screen. The reviewer recommended (a), accept, as outside D2's ruled scope.
  - Taken: Design 2 says a compare or stash preview is not carried, its selected commit is (O1); no change for the
    greedy wraps (O2).
- **Pass 28 (2026-10-22):** 1 should-fix and 4 nits, taken under the owner's rule; its "fine as is" items likewise.
  - P28-1 (a): the carried top row could be lost when the moved tab arrives in History, since the carry's walk keeps
    `openRepo`'s short total and the grid's reveal clamps to it. The carry takes the walk's total too, and the top-row
    action raises `log.total` as `restore` does (Design 2), with a test and walk row 3's History variant. Taken as the
    fix that makes P27-1 (b) work as ruled; options (b), a grid reveal change, and (c), accept, were not obvious picks.
  - Fixed in the text: P27-1's shifted row in Steps 8's list (P28-2); README `:72` in Step 5 (P28-3); the walk's
    second repository named, AW's big clone (P28-4); Tests 3's P15-1 case names the top row (P28-5).
  - Taken: no change (O1, O3); D2's (b) says P27-1 (b) and P28-1 widened it (O2).
- **Pass 29 (2026-10-22):** 1 decision, taken with the owner; 3 nits and its "fine as is" items taken under the
  owner's rule.
  - The owner's ruling: P29-1 (a), a mid-walk progress can drop the count below a carried row past the first 1000
    commits; accepted in Design 2, a §Q row in Steps 8. Options not taken: (b) progress never lowers an unfinished
    walk's total (a narrowed walk shows the old count as placeholders), (c) a one-shot minimum total (more state).
  - Fixed in the text: the short-total cites (P29-2); the walk's repository cite and the Linux VM's repository
    (P29-3); Tests 3 checks the raise, not the grid's clamp (P29-4).
  - Taken: walk row 3 says the unit test pins the raise (O1); no change for a failed restart's kept total (O2); Step 2
    fixes the README's stale `log` note (O3); no change (O4).
- **Pass 30 (2026-10-22):** 3 nits and its "fine as is" items, taken under the owner's rule.
  - Fixed in the text: the throttle is a minimum gap, with the final progress unthrottled (P30-1); Tests 3 rewrapped
    (P30-2); walk row 3 keeps its top row within the first 1000 rows, past them the accepted P29-1 gap (P30-3).
  - Taken: no change for "rows walked so far" under a filter or a partial last chunk, the 1000 floor holds (O1); no
    change for a row within one screen of 1000 also clamping, the same accepted gap (O2).
- **Pass 31 (2026-10-22):** 2 nits and its "fine as is" items, taken under the owner's rule.
  - Fixed in the text: walk row 3's top row a screen or more short of row 1000 (P31-1); P29-1's §Q record and
    trigger count rows, not commits (P31-2).
  - Taken: no change (O1, the throttle wording; O2, Steps 8 covers every accepted item; O3, the Steps cover every
    design point and test).
- **Pass 32 (2026-10-22):** 1 nit and its "fine as is" items, taken under the owner's rule.
  - Fixed in the text: Design 2's P29-1 bullet and its §Q record and trigger say "near or past row 1000 (within a
    screen of it)", as walk row 3 does (P32-1).
  - Taken: no change for pass 29's record saying "commits", superseded by P31-2 (O1); the bare `walker.rs:9`, the
    one file of that name (O2); the working-tree row's one-row shift (O3); nothing else found (O4).
- **Pass 33 (2026-10-22):** 1 nit and its "fine as is" items, taken under the owner's rule.
  - Fixed in the text: Design 2's P29-1 bullet says the count drops too low to scroll to the row, true for a row
    just short of 1000 too, and is rewrapped (P33-1).
  - Taken: no change for the trigger's two-note parenthetical (O1); nothing else found (O2).
- **Pass 34 (2026-10-22):** no findings; its "fine as is" items taken under the owner's rule, both no change
  (`restoreTabs` passing a pending window's carry to `openTab` is implied by Design 2, Step 5 and its `App.test.tsx`
  test; "past row 1000" covers rows past 2000). The review loop ends here.
