# Error toasts that do not name their repository, and the Files tab header's hover title

Status: T1 and T2 ruled 2026-11-11; final after review pass 4. Nothing here is executed without the owner's go. It works
on `docs/plans/open-items.md` §AV's row "Some error toasts still do not name their repository, and the Files tab header
has no hover title" (the owner, 2026-11-10: after the #41 and #42 plan).

## Where it stands

- **What the user sees.** An error toast stays until it is dismissed, and the toast stack belongs to the window, not to
  a tab. With several repositories open as tabs, a toast that says only "Couldn't load branches" can be read against the
  tab that is active now, not the one it came from. The 2026-10-31 fix (`445a898f`) put the repository's name in front
  of the title (`<name>: <title>`) for the op runner's errors and for four other toasts; the row lists what it left.
- **The Files tab's header** shows the file's path, cut with an ellipsis when the panel is narrow, and has no hover
  title to read the whole path from. The diff header got one in `748b00c7` (`DiffViewer.tsx:295`, `title={shownPath}`).
- Nothing has been seen going wrong: both halves were read from the code in a change review.

## What the code has (read 2026-11-11)

- **The naming pattern,** inline at each site: `` `${repo.name}: Couldn't check ${remote} for tags` ``
  (`src/store/repoStore.ts:461`), the same in `actions.ts:383`, `statusStore.ts:239` and `commitStore.ts:355-360`, and a
  local `named()` in `opsStore.ts:249`.
- **The rule `445a898f` applied** is wider than "the failure can land after a tab switch". It named the op runner's
  errors and the stage, unstage, discard and resolve failures, which answer a click, and during which a tab switch is
  refused (`actions.ts:278-284`, `tabsStore.ts:205`). The reason in its comments: the toast stays until dismissed, and
  the stack is the window's.
- **Nine repository-scoped error toasts are still unnamed.** Two ways a toast can be read against the wrong tab: it
  **lands late** (the failure arrives after the user switched tabs), or it **stays** (it appeared over the right tab and
  is read after a later switch). Every one of the nine can stay.
  - **The row's three:**
    - `src/store/repoStore.ts:404`, "Couldn't load branches": the references' first load when a repository opens,
      started after the grid's first page. Can land late.
    - `src/screens/RepoWindow/CommitPanel/CommitPanel.tsx:203`, "Couldn't restore the conflict": after a confirm box and
      a backend call. Can land late.
    - `CommitPanel.tsx:219`, "Couldn't open the merge editor": after a backend call that writes three files and starts
      the editor. Can land late.
  - **Four more that follow a backend call or a native dialog,** so they can land late too:
    - `actions.ts:179`, "Couldn't open the diff tool" (the same shape as the merge editor's);
    - `ChangedFileList/FileRowMenu.tsx:51` and `CommitPanel/FileContextMenu.tsx:81`, "Couldn't open the file" /
      "Couldn't reveal the file";
    - `FileRowMenu.tsx:68`, "Couldn't save the file" (after the save dialog and the write).
  - **Two that are dropped when their repository is no longer the active one,** so they can only stay:
    - `repoStore.ts:345`, "Couldn't load history" (the guard is at `:339`);
    - `RevisionGrid/RevisionGrid.tsx:369`, "Couldn't compare … with …" (the guard is on the same line).
- **Not repository-scoped,** so not candidates: open or init a repository, quit, new window, move a tab, Settings,
  "Copy failed" (`actions.ts:258`), "Your last session wasn't reopened" (`App.tsx:58`).
- **About a repository, but with no other tab to be read against:** "Couldn't close the repository"
  (`tabsStore.ts:229`) is shown only when the window's last tab closes (`:222`). It stays as it is.
- **"Couldn't load branches" needs its name taken at the right moment.** `openRepo` awaits the grid's first page and
  only then calls `refreshRefs` (`repoStore.ts:401-404`), which reads whichever repository is active by then (`:428`); a
  tab switch during that wait is possible (`tabsStore.ts:192-194`). So the name is read at the call, as `refreshAll`
  does (`actions.ts:379-383`), not from the repository `openRepo` opened.
- **Tests that pin the titles:** `src/store/repoStore.test.ts:533`, `:742` and `:1018` ("Couldn't load history",
  "Couldn't load branches"); `RevisionGrid.test.tsx:581` ("Couldn't compare"). No test covers the other six titles.
  `CommitPanel.test.tsx`'s backend mock has `recreateConflict` but no `openMergeEditor` (`:20-46`, `:77-90`).
- **`src/README.md:82`** quotes "Couldn't load branches" in its description of `openRepo`; `:87` already shows the named
  form of the tags toast.
- **The Files tab header:** `src/screens/RepoWindow/DiffViewer/FileContent.tsx:115`, `<span
  className={s.path}>{path}</span>`. The ellipsis comes from `PanelHeader`'s title (`PanelHeader.module.css:19-25`), as
  in the diff header, so a `title` on the span behaves the same.
- A long title is not cut: toast titles wrap (`Toast.module.css:48-51`).

## Decisions

- **T1. How far the naming goes: (a), all nine. Ruled by the owner, 2026-11-11.**
  - **(a) All nine.** One rule, the one `445a898f` applied: every repository-scoped error toast names its
    repository. No unnamed site is left to find again. Cost: nine one-line edits against three, and a longer title on
    six toasts that appear over the tab that caused them.
  - Not taken: (b) The row's three only. The smallest change. Six stay unnamed: four can land late just as the three
    can, and two can only stay.
  - Not taken: (c) The seven that can land late: the row's three and the four that follow a backend call or a dialog.
    "Couldn't load history" and "Couldn't compare" stay unnamed, read wrongly only after a later switch.
- **T2. The first references load skips a "not open" error: (a), in this change. Ruled by the owner, 2026-11-11.** A
  tab closed while its branches are still loading makes that load fail with "repository not open", and the app then
  shows "Couldn't load branches" for a tab that is gone. `refreshAll` skips exactly that error (`actions.ts:383`); the
  first load does not (`repoStore.ts:404`). Read from the code, not seen. One condition on the line this plan already
  edits. Not taken: (b) a deferred row.
- Taken under the owner's 2026-10-21 rule:
  - **The name goes inline at each site,** as the existing sites do. No shared helper: `` `${repo.name}: ` `` is shorter
    than a call to one.
  - **"Couldn't load branches" takes its name at the call** (above), with no change to when `openRepo` loads them. Not
    taken: skipping the references' load when the tab has changed, a behaviour change that naming does not need.
  - **The Files tab header gets `title={path}`** on the path's span, as the diff header has.
  - **No smoke row.** The change is a string prefix, one condition and an attribute; unit tests cover all three, and
    the 2026-10-31 walk covered how a named toast looks.

## Steps

1. **The toasts.** Prefix the repository's name at each site:
   - `repoStore.ts:404`: the name of `get().repo` read at the call to `refreshRefs`; and no toast when the error's kind
     is `notOpen` (T2), as `actions.ts:383` has it;
   - `repoStore.ts:345`, `CommitPanel.tsx:203` and `:219`, `actions.ts:179`, `RevisionGrid.tsx:369`: `repo.name`, from
     the `repo` each already reads before its wait;
   - `FileRowMenu.tsx:51` and `:68`, `FileContextMenu.tsx:81`: these hold only the repository's id, so the name is read
     from the repo store at the click, before the wait.
   - Tests first, failing before the change:
     - the four pinned assertions expect the named title (`repoStore.test.ts:533`, `:742`, `:1018`;
       `RevisionGrid.test.tsx:581`);
     - `repoStore.test.ts`: one new test beside `:742`, the references' load rejected with a `notOpen` error → no
       toast (T2);
     - `CommitPanel.test.tsx`: two new tests, one per toast (the backend call rejected → an error toast titled `<name>:
       …`); the mock gains `openMergeEditor`;
     - the diff tool (`actions.ts:179`): one new test in `CommitPanel.test.tsx`, which mocks `openDiffTool` (`:42`) and
       drives it through the button (`:369`);
     - reveal from the commit panel's menu (`FileContextMenu.tsx:81`): one new test in `CommitPanel.test.tsx`, which
       mocks `openPath` (`:41`) and drives Reveal (`:1115`);
     - open and save from a file row's menu (`FileRowMenu.tsx:51`, `:68`): two new tests in
       `ChangedFileList.test.tsx`, which mocks `openPath`, `saveFileAs`, `save` and `downloadDir` (`:18-29`) and
       drives both items (`:265`, `:270`). That file sets no repository in the repo store, so the two tests set one;
       without it the title would read "undefined: …".
   - `src/README.md:82`: the quoted title gets the `<repo>:` form.
2. **The hover title.** `title={path}` on the span at `FileContent.tsx:115`.
   - Test first: in `FileContent.test.tsx`, the header's path element carries the path as its title.
3. **Gates:** `npx tsc --noEmit`, `npm test -- --run` (uppercase `F:/`), `npm run build`. No Rust changes.
4. **Commit,** locally, one commit with three topics:
   - summary `fix: clearer repository error toasts; Files tab path shows on hover` (67 characters), which covers the
     naming and the skipped stray toast alike;
   - body, a blank line between each: `Nine more error toasts start with their repository's name.`, `Closing a tab
     while its branches load no longer shows an error.` and `The Files tab header shows the whole path on hover.`
5. **Change review** (CLAUDE.md step 5) until a pass finds nothing; the triage with the owner.
6. **Records,** then the push on the owner's go: the §AV row moved to `open-items-done.md` as fixed, with the commit;
   this plan archived.

## Not in this plan

- A walk on the VMs (taken above).
- Rewording any toast.
- Toasts that are not about a repository.

## Review record

- **Pass 1 (2026-11-11), 7 findings, all taken:**
  - "Couldn't load history" is dropped when its repository is no longer active (`repoStore.ts:339`), so it is not the
    same case as "Couldn't load branches"; T1 was put on a wrong reason.
  - The split "follows a wait" against "answers a click at once" did not hold: the diff tool, open, reveal and save
    await the backend or a dialog too. And `445a898f`'s rule was wider than the plan said. T1 restated on both, with the
    nine sites in three groups; the recommendation moved from four sites to all nine.
  - "Couldn't load branches" could carry the wrong name after a tab switch during the open; the name is now read at the
    call.
  - `src/README.md:82` added to step 1. `openMergeEditor` missing from the test mock, added to step 1.
  - The commit summary said "the last unnamed" (untrue under the old (a)) and had one body line for two topics;
    rewritten.
  - "Copy failed" and "Your last session wasn't reopened" added to the list that is not repository-scoped.
- **T1 ruled (a) by the owner, 2026-11-11,** after pass 1.
- **Pass 2 (2026-11-11), 2 findings, both taken:**
  - The five new tests can be named now: `CommitPanel.test.tsx` for the diff tool and Reveal, `ChangedFileList.test.tsx`
    for a file row's open and save, with a repository set in the repo store. The fallback clause is gone.
  - The commit summary was 74 characters and its body said "every error toast about a repository", which "Couldn't
    close the repository" contradicts; both rewritten, and that toast now has its own line with the reason it stays.
  - Noted, taken: "resolve" added to what `445a898f` named. Noted, not taken: looking the name up in the tabs store by
    id for the two file menus (the active repository at the click is the menu's repository in every path read).
  - Noted, put to the owner as T2: the first references load reports a "not open" error that `refreshAll` skips.
- **T2 ruled (a) by the owner, 2026-11-11,** after pass 2: the skip, its test and a third body line added.
- **Pass 3 (2026-11-11), 2 findings, both taken:** two phrases T2 had made stale ("no change to what `openRepo` does",
  "a string prefix and an attribute"); and the commit summary did not cover the third topic, so it now reads "clearer
  repository error toasts".
- **Pass 4 (2026-11-11):** no findings. The plan is final; steps await the owner's go.
