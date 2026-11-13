# Plan: Dependabot #46, the npm group after #43 and #45

_Drafted 2026-11-12 against `main` `387291d3`, before Dependabot's run of that day; #46 filled in after the run. Status:
**done:** #46 merged on 2026-11-13 as `a9416b22`. The walk is `docs/archive/walks/2026-11-13-deps-npm-walk.md`, the
records are in `docs/plans/open-items-done.md` §AW._

**Goal:** merge #46, with the app walked on both VMs where the update changes code it runs, before the next tag
(v0.10.26).

The reading of the packages is in the appendix of `docs/archive/plans/2026-11-11-deps-43-45-plan.md` ("What #44 moves",
read 2026-11-11 from the published packages, up to `react-resizable-panels` 4.21.0, `lucide-react` 1.71.0 and `vite`
8.3.6). This plan does not repeat it; "What moves" below says what each package asks of the walk, and holds what was
read since: `vite` 8.3.7 and `rolldown` 1.2.18 on 2026-11-12, `@vitejs/plugin-react` 6.3.0 and `magic-string` 1.4.5
on 2026-11-13.
The precedent for the steps is #41 and #42 (`docs/archive/plans/2026-11-10-deps-41-42-plan.md`).

## Where it stands

- **#46** (`build(deps): Bump the npm group across 1 directory with 7 updates`), opened by Dependabot's run of
  2026-11-12 12:25 UTC, which closed #44. Head `0df2549c`, one commit on `387291d3` (`origin/main`), mergeable, CI
  green on three OS (tests and `npm run build` on each). It changes `package.json` and `package-lock.json` only.
- **Its seven updates:** `@tanstack/react-virtual` 3.14.25 → 3.14.26, `lucide-react` 1.66.0 → 1.70.0,
  `react-resizable-panels` 4.16.1 → 4.21.0, `zustand` 5.0.16 → 5.1.0, `@vitejs/plugin-react` 6.2.1 → 6.3.0, `vite`
  8.3.5 → 8.3.7, `vitest` 5.0.5 → 5.1.0. Against #44: `react-resizable-panels` and `vite` are newer, and
  `@vitejs/plugin-react` is new.
- **The lock (read 2026-11-12):** 30 entries change version, none is added or removed. Besides the seven:
  `@tanstack/virtual-core` 3.19.11, `rolldown` 1.2.15 → 1.2.18 with its 15 platform bindings, `@vitest/mocker` and
  `@vitest/spy` 5.1.0, `@oxc-project/types` 0.156.0, `postcss` 8.5.32, `magic-string` 1.4.5 and `@types/estree`
  1.0.10. Every one resolves from `registry.npmjs.org`, and its `integrity` and tarball match the registry's (30
  checked, 0 differ). `@tauri-apps/cli` stays 2.12.4, `jsdom` 31.0.0 and `@rolldown/pluginutils` 1.0.1.
- **Dependabot's wait:** it seems to propose a version only once it is about three days old (the config sets no such
  wait). This run fits: it took `vite` 8.3.7 (3.1 days old) and `react-resizable-panels` 4.21.0 (3.6 days), and left
  `lucide-react` 1.71.0 (2.3 days) and `vite` 8.3.8 (1.4 days).
- No Dependabot alert is open (read 2026-11-12).

## What moves

Each line: what the reading found, then what it asks of this plan. Details and evidence are in the appendix named
above.

- **`react-resizable-panels` 4.16.1 → 4.21.0.** 4.17.0 to 4.19.0 and 4.20.0 change only a `Workspace`
  component the app does not use. **4.19.1** reorganises code the app runs, all expected to be invisible: panels
  without an `onResize` handler are no longer watched for size changes; a group is skipped in hit testing unless the
  pointer is within 20 px of it; the end of a drag, the hover state, the keyboard path, one comparison in the drag
  maths and the separator's ARIA updates are restructured. **4.21.0** measures a group's size from the panels' exact
  rendered sizes, which fixes pixel-held panels drifting by a fraction of a pixel at fractional display scaling. Rows
  a1 to a6. An accepted limit's trigger fires again: `open-items.md` §Q asks for smoke row BH 10 on every move of this
  library (row a4).
- **`@tanstack/react-virtual` 3.14.25 → 3.14.26** (`virtual-core` 3.19.11). `scrollToIndex`'s first write uses current
  sizes, not the last render's. Four of the app's five lists have fixed rows, where nothing changes; the diff's one
  call on the changed path needs a combination no user action was found for (not proven that none exists). Rows c and
  d, as regression checks.
- **`lucide-react` 1.66.0 → 1.70.0.** All 65 imported icons draw the same. `CircleAlert` and `TriangleAlert` are now
  aliases of renamed icons, with one more class on their `<svg>`. Row e.
- **`zustand` 5.0.16 → 5.1.0.** Only middleware the app does not import changes. No row.
- **`vite` 8.3.5 → 8.3.7, with `rolldown` 1.2.15 → 1.2.18.** Build only, but the build is what ships. 8.3.6 rewrites
  the main bundle's preload helper on a branch the app does not take (reasoned); 8.3.7 only raises its `rolldown` range
  to `~1.2.18` (read 2026-11-12 from the published packages). `rolldown` 1.2.16's code-splitting fixes can change how
  the six dynamically imported grammar chunks are laid out; 1.2.18 changes nothing in code splitting, minifying or tree
  shaking (read), and 1.2.17 was never published. Nothing tests the bundle at run time. Step 2's build comparison and
  row f.
  - **`rolldown` 1.2.18 has a known regression:** its Linux x64 binary crashes with an illegal instruction on CPUs
    without the BMI2 instruction set (upstream #11607 and #11635); 1.2.19, published 2026-11-11, fixes it. `rolldown`
    is a build tool: the risk is a build that crashes on such a machine, not anything in the shipped app. #46's CI
    ran the tests and the build with this binary on `ubuntu-22.04`, green. D2.
- **`vitest` 5.0.5 → 5.1.0.** Tests only. Two fixes in its module mocking reach the suite's mocks. Step 2's test runs.
- **`@vitejs/plugin-react` 6.2.1 → 6.3.0, read 2026-11-13** from the published packages. One line of code differs,
  inside `reactCompilerPreset()`, which the app's `react()` call with no options never reaches (`vite.config.ts`,
  `vitest.config.ts`). The refresh runtime, the types and the dependencies are byte-identical. No change to the bundle
  or the tests is expected from it. Step 2's build comparison.
- **In the lock only, read 2026-11-13:**
  - `magic-string` 1.4.3 → 1.4.5: only `vitest` and `@vitest/mocker` depend on it, so tests only; `vite` bundles its
    own copy. The mocker uses it to hoist `vi.mock` and `vi.hoisted`, in 37 test files. 1.4.5 makes every edit method
    throw on an index that is out of range or not a whole number; the hoisting passes positions from the parsed code,
    so no new throw is expected (reasoned; its call sites were not traced). A regression would show as a test file
    that fails to load. Step 2's test runs.
  - `@types/estree` 1.0.10: types only (`Program.body`'s type is renamed, the same union). Step 2's `tsc`.
  - `postcss` 8.5.32 and `@oxc-project/types` 0.156.0 came with `vite` and `rolldown`; not read beyond their versions.

## Decisions

Taken under the owner's 2026-10-21 rule (an obvious answer is taken and listed; the owner can overrule any of them):

- **A. One walk tree,** as #41 and #42: a local branch `deps-npm` holding the PR's head on `origin/main` is what the
  gates run on, and its commit is what the VMs walk and what `main` must equal after the merge. It is not pushed
  (the owner, 2026-11-13, after step 2): it turned out to be #46's head itself, a fast-forward with nothing added,
  so the VMs check that commit out by its hash.
- **B. No release dry run.** #46 changes `package.json` and `package-lock.json` only: no workflow, and the Tauri CLI,
  which does the bundling, stays 2.12.4.
- **C. Both VMs.** The full rows on the Windows VM; a short pass on the Linux VM (a build, three separators, the
  grammars, the icons), because the panels' pointer handling and the grammar chunks both run in WebKitGTK too.
- **D. `lucide-react`'s renamed icons stay imported under their old names.** The aliases are not deprecated. Renaming
  the two imports is a code change this update does not need.
- **E. The newer versions the PR does not carry wait for the next Dependabot PR,** as before.
- **F. §AT's `observeVisibleRect` row is not reopened:** `virtual-core` 3.19.11 changes no rect or observer code
  (it changes which stored sizes `getOffsetForIndex` reads). A dated note in the records.

Ruled by the owner, 2026-11-13:

- **D1. `react-resizable-panels` 4.21.0's fractional-scaling change is walked at a real 150 % display scale on the
  Windows VM** (row a6). 4.21.0's change matters where panels have fractional sizes, which upstream ties to display
  scaling such as 150 %; the other rows run at 100 %. Not chosen: an emulated device scale through the Chrome
  DevTools Protocol (CDP; not known to reproduce the fractional sizes), a hand check on the owner's machine (shows
  gross breakage, not a sub-pixel drift), and an accepted gap. **Its limit:** the row is a regression check at that
  scale. It does not show the fix itself: upstream's drift is a fraction of a pixel, and 4.16.1 would likely pass the
  row's one-device-pixel tolerance too (reasoned, not measured). The record keeps every raw reading; a build of
  `main` is measured only if a reading is outside the tolerance.
- **D2. `rolldown` 1.2.18 is taken as #46's lock has it,** with its known crash on Linux x64 CPUs without BMI2. Known:
  #46's CI built with it on `ubuntu-22.04`, the runner the release's Linux leg uses too; the owner's CPU has BMI2.
  Not known: whether the Linux VM passes BMI2 to the guest; step 4 reads it before the build. The failure is a build
  that dies with an illegal instruction, not a wrong bundle (reasoned). If the VM lacks BMI2, or a build dies that
  way, the plan stops and goes to the owner. Not chosen: a commit on Dependabot's branch moving the lock to 1.2.19
  (1.5 days old at the run), and waiting for the next Dependabot PR.
- **D3. The walk helpers this walk uses come into the repository** (ruled after review pass 1). `open-items.md` §AW
  has a deferred row, "The walk helpers live only in the VMs' scratchpads", whose trigger is the next walk that
  needs the recorder; rows c and d need it, and row d's range pick may need the driver's `--sclick`. The recorder
  and every addition of the `cdp.mjs` copy (`--sclick`, `--dragtest`, `--fling`, the exact-title match, Backspace
  among its keys) are committed after the walk, as they ran (step 7). The Windows picker driver, which this walk
  does not run, stays deferred.
  Not known: whether the helpers still exist on the Windows VM. If its scratchpad was wiped, they are rewritten
  for this walk, the record says so, and row c's "same numbers" are then read by a different recorder. Not chosen:
  all three now, and deferring again.

## Steps

CLAUDE.md's workflow applies: execution starts only on the owner's go, after the review loop. Every push, merge and
branch delete is asked for at that moment. This plan is committed on local `main` when its review loop ends.

1. **Head check.** #46 is open at `0df2549c` and not superseded. Again before the VMs fetch it (step 3) and before
   the merge. If Dependabot has pushed, closed or recreated it, stop and ask.
2. **The walk tree and its local gates.** One worktree under `.claude/worktrees`, on a local branch `deps-npm` that
   starts at `origin/main`. Uppercase `F:/`. A gate that fails stops the plan and goes to the owner; no test is
   re-run silently, and a failure of one of the focus tests in §Q's `jsdom` 31 row fires that row's trigger.
   - **the baseline build, before the merge:** `npm ci`, then `npx vite build --manifest`, and `dist` copied to the
     scratchpad. Both sides of the comparison are built in this one tree, so the path is the same;
   - #46's head merged into `deps-npm`; `npm ci`; `npm ls` for the seven packages and `rolldown`; `npx tauri
     --version` = 2.12.4;
   - `npx tsc --noEmit`; `npm test -- --run` three times, the counts recorded; `npm run build`;
   - **the build comparison:** `npx vite build --manifest` again, and `dist` copied beside the baseline. A small
     script outside the repository lists, with the hashes in file names masked: every file in `dist/assets` with its
     size; every manifest row with its entry and dynamic flags, its imports, its dynamic imports and its CSS; and
     `index.html`'s `<script>`, `<link>` and `<style>` tags. The two listings are diffed, the hash-masked `index.html`
     files are diffed, and both bundles are searched for `rolldown`'s generated error stubs ("externalized for browser
     compatibility", "Could not resolve"). **Expected:** the same names, and a small size change in the entry chunk.
     **It stops the plan and goes to the owner** if a grammar's row loses its dynamic flag or lands in the entry
     chunk, the entry's dynamic list loses a grammar, a grammar chunk imports a chunk it did not before, the count
     of script chunks changes by more than two, the count of CSS files changes at all, the entry grows by over 10 kB,
     `index.html` gains a preload of a grammar chunk or its inline style or script differs at all, or the stub search
     matches on one side only. Any other difference from the expected is recorded and goes to step 5's triage;
   - `cargo fmt --all --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, `cargo test
     --workspace --locked` (no Rust changes; the precedent's full gate before a VM build);
   - `npm run tauri -- build --no-bundle` with every copy of the app closed; the exe launched once; `dumpbin
     /dependents` lists no `VCRUNTIME140.dll`.
3. **The VMs' tree — no push** (decision A). Each VM runs `git fetch origin pull/46/head` and checks out
   `0df2549c138e1d506af7f93279a25bda4a3ea4b6`, and `git rev-parse HEAD` reads that hash before its build. Nothing
   merges before the walks and their triage.
4. **The walks** on that commit, built on each VM with `npm ci`, `npx tauri --version` = 2.12.4 and `npm run tauri --
   build --no-bundle` (Windows) or the `.smoke` debug build (Linux), `CARGO_BUILD_JOBS=1`. Driving as in
   `docs/archive/walks/2026-11-11-deps-41-42-walk.md`: CDP at 1280×800 on the Windows VM with the store folder backed
   up first; WebDriver under Xvfb and openbox in a private `dbus-run-session` on the Linux VM. "The recorder" is that
   walk's per-frame probe for blank rows, gaps and overlaps in a virtualized list; "the console hook" is its page
   script that collects `console.error` calls and uncaught errors. The record goes to
   `docs/archive/walks/2026-11-1x-deps-npm-walk.md`, committed in step 8's records commit.
   - **Fixtures,** Windows, all under `C:\tmp\t4bn`, deleted after:
     - `powershell -File docs/smoke/fixtures/smoke-fixtures.ps1 -Root C:/tmp/t4bn` (Windows PowerShell 5.1; the VM
       has no `pwsh`) → `work`, `other`;
     - in Git Bash, `T4_ROOT=/c/tmp/t4bn sh docs/smoke/fixtures/bv-fixture.sh` → `bv`, then `cp -r /c/tmp/t4bn/bv
       /c/tmp/t4bn/bx` (`a.txt`, the long file, unstaged in `bx`);
     - `node docs/smoke/fixtures/perf-repo.mjs C:/tmp/t4bn/by-big --commits 1500 --branches 5 --files 100` →
       `by-big`, plus one unstaged edit; its `maint` branch (commit 10) is row c's far-down target;
     - `hl`, by hand: `git init`, one file of a few lines for each of the six grammars the app imports on demand
       (`src/lib/highlight.ts:37-47`): `a.ts`, `a.rs`, `a.css`, `a.json`, `a.html` and `a.py`; committed, then one
       line changed in each, so each has an unstaged diff.
   - Linux, under `/tmp/t4bn`, deleted after: `T4_ROOT=/tmp/t4bn bash docs/smoke/fixtures/smoke-fixtures.sh` →
     `work`, `other`; and `hl` as above.
   - **Windows VM:**
     - **a1. Every separator follows the pointer.** Each separator dragged by three distances and its centre and
       `aria-valuenow` read after each: it moved by the pointer's distance within a pixel, short of the panels'
       limits. The separators, as on 2026-11-11: at 1280 in History with a commit selected, *Resize sidebar*, *Resize
       details*, *Resize commit details*, *Resize side column*; at 1400, also *Resize file list*; in Changes, *Resize
       file lists* and *Resize commit message*; *Resize output* with the dock open; the Stashes dialog's two.
     - **a2. A separator can be grabbed at its edges, and shows its hover.** On *Resize sidebar*, *Resize details*
       and *Resize output* (the dock open; closed, its separator is disabled). A grab that fails is repeated on a
       build of `main` before it is called a finding: a press outside the box lands on the neighbouring panel's
       content. A press 1 px inside each edge of the separator's 5 px box, and a press 2 px outside each
       edge (the library widens a mouse's target to 10 px): each starts a drag and the separator follows. With the
       pointer resting on the separator, the computed `cursor` of the element under it is a resize cursor (the
       library sets it from its hover state); it is not once the pointer has left. This is 4.19.1's hit-testing and
       hover rework, as a regression check: its new 20 px pre-check is wider than any of the app's separators reach
       (reasoned).
     - **a3. The keyboard.** A separator focused: the arrows move it, Home and End take it to its limits, and
       `aria-valuenow` follows. Enter on *Resize output* changes nothing, on this build as on `main`: the library's
       Enter toggles only the panel before a separator, and the app's one collapsible panel, the dock, comes after
       its separator (read in 4.16.1 and 4.21.0).
     - **a4. BH 10 as written** (`docs/smoke/smoke-test-post-v1.md`, group BH, item 10): the per-view sidebar toggle,
       a dragged width kept across a view switch, a new window at the default width.
     - **a5. The dock, as a regression check,** the steps of 2026-10-31: dragged to 300, `` Ctrl+` `` twice → 300
       again; the separator's double-click → 200; the window squeezed and grown → the dock back at its last height;
       *Resize file list* double-clicked in the three-column tier → 320.
     - **a6. Pixel-held panels at 150 % display scaling (D1).** Run last on this VM. First the VM's screen size is
       read, in physical pixels. The display scale then goes to 150 %: by script from the VM's session if one works
       without a sign-out, else the owner changes it in Settings › Display. **Stop and ask** if the scale cannot be
       set (a remote session can own it), or if the screen cannot hold a window whose `innerWidth` is at least 1160
       at that scale. The app restarted; `devicePixelRatio` reads 1.5. In History with a commit selected and the dock
       open, the sizes of the panels that hold their pixel size are read with `getBoundingClientRect()`, unrounded:
       the sidebar's width (`RepoWindow.tsx:217`), the details panel's height (`:160`), the dock's height (`:336`),
       and the details' side column: its width (`DetailsPane.tsx:80`) and its upper panel's height (`:82`; that
       reading counts only while the panel is off its 80 px minimum, which a short screen may not allow). The
       window is then taken through five sizes and back to the first with `cdp.mjs --inner`, which works in whole CSS
       pixels, the same panels read after each with the root element's unrounded size. With W×H the base (the
       widest and tallest that fit, up to 1280×800): W×H, (W−1)×(H−1), (W−2)×(H−2), (W−151)×H, (W−75)×(H−1), W×H.
       At 1.5 an odd CSS size is a half physical pixel, which the window cannot have, so the root's real size is
       fractional there (reasoned). If `--inner` cannot land on a size at this scale, the size it reaches is used
       and recorded. Every size keeps `innerWidth` from 1000 to 1339, so the layout stays in one tier
       (`layout.ts:6-12`): a tier switch mounts the details' panels afresh at their defaults, and under 1000 the
       sidebar becomes the rail; either would hide a drift. **Expected:** at least one size gives the
       root a fractional width or height (if none does, the row has not met its case and says so); each panel stays
       within one device pixel (0.67 px) of its first reading at every size where its limits allow it, and reads the
       same at the end as at the start. Every raw reading goes into the record. Then a1 on *Resize sidebar*, *Resize
       details* and *Resize output* at this scale. A reading outside the tolerance is repeated on a build of `main`
       before it is called a finding. The scale is set back to 100 % and `devicePixelRatio` reads 1.
     - **c. The diff's reload anchor and the grid's instant scrolls,** row c of the 2026-11-11 walk re-run as written
       there. Expected: the same numbers (the grid at 7800, 38416, 38650 and 0; the diff's rows as recorded), 0 blank.
       Before row d, which changes `bx`.
     - **d. The diff cursor's scrolls.** In `bx`, `a.txt` open in the Changes view and the focus moved into the diff:
       the recorder sees 0 blank, gap and overlap throughout, and `scrollTop` is read after each key against the
       rows' positions. A row's start is the summed height of the rows above it (hunk rows 24 px, line rows 20 px,
       `DiffViewer/diffRows.ts:5-6`), its end the start plus its own height; the view's height is the scroller's
       `clientHeight` at that moment. Expected, from `DiffViewer.tsx:519-534` and `:556-578`:
       - **↓ held past the bottom edge:** each key that scrolls leaves `scrollTop` = the cursor row's end − the
         view's height (the row flush at the bottom);
       - **↑ held past the top edge:** each key that scrolls leaves `scrollTop` = the start of the cursor's hunk
         header row when the span from that header to the cursor row's end fits the view, else the cursor row's
         start;
       - **a range of lines picked with the cursor on the bottom edge:** the selection bar shows, the view's height
         shrinks by it, and `scrollTop` = the cursor row's end − the new view's height;
       - **some lines staged, the view scrolled away from the cursor, then ↓:** the cursor row lies wholly inside the
         view afterwards (the first key after a reload first brings the old cursor row in, then moves the cursor).
     - **e. The icons.** Every toolbar, sidebar and context-menu icon drawn, as on 2026-11-11. Then the two renamed
       ones looked at where they show: an error toast (a Fetch from `work`'s `nowhere` remote, a path that does not
       exist, through the sidebar's remote menu), the dirty mark in the status bar, and a repository banner (`git -C
       C:/tmp/t4bn/work checkout --detach`; it shows while no merge or rebase is in progress); each `<svg>` carries
       both the old and the new class. The commit message column's warning shows only without an author identity,
       which the Windows VM has; it is looked at on the Linux VM, whose scratch `HOME` has none.
     - **f. Every grammar loads in the built app.** In `hl`, the diff of each file opened in turn: its text is
       coloured (spans with highlight classes inside the lines), and the console hook and the app log hold no failed
       import or chunk error.
     - Carry `document.title` in each measurement; the console hook and the app log read at the end: 0 errors.
   - **Linux VM:**
     - **before the build (D2):** `grep -c bmi2 /proc/cpuinfo` is above 0. At 0, stop and ask;
     - `npm ls` shows the seven packages and `rolldown` at #46's versions;
     - **a1 on three separators** (*Resize sidebar*, *Resize details*, *Resize output* with the dock open) and
       **a2**'s presses on the sidebar's, through WebDriver actions (the cursor check is on the Windows VM only);
     - **f** in full, and **e**'s glance, with the commit message column's warning (no author identity in the
       scratch `HOME`);
     - stderr: 0 ERROR and 0 WARN from `t4-git-ui`.
5. **Triage** of the walks' findings with the owner (CLAUDE.md step 6), one item at a time, before anything merges. A
   "fix it" ruling: the fix is a commit on #46's branch (it is squashed into #46's merge, as #42's fix was);
   `deps-npm` rebuilt on it and step 2's gates re-run; a change review until a pass finds nothing; on the owner's
   go, the PR branch pushed; the VMs fetch the new head, the affected rows are re-walked, and step 1's expected head
   is updated.
6. **Merge, on the owner's go:** `gh pr merge 46 --squash --admin --match-head-commit <head>`, the head being the one
   step 1 confirmed: `0df2549c138e1d506af7f93279a25bda4a3ea4b6`, unless step 5 added a fix. Subject `build(deps):
   Bump the npm group with 7 updates (#46)`; an explicit empty body, or, if step 5 added a fix, one body line for
   it.
   - A transient refusal ("Base branch was modified") is retried after a few seconds; a head mismatch stops and goes
     to the owner.
   - Then `git fetch`; `git diff --quiet deps-npm origin/main` exits 0 (the walked tree landed); `main`'s CI green on
     three OS. A failure of either known flaky Rust test (`ignored_dir_and_lock_files_are_silent`,
     `cancel_ends_an_op_with_a_full_queue`) or of one of the focus tests in §Q's `jsdom` 31 row is not re-run
     silently; it goes to the owner.
   - Any PR Dependabot opens after the merge is read, not merged, and goes to the owner.
   - The Dependabot branch, if GitHub leaves it, is deleted after a PR lookup shows it backs no open PR, on the
     owner's go. The local branch `deps-npm` and its worktree are removed.
7. **The helpers' commit (D3),** on local `main`, after the walk and independent of the merge. The Windows VM's
   session hands over the recorder and its `cdp.mjs` copy as text, each checked by a SHA-256 read on both sides.
   The copy's additions go into `docs/smoke/cdp.mjs`, the recorder into `docs/smoke/recorder.js`, and `smoke-cdp.md`
   gets a short section on both: what each does, how the walk calls it, and what the recorder counts. `node
   --check` passes on both scripts. A change review (CLAUDE.md step 5) until a pass finds nothing. Subject: `docs:
   the walk's frame recorder and driver options join the smoke helpers`. Nothing here changes the app, and CI does
   not run on `docs/`.
8. **Records,** pushed on the owner's go, after rebasing local `main` (this plan's commits) onto the new
   `origin/main`:
   - `open-items-done.md` §AW: a dated sub-section, *Added 2026-11-1x — Dependabot #46, closed*, with the merge hash,
     the gates, the build comparison's result, the walk record, the CI runs and D1's limit; and CI run 43086689472
     added to the #43 and #45 block (the run on its records' push, green on three OS);
   - `open-items.md`: §AW's #44 row moved to the done file (#44 was replaced by #46), and §AW's intro, which names
     that row, brought in line; §AW's walk-helpers row cut down to the Windows picker driver, with its trigger (the
     next walk that needs a Windows picker), and what came into the repository noted in the done file; a dated note
     on §Q's BH 10 row and on §AT's `observeVisibleRect` row; anything the triage defers or accepts;
   - `docs/smoke/smoke-test-post-v1.md`: BH 10's dated note for this walk;
   - the plan archived; packaging as CLAUDE.md step 7 (the plan's commit, the helpers' commit, the records' commit;
     any review fix squashed into its commit after a rehearsal in a throwaway worktree).

## Not in this plan

- The release itself (v0.10.26) and its update walk: the release skill, on the owner's request.
- A release dry run (B). A macOS walk: there is no Mac.
- Row b of the 2026-11-11 walk (a list shrinking at its bottom): it targeted `virtual-core` 3.19.10's change, and the
  reading calls its re-run optional.
- Renaming the two icon imports (D). Versions newer than the PR's (E).
- Using `Workspace` or any new API of the moved libraries.

## Review record

- **D1 and D2 ruled by the owner, 2026-11-13,** after #46 was read and before pass 1: the scaling change is walked
  at a real 150 % on the Windows VM; `rolldown` 1.2.18 is taken as the lock has it.
- **Pass 1 (2026-11-13), 18 findings, 17 taken and one ruled:**
  - **Row a6 would have hidden a drift:** its 1401 width crossed the 1340 breakpoint, which mounts the details'
    panels afresh at their defaults, on the way out and on the way back. Every size now stays in one tier. The row
    also reads the VM's screen size first and stops if 150 % cannot be set or the window does not fit; and D1 now
    states its limit (a regression check, not a showing of the fix; no routine baseline on `main`).
  - **Row a3 expected Enter to collapse the dock.** The library's Enter acts only on the panel before a separator,
    in 4.16.1 and in 4.21.0; the row expects no change.
  - **The deferred walk-helpers row's trigger fires** and the plan did not say so: put to the owner, **D3 ruled**
    (the recorder and the driver's additions come in; the picker driver stays deferred). Step 7 is new; the records
    moved to step 8.
  - Row e's message-column warning cannot show on the Windows VM (it needs no author identity): a banner there, the
    warning on the Linux VM.
  - The build comparison: both sides built in one tree (the same path), any change in the CSS file count stops, the
    entry's growth has a number, and a difference that trips no stop goes to triage.
  - Failure paths added: a failing local gate, the "fix it" path, a refused merge and a head mismatch, a PR opened
    after the merge, the rebase before the records push.
  - The fixture commands written out (`T4_ROOT`, `powershell`, `hl`); Linux reads versions from `npm ls`, not from
    a build log; row c runs before row d, which changes `bx`, and row d's `scrollTop` has its formula.
  - Decision F's wording follows the reading (no rect or observer code changes). Row a2 says inside and outside
    the box and gains a hover check. Smaller: a line citation, the records' details, row b named as not re-run, the
    merge command's full hash, CDP and "the console hook" spelled out.
- **Pass 2 (2026-11-13), 9 findings, all taken;** pass 1's other fixes were checked against the code and stand:
  - **Row d's `scrollTop` formula, added in pass 1, was wrong** for ↑ (the view goes to the hunk's header row when
    the hunk fits) and for the ↓ after staging (the first key brings the old cursor row in first). The row now
    states each case from `DiffViewer.tsx`, with the view's height read at that moment.
  - **Row a6's floor broke its own rule:** a base of 1100 less 150 is under 1000, where the sidebar becomes the
    rail. The floor is 1160, and the sizes are whole CSS pixels through `cdp.mjs --inner`, which is the tool the
    walk has; "one physical pixel" had no method. The side column's upper panel is read too.
  - The merge command takes the head step 1 confirmed, and a body line if step 5 added a fix. Row a2: a failed
    grab is repeated on `main` before it is a finding; the dock is open; Linux runs only its presses. Row e's
    commands. Step 7 names the recorder's file and the copy's Backspace key.
  - The reviewer on the choice not to measure a `main` build in row a6 as routine: conservative, not wrong.
- **Pass 3 (2026-11-13): no must-fix or should-fix finding; three optional ones, all taken.** Row a6's reading of
  the side column's upper panel counts only off its minimum; row e's error toast comes from the fixture's
  `nowhere` remote, not from renaming `bare.git`; a paragraph rewrapped.
- **Pass 4 (2026-11-13): no findings.** The three edits checked against the code.
- **The owner's go, 2026-11-13.** Steps 1 and 2 run the same day: every gate green (84 test files and 1291 tests,
  three runs, 0 failed).
- **The build comparison's result, with two differences for step 5's triage.** As expected: the same 13 files by
  name, one CSS file of the same size, and the entry chunk 706991 → 708283 bytes (+1292); every grammar still
  loaded on demand; `index.html` identical but for the hashes; no error stub. Outside the expected, tripping no stop
  condition:
  - **every grammar chunk grew by 5 to 15 bytes** (css 17171 → 17176, html 12824 → 12839, javascript 77803 → 77808,
    json 1690 → 1695, python 37863 → 37878, rust 83134 → 83144);
  - **each grammar's import list has its two chunks in the other order** (the entry then the shared chunk, now the
    shared chunk then the entry).
  - What is known: in the json chunk the two builds differ only in the order of the two import statements and their
    minified local names (measured, the files compared); the shared chunk itself imports the entry on both sides
    (measured, its manifest row). So the entry still runs first and the order changes nothing at run time
    (reasoned); row f loads every grammar in the built app.
- **Two rulings after step 2, 2026-11-13:**
  - **A stop condition of the build comparison was misworded.** "A grammar chunk imports the entry chunk" holds on
    `main`'s build as on #46's: each grammar chunk imports two names from the entry, where the shared highlight code
    lives. It is the build's layout, not a change. The owner: continue. The condition now reads "imports a chunk it
    did not before".
  - **The walk tree is not pushed.** `deps-npm` is #46's head itself, which GitHub has; the VMs check it out by
    hash. Decision A, steps 3, 5 and 6 changed; the departure from CLAUDE.md's packaging order that step 3 stated
    is gone with the push.
- **Pass 5 (2026-11-13), on those changes: one finding, taken.** The comparison's two differences outside the
  expected were not listed for triage; the entry above lists them. **Pass 6: no findings.**
- **Steps 3 and 4, 2026-11-13.** Both VMs fetched `pull/46/head`, checked out `0df2549c` and walked it
  (`docs/archive/walks/2026-11-13-deps-npm-walk.md`). Every row passed on #46 but for two cases:
  - **row d's fourth case, after a long scroll:** the cursor row unmounts, the focus falls to `<body>` and ↓ scrolls
    the pane 40 px. That is what the open row of 2026-10-30 in `open-items.md` §AT describes, measured then on
    0.10.24; it was not repeated on a build of `main`, so that it is older than #46 is reasoned. **The row's
    expectation was this plan's miss:** it asked for the cursor back in view after any scroll, and passes 1 to 6
    did not hold it against that row. The near case passed; that it is the one the update could touch is reasoned;
  - **a2 on Linux, one press of four with the dock open:** 2 px left of *Resize sidebar* it lands on the sidebar's
    scrollbar. Repeated on a build of `main`, as row a2 said a failed grab would be: the same miss.
- **Asked of the VMs beyond the rows,** the same day, each a measurement the triage needed:
  - a double-click on *Resize details* had read 69.125 % in passing: 60 % in five states on #46 and on `main`, and
    the 69.125 was the dock's resize after it;
  - End on *Resize output* collapsed the dock and dropped the focus: the same on `main`;
  - row d's "else the cursor row's start" branch, which no hunk of `bx` could reach: passed on a fixture with one
    hunk of 241 rows (20 scrolling presses, 0 mismatches).
- **Row a6's second limit.** WebView2 reported the root only in whole CSS pixels, so the row's "at least one size
  gives the root a fractional width or height" could not be read; the sizes were applied in physical pixels, since
  `cdp.mjs --inner` does not size the native window at 150 %. The VM set the scale by script, without elevation.
- **Step 5, the triage (the owner, 2026-11-13):**
  - the Linux press beside the scrollbar: accepted, `open-items.md` §Q;
  - End on the dock's resize bar: fix it. It is not #46's, so the fix is not a commit on #46's branch, as this step
    wrote for a finding of the update; it gets its own plan after the merge, as the question to the owner said;
  - taken under the owner's 2026-10-21 rule and listed to the owner: a dated note on the far case's row; the
    double-click as no finding; the build comparison's two differences, a pinned separator's reading (50.824 on #46,
    50.955 on `main`) and row a6's second limit as records only.
- **Step 6, on the owner's go, 2026-11-13:** merged as `a9416b22` with the head pinned, the subject as planned and an
  empty body. `origin/main` equalled the walked tree. GitHub removed Dependabot's branch on its own, so there was no
  branch to ask about; no other PR was open. The local branch `deps-npm` and its worktree were removed. `main`'s CI,
  run 43385685662: success on three OS on its first attempt.
- **Step 7, 2026-11-13: the helpers' commit and its change review.** The recorder and the `cdp.mjs` copy arrived as
  text; their SHA-256 values matched the VM's, and the copy differed from the repository's file by additions and one
  changed line.
  - Pass 1: 6 defects and 8 points on the doc. Taken: `--fling` takes an earlier run's listeners off and prints null
    for what it could not measure; `--edgegrab`'s hover read no longer throws with nothing under the point; the
    recorder stops an earlier run; the doc block says what the code does.
  - Pass 2, with the records: one defect the fixes brought (a missing selector left touch emulation on), taken, and
    wording. Pass 3: clean.
  - The fixes were checked against fakes with a script, and not run in the app.
  - **Not taken, listed to the owner:** a `try/finally` around touch emulation (a step that throws later leaves it
    on until the session detaches; reasoned harmless); renaming `jumps`; the unused `off` values in `--edgegrab`'s
    press list; the `CDP_TITLE` comment; false lists or false blanks the recorder's selector could give, reasoned
    only.
- **Step 8, 2026-11-13: the records, reviewed with the helper fixes.** Pass 1: 3 defects (the Linux VM's last
  checkout; row d's far case written as a pass and as measured not to be #46's; a comparison with Windows that was
  not read) and 11 wording points, all taken. Pass 2: 5 wording points, taken. Pass 3: clean.

