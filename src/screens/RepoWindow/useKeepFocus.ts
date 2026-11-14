import { useLayoutEffect, useRef, type RefObject } from "react";

/** A focusable element as the rebuilt layout can find it again, by what it is rather than by node. */
interface Entry {
  tag: string;
  role: string | null;
  name: string;
}

interface Note {
  /** The focused element first, then each of its ancestors inside the root that has a `tabindex`. */
  entries: Entry[];
  selection: { start: number; end: number; direction?: "forward" | "backward" | "none" } | null;
}

/** The `aria-label`; for a form field without one, its `<label>`'s text; otherwise its own text. */
function nameOf(el: Element): string {
  const label = el.getAttribute("aria-label");
  if (label !== null) return label;
  const field = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
  if (field && el.labels && el.labels.length > 0) return Array.from(el.labels, (l) => l.textContent).join(" ");
  return el.textContent ?? "";
}

const entry = (el: Element): Entry => ({ tag: el.tagName, role: el.getAttribute("role"), name: nameOf(el) });

function take(root: HTMLElement | null): Note | null {
  const el = document.activeElement;
  if (!root || !el || !root.contains(el)) return null;
  const entries = [entry(el)];
  for (let a = el.parentElement; a && a !== root; a = a.parentElement) if (a.hasAttribute("tabindex")) entries.push(entry(a));
  // `null` on a field with no text to select, a checkbox.
  const selection =
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.selectionStart !== null && el.selectionEnd !== null
      ? { start: el.selectionStart, end: el.selectionEnd, direction: el.selectionDirection ?? undefined }
      : null;
  return { entries, selection };
}

function give({ entries, selection }: Note, root: HTMLElement) {
  // Only while the focus is still lost: an element that survived holds it, and so does a control of
  // the new layout that focused itself in its own layout effect, which ran before this one.
  const active = document.activeElement;
  if (active !== null && active !== document.body) return;
  for (let i = 0; i < entries.length; i++) {
    const { tag, role, name } = entries[i];
    // Tag and role first: the name reads text, and a tag alone can match every row of a list.
    const fits = Array.from(root.getElementsByTagName(tag)).filter((c) => c.getAttribute("role") === role && nameOf(c) === name);
    // Two that fit are no fit: either could be the wrong one, a same-named button on another row.
    if (fits.length !== 1) continue;
    const [twin] = fits;
    if (!(twin instanceof HTMLElement)) continue;
    twin.focus({ preventScroll: true });
    // Nor one that refuses the focus: disabled, hidden, inert, or a separator with no `tabindex`.
    if (document.activeElement !== twin) continue;
    // A field's twin by tag, role and name can be a checkbox, where `setSelectionRange` throws.
    if (i === 0 && selection && (twin instanceof HTMLInputElement || twin instanceof HTMLTextAreaElement) && twin.selectionStart !== null)
      twin.setSelectionRange(selection.start, selection.end, selection.direction);
    return;
  }
}

/**
 * Keeps the keyboard focus across a change of `key` (a pane's layout) that rebuilds the part of
 * `root` holding it: the same control takes it back in the new tree, or, when that control has no
 * single twin there (a file row's, whose list draws its rows only after it has measured itself),
 * the nearest focusable ancestor that has one, which is its list. Neither found, the focus stays
 * lost, as before. `root` must survive the rebuild.
 *
 * The note is taken while the new layout renders, when the old one's elements are still in the
 * page and no event would say the focus is about to go (Linux fires no `focusout` for a removed
 * element). Written only when `key` differs, so StrictMode's second render finds it taken already.
 */
export function useKeepFocus(key: string, root: RefObject<HTMLElement | null>) {
  const lastKey = useRef(key);
  const note = useRef<Note | null>(null);
  if (lastKey.current !== key) {
    lastKey.current = key;
    note.current = take(root.current);
  }
  useLayoutEffect(() => {
    const n = note.current;
    note.current = null;
    if (n && root.current) give(n, root.current);
  }, [key, root]);
}
