# Group AV walk — 2026-09-15

`docs/smoke/smoke-test-post-v1.md` group AV (Changes bar close, sidebar echoes the selected commit,
stash surfaces show the working tree), driven over CDP (`docs/smoke/smoke-cdp.md`) against a local
`tauri build --no-bundle` of the four commits above `cb6244f` (0.10.0), launched with
`WEBVIEW2_USER_DATA_FOLDER` on a scratch profile. Fixture `c:/tmp/t4/irebase` in its resting state
(`a.txt` edited, `dirty.txt` staged) plus an untracked `new.txt`; `feature/x` and the tag `t-av`
were put on the HEAD commit for step 3 and removed after. Window sizes are `innerWidth` (viewport
emulation). Dark theme throughout.

## Results

| Step | Result |
|---|---|
| 1 changes bar | pass — title 293–522, `Stash…` at 528, spacer, × 1248–1272 in a bar ending at 1280 (tooltip `Close (Alt+1)`); click → History with the grid. At 700 the × ends at 692. The ellipsis path was not forced (the branch name fits); `.title` keeps `min-width: 0` + `text-overflow: ellipsis` with `flex-shrink: 1` |
| 2 sidebar tint | pass — HEAD's row → `main` `aria-selected` with `--bg-selected-unfocused` (#2a2e37) while the grid holds focus, the check unchanged; another commit → `other` only; Home onto the working tree → nothing; a click on the `main` row → `--bg-selected` (#2a3a5c). `origin/main` sits on `4918457` in this fixture — selecting that row tints it |
| 3 folder + tag | pass — `feature` open: `feature/x` tinted, the folder not; collapsed: the folder tinted, the branch row gone; the Tags section opened: `t-av` tinted beside `main` and `feature/x` |
| 4 Stash changes… | pass — `M a.txt`, `A dirty.txt`, `U new.txt` in a bordered list (84px), `Stash 3 files`, preview `git stash push -u`; untracked off → two rows, `Stash 2 files`, preview without `-u`; Stash → `stash@{0}: c172c6d add e`, tree clean. *The clean-tree state of the dialog is unreachable from the palette (its row is greyed `Nothing to stash`) — covered by the unit test.* |
| 5 browser | pass after **finding AV-1** — opens on `Working tree · 3 changes` (italic) with the form, the mono preview and a 264px-wide `Stash 3 files` in the 280 column; the middle panel is Unstaged (`a.txt`, `new.txt`) over Staged (`dirty.txt`), the diff of `a.txt` at the right with Stage hunk / Discard hunk; Stash → `WIP on main: c172c6d add e` selected, Apply / Pop / Drop… / Clear all…, `Changed files`, the working-tree row `No changes`; ArrowUp → the working tree, `Stash` disabled `No changes`; ArrowDown, Pop → see AV-1. At 700 × 500 the form strip ends at 278 and the list keeps 287–468 |
| 6 dark theme | pass — the walk ran dark; the list border is `--border` (#2b2f38), the working-tree label `--fg-muted` italic |

## Findings

### AV-1 — popping the last stash left the browser with nothing selected

After Pop emptied the list, the working-tree row read `3 changes` but was not selected, the four
buttons stayed (greyed) and the middle panel was an empty `Changed files`. The effect that moves the
preview on once an entry is gone (`StashesDialog.tsx`) returned early on an empty list. Fixed the
same hour: an empty list lands on the working tree, with a test. The first cut of that fix bounced a
push back onto the working tree — the dialog left the tree when the push resolved, before the refs
refresh brought the entry, so the list was still empty — so leaving the tree now happens when the
new entry arrives. Re-walked on a rebuild: Stash → the new entry selected with Apply / Pop / Drop… /
Clear all…; Pop of the only stash → `Working tree · 3 changes` selected, the form back, Unstaged /
Staged lists with the restored files.

## Not walked

- Staging from inside the browser beyond the panels being the commit panel's own (step 5's
  "stage `a.txt` from here"): the same `FilesColumn`, walked in groups AQ / AU.
- Light theme: the new pieces use `--border`, `--fg-muted` and TreeRow's selected tokens only.
