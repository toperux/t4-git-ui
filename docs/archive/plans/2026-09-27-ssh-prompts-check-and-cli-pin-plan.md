# Plan: the ssh/https prompt check, and the CLI pin alignment

_Written 2026-09-27, revised through review round 3. Part B re-checked and revised 2026-09-28 (round 4: three
decisions, B-1 to B-3), then reviewed in passes until one found nothing (pass 8). **Part B executed 2026-09-28** on
`ci/cli-pin-2.11.5`, and the plan archived with it. **Shipped without a PR:** on the user's word the squashed
commit went straight to `main`, so the PR steps below became CI on that push (`ci.yml` runs on pushes to `main`)
and a `workflow_dispatch` run of `release.yml` on `main`; B-3's *early case* no longer applies, since the guard is
on `main` from the push. Two items from the triage that can be done now. Part A goes in PR
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

**Re-checked 2026-09-28** (review round 4, against `main` after #18, `bb0a7f4`):
- `release.yml:158` still pins 2.11.4; `package-lock.json` has `@tauri-apps/cli` 2.11.5 (`package.json`: `^2`).
- The app locks `tauri-plugin-updater` 2.12.0. Its `verify_signed_version` (`updater.rs:1562-1596`) is as described
  above: a bound version must equal the announced one (semver compare, a leading `v` ignored).
- **tauri-cli 2.12.0 is out** (2026-09-26, bundler 2.10.0). Decided to stay on 2.11.5 (B-1, below).
- 2.11.5 depends on `tauri-bundler ^2.9.4`, so the macOS source build still needs `--locked` (without it, cargo
  takes bundler 2.10.0: dispatch run 36257070680's macOS leg, 2026-09-26; the re-run with `--locked`, 36258407743,
  was green).

**Steps:**
1. `release.yml`:
   - `cargo binstall --no-confirm --locked 'tauri-cli@2.11.5'`.
   - The re-sign step: `cargo tauri signer sign --app-version "$VER" "$FILE"`, with
     `VER: ${{ needs.version.outputs.version }}` in its `env` (`build` already `needs: version`).
   - **Refresh the stale 2.11.4 comments:**
     - the re-sign step's `--app-version` comment (`:248-250`): say why the flag is there — `tauri build` at 2.11.5
       binds the version into the other signatures, so the re-signed AppImage carries it too;
     - the `--locked` comment (`:155-157`): the source build otherwise takes the newest `tauri-bundler`, which the
       pinned CLI may not compile against (2.11.5 asks for `^2.9.4`, and 2.10.0 broke 2.11.4);
     - the macOS verify comment (`:281-284`, "At tauri-cli 2.11.4 the bundler does sign first"): name 2.11.5. The
       dry run proves it: that step fails red if the order changed.
   - No comment in `release.yml` may contain `binstall` and `tauri-cli@` on one line: the guard (step 2) reads the
     pin from that line.
2. **`checks.yml`: a drift guard (B-2).** Dependabot's npm group bumps `@tauri-apps/cli` in `package-lock.json`
   (the range is `^2`) and never touches `release.yml`, so the drift would come back with the next CLI release.
   - A step right after `setup-node` (`checks.yml:33`), so it fails before the long build, with
     `if: runner.os == 'Linux'`: it is platform-independent, so checked once, as Format is:
     ```bash
     set -euo pipefail
     pin=$(grep -oP "binstall .*'tauri-cli@\K[^']+" .github/workflows/release.yml) \
       || { echo "no binstall 'tauri-cli@<version>' line in release.yml" >&2; exit 1; }
     lock=$(node -p "require('./package-lock.json').packages['node_modules/@tauri-apps/cli'].version")
     [ "$pin" = "$lock" ] || { echo "release.yml pins tauri-cli@$pin, package-lock.json has @tauri-apps/cli $lock: bump both together" >&2; exit 1; }
     ```
     A pin line the `grep` no longer finds fails with its own message, rather than comparing an empty string.
   - `ci.yml` runs `checks.yml` on every PR to `main`, a Dependabot one included, and `release.yml` on every tag.
     So a bump that moves only one side goes red on its PR, naming both versions; the fix is to edit `release.yml`
     in that same PR.
   - It fails on `main` today (2.11.4 against 2.11.5), so it lands in the same PR as the bump.
   - **The next Dependabot npm group PR (B-3).** npm's latest `@tauri-apps/cli` is 2.12.0, so the next group PR
     (weekly; likely around 2026-10-01) will most likely carry 2.11.5 → 2.12.0 and go red on the guard, holding every
     other npm bump in the group. The procedure: comment `@dependabot ignore @tauri-apps/cli minor version` on that
     PR (on the user's word: it is an outward action). That **closes** the group PR; the other bumps come back at the
     next weekly run (or sooner through *Insights › Dependency graph › Dependabot › Check for updates*). No config
     change. The ignore is stored by GitHub, not in the repo, and covers every later minor too (2.13, …):
     `@dependabot show @tauri-apps/cli ignore conditions` shows it. To lift it, comment
     `@dependabot unignore @tauri-apps/cli` on an **open** npm group PR (it closes that PR and opens a new one). It
     has to be lifted even if the 2.12.0 bump is done by hand, or later minors are never proposed. If that PR
     arrives before this one merges, it goes green (its checks run `main`'s `checks.yml`, which has no guard yet):
     apply the ignore anyway, and don't merge it with the CLI bump in it, or this PR's guard goes red against its
     own 2.11.5 pin.
3. `.github/scripts/verify-updater-sig.py`: no change. It verifies the global signature over the whole trusted
   comment, `version:` included, and its OK line already prints the comment.
4. **Old clients** (0.10.12 locks `tauri-plugin-updater` 2.11.0, whose source isn't in the local registry):
   - `v0.10.12` and HEAD both lock `minisign-verify` 0.2.5, which treats the trusted comment as opaque bytes under
     the global signature.
   - The CLI appends `version:` last, "so anything parsing the historical prefix keeps working".
   - **Confirmed 2026-09-27** from the 2.11.0 source (crates.io): its `verify_signature` (`updater.rs:1524-1534`)
     only runs `public_key.verify(data, &signature, true)` and never parses the trusted comment. So a `version:`
     field is covered by the signature and otherwise ignored, and 0.10.12 clients accept version-bound signatures.
5. **Docs** (in the same PR):
   - `open-items.md` §P: the "CLI pin drift" row moves to `open-items-done.md` §P, closed with the PR; the
     `requireSignedVersion` row's precondition becomes "from the first release after this PR"; a new row, *the
     tauri-cli 2.12.0 bump*: not planned yet, and the guard keeps both sides in step. Written now, with B-3's procedure
     in full, since the ignore is applied later on a Dependabot PR and nothing else records it: when the npm group PR
     carrying 2.12.0 goes red, comment `@dependabot ignore @tauri-apps/cli minor version` (on the user's word); it is
     then active (`@dependabot show @tauri-apps/cli ignore conditions`), covers every later minor, and is lifted by
     `@dependabot unignore @tauri-apps/cli` on an open npm group PR, even if the bump is done by hand. When the
     ignore is applied, the row gets *ignore active since <date>*: in this change if the ignore comes while it is
     unmerged (step 2's early case; before the squash, or as a new commit on the branch once it is pushed),
     otherwise a docs commit on `main`, pushed on the user's word;
   - the AppImage plan: its L2 triage row done, its re-sign step's `:133-134` note (the flag is in now), and the
     *pin vs `package-lock.json`* bullet at `:222` (done). `:24` and L3 (`:235`) are history and stay;
   - the close-out plan: Phase 1b's Tauri CLI row (now 2.11.5) and its `ssign` row (the tool hashes stay: 2.11.4
     and 2.11.5 both lock `tauri-bundler` 2.9.4, so check them once rather than re-derive); the release gate's *If
     the CLI-pin PR has landed* paragraph (`:99-101`: it has, so the next release is the first with version-bound
     signatures; its pointer becomes this plan's *Verify › End to end*, at the archived path); the Linux track's
     *touches only `release.yml`* (`:174`, now `release.yml` and `checks.yml`) and its CLI-pin bullet (done);
   - this plan: status done, then archived to `docs/archive/plans/`, with its references updated
     (`open-items.md` §P's *Measured 2026-09-27* line, `2026-09-27-ssh-fail-fast-plan.md:4`, the close-out plan).

**Verify:**
- **Local, before any push:**
  - the guard run against the branch: pass at 2.11.5 = 2.11.5;
  - the same against a scratch copy of `release.yml` with the pin changed: fails with the message; and against one
    with the `binstall` line removed: fails with its own message (no silent empty compare).
- **CI, after the push (each push on the user's word):**
  - the PR's `ci.yml` run green on all three legs, the guard step included;
  - a `workflow_dispatch` run of `release.yml` on the branch (`gh workflow run release.yml --ref <branch>`): all
    three build legs green, the macOS signature step included;
  - `gh run download` the artifacts; each `.sig`'s trusted comment (base64-decode, line 3) ends in
    `version:<Cargo.toml version>`: `.exe.sig`, `.app.tar.gz.sig`, `.AppImage.sig`;
  - `verify-updater-sig.py` on all three, in WSL (the Windows Python has no `cryptography`; WSL has 41.0.7).
- **End to end:** needs a real release, so it's the next release's gate (close-out plan): that update is the first
  whose signatures carry a version.

**How it runs (the repo's workflow, `CLAUDE.md`):**
1. On the user's go: branch `ci/cli-pin-2.11.5` off `main`, the edits, the local verify.
2. The change review loop until a pass finds nothing; decisions asked as they come up.
3. Triage: the skipped findings and accepted limits, one at a time with the user.
4. Squash to one commit. Ask, then push the branch and open the PR (its `ci.yml` run is the guard's CI check).
5. Ask, then dispatch `release.yml` on the branch; check the artifacts.
6. A fix CI calls for is a new commit on the branch (after its own review loop), never a force-push. Ask before
   merging, then `gh pr merge <n> --squash --admin --subject 'ci: …' --body-file -`, the body from a quoted heredoc
   ending in the attribution line, so `main` gets one commit in the repo's style. `--admin` because the ruleset
   (*Protect main*) wants an approving review the user can't give their own PR; the user is its bypass actor, and
   gh uses the bypass only with `--admin` (as #17 was merged).

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
  them (now step 4).
- **Part B's timing:** its own PR, after #18 merges.
- **`requireSignedVersion`:** an open-items row, to decide later.

## Decisions (2026-09-28, review round 4)

- **B-1, the version:** stay on 2.11.5, what `package-lock.json` already has and what the source checks above were
  made against. 2.12.0 (bundler 2.10.0) comes later as its own bump.
- **B-2, the drift coming back:** a guard in `checks.yml` (step 2), not a Dependabot ignore rule and not an
  accepted limit.
- **B-3, the next Dependabot npm group PR** (found in review pass 2): a one-off `@dependabot ignore @tauri-apps/cli
  minor version` comment on it (step 2), lifted with `@dependabot unignore` on an open npm group PR when the 2.12.0
  bump is planned. Not a config ignore.

## Triage (2026-09-28) — the change review's skipped findings and accepted limits

The change review ran in passes until one was clean; T1–T6 came from pass 1, T7 from pass 3 (after T2's fix).
Decided one by one with the user:

| # | Item | Decision |
|---|---|---|
| — | Docs say the PR landed / closed 2026-09-28 before it merges | Keep the date; re-check every such date at the merge and correct it if the merge slips |
| T1 | `release.yml`'s macOS comment names 2.11.5 as signing first before any run confirmed it | Deferred: an `open-items.md` §P row, closed when the dispatch run's macOS leg is green |
| T2 | The guard's `[0-9.]+` stops at a `-`: a prerelease pin or lock gives a false red or green | Fixed: `[^']+` compares the whole pinned value (step 2's snippet updated to match). Re-tested: equal, differ, pin line missing, a prerelease pin against a plain lock (red), a prerelease on both sides (green) |
| T3 | A lock with no `@tauri-apps/cli` makes the guard fail with a node `TypeError`, not its message | Accepted, closed: still red, and the trace names the key |
| T4 | Two `binstall … 'tauri-cli@` lines give a two-line pin and a confusing red | Accepted, closed: still red; `release.yml` has one install step, and the comment at the pin says the guard reads it |
| T5 | `signer sign --app-version` at 2.11.5, and 2.11.5 locking bundler 2.9.4, can't be checked in the local registry | Accepted, closed: checked in the 2.11.5 crate source from crates.io — `--app-version` in *What 2.11.5 changes* (2026-09-27), and both, with the bundler lock, again by plan review pass 2 (2026-09-28, round 4); the dispatch run proves the flag |
| T6 | The AppImage plan's `:133` ("so this matches today") is stale | Accepted, closed: history text, resolved by the *Added 2026-09-28* note under it |
| T7 | A stray space inside the quoted pin (`'tauri-cli@2.11.5 '`) goes red, but the space doesn't show in the message | Accepted, closed: still red, and binstall would reject that value anyway |
