# Linux rendering on native Wayland — 2026-09-27

`docs/plans/open-items.md` §B's "Linux (WebKitGTK) rendering" entry. Until now it had been walked only under WSLg on
X11 (2026-09-05). This walk repeats it on a real Wayland session.

**Setup:**
- **Machine:** Ubuntu 26.04.1, GNOME on Wayland, in a VMware guest (SVGA II), scale 1.
- **Build:** a debug build of `e714b81` (identifier `dev.topher.t4gitui.smoke`), WebKitGTK 2.52.6.
- **Driving:** WebDriver (`tauri-driver`, `wd.mjs`) on the live session, with `GDK_BACKEND=wayland` and no Xvfb.
  The process environment confirmed `GDK_BACKEND=wayland`, `WAYLAND_DISPLAY=wayland-0`.
- **Isolation:** an isolated `HOME`. `layout.json` was seeded to open `/tmp/t4/work` (from `smoke-fixtures.sh`),
  since the native picker can't be driven on Wayland.
- **Screenshots:** from `wd.mjs shot` (the page only).
- **GTK's native menus:** they sit outside the page, so the user confirmed those by eye.

## Results

| Check | Result |
|---|---|
| Fonts, dark theme: start screen and repo view (graph lanes and dots, sidebar, commit panel, diff, status bar) | **pass** |
| Light theme | **pass**. The body is `#bcbec2`, the designed `--bg-app` |
| Styled scrollbars | **pass**: thin thumb, darker on hover |
| Splitters: sidebar, details, commit details, side column, output dock | **pass**: all five resize (`aria-valuenow` changed). The output dock needs output first: its expand button is disabled on "No output yet" |
| Native menu blocked on the toolbar, a panel header, the status bar and the bare diff body | **pass**: `contextmenu` `defaultPrevented`, and no menu |
| Text field (Search commits) | **pass**: not prevented, and the GTK menu showed (user) |
| Selected diff text | **pass**: not prevented with a selection, and the GTK menu showed (user). Blocked when nothing is selected |
| App context menu on a commit row | **pass**: 16 items, rendered correctly, and the native menu blocked |

**Not covered:** real GPU hardware (Mesa on Intel/AMD, NVIDIA), and a HiDPI panel. A VM exercises the Wayland
compositor and the system WebKitGTK, not a real GPU's drivers. Accepted until a user reports a GPU-specific bug.

## Harness notes

- **WebDriver works on live Wayland.** Run `tauri-driver` with `GDK_BACKEND=wayland` and no `DISPLAY` override. The
  window appears on the user's desktop.
- **What still needs the user's eyes:** GTK's native popups aren't in `wd.mjs shot`. If a click lands while one is
  open, it closes the popup instead, so wait for the user to close it first.
- **A fast `drag` selects no text;** a double-click selects a word.
- **Re-read coordinates before each pointer action.** One drag moved a later splitter, and a window focus change
  shifted the layout, which put a double-click on a commit row instead of the diff. It had no effect: the row was
  selected, and the reflog was unchanged.
