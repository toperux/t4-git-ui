// Pure multi-select model for ordered lists of string ids (file paths).
// `anchor` is the last plainly clicked / focused item; Shift ranges extend from it.

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
 * Click: plain = select only `item`; Ctrl = toggle `item`; Shift = range anchor…item
 * (replacing the selection, or added to it with Ctrl+Shift). The anchor moves on plain / Ctrl clicks.
 */
export function clickSelect(items: string[], sel: Selection, item: string, mods: Mods = {}): Selection {
  if (mods.shift && sel.anchor !== null && items.includes(sel.anchor)) {
    const r = range(items, sel.anchor, item);
    return { selected: ordered(items, mods.ctrl ? [...sel.selected, ...r] : r), anchor: sel.anchor };
  }
  if (mods.ctrl) {
    const has = sel.selected.includes(item);
    return { selected: has ? sel.selected.filter((p) => p !== item) : ordered(items, [...sel.selected, item]), anchor: item };
  }
  return { selected: [item], anchor: item };
}

/** ↑ / ↓ (`delta` ±1) or Home / End (`delta` ±Infinity): single selection relative to the anchor. */
export function moveSelect(items: string[], sel: Selection, delta: number): Selection {
  if (items.length === 0) return EMPTY_SELECTION;
  const cur = sel.anchor === null ? -1 : items.indexOf(sel.anchor);
  let next: number;
  if (!Number.isFinite(delta)) next = delta < 0 ? 0 : items.length - 1;
  else next = cur < 0 ? (delta < 0 ? items.length - 1 : 0) : Math.min(Math.max(cur + delta, 0), items.length - 1);
  const item = items[next];
  return { selected: [item], anchor: item };
}

export function selectAll(items: string[], sel: Selection): Selection {
  return { selected: items.slice(), anchor: sel.anchor && items.includes(sel.anchor) ? sel.anchor : (items[0] ?? null) };
}

/** Drops ids no longer in `items`. */
export function pruneSelection(items: string[], sel: Selection): Selection {
  return { selected: ordered(items, sel.selected), anchor: sel.anchor && items.includes(sel.anchor) ? sel.anchor : null };
}
