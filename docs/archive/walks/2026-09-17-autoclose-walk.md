# Auto-close the Changes view, and `Ctrl+,` — 2026-09-17

`docs/smoke/smoke-test-post-v1.md` group **AY** (the Changes view closes itself after a commit that
empties the tree) in full, plus the two group **AX** bullets the settings-tabs walk could not show —
**AX 7** (hover keeps the selected tab's tint) and **AX 10** (`Ctrl+,`). Driven over CDP
(`docs/smoke/smoke-cdp.md`) against a local `tauri build --no-bundle` of the three unpushed commits
`9a9c0ac` / `19f9b8e` / `2781004`, launched with `docs/smoke/fixtures/smoke-launch.ps1` so its own
`WEBVIEW2_USER_DATA_FOLDER` kept the installed 0.10.4 out of it. Fixture `c:/tmp/t4/irebase` for
everything except AY 11, which needs `c:/tmp/t4/mbk-clone` (3004 files). Dark theme.

The assertion in every AY bullet is which view the window is on afterwards, read as the toolbar
`ViewSwitch`'s own labels (`History | Changes<N>`, `*` marking the active one) together with whether
the commit panel is still mounted and whether the `Working tree clean` empty state is on screen.

## Results

### AX

| Step | Result |
|---|---|
| 7 hover keeps the tint | **pass**, at all three places. Computed `background-color` under a real `mouseMoved`: the selected tab holds `--bg-active` `rgba(255,255,255,0.09)` while hovered, an unselected one takes `--bg-hover` `rgba(255,255,255,0.05)`, an unhovered one is transparent. Measured on Settings' `General|Git`, on the `Changes|Files` pair and on an open `SidebarRail` section (`Local` open, `Remotes` closed). The disabled half needs a running download, so it was read with `disabled` forced on the Git tab: transparent, `--fg-muted`, opacity 0.45 — it does not light up |
| 10 `Ctrl+,` | **pass** — opens Settings from the repo window and from the start screen; from inside the commit **Summary** field and from the **dock prompt** too, and in both cases the field's text was untouched (no comma inserted). Pressed again with Settings open it stayed at one dialog. Also re-read AX 1's heading list on this build: `Theme · Sidebar · Changes · Updates` |

AX 4's focusable counts were edited after the first walk and are still **not** re-measured.

### AY

| Step | Result |
|---|---|
| 1 stage both, commit | **pass** — `Changes2*` → `History*`, commit panel gone, `AY1 both staged` at the top of the grid, no working-tree row |
| 2 stage one of two | **pass** — stayed `Changes1*` with `b.txt` still listed. Partly done is not done |
| 3 untracked only | **pass** — closed. An untracked file counts, so emptying it empties the tree |
| 4 amend on a clean tree | **pass** — stayed in Changes on the empty state; the amend landed (message replaced, no new commit). Nothing was emptied, and that empty state is what the amend was started from |
| 5 from the commit dialog | **pass** both ways — with Changes open behind it the dialog closed and the view behind was History; started from History it moved nothing |
| 6 Commit & Push | **pass** — the view closed, the Push dialog opened over History with focus on its Remote field, and closing it left focus on `<body>` with nothing on the console. `<body>` is where the bar's × and Alt+1 already leave it |
| 7 merge, resolved and staged | **pass** — closed. `MERGE_HEAD` is gone by the time the answer is read, so the state is plainly clean and nothing is owed. The banner had been above the view switch throughout |
| 8 paused rebase | **pass, and this is the one the review fix was for** — see below |
| 9 discard / terminal stash | **pass** both ways — stayed open. See the native-dialog note below |
| 10 setting off | **pass** — unchecked, the commit left nothing and the view stayed on the empty state; after a restart it was still unchecked; re-checked and **left checked** |
| 11 slow repo | **closed** — the `fetchStatus` seq-guard race did not show on `mbk-clone` |

## AY 8, walked both ways

A rebase paused on an `edit` stop, tree clean, banner reading "Rebase paused — amend or add commits
in the commit panel, then Continue". Dirtying and staging a file first, so `hadChanges` was true and
the commit emptied the tree, left the state clause as the only thing holding the view open: the
commit landed and the view **stayed** in Changes with the banner intact. Under the pre-fix
`state !== "merge"` this is exactly the case that closed the pane out from under the banner pointing
at it.

The bullet's last sentence was **wrong** and has been corrected. A cherry-pick stopped on a conflict
is not the same: resolving and committing *finishes* it — git clears `CHERRY_PICK_HEAD`, and the
state comes from libgit2's `Repository::state()`, which reads clean from that moment — so nothing is
owed and the view closes, like the merge in bullet 7. Walked: it closed, and that is correct. What
keeps the pane open is an operation still unfinished *after* the commit, which is what an `edit` stop
is and what a conflict stop is not. `docs/design/style-guide.md`'s Views bullet now says so too.

## Findings

### AY-1 — a Discard whose native confirm is unanswered looks exactly like a Discard that does nothing

`commitStore.discard` asks first, through `@tauri-apps/plugin-dialog`'s `ask()`. That box is a Win32
dialog: it is not in the DOM, `[role="dialog"]` does not see it, CDP cannot click it, and the webview
keeps answering while it waits. So three clicks on **Discard…** read as three no-ops — the menu
closing each time (`onClose()` runs before the confirm), the file still modified, nothing in the
output dock, nothing on the console — while three confirms were in fact stacked up off-page.

`docs/smoke/fixtures/smoke-dialog.ps1` exists for exactly this and is what `smoke-cdp.md` §"Native
dialogs" says to use; I wrote my own before reading either, which is the actual mistake here. Group
AY bullet 9 now names the trap so the next walk reads it as a pending confirm rather than a dead
feature.

One thing for the next walk to check rather than trust: today's box exposed its buttons to UI
Automation as command-link **Panes** named `CommandButton_1000` / `CommandButton_1001` (a TaskDialog),
not as class-`Button` child windows, which is what `smoke-dialog.ps1` looks for with `BM_CLICK`. That
fixture was verified when it was written, so this is a discrepancy to measure against a live box, not
a reason to change its advice. What did work today was `WScript.Shell` `AppActivate('<dialog title>')`
followed by `SendKeys {ENTER}` for the default (ok) button — the opposite of what the section warns,
so the honest summary is that the two approaches suit different box styles. Posting `WM_COMMAND` to
the dialog's own HWND did **not** work and is not evidence either way.

### AY-2 — a wrong turn of mine, recorded so nobody repeats it

Chasing AY-1 I probed `plugin:dialog|ask` directly, got "Command plugin:dialog|ask not allowed by
ACL", and concluded the capability was missing a permission — that `3d01d3f` had dropped `allow-ask`
when it replaced `dialog:default` with three named permissions. That was wrong. `ask()` does not
invoke `plugin:dialog|ask`: it is a wrapper over `messageCommand`, which invokes
`plugin:dialog|message` (`node_modules/@tauri-apps/plugin-dialog/dist-js/index.js`). So
`dialog:allow-message` is the right permission, the capability's own description was right, and the
command I probed is simply one this app never calls. The edit was reverted and the binary rebuilt
before the walk continued.

What came out of it worth keeping is `src/lib/dialogCapability.test.ts`: for every export imported
from `@tauri-apps/plugin-dialog` anywhere in `src`, the capability must grant the permission for the
command that export actually invokes — with `ask` / `confirm` / `message` all mapping to `message`.
It encodes the non-obvious mapping, and it fails if a needed permission ever does go missing, which
nothing else would catch because every unit test mocks the plugin. Checked by mutation: swapping
`allow-message` for `allow-ask` fails it with
`expected [ 'message', 'open', 'save' ] to deeply equal [ 'ask', 'open', 'save' ]`.

### AY-3 — AY 5's "toolbar Commit…" does not exist

There is no Commit button on the toolbar. From Changes the commit dialog opens from the commit
panel's *Open commit window* icon; from History it is `Commit…` in the repository menu and in the
command palette (`commands.tsx` `repo.commit`), or the grid's working-tree row. Bullet 5 now says so.
Unrelated: while mid-cherry-pick the state banner carries its own **Commit** button beside Abort, so
a text-matched click on "Commit" finds the banner's before the panel's — a CDP snag, not a defect.

## Not walked

- **AX 6** (a download locks the tab row) — needs a publishable newer release.
- **AX 4** (focusable counts) — edited after the first walk, not re-measured here.
- **AY 11's race** — observed as closing; the drop only happens when a watcher fetch overtakes
  `refresh()`, which did not occur in this run.

## Fixture and state, restored

- `c:/tmp/t4/irebase` — reset to its snapshot HEAD `c172c6d` with `M a.txt` + `A dirty.txt` re-applied
  from patches, the walk's `ay7-side` / `ay8-pick` branches deleted and its one stash dropped.
  Verified byte-for-byte against the snapshot's `git status --porcelain`.
- `c:/tmp/t4/mbk-clone` — `reset --hard HEAD~1`, back to `4832f67fb housekeeping`, clean.
- `%APPDATA%/dev.topher.t4gitui/layout.json` — the five-tab session is restored from a backup taken
  before the start-screen step closed every tab, byte-identical. Reaching the start screen at all
  means closing them, and that file is shared with the installed app.
- Settings › General › Changes — left **checked**, as AY 10 requires. `recents.json` carries the
  walk's own openings (`mbk-clone`), which is ordinary use of a recents list.
