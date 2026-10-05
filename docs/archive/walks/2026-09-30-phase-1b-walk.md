# Phase 1b walk — group BJ (2026-09-30)

Close-out Phase 1b (`docs/archive/plans/2026-09-30-phase-1b-plan.md`). Rows 1–3 are the `requireSignedVersion` update
test (D4); rows 4–6 read the two Release dry runs.

## Rows 1–3 — the update test, on Windows

Setup. A `tauri build --no-bundle` of `phase-1b` at `3cf1a8a` (its code is `c2293ea`, `requireSignedVersion: true`
in `tauri.conf.json`), with `--config` holding `{"version":"0.10.13","plugins":{"updater":{"endpoints":
["http://127.0.0.1:8765/latest.json"],"dangerousInsecureTransportProtocol":true}}}`: the exe's file version read
0.10.13, the installed `%LOCALAPPDATA%\T4 Git UI\t4-git-ui.exe` 0.10.14. `python -m http.server 8765 --bind
127.0.0.1 --directory <scratch>/serve` served `latest.json`, started before the launch. The app was not running;
the store folder (`.window-state.json`, `layout.json` — one window, four tabs —, `recents.json`, `x.json`) and the
WebView2 profile were copied aside first. Launched with `smoke-launch.ps1` (isolated profile
`t4-smoke-wv2-9222`, CDP 9222, no `-Proxy`), pid 60984, driven with `docs/smoke/cdp.mjs`.

1. **Negative** — pass. Served: v0.10.12's `latest.json` with `version` set to `0.10.14`; its `windows-x86_64`
   entry is 0.10.12's setup URL and `.sig`, whose trusted comment is
   `timestamp:1790370543\tfile:T4 Git UI_0.10.12_x64-setup.exe` — no `version:` (decoded before the walk). The
   launch check fetched it (one `GET /latest.json` in the server log); Settings › Updates read *Version 0.10.14 is
   available* with **Update to 0.10.14…**. Clicked it: within 3 s the field's help read *The update signature does
   not specify the version it was signed for, which `requireSignedVersion` requires. Re-sign and re-publish this
   release, or disable `requireSignedVersion`.* — the plugin's `MissingSignedVersion` text, raised only with the
   setting on. Still pid 60984 from `target\release`; the installed exe still 0.10.14. (The plugin downloads before
   it verifies, `updater.rs:740-746`; the download itself was not observed separately.)
2. **Positive** — pass. v0.10.14's `latest.json` copied over the served file byte for byte (`cmp`). **Check now**
   → *Version 0.10.14 is available*, **Update to 0.10.14…** → the installed setup ran: at 12:36:11 pid 60984 was
   gone and pid 60652 up, running `C:\Users\me\AppData\Local\T4 Git UI\t4-git-ui.exe`, file version 0.10.14,
   the window back with its four tabs (`ssign`, `t4-git-ui` and two other repositories). **Check now**
   there (the real endpoint) → *T4 Git UI 0.10.14 is up to date*. The restarted app inherited the launch's
   environment: it answered on CDP 9222 and used the isolated WebView2 profile, so the owner's profile was never
   opened by it.
3. **Restore** — pass. The installed app closed through `CloseMainWindow()` (0 processes left). Store:
   `.window-state.json`, `layout.json`, `x.json` identical to the backup; `recents.json` differed (the opened
   repositories' timestamps) and was copied back, then `cmp` identical. WebView2 profile: `diff -rq` against the
   backup shows only the new `logs/t4-git-ui.log.2026-09-30` (the app's own log, written there), nothing else.

The manifest server was stopped afterwards; the test build's exe stays in `target\release`.

## Rows 4–6 — the dry runs

4. **First dry run** — pass. Release run 36674994686 on `phase-1b` at `bcc94eb`, dispatched 05:47Z, approved once
   (`toperux`, `signing,signing,signing` — one approval started all three legs), legs 07:16Z–07:45Z, every job green
   (`checks` skipped, as a dispatch should). Cold: no `v0-rust-build` cache reachable from the branch. In the log:
   *Pin the AppImage tools* six `OK`; ``Installed package `tauri-cli v2.11.5` `` on all three legs and
   ``Installed package `ssign v0.1.6 (…rev=585a88e7…)` `` on Windows; the Linux bundle log's `Downloading` grep
   passed (the only `Downloading` lines are cargo's crate downloads outside it); *Check the Windows signature*:
   three `Valid | CN=Open Source Developer Christopher Montevirgen, O=Open Source Developer, L=Makati, S=Metro
   Manila, C=PH | F06C1EC1FAC43DFEC92FBE47B0FC959D1CE38151 | timestamped: True`; *Verify the macOS signature*:
   bundle, updater tarball and dmg each `valid on disk` with `certificate leaf = H"53effb03…"`; `verify`: `OK` for
   the setup, the `.app.tar.gz` and the AppImage, each comment ending `version:0.10.14`
   (`python3-cryptography 41.0.7` was already on `ubuntu-latest`); `publish` made draft 399818832 under
   `dry-run-36674994686` and the check step deleted it — `gh release list` shows only real releases and the tag ref
   is 404. Timings by API (change review pass 3): the CLI install took 6 min on Linux, 9 on macOS, 10.7 on
   Windows; `ssign` 3.3 min; the legs ran 07:16–07:44:50Z, `publish` ended 07:45:48Z. The run's AppImage in WSL: `--appimage-version` → `type2-runtime/commit/dd6cebe`. CI run 36674998014 on
   the branch (`checks.yml` with the pins and the new guard) green on all three OS.
5. **Dry run on `main`** — pass. Release run 36753506004 on `main` at `edcc19c`, after the four repo-level secrets
   were deleted (O8) and with SHA pinning required (O7); approved once by API on the owner's word (`toperux`,
   `signing,signing,signing`), legs 17:44Z–18:13Z on 2026-09-30 (GitHub's UTC timestamps), every job green
   (`checks` skipped). Cold again: no build cache on `main`. In the log: *Pin the AppImage tools* six `OK`;
   ``Installed package `tauri-cli v2.11.5` `` on all three legs and `ssign v0.1.6` on Windows; no "bundler
   downloaded a tool" failure; *Check the Windows signature*: three `Valid | … |
   F06C1EC1FAC43DFEC92FBE47B0FC959D1CE38151 | timestamped: True`; *Verify the macOS signature*: three
   `certificate leaf = H"53effb03…"`; `verify`: `OK` three times, each comment ending `version:0.10.14`; `publish`
   made a draft under `dry-run-36753506004` and the check step deleted it — `gh release list` shows only real
   releases and the tag ref is 404. The run's AppImage in WSL: `--appimage-version` → type2-runtime `dd6cebe`. So
   the environment's six secrets alone are enough, and Release has run under SHA pinning (D7).
6. **The setup by hand** — pass. `Get-AuthenticodeSignature` on row 4's run's `T4-Git-UI_0.10.14_x64-setup.exe`:
   `Valid`, the subject above, thumbprint `F06C…8151`, not-after 2027-09-22, timestamped by *Certum Timestamp 2026*.
   The same on row 5's run's setup: `Valid`, thumbprint `F06C…8151`, timestamped by *Certum Timestamp 2026*. The
   owner's *Properties › Digital Signatures* look (2026-10-01, on row 5's setup from run 36753506004) names "Open
   Source Developer Christopher Montevirgen".

## Outward actions

Each on the owner's word at the time (the plan's *Outward actions*). **O1** (2026-09-30) created the `signing`
environment, the owner its required reviewer, with deployment-branch policies for branch `main`, tag `v*` and, for
the first dry run, branch `phase-1b`. **O2** (2026-09-30) set its six secrets. **O3** (2026-09-30) pushed
`phase-1b`. **O4** (2026-09-30) ran the first dry run, Release run 36674994686, and CI run 36674998014 on the branch
(row 4). **O5** (2026-10-01) pushed `main` `ff79e41..edcc19c`; CI run 36750662905 green on all three OS. **O6**
(2026-10-01) removed the temporary `phase-1b` policy and deleted `origin/phase-1b`; the environment allows branch
`main` and tag `v*` only. **O7** (2026-10-01) turned on *Require actions to be pinned to a full-length commit SHA*
(`sha_pinning_required: true`); a CI dispatch on `main`, run 36752751163, green on all three OS under it. **O8**
(2026-10-01) deleted the four repo-level secrets (the repo's list is empty; the environment holds six) and ran the
second dry run, Release run 36753506004 on `main` (row 5).

## Hashes

The squash of 2026-10-01 (plan R4). Rows 1–4 cite pre-squash hashes; on `main`:

| Pre-squash | On `main` | What |
|---|---|---|
| `9dba89b` | `fd04111` | every action pinned by commit |
| `f036922` | `ba289f6` | the Tauri CLI from crates.io (plus `181e913`'s comment fix) |
| `8c0d046` | `cfcf75f` | the signing environment, the build/bundle split, Windows signing (plus the README and release-body text from `c2293ea`, `181e913` and `7504012`) |
| `7b127e2`, `1d08510` | `90a0a71` | the `squashfs-tools` floor and the `verify` job |
| `024596f` | `804f165` | the dispatch's dry-run publish |
| `c2293ea` | `f27dfef` | `requireSignedVersion` on (rows 1–3's build, `3cf1a8a`, had this code) |
| `5bb35bc`, `456e727`, `3cf1a8a`, `bcc94eb`, `6dc0565`, `181e913`, `3fb2d96`, `a381fe7`, `7504012`, `72be9aa`, `1ffe78e`, `50e6780` | `edcc19c` | the docs, the plan, this record and the review fixups |

Row 4's run, 36674994686, ran at `bcc94eb`, whose workflow differs from `main`'s by three text lines: a comment, the
comma in the publisher name, and a dropped macOS sentence.
