# Plan: the History / Changes view per tab, 2026-10-17

_Written 2026-10-17. Status: draft for the owner's review; decisions D1–D6 answered by the owner 2026-10-17; review
passes 1–9 taken, pass 10 found nothing, then two cross-plan fixes; pass 11's 2 nits taken; pass 12 found nothing; the
polish plan's pass-10 finding applied; pass 13 found nothing, then one cross-plan nit; pass 14 found nothing: final.
Owner rulings since pass 2: a PR before the merge, hashes after the squash, merge by fast-forward, re-walk after a
rebase only on conflicts in this change's code or test files, the PR opens before the squash._

**Goal:** each tab keeps its own History / Changes view. Switching tabs shows the view that tab was left in; a view
switch in one tab changes nothing in the others. The open-items row *The History / Changes view is one per window,
not per tab* (`open-items.md` §AH, reopened 2026-10-17: the owner wants each tab to keep its own view) closes with it.

No git side effects here, so the standing "like the CLI" rule has nothing to decide.

## What the user sees now

- Tab A in Changes, Ctrl+Tab to tab B → B shows Changes too. Back to A → Changes. The view belongs to the window
  (seen on "the Windows BS 4 walk", as §AH's row puts it, and again on the #32 walk,
  `docs/archive/walks/2026-10-16-npm-group-32-walk.md`).
- A new tab opened while the window shows Changes opens in Changes.
- Close every tab while in Changes (the main window's start screen), then open a repository → it opens in Changes:
  `closeRepo` clears the repository's stores (`repoStore.ts:371-381`) but nothing resets `viewStore`.
- A tab torn off, or moved with *Move to new window*, opens in History: its new window's store starts there.
- A tab adopted by another window (dropped on its strip) takes that window's current view: adopt runs `openTab` in
  the target window (`TabStrip.tsx:28-42`). So does a tab taken back after its new window failed to open
  (`onTabSpawnFailed`, `App.tsx:175-187`).
- A restart opens every tab in History.

## Root cause (verified against `266fc96`)

- `viewStore.ts:1-3`: "Per window, per session: a new window starts on History". One zustand store per window
  (`tabsStore.ts:1-4`: every window runs its own React app with its own stores), holding `view` and
  `railOverride: Record<View, boolean | null>` (`:10-13`).
- Per-tab state lives elsewhere as a snapshot: `tabsStore.Snapshot` (`tabsStore.ts:28-34`) holds the repo, status,
  commit and diff stores' slices, keyed by tab id in `saved` (`:39`). `take()` (`:59`) snapshots the active tab,
  `put()` (`:62-67`) restores the target's, `show()` (`:70-75`) runs it on a switch. `viewStore` is not in that list,
  so the view stays whatever the last tab left.
- The tab id is the repository id (`Tab.id: RepoId`, `:20`). One repository is in one tab app-wide: `openTab`
  activates the tab that already has it (`:100-103`), and a repository open in another window focuses that window
  instead (`openElsewhere`, `:96`). A linked worktree has its own workdir, so its own id and tab.

## Every reader and writer

Readers (all show the active tab, the only one on screen; none needs a change once the store holds the active tab's
view):

- `RepoWindow.tsx:55` picks the view (`:145` mounts `ChangesView` or the grid + details), `:58` the rail override
  for it, `:67` keeps the status sync on in Changes; `:376` `StateBanners` passes the view to `computeBanners`
  (`banners.ts:129`: no "Open commit panel" button in Changes).
- `Toolbar.tsx:67` (the file-history chip's width only in History, `:69`; the chip itself only in History,
  `:387`), `:71-73` (rail override and toggle).
- `ViewSwitch.tsx:10` (the pressed segment).

Writers (all synchronous on the active tab unless noted):

- `ViewSwitch.tsx:20`: a segment click.
- `ChangesView.tsx:22, 47`: the × in the Changes bar → History.
- `useShortcuts.ts:112-121`: Alt+1 / Alt+2. `:102-105`: Ctrl+Shift+` → `toggleRail` (the rail, not the view).
- `CommandPalette.tsx:58`: `setView` for *Views › History* (`commands.tsx:54`); *Views › Changes* runs
  `openCommitPanel` (`:59`, `commands.tsx:55`); `:68` the palette's *Toggle sidebar*.
- `actions.ts:264` `openCommitPanel` → Changes. Called from `RevisionGrid.tsx:146` (Enter on the working-tree row),
  `:237` (the empty repository's button), `RepoWindow.tsx:423` (the banners), the palette, and **`WorkingTreeRow.tsx:50`
  on a 250 ms timer** (a single click waits out the double-click, `:21-22`). The timer is cleared on unmount
  (`:33`), so it survives a tab switch only when the tab switched to is also in History with a working-tree row
  (the row stays mounted).
- `actions.ts:244` `showHistory` → History (file rows' *History*: `FileRowMenu.tsx:99`, `FileContextMenu.tsx:151`,
  `FileContent.tsx:317`).
- `actions.ts:224` `blameAt` → History (`FileRowMenu.tsx:93`, `FileContextMenu.tsx:141`, `FileContent.tsx:159, 301,
  311`). It reads the view before and after an awaited reveal (`:201`, `:214`) and already returns when another tab
  came forward during it (`:204`). Everything after `:204` is synchronous.
- **`commitStore.ts:534-537`**: after a commit that took the last change, closes Changes. It runs after awaits:
  `withApplying` clears `busy` (`:266`) before the status refresh (`:275`), then `commit()` awaits `syncRefs`
  (`:530`). The tab-switch guard checks `busy` (`refusedWhileRunning`, `actions.ts:273`; `activate`,
  `tabsStore.ts:127`), so a switch can land in that gap. Today that closes the window's one view; per tab it would
  close the *new* tab's Changes, and `nothingToCommit()` would read the new tab's status. Reasoned from the code,
  not reproduced.

Tests that drive the store directly (`viewStore`, `commitStore`, `actions`, `ChangesView`, `Toolbar`, `CommandPalette`,
`ViewSwitch`, `useShortcuts`, `RepoWindow`, `RevisionGrid`, `SidebarRail` `.test.*`) keep working: the store still
means "what the window shows", which is now the active tab's.

## Design

1. **Where it lives: the existing snapshot.** `viewStore` keeps `view` as the active tab's view. It gains
   `snapshot(): ViewSnapshot` (`{ view }`) and `restore(s)`, like the other stores (`commitStore.ts:609-618`).
   `tabsStore.Snapshot` gains `view: ViewSnapshot`; `take()` adds it, `put()` restores it last (it subscribes to
   nothing). Every writer keeps calling `setView` on the one store and so acts on the active tab, with no change to
   any of them. Rejected: a `Record<RepoId, View>` map in `viewStore` read through `tabsStore.active`. Every writer
   and reader would change, the map would need its own cleanup on close and detach, and it would duplicate what
   `saved` already does.
2. **Keyed by tab id**, like the rest of `saved`. Within a session tab id and repository are one-to-one (Root
   cause), so "two tabs, one repository" can't arise. Only `layout.json` is keyed by path (D2).
3. **A new tab starts on History (D1).** `openTab` sets the view to History once it has snapshotted the tab being
   left, in the same place it sets `active` (`tabsStore.ts:105-109`). An `openTab` that finds the tab already open
   activates it with its own view (`:100-103`). A failed open would close the new tab (`:112-116`); `closeTab` then
   shows the tab at `rest[Math.min(i, rest.length - 1)]` (`:156`), which for an appended tab is the *last* remaining
   tab, not the one that was active (A, C open, A active, a failed open of B → C), with its own snapshot, view
   included (`:157-158`). That path is unreachable today: with a summary in hand, nothing in `repoStore.openRepo`
   (`repoStore.ts:331-369`) rejects (`startLog` catches its own error, `:490-493`; `refreshRefs` is not awaited and
   has its own catch, `:358-360`; `kvGet` catches everything, `kv.ts:40-47`). So no test for it here; the landing
   tab is §AO's row (*Not in this plan*).
   With no tab (the start screen, `active` null) there is nothing to snapshot; the reset alone runs, which also
   fixes the start-screen case in *What the user sees now*.
4. **Close.** Closing the active tab shows the tab that takes its place with its own snapshot (`:155-158`). Closing
   a background tab drops its snapshot (`:139-140`). Closing the last tab in `main` leaves the start screen. The next
   open resets to History (3).
5. **Tear-off, *Move to new window*, adopt (D3).** The moved tab opens in History in its new window, like everything
   else per tab: the drag and the menu hand over the path alone (`window.rs:1022-1026`, `tabsStore.ts:177`, the
   `tab-adopt` event `window.rs:1008-1012`). An adopted tab, and one taken back by `onTabSpawnFailed`, goes through
   `openTab` (`TabStrip.tsx:28-42`, `App.tsx:175-187`), so it opens in History by Design 3 instead of the target
   window's current view. The windows the tab left and joined keep their tabs' views.
6. **Restart (D2).** Not persisted. Every tab opens in History, as today. `layout.json` unchanged.
7. **`railOverride` stays per window, per view (D4).** Not in the snapshot. Switching between a tab in History and a
   tab in Changes switches which of the two overrides applies, exactly as Alt+1 / Alt+2 do today. The sidebar width
   (`RepoWindow.tsx:117`) stays per window.
8. **Shortcuts and the palette act on the active tab (D5)**, the one on screen. No new commands.
9. **Stale async writers check the tab (D6).**
   - `commit()`: the auto-close also requires `repoId() === id` (`id` is taken at `commitStore.ts:508`). A switch
     in the gap leaves the tab that committed in Changes on its "Working tree clean" empty state; the tab switched
     to is untouched.
   - `WorkingTreeRow`: the timer notes the repository id when set and does nothing if another tab is active when it
     fires. A Ctrl+Tab inside 250 ms of a single click, onto a History tab with a working-tree row, then opens
     nobody's Changes.
   - `blameAt` already has its guard (`actions.ts:204`).
10. **Docs.**
    - `viewStore.ts:1-3` comment: the view is the active tab's (`tabsStore` snapshots it), new tabs start on History,
      the rail override stays per window and per view.
    - `src/README.md:40-45` (`openTab`): resets the view to History. `:49-51` (the snapshot list) gains `viewStore
      (view only)`. `:136-138` (`commit`): the auto-close also requires the same tab still active. `:283`
      "viewStore picks the view" → "the active tab's view (viewStore)".
    - Root `README.md:25` (*Two views*): optionally "…switch; each tab keeps its own".
    - `Toolbar.tsx:387` (the chip's second view read) needs no change.
11. **Accepted limits (owner, F4, 2026-10-17).** Ctrl+Tab between a tab in History and a tab in Changes now
    unmounts one view's panes and mounts the other's (`RepoWindow.tsx:145-158`), as Alt+1 / Alt+2 already do:
    - the details split comes back at `defaultSize="60%"` (`RepoWindow.tsx:149`), not where it was dragged;
    - the commit panel's splits come back at their defaults (`CommitPanel.tsx:46, 55`; `ChangesView.tsx:68`);
    - the focus drops to `<body>` when the focused pane unmounts (reasoned, not walked);
    - the grid's scroll comes back through the mount path (`RevisionGrid.tsx:84-109`): the tab's row and selection
      return.

    Walked as BW 10.

## Decisions for the owner

Owner's answers 2026-10-17: D1 (a), D2 (a), D3 (a), D4 (a), D5 (a), D6 (a).

**D1. What view a new tab opens in.**

- *What it is:* opening a repository in a new tab (Recents, the toolbar's repo menu, a worktree row, the folder
  picker) while the current tab shows Changes. Today the new tab shows Changes, because the window has one view.
- *Why now:* per tab, every new tab needs a starting view, and the reset point (Design 3) depends on it.
- *Options:*
  - (a) **History always.** One line in `openTab`. Same as a new window (`viewStore.ts:2`), a restart and a moved tab
    (D2, D3), so every way a tab appears agrees. Risk: someone in Changes who opens a second repository to commit
    there needs Alt+2.
  - (b) **Inherit the current tab's view.** No reset (today's behaviour). A repository opened from the start screen
    after the last tab was closed in Changes also opens in Changes, since `closeRepo` doesn't reset `viewStore`
    (`repoStore.ts:371-381`). Risk: a new repository's tab opens straight into its commit panel, which is the
    inheritance the reopened row reported; and a torn-off tab would still start on History, so the ways in disagree.
- *Measured vs assumed:* the code paths are read. "Tabbed tools open a new tab fresh, not as a copy of the current
  one" (browsers, editors) is assumed; no other git GUI was checked.
- *Recommend (a):* one rule for every way a tab appears, and the smallest change.
- **Owner, 2026-10-17: (a), History always.**

**D2. Whether each tab's view survives a restart.**

- *What it is:* closing the app with tab A in Changes and reopening it. `layout.json` (`window.rs:21-30`, one entry
  per window: tab paths, the active path, a secondary window's frame) brings the tabs back; nothing brings a view
  back. Today every tab reopens in History.
- *Why now:* it decides whether the Rust `Layout` struct and the file format change, which decides the gates and
  the walk platforms.
- *Options:*
  - (a) **Session only.** No Rust change, no file change. Matches every other per-tab state: selection, scroll,
    filters and commit-message drafts live only in `saved` (`tabsStore.ts:39`) and none survive a restart either.
  - (b) **Persist.** `Layout` gains `#[serde(default, skip_serializing_if = "Vec::is_empty")] changes: Vec<String>`
    (the tab paths showing Changes), like `rect` (`:25-29`). An older file has no key: all History. An older app
    reading a newer file ignores the key, because serde ignores unknown fields unless told otherwise and `src-tauri`
    never uses `deny_unknown_fields` (grep). It then rewrites the file without it (views lost, nothing else).
    Costs:
    - `types.ts:36-41`'s `Layout`; App.tsx's report (`:209-216`) must also fire on a view change and read
      background tabs' views from `saved`; `restoreTabs` (`:76-84`) sets the view right after each `openTab`, so
      the next open's snapshot carries it;
    - `src-tauri/src/commands/window.rs`'s 7 `Layout { … }` literals (`:481, 816, 1022, 1079, 1696, 1719, 1731`).
      Two list every field and need the new one: the drag payload (`:1022`) and the test helper `layout()`
      (`:1079`); the other five use `..` and take it from there;
    - Rust tests: an old file reads as no views; no key written when empty (like `:1754-1762`); a test-local
      struct without the field reads a new file;
    - Rust gates, and a restore walk on Linux as well as Windows.

    Risk: `set_layout` writes the file on every report (`:466-475`), so each Alt+1 / Alt+2 becomes a disk write.
    `read_layouts` drops the whole session on any parse error (`:1071`, `unwrap_or_default`), so a format mistake
    loses every window, not just the views.
- *Measured vs assumed:* the serde behaviour on unknown fields is from serde's documented default, not run against
  the released v0.10.24 build. The cost list is read from the code.
- *Recommend (a):* the view is cheap to set again; persisting it alone, while drafts and selection are not, touches
  the one file whose parse failure loses a whole session. Reopen trigger: someone wants the views back after a
  restart.
- **Owner, 2026-10-17: (a), session only.**

**D3. What view a tab moved to another window opens in.**

- *What it is:* a tab dragged out of the strip (tear-off), *Move to new window*, or dropped on another window's
  strip (adopt), while it shows Changes.
- *Why now:* per tab, a moved tab could be expected to keep its view. Today a torn-off or *Move to new window* tab
  opens in History (its window's store is new), and an adopted tab takes the target window's current view (adopt
  runs `openTab` there, `TabStrip.tsx:28-42`).
- *Options:*
  - (a) **History**, as a fresh tab (D1 (a)). No change for tear-off and *Move to new window*: the payloads carry
    the path alone (Design 5). Adopt goes through `openTab`, so D1 (a)'s reset gives it History too.
  - (b) **Carry the view.** *Move to new window* only carries it through `spawnWindow`'s `Layout` with D2 (b)'s
    field. The drag paths are built in Rust (`drop_tab`, `window.rs:988-1036`): `drop_tab` would take a `view`
    argument, the `tab-adopt` event would carry it, and `onTabAdopt` (`TabStrip.tsx:28-42`) and the spawned window's
    restore would apply it. Rust change, gates, and tear-off / adopt walked on Linux too.
- *Measured vs assumed:* read from the code. Not checked: a moved tab also loses its selection, filter and commit
  draft today (the same path-only payload); reasoned, not walked (see *Not in this plan*).
- *Recommend (a):* a moved tab already starts fresh in every other respect; carrying only the view is Rust work for
  one of five lost things.
- **Owner, 2026-10-17: (a), History, as today.**

**D4. Whether the sidebar override (`railOverride`) goes per tab too.**

- *What it is:* Ctrl+Shift+` or the toolbar's leftmost button collapses or expands the sidebar against what the
  window width picks. The override is kept per view (one for History, one for Changes), per window, in memory
  (decided 2026-09-28, close-out plan P8; walked as BH 10).
- *Why now:* moving the view per tab changes which override is in effect after a tab switch; the override itself
  could move with it.
- *Options:*
  - (a) **Per window, per view, unchanged.** No code. A tab switch between views swaps the override in effect, as
    Alt+1 / Alt+2 do now. So the sidebar *can* change on Ctrl+Tab: a History tab with the rail forced on, then a
    Changes tab with no Changes override → the sidebar follows the width there. Between two tabs in the same view
    it never changes.
  - (b) **Per tab** (and per view): `railOverride` joins the snapshot. Costs one more key and tests. The sidebar
    then changes on Ctrl+Tab whenever the two tabs' overrides differ, even in the same view, and the window width
    that drives the automatic choice is the window's anyway (`useShortcuts.ts:98`: "the rail is a window-level
    thing like the tab keys").
- *Measured vs assumed:* reasoned; no walk of either. Row BW 11 walks (a)'s change across views.
- *Recommend (a):* the sidebar answers to the window's width; under (a) it moves on Ctrl+Tab only between views,
  as with Alt+1 / Alt+2 today, and under (b) also between two tabs in the same view.
- **Owner, 2026-10-17: (a), `railOverride` stays per window, per view.**

**D5. What Alt+1 / Alt+2, the palette's *Views* and the view switch act on.**

- *What it is:* the target of every view command once views are per tab.
- *Why now:* listed for the owner's confirmation; it follows from the goal.
- *Options:* (a) **the active tab**, the only one on screen (Design 8); (b) every tab of the window, which is the
  per-window behaviour this plan removes.
- *Recommend (a).*
- **Owner, 2026-10-17: (a), the active tab.**

**D6. What a late view change does when the tab changed under it.**

- *What it is:* two writers fire after a wait: the auto-close after a commit that emptied the tree (Settings ›
  General › Changes, group AY), which can run after a tab switch (Root cause, reasoned, not reproduced), and the
  working-tree row's 250 ms single-click timer, which outlives a switch only onto a History tab with a working-tree
  row (otherwise the row unmounts and clears it, `WorkingTreeRow.tsx:33`). Per tab, either would change the wrong
  tab. Also: an adopted tab skips the busy guard (`onTabAdopt` calls `openTab` with no `refusedWhileRunning`, the
  §AH row *A tab dropped in from another window switches repositories mid-op*), so a tab can come forward
  mid-commit by that path too; the repository-id guard covers it the same way.
- *Why now:* per window it was harmless (one view); per tab it is a wrong-tab write.
- *Options:*
  - (a) **Drop it** when another tab is active (Design 9). The tab that committed stays in Changes on its "Working
    tree clean" state until the user leaves it. Two small guards.
  - (b) **Apply it to the tab it was for**: write `"history"` into that tab's snapshot in `saved`. `commitStore`
    would reach into `tabsStore`'s background snapshots. A circular import is no obstacle (one already exists,
    `tabsStore.ts:11` ↔ `actions.ts:15`); the cost is coupling the commit editor to the tab model. For the timer,
    it means opening Changes in a background tab nobody is looking at.
- *Measured vs assumed:* the gap is read from the code (`commitStore.ts:266, 275, 530`; `actions.ts:273`); its
  length on a large repository is not measured (BS 1 notes the status refresh can outlast the commit).
- *Recommend (a):* the case needs a tab switch inside a refresh; leaving one tab on its empty state is the cheap,
  visible outcome.
- **Owner, 2026-10-17: (a), drop it with a repository-id guard.**

## Tests

Unit (vitest):

- `viewStore.test.ts`: `snapshot()` is `{ view }`; `restore` sets the view and leaves `railOverride` alone.
- `tabsStore.test.ts`, with two or three tabs (the existing mocks); its `beforeEach` (`:36-45`) also calls
  `useViewStore.getState().__resetForTests()`:
  - A to Changes, open B → B in History (D1 (a)); back to A → Changes; back to B → History.
  - `openTab` of an already-open tab keeps its view.
  - Closing the active tab in Changes → the next tab's own view. Closing a background tab drops its snapshot.
  - The start screen: one tab in Changes, close it, open another → History.
  - `railOverride` the same before and after a switch (D4 (a)).
- `commitStore.test.ts`: a commit that empties the tree with the repository switched during `syncRefs` (mocked) →
  the view is not touched; without the switch → History, as the existing auto-close tests (`:828-919`).
- `RevisionGrid.test.tsx` (fake timers): a single click on the working-tree row, then another repository active
  before 250 ms → no view change; same repository → Changes, as today.

No `RepoWindow.test.tsx` integration test: its mocks render `ChangesView` and `RevisionGrid` as `null` and stub
`useShortcuts` (`:34, 40, 45`), so Ctrl+Tab and the mounted view can't be seen there. That `RepoWindow` follows
`viewStore.view` is already tested (`:193-200`); the per-tab half is the `tabsStore` tests above.

No Rust tests unless D2 (b) or D3 (b) (their test lists are in the decisions).

## Walk: smoke group BW

New group **BW. The History / Changes view per tab** in `docs/smoke/smoke-test-post-v1.md`. Windows VM (session
git-ui-win) over CDP (`docs/smoke/smoke-cdp.md`), on a local `npm run tauri -- build --no-bundle`, launched with
`smoke-launch.ps1`. Set-up, with every build closed and in this order:
- Copy the store folder (`%APPDATA%\dev.topher.t4gitui\`) aside first, before anything below writes to it; copy it
  back after the walk, with every build closed, then `cmp`.
- `smoke-fixtures.ps1 -Force` (`C:\tmp\t4\{work,other}`). It leaves `work` with six changes
  (`smoke-fixtures.ps1:275-305`), so set `work` to exactly two tracked edits: `git -C C:\tmp\t4\work stash -u`,
  then append a line to `hunks.txt` and to `src\a.txt`.
- `third`: `git init C:\tmp\t4\third`, then `git -C C:\tmp\t4\third commit --allow-empty -m init`.
- `perf-small`, deep enough to scroll (row 10; `work` has about 20 commits):
  `node docs/smoke/fixtures/perf-repo.mjs C:\tmp\t4\perf-small --commits 1000 --branches 5 --files 100`.
- First open, so `third` and `perf-small` are in Recents (rows 3 and 10): with the app closed, seed `layout.json`
  with one window, tabs `work`, `other`, `third`, `perf-small`, active `work`, written as `smoke-cdp.md:96-104`
  says (a file tool, the app's own spelling: backslashes, lowercase `c:\…`), and delete any `layout.restoring`.
  Launch; every opened tab lands in Recents (`App.tsx:212`). Close `third`'s and `perf-small`'s tabs.

Every measurement carries `document.title`. Pass = the view
each tab shows, read by `[role="grid"][aria-label="Commits"]` present (History) or the Changes bar's text present
(Changes), and the switch's `aria-pressed`.

1. **Each tab its own view:** `work` and `other` open. In `work` Alt+2 → Changes. Ctrl+Tab → `other` in History.
   Ctrl+Tab → `work` in Changes. Ctrl+1 / Ctrl+2 and a strip click give the same.
2. **Each writer on the active tab only:** with `other` in History, in `work` (from History each time): the toolbar
   switch's Changes; the palette's *Changes*; a working-tree row click; Enter on it. Then from Changes: the bar's ×;
   Alt+1; the palette's *History*; a file row's *History*; a file row's *Blame*. After each, `work` shows the view
   the action names and `other` still shows History when switched to.
3. **New tab (D1 (a)):** `work` in Changes, open `third` from the toolbar's Recents → `third` in History; back to
   `work` → Changes. Open `work` again from Recents → its tab, still in Changes.
4. **Close:** `work` in Changes, `other` in History, `work` active; close `work`'s tab → `other` in History. Reopen
   `work` → History.
5. **Auto-close (AY 1 with a second tab):** `other` in Changes (its tree clean: the empty state), `work` active in
   Changes with two edits; stage both and commit → `work` back to History; Ctrl+Tab → `other` still in Changes.
6. **Rail (D4 (a)):** window at 1280 wide, `work` and `other` both in History; Ctrl+Shift+` in `work` → rail;
   Ctrl+Tab → `other` on the rail too; Alt+2 there → the sidebar per the width (Changes has no override).
7. **Two windows (D3 (a)):** `work` in Changes, `other` in History, `third` in Changes, one window. Drag `third`
   out of the strip → a new window with `third` in History; the first window's tabs keep their views. Drag `third`
   back onto the first window's strip → adopted, in History; the other two keep theirs. *Move to new window* on
   `work` (in Changes) → History in its new window. (Drag gestures as in `smoke-cdp.md` *A tab dragged into another
   window*.)
8. **Restart (D2 (a)):** two windows with tabs in both views; quit; relaunch → every tab in History, the active tabs
   and windows as left. `layout.json` has no key it didn't have before (only `tabs`, `active`, `rect`).
9. **The start screen (D1 (a)):** set-up from where row 8 leaves things: close the secondary window (its `×`); in
   the main window close every tab but `work` (open `work` from Recents if it was in the closed window). Alt+2 in
   `work`, close its tab → the start screen. Open `other` from Recents → History. (Closing a secondary window's last
   tab closes the window, `tabsStore.ts:152`, and a repository open elsewhere focuses that window instead,
   `:96`, hence the order.)
10. **Remount on Ctrl+Tab (accepted limits, Design 11):** open `perf-small` and `work` from Recents; `perf-small`
    in History, scrolled to about row 50 with a commit selected and the details split dragged up; `work` in
    Changes. Ctrl+Tab, Ctrl+Tab → `perf-small`'s same rows and selection. Record, without pass or fail: where the
    details split comes back, and `document.activeElement` after each switch.
11. **Rail across views (D4 (a)):** window at 1280 wide; `work` in History with Ctrl+Shift+` → rail; `other` in
    Changes with no override. Ctrl+Tab → `other` shows the full sidebar (the width's choice); Ctrl+Tab → `work` on
    the rail again.

Linux and macOS: not walked under D2 (a) and D3 (a). No window, restore or Rust code changes, and the change is in
stores that run the same on every webview (reasoned). Under D2 (b) or D3 (b): rows 7 and 8 also on Linux under Xvfb
with openbox (`docs/smoke/smoke-linux.md`, the multi-window rows), plus row 8 with a seeded older-format
`layout.json`; the Mac if the owner's session is free.

Record: `docs/archive/walks/2026-10-XX-bw-walk.md`.

## Steps

Execution starts only on the owner's go (CLAUDE.md step 4); a final plan is not a go.

1. **Branch.** Before the go to execute, the coordinator commits the three plans and `open-items.md` §AO on `main`
   and pushes that commit to `origin/main` on the owner's go. At the go: `git -C <repo> fetch`; confirm
   `git log --oneline origin/main -- docs/plans/2026-10-17-per-tab-view-plan.md` is not empty (stop and ask the owner
   if it is); then branch `per-tab-view` from `origin/main`: that commit, or a later one if a sibling plan has
   landed. So the branch carries this plan. The base hash goes in the walk record. Local `main` follows with
   `git switch main` and `git merge --ff-only origin/main`.
2. **Store:** `viewStore.ts` `snapshot` / `restore` and the comment (Design 1, 10); `tabsStore.ts` `Snapshot`,
   `take`, `put`, the reset in `openTab` (Design 3, per D1). Tests above.
3. **Guards** (Design 9, per D6): `commitStore.ts`, `WorkingTreeRow.tsx`. Tests above.
4. **Gates** from `F:/src/_ pet projects/t4-git-ui` (uppercase `F:/`): `npm test -- --run`, `npm run build` (its
   `tsc && vite build` covers `npx tsc --noEmit`, so that isn't run separately). Rust gates, as CI runs them
   (`checks.yml:81-94`: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`,
   `cargo test --workspace --locked`), only with D2 (b) or D3 (b).
5. **Commits** (local):
   - `feat: each tab keeps its own History / Changes view` (steps 2–3);
   - `docs: smoke group BW, the view per tab` (group BW, the READMEs per Design 10).
6. **Change review loop** (CLAUDE.md step 5); every skipped finding and proposed limit listed for the owner; triage.
   A *Fix it* item here, before the PR and the walk: fix → review loop → back to triage, all local. (After the
   walk, step 8's findings path applies.)
7. **PR before the merge** (owner, 2026-10-17): push `per-tab-view` and open a PR to `main`, on the owner's go at
   that moment. CI on three OS green. The PR opens with the unsquashed commits, before the squash: a deliberate
   departure from CLAUDE.md step 7's order, to get CI on three OS before the walk.
8. **Walk** group BW (above), on a build of the PR branch fetched on the VM; the fetch there, and the store backup
   (the set-up's first bullet), on the owner's approval on the VM. App build closed before `tauri build` (the exe
   lock). Record committed. A walk finding → fix → review loop (CLAUDE.md step 5) → triage; each push to the PR on
   the owner's go at that moment; the rows the fix touches are walked again.
9. **Records**, one docs commit, with no commit hash in it yet (step 10 writes them):
   - the §AH row → `open-items-done.md` §AH as *fixed*, closed with the walk record and a hash placeholder (the
     section is headed *accepted, closed*; the row's own text says fixed);
   - D2 (a)'s and D3 (a)'s reopen triggers as rows the owner places (§Q or a new dated section);
   - Design 11's accepted limits → a row in `open-items.md` §Q (*Accepted limits*), owner 2026-10-17, reopen trigger
     "someone wants the splits or the focus kept across a tab switch";
   - this plan to `docs/archive/plans/`, and every hit of `git grep` on its old path outside this plan repointed
     there (today `open-items.md` §AO's preamble).
10. **Package** (owner, 2026-10-17: hashes after the squash, since a squash rewrites any hash written before it):
    - the squash base is the commit the branch was cut from in step 1 (`git merge-base` as of step 1), which
      already holds this plan's commit; that commit stays as it is and is not folded into the squash. A `main` that
      has moved since is handled only by step 11's rebase path;
    - squash per CLAUDE.md step 7 in a throwaway worktree into two commits: `feat: each tab keeps its own History /
      Changes view` (the code and its tests), then one `docs: …` (group BW, the READMEs, the walk record, the
      records of step 9); fix commits from walk findings fold into `feat` or `docs` by kind; its tree identical to
      the branch's;
    - there, write the `feat` commit's post-squash hash into the records (the §AH row, this plan's status), amended
      into that `docs` commit, so the `feat` hash stays. The records cite only the `feat` hash, never the `docs`
      commit's own (the amend changes it). The walk record keeps the walked (pre-squash) hash as the fact it is,
      with the post-squash hash beside it ("same tree"), as `open-items-done.md` §N's map did;
    - check the final tree is the branch's plus those hash edits only (`git diff`), then move the branch;
    - force-push to the PR on the owner's go at that moment; CI green again.
11. **Merge by fast-forward** (owner, 2026-10-17), on the owner's go at that moment: `git push origin
    per-tab-view:main` (a fast-forward only, no merge commit), then `git -C <repo> merge --ff-only origin/main` on
    the local `main`. GitHub marks the PR merged; every hash survives; history stays linear. If `main` has moved
    since the branch was cut (sibling plans may land first):
    - rebase the branch onto it; check `git range-diff <old-base>..<old-head> <new-base>..<new-head>` shows the
      change identical in code and test files, and doc hunks differing only by the hand resolution of a conflict;
    - redo step 10's hashes; the walk record then says "same change, rebased onto `<main hash>`, range-diff
      identical in code and test files" instead of "same tree", plus "docs resolved by hand: …" when there were any;
    - re-walk the affected rows only if the rebase had conflicts in code or test files this change touches (owner,
      2026-10-17): those `git diff --name-only <base>..<head>` lists under `src/**` (not `*.md`) or `src-tauri/**`;
      at planning `viewStore.ts`, `tabsStore.ts`, `commitStore.ts`, `WorkingTreeRow.tsx` and their tests, plus any
      file a walk fix added (e.g. `actions.ts`). A conflict in a doc (most likely `open-items.md`,
      `open-items-done.md`, `src/README.md`, the smoke doc) is resolved by hand and checked in the range-diff, with
      no re-walk;
    - re-run the local gates (step 4), force-push to the PR on the owner's go, CI green, then fast-forward.
12. **Optional:** delete `per-tab-view` on the owner's go, after a PR lookup shows no other open PR uses it.

## Not in this plan

- Persisting the view (D2 (b)) or carrying it across windows (D3 (b)), unless the owner takes them.
- **A moved tab loses its commit-message draft, selection and filter.** Reasoned from the code (`tabsStore.ts:177`
  then `:139-140` drops the snapshot; the drag payload is the path alone), not walked. Deferred by the owner
  2026-10-17: `open-items.md` §AO.
- **A failed open would land on the last tab, not the one that was active** (owner, F3, 2026-10-17). `closeTab`
  picks `rest[Math.min(i, rest.length - 1)]` (`tabsStore.ts:156`): A, C open, A active, a failed open of B → C.
  Read from the code; unreachable today (Design 3). Deferred: `open-items.md` §AO, reopen trigger "a step in the
  open path gains a way to fail".
- The sidebar width and the diff's unified / split setting: window-level, unchanged. The details and commit-panel
  splits are not window-level; they reset whenever their view remounts (Design 11, accepted).
- Remembering a closed tab's view for when the repository is opened again.
- §AH's *A tab dropped in from another window switches repositories mid-op*: unchanged by this plan.

## Review record

- **Pass 1** (2026-10-17): 11 findings, all taken (F3, F4 decided by the owner). F9's count corrected on checking:
  of the 7 `Layout { … }` literals, 2 need the new field, not 6.
- **Pass 2** (2026-10-17): 5 findings, all taken (F1, F4 decided by the owner): the failed-open path is
  unreachable (its test dropped, §AO keeps the row); BW's set-up cleans `work` and builds `third` and `perf-small`;
  the §Q row for Design 11 is a records step; §AO cited; the branch is cut from `main` at the go.
- **Pass 3** (2026-10-17): 3 walk set-up findings, all taken: `third` and `perf-small` first opened through a
  seeded `layout.json`; BW 9 has its own set-up; `--branches 5` for `perf-small`.
- **Pass 4** (2026-10-17): 1 finding, taken: the store folder is copied aside before the `layout.json` seed.
- **Pass 5** (2026-10-17): nothing found.
- **After pass 5:** hashes after the squash; PR before merge (owner).
- **Pass 6** (2026-10-17): 4 findings, all taken; merge by fast-forward (owner).
- **Pass 7** (2026-10-17): 2 findings, taken; re-walk after a rebase only on conflicts in own files (owner); PR
  opens before the squash (owner).
- **Pass 8** (2026-10-17): 3 findings, all taken.
- **Pass 9** (2026-10-17): 3 findings, all taken; re-walk counts code/test conflicts only (owner).
- **Pass 10** (2026-10-17): nothing found.
- **After pass 10** (2026-10-17): the anchor plan's pass-8 findings applied here too (step 1's plan-on-`origin/main`
  check; step 11's range-diff wording under the doc-conflict ruling).
- **Pass 11** (2026-10-17): 2 nits, both taken (a 130-column line; step 11's walk-record wording).
- **Pass 12** (2026-10-17): nothing found (its one nit, line 4 at 121, was a byte count; 119 characters).
- **After pass 12** (2026-10-17): the polish plan's pass-10 finding applied here: step 9's archive repoints references
  to the old path.
- **Pass 13** (2026-10-17): nothing found. The polish plan's pass-11 nit then applied here: the repoint skips this
  plan's own text (step 1's check names the path as it was then).
- **Pass 14** (2026-10-17): nothing found.
