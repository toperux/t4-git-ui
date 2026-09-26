# Plan: the two Linux bugs from the AZ 11 walk

_Written 2026-09-26. Source: `docs/plans/open-items.md` §O and `docs/archive/walks/2026-09-26-group-az-linux-walk.md`.
Both bugs reproduce on Ubuntu 26.04.1 / WebKitGTK 2.52.6 without WebDriver. Two independent tasks: either can ship
first. Line numbers are as of `1e795ad`, before these changes; search by name in the working tree._

## Task 1 — menus show no keyboard focus on WebKitGTK

**Cause (established).** Every highlight and the clipped-name wrap are keyed on `.item:focus-visible`
(`src/components/ui/Menu/Menu.module.css`, `RevisionGrid.module.css:218`). The menu moves focus with plain
`.focus()` calls:
- on open: `Menu.tsx:112`, and a submenu at `:354`, from a `useEffect` after render;
- on the arrow keys: `:169` and `:174`, in `onMenuKeyDown`;
- back from a submenu to its parent item: `closePanel` at `:334`, on Escape / ArrowLeft (`:188-191`).

Chromium gives a script-focused element `:focus-visible` when the element that had focus before matched
it, so the chain carries. WebKitGTK does not: the first item never matches, even when the grid it opened
from does (measured), so no item ever does.

**Fix: make the rule explicit instead of leaving it to the engine.** In `Menu.tsx`, put a `data-kbd` attribute
on an item focused from the keyboard, and style `[data-kbd]:focus` wherever `:focus-visible` is used today:

1. **One helper,** `focusItem(el, kbd)`: clears `data-kbd` inside the menu element (not just siblings: separators
   and groups sit between items), sets it on `el` when `kbd`, and calls `el.focus()`.
2. **Arrow keys, Home, End** (`onMenuKeyDown`) **and `closePanel`** (`:334`, whose only callers are key handlers):
   `kbd = true`. They are keys by definition.
3. **Open** (`:112`, `:354`): `kbd` = the opener matched `:focus-visible` or carried `data-kbd`, **or** the last input
   was a key.
   - The first covers the documented AZ 6 case: after arrow keys in the grid, a right-click opens with the first
     item marked, as on Windows today. **Unverified on WebKit:** the grid matched `:focus-visible` after arrow keys,
     but whether it still does after the right-click's `pointerdown` was not measured. Check it first; if it doesn't,
     keep a `data-kbd`-style mark on the grid too, or accept that a right-click opens unmarked on Linux.
   - The second covers Shift+F10 / the menu key after a mouse click.
   - "Last input" is one module-level flag in `Menu.tsx`, set by capture-phase `keydown` / `pointerdown`
     listeners on `document`, added once.
4. **CSS:** each `.item:focus-visible` selector in `Menu.module.css` gets a twin `.item[data-kbd]:focus`, and so
   does `RevisionGrid.module.css:218`. `:focus` rather than the bare attribute, so a stale mark on an item
   that has lost focus shows nothing.
5. **Hover leaves `data-kbd` alone.** `.item:hover` already has its own style.

Not in scope: other script-focused widgets (Select's list, the command palette, list rows). The audit in
verification step 3 says whether they share the bug; if they do, that goes in a row of its own.

**Tests** (vitest, `Menu.test.tsx` or beside it):
- ArrowDown marks the newly focused item, and only that one.
- A menu opened after a `pointerdown` does not mark its first item.
- A menu opened after a `keydown` does.
- jsdom has no real `:focus-visible`: `matches(':focus-visible')` returns false and does not throw (checked), so no
  guard is needed. The opener-matched branch is covered by a `data-kbd` opener (a submenu).
- The capture-phase listeners are module-level: added once when `Menu.tsx` is first imported, never per menu. Each
  test sets the flag by dispatching its own `keydown` / `pointerdown` first, so no test depends on the one before it.

**Verification.**
1. `npm test`; `cargo clippy` is unaffected.
2. Linux, `smoke-linux.md` harness (WebDriver is fine, one window). Re-walk AZ 6 in full:
   - the Shift+F10 + arrows wrap;
   - one sentence for the two-half Merge item;
   - a right-click after grid arrows opens marked;
   - the bottom-edge **End** → Delete row stays inside the window;
   - light theme;
   - the mouse half unchanged.
   Screenshot each; `import -window root` for anything near a native dialog.
3. Linux audit: arrow through the Select lists (Settings), the command palette and a file list, and close a
   menu with Escape (focus goes back to its trigger by script, in `useRestoreFocus`). Note any focused element with no
   highlight.
4. Windows: re-walk AZ 6 over CDP. It must look exactly as before, since Chromium matched already. This needs the
   Windows machine; it can't be done from here.
5. Tick AZ 11 Linux only together with Task 2's re-walk of 3a/3b/3d/3i (they passed, but on a build without these
   fixes).

## Task 2 — a restored second window sometimes never starts

**What is known.**
- **Rate:** about 3 of 16 two-window restores hang for good; two more take 7–15 s.
- **Where it stops:** the stuck `w1` logs nothing. Under WebDriver its page had loaded (the *Starting* spinner),
  and its first call, `kvGet("gitPath")` → `plugin:store|load`, never returned. In the direct hangs only the title
  is known, and it can't tell: "T4 Git UI" is set by Rust in `spawn`, by `index.html:7`, and by `useWindowTitle`
  with no repo open. Whether the page loaded is Phase A's screenshot probe.
- **Scope, under WebDriver only:** once stuck, async commands stalled app-wide (`probe_git` from `main` too), but a
  sync command (`take_pending`) still answered. In the direct (no-WebDriver) hangs, only "`w1` logs nothing" is
  known; whether `main` still answers was not checked.
- **The main thread was alive under WebDriver.** A sync command such as `take_pending` runs in the IPC protocol
  handler on the main thread (`tauri-2.11.6/src/ipc/protocol.rs:75`; the macro's blocking path), and it answered.
  So the stall is on the async side: the tokio runtime, or the async response path (`responder.respond`).
- **What `spawn` does around the window,** each worth a span in Phase A (`src-tauri/src/commands/window.rs:107`,
  on a `std::thread`):
  - **`builder.build()`** waits for the main thread to create the webview.
  - **`show_with_theme`** (`lib.rs`) reads `recents.json` through `app.store()`. With no stored theme (every walk
    launch: fresh `HOME`), it also calls `win.theme()`, a getter that **blocks on the main thread**
    (tauri-runtime-wry `window_getter!`, `lib.rs:197-211, 2098`).
  - **`win.show()` / `set_background_color`** only post a message to the event loop and return.
- **The store is an unlikely culprit.** Rust `app.store()` and JS `plugin:store|load` both run `build_inner`, and
  take the `stores` lock then the resource-table lock, in the same order (tauri-plugin-store 2.4.5
  `store.rs:188-203`). By the time `spawn` runs, `main`'s `show_with_theme` created `recents.json` in `setup`, so
  both only look it up. A cycle would need a third holder of the resource table. Phase A must not assume the store.
- **Not known:** whether it happens on Windows (it wasn't seen in the 2026-09-19 AZ walk), or whether it is
  restore-specific. Moving a tab to a new window (`detach`, `tabsStore.ts:169`, Ctrl+Shift+N), a drag tear-off
  (`useTabDrag.tsx:236` → `drop_tab`, `window.rs:448`) and a second launch (single-instance → `lib.rs:147`) all take
  the same `spawn`.

### Phase A — diagnose (no code change)

1. **A repro loop** in the walk's scratch style: seed a two-window `layout.json`, launch directly on Xvfb, and
   poll the window titles for 20 s. Count hangs over 30 launches as the baseline rate. The helpers are in
   `docs/smoke/fixtures/direct.sh` (`seed`, `dlaunch`, `waitfor`, `killapp`).
2. **Stacks of a hung process, without sudo.** `ptrace_scope=1` blocks attaching, but not a parent tracing its
   child. Run the app *under* gdb:

   ```bash
   gdb -q -batch -ex 'handle SIGPIPE SIGUSR1 SIGUSR2 nostop noprint pass' -ex run \
       -ex 'thread apply all bt 25' --args target/debug/t4-git-ui
   ```

   (the `handle` line stops a stray signal from ending the run early — batch mode prints and kills on the first stop)
   (`HOME`/`DISPLAY` set as in the walk). When it hangs, `kill -INT <app pid>`; gdb stops and prints every
   thread.
   - **Read, in this order:** what the tokio workers and the async response path wait on; what the spawn thread
     waits on (`build()` or `win.theme()`); what the main (GTK) thread is doing; and only then who holds the
     `stores` / resource-table locks.
   - **Expect:** a tokio worker or the response path blocked on something a main-thread round trip holds, e.g.
     a sync `recv()` (like `win.theme()`'s) reached from async context. Not a store-lock inversion (see above).
3. **Two more probes:**
   - **Did the stuck window's page load?** `import -window <id>` of the stuck window. The title can't tell: "T4 Git UI"
     is also what `index.html:7` and `useWindowTitle` show with no repo open. The spinner means the JS runs and is
     stuck on a call; blank means the webview never loaded.
   - **Is `main` alive in a direct hang?** Press F5 in `main` with `xdotool key` and look for a new log line.
   - **Is it restore-specific?** Two loops, both scriptable with no page access:
     - a second launch: run the binary again while it runs, and single-instance spawns an empty window from Rust
       (`lib.rs:147`);
     - a tab move: `xdotool key ctrl+shift+n` in a window with two tabs (`detach` → `spawn_window`).
4. **Record** the stacks and the verdict in the open-items row. If gdb changes the timing so it won't hang, add
   `tracing::debug!` spans around `spawn`'s `build()`, `show_with_theme`'s store read and `win.theme()`, and the
   plugin `load`, and use timestamps instead.

### Phase B — fix, per what A finds

- **If `show_with_theme` is part of the cycle** (its store read or its `win.theme()`): stop reading the store while
  spawning.
  - Read the theme preference once, in `setup` (`init_window_background`), into `AppState` (e.g. `stored_theme:
    Mutex<Option<String>>`).
  - Update that field where the preference changes. Every change goes through `setTheme` (`src/theme/theme.ts`,
    used by both the toolbar toggle and Settings), which already mirrors it into `recents.json`. Add a tiny command
    that `setTheme` calls; `"system"` clears it to `None`. **Not** "fall back to the OS theme for spawned windows": that
    brings back the wrong-colour flash `show_with_theme` exists to prevent, for anyone whose preference differs
    from the OS. (Passing the theme from JS in `spawn_window` would cover the restore and tear-off, but not the
    Rust-side single-instance spawn at `lib.rs:147`, so the `AppState` cache is the one fix for all three.)
  - `spawn` then takes no plugin lock at all. That still isn't "waits on nothing": a `"system"` user (`None`) falls
    through to `win.theme()`, the main-thread round trip. If A implicates main-thread waits, read the OS theme
    before the build thread starts. For `spawn_window`, `spawn` itself runs on the main thread (`window.rs:102-104`),
    where the getter runs inline.
- **If the cycle is elsewhere** (e.g. the spawn thread waiting in `build()` on a main thread that is itself
  waiting on something the spawn thread holds): build the window from an async command, or on the main thread via
  `app.run_on_main_thread`, instead of a `std::thread`. Take nothing across `build()`.
- **If it is inside the store plugin itself:** reproduce in a minimal Tauri app, file it upstream, and work
  around it locally as in the first bullet.

### Phase C — don't lose a window that never starts (independent of A/B, small)

Today a spawned window enters `layouts.open` only when its frontend calls `set_layout`. A window stuck on
*Starting* never does, so its tabs drop out of `layout.json`, and closing `main` loses them. In `spawn`, insert
`payload` into `layouts.open[label]` right away; the window's first `set_layout` replaces it. A window that never
starts then still comes back next launch.
- **Keep it testable:** put the change in a pure helper on `&mut Layouts`, like `close()` (`window.rs:199`), and call
  it from `spawn`. Unit test beside `a_closed_window_is_kept_for_the_grace` and the others: a spawned-but-unreported
  label is written; an empty payload writes nothing.
- **Closing a stuck window now counts:** `close()` returns early for a label not in `open`, so today a stuck window's
  close is a no-op. With the entry there, closing it moves its tabs to the chain and they expire after the grace,
  which is what a user closing it means. Worth a line in the test list.
- **No special case for an empty payload.** The single-instance spawn (`lib.rs:147`) passes `Layout::default()`, and
  inserting it is harmless: `write_layouts` drops tab-less entries (`window.rs:472`), `expire` ignores them, and
  `close()` gives a tab-less window no place in the chain.
- **Undo it on the `Err` branch** (`window.rs:150`), next to `pending().remove`. There, a tear-off's tabs go back to
  the source window (`tab-spawn-failed`), and a leftover entry would restore them twice.
- **A window whose tabs never open must not keep coming back.** A spawned window reports only through the
  `useTabsStore.subscribe` → `setLayout` path (`App.tsx:161-169`), which fires only when its tabs change. If every
  `openTab` in `restoreTabs` fails (a deleted repo, `App.tsx:47-53`), nothing changes: the pre-inserted entry is
  never replaced, it survives a quit and a close-all, and every launch reopens a window that fails the same way.
  (When `probe` never reaches `restoreTabs` — the git-missing screen, or `recents.load` throwing,
  `App.tsx:65-93` — keeping the entry is right: the window starts again next launch, once git is back.) Fix:
  the frontend calls `setLayout` once right after `await restoreTabs()` returns, inside the `try` at
  `App.tsx:89-91`, with the current `useTabsStore` state (empty if nothing opened). That replaces the entry, and an
  empty one drops out. **Never on the git-missing or `catch` paths.** There `restoreTabs` never ran, so `main`
  hasn't taken `layout.json` and a report would overwrite the untaken file with `[]` (`write_layouts` writes `"[]"`
  when every entry is filtered), erasing the saved session. In a spawned window it would drop the tabs Phase C just
  kept, during the very stall it guards against. Loop-prevention only needs the case where `restoreTabs` ran and no
  tab opened. Test: a pre-inserted entry replaced by an
  empty `set_layout` is no longer written (`write_layouts` filters it).
- **Crash at launch** *(accepted, T11)*: `main` calls `spawnWindow` (`App.tsx:44`) before any `set_layout` of its
  own, so the file
  Phase C writes then holds only `w1`'s entry. A crash right then restores `w1`'s tabs into `main`; today it restores
  nothing. Better than today; say so in a comment.
- **Tear-off overlap:** between the spawn and the source window's next `set_layout`, the torn tab is in both
  entries. A crash inside that gap restores it twice. It lasts milliseconds; accept it and say so in a comment.
- **Insert synchronously** in the block that fills `pending()`, before the build thread starts, and write the
  file then (through `restorable`, like `set_layout`).

**Verification (Task 2, once B and C are both in).** C alone makes a hang recoverable but doesn't stop it, so step 2
can't pass on C alone.
1. `cargo test --workspace`, `npm test`, `cargo clippy --workspace --all-targets -- -D warnings`.
2. The Phase A loop: 0 hangs in 50 launches, and no restore over 3 s.
3. Linux re-walk of AZ 3a, 3b, 3d, 3i (direct launch + `xclose.py`), then 3c, 3f, 3h and 3k, which exercise more
   windows.
4. Windows: re-walk AZ row 3 over CDP. Nothing may change there. C touches shared code, and so does B if it moves
   the theme read. This needs the Windows machine.
5. Then tick AZ 11 Linux (with Task 1's 6), write the walk record, and move §O to `open-items-done.md`.

## Status — 2026-09-26

- **Task 1: done, and checked on Linux** (committed on `linux-smoke-and-fixes`). A debug build, launched directly,
  real X keys. AZ 6 passes
  in full:
  - Shift+F10 opens with the first item marked and its name wrapped;
  - arrowing to Merge reads as one sentence;
  - End → the Delete row stays inside a short window;
  - a right-click after grid arrows opens marked. That settles verification's open question: the grid keeps
    `:focus-visible` through the right-click on WebKitGTK;
  - the mouse path is unmarked, one line, full-name `title`;
  - the light theme reads the same.

  Still to do: the Linux audit (verification 3) and the Windows re-walk (4).
- **Task 2 Phase C: done** (committed on `linux-smoke-and-fixes`); the gates pass. At runtime, in 20 two-window
  restores, `other` stayed
  in `layout.json` every time, hung or not. One run caught the crash-at-launch state (only `w1`'s entry at 1 s,
  before `main` reported).
- **The hang rate on this build was 7 of 20** (4, then 3, in two batches of 10; about 3 of 16 before). That
  is not significant at these sample sizes (p ≈ 0.3), but Phase C adds a `layouts` lock and a file write inside
  `spawn`. **Phase A step 1 must A/B it:** the same loop with Phase C's insert disabled, 30 launches each.
- **Phases A and B: not started.**

## Decisions — 2026-09-26 (triage after the review loop)

Two reviewers came back clean on the second pass. Every open decision and accepted limit was triaged with the user;
this section is the record.

**Decisions**
- **D1 Commits:** branch `linux-smoke-and-fixes`, then 3 commits: (a) the `patch.rs` umask fix + the Linux smoke
  harness, skill, smoke docs and walk records; (b) Task 1; (c) Phase C, with `open-items.md` and this plan (so what
  they call done is in the tree they land in).
- **D2 If Phase C raises the hang rate** (the Phase A A/B): keep the guard, but move the `layouts` insert and the
  `layout.json` write onto the build thread, **before `builder.build()`**. After it, the window's own first
  `set_layout` could land first and be overwritten by the stale payload. Only the `pending` insert stays synchronous.
- **D3 Walk records** are frozen: later facts go in a dated addendum at the end, as the 2026-09-19 AZ record does.
- **D4 Promote the direct-launch helpers** (seed `layout.json`, launch, wait for window titles, close by title
  through `xclose.py`) to a sourced script in `docs/smoke/fixtures/`, pointed to from `smoke-linux.md`.
- **D5 A group's italic header paragraph in the smoke docs is live status** (its "Open: …" list is kept current), unlike
  walk records (D3). AZ's was updated 2026-09-26.

**Triage** (T-numbers as in the review summary)

| # | Item | Outcome |
|---|---|---|
| T1 | `smoke-fixtures.sh` duplicates the `.ps1` | accepted; the header names the `.ps1` as the source of truth |
| T2 | `.sh` fixture uses GNU `sed` | **fix now**: portable (e.g. `awk`), so macOS can use it |
| T3 | `T4_ROOT` set on Windows breaks the ad7 check | accepted; documented at the check |
| T4 | the harness moves `HOME` (gpg needs `GNUPGHOME`; ssh unverified) | accepted; **verify ssh once** under a moved `HOME` |
| T5 | live Wayland, OS theme and DPI unreachable on Linux | **build AT-SPI driving** (own plan) |
| T6 | AC :761 `.deb`/AppImage update | **walked 2026-09-26:** `.deb` passes; the AppImage passes only with a workaround (blank-window bug, open-items §P); `.rpm` not walked. The row stays unticked |
| T7 | multi-window rows have no DOM access | re-test WebDriver with two windows after Phase B |
| T8 | the skill's Windows route is untested | test it on the next Windows walk (T19) |
| T9 | `xclip` missing | **done**: it turned out to be installed (0.13-4build1); it's now in `smoke-linux.md`'s prerequisites |
| T10 | tear-off overlap: a crash restores the tab twice | accepted |
| T11 | crash at launch restores `w1`'s tabs into `main` | **accepted** (revised in the second review: the fix would widen an existing crash loop; see below) |
| T12 | WebKit: a clicked submenu may inherit the mark | check it on the macOS walk (T21) |
| T13 | no unit test for `spawn`'s wiring | accepted; the smoke walk is the check |
| T14 | no test for the `catch` path (`recents.load` rejects) | **add the test** |
| T15 | a reloaded `main` re-spawns every other window | its own open-items row (§P), not part of this work |
| T16 | `patch.rs` asserts only the owner exec bit | accepted |
| T17 | the hang's cause and fix (Phases A, B) | next, right after the commits |
| T18 | Linux audit of other script-focused widgets | in the same session as T17 |
| T19 | Windows re-walks | AZ 6 as soon as the branch is up; row 3 after Phase B |
| T20 | Linux re-walk of AZ row 3, then tick AZ 11 Linux | after Phase B |
| T21 | macOS: AZ 11 and T12 | open until a Mac is available |
| T22 | AZ 9 is unit-tested only | **revised in the second review:** stays unticked, a record rather than work (open-items §B). A tick means walked (the skill's rule), and `check_staged`'s test covers only the message, not the toast or the refresh |
| T23 | `/tmp/t4` and the `.smoke` build | kept until Phase A |

**T11, dropped in the second review.** Having `main` report its taken layout before spawning closes the crash-at-launch
gap (a crash then restores `w1`'s tabs into `main`), but it would widen a crash loop that already exists.
- **The loop today:** `openTab` adds a tab, and the layout subscription reports it, as soon as the backend open
  returns and **before** the repository loads (`tabsStore.ts`). So a repository that crashes the app while loading
  is already in `layout.json` and crashes every later launch. That happens with one window or several.
- **What T11 adds:** the loop would also cover crashes inside the backend open itself, plus `layout[0]` tabs that
  `main` hadn't reached yet.
- **Decision:** the crash-at-launch gap is accepted, like T10, and the `spawned()` doc comment already says so. The
  existing loop is tracked on its own (open-items §P).

## Order

1. **Before committing** (they belong in the commits): T2 and D4 go in (a); T14 goes in (c). **Done 2026-09-26:**
   - **T2:** `awk` in place of GNU `sed`; checked against the old script's output: same tree, working tree and status.
   - **D4:** `docs/smoke/fixtures/direct.sh`, exercised end to end.
   - **T14:** a test that fails if a report is added to the `catch`.

   The gates pass (950 tests).
   T6 (the AC :761 walk) was done the same day: see the T6 row.
2. **D1:** the branch and the 3 commits.
3. **T19, first half:** you walk AZ 6 on Windows through the skill (also T8).
4. **T17 Phase A with the A/B** (D2 decides from its numbers), and the T18 audit in the same session.
5. **Phase B**, then T20 (Linux row 3), T19's second half (Windows row 3), and T7 (WebDriver with two windows).
6. **T4** (the ssh check under a moved `HOME`), whenever convenient.
7. **T5 AT-SPI:** its own plan when it's picked up. **T21:** when a Mac is available.
