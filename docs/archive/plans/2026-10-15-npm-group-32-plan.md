# Plan: Dependabot #32 (the npm group) and the CLI pin

**Goal:** merge #32 with `release.yml`'s Tauri CLI pin moved to match, and prove the release pipeline still builds,
signs and publishes before the next tag (`open-items.md` §AM, the row *#32 (the npm group) is held for its own plan*).

## Why it's held

#32 bumps `@tauri-apps/cli` 2.12.1 → 2.12.2 in `package-lock.json`. `release.yml:165` installs the CLI from crates.io,
`cargo install tauri-cli --version 2.12.1 --locked`, and the guard in `checks.yml:42-50` fails any run where the two
differ. That is #32's Ubuntu failure (CI run 38734571211). Its macOS failure there was the flaky
`cancel_ends_an_op_with_a_full_queue` (§AM), green on re-run; Windows was green.

## What moves

Read from the crate sources on crates.io (checksums matched the index), unpacked in the session scratchpad.

- **tauri-cli 2.12.1 → 2.12.2.** `src/` is byte-identical. Its lockfile (below) and `Cargo.toml` decide which bundler
  is compiled into the CLI: `Cargo.toml` pins `tauri-bundler =2.10.2` and `tauri-macos-sign =2.4.1` and moves `base64`
  0.22 → 0.23. Also changed, none of it read by `tauri build`:
  - `metadata-v2.json` (tauri 2.12.3, tauri-build 2.7.2, cli.js 2.12.2), read only by `info`, `init` and
    `plugin init` (`src/info/mod.rs:41`, `src/init.rs:198,379`, `src/plugin/init.rs:373`);
  - the iOS plugin templates;
  - docs-only text in `config.schema.json`: the `$id` URL, `rust,no_run` code fences, a fixture path in one example.
- **The CLI's lockfile:**
  - `tauri-bundler` 2.10.1 → 2.10.2;
  - `tauri-macos-sign` 2.4.0 → 2.4.1;
  - `base64` 0.23.1 added beside 0.22.1;
  - `windows-sys` re-resolved to 0.48 in four places.

  The two that build the bundles:
  - **`tauri-macos-sign`:** `src/` is byte-identical; the bump is its own `base64` dependency.
  - **`tauri-bundler`:** the only source change is `src/bundle/windows/nsis/installer.nsi`.
    - The downgrade guard moved from `Section EarlyChecks` into `.onInit`. It now also covers passive and update mode,
      with a message box outside silent mode.
    - The guard is compiled in only when `allowDowngrades` is `false`. Ours isn't set, and the schema's default is
      `true`, so the guard isn't in our installer.
    - What does change for us: the now-empty `Section EarlyChecks` is gone. `windows/hooks.nsh` doesn't refer to it.
    - Harmless by reading the template, not by building and comparing. Nothing in this plan runs the new installer (D3
      walks a `--no-bundle` build, D4 skips the packages, the dry run checks signatures only). The first run of the
      2.10.2 installer in passive/update mode is the next release's update walk (§AM's third row).
  - **Linux:** everything under `src/bundle/linux/` is identical. The AppImage tool names, URLs and the gtk/gstreamer
    plugin scripts are unchanged, so **the four pins in *Pin the AppImage tools* stay as they are**.
  - **The Windows downloads:** `nsis/mod.rs` is identical too, so `nsis-3.11.zip` and `nsis_tauri_utils.dll` v0.5.3 are
    unchanged.
- **npm sources:** all 33 changed `package-lock.json` entries resolve to `registry.npmjs.org`, and each `integrity`
  matches `npm view <pkg>@<version> dist.integrity` (the release skill's step 1, checked against head `8d1bb86`).
- **The rest of #32, shipped front end:**
  - `@tauri-apps/api` 2.12.1 → 2.12.3, a patch ahead of `main`'s `tauri` crate (2.12.2) (see D6);
  - `@tauri-apps/plugin-dialog` 2.8.1 → 2.8.2 and `plugin-clipboard-manager` 2.4.1 → 2.4.2. Main's crates are now
    2.8.2 and 2.4.2 (#31), so the npm side catches up;
  - `lucide-react` 1.52 → 1.55;
  - `react-resizable-panels` 4.14.2 → 4.14.4;
  - `@lezer/css` 1.3.8 → 1.3.9;
  - `@tanstack/react-virtual` 3.14.13 → 3.14.17, pulling `@tanstack/virtual-core` 3.17.11 → 3.19.2. This one changes
    behaviour:
    - `scrollToIndex` reconciliation was reworked (3.18.0, 3.19.1);
    - ResizeObserver entries are measured before notifying (3.19.0).

    The app uses the first; it never calls `measureElement`, so there are no per-item ResizeObservers, and 3.19.0
    reaches it at most through the scroll container's size (reasoned, not verified). The paths:
    - `scrollToIndex(…, { align: "auto" })` for keyboard navigation (`ChangedFileList.tsx:113`, `FilesColumn.tsx:241`,
      `DiffViewer.tsx:440`, `FileContent.tsx:146`);
    - `scrollToOffset(0)` on a file or target change (`ChangedFileList.tsx:118`, `DiffViewer.tsx:420`,
      `FileContent.tsx:135`);
    - re-measured variable-height diff rows (`DiffViewer.tsx:409, 415`);
    - the virtualized History grid (`RevisionGrid.tsx:67`).

    The unit tests run in jsdom, which has no layout, so they don't exercise scrolling.
  - `package.json` raises the floors of those it names (`^1.48.0` → `^1.55.0` for lucide, and so on).
- **Build tooling:** `vite` 8.3.2 → 8.3.4 with `postcss` 8.5.29 and `nanoid` 3.3.20, which run inside `vite build` and
  so shape the shipped bundle.
- **Dev only:**
  - `@types/node`;
  - `vitest` 5.0.3 → 5.0.4 with `@vitest/mocker` and `@vitest/spy`;
  - `chai` 6.3.0, `tinybench` 6.2.2, `std-env` 4.3.0, `tinyexec` 1.3.1, `magic-string` 1.4.3, and `obug` 2.1.4 → 3.0.0
    (a major, under vitest).

## Decisions

Owner's answers 2026-10-15: D1 (a), D2 (a), D3 (b), D4 no, D5 (a), D6 (a).

**D1. How #32 lands — (a).** Commit the pin onto #32's branch, then squash-merge the PR with `--admin` (the owner's
ruleset bypass, as for #27–#31). One commit on `main`, and the next release's generated notes list #32. Dependabot
stops rebasing a branch someone else committed to. *Not taken:* (b) by hand on our own branch, after which Dependabot
closes #32 itself and the notes don't list it.

**D2. The dry-run Release runs after the merge, from `main` — (a).** The `signing` environment already allows `main`.
If it fails, `main` holds a pipeline that doesn't build until fixed; nothing is tagged meanwhile. *Not taken:* (b)
before the merge from #32's branch, which needs the branch added to the `signing` environment and removed after.

**D3. A Windows VM walk of the front-end bumps — (b),** ~30 min, before the merge. Rows in step 5.

**D4. No launch of the dry run's AppImage.** The bundler's Linux code is unchanged and the four tool pins are the same
files; the dry run's log checks cover the pipeline.

**D5. The deferred row *A release run builds ssign and the Tauri CLI from source* — (a), kept deferred.**
- *What it is:* every Release run builds the Tauri CLI (5–10 min a leg) and ssign (~3 min) from source, because the
  cache rarely survives to a tag. Measured on dry run 37296029478; deferred 2026-10-05 (`open-items.md`, §AA).
- *Why now:* its reopen trigger is "the next change to the release workflow", and this plan's pin commit is one.
- *Options:*
  - (a) Keep it deferred, the same trigger. Record this dry run's build times in the row. Costs nothing now; the
    times show whether it is getting worse.
  - (b) Reopen it as its own plan before the next release: cache ssign by its rev, or use the prebuilt npm CLI. That
    is a change to the job that holds the signing key.
- *Recommend (a):* a release costs ~30 min, nothing breaks, and (b) touches the signing job for speed alone.

**D6. `@tauri-apps/api` 2.12.3 against the `tauri` crate 2.12.2 — (a), the crate stays.**
- *What it is:* #32 moves the JS API to 2.12.3; `main`'s crate is 2.12.2 (#31). The CLI's mismatch check compares
  major.minor only (`tauri-cli-2.12.2/src/info/plugins.rs:39`), so the build passes either way.
- *What changes for the app:* the two JS releases fix:
  - `Channel` delivery after a throwing handler (2.12.3);
  - awaitable unlisten for `onDragDropEvent` and `onFocusChanged`, and the `Menu` append/insert typings (2.12.2).

  `src/` uses none of `Channel`, `onDragDropEvent` or `onFocusChanged` (grep, `.test.` files excluded). The menu
  typing change is TypeScript only.
- *Options:*
  - (a) Leave the crate at 2.12.2. Dependabot's next Cargo PR brings 2.12.3 or 2.12.4; both answered 200 on the
    crates.io API on 2026-10-15.
  - (b) Bump `tauri` in this change too. That adds a shipped Rust runtime change and its own review.
- *Recommend (a):* the pairing is inert for this app by the grep, and (b) widens a CI-pin change into a runtime one.
- *Not verified:* whether the Rust side of `Channel` behaves differently with a newer JS client. Reasoned from the
  JS-only changelog entry.

## Steps

1. **Head check.** #32's head is `8d1bb86` on `dependabot/npm_and_yarn/npm-eef6e6eb88`. If Dependabot has pushed since,
   stop and ask: a new head is an unreviewed version set, and the npm source check above was made on `8d1bb86`.
2. **The pin commit** on that branch: `release.yml:165` → `--version 2.12.2`. Comments: `:160` "(2.10.1 here)" →
   "(2.10.2 here)"; `:230` "tauri-bundler 2.10.1's (tauri-cli 2.12.1)" → "tauri-bundler 2.10.2's (tauri-cli 2.12.2)".
   `:330`'s "tauri-bundler 2.10.1" is history and stays. No new comment may contain the literal
   `cargo install tauri-cli --version` (the guard's `grep -oP`). Subject `ci: pin the Tauri CLI to 2.12.2 with #32's
   npm CLI`.
3. **Local gates** on a throwaway merge of the branch into `main`, with the uppercase `F:/` path. No conflict expected:
   #27–#31 don't touch `package*.json`. Only the pin commit is pushed, on top of `8d1bb86`.
   - `npm ci`; `npx tauri --version` = 2.12.2;
   - tsc, vitest, `npm run build`;
   - the guard line from `checks.yml:47-50` by hand: 2.12.2 = 2.12.2;
   - `npm run tauri -- build --no-bundle`, with every running copy of the app closed first (the exe lock).

   Rust gates aren't re-run: no Rust change, and #31's CI ran them on `main`.
4. **Push the commit to #32's branch — owner's go at that moment.** PR CI green on three OS. A failure of either §AM
   flaky test isn't re-run silently: it fires that row's reopen trigger and goes to the owner.
5. **The D3 walk** on the Windows VM (session git-ui-win). Build `refs/pull/32/merge`: the PR merged into current
   `main`, so #31's crates are in it; the branch alone predates them. Build with `npm ci`, `npx tauri --version` =
   2.12.2, `npm run tauri -- build --no-bundle`; launch with `smoke-launch.ps1`. Rows:
   - **History grid:** scroll top to bottom and back with the wheel and PageDown. Rows painted, none blank (v0.10.24's
     blank-rows fix lives here).
   - **Keyboard past the edge:** in the changed-file list and the commit panel's file column, arrow keys past the
     visible edge; the selection stays in view.
   - **Diff cursor:** in the diff viewer and file content, cursor down past the bottom and back up; the view scrolls
     with the cursor.
   - **Start at the top:** scroll a list and a diff down, then pick another file or commit. Both start at the top.
   - **Diff reload:** on a diff scrolled down, toggle whitespace or reload it. No blank or overlapping rows.
   - **Panels:** drag a splitter and double-click it; the layout persists across a restart.
   - **Icons:** the toolbar and context menus render.

   Record in `docs/archive/walks/2026-10-16-npm-group-32-walk.md`.
6. **Merge — owner's go:** `gh pr merge 32 --squash --admin` with the subject
   `build(deps): Bump the npm group with 11 updates (#32)` and an explicit body, one line for the pin, passed as
   `--body-file -` from a quoted heredoc. GitHub's default body for a squash wasn't measured (#27–#31 were merged with
   an explicit `--body ""`); the explicit body removes the doubt. Then `main`'s CI green.
7. **The dry run — owner's go and approval of the `signing` deployment.** `workflow_dispatch` of Release on `main`.
   Read:
   - ``Installed package `tauri-cli v2.12.2` `` on all three legs, or ``Replaced package `tauri-cli v2.12.1` with
     `tauri-cli v2.12.2` `` where the cache held the old one;
   - *Pin the AppImage tools*: four `OK`; no "bundler downloaded a tool" failure;
   - the libwayland AppDir check, the macOS signature check and the Windows signature check green;
   - `verify` OK ×3 with `version:`;
   - the draft created and deleted, no `dry-run-<id>` tag left;
   - the AppImage runtime still type2-runtime `dd6cebe`: `--appimage-version` on the downloaded artifact in WSL, as
     the 2.12 plan read it. It prints the runtime's version and exits; the app isn't launched (D4);
   - for D5 (a): each leg's `cargo install tauri-cli` and ssign build times.
8. **Records**, one docs commit:
   - `open-items.md` §AM: the #32 row → `open-items-done.md`, a new dated section §AM (the file ends at §AL), closed
     with the merge hash, the walk record and the dry-run run id.
   - `open-items.md` *What the Release build still fetches unpinned*: add that bundler 2.10.2 (tauri-cli 2.12.2) has
     the same two Windows URLs.
   - `open-items.md` *A release run builds ssign and the Tauri CLI from source*: "bundler 2.10.1" → "2.10.2", plus D5's
     outcome.
   - Plan archived to `docs/archive/plans/`.
   - Push — owner's go.

## Not in this plan

- #31's update walks (§AM's third row): they belong to the next two releases.
- Smoke-doc and skill text that says "since tauri-cli 2.12.1": still true, left alone.

## Review record

- **Pass 1** (2026-10-15, fresh reviewer): 12 findings, all taken. Added:
  - the npm source check (run: 33 entries, all pass);
  - the flaky-test rule in step 4;
  - D5 (a reopen trigger firing) and D6 (the JS API a patch ahead);
  - the full CLI change list;
  - the installer's dropped section;
  - two walk rows; the build method in steps 3 and 5;
  - the explicit merge body;
  - the full transitive list;
  - the lockfile wording;
  - the new §AM section in `open-items-done.md`.

  Dropped: the `measureElement` claim, since `src/` never calls it.
- **Pass 2:** 3 low findings, all taken: the CLI `Cargo.toml` pins and what `tauri build` reads; the ResizeObserver
  change scoped to the container; the merge-body default marked unmeasured. Its "2.12.4 unverified" was answered by
  the crates.io API check (200).

## Outcome (2026-10-16)

- Pin commit `33e710a`, pushed to #32's branch by the owner; #32's CI green on three OS (run 38869808207).
- The D3 walk passed all 7 rows (`docs/archive/walks/2026-10-16-npm-group-32-walk.md`). Row *Panels* was walked as an
  observation for persistence: splitter sizes aren't stored, in 0.10.24 either.
- #32 squash-merged as `1fa3430`. `main`'s CI then failed once on macOS on the flaky cancel test (38893872747), which
  reopened its §AM row (`docs/plans/2026-10-16-flaky-cancel-test-plan.md`); the re-run passed.
- Dry-run Release 38902302809 green; every step 7 check passed (`open-items-done.md` §AM).
