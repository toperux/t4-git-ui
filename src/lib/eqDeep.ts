/**
 * Exact structural equality for the plain JSON values the IPC hands back — objects, arrays,
 * primitives, null. The same answer comparing two `JSON.stringify` results gives (key order aside),
 * without building the strings: these run on every `repo://changed` over a whole status or diff.
 */
export function eqDeep(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => eqDeep(v, b[i]));
  }
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  const rb = b as Record<string, unknown>;
  return keys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && eqDeep((a as Record<string, unknown>)[k], rb[k]));
}
