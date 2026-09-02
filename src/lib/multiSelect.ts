// Pure multi-select model for ordered lists of string ids (file paths).
// `anchor` is the last plainly clicked / focused item; Shift ranges extend from it.
// `items` is every id in display order — the selection keeps that order, and Ctrl+A takes all of them.
// A tree shows only some of them (a collapsed folder hides its files): pass those as `visible` —
// Shift ranges and the ↑/↓ walk follow the screen, while a hidden file that is selected stays selected.

export interface Selection {
  selected: string[];
  anchor: string | null;
}

export interface Mods {
  ctrl?: boolean;
  shift?: boolean;
}

export const EMPTY_SELECTION: Selection = { selected: [], anchor: null };

/** Items between `a` and `b` (inclusive) in `items` order. */
function range(items: string[], a: string, b: string): string[] {
  const i = items.indexOf(a);
  const j = items.indexOf(b);
  if (i < 0 || j < 0) return [b];
  return items.slice(Math.min(i, j), Math.max(i, j) + 1);
}

/** Keeps `items` order and drops duplicates. */
function ordered(items: string[], sel: Iterable<string>): string[] {
  const set = new Set(sel);
  return items.filter((p) => set.has(p));
}

/**
 * Click: plain = select only `item`; Ctrl = toggle `item`; Shift = range anchor…item over `visible`
 * (replacing the selection, or added to it with Ctrl+Shift). The anchor moves on plain / Ctrl clicks —
 * and on a Shift click whose anchor is hidden, which is then a plain click.
 */
export function clickSelect(items: string[], sel: Selection, item: string, mods: Mods = {}, visible: string[] = items): Selection {
  if (mods.shift && sel.anchor !== null && visible.includes(sel.anchor)) {
    const r = range(visible, sel.anchor, item);
    return { selected: ordered(items, mods.ctrl ? [...sel.selected, ...r] : r), anchor: sel.anchor };
  }
  if (mods.ctrl) {
    const has = sel.selected.includes(item);
    return { selected: has ? sel.selected.filter((p) => p !== item) : ordered(items, [...sel.selected, item]), anchor: item };
  }
  return { selected: [item], anchor: item };
}

/**
 * ↑ / ↓ (`delta` ±1) or Home / End (`delta` ±Infinity): single selection relative to the anchor, over the
 * `visible` items. An anchor hidden in a collapsed folder sits at `hiddenAt` — the number of visible
 * items above that folder's row — so ↓ lands right after the folder and ↑ right before it (nothing
 * there = the selection stays). `hiddenAt` −1 (or a missing anchor) = ↓ from the top / ↑ from the bottom.
 */
export function moveSelect(visible: string[], sel: Selection, delta: number, hiddenAt = -1): Selection {
  if (visible.length === 0) return EMPTY_SELECTION;
  const last = visible.length - 1;
  const cur = sel.anchor === null ? -1 : visible.indexOf(sel.anchor);
  let next: number;
  if (!Number.isFinite(delta)) next = delta < 0 ? 0 : last;
  else if (cur >= 0) next = Math.min(Math.max(cur + delta, 0), last);
  else if (hiddenAt >= 0 && sel.anchor !== null) {
    next = hiddenAt + delta - (delta > 0 ? 1 : 0);
    if (next < 0 || next > last) return { selected: [sel.anchor], anchor: sel.anchor };
  } else next = delta < 0 ? last : 0;
  const item = visible[next];
  return { selected: [item], anchor: item };
}

/** Every item, hidden ones included. */
export function selectAll(items: string[], sel: Selection): Selection {
  return { selected: items.slice(), anchor: sel.anchor && items.includes(sel.anchor) ? sel.anchor : (items[0] ?? null) };
}

/** Drops ids no longer in `items`. */
export function pruneSelection(items: string[], sel: Selection): Selection {
  return { selected: ordered(items, sel.selected), anchor: sel.anchor && items.includes(sel.anchor) ? sel.anchor : null };
}
