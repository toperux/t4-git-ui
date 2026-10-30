# Plan: the remaining tab rows — a failed open's landing, the dock per tab, two sightings (Plan C)

_Written 2026-10-30 against `main` `f01431d3`. Status: the plan review loop ended at pass 9; executed 2026-10-30; walked
(BZ, `docs/archive/walks/2026-10-30-bz-walk.md`); change review loop 5 passes; triage with the owner; records written.
Scope set by the owner on 2026-10-17 ("once the per-tab, polish and scroll-anchor plans all merge, plan §AO/§AP/§AQ")
and 2026-10-23 ("let's do plan C"): the rows of `open-items.md` §AO, §AP and §AQ that Plan A and Plan B did not take —
AO2, AP1, AP3 and AQ1. Q1 (a) and Q2 (a) with the owner on 2026-10-30; D1 and D2 taken under the owner's 2026-10-21
rule._

**Goal.** Close the four rows left in `open-items.md` §AO–§AQ: one reasoned bug on a path that one corrupt stored value
reaches (AO2), one design question (AP3), and two one-off sightings that no reading explained (AP1, AQ1).

## What the user sees now

- **AO2.** With tabs A and C open and A active, a tab B that fails to open is appended and then closed again, and the
  window lands on C, not on A (`closeTab` picks the tab that took the slot, `tabsStore.ts:232`). Reachable only through
  a corrupt store value: once `ipc.openRepo` has answered, `repoStore.openRepo` (`repoStore.ts:375-413`) cannot reject
  through `startLog` (its IPC error goes to `log.error`, `:536-538`), `refreshRefs` (toasted, `:402-404`) or `kvGet`
  (its own errors go to `console.warn`, `kv.ts:40-47`) — but the cached badges line `if (cached && !("remote" in
  cached) …)` (`:409`) throws a `TypeError` when `recents.json` holds a primitive under `remoteTags:<id>` (`1`, `"x"`,
  `true`), after `set({ repo })`. Then `openRepo` rejects and the cleanup at `tabsStore.ts:184-188` runs. So the row's
  trigger ("a step in the open path gains a way to fail") is already met. A test covers the landing
  (`tabsStore.test.ts:333`, "lands on a remaining tab"; it accepts either remaining tab), and its setup (open `/a`,
  then `/b`, fail `/c`) lands on the active tab with or without a fix: `/b` is both active and last.
- **AP1.** Once, in the BW walk, a tab opened in the background at launch came forward with its grid at scrollTop 26
  and the selected HEAD row hidden above the top. Two fresh launches did not reproduce it.
- **AP3.** The output dock shows every command the window ran, whichever tab ran it: in the BW walk `other` showed
  `work`'s `git commit -F …` line. By design so far ("per window").
- **AQ1.** Once, in the BU walk, the focus moved from the staging diff's cursor row to the *Staged files* listbox
  between two driver runs, after the first click of row 1. No cause found.

## Decisions

**Q1. Scope — the §AT rows.** `open-items.md` §AT holds three rows added by the Dependabot work on 2026-10-30: the
diff cursor losing the keyboard when its row unmounts (pre-existing), `observeVisibleRect` possibly redundant with
virtual-core 3.19.6, and the start-screen cards wrapping at 800×600. (a) Leave them in §AT on their triggers; Plan C is
the four rows the owner named. (b) Add the cursor row (a real keyboard loss, small: keep the focus when the cursor row
unmounts, or bring the cursor back on ↓). (c) Add all three. **(a), the owner, 2026-10-30** — none of the three is in
the scope the owner set, and (b) touches the diff viewer's focus model, which has its own plan history (Plan A).

**Q2. AP3 — the dock per tab.** The row's trigger is "someone wants it per tab"; the owner is the someone, so this plan
asks. Each `OpRecord` can carry the `repoId` the backend already sends on every `op://event` (`types.ts:610-614`, `null`
for clone); the dock then shows the open repository's records (plus the repo-less ones), and the window's one busy guard
stays: a running op always belongs to the active tab, since switching tabs is refused while one runs
(`tabsStore.ts:200-202`). The streamed ops are `runOp`'s CLI ops, the commit and clone; `refusedWhileRunning` covers
`runOp`'s `busy` and the commit's (`actions.ts:278-284`), so Cancel, the failure reveal and the `busy` text stay right.
Op events are already per window (`src-tauri/src/commands/ops.rs:82-101` emits to the repository's holder window; clone
to the asking window, `:1278`), so the filter only separates tabs.
- (a) **Per tab, by filtering.** `OpRecord.repoId`; `OutputDock` shows `ops` where `repoId === repo.id || repoId ===
  null`. The `open` flag stays per window. The caps (`MAX_OPS`, `MAX_TOTAL_LINES`) stay per window: one tab's long
  output can still push another tab's records out, which is the same trim as today. Cost: a field, a filter, tests;
  the row closes. Risks: an op whose `repoId` names a tab that was closed leaves records nobody sees until the trim
  drops them (a tab reopened later shows them again — ids are path-based, `crates/git-core/src/repo.rs:16-19`); a
  detached or dragged-out tab's records stay in the old window, so the new window says "No output yet"; a clone
  record (`repoId: null`) shows in every tab of its window, so each tab's collapsed bar reads `$ git clone …` until
  that tab runs something.
- (b) **Keep per window, close the row.** The owner rules the dock is a window log. No code.
- (c) **Per tab with its own `open` state** — the dock's expanded/collapsed state in the tab snapshot. More state for
  little: the dock is a window-level panel like the sidebar.
**(a), the owner, 2026-10-30** — the row came from an owner's walk and the BW sighting reads as a surprise, not a
feature; (a) is small.

**D1. AO2 — fix the landing, with a test.** The tab that was active before the failed open is the one to land on:
`openTab` already holds `active` from before the insert (`tabsStore.ts:165`), and on failure closes the new tab with
that tab to return to, if it is still open (else `closeTab`'s own pick stands). One `show` only: `closeTab` is given the
tab to return to (an optional second argument, `returnTo`), so it does not show the slot's tab first and the
remembered one second (two `refreshAll`s and a flash). If the user switched tabs during the open, the failed tab is no
longer active and the `active !== id` branch (`:217-218`) ignores `returnTo`: the user's pick stands. The tests at
`tabsStore.test.ts:333` and `:352` change so that they fail without the fix (P1-3, P1-4). Taken under the owner's
2026-10-21 rule (the fix is the row's own sentence).

**P1-2 — AO2 walked through the corrupt value (a), the owner, 2026-10-30.** The walk seeds `"remoteTags:<id>": 1` in the
VM's `recents.json` (app closed, no BOM, written with a file tool, the store backed up). The key is `remoteTags:` plus
the id (`remoteTagsKey`, `repoStore.ts:109`) with the id the canonical workdir — no `\\?\`, lowercase drive letter,
backslashes (`crates/git-core/src/repo.rs:14-38`), the spelling `layout.json` uses (`smoke-cdp.md:96-99`):
`"remoteTags:c:\\tmp\\t4bw\\bz-b": 1` in the JSON (the fixtures under *Walk* below). A wrong spelling fails silently
(the open succeeds), so a seeded key that does not fail the open is itself a finding. The seed is read on every open of
B and survives every launch (the store is loaded once per launch and saved whole, `kv.ts:27`; only a tags check writes
the key), so B is a repository no other row opens, and the key is removed right after the AO2 row — with the app quit,
deleting that one key from `recents.json` with a file tool (a file restored under a running app gets the seed written
back on the next `kvSet`, which any tab change makes, `App.tsx:212`; and the backup from before the walk lacks the
Recents entries later rows need). B stays out of `layout.json` (a tab that fails at launch is toasted, `App.tsx:79-84`)
and out of `lastOpen` (its failure is swallowed, `:71`). B is in Recents from one normal open before the seed (a path
enters Recents on an open, `App.tsx:210`; the Recents menu hides only the active repository, `Toolbar.tsx:103`). Three
tabs, so the landing tells the fix from today's pick (two tabs land on the first either way, `tabsStore.ts:232`):
`A | C` open from a seeded `layout.json`, A active and in Changes, C in History; open B from the toolbar's repository
menu, Recents (`Toolbar.tsx:149` → `switchRepo` → `openTab(path)`, `at` undefined, `actions.ts:333-338`; the Open dialog
is native and not drivable). Expect: the toast "Couldn't open repository" with the detail
`Cannot use 'in' operator to search for 'remote' in 1` (WebView2's wording; `toAppError` keeps the TypeError's message,
`ipc.ts:56-58`, and `toastError` shows it as the detail, `toastStore.ts:126` — it proves the seed caused the failure),
the strip back to `A | C`, A active in Changes. Today's landing on C is reasoned from `:232`; P3-13 measures it once on
the installed release (v0.10.24, `smoke-launch.ps1 -Installed`, as BU row 5 did) with the same seed, before the fixed
build: C active — its view is not read, since v0.10.24 has no per-tab view (the landing and the `in` line,
`repoStore.ts:365` at the tag, are the same there). Hardening the `in` check is a new `open-items.md` row, not this
plan.

**D2. AP1 and AQ1 — a bounded reproduction attempt; the outcome ruled in triage.** Neither row names a cause; a plan
cannot fix them, only try to see them again. Taken under the 2026-10-21 rule: in this plan's walk, (i) AP1, mirroring
the BW walk's setup (`docs/archive/walks/2026-10-17-bw-walk.md:22-30`, row 1 `:34-35`, the sighting `:87`): the BW
fixtures under `-Root C:\tmp\t4bw` (a root of its own keeps `C:\tmp\t4`'s network-only fixtures safe; without `-Force`
the script refuses an existing root, `smoke-fixtures.ps1:69-70`): `work` with `stash -u` and two tracked edits (dirty,
so it shows a working-tree row — it may matter for a 26 px offset), `third` (`git init` plus an empty commit),
`perf-small` (`perf-repo.mjs --commits 1000 --branches 5 --files 100`); ten launches at `--inner 1280x800`,
`layout.json` re-seeded and `layout.restoring` deleted before each (`smoke-cdp.md:96-103`; the app rewrites the layout
on every tab change) with four tabs (`work` active, `other`, `third`, `perf-small`, lowercase `c:\tmp\t4bw\…`); after
launch close `third` and `perf-small`, Alt+2 in `work`, Ctrl+Tab to `other`, and read `other`'s grid scrollTop and the
selected row's top; (ii) AQ1, mirroring the BU walk (`docs/archive/walks/2026-10-17-bu-walk.md:31`, the sighting `:91`):
ten launches on the BU fixture rebuilt in full (`smoke-test-post-v1.md:3201-3208`, `C:\tmp\t4\bu`: two commits, `bu.txt`
400 lines with every 20th line edited unstaged and lines 300–340 replaced; deleted after the BU walk) at
`--inner 1280x800`, `layout.json` seeded with `c:\tmp\t4\bu` alone; each time Changes › `bu.txt`, click the first change
(20−), then read `document.activeElement` in a second `cdp.mjs` run a few seconds later (the sighting was across two
driver runs). Seen → a row with the readings, and a fix in this plan if the cause is found. Not seen → the proposal for
the triage (step 7) is to close the rows in `open-items-done.md` with "not seen in 10", no trigger (any new sighting is
found by the row's text). The owner rules.

## Design

1. **AO2.** `tabsStore.ts`:
   - `openTab`'s `catch` at `:184-188`: `await get().closeTab(summary.id, active ?? undefined); throw e;` (`active`
     is the one destructured at `:165`, never reassigned).
   - `closeTab(id, returnTo?)`, the interface and its doc comment at `:89-90` too: in the active-tab branch
     (`:230-235`) `const next = rest.find((t) => t.id === returnTo) ?? rest[Math.min(i, rest.length - 1)];` (an
     undefined `returnTo` matches nothing; `returnTo && …` would type `next` as `"" | Tab`, since `RepoId` is a
     string, and fail tsc at `next.id`). No other caller passes it (`TabStrip.tsx:84,99,136`, `useTabDrag.tsx:240`,
     `detach` `:259`, `actions.ts:357` pass the id alone).
   - A failed open with no tab before it (the start screen) keeps today's path: `rest.length === 0`.
2. **AP3 (a).** `opsStore.ts`: `OpRecord.repoId: RepoId | null`; `onEvent` destructures `repoId` too (`:82`) and sets it
   on the record at `:85`. `selectLastOp` (`:72`, one user) goes. `OutputDock.tsx`: read `ops` (`:20`) and
   `useRepoStore`'s `repo?.id` as two plain selectors and filter in render (a filter inside a zustand v5 selector
   returns a fresh array each call and loops); `last` is the filtered list's last, so the collapsed bar's `$ cmd` line
   names this tab's command (the BW sighting); `OutputBody` gets the filtered list and `key={repoId}`, so a tab switch
   remounts it and its scroll-to-bottom effect (keyed on `rowCount`, `:142`) runs again even when the counts are equal —
   the dock itself is not keyed and stays mounted across a switch (`RepoWindow.tsx:353`). `cancel` unchanged (by `opId`,
   on the full list). Nothing else reads `ops`: the status bar, toolbar, shortcuts and sidebar read `busy` /
   `selectRunning`; `docs/design/canvases/build/screens.mjs:517` is a canvas mock. The dock is not rendered on the start
   screen (`App.tsx:96`, `:250`), so the filter never sees a null repository; a tab switch sets `repo` synchronously
   (`put`, `activate` → `show`), and `openTab`'s `openRepo(path, summary)` skips its await, so no frame shows another
   tab's records.
3. **AP1, AQ1.** Walk only (D2).

## Tests

- `tabsStore.test.ts:333` and `:352` rewritten so they fail without the fix (the helpers `view()` and `toChanges()`
  at `:285-286`; the failure mock replaces `useRepoStore.openRepo` after the mocked `ipc.openRepo` answered, `:339`,
  `:359`): open `/a` and `/b`, `activate("/a")` and put `/a` in Changes (`/b` stays in History: landing on a tab
  whose own view is History cannot show its snapshot was restored), fail `/c` appended → `/a`, in Changes (today:
  `/b`); a failed open at a drop's slot: `/c` at slot 1 (slot 0 would put `/a`, now the active tab, in the slot, and
  the test would pass either way) → `/a` in Changes (today: `/b`). New cases: `/c` fails while the start screen
  was showing (no tab before) → start screen, as today (don't assert `ipc.closeRepo`: with no `repo` set,
  `closeRepo`'s early return at `repoStore.ts:417` skips it, which no real failure reaches); the user activates `/b`
  during `/c`'s open → `/b` stays; `/a` closed during `/c`'s open → `closeTab`'s own pick.
- `opsStore.test.ts`: a record carries its event's `repoId`, `null` for a clone.
- `OutputDock.test.tsx`: its existing cases feed `repoId: "r"` (`:60-62`, `:84-85`, `:95`, `:102`) with no repository
  open, so a `beforeEach` seeds `useRepoStore` with `repo.id === "r"`; new cases: with two repositories' records in
  `ops`, only the open one's (and `repoId: null`) rows render, and the collapsed line names its last command; the
  equal-count remount: records for `r1` and `r2` with equal row counts, the dock open, `scrollHeight` stubbed on
  `HTMLElement.prototype` (on the prototype, not on the node as the scroll case at `:91` does: the remount makes a
  new `role="log"` node; the stub removed afterwards), the log's `scrollTop` set to 0, then `repo` switched to `r2`
  and the log queried again (the old reference is detached) → its `scrollTop` equals the stub (fails without
  `key={repoId}`: the effect is keyed on `rowCount` alone, `OutputDock.tsx:142-146`).

## Steps

1. **Branch** `tabs-dock-deferred` from `main`'s head at the go (this plan's commits on it).
2. **AO2** (D1) with its tests; `src/README.md:46-57` (a failed open goes back to the tab that was active;
   `closeTab` gains `returnTo`); gates (`cargo` untouched: tsc, vitest). Commit `fix: a failed open goes back to the
   tab that was active`.
3. **AP3** (Q2 (a)) with its tests; `src/README.md:190-192` (`OpRecord.repoId`), `:466` and `:663` (the dock shows
   the open repository's records plus the repo-less ones); gates. Commit `feat: the output dock shows the active
   tab's commands`.
4. **Smoke group BZ** in `docs/smoke/smoke-test-post-v1.md` after BY, before *Reporting* (`:3678`), as Plan B added
   BY: the rows under *Walk* below, with their fixtures and the key spelled out. D2's readings stay in the walk
   record only. Taken under the 2026-10-21 rule (P2-6): every behaviour change since BU got a group. Commit `docs:`.
5. **Change review loop**, findings fixed, until a pass finds nothing. Decisions to the owner at once.
6. **Walk** on the Windows VM (`smoke-cdp.md`): BZ's rows, then D2's twenty readings. Record in
   `docs/archive/walks/2026-10-3x-bz-walk.md`.
7. **Triage** with the owner, including D2's outcome.
8. **Records**: the §AO, §AP and §AQ rows ruled closed move to `open-items-done.md`; a row for the `in` check (P1-2);
   BZ's ticks; this plan archived. Commit `docs:`. **Package** as Plan B (`b010469c` plan, the fixes, `1ad24fac` BY,
   `521dcc0c` records): this plan's review commits (on local `main`, unpushed) squashed into one `docs:` plan commit,
   then `fix:`, `feat:`, the BZ `docs:` and the records `docs:` — rehearsed in a throwaway worktree, the final tree
   checked identical. The squash rewrites the plan commits that exist only on local `main`, so local `main` is reset
   to the packaged branch, not fast-forwarded. Push on the owner's go.

## Walk: smoke group BZ

One fixture set under `C:\tmp\t4bw` (`smoke-fixtures.ps1 -Root C:\tmp\t4bw`; a root of its own keeps `C:\tmp\t4`'s
network-only fixtures safe, and it must not exist yet, since without `-Force` the script refuses an existing root),
as BW did (`bw-walk.md:22-24`); BW's own set was deleted after its walk (`:102`). The script gives `work` the `slow`
and `nowhere` remotes and makes `other` a clone of `bare.git`. The store (`%APPDATA%\dev.topher.t4gitui`) backed up
before the first launch and restored, `cmp`'d, at the end; `--inner 1280x800`; `document.title` in every reading;
`layout.json` re-seeded and `layout.restoring` deleted before every launch (the app rewrites the layout on each tab
change).

- **BZ 1 — a failed open lands on the tab that was active (AO2).** A = `work` (the BW `work`, dirty), C = `third`
  and B = `bz-b`, each `git init` plus an empty commit with `-c user.name=smoke -c user.email=smoke@example.invalid`
  (`bw-walk.md:26`); `bz-b` is opened by no other row. Setup: `layout.json` seeded with `bz-b` alone (the Open dialog
  is native), launch, Ctrl+W its tab, quit — Recents has it. App quit, seed `recents.json` with
  `"remoteTags:c:\\tmp\\t4bw\\bz-b": 1` (a file tool, no BOM) and `layout.json` with `work`, `third`, active `work`.
  P3-13 first, on the installed v0.10.24 (`smoke-launch.ps1 -Installed`): Recents › `bz-b` → the toast with the `in`
  detail; the strip `work | third`, `third` active (today's pick; v0.10.24 has no per-tab view, so the view is not
  read). Quit; re-seed `layout.json`. The fixed build: `work` to Changes; Recents › `bz-b` → the toast with the `in`
  detail; the strip `work | third`, `work` active, in Changes. Then quit and delete the seeded key from `recents.json`
  with a file tool (not a restore: see P1-2) before any other row.
- **BZ 2 — the dock follows the tab; a clone shows in every tab (AP3).** Launch with `layout.json` seeded with `work`
  (Recents gets it, `App.tsx:210`), then Ctrl+W on every tab for the start screen (a `[]` layout alone is not a clean
  start, `lastOpen` can reopen one, `smoke-cdp.md:102-104`). Clone from the start screen (Clone… or Ctrl+Shift+O,
  `StartScreen.tsx:140,300`; URL, parent folder and folder name are plain text inputs, `CloneDialog.tsx:140-179`, so
  typed over CDP; only the folder button opens a native picker; the `op://event` listener runs on the start screen too,
  `App.tsx:173`): `C:\tmp\t4bw\bare.git` into `c:\tmp\t4bw\bz-clone`. It opens as tab 1; its dock's bar reads
  `$ git clone …`. Recents › `work` as tab 2: its bar reads `$ git clone …` too (the repo-less record). In `work`'s dock
  prompt type `status` (the prompt supplies `git`); in `bz-clone`'s, `log -1`. Each tab's dock lists the clone line and
  its own command only; the collapsed bar names the tab's own last command; Ctrl+Tab both ways keeps it so; the expanded
  dock scrolls to its bottom after each switch (a smoke check only: the two lists differ in row count, so the `rowCount`
  effect runs either way; the equal-count case the `key={repoId}` remount is for is covered by its unit test, not
  walked).
- **BZ 3 — Cancel still reaches the running op, a cancel does not open the dock, a failure does.** In `work`, the dock
  collapsed, right-click the sidebar's `slow` remote › Fetch slow (the remote row's context menu, `Sidebar.tsx:450` →
  `:716-722`, `fetchRemote`; its upload-pack sleeps a minute — not typed into the dock prompt, which opens the dock
  itself, `actions.ts:149`). Cancel on the collapsed bar (`OutputDock.tsx:33-36`): the op exits non-zero, the bar
  stays collapsed (`opsStore.ts:100-101,123`). Then, the dock collapsed again, right-click `nowhere` › Fetch nowhere:
  the fetch fails at once and the dock opens on it (the failure reveal under the filter), the failure listed in
  `work`'s dock and not in `bz-clone`'s.

## Not in this plan

- The §AT rows (Q1 (a)).
- Per-tab caps for the dock, or a per-tab `open` flag (Q2 (c)).
- Hardening `openRepo`'s `"remote" in cached` against a primitive (a row, P1-2).
- A failed open while an op runs (`closeTab` refuses and the failed tab stays): pre-existing, unreachable through the
  guarded entry points (`switchRepo`, `pickAndOpenRepo`, `openWhenIdle`).
- The failed open's `recents.touch` and `setLayout` recording the briefly inserted tab: pre-existing.
- The grid selection staying on the previous HEAD after a commit: Plan B took it (AO5).
