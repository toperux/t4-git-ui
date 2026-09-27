# Linux rendering on native Wayland — 2026-09-27

`docs/plans/open-items.md` §B's "Linux (WebKitGTK) rendering" entry. Until now it had been walked only under WSLg on
X11 (2026-09-05). This walk repeats it on a real Wayland session.

**Setup:**
- **Machine:** Ubuntu 26.04.1, GNOME on Wayland, in a VMware guest (SVGA II), scale 1.
- **Build:** a debug build of `e714b81`, WebKitGTK 2.52.6, git 2.53.0:
  `npm run tauri build -- --debug --no-bundle --config '{"identifier":"dev.topher.t4gitui.smoke"}'`.
- **Driving:** WebDriver (`tauri-driver`, `wd.mjs`) on the live session, with `GDK_BACKEND=wayland` and no Xvfb.
  The app process's environment had `GDK_BACKEND=wayland` and `WAYLAND_DISPLAY=wayland-0`, and GTK doesn't fall
  back to X when the backend is forced.
- **Isolation:** an isolated `HOME`, so the user's store was never opened (not checksummed this time).
  `layout.json` was seeded to open `/tmp/t4/work` (from `smoke-fixtures.sh`), since the native picker can't be driven
  on Wayland.
- **Screenshots:** from `wd.mjs shot` (the page only).
- **GTK's native menus:** they sit outside the page, so the user confirmed by eye the two that should show. The
  blocked cases rest on `defaultPrevented`.

## Results

| Check | Result |
|---|---|
| Fonts, dark theme: start screen and repo view (graph lanes and dots, sidebar, commit panel, diff, status bar) | **pass** |
| Light theme | **pass**. The body is `#bcbec2`, the designed `--bg-app` |
| Styled scrollbars | **pass**: thin thumb, darker on hover |
| Splitters: sidebar, details, commit details, side column, output dock | **pass**: all five resize (`aria-valuenow` changed). The dock's range and its collapse below the minimum (in the WSLg walk) weren't re-walked. The output dock needs output first: its expand button is disabled on "No output yet" |
| Native menu blocked on the toolbar, a panel header, the status bar and the bare diff body | **pass**: `contextmenu` `defaultPrevented`, so no native menu (inferred, not looked at by eye) |
| Text field (Search commits) | **pass**: not prevented, and the GTK menu showed (user) |
| Selected diff text | **pass**: not prevented with a selection, and the GTK menu showed (user). Blocked when nothing is selected |
| App context menu on a commit row | **pass**: 16 items, rendered correctly, and the native menu blocked (`defaultPrevented`) |

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

## Addendum: the dock's range and collapse (2026-09-27)

The one part of the WSLg list not re-walked above. **Walked under automation on Xvfb, not on Wayland:** a WebDriver
drag is made up inside WebKit and never goes through the compositor, so the live session would test nothing more.
Real Wayland pointer input on the splitter is unwalked.

- **Build:** a debug build of `1f5fb67`, under WebDriver on Xvfb (`smoke-linux.md` §2), with `/tmp/t4/work` open.
- **Measured:** the height of the element after `[aria-label="Resize output"]` (the dock panel), after a Fetch gave
  the dock output. The limits are `RepoWindow.tsx:45-48`.

| Drag | Height | Result |
|---|---|---|
| Expand (the header's button) | 200 | **pass**: the default |
| Up 400 px | 320 | **pass**: stops at the maximum |
| Release at about 120 px | 160 | **pass**: above the ~94 px midpoint, it clamps to the minimum |
| Release at about 60 px | 28 | **pass**: below the midpoint, it collapses to the bar; the separator reads `aria-disabled="true"` |
