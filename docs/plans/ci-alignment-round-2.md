# CI/CD alignment, round 2 — t4-git-ui

## Context

This repo is one of three t4 projects (with `t4-claude-session-browser` and
`t4-markdown-viewer`) whose GitHub Actions workflows are kept to a single shared shape. Round 1
landed here in commits `93a6f7b`, `6e8c316` and `d1095d7`; `docs/plans/ci-alignment.md` is its
record and stays as-is.

Round 1 worked, but each of the three repos was executed by someone who could not see the other
two, and all three independently patched the same gap — Dependabot PRs arriving with no checks
— in three incompatible ways. Round 2 removes that drift.

**This repo's round-1 argument for dropping Dependabot won.** It is now D10 below and is being
applied to all three: csb and mdv delete their `dependabot.yml` and unwind the trigger
workarounds they built for it. Two consequences for this repo specifically:

- The `checkout@v5` / `setup-node@v5` hold-back — "so all three repos stay on one shape;
  dependabot will propose those bumps together" — no longer has either premise. The other two
  went to `checkout@v7`, and there is no dependabot to propose anything. Bump by hand (D14).
- The security-alerts finding (alerts were **off** on `toperux/t4-git-ui`, checked 2026-09-03)
  is now an action item in all three repos, not just this one.

**git-ui-specific:** Tauri 2 with an npm/vite/TypeScript frontend, laid out as a cargo
workspace (`crates/git-core`, `src-tauri`), version in the root `Cargo.toml` under
`[workspace.package]`. No in-app updater. **Its release workflow has still never run** —
verification was blocked on 2026-09-03 by GitHub refusing to start jobs on the account — so
section 8 carries round 1's unproven items forward.

Principles:

1. **Surgical.** Every changed line traces to a checklist item below.
2. **Do not invent improvements.** If you find something worth changing that is not in this
   plan, do not apply it — write it under *Deviations and findings* at the bottom. Round 1
   drifted precisely because good local judgment was applied in three places at once. This
   repo's own dependabot finding is the proof it works: it was written down, and it became the
   shared decision. A finding recorded there gets picked up by the next master pass.

## Round 2 decisions (shared across all three repos)

| # | Decision | Resolution | Applies here |
| --- | --- | --- | --- |
| D10 | Dependabot | **Drop it everywhere** — this repo's round-1 argument, now shared. Its only output is PRs; no repo runs anything on `pull_request`. What matters is **security alerts**, a repo setting. | yes — no `dependabot.yml` to delete; the **alerts** action item stands |
| D11 | `--locked` in CI | **All three.** `clippy … --locked` and `test --locked`. Supersedes round 1's D8 "release only": a stale `Cargo.lock` otherwise goes green on the push and kills every release leg after the tag is public. mdv found this; it is now shared. | yes — add |
| D12 | Gating a release on the checks | **A reusable `checks.yml` (`on: workflow_call`), called by both `ci.yml` and `release.yml`, gating `publish`.** A `./` path call runs at the caller's commit, so a release checks the tagged tree. | yes — new file, new job |
| D13 | Semver regex in the `version` job | **Tag refs only**, so `workflow_dispatch` can build mid-bump. | yes — move it |
| D14 | Action majors | `checkout@v7`, `setup-node@v7`, `upload-artifact@v7`, `download-artifact@v8`. `action-gh-release` stays `@v2` in all three deliberately. | yes — `checkout` v5→v7 and `setup-node` v5→v7 in **both** workflows |

Round 1 decisions D1–D9 still hold and are already implemented here. D8 is superseded by D11.

### Why the release needs a checks gate at all (D12)

D7 removed the release build's tests on the promise that CI had already tested the commit.
Nothing was checking that promise. Two pushes — `main` then the tag — are independent events
and Actions cannot order them; a tag can point at a commit that was never pushed, or one whose
CI run is still going or was cancelled. mdv solved it by querying the Actions API and waiting;
that has three failure modes (tag before push, cancelled run, `paths-ignore` meant no run
exists). Calling the checks directly avoids all three: they simply run, at the tagged commit.

## 1. New file — `.github/workflows/checks.yml`

The check matrix moves here from `ci.yml`, with `--locked` added (D11) and the action majors
bumped (D14). This becomes the only place the matrix is defined.

```yaml
name: Checks

# Called by ci.yml on a push and by release.yml on a tag. Referenced by a local
# `./` path, so it always runs at the caller's commit - which is what lets a
# release verify the exact tree it is about to publish.
on:
  workflow_call:

env:
  CARGO_TERM_COLOR: always

jobs:
  check:
    name: ${{ matrix.os }}
    # A called workflow runs with the caller's token, and release.yml grants
    # `contents: write` for `publish`. Without this the check matrix would
    # inherit write access it has no use for; it only builds and tests.
    permissions:
      contents: read
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        # 22.04 rather than latest: the .deb links against the builder's glibc,
        # so the oldest supported runner reaches the most distros. CI matches
        # the release matrix so a break shows up here first.
        os: [windows-latest, macos-latest, ubuntu-22.04]

    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm

      - name: Linux build dependencies (Tauri 2)
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
            libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt

      - uses: Swatinem/rust-cache@v2

      - name: Git identity (tests that commit via the CLI)
        run: |
          git config --global user.name "CI"
          git config --global user.email "ci@example.com"

      - name: Install npm dependencies
        run: npm ci

      # Formatting is platform-independent, so check it once, on the cheapest runner.
      # `--all` is not optional here: the root Cargo.toml is a virtual workspace, and
      # without it cargo fmt finds no targets and exits 1.
      - name: Format
        if: runner.os == 'Linux'
        run: cargo fmt --all --check

      # `-D warnings` goes after `--`, not in RUSTFLAGS: as an env var it also
      # applies to every dependency, so one warning in a crate we do not own
      # turns the build red.
      #
      # `--locked` because the release build passes it too: without it here a
      # stale `Cargo.lock` goes green, and then kills every release leg after
      # the tag is already public.
      - name: Clippy
        run: cargo clippy --workspace --all-targets --locked -- -D warnings

      - name: Test
        run: cargo test --workspace --locked

      - name: Frontend tests
        run: npm test -- --run

      # `build` is `tsc && vite build`: the type check runs here.
      - name: Frontend build
        run: npm run build
```

## 2. Replace `.github/workflows/ci.yml`

Drops to triggers plus a call.

```yaml
name: CI

on:
  push:
    branches: [main]
    # A docs-only push has nothing here to check. Mixed commits still run.
    # This cannot let a tagged commit through unchecked: release.yml calls
    # checks.yml on every tag, whatever paths the commit touched.
    paths-ignore:
      - "docs/**"
      - "**/*.md"
  workflow_dispatch:

# One run per push: a burst of pushes cancels the superseded runs instead of stacking them.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    uses: ./.github/workflows/checks.yml
```

## 3. `.github/workflows/release.yml` changes

- [x] **`actions/checkout@v5` → `@v7`** in both the `version` and `build` jobs (D14).
- [x] **`actions/setup-node@v5` → `@v7`** in the `build` job (D14).
- [x] **Add a `checks` job** calling the reusable workflow, and make `publish` wait for it.
      `build` keeps `needs: version` only, so builds and checks run concurrently:

  ```yaml
  jobs:
    version:
      ...

    # The release build does not run the tests (D7), so the checks run here
    # instead, at this exact commit. They gate `publish`, not `build`: the two
    # run side by side, and a failure means the artifacts exist but nothing is
    # published.
    #
    # Tags only. All this job protects is `publish`, and `publish` is itself
    # tag-only, so on a workflow_dispatch packaging run the matrix would be
    # three legs guarding nothing. Skipping it here also skips `publish`, which
    # is what the dispatch wanted anyway.
    checks:
      if: startsWith(github.ref, 'refs/tags/')
      uses: ./.github/workflows/checks.yml

    build:
      needs: version
      ...

    publish:
      needs: [version, checks, build]
      if: startsWith(github.ref, 'refs/tags/')
      ...
  ```

- [x] **`version` job, `read` step (D13):** move the `x.y.z` regex inside the tag branch, so
      `workflow_dispatch` can build a tree mid-bump. The step body becomes:

  ```bash
  set -euo pipefail
  # [workspace.package] in the root Cargo.toml. src-tauri inherits it, and
  # tauri.conf.json carries no version of its own.
  crate=$(grep -m1 '^version = ' Cargo.toml | cut -d'"' -f2)
  # workflow_dispatch has no tag, so there is nothing to compare against, and
  # it is allowed to build whatever version the tree has - packaging can then
  # be checked in the middle of a bump.
  if [[ "${GITHUB_REF}" == refs/tags/* ]]; then
    # Plain x.y.z only: the rpm tooling rejects a `-rc.1` suffix.
    if ! [[ "$crate" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "version $crate is not a plain x.y.z release" >&2
      exit 1
    fi
    tag="${GITHUB_REF_NAME#v}"
    if [[ "$tag" != "$crate" ]]; then
      echo "tag $tag does not match Cargo.toml version $crate" >&2
      exit 1
    fi
  fi
  echo "version=$crate" >> "$GITHUB_OUTPUT"
  ```

- [x] Nothing else. `upload-artifact@v7` / `download-artifact@v8` are current;
      `action-gh-release@v2` stays. The matrix, `npm ci`, the binstall/tauri-cli steps,
      `Clear stale bundle output`, staging, `.sha256` sidecars and the release-notes body are
      untouched.

## 4. Dependabot (D10)

- [x] Nothing to delete — this repo never committed a `dependabot.yml`, and round 1's decision
      not to is now the shared one. Do **not** add one.
- [x] **Turn on Dependabot security alerts** for `toperux/t4-git-ui`. Round 1 found them off
      (`GET /repos/{r}/vulnerability-alerts` → 404, `automated-security-fixes.enabled` →
      false) and correctly identified this as the half of Dependabot worth having; it was
      never actually switched on. Settings → Advanced Security → Dependabot alerts, or:

  ```sh
  gh api -X PUT repos/toperux/t4-git-ui/vulnerability-alerts
  ```

  Confirmed on: `GET` → 204 on 2026-09-04, re-checked 2026-09-05.

- [x] **Do not enable Dependabot security updates** (`automated-security-fixes`) — even though
      round 1 checked its status here and found it false. Alerts notify; security *updates*
      open pull requests, and after this round nothing runs on `pull_request` in any of the
      three repos — so such a PR would arrive with no checks at all, which is the exact hole
      D10 closes. A security fix is the last thing to merge unchecked. When an alert fires,
      bump it by hand (`cargo update -p <crate>` / `npm update <pkg>`), push to `main`, and the
      full matrix runs.

## 5. Risks to verify

- **Reusable-workflow resolution.** `uses: ./.github/workflows/checks.yml` resolves at the
  caller's commit. On the first push this means `checks.yml` must exist in the same commit as
  the `ci.yml` that calls it — land section 1 and 2 in one commit, not two.
- **Job naming.** The matrix legs now appear as `check / ${{ matrix.os }}`. Cosmetic; do not
  add `name:` overrides chasing the old labels.
- **A tagged release now costs a check matrix on top of the builds.** Wall-clock is unchanged
  (they run alongside `build`), but a release spends three more legs of Actions minutes. That
  is the price of the guarantee; it is not a mistake to be optimised away. `workflow_dispatch`
  runs are unaffected — `checks` is tag-gated.
- **Recovering from a failed check on a tag.** `build` will have succeeded and uploaded
  artifacts; `publish` will not have run, so no release exists and nothing is public. Fix the
  commit, delete the tag locally and on the remote (`git tag -d vX.Y.Z && git push origin
  :refs/tags/vX.Y.Z`), then re-tag. Do not re-run only the failed job to force a publish.
  **This repo has never published a release**, so this path is entirely untested here.
- **`setup-node@v7`.** This is a two-major jump (v5 → v7) and this repo is the only one of the
  three that uses the action, so nothing else exercises it. If `cache: npm` or `node-version:
  24` behaves differently, the CI run in section 7 shows it before any release depends on it.
- **The release workflow has never run.** Round 1's unproven assumptions are still unproven and
  are re-listed in section 7: the workspace-root bundle path, and the `-- --locked`
  pass-through. Round 1 *did* verify locally (tauri-cli 2.11.4) that a workspace-inherited
  version reaches the bundle name — `t4-git-ui_0.1.0_x64-setup.exe` — so D9 itself is settled.
- **`ubuntu-22.04` retirement — still open, cross-repo.** Deprecated from 2026-09-17,
  brownouts 2027-03-23 / -03-30 / -04-06 / -04-13 (14:00–00:00 UTC), unsupported 2027-04-17
  (`actions/runner-images#14254`). Deliberate here for the glibc floor. **Not in scope for
  round 2** — do not switch it. The fix has to be picked once for all three.

## 6. Commit plan

1. `ci: run the checks from one reusable workflow` — sections 1 and 2 **in a single commit**
   (see Risks).
2. `release: gate publishing on the checks` — section 3.

There is no dependabot commit; section 4 is a repo setting. Do not tag a release as part of
this work.

## 7. Verification

The branch rehearsal below was written before any of this had run. It was overtaken by the
real thing: the changes merged, and **v0.1.2** (2026-09-05) and **v0.1.3** (2026-09-07) both
released green on these workflows. Re-running the rehearsal now would re-prove what the tags
proved and spend Actions minutes doing it, so each box is ticked against the run that answers
it — read off the logs on 2026-09-08, nothing re-run. The version numbers below are the
0.1.0 the plan was written against; the assets carry whatever version was tagged.

- [x] ~~Push to a branch, then `workflow_dispatch` **CI** on it.~~ Superseded: every leg green
      on the tag instead — `checks / windows-latest`, `/ macos-latest`, `/ ubuntu-22.04` in
      the v0.1.3 release run ([`34091601705`](https://github.com/toperux/t4-git-ui/actions/runs/34091601705), 2026-09-07), and CI itself green on
      `main` for the same commit ([`34091580528`](https://github.com/toperux/t4-git-ui/actions/runs/34091580528)).
- [x] `Format` ran on `ubuntu-22.04` only — that log has `cargo fmt --all --check`, the Windows
      leg has no fmt step at all — and both clippy and test carry `--locked`
      (`cargo clippy --workspace --all-targets --locked -- -D warnings`,
      `cargo test --workspace --locked`).
- [x] `setup-node@v7` resolved (downloaded at SHA `8207627`). The npm cache **saved** rather
      than hit on the release run, because the version bump had just changed `package-lock.json`;
      the run before it restored `node-cache-Windows-x64-npm-3ee4455…`
      ([`34089400791`](https://github.com/toperux/t4-git-ui/actions/runs/34089400791)).
- [x] ~~`workflow_dispatch` **Release** on the branch.~~ Superseded by the tag run: `version`
      green (printing the tagged version), three `build` legs green, and `checks` / `publish`
      **not** skipped there — the tag path is the one that runs them.
- [x] Build and checks do run concurrently: on the tag run the three `build` legs started
      06:36:46 and the three `checks` legs 06:36:47–06:36:52, and `publish` waited for both
      (06:59:17, after the last build finished 06:59:14).
- [x] **Carried from round 1:** `Stage the artifacts` found every bundle — `publish` succeeded
      with no `no bundle matched`, on all three platforms.
- [x] **Carried from round 1:** the `-- --locked` pass-through reached the cargo commands
      (quoted in full two boxes above).
- [x] Artifacts are exactly the five, each with a `.sha256`, and no `.msi`: the v0.1.3 release
      carries `T4-Git-UI_0.1.3_x64-setup.exe`, `…_universal.dmg`, `…_amd64.deb`,
      `…_x86_64.rpm`, `…_x86_64.AppImage` plus one `.sha256` each — ten assets.
- [x] Merged to `main`; CI green on `main` (the run above, and every push since).
- [ ] **Still open, and free to observe:** a push touching only `docs/**` or `**/*.md` must not
      start a CI run. Nothing to schedule — watch the Actions tab after the next docs-only push.
- [x] Dependabot security alerts on for this repo (section 4). `automated-security-fixes`
      still `{"enabled":false}` on 2026-09-05, as intended.

## 8. Deviations and findings

> Anything you changed that this plan did not ask for, and anything you noticed that the other
> two repos should probably also do. **Record here; do not act on it beyond this repo.** The
> next master pass reads this section. Round 1's dependabot argument was written here and
> became the shared decision for all three — that is what this section is for. If this section
> is empty, say so explicitly.

No code deviations: sections 1–3 were applied exactly as written, and nothing outside the
checklist was touched. Three findings.

- **`ci.yml`'s new comment is imprecise, in all three repos.** It says "release.yml calls
  checks.yml unconditionally", but section 3 gates the `checks` job on
  `startsWith(github.ref, 'refs/tags/')`. The claim it is defending — a tagged commit cannot
  reach `publish` unchecked — still holds, because the gate is exactly "is this a tag". Only
  the word *unconditionally* is wrong. Written verbatim as the plan specified; the next master
  pass may want "on a tag" in all three.
- **Dependabot alerts are now on; automated security fixes are not — and that is now the
  intended end state.** As of 2026-09-04, `GET /repos/toperux/t4-git-ui/vulnerability-alerts`
  → 204 (on, switched on by hand), `GET .../automated-security-fixes` → `{"enabled":false}`.

  > **Superseded 2026-09-04, read this before acting.** This finding originally read that
  > "the second half of section 4 still needs a human: `gh api -X PUT
  > repos/toperux/t4-git-ui/automated-security-fixes`". **Do not run that command.** It was
  > written against the first version of section 4, which listed two `PUT`s; csb and mdv
  > independently found that the second one contradicts D10 — security *updates* open pull
  > requests, and no repo runs anything on `pull_request`, so they would land unchecked, which
  > is the exact hole D10 closes. Section 4 has since been corrected to enable alerts only and
  > to say so explicitly. The state recorded above — alerts on, updates off — is correct and
  > needs no further action.

  **Note for the other two repos:** these are two independent settings, and enabling alerts
  does not enable the fixes — check both, not just the 204. Alerts on, updates off is the
  target everywhere.
- **`cargo fmt --check` without `--all` fails in this repo** (found in review, 2026-09-05).
  The root `Cargo.toml` is a virtual workspace, and cargo-fmt without `--all` exits 1 with
  "Failed to find targets" - reproduced locally. The Linux leg would have gone red on the
  first real run, and every tag's `checks` job with it, so nothing would ever publish. It was
  in round 1's `ci.yml` and carried into `checks.yml`; the local gate uses `--all`, which hid
  it. Fixed here as `cargo fmt --all --check`. **The other two repos are single-crate**, so
  the shared line works there; this repo has to diverge on that one step.
- **Three small `release.yml` hardenings, same review:** `contents: write` scoped to `publish`
  only instead of workflow-wide; `find | head -1` under `pipefail` replaced with
  `find -print -quit`; `cargo-bins/cargo-binstall@main` pinned to `v1.22.0` (the action has no
  moving major tag). Worth mirroring in the other two.
- **`Cargo.lock` is current**, so D11's `--locked` will not break the first run:
  `cargo metadata --locked` resolves clean at `7426481` locally. Worth the same one-line check
  in the other two repos before their first `--locked` CI run, since a stale lock now fails
  the push build rather than only the release.
