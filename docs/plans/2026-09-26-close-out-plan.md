# Closing out `open-items.md`

**Goal:** empty `open-items.md` — every row either fixed and walked, or moved to `open-items-done.md` with a
reason. The rows are grouped by what they need (a decision, a sitting, code, a measurement, other hardware), so
each group costs one smoke walk and at most one release, not one per row. §C (roadmap) is kept open by
decision, so the list will not reach fully empty.

**Status:** 2026-09-26. **Phase 0 done 2026-09-26** (`2026-09-26-phase-0-plan.md`). Phase 1 next. Open
decisions: §J (before Phase 2), the Phase 3 threshold, the Phase 4 reference canvas, and hardware (before
Phase 5).

Row references are to `docs/plans/open-items.md` sections (§A–§M) and the smoke docs' line numbers as of
2026-09-26. `CF` = `docs/archive/plans/2026-09-12-consolidated-findings.md`.

---

## Phase 0 — close by decision (one docs commit, no code)

See `2026-09-26-phase-0-plan.md`. In short: the four record-only smoke boxes marked `[n/a]`; §H becomes a
release-skill rule (tag only after `main`'s CI is green on all three OS); the `Menu.tsx` ceiling closed as
won't-fix; seven untracked `ponytail:` ceilings added to §I; macOS notarization closed as won't do for now; the
Windows signing row re-pointed at Phase 1b; the "user's own update" row re-pointed at the release gate; the §I
intro reworded; §C kept open.

## Phase 1 — release-gate sitting (the user, about an hour)

- **First, back up `%APPDATA%\dev.topher.t4gitui`**, before asking the user to close the app — closing windows
  one by one drops tabs from `layout.json`.
- **§B updater 2.12.0 walk** — a local build of `main` versioned 0.10.11 updating to the published 0.10.12,
  through `docs/smoke/fixtures/throttle-proxy.mjs` for the cut and failed cases (recipe of the 2026-09-24
  update walk). **This also upgrades the user's install**: the local build's updater runs the published
  0.10.12 setup, which installs into the same per-user folder as the installed 0.10.11. There is no separate
  "user's own update" afterwards; the store folder backup above is restored once the walk is done.
- **§B the three hand smoke boxes** — DPI change (`smoke-test.md:283`; without a second monitor of a
  different DPI, change *Settings › Display › Scale* with the app open — the same DPI-change event), AI's
  folder toggle across a refresh (`smoke-test-post-v1.md:1225`), AJ's Remove from list (`:1255`).
- Push `1152a14` and the Phase 0 commits on the user's word.

## Phase 1b — signing and repo setup (§B Windows code signing)

Port `F:/src/_ pet projects/signing-and-repo-setup.md` from t4-markdown-viewer. Needs its own plan, and that
plan **starts from a diff of this repo's workflows against the doc, not from a copy of it** — part is already
here:

| Doc item | This repo today |
|---|---|
| 2a top-level `permissions: contents: read`, write only on `publish` | done (`release.yml:18`) |
| 2b `github-actions` Dependabot entry | done (`.github/dependabot.yml:4`) |
| 2b every `uses:` pinned by SHA | partly: rust-toolchain, rust-cache, cargo-binstall, action-gh-release pinned; `checkout@v7`, `setup-node@v7` (both workflows), `upload-artifact@v7`, `download-artifact@v8` not |
| 2b Tauri CLI `cargo install tauri-cli --version 2.11.4 --locked` | differs: `cargo binstall 'tauri-cli@2.11.4'` (a prebuilt binary); decide whether to switch |
| 1a `signing` environment, 1b secrets there, 1c Actions settings | not done |
| 2b `ssign`, AppImage tool pins; 2c build / bundle split; 2d signature proofs; 2e dry-run publish | not done |

Then the doc's verify sequence (cold-cache dry run, delete repo-level secrets, dry run again, SHA pinning on
— only after `checks.yml` is pinned too). Repo-settings changes are outward actions: each needs the user's go.

Update the `release` skill to match: Windows is signed now ("What a release does not do", the intro), and
**every Release run waits for approval** — step 5 gains *approve it under Actions › the run › Review
deployments*.

The dry run cannot prove an installed copy still updates to a release built this way; the release gate below
covers it.

## Gate after every close-out release

Right after a release publishes, update the user's installed copy to it through the updater (Check now →
Install) and confirm the new version starts with its windows. The first such update (from 0.10.12) is also the
first real run of 0.10.12's plain-words update errors and Install's confirm over a typed commit message —
the §B row that asked for it on 0.10.11 → 0.10.12 could not, since an update runs the *old* app's code. The
first release after Phase 1b is also the first signed one, so the same update proves the new pipeline.

Releases happen only on the user's request naming the version (the `release` skill), and pushes only on the
user's word.

## Phase 2 — fix batch (one branch per part, one smoke group and one release per part)

Rows marked **design needed** have no agreed fix; the Phase 2 plan decides each from its source first.

| Row | Fix | Source |
|---|---|---|
| §M default remote overwrites a quick pick | skip `setRemote` in `useDefaultRemote` once the field was touched | §M |
| §M toast detail cut mid-sentence / `warning:` taken | join lines up to a blank one, skip `warning:`; update `cli::ops::tests::rejected_and_other` | §M |
| §M menus: row shift on a clipped name, wrapped first item | **design needed** | §M |
| §L `Ctrl+,` dead while the start screen opens a repo | drop `busy` from the comma arm only | §L |
| §L Linux `Super+O/N/Q` reach the app | `navigator.platform` split in `useShortcuts`, first platform test there | §L |
| §I S1 blames never cancelled | per-repo "latest blame" token cancelled by the next | CF:612 |
| §I S2 non-UTF-8 paths dropped | **design needed** — the IPC type is `String`; CF says "log the skip at most" | CF:613 |
| §I S3 truncated flag fires on stderr | split the flag | CF:614 |
| §I S4 `blameAt` ordering | **design needed** — reordering races the details-pane effect | CF:615 |
| §I B3 interactive-rebase read pass `--autostash` | **design needed** — CF proposed dropping `--autostash` from `read_args`; open-items says git's clean-tree check needs it | CF:367, `cli/rebase.rs:274` |
| §I C6 `close_repo` never cancels ops | **design needed** — unreachable today (`refusedWhileRunning()` blocks close / switch); a fix is defence in depth only | CF:60, CF:340 |
| §I Q23 blank details pane during the round trip | **design needed** — decided at P1-4 as blank; reconsider only if it flickers | CF:520 |
| §I F3 hunk buttons on a non-UTF-8 file | put `FileDiff::lossy` on the wire + `DisabledHint` | §I |
| §I R10 selected-mode header after a partial stage | **design needed** — the inverse of X8 | CF:51 (P1-8), CF:274, `smoke-test-post-v1.md:772` |
| §I R12 two stale status/refs pairings | **design needed** — guarding would flicker | CF:427, `MessageColumn.tsx:46,63`, `CommitPanel.tsx:67-82` |
| §I `App.tsx` update-answer race | re-query `lastUpdateCheck()` after the listener attaches | `src/App.tsx:154` |
| §I `log/walker.rs` `Refs` spec never reaching HEAD | **design needed** | `crates/git-core/src/log/walker.rs:94` |
| §I `Input.tsx` AltGr never reaches type-ahead | let a Ctrl+Alt chord with `e.key.length === 1` past the Alt branch | `src/components/ui/Input/Input.tsx:221` |
| §I `watch.rs` `.gitmodules` rewritten by the app | a `Linked` change kind the watcher and those ops both emit | `crates/git-core/src/watch.rs:124` |
| §I `linked.rs` no main row when its HEAD can't be read | **design needed** — `worktree list --porcelain` means a git ≥ 2.36 floor | `crates/git-core/src/linked.rs:134` |
| §I `Toolbar.tsx` rename in the `icons` tier measures late | **design needed** — taking the 0 width flaps the tier | `src/screens/RepoWindow/Toolbar.tsx:100` |
| §I `StashDialogs.tsx` dirty-only submodule listed | **design needed** — git stashes nothing of its tree | `src/screens/RepoWindow/dialogs/StashDialogs.tsx:39` |
| §J palette prefixes, per-view sidebar state | build, or drop (decision pending) | §J |

Split into **2a** (the rows with a fix given) and **2b** (the design-needed rows), each with its own release,
so the known fixes do not wait on the design work. Per part: gates green, one smoke group over CDP, squash,
then a release through the `release` skill on the user's request, then the release gate above. Phase 1 must
be done before 2a's release (the updater 2.12 walk gates the next tag). Phase 1b does **not** gate Phase 2:
signing ships in whichever release follows it.

## Phase 3 — measure once, then fix or close

One sitting on a `git/git` clone plus the synthetic 100k-commit / 330-branch repo, reading the app log's
timings (`opened repo`, `refs read`, `labels computed`, `walk complete`, `slow status`).

- §A `reachers` merged-badge walk
- §A hunk / line diff rebuilds (discard twenty hunks one by one)
- §A `status.rs` CLI fallback (status time at size)
- §A output dock scroll with a long op
- §M the ~4 s delay after an external 1800-file `git reset`
- §I E6 flat-directory tree build (CF:403), R13 `canSquash` per row (CF:428)
- §I `linked.rs:120` worktree / submodule snapshot with no cache (a repo with many worktrees)

Fix what crosses the threshold; close the rest as "measured, fine" with the numbers. **Threshold — proposal,
for the user to confirm:** ≥ 250 ms on a real action (the app's own `slow status` line uses 250 ms), or
visible scroll jank.

## Phase 4 — UI-vs-canvas pass (§B)

After Phases 2–3, so the UI is stable: CDP screenshots of the built app against the canvases; fix what differs
or update the canvas. **Decide the reference first:** there are two sets, `docs/design/canvases/screens/`
(v1) and `docs/design/canvases/direction-b/`, and Direction B replaced parts of the first. Likely rule:
Direction B where it has a screen, `screens/` for the rest.

## Phase 5 — other hardware (§B, whenever available)

Real Linux (Wayland), macOS rendering, AC's deb / rpm box (`:759`), AZ 11's two platform lines (`:1857`,
`:1858`), and the §I `window.rs:326` ceiling (tab adoption's pointer position: macOS and X11 could answer
natively; Wayland cannot). If no machine is coming, decide whether the WSLg walk plus CI's three-OS legs are enough and close
them on that.

## Phase 6 — 2026-12-23: `ubuntu-22.04` (§E)

Parked until then. One decision for all three t4 repos (`container: ubuntu:22.04` job or `cargo-zigbuild`);
check rustfmt is in the image if the Linux leg moves into a container. If Phase 1b has landed by then, its
AppImage tool pins are tied to the builder too — recheck them.

---

## Open decisions

1. **§J** — palette prefixes and per-view sidebar state: build or drop. Before Phase 2.
2. **Phase 3 threshold** — the 250 ms / visible-jank proposal. Before Phase 3.
3. **Phase 4 reference** — which canvas set rules where they differ. Before Phase 4.
4. **Hardware** — a Linux / macOS machine coming, or close Phase 5 on WSLg + CI. Before Phase 5.
