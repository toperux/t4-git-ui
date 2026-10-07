# Plan: the two open Dependabot security bumps before v0.10.22, 2026-10-08

_Written 2026-10-08. Status: scope (option A, both bumps) taken by the owner 2026-10-08. Plan review pass 1: 3 nits fixed
(a garbled step, a duplicate gate, the dry runs folded in); pass 2: 2 nits fixed (a memory reference, the
updater gap overstated), decisions U1 and U2 raised; U1 and U2 taken (A, A); pass 3: 1 nit fixed (the goal said "no code changes" past U2); pass 4:
clean. Go given 2026-10-08; S1 raised in step 1 and taken (A); gates green (cargo test 412 passed, 0 failed). Change review pass 1: 1 finding fixed
(the alerts call read only the first page and filtered client-side; now `?state=open`); pass 2: clean._

**Goal:** close GitHub's two open Dependabot alerts on `main` with lockfile-only patch bumps, so they ride along in
v0.10.22. No app code changes; the only other edit is the release-skill check from decision U2.

## The alerts

Both were opened 2026-10-06, a day before v0.10.21 shipped, and neither is in `open-items.md`.

| Alert | Severity | Package | Now | Fixed in | Ships in the app? |
|---|---|---|---|---|---|
| #2 | medium | `rustls` (cargo) | 0.23.44 | 0.23.45 | Yes. Its only path is `tauri-plugin-updater` → `reqwest` (the update download over HTTPS). |
| #3 | high | `source-map-js` (npm) | 1.2.1 | 1.2.2 | No, dev only (vite → postcss for the build, jsdom → css-tree for tests); `npm ls --omit=dev` is empty. |

- **rustls:** TLS 1.3 handshake messages are accepted across encryption-level boundaries. Not measured: whether that is
  exploitable against the updater's connection to GitHub.
- **source-map-js:** a crafted source map with indexed section offsets can hang the event loop (denial of service).

Both ranges allow the fix: nothing pins `rustls` directly (no workspace `Cargo.toml` names it), and both npm dependents
ask for `source-map-js` `^1.2.1`.

## Why not merge Dependabot's PRs

Dependabot opened #22 (`rustls`) and #23 (`source-map-js`) on 2026-10-06, based on `e93221f`; their CI is green.

- **#22 changes more than `rustls`.** Its `Cargo.lock` also switches `tempfile` 3.27.0's dependency from `getrandom`
  0.4.3 to 0.3.4. That is a resolver side effect the alert doesn't need.
- **Both are based on an old `main`,** so they would need a rebase, and a GitHub merge is a push of its own.

So the bumps are made locally with precise versions. Dependabot closes both PRs by itself once `main` no longer has the
vulnerable versions. **Not verified:** that it closes them promptly. If they stay open, closing them is a separate ask.
Don't delete the `dependabot/*` branches by hand: a Dependabot branch can back a newer open PR (#21 was closed that way
by mistake on 2026-10-05).

## Steps

Both bumps were dry-run on 2026-10-08 with nothing written. `cargo update -p rustls --precise 0.23.45 --dry-run`
printed only "Updating rustls v0.23.44 -> v0.23.45". `npm update source-map-js --dry-run` printed only "change
source-map-js 1.2.1 => 1.2.2". The checks below confirm the real run matches.

1. `cargo update -p rustls --precise 0.23.45` → verify: the `Cargo.lock` diff touches only the `rustls` entry (version
   and checksum). Any other line goes back to the owner before going further.
2. `npm --prefix "F:/src/_ pet projects/t4-git-ui" update source-map-js` → verify: the `package-lock.json` diff
   touches only `node_modules/source-map-js` (version, resolved, integrity), and `npm ls source-map-js` shows 1.2.2 in
   both places. Any other change goes back to the owner.
3. Gates, uppercase `F:/`, no `cd`: `npm run build` (`tsc && vite build`; the bumped package is build tooling),
   `npm test`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets`, `cargo test --workspace`.
4. Two commits: `build(deps): bump rustls to 0.23.45 and source-map-js to 1.2.2 (Dependabot alerts #2, #3)` (the two
   lock files), then `docs: the release skill checks open Dependabot alerts and PRs` (the skill and this plan).
5. Change review: read the two lockfile diffs, the skill diff and the gate output.
6. Push `main`: a separate go.
7. Check the alerts read "fixed" and PRs #22 and #23 are closed (`gh api …/dependabot/alerts`, `gh pr list`).

## What isn't covered

- **The updater's HTTPS path.** No gate exercises it, and the release skill has no in-app update step. Unless the
  release gate adds one, the first real run of the new `rustls` is a user's update check. Decision U1 below adds one on
  Windows.
- **Why the alerts went unnoticed for two days:** Dependabot opened PRs but nothing in the workflow looks at open PRs or
  alerts before a release. Decision U2 below adds that check to the release skill.

## Decisions

- **U1 — an in-app update in the v0.10.22 release gate:** taken 2026-10-08, option A. After v0.10.22 is published,
  the Windows VM installs v0.10.21, updates in the app, and checks it restarts on v0.10.22. A failure means v0.10.23.
  Linux (AppImage) is not walked. If it passes, check whether it closes the update half of smoke group AC.
- **U2 — a "no open Dependabot alerts or PRs" line in the release skill's gates:** taken 2026-10-08, option A. Step 1
  of `.claude/skills/release/SKILL.md` now lists open alerts and Dependabot PRs; each goes to the owner (fix, defer,
  accept) before tagging. Both commands were run on 2026-10-08 and list #2, #3 and PRs #22, #23. Edited in the working
  tree during planning; it is committed with step 4.
- **S1 — the extra `Cargo.lock` line (raised in step 1):** taken 2026-10-08, option A (accept). The real `cargo update -p
  rustls --precise 0.23.45` also moved `tempfile` 3.27.0 from `getrandom` 0.4.3 to 0.3.4, the same line as PR #22; the
  dry run had not shown it. `tempfile` allows `>=0.3.0, <0.5`, and both `getrandom` versions stay in the lock (0.4.3
  for two other crates, 0.3.4 for tauri and others), so no new crate enters the build. The gates exercise `tempfile`
  through git-core's tests. Why cargo picks 0.3.4 is not checked.
