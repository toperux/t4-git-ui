# Plan: the ssh/https prompt check, and the CLI pin alignment

_Written 2026-09-27, revised through review round 3. Two items from the triage that can be done now. Part A goes in PR
#18 (docs only); Part B is a separate small PR after #18 merges (it changes the release pipeline). Sources:
`docs/plans/open-items.md` §P, the rows "ssh prompts the app can't answer well" and "CLI pin drift"._

## Part A — check how ssh and https prompts fail (the row's "Check once")

**Done 2026-09-27.** All five cases failed at once, with no hang: 0.5–1.4 s, exit 128. The results are in the
open-items row. Decided: fail fast with a clear message (its own plan, next).

**Goal:** replace the row's reasoning ("unverified") with measured results, so the decision (fail fast with a clear
message, an in-app prompt, or leave it as is) is made on facts. The decision itself stays the user's.

**Why a CLI test stands for the app:**
- **The runner's environment:** `crates/git-core/src/cli/runner.rs` adds `GIT_TERMINAL_PROMPT=0` and `LC_ALL=C`
  (plus editor variables), and runs git with stdin null in its own process group (`process_group(0)`, `:258`).
- **The terminal:** ssh decides whether it can prompt by opening `/dev/tty`, not by stdin. This session has no
  controlling terminal (`/dev/tty` gives ENXIO). To make that hold from any shell, each case runs under `setsid -w`.
- **The display:** `DISPLAY` and `WAYLAND_DISPLAY` are set, like a desktop launch. `SSH_ASKPASS` and `GIT_ASKPASS`
  are unset, no scope sets `core.askPass`, and `/usr/bin/ssh-askpass` (ssh's default) isn't installed.
- So `time setsid -w timeout 30 env LC_ALL=C GIT_TERMINAL_PROMPT=0 git … </dev/null` behaves as the app's git
  would. The T4 triage accepted this proxy (S4).

**Every case:**
- runs in a `mktemp -d` scratch dir `$T`;
- is wrapped in `timeout 30`, **inside** `setsid -w` (in the order above). `timeout` signals its own process group,
  so with `setsid` inside it, a hung ssh or askpass would survive the kill in its own session. Exit 124 is recorded
  as "hangs", the outcome this check is looking for. After a 124, `pgrep -a ssh` confirms nothing is left over;
- is timed, with its output and exit code kept;
- gets `-v` in `GIT_SSH_COMMAND` (ssh cases), and the log is kept.

**Steps:**

1. **A key with a passphrase, no agent.**
   - Setup: `ssh-keygen -q -t ecdsa -m PEM -N 'test-pass' -f $T/k && rm $T/k.pub`.
   - **Why PEM with no `.pub`:** ssh offers a key's public half first, and asks for the passphrase only after the
     server accepts it (`sshconnect2.c`, `userauth_pubkey`). GitHub would reject a throwaway key, so a key whose
     public half is readable would never reach the prompt. A PEM key with its `.pub` deleted can't be read without
     the passphrase, so ssh asks for it up front: the same prompt code a real, accepted key reaches.
   - Run: `env -u SSH_AUTH_SOCK … GIT_SSH_COMMAND="ssh -v -i $T/k -o IdentitiesOnly=yes" git ls-remote
     git@github.com:toperux/t4-git-ui HEAD`.
   - **Proof in the log:** `Trying private key: $T/k`, then `ssh_askpass: exec(/usr/bin/ssh-askpass): No such
     file or directory`, then a failure at once.
2. **The same with `-o BatchMode=yes`:** the likely "fail fast" implementation, so its message and timing are what
   the decision weighs.
3. **An unknown host key.**
   - The user's normal key and agent, plus `-o UserKnownHostsFile=$T/empty -o GlobalKnownHostsFile=/dev/null`.
   - Expect: `Host key verification failed`, at once. That relies on this machine's `StrictHostKeyChecking ask`
     (`ssh -G github.com`); record the value with the result. With `accept-new` it would silently accept, writing
     only `$T/empty`.
   - The real `known_hosts` isn't touched: the override points elsewhere, and `UpdateHostKeys` acts only after a
     successful login, which doesn't happen in steps 1–3. Check its md5 before and after.
4. **https that needs auth.**
   - `git -c credential.helper= ls-remote https://github.com/toperux/does-not-exist-t4.git`.
   - GitHub answers a missing or private repo with 401, which makes git ask for credentials.
   - Expect: `could not read Username for 'https://github.com': terminal prompts disabled`, at once.
   - There is no `/etc/gitconfig`, and no `credential.*` entry in any scope.
5. **What the user sees in the app** (optional; needs the smoke build and the harness): in the Clone dialog, clone
   the step-4 https URL and read the error text the app shows. That text is what "a clear message" would replace.

**Not covered:**
- **An askpass configured by the desktop or the user:** an exported `SSH_ASKPASS` (KDE's `ksshaskpass`, or a
  Fedora profile script), a `GIT_ASKPASS`, or `core.askPass`.
  - ssh uses `SSH_ASKPASS` for steps 1 and 3.
  - git asks for https credentials through `GIT_ASKPASS`, then `core.askPass`, then `SSH_ASKPASS`, even with
    `GIT_TERMINAL_PROMPT=0`.
  - So those setups get a dialog instead of the failure. None is set here, so the results hold for this setup only;
    the record says so.
- **An installed askpass at the default path:** it needs a package install. On a desktop it shows a dialog that
  works; the harness case (Xvfb) is already documented.
- **The terminal-launch hang:** development only, and already documented.
- **The GNOME agent's own unlock dialog for passphrase keys:** the user's key has no passphrase.

**Record:**
- The open-items row: "unverified" → measured, with each case's final error line, time and exit code, plus step 1's
  proof lines. Not whole `-v` logs: they carry key paths and fingerprints.
- The scope: "this setup: no `SSH_ASKPASS`/`GIT_ASKPASS`/`core.askPass`, `StrictHostKeyChecking ask`".
- **Stop** and ask the user for the decision: fail fast, in-app prompt, or as is.
- **Clean up:** `rm -rf $T`; check that `~/.ssh` is unchanged.

**Risk:** four read-only contacts with github.com (steps 1–4; five with the optional step-3 `BatchMode` run), and
nothing written outside `$T`.

## Part B — align the CLI pin to 2.11.5 (separate PR)

**Goal:** `release.yml` pins `tauri-cli@2.11.4`, while `package-lock.json` has `@tauri-apps/cli` 2.11.5, against the
pin's own comment ("bump both together"). Align them, and sign the repacked AppImage the way 2.11.5 signs everything
else.

**What 2.11.5 changes, checked in the sources:**
- **The CLI binds the version into every updater signature:** tauri-cli's `bundle.rs:304` calls `sign_file(…,
  Some(settings.version_string()))`, which writes `version:<x.y.z>` into the trusted comment
  (`updater_signature.rs:156`). That covers the `.exe` and the macOS `.app.tar.gz`, and also the `.deb`/`.rpm`,
  whose `.sig` files the staging globs ignore.
- **The updater compares a bound version even when not asked to:** `tauri-plugin-updater` 2.12.0 (the app's) does
  this in `verify_signed_version` (`updater.rs:1562-1596`). If the signature carries a version, it must equal the
  one `latest.json` announces, or the update fails with `SignedVersionMismatch`. `requireSignedVersion` (default
  off) only decides whether a signature with *no* version is still accepted.
- **So the versions must agree exactly.** The CLI signs with `version_string()` (from `Cargo.toml`), and
  `latest.json` announces the tag's version, with no leading `v`. The `version` job fails a tag run if the tag and
  `Cargo.toml` differ. A `workflow_dispatch` run takes both from `Cargo.toml`.
- **`signer sign --app-version`** exists at 2.11.5. The re-signed AppImage should carry the version too, or its
  signature differs in kind from the others.

**Steps:**
1. `release.yml`:
   - `cargo binstall --no-confirm --locked 'tauri-cli@2.11.5'`.
   - The re-sign step: `cargo tauri signer sign --app-version "$VER" "$FILE"`, with
     `VER: ${{ needs.version.outputs.version }}` in its `env` (`build` already `needs: version`).
   - **Refresh the stale 2.11.4 comments:**
     - the re-sign step's `--app-version` comment;
     - the `--locked` comment ("which 2.11.4 no longer compiles against");
     - the macOS verify comment ("At tauri-cli 2.11.4 the bundler does sign first"), which should now name 2.11.5
       once the dry run re-confirms the signing order.
2. `.github/scripts/verify-updater-sig.py`: no change. It verifies the global signature over the whole trusted
   comment, `version:` included, and its OK line already prints the comment.
3. **Old clients** (0.10.12 locks `tauri-plugin-updater` 2.11.0, whose source isn't in the local registry):
   - `v0.10.12` and HEAD both lock `minisign-verify` 0.2.5, which treats the trusted comment as opaque bytes under
     the global signature.
   - The CLI appends `version:` last, "so anything parsing the historical prefix keeps working".
   - **Confirmed 2026-09-27** from the 2.11.0 source (crates.io): its `verify_signature` (`updater.rs:1524-1534`)
     only runs `public_key.verify(data, &signature, true)` and never parses the trusted comment. So a `version:`
     field is covered by the signature and otherwise ignored, and 0.10.12 clients accept version-bound signatures.
4. **Docs:**
   - strike the open-items "CLI pin drift" row;
   - mark the AppImage plan's L2 triage row done.
5. **Verify:**
   - a `workflow_dispatch` dry run: all three legs green;
   - download the artifacts and check that each `.sig`'s trusted comment ends in `version:<ver>`: `.exe.sig`,
     `.app.tar.gz.sig`, `.AppImage.sig`;
   - run `verify-updater-sig.py` on all three locally.
   - An end-to-end update needs a real release, so it's the next release's AC/AZ update walk. Note it there: this is
     the first release whose signatures carry a version.

**Risk:** a rollback done by pointing `latest.json` at an older release's assets under a new version number. Every
client on updater 2.12 would refuse it (`SignedVersionMismatch`), so a rollback must be a new build. A plain re-tag
of the same version is fine.

## Decisions (2026-09-27)

- **Part A, step 5 (the app walk):** skipped. Decide from steps 1–4; walk the app only if the decision is "a clear
  message".
- **Part A, `BatchMode` on step 3:** run it (a fifth contact), to see the host-key message a fail-fast change would
  give.
- **Part B, a verify-script flag** checking the signed version against `$VER`: left out. The updater catches a
  mismatch, and CI can't produce one.
- **Part B, step 3:** download the `tauri-plugin-updater` 2.11.0 source and confirm. Done 2026-09-27: it accepts
  them (see step 3).
- **Part B's timing:** its own PR, after #18 merges.
- **`requireSignedVersion`:** an open-items row, to decide later.
