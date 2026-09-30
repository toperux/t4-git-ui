# Plan: close-out Phase 1b — Windows code signing, the signing environment, `requireSignedVersion`, 2026-09-30

_Written 2026-09-30. Status: **done 2026-10-01** — O5–O8 done (dry run 36753506004 on `main` green), BJ 1–6
walked, records committed. Executed on `phase-1b` from 2026-09-30 (the owner's go); Steps 1–8 committed, BJ
1–4 walked, O1–O4 done (dry run 36674994686 green); change review pass 1 — no blockers, 3 should-fix, 8 nits,
folded in; R1–R3 ruled (records ship in the squash; the publisher-name fix needs no re-run, actionlint only; the
same fix committed in t4-markdown-viewer). Pass 2 — 2 should-fix, 5 nits, folded in; R4 ruled (a pre-squash →
squashed hash map in the records commit). Pass 3 — 3 doc nits, folded in. Pass 4 — clean. Triage T1–T10 ruled
(below); passes 5–7 on its fixes, the last clean. Squashed 2026-10-01 to 7 commits (rehearsed in a throwaway worktree,
tree identical); a post-squash review of the grouping and messages found 3 message nits, folded in, and T11
(accepted, closed). D1–D6 decided by the owner 2026-09-30, each as recommended (D1 re-confirmed after
pass 1 corrected its cost). Plan review: pass 1 — no blockers, 5 should-fix, 8 nits, folded in; D1 recheck and D6
ruled. Pass 2 — no blockers, 5 should-fix, 7 nits (one out of scope, taken: the skill's stale "no bypass"), folded in,
nothing for the owner. Pass 3 — no blockers, 6 should-fix, 10 nits, folded in, nothing for the owner. Pass 4 — 1 should-fix, 5 nits,
folded in, nothing for the owner. Pass 5 — 1 should-fix (Release never ran under SHA pinning before the tag), 1 nit,
folded in; D7 ruled._

**Goal:** from the release after v0.10.14 (Phase 2b's) on, every build that holds a signing key runs from `main` or a
`v*` tag (D3's temporary branch entries aside), only after the owner approves it, with every action, the Tauri CLI, the Windows signer and the AppImage tools
pinned (what stays unpinned: *Not in this phase*); the Windows installer and every exe in it
carry the Certum Authenticode signature; every updater `.sig` is proven against the file and its signed `version:`; and
the app refuses an update whose signature carries no version. Rows closed: open-items §B *Windows code signing*, §P
*Only the AppImage's updater `.sig` is verified in CI*, §Q *`requireSignedVersion` is off* (see D5). Close-out plan:
`docs/plans/2026-09-26-close-out-plan.md` › *Phase 1b*.

Sources: the user's `F:/src/_ pet projects/signing-and-repo-setup.md` (*doc §n* below) and its reference
implementation, `t4-markdown-viewer/.github/workflows/release.yml` (*ref:n*, read 2026-09-30). Line numbers here are
as of `ff79e41`. Branch: `phase-1b` off `main`, one commit per step while working, squashed at the end
(`CLAUDE.md` step 7).

## Where this repo stands against the doc (checked 2026-09-30)

| Doc item | This repo | This plan |
|---|---|---|
| 1a `signing` environment (main + `v*`, required reviewer) | none (`gh api …/environments` is empty) | O1 |
| 1b six secrets in the environment | four at repo level (`TAURI_SIGNING_PRIVATE_KEY`, `…_PASSWORD`, `APPLE_CERTIFICATE`, `…_PASSWORD`); no Certum secrets | O2, O8 |
| 1c workflow permissions read | **done** (`default_workflow_permissions: read`) | — |
| 1c SHA pinning required | off (`sha_pinning_required: false`) | O7 |
| 2a top-level `contents: read`, write only on `publish` | **done** (`release.yml:18`) | — |
| 2a `environment: signing` on `build` | no | Step 3 |
| 2b Dependabot `github-actions` entry (`ci` prefix) | **done** (`.github/dependabot.yml:4-15`) | — |
| 2b every `uses:` pinned | four unpinned: `checkout@v7` (`release.yml:30,116`, `checks.yml:31`), `setup-node@v7` (`release.yml:118`, `checks.yml:33`), `upload-artifact@v7` (`:397`), `download-artifact@v8` (`:410`) | Step 1 |
| 2b Tauri CLI from crates.io | `cargo binstall … 'tauri-cli@2.11.5'` (`release.yml:149-160`) | Step 2, D1 |
| 2b `ssign` pinned | no | Step 3 |
| 2b AppImage tool pins | no; `squashfs-tools` / `python3-cryptography` from apt unpinned (`:127-129`) | Steps 3, 4 (U5) |
| 2c build with no secrets, bundle with keys | one step, "Build the packages", holds the updater key (`:214-222`); the macOS import runs before it (`:184`) | Step 3 |
| 2d Windows Authenticode check | none (nothing to check yet) | Step 3 |
| 2d macOS signature check | **done** (`Verify the macOS signature`, `:293`) | — |
| 2d updater `.sig` checks | AppImage only (`:267-272`), no `version:` check | Step 5, D2 |
| 2e dispatch rehearses the publish | no: `publish` is tag-only (`:404`) | Step 6 |
| — `requireSignedVersion` | off (`tauri.conf.json:46-50`) | Step 7, D4 |

## Decisions (taken 2026-09-30: D1 (a), D2 (b), D3 the temporary branch entry, D4 (a), D5 both as written, D6 (a), D7 (a))

**D1. How the Tauri CLI gets onto the runner.** Today `cargo-binstall` fetches a prebuilt `cargo-tauri` binary (from
the tauri GitHub releases) on Windows and Linux, and builds from source on macOS, where no prebuilt matches. From Step
3 on, the CLI runs in the step that holds the updater key and, on Windows, the Certum login (`CERTUM_OTP` is the TOTP
seed: whoever has it can sign as the project until it is regenerated).
- **(a) Switch to `cargo install tauri-cli --version 2.11.5 --locked`**, as the reference (`ref:134-139`). Every crate
  comes from crates.io, checksum-checked against the CLI's own lock file. Cost: ~10 min per leg on a cold cache
  (the reference's figure, not measured here), and **in practice every tag run is cold** (pass 1, checked with
  `gh api …/actions/caches`): a run restores a cache only from its own ref or `main`, the `v0-rust-build-*` caches
  live on `refs/tags/v0.10.14` and `walk/0.10.12-3` only, and `main` has none. A Release dispatch on `main` within 7
  days of a tag would warm it (O8 is one). The legs run in parallel, so the cost is wall-clock on Windows and Linux
  (macOS already builds from source), plus `ssign`'s source build on Windows (Step 3). Drops the `cargo-binstall`
  action. `checks.yml`'s pin guard (`checks.yml:42-50`) reads the
  version from the new line instead.
- **(b) Keep binstall.** Faster cold runs. Whether binstall verifies the downloaded binary's signature for tauri-cli is
  **not checked**; the binary is built by tauri's release CI, not from the locked sources we would audit.
- **Recommendation: (a)** — the job now holds two keys, and the reference already runs it this way. Re-confirmed by
  the owner after pass 1 corrected the cache premise.

**D2. Where the Windows and macOS updater `.sig` files are proven.** The row (§P) says "run the script on those legs
too". The script needs Python's `cryptography`, which the Linux leg gets from apt. Windows would need
`pip install cryptography` from PyPI, and the macOS runner's Homebrew Python refuses a plain `pip install` (PEP 668),
so it needs a venv — two new unpinned downloads, one per leg, in jobs that later upload the artifacts.
- **(a) Per leg**, as the row says: pip on Windows, a venv on macOS; Linux as today.
- **(b) One new `verify` job** after `build`, with no secrets and read-only (runner: D6): it downloads the three
  `packages-*` artifacts, installs `python3-cryptography` from apt, and runs the script on all three `.sig` files
  with the version from the `version` job. `publish` needs it. The Linux leg's own verify step (`:267-272`) and its
  `python3-cryptography` go away (nothing else there imports it: `appimage-digest.py` uses `hashlib`, checked). U5's
  "cryptography imports" floor moves to this job.
- Either way the script fails unless the trusted comment carries `version:<the version job's output>`.
- **Recommendation: (b)** — one Python setup instead of three, no PyPI download, and the check sees the exact files
  `publish` ships (after staging and upload). It fails a little later than a per-leg check (after all three legs),
  still before anything is published.

**D3. Dispatch runs from a side branch.** Once `build` uses the `signing` environment, a dispatch from any branch but
`main` fails every build leg (by design: doc §1a). This matters twice:
- **This phase's first dry run.** Either push to `main` first and dry-run there (the doc's order; a failure means
  fix-forward commits on `main`, which can no longer be squashed), or add `phase-1b` to the environment's branch
  policy for the run, iterate on the branch, squash, push, then remove the entry.
- **Later walks** that need a CI-built package from a side branch (the 0.10.14 hotfix dispatched Release on
  `walk/0.10.12` for the VM): the same temporary entry, added and removed on the owner's word each time.
- **Recommendation: the temporary branch entry**, for this phase and as the rule in the `release` skill. It keeps
  `main` squashable; the second dry run (after the repo-level secrets are deleted, O8) runs on `main` anyway, so
  `main`'s own policy is still proven. Cost: two settings changes per use, each an outward action.

**D4. The local update test for `requireSignedVersion`.** The close-out plan says: a local build with it on, versioned
below the published release, updates to it through `throttle-proxy.mjs`. That proves the setting doesn't reject a good
update, but not that the app reads it: `plugins.updater` ignores an unknown key, so a misspelled
`requireSignedVersion` would pass that test and do nothing (serde has no `deny_unknown_fields` there; checked in
`tauri-plugin-updater` 2.12.0 `config.rs:152-175`).
- **(a) Positive and negative, one build.** The test build's `--config` points `endpoints` at
  `http://127.0.0.1:8765/latest.json` (with `dangerousInsecureTransportProtocol`, in the test config only). A local
  `python -m http.server` serves, first, a crafted manifest — `version` 0.10.14 with v0.10.12's setup URL and `.sig`
  (0.10.12 predates the CLI pin, so its signature carries no version; checked before the walk): the downgrade the
  setting exists to stop. Expected: download, then refusal with the plugin's `MissingSignedVersion` text, which names
  `requireSignedVersion` and is raised only when it is on (`updater.rs:1567-1575`); nothing installed. Then the
  verbatim published v0.10.14 `latest.json`: installs and restarts as 0.10.14. No proxy: its cut and failed-download
  cases were walked in Phase 1 and nothing here changes them.
- **(b) Positive only**, through the real endpoint and the proxy, as written.
- **Risk of (a):** if the setting did not work, the negative case would install 0.10.12 over the owner's 0.10.14. The
  positive case right after reinstalls 0.10.14, and the store folder is backed up first. The installed app is the
  owner's own (a local build's updater runs the published setup into the same per-user folder, as in Phase 1).
- **Recommendation: (a).**

**D5. The rows this phase closes, and one new reminder.**
- §B *Windows code signing*, §P *only the AppImage's `.sig` is verified*, and §Q *`requireSignedVersion` is off* move
  to `open-items-done.md` (§B, §P, §Q) once O8's dry run is green and BJ is walked. The first real proof of each is
  2b's release and its gate; the close-out plan's gate section carries those checks (Step 8).
- The Certum certificate expires **2027-09-22**; after that every Release run fails on Windows — most likely at
  *Bundle and sign*, since Certum's service won't sign with an expired certificate, else at *Check the Windows
  signature* (already-signed releases stay valid: the signatures are timestamped). A dated row in open-items §E (the section that
  holds the other dated item, ubuntu-22.04), header reworded to "dated decisions": renew by 2027-08-22, then update the
  thumbprint in `release.yml`.
- **Recommendation:** both as written. The alternative is to keep the three rows open until 2b's gate.
  `open-items-done.md` has no §Q yet; the move creates it (the §Q rule in open-items names it).

**D6. The `verify` job's runner** (raised in pass 1). `ubuntu-22.04` is retired 2027-03 (open-items §E); this job has
no glibc reason to be on it. **(a) `ubuntu-latest`**: no tie to the retirement; its Python and `cryptography` differ
from 22.04's (the script uses only the stdlib and Ed25519; the first dry run proves it). (b) `ubuntu-22.04`: the
versions the script has run on, one more job to move in 2027. **Recommendation: (a).**

**D7. Proving Release under SHA pinning** (raised in pass 5). With pinning turned on last and proven by a
CI run only, `release.yml` would first run pinned on 2b's tag; one `uses:` left on a tag (the new `verify` job's, say)
fails it at *Set up job* after the tag is public. **(a)** Turn pinning on before the dry run on `main`, so that one run
proves the environment-only secrets and the pinning together (no extra run; a red run's cause can be either, and the
"if red" path covers both). (b) Keep the order and add a Release dispatch on `main` after pinning (one more approval
and ~30 min). Either way a local check reads every `uses:` in `.github/workflows/*.yml` as `./…` or a 40-hex SHA.
**Recommendation: (a).**

## Steps (on `phase-1b`)

### Step 1 — pin every action by commit (doc §2b)

In `release.yml` and `checks.yml` (`ci.yml` only calls `checks.yml`):
- `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`
- `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0`
- `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1`
- `actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1`

The three from the reference are in use there; all four resolve to commits and are each action's latest release
(checked 2026-09-30).
Before committing, re-resolve all four (`gh api repos/<action>/git/ref/tags/<tag>`, dereferencing an annotated tag) and
take a newer release tag if one is out. The comment at `release.yml:131-133` becomes "every action, GitHub's own
included"; `checks.yml:59-60` says the same.

### Step 2 — the Tauri CLI (D1)

The `cargo-binstall` action and *Install the Tauri CLI* (`release.yml:149-160`) become one step,
`cargo install tauri-cli --version 2.11.5 --locked`, with the reference's comment (`ref:135-138`), its "a no-op until
the toolchain or this version changes" reworded to "a no-op only on a warm cache (rust-cache keeps `~/.cargo/bin`),
which a tag run rarely has" (D1), plus ours: pinned to match `@tauri-apps/cli` in
`package-lock.json`, bump both together. `checks.yml:47-50` reads
`grep -oP 'cargo install tauri-cli --version \K\S+'` and names the new line in its error. tauri-cli 2.11.5's own
`Cargo.lock` locks `tauri-bundler` 2.9.4, which Step 3's tool pins assume (checked in pass 1).

### Step 3 — the environment, the build/bundle split, Windows signing, the AppImage tool pins (doc §2a, §2b, §2c, §2d)

`build` gains `environment: signing` with the reference's comment (`ref:85-90`). The steps become, in order (unchanged
ones in *italics*):
1. *checkout, setup-node, Linux build dependencies (+ Step 4), rust-toolchain, Apple targets, rust-cache, npm ci*,
   the CLI (Step 2), *Clear stale bundle output*.
2. **Set up Windows code signing** — `ref:149-186` verbatim: `ssign` from `Le-Syl21/ssign` at
   `585a88e77443f1cbac7fc63b87155982139208b6`, the `sign.ps1` wrapper, `SIGNING_ARGS` with `--config signing.json`.
3. **Build the app** — `cargo tauri build --no-bundle <target> -- --locked`, **no secrets in env**, from the repo root
   as today (the CLI finds `src-tauri/`; the reference's `working-directory: src-tauri` is its layout, not ours). The
   reference's comment (`ref:188-190`: every build script and proc-macro runs here; defence in depth, not a boundary)
   comes along.
4. **Pin the AppImage tools** (Linux) — `ref:198-226`, its comment's "(tauri-cli 2.11.4)" (`ref:203`) made "2.11.5"
   (same bundler, 2.9.4). Pass 1 checked it: tauri-bundler 2.9.4 fetches the
   five tool names (`linuxdeploy.rs:223-264`) and skips any already in `~/.cache/tauri`; all six URLs downloaded and
   matched their sha256. `LDAI_RUNTIME_FILE` fixes the runtime at type2-runtime `20251108`; today appimagetool takes
   `continuous`'s head, and the pinned `linuxdeploy-plugin-appimage` may differ from `continuous` too. The repack
   keeps whatever runtime the image has (`appimage-strip.sh:61`), so the shipped runtime changes once, here: O4
   checks it, and 2b's AppImage walk runs it.
5. **Import the macOS signing certificate** — moved here, after the compile, body unchanged (`:184-204`); its comment
   gains the reference's "after the compile, so no build script or proc-macro finds the certificate in an unlocked
   keychain" (`ref:232-234`).
6. **Bundle and sign** — replaces *Build the packages* (`:214-222`): `shell: bash` (today's step has none, so it runs
   under pwsh on Windows; `tee`, `$RUNNER_TEMP` and pipefail need bash, which Actions runs as `bash -eo pipefail`, so
   a failed bundle still fails the step through `tee`), no `working-directory` (the reference's `src-tauri` is its
   layout). `cargo tauri bundle --bundles … <target> ${{ env.SIGNING_ARGS }}` (empty off Windows), teed to a log; on
   Linux it fails if the log says `Downloading` (`ref:259-288`). Env: the updater key pair, `APPLE_SIGNING_IDENTITY`,
   and `CERTUM_EMAIL` / `CERTUM_OTP` gated to Windows (`runner.os == 'Windows' && secrets.X || ''`).
   The comment block above today's import (`:169-183`) splits: the repo-root / `--` lines go to *Build the app*; the
   pubkey-abort lines to this step; the `APPLE_CERTIFICATE` importer lines stay with the import. The comment at
   `:206-213` (why macOS signs; `APPLE_CERTIFICATE` must not be set) goes to this step.
7. **Check the Windows signature** — `ref:290-323`: 7-Zip unpacks the installer; the installer and every exe inside must
   be `Valid`, timestamped, thumbprint `F06C1EC1FAC43DFEC92FBE47B0FC959D1CE38151`. Paths from our `bundle_dir` (repo
   root, no `working-directory`).
8. *Remove libwayland-client, Re-sign the AppImage, Verify the macOS signature, Stage, upload-artifact* — unchanged
   but for comments: the repack's "keep the verify step" (`:229-230`, Step 5) and the re-sign's "from 2.11.5,
   `tauri build` binds the version" (`:250`), which becomes `tauri bundle`; *Verify the AppImage's updater signature*
   goes (Step 5). `appimage-strip.sh:14`'s "after `cargo tauri build`" becomes `cargo tauri bundle`.

### Step 4 — version floors for the repack's apt tools (triage U5)

In *Linux build dependencies*, right after the install: fail with a clear message unless
`dpkg --compare-versions "$(dpkg-query -W -f='${Version}' squashfs-tools)" ge 1:4.5` (epoch 1, so a bare `4.5` always
passes). `python3-cryptography` leaves this step (D2); its `import cryptography` check goes to the `verify` job.

### Step 5 — the updater `.sig` proofs (doc §2d, §P row, D2)

`verify-updater-sig.py` takes a fourth argument, the expected version, and after the two signature checks fails unless
the trusted comment's tab-separated fields include `version:<that>` (the same parse as the plugin, `updater.rs:1600`),
naming what it found. Usage line and docstring updated, including `:11-12` ("not packaged for ubuntu-22.04 … Python
3.10"), which describe the runner the script leaves (D6).

A `verify` job (D2) — `needs: [version, build]`, `ubuntu-latest` (D6), `permissions: contents: read`, no
environment: checkout (for the script and the pubkey) and `download-artifact` of `packages-*` merged into `dist/`,
both at Step 1's pinned SHAs,
`sudo apt-get update` then `sudo apt-get install -y python3-cryptography` + the import check, then the script on
`T4-Git-UI_<ver>_x64-setup.exe`, `_universal.app.tar.gz`, `_x86_64.AppImage`. The Linux leg's verify step goes;
`publish` gains `verify` in `needs`. The repack's comment "keep the verify step, which costs nothing"
(`release.yml:229-230`) is reworded to name the `verify` job.

**Check locally before committing** (WSL, which has `python3-cryptography`, or a scratch venv): the script against the
published v0.10.14 AppImage and `.sig` with `0.10.14` → OK; with `0.10.13` → fails on the version; v0.10.12's with
`0.10.12` → fails, no `version:`.

### Step 6 — dispatch rehearses the publish (doc §2e)

`publish` takes the reference's `if` (`ref:436-441`, plus `needs.verify.result == 'success'`), and the
release step gains `draft`, `tag_name`, `target_commitish` for a dispatch (`ref:543-545`) and `name`
`Dry run — T4 Git UI v<ver>` on one. Ours keeps `generate_release_notes` and the fixed body. Then *Check and delete the
dry-run draft* (`ref:549-584`) verbatim. The header comment (`release.yml:3-6`) and the `checks` job's comment
(`:77-85`) say a dispatch now makes a draft and deletes it.

### Step 7 — `requireSignedVersion`, and the words about signing

- `tauri.conf.json` `plugins.updater` gains `"requireSignedVersion": true`.
- The release body's Windows paragraph (`release.yml:475-476`) and README *Install* (`README.md:34`): signed with a
  Certum Open Source certificate, publisher "Open Source Developer Christopher Montevirgen" (the CN, no comma —
  change review pass 1); SmartScreen can still
  warn while the certificate builds a download reputation (**More info** → **Run anyway**); v0.10.14 and earlier are
  unsigned. (The t4-markdown-viewer README's wording, adapted.)

### Step 8 — docs

Two commits' worth. **In the `phase-1b` squash** (so `main` never carries a skill that contradicts its workflow): the
`release` skill, `smoke-linux.md`, README and release body (Step 7), the BJ group's text, the close-out plan's gate
wording and its Phase 1b paragraph on the update test (`close-out:118-122`, superseded by D4 (a)), the open-items §P
pin-row addition, the §E Certum row and header, and (R1, change review pass 1) the walk record and BJ ticks as they
stand at the squash. **In the records commit after O8:** BJ rows 5–6, D5's row moves, the close-out status line and
*Order* item 4. Memory (outside the repo) is updated alongside.

**Squash shape** (change review passes 1–3): Steps 4 and 5 become one commit — Step 4 alone drops `python3-cryptography`
while the old Linux verify step still needs it; the README and release-body text about Windows signing move from
Step 7's `fix:` commit (and its message's second paragraph) into Step 3's signing commit; the docs land as one
`docs:` commit. The review fixup commits split the same way: a `release.yml` comment hunk to Step 2, the body text
and README to Step 3, the rest to the docs commit. The walk record and BJ 1 cite pre-squash hashes; the records
commit after O8 adds a "pre-squash `x` = squashed `y`" map to the walk record (R4, as open-items-done §N did).
Messages rewritten at the squash: Step 6's says `publish`'s `if` requires `verify` to have succeeded (the `needs`
entry came with Step 5); the docs commit's names the walk record, BJ 1–4 walked, and the plan's edits.

- **`release` skill:** the intro and *What a release does not do* (Windows is signed now); *Signing* (the six
  secrets live in the `signing` environment; the Certum pair and `ssign`; the key steps; a build step with no secrets;
  *Build the packages* at `:34` and `:39` becomes *Bundle and sign*); *When it goes wrong*'s import bullet
  (`:126-127`: "before anything is built" — the import now runs after the compile, before the bundle);
  step 5 (**every Release run waits for approval** — *Actions › the run › Review deployments*, one approval for the
  three legs (t4-markdown-viewer's runs 36391238373 and 36263384387 each show one approval covering all three; O4
  records ours); nine jobs with `verify`; the CLI and `ssign`
  install from source on a cold cache, ~10 min more — no "Installed package" line to expect on a warm one); *Checking the packaging without spending a version* (a dispatch now rehearses the publish with a draft it
  deletes; it runs from `main` only, or from a branch added to the environment for the run — D3); *When it goes
  wrong*: *Set up Windows code signing* / *Bundle and sign* failing on the Windows sign, *Check the Windows signature*,
  *Pin the AppImage tools* or a `Downloading` line, `verify` failing on a missing or wrong `version:` (it replaces the
  *Verify the AppImage's updater signature* bullet, `SKILL.md:135-138`, and the repack bullet's "keep the verify step",
  `:134`), a dry-run draft or `dry-run-*` tag left behind. Any `.sig` made by hand must pass `--app-version`: with
  `requireSignedVersion` on, a version-less one is refused. The paragraph at `:46-50` ("never been proven on a real
  run … builds all three platforms without publishing") is rewritten with *Checking the packaging*; "No draft" (`:155`) gains "except a dispatch's rehearsal"; step 7's "SmartScreen / Gatekeeper warnings"
  (`:105-106`) follows the new body text. Out of scope but in the same file (pass 2): `:117-118` says *Protect release
  tags* has "no bypass", but the ruleset now has an admin bypass (`actor_id 5, bypass_mode always`); reword.
- **`docs/smoke/smoke-linux.md`** `:179` and `:260-264` tell the walker to dispatch Release on a throwaway branch and
  take its `packages-Linux` artifact. They gain: add the branch to the `signing` environment for the run and remove it
  after (D3, each on the owner's word), approve the run, and the dispatch makes and deletes a draft. `:262`'s
  `release.yml:60-74` citation is refreshed. `:206`'s three-argument `verify-updater-sig.py` call gains the version.
- **open-items §E** (`:84`) cites `release.yml:111` for the matrix's `ubuntu-22.04` line, which Step 3's
  `environment:` block pushes down; refreshed with the §E edits of D5.
- **open-items §P, the tauri-cli 2.12 pin row** (`:319-328`): a CLI bump also re-derives the AppImage tool names and
  hashes if the bundler version moves (`ref:202-205`).
- **Smoke group BJ** in `docs/smoke/smoke-test-post-v1.md`: the D4 update test, the dry-run log checks (O4, O8), and a
  hand look at the dry run's setup (*Properties › Digital Signatures* names Certum's "Open Source Developer Christopher Montevirgen").
- **Close-out plan:** status line, *Order* item 4 done; the release gate's 2b paragraph gains: approve the run under
  *Review deployments*; after the update, `Get-AuthenticodeSignature` on the installed exe shows the Certum thumbprint;
  and (already there) the update from 2b's release to the next is `requireSignedVersion`'s first real check.
- **open-items / done file:** per D5.
- Walk record `docs/archive/walks/2026-09-30-phase-1b-walk.md` (BJ, both dry runs).

## Local checks (before the change review loop)

- Gates, as the `release` skill's step 1 (npm with an uppercase `F:/`).
- `checks.yml`'s pin guard run by hand (its `grep` on the new `release.yml` line and the `package-lock.json`
  comparison): `checks.yml` itself first runs in O4's CI dispatch, and must not first run on `main`.
- `actionlint` over the three workflows (its release binary, run from the scratchpad): it catches a wrong
  `needs.verify` reference or expression, which a YAML parse does not.
- Every `uses:` in `.github/workflows/*.yml` is `./…` or `@<40 hex>`:
  `grep -nP 'uses:\s*+(?!\./)(?!\S+@[0-9a-f]{40}\b)' .github/workflows/*.yml` prints nothing (WSL grep or Python;
  the possessive `\s*+` matters — with `\s*` the lookaheads see a space and every line matches, and Git Bash's grep
  3.0 gets `-P` lookaheads wrong either way), so O7's pinning cannot fail a workflow that never ran under it (D7).
- Step 5's script check.
- **Group BJ, the update test (D4).** Back up `%APPDATA%\dev.topher.t4gitui` (the store) while the app is open, then
  ask the owner to close it; then, before the build, back up `%LOCALAPPDATA%\dev.topher.t4gitui` (the WebView2
  profile: theme, message history, palette — at risk only if a wrongly installed 0.10.12 starts in it; a running app
  holds its lock files, so it is copied closed). A `tauri build --no-bundle` of `phase-1b`, run from an uppercase `F:/` (the build runs vite), with
  `--config <file>` — a file in the scratchpad, as in Phase 1, holding `{"version":"0.10.13", "plugins":{"updater":
  {"endpoints":["http://127.0.0.1:8765/latest.json"], "dangerousInsecureTransportProtocol":true}}}` (the CLI
  deep-merges it, so `pubkey`, `installMode` and `requireSignedVersion` stay). Start
  `python -m http.server 8765 --bind 127.0.0.1` in a scratch folder **before** the launch (the launch check hits the
  endpoint). The served `latest.json`: for the negative case, v0.10.12's (`gh release download v0.10.12 -p
  latest.json`) with `version` set to `0.10.14`; for the positive case, v0.10.14's, copied over it between the two.
  Then launch with `smoke-launch.ps1` (no `-Proxy`: it sets `HTTP_PROXY` too, and the CONNECT-only proxy
  would drop the plain-HTTP endpoint). Negative, then positive, as D4 (a). The app shows the plugin's error text as is
  (`src-tauri/src/commands/update.rs:107-114` rewords only network errors; Install re-runs the check, so swapping the
  file between the cases takes effect). Record the error text, the pids, and the installed exe's file
  version after each. The positive case restarts the installed 0.10.14, which then holds the store: close every
  window of it before restoring both folders, then compare.

## Outward actions — each on the owner's word at that moment

In order; the commands are the doc's (§1, §3) with `R=toperux/t4-git-ui`.
- **O1** Create the `signing` environment: the doc's `PUT` (required reviewer the owner, *Prevent self-review* off,
  `custom_branch_policies: true`), then one
  `gh api -X POST repos/$R/environments/signing/deployment-branch-policies -f name=<n> -f type=<branch|tag>` each for
  branch `main`, tag `v*` and, for now, branch `phase-1b` (D3). Check with the doc's two `gh api` reads (the policy
  list shows `branch phase-1b` too while it is there).
- **O2** The six secrets into the environment: the four file-backed ones piped with `tr -d '\r\n'`
  (`~/.tauri/t4-git-ui.key`, `~/.tauri/t4-git-ui.key.password`, and the `.t4-signing` pair); `CERTUM_EMAIL` / `CERTUM_OTP` typed by the owner — a PowerShell
  command is given for those two, since `gh secret set` prompts. `gh secret list --env signing` shows six.
- **O3** Push `phase-1b` (not `main`).
- **O4** Clear any `v0-rust-build` caches, dispatch Release on `phase-1b`, the owner approves; also dispatch CI on
  `phase-1b` (`gh workflow run CI --ref phase-1b`; CI uses no environment), so `checks.yml`'s pins and guard run before
  `main`. The doc's §3 step 2 list, adapted: the six `OK`s, ``Installed package `tauri-cli v2.11.5` `` ×3 (cargo
  quotes the name in backticks; grep `Installed package .tauri-cli v2.11.5`), ``Installed package `ssign …` `` on
  Windows, no `Downloading`, three `Valid | … |
  F06C…8151`, the macOS check, `verify` OK ×3 with `version:`, draft made and deleted, no `dry-run-*` tag. Plus the
  runtime pin, which no log shows (`ref:204-205`): the run's AppImage, downloaded into WSL, reports type2-runtime
  `20251108` (`dd6cebe`) under `--appimage-version`. Also record how many approvals the run took. A red leg → fix on
  the branch, push it again (an O3 repeat, its own go), dispatch again. A re-run restores the cache of every leg that passed
  (rust-cache saves only on success), so those print ``Ignored package … is already installed`` instead: clear the
  caches first when the cold path has to be shown again.
- Then the change review loop, triage, and the rehearsed squash (`CLAUDE.md` steps 5–7). A fix that touches a workflow
  gets another O3 push and O4 run, each on the owner's word.
- **O5** Push `main` (fast-forward to the squashed branch); its CI green on all three OS.
- **O6** Remove `phase-1b` from the environment: its id from
  `gh api repos/$R/environments/signing/deployment-branch-policies`, then
  `gh api -X DELETE repos/$R/environments/signing/deployment-branch-policies/<id>`; delete the remote branch.
- **O7** Turn on *Require actions to be pinned to a full-length commit SHA*:
  `gh api -X PUT repos/$R/actions/permissions -F enabled=true -f allowed_actions=all -F sha_pinning_required=true`
  (the repo's current `enabled` / `allowed_actions` kept; `=false` turns it off again); check with the doc's read;
  dispatch CI on `main`; green.
- **O8** Delete the four repo-level secrets; dispatch Release on `main`; the owner approves; the O4 list again. This
  run proves the environment alone is enough **and** that Release runs under pinning (D7) — before that, no Release
  ever did.
- **If O7 or O8 goes red** (`main` is pushed by then, so nothing can be squashed): a settings or secret cause (a
  misnamed environment secret, a policy, the pinning setting — which can go off again while a fix is made) is fixed in
  place and the run repeated; a workflow cause goes through D3's path — a fix branch added to the environment for its
  run, then a fast-forward push of `main` — each step on the owner's word. No tag until O8 is green.
- Then the records (Step 8) as one docs commit, pushed on the owner's word.

## Triage (2026-10-01, after change review pass 4)

Every item a reviewer waved off, ruled by the owner; the accepted-closed ones go to `open-items-done.md` in the
records commit.
- **T1** `signing` environment `can_admins_bypass: true` (the owner is the only admin and reviewer) — accepted, closed.
- **T2** the `v*` tag policy is untested until 2b's tag, no skill bullet — **fixed**: a *When it goes wrong* bullet.
- **T3** still unpinned: `toolchain: stable`, apt (only the `squashfs-tools` floor), the NSIS zip and
  `nsis_tauri_utils.dll` fetched on Windows with the keys in env — accepted with a trigger → open-items §Q.
- **T4** `ssign`'s ~30 min session token on the runner's disk; `verify`'s repeated `permissions`; the near no-op
  `apt-get install python3-cryptography` on ubuntu-latest — accepted, closed.
- **T5** `verify` stops at the first bad `.sig` — accepted, closed.
- **T6** between O5 and O8 the skill's "not at repo level" is untrue, and `phase-1b` stays in the policy until O6 —
  accepted, closed (temporary, tracked in O6/O8).
- **T7** the stale macOS sentence "the first signed release resets those grants once" (release body, README) —
  **fixed**, dropped.
- **T8** by design: `requireSignedVersion` refuses pre-0.10.13 manifests in future walks; a wrong argc to the script
  prints a traceback; the script compares versions literally where the plugin uses semver; README › *Updating* doesn't
  mention the version-bound refusal — accepted, closed.
- **T9** cosmetic: the plan's Step 8 draft wording of the skill's step 5; long plan lines; one long walk-record line;
  rounded vs exact leg times in walk row 4; the close-out Phase 1b table as a snapshot — accepted, closed.
- **T10** t4-markdown-viewer's README comma, committed there as `f5f998e` — pushed later, on the owner's word.
- **T11** (post-squash review) `90a0a71`'s `verify`-job comment speaks of `requireSignedVersion` as on, though
  `f27dfef` turns it on; they shipped in one push — accepted, closed.

## Not in this phase

- The first signed release is 2b's, through the `release` skill, on the owner's word.
- The release notes stay as they are (the reference builds its own from `git log`; ours uses GitHub's generator plus
  the fixed body).
- macOS notarization (§Q, won't do for now).
- **Still unpinned after this phase**: `toolchain: stable`; the apt packages (`squashfs-tools` floor only, U5); the
  NSIS zip and `nsis_tauri_utils.dll` the bundler downloads on Windows (hash-checked). Triage T3, 2026-10-01: accepted
  with a trigger → open-items §Q.
- The doc's optional Linux package checks (install the `.deb`, `desktop-file-validate`, the MIME registrations,
  `--appimage-extract` against `THIRD-PARTY-LICENSES`) are left out: the `.deb` and `.rpm` don't change here, and the
  pinned AppImage tools are exercised by 2b's AppImage release walk.
