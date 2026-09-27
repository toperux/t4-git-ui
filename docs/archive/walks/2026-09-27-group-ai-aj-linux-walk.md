# Groups AI and AJ: two rows re-walked on Linux — 2026-09-27

Both rows had been blocked on Windows: a dead recent needs the native folder picker, and the recents store is shared
with the installed app. The Linux harness keeps its own store under a scratch `HOME`, so it can be seeded before
launch. Unknown to this branch at the time, close-out Phase 1 had already walked and ticked both on Windows the day
before (`docs/archive/walks/2026-09-26-phase-1-walk.md`). This walk is a second platform's evidence.

**Setup:**
- **Machine:** Ubuntu 26.04.1 (a VMware guest), WebKitGTK 2.52.6, git 2.53.0.
- **Build:** a debug build of `1f5fb67`, with the `.smoke` identifier (`smoke-linux.md` §1).
- **Driving:** WebDriver on Xvfb `:99` (`smoke-linux.md` §2), with the askpass guard.
- **Fixtures:** `smoke-fixtures.sh --force` into `/tmp/t4`.
- **Store:** seeded into `$S/home/.local/share/dev.topher.t4gitui.smoke/recents.json`, with `autoUpdateCheck:
  false`, so no launch contacted GitHub. The real store and `~/.gitconfig` were checksummed before and after:
  unchanged. `~/.config/dconf/user` changed during the session (at 15:01 and 15:07), with no `t4` or `/tmp` path in
  `dconf dump /`; `toolkit-accessibility` and `color-scheme` were unchanged. Cause not determined: likely the
  desktop itself.

## AJ :1272 — "Remove from list" on a dead recent

**Seed:** `recents` = `/tmp/t4/gone` (doesn't exist) and `/tmp/t4/work`; no `lastOpen`, and no `layout.json`, so the
app opened on the start screen.

**Steps:**
1. Click the `gone` recent → an error toast, `role="alert"`: *Not a git repository*, `/tmp/t4/gone`, **Remove from
   list**.
2. Install a counter:
   - from `[data-toast]`, follow its `__reactFiber$…` key up to the Toast's `memoizedProps.toast`;
   - wrap `toast.action.onClick` there;
   - the Button reads the action at click time (`Toast.tsx`), so the wrapper counts runs.
3. Click **Remove from list** once.

| Check | Result |
|---|---|
| The action ran once | **pass**: the counter read 1 |
| The toast closed | **pass**: `[data-toast]` count 0 |
| The dead recent is gone, `work` stays | **pass**: the list shows only `/tmp/t4/work` ("1 recent") |
| The store lost exactly one entry | **pass**: `recents.json` holds `work` alone, and `autoUpdateCheck` is kept |

**Not observable:** a second `dismiss(id)` (it's a filter, so a double run leaves the same state). Accepted when
the plan was reviewed.

## AI :1237 — a manual toggle survives a refresh

**Seed:** `layout.json` opening `/tmp/t4/work` (the picker isn't driven).

**Steps:**
1. Settings (Ctrl+,) → General → **Sidebar folders** → *Always collapsed*, through the UI. `recents.json` then
   read `"sidebarFolders": "collapsed"`, and both `topic` folders read `aria-expanded="false"`.
2. Click the **local** `topic` (Branches, over `topic/nested`) → `"true"`.
3. Fetch (the toolbar button; `origin` is the local `bare.git`). The dock showed `git fetch --progress --prune
   --end-of-options origin`, exit 0.
4. `git -C /tmp/t4/work branch x/y` from outside the app.

| Check | Result |
|---|---|
| Local `topic` still open after Fetch | **pass**: `"true"` |
| Remote `origin/topic` still closed | **pass**: `"false"` |
| The new folder `x` arrives collapsed | **pass**: `"false"`. It came from the watcher about 0.7 s after the branch; no F5 was needed |

**Cleanup:** `git branch -D x/y`, so `/tmp/t4` stays as the fixture made it, for Phase A.
