/** The listed keys of `obj` as a new object — how each store takes its per-tab snapshot. */
export function pick<T, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = obj[k];
  return out;
}
