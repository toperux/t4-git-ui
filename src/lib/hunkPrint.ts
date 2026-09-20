import type { DiffLineKind, Hunk } from "../api/types";

const SIGN: Record<DiffLineKind, string> = { context: " ", add: "+", del: "-" };
const utf8 = new TextEncoder();

/**
 * A fingerprint of a hunk as it was rendered: FNV-1a (32-bit) over the header and each line's sign,
 * text and no-newline flag. The same function as `patch::hunk_print` in git-core, which prints the
 * hunk of the diff it rebuilds and refuses the action when the two differ — a file rewritten between
 * the render and the click would otherwise have other lines staged or discarded. One vector pinned in
 * both test suites keeps the two in step.
 */
export function hunkPrint(hunk: Hunk): string {
  let h = 0x811c9dc5;
  const eat = (s: string) => {
    for (const b of utf8.encode(s)) {
      h ^= b;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  eat(`${hunk.header}\n`);
  for (const l of hunk.lines) eat(`${SIGN[l.kind]}${l.text}${l.noNewline ? "\\" : ""}\n`);
  return h.toString(16).padStart(8, "0");
}
