/**
 * Whether the webview's own context menu should be left alone for this right-click.
 *
 * That menu is browser chrome (Reload, Save as, Print) and has no place in an app window, but it is
 * still the only mouse route to the clipboard in two spots: editable fields (paste a clone URL) and
 * `.selectable` text the user has actually selected (copy a diff line, output-dock text). Everywhere
 * else it is suppressed; the app's own menus call `preventDefault` themselves.
 */
export function keepsNativeMenu(target: EventTarget | null, hasSelection: boolean): boolean {
  const el = target as HTMLElement | null;
  if (typeof el?.closest !== "function") return false;
  if (el.closest("input, textarea, [contenteditable='true']")) return true;
  return hasSelection && !!el.closest(".selectable");
}
