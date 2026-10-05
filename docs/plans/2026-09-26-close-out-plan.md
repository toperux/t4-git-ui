# Closing out `open-items.md`

**Goal:** empty `open-items.md` — every row either fixed and walked, or moved to `open-items-done.md` with a
reason. The rows are grouped by what they need (a decision, a sitting, code, a measurement, other hardware), so
each group costs one smoke walk and at most one release, not one per row. §C (roadmap) is kept open by
decision, and §Q (accepted limits with a reopen trigger, since 2026-09-28) by design, so the list will not reach
fully empty. A row that closes as an accepted limit with a reopen trigger goes to §Q, not the done file (e.g.
Phase 5's macOS rows closed on CI's leg, or a Phase 2b design row ending "accept, reconsider if…"). A Phase 3
"measured, fine" closure is not an accepted limit and still goes to the done file — except `status.rs`, which stays
in §Q with the numbers.

**Status:** 2026-10-04. **Phase 0 done 2026-09-26** (`59e9383`). **Phase 1 done 2026-09-26**
(`docs/archive/plans/2026-09-26-phase-1-plan.md`, walk record `docs/archive/walks/2026-09-26-phase-1-walk.md`): the next
tag is unblocked. **PR #18 merged 2026-09-27** (`5cc5de9`: the Linux harness, the WebKitGTK focus fixes, the restore
guard and its follow-ups, the AppImage repack). Its rows (§O, §P) are scheduled below, mostly in the new *Linux track*;
plan updated for it 2026-09-28. **Triage done 2026-09-28** (`docs/archive/plans/2026-09-26-triage-plan.md`). **The CLI
pin change done 2026-09-28** (`ee59475`: tauri-cli 2.11.5, `--app-version` on the AppImage re-sign, the pin guard in
`checks.yml`), verified by CI run 36391087334 and the `workflow_dispatch` run 36391567783 (every `.sig` ends in
`version:0.10.12`), recorded in `fda5293`. **`CLAUDE.md`'s workflow and open-items §Q** since 2026-09-28 (`430b6da`):
every phase, and each row picked up outside one, follows `CLAUDE.md`. **§J decided 2026-09-28** (prefixes → §C roadmap,
per-view sidebar → 2a). **Phase 2a done 2026-09-29** (13 commits `d116c2d`–`072b1b8`, smoke group BH walked — see
`docs/archive/walks/2026-09-29-group-bh-walk.md`). **v0.10.13 released 2026-09-29** (`c02f367`, release run 36476596805;
every `.sig` carries `version:0.10.13`); **its gate passed the same day**: the user's 0.10.12 updated through Check now
→ Install and came back as 0.10.13 with its windows. **The 0.10.14 hotfix** (the AppImage's environment no longer
reaches the processes it starts; `docs/archive/plans/2026-09-29-appimage-env-hotfix-plan.md`, smoke group BI) **released
2026-09-29** (`51433d3`, release run 36573068704; every `.sig` carries `version:0.10.14`); **its gate passed**: the
user's Windows 0.10.13 updated to 0.10.14 through the app, and on the Linux VM the published 0.10.13 AppImage updated in
place and, started by hand as the release notes say, fetched over HTTPS and opened files
(`docs/archive/walks/2026-09-29-v0.10.14-release-gate-linux.md`). **Phase 1b done 2026-10-01**
(`docs/archive/plans/2026-09-30-phase-1b-plan.md`, walk record `docs/archive/walks/2026-09-30-phase-1b-walk.md`, `main`
`edcc19c`): the Windows installer signed (Certum), the `signing` environment with approval, every action SHA-pinned (and
required), the Tauri CLI from crates.io, a `verify` job for all three `.sig` with `version:`, dispatch dry runs that
publish and delete a draft, and `requireSignedVersion` on; the first signed release is 2b's. **Phase 2b executed
2026-10-01** (`docs/archive/plans/2026-10-01-phase-2b-plan.md`, smoke group BK). **v0.10.15 released 2026-10-01**
(`db77c78`, release run 36843045866; every `.sig` carries `version:0.10.15`) — the first signed release, and the first
with `requireSignedVersion` on (the update from v0.10.15 to the next release is its first real check); **its Windows
gate passed the same day**: the owner's 0.10.14 updated through the updater and came back as 0.10.15 with its tabs,
`Get-AuthenticodeSignature` `Valid` (`docs/archive/walks/2026-10-01-v0.10.15-release-gate.md`). **The Linux AppImage
half passed the same day too**: the owner's installed 0.10.14 AppImage updated in place to 0.10.15 and **restarted by
itself**, the first update that can (`docs/archive/walks/2026-10-01-v0.10.15-release-gate-linux.md`). **Phase 3 done
2026-10-03** (`docs/archive/plans/2026-10-01-phase-3-plan.md`, walk records
`docs/archive/walks/2026-10-01-phase-3-measure.md` and `docs/archive/walks/2026-10-03-group-bl-walk.md`, smoke group
BL): rows 1–5 and 6a fixed, plus T7; 6b, 7 and 8 measured fine; pushed to `main` as `6ca9960..625b886` plus `cb886f4` (a
clippy 1.99 fix), CI green. **v0.10.16 released 2026-10-03** (`f53e8bf`, release run 37109623419; the green `verify` job
checked that every `.sig` carries `version:0.10.16`); **its gate passed the same day**, the Windows half on a VM rather
than the owner's desktop, the Linux half on the usual Ubuntu VM
(`docs/archive/walks/2026-10-03-v0.10.16-release-gate.md` and
`docs/archive/walks/2026-10-03-v0.10.16-release-gate-linux.md`) — also `requireSignedVersion`'s first real check (the
first update out of a build with it on), which passed. **Phase 4 Stage A done 2026-10-03, Stage B executed 2026-10-04**
(plan `docs/archive/plans/2026-10-03-phase-4-plan.md`): the app fixes and the canvas updates, local; the change review
and triage done, group BM walked 2026-10-04 (record `docs/archive/walks/2026-10-04-group-bm-walk.md`), squashed and
pushed 2026-10-04 (`0e6d333..7bbc25b`). **v0.10.17 released 2026-10-04** (`30c062e`, release run 37186324581); **its
gate passed the same day** on both VMs (`docs/archive/walks/2026-10-04-v0.10.17-release-gate.md` and
`docs/archive/walks/2026-10-04-v0.10.17-release-gate-linux.md`). **Phase 5 executed 2026-10-04** on the owner's Mac
(plan `docs/archive/plans/2026-10-04-phase-5-plan.md`, walk record
`docs/archive/walks/2026-10-04-phase-5-macos-walk.md`, smoke group BN): the Mac's 0.10.12 updated to 0.10.17, macOS
rendering and AZ 11's macOS line walked, T12 fixed for every menu, the Option type-ahead fixed, plus five more fixes
found on the way; triaged, squashed and pushed (`a6a7a76..1e58f7c`). The Linux VM's walk of BN the same day found
torn-off windows shrunk to 700 × 500 on X11, fixed forward in `4705c6c` and re-walked on Linux and Windows; triage
T26–T30 ruled, records `70d0247`. **v0.10.18 released 2026-10-04** (`be820a0`, release run 37210277628); **its gate
passed the same day** on the Windows VM, the Linux VM and the owner's Mac, the first macOS update with
`requireSignedVersion` on (`docs/archive/walks/2026-10-04-v0.10.18-release-gate.md` and
`docs/archive/walks/2026-10-04-v0.10.18-release-gate-linux.md`). **The Tauri 2.12 bump** (Dependabot #19 and #20, plan
`docs/archive/plans/2026-10-04-tauri-2.12-plan.md`) **released as v0.10.19 2026-10-05** (`6102721`, release run
37307176681); **its gate passed the same day** on the Windows VM, the Linux VM and the owner's Mac
(`docs/archive/walks/2026-10-05-v0.10.19-release-gate.md` and
`docs/archive/walks/2026-10-05-v0.10.19-release-gate-linux.md`). Open decisions: none.

Row references are to `docs/plans/open-items.md` sections (§A–§Z), and code and smoke-doc line numbers are as of
2026-09-28 (`main` after #18; `release.yml` cites after the CLI pin change). The Phase 1 section keeps its original
numbers. `CF` = `docs/archive/plans/2026-09-12-consolidated-findings.md`.

## Order

Agreed with the user 2026-09-28 (`docs/archive/plans/2026-09-28-close-out-refresh-plan.md`):

1. ~~§J decision (it decides which rows 2a and 2b carry).~~ Decided 2026-09-28: prefixes → §C roadmap,
   per-view sidebar → 2a.
2. Phase 2a, then a release and the gate: the first release with version-bound signatures, and the first AppImage
   release walk (with U4).
3. ~~The 0.10.14 hotfix, ahead of Phase 1b~~ Released and gated 2026-09-29. The 0.10.14 hotfix, ahead of Phase 1b (the
   user, 2026-09-29): the AppImage's environment no longer reaches the processes it starts (every HTTPS fetch,
   coreutils hooks, custom tools, *Open* and the relaunch after an update fail from the AppImage on newer hosts). Plan
   `docs/archive/plans/2026-09-29-appimage-env-hotfix-plan.md`, walked as smoke group BI on the Ubuntu 26.04 VM, then
   released.
4. ~~Phase 1b (signing, and turning on `requireSignedVersion` with its local update test).~~ Done 2026-10-01. After
   2a, so 2a's known fixes don't wait on the signing setup.
5. ~~Phase 2b, then a release: the first signed one, and the first with `requireSignedVersion` on; its update walk
   proves the signed pipeline end to end, and it is the second AppImage walk (then AC ticks). The setting's first
   real check is the update from 2b's release to the next.~~ v0.10.15 released and its gate walked 2026-10-01 on
   both platforms; the AppImage half restarted by itself (the third AppImage release walk), and AC ticked.
6. ~~Phase 3 (threshold decision first).~~ Done 2026-10-03 (pushed as `6ca9960..625b886` plus `cb886f4`).
   **v0.10.16 released and its gate passed 2026-10-03.**
7. ~~Phase 4 (reference decision first).~~ Done 2026-10-04 (pushed as `0e6d333..7bbc25b`).
   **v0.10.17 released and its gate passed 2026-10-04.**
8. ~~Phase 5 (hardware decision first), or earlier, when the hardware is there.~~ Done 2026-10-04 (walked and
   triaged; squashed and pushed as `a6a7a76..1e58f7c`, plus the X11 fix `4705c6c` and records `70d0247`).
   **v0.10.18 released and its gate passed 2026-10-04**, macOS included.
9. Phase 6, on 2026-12-23.

- In parallel, on the Linux machine: the *Linux track* (the restore hang's Phase A/B, T20, T7, the ssh fail-fast
  PR, T5).
- Phase 1b still does not gate Phase 2 (see Phase 2); this only fixes the order chosen.

---

## Phase 0 — close by decision (one docs commit, no code)

See `docs/archive/plans/2026-09-26-phase-0-plan.md`. In short: the four record-only smoke boxes marked `[n/a]`;
§H becomes a release-skill rule (tag only after `main`'s CI is green on all three OS); the `Menu.tsx` ceiling
closed as won't-fix (in open-items §Q since 2026-09-28); seven untracked `ponytail:` ceilings added to §I; macOS
notarization closed as won't do for now (in open-items §Q since 2026-09-28); the Windows signing row re-pointed
at Phase 1b; the "user's own update" row re-pointed at the release gate; the §I intro reworded; §C kept open.

## Phase 1 — release-gate sitting (the user, about an hour)

**Done 2026-09-26**, all green — `docs/archive/walks/2026-09-26-phase-1-walk.md`. The bullets below are the plan
as written: the DPI box was in fact walked on a real 150 % monitor, and AJ's box is now at `:1272`.

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

Port the sibling app's setup — its `.github/workflows/release.yml` is the reference implementation, and the user's
`signing-and-repo-setup.md` (a working copy outside the repo) lists the repo settings and the verify steps. Needs its
own plan, and that plan **starts from a diff of this repo's workflows against the doc, not from a copy of it** — part is
already here (the *Doc item* numbers are the working copy's sections):

| Doc item | This repo today |
|---|---|
| 2a top-level `permissions: contents: read`, write only on `publish` | done (`release.yml:18`) |
| 2b `github-actions` Dependabot entry | done (`.github/dependabot.yml:4`) |
| 2b every `uses:` pinned by SHA | partly: rust-toolchain, rust-cache, cargo-binstall, action-gh-release pinned; `checkout@v7`, `setup-node@v7` (both workflows), `upload-artifact@v7`, `download-artifact@v8` not |
| 2b Tauri CLI `cargo install tauri-cli --version 2.11.4 --locked` | differs: `cargo binstall --no-confirm --locked 'tauri-cli@2.11.5'` (`release.yml:160`; a prebuilt binary, built from source on macOS; 2.11.5 since the CLI pin change, 2026-09-28); decide whether to switch. `checks.yml` now fails a PR whose pin and `package-lock.json` differ |
| 1a `signing` environment, 1b secrets there, 1c Actions settings | not done |
| 2b `ssign`, AppImage tool pins | not done. The doc's six tool hashes match tauri-cli 2.11.4 (bundler 2.9.4); the CLI pin change's 2.11.5 locks the same bundler 2.9.4, so check them once rather than re-derive. #18's repack also takes `squashfs-tools` and `python3-cryptography` from apt, unpinned (`release.yml:127-129`); pin them by a version floor, not exact versions (triage U5). The Linux build-dependencies step, right after the apt install, fails with a clear message unless squashfs-tools is ≥ 4.5 (`dpkg --compare-versions "$(dpkg-query -W -f='${Version}' squashfs-tools)" ge 1:4.5` — the package has epoch 1, so a bare `4.5` always passes) and `python3 -c 'import cryptography'` succeeds |
| 2c build / bundle split | partly: the macOS certificate import is already its own macOS-only step (`release.yml:184`); build and bundle are one step holding the updater key (`:214`), and #18 added a second step holding it, "Re-sign the AppImage" (`:253`), which the split keeps after the bundle |
| 2d signature proofs | partly: macOS done (`Verify the macOS signature`, `release.yml:293`: bundle, `.app.tar.gz`, `.dmg`); Windows not (nothing to prove until signed). Separately, #18 verifies the AppImage's *updater* `.sig` (`.github/scripts/verify-updater-sig.py`, `:272`); **a task of this phase** (since 2026-09-28): extend that check to `.exe.sig` / `.app.tar.gz.sig`, run on the Windows and macOS legs (§P's row); and the script fails unless each `.sig`'s trusted comment carries `version:<the release's version>` (the `version` job's output), on every leg |
| 2e dry-run publish | not done |

Then the doc's verify sequence (cold-cache dry run, delete repo-level secrets, dry run again, SHA pinning on
— only after `checks.yml` is pinned too). Repo-settings changes are outward actions: each needs the user's go.

Update the `release` skill to match: Windows is signed now ("What a release does not do", the intro), and
**every Release run waits for approval** — step 5 gains *approve it under Actions › the run › Review
deployments*.

Turn on `requireSignedVersion` in `tauri.conf.json` (open-items §Q). It ships in the release after 1b (2b's, per
*Order*) and acts from the update after that, since the setting works in the app that ships it. Before it ships,
test it: a local build with it on, versioned below the published 2a release, updates to that release through
`docs/smoke/fixtures/throttle-proxy.mjs`, as in Phase 1's updater walk. Its first real check is the update from
2b's release to the next. (Superseded by the Phase 1b plan's D4, `docs/archive/plans/2026-09-30-phase-1b-plan.md`: a
negative and a positive case against a local endpoint, no proxy — smoke group BJ 1–3.)

The dry run cannot prove an installed copy still updates to a release built this way; the release gate below
covers it.

## Gate after every close-out release

Right after a release publishes, update the user's installed copy to it through the updater (Check now →
Install) and confirm the new version starts with its windows. The first such update (from 0.10.12) is also the
first real run of 0.10.12's plain-words update errors and Install's confirm over a typed commit message —
the §B row that asked for it on 0.10.11 → 0.10.12 could not, since an update runs the *old* app's code. The
first release after Phase 1b is also the first signed one, so the same update proves the new pipeline.

**At 2b's release, before clicking Install** (triage 2026-09-29): with the installed 2a app, Ctrl+Shift+N opens a
new window that shows the update badge — then tick smoke group BH 12 (`smoke-test-post-v1.md`). Also type a commit
message in the Commit dialog first, so Install asks before it drops the draft (open-items §B). The Release run
waits for the owner's approval under *Actions › the run › Review deployments* (Phase 1b's `signing` environment).
After the update, `Get-AuthenticodeSignature` on the installed `%LOCALAPPDATA%\T4 Git UI\t4-git-ui.exe` shows Status
`Valid` and thumbprint `F06C1EC1FAC43DFEC92FBE47B0FC959D1CE38151` (Certum). The update from 2b's release to the next
is `requireSignedVersion`'s first real check.

**Walked 2026-10-01 for v0.10.15** (`docs/archive/walks/2026-10-01-v0.10.15-release-gate.md`): the new window showed the
badge (BH 12 ticked); Install asked before dropping a typed commit summary; the installed app updated from 0.10.14 to
0.10.15 and restarted with its tabs; `Get-AuthenticodeSignature` read `Valid`, thumbprint
`F06C1EC1FAC43DFEC92FBE47B0FC959D1CE38151`, timestamped.

**Walked 2026-10-03 for v0.10.16** (`docs/archive/walks/2026-10-03-v0.10.16-release-gate.md`), on a Windows VM rather
than the owner's own machine: the update to 0.10.16 restarted the app by itself with its tab;
`Get-AuthenticodeSignature` read `Valid`, thumbprint `F06C…8151`, timestamped. This is also `requireSignedVersion`'s
first real check — 0.10.15 is the first build with it on, so this is the first update it checked — and it passed.

**The AppImage, from #18 (§P, on the Linux machine):**
- **At the next release:** an old AppImage started with the `LD_PRELOAD` workaround updates to the fixed one. The
  command is in `docs/archive/walks/2026-09-26-group-ac-linux-walk.md`. **Walked 2026-09-29 for v0.10.13** on the
  Ubuntu 26.04.1 VM (`docs/archive/walks/2026-09-29-appimage-release-walk.md`): the update installs in place and the
  repacked file renders without `LD_PRELOAD`; **the automatic restart fails** (open-items §S). U4: no clear gap
  (same zstd / 128 KiB blocks, +1.4 % size, cold start 0.536 s both) — nothing to match. **Walked again for
  v0.10.14** (`docs/archive/walks/2026-09-29-v0.10.14-release-gate-linux.md`): 0.10.13 → 0.10.14 installs in place;
  0.10.13's restart still fails (fixed from 0.10.14 on, so the next release's update is the first to come back by
  itself).
  - Also compare the fixed AppImage with the old one started above (built without the repack; triage U4).
    - `unsquashfs -s -o <offset>` on both (the offset: `smoke-linux.md` › *Inspect without running it*) shows the
      block size and compressor options each used.
    - Then the size, and the cold start: drop the page cache (`sync; echo 3 | sudo tee /proc/sys/vm/drop_caches`),
      then time from launch to the window mapped (e.g. `xdotool search --sync --name 'T4 Git'`); take the median
      of three. The old one runs with its `LD_PRELOAD` workaround.
    - App code and one library differ too, so only a clear gap counts. Match appimagetool's options only if it
      differs noticeably.
- **At the release after:** the fixed one updates in place (and restarts — blocked by open-items §S until fixed; the
  restart is the *old* app's, so a fix helps only updates from the release that carries it). **Walked 2026-10-01 for
  v0.10.15** (`docs/archive/walks/2026-10-01-v0.10.15-release-gate-linux.md`): the installed 0.10.14 AppImage
  updated in place to 0.10.15 and **restarted by itself**, the first update that can; HTTPS clone and fetch, *Open*
  and Ctrl+Q all passed.
- **Then tick AC** (`smoke-test-post-v1.md:761`). **Ticked 2026-10-01**, at the walk above.

**Walked again 2026-10-03 for v0.10.16** (`docs/archive/walks/2026-10-03-v0.10.16-release-gate-linux.md`), on the
usual Ubuntu VM: the installed 0.10.15 AppImage updated in place to 0.10.16 and
restarted by itself; HTTPS clone and fetch, *Open* and Ctrl+Q all passed.

**The CLI pin change (§P) landed on `main` 2026-09-28**, so the next release is the first whose updater signatures
carry `version:`, and the gate's updates are its end-to-end check
(`docs/archive/plans/2026-09-27-ssh-prompts-check-and-cli-pin-plan.md`, Part B › *Verify › End to end*). After that
first release, `requireSignedVersion`'s precondition holds (open-items §Q, *`requireSignedVersion` is off*);
Phase 1b turns it on.

**The crash-loop breaker's update clear (§P row 1)** isn't exercised by 2a's release (0.10.12 does the installing). 2b's
update walk checks it: after updating from 2a's release, the first launch shows no crash toast. **Walked 2026-10-01 for
v0.10.15** (`docs/archive/walks/2026-10-01-v0.10.15-release-gate.md`): no crash toast reported, and the tabs came back,
which a breaker trip would have prevented.

Releases happen only on the user's request naming the version (the `release` skill), and pushes only on the
user's word.

## Phase 2 — fix batch (one branch per part, one smoke group and one release per part)

Rows marked **design needed** have no agreed fix; the Phase 2 plan decides each from its source first.

| Row | Fix | Source |
|---|---|---|
| ~~§M default remote overwrites a quick pick~~ — done 2026-09-29 (`d116c2d`) | skip `setRemote` in `useDefaultRemote` once the field was touched | §M |
| ~~§M toast detail cut mid-sentence / `warning:` taken~~ — done 2026-09-29 (`7c7294e`) | join lines up to a blank one, skip `warning:`; update `cli::ops::tests::rejected_and_other` | §M |
| ~~§M menus: row shift on a clipped name, wrapped first item~~ — fixed 2026-10-01 (`b1241e4`); the row shift over a clipped name accepted 2026-10-01 → §Q | a pointer-opened `ContextMenu` no longer marks its first item | §M |
| ~~§M Esc is dead in Settings after Check now (triage T2)~~ — done 2026-09-29 (`5ada2e9`) | at the root, in `Dialog`, not only Settings: while a dialog is open and the focus falls to `<body>`, put it back on the dialog's first body field (the rule `Dialog.tsx:88-95` applies when `busy` clears, generalised; the 2a plan picks the trigger, since whether Blink dispatches `focusout` for a disabled control is to be checked). Plus an audit of every dialog for a control that disables itself during its own action, and a test per case found. Constraints: stay quiet while the dialog unmounts, or it fights the cleanup's return of focus to the opener (`Dialog.tsx:77-85`); and when a dialog opens another in the same commit (Commit & Push), the new one's `autoFocus` must win | `Dialog.tsx:88-103`, `SettingsDialog.tsx:160,232` |
| ~~§I detached-HEAD banner buttons not disabled while an op runs (found 2026-09-28)~~ — done 2026-09-29 (`d7cfc61`) | `disabled={running}` with the *Operation in progress* title on the banner buttons, like the grid and sidebar menus | §I, `RepoWindow.tsx:386` |
| ~~§L `Ctrl+,` dead while the start screen opens a repo~~ — accepted 2026-09-28 (Q1) | **accepted, no code** (Q1) — moved to §Q | §L |
| ~~§L Linux `Super+O/N/Q` reach the app~~ — done 2026-09-29 (`11b5b42`) | `ctrlOrCmd(e)` helper (`e.ctrlKey \|\| (e.metaKey && /Mac/.test(navigator.userAgent))`) at all four spots (P7) | §L |
| ~~§I S1 blames never cancelled~~ — done 2026-09-29 (`f52c050`) | per-repo "latest blame" token cancelled by the next | CF:612 |
| ~~§I S2 non-UTF-8 paths dropped~~ — fixed 2026-10-01 (`7d532a4`); Changes listing a non-UTF-8 path under a replaced name accepted 2026-10-01 → §Q | the Files tab skips them, with a count | CF:613 |
| ~~§I S3 truncated flag fires on stderr~~ — done 2026-09-29 (`4eba53e`) | split the flag | CF:614 |
| ~~§I S4 `blameAt` ordering~~ — fixed 2026-10-01 (`870aff8`) | reveal first, act only on a hit | CF:615 |
| ~~§I B3 interactive-rebase read pass `--autostash`~~ — accepted 2026-10-01 → §Q | a unix test proves the recovery (`8ad504e`) | CF:367, `cli/rebase.rs:274` |
| ~~§I C6 `close_repo` never cancels ops~~ — accepted 2026-10-01 → §Q | comment corrected (`45414b1`) | CF:60, CF:340 |
| ~~§Q Q23 details pane blank when another commit is selected~~ — fixed 2026-10-01 (`ce34b92`) | shows the grid row's fields at once | §Q (since 2026-09-28), CF:520 |
| ~~§I F3 hunk buttons on a non-UTF-8 file~~ — done 2026-09-29 (`058b9a7`) | put `FileDiff::lossy` on the wire + `DisabledHint` | §I |
| ~~§I R10 selected-mode header after a partial stage~~ — accepted 2026-10-01 → §Q | the inverse of X8 | CF:51 (P1-8), CF:274, `smoke-test-post-v1.md:783` |
| ~~§I R12 two stale status/refs pairings~~ — the `stranded` pairing fixed 2026-10-01 (`35b061b`); pairing 1 (`canCommit`) accepted 2026-10-01 → §Q | guarding both would flicker | CF:427, `MessageColumn.tsx:46,63`, `CommitPanel.tsx:67-82` |
| ~~§I `App.tsx` update-answer race~~ — done 2026-09-29 (`072b1b8`) | re-query `lastUpdateCheck()` after the listener attaches | `src/App.tsx:175` |
| ~~§P crash loop: a repository that crashes the app while loading crashes every later launch~~ — done 2026-09-29 (`a47763b`) | the loop breaker sketched in §P (mark the restore in progress; clear it on every window's report, a normal exit and before `update.install`). **Priority raised:** #18's seed widened the loop to crashes inside `open_repo` and to `main`'s tabs not yet reached (D-a). **2a** (triage U1) | §P, `src-tauri/src/commands/window.rs` |
| ~~§I `log/walker.rs` `Refs` spec never reaching HEAD~~ — fixed by deletion 2026-10-01 (`dd04cc7`) | the unused variant is deleted | `crates/git-core/src/log/walker.rs:94` |
| ~~§I `Input.tsx` AltGr never reaches type-ahead~~ — done 2026-09-29 (`efe1896`) | let a Ctrl+Alt chord with `e.key.length === 1` past the Alt branch | `src/components/ui/Input/Input.tsx:221` |
| ~~§I `watch.rs` `.gitmodules` rewritten by the app~~ — done 2026-09-29 (`4fe4034`) | ops touching `.gitmodules` report `Refs` (P4), no new kind | `crates/git-core/src/watch.rs:124` |
| ~~§I `linked.rs` no main row when its HEAD can't be read~~ — the submodule case fixed 2026-10-01 (`8292622`) | opens the common dir itself for its `workdir()` | `crates/git-core/src/linked.rs:134` |
| ~~§I `Toolbar.tsx` rename in the `icons` tier measures late~~ — fixed 2026-10-01 (`e4ac54f`) | `visibility:hidden` keeps the span measurable | `src/screens/RepoWindow/Toolbar.tsx:100` |
| ~~§I `StashDialogs.tsx` dirty-only submodule listed~~ — fixed 2026-10-01 (`45ab79d`) | left out of the stash list, with a note | `src/screens/RepoWindow/dialogs/StashDialogs.tsx:39` |
| ~~§J per-view sidebar state~~ — done 2026-09-29 (`56bbea5`) | one `railOverride` per view, per window, in memory (P8); decided 2026-09-28 (prefixes moved to §C roadmap) | §J |
| ~~§R Ctrl+Q does nothing on the start screen (Phase 2a triage, 2026-09-29)~~ — done 2026-10-01 (`25dfe4f`) | a Ctrl+Q arm in `StartScreen`'s key handler calling `quit`, plus a test | §R |
| ~~§S a failed commit's toast shows a hook's first output line (0.10.14 hotfix triage T1)~~ — done 2026-10-01 (`acbfae0`) | `commit` reports the last non-empty stderr line; merge / pull show git's own *Not committing merge…*; a failing post-checkout says the checkout happened | §S, `src/store/toastStore.ts:104-107` |
| ~~§S a custom tool that fails to start still says *Opened …* (0.10.14 hotfix triage T2)~~ — done 2026-10-01 (`237d6d7`) | watch the first ~300 ms for an early non-zero exit on unix (126/127); the ~300 ms lock and other early exits accepted → §Q | §S, `crates/git-core/src/tools.rs:264-271` |

Split into **2a** (the rows with a fix given) and **2b** (the design-needed rows), each with its own release,
so the known fixes do not wait on the design work. 2a's walk also runs triage T8's check: launch the build with
`smoke-launch.ps1 -Proxy http://127.0.0.1:8888` and `throttle-proxy.mjs` running, and see `CONNECT github.com` in
the proxy's log (from the launch check, or Settings › **Check now**). Each part runs under `CLAUDE.md`'s
workflow: its own plan and plan review loop, the user's go, the change committed locally (gates green, one smoke
group over CDP), the change review loop and triage, then the squash, rehearsed in a throwaway worktree with the
final tree checked identical. The push and the release (through the `release` skill) each wait on the user's
word; then the release gate above.
Phase 1 must be done before 2a's release (the updater 2.12 walk gates the next tag). Phase 1b does **not** gate
Phase 2: signing ships in whichever release follows it.

## Phase 3 — measure once, then fix or close

**Done 2026-10-03** — `docs/archive/plans/2026-10-01-phase-3-plan.md`, walk records
`docs/archive/walks/2026-10-01-phase-3-measure.md` (Stage A) and `docs/archive/walks/2026-10-03-group-bl-walk.md`
(smoke group BL, on Windows, Linux and macOS); pushed to `main` as `6ca9960..625b886` plus `cb886f4` (a clippy 1.99
fix), CI green. The merged-badge walk, the hunk / line rebuilds, `status.rs`, the output dock, the 1800-file reset
and the Files / Changes trees were fixed; the sidebar tree, `canSquash` and the `linked.rs` snapshot measured fine
(the last kept in open-items §Q). The threshold was decided as proposed (the plan's T1). The bullets below are the
plan as written.

One sitting on a `git/git` clone plus the synthetic 100k-commit / 330-branch repo, reading the app log's
timings (`opened repo`, `refs read`, `labels computed`, `walk complete`, `slow status`).

- §A `reachers` merged-badge walk
- §A hunk / line diff rebuilds (discard twenty hunks one by one)
- §Q `status.rs` CLI fallback (status time at size; in §Q since 2026-09-28, and it stays there if measured fine)
- §A output dock scroll with a long op
- §M the ~4 s delay after an external 1800-file `git reset`
- §I E6 flat-directory tree build (CF:403), R13 `canSquash` per row (CF:428)
- §I `linked.rs:120` worktree / submodule snapshot with no cache (a repo with many worktrees)

Fix what crosses the threshold; close the rest as "measured, fine" with the numbers. **Threshold — proposal,
for the user to confirm:** ≥ 250 ms on a real action (the app's own `slow status` line uses 250 ms), or
visible scroll jank.

## Phase 4 — UI-vs-canvas pass (§B)

After Phases 2–3, so the UI is stable: CDP screenshots of the built app against the canvases; fix what differs
or update the canvas. **The reference** (settled by R1, `docs/archive/plans/2026-10-03-phase-4-plan.md`): Direction B
(`docs/design/canvases/direction-b/`) wins where it draws an element; `docs/design/canvases/screens/` is the
reference for the rest, content only.

## Linux track — from #18, on the Linux machine (§O, §P)

#18 came from a Linux session on Ubuntu 26.04 (native Wayland, and Xvfb through `docs/smoke/smoke-linux.md`), so
the Linux rows no longer wait on hardware. They run in that session, beside the Windows phases (the
CLI pin change, `release.yml` and `checks.yml` only, ran from Windows):
- **The restore hang (§O)** (`docs/plans/2026-09-26-linux-menu-focus-and-restore-plan.md`):
  - Phase A: diagnose on the native host with the fixed `killapp`; a 30-launch baseline, and no A/B unless A's
    review wants one (D-b).
  - Phase B: the fix. Verify with 0 hangs in 50 launches.
  - Then the AZ row 3 re-walks: Linux (T20) and Windows, which also answers §O's "whether it happens on Windows".
  - Then tick AZ 11 Linux (`smoke-test-post-v1.md:1889`) and move §O to the done file.
- **T7:** re-test WebDriver with two windows after Phase B.
- ~~**T5:** AT-SPI driving (`docs/archive/plans/2026-09-27-t5-atspi-plan.md`).~~ **done 2026-10-06**:
  `docs/smoke/atspi.py` and `smoke-linux.md`'s *AT-SPI: GTK's native parts* (open-items-done §P).
- ~~Phase 2a's Esc fix on WebKitGTK~~ **done 2026-10-06** (open-items §R): after Check now in Settings, record
  `activeElement` and whether Esc closes Settings; reopen the fix if it doesn't. Verified —
  `docs/archive/walks/2026-10-06-linux-track-c-d-walk.md` (C1).
- ~~Phase 2a's Super fix~~ **done 2026-10-06** (`11b5b42`): Meta+Q in a repo window and Meta+O on the start screen
  do nothing, over WebDriver on Xvfb; record `navigator.userAgent` (no `Mac`), since the unit tests only stub it.
  WebDriver's Meta+Q proved it; a real Super chord on Xvfb carries no `metaKey` (Xvfb's keymap puts `Meta_L` on
  mod1 with Alt), so it can't exercise the Meta path — accepted closed by the owner.
  `docs/archive/walks/2026-10-06-linux-track-c-d-walk.md` (C2).
- **#18's follow-up PRs, each planned:**
  - ssh fail-fast (`2026-09-27-ssh-fail-fast-plan.md`).
  - ~~The CLI-pin bump to 2.11.5~~ **done 2026-09-28**
    (`docs/archive/plans/2026-09-27-ssh-prompts-check-and-cli-pin-plan.md`, Part B). The first release after it
    unlocks `requireSignedVersion` (§Q; Phase 1b turns it on).
- **The AppImage release walks:** in the gate above.
- ~~Phase 2b's two Linux walks~~ **done 2026-10-06** (`open-items.md` §V, added 2026-10-01): row 3's unix
  tool-start walk, row 11's non-UTF-8 walk. Row 11 closed at a commit only, per the owner's ruling (the UI has no
  working-tree Files tab). `docs/archive/walks/2026-10-06-linux-track-c-d-walk.md` (D1, D2).

## Phase 5 — other hardware (§B, whenever available)

**Done 2026-10-04** on the owner's Mac — `docs/archive/plans/2026-10-04-phase-5-plan.md`, walk record
`docs/archive/walks/2026-10-04-phase-5-macos-walk.md` (smoke group BN, on the Mac, the Windows VM and the Linux VM). The
macOS update (0.10.12 → 0.10.17), macOS rendering and AZ 11's macOS line walked; T12 held on WebView2 too and was fixed
for every menu (D6); the Option type-ahead fixed; the `window.rs` ceiling accepted (D1, open-items §Q); five more fixes
found on the way (D7, D10, D11, T10/T11, T13). Triaged 2026-10-04; squashed and pushed the same day
(`a6a7a76..1e58f7c`); the Linux walk's X11 size fix followed (`4705c6c`). The bullets below are the plan as written,
with the line references refreshed.

**Shrunk by #18:** Linux has a machine now (the Linux track), real-Wayland rendering was walked 2026-09-27 (§B),
and AC's `.deb` is walked (the AppImage part is in the release gate; `.rpm` ruled covered). Left:
- macOS rendering;
- AZ 11's macOS line (`smoke-test-post-v1.md:1892`) and T12 (a clicked WebKit submenu may inherit the mark);
- the §I `window.rs:627` ceiling (tab adoption's pointer position: macOS and X11 could answer natively; Wayland
  cannot). The X11 half can now be tried on the Linux machine;
- open-items §R's Option-typed type-ahead (Phase 2a triage, 2026-09-29).

If no Mac is coming, decide whether CI's macOS leg is enough for the macOS rows, and close those on that.

## Phase 6 — 2026-12-23: `ubuntu-22.04` (§E)

Parked until then. One decision for all three t4 repos (`container: ubuntu:22.04` job or `cargo-zigbuild`);
check rustfmt is in the image if the Linux leg moves into a container. If Phase 1b has landed by then, its
AppImage tool pins are tied to the builder too — recheck them.

---

## Open decisions

1. ~~**§J** — palette prefixes and per-view sidebar state: build or drop. Before Phase 2.~~ Decided 2026-09-28:
   prefixes → §C roadmap, per-view sidebar → build in 2a.
2. ~~**Phase 3 threshold** — the 250 ms / visible-jank proposal. Before Phase 3.~~ Decided 2026-10-01 as proposed (the
   Phase 3 plan's T1).
3. ~~**Phase 4 reference** — which canvas set rules where they differ. Before Phase 4.~~ Decided 2026-10-03 as R1
   (the Phase 4 plan, `docs/archive/plans/2026-10-03-phase-4-plan.md`): Direction B wins where it draws an element;
   `screens/` counts for content only.
4. ~~**Hardware** — a Mac coming, or close Phase 5 on CI's macOS leg (Linux has a machine since #18). Before Phase 5.~~
   Answered 2026-10-04: a Mac is here, the owner's own; Phase 5 ran on it.
5. ~~**U1–U5**~~ — decided 2026-09-28 (`docs/archive/plans/2026-09-26-triage-plan.md`): U1 in 2a, U5 a version
   floor in 1b.
