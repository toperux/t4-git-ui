# Post-v1 smoke test findings (2026-09-05)

Issues found walking `docs/smoke-test-post-v1.md`. Collected here as they come in; fixed in
one pass after the walk, not one at a time. Installer under test:
`target/release/bundle/nsis/t4-git-ui_0.1.0_x64-setup.exe` (built 2026-09-03, predates
`7d9cfe1`/`a3e1b5c`, neither of which changes anything user-visible).

## Findings

| # | Check | What happened | Expected | Notes |
|---|-------|---------------|----------|-------|
| 1 | A1 | `feature` has no `merged` badge in `work` (shows `0 ahead, 1 behind` only). `twin-a` / `twin-b` / `origin/twin-remote` badges are right. | `feature` muted, badge "Merged into main" — `git merge-base --is-ancestor feature main` is true. | Root cause in `refs.rs` `reachers`: the revwalk is `Sort::TIME` only. The fixture has many commits in the same second (`feature edit`, `merge feature`, `main edit`, `first` all at 1788530913); with tied times libgit2 pops the `feature edit` tip before `merge feature` has propagated `main`'s bit to it, so its row is captured with nothing reaching it. Needs `Sort::TOPOLOGICAL \| Sort::TIME`. Also drop the `left == 0` early break or keep it — it is safe once order is topological. Add a `tests/merged.rs` case with tied timestamps (the `TempRepo` builder makes them strictly increasing, so it never hit this). |
| 2 | — (status bar, seen during A) | Status bar shows `nowhere · C:\tmp\t4\does-not-exist` as the repo's remote. | `origin · …bare.git`: `main` tracks `origin/main`. | `RepoWindow.tsx:184` uses `refs.remotes[0]`, which is alphabetical. The backend already has `config::default_remote` (tracking → origin → first) behind `get_default_remote`; the status bar should use it, or the remotes list should put the default first. Low. |
| 3 | B1 (doc / fixture) | **Checkout feature** from the commit menu fails: `error: Your local changes to the following files would be overwritten by checkout: crlf-hunks.txt hunks.txt src/a.txt src/lib/b.txt` (dock expanded with exit 1, app behaved correctly). | The post-v1 doc says every group "can be run on its own", but B needs a clean tree for the files `feature` differs in, and the fixture deliberately leaves them dirty for E/F/G. | Doc fix, not code: tell B/C/H/I to start with `git stash -u` (or walk E/F/G first, then discard). For this walk: stashed as `smoke`, popping before E. |
| 4 | B (observation) | On a row with several branches (`twins`: twin-a / twin-b / origin/twin-remote; also `feature` + `origin/feature-upstream` once they share a tip) the menu reads **Merge branch here…** (generic, dialog picks) but **Rebase solo onto twin-a…** (first branch, no picker). | Same treatment for both, whichever it is. | Cosmetic / consistency. Low. `commitMenu.ts`. |
| 5 | B10 (Merge item) | With a 75-char branch checked out, the **Reset … to here…** and **Rebase … onto …** items ellipsize the long name correctly (tooltip carries the full text). The **Merge origin/feature into <long>…** item does not: the source chip `origin/feature` (the span with `_menuBranch`) is squeezed to **0 px wide, i.e. invisible**, and the `into <long-name>…` span is 526 px wide inside a 312 px menu. Measured via DOM; item height stays 26 px so it overflows sideways. | Only the branch-name segment ellipsizes, the fixed words stay visible, and no segment disappears. | `RevisionGrid.tsx` / `RevisionGrid.module.css` `menuBranch`: Merge puts the ellipsis class on the *source* segment and leaves the *current-branch* segment (`into X…`) unshrinkable; Rebase/Reset put it on the current branch. Fix: apply the min-width-0 + ellipsis treatment to every branch-name span in an item (both source and target), and keep the fixed words `flex: none`. Add a render test with a long current branch that asserts every chip has non-zero width or `text-overflow: ellipsis`. |
| 6 | E3 (doc vs design) | "select a file, collapse its folder → Ctrl+A then Enter stages the hidden one too": clicked `a.txt`, clicked `src` (collapses, and the folder button keeps focus), Ctrl+A selected all five files, **Enter re-expanded `src` and staged nothing**. | Per the doc, Enter stages the selection including the hidden file. | Working as coded: `FilesColumn.tsx:220-226` says a focused folder row answers Enter/Space/←/→ itself. The doc step can only pass if focus leaves the folder first. Either (a) doc: add "then click a file row / press ↓" before Enter, or (b) code: when Ctrl+A runs while a folder holds focus, move focus to the list so the next Enter acts on the selection. (b) is friendlier; a one-liner in the `"a"` case. Low. Everything else in E3 passed: folder Enter/Space/←/→ toggle and stage nothing; ↓ from the hidden file lands on `crlf-hunks.txt`. |
| 7 | F (native confirm) | The Discard hunk / Discard lines confirmation is a native box whose buttons read **Discard** and **No**. | **Discard** / **Cancel**. "No" answers a yes/no question; the prompt is "Discard this hunk…?" with a verb button. | `commitStore.ts:326,336,360,369` pass `okLabel` but no `cancelLabel`; the plugin's default is "No". Add `cancelLabel: "Cancel"` to all four `ask()` calls (and `CommitPanel.tsx:121`). One-liner each. Low. |
| 8 | F / H (conflicted row) | The right-click menu of a conflicted (`UU`) unstaged row offers **Discard… Delete** between Stage and the Keep items (seen in both the merge and the rebase). The diff header correctly has no Discard hunk / lines for it. | F says "a conflicted file offers no Discard". | `FileContextMenu.tsx:78` shows Discard for every `list === "unstaged"` selection; `FilesColumn.tsx:251` (`Delete` key) has the same gate. `CommitPanel.tsx:84` already has the right rule (`!conflicted && !untracked` for hunks; whole-file discard of untracked is fine). Whole-file discard of a conflicted path goes to `discard_paths` → `CheckoutBuilder` from the index, which is undefined for a stage-1/2/3 entry. Fix: hide the item and ignore `Delete` when any selected path is conflicted; add a render test. Low. |
| 9 | H (observation) | The **N conflict — resolve in the commit panel** toast is an error toast, so it persists until dismissed; after **Abort** in the banner it is still there, and the merge + rebase left two identical ones stacked. | Aborting (or resolving) the operation clears its conflict toast. | `opsStore.ts:116` raises it; `toastStore.ts` keeps errors until dismissed by design. Cheapest fix: raise it as `kind: "warning"`/info with the auto-dismiss, or dismiss it from the abort path. Low. |

Not walked (needs something this run did not have): **G2** exec-bit (Unix checkout), **G1** Open /
Reveal (launch external apps), **C** rejected-push toast, **E4** Commit & Push focus return.
Everything else in A–J passed, including the restart checks (light from first paint, Settings
values, dock history, tree mode).

## Fix plan

_Applied 2026-09-05, all nine, one commit. Two deviations: #1 keeps the date-ordered walk (a
topological sort walks all history up front) and instead orders each same-second run of commits
children-first; #4 names the first branch in the Merge item rather than making Rebase generic,
because the dialog already opens on that branch in both cases._

_Re-walked 2026-09-05 in a rebuilt installer, on a fresh fixture: A1 badge, status-bar remote,
menu wording, B10 (75-char branch, no overflow), E3 Ctrl+A → Enter, F Discard / Cancel, H (no
Discard on the conflicted row, Replace / Cancel, toast gone after 6 s, none left after Abort) all
pass. B10 needed one more CSS touch: with plain flex shrink the short chip lost most of its width
(`origin/solo` at 27 px), so `.menuBranch` now takes an equal share capped at its text._

Order: code fixes with tests first (1, 5, 8), then the one-liners (2, 7, 9, 4, 6), then the doc
(3). One gate run at the end: `tsc`, `vitest --run`, `cargo fmt --all --check`, `clippy`,
`cargo test`. Nothing is pushed.

1. **#1 merged badge** — `crates/git-core/src/refs.rs:238` `Sort::TOPOLOGICAL | Sort::TIME`;
   `crates/git-core/tests/merged.rs` gets a case whose commits share one timestamp (build them with
   an explicit fixed `Signature::new(..., Time)` instead of `TempRepo`'s increasing clock) and
   asserts the merged tip is badged.
2. **#5 Merge item overflow** — `RevisionGrid.tsx:273`: give the `into <current>` `MenuRef` the
   `menuBranch` class too (and the source keeps it); check `RevisionGrid.module.css` `.menuBranch`
   has `min-width: 0; overflow: hidden; text-overflow: ellipsis` and the surrounding fixed words
   `flex: none`. Test: render the menu with a 75-char current branch and assert the source chip's
   text is still in the DOM with a non-`0` width, or simply that both chips carry the class.
3. **#8 Discard on conflicted rows** — `FileContextMenu.tsx:78` gate on
   `list === "unstaged" && !paths.some((p) => entryOf(p)?.conflicted)`; `FilesColumn.tsx:251`
   the same for the `Delete` key. One render test: conflicted row → no Discard item.
4. **#2 status bar remote** — `RepoWindow.tsx:184`: prefer the current branch's upstream remote,
   else `origin`, else the first (`refs.local.find(isHead)?.upstream` carries the remote name —
   confirm the field; otherwise call `getDefaultRemote`). Test in `RepoWindow.test.tsx` if one
   exists for the status bar, else none.
5. **#7 cancelLabel** — `commitStore.ts:326,336,360,369` and `CommitPanel.tsx:124` add
   `cancelLabel: "Cancel"`.
6. **#9 conflict toast** — `opsStore.ts:116`: make the conflicts toast non-error (auto-dismiss);
   the banner already carries the state. Update `opsStore.test.ts` expectation if it checks the kind.
7. **#4 menu wording** — `RevisionGrid.tsx:244-246`: with several branches on the row make Rebase
   read `Rebase <current> onto here…` like Merge's generic form, or make both name the first
   branch; pick the generic form (the dialog picks). Update the menu test.
8. **#6 Ctrl+A with a focused folder** — `FilesColumn.tsx:242` `case "a"`: after selecting all,
   move focus to the list container so Enter acts on the selection. Extend the existing E3-style
   test.
9. **#3 doc** — `docs/smoke-test-post-v1.md`: header of B, C, H, I gets "start with
   `git stash -u`" (or walk E/F/G first); F's "conflicted file" clause stays (it becomes true
   with #8); G notes Open / Reveal are manual.

Cleanup done with the walk: `.playwright-mcp/`, `menu-long-branch.png`, `toast-overlap.png`
deleted from the repo; `C:\tmp\t4\work\untracked.txt` deleted. The fixture otherwise carries the
walk's residue (tags `smoke-push` / `smoke-nowhere`, commit `d0b5364` on `main`, staged hunk):
`pwsh -File docs/smoke-fixtures.ps1 -Force` before the next walk.
