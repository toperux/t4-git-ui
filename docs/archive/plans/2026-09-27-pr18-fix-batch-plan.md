# PR #18 — the fix batch after the re-walks

**Parent:** `2026-09-27-pr18-windows-plan.md` (the layout gate and T19). Its re-walks are
`docs/archive/walks/2026-09-27-t19-windows-walk.md` and `docs/archive/walks/2026-09-27-pr18-linux-rewalk.md`.

**Goal:** every finding from the re-walks and review pass 1 is fixed or recorded in one batch, re-walked on both
OSes, and reviewed clean. After that, #18 waits only on the user's merge go.

**Status:** done 2026-09-27. `afc40f3` (Step 1) and `6465201` (Step 2), plus the docs commit, are committed locally
and walked on both OSes (the records' *After the fix batch* sections).
- **Reviews:** plan review passes 1–4 were folded in before the go. Step 8 took two passes: the code clean, the
  docs down to nits, all applied.
- **Left for the user:** the push, the PR description and the merge.
- **Line refs** in Steps 1–6 are to `f5276b6`.

---

## Decisions (the user, 2026-09-27)

| # | Question | Answer |
|---|---|---|
| F-scope | The 4 re-walk findings are in the Linux session's commits: in the batch? | **Yes, all 4** |
| F6 / R5 | Which Ctrl/⌘ chords count as keyboard input | **Only Ctrl/⌘ + a navigation key** (arrows, Home, End, PageUp, PageDown). Every other chord, whether a character, F5, Enter, Escape or a dead key, stays ignored |
| R5b | Ctrl+arrows after a click will ring on Windows too, where 0.10.12 likely shows none | **Accept.** The same on every OS; recorded as a wanted change |
| F7 | Focus back from a text field after only Ctrl chords has no ring on WebKitGTK | **Accept**, recorded in §O |
| B3 | A click on the already-focused grid keeps its mark | **Leave it:** Chromium does the same (T19 case A) |
| D-a / D1 | Seed `main` in `take` (1a), and no shrink while restoring (1b). This **reverses T11** (dropped 2026-09-26), and widens the §P crash loop to crashes inside `open_repo` and to `layout[0]` tabs not yet reached | **Keep both.** A kill or crash during a slow or hung restore is likelier than a repository that crashes `open_repo`; §P's loop-breaker is the real fix for the loop |
| D-b | Where to re-measure the Linux hang rate | **At Phase A, on the native Linux host**, with the fixed helper. WSL has never shown the real hang, and Step 1 changes restore timing. Only the wording is corrected now |
| D-c | May a walk record that isn't pushed yet be edited in place (D3)? | **Yes, while unpushed.** State the exception in D3. Pushed records stay addendum-only |
| P1 | A second `take` in one process (a `main` reload; StrictMode's double effect under `tauri dev`) would restore every other window again, now that the file stays | **It returns `main`'s own current entry and spawns nothing.** This closes T15 |

## Where the branch is

- **Pushed:**
  - `639856e` (the gate)
  - `f5276b6` (the Ctrl/⌘ change, T19)
- **Local, unpushed:** `afc40f3` (Step 1), `6465201` (Step 2), and the docs commit on top. The docs commit holds
  the two walk records, which were `b679469` and `bd20c24` before Step 7's `reset --soft`.

**Keep a copy of the current WSL build** (`f5276b6`) before rebuilding: it is Step 7's Linux baseline.

---

## Step 1 — `main`'s saved tabs stay in `layout.json` from its read (finding 2; reverses T11)

**The defect (verified):**
- `take` (`window.rs:295`) → `take_layouts` deletes the file (`:541`).
- `main` first appears in `layouts.open` when `openTab` adds its first tab (after `open_repo`, before the load,
  `tabsStore.ts:98-106`). That is the subscription `setLayout` (`App.tsx:175`).
- Until then, every write holds only the other windows: the file is `[other]` (seen in WSL at 0.1 s).
- For a single-window session there is no file at all.
- That window lasts for `open_repo` of `main`'s first tab: seconds on a large repository, and the whole restore if
  it hangs.
- After it, `main`'s entry grows one tab at a time, so a crash while tabs 2..N open loses them.

**1a. Seed `main` in `take`, and leave the file in place** (`window.rs`):

```rust
fn take(l: &mut Layouts, path: &Path) -> Vec<Layout> {
    // Once per process: a reloaded `main` (or StrictMode's second run in dev) gets its own tabs back and spawns nothing.
    if l.read {
        return l.open.get("main").cloned().into_iter().collect();
    }
    let out = read_layouts(path); // was take_layouts: the same read, without the remove_file
    l.read = true;
    if let Some(first) = out.first() {
        l.open.insert("main".to_string(), first.clone());
    }
    out
}
```

- **Why no delete and no write:** the file on disk is the right content until the next write. For seed A that is
  `spawn`'s, which writes the seed plus the other window. For seed B it is `main`'s one-shot report (1b holds the
  subscription until then).
  - A write in `take` itself would briefly leave `[main]` only, before `spawn` adds the others: a new loss window
    of one IPC round trip.
  - A delete leaves a moment with no file.
  - **Nothing restores twice:** every run with a successful `takeLayout` ends in the one-shot report
    (`App.tsx:99`), which rewrites the file.
  - A first launch writes nothing until then.
  - A crash before any write restores the same session again, which is the point.
- **The rename:** `take_layouts` → `read_layouts`. Tests that read the file through it keep working. Only the
  round-trip test asserts it is consumed (`:575-576`); it is updated.

- **Why `"main"`:** only `main` calls `take_layout` (`App.tsx:37`, `isMainWindow()`), and the file orders by that
  literal (`window.rs:524`).
- **Why `insert`, not `or_insert`:** `main` may have reported a tab it adopted before its read. `or_insert` would
  keep that tab and drop the saved entry.
- **Interactions (review):**
  - The closed chain is empty at startup.
  - `main` closed mid-restore: the seed moves into the chain; before, its tabs were lost.
  - A `main` whose repositories are gone: its one-shot report (`App.tsx:99`) replaces the seed with an empty entry,
    which `write_layouts` filters (`:519-521`).
  - **A reloaded `main` (T15, §P)** gets only its own entry from the guard, so no window is spawned twice. The
    same holds for StrictMode's double `probe` under `tauri dev` (`main.tsx:15`), where the second run would otherwise
    re-spawn every other window. A reload before any write re-restores the seed, which is better than today's `[]`.
  - **Two processes without single-instance** (no reachable session bus) both restore the session: before, the
    second usually got `[]`. One clause in the `take_layout` doc; no code.

**1b. No shrink while restoring** (`App.tsx`):
- **The flag:** a module-level `let restoring = false`, set in `restoreTabs` around its body with
  `try { … } finally { restoring = false; }`.
- **The subscription** (`:169-176`) skips only `setLayout` while it is set. Recents and `lastOpen` still update.
- **The end state:** the one-shot report at `:99` sends it.
- **It also applies to a window restored from `takePending`:** its `spawn` entry stands until its one-shot report,
  which is right.

**Code comments and docs, rewritten in this commit:**
- `spawned` (`:229-231`): the crash-at-launch note no longer applies.
- `take` (`:293-294`): "set after the read, under the lock".
- `take_layout` (`:284-287`): "consumed" becomes "read and left in place; the next write (a `spawn`, or `main`'s
  one-shot report) replaces it".
- `read_layouts` (`:536`): its doc loses "and clears".
- The round-trip test (`:560-576`): its doc ("the file consumed once"), its name
  (`layouts_round_trip_main_first_and_are_taken_once`) and the `assert!(!path.exists())`.
- `src/api/ipc.ts:110`, `takeLayout`'s JSDoc: "consumed, so `[]` on every launch after it" becomes "left in place
  until the next write".
- `src-tauri/src/lib.rs:141-142`: "consume `layout.json`" is reworded. Also say that where single-instance can't
  run (no session bus), a second process started before the first write restores the same session again, where
  before it got nothing. An edge case; no code change.
- `App.tsx:93-96`: the one-shot report replaces the seed; the subscription waits while restoring.
- One sentence on the rare loss (R9): a tab dragged onto a `main` still on *Starting* is in no entry until `main`'s
  one-shot report.
- `src/README.md:11`: "reports `set_layout` on every tab change" becomes "except while restoring, then once".

**Tests:**
- **Rust (`window.rs`, the `saved_session` style):**
  - `main_is_in_the_file_from_its_read`: `take`, then `spawned(w2)` + `persist` → the file holds both. Fails today.
  - `a_single_window_session_survives_its_read`: a file with only `main`; after `take`, the file still holds it.
    Fails today (deleted).
  - `mains_report_replaces_the_seed`: after `take`, `main` reports empty → the file holds only the other window.
  - `a_first_launch_seeds_nothing`: no file → `take` returns `[]`, `open` has no `"main"`, and no file is written.
    It removes its path at the start too (the pid-keyed name can be stale).
  - `a_second_take_returns_mains_own_entry`: after `take`, and with the file still there, `main` reports `[c:/z]`. A
    second `take` returns only that, and nothing for the other windows.
  - **Cleanup:** without the delete, tests that relied on it leave their temp file (`:587`, `:699`, `:711`, `:801`,
    `:817`). Each test removes its path at the end.
- **Vitest (`App.test.tsx`, 1b):**
  - `openTab.mockImplementation(async (p) => useTabsStore.setState((s) => ({ tabs: [...s.tabs, { id: p, path: p,
    name: p, stale: false }], active: p })))`. The default mock adds no tab, so without this the test can't fail.
  - A two-tab restore calls `setLayout` exactly once, with `{ tabs: ["/a", "/b"], active: "/b" }`. It fails without
    the flag.
  - The `lastOpen` fallback's `openTab` rejects, then a later `openTab` still reports. It fails if the `finally` is
    dropped.

**Gates:**
- `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` in `src-tauri`.
- `npm test` and `npx tsc --noEmit`, run with uppercase `F:/`.

## Step 2 — only Ctrl/⌘ + a navigation key counts (F6, R5)

**`src/lib/kbdFocus.ts:18-20`:**

```ts
const NAV = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);
document.addEventListener("keydown", (e) => {
  if (!MODIFIERS.has(e.key) && (!(e.ctrlKey || e.metaKey) || NAV.has(e.key))) keyInput = true;
}, true);
```

- **Why:**
  - Ctrl+↑↓ / Home / End (`Sidebar.tsx:129-132`), Ctrl+←→ (`ChangedFileList.tsx:334-340`,
    `SettingsDialog.tsx:326-332`) and Ctrl+↑↓ in the diff and file views move focus in handlers that ignore
    modifiers, so they count.
  - Every shortcut stays ignored: Ctrl+, / K / W / Tab / F5 / Enter / Escape, dead keys, AltGr. A click then a
    shortcut shows no ring, as decided for case B.
- **The doc comment above** says so. It must not claim Chromium parity for the nav keys (R5b).
- **Tests (`kbdFocus.test.ts`):**
  - "Ctrl+ArrowDown after the pointer is a key": fails on `f5276b6`.
  - "⌘+ArrowDown after the pointer is a key" (the Meta half).
  - "Ctrl+F5 and Ctrl+Enter after the pointer are not keys".
  - Keep the two existing shortcut tests.
- **Gates:** `npm test`, `tsc`.

## Step 3 — the harness: `killapp` waits for the single-instance name (finding 1)

**`docs/smoke/fixtures/direct.sh:35-40`:**

```bash
# SIGKILL, then wait until it's gone, and until the bus has dropped its single-instance name (50-100 ms after the
# pid): a launch before that hands its argv to the dead instance and exits.
killapp() {
  pkill -9 -fx "$APP"
  local i; for i in $(seq 20); do pidof_app >/dev/null || break; sleep 0.25; done
  pidof_app >/dev/null && { echo "$(ts) app still running after 5 s"; return 1; }
  # No reachable user bus (or no busctl): a fixed pause, not measured.
  busctl --user list >/dev/null 2>&1 || { sleep 1; return 0; }
  for i in $(seq 40); do busctl --user status "$ID.SingleInstance" >/dev/null 2>&1 || return 0; sleep 0.05; done
  echo "$(ts) $ID.SingleInstance still on the bus after 2 s"; return 1
}
```

- **Why the `list` probe:** `busctl status` also fails when it can't reach the bus, which would bring the race back
  unnoticed. zbus and sd-bus resolve the session bus the same way, so a reachable `busctl` is the app's bus.
- **The loop, in `direct.sh`'s header example** (so the steps are reproducible):
  ```bash
  for i in $(seq 20); do seed '…'; dlaunch
    waitfor 'T4 Git UI - work' 'T4 Git UI - other' || running; lay; killapp; done
  ```
- **Checks (WSL):**
  - `bash -n direct.sh`.
  - That loop with no pause: all 20 come up.
  - Once more with `busctl() { return 1; }` defined in the shell, for the fallback; then `unset -f busctl`.

## Step 4 — `smoke-linux.md` prerequisites (finding 4)

**`:17`:** split the line, so one missing name can't abort the rest:

```bash
sudo apt install xvfb xdotool imagemagick xclip
# WebKitWebDriver: `webkitgtk-webdriver` (seen on Ubuntu 26.04) or `webkit2gtk-driver` (seen on 24.04);
# other releases have one of the two
sudo apt install webkitgtk-webdriver || sudo apt install webkit2gtk-driver
command -v WebKitWebDriver   # must print a path
cargo install tauri-driver --locked
```

Sources: the 26.04 name is the line as the author wrote it on that host (`smoke-linux.md:8`, the AZ walk). The 24.04
name is from the WSL re-walk.

## Step 5 — the hang-rate wording (D-b: no re-measure now)

Line refs in Steps 5 and 6 are to the files **before** any edit; edit each file bottom-up.

**What is known:**
- The WSL race: 7 of 20 launches straight after `killapp`; 0 of 20 with the wait.
- WSL real hangs: 0 in 40 two-window runs: 36 came up, and 4 were the race (they never reached `spawn`).
- The 7 of 20 was measured with a kill-and-relaunch loop that likely had the same race, and whether those 7 were
  alive wasn't recorded.
- The 3 of 16 were real hangs: a live `w1` titled "T4 Git UI", on the spinner under WebDriver
  (`2026-09-26-group-az-linux-walk.md:34-38`). The race leaves no window.

**Correct:**
- `open-items.md:221-222`: the rate line, as above.
- `open-items.md:227-228`: "all 7 hangs included" becomes "if those 7 were the race, the guard checked nothing
  for them; it is untested against a real hang".
- `open-items.md:234`, `:241`, `:249-250`: Phase A's A/B loses its premise; its 30-launch baseline and 50-launch
  gate run on the native host with the fixed helper, and Phase A's own review decides whether to keep the A/B.
- Plan `2026-09-26-linux-menu-focus-and-restore-plan.md`:
  - `:74`: a pointer to the race and the WSL numbers (the 3 of 16 stands).
  - `:101-105`: Phase A step 1 names the fixed helper.
  - `:200`: the gate, with the fixed helper.
  - `:223-229`: as `open-items`.
  - `:241` (D2) and `:299` (Order 4): the A/B wording.
- `smoke-linux.md:145`: "about 1 restore in 3 to 5" becomes the 3 of 16 real hangs, plus a pointer to the
  `killapp` race.

**Frozen:** `2026-09-26-group-az-linux-walk.md` (pushed; D3). Its hangs are real.

## Step 6 — records, §O, the T11 rows

- **D3** (`linux-plan:244`): add "a record not yet pushed may still be corrected in place".
- **The Linux re-walk record (`bd20c24`, unpushed, edited in place):**
  - §1: two batches of 20. The first had 4 not up (all the race) and 0 lost; the second, with the helper patched
    locally, had 0 and 0.
  - The finding: only the 7 of 20 may be the race; the 3 of 16 is not.
  - §2's crash-at-launch note: fixed by Step 1a.
  - §3's "Seen on the way": cite T19 case A and the AZ 6 note (`t19:84-87`) for Chromium keeping the ring.
  - A closing section with the Step 7 results and the final hashes.
- **The T19 record:** the file is pushed, so it gets a dated addendum. `b679469`'s addendum at its end is unpushed,
  so it may be corrected in place (D-c); the rest of the file stays frozen. The addendum covers:
  - Chromium's own rule was observed only for Ctrl+,.
  - The ⌘ half and macOS are unwalked (`base.css:50-51` ORs WebKit's own `:focus-visible`).
  - Step 2's narrowing, and Step 7's Windows F6 reading against 0.10.12.
- **`open-items.md` §O:**
  - `:218`: the Ctrl/⌘ rule as narrowed, worded from what was walked, not "as in Chromium".
  - A "gated since" line for Step 1: `take` no longer deletes the file, `main` is seeded at `take`, and nothing
    shrinks while restoring.
  - `:246-248`: T11 reversed 2026-09-27 (D-a).
  - F7, an accepted limit: on WebKitGTK, focus moved by script back from a text field after only Ctrl/⌘ chords (a
    click, then Ctrl+K twice; a paste, then Ctrl+Enter in the commit window) comes back unmarked. Chromium is
    expected to ring it; unwalked. The fix would be to also mark in `focusin` when `relatedTarget` is an input or
    textarea.
- **`open-items.md` §P:**
  - The crash-loop row: "a restored window's tabs are in the file before they open: since Phase C for spawned
    windows, and since 2026-09-27 (the seed) for `main`, so the loop also covers crashes inside `open_repo`". Raise
    its priority in the triage plan. Its loop-breaker sub-bullet (`:382`, "`take_layouts` deletes the file") is
    reworded: `take` now leaves the file in place.
  - The T15 row (a reloaded `main` re-spawns every other window) is closed by Step 1a's guard (P1). It moves to
    `open-items-done.md` once Step 7's reload check passes.
  - The Linux restore plan's T15 row (`:268`) says so too.
- **The Linux restore plan:**
  - The crash-at-launch bullet `:188-191`.
  - The T11 row `:264`, and its paragraph `:278-286`: reversed 2026-09-27, with the reason.
  - The T19 row `:272`: the narrowed rule.
- **Memory:** `pr18-linux.md`.

## Step 7 — commit the fixes, rebuild, re-walk

**Commit first, so the records name real hashes:**
- `git fetch` first. If `origin/linux-smoke-and-fixes` moved, rebase the two local records onto it before anything
  else.
- **`B`** = the pushed tip after that fetch (`git rev-parse origin/linux-smoke-and-fixes`; `f5276b6` today). Every
  reset and diff below uses `B`, never a literal hash, so no pushed commit is ever re-committed.
- A temporary local branch `tmp/pr18-records` at the records' tip keeps them reachable. Delete it after Step 8.
- `git reset --soft B`: this un-commits the two records into the index; no pushed history is touched.
- Then commit, path-limited, with this repo's style (`fix: ` and a capital):
  1. Step 1 (`src-tauri/`, `src/App.tsx`, `src/App.test.tsx`, `src/README.md`):
     `fix: The main window's saved tabs stay in layout.json while its session is restored`
  2. Step 2 (`src/lib/kbdFocus*`): `fix: Only Ctrl or ⌘ with a navigation key counts as keyboard input`
- Everything under `docs/` and `.claude/` stays uncommitted until Step 8.

**The poll** (both OSes): a small Node script, a synchronous busy loop (`readFileSync` in a `for (;;)` until a
10 s deadline, no timers: Windows timers tick at about 15 ms), logging each change of state with its time.
- `ENOENT` is *absent*. Any other read error (Windows `EBUSY`/`EPERM` mid-write), or an empty or unparseable read, is
  a write in progress: retry it, and don't count it.

**Seeds** (the fixtures have only `work` and `other`, and a repository opens in one window only, so add three
scratch clones on each OS, `git clone -q <root>/bare.git <root>/seed1`, `seed2` and `seed3`, removed at clean-up):
- **A:** two windows. `main` has 3 tabs (`work` and two other fixtures); the second window has 2, so the poll also
  shows a spawned window never shrinking.
- **B:** one window, 3 tabs.
- **Pass:** every observed state holds all 3 `main` tabs, plus both of the second window's for seed A.
- **Baseline first**, the same script on the build before the fix. It must show at least one absent or short state,
  which proves the check can fail.
  - Windows: the installed 0.10.12.
  - WSL: the kept `f5276b6` build.

**Windows** (CDP; store backed up before the user closes the app, restored and `cmp`'d after):
- Seeds A and B, baseline then new.
- W1, W2, W3; W4 (the second launch at 0.1 s: a gate regression check).
- **Reload (P1):** after seed A comes up, reload `main` with `setTimeout(() => location.reload(), 0)` over CDP (the
  app binds F5 itself; a bare `reload()` can block the eval).
  - **Pass:** `main` comes back with its own tabs; the page-target count in `/json/list` is unchanged; `layout.json`
    still holds both windows.
  - **On the baseline**, run it as the last step there: it spawns duplicates (T15), which proves the check can fail.
- **F6:** click `main` in the sidebar, then Ctrl+↓. Read `:focus-visible` and `data-kbd` on 0.10.12 first, then on
  the new build (ringed). Record the Windows change (R5b).
- **Shortcuts stay ignored:** click a grid row, then Ctrl+F5, then Ctrl+K twice. The grid gets focus back by script
  and has no `data-kbd`. Read `data-kbd` only: Chromium may ring natively (F7).

**WSL** (Xvfb, the Step 3 helper):
- Seeds A and B, baseline then new.
- The second launch at 0.05 and 0.1 s.
- 30 two-window restores: each *not up* classified as alive (a real hang) or exited. This is Step 1's regression
  check, not a rate (D-b).
- W1–W3, AZ 6, F6 and the shortcut check with real X keys.
- The reload check, as on Windows: WebDriver's `setTimeout` reload, the window count from its window handles, and
  the baseline last.

**Clean up:** as in both re-walks. Delete the kept baseline build.

## Step 8 — review pass 2, the docs commit, then stop

- **Review:**
  - `git add -N docs/ src/ src-tauri/` first, so new files (this plan) show in the diff.
  - Two independent reviewers over `git diff B`: the two fix commits plus the uncommitted docs, both records
    included.
  - Loop until a pass comes back clean, at most 3 passes; after that, what's left goes to the user.
  - A decision goes to the user at once.
  - A code fix found here is folded into its fix commit (nothing after `B` is pushed): `git reset --soft B` again,
    then re-commit path-limited (Step 1, Step 2). No rebase, so the staged docs stay as they are. The walk rows it
    touches are re-walked.
- **The docs commit, last:** `docs: …` with Steps 3–6, both walk records, and this plan (its Status set to done).
  `git add docs/ .claude/`, then commit. `git status --short` must then be empty, bar scratch files meant to stay
  out.
- **Before any push:** `git fetch`. If the remote head moved (the Linux session may have pushed), rebase the 3 new
  commits onto it, never force.
- **The records' hashes** are written after the last re-commit. After a rebase at push time they change again:
  update them, amend the docs commit (the top one, unpushed), and re-run the gates.
- **Then stop.** The push, the PR description and the merge each wait for the user's word. The PR description gets:
  - T19 done;
  - the Ctrl/⌘ rule as narrowed, and the Windows change;
  - the gate, and the seed with T11 reversed;
  - the `killapp` race and the corrected hang-rate wording;
  - F7 as an accepted limit;
  - "Linux session: re-run your restore check on the new head", since Step 1 changes restore.

## After merge (from the parent plan, plus this batch's additions)

- **One docs commit on `main`** for the close-out and triage plans: §O/§P rows, Phase 5 shrinks, the Phase 1b
  table, AppImage walks in the release gate, line refs (re-derived on `main` after the merge).
- **Triage additions:**
  - the keyboard-style right-click (§M), from the parent;
  - the §P crash loop, now wider (D-a), with its priority raised (T15 is closed by this batch, P1);
  - a window that hangs mid-restore loses its tabs: closed by 1b. Step 7's seed A poll was never short on either
    OS; close it in the triage;
  - AppImage `-comp zstd`;
  - unpinned apt packages.
- **Then the triage plan runs.**
