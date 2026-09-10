---
name: release
description: Cut a T4 Git release — bump the version, tag it, let the Release workflow build and publish the five installers. Use when the user asks to release, cut a version, ship a build or publish a tag.
---

# Release

Tagging is the whole trigger. `release.yml` reads the version out of the repository,
runs the checks at that exact commit, builds Windows, macOS and Linux packages, and
publishes them. The macOS app is code-signed; Windows and Linux are not.

The user must ask for the release. Pushing `main` and pushing a tag are both outward
actions, and a published release cannot be quietly withdrawn. A request naming a version
("release v0.1.4") authorises both pushes for that version only; nothing else does.

## Where the version lives

Three files must agree, or the `version` job fails the run before anything builds:

- `Cargo.toml` — `[workspace.package] version`, the source of truth. `src-tauri` inherits it
  and `tauri.conf.json` carries none of its own.
- `package.json` — what the start screen renders. The job compares it to the crate version.
- `Cargo.lock` and `package-lock.json` — refresh with `cargo check` and `npm install`,
  never by hand.

The tag must be `v<version>` and the version plain `x.y.z`. A suffix like `-rc.1` is
rejected: the rpm tooling will not take it.

## Signing

`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are repo secrets. The
config carries a `pubkey`, so a build without them does not quietly ship unsigned: the bundler
aborts with *"A public key has been found, but no private key"*. A missing secret therefore
fails **Build the packages**, not staging.

`APPLE_CERTIFICATE` and `APPLE_CERTIFICATE_PASSWORD` are the macOS pair — a self-signed
certificate shared with t4-markdown-viewer; the identity name sits in the workflow, not in a
secret. **Import the macOS signing certificate** consumes them, and a missing or wrong one fails
there, before anything is built. They are deliberately *not* passed to **Build the packages**:
Tauri's own importer only resolves Apple-issued certificate names, so handing it
`APPLE_CERTIFICATE` makes the build die with `ResolveSigningIdentity`. It gets the identity name
alone. The certificate is what keeps the app's identity stable across versions, and macOS keys
Documents / Desktop / Downloads access to that identity: replacing it makes every Mac user
re-grant once. Self-signed is not notarized, so Gatekeeper still stops the first launch.

The signing path has never been proven on a real run. **Before the first tag after any change to
the import, build or verify steps, run Release from `workflow_dispatch` and confirm the macOS leg
is green** — it builds all three platforms without publishing, so a broken signing step costs a
run instead of a version number.

## Steps

1. **Gates, locally.** The release build does not run tests — that is what the `checks`
   job on the tag is for, but a red gate found after tagging costs a version number.

   ```sh
   cargo fmt --all --manifest-path "<repo>/Cargo.toml"
   cargo clippy --workspace --all-targets --manifest-path "<repo>/Cargo.toml" -- -D warnings
   cargo test --workspace --manifest-path "<repo>/Cargo.toml"
   npx --prefix "<repo>" tsc --noEmit -p "<repo>/tsconfig.json"
   npm --prefix "<repo>" test -- --run
   ```

2. **Bump.** Edit `Cargo.toml` and `package.json`, then `cargo check` and `npm install` to
   pull the two lock files along. Update the version in `docs/smoke-test.md` too — it names
   the installer path and the start-screen header.

3. **Commit the bump alone**, subject `Bump the version to x.y.z`, body summarising what
   landed since the last tag. Nothing else in that commit.

4. **Push `main` first, then the tag.** In that order: the tag's run checks out the commit,
   and a tag that arrives before its commit points at nothing on the remote.

   ```sh
   git -C "<repo>" push origin main
   git -C "<repo>" tag v<x.y.z>
   git -C "<repo>" push origin v<x.y.z>
   ```

5. **Watch the run.** Eight jobs: `version`, three `build`, three `checks`, then `publish`.
   Builds and checks run side by side; `publish` waits for both. Around twenty minutes.

   ```sh
   gh run list --repo toperux/t4-git-ui --limit 3
   gh run watch <run-id> --repo toperux/t4-git-ui
   ```

6. **Check the assets.** Sixteen of them: six packages (`.exe`, `.dmg`, `.app.tar.gz`, `.deb`,
   `.rpm`, `.AppImage`), six `.sha256`, three `.sig` (exe, app.tar.gz, AppImage), and
   `latest.json`:

   ```sh
   gh release view v<x.y.z> --repo toperux/t4-git-ui --json assets -q '.assets[].name'
   ```

7. **Read the notes.** `publish` generates them from the commits and prepends a fixed body
   that carries the install instructions and the SmartScreen / Gatekeeper warnings. Edit the release
   afterwards if the generated part reads badly.

## When it goes wrong

- **`publish` failed on the Actions spending limit.** The bundles are already on the run.
  Raise the limit, then re-run the failed job — do not rebuild, and do not retag.
- **A tag that should never have shipped.** Delete it locally and on the remote, and delete
  the release if one was created. `v0.1.1` went this way. Never reuse the number.
- **The `version` job failed.** The three files disagree, or the tag is not plain `x.y.z`.
  Nothing was built; fix the bump commit, move the tag, push again.
- **The push of a `v*` tag delete or move is rejected.** The *Protect release tags* ruleset
  blocks both, with no bypass. Switch it off for the one push, then back on:

  ```sh
  id=$(gh api repos/toperux/t4-git-ui/rulesets -q '.[] | select(.name=="Protect release tags") | .id')
  gh api -X PUT repos/toperux/t4-git-ui/rulesets/$id -f enforcement=disabled
  # delete or move the tag
  gh api -X PUT repos/toperux/t4-git-ui/rulesets/$id -f enforcement=active
  ```
- **`Import the macOS signing certificate` failed.** A secret is missing, or the password does not
  match the `.p12`. Nothing was built yet; fix the secret and re-run the macOS job.
- **`Verify the macOS signature` failed.** The step prints the designated requirement it read —
  compare it against the fingerprint in the grep. The bundle is unsigned or signed by something
  else; never get past it by dropping the step, because a release that quietly loses the identity
  resets every Mac user's folder grants. Fix and re-run the macOS job; the tag stays.
- **`Stage the artifacts` says `no bundle matched`.** The bundle path moved. Add a `find`
  step above it, read the real path off the log, and fix `bundle_dir` in the matrix and in
  `docs/plans/ci-alignment.md`.

## Checking the packaging without spending a version

`workflow_dispatch` on **Release** builds all three platforms and skips `checks` and
`publish`, both of which are tag-gated. The packages land as run artifacts. Use it when the
question is whether the bundles build, not whether the release is ready.

## What a release does not do

- No Windows signing, and no notarization anywhere. Windows shows a SmartScreen warning; the
  macOS app is signed, but self-signed, so the quarantine attribute still has to be cleared.
  Both are spelled out in the release body. Distinct from update signing and from macOS signing
  (see Signing, above), both of which do happen — do not confuse the three.
- No draft. `publish` creates the release live.
- No changelog file. The notes are generated per release and live on GitHub.
