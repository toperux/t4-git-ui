# Plan: bring the close-out plan up to date with the repo, 2026-09-28

_Written 2026-09-28. Status: executed 2026-09-28 (plan review: pass 1: 8 findings, decisions D1–D3; pass 2:
5 findings, decision D4; pass 3: 1 nit, decision D5; pass 4: 1 nit; pass 5 clean)._

**Goal:** `docs/plans/2026-09-26-close-out-plan.md` says where things stand today, the order the phases run in,
and how each phase runs under `CLAUDE.md`. Most of it is current (the §Q change of 2026-09-28, `430b6da`, updated
it); this touches what is stale, plus where `requireSignedVersion` lands (D2).

## Changes to the close-out plan

1. **Status line (`:12-18`).** Rewrite it as of 2026-09-28:
   - Phase 0 done 2026-09-26 (`59e9383`); Phase 1 done 2026-09-26 (plan and walk record as now);
   - PR #18 merged 2026-09-27 (`5cc5de9`), its rows scheduled below (as now);
   - triage done 2026-09-28 (as now);
   - **the CLI pin change done 2026-09-28** (`ee59475`: tauri-cli 2.11.5, `--app-version` on the AppImage re-sign,
     the pin guard in `checks.yml`), verified by CI run 36391087334 and the `workflow_dispatch` run 36391567783
     (every `.sig` ends in `version:0.10.12`), recorded in `fda5293`;
   - **`CLAUDE.md`'s workflow and open-items §Q** since 2026-09-28 (`430b6da`); every phase, and each row picked up
     outside one, follows `CLAUDE.md`;
   - **next: the §J decision, then Phase 2a** (see *Order*); open decisions as now.
   - "Phase 1b or 2a next" goes.
2. **A new *Order* section**, after the status block and before Phase 0, recording the sequence agreed with the
   user on 2026-09-28:
   1. §J decision (it decides which rows 2a and 2b carry).
   2. Phase 2a, then a release and the gate: the first release with version-bound signatures, and the first
      AppImage release walk (with U4).
   3. Phase 1b (signing, and turning on `requireSignedVersion` with its local update test, D2 + D4). After 2a, so
      2a's known fixes don't wait on the signing setup (D1).
   4. Phase 2b, then a release: the first signed one, and the first with `requireSignedVersion` on; its update walk
      proves the signed pipeline end to end, and it is the second AppImage walk (then AC ticks). The setting's first
      real check is the update from 2b's release to the next.
   5. Phase 3 (threshold decision first).
   6. Phase 4 (reference decision first).
   7. Phase 5 (hardware decision first), or earlier, when the hardware is there.
   8. Phase 6, on 2026-12-23.
   - In parallel, on the Linux machine: the Linux track (the restore hang's Phase A/B, T20, T7, the ssh fail-fast PR,
     T5).
   - `:150-151`'s "Phase 1b does **not** gate Phase 2" stays true; the section only fixes the order chosen.
3. **How each phase runs (`:148-149`).** "Per part: gates green, one smoke group over CDP, squash, then a release
   through the `release` skill on the user's request, then the release gate above." becomes: "Each part runs under
   `CLAUDE.md`'s workflow: its own plan and plan review loop, the user's go, the change committed locally (gates
   green, one smoke group over CDP), the change review loop and triage, then the squash, rehearsed in a throwaway
   worktree with the final tree checked identical. The push and the release (through the `release` skill) each wait
   on the user's word; then the release gate above."
4. **`requireSignedVersion` in Phase 1b (D2, D4, D5).**
   - After the `release` skill paragraph (`:74-76`), Phase 1b gains: "Turn on `requireSignedVersion` in
     `tauri.conf.json` (open-items §Q). It ships in the release after 1b (2b's, per *Order*) and acts from the update
     after that, since the setting works in the app that ships it. Before it ships, test it (D4): a local build with
     it on, versioned below the published 2a release, updates to that release through
     `docs/smoke/fixtures/throttle-proxy.mjs`, as in Phase 1's updater walk. Its first real check is the update from
     2b's release to the next."
   - The release gate's "**After that first release, turn on `requireSignedVersion`** (open-items §Q, …): its
     precondition then holds." (`:105-107`) becomes: "After that first release, `requireSignedVersion`'s precondition
     holds (open-items §Q, *`requireSignedVersion` is off*); Phase 1b turns it on."
   - Phase 1b's row 2d (`:68`), after "(§P's row)", gains: "; and the script fails unless
     each `.sig`'s trusted comment carries `version:<the release's version>` (the `version` job's output), on every
     leg (D5)".
   - The Linux track's "(§Q; the release gate above says so)" (`:193`) becomes "(§Q; Phase 1b turns it on)", and
     `:192-193` are re-wrapped to 120 columns.
5. **Phase 1's AJ note (`:37`, D3):** "AJ's box is now at `:1256`" → `:1272` (Remove from list; `:1256` is AJ's
   Dismiss box).
6. **The Linux track (`:180`):** drop "Proposed:" (the *Order* records it as agreed); the restore-hang bullet
   (`:182-187`) cites its plan, `docs/plans/2026-09-26-linux-menu-focus-and-restore-plan.md`.

## Other files

7. **`open-items.md`:**
   - §Q's `requireSignedVersion` entry: "Decided 2026-09-27 to track, not schedule." becomes "Tracked from
     2026-09-27; scheduled 2026-09-28.", and "Then set it in `tauri.conf.json`; the close-out plan's release gate
     says so." becomes "Then set it in `tauri.conf.json`: scheduled in close-out Phase 1b (2026-09-28)."
   - §P's row *Only the AppImage's updater `.sig` is verified in CI* (`:391-394`): after "run
     `.github/scripts/verify-updater-sig.py` on those legs too", add "and make it check the signed `version:` on
     every leg (D5)".
   - The header (`:6-7`): "three of them are also in a close-out phase" → "four" (`status.rs`: Phase 3; Q23:
     Phase 2; the detached-HEAD dialogs: 2a; `requireSignedVersion`: 1b).
8. **Archive the executed wording plan:** `git mv docs/plans/2026-09-28-claude-md-wording-plan.md
   docs/archive/plans/`, and update its one live reference, `open-items.md:425` (§Q's *Added* line), to the archived
   path. Its status already says executed.
9. **Archive this plan too, last** (R1): its status set to executed, then `git mv` into `docs/archive/plans/`, in
   the same commit. Nothing links to it today.

## Not changed

The phases' row contents, the Phase 1b table (except change 4's row 2d addition), the Phase 2 table, §Q's
rules, and the open decisions: current as of `430b6da`, checked in review pass 1.

## Decisions (the user, 2026-09-28)

- **R1:** this plan archives itself once executed, as the triage plan did.
- **D1:** keep the order; 1b after 2a so 2a's fixes don't wait on signing. No signing-only release: 2b's release
  and its update walk prove the signed pipeline.
- **D2:** `requireSignedVersion` is turned on in Phase 1b; the §Q entry says so.
- **D3:** the Phase 1 AJ note is corrected to `:1272`.
- **D4:** `requireSignedVersion` is tested before it ships: in Phase 1b, a local build with it on updates to the
  published 2a release through `throttle-proxy.mjs`. It proves the accept path only; the reject path is the
  updater's own unit tests.
- **D5:** Phase 1b's row 2d also makes `verify-updater-sig.py` fail unless each `.sig` carries the release's
  `version:`, so a 1b pipeline change that drops it fails the dry run instead of stranding 2b's installs.

## Verify

- The status line and *Order* agree with each other and with the sections they name; "Phase 1b or 2a next" is gone.
- `requireSignedVersion`: Phase 1b, *Order*, the release gate, the Linux track and §Q all say Phase 1b; row 2d
  and §P's `.sig` row both carry D5's version check; open-items' header count matches the entries that name a
  close-out phase.
- `git grep` for `2026-09-28-claude-md-wording-plan` and `2026-09-28-close-out-refresh-plan` finds only archived
  paths (outside `docs/archive/walks`).
- No added or changed line over 120 characters (table rows excepted).

## How it runs

1. On the user's go: the edits, committed locally on `main`.
2. Change review loop; triage anything skipped or proposed for acceptance.
3. Squash with this plan's commits, rehearsed in a throwaway worktree.
4. Ask before pushing.
