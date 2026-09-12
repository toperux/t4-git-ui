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
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  // A key whose value is `undefined` is not in the string `JSON.stringify` builds, so it is not a
  // difference here either: counting it would cost a reload nobody can see the reason for.
  const defined = (o: Record<string, unknown>) => Object.keys(o).filter((k) => o[k] !== undefined);
  const keys = defined(ra);
  if (keys.length !== defined(rb).length) return false;
  return keys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && eqDeep(ra[k], rb[k]));
}
