# Plan: the AppImage's blank window on Ubuntu 26.04

_Written 2026-09-26. Source: `docs/plans/open-items.md` §P (the AppImage row) and
`docs/archive/walks/2026-09-26-group-ac-linux-walk.md`. Line numbers are as of `af1d3db`._

## Status (2026-09-27)

- **Implemented** on `linux-smoke-and-fixes`:
  - `.github/scripts/appimage-strip.sh`, `appimage-digest.py` and `verify-updater-sig.py`;
  - three steps in `release.yml`, plus a line in the release body;
  - the README note, and the docs below.
- **Step 4.1 passed locally:**
  - with jammy's squashfs-tools 4.5 binaries, the offset stays 944632 and only `-client` goes;
  - the digest emulation reproduces 0.10.12's stored `.digest_md5`, and after the repack the runtime differs from
    the original only in those 16 bytes;
  - the result renders on Xvfb, and the original stays blank;
  - the verify script accepts the published pair, and rejects the stripped file, a wrong key, a tampered comment
    and the legacy `Ed` format.
- **`workflow_dispatch` run 36257070680 (2026-09-27): the Linux leg passed.**
  - Its logs show the original's digest checked, `libwayland-client` removed, the digest rewritten, the re-sign, and
    the signature verified against the real key. That settles L3 and L7.
  - The downloaded AppImage matches its sha256 and passes both checks locally. It renders on Xvfb (2/2).
  - The macOS leg failed before building, for an unrelated reason. `cargo binstall` fell back to a source build of
    `tauri-cli@2.11.4` without `--locked`, and 2.11.4 doesn't compile against the newest `tauri-bundler`.
    `--locked` was added; a re-run proves it.
- **Desktop check (2026-09-27):** the CI AppImage renders on the VMware desktop with
  `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
- **Re-run 36258407743 (2026-09-27, `480fed9`): all three legs green**, the macOS one included with `--locked`.
- **Left:** the release walks.

## What is known

- **Cause, by symbol.** The AppImage is built on `ubuntu-22.04` (`release.yml:111`), and linuxdeploy bundles that
  system's `libwayland-client.so.0` (1.20) into `usr/lib/`. The host's Mesa `libEGL_mesa.so.0` needs
  `libwayland-client` and uses `wl_display_create_queue_with_name`, `wl_display_dispatch_queue_timeout` and
  `wl_fixes_interface`, which 1.20 lacks. So EGL init fails, and WebKit's web process aborts with
  `EGL_BAD_PARAMETER`.
  - **Scope:** any host whose Mesa is built against libwayland 1.23+ (26.04 ships 1.24), not only 26.04.
  - **Moving the runner won't fix it:** a 24.04 runner still ships libwayland 1.22.
- **Upstream agrees.** The AppImage excludelist has excluded `libwayland-client.so.0`, and only that, since
  2024-11 (pkg2appimage#559, mesa#11316). Tauri's mirrored linuxdeploy (`binary-releases`, tag `linuxdeploy`,
  2024-07-29) predates it.
- **The AppImage is always X11.** The GTK plugin's AppRun hook (`apprun-hooks/linuxdeploy-plugin-gtk.sh`) exports
  `GDK_BACKEND=x11` unconditionally, so on a Wayland desktop it runs under XWayland.
  - The walk's "native Wayland" run was therefore XWayland too. It differed from the blank XWayland run only by
    `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
- **Measured here.** Xvfb with software GL, the published 0.10.12 repacked, 2 runs each, with an isolated `HOME`
  and D-Bus:

  | Build | DMA-BUF renderer | Result |
  |---|---|---|
  | as shipped | on | blank, `EGL_BAD_PARAMETER` |
  | as shipped | off | blank, `EGL_BAD_PARAMETER` |
  | all four `libwayland-*` removed | on or off | renders |
  | `-client`, `-egl`, `-cursor` removed | on | renders |
  | **`-client` only removed** | on | renders |

  - **Remove `-client` only.** It is what fails. It is what upstream excludes. And every library left in keeps the
    host's dependencies as they are today.
  - **`-server` must stay in any case.** The bundled `libwebkit2gtk-4.1.so.0` needs `libwayland-server.so.0`. A host
    without system WebKit (on 26.04 only webkit2gtk, webkitgtk-6.0 and mutter pull it in) would fail to start.
  - **The other shadowed libraries are fine.** `libzstd`, `libelf`, `libffi`, the xcb libraries, `libXau`,
    `libXdmcp` and `libbsd` miss no symbol that the host's Mesa (`libgallium`, `libEGL_mesa`, `libLLVM`, the
    Vulkan drivers) uses.
  - **Not covered:** the NVIDIA proprietary driver.
- **The VMware desktop also needs the DMA-BUF renderer off.** That is XWayland on its GPU, not the bundle
  (Step 1).
- **No supported hook to exclude libraries.**
  - The bundler's AppImage settings are only `files`, `bundle_media_framework` and `bundle_xdg_open`
    (`tauri-bundler` 2.9.4, `settings.rs:220-227`). `files` lands under `usr/`.
  - linuxdeploy's `--exclude-library` is a flag with no environment variable, and the bundler passes fixed
    arguments.
  - So the fix is a repack after `cargo tauri build`.
- **The repack works.**
  - The type-2 runtime is the file's first *offset* bytes (944632 in 0.10.12), and the rest is a zstd squashfs.
  - `unsquashfs -o <offset>`, remove the library, `mksquashfs -comp zstd -root-owned`, then runtime + squashfs gave
    a working AppImage.
  - It mounts nothing and downloads nothing: jammy's `squashfs-tools` 4.5 has every option used, and zstd.

## Step 1 — the user: one desktop check (decides Step 3)

**Result (2026-09-27, VMware SVGA II, GNOME Wayland):** a) blank, b) renders, and the `.deb` under XWayland is blank
too.
- So the DMA-BUF fault is XWayland on this VM's GPU, not the bundled WebKit.
- **Decided:** no switch in the app. Step 3 becomes a README note; see there.

On the Wayland desktop, one run at a time. Close every other copy first, the installed app and the previous run
alike: they share an identifier, so a new launch hands off to one that is running.

```bash
~/t4-ai-test/client-only.AppImage                                    # a) -client removed
WEBKIT_DISABLE_DMABUF_RENDERER=1 ~/t4-ai-test/client-only.AppImage   # b) plus DMA-BUF off
```

- **a) renders:** skip Step 3.
- **Only b) renders:** do Step 3. Before deciding its scope, also run the installed `.deb` under XWayland:
  `GDK_BACKEND=x11 t4-git-ui` (DMA-BUF on).
  - **The `.deb` renders:** the fault is jammy's bundled WebKit with a new Mesa. It likely hits real GPUs too, and
    turning the renderer off for every AppImage is justified.
  - **The `.deb` is blank too:** the fault is XWayland on this VM's GPU. Turning it off everywhere costs every
    AppImage user for one VM's sake, and it becomes a decision.
- **Neither renders:** try `~/t4-ai-test/stripped.AppImage` (all four removed) the same two ways.
  - If that renders, the fix strips the same set; the host-dependency cost of `-server` is then a decision.
  - Otherwise, stop and investigate against the full `LD_PRELOAD` workaround.

## Step 2 — the repack, sign and verify steps in `release.yml`

**Three Linux-only steps** (`if: runner.os == 'Linux'`) between **Build the packages** and **Stage the
artifacts**: repack (items 1–4 and 7), sign (5), verify (6).

- `squashfs-tools` and `python3-cryptography` go on the existing Linux dependency line.
- Every path is quoted: the file name has spaces (`T4 Git UI_<ver>_amd64.AppImage`).
- Work files go in `$RUNNER_TEMP`, never under the bundle directory, where staging's `find` would pick them up.

1. **Find the image.** `find "$bundle/appimage" -maxdepth 1 -name '*.AppImage'`: exactly one, else fail. The
   bundler leaves `T4 Git UI.AppDir` beside it (`linuxdeploy.rs:86`).
2. **Offset, without running the file:** the ELF section-header offset plus entry size × count, from its header
   (`e_shoff + e_shentsize * e_shnum`; `od` or a few lines of Python). Check it with `unsquashfs -s -o "$off"`,
   which fails on a wrong offset. Then `appimage-digest.py --check` on the original: it proves the digest
   emulation still matches the tool that built the image.
   - `--appimage-offset` would also work (the runtime is static-pie, no FUSE), but this way nothing from the
     bundle is executed by the new steps.
3. **Unpack and remove.** `unsquashfs -o "$off" -d "$RUNNER_TEMP/root"`, then
   `rm "$RUNNER_TEMP/root/usr/lib/libwayland-client.so.0"` (per Step 1). Fail if the library isn't there: a silent
   no-op would mean the bundler changed and the step needs another look.
4. **Repack.**
   - `mksquashfs … -comp zstd -root-owned -noappend -mkfs-time 0 -quiet -no-progress`.
   - `head -c "$off" "$f" > "$RUNNER_TEMP/new"`, then append the squashfs.
   - `mv` it over `$f` and `chmod 755`. Never `> "$f"` while reading `$f`: the redirect truncates it first.
   - `appimage-digest.py --write`, then `--check`: the runtime's `.digest_md5` for the new payload (L1).
5. **Re-sign.** In its own step with `TAURI_SIGNING_PRIVATE_KEY` / `_PASSWORD` in `env`, and nothing else:
   `cargo tauri signer sign "$f"`, which overwrites `<file>.sig`.
   - The published `.sig` has no `version:` binding, and 2.11.4 lacks `--app-version`, so this matches today.
   - Add `--app-version "$ver"` if the pinned CLI is bumped to one where `tauri build` binds it (2.11.5 does).
6. **Verify the signature** against the shipped pubkey (`plugins.updater.pubkey` in `tauri.conf.json`), in a step
   with no secrets.
   - A `.sig` for the pre-repack file would break every AppImage user's update silently. It is the Linux
     counterpart of the macOS signature check.
   - `minisign` isn't packaged for jammy. Use `python3-cryptography` (jammy main, 3.4.8; also installed here) and
     about 20 lines of Python 3.10 (no `hashlib.file_digest`).
   - **Format** (checked against the published 0.10.12 files): both the pubkey and the `.sig` are base64 of a whole
     minisign file.
     - Pubkey line 2 is `Ed` + key id (8 bytes) + key (32).
     - `.sig` line 2 is `ED` (prehashed) + key id + signature (64).
   - **Checks:**
     - The algorithm is `ED`, and the key ids match, each with a clear message.
     - `Ed25519(blake2b-512(file))`.
     - The global signature over signature + the trusted comment's text.
   - The script is its own file under `.github/scripts/`, so it can be tested locally.
7. **Check the result.** `unsquashfs -l -o "$off" "$f"` shows no `libwayland-client`.

**Comment it in the file's style:**
- Why: the build host's `libwayland-client` breaks a newer host's Mesa EGL.
- Why a repack: there is no exclude hook.
- That the runtime's `.digest_md5` is rewritten (`appimage-digest.py`, decided in L1), after checking that the
  emulation reproduces the original's.
- When to drop it: Tauri's linuxdeploy picks up the upstream excludelist. Moving the runner doesn't help (see
  above).

**Unaffected:** the `.deb` and `.rpm` (system WebKitGTK and libraries). So are `checks.yml`, the sha256 sidecars
(staged after the repack) and `latest.json`, which `publish` builds from the staged `.sig`.

## Step 3 — the DMA-BUF workaround, documented (decided 2026-09-27)

Step 1 showed the remaining blank window is XWayland plus DMA-BUF on the VM's GPU: the system `.deb` is blank under
`GDK_BACKEND=x11` too. The AppImage always runs under XWayland, so an affected setup (this VM; NVIDIA is a commonly
reported case) still gets a blank window after Step 2.

**Decided:** no switch in the app. Turning the renderer off for every AppImage user would slow all of them for the
sake of some setups.

Instead, a README note under the Linux download line: if the AppImage opens a blank window, run it with
`WEBKIT_DISABLE_DMABUF_RENDERER=1`. The in-app update's restart keeps the environment, so an updated copy launched
that way keeps working.

## Step 4 — verify

1. **Local:**
   - Run Step 2's commands (not the signing) on the published 0.10.12, and check the image renders on Xvfb.
   - Check the verify script with a throwaway key (`cargo tauri signer generate`): it passes with that key, fails
     against the original `.sig`, and fails with the wrong pubkey.
   - Local `squashfs-tools` is 4.7, not the runner's 4.5; only the CI run proves those.
2. **CI:** run `workflow_dispatch` on the branch; it builds without checks or publishing.
   - Download `packages-Linux`, then `chmod +x`: the zip drops the exec bit.
   - Check it renders on Xvfb here, and on the desktop with `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
   - The logs show the removed library and the verified signature.
3. **Ubuntu 22.04:** it should still render there, because the host's own libwayland-client (1.20) is the one that
   was bundled. No 22.04 box; the risk is accepted (decided 2026-09-26).
4. **Release walks:**
   - **The next release:** an old AppImage, run with the full `LD_PRELOAD` workaround, updates to the fixed one.
     Then the fixed one launches without the `LD_PRELOAD`: on Xvfb as it is, and on this VM's desktop with only
     `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
   - **The release after:** the fixed AppImage updates in place without the `LD_PRELOAD`, under the same
     conditions. Then tick AC :761, if `.rpm`
     is dealt with, or say why not.

## Docs

- `open-items.md` §P, the AppImage row:
  - Mark it fixed on the branch, pending the release walks.
  - Replace the "not yet separated" bullet with Step 1's result, and the workaround bullet with the README note.
  - Fix the runner line: moving the runner doesn't fix it (and §E's 22.04 item: keep the repack).
- `README.md`: the Step 3 note.
- The AC walk record: a short addendum pointing here.
- `smoke-test-post-v1.md` AC :761 note: the cause is `-client`, plus the VM's DMA-BUF case.
- `.claude/skills/release/SKILL.md`: the Linux leg in the `workflow_dispatch` rule; entries for the new steps under
  "When it goes wrong".

## Not doing

- **The hook's forced `GDK_BACKEND=x11`:** native Wayland in the AppImage is the Tauri issue the hook cites (#8541).
- **Pre-seeding a newer upstream linuxdeploy** into the bundler's tool cache (`linuxdeploy.rs:233-237` downloads
  only when missing). The key isn't the reason: **Build the packages** already runs unpinned tools with it
  (`linuxdeploy.rs:226-254`). The reasons:
  - It swaps the whole deploy tool for a build the bundler's fixed arguments were never tested with, and Tauri once
    reverted a linuxdeploy update for a regression.
  - It changes much more than the one excluded library.
  - The repack is targeted, and its result is checked.
- **`LD_LIBRARY_PATH` / `LD_PRELOAD` in the hook:** `AppRun.wrapped` prepends `$APPDIR/usr/lib` after the hooks,
  and host library paths differ by distro.
- **Moving the release runner:** parked in §E until 2026-12-23. It wouldn't fix this anyway.
- **The `tauri-cli@2.11.4` pin vs `@tauri-apps/cli` 2.11.5 in `package-lock.json`:** unrelated drift (the pin's
  comment at `release.yml:151-154`). Noted separately.

## Triage (2026-09-27)

Skipped items and accepted limits from the review of the implementation, decided one by one:

| # | Item | Decision |
|---|---|---|
| D1 | Users on a 0.10.12-or-earlier AppImage get a blank window, so they can't update in-app | A permanent line in the release body's Linux section: download by hand; the README covers the DMA-BUF case |
| D2 | Commit, push and the `workflow_dispatch` run | After this triage |
| L1 | The runtime's `.digest_md5` goes stale after the repack | Recompute it: `appimage-digest.py` reproduces appimagetool's algorithm, quirks included, checks it on the original and rewrites it |
| L2 | No `--app-version` binding; CI pins `tauri-cli@2.11.4` while `package-lock.json` has 2.11.5 | Accepted; open-items row: align the pin, then add `--app-version` |
| L3 | 2.11.4's `signer sign` reading the key from env is unproven | The `workflow_dispatch` run proves it (the verify step fails red otherwise) |
| L4 | Only the AppImage's updater `.sig` is verified in CI | Accepted; open-items row: extend the check to Windows and macOS later |
| L5 | No test on an Ubuntu 22.04 host, or with the NVIDIA proprietary driver | Accepted, noted in open-items §P |
| L6 | The AppImage always runs under XWayland; affected GPUs need `WEBKIT_DISABLE_DMABUF_RENDERER=1` by hand | As decided: the README note |
| L7 | The verify step assumes the runner's `python3` is the system one, with `python3-cryptography` | The `workflow_dispatch` run proves it |
| L8 | The verify script tracebacks on malformed input (the step still fails) | Accepted |
| L9 | The repack normalises a few doc/schema file modes by the umask (777 → 755) | Accepted: the squashfs is read-only |
| L10 | The strip script's final `grep` could match a future unrelated path | Accepted: it fails safe |
| L11 | Pre-seeding a newer upstream linuxdeploy | Stays rejected (see Not doing) |
| L12 | Other bundled 22.04 libraries stay in | Kept: none misses a symbol the host's Mesa uses |
| L13 | Step 2.4's flag list lacked `-quiet -no-progress` | Fixed |
| L14 | `__pycache__/` not in `.gitignore` | Added |
| L15 | AC :761's `.rpm` was never walked | Ruled covered by the `.deb` walk: without `APPIMAGE` both take the Download… path (`update.rs:45-50`). Tick AC :761 once the AppImage release walks pass |
