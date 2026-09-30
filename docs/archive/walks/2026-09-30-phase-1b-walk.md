# Phase 1b walk — group BJ (2026-09-30)

Close-out Phase 1b (`docs/plans/2026-09-30-phase-1b-plan.md`). Rows 1–3 are the `requireSignedVersion` update test
(D4); rows 4–6 read the two Release dry runs and are filled in below as they happen.

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
   gone and pid 60652 up, running `C:\Users\toper\AppData\Local\T4 Git UI\t4-git-ui.exe`, file version 0.10.14,
   the window back with its four tabs (`ssign`, `t4-git-ui`, `t4-markdown-viewer`, `t4-todo-vault`). **Check now**
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
5. **Dry run on `main`** — _pending O8_.
6. **The setup by hand** — `Get-AuthenticodeSignature` on the run's `T4-Git-UI_0.10.14_x64-setup.exe`: `Valid`,
   the subject above, thumbprint `F06C…8151`, not-after 2027-09-22, timestamped by *Certum Timestamp 2026*. The
   *Properties › Digital Signatures* look is the owner's (the file is at the scratchpad's `bj/art/packages-Windows`).
