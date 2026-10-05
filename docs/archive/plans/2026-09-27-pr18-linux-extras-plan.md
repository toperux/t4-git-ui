# Plan: Linux extras for PR #18 (T18 audit and fix, two smoke rows, the dock re-walk, T5 plan, a rewrap)

_Written 2026-09-27, revised through review round 3. Five small Linux items that fit PR #18's scope (the Linux smoke
harness and the WebKitGTK fixes). They share one smoke build and one fixture set. Everything runs on Xvfb: no window
opens on the user's desktop._

**Status (2026-09-27): done.** All five items ran; the records are:
- `docs/archive/walks/2026-09-27-t18-linux-focus-audit.md`: ten paths failed after a click, fixed by the shared mark,
  all re-walked and pass;
- `docs/archive/walks/2026-09-27-group-ai-aj-linux-walk.md`: AI and AJ pass (already ticked on Windows by close-out
  Phase 1 the day before);
- the Wayland walk's addendum: the dock's range and collapse pass on Xvfb;
- `docs/archive/plans/2026-09-27-t5-atspi-plan.md`: the T5 plan, from the spike;
- `direct.sh`: rewrapped, and `declare -f` is identical before and after.

## Shared setup

- **Build:** the smoke build (`smoke-linux.md` §1), Node 24 via fnm. Build once; rebuild only after a T18 fix.
- **Fixtures:** `bash docs/smoke/fixtures/smoke-fixtures.sh --force` into `/tmp/t4`.
- **Isolated `HOME`:** as in `smoke-linux.md` §2. Every launch carries the askpass guard.
  - Guard every scratch-store write with `: "${S:?}"`.
  - The scratch store is `$S/home/.local/share/dev.topher.t4gitui.smoke/`.
  - Every seed of `recents.json` (the kv store; `kv.ts:6`) carries `"autoUpdateCheck": false`, so launches don't
    contact GitHub.
  - Checksum the real store (`~/.local/share/dev.topher.t4gitui/`) and `~/.config/dconf/user` before and after.
- **Stop conditions:** `document.title` in every reading, and `git reflog` in the fixture before trusting anything
  after a surprise.
- **Cleanup at the end (T23):**
  - stop `tauri-driver`, WebKitWebDriver and Xvfb, and the spike's `dbus-daemon`/`at-spi-bus-launcher`/
    `dconf-service`; check that `pgrep` is empty;
  - undo the fixture changes: `git -C /tmp/t4/work branch -D x/y`, and `git -C /tmp/t4/work reset -q` (the
    fixture stages nothing, so this restores the index T18 may have changed);
  - **keep** `/tmp/t4` and the `.smoke` build for Phase A (T17), which is next;
  - remove the scratch files.

## 1. T18 — do other script-focused widgets lose their focus ring on WebKitGTK?

**Why:** WebKitGTK never gives a script-focused element `:focus-visible` (the AZ 6 menu bug, fixed in #18 by
`data-kbd` in `Menu.tsx`). Other widgets that move focus by script have the same gap.

**The paths that really focus by script:**
- the Settings tab strip, ←/→ (`SettingsDialog.tsx:332`);
- the Changes|Files tabs (`ChangedFileList.tsx:340`);
- the Sidebar tree, ↑/↓ (`Sidebar.tsx:136`);
- the palette (**Ctrl+K**), then Esc → focus back to the grid (`CommandPalette.tsx:45`);
- SearchPopover, Esc → its button (`SearchPopover.tsx:35`);
- a menu opened by keyboard, then Esc → its opener (`Menu.tsx:158`, `useRestoreFocus`). The opener isn't covered by
  the current `data-kbd` fix;
- Dialog opened with no autoFocus, e.g. Settings (`Dialog.tsx:75`); Dialog close → its opener (`:84`); the busy-state
  refocus (`:94`); the Tab-trap wrap (`:112`, `:115`);
- DiffDialog's autoFocused list (`ChangedFileList.tsx:120`);
- FilesColumn: a list emptied → the sibling list (`FilesColumn.tsx:232`, `:235`);
- the staging line cursor, drawn only as `.pick:focus-visible` and moved by script (`DiffViewer.tsx:423/462`,
  `FileContent.tsx:148/215`). This is the most likely real fail;
- toast Dismiss/Retry → focus back to the origin (`toastStore.ts:52-53`).

**N/A:** `↓` in the palette, a Select, or the changed-file list moves `aria-activedescendant` or the selection, not
focus. The Select trigger shows focus through `.input:focus-within`.

**Method** (Xvfb, real X keys through `xdotool`, as in the AZ walk):
- **Positive control first:** Tab to a toolbar IconButton. It must match `:focus-visible` and show the ring.
  Otherwise the window has no X focus, and every reading is void.
- For each path, record:
  - `document.hasFocus()`;
  - `document.activeElement`, and whether it matches `:focus-visible` or, after the fix, `[data-kbd]:focus`;
  - a screenshot, read.
- **"Visible" means the ring shows.** A `:focus-within` selection tint alone (`TreeRow.module.css:31`,
  `ChangedFileList.module.css:112`) is recorded as "tint only" and counts as a fail.
- Confirm each fail once in a direct launch (xdotool and `import`, no WebDriver), to rule out automation.

**The fix (decided: shared, in #18):**
- Move Menu's `keyInput` flag (`Menu.tsx:71-73`) into `src/lib/`; `openedByKey` imports it. Modifier-only keys
  (`Alt`, `Control`, `Meta`, `Shift`) don't set it, so Alt+Tab back doesn't mark a mouse-focused element.
- One document `focusin` listener sets `data-kbd` on the target when the last input was a key, and clears it
  otherwise. It's registered when the `src/lib/` module loads, beside the moved `keydown`/`pointerdown` listeners,
  so `Menu.test.tsx` runs with it.
- **Menu keeps its own mark:** a pointer open from a marked opener still marks the first item (`openedByKey`,
  `Menu.tsx:86-90`). `focusItem` keeps its menu-scoped clear (`Menu.tsx:81`), then calls `el.focus()`, then
  `toggleAttribute("data-kbd", kbd)`, so Menu's decision overrides the listener's.
- Add `[data-kbd]:where(:focus)` beside the global ring (`src/theme/base.css:50`), keeping its specificity, and
  `[data-kbd]:focus` twins in the same selector list as each component `:focus-visible` rule, so cascade order holds
  (26 in 15 files; Menu's and `RevisionGrid.module.css:218` already have them).
- **Tests:**
  - the listener: a key → marked; a pointer → not; a modifier alone → not;
  - Menu: a pointer open from a marked opener is still marked;
  - `Menu.test.tsx` still passes.
- **Gates:** `npm test`, `tsc`, lint.
- **Re-verify:** rebuild, re-walk every failing path on Linux, and re-run the positive control. Add the same paths
  to the Windows CDP re-walk (T19), since the change is shared.
- Its own commit.

**Records:**
- a walk record `docs/archive/walks/2026-09-27-t18-linux-focus-audit.md`, with one line per path (ring / tint only /
  none; before and after the fix);
- §O's "Linux audit" bullet → done, with a pointer;
- T18 in the menu/restore plan's table → done; T19 gains the paths.

## 2. Two unticked smoke rows the Windows walks couldn't finish

Both were blocked on Windows: the native picker, and the recents store shared with the installed app. The Linux
harness has its own store in the scratch `HOME`, which can be seeded before launch.

**Order:** AJ first on the fresh `HOME`, then quit, seed the layout, and run AI and T18 in one session with the repo
open.

### AJ :1266 — "Remove from list" on a dead recent

The row: **Remove from list** on a dead recent runs once and closes once, not twice. Its Retry and Pull halves
passed 2026-09-16.
- **Seed** `recents.json`, with no `layout.json`:
  - `recents`: `[{ path, name, lastOpened, pinned }]`, with `/tmp/t4/gone` (doesn't exist) and `/tmp/t4/work`;
  - no `lastOpen` (or `null`): a path there would be opened by `restoreTabs` (`App.tsx:38-41`), hiding the start
    screen;
  - `"autoUpdateCheck": false`, in the same file.
- **Launch to the start screen,** and click the dead recent. An error toast with **Remove from list** appears
  (`StartScreen.tsx:64-78`, the `fromRecents` branch).
- **Install a counter:**
  - from `[data-toast]`, take its `__reactFiber$…` key, walk to the Toast's `memoizedProps.toast`, and wrap
    `toast.action.onClick`;
  - the Button reads it at click time (`Toast.tsx:56-58`), so the wrapper counts runs.
- **Click Remove from list once, then check:**
  - the counter is 1;
  - the dead recent is gone, and `/tmp/t4/work` is still listed;
  - `[data-toast]` count 0 (error toasts are `role="alert"`);
  - the store file lost exactly one entry (read after a short wait).
- **Pass:** all four. A second `dismiss` can't be observed (it's a filter): noted, accepted.

### AI :1236 — "A manual toggle survives a refresh"

The row: under *Always collapsed*, expand `topic`, then Fetch → it stays open. A folder that first appears
mid-session (create `x/y`) arrives collapsed.
- **Open `/tmp/t4/work`** by seeding `layout.json` (the picker can't be driven).
- **Setting, through the UI:** Ctrl+, → General → Sidebar → the "Sidebar folders" Select → *Always collapsed*
  (`SettingsDialog.tsx:186-193`).
- **Steps:**
  1. Expand the **local** `topic` (the Branches tree, over `topic/nested`) by click. Check its `aria-expanded` is
     `"true"`.
  2. Fetch (the toolbar button; the remote is the local `bare.git`). Check the local `topic` is still `"true"`, and
     the remote `origin/topic` still `"false"`.
  3. Create the new folder outside the app: `git -C /tmp/t4/work branch x/y`.
  4. Poll the sidebar for an `x` folder for up to 10 s, then fall back to F5. Record which one fired. Check `x` reads
     `"false"`.
- **Pass:** all checks.

**Records, for each row:**
- **Pass:** tick the box.
  - AI: a dated note in the doc's style ("Walked 2026-09-27 on a Linux debug build of `<sha>` under WebDriver …").
  - AJ: extend its existing italic `*(2026-09-16: …)*` note.
  - The rows aren't OS-specific, so a Linux walk counts.
- **Fail:** the row stays unticked, with the finding.
- **Either way:**
  - update both groups' italic status headers;
  - write a walk record `docs/archive/walks/2026-09-27-group-ai-aj-linux-walk.md`;
  - in open-items §B, refresh the unticked counts and every `smoke-test-post-v1.md` line ref after ~1100 (each is
    off by 2: :1161, :1172, :1234, :1264, :1751, :1864, :1867, :1870).

## 3. The dock's range and collapse

**Why:** the Wayland walk counted the dock as a splitter, but didn't re-walk the WSLg list's dock drag (the range
and the collapse, `docs/archive/walks/2026-09-05-full-rewalk.md`). §B's claim was narrowed for that.

**On Xvfb (decided):** a WebDriver drag is made up inside WebKit and never goes through the compositor, so live
Wayland would test nothing more. The record says so.

**Values** (`RepoWindow.tsx:45-48`, `:195-197`): min 160, max 320, default 200, collapsed 28. It snaps to 28 only
below the midpoint (about 94 px); between 94 and 160 it clamps to 160.

**Method:** in the AI/T18 session. Run a Fetch so the dock has output, then expand the dock.
- **Measure** `document.querySelector('[aria-label="Resize output"]').nextElementSibling.getBoundingClientRect()
  .height`. Check first that the element is the dock panel.
- Drag up by 400 px → 320.
- Release at about 120 px → 160.
- Release at about 60 px → 28, and the separator has `aria-disabled="true"`. Skip `aria-valuenow`: it's a percent.
- Screenshot after each drag.

**Records:**
- **Pass:** an addendum in `docs/archive/walks/2026-09-27-linux-wayland-rendering-walk.md`, saying it was walked
  under automation on Xvfb, not with real Wayland input. §B's "except the dock's range and collapse" becomes that
  wording.
- **Fail:** a finding in the same addendum.

## 4. T5 — write the AT-SPI plan (plan only)

**Why:** GTK's native popups, the native file picker, the OS theme switch and DPI can't be driven through WebDriver
on live Wayland (`smoke-linux.md`, "Not reachable here"). T5 asks for a plan of its own.

**Installed:** `python3-gi` 3.56.2, `gir1.2-atspi-2.0`, `at-spi2-core` 2.60.4 and `libatk-bridge`. `NO_AT_BRIDGE`
is unset.

**Spike, Xvfb only (decided)**, about 10 min:
- It uses its own D-Bus session, started as `HOME=$S/home dbus-run-session -- …` (`HOME` set first, as in
  `smoke-linux.md:176`).
- Accessibility is enabled by `org.a11y.Status IsEnabled`, which writes `toolkit-accessibility` through dconf. With
  that `HOME`, the write lands in the scratch dconf; the desktop's setting and theme aren't touched (checksummed).
- Can it list the smoke app's tree:
  - the window;
  - the web content (it may need accessibility enabled);
  - a GTK popup after a right-click on a text field;
  - the file chooser (in-process GTK3 via rfd, so it's in the app's own tree)?

**Output:** `docs/archive/plans/2026-09-27-t5-atspi-plan.md`, covering:
- what AT-SPI can reach;
- a small helper design (`docs/smoke/atspi.py`: dump, find by role/name, click, type);
- which smoke rows it would unlock.
- **Limits:**
  - live Wayland is unconfirmed;
  - the OS theme is desktop-wide (portal/dconf);
  - `text-scaling-factor` isn't DPI;
  - the DPI row (`smoke-test.md:285`, a second monitor) is out of reach in a single-display VM.

**The plan is written, not implemented.** The T5 rows then point to it.

## 5. Rewrap `direct.sh:47,55`

Two older lines over 120 columns (`wins` at 125, `waitfor` at 130). Split each at a pipe or `;`.

**Check:** source it before and after with `S=$(mktemp -d)` and `APP=/usr/bin/env`, and diff the output of
`declare -f wins waitfor`. A pure rewrap diffs empty. Then `rm -rf "$S"`.

## Order

1. Item 5, the rewrap.
2. The build and fixtures; checksum the real store.
3. AJ (fresh `HOME`, start screen), then quit.
4. Seed the layout, then AI, item 3 and the T18 audit in one session.
5. The T18 shared fix (coder), gates, rebuild, re-walk the failing paths.
6. Item 4, the T5 spike on Xvfb, then the plan.
7. Cleanup (keep `/tmp/t4` and the build), and compare the real store's checksum.
8. **Review loop on all the changes**, then commit into #18 on the user's go. The T18 fix is its own commit.

## Decisions (2026-09-27)

1. **T18 fix:** a shared `focusin` + `data-kbd` fix in #18, not per-widget copies or rows only.
2. **AI's setting:** through the Settings UI.
3. **Ticking on Linux:** a Linux pass ticks AI and AJ; the rows aren't OS-specific.
4. **Item 3:** on Xvfb, with the record saying so. No window on the user's desktop.
5. **AJ's tick:** end state plus the fiber counter.
6. **Item 4:** a spike on Xvfb only; the user's desktop settings aren't touched.
7. **Cleanup:** keep `/tmp/t4` and the `.smoke` build for Phase A.
8. **Scope:** all five.
