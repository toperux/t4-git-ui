# v1 smoke test re-walk (2026-09-05)

`docs/smoke-test.md` §1–§7 walked again in the installed build that carries the post-v1 fixes
(`33eb514`, `306109a`), on a fresh fixture, driven over CDP. Nothing here is fixed yet; the list is
for a go/no-go on each item.

## Findings

| # | Check | What happened | Expected | Notes |
|---|-------|---------------|----------|-------|
| 1 | §4 hunk staging | With lines selected in one hunk, **Stage hunk** on another hunk clears the selection and scrolls the diff back to the top. With no selection the scroll position survives. | Selection and scroll position survive a stage of a different hunk. | `DiffViewer.tsx:84` resets `sel` and `cursor` to 0 on every `diff` change; the cursor effect in `DiffBody` (`scrollToIndex(cursorRow)` whenever focus is inside the diff) then jumps to row 0. Fix: keep the cursor when the new diff still has that row (clamp instead of reset), and only clear the selection when its rows are gone. Medium. |
| 2 | §4 index.lock | With `index.lock` held, **Stage** fails (sticky toast with Retry — right) but the file moves to **Staged** anyway; `git status` still says unstaged. Retry then stages it for real. | The file stays unstaged until the index is written. | `stage.rs:24-46` `stage_paths` mutates the in-memory `Index` (`add_path`/`remove_path`) before `index.write()` fails; the status call that follows reads that dirty in-memory index. Same pattern in the hunk/line paths (`stage.rs:154-189`). Fix: `index.read(true)` (force reload) on the error path, or take a fresh `repo.index()` in status after a failure. Add a test that holds `index.lock` and asserts status. Medium. |
| 3 | §4 index.lock | **Retry** on the error toast runs the op but leaves the toast up; a second identical toast can stack on top if it fails again. | Retry dismisses the toast it was clicked on. | `Toast.tsx:23`: the action button calls `onClick` only. Call `dismiss(toast.id)` first. Low. |
| 4 | §1 clone dialog | After a failed clone (destination exists) focus is on `<body>`, and **Esc no longer closes the dialog**; Tab is also outside the trap until something inside is clicked. | Esc closes the dialog; focus stays inside. | The **Clone** submit button holds focus when clicked; `busy` disables it, so the browser drops focus to `body`; `Dialog.tsx:46-53` only pulls focus in on mount and Escape is handled by the form's `onKeyDown`. Fix: re-run the focus fallback when `busy` flips back to false (add `busy` to the effect deps). Any dialog that stays open across a failing submit has this. Low–medium. |
| 5 | §6 Esc / focus return | A dialog opened from a **commit-row context menu** (Create branch here…, Create tag here…) returns focus to `<body>` on Esc. Toolbar- and sidebar-opened dialogs return focus correctly. | Focus returns to the grid row. | `DialogHost.tsx:27` feeds `returnFocus` from the dialog store; the grid's menu path must be opening without setting it (or sets the menu item, which is unmounted by then). Check the `open()` call in `RevisionGrid.tsx`'s menu handlers and pass the row element. Low. |
| 6 | §5 pull rejected | FF-only pull on diverged history fails with the **push** wording: "Rejected: remote has new commits — Pull first" with a **Pull** action. | Something like "Cannot fast-forward — main and origin/main have diverged" and no Pull action (it just ran). | `opsStore.ts:118-120` maps `nonFastForward` once for both push and pull. Branch on the op name. Low. |
| 7 | §1 clone → status bar | A repo cloned from `file:///C:/tmp/t4/bare.git` shows its remote as `origin · /C:/tmp/t4/bare`. | `origin · C:/tmp/t4/bare` (or the path as given). | `paths.ts:32` `prettyUrl` strips `scheme://` and leaves the third slash of `file:///`. Strip `^file:///?` first. Cosmetic. Low. |
| 8 | §5 op in progress (doc) | "Click another op → Operation in progress toast" cannot happen: every op button and menu item is **disabled** with that tooltip, and the shortcuts (`Ctrl+F5`, `Ctrl+Shift+U`…) are silently ignored while busy (`useShortcuts.ts:36` `if (!busy)`). The toast is only reachable from `Ctrl+Shift+W` and the repo menu, where it works. | Either wording. | Doc: change the step to "buttons and menu items are disabled with the *Operation in progress* tooltip; shortcuts do nothing". Or drop the guard in `useShortcuts.ts` so `runOp` raises its toast (`opsStore.ts:141`). Doc-only is fine. |
| 9 | §3 whitespace toggle (doc) | "Ignore whitespace on the working tree" is unwalkable: the toggle (and Split) are disabled while staging since `f92664b`, with the tooltip "…unavailable while staging". | — | Doc: move the whitespace check to a committed diff (it works there), keep a line noting the toggle is off while staging. |

_Applied 2026-09-05, all nine, one commit. #1 carries the selection across a same-file reload by
matching hunks on their content (`carrySelection`) and leaves the cursor alone; #2 rolls the
in-memory index back (`index.read(true)`) when the write fails; #4 refocuses the dialog when `busy`
clears; #5 hands the grid container, not the virtualized row, to `returnFocusTo`; #6 branches on
the op label ("Pulling…"), the cheapest signal `runOp` has; #7 strips `file:///`'s third slash.
Re-walked 2026-09-05 in a rebuilt installer on a fresh fixture: selection kept and the diff stays
put after staging another hunk (checked on a 20 000 px diff scrolled to the bottom), a locked index
leaves the file unstaged and Retry clears the toast, Esc closes the clone dialog after a failed
clone, a commit-menu dialog returns focus to the grid, the FF-only pull says "Cannot fast-forward —
the branches have diverged" with no action, the `file:///` clone shows `origin · C:/tmp/t4/bare`.
All seven pass._

_Review of the fixes (2026-09-05) found three follow-ups, done in the next commit: the keyboard
cursor is carried over the reload too (`carryRef`), or a big hunk staged above it moved the view
down by that many rows; `stage_paths` / `remove_paths` roll the cached index back on any error
exit, not only a failed write (a refused ignored path mid-list left the earlier paths looking
staged); and the pull wording comes from a new backend `diverged` failure kind instead of sniffing
the "Pulling…" label, so a typed `git pull --ff-only` gets it too._

## Observations (no action proposed)

- **Stash / Enter staging**: pressing Enter on a file row to stage it drops focus to `<body>`
  (Space keeps it). Shift+↑ across a hunk boundary restarts the line selection in the other hunk
  rather than extending — arguably right, since a range across hunks cannot be staged as one.
- **Success toasts for push / pull** were not seen during the §5 push and FF pull; fetch, tag push,
  stash, cancel and amend toasts all appeared. Possibly timing (the evaluate ran after ~3 s);
  worth one manual look before calling it a bug.
- **Deleting a tag that is already gone on the remote** (`Also delete on the remote` after a
  remote-side delete) runs `git push origin --delete refs/tags/v-annot`, which git accepts with
  "deleting a non-existent ref" and exit 0, so the chain continues and the local tag goes. Fine.
- **Renamed-folder toast** reads "Not a git repository / not a git repository: c:\tmp\t4\other" —
  title and detail say the same thing. Cosmetic.
- **Stash dialog** opens with focus on the **Close** icon rather than the Message field (the field
  has no `autoFocus`; every other dialog focuses its first input).
- Identity change (`user.name` cleared) needs the repo reopened before the commit panel notices;
  by design (`loadAuthor` is cached per repo).

## Passed

§2, §3, §4 (multi-select, Enter/dblclick/hover/Stage all/Unstage all, hunk and line staging with
exact index contents, keyboard order Tab → line → ↑↓ / Space / Shift+↑ / Enter, unstage hunk and
lines, discard confirmations "Discard changes in hunks.txt? This cannot be undone." and "Delete
sample.ts? Untracked files are removed from disk." with Discard/Delete + Cancel, amend prefill and
"Staged (amending)", 75/72 counter, `Ctrl+Enter` → dock `$ git commit -F …` / `exit 0`, amend toast,
missing identity → warning + Commit disabled after reopen, `index.lock` sticky toast, pre-commit hook
→ toast with the first stderr line + dock auto-expands), §5 (Push dialog and preview, FF pull, Fetch
toast + chip, rejected push toast with Pull action, upstream-following pull on `feature`, sidebar
double-click checkout, merge conflict banners / markers / Keep ours / Keep theirs / "Marked resolved,
but the conflict markers are still here" / Restore conflict, external resolve, rebase conflict +
Abort, branch-name validation (six messages), branch from row, Force delete re-offer, tags from row
with previews, annotated message in details, tag push, "Everything up-to-date", moved tag rejected
"(already exists)", Delete on remote, local delete with "Also delete on the remote", fetch restores
a locally deleted pushed tag, Stash changes → sidebar + "Stashed changes" toast, Apply latest /
Pop latest / Drop from the toolbar menu and the stash dialog, detached checkout banner with
"Checkout main" / "Create branch…", slow fetch: buttons disabled with the tooltip, dock stays closed,
`Ctrl+` `` shows the elapsed timer + Cancel, cancel → "Cancelled" toast + `exit 1`, push to
`nowhere` → dock expands itself with "does not appear to be a git repository" + error toast,
`Ctrl+Shift+W` during an op refused with the toast, repo menu Open / recents / Close disabled with
the tooltip), §6 (Esc + focus return from toolbar and sidebar, Tab trapped, dropdown ↑/↓ + Enter
pick and Esc closes the list only, toast stacking and fade), §1 (start screen header / RECENT /
START / status bar `git 2.55.0.windows.1` + `N recent`, restart reopens the last repo, `Ctrl+Shift+W`
then restart → start screen with the repo in RECENT, newest first under the pinned ones, Pin jumps
to the top and survives a restart, Delete key and the hover X remove a row without touching disk,
filter + ↑/↓ + Enter opens the highlighted row, renamed folder → "Remove from list" toast that
works, `Ctrl+Shift+O` derives `bare` from the URL, typed parent folder, preview, clone opens the
repo, parent remembered on reopen, re-clone into the same folder → banner inside the dialog with
inputs preserved), §7 (big diff truncation banner, 300-file commit).

## Not walked

Needs something this run did not have: native folder pickers (`Ctrl+O` non-repo folder, `Ctrl+N`
empty / existing folder, the clone dialog's Choose folder…), **Resolve in editor** launching
VSCodium, OS theme switch while running, no-theme-flash at launch, DPI change, dock drag range,
"Git not found" screen, clone Cancel timing (a local clone finishes in well under a second; the
progress line was never visible either), and the two large-repo performance checks.

## Cleanup done

Fixture rebuilt with `pwsh -File docs/smoke-fixtures.ps1 -Force`; `C:\tmp\t4\clones` and
`.playwright-mcp/` deleted; `work` unpinned again. The walk removed the `other` entry from the
recents list (the renamed-folder check) — it comes back the next time it is opened.
