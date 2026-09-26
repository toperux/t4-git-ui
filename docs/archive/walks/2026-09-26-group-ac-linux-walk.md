# Group AC :761 on Linux — 2026-09-26

`docs/smoke/smoke-test-post-v1.md` group AC, the "deb / rpm" row. The row expects a `.deb` install to show
**Download…** (the releases page, no install), and the AppImage to install in place like Windows. Walked by hand on
Ubuntu 26.04.1 (GNOME on Wayland, VMware SVGA II), using the published **v0.10.11** packages. They were offered the
published **v0.10.12**, so they are signed and no local build was needed. Checklist: the session's `~/t4-ac-walk.md`,
with sha256 checks of both downloads first.

## Results

| Part | Result |
|---|---|
| `.deb` | **pass**, every step. The 0.5.0 `.deb` was upgraded to 0.10.11 with `apt install ./…deb`. The Update badge showed; Settings → Updates read **Download…**; it opened the GitHub releases page; `dpkg -l` still said 0.10.11 afterwards |
| AppImage, as shipped | **fail**: a blank window (finding 1) |
| AppImage, with the workaround | **pass**. 0.10.11 showed **Update to 0.10.12…**, and the progress bar ran. The app restarted itself on 0.10.12, the file was replaced in place (new size and time), and a relaunch still said 0.10.12 |
| `.rpm` | **not walked**, by choice. It can't be installed normally on Ubuntu. The code gives it the `.deb` path (anything without `APPIMAGE`, `update.rs:45-50`), but that wasn't counted as a walk |

The row stays unticked: `.rpm` wasn't walked, and the AppImage works only with the workaround, not as shipped.

## Findings

1. **The AppImage opens a blank window on Ubuntu 26.04.** Both 0.10.11 and 0.10.12 are affected: the updated file
   was still blank without the workaround.
   - **Symptom:** WebKit's web process aborts with `Could not create default EGL display: EGL_BAD_PARAMETER`.
   - **Scope:** the same on the Wayland desktop and on a headless Xvfb display in software. It isn't this VM's GPU.
   - **Cause:** the AppImage is built on `ubuntu-22.04` and bundles its `libwayland-*`, which shadow the host's and
     break the host's Mesa EGL. On X11, removing them from the extracted AppImage, or preloading the host's
     `libwayland-client` / `-egl`, makes it render.
   - **On native Wayland it rendered only with** all four host `libwayland-*` preloaded **plus**
     `WEBKIT_DISABLE_DMABUF_RENDERER=1`:

     ```bash
     P=/usr/lib/x86_64-linux-gnu
     PRE=$P/libwayland-client.so.0:$P/libwayland-egl.so.1:$P/libwayland-cursor.so.0:$P/libwayland-server.so.0
     LD_PRELOAD=$PRE WEBKIT_DISABLE_DMABUF_RENDERER=1 ./T4-Git-UI_0.10.11_x86_64.AppImage
     ```

     The two preloaded libraries alone, and XWayland, stayed blank, although the page ran (the title changed).
   - **Carried through the update:** the in-app restart kept the environment, so the restarted 0.10.12 rendered.
   - **Tracked in** `docs/plans/open-items.md` §P, with the fix direction.
