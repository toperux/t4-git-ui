// Marks keyboard focus with `data-kbd`, which the CSS styles beside `:focus-visible`. WebKitGTK does not
// count the last input being a key when it decides whether a script focus is `:focus-visible`: after a
// click, a key that moves focus by script (an arrow in a tree, Escape back to an opener) shows no ring,
// and even after keys a menu opened from a ringed grid gets none.

/**
 * Whether the last input was a key rather than the pointer. Set in the capture phase, so it is
 * already current when a handler for that same input moves focus. A modifier alone is not a key
 * here: Alt+Tab back into the window would otherwise mark a mouse-focused element.
 */
let keyInput = false;
const MODIFIERS = new Set([
  "Alt", "AltGraph", "CapsLock", "Control", "Fn", "FnLock", "Hyper", "Meta", "NumLock", "OS", "ScrollLock", "Shift",
  "Super", "Symbol", "SymbolLock",
]);
document.addEventListener("keydown", (e) => {
  if (!MODIFIERS.has(e.key)) keyInput = true;
}, true);
document.addEventListener("pointerdown", () => (keyInput = false), true);

/** Every focus is marked when the last input was a key, and unmarked otherwise. */
document.addEventListener(
  "focusin",
  (e) => e.target instanceof Element && e.target.toggleAttribute("data-kbd", keyInput),
  true,
);

export const lastInputWasKey = () => keyInput;
