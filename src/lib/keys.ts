// Keyboard / pointer modifier helpers shared by the multi-select lists.

/** Modifiers as the `multiSelect` / `lineSelection` models want them; ⌘ counts as Ctrl on macOS. */
export const mods = (e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => ({
  ctrl: e.ctrlKey || e.metaKey,
  shift: e.shiftKey,
});
