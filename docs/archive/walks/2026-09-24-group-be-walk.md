# Group BE walk — a rejected push and a cancelled fetch against GitHub (2026-09-24)

The two rows of `docs/smoke/smoke-test-post-v1.md` group BE that daily use on an Azure DevOps work
repository had never hit. Driven over CDP (`docs/smoke/cdp.mjs`) on the **installed 0.10.10**, launched with
`smoke-launch.ps1 -Installed` (its own WebView2 profile). The store folder `%APPDATA%\dev.topher.t4gitui`
was backed up first and restored byte-exact afterwards. `layout.json` was pointed at `C:\tmp\t4\dogfood`
alone for the walk, and afterwards got back its two-window copy from before any window was closed (see
Observations, 3). Fixture: `docs/smoke/fixtures/dogfood-fixture.sh`.

## Setup

**Push**, `dogfood/test` with no upstream → the dialog preselects `origin`, **Set upstream** ticked,
preview `git push --progress -u origin --end-of-options dogfood/test`. Pushed with no credential prompt (GCM
had one stored); `ls-remote` shows `8178f2b`, status `dogfood/test...origin/dogfood/test`.

## Row 1 — a rejected push: pass

- `dogfood-fixture.sh diverge` → `8356bd9` on GitHub from the second clone.
- In the app: Changes › **Stage all** on `mine.txt`, summary, **Commit** → `f512518`, `[ahead 1]`.
- **Push** (preview `git push --progress origin --end-of-options dogfood/test`) → exit 1 in 1.3 s. The dock,
  collapsed before, showed git's `! [rejected] dogfood/test -> dogfood/test (fetch first)` and its hints.
  The error toast read **Rejected: remote has new commits — Pull first**, with a **Pull** action. Push and
  Fetch enabled again.
- **Pull**: the dialog opens on Remote `origin`, Integrate with **Merge**, preview
  `git pull --progress --no-rebase --end-of-options origin dogfood/test` → merge commit `f6aa074` with git's
  default message, no editor.
- **Push** again → `8356bd9..f6aa074 dogfood/test -> dogfood/test`, toast
  `Pushed dogfood/test → origin/dogfood/test`, branch in sync.

## Row 2 — a cancelled fetch: pass

- **Fetch options** → the dialog opens on **All remotes** (two remotes), as the row warns; Remote `big` →
  preview `git fetch --progress --prune --end-of-options big`.
- Fetch → the status bar reads `Fetching big…`, a Cancel is reachable with the dock still collapsed, and the
  dock stays collapsed. Expanded (`` Ctrl+` ``): git's `Receiving objects` progress at ~14–17 MiB/s.
- **Cancel** → `exit 1 · 12.7s` at 40 % (169.66 MiB of ~408k objects), toast **Cancelled**, every toolbar
  op button enabled again. No `*.lock` under `.git`, and no `big/*` remote-tracking refs.
- The toolbar **Fetch** right after → `git fetch --progress --prune --end-of-options origin`, exit 0 in 0.7 s,
  toast **Fetched origin**.

At this link speed the whole `big` fetch would take ~20 s, so a slow Cancel can miss it. On a faster link the
row wants a bigger remote, or a quicker Cancel.

## Cleanup

HEAD row › **Delete origin/dogfood/test on remote…** → preview
`git push origin --delete --end-of-options refs/heads/dogfood/test` → **Delete on remote** → toast
`Deleted origin/dogfood/test`. `git ls-remote --refs <url> 'dogfood*'` is empty.

## Observations, none acted on

1. **The rejection toast outlives its cause.** Error toasts never expire (`toastStore.ts:81`, by design), so
   **Rejected: remote has new commits — Pull first** and its **Pull** button stayed up through the
   successful Pull, the successful Push, the cancelled fetch and the next fetch, until dismissed by hand. A
   successful push or pull of the same branch could retire it.
2. **That toast sat over the grid's top row** — the right-click meant for the HEAD row at its centre landed
   on the toast's title and opened no menu. Dismissing it first worked. Hand use would just aim elsewhere on
   the row; a CDP walk has to dismiss error toasts before clicking near them.
3. **Closing windows one by one drops the earlier ones from `layout.json`.** Before the walk the app was
   closed by hand, one window at a time, more than 4 s apart. The first window's 8 tabs left `layout.json` —
   the accepted window-restore rule (open-items-done §M) doing what it says. Restored from a copy taken
   before either close. For a walk that needs the app closed: back up the store folder **before** asking
   for the close, or use **Quit**.
