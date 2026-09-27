# PR #18 — the Windows side before merge

**Parent:** PR #18 `linux-smoke-and-fixes` (the Linux smoke harness and the WebKitGTK fixes), from a Linux
session. Its own plans: `2026-09-26-linux-menu-focus-and-restore-plan.md` (T19),
`2026-09-27-pr18-linux-extras-plan.md`.

**Goal:** #18 is safe to merge: the blocker found in its review is fixed on the branch, and the Windows re-walk
the PR asks for (T19, first half) is done on the fixed build.

**Status:** done 2026-09-27 (`639856e`, `f5276b6`, pushed). The follow-up batch is
`2026-09-27-pr18-fix-batch-plan.md`, which closed T15 differently: a second `take` returns `main`'s own entry.

---

## Decisions (the user, 2026-09-27)

| # | Question | Answer |
|---|---|---|
| W1 | How to fix the blocker | **Gate every `layout.json` write on the last session having been read** |
| W2 | Who fixes it | **Here, on the PR branch**; the Linux session may re-run its restore check after |
| W3 | When to walk T19 | **After the fix**, on the final build |
| W4 | When to update the close-out and triage plans for #18 | **After merge**, one docs commit on `main`, then the triage plan runs |

## The blocker (from the review, verified in the code)

A second launch during startup wipes the saved session.
- The single-instance callback (`src-tauri/src/lib.rs:147`) calls `spawn(app, None, Layout::default(), None)`.
- On the branch, `spawn` writes `layout.json` synchronously (`window.rs:114-121`): `spawned` puts the new, empty
  window into `layouts.open`, then `write_layouts` writes every non-empty entry.
- Before `main` has called `take_layout`, `open` holds only that empty window, so the file becomes `[]`.
- `main` reaches `takeLayout` only after its webview loads, `probeGit`, the settings and the recents
  (`App.tsx:84-98`). A double-click on a slow start easily lands inside that gap.
- The spawned window's one-shot `setLayout` (`App.tsx:93-98`, new on the branch) writes `[]` again.
- `main`'s `takeLayout` then reads `[]`, falls back to `lastOpen`, and every other window and tab of the last
  session is gone.
- **New with #18:** before it, `spawn` wrote nothing, and a window with no tabs never reported.

## Step 1 — check out the branch

- `git -C <repo> switch -c linux-smoke-and-fixes --track origin/linux-smoke-and-fixes` (the working tree on
  `main` is clean).
- This plan file comes along untracked and is committed on the branch in Step 5.

## Step 2 — the fix (`coder` agent)

**Design: the gate lives in `Layouts`, under the lock every write already takes.**
- `Layouts` (`window.rs:40-43`) gains `read: bool`, false at start. It isn't an `AppState` atomic: the flag has
  to change atomically with the file's read, and the `layouts()` mutex already serialises every writer.
- **One write helper** replaces the five direct calls (`window.rs:121`, `:164`, `:207`, `:256`, `:265`), e.g.
  `fn persist(l: &mut Layouts, path: &Path)`: it computes `restorable` as today, and writes only when `l.read`.
  `restorable` (the chain expiry) still runs, so the in-memory state stays as it is today.
- **A pure `fn take(l: &mut Layouts, path: &Path) -> Vec<Layout>`**: calls `take_layouts(path)`, then sets
  `l.read = true`. `take_layout` becomes `take(&mut app.state::<AppState>().layouts(), &layout_file(&app))`, so
  the lock is held across the read and the flag. Setting it before the read would let a write slip in between
  and hand `main` an empty file; after the read without the lock, the same.
- **Only `take` opens the gate.** The invariant: *nothing overwrites a session nobody has read.*
  - `set_layout` doesn't open it, not even `main`'s. `main` *can* report before its read: `listenTabDrags()` is
    attached at mount (`App.tsx:157`), so a tab dragged from a second-launch window onto a `main` still on
    *Starting* adopts it, and `main`'s report would overwrite the saved session (Windows, `window_at`). Found
    in this plan's review.
  - **Two rare paths therefore save nothing for that launch, and the saved session survives for the next:**
    the `catch` in `App.tsx` (`recents.load()` rejects, so `take_layout` is never called), and `main` closed
    while still on *Starting* with a second-launch window open. Accepted: in both, the unread session is the
    one worth keeping.
- A launch that stops at *Git not found* never reads the layout, so nothing is written until **Retry** gets
  past it. No window can have a tab then, so nothing is lost. (*Locate git…* in a second-launch window could
  give that window tabs first; they're held until `main` retries. Harmless.)
- **Comments:** `spawned`'s doc comment (`window.rs:210-218`) and the `App.tsx:93-95` comment say why the gate
  exists.

**Tests** (in `window.rs`'s `mod tests`, on the pure functions with a temp path, as the existing ones do):
- **The blocker:** with a session in the file and `read == false`, a `spawned` empty window plus `persist`
  leaves the file byte-identical.
- **After the read:** once `read == true`, `persist` writes as before (the existing round-trip expectations).
- **Take then write:** `take` returns the file's session and sets `read`; a `persist` after it writes. The test
  calls `take` itself, the same function `take_layout` calls.
- **A report before the read:** a `set_layout`-style insert into `open` plus `persist`, with `read == false`,
  leaves the file untouched (the drag-adoption case).
- **The existing tests** build `Layouts { open, closed }` literally (`window.rs:577`, `:599`, `:623`, `:651`,
  `:690`, `:711`). Adding `read` breaks those, so each gains `..Default::default()`. Otherwise they are unchanged:
  they call `restorable` / `close`, which never write, and the two that write (`:665`, `:677`) call
  `write_layouts` directly, which isn't gated.

**Gates** (Windows, uppercase `F:/`):
- `cargo fmt --all`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo test --workspace`
- `npx tsc --noEmit`
- `npm test -- --run`

## Step 3 — review

- The main session reads the diff and the gate output.
- Every `write_layouts` call in `src-tauri/src` goes through the helper: `git grep -n write_layouts` shows only
  the helper and the tests.
- Nothing else in the PR changes.

## Step 4 — the PR's docs

- `open-items.md` §O, the "Done … plan step C" bullet: add that the at-spawn write is gated on the last session
  having been read, since 2026-09-27, with the reason (a second launch during startup).
- `2026-09-26-linux-menu-focus-and-restore-plan.md`, its status section: one dated line saying the same.
- `docs/smoke/cdp.mjs` KEYS (`:66-80`): add `F10` (keyCode 121), `End` (35) and `Home` (36). Without them the
  fallback sends `KeyF10` / keyCode 70, the app's `e.key === "F10"` checks (`RevisionGrid.tsx:130`,
  `FilesColumn.tsx:379`, `ChangedFileList.tsx:194`) never match, and T19's path 5 and AZ 6 (which needs **End**)
  can't be driven. A tool change, in its own commit with the walk (Step 6).

## Step 5 — commit and push

- One commit on the branch: `fix: No layout write before the last session is read`, with a body naming the
  second-launch case. Then a second commit with this plan file, if the user wants it in #18; otherwise it stays
  local until merge.
- **Push to the PR only on the user's word.** `git fetch` first (the Linux session may have pushed meanwhile):
  rebase onto the new head if it moved, never force-push. CI runs the three legs.
- Tell the user the Linux session can re-run its restore-guard check (20 two-window restores) on the new head.

## Step 6 — T19, the Windows walk (first half)

**What it checks** (the PR body and `docs/archive/walks/2026-09-27-t18-linux-focus-audit.md`):
- **AZ 6** (`smoke-test-post-v1.md:1873` on the branch): a clipped menu name, read from the keyboard.
- **The audit's ten paths.**
  - Each is done after a click, then the key that moves focus:
    - the sidebar tree, ↓
    - Changes|Files, →
    - the Settings tabs, → after a click
    - the palette: Ctrl+K, then Esc → the grid
    - a menu opened with Shift+F10, then Esc → the grid
    - the search popover (narrow toolbar), Esc → its button
    - the diff line cursor, ↓
    - a file list emptied by Enter → the sibling list
    - the diff window opened by Enter → its list
    - the diff window, Esc → its opener
  - Also the three the audit didn't walk, where reachable: the Files tab's cursor
    (`DiffViewer/FileContent.tsx:148/215`), the busy refocus (`Dialog.tsx:94`), and the other emptied-list
    direction (`CommitPanel/FilesColumn.tsx:235`).
- **Two cases new on Windows:**
  - Tab to a button, then click it: the ring stays, and a menu it opens opens keyboard-style.
  - Click, then a Ctrl shortcut that moves focus (Ctrl+, / Ctrl+K then Esc): now ringed.

**Baseline first:** "must look as before" needs a before.
- Walk the same paths on the **installed 0.10.12** (`smoke-launch.ps1 -Installed`).
- Its code is `main`'s, apart from Dependabot bumps, so it has no `data-kbd`.
- Then walk them on the **PR build** (`smoke-launch.ps1`).
- Each path records, before and after:
  - `document.hasFocus()`;
  - `document.activeElement`;
  - whether it matches `:focus-visible` and, on the PR build, `[data-kbd]:focus`;
  - its computed `outline` and `box-shadow` (the ring).
- `cdp.mjs` has no screenshot step. The computed style is the reading, as in the audit.

**Setup and cleanup** (`smoke-cdp.md`, the `smoke-walk` skill):
1. Build the branch with `npm run tauri -- build --no-bundle`. The installed app can stay open while it builds.
2. Back up `%APPDATA%\dev.topher.t4gitui` **while the installed app is still open**, then ask the user to close
   it. Confirm with `tasklist`.
3. Fixtures: `pwsh -File docs/smoke/fixtures/smoke-fixtures.ps1 -Force`, then `layout.json` seeded with
   `c:\tmp\t4\work` (node, no BOM). **Re-seed before each launch**: every launch takes (deletes) the file.
4. Keys through `cdp.mjs --key`, by its KEYS names: `Escape` (not `Esc`, which falls back to the E key),
   `Ctrl+Comma` (not `Ctrl+,`), `Shift+F10`, `End`, `Ctrl+K`, the arrows, `Enter`. It sends real
   `Input.dispatchKeyEvent` events. The capture-phase `keydown` in
   `kbdFocus.ts` sees them, and Chromium's `:focus-visible` follows CDP key events (`smoke-cdp.md`).
5. **Positive control first, on each build:** Tab onto a toolbar button must match `:focus-visible` with a ring.
   Otherwise the readings are void.
6. Tag the exact element with `data-w` before every `--click` (never a generic selector). Clear old tags first.
7. Close each launch with its windows' close. Restore the store folder byte-exact and `cmp` it. Then tell the
   user the installed app can start.

**Judging:**
- **A path that rang on the baseline** must still ring on the PR build.
- **A path that didn't ring on the baseline:**
  - ringing now is the fix working, if the last input was a key;
  - it's a finding if the last input was a pointer.
- **The two new cases:** these change what a Windows user sees. Record what happened; **the user decides**
  whether that change is wanted, when the walk reports.
- **Also note:** a right-click on a list that has keyboard focus opens a keyboard-style menu (its first item in
  accent). That was already so on Windows (open-items §M "Menus"). Check it is unchanged, not new.

**Records** (on the branch):
- a walk record `docs/archive/walks/2026-09-27-t19-windows-walk.md`;
- AZ 6's box note;
- T19's first half marked done in the menu/restore plan (T8, the skill's Windows route, is walked by this too);
- the PR body's *Before merge* line struck.
- One commit (with the `cdp.mjs` KEYS change); push on the user's word, with the same `git fetch` first. The
  `smoke-walk` skill says not to commit ticks or records unless the user asks: this plan's go is that ask.

## Step 7 — merge

Only on the user's explicit go, after Steps 5 and 6 are pushed and CI is green.

## After merge (W4, not in this plan)

The close-out plan and the triage plan are updated on `main`:
- the new §O / §P rows are scheduled, and Phase 5 shrinks;
- the Phase 1b table is refreshed;
- the AppImage release walks go into the release gate;
- the line refs move to the branch's numbers (`window.rs:351`, `App.tsx:160`, smoke `:761`, `:1879`, `:1882`);
- two review findings go to triage: "a window that hangs mid-restore loses its remaining tabs" (pre-existing),
  and the keyboard-style right-click menu (already §M);
- §P's T15 row (a reloaded `main` re-spawns every window) gains a note: with the gate in place, `take` could
  return nothing once `read` is set, which would fix it in one line. Not done here: it changes reload behaviour,
  out of #18's scope (superseded: the fix batch returns `main`'s own entry, T15 closed).

Then the triage plan runs.
