// Keyboard / pointer modifier helpers shared by the multi-select lists.

/** Modifiers as the `multiSelect` / `lineSelection` models want them; ⌘ counts as Ctrl on macOS. */
export const mods = (e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => ({
  ctrl: e.ctrlKey || e.metaKey,
  shift: e.shiftKey,
});

/** Keys a focused folder row answers itself, in either file tree: none of them reach the list below. */
export const folderKey = (key: string, isCollapsed: boolean) => key === "Enter" || key === " " || (key === "ArrowLeft" && !isCollapsed) || (key === "ArrowRight" && isCollapsed);
