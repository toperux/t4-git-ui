# Group BG walk — 2026-09-25

The five fixes of `docs/archive/plans/2026-09-25-update-and-staging-fixes.md`, walked over CDP (`docs/smoke/cdp.mjs`) on a
local `tauri build --no-bundle` of `8c75071`, built with `--config {"version":"0.10.10"}` so the published 0.10.11
was offered. It ran in an isolated WebView2 profile (`smoke-launch.ps1`). The store folder was backed up first and
restored byte-exact afterwards. The installed app ran only for the reproduction below, and was closed for every row.
`8c75071` is the hash of the day. After the squash, that code plus three later review changes (the 16-digit `indexStamp`, one install at a time across windows, and the rejection toast kept per remote and branch) is `76dee06`.

Fixtures, all under `c:/tmp/t4`:
- `bg` (one file `f.txt`), with a bare remote `bg-origin.git` and a second clone `bg-other`;
- the existing `az` and `other` for the multi-window rows.

## Before the fix: which case was stale (open-items §N)

The BD 11 record said a status read landed *between* the rewrite and the `git add`. Checked first on the installed
0.10.11, with `f.txt` staged whole and shown in the Staged list:

- **A — rewrite and `git add` in one shell line:** **stale.** The body stayed on `line2 v1` after `v2` was staged.
- **B — rewrite, wait for the row to show the working-tree change, then `git add`:** correct at both reads. The
  in-between read reloaded the diff (still the index's `v2`), and the read after the add reloaded it again (`v3`).

So only A is the bug: an identical status entry before and after. `indexStamp` covers it. The BD 11 record's
description of the sequence was slightly off.

## Rows

1. **Re-staged behind the app** — pass. A: the body moved `v1` → `v2` with no reselect. B: `v2` → `v3`.
2. **Offline words** — pass.
   - With the proxy down, the launch check left *couldn't reach GitHub — check the connection (error sending request
     for url (https://github.com/toperux/t4-git-ui/releases/latest/download/latest.json))* in Settings › Updates.
   - A download cut after about 1.5 s at 200 KB/s: *the download was interrupted — try again (error decoding response
     body)*.
3. **The rejection toast retires** — pass. A push to `bg-origin.git` behind `bg-other`'s commit toasted *Rejected:
   remote has new commits — Pull first*.
   - **Fetch** → the toast stayed, beside *Fetched origin*.
   - A second rejection, then **Pull** (toolbar, Merge) → the toast went.
   - A third rejection, then a pull outside the app, then **Push** → the toast went; *Pushed master → origin/master*.
   - Clicking the toast's own **Pull** action closes the toast on the click (unchanged behaviour), so that path says
     nothing about retirement.
4. **Every window learns the answer** — pass.
   - Relaunch with `bg` and `other` restored → both badged.
   - **Ctrl+Shift+N** on `az` → the new `az` window badged too, from the kept answer. Only the main window checks at
     launch.
   - In the session launched behind the dead proxy, `az` had no badge. **Check now** in `bg` (proxy up) → `az` badged
     at once, through `update://checked`. `bg`'s own *couldn't reach GitHub* line gave way to *Version 0.10.11 is
     available*.
5. **Install asks about a typed message** — pass.
   - `wip draft` typed in `az` in the second window, which was then switched to `other`, so the draft was in a
     background tab.
   - **Update to 0.10.11…** in `bg` → a task dialog *Install the update*: *"Installing restarts T4 Git UI. The commit
     message typed in az will be lost."*, with **Install** and **Cancel**.
   - **Cancel** → no download (the proxy log shows no new tunnel), and the offer stayed.
   - The draft survived the tab switch back to `az`. After it was cleared, **Update to 0.10.11…** → no box, and
     *Downloading…* started; the cut is row 2.

## Driving notes

- `cdp.mjs --eval` runs in the page's global scope, so a top-level `const` in one eval collides with the next.
  Wrap each one in `(()=>{…})()`.
- `cdp.mjs` has no Backspace key. To clear a React-controlled input, call the native `value` setter and dispatch an
  `input` event.
- The `ask()` box is a task dialog. Its **Install** / **Cancel** are not `ControlType.Button` to UI Automation. Match
  by name and use `InvokePattern`; that pressed **Cancel** on the first try.
- Windows is left with a node `UV_HANDLE_CLOSING` assertion on `cdp.mjs`'s exit. It is noise: the output before it
  is complete.

## Re-walk before the push — 2026-09-25, a build of the code at `636dbf4`

The changes after the first walk had not run in the app: the 16-digit `indexStamp`, the cross-window install guard,
the toast kept per remote and branch, and the git2 message.
- **BG 1 again** — pass. `f.txt` staged at `w1`, then rewritten and `git add`ed in one line → the body moved to `w2`
  with no reselect.
- **BG 3, per remote** — pass. A second bare remote `mirror` was added to `bg`, one commit ahead.
  - **Push** to `mirror` → rejected, with the toast.
  - **Pull** from `origin` → the toast stayed.
  - With `master`'s upstream moved to `mirror/master` (see finding 1), **Pull** from `mirror` → merged (`910db56`),
    and the toast went.
- **git2 message** — not reachable from the page without a real libgit2 failure. `AppError::Git` serializes through
  `GitError`'s own `Serialize`, which `error::tests::a_libgit2_error_shows_its_message_alone` pins.
- **The install guard** needs two windows installing at once; it is unit-tested only.

Found on the way, older than this branch:
1. **Pull from a remote that is not the upstream's fails.** With `master` tracking `origin/master`, picking `mirror`
   in the Pull dialog runs `git pull … mirror` with no branch (the dialog names one only when the upstream is on the
   picked remote). git refuses: *"You asked to pull from the remote 'mirror', but did not specify a branch"*.
2. **The failure toast's detail was a progress line.** It read *Operation failed — remote: Enumerating objects: 4,
   done.*, not git's reason, which was in the dock.

Both were fixed the same day, before the push (open-items-done §M); the Pull dialog now names the local branch on
another remote.

**Walked 2026-09-26** on a build of the fix, after an independent review (below), on `bg`, with `master` tracking
`mirror/master` and a new commit on `origin`:
- **Pull, another remote** — pass. The dialog opened on `mirror` (`… mirror master`). Picking `origin` showed
  `… origin master`; Pull merged `daa7cb2` and toasted *Pulled origin/master*.
- **Failure toast after a fetch** — pass. With HEAD detached and one more commit on `origin`, a bare
  `git pull origin` printed `remote: Enumerating…` / `From …` / the ref update, then git's reason. The toast read
  *Operation failed — You are not currently on a branch.*

The review found no bug and three gaps, fixed in the same commit:
- an unborn branch (no `local` row) got a bare pull again: it now takes `refs.head.branch`;
- `useDefaultRemote` started on the first remote until `get_default_remote` answered, and a fast Enter now merged
  from it: it starts on the same order from the refs (the upstream's remote, `origin`, the first);
- stderr that is all fetch output fell to *git exited with code N*: its first line is kept.

It also noted that git wraps its advice, so a toast can stop mid-sentence. Left as is.
