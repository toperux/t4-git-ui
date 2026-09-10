# CI/CD alignment plan — t4-git-ui

## Context

This repo is one of three t4 projects whose GitHub Actions workflows are being aligned to a
single shared shape. The other two — `t4-claude-session-browser` (pure Rust, egui) and
`t4-markdown-viewer` (Tauri 2, no npm) — are out of scope here and have their own copies of
this plan. Everything below is self-contained; the shared shape is authoritative.

git-ui is a Tauri 2 app with an npm/vite/TypeScript frontend, laid out as a cargo workspace
(`crates/git-core`, `src-tauri`; version in the root `Cargo.toml` under `[workspace.package]`,
inherited by `src-tauri` via `version.workspace = true`). It has no in-app updater.

Of the three repos this one needs the most work: the CI file is close, but the release
workflow currently hands everything to `tauri-apps/tauri-action`, publishes a **draft**, has no
version gate, no checksums, no `workflow_dispatch`, and lets tauri pick asset names. It is
rewritten here to the same `version` → `build` → `publish` shape the other Tauri repo uses,
minus that repo's updater plumbing.

Principles for every edit:

1. **Surgical** where editing (CI). The release file is a rewrite, so the whole file is given.
2. If this plan turns out to be wrong about something (a path, a runner name, an action
   version), fix the plan file in the same commit so it stays truthful.

## Decisions (resolved 2026-09-03, shared across all three repos)

| # | Decision | Resolution | Applies here |
| --- | --- | --- | --- |
| D1 | `paths-ignore` docs/md on CI | **Adopt in all three.** No `.md` test fixtures; no required-status-check rules to hang. | yes — already present; keep |
| D2 | Which leg runs `cargo fmt --check` | **Linux leg only.** Same code on every leg, so run it once on the cheapest runner. | yes — currently runs on all three |
| D3 | git-ui asset naming | **`T4-Git-UI_<ver>_<suffix>`**: `_x64-setup.exe`, `_universal.dmg`, `_amd64.deb`, `_x86_64.rpm`, `_x86_64.AppImage`. | yes |
| D4 | git-ui updater | **Shipped, v0.5.0.** Signed via the `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repo secrets; `publish` generates `latest.json` from the per-platform `.sig` files and ships it as a release asset; the endpoint is GitHub's "latest release" download URL. deb/rpm excluded — those update through the package manager, not the plugin. | yes |
| D5 | Action pinning | **Majors, bumped by hand.** Verify current majors first (see Risks). Dependabot was the original answer and was **reversed on 2026-09-03** — see the note under section 4. | yes |
| D6 | Universal macOS | **Universal** — one `.dmg` for Apple Silicon + Intel. Replaces today's two per-arch legs; accept ~2× mac wall-clock and bundle size. | yes |
| D7 | Tests inside release builds | **None.** CI already tests the commit. | yes — release build has no test step and therefore no git-identity step |
| D8 | `--locked` on release builds | **Release builds only.** CI unchanged. | yes |
| D9 | Drop `"version"` from `tauri.conf.json` | **Yes**, own commit. Tauri 2 falls back to the crate's `Cargo.toml` version. Root `Cargo.toml` becomes the only source; `package.json`'s version is read by nothing and is left alone and unchecked. | yes |
| — | Windows bundle | **NSIS only**, no `.msi`. `bundle.targets: "all"` in `tauri.conf.json` is overridden by `--bundles`. | yes |

## 1. Target `.github/workflows/ci.yml` (complete file)

Replace the file with this. Changes from today: `CARGO_TERM_COLOR`, concurrency group name,
matrix order + `ubuntu-22.04` instead of `ubuntu-latest`, job `name:`, Linux deps moved before
the rust toolchain (shared order), `cargo fmt` gated on Linux (D2), bare `run:` steps named,
`Versions` echo step removed, apt line wrapped. Kept: `setup-node@v5` + node 24 + npm cache,
git identity (tests commit via the CLI), `npm test -- --run`, `npm run build`.

```yaml
name: CI

on:
  push:
    branches: [main]
    # A docs-only push has nothing here to check. Mixed commits still run.
    paths-ignore:
      - "docs/**"
      - "**/*.md"
  workflow_dispatch:

env:
  CARGO_TERM_COLOR: always

# One run per push: a burst of pushes cancels the superseded runs instead of stacking them.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    name: ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        # 22.04 rather than latest: the .deb links against the builder's glibc,
        # so the oldest supported runner reaches the most distros. CI matches
        # the release matrix so a break shows up here first.
        os: [windows-latest, macos-latest, ubuntu-22.04]

    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
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
      - name: Clippy
        run: cargo clippy --workspace --all-targets -- -D warnings

      - name: Test
        run: cargo test --workspace

      - name: Frontend tests
        run: npm test -- --run

      # `build` is `tsc && vite build`: the type check runs here.
      - name: Frontend build
        run: npm run build
```

## 2. D9 — read the version from `Cargo.toml` only (own commit, **before** section 3)

Tauri 2 uses the crate's `Cargo.toml` version when `tauri.conf.json` has no `version` key.
`src-tauri/Cargo.toml` says `version.workspace = true`, so the value comes from the root
`Cargo.toml` `[workspace.package]`.

- [x] `src-tauri/tauri.conf.json`: delete the `"version": "0.1.0",` line. Nothing else.
- [x] Locally: `cargo tauri build --bundles nsis` (or whichever bundle is cheap on your
      machine) and confirm the produced installer's filename carries `0.1.0` (the workspace
      version). This is the one real unknown in D9 for this repo — whether the Tauri CLI
      resolves a *workspace-inherited* version. If the filename shows no version or the build
      complains, stop, restore the key, note it in this plan, and instead have the `version`
      job in section 3 also read `tauri.conf.json` and fail if it disagrees with `Cargo.toml`.
      **Verified 2026-09-03** with tauri-cli 2.11.4: the build ends
      `Finished 1 bundle at: target\release\bundle\nsis\t4-git-ui_0.1.0_x64-setup.exe`, so the
      CLI does resolve `version.workspace = true` through to the bundle name. No fallback
      needed; the `version` job can keep reading the root `Cargo.toml` alone.
- [x] `package.json` `"version"`: leave it. Nothing reads it. (Still `0.1.0`; it now has no
      mechanism keeping it in step, which is fine — but do not trust it as a source.)
- [x] Commit: `Read the version from Cargo.toml only`.

## 3. Target `.github/workflows/release.yml` (complete file — this is a rewrite)

Replace the file with this. It is adapted from the other Tauri repo's release workflow; the
differences are noted inline: workspace-root `target/` paths, npm install before the build,
no signing / `.sig` / `latest.json`, and this repo's asset names.

```yaml
name: Release

# Tag a commit `v<version>` and push the tag; this builds the packages for all
# three platforms and publishes them. `workflow_dispatch` builds the same
# artifacts without releasing, for when you want to check the packaging without
# burning a version number.
on:
  push:
    tags: ['v*']
  workflow_dispatch:

env:
  CARGO_TERM_COLOR: always

permissions:
  contents: write

jobs:
  # Resolved once and shared. The tag and Cargo.toml must agree, or the release
  # is called v0.2.0 and ships an installer named 0.1.0. Cheap to check,
  # confusing to discover later.
  version:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.read.outputs.version }}
    steps:
      - uses: actions/checkout@v5
      - id: read
        shell: bash
        run: |
          set -euo pipefail
          # [workspace.package] in the root Cargo.toml. src-tauri inherits it,
          # and tauri.conf.json carries no version of its own.
          crate=$(grep -m1 '^version = ' Cargo.toml | cut -d'"' -f2)
          # Plain x.y.z only: the rpm tooling rejects a `-rc.1` suffix.
          if ! [[ "$crate" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "version $crate is not a plain x.y.z release" >&2
            exit 1
          fi
          # workflow_dispatch has no tag, so there is nothing to compare against.
          if [[ "${GITHUB_REF}" == refs/tags/* ]]; then
            tag="${GITHUB_REF_NAME#v}"
            if [[ "$tag" != "$crate" ]]; then
              echo "tag $tag does not match Cargo.toml version $crate" >&2
              exit 1
            fi
          fi
          echo "version=$crate" >> "$GITHUB_OUTPUT"

  build:
    needs: version
    name: ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        include:
          # bundle_dir is relative to the repo root: this is a cargo workspace,
          # so the Tauri CLI writes under the root target/, not src-tauri/target/.
          - os: windows-latest
            bundles: nsis
            bundle_dir: target/release/bundle
          - os: macos-latest
            bundles: app,dmg
            # One .dmg for both Apple Silicon and Intel.
            target: universal-apple-darwin
            bundle_dir: target/universal-apple-darwin/release/bundle
          # 22.04 rather than latest: the .deb links against the builder's
          # glibc, so the oldest supported runner reaches the most distros.
          - os: ubuntu-22.04
            bundles: deb,rpm,appimage
            bundle_dir: target/release/bundle

    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
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

      - name: Add the Apple targets
        if: runner.os == 'macOS'
        run: rustup target add aarch64-apple-darwin x86_64-apple-darwin

      - uses: Swatinem/rust-cache@v2

      # `cargo tauri build` runs `npm run build` first (beforeBuildCommand in
      # tauri.conf.json), so the frontend dependencies have to be in place.
      - name: Install npm dependencies
        run: npm ci

      - uses: cargo-bins/cargo-binstall@main

      - name: Install the Tauri CLI
        # `--no-confirm` only. `-y` is its short form, and binstall rejects
        # being given the same argument twice.
        run: cargo binstall --no-confirm 'tauri-cli@^2'

      # Staging picks the first file matching each glob, and the cache restores
      # target/ from an earlier run. A leftover installer from a previous
      # version would be staged as this version's. Cheaper to start from nothing.
      - name: Clear stale bundle output
        shell: bash
        run: rm -rf "${{ matrix.bundle_dir }}"

      # Run from the repo root: the Tauri CLI finds src-tauri/ on its own.
      # Arguments after `--` go to `cargo build`.
      - name: Build the packages
        run: >
          cargo tauri build --bundles ${{ matrix.bundles }}
          ${{ matrix.target && format('--target {0}', matrix.target) || '' }}
          -- --locked

      # Tauri names bundles with the product name, and GitHub rewrites spaces
      # in asset names anyway. Pick the final names here instead of letting the
      # upload mangle them.
      - name: Stage the artifacts
        shell: bash
        run: |
          set -euo pipefail
          ver='${{ needs.version.outputs.version }}'
          out="$GITHUB_WORKSPACE/dist"
          mkdir -p "$out"
          cd "${{ matrix.bundle_dir }}"

          stage() {
            local src
            src=$(find . -path "./$1" | head -1)
            if [ -z "$src" ]; then
              echo "no bundle matched $1" >&2
              exit 1
            fi
            cp "$src" "$out/$2"
          }

          case '${{ runner.os }}' in
            Windows)
              stage 'nsis/*-setup.exe'    "T4-Git-UI_${ver}_x64-setup.exe"
              ;;
            macOS)
              stage 'dmg/*.dmg'           "T4-Git-UI_${ver}_universal.dmg"
              ;;
            Linux)
              stage 'deb/*.deb'           "T4-Git-UI_${ver}_amd64.deb"
              stage 'rpm/*.rpm'           "T4-Git-UI_${ver}_x86_64.rpm"
              stage 'appimage/*.AppImage' "T4-Git-UI_${ver}_x86_64.AppImage"
              ;;
          esac

          cd "$out"
          for f in *; do
            case "$f" in *.sha256) continue ;; esac
            if command -v sha256sum >/dev/null 2>&1; then
              hash=$(sha256sum "$f" | cut -d' ' -f1)
            else
              hash=$(shasum -a 256 "$f" | cut -d' ' -f1)
            fi
            printf '%s  %s' "$hash" "$f" > "$f.sha256"
            echo "$f  $hash"
          done

      - uses: actions/upload-artifact@v7
        with:
          name: packages-${{ runner.os }}
          path: dist/*

  publish:
    needs: [version, build]
    if: startsWith(github.ref, 'refs/tags/')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v8
        with:
          path: dist
          merge-multiple: true

      - uses: softprops/action-gh-release@v2
        with:
          files: dist/*
          draft: false
          generate_release_notes: true
          body: |
            ### Windows

            `T4-Git-UI_${{ needs.version.outputs.version }}_x64-setup.exe` —
            per-user install, no admin prompt, into `%LOCALAPPDATA%\t4-git-ui`.

            Not code-signed, so SmartScreen shows "Windows protected your PC" the
            first few times: **More info** → **Run anyway**.

            ### macOS

            `T4-Git-UI_${{ needs.version.outputs.version }}_universal.dmg` —
            Apple Silicon and Intel in one image. Drag to Applications, then:

            ```sh
            xattr -dr com.apple.quarantine "/Applications/t4-git-ui.app"
            ```

            Not signed or notarized, so without that Gatekeeper reports the app as
            damaged. Right-click → **Open** works too.

            ### Linux

            `.deb`, `.rpm`, and `.AppImage`.

            ```sh
            sudo apt install ./T4-Git-UI_${{ needs.version.outputs.version }}_amd64.deb
            ```

            ### Verifying a download

            Every asset ships a `.sha256` sidecar. Check one with `sha256sum -c`
            on Linux, `shasum -a 256 -c` on macOS, or on Windows:

            ```powershell
            Get-FileHash '.\<file>' -Algorithm SHA256
            ```
```

Things to check against the repo while writing it in (the plan was written without running
a build here):

- [x] The NSIS installer's install directory and the `.app` name in the release body come from
      `productName` (`t4-git-ui`). If `productName` is changed before this lands, update both.
      Checked 2026-09-03: `productName` is still `t4-git-ui`, matching both strings in the body.
- [x] `tauri-apps/tauri-action` is gone entirely. Nothing else referenced it. Checked: the only
      remaining mentions are this plan and the historical `2026-08-31-git-ui-v1-plan.md:136`
      record, which is deliberately not updated.
- [x] `actions/upload-artifact` / `actions/download-artifact`: pin to the current major (see
      Risks). If a newer major than `v4` exists, use it in both places. Pinned `@v7` / `@v8`.

## 4. Non-workflow changes

- [x] **`.github/dependabot.yml`** — **dropped 2026-09-03. Do not add it in any of the three
      repos.** It was written and committed here, then reverted the same day. Reasoning, so the
      other two repos make the same call:

  - Dependabot's only output is **pull requests**, and none of the three repos run anything on
    `pull_request` — the trigger is `main` plus `workflow_dispatch`. So every bump PR would
    arrive with zero checks, and the choice would be to merge blind and watch `main`, or run
    CI by hand on the branch first. Neither is worth a monthly PR per dependency.
  - The value people actually want from Dependabot is **security alerts**, and those are a
    separate repo setting that needs no `dependabot.yml`, opens no PRs and spends no Actions
    minutes. Checked on `toperux/t4-git-ui` 2026-09-03: alerts were **off**
    (`GET /repos/{r}/vulnerability-alerts` → 404, `automated-security-fixes.enabled` → false).
    **Turn alerts on in each repo** — that is the half that matters.
  - Action majors do not rot silently without it: GitHub annotates a run whose actions use a
    retiring runtime, which is exactly how the `@v4` → `@v5` bump was caught in this repo's
    2026-09-02 review. Bump majors by hand when an annotation appears, or when a plan pass
    checks the releases pages the way section 5 does.
  - cargo and npm bumps are `cargo update` / `npm update` locally, followed by the full gates
    before committing — strictly more checked than merging an untested PR.

  If a repo ever grows real PR review, revisit this together with a `pull_request` trigger; a
  gated one (`if: github.actor == 'dependabot[bot]'`) keeps other PRs free.

- [x] **Release skill** — written 2026-09-08 as `.claude/skills/release/SKILL.md`, after
      v0.1.2 and v0.1.3 both released green. It carries this outline plus what the two runs
      taught: the eight-job shape, the asset check, the spending-limit re-run, and the
      deleted `v0.1.1`. The outline it was written from:
      the version lives in the root `Cargo.toml` (`[workspace.package]`) and `Cargo.lock`
      (refresh with `cargo check`, never by hand); bump, commit the bump alone as
      `Release x.y.z`, `git tag vx.y.z`, push `main` **then** the tag; the `version` job
      rejects a tag that disagrees with `Cargo.toml` or is not plain `x.y.z`;
      `workflow_dispatch` on Release builds everything and skips `publish`, for checking
      packaging without burning a version; the fixed release body lives in `release.yml`;
      nothing is code-signed. Run `cargo test --workspace` and `npm test -- --run` locally
      before tagging — the release build no longer tests (D7).

## 5. Risks to verify

- **`ubuntu-22.04` runner lifetime.** Both workflows now build Linux on it so the `.deb`
  links against an old glibc. Check GitHub's runner-images deprecation notices. If it is being
  retired, do **not** silently switch to `ubuntu-latest` — note it in this plan and stop; the
  fix (a `container: ubuntu:22.04` job or `cargo-zigbuild`) has to be the same in all three
  repos.
  **Checked 2026-09-03:** alive — `actions/runner-images` was still shipping "Ubuntu 22.04
  (20260831) Image Update" issues on 2026-09-01, and no deprecation or brownout issue names it.
  (Ubuntu 26.04 images are being built, so `ubuntu-latest` will move; that is the reason to pin.)
- **Workspace-inherited version (D9).** Covered in section 2; the local build is the test.
- **Bundle output path.** The plan asserts a workspace puts Tauri bundles under the root
  `target/release/bundle` (and `target/universal-apple-darwin/release/bundle`). The first
  `workflow_dispatch` run proves it: if `Stage the artifacts` fails with `no bundle matched`,
  add a `find target -name '*.dmg' -o -name '*-setup.exe' -o -name '*.deb'` step above it,
  read the real path off the log, and fix `bundle_dir` in the matrix and in this plan.
- **`-- --locked` pass-through.** Expected to work with tauri-cli 2.x. If the build step
  rejects it, drop the `-- --locked` and record why here.
- **AppImage on a fresh 22.04 runner.** The other Tauri repo bundles AppImage there today with
  the same apt list, so this should just work; if `linuxdeploy` complains about FUSE, add
  `libfuse2` to the apt line.
- **Action majors.** `checkout@v5` and `setup-node@v5` are what the repo already uses. For
  `upload-artifact` and `download-artifact`, newer majors than `v4` are likely (v5 / v6 shipped
  in late 2025). Check the releases pages and pin the current major. Record what you chose
  here: `upload-artifact@v7`, `download-artifact@v8`.
  **Checked 2026-09-03** (latest release tag per the GitHub API): `upload-artifact` **v7.0.1**,
  `download-artifact` **v8.0.1**, `action-gh-release` **v3.0.3**, `rust-cache` **v2.9.2**,
  `checkout` **v7.0.1**, `setup-node` **v7.0.0**. Pinned the two artifact actions to their
  current majors as instructed; left `checkout@v5`, `setup-node@v5` and `action-gh-release@v2`
  at the versions this plan's YAML specifies, so all three repos stay on one shape — dependabot
  will propose those bumps together. The mixed majors are fine: `upload-artifact@v7` still zips
  by default (`archive: true`), `download-artifact@v8` checks `Content-Type` before unzipping,
  and `merge-multiple` is still an input in v8. v8 does newly default `digest-mismatch` to
  `error`, which is what we want.

## 6. Commit plan

In this order, each its own commit:

1. `docs: add CI alignment plan` — this file. (May be squashed into commit 2.)
2. `ci: align workflow with the other t4 projects` — section 1.
3. `Read the version from Cargo.toml only` — section 2. **Must precede commit 4**, or the
   `version` job's assumption about `tauri.conf.json` is wrong.
4. `release: align workflow with the other t4 projects` — section 3. Lands alone, after the
   `workflow_dispatch` run below is green: it changes how this repo releases, and the first
   tag after it is the real test.
5. ~~`ci: add dependabot`~~ — dropped, see section 4. There is no commit 5.

Do not tag a release as part of this work.

## 7. Verification

> **Blocked as of 2026-09-03.** GitHub is refusing to start jobs on this account — every run
> since 2026-09-02 fails in seconds with "The job was not started because recent account
> payments have failed or your spending limit needs to be increased". Nothing below that needs
> a workflow *run* can be done until Billing & plans is sorted; the file-level work and the
> local D9 build are unaffected. Section 6's "commit 4 lands after the `workflow_dispatch` run
> is green" gate therefore applies to **pushing**, not to committing locally.
>
> Note also that CI no longer triggers on a branch push — the trigger is `main` plus
> `workflow_dispatch` — so the branch checks below have to be started by hand from the Actions
> tab, on the branch.

The branch rehearsal never happened: the work merged and the releases ran for real instead.
Ticked on 2026-09-08 off the v0.1.3 release run ([`34091601705`](https://github.com/toperux/t4-git-ui/actions/runs/34091601705), 2026-09-07) and its
CI twin — see round 2's section 7 for the per-box evidence.

- [x] ~~Push commits 1–3 to a branch and run CI on it.~~ Superseded: three legs green on the tag
      and on `main`.
- [x] `Format` executed on `ubuntu-22.04` only, skipped on the other two; no `Versions` step.
- [x] A docs-only push starts no CI. Observed 2026-09-07 — see round 2's section 7 for the
      two pushes and their run ids.
- [x] ~~Trigger `Release` via `workflow_dispatch`.~~ Superseded by the tag run: `version` green,
      three `build` legs green, and `publish` ran (tags publish; a dispatch would skip it).
- [x] The assets are exactly the five plus a `.sha256` each, no `.msi` — v0.1.3 carries ten.
- [ ] Install the Windows `.exe` on a clean machine or VM: lands under `%LOCALAPPDATA%`, no UAC
      prompt, app launches. **Still open** — needs a box without dev tools or WebView2.
- [x] Merged to `main`. CI green on `main`.
- [x] The release procedure ran twice as written: v0.1.2 (2026-09-05) and v0.1.3 (2026-09-07),
      each a non-draft release with the five assets, their sidecars and the generated notes.
